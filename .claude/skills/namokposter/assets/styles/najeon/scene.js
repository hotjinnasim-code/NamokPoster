// Najeon (나전칠기) — mother-of-pearl inlaid in lacquer. Thin slices of abalone and pearl-oyster shell
// are cut into pieces (feathers, petals, cloud scrolls), into narrow strips that are snapped into
// short lengths and bent along a line (끊음질), or crushed into a crackle of tiny fragments (타발법);
// they are laid into the lacquer, coated over and polished until shell and lacquer form one glassy
// surface. Every piece throws its own shifting pink–green–blue sheen, each fragment of a crackled
// piece a little differently, and fine engraved lines (feather shafts, stamens) cut black through it.
//
// How it is made: the pieces are drawn on a 2D canvas as a mask — R = shell, G = a number per piece
// (its sheen and the direction of its growth layers), B = crackle. A blurred copy gives each piece a
// faint sunk edge. The shader lays the lacquer (deep colour, a soft polished reflection) and the shell
// (lamellar growth bands, thin-film sheen through the palette's hues, cracks, glints) at full resolution.
//
// Palette: bg = the lacquer (copy sits on it) · colors = the sheen hues of the shell (pink, green, blue…)
//          ink / accent = type. A light bg gives pearl on ivory lacquer, the shell outlined in dark lacquer.
// Motifs:  cranes (two cranes among scroll clouds before a shell moon) · blossom (a plum branch in flower)
//          lattice (a roundel of tortoise-shell lattice with flowers) · waves (mountains above rolling waves)
import { makeNoise, backgroundQuad, srgbVec, GLSL_NOISE_KIT, GLSL_DITHER } from '/skill/assets/web/scene-lib.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

export default function build(ctx) {
  const { THREE, scene, palette, params, aspect, seed, rng, width: W, height: H } = ctx;
  const sx = Math.max(aspect, 1), sy = Math.max(1 / aspect, 1);
  const noise = makeNoise(seed * 13 + 5);
  const P = {
    motif: String(params.motif ?? 'cranes'), crackle: clamp(params.crackle ?? 1, 0, 2), sheen: clamp(params.sheen ?? 1, 0, 2),
    gloss: clamp(params.gloss ?? 1, 0, 2), border: params.border ?? true, density: clamp(params.density ?? 1, 0.5, 1.6),
  };
  const lac = srgbVec(palette.bg), light = 0.2126 * lac.x + 0.7152 * lac.y + 0.0722 * lac.z > 0.45;

  // ---- the panel: the art rectangle, kept clear of the copy
  const quiet = (ctx.quiet || []).map(([x0, y0, x1, y1]) => ({ x0: x0 * sx, y0: y0 * sy, x1: x1 * sx, y1: y1 * sy }));
  const ar = ctx.artRect || [0, 0, 1, 1];
  const A = { x0: ar[0] * sx, y0: ar[1] * sy, x1: ar[2] * sx, y1: ar[3] * sy };
  const gapQ = 0.04, area = (b) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
  for (const q of quiet) {
    if (q.x1 < A.x0 || q.x0 > A.x1 || q.y1 < A.y0 || q.y0 > A.y1) continue;
    const opts = [{ ...A, x0: Math.max(A.x0, q.x1 + gapQ) }, { ...A, x1: Math.min(A.x1, q.x0 - gapQ) }, { ...A, y0: Math.max(A.y0, q.y1 + gapQ) }, { ...A, y1: Math.min(A.y1, q.y0 - gapQ) }];
    const best = opts.reduce((a, b) => (area(b) > area(a) ? b : a));
    if (area(best) >= 0.55 * area(A)) Object.assign(A, best);
  }
  A.x0 = Math.max(A.x0, 0.035); A.y0 = Math.max(A.y0, 0.035); A.x1 = Math.min(A.x1, sx - 0.035); A.y1 = Math.min(A.y1, sy - 0.035);
  A.w = A.x1 - A.x0; A.h = A.y1 - A.y0; A.m = Math.min(A.w, A.h);
  const fr = P.border ? 0.05 * A.m : 0;                                             // inside the inlaid frame
  const I = { x0: A.x0 + fr, y0: A.y0 + fr, x1: A.x1 - fr, y1: A.y1 - fr }; I.w = I.x1 - I.x0; I.h = I.y1 - I.y0; I.m = Math.min(I.w, I.h);
  const m = I.m, X = (u) => I.x0 + u * I.w, Y = (v) => I.y0 + v * I.h, wide = I.w > I.h * 1.3, tall = I.h > I.w * 1.2;
  const side = ctx.mirror ? -1 : 1;

  // ---- canvas
  const kc = Math.min(1.5, 4096 / Math.max(W, H)), cw = Math.round(W * kc), chh = Math.round(H * kc), su = Math.min(cw, chh);
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = chh;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#000'; g.fillRect(0, 0, cw, chh); g.lineJoin = 'round'; g.lineCap = 'round';
  const GAP = 0.0016;                                                               // lacquer between neighbouring pieces
  const trace = (pts, close = true) => { g.moveTo(pts[0][0] * su, pts[0][1] * su); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0] * su, pts[i][1] * su); if (close) g.closePath(); };
  // one piece of shell: a lacquer gap is cut round it first, so it sits apart from what lies under it
  const piece = (polys, crack = 0, id = null) => {
    const list = Array.isArray(polys[0][0]) ? polys : [polys];
    const v = id ?? 1 + Math.floor(rng() * 254);
    g.beginPath(); for (const p of list) trace(p); g.strokeStyle = '#000'; g.lineWidth = GAP * 2 * su; g.stroke();
    g.fillStyle = `rgb(255,${v},${Math.round(clamp(crack, 0, 1) * 255)})`; g.fill('nonzero');
    return v;
  };
  const engrave = (pts, w, close = false) => { g.beginPath(); trace(pts, close); g.strokeStyle = '#000'; g.lineWidth = w * su; g.stroke(); };
  const dot = (x, y, r, fill = '#000') => { g.beginPath(); g.arc(x * su, y * su, r * su, 0, TAU); g.fillStyle = fill; g.fill(); };
  const clipTo = (pts, fn) => { g.save(); g.beginPath(); trace(pts); g.clip(); fn(); g.restore(); };

  // ---- geometry
  const ell = (cx, cy, rx, ry, rot = 0, n = 40) => { const c = Math.cos(rot), s = Math.sin(rot), out = []; for (let i = 0; i < n; i++) { const a = (i / n) * TAU, x = Math.cos(a) * rx, y = Math.sin(a) * ry; out.push([cx + x * c - y * s, cy + x * s + y * c]); } return out; };
  const circ = (cx, cy, r, n = 48) => ell(cx, cy, r, r, 0, n);
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
  // a band of width w0 → w1 along a polyline
  const tube = (pts, w0, w1 = w0) => {
    const n = pts.length, len = [0]; for (let i = 1; i < n; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const tot = len[n - 1] || 1e-6, L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)]; let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      const h = 0.5 * lerp(w0, w1, len[i] / tot); L.push([pts[i][0] + nx * h, pts[i][1] + ny * h]); R.push([pts[i][0] - nx * h, pts[i][1] - ny * h]);
    }
    return L.concat(R.reverse());
  };
  const bez = (c, n = 40) => { const out = []; for (let i = 0; i <= n; i++) { const t = i / n, a = (1 - t) ** 3, b = 3 * (1 - t) ** 2 * t, d = 3 * (1 - t) * t * t, e = t ** 3; out.push([a * c[0][0] + b * c[1][0] + d * c[2][0] + e * c[3][0], a * c[0][1] + b * c[1][1] + d * c[2][1] + e * c[3][1]]); } return out; };
  const resample = (pts, step) => {
    const out = [pts[0]]; let acc = 0;
    for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); acc += d; if (acc >= step) { out.push(pts[i]); acc = 0; } }
    if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
    return out;
  };
  const cumLen = (pts) => { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return c; };
  const sub = (pts, cum, s0, s1) => {               // the part of a polyline between arc lengths s0 and s1
    const at = (s) => { let i = 1; while (i < pts.length - 1 && cum[i] < s) i++; const t = clamp((s - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]), 0, 1); return [lerp(pts[i - 1][0], pts[i][0], t), lerp(pts[i - 1][1], pts[i][1], t)]; };
    const out = [at(s0)]; for (let i = 0; i < pts.length; i++) if (cum[i] > s0 && cum[i] < s1) out.push(pts[i]); out.push(at(s1)); return out;
  };
  // 끊음질: a strip of shell snapped into short lengths and laid along a line
  const strip = (pts, w, { len = [0.008, 0.022], gap = 0.0022 } = {}) => {
    const cum = cumLen(pts), tot = cum[cum.length - 1];
    for (let s = 0; s < tot - 0.002;) { const l = Math.min(tot - s, rng.range(len[0], len[1])); if (l > 0.0025) piece(tube(sub(pts, cum, s, s + l), w)); s += l + gap * rng.range(0.6, 1.3); }
  };
  // a piece cut up into a few lengths (a bough, a crane's neck): the joins are lacquer lines
  const segmented = (pts, w0, w1, n, crack = 1) => {
    const cum = cumLen(pts), tot = cum[cum.length - 1]; let s = 0;
    for (let i = 0; i < n; i++) { const l = (tot / n) * rng.range(0.75, 1.25), s1 = i === n - 1 ? tot : Math.min(tot, s + l); const t0 = s / tot, t1 = s1 / tot; piece(tube(sub(pts, cum, s, s1), lerp(w0, w1, t0), lerp(w0, w1, t1)), crack); s = s1 + GAP; if (s >= tot) break; }
  };
  const xf = (cx, cy, s, rot = 0, flip = 1) => { const c = Math.cos(rot), sn = Math.sin(rot); return (p) => { const x = p[0] * flip, y = p[1]; return [cx + s * (x * c - y * sn), cy + s * (x * sn + y * c)]; }; };
  const map = (f, pts) => pts.map(f);

  // ---- shared pieces
  // 영지운: a scroll cloud — three or four lobes and a trailing tail, with a curl engraved in each lobe
  const cloud = (cx, cy, s, dir = 1) => {
    const lobes = []; const n = rng.int(3, 4);
    for (let i = 0; i < n; i++) { const t = i / (n - 1), r = s * (0.2 + 0.1 * Math.sin(Math.PI * t)) * rng.range(0.9, 1.1); lobes.push([cx + dir * s * lerp(-0.42, 0.42, t), cy + s * (-0.08 * Math.sin(Math.PI * t) + rng.range(-0.03, 0.03)), r]); }
    const tail = lens(bez([[cx - dir * s * 0.3, cy + s * 0.12], [cx - dir * s * 0.7, cy + s * 0.24], [cx - dir * s * 1.0, cy + s * 0.1], [cx - dir * s * 1.25, cy + s * 0.18]], 12), s * 0.16, 0.45, 0.8);
    piece([...lobes.map(([x, y, r]) => circ(x, y, r, 36)), tail], 1);
    for (const [x, y, r] of lobes) { const pts = []; for (let i = 0; i <= 26; i++) { const a = -Math.PI * 0.5 + dir * i * 0.34, rr = r * (0.72 - i * 0.022); pts.push([x + Math.cos(a) * rr * dir, y + Math.sin(a) * rr]); } engrave(pts, s * 0.018); }
  };
  const moon = (cx, cy, r) => { piece(circ(cx, cy, r, 96), 1); };
  // 매화: a plum blossom of five petals, stamens engraved over the heart
  const blossom = (cx, cy, r, rot = rng.range(0, TAU), open = 1) => {
    for (let i = 0; i < 5; i++) { const a = rot + (i / 5) * TAU, d = r * 0.5 * open; piece(ell(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * 0.52, r * 0.46 * (0.75 + 0.25 * open), a, 30), 0.35); }
    for (let i = 0; i < 9; i++) { const a = rot + (i / 9) * TAU + 0.2, l = r * rng.range(0.45, 0.62); engrave([[cx + Math.cos(a) * r * 0.14, cy + Math.sin(a) * r * 0.14], [cx + Math.cos(a) * l, cy + Math.sin(a) * l]], r * 0.035); dot(cx + Math.cos(a) * l, cy + Math.sin(a) * l, r * 0.055); }
    dot(cx, cy, r * 0.16);
  };
  const bud = (cx, cy, r, a) => { piece(ell(cx, cy, r, r * 0.85, a, 24), 0.3); engrave([[cx - Math.cos(a) * r * 0.9, cy - Math.sin(a) * r * 0.9], [cx, cy]], r * 0.12); };

  // a crane in flight, beak to +x (local units ≈ 1.3 wide)
  const crane = (cx, cy, s, rot, flip) => {
    const T = xf(cx, cy, s, rot, flip), F = (pts) => map(T, pts), sw = s;
    const wing = (sh, wr, a0, a1, n, l0, l1, covW) => {
      const feathers = [];
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1), root = [lerp(sh[0], wr[0], t), lerp(sh[1], wr[1], t)], a = lerp(a0, a1, t) + rng.range(-0.04, 0.04), l = lerp(l0, l1, t * t) * rng.range(0.95, 1.05);
        const tip = [root[0] + Math.cos(a) * l, root[1] + Math.sin(a) * l], mid = [lerp(root[0], tip[0], 0.5) + Math.sin(a) * l * 0.03, lerp(root[1], tip[1], 0.5) - Math.cos(a) * l * 0.03];
        feathers.push([root, mid, tip, l]);
      }
      for (const [root, mid, tip, l] of feathers.slice().reverse()) { piece(F(lens([root, mid, tip], l * 0.36, 0.6, 0.55)), 0); engrave(F([[lerp(root[0], tip[0], 0.12), lerp(root[1], tip[1], 0.12)], mid, [lerp(mid[0], tip[0], 0.85), lerp(mid[1], tip[1], 0.85)]]), 0.006 * sw / s); }
      // coverts: a crackled mass over the roots of the flight feathers
      const cov = lens([sh, [lerp(sh[0], wr[0], 0.5) + covW * 0.3, lerp(sh[1], wr[1], 0.5)], wr], covW, 0.8, 0.55);
      piece(F(cov), 1);
      if (false) for (let k = 1; k <= 2; k++) engrave(F(bez([[lerp(sh[0], wr[0], 0.12), lerp(sh[1], wr[1], 0.12) + covW * 0.12 * k], [lerp(sh[0], wr[0], 0.4) - covW * 0.05 * k, lerp(sh[1], wr[1], 0.4) + covW * 0.15 * k], [lerp(sh[0], wr[0], 0.7), lerp(sh[1], wr[1], 0.7) + covW * 0.12 * k], [lerp(sh[0], wr[0], 0.92), lerp(sh[1], wr[1], 0.92)]], 14)), 0.005);
    };
    // far wing, behind
    wing([0.0, -0.04], [-0.1, -0.3], -2.0, -2.55, 8, 0.22, 0.36, 0.17);
    // legs trailing
    for (const dy of [0, 0.03]) { strip(F([[-0.1, 0.045 + dy * 0.5], [-0.38, 0.08 + dy], [-0.62, 0.1 + dy * 1.3]]), 0.013 * s, { len: [0.012, 0.03], gap: 0.002 }); }
    // tail
    for (let i = 0; i < 4; i++) { const a = Math.PI + lerp(-0.25, 0.3, i / 3); piece(F(lens([[-0.16, 0.0], [-0.16 + Math.cos(a) * 0.17, Math.sin(a) * 0.17]], 0.05, 0.8)), 0); }
    // body
    piece(F(ell(0.0, 0.0, 0.21, 0.078, -0.1, 48)), 1);
    // neck in three lengths, head and beak
    const neck = bez([[0.12, -0.03], [0.26, -0.06], [0.36, -0.14], [0.47, -0.13]], 24);
    segmented(F(neck), 0.062 * s, 0.034 * s, 3, 0.6);
    piece(F(circ(0.49, -0.13, 0.034, 28)), 0);
    piece(F([[0.515, -0.145], [0.7, -0.115], [0.515, -0.118]]), 0);
    dot(...T([0.497, -0.137]), 0.0075 * s);
    // near wing, raised
    wing([0.06, -0.04], [0.14, -0.34], -2.4, -1.75, 10, 0.24, 0.5, 0.22);
  };

  // ---- the motifs ===================================================================================
  const motifs = {
    cranes() {
      const mr = m * (wide ? 0.2 : 0.18), mx = X(0.5 + side * (wide ? 0.28 : 0.24)), my = Y(tall ? 0.24 : 0.28);
      moon(mx, my, mr);
      const cl = [[0.5 + side * 0.22, 0.86, 0.17], [0.5 - side * 0.36, 0.8, 0.13], [0.5 - side * 0.02, 0.1, 0.1], [0.5 + side * 0.42, 0.6, 0.1], [0.5 - side * 0.42, 0.5, 0.09]];
      for (const [u, v, s] of cl.slice(0, Math.round(3 + 2 * P.density))) cloud(X(u), Y(v), m * s * (wide ? 1.1 : 1), rng() < 0.5 ? 1 : -1);
      const s1 = m * (wide ? 0.66 : 0.6);
      crane(X(0.5 - side * (wide ? 0.3 : 0.26)), Y(tall ? 0.3 : 0.32), s1 * 0.5, -0.28 * side, side);
      crane(X(0.5 + side * 0.02), Y(0.66), s1, -0.2 * side, side);
    },

    blossom() {
      // a bough entering low from one side, rising in angular turns; twigs, blossoms and buds
      const e = side > 0 ? 0 : 1, sg = side > 0 ? 1 : -1;
      const c = wide
        ? [[X(e - sg * 0.04), Y(0.95)], [X(e + sg * 0.35), Y(0.55)], [X(e + sg * 0.45), Y(0.95)], [X(e + sg * 0.95), Y(0.3)]]
        : [[X(e - sg * 0.04), Y(0.98)], [X(e + sg * 0.5), Y(0.75)], [X(e + sg * 0.2), Y(0.4)], [X(e + sg * 0.8), Y(0.12)]];
      const branch = (c, kk) => {
      const bough = bez(c, 60).map(([x, y], i) => [x + m * 0.012 * noise.noise3(i * 0.25, 1.3, 0), y + m * 0.012 * noise.noise3(i * 0.25, 7.1, 0)]);
      const cum = cumLen(bough), tot = cum[cum.length - 1];
      const at = (t) => sub(bough, cum, Math.max(0, t * tot - 0.001), t * tot + 0.001)[0];
      const dirAt = (t) => { const a = at(Math.max(0, t - 0.01)), b = at(Math.min(1, t + 0.01)); return Math.atan2(b[1] - a[1], b[0] - a[0]); };
      const twigs = [];
      const nT = Math.round(6 * P.density * Math.sqrt(kk));
      for (let i = 0; i < nT; i++) {
        const t = 0.25 + (0.7 * i) / nT + rng.range(-0.03, 0.03), p0 = at(t), a = dirAt(t) + (i % 2 ? 1 : -1) * rng.range(0.6, 1.0), l = m * rng.range(0.14, 0.26) * (1.1 - t * 0.4);
        const k = [p0[0] + Math.cos(a) * l * 0.55, p0[1] + Math.sin(a) * l * 0.55], a2 = a + rng.range(-0.35, 0.35), p1 = [k[0] + Math.cos(a2) * l * 0.45, k[1] + Math.sin(a2) * l * 0.45];
        twigs.push({ pts: [p0, k, p1], t });
      }
      // twigs first (under the bough), each a strip; the bough in crackled lengths, tapering
      for (const tw of twigs) strip(tw.pts, m * 0.011, { len: [0.01, 0.026] });
      segmented(bough, m * 0.075 * kk, m * 0.016 * kk, 9, 1);
      // knots engraved on the bough
      for (let i = 0; i < 5; i++) { const t = rng.range(0.1, 0.8), p = at(t), a = dirAt(t) + Math.PI / 2, w = m * lerp(0.03, 0.01, t); engrave([[p[0] - Math.cos(a) * w * 0.6, p[1] - Math.sin(a) * w * 0.6], [p[0] + Math.cos(a) * w * 0.2 + Math.cos(a - 1.2) * w * 0.3, p[1] + Math.sin(a) * w * 0.2 + Math.sin(a - 1.2) * w * 0.3]], m * 0.004); }
      // blossoms: at twig ends, a few along twigs and the bough's tip
      const R0 = m * 0.062 * Math.pow(clamp(I.w / I.h, 1, 2.2), 0.35) * kk;
      for (const tw of twigs) {
        const [p0, k, p1] = tw.pts;
        blossom(p1[0], p1[1], R0 * rng.range(0.85, 1.15));
        if (rng() < 0.7) blossom(lerp(p0[0], k[0], 0.8) + rng.range(-1, 1) * R0 * 0.3, lerp(p0[1], k[1], 0.8) + rng.range(-1, 1) * R0 * 0.3, R0 * rng.range(0.6, 0.85));
        if (rng() < 0.6) bud(lerp(k[0], p1[0], 0.45), lerp(k[1], p1[1], 0.45) - R0 * 0.25, R0 * 0.24, rng.range(0, TAU));
      }
      const tip = at(1);
      blossom(tip[0], tip[1], R0 * 1.25); bud(...at(0.93), R0 * 0.3, dirAt(0.93));
      blossom(...at(0.6), R0 * 1.1); blossom(...at(0.4), R0 * 0.9, undefined, 0.8);
      // a few petals falling
      if (kk === 1) for (let i = 0; i < 4; i++) { const x = X(0.5 + side * rng.range(-0.1, 0.45)), y = Y(rng.range(0.5, 0.92)); piece(ell(x, y, R0 * 0.24, R0 * 0.2, rng.range(0, TAU), 20), 0.2); }
      };
      const ratio = I.w / I.h;
      if (ratio > 1.5) branch([[X(e - sg * 0.04), Y(-0.04)], [X(e + sg * 0.1), Y(0.3)], [X(e + sg * 0.18), Y(0.1)], [X(e + sg * 0.32), Y(0.42)]], 0.6);
      branch(c, 1);
    },

    lattice() {
      // a roundel: a ring of lozenges between two strip circles, filled with a tortoise-shell lattice;
      // a wide panel gets two smaller roundels either side
      const R0 = m * 0.46, R2 = Math.min(m * 0.3, (I.w / 2 - R0 - m * 0.09) / 2), list = [[X(0.5), Y(0.5), R0]];
      if (R2 >= m * 0.17) { const d = I.w / 2 - R2 - m * 0.05; list.push([X(0.5) - d, Y(0.5), R2], [X(0.5) + d, Y(0.5), R2]); }
      for (const [x, y, r] of list) roundel(x, y, r);
      const cx = X(0.5), cy = Y(0.5), R = list.length > 1 ? I.w : R0;
      // four small roundels at the corners of the panel
      for (const [u, v] of [[0.06, 0.08], [0.94, 0.08], [0.06, 0.92], [0.94, 0.92]]) {
        const x = X(u), y = Y(v), r = m * 0.035; if (Math.hypot(x - cx, y - cy) < R + r * 2) continue;
        for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + (i * Math.PI) / 2; piece(lens([[x, y], [x + Math.cos(a) * r, y + Math.sin(a) * r]], r * 0.6, 0.8, 0.8), 0.2); }
      }
      function roundel(cx, cy, R) {
      const Ri = R * 0.82, k = R / (m * 0.46);
      const ring = (r) => { const pts = []; for (let i = 0; i <= 180; i++) { const a = (i / 180) * TAU; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return pts; };
      strip(ring(R), m * 0.014 * k, { len: [0.012, 0.026] }); strip(ring(Ri), m * 0.012 * k, { len: [0.012, 0.026] });
      const nL = Math.max(16, Math.round(28 * k)), rm = (R + Ri) / 2, hw = (R - Ri) * 0.36;
      for (let i = 0; i < nL; i++) {
        const a = (i / nL) * TAU, ca = Math.cos(a), sa = Math.sin(a), l = TAU * rm / nL * 0.42;
        const pts = [[cx + ca * (rm - hw), cy + sa * (rm - hw)], [cx + ca * rm - sa * l, cy + sa * rm + ca * l], [cx + ca * (rm + hw), cy + sa * (rm + hw)], [cx + ca * rm + sa * l, cy + sa * rm - ca * l]];
        piece(pts, 0.3);
        const a2 = a + Math.PI / nL; piece(circ(cx + Math.cos(a2) * rm, cy + Math.sin(a2) * rm, hw * 0.28, 14), 0);
      }
      const inner = ring(Ri - m * 0.02 * k);
      clipTo(inner, () => {
        const hs = m * 0.085 * Math.sqrt(k) / P.density ** 0.5, hx = hs * Math.sqrt(3);                 // hexagon size (centre to corner)
        const corner = (x, y, k) => { const a = Math.PI / 6 + (k * Math.PI) / 3; return [x + Math.cos(a) * hs, y + Math.sin(a) * hs]; };
        const cols = Math.ceil(Ri * 2 / hx) + 2, rows = Math.ceil(Ri * 2 / (hs * 1.5)) + 2;
        const seen = new Set();
        for (let r = -rows; r <= rows; r++) for (let c = -cols; c <= cols; c++) {
          const x = cx + c * hx + (r & 1 ? hx / 2 : 0), y = cy + r * hs * 1.5;
          if (Math.hypot(x - cx, y - cy) > Ri + hs) continue;
          // edges, each once
          for (let k = 0; k < 6; k++) {
            const p = corner(x, y, k), q = corner(x, y, k + 1), key = [Math.round((p[0] + q[0]) * 5000), Math.round((p[1] + q[1]) * 5000)].join(',');
            if (seen.has(key)) continue; seen.add(key);
            const sh = 0.11; piece(tube([[lerp(p[0], q[0], sh), lerp(p[1], q[1], sh)], [lerp(p[0], q[0], 1 - sh), lerp(p[1], q[1], 1 - sh)]], m * 0.011 * Math.sqrt(k)), 0);
          }
          // nodes: a small round of shell where three edges meet
          for (const k of [0, 1]) { const p = corner(x, y, k); piece(circ(p[0], p[1], hs * 0.1, 14), 0); }
          // a flower of four petals in every cell
          const fr2 = hs * 0.42, rot = Math.PI / 4;
          if (Math.hypot(x - cx, y - cy) < Ri - hs * 0.5) {
            for (let i = 0; i < 4; i++) { const a = rot + (i * Math.PI) / 2; piece(lens([[x + Math.cos(a) * fr2 * 0.12, y + Math.sin(a) * fr2 * 0.12], [x + Math.cos(a) * fr2, y + Math.sin(a) * fr2]], fr2 * 0.55, 0.8, 0.8), 0.2); }
            dot(x, y, fr2 * 0.1);
          }
        }
      });
      // the centre: one large flower over the lattice
      const cr = m * 0.12 * k;
      g.beginPath(); trace(circ(cx, cy, cr * 1.25, 60)); g.fillStyle = '#000'; g.fill();
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; piece(lens([[cx + Math.cos(a) * cr * 0.25, cy + Math.sin(a) * cr * 0.25], [cx + Math.cos(a) * cr * 1.15, cy + Math.sin(a) * cr * 1.15]], cr * 0.42, 0.85, 0.8), 0.4); }
      piece(circ(cx, cy, cr * 0.24, 30), 1);
      }
    },

    waves() {
      // 산수: a range of peaks of crackled shell above bands of rolling waves laid in strips; a moon
      const hor = Y(tall ? 0.58 : 0.55), mr = m * 0.12;
      moon(X(0.5 + side * 0.3), Y(0.17), mr);
      cloud(X(0.5 - side * 0.28), Y(0.14), m * 0.12, side);
      // peaks: three overlapping masses, the middle one tallest; ridges engraved
      const peaks = [[0.5 - side * 0.22, 0.3, 0.34], [0.5 + side * 0.04, 0.46, 0.4], [0.5 + side * 0.3, 0.26, 0.3]];
      for (const [u, hgt, wdt] of [peaks[0], peaks[2], peaks[1]]) {
        const x0 = X(u) - I.w * wdt * 0.5, x1 = X(u) + I.w * wdt * 0.5, top = hor - m * hgt * 1.2, pts = [[x0, hor + m * 0.02]];
        for (let i = 1; i < 24; i++) { const t = i / 24, x = lerp(x0, x1, t), y = lerp(hor, top, Math.pow(Math.sin(Math.PI * t), 1.6)) + m * 0.02 * noise.noise3(t * 6, u * 9, 0.4); pts.push([x, y]); }
        pts.push([x1, hor + m * 0.02]);
        piece(pts, 1);
        const px = X(u), py = top;
        for (let k = 0; k < 5; k++) { const dx = (k - 2) * I.w * wdt * 0.12; engrave(bez([[px + dx * 0.2, py + m * 0.04 + Math.abs(dx) * 0.6], [px + dx * 0.6, py + m * 0.12], [px + dx * 1.1, hor - m * 0.08], [px + dx * 1.4, hor + m * 0.0]], 16), m * 0.004); }
      }
      // pine on a peak flank
      // waves: rows of scallops (each a crest curling over), drawn as strips
      const rows = Math.round(5 * (tall ? 1.3 : 1));
      for (let r = 0; r < rows; r++) {
        const y0 = lerp(hor + m * 0.06, I.y1 - m * 0.02, r / (rows - 1)), lam = m * lerp(0.16, 0.26, r / Math.max(1, rows - 1)), amp = lam * 0.32, ph = rng() * lam;
        for (let x = I.x0 - ph; x < I.x1 + lam; x += lam) {
          const pts = []; for (let i = 0; i <= 20; i++) { const t = i / 20, a = Math.PI * (1 - t); pts.push([x + lam * 0.5 * (1 - Math.cos(Math.PI * t)), y0 - amp * Math.sin(Math.PI * t) * (0.85 + 0.15 * t)]); }
          // the curl at the crest
          const cxp = x + lam * 0.62, cyp = y0 - amp * 0.78; for (let i = 0; i <= 10; i++) { const a = -Math.PI * 0.4 + i * 0.42; pts.push([cxp + Math.cos(a) * amp * 0.38 * (1 - i * 0.06), cyp + Math.sin(a) * amp * 0.38 * (1 - i * 0.06)]); }
          strip(pts.slice(0, 21), m * 0.012, { len: [0.01, 0.024] }); strip(pts.slice(20), m * 0.009, { len: [0.008, 0.016] });
          strip([[x + lam * 0.2, y0 - amp * 0.2], [x + lam * 0.5, y0 - amp * 0.48], [x + lam * 0.8, y0 - amp * 0.2]].map(([a, b], i) => [a, b + amp * 0.35]), m * 0.008, { len: [0.008, 0.018] });
        }
      }
    },
  };

  clipTo([[I.x0, I.y0], [I.x1, I.y0], [I.x1, I.y1], [I.x0, I.y1]], () => (motifs[P.motif] ?? motifs.cranes)());

  // ---- the inlaid frame: two snapped strips with a band of lozenges between them
  if (P.border) {
    const rr = (inset) => { const x0 = A.x0 + inset, y0 = A.y0 + inset, x1 = A.x1 - inset, y1 = A.y1 - inset; return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]; };
    strip(rr(0.004 * A.m), A.m * 0.008, { len: [0.012, 0.03] });
    strip(rr(fr * 0.86), A.m * 0.006, { len: [0.012, 0.03] });
    const mid = fr * 0.45, band = rr(mid), cum = cumLen(band), tot = cum[cum.length - 1], step = fr * 0.62, nb = Math.floor(tot / step);
    for (let i = 0; i < nb; i++) {
      const s = (i + 0.5) * (tot / nb), p = sub(band, cum, s - 0.0005, s + 0.0005)[0], q = sub(band, cum, s + 0.0005, s + 0.001)[0], a = Math.atan2(q[1] - p[1], q[0] - p[0]);
      const l = (tot / nb) * 0.4, w = fr * 0.2, ca = Math.cos(a), sa = Math.sin(a);
      piece([[p[0] - ca * l, p[1] - sa * l], [p[0] - sa * w, p[1] + ca * w], [p[0] + ca * l, p[1] + sa * l], [p[0] + sa * w, p[1] - ca * w]], 0.2);
    }
    for (const [x, y] of [[A.x0 + mid, A.y0 + mid], [A.x1 - mid, A.y0 + mid], [A.x1 - mid, A.y1 - mid], [A.x0 + mid, A.y1 - mid]]) { g.beginPath(); trace(circ(x, y, fr * 0.4, 24)); g.fillStyle = '#000'; g.fill(); for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2; piece(lens([[x, y], [x + Math.cos(a) * fr * 0.38, y + Math.sin(a) * fr * 0.38]], fr * 0.22, 0.8, 0.8), 0.2); } }
  }
  // nothing may lie on the copy
  for (const q of quiet) { g.fillStyle = '#000'; g.fillRect((q.x0 - 0.01) * su, (q.y0 - 0.01) * su, (q.x1 - q.x0 + 0.02) * su, (q.y1 - q.y0 + 0.02) * su); }

  // ---- a blurred copy of the shell, for the sunk edge / outline
  const cb = document.createElement('canvas'); cb.width = cw; cb.height = chh;
  const gb = cb.getContext('2d'); gb.fillStyle = '#000'; gb.fillRect(0, 0, cw, chh); gb.filter = `blur(${Math.max(1, 0.0022 * su)}px)`; gb.drawImage(cv, 0, 0); gb.filter = 'none';
  const mkTex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = false; t.minFilter = t.magFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; };
  const mkNear = (c) => { const t = mkTex(c); t.minFilter = t.magFilter = THREE.NearestFilter; return t; };

  const hues = (palette.colors?.length ? palette.colors : ['#f2c3d3', '#b8e5cf', '#a9c6f2']).slice(0, 4);
  while (hues.length < 4) hues.push(hues[hues.length % Math.max(1, hues.length)]);
  const fx = (ctx.focus?.x ?? 0.5) * sx, fy = (ctx.focus?.y ?? 0.5) * sy;
  scene.add(backgroundQuad(/* glsl */`
    varying vec2 vUv; uniform sampler2D tMask, tId, tBlur; uniform vec2 uAsp, uFocus, uTexel; uniform vec3 uLac, uHue[4]; uniform float uLight, uCrack, uSheen, uGloss, uSeed, uFine, uScale;
    ${GLSL_NOISE_KIT}
    ${GLSL_DITHER}
    vec3 sheenRamp(float t){
      t = fract(t) * 4.0; float k = floor(t), f = smoothstep(0.0, 1.0, fract(t));
      vec3 a = k < 0.5 ? uHue[0] : k < 1.5 ? uHue[1] : k < 2.5 ? uHue[2] : uHue[3];
      vec3 b = k < 0.5 ? uHue[1] : k < 1.5 ? uHue[2] : k < 2.5 ? uHue[3] : uHue[0];
      return mix(a, b, f);
    }
    void main(){
      vec2 p = vec2(vUv.x, 1.0 - vUv.y), q = p * uAsp;
      vec3 mk = texture2D(tMask, vUv).rgb, idt = texture2D(tId, vUv).rgb; float blur = texture2D(tBlur, vUv).r;
      float shell = smoothstep(0.25, 0.75, mk.r), pid = idt.g, crack = idt.b;
      // ---- lacquer: deep, faintly uneven, with the soft reflection of a window sweeping across the panel
      float lum = dot(uLac, vec3(0.2126, 0.7152, 0.0722));
      vec3 lac = uLac * (1.0 + 0.035 * fbm2(q * 2.2 + uSeed, 3) + 0.012 * noise2(q * 90.0));
      vec2 d = q - uFocus; float band = dot(d, normalize(vec2(1.0, -0.55)));
      float refl = exp(-pow((band + 0.12) / 0.22, 2.0)) * exp(-dot(d, d) * 1.1);
      vec3 sky = mix(vec3(1.0), uLac, 0.25);
      lac = mix(lac, sky, uGloss * refl * mix(0.09, 0.03, uLight));
      // the sunk edge: lacquer darkens a hair around every piece (a dark contour on ivory lacquer)
      float rim = clamp(blur - mk.r, 0.0, 1.0);
      lac *= 1.0 - rim * mix(0.5, 1.6, uLight);
      lac = mix(lac, uLac * 0.25, uLight * clamp(rim * 2.2, 0.0, 1.0));
      // ---- shell
      float ang = pid * 37.7, ca = cos(ang), sa = sin(ang);
      vec2 g2 = mat2(ca, -sa, sa, ca) * q * uScale;
      float growth = fbm2(vec2(g2.x * 7.0, g2.y * 70.0) + pid * 41.0, 4);                           // lamellar growth layers
      float flake = fbm2(g2 * 14.0 + pid * 9.0, 3);
      vec3 cell = cellular2(warp2(q * uScale * 26.0 + pid * 17.0, 0.4)), cell2 = cellular2(warp2(q * uScale * 64.0 - pid * 11.0, 0.5));
      float fineZone = smoothstep(-0.05, 0.25, noise2(q * uScale * 9.0 + pid * 3.0));
      float cr = crack * uCrack;
      float t = pid * 2.3 + 1.6 * growth + 0.55 * flake + 0.9 * (q.x * 0.8 - q.y * 0.6) + cr * (cell.z * 0.55 + cell2.z * 0.25 * fineZone);
      vec3 hue = sheenRamp(t);
      float silver = smoothstep(-0.1, 0.55, fbm2(g2 * 4.0 + pid * 23.0, 3) + 0.4 * (cell.z - 0.5) * cr);
      float sat = uSheen * (0.45 + 0.75 * silver);
      vec3 vivid = clamp(hue + (hue - vec3(dot(hue, vec3(0.333)))) * 1.2, 0.0, 1.2);
      vec3 pearl = mix(vec3(0.9, 0.91, 0.9), vivid, clamp(0.3 + 0.6 * sat, 0.0, 0.95));
      float br = 0.78 + 0.22 * growth + 0.12 * flake + 0.1 * (cell.z - 0.5) * cr;
      br *= mix(0.92, 1.12, smoothstep(0.0, 0.6, refl));
      pearl *= br;
      // a glint here and there where a layer catches the light
      float gl = smoothstep(0.72, 0.95, noise2(g2 * 60.0 + pid * 5.0)) * smoothstep(0.1, 0.6, silver);
      pearl += gl * 0.25;
      // ivory lacquer: the shell sits darker and richer, so it still reads as pearl
      vec3 pearlL = mix(vec3(0.985, 0.98, 0.97), hue, clamp(0.25 + 0.4 * sat, 0.0, 0.8)) * (0.93 + 0.08 * growth + 0.05 * flake) + gl * 0.15;
      pearl = mix(pearl, pearlL, uLight);
      // cracks: lacquer filling the joints between fragments
      float cw2 = fwidth(cell.y);
      float cw3 = fwidth(cell2.y);
      float line = max(1.0 - smoothstep(0.006, 0.006 + cw2 * 1.3, cell.y), (1.0 - smoothstep(0.008, 0.008 + cw3 * 1.3, cell2.y)) * fineZone * 0.6) * cr;
      vec3 crackCol = mix(mix(uLac, pearl * 0.5, 0.25), mix(pearl, vec3(0.35, 0.28, 0.24), 0.4), uLight);
      vec3 shellCol = mix(pearl, crackCol, line * 0.9);
      // the polished coat over everything
      vec3 col = mix(lac, shellCol, shell);
      col += uGloss * refl * 0.035 * (1.0 - uLight);
      col = clamp(col, 0.0, 1.0);
      gl_FragColor = vec4(mix(col / 12.92, pow((col + 0.055) / 1.055, vec3(2.4)), step(0.04045, col)), 1.0);
      #include <colorspace_fragment>
      gl_FragColor.rgb += ditherNoise(gl_FragCoord.xy);
    }`, {
    tMask: { value: mkTex(cv) }, tId: { value: mkNear(cv) }, tBlur: { value: mkTex(cb) }, uAsp: { value: new THREE.Vector2(sx, sy) }, uFocus: { value: new THREE.Vector2(fx, fy) },
    uTexel: { value: new THREE.Vector2(1 / cw, 1 / chh) }, uLac: { value: lac }, uHue: { value: hues.map((h) => srgbVec(h)) },
    uLight: { value: light ? 1 : 0 }, uCrack: { value: P.crackle }, uSheen: { value: P.sheen }, uGloss: { value: P.gloss }, uSeed: { value: (seed % 89) * 0.41 },
    uFine: { value: Math.min(1, Math.min(W, H) / 1900) }, uScale: { value: 1 / Math.max(0.4, A.m) },
  }));
  ctx.frame({ radius: 1, fov: 30, dir: [0, 0, 1] });
}
