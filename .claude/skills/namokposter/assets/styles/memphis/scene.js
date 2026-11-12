// Memphis — the pattern language of the Memphis Group (Milan, 1981): flat candy colours, solids filled
// with dots, stripes, grids and terrazzo chips, squiggles and confetti triangles, and black outlines
// printed slightly out of register with the colour they belong to.
// Everything is drawn as vector shapes on a 2D canvas at the output size, then shown as one texture.
//
// What it depicts is the `motif`:
//   confetti  a scattered field of squiggles, triangles, zigzags and dotted solids, thickest at the focus
//   stack     a pile of big overlapping solids — disc, striped slab, quarter, triangle — with loose accents
//   totem     a framed composition: a Sottsass-style totem of stacked solids standing in a patterned frame
//
// Palette: bg = ground · ink = outlines, black-and-white patterns · colors[0..3] = the candy colours
//          accent = type only
import { backgroundQuad, canvasTexture, GLSL_DITHER } from '/skill/assets/web/scene-lib.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

export default function build(ctx) {
  const { THREE, scene, palette, params, aspect, rng, width: W, height: H, unit: u } = ctx;
  const sx = Math.max(aspect, 1), sy = Math.max(1 / aspect, 1), short = Math.min(W, H);
  const motif = ['confetti', 'stack', 'totem'].includes(params.motif) ? params.motif : 'confetti';
  const P = { density: clamp(params.density ?? 1, 0.3, 2), outline: clamp(params.outline ?? 1, 0, 2), scale: clamp(params.scale ?? 1, 0.6, 1.5), misregister: clamp(params.misregister ?? 1, 0, 2.5) };
  const bgc = new THREE.Color(palette.bg), dark = bgc.getHSL({}).l < 0.35;
  const cols = (palette.colors?.length ? palette.colors : [palette.accent]).slice(0, 5);
  const K = palette.ink, Wh = dark ? palette.bg : '#fffaf0';                               // the two neutral tones: line colour and its opposite
  const col = (i) => cols[((i % cols.length) + cols.length) % cols.length];

  // ---- where the copy sits
  const quiet = (ctx.quiet || []).map(([x0, y0, x1, y1]) => ({ x0, y0, x1, y1 }));
  const qDist = (x, y) => {                                                               // px → distance in px to the nearest block of type
    let d = 1e9;
    for (const r of quiet) {
      const ex = Math.abs(x - ((r.x0 + r.x1) / 2) * W) - ((r.x1 - r.x0) / 2) * W, ey = Math.abs(y - ((r.y0 + r.y1) / 2) * H) - ((r.y1 - r.y0) / 2) * H;
      d = Math.min(d, Math.hypot(Math.max(ex, 0), Math.max(ey, 0)) + Math.min(Math.max(ex, ey), 0));
    }
    return d;
  };
  const fx = ctx.focus.x * W, fy = ctx.focus.y * H, S = clamp(ctx.artSize ?? 0.7, 0.35, 1.05) * short;      // art circle, px
  const [ax0, ay0, ax1, ay1] = ctx.artRect || [0, 0, 1, 1], aw = (ax1 - ax0) * W, ah = (ay1 - ay0) * H;
  // side of the sheet the subject is on (as a ramp 0 → 1 from the copy towards the focus)
  const copy = quiet[0] ?? { x0: 2, y0: 2, x1: 2, y1: 2 }, ccx = ((copy.x0 + copy.x1) / 2) * W, ccy = ((copy.y0 + copy.y1) / 2) * H;
  let dx = fx - ccx, dy = fy - ccy; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
  if (Math.abs(dx) > 0.82) { dx = Math.sign(dx); dy = 0; } else if (Math.abs(dy) > 0.82) { dy = Math.sign(dy); dx = 0; }
  const copyHalf = Math.abs(dx) * ((copy.x1 - copy.x0) / 2) * W + Math.abs(dy) * ((copy.y1 - copy.y0) / 2) * H;
  const centred = quiet.length === 0 || qDist(fx, fy) < 3 * u;                           // copy on the focus: no side to keep to
  const sideT = (x, y) => (centred ? 1 : clamp(((x - ccx) * dx + (y - ccy) * dy - copyHalf) / (10 * u), 0, 1));

  const lw = 0.3 * u * P.outline;                                                         // outline weight
  const reg = [0.5 * u * P.misregister * (rng() < 0.5 ? -1 : 1), 0.5 * u * P.misregister];   // how far colour sits from its outline

  const tex = canvasTexture(W, H, (g) => {
    g.fillStyle = palette.bg; g.fillRect(0, 0, W, H);
    g.lineJoin = 'round'; g.lineCap = 'round';

    // ---------------------------------------------------------------- patterns (drawn inside the current clip, centred on 0,0)
    const pat = {
      dots(R, c, s = 1.25 * u, k = 0.24) { g.fillStyle = c; for (let j = -Math.ceil(R / s); j <= R / s; j++) for (let i = -Math.ceil(R / s); i <= R / s; i++) { g.beginPath(); g.arc(i * s + (j & 1 ? s / 2 : 0), j * s * 0.9, s * k, 0, TAU); g.fill(); } },
      stripes(R, c, s = 1.3 * u, ang = Math.PI / 4, duty = 0.5) { g.save(); g.rotate(ang); g.fillStyle = c; for (let j = -Math.ceil(R / s) - 1; j <= R / s + 1; j++) g.fillRect(-R * 1.5, j * s, R * 3, s * duty); g.restore(); },
      grid(R, c, s = 1.5 * u, w = 0.16 * u) { g.fillStyle = c; for (let j = -Math.ceil(R / s); j <= R / s; j++) { g.fillRect(-R, j * s - w / 2, 2 * R, w); g.fillRect(j * s - w / 2, -R, w, 2 * R); } },
      checks(R, c, s = 1.2 * u) { g.fillStyle = c; for (let j = -Math.ceil(R / s); j <= R / s; j++) for (let i = -Math.ceil(R / s); i <= R / s; i++) if ((i + j) & 1) g.fillRect(i * s, j * s, s, s); },
      zig(R, c, s = 1.5 * u, w = 0.32 * u) { g.strokeStyle = c; g.lineWidth = w; g.lineJoin = 'miter'; for (let j = -Math.ceil(R / s) - 1; j <= R / s + 1; j++) { g.beginPath(); for (let i = -Math.ceil(R / s) - 1, k = 0; i <= R / s + 1; i++, k++) g.lineTo(i * s * 0.8, j * s + (k & 1 ? s * 0.45 : 0)); g.stroke(); } g.lineJoin = 'round'; },
      terrazzo(R, cs, s = 1.5 * u) {
        const n = Math.round(((2 * R) / s) ** 2 * 0.62);
        for (let i = 0; i < n; i++) {
          const x = rng.range(-R, R), y = rng.range(-R, R), r = s * rng.range(0.16, 0.42), a0 = rng() * TAU, m = rng.int(3, 5);
          g.fillStyle = rng.pick(cs); g.beginPath();
          for (let k = 0; k < m; k++) { const a = a0 + (k / m) * TAU + rng.range(-0.3, 0.3), rr = r * rng.range(0.7, 1.25); g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8); }
          g.closePath(); g.fill();
        }
      },
      bacterio(R, c, s = 1.7 * u) {                                                          // Sottsass's "Bacterio": short wriggling strokes
        g.strokeStyle = c; g.lineWidth = 0.2 * u;
        const n = Math.round(((2 * R) / s) ** 2 * 0.8);
        for (let i = 0; i < n; i++) {
          let x = rng.range(-R, R), y = rng.range(-R, R), a = rng() * TAU; g.beginPath(); g.moveTo(x, y);
          for (let k = 0; k < 5; k++) { a += rng.range(-1.3, 1.3); x += Math.cos(a) * s * 0.2; y += Math.sin(a) * s * 0.2; g.lineTo(x, y); }
          g.stroke();
        }
      },
    };
    const fillPattern = (name, R, c, c2) => {
      if (!name) return;
      if (name === 'terrazzo') pat.terrazzo(R, c2 ?? [K, col(1), col(2)]);
      else if (name === 'stripesH') pat.stripes(R, c, 1.3 * u, 0);
      else if (name === 'stripesV') pat.stripes(R, c, 1.3 * u, Math.PI / 2);
      else pat[name](R, c);
    };

    // ---------------------------------------------------------------- shapes: each traces a closed path around 0,0
    const shape = {
      circle: (r) => () => { g.arc(0, 0, r, 0, TAU); },
      half: (r) => () => { g.arc(0, r * 0.25, r, Math.PI, 0); g.closePath(); },
      quarter: (r) => () => { g.moveTo(-r / 2, r / 2); g.lineTo(-r / 2, -r / 2); g.arc(-r / 2, r / 2, r, -Math.PI / 2, 0); g.closePath(); },
      tri: (s) => () => { const hgt = s * 0.866; g.moveTo(0, -hgt * 0.62); g.lineTo(s / 2, hgt * 0.38); g.lineTo(-s / 2, hgt * 0.38); g.closePath(); },
      rtri: (s) => () => { g.moveTo(-s / 2, -s / 2); g.lineTo(s / 2, s / 2); g.lineTo(-s / 2, s / 2); g.closePath(); },
      rect: (w, h, r = 0) => () => { g.roundRect(-w / 2, -h / 2, w, h, r); },
      arch: (w, h) => () => { g.moveTo(-w / 2, h / 2); g.lineTo(-w / 2, -h / 2 + w / 2); g.arc(0, -h / 2 + w / 2, w / 2, Math.PI, 0); g.lineTo(w / 2, h / 2); g.closePath(); },
      trap: (w1, w2, h) => () => { g.moveTo(-w1 / 2, -h / 2); g.lineTo(w1 / 2, -h / 2); g.lineTo(w2 / 2, h / 2); g.lineTo(-w2 / 2, h / 2); g.closePath(); },
      diamond: (w, h) => () => { g.moveTo(0, -h / 2); g.lineTo(w / 2, 0); g.lineTo(0, h / 2); g.lineTo(-w / 2, 0); g.closePath(); },
    };
    /** A solid: colour (out of register), optional pattern, optional hard shadow, outline. */
    const solid = (x, y, rot, trace, R, { fill = null, pattern = null, pc = K, pc2 = null, outline = true, shadow = false } = {}) => {
      g.save(); g.translate(x, y); g.rotate(rot);
      if (shadow) { g.save(); g.rotate(-rot); g.translate(1.1 * u * Math.sign(reg[0]), 1.1 * u); g.rotate(rot); g.fillStyle = K; g.beginPath(); trace(); g.fill(); g.restore(); }
      const slip = outline && !shadow && fill !== K;                                       // black on black has nothing to slip against
      g.save(); g.rotate(-rot); g.translate(slip ? reg[0] : 0, slip ? reg[1] : 0); g.rotate(rot);
      g.beginPath(); trace();
      if (fill) { g.fillStyle = fill; g.fill(); }
      if (pattern) { g.save(); g.clip(); fillPattern(pattern, R * 1.2, pc, pc2); g.restore(); }
      g.restore();
      if (outline && lw > 0) { g.beginPath(); trace(); g.strokeStyle = K; g.lineWidth = lw; g.stroke(); }
      g.restore();
    };
    // ---- open marks
    const squiggle = (x, y, rot, len, c, w = 0.55 * u, amp = 0.85 * u, wave = 2.3 * u) => {
      g.save(); g.translate(x, y); g.rotate(rot); g.strokeStyle = c; g.lineWidth = w; g.lineCap = 'round'; g.beginPath();
      const n = Math.max(2, Math.round(len / wave)) * 2;
      g.moveTo(-len / 2, 0);
      for (let i = 0; i < n; i++) { const x0 = -len / 2 + (i * len) / n, x1 = x0 + len / n; g.quadraticCurveTo((x0 + x1) / 2, (i & 1 ? 1 : -1) * amp * 2, x1, 0); }
      g.stroke(); g.restore();
    };
    const zigzag = (x, y, rot, len, c, w = 0.5 * u, amp = 0.8 * u, step = 1.25 * u) => {
      g.save(); g.translate(x, y); g.rotate(rot); g.strokeStyle = c; g.lineWidth = w; g.lineJoin = 'miter'; g.lineCap = 'butt'; g.beginPath();
      const n = Math.max(3, Math.round(len / step));
      for (let i = 0; i <= n; i++) g.lineTo(-len / 2 + (i * len) / n, i & 1 ? amp : -amp);
      g.stroke(); g.restore(); g.lineJoin = 'round'; g.lineCap = 'round';
    };
    const bar = (x, y, rot, len, c, w = 0.7 * u) => { g.save(); g.translate(x, y); g.rotate(rot); g.strokeStyle = c; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(-len / 2, 0); g.lineTo(len / 2, 0); g.stroke(); g.restore(); };
    const ring = (x, y, r, c, w = 0.42 * u) => { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); };
    const arc = (x, y, rot, r, c, w = 0.5 * u) => { g.strokeStyle = c; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.arc(x, y, r, rot, rot + Math.PI * 0.6); g.stroke(); };
    const cross = (x, y, rot, s, c, w = 0.5 * u) => { g.save(); g.translate(x, y); g.rotate(rot); g.strokeStyle = c; g.lineWidth = w; g.lineCap = 'butt'; g.beginPath(); g.moveTo(-s, 0); g.lineTo(s, 0); g.moveTo(0, -s); g.lineTo(0, s); g.stroke(); g.restore(); g.lineCap = 'round'; };

    // ---------------------------------------------------------------- confetti: one small piece of size r (bounding radius, px)
    let turn = rng.int(0, 7);
    const nextCol = (near) => { for (let k = 0; k < 6; k++) { const c = col(turn++); if (c !== near) return c; } return col(turn++); };
    const bit = (x, y, r, tier, near) => {
      const rot = rng() * TAU, c = nextCol(near), s = r / u;                                  // s: size in units
      if (tier === 0) {                                                                    // tiny: specks
        const t = rng.int(0, 3);
        if (t === 0) { g.fillStyle = rng() < 0.3 ? K : c; g.beginPath(); g.arc(x, y, r * 0.62, 0, TAU); g.fill(); }
        else if (t === 1) solid(x, y, rot, shape.tri(r * 1.7), r, { fill: rng() < 0.3 ? K : c, outline: false });
        else if (t === 2) bar(x, y, rot, r * 1.5, rng() < 0.4 ? K : c, 0.42 * u);
        else cross(x, y, rot, r * 0.75, K, 0.3 * u);
      } else if (tier === 1) {                                                             // small
        const t = rng.int(0, 7);
        if (t === 0) squiggle(x, y, rot, r * 2.1, rng() < 0.45 ? K : c, 0.5 * u, 0.7 * u, 2.0 * u);
        else if (t === 1) zigzag(x, y, rot, r * 2.0, rng() < 0.45 ? K : c);
        else if (t === 2) solid(x, y, rot, shape.tri(r * 1.75), r, { fill: c, outline: rng() < 0.55 });
        else if (t === 3) { ring(x, y, r * 0.72, rng() < 0.35 ? K : c, 0.44 * u); }
        else if (t === 4) solid(x, y, rot, shape.half(r * 0.95), r, { fill: c, outline: rng() < 0.5 });
        else if (t === 5) { g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = K; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { g.beginPath(); g.arc(i * r * 0.55, j * r * 0.55, r * 0.13, 0, TAU); g.fill(); } g.restore(); }
        else if (t === 6) solid(x, y, rot, shape.rect(r * 1.5, r * 0.62), r, { fill: Wh, pattern: 'stripesV', pc: K, outline: true });
        else arc(x, y, rot, r * 0.85, rng() < 0.4 ? K : c);
      } else {                                                                             // medium and large: patterned solids
        const t = rng.int(0, 6), shadow = rng() < 0.22;
        const p1 = rng.pick(['dots', 'stripes', 'grid', null, 'stripesH']), pcol = rng() < 0.6 ? K : Wh;
        if (t === 0) solid(x, y, rot, shape.circle(r * 0.92), r, { fill: c, pattern: p1, pc: pcol, shadow });
        else if (t === 1) solid(x, y, rot, shape.tri(r * 1.8), r, { fill: c, pattern: rng() < 0.5 ? 'stripes' : null, pc: pcol, shadow });
        else if (t === 2) solid(x, y, rot, shape.rect(r * 1.45, r * 1.45, r * 0.08), r, { fill: rng() < 0.4 ? Wh : c, pattern: rng.pick(['grid', 'terrazzo', 'checks', 'dots']), pc: K, shadow });
        else if (t === 3) solid(x, y, rot, shape.half(r), r, { fill: c, pattern: p1, pc: pcol, shadow });
        else if (t === 4) solid(x, y, rot, shape.quarter(r * 1.5), r, { fill: c, pattern: rng() < 0.5 ? 'dots' : null, pc: pcol, shadow });
        else if (t === 5) { squiggle(x, y, rot, r * 2.3, K, 0.62 * u, 0.95 * u, 2.5 * u); if (s > 5) squiggle(x + reg[0] * 1.6, y + reg[1] * 1.6 + 1.6 * u, rot, r * 2.3, c, 0.62 * u, 0.95 * u, 2.5 * u); }
        else solid(x, y, rot, shape.rect(r * 1.9, r * 0.5, r * 0.25), r, { fill: Wh, pattern: 'stripesV', pc: K });
      }
    };
    /** Scatter confetti by dart throwing: no piece touches another, the copy, or the areas in `keepOut` ([x, y, r]). */
    const scatter = ({ count, big = 0, mid = 0, keepOut = [], spread = 1, fringe = 0.16 }) => {
      const placed = keepOut.map(([x, y, r]) => ({ x, y, r, c: null }));
      const tryPlace = (tier, rr, n, sig, need) => {
        for (let i = 0, tries = 0; i < n && tries < n * 60; tries++) {
          const r = rng.range(rr[0], rr[1]) * u * P.scale;
          const x = sig ? fx + rng.gauss() * sig : rng.range(-0.03, 1.03) * W, y = sig ? fy + rng.gauss() * sig : rng.range(-0.03, 1.03) * H;
          if (x < -r || y < -r || x > W + r || y > H + r) continue;
          const side = sideT(x, y);
          if (qDist(x, y) < r + need * u || (side < 1 && rng() > (tier === 0 ? fringe : 0) + side * side)) continue;
          const gap = (tier >= 2 ? 1.1 : 0.9) * u; let near = null, ok = true, nd = 1e9;
          for (const p of placed) { const d = Math.hypot(p.x - x, p.y - y) - p.r - r; if (d < gap) { ok = false; break; } if (d < nd && p.c) { nd = d; near = p.c; } }
          if (!ok) continue;
          const before = turn; bit(x, y, r, tier, near); placed.push({ x, y, r, c: col(turn - 1) }); i++; void before;
        }
      };
      tryPlace(3, [6.4, 9.0], big, 0.24 * S * spread, 3);
      tryPlace(2, [3.3, 5.0], mid, 0.4 * S * spread, 2.6);
      tryPlace(1, [1.6, 2.5], Math.round(count * 0.4), 0.6 * S * spread, 2.2);
      tryPlace(1, [1.4, 2.2], Math.round(count * 0.16), 0, 2.2);
      tryPlace(0, [0.45, 0.85], Math.round(count * 0.4), 0.7 * S * spread, 1.6);
      tryPlace(0, [0.42, 0.8], Math.round(count * 0.35), 0, 2.2);
    };

    // ================================================================= motifs
    if (motif === 'confetti') {
      const area = (W * H) / (short * short);
      scatter({ count: Math.round(96 * P.density * Math.sqrt(area)), big: Math.round(3 * P.density + 1), mid: Math.round(10 * P.density) });
    } else if (motif === 'stack') {
      // a pile of big solids around the focus, laid out in a unit frame that follows the shape of the free space
      const R = (S / 2) * 0.98 * P.scale, kx = clamp(aw / Math.max(ah, 1), 1, 1.45), ky = clamp(ah / Math.max(aw, 1), 1, 1.3), flip = rng.sign();
      const X = (v) => fx + v * R * kx * flip, Y = (v) => fy + v * R * ky, j = (a) => rng.range(-a, a);
      const c = rng.shuffle([0, 1, 2, 3]).map((i) => col(i));
      const keep = [];
      const put = (x, y, r) => keep.push([x, y, r]);
      // back to front
      solid(X(-0.3 + j(0.04)), Y(-0.2 + j(0.04)), 0, shape.circle(0.56 * R), 0.56 * R, { fill: c[0], pattern: 'dots', pc: Wh }); put(X(-0.3), Y(-0.2), 0.58 * R);
      solid(X(0.42 + j(0.03)), Y(0.02 + j(0.04)), flip * (-0.14 + j(0.05)), shape.rect(0.44 * R, 1.34 * R), 0.75 * R, { fill: c[1], pattern: 'stripes', pc: Wh }); put(X(0.42), Y(-0.3), 0.34 * R); put(X(0.44), Y(0.34), 0.34 * R);
      solid(X(-0.36 + j(0.03)), Y(0.5 + j(0.03)), flip > 0 ? 0 : Math.PI / 2, shape.quarter(0.68 * R), 0.6 * R, { fill: c[2], pattern: 'grid', pc: K }); put(X(-0.36), Y(0.5), 0.42 * R);
      solid(X(0.04 + j(0.04)), Y(-0.6 + j(0.03)), flip * (0.3 + j(0.1)), shape.tri(0.62 * R), 0.4 * R, { fill: c[3], shadow: true }); put(X(0.04), Y(-0.58), 0.32 * R);
      solid(X(-0.02 + j(0.03)), Y(0.26 + j(0.03)), flip * (-0.42 + j(0.06)), shape.rect(1.02 * R, 0.15 * R), 0.55 * R, { fill: Wh, pattern: 'stripesV', pc: K });
      solid(X(0.7 + j(0.03)), Y(-0.66 + j(0.03)), 0, shape.circle(0.14 * R), 0.14 * R, { fill: c[2], shadow: true }); put(X(0.7), Y(-0.66), 0.2 * R);
      solid(X(0.56 + j(0.03)), Y(0.76 + j(0.02)), flip * 0.08, shape.half(0.3 * R), 0.3 * R, { fill: Wh, pattern: 'terrazzo', pc2: [K, c[0], c[3], c[1]] }); put(X(0.56), Y(0.78), 0.32 * R);
      squiggle(X(-0.72), Y(-0.74), flip * 0.5, 0.56 * R, K, 0.62 * u, 0.95 * u, 2.5 * u); put(X(-0.72), Y(-0.74), 0.3 * R);
      zigzag(X(0.06), Y(0.86), flip * -0.1, 0.52 * R, c[3], 0.6 * u, 0.9 * u, 1.5 * u); put(X(0.06), Y(0.86), 0.28 * R);
      ring(X(-0.86), Y(0.14), 0.085 * R, c[1], 0.5 * u); put(X(-0.86), Y(0.14), 0.13 * R);
      scatter({ count: Math.round(54 * P.density), keepOut: keep, spread: 1.25, fringe: 0.08 });
    } else {
      // a framed totem: stacked solids on a base, inside a patterned frame that fits the free space
      const fh = Math.min(ah * 0.94, aw * 1.3) * P.scale, fw = Math.min(aw * 0.94, fh * (aw > ah * 1.25 ? 1.7 : 0.8)), x0 = fx - fw / 2, y0 = fy - fh / 2;
      const border = clamp(0.055 * Math.min(fw, fh), 1.4 * u, 3.2 * u), c = rng.shuffle([0, 1, 2, 3]).map((i) => col(i));
      // hard shadow, frame band, inner panel
      g.fillStyle = K; g.fillRect(x0 + 1.3 * u * Math.sign(reg[0]), y0 + 1.3 * u, fw, fh);
      g.save(); g.beginPath(); g.rect(x0, y0, fw, fh); g.fillStyle = Wh; g.fill(); g.clip(); g.translate(fx, fy); pat.bacterio(Math.max(fw, fh) * 0.6, K, 1.5 * u); g.restore();
      g.strokeStyle = K; g.lineWidth = lw; g.strokeRect(x0, y0, fw, fh);
      const ix = x0 + border, iy = y0 + border, iw = fw - 2 * border, ih = fh - 2 * border, floorH = ih * 0.2;
      g.fillStyle = c[0]; g.fillRect(ix, iy, iw, ih);
      g.save(); g.beginPath(); g.rect(ix, iy + ih - floorH, iw, floorH); g.fillStyle = c[1]; g.fill(); g.clip(); g.translate(fx, iy + ih - floorH / 2); pat.checks(iw, dark ? Wh : K, 1.35 * u); g.restore();
      g.strokeStyle = K; g.lineWidth = lw; g.strokeRect(ix, iy, iw, ih); g.beginPath(); g.moveTo(ix, iy + ih - floorH); g.lineTo(ix + iw, iy + ih - floorH); g.stroke();
      // behind the totem: an arch on one side and a striped disc on the other, cut off by the panel
      const flip = rng.sign(), m0 = Math.min(iw, ih);
      g.save(); g.beginPath(); g.rect(ix, iy, iw, ih - floorH); g.clip();
      solid(fx - flip * iw * 0.2, iy + ih - floorH - m0 * 0.36, 0, shape.arch(m0 * 0.42, m0 * 0.74), m0 * 0.5, { fill: c[2], pattern: 'dots', pc: dark ? K : Wh });
      solid(fx + flip * iw * 0.27, iy + m0 * 0.27, 0, shape.circle(m0 * 0.15), m0 * 0.16, { fill: Wh, pattern: 'stripesH', pc: K });
      g.restore();
      squiggle(fx + flip * iw * 0.26, iy + ih - floorH - m0 * 0.16, 0.2 * flip, m0 * 0.26, K, 0.5 * u, 0.8 * u, 2.2 * u);
      // one totem: pieces stacked upward from the floor line; `k` scales it
      const totem = (cx, baseY, hgt, variant) => {
        const m = hgt / 10;                                                               // module
        let y = baseY;
        const others = [c[2], c[3], Wh, c[1]];
        const stackUp = (hh, draw) => { y -= hh; draw(y + hh / 2); };
        const recipes = [
          [['slab', 5.2, 0.9, Wh, 'stripesV'], ['block', 3.0, 2.0, others[0], 'dots'], ['disc', 4.4, 0.7, K, null], ['ball', 2.5, 2.5, others[1], null], ['trap', 3.6, 1.5, Wh, 'terrazzo'], ['cone', 2.6, 1.9, others[0], 'stripes'], ['ball', 0.9, 0.9, others[3], null]],
          [['slab', 4.6, 0.8, others[1], null], ['trap', 2.4, 2.2, Wh, 'grid'], ['disc', 4.0, 0.6, others[0], null], ['block', 2.2, 1.7, K, null], ['ball', 2.6, 2.6, others[0], 'dots'], ['disc', 3.2, 0.5, Wh, 'stripesV'], ['cone', 2.0, 1.6, others[1], null]],
          [['slab', 5.0, 0.8, K, null], ['ball', 2.2, 2.2, others[1], 'stripesH'], ['block', 3.4, 1.5, Wh, 'checks'], ['trap', 3.0, 1.8, others[0], null], ['disc', 4.2, 0.6, Wh, 'stripesV'], ['diamond', 2.2, 2.4, others[1], 'dots'], ['ball', 0.7, 0.7, K, null]],
        ];
        const parts = recipes[variant % recipes.length], total = parts.reduce((s, p) => s + p[2], 0), k = 10 / total;
        for (const [type, w0, h0, fill, pattern] of parts) {
          const w = w0 * m * k * 1.05, hh = h0 * m * k, pc = fill === K ? Wh : K, R = Math.max(w, hh) * 0.6;
          stackUp(hh, (cy) => {
            if (type === 'slab' || type === 'disc') solid(cx, cy, 0, shape.rect(w, hh, type === 'disc' ? hh / 2 : hh * 0.12), R, { fill, pattern, pc });
            else if (type === 'block') solid(cx, cy, 0, shape.rect(w, hh, hh * 0.08), R, { fill, pattern, pc });
            else if (type === 'ball') solid(cx, cy, 0, shape.circle(hh / 2), R, { fill, pattern, pc });
            else if (type === 'trap') solid(cx, cy, 0, shape.trap(w * 0.55, w, hh), R, { fill, pattern, pc, pc2: [K, c[0], c[3]] });
            else if (type === 'cone') solid(cx, cy, 0, shape.trap(w * 0.08, w, hh), R, { fill, pattern, pc });
            else if (type === 'diamond') solid(cx, cy, 0, shape.diamond(w, hh), R, { fill, pattern, pc });
          });
        }
      };
      const floorY = iy + ih - floorH * 0.45, tall = ih * 0.8, v0 = rng.int(0, 2);
      if (iw > ih * 1.25) { totem(fx - iw * 0.3, floorY, tall * 0.74, v0 + 1); totem(fx + iw * 0.3, floorY, tall * 0.66, v0 + 2); }
      totem(fx, floorY + floorH * 0.12, tall, v0);
      // a squiggle and a few loose solids break the frame
      const keep = [[fx, fy, Math.hypot(fw, fh) / 2 * 0.86]];
      const cornerX = x0 + (reg[0] > 0 ? 0 : fw), sgn = reg[0] > 0 ? -1 : 1;
      solid(cornerX + sgn * 0.3 * u, y0 + fh * 0.2, 0.3, shape.tri(5.4 * u), 3 * u, { fill: c[2], shadow: true });
      squiggle(x0 + (reg[0] > 0 ? fw : 0) - sgn * 0.5 * u, y0 + fh * 0.74, 1.1, 9 * u, K, 0.62 * u, 0.95 * u, 2.5 * u);
      solid(cornerX - sgn * 0.2 * u, y0 + fh * 0.9, 0, shape.circle(1.7 * u), 1.7 * u, { fill: c[3], pattern: 'dots', pc: Wh });
      keep.push([cornerX, y0 + fh * 0.2, 4 * u], [x0 + (reg[0] > 0 ? fw : 0), y0 + fh * 0.74, 5.5 * u], [cornerX, y0 + fh * 0.9, 2.6 * u], [x0, y0, 3 * u], [x0 + fw, y0, 3 * u], [x0, y0 + fh, 3 * u], [x0 + fw, y0 + fh, 3 * u]);
      scatter({ count: Math.round(46 * P.density), keepOut: keep, spread: 1.3, fringe: 0.08 });
    }
  });

  scene.add(backgroundQuad(/* glsl */`
    varying vec2 vUv; uniform sampler2D uTex;
    ${GLSL_DITHER}
    void main(){
      gl_FragColor = vec4(texture2D(uTex, vUv).rgb, 1.0);
      #include <colorspace_fragment>
      gl_FragColor.rgb += ditherNoise(gl_FragCoord.xy);
    }`, { uTex: { value: tex } }));

  ctx.frame({ radius: 1, fov: 30, dir: [0, 0, 1] });
}
