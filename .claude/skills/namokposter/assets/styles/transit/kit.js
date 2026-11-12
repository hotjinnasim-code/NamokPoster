// transit/kit.js — helpers shared by the three motifs of the transit style (metro, route, blocks).
// Not in html-lib.js: canvas text measuring (adv / inkOf) and txt(); room() and fitBox() (the art's
// room, cut clear of every measured piece of copy); roundPath() (a polyline with bends of one
// constant radius); rectangle and segment tests for placing labels where nothing else is; the
// station capsule, the numbered bullet and the venue's flag; onInk / faint / sameInk for colour.
import { svg, contrast, readableOn, rgbOf } from '/skill/assets/web/html-lib.js';

export const r2 = (v) => Math.round(v * 100) / 100;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ------------------------------------------------------------------ measuring and setting type
const cv = document.createElement('canvas').getContext('2d');
const spec = (f, size) => `${f.style || 'normal'} ${f.weight || 400} ${size}px ${f.family}`;
/** make sure the face has the glyphs of `text` before anything is measured */
export async function load(f, text) { try { await document.fonts.load(spec(f, 100), text); } catch { /* measured with what is there */ } }
/** advance width of a string (px), without the trailing letter-space */
export function adv(text, f, size, tr = 0) { cv.font = spec(f, size); cv.letterSpacing = `${tr * size}px`; const w = cv.measureText(text).width; cv.letterSpacing = '0px'; return w - (tr && text ? tr * size : 0); }
/** ink ascent / descent of a string (px): where the letters really are above and below the baseline */
export function inkOf(text, f, size) { cv.font = spec(f, size); cv.letterSpacing = '0px'; const m = cv.measureText(text); return { asc: m.actualBoundingBoxAscent, desc: m.actualBoundingBoxDescent }; }
/** an SVG <text>; anchor: start | middle | end */
export function txt(parent, s, x, y, f, size, { anchor = 'start', tr = 0, ...attrs } = {}) {
  const n = svg('text', { x: r2(x), y: r2(y), 'font-family': f.family, 'font-weight': f.weight || 400, 'font-style': f.style || 'normal', 'font-size': r2(size), 'text-anchor': anchor, 'letter-spacing': tr ? `${r2(tr * size)}px` : null, ...attrs, text: s });
  parent.append(n); return n;
}

// ------------------------------------------------------------------ the room
/** the rectangles that carry type, in px */
export const quietPx = (ctx) => ctx.quiet.map((q) => ctx.px(q));
/**
 * The free room the layout left, inside the margins (px) — then cut back until it is clear of every
 * measured piece of copy: a type theme may draw a rule wider than the copy block (the eyebrow's rule
 * in grotesk), and a diagram's thin lines must not cross it.
 */
export function room(ctx, gap = ctx.unit * 2.2) {
  const a = ctx.px(ctx.artRect), s = ctx.safe;
  const x0 = Math.max(a.x, s.x), y0 = Math.max(a.y, s.y), x1 = Math.min(a.x + a.w, s.x + s.w), y1 = Math.min(a.y + a.h, s.y + s.h);
  let r = { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
  const quiet = quietPx(ctx).map((q) => ({ x: q.x - gap, y: q.y - gap, w: q.w + 2 * gap, h: q.h + 2 * gap }));
  for (let pass = 0; pass < 8; pass++) {
    const hit = quiet.find((q) => q.x < r.x + r.w && r.x < q.x + q.w && q.y < r.y + r.h && r.y < q.y + q.h);
    if (!hit) break;
    // four ways to step aside; keep the largest piece
    const cuts = [
      { x: r.x, y: r.y, w: hit.x - r.x, h: r.h }, { x: hit.x + hit.w, y: r.y, w: r.x + r.w - hit.x - hit.w, h: r.h },
      { x: r.x, y: r.y, w: r.w, h: hit.y - r.y }, { x: r.x, y: hit.y + hit.h, w: r.w, h: r.y + r.h - hit.y - hit.h },
    ].filter((k) => k.w > 1 && k.h > 1);
    if (!cuts.length) break;
    r = cuts.reduce((p, q) => (p.w * p.h >= q.w * q.h ? p : q));
  }
  return r;
}
/** the largest box of an aspect ratio (w / h) in room `rm`, scaled by `fill`, as near the layout's focus as it can sit */
export function fitBox(ctx, rm, aspect, fill = 0.94) {
  const k = Math.min(fill, (ctx.layout?.fill ?? 1) * fill), bw = Math.min(rm.w, rm.h * aspect) * k, bh = bw / aspect;
  const cx = clamp(ctx.focus.x * ctx.W, rm.x + bw / 2, rm.x + rm.w - bw / 2), cy = clamp(ctx.focus.y * ctx.H, rm.y + bh / 2, rm.y + rm.h - bh / 2);
  return { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh, cx, cy };
}

// ------------------------------------------------------------------ rectangles and segments
export const inflate = (b, p, q = p) => ({ x: b.x - p, y: b.y - q, w: b.w + 2 * p, h: b.h + 2 * q });
export const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
export const inside = (a, b) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
/** does the segment a–b touch rectangle r? (Liang–Barsky) */
export function segHitsRect(a, b, r) {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const p = [-dx, dx, -dy, dy], q = [a[0] - r.x, r.x + r.w - a[0], a[1] - r.y, r.y + r.h - a[1]];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-9) { if (q[i] < 0) return false; continue; }
    const t = q[i] / p[i];
    if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}

// ------------------------------------------------------------------ lines
/**
 * SVG path data for a polyline whose corners are rounded with arcs of radius R (px) — the bends of
 * one constant radius of a transit diagram. `closed` joins the last point to the first (a loop line).
 */
export function roundPath(P, R, closed = false) {
  const n = P.length, at = (i) => P[(i + n) % n];
  let d = closed ? '' : `M${r2(P[0][0])} ${r2(P[0][1])}`;
  for (let i = closed ? 0 : 1; i < (closed ? n : n - 1); i++) {
    const a = at(i - 1), b = at(i), c = at(i + 1);
    const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
    if (l1 < 1e-6 || l2 < 1e-6) continue;
    const u = [(b[0] - a[0]) / l1, (b[1] - a[1]) / l1], v = [(c[0] - b[0]) / l2, (c[1] - b[1]) / l2];
    const cross = u[0] * v[1] - u[1] * v[0], dot = u[0] * v[0] + u[1] * v[1];
    if (Math.abs(cross) < 1e-6) { d += `${d ? 'L' : 'M'}${r2(b[0])} ${r2(b[1])}`; continue; }   // no turn here
    // the arc touches both runs T away from the corner; sweep follows the turn (y runs down)
    const tan = Math.tan(Math.acos(clamp(dot, -1, 1)) / 2);
    let rr = R, T = rr * tan;
    const lim = Math.min(l1, l2) * 0.48;                   // never eat more than half of a short run
    if (T > lim) { T = lim; rr = T / tan; }
    d += `${d ? 'L' : 'M'}${r2(b[0] - u[0] * T)} ${r2(b[1] - u[1] * T)}A${r2(rr)} ${r2(rr)} 0 0 ${cross > 0 ? 1 : 0} ${r2(b[0] + v[0] * T)} ${r2(b[1] + v[1] * T)}`;
  }
  return closed ? d + 'Z' : d + `L${r2(P[n - 1][0])} ${r2(P[n - 1][1])}`;
}
/** is every run of the polyline horizontal, vertical or at 45°? (a skeleton that fails this is a bug) */
export function octilinear(P, closed = false) {
  for (let i = closed ? 0 : 1; i < P.length; i++) { const q = P[(i + P.length - 1) % P.length], dx = Math.abs(P[i][0] - q[0]), dy = Math.abs(P[i][1] - q[1]); if (dx > 1e-6 && dy > 1e-6 && Math.abs(dx - dy) > 1e-6) return false; }
  return true;
}

// ------------------------------------------------------------------ the pieces of a diagram
/**
 * A station marker that joins one or more points: a capsule (a round dot when there is one point)
 * in `fill` with a ring in `ring`. pts in px; r = half the capsule's width; ringW = ring thickness.
 */
export function capsule(g, pts, r, ringW, fill, ring) {
  const d = pts.length > 1 ? 'M' + pts.map((p) => `${r2(p[0])} ${r2(p[1])}`).join('L') : `M${r2(pts[0][0])} ${r2(pts[0][1])}h0.01`;
  g.append(svg('path', { d, fill: 'none', stroke: ring, 'stroke-width': r2(2 * (r + ringW)), 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  g.append(svg('path', { d, fill: 'none', stroke: fill, 'stroke-width': r2(2 * r), 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
}
/** the bounding box of a capsule */
export function capsuleBox(pts, r) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return { x: Math.min(...xs) - r, y: Math.min(...ys) - r, w: Math.max(...xs) - Math.min(...xs) + 2 * r, h: Math.max(...ys) - Math.min(...ys) + 2 * r };
}
/** a line's bullet: a disc in the line's colour carrying its number or letter */
export function bullet(g, x, y, r, color, mark, f, pal, ringed = false) {
  if (ringed) g.append(svg('circle', { cx: r2(x), cy: r2(y), r: r2(r + r * 0.14), fill: pal.ink }));
  g.append(svg('circle', { cx: r2(x), cy: r2(y), r: r2(r), fill: color }));
  const size = r * 1.18, m = inkOf(mark, f, size);
  txt(g, mark, x, y + m.asc / 2 - m.desc / 2, f, size, { anchor: 'middle', fill: onInk(color, pal) });
}

/**
 * The venue's label: a flag — a flat tag in the accent carrying the venue's name on one line or two —
 * and under it one line of small type (date and time). measureFlag() gives its size at a type size,
 * drawFlag() sets it with its top-left corner at (x, y).
 */
/** the sizes the flag is tried at, best first: [size in units, lines of the name]. Two lines come before a small single line */
export const FLAG_SIZES = [[2.8, 1], [2.45, 1], [2.7, 2], [2.35, 2], [2.1, 1], [2.05, 2], [1.85, 1], [1.8, 2], [1.65, 1], [1.6, 2]];
export function measureFlag(env, name, sub, size, rows = 1) {
  const { f, U } = env, tr = env.ko ? 0 : 0.01;
  // on two lines the name breaks at the space nearest its middle
  let lines = [name];
  if (rows === 2) {
    const words = name.split(/\s+/);
    if (words.length < 2) return null;
    // … or rather after a comma, and never after an article or a preposition left hanging
    let best = null;
    for (let k = 1; k < words.length; k++) {
      const a = words.slice(0, k).join(' '), b = words.slice(k).join(' '), last = words[k - 1];
      const w = Math.max(adv(a, f.flag, size, tr), adv(b, f.flag, size, tr)) * (/[,·]$/.test(last) ? 0.8 : /^(the|of|a|an|and|at|in|on|for|to|by|&)$/i.test(last) ? 1.5 : 1);
      if (!best || w < best.w) best = { w, lines: [a, b] };
    }
    lines = best.lines;
  }
  const padX = size * 0.62, padY = size * 0.4, lead = size * 1.22, subSize = Math.max(U * 1.5, size * 0.7), gap = subSize * 0.62;
  const tw = Math.max(...lines.map((l) => adv(l, f.flag, size, tr))), fw = tw + 2 * padX, fh = size + (lines.length - 1) * lead + 2 * padY;
  const sw = sub ? adv(sub, f.sub, subSize, 0.02) : 0;
  return { w: Math.max(fw, sw), h: fh + (sub ? gap + subSize * 0.82 : 0), fw, fh, padX, padY, lead, subSize, gap, size, lines, tr };
}
export function drawFlag(env, g, name, sub, m, x, y, align = 'left') {
  const { f, pal, U } = env;
  const fx = align === 'right' ? x + m.w - m.fw : x;
  g.append(svg('rect', { x: r2(fx), y: r2(y), width: r2(m.fw), height: r2(m.fh), rx: r2(U * 0.22), fill: env.mark }));
  // the name sits on the optical centre of the tag: by the ink of its capitals / syllables, not its line box
  const ink = inkOf(env.ko ? '장소홀' : 'HEA', f.flag, m.size);
  m.lines.forEach((l, k) => txt(g, l, fx + m.padX, y + m.padY + m.size / 2 + ink.asc / 2 + k * m.lead, f.flag, m.size, { fill: env.onMark, tr: m.tr }));
  if (sub) txt(g, sub, align === 'right' ? x + m.w : x, y + m.fh + m.gap + m.subSize * 0.78, f.sub, m.subSize, { fill: pal.ink, tr: 0.02, anchor: align === 'right' ? 'end' : 'start' });
}
/** lettering on a coloured shape: the page colour or the ink, whichever reads — black or white only when neither does */
export function onInk(color, pal) {
  const best = readableOn(color, [pal.bg, pal.ink]);
  return contrast(best, color) >= 3 ? best : readableOn(color, [best, '#ffffff', '#111111']);
}
/** does a colour need an outline to be seen on the page? (a white line on a yellow sheet) */
export const faint = (c, bg) => contrast(c, bg) < 1.38;
/** are two colours the same ink, near enough? (distance in sRGB — luminance contrast cannot tell red from green) */
export const sameInk = (a, b) => { const x = rgbOf(a), y = rgbOf(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) < 64; };
