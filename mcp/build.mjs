// Tek dosya, bağımlılıksız çıktı: dist/etrink-mcp.mjs (npx etrink-mcp / node dist/etrink-mcp.mjs)
import { build } from "esbuild";
import { chmodSync } from "node:fs";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  define: { "process.env.ETRINK_BUNDLE": '"1"' },
  banner: { js: '#!/usr/bin/env node\nimport{createRequire}from"module";const require=createRequire(import.meta.url);' },
  outfile: "dist/etrink-mcp.mjs",
});
chmodSync("dist/etrink-mcp.mjs", 0o755);
