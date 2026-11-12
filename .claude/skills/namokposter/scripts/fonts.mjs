#!/usr/bin/env node
// namokposter — faces from outside the bundle, for the day the user asks for one. The skill sets its
// posters in the bundled type themes and does not go looking outside on its own (references/fonts.md).
//
//   node fonts.mjs add "Creepster" --base impact  fetch a face and write a type theme: the bundled theme
//                                                 `impact` with this face leading its headline. Without
//                                                 --asked only faces that pass the font policy get through
//   node fonts.mjs add "Creepster" --asked …      the user named it: the popularity test is skipped
//   node fonts.mjs add --file <font> --base hand  a font file the user gave (never checked: the user's licence)
//   node fonts.mjs add --installed "<family>" …   a face installed on this computer, by its name
//   node fonts.mjs search horror                  when the user asks you to find one: faces that pass, by a name or a mood word
//   node fonts.mjs check "Creepster"              does this face pass, and why (not)
//   node fonts.mjs audit                          the bundled faces against the policy (a Markdown table)
//
// Fetching has two sources and no other: Fontsource (every Google Fonts family, with its licence on
// record) and the checked list in assets/fonts-catalog.json (popular Korean faces that are not on
// Fontsource, each with its licence read at the publisher's own page). A face a publisher gives away
// on its own page is fetched there by hand and then used with --file. Files go to the user's cache
// folder (~/.cache/namokposter/fonts/<id>/, or POSTER_FONT_CACHE), never into the skill or the project.
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = JSON.parse(fs.readFileSync(path.join(SKILL_ROOT, 'assets', 'fonts-catalog.json'), 'utf8'));
const POLICY = CATALOG.policy;
const CACHE = process.env.POSTER_FONT_CACHE || path.join(os.homedir(), '.cache', 'namokposter', 'fonts');
const THEMES_DIR = path.join(SKILL_ROOT, 'assets', 'themes');
const INDEX_DAYS = 7;
const LICENCE_NAME = { 'OFL-1.1': 'SIL Open Font License 1.1', 'Apache-2.0': 'Apache License 2.0', 'UFL-1.0': 'Ubuntu Font Licence 1.0' };
const slug = (s) => String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const log = (...a) => console.log(...a);
class Refused extends Error {}

// ------------------------------------------------------------------ network: allowed hosts only
async function get(url, { binary = false, max = 16e6, timeout = 30000 } = {}) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !POLICY.hosts.includes(u.host)) throw new Refused(`${u.host} is not a host fonts are fetched from (allowed: ${POLICY.hosts.join(', ')})`);
  if (process.env.POSTER_FONTS_OFFLINE) throw new Error('offline (POSTER_FONTS_OFFLINE is set)');
  const res = await fetch(url, { signal: AbortSignal.timeout(timeout), redirect: 'follow' });
  if (!POLICY.hosts.includes(new URL(res.url).host)) throw new Refused(`${url} redirects to ${new URL(res.url).host}, which is not an allowed host`);
  if (!res.ok) throw new Error(`${u.host} answered ${res.status} for ${u.pathname}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > max) throw new Refused(`${u.pathname.split('/').pop()} is ${(buf.length / 1e6).toFixed(1)} MB, over the limit of ${(max / 1e6).toFixed(0)} MB`);
  return binary ? buf : buf.toString('utf8');
}

// ------------------------------------------------------------------ the two indexes (kept a week in the cache)
async function index(name, url, shrink, parse = JSON.parse) {
  const file = path.join(CACHE, '_index', `${name}.json`);
  const age = fs.existsSync(file) ? (Date.now() - fs.statSync(file).mtimeMs) / 864e5 : Infinity;
  if (age < INDEX_DAYS) return JSON.parse(fs.readFileSync(file, 'utf8'));
  try {
    const data = shrink(parse(await get(url, { max: 12e6, timeout: 45000 })));
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data));
    return data;
  } catch (e) {
    if (e instanceof Refused) throw e;
    if (fs.existsSync(file)) { console.error(`(could not refresh the ${name} index: ${e.message}; using the copy of ${Math.round(age)} days ago)`); return JSON.parse(fs.readFileSync(file, 'utf8')); }
    throw new Error(`the ${name} index could not be fetched (${e.message}), so popularity and licence cannot be checked`);
  }
}
/** { family → { rank, korean } } from Google Fonts' own figures, and the Korean families in order of use. */
async function popularity() {
  const fams = await index('google-popularity', 'https://fonts.google.com/metadata/fonts',
    (j) => Object.fromEntries(j.familyMetadataList.map((f) => [f.family, { rank: f.popularity, korean: (f.subsets ?? []).includes('korean') }])));
  const korean = Object.entries(fams).filter(([, v]) => v.korean).sort((a, b) => a[1].rank - b[1].rank).map(([k]) => k);
  return { fams, korean };
}
const fontsourceList = () => index('fontsource', 'https://api.fontsource.org/v1/fonts',
  (j) => j.map((f) => ({ id: f.id, family: f.family, subsets: f.subsets, weights: f.weights, styles: f.styles, category: f.category, license: f.license, type: f.type, variable: !!f.variable })));
/** { family → { tag → 0–100 } }: the mood and genre tags Google Fonts keeps for its families (google/fonts, tags/all/families.csv),
 *  such as halloween, brush, vintage, formal, pixel, childlike, blackletter. Tags under 40 and the /Quality/ marks are dropped. */
const tagIndex = () => index('google-tags', 'https://raw.githubusercontent.com/google/fonts/main/tags/all/families.csv', (rows) => {
  const out = {};
  for (const line of rows) {
    const m = line.match(/^([^,"]+),,(\/[^,]+),(\d+(?:\.\d+)?)\s*$/);   // a whole-family tag (a tag tied to one axis value has a second column)
    if (!m || m[2].startsWith('/Quality/') || Number(m[3]) < 40) continue;
    (out[m[1]] ??= {})[m[2].split('/').pop().toLowerCase()] = Number(m[3]);
  }
  return out;
}, (text) => text.split('\n'));
// words people use for a voice, in English and Korean → the Google Fonts tags that answer them
const MOOD = {
  horror: ['halloween', 'distressed'], spooky: ['halloween'], scary: ['halloween'], 공포: ['halloween', 'distressed'], 호러: ['halloween'], 귀신: ['halloween'],
  wedding: ['formal'], 결혼: ['formal'], 웨딩: ['formal'], elegant: ['sophisticated', 'formal'], 우아: ['sophisticated', 'formal'], 격식: ['formal'],
  retro: ['vintage'], 복고: ['vintage'], 레트로: ['vintage'], 뉴트로: ['vintage'], 옛날: ['vintage'],
  붓: ['brush'], 서예: ['brush'], 캘리: ['brush', 'handwritten'], 붓글씨: ['brush'], calligraphy: ['brush', 'formal'],
  hand: ['handwritten', 'informal'], 손글씨: ['handwritten', 'informal'], 필기: ['handwritten'],
  픽셀: ['pixel'], 도트: ['pixel'], '8bit': ['pixel'], game: ['pixel'], 게임: ['pixel'],
  kids: ['childlike', 'cute'], children: ['childlike'], 어린이: ['childlike', 'cute'], 아이: ['childlike'], 귀여운: ['cute'], 귀엽: ['cute'],
  christmas: ['christmas'], 크리스마스: ['christmas'], valentine: ["valentine's"], 발렌타인: ["valentine's"], 설날: ['lunar'], lunar: ['lunar'],
  future: ['futuristic', 'techno'], 미래: ['futuristic'], sf: ['futuristic', 'techno'], 테크: ['techno'],
  grunge: ['distressed', 'rugged'], rough: ['distressed', 'rugged'], 거친: ['distressed', 'rugged'], 낡은: ['distressed', 'vintage'],
  western: ['woodtype', 'tuscan'], 서부: ['woodtype', 'tuscan'], circus: ['woodtype', 'tuscan'], 서커스: ['woodtype', 'tuscan'],
  medieval: ['blackletter', 'medieval'], 중세: ['blackletter', 'medieval'], 스텐실: ['stencil'], 장난: ['playful', 'wacky'], 신나는: ['excited', 'happy'],
  loud: ['loud'], 강렬: ['loud'], calm: ['calm'], 차분: ['calm'], 고급: ['sophisticated'], luxury: ['sophisticated'],
};

// ------------------------------------------------------------------ the policy
/** noonnu.cc's figures for a Korean face (policy.noonnu), and whether they reach the line. */
function noonnuOf(family, name) {
  const N = POLICY.noonnu, f = N?.fonts?.[family] ?? N?.fonts?.[name];
  if (!f) return null;
  const byViews = f.views_rank != null && f.views_rank <= N.views_rank_max;
  const byPopularity = f.popularity_rank != null && f.popularity_rank <= N.popularity_rank_max && (f.views ?? 0) >= N.min_views;
  const k = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2).replace(/0$/, '')}M` : `${Math.round(n / 1e3)}K`);
  const text = `noonnu ${f.name_ko} (#${f.id}): ${f.views_rank ? `${f.views_rank} by views` : 'not in the first 240 by views'}, ${f.popularity_rank ? `${f.popularity_rank} by popularity` : 'not in the first 240 by popularity'}, ${k(f.views ?? 0)} views`;
  return { ...f, pass: byViews || byPopularity, text, line: `the line is ${N.views_rank_max} by views, or ${N.popularity_rank_max} by popularity with ${k(N.min_views)} views` };
}

/** Does this face pass? → { ok, licence, rank, basis, why: [reasons it fails] }
 *  `bundled`: judged as a face in this package (the audit): the licence kinds of policy.bundle_licences and the
 *  noonnu.cc figures count too. Faces fetched from outside (search, check, add) are judged as before. */
function judge(font, pop, { bundled: inBundle = false } = {}) {
  const why = [], name = POLICY.aliases[font.family] ?? font.family;
  const licence = font.licence ?? font.license ?? null;
  const accepted = inBundle ? Object.keys(POLICY.bundle_licences ?? {}).filter((k) => k !== 'about') : POLICY.licences;
  if (!accepted.includes(licence)) why.push(`its licence is ${licence || 'not on record'}; only ${accepted.join(', ')} are taken`);
  if (inBundle && licence === 'publisher-redistributable') {
    const t = POLICY.publisher_terms?.[font.family];
    const lacking = ['licence_url', 'checked', 'allows', 'forbids'].filter((k) => !t?.[k] || (Array.isArray(t[k]) && !t[k].length));
    if (lacking.length) why.push(`the publisher's terms are not on record in policy.publisher_terms (${lacking.join(', ')} missing)`);
  }
  const g = pop.fams[name], known = POLICY.widely_used_ko[font.family] ?? POLICY.widely_used_ko[name];
  // a face under the line that the owner of the skill decided to keep; the audit says so in as many words
  const kept = POLICY.kept_by_decision?.[font.family] ?? POLICY.kept_by_decision?.[name];
  const nn = inBundle ? noonnuOf(font.family, name) : null;
  const hangul = font.hangul ?? (font.subsets ?? []).includes('korean');
  let basis = null, rank = g?.rank ?? null;
  if (hangul) {
    const at = pop.korean.indexOf(name), line = Math.floor(pop.korean.length * POLICY.korean_share);
    const also = nn ? `; ${nn.text}` : '';   // noonnu's figures stand beside the other grounds as further evidence
    if (at >= 0 && at < line) basis = `Google Fonts: ${at + 1} of ${pop.korean.length} Korean families (rank ${rank}); the line is ${line}${also}`;
    else if (nn?.pass) basis = `${nn.text} (${nn.line})`;
    else if (known) basis = `widely used in Korea: ${known}${also}`;
    else if (kept) basis = `kept by decision${at >= 0 ? ` (${at + 1} of ${pop.korean.length} Korean families on Google Fonts; the line is ${line})` : ''}: ${kept}${also}`;
    else why.push(at >= 0 ? `little used: ${at + 1} of ${pop.korean.length} Korean families on Google Fonts (the line is ${line}), and not on the list of faces known to be widely used in Korea` : 'no figure for how widely it is used: not on Google Fonts and not on the list of faces known to be widely used in Korea');
  } else if (rank != null && rank <= POLICY.latin_rank_max) basis = `Google Fonts rank ${rank} (the line is ${POLICY.latin_rank_max})`;
  else if (known) basis = `widely used: ${known}`;
  else if (kept) basis = `kept by decision${rank != null ? ` (Google Fonts rank ${rank}; the line is ${POLICY.latin_rank_max})` : ''}: ${kept}`;
  else why.push(rank != null ? `little used: Google Fonts rank ${rank}, below the line of ${POLICY.latin_rank_max}` : 'no figure for how widely it is used (not on Google Fonts)');
  return { ok: !why.length, licence, rank, basis, hangul, why };
}

/** Families the bundled sheets provide → folder (for the licence file). */
function bundled() {
  const out = new Map();
  const dir = path.join(SKILL_ROOT, 'assets', 'fonts-extra');
  const sheets = [path.join(SKILL_ROOT, 'assets', 'fonts', 'fonts.css'), ...(fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^fonts.*\.css$/.test(f)).map((f) => path.join(dir, f)) : [])];
  for (const f of sheets) for (const m of fs.readFileSync(f, 'utf8').matchAll(/font-family:\s*'([^']+)'[^}]*?src:\s*url\(\.\/([^/)]+)\//g)) if (!out.has(m[1])) out.set(m[1], path.join(path.dirname(f), m[2]));
  return out;
}

async function find(nameOrId) {
  const want = slug(nameOrId), ko = nameOrId.trim().replace(/\s+/g, '');
  // a Korean name has no slug (it is all letters outside a–z), so it is matched as written, spaces aside
  const c = CATALOG.fonts.find((f) => (want && (f.id === want || slug(f.family) === want)) || (f.name_ko && f.name_ko.replace(/\s+/g, '') === ko));
  if (c) return { ...c, source: 'catalog' };
  if (!want) return null;
  const list = await fontsourceList();
  const f = list.find((x) => x.id === want || slug(x.family) === want);
  return f ? { ...f, source: 'fontsource' } : null;
}

// ------------------------------------------------------------------ search / check
async function search(words, opt) {
  const [list, pop] = [await fontsourceList(), await popularity()];
  let tags = null;
  if (words.length) try { tags = await tagIndex(); } catch (e) { if (e instanceof Refused) throw e; console.error(`(the Google Fonts mood tags could not be fetched: ${e.message}; searching names and categories only)`); }
  const have = bundled(), q = words.map((w) => w.toLowerCase());
  const isBundled = (f) => have.has(f.family) || Object.entries(POLICY.aliases).some(([as, fam]) => fam === f.family && have.has(as));
  const all = [...CATALOG.fonts.map((f) => ({ ...f, source: 'catalog', weights: Object.keys(f.files).map(Number) })), ...list.map((f) => ({ ...f, source: 'fontsource' }))];
  // how well a face answers one word: 100 when its name or category holds the word, else its strongest Google Fonts tag for it (50 and over)
  const fit = (f, w) => {
    if (`${f.family} ${f.id} ${f.name_ko ?? ''} ${f.category}`.toLowerCase().includes(w)) return { score: 100 };
    const t = tags?.[f.family]; if (!t) return { score: 0 };
    let best = { score: 0 };
    for (const want of [w, ...(MOOD[w] ?? [])]) for (const [tag, v] of Object.entries(t)) if ((tag === want || (want.length > 3 && tag.startsWith(want))) && v >= 50 && v > best.score) best = { score: v, tag };
    return best;
  };
  const hit = [];
  for (const f of all) {
    const hangul = f.hangul ?? (f.subsets ?? []).includes('korean');
    if (opt.korean && !hangul) continue;
    if (opt.category && f.category !== opt.category) continue;
    if (opt.weight && !(f.weights ?? []).map(Number).includes(Number(opt.weight))) continue;
    const fits = q.map((w) => fit(f, w));
    if (fits.every((x) => x.score > 0)) hit.push({ ...f, fit: Math.min(100, ...fits.map((x) => x.score)), why: fits.filter((x) => x.tag).map((x) => `${x.tag} ${x.score}`).join(', ') });
  }
  const judged = hit.map((f) => ({ f, j: judge(f, pop) }));
  // the closest fit first (in steps of 20, so a small difference in a tag does not outrank a much more used face), then the most used
  const pass = judged.filter((x) => x.j.ok).sort((a, b) => Math.floor(b.f.fit / 20) - Math.floor(a.f.fit / 20) || (a.j.rank ?? 1e9) - (b.j.rank ?? 1e9));
  const out = judged.filter((x) => !x.j.ok), byLicence = out.filter((x) => x.j.why.some((w) => w.startsWith('its licence'))).length;
  const limit = Number(opt.limit) || 20, moods = pass.some((x) => x.f.why);
  log(`${pass.length} face${pass.length === 1 ? '' : 's'} pass the font policy${pass.length > limit ? ` (the ${limit} closest and most used are shown; --limit N for more)` : ''}:`);
  log('  ' + ['family'.padEnd(26), 'category'.padEnd(12), 'rank'.padStart(5), 'licence'.padEnd(11), 'Hangul', 'weights'.padEnd(moods ? 20 : 0)].join('  ') + (moods ? '  mood (Google Fonts tag, 0–100)' : ''));
  for (const { f, j } of pass.slice(0, limit)) log('  ' + [f.family.padEnd(26), String(f.category).padEnd(12), String(j.rank ?? '—').padStart(5), String(j.licence).padEnd(11), (j.hangul ? 'yes' : 'no').padEnd(6), (f.weights ?? []).join('/').padEnd(moods ? 20 : 0)].join('  ') + (moods ? `  ${f.why || '—'}` : '') + (isBundled(f) ? '   (bundled)' : f.source === 'catalog' ? '   (checked list)' : ''));
  log(`${out.length} matching face${out.length === 1 ? '' : 's'} left out: ${byLicence} for the licence, ${out.length - byLicence} for being little used.${opt.all && out.length ? '\n  ' + out.slice(0, 40).map((x) => `${x.f.family} — ${x.j.why.join('; ')}`).join('\n  ') : out.length ? ' (--all lists them)' : ''}`);
  log('\nrank: Google Fonts popularity (1 is the most used). Fetch one with:  node fonts.mjs add "<family>" --base <bundled theme>');
}

/** A face that is in the bundle, asked for by its CSS family or its Korean name (as noonnu.cc lists it) → { family, themes } or null. */
function inBundle(name) {
  const ko = name.trim().replace(/\s+/g, ''), have = bundled();
  const family = [...have.keys()].find((f) => f.toLowerCase() === name.trim().toLowerCase())
    ?? Object.entries(POLICY.noonnu?.fonts ?? {}).find(([f, v]) => have.has(f) && v.name_ko?.replace(/\s+/g, '') === ko)?.[0];
  if (!family) return null;
  const themes = fs.readdirSync(THEMES_DIR).filter((t) => t.endsWith('.css') && fs.readFileSync(path.join(THEMES_DIR, t), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').includes(`"${family}"`)).map((t) => t.replace('.css', ''));
  return { family, themes };
}

async function check(name) {
  const f = await find(name);
  // a bundled face that is on neither source (a noonnu face taken from its publisher): say so, nothing to fetch
  const b = f ? null : inBundle(name);
  if (b) { log(`${b.family} is bundled with the skill: nothing to fetch.${b.themes.length ? ` Type themes that use it: ${b.themes.join(', ')}.` : ''} Why it is in the bundle: node fonts.mjs audit.`); return 0; }
  if (!f) { log(`"${name}" is on neither source (Fontsource, or the checked list in assets/fonts-catalog.json), so its licence and use cannot be checked: not taken.`); return 1; }
  const j = judge(f, await popularity());
  log(`${f.family} — ${f.category}, ${j.hangul ? 'Hangul and Latin' : 'no Hangul'}, from ${f.source === 'catalog' ? `the checked list (${f.home})` : 'Fontsource (Google Fonts)'}${bundled().has(f.family) ? '; already bundled' : ''}`);
  log(`  licence: ${j.licence ?? 'not on record'}${f.licence_url ? ` (${f.licence_url})` : ''}`);
  log(j.ok ? `  passes — ${j.basis}` : `  does not pass — ${j.why.join('; ')}`);
  return j.ok ? 0 : 1;
}

// ------------------------------------------------------------------ add
const MAGIC = { woff2: ['wOF2'], woff: ['wOFF'], ttf: ['\x00\x01\x00\x00', 'true'], otf: ['OTTO'] };
function checkFontFile(buf, name) {
  const ext = name.split('.').pop().toLowerCase();
  if (!MAGIC[ext]) throw new Refused(`${name}: only woff2, woff, ttf and otf files are taken`);
  if (!MAGIC[ext].includes(buf.subarray(0, 4).toString('latin1'))) throw new Refused(`${name} is not a ${ext} font file`);
  return ext;
}
const FORMAT = { woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype' };

/** How large the face draws a syllable (or a capital), measured in Chromium, as a size-adjust in percent.
 *  `src` is a CSS src value (url(...) or local(...)). `hangul`: true, false, or 'auto' (does the face draw Hangul?). */
async function measureFace(src, hangul, dir) {
  try {
    const { launchBrowser } = await import('./lib/browser.mjs');
    const browser = await launchBrowser();
    try {
      const page = await browser.newPage();
      fs.mkdirSync(dir, { recursive: true });
      const html = path.join(dir, 'measure.html');
      fs.writeFileSync(html, '<!doctype html><meta charset="utf-8"><body></body>');
      await page.goto(pathToFileURL(html).href);
      const v = await page.evaluate(async ([src, ko]) => {
        const ff = new FontFace('probe', src);
        try { await ff.load(); } catch { return { missing: true }; }
        document.fonts.add(ff);
        const c = document.createElement('canvas').getContext('2d');
        const width = (font, t) => { c.font = font; return c.measureText(t).width; };
        // does the face draw Hangul itself? (if not, the same fallback draws it with and without the probe)
        const hasHangul = ['serif', 'monospace'].some((g) => Math.abs(width(`1000px probe, ${g}`, '한글날봄') - width(`1000px ${g}`, '한글날봄')) > 1);
        const useKo = ko === 'auto' ? hasHangul : ko;
        c.font = '1000px probe';
        const ink = (ch) => { const r = c.measureText(ch); return r.actualBoundingBoxAscent + r.actualBoundingBoxDescent; };
        const set = useKo ? [...'한글날봄빛을를가마음숲달'] : [...'HENTXZ'];
        return { mean: set.reduce((a, ch) => a + ink(ch), 0) / set.length, hangul: useKo };
      }, [src, hangul]);
      fs.rmSync(html, { force: true });
      if (v.missing) return { missing: true };
      // bundled Hangul faces draw a syllable about 0.86 em tall, Latin capitals about 0.70 em
      const want = v.hangul ? 860 : 700, pct = Math.round((want / v.mean) * 100);
      return { adjust: Math.abs(pct - 100) < 6 ? null : Math.max(80, Math.min(170, pct)), hangul: v.hangul };
    } finally { await browser.close(); }
  } catch { return { adjust: null, hangul: hangul === 'auto' ? null : hangul, nobrowser: true }; }   // no browser here: the face is used at its own size
}
async function sizeAdjust(file, hangul) { return (await measureFace(`url(${pathToFileURL(file).href})`, hangul, path.dirname(file))).adjust ?? null; }

/** The bundled theme `base` under a new name, with `lead` leading its headline (and more with role all). */
function themeCss({ themeId, base, lead, faceCss, weight, role, head }) {
  const baseFile = path.join(THEMES_DIR, `${base}.css`), css = fs.readFileSync(baseFile, 'utf8');
  const stack = (prop) => (css.match(new RegExp(`${prop}:\\s*([^;]+);`)) ?? [])[1]?.trim();
  const title = stack('--font-title') ?? 'var(--font-sans)', titleKo = stack('--font-title-ko') ?? title;
  const all = role === 'all';
  const over = `.poster[data-type="${themeId}"] { --font-title: ${lead}, ${title}; --font-title-ko: ${lead}, ${titleKo}; --title-weight: ${weight}; --title-weight-ko: ${weight};${all ? ` --font-subtitle: ${lead}, ${title}; --font-subtitle-ko: ${lead}, ${titleKo}; --font-eyebrow: ${lead}, ${title}; --font-eyebrow-ko: ${lead}, ${titleKo};` : ''} }`;
  return `${head}\n${faceCss}\n${css.split(`data-type="${base}"`).join(`data-type="${themeId}"`)}\n/* the face from outside the bundle leads */\n${over}\n`;
}
function baseOf(opt) {
  const base = opt.base || 'bold';
  if (!fs.existsSync(path.join(THEMES_DIR, `${base}.css`))) throw new Error(`--base ${base}: no such bundled type theme (see poster.mjs --list-styles)`);
  return base;
}
/** Put a finished folder in place of the old one and say how to use it. */
function finish(tmp, dir, record, themeId, lines) {
  fs.writeFileSync(path.join(tmp, 'font.json'), JSON.stringify(record, null, 2));
  fs.rmSync(dir, { recursive: true, force: true }); fs.renameSync(tmp, dir);
  const themeFile = path.join(dir, `${themeId}.css`);
  for (const l of lines) log(l);
  log(`\nuse it in the spec — for one poster ("type" in its entry of "drafts") or for all (top level):\n  "type": ${JSON.stringify(themeFile)}`);
  return 0;
}
const ORIGIN_SAY = {
  fetched: (r) => `the headline is set in ${r.family} (${r.licenceName}), fetched from ${r.source.home}; free for commercial use, the font files themselves may not be sold.`,
  asked: (r) => `the headline is set in ${r.family}, which the user asked for, fetched from ${r.source.home}; its licence on record is ${r.licenceName}${r.licenceNote ? ` (${r.licenceNote})` : ''}.`,
  file: (r) => `the headline is set in ${r.family} from the font file the user gave${r.source.home && !r.source.home.startsWith('/') ? ` (from ${r.source.home})` : ''}; ${r.licenceNote}.`,
  installed: (r) => `the headline is set in ${r.family}, installed on this computer; ${r.licenceNote}.`,
};

/** A face the user handed over as a file (or one Claude fetched from the publisher's own page at the user's request). */
async function addFile(file, opt) {
  const src = path.resolve(file);
  if (!fs.existsSync(src) || !fs.statSync(src).isFile()) throw new Error(`--file ${file}: no such file`);
  const buf = fs.readFileSync(src), name = path.basename(src);
  const ext = checkFontFile(buf, name);
  if (buf.length > 40e6) throw new Refused(`${name} is ${(buf.length / 1e6).toFixed(1)} MB; a single font file over 40 MB is not taken`);
  const family = opt.family || name.replace(/\.(woff2?|ttf|otf)$/i, '').replace(/[-_](Regular|Bold|Medium|Light|Black|Heavy|ExtraBold|SemiBold|Thin)$/i, '').replace(/[_]+/g, ' ');
  const base = baseOf(opt), id = `file-${slug(family) || crypto.createHash('sha1').update(buf).digest('hex').slice(0, 10)}`, dir = path.join(CACHE, id), tmp = `${dir}.part`;
  fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
  fs.writeFileSync(path.join(tmp, name), buf);
  const m = await measureFace(`url(${pathToFileURL(path.join(tmp, name)).href})`, 'auto', tmp);
  const weight = Number(opt.weight) || 400, lead = `"${family}"`, themeId = `${base}-${id}`;
  const note = opt.note || "its licence is the user's to answer for";
  const faceCss = `@font-face{font-family:${lead};${m.adjust ? `size-adjust:${m.adjust}%;` : ''}font-style:normal;font-weight:${weight};font-display:block;src:url(./${encodeURI(name)}) format('${FORMAT[ext]}');}`;
  const head = `/* ${themeId} — the bundled type theme "${base}" with ${family} (a font file the user gave) leading its headline. Written by scripts/fonts.mjs add --file on ${new Date().toISOString().slice(0, 10)}.\n   ${note}. */`;
  fs.writeFileSync(path.join(tmp, `${themeId}.css`), themeCss({ themeId, base, lead, faceCss, weight, role: opt.role, head }));
  fs.writeFileSync(path.join(tmp, 'LICENSE.txt'), `${family}\nA font file the user gave (${src})${opt.source ? `, from ${opt.source}` : ''}.\n${note}.\n`);
  const record = { id, family, origin: 'file', licence: null, licenceName: 'not checked (the user\'s file)', licenceNote: note, licenceUrl: opt.source ?? null,
    source: { kind: 'file the user gave', home: opt.source ?? src }, forbids: [], hangul: m.hangul ?? null, weights: [weight], sizeAdjust: m.adjust ?? null,
    files: [{ file: name, weight, bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex'), from: src }], base, theme: `${themeId}.css`, fetched: new Date().toISOString() };
  return finish(tmp, dir, record, themeId, [`${family} — from the file ${src} (${(buf.length / 1024).toFixed(0)} KB, ${ext}) → ${dir}`, `  not checked against the font policy: ${note}.${m.adjust ? `\n  drawn ${m.adjust > 100 ? 'small' : 'large'} on its body: size-adjust ${m.adjust}%` : ''}`, `\nsay at delivery: ${ORIGIN_SAY.file(record)}`]);
}

/** A face installed on this computer, used by its name. */
async function addInstalled(family, opt) {
  const base = baseOf(opt), id = `installed-${slug(family) || crypto.createHash('sha1').update(family).digest('hex').slice(0, 10)}`, dir = path.join(CACHE, id), tmp = `${dir}.part`;
  fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
  const m = await measureFace(`local("${family.replace(/"/g, '')}")`, 'auto', tmp);
  if (m.missing || m.nobrowser) { fs.rmSync(tmp, { recursive: true, force: true }); throw new Refused(m.nobrowser ? `no browser here to check whether "${family}" is installed` : `"${family}" is not installed on this computer (Chromium finds no face of that name). Ask the user to install it or hand over the font file (add --file), and meanwhile use a bundled type theme.`); }
  const weight = Number(opt.weight) || 400, alias = `"${family} (installed)"`, themeId = `${base}-${id}`;
  const note = "its licence is the user's to answer for";
  const faceCss = `@font-face{font-family:${alias};${m.adjust ? `size-adjust:${m.adjust}%;` : ''}font-style:normal;font-weight:${weight};font-display:block;src:local("${family.replace(/"/g, '')}");}`;
  const head = `/* ${themeId} — the bundled type theme "${base}" with ${family} (installed on this computer) leading its headline. Written by scripts/fonts.mjs add --installed on ${new Date().toISOString().slice(0, 10)}.\n   It renders only on a computer where ${family} is installed; ${note}. */`;
  fs.writeFileSync(path.join(tmp, `${themeId}.css`), themeCss({ themeId, base, lead: alias, faceCss, weight, role: opt.role, head }));
  const record = { id, family, origin: 'installed', licence: null, licenceName: 'not checked (installed on this computer)', licenceNote: note, licenceUrl: null,
    source: { kind: 'installed on this computer', home: 'local()' }, forbids: [], hangul: m.hangul ?? null, weights: [weight], sizeAdjust: m.adjust ?? null, files: [], base, theme: `${themeId}.css`, fetched: new Date().toISOString() };
  return finish(tmp, dir, record, themeId, [`${family} — installed on this computer (found by Chromium); ${m.hangul ? 'draws Hangul' : 'no Hangul: a Korean headline falls back to the base theme\'s face'}`, `  not checked against the font policy: ${note}.${m.adjust ? `\n  drawn ${m.adjust > 100 ? 'small' : 'large'} on its body: size-adjust ${m.adjust}%` : ''}`, `  the theme works only where ${family} is installed; on another computer the poster falls back to the base theme's face.`, `\nsay at delivery: ${ORIGIN_SAY.installed(record)}`]);
}

async function add(name, opt) {
  if (opt.file) return addFile(opt.file, opt);
  if (opt.installed) return addInstalled(typeof opt.installed === 'string' ? opt.installed : name, opt);
  const f = await find(name);
  const b = f ? null : inBundle(name);
  if (b) throw new Refused(`${b.family} is bundled with the skill; use a type theme that sets it${b.themes.length ? ` (${b.themes.join(', ')})` : ''} instead of fetching it.`);
  if (!f) throw new Refused(`"${name}" is on neither source (Fontsource, or the checked list in assets/fonts-catalog.json)${opt.asked ? '. If the user asked for it: use it installed (--installed), from a file the user gives (--file), or fetched from its publisher\'s own page and then --file; never from a copy someone else has put up' : ', so its licence and use cannot be checked'}.`);
  const j = judge(f, await popularity());
  // the user asked for this face by name: its licence and use are not a reason to refuse it (references/fonts.md)
  if (!j.ok && !opt.asked) throw new Refused(`${f.family} is not taken: ${j.why.join('; ')}.`);
  const asked = !!opt.asked;
  const base = baseOf(opt);
  const id = f.id ?? slug(f.family), dir = path.join(CACHE, id);
  // which weights: the ones asked for, else the boldest of 700 / 400 the face has
  const has = (f.source === 'catalog' ? Object.keys(f.files) : f.weights).map(Number);
  const weights = opt.weights ? String(opt.weights).split(',').map(Number) : [has.includes(700) ? 700 : has.includes(400) ? 400 : has[0]];
  for (const w of weights) if (!has.includes(w)) throw new Error(`${f.family} has no weight ${w} (it has ${has.join(', ')})`);
  // ---- where the files are
  const want = [];   // { weight, url, range? }
  let licenceText = null, version = null;
  if (f.source === 'catalog') {
    for (const w of weights) want.push({ weight: w, url: f.files[w] });
    if (f.licence_file && fs.existsSync(path.join(SKILL_ROOT, f.licence_file))) licenceText = fs.readFileSync(path.join(SKILL_ROOT, f.licence_file), 'utf8');
    else if (POLICY.hosts.includes(new URL(f.licence_url).host)) licenceText = await get(f.licence_url, { max: 2e5 });
  } else {
    const meta = JSON.parse(await get(`https://api.fontsource.org/v1/fonts/${id}`));
    if (meta.license !== f.license) throw new Refused(`${f.family}: the licence on record changed (${f.license} → ${meta.license}); not taken`);
    version = meta.version;
    for (const w of weights) {
      const v = meta.variants?.[w]?.normal ?? {};
      // Hangul first, the Latin slice after it: of two faces that hold a character the later one is used
      for (const sub of j.hangul ? ['korean', 'latin'] : ['latin']) if (v[sub]?.url?.woff2) want.push({ weight: w, url: v[sub].url.woff2, range: sub === 'latin' ? meta.unicodeRange?.latin : null });
    }
    licenceText = await get(`https://cdn.jsdelivr.net/npm/@fontsource/${id}/LICENSE`, { max: 2e5 });
  }
  if (!want.length) throw new Error(`${f.family}: no font file found for weight ${weights.join(', ')}`);
  // ---- fetch into a fresh folder, then put it in place
  const tmp = `${dir}.part`; fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
  const faces = [];
  for (const x of want) {
    const file = decodeURIComponent(new URL(x.url).pathname.split('/').pop()), buf = await get(x.url, { binary: true, max: POLICY.max_font_bytes, timeout: 90000 });
    const ext = checkFontFile(buf, file);
    fs.writeFileSync(path.join(tmp, file), buf);
    faces.push({ ...x, file, ext, bytes: buf.length });
  }
  const adjust = await sizeAdjust(path.join(tmp, faces[0].file), j.hangul);
  const licName = LICENCE_NAME[j.licence] ?? j.licence ?? 'not on record';
  fs.writeFileSync(path.join(tmp, 'LICENSE.txt'), `${f.family} — ${licName}\nSource: ${f.source === 'catalog' ? f.home : `https://fontsource.org/fonts/${id} (Google Fonts)`}\n${f.licence_url ? `Licence page: ${f.licence_url}\n` : ''}${asked ? 'Fetched because the user asked for this face by name.\n' : ''}\n${licenceText ?? ''}`);
  // ---- the theme: the bundled one under a new name, with this face leading the headline
  const themeId = `${base}-${id}`, lead = `"${f.family}"`;
  const faceCss = faces.map((x) => `@font-face{font-family:${lead};${adjust ? `size-adjust:${adjust}%;` : ''}font-style:normal;font-weight:${x.weight};font-display:block;src:url(./${encodeURI(x.file)}) format('${FORMAT[x.ext]}');${x.range ? `unicode-range:${x.range};` : ''}}`).join('\n');
  const why = j.ok ? j.basis : `asked for by the user, outside the font policy (${j.why.join('; ')})`;
  const head = `/* ${themeId} — the bundled type theme "${base}" with ${f.family} leading its headline${opt.role === 'all' ? ', sub-headline and label' : ''}. Written by scripts/fonts.mjs add on ${new Date().toISOString().slice(0, 10)}.\n   ${f.family}: ${licName}; from ${f.source === 'catalog' ? f.home : 'Fontsource (Google Fonts)'}; ${why}. Its licence text is LICENSE.txt in this folder. */`;
  fs.writeFileSync(path.join(tmp, `${themeId}.css`), themeCss({ themeId, base, lead, faceCss, weight: weights[0], role: opt.role, head }));
  const record = { id, family: f.family, origin: asked ? 'asked' : 'fetched', licence: j.licence, licenceName: licName, licenceUrl: f.licence_url ?? (j.licence === 'OFL-1.1' ? 'https://openfontlicense.org' : null),
    licenceNote: asked && !j.ok ? `outside the skill's own font policy: ${j.why.join('; ')}` : null,
    source: f.source === 'catalog' ? { kind: 'checked list', home: f.home, author: f.author } : { kind: 'fontsource', home: `https://fontsource.org/fonts/${id}`, version },
    forbids: f.forbids ?? ['selling the font files by themselves'], popularity: { rank: j.rank, basis: j.ok ? j.basis : null }, hangul: j.hangul, weights, sizeAdjust: adjust,
    files: faces.map((x) => ({ file: x.file, weight: x.weight, bytes: x.bytes, url: x.url })), base, theme: `${themeId}.css`, fetched: new Date().toISOString() };
  return finish(tmp, dir, record, themeId, [`${f.family} — ${licName}; ${why}`,
    `  fetched ${faces.length} file${faces.length > 1 ? 's' : ''} (${(faces.reduce((a, x) => a + x.bytes, 0) / 1024).toFixed(0)} KB, weight ${weights.join(', ')}) from ${new URL(faces[0].url).host} → ${dir}${adjust ? `\n  drawn ${adjust > 100 ? 'small' : 'large'} on its body: size-adjust ${adjust}% brings it to the size of the bundled faces` : ''}`,
    `\nsay at delivery: ${(asked ? ORIGIN_SAY.asked : ORIGIN_SAY.fetched)({ ...record, source: { home: f.source === 'catalog' ? f.home : 'Google Fonts through Fontsource' } })}`]);
}

// ------------------------------------------------------------------ audit of the bundle
async function audit() {
  const pop = await popularity(), have = bundled();
  const themes = fs.readdirSync(THEMES_DIR).filter((f) => f.endsWith('.css')).map((f) => [f.replace('.css', ''), fs.readFileSync(path.join(THEMES_DIR, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')]);
  const rows = [];
  const KIND = { 'OFL-1.1': 'open licence', 'Apache-2.0': 'open licence', 'UFL-1.0': 'open licence', 'public-domain': 'public domain', 'publisher-redistributable': "publisher's terms, redistribution allowed" };
  for (const [family, dir] of have) {
    if (/ KR$/.test(family) && have.get(family.replace(/ KR$/, '')) === dir) continue;   // "<face> KR" drawn from the same files is the size-matched alias of a Latin face; Noto Serif KR and IBM Plex Sans KR are families of their own
    const lic = ['OFL.txt', 'LICENSE.txt'].map((n) => path.join(dir, n)).find((p) => fs.existsSync(p)), text = lic ? fs.readFileSync(lic, 'utf8') : '';
    // the licence the folder's own licence file names; a publisher's own terms are taken as such only for a face on record in policy.publisher_terms
    const licence = /SIL OPEN FONT LICENSE/i.test(text) ? 'OFL-1.1' : /Apache License/i.test(text) ? 'Apache-2.0' : /UBUNTU FONT LICENCE/i.test(text) ? 'UFL-1.0'
      : /^Licen[cs]e: public domain/im.test(text) ? 'public-domain' : text && POLICY.publisher_terms?.[family] ? 'publisher-redistributable' : null;
    const name = POLICY.aliases[family] ?? family, g = pop.fams[name];
    const hangul = g?.korean ?? (!!POLICY.noonnu?.fonts?.[family] || /[가-힣]|Nanum|Maru|Pretendard|Galmuri/.test(family + (POLICY.widely_used_ko[family] ?? '')));
    const j = judge({ family, licence, hangul }, pop, { bundled: true });
    const used = themes.filter(([, css]) => css.includes(`"${family}"`) || css.includes(`"${family} KR"`)).map(([t]) => t);
    rows.push({ family, licence: licence ?? '?', kind: KIND[licence] ?? '?', hangul, rank: j.rank, ok: j.ok, basis: j.ok ? j.basis : j.why.join('; '), used });
  }
  rows.sort((a, b) => b.hangul - a.hangul || (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.family.localeCompare(b.family));
  log(`| Face | Script | Licence | Kind | Popularity | Passes | Type themes that use it |\n|---|---|---|---|---|---|---|`);
  for (const r of rows) log(`| ${r.family} | ${r.hangul ? 'Hangul' : 'Latin'} | ${r.licence} | ${r.kind} | ${r.basis} | ${r.ok ? 'yes' : '**no**'} | ${r.used.map((t) => `\`${t}\``).join(' ') || '—'} |`);
  const kinds = Object.entries(rows.reduce((a, r) => ((a[r.kind] = (a[r.kind] ?? 0) + 1), a), {})).map(([k, n]) => `${n} ${k}`).join(', ');
  log(`\n${rows.length} families (${kinds}); ${rows.filter((r) => r.ok).length} pass, ${rows.filter((r) => !r.ok).length} do not.`);
  return rows.some((r) => !r.ok) ? 1 : 0;
}

// ------------------------------------------------------------------ cli
const HELP = `namokposter fonts — faces from outside the bundle (references/fonts.md)

  node fonts.mjs search [words…] [--korean] [--weight 900] [--category display|handwriting|serif|sans-serif|monospace] [--limit N] [--all]
      a word is looked for in the name and category, and in Google Fonts' mood tags (horror·공포, wedding·결혼, retro·복고, 붓, 손글씨, 픽셀…)
  node fonts.mjs check "<family>"
  node fonts.mjs add "<family>" [--base <bundled theme>] [--weights 400,700] [--role title|all] [--asked]
  node fonts.mjs add --file <font file> [--family "<name>"] [--source <publisher page>] [--note "<licence terms>"] --base <bundled theme>
  node fonts.mjs add --installed "<family>" --base <bundled theme>
  node fonts.mjs audit

The skill sets posters in its bundled themes and does not look outside on its own. When the user asks for a face:
--file uses a file the user gave (or one fetched from the publisher's own page), --installed a face installed on
this computer, and --asked fetches a face of the two sources below without the popularity test. Without --asked,
a face is taken only when its licence is ${POLICY.licences.join(' / ')} and it is in real use (Latin: Google Fonts
rank ≤ ${POLICY.latin_rank_max}; Korean: in the upper ${Math.round(POLICY.korean_share * 100)}% of Google Fonts' Korean families, or known to be widely used in Korea).
Sources for fetching: Fontsource (Google Fonts) and the checked list (assets/fonts-catalog.json). Files are kept in ${CACHE}.`;
async function main() {
  const argv = process.argv.slice(2), cmd = argv.shift(), opt = {}, words = [];
  for (let i = 0; i < argv.length; i++) { const t = argv[i]; if (t.startsWith('--')) { const k = t.slice(2); if (['korean', 'all', 'asked'].includes(k)) opt[k] = true; else opt[k] = argv[++i]; } else words.push(t); }
  if (cmd === 'search') { await search(words, opt); return 0; }
  if (cmd === 'check' && words.length) return check(words.join(' '));
  if (cmd === 'add' && (words.length || opt.file || opt.installed)) return add(words.join(' '), opt);
  if (cmd === 'audit') return audit();
  log(HELP); return cmd ? 2 : 0;
}
main().then((code) => { process.exitCode = code ?? 0; }).catch((e) => {
  const base = (process.argv.includes('--base') && process.argv[process.argv.indexOf('--base') + 1]) || null;
  if (e instanceof Refused) console.error(`refused: ${e.message}`);
  else console.error(`could not fetch: ${e.message}`);
  if (process.argv[2] === 'add') console.error(`→ nothing was fetched. Keep to the bundled type themes${base ? ` (for example "type": "${base}")` : ''} and say so at delivery; or pick another face with: node fonts.mjs search <words>`);
  process.exitCode = e instanceof Refused ? 1 : 3;
});
