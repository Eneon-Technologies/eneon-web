// Settings come from environment variables (set them in the Render dashboard).
// See admin-app/README.md for what each one does.
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const env = process.env;
const list = value => String(value || '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean);

export const APP_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const REPO_DIR = path.dirname(APP_DIR);

const localMode = (env.CONTENT_BACKEND || 'github') === 'local';
if (!env.SESSION_SECRET && !localMode) {
  throw new Error('SESSION_SECRET is required (a long random string). See admin-app/README.md.');
}

export const config = {
  port: Number(env.PORT || 3000),
  publicUrl: (env.PUBLIC_URL || `http://localhost:${env.PORT || 3000}`).replace(/\/+$/, ''),
  siteUrl: (env.SITE_URL || 'https://eneontechnologies.com').replace(/\/+$/, ''),
  // Signs session cookies and encrypts the team list. Keep it secret and don't change it once set.
  sessionSecret: env.SESSION_SECRET || randomBytes(32).toString('hex'),
  sessionDays: Number(env.SESSION_DAYS || 14),
  ownerEmails: list(env.OWNER_EMAILS),
  ownerInitialPassword: env.OWNER_INITIAL_PASSWORD || '',

  backend: localMode ? 'local' : 'github',
  github: {
    token: env.GITHUB_TOKEN || '',
    repo: env.GITHUB_REPO || 'Eneon-Technologies/eneon-web',
    branch: env.GITHUB_BRANCH || 'master'
  },

  google: {
    clientId: env.GOOGLE_CLIENT_ID || '',
    clientSecret: env.GOOGLE_CLIENT_SECRET || ''
  },
  mail: {
    brevoApiKey: env.BREVO_API_KEY || '',
    from: env.MAIL_FROM || 'Eneon Admin <admin@eneontechnologies.com>'
  },
  cloudinary: {
    cloudName: env.CLOUDINARY_CLOUD_NAME || 'sdsdnsle',
    apiKey: env.CLOUDINARY_API_KEY || '',
    apiSecret: env.CLOUDINARY_API_SECRET || '',
    folder: env.CLOUDINARY_FOLDER || 'eneon'
  },

  // Paths inside the repository.
  decapConfigPath: 'admin/config.yml',
  usersPath: 'admin-app/data/users.enc'
};

export const features = {
  google: Boolean(config.google.clientId && config.google.clientSecret),
  // In local mode, emails are printed to the terminal instead of sent.
  emailLink: Boolean(config.mail.brevoApiKey) || localMode,
  password: true,
  uploads: Boolean(config.cloudinary.apiKey && config.cloudinary.apiSecret)
};

if (config.backend === 'github' && !config.github.token) {
  throw new Error('GITHUB_TOKEN is required to read and save content. See admin-app/README.md.');
}
