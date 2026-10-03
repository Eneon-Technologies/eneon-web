#!/usr/bin/env bash
# Regenerates the web logo files, icons and social card in images/brand/ (plus /favicon.ico)
# from the original logo in logo/eneon_logo_no_text.svg. Run it after the logo changes, then
# run ./scripts/build.sh. Requires rsvg-convert (librsvg) and ImageMagick (`convert`).
#
#   ./scripts/generate-brand-assets.sh
#
# BRAND_OUT_DIR=/some/dir writes everything there instead (handy for previewing changes).
set -euo pipefail
export LC_ALL=C
root_dir="$(cd "$(dirname "$0")/.." && pwd)"
source_svg="$root_dir/logo/eneon_logo_no_text.svg"
out_dir="${BRAND_OUT_DIR:-$root_dir/images/brand}"
favicon_ico="${BRAND_OUT_DIR:+$BRAND_OUT_DIR/favicon.ico}"; favicon_ico="${favicon_ico:-$root_dir/favicon.ico}"

for tool in rsvg-convert convert; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Error: '$tool' is required (install librsvg2-bin and imagemagick)." >&2; exit 1; }
done
[[ -f "$source_svg" ]] || { echo "Error: $source_svg not found." >&2; exit 1; }
mkdir -p "$out_dir"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT

# 1. Master mark: render large, trim the empty border, pad to a square (4% breathing room).
rsvg-convert -w 2000 "$source_svg" -o "$work/render.png"
convert "$work/render.png" -trim +repage "$work/trimmed.png"
size="$(convert "$work/trimmed.png" -format '%[fx:max(w,h)*1.04]' info: | cut -d. -f1)"
convert "$work/trimmed.png" -background none -gravity center -extent "${size}x${size}" "$work/mark.png"
echo "Master mark: ${size}x${size}px"

# 2. Logo marks used on the pages.
convert "$work/mark.png" -resize 160x160 -strip -quality 82 -define webp:method=6 "$out_dir/eneon-mark.webp"     # header/footer (2x of 40px+)
convert "$work/mark.png" -resize 480x480 -strip -quality 82 -define webp:method=6 "$out_dir/eneon-mark-lg.webp"  # home hero

# 3. Icons.
convert "$work/mark.png" -resize 32x32 -strip "$out_dir/favicon-32.png"
convert "$work/mark.png" -resize 64x64 -strip "$out_dir/favicon-64.png"
convert "$out_dir/favicon-64.png" -define icon:auto-resize=48,32,16 "$favicon_ico"
convert "$work/mark.png" -resize 144x144 -background '#071226' -gravity center -extent 180x180 \
  -strip -colors 256 PNG8:"$out_dir/apple-touch-icon.png"                                                     # iPhone/iPad, opaque navy

# 4. Social card (1200x630) for link previews.
convert "$work/trimmed.png" -resize 420x420 -background none -gravity center -extent 440x440 "$work/card-mark.png"
cat > "$work/card.svg" <<EOF
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0a1836"/><stop offset="1" stop-color="#050b1c"/></linearGradient>
<radialGradient id="glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#1ab8ff" stop-opacity=".35"/><stop offset="1" stop-color="#1ab8ff" stop-opacity="0"/></radialGradient>
<pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M48 0H0V48" fill="none" stroke="#78a0e6" stroke-opacity=".07"/></pattern></defs>
<rect width="1200" height="630" fill="url(#bg)"/><rect width="1200" height="630" fill="url(#grid)"/>
<g fill="none" stroke="#1a7fff" stroke-width="2.5" opacity=".5"><path d="M0 440h40l50 50v140"/><path d="M0 480h25l40 40v110"/><path d="M0 520h12l30 30v80"/></g>
<circle cx="900" cy="315" r="330" fill="url(#glow)"/>
<image x="680" y="95" width="440" height="440" xlink:href="file://$work/card-mark.png"/>
<text x="84" y="180" font-family="Open Sans" font-weight="700" font-size="20" letter-spacing="7" fill="#22d3ff">ENGINEERING IDEAS INTO REALITY</text>
<text x="80" y="290" font-family="Open Sans" font-weight="800" font-size="88" letter-spacing="-2" fill="#ffffff">Eneon</text>
<text x="80" y="385" font-family="Open Sans" font-weight="800" font-size="88" letter-spacing="-2" fill="#22d3ff">Technologies</text>
<rect x="84" y="420" width="72" height="5" rx="2.5" fill="#22d3ff"/>
<text x="84" y="490" font-family="Open Sans" font-size="25" fill="#a9b8d0">Hardware · PCB · Embedded · IoT · Software</text>
<text x="84" y="540" font-family="Open Sans" font-weight="600" font-size="22" fill="#eaf1fb">Enugu, Nigeria</text>
</svg>
EOF
rsvg-convert "$work/card.svg" -o "$work/card.png"
convert "$work/card.png" -strip -quality 88 "$out_dir/eneon-social-card.jpg"

echo "Brand assets written to $out_dir (favicon: $favicon_ico):"
ls -l "$out_dir" | awk 'NR>1 {printf "  %-26s %6.1f KB\n", $9, $5/1024}'
echo "Next: run ./scripts/build.sh. Social previews refresh after re-scraping (see README)."
