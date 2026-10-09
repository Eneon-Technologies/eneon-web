// Eneon Technologies content admin — a small Node.js web service (deploy on Render or any Node host).
// It edits the same content/*.json files as Decap CMS (/admin/ on the website), through GitHub.
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { APP_DIR, config, features } from './lib/config.mjs';
import {
  clearSessionCookie, clearStateCookie, currentUser, escapeHtml, googleFinish, googleStart, passwordLogin,
  rateLimit, sendSignInLink, sessionCookie, useSignInLink
} from './lib/auth.mjs';
import { entryPath, fillTemplate, getCollection, loadSchema, slugFor } from './lib/schema.mjs';
import { ConflictError, NotFoundError, store } from './lib/store.mjs';
import { listUsers, normaliseEmail, removeUser, setPassword, upsertUser } from './lib/users.mjs';

const PUBLIC_DIR = path.join(APP_DIR, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png' };
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(self "https://upload-widget.cloudinary.com"), microphone=(), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' https://upload-widget.cloudinary.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "media-src https:",
    "connect-src 'self' https://*.cloudinary.com",
    "frame-src https://upload-widget.cloudinary.com https://*.cloudinary.com",
    "form-action 'self'",
    "base-uri 'none'",
    "frame-ancestors 'none'"
  ].join('; ')
};

// ---------------------------------------------------------------- helpers

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(status, { ...SECURITY_HEADERS, 'Cache-Control': 'no-store', ...(isJson ? { 'Content-Type': 'application/json; charset=utf-8' } : {}), ...headers });
  res.end(isJson ? JSON.stringify(body) : body);
}
const redirect = (res, location, headers = {}) => send(res, 302, '', { Location: location, ...headers });

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2 * 1024 * 1024) throw Object.assign(new Error('Request too large.'), { status: 413 });
    chunks.push(chunk);
  }
  try { return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}; }
  catch { throw Object.assign(new Error('Invalid request.'), { status: 400 }); }
}

async function serveFile(res, file, extraHeaders = {}) {
  const resolved = path.join(PUBLIC_DIR, file);
  if (!resolved.startsWith(PUBLIC_DIR + path.sep)) return send(res, 404, { error: 'Not found.' });
  try {
    const body = await readFile(resolved);
    send(res, 200, body, { 'Content-Type': TYPES[path.extname(resolved)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ...extraHeaders });
  } catch {
    send(res, 404, { error: 'Not found.' });
  }
}

const clientIp = req => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
const commitMessage = (action, label, user) => `${action} ${label} - ${user.author.name} <${user.email}> via Eneon Admin`;
const json = data => JSON.stringify(data, null, 2) + '\n';

// ---------------------------------------------------------------- routes

async function handle(req, res) {
  const url = new URL(req.url, config.publicUrl);
  const { pathname } = url;
  const method = req.method;

  // Static assets and pages
  if (method === 'GET' && pathname.startsWith('/static/')) return serveFile(res, pathname.slice('/static/'.length));
  if (method === 'GET' && pathname === '/health') return send(res, 200, { ok: true, backend: store.backend });
  if (method === 'GET' && pathname === '/login') return serveFile(res, 'login.html');
  if (method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    if (!(await currentUser(req))) return redirect(res, '/login');
    return serveFile(res, 'app.html');
  }

  // ------------------------------------------------ sign-in
  if (pathname === '/auth/options' && method === 'GET') return send(res, 200, { google: features.google, emailLink: features.emailLink, password: features.password });

  if (pathname === '/auth/password' && method === 'POST') {
    const { email, password } = await readJson(req);
    if (!rateLimit(`pw:${clientIp(req)}`, 10, 15 * 60_000) || !rateLimit(`pw:${normaliseEmail(email)}`, 8, 15 * 60_000)) {
      return send(res, 429, { error: 'Too many attempts. Please wait 15 minutes and try again.' });
    }
    const user = await passwordLogin(email, String(password || ''));
    if (!user) return send(res, 401, { error: 'That email and password don’t match an account.' });
    return send(res, 200, { ok: true, mustSetPassword: !user.passwordHash }, { 'Set-Cookie': sessionCookie(user.email) });
  }

  if (pathname === '/auth/link' && method === 'POST') {
    if (!features.emailLink) return send(res, 503, { error: 'Email sign-in is not set up on this server.' });
    const { email, purpose } = await readJson(req);
    if (!rateLimit(`link:${clientIp(req)}`, 8, 60 * 60_000) || !rateLimit(`link:${normaliseEmail(email)}`, 4, 60 * 60_000)) {
      return send(res, 429, { error: 'Too many emails requested. Please wait a while and try again.' });
    }
    await sendSignInLink(email, purpose === 'reset' ? 'reset' : 'sign-in');
    return send(res, 200, { ok: true, message: 'If that email is on the team, a link is on its way. Check your inbox (and spam folder).' });
  }

  if (pathname === '/auth/link' && method === 'GET') {
    const result = await useSignInLink(url.searchParams.get('token'));
    if (!result) return redirect(res, '/login?error=' + encodeURIComponent('That link has expired or was already used. Request a new one.'));
    return redirect(res, result.purpose === 'reset' ? '/#/account?reset=1' : '/', { 'Set-Cookie': sessionCookie(result.user.email) });
  }

  if (pathname === '/auth/google' && method === 'GET') {
    const start = googleStart();
    if (!start) return redirect(res, '/login?error=' + encodeURIComponent('Google sign-in is not set up on this server.'));
    return redirect(res, start.url, { 'Set-Cookie': start.stateCookie });
  }

  if (pathname === '/auth/google/callback' && method === 'GET') {
    try {
      const { user, email } = await googleFinish(req, Object.fromEntries(url.searchParams));
      if (!user) return redirect(res, '/login?error=' + encodeURIComponent(`${email} isn’t on the team. Ask an owner to add you.`), { 'Set-Cookie': clearStateCookie() });
      return redirect(res, '/', { 'Set-Cookie': [sessionCookie(user.email), clearStateCookie()] });
    } catch (error) {
      return redirect(res, '/login?error=' + encodeURIComponent(error.message), { 'Set-Cookie': clearStateCookie() });
    }
  }

  if (pathname === '/auth/logout' && method === 'POST') return send(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie() });

  // ------------------------------------------------ API (signed in only)
  if (!pathname.startsWith('/api/')) return send(res, 404, '<h1>Not found</h1>', { 'Content-Type': 'text/html; charset=utf-8' });
  // A custom header can't be sent cross-site without CORS permission, which blocks request forgery.
  if (method !== 'GET' && req.headers['x-eneon-admin'] !== '1') return send(res, 403, { error: 'Forbidden.' });
  const user = await currentUser(req);
  if (!user) return send(res, 401, { error: 'Please sign in again.' });
  const ownerOnly = () => { if (user.role !== 'owner') throw Object.assign(new Error('Only owners can manage the team.'), { status: 403 }); };

  if (pathname === '/api/me' && method === 'GET') {
    return send(res, 200, {
      email: user.email, name: user.name || '', role: user.role, hasPassword: Boolean(user.passwordHash),
      features, siteUrl: config.siteUrl, backend: store.backend,
      cloudinary: { cloudName: config.cloudinary.cloudName, apiKey: config.cloudinary.apiKey, folder: config.cloudinary.folder }
    });
  }

  if (pathname === '/api/schema' && method === 'GET') return send(res, 200, await loadSchema());

  // /api/collections/:name[/entries[/:id]]
  const match = pathname.match(/^\/api\/collections\/([a-z0-9_-]+)(?:\/entries(?:\/([a-z0-9_-]+))?)?$/i);
  if (match) {
    const collection = await getCollection(match[1]);
    const id = match[2];
    const hasEntries = pathname.includes('/entries');

    if (!hasEntries && method === 'GET') {
      if (collection.type === 'files') {
        return send(res, 200, { entries: collection.files.map(file => ({ id: file.name, label: file.label, description: file.description })) });
      }
      const files = await store.list(collection.folder);
      const entries = await Promise.all(files.map(async file => {
        const { content } = await store.readCached(file.path, file.sha);
        let data = {};
        try { data = JSON.parse(content); } catch { /* shown with its file name */ }
        return {
          id: file.name.replace(/\.json$/, ''),
          sha: file.sha,
          label: fillTemplate(collection.summary, data).replace(/^[\s—–-]+|[\s—–-]+$/g, '') || data[collection.identifierField] || file.name,
          data
        };
      }));
      return send(res, 200, { entries });
    }

    if (hasEntries && id && method === 'GET') {
      const { content, sha } = await store.read(entryPath(collection, id));
      return send(res, 200, { id, sha, data: JSON.parse(content) });
    }

    if (hasEntries && id && method === 'PUT') {
      const { data, sha } = await readJson(req);
      if (!data || typeof data !== 'object' || Array.isArray(data)) return send(res, 400, { error: 'Nothing to save.' });
      if (!sha) return send(res, 400, { error: 'Missing version information. Reload and try again.' });
      const file = entryPath(collection, id);
      const result = await store.write(file, json(data), { sha, message: commitMessage('Update', `${collection.name} “${id}”`, user), author: user.author });
      return send(res, 200, { id, sha: result.sha });
    }

    if (hasEntries && !id && method === 'POST') {
      if (collection.type !== 'folder' || !collection.create) return send(res, 400, { error: 'New items can’t be added here.' });
      const { data } = await readJson(req);
      if (!data || typeof data !== 'object' || Array.isArray(data)) return send(res, 400, { error: 'Nothing to save.' });
      const newId = slugFor(collection, data);
      if (!newId) return send(res, 400, { error: `Fill in the ${collection.identifierField} first.` });
      try {
        const result = await store.write(entryPath(collection, newId), json(data), { message: commitMessage('Create', `${collection.name} “${newId}”`, user), author: user.author });
        return send(res, 201, { id: newId, sha: result.sha });
      } catch (error) {
        if (error instanceof ConflictError) return send(res, 409, { error: `An item called “${newId}” already exists. Change the name and try again.` });
        throw error;
      }
    }

    if (hasEntries && id && method === 'DELETE') {
      if (collection.type !== 'folder' || !collection.remove) return send(res, 400, { error: 'This can’t be deleted.' });
      const sha = url.searchParams.get('sha');
      if (!sha) return send(res, 400, { error: 'Missing version information. Reload and try again.' });
      await store.remove(entryPath(collection, id), { sha, message: commitMessage('Delete', `${collection.name} “${id}”`, user), author: user.author });
      return send(res, 200, { ok: true });
    }
  }

  // ------------------------------------------------ account & team
  if (pathname === '/api/account/password' && method === 'POST') {
    const { password } = await readJson(req);
    await setPassword(user.email, password, user);
    return send(res, 200, { ok: true });
  }
  if (pathname === '/api/account/name' && method === 'POST') {
    const { name } = await readJson(req);
    await upsertUser(user.email, { name: String(name || '').slice(0, 80) }, user);
    return send(res, 200, { ok: true });
  }
  if (pathname === '/api/team' && method === 'GET') { ownerOnly(); return send(res, 200, { users: await listUsers() }); }
  if (pathname === '/api/team' && method === 'POST') {
    ownerOnly();
    const { email, name, role } = await readJson(req);
    const saved = await upsertUser(email, { name: String(name || '').slice(0, 80), role: role === 'owner' ? 'owner' : 'editor' }, user);
    return send(res, 200, { ok: true, email: saved.email });
  }
  const teamMatch = pathname.match(/^\/api\/team\/([^/]+)(\/password)?$/);
  if (teamMatch && method === 'DELETE' && !teamMatch[2]) {
    ownerOnly();
    const email = decodeURIComponent(teamMatch[1]);
    if (normaliseEmail(email) === user.email) return send(res, 400, { error: 'You can’t remove yourself.' });
    await removeUser(email, user);
    return send(res, 200, { ok: true });
  }
  if (teamMatch && method === 'POST' && teamMatch[2]) {
    ownerOnly();
    const { password } = await readJson(req);
    await setPassword(decodeURIComponent(teamMatch[1]), password, user);
    return send(res, 200, { ok: true });
  }

  // ------------------------------------------------ Cloudinary signed uploads
  if (pathname === '/api/cloudinary/sign' && method === 'POST') {
    if (!features.uploads) return send(res, 503, { error: 'Uploads are not set up on this server.' });
    const { params = {} } = await readJson(req);
    const folder = String(params.folder || '');
    if (folder !== config.cloudinary.folder && !folder.startsWith(config.cloudinary.folder + '/')) {
      return send(res, 400, { error: 'Uploads must go to the site folder.' });
    }
    const toSign = Object.keys(params)
      .filter(key => !['file', 'cloud_name', 'resource_type', 'api_key'].includes(key) && params[key] !== '' && params[key] != null)
      .sort()
      .map(key => `${key}=${Array.isArray(params[key]) ? params[key].join(',') : params[key]}`)
      .join('&');
    const signature = createHash('sha1').update(toSign + config.cloudinary.apiSecret).digest('hex');
    return send(res, 200, { signature });
  }

  return send(res, 404, { error: 'Not found.' });
}

// ---------------------------------------------------------------- server

createServer(async (req, res) => {
  try {
    await handle(req, res);
  } catch (error) {
    const status = error.status || (error instanceof ConflictError ? 409 : error instanceof NotFoundError ? 404 : 500);
    if (status >= 500) console.error(error);
    if (!res.headersSent) {
      const message = status >= 500 && !error.status ? 'Something went wrong on the server. Please try again.' : error.message;
      if ((req.headers.accept || '').includes('text/html') && !req.url.startsWith('/api/')) {
        send(res, status, `<!doctype html><meta charset="utf-8"><title>Error</title><p>${escapeHtml(message)}</p><p><a href="/">Back</a></p>`, { 'Content-Type': 'text/html; charset=utf-8' });
      } else {
        send(res, status, { error: message });
      }
    }
  }
}).listen(config.port, () => {
  console.log(`Eneon admin running on ${config.publicUrl} (content: ${store.backend}${store.backend === 'github' ? ` ${config.github.repo}@${config.github.branch}` : ''})`);
  console.log(`Sign-in methods: ${Object.entries(features).filter(([k, v]) => v && k !== 'uploads').map(([k]) => k).join(', ')}; uploads ${features.uploads ? 'on' : 'off'}`);
});
