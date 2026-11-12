// Headless Chromium via Playwright. Pages are served from a fake origin whose requests are
// answered straight from disk, so ES modules, fonts and images load without a real web server.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ORIGIN = 'http://poster.local';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.avif': 'image/avif',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.hdr': 'application/octet-stream', '.bin': 'application/octet-stream',
};

/** URL for an arbitrary local file (user logo, custom scene, rendered art…). */
// Path separators are kept, so a module served this way can import its siblings ('./part.js').
export const fileUrl = (abs) => `${ORIGIN}/file/${path.resolve(abs).split(path.sep).map(encodeURIComponent).join('/')}`;
export const skillUrl = (rel) => `${ORIGIN}/skill/${rel.split(path.sep).join('/')}`;

async function loadPlaywright() {
  const tried = [];
  const bases = [process.cwd(), SKILL_ROOT];
  try { bases.push(execFileSync('npm', ['root', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()); } catch { /* npm missing */ }
  if (process.env.NODE_PATH) bases.push(...process.env.NODE_PATH.split(path.delimiter));
  for (const name of ['playwright', 'playwright-core']) {
    try { const m = await import(name); return m.default ?? m; } catch (e) { tried.push(`${name}: ${e.code ?? e.message}`); }
    for (const base of bases) {
      try {
        const req = createRequire(path.join(base, 'noop.js'));
        const m = await import(pathToFileURL(req.resolve(name)).href);
        return m.default ?? m;
      } catch { /* keep looking */ }
      try {
        const direct = path.join(base, name);
        if (fs.existsSync(path.join(direct, 'package.json'))) {
          const m = await import(pathToFileURL(createRequire(path.join(direct, 'package.json')).resolve(direct)).href);
          return m.default ?? m;
        }
      } catch { /* keep looking */ }
    }
  }
  const err = new Error(
    'Playwright is not installed. Install it once, then re-run:\n' +
    '    npm install playwright && npx playwright install chromium\n' +
    '(or set POSTER_CHROMIUM=/path/to/chrome and `npm install playwright-core`).');
  err.code = 'NO_PLAYWRIGHT';
  throw err;
}

export async function launchBrowser() {
  const pw = await loadPlaywright();
  // SwiftShader keeps WebGL available on GPU-less machines; harmless where a GPU exists.
  // --disable-lcd-text / --force-color-profile keep type and colour identical across machines.
  const args = ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-web-security', '--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb'];
  const attempts = [];
  if (process.env.POSTER_CHROMIUM) attempts.push({ executablePath: process.env.POSTER_CHROMIUM });
  // Full Chromium ("new headless") first: its screenshots hold up under CPU load, where the
  // lighter headless shell that Playwright launches by default drops captures now and then.
  attempts.push({ channel: 'chromium' }, {}, { channel: 'chrome' }, { channel: 'msedge' });
  for (const p of ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']) {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) attempts.push({ executablePath: p });
  }
  let last;
  for (const opt of attempts) {
    try { return await pw.chromium.launch({ headless: true, args, ...opt }); } catch (e) { last = e; }
  }
  const err = new Error(
    'Could not start Chromium. Run `npx playwright install chromium`, or set POSTER_CHROMIUM to a Chrome/Chromium binary.\n' +
    `Last error: ${String(last?.message ?? last).split('\n')[0]}`);
  err.code = 'NO_CHROMIUM';
  throw err;
}

/** New page whose requests to ORIGIN are served from disk. */
export async function newPage(browser, { width, height, scale = 1 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  const page = await context.newPage();
  const logs = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await context.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    let file = null;
    if (url.pathname.startsWith('/skill/')) {
      file = path.join(SKILL_ROOT, decodeURIComponent(url.pathname.slice('/skill/'.length)));
      if (!path.resolve(file).startsWith(SKILL_ROOT)) file = null;
    } else if (url.pathname.startsWith('/file/')) {
      file = decodeURIComponent(url.pathname.slice('/file/'.length));
    }
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      logs.push(`[404] ${url.pathname}`);
      return route.fulfill({ status: 404, body: 'not found' });
    }
    return route.fulfill({
      status: 200, body: fs.readFileSync(file),
      headers: { 'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'access-control-allow-origin': '*', 'cache-control': 'no-store' },
    });
  });
  // Everything the skill needs is local. Anything else (a CDN import in a custom scene, a remote
  // logo) is allowed but recorded, so an offline failure is easy to explain.
  page.on('request', (r) => { const u = r.url(); if (/^https?:/.test(u) && !u.startsWith(ORIGIN)) logs.push(`[external] ${u.slice(0, 160)}`); });
  page.on('requestfailed', (r) => { const u = r.url(); if (!u.startsWith(ORIGIN)) logs.push(`[failed] ${u.slice(0, 160)} ${r.failure()?.errorText ?? ''}`); });
  page.logs = logs;
  page.closeAll = async () => { await context.close(); };
  return page;
}

/**
 * page.screenshot / page.pdf with retries. On a busy machine Chromium sometimes answers
 * "Unable to capture screenshot" (the compositor missed its deadline); asking again works.
 */
export async function capture(page, fn, tries = 6) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(page); } catch (e) {
      last = e;
      if (!/captur|screenshot|printToPDF|timeout|Protocol error/i.test(String(e.message))) throw e;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw last;
}
