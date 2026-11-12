// Contour — a topographic line drawing. A height field is built on a CPU grid, smoothed like a
// cartographer's generalisation (cubic B-spline) and drawn as isolines of one even pen width: every
// fifth line is an index line, one or two elevation bands carry a flat tint, and the sheet gets the
// small furniture of a survey map — spot heights, a summit triangle, index figures set into the
// lines, registration crosses. Lettering is a tiny stroke font drawn here (no font files).
//
// What it depicts is the `motif`:
//   mountain  a massif of ridges and spurs with its summit at the focus
//   coast     a nautical chart: islands with buff land, tinted shallows, depth curves and soundings
//   peak      an abstract "data landscape": one smooth peak, a cross-hair and the path of an ascent
//
// The ground flattens towards the copy (a plain, or open sea), so the lines thin out there by
// themselves instead of being faded.
//
// Palette: bg = paper · colors[0] = contour ink · colors[1] = lower tint band (valley / shallows)
//          colors[2] = upper tint band (summit zone / land) · ink = spot heights, crosses · accent = summit mark, path
import { makeNoise, backgroundQuad, floatTexture, canvasTexture, quietUniforms, GLSL_BICUBIC, GLSL_QUIET, GLSL_DITHER } from '/skill/assets/web/scene-lib.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---- stroke digits (unit box 0.6 × 1, y down) — technical lettering, drawn with round pens
const ell = (cx, cy, rx, ry, n = 14) => Array.from({ length: n + 1 }, (_, i) => [cx + rx * Math.sin((i / n) * 2 * Math.PI), cy - ry * Math.cos((i / n) * 2 * Math.PI)]);
const SIX = [[0.5, 0.05], [0.36, 0], [0.2, 0.08], [0.08, 0.3], [0.05, 0.62], [0.09, 0.84], [0.19, 0.97], [0.31, 1], [0.44, 0.95], [0.54, 0.8], [0.55, 0.62], [0.47, 0.47], [0.33, 0.41], [0.19, 0.45], [0.07, 0.6]];
const GLYPH = {
  0: [ell(0.3, 0.5, 0.25, 0.5)],
  1: [[[0.12, 0.2], [0.36, 0], [0.36, 1]]],
  2: [[[0.05, 0.22], [0.13, 0.07], [0.28, 0], [0.43, 0.04], [0.53, 0.16], [0.53, 0.32], [0.42, 0.5], [0.05, 1], [0.57, 1]]],
  3: [[[0.06, 0.1], [0.2, 0], [0.38, 0], [0.52, 0.1], [0.54, 0.26], [0.46, 0.4], [0.3, 0.46], [0.47, 0.53], [0.56, 0.68], [0.54, 0.86], [0.42, 0.98], [0.24, 1], [0.05, 0.88]]],
  4: [[[0.44, 1], [0.44, 0], [0.03, 0.7], [0.6, 0.7]]],
  5: [[[0.52, 0], [0.13, 0], [0.08, 0.44], [0.24, 0.37], [0.4, 0.39], [0.53, 0.52], [0.56, 0.7], [0.5, 0.88], [0.36, 1], [0.2, 1], [0.05, 0.88]]],
  6: [SIX],
  7: [[[0.04, 0], [0.57, 0], [0.24, 1]]],
  8: [ell(0.3, 0.24, 0.21, 0.24, 12), ell(0.3, 0.74, 0.25, 0.26, 12)],
  9: [SIX.map(([x, y]) => [0.6 - x, 1 - y])],
  '.': [[[0.28, 0.96], [0.32, 0.96]]],
  '-': [[[0.1, 0.56], [0.5, 0.56]]],
};
const textWidth = (s, h) => s.length * 0.86 * h - 0.26 * h;
/** Draw `s` centred on (cx, cy), cap height h px, rotated by `ang`. */
function drawText(g, s, cx, cy, h, ang = 0, weight = 0.13) {
  g.save(); g.translate(cx, cy); g.rotate(ang); g.lineWidth = Math.max(0.9, h * weight); g.lineCap = g.lineJoin = 'round';
  let x = -textWidth(s, h) / 2;
  for (const ch of s) {
    for (const path of GLYPH[ch] ?? []) { g.beginPath(); path.forEach(([px, py], i) => (i ? g.lineTo(x + px * h, (py - 0.5) * h) : g.moveTo(x + px * h, (py - 0.5) * h))); g.stroke(); }
    x += 0.86 * h;
  }
  g.restore();
}

export default function build(ctx) {
  const { THREE, scene, palette, params, aspect, seed, rng, width: W, height: H, unit } = ctx;
  const sx = Math.max(aspect, 1), sy = Math.max(1 / aspect, 1), short = Math.min(W, H);        // frame fraction → short-side units
  const motif = ['mountain', 'coast', 'peak'].includes(params.motif) ? params.motif : 'mountain';
  const P = { lines: clamp(params.lines ?? 1, 0.5, 2), weight: clamp(params.weight ?? 1, 0.5, 2.5), tint: clamp(params.tint ?? 1, 0, 1.6), labels: params.labels !== false && params.labels !== 0, scale: clamp(params.scale ?? 1, 0.6, 1.6) };
  const noise = makeNoise(seed * 13 + 5);
  const C = (h) => new THREE.Color(h), bg = C(palette.bg), dark = bg.getHSL({}).l < 0.4;
  const cols = palette.colors?.length ? palette.colors : [palette.ink];

  // ---- where the copy sits: signed distance (short-side units) to the nearest rectangle that carries type
  const quiet = (ctx.quiet || []).map(([x0, y0, x1, y1]) => ({ x0, y0, x1, y1, strip: x0 <= 0.02 && x1 >= 0.98 }));
  const qDist = (x, y) => {
    let d = 9;
    for (const r of quiet) {
      const ex = (Math.abs(x - (r.x0 + r.x1) / 2) - (r.x1 - r.x0) / 2) * sx, ey = (Math.abs(y - (r.y0 + r.y1) / 2) - (r.y1 - r.y0) / 2) * sy;
      d = Math.min(d, (Math.hypot(Math.max(ex, 0), Math.max(ey, 0)) + Math.min(Math.max(ex, ey), 0)) * (r.strip ? 2.2 : 1));   // footer / header strips need less room
    }
    return d;
  };

  // ---- the height field
  const fx = ctx.focus.x * sx, fy = ctx.focus.y * sy, A = clamp(ctx.artSize ?? 0.7, 0.35, 1.05);
  const [ax0, ay0, ax1, ay1] = ctx.artRect || [0, 0, 1, 1];
  const aw = (ax1 - ax0) * sx, ah = (ay1 - ay0) * sy, room = Math.min(aw, ah), band = clamp(0.3 * room, 0.1, 0.17);        // how far from the copy the ground starts to rise
  const gs = 300, gw = Math.round(gs * sx) + 1, gh = Math.round(gs * sy) + 1, n = gw * gh;
  const h = new Float32Array(n), calmF = new Float32Array(n);                 // level field, and how far from the copy (0 on it … 1 in open country)
  const ridged = (x, y, z, oct) => { let a = 0.5, s = 0, w = 1, nrm = 0; for (let i = 0; i < oct; i++) { let v = 1 - Math.abs(noise.noise3(x, y, z)); v *= v; s += a * v * w; nrm += a; w = clamp(v * 1.5, 0, 1); x = x * 2.03 + 3.1; y = y * 2.03 - 1.7; a *= 0.5; } return s / nrm; };
  // the landform lies along the longer side of the space it has
  const long = clamp(Math.max(aw, ah) / Math.max(1e-3, Math.min(aw, ah)), 1, 1.7), axis = (ah > aw * 1.12 ? Math.PI / 2 : 0) + rng.range(-1, 1) * (long > 1.12 ? 0.3 : 0.75), ca = Math.cos(axis), sa = Math.sin(axis);
  const R = (motif === 'coast' ? 0.42 : motif === 'peak' ? 0.33 : 0.37) * A * P.scale, EL = (long > 1.12 ? 1 : 0.86) * (0.55 + 0.45 * long);                // radius across, and stretch along the axis
  // secondary features, placed where there is room (never under the copy)
  const spots = [];
  for (let i = 0, tries = 0; i < (motif === 'coast' ? 6 : 4) && tries < 400; tries++) {
    const x = rng.range(-0.05, 1.05), y = rng.range(-0.05, 1.05), ux = x * sx, uy = y * sy, df = Math.hypot(ux - fx, uy - fy);
    if (qDist(x, y) < 0.12 || df < R * 1.5 || x < ax0 - 0.08 || x > ax1 + 0.08 || y < ay0 - 0.1 || y > ay1 + 0.1 || spots.some((s) => Math.hypot(s.x - ux, s.y - uy) < 0.3)) continue;
    spots.push({ x: ux, y: uy, r: rng.range(0.07, 0.15) * (0.6 + 0.6 * A), a: rng.range(0.25, 0.6), rot: rng.range(0, Math.PI), e: rng.range(1.1, 1.9) }); i++;
  }
  const z0 = rng.range(0, 50);
  let hmax = -9, hmin = 9;
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const px = x / (gw - 1), py = y / (gh - 1), ux = px * sx, uy = py * sy, i = y * gw + x;
      const wob = noise.fbm(ux * 1.6 + 3, uy * 1.6, z0 + 0.3, 3) + 0.8 * noise.noise3(ux * 0.9 + 17, uy * 0.9, z0 + 3.9);
      const calm = sstep(0.01, 0.01 + band, qDist(px, py) + 0.45 * band * wob);                 // 0 on the copy … 1 in open country
      const wx = ux - fx + 0.16 * R * 2 * noise.fbm(ux * 1.2 + 7, uy * 1.2, z0 + 1.1, 2), wy = uy - fy + 0.16 * R * 2 * noise.fbm(ux * 1.2, uy * 1.2 + 13, z0 + 5.7, 2);
      const a = wx * ca + wy * sa, b = -wx * sa + wy * ca;
      let v;
      if (motif === 'mountain') {
        // a cone bent into ridges and spurs: the distance to the summit is shortened along ridge lines and stretched in the gullies
        const d = Math.hypot(a / (1.2 * EL), b / 0.92) / R, rg = ridged(ux * 2.5 / P.scale + 11, uy * 2.5 / P.scale, z0, 4), sp = noise.fbm(ux * 3.4 + 1, uy * 3.4, z0 + 7.7, 3);
        let dd = d * (1.5 - 0.95 * rg) * (1 + 0.5 * noise.noise3(ux * 1.3 + 40, uy * 1.3, z0 + 12.5)) + 0.16 * sp; dd = Math.sqrt(dd * dd + 0.003);
        const m = Math.max(0, (Math.exp(-1.3 * Math.pow(dd, 1.12)) - 0.1) / 0.9);         // the massif stands on a plain: it has a foot
        let foot = 0; for (const s of spots) { const dx = ux - s.x, dy = uy - s.y; foot += s.a * 0.22 * Math.max(0, Math.exp(-(dx * dx + dy * dy) / (s.r * s.r * 2.2) * (1.4 - 0.8 * rg)) - 0.12); }
        v = m * (0.9 + 0.1 * noise.fbm(ux * 5.2, uy * 5.2, z0 + 2.2, 3)) + foot * (1 - m) + 0.012 * (0.5 + noise.fbm(ux * 1.1 + 5, uy * 1.1 + 9, z0 + 9.1, 3));
        v *= calm;
      } else if (motif === 'coast') {
        const d = Math.hypot(a / (1.2 * EL), b / 0.8) / R, isl = Math.exp(-d * d * 1.5);
        const rough = noise.fbm(ux * 2.1 + 21, uy * 2.1, z0 + 3.3, 5), fine = noise.fbm(ux * 6.5, uy * 6.5 + 4, z0 + 6.1, 3);
        let land = 1.25 * isl;
        for (const s of spots) { const cr = Math.cos(s.rot), sr = Math.sin(s.rot), dx = ux - s.x, dy = uy - s.y, u1 = (dx * cr + dy * sr) / s.e, v1 = -dx * sr + dy * cr; land += (0.5 + s.a) * Math.exp(-(u1 * u1 + v1 * v1) / (s.r * s.r * 0.9)); }
        const off = Math.hypot(Math.max(ax0 - px, 0, px - ax1) * sx, Math.max(ay0 - py, 0, py - ay1) * sy);       // the land keeps to the side of the sheet that is free
        v = land * (0.75 + 0.9 * rough) + 0.42 * rough + 0.15 * fine - 0.4 - 1.6 * off;
        v = v > 0 ? v * (0.55 + 0.6 * ridged(ux * 2.4 + 2, uy * 2.4, z0 + 8, 3)) : v;       // land climbs in ridges, the sea bed stays smooth
        v = lerp(-0.62 + 0.05 * wob, v, calm);                                           // open, deep water under the copy
      } else {
        const d = Math.hypot(a / (1.15 * EL), b / 0.86) / R, d2 = Math.hypot((a - 1.05 * R) / 0.9, (b + 0.5 * R) / 0.6) / R, d3 = Math.hypot((a + 1.1 * R) / 0.7, (b - 0.75 * R) / 0.75) / R;
        v = Math.exp(-d * d * 1.9) + 0.34 * Math.exp(-d2 * d2 * 3.2) + 0.22 * Math.exp(-d3 * d3 * 3.6) + 0.12 * (0.5 + noise.fbm(ux * 0.8 + 2, uy * 0.8, z0 + 4.4, 2)) * Math.exp(-d * d * 0.35);
        v *= calm;
      }
      h[i] = v; calmF[i] = calm; if (v > hmax) hmax = v; if (v < hmin) hmin = v;
    }
  }
  // level units: the field is scaled so that contour lines sit at whole numbers
  const N = Math.round((motif === 'mountain' ? 32 : motif === 'coast' ? 15 : 22) * P.lines), IDX = motif === 'peak' ? 4 : 5;
  const top = N - 0.35;                                                                // the summit stops just short of a line: a small closed top contour, not a dot
  const ground = motif === 'coast' ? 0 : 0.5;                                          // flat ground lies between two levels, so no line can sit on it
  for (let i = 0; i < n; i++) h[i] = ground + (h[i] / hmax) * (top - ground);
  const packed = new Float32Array(n * 2); for (let i = 0; i < n; i++) { packed[i * 2] = h[i]; packed[i * 2 + 1] = calmF[i]; }
  const bil = (px, py) => {                                                            // bilinear sample at frame fractions
    const x = clamp(px * (gw - 1), 0, gw - 1.001), y = clamp(py * (gh - 1), 0, gh - 1.001), x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0, i = y0 * gw + x0;
    return lerp(lerp(h[i], h[i + 1], tx), lerp(h[i + gw], h[i + gw + 1], tx), ty);
  };
  const grad = (px, py) => { const e = 1.5 / gs; return [(bil(px + e / sx, py) - bil(px - e / sx, py)) / (2 * e), (bil(px, py + e / sy) - bil(px, py - e / sy)) / (2 * e)]; };   // levels per short-side unit

  // ---- map furniture, drawn on a canvas: R = contour-ink figures, G = gaps cut into the lines, B = accent marks; ink marks go to R and B together
  const metres = motif === 'mountain' ? 50 : motif === 'coast' ? 20 : 100 / N, base = motif === 'mountain' ? 50 * rng.int(4, 12) : 0;
  const figure = (v) => String(Math.round(base + v * metres));
  const u = unit, capH = 1.02 * u, marks = [];                                           // marks: [x, y, radius] in px, to keep things apart
  const free = (x, y, r) => qDist(x / W, y / H) > 0.045 + r / short && x > 2.5 * u && y > 2.5 * u && x < W - 2.5 * u && y < H - 2.5 * u && marks.every((m) => Math.hypot(m[0] - x, m[1] - y) > m[2] + r);
  // summits: local maxima of the grid
  const peaks = [];
  for (let y = 7; y < gh - 7; y += 1) for (let x = 7; x < gw - 7; x += 1) {
    const v = h[y * gw + x]; if (v < (motif === 'coast' ? 1.2 : N * 0.16)) continue;
    let isMax = true;
    for (let dy = -7; dy <= 7 && isMax; dy++) for (let dx = -7; dx <= 7; dx++) if ((dx || dy) && h[(y + dy) * gw + x + dx] > v) { isMax = false; break; }
    if (isMax) peaks.push({ x: (x / (gw - 1)) * W, y: (y / (gh - 1)) * H, v });
  }
  peaks.sort((p, q) => q.v - p.v);
  const summit = peaks[0] ?? { x: ctx.focus.x * W, y: ctx.focus.y * H, v: top };

  const overlay = canvasTexture(W, H, (g) => {
    g.clearRect(0, 0, W, H); g.globalCompositeOperation = 'lighter';
    const LINE = '#ff0000', GAP = '#00ff00', ACC = '#0000ff', INK = '#ff00ff';
    if (!P.labels) return;
    // registration crosses on a regular grid
    g.strokeStyle = INK; g.lineWidth = Math.max(0.8, 0.07 * u); g.lineCap = 'butt';
    const pitch = 0.2 * short, cx0 = ((ctx.focus.x * W) % pitch) - pitch, cy0 = ((ctx.focus.y * H) % pitch) - pitch, arm = 0.55 * u;
    g.globalAlpha = 0.55;
    for (let y = cy0; y < H + pitch; y += pitch) for (let x = cx0; x < W + pitch; x += pitch) {
      if (qDist(x / W, y / H) < 0.05 || x < u || y < u || x > W - u || y > H - u) continue;
      const xr = Math.round(x) + 0.5, yr = Math.round(y) + 0.5;
      g.beginPath(); g.moveTo(xr - arm, yr); g.lineTo(xr + arm, yr); g.moveTo(xr, yr - arm); g.lineTo(xr, yr + arm); g.stroke();
    }
    g.globalAlpha = 1;

    if (motif === 'peak') {
      // cross-hair through the maximum, with ticks; it stops short of the copy
      g.strokeStyle = INK; g.lineWidth = Math.max(0.8, 0.07 * u);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const step = 0.25 * u; let len = 0;
        while (len < 0.62 * A * short * 1.15) { const x = summit.x + dx * (len + step), y = summit.y + dy * (len + step); if (qDist(x / W, y / H) < 0.06 || x < 2 * u || y < 2 * u || x > W - 2 * u || y > H - 2 * u) break; len += step; }
        g.globalAlpha = 0.5; g.setLineDash([0.5 * u, 0.5 * u]); g.beginPath(); g.moveTo(summit.x + dx * 1.6 * u, summit.y + dy * 1.6 * u); g.lineTo(summit.x + dx * len, summit.y + dy * len); g.stroke(); g.setLineDash([]);
        g.globalAlpha = 0.8;
        for (let t = 8 * u; t < len; t += 8 * u) { const x = summit.x + dx * t, y = summit.y + dy * t, k = 0.42 * u; g.beginPath(); g.moveTo(x - dy * k, y - dx * k); g.lineTo(x + dy * k, y + dx * k); g.stroke(); }
      }
      g.globalAlpha = 1;
      // the path of an ascent: from the foot of the hill up the gradient, as a dotted trail with stations
      let best = null;
      for (let k = 0; k < 80; k++) {
        const ang = rng.range(0, Math.PI * 2), rr = rng.range(0.6, 1.4) * R, x = (fx + Math.cos(ang) * rr) / sx, y = (fy + Math.sin(ang) * rr) / sy;
        if (x < 0.04 || y < 0.06 || x > 0.96 || y > 0.94 || qDist(x, y) < 0.1) continue;
        const lv = bil(x, y); if (lv < N * 0.07 || lv > N * 0.3) continue;
        const sc = Math.abs(Math.sin(ang * 2)) + rng() * 0.4 - Math.abs(lv - N * 0.12) * 0.1; if (!best || sc > best.sc) best = { x, y, sc };
      }
      if (best) {
        const path = [[best.x, best.y]]; let { x, y } = best, mx = 0, my = 0;
        for (let s = 0; s < 900; s++) {
          const [gx, gy] = grad(x, y), gl = Math.hypot(gx, gy); if (gl < 1e-4) break;
          mx = 0.9 * mx + (gx / gl) * 0.1 + 0.035 * Math.sin(s * 0.11 + seed); my = 0.9 * my + (gy / gl) * 0.1 + 0.035 * Math.cos(s * 0.13 + seed);   // momentum: the trail swings past the fall line
          const ml = Math.hypot(mx, my) || 1; x += (mx / ml) * 0.0022 / sx; y += (my / ml) * 0.0022 / sy; path.push([x, y]);
          if (Math.hypot(x * W - summit.x, y * H - summit.y) < 0.9 * u) break;
        }
        g.strokeStyle = ACC; g.fillStyle = ACC; g.lineWidth = Math.max(1.2, 0.17 * u); g.lineCap = 'round'; g.lineJoin = 'round';
        g.setLineDash([0.01, 0.62 * u]); g.beginPath(); path.forEach(([px, py], i) => (i ? g.lineTo(px * W, py * H) : g.moveTo(px * W, py * H))); g.stroke(); g.setLineDash([]);
        const every = Math.max(20, Math.floor(path.length / 5));
        for (let i = 0; i < path.length - every / 2; i += every) {
          const [px, py] = path[i]; g.fillStyle = GAP; g.beginPath(); g.arc(px * W, py * H, 0.75 * u, 0, 7); g.fill();
          g.strokeStyle = ACC; g.lineWidth = Math.max(1.1, 0.14 * u); g.beginPath(); g.arc(px * W, py * H, 0.48 * u, 0, 7); g.stroke(); marks.push([px * W, py * H, 1.6 * u]);
        }
      }
    }

    // the summit: a triangle (mountain, coast) or a ringed point (peak) in the accent colour, with its figure
    const sv = figure(summit.v), tw = textWidth(sv, capH * 1.12);
    g.fillStyle = GAP; g.beginPath(); g.arc(summit.x, summit.y, 1.25 * u, 0, 7); g.fill();
    g.fillStyle = ACC; g.strokeStyle = ACC;
    if (motif === 'peak') { g.beginPath(); g.arc(summit.x, summit.y, 0.42 * u, 0, 7); g.fill(); g.lineWidth = Math.max(1.1, 0.13 * u); g.beginPath(); g.arc(summit.x, summit.y, 1.0 * u, 0, 7); g.stroke(); }
    else { const t = 0.8 * u; g.beginPath(); g.moveTo(summit.x, summit.y - t * 1.05); g.lineTo(summit.x + t, summit.y + t * 0.68); g.lineTo(summit.x - t, summit.y + t * 0.68); g.closePath(); g.fill(); }
    marks.push([summit.x, summit.y, 2.2 * u]);
    const side = summit.x + 2.0 * u + tw < W - 3 * u && qDist((summit.x + 2 * u + tw) / W, summit.y / H) > 0.05 ? 1 : -1, lx = summit.x + side * (1.9 * u + tw / 2), ly = summit.y - (motif === 'peak' ? 1.5 : 0.15) * u;
    g.fillStyle = GAP; g.fillRect(lx - tw / 2 - 0.4 * u, ly - capH * 0.95, tw + 0.8 * u, capH * 1.9);
    g.strokeStyle = INK; drawText(g, sv, lx, ly, capH * 1.12, 0, 0.15); marks.push([lx, ly, tw / 2 + u]);

    // other spot heights: a dot and a small figure
    let placed = 0;
    for (const p of peaks.slice(1)) {
      if (placed >= (motif === 'peak' ? 1 : 5)) break;
      const s = figure(p.v), w = textWidth(s, capH * 0.92);
      if (!free(p.x, p.y, 7 * u) || !free(p.x + 1.2 * u + w / 2, p.y, w / 2 + u)) continue;
      g.fillStyle = GAP; g.beginPath(); g.arc(p.x, p.y, 0.6 * u, 0, 7); g.fill(); g.fillRect(p.x + 0.8 * u, p.y - capH * 0.8, w + 0.9 * u, capH * 1.6);
      g.fillStyle = INK; g.beginPath(); g.arc(p.x, p.y, 0.24 * u, 0, 7); g.fill();
      g.strokeStyle = INK; drawText(g, s, p.x + 1.25 * u + w / 2, p.y, capH * 0.92, 0, 0.14);
      marks.push([p.x, p.y, 1.5 * u], [p.x + 1.25 * u + w / 2, p.y, w / 2 + 1.5 * u]); placed++;
    }

    // figures set into the index lines, climbing one flank like the rungs of a ladder
    const ladder = rng.range(0, Math.PI * 2), want = [];
    for (let L = IDX; L < top - 1; L += IDX) want.push(L);
    for (const L of want) {
      let best = null;
      for (let y = 3; y < gh - 3; y += 2) for (let x = 3; x < gw - 3; x += 2) {
        const v = h[y * gw + x]; if ((v - L) * (h[y * gw + x + 2] - L) > 0 && (v - L) * (h[(y + 2) * gw + x] - L) > 0) continue;
        const px = (x + 1) / (gw - 1), py = (y + 1) / (gh - 1), X = px * W, Y = py * H;
        if (Math.abs(bil(px, py) - L) > 0.2) continue;
        const [gx, gy] = grad(px, py), gl = Math.hypot(gx, gy), gap = 1 / Math.max(gl, 1e-3);          // spacing of neighbouring lines, short-side units
        if (gap * short < capH * 1.5 || !free(X, Y, 3.2 * u)) continue;
        const ang = Math.atan2(Y - summit.y, X - summit.x); let da = Math.abs(ang - ladder) % (2 * Math.PI); if (da > Math.PI) da = 2 * Math.PI - da;
        const sc = -da * 1.0 + Math.min(gap * short / capH, 6) * 0.12 - Math.hypot(X - summit.x, Y - summit.y) / short * 0.6;
        if (!best || sc > best.sc) best = { X, Y, sc, t: Math.atan2(gx, -gy) };
      }
      if (!best) continue;
      let t = best.t; if (t > Math.PI / 2) t -= Math.PI; if (t < -Math.PI / 2) t += Math.PI;
      const s = figure(L), w = textWidth(s, capH * 0.9);
      g.save(); g.translate(best.X, best.Y); g.rotate(t); g.fillStyle = GAP; g.fillRect(-w / 2 - 0.45 * u, -capH * 0.85, w + 0.9 * u, capH * 1.7); g.restore();
      g.strokeStyle = LINE; drawText(g, s, best.X, best.Y, capH * 0.9, t, 0.14); marks.push([best.X, best.Y, w / 2 + 2.5 * u]);
    }

    // soundings: small depth figures scattered over the water of a chart
    if (motif === 'coast') {
      g.strokeStyle = LINE; g.globalAlpha = 0.62;
      for (let k = 0, placedS = 0; k < 500 && placedS < 46; k++) {
        const x = rng.range(0.03, 0.97), y = rng.range(0.04, 0.96), v = bil(x, y);
        if (v > -0.7 || qDist(x, y) < 0.07 || !free(x * W, y * H, 3.4 * u)) continue;
        drawText(g, String(Math.max(2, Math.round(-v * 9 + rng.range(-2, 2)))), x * W, y * H, capH * 0.74, -0.14, 0.13); marks.push([x * W, y * H, 4.6 * u]); placedS++;
      }
      g.globalAlpha = 1;
    }
  }, { srgb: false });

  // ---- tint bands, in level units: [lo, hi, colour index, strength]
  const bands = motif === 'mountain' ? [[N * 0.26, N * 0.46, 1, 0.5], [N * 0.72, 99, 2, 0.62], [9, 9, 1, 0]]
    : motif === 'coast' ? [[-1.5, 0, 1, 0.34], [-0.75, 0, 1, 0.36], [0, 99, 2, 0.55]]
      : [[N * 0.42, N * 0.7, 1, 0.42], [N * 0.7, 99, 2, 0.6], [9, 9, 1, 0]];
  const colAt = (i) => C(cols[Math.min(i, cols.length - 1)]);

  scene.add(backgroundQuad(/* glsl */`
    varying vec2 vUv;
    uniform sampler2D uH, uOver; uniform vec2 uGrid, uRes; uniform float uUnit, uLw, uIdx, uSea, uDark, uTint, uTop;
    uniform vec3 cBg, cLine, cInk, cAcc, cBand[3]; uniform vec4 uBand[3];
    ${GLSL_BICUBIC}
    ${GLSL_QUIET}
    ${GLSL_DITHER}
    float hashP(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
    vec2 field(vec2 p){ return textureBicubic(uH, (p * (uGrid - 1.0) + 0.5) / uGrid, uGrid).rg; }
    // box-filtered coverage of a line of width w px whose centre is d px away
    float lineCov(float d, float w){ return clamp(min(d + 0.5 * w, 0.5) - max(d - 0.5 * w, -0.5), 0.0, 1.0); }
    void main(){
      vec2 p = vec2(vUv.x, 1.0 - vUv.y);
      vec2 hv = field(p); float v = hv.x, open = smoothstep(0.12, 0.8, hv.y);      // lines and tints let go as the ground runs out towards the copy
      vec2 g = vec2(dFdx(v), dFdy(v)); float gl = max(length(g), 1e-7);            // levels per pixel
      vec4 ov = texture2D(uOver, vUv);
      float inkM = min(ov.r, ov.b), lineM = ov.r - inkM, accM = ov.b - inkM, gapM = ov.g;

      // flat tints of the elevation bands
      vec3 col = cBg;
      for (int i = 0; i < 3; i++) {
        float m = clamp((v - uBand[i].x) / gl + 0.5, 0.0, 1.0) * clamp((uBand[i].y - v) / gl + 0.5, 0.0, 1.0);
        col = mix(col, cBand[i], m * uBand[i].w * uTint * open);
      }

      // isolines of one pen width; on slopes too steep to hold them the intermediate lines drop out and the index lines remain
      float sea = step(v, -0.001) * uSea;
      float d1 = abs(fract(v + 0.5) - 0.5) / gl, d5 = abs(fract(v / uIdx + 0.5) - 0.5) * uIdx / gl;
      float room1 = 1.0 / (gl * uUnit), room5 = uIdx * room1;                         // spacing of neighbouring lines, in units
      float a1 = lineCov(d1, uLw) * smoothstep(0.17, 0.3, room1);
      float a5 = lineCov(d5, uLw * 2.1) * smoothstep(0.2, 0.38, room5);
      a1 *= mix(1.0, 0.5 * step(0.5, fract(v * 0.5 + 0.25)) , sea);                  // depth curves: every second one, lighter
      a5 *= mix(1.0, 0.0, sea);
      float coast = uSea * lineCov(abs(v) / gl, uLw * 2.4);
      float a = max(max(a1 * 0.8, a5), coast);
      a *= 1.0 - 0.999 * smoothstep(uTop - 0.02, uTop + 0.02, v);
      a *= (1.0 - gapM) * open * (1.0 - 0.75 * quietMask(p, 0.05));
      col = mix(col, cLine, a);

      col = mix(col, cLine, lineM);
      col = mix(col, cInk, inkM * 0.92);
      col = mix(col, cAcc, accM);

      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
      float grain = (hashP(gl_FragCoord.xy) - 0.5) * 0.014;
      gl_FragColor.rgb += grain * mix(1.0, 0.5, uDark) + ditherNoise(gl_FragCoord.xy);
    }`, {
    uH: { value: floatTexture(packed, gw, gh, { channels: 2 }) }, uOver: { value: overlay }, uGrid: { value: new THREE.Vector2(gw, gh) }, uRes: { value: new THREE.Vector2(W, H) },
    uUnit: { value: unit }, uLw: { value: 0.085 * unit * P.weight }, uIdx: { value: IDX }, uSea: { value: motif === 'coast' ? 1 : 0 }, uDark: { value: dark ? 1 : 0 }, uTint: { value: P.tint }, uTop: { value: 1e6 },
    cBg: { value: bg }, cLine: { value: C(cols[0]) }, cInk: { value: C(palette.ink) }, cAcc: { value: C(palette.accentOriginal ?? palette.accent) },
    cBand: { value: bands.map((b) => colAt(b[2])) }, uBand: { value: bands.map((b) => new THREE.Vector4(b[0], b[1], 0, b[3])) }, ...quietUniforms(ctx),
  }));

  ctx.frame({ radius: 1, fov: 30, dir: [0, 0, 1] });
}
