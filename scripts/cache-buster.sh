#!/usr/bin/env bash
# Replaces (rather than appends) CSS and JavaScript cache-version parameters.
set -euo pipefail
root_dir="$(cd "$(dirname "$0")/.." && pwd)"
# Eight random hexadecimal characters are produced, then truncated safely to seven.
# This avoids a pipe-to-head broken-pipe failure under `set -o pipefail`.
random_hex="$(LC_ALL=C od -An -N4 -tx4 /dev/urandom | tr -d '[:space:]')"
version="${random_hex:0:7}"
[[ "${#version}" -eq 7 ]] || { echo "Could not create cache version." >&2; exit 1; }
shopt -s nullglob
pages=("$root_dir"/*.html)
[[ "${#pages[@]}" -gt 0 ]] || { echo "No generated HTML files found. Run build-pages.sh first." >&2; exit 1; }
for page in "${pages[@]}"; do
  VERSION="$version" perl -0pi -e 's#(css/style\.css\?v=)[A-Za-z0-9_-]+#$1 . $ENV{VERSION}#ge; s#(js/script\.js\?v=)[A-Za-z0-9_-]+#$1 . $ENV{VERSION}#ge' "$page"
done
echo "Updated CSS and JavaScript cache version to $version in ${#pages[@]} pages."
