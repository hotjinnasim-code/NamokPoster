// Cyanotype — a sun print. Watercolour paper is brushed with iron salts, things are laid on it (pressed
// ferns and leaves, a bottle, a key, lace, cut paper) and it is left in the sun; washed in water, the
// exposed coating turns Prussian blue and whatever lay on the sheet stays white. Flat specimens print
// with crisp edges, anything that lifted off the paper with a soft penumbra; thin leaves, petals and
// glass let some light through and print pale blue with their veins and rims drawn in. The coating
// ends in ragged brush strokes, the blue is never quite even, and the paper's tooth shows through.
//
// How it is made: the objects are drawn on a 2D canvas as a mask of how much light they hold back
// (translucent layers multiply), two blurred copies give the penumbra; the shader develops the print —
// uneven coating, brush-stroked edge, water marks, paper grain — at full output resolution.
//
// Palette: bg = the developed ground (the copy sits on it) · colors[0] = the paper, colors[1] = the
//          deepest tone, colors[2] = a paler wash tone · ink / accent = type. Toned prints (Van Dyke
//          brown, tea-toned, green, violet) are just other palettes.
// Motifs:  botanical (a fern frond, leaves, a lace-flower umbel, grasses) · objects (a bottle, scissors,
//          a key, a feather and a lace doily) · shapes (cut and tracing-paper shapes and string) ·
//          algae (branching seaweed specimens after Anna Atkins)
import { makeNoise, backgroundQuad, srgbVec, GLSL_NOISE_KIT, GLSL_DITHER } from '/skill/assets/web/scene-lib.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

export default function build(ctx) {
  const { THREE, scene, palette, params, aspect, seed, rng, width: W, height: H } = ctx;
  const sx = Math.max(aspect, 1), sy = Math.max(1 / aspect, 1);
  const noise = makeNoise(seed * 11 + 3);
  const P = {
    motif: String(params.motif ?? 'botanical'), lift: clamp(params.lift ?? 1, 0, 2), wash: clamp(params.wash ?? 1, 0, 2),
    border: clamp(params.border ?? 1, 0, 2), grain: clamp(params.grain ?? 1, 0, 2), density: clamp(params.density ?? 1, 0.5, 1.6),
  };

  // ---- where the specimens may lie: the art rectangle, kept clear of the copy
  const quiet = (ctx.quiet || []).map(([x0, y0, x1, y1]) => ({ x0: x0 * sx, y0: y0 * sy, x1: x1 * sx, y1: y1 * sy }));
  const ar = ctx.artRect || [0, 0, 1, 1];
  const A = { x0: ar[0] * sx, y0: ar[1] * sy, x1: ar[2] * sx, y1: ar[3] * sy };
  const gapQ = 0.035, area = (b) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
  for (const q of quiet) {
    if (q.x1 < A.x0 || q.x0 > A.x1 || q.y1 < A.y0 || q.y0 > A.y1) continue;
    const opts = [{ ...A, x0: Math.max(A.x0, q.x1 + gapQ) }, { ...A, x1: Math.min(A.x1, q.x0 - gapQ) }, { ...A, y0: Math.max(A.y0, q.y1 + gapQ) }, { ...A, y1: Math.min(A.y1, q.y0 - gapQ) }];
    const best = opts.reduce((a, b) => (area(b) > area(a) ? b : a));
    if (area(best) >= 0.55 * area(A)) Object.assign(A, best);
  }
  A.w = A.x1 - A.x0; A.h = A.y1 - A.y0; A.m = Math.min(A.w, A.h);
  const m = A.m, X = (u) => A.x0 + u * A.w, Y = (v) => A.y0 + v * A.h, wide = A.w > A.h * 1.3, tall = A.h > A.w * 1.2;
  const side = ctx.mirror ? -1 : 1;
  // the brushed coating stops short of the sheet's edge — but never inside the copy
  let margin = 0.04 * P.border;
  for (const q of quiet) margin = Math.min(margin, q.x0 - 0.02, q.y0 - 0.02, sx - q.x1 - 0.02, sy - q.y1 - 0.02);
  margin = Math.max(0.006, margin);

  // ---- canvas: how much light each thing holds back (1 = opaque)
  const kc = Math.min(1.25, 3200 / Math.max(W, H)), cw = Math.round(W * kc), chh = Math.round(H * kc), su = Math.min(cw, chh);
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = chh;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#000'; g.fillRect(0, 0, cw, chh); g.lineJoin = 'round'; g.lineCap = 'round';
  const trace = (pts, close = true) => { g.moveTo(pts[0][0] * su, pts[0][1] * su); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0] * su, pts[i][1] * su); if (close) g.closePath(); };
  const fill = (polys, a = 1, rule = 'nonzero') => { const list = Array.isArray(polys[0][0]) ? polys : [polys]; g.globalAlpha = a; g.fillStyle = '#fff'; g.beginPath(); for (const p of list) trace(p); g.fill(rule); g.globalAlpha = 1; };
  const line = (pts, w, a = 1) => { g.globalAlpha = a; g.strokeStyle = '#fff'; g.lineWidth = Math.max(0.6, w * su); g.beginPath(); trace(pts, false); g.stroke(); g.globalAlpha = 1; };
  const disc = (x, y, r, a = 1) => { g.globalAlpha = a; g.fillStyle = '#fff'; g.beginPath(); g.arc(x * su, y * su, Math.max(0.4, r * su), 0, TAU); g.fill(); g.globalAlpha = 1; };
  const punch = (polys) => { const list = Array.isArray(polys[0][0]) ? polys : [polys]; g.save(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); for (const p of list) trace(p); g.fill(); g.restore(); };

  // ---- geometry
  const ell = (cx, cy, rx, ry, rot = 0, n = 36) => { const c = Math.cos(rot), s = Math.sin(rot), out = []; for (let i = 0; i < n; i++) { const a = (i / n) * TAU, x = Math.cos(a) * rx, y = Math.sin(a) * ry; out.push([cx + x * c - y * s, cy + x * s + y * c]); } return out; };
  const circ = (cx, cy, r, n = 48) => ell(cx, cy, r, r, 0, n);
  const bez = (c, n = 40) => { const out = []; for (let i = 0; i <= n; i++) { const t = i / n, a = (1 - t) ** 3, b = 3 * (1 - t) ** 2 * t, d = 3 * (1 - t) * t * t, e = t ** 3; out.push([a * c[0][0] + b * c[1][0] + d * c[2][0] + e * c[3][0], a * c[0][1] + b * c[1][1] + d * c[2][1] + e * c[3][1]]); } return out; };
  const densify = (pts, k = 12) => { const out = []; for (let i = 0; i < pts.length - 1; i++) for (let j = 0; j < k; j++) out.push([lerp(pts[i][0], pts[i + 1][0], j / k), lerp(pts[i][1], pts[i + 1][1], j / k)]); out.push(pts[pts.length - 1]); return out; };
  const lens = (pts0, w, skew = 1, pw = 0.7) => {
    const pts = pts0.length < 10 ? densify(pts0, Math.ceil(16 / (pts0.length - 1))) : pts0;
    const n = pts.length, len = [0]; for (let i = 1; i < n; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const tot = len[n - 1] || 1e-6, L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)]; let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      const t = len[i] / tot, h = 0.5 * w * Math.pow(Math.sin(Math.PI * Math.pow(t, skew)), pw);
      L.push([pts[i][0] + nx * h, pts[i][1] + ny * h]); R.push([pts[i][0] - nx * h, pts[i][1] - ny * h]);
    }
    return L.concat(R.reverse());
  };
  const cumLen = (pts) => { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return c; };
  const along = (pts) => { const cum = cumLen(pts), tot = cum[cum.length - 1]; return (t) => { const s = clamp(t, 0, 1) * tot; let i = 1; while (i < pts.length - 1 && cum[i] < s) i++; const f = clamp((s - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]), 0, 1); const p = [lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f)]; p.ang = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]); return p; }; };
  const xf = (cx, cy, s, rot = 0) => { const c = Math.cos(rot), sn = Math.sin(rot); return (p) => [cx + s * (p[0] * c - p[1] * sn), cy + s * (p[0] * sn + p[1] * c)]; };
  const wob = (pts, amt, f = 9) => { const k = rng.range(0, 99); return pts.map(([x, y], i) => [x + amt * noise.noise3(x * f, y * f, k), y + amt * noise.noise3(x * f, y * f, k + 5)]); };

  // ---- specimens and objects -------------------------------------------------------------------------
  // a fern frond: a curving rachis with pinnae, each pinna a row of rounded pinnules
  const fern = (x0, y0, L, ang, bend = 0.25) => {
    const dir = [Math.cos(ang), Math.sin(ang)], nrm = [-dir[1], dir[0]];
    const c = [[x0, y0], [x0 + dir[0] * L * 0.35 + nrm[0] * L * bend * 0.4, y0 + dir[1] * L * 0.35 + nrm[1] * L * bend * 0.4], [x0 + dir[0] * L * 0.7 + nrm[0] * L * bend, y0 + dir[1] * L * 0.7 + nrm[1] * L * bend], [x0 + dir[0] * L + nrm[0] * L * bend * 1.6, y0 + dir[1] * L + nrm[1] * L * bend * 1.6]];
    const rach = bez(c, 80), at = along(rach);
    line(rach.slice(0, 70), L * 0.009); line(rach.slice(60), L * 0.005);
    const n = Math.round(15 * Math.sqrt(P.density));
    for (let i = 0; i < n; i++) {
      const t = 0.1 + 0.88 * (i / n), p = at(t), env = Math.pow(Math.sin(Math.PI * Math.min(1, (t - 0.04) / 0.98)), 0.75) * (t < 0.3 ? lerp(0.6, 1, (t - 0.1) / 0.2) : 1);
      for (const sg of [1, -1]) {
        const pl = L * 0.27 * env * rng.range(0.92, 1.06), a = p.ang + sg * (1.15 - 0.35 * t) + rng.range(-0.05, 0.05), bendP = -sg * 0.18;
        const ax = (s) => [p[0] + Math.cos(a + bendP * s) * pl * s, p[1] + Math.sin(a + bendP * s) * pl * s];
        line([ax(0), ax(0.5), ax(0.97)], L * 0.0035);
        const k = Math.max(3, Math.round(pl / (L * 0.016)));
        for (let j = 0; j < k; j++) {
          const s = (j + 0.6) / (k + 0.4), q = ax(s), rr = pl * 0.042 * (1 - 0.55 * s) + L * 0.0022, aa = a + bendP * s;
          for (const sg2 of [1, -1]) { const o = [q[0] + Math.cos(aa + sg2 * 1.4) * rr * 0.9, q[1] + Math.sin(aa + sg2 * 1.4) * rr * 0.9]; fill(ell(o[0], o[1], rr * 1.3, rr * 0.75, aa + sg2 * 0.8, 16), 0.97); }
        }
        fill(ell(...ax(1), pl * 0.05 + L * 0.003, pl * 0.035 + L * 0.002, a, 14), 0.97);
      }
    }
    fill(ell(...at(1), L * 0.018, L * 0.01, at(0.99).ang, 14));
  };
  // a leaf, thin enough to let some light through: veins print whiter
  const leaf = (x, y, L, ang, wf = 0.42, serr = 1) => {
    const T = xf(x, y, L, ang), pts = [];
    for (let i = 0; i <= 60; i++) { const t = i / 60, w = wf * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.9) * (1 + 0.04 * serr * Math.sin(t * 90)); pts.push([t, -w * 0.5]); }
    for (let i = 60; i >= 0; i--) { const t = i / 60, w = wf * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.9) * (1 + 0.04 * serr * Math.sin(t * 90 + 1.5)); pts.push([t, w * 0.5]); }
    fill(pts.map(T), 0.8);
    line([[-0.25, 0.02], [0, 0], [0.5, 0], [0.97, 0]].map(T), L * 0.012, 1);
    for (let k = 0; k < 8; k++) for (const sg of [1, -1]) { const t0 = 0.1 + k * 0.1, w = wf * 0.45 * Math.pow(Math.sin(Math.PI * Math.pow(t0 + 0.12, 0.8)), 0.9); line([[t0, 0], [t0 + 0.07, sg * w * 0.55], [t0 + 0.15, sg * w * 0.9]].map(T), L * 0.005, 0.8); }
  };
  // Queen Anne's lace: an umbel of umbellets of tiny flowers
  const umbel = (x, y, r, stemLen, ang) => {
    const base = [x - Math.cos(ang) * stemLen, y - Math.sin(ang) * stemLen];
    line(bez([base, [lerp(base[0], x, 0.4) + r * 0.2, lerp(base[1], y, 0.4)], [lerp(base[0], x, 0.7) - r * 0.1, lerp(base[1], y, 0.7)], [x, y]], 20), r * 0.035);
    const n = Math.round(22 * P.density);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU * 1.0 + rng.range(-0.1, 0.1), d = r * Math.sqrt(rng.range(0.15, 1)), ex = x + Math.cos(a) * d, ey = y + Math.sin(a) * d * 0.9;
      line([[x, y], [ex, ey]], r * 0.008, 0.9);
      for (let j = 0; j < 14; j++) { const b = rng.range(0, TAU), dd = r * 0.12 * Math.sqrt(rng()); disc(ex + Math.cos(b) * dd, ey + Math.sin(b) * dd, r * rng.range(0.012, 0.022), 0.95); }
    }
  };
  const grass = (x, y, L, ang, curl) => { const pts = bez([[x, y], [x + Math.cos(ang) * L * 0.4, y + Math.sin(ang) * L * 0.4], [x + Math.cos(ang + curl) * L * 0.75, y + Math.sin(ang + curl) * L * 0.75], [x + Math.cos(ang + curl * 1.8) * L, y + Math.sin(ang + curl * 1.8) * L]], 30); fill(lens(pts, L * 0.035, 0.35, 0.6), 0.95); };
  const daisy = (x, y, r, rot) => { for (let i = 0; i < 13; i++) { const a = rot + (i / 13) * TAU; fill(ell(x + Math.cos(a) * r * 0.58, y + Math.sin(a) * r * 0.58, r * 0.46, r * 0.12, a, 18), 0.62); } disc(x, y, r * 0.24, 1); };
  // a seaweed specimen: a holdfast and dichotomous branching, the branches thinning out
  const alga = (x, y, L, ang, depth = 4, w = 0.016) => {
    // a frond: a wavering axis that sheds alternate branchlets, each branching again, finer and finer
    const grow = (px, py, a, len, wd, d) => {
      const n = 16, pts = [[px, py]]; let cx = px, cy = py, ca = a; const curl = rng.range(-0.05, 0.05);
      for (let i = 1; i <= n; i++) { ca += curl + rng.range(-0.07, 0.07); cx += Math.cos(ca) * len / n; cy += Math.sin(ca) * len / n; pts.push([cx, cy]); }
      fill(lens(pts, wd * L, 0.12, 0.3), 0.96);
      if (d <= 0) return;
      const at = along(pts), nb = d >= 3 ? rng.int(5, 8) : rng.int(3, 6);
      for (let k = 0; k < nb; k++) {
        const t = 0.15 + 0.8 * (k / nb) + rng.range(-0.03, 0.03), p = at(t), sg = k % 2 ? 1 : -1;
        grow(p[0], p[1], p.ang + sg * rng.range(0.55, 0.95), len * rng.range(0.38, 0.55) * (1.1 - 0.5 * t), wd * 0.62, d - 1);
      }
    };
    disc(x, y, L * 0.014, 1);
    grow(x, y, ang, L * 0.85, w, depth);
  };

  // everyday objects
  const bottle = (x, y, h, rot) => {
    const T = xf(x, y, h, rot), prof = [[0.0, 0.5], [0.16, 0.5], [0.2, 0.47], [0.21, 0.0], [0.19, -0.12], [0.08, -0.26], [0.065, -0.44], [0.075, -0.47], [0.075, -0.5]];
    const out = prof.map(([r, z]) => [r, z]).concat(prof.slice().reverse().map(([r, z]) => [-r, z]));
    fill(out.map(T), 0.32);                                                           // glass lets most light through
    line(prof.map(([r, z]) => [r * 0.94, z]).map(T), h * 0.012, 0.9); line(prof.map(([r, z]) => [-r * 0.94, z]).map(T), h * 0.012, 0.9);
    line([[-0.2, 0.47], [0.2, 0.47]].map(T), h * 0.012, 0.9);
    fill(lens([[-0.12, 0.38], [-0.13, 0.1], [-0.11, -0.1]].map(T), h * 0.035, 1, 0.6), 0.75);   // a bright streak where the glass is thick
    fill(ell(...T([0, 0.5]), h * 0.17, h * 0.03, rot, 24), 0.5);
    fill([[-0.08, -0.5], [0.08, -0.5], [0.08, -0.43], [-0.08, -0.43]].map(T), 0.9);               // the cork
  };
  const scissors = (x, y, s, rot) => {
    const T = xf(x, y, s, rot);
    for (const sg of [1, -1]) {
      const a = sg * 0.13, tip = [Math.cos(a) * 0.55, Math.sin(a) * 0.55];
      fill([[-0.06, sg * 0.03], [tip[0] * 0.5, tip[1] * 0.5 + sg * 0.045], tip, [tip[0] * 0.5, tip[1] * 0.5 - sg * 0.005], [0.0, -sg * 0.01]].map(T), 1);
      const hx = -0.27, hy = -sg * 0.13; line([[-0.04, -sg * 0.01], [-0.15, -sg * 0.07], [hx + 0.08, hy * 0.9]].map(T), s * 0.045);
      fill([ell(hx, hy, 0.11, 0.075, -sg * 0.4, 30).map(T), ell(hx, hy, 0.078, 0.048, -sg * 0.4, 30).map(T)], 1, 'evenodd');
    }
    disc(...T([0, 0.01]), s * 0.022, 1);
  };
  const key = (x, y, s, rot) => {
    const T = xf(x, y, s, rot);
    fill([circ(-0.36, 0, 0.13, 40).map(T), circ(-0.36, 0, 0.065, 30).map(T)], 1, 'evenodd');
    fill([[-0.25, -0.028], [0.36, -0.028], [0.36, 0.028], [-0.25, 0.028]].map(T), 1);
    fill([[-0.22, -0.05], [-0.18, -0.05], [-0.18, 0.05], [-0.22, 0.05]].map(T));
    fill([[0.2, 0.0], [0.36, 0.0], [0.36, 0.17], [0.32, 0.17], [0.32, 0.1], [0.28, 0.1], [0.28, 0.14], [0.24, 0.14], [0.24, 0.07], [0.2, 0.07]].map(T), 1);
  };
  const feather = (x, y, L, ang, curve = 0.12) => {
    const nrm = ang + Math.PI / 2, pts = bez([[x, y], [x + Math.cos(ang) * L * 0.35, y + Math.sin(ang) * L * 0.35], [x + Math.cos(ang) * L * 0.7 + Math.cos(nrm) * L * curve, y + Math.sin(ang) * L * 0.7 + Math.sin(nrm) * L * curve], [x + Math.cos(ang) * L + Math.cos(nrm) * L * curve * 2, y + Math.sin(ang) * L + Math.sin(nrm) * L * curve * 2]], 60), at = along(pts);
    line(pts, L * 0.012, 1);
    for (let i = 0; i < 150; i++) {
      const t = 0.12 + 0.86 * (i / 150), p = at(t);
      for (const sg of [1, -1]) {
        if ((sg > 0 && t > 0.4 && t < 0.47) || (sg < 0 && t > 0.62 && t < 0.66)) continue;   // splits in the vane
        const w = L * (sg > 0 ? 0.12 : 0.085) * Math.pow(Math.sin(Math.PI * Math.min(1, (t - 0.06) / 0.98)), 0.55), a = p.ang + sg * (0.75 - 0.25 * t);
        line([p, [p[0] + Math.cos(a) * w * 0.5, p[1] + Math.sin(a) * w * 0.5], [p[0] + Math.cos(a + sg * 0.25) * w, p[1] + Math.sin(a + sg * 0.25) * w]], L * 0.0035, t < 0.22 ? 0.5 : 0.62);
      }
    }
  };
  const doily = (x, y, R) => {
    const outer = []; for (let i = 0; i < 360; i++) { const a = (i / 360) * TAU, sc = 1 + 0.045 * Math.pow(Math.abs(Math.sin(a * 16)), 0.6); outer.push([x + Math.cos(a) * R * sc, y + Math.sin(a) * R * sc]); }
    fill(outer, 0.9);
    const holes = [];
    for (const [rr, n, hr] of [[0.88, 48, 0.035], [0.75, 32, 0.06], [0.6, 24, 0.07], [0.45, 16, 0.075], [0.3, 10, 0.07], [0.16, 6, 0.05]]) for (let i = 0; i < n; i++) { const a = (i / n) * TAU + (n % 3) * 0.1; holes.push(ell(x + Math.cos(a) * R * rr, y + Math.sin(a) * R * rr, R * hr, R * hr * 0.7, a, 14)); }
    punch(holes);
    for (const rr of [0.82, 0.68, 0.53, 0.38, 0.23]) line(circ(x, y, R * rr, 90).concat([circ(x, y, R * rr, 90)[0]]), R * 0.012, 1);
    // threads radiating
    for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; line([[x + Math.cos(a) * R * 0.1, y + Math.sin(a) * R * 0.1], [x + Math.cos(a) * R * 0.95, y + Math.sin(a) * R * 0.95]], R * 0.006, 0.9); }
  };

  // ---- motifs ===========================================================================================
  const motifs = {
    botanical() {
      const vw = A.w / A.h > 1.8, L = m * (vw ? 1.3 : wide ? 0.9 : tall ? 1.05 : 0.92);
      // the frond runs diagonally through the focus
      fern(X(0.5 - side * (vw ? 0.4 : 0.32)), Y(vw ? 1.02 : 0.97), L, -Math.PI / 2 + side * (vw ? 1.25 : wide ? 0.62 : 0.4), -0.22 * side);
      leaf(X(0.5 + side * (vw ? 0.33 : 0.3)), Y(0.82), m * (vw ? 0.55 : 0.42), -Math.PI / 2 + side * 0.9, 0.42);
      leaf(X(0.5 + side * 0.36), Y(0.9), m * 0.3, -Math.PI / 2 + side * 1.5, 0.5);
      umbel(X(0.5 + side * (vw ? 0.08 : 0.22)), Y(vw ? 0.3 : 0.24), m * (vw ? 0.2 : 0.16), m * 0.5, Math.PI / 2 - side * 0.2 + Math.PI);
      for (let i = 0; i < Math.round(4 * P.density); i++) grass(X(0.5 - side * rng.range(0.05, 0.4)), Y(1.02), m * rng.range(0.4, 0.75), -Math.PI / 2 + side * rng.range(-0.3, 0.5), rng.range(-0.25, 0.25));
      daisy(X(0.5 - side * 0.3), Y(0.2), m * 0.08, rng.range(0, TAU));
      line(bez([[X(0.5 - side * 0.3), Y(0.2)], [X(0.5 - side * 0.33), Y(0.35)], [X(0.5 - side * 0.4), Y(0.45)], [X(0.5 - side * 0.42), Y(0.6)]], 16), m * 0.006);
    },
    objects() {
      const k = A.w / A.h > 1.8 ? 1.3 : 1;
      doily(X(0.5 + side * 0.08), Y(0.5), m * 0.3 * k);
      bottle(X(0.5 - side * 0.26), Y(0.45), m * 0.62 * k, side * 0.18);
      scissors(X(0.5 + side * 0.3), Y(0.83), m * 0.38 * k, -side * 0.5);
      key(X(0.5 + side * 0.24 * (k > 1 ? 1.35 : 1)), Y(0.14), m * 0.28 * k, side * 0.35);
      feather(X(0.5 - side * 0.12 * (k > 1 ? 1.4 : 1)), Y(0.96), m * 0.5 * k, -Math.PI / 2 + side * 1.2, 0.1);
    },
    shapes() {
      // cut paper and tracing paper laid down in a loose constructivist arrangement, with a length of string
      const cx = X(0.5), cy = Y(0.5), m = A.m * (A.w / A.h > 1.8 ? 1.25 : 1);
      fill(circ(cx + side * m * 0.12, cy - m * 0.08, m * 0.27, 90), 1);
      fill(ell(cx - side * m * 0.08, cy + m * 0.06, m * 0.42, m * 0.11, -side * 0.5, 4).map(([x, y], i, a) => [x, y]), 0.4);
      const rect = (x, y, w, h, r, a) => { const c = Math.cos(r), s = Math.sin(r); fill([[-w, -h], [w, -h], [w, h], [-w, h]].map(([px, py]) => [x + px * c - py * s, y + px * s + py * c]), a); };
      rect(cx - side * m * 0.18, cy - m * 0.2, m * 0.2, m * 0.14, side * 0.22, 0.45);
      rect(cx + side * m * 0.05, cy + m * 0.22, m * 0.36, m * 0.035, -side * 0.12, 1);
      rect(cx + side * m * 0.25, cy + m * 0.3, m * 0.09, m * 0.09, side * 0.6, 0.55);
      fill([[cx - side * m * 0.42, cy + m * 0.42], [cx - side * m * 0.12, cy + m * 0.45], [cx - side * m * 0.3, cy + m * 0.12]], 0.85);
      // a punched strip
      const sx0 = cx - side * m * 0.4, sy0 = cy - m * 0.42; rect(sx0 + side * m * 0.25, sy0, m * 0.26, m * 0.04, 0.0, 1);
      punch(Array.from({ length: 9 }, (_, i) => circ(sx0 + side * m * (0.04 + i * 0.053), sy0, m * 0.014, 16)));
      // string: one long loop
      const st = []; for (let i = 0; i <= 200; i++) { const t = i / 200, a = t * TAU * 1.3; st.push([cx + side * (Math.cos(a) * m * (0.33 - 0.12 * t) + m * 0.05) + m * 0.02 * noise.noise3(t * 5, 1, 2), cy + Math.sin(a) * m * (0.3 - 0.08 * t) + m * 0.02 * noise.noise3(t * 5, 4, 2)]); }
      line(st, m * 0.006, 1);
      // a ring and a few holes punched from paper
      fill([circ(cx - side * m * 0.36, cy - m * 0.02, m * 0.075, 50), circ(cx - side * m * 0.36, cy - m * 0.02, m * 0.05, 50)], 1, 'evenodd');
      for (let i = 0; i < 7; i++) disc(cx + side * m * rng.range(-0.45, 0.45), cy + m * rng.range(-0.45, 0.45), m * rng.range(0.008, 0.016), 1);
    },
    algae() {
      // one large specimen through the focus, a smaller one beside it, as mounted on a herbarium sheet
      const k = A.w / A.h > 1.8 ? 1.35 : 1;
      alga(X(0.5 - side * 0.3), Y(0.97), m * (tall ? 1.1 : 1.0) * k, -Math.PI / 2 + side * (k > 1 ? 0.9 : 0.55), 4, 0.014);
      alga(X(0.5 + side * 0.32), Y(0.03), m * 0.6 * k, Math.PI / 2 + side * 0.35, 3, 0.012);
      if (wide) alga(X(0.5 - side * 0.42), Y(0.9), m * 0.45, -Math.PI / 2 + side * 0.5, 3, 0.014);
    },
  };
  (motifs[P.motif] ?? motifs.botanical)();
  // nothing may print on the copy
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  for (const q of quiet) { g.fillStyle = '#000'; g.fillRect((q.x0 - 0.008) * su, (q.y0 - 0.008) * su, (q.x1 - q.x0 + 0.016) * su, (q.y1 - q.y0 + 0.016) * su); }

  // ---- penumbra: blurred copies
  const blurred = (px) => { const c = document.createElement('canvas'); c.width = cw; c.height = chh; const b = c.getContext('2d'); b.fillStyle = '#000'; b.fillRect(0, 0, cw, chh); b.filter = `blur(${Math.max(1, px)}px)`; b.drawImage(cv, 0, 0); return c; };
  const c1 = blurred(0.004 * su), c2 = blurred(0.016 * su);
  const tex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = false; t.minFilter = t.magFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; };

  const C = palette.colors?.length ? palette.colors : ['#f2efe6', '#0e2a6b', '#3d6fb0'];
  const paperHex = C[0], deepHex = C[1] ?? palette.bg, paleHex = C[2] ?? palette.bg;
  scene.add(backgroundQuad(/* glsl */`
    varying vec2 vUv; uniform sampler2D tSharp, tSoft, tHalo; uniform vec2 uAsp; uniform vec3 uPaper, uGround, uDeep, uPale; uniform float uLift, uWash, uGrain, uMargin, uSeed, uFine;
    ${GLSL_NOISE_KIT}
    ${GLSL_DITHER}
    void main(){
      vec2 p = vec2(vUv.x, 1.0 - vUv.y), q = p * uAsp;
      // ---- the brushed coating: horizontal strokes ending raggedly, dry-brush streaks at the ends
      float streak = noise2(vec2(q.x * 3.0, q.y * 260.0 * uFine) + uSeed) * 0.5 + noise2(vec2(q.x * 7.0, q.y * 900.0 * uFine) - uSeed) * 0.5;
      float eL = uMargin + 0.012 * fbm2(vec2(1.3, q.y * 7.0) + uSeed, 3) + 0.006 * noise2(vec2(5.0, q.y * 40.0));
      float eR = uAsp.x - uMargin - 0.012 * fbm2(vec2(7.3, q.y * 7.0) + uSeed, 3) - 0.006 * noise2(vec2(9.0, q.y * 40.0));
      float eT = uMargin + 0.008 * fbm2(vec2(q.x * 5.0, 2.1) + uSeed, 3), eB = uAsp.y - uMargin - 0.008 * fbm2(vec2(q.x * 5.0, 8.1) + uSeed, 3);
      float dx = min(q.x - eL, eR - q.x), dy = min(q.y - eT, eB - q.y);
      float cx = smoothstep(-0.002, 0.01, dx + 0.012 * streak), cy = smoothstep(-0.002, 0.006, dy + 0.004 * streak);
      float coat = cx * cy;
      // ---- what the objects held back: crisp where they lay flat, soft where they lifted
      float sharp = texture2D(tSharp, vUv).r, soft = texture2D(tSoft, vUv).r, halo = texture2D(tHalo, vUv).r;
      float lifted = smoothstep(-0.1, 0.6, fbm2(q * 3.0 + uSeed * 1.3, 3)) * uLift;
      float hold = mix(sharp, soft, clamp(lifted, 0.0, 1.0));
      hold = max(hold, halo * 0.18 * uLift);
      float expo = coat * (1.0 - hold);
      // ---- the developed blue: uneven coating, darker where it pooled, paler where it was thin; tide marks
      float blot = fbm2(q * 2.2 + uSeed, 4), thin = fbm2(q * 6.0 - uSeed, 3);
      vec3 ground = uGround;
      ground = mix(ground, uDeep, uWash * 0.55 * smoothstep(0.0, 0.6, blot));
      ground = mix(ground, uPale, uWash * 0.35 * smoothstep(0.15, 0.7, -blot + 0.3 * thin));
      float tide = smoothstep(0.035, 0.0, abs(fbm2(q * 1.1 + 3.3 + uSeed, 2) - 0.25)) * 0.08 * uWash;
      ground = mix(ground, uDeep, tide);
      // brush strokes visible in the coating
      ground *= 1.0 + 0.05 * uWash * (streak - 0.5) * (1.0 - smoothstep(0.0, 0.08, min(dx, dy)) * 0.5);
      // ---- the paper: warm white, tooth, a little mottling; the tooth catches less coating
      float tooth = noise2(q * 520.0 * uFine), tooth2 = noise2(q * 170.0 * uFine + 7.0);
      vec3 paper = uPaper * (1.0 + uGrain * (0.018 * tooth + 0.012 * tooth2 + 0.01 * fbm2(q * 9.0, 2)));
      float e = expo * (1.0 - uGrain * 0.22 * smoothstep(0.35, 0.85, tooth * 0.6 + tooth2 * 0.6));
      // partial exposure reads pale blue, full exposure the developed ground
      vec3 col = mix(paper, ground, pow(clamp(e, 0.0, 1.0), 0.8));
      // the specimen's own edge prints a hair darker (the coating pooled against it)
      float rim = clamp(soft - sharp, 0.0, 1.0) * coat * (1.0 - uLift * 0.5);
      col = mix(col, uDeep, rim * 0.35);
      col *= 1.0 + uGrain * 0.03 * (tooth - 0.5) * coat;
      col = clamp(col, 0.0, 1.0);
      gl_FragColor = vec4(mix(col / 12.92, pow((col + 0.055) / 1.055, vec3(2.4)), step(0.04045, col)), 1.0);
      #include <colorspace_fragment>
      gl_FragColor.rgb += ditherNoise(gl_FragCoord.xy);
    }`, {
    tSharp: { value: tex(cv) }, tSoft: { value: tex(c1) }, tHalo: { value: tex(c2) }, uAsp: { value: new THREE.Vector2(sx, sy) },
    uPaper: { value: srgbVec(paperHex) }, uGround: { value: srgbVec(palette.bg) }, uDeep: { value: srgbVec(deepHex) }, uPale: { value: srgbVec(paleHex) },
    uLift: { value: P.lift }, uWash: { value: P.wash }, uGrain: { value: P.grain }, uMargin: { value: margin }, uSeed: { value: (seed % 97) * 0.43 }, uFine: { value: Math.min(1, Math.min(W, H) / 1900) },
  }));
  ctx.frame({ radius: 1, fov: 30, dir: [0, 0, 1] });
}
