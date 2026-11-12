// Collage — cut and torn paper, pasted up. Sheets of coloured stock, a scrap of halftone print, graph
// paper and newsprint are laid one over another: scissor cuts are straight and clean, torn edges wander
// and show the white core of the sheet with its fibres; every piece throws a small soft shadow on what
// lies under it, and a few are held down with strips of masking tape.
//
// How it is made: the pieces are pasted on a 2D canvas back to front, each drawn with a drop shadow and
// its own printed pattern. A second canvas records, per pixel, which sheet is on top (so each sheet gets
// its own grain), how rough that stock is and how close a torn edge is. The shader adds the paper grain
// and grows the white, fibrous rim along the tears at full output resolution.
//
// Palette: bg = the backing sheet · colors = the paper stocks · ink = dark paper and print · accent = type.
// Motifs:  abstract (shapes, strips and a scrap of halftone) · landscape (torn ranges under a paper sun)
//          city (a skyline of cut blocks)
import { makeNoise, backgroundQuad, quietUniforms, srgbVec, oklabVec, GLSL_NOISE_KIT, GLSL_QUIET, GLSL_DITHER } from '/skill/assets/web/scene-lib.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

export default function build(ctx) {
  const { THREE, scene, palette, params, aspect, seed, rng, width: W, height: H } = ctx;
  const sx = Math.max(aspect, 1), sy = Math.max(1 / aspect, 1);
  const noise = makeNoise(seed * 19 + 7);
  const P = { motif: String(params.motif ?? 'abstract'), tear: clamp(params.tear ?? 1, 0, 2), shadow: clamp(params.shadow ?? 1, 0, 2), tape: params.tape ?? true, grain: clamp(params.grain ?? 1, 0, 2), tilt: clamp(params.tilt ?? 1, 0, 2.5) };
  const paper = srgbVec(palette.bg), dark = 0.2126 * paper.x + 0.7152 * paper.y + 0.0722 * paper.z < 0.3;
  const C = palette.colors, col = (i) => C[((i % C.length) + C.length) % C.length], inkHex = palette.ink;
  const rgb = (h) => { const v = srgbVec(h); return [v.x * 255, v.y * 255, v.z * 255]; };
  const mixHex = (a, b, t) => { const x = rgb(a), y = rgb(b); return '#' + [0, 1, 2].map((i) => Math.round(lerp(x[i], y[i], t)).toString(16).padStart(2, '0')).join(''); };
  const lum = (h) => { const c = rgb(h); return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; };
  // red, crimson, rose: such a paper is never cut into a lone disc (it would read as a flag)
  const reddish = (hex) => { const v = oklabVec(hex), ch = Math.hypot(v.y, v.z), h = (Math.atan2(v.z, v.y) * 180) / Math.PI; return ch > 0.07 && h > -14 && h < 52; };
  const byLum = [...C].sort((a, b) => lum(a) - lum(b)), lightest = byLum[byLum.length - 1], darkest = byLum[0];
  const discCol = [...C].filter((c) => !reddish(c)).sort((a, b) => lum(b) - lum(a))[0] ?? '#f4efe2';
  const white = '#f6f2e8';

  // ---- where the pieces may go
  const quiet = (ctx.quiet || []).map(([x0, y0, x1, y1]) => ({ x0: x0 * sx, y0: y0 * sy, x1: x1 * sx, y1: y1 * sy }));
  const ar = ctx.artRect || [0, 0, 1, 1];
  const A = { x0: ar[0] * sx, y0: ar[1] * sy, x1: ar[2] * sx, y1: ar[3] * sy };
  const gap = 0.05, area = (b) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
  for (const q of quiet) {
    if (q.x1 < A.x0 || q.x0 > A.x1 || q.y1 < A.y0 || q.y0 > A.y1) continue;
    const opts = [{ ...A, x0: Math.max(A.x0, q.x1 + gap) }, { ...A, x1: Math.min(A.x1, q.x0 - gap) }, { ...A, y0: Math.max(A.y0, q.y1 + gap) }, { ...A, y1: Math.min(A.y1, q.y0 - gap) }];
    const best = opts.reduce((a, b) => (area(b) > area(a) ? b : a));
    if (area(best) >= 0.6 * area(A)) Object.assign(A, best);
  }
  A.x0 = Math.max(A.x0, 0.04); A.y0 = Math.max(A.y0, 0.04); A.x1 = Math.min(A.x1, sx - 0.04); A.y1 = Math.min(A.y1, sy - 0.04);
  A.w = A.x1 - A.x0; A.h = A.y1 - A.y0; A.m = Math.min(A.w, A.h);
  const m = A.m, X = (u) => A.x0 + u * A.w, Y = (v) => A.y0 + v * A.h, wide = A.w > A.h * 1.3, side = rng() < 0.5 ? -1 : 1;

  // ---- canvases: the paste-up, and per-pixel notes about the sheet on top (R sheet id · G nearness of a tear · B roughness)
  const kc = Math.min(1.5, 4096 / Math.max(W, H)), cw = Math.round(W * kc), chh = Math.round(H * kc), su = Math.min(cw, chh);
  const mk = (fill) => { const c = document.createElement('canvas'); c.width = cw; c.height = chh; const g = c.getContext('2d', { willReadFrequently: true }); g.fillStyle = fill; g.fillRect(0, 0, cw, chh); g.lineJoin = 'round'; g.lineCap = 'round'; return g; };
  const g = mk(palette.bg), gm = mk('rgb(0,0,64)');
  const tr = (gc, pts) => { gc.beginPath(); gc.moveTo(pts[0][0] * su, pts[0][1] * su); for (let i = 1; i < pts.length; i++) gc.lineTo(pts[i][0] * su, pts[i][1] * su); gc.closePath(); };
  let pieceNo = 0;

  // a torn edge from a to b: it wanders at three scales
  const tornPts = (a, b, k = 1) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(3, Math.ceil(len / 0.0035)), nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len, id = rng.range(0, 999), out = [];
    for (let i = 0; i < n; i++) { const t = i / n, s = t * len, o = k * P.tear * (0.0075 * noise.noise3(s * 7, id, 0.3) + 0.0032 * noise.noise3(s * 34, id, 4.1) + 0.0013 * noise.noise3(s * 150, id, 8.7)); out.push([lerp(a[0], b[0], t) + nx * o, lerp(a[1], b[1], t) + ny * o]); }
    return out;
  };
  const rot = (pts, a, c) => { if (!c) { c = [0, 0]; for (const q of pts) { c[0] += q[0] / pts.length; c[1] += q[1] / pts.length; } } const cs = Math.cos(a), sn = Math.sin(a); return pts.map(([x, y]) => [c[0] + (x - c[0]) * cs - (y - c[1]) * sn, c[1] + (x - c[0]) * sn + (y - c[1]) * cs]); };
  const bbox = (pts) => { let x0 = 9, y0 = 9, x1 = -9, y1 = -9; for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, r: Math.hypot(x1 - x0, y1 - y0) / 2 }; };

  // ---- papers: { base colour, pattern painter (drawn in the sheet's own frame), roughness, coreless }
  const solid = (hex, rough = 0.5) => ({ hex, rough });
  const halftone = (hex, inkc, { pitch = 0.0105, from = 0.08, to = 0.8, ang = 0.6 } = {}) => ({ hex, rough: 0.25, paint: (gc, R) => {
    gc.fillStyle = inkc; const p = pitch * su, n = Math.ceil((R * su) / p) + 2, ca = Math.cos(ang), sa = Math.sin(ang);
    gc.save(); gc.rotate(Math.PI / 4);
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) { const x = i * p, y = j * p, t = clamp(0.5 + (x * ca + y * sa) / (2 * R * su), 0, 1), tone = lerp(from, to, t * t * (3 - 2 * t)), r = p * Math.min(0.72, 0.62 * Math.sqrt(tone)); gc.beginPath(); gc.arc(x, y, r, 0, TAU); gc.fill(); }
    gc.restore();
  } });
  const stripes = (hex, inkc, { pitch = 0.022, duty = 0.5, ang = 0 } = {}) => ({ hex, rough: 0.4, paint: (gc, R) => { gc.fillStyle = inkc; gc.save(); gc.rotate(ang); const p = pitch * su, n = Math.ceil((R * su) / p) + 1; for (let i = -n; i <= n; i++) gc.fillRect(-R * su, i * p, 2 * R * su, p * duty); gc.restore(); } });
  const graph = (hex, inkc, { pitch = 0.013 } = {}) => ({ hex, rough: 0.3, paint: (gc, R) => { gc.strokeStyle = inkc; const p = pitch * su, n = Math.ceil((R * su) / p) + 1; for (let i = -n; i <= n; i++) { gc.globalAlpha = i % 5 === 0 ? 0.75 : 0.35; gc.lineWidth = Math.max(1, su * (i % 5 === 0 ? 0.0012 : 0.0007)); gc.beginPath(); gc.moveTo(i * p, -R * su); gc.lineTo(i * p, R * su); gc.moveTo(-R * su, i * p); gc.lineTo(R * su, i * p); gc.stroke(); } gc.globalAlpha = 1; } });
  // newsprint: columns of grey lines that stand for text
  const news = (hex, inkc) => ({ hex, rough: 0.75, paint: (gc, R) => {
    gc.fillStyle = inkc; const lh = 0.0058 * su, colW = 0.085 * su, gut = 0.012 * su, n = Math.ceil((R * su) / colW) + 1, rows = Math.ceil((R * su) / lh) + 1;
    for (let c = -n; c <= n; c++) { let para = Math.floor(rng.range(3, 9)); for (let r = -rows; r <= rows; r++) { if (--para < 0) { para = Math.floor(rng.range(4, 11)); continue; } const last = para === 0, w = (colW - gut) * (last ? rng.range(0.3, 0.8) : 1); gc.globalAlpha = 0.5; let x = c * colW; while (x < c * colW + w) { const ww = Math.min(c * colW + w - x, lh * rng.range(1.2, 4.5)); gc.fillRect(x, r * lh, ww - lh * 0.5, lh * 0.42); x += ww; } } }
    gc.globalAlpha = 1;
  } });
  const windows = (hex, lit, { cols = 3, rows = 5, w = 0.1, h = 0.2 } = {}) => ({ hex, rough: 0.45, paint: (gc) => { for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { if (rng() < 0.12) continue; gc.fillStyle = rng() < 0.7 ? lit : mixHex(lit, hex, 0.6); const ww = (w / cols) * 0.46, hh = (h / rows) * 0.5; gc.fillRect((-w / 2 + ((c + 0.5) * w) / cols - ww / 2) * su, (-h / 2 + ((r + 0.42) * h) / rows - hh / 2) * su, ww * su, hh * su); } } });

  // ---- paste one piece. torn: true, false or a function of the edge index
  const paste = (poly, pap, { torn = false, tilt = 0, shadow = 1, tornK = 1, frame = null } = {}) => {
    const isTorn = typeof torn === 'function' ? torn : () => torn;
    const P0 = tilt ? rot(poly, tilt * P.tilt) : poly, n = P0.length, outline = [], tears = [];
    for (let i = 0; i < n; i++) { const a = P0[i], b = P0[(i + 1) % n]; if (isTorn(i)) { const run = tornPts(a, b, tornK); outline.push(...run); tears.push(run.concat([b])); } else outline.push(a); }
    const bb = bbox(outline), id = (pieceNo++ * 37 + 11) % 251;
    // shadow and sheet
    g.save(); g.shadowColor = `rgba(${dark ? '0,0,0' : '40,30,20'},${(dark ? 0.55 : 0.3) * Math.min(1, P.shadow * shadow)})`; g.shadowBlur = 0.011 * su * shadow * P.shadow; g.shadowOffsetX = 0.0035 * su * shadow * P.shadow; g.shadowOffsetY = 0.006 * su * shadow * P.shadow;
    g.fillStyle = pap.hex; tr(g, outline); g.fill(); g.restore();
    g.save(); g.shadowColor = `rgba(0,0,0,${dark ? 0.5 : 0.22})`; g.shadowBlur = 0.0025 * su; g.shadowOffsetY = 0.0012 * su; g.fillStyle = pap.hex; tr(g, outline); g.fill(); g.restore();      // the tight contact shadow of thin paper
    if (pap.paint) { g.save(); tr(g, outline); g.clip(); const f = frame ?? [bb.cx, bb.cy, tilt * P.tilt]; g.translate(f[0] * su, f[1] * su); g.rotate(f[2]); pap.paint(g, bb.r * 1.05); g.restore(); }
    // notes for the shader
    gm.globalCompositeOperation = 'source-over'; gm.fillStyle = `rgb(${id},0,${Math.round(255 * clamp(pap.rough ?? 0.5, 0, 1))})`; tr(gm, outline); gm.fill();
    if (tears.length && !pap.coreless) {
      gm.save(); tr(gm, outline); gm.clip(); gm.globalCompositeOperation = 'lighter';
      for (const run of tears) {
        // the white core shows in a band of uneven width: stroke the tear in stretches, each a little wider or narrower
        for (let i0 = 0; i0 < run.length - 1;) { const i1 = Math.min(run.length - 1, i0 + Math.floor(rng.range(6, 22))), wdt = 0.0085 * tornK * P.tear * (0.25 + 1.1 * Math.pow(rng(), 1.5)); for (const [k, a] of [[2, 70], [1.3, 70], [0.7, 80]]) { gm.strokeStyle = `rgb(0,${a},0)`; gm.lineWidth = wdt * k * su; gm.beginPath(); gm.moveTo(run[i0][0] * su, run[i0][1] * su); for (let i = i0 + 1; i <= i1; i++) gm.lineTo(run[i][0] * su, run[i][1] * su); gm.stroke(); } i0 = i1; }
      }
      gm.restore();
    }
    return { outline, bb };
  };
  const tapeCol = dark ? 'rgba(226,214,178,0.5)' : 'rgba(236,222,176,0.62)';
  const tape = (x, y, ang, len = 0.1, wdt = 0.03) => {
    if (!P.tape) return;
    const pts = [], z = 7; for (let i = 0; i <= z; i++) pts.push([-len / 2 + (i % 2 ? 0.004 : 0), lerp(-wdt / 2, wdt / 2, i / z)]); for (let i = z; i >= 0; i--) pts.push([len / 2 - (i % 2 ? 0.004 : 0), lerp(-wdt / 2, wdt / 2, i / z)]);
    const q = rot(pts.map(([px, py]) => [x + px, y + py]), ang, [x, y]);
    g.save(); g.shadowColor = 'rgba(0,0,0,0.2)'; g.shadowBlur = 0.004 * su; g.shadowOffsetY = 0.0015 * su; g.fillStyle = tapeCol; tr(g, q); g.fill(); g.restore();
    g.save(); tr(g, q); g.clip(); g.translate(x * su, y * su); g.rotate(ang); const gr = g.createLinearGradient(0, (-wdt / 2) * su, 0, (wdt / 2) * su); gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.07)'); g.fillStyle = gr; g.fillRect((-len / 2) * su, (-wdt / 2) * su, len * su, wdt * su); g.restore();
    gm.globalCompositeOperation = 'source-over'; gm.fillStyle = 'rgb(253,0,20)'; tr(gm, q); gm.fill();
  };
  const rectP = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const circP = (cx, cy, r, n = 56, a0 = 0, a1 = TAU) => { const pts = []; for (let i = 0; i < n; i++) { const a = lerp(a0, a1, i / (a1 - a0 >= TAU - 1e-6 ? n : n - 1)); pts.push([cx + Math.cos(a) * r * (1 + 0.004 * Math.sin(a * 7 + cx * 30)), cy + Math.sin(a) * r * (1 + 0.004 * Math.cos(a * 5 + cy * 30))]); } return pts; };
  const inkOn = (hex) => (lum(hex) > 0.5 ? mixHex(inkHex, hex, dark ? 0.9 : 0.15) : mixHex(white, hex, 0.2));

  // =================================================================================================
  const motifs = {
    abstract() {
      const cx = X(0.5), cy = Y(0.5), s = m;
      // a big torn sheet, a field of halftone, a half disc, strips, a striped offcut, confetti
      paste(rectP(cx - A.w * 0.4, cy - A.h * 0.36, cx + A.w * 0.3, cy + A.h * 0.34), solid(col(0), 0.6), { torn: true, tilt: -0.05 * side });
      paste(rectP(cx - A.w * 0.08 * side - s * 0.26, cy - A.h * 0.44, cx - A.w * 0.08 * side + s * 0.3, cy + A.h * 0.06), halftone(lightest, inkOn(lightest), { ang: 1.1 }), { torn: (i) => i === 1 || i === 2, tilt: 0.07 * side });
      paste(rectP(cx + A.w * 0.12 * side - s * 0.2, cy + A.h * 0.02, cx + A.w * 0.12 * side + s * 0.26, cy + A.h * 0.42), solid(col(1), 0.5), { torn: (i) => i === 0, tilt: -0.04 * side });
      const dx = cx + A.w * 0.2 * side, dy = cy - A.h * 0.1, dr = s * 0.25;
      paste(circP(dx, dy, dr, 64, Math.PI * (side > 0 ? -0.5 : 0.5), Math.PI * (side > 0 ? 0.5 : 1.5)), solid(discCol === col(1) ? col(3) : discCol, 0.4), { tilt: 0.12 * side, shadow: 1.4 });
      paste(rectP(cx - A.w * 0.46, cy + A.h * 0.1, cx + A.w * 0.2, cy + A.h * 0.1 + s * 0.045), solid(col(2), 0.4), { tilt: -0.16 * side });
      paste(rectP(cx - A.w * 0.3, cy - A.h * 0.2, cx + A.w * 0.46, cy - A.h * 0.2 + s * 0.022), solid(inkHex, 0.3), { tilt: 0.09 * side });
      paste(rectP(cx - A.w * 0.34 * side - s * 0.1, cy + A.h * 0.14, cx - A.w * 0.34 * side + s * 0.1, cy + A.h * 0.42), stripes(lightest, col(3), { pitch: 0.02, ang: 0.0 }), { torn: (i) => i === 2, tilt: 0.1 * side });
      paste(rectP(cx + A.w * 0.3 * side - s * 0.11, cy + A.h * 0.2, cx + A.w * 0.3 * side + s * 0.11, cy + A.h * 0.36), graph(white, mixHex(col(0), white, 0.3)), { tilt: -0.14 * side });
      const tri = [[cx - A.w * 0.3 * side, cy - A.h * 0.42], [cx - A.w * 0.3 * side + s * 0.2, cy - A.h * 0.42 + s * 0.04], [cx - A.w * 0.3 * side + s * 0.05, cy - A.h * 0.42 + s * 0.22]];
      paste(tri, solid(col(4), 0.4), { tilt: 0.2 * side, shadow: 1.3 });
      for (let i = 0; i < 5; i++) { const r = s * rng.range(0.014, 0.026), x = cx + A.w * rng.range(-0.44, 0.44), y = cy + A.h * rng.range(-0.44, 0.44); paste(i % 2 ? circP(x, y, r, 20) : rectP(x - r, y - r, x + r, y + r), solid([col(2), inkHex, col(4), col(3), white][i], 0.4), { tilt: rng.range(-0.6, 0.6), shadow: 0.8 }); }
      tape(cx - A.w * 0.4 + 0.02, cy - A.h * 0.36 + 0.012, -0.6 * side, 0.1 * clamp(s / 0.6, 0.8, 1.2)); tape(cx + A.w * 0.3, cy + A.h * 0.33, 0.5 * side, 0.09);
    },

    landscape() {
      // the sky is one torn sheet of halftone; ranges are torn strips, the nearest darkest
      const x0 = X(0.02), x1 = X(0.98), y0 = Y(0.03), y1 = Y(0.97), skyHex = mixHex(lightest, col(0), dark ? 0.55 : 0.28);
      paste(rectP(x0, y0, x1, y1), halftone(skyHex, mixHex(col(0), skyHex, 0.25), { ang: Math.PI / 2, from: 0.04, to: 0.7, pitch: 0.012 }), { torn: true, tilt: -0.012 * side });
      const sunX = X(0.5 + side * (wide ? 0.28 : 0.2)), sunY = Y(wide ? 0.3 : 0.24), sr = m * (wide ? 0.15 : 0.13);
      paste(circP(sunX, sunY, sr), solid(discCol, 0.35), { shadow: 1.3 });
      const n = 5, tones = [mixHex(col(0), lightest, 0.55), col(3), col(1), col(0), dark ? mixHex(darkest, '#0b0b10', 0.45) : darkest === col(0) ? inkHex : darkest];
      const kinds = [(h) => solid(h, 0.6), (h) => solid(h, 0.5), (h) => news(mixHex(h, white, 0.25), mixHex(h, inkHex, 0.6)), (h) => solid(h, 0.7), (h) => solid(h, 0.55)];
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1), base = lerp(0.46, 0.9, Math.pow(t, 0.85)), amp = lerp(0.2, 0.1, t), ph = rng.range(0, TAU), k1 = rng.range(2.2, 3.4), pkx = 0.5 - side * 0.2 * Math.cos(i * 2.2), top = [], steps = 9;
        for (let j = 0; j <= steps; j++) { const u = j / steps, yy = base - amp * (0.55 * Math.exp(-(((u - pkx) / 0.3) ** 2)) + 0.3 * Math.sin(u * k1 + ph) * 0.5 + 0.22 * noise.noise3(u * 3.1, i * 5.7, 2.2)); top.push([lerp(x0 - 0.012, x1 + 0.012, u) + (j === 0 ? -1 : j === steps ? 1 : 0) * rng.range(0, 0.012), Y(yy)]); }
        const poly = top.concat([[x1 + rng.range(0, 0.014), y1 + rng.range(-0.004, 0.01)], [x0 - rng.range(0, 0.014), y1 + rng.range(-0.004, 0.01)]]);
        paste(poly, kinds[i](tones[i]), { torn: (e) => e < steps, tornK: 1.25, frame: [X(0.5), Y(0.7), rng.range(-0.06, 0.06)] });
      }
      // two birds snipped out of dark paper, and tape at two corners
      for (const [du, dv, k] of [[0, 0, 1], [0.07, 0.035, 0.72]]) { const bx = X(0.5 - side * 0.2 + du), by2 = Y((wide ? 0.2 : 0.17) + dv), q = m * 0.035 * k; paste([[bx - q, by2 - q * 0.3], [bx - q * 0.3, by2 - q * 0.42], [bx, by2], [bx + q * 0.35, by2 - q * 0.5], [bx + q, by2 - q * 0.36], [bx + q * 0.3, by2 - q * 0.18], [bx, by2 + q * 0.22], [bx - q * 0.3, by2 - q * 0.12]], solid(inkHex, 0.3), { shadow: 0.7 }); }
      tape(x0 + 0.01, y0 + 0.012, -0.7, 0.1); tape(x1 - 0.012, y0 + 0.014, 0.75, 0.1);
    },

    city() {
      const x0 = X(0.02), x1 = X(0.98), y0 = Y(0.03), y1 = Y(0.97), skyHex = col(0);
      paste(rectP(x0, y0, x1, y1), solid(skyHex, 0.6), { torn: true, tilt: 0.012 * side });
      const sunX = X(0.5 + side * (wide ? 0.3 : 0.22)), sunY = Y(wide ? 0.28 : 0.2), sr = m * (wide ? 0.14 : 0.12);
      paste(circP(sunX, sunY, sr), halftone(discCol === skyHex ? lightest : discCol, mixHex(col(1), discCol, 0.35), { ang: 0.9, from: 0.05, to: 0.55, pitch: 0.009 }), { shadow: 1.2 });
      // a far row of plain blocks, then a near row of printed ones
      const lit = lum(col(1)) > 0.55 ? col(1) : lightest, stock = [col(1), col(2), col(3), col(4), lightest, inkHex].filter((c) => c !== skyHex);
      const row = (yb, hMin, hMax, wMin, wMax, far) => {
        for (let x = x0 - 0.01 + rng.range(0, 0.02); x < x1 - 0.02;) {
          const w = Math.min(m * rng.range(wMin, wMax), x1 + 0.012 - x), h = A.h * rng.range(hMin, hMax) * (Math.abs(x + w / 2 - sunX) < sr * 1.1 ? 0.7 : 1), hex = far ? mixHex(rng.pick(stock), skyHex, 0.45) : rng.pick(stock), kind = rng();
          const body = rectP(x, yb - h, x + w, y1 + 0.006), cxb = x + w / 2, cyb = (yb - h + y1) / 2, tl = rng.range(-0.025, 0.025);
          let pap = solid(hex, 0.5);
          if (!far && kind < 0.5) pap = windows(hex, lum(hex) > 0.6 ? mixHex(inkHex, hex, 0.25) : lit, { cols: Math.max(2, Math.round(w / (m * 0.05))), rows: Math.max(2, Math.round((y1 - yb + h) / (m * 0.075))), w: w * 0.86, h: (y1 - yb + h) * 0.9 });
          else if (!far && kind < 0.66) pap = graph(lum(hex) > 0.5 ? hex : white, lum(hex) > 0.5 ? inkOn(hex) : hex, { pitch: 0.016 });
          else if (!far && kind < 0.8) pap = stripes(hex, mixHex(hex, lum(hex) > 0.5 ? inkHex : white, 0.35), { pitch: 0.016, ang: Math.PI / 2, duty: 0.4 });
          else if (!far && kind < 0.9) pap = news(mixHex(white, hex, 0.2), mixHex(inkHex, white, 0.3));
          paste(body, pap, { tilt: tl, torn: (e) => e === 0 && rng() < 0.3, frame: [cxb, cyb, tl * P.tilt] });
          if (!far && rng() < 0.4) paste([[x - w * 0.06, yb - h + 0.004], [cxb, yb - h - w * rng.range(0.35, 0.55)], [x + w * 1.06, yb - h + 0.004]], solid(rng.pick(stock), 0.45), { tilt: tl });
          else if (!far && rng() < 0.3) paste(rectP(x + w * 0.2, yb - h - m * 0.05, x + w * 0.36, yb - h + 0.006), solid(hex, 0.5), { tilt: tl });
          x += w * rng.range(0.82, 1.02);
        }
      };
      row(Y(0.7), 0.28, 0.5, 0.1, 0.17, true);
      row(Y(0.84), 0.2, 0.52, 0.12, 0.22, false);
      // the street: one torn strip of dark paper
      paste([[x0 - 0.014, Y(0.9)], [x1 + 0.014, Y(0.89)], [x1 + 0.012, y1 + 0.012], [x0 - 0.012, y1 + 0.01]], solid(dark ? mixHex(inkHex, palette.bg, 0.75) : inkHex, 0.7), { torn: (e) => e === 0, tornK: 1.2 });
      tape(x0 + 0.012, y0 + 0.012, -0.7, 0.1); tape(x1 - 0.01, y1 - 0.02, -0.6, 0.09);
    },
  };
  (motifs[P.motif] ?? motifs.abstract)();
  // nothing may lie on the copy: lay the backing sheet back over those parts
  for (const q of quiet) { g.fillStyle = palette.bg; g.fillRect((q.x0 - 0.012) * su, (q.y0 - 0.012) * su, (q.x1 - q.x0 + 0.024) * su, (q.y1 - q.y0 + 0.024) * su); gm.globalCompositeOperation = 'source-over'; gm.fillStyle = 'rgb(0,0,64)'; gm.fillRect((q.x0 - 0.012) * su, (q.y0 - 0.012) * su, (q.x1 - q.x0 + 0.024) * su, (q.y1 - q.y0 + 0.024) * su); }

  const mkTex = (gc, filter) => { const t = new THREE.CanvasTexture(gc.canvas); t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = false; t.minFilter = t.magFilter = filter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; };
  scene.add(backgroundQuad(/* glsl */`
    varying vec2 vUv; uniform sampler2D tCol, tMat; uniform vec2 uAsp; uniform vec3 uCore; uniform float uGrain, uSeed, uFine, uDark;
    ${GLSL_NOISE_KIT}
    ${GLSL_DITHER}
    void main(){
      vec2 p = vec2(vUv.x, 1.0 - vUv.y), q = p * uAsp;
      vec3 c = texture2D(tCol, vUv).rgb, mt = texture2D(tMat, vUv).rgb;
      float id = floor(mt.r * 255.0 + 0.5), rough = mt.b, isTape = step(252.5, id);
      // every sheet has its own grain: the same pattern, turned and shifted by the sheet's number
      float a = id * 2.399, cs = cos(a), sn = sin(a); vec2 gq = mat2(cs, -sn, sn, cs) * q + id * vec2(0.37, 0.61);
      float tooth = noise2(gq * 520.0 * uFine), cloud = fbm2(gq * 7.0 + uSeed, 2), fibre = noise2(gq * vec2(60.0, 520.0) * uFine + 9.0);
      float k = uGrain * (0.35 + 1.1 * rough) * (1.0 - 0.8 * isTape);
      c *= 1.0 + k * (0.022 * tooth + 0.02 * cloud + 0.016 * fibre) * mix(1.0, 1.6, uDark);
      // a torn edge shows the white core of the sheet; its inner border is ragged with pulled fibres
      float rim = mt.g;
      float feather = 0.55 * noise2(q * 300.0 * uFine + 3.0) + 0.45 * noise2(gq * vec2(90.0, 700.0) * uFine + 21.0);
      float w = smoothstep(0.34, 0.5, rim + 0.2 * feather) * (1.0 - isTape);
      vec3 core = uCore * (1.0 + 0.035 * tooth + 0.05 * feather);
      c = mix(c, core, w * 0.97);
      c = clamp(c, 0.0, 1.0);
      gl_FragColor = vec4(mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)), 1.0);
      #include <colorspace_fragment>
      gl_FragColor.rgb += ditherNoise(gl_FragCoord.xy);
    }`, {
    tCol: { value: mkTex(g, THREE.LinearFilter) }, tMat: { value: mkTex(gm, THREE.LinearFilter) }, uAsp: { value: new THREE.Vector2(sx, sy) }, uCore: { value: srgbVec('#f7f4ec') },
    uGrain: { value: P.grain }, uSeed: { value: (seed % 83) * 0.47 }, uFine: { value: Math.min(1, Math.min(W, H) / 1900) }, uDark: { value: dark ? 1 : 0 },
  }));
  void quietUniforms; void GLSL_QUIET;
  ctx.frame({ radius: 1, fov: 30, dir: [0, 0, 1] });
}
