# Eneon content admin (Render app)

A small Node.js web app for editing the website content. It works **alongside** Decap CMS
(`/admin/` on the website): both edit the same `content/*.json` files in GitHub, use the same fields
(read from `admin/config.yml`), and every save triggers the same "Build site" GitHub Action, so
the live site updates within a few minutes either way.

- **Sign-in:** Google, emailed sign-in links, or email + password.
- **Team:** owners add and remove people under **Team**. The list is stored encrypted in
  `admin-app/data/users.enc` (no database needed).
- **Uploads:** photos and videos go straight to Cloudinary using **signed** uploads (the Cloudinary
  secret stays on the server).
- **Safe with two admins:** if an item was saved elsewhere since you opened it, your save is
  refused with a "reload" message instead of overwriting the other change.
- Every save is a GitHub commit authored by the person who made it.

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
   Under *Build Filters*, add the ignored path `admin-app/data/**` so team changes don't redeploy the app.
3. Add the environment variables below, deploy, then (optionally) add a custom domain such as
   `admin.eneontechnologies.com` and set `PUBLIC_URL` to it.

Render's free plan sleeps after ~15 minutes without visits, so the first visit afterwards takes
up to a minute. A paid instance stays awake.

### Environment variables

| Variable | Required | What it is |
| --- | --- | --- |
| `SESSION_SECRET` | yes | Long random string (e.g. `openssl rand -hex 32`). Signs sign-ins **and encrypts the team list — don't change it** once people are added. |
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

## First sign-in

Sign in with Google or an emailed link using an `OWNER_EMAILS` address — or, if neither is set up
yet, with that email and `OWNER_INITIAL_PASSWORD`. Then add your staff under **Team**.

## Local development

```bash
cd admin-app
npm install
cp .env.example .env      # then fill in .env; set CONTENT_BACKEND=local to edit local files
node --env-file=.env server.js
```

Open http://localhost:3000. In local mode changes are written to the files in this checkout
(not GitHub) and emailed links are printed in the terminal. `.env.example` lists and explains every
setting; `.env` is git-ignored, so secrets never get committed. (On Render, enter the same settings
in the Environment tab instead of using a file.)

## Running elsewhere

It's a plain Node.js (20+) app with one dependency, so it runs on any Node host or as a container
(`docker build -t eneon-admin admin-app && docker run -p 3000:3000 --env-file admin-app/.env eneon-admin`).
