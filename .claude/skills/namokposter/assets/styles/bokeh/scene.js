// Bokeh — a photograph of lights thrown far out of focus. Every light is one disc drawn by a small
// lens model: an even body with a slightly brighter rim (over-corrected spherical aberration), a
// thin colour fringe on the edge, faint onion rings and dust, and mechanical vignetting that
// squeezes the discs into cat's eyes towards the corners of the frame. Discs add up in HDR, are
// bloomed a little and finished with grain. What the picture "shows" is only hinted at by how the
// lights are arranged (params.motif):
//   city     a street at night — two rows of lamps running to a vanishing point, head- and tail-lights,
//            signals, window grids
//   string   festive garlands — sagging strings of evenly spaced bulbs at several depths
//   lantern  a stream of warm lanterns rising and shrinking into the distance
//   glitter  abstract — a diagonal drift of mixed discs
// The lights gather round the layout focus and thin out and dim under the copy.
//
// Palette: bg = the night behind the copy · colors[0] = main light colour · colors[1] = second light
//          colors[2] = sparse cool / contrasting lights · colors[3] = pale highlights · accent = horizon glow
// A light `bg` switches to a daylight version: translucent pastel discs with pale rims.
import { backgroundQuad, quietUniforms, GLSL_QUIET, GLSL_NOISE_KIT, makeComposer, finishPassShader, hdrClipPassShader } from '/skill/assets/web/scene-lib.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export default function build(ctx) {
  const { THREE, scene, palette, params, aspect, rng, unit, width: W, height: H } = ctx;
  const sx = Math.max(aspect, 1), sy = Math.max(1 / aspect, 1);            // frame fraction → short-side units
  const P = {
    motif: String(params.motif ?? 'city'), density: clamp(params.density ?? 1, 0.3, 2.5), size: clamp(params.size ?? 1, 0.4, 2),
    rim: clamp(params.rim ?? 1, 0, 2.5), cateye: clamp(params.cateye ?? 1, 0, 2), blades: Math.round(params.blades ?? 0), glow: clamp(params.glow ?? 1, 0, 2),
    grain: clamp(params.grain ?? 1, 0, 2.5),
  };
  const cols = palette.colors?.length ? palette.colors : [palette.accent];
  const C = (i) => new THREE.Color(cols[i % cols.length]);
  const bgc = new THREE.Color(palette.bg), light = bgc.getHSL({}).l > 0.6;
  const accent = new THREE.Color(palette.accentOriginal ?? palette.accent);

  // ---- where the copy sits (short-side units)
  const quiet = (ctx.quiet || []).map(([x0, y0, x1, y1]) => [x0 * sx, y0 * sy, x1 * sx, y1 * sy]);
  const copy = quiet[0] ?? [9, 9, 9, 9];
  const rectDist = (r, x, y) => { const ex = Math.max(r[0] - x, x - r[2]), ey = Math.max(r[1] - y, y - r[3]); return Math.hypot(Math.max(ex, 0), Math.max(ey, 0)) + Math.min(Math.max(ex, ey), 0); };
  const copyDist = (x, y) => Math.min(...quiet.slice(0, 2).map((r) => rectDist(r, x, y)), 9);
  const stripDist = (x, y) => Math.min(...quiet.slice(2).map((r) => rectDist(r, x, y)), 9);

  const F = { x: ctx.focus.x * sx, y: ctx.focus.y * sy }, S = clamp(ctx.artSize ?? 0.7, 0.3, 1.1);
  const copyC = { x: (copy[0] + copy[2]) / 2, y: (copy[1] + copy[3]) / 2 };
  const side = F.x >= copyC.x ? 1 : -1;                                    // the lights lean away from the copy
  const stacked = Math.abs(F.x - copyC.x) < 0.12 * sx;                      // copy above / below the art rather than beside it

  // ---- the lights. x, y, r in short-side units (y down); k = brightness of the disc's body; c = colour
  const lights = [];
  const tint = (a, b, t) => a.clone().lerp(b, t);
  const jitterCol = (c, amt = 0.06) => { const o = {}; c.getHSL(o); return new THREE.Color().setHSL(o.h + rng.range(-amt, amt) * 0.25, clamp(o.s * rng.range(1 - amt, 1 + amt), 0, 1), clamp(o.l * rng.range(1 - amt, 1 + amt), 0, 1)); };
  const add = (x, y, r, c, k, soft = 0) => { lights.push({ x, y, r: r * P.size, c: jitterCol(c), k, soft, seed: rng() }); };
  const c0 = C(0), c1 = C(1), c2 = C(2), c3 = C(3), white = new THREE.Color('#fff6e8');
  const glows = [];                                                         // broad pools of light painted into the background
  const pool = (x, y, rx, ry, c, k) => glows.push({ x, y, rx, ry, c, k });
  let horizon = null;                                                       // {y, c}: a band of dusk light across the frame

  if (P.motif === 'string') {
    // Garlands: each string hangs between two anchors outside the frame; depth sets bulb size and spacing.
    const n = Math.round(clamp(5 * Math.sqrt(P.density), 3, 8));
    const top = Math.max(0.06 * sy, (quiet.find((r) => r[1] <= 0.001 && r[2] - r[0] > 0.9 * sx)?.[3] ?? 0) + 0.02);
    for (let i = 0; i < n; i++) {
      const d = Math.pow((i + rng.range(0.15, 0.85)) / n, 1.5);              // 0 = far … 1 = near
      const r = lerp(0.011, 0.074, d), gap = r * lerp(3.4, 2.5, d);
      const yMid = stacked ? lerp(F.y - 0.38 * S, F.y + 0.34 * S, rng()) : lerp(top + 0.03, sy * 0.9, (i * 0.618 + rng.range(0, 0.25)) % 1);
      const tilt = rng.range(-0.16, 0.16) * sy, sag = rng.range(0.07, 0.2) * (0.6 + d);
      const ax = -0.2 - rng.range(0, 0.3), bx = sx + 0.2 + rng.range(0, 0.3), ay = yMid - tilt - sag * 0.5, by = yMid + tilt - sag * 0.5;
      const len = Math.hypot(bx - ax, by - ay), count = Math.floor(len / gap), phase = rng();
      const every = rng.int(3, 5), kBase = lerp(1.0, 0.34, d);
      for (let j = 0; j < count; j++) {
        const t = (j + phase) / count, x = lerp(ax, bx, t) + rng.gauss() * r * 0.12, y = lerp(ay, by, t) + sag * 4 * t * (1 - t) + rng.gauss() * r * 0.12;
        const coloured = (j % every === 0), c = coloured ? (rng() < 0.55 ? c1 : c2) : tint(c0, c3, rng.range(0, 0.6));
        add(x, y, r * rng.range(0.94, 1.06), c, kBase * rng.range(0.75, 1.1) * (coloured ? 0.9 : 1));
      }
    }
    // far, small lights low in the frame: stalls and windows
    const m = Math.round(70 * P.density), yb = Math.min(sy * 0.86, (quiet.find((r) => r[3] >= sy - 0.001 && r[2] - r[0] > 0.9 * sx)?.[1] ?? sy) - 0.03);
    for (let i = 0; i < m; i++) add(rng.range(-0.05, sx + 0.05), yb - Math.abs(rng.gauss()) * 0.09 * sy, rng.range(0.005, 0.014), rng() < 0.7 ? tint(c0, c3, rng()) : rng() < 0.5 ? c1 : c2, rng.range(0.25, 0.9));
    horizon = { y: yb + 0.03, c: tint(accent, c0, 0.5), k: 0.07, h: 0.2 * sy };
    pool(F.x, F.y, 0.75 * S, 0.5 * S, tint(c0, c1, 0.3), 0.025);
  } else if (P.motif === 'lantern') {
    // Lanterns released from the lower art side drift up and away, shrinking with distance.
    const n = Math.round(82 * P.density), dir = stacked ? (rng() < 0.5 ? -1 : 1) : side;
    const p0 = { x: F.x - dir * 0.05 * S, y: Math.min(sy * 0.97, F.y + 0.5 * S) }, p2 = { x: F.x + dir * (stacked ? 0.42 : 0.3) * sx * 0.6, y: Math.max(sy * 0.05, F.y - 0.62 * S) };
    const p1 = { x: lerp(p0.x, p2.x, 0.2) - dir * 0.1 * S, y: lerp(p0.y, p2.y, 0.62) };
    for (let i = 0; i < n; i++) {
      const t = Math.pow(rng(), 0.72), u = 1 - t;                           // 0 = near (large, low) … 1 = far (small, high)
      const bx = u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, by = u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y;
      const spread = lerp(0.36, 0.07, Math.pow(t, 0.7)) * S;
      const r = 0.006 + 0.078 * Math.pow(u, 1.9) * rng.range(0.7, 1.15);
      const c = rng() < 0.12 ? tint(c2, c0, 0.3) : tint(tint(c0, c1, rng.range(0, 0.75)), c3, rng() < 0.25 ? rng.range(0.3, 0.7) : 0);
      add(bx + rng.gauss() * spread * 0.7, by + rng.gauss() * spread * 0.55, r, c, lerp(0.2, 1.1, Math.pow(t, 0.75)) * rng.range(0.6, 1.1));
    }
    // a few very large, faint foreground flames
    for (let i = 0; i < 5; i++) add(p0.x + rng.range(-0.5, 0.5) * S, p0.y + rng.range(-0.08, 0.2) * S, rng.range(0.1, 0.16), tint(c0, c1, rng()), rng.range(0.1, 0.18));
    pool(lerp(p0.x, p2.x, 0.3), lerp(p0.y, p2.y, 0.25), 0.6 * S, 0.5 * S, tint(c0, c1, 0.5), 0.05);
    pool(p2.x, p2.y, 0.3 * S, 0.3 * S, c0, 0.02);
    horizon = { y: sy * 1.02, c: tint(accent, c1, 0.5), k: 0.07, h: 0.3 * sy };
  } else if (P.motif === 'glitter') {
    // An abstract drift: a soft diagonal band of mixed discs through the focus, three size classes.
    const ang = (stacked ? rng.range(-0.3, 0.3) : -side * rng.range(0.5, 0.85)), ux = Math.cos(ang), uy = Math.sin(ang);
    const n = Math.round(230 * P.density);
    for (let i = 0; i < n; i++) {
      const cls = rng(), along = rng.gauss() * 0.62 * Math.max(sx, sy), across = rng.gauss() * (cls < 0.6 ? 0.13 : 0.2) * S;
      const x = F.x + ux * along - uy * across, y = F.y + uy * along + ux * across;
      const r = cls < 0.6 ? rng.range(0.006, 0.018) : cls < 0.92 ? rng.range(0.022, 0.05) : rng.range(0.07, 0.13);
      const pick = rng(), c = pick < 0.45 ? tint(c0, c3, rng.range(0, 0.5)) : pick < 0.72 ? c1 : pick < 0.9 ? c2 : c3;
      add(x, y, r, c, (cls < 0.6 ? rng.range(0.5, 1.2) : cls < 0.92 ? rng.range(0.3, 0.75) : rng.range(0.1, 0.22)) * Math.exp(-0.5 * (across / (0.22 * S)) ** 2));
    }
    pool(F.x, F.y, 0.7 * S, 0.45 * S, tint(c0, c1, 0.5), 0.04);
  } else {
    // City street: perspective rows converge on a vanishing point at the focus. The lens is focused at mid
    // distance, so the nearest lamps are the largest discs, the mid-distance ones small and crisp, and the far
    // city a band of medium discs that overlap into a creamy glow.
    const vp = { x: F.x - (stacked ? 0 : side * 0.06 * S), y: F.y + 0.07 * S }, Wd = stacked ? Math.max(0.5 * S, 0.34 * sx) : 0.5 * S, lampH = 0.4 * S, ground = 0.3 * S;
    const proj = (lx, ly, z) => ({ x: vp.x + (lx * Wd) / z, y: vp.y - (ly * lampH) / z });      // lx in street half-widths, ly in lamp heights
    const rOf = (z) => 0.0065 + 0.088 * Math.abs(1 / 2.4 - 1 / z);
    const kOf = (z) => lerp(1.25, 0.42, sstep(0.008, 0.06, rOf(z)));                         // the same light spread over a larger disc is fainter
    // street lamps, both kerbs
    for (const s of [-1, 1]) {
      let z = rng.range(0.7, 0.9);
      const dz = rng.range(0.42, 0.5);
      for (let i = 0; i < 15; i++) {
        const p = proj(s * 1.0, 1.0, z), r = rOf(z);
        add(p.x + rng.gauss() * r * 0.08, p.y + rng.gauss() * r * 0.08, r, tint(c0, c3, rng.range(0.05, 0.35)), kOf(z) * rng.range(0.85, 1.1));
        z += dz * rng.range(0.94, 1.06);
      }
    }
    // traffic: tail-lights on one side, head-lights on the other, in pairs on the road
    const cars = Math.round(8 * P.density);
    for (let i = 0; i < cars; i++) {
      const s = i % 2 ? 1 : -1, z = 0.9 * Math.pow(8, rng()) + 0.1, lane = s * rng.range(0.16, 0.6), r = rOf(z) * 0.8;
      const tail = s * side > 0, c = tail ? tint(c1, c0, rng.range(0, 0.12)) : tint(c3, white, 0.5), k = kOf(z) * (tail ? 1 : 0.8);
      for (const o of [-0.1, 0.1]) { const p = proj(lane + o, (-ground / lampH) * rng.range(0.85, 0.95), z); add(p.x, p.y, r, c, k * rng.range(0.85, 1.05)); }
    }
    // signals over the road
    for (let i = 0; i < 4; i++) { const z = rng.range(1.2, 6), p = proj(rng.range(-0.75, 0.75), rng.range(0.42, 0.7), z); add(p.x, p.y, rOf(z) * 0.85, i % 3 === 2 ? c1 : c2, kOf(z) * rng.range(0.8, 1.0)); }
    // the far city: lit windows and signs to either side of the street, thinning out upwards
    const far = Math.round(46 * P.density);
    for (let i = 0; i < far; i++) {
      const z = rng.range(5, 16), p = proj(rng.sign() * (0.9 + Math.abs(rng.gauss()) * 5.5), -0.3 + Math.abs(rng.gauss()) * 4.2, z), pick = rng();
      add(p.x, p.y, rOf(z) * rng.range(0.82, 1.0), pick < 0.5 ? tint(c3, c0, rng.range(0.1, 0.8)) : pick < 0.72 ? c0 : pick < 0.87 ? c1 : c2, rng.range(0.22, 0.62));
    }
    // rain on the lens: a handful of very large, faint discs
    for (let i = 0; i < 5; i++) add(vp.x + rng.gauss() * 0.6 * S, vp.y + rng.gauss() * 0.4 * S, rng.range(0.1, 0.16), rng() < 0.6 ? c0 : rng() < 0.5 ? c1 : c2, rng.range(0.05, 0.1));
    horizon = { y: vp.y + 0.02, c: tint(accent, c0, 0.35), k: 0.09, h: 0.2 * sy };
    pool(vp.x, vp.y, 0.5 * S, 0.26 * S, tint(c0, accent, 0.4), 0.07);
  }

  // ---- make room for the words: lights on the copy dim and the largest ones there are dropped
  const kept = [];
  for (const l of lights) {
    if (l.x < -l.r * 1.3 || l.x > sx + l.r * 1.3 || l.y < -l.r * 1.3 || l.y > sy + l.r * 1.3) continue;
    const d = copyDist(l.x, l.y) - l.r * 0.6, ds = stripDist(l.x, l.y) - l.r * 0.3;
    const q = Math.max(1 - sstep(-0.02, 0.1, d), 0.8 * (1 - sstep(-0.01, 0.05, ds)));
    if (q > 0.5 && l.r > 0.05 && rng() < 0.7) continue;
    l.k *= lerp(1, light ? 0.22 : 0.13, q);
    kept.push(l);
  }
  kept.sort((a, b) => b.r - a.r);                                           // large, faint discs first so small bright ones sit on top (daylight mode)

  // ---- background: the night colour, a dusk band at the horizon and broad pools of light, calm behind the copy
  while (glows.length < 3) glows.push({ x: 9, y: 9, rx: 1, ry: 1, c: new THREE.Color(0), k: 0 });
  scene.add(backgroundQuad(/* glsl */`
    varying vec2 vUv; uniform vec3 bg, uHorC, uGlowC[3]; uniform vec4 uGlow[3]; uniform vec3 uHor; uniform float uGlowK[3], uLight; uniform vec2 uAsp;
    ${GLSL_QUIET}
    void main(){
      vec2 p = vec2(vUv.x, 1.0 - vUv.y), q = p * uAsp;
      float calm = 1.0 - 0.8 * quietMask(p, 0.12);
      vec3 col = bg;
      float dy = q.y - uHor.x, hz = exp(-pow(abs(dy) / (dy < 0.0 ? uHor.z : 0.7 * uHor.z), 1.5));
      vec3 addc = uHorC * uHor.y * hz;
      for (int i = 0; i < 3; i++) { vec2 d = (q - uGlow[i].xy) / uGlow[i].zw; addc += uGlowC[i] * uGlowK[i] * exp(-dot(d, d)); }
      if (uLight < 0.5) col += addc * calm;
      else { float w = clamp(dot(addc, vec3(0.3333)) * 4.0, 0.0, 0.62) * calm; col = mix(col, addc / max(dot(addc, vec3(0.3333)), 1e-4) * 0.8, w); }   // daylight: the pools are washes of colour
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }`, {
    bg: { value: bgc }, uAsp: { value: new THREE.Vector2(sx, sy) }, uLight: { value: light ? 1 : 0 },
    uHor: { value: new THREE.Vector3(horizon?.y ?? 9, horizon?.k ?? 0, horizon?.h ?? 1) }, uHorC: { value: horizon?.c ?? new THREE.Color(0) },
    uGlow: { value: glows.slice(0, 3).map((g) => new THREE.Vector4(g.x, g.y, g.rx, g.ry)) }, uGlowC: { value: glows.slice(0, 3).map((g) => g.c) }, uGlowK: { value: glows.slice(0, 3).map((g) => g.k) },
    ...quietUniforms(ctx),
  }));

  // ---- the discs: one instanced quad per light
  const n = kept.length, geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3)); geo.setIndex([0, 1, 2, 0, 2, 3]);
  const iA = new Float32Array(n * 4), iB = new Float32Array(n * 4), iC = new Float32Array(n * 3);
  kept.forEach((l, i) => { iA.set([l.x, l.y, l.r, l.k], i * 4); iB.set([l.seed, l.soft, rng() * 6.283, rng()], i * 4); iC.set([l.c.r, l.c.g, l.c.b], i * 3); });
  geo.setAttribute('iA', new THREE.InstancedBufferAttribute(iA, 4)); geo.setAttribute('iB', new THREE.InstancedBufferAttribute(iB, 4)); geo.setAttribute('iC', new THREE.InstancedBufferAttribute(iC, 3));
  geo.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, blending: light ? THREE.NormalBlending : THREE.AdditiveBlending,
    uniforms: {
      uAsp: { value: new THREE.Vector2(sx, sy) }, uAxis: { value: new THREE.Vector2(0.5 * sx, 0.5 * sy) }, uPx: { value: 1 / Math.min(W, H) },
      uRim: { value: P.rim }, uCat: { value: P.cateye }, uBlades: { value: P.blades }, uLight: { value: light ? 1 : 0 }, uBg: { value: bgc },
    },
    vertexShader: /* glsl */`
      attribute vec4 iA, iB; attribute vec3 iC; uniform vec2 uAsp;
      varying vec2 vQ; varying vec4 vA, vB; varying vec3 vC;
      void main(){
        vQ = position.xy * 1.3; vA = iA; vB = iB; vC = iC;
        vec2 p = (iA.xy + vQ * iA.z) / uAsp;                                  // frame fraction, y down
        gl_Position = vec4(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec2 uAxis; uniform float uPx, uRim, uCat, uBlades, uLight; uniform vec3 uBg;
      varying vec2 vQ; varying vec4 vA, vB; varying vec3 vC;
      ${GLSL_NOISE_KIT}
      // brightness of the blur disc at normalised radius r (1 = edge); e = edge softness
      float disc(float r, float e, float rim){
        float edge = 1.0 - smoothstep(1.0 - e, 1.0 + e, r);
        float body = 0.7 + 0.3 * r * r;                                       // slightly hollow: light piles up towards the edge
        float ring = exp(-pow((r - (1.0 - 1.4 * e - 0.035)) / 0.05, 2.0));    // the bright rim
        return edge * (body + rim * ring);
      }
      void main(){
        vec2 q = vQ; float R = vA.z, seed = vB.x;
        float e = max(1.6 * uPx / R, 0.022 + 0.05 * vB.y + 0.012 / (R * 40.0 + 0.3));
        // aperture: round, or a softly rounded polygon
        float ang = atan(q.y, q.x) + vB.z, r = length(q);
        if (uBlades > 2.5) { float seg = 6.2831853 / uBlades; r *= mix(1.0, cos(mod(ang, seg) - 0.5 * seg) / cos(0.5 * seg), 0.55); }
        // cat's eye: the far side of the disc is cut by the lens barrel, more so towards the corners
        vec2 toAxis = uAxis - vA.xy; float off = length(toAxis);
        float cut = uCat * 0.62 * smoothstep(0.18, 0.95, off);
        float eye = 1.0 - smoothstep(1.0 - e, 1.0 + e, length(q - normalize(toAxis + 1e-5) * cut) / 1.07);
        // lens texture: faint onion rings, mottling and a few specks of dust
        float tex = 1.0 + 0.045 * sin(r * (26.0 + 30.0 * seed) + seed * 40.0) * smoothstep(0.15, 0.8, r);
        tex *= 1.0 + 0.09 * noise2(q * 2.3 + seed * 91.0) + 0.05 * noise2(q * 7.0 - seed * 53.0);
        vec3 cl = cellular2(q * 2.6 + seed * 17.0); tex *= 1.0 - 0.35 * smoothstep(0.1, 0.05, cl.x) * step(0.72, cl.z);
        // a little lateral colour: red slightly larger, blue slightly smaller
        float rimK = uRim * (0.32 + 0.3 * vB.w);
        vec3 prof = vec3(disc(r * 0.985, e, rimK), disc(r, e, rimK), disc(r * 1.017, e, rimK)) * eye * tex;
        if (uLight < 0.5) {
          gl_FragColor = vec4(vC * prof * vA.w, 1.0);
        } else {
          // daylight: discs are veils of pale colour over the ground, with a lighter rim
          float a = clamp(prof.g * (0.2 + 0.58 * vA.w), 0.0, 0.92);
          vec3 c = mix(vC, vec3(1.0), 0.12 + 0.5 * smoothstep(0.78, 0.97, r) * smoothstep(1.06, 0.97, r));
          gl_FragColor = vec4(c, a);
        }
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; scene.add(mesh);

  ctx.frame({ radius: 1, fov: 30, dir: [0, 0, 1] });   // nothing three-dimensional to place; the lights are composed in frame space around ctx.focus

  // ---- finish: bloom, hue-preserving clip, vignette, grain
  const grain = {
    uniforms: { tDiffuse: { value: null }, uAmt: { value: 0.035 * P.grain }, uScale: { value: Math.max(1, unit / 10.8) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`uniform sampler2D tDiffuse; uniform float uAmt, uScale; varying vec2 vUv;
      ${GLSL_NOISE_KIT}
      void main(){ vec4 t = texture2D(tDiffuse, vUv); vec2 g = floor(gl_FragCoord.xy / uScale);
        float n = hash21(g) + hash21(g + 91.7) - 1.0; float l = dot(t.rgb, vec3(0.3, 0.6, 0.1));
        gl_FragColor = vec4(clamp(t.rgb + n * uAmt * (0.35 + 0.65 * sqrt(clamp(l, 0.0, 1.0))), 0.0, 1.0), t.a); }`,
  };
  return makeComposer(ctx, {
    samples: 0,
    bloom: light ? false : { strength: 0.2 * P.glow, radius: 0.35, threshold: 0.6 },
    linear: [hdrClipPassShader({ keep: 0.82 })],
    display: [finishPassShader(ctx, { vignette: light ? 0.08 : 0.34, contrast: light ? 0 : 0.08 }), grain],
  });
}
