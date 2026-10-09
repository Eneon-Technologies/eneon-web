#!/usr/bin/env bash
# Content-hash cache busting (same approach as OneGrid's cache_burster.sh):
# renames css/style.css -> css/style.<hash>.css and js/script.js -> js/script.<hash>.js, where
# <hash> is the first 8 characters of the file's MD5, then updates the reference in every HTML
# document. The name only changes when the file's contents change, so browsers re-download
# CSS/JS exactly when it has been edited.
set -euo pipefail
export LC_ALL=C  # avoid perl locale warnings on systems with uncommon locales
root_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root_dir"

SOURCE_HTML="src/index.html"
[[ -f "$SOURCE_HTML" ]] || { echo "Error: '$SOURCE_HTML' not found." >&2; exit 1; }

# Every HTML document: the source, index.html, 404.html and each route folder's index.html.
mapfile -t html_files < <(find . -path ./.git -prune -o -name node_modules -prune -o -path ./admin-app -prune -o -name "*.html" -type f -print)

file_hash() {
  if command -v md5sum >/dev/null 2>&1; then md5sum "$1" | awk '{print $1}'
  elif command -v md5 >/dev/null 2>&1; then md5 -q "$1"
  else echo "Error: Neither md5sum nor md5 found." >&2; exit 1
  fi
}

for asset in "css/style:css" "js/script:js"; do
  base="${asset%%:*}"; ext="${asset##*:}"
  echo "Checking ${base}.${ext}..."

  # 1. Find the current reference in the source HTML (hashed, plain, or legacy ?v= form).
  current_ref="$(grep -oE "/${base}(\.[a-f0-9]{8})?\.${ext}(\?v=[A-Za-z0-9_-]+)?" "$SOURCE_HTML" | head -n 1 || true)"
  [[ -n "$current_ref" ]] || { echo "  -> No reference to ${base}.${ext} found in $SOURCE_HTML. Skipping."; continue; }
  current_file="${current_ref#/}"; current_file="${current_file%%\?*}"

  # 2. The referenced file must exist.
  [[ -f "$current_file" ]] || { echo "  -> Found '$current_ref' in HTML, but '$current_file' doesn't exist. Skipping."; continue; }

  # 3. New name from the contents' hash.
  new_file="${base}.$(file_hash "$current_file" | cut -c 1-8).${ext}"
  if [[ "$current_ref" == "/$new_file" ]]; then
    echo "  -> $current_file hasn't changed. Skipping."
    continue
  fi

  # 4. Rename the file (if its name changed) and update every HTML document.
  if [[ "$current_file" != "$new_file" ]]; then
    mv "$current_file" "$new_file"
    echo "  -> Renamed: $current_file -> $new_file"
  fi
  CURRENT="$current_ref" NEW="/$new_file" perl -pi -e 's/\Q$ENV{CURRENT}\E/$ENV{NEW}/g' "${html_files[@]}"
  echo "  -> Updated references in ${#html_files[@]} HTML documents."
done

echo "Done!"
