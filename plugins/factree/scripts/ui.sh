#!/usr/bin/env bash
# Start (or find) the Factree UI for the current workspace and print its URL.
# Usage: ui.sh [--port N] [--stop]
# Needs Node.js 20+. Runs in the background; state is kept in <workspace>/ui.json.

here="$(cd "$(dirname "$0")" && pwd)"
server="$here/../ui/server.js"
. "$(cd "$(dirname "$0")" && pwd)/lib.sh"
port=$FACTREE_PORT_DEFAULT; stop=""
while [ $# -gt 0 ]; do
  case "$1" in
    --port) port="$2"; shift 2 ;;
    --stop) stop=1; shift ;;
    *) echo "usage: ui.sh [--port N] [--stop]" >&2; exit 2 ;;
  esac
done

# Stopping never creates a workspace; starting creates one on first use, local only (workspace-setup R1, R3).
if [ -n "$stop" ]; then
  root=$(bash "$here/root.sh") || { echo "No Factree UI is running here."; exit 0; }
else
  out=$(bash "$here/init.sh"); code=$?
  [ $code -eq 0 ] || { printf '%s\n' "$out" >&2; exit 1; }
  printf '%s\n' "$out" | sed '$d'     # the "Created …" line, if it was just created
  root=$(printf '%s\n' "$out" | tail -n1)
fi
info="$root/ui.json"
pid=$(sed -n 's/.*"pid":\([0-9]*\).*/\1/p' "$info" 2>/dev/null | head -n1)
url=$(sed -n 's/.*"url":"\([^"]*\)".*/\1/p' "$info" 2>/dev/null | head -n1)

if [ -n "$stop" ]; then
  if [ -n "$pid" ] && kill "$pid" 2>/dev/null; then echo "Stopped the Factree UI ($url)."; else echo "The Factree UI isn't running."; fi
  rm -f "$info"; exit 0
fi

if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
  echo "Factree UI is already running at $url"; exit 0
fi

command -v node >/dev/null 2>&1 || { echo "The Factree UI needs Node.js 20 or later (node was not found)." >&2; exit 1; }
[ -f "$server" ] || { echo "UI build not found at $server" >&2; exit 1; }

log="$root/ui.log"
nohup node "$server" --workspace "$root" --port "$port" > "$log" 2>&1 &
for _ in 1 2 3 4 5 6 7 8 9 10; do
  sleep 0.3
  [ -f "$info" ] && grep -q "\"pid\":$!" "$info" 2>/dev/null && break
done
url=$(sed -n 's/.*"url":"\([^"]*\)".*/\1/p' "$info" 2>/dev/null | head -n1)
if [ -z "$url" ]; then echo "The Factree UI didn't start. See $log" >&2; tail -5 "$log" >&2; exit 1; fi
echo "Factree UI running at $url"
