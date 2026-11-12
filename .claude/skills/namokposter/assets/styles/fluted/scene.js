// Fluted Glass — a pane of reeded glass standing in front of soft coloured light.
// Behind the pane are a few large, simple forms of colour (a disc, bands of a horizon, blooms). They are
// one smooth picture, `field(p)`, made of analytic soft discs and ellipses mixed in OKLab. Outside the
// pane the picture is shown as it is; inside, every rib of the glass is a small cylindrical lens: a pixel
// at position u across its rib looks at the picture at "rib centre − k·u", so each rib shows a squeezed,
// mirrored slice of what stands behind it. On top of that come the things that make it glass rather than
// a striped gradient: brightness falling off towards the joints, a hairline dark joint, a thin specular
// line on the light side of every rib, and a slight colour fringe (red and blue bent a few percent apart).
//
// The pane is a rectangle taken from the layout: the largest one that holds the focus and touches no
// rectangle that carries type. It bleeds off the page where nothing stops it; the edge that faces the copy
// is then drawn back from the copy, and the forms are set astride that edge — half a sun clear, half of it
// sliced. Under the copy there is only the page colour.
//
// params.motif:
//   orb    one large disc in a two-colour gradient and one small one
//   dusk   a low sun sinking into three long, rolling bands of colour (a horizon)
//   bloom  three large soft overlapping blooms and a bud
// other params: ribs (rib width), direction (vertical | horizontal), lens, fringe, sheen, grain — see style.json.
//
// Palette: bg = the page · colors[0] → colors[1] = the main form's gradient · colors[2] = the second form
//          colors[3] = pale light (washes, rims). With the pale, tonal colours a ground receives, the glass
//          itself is drawn more quietly.
import { backgroundQuad, quietUniforms, GLSL_QUIET, GLSL_OKLAB, oklabVec, makeComposer, finishPassShader } from '/skill/assets/web/scene-lib.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const NS = 9;      // most shapes in one picture
const TAPS = 6;    // samples across a pixel inside the pane

export default function build(ctx) {
  const { THREE, scene, palette, params, aspect, rng, unit, width: W, height: H } = ctx;
  const sx = Math.max(aspect, 1), sy = Math.max(1 / aspect, 1), short = Math.min(W, H);   // frame fraction → short-side units (su)
  const snap = (v) => Math.round(v * short) / short;                                       // onto a pixel boundary
  const P = {
    motif: String(params.motif ?? 'orb'), ribs: clamp(Number(params.ribs ?? 1), 0.4, 3), horizontal: String(params.direction ?? 'vertical') === 'horizontal',
    lens: clamp(Number(params.lens ?? 1), 0, 2.5), fringe: clamp(Number(params.fringe ?? 1), 0, 3), sheen: clamp(Number(params.sheen ?? 1), 0, 2.5), grain: clamp(Number(params.grain ?? 1), 0, 2.5),
  };
  const cols = palette.colors?.length ? palette.colors : [palette.accent];
  const L = (i) => oklabVec(cols[Math.min(i, cols.length - 1)]);
  const mixL = (a, b, t) => a.clone().lerp(b, t);
  const bg = oklabVec(palette.bg), dark = bg.x < 0.5;
  const c0 = L(0), c1 = L(1), c2 = L(2), c3 = L(3);
  // How far the colours stand off the page, as a share of the distance from the page to the ink. A ground
  // gets pale tints of the page colour and the glass follows suit: its shading and highlights drop to 0.7.
  // The share is used rather than the plain distance because on a dark page even a pale tint is a long way
  // from the page in OKLab. Measured over every stock palette turned into a ground (412): share 0.06–0.38;
  // this style's own five palettes: 0.59–0.83. A muted palette of your own (under 0.4) is drawn quietly too.
  const vivid = Math.max(...[c0, c1, c2].map((c) => c.distanceTo(bg))) / Math.max(oklabVec(palette.ink).distanceTo(bg), 1e-3);
  const glass = 0.7 + 0.3 * clamp((vivid - 0.4) / 0.15, 0, 1);

  // ---- the pane: the largest rectangle that holds the focus and clears every rectangle that carries type.
  // Each side is either off the page (bleed) or the near side of one quiet rectangle; all combinations are tried.
  const F = { x: ctx.focus.x * sx, y: ctx.focus.y * sy };
  const quiet = (ctx.quiet || []).slice(0, 4).map(([x0, y0, x1, y1], i) => {
    const strip = x1 - x0 > 0.9 && (y0 < 0.002 || y1 > 0.998), g = strip ? 0.03 : 0.04;     // a clear band of page between the pane and the copy, the footer rule, the header
    return { x0: x0 * sx - g, y0: y0 * sy - g, x1: x1 * sx + g, y1: y1 * sy + g, strip, i };
  });
  const BLEED = 0.1;
  const lows = (k) => [{ v: -BLEED, q: null }, ...quiet.map((q) => ({ v: q[k], q }))];
  const highs = (k, max) => [{ v: max + BLEED, q: null }, ...quiet.map((q) => ({ v: q[k], q }))];
  let best = null;
  for (const a of lows('x1')) for (const b of highs('x0', sx)) for (const c of lows('y1')) for (const d of highs('y0', sy)) {
    const x0 = Math.max(a.v, 0), x1 = Math.min(b.v, sx), y0 = Math.max(c.v, 0), y1 = Math.min(d.v, sy);
    if (x1 - x0 < 0.14 || y1 - y0 < 0.14) continue;
    if (quiet.some((q) => q.x1 > a.v + 1e-5 && q.x0 < b.v - 1e-5 && q.y1 > c.v + 1e-5 && q.y0 < d.v - 1e-5)) continue;
    const off = Math.hypot(Math.max(x0 - F.x, 0, F.x - x1), Math.max(y0 - F.y, 0, F.y - y1));   // 0 when it holds the focus
    const score = (x1 - x0) * (y1 - y0) - 3 * off;
    if (!best || score > best.score) best = { score, sides: [a, c, b, d], clip: [x0, y0, x1, y1] };
  }
  if (!best) best = { sides: [{ v: sx * 0.42, q: { i: 0 } }, { v: -BLEED, q: null }, { v: sx + BLEED, q: null }, { v: sy + BLEED, q: null }], clip: [sx * 0.42, 0, sx, sy] };
  // sides in the order x0, y0, x1, y1; `axis` 0 = x, 1 = y; `sign` points into the pane
  const SIDE = [{ axis: 0, sign: 1 }, { axis: 1, sign: 1 }, { axis: 0, sign: -1 }, { axis: 1, sign: -1 }];
  // The side that faces the copy: the one stopped by the headline block, else by the details, else by a strip.
  const rank = (s) => (s.q ? (s.q.i === 0 ? 0 : s.q.strip ? 2 : 1) : 9);
  let pk = 0; best.sides.forEach((s, i) => { if (rank(s) < rank(best.sides[pk])) pk = i; });
  if (rank(best.sides[pk]) === 9) { pk = 0; best.sides[0] = { v: sx * 0.38, q: { i: 0 } }; best.clip[0] = sx * 0.38; }   // no copy at all: a pane over the right-hand part
  const pull = SIDE[pk], free = best.sides[pk].v;
  const far = best.clip[(pk + 2) % 4], Ln = Math.abs(far - free);                         // room from the copy side to the far side
  const t0 = best.clip[pull.axis === 0 ? 1 : 0], t1 = best.clip[pull.axis === 0 ? 3 : 2], Lt = t1 - t0;   // room along the edge
  const Ft = pull.axis === 0 ? F.y : F.x;
  const above = pull.axis === 1 && pull.sign === -1;                                       // the pane hangs above the copy

  // The forms are measured in R, the radius of the hero. `cz` is how far they reach out of the pane towards
  // the copy, `deep` how far into it, `span` how much room they want along the edge (all in R): R is the
  // largest that fits, and the edge is drawn back from the copy by that clear zone plus a margin.
  const MARGIN = 0.035;
  const G = P.motif === 'dusk' ? (pull.axis === 0 ? { cz: 0.7, deep: 1.9, span: 3.5 } : above ? { cz: 1.0, deep: 1.95, span: 2.6 } : { cz: 0.7, deep: 2.2, span: 2.6 })
    : P.motif === 'bloom' ? { cz: 0.9, deep: 2.1, span: 2.95 }
      : { cz: 0.7, deep: 1.68, span: 2.3 };
  const R = Math.max(0.05, Math.min((Ln - MARGIN) / (G.cz + G.deep), Lt / G.span));
  const edge = snap(free + pull.sign * (MARGIN + G.cz * R));
  const pane = best.sides.map((s) => snap(s.v)); pane[pk] = edge;
  const cut = best.sides.map((s) => (s.q ? 1 : 0)); cut[pk] = 1;                           // 1 = an edge of the sheet that is seen on the page
  const at = (n, t) => (pull.axis === 0 ? [edge + pull.sign * n, t] : [t, edge + pull.sign * n]);   // n = depth into the pane, t = along the edge
  const tC = clamp(Ft, t0 + 0.5 * G.span * R, Math.max(t0 + 0.5 * G.span * R, t1 - 0.5 * G.span * R));

  // ---- the picture behind the glass: soft discs and ellipses, laid over the page back to front.
  // centre, radii, turn, softness of the rim (0.1 crisp … 1 all blur), opacity; colours a → b along a linear
  // gradient `g` or from the core outwards (`radial`); `lobes` gives a bloom a hint of petals; `glass` = seen
  // only through the pane (a wash of light on the glass, not a thing in the room); `ridge` = [height, softness,
  // roll (all in units of ry), wave number per su] of a rolling upper edge inside the ellipse (the bands of the horizon).
  const shapes = [];
  const shape = (o) => shapes.push({ rx: o.r, ry: o.r, rot: 0, soft: 0.3, op: 1, b: o.a, g: [0, 1], radial: 0, lobes: 0, ph: 0, glass: 0, ridge: [0, 0, 0, 0], ...o });
  const gdir = (ang) => [Math.sin(ang), Math.cos(ang)];                                   // a gradient running "down", turned by ang

  if (P.motif === 'dusk') {
    // A horizon: a low sun and, rising over its lower rim, three long bands of colour like far ridges in haze.
    // Each band is a long lens-shaped ellipse (so it tapers out at its ends) with a gently rolling, fairly
    // crisp upper edge, and melts downwards into the next. The lens only bends the picture across the ribs,
    // so it is the slope of those rolling edges that the ribs step into slices. The sun stands astride the
    // pulled edge; when the pane hangs above the copy it is the band stack that crosses the edge instead.
    const s = pull.sign, s2 = rng.sign();
    let cx, cy;
    if (pull.axis === 0) { cx = edge + s * 0.3 * R; cy = clamp(0.5 * (t0 + t1) - 0.3 * R, t0 + 1.2 * R, Math.max(t0 + 1.2 * R, t1 - 1.8 * R)); }
    else { cx = tC; cy = above ? edge - 0.85 * R : edge + 0.3 * R; }
    shape({ x: cx + (pull.axis === 0 ? s * 0.9 * R : 0), y: cy - 0.25 * R, r: 1, rx: 2.2 * R, ry: 1.3 * R, soft: 1, op: dark ? 0.22 : 0.4, a: dark ? mixL(c0, c1, 0.5) : mixL(c3, c0, 0.3), glass: 1 });   // light in the sky
    shape({ x: cx, y: cy, r: R, soft: 0.14, a: c0, b: c1, g: gdir(rng.range(-0.25, 0.25)) });                                                                          // the sun
    const bands = [   // dy, ry (R); colours top → bottom; beside the copy: reach into the clear zone, depth of the centre; above / below it: half width, sideways offset
      { dy: 0.78, ry: 0.42, a: mixL(c1, c2, 0.45), b: c2, reach: 0.9, depth: 1.2, half: 2.3, off: 0.35 },
      { dy: 1.12, ry: 0.4, a: c2, b: mixL(c2, bg, 0.3), reach: 0.5, depth: 0.9, half: 1.9, off: -0.45 },
      { dy: 1.44, ry: 0.34, a: mixL(c2, bg, 0.4), b: mixL(c2, bg, 0.7), reach: 0.75, depth: 1.5, half: 1.5, off: 0.25 },
    ];
    for (const b of bands) {
      const o = { r: 1, ry: b.ry * R, soft: 0.5, op: 0.96, a: b.a, b: b.b, ridge: [-0.42, 0.016 / (b.ry * R), rng.range(0.1, 0.16), 6.2832 / rng.range(0.4, 0.62)], ph: rng() * 6.283 };
      if (pull.axis === 0) shape({ ...o, x: edge + s * b.depth * R, y: cy + b.dy * R, rx: ((b.depth + b.reach * 0.66) * R) / 1.3 });   // its tip stops short of the copy
      else shape({ ...o, x: cx + s2 * b.off * R, y: cy + b.dy * R, rx: Math.min(b.half * R, (0.44 * Lt * b.half) / 2.3) });
    }
  } else if (P.motif === 'bloom') {
    // Out-of-focus flowers: one large bloom astride the edge, two more behind the glass overlapping it, and a
    // bud in the clear. Each is saturated at its core and pales towards the rim; the large ones carry a small
    // centre of another colour, which the ribs break into a row of bright slivers.
    const s = rng.sign();
    const bloom = (n, t, r, core, rim, dot, petal = 0.16, op = 0.94) => {
      const [x, y] = at(n, tC + t);
      shape({ x, y, r, rx: r, ry: r * rng.range(0.9, 1), rot: rng() * 3.14, radial: 1, soft: 0.36, lobes: petal, ph: rng() * 6.283, a: core, b: rim, op });
      if (dot) shape({ x: x + rng.range(-0.06, 0.06) * r, y: y + rng.range(-0.06, 0.06) * r, r: 0.2 * r, soft: 0.45, a: dot, op: 0.94 });
    };
    bloom(0.95 * R, -s * 0.75 * R, 0.6 * R, c2, mixL(c2, c3, 0.35), c0);
    bloom(1.15 * R, s * 0.45 * R, 0.74 * R, c1, mixL(c1, c3, 0.3), c2);
    bloom(0.3 * R, -s * 0.12 * R, R, c0, mixL(c0, c3, 0.35), c1);
    bloom(-0.36 * R, s * 0.95 * R, 0.26 * R, mixL(c2, c0, 0.2), mixL(c2, c3, 0.35), null, 0, 0.92);
  } else {
    // One large disc astride the edge in a gentle two-colour gradient, a faint wash of light deep behind the
    // glass, and one small disc wholly behind it.
    const [cx, cy] = at(0.3 * R, tC), r2 = 0.2 * R, d2 = 1.2 * R + r2, s0 = rng.sign();
    let small = null;
    for (const a of [0.8, 1.05, 0.55, 1.3].flatMap((v) => [s0 * v, -s0 * v])) {
      const [x, y] = at(0.3 * R + Math.cos(a) * d2, tC + Math.sin(a) * d2);
      // wholly behind the glass; it may run off the page a little where the pane itself bleeds
      const inside = x - 1.6 * r2 > pane[0] && x + 1.6 * r2 < pane[2] && y - 1.6 * r2 > pane[1] && y + 1.6 * r2 < pane[3]
        && x - 0.7 * r2 > 0 && x + 0.7 * r2 < sx && y - 0.7 * r2 > 0 && y + 0.7 * r2 < sy;
      if (inside) { small = { x, y, a }; break; }
    }
    const [wx, wy] = at(0.92 * Math.abs(far - edge), tC - Math.sign(small?.a ?? s0) * 0.3 * Lt);
    shape({ x: wx, y: wy, r: 0.6 * Math.abs(far - edge) + 0.1, soft: 1, op: dark ? 0.26 : 0.42, a: dark ? mixL(c1, c2, 0.5) : mixL(c3, c1, 0.25), glass: 1 });
    shape({ x: cx, y: cy, r: R, soft: 0.1, a: c0, b: c1, g: gdir(rng.range(-0.5, 0.5)) });
    if (small) shape({ x: small.x, y: small.y, r: r2, soft: 0.26, a: c2, b: mixL(c2, c1, 0.5), g: gdir(rng.range(-0.5, 0.5)) });
  }
  const count = Math.min(shapes.length, NS);
  while (shapes.length < NS) shapes.push({ x: 99, y: 99, rx: 1, ry: 1, rot: 0, soft: 1, op: 0, a: bg, b: bg, g: [0, 1], radial: 0, lobes: 0, ph: 0, glass: 0, ridge: [0, 0, 0, 0] });

  // ---- the ribs. Their width is a whole number of pixels and they start on a pixel boundary, so every rib is
  // rasterised alike (no beat between the reeding and the pixel grid); a joint lies on the pane's edge when the
  // two run the same way.
  const ribPx = Math.max(6, Math.round(1.6 * unit * P.ribs)), ribW = ribPx / short;
  const acrossAxis = P.horizontal ? 1 : 0;
  const ribO = pull.axis === acrossAxis ? edge : snap(acrossAxis === 0 ? F.x : F.y);
  const linePx = Math.max(1, Math.round(0.09 * unit));                                      // the hairline on the pane's edge
  // the light stands up and to the left: a broad soft source whose reflection is strongest about a third of the way along the ribs
  const alongLo = Math.max(pane[acrossAxis === 0 ? 1 : 0], 0), alongHi = Math.min(pane[acrossAxis === 0 ? 3 : 2], acrossAxis === 0 ? sy : sx);

  const V4 = (...a) => new THREE.Vector4(...a), V2 = (...a) => new THREE.Vector2(...a);
  scene.add(backgroundQuad(/* glsl */`
    #define NS ${NS}
    #define TAPS ${TAPS}
    varying vec2 vUv;
    uniform vec2 uAsp, uAcross, uAlong, uShOff, uSheenAt;
    uniform vec3 uBg, uSa[NS], uSb[NS];
    uniform vec4 uS[NS], uSr[NS], uSg[NS], uSx[NS], uSy[NS], uPane, uCut;
    uniform float uPx, uRibW, uRibO, uLens, uFringe, uSheen, uDark, uGlass, uLine, uSeed;
    uniform int uCount;
    ${GLSL_QUIET}
    ${GLSL_OKLAB}
    float ease(float a, float b, float x){ float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }
    // 0..1 per rib (integer hash: the same on every GPU)
    float ribHash(float id){ uint h = uint(int(id) + 65536) * 747796405u + uint(uSeed); h = ((h >> ((h >> 28u) + 4u)) ^ h) * 277803737u; return float((h >> 22u) ^ h) * (1.0 / 4294967295.0); }
    // The picture behind the glass, in OKLab: soft discs and ellipses laid over the page colour, back to front.
    // through = 1 when it is looked at through the pane (the washes of light on the glass are then included).
    vec3 field(vec2 p, float through){
      vec3 lab = uBg;
      for (int i = 0; i < NS; i++) {
        if (i >= uCount) break;
        vec4 s = uS[i], r = uSr[i], g = uSg[i], x = uSx[i], y = uSy[i];
        vec2 d = p - s.xy; d = vec2(d.x * r.x + d.y * r.y, d.y * r.x - d.x * r.y) / s.zw;
        float rr = length(d);
        if (rr > 1.0 + 0.6 * r.z) continue;                                                   // outside its soft rim
        if (x.y > 0.0) rr /= 1.0 - x.y * (1.0 - pow(abs(cos(2.5 * atan(d.y, d.x) + x.z)), 0.6));   // a bloom: five petals, notched between
        float a = r.w * (1.0 - ease(1.0 - r.z, 1.0 + 0.6 * r.z, rr)) * mix(1.0 - x.x, 1.0, through);
        if (y.y > 0.0) a *= ease(-y.y, y.y, d.y - y.x - y.z * (sin(y.w * d.x * s.z + x.z) + 0.45 * sin(2.6 * y.w * d.x * s.z + 2.1 * x.z)));   // a band: its rolling upper edge
        float t = g.z > 0.5 ? smoothstep(0.3, 1.0, rr) : clamp(0.5 + 0.5 * dot(d, g.xy), 0.0, 1.0);
        lab = mix(lab, mix(uSa[i], uSb[i], t * t * (3.0 - 2.0 * t)), a);
      }
      return lab;
    }
    // signed distance to the pane (su): negative inside
    float boxDist(vec2 p){ vec2 q = max(uPane.xy - p, p - uPane.zw); return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0); }

    void main(){
      vec2 fr = vec2(vUv.x, 1.0 - vUv.y), p = fr * uAsp;
      // seen directly: the picture, fading into the page wherever type sits
      vec3 col = oklabToLinear(mix(uBg, field(p, 0.0), 1.0 - quietMask(fr, 0.05)));

      float dBox = boxDist(p);
      if (dBox <= 0.0) {
        // seen through the glass
        vec3 acc = vec3(0.0);
        float along = dot(p, uAlong);
        float sheen = uSheen * (0.4 + 0.6 * exp(-pow((along - uSheenAt.x) / uSheenAt.y, 2.0)));
        for (int j = 0; j < TAPS; j++) {
          // several taps across the pixel: the rib profile has hairlines in it and must not alias
          float x = dot(p, uAcross) + ((float(j) + 0.5) / float(TAPS) - 0.5) * uPx;
          float s = (x - uRibO) / uRibW, id = floor(s), u = 2.0 * (s - id) - 1.0, au = abs(u);   // u: -1 … 1 across the rib
          float xc = uRibO + (id + 0.5) * uRibW;
          // the lens: mirrored, stronger towards the joints, a touch different from rib to rib; red and blue
          // bend a few percent apart
          float bend = -uLens * (0.9 + 0.2 * ribHash(id)) * u * (1.0 + 0.8 * u * u) * 0.5 * uRibW;
          vec2 base = p + (xc - dot(p, uAcross)) * uAcross;
          vec3 ca = oklabToLinear(field(base + bend * (1.0 + uFringe) * uAcross, 1.0));
          vec3 cb = oklabToLinear(field(base + bend * (1.0 - uFringe) * uAcross, 1.0));
          vec3 c = vec3(ca.r, 0.5 * (ca.g + cb.g), cb.b);
          // the glass itself: dimmer towards the joints, a little brighter on the side that faces the light,
          // a hairline dark joint, and a thin specular line (with a broad faint one opposite) that lifts the
          // colour behind it towards white rather than painting a white stripe over it
          c *= 1.0 - uGlass * 0.13 * au * au * au;
          c *= 1.0 - uGlass * 0.045 * u;
          c *= 1.0 - uGlass * 0.3 * smoothstep(0.86, 1.0, au);
          float sp = exp(-pow((u + 0.72) / 0.075, 2.0)) + 0.2 * exp(-pow((u - 0.55) / 0.16, 2.0));
          c = mix(c, mix(c + (1.0 - c) * 0.6, vec3(0.085) + 1.6 * c, uDark), clamp(uGlass * sheen * sp * 0.75, 0.0, 1.0));
          acc += c;
        }
        col = acc / float(TAPS);
        col = mix(col, col * 0.985 + uDark * 0.004, uGlass);                                 // the body of the glass
        // the edge of the sheet: a hairline of light for its thickness, brighter on the sides that face the light
        float lit = (uPane.x - p.x > dBox - 1e-5 && uCut.x > 0.5) || (uPane.y - p.y > dBox - 1e-5 && uCut.y > 0.5) ? 1.0 : 0.45;
        float hair = step(-uLine * uPx, dBox);
        col = mix(col, mix(vec3(1.0), col + 0.28, uDark), hair * lit * 0.7);
      } else {
        // the faintest shadow beside it, thrown away from the light
        float dS = boxDist(p - uShOff);
        col *= 1.0 - mix(0.035, 0.25, uDark) * (1.0 - smoothstep(-0.004, 0.016, dS));
      }
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }`, {
    uAsp: { value: V2(sx, sy) }, uPx: { value: 1 / short }, uBg: { value: bg }, uSeed: { value: Math.floor(rng() * 65536) }, uCount: { value: count },
    uS: { value: shapes.map((s) => V4(s.x, s.y, s.rx, s.ry)) }, uSr: { value: shapes.map((s) => V4(Math.cos(s.rot), Math.sin(s.rot), s.soft, s.op)) },
    uSg: { value: shapes.map((s) => V4(s.g[0], s.g[1], s.radial, 0)) }, uSx: { value: shapes.map((s) => V4(s.glass, s.lobes, s.ph, 0)) }, uSy: { value: shapes.map((s) => V4(...s.ridge)) },
    uSa: { value: shapes.map((s) => s.a) }, uSb: { value: shapes.map((s) => s.b) },
    uPane: { value: V4(...pane) }, uCut: { value: V4(...cut) }, uLine: { value: linePx },
    uAcross: { value: acrossAxis === 0 ? V2(1, 0) : V2(0, 1) }, uAlong: { value: acrossAxis === 0 ? V2(0, 1) : V2(1, 0) },
    uRibW: { value: ribW }, uRibO: { value: ribO }, uLens: { value: 5 * P.lens }, uFringe: { value: 0.05 * P.fringe }, uSheen: { value: P.sheen },
    uSheenAt: { value: V2(alongLo + 0.3 * (alongHi - alongLo), 0.5 * (alongHi - alongLo)) },
    uDark: { value: dark ? 1 : 0 }, uGlass: { value: glass }, uShOff: { value: V2(0.006, 0.009) },
    ...quietUniforms(ctx),
  }));

  ctx.frame({ radius: 1, fov: 30, dir: [0, 0, 1] });   // nothing three-dimensional to place: the picture is composed in frame space

  // ---- finish: fine grain (about ±2%, less in the darks), then the anti-banding dither
  const grain = {
    uniforms: { tDiffuse: { value: null }, uAmt: { value: 0.02 * P.grain }, uCell: { value: Math.max(1, Math.round(unit / 12)) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`uniform sampler2D tDiffuse; uniform float uAmt, uCell; varying vec2 vUv;
      float gh(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
      void main(){ vec4 t = texture2D(tDiffuse, vUv); vec2 g = floor(gl_FragCoord.xy / uCell);
        float l = dot(t.rgb, vec3(0.3, 0.6, 0.1));
        gl_FragColor = vec4(clamp(t.rgb + (gh(g) + gh(g + 71.37) - 1.0) * uAmt * (0.4 + 0.6 * sqrt(clamp(l, 0.0, 1.0))), 0.0, 1.0), t.a); }`,
  };
  return makeComposer(ctx, { samples: 0, display: [grain, finishPassShader(ctx, { vignette: 0, dither: true })] });
}
