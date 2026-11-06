// etrink MCP sunucusu — AI istemcileri (Claude Desktop, Claude Code, Cursor) etrink'i sürer:
// MT5 (hesap, pozisyon, emir, rapor, sinyal) + servis barındırma (Python/Node.js/binary deploy, log, env, exec).
// stdio transport üzerinden çalışır; her araç etrink API'yi (HTTPS + müşteri API anahtarı) çağırır.
// Çalıştırma: repo içinde tsx; müşteriye tek dosya: `pnpm --filter @etrink/mcp bundle` → portal /downloads/etrink-mcp.mjs
import { config } from "dotenv";
// ETRINK_ENV_FILE ile anahtar ayrı bir .env'den okunabilir (MCP config'ine ham anahtar yazmadan).
// Paketlenmiş sürüm (ETRINK_BUNDLE) varsayılan yoldan .env okumaz — müşterinin başka bir projesinin .env'si yüklenmesin.
const envFile = process.env.ETRINK_ENV_FILE ?? (process.env.ETRINK_BUNDLE ? undefined : "../../.env");
if (envFile) config({ path: envFile });

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { api, call, upload } from "./apiClient.js";
import { registerServiceTools } from "./services-tools.js";

const server = new McpServer({ name: "etrink", version: "0.3.0" });

// Aracın çıktısını MCP text içeriğine sarıp hataları güvenli döndüren yardımcı.
function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function fail(e: unknown) {
  return { isError: true, content: [{ type: "text" as const, text: `Hata: ${e instanceof Error ? e.message : String(e)}` }] };
}

// 1) list_accounts — müşterinin MT5 hesapları
server.tool(
  "list_accounts",
  "Müşterinin etrink'teki MT5 hesaplarını listeler (id, label, broker, login, durum, bakiye, equity).",
  {},
  async () => {
    try { return ok(await api.listAccounts()); } catch (e) { return fail(e); }
  },
);

// 2) get_positions — bir hesabın açık pozisyonları
server.tool(
  "get_positions",
  "Belirli bir MT5 hesabının açık pozisyonlarını ve son bakiye/equity değerini döner. accountId list_accounts'tan alınır.",
  { accountId: z.string().uuid().describe("MT5 hesap id (list_accounts'tan)") },
  async ({ accountId }) => {
    try { return ok(await api.getPositions(accountId)); } catch (e) { return fail(e); }
  },
);

// 3) place_order — buy/sell/close. Sunucu tarafı webhook ile AYNI güvenlik guard'larını uygular
//    (üyelik, plan izni, volume tavanı, sembol allow-list, idempotency, durmuş instance'ı otomatik başlatma).
server.tool(
  "place_order",
  "Bir MT5 hesabında emir gönderir: buy/sell (volume gerekli) veya close. Sunucu güvenlik limitlerini " +
    "(volume tavanı, izinli semboller, üyelik/plan) uygular. test=true ise doğrulama yapılır ama GERÇEK EMİR gönderilmez.",
  {
    accountId: z.string().uuid().describe("Hedef MT5 hesap id"),
    action: z.enum(["buy", "sell", "close"]).describe("Emir tipi"),
    symbol: z.string().min(1).describe("Sembol, ör. EURUSD / XAUUSD"),
    volume: z.number().positive().optional().describe("Lot (buy/sell için gerekli)"),
    sl: z.number().optional().describe("Stop-loss fiyatı (opsiyonel)"),
    tp: z.number().optional().describe("Take-profit fiyatı (opsiyonel)"),
    id: z.string().max(120).optional().describe("İdempotensi anahtarı (aynı id tekrar gönderilirse yeniden işlenmez)"),
    test: z.boolean().optional().describe("true → sadece doğrula, gerçek emir gönderme"),
    magic: z.number().int().min(0).optional().describe("MT5 magic number (strateji ayırımı); close'ta verilirse yalnız o magic'li pozisyonlar kapanır"),
    closeOpposite: z.boolean().optional().describe("true → buy/sell öncesi aynı sembolün ters yöndeki pozisyonlarını kapat (reverse)"),
    comment: z.string().max(100).optional().describe("Açılan emrin MT5 yorumu (en fazla 31 karakter kullanılır)"),
    allowDuplicate: z.boolean().optional().describe("false → aynı sembolde aynı yönde (magic verildiyse aynı magic'li) açık pozisyon varsa yeni emir açma"),
  },
  async (args) => {
    try { return ok(await api.placeOrder(args)); } catch (e) { return fail(e); }
  },
);

// 4) open_account — yeni MT5 hesabı (ve varsayılan olarak instance) oluşturur
server.tool(
  "open_account",
  "Yeni bir MT5 hesabı oluşturur (varsayılan: manuel login, demo) ve isteğe bağlı olarak instance başlatır. " +
    "Auto login için login+password+mt5Server gerekir. region opsiyonel (en yakın sunucu seçimi).",
  {
    brokerName: z.string().min(1).describe("Broker adı"),
    label: z.string().optional().describe("Dostça ad (ör. 'Test Hesabı')"),
    mt5Server: z.string().optional().describe("MT5 server adı (auto login için gerekli)"),
    login: z.number().int().positive().optional().describe("MT5 hesap no (auto login için gerekli)"),
    password: z.string().optional().describe("MT5 şifresi (auto login için gerekli; şifreli saklanır)"),
    loginMode: z.enum(["auto", "manual"]).optional().describe("auto=otomatik login, manual=VNC'den kullanıcı girer (varsayılan)"),
    accountType: z.enum(["demo", "live"]).optional().describe("Hesap tipi (varsayılan demo)"),
    region: z.string().optional().describe("Hedef bölge (opsiyonel)"),
    startInstance: z.boolean().optional().describe("Hesap açılınca instance da başlat (varsayılan true)"),
  },
  async (args) => {
    try { return ok(await api.openAccount(args)); } catch (e) { return fail(e); }
  },
);

// Sinyal olayına kayma ve gecikme ekler:
//   signalPx = comment'teki "@fiyat" (TradingView/EA sinyal fiyatı), fillPx = result.error "done at X",
//   slip = (fill − sinyal) × yön (buy +1, sell −1; aleyhe pozitif), latencySec = alındı − payload.id (ISO ise).
//   Not: TradingView'de payload.id emrin VERİLDİĞİ bar kapanışında üretilir; bar içi stop emirlerinde latencySec
//   fiyatın seviyeye gelmesini bekleme süresini de içerir (saf iletim gecikmesi değildir).
function enrichSignal(s: any) {
  const p = s.payload ?? {};
  const sig = Number(String(p.comment ?? "").match(/@([\d.]+)/)?.[1]);
  const fill = Number(String(s.result?.error ?? "").match(/done at ([\d.]+)/)?.[1]);
  const side = p.action === "buy" ? 1 : p.action === "sell" ? -1 : 0;
  const sent = Date.parse(String(p.id ?? ""));
  const recv = Date.parse(String(s.createdAt ?? ""));
  return {
    ...s,
    signalPx: Number.isFinite(sig) ? sig : null,
    fillPx: Number.isFinite(fill) ? fill : null,
    slip: Number.isFinite(sig) && Number.isFinite(fill) && side ? +((fill - sig) * side).toFixed(3) : null,
    latencySec: Number.isFinite(sent) && Number.isFinite(recv) ? Math.round((recv - sent) / 1000) : null,
  };
}

// 5) get_recent_signals — son webhook/emir olayları (filtre + kayma/gecikme)
server.tool(
  "get_recent_signals",
  "Müşterinin son sinyal/emir olaylarını (webhook + MCP) döner: tarih, durum (pending/done/rejected/failed/test), payload, " +
    "hedef hesap; ayrıca sinyal fiyatı, dolum fiyatı, kayma (aleyhe +) ve iletim gecikmesi (sn). magic/hesap/durum/tarih ile süzülebilir.",
  {
    limit: z.number().int().min(1).max(100).optional().describe("Kayıt sayısı (varsayılan 30)"),
    magic: z.number().int().min(0).optional().describe("Yalnız bu magic'li sinyaller"),
    accountId: z.string().uuid().optional().describe("Yalnız bu hesaba giden sinyaller"),
    status: z.enum(["pending", "done", "rejected", "failed", "test"]).optional().describe("Durum filtresi"),
    since: z.string().datetime({ offset: true }).optional().describe("Bu zamandan sonrası (ISO)"),
    before: z.string().datetime({ offset: true }).optional().describe("Bu zamandan öncesi (ISO, sayfalama)"),
  },
  async (q) => {
    try {
      const r = await api.getRecentSignals(q);
      return ok({ signals: (r.signals ?? []).map(enrichSignal) });
    } catch (e) { return fail(e); }
  },
);

// Panel "Rapor" sayfasıyla aynı filtreler
const reportFilter = {
  from: z.string().datetime({ offset: true }).optional().describe("Kapanış zamanı başlangıç (ISO)"),
  to: z.string().datetime({ offset: true }).optional().describe("Kapanış zamanı bitiş (ISO)"),
  magic: z.string().regex(/^(none|\d{1,18})$/).optional().describe("Magic numarası ya da 'none' (magic'siz)"),
  accountId: z.string().uuid().optional().describe("Hesap id (list_accounts)"),
  symbol: z.string().optional().describe("Sembol öneki, ör. XAUUSD (XAUUSDm, XAUUSDc eşleşir)"),
};

// 6) get_report — kapanan işlemlerin özeti: toplam, magic bazında kırılım, günlük net
server.tool(
  "get_report",
  "Kapanan işlemlerin özeti (panel Rapor sayfası): toplam işlem/kazanan/kaybeden/brüt kâr-zarar/net, magic bazında " +
    "kırılım ve günlük net. Net = kâr + swap + komisyon (hesap para biriminde; cent hesapta USC).",
  { ...reportFilter, tz: z.string().optional().describe("Günlük kırılım için IANA saat dilimi (varsayılan UTC)") },
  async (q) => {
    try { return ok(await api.reportSummary(q)); } catch (e) { return fail(e); }
  },
);

// 7) get_trades — kapanan işlem listesi (imleçli sayfalama)
server.tool(
  "get_trades",
  "Kapanan işlemleri listeler (en yeni önce): ticket, sembol, yön, lot, açılış/kapanış fiyatı ve zamanı, kâr, swap, " +
    "komisyon, net, magic, yorum, hesap. Devamı için dönen nextCursor'ı cursor olarak verin.",
  {
    ...reportFilter,
    limit: z.number().int().min(1).max(100).optional().describe("Sayfa boyu (varsayılan 50)"),
    cursor: z.string().optional().describe("Önceki yanıtın nextCursor değeri"),
  },
  async (q) => {
    try { return ok(await api.reportTrades(q)); } catch (e) { return fail(e); }
  },
);

// 8) get_open_positions — tüm hesapların açık pozisyonları (son snapshot)
server.tool(
  "get_open_positions",
  "Tüm (ya da seçilen) hesapların açık pozisyonlarını ve bakiye/equity'sini son snapshot'tan döner; magic/sembol ile süzülebilir.",
  {
    accountId: reportFilter.accountId,
    magic: reportFilter.magic,
    symbol: reportFilter.symbol,
  },
  async (q) => {
    try { return ok(await api.reportOpen(q)); } catch (e) { return fail(e); }
  },
);

// 9+) Servis barındırma (Python / Node.js / binary) — API anahtarında "services" yetkisi gerekir
registerServiceTools(server, { call, upload });

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[etrink-mcp] stdio transport bağlı — araçlar hazır.");
