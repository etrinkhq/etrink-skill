// MCP → etrink Master API istemcisi. AI istemci adına HTTPS + Bearer (müşteri API anahtarı)
// ile /mcp/* uçlarına bağlanır. ETRINK_API_BASE + ETRINK_API_KEY env'den gelir.
// (bridge/apiClient.ts deseninin aynısı — sadece node-token yerine müşteri API anahtarı.)
// Env çağrı anında okunur: ESM'de bu modül index.ts'teki dotenv config()'inden ÖNCE yüklenir.
export async function call(method: string, path: string, body?: unknown): Promise<any> {
  const BASE = (process.env.ETRINK_API_BASE ?? "https://api.etrink.com").replace(/\/+$/, "");
  const KEY = process.env.ETRINK_API_KEY ?? "";
  if (!KEY) throw new Error("ETRINK_API_KEY boş — panelden 'API Anahtarı' oluşturup .env'ye ekleyin.");
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    let msg = data?.error ? String(data.error) : `${res.status} ${text.slice(0, 200)}`;
    if (Array.isArray(data?.details)) msg += "\n" + data.details.join("\n");
    // MT5 araçları "trading" yetkisi ister; yalnız servis yetkili anahtar 401 alır
    if (res.status === 401 && !path.startsWith("/mcp/services")) msg += " (anahtarın MT5 'trading' yetkisi olmayabilir — panelde yetkileri kontrol et)";
    throw new Error(`${method} ${path} → ${res.status}: ${msg}`);
  }
  return data;
}

// Zip yükleme (servis deploy) — multipart, alan adı "file"
export async function upload(path: string, zip: Buffer, filename: string): Promise<any> {
  const BASE = (process.env.ETRINK_API_BASE ?? "https://api.etrink.com").replace(/\/+$/, "");
  const KEY = process.env.ETRINK_API_KEY ?? "";
  if (!KEY) throw new Error("ETRINK_API_KEY boş — panelden 'API Anahtarı' oluşturup .env'ye ekleyin.");
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array(zip)], { type: "application/zip" }), filename);
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers: { authorization: `Bearer ${KEY}` }, body: fd });
  const text = await res.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const det = Array.isArray(data?.details) ? `\n${data.details.join("\n")}` : "";
    throw new Error(`POST ${path} → ${res.status}: ${data?.error ?? text.slice(0, 200)}${det}`);
  }
  return data;
}

export const api = {
  listAccounts: () => call("GET", "/mcp/accounts"),
  getPositions: (accountId: string) => call("GET", `/mcp/accounts/${accountId}/positions`),
  placeOrder: (o: { accountId: string; action: "buy" | "sell" | "close"; symbol: string; volume?: number; sl?: number; tp?: number; id?: string; test?: boolean; magic?: number; closeOpposite?: boolean; comment?: string; allowDuplicate?: boolean }) =>
    call("POST", "/mcp/orders", o),
  openAccount: (o: Record<string, unknown>) => call("POST", "/mcp/accounts", o),
  getRecentSignals: (q: Record<string, string | number | undefined> = {}) => call("GET", `/mcp/signals${qs(q)}`),
  reportSummary: (q: Record<string, string | number | undefined>) => call("GET", `/mcp/report/summary${qs(q)}`),
  reportTrades: (q: Record<string, string | number | undefined>) => call("GET", `/mcp/report/trades${qs(q)}`),
  reportOpen: (q: Record<string, string | number | undefined>) => call("GET", `/mcp/report/open${qs(q)}`),
};

// Tanımsız alanları atlayan query string
function qs(q: Record<string, string | number | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}
