// The companion's settings, in one place (spec codebase-health R2).

export const DEFAULT_PORT = 4747;                      // the first port the server tries
export const LIVE_WINDOW_MS = 6 * 60 * 60 * 1000;      // a spec run quiet for 6 hours is no longer open
export const PAUSED_AFTER_MS = 10 * 60 * 1000;         // an open run quiet for 10 minutes reads as paused
export const SESSION_STALE_MS = 12 * 60 * 60 * 1000;   // a session file untouched for 12 hours is ignored
export const ENDED_SESSION_MS = 60 * 60 * 1000;        // an ended session stays listed for an hour
