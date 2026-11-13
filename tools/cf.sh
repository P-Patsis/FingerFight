#!/usr/bin/env bash
# Project-local CLI and private OAuth state; no global install or shell changes.
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
export XDG_CONFIG_HOME="$PWD/.git/cloudflare-auth"
export XDG_CACHE_HOME="$PWD/.git/cloudflare-cache"
export XDG_DATA_HOME="$PWD/.git/cloudflare-data"
export CF_SEND_TELEMETRY=false
export DO_NOT_TRACK=1
if [ ! -x .git/cloudflare-cli/node_modules/.bin/cf ]; then
  printf 'Project-local Cloudflare CLI missing. See backend/README.md.\n' >&2
  exit 1
fi
exec .git/cloudflare-cli/node_modules/.bin/cf "$@"
