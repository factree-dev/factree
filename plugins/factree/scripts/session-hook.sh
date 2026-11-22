#!/usr/bin/env bash
# Claude Code hook: keep <workspace>/sessions/<session-id>.json up to date so the
# Factree UI can show which sessions are working and which are waiting on you.
# Wired to SessionStart, UserPromptSubmit, Stop, Notification and SessionEnd.
# Does nothing unless a Factree workspace already exists for this folder, except on
# SessionStart in a git repo with none: one line pointing feature work at /factree:spec.
# Otherwise never prints, except one line on SessionStart when the Factree UI is running.

. "$(cd "$(dirname "$0")" && pwd)/lib.sh"
input=$(cat 2>/dev/null || true)
hook_field() { printf '%s' "$input" | json_field "$1"; }   # a field of the hook's JSON input

sid=$(hook_field session_id)
event=$(hook_field hook_event_name)
cwd=$(hook_field cwd); [ -z "$cwd" ] && cwd="$PWD"
transcript=$(hook_field transcript_path)
message=$(hook_field message)
[ -z "$sid" ] && exit 0
case "$sid" in *[!A-Za-z0-9_-]*) exit 0 ;; esac

if ! root=$(bash "$(dirname "$0")/root.sh" "$cwd"); then   # no workspace: stay out of the way
  if [ "$event" = "SessionStart" ] && git -C "$cwd" rev-parse --git-dir >/dev/null 2>&1; then
    echo "Factree is installed: start feature or ticket work with /factree:spec, which specs it first, then plans, builds and verifies."
  fi
  exit 0
fi

case "$event" in
  SessionStart)     state="idle" ;;
  UserPromptSubmit) state="working" ;;
  Stop)             state="your_turn" ;;
  Notification)     state="waiting" ;;
  SessionEnd)       state="ended" ;;
  *) exit 0 ;;
esac

dir="$root/sessions"; mkdir -p "$dir"
file="$dir/$sid.json"
now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
prev() { sed -n "s/.*\"$1\":\"\\([^\"]*\\)\".*/\\1/p" "$file" 2>/dev/null | head -n1; }
started=$(prev started); [ -z "$started" ] && started="$now"
last=$(prev updated)   # when this session last heard from the hook, before this event
prompted=$(prev prompted)   # when this session's current turn began (factory-flow R6)
since=${prompted:-$last}
[ "$event" = "UserPromptSubmit" ] && prompted="$now"
[ -z "$transcript" ] && transcript=$(prev transcript)
message=${message%\\}   # a message cut at an escaped quote loses its trailing backslash

tmp="$file.$$"
printf '{"id":"%s","state":"%s","event":"%s","message":"%s","cwd":"%s","transcript":"%s","started":"%s","updated":"%s","prompted":"%s"}\n' \
  "$sid" "$state" "$event" "$(json_escape "$message")" "$(json_escape "$cwd")" "$(json_escape "$transcript")" "$started" "$now" "$prompted" > "$tmp" && mv "$tmp" "$file"

# Catch up on pull requests no wait is following, in the background so the prompt never waits on GitHub (review R11).
if [ "$event" = "SessionStart" ] || [ "$event" = "UserPromptSubmit" ]; then
  catchup="$(cd "$(dirname "$0")" && pwd)/review-catchup.sh"
  (cd "$cwd" 2>/dev/null && nohup bash "$catchup" >/dev/null 2>&1 &)
fi

# Hand Claude the companion decisions since its previous turn began that it hasn't had yet, from the background
# wait or an earlier prompt (factory-flow R6).
if [ "$event" = "UserPromptSubmit" ] && [ -n "$since" ] && [ -f "$root/events.jsonl" ]; then
  out=$(bash "$(dirname "$0")/decisions-since.sh" "$root/events.jsonl" "$since" "" "" "$dir/$sid.delivered")
  [ -n "$out" ] && printf "Decided in the Factree companion since your last turn:\n%s\n" "$out"
fi

# Warn once per session when a newer Factree last wrote this workspace (version-check R2).
if [ "$event" = "SessionStart" ] && [ -f "$root/events.jsonl" ]; then
  mine=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([0-9][0-9.]*\)".*/\1/p' "$(dirname "$0")/../.claude-plugin/plugin.json" 2>/dev/null | head -n1)
  if [ -n "$mine" ]; then
    newest=$(grep -o '"v":"[0-9][0-9.]*"' "$root/events.jsonl" | sed 's/"v":"//; s/"$//' | awk '
      function newer(a, b,    x, y, n, i) {   # a > b, comparing x.y.z as numbers
        n = split(a, x, "."); split(b, y, ".")
        for (i = 1; i <= (n > 3 ? n : 3); i++) { if (x[i] + 0 > y[i] + 0) return 1; if (x[i] + 0 < y[i] + 0) return 0 }
        return 0
      }
      { if (best == "" || newer($0, best)) best = $0 } END { print best }')
    behind=$(awk -v a="$newest" -v b="$mine" 'BEGIN { n = split(a, x, "."); split(b, y, "."); r = 0
      for (i = 1; i <= (n > 3 ? n : 3); i++) { if (x[i] + 0 > y[i] + 0) { r = 1; break } if (x[i] + 0 < y[i] + 0) break }
      print r }')
    if [ -n "$newest" ] && [ "$behind" = 1 ]; then
      echo "Factree $mine is older than the $newest that last wrote this workspace. Update: /plugin → factree, then restart Claude Code."
    fi
  fi
fi

if [ "$event" = "SessionStart" ] && [ -f "$root/ui.json" ]; then
  url=$(sed -n 's/.*"url":"\([^"]*\)".*/\1/p' "$root/ui.json" | head -n1)
  pid=$(sed -n 's/.*"pid":\([0-9]*\).*/\1/p' "$root/ui.json" | head -n1)
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then echo "Factree UI is running at $url"; fi
fi
exit 0
