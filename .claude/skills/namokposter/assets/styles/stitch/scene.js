// Embroidery on cloth — every stitch is a real piece of thread: a short capsule of floss with a
// rounded profile, a twist, ends that dive into the cloth, a sheen that depends on which way it
// runs, and a shadow on the weave beneath. Shapes are filled the way a needle fills them: satin
// stitch laid side by side across a petal, long-and-short stitch where a span is too long (the
// colour shading from the heart of the flower to its tip), fishbone stitch for leaves, stem stitch
// for stalks, French knots, running stitch for outlines — or, with stitch = "cross", the same
// design counted out in cross stitches on an even-weave grid.
//
// Palette: bg = the cloth (copy sits on it) · colors = the floss, used by role (greenest for leaves,
// warmest for petals …) · ink, accent = type.
import { backgroundQuad, srgbVec, GLSL_NOISE_KIT, GLSL_DITHER } from '/skill/assets/web/scene-lib.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const TAU = Math.PI * 2;
const quad = (p0, p1, p2, n = 12) => { const o = []; for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; o.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]); } return o; };
const inPoly = (poly, x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };

// counted patterns for the border sampler: '.' = bare cloth, letters = floss
const HEART = ['.aa.aa.', 'aaaaaaa', 'aaaaaaa', '.aaaaa.', '..aaa..', '...a...'];
const TULIP = ['.a...a.', '.aa.aa.', '.aaaaa.', '.aaaaa.', '..aaa..', '...b...', '.b.b.b.', '..bbb..', '...b...'];
const PINE = ['...b...', '..bbb..', '.bbbbb.', '..bbb..', '.bbbbb.', 'bbbbbbb', '...c...', '...c...'];
const KEY = ['aaaaa.', 'a.....', 'a.aaa.', 'a...a.', 'aaaaa.'];

export default function build(ctx) {
  const { THREE, scene, palette, params, aspect, seed, rng, width: W, height: H } = ctx;
  const sx = Math.max(aspect, 1), sy = Math.max(1 / aspect, 1), short = Math.min(W, H);
  const motif = ['flowers', 'sampler', 'borders'].includes(params.motif) ? params.motif : 'flowers';
  const cross = params.stitch === 'cross' || motif === 'borders';
  const P = { thread: clamp(params.thread ?? 1, 0.6, 1.8), sheen: clamp(params.sheen ?? 1, 0, 2), weave: clamp(params.weave ?? 1, 0, 2), count: clamp(params.count ?? 1, 0.6, 1.6) };
  const fx = ctx.focus.x * sx, fy = ctx.focus.y * sy, A = clamp(ctx.artSize ?? 0.7, 0.3, 1.1), R = 0.5 * A;
  const [ax0, ay0, ax1, ay1] = ctx.artRect || [0, 0, 1, 1], aw = (ax1 - ax0) * sx, ah = (ay1 - ay0) * sy;

  // ---- floss by role
  const v3 = (hex) => { const v = srgbVec(hex); return [v.x, v.y, v.z]; };
  const cloth = v3(palette.bg), dark = lum(cloth) < 0.3;
  let F = palette.colors.map(v3).filter((c) => Math.hypot(c[0] - cloth[0], c[1] - cloth[1], c[2] - cloth[2]) > 0.14); if (F.length < 2) F = [v3(palette.accent), v3(palette.ink)];
  const greenness = (c) => c[1] - Math.max(c[0], c[2]) + 0.25 * (c[1] - c[0]), warmth = (c) => c[0] - c[2] + 0.4 * (c[0] - c[1]);
  const byGreen = [...F].sort((a, b) => greenness(b) - greenness(a)), g1 = byGreen[0], hasGreen = greenness(g1) > 0.02;
  const g2raw = byGreen[1] && greenness(byGreen[1]) > 0.02 ? byGreen[1] : null;
  const shade = (c, k) => (k >= 0 ? mix3(c, dark ? [0.02, 0.03, 0.06] : [0.1, 0.07, 0.12], k) : mix3(c, [1, 0.98, 0.92], -k));
  const leafA = hasGreen ? (g2raw && lum(g2raw) < lum(g1) ? g2raw : g1) : shade(F[0], 0.3), leafB = hasGreen ? (g2raw ? (leafA === g1 ? g2raw : g1) : shade(g1, -0.35)) : shade(F[0], -0.3);
  let petals = F.filter((c) => c !== g1 && c !== g2raw).sort((a, b) => warmth(b) - warmth(a)); if (!petals.length) petals = [F[0]];
  const pet = (i) => petals[i % petals.length], lightest = [...F].sort((a, b) => lum(b) - lum(a))[0], darkest = [...F].sort((a, b) => lum(a) - lum(b))[0];
  const gold = [...F].sort((a, b) => (b[0] + b[1] - 1.6 * b[2]) - (a[0] + a[1] - 1.6 * a[2]))[0];
  const jit = (c, k = 1) => { const s = 1 + rng.range(-0.055, 0.055) * k; return [clamp(c[0] * s, 0, 1), clamp(c[1] * s, 0, 1), clamp(c[2] * s, 0, 1)]; };

  // ---- the needle: every call adds thread. Groups are flushed with their shadow under them.
  const tw = 0.0041 * P.thread * clamp(0.72 + 0.4 * A, 0.8, 1.12), S = []; let group = [];
  const thread = (x0, y0, x1, y1, col, wd = tw, kind = 0) => group.push([x0, y0, x1, y1, wd, col[0], col[1], col[2], kind, rng()]);
  const flush = (shadow = 1) => {
    if (shadow > 0) for (const s of group) S.push([s[0] + s[4] * 0.3, s[1] + s[4] * 0.42, s[2] + s[4] * 0.3, s[3] + s[4] * 0.42, s[4] * 1.35, 0, 0, 0, 2, shadow]);
    for (const s of group) S.push(s); group = [];
  };
  // counted work: cells of an even-weave grid, keyed "i,j"
  const gc = motif === 'borders' ? 0 : clamp(A / 62, 0.0075, 0.017) / P.count, cells = new Map();
  const cell = (x, y, col) => cells.set(`${Math.round((x - fx) / gc)},${Math.round((y - fy) / gc)}`, col);

  const pen = {
    // satin / long-and-short fill of a polygon with threads running at angle `ang`
    fill(poly, ang, col, { maxLen = 0.07 * (0.6 + 0.5 * A), grad = null, pitch = tw * 0.8, over = tw * 0.16, shadow = 1 } = {}) {
      if (cross) {
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const [x, y] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        for (let j = Math.floor((y0 - fy) / gc); j <= Math.ceil((y1 - fy) / gc); j++) for (let i = Math.floor((x0 - fx) / gc); i <= Math.ceil((x1 - fx) / gc); i++) { const x = fx + i * gc, y = fy + j * gc; if (inPoly(poly, x, y)) cells.set(`${i},${j}`, grad ? grad(x, y) : col); }
        return;
      }
      const cs = Math.cos(ang), sn = Math.sin(ang), Rp = poly.map(([x, y]) => [x * cs + y * sn, -x * sn + y * cs]);
      let y0 = 1e9, y1 = -1e9; for (const p of Rp) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
      const n = Math.max(1, Math.round((y1 - y0) / pitch)), dy = (y1 - y0) / n;
      for (let k = 0; k < n; k++) {
        const y = y0 + (k + 0.5) * dy, xs = [];
        for (let i = 0; i < Rp.length; i++) { const a = Rp[i], b = Rp[(i + 1) % Rp.length]; if ((a[1] <= y) !== (b[1] <= y)) xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0])); }
        xs.sort((p, q) => p - q);
        for (let i = 0; i + 1 < xs.length; i += 2) {
          const xa = xs[i] - over * rng.range(0.2, 1.7), xb = xs[i + 1] + over * rng.range(0.2, 1.7), L = xb - xa; if (L < tw * 0.5) continue;
          const m = Math.max(1, Math.ceil(L / maxLen)), brk = [xa];
          for (let j = 1; j < m; j++) brk.push(xa + L * clamp((j + (k % 2 ? 0.27 : -0.23) + rng.range(-0.17, 0.17)) / m, 0.06, 0.94));
          brk.push(xb);
          for (let j = 0; j < m; j++) {
            const a = brk[j] - (j ? tw * 0.7 : 0), b = brk[j + 1], mx = (a + b) / 2, c = grad ? grad(mx * cs - y * sn, mx * sn + y * cs) : col;
            thread(a * cs - y * sn, a * sn + y * cs, b * cs - y * sn, b * sn + y * cs, jit(c));
          }
        }
      }
      flush(shadow);
    },
    // stem stitch: overlapping slanted stitches that read as a twisted cord
    stem(path, col, wd = tw * 1.15) {
      if (cross) { for (let i = 0; i < path.length - 1; i++) for (let t = 0; t < 1; t += 0.25) cell(lerp(path[i][0], path[i + 1][0], t), lerp(path[i][1], path[i + 1][1], t), col); return; }
      const pts = resample(path, wd * 1.5);
      for (let i = 0; i + 2 < pts.length; i++) { const a = pts[i], b = pts[i + 2], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = (-(b[1] - a[1]) / l) * wd * 0.22, ny = ((b[0] - a[0]) / l) * wd * 0.22; thread(a[0] - nx, a[1] - ny, b[0] + nx, b[1] + ny, jit(col), wd); }
      flush(1);
    },
    // running stitch: dashes with the thread out of sight between them; gap 0 = back stitch
    run(path, col, { len = tw * 3.4, gap = tw * 2.2, wd = tw * 0.95 } = {}) {
      const pts = resample(path, len + gap), t = len / (len + gap);
      for (let i = 0; i + 1 < pts.length; i++) { const a = pts[i], b = pts[i + 1]; thread(a[0], a[1], lerp(a[0], b[0], t), lerp(a[1], b[1], t), jit(col), wd); }
      flush(0.7);
    },
    knot(x, y, col, wd = tw * 2.3) { if (cross) { cell(x, y, col); return; } thread(x, y, x, y, jit(col, 1.5), wd, 1); flush(1.2); },
    straight(x0, y0, x1, y1, col, wd = tw) { thread(x0, y0, x1, y1, jit(col), wd); },
    done(shadow = 1) { flush(shadow); },
  };
  function resample(path, step) {
    const out = [path[0]]; let carry = 0;
    for (let i = 0; i + 1 < path.length; i++) {
      const a = path[i], b = path[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]); let d = step - carry;
      while (d <= l) { out.push([lerp(a[0], b[0], d / l), lerp(a[1], b[1], d / l)]); d += step; }
      carry = l - (d - step);
    }
    return out;
  }
  const rot = (pts, c, a) => { const cs = Math.cos(a), sn = Math.sin(a); return pts.map(([x, y]) => [c[0] + x * cs - y * sn, c[1] + x * sn + y * cs]); };

  // ---- shapes shared by the motifs
  // a leaf worked in fishbone stitch: two halves slanting towards the tip, a rib of stem stitch
  const leaf = (base, ang, len, wid, cA = leafA, cB = leafB) => {
    const n = 12, L = [], Rr = [], mid = [];
    for (let i = 0; i <= n; i++) { const t = i / n, hw = wid * 0.5 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.85), bend = 0.12 * len * Math.sin(Math.PI * t); L.push([t * len, -hw + bend]); Rr.push([t * len, hw + bend]); mid.push([t * len, bend]); }
    const lp = rot([...mid, ...[...L].reverse()], base, ang), rp = rot([...mid, ...[...Rr].reverse()], base, ang);
    pen.fill(lp, ang - 0.62, cA, { maxLen: 1 }); pen.fill(rp, ang + 0.62, cB, { maxLen: 1 });
    if (!cross) pen.run(rot(mid.slice(0, -1), base, ang), shade(cA, 0.3), { gap: 0, len: tw * 4, wd: tw * 0.7 });
  };
  // a flower: petals in long-and-short stitch shading from the heart outwards, French knots in the middle
  const flower = (c, Lp, np, col, a0, knotCol) => {
    const r0 = Lp * 0.16, Wp = Lp * (np <= 5 ? 0.74 : 0.6), inner = shade(col, 0.34), tip = shade(col, -0.3);
    const grad = (x, y) => { const d = (Math.hypot(x - c[0], y - c[1]) - r0) / (Lp - r0); return d < 0.45 ? mix3(inner, col, d / 0.45) : mix3(col, tip, (d - 0.45) / 0.55); };
    const order = [...Array(np).keys()].filter((k) => k % 2 === 0).concat([...Array(np).keys()].filter((k) => k % 2));
    for (const k of order) {
      const a = a0 + k * (TAU / np) + rng.range(-0.05, 0.05), n = 14, pts = [], back = [];        // every other petal first: the rest lie over them
      for (let i = 0; i <= n; i++) { const t = i / n, hw = Wp * 0.5 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72)), 0.7); pts.push([r0 + (Lp - r0) * t, -hw]); back.push([r0 + (Lp - r0) * t, hw]); }
      pen.fill(rot([...pts, ...back.reverse()], c, a), a, col, { grad, maxLen: Lp * 0.42 });
    }
    const nk = cross ? 1 : clamp(Math.round(Lp / tw / 4), 5, 14);
    for (let i = 0; i < nk; i++) { const a = i * 2.4, r = r0 * 1.15 * Math.sqrt((i + 0.3) / nk); pen.knot(c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r, i % 3 ? knotCol : shade(knotCol, 0.25)); }
  };

  let motifGrid = 0;                                                       // cell size of the counted grid (borders set their own)
  if (motif === 'flowers') {
    // ---- a spray: three blooms, two buds, leaves along curving stems, a sprig of berries
    const m = rng() < 0.5 ? -1 : 1, B = [fx + 0.06 * R * m, fy + 0.98 * R];
    const spots = [
      { p: [fx - 0.02 * R * m, fy - 0.3 * R], L: 0.36 * R, np: 5, col: pet(0), bend: 0.16 },
      { p: [fx - 0.56 * R * m, fy + 0.16 * R], L: 0.25 * R, np: 5, col: pet(1), bend: -0.3 },
      { p: [fx + 0.55 * R * m, fy + 0.02 * R], L: 0.28 * R, np: 6, col: pet(2), bend: 0.34 },
      { p: [fx + 0.34 * R * m, fy - 0.8 * R], L: 0, col: pet(1), bend: 0.3 },
      { p: [fx - 0.6 * R * m, fy - 0.52 * R], L: 0, col: pet(0), bend: -0.38 },
    ].map((s) => ({ ...s, p: [s.p[0] + rng.range(-0.03, 0.03) * R, s.p[1] + rng.range(-0.03, 0.03) * R] }));
    const stems = spots.map((s) => { const mx = (B[0] + s.p[0]) / 2, my = (B[1] + s.p[1]) / 2, dx = s.p[0] - B[0], dy = s.p[1] - B[1]; return quad(B, [mx - dy * s.bend * m, my + dx * s.bend * m], s.p, 22); });
    stems.forEach((st) => pen.stem(st, shade(leafA, 0.12)));
    stems.forEach((st, i) => {
      const s = spots[i], ks = s.L ? [7, 12, 16] : [9, 14];
      ks.forEach((k, j) => { const a = st[k], b = st[k + 1], dir = Math.atan2(b[1] - a[1], b[0] - a[0]), side = (j + i) % 2 ? 1 : -1; leaf(a, dir + side * rng.range(0.7, 1.05), R * rng.range(0.24, 0.33) * (s.L ? 1 : 0.8), R * rng.range(0.1, 0.13)); });
    });
    // a sprig of berries on the open side
    const sp = quad(stems[0][8], [fx + 0.5 * R * m, fy + 0.5 * R], [fx + 0.8 * R * m, fy + 0.52 * R], 14);
    pen.run(sp, shade(leafA, 0.1), { gap: 0, len: tw * 4, wd: tw * 0.8 });
    for (let i = 4; i < sp.length; i += 2) { const s = i % 4 ? 1 : -1; pen.knot(sp[i][0] + s * tw * 2.4, sp[i][1] - tw * 2.6, pet(2 + (i % 3 === 0 ? 1 : 0)), tw * 2.6); }
    for (const s of spots) {
      if (s.L) flower(s.p, s.L, s.np, s.col, rng.range(0, TAU), s.col === gold ? shade(darkest, 0) : gold);
      else {
        // a bud: three small petals in a green cup
        const st = stems[spots.indexOf(s)], a = Math.atan2(st[22][1] - st[20][1], st[22][0] - st[20][0]), bl = 0.15 * R;
        for (const [da, k] of [[-0.42, 0.85], [0.42, 0.85], [0, 1]]) { const n = 10, pts = [], back = []; for (let i = 0; i <= n; i++) { const t = i / n, hw = bl * 0.24 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.8); pts.push([bl * k * t, -hw]); back.push([bl * k * t, hw]); } pen.fill(rot([...pts, ...back.reverse()], s.p, a + da), a + da, da ? shade(s.col, 0.2) : s.col, { maxLen: 1 }); }
        leaf([s.p[0] - Math.cos(a) * bl * 0.1, s.p[1] - Math.sin(a) * bl * 0.1], a - 0.75, bl * 0.62, bl * 0.24); leaf([s.p[0] - Math.cos(a) * bl * 0.1, s.p[1] - Math.sin(a) * bl * 0.1], a + 0.75, bl * 0.62, bl * 0.24);
      }
    }
  } else if (motif === 'sampler') {
    // ---- a little landscape in a running-stitch frame: moon, two peaks, hills, a house, pines
    let fw = aw * 0.9, fh = ah * 0.9; const asp = clamp(fw / fh, 0.74, 1.7); if (fw / fh > asp) fw = fh * asp; else fh = fw / asp;
    const X = (u) => fx - fw / 2 + u * fw, Y = (v) => fy - fh / 2 + v * fh, md = Math.min(fw, fh), wide = fw / fh;
    const sky = F.find((c) => c !== g1 && c !== g2raw && warmth(c) < 0) ?? darkest, snow = lum(lightest) > 0.75 ? lightest : [0.95, 0.94, 0.9], wallC = dark ? lightest : snow, roofC = pet(0), trunk = shade(pet(0), 0.55);
    // moon: a satin disc, nothing radiating from it
    const mr = 0.085 * md, mc = [X(0.76), Y(0.2)], disc = []; for (let i = 0; i < 36; i++) disc.push([mc[0] + Math.cos((i / 36) * TAU) * mr, mc[1] + Math.sin((i / 36) * TAU) * mr]);
    pen.fill(disc, 0.25, gold, { maxLen: 1 });
    // peaks: a lit face and a shaded face, stitches running down each slope; snow at the top
    const peak = (u0, u1, ua, va, vb) => {
      const a = [X(ua), Y(va)], l = [X(u0), Y(vb)], r = [X(u1), Y(vb)], f = [X(ua + (u1 - ua) * 0.22), Y(vb)];
      pen.fill([l, a, f], Math.atan2(a[1] - l[1], a[0] - l[0]), shade(sky, -0.32), { maxLen: md * 0.16 });
      pen.fill([a, r, f], Math.atan2(r[1] - a[1], r[0] - a[0]), shade(sky, 0.12), { maxLen: md * 0.16 });
      const k = 0.26, sl = [lerp(a[0], l[0], k), lerp(a[1], l[1], k)], sr = [lerp(a[0], r[0], k), lerp(a[1], r[1], k)], zig = [];
      for (let i = 1; i < 6; i++) zig.push([lerp(sr[0], sl[0], i / 6), lerp(sr[1], sl[1], i / 6) + (i % 2 ? 1 : -0.6) * md * 0.022]);
      pen.fill([sl, a, sr, ...zig], Math.PI / 2, snow, { maxLen: 1 });
    };
    peak(0.03, 0.66, 0.34, 0.2, 0.66); peak(0.4, 0.97, 0.66, 0.33, 0.66);
    // hills in long-and-short stitch, two greens
    const hill = (v0, amp, ph, c1, c2, ang) => {
      const top = (u) => v0 - amp * Math.sin(u * Math.PI * 1.15 + ph), pts = []; for (let i = 0; i <= 24; i++) pts.push([X(i / 24), Y(top(i / 24))]);
      pen.fill([...pts, [X(1), Y(0.97)], [X(0), Y(0.97)]], ang, c1, { grad: (x, y) => mix3(c1, c2, clamp((y - Y(v0 - amp)) / (fh * 0.2), 0, 1)), maxLen: md * 0.11 });
      return top;
    };
    const h1 = hill(0.64, 0.045, 0.4, leafB, shade(leafB, 0.15), 0.12); hill(0.8, 0.04, 2.2, leafA, shade(leafA, 0.22), -0.1);
    // pines: tiers in fishbone, a short trunk
    const pine = (u, v, s) => {
      const x = X(u), y = Y(v), hgt = s * md;
      pen.fill([[x - hgt * 0.05, y], [x + hgt * 0.05, y], [x + hgt * 0.05, y - hgt * 0.22], [x - hgt * 0.05, y - hgt * 0.22]], Math.PI / 2, trunk, { maxLen: 1 });
      for (let t = 0; t < 3; t++) { const yb = y - hgt * (0.16 + t * 0.24), yt = yb - hgt * 0.4, hw = hgt * (0.3 - t * 0.065); pen.fill([[x - hw, yb], [x, yt], [x, yb]], -0.95, shade(leafA, 0.3), { maxLen: 1 }); pen.fill([[x, yt], [x + hw, yb], [x, yb]], 0.95, shade(leafA, 0.12), { maxLen: 1 }); }
    };
    pine(0.7, 0.71, 0.3); pine(0.82, 0.74, 0.22); if (wide > 1.25) pine(0.1, 0.72, 0.24);
    // the house: wall, door and window in upright satin, a roof stitched down its slope, a wisp of smoke
    const hx = X(0.3), hy = Y(0.74), hw2 = 0.105 * md, hh = 0.12 * md;
    pen.fill([[hx - hw2, hy], [hx + hw2, hy], [hx + hw2, hy - hh], [hx - hw2, hy - hh]], Math.PI / 2, wallC, { maxLen: 1 });
    pen.fill([[hx - hw2 * 1.25, hy - hh], [hx, hy - hh * 1.95], [hx, hy - hh]], -0.65, roofC, { maxLen: 1 }); pen.fill([[hx, hy - hh * 1.95], [hx + hw2 * 1.25, hy - hh], [hx, hy - hh]], 0.65, shade(roofC, 0.2), { maxLen: 1 });
    pen.fill([[hx - hw2 * 0.6, hy], [hx - hw2 * 0.15, hy], [hx - hw2 * 0.15, hy - hh * 0.62], [hx - hw2 * 0.6, hy - hh * 0.62]], Math.PI / 2, trunk, { maxLen: 1, shadow: 0.5 });
    pen.fill([[hx + hw2 * 0.2, hy - hh * 0.3], [hx + hw2 * 0.7, hy - hh * 0.3], [hx + hw2 * 0.7, hy - hh * 0.72], [hx + hw2 * 0.2, hy - hh * 0.72]], 0, gold, { maxLen: 1, shadow: 0.5 });
    if (!cross) {
      const sm = []; for (let i = 0; i <= 16; i++) { const t = i / 16; sm.push([hx + hw2 * 0.6 + Math.sin(t * 7) * md * 0.018 * (1 + t), hy - hh * 1.75 - t * md * 0.16]); }
      pen.run(sm, shade(sky, -0.2), { len: tw * 2.6, gap: tw * 2 });
      // a path of running stitch from the door, grass ticks and knot flowers in the foreground, two birds
      pen.run(quad([hx - hw2 * 0.38, hy + tw], [hx - hw2 * 1.5, Y(0.86)], [X(0.14), Y(0.95)], 16), wallC, { len: tw * 3, gap: tw * 2.4 });
      for (let i = 0; i < 26 * wide; i++) { const u = rng.range(0.04, 0.96), v = rng.range(0.84, 0.95), x = X(u), y = Y(v); if (Math.abs(u - 0.2) < 0.1 && v > 0.8) continue; if (i % 3 === 0) pen.knot(x, y, pet(i % 2 ? 1 : 0), tw * 2.1); else { pen.straight(x, y, x + rng.range(-0.4, 0.4) * tw * 3, y - tw * rng.range(3, 5), shade(leafB, -0.2), tw * 0.8); pen.done(0.6); } }
      for (const [u, v, s] of [[0.5, 0.16, 1], [0.58, 0.22, 0.75]]) { const x = X(u), y = Y(v), d = md * 0.03 * s; pen.straight(x - d, y - d * 0.5, x, y, darkest, tw * 0.8); pen.straight(x, y, x + d, y - d * 0.6, darkest, tw * 0.8); pen.done(0.5); }
    }
    // the frame
    const fr = [], rr = md * 0.05, cn = [[X(0) + rr, Y(0) + rr, Math.PI], [X(1) - rr, Y(0) + rr, -Math.PI / 2], [X(1) - rr, Y(1) - rr, 0], [X(0) + rr, Y(1) - rr, Math.PI / 2]];
    for (const [cxx, cyy, a0] of cn) for (let i = 0; i <= 8; i++) fr.push([cxx + Math.cos(a0 + (i / 8) * Math.PI / 2) * rr * 1.6, cyy + Math.sin(a0 + (i / 8) * Math.PI / 2) * rr * 1.6]);
    fr.push(fr[0]);
    pen.run(fr, pet(0), { len: tw * 3.6, gap: tw * 2.4, wd: tw });
  } else {
    // ---- borders: bands of counted cross stitch, mirrored about a wide middle band
    const tall = ah / aw > 0.72, seq = tall
      ? [['line', 1, 'a'], ['gap', 1], ['zig', 5, 'b'], ['gap', 1], ['line', 1, 'a'], ['gap', 2], ['row', HEART, 9], ['gap', 2], ['diamond', 15], ['gap', 2], ['row', TULIP, 9], ['gap', 2], ['line', 1, 'a'], ['gap', 1], ['zig', 5, 'b'], ['gap', 1], ['line', 1, 'a']]
      : [['line', 1, 'a'], ['gap', 1], ['row', KEY, 6], ['gap', 1], ['line', 1, 'a'], ['gap', 2], ['diamond', 15], ['gap', 2], ['line', 1, 'a'], ['gap', 1], ['zig', 5, 'b'], ['gap', 1], ['line', 1, 'a']];
    const rows = seq.reduce((s, b) => s + (Array.isArray(b[1]) ? b[1].length : b[1]), 0), g = Math.min((ah * 0.92) / rows, (aw * 0.94) / 44) / P.count, half = Math.floor((aw * 0.94) / g / 2);
    const fl = { a: pet(0), b: hasGreen ? leafA : pet(1), c: gold === pet(0) ? pet(1) : gold, d: darkest };
    const put = (i, j, k) => cells.set(`${i},${j}`, fl[k]);
    let j0 = -Math.floor(rows / 2);
    for (const b of seq) {
      const kind = b[0], hgt = Array.isArray(b[1]) ? b[1].length : b[1];
      for (let i = -half; i <= half; i++) for (let y = 0; y < hgt; y++) {
        if (kind === 'line') put(i, j0 + y, b[2]);
        else if (kind === 'zig') { const p = 8, x = ((i % p) + p) % p, yy = Math.round(Math.abs(x - p / 2)); if (y === yy) put(i, j0 + y, b[2]); else if (y === yy + 1 && yy < hgt - 1) put(i, j0 + y, 'c'); }
        else if (kind === 'row') { const pat = b[1], per = b[2], pw = pat[0].length, x = (((i + Math.floor(pw / 2)) % per) + per) % per; if (x < pw && pat[y][x] !== '.') put(i, j0 + y, pat[y][x]); }
        else if (kind === 'diamond') { const p = 16, x = ((i % p) + p) % p, d = Math.abs(x - p / 2) + Math.abs(y - 7), d2 = Math.abs((((i + p / 2) % p) + p) % p - p / 2) + Math.abs(y - 7); if (d === 7 || d === 6) put(i, j0 + y, 'a'); else if (d <= 3 && d >= 2) put(i, j0 + y, 'c'); else if (d === 0) put(i, j0 + y, 'd'); else if (d2 <= 2 && d2 >= 1) put(i, j0 + y, 'b'); }
      }
      j0 += hgt;
    }
    motifGrid = g;
  }
  const G = motifGrid || gc;
  if (cells.size) {
    const hw = G * 0.44, wd = G * 0.33;
    for (const [key, col] of cells) {
      const [i, j] = key.split(',').map(Number), x = fx + i * G, y = fy + j * G;
      thread(x - hw, y + hw, x + hw, y - hw, jit(col), wd); thread(x - hw, y - hw, x + hw, y + hw, jit(col), wd); flush(0.8);
    }
  }

  // ---- the cloth
  const pitch = cross ? G : 1 / 175;
  scene.add(backgroundQuad(/* glsl */`
    varying vec2 vUv; uniform vec2 uAsp, uOrg; uniform vec3 uCloth; uniform float uShort, uPitch, uAida, uWeave, uSeed, uDark;
    ${GLSL_NOISE_KIT}
    ${GLSL_DITHER}
    void main(){
      vec2 p = vec2(vUv.x, 1.0 - vUv.y), q = p * uAsp;
      vec2 g = (q - uOrg) / uPitch + 0.5, id = floor(g), f = g - id - 0.5;
      float fw = clamp(1.0 / (uPitch * uShort), 0.0, 1.0), fade = uWeave * smoothstep(0.55, 0.22, fw);   // weave too fine for the pixel grid → plain cloth
      float over = mod(id.x + id.y, 2.0);                                   // which thread is on top in this cell
      vec2 a = over < 0.5 ? f : f.yx;                                       // a.x across the top thread, a.y along it
      float tid = over < 0.5 ? id.x : id.y + 57.0, slub = 0.5 + 0.5 * noise2(vec2(tid * 3.7, (over < 0.5 ? g.y : g.x) * 0.11));
      float across = cos(a.x * 3.1416 * mix(1.0, 0.86, slub)), along = cos(a.y * 3.1416);
      float body = max(across, 0.0) * (0.55 + 0.45 * along);
      float hole = smoothstep(0.3, 0.5, abs(f.x)) * smoothstep(0.3, 0.5, abs(f.y));
      float shadeK = mix(1.0, 0.86 + 0.2 * body - mix(0.1, 0.34, uAida) * hole + 0.035 * (hash21(vec2(tid, 3.0)) - 0.5), fade);
      shadeK *= 1.0 + 0.022 * fbm2(q * vec2(3.0, 90.0) + uSeed, 2) + 0.022 * fbm2(q * vec2(90.0, 3.0) - uSeed, 2);      // uneven yarn, in both directions
      shadeK *= 1.0 + 0.03 * noise2(q * 1.6 + uSeed);
      vec3 col = uCloth * shadeK * mix(1.03, 1.1, uDark);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0) + ditherNoise(gl_FragCoord.xy), 1.0);
    }`, {
    uAsp: { value: new THREE.Vector2(sx, sy) }, uOrg: { value: new THREE.Vector2(fx + (cross ? G / 2 : 0), fy + (cross ? G / 2 : 0)) }, uCloth: { value: new THREE.Vector3(...cloth) }, uShort: { value: short },
    uPitch: { value: pitch }, uAida: { value: cross ? 1 : 0 }, uWeave: { value: P.weave }, uSeed: { value: (seed % 71) * 0.83 }, uDark: { value: dark ? 1 : 0 },
  }));

  // ---- all the thread, as one mesh of quads drawn in sewing order
  const n = S.length, pos = new Float32Array(n * 12), loc = new Float32Array(n * 8), dim = new Float32Array(n * 12), colr = new Float32Array(n * 12), misc = new Float32Array(n * 16), idx = new Uint32Array(n * 6);
  const aaPad = 1.5 / short;
  S.forEach((s, i) => {
    const [x0, y0, x1, y1, wd, r, g, b, kind, sd] = s, L = Math.hypot(x1 - x0, y1 - y0), dx = L > 1e-6 ? (x1 - x0) / L : 1, dy = L > 1e-6 ? (y1 - y0) / L : 0, hw = wd / 2, pad = hw * (kind === 2 ? 1.3 : 1) + aaPad;
    [[-pad, -pad], [L + pad, -pad], [L + pad, pad], [-pad, pad]].forEach(([lx, ly], k) => {
      const v = i * 4 + k, x = x0 + dx * lx - dy * ly, y = y0 + dy * lx + dx * ly;
      pos.set([(x / sx) * 2 - 1, 1 - (y / sy) * 2, 0], v * 3); loc.set([lx, ly], v * 2); dim.set([L, hw, kind], v * 3); colr.set([r, g, b], v * 3); misc.set([dx, dy, sd, 0], v * 4);
    });
    idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aLoc', new THREE.BufferAttribute(loc, 2)); geo.setAttribute('aDim', new THREE.BufferAttribute(dim, 3));
  geo.setAttribute('aCol', new THREE.BufferAttribute(colr, 3)); geo.setAttribute('aMisc', new THREE.BufferAttribute(misc, 4)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uShort: { value: short }, uSheen: { value: P.sheen }, uShadow: { value: new THREE.Vector3(...(dark ? [0, 0, 0.01] : mix3(cloth, [0.1, 0.06, 0.1], 0.82))) }, uDark: { value: dark ? 1 : 0 } },
    vertexShader: /* glsl */`
      attribute vec2 aLoc; attribute vec3 aDim, aCol; attribute vec4 aMisc; varying vec2 vLoc; varying vec3 vDim, vCol; varying vec4 vMisc;
      void main(){ vLoc = aLoc; vDim = aDim; vCol = aCol; vMisc = aMisc; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */`
      varying vec2 vLoc; varying vec3 vDim, vCol; varying vec4 vMisc; uniform float uShort, uSheen, uDark; uniform vec3 uShadow;
      void main(){
        float L = vDim.x, hw = vDim.y, kind = vDim.z, aa = 0.7 / uShort;
        float dxe = max(max(-vLoc.x, vLoc.x - L), 0.0), d = length(vec2(dxe, vLoc.y)) - hw;
        if (kind > 1.5) {                                                   // shadow on the cloth and on the stitches beneath
          float a = smoothstep(hw * 0.45, -hw * 0.5, d) * 0.3 * vMisc.z * mix(1.0, 1.5, uDark);
          gl_FragColor = vec4(uShadow, a); return;
        }
        float cov = smoothstep(aa, -aa, d); if (cov < 0.003) discard;
        float ac = clamp(vLoc.y / hw, -1.0, 1.0), cyl = sqrt(max(0.0, 1.0 - ac * ac));
        vec3 col = vCol; vec2 Ld = normalize(vec2(-0.55, -0.83));
        if (kind > 0.5) {                                                   // French knot: a small wound bead
          float r = clamp(length(vLoc) / hw, 0.0, 1.0), nz = sqrt(1.0 - r * r), ang = atan(vLoc.y, vLoc.x);
          float wind = 0.5 + 0.5 * sin(ang * 2.0 + r * 8.0 + vMisc.z * 6.28);
          col *= (0.56 + 0.5 * nz) * (0.9 + 0.16 * wind);
          col += 0.2 * uSheen * pow(max(0.0, 1.0 - length(vLoc / hw - Ld * 0.4) * 1.2), 2.0);
        } else {
          float t = clamp(vLoc.x / max(L, 1e-5), 0.0, 1.0), endK = smoothstep(-hw, hw * 2.4, min(vLoc.x, L - vLoc.x));
          float twist = sin(vLoc.x / hw * 1.9 + ac * 2.6 + vMisc.z * 6.28), ply = 1.0 - 0.1 * smoothstep(0.75, 1.0, abs(twist));
          col *= (0.6 + 0.46 * cyl) * (1.0 + 0.06 * twist) * ply * mix(0.7, 1.0, endK);
          col *= 1.0 + 0.1 * dot(vec2(-vMisc.y, vMisc.x) * ac, -Ld) * 0.8;       // the flank that faces the light
          float acr = 1.0 - abs(dot(vMisc.xy, Ld));                           // floss shines when it lies across the light
          col += uSheen * (0.05 + 0.2 * acr * acr) * pow(sin(3.1416 * t), 1.6) * cyl * cyl * mix(vec3(1.0), vCol, 0.45);
        }
        gl_FragColor = vec4(clamp(col, 0.0, 1.0), cov);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 5; scene.add(mesh);

  ctx.frame({ radius: 1, fov: 30, dir: [0, 0, 1] });
}
