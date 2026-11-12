// pattern — flat vector repeat patterns in two to four inks, the kind printed behind the subject of a
// contemporary Korean event poster. The pattern fills the free field of the page (ctx.field()), runs out
// to the page edge (into the bleed) wherever the field reaches it, and stops at one clean straight edge
// towards the copy, where the repeat is aligned so that the edge falls on a whole cell.
// Also used as the ground under 3D cut-outs (ctx.role === 'ground': the palette is already tonal).
// An HTML scene: plain SVG shapes clipped to the field — vector at any size, no filters.
//
// Palette: colors[0] = the figure (checker squares, dots, scales, arches, rules, chips)
//          colors[1] = the field's own ground (the second ink of the checker / stripes, the paper of
//                      the grid, the bed of the terrazzo; dots sit on the page colour instead)
//          colors[2] = third ink (stripes and scales with inks: 3, outlined arches' inner arch, chips, cells)
//          colors[3] = fourth ink (chips, filled grid cells)
// Motifs:  checker · stripes · dots · terrazzo · arches · grid
// Params:  scale (repeat / short side; 0 = motif default) · cover = field | band · tilt (degrees)
//          wave (checker warp / stripe amplitude) · inks = 2 | 3
// Helpers written here (not in html-lib.js): copySides() — which sides of the field face the copy;
//          guardCopy() — adds the copy's measured boxes to ctx.quiet before ctx.field() (some type themes
//          draw rules wider than the measured copy block, e.g. grotesk's eyebrow rule).
import { svg, mix, contrast, standOff } from '/skill/assets/web/html-lib.js';

const r2 = (v) => Math.round(v * 100) / 100;
const SCALE = { checker: 0.075, stripes: 0.06, dots: 0.045, terrazzo: 0.06, arches: 0.09, grid: 0.03 };

/**
 * The sides of field F that face the copy, each with a weight (how much copy lies beyond it):
 * [{ side: 'left'|'right'|'top'|'bottom', w }], heaviest first. Sides that reach the page edge never face it.
 */
export function copySides(F, ctx) {
  const { W, H } = ctx, out = [];
  const beyond = { left: [0, F.y, F.x, F.y + F.h], right: [F.x + F.w, F.y, W, F.y + F.h], top: [F.x, 0, F.x + F.w, F.y], bottom: [F.x, F.y + F.h, F.x + F.w, H] };
  for (const side of ['left', 'right', 'top', 'bottom']) {
    if (F.edges[side]) continue;
    const [a0, b0, a1, b1] = beyond[side];
    let w = 0;
    for (const q of ctx.quiet) {
      const x0 = Math.max(a0, q[0] * W), x1 = Math.min(a1, q[2] * W), y0 = Math.max(b0, q[1] * H), y1 = Math.min(b1, q[3] * H);
      if (x1 > x0 && y1 > y0) w += (x1 - x0) * (y1 - y0);
    }
    out.push({ side, w: w + 1 });
  }
  return out.sort((a, b) => b.w - a.w);
}

/**
 * Add the boxes of the copy as laid out in the page (eyebrow with its rule, headline, information, footer …)
 * to ctx.quiet, so ctx.field() keeps clear of decorations a type theme draws past the measured copy block.
 */
export function guardCopy(ctx) {
  const { W, H } = ctx, extra = [];
  for (const n of document.querySelectorAll('.poster .frame :is(.eyebrow, .title, .subtitle, .meta, .body, .cta, .footer, .brand, .badge, .logo, .logos, .qr)')) {
    const b = n.getBoundingClientRect();
    if (b.width > 0 && b.height > 0) extra.push([b.left / W, b.top / H, b.right / W, b.bottom / H]);
  }
  const bottom = document.querySelector('.poster .frame .bottom.ruled');
  if (bottom) { const b = bottom.getBoundingClientRect(); if (b.height > 0) extra.push([b.left / W, b.top / H, b.right / W, b.bottom / H]); }
  ctx.quiet = [...ctx.quiet, ...extra];
}

export default async function build(ctx) {
  const { W, H, unit: U, palette: pal, params } = ctx;
  const motif = params.motif || ctx.motif || 'checker';
  const rng = ctx.rng;
  const S = Math.min(W, H);
  const ground = ctx.role === 'ground';
  const cols = pal.colors.length ? pal.colors : [pal.ink, mix(pal.bg, pal.ink, 0.12)];
  const C = (i) => cols[i % cols.length];
  const fig = C(0), base = C(1), third = cols[2] || pal.accent, fourth = cols[3] || pal.ink;
  // the figure must show on the field's ground (a palette override can bring them too close)
  const figOn = (bg) => (contrast(fig, bg) >= 1.35 ? fig : standOff(fig, bg, contrast(pal.ink, bg) > contrast(pal.bg, bg) ? pal.ink : pal.bg, 1.35));

  const scale = +params.scale > 0 ? Math.min(0.4, Math.max(0.01, +params.scale)) : SCALE[motif] || 0.07;
  const P = scale * S * (ground ? 1.08 : 1);           // one repeat, px
  const tilt = Number.isFinite(+params.tilt) ? +params.tilt : 0;
  const nInks = +params.inks >= 3 ? 3 : 2;

  // ---- the field, the side(s) facing the copy, and the area the pattern covers
  guardCopy(ctx);
  const F = ctx.field({ gap: U * 3.5 });
  if (F.w < U * 10 || F.h < U * 10) ctx.note('pattern: this layout leaves only a small field for the pattern — left, top or bottom give it more room.');
  const sides = copySides(F, ctx);
  const main = sides[0]?.side || null;               // the edge towards the copy (null: the field has none)
  let R = { x: F.x, y: F.y, w: F.w, h: F.h };
  let inner = new Set(sides.map((s) => s.side));     // straight edges inside the page (no shape may be cut by them: terrazzo)
  if (params.cover === 'band') {
    // only a band along the far edge of the field, away from the copy
    const far = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' }[main] || 'bottom';
    const horiz = far === 'top' || far === 'bottom';
    const depth = Math.max(P * 2, (horiz ? F.h : F.w) * 0.42);
    if (far === 'bottom') R = { x: F.x, y: F.y + F.h - depth, w: F.w, h: depth };
    else if (far === 'top') R = { x: F.x, y: F.y, w: F.w, h: depth };
    else if (far === 'right') R = { x: F.x + F.w - depth, y: F.y, w: depth, h: F.h };
    else R = { x: F.x, y: F.y, w: depth, h: F.h };
    inner = new Set(['left', 'right', 'top', 'bottom'].filter((s) => (s === 'left' ? R.x > 1 : s === 'right' ? R.x + R.w < W - 1 : s === 'top' ? R.y > 1 : R.y + R.h < H - 1)));
    sides.splice(0, sides.length, { side: { left: 'right', right: 'left', top: 'bottom', bottom: 'top' }[far], w: 1 });
  }
  // the repeat's origin: on the edge towards the copy, so that edge falls on a whole cell
  const ox = inner.has('right') && !inner.has('left') ? R.x + R.w : R.x;
  const oy = inner.has('bottom') && !inner.has('top') ? R.y + R.h : R.y;

  const root = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  ctx.root.append(root);
  const defs = svg('defs'); root.append(defs);
  const id = `pt-clip-${Math.floor(rng() * 1e9)}`;
  defs.append(svg('clipPath', { id }, [svg('rect', { x: r2(R.x), y: r2(R.y), width: r2(R.w), height: r2(R.h) })]));
  const clip = svg('g', { 'clip-path': `url(#${id})` }); root.append(clip);

  // turned patterns are drawn over the square that covers the field at any angle
  const cx = R.x + R.w / 2, cy = R.y + R.h / 2;
  let A = R, g = clip, gx = ox, gy = oy;
  if (tilt) {
    const d = Math.hypot(R.w, R.h);
    A = { x: cx - d / 2, y: cy - d / 2, w: d, h: d };
    g = svg('g', { transform: `rotate(${r2(tilt)} ${r2(cx)} ${r2(cy)})` }); clip.append(g);
    gx = cx; gy = cy;
  }
  const fillBase = (colour) => clip.insertBefore(svg('rect', { x: r2(R.x), y: r2(R.y), width: r2(R.w), height: r2(R.h), fill: colour }), clip.firstChild);
  /** cell indices covering the area A for a lattice of step (sx, sy) anchored at (gx, gy) */
  const span = (o, a0, len, step, pad = 1) => [Math.floor((a0 - o) / step) - pad, Math.ceil((a0 + len - o) / step) + pad];

  // the copy direction as a unit vector (for the dot falloff): the sum of the normals of the sides facing it
  const normal = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] };
  let dv = sides.reduce((v, s) => [v[0] + normal[s.side][0] * Math.sqrt(s.w), v[1] + normal[s.side][1] * Math.sqrt(s.w)], [0, 0]);
  if (!sides.length) { const q = ctx.quiet[0] || [0.4, 0.4, 0.6, 0.6]; dv = [((q[0] + q[2]) / 2) * W - cx, ((q[1] + q[3]) / 2) * H - cy]; }
  const dl = Math.hypot(dv[0], dv[1]) || 1; dv = [dv[0] / dl, dv[1] / dl];

  if (motif === 'stripes') {
    // wavy stripes of even width: every boundary is the same wave, shifted by one stripe
    const w = P * 0.5, amp = (Number.isFinite(+params.wave) ? +params.wave : 0.5) * w * 0.9, lam = P * 4.2, ph = rng() * Math.PI * 2;
    const inks = nInks === 3 ? [figOn(base), base, third, base] : [figOn(base), base];
    fillBase(base);
    const [j0, j1] = span(gy, A.y, A.h, w, 2);
    const steps = Math.max(24, Math.ceil(A.w / (lam / 16)));
    const wave = (x, j) => gy + j * w + amp * Math.sin(((x - gx) / lam) * Math.PI * 2 + ph);
    for (let j = j0; j < j1; j++) {
      const colour = inks[((j % inks.length) + inks.length) % inks.length];
      if (colour === base) continue;
      const top = [], bot = [];
      for (let k = 0; k <= steps; k++) { const x = A.x - lam + ((A.w + lam * 2) * k) / steps; top.push([x, wave(x, j)]); bot.push([x, wave(x, j + 1)]); }
      const d = 'M' + top.map((p) => `${r2(p[0])} ${r2(p[1])}`).join('L') + 'L' + bot.reverse().map((p) => `${r2(p[0])} ${r2(p[1])}`).join('L') + 'Z';
      g.append(svg('path', { d, fill: colour }));
    }
  } else if (motif === 'dots') {
    // a staggered dot grid on the page colour; the dots shrink to nothing towards the copy
    const p = P, rMax = p * 0.44, ink2 = nInks === 3 ? standOff(third, pal.bg, pal.ink, 1.4) : null;
    const dot = standOff(fig, pal.bg, pal.ink, 1.5);
    const rowH = p * 0.866;
    const [j0, j1] = span(gy, A.y, A.h, rowH, 2), [i0, i1] = span(gx, A.x, A.w, p, 2);
    // the falloff runs across the area R in the copy direction: t = 0 at the far side, 1 at the copy
    const corners = [[R.x, R.y], [R.x + R.w, R.y], [R.x, R.y + R.h], [R.x + R.w, R.y + R.h]].map((c) => c[0] * dv[0] + c[1] * dv[1]);
    const lo = Math.min(...corners), hi = Math.max(...corners);
    const rot = tilt ? (pt) => { const a = (tilt * Math.PI) / 180, x = pt[0] - cx, y = pt[1] - cy; return [cx + x * Math.cos(a) - y * Math.sin(a), cy + x * Math.sin(a) + y * Math.cos(a)]; } : (pt) => pt;
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
      const x = gx + i * p + (j % 2 ? p / 2 : 0), y = gy + j * rowH;
      const [wx, wy] = rot([x, y]);
      const t = Math.min(1, Math.max(0, ((wx * dv[0] + wy * dv[1]) - lo) / (hi - lo || 1)));
      const f = 1 - t * t * (3 - 2 * t);                 // smoothstep falling off towards the copy
      const r = rMax * (0.06 + 0.94 * f) * (t > 0.96 ? 0 : 1);
      if (r < p * 0.035) continue;
      g.append(svg('circle', { cx: r2(x), cy: r2(y), r: r2(r), fill: ink2 && ((j % 2) + 2) % 2 ? ink2 : dot }));
    }
  } else if (motif === 'terrazzo') {
    // angular chips on a pale bed, scattered evenly (a jittered grid), none cut by an edge inside the page
    fillBase(base);
    const inks = [figOn(base), standOff(third, base, pal.ink, 1.3), standOff(fourth, base, pal.ink, 1.3), mix(figOn(base), base, 0.45)];
    const lay = (step, rMin, rMax, weights) => {
      const [j0, j1] = span(gy, A.y, A.h, step, 1), [i0, i1] = span(gx, A.x, A.w, step, 1);
      const out = [];
      for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
        const x = gx + (i + 0.5 + (rng() - 0.5) * 0.8) * step, y = gy + (j + 0.5 + (rng() - 0.5) * 0.8) * step;
        const rad = rng.range(rMin, rMax), n = rng.int(5, 7), a0 = rng() * Math.PI * 2;
        const pts = Array.from({ length: n }, (_, k) => { const a = a0 + (k / n) * Math.PI * 2 + (rng() - 0.5) * 0.7, rr = rad * rng.range(0.55, 1); return [x + Math.cos(a) * rr * 1.15, y + Math.sin(a) * rr * 0.85]; });
        const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]), m = U * 0.6;
        // keep clear of every straight edge inside the page (tilt 0 only; turned chips are left as they fall)
        if (!tilt && ((inner.has('left') && Math.min(...xs) < R.x + m) || (inner.has('right') && Math.max(...xs) > R.x + R.w - m) || (inner.has('top') && Math.min(...ys) < R.y + m) || (inner.has('bottom') && Math.max(...ys) > R.y + R.h - m))) continue;
        let u = rng() * weights.reduce((s, v) => s + v, 0), k = 0;
        while (u > weights[k]) { u -= weights[k]; k++; }
        out.push(svg('path', { d: 'M' + pts.map((q) => `${r2(q[0])} ${r2(q[1])}`).join('L') + 'Z', fill: inks[k] }));
      }
      return out;
    };
    for (const n of lay(P * 1.25, P * 0.2, P * 0.42, [4, 3, 2, 1])) g.append(n);
    for (const n of lay(P * 0.5, P * 0.05, P * 0.1, [3, 2, 2, 2])) g.append(n);
  } else if (motif === 'arches') {
    // rows of round-topped arches standing on a common line, alternately solid and outlined
    fillBase(base);
    const a = P, gap = a * 0.2, h = a * 1.25, rowH = h + gap;
    const ink = figOn(base), sw = a * 0.085, in2 = standOff(third, base, pal.ink, 1.3);
    const [j0, j1] = span(gy, A.y, A.h, rowH, 1), [i0, i1] = span(gx, A.x, A.w, a + gap, 1);
    const arch = (x, yb, w, hh) => { const rr = w / 2; return `M${r2(x)} ${r2(yb)}L${r2(x)} ${r2(yb - hh + rr)}A${r2(rr)} ${r2(rr)} 0 0 1 ${r2(x + w)} ${r2(yb - hh + rr)}L${r2(x + w)} ${r2(yb)}Z`; };
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
      const x = gx + i * (a + gap) + gap / 2, yb = gy + (j + 1) * rowH - gap / 2;
      if (((i + j) % 2 + 2) % 2 === 0) g.append(svg('path', { d: arch(x, yb, a, h), fill: ink }));
      else {
        g.append(svg('path', { d: arch(x + sw / 2, yb - sw / 2, a - sw, h - sw), fill: 'none', stroke: ink, 'stroke-width': r2(sw) }));
        // with three inks the open arch holds a smaller solid one (a doorway)
        if (nInks === 3) { const k = a * 0.44; g.append(svg('path', { d: arch(x + (a - k) / 2, yb - sw * 2.2, k, k * 1.25), fill: in2 })); }
      }
    }
  } else if (motif === 'grid') {
    // graph paper: fine rules, a heavier rule every fifth line, a few cells filled
    fillBase(base);
    const c = P, [j0, j1] = span(gy, A.y, A.h, c, 1), [i0, i1] = span(gx, A.x, A.w, c, 1);
    const ruleInk = figOn(base), fine = mix(ruleInk, base, 0.55);
    const fills = [standOff(fig, base, pal.ink, 1.4), standOff(third, base, pal.ink, 1.3), standOff(fourth, base, pal.ink, 1.3)];
    const nCells = (i1 - i0) * (j1 - j0), want = Math.max(4, Math.round(nCells * 0.03));
    const taken = new Set();
    for (let n = 0, tries = 0; n < want && tries < want * 20; tries++) {
      const i = rng.int(i0 + 1, i1 - 3), j = rng.int(j0 + 1, j1 - 3), w = rng() < 0.25 ? 2 : 1, hh = rng() < 0.2 ? 2 : 1;
      const x = gx + i * c, y = gy + j * c;
      if (!tilt && (x < R.x || y < R.y || x + w * c > R.x + R.w || y + hh * c > R.y + R.h)) continue;
      let free = true;
      for (let a = -1; a <= w; a++) for (let b = -1; b <= hh; b++) if (taken.has(`${i + a},${j + b}`)) free = false;
      if (!free) continue;
      for (let a = 0; a < w; a++) for (let b = 0; b < hh; b++) taken.add(`${i + a},${j + b}`);
      g.append(svg('rect', { x: r2(x), y: r2(y), width: r2(w * c), height: r2(hh * c), fill: fills[n % fills.length] }));
      n++;
    }
    const thin = Math.max(1, U * 0.07), thick = Math.max(1.5, U * 0.16);
    const x0 = A.x - c, x1 = A.x + A.w + c, y0 = A.y - c, y1 = A.y + A.h + c;
    let dThin = '', dThick = '';
    for (let i = i0; i <= i1; i++) { const x = r2(gx + i * c), s = `M${x} ${r2(y0)}V${r2(y1)}`; if (i % 5 === 0) dThick += s; else dThin += s; }
    for (let j = j0; j <= j1; j++) { const y = r2(gy + j * c), s = `M${r2(x0)} ${y}H${r2(x1)}`; if (j % 5 === 0) dThick += s; else dThin += s; }
    g.append(svg('path', { d: dThin, stroke: fine, 'stroke-width': r2(thin), fill: 'none' }));
    g.append(svg('path', { d: dThick, stroke: ruleInk, 'stroke-width': r2(thick), fill: 'none' }));
  } else {
    // checker; wave > 0 bends the board into a gentle wave (both directions, long wavelength)
    fillBase(base);
    const c = P, ink = figOn(base), wv = Math.max(0, Math.min(1.5, +params.wave || 0));
    const amp = wv * c * 0.42, lam = c * 7, ph = rng() * Math.PI * 2;
    const warp = wv ? ([x, y]) => [x + amp * Math.sin(((y - gy) / lam) * Math.PI * 2 + ph), y + amp * Math.sin(((x - gx) / lam) * Math.PI * 2 + ph * 1.7)] : (p) => p;
    const [j0, j1] = span(gy, A.y, A.h, c, wv ? 2 : 1), [i0, i1] = span(gx, A.x, A.w, c, wv ? 2 : 1);
    const seg = wv ? 8 : 1;
    let d = '';
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
      if (((i + j) % 2 + 2) % 2) continue;
      const x = gx + i * c, y = gy + j * c, pts = [];
      for (let k = 0; k < seg; k++) pts.push([x + (c * k) / seg, y]);
      for (let k = 0; k < seg; k++) pts.push([x + c, y + (c * k) / seg]);
      for (let k = 0; k < seg; k++) pts.push([x + c - (c * k) / seg, y + c]);
      for (let k = 0; k < seg; k++) pts.push([x, y + c - (c * k) / seg]);
      d += 'M' + pts.map(warp).map((p) => `${r2(p[0])} ${r2(p[1])}`).join('L') + 'Z';
    }
    g.append(svg('path', { d, fill: ink }));
  }
}
