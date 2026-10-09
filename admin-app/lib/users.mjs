// The team list: who may sign in, their role, and (optionally) a password hash.
// Stored as admin-app/data/users.enc in the repository, encrypted with AES-256-GCM using a key
// derived from SESSION_SECRET — readable only by this app, even though the repository is shared.
// Emails in OWNER_EMAILS are always owners, so the app can't lock its owner out.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { config } from './config.mjs';
import { NotFoundError, store } from './store.mjs';

const scrypt = promisify(scryptCb);
const KEY = Buffer.from(hkdfSync('sha256', config.sessionSecret, 'eneon-admin', 'users-file-v1', 32));

function encrypt(data) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${body.toString('base64')}\n`;
}
function decrypt(text) {
  const [version, iv, tag, body] = text.trim().split('.');
  if (version !== 'v1') throw new Error('Unknown users file format.');
  const decipher = createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8'));
}

// ---------------------------------------------------------------- passwords

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}
export async function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, salt, hash] = stored.split('$');
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(actual, expected);
}
export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 10) return 'Use at least 10 characters.';
  if (password.length > 200) return 'That password is too long.';
  return null;
}

// ---------------------------------------------------------------- team list

let cache = null; // { users, sha, loadedAt }
const CACHE_MS = 30_000;

export const normaliseEmail = email => String(email || '').trim().toLowerCase();

async function load(force = false) {
  if (!force && cache && Date.now() - cache.loadedAt < CACHE_MS) return cache;
  try {
    const { content, sha } = await store.read(config.usersPath);
    cache = { users: decrypt(content).users || [], sha, loadedAt: Date.now() };
  } catch (error) {
    if (!(error instanceof NotFoundError)) {
      if (/unable to authenticate|Unsupported state/i.test(error.message)) {
        throw new Error('The team list could not be decrypted — SESSION_SECRET has changed. Owners in OWNER_EMAILS can still sign in and re-add the team.');
      }
      throw error;
    }
    cache = { users: [], sha: undefined, loadedAt: Date.now() };
  }
  return cache;
}

async function save(users, message, author) {
  const current = await load(true);
  const result = await store.write(config.usersPath, encrypt({ users }), { sha: current.sha, message, author });
  cache = { users, sha: result.sha, loadedAt: Date.now() };
}

// A person who may sign in: from the team list, or an owner listed in OWNER_EMAILS.
export async function findUser(email) {
  email = normaliseEmail(email);
  if (!email) return null;
  const { users } = await load().catch(error => {
    if (config.ownerEmails.includes(email)) return { users: [] };
    throw error;
  });
  const user = users.find(item => item.email === email);
  if (config.ownerEmails.includes(email)) return { name: '', ...user, email, role: 'owner', builtInOwner: true };
  return user ? { ...user } : null;
}

export async function listUsers() {
  const { users } = await load(true);
  const byEmail = new Map(users.map(user => [user.email, { ...user }]));
  for (const email of config.ownerEmails) byEmail.set(email, { name: '', ...byEmail.get(email), email, role: 'owner', builtInOwner: true });
  return [...byEmail.values()]
    .map(({ passwordHash, ...user }) => ({ ...user, hasPassword: Boolean(passwordHash) }))
    .sort((a, b) => (a.role === b.role ? a.email.localeCompare(b.email) : a.role === 'owner' ? -1 : 1));
}

export async function upsertUser(email, changes, actor) {
  email = normaliseEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error('Enter a valid email address.'), { status: 400 });
  const { users } = await load(true);
  const next = users.filter(user => user.email !== email);
  const existing = users.find(user => user.email === email) || { email, role: 'editor', addedAt: new Date().toISOString() };
  const updated = { ...existing, ...changes, email };
  if (!['owner', 'editor'].includes(updated.role)) updated.role = 'editor';
  next.push(updated);
  await save(next, `Admin team: update ${email} (by ${actor.email})`, actor.author);
  return updated;
}

export async function removeUser(email, actor) {
  email = normaliseEmail(email);
  if (config.ownerEmails.includes(email)) throw Object.assign(new Error('This owner is set in OWNER_EMAILS on the server and can only be removed there.'), { status: 400 });
  const { users } = await load(true);
  await save(users.filter(user => user.email !== email), `Admin team: remove ${email} (by ${actor.email})`, actor.author);
}

export async function setPassword(email, password, actor) {
  const problem = validatePassword(password);
  if (problem) throw Object.assign(new Error(problem), { status: 400 });
  await upsertUser(email, { passwordHash: await hashPassword(password), passwordSetAt: new Date().toISOString() }, actor);
}
