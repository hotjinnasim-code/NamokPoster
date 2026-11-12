// Liquid Gradient — lava-lamp forms: metaballs that melt into one another (smooth signed-distance union,
// meshed with marching cubes and snapped back onto the exact surface), shaded with a gradient that flows
// through the palette over the form, a soft wrap light, a luminous rim and — for the glossy finish — a long
// studio-strip reflection; fine film grain over everything. The look of contemporary brand gradients.
// params.motif:
//   rise    lava lamp: a heavy blob at the bottom, a second one pinching off above it, drops rising away
//   mass    one large merging mass with a drop joining it and two free droplets
//   wave    a thick liquid sheet that swells and curls sideways, its edge breaking into drops
//   drip    a drop hanging from a heavy mass, about to fall
// Palette: bg = the ground (kept plain behind the copy) · colors[0..3] = the gradient that flows through the liquid
//          accent = the glint
import { backgroundQuad, quietUniforms, GLSL_QUIET, makeNoise } from '/skill/assets/web/scene-lib.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---- signed distances (world units)
const sSphere = (x, y, z, c, r) => Math.hypot(x - c[0], y - c[1], z - c[2]) - r;
function sEll(x, y, z, c, r) {
  const px = (x - c[0]) / r[0], py = (y - c[1]) / r[1], pz = (z - c[2]) / r[2];
  const k0 = Math.hypot(px, py, pz), k1 = Math.hypot(px / r[0], py / r[1], pz / r[2]);
  return k1 < 1e-6 ? -Math.min(...r) : (k0 * (k0 - 1)) / k1;
}
function sCone(x, y, z, a, b, ra, rb) {   // rounded cone between two points (good enough as a field)
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2], px = x - a[0], py = y - a[1], pz = z - a[2];
  const h = clamp((px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz), 0, 1);
  return Math.hypot(px - bx * h, py - by * h, pz - bz * h) - (ra + (rb - ra) * h);
}
const smin = (a, b, k) => { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

export default function build(ctx) {
  const { THREE, scene, camera, rng, palette, params, aspect, unit, width: W, height: H, seed } = ctx;
  const P = {
    motif: String(params.motif ?? 'mass'), finish: String(params.finish ?? 'satin'), grain: clamp(params.grain ?? 1, 0, 3),
    glow: clamp(params.glow ?? 1, 0, 2), wobble: clamp(params.wobble ?? 1, 0, 3), detail: clamp(params.detail ?? 1, 0.5, 1.6),
  };
  const gloss = P.finish === 'gloss' ? 1 : P.finish === 'matte' ? 0 : 0.5;
  const cols = palette.colors?.length ? palette.colors : [palette.accent];
  const C = (i) => new THREE.Color(cols[i % cols.length]);
  const bgc = new THREE.Color(palette.bg), dark = bgc.getHSL({}).l < 0.35;
  const sx = Math.max(aspect, 1), sy = Math.max(1 / aspect, 1);

  // the side the copy is on: light comes from the other side, so the shadowed flank faces the type
  const copy = ctx.quiet?.[0], ccx = copy ? (copy[0] + copy[2]) / 2 : 0.3, ccy = copy ? (copy[1] + copy[3]) / 2 : 0.3;
  const side = Math.abs(ctx.focus.x - ccx) < 0.1 ? (rng() < 0.5 ? -1 : 1) : ctx.focus.x > ccx ? 1 : -1;
  const below = ctx.focus.y > ccy + 0.12 && Math.abs(ctx.focus.x - ccx) < 0.15;          // copy above the art (portrait 'top')
  const J = (a) => rng.range(-a, a);

  // ---- the shapes of each motif: a list of primitives with a blend radius each
  const prims = []; let box, fit, tilt = 0, turn = 0.25;
  const add = (f, k) => prims.push({ f, k });
  const sph = (c, r, k) => add((x, y, z) => sSphere(x, y, z, c, r), k);
  const ell = (c, r, k) => add((x, y, z) => sEll(x, y, z, c, r), k);
  const cone = (a, b, ra, rb, k) => add((x, y, z) => sCone(x, y, z, a, b, ra, rb), k);
  const m = P.motif;
  if (m === 'rise') {
    const lean = side * 0.06;
    ell([J(0.03), -0.9, 0], [0.64, 0.4, 0.56], 0);
    sph([lean * 0.5 + J(0.03), -0.32, 0.04], 0.29, 0.34);                     // pinching off the base
    ell([lean * 1.5 - 0.1 * side, 0.3, -0.04], [0.25, 0.32, 0.25], 0.17);   // stretched while it rises
    ell([lean * 2.4 + 0.12 * side, 0.92, 0.08], [0.19, 0.22, 0.19], 0);
    sph([lean * 3 - 0.06 * side, 1.3, 0.0], 0.095, 0);
    sph([0.42 * side, 0.62, 0.18], 0.07, 0);
    sph([-0.36 * side, -0.02, 0.22], 0.05, 0);
    box = [0.85, 1.48, 0.7]; fit = { width: 1.45, height: 2.75 };
  } else if (m === 'wave') {
    // a breaking wave in liquid: a curled sheet, thick where it rises from the trough and thinning as it rolls
    // over, extruded in depth with rounded edges; the curling tip throws off drops
    const ph = rng.range(0, 6.28);
    const N = 120, path = [], seg = 4.3 / N; let px = -2.0, py = -0.62;
    for (let i = 0; i <= N; i++) {
      const s = i / N, th = 0.16 + 3.9 * Math.pow(s, 2.1) + 0.12 * Math.sin(s * 7 + ph);
      path.push({ x: px, y: py, s }); px += Math.cos(th) * seg; py += Math.sin(th) * seg;
    }
    const xs = path.map((q) => q.x), ys = path.map((q) => q.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    for (const q of path) { q.x = (q.x - cx) * side; q.y -= cy; }
    const lip = path[N];
    // nearest point of the path, tabulated once on a fine 2D grid (distance and path parameter)
    const G = 0.008, gx0 = -2.3, gy0 = -1.6, GW = Math.ceil(4.6 / G) + 1, GH = Math.ceil(3.2 / G) + 1;
    const tD = new Float32Array(GW * GH), tS = new Float32Array(GW * GH);
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
      const x = gx0 + i * G, y = gy0 + j * G; let best = 1e9, bs = 0;
      for (let k = 0; k < N; k++) {
        const a = path[k], b = path[k + 1], bx = b.x - a.x, by = b.y - a.y;
        const h = clamp(((x - a.x) * bx + (y - a.y) * by) / (bx * bx + by * by), 0, 1);
        const d = (x - a.x - bx * h) ** 2 + (y - a.y - by * h) ** 2;
        if (d < best) { best = d; bs = a.s + (b.s - a.s) * h; }
      }
      tD[i + j * GW] = Math.sqrt(best); tS[i + j * GW] = bs;
    }
    add((x, y, z) => {
      const fx = clamp((x - gx0) / G, 0, GW - 1.001), fy = clamp((y - gy0) / G, 0, GH - 1.001), i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, o = i + j * GW;
      const dist = (tD[o] * (1 - u) + tD[o + 1] * u) * (1 - v) + (tD[o + GW] * (1 - u) + tD[o + GW + 1] * u) * v;
      const bs = (tS[o] * (1 - u) + tS[o + 1] * u) * (1 - v) + (tS[o + GW] * (1 - u) + tS[o + GW + 1] * u) * v;
      const r = 0.075 + 0.24 * Math.pow(1 - bs, 1.3) + 0.025 * Math.sin(z * 4 + bs * 6 + ph), dz = 0.72 * (1 - 0.4 * bs) + 0.07 * Math.sin(bs * 9 + ph), rr = r * 0.9;
      const wx = dist - (r - rr), wz = Math.abs(z) - (dz - rr);
      return Math.min(Math.max(wx, wz), 0) + Math.hypot(Math.max(wx, 0), Math.max(wz, 0)) - rr;
    }, 0);
    sph([lip.x + 0.02 * side, lip.y - 0.22, 0.32], 0.075, 0.12);
    sph([lip.x - 0.02 * side, lip.y - 0.45, 0.12], 0.05, 0);
    sph([lip.x + 0.12 * side, lip.y - 0.6, -0.3], 0.035, 0);
    sph([path[N - 22].x + 0.2 * side, path[N - 22].y + 0.32, -0.25], 0.06, 0);
    box = [1.75, 1.25, 0.95]; fit = { width: 3.4, height: 2.3 }; tilt = 0.12; turn = 0.32;
  } else if (m === 'drip') {
    ell([0, 0.62, 0], [0.82, 0.42, 0.62], 0);
    sph([0.28 * side, 0.38, 0.12], 0.36, 0.3);
    cone([0.06 * side, 0.2, 0.05], [0.04 * side, -0.48, 0.05], 0.24, 0.07, 0.28);   // the neck
    sph([0.03 * side, -0.72, 0.05], 0.2, 0.2);                                    // the drop at its end
    sph([0.0, -1.18, 0.05], 0.08, 0);
    sph([-0.5 * side, 0.08, 0.2], 0.11, 0.24);
    box = [1.05, 1.4, 0.85]; fit = { width: 1.8, height: 2.45 };
  } else {   // mass
    sph([0, 0, 0], 0.6, 0);
    sph([0.46 * side, 0.3, 0.1], 0.42, 0.36);
    sph([-0.4 * side, -0.32, 0.18], 0.38, 0.36);
    sph([0.3 * side, -0.5, -0.12], 0.3, 0.3);
    sph([-0.12 * side, 0.5, -0.2], 0.3, 0.3);
    sph([-0.78 * side, 0.36, 0.05], 0.15, 0.3);                                  // a drop joining the mass
    sph([0.98 * side, -0.4, 0.15], 0.11, 0);
    sph([-0.3 * side, 1.0, 0.12], 0.08, 0);
    sph([0.72 * side, 0.82, -0.1], 0.05, 0);
    box = [1.22, 1.22, 1.0]; fit = { radius: 1.15 };
  }
  const noise = makeNoise(seed * 7 + 3), wob = 0.022 * P.wobble;
  const sdf = (x, y, z) => {
    let d = 1e9;
    for (const p of prims) d = smin(d, p.f(x, y, z), p.k);
    if (wob > 0 && d < 0.12) d += wob * noise.noise3(x * 1.6 + 3.1, y * 1.6, z * 1.6 - 2.3);
    return d;
  };

  // ---- marching cubes over the box, then every vertex snapped onto the surface with an exact normal
  const res = Math.round(clamp((2 * Math.max(...box) / 0.019) * P.detail, 64, 200));   // cells of about 0.02
  const mc = new THREE.MarchingCubes(res, new THREE.MeshBasicMaterial(), false, false, 600000);
  mc.isolation = 0;
  const f = mc.field, n = res;
  for (let k = 0; k < n; k++) {
    const z = (k / n * 2 - 1) * box[2];
    for (let j = 0; j < n; j++) {
      const y = (j / n * 2 - 1) * box[1];
      for (let i = 0; i < n; i++) {
        const x = (i / n * 2 - 1) * box[0];
        const edge = Math.min(i, j, k, n - 1 - i, n - 1 - j, n - 1 - k) < 2;
        f[i + j * n + k * n * n] = edge ? -1 : -sdf(x, y, z);
      }
    }
  }
  mc.update();
  const cnt = mc.count, src = mc.positionArray;
  const pos = new Float32Array(cnt * 3), nor = new Float32Array(cnt * 3), e = 0.012;   // a wide difference: smooth normals, no grid facets
  const loc2w = (v, a) => v * box[a];   // MarchingCubes puts field sample i at local i/n*2-1, as sampled above
  for (let v = 0; v < cnt; v++) {
    let x = loc2w(src[v * 3], 0), y = loc2w(src[v * 3 + 1], 1), z = loc2w(src[v * 3 + 2], 2);
    for (let it = 0; it < 2; it++) {
      const d = sdf(x, y, z);
      let gx = sdf(x + e, y, z) - sdf(x - e, y, z), gy = sdf(x, y + e, z) - sdf(x, y - e, z), gz = sdf(x, y, z + e) - sdf(x, y, z - e);
      const gl = Math.hypot(gx, gy, gz) || 1; gx /= gl; gy /= gl; gz /= gl;
      if (it === 0) { const s = clamp(d, -0.02, 0.02); x -= gx * s; y -= gy * s; z -= gz * s; }
      else { nor[v * 3] = gx; nor[v * 3 + 1] = gy; nor[v * 3 + 2] = gz; }
    }
    pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.computeBoundingSphere();

  // ---- gradient direction and light
  const ga = rng.range(0, Math.PI * 2);
  const gdir = new THREE.Vector3(Math.cos(ga) * 0.8, 0.9, Math.sin(ga) * 0.6).normalize();
  const L = new THREE.Vector3(-side * 0.75, 0.85, 0.75).normalize();
  const grainPx = Math.max(1, unit / 9);

  const lab = (c) => {   // linear rgb → OKLab
    const l = Math.cbrt(0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b), mm = Math.cbrt(0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b), s = Math.cbrt(0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b);
    return new THREE.Vector3(0.2104542553 * l + 0.793617785 * mm - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * mm + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * mm - 0.808675766 * s);
  };
  const GLSL_LAB = /* glsl */`
    vec3 lab2lin(vec3 c){
      float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z, m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z, s = c.x - 0.0894841775 * c.y - 1.291485548 * c.z;
      l = l * l * l; m = m * m * m; s = s * s * s;
      return vec3(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
    }
    float hgrain(vec2 p){ vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }`;
  const ramp = [0, 1, 2, 3].map((i) => lab(C(i)));
  const U = {
    c0: { value: ramp[0] }, c1: { value: ramp[1] }, c2: { value: ramp[2] }, c3: { value: ramp[3] },
    cBg: { value: lab(bgc) }, cAcc: { value: lab(new THREE.Color(palette.accent)) },
    uDark: { value: dark ? 1 : 0 }, uGloss: { value: gloss }, uGrain: { value: 0.035 * P.grain }, uGrainPx: { value: grainPx },
    uL: { value: L }, uG: { value: gdir }, uSeed: { value: (seed % 89) * 0.31 },
  };

  const liquid = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */`
      varying vec3 vW, vN;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      varying vec3 vW, vN; uniform vec3 c0, c1, c2, c3, cBg, cAcc, uL, uG; uniform float uDark, uGloss, uGrain, uGrainPx, uSeed;
      ${GLSL_LAB}
      vec3 ramp(float t){ t = clamp(t, 0.0, 1.0) * 3.0; return t < 1.0 ? mix(c0, c1, smoothstep(0.0, 1.0, t)) : t < 2.0 ? mix(c1, c2, smoothstep(1.0, 2.0, t)) : mix(c2, c3, smoothstep(2.0, 3.0, t)); }
      void main(){
        vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
        if (!gl_FrontFacing) N = -N;
        float nv = max(dot(N, V), 0.0), fres = pow(1.0 - nv, 2.6);
        // the gradient runs through space and is bent by the surface, so it flows round every swelling
        float t = 0.5 + 0.36 * dot(vW, uG) + 0.24 * dot(N, normalize(uG + vec3(0.5, -0.3, 0.4))) + 0.06 * sin(dot(vW, vec3(2.1, 1.3, -1.7)) + uSeed);
        vec3 base = ramp(t);
        // soft wrap light: the shadow side keeps its colour, deeper and a little more saturated
        float wrap = clamp((dot(N, uL) + 0.55) / 1.55, 0.0, 1.0);
        vec3 deep = vec3(base.x * mix(0.62, 0.5, uDark), base.yz * 1.18);
        vec3 col = mix(deep, base, smoothstep(0.0, 1.0, wrap));
        col.x += 0.06 * pow(max(dot(N, uL), 0.0), 2.0);
        // light passing through the thin rim: the far end of the gradient, lighter
        vec3 rimC = ramp(1.0 - t); rimC.x = mix(rimC.x, 1.0, 0.35); rimC.yz *= 0.85;
        col = mix(col, rimC, fres * mix(0.55, 0.75, uDark));
        // gloss: a broad soft highlight and a long studio-strip reflection
        vec3 R = reflect(-V, N), Hh = normalize(uL + V);
        float spec = pow(max(dot(N, Hh), 0.0), mix(18.0, 90.0, uGloss)) * mix(0.18, 0.75, uGloss);
        float strip = smoothstep(0.55, 0.8, R.y) * smoothstep(1.0, 0.86, R.y) * smoothstep(-0.2, 0.4, dot(R, normalize(vec3(uL.x, 0.0, 1.0))));
        vec3 glint = mix(vec3(1.0, 0.0, 0.0), cAcc, 0.15);
        col = mix(col, glint, clamp(spec + strip * 0.45 * uGloss, 0.0, 1.0) * 0.85);
        gl_FragColor = vec4(clamp(lab2lin(col), 0.0, 1.0), 1.0);
        #include <colorspace_fragment>
        vec2 g = floor(gl_FragCoord.xy / uGrainPx);
        gl_FragColor.rgb += (hgrain(g) + hgrain(g + 17.7) - 1.0) * uGrain;
      }`,
  }));
  scene.add(liquid);

  // ---- ground: plain bg, a soft coloured glow behind the liquid that retreats from the copy
  const glowC = lab(C(1).lerp(C(2), 0.5));
  scene.add(backgroundQuad(/* glsl */`
    varying vec2 vUv; uniform vec3 cBg, cGlow; uniform vec2 uF, uAsp; uniform float uR, uGlowK, uDark, uGrain, uGrainPx;
    ${GLSL_LAB}
    ${GLSL_QUIET}
    void main(){
      vec2 p = vec2(vUv.x, 1.0 - vUv.y), q = (p - uF) * uAsp;
      float g = exp(-dot(q, q) / (2.0 * uR * uR)) * uGlowK;
      g *= 1.0 - 0.92 * quietMask(p, 0.14);
      vec3 col = mix(cBg, cGlow, g * mix(0.32, 0.4, uDark));
      gl_FragColor = vec4(clamp(lab2lin(col), 0.0, 1.0), 1.0);
      #include <colorspace_fragment>
      vec2 gg = floor(gl_FragCoord.xy / uGrainPx);
      gl_FragColor.rgb += (hgrain(gg) + hgrain(gg + 17.7) - 1.0) * uGrain;
    }`, {
    cBg: { value: lab(bgc) }, cGlow: { value: glowC }, uF: { value: new THREE.Vector2(ctx.focus.x, ctx.focus.y) }, uAsp: { value: new THREE.Vector2(sx, sy) },
    uR: { value: 0.3 * (ctx.artSize ?? 0.7) }, uGlowK: { value: P.glow }, uDark: { value: dark ? 1 : 0 }, uGrain: { value: 0.022 * P.grain }, uGrainPx: { value: grainPx },
    ...quietUniforms(ctx),
  }));

  // fit what is actually there: the turned mesh's outline, centred on the origin
  liquid.rotation.set(tilt, side * turn, 0); liquid.updateMatrixWorld();
  const bb = new THREE.Box3().setFromObject(liquid, true), ctr = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3());
  liquid.position.set(-ctr.x, -ctr.y, -ctr.z);
  ctx.frame({ width: sz.x * 1.06, height: sz.y * 1.06, fov: 26, dir: [0, below ? -0.05 : 0.08, 1] });
}
