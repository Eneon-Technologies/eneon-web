# Eneon Technologies static website

A multi-page, framework-free website for Eneon Technologies. It is designed for
engineering services today and an eventual transition to proprietary products.
The root HTML files are generated, complete static documents: navigation, content
and metadata remain available without JavaScript.

## Structure

- `templates/site-shell.html` — canonical document shell and metadata fields.
- `templates/navigation.html` / `templates/footer.html` — one shared source for site chrome.
- `pages/*.html` — page-specific editable content bodies.
- `pages/site-map.tsv` — output filename, title, description and keywords.
- `css/style.css` — design tokens, components and responsive rules.
- `js/script.js` — optional navigation, filter, lightbox, form and reveal enhancements.
- The shared header includes an accessible light/dark theme control. The site opens in
  the dark (brand) theme until a visitor chooses otherwise; the choice is kept in
  browser local storage.
- The visual style (navy, two-tone white/cyan headings, cyan ring icons, circuit traces,
  "Let’s build your idea" CTA) follows the Eneon service flyers.
- `images/brand/` — optimized logo mark, favicons and social sharing card (generated from `logo/`).
- `logo/` — original Eneon logo source files (not loaded by the site; too large for web use).
- Project, product and page photos/videos are **not stored in the repo** — they are
  loaded from Cloudinary URLs. See "Images and video (Cloudinary)" below.
- `scripts/` — generation and cache-version utilities.

## Local preview

First generate pages, then serve the project root:

```bash
./scripts/build.sh
python3 -m http.server 8000
```

Open http://localhost:8000. Direct URLs such as
http://localhost:8000/services.html work without visiting the home page first.

## Authoring and build workflow

Edit page content in `pages/`, shared navigation in
`templates/navigation.html`, shared footer in `templates/footer.html`, and the
document shell in `templates/site-shell.html`.

Run:

```bash
./scripts/build-pages.sh
```

This validates the source files and writes the generated root pages. It never
uses root HTML as source content, so page-specific bodies are safe from being
overwritten. Update a page title, description or keywords in `pages/site-map.tsv`.

For a full build, including an updated static cache version:

```bash
./scripts/build.sh
```

To only replace the CSS/JavaScript cache version in generated pages:

```bash
./scripts/cache-buster.sh
```

The cache script replaces the existing `?v=` value; it does not append duplicate
query parameters. To use a staging or production canonical domain while building:

```bash
ENEON_SITE_URL=https://your-domain.example ./scripts/build-pages.sh
```

## Images and video (Cloudinary)

All content media lives in Cloudinary. Upload a file in the Cloudinary console, copy its
delivery URL (e.g. `https://res.cloudinary.com/<cloud>/image/upload/v1712/eneon/projects/meter.jpg`)
and paste it straight into the page source in `pages/`.

- **Automatic optimization:** the build inserts `f_auto,q_auto` into every Cloudinary URL that
  doesn't already set a format/quality, so visitors get WebP/AVIF and right-sized quality
  automatically. Set `ENEON_CLOUDINARY_AUTO=0` to turn this off. (Avoid folder names that look
  like transformations, such as `w_photos/`.)
- **Cropping/resizing:** add transformations after `/upload/`, e.g. `c_fill,ar_4:3,w_800/` for
  uniform project thumbnails.
- **Video thumbnails:** take a frame from the video itself by using the same video URL with
  `so_1` (1 second in) and a `.jpg` extension:
  `.../video/upload/so_1,c_fill,ar_4:3,w_800/v1/eneon/projects/demo.jpg`. The lightbox does
  this automatically when a video has no `data-lightbox-poster`.

Ready-to-copy templates are in HTML comments in the page sources (comments are stripped
from the published pages):

- `pages/projects.html` — image and video project cards (the "case studies in preparation"
  panel and filter buttons switch automatically once a card exists).
- `pages/products.html` — product card.
- `pages/services.html` — an optional wide banner photo for each of the seven services
  (one commented `<figure>` line per service; use clean photos without text).
- `pages/index.html` — optional autoplaying showreel video.
- `pages/about.html` — optional team/workspace photo.

Use meaningful alt text and keep autoplay video short and muted. Only publish client names,
project details and media after appropriate approval.

## Contact form

The enquiry form works without a backend: it opens the visitor's email app with the enquiry
pre-filled and addressed to `data-mailto`. To receive submissions directly, create a form on a
service such as Formspree and paste its endpoint into `data-endpoint` in `pages/contact.html`,
then update `pages/privacy.html`.

## Branding and deployment

Brand colors are CSS variables at the start of `css/style.css`, taken from the logo
(navy `#003D92`, blue `#068CE3`, cyan `#0DBDF1`). The web logo files in `images/brand/` are
generated from `logo/eneon_logo_no_text.svg`; regenerate them if the logo changes.

Upload the generated root HTML files plus `favicon.ico`, `css/`, `js/`, `images/`,
`robots.txt` and `sitemap.xml` to GitHub Pages, Netlify, Vercel,
Cloudflare Pages or a normal web server. The source folders can be deployed too,
but are not required by the browser. Configure a host 404 rule to serve
`404.html` where supported.

Before launch, confirm the contact email, review the privacy page against actual
data handling, set the production canonical domain, and validate the generated
site with your preferred HTML/accessibility checker.
