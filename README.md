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
- The shared header includes an accessible light/dark theme control. It follows the
  visitor's system preference until they choose a theme, then retains that choice
  in browser local storage.
- `images/` — logo and clearly labelled SVG placeholders.
- `videos/projects/` — destination for approved compressed project video.
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

## Adding an approved project

1. Add optimized images under `images/projects/` and optional MP4/WebM under
   `videos/projects/`.
2. Add an accessible project card to `pages/projects.html`.
3. Set its real category in `data-category`, plus lightbox media attributes.
4. Add a project detail source page and manifest row if the project needs a
   dedicated public page, then rebuild.

Use meaningful alt text, a poster image and `preload="metadata"` for video. Do
not add client/project claims before approval. See `projects/README.md`.

## Adding a product

When a real product is ready, replace a placeholder in `pages/products.html`.
For a detail page, create `products/product-name.html` from the documented
structure in `products/README.md`, including verified feature, support and
documentation information. Do not present a product as available until it is.

## Branding and deployment

Brand colors are CSS variables at the start of `css/style.css`. The logo is in
`images/logo/`; replace it only with the approved Eneon mark while preserving
accessible image behavior. The placeholder SVGs explicitly identify themselves
and should be replaced by approved project/product media.

Upload the generated root HTML files plus `css/`, `js/`, `images/`,
`videos/`, `robots.txt` and `sitemap.xml` to GitHub Pages, Netlify, Vercel,
Cloudflare Pages or a normal web server. The source folders can be deployed too,
but are not required by the browser. Configure a host 404 rule to serve
`404.html` where supported.

Before launch, replace contact details, review the privacy page against actual
data handling, set the production canonical domain, and validate the generated
site with your preferred HTML/accessibility checker.
