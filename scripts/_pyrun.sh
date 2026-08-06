#!/usr/bin/env bash
# Cross-platform Python launcher for AI log hooks.
# Prefer the project venv first, then a real Python launcher.
set -u

if [ -x "./.venv/Scripts/python.exe" ]; then
  PY="./.venv/Scripts/python.exe"
elif command -v py >/dev/null 2>&1; then
  PY="py -3"
elif command -v python3 >/dev/null 2>&1 && [ "$(command -v python3)" != "/c/Users/OS/AppData/Local/Microsoft/WindowsApps/python3" ]; then
  PY=python3
elif command -v python >/dev/null 2>&1 && [ "$(command -v python)" != "/c/Users/OS/AppData/Local/Microsoft/WindowsApps/python" ]; then
  PY=python
else
  # PATH lookup failed, probe standard Windows install locations.
  PY=""
  shopt -s nullglob 2>/dev/null || true
  for cand in \
    /c/Users/*/AppData/Local/Programs/Python/Python*/python.exe \
    "/c/Program Files/Python"*/python.exe \
    "/c/Program Files (x86)/Python"*/python.exe \
    /c/Python*/python.exe; do
    if [ -x "$cand" ]; then
      PY="$cand"
      break
    fi
  done
  shopt -u nullglob 2>/dev/null || true
  [ -n "$PY" ] || exit 0
fi

# shellcheck disable=SC2086
exec $PY "$@"
