// Where the workspace's code lives on the web, so code paths in specs can link to it.

import { execFileSync } from "node:child_process";
import type { RepoLink } from "../shared/types.ts";

/** https://github.com/owner/repo from any common form of a remote URL; null if it isn't one we can link to. */
export function webUrlFromRemote(remote: string): string | null {
  const r = remote.trim().replace(/\.git$/, "").replace(/\/$/, "");
  const scp = /^[\w.-]+@([\w.-]+):(.+)$/.exec(r);                      // git@github.com:owner/repo
  if (scp) return `https://${scp[1]}/${scp[2]}`;
  const url = /^(?:ssh|git|https?):\/\/(?:[^@/]+@)?([\w.-]+)(?::\d+)?\/(.+)$/.exec(r);
  if (url) return `https://${url[1]}/${url[2]}`;
  return null;
}

function git(cwd: string, args: string[]): string {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

/** The origin's web URL and default branch for the repo containing dir, or null without a usable origin. */
export function repoLink(dir: string): RepoLink | null {
  const web = webUrlFromRemote(git(dir, ["remote", "get-url", "origin"]));
  if (!web) return null;
  const head = git(dir, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]).replace(/^origin\//, "");
  const current = git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]);
  return { web, ref: head || (current && current !== "HEAD" ? current : "main") };
}
