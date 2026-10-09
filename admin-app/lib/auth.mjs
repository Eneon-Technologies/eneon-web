// Sign-in: Google, email sign-in links, and email + password. Sessions are signed cookies, so
// the server keeps no session storage and survives restarts.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config, features } from './config.mjs';
import { sendEmail } from './mail.mjs';
import { findUser, normaliseEmail, verifyPassword } from './users.mjs';

const COOKIE = 'eneon_admin';
const STATE_COOKIE = 'eneon_admin_oauth';
const secure = config.publicUrl.startsWith('https://');

// ---------------------------------------------------------------- signed tokens

const sign = text => createHmac('sha256', config.sessionSecret).update(text).digest('base64url');
export function seal(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
}
export function unseal(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, signature] = token.split('.');
  const expected = sign(body);
  if (!signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return payload.exp && payload.exp > Date.now() ? payload : null;
  } catch { return null; }
}

// ---------------------------------------------------------------- cookies

export function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(part => part.trim().split('=')).filter(([k]) => k).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}
function cookie(name, value, maxAgeSeconds) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure ? '; Secure' : ''}`;
}
export const sessionCookie = email => cookie(COOKIE, seal({ email, exp: Date.now() + config.sessionDays * 86400_000, v: 1 }), config.sessionDays * 86400);
export const clearSessionCookie = () => cookie(COOKIE, '', 0);

// The signed-in user for a request (re-checked against the team list, so removing someone
// signs them out within a minute).
export async function currentUser(req) {
  const session = unseal(parseCookies(req.headers.cookie)[COOKIE]);
  if (!session) return null;
  const user = await findUser(session.email);
  if (!user) return null;
  return { ...user, author: { name: user.name || user.email, email: user.email } };
}

// ---------------------------------------------------------------- rate limiting

const attempts = new Map();
export function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter(time => now - time < windowMs);
  recent.push(now);
  attempts.set(key, recent);
  if (attempts.size > 5000) for (const [k, times] of attempts) if (!times.some(t => now - t < windowMs)) attempts.delete(k);
  return recent.length <= limit;
}

// ---------------------------------------------------------------- email + password

export async function passwordLogin(email, password) {
  email = normaliseEmail(email);
  const user = await findUser(email);
  if (!user) return null;
  if (user.passwordHash && await verifyPassword(password, user.passwordHash)) return user;
  // First sign-in for an OWNER_EMAILS owner before they have set a password.
  if (!user.passwordHash && user.builtInOwner && config.ownerInitialPassword && password === config.ownerInitialPassword) return user;
  return null;
}

// ---------------------------------------------------------------- email sign-in links

const usedLinks = new Map(); // nonce → expiry; makes each link single-use (until a restart)

export async function sendSignInLink(email, purpose = 'sign-in') {
  email = normaliseEmail(email);
  const user = await findUser(email);
  if (!user) return; // say nothing: don't reveal who is on the team
  const token = seal({ email, nonce: randomBytes(9).toString('base64url'), purpose, exp: Date.now() + 20 * 60_000 });
  const link = `${config.publicUrl}/auth/link?token=${encodeURIComponent(token)}`;
  const action = purpose === 'reset' ? 'reset your password' : 'sign in';
  await sendEmail({
    to: email,
    subject: purpose === 'reset' ? 'Reset your Eneon admin password' : 'Your Eneon admin sign-in link',
    text: `Hello${user.name ? ' ' + user.name : ''},\n\nUse this link to ${action} to the Eneon Technologies content admin:\n\n${link}\n\nThe link works once and expires in 20 minutes. If you didn't ask for it, you can ignore this email.\n`,
    html: `<p>Hello${user.name ? ' ' + escapeHtml(user.name) : ''},</p><p>Use this button to ${action} to the Eneon Technologies content admin:</p><p><a href="${link}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#0b74e5;color:#fff;text-decoration:none;font-weight:600">${purpose === 'reset' ? 'Reset password' : 'Sign in'}</a></p><p style="color:#64748b;font-size:13px">The link works once and expires in 20 minutes. If you didn't ask for it, you can ignore this email.</p>`
  });
}

export async function useSignInLink(token) {
  const payload = unseal(token);
  if (!payload || !payload.nonce) return null;
  if (usedLinks.has(payload.nonce)) return null;
  usedLinks.set(payload.nonce, payload.exp);
  for (const [nonce, exp] of usedLinks) if (exp < Date.now()) usedLinks.delete(nonce);
  const user = await findUser(payload.email);
  return user ? { user, purpose: payload.purpose } : null;
}

// ---------------------------------------------------------------- Google

export function googleStart() {
  if (!features.google) return null;
  const state = randomBytes(16).toString('base64url');
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: `${config.publicUrl}/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account'
  });
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, stateCookie: cookie(STATE_COOKIE, seal({ state, exp: Date.now() + 10 * 60_000 }), 600) };
}

export async function googleFinish(req, query) {
  const saved = unseal(parseCookies(req.headers.cookie)[STATE_COOKIE]);
  if (!saved || !query.state || saved.state !== query.state) throw Object.assign(new Error('Your sign-in expired. Please try again.'), { status: 400 });
  if (query.error || !query.code) throw Object.assign(new Error('Google sign-in was cancelled.'), { status: 400 });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: query.code,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: `${config.publicUrl}/auth/google/callback`,
      grant_type: 'authorization_code'
    })
  });
  if (!response.ok) throw Object.assign(new Error('Google sign-in failed. Please try again.'), { status: 502 });
  const { id_token: idToken } = await response.json();
  // The ID token came straight from Google over HTTPS in exchange for our secret, so its
  // claims can be read directly; we still check the audience and that the email is verified.
  const claims = JSON.parse(Buffer.from(String(idToken).split('.')[1] || '', 'base64url').toString('utf8'));
  if (claims.aud !== config.google.clientId || !['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss)) {
    throw Object.assign(new Error('Google sign-in could not be verified.'), { status: 400 });
  }
  if (!claims.email_verified) throw Object.assign(new Error('Your Google email address is not verified.'), { status: 403 });
  const user = await findUser(claims.email);
  return { user, email: normaliseEmail(claims.email), name: claims.name || '' };
}
export const clearStateCookie = () => cookie(STATE_COOKIE, '', 0);

export const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
