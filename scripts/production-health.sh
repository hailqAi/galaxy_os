#!/usr/bin/env bash
set -eu

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
entry="$script_dir/local-runtime-entry.py"
test -f "$entry" || entry="$script_dir/local-runtime.py"
exec python3 "$entry" status
