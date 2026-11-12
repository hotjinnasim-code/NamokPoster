// Leaded stained glass — a window set in a plain wall. The design is cut the way a glazier cuts it:
// every piece of glass is its own shape, laid back to front (sky bands, then the disc, then hill
// behind hill), and a lead came is run round each piece, so the lines meet in T-joints and nothing is
// a Voronoi mesh. A shader turns the flat cartoon into glass: each piece has its own streak direction
// and thickness (thin glass is paler, thick glass deeper), seeds and ripples, the light behind is
// stronger in the middle, the cames are dark rounded bars with a faint highlight, and the bright
// pieces bloom a little over the leads and onto the wall.
//
// Palette: bg = the wall (copy sits on it) · colors = the glass, used by role (deepest / lightest /
// warmest / greenest) so any five colours work · ink, accent = type. Dark walls glow; light walls
// take a faint coloured cast.
import { canvasTexture, backgroundQuad, srgbVec, GLSL_NOISE_KIT, GLSL_DITHER } from '/skill/assets/web/scene-lib.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const css = (c) => `rgb(${c.map((v) => Math.round(clamp(v, 0, 1) * 255)).join(',')})`;
const TAU = Math.PI * 2;

/** Offset a closed polyline (positive d = outwards). */
function offset(poly, d) {
  const n = poly.length; let area = 0;
  for (let i = 0; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const s = area > 0 ? 1 : -1, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = poly[(i + n - 1) % n], p1 = poly[i], p2 = poly[(i + 1) % n];
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], al = Math.hypot(ax, ay) || 1, bx = p2[0] - p1[0], by = p2[1] - p1[1], bl = Math.hypot(bx, by) || 1;
    const n1x = (s * ay) / al, n1y = (-s * ax) / al, n2x = (s * by) / bl, n2y = (-s * bx) / bl;
    let mx = n1x + n2x, my = n1y + n2y; const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml;
    const k = d / Math.max(mx * n1x + my * n1y, 0.5);
    out.push([p1[0] + mx * k, p1[1] + my * k]);
  }
  return out;
}
const bez = (p0, p1, p2, p3, n = 14) => { const out = []; for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t; out.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]); } return out; };

export default function build(ctx) {
  const { THREE, scene, palette, params, aspect, seed, rng, width: W, height: H } = ctx;
  const sx = Math.max(aspect, 1), sy = Math.max(1 / aspect, 1), short = Math.min(W, H);
  const motif = ['landscape', 'flowers', 'geometric'].includes(params.motif) ? params.motif : 'landscape';
  const P = { frame: params.frame === 'rect' || params.frame === 'arch' ? params.frame : motif === 'geometric' ? 'rect' : 'arch', lead: clamp(params.lead ?? 1, 0.6, 1.8), glow: clamp(params.glow ?? 1, 0, 2), texture: clamp(params.texture ?? 1, 0, 2), border: params.border !== false };

  // ---- glass colours by role
  const v3 = (hex) => { const v = srgbVec(hex); return [v.x, v.y, v.z]; };
  const wall = v3(palette.bg), dark = lum(wall) < 0.3;
  let G = palette.colors.map(v3); if (G.length < 2) G = [...G, v3(palette.accent), v3(palette.ink)];
  const byL = [...G].sort((a, b) => lum(a) - lum(b)), deep = byL[0], light = byL[byL.length - 1];
  const warmth = (c) => c[0] - c[2] + 0.4 * (c[0] - c[1]), greenness = (c) => c[1] - Math.max(c[0], c[2]);
  const warm = [...G].sort((a, b) => warmth(b) - warmth(a))[0], warm2 = [...G].sort((a, b) => warmth(b) - warmth(a))[1] ?? warm;
  const sunC = warmth(warm2) > 0.15 && lum(warm2) > lum(warm) ? warm2 : warm;                 // the disc takes the lighter of the two warm glasses
  const green = [...G].sort((a, b) => greenness(b) - greenness(a))[0], hasGreen = greenness(green) > 0.03;
  const leaf = hasGreen ? green : mix3(deep, light, 0.35), shade = (c, k) => [c[0] * (1 - k), c[1] * (1 - k * 0.8), c[2] * (1 - k * 0.9)];
  const other = G.find((c) => c !== deep && c !== light && c !== warm && c !== green) ?? mix3(deep, warm, 0.4);
  const white = [0.95, 0.93, 0.86];
  const vary = (c, amt = 1) => { const k = 1 + rng.range(-0.13, 0.13) * amt, t = rng.range(-0.05, 0.05) * amt; return [clamp(c[0] * k + t, 0, 1), clamp(c[1] * k, 0, 1), clamp(c[2] * k - t, 0, 1)]; };

  // ---- the window: fitted to the art rectangle
  const [ax0, ay0, ax1, ay1] = ctx.artRect || [0, 0, 1, 1];
  const m = 0.03, aw = (ax1 - ax0) * sx - 2 * m, ah = (ay1 - ay0) * sy - 2 * m;
  let w = aw, h = ah; const maxAsp = P.frame === 'arch' ? (motif === 'landscape' ? 1.05 : 0.86) : 1.25;
  if (aw / ah < 1.25 && w / h > maxAsp) w = h * maxAsp;                     // upright art areas get a window of window proportions
  w = Math.min(w, h * 2.1);
  const cx = clamp(ctx.focus.x * sx, w / 2 + 0.03, sx - w / 2 - 0.03), cy = clamp(ctx.focus.y * sy, h / 2 + 0.03, sy - h / 2 - 0.03);
  const X0 = cx - w / 2, X1 = cx + w / 2, Y0 = cy - h / 2, Y1 = cy + h / 2, md = Math.min(w, h);
  const LX = (u) => X0 + u * w, LY = (v) => Y0 + v * h;
  const rise = P.frame === 'arch' ? Math.min(w / 2, h * 0.34) : 0;
  const outline = [[X0, Y1], [X0, Y0 + rise]];
  if (rise > 0) for (let i = 1; i < 48; i++) { const a = Math.PI - (i / 48) * Math.PI; outline.push([cx + Math.cos(a) * (w / 2), Y0 + rise - Math.sin(a) * rise]); }
  else outline.push([X0, Y0]), outline.push([X1, Y0]);
  outline.push([X1, Y0 + rise], [X1, Y1]);
  const topAt = (x) => (rise > 0 ? Y0 + rise - rise * Math.sqrt(Math.max(0, 1 - ((x - cx) / (w / 2)) ** 2)) : Y0);   // y of the window top at x

  // ---- the glazier's bench: two canvases painted together (glass colour · piece data and lead)
  const px = short, lw = 0.0044 * P.lead;
  const cv = [0, 1].map(() => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; });
  const gC = cv[0].getContext('2d', { willReadFrequently: true }), gD = cv[1].getContext('2d', { willReadFrequently: true });
  gD.fillStyle = '#000'; gD.fillRect(0, 0, W, H);
  for (const g of [gC, gD]) { g.lineJoin = 'round'; g.lineCap = 'round'; }
  const trace = (g, pts, close = true) => { g.beginPath(); g.moveTo(pts[0][0] * px, pts[0][1] * px); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0] * px, pts[i][1] * px); if (close) g.closePath(); };
  const came = (pts, close = true, k = 1) => {                           // a lead line: three nested strokes make its rounded profile
    gD.globalCompositeOperation = 'lighten';
    for (const [f, b] of [[1, 112], [0.62, 200], [0.26, 255]]) { trace(gD, pts, close); gD.lineWidth = lw * k * f * px; gD.strokeStyle = `rgb(0,0,${b})`; gD.stroke(); }
    gD.globalCompositeOperation = 'source-over';
  };
  const glass = (pts, col, lead = true, k = 1) => {                      // one piece of glass and the came around it
    trace(gC, pts); gC.fillStyle = css(col); gC.fill();
    trace(gD, pts); gD.fillStyle = `rgb(${rng.int(0, 255)},${rng.int(0, 255)},0)`; gD.fill();
    if (lead) came(pts, true, k);
  };
  const clip = (pts, fn) => { for (const g of [gC, gD]) { g.save(); trace(g, pts); g.clip(); } fn(); for (const g of [gC, gD]) g.restore(); };
  // a region cut into a few pieces by slanted breaks: `outlinePts` is the region, `breaks` = [[xTop, xBottom], …] across its height
  const cutRegion = (pts, col, cuts = 0, k = 1, amt = 1) => {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const xs = [[x0 - 0.1, x0 - 0.1]]; for (let i = 1; i <= cuts; i++) { const t = (i + rng.range(-0.28, 0.28)) / (cuts + 1), s = rng.range(-0.5, 0.5) * (y1 - y0) * 0.5; xs.push([lerp(x0, x1, t) + s, lerp(x0, x1, t) - s]); } xs.push([x1 + 0.1, x1 + 0.1]);
    clip(pts, () => { for (let i = 0; i < xs.length - 1; i++) glass([[xs[i][0], y0 - 0.01], [xs[i + 1][0], y0 - 0.01], [xs[i + 1][1], y1 + 0.01], [xs[i][1], y1 + 0.01]], typeof col === 'function' ? col(i) : vary(col, amt), true, k); });
    came(pts, true, k);
  };
  const circle = (x, y, r, n = 64) => { const o = []; for (let i = 0; i < n; i++) o.push([x + Math.cos((i / n) * TAU) * r, y + Math.sin((i / n) * TAU) * r]); return o; };

  let sun = [cx, cy], inner = outline;
  clip(outline, () => {
    glass([[X0 - 0.1, Y0 - 0.1], [X1 + 0.1, Y0 - 0.1], [X1 + 0.1, Y1 + 0.1], [X0 - 0.1, Y1 + 0.1]], deep, false);
    // ---- border fillet: a band of short pieces all the way round
    if (P.border) {
      const bw = clamp(0.045 * md, 0.014, 0.034), dense = [];
      for (let i = 0; i < outline.length; i++) { const a = outline[i], b = outline[(i + 1) % outline.length], n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.012)); for (let j = 0; j < n; j++) dense.push([lerp(a[0], b[0], j / n), lerp(a[1], b[1], j / n)]); }
      const ins = offset(dense, -bw), N = dense.length; let s = 0, start = 0, alt = 0; const want = bw * 2.6;
      for (let i = 1; i <= N; i++) {
        s += Math.hypot(dense[i % N][0] - dense[i - 1][0], dense[i % N][1] - dense[i - 1][1]);
        const corner = i < N && Math.abs((dense[i][0] - dense[i - 1][0]) * (dense[(i + 1) % N][1] - dense[i][1]) - (dense[i][1] - dense[i - 1][1]) * (dense[(i + 1) % N][0] - dense[i][0])) > 1e-5 && rise === 0;
        if (s >= want * (alt % 3 === 2 ? 0.45 : 1) || i === N || corner) {
          const poly = []; for (let j = start; j <= i; j++) poly.push(dense[j % N]); for (let j = i; j >= start; j--) poly.push(ins[j % N]);
          glass(poly, alt % 3 === 2 ? vary(warm, 0.6) : vary(mix3(deep, other, alt % 2 ? 0.25 : 0), 0.8), true, 0.8);
          start = i; s = 0; alt++;
        }
      }
      inner = ins;
    }
  });

  clip(inner, () => {
    const bandPiece = (top, bot, ua, ub, sa, sb, n = 18) => { const o = []; for (let i = 0; i <= n; i++) { const u = lerp(ua + sa, ub + sb, i / n); o.push([LX(u), LY(top(u))]); } for (let i = n; i >= 0; i--) { const u = lerp(ua - sa, ub - sb, i / n); o.push([LX(u), LY(bot(u))]); } return o; };
    if (motif === 'landscape') {
      // ---- sky: gently waving bands, deep at the top, light and warm at the horizon; breaks staggered like brickwork
      const hz = 0.6, nb = clamp(Math.round((h * hz) / 0.085), 4, 8), curves = [];
      for (let k = 0; k <= nb; k++) { const base = k === 0 ? -0.5 : ((k + (k < nb ? rng.range(-0.18, 0.18) : 0)) / nb) * (hz + 0.12), a = rng.range(0.012, 0.03), f = rng.range(0.7, 1.5), ph = rng.range(0, TAU), tilt = rng.range(-0.02, 0.02); curves.push((u) => base + a * Math.sin(u * TAU * f + ph) + tilt * (u - 0.5)); }
      for (let k = 0; k < nb; k++) {
        const t = (k + 0.5) / nb, glowC = mix3(sunC, white, 0.5), col = t < 0.66 ? mix3(deep, light, Math.pow(t / 0.66, 1.2)) : mix3(light, glowC, clamp((t - 0.66) / 0.3, 0, 1) * 0.8);
        const n = clamp(Math.round((w / md) * rng.range(2.2, 3.4)), 2, 7), cuts = [-0.2]; for (let i = 1; i < n; i++) cuts.push((i + (k % 2 ? 0.5 : 0) + rng.range(-0.2, 0.2)) / n); cuts.push(1.2);
        const sl = cuts.map(() => rng.range(-0.02, 0.02));
        for (let i = 0; i < cuts.length - 1; i++) glass(bandPiece(curves[k], curves[k + 1], cuts[i], cuts[i + 1], sl[i], sl[i + 1]), vary(col, 0.9));
      }
      // ---- the disc and its aureoles: whole rings, never cut into wedges
      const rs = 0.125 * md * (w > h * 1.3 ? 1.15 : 1), sxp = LX(clamp(0.5 + rng.range(0.08, 0.2) * (rng() < 0.5 ? -1 : 1), 0.25, 0.75)), syp = LY(hz) - rs * 0.75;
      sun = [sxp, syp];
      glass(circle(sxp, syp, rs * 1.95), vary(mix3(sunC, white, 0.42), 0.3));
      glass(circle(sxp, syp, rs * 1.45), vary(mix3(sunC, warm, 0.25), 0.3));
      glass(circle(sxp, syp, rs), mix3(sunC, white, 0.62));
      // ---- hills, far to near, each cut by a few slanted breaks
      const tones = [mix3(mix3(deep, light, 0.5), other, 0.4), mix3(leaf, light, 0.4), leaf, shade(leaf, 0.3), mix3(deep, light, 0.3)];       // far haze … near meadow, then water
      const hillAt = [];
      for (let k = 0; k < 5; k++) {
        const base = hz + 0.02 + k * 0.095, a = 0.105 - k * 0.012, f = rng.range(0.55, 1.05) * (w / md > 1.4 ? 1.6 : 1), ph = rng.range(0, TAU), f2 = rng.range(1.7, 2.6), ph2 = rng.range(0, TAU);
        const top = (u) => base - a * (0.5 + 0.5 * Math.sin(u * TAU * f + ph)) - 0.022 * Math.sin(u * TAU * f2 + ph2);
        hillAt.push(top);
        const pts = []; for (let i = 0; i <= 40; i++) pts.push([LX(-0.05 + 1.1 * (i / 40)), LY(top(-0.05 + 1.1 * (i / 40)))]); pts.push([X1 + 0.1, Y1 + 0.1], [X0 - 0.1, Y1 + 0.1]);
        cutRegion(pts, tones[k], clamp(Math.round((w / md) * rng.range(1.6, 2.6)), 1, 6));
        // a pair of cypresses stand on the third hill, away from the disc
        if (k === 2) {
          const side = sxp > cx ? -1 : 1;
          for (const [du, hh2] of [[0.3, 0.36], [0.19, 0.26]]) {
            const u = 0.5 + side * du, bx = LX(u), by = LY(hillAt[2](u)) + 0.02 * h, th = hh2 * h, tw = Math.min(0.085 * w, th * 0.3);
            const tree = [...bez([bx, by], [bx - tw * 0.95, by - th * 0.25], [bx - tw * 0.5, by - th * 0.8], [bx, by - th]), ...bez([bx, by - th], [bx + tw * 0.5, by - th * 0.8], [bx + tw * 0.95, by - th * 0.25], [bx, by]).slice(1, -1)];
            const tc = shade(leaf, 0.5);
            clip(tree, () => { for (let i = 0; i < 3; i++) glass([[bx - tw, by - th * (i / 3) + tw * 0.25], [bx + tw, by - th * (i / 3) - tw * 0.25], [bx + tw, by - th * ((i + 1) / 3) - tw * 0.25 - 0.02], [bx - tw, by - th * ((i + 1) / 3) + tw * 0.25 - 0.02]], vary(tc, 0.9), true, 0.8); });
            came(tree, true, 0.9);
          }
        }
      }
    } else if (motif === 'flowers') {
      // ---- ground of pale diamond quarries
      const dq = clamp(0.2 * md, 0.07, 0.15), dx = dq, dy = dq * 1.55, pale = mix3(white, light, 0.4);
      for (let j = -1; j <= Math.ceil((h / dy) * 2) + 1; j++) for (let i = -1; i <= Math.ceil(w / dx) + 1; i++) {
        const x = X0 + i * dx + (j % 2 ? dx / 2 : 0), y = Y0 + (j * dy) / 2, t = clamp((y - Y0) / h, 0, 1);
        glass([[x, y - dy / 2], [x + dx / 2, y], [x, y + dy / 2], [x - dx / 2, y]], vary(mix3(pale, mix3(white, deep, 0.22), 0.5 * (1 - t) * rng.range(0.4, 1)), 0.5), true, 0.72);
      }
      // ---- a low mound for the stems to stand in
      const gph = rng.range(0, TAU), ground = (u) => 0.9 - 0.035 * Math.sin(u * TAU * 0.6 + gph);
      const gp = []; for (let i = 0; i <= 30; i++) gp.push([LX(-0.05 + 1.1 * (i / 30)), LY(ground(-0.05 + 1.1 * (i / 30)))]); gp.push([X1 + 0.1, Y1 + 0.1], [X0 - 0.1, Y1 + 0.1]);
      // ---- tulips: stems and leaves first, then the heads in front
      const n = clamp(Math.round((w / md) * 2.6 + (w > h ? 0.8 : 0)), 3, 7), s = Math.min((0.34 * w) / n * 2.2, 0.17 * h, 0.15), heads = [];
      const order = rng.shuffle([...Array(n).keys()]);
      for (const i of order) {
        const u = (i + 0.5 + rng.range(-0.14, 0.14)) / n, top = 0.26 + 0.2 * ((i * 0.618 + rng()) % 1) + (rise > 0 ? 0.12 * Math.abs(u - 0.5) * 2 : 0), lean = rng.range(-0.22, 0.22);
        const hx = LX(u) + lean * s, hy = LY(top) + s * 1.1, bx = LX(u) - lean * s * 0.6, by = LY(0.93);
        const c1 = [hx - lean * s * 1.5, lerp(hy, by, 0.4)], c2 = [bx + lean * s * 1.2, lerp(hy, by, 0.75)], mid = bez([hx, hy], c1, c2, [bx, by], 22), sw = s * 0.085;
        const stem = [...offset(mid.map((p) => [...p]), 0).map((p, k) => { const a = mid[Math.max(0, k - 1)], b = mid[Math.min(mid.length - 1, k + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [p[0] + ((b[1] - a[1]) / l) * sw, p[1] - ((b[0] - a[0]) / l) * sw]; }),
          ...mid.map((p, k) => { const a = mid[Math.max(0, k - 1)], b = mid[Math.min(mid.length - 1, k + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [p[0] - ((b[1] - a[1]) / l) * sw, p[1] + ((b[0] - a[0]) / l) * sw]; }).reverse()];
        // leaves: a lens split along its rib, light half and dark half
        for (const side of rng() < 0.5 ? [-1, 1] : [1, -1]) {
          const k = rng.int(12, 17), B = mid[k], len = s * rng.range(1.5, 2.3), ang = -Math.PI / 2 + side * rng.range(0.35, 0.75), T = [B[0] + Math.cos(ang) * len, B[1] + Math.sin(ang) * len];
          const nx = -(T[1] - B[1]) / len, ny = (T[0] - B[0]) / len, bw2 = len * rng.range(0.13, 0.19), bend = side * len * 0.16;
          const ctl = (f, o) => [lerp(B[0], T[0], f) + nx * (o + bend), lerp(B[1], T[1], f) + ny * (o + bend)];
          const rib = bez(B, ctl(0.35, 0), ctl(0.7, 0), T, 12), e1 = bez(B, ctl(0.25, bw2), ctl(0.7, bw2 * 0.9), T, 12), e2 = bez(B, ctl(0.25, -bw2), ctl(0.7, -bw2 * 0.9), T, 12);
          glass([...e1, ...[...rib].reverse().slice(1, -1)], vary(mix3(leaf, light, 0.22), 0.7), true, 0.85);
          glass([...rib, ...[...e2].reverse().slice(1, -1)], vary(shade(leaf, 0.3), 0.7), true, 0.85);
        }
        cutRegion(stem, shade(leaf, 0.2), 0, 0.8);
        heads.push({ hx, hy, tilt: lean * 0.9, col: i % 2 ? warm2 : warm });
      }
      cutRegion(gp, shade(leaf, 0.42), clamp(Math.round((w / md) * 2.2), 2, 6));
      for (const f of heads) {
        const cs = Math.cos(f.tilt), sn = Math.sin(f.tilt), T = ([x, y]) => [f.hx + (x * cs + y * sn) * s, f.hy + (x * sn - y * cs) * s];       // local: x right, y up, unit = s
        const petal = (pts) => pts.map(T);
        for (const sgn of [-1, 1]) glass(petal([...bez([0.04 * sgn, 0], [0.8 * sgn, 0.08], [0.86 * sgn, 0.8], [0.52 * sgn, 1.18]), ...bez([0.52 * sgn, 1.18], [0.42 * sgn, 0.9], [0.3 * sgn, 0.7], [0, 0.62]).slice(1)]), vary(mix3(f.col, deep, 0.22), 0.7), true, 0.9);
        glass(petal([...bez([0, 0], [0.46, 0.22], [0.4, 0.86], [0, 1.3]), ...bez([0, 1.3], [-0.4, 0.86], [-0.46, 0.22], [0, 0]).slice(1, -1)]), vary(mix3(f.col, white, 0.18), 0.6), true, 0.9);
      }
    } else {
      // ---- geometric: a prairie-style light screen — wide clear panes, narrow ladders of small squares, friezes, chevrons and a few discs
      const nW = clamp(Math.round((w / md) * 2 + 1), 3, 7) | 1, g = clamp(0.055 * md, 0.02, 0.05) / w, wts = []; let tot = 0;
      for (let i = 0; i < nW; i++) { const v = i === (nW - 1) / 2 ? 1.7 : 1; wts.push(v); tot += v; }
      const cols = []; let u = 0;                                            // { u0, u1, narrow }
      for (let i = 0; i < nW; i++) { const cw = (wts[i] / tot) * (1 - (nW - 1) * g); cols.push({ u0: u, u1: u + cw }); u += cw; if (i < nW - 1) { cols.push({ u0: u, u1: u + g, narrow: true }); u += g; } }
      const pale = () => vary(mix3(white, light, rng() < 0.3 ? 0.5 : 0.2), 0.45), accents = [warm, warm2, deep, other, leaf];
      const acc = () => vary(rng.pick(accents), 0.7);
      const rectP = (u0, v0, u1, v1) => [[LX(u0), LY(v0)], [LX(u1), LY(v0)], [LX(u1), LY(v1)], [LX(u0), LY(v1)]];
      const fz = clamp(0.055 * md, 0.02, 0.05) / h, f1 = 0.13 + rng.range(-0.02, 0.02), f2 = 0.83 + rng.range(-0.02, 0.02);
      for (const c of cols) {
        if (c.narrow) {
          const sq = ((c.u1 - c.u0) * w) / h; let v = (rng() * sq) % sq - sq;
          for (; v < 1.02; v += sq) { const on = Math.abs(v - 0.5) < 0.4 && rng() < 0.45; glass(rectP(c.u0, v, c.u1, v + sq), on ? acc() : pale(), true, 0.8); }
        } else {
          // friezes of short pieces near the top and the bottom, clear panes between
          const rows = [-0.05, f1, f1 + fz, f2, f2 + fz, 1.05], cuts = [lerp(f1 + fz, f2, rng.range(0.3, 0.7))];
          if (rng() < 0.6) cuts.push(lerp(f1 + fz, f2, rng.range(0.12, 0.26)));
          for (const [a, b] of [[rows[1], rows[2]], [rows[3], rows[4]]]) { const k = clamp(Math.round(((c.u1 - c.u0) * w) / (fz * h * 2.2)), 2, 6); for (let i = 0; i < k; i++) glass(rectP(lerp(c.u0, c.u1, i / k), a, lerp(c.u0, c.u1, (i + 1) / k), b), (i + (a > 0.5 ? 1 : 0)) % 2 ? acc() : pale(), true, 0.8); }
          const vs = [rows[2], ...cuts.sort((p, q) => p - q), rows[3]];
          glass(rectP(c.u0, rows[0], c.u1, rows[1]), pale()); glass(rectP(c.u0, rows[4], c.u1, rows[5]), pale());
          for (let i = 0; i < vs.length - 1; i++) glass(rectP(c.u0, vs[i], c.u1, vs[i + 1]), pale());
        }
      }
      // chevrons down the middle pane
      const mid = cols[(cols.length - 1) / 2], mc = (mid.u0 + mid.u1) / 2, hw2 = (mid.u1 - mid.u0) * 0.5, nc = clamp(Math.round(h / 0.12), 3, 6), ct = 0.05, cd = (hw2 * w) / h * 0.55;
      for (let i = 0; i < nc; i++) {
        const v = lerp(f1 + fz + 0.04, f2 - cd - ct - 0.04, nc > 1 ? i / (nc - 1) : 0.5), c = i % 2 ? warm : deep;
        glass([[LX(mid.u0), LY(v)], [LX(mc), LY(v + cd)], [LX(mc), LY(v + cd + ct)], [LX(mid.u0), LY(v + ct)]], vary(c, 0.7), true, 0.85);
        glass([[LX(mid.u1), LY(v)], [LX(mc), LY(v + cd)], [LX(mc), LY(v + cd + ct)], [LX(mid.u1), LY(v + ct)]], vary(mix3(c, light, 0.25), 0.7), true, 0.85);
      }
      // discs astride the ladders, large, medium and small
      const wide = cols.filter((c) => !c.narrow && c !== mid), sizes = [0.5, 0.34, 0.22, 0.3];
      rng.shuffle(wide).slice(0, Math.min(wide.length, 4)).forEach((c, i) => {
        const r = sizes[i % 4] * (c.u1 - c.u0) * w, x = LX(lerp(c.u0, c.u1, rng() < 0.5 ? rng.range(0.05, 0.3) : rng.range(0.7, 0.95))), y = LY(i % 2 ? rng.range(0.56, 0.72) : rng.range(0.26, 0.42)), a = rng.pick([warm, other, leaf]);
        glass(circle(x, y, r), vary(a, 0.6)); glass(circle(x, y, r * 0.56), vary(mix3(a === warm ? deep : warm, white, 0.1), 0.6), true, 0.85);
      });
    }
  });
  if (inner !== outline) came(inner, true, 1);
  // ---- the frame set into the wall
  const fw = clamp(0.02 * md, 0.009, 0.016);
  gD.globalCompositeOperation = 'lighten';
  for (const [f, b] of [[1, 150], [0.72, 255]]) { trace(gD, outline); gD.lineJoin = 'miter'; gD.lineWidth = fw * 2 * f * px; gD.strokeStyle = `rgb(0,0,${b})`; gD.stroke(); }

  const tCol = new THREE.CanvasTexture(cv[0]), tData = new THREE.CanvasTexture(cv[1]);
  for (const t of [tCol, tData]) { t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = false; t.minFilter = t.magFilter = THREE.LinearFilter; }
  // bloom source: a small, soft copy of the glass (transparent outside the window)
  const gw = Math.max(8, Math.round(W / 6)), gh = Math.max(8, Math.round(H / 6));
  const tGlow = canvasTexture(gw, gh, (g) => { g.filter = `blur(${(Math.min(gw, gh) * 0.035).toFixed(2)}px)`; g.drawImage(cv[0], 0, 0, gw, gh); }, { srgb: false });
  const tHalo = canvasTexture(gw, gh, (g) => { g.filter = `blur(${(Math.min(gw, gh) * 0.11).toFixed(2)}px)`; g.drawImage(cv[0], 0, 0, gw, gh); }, { srgb: false });

  scene.add(backgroundQuad(/* glsl */`
    varying vec2 vUv; uniform sampler2D tCol, tData, tGlow, tHalo; uniform vec2 uAsp, uSun, uTexel; uniform vec3 uWall; uniform float uShort, uSeed, uDark, uGlow, uTex, uR, uLeadPx;
    ${GLSL_NOISE_KIT}
    ${GLSL_DITHER}
    void main(){
      vec2 p = vec2(vUv.x, 1.0 - vUv.y), q = p * uAsp;
      vec4 C = texture2D(tCol, vUv), D = texture2D(tData, vUv);
      float hgt = D.b, lead = smoothstep(0.16, 0.36, hgt);
      vec3 col = uWall;
      if (C.a < 0.999 && lead < 0.999) {
        // ---- wall: plain, with the window's light spilling a little way onto it
        vec4 halo = texture2D(tHalo, vUv);
        vec3 wallC = uWall * (1.0 + 0.012 * fbm2(q * 60.0, 2) + 0.01 * noise2(q * 4.0 + 7.0));
        vec3 spill = halo.rgb * halo.a;
        col = mix(wallC + uGlow * 0.42 * spill * spill * (1.0 - C.a), wallC * mix(vec3(1.0), 0.55 + 0.6 * halo.rgb, uGlow * 0.5 * halo.a * (1.0 - C.a)), 1.0 - uDark);
      }
      if (C.a > 0.001 && lead < 0.999) {
        // ---- glass: wispy streaks along each piece's own direction, slow clouds, fine ripple, a few seeds
        float r1 = D.r, r2 = D.g, a = r2 * 6.2832; vec2 dir = vec2(cos(a), sin(a)), st = vec2(dot(q, dir), dot(q, vec2(-dir.y, dir.x)));
        float streak = fbm2(vec2(st.x * 2.0, st.y * 22.0) + r1 * 61.0, 3), wisp = 1.0 - abs(noise2(vec2(st.x * 4.0, st.y * 58.0) - r1 * 23.0));
        float cloud = fbm2(q * 4.5 + r1 * 37.0, 2), ripple = noise2(vec2(st.x * 55.0, st.y * 300.0));
        float thick = 1.0 + uTex * (0.42 * streak + 0.3 * cloud - 0.22 * wisp * wisp * wisp + 0.05 * ripple) + 0.42 * (r1 - 0.5);
        vec2 sc = q * 90.0 + r2 * 13.0, si = floor(sc); float sr = hash21(si);
        if (sr > 0.9) thick -= 0.4 * uTex * smoothstep(0.16, 0.05, length(sc - si - 0.2 - 0.6 * hash22(si + 3.0)));       // a seed: a bubble that lets more light through
        vec3 g = pow(max(C.rgb, vec3(0.004)), vec3(max(thick, 0.25)));
        // the light behind: strongest around the disc / the middle of the window
        float d = length(q - uSun) / uR;
        float lightK = mix(1.22, 0.74, smoothstep(0.0, 1.5, d)) * (1.0 + 0.07 * noise2(q * 2.3 + uSeed));
        g = 1.0 - exp(-g * lightK * 1.55);                                         // soft shoulder: bright glass glows, it does not clip
        g = mix(g, vec3(dot(g, vec3(0.3, 0.6, 0.1))), -0.22);
        col = mix(col, g, C.a);
      }
      if (lead > 0.001) {
        // ---- lead: dark rounded bars; a little room light on their upper-left flank
        vec2 e = uTexel * uLeadPx * 0.3;
        vec2 gr = vec2(texture2D(tData, vUv + vec2(e.x, 0.0)).b - texture2D(tData, vUv - vec2(e.x, 0.0)).b, texture2D(tData, vUv - vec2(0.0, e.y)).b - texture2D(tData, vUv + vec2(0.0, e.y)).b);
        float lit = clamp(dot(gr, vec2(-0.7, -0.7)) * 1.5, -1.0, 1.0);
        vec3 leadC = mix(vec3(0.04, 0.04, 0.048), vec3(0.3, 0.3, 0.33), max(lit, 0.0) * smoothstep(0.3, 0.7, hgt)) * (1.0 - 0.6 * max(-lit, 0.0));
        leadC *= 1.0 + 0.3 * noise2(q * 230.0);
        col = mix(col, leadC, lead);
      }
      // bloom: bright pieces veil the leads next to them
      float inside = max(C.a, lead);
      if (inside > 0.001) { vec4 glow = texture2D(tGlow, vUv); vec3 bl = glow.rgb * glow.a; col += uGlow * mix(0.16, 0.1, uDark) * bl * bl * inside * mix(1.0, 0.3, lead); }
      gl_FragColor = vec4(clamp(col, 0.0, 1.0) + ditherNoise(gl_FragCoord.xy), 1.0);
    }`, {
    tCol: { value: tCol }, tData: { value: tData }, tGlow: { value: tGlow }, tHalo: { value: tHalo }, uAsp: { value: new THREE.Vector2(sx, sy) }, uSun: { value: new THREE.Vector2(sun[0], sun[1]) },
    uTexel: { value: new THREE.Vector2(1 / W, 1 / H) }, uWall: { value: new THREE.Vector3(...wall) }, uShort: { value: short }, uSeed: { value: (seed % 89) * 0.577 }, uDark: { value: dark ? 1 : 0 },
    uLeadPx: { value: lw * short }, uGlow: { value: P.glow }, uTex: { value: P.texture }, uR: { value: Math.max(w, h) * 0.62 },
  }));

  ctx.frame({ radius: 1, fov: 30, dir: [0, 0, 1] });
}
