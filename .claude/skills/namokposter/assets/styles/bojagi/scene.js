// Bojagi (조각보) — a Korean patchwork wrapping cloth held up to the light. The sheet is cut into
// irregular rectangles, strips and triangles of thin ramie / silk gauze; every piece is a real
// polygon, drawn slightly larger than its place so neighbours overlap along the seam. Colour is
// transmitted light, so layers multiply: a seam is darker than either cloth, and where seams cross
// it is darker again — exactly the stained-glass look of a jogakbo in a window. A shader then weaves
// each piece (its own grain direction, slubby threads, pinholes of light) and lays the stitching.
//
// The copy block is one large undyed panel of the cloth; dyed pieces gather at the layout focus.
//
// Palette: bg = undyed cloth (the panel behind the copy) · colors = dyes · ink / accent = type only.
// A dark bg gives dark silk with glowing dyed pieces.
import { canvasTexture, backgroundQuad, srgbVec, GLSL_NOISE_KIT, GLSL_DITHER } from '/skill/assets/web/scene-lib.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const css = (c) => `rgb(${c.map((v) => Math.round(clamp(v, 0, 1) * 255)).join(',')})`;

/** Offset a simple polygon outwards by d (mitred corners). */
function inflate(poly, d) {
  const n = poly.length; let area = 0;
  for (let i = 0; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const s = area > 0 ? 1 : -1, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = poly[(i + n - 1) % n], p1 = poly[i], p2 = poly[(i + 1) % n];
    let ax = p1[0] - p0[0], ay = p1[1] - p0[1], al = Math.hypot(ax, ay) || 1, bx = p2[0] - p1[0], by = p2[1] - p1[1], bl = Math.hypot(bx, by) || 1;
    const n1x = (s * ay) / al, n1y = (-s * ax) / al, n2x = (s * by) / bl, n2y = (-s * bx) / bl;
    let mx = n1x + n2x, my = n1y + n2y; const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml;
    const k = d / Math.max(mx * n1x + my * n1y, 0.34);
    out.push([p1[0] + mx * k, p1[1] + my * k]);
  }
  return out;
}

export default function build(ctx) {
  const { THREE, scene, palette, params, aspect, seed, rng, width: W, height: H } = ctx;
  const sx = Math.max(aspect, 1), sy = Math.max(1 / aspect, 1), short = Math.min(W, H);   // frame fraction → short-side units
  const motif = ['patchwork', 'window', 'landscape'].includes(params.motif) ? params.motif : 'patchwork';
  const P = {
    scale: clamp(params.scale ?? 1, 0.6, 1.8), dye: clamp(params.dye ?? 1, 0, 1.6), seam: clamp(params.seam ?? 1, 0.5, 2),
    weave: clamp(params.weave ?? 1, 0, 2), triangles: clamp(params.triangles ?? 1, 0, 3),
  };

  // ---- colours (display space: light through cloth multiplies)
  const v3 = (hex) => { const v = srgbVec(hex); return [v.x, v.y, v.z]; };
  const bg = v3(palette.bg), dark = lum(bg) < 0.3;
  let dyes = palette.colors.map(v3).filter((c) => Math.hypot(c[0] - bg[0], c[1] - bg[1], c[2] - bg[2]) > 0.12);
  if (!dyes.length) dyes = [v3(palette.accent)];
  const byLum = [...dyes].sort((a, b) => lum(a) - lum(b));
  const reddish = (c) => c[0] > 0.6 && c[0] - Math.max(c[1], c[2]) > 0.28;
  // hand-dyed: every piece is a little off its dye lot
  const lot = (c, amt = 1) => { const k = 1 + rng.range(-0.06, 0.06) * amt, t = rng.range(-0.035, 0.035) * amt; return [clamp(c[0] * k + t, 0, 1), clamp(c[1] * k, 0, 1), clamp(c[2] * k - t, 0, 1)]; };
  const plain = () => { const k = rng.range(-0.022, 0.014); return dark ? bg.map((v) => clamp(v * (1 + k * 6) + 0.004, 0, 1)) : bg.map((v) => clamp(v + k, 0, 1)); };
  const tint = (c, t) => mix3(bg, c, t);

  // ---- where the copy sits (short-side units)
  const E = 1e-4;
  const quiet = (ctx.quiet || []).map(([x0, y0, x1, y1]) => ({ x0: x0 * sx, y0: y0 * sy, x1: x1 * sx, y1: y1 * sy }));
  const strip = (r) => r.x0 <= 0.02 * sx && r.x1 >= 0.98 * sx;
  const footer = quiet.find((r) => strip(r) && r.y1 >= sy * 0.98 && r.y0 > sy * 0.5), header = quiet.find((r) => strip(r) && r.y0 <= sy * 0.02 && r.y1 < sy * 0.5);
  const blocks = quiet.filter((r) => r !== footer && r !== header).map((r) => {
    const b = { ...r, copy: true };
    if (b.x0 < 0.09) b.x0 = 0; if (b.y0 < 0.09) b.y0 = 0; if (b.x1 > sx - 0.09) b.x1 = sx; if (b.y1 > sy - 0.09) b.y1 = sy;      // no slivers along the edge of the sheet
    if (footer && footer.y0 - b.y1 < 0.1) b.y1 = sy; if (header && b.y0 - header.y1 < 0.1) b.y0 = 0;
    return b;
  }).filter((b) => (b.x1 - b.x0) * (b.y1 - b.y0) < sx * sy * 0.9);
  const quietShare = (x0, y0, x1, y1) => {
    let m = 0;
    for (const r of quiet) { const w = Math.min(x1, r.x1) - Math.max(x0, r.x0), h = Math.min(y1, r.y1) - Math.max(y0, r.y0); if (w > 0 && h > 0) m = Math.max(m, (w * h) / ((x1 - x0) * (y1 - y0))); }
    return m;
  };

  const fx = ctx.focus.x * sx, fy = ctx.focus.y * sy, A = clamp(ctx.artSize ?? 0.7, 0.3, 1.1), R = 0.5 * A;
  const [ax0, ay0, ax1, ay1] = ctx.artRect || [0, 0, 1, 1];
  const patches = [];                                                    // { poly, col, ang, seedPatch }
  const add = (poly, col, extra = {}) => { patches.push({ poly, col, ang: rng.range(-0.5, 0.5) + (rng() < 0.3 ? 1.5708 : 0), rnd: rng(), ...extra }); };
  const rectPoly = (r) => [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]];

  // ---- recursive cutting of a rectangle into irregular rectangles, bundles of strips and a few triangles
  const MIN = 0.017 * Math.sqrt(P.scale);
  function split(r, depth, size, leaf) {
    const w = r.x1 - r.x0, h = r.y1 - r.y0, cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2, tgt = size(cx, cy), big = Math.max(w, h), small = Math.min(w, h);
    if (depth > 14 || big <= tgt || small < MIN * 2.4 || (big <= tgt * 1.5 && rng() < 0.3)) { leaf(r, tgt); return; }
    const alongX = w > h * 1.25 ? true : h > w * 1.25 ? false : rng() < 0.5, L = alongX ? w : h;
    // a bundle of parallel strips — the signature of a jogakbo
    if (big <= tgt * 2.6 && small > MIN * 5 && rng() < 0.3) {
      const n = rng.int(3, 5), cuts = [0]; let acc = 0; const ws = [];
      for (let i = 0; i < n; i++) { const v = rng.range(0.5, 1.6) * (rng() < 0.3 ? 0.45 : 1); ws.push(v); acc += v; }
      const across = !alongX, S = across ? w : h;                       // strips run along the long side
      for (let i = 0; i < n - 1; i++) cuts.push(cuts[i] + Math.max((ws[i] / acc) * S, MIN));
      cuts.push(S);
      for (let i = 0; i < n; i++) {
        if (cuts[i + 1] - cuts[i] < MIN * 0.9) continue;
        const s = across ? { x0: r.x0 + cuts[i], x1: r.x0 + cuts[i + 1], y0: r.y0, y1: r.y1 } : { x0: r.x0, x1: r.x1, y0: r.y0 + cuts[i], y1: r.y0 + cuts[i + 1] };
        // a strip may be cut once across
        const len = across ? h : w;
        if (len > tgt * 0.9 && rng() < 0.4) { const t = rng.range(0.3, 0.7); if (across) { leaf({ ...s, y1: s.y0 + len * t }, tgt); leaf({ ...s, y0: s.y0 + len * t }, tgt); } else { leaf({ ...s, x1: s.x0 + len * t }, tgt); leaf({ ...s, x0: s.x0 + len * t }, tgt); } }
        else leaf(s, tgt);
      }
      return;
    }
    const t = rng.range(0.3, 0.7), c = clamp(L * t, MIN * 1.2, L - MIN * 1.2);
    if (alongX) { split({ ...r, x1: r.x0 + c }, depth + 1, size, leaf); split({ ...r, x0: r.x0 + c }, depth + 1, size, leaf); }
    else { split({ ...r, y1: r.y0 + c }, depth + 1, size, leaf); split({ ...r, y0: r.y0 + c }, depth + 1, size, leaf); }
  }
  // cut the sheet around rectangles that must stay whole (the copy panel, a pictorial panel): only
  // full straight cuts are used, as when piecing cloth
  function carve(r, seeds, size, leaf) {
    const inside = seeds.filter((s) => s.x0 < r.x1 - E && s.x1 > r.x0 + E && s.y0 < r.y1 - E && s.y1 > r.y0 + E);
    if (!inside.length) { split(r, 0, size, leaf); return; }
    if (inside.length === 1) { const s = inside[0]; if (s.x0 <= r.x0 + E && s.y0 <= r.y0 + E && s.x1 >= r.x1 - E && s.y1 >= r.y1 - E) { s.place?.(r); return; } }
    let best = null;
    for (const s of inside) for (const [axis, v] of [['x', s.x0], ['x', s.x1], ['y', s.y0], ['y', s.y1]]) {
      const lo = axis === 'x' ? r.x0 : r.y0, hi = axis === 'x' ? r.x1 : r.y1;
      if (v <= lo + E || v >= hi - E) continue;
      if (!inside.every((t) => (axis === 'x' ? v <= t.x0 + E || v >= t.x1 - E : v <= t.y0 + E || v >= t.y1 - E))) continue;
      // prefer the cut that frees the largest piece of plain sheet
      const a = axis === 'x' ? { ...r, x1: v } : { ...r, y1: v }, b = axis === 'x' ? { ...r, x0: v } : { ...r, y0: v };
      const free = (q) => (inside.some((t) => t.x0 < q.x1 - E && t.x1 > q.x0 + E && t.y0 < q.y1 - E && t.y1 > q.y0 + E) ? 0 : (q.x1 - q.x0) * (q.y1 - q.y0));
      const score = Math.max(free(a), free(b)) + 0.001 * rng();
      if (!best || score > best.score) best = { score, a, b };
    }
    if (!best) { split(r, 0, size, leaf); return; }
    carve(best.a, seeds, size, leaf); carve(best.b, seeds, size, leaf);
  }

  // ---- the plain cloth: undyed pieces, a few faintly tinted
  const paleLeaf = (r) => {
    const q = quietShare(r.x0, r.y0, r.x1, r.y1);
    const c = q > 0.05 || rng() < 0.55 ? plain() : tint(lot(rng.pick(dyes)), dark ? rng.range(0.1, 0.22) : rng.range(0.06, 0.16));
    add(rectPoly(r), c);
  };
  const seeds = blocks.map((b) => ({ ...b, place: (r) => add(rectPoly(r), bg.slice(), { ang: 0, panel: true }) }));
  const frameRect = { x0: 0, y0: 0, x1: sx, y1: sy };

  // the part of the sheet the picture may fill: everything that does not face the copy
  const bleed = { x0: 0, y0: header ? header.y1 : 0, x1: sx, y1: footer ? footer.y0 : sy };
  if (blocks[0]) {
    const c = blocks[0];
    if (c.x1 <= ax0 * sx + 0.08) bleed.x0 = c.x1; else if (c.x0 >= ax1 * sx - 0.08) bleed.x1 = c.x0;
    else if (c.y1 <= ay0 * sy + 0.08) bleed.y0 = c.y1; else if (c.y0 >= ay1 * sy - 0.08) bleed.y1 = c.y0;
  }
  const bw = bleed.x1 - bleed.x0, bh = bleed.y1 - bleed.y0, bcx = (bleed.x0 + bleed.x1) / 2, bcy = (bleed.y0 + bleed.y1) / 2;
  // 0 at the heart of that area, 1 at its edge (a rounded box, so the dyed field is not a disc)
  const reach = (x, y) => Math.pow(Math.pow(Math.abs(x - bcx) / (bw / 2), 3) + Math.pow(Math.abs(y - bcy) / (bh / 2), 3), 1 / 3);

  if (motif === 'patchwork') {
    // small pieces at the focus, growing towards the copy; dye fades the same way
    const sMin = clamp(0.19 * Math.min(bw, bh), 0.045, 0.085) * P.scale, sMax = 0.34;
    const size = (x, y) => lerp(sMin, sMax, sstep(0.8, 2.2, reach(x, y))) * (quietShare(x - 0.02, y - 0.02, x + 0.02, y + 0.02) > 0 ? 1.8 : 1);
    let last = -1;
    const pick = () => { let i; do i = rng.int(0, dyes.length - 1); while (dyes.length > 1 && i === last); last = i; return dyes[i]; };
    const colour = (cx, cy, x0, y0, x1, y1) => {
      const q = quietShare(x0, y0, x1, y1), d = reach(cx, cy) * 1.45;
      if (q > 0.06) return plain();
      const sat = (1 - sstep(1.05, 1.62, d + rng.range(-0.2, 0.2))) * P.dye, u = rng();
      if (u < 0.74 * sat) return lot(pick());
      if (u < 0.74 * sat + 0.14) return tint(lot(pick()), rng.range(0.3, 0.6) * clamp(1.5 - 0.5 * d, 0.25, 1));
      if (d < 2.2 && rng() < 0.5) return tint(lot(pick()), dark ? rng.range(0.1, 0.25) : rng.range(0.06, 0.2));
      return plain();
    };
    carve(frameRect, seeds, size, (r, tgt) => {
      const w = r.x1 - r.x0, h = r.y1 - r.y0, cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2, d = reach(cx, cy) * 1.45;
      // a squarish piece near the focus may be two triangles
      if (d < 1.25 && Math.max(w, h) < Math.min(w, h) * 1.5 && Math.min(w, h) > MIN * 2.5 && rng() < 0.16 * P.triangles && quietShare(r.x0, r.y0, r.x1, r.y1) < 0.05) {
        const flip = rng() < 0.5, a = flip ? [[r.x0, r.y0], [r.x1, r.y0], [r.x0, r.y1]] : [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1]], b = flip ? [[r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]] : [[r.x0, r.y0], [r.x1, r.y1], [r.x0, r.y1]];
        add(a, colour(cx, cy, r.x0, r.y0, r.x1, r.y1)); add(b, colour(cx, cy, r.x0, r.y0, r.x1, r.y1));
      } else add(rectPoly(r), colour(cx, cy, r.x0, r.y0, r.x1, r.y1));
    });
  } else {
    // ---- a pictorial panel pieced into the plain cloth
    const copy = blocks[0];
    let hero;
    if (motif === 'landscape') {
      hero = { ...bleed };
    } else {
      const aw = (ax1 - ax0) * sx, ah = (ay1 - ay0) * sy, m = 0.035;
      let w = aw - 2 * m, h = ah - 2 * m; const asp = clamp(w / h, 0.62, 1.5); if (w / h > asp) w = h * asp; else h = w / asp;
      hero = { x0: fx - w / 2, x1: fx + w / 2, y0: fy - h / 2, y1: fy + h / 2 };
      const dx = Math.max(0, 0.03 - hero.x0) - Math.max(0, hero.x1 - (sx - 0.03)), dy = Math.max(0, 0.03 - hero.y0) - Math.max(0, hero.y1 - (sy - 0.03));
      hero.x0 += dx; hero.x1 += dx; hero.y0 += dy; hero.y1 += dy;
      // never into the copy panel: give way along the axis that costs least
      for (const b of blocks) {
        if (hero.x0 >= b.x1 || hero.x1 <= b.x0 || hero.y0 >= b.y1 || hero.y1 <= b.y0) continue;
        const cut = [['x0', b.x1 + 0.02, b.x1 + 0.02 - hero.x0], ['x1', b.x0 - 0.02, hero.x1 - b.x0 + 0.02], ['y0', b.y1 + 0.02, b.y1 + 0.02 - hero.y0], ['y1', b.y0 - 0.02, hero.y1 - b.y0 + 0.02]].sort((p, q) => p[2] - q[2])[0];
        hero[cut[0]] = cut[1];
      }
    }
    const hw = hero.x1 - hero.x0, hh = hero.y1 - hero.y0;
    const ph = rng.range(0, 6.28), sizeOut = (x, y) => (0.25 + 0.28 * (0.5 + 0.5 * Math.sin(x * 5.3 + ph) * Math.cos(y * 4.1 - ph * 1.7))) * P.scale;
    carve(frameRect, [...seeds, { ...hero, place: () => {} }], sizeOut, paleLeaf);

    // cut a strip (rect) once or twice across its length
    const pieces = (r, along, nMax, colour) => {
      const L = along === 'x' ? r.x1 - r.x0 : r.y1 - r.y0, n = clamp(rng.int(1, nMax), 1, Math.max(1, Math.floor(L / (MIN * 3))));
      const cuts = [0]; for (let i = 1; i < n; i++) cuts.push(clamp((i + rng.range(-0.3, 0.3)) / n, 0.08, 0.92)); cuts.push(1);
      for (let i = 0; i < n; i++) add(rectPoly(along === 'x' ? { ...r, x0: r.x0 + L * cuts[i], x1: r.x0 + L * cuts[i + 1] } : { ...r, y0: r.y0 + L * cuts[i], y1: r.y0 + L * cuts[i + 1] }), colour(i));
    };

    if (motif === 'window') {
      // nested frames, darkest outside, opening onto a lattice of pale panes — a door or window seen through cloth
      const n = clamp(Math.round((Math.min(hw, hh) / 0.15) * Math.sqrt(1 / P.scale)), 2, 6), ramp = byLum.length > 1 ? byLum : [byLum[0], tint(byLum[0], 0.5)];
      let r = { ...hero };
      const base = Math.min(hw, hh) * 0.5 * 0.62 / n;
      for (let i = 0; i < n; i++) {
        const t = base * rng.range(0.7, 1.3) * (1 - 0.1 * i), u = n > 1 ? i / (n - 1) : 0;
        // dye for this frame: along the ramp from dark to light, the outer frames deepest
        const k = clamp(u * (ramp.length - 1) + rng.range(-0.3, 0.3), 0, ramp.length - 1), c0 = mix3(ramp[Math.floor(k)], ramp[Math.min(ramp.length - 1, Math.floor(k) + 1)], k - Math.floor(k));
        const alt = dyes[(i + 1) % dyes.length];
        const col = () => { const v = rng(); return v < 0.68 ? lot(c0, 1.2) : v < 0.86 ? lot(alt) : tint(lot(c0), rng.range(0.35, 0.6)); };
        const logCabin = i % 2 === 0;                                    // which pair of sides runs the full length
        const top = { x0: r.x0 + (logCabin ? 0 : t), x1: r.x1 - (logCabin ? 0 : t), y0: r.y0, y1: r.y0 + t }, bot = { ...top, y0: r.y1 - t, y1: r.y1 };
        const lef = { x0: r.x0, x1: r.x0 + t, y0: r.y0 + (logCabin ? t : 0), y1: r.y1 - (logCabin ? t : 0) }, rig = { ...lef, x0: r.x1 - t, x1: r.x1 };
        pieces(top, 'x', 3, col); pieces(bot, 'x', 3, col); pieces(lef, 'y', 3, col); pieces(rig, 'y', 3, col);
        r = { x0: r.x0 + t, y0: r.y0 + t, x1: r.x1 - t, y1: r.y1 - t };
      }
      // the opening: panes of the palest cloth, warmed by the light behind
      const w = r.x1 - r.x0, h = r.y1 - r.y0, nx = w > h * 1.3 ? 3 : 2, ny = h > w * 1.3 ? 3 : 2, glow = byLum[byLum.length - 1];
      const xs = [0]; for (let i = 1; i < nx; i++) xs.push((i + rng.range(-0.12, 0.12)) / nx); xs.push(1);
      const ys = [0]; for (let i = 1; i < ny; i++) ys.push((i + rng.range(-0.12, 0.12)) / ny); ys.push(1);
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const c = dark ? mix3(glow, [1, 0.96, 0.86], rng.range(0.25, 0.5)) : tint(lot(glow, 0.6), rng.range(0.1, 0.3));
        add(rectPoly({ x0: r.x0 + w * xs[i], x1: r.x0 + w * xs[i + 1], y0: r.y0 + h * ys[j], y1: r.y0 + h * ys[j + 1] }), c);
      }
    } else {
      // ---- landscape: strips of sky, two ranges of pieced triangles, strips of field
      const cool = [...dyes].sort((a, b) => (a[0] - a[2]) - (b[0] - b[2])), warm = [...cool].reverse();       // bluest first / warmest first
      const far = cool[0], near = cool.length > 2 ? cool[1] : mix3(cool[0], [0, 0, 0], 0.25), nearC = lum(near) > lum(far) ? far : near, farC = nearC === near ? far : near;
      const fieldA = warm[0], fieldB = warm[1] ?? tint(warm[0], 0.6), moonC = (dark ? byLum[byLum.length - 1] : dyes.find((c) => !reddish(c) && c !== far && c !== near)) ?? warm[warm.length - 1];
      const yA = hero.y0 + hh * 0.3, yB = hero.y0 + hh * 0.56, yC = hero.y0 + hh * 0.72;
      const skyTint = (y) => (dark ? rng.range(0.1, 0.2) + 0.1 * sstep(hero.y0, yB, y) : rng.range(0.03, 0.09) + 0.2 * sstep(hero.y0 + hh * 0.05, yB, y));
      const skyCol = (y) => (rng() < 0.22 ? tint(lot(warm[0]), skyTint(y) * 0.7) : tint(lot(far, 0.7), skyTint(y)));
      // sky strips, a little deeper towards the mountains
      let y = hero.y0; const skyN = clamp(Math.round(hh * 0.3 / 0.075), 2, 5);
      for (let i = 0; i < skyN; i++) { const y1 = i === skyN - 1 ? yA : y + ((yA - hero.y0) / skyN) * rng.range(0.75, 1.25), ym = (y + Math.min(y1, yA)) / 2; pieces({ x0: hero.x0, x1: hero.x1, y0: y, y1: Math.min(y1, yA) }, 'x', Math.max(2, Math.round(hw / 0.24)), () => skyCol(ym)); y = Math.min(y1, yA); }
      // a range: zigzag between a base line and uneven summits; the piece above each mountain is cut from valley to valley
      const range = (top, base, count, mount, above) => {
        const b = [hero.x0]; for (let i = 1; i < count; i++) b.push(hero.x0 + hw * clamp((i + rng.range(-0.25, 0.25)) / count, 0.05, 0.95)); b.push(hero.x1);
        const ap = []; for (let i = 0; i < count; i++) ap.push([lerp(b[i], b[i + 1], rng.range(0.36, 0.64)), lerp(top, base, rng.range(0.12, 0.5))]);
        // the summit nearest the focus is the highest
        let hi = 0; ap.forEach((p, i) => { if (Math.abs(p[0] - fx) < Math.abs(ap[hi][0] - fx)) hi = i; }); ap[hi][1] = top + (base - top) * 0.1;
        for (let i = 0; i < count; i++) {
          const [axp, ayp] = ap[i], m = mount(i), foot = lerp(b[i], b[i + 1], 0.5) + (axp - lerp(b[i], b[i + 1], 0.5)) * 0.4;
          add([[b[i], base], [axp, ayp], [foot, base]], lot(mix3(m, [1, 1, 1], dark ? 0.1 : 0.22)));         // lit side
          add([[axp, ayp], [b[i + 1], base], [foot, base]], lot(mix3(m, [0, 0, 0], 0.14)));                  // shaded side
          add([[b[i], top], [b[i + 1], top], [b[i + 1], base], [axp, ayp], [b[i], base]], above(i));
        }
      };
      const nFar = clamp(Math.round(hw / 0.3), 2, 5), nNear = clamp(Math.round(hw / 0.42), 2, 4);
      range(yA, yB, nFar, () => tint(farC, dark ? 0.75 : 0.6), () => skyCol(lerp(yA, yB, 0.35)));
      range(yB, yC, nNear, () => nearC, () => lot(tint(farC, dark ? 0.6 : 0.42)));
      // fields: strips that widen towards the bottom, warm dyes with a thin strip of water or shadow now and then
      const calmWarm = warm.filter((c) => !reddish(c)), fA = calmWarm[0] ?? warm[0], fB = warm.find((c) => c !== fA) ?? tint(fA, 0.6);
      const fN = clamp(Math.round((hero.y1 - yC) / 0.055), 3, 7), hs = []; let hsum = 0;
      for (let i = 0; i < fN; i++) { const v = (0.5 + i * 0.35) * (i % 2 ? rng.range(0.25, 0.5) : rng.range(0.9, 1.2)); hs.push(v); hsum += v; }
      y = yC;
      for (let i = 0; i < fN; i++) {
        const y1 = i === fN - 1 ? hero.y1 : y + ((hero.y1 - yC) * hs[i]) / hsum, thin = i % 2 === 1;
        const base = thin ? (rng() < 0.5 ? nearC : fB) : i % 4 === 0 ? fA : tint(mix3(fA, fB, 0.35), 0.8);
        pieces({ x0: hero.x0, x1: hero.x1, y0: y, y1 }, 'x', Math.max(2, Math.round(hw / (thin ? 0.3 : 0.22))), () => (rng() < 0.18 ? tint(lot(base), 0.5) : lot(base, 1.3)));
        y = y1;
      }
      // the moon: a round of cloth sewn onto the sky (appliqué — two layers, so it is a shade deeper)
      const mr = Math.min(hw, hh) * 0.075, mxp = clamp(fx + (rng() < 0.5 ? -1 : 1) * hw * rng.range(0.14, 0.24), hero.x0 + mr * 1.8, hero.x1 - mr * 1.8), myp = hero.y0 + (yA - hero.y0) * 0.55;
      const disc = []; for (let i = 0; i < 56; i++) disc.push([mxp + Math.cos((i / 56) * 6.2832) * mr, myp + Math.sin((i / 56) * 6.2832) * mr]);
      add(disc, dark ? mix3(moonC, [1, 1, 1], 0.35) : tint(moonC, 0.8), { ang: 0.3, moon: true });
    }
  }

  // ---- paint: light through cloth multiplies, so every piece is laid a seam's width over its neighbours
  const seamW = 0.0052 * P.seam, px = short;
  const trace = (g, poly) => { g.beginPath(); g.moveTo(poly[0][0] * px, poly[0][1] * px); for (let i = 1; i < poly.length; i++) g.lineTo(poly[i][0] * px, poly[i][1] * px); g.closePath(); };
  const tCol = canvasTexture(W, H, (g) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'multiply'; g.lineJoin = 'miter';
    for (const p of patches) { if (p.moon) continue; trace(g, inflate(p.poly, seamW / 2)); g.fillStyle = css(p.col); g.fill(); }
    // the folded seam allowance of each piece lies in the seam as well: four layers in all
    g.lineWidth = seamW * px;
    for (const p of patches) { if (p.moon) continue; trace(g, p.poly); g.strokeStyle = css(p.col); g.stroke(); }
    // stitching: a row of tiny running stitches bites into each seam
    const sw = seamW * px * 0.17;
    g.globalAlpha = clamp(sw / 1.1, 0, 1) * 0.8; g.lineWidth = Math.max(1, sw); g.strokeStyle = dark ? 'rgb(120,120,135)' : 'rgb(150,142,130)'; g.lineCap = 'butt';
    g.setLineDash([seamW * px * 0.5, seamW * px * 0.8]);
    for (const p of patches) { if (p.moon) continue; trace(g, inflate(p.poly, -seamW * 0.5)); g.stroke(); }
    g.setLineDash([]); g.globalAlpha = 1;
    for (const p of patches) {
      if (!p.moon) continue;                                               // a round pieced into the sky
      g.globalCompositeOperation = 'source-over'; trace(g, p.poly); g.fillStyle = '#fff'; g.fill();
      g.globalCompositeOperation = 'multiply'; g.fillStyle = css(p.col); g.fill(); g.lineWidth = seamW * px * 0.9; g.strokeStyle = css(p.col.map((v) => v * 0.8)); g.stroke(); g.stroke();
    }
  }, { srgb: false });
  const tData = canvasTexture(W, H, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    for (const p of patches) { trace(g, inflate(p.poly, p.moon ? 0 : seamW / 2)); g.fillStyle = `rgb(0,${Math.round(clamp((p.ang + 0.6) / 2.8, 0, 1) * 255)},${Math.round(p.rnd * 255)})`; g.fill(); }
    g.globalCompositeOperation = 'lighter'; g.lineJoin = 'miter'; g.lineWidth = seamW * px; g.strokeStyle = 'rgb(255,0,0)';
    for (const p of patches) { trace(g, p.poly); g.stroke(); }
  }, { srgb: false, filter: 'nearest' });

  // light scattered in the cloth: a soft, small copy of the picture, screened back over it
  const gw = Math.max(8, Math.round(W / 8)), gh = Math.max(8, Math.round(H / 8));
  const tGlow = canvasTexture(gw, gh, (g) => { g.filter = `blur(${(Math.min(gw, gh) * 0.03).toFixed(2)}px)`; g.drawImage(tCol.image, 0, 0, gw, gh); }, { srgb: false });

  scene.add(backgroundQuad(/* glsl */`
    varying vec2 vUv; uniform sampler2D tCol, tData, tGlow; uniform vec2 uAsp, uFocus; uniform float uShort, uSeed, uWeave, uDark, uR;
    ${GLSL_NOISE_KIT}
    ${GLSL_DITHER}
    // one set of parallel threads: x across the threads (in thread pitches), y along them → 1 on a thread, 0 in the gap
    float threads(vec2 g, float fw, float salt){
      float id = floor(g.x), a = abs(fract(g.x) - 0.5);
      float wid = 0.3 + 0.1 * noise2(vec2(id * 3.17 + salt, g.y * 0.09)) + 0.07 * noise2(vec2(id * 1.3 - salt, g.y * 0.6));     // slubs
      wid += 0.05 * (hash21(vec2(id, salt)) - 0.5);
      return 1.0 - smoothstep(wid - fw, wid + fw, a);
    }
    void main(){
      vec2 p = vec2(vUv.x, 1.0 - vUv.y), q = p * uAsp;
      vec3 T = texture2D(tCol, vUv).rgb; vec4 D = texture2D(tData, vUv);
      float seam = D.r, ang = D.g * 2.8 - 0.6, rnd = D.b;
      // each piece is cut on its own grain
      float cs = cos(ang * 0.22), sn = sin(ang * 0.22); if (ang > 1.0) { cs = cos(1.5708 + (ang - 1.57) * 0.22); sn = sin(1.5708 + (ang - 1.57) * 0.22); }
      vec2 r = mat2(cs, -sn, sn, cs) * q + rnd * 7.0;
      float F = 310.0, fw = clamp(F / uShort * 0.75, 0.02, 0.5);            // threads across the short side; one pixel in thread pitches
      vec2 wob = 0.35 * vec2(noise2(r * 9.0 + uSeed), noise2(r * 9.0 - uSeed));
      float wa = threads(r * F + wob, fw, 1.7 + rnd * 40.0), wb = threads(r.yx * F * 0.94 + wob.yx, fw, 9.1 + rnd * 40.0);
      float cover = wa + wb;                                                 // 0 pinhole · 1 one thread · 2 a crossing
      float fade = uWeave * smoothstep(0.62, 0.3, fw);                       // too fine to draw: plain cloth instead of moiré
      float thick = 1.0 + fade * mix(0.46, 0.28, uDark) * (cover - 1.26) / 1.26;
      thick += 0.1 * fbm2(q * 3.0 + uSeed, 3) + 0.05 * (rnd - 0.5);           // uneven dyeing, cloth not quite flat
      thick += seam * 0.22 * (0.6 + 0.4 * cover);
      // the light behind the cloth: strongest behind the picture, a little weaker towards the corners
      float d = length((p - uFocus) * uAsp) / uR;
      float light = 1.0 - 0.07 * smoothstep(0.6, 2.6, d) + 0.03 * fbm2(q * 1.3 - uSeed, 2);
      thick *= mix(0.8, 1.06, smoothstep(0.1, 1.9, d));
      vec3 col = pow(max(T, vec3(0.003)), vec3(max(thick, 0.2))) * light;
      // threads catch a little front light, so the cloth has body even where it is white
      col *= 1.0 + fade * 0.035 * (cover - 1.26);
      vec3 glow = texture2D(tGlow, vUv).rgb;
      col = 1.0 - (1.0 - col) * (1.0 - 0.2 * glow * glow * (1.0 - 0.6 * uDark));
      gl_FragColor = vec4(clamp(col, 0.0, 1.0) + ditherNoise(gl_FragCoord.xy), 1.0);
    }`, {
    tCol: { value: tCol }, tData: { value: tData }, tGlow: { value: tGlow }, uAsp: { value: new THREE.Vector2(sx, sy) }, uFocus: { value: new THREE.Vector2(ctx.focus.x, ctx.focus.y) },
    uShort: { value: short }, uSeed: { value: (seed % 97) * 0.731 }, uWeave: { value: P.weave }, uDark: { value: dark ? 1 : 0 }, uR: { value: R },
  }));

  ctx.frame({ radius: 1, fov: 30, dir: [0, 0, 1] });
}
