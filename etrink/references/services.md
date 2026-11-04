# etrink service hosting — agent guide

Run a Python, Node.js or prebuilt Go/Rust (Linux x86_64) program 24/7 in an isolated container.
Optional private Postgres / Redis. Manage it from the panel (https://etrink.com/app/v2/services),
the MCP server, or the HTTP API below.

## Fastest path (MCP)
1. Panel → API keys → new key with the **Services** permission (optionally locked to one service).
2. `curl -o etrink-mcp.mjs https://etrink.com/downloads/etrink-mcp.mjs` (Node.js 18+)
3. `claude mcp add etrink -e ETRINK_API_KEY=etrk_mcp_... -- node /full/path/etrink-mcp.mjs`
4. Tools: list_services, create_service, get_service, deploy_service (zips a local folder, uploads,
   waits for the build and returns the build log), get_build, list_releases, get_service_logs,
   set_service_env, update_service, restart_service, stop_service, start_service, rollback_service,
   exec_in_service, delete_service.

Loop: write code → deploy_service → if build fails read the log, fix, deploy again → get_service_logs.

## Project layout
- Python: `requirements.txt` (or `pyproject.toml`) + entry file. Default start: first of
  `main.py`, `app.py`, `bot.py`, `run.py`, `server.py` → `python <file>`.
- Node.js: `package.json`. `npm ci` (lock file) or `npm install`; `build` script runs if present;
  start = `npm start` if a start script exists, else `node <main|index.js>`.
- Binary: a single Linux x86_64 executable at the root → `./<file>`.
- A single top-level folder inside the zip is fine. Do not include `node_modules`, `.venv`, `.git`, `.env`.
- Zip limit 25 MB (5000 files). MCP deploy_service respects `.gitignore`.

## Manifest `etrink.json` (optional, zip root; overrides panel settings)
```json
{ "runtime": "python", "start": "python main.py", "port": 8080, "size": "small", "db": "postgres", "public": false }
```
- runtime: `python` | `node` | `binary`
- port: 1024–65535, only if the program serves HTTP (it must listen on `$PORT`)
- size: `small` (0.25 CPU, 256 MB, 1 GB disk) | `medium` (0.5, 512 MB, 3 GB) | `large` (1, 1 GB, 10 GB)
- db: `none` | `postgres` | `postgres_redis`
Unknown keys are rejected with a per-field error.

## Environment
| Variable | Meaning |
|---|---|
| `PORT` | HTTP port (when set) |
| `DATA_DIR` | `/data`, persistent across restarts and releases |
| `DATABASE_URL`, `PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` | private Postgres (db ≠ none) |
| `REDIS_URL` | private Redis (db = postgres_redis) |
| `ETRINK_SERVICE_ID` | service id |

Your own variables: set_service_env / `PUT /mcp/services/:id/env {"set":{"K":"V"},"unset":["X"]}`.
Values are encrypted and never returned; only names are listed. Changing env restarts the service.
The names above are reserved.

## Runtime rules
- Runs as uid 10001; root filesystem is read-only. Writable: `/data` (persistent), `/tmp` (64 MB, temporary).
- Outbound internet is allowed. Local/private networks, other services and SMTP port 25 are blocked.
- Exceeding memory → OOM kill and restart. Exit code 0 is reported as "exited normally" (a service must keep running).
- 5 crashes in a row → status `crashed`, no more restarts until start/restart/deploy.
- Trial accounts: `small` only, no database.
- Forbidden: mining, scanning, spam, proxies/VPNs.

## HTTP API (Bearer API key)
Base `https://api.etrink.com`, header `Authorization: Bearer etrk_mcp_...`.

| Method | Path | Notes |
|---|---|---|
| GET | `/mcp/services` | list + quota, regions, sizes |
| POST | `/mcp/services` | `{name, size?, db?, region?, port?, startCmd?, runtime?}` |
| GET/PATCH | `/mcp/services/:id` | view / change `{name,size,db,port,startCmd,publicHttp}` |
| POST | `/mcp/services/:id/deploy` | multipart field `file` (zip) → `{releaseId, seq, runtime, start, warnings}` (20/hour) |
| GET | `/mcp/services/:id/releases` | last 20 releases |
| GET | `/mcp/services/:id/releases/:rid?wait=60` | long-poll until the build is done; returns the last 200 log lines + hint |
| POST | `/mcp/services/:id/start`, `/stop`, `/restart` | |
| POST | `/mcp/services/:id/rollback` | `{releaseId?}` (default: previous successful release) |
| PUT | `/mcp/services/:id/env` | `{set:{}, unset:[]}` |
| GET | `/mcp/services/:id/logs?after=<n>&lines=200` | `{lines:[{n,t,s,l}], cursor, status}`; pass `cursor` back as `after` |
| POST | `/mcp/services/:id/exec` | `{cmd, timeoutSec?}` one-off container (same image/env/db), ≤ 5 min → `{jobId}` (30/hour) |
| GET | `/mcp/services/:id/exec/:jobId?wait=60` | `{status, output, exitCode}` |
| DELETE | `/mcp/services/:id` | body `{confirm:"<slug>"}`; data kept 7 days |

Errors: `{error, code, details?}`. Keys need the `services` scope; a key locked to one service gets 403 elsewhere.
Rate limit: 120 requests/min per key.
