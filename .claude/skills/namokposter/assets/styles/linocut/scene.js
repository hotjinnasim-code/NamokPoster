// Linocut — a relief print pulled from a hand-carved block: flat fields of ink, white gouge marks that
// taper where the tool went in and came out, slightly starved ("salty") ink and up to three colours
// printed one over the other, each a hair out of register.
//
// How it is made: the three blocks are drawn as masks into the R, G and B channels of one 2D canvas
// (ink is added with fills, the knife takes it away again), reduction-print fashion — everything that
// stays light is cut before the middle colour is printed, everything that stays middle before the key
// colour. The shader then prints them: each ink is offset by its own registration error, its edge is
// thresholded against a fine noise (so it stays crisp at any size), and the film of ink breaks up into
// specks where the roller ran dry.
//
// The print is a block that fills the art rectangle of the layout; the copy sits on the bare sheet.
// Should a layout put copy on top of the block, that part of the block is simply cleared away.
//
// Palette: bg = paper · colors = the inks, used dark → light (key block, middle block, light block)
//          ink / accent = type. On a dark bg the inks are opaque light inks on dark stock.
// Motifs:  hills (hills, a moon, a cottage) · waves (sea swell under a moon) · botanical (a leafy
//          branch in flower) · rooftops (a town of gables and chimneys)
import { makeNoise, backgroundQuad, canvasTexture, srgbVec, sortByLuminance, GLSL_NOISE_KIT, GLSL_DITHER } from '/skill/assets/web/scene-lib.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;

export default function build(ctx) {
  const { THREE, scene, palette, params, aspect, seed, rng, width: W, height: H } = ctx;
  const sx = Math.max(aspect, 1), sy = Math.max(1 / aspect, 1);                    // the sheet in short-side units
  const noise = makeNoise(seed * 17 + 3);
  const P = {
    motif: String(params.motif ?? 'hills'), inks: clamp(Math.round(params.inks ?? 3), 1, 3), slip: clamp(params.misregister ?? 1, 0, 3),
    wear: clamp(params.wear ?? 1, 0, 2), cut: clamp(params.cut ?? 1, 0.4, 2), grain: clamp(params.grain ?? 1, 0, 2),
  };
  const nInk = Math.min(P.inks, Math.max(1, new Set(palette.colors).size));
  const paper = srgbVec(palette.bg), darkStock = 0.2126 * paper.x + 0.7152 * paper.y + 0.0722 * paper.z < 0.3;

  // ---- the block: the art rectangle, kept clear of the copy
  const quiet = (ctx.quiet || []).map(([x0, y0, x1, y1]) => ({ x0: x0 * sx, y0: y0 * sy, x1: x1 * sx, y1: y1 * sy }));
  const ar = ctx.artRect || [0, 0, 1, 1];
  const B = { x0: ar[0] * sx, y0: ar[1] * sy, x1: ar[2] * sx, y1: ar[3] * sy }, carve = [];
  const gap = 0.03, area = (b) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
  for (const q of quiet) {
    if (q.x1 < B.x0 || q.x0 > B.x1 || q.y1 < B.y0 || q.y0 > B.y1) continue;
    const opts = [{ ...B, x0: Math.max(B.x0, q.x1 + gap) }, { ...B, x1: Math.min(B.x1, q.x0 - gap) }, { ...B, y0: Math.max(B.y0, q.y1 + gap) }, { ...B, y1: Math.min(B.y1, q.y0 - gap) }];
    const best = opts.reduce((a, b) => (area(b) > area(a) ? b : a));
    if (area(best) >= 0.62 * area(B)) Object.assign(B, best); else carve.push(q);
  }
  B.w = B.x1 - B.x0; B.h = B.y1 - B.y0; B.m = Math.min(B.w, B.h);

  // ---- canvas: one mask per block in R, G, B
  const kc = Math.min(1.5, 4096 / Math.max(W, H)), cw = Math.round(W * kc), chh = Math.round(H * kc), su = Math.min(cw, chh);
  const L = nInk >= 3 ? 0 : -1, M = nInk >= 2 ? 1 : 2, K = 2;                       // light, middle and key block → channel (-1: bare paper)
  const ADD = ['#ff0000', '#00ff00', '#0000ff'], SUB = ['#00ffff', '#ff00ff', '#ffff00'];

  const tex = canvasTexture(cw, chh, (g) => {
    g.fillStyle = darkStock ? '#fff' : '#000'; g.fillRect(0, 0, cw, chh); g.lineJoin = 'round'; g.lineCap = 'round';
    // --- drawing tools. A "path" is a function that traces a path on g (units → px inside).
    const trace = (pts, close = true) => { g.moveTo(pts[0][0] * su, pts[0][1] * su); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0] * su, pts[i][1] * su); if (close) g.closePath(); };
    const polyP = (pts) => () => trace(pts);
    const lineP = (pts) => () => trace(pts, false);
    const discP = (x, y, r) => () => { g.moveTo((x + r) * su, y * su); g.arc(x * su, y * su, r * su, 0, TAU); };
    const rectP = (x0, y0, x1, y1) => polyP([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
    const uniq = (a) => [...new Set(a)];
    const fillCh = (chs, sub, p) => { for (const c of uniq(chs)) { if (c < 0) continue; g.globalCompositeOperation = sub ? 'multiply' : 'lighter'; g.fillStyle = (sub ? SUB : ADD)[c]; g.beginPath(); p(); g.fill(); } };
    const strokeCh = (chs, sub, p, w) => { for (const c of uniq(chs)) { if (c < 0) continue; g.globalCompositeOperation = sub ? 'multiply' : 'lighter'; g.strokeStyle = (sub ? SUB : ADD)[c]; g.lineWidth = w * su; g.beginPath(); p(); g.stroke(); } };
    // tones, as in a reduction print: key over middle over light over paper
    const T = {
      key: (p) => fillCh([L, M, K], false, p),                                    // a new solid shape, printed by every block
      mid: (p) => { fillCh([L, M], false, p); if (M !== K) fillCh([K], true, p); },
      light: (p) => { fillCh([L], false, p); fillCh([M, K], true, p); },
      white: (p) => fillCh([0, 1, 2], true, p),
    };
    // the knife: cut down to a tone without printing anything new
    const CUT = { mid: (p) => fillCh(M !== K ? [K] : [0, 1, 2], true, p), light: (p) => fillCh(L >= 0 ? [M, K] : [0, 1, 2], true, p), white: (p) => fillCh([0, 1, 2], true, p) };
    const outline = (p, w) => strokeCh([L, M, K], false, p, w);                    // a key line drawn around a shape
    const scoreLine = (tone, p, w) => strokeCh(tone === 'mid' && M !== K ? [K] : tone === 'light' && L >= 0 ? [M, K] : [0, 1, 2], true, p, w);   // a cut of even width
    // ink left standing in a cleared area (ridges the gouge skipped)
    const LEAVE = { key: (p) => fillCh([L, M, K], false, p), mid: (p) => fillCh([L, M], false, p) };
    const clipTo = (p, fn) => { g.save(); g.beginPath(); p(); g.clip(); fn(); g.restore(); };

    // a gouge mark: a lens along a polyline, pointed where the tool enters and leaves
    const lens = (pts, w, skew = 1) => {
      const n = pts.length, len = [0]; for (let i = 1; i < n; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const tot = len[n - 1] || 1e-6, left = [], right = [];
      for (let i = 0; i < n; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)]; let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
        const t = len[i] / tot, h = 0.5 * w * Math.pow(Math.sin(Math.PI * Math.pow(t, skew)), 0.7);
        left.push([pts[i][0] + nx * h, pts[i][1] + ny * h]); right.push([pts[i][0] - nx * h, pts[i][1] - ny * h]);
      }
      return left.concat(right.reverse());
    };
    const gouge = (tone, pts, w, skew) => CUT[tone](polyP(lens(pts, w * P.cut, skew ?? rng.range(0.75, 1.3))));
    const ridge = (tone, pts, w, skew) => LEAVE[tone](polyP(lens(pts, w, skew ?? rng.range(0.75, 1.3))));
    // gouges one after another along a polyline: dashes of uneven length with small gaps
    const dashAlong = (pts, { len = [0.05, 0.16], gapR = [0.008, 0.03], w = 0.006, skip = 0, each }) => {
      const n = pts.length, cum = [0]; for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const tot = cum[n - 1]; let i0 = 0;
      const at = (s) => { while (i0 < n - 2 && cum[i0 + 1] < s) i0++; const t = (s - cum[i0]) / Math.max(1e-9, cum[i0 + 1] - cum[i0]); return [lerp(pts[i0][0], pts[i0 + 1][0], t), lerp(pts[i0][1], pts[i0 + 1][1], t)]; };
      for (let s = rng.range(0, gapR[1]); s < tot;) {
        const l = rng.range(len[0], len[1]), s1 = Math.min(tot, s + l);
        if (s1 - s > len[0] * 0.5 && rng() >= skip) { const run = [], k = Math.max(3, Math.ceil((s1 - s) / 0.01)); for (let j = 0; j <= k; j++) run.push(at(lerp(s, s1, j / k))); each(run, w * rng.range(0.7, 1.3)); }
        s = s1 + rng.range(gapR[0], gapR[1]);
      }
    };
    const curve = (f, xa, xb, step = 0.008) => { const pts = []; const n = Math.max(2, Math.ceil((xb - xa) / step)); for (let i = 0; i <= n; i++) { const x = lerp(xa, xb, i / n); pts.push([x, f(x)]); } return pts; };
    const dashRow = (f, xa, xb, o) => dashAlong(curve(f, xa, xb), o);
    const arcPts = (cx, cy, r, a0, a1, n = 14) => { const pts = []; for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return pts; };

    // --- the block itself: every tool above only works inside its (slightly uneven) outline
    const wob = (i) => 0.003 * noise.noise3(i * 0.9, 7.1, seed * 0.13);
    const blockPts = (() => {
      const pts = [], n = 28, r = 0.008;
      for (let i = 0; i <= n; i++) pts.push([lerp(B.x0 + r, B.x1 - r, i / n), B.y0 + wob(i)]);
      for (let i = 0; i <= n; i++) pts.push([B.x1 + wob(i + 40), lerp(B.y0 + r, B.y1 - r, i / n)]);
      for (let i = 0; i <= n; i++) pts.push([lerp(B.x1 - r, B.x0 + r, i / n), B.y1 + wob(i + 80)]);
      for (let i = 0; i <= n; i++) pts.push([B.x0 + wob(i + 120), lerp(B.y1 - r, B.y0 + r, i / n)]);
      return pts;
    })();
    const bx = (u) => B.x0 + u * B.w, by = (v) => B.y0 + v * B.h, m = B.m, wide = B.w > B.h * 1.25;
    const heroSide = rng() < 0.5 ? -1 : 1;

    // --- shared pieces
    const moon = (mx, my, mr) => {
      CUT.light(discP(mx, my, mr));
      clipTo(discP(mx, my, mr), () => CUT.white(discP(mx - mr * 0.17, my - mr * 0.11, mr * 0.96)));     // the lit face is cut once more, down to the paper
      if (L < 0) { for (let i = 0; i < 4; i++) { const a = rng.range(0.0, 1.3), rr = mr * rng.range(0.55, 0.86); ridge(M === K ? 'key' : 'mid', arcPts(mx, my, rr, a, a + rng.range(0.3, 0.6), 8), mr * 0.045); } }
      // halo: two broken rings of short cuts
      for (const [k, w] of [[1.42, 0.07], [1.86, 0.05]]) {
        for (let a = rng.range(0, 0.5); a < TAU - 0.2;) { const da = rng.range(0.16, 0.42); if (rng() > 0.18) gouge('light', arcPts(mx, my, mr * k * rng.range(0.985, 1.015), a, a + da, 8), mr * w); a += da + rng.range(0.07, 0.18); }
      }
    };
    const sky = (yTop, yBot, keepOut) => {
      // rows of level cuts, wider apart towards the top; a few stars
      for (let y = yBot - 0.012 * m; y > yTop + 0.02 * m;) {
        const row = y, phase = rng.range(0, 9);
        dashRow((x) => row + 0.0018 * Math.sin(x * 23 + phase), B.x0 + 0.02 * m, B.x1 - 0.02 * m, {
          len: [0.05 * m, 0.24 * m], gapR: [0.02 * m, 0.1 * m], w: 0.0075 * m, skip: 0.3 + 0.35 * sstep(yBot, yTop, y),
          each: (pts, w) => { if (pts.every(([x, yy]) => !keepOut(x, yy))) gouge(rng() < 0.2 ? 'white' : 'light', pts, w); },
        });
        y -= m * lerp(0.03, 0.062, sstep(yBot, yTop, y)) * rng.range(0.85, 1.15);
      }
      for (let i = 0, n = Math.round(8 * (B.w / m)); i < n; i++) {
        const x = bx(rng.range(0.05, 0.95)), y = lerp(yTop, yBot, rng.range(0.05, 0.7)), r = m * rng.range(0.004, 0.008);
        if (keepOut(x, y)) continue;
        CUT.white(polyP([[x - r * 1.7, y], [x - r * 0.3, y - r * 0.3], [x, y - r * 1.7], [x + r * 0.3, y - r * 0.3], [x + r * 1.7, y], [x + r * 0.3, y + r * 0.3], [x, y + r * 1.7], [x - r * 0.3, y + r * 0.3]]));
      }
    };
    // a bank of cloud: a few long, fat cuts stacked like planks
    const cloud = (cx, cy, s) => { for (let i = 0; i < 5; i++) { const l = s * rng.range(0.5, 1), x0 = cx - l * rng.range(0.3, 0.7), y = cy + (i - 2) * s * 0.066; gouge(i % 3 === 1 ? 'white' : 'light', [[x0, y], [x0 + l * 0.5, y - s * 0.012], [x0 + l, y]], s * rng.range(0.036, 0.058), 1); } };
    const tree = (x, y, h, kind) => {
      if (kind === 'poplar') {
        const w = h * 0.2, pts = []; for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push([x - w * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.8), y - h * t]); } for (let i = 16; i >= 0; i--) { const t = i / 16; pts.push([x + w * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.8), y - h * t]); }
        T.key(polyP(pts)); T.key(rectP(x - h * 0.02, y - h * 0.1, x + h * 0.02, y + h * 0.05));
        clipTo(polyP(pts), () => { for (let i = 0; i < 7; i++) { const t = rng.range(0.12, 0.8), xx = x - w * rng.range(0.1, 0.8) * Math.sin(Math.PI * t), yy = y - h * t; gouge('mid', [[xx, yy], [xx - w * 0.1, yy - h * 0.06], [xx - w * 0.05, yy - h * rng.range(0.1, 0.16)]], h * 0.022); } });
      } else {
        const r = h * 0.36, cy = y - h * 0.62; T.key(polyP([[x - h * 0.03, y + h * 0.04], [x - h * 0.022, cy], [x + h * 0.022, cy], [x + h * 0.03, y + h * 0.04]]));
        const blob = [], p1 = rng.range(0, TAU), p2 = rng.range(0, TAU); for (let i = 0; i < 40; i++) { const a = (i / 40) * TAU, rr = r * (1 + 0.07 * Math.sin(a * 4 + p1) + 0.05 * Math.sin(a * 7 + p2)); blob.push([x + Math.cos(a) * rr * 1.08, cy + Math.sin(a) * rr * 0.94]); }
        T.key(polyP(blob));
        clipTo(polyP(blob), () => { for (let i = 0; i < 8; i++) { const a = rng.range(Math.PI * 0.95, Math.PI * 1.75), rr = r * rng.range(0.3, 0.86), cx2 = x + Math.cos(a) * rr, cy2 = cy + Math.sin(a) * rr; gouge('mid', arcPts(cx2, cy2 + r * 0.16, r * 0.2, Math.PI * 1.15, Math.PI * 1.85, 6), r * 0.075); } });
      }
    };
    const cottage = (x, y, s) => {                                                  // a gabled cottage, lit from inside
      const w = s, h = s * 0.62, rh = s * 0.5;
      T.light(rectP(x - w / 2, y - h, x + w / 2, y));
      T.key(rectP(x + w * 0.16, y - h - rh * 1.4, x + w * 0.3, y - h - rh * 0.8));
      T.key(polyP([[x - w * 0.62, y - h * 0.94], [x - w * 0.2, y - h - rh], [x + w * 0.34, y - h - rh], [x + w * 0.62, y - h * 0.94]]));
      for (let i = 0; i < 4; i++) { const t = (i + 0.5) / 4, yy = y - h - rh * (0.12 + 0.76 * t); gouge('mid', [[x - w * (0.52 - 0.3 * t), yy], [x, yy - s * 0.008], [x + w * (0.54 - 0.2 * t), yy]], s * 0.035); }
      T.key(rectP(x - w * 0.34, y - h * 0.62, x - w * 0.12, y));
      T.key(rectP(x + w * 0.08, y - h * 0.74, x + w * 0.34, y - h * 0.3));
      CUT.white(rectP(x + w * 0.11, y - h * 0.69, x + w * 0.195, y - h * 0.35)); CUT.white(rectP(x + w * 0.225, y - h * 0.69, x + w * 0.31, y - h * 0.35));
    };
    // the land (or water) under a line y = f(x), down to the foot of the block
    const under = (f) => { const pts = curve(f, B.x0 - 0.02, B.x1 + 0.02, 0.006); pts.push([B.x1 + 0.02, B.y1 + 0.02], [B.x0 - 0.02, B.y1 + 0.02]); return pts; };
    const moonSpot = (hor) => { const mr = m * (wide ? 0.115 : 0.105), mx = bx(0.5 + heroSide * (wide ? 0.27 : 0.2)), my = lerp(B.y0, hor, 0.43); return { mx, my, mr, keep: (x, y) => Math.hypot(x - mx, y - my) < mr * 2.25 }; };

    // =============================================================================================
    const motifs = {
      hills() {
        const side = heroSide, hor = by(B.h > B.w * 1.1 ? 0.6 : 0.56), { mx, my, mr, keep } = moonSpot(hor);
        T.mid(polyP(blockPts));
        sky(B.y0, hor, keep); moon(mx, my, mr);
        cloud(bx(0.5 - side * 0.2), lerp(B.y0, hor, 0.62), m * 0.32);
        // hills, far to near
        // a far range, a dark hill on the side away from the moon, a moonlit field sweeping up towards it, a dark foreground
        const N = 4, tones = ['mid', 'key', 'light', 'key'], ph = [0, 1, 2, 3].map(() => rng.range(0, TAU)), room = B.y1 - hor;
        const bell = (v, c, w) => Math.exp(-(((v - c) / w) ** 2));
        const crest = (i) => (x) => {
          const v = (x - B.x0) / B.w, u = (x - B.x0) / m, s = side > 0 ? v : 1 - v, wig = m * 0.012 * noise.noise3(u * 2.6, i * 3.7, 1.5) + m * 0.006 * Math.sin(u * 7 + ph[i]);
          if (i === 0) return hor - m * 0.012 - m * 0.05 * bell(s, 0.78, 0.3) - m * 0.03 * bell(s, 0.2, 0.22) + wig;
          if (i === 1) return hor + room * 0.2 - (room * 0.2 + m * 0.07) * bell(s, 0.22, 0.42) + wig;
          if (i === 2) return hor + room * 0.58 - room * 0.46 * sstep(0.05, 1.05, s) + wig;
          return hor + room * 0.52 + room * 0.3 * sstep(0.1, 0.95, s) - m * 0.03 * bell(s, 0.3, 0.25) + wig;
        };
        for (let i = 0; i < N; i++) {
          const f = crest(i), tone = tones[i], shape = polyP(under(f));
          T[tone](shape);
          if (i === 0) gouge('light', curve((x) => f(x) - 0.006 * m, B.x0, B.x1), 0.008 * m, 1);        // the far range is only a line against the sky
          clipTo(shape, () => {
            // furrows: cuts that follow the crest, fanning apart as they come down the slope
            const lineTone = tone === 'key' ? 'mid' : tone === 'mid' ? 'light' : null;
            for (let j = 1, d = 0.022 * m; d < B.h; j++) {
              const dd = d * (1 + 0.05 * j);
              dashRow((x) => f(x) + dd + 0.004 * m * Math.sin(x * 31 + j), B.x0, B.x1, { len: [0.07 * m, 0.3 * m], gapR: [0.012 * m, 0.05 * m], w: m * lerp(0.007, 0.012, Math.min(1, j / 8)), skip: 0.08, each: (pts, w) => { if (lineTone) gouge(lineTone, pts, w); else ridge('mid', pts, w * 0.9); } });
              d += m * (0.024 + 0.006 * j) * rng.range(0.9, 1.1);
            }
          });
          if (i === 1) {                                                           // trees and the cottage stand on the second range
            const hx = bx(0.5 - side * 0.2), s = m * 0.085; cottage(hx, f(hx) + s * 0.1, s);
            for (const [dx, hh, kind] of [[-0.11, 0.17, 'poplar'], [-0.075, 0.12, 'poplar'], [0.1, 0.1, 'round'], [0.155, 0.075, 'round']]) { const x = hx + dx * m * (side > 0 ? 1 : -1); tree(x, f(x) + 0.004 * m, hh * m, kind); }
          }
          if (i === 3) { for (const [u, hh] of [[0.5 + side * 0.26, 0.19], [0.5 + side * 0.36, 0.125]]) { const x = bx(u); tree(x, f(x) + 0.006 * m, hh * m, 'round'); } }
        }
      },

      waves() {
        const side = heroSide, hor = by(B.h > B.w * 1.1 ? 0.47 : 0.43), { mx, my, mr, keep } = moonSpot(hor);
        T.mid(polyP(blockPts));
        sky(B.y0, hor, keep); moon(mx, my, mr);
        cloud(bx(0.5 - side * 0.22), lerp(B.y0, hor, 0.7), m * 0.3);
        // each crest leans forward: a steep face, a long back
        const hump = (u) => { const v = u - 0.14 * Math.sin(TAU * u + 1) + 0.14 * Math.sin(1); return Math.pow(0.5 + 0.5 * Math.cos(TAU * v), 1.7); };
        const N = 6;
        for (let i = 0; i < N; i++) {
          const t = i / (N - 1), base = lerp(hor, B.y1, Math.pow(t, 1.25) * 0.86) + m * 0.012, A = m * lerp(0.012, 0.085, t), lam = m * lerp(0.2, 0.6, t) * rng.range(0.9, 1.1), ph = rng();
          const hu = (x) => hump((x - B.x0) / lam + ph), f = (x) => base - A * hu(x) - 0.14 * A * Math.sin(((x - B.x0) / lam) * 2.3 + ph * 9);
          const tone = i % 2 === 0 ? 'key' : 'mid', shape = polyP(under(f));
          T[tone](shape);
          if (i === 1) {                                                           // a small boat rides the second swell
            const x = bx(0.5 - side * 0.2), y = f(x) + m * 0.004, s = m * 0.06;
            T.key(polyP([[x - s * 0.8, y - s * 0.22], [x + s * 0.8, y - s * 0.22], [x + s * 0.55, y + s * 0.05], [x - s * 0.55, y + s * 0.05]]));
            T.key(rectP(x - s * 0.02, y - s * 1.5, x + s * 0.02, y - s * 0.2));
            T.white(polyP([[x + s * 0.06, y - s * 1.45], [x + s * 0.62, y - s * 0.32], [x + s * 0.06, y - s * 0.32]])); T.light(polyP([[x - s * 0.06, y - s * 1.2], [x - s * 0.5, y - s * 0.32], [x - s * 0.06, y - s * 0.32]]));
          }
          clipTo(shape, () => {
            // foam: the top of every crest is cut away to the paper
            const xs = curve((x) => x, B.x0 - 0.02, B.x1 + 0.02, 0.005).map(([x]) => x), th = (x) => A * 0.3 * Math.pow(hu(x), 1.4) - m * 0.0015;
            CUT.white(polyP(xs.map((x) => [x, f(x) - 0.01]).concat(xs.slice().reverse().map((x) => [x, f(x) + Math.max(0, th(x))]))));
            // the water runs along under the crest in long cuts
            const lineTone = tone === 'key' ? 'mid' : 'light';
            for (let j = 1, d = A * 0.3 + m * 0.014; j <= 2 + i * 2 && d < B.h; j++) {
              const dd = d, flat = 1 / (1 + 0.35 * j);
              dashRow((x) => base - A * hu(x) * flat + dd, B.x0, B.x1, { len: [0.06 * m, 0.26 * m], gapR: [0.012 * m, 0.06 * m], w: m * lerp(0.006, 0.012, t), skip: 0.12, each: (pts, w) => gouge(lineTone, pts, w) });
              d += m * lerp(0.016, 0.032, t) * rng.range(0.9, 1.15);
            }
            // moonlight on the water: short level cuts gathered under the moon
            for (let j = 0, n = 3 + i; j < n; j++) { const x = mx + m * rng.gauss() * lerp(0.03, 0.075, t), y = lerp(f(x) + A * 0.5, base + m * 0.1 * t + A, rng()), l = m * rng.range(0.03, 0.075) * (0.6 + t); gouge(rng() < 0.6 ? 'white' : 'light', [[x - l / 2, y], [x, y - m * 0.002], [x + l / 2, y]], m * lerp(0.006, 0.011, t)); }
          });
          // spray thrown off the bigger crests
          if (i >= 2) for (let k = Math.floor(-ph) - 1; k < (B.w / lam) + 2; k++) { const xp = B.x0 + (k - ph) * lam; if (xp < B.x0 + 0.03 || xp > B.x1 - 0.03) continue; for (let d = 0; d < 3; d++) CUT.white(discP(xp + A * rng.range(0.1, 0.6), f(xp) - A * rng.range(0.1, 0.42), m * rng.range(0.003, 0.0065))); }
        }
      },

      botanical() {
        const side = heroSide;
        T.mid(polyP(blockPts));
        // the stem: one long S, upright in a tall block, reaching sideways in a wide one
        const c = wide
          ? [[bx(0.5 - side * 0.46), by(0.98)], [bx(0.5 - side * 0.2), by(0.3)], [bx(0.5 + side * 0.12), by(0.86)], [bx(0.5 + side * 0.4), by(0.24)]]
          : [[bx(0.5 - side * 0.2), by(1.02)], [bx(0.5 - side * 0.3), by(0.6)], [bx(0.5 + side * 0.34), by(0.5)], [bx(0.5 + side * 0.08), by(0.13)]];
        const bez = (t) => { const a = (1 - t) ** 3, b = 3 * (1 - t) ** 2 * t, cc = 3 * (1 - t) * t * t, d = t ** 3; return [a * c[0][0] + b * c[1][0] + cc * c[2][0] + d * c[3][0], a * c[0][1] + b * c[1][1] + cc * c[2][1] + d * c[3][1]]; };
        const stem = []; for (let i = 0; i <= 60; i++) stem.push(bez(i / 60));
        let stemLen = 0; for (let i = 1; i < stem.length; i++) stemLen += Math.hypot(stem[i][0] - stem[i - 1][0], stem[i][1] - stem[i - 1][1]);
        const nLeaf = clamp(Math.round(stemLen / (0.125 * m)), 6, 11), leaves = [];
        for (let j = 0; j < nLeaf; j++) {
          const t = 0.1 + (0.78 * j) / (nLeaf - 1), p0 = bez(t), p1 = bez(t + 0.01), ta = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]), sgn = j % 2 ? 1 : -1;
          const len = m * lerp(0.3, 0.15, t) * rng.range(0.9, 1.1), ang = ta + sgn * lerp(1.05, 0.72, t) * rng.range(0.9, 1.1), bend = -sgn * rng.range(0.4, 1), fat = rng.range(0.2, 0.25);
          const ax = (s) => { const k = bend * 0.13 * len * Math.sin(Math.PI * s); return [p0[0] + Math.cos(ang) * len * s - Math.sin(ang) * k, p0[1] + Math.sin(ang) * len * s + Math.cos(ang) * k]; };
          const hw = (s) => len * fat * Math.pow(Math.sin(Math.PI * Math.pow(clamp((s - 0.07) / 0.93, 0, 1), 0.72)), 0.85);
          const nrm = (s) => { const a = ax(Math.max(0, s - 0.01)), b = ax(Math.min(1, s + 0.01)); const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l]; };
          const side2 = (sg, grow = 0) => { const pts = []; for (let i = 0; i <= 26; i++) { const s = 0.07 + 0.93 * (i / 26), a = ax(s), nn = nrm(s), h = hw(s) + grow; pts.push([a[0] + sg * nn[0] * h, a[1] + sg * nn[1] * h]); } return pts; };
          leaves.push({ ax, hw, nrm, side2, len, tone: j % 3 === 1 ? 'light' : 'key', outlinePts: (grow = 0) => side2(1, grow).concat(side2(-1, grow).reverse()) });
        }
        // around the plant the ground is cleared in strokes that echo the leaves
        for (const lf of leaves) for (const [d, w] of [[0.02, 0.0075], [0.043, 0.0065], [0.07, 0.0055]]) {
          for (const sg of [1, -1]) dashAlong(lf.side2(sg, d * m), { len: [0.04 * m, 0.13 * m], gapR: [0.012 * m, 0.04 * m], w: w * m, skip: 0.12 + d * 3, each: (pts, ww) => gouge(d > 0.03 && rng() < 0.25 ? 'white' : 'light', pts, ww) });
        }
        T.key(polyP(lens(stem, 0.03 * m, 0.55)));
        const veins = (lf, cutTone, mark) => {
          mark(cutTone, curve((s) => 0, 0, 1, 0.04).map(([s]) => lf.ax(0.02 + 0.93 * s)), lf.len * 0.035, 0.7);
          for (let v = 0; v < 6; v++) for (const sg of [1, -1]) {
            const s0 = 0.16 + v * 0.115 + (sg > 0 ? 0.03 : 0), a0 = lf.ax(s0), s1 = Math.min(0.97, s0 + 0.17), a1 = lf.ax(s1), nn = lf.nrm(s1), h = lf.hw(s1) * 0.8;
            const end = [a1[0] + sg * nn[0] * h, a1[1] + sg * nn[1] * h], midp = [lerp(a0[0], end[0], 0.5) + sg * nn[0] * h * 0.14, lerp(a0[1], end[1], 0.5) + sg * nn[1] * h * 0.14];
            mark(cutTone, [a0, midp, end], lf.len * 0.026, 0.8);
          }
        };
        for (const lf of leaves) {
          const o = lf.outlinePts(), petiole = [lf.ax(0), lf.ax(0.09)];
          scoreLine('mid', polyP(o), 0.012 * m);                                    // a cut all round, so leaf lifts off leaf
          T.key(polyP(lens([lf.ax(-0.02), lf.ax(0.05), lf.ax(0.12)], 0.016 * m, 1)));
          T[lf.tone](polyP(o));
          if (lf.tone === 'light') { outline(polyP(o), 0.006 * m); veins(lf, 'key', ridge); } else veins(lf, 'mid', gouge);
          void petiole;
        }
        // blossoms at the tip and on two short stalks
        const blossom = (cx, cy, r, rot) => {
          for (let i = 0; i < 5; i++) { const a = rot + (i / 5) * TAU, px = cx + Math.cos(a) * r * 0.56, py = cy + Math.sin(a) * r * 0.56; T.key(discP(px, py, r * 0.5)); T[i % 2 || L < 0 ? 'white' : 'light'](discP(px, py, r * 0.43)); ridge('key', [[cx + Math.cos(a) * r * 0.28, cy + Math.sin(a) * r * 0.28], [cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62]], r * 0.07, 0.6); }
          T.key(discP(cx, cy, r * 0.24)); CUT.light(discP(cx, cy, r * 0.1));
        };
        const tip = bez(1), tt = bez(0.97), ta = Math.atan2(tip[1] - tt[1], tip[0] - tt[0]);
        for (const [t, sg, l, r] of [[0.9, 1, 0.12, 0.06], [0.82, -1, 0.14, 0.052]]) {
          const p0 = bez(t), p1 = bez(t + 0.01), a = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) + sg * 0.75, e = [p0[0] + Math.cos(a) * l * m, p0[1] + Math.sin(a) * l * m];
          T.key(polyP(lens([p0, [lerp(p0[0], e[0], 0.5) + Math.sin(a) * 0.01 * m, lerp(p0[1], e[1], 0.5) - Math.cos(a) * 0.01 * m], e], 0.012 * m, 0.6))); blossom(e[0], e[1], r * m, rng.range(0, TAU));
        }
        blossom(tip[0] + Math.cos(ta) * 0.03 * m, tip[1] + Math.sin(ta) * 0.03 * m, 0.082 * m, rng.range(0, TAU));
      },

      rooftops() {
        const side = heroSide, { mx, my, mr, keep } = moonSpot(by(0.5));
        T.mid(polyP(blockPts));
        sky(B.y0, by(0.66), keep); moon(mx, my, mr);
        const rows = [{ eave: 0.56, k: 0.8, far: true }, { eave: 0.7, k: 1 }, { eave: 0.87, k: 1.25 }];
        let smoked = false;
        for (const [ri, row] of rows.entries()) {
          for (let x = B.x0 - m * rng.range(0.02, 0.1); x < B.x1 + 0.02;) {
            const w = m * rng.range(0.13, 0.22) * row.k, x1 = x + w, cxh = (x + x1) / 2, yE = by(row.eave) + m * rng.range(-0.045, 0.04) * row.k, rh = w * rng.range(0.36, 0.52), gable = rng() < 0.5;
            const wallTone = row.far ? 'key' : rng.pick(['light', 'white', 'key', 'light']), ov = w * 0.07;
            const wall = gable ? [[x, B.y1 + 0.03], [x, yE], [cxh, yE - rh], [x1, yE], [x1, B.y1 + 0.03]] : [[x, B.y1 + 0.03], [x, yE], [x1, yE], [x1, B.y1 + 0.03]];
            // chimney first, so the roof overlaps its foot
            const chx = lerp(x, x1, rng.range(0.6, 0.78)), chw = w * 0.11, chTop = yE - rh * rng.range(1.05, 1.3);
            scoreLine('mid', polyP(wall), 0.012 * m);
            T.key(rectP(chx - chw, chTop, chx + chw, yE - rh * 0.3)); T.key(rectP(chx - chw * 1.35, chTop - chw * 0.5, chx + chw * 1.35, chTop));
            T[wallTone](polyP(wall));
            if (wallTone !== 'key') outline(polyP(wall), 0.0055 * m);
            if (gable) {                                                           // two fat barge boards
              outline(lineP([[x - ov, yE + ov * 0.6], [cxh, yE - rh], [x1 + ov, yE + ov * 0.6]]), 0.02 * m * row.k);
              if (wallTone === 'key') scoreLine('mid', lineP([[x + ov, yE + rh * 0.18], [cxh, yE - rh * 0.68], [x1 - ov, yE + rh * 0.18]]), 0.006 * m);
            } else {
              const roof = [[x - ov, yE], [x + w * 0.1, yE - rh], [x1 - w * 0.1, yE - rh], [x1 + ov, yE]];
              scoreLine('mid', polyP(roof), 0.012 * m); T.key(polyP(roof));
              clipTo(polyP(roof), () => { for (let j = 1; j <= 3; j++) { const yy = yE - (rh * j) / 4; dashRow(() => yy, x - ov, x1 + ov, { len: [0.02 * m, 0.05 * m], gapR: [0.006 * m, 0.014 * m], w: 0.008 * m * row.k, each: (pts, ww) => gouge(row.far ? 'mid' : rng() < 0.3 ? 'light' : 'mid', pts, ww) }); } });
              if (wallTone === 'key') scoreLine('mid', lineP([[x, yE + 0.006 * m], [x1, yE + 0.006 * m]]), 0.005 * m);
            }
            // windows: lit ones cut out of dark walls, dark ones left standing on light walls
            const cols = Math.max(1, Math.round(w / (0.075 * m * row.k))), ww = 0.03 * m * row.k, wh = 0.044 * m * row.k, y0 = yE + (gable ? 0.012 : 0.03) * m * row.k;
            for (let r = 0; r < 3; r++) for (let cI = 0; cI < cols; cI++) {
              const wx = lerp(x, x1, (cI + 0.5) / cols), wy = y0 + r * wh * 1.55; if (wy + wh > B.y1 - 0.01 || rng() < 0.12) continue;
              const p = rectP(wx - ww / 2, wy, wx + ww / 2, wy + wh);
              if (wallTone === 'key') { const lit = rng() < (row.far ? 0.4 : 0.6); CUT[lit ? (rng() < 0.3 ? 'white' : 'light') : 'mid'](p); if (lit) T.key(rectP(wx - ww * 0.06, wy, wx + ww * 0.06, wy + wh)); }
              else { T.key(p); CUT[rng() < 0.5 ? 'mid' : 'light'](rectP(wx - ww * 0.36, wy + wh * 0.1, wx - ww * 0.07, wy + wh * 0.9)); CUT[rng() < 0.5 ? 'mid' : 'light'](rectP(wx + ww * 0.07, wy + wh * 0.1, wx + ww * 0.36, wy + wh * 0.9)); }
            }
            if (gable && wallTone !== 'key') T.key(discP(cxh, yE - rh * 0.42, 0.011 * m * row.k));
            // shading: a few slanting ridges left on the wall's shadow side
            if (wallTone !== 'key') clipTo(polyP(wall), () => { for (let j = 0; j < 7; j++) { const yy = yE + m * (0.01 + 0.035 * j) * row.k; const xe = side > 0 ? x : x1, dx = (side > 0 ? 1 : -1) * w * rng.range(0.1, 0.2); ridge('key', [[xe, yy], [xe + dx * 0.5, yy + dx * 0.25 * side], [xe + dx, yy + dx * 0.5 * side]], 0.007 * m); } });
            // one chimney smokes: fat little cuts drifting off
            if (!smoked && ri === 1 && Math.abs(chx - mx) > mr * 3 && chx > B.x0 + 0.1 * m && chx < B.x1 - 0.1 * m) {
              smoked = true;
              for (let j = 0; j < 5; j++) { const sxp = chx - side * m * 0.022 * j * j * 0.5, syp = chTop - m * (0.035 + 0.04 * j), l = m * (0.03 + 0.016 * j); if (syp < B.y0 + 0.03) break; gouge(j % 2 ? 'white' : 'light', [[sxp - l / 2, syp + m * 0.004], [sxp, syp - m * 0.004], [sxp + l / 2, syp + m * 0.002]], m * (0.012 + 0.004 * j), 1); }
            }
            x = x1 + m * rng.range(-0.012, 0.02);
          }
        }
      },
    };

    clipTo(polyP(blockPts), () => {
      (motifs[P.motif] ?? motifs.hills)();
      // the block keeps a rim of the middle tone, so the print has an edge wherever the picture runs out to bare sheet
      const frame = () => { trace(blockPts); };
      strokeCh([L, M], false, frame, 0.011); if (darkStock && M !== K) strokeCh([K], true, frame, 0.011);
    });
    // copy laid over the block: that part of the lino is cleared away
    for (const q of carve) {
      const e = 0.03, pts = [], n = 20, wq = (i) => 0.006 * noise.noise3(i * 0.7, q.x0 * 9, 3.3);
      for (let i = 0; i <= n; i++) pts.push([lerp(q.x0 - e, q.x1 + e, i / n), q.y0 - e + wq(i)]);
      for (let i = 0; i <= n; i++) pts.push([q.x1 + e + wq(i + 30), lerp(q.y0 - e, q.y1 + e, i / n)]);
      for (let i = 0; i <= n; i++) pts.push([lerp(q.x1 + e, q.x0 - e, i / n), q.y1 + e + wq(i + 60)]);
      for (let i = 0; i <= n; i++) pts.push([q.x0 - e + wq(i + 90), lerp(q.y1 + e, q.y0 - e, i / n)]);
      (darkStock ? T.key : CUT.white)(polyP(pts));
    }
  }, { srgb: false });

  // ---- print it
  // print order: on a light sheet light → middle → key; on dark stock the masks are read inverted (the darkest
  // tone is the bare sheet) and the inks go down dark → light, each opaque over the last
  const S = sortByLuminance(palette.colors), n = S.length;
  const picks = darkStock ? S.slice(Math.max(0, n - nInk)) : S.slice(0, nInk);                                               // dark → light
  const jobs = darkStock
    ? [{ ch: 2, col: picks[0] }, { ch: 1, col: picks[1] }, { ch: 0, col: picks[2] }].slice(0, nInk)
    : [{ ch: 0, col: picks[2] }, { ch: 1, col: picks[1] }, { ch: 2, col: picks[0] }].slice(3 - nInk);
  const keyJob = darkStock ? 0 : nInk - 1;
  while (jobs.length < 3) jobs.push({ ch: 0, col: picks[0], off: true });
  const a0 = rng() * TAU, slip = 0.0026 * P.slip;
  const offs = jobs.map((j, k) => (k === keyJob || j.off ? new THREE.Vector2(0, 0) : new THREE.Vector2((Math.cos(a0 + k * 2.4) * slip) / sx, (Math.sin(a0 + k * 2.4) * slip) / sy)));
  const pad = 0.02;
  scene.add(backgroundQuad(/* glsl */`
    varying vec2 vUv; uniform sampler2D tMask; uniform vec2 uAsp, uOff[3]; uniform vec3 uPaper, uInk[3]; uniform vec4 uBox; uniform float uOn[3], uCh[3], uDark, uWear, uGrain, uSeed, uFine;
    ${GLSL_NOISE_KIT}
    ${GLSL_DITHER}
    void main(){
      vec2 p = vec2(vUv.x, 1.0 - vUv.y), q = p * uAsp;
      // the sheet: soft printmaking paper — a faint tooth, slow cloudiness, a hint of the mould's laid lines
      float tooth = noise2(q * 480.0 * uFine), slow = fbm2(q * 4.0 + uSeed, 2), laid = noise2(vec2(q.x * 24.0, q.y * 310.0) + uSeed);
      vec3 col = uPaper * (1.0 + uGrain * (0.013 * tooth + 0.012 * slow + 0.006 * laid));
      if (q.x > uBox.x && q.x < uBox.z && q.y > uBox.y && q.y < uBox.w) {
        // an uneven film of ink: broad patches where the roller ran thin, and inside them the paper tooth shows as specks
        float e1 = noise2(q * 250.0 * uFine + uSeed), e2 = noise2(q * 640.0 * uFine - uSeed), fine = noise2(q * 1100.0 * uFine + 5.0);
        vec2 wob = 0.0005 * vec2(noise2(q * 29.0 + 3.0), noise2(q * 29.0 + 47.0)) / uAsp;
        for (int k = 0; k < 3; k++) {
          if (uOn[k] < 0.5) continue;
          float fk = float(k), sg = k == 1 ? -1.0 : 1.0;
          vec3 t3 = texture2D(tMask, vUv + uOff[k] + wob * sg).rgb; float mk = uCh[k] < 0.5 ? t3.r : uCh[k] < 1.5 ? t3.g : t3.b; mk = mix(mk, 1.0 - mk, uDark);
          if (mk < 0.02) continue;
          float aa = max(fwidth(mk) * 0.75, 0.03), edgeN = 0.55 * e1 * sg + 0.45 * (k == 2 ? -e2 : e2);
          float a = smoothstep(0.5 - aa, 0.5 + aa, mk + 0.15 * edgeN * smoothstep(0.98, 0.6, mk));
          float patchy = fbm2(q * 3.3 + uSeed * 1.7 + fk * 13.0, 3) + 0.25 * e1 * sg;
          // salt: pin-holes where the tooth of the paper stayed dry
          vec2 gq = q * 560.0 * uFine + fk * 37.0 + 0.35 * vec2(e2, e1), id = floor(gq); vec2 hh = hash22(id + 0.5);
          float hole = smoothstep(0.34 * hh.x + 0.08, 0.1, length(gq - id - 0.3 - 0.4 * hash22(id + 91.5))) * step(0.42, hh.y);
          float salt = hole * smoothstep(-0.3, 0.45, patchy + 0.3 * (hh.y - 0.5));
          float speck = smoothstep(0.42, 0.7, 0.55 * fine * sg + 0.45 * (k == 0 ? -e2 : e2) + 0.4 * patchy);
          float cover = a * (1.0 - uWear * clamp(0.75 * salt + 0.55 * speck, 0.0, 1.0));
          float body = 1.0 - uWear * 0.06 * smoothstep(-0.4, 0.5, patchy);                // slightly thinner, lighter ink in the starved patches
          vec3 ink = uInk[k];
          vec3 over = mix(ink, ink * col / max(uPaper, vec3(0.05)), 0.24);                 // oil-based relief ink: nearly opaque, a little of what lies beneath comes through
          col = mix(col, mix(over, ink, uDark), cover * mix(0.97, 0.92, uDark) * body);
        }
      }
      col = clamp(col, 0.0, 1.0);
      gl_FragColor = vec4(mix(col / 12.92, pow((col + 0.055) / 1.055, vec3(2.4)), step(0.04045, col)), 1.0);
      #include <colorspace_fragment>
      gl_FragColor.rgb += ditherNoise(gl_FragCoord.xy);
    }`, {
    tMask: { value: tex }, uAsp: { value: new THREE.Vector2(sx, sy) }, uOff: { value: offs }, uPaper: { value: paper }, uInk: { value: jobs.map((j) => srgbVec(j.col)) },
    uOn: { value: jobs.map((j) => (j.off ? 0 : 1)) }, uCh: { value: jobs.map((j) => j.ch) }, uBox: { value: new THREE.Vector4(B.x0 - pad, B.y0 - pad, B.x1 + pad, B.y1 + pad) },
    uDark: { value: darkStock ? 1 : 0 }, uWear: { value: P.wear }, uGrain: { value: P.grain }, uSeed: { value: (seed % 101) * 0.37 }, uFine: { value: Math.min(1, Math.min(W, H) / 1900) },
  }));
  ctx.frame({ radius: 1, fov: 30, dir: [0, 0, 1] });
}
