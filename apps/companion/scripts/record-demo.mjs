// Record the README's demo (spec readme R1): the real companion following one spec through the factory, driven by a
// scripted copy of its own workspace (examples/.factree: a URL shortener) and captured from headless Chrome. Needs Chrome and ffmpeg.
// Usage, from apps/companion: npm run demo [-- <scratch dir>]. Writes docs/factree-demo.gif (and an .mp4 in the scratch dir).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execFileSync } from "node:child_process";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const out = path.resolve(process.argv[2] ?? fs.mkdtempSync(path.join(os.tmpdir(), "factree-demo-")));
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const W = path.join(out, "ws/.factree"), FR = path.join(out, "frames");
fs.rmSync(path.join(out, "ws"), { recursive: true, force: true }); fs.rmSync(FR, { recursive: true, force: true });
fs.mkdirSync(path.join(W, "specs"), { recursive: true }); fs.mkdirSync(FR, { recursive: true });
// Everything runs as the fictional John Doe, whoever records it: the companion and the scripts read the git identity.
fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, "gitconfig"), "[user]\n\tname = John Doe\n\temail = john@example.com\n");
const ENV = { ...process.env, GIT_CONFIG_GLOBAL: path.join(out, "gitconfig"), GIT_CONFIG_NOSYSTEM: "1", FACTREE_HOME: "" };
const SPEC = "url-shortener", WORK = "001-url-shortener";
const ex = path.join(repo, "examples/.factree");
const specSrc = fs.readFileSync(path.join(ex, `specs/${SPEC}.md`), "utf8");
const setStatus = (st) => fs.writeFileSync(path.join(W, `specs/${SPEC}.md`), specSrc.replace(/^status: .*$/m, `status: ${st}`).replace(/^approved_by: .*$/m, st === "approved" ? "approved_by: John Doe" : "approved_by:").replace(/^approved_at: .*$/m, st === "approved" ? "approved_at: 2026-11-21" : "approved_at:"));
const ev = (type, where, data = {}) => fs.appendFileSync(path.join(W, "events.jsonl"), JSON.stringify({ ts: new Date().toISOString().replace(/\.\d+Z$/, "Z"), type, ...where, actor: "John Doe", data }) + "\n");
const done = (task, commit, lines) => execFileSync("bash", [path.join(repo, "plugins/factree/scripts/task-done.sh"), WORK, task, commit, String(lines), "npm test"], { env: { ...ENV, FACTREE_HOME: W }, cwd: W, stdio: "ignore" });
const results = {}; let req = "";
for (const l of specSrc.split("\n")) { const r = /^### Requirement: (R\d+)/.exec(l), s = /^#### Scenario: (S\d+) (.*)/.exec(l); if (r) req = r[1]; if (s) results[`${req}.${s[1]}`] = { status: "proved", evidence: `${s[2].toLowerCase()} [${SPEC}#${req}.${s[1]}]` }; }
// Evidence is the test that cites each scenario, from the plan's tasks, as verify would report it.
for (const v of ["backend", "frontend"]) for (const m of fs.readFileSync(path.join(ex, `work/${WORK}/${v}/tasks.md`), "utf8").matchAll(/it\("([^"]*\[[^#]+#(R\d+\.S\d+)\])"\)/g)) if (results[m[2]]) results[m[2]].evidence = m[1];
const S = { spec: SPEC }, WK = { work: WORK };
setStatus("draft"); fs.writeFileSync(path.join(W, "events.jsonl"), "");
ev("spec.created", S, { title: "Short links" });
ev("spec.step", S, { step: "gaps", title: "Short links", note: "3 gaps found" });

const PORT = 4791, CDP = 9339;
const server = spawn("node", [path.join(repo, "plugins/factree/ui/server.js"), "--workspace", W, "--port", String(PORT)], { env: ENV, cwd: out, stdio: "ignore" });
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", `--user-data-dir=${path.join(out, "prof")}`, `--remote-debugging-port=${CDP}`, "--window-size=1280,720", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2500);
const target = (await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()).find((t) => t.type === "page");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pending = new Map();
ws.addEventListener("message", (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); } });
const cdp = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const js = (expression) => cdp("Runtime.evaluate", { expression });

await cdp("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await cdp("Page.navigate", { url: `http://localhost:${PORT}/work/${SPEC}/spec` });
await sleep(1500);
const CAPTION_CSS = `.workspace-path{visibility:hidden}#demo-cap{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:rgba(10,10,12,.92);color:#fff;font:600 17px Inter,system-ui,sans-serif;padding:10px 18px;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.5);z-index:99;border:1px solid rgba(255,255,255,.12);white-space:nowrap}`;
await js(`(()=>{const s=document.createElement('style');s.textContent=${JSON.stringify(CAPTION_CSS)};document.head.appendChild(s);const d=document.createElement('div');d.id='demo-cap';document.body.appendChild(d);})()`);
const caption = (t) => js(`document.getElementById('demo-cap').textContent=${JSON.stringify(t)}`);
const go = (p) => js(`history.pushState(null,'','${p}');dispatchEvent(new PopStateEvent('popstate'))`);
const key = async (k) => { for (const type of ["keyDown", "keyUp"]) await cdp("Input.dispatchKeyEvent", { type, key: k, code: k, windowsVirtualKeyCode: k === "Enter" ? 13 : 0 }); };

// Capture frames continuously, with their times, while the story plays.
const frames = []; let recording = true;
const capture = (async () => { while (recording) { const t = Date.now(); const r = await cdp("Page.captureScreenshot", { format: "jpeg", quality: 85 }); const f = path.join(FR, `f${String(frames.length).padStart(5, "0")}.jpg`); fs.writeFileSync(f, Buffer.from(r.data, "base64")); frames.push({ f, t }); await sleep(Math.max(0, 90 - (Date.now() - t))); } })();

await caption("1 · \"Members want short links\" — Claude turns it into a spec, grounded in the code");
await sleep(2200); ev("spec.step", S, { step: "observe", note: "reading the code" }); await sleep(2000);
ev("spec.step", S, { step: "questions", note: "2 decisions" });
ev("question.asked", S, { n: 1, text: "Let members pick their own short codes?", why: "Custom codes need a naming policy; sequential ones can be guessed.", proposal: "Not yet: random 7-character codes", options: ["Allow custom codes, first come first served"] });
ev("question.asked", S, { n: 2, text: "Do short links expire?", why: "Shared links live in docs and chats for years.", proposal: "Never, unless the owner deletes them", options: ["After 1 year without opens"] });
await sleep(1200); await go(`/work/${SPEC}/spec/decisions`);
await caption("2 · It stops only for real decisions — answer in the browser (Enter takes the recommendation)");
await sleep(3000); await key("Enter"); await sleep(2200); await key("Enter"); await sleep(1800);
setStatus("approved"); ev("spec.approved", S, { by: "flow: no open decisions" });
ev("stage.step", S, { stage: "plan", step: "designing", work: WORK }); ev("plan.created", WK, { spec: SPEC });
await go(`/work/${SPEC}/spec`);
await caption("3 · Then it runs on its own: a plan that follows your repo's patterns…");
await sleep(3000);
fs.cpSync(path.join(ex, `work/${WORK}`), path.join(W, `work/${WORK}`), { recursive: true });
ev("plan.approved", WK, { by: "flow: no open decisions", tasks: 3 });
ev("stage.step", S, { stage: "build", work: WORK }); ev("task.started", WK, { task: "T1" });
await sleep(800); await go(`/work/${SPEC}/build/${WORK}`);
await caption("4 · …builds it test-first, in parallel where it can, each task sized for one review…");
await sleep(3000); done("T1", "4f2a9c1", 214); ev("task.started", WK, { task: "T2" }); ev("task.started", WK, { task: "T3" });
await sleep(3000); done("T3", "9d03b6e", 148);
await sleep(2000); done("T2", "b81e07d", 77);
await sleep(1500); ev("stage.step", S, { stage: "verify", step: "running the tests" }); await go(`/work/${SPEC}/verify`);
await caption("5 · …proves every scenario from the tests…");
await sleep(2500); ev("spec.verified", S, { proved: Object.keys(results).length, failing: 0, unverified: 0, results });
await sleep(3000);
ev("stage.step", S, { stage: "review" }); await go(`/work/${SPEC}/review`); await caption("6 · …and opens the pull request. Merging stays with you."); await sleep(2200); ev("review.opened", WK, { pr: "42", url: "https://github.com/you/links/pull/42", base: "main" });
await sleep(3000); ev("review.state", WK, { pr: "42", state: "MERGED" });
await caption("Merged · 100% — one small change, start to finish in a sitting");
await sleep(3500);
recording = false; await capture;
ws.close(); chrome.kill(); server.kill();

// Each frame lasts until the next one was taken, so the video runs in real time.
const list = frames.map((x, i) => `file '${x.f}'\nduration ${(((frames[i + 1]?.t ?? x.t + 100) - x.t) / 1000).toFixed(3)}`).join("\n") + `\nfile '${frames.at(-1).f}'\n`;
fs.writeFileSync(path.join(out, "frames.txt"), list);
const ff = (args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", path.join(out, "frames.txt"), ...args]);
ff(["-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-crf", "22", "-movflags", "+faststart", path.join(out, "factree-demo.mp4")]);
ff(["-vf", "fps=10,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff:max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle", path.join(out, "factree-demo.gif")]);
fs.copyFileSync(path.join(out, "factree-demo.gif"), path.join(repo, "docs/factree-demo.gif"));
console.log(`docs/factree-demo.gif: ${frames.length} frames, ${((frames.at(-1).t - frames[0].t) / 1000).toFixed(1)}s`);
