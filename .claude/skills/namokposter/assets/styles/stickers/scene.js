// stickers — die-cut vinyl stickers stuck on a laptop lid or a notebook. Flat colour shapes, each with a
// thick die-cut border in the page's lightest colour and a thin soft shadow, turned a few degrees and
// overlapping a little; one or two large and several small, packed by a seeded best-candidate search
// so the cluster looks composed, then fitted whole into ctx.fit() (no sticker is ever cropped).
// Words on the stickers come from the copy: the date, the weekday, keywords, the headline's key word.
//
// Palette: colors[0..4] = the sticker colours, used in turn (colors[0] for the largest sticker; a second
//          colour is taken for flower centres, two-tone pills and tape stripes). The die-cut border is
//          the lighter of bg / ink, lifted halfway to white; lettering on a sticker is the die-cut colour
//          or the ink, whichever reads better on that sticker.
// Motifs:  badges (seals, stars, flowers, hearts, bubbles, pills, arrow, face, sparkles)
//          labels (hang tag, tape, name tag, fruit stickers, dots) · letters (a word, one sticker a letter)
// Params:  count, tilt, letterform (shape | cut), word
// Helpers written here (not in html-lib): roundedPoly (polygon with rounded corners), scallop, heart,
//          a capsule collision model and the best-candidate packer.
import { svg, mix, alpha, luminance, readableOn, eventDate, keyNumber, keywords, measureInk, inkText, ring, DAY_NAMES, isKorean } from '/skill/assets/web/html-lib.js';

const TAU = Math.PI * 2, r2 = (v) => Math.round(v * 100) / 100, pad2 = (n) => String(n).padStart(2, '0');
const STOP = new Set(['a', 'an', 'the', 'of', 'to', 'in', 'on', 'at', 'for', 'and', 'or', 'with', 'by', 'from', 'as', '&', '및', '의']);

// ------------------------------------------------------------------ geometry (local, centred on 0,0)
/** A closed polygon with every corner rounded by r (a number, or a function of the corner index). */
function roundedPoly(pts, r) {
  const n = pts.length; let d = '';
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], rr = typeof r === 'function' ? r(i) : r;
    const l1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1, l2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) || 1;
    const k1 = Math.min(rr, l1 / 2) / l1, k2 = Math.min(rr, l2 / 2) / l2;
    const a = [p1[0] + (p0[0] - p1[0]) * k1, p1[1] + (p0[1] - p1[1]) * k1], b = [p1[0] + (p2[0] - p1[0]) * k2, p1[1] + (p2[1] - p1[1]) * k2];
    d += `${i ? 'L' : 'M'}${r2(a[0])} ${r2(a[1])}Q${r2(p1[0])} ${r2(p1[1])} ${r2(b[0])} ${r2(b[1])}`;
  }
  return d + 'Z';
}
const polyD = (pts) => 'M' + pts.map((p) => `${r2(p[0])} ${r2(p[1])}`).join('L') + 'Z';
/** A seal with round lobes (no points): the radius swells into n bulbous lobes with soft notches between. */
function scallop(R, n, depth = 0.09) {
  const pts = [];
  for (let i = 0; i < 360; i++) { const t = (i / 360) * TAU; pts.push([Math.cos(t - Math.PI / 2) * R * (1 - depth + depth * Math.abs(Math.cos((n * t) / 2)) ** 0.5), Math.sin(t - Math.PI / 2) * R * (1 - depth + depth * Math.abs(Math.cos((n * t) / 2)) ** 0.5)]); }
  return polyD(pts);
}
function heart(w, h) {
  const pts = [];
  for (let i = 0; i < 160; i++) { const t = (i / 160) * TAU; pts.push([16 * Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]); }
  // the curve spans x ±16, y −12…+17 (y down): fit it to w × h
  return polyD(pts.map(([x, y]) => [(x / 32) * w, ((y + 2.5) / 29.5) * h]));
}
const capsule = (w, h) => `M${r2(-w / 2 + h / 2)} ${r2(-h / 2)}H${r2(w / 2 - h / 2)}A${r2(h / 2)} ${r2(h / 2)} 0 0 1 ${r2(w / 2 - h / 2)} ${r2(h / 2)}H${r2(-w / 2 + h / 2)}A${r2(h / 2)} ${r2(h / 2)} 0 0 1 ${r2(-w / 2 + h / 2)} ${r2(-h / 2)}Z`;
const halfCapsule = (w, h) => `M0 ${r2(-h / 2)}H${r2(-w / 2 + h / 2)}A${r2(h / 2)} ${r2(h / 2)} 0 0 0 ${r2(-w / 2 + h / 2)} ${r2(h / 2)}H0Z`;

// ------------------------------------------------------------------ reading the copy
function readCopy(content, ko) {
  const d = eventDate(content);
  let mismatch = null;
  const allText = [content.title, ...(content.meta || []).map((r) => r.value)].join(' ');
  let date = null;
  if (d) {
    // the weekday as the copy writes it, when it does (the copy is what the reader checks against)
    const row = (content.meta || []).map((r) => r.value).find((v) => v.includes(d.text)) || allText;
    const near = row.slice(Math.max(0, row.indexOf(d.text) - 12), row.indexOf(d.text) + d.text.length + 14);
    const wko = near.match(/[(（]\s*(주일|[일월화수목금토])\s*(?:요일)?\s*[)）]|(주일|[일월화수목금토])요일/), wen = near.match(/\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/i);
    let wd = ko ? DAY_NAMES.ko[d.weekday] : DAY_NAMES.enShort[d.weekday];
    if (wko) { const k = wko[1] || wko[2]; wd = k === '주일' ? '주일' : `${k}요일`; }
    else if (wen) wd = wen[1].toUpperCase();
    if ((wko || wen) && wd !== '주일' && wd !== (ko ? DAY_NAMES.ko[d.weekday] : DAY_NAMES.enShort[d.weekday]) && !(wko && `${DAY_NAMES.koShort[d.weekday]}요일` === wd)) mismatch = `${d.month}/${d.day}/${d.year} is a ${DAY_NAMES.en[d.weekday]}, but the copy says ${wd}`;
    date = { md: `${d.month}.${pad2(d.day)}`, plu: `${d.month}${pad2(d.day)}`, wd, time: d.time, end: d.end ? `${d.end.month}.${pad2(d.end.day)}` : null };
  }
  const emRaw = (content.titleRaw.match(/\*+([^*]+?)\*+/) || [])[1], em = emRaw ? emRaw.trim() : null;
  const words = [];
  const add = (w) => {
    w = String(w || '').replace(/\*+/g, '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}!?]+$/gu, '').trim();
    const len = [...w].length, hangul = isKorean(w);
    if (!w || STOP.has(w.toLowerCase()) || len > (hangul ? 7 : 11) || len < 1) return;
    if (words.some((x) => x.toLowerCase().includes(w.toLowerCase()) || w.toLowerCase().includes(x.toLowerCase()))) return;
    if (date && (w.includes(date.md))) return;
    // a Korean word that still carries its particle (모양을, 내일의) does not stand alone on a sticker
    if (hangul && len >= 3 && /(?:을|를|의|은|는|에서|에게|으로|와|과)$/.test(w) && w !== em) return;
    words.push(w);
  };
  if (em) add(em);
  for (const w of keywords(content, 12)) add(w);
  return { date, words, em, mismatch };
}

/** The word the letters motif spells: the emphasised part of the headline, else its first word; ≤ 6 letters. */
function letterWord(content, override) {
  const keep = (s) => [...String(s).toUpperCase()].filter((c) => /[가-힣A-Z0-9]/.test(c) || c === ' ');
  const count = (s) => keep(s).filter((c) => c !== ' ').length;
  const raw = String(override || (content.titleRaw.match(/\*+([^*]+?)\*+/) || [])[1] || content.title.split(/\s+/)[0] || '').trim();
  let cand = raw;
  if (count(cand) > 6 || count(cand) < 1) {
    const pool = [...raw.split(/\s+/), ...content.title.split(/\s+/)].filter((w) => count(w) >= 2 && count(w) <= 6 && !STOP.has(w.toLowerCase()));
    cand = pool[0] || cand;
  }
  let chars = keep(cand.replace(/\s+/g, ' ').trim());
  const out = []; let n = 0;
  for (const c of chars) { if (c === ' ') { if (out.length && out[out.length - 1] !== ' ') out.push(' '); continue; } if (n >= 6) break; out.push(c); n++; }
  while (out[out.length - 1] === ' ') out.pop();
  return out;
}

// ------------------------------------------------------------------ packing
// Each sticker is approximated by a row of circles along its long axis (a capsule), which is close
// enough for seals, pills, tags and tape alike. Coordinates are in a normalized room [0, A] × [0, 1].
function circlesOf(s, x, y, extra = 0) {
  const long = Math.max(s.w, s.h), short = Math.min(s.w, s.h), n = Math.max(1, Math.round(long / short));
  const ang = (s.rot * Math.PI) / 180 + (s.h > s.w ? Math.PI / 2 : 0), r = short / 2 * (s.round ?? 1) + extra, span = (long - short) / 2;
  const out = [];
  for (let i = 0; i < n; i++) { const t = n === 1 ? 0 : -span + (2 * span * i) / (n - 1); out.push([x + Math.cos(ang) * t, y + Math.sin(ang) * t, n === 1 ? (long / 2) * (s.round ?? 1) + extra : r]); }
  return out;
}
const halfExt = (s) => { const a = (s.rot * Math.PI) / 180, c = Math.abs(Math.cos(a)), sn = Math.abs(Math.sin(a)); return [(s.w * c + s.h * sn) / 2, (s.w * sn + s.h * c) / 2]; };
function penetration(a, b) {
  let best = -Infinity;
  for (const p of a.circ) for (const q of b.circ) best = Math.max(best, p[2] + q[2] - Math.hypot(p[0] - q[0], p[1] - q[1]));
  return best;
}
/** Best-candidate packing: each sticker in turn tries many spots and keeps the one that touches its
 *  neighbours (a slight overlap), does not overlap much, and keeps the cluster gathered in the room. */
function pack(items, A, rng, { fixed = [], start = null, pull = 0.6 } = {}) {
  const placed = [...fixed];
  for (const s of items) {
    const [hx, hy] = halfExt(s);
    let best = null, bestScore = Infinity;
    const tries = placed.length ? 500 : 1;
    for (let t = 0; t < tries; t++) {
      let x, y;
      if (!placed.length) [x, y] = start || [A / 2, 0.5];
      else { x = rng.range(Math.min(hx, A / 2), Math.max(A - hx, A / 2)); y = rng.range(Math.min(hy, 0.5), Math.max(1 - hy, 0.5)); }
      const me = { ...s, x, y, circ: circlesOf(s, x, y) };
      let over = 0, touch = -Infinity;
      const rMe = Math.min(s.w, s.h) / 2;
      for (const p of placed) {
        const pen = penetration(me, p), rr = Math.min(rMe, Math.min(p.w, p.h) / 2);
        const allowed = rr * (s.overlap ?? 0.16);
        if (pen > allowed) over += pen - allowed;
        touch = Math.max(touch, pen / rr);
      }
      const score = (placed.length ? over * 1000 + Math.abs(touch - 0.08) * 3 : 0) + pull * (((x - A / 2) / Math.max(A, 1)) ** 2 + ((y - 0.5) / Math.max(1 / A, 1)) ** 2);
      if (score < bestScore) { bestScore = score; best = me; }
    }
    placed.push(best);
  }
  return placed.slice(fixed.length);
}

// ------------------------------------------------------------------ the scene
export default async function build(ctx) {
  const { W, H, unit: U, palette: pal, params, content, font, rng } = ctx;
  const motif = params.motif || 'badges', tilt = Number(params.tilt ?? 1);
  const ko = ctx.lang === 'ko' || isKorean(content.title);
  const cols = (pal.colors && pal.colors.length ? pal.colors : [pal.accent, pal.ink]).slice(0, 5);
  const lightest = luminance(pal.bg) >= luminance(pal.ink) ? pal.bg : pal.ink;
  const cut = mix(lightest, '#ffffff', 0.55);
  const darkPage = luminance(pal.bg) < 0.18;
  const shadow = darkPage ? alpha('#000000', 0.5) : alpha(mix(pal.ink, pal.bg, 0.25), 0.3);
  const onFill = (f) => readableOn(f, [cut, pal.ink, '#161616']);
  const colourAt = (i) => cols[((i % cols.length) + cols.length) % cols.length];
  const copy = readCopy(content, ko);
  if (copy.mismatch && motif !== 'letters') ctx.note(`stickers: ${copy.mismatch} — the stickers print the weekday as the copy writes it.`);
  const titleFont = { family: font.title.family, weight: font.title.weight || 700, style: font.title.style };
  const capFont = { family: font.body.family, weight: 700 };

  // the room the copy left, as an aspect ratio (the cluster is laid out in that shape, then fitted)
  const room = ctx.px(ctx.artRect), sx0 = Math.max(room.x, ctx.safe.x), sy0 = Math.max(room.y, ctx.safe.y);
  const rw = Math.min(room.x + room.w, ctx.safe.x + ctx.safe.w) - sx0, rh = Math.min(room.y + room.h, ctx.safe.y + ctx.safe.h) - sy0;
  const A = Math.max(0.36, Math.min(4.2, rw / Math.max(1, rh)));
  const ang = (deg) => rng.sign() * rng.range(deg * 0.35, deg) * tilt;

  // ---- what is on the page: a list of sticker specs { kind, w, h, fill, text … } in relative sizes
  let specs = [], fixed = [];
  const wordQueue = [...copy.words];
  const nextWord = (maxLen = 7) => { const i = wordQueue.findIndex((w) => [...w].length <= maxLen); return i < 0 ? null : wordQueue.splice(i, 1)[0]; };
  const ratioOf = async (text, f = titleFont) => { const m = await measureInk(text, f); return m.width / Math.max(0.3, m.height); };
  const count = Math.round(Number(params.count) || Math.max(7, Math.min(11, 7 + Math.round((Math.max(A, 1 / A) - 1) * 3))));

  if (motif === 'letters') {
    const letters = letterWord(content, params.word);
    if (!letters.length) { ctx.note('stickers: no word to spell — the headline has no letters; showing badges instead.'); }
    const n = letters.filter((c) => c !== ' ').length;
    // rows: one along a wide room; two (split at the space, else in the middle) when the room is tall
    let rows = [letters];
    if (n >= 4 && A < 1.35) {
      const sp = letters.indexOf(' ');
      const cutAt = sp > 0 ? sp : Math.ceil(n / 2);
      rows = [letters.slice(0, cutAt), letters.slice(cutAt)].map((r) => r.filter((c) => c !== ' '));
    }
    const shapes = rng.shuffle(['circle', 'square', 'seal', 'square', 'circle', 'seal']);
    let k = 0, y0 = 0.5 - (rows.length - 1) * 0.5;
    const form = params.letterform === 'cut' ? 'cut' : 'shape';
    rows.forEach((row, ri) => {
      const step = 0.9, widths = row.map((c) => (c === ' ' ? 0.32 : step));
      const total = widths.reduce((a, b) => a + b, 0) - step + 1;
      let x = -total / 2 + 0.5 + (rows.length > 1 ? (ri ? 0.28 : -0.28) : 0);
      const phase = rng.range(0, TAU);
      row.forEach((c, ci) => {
        if (c === ' ') { x += 0.32; return; }
        const bounce = Math.sin(phase + k * 2.1) * 0.08 + (k % 2 ? 0.05 : -0.05);
        fixed.push({ kind: form === 'cut' ? 'glyph' : 'letter', shape: shapes[k % shapes.length], text: c, w: 1, h: 1, x, y: y0 + ri * 1.02 + bounce, rot: (k % 2 ? 1 : -1) * rng.range(3, 8) * tilt, fill: colourAt(k), round: 0.92, overlap: 0.3 });
        x += step; k++;
      });
    });
    // shift the letters into the room's frame, then add two or three small shape stickers beside them
    const lx = Math.min(...fixed.map((s) => s.x - 0.5)), lX = Math.max(...fixed.map((s) => s.x + 0.5));
    const ly = Math.min(...fixed.map((s) => s.y - 0.5)), lY = Math.max(...fixed.map((s) => s.y + 0.5));
    const RA = Math.max(A, (lX - lx + 1.2) / (lY - ly + 1.2)), RH = Math.max(lY - ly + 1.2, (lX - lx + 1.2) / RA);
    // the room is RA × 1 after scaling by 1 / RH
    for (const s of fixed) { s.x = (s.x - (lx + lX) / 2) / RH + RA / 2; s.y = (s.y - (ly + lY) / 2) / RH + 0.5; s.w /= RH; s.h /= RH; s.circ = circlesOf(s, s.x, s.y); }
    const smallKinds = rng.shuffle(['star', 'heart', 'sparkle', 'flower']).slice(0, rng.int(2, 3));
    specs = smallKinds.map((kind, i) => ({ kind, w: (kind === 'sparkle' ? 0.42 : 0.5) / RH, h: (kind === 'heart' ? 0.45 : kind === 'sparkle' ? 0.42 : 0.5) / RH, fill: colourAt(k + i + 1), fill2: colourAt(k + i + 3), rot: ang(14), overlap: 0.1 }));
    const smalls = pack(specs, RA, rng, { fixed, pull: 0.2 });
    specs = [...fixed, ...smalls];
  } else {
    if (motif === 'labels') {
      const wide = A >= 1.1;
      const hero = copy.em || nextWord(8) || content.title.split(/\s+/)[0];
      if (copy.em) { const i = wordQueue.indexOf(copy.em); if (i >= 0) wordQueue.splice(i, 1); }
      const tagSub = copy.date ? (copy.date.end ? `${copy.date.md}–${copy.date.end}` : `${copy.date.md} ${copy.date.wd}`) : null;
      specs.push(wide ? { kind: 'tag', w: 1.25, h: 0.72, text: hero, sub: tagSub, horiz: true, rot: ang(6) } : { kind: 'tag', w: 0.7, h: 1.2, text: hero, sub: tagSub, rot: ang(6) });
      const place = (content.meta.find((r) => /장소|곳|위치|venue|place|where|location/i.test(r.label)) || {}).value;
      if (place) { const r = await ratioOf(place, capFont); specs.push({ kind: 'tape', text: place, h: 0.21, w: Math.min(1.7, Math.max(0.9, 0.21 * 0.5 * r + 0.4)), rot: ang(9), round: 0.9, overlap: 0.05 }); }
      specs.push({ kind: 'tape', h: 0.17, w: 0.85, rot: ang(14) });
      const nameWord = (content.brand && [...content.brand].length <= 10 ? content.brand : null) || nextWord(8);
      if (nameWord) specs.push({ kind: 'nametag', w: 0.9, h: 0.62, text: nameWord, rot: ang(7) });
      // fruit stickers carry a word, the first one the date as its number; none is left blank
      const fruits = [];
      for (let i = 0; i < 3; i++) { const w = nextWord(6), num = i === 0 && copy.date ? copy.date.plu : null; if (w || num) fruits.push({ kind: 'fruit', w: 0.46, h: 0.34, text: w, num, rot: ang(16) }); }
      specs.push(...fruits);
      const extra = ['heart', 'star', 'dot'];
      for (let i = 0; specs.length < count - 2 && i < extra.length; i++) specs.push({ kind: extra[i], w: extra[i] === 'dot' ? 0.24 : 0.36, h: extra[i] === 'dot' ? 0.24 : extra[i] === 'heart' ? 0.32 : 0.36, rot: ang(14) });
      specs.push({ kind: 'dot', w: 0.2, h: 0.2, rot: 0 }, { kind: 'dot', w: 0.16, h: 0.16, rot: 0 });
    } else {
      // badges: a seal with the date (or a keyword), a bubble and a pill with words, then small shapes
      if (copy.date) specs.push({ kind: 'seal', w: 1, h: 1, text: copy.date.md, top: copy.date.end ? null : copy.date.wd, bottom: copy.date.time || copy.date.end && `– ${copy.date.end}`, rot: ang(5) });
      else {
        const n = keyNumber(content), w0 = nextWord(5);
        specs.push({ kind: 'seal', w: 1, h: 1, text: w0 || n || (ko ? '안녕' : 'HELLO'), rot: ang(5) });
        ctx.note('stickers: the copy names no date, so the big seal carries ' + (w0 ? `"${w0}"` : n ? `the number ${n}` : 'a greeting') + '. Put the date in "meta" (label 일시 / Date) to print it on the seal.');
      }
      const w1 = nextWord(8);
      if (w1) { const r = await ratioOf(w1); specs.push({ kind: 'bubble', w: Math.min(1.25, Math.max(0.78, 0.3 * r + 0.42)), h: 0.6, text: w1, rot: ang(7), round: 0.95 }); }
      else specs.push({ kind: 'heart', w: 0.62, h: 0.56, rot: ang(8) });
      const w2 = nextWord(9);
      if (w2) { const r = await ratioOf(w2); specs.push({ kind: 'pill', h: 0.27, w: Math.min(1.25, Math.max(0.55, 0.27 * 0.48 * r + 0.27 * 0.95)), text: w2, rot: ang(10) }); }
      else specs.push({ kind: 'pill', h: 0.24, w: 0.6, rot: ang(10), twoTone: true });
      const w3 = nextWord(4);
      if (w3) specs.push({ kind: 'circle', w: 0.44, h: 0.44, text: w3, rot: ang(10) });
      const small = ['star', 'flower', 'smiley', 'heart', 'sparkle', 'arrow', 'sparkle', 'pill', 'star'];
      const sz = { star: [0.46, 0.46], flower: [0.44, 0.44], smiley: [0.4, 0.4], heart: [0.4, 0.36], sparkle: [0.3, 0.3], arrow: [0.5, 0.25], pill: [0.42, 0.18] };
      for (let i = 0; specs.length < count && i < small.length; i++) {
        const kind = small[i], [w, h] = sz[kind], k = i > 5 ? 0.72 : 1;
        specs.push({ kind, w: w * k, h: h * k, rot: kind === 'arrow' ? ang(20) : ang(16), twoTone: kind === 'pill', overlap: kind === 'sparkle' ? 0.3 : 0.16 });
      }
    }
    // colours in turn (the hero gets colors[0]); then scale so the stickers cover a good part of the room
    specs.forEach((s, i) => { s.fill = colourAt(i); s.fill2 = colourAt(i + 2); });
    const area = specs.reduce((a, s) => a + s.w * s.h * (s.kind === 'tape' ? 1 : 0.8), 0);
    const k = Math.sqrt((0.46 * A) / area);
    for (const s of specs) { s.w *= k; s.h *= k; }
    // keep the hero inside the room's height
    const big = Math.max(...specs.map((s) => Math.max(...halfExt(s)) * 2));
    if (big > 0.62 * Math.min(1, A)) { const f = (0.62 * Math.min(1, A)) / big; for (const s of specs) { s.w *= f; s.h *= f; } }
    const start = A >= 1 ? [A * (0.5 + rng.sign() * rng.range(0.08, 0.16)), rng.range(0.42, 0.58)] : [A * rng.range(0.42, 0.58), 0.5 + rng.sign() * rng.range(0.08, 0.15)];
    specs = pack(specs, A, rng, { start });
  }

  // ---- fit the whole cluster (border and shadow included) into the box the layout gives
  const bN = 0.03;   // die-cut border + shadow, in room units, for the extent
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of specs) { const [hx, hy] = halfExt(s); x0 = Math.min(x0, s.x - hx - bN); x1 = Math.max(x1, s.x + hx + bN); y0 = Math.min(y0, s.y - hy - bN); y1 = Math.max(y1, s.y + hy + bN * 1.4); }
  const box = ctx.fit((x1 - x0) / (y1 - y0), { fill: 0.94 });
  const S = box.w / (x1 - x0);
  const border = Math.max(U * 0.55, Math.min(S * 0.022, U * 1.6));
  const X = (x) => box.x + (x - x0) * S, Y = (y) => box.y + (y - y0) * S;

  const root = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'stickers-art' });
  ctx.root.append(root);
  const defs = svg('defs'); root.append(defs);
  defs.append(svg('filter', { id: 'stk-shadow', x: '-20%', y: '-20%', width: '140%', height: '140%' }, [svg('feGaussianBlur', { stdDeviation: r2(border * 0.45) })]));
  let clipN = 0;

  // draw order: large first, small on top — as they would be stuck on, one after another
  // (stickers that carry words go on after the plain ones, so no plain one covers their lettering)
  const weight = (s) => (s.kind === 'letter' || s.kind === 'glyph' ? -1 : s.w * s.h + (s.text || s.num ? 0 : 100));
  const order = [...specs].sort((a, b) => weight(b) - weight(a));
  for (const s of order) await drawSticker(s);

  // ------------------------------------------------------------------
  async function drawSticker(s) {
    const w = s.w * S, h = s.h * S, g = svg('g', { transform: `translate(${r2(X(s.x))} ${r2(Y(s.y))}) rotate(${r2(s.rot)})` });
    root.append(g);
    const fill = s.fill, ink = onFill(fill);
    // silhouette parts: { tag, a } filled shapes, or { line, width } stroked paths (the tag's string)
    const sil = [], deco = [];
    let text = null;   // { str, box, font, color, sub: [{ str, box }] }
    const R = Math.min(w, h) / 2;
    const P = (d, extra = {}) => ({ tag: 'path', a: { d, ...extra } });
    switch (s.kind) {
      case 'seal': {
        sil.push(P(scallop(R, 16, 0.085)));
        deco.push(svg('circle', { cx: 0, cy: 0, r: r2(R * 0.78), fill: 'none', stroke: mix(fill, ink, 0.6), 'stroke-width': r2(R * 0.022), 'stroke-dasharray': `${r2(R * 0.05)} ${r2(R * 0.045)}` }));
        const hasT = !!s.top, hasB = !!s.bottom;
        text = { str: s.text, box: { x: -R * 0.56, y: hasT || hasB ? -R * 0.2 + (hasT && !hasB ? R * 0.08 : 0) - (hasB && !hasT ? R * 0.08 : 0) : -R * 0.26, w: R * 1.12, h: hasT || hasB ? R * 0.42 : R * 0.52 }, sub: [] };
        if (hasT) text.sub.push({ str: s.top, box: { x: -R * 0.36, y: text.box.y - R * 0.26, w: R * 0.72, h: R * 0.13 } });
        if (hasB) text.sub.push({ str: s.bottom, box: { x: -R * 0.36, y: text.box.y + text.box.h + R * 0.13, w: R * 0.72, h: R * 0.13 } });
        break;
      }
      case 'circle':
        sil.push({ tag: 'circle', a: { cx: 0, cy: 0, r: R } });
        text = { str: s.text, box: { x: -R * 0.66, y: -R * 0.3, w: R * 1.32, h: R * 0.6 } };
        break;
      case 'bubble': {
        const bh = h * 0.8, tail = roundedPoly([[-w * 0.3, bh / 2 - h * 0.12], [-w * 0.34, h / 2], [-w * 0.08, bh / 2 - h * 0.02]], h * 0.03);
        sil.push({ tag: 'rect', a: { x: -w / 2, y: -h / 2, width: w, height: bh, rx: r2(bh * 0.42) } }, P(tail));
        text = { str: s.text, box: { x: -w / 2 + bh * 0.36, y: -h / 2 + bh * 0.25, w: w - bh * 0.72, h: bh * 0.5 } };
        break;
      }
      case 'pill':
        sil.push(P(capsule(w, h)));
        if (s.text) text = { str: s.text, box: { x: -w / 2 + h * 0.45, y: -h * 0.24, w: w - h * 0.9, h: h * 0.48 } };
        else if (s.twoTone) deco.push(svg('path', { d: halfCapsule(w, h), fill: s.fill2 }));
        break;
      case 'star':
        sil.push(P(roundedPoly(ring(0, R * 0.06, R * 1.04, 5, { inner: R * 0.56 }), (i) => (i % 2 ? R * 0.1 : R * 0.16))));
        break;
      case 'flower': {
        for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; sil.push({ tag: 'circle', a: { cx: r2(Math.cos(a) * R * 0.56), cy: r2(Math.sin(a) * R * 0.56), r: r2(R * 0.44) } }); }
        deco.push(svg('circle', { cx: 0, cy: 0, r: r2(R * 0.36), fill: s.fill2 === fill ? ink : s.fill2 }));
        break;
      }
      case 'heart': sil.push(P(heart(w, h))); break;
      case 'smiley':
        sil.push({ tag: 'circle', a: { cx: 0, cy: 0, r: R } });
        deco.push(svg('ellipse', { cx: r2(-R * 0.3), cy: r2(-R * 0.18), rx: r2(R * 0.085), ry: r2(R * 0.15), fill: ink }), svg('ellipse', { cx: r2(R * 0.3), cy: r2(-R * 0.18), rx: r2(R * 0.085), ry: r2(R * 0.15), fill: ink }),
          svg('path', { d: `M${r2(-R * 0.44)} ${r2(R * 0.12)}Q0 ${r2(R * 0.66)} ${r2(R * 0.44)} ${r2(R * 0.12)}`, fill: 'none', stroke: ink, 'stroke-width': r2(R * 0.11), 'stroke-linecap': 'round' }));
        break;
      case 'sparkle': {
        const k = R * 0.15;
        sil.push(P(`M0 ${r2(-R)}Q${r2(k)} ${r2(-k)} ${r2(R)} 0Q${r2(k)} ${r2(k)} 0 ${r2(R)}Q${r2(-k)} ${r2(k)} ${r2(-R)} 0Q${r2(-k)} ${r2(-k)} 0 ${r2(-R)}Z`));
        break;
      }
      case 'arrow': {
        const t = h * 0.21, hd = h * 0.8;
        sil.push(P(roundedPoly([[-w / 2, -t], [w / 2 - hd, -t], [w / 2 - hd, -h / 2], [w / 2, 0], [w / 2 - hd, h / 2], [w / 2 - hd, t], [-w / 2, t]], h * 0.07)));
        break;
      }
      case 'tag': {
        // a luggage tag: chamfered end with an eyelet, its string looping out past the end
        const horiz = !!s.horiz, L = horiz ? w : h, T = horiz ? h : w;
        const body = L * 0.84, c = T * 0.3, e0 = -L / 2 + (L - body);   // the body starts after room for the string
        const pts = [[e0 + c, -T / 2], [L / 2, -T / 2], [L / 2, T / 2], [e0 + c, T / 2], [e0, T / 2 - c], [e0, -T / 2 + c]];
        const rot = (p) => (horiz ? p : [-p[1], p[0]]);   // a vertical tag hangs from its top
        sil.push(P(roundedPoly(pts.map(rot), T * 0.05)));
        const hole = [e0 + T * 0.2, 0];
        const str = [hole, [e0 - L * 0.04, -T * 0.06], [-L / 2 + T * 0.02, T * 0.18], [-L / 2 + L * 0.05, -T * 0.34]].map(rot);
        sil.push({ line: `M${r2(str[0][0])} ${r2(str[0][1])}C${r2(str[1][0])} ${r2(str[1][1])} ${r2(str[2][0])} ${r2(str[2][1])} ${r2(str[3][0])} ${r2(str[3][1])}`, width: T * 0.028, color: mix(pal.ink, fill, 0.15) });
        const hp = rot(hole);
        deco.push(svg('circle', { cx: r2(hp[0]), cy: r2(hp[1]), r: r2(T * 0.1), fill: cut }), svg('circle', { cx: r2(hp[0]), cy: r2(hp[1]), r: r2(T * 0.055), fill: pal.bg }));
        // the lettering sits on the body, after the eyelet
        const bx0 = e0 + T * 0.38, bx1 = L / 2 - T * 0.12, sub = s.sub;
        if (horiz) {
          text = { str: s.text, box: { x: bx0, y: -T * (sub ? 0.3 : 0.22), w: bx1 - bx0, h: T * (sub ? 0.36 : 0.44) }, sub: [] };
          if (sub) { text.sub.push({ str: sub, box: { x: bx0, y: T * 0.17, w: bx1 - bx0, h: T * 0.11 }, align: 'left', cap: true }); deco.push(svg('line', { x1: r2(bx0), x2: r2(bx1), y1: r2(T * 0.1), y2: r2(T * 0.1), stroke: mix(fill, ink, 0.6), 'stroke-width': r2(T * 0.012) })); }
        } else {
          const tw = T * 0.74;
          text = { str: s.text, box: { x: -tw / 2, y: bx0 + (bx1 - bx0) * 0.12, w: tw, h: (bx1 - bx0) * (sub ? 0.44 : 0.6) }, sub: [] };
          if (sub) { const yy = text.box.y + text.box.h + (bx1 - bx0) * 0.12; deco.push(svg('line', { x1: r2(-tw / 2), x2: r2(tw / 2), y1: r2(yy), y2: r2(yy), stroke: mix(fill, ink, 0.6), 'stroke-width': r2(T * 0.012) })); text.sub.push({ str: sub, box: { x: -tw / 2, y: yy + (bx1 - bx0) * 0.08, w: tw, h: T * 0.09 }, cap: true }); }
        }
        break;
      }
      case 'tape': {
        // a strip of tape with zig-zag torn ends
        const teeth = 5, z = h * 0.11, left = [], right = [];
        for (let i = 0; i <= teeth * 2; i++) { const y = -h / 2 + (h * i) / (teeth * 2); left.push([-w / 2 + (i % 2 ? z : 0), y]); right.push([w / 2 - (i % 2 ? z : 0), y]); }
        const pts = [...right, ...left.reverse()];
        sil.push(P(polyD(pts)));
        if (s.text) text = { str: s.text, box: { x: -w / 2 + h * 0.75, y: -h * 0.2, w: w - h * 1.5, h: h * 0.4 }, cap: true };   // clear of the torn ends
        else {
          // washi stripes, clipped to the strip
          const id = `stk-clip-${clipN++}`;
          defs.append(svg('clipPath', { id }, [svg('path', { d: polyD(pts) })]));
          const gg = svg('g', { 'clip-path': `url(#${id})` });
          for (let x = -w / 2 - h; x < w / 2 + h; x += h * 0.5) gg.append(svg('path', { d: `M${r2(x)} ${r2(h / 2)}L${r2(x + h * 0.5)} ${r2(-h / 2)}`, stroke: s.fill2 === fill ? ink : s.fill2, 'stroke-width': r2(h * 0.12) }));
          deco.push(gg);
        }
        break;
      }
      case 'nametag': {
        const band = h * 0.32;
        sil.push({ tag: 'rect', a: { x: -w / 2, y: -h / 2, width: w, height: h, rx: r2(h * 0.1) } });
        // the writing field in the die-cut colour, the coloured band above and a thin strip below
        deco.push(svg('rect', { x: r2(-w / 2 + h * 0.06), y: r2(-h / 2 + band), width: r2(w - h * 0.12), height: r2(h - band - h * 0.13), rx: r2(h * 0.04), fill: cut }));
        const cap = ko ? '이름' : 'NAME';
        text = { str: s.text, box: { x: -w / 2 + h * 0.16, y: -h / 2 + band + h * 0.12, w: w - h * 0.32, h: h * 0.3 }, color: readableOn(cut, [pal.ink, '#161616']), sub: [{ str: cap, box: { x: -w * 0.3, y: -h / 2 + band * 0.32, w: w * 0.6, h: band * 0.36 }, cap: true }] };
        break;
      }
      case 'fruit': {
        sil.push({ tag: 'ellipse', a: { cx: 0, cy: 0, rx: w / 2, ry: h / 2 } });
        deco.push(svg('ellipse', { cx: 0, cy: 0, rx: r2(w / 2 - h * 0.08), ry: r2(h / 2 - h * 0.08), fill: 'none', stroke: mix(fill, ink, 0.55), 'stroke-width': r2(h * 0.025) }));
        if (s.num && s.text) text = { str: s.num, box: { x: -w * 0.28, y: h * 0.0, w: w * 0.56, h: h * 0.22 }, sub: [{ str: s.text, box: { x: -w * 0.3, y: -h * 0.24, w: w * 0.6, h: h * 0.15 }, cap: true }] };
        else if (s.num) text = { str: s.num, box: { x: -w * 0.3, y: -h * 0.15, w: w * 0.6, h: h * 0.3 } };
        else if (s.text) text = { str: s.text, box: { x: -w * 0.3, y: -h * 0.15, w: w * 0.6, h: h * 0.3 } };
        break;
      }
      case 'dot': sil.push({ tag: 'circle', a: { cx: 0, cy: 0, r: R } }); break;
      case 'letter': {
        if (s.shape === 'circle') sil.push({ tag: 'circle', a: { cx: 0, cy: 0, r: R * 0.98 } });
        else if (s.shape === 'seal') sil.push(P(scallop(R * 1.02, 12, 0.08)));
        else sil.push({ tag: 'rect', a: { x: -R * 0.9, y: -R * 0.9, width: R * 1.8, height: R * 1.8, rx: R * 0.32 } });
        text = { str: s.text, box: { x: -R * 0.56, y: -R * 0.56, w: R * 1.12, h: R * 1.12 } };
        break;
      }
      case 'glyph': break;
    }

    // shadow, die-cut border, then the sticker itself
    const shadowG = svg('g', { transform: `translate(${r2(border * 0.18)} ${r2(border * 0.42)})`, filter: 'url(#stk-shadow)' });
    const cutG = svg('g');
    const bodyG = svg('g');
    g.append(shadowG, cutG, bodyG);
    if (s.kind === 'glyph') {
      // the die-cut follows the letter itself: the glyph stroked thick, under the glyph in colour
      const bx = { x: -R * 0.82, y: -R * 0.82, w: R * 1.64, h: R * 1.64 };
      await inkText(shadowG, s.text, bx, titleFont, { fill: shadow, stroke: shadow, 'stroke-width': r2(border * 2.4), 'stroke-linejoin': 'round' });
      await inkText(cutG, s.text, bx, titleFont, { fill: cut, stroke: cut, 'stroke-width': r2(border * 2.4), 'stroke-linejoin': 'round' });
      await inkText(bodyG, s.text, bx, titleFont, { fill });
      return;
    }
    for (const p of sil) {
      if (p.line) {
        shadowG.append(svg('path', { d: p.line, fill: 'none', stroke: shadow, 'stroke-width': r2(p.width + border * 2), 'stroke-linecap': 'round' }));
        cutG.append(svg('path', { d: p.line, fill: 'none', stroke: cut, 'stroke-width': r2(p.width + border * 2), 'stroke-linecap': 'round' }));
      } else {
        shadowG.append(svg(p.tag, { ...p.a, fill: shadow, stroke: shadow, 'stroke-width': r2(border * 2), 'stroke-linejoin': 'round' }));
        cutG.append(svg(p.tag, { ...p.a, fill: cut, stroke: cut, 'stroke-width': r2(border * 2), 'stroke-linejoin': 'round' }));
      }
    }
    for (const p of sil) {
      if (p.line) bodyG.append(svg('path', { d: p.line, fill: 'none', stroke: p.color, 'stroke-width': r2(p.width), 'stroke-linecap': 'round' }));
      else bodyG.append(svg(p.tag, { ...p.a, fill }));
    }
    for (const d of deco) bodyG.append(d);
    if (text && text.str) {
      const color = text.color || ink;
      const f = text.cap ? capFont : titleFont, tr = text.cap && !isKorean(text.str) ? 0.06 : 0;
      const str = text.cap && !isKorean(text.str) ? String(text.str).toUpperCase() : String(text.str);
      const r = await inkText(bodyG, str, text.box, f, { fill: color, tracking: tr, align: text.align || 'center' });
      if (r.size < U * 1.5) r.node.remove();
      for (const sb of text.sub || []) {
        const sf = capFont, st = isKorean(sb.str) ? String(sb.str) : String(sb.str).toUpperCase();
        const rr = await inkText(bodyG, st, sb.box, sf, { fill: color, tracking: isKorean(st) ? 0.04 : 0.12, align: sb.align || 'center' });
        if (rr.size < U * 1.5) rr.node.remove();
      }
    }
  }
}
