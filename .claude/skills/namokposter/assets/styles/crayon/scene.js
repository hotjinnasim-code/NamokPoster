// Crayon — wax crayon / oil pastel on toothy paper. Shapes are coloured in with back-and-forth strokes
// that overshoot their outlines; the wax catches on the high points of the sheet and skips the hollows,
// so the paper sparkles through every stroke; a second colour laid on top rides over the first.
// The drawing is naive on purpose: bold shapes, a dark crayon outline, no perspective.
//
// How it is made: every stroke is drawn twice on 2D canvases — its colour on a colour sheet, its
// pressure (heavier in the middle of the stroke, adding up where strokes cross) on a pressure sheet —
// in two layers: the colouring-in, then outlines and details on top. The shader compares the pressure
// with the tooth of the paper, pixel by pixel: where the pressure beats the tooth there is wax. That
// keeps the grain crisp at any output size.
//
// Palette: bg = paper · colors = the crayons (0 sky / main field, 1 green / ground, 2 sun yellow,
//          3 warm accent, 4 extra) · ink = the dark outline crayon and the type. Dark bg: pastel on black paper.
// Motifs:  landscape (hills, sun, a house, a tree) · stilllife (flowers in a vase, fruit on a cloth)
//          city (a street of houses and towers) · scribble (abstract fields of hatching and loops)
import { makeNoise, backgroundQuad, canvasTexture, quietUniforms, srgbVec, GLSL_NOISE_KIT, GLSL_QUIET, GLSL_DITHER } from '/skill/assets/web/scene-lib.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

export default function build(ctx) {
  const { THREE, scene, palette, params, aspect, seed, rng, width: W, height: H } = ctx;
  const sx = Math.max(aspect, 1), sy = Math.max(1 / aspect, 1);
  const noise = makeNoise(seed * 13 + 11);
  const P = { motif: String(params.motif ?? 'landscape'), tip: clamp(params.tip ?? 1, 0.5, 2), press: clamp(params.pressure ?? 1, 0.4, 1.6), tooth: clamp(params.tooth ?? 1, 0, 2), outline: params.outline ?? true, wobble: clamp(params.wobble ?? 1, 0, 2.5) };
  const paper = srgbVec(palette.bg), dark = 0.2126 * paper.x + 0.7152 * paper.y + 0.0722 * paper.z < 0.3;
  const C = palette.colors, col = (i) => C[i % C.length], inkHex = palette.ink;
  const hexRgb = (h) => { const v = srgbVec(h); return [v.x * 255, v.y * 255, v.z * 255]; };
  const mixHex = (a, b, t) => { const x = hexRgb(a), y = hexRgb(b); return '#' + [0, 1, 2].map((i) => Math.round(lerp(x[i], y[i], t)).toString(16).padStart(2, '0')).join(''); };
  const whiteHex = dark ? '#f4efe4' : '#fffdf6';

  // ---- the part of the sheet the drawing may use
  const quiet = (ctx.quiet || []).map(([x0, y0, x1, y1]) => ({ x0: x0 * sx, y0: y0 * sy, x1: x1 * sx, y1: y1 * sy }));
  const ar = ctx.artRect || [0, 0, 1, 1];
  const A = { x0: ar[0] * sx, y0: ar[1] * sy, x1: ar[2] * sx, y1: ar[3] * sy };
  const gap = 0.035, area = (b) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
  for (const q of quiet) {
    if (q.x1 < A.x0 || q.x0 > A.x1 || q.y1 < A.y0 || q.y0 > A.y1) continue;
    const opts = [{ ...A, x0: Math.max(A.x0, q.x1 + gap) }, { ...A, x1: Math.min(A.x1, q.x0 - gap) }, { ...A, y0: Math.max(A.y0, q.y1 + gap) }, { ...A, y1: Math.min(A.y1, q.y0 - gap) }];
    const best = opts.reduce((a, b) => (area(b) > area(a) ? b : a));
    if (area(best) >= 0.6 * area(A)) Object.assign(A, best);
  }
  A.x0 = Math.max(A.x0, 0.03); A.y0 = Math.max(A.y0, 0.03); A.x1 = Math.min(A.x1, sx - 0.03); A.y1 = Math.min(A.y1, sy - 0.03);
  A.w = A.x1 - A.x0; A.h = A.y1 - A.y0; A.m = Math.min(A.w, A.h);
  const m = A.m, X = (u) => A.x0 + u * A.w, Y = (v) => A.y0 + v * A.h, wide = A.w > A.h * 1.3, side = rng() < 0.5 ? -1 : 1;
  const w0 = 0.0115 * P.tip * clamp(m / 0.7, 0.75, 1.15);                             // width of the crayon's tip

  // ---- three canvases: colour of layer A, colour of layer B, pressure (R = A, G = B)
  const kc = Math.min(1.25, 2560 / Math.max(W, H)), cw = Math.round(W * kc), chh = Math.round(H * kc), su = Math.min(cw, chh);
  const mk = (fill) => { const c = document.createElement('canvas'); c.width = cw; c.height = chh; const g = c.getContext('2d', { willReadFrequently: true }); g.fillStyle = fill; g.fillRect(0, 0, cw, chh); g.lineCap = 'round'; g.lineJoin = 'round'; return g; };
  const gCol = [mk(palette.bg), mk(palette.bg)], gP = mk('#000'); gP.globalCompositeOperation = 'lighter';
  const CH = [(a) => `rgba(255,0,0,${a.toFixed(3)})`, (a) => `rgba(0,255,0,${a.toFixed(3)})`];

  // hand tremor: every point drifts a little
  const wob = (x, y, k = 1) => [x + 0.0035 * P.wobble * k * noise.noise3(x * 9, y * 9, 1.7), y + 0.0035 * P.wobble * k * noise.noise3(x * 9, y * 9, 8.3)];
  const tracePath = (g, pts) => { g.beginPath(); g.moveTo(pts[0][0] * su, pts[0][1] * su); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0] * su, pts[i][1] * su); };
  const shade = (hex, d) => { const c = hexRgb(hex); return `rgb(${c.map((v) => Math.round(clamp(v + d, 0, 255))).join(',')})`; };
  // one stroke of the crayon
  const stroke = (pts, hex, { w = w0, p = 0.85, layer = 0 } = {}) => {
    if (pts.length < 2) return;
    const g = gCol[layer]; g.strokeStyle = shade(hex, rng.range(-9, 9)); g.lineWidth = w * 1.3 * su; tracePath(g, pts); g.stroke();
    const pp = clamp(p * P.press * rng.range(0.85, 1.1), 0, 1.4);
    for (const [k, a] of [[1, 0.3], [0.68, 0.26], [0.36, 0.22]]) { gP.strokeStyle = CH[layer](clamp(pp * a, 0, 1)); gP.lineWidth = w * k * su; tracePath(gP, pts); gP.stroke(); }
    // the stick is never quite flat on the paper: a harder streak off-centre
    const o = w * rng.range(-0.3, 0.3); gP.strokeStyle = CH[layer](clamp(pp * 0.16, 0, 1)); gP.lineWidth = w * 0.18 * su; tracePath(gP, pts.map(([x, y]) => [x + o * 0.7, y + o * 0.7])); gP.stroke();
  };
  const line = (pts, hex, o = {}) => { const out = []; for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.02)); for (let k = 0; k < n; k++) out.push(wob(lerp(a[0], b[0], k / n), lerp(a[1], b[1], k / n), o.k ?? 1)); } out.push(wob(...pts[pts.length - 1], o.k ?? 1)); stroke(out, hex, o); };
  // colouring in: back-and-forth strokes across a shape (several outlines = even-odd, so holes stay bare)
  const hatch = (polys, hex, { ang = 0, gapK = 0.8, w = w0, p = 0.85, layer = 0, over = 0.9, skip = 0, bow = 0.04 } = {}) => {
    if (!Array.isArray(polys[0][0])) polys = [polys];
    const c = Math.cos(ang), s = Math.sin(ang), R = polys.map((poly) => poly.map(([x, y]) => [x * c + y * s, -x * s + y * c]));
    let y0 = 1e9, y1 = -1e9; for (const r of R) for (const q of r) { y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
    let flip = false;
    for (let y = y0 + w * 0.4 * rng(); y < y1; y += w * gapK * rng.range(0.7, 1.3)) {
      const xs = [];
      for (const r of R) for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0])); }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        let xa = xs[k] - w * over * rng.range(-0.5, 1), xb = xs[k + 1] + w * over * rng.range(-0.5, 1);
        if (xb - xa < w * 0.6 || rng() < skip) continue;
        if (flip) [xa, xb] = [xb, xa]; flip = !flip;
        const n = Math.max(2, Math.ceil(Math.abs(xb - xa) / 0.025)), pts = [], bw = bow * Math.abs(xb - xa) * rng.range(-1, 1), d0 = rng.range(-0.3, 0.3) * w, d1 = rng.range(-0.3, 0.3) * w;
        for (let i = 0; i <= n; i++) { const t = i / n, xx = lerp(xa, xb, t), yy = y + lerp(d0, d1, t) + bw * Math.sin(Math.PI * t); pts.push(wob(xx * c - yy * s, xx * s + yy * c, 0.6)); }
        stroke(pts, hex, { w, p, layer });
      }
    }
  };
  // a disc coloured in one go, round and round
  const spiral = (cx, cy, r, hex, { w = w0, p = 0.9, layer = 0, r0 = 0, gapK = 0.72, squash = 1 } = {}) => {
    const pts = [], a0 = rng.range(0, TAU); let a = 0, rr = r0;
    while (rr < r) { const st = Math.min(0.5, (w * 1.6) / Math.max(rr, w)); a += st; rr += (w * gapK * st) / TAU; const k = 1 + 0.05 * noise.noise3(a * 0.7, cx * 9, cy * 9); pts.push(wob(cx + Math.cos(a + a0) * rr * k, cy + Math.sin(a + a0) * rr * k * squash, 0.5)); }
    stroke(pts, hex, { w, p, layer });
  };
  // loops running along a path: the scribble of someone in a hurry
  const loops = (path, r, hex, { w = w0, p = 0.8, layer = 0, pitch = 0.6 } = {}) => {
    const pts = []; let th = rng.range(0, TAU);
    for (let i = 0; i < path.length - 1; i++) { const a = path[i], b = path[i + 1], n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (r * pitch * 0.12))); for (let k = 0; k < n; k++) { th += 0.75; const rr = r * (0.8 + 0.3 * noise.noise3(th * 0.21, a[0] * 5, 3.1)); pts.push(wob(lerp(a[0], b[0], k / n) + Math.cos(th) * rr, lerp(a[1], b[1], k / n) + Math.sin(th) * rr * 0.85, 0.5)); } }
    stroke(pts, hex, { w, p, layer });
  };
  const rectP = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const circP = (cx, cy, rx, ry = rx, n = 28) => { const pts = []; for (let i = 0; i < n; i++) { const a = (i / n) * TAU; pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return pts; };
  const closed = (pts) => pts.concat([pts[0], pts[1]]);
  const outl = (pts, o = {}) => { if (P.outline) line(closed(pts), inkHex, { w: w0 * 0.7, p: 0.95, layer: 1, ...o }); };
  const dot = (x, y, r, hex, layer = 1) => spiral(x, y, r, hex, { w: Math.min(w0, r * 1.2), p: 0.95, layer });

  // =================================================================================================
  const motifs = {
    landscape() {
      const hor = wide ? 0.5 : 0.55, sunX = 0.5 + side * (wide ? 0.3 : 0.22), sunY = wide ? 0.24 : 0.19, sr = m * (wide ? 0.11 : 0.095);
      const skyC = col(0), grassC = col(1), sunC = col(2), warmC = col(3), extraC = col(4);
      // clouds are the paper left bare
      const clouds = [[0.5 - side * 0.24, wide ? 0.2 : 0.14, 0.15], [0.5 - side * 0.02, wide ? 0.36 : 0.3, 0.1]].map(([u, v, s]) => { const cx = X(u), cy = Y(v), r = m * s, pts = []; for (let i = 0; i < 40; i++) { const a = (i / 40) * TAU, k = 0.62 + 0.38 * Math.abs(Math.sin(a * 2.5 + u * 9)); pts.push([cx + Math.cos(a) * r * 1.5 * k, cy + Math.sin(a) * r * 0.62 * k * (Math.sin(a) > 0 ? 0.6 : 1)]); } return pts; });
      const sunHole = circP(X(sunX), Y(sunY), sr * 1.12);
      hatch([rectP(X(0), Y(0), X(1), Y(hor + 0.08)), sunHole, ...clouds], skyC, { ang: -0.12 + rng.range(-0.05, 0.05), gapK: 0.95, p: 0.72, skip: 0.03 });
      hatch([rectP(X(0), Y(0), X(1), Y(hor * 0.45))], mixHex(skyC, extraC, 0.45), { ang: -0.2, gapK: 2.3, p: 0.55, layer: 1 });   // a second blue rubbed over the top of the sky
      // the sun: a plain disc, with a ring of the same crayon pressed lightly around it
      spiral(X(sunX), Y(sunY), sr, sunC, { p: 1 });
      spiral(X(sunX), Y(sunY), sr * 1.42, sunC, { r0: sr * 1.16, p: 0.5, gapK: 1.5, layer: 1 });
      spiral(X(sunX), Y(sunY), sr * 0.7, mixHex(sunC, warmC, 0.45), { p: 0.55, gapK: 1.9, layer: 1 });
      // three hills
      const crest = (base, amp, c, wd, tilt) => (u) => base - amp * Math.exp(-(((u - c) / wd) ** 2)) + tilt * (u - 0.5);
      const hills = [
        { f: crest(hor + 0.03, 0.14, 0.5 - side * 0.22, 0.34, 0), hex: mixHex(grassC, skyC, 0.38), ang: 0.35 * side },
        { f: crest(hor + 0.2, 0.2, 0.5 + side * 0.3, 0.42, 0), hex: grassC, ang: -0.5 * side },
        { f: crest(hor + 0.31, 0.12, 0.5 - side * 0.3, 0.36, 0.05 * side), hex: mixHex(grassC, sunC, 0.5), ang: 0.2 * side },
      ];
      const poly = (f) => { const pts = []; for (let i = 0; i <= 40; i++) pts.push([X(i / 40), Y(f(i / 40))]); pts.push([X(1), Y(1)], [X(0), Y(1)]); return pts; };
      for (const [i, h] of hills.entries()) {
        const pg = poly(h.f);
        hatch(pg, h.hex, { ang: h.ang, gapK: 0.72, p: 0.95 });
        hatch(pg, mixHex(h.hex, i === 2 ? grassC : skyC, 0.5), { ang: h.ang + 0.9, gapK: 2.6, p: 0.6, layer: 1, skip: 0.25 });
        if (P.outline) line(pg.slice(0, 41), inkHex, { w: w0 * 0.7, p: 0.95, layer: 1 });
        if (i === 0) {
          // the house on the far hill
          const u = 0.5 - side * 0.24, s = m * (wide ? 0.15 : 0.13), hx = X(u), hy = Y(h.f(u)) + s * 0.12;
          const body = rectP(hx - s * 0.5, hy - s * 0.7, hx + s * 0.5, hy), roof = [[hx - s * 0.66, hy - s * 0.66], [hx, hy - s * 1.25], [hx + s * 0.66, hy - s * 0.66]];
          hatch(body, warmC, { ang: Math.PI / 2, gapK: 0.7, p: 1, over: 0.3 }); hatch(roof, extraC, { ang: 0.0, gapK: 0.7, p: 1, over: 0.3 });
          hatch(rectP(hx - s * 0.32, hy - s * 0.42, hx - s * 0.08, hy), mixHex(extraC, inkHex, 0.4), { ang: Math.PI / 2, gapK: 0.6, p: 1, over: 0.1, layer: 1 });
          hatch(rectP(hx + s * 0.08, hy - s * 0.5, hx + s * 0.36, hy - s * 0.22), sunC, { ang: 0, gapK: 0.6, p: 1, over: 0.1, layer: 1 });
          outl(body); outl(roof); outl(rectP(hx + s * 0.08, hy - s * 0.5, hx + s * 0.36, hy - s * 0.22), { w: w0 * 0.55 });
          hatch(rectP(hx + s * 0.24, hy - s * 1.25, hx + s * 0.4, hy - s * 0.85), warmC, { ang: Math.PI / 2, gapK: 0.7, p: 1, over: 0.2 });
        }
        if (i === 1) {
          // a round tree and a tall one
          for (const [du, hh, kind] of [[0.05, 0.3, 0], [0.19, 0.2, 1]]) {
            const u = clamp(0.5 + side * (0.24 + du), 0.08, 0.92), tx = X(u), ty = Y(h.f(u)) + m * 0.02, th = m * hh, brown = mixHex(warmC, inkHex, 0.55);
            hatch(rectP(tx - th * 0.05, ty - th * 0.55, tx + th * 0.05, ty), brown, { ang: Math.PI / 2, gapK: 0.6, p: 1, over: 0.3 });
            const crown = mixHex(grassC, inkHex, 0.28);
            if (kind === 0) { spiral(tx, ty - th * 0.72, th * 0.34, crown, { p: 1 }); loops([[tx - th * 0.2, ty - th * 0.62], [tx + th * 0.15, ty - th * 0.84]], th * 0.09, mixHex(grassC, sunC, 0.5), { layer: 1, p: 0.8, w: w0 * 0.8 }); if (P.outline) line(closed(circP(tx, ty - th * 0.72, th * 0.36)), inkHex, { w: w0 * 0.7, p: 0.95, layer: 1 }); }
            else { const tri = [[tx - th * 0.26, ty - th * 0.3], [tx, ty - th * 1.2], [tx + th * 0.26, ty - th * 0.3]]; hatch(tri, crown, { ang: 0.0, gapK: 0.7, p: 1, over: 0.3 }); outl(tri); }
          }
        }
      }
      // flowers in the near meadow, birds in the sky
      const near = hills[2].f;
      for (let i = 0; i < 9; i++) { const u = rng.range(0.06, 0.94), v = lerp(near(u) + 0.05, 0.96, rng()), x = X(u), y = Y(v), r = m * rng.range(0.012, 0.02); if (v > 0.97) continue; line([[x, y + r * 3.2], [x + r * 0.3, y + r]], mixHex(grassC, inkHex, 0.4), { w: w0 * 0.6, layer: 1 }); dot(x, y, r, [warmC, whiteHex, extraC, sunC][i % 4]); dot(x, y, r * 0.35, i % 4 === 3 ? warmC : sunC); }
      for (const [du, dv, s] of [[-0.02, 0.02, 1], [0.07, 0.07, 0.75], [0.14, 0.0, 0.6]]) { const x = X(0.5 - side * 0.05 + du * -side), y = Y((wide ? 0.14 : 0.36) + dv), k = m * 0.035 * s; line([[x - k, y - k * 0.35], [x - k * 0.4, y - k * 0.6], [x, y], [x + k * 0.45, y - k * 0.65], [x + k, y - k * 0.4]], inkHex, { w: w0 * 0.55, p: 0.95, layer: 1 }); }
    },

    stilllife() {
      const tab = wide ? 0.6 : 0.63, wallC = mixHex(col(2), palette.bg, dark ? 0.2 : 0.35), clothC = col(0), vaseC = col(3), leafC = col(1);
      // wall and cloth
      hatch(rectP(X(0), Y(0), X(1), Y(tab)), wallC, { ang: 0.6 * side, gapK: 1.05, p: 0.66, skip: 0.04 });
      hatch(rectP(X(0), Y(tab), X(1), Y(1)), clothC, { ang: 0.04, gapK: 0.78, p: 0.92 });
      for (let i = 1; i < 9; i++) { const u = i / 9 + rng.range(-0.01, 0.01); line([[X(u + 0.02 * (u - 0.5)), Y(tab + 0.015)], [X(u + 0.16 * (u - 0.5)), Y(0.995)]], whiteHex, { w: w0 * 0.75, p: 0.8, layer: 1 }); }
      if (P.outline) line([[X(0), Y(tab)], [X(1), Y(tab)]], inkHex, { w: w0 * 0.75, p: 0.95, layer: 1 });
      // the vase
      const vx = X(0.5 - side * (wide ? 0.2 : 0.12)), vb = Y(tab + (1 - tab) * 0.42), vh = A.h * (wide ? 0.4 : 0.3), vw = vh * 0.3;
      const prof = (t) => vw * (t < 0.68 ? 0.45 + 0.55 * Math.sin(Math.PI * Math.pow(t / 0.68, 0.8)) : lerp(0.45, 0.6, (t - 0.68) / 0.32) - 0.12 * Math.sin((Math.PI * (t - 0.68)) / 0.32));
      const vase = []; for (let i = 0; i <= 24; i++) vase.push([vx - prof(i / 24), vb - vh * (i / 24)]); for (let i = 24; i >= 0; i--) vase.push([vx + prof(i / 24), vb - vh * (i / 24)]);
      // its shadow on the cloth, then the pot
      hatch(circP(vx + vw * 0.9 * side, vb - vh * 0.01, vw * 1.5, vh * 0.07), mixHex(clothC, inkHex, 0.55), { ang: 0, gapK: 0.9, p: 0.75, layer: 1 });
      const top = [vx, vb - vh];
      // stems and leaves first, so the pot overlaps them
      const heads = [];
      const nF = wide ? 5 : 5;
      for (let i = 0; i < nF; i++) {
        const a = -Math.PI / 2 + (i - (nF - 1) / 2) * 0.42 + rng.range(-0.08, 0.08), L = A.h * (wide ? 0.34 : 0.26) * rng.range(0.75, 1.15), ex = top[0] + Math.cos(a) * L, ey = Math.max(Y(0.09), top[1] + Math.sin(a) * L);
        line([[top[0] + (i - 2) * vw * 0.12, top[1] + vh * 0.1], [lerp(top[0], ex, 0.5) + rng.range(-0.01, 0.01), lerp(top[1], ey, 0.55)], [ex, ey]], mixHex(leafC, inkHex, 0.3), { w: w0 * 0.8, p: 0.95 });
        heads.push([ex, ey, a]);
        if (i % 2 === 0) { const t = rng.range(0.35, 0.6), lx = lerp(top[0], ex, t), ly = lerp(top[1], ey, t), la = a + (i < 2 ? -1 : 1) * 0.9, ll = m * 0.11; const leaf = []; for (let k = 0; k <= 10; k++) { const s2 = k / 10, hw = ll * 0.2 * Math.sin(Math.PI * s2); leaf.push([lx + Math.cos(la) * ll * s2 - Math.sin(la) * hw, ly + Math.sin(la) * ll * s2 + Math.cos(la) * hw]); } for (let k = 10; k >= 0; k--) { const s2 = k / 10, hw = ll * 0.2 * Math.sin(Math.PI * s2); leaf.push([lx + Math.cos(la) * ll * s2 + Math.sin(la) * hw, ly + Math.sin(la) * ll * s2 - Math.cos(la) * hw]); } hatch(leaf, leafC, { ang: la, gapK: 0.65, p: 1, over: 0.2 }); outl(leaf, { w: w0 * 0.55 }); }
      }
      hatch(vase, vaseC, { ang: Math.PI / 2 + 0.05, gapK: 0.7, p: 1, over: 0.25 });
      hatch(vase.slice(0, 25).concat(vase.slice(0, 25).reverse().map(([x, y]) => [x + vw * 0.34, y])), mixHex(vaseC, inkHex, 0.4), { ang: Math.PI / 2, gapK: 1.5, p: 0.75, layer: 1 });
      line([[vx + vw * 0.42, vb - vh * 0.2], [vx + vw * 0.52, vb - vh * 0.45]], whiteHex, { w: w0 * 0.9, p: 0.9, layer: 1 });
      for (const t of [0.3, 0.42]) line([[vx - prof(t), vb - vh * t], [vx, vb - vh * (t - 0.035)], [vx + prof(t), vb - vh * t]], col(2), { w: w0 * 0.8, p: 0.95, layer: 1 });
      outl(vase);
      // flower heads: discs, coloured round and round
      const fc = [col(2), col(4), whiteHex, col(3), col(2)];
      for (const [i, [ex, ey]] of heads.entries()) { const r = m * rng.range(0.05, 0.068); spiral(ex, ey, r, fc[i % fc.length], { p: 1 }); spiral(ex, ey, r * 0.36, mixHex(col(3), inkHex, 0.5), { p: 1, layer: 1, w: w0 * 0.8 }); if (P.outline) line(closed(circP(ex, ey, r * 1.04)), inkHex, { w: w0 * 0.6, p: 0.9, layer: 1 }); }
      // fruit on the cloth
      const fy = Y(tab + (1 - tab) * 0.5), fr = m * 0.075;
      for (const [k, [du, hexF, sq]] of [[0.26, mixHex(col(2), col(3), 0.55), 1], [0.4, col(2), 0.8], [0.12, col(3), 1]].entries()) {
        const fx = X(clamp(0.5 + side * du, 0.1, 0.9)), fyy = fy + (k === 1 ? fr * 0.5 : 0) + (k === 2 ? fr * 0.9 : 0), r = fr * (k === 2 ? 0.92 : 1);
        hatch(circP(fx + r * 0.5 * side, fyy + r * 0.84, r * 1.1, r * 0.2), mixHex(clothC, inkHex, 0.55), { ang: 0, gapK: 0.9, p: 0.75, layer: 1 });
        spiral(fx, fyy, r, hexF, { p: 1, squash: sq });
        line([[fx - r * 0.45, fyy - r * 0.45 * sq], [fx - r * 0.2, fyy - r * 0.62 * sq]], whiteHex, { w: w0 * 0.9, p: 0.9, layer: 1 });
        if (k !== 1) line([[fx, fyy - r * 0.95 * sq], [fx + r * 0.12, fyy - r * 1.3 * sq]], mixHex(leafC, inkHex, 0.5), { w: w0 * 0.7, p: 0.95, layer: 1 });
        if (P.outline) line(closed(circP(fx, fyy, r * 1.03, r * 1.03 * sq)), inkHex, { w: w0 * 0.65, p: 0.9, layer: 1 });
      }
    },

    city() {
      const gnd = 0.86, skyC = col(0), sunX = 0.5 + side * 0.3, sunY = 0.17, sr = m * 0.085;
      hatch([rectP(X(0), Y(0), X(1), Y(gnd)), circP(X(sunX), Y(sunY), sr * 1.12)], skyC, { ang: -0.1, gapK: 0.98, p: 0.7, skip: 0.03 });
      spiral(X(sunX), Y(sunY), sr, col(2), { p: 1 }); spiral(X(sunX), Y(sunY), sr * 1.4, col(2), { r0: sr * 1.16, p: 0.45, gapK: 1.6, layer: 1 });
      // the street
      hatch(rectP(X(0), Y(gnd), X(1), Y(1)), mixHex(inkHex, palette.bg, dark ? 0.75 : 0.45), { ang: 0.02, gapK: 0.8, p: 0.9 });
      for (let u = 0.04; u < 0.98; u += 0.11) line([[X(u), Y(gnd + (1 - gnd) * 0.52)], [X(u + 0.055), Y(gnd + (1 - gnd) * 0.52)]], whiteHex, { w: w0 * 0.8, p: 0.9, layer: 1 });
      // houses and towers, shoulder to shoulder
      const cols5 = [col(3), col(2), col(4), col(1), mixHex(col(3), col(2), 0.5), mixHex(col(0), col(4), 0.5)];
      let u = 0.02, i = 0;
      const unit = (wide ? 0.09 : 0.15);
      while (u < 0.97) {
        const bw = Math.min(unit * rng.range(0.85, 1.5), 0.985 - u), tall = rng() < 0.4, bh = (tall ? rng.range(0.5, 0.68) : rng.range(0.24, 0.42)) * (Math.abs(u + bw / 2 - sunX) < 0.14 ? 0.62 : 1);
        if (bw < unit * 0.5) break;
        const x0 = X(u), x1 = X(u + bw), yb = Y(gnd), yt = Y(gnd - bh), hex = cols5[(i * 2 + (seed % 3)) % cols5.length], body = rectP(x0, yt, x1, yb);
        hatch(body, hex, { ang: i % 2 ? Math.PI / 2 : 0.08, gapK: 0.72, p: 0.98, over: 0.25 });
        let roof = null;
        if (!tall || rng() < 0.4) { roof = [[x0 - (x1 - x0) * 0.06, yt], [(x0 + x1) / 2, yt - (x1 - x0) * rng.range(0.4, 0.6)], [x1 + (x1 - x0) * 0.06, yt]]; hatch(roof, mixHex(cols5[(i + 3) % cols5.length], inkHex, 0.3), { ang: 0, gapK: 0.7, p: 1, over: 0.25 }); }
        // windows: little yellow or white squares, a door
        const nc = Math.max(1, Math.round((x1 - x0) / (m * 0.075))), nr = Math.max(1, Math.floor((yb - yt) / (m * 0.1)) - (tall ? 0 : 0)), ww = Math.min((x1 - x0) / nc * 0.42, m * 0.035);
        for (let r = 0; r < nr; r++) for (let c2 = 0; c2 < nc; c2++) { const wx = lerp(x0, x1, (c2 + 0.5) / nc), wy = yt + (r + 0.42) * ((yb - yt) / (nr + 0.35)); if (r === nr - 1 && c2 === Math.floor(nc / 2) && !tall) continue; const wr = rectP(wx - ww / 2, wy - ww * 0.62, wx + ww / 2, wy + ww * 0.62); hatch(wr, rng() < 0.7 ? col(2) : whiteHex, { ang: 0, gapK: 0.55, p: 1, over: 0.05, layer: 1, w: w0 * 0.8 }); outl(wr, { w: w0 * 0.45 }); }
        if (!tall) { const dx = (x0 + x1) / 2, dw = Math.min(m * 0.04, (x1 - x0) * 0.28), dr = rectP(dx - dw / 2, yb - m * 0.085, dx + dw / 2, yb); hatch(dr, mixHex(hex, inkHex, 0.6), { ang: Math.PI / 2, gapK: 0.55, p: 1, over: 0.05, layer: 1 }); outl(dr, { w: w0 * 0.45 }); }
        outl(body); if (roof) outl(roof);
        u += bw + rng.range(0.004, 0.012); i++;
      }
      // a tree at the kerb and a cloud of bare paper is too fussy here: just two birds
      for (const [du, dv, s] of [[0, 0, 1], [0.08, 0.04, 0.7]]) { const x = X(0.5 - side * 0.22 + du), y = Y(0.14 + dv), k = m * 0.035 * s; line([[x - k, y - k * 0.35], [x - k * 0.4, y - k * 0.6], [x, y], [x + k * 0.45, y - k * 0.65], [x + k, y - k * 0.4]], inkHex, { w: w0 * 0.55, p: 0.95, layer: 1 }); }
    },

    scribble() {
      // overlapping fields of colour, each rubbed in its own direction; loops and a few bold marks on top
      const cx = X(0.5), cy = Y(0.5), fields = [];
      const blobP = (x, y, rx, ry, rot) => { const pts = [], ph = rng.range(0, TAU), n = 36; for (let i = 0; i < n; i++) { const a = (i / n) * TAU, k = 1 + 0.12 * Math.sin(a * 2 + ph) + 0.08 * Math.sin(a * 3 + ph * 2), px = Math.cos(a) * rx * k, py = Math.sin(a) * ry * k; pts.push([x + px * Math.cos(rot) - py * Math.sin(rot), y + px * Math.sin(rot) + py * Math.cos(rot)]); } return pts; };
      const spots = [[-0.52, -0.3, 0.44, 0.34], [0.36, -0.38, 0.4, 0.3], [-0.2, 0.36, 0.5, 0.3], [0.5, 0.3, 0.34, 0.36], [0.02, -0.02, 0.3, 0.26], [-0.62, 0.42, 0.22, 0.2], [0.64, -0.02, 0.2, 0.26]];
      for (const [k, [u, v, ru, rv]] of spots.entries()) fields.push({ pts: blobP(cx + u * A.w * 0.5 * side, cy + v * A.h * 0.5, ru * A.w * 0.5, rv * A.h * 0.5, rng.range(-0.4, 0.4)), hex: col(k), ang: rng.range(0, Math.PI), k });
      for (const f of fields) hatch(f.pts, f.hex, { ang: f.ang, gapK: f.k === 4 ? 0.7 : 0.85, p: f.k === 4 ? 1 : 0.85, over: 1.4, bow: 0.07 });
      // second colours rubbed across some fields, the grain of both showing
      for (const f of fields) if (f.k % 2 === 0) hatch(f.pts, col(f.k + 2), { ang: f.ang + 1.2, gapK: 2.4, p: 0.62, layer: 1, over: 1.2, skip: 0.2 });
      loops([[cx - A.w * 0.4 * side, cy - A.h * 0.1], [cx - A.w * 0.1 * side, cy + A.h * 0.1], [cx + A.w * 0.2 * side, cy - A.h * 0.05], [cx + A.w * 0.42 * side, cy + A.h * 0.12]], m * 0.07, inkHex, { layer: 1, p: 0.95, w: w0 * 0.75, pitch: 0.9 });
      loops([[cx + A.w * 0.1 * side, cy - A.h * 0.4], [cx + A.w * 0.36 * side, cy - A.h * 0.3]], m * 0.05, whiteHex, { layer: 1, p: 0.9, w: w0 * 0.9, pitch: 0.7 });
      // a zigzag and a handful of dots
      const zz = []; for (let i = 0; i < 9; i++) zz.push([cx + A.w * (-0.42 + i * 0.05) * side, cy + A.h * (0.36 + (i % 2 ? -0.07 : 0.05))]);
      line(zz, col(3), { layer: 1, p: 1, w: w0 * 1.1 });
      for (let i = 0; i < 7; i++) dot(cx + A.w * rng.range(0.1, 0.44) * side, cy + A.h * rng.range(0.18, 0.44), m * rng.range(0.012, 0.022), i % 2 ? col(2) : inkHex);
    },
  };
  (motifs[P.motif] ?? motifs.landscape)();

  const mkTex = (g, srgb) => { const t = new THREE.CanvasTexture(g.canvas); t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = false; t.minFilter = t.magFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; };
  void canvasTexture;
  scene.add(backgroundQuad(/* glsl */`
    varying vec2 vUv; uniform sampler2D tA, tB, tP; uniform vec2 uAsp; uniform vec3 uPaper; uniform float uDark, uTooth, uSeed, uFine;
    ${GLSL_NOISE_KIT}
    ${GLSL_QUIET}
    ${GLSL_DITHER}
    void main(){
      vec2 p = vec2(vUv.x, 1.0 - vUv.y), q = p * uAsp;
      // the tooth of the paper: a fine, even grain with a little slow drift (0 = hollow, 1 = high point)
      float fineN = noise2(q * 300.0 * uFine + uSeed), finer = noise2(q * 660.0 * uFine - uSeed), slow = noise2(q * 26.0 + 5.0);
      float h = clamp(0.5 + 0.85 * fineN + 0.45 * finer + 0.08 * slow, 0.0, 1.0);
      // the wax drags a little: strokes are sampled with a slight shake
      vec2 uv = vUv + 0.0012 * vec2(noise2(q * 90.0 + 3.0), noise2(q * 90.0 + 37.0)) / uAsp;
      vec3 pr = texture2D(tP, uv).rgb;
      float calm = 1.0 - quietMask(p + 0.01 * vec2(slow, fineN), 0.012);
            float pa = min(pr.r, 0.92) * calm, pb = min(pr.g, 0.92) * calm, th = mix(0.25, 0.95, clamp(uTooth * 0.5 + 0.5 * step(1.0, uTooth), 0.0, 1.0));
      // wax lands where the pressure beats the tooth
      float sA = 0.07, covA = smoothstep(-sA, sA, pa - h * th * min(uTooth, 1.0) - 0.04 * max(uTooth - 1.0, 0.0)) * step(0.02, pa);
      float h2 = clamp(h * 0.7 + 0.3 * (0.5 + 0.9 * noise2(q * 410.0 * uFine + 17.0)), 0.0, 1.0);
      float covB = smoothstep(-sA, sA, pb - h2 * th * min(uTooth, 1.0) - 0.04 * max(uTooth - 1.0, 0.0)) * step(0.02, pb);
      vec3 sheet = uPaper * (1.0 + (0.05 * (h - 0.5) + 0.012 * slow) * mix(1.0, 1.8, uDark));
      vec3 cA = texture2D(tA, uv).rgb, cB = texture2D(tB, uv).rgb;
      // thicker wax is deeper in colour and a touch glossy on the high points
      cA *= 1.0 - 0.1 * smoothstep(0.5, 1.0, pa) + 0.05 * (h - 0.5);
      cB *= 1.0 - 0.1 * smoothstep(0.5, 1.0, pb) + 0.05 * (h2 - 0.5);
      vec3 colr = mix(sheet, cA, covA * 0.96);
      colr = mix(colr, cB, covB * 0.93);
      colr = clamp(colr, 0.0, 1.0);
      gl_FragColor = vec4(mix(colr / 12.92, pow((colr + 0.055) / 1.055, vec3(2.4)), step(0.04045, colr)), 1.0);
      #include <colorspace_fragment>
      gl_FragColor.rgb += ditherNoise(gl_FragCoord.xy);
    }`, {
    tA: { value: mkTex(gCol[0]) }, tB: { value: mkTex(gCol[1]) }, tP: { value: mkTex(gP) }, uAsp: { value: new THREE.Vector2(sx, sy) }, uPaper: { value: paper },
    uDark: { value: dark ? 1 : 0 }, uTooth: { value: P.tooth }, uSeed: { value: (seed % 89) * 0.71 }, uFine: { value: Math.min(1, Math.min(W, H) / 1700) }, ...quietUniforms(ctx),
  }));
  ctx.frame({ radius: 1, fov: 30, dir: [0, 0, 1] });
}
