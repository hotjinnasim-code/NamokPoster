// swiss — one abstract geometric figure built by a single rule, in the manner of the Swiss concert and
// exhibition posters of the 1950s and 60s: black and one signal colour on a plain sheet, and a few tiny
// captions (the date, the time, the weekday, the year — read from the copy) hung on the construction.
// An HTML scene: plain SVG paths, circles and text. No filters, no clips, no gradients — it stays vector.
//
// Palette: colors[0] = the figure's ink · colors[1] = the one accent · ink = captions and hairlines
// Motifs:  arcs     concentric bands; thickness grows by `ratio`, every cut is a multiple of 22.5°
//          bars     a row of bars on one baseline; widths grow by `ratio`, heights step by a rule
//          dots     a square grid of discs whose diameters shrink along one diagonal
//          diagonal 45° bands whose widths double, cut to a rectangle
// Params:  ratio (growth per step; 0 = the motif's own) · rule = auto | wave | ramp (bars: how the heights step)
//          captions = true | false · crop = true | false (may the figure run off a page edge the copy leaves free?)
// The figure is made for the copy: its light, fine end is on the side of the copy and its heavy end on
// the far side; where the layout leaves a page edge free the heavy end runs off the sheet there.
// Helpers written here: sector() / sectorPoints() (an arc band and its extent), readCaptions(),
//          measureCaptions(), setCaption() (label() by its top corner), roomOf() (the free room and
//          which of its sides look out on a free page edge), clearTo().
import { svg, contrast, label, measureInk, eventDate, keyNumber, DAY_NAMES, isKorean } from '/skill/assets/web/html-lib.js';

const r2 = (v) => Math.round(v * 100) / 100;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const STEP = Math.PI / 8;                      // 22.5° — the angular unit of the arcs
const MOTIFS = ['arcs', 'bars', 'dots', 'diagonal'];
const off = (v) => v === false || v === 'false' || v === 0 || v === '0';

// ------------------------------------------------------------------ captions, read from the copy
/** The small labels: date (month and day together), time, weekday, year — or one key number when the copy has no date. */
function readCaptions(ctx) {
  const c = ctx.content, ko = ctx.lang === 'ko' || isKorean(c.title);
  const date = eventDate(c), two = (n) => String(n).padStart(2, '0'), md = (d) => `${two(d.month)}.${two(d.day)}`;
  const out = [];
  if (date) {
    out.push(date.end ? `${md(date)}–${md(date.end)}` : md(date));
    if (date.time) out.push(date.time);
    if (!date.end) { const wd = date.weekdayStated ?? date.weekday; out.push(ko ? DAY_NAMES.ko[wd] : DAY_NAMES.enShort[wd]); }
    if (date.yearKnown) out.push(String(date.year));
  } else {
    const n = keyNumber(c);
    if (n) out.push(n);
    ctx.note('swiss: the copy names no date, so the figure ' + (n ? `is captioned with the number ${n} only` : 'carries no captions') + '. Put the date in "meta" (label 일시 / Date) to have it set on the figure.');
  }
  return out;
}

/** Measure the captions in the faces they will be set in: digits and Latin in the mono face, Hangul in the text face. */
async function measureCaptions(ctx, texts, size) {
  const out = [];
  for (const text of texts) {
    const hangul = isKorean(text);
    const font = hangul ? { family: ctx.font.body.family, weight: 600 } : { family: ctx.font.mono.family, weight: 500 };
    const tracking = hangul ? 0.02 : 0.06;
    const m = await measureInk(text.toUpperCase(), font, tracking, size);
    out.push({ text, font, tracking, size, w: (m.advance - tracking) * size, h: m.ascent * size });
  }
  return out;
}

/** Set a caption with its top-left (or top-right, anchor 'end') corner at (x, y). */
function setCaption(root, cap, x, y, fill, anchor = 'start') {
  return label(root, cap.text, x, y + cap.h, cap.font, cap.size, { anchor, tracking: cap.tracking, fill });
}

// ------------------------------------------------------------------ geometry
/** Path of an arc band: radii ri < ro around (cx, cy), from angle a to b (radians, clockwise on screen), straight radial ends. */
function sector(cx, cy, ri, ro, a, b) {
  const p = (r, t) => `${r2(cx + r * Math.cos(t))} ${r2(cy + r * Math.sin(t))}`, big = b - a > Math.PI ? 1 : 0;
  return `M${p(ro, a)}A${r2(ro)} ${r2(ro)} 0 ${big} 1 ${p(ro, b)}L${p(ri, b)}A${r2(ri)} ${r2(ri)} 0 ${big} 0 ${p(ri, a)}Z`;
}
/** The points that bound an arc band: its four corners and where its outer edge crosses the axes. */
function sectorPoints(ri, ro, a, b) {
  const pts = [[ri, a], [ro, a], [ri, b], [ro, b]];
  for (let k = Math.ceil(a / (Math.PI / 2)); k * (Math.PI / 2) <= b; k++) pts.push([ro, k * (Math.PI / 2)]);
  return pts.map(([r, t]) => [r * Math.cos(t), r * Math.sin(t)]);
}

/** True when nothing that carries type lies between the side of `box` and the page edge beyond it. */
function clearTo(ctx, box, side) {
  const { W, H, unit: U } = ctx, g = U * 2, i = U;      // g: clearance along the way out; i: the strip is a little narrower than the box
  const strip = side === 'left' ? [0, box.y + i, box.x, box.y + box.h - i] : side === 'right' ? [box.x + box.w, box.y + i, W, box.y + box.h - i] : side === 'top' ? [box.x + i, 0, box.x + box.w - i, box.y] : [box.x + i, box.y + box.h, box.x + box.w - i, H];
  const across = side === 'left' || side === 'right';
  return !ctx.quiet.some((q) => q[2] * W + (across ? g : 0) > strip[0] && q[0] * W - (across ? g : 0) < strip[2] && q[3] * H + (across ? 0 : g) > strip[1] && q[1] * H - (across ? 0 : g) < strip[3]);
}

/**
 * The room the copy left, inside the page margins, and which of its sides look out on a page edge with
 * no copy in between (`free`). The room is first drawn back from anything that carries type and reaches
 * into it (a type theme may draw a rule wider than the copy block); then, on the sides that face copy, it
 * is drawn in by `air`, so the figure keeps more distance from the type than the layout's own gutter.
 */
function roomOf(ctx, air, crop = true) {
  const { W, H, unit: U } = ctx, a = ctx.px(ctx.artRect), s = ctx.safe, g = U * 2;
  let rm = { x: Math.max(a.x, s.x), y: Math.max(a.y, s.y) };
  rm.w = Math.min(a.x + a.w, s.x + s.w) - rm.x; rm.h = Math.min(a.y + a.h, s.y + s.h) - rm.y;
  for (const q of ctx.quiet) {
    const x0 = q[0] * W - g, y0 = q[1] * H - g, x1 = q[2] * W + g, y1 = q[3] * H + g;
    if (x1 <= rm.x || x0 >= rm.x + rm.w || y1 <= rm.y || y0 >= rm.y + rm.h) continue;
    // give way on the side that costs least
    const left = [{ ...rm, w: x0 - rm.x }, { ...rm, x: x1, w: rm.x + rm.w - x1 }, { ...rm, h: y0 - rm.y }, { ...rm, y: y1, h: rm.y + rm.h - y1 }].filter((r) => r.w > 0 && r.h > 0).sort((p, r) => r.w * r.h - p.w * p.h);
    if (left.length) rm = left[0];
  }
  const free = {};
  for (const side of ['left', 'right', 'top', 'bottom']) free[side] = crop && clearTo(ctx, rm, side);
  if (!free.left) { rm.x += air; rm.w -= air; } if (!free.right) rm.w -= air;
  if (!free.top) { rm.y += air; rm.h -= air; } if (!free.bottom) rm.h -= air;
  rm.w = Math.max(rm.w, U * 8); rm.h = Math.max(rm.h, U * 8);
  return { rm, free, safe: s };
}

export default async function build(ctx) {
  const { W, H, unit: U, palette: pal, params } = ctx;
  const motif = MOTIFS.includes(params.motif) ? params.motif : MOTIFS.includes(ctx.motif) ? ctx.motif : 'arcs';
  // two inks: the figure's own, and the one accent. A palette override may bring colours too close to the page.
  const inks = pal.colors || [];
  const main = inks[0] && contrast(inks[0], pal.bg) >= 2.5 ? inks[0] : pal.ink;
  let accent = inks[1] || pal.accent;
  if (contrast(accent, pal.bg) < 1.6 || contrast(accent, main) < 1.2) accent = pal.accent;
  const root = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  ctx.root.append(root);
  const capSize = U * 1.62;
  const caps = off(params.captions) ? [] : await measureCaptions(ctx, readCaptions(ctx), capSize);
  const env = { ctx, root, W, H, U, pal, params, rng: ctx.rng, main, accent, caps, capSize, hair: Math.max(1, U * 0.12), crop: !off(params.crop) };
  if (motif === 'bars') bars(env);
  else if (motif === 'dots') dots(env);
  else if (motif === 'diagonal') diagonal(env);
  else arcs(env);
}

// ------------------------------------------------------------------ arcs
// Rule: n bands around one centre. Band i is q times as thick as band i − 1; the gap between bands is
// constant. Band i starts `turn` steps of 22.5° after band i − 1 and sweeps `sweep0 + grow · i` steps.
// The heavy outer bands turn away from the copy; where a page edge is free they run off it.
function arcs({ ctx, root, W, H, U, pal, params, rng, main, accent, caps, capSize, hair, crop }) {
  const n = 7, q = clamp(+params.ratio || 1.5, 1.3, 1.8);
  // the turning rules that were looked at and kept: [turn, first sweep, growth of the sweep], in steps of 22.5°
  const [turn, sweep0, grow] = rng.pick([[2, 8, 0], [2, 12, -1], [2, 10, -1], [3, 9, -1], [1, 5, 1]]);
  const dir = rng.sign(), iAcc = rng.int(2, n - 2);          // clockwise or not; the accent is never the outermost band
  const pickIdx = rng.int(0, 15);

  const { rm, free, safe: s } = roomOf(ctx, U * 3.5, crop);
  // two opposite edges free: the figure leaves by one of them (on a centred axis it stays in the middle, whole)
  const centred = /^(axis|center)/.test(String(ctx.layout?.layout || ''));
  const q0 = ctx.quiet[0] || [0, 0, 1, 1], copyX = (q0[0] + q0[2]) / 2, copyY = (q0[1] + q0[3]) / 2;
  // … the one farther from the main block of copy (either, when the copy sits in the middle)
  const byLeft = Math.abs(copyX - 0.5) > 0.06 ? copyX > 0.5 : rng() < 0.5, byTop = Math.abs(copyY - 0.5) > 0.06 ? copyY > 0.5 : rng() < 0.5;
  if (free.left && free.right) { if (centred) free.left = free.right = false; else if (byLeft) free.right = false; else free.left = false; }
  if (free.top && free.bottom) { if (byTop) free.bottom = false; else free.top = false; }
  const vx = (free.right ? 1 : 0) - (free.left ? 1 : 0), vy = (free.bottom ? 1 : 0) - (free.top ? 1 : 0);   // the way out, towards the free edges

  // the figure in its own units: the innermost band is 1 thick. Built for a given start angle, with its
  // extent around the centre (the centre itself always inside) and the scale the room gives it: as large
  // as the room allows, counting on the free sides the page edge plus an overshoot of OV × radius.
  const GAP = 0.9, R0 = 6.5, OV = 0.2;
  const scale = (lo, len, page, fLo, fHi, size, over) => (!fLo && !fHi ? len / size : fLo && fHi ? page / (size - 2 * over) : (fHi ? page - lo : lo + len) / (size - over));
  const figure = (a0) => {
    const bands = [];
    let r = R0;
    for (let i = 0; i < n; i++) {
      const t = q ** i, m = clamp(sweep0 + grow * i, 2, 15), st = a0 + dir * turn * i, lo = dir > 0 ? st : st - m;
      bands.push({ i, r1: r, r2: r + t, a: lo * STEP, b: (lo + m) * STEP });
      r += t + GAP;
    }
    const R = r - GAP, e = { x0: -R0 * 0.5, y0: -R0 * 0.5, x1: R0 * 0.5, y1: R0 * 0.5 };
    for (const b of bands) for (const [x, y] of sectorPoints(b.r1, b.r2, b.a, b.b)) { e.x0 = Math.min(e.x0, x); e.y0 = Math.min(e.y0, y); e.x1 = Math.max(e.x1, x); e.y1 = Math.max(e.y1, y); }
    const k = Math.min(scale(rm.x, rm.w, W, free.left, free.right, e.x1 - e.x0, OV * R), scale(rm.y, rm.h, H, free.top, free.bottom, e.y1 - e.y0, OV * R));
    return { bands, R, e, k };
  };
  // the start angle: the outermost band is centred on the direction of the free edges, give or take two
  // steps (any direction when no edge is free); of those, one of the turns that set the figure largest
  const mLast = clamp(sweep0 + grow * (n - 1), 2, 15), base = Math.round(Math.atan2(vy, vx) / STEP - dir * (turn * (n - 1) + mLast / 2));
  let tries = (vx || vy ? [-2, -1, 0, 1, 2].map((j) => base + j) : Array.from({ length: 16 }, (_, j) => j)).map(figure);
  const best = Math.max(...tries.map((f) => f.k));
  tries = tries.filter((f) => f.k >= best * 0.93);
  const { bands, R, e, k } = tries[pickIdx % tries.length];
  const over = OV * R;
  // place: on each axis the figure may sit anywhere between flush against the copy side and fully run off
  // the free edge; it leans towards the free edge (strongly sideways, a little up or down). An edge of the
  // figure that would stop in the page margin (a near miss) is moved: over the page edge when it can, else
  // back inside the margin.
  const place = (lo, len, page, fLo, fHi, e0, e1, focus, sLo, sHi, lean) => {
    const size = (e1 - e0) * k, most = over * k, least = 0.06 * R * k;
    if (!fLo && !fHi) return clamp(focus, lo + size / 2, lo + len - size / 2) - size / 2 - e0 * k;
    const min = fLo ? -most : lo, max = fHi ? page + most - size : lo + len - size;
    let p = min + (Math.max(max, min) - min) * (fLo && fHi ? 0.5 : fHi ? lean : 1 - lean);
    if (fHi && p + size > sHi && p + size < page + least) p = page + least - size <= max ? page + least - size : Math.max(min, sHi - size);
    if (fLo && p < sLo && p > -least) p = -least >= min ? -least : Math.min(max, sLo);
    return p - e0 * k;
  };
  const cx = place(rm.x, rm.w, W, free.left, free.right, e.x0, e.x1, ctx.focus.x * W, s.x, s.x + s.w, 0.85);
  const cy = place(rm.y, rm.h, H, free.top, free.bottom, e.y0, e.y1, ctx.focus.y * H, s.y, s.y + s.h, 0.6);

  for (const b of bands) root.append(svg('path', { d: sector(cx, cy, b.r1 * k, b.r2 * k, b.a, b.b), fill: b.i === iAcc ? accent : main }));
  // the centre: a hairline cross
  const arm = Math.min(R0 * k * 0.5, U * 1.5);
  root.append(svg('path', { d: `M${r2(cx - arm)} ${r2(cy)}H${r2(cx + arm)}M${r2(cx)} ${r2(cy - arm)}V${r2(cy + arm)}`, stroke: pal.ink, 'stroke-width': r2(hair), fill: 'none' }));

  // captions at the ends of arcs: each sits just beyond a cut, in the ring its band has left empty,
  // with one corner on the inner corner of the cut
  const inBand = (x, y, pad) => {
    const dx = x - cx, dy = y - cy, rho = Math.hypot(dx, dy), phi = Math.atan2(dy, dx);
    return bands.some((b) => {
      if (rho < b.r1 * k - pad || rho > b.r2 * k + pad) return false;
      const ap = pad / Math.max(rho, 1);
      let t = phi; while (t < b.a - ap) t += Math.PI * 2; while (t > b.a - ap + Math.PI * 2) t -= Math.PI * 2;
      return t <= b.b + ap;
    });
  };
  // … inside the room; on a side where the figure runs off the sheet a caption may stand in the page margin, 3 units clear of the edge
  const m = U * 3, lim = { x0: free.left ? m : rm.x, y0: free.top ? m : rm.y, x1: free.right ? W - m : rm.x + rm.w, y1: free.bottom ? H - m : rm.y + rm.h };
  const onPage = (x, y) => x > m && x < W - m && y > m && y < H - m;
  const cands = [];
  for (const b of bands) for (const end of ['a', 'b']) {
    const th = b[end], sg = end === 'b' ? 1 : -1, steps = Math.round(th / STEP), mod = (d) => ((steps % d) + d) % d;
    if ((b.r2 - b.r1) * k < capSize * 1.3) continue;                 // only bands thick enough to carry a caption
    if (!onPage(cx + Math.cos(th) * b.r1 * k, cy + Math.sin(th) * b.r1 * k) || !onPage(cx + Math.cos(th) * b.r2 * k, cy + Math.sin(th) * b.r2 * k)) continue;   // the cut itself must show
    cands.push({ b, th, sg, grid: mod(4) === 0 ? 2 : mod(2) === 0 ? 1 : 0, t: (b.r2 - b.r1) * k });
  }
  cands.sort((x, y) => (y.grid - x.grid) || (y.t - x.t));           // cuts on the page's own axes first, then the 45° ones, then the rest; heavier bands first
  const placed = [], used = new Set(), pad = capSize * 0.4;
  const clear = (x0, y0, x1, y1) => {
    for (let ix = 0; ix <= 6; ix++) for (let iy = 0; iy <= 2; iy++) if (inBand(x0 + ((x1 - x0) * ix) / 6, y0 + ((y1 - y0) * iy) / 2, pad)) return false;
    return !placed.some((o) => x0 < o.x1 + pad * 2 && x1 > o.x0 - pad * 2 && y0 < o.y1 + pad * 2 && y1 > o.y0 - pad * 2);
  };
  caps.forEach((cap, j) => {
    for (const c of [...cands.filter((c) => ![...used].some((o) => o.b === c.b)), ...cands]) {      // a band that carries no caption yet, before the other end of one that does
      if (used.has(c)) continue;
      const u = [Math.cos(c.th), Math.sin(c.th)], tau = [-c.sg * Math.sin(c.th), c.sg * Math.cos(c.th)];
      const sx = Math.abs(tau[0]) > 0.01 ? Math.sign(tau[0]) : Math.sign(u[0]), sy = Math.abs(tau[1]) > 0.01 ? Math.sign(tau[1]) : Math.sign(u[1]);
      const d = capSize * 0.55;
      const qx = cx + u[0] * c.b.r1 * k + tau[0] * d, qy = cy + u[1] * c.b.r1 * k + tau[1] * d;
      const x0 = Math.min(qx, qx + sx * cap.w), x1 = Math.max(qx, qx + sx * cap.w), y0 = Math.min(qy, qy + sy * cap.h), y1 = Math.max(qy, qy + sy * cap.h);
      if (x0 < lim.x0 || x1 > lim.x1 || y0 < lim.y0 || y1 > lim.y1 || !clear(x0, y0, x1, y1)) continue;
      setCaption(root, cap, sx > 0 ? x0 : x1, y0, pal.ink, sx > 0 ? 'start' : 'end');
      placed.push({ x0, x1, y0, y1 }); used.add(c);
      return;
    }
    // the date finds no free end: it goes under the centre cross, inside the innermost ring
    if (j === 0) {
      const x0 = cx - cap.w / 2, y0 = cy + arm + capSize * 0.5, x1 = x0 + cap.w, y1 = y0 + cap.h;
      if (x0 >= lim.x0 && x1 <= lim.x1 && y1 <= lim.y1 && clear(x0, y0, x1, y1)) { setCaption(root, cap, x0, y0, pal.ink); placed.push({ x0, x1, y0, y1 }); }
    }
  });
}

// ------------------------------------------------------------------ bars
// Rule: N bars on one baseline. Bar i is q times as wide as bar i − 1, from a hairline to a slab; the gap
// between bars is constant. Heights step by a rule: a slow wave (one period over eight bars) or a ramp
// (each bar one step shorter or taller than the last). The hairlines stand on the side of the copy; where
// the far page edge is free the widest bar runs off it, and where the top edge is free the tallest do.
function bars({ ctx, root, W, U, pal, params, rng, main, accent, caps, capSize, hair, crop }) {
  const { rm, free, safe: s } = roomOf(ctx, U * 4, crop);
  const q = clamp(+params.ratio || 1.5, 1.3, 1.8);
  const rule = ['ramp', 'wave'].includes(params.rule) ? params.rule : rng.pick(['wave', 'wave', 'ramp']);
  const phase = rng.int(0, 7), rising = rng() < 0.5, side = rng() < 0.5, accPick = rng();
  const right = free.right !== free.left ? free.right : side;          // the heavy end: towards the free edge
  const runs = right ? free.right : free.left;                        // … and off it
  const capRow = caps.length ? capSize * 2.9 : 0, baseY = rm.y + rm.h - capRow;
  const thin = right ? rm.x : rm.x + rm.w, far = runs ? (right ? W : 0) : right ? rm.x + rm.w : rm.x, span = Math.abs(far - thin);
  // how many bars, the constant gap, and the first width: the row fills the span exactly
  let N = clamp(Math.round(span / (U * 5)), 9, 14), w0, gap;
  const CUT = runs ? 0.42 : 0;                                        // the share of the widest bar beyond the page edge
  for (;; N--) { gap = clamp((span / N) * 0.3, U * 1.0, U * 2.4); w0 = (span - (N - 1) * gap) / ((q ** N - 1) / (q - 1) - CUT * q ** (N - 1)); if (w0 >= U * 0.13 || N <= 9) break; }
  // heights: level 1 reaches the top of the room. With a free top edge that is the margin line, and the
  // bars the rule sets higher run off the sheet.
  const level = (i) => (rule === 'wave' ? 0.62 + 0.38 * Math.cos((i + phase) * (Math.PI / 4)) : rising ? 0.3 + 0.7 * (i / (N - 1)) : 1 - 0.7 * (i / (N - 1)));
  const levels = Array.from({ length: N }, (_, i) => level(i)), sorted = [...new Set(levels.map((v) => Math.round(v * 1000) / 1000))].sort((a, b) => b - a);
  const ref = free.top && sorted.length > 1 ? sorted[1] : sorted[0], topY = free.top ? s.y : rm.y;
  const iAcc = clamp(N - 4 - Math.floor(accPick * 4), 2, N - 4);          // the accent: a bar of middling width, never the slabs
  const sgn = right ? 1 : -1, bar = [];
  let x = thin;
  for (let i = 0; i < N; i++) {
    const w = w0 * q ** i, h = levels[i] > ref + 1e-6 ? baseY + U * 4 : ((baseY - topY) * levels[i]) / ref;
    bar.push({ i, x0: right ? x : x - w, w, edge: x });
    root.append(svg('rect', { x: r2(right ? x : x - w), y: r2(baseY - h), width: r2(w), height: r2(h), fill: i === iAcc ? accent : main }));
    x += sgn * (w + gap);
  }
  // the baseline, and tick captions under it: each hangs from the near edge of a bar
  root.append(svg('line', { x1: r2(thin), x2: r2(far), y1: r2(baseY), y2: r2(baseY), stroke: pal.ink, 'stroke-width': r2(hair) }));
  const order = [bar[iAcc], bar[N - 1], bar[0], ...[...bar].reverse()], taken = [];
  for (const cap of caps) {
    for (const b of order) {
      const x0 = right ? b.edge : b.edge - cap.w, x1 = x0 + cap.w;
      if (x0 < s.x || x1 > s.x + s.w || taken.some((o) => x0 < o[1] + capSize * 2 && x1 > o[0] - capSize * 2)) continue;
      taken.push([x0, x1]);
      root.append(svg('line', { x1: r2(b.edge), x2: r2(b.edge), y1: r2(baseY), y2: r2(baseY + capSize * 0.9), stroke: pal.ink, 'stroke-width': r2(hair) }));
      setCaption(root, cap, right ? x0 : x1, baseY + capSize * 1.5, pal.ink, right ? 'start' : 'end');
      break;
    }
  }
}

// ------------------------------------------------------------------ dots
// Rule: an n × n grid of discs (n = 7, 8 or 9). The diameter falls by one equal step per diagonal, from the full pitch
// (discs touching) in one corner to a pin-point in the opposite one. The pin-points are on the side of the copy.
function dots({ ctx, root, U, pal, rng, main, accent, caps, capSize, hair }) {
  const { rm, free } = roomOf(ctx, U * 2.5, true);
  const n = rng.pick([7, 8, 8, 9]), rowH = capSize * 2.5, rows = caps.length > 2 ? 2 : caps.length ? 1 : 0;
  const side = Math.min(rm.w, rm.h - rows * rowH), P = side / n;
  const fx = ctx.focus.x * ctx.W, fy = ctx.focus.y * ctx.H, hgt = side + rows * rowH;
  const gx = clamp(fx - side / 2, rm.x, rm.x + rm.w - side), top = clamp(fy - hgt / 2, rm.y, rm.y + rm.h - hgt), gy = top + (rows === 2 ? rowH : 0);
  // the corner of the largest disc: away from the copy
  const sx = rng() < 0.5, sy = rng() < 0.5;
  const bigRight = free.right !== free.left ? free.right : sx, bigTop = free.top !== free.bottom ? free.top : sy;
  const accAt = rng.pick([[2, 3], [3, 2], [1, 4], [4, 1], [2, 4], [4, 2], [3, 3]]);      // the accent: a disc of middling size, off the long diagonal or on it
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const d = P * (1 - (i + j) / (2 * n - 1));
    const ix = bigRight ? n - 1 - i : i, iy = bigTop ? j : n - 1 - j;
    root.append(svg('circle', { cx: r2(gx + (ix + 0.5) * P), cy: r2(gy + (iy + 0.5) * P), r: r2(d / 2), fill: i === accAt[0] && j === accAt[1] ? accent : main }));
  }
  // captions at the corners of the grid: a row below (and one above when there are more than two), a hairline between each pair
  if (!rows) return;
  const x0 = gx, x1 = gx + side;
  const pairs = rows === 2 ? [[caps[0], caps[1]], [caps[2], caps[3]]] : [[caps[0], caps[1]]];
  const ys = rows === 2 ? [gy - rowH, gy + side + rowH - capSize] : [gy + side + rowH - capSize];
  pairs.forEach(([a, b], j) => {
    const y = ys[j];
    if (a) setCaption(root, a, x0, y, pal.ink, 'start');
    if (b) setCaption(root, b, x1, y, pal.ink, 'end');
    const h = (a || b).h, lx0 = a ? x0 + a.w + capSize * 0.9 : x0, lx1 = b ? x1 - b.w - capSize * 0.9 : x1;
    if (lx1 - lx0 > capSize * 2) root.append(svg('line', { x1: r2(lx0), x2: r2(lx1), y1: r2(y + h / 2), y2: r2(y + h / 2), stroke: pal.ink, 'stroke-width': r2(hair) }));
  });
}

// ------------------------------------------------------------------ diagonal
// Rule: bands at 45° across a rectangle. Band i is q times (twice) as wide as band i − 1, and so is the
// space that follows it. The rectangle is the room the copy left, run out to the page edge wherever that
// edge is free; the hairline bands start in the corner nearest the copy.
function diagonal({ ctx, root, W, H, U, pal, params, rng, main, accent, caps, capSize, hair, crop }) {
  const { rm, free, safe: s } = roomOf(ctx, U * 3, crop);
  const capRow = caps.length ? capSize * 2.9 : 0;
  // the plate; captions hang under its lower edge, so that edge stays on the page
  const x0 = free.left ? 0 : rm.x, x1 = free.right ? W : rm.x + rm.w, y0 = free.top ? 0 : rm.y, y1 = caps.length ? (free.bottom ? s.y + s.h : rm.y + rm.h) - capRow : free.bottom ? H : rm.y + rm.h;
  const w = x1 - x0, h = y1 - y0, D = w + h;            // D: the way across the bands, corner to corner, measured along x + y
  const sx = rng() < 0.5, sy = rng() < 0.5;
  const heavyRight = free.right !== free.left ? free.right : sx, heavyTop = free.top !== free.bottom ? free.top : sy;
  const q = clamp(+params.ratio || 2, 1.5, 2.2), n = rng.pick([6, 7, 7]), iAcc = rng.int(2, n - 3);
  // band widths along x + y: the first corner stays empty for LEAD × D, the last band is cut by the far corner
  const LEAD = rng.pick([0.05, 0.07, 0.1]), CUT = 0.3;
  let sum = 0; for (let i = 0; i < n; i++) sum += q ** i * (i < n - 1 ? 2 : 1 - CUT);
  const w0 = (D * (1 - LEAD)) / sum;
  const edges = [];                                     // where each band meets the lower edge of the plate
  let c = D * LEAD;
  for (let i = 0; i < n; i++) {
    const c1 = c, c2 = Math.min(D, c + w0 * q ** i);
    c += 2 * w0 * q ** i;
    // the strip c1 ≤ u + v ≤ c2 inside the rectangle (u, v measured from the hairline corner): up to six corners
    const A = (cc) => (cc <= w ? [cc, 0] : [w, cc - w]), B = (cc) => (cc <= h ? [0, cc] : [cc - h, h]);
    const pts = [A(c1)]; if (c1 < w && c2 > w) pts.push([w, 0]); pts.push(A(c2), B(c2)); if (c1 < h && c2 > h) pts.push([0, h]); pts.push(B(c1));
    const X = (u) => (heavyRight ? x0 + u : x1 - u), Y = (v) => (heavyTop ? y1 - v : y0 + v);
    root.append(svg('path', { d: 'M' + pts.map(([u, v]) => `${r2(X(u))} ${r2(Y(v))}`).join('L') + 'Z', fill: i === iAcc ? accent : main }));
    // on the lower edge of the plate (v = 0 when the heavy corner is at the top, v = h otherwise)
    const at = heavyTop ? c1 : c1 - h;
    if (at >= 0 && at <= w) edges.push({ i, x: X(at) });
  }
  // tick captions under the lower edge, each at the point where a band begins
  const order = [edges.find((e) => e.i === iAcc), ...[...edges].reverse()].filter(Boolean), taken = [];
  for (const cap of caps) {
    for (const e of order) {
      const ex0 = heavyRight ? e.x : e.x - cap.w, ex1 = ex0 + cap.w;
      if (ex0 < Math.max(s.x, x0) || ex1 > Math.min(s.x + s.w, x1) || taken.some((o) => ex0 < o[1] + capSize * 2 && ex1 > o[0] - capSize * 2)) continue;
      taken.push([ex0, ex1]);
      root.append(svg('line', { x1: r2(e.x), x2: r2(e.x), y1: r2(y1), y2: r2(y1 + capSize * 0.9), stroke: pal.ink, 'stroke-width': r2(hair) }));
      setCaption(root, cap, heavyRight ? ex0 : ex1, y1 + capSize * 1.5, pal.ink, heavyRight ? 'start' : 'end');
      break;
    }
  }
}
