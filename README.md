# Eneon Technologies website

A framework-free static website for Eneon Technologies, designed for hosts such as Namecheap.
Each public route has its own folder and `index.html`, so direct links work without server
rewrites.

## Updating the site

1. Edit the shared source in `src/index.html`, the stylesheet in `css/` or the script in `js/`.
2. Generate the route documents:

   ```bash
   node build-static-pages.mjs
   ```

3. Refresh the asset filenames and their references in every document:

   ```bash
   ./scripts/cache-buster.sh
   ```

`./scripts/build.sh` runs steps 2 and 3 together.

The build generates `index.html` (home), the route folders `about`, `services`, `projects`,
`products`, `contact` and `privacy`, and `404.html`. Don't edit them — they are overwritten on
every build.

## Cache busting

The stylesheet and script are named after a fingerprint of their contents, e.g.
`css/style.4e8d8748.css` and `js/script.724901de.js` (first 8 characters of the file's MD5).
Browsers can cache them for as long as they like: when the contents change, the name changes,
so visitors download the new version straight away; unchanged files keep their name and stay
cached.

To change styles or behaviour, edit the current file in `css/` or `js/` (whatever its hash is),
then run `./scripts/cache-buster.sh` (or `./scripts/build.sh`). It recalculates the hash,
renames the file if the contents changed, and updates the `<link>`/`<script>` reference in
`src/index.html` and every generated page. If nothing changed it leaves everything alone.

## How `src/index.html` is organised

`src/index.html` is the single source for the whole site:

- shared `<head>`, icon sprite and header (`NAVIGATION` comment);
- every page, each wrapped as

  ```html
  <div class="page" id="page-about">
    …page content…
  </div>
  <!-- /page-about -->
  ```

  Only the Home page has `class="page active"`; CSS hides the others;
- shared footer and WhatsApp button (`FOOTER` comment).

`build-static-pages.mjs` cuts out each page section and writes it, with the shared header and
footer, to its own file — the home page to `index.html`, the others to their route folders. It also sets each route's title, description, canonical URL and
social tags (from the `routes` list at the top of the script), highlights the current menu item,
and leaves out `<!-- -->` editor comments.

**Links:** use the folder URL with a trailing slash (`href="/projects/"`, `href="/services/#pcb"`).
Asset paths are root-absolute (`/css/...`, `/images/...`), so the site must be served from the
root of its domain.

**Adding a page:** add a `<div class="page" id="page-<name>">…</div>` section ending with
`<!-- /page-<name> -->` to `src/index.html`, add an entry to `routes` in `build-static-pages.mjs`,
link to it as `/<name>/`, add it to `sitemap.xml`, and rebuild.

## Structure

- `src/index.html` — source for every page (see above). It doesn't need to be uploaded; if it is,
  its `noindex` tag (stripped from published pages) and `Disallow: /src/` in `robots.txt` keep it
  out of search results.
- `build-static-pages.mjs` — generates `index.html`, the route folders and `404.html`.
- `css/style.<hash>.css` — design tokens, components and responsive rules.
- `js/script.<hash>.js` — theme, navigation, filters, lightbox, form and reveal effects.
- `scripts/cache-buster.sh` — renames the CSS/JS files by content hash (see below).
- `images/brand/` — optimized logo mark, favicons and social sharing card (generated from `logo/`).
- `logo/` — original Eneon logo source files (not loaded by the site; too large for web use).
  `scripts/generate-brand-assets.sh` creates the web versions from them.
- The site opens in the dark (brand) theme until a visitor chooses otherwise; the choice is
  kept in browser local storage.
- The visual style (navy, two-tone white/cyan headings, cyan ring icons, circuit traces,
  "Let’s build your idea" CTA) follows the Eneon service flyers.
- Project, product and page photos/videos are **not stored in the repo** — they are
  loaded from Cloudinary URLs. See "Images and video (Cloudinary)" below.

## Local preview

```bash
./scripts/build.sh
python3 -m http.server 8000
```

Open http://localhost:8000. Every route works when opened directly or refreshed.

## Images and video (Cloudinary)

All content media lives in Cloudinary. Upload a file in the Cloudinary console, copy its
delivery URL (e.g. `https://res.cloudinary.com/<cloud>/image/upload/v1712/eneon/projects/meter.jpg`)
and paste it straight into `src/index.html`.

- **Automatic optimization:** the build inserts `f_auto,q_auto` into every Cloudinary URL that
  doesn't already set a format/quality (in `src/index.html` itself and in the generated pages), so visitors get WebP/AVIF and right-sized quality
  automatically. (Avoid folder names that look
  like transformations, such as `w_photos/`.)
- **Cropping/resizing:** add transformations after `/upload/`, e.g. `c_fill,ar_4:3,w_800/` for
  uniform project thumbnails.
- **Video thumbnails:** take a frame from the video itself by using the same video URL with
  `so_1` (1 second in) and a `.jpg` extension:
  `.../video/upload/so_1,c_fill,ar_4:3,w_800/v1/eneon/projects/demo.jpg`. The lightbox does
  this automatically when a video has no `data-lightbox-poster`.

Ready-to-copy templates are in HTML comments in `src/index.html` (comments are left out of the
generated pages):

- Projects section (`page-projects`) — image and video project cards (the "case studies in preparation"
  panel and filter buttons switch automatically once a card exists).
- Products section (`page-products`) — product card.
- Services section (`page-services`) — an optional wide banner photo for each of the seven services
  (one commented `<figure>` line per service; use clean photos without text).
- Home section (`page-home`) — optional autoplaying showreel video.
- About section (`page-about`) — optional team/workspace photo.

Use meaningful alt text and keep autoplay video short and muted. Only publish client names,
project details and media after appropriate approval.

## Contact form

The enquiry form works without a backend: it opens the visitor's email app with the enquiry
pre-filled and addressed to `data-mailto`. To receive submissions directly, create a form on a
service such as Formspree and paste its endpoint into `data-endpoint` in the contact section of `src/index.html`,
then update the privacy section.

## Branding and deployment

Brand colors are CSS variables at the start of the stylesheet in `css/`, taken from the logo
(navy `#003D92`, blue `#068CE3`, cyan `#0DBDF1`). The web logo files in `images/brand/` and
`favicon.ico` are generated from `logo/eneon_logo_no_text.svg`. If the logo changes, replace that
file and run:

```bash
./scripts/generate-brand-assets.sh   # logo marks, favicons, Apple icon, social card
./scripts/build.sh
```

It needs `rsvg-convert` and ImageMagick (`sudo apt install librsvg2-bin imagemagick`). To change
the social card's text or layout, edit the SVG inside the script. Set `BRAND_OUT_DIR=/some/dir`
to preview the output without replacing the live files.

Upload `index.html`, `404.html`, the route folders (`about/`, `services/`, `projects/`,
`products/`, `contact/`, `privacy/`), `favicon.ico`, `css/`, `js/`, `images/`, `robots.txt`
and `sitemap.xml` to the web root (e.g. `public_html` on Namecheap). The source folders
(`src/`, `scripts/`, `logo/`, `build-static-pages.mjs`) don't need to be uploaded. To show the branded
404 page on Apache/cPanel hosting, add `ErrorDocument 404 /404.html` to `.htaccess`.

Before launch, confirm the contact email, review the privacy page against actual
data handling, set the production canonical domain, and validate the generated
site with your preferred HTML/accessibility checker.
