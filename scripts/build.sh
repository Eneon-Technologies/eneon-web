#!/usr/bin/env bash
# Full build: generate the route documents from index.html, then refresh the cache version.
set -euo pipefail
root_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root_dir"
node build-static-pages.mjs
"$root_dir/scripts/cache-buster.sh"
echo "Eneon site build completed successfully."
