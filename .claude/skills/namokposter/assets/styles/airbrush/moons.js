// Airbrush motif `moons` — three moons rising over the soft dunes of another world. A large moon sits on the
// far ridge at the layout focus, half risen; two smaller ones hang above it on the side away from the copy.
// All three are lit by a sun that has just set on the outer side, so their lit crescents face away from the
// type. The sky is sprayed from the open-space colour behind the copy to a warm glow along the horizon; three
// ranges of dunes, each with a thin rim of light on its crest, fade towards the ground colour under the copy.
import { backgroundQuad } from '/skill/assets/web/scene-lib.js';
import { clamp, airColours, copyLayout, blockUniform, GLSL_AIR } from './air-kit.js';

export default function buildMoons(ctx) {
  const { THREE, scene, params, seed, rng, width: W, height: H } = ctx;
  const P = { nebula: params.nebula ?? 1, stars: params.stars ?? 1, size: params.size ?? 1, flare: params.flare ?? 1, count: clamp(Math.round(params.moons ?? 3), 1, 3) };
  const K = airColours(ctx), lay = copyLayout(ctx), { sx, sy, blockDist } = lay;
  const fx = ctx.focus.x, fy = ctx.focus.y, art = clamp(ctx.artSize ?? 0.7, 0.3, 1.1);
  const side = Math.abs(fx - lay.ccx) < 0.08 ? (rng() < 0.5 ? -1 : 1) : fx > lay.ccx ? 1 : -1;     // away from the copy

  // horizon (short-side units, y down): below the focus, clear of the footer
  const hor = Math.min(fy * sy + 0.4 * art, (lay.footTop - 0.07) * sy, 0.9 * sy);
  // the big moon, half risen on the far ridge, as large as the copy allows
  let R1 = 0.34 * art * P.size;
  const m1 = { x: fx * sx, y: hor - 0.42 * R1 };
  for (let it = 0; it < 30; it++) {
    m1.y = hor - 0.42 * R1;
    if (blockDist(m1.x / sx, m1.y / sy) - 0.04 >= R1 * (K.dark ? 0.75 : 0.95)) break;
    R1 *= 0.93;
  }
  const moons = [new THREE.Vector4(m1.x, m1.y, R1, 0)];
  // the smaller moons: above the big one, towards the outer side, on clear sky
  const sizes = [rng.range(0.34, 0.42), rng.range(0.13, 0.18)];
  for (let k = 0; k < P.count - 1; k++) {
    const r = R1 * sizes[k]; let best = null;
    for (let t = 0; t < 140; t++) {
      const a = (side > 0 ? rng.range(0.15, 1.45) : Math.PI - rng.range(0.15, 1.45)) + (k === 1 ? rng.range(-1.2, 1.2) : 0);
      const d = R1 * (k === 0 ? rng.range(1.5, 2.1) : rng.range(1.35, 2.9));
      const x = m1.x + Math.cos(a) * d, y = m1.y - Math.sin(a) * d;
      if ((x - r * 1.3) / sx < 0.03 || (x + r * 1.3) / sx > 0.97 || y / sy < lay.headBot + 0.06 || y > hor - r * 1.6) continue;
      const clear = blockDist(x / sx, y / sy) - r;
      if (clear < 0.05) continue;
      if (moons.some((o) => Math.hypot(o.x - x, o.y - y) < (o.z + r) * 1.35)) continue;
      const score = Math.min(clear, 0.25) - 0.15 * Math.abs(d / R1 - (k === 0 ? 1.7 : 2.2));
      if (!best || score > best.score) best = { x, y, score };
    }
    if (best) moons.push(new THREE.Vector4(best.x, best.y, r, k + 1));
  }
  while (moons.length < 3) moons.push(new THREE.Vector4(-9, -9, 0.001, 0));

  // a few bright stars, clear of the copy and the moons, above the horizon
  const bright = [];
  for (let t = 0; t < 200 && bright.length < Math.round(6 * P.stars); t++) {
    const x = rng.range(0.03, 0.97), y = rng.range(0.03, hor / sy - 0.1), s = 0.0035 + 0.005 * Math.pow(rng(), 2.2);
    if (blockDist(x, y) < 0.07 || y < lay.headBot + 0.03) continue;
    if (moons.some((o) => Math.hypot(o.x - x * sx, o.y - y * sy) < o.z * 1.8 + 0.05)) continue;
    if (bright.some((o) => Math.hypot((o.x - x) * sx, (o.y - y) * sy) < 0.18)) continue;
    bright.push(new THREE.Vector4(x, y, s, rng()));
  }
  const nBright = bright.length; while (bright.length < 8) bright.push(new THREE.Vector4(9, 9, 0.001, 0));

  const L = new THREE.Vector3(side * 0.82, -0.18, 0.5).normalize();      // the sun has set on the outer side

  scene.add(backgroundQuad(/* glsl */`
    varying vec2 vUv;
    ${GLSL_AIR}
    uniform float uSeed, uDark, uHor, uNeb, uStars, uFlare, uSide; uniform vec3 uL; uniform vec4 uMoon[3], uBright[8]; uniform int uBrightN;
    uniform vec3 cBg, cNebA, cNebB, cBody, cPale, cAcc, cInk;
    float sq(float x){ return x * x; }
    float ridge(float x, float base, float amp, float fr, uint s){ return base - amp * (0.55 + 0.45 * gn(vec2(x * fr, 0.5), s) + 0.25 * gn(vec2(x * fr * 2.7, 1.5), s + 9u)); }
    void main(){
      vec2 p = vec2(vUv.x, 1.0 - vUv.y), q = p * uAsp, wq = q * 1.3 + uSeed;
      vec2 calm = calmAt(p, wq);
      float above = uHor - q.y;                                                     // > 0 in the sky
      // ---- sky: open space at the top, a sprayed glow rising from the horizon
      vec3 hz = mix(mix(cNebB, cAcc, 0.45), cPale, mix(0.15, 0.35, 1.0 - uDark));
      float g1 = exp(-max(above, 0.0) / 0.16), g2 = exp(-sq((above - 0.42) / 0.3));
      vec3 col = cBg;
      col = mix(col, cNebA, 0.55 * g2 * (1.0 - 0.9 * calm.y) * mix(0.75, 0.5, 1.0 - uDark));
      col = mix(col, hz, (0.82 * g1) * (1.0 - 0.85 * calm.y));
      // ---- thin sprayed cloud streaks along the glow
      float neb = 0.0;
      if (uNeb > 0.0) {
        vec2 nq = vec2(q.x * 0.9, q.y * 3.2) + uSeed;
        float n1 = fbm(nq + vec2(0.0, 0.6 * fbm(q * 1.4 + uSeed, 11u, 3)), 21u, 5);
        neb = smoothstep(0.05, 0.55, n1) * exp(-sq((above - 0.2) / 0.16)) * uNeb * (1.0 - 0.95 * calm.y);
        col = mix(col, mix(cNebB, hz, 0.4), 0.45 * neb);
      }
      // ---- stars, thinning into the glow
      vec4 st = stars(q, 0.0, calm.x, uDark, cBg, cInk, cNebA);
      col = mix(col, st.rgb, st.a * uStars * smoothstep(0.03, 0.3, above) * (1.0 - 0.7 * neb));
      for (int i = 0; i < uBrightN; i++) {
        vec4 b = uBright[i]; float rr = length(q - b.xy * uAsp), s = b.z;
        float core = smoothstep(s * 0.5 + uPx, s * 0.5 - uPx, rr), halo = (0.5 * exp(-rr / (s * 1.3)) + 0.14 * exp(-rr / (s * 4.5))) * uFlare;
        col = mix(col, mix(vec3(1.0, 0.0, 0.0), mix(cAcc, cPale, b.w), mix(0.25, 0.5, 1.0 - uDark)), clamp(core + halo, 0.0, 1.0));
      }
      // ---- the moons, smallest first
      for (int i = 2; i >= 0; i--) {
        vec4 m = uMoon[i]; vec2 mp = vec2(q.x - m.x, m.y - q.y); float r = length(mp), R = m.z;
        vec3 mc = i == 0 ? mix(cPale, cBody, mix(0.18, 0.45, 1.0 - uDark)) : i == 1 ? mix(cBody, cPale, 0.35) : mix(cNebB, cPale, 0.45);
        if (uDark < 0.5) mc = vec3(mc.x * 0.93, mc.yz * 1.35);
        // halo of lit air round the lit limb, and a wide soft glow
        float limb = smoothstep(-0.4, 0.6, dot(mp / max(r, 1e-5), normalize(uL.xy)));
        float halo = (0.45 * exp(-max(r - R, 0.0) / (R * 0.05)) * limb + 0.16 * exp(-max(r - R, 0.0) / (R * 0.55))) * uFlare;
        col = mix(col, mix(mc, cPale, 0.4), clamp(halo, 0.0, 1.0) * step(R, r) * (1.0 - 0.85 * calm.x));
        if (r < R + 2.0 * uPx) {
          vec3 N = vec3(mp, sqrt(max(R * R - r * r, 0.0))) / R;
          float ndl = dot(N, uL), lit = smoothstep(-0.1, 0.42, ndl) * (0.75 + 0.25 * pow(max(N.z, 0.0), 0.5));
          float mar = fbm(N.xy * 2.2 + uSeed + float(i) * 3.1, 31u + uint(i), 4), crater = fbm(N.xy * 7.0 + float(i), 41u, 3);
          vec3 surf = mix(mc, mix(mc, cNebA, 0.35) * vec3(0.9, 1.0, 1.0), 0.45 * smoothstep(-0.05, 0.4, mar));
          surf = mix(surf, cPale, 0.18 * smoothstep(0.25, 0.6, crater));
          vec3 night = mix(mix(cBg, surf, 0.14) * vec3(mix(0.85, 1.0, 1.0 - uDark), 1.0, 1.0), mix(surf, mix(cBg, cInk, 0.25), 0.55), 1.0 - uDark);
          vec3 pc = mix(night, surf, lit);
          pc = mix(pc, mix(cAcc, cPale, 0.5), 0.5 * pow(1.0 - max(N.z, 0.0), 2.5) * smoothstep(-0.05, 0.5, ndl));   // bright limb
          pc = mix(pc, mix(cBg, cNebA, 0.04), calm.x * 0.9);
          col = mix(col, pc, smoothstep(uPx, -uPx, r - R));
        }
      }
      // ---- dunes: far ridge (hazy, in the glow), middle and near ranges, each with a lit rim on its crest
      float x = q.x;
      float yF = ridge(x, uHor + 0.01, 0.045, 2.0, 51u), yM = ridge(x + 3.0, uHor + 0.11, 0.12, 1.1, 61u), yN = ridge(x - 2.0, uHor + 0.27, 0.17, 0.7, 71u);
      float lean = (x - uMoon[0].x) * uSide; yM -= 0.05 * lean; yN -= 0.09 * lean;   // the ground swells towards the outer side
      vec3 groundBase = uDark > 0.5 ? mix(cBg, cNebA, 0.22) : mix(cBg, mix(cNebA, cBody, 0.4), 0.55);
      vec3 farC = mix(hz, groundBase, 0.35), midC = mix(hz, groundBase, 0.68), nearC = uDark > 0.5 ? mix(groundBase, cBg, 0.55) : mix(groundBase, cNebA, 0.25);
      vec3 rimC = mix(cAcc, cPale, 0.4);
      float aa = uPx * 1.5;
      // far
      float inF = smoothstep(yF - aa, yF + aa, q.y);
      vec3 gF = mix(farC, midC, smoothstep(0.0, 0.08, q.y - yF));
      col = mix(col, mix(gF, cBg, 0.6 * calm.y), inF);
      // middle
      float inM = smoothstep(yM - aa, yM + aa, q.y);
      vec3 gM = mix(midC, mix(midC, nearC, 0.6), smoothstep(0.0, 0.12, q.y - yM));
      gM = mix(gM, rimC, 0.7 * exp(-max(q.y - yM, 0.0) / 0.005) * (0.6 + 0.4 * gn(vec2(x * 3.0, 2.0), 81u)));
      col = mix(col, mix(gM, cBg, 0.7 * calm.y), inM);
      // near
      float inN = smoothstep(yN - aa, yN + aa, q.y);
      vec3 gN = mix(mix(nearC, midC, 0.25), nearC, smoothstep(0.0, 0.1, q.y - yN));
      gN = mix(gN, rimC, 0.55 * exp(-max(q.y - yN, 0.0) / 0.004));
      float dust = fbm(q * vec2(2.0, 9.0) + uSeed, 91u, 4);
      gN = mix(gN, mix(gN, midC, 0.5), 0.25 * smoothstep(0.0, 0.5, dust));
      col = mix(col, mix(gN, cBg, 0.75 * calm.y), inN);
      // where the copy sits the ground melts back into the page colour
      col = mix(col, cBg, step(0.0, q.y - yF) * calm.x * 0.85);
      gl_FragColor = vec4(clamp(lab2lin(col), 0.0, 1.0), 1.0);
      #include <colorspace_fragment>
      gl_FragColor.rgb += airDither(gl_FragCoord.xy);
    }`, {
    uAsp: { value: new THREE.Vector2(sx, sy) }, uPx: { value: 1 / Math.min(W, H) }, uSeed: { value: (seed % 113) * 0.713 }, uDark: { value: K.dark ? 1 : 0 },
    uHor: { value: hor }, uNeb: { value: P.nebula }, uStars: { value: P.stars }, uFlare: { value: P.flare }, uSide: { value: side },
    uL: { value: L }, uMoon: { value: moons }, uBright: { value: bright }, uBrightN: { value: nBright },
    cBg: { value: K.bg }, cNebA: { value: K.nebA }, cNebB: { value: K.nebB }, cBody: { value: K.body }, cPale: { value: K.pale }, cAcc: { value: K.acc }, cInk: { value: K.ink },
    uBlock: { value: blockUniform(THREE, lay) }, uFoot: { value: lay.footer ? lay.footTop : 2 }, uHead: { value: lay.header ? lay.headBot : -1 },
  }));
  ctx.frame({ radius: 1, fov: 30, dir: [0, 0, 1] });
}
