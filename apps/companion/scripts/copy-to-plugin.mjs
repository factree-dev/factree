// Copy the built UI and server into the plugin, so it runs without npm install.
import { cpSync, rmSync, mkdirSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const app = fileURLToPath(new URL("..", import.meta.url));
const target = join(app, "..", "..", "plugins", "factree", "ui");
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(join(app, "dist", "ui"), join(target, "public"), { recursive: true });
copyFileSync(join(app, "dist", "server", "server.js"), join(target, "server.js"));
console.log(`Copied UI to ${target}`);
