#!/usr/bin/env bash
set -eu

curl --fail --silent --show-error http://127.0.0.1:3001/api/v1/health >/dev/null
curl --fail --silent --show-error http://127.0.0.1:3000/health >/dev/null
echo "Galaxy OS API and web are healthy"
