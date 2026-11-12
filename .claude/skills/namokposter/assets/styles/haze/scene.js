// Gradient Haze — no object, only light: a few large, soft orbs of palette colour gathered around the focus
// and melting into the flat background, with one or two hairline accents (circle, arc, grid) for structure.
// A backdrop for type-led posters, so it is smooth (analytic gaussians, colour mixed in OKLab, dithered to
// 8 bit — no noise, no grain of its own) and it steps back to mostly background wherever copy sits: the orbs
// are placed clear of the quiet rectangles, and inside them the field is held to a fifth of its strength.
// params: strength, spread, accent (rings | grid | circle | both | none), line — see style.json.
import { backgroundQuad, quietUniforms } from '/skill/assets/web/scene-lib.js';

const TAU = Math.PI * 2;

export default function build(ctx) {
  const { THREE, scene, rng, palette, params, unit, width: W, height: H, aspect, focus, artSize } = ctx;
  const cols = palette.colors?.length ? palette.colors : [palette.accent];
  const C = (i) => new THREE.Color(cols[i % cols.length]);
  const bgc = new THREE.Color(palette.bg), dark = bgc.getHSL({}).l < 0.35;
  const P = { strength: params.strength ?? 1, spread: params.spread ?? 1, accent: String(params.accent ?? 'rings'), line: params.line ?? 1 };

  // ---- orbs. Positions are in short-side units around the focus, scaled by the size of the art area (S):
  // one large anchor close to the focus, the others fanned around it at growing distance and shrinking size.
  const S = artSize * P.spread, a0 = rng() * TAU, turn = rng.sign() * rng.range(1.9, 2.6);
  const plan = [   // distance, radius, weight, palette colour
    [rng.range(0.03, 0.1), rng.range(0.3, 0.36), 1.0, 0],
    [rng.range(0.26, 0.33), rng.range(0.23, 0.28), 0.95, 1],
    [rng.range(0.3, 0.38), rng.range(0.2, 0.25), 0.9, 2],
    [rng.range(0.4, 0.48), rng.range(0.16, 0.2), 0.8, 3],
    [rng.range(0.16, 0.24), rng.range(0.09, 0.12), 0.75, 1],
    [rng.range(0.46, 0.56), rng.range(0.13, 0.17), 0.6, 0],
  ];
  // Each orb looks for room: of a handful of seeded spots near its planned one it takes the spot that keeps it
  // clear of the rectangles that carry type (so it fades by its own softness instead of being cut off by the
  // quiet mask), inside the frame, and apart from the orbs already placed.
  const asp = [Math.max(aspect, 1), Math.max(1 / aspect, 1)];
  const rects = (ctx.quiet || []).slice(0, 4).map(([x0, y0, x1, y1]) => [(x0 - focus.x) * asp[0], (y0 - focus.y) * asp[1], (x1 - focus.x) * asp[0], (y1 - focus.y) * asp[1]]);
  const clearance = (x, y) => Math.min(1e3, ...rects.map(([x0, y0, x1, y1]) => Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(y0 - y, 0, y - y1))));
  const edge = [(0 - focus.x) * asp[0], (0 - focus.y) * asp[1], (1 - focus.x) * asp[0], (1 - focus.y) * asp[1]];   // the frame, same units
  const orb = [], orbRot = [], orbCol = [];
  plan.forEach(([d, r, w, c], i) => {
    const nominal = a0 + i * turn; let best = null;
    for (let k = 0; k < 70; k++) {
      const wide = k / 70, a = nominal + rng.range(-1, 1) * (0.3 + 2.8 * wide), dd = d * S * (1 + rng.range(-0.3, 1.6) * wide) + rng.range(0, 0.3) * wide;
      const x = Math.cos(a) * dd, y = Math.sin(a) * dd * 0.86;
      const out = Math.max(edge[0] - x, x - edge[2], edge[1] - y, y - edge[3], 0);
      let score = Math.min(1, clearance(x, y) / (1.8 * r * S)) - 0.45 * Math.abs(dd - d * S) - 1.5 * Math.max(0, out - 0.25 * r * S);
      for (const o of orb) score -= 0.32 * Math.exp(-((o.x - x) ** 2 + (o.y - y) ** 2) / (2 * (0.24 * S) ** 2));
      if (!best || score > best.score) best = { x, y, score };
    }
    const squash = rng.range(0.72, 1), rot = rng() * Math.PI;
    orb.push(new THREE.Vector4(best.x, best.y, r * S, r * S * squash));
    orbRot.push(new THREE.Vector3(Math.cos(rot), Math.sin(rot), w)); orbCol.push(C(c));
  });

  // ---- hairlines (all lengths in short-side units; widths in px)
  const ringC = new THREE.Vector2(rng.range(-0.05, 0.05) * S, rng.range(-0.05, 0.05) * S), ringR = rng.range(0.33, 0.39) * S;
  const arcMid = a0 + Math.PI * rng.range(0.55, 0.95) * rng.sign(), arcHalf = rng.range(0.55, 1.0), arcR = ringR * rng.range(1.28, 1.42);
  const dotA = arcMid + Math.PI + rng.range(-0.8, 0.8);
  const gridA = a0 + rng.range(2.2, 3.6), gridC = new THREE.Vector2(Math.cos(gridA) * 0.47 * S, Math.sin(gridA) * 0.4 * S);
  const want = { rings: [1, 1, 0], grid: [1, 0, 1], both: [1, 1, 1], circle: [1, 0, 0], none: [0, 0, 0] }[P.accent] ?? [1, 1, 0];

  scene.add(backgroundQuad(/* glsl */`
    varying vec2 vUv;
    uniform vec3 bg, ink, uOrbC[6], uOrbR[6]; uniform vec4 uOrb[6], uQuiet[4]; uniform vec2 focus, uAsp, ringC, gridC, warpP;
    uniform float uShort, strength, dark, ringR, arcR, arcMid, arcHalf, dotA, lw, cell, S; uniform vec3 want;

    vec3 toLab(vec3 c){ vec3 l = mat3(0.4122214708, 0.2119034982, 0.0883024619, 0.5363325363, 0.6806995451, 0.2817188376, 0.0514459929, 0.1073969566, 0.6299787005) * c;
      l = pow(max(l, 0.0), vec3(1.0 / 3.0));
      return mat3(0.2104542553, 1.9779984951, 0.0259040371, 0.7936177850, -2.4285922050, 0.7827717662, -0.0040720468, 0.4505937099, -0.8086757660) * l; }
    vec3 fromLab(vec3 c){ vec3 l = mat3(1.0, 1.0, 1.0, 0.3963377774, -0.1055613458, -0.0894841775, 0.2158037573, -0.0638541728, -1.2914855480) * c;
      l = l * l * l;
      return mat3(4.0767416621, -1.2684380046, -0.0041960863, -3.3077115913, 2.6097574011, -0.7034186147, 0.2309699292, -0.3413193965, 1.7076147010) * l; }
    vec3 hash3(vec2 p){ vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yxz + 33.33); return fract((q.xxy + q.yzz) * q.zyx); }
    // 1 inside any rectangle that carries type, dying away outside it as a gaussian of the distance — no end
    // point, so no visible edge. 'soft' (short-side units) is its reach around the copy block (rectangle 0),
    // 'edge' around the other blocks and the footer/header strips; 'sway' lets that reach breathe along the
    // rectangle's sides so the calm zone does not print the rectangle's straight edges into the colour.
    float quiet(vec2 p, float soft, float edge, float sway){
      vec2 s = (p - focus) * uAsp;
      float reach = 1.0 + sway * (0.6 * sin(s.x * 4.3 + warpP.x) + 0.4 * sin(s.y * 5.7 + warpP.y));
      float q = 0.0;
      for (int i = 0; i < 4; i++) {
        vec4 r = uQuiet[i]; vec2 c = (r.xy + r.zw) * 0.5, h = (r.zw - r.xy) * 0.5;
        vec2 e = abs(p - c) * uAsp - h * uAsp + 0.03;
        float d = max(length(max(e, 0.0)) - 0.03, 0.0) / ((i == 0 ? soft : edge) * reach);
        q = max(q, exp(-d * d));
      }
      return q;
    }
    float stroke(float d, float px){ return 1.0 - smoothstep(lw * 0.5 - 0.6, lw * 0.5 + 0.6, abs(d) * px); }   // d in short-side units → soft-edged hairline

    void main(){
      vec2 p = vec2(vUv.x, 1.0 - vUv.y);
      vec2 q = (p - focus) * uAsp;                                   // short-side units, centred on the focus
      // a slow bend so the orbs are not perfect ellipses (two low-frequency sines: no noise, nothing to blotch)
      vec2 w = q + 0.05 * S * vec2(sin(q.y * 2.6 / S + warpP.x) + 0.5 * sin(q.x * 1.7 / S + warpP.y), sin(q.x * 2.2 / S + warpP.y) + 0.5 * sin(q.y * 1.9 / S + warpP.x));
      float sum = 0.0; vec3 lab = vec3(0.0);
      for (int i = 0; i < 6; i++) {
        vec2 d = w - uOrb[i].xy; d = vec2(d.x * uOrbR[i].x + d.y * uOrbR[i].y, d.y * uOrbR[i].x - d.x * uOrbR[i].y) / uOrb[i].zw;
        float g = uOrbR[i].z * exp(-0.5 * dot(d, d));
        sum += g; lab += g * toLab(uOrbC[i]);
      }
      lab /= max(sum, 1e-5);
      float m = clamp((1.0 - exp(-1.5 * sum)) * strength, 0.0, 1.0) * mix(0.88, 0.78, dark);
      m *= mix(1.0, 0.2, quiet(p, 0.2, 0.09, 0.4));                      // where copy sits the picture is at least three-quarters background
      vec3 col = fromLab(mix(toLab(bg), lab, m));

      // hairlines
      float px = uShort, a = 0.0;
      vec2 r = q - ringC; float rl = length(r), ang = atan(r.y, r.x);
      a = max(a, want.x * 0.55 * stroke(rl - ringR, px));
      float da = abs(mod(ang - arcMid + 3.14159265, 6.2831853) - 3.14159265);
      float arcFade = 1.0 - smoothstep(arcHalf * 0.55, arcHalf, da);
      a = max(a, want.y * 0.5 * arcFade * stroke(rl - arcR, px));
      vec2 dp = r - ringR * vec2(cos(dotA), sin(dotA));
      a = max(a, want.x * 0.9 * (1.0 - smoothstep(lw * 1.7 - 0.6, lw * 1.7 + 0.6, length(dp) * px)));
      vec2 gq = q - gridC, gc = abs(fract(gq / cell + 0.5) - 0.5) * cell;
      float gridFade = 1.0 - smoothstep(0.04 * S, 0.24 * S, length(gq));
      a = max(a, want.z * 0.34 * gridFade * max(stroke(gc.x, px), stroke(gc.y, px)));
      a *= 1.0 - quiet(p, 0.045, 0.03, 0.0);                                // lines stop short of the copy
      col = mix(col, ink, a);

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
      #include <colorspace_fragment>
      gl_FragColor.rgb += (hash3(gl_FragCoord.xy) + hash3(gl_FragCoord.xy + 59.3) - 1.0) / 255.0;   // ±1 LSB dither: keeps the 8-bit file free of banding (not grain)
    }`, {
    bg: { value: bgc }, ink: { value: new THREE.Color(palette.ink) }, uOrb: { value: orb }, uOrbR: { value: orbRot }, uOrbC: { value: orbCol },
    focus: { value: new THREE.Vector2(focus.x, focus.y) }, uAsp: { value: new THREE.Vector2(Math.max(aspect, 1), Math.max(1 / aspect, 1)) },
    uShort: { value: Math.min(W, H) }, strength: { value: P.strength }, dark: { value: dark ? 1 : 0 }, S: { value: S },
    ringC: { value: ringC }, ringR: { value: ringR }, arcR: { value: arcR }, arcMid: { value: arcMid }, arcHalf: { value: arcHalf }, dotA: { value: dotA },
    gridC: { value: gridC }, cell: { value: 0.052 * S }, lw: { value: Math.max(0.7, unit * 0.11 * P.line) }, want: { value: new THREE.Vector3(...want) },
    warpP: { value: new THREE.Vector2(rng() * TAU, rng() * TAU) }, ...quietUniforms(ctx),
  }));

  ctx.frame({ radius: 1, fov: 30, dir: [0, 0, 1] });   // nothing three-dimensional to place; kept so the scene obeys the same contract as the others
}
