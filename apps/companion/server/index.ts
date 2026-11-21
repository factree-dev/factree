// Factree UI server. Zero dependencies: Node built-ins only, so the plugin runs it as-is.
// Usage: node server.js --workspace <path to .factree> [--port N]   (the default port is in shared/config.ts)
//
// Reads the workspace (never writes to it, apart from ui.json saying where it runs),
// serves the browser app, a small JSON API, and a server-sent event stream that
// fires whenever specs, events or sessions change.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { DEFAULT_PORT } from "../shared/config.ts";
import { readFileSync, writeFileSync, existsSync, statSync, unlinkSync } from "node:fs";
import { join, extname, resolve, dirname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { userInfo } from "node:os";
import { workspaceState, specDetail, fingerprint, statusSignature } from "./workspace.ts";
import { repoLink } from "./repo.ts";
import { searchIndex } from "./search.ts";
import { applyDecision, checkDecisionRequest, DecisionError } from "./decisions.ts";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? (process.argv[i + 1] as string) : fallback;
}

const root = resolve(arg("workspace", join(process.cwd(), ".factree")));
const startPort = Number(arg("port", String(DEFAULT_PORT)));
const here = dirname(fileURLToPath(import.meta.url));
const publicDir = [join(here, "public"), join(here, "..", "ui"), join(here, "..", "..", "dist", "ui")].find((d) => existsSync(join(d, "index.html")));

// Which build this server serves: index.html names the hashed bundles, so it changes with every build (companion-handoff R3).
const build = publicDir ? createHash("sha1").update(readFileSync(join(publicDir, "index.html"))).digest("hex").slice(0, 12) : "";

if (!existsSync(root)) {
  console.error(`No Factree workspace at ${root}`);
  process.exit(1);
}

function gitUser(): string {
  try {
    return execFileSync("git", ["config", "user.name"], { cwd: dirname(root), encoding: "utf8" }).trim();
  } catch {
    return userInfo().username;
  }
}
const user = gitUser();
// The Factree version this companion belongs to: the plugin manifest beside the built UI, or the repo's in dev (version-check R3).
const running = [join(here, "..", ".claude-plugin", "plugin.json"), join(here, "..", "..", "..", "plugins", "factree", ".claude-plugin", "plugin.json")]
  .filter((p) => existsSync(p)).map((p) => { try { return String((JSON.parse(readFileSync(p, "utf8")) as { version?: string }).version ?? ""); } catch { return ""; } })[0] ?? "";
const repo = repoLink(dirname(root));

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json", ".ico": "image/x-icon",
};

function send(res: ServerResponse, status: number, body: string | Buffer, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(body);
}

function json(res: ServerResponse, status: number, value: unknown) {
  send(res, status, JSON.stringify(value));
}

function serveStatic(res: ServerResponse, urlPath: string) {
  if (!publicDir) return send(res, 500, "UI build not found. Run npm run build in apps/companion.", "text/plain");
  const clean = normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, "");
  let file = join(publicDir, clean);
  if (!file.startsWith(publicDir) || !existsSync(file) || statSync(file).isDirectory()) file = join(publicDir, "index.html");
  send(res, 200, readFileSync(file), TYPES[extname(file)] ?? "application/octet-stream");
}

const clients = new Set<ServerResponse>();
let lastPrint = fingerprint(root);
setInterval(() => {
  const now = fingerprint(root);
  if (now !== lastPrint) {
    lastPrint = now;
    for (const c of clients) c.write(`event: change\ndata: {}\n\n`);
  }
}, 700).unref();
// Statuses also change with time alone (a run going quiet after 10 min, closing after 6 h), with nothing on disk changing.
let lastStatuses = statusSignature(workspaceState(root, user, Date.now(), repo, running));
setInterval(() => {
  const now = statusSignature(workspaceState(root, user, Date.now(), repo, running));
  if (now !== lastStatuses) {
    lastStatuses = now;
    for (const c of clients) c.write(`event: change\ndata: {}\n\n`);
  }
}, 15000).unref();
setInterval(() => { for (const c of clients) c.write(`: keep-alive\n\n`); }, 25000).unref();

function decide(req: IncomingMessage, res: ServerResponse, host: string) {
  try { checkDecisionRequest(req.method ?? "", req.headers, host); }
  catch (e) { return json(res, e instanceof DecisionError ? e.status : 400, { error: (e as Error).message }); }
  let body = "";
  req.on("data", (chunk: Buffer) => { body += chunk; if (body.length > 10_000) req.destroy(); });
  req.on("end", () => {
    try {
      const state = workspaceState(root, user, Date.now(), repo, running);
      applyDecision(root, user, JSON.parse(body || "{}"), state.decisions);
      for (const c of clients) c.write(`event: change\ndata: {}\n\n`);
      json(res, 200, { ok: true });
    } catch (e) {
      json(res, e instanceof DecisionError ? e.status : 400, { error: (e as Error).message });
    }
  });
}

function handle(req: IncomingMessage, res: ServerResponse) {
  // Local only: refuse requests that didn't come to localhost (DNS rebinding protection).
  const host = (req.headers.host ?? "").split(":")[0];
  if (host !== "localhost" && host !== "127.0.0.1") return send(res, 403, "Forbidden", "text/plain");
  // The only write: decisions, checked and applied by decisions.ts (companion-decisions R3–R6, R10).
  if ((req.url ?? "").split("?")[0] === "/api/decisions" && req.method !== "GET") return decide(req, res, host);
  if (req.method !== "GET") return send(res, 405, "Read-only", "text/plain");

  const url = new URL(req.url ?? "/", "http://localhost");
  try {
    if (url.pathname === "/api/state") return json(res, 200, workspaceState(root, user, Date.now(), repo, running));
    if (url.pathname === "/api/search") return json(res, 200, searchIndex(root));   // spec search R2
    const m = /^\/api\/specs\/([a-z0-9][a-z0-9-]*)$/.exec(url.pathname);
    if (m) {
      const detail = specDetail(root, m[1] as string);
      return detail ? json(res, 200, detail) : json(res, 404, { error: "No such spec" });
    }
    if (url.pathname === "/api/stream") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
      res.write(`event: hello\ndata: ${JSON.stringify({ build })}\n\n`);
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    if (url.pathname.startsWith("/api/")) return json(res, 404, { error: "Not found" });
    return serveStatic(res, url.pathname);
  } catch (err) {
    console.error(err);
    return json(res, 500, { error: "Something went wrong reading the workspace" });
  }
}

const infoFile = join(root, "ui.json");
function listen(port: number, attemptsLeft: number) {
  const server = createServer(handle);
  server.once("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE" && attemptsLeft > 0) return listen(port + 1, attemptsLeft - 1);
    console.error(err.message);
    process.exit(1);
  });
  server.listen(port, "127.0.0.1", () => {
    const url = `http://localhost:${port}`;
    writeFileSync(infoFile, JSON.stringify({ pid: process.pid, port, url, started: new Date().toISOString() }) + "\n");
    console.log(`Factree UI for ${root}\n${url}`);
  });
}

function cleanup() {
  try {
    const info = JSON.parse(readFileSync(infoFile, "utf8")) as { pid?: number };
    if (info.pid === process.pid) unlinkSync(infoFile);
  } catch { /* already gone */ }
  process.exit(0);
}
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

listen(startPort, 10);
