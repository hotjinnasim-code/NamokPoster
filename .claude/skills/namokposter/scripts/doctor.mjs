#!/usr/bin/env node
// namokposter environment check. Run this first on a new machine.
//
//   node doctor.mjs                    report what is available
//   node doctor.mjs --install-blender  additionally install Blender's `bpy` module into a private venv
//
// Exit code 0 = three.js and HTML rendering works (the default set of drafts can be made); 1 = cannot
// render at all. Blender is optional: it is used only when the user asks for Blender styles.
import { findBlender, installBpy, BPY_VENV } from './lib/blender.mjs';
import { launchBrowser, newPage } from './lib/browser.mjs';
import { VERSION } from './lib/version.mjs';

const args = new Set(process.argv.slice(2));
const ok = (m) => console.log(`  ✓ ${m}`), bad = (m) => console.log(`  ✗ ${m}`), info = (m) => console.log(`    ${m}`);

console.log(`namokposter ${VERSION} doctor\n`);
console.log(`node ${process.version} on ${process.platform}/${process.arch}`);
if (Number(process.versions.node.split('.')[0]) < 18) bad('Node 18+ is required.');

// ---- Chromium + WebGL (needed for every poster: typography is composited in the browser)
let canRender = false;
console.log('\nChromium (typography, three.js and HTML styles — every poster needs it):');
try {
  const browser = await launchBrowser();
  const page = await newPage(browser, { width: 320, height: 200 });
  await page.setContent('<canvas id="c"></canvas>');
  const gl = await page.evaluate(() => {
    const g = document.getElementById('c').getContext('webgl2');
    if (!g) return null;
    const d = g.getExtension('WEBGL_debug_renderer_info');
    return { renderer: d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown', max: g.getParameter(g.MAX_TEXTURE_SIZE) };
  });
  ok(`headless Chromium ${browser.version()}`);
  if (gl) { ok(`WebGL2 available (${gl.renderer}; max ${gl.max}px)`); canRender = true; }
  else { bad('WebGL2 is not available — three.js styles cannot render.'); info('Blender styles and user-supplied art still work.'); canRender = true; }
  await page.closeAll(); await browser.close();
} catch (e) {
  bad(e.message.split('\n')[0]);
  for (const l of e.message.split('\n').slice(1)) info(l.trim());
}

// ---- Blender
console.log('\nBlender (path-traced styles — clay, felt, glass, neon, paper cut … — used only when the user asks for Blender):');
let blender = findBlender();
if (!blender && args.has('--install-blender')) {
  console.log('  installing bpy (Blender as a Python module, ~350 MB download) …');
  try { blender = installBpy((m) => console.log(m)); } catch (e) { bad(e.message.split('\n')[0]); for (const l of e.message.split('\n').slice(1)) info(l.trim()); }
}
if (blender) ok(`${blender.kind === 'bpy' ? 'bpy module' : 'Blender app'} ${blender.version}  (${blender.cmd})`);
else {
  bad('not found — fine for the default set; needed only if the user asks for Blender styles.');
  info('To get it: install Blender (blender.org) and put it on PATH or set POSTER_BLENDER=/path/to/blender;');
  info(`or run: node ${process.argv[1]} --install-blender   (pip-installs bpy into ${BPY_VENV})`);
}

console.log(`\n${canRender ? (blender ? 'Ready: all styles available.' : 'Ready: the default set (three.js and HTML styles) is available. Blender styles, made only on request, are not.') : 'Not ready: fix Chromium/Playwright first.'}`);
process.exit(canRender ? 0 : 1);
