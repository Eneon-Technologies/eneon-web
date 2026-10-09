// Collections and fields come from Decap's admin/config.yml, so both admins always offer the same
// fields. It is read from the repository (cached briefly), so a config change applies to both
// without redeploying this app.
import { parse } from 'yaml';
import { config } from './config.mjs';
import { store } from './store.mjs';

let cached = null;
const CACHE_MS = 60_000;

export async function loadSchema() {
  if (cached && Date.now() - cached.loadedAt < CACHE_MS) return cached.schema;
  const { content } = await store.read(config.decapConfigPath);
  const decap = parse(content, { merge: true, maxAliasCount: -1 });
  const collections = (decap.collections || []).map(collection => {
    const base = {
      name: collection.name,
      label: collection.label || collection.name,
      labelSingular: collection.label_singular || collection.label || collection.name,
      description: collection.description || ''
    };
    if (collection.folder) {
      return {
        ...base,
        type: 'folder',
        folder: collection.folder.replace(/\/+$/, ''),
        create: collection.create !== false,
        remove: collection.delete !== false,
        slug: collection.slug || '{{slug}}',
        identifierField: collection.identifier_field || 'title',
        summary: collection.summary || '',
        sortableFields: collection.sortable_fields || [],
        fields: collection.fields || []
      };
    }
    return {
      ...base,
      type: 'files',
      files: (collection.files || []).map(file => ({ name: file.name, label: file.label || file.name, file: file.file, description: file.description || '', fields: file.fields || [] }))
    };
  });
  const schema = { collections, siteUrl: decap.site_url || config.siteUrl };
  cached = { schema, loadedAt: Date.now() };
  return schema;
}

export async function getCollection(name) {
  const collection = (await loadSchema()).collections.find(item => item.name === name);
  if (!collection) throw Object.assign(new Error(`Unknown section "${name}".`), { status: 404 });
  return collection;
}

// The file behind an entry, checked against the configuration (never a path from the browser).
export function entryPath(collection, id) {
  if (collection.type === 'files') {
    const file = collection.files.find(item => item.name === id);
    if (!file) throw Object.assign(new Error('Unknown page.'), { status: 404 });
    return file.file;
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(String(id))) throw Object.assign(new Error('Invalid item name.'), { status: 400 });
  return `${collection.folder}/${id}.json`;
}

export const slugify = text => String(text || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

// Decap-style templates: "{{name}}", "{{anchor}}", "{{fields.name}}".
export function fillTemplate(template, data, transform = value => value) {
  return String(template || '').replace(/\{\{\s*(?:fields\.)?([\w.]+)\s*\}\}/g, (_, key) =>
    transform(key.split('.').reduce((value, part) => (value == null ? undefined : value[part]), data) ?? ''));
}
export const slugFor = (collection, data) => slugify(fillTemplate(collection.slug, data, slugify)) || slugify(data[collection.identifierField]);
