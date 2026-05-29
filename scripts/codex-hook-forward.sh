#!/usr/bin/env bash
set -u

uri='http://127.0.0.1:17373/codex/hook'

payload="$(cat)"
if [[ -z "${payload//[[:space:]]/}" ]]; then
  payload='{}'
fi

curl \
  --silent \
  --show-error \
  --output /dev/null \
  --max-time 2 \
  --connect-timeout 1 \
  --header 'Content-Type: application/json' \
  --data-binary "$payload" \
  "$uri" >/dev/null 2>&1 || true

exit 0
