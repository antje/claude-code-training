#!/usr/bin/env bash
#
# PreToolUse hook on Bash. Blocks `git push` unless the merchant console's
# tests and production build both pass.
#
# Reads the tool call as JSON on stdin. Non-push commands are waved through
# untouched — this hook sees every Bash call, so it has to be cheap to skip.
#
# Exit codes are the contract: 0 allows the tool call, 2 blocks it and shows
# stderr to Claude.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_DIR="$REPO_ROOT/build-battle/merchant-console"
LOG_DIR="${TMPDIR:-/tmp}/northwind-pre-push"

input="$(cat)"

command_line="$(
  printf '%s' "$input" |
    python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' \
    2>/dev/null
)"

# Not a push? Nothing to do. Matches `git push` with or without flags, and after
# a leading `cd ... &&`, without matching a commit message that mentions it.
if ! printf '%s' "$command_line" |
  grep -Eq '(^|[;&|[:space:]])git[[:space:]]+(-[^[:space:]]+[[:space:]]+)*push([[:space:]]|$)'; then
  exit 0
fi

if [ ! -d "$APP_DIR/node_modules" ]; then
  echo "pre-push-check: dependencies are not installed in build-battle/merchant-console." >&2
  echo "Run 'npm install' there, then push again." >&2
  exit 2
fi

mkdir -p "$LOG_DIR"

run_check() {
  local script="$1"
  local log="$LOG_DIR/$script.log"

  if (cd "$APP_DIR" && npm run "$script" >"$log" 2>&1); then
    return 0
  fi

  {
    echo ""
    echo "BLOCKED: 'npm run $script' failed, so the push did not happen."
    echo ""
    echo "Last 20 lines:"
    tail -20 "$log"
    echo ""
    echo "Full output: $log"
    echo "Reproduce:   cd build-battle/merchant-console && npm run $script"
  } >&2
  return 1
}

run_check test || exit 2
run_check build || exit 2

echo "pre-push-check: tests and build passed." >&2
exit 0
