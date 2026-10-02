#!/usr/bin/env bash
# Builds static pages from a shared shell, navigation and footer.
set -euo pipefail
root_dir="$(cd "$(dirname "$0")/.." && pwd)"
template="$root_dir/templates/site-shell.html"
nav_template="$root_dir/templates/navigation.html"
footer_template="$root_dir/templates/footer.html"
manifest="$root_dir/pages/site-map.tsv"
base_url="${ENEON_SITE_URL:-https://eneontechnologies.com}"
cache_version="${ENEON_CACHE_VERSION:-dev}"

for required in "$template" "$nav_template" "$footer_template" "$manifest"; do
  [[ -f "$required" ]] || { echo "Build failed: missing $required" >&2; exit 1; }
done
replace_token() {
  local file="$1" token="$2" value="$3"
  TOKEN="$token" VALUE="$value" perl -0pi -e 's/\Q$ENV{TOKEN}\E/$ENV{VALUE}/g' "$file"
}
while IFS='|' read -r output slug title description keywords; do
  [[ -z "$output" || "$output" == \#* ]] && continue
  body="$root_dir/pages/${output%.html}.html"
  [[ -f "$body" ]] || { echo "Build failed: page body is missing: $body" >&2; exit 1; }
  temp_file="$(mktemp)"; cp "$template" "$temp_file"
  nav="$(mktemp)"; cp "$nav_template" "$nav"
  for item in HOME ABOUT SERVICES PROJECTS PRODUCTS CONTACT; do replace_token "$nav" "{{ACTIVE_$item}}" ""; done
  active="${slug^^}"
  case "$active" in HOME|ABOUT|SERVICES|PROJECTS|PRODUCTS|CONTACT) replace_token "$nav" "{{ACTIVE_$active}}" "is-active" ;; esac
  canonical="$base_url/$output"; [[ "$output" == "index.html" ]] && canonical="$base_url/"
  replace_token "$temp_file" "__TITLE__" "$title"; replace_token "$temp_file" "__DESCRIPTION__" "$description"
  replace_token "$temp_file" "__KEYWORDS__" "$keywords"; replace_token "$temp_file" "__CANONICAL__" "$canonical"
  replace_token "$temp_file" "__BASE_URL__" "$base_url"; replace_token "$temp_file" "__CACHE_VERSION__" "$cache_version"; replace_token "$temp_file" "__SLUG__" "$slug"
  NAV_FILE="$nav" FOOTER_FILE="$footer_template" BODY_FILE="$body" perl -0pi -e '
    s{__NAVIGATION__}{do { local $/; open my $f, q{<}, $ENV{NAV_FILE} or die $!; <$f> }}e;
    s{__FOOTER__}{do { local $/; open my $f, q{<}, $ENV{FOOTER_FILE} or die $!; <$f> }}e;
    s{__CONTENT__}{do { local $/; open my $f, q{<}, $ENV{BODY_FILE} or die $!; <$f> }}e;
  ' "$temp_file"
  # Author notes in <!-- --> comments are for editors only; keep them out of published pages.
  perl -0pi -e 's/[ \t]*<!--.*?-->[ \t]*\n?//gs' "$temp_file"
  # Cloudinary: add automatic format + quality (f_auto,q_auto) to every image/video URL that
  # doesn't already set f_ or q_. Disable with ENEON_CLOUDINARY_AUTO=0.
  if [[ "${ENEON_CLOUDINARY_AUTO:-1}" != "0" ]]; then
    perl -pi -e '
      my $p = qr/(?:a|ac|af|ar|b|bo|br|c|co|cs|d|dl|dn|dpr|du|e|eo|f|fl|fn|fps|g|h|if|ki|l|o|p|pg|q|r|so|sp|t|u|vc|vs|w|x|y|z)_[^,\/\s"\x27<>]+/;
      s{(https://res\.cloudinary\.com/[^/\s"\x27<>]+/(?:image|video)/upload/)((?:$p(?:,$p)*/)*)}{
        my ($base, $t) = ($1, $2);
        $t =~ m{(?:^|[,/])[fq]_} ? "$base$t" : "$base${t}f_auto,q_auto/"
      }ge;
    ' "$temp_file"
  fi
  mv "$temp_file" "$root_dir/$output"; rm -f "$nav"; echo "Generated $output"
done < "$manifest"
echo "Build complete. Static pages are ready at $root_dir."
