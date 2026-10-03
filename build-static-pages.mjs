import { mkdir, readFile, writeFile } from 'node:fs/promises';

// src/index.html is the single source for the whole site: shared head/navigation, every page as
// <div class="page" id="page-…"> … <!-- /page-… -->, then the shared footer. This script writes
// one static document per route containing only that page (index.html for the home page,
// about/index.html, …), so direct links work on any host without rewrites.

const SITE_URL = 'https://eneontechnologies.com';
const routes = {
  home: {
    file: 'index.html',
    path: '/',
    title: 'Eneon Technologies — Engineering Ideas Into Reality',
    description: 'Eneon Technologies, Enugu, Nigeria, designs and builds electronics, PCBs, embedded systems, IoT solutions and software that turn ideas into working technology.'
  },
  about: {
    directory: 'about',
    path: '/about/',
    title: 'About Eneon Technologies — Built to Make Technology Real',
    description: 'Learn how Eneon Technologies approaches hardware, software, embedded systems and connected technology with practical engineering discipline.'
  },
  services: {
    directory: 'services',
    path: '/services/',
    title: 'Engineering Services — Eneon Technologies',
    description: 'Hardware & electronics, PCB design, embedded systems & firmware, IoT solutions, software development, prototype development and technical consultancy from Eneon Technologies.'
  },
  projects: {
    directory: 'projects',
    path: '/projects/',
    title: 'Projects — Eneon Technologies',
    description: 'Selected hardware, embedded, IoT and software engineering work by Eneon Technologies — context, process, technology and outcomes.'
  },
  products: {
    directory: 'products',
    path: '/products/',
    title: 'Products — Eneon Technologies',
    description: 'Eneon Technologies is building the engineering foundation for future proprietary hardware, software and connected products.'
  },
  contact: {
    directory: 'contact',
    path: '/contact/',
    title: 'Contact Eneon Technologies — Start a Project Conversation',
    description: 'Talk with Eneon Technologies about your hardware, embedded, IoT, software or product-development opportunity.'
  },
  privacy: {
    directory: 'privacy',
    path: '/privacy/',
    title: 'Privacy Notice — Eneon Technologies',
    description: 'How the Eneon Technologies website and project enquiry form handle information.'
  },
  404: {
    file: '404.html',
    path: null,
    title: 'Page Not Found — Eneon Technologies',
    description: 'The page you requested could not be found.'
  }
};

// Cloudinary: add automatic format + quality (f_auto,q_auto) to image/video URLs that don't
// already set f_ or q_. Applied to the source too, so editors see the optimised URLs.
const TRANSFORM = '(?:a|ac|af|ar|b|bo|br|c|co|cs|d|dl|dn|dpr|du|e|eo|f|fl|fn|fps|g|h|if|ki|l|o|p|pg|q|r|so|sp|t|u|vc|vs|w|x|y|z)_[^,/\\s"\'<>]+';
const CLOUDINARY = new RegExp(`(https://res\\.cloudinary\\.com/[^/\\s"'<>]+/(?:image|video)/upload/)((?:${TRANSFORM}(?:,${TRANSFORM})*/)*)`, 'g');
const optimiseCloudinary = html => html.replace(CLOUDINARY, (_, base, transforms) =>
  /(?:^|[,/])[fq]_/.test(transforms) ? base + transforms : `${base}${transforms}f_auto,q_auto/`);

const SOURCE = 'src/index.html';
const original = await readFile(SOURCE, 'utf8');
const source = optimiseCloudinary(original);
if (source !== original) await writeFile(SOURCE, source);

const firstPage = source.indexOf('<div class="page active" id="page-home">');
const footer = source.indexOf('  </main>');

if (firstPage === -1 || footer === -1) {
  throw new Error(`Could not locate the shared layout or page sections in ${SOURCE}.`);
}

const sharedHeader = source.slice(0, source.lastIndexOf('\n', firstPage) + 1);
const sharedFooter = source.slice(footer);

function pageMarkup(page) {
  const pageStart = source.indexOf(`<div class="page${page === 'home' ? ' active' : ''}" id="page-${page}">`);
  const pageEndMarker = `    <!-- /page-${page} -->`;
  const pageEnd = source.indexOf(pageEndMarker, pageStart);

  if (pageStart === -1 || pageEnd === -1) {
    throw new Error(`Could not locate the ${page} page section.`);
  }

  return '    ' + source.slice(pageStart, pageEnd).replace(`class="page${page === 'home' ? ' active' : ''}"`, 'class="page active"');
}

// Highlight the current page in the main menu (Home is highlighted in the source).
function setActiveNav(document, route) {
  const cleared = document.replace(' class="is-active" aria-current="page" href="/"', ' href="/"');
  if (!route.path) return cleared;
  return cleared.replace(`<li><a href="${route.path}">`, `<li><a class="is-active" aria-current="page" href="${route.path}">`);
}

function setPageMetadata(document, route) {
  const url = route.path ? `${SITE_URL}${route.path}` : null;
  let html = document
    .replace(/<title>[^<]*<\/title>/, `<title>${route.title}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(">)/, `$1${route.description}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(">)/, `$1${route.title}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(">)/, `$1${route.description}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(">)/, `$1${route.title}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(">)/, `$1${route.description}$2`);
  if (url) {
    html = html
      .replace(/(<link rel="canonical" href=")[^"]*(">)/, `$1${url}$2`)
      .replace(/(<meta property="og:url" content=")[^"]*(">)/, `$1${url}$2`);
  } else {
    // The 404 page has no canonical URL and shouldn't be indexed.
    html = html
      .replace(/<link rel="canonical" href="[^"]*">/, '<meta name="robots" content="noindex">')
      .replace(/\n\s*<meta property="og:url" content="[^"]*">/, '');
  }
  return html;
}

// Editor notes in <!-- --> comments stay in the source but are left out of published pages.
const stripComments = html => html.replace(/[ \t]*<!--[\s\S]*?-->[ \t]*\n?/g, '');
// The source carries a noindex tag (in case src/ is uploaded); published pages must not.
const stripSourceOnly = html => html.replace(/[ \t]*<meta [^>]*data-source-only[^>]*>\n?/g, '');

await Promise.all(Object.entries(routes).map(async ([page, route]) => {
  const document = stripSourceOnly(stripComments(setPageMetadata(setActiveNav(`${sharedHeader}${pageMarkup(page)}\n${sharedFooter}`, route), route)));
  const file = route.file || `${route.directory}/index.html`;
  if (route.directory) await mkdir(route.directory, { recursive: true });
  await writeFile(file, document);
}));

console.log(`Generated ${Object.keys(routes).length} static route documents.`);
