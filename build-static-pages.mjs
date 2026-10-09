import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { compile, helpers, cloudinary, isVideo, videoFrame, Safe } from './scripts/lib/template.mjs';

// Builds the static site from two inputs:
//   content/   — everything editors change (via the admin app or by hand): one JSON file per service,
//                project and product, plus page texts and site settings.
//   src/index.html — the design: shared head/navigation, every page as
//                <div class="page" id="page-…"> … <!-- /page-… -->, then the shared footer, with
//                {{ placeholders }} for content (see scripts/lib/template.mjs).
// It writes one complete document per route (index.html, about/index.html, projects/<slug>/…),
// so the output works on any static host without rewrites.

const SITE_URL = 'https://eneontechnologies.com';
const DEFAULT_SOCIAL_IMAGE = `${SITE_URL}/images/brand/eneon-social-card.jpg`;
const DEFAULT_SOCIAL_ALT = 'Eneon Technologies logo with the tagline Engineering ideas into reality';
const CATEGORIES = { hardware: 'Hardware', pcb: 'PCB', embedded: 'Embedded', iot: 'IoT', software: 'Software', ai: 'AI' };

// The 404 page is edited in src/index.html rather than in the admin.
const NOT_FOUND_SEO = { title: 'Page Not Found — Eneon Technologies', description: 'The page you requested could not be found.' };

// ---------------------------------------------------------------- content

const readJSON = async file => JSON.parse(await readFile(file, 'utf8'));
async function readCollection(dir) {
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter(file => file.endsWith('.json')).sort();
  const items = await Promise.all(files.map(async file => ({ ...(await readJSON(`${dir}/${file}`)), _file: file.replace(/\.json$/, '') })));
  return items
    .filter(item => item.published !== false)
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || String(a.name || a.title).localeCompare(String(b.name || b.title)));
}
const slugify = text => String(text || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const plain = text => String(text || '').replace(/\*/g, '').replace(/\s*\n\s*/g, ' ').trim();

const site = await readJSON('content/settings.json');
const pages = Object.fromEntries(await Promise.all(['home', 'about', 'services', 'projects', 'products', 'contact', 'privacy'].map(async name => [name, await readJSON(`content/pages/${name}.json`)])));
const services = await readCollection('content/services');
const products = (await readCollection('content/products')).map(product => ({
  ...product,
  linkUrl: product.link_url || '/contact/',
  linkText: product.link_text || 'Register interest'
}));

const projects = (await readCollection('content/projects')).map(project => {
  const slug = slugify(project.slug || project.name || project._file);
  const portrait = (project.gallery_layout || 'portrait') === 'portrait';
  const galleryItems = (project.gallery || []).filter(item => item && item.media).map(item => {
    const video = isVideo(item.media);
    const [width, height, crop] = portrait ? [700, 875, 'c_fill,ar_4:5,w_700'] : [900, 675, 'c_fill,ar_4:3,w_900'];
    return {
      type: video ? 'video' : 'image',
      isVideo: video,
      full: video ? cloudinary(item.media, 'c_limit,h_1280') : cloudinary(item.media, 'c_limit,h_1600'),
      thumb: video ? videoFrame(item.media, `so_1,${crop}`) : cloudinary(item.media, crop.replace('c_fill,', 'c_fill,g_auto,')),
      width, height,
      caption: item.caption || '',
      alt: item.alt || item.caption || ''
    };
  });
  // Card thumbnail: the chosen image, or the first photo in the gallery.
  const thumbSource = project.thumbnail?.image || (project.gallery || []).find(item => item?.media)?.media || '';
  const thumbUrl = !thumbSource ? '' : isVideo(thumbSource) ? videoFrame(thumbSource, 'so_1,c_fill,ar_4:3,w_800') : cloudinary(thumbSource, 'c_fill,g_auto,ar_4:3,w_800');
  const categories = (project.categories || []).filter(key => CATEGORIES[key]);
  const steps = project.process?.steps || [];
  return {
    ...project,
    slug,
    url: `/projects/${slug}/`,
    categories,
    categoryLabel: categories.map(key => CATEGORIES[key]).join(' · '),
    portrait,
    galleryItems,
    thumbUrl,
    thumbAlt: project.thumbnail?.alt || galleryItems[0]?.alt || project.name,
    hasMeta: Boolean(project.client || project.details?.length),
    pipelineClass: steps.length <= 4 ? 'pipeline pipeline-4' : 'pipeline',
    overview: { eyebrow: 'The project', ...project.overview },
    process: { eyebrow: 'How it works', ...project.process },
    cta: { eyebrow: 'Have a similar challenge?', title: 'Let’s build something like this for you.', text: '', ...project.cta },
    socialImage: project.seo?.image || (thumbSource && !isVideo(thumbSource) ? cloudinary(thumbSource, 'c_fill,g_auto,w_1200,h_630,f_jpg,q_auto') : '')
  };
});
const duplicate = projects.find((project, index) => projects.findIndex(other => other.slug === project.slug) !== index);
if (duplicate) throw new Error(`Two projects use the URL ${duplicate.url}. Give one of them a different slug.`);

const usedCategories = new Set(projects.flatMap(project => project.categories));
const globals = {
  site,
  pages,
  home: pages.home,
  services,
  homeServices: services.filter(service => service.home_card?.show !== false),
  heroChips: (pages.home.hero?.chips || []).slice(0, 5),
  footerCapabilities: services.filter(service => service.footer?.column === 'capabilities'),
  footerGetStarted: services.filter(service => service.footer?.column === 'get_started'),
  projects,
  projectCategories: Object.entries(CATEGORIES).filter(([key]) => usedCategories.has(key)).map(([key, label]) => ({ key, label })),
  productsWithImage: products.filter(product => product.image),
  productsWithoutImage: products.filter(product => !product.image)
};

// ---------------------------------------------------------------- routes

const routes = [
  { page: 'home', file: 'index.html', path: '/', seo: pages.home.seo },
  { page: 'about', directory: 'about', path: '/about/', seo: pages.about.seo },
  { page: 'services', directory: 'services', path: '/services/', seo: pages.services.seo },
  { page: 'projects', directory: 'projects', path: '/projects/', seo: pages.projects.seo },
  ...projects.map(project => ({
    page: 'project',
    id: project.slug,
    directory: `projects/${project.slug}`,
    path: project.url,
    nav: '/projects/',
    project,
    seo: {
      title: project.seo?.title || `${plain(project.name || project.title)} — Case Study | Eneon Technologies`,
      description: project.seo?.description || project.summary || '',
      image: project.socialImage,
      imageAlt: project.seo?.title || plain(project.name || project.title)
    }
  })),
  { page: 'products', directory: 'products', path: '/products/', seo: pages.products.seo },
  { page: 'contact', directory: 'contact', path: '/contact/', seo: pages.contact.seo },
  { page: 'privacy', directory: 'privacy', path: '/privacy/', seo: pages.privacy.seo },
  { page: '404', file: '404.html', path: null, seo: NOT_FOUND_SEO }
];

// ---------------------------------------------------------------- template

const SOURCE = 'src/index.html';
const source = await readFile(SOURCE, 'utf8');
const firstPage = source.indexOf('<div class="page active" id="page-home">');
const footer = source.indexOf('  </main>');
if (firstPage === -1 || footer === -1) throw new Error(`Could not locate the shared layout or page sections in ${SOURCE}.`);
const sharedHeader = source.slice(0, source.lastIndexOf('\n', firstPage) + 1);
const sharedFooter = source.slice(footer);

function pageMarkup(page) {
  const opening = `<div class="page${page === 'home' ? ' active' : ''}" id="page-${page}">`;
  const pageStart = source.indexOf(opening);
  const pageEnd = source.indexOf(`    <!-- /page-${page} -->`, pageStart);
  if (pageStart === -1 || pageEnd === -1) throw new Error(`Could not locate the ${page} page section in ${SOURCE}.`);
  return '    ' + source.slice(pageStart, pageEnd).replace(opening, `<div class="page active" id="page-${page}">`);
}

// Highlight the current page in the main menu; sub-pages (a case study) highlight their parent.
let currentRoute;
helpers.nav = ([path]) => {
  const navPath = currentRoute.nav || currentRoute.path;
  if (path !== navPath) return new Safe('');
  return new Safe(path === currentRoute.path ? ' class="is-active" aria-current="page"' : ' class="is-active"');
};

// Cloudinary: add automatic format + quality (f_auto,q_auto) to image/video URLs that don't
// already set f_ or q_.
const TRANSFORM = '(?:a|ac|af|ar|b|bo|br|c|co|cs|d|dl|dn|dpr|du|e|eo|f|fl|fn|fps|g|h|if|ki|l|o|p|pg|q|r|so|sp|t|u|vc|vs|w|x|y|z)_[^,/\\s"\'<>]+';
const CLOUDINARY = new RegExp(`(https://res\\.cloudinary\\.com/[^/\\s"'<>]+/(?:image|video)/upload/)((?:${TRANSFORM}(?:,${TRANSFORM})*/)*)`, 'g');
const optimiseCloudinary = html => html.replace(CLOUDINARY, (_, base, transforms) =>
  /(?:^|[,/])[fq]_/.test(transforms) ? base + transforms : `${base}${transforms}f_auto,q_auto/`);
// Editor notes in <!-- --> comments stay in the source but are left out of published pages.
const stripComments = html => html.replace(/[ \t]*<!--[\s\S]*?-->[ \t]*\n?/g, '');
// The source carries a noindex tag (in case src/ is uploaded); published pages must not.
const stripSourceOnly = html => html.replace(/[ \t]*<meta [^>]*data-source-only[^>]*>\n?/g, '');

const templates = {};
for (const route of routes) {
  templates[route.page] ||= compile(stripComments(`${sharedHeader}${pageMarkup(route.page)}\n${sharedFooter}`));
  currentRoute = route;
  let html = templates[route.page]({
    ...globals,
    route,
    project: route.project,
    seo: route.seo,
    canonical: route.path ? `${SITE_URL}${route.path}` : '',
    socialImage: route.seo.image || DEFAULT_SOCIAL_IMAGE,
    socialImageAlt: route.seo.image ? route.seo.imageAlt : DEFAULT_SOCIAL_ALT
  });
  if (route.id) html = html.replace(`id="page-${route.page}"`, `id="page-${route.id}"`);
  html = optimiseCloudinary(stripSourceOnly(html));
  const file = route.file || `${route.directory}/index.html`;
  if (route.directory) await mkdir(route.directory, { recursive: true });
  await writeFile(file, html);
}

// Remove pages of projects that were deleted, renamed or unpublished.
const liveProjects = new Set(projects.map(project => project.slug));
for (const entry of await readdir('projects', { withFileTypes: true })) {
  if (!entry.isDirectory() || liveProjects.has(entry.name)) continue;
  const files = await readdir(`projects/${entry.name}`);
  if (files.every(file => file === 'index.html')) {
    await rm(`projects/${entry.name}`, { recursive: true });
    console.log(`Removed old project page /projects/${entry.name}/`);
  }
}

// Sitemap: every public route.
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes.filter(route => route.path).map(route => `  <url><loc>${SITE_URL}${route.path}</loc></url>`).join('\n')}
</urlset>
`;
await writeFile('sitemap.xml', sitemap);

console.log(`Generated ${routes.length} static route documents (${projects.length} project${projects.length === 1 ? '' : 's'}, ${services.length} services, ${products.length} products).`);
