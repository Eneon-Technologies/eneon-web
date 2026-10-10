# Eneon content admin (Render app)

A small Node.js web app for editing the website content. Content is saved as `content/*.json`
files in the website's GitHub repository; every save triggers the "Build site" GitHub Action, so
the live site updates within a few minutes. The admin's own data is stored in **MongoDB Atlas**.

- **Sign-in:** Google, emailed sign-in links (via Brevo), or email + password.
- **Team:** owners add and remove people under **Team** (stored in MongoDB).
- **Activity:** owners see who saved, created or deleted what, and recent sign-ins (kept a year).
- **Uploads:** photos and videos go straight to Cloudinary using **signed** uploads (the Cloudinary
  secret stays on the server).
- **No silent overwrites:** if an item was saved by someone else since you opened it, your save is
  refused with a "reload" message instead of overwriting their change.
- Every save is a GitHub commit authored by the person who made it.
- **Logins are JWTs** (HS256, via the `jose` library) in an HttpOnly cookie. Each token type —
  login, emailed link, Google sign-in check — has its own audience, so one can't be used as another.
- The sections and fields editors see are defined in [`schema.yml`](schema.yml).

### What's stored where

| Data | Where |
| --- | --- |
| Website content (projects, services, products, pages, settings) | GitHub repository, `content/*.json` |
| Team (emails, names, roles, password hashes) | MongoDB `users` |
| Used emailed sign-in links (each works once) | MongoDB `login_links` (auto-deleted after expiry) |
| Sign-in attempt limits | MongoDB `rate_limits` (auto-deleted) |
| Activity log | MongoDB `activity` (auto-deleted after a year) |
| Website analytics (anonymous visits and actions) | MongoDB `analytics_views`, `analytics_events`, `analytics_salts` (auto-deleted after `ANALYTICS_RETENTION_DAYS`, default 2 years) |

## MongoDB Atlas

1. In [MongoDB Atlas](https://cloud.mongodb.com), create a cluster (the free **M0** tier is plenty)
   in a region near Render's (e.g. *Frankfurt* if Render runs in Frankfurt).
2. **Database Access → Add New Database User:** password authentication, a strong generated
   password, role **Read and write to any database** (or restrict it to the `eneon_webadmin` database).
3. **Network Access → Add IP Address:** Render's outgoing addresses change, so allow
   `0.0.0.0/0` (access is still protected by the database user's password), or add your Render
   service's outbound IP addresses if your plan has fixed ones.
4. **Connect → Drivers → Node.js:** copy the connection string, replace `<password>` with the
   user's password, and put it in `MONGODB_URI`. The database (default name `eneon_webadmin`) and its
   collections are created automatically on first start.

## Deploy on Render

1. **New → Web Service**, connect the `Eneon-Technologies/eneon-web` repository.
2. Settings:
   | Setting         | Value               |
   | --------------- | ------------------- |
   | Root Directory  | `admin-app`         |
   | Runtime         | Node                |
   | Build Command   | `npm install`       |
   | Start Command   | `node server.js`    |
   | Health Check    | `/health`           |
3. Add the environment variables below, deploy, then (optionally) add a custom domain such as
   `admin.eneontechnologies.com` and set `PUBLIC_URL` to it.

Render's free plan sleeps after ~15 minutes without visits, so the first visit afterwards takes
up to a minute. A paid instance stays awake.

### Environment variables

| Variable | Required | What it is |
| --- | --- | --- |
| `JWT_SECRET` | yes | At least 32 random characters (e.g. `openssl rand -hex 32`). Signs the login JWTs and emailed links. Changing it signs everyone out. The older name `SESSION_SECRET` also works. |
| `MONGODB_URI` | yes | Your MongoDB Atlas connection string (see above). |
| `MONGODB_DB` | optional | Database name, default `eneon_webadmin`. |
| `PUBLIC_URL` | yes | The app's address, e.g. `https://admin.eneontechnologies.com` (no trailing slash). |
| `GITHUB_TOKEN` | yes | GitHub *fine-grained* token for `Eneon-Technologies/eneon-web` with **Contents: Read and write**. |
| `OWNER_EMAILS` | yes | Comma-separated emails that are always owners (e.g. yours). |
| `OWNER_INITIAL_PASSWORD` | optional | Lets an owner sign in with a password the first time (they're asked to set their own). Remove it afterwards. |
| `GITHUB_REPO` / `GITHUB_BRANCH` | optional | Default `Eneon-Technologies/eneon-web` / `master`. |
| `SITE_URL` | optional | Default `https://eneontechnologies.com` (for "View on website" links). |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | for Google sign-in | See below. |
| `BREVO_API_KEY`, `MAIL_FROM` | for emailed links & password resets | See below. |
| `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | for uploads | Cloudinary → Settings → API Keys. |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_FOLDER` | optional | Default `sdsdnsle` / `eneon`. |
| `ANALYTICS_TIMEZONE` | optional | Time zone for days and hours in Analytics. Default `Africa/Lagos`. |
| `ANALYTICS_RETENTION_DAYS` | optional | How long visit data is kept. Default `730` (two years). |
| `ANALYTICS_ORIGINS` | optional | Extra website addresses allowed to send visits (comma-separated), besides `SITE_URL`. |

Sign-in methods appear automatically when their variables are set; password sign-in is always on.

### Google sign-in

1. In [Google Cloud Console](https://console.cloud.google.com/) create a project, then
   *APIs & Services → OAuth consent screen* (External, app name "Eneon Admin").
2. *Credentials → Create credentials → OAuth client ID* → **Web application**.
   Authorised redirect URI: `<PUBLIC_URL>/auth/google/callback`.
3. Put the client ID and secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

Only people on the team (or in `OWNER_EMAILS`) can get in — signing in with any other Google
account shows "isn't on the team".

### Emailed sign-in links (Brevo)

1. In [Brevo](https://www.brevo.com), go to *Senders, Domains & Dedicated IPs → Domains*, add
   `eneontechnologies.com` and add the DNS records it shows (DKIM, DMARC), so emails aren't marked
   as spam. Then add the sender address you'll use (e.g. `admin@eneontechnologies.com`).
2. *SMTP & API → API Keys → Generate a new API key* → put it in `BREVO_API_KEY`.
3. Set `MAIL_FROM` to that sender, e.g. `Eneon Admin <admin@eneontechnologies.com>`.

Links work once and expire after 20 minutes.

## Website analytics

Owners see **Analytics** in the menu: visitors, visits, page views, time on page, how far people
scroll, where they came from (search, social, AI assistants, other sites, campaign links), countries,
devices and browsers, every page, project, product and service, and the actions that matter —
WhatsApp, phone and email taps, enquiry forms, gallery photos and videos opened. A CSV export is
included.

To switch it on, open **Analytics → Connect the website** once. That saves this admin's address
(`PUBLIC_URL`) as `analytics_url` in `content/settings.json`; the site rebuilds and its script starts
sending visits to `<PUBLIC_URL>/e`. Visits are anonymous: no cookies, no IP addresses stored; a
visitor is counted with a hash that changes daily. Visits are accepted only from `SITE_URL` (and
its `www.` twin), so set `SITE_URL` correctly. Country comes from Cloudflare's `CF-IPCountry` header if the admin is
behind Cloudflare, otherwise from the visitor's time zone.

On Render's free plan the service sleeps when idle; the first visit after a sleep wakes it, so a
visit or two can be missed while it starts. A paid instance (or any always-on host) avoids that.

To stop counting your own visits, open the website once per browser with `?analytics=off`
(`?analytics=on` to undo).

## First sign-in

Sign in with Google or an emailed link using an `OWNER_EMAILS` address — or, if neither is set up
yet, with that email and `OWNER_INITIAL_PASSWORD`. Then add your staff under **Team**.

## Local development

```bash
cd admin-app
npm install
cp .env.example .env      # fill it in; CONTENT_BACKEND=local edits local files, and without
                          # MONGODB_URI an in-memory database is used (lost on restart)
node server.js            # loads .env automatically
```

Open http://localhost:3000. In local mode changes are written to the files in this checkout
(not GitHub) and emailed links are printed in the terminal. `.env.example` lists and explains every
setting. The app loads `admin-app/.env` automatically when it exists (like `dotenv.config()`, but
built into Node), and real environment variables take priority over it. `.env` is git-ignored, so
secrets never get committed. On Render, enter the settings in the Environment tab (its
"Add from .env" option accepts this file's contents).

## Running elsewhere

It's a plain Node.js (20+) app with one dependency, so it runs on any Node host or as a container
(`docker build -t eneon-admin admin-app && docker run -p 3000:3000 --env-file admin-app/.env eneon-admin`).
