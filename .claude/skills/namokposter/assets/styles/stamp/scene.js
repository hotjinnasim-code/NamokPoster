// stamp — the event as a piece of post: a large postage stamp with perforated edges, a small flat
// vignette in two or three inks and the date as its denomination, cancelled by a hand-struck round
// postmark that carries the place and the date. Printed ephemera made from the poster's own copy,
// like `ticket` and `calendar`, but quieter. An HTML scene: SVG shapes and text set in the poster's
// faces — vector in the PDF (the one filter is the soft shadow under the paper).
//
// Palette: colors[0] = first printing ink (the first stamp's picture field and its denomination)
//          colors[1] = second printing ink (the vignette's second colour; the next stamp of a block)
//          colors[2] = the stamp's own paper, a lighter tint than the page so it stands off it
//          ink       = the postmark (one ink at about 80%) and the small lettering on the stamp;
//                      on a dark page the stamp's lettering takes the page colour instead, and the
//                      part of the postmark that lies on the stamp is printed in it too
//          bg        = a third printing ink when the page is a colour that shows on the paper (kraft)
// Motifs:  single  (one large stamp turned a few degrees, a postmark over its upper left corner)
//          sheet   (a block of stamps joined along their perforations, one torn out, one postmark)
//          airmail (the corner of an envelope: slanted stripes along two edges, stamp, postmark, label)
// Params:  vignette = auto | sea | hills | sprig | arcs · orient = auto | portrait | landscape
//          tilt = degrees the stamp or block is turned (the direction is seeded)
// Nothing here imitates a real country's stamp: no country name, emblem, portrait or currency — the
// caption is the headline, the denomination is the date.
// Helpers written here (not in html-lib): perfPath() (the perforated outline of one stamp or of a
// block as one path), the four vignettes, face() (what is printed on a stamp), setFigures() (lining
// numerals fitted by their ink), postmark() (rings, legends on arcs, wavy lines), legendRoom() (keeps
// the postmark's lettering off the pictures), canvas measuring (adv / fitLine).
import { svg, mix, contrast, readableOn, standOff, eventDate, keyNumber, inkText, pathOf, makeRng, DAY_NAMES, isKorean } from '/skill/assets/web/html-lib.js';

const r2 = (v) => Math.round(v * 100) / 100, two = (n) => String(n).padStart(2, '0');
const RAD = Math.PI / 180;
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
// One perforation pitch in local units. A stamp is a whole number of pitches each way (20 × 25), so a
// hole sits exactly on every corner and the stamps of a block share their holes.
const P = 40, HOLE = P * 0.29, SHORT = 20 * P, LONG = 25 * P;
// the stamp's paper border (as far as the hairline frame), and the frame with the air inside it
const BORDER = P * 1.5, FRAME = BORDER + P * 0.55;
// how much of the caption line the caption may take: the rest is left to a postmark struck on that corner
const CAP_SHARE = 0.62;
// the postmark is turned 12° anticlockwise, so its lines climb as they run to the right
const PM_DEG = -12;

// ------------------------------------------------------------------ measuring and lettering
const cv = document.createElement('canvas').getContext('2d');
const spec = (f, size) => `${f.style || 'normal'} ${f.weight || 400} ${size}px ${f.family}`;
async function load(f, text) { try { await document.fonts.load(spec(f, 100), text); } catch { /* measured with what is there */ } }
/** advance width of a string (px), without the trailing letter-space */
function adv(text, f, size, tr = 0) { cv.font = spec(f, size); cv.letterSpacing = `${tr * size}px`; const w = cv.measureText(text).width; cv.letterSpacing = '0px'; return w - (tr && text ? tr * size : 0); }
/** an SVG <text> */
function txt(parent, s, x, y, f, size, { anchor = 'start', tr = 0, ...attrs } = {}) {
  const n = svg('text', { x: r2(x), y: r2(y), 'font-family': f.family, 'font-weight': f.weight || 400, 'font-style': f.style || 'normal', 'font-size': r2(size), 'text-anchor': anchor, 'letter-spacing': tr ? `${r2(tr * size)}px` : null, ...attrs, text: s });
  parent.append(n); return n;
}
/** the first of the candidate strings that fits `maxW` at this size (each is tried a little tighter
 *  before it is given up); else the last one, cut word by word → { text, tr } */
function fitLine(cands, f, size, maxW, tr = 0) {
  const list = cands.filter(Boolean);
  for (const c of list) for (const t of [tr, tr * 0.5]) if (adv(c, f, size, t) <= maxW) return { text: c, tr: t };
  const words = String(list[list.length - 1] || '').split(/\s+/);
  while (words.length > 1 && adv(words.join(' '), f, size, tr * 0.5) > maxW) words.pop();
  return { text: adv(words.join(' '), f, size, tr * 0.5) <= maxW ? words.join(' ') : '', tr: tr * 0.5 };
}
/**
 * Numerals whose ink fills `box` ({ x, y, w, h }) from its foot, starting at its left edge.
 * Not html-lib's inkText: the poster asks for lining figures (font-variant-numeric), which the canvas
 * that inkText measures with cannot be told — in a face whose own figures are old-style (a Garamond)
 * the numerals would come out a third too tall. So the height is taken from the 6 and the 8, which
 * reach the lining height in either kind of figure, and the width from the line as the browser really
 * sets it. Every date is then set at one figure height, whatever its digits.
 */
function setFigures(g, text, box, f, { fill, tracking = 0 }) {
  const REF = 200;
  cv.font = spec(f, REF); cv.letterSpacing = '0px';
  const asc = cv.measureText('68').actualBoundingBoxAscent / REF, desc = cv.measureText('0').actualBoundingBoxDescent / REF;
  const lsb = -cv.measureText([...text][0] || '0').actualBoundingBoxLeft / REF;      // the first numeral's side bearing
  const widthAt = (size) => { const n = txt(g, text, 0, 0, f, size, { tr: tracking, opacity: 0 }); let w = 0; try { w = n.getComputedTextLength() - tracking * size; } catch { /* not laid out */ } n.remove(); return (w || adv(text, f, size, tracking)) / size; };
  let size = Math.min(box.w / (widthAt(REF) - lsb), box.h / (asc + desc));
  size = Math.min(box.w / (widthAt(size) - lsb), box.h / (asc + desc));   // again at the size it will be set: an optical-size axis changes the widths
  return txt(g, text, box.x - lsb * size, box.y + box.h - desc * size, f, size, { fill, tr: tracking });
}
const upper = (s, ko) => (ko ? String(s) : String(s).toUpperCase());
/** the free room the layout left, inside the margins (px) */
function room(ctx) {
  const r = ctx.px(ctx.artRect), s = ctx.safe;
  const x0 = Math.max(r.x, s.x), y0 = Math.max(r.y, s.y), x1 = Math.min(r.x + r.w, s.x + s.w), y1 = Math.min(r.y + r.h, s.y + s.h);
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}
const rot = ([x, y], deg) => { const c = Math.cos(deg * RAD), s = Math.sin(deg * RAD); return [x * c - y * s, x * s + y * c]; };
const extent = (pts) => ({ x0: Math.min(...pts.map((q) => q[0])), x1: Math.max(...pts.map((q) => q[0])), y0: Math.min(...pts.map((q) => q[1])), y1: Math.max(...pts.map((q) => q[1])) });
/** the turn of the stamp or block: the draft's `tilt`, or a few degrees; the direction is seeded */
const tiltOf = (params, rng, lo, hi) => (params.tilt !== '' && params.tilt != null && !Number.isNaN(+params.tilt) ? Math.abs(+params.tilt) : rng.range(lo, hi)) * rng.sign();
let uid = 0;

// ------------------------------------------------------------------ the perforated outline
/**
 * The outline of a block of stamps as one path: cols × rows cells of sw × sh, `has(i, j)` says which
 * are there. Every edge is a straight run bitten by half-round holes one pitch apart, with a hole
 * centred on every corner (a quarter bite on an outer corner, three quarters where a stamp was torn
 * out of the block). Where two stamps are still joined the holes are whole, and are part of the path
 * (fill-rule evenodd), so the page shows through them. → path data
 */
function perfPath(cols, rows, sw, sh, has = () => true) {
  const present = (i, j) => i >= 0 && j >= 0 && i < cols && j < rows && has(i, j);
  // the boundary as directed cell edges, clockwise (paper on the right), keyed by the corner they leave
  const from = new Map(), key = (x, y) => `${x},${y}`;
  const edge = (ax, ay, bx, by) => from.set(key(ax, ay), { a: [ax, ay], b: [bx, by] });
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    if (!present(i, j)) continue;
    if (!present(i, j - 1)) edge(i, j, i + 1, j);
    if (!present(i + 1, j)) edge(i + 1, j, i + 1, j + 1);
    if (!present(i, j + 1)) edge(i + 1, j + 1, i, j + 1);
    if (!present(i - 1, j)) edge(i, j + 1, i, j);
  }
  const first = from.values().next().value, chain = [];
  for (let e = first, n = 0; e && n < 4 * cols * rows + 4; n++) { chain.push(e); e = from.get(key(...e.b)); if (e === first) break; }
  const r = HOLE, pt = (x, y) => `${r2(x)} ${r2(y)}`;
  let d = '';
  chain.forEach((e, k) => {
    const dx = e.b[0] - e.a[0], dy = e.b[1] - e.a[1], len = dx ? sw : sh, n = Math.round(len / P);
    const ax = e.a[0] * sw, ay = e.a[1] * sh, at = (t) => [ax + dx * t, ay + dy * t];
    if (!k) d += `M${pt(...at(r))}`;
    for (let q = 1; q < n; q++) d += `L${pt(...at(q * P - r))}A${r} ${r} 0 0 0 ${pt(...at(q * P + r))}`;
    d += `L${pt(...at(len - r))}`;
    // the hole on the corner: which way the outline turns there decides how much of it bites the paper
    const nx = chain[(k + 1) % chain.length], ex = nx.b[0] - nx.a[0], ey = nx.b[1] - nx.a[1], turn = dx * ey - dy * ex;
    d += `A${r} ${r} 0 ${turn < 0 ? 1 : 0} 0 ${pt(e.b[0] * sw + ex * r, e.b[1] * sh + ey * r)}`;
  });
  d += 'Z';
  // whole holes along the joins between stamps that are both there
  const holes = [], nx = Math.round(sw / P), ny = Math.round(sh / P);
  for (let i = 1; i < cols; i++) for (let k = 0; k <= rows * ny; k++) {
    const j = Math.floor(k / ny), ok = k % ny ? present(i - 1, j) && present(i, j) : present(i - 1, j - 1) && present(i, j - 1) && present(i - 1, j) && present(i, j);
    if (ok) holes.push([i * sw, k * P]);
  }
  for (let j = 1; j < rows; j++) for (let k = 0; k <= cols * nx; k++) {
    if (k % nx === 0) continue;                         // the crossings were made with the upright joins
    const i = Math.floor(k / nx);
    if (present(i, j - 1) && present(i, j)) holes.push([k * P, j * sh]);
  }
  for (const [x, y] of holes) d += `M${pt(x - r, y)}a${r} ${r} 0 1 0 ${r2(r * 2)} 0a${r} ${r} 0 1 0 ${r2(-r * 2)} 0Z`;
  return d;
}
/** the paper: a soft shadow (the one filter of the style), then the perforated shape in the paper colour */
function paperShape(E, g, d) {
  const id = `stp-sh-${E.ctx.seed}-${uid++}`, size = P * 0.4;
  g.append(svg('defs', {}, [svg('filter', { id, x: '-20%', y: '-20%', width: '140%', height: '140%' }, [svg('feGaussianBlur', { stdDeviation: r2(size) })])]));
  g.append(svg('path', { d, 'fill-rule': 'evenodd', fill: E.darkPage ? 'rgba(0,0,0,0.5)' : 'rgba(30,22,12,0.24)', transform: `translate(${r2(size * 0.3)} ${r2(size * 0.8)})`, filter: `url(#${id})` }));
  g.append(svg('path', { d, 'fill-rule': 'evenodd', fill: E.paper }));
}

// ------------------------------------------------------------------ the vignettes
// Each fills a window of w × h with a few flat shapes on the field colour: `p` is the paper showing
// through, `s` the second ink, `tint` the field colour printed lighter. Shapes run off the window's
// edges, so the picture reads as a small print and not as an icon dropped on a colour. `put(node,
// paper)` adds a shape clipped to the window; shapes in the paper colour are clipped a hair wider, so
// that no line of the field colour is left between them and the stamp's paper border. No rays anywhere.
const wave = (x0, x1, y, amp, len, phase) => { const pts = [], n = Math.ceil((x1 - x0) / (len / 12)); for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n; pts.push([x, y + Math.sin((x / len) * Math.PI * 2 + phase) * amp]); } return pts; };
const VIGNETTES = {
  /** a plain disc — small, to one side — over three wavy bands */
  sea(put, w, h, { p, s }, rng) {
    const m = Math.min(w, h * 1.25), flip = rng() < 0.5 ? -1 : 1;
    put(svg('circle', { cx: r2(w / 2 + flip * w * 0.2), cy: r2(h * 0.27), r: r2(m * 0.105), fill: p }), true);
    const amp = m * 0.024, len = m * 0.5, ph = rng.range(0, 6.28);
    [[0.58, s], [0.725, p], [0.865, s]].forEach(([t, fill], i) => {
      const top = wave(-10, w + 10, h * t, amp, len, ph + i * 2.1);
      put(svg('path', { d: pathOf(top, { smooth: true }) + `L${r2(w + 10)} ${r2(h + 10)}L-10 ${r2(h + 10)}Z`, fill }), fill === p);
    });
  },
  /** two overlapping hills and a small disc: the far hill in a tint of the field, the near one in the second ink */
  hills(put, w, h, { p, s, tint }, rng) {
    const flip = rng() < 0.5 ? -1 : 1, X = (t) => (flip > 0 ? t : 1 - t) * w;
    const ra = w * 0.6, rb = w * 0.78;
    put(svg('circle', { cx: r2(X(0.7)), cy: r2(h * 0.26), r: r2(Math.min(w, h * 1.25) * 0.075), fill: p }), true);
    put(svg('circle', { cx: r2(X(0.24)), cy: r2(h * 0.44 + ra), r: r2(ra), fill: tint }), false);
    put(svg('circle', { cx: r2(X(0.86)), cy: r2(h * 0.66 + rb), r: r2(rb), fill: s }), false);
  },
  /** a sprig with five leaves, rising from a strip of ground */
  sprig(put, w, h, { p, s }, rng) {
    const flip = rng() < 0.5 ? -1 : 1, gy = h * 0.86, H = Math.min(h * 0.7, w * 0.9);
    put(svg('rect', { x: -10, y: r2(gy), width: r2(w + 20), height: r2(h - gy + 10), fill: s }), false);
    // the stem: a gentle curve from the ground to the tip, leaning a little to one side
    const a = [w / 2 - flip * H * 0.1, gy], c = [w / 2 - flip * H * 0.1, gy - H * 0.5], b = [w / 2 + flip * H * 0.1, gy - H * 0.8];
    const at = (t) => [(1 - t) ** 2 * a[0] + 2 * t * (1 - t) * c[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * t * (1 - t) * c[1] + t * t * b[1]];
    const dirAt = (t) => { const q0 = at(Math.max(0, t - 0.01)), q1 = at(Math.min(1, t + 0.01)); return Math.atan2(q1[1] - q0[1], q1[0] - q0[0]); };
    put(svg('path', { d: `M${r2(a[0])} ${r2(a[1] + 2)}Q${r2(c[0])} ${r2(c[1])} ${r2(b[0])} ${r2(b[1])}`, fill: 'none', stroke: p, 'stroke-width': r2(H * 0.024), 'stroke-linecap': 'round' }), false);
    // a leaf: pointed at the tip, full towards the base
    const leaf = (t, side, len) => {
      const [bx, by] = at(t), ang = dirAt(t) + side * 0.95, ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux, wd = len * 0.27;
      const q = (along, across) => `${r2(bx + ux * len * along + nx * wd * across)} ${r2(by + uy * len * along + ny * wd * across)}`;
      put(svg('path', { d: `M${q(0, 0)}C${q(0.18, 1.05)} ${q(0.62, 0.95)} ${q(1, 0)}C${q(0.62, -0.95)} ${q(0.18, -1.05)} ${q(0, 0)}Z`, fill: p }), false);
    };
    leaf(0.2, -flip, H * 0.34); leaf(0.4, flip, H * 0.34); leaf(0.6, -flip, H * 0.3); leaf(0.8, flip, H * 0.27); leaf(1, 0, H * 0.26);
  },
  /** three concentric arcs standing on a line, over a strip of ground. Hollow arches in one ink (so
   *  they never read as a roundel), set off-centre so that the widest runs out of the window. */
  arcs(put, w, h, { p, s }, rng) {
    const base = h * 0.82, Ro = Math.min(w * 0.47, h * 0.6), t = Ro * 0.08, step = Ro * 0.24, cx = w / 2 + (rng() < 0.5 ? -1 : 1) * w * 0.13;
    put(svg('rect', { x: -10, y: r2(base), width: r2(w + 20), height: r2(h - base + 10), fill: s }), false);
    for (let k = 0; k < 3; k++) { const r = Ro - k * step - t / 2; put(svg('path', { d: `M${r2(cx - r)} ${r2(base + 1)}A${r2(r)} ${r2(r)} 0 0 1 ${r2(cx + r)} ${r2(base + 1)}`, fill: 'none', stroke: p, 'stroke-width': r2(t) }), false); }
    put(svg('rect', { x: -10, y: r2(base - t / 2), width: r2(w + 20), height: r2(t), fill: p }), true);
  },
};

// ------------------------------------------------------------------ what is printed on a stamp
/** the caption of a stamp of w × h: the headline when it fits on the line, else its emphasised word,
 *  else the eyebrow, else one word of it; none on a stamp too small to carry it at a readable size
 *  → { text, tr, capS, width } */
function captionOf(E, w, h) {
  const { f, minS, ko } = E, capS = Math.max(Math.min(w, h) * 0.034, minS);
  if (capS > Math.min(w, h) * 0.085) return { text: '', tr: 0, capS, width: 0 };
  const { text, tr } = fitLine(E.capCands.map((s) => upper(s, ko)), f.cap, capS, (w - 2 * FRAME) * CAP_SHARE, ko ? 0.1 : 0.16);
  return { text, tr, capS, width: text ? adv(text, f.cap, capS, tr) : 0 };
}
/** where a postmark's lettering must not fall on the stamp in the cell x, y, w, h: its picture and
 *  denomination, and its caption ([x0, y0, x1, y1] in the frame the cell is given in) */
function zonesOf(E, x, y, w, h, capSide) {
  const c = captionOf(E, w, h), m = P * 0.45, x0 = x + FRAME, x1 = x + w - FRAME, y0 = y + FRAME;
  const zones = [[x0 - m, y0 + (c.text ? c.capS * 1.62 : 0) - m * 0.4, x1 + m, y + h - FRAME + m]];
  if (c.text) zones.push(capSide === 'right' ? [x1 - c.width - c.capS * 0.7, y0 - c.capS * 0.4, x1 + m, y0 + c.capS * 1.3] : [x0 - m, y0 - c.capS * 0.4, x0 + c.width + c.capS * 0.7, y0 + c.capS * 1.3]);
  return zones;
}
/**
 * One stamp's face in the cell x, y, w, h (local units): the paper border, a hairline frame, then a
 * line of small caps, the picture window in the field colour with its vignette, and under it the
 * denomination (the date) in the display face with the year in the mono face.
 * `look` = { field, second, vignette, capSide, rng }.
 */
function face(E, g, x, y, w, h, look) {
  const { f, paper, dark, minS } = E, { field, second } = look;
  g.append(svg('rect', { x: r2(x + BORDER), y: r2(y + BORDER), width: r2(w - 2 * BORDER), height: r2(h - 2 * BORDER), fill: 'none', stroke: mix(dark, paper, 0.2), 'stroke-width': r2(Math.max(2.2, minS * 0.09)) }));
  const cx0 = x + FRAME, cy0 = y + FRAME, cw = w - 2 * FRAME, ch = h - 2 * FRAME;
  const { text: cap, tr: capTr, capS } = captionOf(E, w, h), right = look.capSide === 'right';
  // (text-anchor end counts the last letter-space, so the line is pushed back by it)
  if (cap) txt(g, cap, right ? cx0 + cw + capTr * capS : cx0, cy0 + capS * 0.76, f.cap, capS, { fill: dark, tr: capTr, anchor: right ? 'end' : 'start' });
  // the denomination row: month and day together, the year at their baseline on the right
  const numH = Math.min(Math.max(Math.min(h * 0.19, ch * 0.3), capS * 2.5), ch * 0.4);
  const year = E.year && capS <= Math.min(w, h) * 0.1 ? E.year : '', yearW = year ? adv(year, f.mono, capS, 0.04) + capS : 0;
  setFigures(g, E.num, { x: cx0, y: cy0 + ch - numH, w: cw - yearW, h: numH }, f.num, { fill: standOff(field, paper, dark, 3), tracking: -0.02 });
  if (year) txt(g, year, cx0 + cw + 0.04 * capS, cy0 + ch, f.mono, capS, { fill: dark, tr: 0.04, anchor: 'end' });
  // the picture window
  const wy = cy0 + (cap ? capS * 1.62 : 0), wh = Math.max(P, cy0 + ch - numH - Math.max(capS * 1.1, P * 0.9) - wy);
  const id = `stp-win-${E.ctx.seed}-${uid++}`, inner = svg('g', { transform: `translate(${r2(cx0)} ${r2(wy)})` });
  inner.append(svg('defs', {}, [
    svg('clipPath', { id }, [svg('rect', { x: 0, y: 0, width: r2(cw), height: r2(wh) })]),
    svg('clipPath', { id: `${id}p` }, [svg('rect', { x: -1.5, y: -1.5, width: r2(cw + 3), height: r2(wh + 3) })]),
  ]));
  inner.append(svg('rect', { x: 0, y: 0, width: r2(cw), height: r2(wh), fill: field }));
  g.append(inner);
  const put = (node, isPaper) => { node.setAttribute('clip-path', `url(#${id}${isPaper ? 'p' : ''})`); inner.append(node); };
  VIGNETTES[look.vignette](put, cw, wh, { p: paper, s: second, tint: mix(field, paper, 0.45) }, look.rng);
}
/** the look of the k-th stamp: the inks take turns as the field, each time with another second ink
 *  (five stamps of three inks are five different pairings); the vignettes come from `order` */
function lookOf(E, k, order) {
  const n = E.inks.length, a = k % n, b = (k + 1 + Math.floor(k / n)) % n;
  return { field: E.inks[a], second: n > 1 ? E.inks[b === a ? (k + 2) % n : b] : mix(E.inks[a], E.paper, 0.5), vignette: order[k % order.length], rng: makeRng(E.ctx.seed * 31 + k * 7 + 3) };
}
/** the vignettes in a seeded order, the one the draft asks for first */
const vignetteOrder = (E) => { const all = E.rng.shuffle(Object.keys(VIGNETTES)), want = E.params.vignette; return VIGNETTES[want] ? [want, ...all.filter((v) => v !== want)] : all; };

// ------------------------------------------------------------------ the postmark
/**
 * The room a legend has on the ring: how far (radians) it may run to the left and to the right of the
 * top (or the foot) of the postmark before its lettering would touch a forbidden zone. `pc` is the
 * postmark's centre and `deg` its turn, in the frame the zones are given in. → { left, right }
 */
function legendRoom(zones, pc, R, deg, top, max) {
  const hit = (a) => [0.76, 0.84, 0.92].some((k) => { const [x, y] = rot([Math.cos(a) * R * k, Math.sin(a) * R * k], deg); return zones.some((z) => pc[0] + x > z[0] && pc[0] + x < z[2] && pc[1] + y > z[1] && pc[1] + y < z[3]); });
  // "right" is the way the lettering runs: clockwise over the top, anticlockwise under the foot
  const c = top ? -Math.PI / 2 : Math.PI / 2, sgn = top ? 1 : -1, walk = (way) => { let a = 0; while (a < max && !hit(c + way * sgn * (a + 0.04))) a += 0.02; return a; };
  return hit(c) ? { left: 0, right: 0 } : { left: walk(-1), right: walk(1) };
}
/**
 * A hand-struck postmark centred on (0, 0) of `g`: two rings, the place round the upper arc and a
 * short word round the lower one, the date on three short lines in the middle, and wavy cancellation
 * lines running off to one side (`dir` = 1 right, −1 left) for `len`. One ink. The rings are broken
 * in a few places and heavier on one side, as a rubber stamp prints — dashes and a second stroke, no
 * raster filter. `room` = { top, bottom }: the room each legend has (see legendRoom).
 */
function postmark(E, g, R, dir, len, ink, room) {
  const { f, ko, minS, pm } = E, rng = makeRng(E.ctx.seed + 77), id = `stp-pm-${E.ctx.seed}-${uid++}`;
  const Ri = R * 0.66, mid = (R + Ri) / 2, swO = R * 0.045, swI = R * 0.026;
  // rings: a few short breaks, placed by the seed
  const broken = (r, n) => { const C = 2 * Math.PI * r, cuts = Array.from({ length: n }, () => rng.range(0.05, 0.95)).sort((a, b) => a - b), out = []; let at = 0; for (const c of cuts) { const gap = rng.range(0.004, 0.012); out.push(r2((c - at) * C), r2(gap * C)); at = c + gap; } out.push(r2((1 - at) * C), 0); return out.join(' '); };
  g.append(svg('circle', { cx: 0, cy: 0, r: r2(R), fill: 'none', stroke: ink, 'stroke-width': r2(swO), 'stroke-dasharray': broken(R, 3), transform: `rotate(${r2(rng.range(0, 360))})` }));
  g.append(svg('circle', { cx: 0, cy: 0, r: r2(Ri), fill: 'none', stroke: ink, 'stroke-width': r2(swI), 'stroke-dasharray': broken(Ri, 2), transform: `rotate(${r2(rng.range(0, 360))})` }));
  // the heavier side: a second pass over part of the outer ring
  const a0 = rng.range(0, 360), a1 = a0 + rng.range(70, 130), pa = (a) => [Math.cos(a * RAD) * R, Math.sin(a * RAD) * R];
  g.append(svg('path', { d: `M${pa(a0).map(r2).join(' ')}A${r2(R)} ${r2(R)} 0 0 1 ${pa(a1).map(r2).join(' ')}`, fill: 'none', stroke: ink, 'stroke-width': r2(swO * 1.55), 'stroke-linecap': 'round' }));
  // Lettering round the ring: the upper legend runs clockwise over the top, the lower one
  // anticlockwise under the foot, so both read left to right. A legend too long for its room is set
  // tighter, then smaller (never under the smallest readable size), and only then loses words. On a
  // postmark too small for readable lettering the ring carries none.
  const defs = svg('defs'); g.append(defs);
  const size = Math.max(minS, R * 0.168), trk = ko ? 0.12 : 0.14, steps = [size, size * 0.9, size * 0.8].filter((v, i) => !i || v >= minS);
  // → { angle, shift }: the angle the legend takes and how far it had to move off-centre (to the right)
  const arcText = (cands, top, k, maxA, rm) => {
    if (minS > R * 0.3) return { angle: 0, shift: 0 };
    for (const text of cands) for (const sz of steps) for (const tr of [trk, trk * 0.5]) {
      const rb = top ? mid - sz * 0.36 : mid + sz * 0.36, wd = adv(text, f.cap, sz, tr), need = (wd + sz * 0.3) / rb;
      if (need > Math.min(maxA, rm.left + rm.right)) continue;
      // centred when it can be; pushed towards the roomier side when a stamp's picture is in the way
      const shift = need / 2 > rm.left ? need / 2 - rm.left : need / 2 > rm.right ? rm.right - need / 2 : 0;
      // the path it is set on: 300° of the circle with the top (or the foot) at its middle, so that a legend moved off-centre is not cut short
      const ex = rb * 0.5, ey = rb * 0.866 * (top ? 1 : -1);
      defs.append(svg('path', { id: `${id}-${k}`, d: `M${r2(-ex)} ${r2(ey)}A${r2(rb)} ${r2(rb)} 0 1 ${top ? 1 : 0} ${r2(ex)} ${r2(ey)}` }));
      const t = svg('text', { 'font-family': f.cap.family, 'font-weight': f.cap.weight, 'font-size': r2(sz), 'letter-spacing': `${r2(tr * sz)}px`, fill: ink });
      t.append(svg('textPath', { href: `#${id}-${k}`, startOffset: r2(((Math.PI * 5) / 6 + shift) * rb + (tr * sz) / 2), 'text-anchor': 'middle', text }));
      g.append(t);
      return { angle: need + (sz * 0.3) / rb, shift };
    }
    return { angle: 0, shift: 0 };
  };
  // the short word first, so that the place can take what is left of the ring
  const bot = arcText(pm.bottom.map((s) => upper(s, ko)), false, 'b', 1.5, room.bottom);
  const tp = arcText(pm.top.map((s) => upper(s, ko)), true, 'a', Math.min(3.5, Math.PI * 2 - bot.angle - 0.9), room.top);
  // a dot in the middle of each gap between the two legends (angles clockwise from the right)
  if (tp.angle || bot.angle) {
    const tA = -Math.PI / 2 + tp.shift, bA = Math.PI / 2 - bot.shift;
    for (const [from, to] of [[tA + tp.angle / 2, bA - bot.angle / 2], [bA + bot.angle / 2, tA - tp.angle / 2 + Math.PI * 2]]) {
      if (to - from > 0.35) g.append(svg('circle', { cx: r2(Math.cos((from + to) / 2) * mid), cy: r2(Math.sin((from + to) / 2) * mid), r: r2(size * 0.15), fill: ink }));
    }
  }
  // the date in the middle, in the mono face: up to three short lines, the date itself larger
  const big = Math.max(minS * 1.25, R * 0.27), small = Math.max(minS, R * 0.17);
  const lines = big + small * 2 > Ri * 1.5 ? pm.lines.filter((s) => s === E.num).slice(0, 1) : pm.lines;      // a very small postmark keeps the date only
  const bigAt = lines.length === 3 ? 1 : Math.max(0, lines.indexOf(E.num)), sizes = lines.map((_, i) => (i === bigAt ? big : small));
  const lead = 1.22, total = sizes.reduce((a, s) => a + s * 0.72, 0) + (sizes.length - 1) * small * (lead - 0.72);
  let yy = -total / 2;
  lines.forEach((s, i) => {
    yy += sizes[i] * 0.72;
    txt(g, s, 0, yy, i === bigAt ? f.monoB : f.mono, sizes[i], { anchor: 'middle', fill: ink, tr: 0.02 });
    yy += small * (lead - 0.72);
  });
  // the cancellation: five parallel wavy lines, starting clear of the ring and following its curve,
  // each with one short break and a slightly different length
  const n = 5, gap = R * 0.235, amp = R * 0.042, wl = R * 0.44;
  for (let i = 0; i < n; i++) {
    const y = (i - (n - 1) / 2) * gap, x0 = Math.sqrt(Math.max(0, (R * 1.13) ** 2 - y * y)), x1 = R * 1.13 + len - rng.range(0, R * 0.12);
    const pts = wave(x0, x1, y, amp, wl, 0).map(([px, py]) => [px * dir, py]);
    const L = (x1 - x0) * 1.06, dash = `${r2(L * rng.range(0.25, 0.85))} ${r2(R * rng.range(0.02, 0.05))} ${r2(L)} 0`;
    g.append(svg('path', { d: pathOf(pts, { smooth: true }), fill: 'none', stroke: ink, 'stroke-width': r2(R * 0.04), 'stroke-linecap': 'round', 'stroke-dasharray': dash }));
  }
}
/**
 * The postmark struck over the stamps at x, y of `root`, turned by `deg`: in the page's ink — and,
 * where that ink would vanish on the stamp's paper (a dark page with pale ink), in the stamp's own
 * dark ink inside the paper's outline (`paperD` under the transform `paperT`). `zones` are the places
 * its legends must keep off, with the centre `at` and the turn `rel` in the frame they are given in.
 */
function strike(E, root, { x, y, R, deg, dir, len, zones = [], at = [x, y], rel = deg }, paperD, paperT) {
  const room = { top: legendRoom(zones, at, R, rel, true, 2), bottom: legendRoom(zones, at, R, rel, false, 0.75) };
  const draw = (parent, ink) => { const g = svg('g', { transform: `translate(${r2(x)} ${r2(y)}) rotate(${r2(deg)})`, opacity: 0.82 }); parent.append(g); postmark(E, g, R, dir, len, ink, room); };
  if (contrast(E.pal.ink, E.paper) >= 3) { draw(root, E.pal.ink); return; }
  const idIn = `stp-in-${E.ctx.seed}-${uid++}`, idOut = `stp-out-${E.ctx.seed}-${uid++}`, big = 40 * LONG;
  root.append(svg('defs', {}, [
    svg('clipPath', { id: idIn }, [svg('path', { d: paperD, transform: paperT, 'clip-rule': 'evenodd' })]),
    svg('clipPath', { id: idOut }, [svg('path', { d: `M${-big} ${-big}H${big}V${big}H${-big}Z` + paperD, transform: paperT, 'clip-rule': 'evenodd' })]),
  ]));
  for (const [id, ink] of [[idOut, E.pal.ink], [idIn, E.dark]]) { const c = svg('g', { 'clip-path': `url(#${id})` }); root.append(c); draw(c, ink); }
}

// ------------------------------------------------------------------ the scene
export default async function build(ctx) {
  const { W, H, palette: pal, params, content, font, rng } = ctx;
  const motif = ['single', 'sheet', 'airmail'].includes(params.motif) ? params.motif : 'single';
  const ko = ctx.lang === 'ko' || isKorean(content.title);
  // ---- colours. The stamp's paper is colors[2]; its small lettering is whichever of ink / page is
  // dark on it. The printing inks are the palette's two colours, that dark ink, and — when the page
  // itself is a colour that shows on the stamp's paper (kraft) — the page colour, deepened a little.
  const paper = pal.colors[2] || mix(pal.bg, '#ffffff', 0.7);
  const dark = readableOn(paper, [pal.ink, pal.bg]);
  const pageInk = contrast(pal.bg, paper) >= 1.5 && pal.bg !== dark ? standOff(pal.bg, paper, dark, 2.4) : null;
  const inks = [];
  for (const c of [pal.colors[0], pal.colors[1], dark, pageInk]) if (c && contrast(c, paper) >= 1.5 && !inks.some((k) => k.toLowerCase() === c.toLowerCase())) inks.push(c);
  if (!inks.length) inks.push(dark);
  const f = {
    cap: { family: font.body.family, weight: 600, style: 'normal' },
    mono: { family: font.mono.family, weight: 500, style: 'normal' },
    monoB: { family: font.mono.family, weight: 700, style: 'normal' },
    label: { family: font.body.family, weight: 700, style: 'normal' },
    // the denomination: the display face, never lighter than medium — a hairline numeral is lost on a small stamp
    num: { ...font.title, weight: Math.max(parseFloat(font.title.weight) || 400, 500) },
  };
  // ---- reading the copy: the date is the denomination (month and day together, never the day alone)
  const date = eventDate(content);
  let num, year = null;
  if (date) { num = `${two(date.month)}.${two(date.day)}`; year = date.yearKnown ? String(date.year) : null; }
  else {
    // no date in the copy: an edition or a count if it names one, else this year — and say so
    const n = keyNumber(content);
    num = n || String(new Date().getFullYear());
    ctx.note(`stamp: the copy names no date, so the stamp's denomination is ${n ? `the number ${n}` : `the year ${num}`}. Put the date in "meta" (label 일시 / Date) to print it on the stamp and in the postmark.`);
  }
  // the caption on the stamp: the headline, its emphasised word, the eyebrow, then single words of the headline
  const em = ((content.titleRaw.match(/\*+([^*]+?)\*+/) || [])[1] || '').trim();
  const titleWords = content.title.split(/\s+/).filter((w) => [...w].length >= 2 && !/^(the|of|and|for|a|an|to|in|on|at)$/i.test(w)).sort((a, b) => b.length - a.length);
  const capCands = [content.title, em, content.eyebrow, content.brand, ...titleWords].filter(Boolean);
  // the postmark: the place round the upper arc, a short word round the lower, the date in the middle
  const venue = (content.meta.find((r) => /장소|주소|곳|위치|venue|where|place|location|address/i.test(r.label)) || {}).value;
  // a legend round a ring wants few letters: whole words of the place, as many as stay under a dozen
  // syllables (two dozen letters), without anything in brackets
  const shorten = (s) => {
    const w = String(s).replace(/\s*[([（].*$/, '').split(/[\s,·]+/).filter(Boolean), cap = ko ? 11 : 24, out = [];
    for (let k = w.length; k >= 1; k--) if (k === 1 || [...w.slice(0, k).join('')].length <= cap) out.push(w.slice(0, k).join(' '));
    return out;
  };
  // a word for the lower arc when there is no weekday to print there
  const shortWords = [content.eyebrow, em, ...titleWords].filter((w) => w && [...w].length <= (ko ? 7 : 12));
  const pm = { top: venue ? shorten(venue) : content.brand ? shorten(content.brand) : [], bottom: [], lines: [] };
  if (date && date.end) {
    // a run of days: first day and last day in the middle
    pm.bottom = shortWords; pm.lines = [year, num, `–${two(date.end.month)}.${two(date.end.day)}`].filter(Boolean);
  } else if (date) {
    // one day: the weekday as the copy writes it; year / date / time, or day / month in Roman numerals / year
    const wd = date.weekdayStated ?? date.weekday;
    pm.bottom = ko ? [DAY_NAMES.ko[wd]] : [DAY_NAMES.en[wd], DAY_NAMES.enShort[wd]];
    pm.lines = (date.time ? [year, num, date.time] : [String(date.day), ROMAN[date.month - 1], year]).filter(Boolean);
  } else { pm.bottom = shortWords.filter((w) => !w.includes(num)); pm.lines = [num]; }
  if (!venue) ctx.note('stamp: the copy names no place, so the postmark has no legend on its upper arc. Add a "meta" row labelled 장소 / Venue to set it round the ring.');
  const all = [content.title, content.eyebrow, venue, num, year, ...pm.bottom, ...pm.lines, '0123456789.:–IVXPAR AVION항공우편'].join('');
  await Promise.all(Object.values(f).map((face_) => load(face_, all)));

  const root = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  ctx.root.append(root);
  // minS: the smallest lettering allowed, in local units — set by each motif once its scale is known
  const E = { ctx, root, pal, params, f, ko, paper, dark, inks, num, year, capCands, pm, rng, darkPage: ctx.tone === 'dark', minS: 20 };
  if (motif === 'sheet') sheet(E);
  else if (motif === 'airmail') await airmail(E);
  else single(E);
}

// ------------------------------------------------------------------ single: one large stamp
function single(E) {
  const { ctx, root, rng, params } = E, rm = room(ctx);
  const tilt = tiltOf(params, rng, 2, 3.6), order = vignetteOrder(E);
  // The arrangements: a portrait or a landscape stamp; the postmark beside the stamp's upper left
  // corner with its lines running off to the left ("side", for a wide room), or over that corner with
  // the lines running above the stamp ("above", for a tall one). The one that gives the largest stamp
  // in the room is used. Either way the postmark's legends fall on the page or on the stamp's paper
  // border, never on the picture, and the denomination stays clear.
  const plan = (w, h, arr) => {
    const R = Math.min(w, h) * 0.33;
    let p0, dir, len;                                   // the postmark's centre, from the stamp's centre, before the stamp is turned
    if (arr === 'side') { p0 = [-w / 2 - R * 0.4, -h / 2 + R * 0.3]; dir = -1; len = R * 1.2; }
    else { p0 = [-w / 2 + R * 0.4, -h / 2 - R * 0.5]; dir = 1; len = (w / 2 - p0[0]) / Math.cos(PM_DEG * RAD) - R * 1.23; }
    const pc = rot(p0, tilt);
    // the extent of it all: the turned stamp with its shadow, the ring, the ends of the lines
    const pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2 + P * 0.5], [-w / 2, h / 2 + P * 0.5]].map((q) => rot(q, tilt));
    for (const a of [0, 90, 180, 270]) pts.push([pc[0] + Math.cos(a * RAD) * R * 1.03, pc[1] + Math.sin(a * RAD) * R * 1.03]);
    for (const sy of [-1, 1]) { const q = rot([dir * (R * 1.13 + len), sy * R * 0.52], PM_DEG); pts.push([pc[0] + q[0], pc[1] + q[1]]); }
    const ext = extent(pts), s = Math.min(rm.w / (ext.x1 - ext.x0), rm.h / (ext.y1 - ext.y0));
    return { w, h, R, p0, pc, dir, len, ...ext, score: s * Math.sqrt(w * h) * (h > w ? 1.15 : 1) * (arr === 'side' ? 1.05 : 1) };
  };
  const shapes = params.orient === 'landscape' ? [[LONG, SHORT]] : params.orient === 'portrait' ? [[SHORT, LONG]] : [[SHORT, LONG], [LONG, SHORT]];
  const g0 = shapes.flatMap(([w, h]) => ['side', 'above'].map((arr) => plan(w, h, arr))).sort((a, b) => b.score - a.score)[0];
  const bw = g0.x1 - g0.x0, bh = g0.y1 - g0.y0, box = ctx.fit(bw / bh, { fill: 0.92 }), s = box.w / bw;
  E.minS = (1.56 * ctx.unit) / s;                       // nothing under 1.5 unit once scaled
  const G = svg('g', { transform: `translate(${r2(box.x - g0.x0 * s)} ${r2(box.y - g0.y0 * s)}) scale(${r2(s * 1000) / 1000})` });
  root.append(G);
  const T = `rotate(${r2(tilt)}) translate(${-g0.w / 2} ${-g0.h / 2})`, sg = svg('g', { transform: T });
  G.append(sg);
  const d = perfPath(1, 1, g0.w, g0.h);
  paperShape(E, sg, d);
  face(E, sg, 0, 0, g0.w, g0.h, { ...lookOf(E, 0, order), capSide: 'right' });
  strike(E, G, { x: g0.pc[0], y: g0.pc[1], R: g0.R, deg: PM_DEG, dir: g0.dir, len: g0.len,
    zones: zonesOf(E, 0, 0, g0.w, g0.h, 'right'), at: [g0.p0[0] + g0.w / 2, g0.p0[1] + g0.h / 2], rel: PM_DEG - tilt }, d, T);
}

// ------------------------------------------------------------------ sheet: a block of stamps
function sheet(E) {
  const { ctx, root, rng, params } = E, rm = room(ctx);
  const tilt = tiltOf(params, rng, 1.2, 2.4);
  // The block that suits the room: 3 × 2 or 2 × 3 of portrait or landscape stamps, and in a long low
  // (or tall narrow) room a strip. The stamp at the upper right is torn out; the postmark is struck
  // in the gap it left, over the edges of its two neighbours, and its lines run off through the gap.
  // (That corner, because the lines of the postmark climb as they run right: there they leave the
  // block without crossing another stamp.)
  const cells = params.orient === 'landscape' ? [[LONG, SHORT]] : params.orient === 'portrait' ? [[SHORT, LONG]] : [[SHORT, LONG], [LONG, SHORT]];
  const grids = [[3, 2, 1], [2, 3, 1], [4, 1, 0.8], [5, 1, 0.8], [1, 4, 0.8]];
  const plan = (cols, rows, sw, sh, pref) => {
    const bw = cols * sw, bh = rows * sh, vx = (cols - 1) * sw, R = Math.min(sw, sh) * 0.4;
    // the postmark's centre in the block's frame: low in the gap, and to its left when a stamp is joined there
    const pc = [vx + R * (cols > 1 ? 0.66 : 1.05), rows > 1 ? sh - R * 0.53 : sh * 0.5];
    const len = Math.max(R * 0.95, (vx + sw - P * 0.5 - pc[0]) / Math.cos(PM_DEG * RAD) - R * 1.13);
    // the extent of it all: the turned block with its shadow, the ring, the ends of the lines (from the block's centre)
    const pts = [[0, 0], [bw, 0], [bw, bh + P * 0.6], [0, bh + P * 0.6], [pc[0], pc[1] - R * 1.03]];
    for (const sy of [-1, 1]) { const q = rot([R * 1.13 + len, sy * R * 0.52], PM_DEG - tilt); pts.push([pc[0] + q[0], pc[1] + q[1]]); }
    const ext = extent(pts.map(([x, y]) => rot([x - bw / 2, y - bh / 2], tilt)));
    return { cols, rows, sw, sh, bw, bh, R, pc, len, ...ext, score: Math.min(rm.w / (ext.x1 - ext.x0), rm.h / (ext.y1 - ext.y0)) * Math.sqrt(sw * sh) * pref * (sh > sw ? 1.06 : 1) };
  };
  const g0 = cells.flatMap(([sw, sh]) => grids.map(([c, r, pref]) => plan(c, r, sw, sh, pref))).sort((a, b) => b.score - a.score)[0];
  const { cols, rows, sw, sh, bw, bh, R, pc, len } = g0, vi = cols - 1, vj = 0;
  const ew = g0.x1 - g0.x0, eh = g0.y1 - g0.y0, box = ctx.fit(ew / eh, { fill: 0.92 }), s = box.w / ew;
  E.minS = (1.56 * ctx.unit) / s;
  const G = svg('g', { transform: `translate(${r2(box.x - g0.x0 * s)} ${r2(box.y - g0.y0 * s)}) scale(${r2(s * 1000) / 1000}) rotate(${r2(tilt)}) translate(${-bw / 2} ${-bh / 2})` });
  root.append(G);
  const d = perfPath(cols, rows, sw, sh, (i, j) => !(i === vi && j === vj));
  paperShape(E, G, d);
  // each stamp in its own pairing of the inks, the vignettes in a shuffled order
  const order = vignetteOrder(E), zones = [];
  let k = 0;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    if (i === vi && j === vj) continue;
    face(E, G, i * sw, j * sh, sw, sh, { ...lookOf(E, k++, order), capSide: 'right' });
    zones.push(...zonesOf(E, i * sw, j * sh, sw, sh, 'right'));
  }
  // the postmark is drawn in the block's own frame so that it stays on the gap, turned back to its own angle
  strike(E, G, { x: pc[0], y: pc[1], R, deg: PM_DEG - tilt, dir: 1, len, zones }, d, '');
}

// ------------------------------------------------------------------ airmail: the corner of an envelope
async function airmail(E) {
  const { ctx, root, rng, params, ko, f } = E, U = ctx.unit, rm = room(ctx);
  const box = ctx.fit(Math.max(0.8, Math.min(1.45, rm.w / rm.h)), { fill: 0.94 });
  const m = Math.min(box.w, box.h), t = m * 0.05, x0 = box.x, y0 = box.y, x1 = box.x + box.w, y1 = box.y + box.h;
  // the envelope's corner sits on the outer side of the box: drawn for the right, mirrored for the left
  const right = box.cx >= ctx.W * 0.47, MX = (x) => (right ? x : x0 + x1 - x);
  const band = svg('g', right ? {} : { transform: `translate(${r2(x0 + x1)} 0) scale(-1 1)` });
  root.append(band);
  // a band of slanted stripes in the two printing inks along the top and down the outer side (no
  // longer than the top), its two ends cut on the slant; the stripes are lines of constant x + y, so
  // they turn the corner without a seam
  const id = `stp-env-${ctx.seed}-${uid++}`, q = t * 0.6, yb = Math.min(y1, y0 + box.w);
  band.append(svg('defs', {}, [svg('clipPath', { id }, [svg('path', { d: `M${r2(x0 + t)} ${r2(y0)}H${r2(x1)}V${r2(yb - t)}L${r2(x1 - t)} ${r2(yb)}V${r2(y0 + t)}H${r2(x0)}Z` })])]));
  const stripes = svg('g', { 'clip-path': `url(#${id})` }); band.append(stripes);
  const cA = E.inks[0], cB = E.inks[1] || E.dark;
  for (let c = x0 + y0 + t, n = 0; c < x1 + y1; c += q * 2, n++) stripes.append(svg('path', { d: `M${r2(c - y0)} ${r2(y0)}H${r2(c + q - y0)}L${r2(c + q - y1)} ${r2(y1)}H${r2(c - y1)}Z`, fill: n % 2 ? cB : cA }));
  // the stamp in the corner the stripes make
  const gp = t * 0.95, hS = Math.min((box.h - t - gp) * 0.72, ((box.w - t - gp) * 0.56) / (SHORT / LONG)), s = hS / LONG, wS = SHORT * s;
  E.minS = (1.56 * U) / s;
  const tilt = tiltOf(params, rng, 1.2, 2.2);
  const scx = MX(x1 - t - gp - wS / 2 - hS * 0.02), scy = y0 + t + gp + hS / 2 + hS * 0.02;
  const G = svg('g', { transform: `translate(${r2(scx)} ${r2(scy)}) scale(${r2(s * 1000) / 1000})` });
  root.append(G);
  const T = `rotate(${r2(tilt)}) translate(${-SHORT / 2} ${-LONG / 2})`, sg = svg('g', { transform: T });
  G.append(sg);
  const d = perfPath(1, 1, SHORT, LONG);
  paperShape(E, sg, d);
  const capSide = right ? 'right' : 'left';             // the caption keeps to the side away from the postmark
  face(E, sg, 0, 0, SHORT, LONG, { ...lookOf(E, 0, vignetteOrder(E)), capSide });
  // the postmark on the stamp's inner edge, its lines running into the envelope (turned the other way when mirrored)
  const R = SHORT * 0.33, dir = right ? -1 : 1, pmDeg = right ? PM_DEG : -PM_DEG;
  const p0 = [dir * (SHORT / 2 + R * 0.3), -LONG / 2 + R * 0.88], pc = rot(p0, tilt);
  const reach = (wS / 2 + (right ? scx - x0 : x1 - scx)) / s - SHORT / 2 - R * 1.43;      // from the ring to the box's inner edge
  strike(E, G, { x: pc[0], y: pc[1], R, deg: pmDeg, dir, len: Math.max(R * 0.6, Math.min(R * 1.4, reach * 0.9)),
    zones: zonesOf(E, 0, 0, SHORT, LONG, capSide), at: [p0[0] + SHORT / 2, p0[1] + LONG / 2], rel: pmDeg - tilt }, d, T);
  // the airmail label: a plain rectangle sticker in the second ink with a hairline inside its edge,
  // beside the foot of the stamp and under the postmark — one group in the corner of the envelope
  const word = ko ? '항공우편' : 'PAR AVION', lh = Math.max(U * 4.6, m * 0.085), ts = lh * 0.4, trk = ko ? 0.18 : 0.16;
  const lw = adv(word, f.label, ts, trk) + lh * 1.5, deg = (right ? -1 : 1) * rng.range(2.5, 4.5);
  const lab = svg('g', { transform: `translate(${r2(scx + dir * (wS / 2 + lh * 0.7 + lw / 2))} ${r2(scy + hS / 2 - lh * 0.62)}) rotate(${r2(deg)})` });
  root.append(lab);
  const onLab = readableOn(cB, [E.paper, E.dark, E.pal.ink]);
  lab.append(svg('rect', { x: r2(-lw / 2), y: r2(-lh / 2), width: r2(lw), height: r2(lh), fill: cB }));
  lab.append(svg('rect', { x: r2(-lw / 2 + lh * 0.1), y: r2(-lh / 2 + lh * 0.1), width: r2(lw - lh * 0.2), height: r2(lh * 0.8), fill: 'none', stroke: onLab, 'stroke-width': r2(Math.max(1.2, lh * 0.022)) }));
  await inkText(lab, word, { x: -lw / 2 + lh * 0.75, y: -lh * 0.19, w: lw - lh * 1.5, h: lh * 0.38 }, f.label, { fill: onLab, tracking: trk });
}
