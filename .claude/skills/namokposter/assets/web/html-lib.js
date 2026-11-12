// Helpers shared by HTML scenes — art layers built from DOM and SVG inside the poster page itself.
// An HTML scene is a module with `export default function build(ctx)`; it draws into `ctx.root`.
// Nothing here touches the copy: the art layer sits under it, as a rendered image would.

/** Deterministic RNG: same seed → same poster (the same generator the three.js scenes use). */
export function makeRng(seed = 1) {
  let a = (seed >>> 0) || 1;
  const next = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const rng = () => next();
  rng.range = (lo, hi) => lo + (hi - lo) * next();
  rng.int = (lo, hi) => Math.floor(rng.range(lo, hi + 1));
  rng.pick = (arr) => arr[Math.floor(next() * arr.length)];
  rng.sign = () => (next() < 0.5 ? -1 : 1);
  rng.shuffle = (arr) => { const a2 = [...arr]; for (let i = a2.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a2[i], a2[j]] = [a2[j], a2[i]]; } return a2; };
  return rng;
}

// ------------------------------------------------------------------ colour
export const rgbOf = (hex) => { let x = String(hex).trim().replace('#', ''); if (x.length === 3) x = [...x].map((c) => c + c).join(''); return [0, 2, 4].map((k) => parseInt(x.slice(k, k + 2), 16) || 0); };
export const hexOf = (rgb) => '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
/** Mix two hex colours: t = 0 gives a, t = 1 gives b. */
export const mix = (a, b, t) => { const x = rgbOf(a), y = rgbOf(b); return hexOf(x.map((v, k) => v + (y[k] - v) * t)); };
export const alpha = (hex, a) => { const [r, g, b] = rgbOf(hex); return `rgba(${r},${g},${b},${a})`; };
export function luminance(hex) { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; const [r, g, b] = rgbOf(hex); return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }
export function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
/** Of the candidates, the colour that reads best on `bg` (lettering on a coloured shape). */
export const readableOn = (bg, candidates = ['#ffffff', '#111111']) => candidates.reduce((best, c) => (contrast(c, bg) > contrast(best, bg) ? c : best), candidates[0]);
/** Pull `hex` towards `towards` until it stands off `bg` by at least `min` (keeps the hue as long as it can). */
export function standOff(hex, bg, towards, min = 3) { let c = hex; for (let n = 0; n < 14 && contrast(c, bg) < min; n++) c = mix(c, towards, 0.16); return c; }

// ------------------------------------------------------------------ DOM
const SVG_NS = 'http://www.w3.org/2000/svg';
const setAll = (node, attrs, svg) => {
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'text') node.textContent = String(v);
    else if (k === 'html') node.innerHTML = String(v);
    else if (k === 'class') node.setAttribute('class', v);
    else if (!svg && k in node && k !== 'list') node[k] = v;
    else node.setAttribute(k, String(v));
  }
  return node;
};
const addKids = (node, kids) => { for (const k of [].concat(kids ?? []).flat(Infinity)) if (k != null && k !== false) node.append(k); return node; };
/** el('div', { class: 'x', style: { left: '10px' }, text: 'hi' }, [children]) */
export const el = (tag, attrs, kids) => addKids(setAll(document.createElement(tag), attrs, false), kids);
/** svg('circle', { cx: 10, cy: 10, r: 4, fill: '#000' }) — an element in the SVG namespace */
export const svg = (tag, attrs, kids) => addKids(setAll(document.createElementNS(SVG_NS, tag), attrs, true), kids);
/** Add a stylesheet that lives and dies with the art layer. Scope every rule under `.art-html`. */
export const css = (root, text) => { const st = document.createElement('style'); st.textContent = text; root.append(st); return st; };
const r2 = (v) => Math.round(v * 100) / 100;
/** SVG path data through points: straight segments, or (smooth) a Catmull-Rom curve. */
export function pathOf(points, { closed = false, smooth = false } = {}) {
  if (!points.length) return '';
  if (!smooth) return 'M' + points.map((p) => `${r2(p[0])} ${r2(p[1])}`).join('L') + (closed ? 'Z' : '');
  const n = points.length, at = (i) => (closed ? points[(i + n) % n] : points[Math.max(0, Math.min(n - 1, i))]);
  let d = `M${r2(points[0][0])} ${r2(points[0][1])}`;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    d += `C${r2(p1[0] + (p2[0] - p0[0]) / 6)} ${r2(p1[1] + (p2[1] - p0[1]) / 6)} ${r2(p2[0] - (p3[0] - p1[0]) / 6)} ${r2(p2[1] - (p3[1] - p1[1]) / 6)} ${r2(p2[0])} ${r2(p2[1])}`;
  }
  return d + (closed ? 'Z' : '');
}
/** A regular shape as points: polygon(n), or a star / scalloped seal with an inner radius. */
export function ring(cx, cy, r, n, { inner = null, rotate = -Math.PI / 2 } = {}) {
  const pts = [], m = inner == null ? n : n * 2;
  for (let i = 0; i < m; i++) { const a = rotate + (i / m) * Math.PI * 2, rr = inner != null && i % 2 ? inner : r; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
  return pts;
}

/**
 * Shrink the font of `node` until it is no wider than `maxW` and no taller than `maxH` (px).
 * Returns the size used. The node should be `white-space: nowrap` for a single line.
 */
export function fitText(node, maxW, maxH = Infinity, { max = 4000, min = 4 } = {}) {
  let lo = min, hi = max;
  const fits = (s) => { node.style.fontSize = `${s}px`; const b = node.getBoundingClientRect(); const w = Math.max(b.width, node.scrollWidth), h = Math.max(b.height, node.scrollHeight); return w <= maxW && h <= maxH; };
  if (fits(hi)) return hi;
  for (let i = 0; i < 22 && hi - lo > 0.25; i++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
  node.style.fontSize = `${lo}px`;
  return lo;
}

/** Where the ink of a piece of text really is (px, relative to the viewport): caps and numerals leave air above and below their line box. */
export function inkRect(node) {
  const cs = getComputedStyle(node), size = parseFloat(cs.fontSize) || 16;
  const c = document.createElement('canvas').getContext('2d');
  c.font = `${cs.fontStyle} ${cs.fontWeight} ${size}px ${cs.fontFamily}`;
  const m = c.measureText(node.textContent || 'H');
  const box = node.getBoundingClientRect();
  const asc = m.actualBoundingBoxAscent, desc = m.actualBoundingBoxDescent, fAsc = m.fontBoundingBoxAscent ?? size * 0.8, fDesc = m.fontBoundingBoxDescent ?? size * 0.2;
  // the baseline sits where the font's own ascent ends inside the line box
  const base = box.top + (box.height - (fAsc + fDesc)) / 2 + fAsc;
  return { left: box.left, right: box.right, top: base - asc, bottom: base + desc, width: box.width, height: asc + desc, baseline: base };
}

/**
 * Measure where the ink of a string is, in ems: glyphs leave air inside their line box, and a giant
 * numeral has to be placed by its ink. `font` is { family, weight, style } with a resolved family
 * (ctx.font.title / body / mono). Loads the faces the string needs first. `size` is the px size the
 * string will be set at, when known: faces with an optical-size axis change shape with size.
 */
export async function measureInk(text, font, tracking = 0, size = 400) {
  const REF = Math.max(8, Math.min(2000, size)), spec = `${font.style || 'normal'} ${font.weight || 700} ${REF}px ${font.family}`;
  try { await document.fonts.load(spec, text); } catch { /* measured with whatever is there */ }
  const c = document.createElement('canvas').getContext('2d');
  c.font = spec;
  if (tracking) c.letterSpacing = `${tracking * REF}px`;
  const m = c.measureText(text), trail = tracking * REF;   // letter-spacing also follows the last glyph
  const left = m.actualBoundingBoxLeft, right = m.actualBoundingBoxRight - (tracking > 0 ? trail : 0);
  return { left: left / REF, right: right / REF, ascent: m.actualBoundingBoxAscent / REF, descent: m.actualBoundingBoxDescent / REF, width: (left + right) / REF, height: (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) / REF, advance: m.width / REF };
}

/**
 * An SVG <text> whose ink fills `box` ({ x, y, w, h } px): fitted to the width or the height,
 * whichever binds, then aligned inside the box. Extra attributes (fill, stroke …) go on the node.
 * → { node, size, baseline, ink: { x, y, w, h } }
 */
export async function inkText(parent, text, box, font, { align = 'center', valign = 'middle', tracking = 0, fitTo = 'both', ...attrs } = {}) {
  const sizeFor = (q) => (fitTo === 'width' ? box.w / q.width : fitTo === 'height' ? box.h / q.height : Math.min(box.w / q.width, box.h / q.height));
  let m = await measureInk(text, font, tracking);
  // measured again near the size it will be set at: a face with an optical-size axis is not the same shape at 40 px as at 400
  if (Math.abs(sizeFor(m) - 400) > 120) m = await measureInk(text, font, tracking, sizeFor(m));
  const size = sizeFor(m);
  const w = m.width * size, h = m.height * size;
  const x = align === 'left' ? box.x : align === 'right' ? box.x + box.w - w : box.x + (box.w - w) / 2;
  const y = valign === 'top' ? box.y : valign === 'bottom' ? box.y + box.h - h : box.y + (box.h - h) / 2;
  const node = svg('text', { x: r2(x + m.left * size), y: r2(y + m.ascent * size), 'font-family': font.family, 'font-weight': font.weight || 700, 'font-style': font.style || 'normal', 'font-size': r2(size), 'letter-spacing': tracking ? `${r2(tracking * size)}px` : null, ...attrs, text });
  parent.append(node);
  return { node, size, baseline: y + m.ascent * size, ink: { x, y, w, h } };
}

/** A line of small lettering in SVG at a given size (px); anchor: start | middle | end. → the node */
export function label(parent, text, x, y, font, size, { anchor = 'start', tracking = 0.08, caps = true, ...attrs } = {}) {
  const node = svg('text', { x: r2(x), y: r2(y), 'font-family': font.family, 'font-weight': font.weight || 500, 'font-size': r2(size), 'text-anchor': anchor, 'letter-spacing': `${r2(tracking * size)}px`, ...attrs, text: caps ? String(text).toUpperCase() : String(text) });
  parent.append(node);
  return node;
}

// ------------------------------------------------------------------ reading the copy
// eventDate, keyNumber, keywords, MONTH_NAMES, DAY_NAMES, daysIn, isKorean — see copy-read.mjs
export * from '/skill/assets/web/copy-read.mjs';
