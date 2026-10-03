#!/usr/bin/env bash
# Builds the single-page site: every page body in pages/ becomes a <div class="page"> inside
# one index.html, wrapped by the shared shell, navigation and footer. js/script.js shows the
# page that matches the URL (/about, /contact, ...); vercel.json / _redirects send every
# path to index.html.
set -euo pipefail
root_dir="$(cd "$(dirname "$0")/.." && pwd)"
template="$root_dir/templates/site-shell.html"
nav_template="$root_dir/templates/navigation.html"
footer_template="$root_dir/templates/footer.html"
manifest="$root_dir/pages/site-map.tsv"
output="$root_dir/index.html"
base_url="${ENEON_SITE_URL:-https://eneontechnologies.com}"
cache_version="${ENEON_CACHE_VERSION:-dev}"

for required in "$template" "$nav_template" "$footer_template" "$manifest"; do
  [[ -f "$required" ]] || { echo "Build failed: missing $required" >&2; exit 1; }
done
replace_token() {
  local file="$1" token="$2" value="$3"
  TOKEN="$token" VALUE="$value" perl -0pi -e 's/\Q$ENV{TOKEN}\E/$ENV{VALUE}/g' "$file"
}
escape_attr() { sed -e 's/&/\&amp;/g' -e 's/"/\&quot;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' <<<"$1"; }

content="$(mktemp)"; temp_file="$(mktemp)"
trap 'rm -f "$content" "$temp_file"' EXIT
home_title="" home_description="" home_keywords=""
while IFS='|' read -r slug route title description keywords; do
  [[ -z "$slug" || "$slug" == \#* ]] && continue
  body="$root_dir/pages/$slug.html"; [[ "$slug" == "home" ]] && body="$root_dir/pages/index.html"
  [[ -f "$body" ]] || { echo "Build failed: page body is missing: $body" >&2; exit 1; }
  if [[ -z "$home_title" ]]; then home_title="$title"; home_description="$description"; home_keywords="$keywords"; fi
  route_attr=""; [[ -n "$route" ]] && route_attr=" data-route=\"$route\""
  {
    printf '<div class="page" id="page-%s"%s data-title="%s" data-description="%s">\n' \
      "$slug" "$route_attr" "$(escape_attr "$title")" "$(escape_attr "$description")"
    cat "$body"
    printf '</div>\n'
  } >> "$content"
  echo "Added page: $slug ${route:-(fallback for unknown URLs)}"
done < "$manifest"

# Show the page for the current URL before first paint (no flash of the home page).
cat >> "$content" <<'EOF'
<script>(function(){var p=location.pathname.replace(/\/+$/,"").replace(/\.html$/,"")||"/";if(p==="/index"||p==="/home")p="/";var pages=document.querySelectorAll(".page"),hit=null;for(var i=0;i<pages.length;i++){if(pages[i].getAttribute("data-route")===p)hit=pages[i]}(hit||document.getElementById("page-404")||pages[0]).classList.add("active")})()</script>
<noscript><style>.page[data-route="/"]{display:block}</style></noscript>
EOF

cp "$template" "$temp_file"
replace_token "$temp_file" "__TITLE__" "$home_title"; replace_token "$temp_file" "__DESCRIPTION__" "$home_description"
replace_token "$temp_file" "__KEYWORDS__" "$home_keywords"; replace_token "$temp_file" "__CANONICAL__" "$base_url/"
replace_token "$temp_file" "__BASE_URL__" "$base_url"; replace_token "$temp_file" "__CACHE_VERSION__" "$cache_version"
NAV_FILE="$nav_template" FOOTER_FILE="$footer_template" BODY_FILE="$content" perl -0pi -e '
  s{__NAVIGATION__}{do { local $/; open my $f, q{<}, $ENV{NAV_FILE} or die $!; <$f> }}e;
  s{__FOOTER__}{do { local $/; open my $f, q{<}, $ENV{FOOTER_FILE} or die $!; <$f> }}e;
  s{__CONTENT__}{do { local $/; open my $f, q{<}, $ENV{BODY_FILE} or die $!; <$f> }}e;
' "$temp_file"
# Author notes in <!-- --> comments are for editors only; keep them out of the published page.
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
mv "$temp_file" "$output"; chmod 644 "$output"
echo "Build complete: $output"
