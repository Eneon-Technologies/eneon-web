# Eneon Technologies website

A fast, framework-free static website with a content admin at **`/admin/`**. Staff edit projects,
products, services, page text and contact details in the browser; every save rebuilds the static
pages automatically. The published files are plain HTML in folders, so the site can be hosted
anywhere (Render, Netlify, Cloudflare Pages, Vercel, cPanel/Namecheap…) with no server and no
rewrites.

```
Editor saves in /admin/ ──► content/*.json committed to GitHub
                            ──► "Build site" GitHub Action runs ./scripts/build.sh
                            ──► generated pages committed ──► host deploys them
```

## Editing content (admin)

Open `https://eneontechnologies.com/admin/` and sign in with your email.

| In the admin            | Changes                                                                      |
| ----------------------- | ---------------------------------------------------------------------------- |
| **Projects**            | Project cards on /projects/ and a case-study page per project (`/projects/<name>/`) |
| **Services**            | Sections on /services/, home page service cards, footer links, contact-form options |
| **Products**            | Product cards on /products/                                                  |
| **Pages**               | Text on the home, about, services, projects, products, contact and privacy pages, plus their search titles |
| **Site settings**       | Email, phone, WhatsApp number & greeting, location, tagline, form endpoint  |

- **Highlighted words:** wrap words in `*asterisks*` in a heading to show them in cyan;
  press Enter for a line break.
- **Photos and videos:** "Choose an image" / "Choose a file" opens the Cloudinary uploader
  (no Cloudinary account needed), or use "Insert from URL" to paste an existing Cloudinary link.
  Upload originals — the site crops and resizes them for each place they appear, and videos in a
  gallery get a thumbnail from their own frames.
- **Publishing:** click **Publish → Publish now**. The live site updates once the build and your
  host's deploy finish (usually 1–3 minutes).
- **Hiding without deleting:** turn off **Published** on a project or product.
- **Privacy page:** leave a blank line between paragraphs; email and web addresses become links automatically.

Only publish client names, project details and media with appropriate approval.

### Second admin (Render app)

`admin-app/` is a separate Node.js admin you can host on Render (e.g. at
`admin.eneontechnologies.com`) with Google, emailed-link or password sign-in, its own team list and
signed Cloudinary uploads. It edits the same files with the same fields, so staff can use either
admin. Setup: [admin-app/README.md](admin-app/README.md).

## One-time admin setup

1. **Cloudinary upload preset** — in Cloudinary: *Settings → Upload → Upload presets → Add
   upload preset*. Name it `eneon_cms`, set **Signing mode: Unsigned**, folder `eneon`, and
   restrict formats (jpg, png, webp, heic, mp4, mov, webm) and file size. The cloud name, preset
   and folder are set under `media_library` in `admin/config.yml`.
   *Unsigned* means anyone who finds the preset name could upload to that folder; the format and
   size limits keep that low-risk, and you can rename the preset any time.
2. **DecapBridge (email login)** — sign up at [decapbridge.com](https://decapbridge.com), add a site
   for the GitHub repo `Eneon-Technologies/eneon-web` (branch `master`) using a GitHub fine-grained
   token with *Contents* and *Pull requests* read/write access to that repo, and set the CMS URL to
   `https://eneontechnologies.com/admin/`. Its `backend:` block is already in `admin/config.yml`
   (site `3194e024-…`); keep `branch: master` there and in the DecapBridge site settings. Invite
   staff by email from the DecapBridge dashboard.
3. **GitHub Actions** — in the repo: *Settings → Actions → General → Workflow permissions* →
   **Read and write permissions**, so the "Build site" workflow can commit the generated pages.

## How the site is built

- `content/` — all editable content as JSON (one file per project, service and product; page texts
  in `content/pages/`; contact details in `content/settings.json`). Normally edited via the admin.
- `src/index.html` — the design: shared `<head>`, header and footer, and every page as
  `<div class="page" id="page-…"> … </div><!-- /page-… -->`, with `{{ placeholders }}` for content.
  `page-project` is the template for every case study. Not uploaded to the host (it carries a
  `noindex` tag and `Disallow: /src/` in `robots.txt` in case it is).
- `build-static-pages.mjs` — reads `content/`, fills in `src/index.html`, and writes `index.html`,
  one folder per route (`about/`, `services/`, `projects/<slug>/`, …), `404.html` and
  `sitemap.xml`. It also removes pages of deleted or unpublished projects.
- `scripts/lib/template.mjs` — the small template engine (no dependencies). Syntax:
  `{{ value }}` (escaped), `{{#each list}}…{{/each}}` (with `@n`, `@num`, `@even`…),
  `{{#if value}}…{{else}}…{{/if}}`, and helpers such as `{{ md title }}` (asterisk highlights), `{{ paras text }}` (paragraphs with automatic email/web links),
  `{{ icon "chat" }}`, `{{ cld url "c_fill,w_700" }}`, `{{ tel phone }}`, `{{ wa number message }}`.
- `scripts/cache-buster.sh` — names the CSS/JS files after a hash of their contents
  (`css/style.<hash>.css`) and updates every page, so browsers re-download them only when they change.
- `scripts/build.sh` — runs both; `.github/workflows/build-site.yml` runs it on every push to
  `master` and commits the result.
- `admin/` — the admin page: `config.yml` (fields editors see), `cms.js` (Cloudinary uploader),
  `index.html`.

Generated files (`index.html`, `404.html`, the route folders, `sitemap.xml`) are overwritten on
every build — change `content/` or `src/index.html` instead.

### Developer workflow

```bash
./scripts/build.sh              # build pages + cache-bust CSS/JS
serve .                         # or: python3 -m http.server 8000 (not `serve -s`)
```

To try the admin locally without logging in, run `npx decap-server` in the repo and open
`http://localhost:<port>/admin/` (it edits the local `content/` files directly).

- **Changing the design:** edit `src/index.html`, the current `css/style.<hash>.css` or
  `js/script.<hash>.js`, then build.
- **Adding a field editors can change:** add it to the JSON in `content/`, use it in
  `src/index.html`, and add it to `admin/config.yml`.
- **The 404 page** is the only page edited directly in `src/index.html` (its search title is
  `NOT_FOUND_SEO` in `build-static-pages.mjs`).
- **Links** use the folder URL with a trailing slash (`/projects/`, `/services/#pcb`); asset paths
  are root-absolute, so the site must be served from the root of its domain.

## Images and video (Cloudinary)

All media lives in Cloudinary. The build adds `f_auto,q_auto` (modern formats, right-sized
quality) to every Cloudinary URL, and per-use sizes and crops: e.g. 4:3 project cards, 4:5 or 4:3
gallery tiles, 1600px viewer images, 720p videos and 1200×630 link-preview images. A URL that
already contains a transformation (e.g. a custom `c_crop`) is used exactly as given.

## Contact form

With no form endpoint set (Site settings), the enquiry form opens the visitor's email app with
the enquiry pre-filled. To receive submissions directly, create a form on a service such as
Formspree, paste its URL into **Form endpoint**, and update the privacy notice.

## Branding

Brand colors are CSS variables at the start of the stylesheet (navy `#003D92`, blue `#068CE3`,
cyan `#0DBDF1`). The web logo files in `images/brand/` and `favicon.ico` are generated from
`logo/eneon_logo_no_text.svg`:

```bash
./scripts/generate-brand-assets.sh   # logo marks, favicons, Apple icon, social card
./scripts/build.sh
```

It needs `rsvg-convert` and ImageMagick (`sudo apt install librsvg2-bin imagemagick`). Set
`BRAND_OUT_DIR=/some/dir` to preview the output without replacing the live files.

## Hosting

Deploy the repository root as a static site with **no build command** (the GitHub Action has
already built it). Files the browser needs: `index.html`, `404.html`, the route folders,
`admin/`, `favicon.ico`, `css/`, `js/`, `images/`, `robots.txt`, `sitemap.xml`. Not needed:
`src/`, `content/`, `scripts/`, `logo/`, `build-static-pages.mjs`. For the branded 404 page on
Apache/cPanel hosting, add `ErrorDocument 404 /404.html` to `.htaccess`.

For a host that can't pull from GitHub (e.g. FTP upload), download the repository after the
"Build site" action finishes and upload those files.
