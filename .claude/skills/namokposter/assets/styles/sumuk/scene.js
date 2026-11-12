// Sumuk (수묵) — East Asian ink wash. Ink is laid on absorbent paper in three ways and all three show:
// wet washes that are darkest where the brush touched down and thin out into mist, dry-brush strokes
// whose hairs run out of ink and leave the paper showing through ("flying white"), and small wet dabs.
// Most of the sheet stays bare — the emptiness is the mist, the water and the sky — and that is where
// the copy goes. A small vermilion seal signs the picture.
//
// How it is made: everything is painted on a 2D canvas as ink density (R), a light colour wash (G) and
// the seal (B). Washes are stacks of translucent bands that follow a crest line; brush strokes are drawn
// hair by hair, each hair with its own load of ink that runs dry along the stroke. The shader turns
// density into ink on paper: it lets the ink creep along the fibres, gather at wet edges and break up on
// the tooth of the sheet, and it lays a bank of mist over whatever would run under the copy.
//
// Palette: bg = paper · colors[0] = dense ink · colors[1] = dilute ink (the tint of the pale washes)
//          colors[2] = light colour wash (blossoms) · colors[3] or accent = seal. Dark bg: gold or silver
//          ink on dyed paper (감지 금니).
// Motifs:  mountains (ranges in mist, pines, a boat) · bamboo (stalks and leaves) · plum (a blossoming
//          branch) · strokes (abstract dry-brush sweeps)
import { makeNoise, backgroundQuad, canvasTexture, deformPolygon, quietUniforms, srgbVec, GLSL_NOISE_KIT, GLSL_QUIET, GLSL_DITHER } from '/skill/assets/web/scene-lib.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;

export default function build(ctx) {
  const { THREE, scene, palette, params, aspect, seed, rng, width: W, height: H } = ctx;
  const sx = Math.max(aspect, 1), sy = Math.max(1 / aspect, 1);                    // the sheet in short-side units
  const noise = makeNoise(seed * 29 + 5);
  const P = {
    motif: String(params.motif ?? 'mountains'), ink: clamp(params.ink ?? 1, 0.4, 1.6), dry: clamp(params.dry ?? 1, 0, 2), mist: clamp(params.mist ?? 1, 0, 2),
    seal: params.seal ?? true, grain: clamp(params.grain ?? 1, 0, 2), bleed: clamp(params.bleed ?? 1, 0, 2),
  };
  const paper = srgbVec(palette.bg), dark = 0.2126 * paper.x + 0.7152 * paper.y + 0.0722 * paper.z < 0.3;
  const cols = palette.colors, inkHex = cols[0] ?? palette.ink, diluteHex = cols[1] ?? inkHex, tintHex = cols[2] ?? palette.accent, sealHex = cols[3] ?? palette.accentOriginal ?? palette.accent;

  // ---- where the copy sits, and the room the picture has
  const quiet = (ctx.quiet || []).map(([x0, y0, x1, y1]) => ({ x0: x0 * sx, y0: y0 * sy, x1: x1 * sx, y1: y1 * sy }));
  const qDist = (x, y) => { let d = 9; for (const r of quiet) { const ex = Math.abs(x - (r.x0 + r.x1) / 2) - (r.x1 - r.x0) / 2, ey = Math.abs(y - (r.y0 + r.y1) / 2) - (r.y1 - r.y0) / 2; d = Math.min(d, Math.hypot(Math.max(ex, 0), Math.max(ey, 0)) + Math.min(Math.max(ex, ey), 0)); } return d; };
  const ar = ctx.artRect || [0, 0, 1, 1];
  const A = { x0: ar[0] * sx, y0: ar[1] * sy, x1: ar[2] * sx, y1: ar[3] * sy };
  for (const q of quiet) {                                                         // keep the box off the copy where that costs little
    if (q.x1 < A.x0 || q.x0 > A.x1 || q.y1 < A.y0 || q.y0 > A.y1) continue;
    const area = (b) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
    const opts = [{ ...A, x0: Math.max(A.x0, q.x1) }, { ...A, x1: Math.min(A.x1, q.x0) }, { ...A, y0: Math.max(A.y0, q.y1) }, { ...A, y1: Math.min(A.y1, q.y0) }];
    const best = opts.reduce((a, b) => (area(b) > area(a) ? b : a));
    if (area(best) >= 0.6 * area(A)) Object.assign(A, best);
  }
  // a side of the box that lies at the edge of the sheet is open: the picture runs off the paper there
  const open = { l: A.x0 < 0.1, r: A.x1 > sx - 0.1, t: A.y0 < 0.1, b: A.y1 > sy - 0.06 };
  A.w = A.x1 - A.x0; A.h = A.y1 - A.y0; A.m = Math.min(A.w, A.h);
  const m = A.m, ax = (u) => A.x0 + u * A.w, ay = (v) => A.y0 + v * A.h, wide = A.w > A.h * 1.3;
  // the picture leans away from the copy: -1 = its weight is on the left, +1 = on the right
  const copy = quiet[0], lean = open.r && !open.l ? 1 : open.l && !open.r ? -1 : copy && (copy.x0 + copy.x1) / 2 > sx / 2 ? -1 : rng() < 0.5 ? -1 : 1;

  // ---- paint
  const kc = Math.min(1.25, 3072 / Math.max(W, H)), cw = Math.round(W * kc), chh = Math.round(H * kc), su = Math.min(cw, chh);
  const INK = (a) => `rgba(0,255,255,${clamp(a, 0, 1).toFixed(4)})`, TINT = (a) => `rgba(255,0,255,${clamp(a, 0, 1).toFixed(4)})`, SEAL = (a) => `rgba(255,255,0,${clamp(a, 0, 1).toFixed(4)})`;
  const LIFT = (a) => `rgba(255,0,0,${clamp(a, 0, 1).toFixed(4)})`;                 // with 'lighter': takes ink off again
  let sealAt = null;

  const tex = canvasTexture(cw, chh, (g) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, cw, chh); g.globalCompositeOperation = 'multiply'; g.lineJoin = 'round'; g.lineCap = 'round';
    const D = P.ink;
    const trace = (pts, close = true) => { g.beginPath(); g.moveTo(pts[0][0] * su, pts[0][1] * su); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0] * su, pts[i][1] * su); if (close) g.closePath(); };
    const resample = (pts, step) => {
      const out = [pts[0]]; let carry = 0;
      for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]); let s = step - carry; while (s <= l) { out.push([lerp(a[0], b[0], s / l), lerp(a[1], b[1], s / l)]); s += step; } carry = l - (s - step); }
      if (out.length < 2) out.push(pts[pts.length - 1]);
      return out;
    };
    const smooth = (pts, it = 2) => { let c = pts; for (let k = 0; k < it; k++) { const nx = [c[0]]; for (let j = 0; j < c.length - 1; j++) nx.push([lerp(c[j][0], c[j + 1][0], 0.25), lerp(c[j][1], c[j + 1][1], 0.25)], [lerp(c[j][0], c[j + 1][0], 0.75), lerp(c[j][1], c[j + 1][1], 0.75)]); nx.push(c[c.length - 1]); c = nx; } return c; };

    // --- a wet wash under a crest line y = f(x): dark where the brush touched down, thinning out below
    const washBelow = (f, xa, xb, depth, tone, { layers = 30, jit = 0.0018, grad = 1.7, fadeL = 0, fadeR = 0, ragged = 1 } = {}) => {
      const n = Math.max(8, Math.ceil((xb - xa) / 0.005)), a = 1 - Math.pow(1 - clamp(tone * D, 0, 0.97), 1 / layers), id = rng.range(0, 99);
      let style = INK(a);
      if (fadeL > 0 || fadeR > 0) { const gr = g.createLinearGradient(xa * su, 0, xb * su, 0), wd = xb - xa; gr.addColorStop(0, INK(fadeL > 0 ? 0 : a)); if (fadeL > 0) gr.addColorStop(Math.min(0.49, fadeL / wd), INK(a)); if (fadeR > 0) gr.addColorStop(Math.max(0.51, 1 - fadeR / wd), INK(a)); gr.addColorStop(1, INK(fadeR > 0 ? 0 : a)); style = gr; }
      g.fillStyle = style;
      for (let l = 0; l < layers; l++) {
        const dk = Math.pow((l + 1) / layers, grad), dep = typeof depth === 'function' ? depth : () => depth;
        g.beginPath();
        for (let i = 0; i <= n; i++) { const x = lerp(xa, xb, i / n), y = f(x) + jit * (noise.noise3(x * 55, l * 1.7 + id, 1.1) + 0.6 * noise.noise3(x * 160, l * 0.9 + id, 3.3)); if (i) g.lineTo(x * su, y * su); else g.moveTo(x * su, y * su); }
        for (let i = n; i >= 0; i--) { const x = lerp(xa, xb, i / n), y = f(x) + dep(x) * dk * (1 + ragged * (0.35 * noise.noise3(x * 4.5, l * 0.31 + id, 5.5) + 0.2 * noise.noise3(x * 14, l * 0.53 + id, 8.8))); g.lineTo(x * su, y * su); }
        g.closePath(); g.fill();
      }
    };
    // --- a soft-edged pool of wash (or of colour): one shape, many differently ragged copies
    const pool = (pts, tone, { layers = 14, style = INK, amount = 0.4, rounds = 3 } = {}) => {
      const a = 1 - Math.pow(1 - clamp(tone, 0, 0.97), 1 / layers);
      g.fillStyle = style(a);
      for (let l = 0; l < layers; l++) { const poly = deformPolygon(pts, rng, { rounds, amount }); trace(poly); g.fill(); }
    };
    const blob = (x, y, rx, ry, rot = 0, n = 9) => { const pts = [], c = Math.cos(rot), s = Math.sin(rot); for (let i = 0; i < n; i++) { const t = (i / n) * TAU, px = Math.cos(t) * rx * rng.range(0.8, 1.2), py = Math.sin(t) * ry * rng.range(0.8, 1.2); pts.push([x + px * c - py * s, y + px * s + py * c, rng.range(0.4, 1.3)]); } return pts; };
    // --- the brush, hair by hair. width(t) in units; every hair carries its own load, which runs out along the stroke
    const brush = (path, width, { tone = 0.9, dry = 0.5, wet = 0, prof = null, taper = [0.12, 0.2], grainF = 1 } = {}) => {
      const rs = resample(smooth(path, 2), 3.2 / su), n = rs.length; if (n < 3) return;
      const cum = [0]; for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(rs[i][0] - rs[i - 1][0], rs[i][1] - rs[i - 1][1]));
      const tot = cum[n - 1], nrm = rs.map((p, i) => { const a = rs[Math.max(0, i - 1)], b = rs[Math.min(n - 1, i + 1)]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l]; });
      const wf = typeof width === 'function' ? width : () => width;
      const shape = (t) => Math.pow(sstep(0, taper[0], t), 0.6) * Math.pow(sstep(1, 1 - taper[1], t), 0.75);      // the brush is set down and lifted off
      let wmax = 0; const ws = rs.map((p, i) => { const w = wf(cum[i] / tot) * shape(cum[i] / tot); wmax = Math.max(wmax, w); return w; });
      const nb = clamp(Math.round((wmax * su) / 1.8), 4, 150), lw = Math.max(1, ((wmax * su) / nb) * 1.7), id = rng.range(0, 999), dr = dry * P.dry;
      if (wet > 0) { const left = [], right = []; for (let i = 0; i < n; i += 2) { left.push([rs[i][0] + nrm[i][0] * ws[i] * 0.46, rs[i][1] + nrm[i][1] * ws[i] * 0.46]); right.push([rs[i][0] - nrm[i][0] * ws[i] * 0.46, rs[i][1] - nrm[i][1] * ws[i] * 0.46]); } trace(left.concat(right.reverse())); g.fillStyle = INK(tone * D * wet); g.fill(); }
      g.lineWidth = lw; g.lineCap = 'butt';
      for (let b = 0; b < nb; b++) {
        const o = ((b + 0.5) / nb) * 2 - 1 + rng.range(-0.4, 0.4) / nb;
        const load = 0.66 + 0.7 * noise.noise3(b * 0.2, id, 0.3) + 0.35 * noise.noise3(b * 0.83, id, 7.7) + (prof ? prof(o) : 0);
        let run = [], bucket = -1;
        const flush = () => { if (run.length > 1 && bucket > 0) { g.strokeStyle = INK((bucket / 7) * tone * D * 0.8); g.beginPath(); g.moveTo(run[0][0], run[0][1]); for (let j = 1; j < run.length; j++) g.lineTo(run[j][0], run[j][1]); g.stroke(); } };
        for (let i = 0; i < n; i++) {
          const t = cum[i] / tot, a = load - dr * (0.2 + 1.15 * Math.pow(t, 0.85)) + 0.55 * noise.noise3(cum[i] * 16 * grainF, b * 0.33 + id, 2.2) + 0.3 * noise.noise3(cum[i] * 70 * grainF, b * 1.3 + id, 4.4);
          const q8 = Math.round(clamp(a, 0, 1) * 7), px = (rs[i][0] + nrm[i][0] * o * ws[i] * 0.5) * su, py = (rs[i][1] + nrm[i][1] * o * ws[i] * 0.5) * su;
          if (q8 !== bucket) { run.push([px, py]); flush(); run = [[px, py]]; bucket = q8; } else run.push([px, py]);
        }
        flush();
      }
      g.lineCap = 'round';
    };
    // --- a single line of the brush tip: swelling and thinning, breaking where it dries
    const tipLine = (path, w, tone, { breakup = 0.25, taper = true } = {}) => {
      const rs = resample(path, 4 / su), n = rs.length, id = rng.range(0, 99);
      for (let i = 1; i < n; i++) {
        const t = i / (n - 1), k = noise.noise3(i * 0.09, id, 1.5), a = tone * D * clamp(0.75 + 0.7 * k - breakup * (0.4 + noise.noise3(i * 0.4, id, 6.1)), 0, 1);
        if (a < 0.04) continue;
        g.lineWidth = Math.max(0.7, w * su * (taper ? Math.pow(Math.sin(Math.PI * clamp(t, 0.03, 0.97)), 0.45) : 1) * (0.85 + 0.4 * k)); g.strokeStyle = INK(a);
        g.beginPath(); g.moveTo(rs[i - 1][0] * su, rs[i - 1][1] * su); g.lineTo(rs[i][0] * su, rs[i][1] * su); g.stroke();
      }
    };
    // --- one wet stroke with a pointed tip (a leaf, a petal, a reed): belly near the start, a dry tail
    const leafStroke = (x, y, ang, len, w, tone, { bend = 0, belly = 0.36, dryTail = 0.5 } = {}) => {
      const c = Math.cos(ang), s = Math.sin(ang), left = [], right = [], N = 18;
      const axis = (t) => { const k = bend * len * (t * t); return [x + c * len * t - s * k, y + s * len * t + c * k]; };
      for (let i = 0; i <= N; i++) { const t = i / N, h = 0.5 * w * (t < belly ? Math.pow(Math.sin((Math.PI / 2) * (t / belly)), 0.7) : Math.pow(Math.cos((Math.PI / 2) * ((t - belly) / (1 - belly))), 1.25)); const a = axis(t), b = axis(Math.min(1, t + 0.02)), l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / l, ny = (b[0] - a[0]) / l; left.push([a[0] + nx * h, a[1] + ny * h]); right.push([a[0] - nx * h, a[1] - ny * h]); }
      const poly = left.concat(right.reverse());
      g.fillStyle = INK(tone * D * 0.72); trace(poly); g.fill();
      g.fillStyle = INK(tone * D * 0.3); trace(deformPolygon(poly.filter((_, i) => i % 3 === 0).map((p) => [p[0], p[1], 0.5]), rng, { rounds: 2, amount: 0.12 })); g.fill();   // a second, slightly wandering layer: uneven ink
      // hairs that ran dry towards the tip
      if (dryTail > 0 && len * su > 30) {
        g.globalCompositeOperation = 'lighter'; g.lineCap = 'butt';
        const k = Math.round(clamp((w * su) / 5, 2, 9) * dryTail * P.dry);
        for (let j = 0; j < k; j++) { const o = rng.range(-0.7, 0.7), t0 = rng.range(0.35, 0.75), t1 = Math.min(1, t0 + rng.range(0.2, 0.5)), p0 = axis(t0), p1 = axis(t1), hw = 0.5 * w * Math.cos((Math.PI / 2) * ((t0 - belly) / (1 - belly))); g.strokeStyle = LIFT(rng.range(0.25, 0.7)); g.lineWidth = Math.max(0.8, w * su * rng.range(0.03, 0.08)); g.beginPath(); g.moveTo((p0[0] - s * o * hw) * su, (p0[1] + c * o * hw) * su); g.lineTo((p1[0] - s * o * hw * 0.3) * su, (p1[1] + c * o * hw * 0.3) * su); g.stroke(); }
        g.globalCompositeOperation = 'multiply'; g.lineCap = 'round';
      }
    };
    const dab = (x, y, rx, ry, tone, rot = 0) => pool(blob(x, y, rx, ry, rot, 7), tone * D, { layers: 5, amount: 0.3, rounds: 2 });
    // --- mist: a long soft cloud that takes the ink off again
    const mistBand = (x, y, rx, ry, a) => {
      g.save(); g.globalCompositeOperation = 'lighter'; g.translate(x * su, y * su); g.scale(rx * su, ry * su);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1); gr.addColorStop(0, LIFT(a)); gr.addColorStop(0.5, LIFT(a * 0.6)); gr.addColorStop(1, LIFT(0)); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill(); g.restore();
    };
    const calm = (x, y, r = 0.03) => qDist(x, y) > r;
    // --- small figures of speech
    const birds = (x, y, s, n) => { for (let i = 0; i < n; i++) { const bx = x + s * (i * 0.9 + rng.range(-0.2, 0.2)) * lean * -1, by = y + s * (rng.range(-0.5, 0.5) - i * 0.25), w = s * rng.range(0.32, 0.5); if (!calm(bx, by, 0.04)) continue; tipLine([[bx - w, by - w * 0.25], [bx - w * 0.4, by - w * 0.42], [bx, by]], 0.0022, 0.7, { breakup: 0 }); tipLine([[bx, by], [bx + w * 0.45, by - w * 0.5], [bx + w, by - w * 0.3]], 0.0022, 0.7, { breakup: 0 }); } };
    const pine = (x, y, h, tone) => {                                                // a pine: a leaning trunk and flat tiers of needles
      const leanT = rng.range(-0.22, 0.22), top = [x + leanT * h, y - h], trunk = [[x, y], [x + leanT * h * 0.35 + h * 0.04, y - h * 0.4], [x + leanT * h * 0.75 - h * 0.03, y - h * 0.75], top];
      brush(trunk, (t) => h * lerp(0.075, 0.03, t), { tone, dry: 0.55, taper: [0.02, 0.1], prof: (o) => 0.25 * Math.abs(o) });
      const tiers = h * su > 90 ? 5 : 3;
      for (let i = 0; i < tiers; i++) {
        const t = lerp(0.42, 1.02, i / (tiers - 1)), cx = lerp(x, top[0], t) + h * rng.range(-0.12, 0.12), cy = y - h * t, wd = h * lerp(0.42, 0.2, i / (tiers - 1)) * rng.range(0.8, 1.2);
        for (let k = 0; k < 3; k++) dab(cx + wd * rng.range(-0.55, 0.55), cy + h * rng.range(-0.02, 0.03), wd * rng.range(0.35, 0.6), h * rng.range(0.035, 0.06), tone * rng.range(0.6, 0.95), rng.range(-0.15, 0.15));
        if (h * su > 90) for (let k = 0; k < 7; k++) { const px = cx + wd * rng.range(-0.9, 0.9), py = cy + h * rng.range(-0.03, 0.03); tipLine([[px, py], [px + h * rng.range(-0.03, 0.03), py - h * rng.range(0.03, 0.07)]], 0.0016, tone * 0.8, { breakup: 0 }); }
      }
    };
    const seal = (x, y, s) => {                                                      // a square name seal: carved bars, no letters
      if (!P.seal) return;
      g.fillStyle = SEAL(0.96); trace(deformPolygon([[x, y, 0.4], [x + s, y, 0.4], [x + s, y + s, 0.4], [x, y + s, 0.4]], rng, { rounds: 3, amount: 0.035 })); g.fill();
      g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(0,0,255,0.97)'; g.lineWidth = s * su * 0.075; g.lineCap = 'butt';
      const cell = (cx, cy, cs, kind) => {
        const L = (x0, y0, x1, y1) => { g.beginPath(); g.moveTo((cx + x0 * cs) * su, (cy + y0 * cs) * su); g.lineTo((cx + x1 * cs) * su, (cy + y1 * cs) * su); g.stroke(); };
        if (kind === 0) { L(0.1, 0.2, 0.9, 0.2); L(0.5, 0.2, 0.5, 0.9); L(0.15, 0.55, 0.85, 0.55); L(0.1, 0.9, 0.9, 0.9); }
        else if (kind === 1) { L(0.15, 0.1, 0.15, 0.9); L(0.15, 0.1, 0.85, 0.1); L(0.85, 0.1, 0.85, 0.9); L(0.4, 0.4, 0.4, 0.9); L(0.62, 0.4, 0.62, 0.9); L(0.4, 0.4, 0.62, 0.4); }
        else if (kind === 2) { L(0.1, 0.15, 0.9, 0.15); L(0.1, 0.5, 0.9, 0.5); L(0.1, 0.85, 0.9, 0.85); L(0.3, 0.15, 0.3, 0.5); L(0.7, 0.5, 0.7, 0.85); }
        else { L(0.5, 0.08, 0.5, 0.92); L(0.12, 0.3, 0.88, 0.3); L(0.2, 0.3, 0.2, 0.75); L(0.8, 0.3, 0.8, 0.75); L(0.2, 0.75, 0.8, 0.75); }
      };
      const kinds = rng.shuffle([0, 1, 2, 3]), pad = s * 0.12, cs = (s - pad * 2) / 2;
      for (let i = 0; i < 4; i++) cell(x + pad + (i % 2) * cs, y + pad + Math.floor(i / 2) * cs, cs, kinds[i]);
      g.globalCompositeOperation = 'multiply'; g.lineCap = 'round';
    };
    const placeSeal = (cands, s) => { for (const [x, y] of cands) if (x > 0.03 && x + s < sx - 0.03 && y > 0.03 && y + s < sy - 0.03 && qDist(x + s / 2, y + s / 2) > s * 1.2) { sealAt = [x, y, s]; return; } };

    // =============================================================================================
    const motifs = {
      mountains() {
        // the range stands on the open side and sinks into mist towards the copy
        const xa = open.l ? -0.06 : A.x0 - 0.04, xb = open.r ? sx + 0.06 : A.x1 + 0.04, span = xb - xa;
        const top = open.t ? Math.max(0.05, A.y0 - 0.02) : A.y0 + 0.02, foot = A.y1 - (open.b ? 0 : 0.02), room = foot - top;
        const hx = clamp(ctx.focus.x * sx + lean * 0.05 * A.w, xa + 0.22 * span, xb - 0.22 * span);           // the main peak
        const fadeL = open.l ? 0 : 0.3 * span, fadeR = open.r ? 0 : 0.3 * span;
        const env = (x) => (open.l ? 1 : sstep(xa, xa + 0.42 * span, x)) * (open.r ? 1 : sstep(xb, xb - 0.42 * span, x));   // every range sinks towards a closed side
        const rid = (x, f, o, oct = 4) => { let v = 0, a = 0.5, fr = f; for (let k = 0; k < oct; k++) { v += a * (1 - 2 * Math.abs(noise.noise3(x * fr + o, k * 3.1 + o, 0.7))); a *= 0.5; fr *= 2.1; } return v; };
        // a range = a few peaks, each with its own two flanks (one hollow, one full), roughened in proportion to its height
        const mount = (list, rough, o) => (x) => { let v = 0; for (const [c, wl, wr, h, el, er] of list) { const dx = x - c, w = dx < 0 ? wl : wr; v = Math.max(v, h * Math.pow(Math.max(0, 1 - Math.abs(dx) / w), dx < 0 ? el : er)); } return v * (1 + rough * rid(x, 5.5 / span, o, 4)) + 0.012 * rid(x, 9 / span, o + 5, 3); };
        const pkr = (c, w, h) => [hx + lean * c * span + rng.range(-0.03, 0.03) * span, w * span * rng.range(0.9, 1.3), w * span * rng.range(0.9, 1.3), h * rng.range(0.9, 1.08), rng.range(0.95, 1.55), rng.range(0.95, 1.55)];
        const ranges = [];
        const m0 = mount([pkr(-0.36, 0.3, 0.3), pkr(0.28, 0.32, 0.25), pkr(0.62, 0.3, 0.2)], 0.1, 3.3);
        ranges.push({ f: (x) => top + room * 0.56 - room * m0(x) * env(x), base: top + room * 0.56, tone: 0.15, depth: room * 0.1, soft: 0.004 });
        const m1 = mount([pkr(-0.19, 0.2, 0.42), pkr(-0.42, 0.2, 0.26), pkr(0.4, 0.26, 0.32)], 0.14, 9.1);
        ranges.push({ f: (x) => top + room * 0.61 - room * m1(x) * env(x), base: top + room * 0.61, tone: 0.27, depth: room * 0.1, soft: 0.003 });
        const m2 = mount([[hx, (lean > 0 ? 0.15 : 0.24) * span, (lean > 0 ? 0.24 : 0.15) * span, 0.62, lean > 0 ? 1.55 : 1.05, lean > 0 ? 1.05 : 1.55], [hx + lean * 0.05 * span, 0.1 * span, 0.1 * span, 0.52, 1.2, 1.2], pkr(0.17, 0.12, 0.43), pkr(-0.17, 0.14, 0.36), pkr(0.34, 0.17, 0.3), pkr(-0.33, 0.15, 0.18)], 0.26, 5.5);
        ranges.push({ f: (x) => top + room * 0.73 - room * m2(x) * env(x), base: top + room * 0.73, tone: 0.5, depth: room * 0.1, soft: 0.002, rock: 1 });
        const m3 = mount([pkr(0.44, 0.32, 0.3), pkr(0.2, 0.13, 0.15), pkr(0.7, 0.2, 0.22)], 0.26, 2.2);
        ranges.push({ f: (x) => top + room * 0.87 - room * (m3(x) + 0.015) * env(x), base: top + room * 0.87, tone: 0.72, depth: room * 0.09, soft: 0.0016, rock: 0.6, pines: true });
        // the moon is the paper itself, left bare inside a breath of wash
        if (room > 0.34) { const mr = Math.min(0.06, room * 0.085), mx = clamp(hx - lean * 0.33 * span, xa + 0.2, xb - 0.2), my = top + room * 0.13 + mr; if (calm(mx, my, mr * 2.4)) { if (dark) { g.fillStyle = INK(0.5); g.beginPath(); g.arc(mx * su, my * su, mr * su, 0, TAU); g.fill(); pool(blob(mx, my, mr * 0.98, mr * 0.98, 0, 12), 0.25, { layers: 6, amount: 0.12, rounds: 2 }); } else { pool(blob(mx, my, mr * 2.6, mr * 2.2), 0.1 * D, { layers: 10, amount: 0.5 }); g.globalCompositeOperation = 'lighter'; g.fillStyle = LIFT(0.94); g.beginPath(); g.arc(mx * su, my * su, mr * su, 0, TAU); g.fill(); g.globalCompositeOperation = 'multiply'; } } }
        for (const [i, r] of ranges.entries()) {
          // a nearer range hides what stands behind it
          g.globalCompositeOperation = 'lighter'; g.fillStyle = LIFT(0.985); g.beginPath(); g.moveTo(xa * su, (foot + 0.3) * su);
          for (let x = xa; x <= xb + 0.004; x += 0.004) g.lineTo(x * su, (r.f(x) + 0.0015) * su);
          g.lineTo(xb * su, (foot + 0.3) * su); g.closePath(); g.fill(); g.globalCompositeOperation = 'multiply';
          const dep = (x) => r.depth + 0.78 * Math.max(0, r.base - r.f(x)), dAt = dep(hx);
          washBelow(r.f, xa, xb, dep, r.tone, { layers: 36, jit: r.soft, fadeL, fadeR, grad: 1.6 });
          if (r.rock) {                                                            // the outline is drawn with a drying brush, in passes along the crest
            for (let x = xa + rng.range(0, 0.05); x < xb;) { const l = span * rng.range(0.06, 0.2), x1 = Math.min(xb, x + l), path = []; for (let k = 0; k <= 8; k++) { const xx = lerp(x, x1, k / 8); path.push([xx, r.f(xx) + m * 0.006]); } if (env((x + x1) / 2) > 0.35) brush(path, m * rng.range(0.008, 0.016), { tone: r.tone * 0.9, dry: rng.range(0.7, 1.1), taper: [0.15, 0.3] }); x = x1 >= xb ? xb : x1 - span * 0.01; }
          }
          if (r.rock) {
            // creases of the rock: short dry lines falling away from the crest, and moss dots along it
            for (let j = 0, k = Math.round(70 * r.rock * (span / 1.2)); j < k; j++) {
              const x = lerp(xa, xb, rng()), e = env(x); if (e < 0.3) continue;
              const y0 = r.f(x), sl = (r.f(x + 0.004) - r.f(x - 0.004)) / 0.008, dd = dep(x), len = dd * rng.range(0.1, 0.3) * e, dir = clamp(sl * 0.55, -0.8, 0.8) + rng.range(-0.1, 0.1), off = rng.range(0.0, 0.3) * dd, bow = len * rng.range(-0.12, 0.12);
              tipLine(smooth([[x + dir * off, y0 + off + 0.003], [x + dir * (off + len * 0.5) + bow, y0 + off + len * 0.5], [x + dir * (off + len) + bow * 0.4, y0 + off + len]], 2), rng.range(0.0014, 0.0034), r.tone * rng.range(0.4, 0.85) * (1 - off / dd), { breakup: 0.5 });
            }
            for (let j = 0, k = Math.round(60 * (span / 1.2)); j < k; j++) { const x = lerp(xa, xb, rng()); if (env(x) < 0.4) continue; const y = r.f(x) + dep(x) * rng.range(-0.004, 0.08) * rng(), rr = m * rng.range(0.0018, 0.0042); dab(x, y, rr * 1.5, rr, r.tone * rng.range(0.7, 1.2)); }
          }
          if (r.pines) { for (let x = xa; x < xb; x += rng.range(0.012, 0.05)) { if (env(x) < 0.5 || noise.noise3(x * 5, 3.3, 1.2) < -0.1) continue; const h = m * rng.range(0.024, 0.042); pine(x, r.f(x) + h * 0.1, h, r.tone * 1.15); } }
          // a bank of mist drifts across the foot of each range
          if (i >= 1) mistBand(lerp(xa, xb, rng.range(0.3, 0.7)), r.f(hx) + dAt * rng.range(0.6, 0.85), span * rng.range(0.3, 0.5), dAt * rng.range(0.14, 0.22), 0.6 * P.mist);
        }
        // the near bank: a dark shoulder of rock with pines, on the open side
        const bw = Math.min(0.5 * span, 0.62), bxc = lean > 0 ? xb - bw * 0.4 : xa + bw * 0.4, bTop = foot - room * (wide ? 0.34 : 0.24);
        const mb = mount([[bxc, bw * 0.55, bw * 0.55, 1, 1.5, 1.2], [bxc - lean * bw * 0.34, bw * 0.3, bw * 0.3, 0.55, 1.2, 1.4]], 0.3, 8.8);
        const fb = (x) => bTop + room * 0.22 - room * 0.22 * mb(x), b0 = bxc - bw * 0.62, b1 = bxc + bw * 0.62;
        if ((lean > 0 ? open.r : open.l) || room > 0.3) {
          g.globalCompositeOperation = 'lighter'; g.fillStyle = LIFT(0.985); g.beginPath(); g.moveTo(b0 * su, (foot + 0.3) * su); for (let x = b0; x <= b1; x += 0.004) g.lineTo(x * su, (fb(x) + 0.0015) * su); g.lineTo(b1 * su, (foot + 0.3) * su); g.closePath(); g.fill(); g.globalCompositeOperation = 'multiply';
          washBelow(fb, b0, b1, room * 0.17, 0.92, { layers: 30, jit: 0.0015, fadeL: bw * 0.25, fadeR: bw * 0.25, grad: 1.5 });
          for (let j = 0; j < 10; j++) { const x = bxc + bw * rng.range(-0.4, 0.4), y = fb(x) + room * rng.range(0.005, 0.05), l = bw * rng.range(0.08, 0.2); brush([[x - l / 2, y], [x, y + rng.range(-0.004, 0.004)], [x + l / 2, y + 0.005]], m * rng.range(0.012, 0.028), { tone: 0.85, dry: 0.95 }); }
          for (const [dx, hh] of [[-0.14, 0.2], [0.04, 0.15], [0.2, 0.1]]) { const x = bxc + dx * bw * lean, h = clamp(room * hh * 1.5, 0.05, 0.19); pine(x, fb(x) + h * 0.06, h, 0.95); }
        }
        // still water: a few level dry strokes, and a boat with someone in it
        const wy = foot - room * 0.07, bx0 = clamp(hx - lean * 0.24 * span, xa + 0.12, xb - 0.12);
        for (let j = 0; j < 7; j++) { const x = bx0 + span * rng.range(-0.2, 0.18), y = wy + room * rng.range(-0.03, 0.05), l = span * rng.range(0.05, 0.16); if (calm(x - l / 2, y, 0.05) && calm(x + l / 2, y, 0.05)) brush([[x - l / 2, y], [x, y + 0.001], [x + l / 2, y]], m * 0.006, { tone: 0.3, dry: 1.1, taper: [0.3, 0.4] }); }
        if (calm(bx0, wy, 0.07)) {
          const sb = clamp(m * 0.055, 0.022, 0.05);
          leafStroke(bx0 - sb * 0.9, wy, 0.04, sb * 1.9, sb * 0.2, 0.92, { belly: 0.5, dryTail: 0 });
          tipLine([[bx0 - sb * 0.1, wy - sb * 0.04], [bx0 - sb * 0.06, wy - sb * 0.42]], 0.0045, 0.9, { breakup: 0, taper: false }); dab(bx0 - sb * 0.05, wy - sb * 0.47, sb * 0.2, sb * 0.06, 0.95);
          tipLine([[bx0 + sb * 0.2, wy + sb * 0.05], [bx0 + sb * 0.55, wy - sb * 0.95]], 0.0016, 0.8, { breakup: 0 });
        }
        birds(hx - lean * 0.2 * span, top + room * 0.2, m * 0.035, 3);
        placeSeal([[lean > 0 ? Math.min(sx - 0.1, A.x1 - 0.06) : Math.max(0.05, A.x0 + 0.02), top + room * 0.08], [lean > 0 ? A.x1 - 0.08 : A.x0 + 0.03, foot - 0.08]], clamp(m * 0.055, 0.026, 0.042));
      },

      bamboo() {
        const top = open.t ? -0.06 : A.y0 + 0.02, foot = open.b ? sy + 0.05 : A.y1, S = clamp(A.h, 0.5, 0.95);                 // S: the scale of leaves and joints
        const stalks = [];
        if (!wide) { for (let k = 0; k < 3; k++) { const x0 = ax(0.5 + lean * (0.3 - 0.21 * k)) + rng.range(-0.02, 0.02), tilt = -lean * rng.range(0.02, 0.1) * (k === 1 ? -0.4 : 1); stalks.push({ a: [x0, foot + 0.02], b: [x0 + tilt * (foot - top), top], w: S * [0.036, 0.05, 0.026][k], tone: [0.38, 0.86, 0.24][k] }); } }
        else { for (let k = 0; k < 2; k++) { const e = lean > 0 ? (open.r ? sx + 0.05 : A.x1) : (open.l ? -0.05 : A.x0); stalks.push({ a: [e, A.y1 - A.h * (0.02 + 0.3 * k)], b: [e - lean * A.w * (0.74 - 0.2 * k), A.y0 + A.h * (0.1 + 0.16 * k) - 0.02], w: S * [0.066, 0.042][k], tone: [0.86, 0.34][k] }); } }
        stalks.sort((p, q) => p.tone - q.tone);
        const tips = [];
        for (const st of stalks) {
          const dx = st.b[0] - st.a[0], dy = st.b[1] - st.a[1], len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len, nx = -uy, ny = ux, bow = len * rng.range(-0.02, 0.02);
          const at = (t) => [st.a[0] + dx * t + nx * bow * Math.sin(Math.PI * t), st.a[1] + dy * t + ny * bow * Math.sin(Math.PI * t)];
          // joints: long in the middle of the cane, short at foot and tip
          let s0 = rng.range(0, 0.04);
          for (let j = 0; s0 < len; j++) {
            const t0 = s0 / len, seg = S * lerp(0.13, 0.2, Math.sin(Math.PI * clamp(t0, 0, 1))) * rng.range(0.9, 1.1), s1 = Math.min(len, s0 + seg), t1 = s1 / len;
            const w = st.w * lerp(1, 0.62, t0), p0 = at(t0 + 0.003 / len), p1 = at(t1 - 0.003 / len), fadeFoot = open.b ? 1 : sstep(0.02, 0.36, (t0 + t1) / 2);
            if (calm((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, 0.02) && s1 - s0 > 0.03) {
              brush([p0, at((t0 + t1) / 2), p1], (t) => w * (1 + 0.1 * Math.pow(Math.abs(2 * t - 1), 3)), { tone: st.tone * lerp(0.05, 1, fadeFoot), dry: 0.3, wet: 0.22, taper: [0.03, 0.03], prof: (o) => 0.42 * o * o - 0.12 + 0.1 * o });
              // the knot: a dark hooked line across the joint
              if (j > 0) { const c = p0, k = w * 0.62; tipLine([[c[0] - nx * k - ux * w * 0.1, c[1] - ny * k - uy * w * 0.1], [c[0] - ux * w * 0.04, c[1] - uy * w * 0.04], [c[0] + nx * k - ux * w * 0.1, c[1] + ny * k - uy * w * 0.1]], st.w * 0.12, Math.min(1, st.tone * 1.25) * fadeFoot, { breakup: 0 }); }
              // twigs leave the cane at the knots, on alternate sides
              if (j > (wide ? 0 : 1) && t0 > (wide ? 0.1 : 0.22) && rng() < (wide ? 0.95 : 0.8)) {
                const sd = (j % 2 ? 1 : -1), ang = Math.atan2(uy, ux) + sd * rng.range(0.5, 0.95), L1 = S * rng.range(0.1, 0.22), e1 = [p0[0] + Math.cos(ang) * L1, p0[1] + Math.sin(ang) * L1];
                tipLine([p0, [lerp(p0[0], e1[0], 0.5) + ny * 0.008, lerp(p0[1], e1[1], 0.5)], e1], st.w * 0.09, st.tone * 0.9, { breakup: 0.1 });
                tips.push({ p: e1, tone: st.tone, sd }); if (rng() < 0.6) { const mp = [lerp(p0[0], e1[0], 0.55), lerp(p0[1], e1[1], 0.55)], a2 = ang - sd * rng.range(0.5, 0.9), L2 = L1 * rng.range(0.5, 0.8), e2 = [mp[0] + Math.cos(a2) * L2, mp[1] + Math.sin(a2) * L2]; tipLine([mp, e2], st.w * 0.07, st.tone * 0.85, { breakup: 0.1 }); tips.push({ p: e2, tone: st.tone, sd }); }
              }
            }
            s0 = s1 + 0.002;
          }
        }
        // leaves hang from the twig ends in fans of three to five; pale ones behind, black ones in front
        tips.sort((p, q) => p.tone - q.tone);
        for (const tp of tips) {
          if (!calm(tp.p[0], tp.p[1], 0.06)) continue;
          const nL = rng.int(3, 5), base = Math.PI / 2 + rng.range(-0.5, 0.5) - lean * 0.25, tone = tp.tone > 0.6 ? rng.range(0.82, 0.97) : tp.tone * rng.range(0.9, 1.3);
          for (let k = 0; k < nL; k++) {
            const a = base + (k - (nL - 1) / 2) * rng.range(0.34, 0.5), L = S * rng.range(0.1, 0.19) * (k === Math.floor(nL / 2) ? 1.15 : 1), tipX = tp.p[0] + Math.cos(a) * L, tipY = tp.p[1] + Math.sin(a) * L;
            if (!calm(tipX, tipY, 0.03)) continue;
            leafStroke(tp.p[0], tp.p[1], a, L, L * rng.range(0.15, 0.2), tone, { bend: rng.range(-0.12, 0.12), belly: 0.34, dryTail: tone > 0.6 ? 0.8 : 0.2 });
          }
        }
        if (!open.b) for (let k = 0; k < 3; k++) mistBand(ax(rng.range(0.2, 0.8)), A.y1 - 0.01, A.w * rng.range(0.35, 0.6), A.h * 0.12, 0.7 * P.mist);
        placeSeal([[ax(0.5 - lean * 0.38) - 0.02, A.y1 - A.h * 0.2], [ax(0.5 + lean * 0.4), A.y1 - A.h * 0.16], [ax(0.5 - lean * 0.3), A.y0 + A.h * 0.5]], clamp(m * 0.06, 0.028, 0.045));
      },

      plum() {
        const S = clamp(A.m, 0.45, 0.9), e = lean > 0 ? (open.r ? sx + 0.04 : A.x1) : (open.l ? -0.04 : A.x0);
        // an old bough comes in from the open side and climbs in elbows
        const dir0 = Math.atan2(-(wide ? 0.22 : 0.75), -lean), pts = [[e, A.y1 - A.h * (wide ? 0.3 : 0.22)]], want = Math.hypot(A.w * 0.72, A.h * (wide ? 0.3 : 0.55)), nSeg = 5;
        for (let k = 0; k < nSeg; k++) { const a = dir0 + (k % 2 ? -1 : 1) * lean * rng.range(0.3, 0.6) * (k === 0 ? 0.3 : 1), l = (want / nSeg) * rng.range(0.8, 1.2), q0 = pts[pts.length - 1]; pts.push([q0[0] + Math.cos(a) * l, q0[1] + Math.sin(a) * l]); }
        const bough = [pts[0]]; for (let k = 1; k < pts.length; k++) { const a = pts[k - 1], b = pts[k]; bough.push([lerp(a[0], b[0], 0.5) + rng.range(-0.012, 0.012), lerp(a[1], b[1], 0.5) + rng.range(-0.012, 0.012)], b); }
        const w0 = S * 0.06;
        brush(bough, (t) => lerp(w0, w0 * 0.2, Math.pow(t, 0.8)), { tone: 0.92, dry: 0.75, wet: 0.12, taper: [0.01, 0.12], prof: (o) => 0.3 * o, grainF: 0.7 });
        for (let k = 0; k < 16; k++) { const t = rng.range(0, 0.75), i = Math.floor(t * (bough.length - 1)), pp = bough[i]; dab(pp[0] + rng.range(-1, 1) * w0 * 0.4, pp[1] + rng.range(-1, 1) * w0 * 0.4, w0 * rng.range(0.1, 0.22), w0 * rng.range(0.08, 0.16), rng.range(0.8, 1)); }
        // young shoots spring straight up from the elbows; the blossom sits on them
        const spots = [];
        const shoot = (p0, ang, L, w, depth) => {
          const n = 4, path = [p0]; let a = ang; for (let k = 1; k <= n; k++) { a += rng.range(-0.1, 0.1); const q0 = path[path.length - 1]; path.push([q0[0] + (Math.cos(a) * L) / n, q0[1] + (Math.sin(a) * L) / n]); }
          brush(path, (t) => lerp(w, w * 0.25, t), { tone: 0.9, dry: 0.55, wet: 0.2, taper: [0.02, 0.3] });
          for (let k = 0, kk = Math.round(L / (S * 0.045)); k < kk; k++) { const t = rng.range(0.25, 1.02), i = Math.min(n - 1, Math.floor(t * n)), f = t * n - i, a2 = path[i], b2 = path[Math.min(n, i + 1)]; spots.push([lerp(a2[0], b2[0], f) + rng.range(-1, 1) * S * 0.012, lerp(a2[1], b2[1], f) + rng.range(-1, 1) * S * 0.012]); }
          if (depth > 0) for (let k = 0; k < 2; k++) { if (rng() < 0.35) continue; const t = rng.range(0.3, 0.7), i = Math.floor(t * n), sd = rng() < 0.5 ? -1 : 1; shoot(path[i], a + sd * rng.range(0.45, 0.8), L * rng.range(0.4, 0.6), w * 0.6, depth - 1); }
        };
        for (let k = 1; k < bough.length; k += 1) { if (k % 2 === 1 && rng() < 0.4) continue; const up = -Math.PI / 2 - lean * rng.range(-0.1, 0.45); shoot(bough[k], up, S * rng.range(0.16, 0.36) * (wide ? 0.75 : 1), w0 * lerp(0.3, 0.16, k / bough.length), 1); }
        const tipB = bough[bough.length - 1]; shoot(tipB, dir0 - lean * 0.5, S * 0.26, w0 * 0.2, 1);
        // blossom: five round petals of pale colour, a few dots of ink for the stamens; buds are single touches
        g.globalCompositeOperation = 'multiply';
        for (const [x, y] of spots) {
          if (!calm(x, y, 0.035)) continue;
          const r = S * rng.range(0.011, 0.018), kind = rng();
          if (kind < 0.55) {
            const rot = rng.range(0, TAU), np = 5;
            for (let k = 0; k < np; k++) { const a = rot + (k / np) * TAU; pool(blob(x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95, r * 0.78, r * 0.7, a, 7), rng.range(0.4, 0.7), { layers: 4, style: TINT, amount: 0.22, rounds: 2 }); }
            for (let k = 0; k < 5; k++) { const a = rng.range(0, TAU), rr = r * rng.range(0.15, 0.6); g.fillStyle = INK(0.85 * D); g.beginPath(); g.arc((x + Math.cos(a) * rr) * su, (y + Math.sin(a) * rr) * su, Math.max(0.8, r * 0.09 * su), 0, TAU); g.fill(); }
          } else if (kind < 0.8) {                                                 // a flower seen from the side
            const a0 = -Math.PI / 2 + rng.range(-0.5, 0.5);
            for (let k = -1; k <= 1; k++) pool(blob(x + Math.cos(a0 + k * 0.7) * r * 0.8, y + Math.sin(a0 + k * 0.7) * r * 0.8, r * 0.7, r * 0.6, 0, 7), rng.range(0.4, 0.65), { layers: 4, style: TINT, amount: 0.22, rounds: 2 });
            dab(x, y + r * 0.1, r * 0.3, r * 0.22, 0.9);
          } else { pool(blob(x, y, r * 0.55, r * 0.5, 0, 6), 0.7, { layers: 3, style: TINT, amount: 0.2, rounds: 2 }); dab(x, y + r * 0.4, r * 0.22, r * 0.16, 0.9); }
        }
        placeSeal([[ax(0.5 - lean * 0.36) - 0.02, A.y1 - A.h * 0.2], [ax(0.5 - lean * 0.3), A.y0 + A.h * 0.08], [ax(0.5 + lean * 0.38), A.y0 + A.h * 0.1]], clamp(m * 0.06, 0.028, 0.045));
      },

      strokes() {
        const S = A.m, mir = lean > 0 ? 1 : -1;
        // box coordinates: u runs from the copy side (0) to the open side (1), v down
        const at = (u, v) => [mir > 0 ? ax(u) : ax(1 - u), ay(v)];
        const settle = (pt, c, r) => { let q0 = pt; for (let k = 0; k < 12 && !calm(q0[0], q0[1], r); k++) q0 = [lerp(q0[0], c[0], 0.12), lerp(q0[1], c[1], 0.12)]; return q0; };
        const mid = at(0.58, 0.5);
        // a breath of pale wash behind everything, and a long cloud of colour
        pool(blob(...settle(at(0.6, 0.52), mid, 0.3), A.w * 0.3, A.h * 0.22, rng.range(-0.2, 0.2), 11), 0.13 * D, { layers: 16, amount: 0.5, rounds: 4 });
        const tc = settle(at(0.52, wide ? 0.72 : 0.68), mid, 0.14); pool(blob(tc[0], tc[1], S * 0.3, S * 0.06, rng.range(-0.12, 0.05) * mir, 11), 0.34, { layers: 10, style: TINT, amount: 0.45, rounds: 3 });
        // passes of the brush: a long dry sweep, a short wet one across it, a quick thin one, a pale echo
        const sweep = (pa, pb, bow, width, o) => {
          const wmax = typeof width === 'function' ? width(0) : width; pa = settle(pa, mid, wmax * 0.7); pb = settle(pb, mid, wmax * 0.7);
          const mx = (pa[0] + pb[0]) / 2, my = (pa[1] + pb[1]) / 2, dx = pb[0] - pa[0], dy = pb[1] - pa[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
          const path = [pa, [lerp(pa[0], mx, 0.5) + nx * bow * 0.7, lerp(pa[1], my, 0.5) + ny * bow * 0.7], [mx + nx * bow, my + ny * bow], [lerp(mx, pb[0], 0.5) + nx * bow * 0.6, lerp(my, pb[1], 0.5) + ny * bow * 0.6], pb];
          brush(path, width, o); return path;
        };
        const yv = wide ? [0.3, 0.42, 0.72, 0.1] : [0.34, 0.44, 0.66, 0.14];
        const p1 = sweep(at(0.08, yv[1]), at(0.97, yv[0]), -S * 0.05 * mir, (t) => S * lerp(0.2, 0.12, t), { tone: 0.96, dry: 0.78, wet: 0.06, taper: [0.05, 0.22], grainF: 0.6 });
        sweep(at(0.36, yv[2] - 0.03), at(1.0, yv[2] + 0.05), S * 0.03 * mir, (t) => S * lerp(0.1, 0.07, t), { tone: 0.97, dry: 0.42, wet: 0.4, taper: [0.06, 0.3] });
        sweep(at(0.16, yv[3] + 0.07), at(0.58, yv[3]), -S * 0.04 * mir, S * 0.018, { tone: 0.85, dry: 0.5, taper: [0.1, 0.5] });
        sweep(at(0.76, yv[3] - 0.02), at(0.86, yv[3] + 0.1), S * 0.01, (t) => S * lerp(0.075, 0.03, t), { tone: 0.97, dry: 0.15, wet: 0.6, taper: [0.2, 0.35] });
        sweep(at(0.14, 0.86), at(0.62, 0.9), S * 0.02 * mir, S * 0.04, { tone: 0.4, dry: 1.0, taper: [0.1, 0.4] });
        // ink thrown off the brush where the long sweep ends
        const end = p1[p1.length - 1], d0 = Math.atan2(end[1] - p1[3][1], end[0] - p1[3][0]);
        for (let k = 0; k < 40; k++) { const a = d0 + rng.gauss() * 0.45, r = S * (0.02 + 0.34 * Math.pow(rng(), 1.8)), x = end[0] + Math.cos(a) * r - Math.cos(d0) * S * 0.16, y = end[1] + Math.sin(a) * r - Math.sin(d0) * S * 0.16, rr = S * (0.0015 + 0.011 * Math.pow(rng(), 3)); if (calm(x, y, 0.04)) dab(x, y, rr * rng.range(1, 1.8), rr, rng.range(0.7, 1), a); }
        placeSeal([at(0.84, 0.86), at(0.86, 0.06), at(0.16, 0.84)].map(([x, y]) => [x - 0.02, y - 0.02]), clamp(m * 0.07, 0.03, 0.05));
      },
    };
    (motifs[P.motif] ?? motifs.mountains)();
    if (sealAt) seal(...sealAt);
  }, { srgb: false });

  // ---- the sheet: long fibres pressed into hanji, lighter and darker than the ground
  const pk = Math.min(1, 2048 / Math.max(W, H)), pw = Math.round(W * pk), ph = Math.round(H * pk), pu = Math.min(pw, ph);
  const paperTex = canvasTexture(pw, ph, (g) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, pw, ph); g.lineCap = 'round';
    const prng = (() => { let s = (seed * 9301 + 49297) % 233280; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; })();
    for (let i = 0, n = Math.round(1500 * sx * sy); i < n; i++) {
      const x = prng() * pw, y = prng() * ph, a = prng() * TAU, l = pu * (0.012 + 0.07 * prng() * prng()), c = (prng() - 0.5) * l * 0.8, lightF = prng() < 0.62;
      g.strokeStyle = lightF ? `rgba(255,255,255,${0.05 + 0.13 * prng()})` : `rgba(0,0,0,${0.03 + 0.08 * prng()})`; g.lineWidth = Math.max(0.6, pu * (0.0005 + 0.0011 * prng()));
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 - Math.sin(a) * c, y + Math.sin(a) * l * 0.5 + Math.cos(a) * c, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
  }, { srgb: false });

  scene.add(backgroundQuad(/* glsl */`
    varying vec2 vUv; uniform sampler2D tInk, tPaper; uniform vec2 uAsp, uTexel; uniform vec3 uPaper, uInk, uDilute, uTint, uSeal;
    uniform float uDark, uGrain, uSeed, uFine, uBleed, uMist;
    ${GLSL_NOISE_KIT}
    ${GLSL_QUIET}
    ${GLSL_DITHER}
    float dens(vec2 uv){ return 1.0 - texture2D(tInk, uv).r; }
    void main(){
      vec2 p = vec2(vUv.x, 1.0 - vUv.y), q = p * uAsp;
      float fib = texture2D(tPaper, vUv).r - 0.5, tooth = noise2(q * 430.0 * uFine), slow = fbm2(q * 2.6 + uSeed, 2);
      // absorbent paper: the ink creeps a little way along the fibres before it dries
      vec2 creep = uBleed * (0.0012 * vec2(noise2(q * 170.0 * uFine + 3.0), noise2(q * 170.0 * uFine + 41.0)) + 0.0022 * vec2(noise2(q * 37.0), noise2(q * 37.0 + 19.0)) + 0.01 * fib * vec2(0.6, -0.4)) / uAsp;
      vec2 uv = vUv + creep;
      vec3 t = texture2D(tInk, uv).rgb;
      float d = 1.0 - t.r;
      // a wet wash dries darkest at its rim
      vec2 e = uTexel * 2.2;
      float gr = length(vec2(dens(uv + vec2(e.x, 0.0)) - dens(uv - vec2(e.x, 0.0)), dens(uv + vec2(0.0, e.y)) - dens(uv - vec2(0.0, e.y))));
      d += 0.5 * uBleed * smoothstep(0.02, 0.35, gr) * d * (1.0 - d);
      // ink settles into the tooth of the sheet; thin, dry ink breaks up on it
      float mid = smoothstep(0.0, 0.2, d) * smoothstep(1.0, 0.45, d);
      d *= 1.0 + uGrain * mid * (0.2 * tooth + 0.9 * fib + 0.22 * slow);
      d = clamp(d, 0.0, 1.0);
      // mist lies over the part of the sheet that carries the copy
      vec2 wq = p + (0.03 * vec2(noise2(q * 2.1 + uSeed), noise2(q * 2.1 - uSeed + 7.0)) + 0.012 * vec2(noise2(q * 6.3 + 3.0), noise2(q * 6.3 + 11.0))) / uAsp;
      float calm = quietMask(wq, 0.06);
      d *= 1.0 - 0.97 * calm;
      float k = 1.0 - pow(1.0 - d, 1.35);
      vec3 sheet = uPaper * (1.0 + uGrain * (0.016 * tooth + 0.1 * fib + 0.014 * slow));
      vec3 inkc = mix(uDilute, uInk, smoothstep(0.1, 0.85, d));
      vec3 col = uDark > 0.5 ? mix(sheet, inkc * (1.0 + 0.1 * tooth), k * 0.96) : sheet * mix(vec3(1.0), inkc, k);
      // a breath of colour, laid under the ink
      float dt = (1.0 - t.g) * (1.0 - 0.97 * calm) * (1.0 + uGrain * 0.5 * fib);
      col = uDark > 0.5 ? mix(col, uTint, 0.85 * dt) : col * mix(vec3(1.0), uTint, clamp(dt, 0.0, 1.0));
      // the seal: oily vermilion paste, pressed unevenly
      float ds = (1.0 - t.b) * (1.0 - calm);
      ds *= 1.0 - 0.75 * smoothstep(0.25, 0.75, 0.6 * noise2(q * 210.0 * uFine + 9.0) + 0.5 * noise2(q * 60.0 + 4.0) + 0.3);
      col = mix(col, uSeal * mix(sheet / uPaper, vec3(1.0), uDark), 0.94 * ds);
      col = clamp(col, 0.0, 1.0);
      gl_FragColor = vec4(mix(col / 12.92, pow((col + 0.055) / 1.055, vec3(2.4)), step(0.04045, col)), 1.0);
      #include <colorspace_fragment>
      gl_FragColor.rgb += ditherNoise(gl_FragCoord.xy);
    }`, {
    tInk: { value: tex }, tPaper: { value: paperTex }, uAsp: { value: new THREE.Vector2(sx, sy) }, uTexel: { value: new THREE.Vector2(1 / cw, 1 / chh) },
    uPaper: { value: paper }, uInk: { value: srgbVec(inkHex) }, uDilute: { value: srgbVec(diluteHex) }, uTint: { value: srgbVec(tintHex) }, uSeal: { value: srgbVec(sealHex) },
    uDark: { value: dark ? 1 : 0 }, uGrain: { value: P.grain }, uSeed: { value: (seed % 97) * 0.53 }, uFine: { value: Math.min(1, Math.min(W, H) / 1900) }, uBleed: { value: P.bleed }, uMist: { value: P.mist },
    ...quietUniforms(ctx),
  }));
  ctx.frame({ radius: 1, fov: 30, dir: [0, 0, 1] });
}
