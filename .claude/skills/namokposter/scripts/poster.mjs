#!/usr/bin/env node
// namokposter — render poster drafts from a JSON spec.
//
//   node poster.mjs spec.json --out out/            three drafts in different styles (2K 16:9 by default)
//   node poster.mjs spec.json --blender             the user asked for Blender: three Blender drafts
//   node poster.mjs spec.json --quality draft       fast pass to check copy fit before the real render
//   node poster.mjs --list-styles                   what styles/palettes/layouts exist
//
// Each draft = an art layer (three.js, HTML, or Blender Cycles) + typography composited in headless
// Chromium. By default the automatic choice draws from three.js and HTML styles, which render in
// seconds; Blender styles (minutes each) are used when the user asks for them. The art layer is
// cached, so changing only the copy re-renders in a couple of seconds.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { tagDensity } from './lib/density.mjs';
import { normalizeSpec, normalizeContent, resolveLayout, placeArt, QUALITY, LAYOUTS, PRESETS, CLASS_PRESETS, PAPER_MM } from './lib/spec.mjs';
import { loadTopics, suggest } from './lib/topics.mjs';
import { resolvePalette, parseHex, toHex, mix, luminance, rgbToHsl } from './lib/color.mjs';
import { launchBrowser, newPage, capture, fileUrl, skillUrl, SKILL_ROOT } from './lib/browser.mjs';
import { findBlender, renderBlender } from './lib/blender.mjs';
import { VERSION } from './lib/version.mjs';

const STYLES_DIR = path.join(SKILL_ROOT, 'assets', 'styles');
const THEMES_DIR = path.join(SKILL_ROOT, 'assets', 'themes');
const FONTS_EXTRA_DIR = path.join(SKILL_ROOT, 'assets', 'fonts-extra');
// every fonts*.css in the optional font pack is loaded (fonts.css first), so packs can be added side by side
const fontsExtraCss = () => (fs.existsSync(FONTS_EXTRA_DIR) ? fs.readdirSync(FONTS_EXTRA_DIR).filter((f) => /^fonts.*\.css$/.test(f)).sort((a, b) => (a === 'fonts.css' ? -1 : b === 'fonts.css' ? 1 : a.localeCompare(b))).map((f) => path.join(FONTS_EXTRA_DIR, f)) : []);
// Default sets when the spec does not choose and there is no topic guide to choose by: an object,
// something dramatic, and a full picture — from three.js and HTML, or all Blender when that was asked for.
const AUTO_THREE_ONLY = ['aurora', 'flux', 'layers', 'wave', 'halftone', 'bauhaus'];
const AUTO_BLENDER = ['studio', 'prism', 'paper', 'monolith', 'glass', 'ceramic'];
const NO_BLENDER_MSG = 'Blender was asked for ("blender": true / --blender) but was not found. Install it with `node scripts/doctor.mjs --install-blender` (or set POSTER_BLENDER), or drop the option to get three.js and HTML posters.';
const MAX_THREE_EDGE = 7680;   // WebGL drawing-buffer ceiling in software GL is 8192
const MAX_PNG_EDGE = 16000;    // Chromium screenshot ceiling
const MAX_BLENDER_PIXELS = 17.5e6;   // a path-traced layer at standard quality: A3 at 300 dpi, whole

// ------------------------------------------------------------------ cli
function parseArgs(argv) {
  const a = { _: [] };
  const flags = new Set(['list-styles', 'suggest', 'no-cache', 'blender', 'no-blender', 'no-sheet', 'help']);
  const valued = new Set(['out', 'quality', 'format', 'resolution', 'styles', 'formats', 'only', 'seed', 'style-dir', 'count', 'type', 'viewing', 'layout', 'bleed']);
  const alias = { o: 'out', q: 'quality', f: 'format', r: 'resolution', s: 'styles', h: 'help' };
  for (let i = 0; i < argv.length; i++) {
    let t = argv[i];
    if (!t.startsWith('-')) { a._.push(t); continue; }
    let [k, v] = t.replace(/^--?/, '').split(/=(.*)/s);
    k = alias[k] ?? k;
    if (flags.has(k)) { a[k] = true; continue; }
    if (!valued.has(k)) throw new Error(`Unknown option --${k}. Run with --help for the list.`);
    if (v === undefined) v = argv[++i];
    if (v === undefined) throw new Error(`Option --${k} needs a value.`);
    a[k] = v;
  }
  return a;
}

const HELP = `namokposter — render three finished posters (three.js + HTML; Blender on request)

Usage: node poster.mjs <spec.json> [options]

  --out, -o DIR        output folder (default: ./poster-out)
  --styles, -s LIST    comma list of style ids, or "auto" (default: from spec, else auto = 3 styles)
  --blender            the user asked for Blender: the automatic choice makes every poster a Blender
                       style (alone or on a ground). Without it the automatic choice uses three.js
                       and HTML styles only. Same as "blender": true in the spec
  --format, -f VALUE   a3 | 2k | 4k | a3-landscape | instagram-post | story | 4:5 | 3000x4000 …   (default: a3, A3 portrait at 300 dpi)
                       several at once: a3,2k (one sub-folder per format)
  --resolution, -r R   2k | 4k — size class of ratio and shape formats (story, square, 4:5 …); 4k only when asked for (default: 2k)
  --bleed MM           add print bleed around paper formats (e.g. 3)
  --quality, -q TIER   draft | standard | high      (default: standard; draft is a half-resolution trial run, not for delivery)
  --formats LIST       png,jpg,pdf                  (default: png)
  --only LIST          render only these posters (letters A,B,C or style ids)
  --seed N             change the generative variation
  --type ID            typography theme for every poster (see --list-styles)
  --layout NAME        layout for every poster (left, top, corners, band, strip, axis, vertical, …)
  --viewing MODE       screen | mobile | print — how large supporting text must be (default: from format)
  --style-dir DIR      extra folder containing custom styles (each a folder with style.json)
  --no-blender         pretend Blender is unavailable (a Blender style named in the spec is swapped for a three.js one)
  --no-cache           re-render art layers even if cached
  --suggest            read the copy, name its topics and print fitting posters (styles, motifs, type, palettes) — renders nothing
  --list-styles        print the style catalogue and exit
`;

// ------------------------------------------------------------------ styles
/** Which family of technique each stock style belongs to (assets/families.json): style id → family id. */
function loadFamilies() {
  const out = {};
  try { for (const f of JSON.parse(fs.readFileSync(path.join(SKILL_ROOT, 'assets', 'families.json'), 'utf8')).families ?? []) for (const st of f.styles ?? []) out[typeof st === 'string' ? st : st.id] = f.id; } catch { /* no file: every style is its own engine's family */ }
  return out;
}

// A style folder that cannot be loaded (a broken style.json, a missing scene file) is left out with a
// warning rather than stopping every poster; a draft that names it gets the reason.
const badStyles = {};

function loadStyles(extraDirs = []) {
  const styles = {}, families = loadFamilies();
  for (const dir of [STYLES_DIR, ...extraDirs]) {
    if (!dir || !fs.existsSync(dir)) continue;
    const entries = fs.existsSync(path.join(dir, 'style.json')) ? [dir] : fs.readdirSync(dir).map((d) => path.join(dir, d));
    for (const d of entries) {
      const f = path.join(d, 'style.json');
      if (!fs.existsSync(f)) continue;
      try {
        const s = JSON.parse(fs.readFileSync(f, 'utf8'));
        s.id = s.id || path.basename(d); s.dir = path.resolve(d);
        s.sceneFile = path.join(s.dir, s.scene || (s.engine === 'blender' ? 'scene.py' : 'scene.js'));
        if (!['three', 'blender', 'html', 'none'].includes(s.engine)) throw new Error(`engine must be "three", "blender", "html" or "none"`);
        if (s.engine !== 'none' && !fs.existsSync(s.sceneFile)) throw new Error(`missing scene file ${s.sceneFile}`);
        s.tone = s.tone ?? (['light', 'dark'].includes(s.theme) ? s.theme : 'light');
        s.type = s.type ?? 'bold';
        s.kind = s.kind === 'picture' ? 'picture' : 'object';   // picture = the art is a whole illustration, not an object on a backdrop
        s.family = s.family ?? families[s.id] ?? s.engine;      // two drafts of one family are one idea twice
        styles[s.id] = s;
      } catch (e) { badStyles[path.basename(d)] = `${f}: ${e.message}`; console.error(`! style left out — ${f}: ${e.message}`); }
    }
  }
  return styles;
}

/** Typography themes: bundled ones by id, or a path to a .css file of your own. */
function listTypes() {
  return fs.existsSync(THEMES_DIR) ? fs.readdirSync(THEMES_DIR).filter((f) => f.endsWith('.css')).map((f) => f.replace(/\.css$/, '')).sort() : [];
}
function resolveType(id, baseDir) {
  if (/\.css$/i.test(id)) {
    const file = path.resolve(baseDir, id);
    if (!fs.existsSync(file)) {
      // a theme scripts/fonts.mjs wrote (<bundled theme>-<face>.css in the font cache) that is gone — the cache was
      // cleared, or the spec came from another machine: the bundled theme it was built on stands in, and the poster says so
      const cache = path.resolve(process.env.POSTER_FONT_CACHE || path.join(os.homedir(), '.cache', 'namokposter', 'fonts'));
      const base = path.basename(file).split('-')[0];
      if (file.startsWith(cache + path.sep) && fs.existsSync(path.join(THEMES_DIR, `${base}.css`))) return { id: base, file: path.join(THEMES_DIR, `${base}.css`), standIn: id };
      throw new Error(`Typography theme file not found: ${id}`);
    }
    return { id: path.basename(file).replace(/\.css$/i, ''), file };
  }
  const file = path.join(THEMES_DIR, `${id}.css`);
  if (!fs.existsSync(file)) throw new Error(`Unknown typography theme "${id}". Available: ${listTypes().join(', ')} — or give a path to a .css file.`);
  return { id, file };
}

/** What scripts/fonts.mjs recorded beside a theme it wrote (font.json): the fetched face, its licence and where it came from. */
function fontFromOutside(themeFile) {
  if (path.resolve(themeFile).startsWith(SKILL_ROOT + path.sep)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(path.join(path.dirname(themeFile), 'font.json'), 'utf8'));
    // origin: fetched (passes the font policy), asked (the user named it), file (the user gave it), installed (on this computer)
    return { family: j.family, origin: j.origin ?? 'fetched', licence: j.licenceName ?? j.licence, licenceNote: j.licenceNote ?? null, licenceUrl: j.licenceUrl ?? null, source: j.source?.home ?? j.source?.kind ?? 'unknown', forbids: j.forbids ?? [], popularity: j.popularity?.basis ?? null, fetched: j.fetched ?? null };
  } catch { return null; }
}

/** Families the bundled @font-face sheets provide (core fonts, plus the optional pack when it is installed). */
let familiesCache;
function bundledFamilies() {
  if (familiesCache) return familiesCache;
  familiesCache = new Set();
  for (const f of [path.join(SKILL_ROOT, 'assets', 'fonts', 'fonts.css'), ...fontsExtraCss()]) {
    if (!fs.existsSync(f)) continue;
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/font-family:\s*['"]([^'"]+)['"]/g)) familiesCache.add(m[1]);
  }
  return familiesCache;
}
/** The faces a theme leads with (first name of each --font-* stack) that are not installed. */
function missingFaces(file) {
  const css = fs.readFileSync(file, 'utf8'), out = new Set();
  // a theme may bring its own faces (@font-face in the theme file: one written by scripts/fonts.mjs, or the user's)
  const have = new Set([...bundledFamilies(), ...[...css.matchAll(/@font-face\s*\{[^}]*?font-family:\s*['"]([^'"]+)['"]/g)].map((m) => m[1])]);
  for (const m of css.matchAll(/--font-[\w-]+:\s*([^;}]+)/g)) {
    const first = m[1].split(',')[0].trim().replace(/^['"]|['"]$/g, '');
    if (first && !/^(serif|sans-serif|monospace|cursive|inherit|var\()/.test(first) && !have.has(first)) out.add(first.replace(/ KR$/, ''));
  }
  return [...out];
}
/** Themes whose faces are all here — every theme with the full package, the core ones without the font pack. */
function usableTypes() {
  return listTypes().filter((t) => !missingFaces(path.join(THEMES_DIR, `${t}.css`)).length);
}

function listStyles(styles, blender) {
  const lines = [`Blender: ${blender ? `${blender.kind === 'bpy' ? 'bpy module' : 'app'} ${blender.version}` : 'not found (three.js styles only — run `node scripts/doctor.mjs --install-blender`)'}`, '', 'STYLES (art) — engine: blender (path-traced, minutes) · three (seconds) · html (drawn in the page from the copy, instant) — object = a subject on a plain backdrop · picture = one illustration filling the poster · cut-out = can stand on a ground · ground = can be drawn under a cut-out ("ground": "<id>") · * = default palette'];
  for (const s of Object.values(styles)) {
    const cut = s.cutout === true || (s.engine === 'html' && s.kind !== 'picture');
    lines.push(`  ${s.id.padEnd(10)} [${s.engine}, ${s.kind}${cut ? ', cut-out' : ''}${s.ground === true ? ', ground' : ''}] ${s.label ?? ''} — ${s.mood ?? ''}`);
    if (s.requires?.length) lines.push(`${' '.repeat(13)}needs in the copy: ${s.requires.join(', ')}`);
    if (cut && s.grounds?.length) lines.push(`${' '.repeat(13)}grounds checked: ${s.grounds.join(', ')}`);
    lines.push(`${' '.repeat(13)}type: ${s.type}${s.types?.length ? ` (also suits: ${s.types.join(', ')})` : ''}   palettes: ${Object.keys(s.palettes ?? {}).map((p) => (p === s.defaultPalette ? `${p}*` : p)).join(', ')}`);
    if (s.params) lines.push(`${' '.repeat(13)}params: ${Object.entries(s.params).map(([k, v]) => `${k}=${JSON.stringify(v.default ?? v)}`).join(', ')}`);
    for (const o of ['landscape', 'portrait']) { const L = s.layouts?.[o]; if (L?.also?.length) lines.push(`${' '.repeat(13)}layouts (${o}): ${L.layout}*, ${L.also.join(', ')}`); }
    for (const [k, m] of Object.entries(s.motifs ?? {})) lines.push(`${' '.repeat(13)}motif ${k}: ${m.note ?? ''}${m.palettes ? `   palettes: ${m.palettes.map((p) => (p === m.palette ? `${p}*` : p)).join(', ')}` : ''}${m.params ? `   params: ${Object.entries(m.params).map(([a, v]) => `${a}=${JSON.stringify(v.default ?? v)}`).join(', ')}` : ''}`);
  }
  const usable = usableTypes(), needPack = listTypes().filter((t) => !usable.includes(t));
  lines.push('', `TYPE THEMES (typography; any theme works with any style): ${usable.join(', ')}`);
  if (needPack.length) lines.push(`  need the font pack (assets/fonts-extra, not installed): ${needPack.join(', ')}`);
  lines.push('', `LAYOUTS — landscape: ${Object.keys(LAYOUTS.landscape).join(', ')}`, `          portrait: ${Object.keys(LAYOUTS.portrait).join(', ')}`, `          square: ${Object.keys(LAYOUTS.square).join(', ')}`);
  lines.push('          add -mirror to exchange left and right (top-mirror, corners-mirror, …); each style lists the layouts it has been checked with');
  lines.push('', `FORMATS: ${[...Object.keys(PRESETS), ...Object.keys(CLASS_PRESETS), ...Object.keys(PAPER_MM)].join(', ')}  (or WxH, or a ratio like 4:5). Default a3 (A3 portrait, 297×420 mm at 300 dpi); 2k is 16:9 for screens (2560×1440); 4K only when asked for: "format": "4k", or "resolution": "4k" with a ratio or a shape preset.`);
  return lines.join('\n');
}

// ------------------------------------------------------------------ helpers
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex');
// A scene may be split over sibling modules in its folder: all code files beside it count towards the cache key.
const sceneHash = (file) => { const dir = path.dirname(file), ext = path.extname(file); try { return sha(fs.readdirSync(dir).filter((f) => f.endsWith(ext) || f.endsWith('.mjs')).sort().map((f) => fileHash(path.join(dir, f))).join(':')); } catch { return fileHash(file); } };
const fileHash = (f) => sha(fs.readFileSync(f));
const mixHex = (a, b, t) => toHex(mix(parseHex(a), parseHex(b), t));
const fmtSecs = (ms) => (ms < 10000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 1000)}s`);
const log = (...a) => console.log(...a);

/** A local path in the spec may be relative to the spec file. Returns a browser URL (or '' if missing). */
function assetUrl(p, baseDir, warnings, what) {
  if (!p) return '';
  if (/^(https?:|data:)/.test(p)) return p;
  const abs = path.isAbsolute(p) ? p : path.resolve(baseDir, p);
  if (!fs.existsSync(abs)) { warnings.push({ level: 'error', code: 'missing-file', msg: `${what} not found: ${p}` }); return ''; }
  return fileUrl(abs);
}

/** Custom slot HTML and CSS may point at local files (src="./x.png", url(./y.woff2)); make those loadable. */
function localizeUrls(text, baseDir) {
  const fix = (p) => {
    if (/^(https?:|data:|blob:|#|\/skill\/)/.test(p)) return p;
    const abs = path.isAbsolute(p) ? p : path.resolve(baseDir, p);
    return fs.existsSync(abs) ? fileUrl(abs) : p;
  };
  return text
    .replace(/\b(src|href)\s*=\s*(["'])([^"']+)\2/gi, (m, a, q, p) => `${a}=${q}${fix(p)}${q}`)
    .replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (m, q, p) => `url(${q}${fix(p)}${q})`);
}

// Styles that used to be named after what they show are now motifs of an art style.
const STYLE_ALIAS = { ridge: ['layers', 'mountains'], tide: ['layers', 'sea'], skyline: ['layers', 'city'], lake: ['softscape', 'lake'], dunes: ['softscape', 'dunes'], room: ['softscape', 'room'], cloudland: ['softscape', 'clouds'], cosmos: ['airbrush', 'planet'] };

/** An art style can show several subjects ("motifs"); a motif may bring its own defaults (palette, type, layouts, params…). */
/** The first letter of each of the headline's first three words ("밤을 건너는 음악" → "밤건음", "Design Week" → "DWE"). */
function titleInitials(title) {
  const words = String(title ?? '').replace(/<[^>]+>/g, ' ').split(/[^\p{L}]+/u).filter(Boolean);
  if (!words.length) return '';
  const up = (c) => c.toUpperCase();
  const out = words.slice(0, 3).map((w) => up([...w][0]));
  for (const c of [...words[0]].slice(1)) { if (out.length >= 3) break; out.push(up(c)); }
  return [...new Set(out)].join('');
}

// A, B, … Z, AA, AB, … — a spec may carry more than 26 drafts (palette sweeps).
function draftLabel(i) {
  let s = '';
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s;
  return s;
}

function applyMotif(style, d) {
  if (!style.motifs) return style;
  const name = d.params?.motif ?? style.params?.motif?.default;
  const m = name && style.motifs[name];
  if (!m) { if (d.params?.motif) throw new Error(`Style "${style.id}" has no motif "${d.params.motif}". Available: ${Object.keys(style.motifs).join(', ')}`); return style; }
  const o = { ...style, motif: name };
  for (const k of ['type', 'types', 'tone', 'layouts', 'matchBackground', 'cutout', 'grounds']) if (m[k] !== undefined && m[k] !== null) o[k] = m[k];
  if (m.palette && style.palettes?.[m.palette]) o.defaultPalette = m.palette;
  if (m.vars) o.vars = { ...(style.vars ?? {}), ...m.vars };
  if (m.params) o.params = { ...(style.params ?? {}), ...m.params };
  return o;
}

function pickDrafts(spec, styles, blender) {
  let drafts = spec.drafts;
  // The automatic choice is made from three.js and HTML styles; when Blender was asked for, from Blender styles only.
  const engines = spec.blender ? 'blender' : 'fast';
  const inSet = (s) => (engines === 'blender' ? s.engine === 'blender' : s.engine !== 'blender');
  if (drafts === 'auto' && engines === 'blender' && !blender) throw new Error(NO_BLENDER_MSG);
  const topics = drafts === 'auto' ? loadTopics(SKILL_ROOT) : null;
  if (drafts === 'auto' && topics) {
    // read what the poster is about and choose art styles, motifs, typography and palettes that suit it
    const sg = suggest(spec.content, topics, styles, usableTypes(), { count: Math.max(1, spec.count), engines, seed: spec.seed, orient: spec.orient });
    log(`topics: ${sg.topics.map((t) => `${t.topic} ${Math.round(t.share * 100)}%`).join(' · ')}`);
    // a layout the caller asked for (spec "layout", --layout) stands; otherwise each draft takes the one chosen for it
    drafts = sg.drafts.map(({ why, ...d }) => (spec.layout ? (({ layout, ...rest }) => rest)(d) : { ...d, autoLayout: !!d.layout }));
    // brand colours given for the whole poster outrank the palette a suggestion would pick
    if (spec.palette) drafts = drafts.map(({ palette, ...d }) => d);
    // …and so does a type theme asked for by name ("type", --type)
    if (spec.type) drafts = drafts.map(({ type, ...d }) => d);
  } else if (drafts === 'auto') {
    const pool = (engines === 'blender' ? AUTO_BLENDER : AUTO_THREE_ONLY).filter((id) => styles[id]);
    const rest = Object.values(styles).filter((s) => !pool.includes(s.id) && inSet(s)).map((s) => s.id);
    drafts = [...pool, ...rest].slice(0, Math.max(1, spec.count)).map((style) => ({ style }));
  }
  const used = new Set(drafts.map((d) => d.style));
  return drafts.map((d, i) => {
    if (!styles[d.style] && STYLE_ALIAS[d.style] && styles[STYLE_ALIAS[d.style][0]]) { const [id, motif] = STYLE_ALIAS[d.style]; d = { ...d, style: id, params: { motif, ...(d.params ?? {}) } }; }
    if (d.motif) d = { ...d, params: { ...(d.params ?? {}), motif: d.motif } };   // "motif" may be written beside "style"
    let style = styles[d.style];
    if (!style && badStyles[d.style]) throw new Error(`Style "${d.style}" could not be loaded — ${badStyles[d.style]}`);
    if (!style) throw new Error(`Unknown style "${d.style}". Available: ${Object.keys(styles).join(', ')}`);
    let substituted = null;
    const ownArt = d.art || (d.scene && !/\.py$/i.test(d.scene));   // draft brings its own non-Blender art layer
    if (style.engine === 'blender' && !blender && !ownArt) {
      // Keep the promise of N drafts: swap in a three.js style that is not already in the set.
      const options = [style.fallback, ...AUTO_THREE_ONLY, ...Object.keys(styles)].filter((id) => id && styles[id] && styles[id].engine === 'three');
      const alt = options.find((id) => !used.has(id)) ?? options[0];
      if (!alt) throw new Error(`Style "${style.id}" needs Blender, which was not found, and no three.js style is available as a fallback.`);
      substituted = { from: style.id, to: alt }; used.add(alt); style = styles[alt];
      // named palettes and scene params belong to the original style; custom colour objects carry over
      d = { ...d, palette: typeof d.palette === 'string' ? undefined : d.palette, params: undefined };
    }
    return { ...d, style: applyMotif(style, d), label: draftLabel(i), substituted };
  });
}

/** A draft may bring its own scene file ("scene": "./my-scene.js" or ".py") while keeping the style's type and palettes. */
function withCustomScene(style, scene, baseDir, blender) {
  if (!scene) return style;
  const file = path.resolve(baseDir, scene);
  if (!fs.existsSync(file)) throw new Error(`Custom scene not found: ${scene}`);
  // .py is a Blender scene; .js is a three.js scene — or an HTML scene (DOM and SVG drawn in the poster
  // page) when the draft's style is an HTML style or the file is named *.html.js
  const engine = /\.py$/i.test(file) ? 'blender' : style.engine === 'html' || /\.html\.m?js$/i.test(file) ? 'html' : 'three';
  if (engine === 'blender' && !blender) throw new Error(`Custom scene ${scene} needs Blender, which was not found (see \`node scripts/doctor.mjs\`).`);
  return { ...style, engine, sceneFile: file };
}

/** Stylesheets inside the skill are served under /skill/ so the relative url()s in them (fonts) resolve. */
const cssUrl = (file) => (path.resolve(file).startsWith(SKILL_ROOT + path.sep) ? skillUrl(path.relative(SKILL_ROOT, file)) : fileUrl(file));

/** Keep the art cache bounded: newest 120 files / ~1.5 GB. */
function pruneCache(dir) {
  try {
    const files = fs.readdirSync(dir).filter((f) => /^art-.*\.png$/.test(f)).map((f) => { const st = fs.statSync(path.join(dir, f)); return { f, t: st.mtimeMs, size: st.size }; }).sort((a, b) => b.t - a.t);
    let total = 0;
    files.forEach((x, i) => { total += x.size; if (i >= 120 || total > 1.5e9) fs.rmSync(path.join(dir, x.f), { force: true }); });
  } catch { /* cache is best-effort */ }
}

// ------------------------------------------------------------------ rendering
async function renderThreeArt(browser, job, outFile) {
  const page = await newPage(browser, { width: 960, height: 540 });
  try {
    await page.goto(skillUrl('assets/web/art.html'));
    await page.waitForFunction(() => typeof window.renderArt === 'function', null, { timeout: 30000 });
    const res = await page.evaluate((j) => window.renderArt(j), job);
    fs.writeFileSync(outFile, Buffer.from(res.png, 'base64'));
    return { calls: res.calls, triangles: res.triangles };
  } catch (e) {
    const extra = page.logs.length ? `\n  page log:\n    ${page.logs.slice(-8).join('\n    ')}` : '';
    throw new Error(`three.js scene failed: ${e.message.split('\n')[0]}${extra}`);
  } finally { await page.closeAll(); }
}

async function composeDraft(browser, cjob, vw, vh, emit) {
  const page = await newPage(browser, { width: vw, height: vh });
  try {
    await page.goto(skillUrl('assets/web/compose.html'));
    await page.waitForFunction(() => typeof window.compose === 'function', null, { timeout: 30000 });
    const rep = await page.evaluate((j) => window.compose(j), cjob);
    const result = await emit(page, rep);
    return { rep, result, logs: page.logs };
  } finally { await page.closeAll(); }
}

async function imageToJpeg(browser, srcFile, outFile, w, h, quality = 86) {
  const page = await newPage(browser, { width: w, height: h });
  try {
    await page.setContent(`<style>html,body{margin:0;background:#000}img{display:block;width:100vw;height:100vh;object-fit:fill}</style><img src="${fileUrl(srcFile)}">`);
    await page.waitForFunction(() => { const i = document.images[0]; return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 60000 });
    await capture(page, (p) => p.screenshot({ path: outFile, type: 'jpeg', quality }));
  } finally { await page.closeAll(); }
}

async function contactSheet(browser, items, outFile, spec) {
  const a = spec.format.width / spec.format.height, n = items.length;
  const cols = a < 0.9 ? Math.min(n, 4) : a < 1.25 ? Math.min(n, 3) : n <= 3 ? 1 : 2;
  const cellW = cols === 1 ? 1500 : a < 0.9 ? 620 : 900, cellH = Math.round(cellW / a), gap = 36, pad = 44, cap = 62;
  const rows = Math.ceil(n / cols);
  const W = pad * 2 + cols * cellW + (cols - 1) * gap, H = pad * 2 + rows * (cellH + cap) + (rows - 1) * gap;
  const html = `<style>html,body{margin:0;background:#17171a;font:500 22px/1.2 system-ui,sans-serif;color:#e9e9ee}
  .g{display:grid;grid-template-columns:repeat(${cols},${cellW}px);gap:${gap}px;padding:${pad}px}
  .c img{display:block;width:${cellW}px;height:${cellH}px;border-radius:6px;box-shadow:0 8px 40px #0008}
  .c div{height:${cap}px;display:flex;align-items:center;gap:14px}.c b{font-size:26px;color:#fff}.c span{color:#9a9aa6}</style>
  <div class="g">${items.map((it) => `<div class="c"><img src="${fileUrl(it.file)}"><div><b>${it.label}</b>${it.style} <span>· ${it.engine} · ${it.palette} · ${it.layout}</span></div></div>`).join('')}</div>`;
  const page = await newPage(browser, { width: W, height: H });
  try {
    await page.setContent(html);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 60000 });
    await capture(page, (p) => p.screenshot({ path: outFile, type: 'jpeg', quality: 88 }));
  } finally { await page.closeAll(); }
}

// ------------------------------------------------------------------ main
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { log(HELP); return 0; }
  const specFile = args._[0];
  let raw = {};
  if (specFile) {
    if (!fs.existsSync(specFile)) throw new Error(`Spec file not found: ${specFile}`);
    try { raw = JSON.parse(fs.readFileSync(specFile, 'utf8')); } catch (e) { throw new Error(`Spec is not valid JSON (${specFile}): ${e.message}`); }
  }
  const baseDir = specFile ? path.dirname(path.resolve(specFile)) : process.cwd();
  const extraDirs = [args['style-dir'], ...(Array.isArray(raw.styleDirs) ? raw.styleDirs : raw.styleDirs ? [raw.styleDirs] : [])]
    .filter(Boolean).map((d) => path.resolve(baseDir, d));
  const styles = loadStyles(extraDirs);
  // Blender is looked for only when something needs it: the catalogue, a request for Blender
  // ("blender": true, --blender), or a draft that names a Blender style or a .py scene.
  const usesBlender = (d) => { const id = typeof d === 'string' ? d.trim() : d?.style; return styles[STYLE_ALIAS[id]?.[0] ?? id]?.engine === 'blender' || /\.py$/i.test((typeof d === 'object' && d?.scene) || ''); };
  const named = args.styles ?? raw.drafts ?? raw.styles;
  const namedList = Array.isArray(named) ? named : typeof named === 'string' && named !== 'auto' ? named.split(',') : [];
  const wantBlender = args['list-styles'] || args.blender || raw.blender === true || namedList.some(usesBlender);
  const blender = args['no-blender'] || !wantBlender ? null : findBlender();
  if (args['list-styles']) { log(listStyles(styles, blender)); return 0; }
  if (!specFile) { log(HELP); return 2; }

  // One spec can be rendered in several formats (e.g. 16:9 for screens and A3 portrait for print):
  // "format": ["2k", "a3"] or --format 2k,a3. Each format gets its own sub-folder.
  const wanted = args.format ?? raw.format;
  const fmtList = (Array.isArray(wanted) ? wanted : typeof wanted === 'string' && wanted.includes(',') ? wanted.split(',') : [wanted]).map((f) => (typeof f === 'string' ? f.trim() : f));
  const outRoot = path.resolve(args.out ?? raw.output?.dir ?? 'poster-out');
  const hashOf = (...rel) => sha(rel.map((r) => fileHash(path.join(SKILL_ROOT, r))).join(''));
  const env = { args, raw, baseDir, styles, blender, libHashes: { three: hashOf('assets/web/art.js', 'assets/web/scene-lib.js', 'assets/vendor/three.bundle.min.js'), blender: hashOf('scripts/blender/render.py', 'scripts/blender/common.py') } };
  env.browser = await launchBrowser();
  let failedTotal = 0;
  try {
    for (const fmt of fmtList) {
      const spec = normalizeSpec(raw, { format: fmt, resolution: args.resolution, quality: args.quality, styles: args.styles, formats: args.formats, seed: args.seed, count: args.count, viewing: args.viewing, bleed: args.bleed, blender: args.blender });
      if (spec.content.lifted) console.log(`event information taken out of the footer → ${spec.content.meta.map((m) => `${m.label}: ${m.value}`).join('  ·  ')}   (set "meta" yourself, or "keyFacts": false, if this is wrong)`);
      if (args.type) spec.type = args.type;
      if (args.layout) spec.layout = args.layout;
      if (!spec.content.title) throw new Error('The spec needs at least content.title.');
      if (args.suggest) {
        const topics = loadTopics(SKILL_ROOT);
        if (!topics) throw new Error('assets/topics.json is missing — cannot suggest.');
        const n = Math.max(6, Number(args.count) || 0);
        const engines = spec.blender ? 'blender' : 'fast';
        const sg = suggest(spec.content, topics, styles, usableTypes(), { count: n, engines, seed: spec.seed, orient: spec.orient });
        const show = (d) => log(`  ${JSON.stringify(Object.fromEntries(Object.entries(d).filter(([k]) => k !== 'why')))}   // ${d.why}`);
        log(`topics: ${sg.topics.map((t) => `${t.topic} ${Math.round(t.share * 100)}%${t.hits.length ? ` (${t.hits.slice(0, 4).join(', ')})` : ''}`).join(' · ')}`);
        for (const t of sg.topics.slice(0, 2)) { const d = topics[t.topic]; if (d?.composition) log(`  ${t.topic}: ${d.composition}${d.avoid ? `  Avoid: ${[].concat(d.avoid).join('; ')}` : ''}`); }
        if (engines === 'blender') {
          log(`\ntechniques, type themes and palettes that suit this copy (Blender was asked for: every poster uses it), best first. Conceive the three motifs from the copy yourself and build them (SKILL.md steps 3–4); the motifs printed here are stock ones — take one only if it is the picture you had in mind:`);
          sg.drafts.forEach(show);
          if (!blender) log(`\n! ${NO_BLENDER_MSG}`);
        } else {
          log(`\ntechniques, type themes and palettes that suit this copy (three.js and HTML — the default set), best first. Conceive the three motifs from the copy yourself and build them (SKILL.md steps 3–4); the motifs printed here are stock ones — take one only if it is the picture you had in mind:`);
          sg.drafts.forEach(show);
          log(`\nonly if the user asks for Blender ("블렌더 사용해서", a Blender style or a 3D material by name): add --blender and all three posters become Blender ones (minutes each). That set would lead with:`);
          suggest(spec.content, topics, styles, usableTypes(), { count: 3, engines: 'blender', seed: spec.seed, orient: spec.orient }).drafts.forEach(show);
        }
        return 0;
      }
      const outDir = fmtList.length > 1 ? path.join(outRoot, String(spec.format.label).replace(/[^\w.-]+/g, '-')) : outRoot;
      if (fmtList.length > 1) log(`\n━━ ${spec.format.label} → ${path.relative(process.cwd(), outDir)}`);
      failedTotal += await renderSet(spec, outDir, env);
    }
  } finally { await env.browser.close(); }
  return failedTotal ? 1 : 0;
}

/** Render every draft of one spec at one format into `outDir`. Returns the number of failed drafts. */
async function renderSet(spec, outDir, { args, raw, baseDir, styles, blender, libHashes, browser }) {
  // W × H is the page that gets rendered: the trim size plus print bleed on every side (if any).
  const B = spec.bleedPx, W = spec.format.width + 2 * B, H = spec.format.height + 2 * B;
  if (Math.max(W, H) > MAX_PNG_EDGE && spec.formats.some((f) => f !== 'pdf')) throw new Error(`${W}x${H} is beyond what a single PNG render supports (${MAX_PNG_EDGE}px). Lower the dpi/longEdge, or output pdf only.`);
  const q = QUALITY[spec.quality];
  const prevDir = path.join(outDir, 'previews');
  fs.mkdirSync(prevDir, { recursive: true });
  // Art layers are cached per user, not per output folder, so trying a spec in another folder or
  // format never repeats a multi-minute Blender render that already exists.
  let cacheDir = process.env.POSTER_CACHE || path.join(os.homedir(), '.cache', 'namokposter', 'art');
  try { fs.mkdirSync(cacheDir, { recursive: true }); fs.accessSync(cacheDir, fs.constants.W_OK); }
  catch { cacheDir = path.join(outDir, '.cache'); fs.mkdirSync(cacheDir, { recursive: true }); }
  pruneCache(cacheDir);

  let drafts = pickDrafts(spec, styles, blender);
  if (args.only) {
    const want = String(args.only).split(',').map((s) => s.trim().toLowerCase());
    drafts = drafts.filter((d) => want.includes(d.label.toLowerCase()) || want.includes(d.style.id));
    if (!drafts.length) throw new Error(`--only ${args.only} matched no poster.`);
  }

  log(`namokposter  ${spec.name}  ${W}×${H} (${spec.format.label}${B ? ` + ${spec.bleedMm} mm bleed` : ''}, ${spec.format.density} dpi, ${spec.orient}, viewing=${spec.viewing})  quality=${spec.quality}`);
  log(blender ? `blender: ${blender.kind} ${blender.version}${spec.blender ? ' (asked for: every automatic poster uses it)' : ''}`
    : drafts.some((d) => d.substituted) ? 'blender: not available → a three.js style stands in for each Blender style'
    : 'engines: three.js + HTML (Blender styles are used only when asked for: "blender": true or --blender)');
  const results = []; let failed = 0;
  try {
    for (const d of drafts) {
      let style = d.style; const t0 = Date.now();
      const notes = [];
      const res = { label: d.label, style: style.id, engine: style.engine, kind: style.kind, notes };
      if (style.motif) res.motif = style.motif;
      results.push(res);
      if (d.substituted) notes.push({ level: 'warn', code: 'style-substituted', msg: `Style "${d.substituted.from}" needs Blender (not found); rendered "${d.substituted.to}" instead.` });
      try {
        style = withCustomScene(style, d.scene, baseDir, blender); res.engine = style.engine;
        const palette = resolvePalette(style, spec.palette, d.palette);
        let layout = resolveLayout(spec.orient, style, d.layout ?? spec.layout);
        const params = { ...Object.fromEntries(Object.entries(style.params ?? {}).map(([k, v]) => [k, v?.default ?? v])), ...(d.params ?? {}) };
        // A parameter marked {"from": "title"} (letterform styles) takes its characters from the headline unless the draft sets it.
        for (const [k, v] of Object.entries(style.params ?? {})) {
          if (v?.from === 'title' && d.params?.[k] === undefined) params[k] = titleInitials(spec.content.title) || params[k];
        }
        const seed = Number.isFinite(Number(d.seed)) ? Number(d.seed) : spec.seed;
        res.palette = palette.name; res.layout = layout.layout; res.seed = seed;

        // ---- typography job (used twice: once to measure the copy, once for the final composite)
        const c = d.content ? normalizeContent({ ...spec.rawContent, ...d.content }) : spec.content;
        const content = {
          ...c,
          logo: assetUrl(c.logo, baseDir, notes, 'logo'),
          logos: c.logos.map((p) => assetUrl(p, baseDir, notes, 'logo')).filter(Boolean),
          qr: /\.(png|jpe?g|svg|webp)$/i.test(c.qr) ? assetUrl(c.qr, baseDir, notes, 'qr image') : c.qr,
          slots: c.slots.map((sl) => ({ ...sl, html: localizeUrls(String(sl.html ?? ''), baseDir) })),
        };
        // A style's own default theme gives way to one whose faces are installed (package without the font pack).
        const usable = usableTypes();
        const ownType = [style.type, ...(style.types ?? []), 'bold'].find((t) => t && usable.includes(t)) ?? style.type;
        const type = resolveType(String(d.type ?? spec.type ?? ownType), baseDir);
        if (type.standIn) notes.push({ level: 'warn', code: 'font-from-outside-missing', msg: `${type.standIn} is not in the font cache (cleared, or fetched on another machine), so the poster is set in the bundled theme "${type.id}" it was built on. Fetch the face again (node scripts/fonts.mjs add) or tell the user the bundled theme was used.` });
        const lacking = missingFaces(type.file);
        if (lacking.length) notes.push({ level: 'warn', code: 'font-pack-missing', msg: `Type theme "${type.id}" is built on ${lacking.join(', ')}, which ${lacking.length > 1 ? 'are' : 'is'} not installed (assets/fonts-extra is absent), so fallback faces are used. Use one of: ${usable.join(', ')} — or install the full package.` });
        res.type = type.id;
        // a face fetched from outside the bundle (scripts/fonts.mjs add) is named in the report with its licence and source
        const outside = fontFromOutside(type.file);
        if (outside) { res.fontsFromOutside = [outside]; notes.push({ level: 'info', code: 'font-from-outside', msg: `Headline face ${outside.family} is not bundled: ${outside.licence}${outside.licenceNote ? ` (${outside.licenceNote})` : ''}, ${{ file: 'from a file the user gave', installed: 'installed on this computer', asked: 'asked for by the user, fetched from' }[outside.origin] ?? 'fetched from'}${['file', 'installed'].includes(outside.origin) ? '' : ` ${outside.source}`}. Say so at delivery.` }); }
        const styleCss = path.join(style.dir, 'style.css');      // optional decoration that belongs to one scene
        const cjob = {
          width: W, height: H, bleed: B, orient: spec.orient, content, palette, layout,
          style: { id: style.id, tone: luminance(parseHex(palette.bg)) < 0.2 ? 'dark' : 'light' },
          type: type.id, viewing: d.viewing ?? spec.viewing, framed: d.framed ?? spec.framed,
          css_urls: [...fontsExtraCss().map(cssUrl), cssUrl(type.file), fs.existsSync(styleCss) ? cssUrl(styleCss) : null].filter(Boolean),
          matchBackground: (d.matchBackground ?? style.matchBackground) === true,
          art: null,
          fonts: { ...(spec.fonts ?? {}), ...(d.fonts ?? {}) }, css: localizeUrls([spec.css, d.css].filter(Boolean).join('\n'), baseDir),
          vars: { ...(style.kind === 'picture' ? { '--halo': 0.5 } : {}), ...(style.vars ?? {}), ...(d.vars ?? {}) }, typeScale: (spec.typeScale || 1) * (d.typeScale || 1),
          margin: d.margin ?? spec.margin, lang: spec.lang,
          fontFaces: spec.fontFaces.map((f) => ({ ...f, src: assetUrl(f.src, baseDir, notes, 'font file') })).filter((f) => f.src),
        };

        // ---- pass 1: lay out the copy alone, then give the 3D subject the space that is left
        let pre = await composeDraft(browser, cjob, W, H, async () => {});
        // A layout chosen automatically has to hold this copy; if it does not, the style's own layout takes over.
        // (it may overflow, or leave a subject on a plain ground too little room to be seen)
        if (d.autoLayout && (pre.rep.notes.some((n) => n.level === 'error') || pre.rep.typeScale < 0.8 || ((style.kind ?? 'object') !== 'picture' && placeArt(layout, pre.rep.bounds, W, H).artSize < 0.3))) {
          const own = resolveLayout(spec.orient, style, undefined);
          if (own.layout !== layout.layout) { layout = own; cjob.layout = layout; res.layout = layout.layout; pre = await composeDraft(browser, cjob, W, H, async () => {}); }
        }
        const placedByHand = layout.focus != null || layout.artSize != null;   // the spec says where the subject goes: leave it there
        // A subject that stands on plain ground (not a picture that fills the sheet, not a style that is itself a ground)
        const objectStyle = (style.kind ?? 'object') !== 'picture' && style.ground !== true && style.engine !== 'none' && !d.art;
        layout = placeArt(layout, pre.rep.bounds, W, H);
        cjob.layout = layout;
        res.focus = layout.focus; res.artSize = layout.artSize;

        // ---- ground: a second style drawn under the subject, which is then rendered as a cut-out
        // (a clay still life on a checkerboard, a felt fruit bowl on a grainy gradient, numerals on bokeh)
        let ground = null;
        if (d.ground && d.substituted) notes.push({ level: 'warn', code: 'ground-dropped', msg: `The ground was left out: it was chosen for "${d.substituted.from}", which could not be rendered without Blender.` });
        else if (d.ground) {
          const g = typeof d.ground === 'string' ? { style: d.ground } : { ...d.ground };
          if (g.motif) g.params = { ...(g.params ?? {}), motif: g.motif };
          const grounds = Object.values(styles).filter((x) => x.ground === true && x.engine !== 'blender').map((x) => x.id);
          if (!styles[g.style]) throw new Error(`Unknown ground style "${g.style}". Grounds: ${grounds.join(', ')}`);
          const gs = applyMotif(styles[g.style], g);
          if (gs.ground !== true || gs.engine === 'blender') throw new Error(`"${gs.id}" is not a ground (a field drawn by three.js or HTML that a subject can stand on). Use one of: ${grounds.join(', ')}`);
          if (!(style.engine === 'html' || style.cutout === true || d.scene)) throw new Error(`Style "${style.id}" cannot stand on a ground: it has no cut-out form. Styles that do: ${Object.values(styles).filter((x) => x.engine === 'html' ? x.kind !== 'picture' : x.cutout === true).map((x) => x.id).join(', ')}`);
          // A ground sits behind a subject and beside the copy, so by default it is tonal: its inks are
          // the page colour leaning towards the palette's colours. "soft": false uses them at full strength;
          // "palette" (a name from the ground style, or an object) sets them outright. The page colour stays.
          let gpal;
          if (g.palette) gpal = { ...resolvePalette(gs, g.palette), bg: palette.bg, ink: palette.ink, muted: palette.muted };
          else if (g.soft === false) gpal = { ...palette };
          else {
            // tints of the palette's most colourful inks (a grey checkerboard reads as "transparent", not as a pattern)
            const sat = (h) => { const [, sv, l] = rgbToHsl(parseHex(h)); return sv * (1 - Math.abs(2 * l - 1)); };
            const inks = [...new Set([palette.accent, ...palette.colors])].sort((x, y) => sat(y) - sat(x));
            const t1 = inks[0], t2 = inks[1] ?? inks[0];
            gpal = { ...palette, colors: [mixHex(palette.bg, t1, 0.34), mixHex(palette.bg, t1, 0.1), mixHex(palette.bg, t2, 0.32), mixHex(palette.bg, palette.ink, 0.14)] };
          }
          ground = { style: gs, palette: gpal, seed: Number.isFinite(Number(g.seed)) ? Number(g.seed) : seed,
            params: { ...Object.fromEntries(Object.entries(gs.params ?? {}).map(([k, v]) => [k, v?.default ?? v])), ...(g.params ?? {}) } };
          res.ground = gs.motif ? `${gs.id}/${gs.motif}` : gs.id;
          cjob.cutout = true;
        }

        // ---- art layers: an image rendered ahead (three.js, Blender) or an HTML scene drawn in the page
        let artMs = 0, cachedArt = false;
        const renderLayer = async (st, { params: prm, seed: sd, palette: pl, transparent = false, tag = d.label }) => {
          let scale = Math.min(1, Number(d.artScale ?? q.artScale));
          // Print is 300 dpi throughout: up to A3 (17.4 megapixels) the 3D layer is path-traced at every
          // pixel of the sheet. Beyond that — A2 and larger — standard quality renders it at A3's pixel
          // count and scales it (type and vector PDF stay full resolution); "high" renders every pixel.
          if (st.engine === 'blender' && d.artScale == null && spec.quality === 'standard') scale = Math.min(scale, Math.sqrt(MAX_BLENDER_PIXELS / (W * H)));
          const cap = st.engine === 'three' ? MAX_THREE_EDGE : 16384;
          scale = Math.min(scale, cap / Math.max(W, H));
          const aw = Math.max(16, Math.round(W * scale)), ah = Math.max(16, Math.round(H * scale));
          const samples = Math.max(1, Math.round((d.samples ?? st.samples?.[spec.quality] ?? q.samples)));
          // Blender renders are expensive, so they only see the stable nominal text zone; three.js
          // scenes get the measured copy box (they re-render in seconds when it moves).
          const stable = st.engine !== 'three';
          const lay = { focus: layout.focus, artSize: layout.artSize, artRect: layout.artRect, layout: layout.layout, halign: layout.halign, valign: layout.valign,
            text: stable ? layout.text : layout.copy, quiet: stable ? [layout.text, layout.aside?.zone].filter(Boolean) : layout.quiet };
          const key = sha(JSON.stringify([st.id, sceneHash(st.sceneFile), libHashes[st.engine], aw, ah, { bg: pl.bg, ink: pl.ink, accent: pl.accent, colors: pl.colors }, sd, lay, prm, st.engine === 'blender' ? samples : 0, spec.orient, transparent ? 'cutout' : 0, transparent && d.shadow === false ? 'noshadow' : 0]));
          const file = path.join(cacheDir, `art-${st.id}-${key.slice(0, 12)}.png`);
          const cached = !args['no-cache'] && fs.existsSync(file) && fs.statSync(file).size > 1000;
          if (!cached) {
            const ta = Date.now();
            const job = { width: aw, height: ah, orient: spec.orient, palette: pl, seed: sd, params: prm, quality: spec.quality, layout: lay, transparent, ...(transparent && d.shadow === false ? { shadow: false } : {}) };
            if (st.engine === 'three') {
              process.stdout.write(`  ${tag} ${st.id}: three.js ${aw}×${ah}${transparent ? ' (cut-out)' : ''} … `);
              await renderThreeArt(browser, { ...job, sceneUrl: cssUrl(st.sceneFile) }, file);
            } else {
              process.stdout.write(`  ${tag} ${st.id}: Blender Cycles ${aw}×${ah}, ${samples} spp${transparent ? ' (cut-out)' : ''} … `);
              const jobFile = path.join(cacheDir, `job-${st.id}-${key.slice(0, 12)}.json`);
              const tmpOut = file.replace(/\.png$/, '.tmp.png');
              fs.writeFileSync(jobFile, JSON.stringify({ ...job, scene: st.sceneFile, out: tmpOut, samples,
                // a cut-out traces its shadow as a second pass, which runs to the same limit: share the time between the two
                timeLimit: Math.round((d.timeLimit ?? q.timeLimit) * (transparent && d.shadow !== false ? 0.6 : 1)), device: process.env.POSTER_DEVICE ?? 'auto' }));
              await renderBlender(blender, jobFile);
              if (!fs.existsSync(tmpOut)) throw new Error('Blender finished but wrote no image.');
              fs.renameSync(tmpOut, file); fs.rmSync(jobFile, { force: true });
            }
            artMs += Date.now() - ta;
            log(`done in ${fmtSecs(Date.now() - ta)}`);
          }
          return { file, cached };
        };
        const htmlJob = (st, prm, sd, extra = {}) => ({ sceneUrl: `${cssUrl(st.sceneFile)}?v=${sceneHash(st.sceneFile).slice(0, 10)}`, params: prm, seed: sd, motif: st.motif ?? null, kind: st.kind, ...extra });

        if (ground) {
          if (ground.style.engine === 'html') cjob.groundHtml = htmlJob(ground.style, ground.params, ground.seed, { palette: ground.palette, role: 'ground' });
          else { const r = await renderLayer(ground.style, { params: ground.params, seed: ground.seed, palette: ground.palette, tag: `${d.label} ground` }); cjob.ground = `${fileUrl(r.file)}?v=${fs.statSync(r.file).mtimeMs}`; }
        }
        // ---- pass 2: final composite
        const base = `${spec.name}-${d.label}-${style.id}`;
        const files = {}; res.partial = files;
        const raster = spec.formats.filter((f) => f !== 'pdf');
        const main = raster[0] ?? 'png';
        // The subject of an object style stands on plain ground beside the copy. Its drawn shape can
        // reach past the space it was given and touch the copy (a wide still life beside a long
        // headline). Shrinking it or pushing the copy over it both look wrong, so the layout changes:
        // a layout that was chosen automatically gives way to the style's own, once; a layout the
        // spec asked for is kept and reported. Copy that lies on the picture on purpose — a picture
        // that fills the sheet, the `center` layout, a ground — is left alone.
        const besideCopy = () => objectStyle && layout.layout.replace(/-mirror$/, '') !== 'center' && !ground && !placedByHand;
        const touching = (r) => Object.entries(r.contrast ?? {}).filter(([k, v]) => ['title', 'subtitle', 'meta', 'body'].includes(k) && (v.near ?? 0) >= 0.006).map(([k]) => k);
        let artFile = null, rep, logs, relaid = false;
        for (let turn = 0; ; turn++) {
          artFile = null;
          if (d.art || style.engine === 'none') {
            // user-supplied artwork (photo, illustration, an earlier render) instead of a generated scene
            if (d.art) { artFile = path.resolve(baseDir, d.art); if (!fs.existsSync(artFile)) throw new Error(`art image not found: ${d.art}`); }
          } else if (style.engine === 'html') {
            // An HTML scene is not rendered ahead: it is drawn in the poster page itself, under the copy, once
            // the copy has been placed — so it stays vector in the PDF and can be made from the words.
            cjob.html = htmlJob(style, params, seed);
          } else {
            const r = await renderLayer(style, { params, seed, palette, transparent: !!ground });
            artFile = r.file; cachedArt = r.cached;
          }
          cjob.art = artFile ? `${fileUrl(artFile)}?v=${fs.statSync(artFile).mtimeMs}` : null;

          ({ rep, logs } = await composeDraft(browser, cjob, W, H, async (page, rep0) => {
            for (const f of raster.length ? raster : ['png']) {
              const file = path.join(raster.length ? outDir : cacheDir, `${base}.${f}`);
              await capture(page, (p) => p.screenshot({ path: file, type: f === 'jpg' ? 'jpeg' : 'png', ...(f === 'jpg' ? { quality: 93 } : {}) }));
              tagDensity(file, spec.format.density);   // 300 dpi unless the format says otherwise
              if (raster.length) files[f] = file; else files._tmp = file;
            }
            // contrast QA: what is actually behind each line of copy?
            try {
              await page.evaluate(() => window.hideCopy(true));
              const bg = await capture(page, (p) => p.screenshot({ type: 'jpeg', quality: 70 }));
              const bgUrl = `data:image/jpeg;base64,${bg.toString('base64')}`;
              rep0.contrast = await page.evaluate(([u, r]) => window.measureContrast(u, r), [bgUrl, rep0]);
            } catch (e) {   // the poster itself is already on disk; only the automatic check is missing
              notes.push({ level: 'warn', code: 'contrast-unchecked', msg: `Contrast could not be measured (${String(e.message).split('\n')[0]}); check legibility by eye.` });
            }
          }));
          if (relaid || !besideCopy() || !touching(rep).length || !d.autoLayout) break;
          const own = resolveLayout(spec.orient, style, undefined);
          if (own.layout === layout.layout) break;
          notes.push({ level: 'info', code: 'layout-changed', msg: `In the "${layout.layout}" layout the subject touched the copy (${touching(rep).join(', ')}); the style's own layout "${own.layout}" is used instead.` });
          relaid = true;
          cjob.layout = own; res.layout = own.layout;
          pre = await composeDraft(browser, cjob, W, H, async () => {});
          layout = placeArt(own, pre.rep.bounds, W, H); cjob.layout = layout; res.focus = layout.focus; res.artSize = layout.artSize;
        }
        if (besideCopy() && touching(rep).length) notes.push({ level: 'warn', code: 'subject-touches-copy', msg: `The subject comes right up to the copy (${touching(rep).join(', ')}). Give this poster another layout (the style lists the ones it carries), or place the subject by hand: "layout": {"layout": "${layout.layout}", "focus": [x, y], "artSize": 0.4}.` });
        for (const l of logs) if (/404|pageerror|\[external\]|\[failed\]/.test(l)) notes.push({ level: 'warn', code: 'page-log', msg: l });
        notes.push(...rep.notes);
        // A subject on a plain ground belongs beside the copy, not under it (layouts that set copy on the
        // art — "center" — are judged by contrast alone).
        const overArt = Object.entries(rep.contrast ?? {}).filter(([k, v]) => ['title', 'subtitle', 'meta', 'body'].includes(k) && (v.busy ?? 0) >= 0.2).map(([k, v]) => `${k} ${Math.round(v.busy * 100)}%`);
        res.busy = Math.max(0, ...Object.entries(rep.contrast ?? {}).filter(([k]) => ['title', 'subtitle', 'meta', 'body'].includes(k)).map(([, v]) => v.busy ?? 0));
        if (overArt.length && (style.kind ?? 'object') !== 'picture' && layout.layout !== 'center') notes.push({ level: 'warn', code: 'copy-over-art', msg: `The subject runs under the copy (${overArt.join(', ')}). Use another layout, or move the subject: "layout": {"layout": "${layout.layout}", "focus": [x, y], "artSize": 0.4}.` });
        for (const [k, cst] of Object.entries(rep.contrast ?? {})) {
          const big = k.startsWith('title') || (rep.items[k]?.fontPx ?? 0) >= Math.min(W, H) * 0.022;
          const label = k === 'eyebrow';   // a short, letter-spaced label; the labels of the information block are information and held to the body standard
          const needTyp = big ? 3 : label ? 3.6 : 4.5, needWorst = big ? 2.3 : label ? 2.6 : 3;
          if (cst.typical < needTyp || cst.worst < needWorst) notes.push({ level: cst.typical < needTyp * 0.75 || cst.worst < needWorst * 0.75 ? 'error' : 'warn', code: 'low-contrast', msg: `"${k}" is hard to read against the art (contrast ${cst.typical}:1 typical, ${cst.worst}:1 worst; want ≥ ${needTyp}:1). ${k.endsWith('-em') || label ? 'It uses the accent colour: set "palette": {"accent": "#…"} to one that separates from the background.' : k === 'footer' || k === 'body' ? 'These use the palette "muted" colour: set it explicitly, pick another palette, or change layout.' : 'Try another palette or ink colour, a different layout, or raise the scrim (vars: {"--scrim": 0.8}).'}` });
        }

        if (spec.formats.includes('pdf')) {
          const dpi = spec.format.density;
          const pw = Math.round((W * 96) / dpi), ph = Math.round((H * 96) / dpi);
          const file = path.join(outDir, `${base}.pdf`);
          await composeDraft(browser, cjob, pw, ph, async (page) => { await page.emulateMedia({ media: 'screen' }); await capture(page, (p) => p.pdf({ path: file, width: `${pw}px`, height: `${ph}px`, printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 }, pageRanges: '1' })); });
          files.pdf = file;
        }

        // small preview for quick viewing / QA
        const srcForPreview = files[main] ?? files._tmp;
        const k = Math.min(1, 1600 / Math.max(W, H));
        let preview = path.join(prevDir, `${base}.jpg`);
        try { await imageToJpeg(browser, srcForPreview, preview, Math.round(W * k), Math.round(H * k)); }
        catch (e) { fs.rmSync(preview, { force: true }); preview = null; notes.push({ level: 'warn', code: 'no-preview', msg: `Preview could not be written (${String(e.message).split('\n')[0]}); the full-size file is fine.` }); }
        if (files._tmp) { fs.rmSync(files._tmp, { force: true }); delete files._tmp; }

        delete res.partial;
        if (rep.bgMatch) res.bgMatch = rep.bgMatch;
        Object.assign(res, { ok: true, files, preview, art: artFile, artCached: cachedArt, artSeconds: Math.round(artMs / 100) / 10, seconds: Math.round((Date.now() - t0) / 100) / 10, titleFit: rep.titleFit, typeScale: rep.typeScale, items: rep.items, contrast: rep.contrast, fonts: rep.fonts });
      } catch (e) {
        failed++; res.ok = false; res.error = e.message;
        for (const f of Object.values(res.partial ?? {})) fs.rmSync(f, { force: true });
        notes.push({ level: 'error', code: 'render-failed', msg: e.message });
        log(`\n  ${d.label} ${style.id}: FAILED — ${e.message}`);
      }
    }

    if (!args.only) {
      // a full run owns the folder: drafts from an earlier run with other styles would only confuse
      const keep = new Set(results.flatMap((r) => [...Object.values(r.files ?? {}), r.preview].filter(Boolean)).map((p) => path.resolve(p)));
      const own = new RegExp(`^${spec.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-[A-Z]-[\\w-]+\\.(png|jpg|pdf)$`);
      let stale = 0;
      for (const dir of [outDir, prevDir]) for (const f of fs.readdirSync(dir)) if (own.test(f) && !keep.has(path.resolve(dir, f))) { fs.rmSync(path.join(dir, f), { force: true }); stale++; }
      if (stale) log(`  (removed ${stale} file(s) left over from an earlier run with different posters)`);
    }

    // report.json uses paths relative to the output folder, so the folder can be moved or shared
    const rel = (p) => (p ? path.relative(outDir, p).split(path.sep).join('/') : p);
    let all = results.map(({ partial, ...r }) => ({ ...r, files: Object.fromEntries(Object.entries(r.files ?? {}).map(([k, v]) => [k, rel(v)])), preview: rel(r.preview), art: rel(r.art) }));
    if (args.only) {
      // re-rendering one draft keeps the others in the report and on the contact sheet
      try {
        const prev = JSON.parse(fs.readFileSync(path.join(outDir, 'report.json'), 'utf8'));
        if (prev.name === spec.name && prev.format?.width === W && prev.format?.height === H) {
          const have = new Set(all.map((r) => r.label));
          all = [...prev.drafts.filter((d) => !have.has(d.label)), ...all].sort((x, y) => x.label.length - y.label.length || x.label.localeCompare(y.label));
        }
      } catch { /* no earlier report: nothing to merge */ }
    }
    const okItems = all.filter((r) => r.ok && r.preview && fs.existsSync(path.resolve(outDir, r.preview)))
      .map((r) => ({ file: path.resolve(outDir, r.preview), label: r.label, style: r.style, engine: r.engine, palette: r.palette, layout: r.layout }));
    let sheet = null;
    if (okItems.length && !args['no-sheet']) {
      sheet = path.join(outDir, 'contact-sheet.jpg');
      try { await contactSheet(browser, okItems, sheet, spec); }
      catch (e) { sheet = null; log(`  (contact sheet skipped: ${String(e.message).split('\n')[0]})`); }
    }

    // every face that came from outside the bundle, once, so whoever uses the posters knows what they carry
    const outsideFonts = [...new Map(all.flatMap((r) => r.fontsFromOutside ?? []).map((f) => [f.family, f])).values()];
    const report = { skill: `namokposter ${VERSION}`, name: spec.name, format: { ...spec.format, bleedMm: spec.bleedMm, bleedPx: B, pageWidth: W, pageHeight: H }, orient: spec.orient, quality: spec.quality, blender: blender ? `${blender.kind} ${blender.version}` : null, contactSheet: rel(sheet), fontsFromOutside: outsideFonts, drafts: all };
    fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));

    // ---- summary
    log('');
    for (const r of results) {
      if (!r.ok) { log(`✗ ${r.label}  ${r.style}  FAILED: ${r.error}`); continue; }
      const f = Object.values(r.files).map((p) => path.relative(process.cwd(), p)).join(', ');
      log(`✓ ${r.label}  ${r.style.padEnd(9)} ${r.engine.padEnd(7)} ${r.motif ? `motif=${r.motif} ` : ''}${r.ground ? `ground=${r.ground} ` : ''}type=${r.type} palette=${r.palette} layout=${r.layout} fit=${Math.round(r.typeScale * 100)}%  ${fmtSecs(r.seconds * 1000)}${r.artCached ? ' (art cached)' : ''}  → ${f}`);
      for (const n of r.notes) log(`    ${n.level === 'error' ? '✗' : '!'} [${n.code}] ${n.msg}`);
    }
    if (sheet) log(`\ncontact sheet: ${path.relative(process.cwd(), sheet)}\npreviews:      ${path.relative(process.cwd(), prevDir)}/  (look at these, not the full-size files)`);
    for (const f of outsideFonts) log(`\nfont from outside the bundle: ${f.family} — ${f.licence}${f.licenceNote ? ` (${f.licenceNote})` : ''}; ${{ file: 'a file the user gave', installed: 'installed on this computer' }[f.origin] ?? f.source} (recorded in report.json; name it at delivery)`);
    const errs = results.flatMap((r) => r.notes.filter((n) => n.level === 'error')).length;
    const warns = results.flatMap((r) => r.notes.filter((n) => n.level === 'warn')).length;
    if (failed) log(`\n${failed} poster(s) failed to render — see the messages above (this is a render problem, not a layout one).`);
    const layoutErrs = errs - failed;
    if (layoutErrs > 0 || warns) log(`\n${layoutErrs} layout/contrast error(s), ${warns} warning(s) — adjust the spec and re-run (art layers are cached).`);
    else if (!failed) log('\nNo layout or contrast problems detected.');
    // The default set leaves Blender out; say what asking for it would bring, so it can be offered at delivery.
    if (spec.drafts === 'auto' && !spec.blender) {
      const topics = loadTopics(SKILL_ROOT);
      if (topics) {
        const alt = suggest(spec.content, topics, styles, usableTypes(), { count: 3, engines: 'blender', seed: spec.seed, orient: spec.orient }).drafts;
        if (alt.length) log(`\nBlender posters are made only when the user asks for them ("블렌더 사용해서" → --blender; minutes each). For this copy that set would be: ${alt.map((d) => `${d.style}${d.motif ? ` (${d.motif})` : ''}`).join(' · ')}`);
      }
    }
  } finally { /* the browser is shared across formats and closed by main() */ }
  return failed;
}

main().then((code) => process.exit(code ?? 0)).catch((e) => {
  console.error(`\nnamokposter error: ${e.message}`);
  if (process.env.POSTER_DEBUG) console.error(e.stack);
  process.exit(e.code === 'NO_PLAYWRIGHT' || e.code === 'NO_CHROMIUM' ? 3 : 2);
});
