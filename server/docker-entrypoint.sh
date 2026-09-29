#!/bin/sh
# Chown the Option C volume, then exec the app as `node` (PID 1).
set -eu
if [ -d /data ]; then
  mkdir -p /data/collection /data/auth
  chown -R node:node /data || true
fi
if command -v gosu >/dev/null 2>&1; then
  exec gosu node "$@"
fi
if command -v setpriv >/dev/null 2>&1; then
  exec setpriv --reuid=node --regid=node --init-groups -- "$@"
fi
# Last resort: stay root only if we cannot drop (should not happen with gosu).
exec "$@"
