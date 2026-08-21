#!/usr/bin/env bash
# Short wrapper: `bash tools/verify.sh` is easier to type on a phone than the
# full node invocation. Runs the complete suite with nothing installed.
set -euo pipefail
cd "$(dirname "$0")/.."
exec node --experimental-strip-types tools/verify-all.ts
