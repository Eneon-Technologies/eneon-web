#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd "$(dirname "$0")" && pwd)"
"$script_dir/build-pages.sh"
"$script_dir/cache-buster.sh"
echo "Eneon site build completed successfully."
