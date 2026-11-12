// Reaction–diffusion relief — a Gray–Scott pattern grown on a CPU grid and printed as a softly
// embossed relief: combed stripes (like wood grain or a fingerprint) around the layout focus, breaking
// into packed dots and then nothing where the copy sits. The pattern is never masked: the feed / kill
// rates themselves change across the canvas, so the transitions are the chemistry's own.
//
// Motif rules built in: the second chemical diffuses faster along one smooth direction field, so the
// stripes run side by side in one general direction and cannot radiate from a point; the drift of
// pattern is an elongated, warped band with patches of dots inside (never a disc), and its rim is
// always in the dot regime.
//
// Palette: bg = the calm field (behind the copy) · colors[0] / colors[1] = the two inks of the pattern
//          colors[2] (or accent) = buds at the stripe tips and in the dots
import { makeNoise, backgroundQuad, floatTexture, GLSL_BICUBIC, GLSL_NOISE_KIT, GLSL_DITHER } from '/skill/assets/web/scene-lib.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// (feed, kill) along the way from the focus to the copy: core pattern → packed dots (they multiply by
// splitting, with no direction of their own) → nothing. MID is where on that way the dots are reached.
const PATTERNS = {
  coral: [[0.055, 0.0622], [0.036, 0.0632], [0.030, 0.071]],      // long combed stripes
  worms: [[0.046, 0.0632], [0.036, 0.0634], [0.030, 0.071]],      // shorter, broken stripes
  spots: [[0.036, 0.0620], [0.034, 0.0636], [0.030, 0.071]],      // packed dots throughout, like a seed head
};
const MID = 0.45;

export default function build(ctx) {
  const { THREE, scene, palette, params, aspect, seed, rng, width: W, height: H } = ctx;
  const sx = Math.max(aspect, 1), sy = Math.max(1 / aspect, 1);            // frame fraction → short-side units
  const P = {
    pattern: PATTERNS[params.pattern] ? params.pattern : 'coral', scale: clamp(params.scale ?? 1, 0.6, 1.8),
    relief: clamp(params.relief ?? 1, 0, 2), buds: clamp(params.buds ?? 1, 0, 1), spread: clamp(params.spread ?? 1, 0.5, 2),
    steps: Math.round(clamp(params.steps ?? 2600, 500, 9000)), flow: clamp(params.flow ?? 1, 0.7, 1.5),
  };
  const K = PATTERNS[P.pattern];

  // ---- grid: about 11 cells per stripe period; `scale` 1 puts ~30 periods across the short side.
  // It is PAD cells larger than the frame on every side, so the pattern runs off the sheet instead
  // of lining up along the border.
  const gShort = Math.round(clamp(330 / P.scale, 180, 460)), PAD = 20;
  const fw = Math.round(gShort * sx), fh = Math.round(gShort * sy), gw = fw + 2 * PAD, gh = fh + 2 * PAD, n = gw * gh;

  // ---- parameter field m: 0 at the focus (densest pattern) … 1 on the copy (nothing can live)
  const noise = makeNoise(seed * 17 + 3);
  // rectangles that touch the edge of the sheet continue beyond it (the grid is larger than the frame)
  const quiet = (ctx.quiet || []).map(([x0, y0, x1, y1]) => {
    const strip = x0 <= 0.02 && x1 >= 0.98, e = strip ? 0.02 : 0.1;     // a sliver between the copy and the edge is not worth a few stray dots
    return { x0: x0 <= e ? -1 : x0, y0: y0 <= e ? -1 : y0, x1: x1 >= 1 - e ? 2 : x1, y1: y1 >= 1 - e ? 2 : y1, strip };
  });
  // a narrow gap between the copy block and a footer / header strip is closed: no stray dots in a sliver
  for (const r of quiet) if (!r.strip) for (const q of quiet) if (q.strip) {
    if (q.y0 > r.y1 && (q.y0 - r.y1) * sy < 0.22) r.y1 = 2;
    if (q.y1 < r.y0 && (r.y0 - q.y1) * sy < 0.22) r.y0 = -1;
  }
  const rectDist = (r, px, py) => {
    const ex = (Math.abs(px - (r.x0 + r.x1) / 2) - (r.x1 - r.x0) / 2) * sx, ey = (Math.abs(py - (r.y0 + r.y1) / 2) - (r.y1 - r.y0) / 2) * sy;
    return Math.hypot(Math.max(ex, 0), Math.max(ey, 0)) + Math.min(Math.max(ex, ey), 0);
  };
  // the drift of pattern: wide enough to run off the nearest edges of the sheet even when the copy leaves little room,
  // stretched along a random axis and warped, so its outline is an irregular band and never a disc
  const fx = ctx.focus.x, fy = ctx.focus.y, R = Math.max(0.5 * clamp(ctx.artSize ?? 0.7, 0.35, 1), 0.44) * P.spread;
  const axis = rng.range(-0.6, 0.6), ca = Math.cos(axis), sa = Math.sin(axis), stretch = rng.range(1.6, 2.1);
  // copy lying on the focus (layout "center"): the island becomes a wreath around the copy block
  const copy = quiet.find((r) => !r.strip), wreath = !!copy && rectDist(copy, fx, fy) < 0.02;
  // margin kept around the copy block: generous where there is room, tight in crowded formats
  const [ax0, ay0, ax1, ay1] = ctx.artRect || [0, 0, 1, 1], room = Math.min((ax1 - ax0) * sx, (ay1 - ay0) * sy);
  const band = wreath ? 0.17 : clamp(0.42 * room, 0.12, 0.3);
  const F = new Float32Array(n), Kk = new Float32Array(n), M = new Float32Array(n);
  // diffusion tensor of the second chemical: faster along the grain (a base direction with a gentle swing of about ±17°)
  const Vxx = new Float32Array(n), Vyy = new Float32Array(n), Vxy = new Float32Array(n), grain = rng.range(-1.1, 1.1), AN = 2.2 * P.flow;
  let bx0 = gw, bx1 = 0, by0 = gh, by1 = 0;
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const px = (x - PAD + 0.5) / fw, py = (y - PAD + 0.5) / fh, ux = px * sx, uy = py * sy;
      const wob = noise.fbm(ux * 1.7, uy * 1.7, 0.3, 3), wob2 = noise.fbm(ux * 5.5 + 9, uy * 5.5, 2.3, 2);
      let mQuiet = 0;
      for (const r of quiet) {
        const dq = rectDist(r, px, py);
        // the copy block gets a wide, wandering margin; footer and header strips a narrow one
        mQuiet = Math.max(mQuiet, r.strip ? 1 - sstep(-0.05, 0.16, dq + 0.1 * wob + 0.07 * wob2) : 1 - sstep(-0.07, band, dq + 0.66 * band * wob + 0.03 * wob2));
      }
      let df;
      if (wreath) df = 0.75 + Math.max(0, rectDist(copy, px, py) - 0.2) / R;
      else {
        const wx = (px - fx) * sx + 0.6 * R * noise.fbm(ux * 1.1 + 31, uy * 1.1, 4.1, 2), wy = (py - fy) * sy + 0.6 * R * noise.fbm(ux * 1.1, uy * 1.1 + 47, 8.3, 2);
        df = Math.hypot((wx * ca + wy * sa) / stretch, -wx * sa + wy * ca) / R;
      }
      // … with patches inside where the labyrinth already gives way to dots, so nothing lines up around a centre
      const mPatch = 0.44 * sstep(-0.22, 0.3, noise.fbm(ux * 2.4 + 5, uy * 2.4 + 11, 6.6, 2));
      const mFocus = Math.max(0.95 * sstep(0.7, 2.3, df), mPatch);
      const edge = 1 - sstep(3, PAD - 4, Math.min(x, y, gw - 1 - x, gh - 1 - y));   // … that dies away outside the sheet, before the wall of the grid
      let m = Math.max(mFocus, mQuiet, edge) + 0.03 * wob2;
      m = clamp(m + 0.45 * sstep(0.56, 0.7, m), 0, 1);                      // the rim ends cleanly: a band of dots, then bare field
      const i = y * gw + x, seg = m < MID ? 0 : 1, t = seg ? (m - MID) / (1 - MID) : m / MID;
      M[i] = m; F[i] = K[seg][0] + (K[seg + 1][0] - K[seg][0]) * t; Kk[i] = K[seg][1] + (K[seg + 1][1] - K[seg][1]) * t;
      const ga = grain + 0.5 * noise.fbm(ux * 0.9 + 3, uy * 0.9 + 8, 1.7, 2), gc = Math.cos(ga), gs = Math.sin(ga);
      const an = 1 + (AN - 1) * (1 - sstep(0.3, 0.45, m)), da = Math.sqrt(an), dc = 1 / da;     // the comb lets go where the dots begin
      Vxx[i] = da * gc * gc + dc * gs * gs; Vyy[i] = da * gs * gs + dc * gc * gc; Vxy[i] = (da - dc) * gs * gc * 0.5;
      if (m < 0.985) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
    }
  }
  // the box ends well inside the dead zone: a pattern next to its (frozen) wall would line up along it
  bx0 = Math.max(1, bx0 - 6); by0 = Math.max(1, by0 - 6); bx1 = Math.min(gw - 2, bx1 + 6); by1 = Math.min(gh - 2, by1 + 6);

  // ---- seed: many small squares of the second chemical, thinning out towards the copy
  let u = new Float32Array(n).fill(1), v = new Float32Array(n), u2 = new Float32Array(n).fill(1), v2 = new Float32Array(n);
  for (let s = Math.round(n / 55); s > 0; s--) {
    const cx = rng.int(2, gw - 5), cy = rng.int(2, gh - 5), m = M[cy * gw + cx];
    if (m > 0.8 || rng() > Math.pow(1 - m, 1.6) + 0.02) continue;
    const a = rng.range(0.25, 0.5);
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) { const j = (cy + dy) * gw + cx + dx; u[j] = 0.5; v[j] = a; }
  }

  // ---- Gray–Scott, explicit Euler (Du 0.2, Dv 0.1, dt 1): 5-point Laplacian for the first chemical, the
  // direction-dependent one (with its cross term) for the second; only the live box is stepped
  const Du = 0.2, Dv = 0.1;
  for (let st = 0; st < P.steps; st++) {
    for (let y = by0; y <= by1; y++) {
      let i = y * gw + bx0;
      for (let x = bx0; x <= bx1; x++, i++) {
        const a = u[i], b = v[i], r = a * b * b;
        u2[i] = a + Du * (u[i - 1] + u[i + 1] + u[i - gw] + u[i + gw] - 4 * a) - r + F[i] * (1 - a);
        v2[i] = b + Dv * (Vxx[i] * (v[i - 1] + v[i + 1] - 2 * b) + Vyy[i] * (v[i - gw] + v[i + gw] - 2 * b) + Vxy[i] * (v[i + gw + 1] + v[i - gw - 1] - v[i + gw - 1] - v[i - gw + 1])) + r - (F[i] + Kk[i]) * b;
      }
    }
    let t = u; u = u2; u2 = t; t = v; v = v2; v2 = t;
  }
  // iso-levels from the histogram of the live cells (robust against the odd spike): the edge of the
  // print sits at 60% of the 90th percentile, the buds are the top few percent (stripe tips and dots)
  const hist = new Uint32Array(256); let live = 0;
  for (let i = 0; i < n; i++) if (v[i] > 0.08) { hist[Math.min(255, Math.floor(v[i] * 255))]++; live++; }
  const pct = (q) => { let acc = 0; for (let b = 0; b < 256; b++) { acc += hist[b]; if (acc >= live * q) return (b + 0.5) / 255; } return 0.4; };
  const vref = live > 50 ? pct(0.9) : 0.36, vbud = live > 50 ? Math.max(pct(0.975), vref * 1.04) : 0.4;
  const tex = floatTexture(v, gw, gh, { channels: 1 });

  // ---- colours
  const cols = palette.colors, C = (h) => new THREE.Color(h);
  const bg = C(palette.bg), dark = bg.getHSL({}).l < 0.4;
  const cA = C(cols[0]), cB = C(cols[1] ?? cols[0]), cIn = C(cols[2] ?? palette.accentOriginal ?? palette.accent);

  scene.add(backgroundQuad(/* glsl */`
    varying vec2 vUv;
    uniform sampler2D uSim; uniform vec2 uGrid, uFrame, uAsp, uFocus; uniform float uPad; uniform float uShort, uVmax, uBud, uRelief, uInline, uSeed, uDark, uR; uniform vec2 uDir;
    uniform vec3 cBg, cA, cB, cIn;
    ${GLSL_BICUBIC}
    ${GLSL_NOISE_KIT}
    ${GLSL_DITHER}
    float fieldV(vec2 p){ return textureBicubic(uSim, (p * uFrame + uPad) / uGrid, uGrid).r / uVmax; }
    void main(){
      vec2 p = vec2(vUv.x, 1.0 - vUv.y), q = p * uAsp;
      float v = fieldV(p);
      vec2 g = vec2(dFdx(v), -dFdy(v));                                   // per pixel, y down
      float gl = max(length(g), 1e-6);
      float thr = 0.6, thrIn = uBud;
      float mask = clamp((v - thr) / gl + 0.5, 0.0, 1.0);                 // crisp, one-pixel antialiased edge
      float inl = clamp((v - thrIn) / gl + 0.5, 0.0, 1.0) * uInline;

      // two inks, changing across the sheet along one direction (with a wandering boundary) — not around a centre
      float tone = smoothstep(-0.3, 0.3, dot((p - uFocus) * uAsp, uDir) / uR * 0.55 + 0.6 * fbm2(q * 1.5 + uSeed, 3));
      vec3 pat = mix(cA, cB, tone);
      pat *= 1.0 + 0.05 * fbm2(q * 9.0 + uSeed * 1.3, 3);                  // uneven ink lay, as in a hand pull
      vec3 field = cBg;

      // relief: the pattern is a pillow raised out of the field, lit from the upper left
      float t = clamp((v - (thr - 0.34)) / 0.62, 0.0, 1.0), dh = 6.0 * t * (1.0 - t) / 0.62;
      vec2 tilt = g * uShort * dh * 0.0042 * uRelief;
      vec3 nrm = normalize(vec3(-tilt, 1.0)), L = normalize(vec3(-0.5, -0.68, 0.72));
      float sh = dot(nrm, L) - L.z;                                        // > 0 on slopes that face the light
      vec2 toLight = normalize(L.xy) / uAsp;
      float thrown = smoothstep(thr - 0.2, thr + 0.12, fieldV(p + toLight * 0.0052 * uRelief)) * (1.0 - mask);   // soft shadow thrown on the field
      vec3 shadowC = mix(mix(cBg * 0.55, pat * 0.5, 0.5), cBg * 0.35, uDark);

      vec3 col = mix(field, pat, mask);
      col = mix(col, cIn, inl);
      col = mix(col, shadowC, thrown * mix(0.3, 0.55, uDark) * min(uRelief, 1.0));
      float hi = max(sh, 0.0), lo = max(-sh, 0.0);
      col += (mix(vec3(1.0), col, 0.35) - col) * hi * mix(1.15, 0.8, uDark) * mix(mix(0.55, 0.1, uDark), 1.0, mask);
      col *= 1.0 - lo * mix(0.9, 1.25, uDark) * mix(0.6, 1.0, mask);

      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
      float grain = (hash21(gl_FragCoord.xy) - 0.5) * 0.018 + fbm2(q * 70.0, 3) * 0.01;   // paper tooth
      gl_FragColor.rgb += grain * mix(1.0, 0.5, uDark) + ditherNoise(gl_FragCoord.xy);
    }`, {
    uSim: { value: tex }, uGrid: { value: new THREE.Vector2(gw, gh) }, uFrame: { value: new THREE.Vector2(fw, fh) }, uPad: { value: PAD }, uAsp: { value: new THREE.Vector2(sx, sy) }, uFocus: { value: new THREE.Vector2(fx, fy) },
    uShort: { value: Math.min(W, H) }, uVmax: { value: vref }, uBud: { value: vbud / vref }, uRelief: { value: P.relief }, uInline: { value: P.buds }, uSeed: { value: (seed % 101) * 0.37 },
    uDark: { value: dark ? 1 : 0 }, uR: { value: R }, uDir: { value: new THREE.Vector2(Math.cos(axis + 0.9), Math.sin(axis + 0.9)) }, cBg: { value: bg }, cA: { value: cA }, cB: { value: cB }, cIn: { value: cIn },
  }));

  ctx.frame({ radius: 1, fov: 30, dir: [0, 0, 1] });
}
