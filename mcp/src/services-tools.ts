// etrink servis barındırma araçları — yapay zekâ ajanı (Claude Code, Cursor, Claude Desktop) kodu yazar,
// bu araçlarla etrink'e kurar ve döngüyü kendisi kapatır: deploy → derleme logu → düzelt → tekrar deploy → loglar.
// deploy_service yerel klasörü KENDİSİ zipler (MCP kullanıcının makinesinde çalışır): .gitignore'a uyar,
// node_modules / .venv / .git / .env* gibi gereksiz ya da gizli dosyaları hiç göndermez.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, basename, resolve } from "node:path";
import { deflateRawSync } from "node:zlib";
import { z } from "zod";

type Api = {
  call: (method: string, path: string, body?: unknown) => Promise<any>;
  upload: (path: string, zip: Buffer, filename: string) => Promise<any>;
};

const MAX_ZIP = 25 * 1024 * 1024;
const MAX_FILES = 5000;
// Her zaman hariç (gizli değerler, bağımlılıklar, derleme çıktıları, IDE)
const ALWAYS_SKIP = [/^\.git\//, /(^|\/)node_modules\//, /(^|\/)\.venv\//, /(^|\/)venv\//, /(^|\/)__pycache__\//, /\.pyc$/,
  /(^|\/)\.env($|\.)/, /(^|\/)\.DS_Store$/, /(^|\/)\.idea\//, /(^|\/)\.vscode\//, /(^|\/)target\//, /(^|\/)\.mypy_cache\//,
  /(^|\/)\.pytest_cache\//, /(^|\/)\.next\/cache\//];

// Basit .gitignore: yorum, boş satır, "!" (yok sayılır), "/" ile kökten, "/" ile biten klasör, * ? ** joker
export function gitignoreRules(txt: string): RegExp[] {
  const out: RegExp[] = [];
  for (let line of txt.split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith("#") || line.startsWith("!")) continue;
    const anchored = line.startsWith("/") || line.slice(0, -1).includes("/");
    const dir = line.endsWith("/");
    const pat = line.replace(/^\//, "").replace(/\/$/, "");
    const rx = pat.split("**").map((p) => p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]")).join(".*");
    out.push(new RegExp(`${anchored ? "^" : "(^|/)"}${rx}${dir ? "/" : "($|/)"}`));
  }
  return out;
}

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function writeZip(files: { path: string; data: Buffer; mode: number }[]): Buffer {
  const locals: Buffer[] = [], centrals: Buffer[] = []; let off = 0;
  for (const f of files) {
    const comp = deflateRawSync(f.data), name = Buffer.from(f.path, "utf8"), crc = crc32(f.data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x800, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(f.data.length, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE((3 << 8) | 20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x800, 8); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(f.data.length, 24); ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(((f.mode | 0o100000) << 16) >>> 0, 38); ch.writeUInt32LE(off, 42);
    locals.push(lh, name, comp); centrals.push(ch, name); off += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}

// Klasör (ya da tek dosya, ör. derlenmiş Rust/Go programı) → zip
export function packPath(p: string): { zip: Buffer; files: string[]; skipped: number } {
  const root = resolve(p);
  const st = statSync(root);
  if (st.isFile()) {
    return { zip: writeZip([{ path: basename(root), data: readFileSync(root), mode: 0o755 }]), files: [basename(root)], skipped: 0 };
  }
  let ignore: RegExp[] = [];
  try { ignore = gitignoreRules(readFileSync(join(root, ".gitignore"), "utf8")); } catch { /* yok */ }
  const files: { path: string; data: Buffer; mode: number }[] = [];
  let skipped = 0, total = 0;
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, e.name);
      const rel = relative(root, abs).split("\\").join("/") + (e.isDirectory() ? "/" : "");
      if (e.isSymbolicLink() || ALWAYS_SKIP.some((r) => r.test(rel)) || ignore.some((r) => r.test(rel))) { skipped++; continue; }
      if (e.isDirectory()) { walk(abs); continue; }
      if (!e.isFile()) continue;
      const s = statSync(abs);
      total += s.size;
      if (files.length >= MAX_FILES) throw new Error(`Klasörde ${MAX_FILES}'den fazla dosya var — doğru klasörü verdiğinden emin ol ya da .gitignore ekle.`);
      if (total > 150 * 1024 * 1024) throw new Error("Klasör 150 MB'ı aşıyor — büyük veri dosyalarını .gitignore'a ekle.");
      files.push({ path: rel, data: readFileSync(abs), mode: (s.mode & 0o777) || 0o644 });
    }
  };
  walk(root);
  if (!files.length) throw new Error("Klasörde gönderilecek dosya yok.");
  const zip = writeZip(files);
  if (zip.length > MAX_ZIP) throw new Error(`Zip ${Math.round(zip.length / 1048576)} MB — en fazla 25 MB. Büyük dosyaları .gitignore'a ekle.`);
  return { zip, files: files.map((f) => f.path), skipped };
}

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const fail = (e: unknown) => ({ isError: true, content: [{ type: "text" as const, text: `Hata: ${e instanceof Error ? e.message : String(e)}` }] });
const id = z.string().uuid().describe("Servis id (list_services / create_service yanıtındaki id)");

export function registerServiceTools(server: any, api: Api) {
  const t = (name: string, desc: string, shape: Record<string, z.ZodTypeAny>, fn: (a: any) => Promise<unknown>) =>
    server.tool(name, desc, shape, async (a: any) => { try { return ok(await fn(a)); } catch (e) { return fail(e); } });

  t("list_services",
    "etrink'te barındırılan servislerini listeler (Python / Node.js / hazır Linux programı): durum, boyut, adres, kaynak kullanımı, kota. " +
      "Durumlar: no_release (kod yok), building, starting, running, crashed, stopped, error.",
    {}, () => api.call("GET", "/mcp/services"));

  t("create_service",
    "Yeni bir servis oluşturur (kod henüz yüklenmez — ardından deploy_service). Ayarlar kodun kökündeki etrink.json ile de verilebilir: " +
      '{"runtime":"python|node|static|binary","version":"node: 26|24|22 · python: 3.14|3.13|3.12|3.11 (isteğe bağlı; yoksa package.json engines.node / .python-version, o da yoksa en yeni)","start":"python main.py","port":8080,"size":"small|medium|large","db":"none|postgres|postgres_redis","public":false,"spa":false}. ' +
      "static = kökte index.html olan HTML/CSS/JS sitesi (sunucu kodu yok, port 8080 ve HTTPS otomatik; spa:true bilinmeyen yolları index.html'e düşürür). " +
      "GÜVENLİK KURALI (geçersiz kılınamaz): desteği bitmiş dil sürümü istenirse yükleme reddedilir (version_eol); derlemede npm audit (yüksek/kritik) ya da pip-audit (düzeltmesi olan açık) bulursa derleme başarısız olur — paketleri güncel sürüme yükseltip tekrar yükle. " +
      "Boyutlar: small 0.25 CPU/256 MB/1 GB disk, medium 0.5/512 MB/3 GB, large 1/1 GB/10 GB. " +
      "Ücret (kullandıkça öde müşterisi): günlük karşılığı small $0.10, medium $0.20, large $0.40, +postgres $0.10, +postgres_redis $0.13; başlamış her saat bakiyeden kesilir (aynı gün silinirse yalnız kullanılan saatler). Oluşturma/yükleme için en az 1 günlük bakiye gerekir (insufficient_balance).",
    {
      name: z.string().min(1).max(60).describe("Görünen ad, ör. 'Binance sinyal botu'"),
      slug: z.string().optional().describe("Adres adı (a-z0-9-, 3-30). Boşsa addan üretilir"),
      size: z.enum(["small", "medium", "large"]).optional(),
      db: z.enum(["none", "postgres", "postgres_redis"]).optional().describe("Servise özel veritabanı: DATABASE_URL / REDIS_URL otomatik verilir"),
      region: z.string().optional().describe("Lokasyon (list_services yanıtındaki regions)"),
      port: z.number().int().min(1024).max(65535).optional().describe("Servis HTTP dinliyorsa portu (PORT env olarak da verilir)"),
    },
    (a) => api.call("POST", "/mcp/services", a));

  t("get_service", "Bir servisin ayrıntısı: durum, durum açıklaması, son sürüm, başlatma komutu, env değişken ADLARI (değerler gösterilmez), kaynak kullanımı.",
    { serviceId: id }, (a) => api.call("GET", `/mcp/services/${a.serviceId}`));

  t("deploy_service",
    "Yerel bir klasörü (ya da tek bir derlenmiş Linux x86_64 programını) zipleyip servise yükler, derlemeyi bekler ve sonucu + derleme logunu döner. " +
      ".gitignore'a uyar; node_modules, .venv, .git, .env* gönderilmez (bağımlılıklar sunucuda requirements.txt / package.json'dan kurulur). " +
      "Derleme hata verirse logu oku, kodu düzelt ve tekrar deploy_service çağır. Başarılıysa get_service_logs ile çalışma çıktısını izle.",
    {
      serviceId: id,
      path: z.string().min(1).describe("Yüklenecek klasörün (ya da tek program dosyasının) mutlak yolu"),
      wait: z.boolean().optional().describe("Derleme bitene kadar bekle (varsayılan true, en fazla ~3 dk)"),
    },
    async (a) => {
      const { zip, files, skipped } = packPath(a.path);
      const dep = await api.upload(`/mcp/services/${a.serviceId}/deploy`, zip, "app.zip");
      const out: any = { ...dep, uploaded: { files: files.length, bytes: zip.length, skipped } };
      if (a.wait === false) return out;
      for (let i = 0; i < 3; i++) {
        out.build = await api.call("GET", `/mcp/services/${a.serviceId}/releases/${dep.releaseId}?wait=60`);
        if (out.build.done) break;
      }
      return out;
    });

  t("get_build", "Bir sürümün derleme durumu ve logu (en fazla 60 sn bekler). deploy_service wait=false ile çağrıldıysa kullan.",
    { serviceId: id, releaseId: z.string().uuid() }, (a) => api.call("GET", `/mcp/services/${a.serviceId}/releases/${a.releaseId}?wait=60`));

  t("list_releases", "Servisin sürüm geçmişi (sürüm no, derleme durumu, kaynak: panel/api, tarih).",
    { serviceId: id }, (a) => api.call("GET", `/mcp/services/${a.serviceId}/releases`));

  t("get_service_logs",
    "Servisin çalışma logları (stdout/stderr + sistem olayları: başlatma, çökme, bellek aşımı). " +
      "Yeni satırlar için önceki yanıttaki cursor'ı after olarak ver.",
    { serviceId: id, after: z.number().int().min(0).optional(), lines: z.number().int().min(1).max(1000).optional() },
    (a) => api.call("GET", `/mcp/services/${a.serviceId}/logs?after=${a.after ?? 0}&lines=${a.lines ?? 200}`));

  t("set_service_env",
    "Ortam değişkenlerini (API anahtarları, ayarlar) ekler / değiştirir / siler; servis yeni değerlerle yeniden başlar. " +
      "Değerler şifreli saklanır ve bir daha GÖSTERİLMEZ. PORT, DATABASE_URL, REDIS_URL, DATA_DIR sistem tarafından verilir. " +
      "Gizli değerleri koda ya da zip'e koyma — bu aracı kullan.",
    { serviceId: id, set: z.record(z.string(), z.string()).optional(), unset: z.array(z.string()).optional() },
    (a) => api.call("PUT", `/mcp/services/${a.serviceId}/env`, { set: a.set, unset: a.unset }));

  t("update_service", "Servis ayarlarını değiştirir (ad, boyut, veritabanı, port, başlatma komutu, dışarıdan HTTPS erişimi). Değişiklik servisi yeniden başlatır.",
    {
      serviceId: id, name: z.string().optional(), size: z.enum(["small", "medium", "large"]).optional(),
      db: z.enum(["none", "postgres", "postgres_redis"]).optional(), port: z.number().int().min(1024).max(65535).nullable().optional(),
      startCmd: z.string().max(500).nullable().optional(), publicHttp: z.boolean().optional(),
    },
    ({ serviceId, ...p }) => api.call("PATCH", `/mcp/services/${serviceId}`, p));

  t("restart_service", "Servisi yeniden başlatır (çöktüyse de).", { serviceId: id }, (a) => api.call("POST", `/mcp/services/${a.serviceId}/restart`, {}));
  t("stop_service", "Servisi durdurur (veriler korunur).", { serviceId: id }, (a) => api.call("POST", `/mcp/services/${a.serviceId}/stop`, {}));
  t("start_service", "Durmuş servisi başlatır.", { serviceId: id }, (a) => api.call("POST", `/mcp/services/${a.serviceId}/start`, {}));
  t("rollback_service", "Bir önceki başarılı sürüme (ya da verilen releaseId'ye) geri döner.",
    { serviceId: id, releaseId: z.string().uuid().optional() }, (a) => api.call("POST", `/mcp/services/${a.serviceId}/rollback`, { releaseId: a.releaseId }));

  t("exec_in_service",
    "Servisin ortamında (aynı kod, env, veritabanı, /data) tek seferlik bir komut çalıştırır ve çıktısını döner — ör. 'python manage.py migrate', " +
      "'node scripts/seed.js', 'ls -la /data'. En fazla 300 sn; çıktı en fazla 64 KB.",
    { serviceId: id, cmd: z.string().min(1).max(1000), timeoutSec: z.number().int().min(5).max(300).optional() },
    async (a) => {
      const j = await api.call("POST", `/mcp/services/${a.serviceId}/exec`, { cmd: a.cmd, timeoutSec: a.timeoutSec ?? 120 });
      const deadline = Date.now() + ((a.timeoutSec ?? 120) + 90) * 1000;
      for (;;) {
        const r = await api.call("GET", `/mcp/services/${a.serviceId}/exec/${j.jobId}?wait=60`);
        if (r.status === "done" || r.status === "error" || Date.now() > deadline) return r;
      }
    });

  t("delete_service",
    "Servisi siler. Geri alınamaz: /data ve veritabanı 7 gün sonra kalıcı silinir. confirm alanına servisin slug'ını aynen yaz. " +
      "Kullanıcı açıkça istemedikçe çağırma.",
    { serviceId: id, confirm: z.string().describe("Servisin slug'ı (onay)") },
    (a) => api.call("DELETE", `/mcp/services/${a.serviceId}`, { confirm: a.confirm }));
}
