#!/usr/bin/env bash
set -eu

test -d apps/web/.next/static
if rg -l '127\.0\.0\.1:3001|credentials-file:|<TUNNEL_ID>' apps/web/.next/static; then
  echo "Server-only deployment data found in the browser bundle" >&2
  exit 1
fi
echo "Browser bundle contains no internal API or tunnel credential configuration"
