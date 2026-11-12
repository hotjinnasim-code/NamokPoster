// Airbrush motif `orbits` — an orrery in sprayed paint: a small sun (a plain disc with a soft corona, no rays)
// at the layout focus, four to six planets on fine, tilted elliptical orbit lines, each sphere lit from the sun
// so the near ones show crescents and the far ones are full; the largest may wear a ring. Orbit lines are
// soft sprayed hairlines, brighter in front of the sun and fainter behind it, and they fade out before the copy.
import { backgroundQuad } from '/skill/assets/web/scene-lib.js';
import { clamp, airColours, copyLayout, blockUniform, GLSL_AIR } from './air-kit.js';

export default function buildOrbits(ctx) {
  const { THREE, scene, params, seed, rng, width: W, height: H } = ctx;
  const P = { nebula: params.nebula ?? 1, stars: params.stars ?? 1, size: params.size ?? 1, flare: params.flare ?? 1, ring: params.ring ?? true,
    bands: params.bands ?? 1, n: clamp(Math.round(params.planets ?? 5), 3, 6) };
  const K = airColours(ctx), lay = copyLayout(ctx), { sx, sy, blockDist } = lay;
  const fx = ctx.focus.x, fy = ctx.focus.y, art = clamp(ctx.artSize ?? 0.7, 0.3, 1.1);
  const side = Math.abs(fx - lay.ccx) < 0.08 ? (rng() < 0.5 ? -1 : 1) : fx > lay.ccx ? 1 : -1;

  // the orbit plane: tilted towards the viewer (cosI = how flat the ellipses look), turned a little on screen
  const sinI = rng.range(0.36, 0.44), phi = side * rng.range(0.1, 0.22);
  const A = 0.86 * art * P.size;                                           // the outer orbit's half width, short-side units
  const sun = { x: fx * sx, y: fy * sy, r: 0.075 * A };
  const n = P.n, orbits = [], planets = [];
  const fr = [0.3, 0.46, 0.62, 0.78, 0.92, 1.06].slice(0, n), rads = [0.04, 0.058, 0.1, 0.075, 0.055, 0.05];
  // screen position (short-side units, y down) and depth of a point at angle t on orbit a
  const at = (a, t) => {
    const u = a * Math.cos(t), v = a * Math.sin(t);                     // in the orbit plane; v > 0 = towards the viewer
    const yUp = -v * sinI, z = v * Math.sqrt(1 - sinI * sinI);
    const X = u * Math.cos(phi) - yUp * Math.sin(phi), Y = u * Math.sin(phi) + yUp * Math.cos(phi);
    return { x: sun.x + X, y: sun.y - Y, z, X, Y };
  };
  const ringIdx = P.ring ? 2 : -1;
  for (let k = 0; k < n; k++) {
    const a = fr[k] * A, r = rads[k] * A * rng.range(0.85, 1.15) * (k === ringIdx ? 1.0 : 1);
    orbits.push(a);
    // where on its orbit: clear of the copy, not in front of the sun, apart from the others
    let best = null;
    for (let t = 0; t < 90; t++) {
      const th = rng.range(0, Math.PI * 2), p = at(a, th);
      const x = p.x / sx, y = p.y / sy, reach = r * (k === ringIdx ? 2.3 : 1.3);
      if (x < 0.04 || x > 0.96 || y < lay.headBot + 0.05 || y > lay.footTop - 0.06) continue;
      const clear = blockDist(x, y) - reach;
      if (clear < 0.03) continue;
      let score = Math.min(clear, 0.2) + 0.05 * Math.sin(th) - (Math.hypot(p.x - sun.x, p.y - sun.y) < sun.r * 3 + r ? 1 : 0);
      for (const o of planets) score -= 0.6 * Math.exp(-((o.x - p.x) ** 2 + (o.y - p.y) ** 2) / (0.03 + (o.z + r) ** 2));
      if (!best || score > best.score) best = { ...p, score };
    }
    if (best) planets.push(new THREE.Vector4(best.x, best.y, r, k + 0.5 + (k === ringIdx ? 10 : 0)));
    // stored: planet 3D position for lighting
    if (best) planets[planets.length - 1].P3 = [best.X, best.Y, best.z];
  }
  const pl = planets.map((p) => p), lights = pl.map((p) => { const d = new THREE.Vector3(-p.P3[0], -p.P3[1], -p.P3[2]).normalize(); return d; });
  while (pl.length < 6) { pl.push(new THREE.Vector4(-9, -9, 0.001, 0)); lights.push(new THREE.Vector3(0, 0, 1)); }
  while (orbits.length < 6) orbits.push(0);

  const bright = [];
  for (let t = 0; t < 200 && bright.length < Math.round(6 * P.stars); t++) {
    const x = rng.range(0.03, 0.97), y = rng.range(0.03, 0.97), s = 0.0035 + 0.005 * Math.pow(rng(), 2.2);
    if (blockDist(x, y) < 0.07 || y < lay.headBot + 0.03 || y > lay.footTop - 0.03) continue;
    if (Math.hypot(x * sx - sun.x, y * sy - sun.y) < 0.12 || planets.some((o) => Math.hypot(o.x - x * sx, o.y - y * sy) < o.z * 2.5 + 0.04)) continue;
    if (bright.some((o) => Math.hypot((o.x - x) * sx, (o.y - y) * sy) < 0.18)) continue;
    bright.push(new THREE.Vector4(x, y, s, rng()));
  }
  const nBright = bright.length; while (bright.length < 8) bright.push(new THREE.Vector4(9, 9, 0.001, 0));
  const bandAng = Math.atan2(-(fy - lay.ccy) * sy, (fx - lay.ccx) * sx) + Math.PI / 2 + rng.range(-0.4, 0.4);

  scene.add(backgroundQuad(/* glsl */`
    varying vec2 vUv;
    ${GLSL_AIR}
    uniform float uSeed, uDark, uNeb, uStars, uFlare, uSinI, uPhi, uBands; uniform vec2 uBand; uniform vec3 uSun, uL[6];
    uniform float uOrb[6]; uniform vec4 uPl[6], uBright[8]; uniform int uBrightN;
    uniform vec3 cBg, cNebA, cNebB, cBody, cPale, cAcc, cInk;
    void main(){
      vec2 p = vec2(vUv.x, 1.0 - vUv.y), q = p * uAsp, wq = q * 1.3 + uSeed;
      vec2 calm = calmAt(p, wq);
      vec2 pos = vec2(q.x - uSun.x, uSun.y - q.y); float rs = length(pos);              // from the sun, y up
      vec3 col = cBg;
      // ---- a thin veil of nebula through the system
      if (uNeb > 0.0) {
        vec2 nq = pos * 1.1 + vec2(uSeed * 1.7, -uSeed);
        float across = dot(pos, vec2(-uBand.y, uBand.x));
        float where = max(exp(-across * across / 0.12), 0.3 * exp(-rs * rs / 0.5)) * (1.0 - 0.97 * calm.y) * uNeb;
        vec2 w1 = vec2(fbm(nq * 0.9 + vec2(3.1, 0.0), 11u, 4), fbm(nq * 0.9 + vec2(0.0, 7.7), 15u, 4));
        float dA = smoothstep(-0.2, 0.5, fbm(nq * 1.25 + 1.15 * w1, 31u, 5)) * where, dB = smoothstep(-0.05, 0.55, fbm(nq * 2.1 - 0.9 * w1 + 9.0, 41u, 4)) * where;
        col = mix(col, cNebA, min(1.0, mix(0.9, 0.62, uDark) * dA));
        col = mix(col, cNebB, min(1.0, mix(0.7, 0.45, uDark) * dB * (0.3 + 0.7 * dA)));
      }
      vec4 st = stars(q, 0.0, calm.x, uDark, cBg, cInk, cNebA);
      col = mix(col, st.rgb, st.a * uStars);
      for (int i = 0; i < uBrightN; i++) {
        vec4 b = uBright[i]; float rr = length(q - b.xy * uAsp), s = b.z;
        float core = smoothstep(s * 0.5 + uPx, s * 0.5 - uPx, rr), halo = (0.5 * exp(-rr / (s * 1.3)) + 0.14 * exp(-rr / (s * 4.5))) * uFlare;
        col = mix(col, mix(vec3(1.0, 0.0, 0.0), mix(cAcc, cPale, b.w), mix(0.25, 0.5, 1.0 - uDark)), clamp(core + halo, 0.0, 1.0));
      }
      // ---- orbit lines: back halves first (behind the sun), front halves after it
      vec2 o = vec2(pos.x * cos(uPhi) + pos.y * sin(uPhi), -pos.x * sin(uPhi) + pos.y * cos(uPhi));   // into the plane's screen frame
      vec3 lineC = mix(mix(cPale, cAcc, 0.3), mix(cInk, cNebA, 0.4), 1.0 - uDark);
      float backA = 0.0, frontA = 0.0;
      for (int k = 0; k < 6; k++) {
        float a = uOrb[k]; if (a <= 0.0) continue;
        float b = a * uSinI, f = (o.x * o.x) / (a * a) + (o.y * o.y) / (b * b) - 1.0;
        vec2 g = vec2(2.0 * o.x / (a * a), 2.0 * o.y / (b * b)); float d = abs(f) / max(length(g), 1e-5);
        float w = uPx * 1.1, line = exp(-d * d / (w * w)) * 0.75 + 0.18 * exp(-d / (uPx * 6.0));
        if (o.y > 0.0) backA = max(backA, line * 0.55); else frontA = max(frontA, line);
      }
      float fadeL = 1.0 - smoothstep(0.0, 0.85, calm.y) * 0.95;
      col = mix(col, lineC, backA * 0.7 * fadeL);
      // ---- the sun: a plain disc, limb-darkened, with a soft round corona (no rays)
      float sr = uSun.z;
      vec3 sunC = mix(cPale, vec3(1.0, 0.0, 0.0), 0.35 * uDark);
      float cor = (0.55 * exp(-max(rs - sr, 0.0) / (sr * 0.35)) + 0.3 * exp(-max(rs - sr, 0.0) / (sr * 1.6)) + 0.14 * exp(-max(rs - sr, 0.0) / (sr * 6.0))) * uFlare;
      col = mix(col, mix(cAcc, cPale, 0.4), clamp(cor, 0.0, 1.0) * (1.0 - 0.8 * calm.x));
      float disc = smoothstep(uPx, -uPx, rs - sr);
      col = mix(col, mix(sunC, mix(cAcc, cPale, 0.5), smoothstep(0.3, 1.0, rs / sr) * 0.7), disc);
      col = mix(col, lineC, frontA * fadeL);
      // ---- planets
      for (int i = 0; i < 6; i++) {
        vec4 pl = uPl[i]; if (pl.z < 0.002) continue;
        vec2 mp = vec2(q.x - pl.x, pl.y - q.y); float r = length(mp), R = pl.z;
        bool ringed = pl.w > 9.0; float idx = mod(pl.w, 10.0);
        vec3 L = uL[i];
        // ring (Saturn-like), in the orbit plane: behind the planet on its upper half, in front on the lower
        float ringA = 0.0; vec3 ringC = mix(cPale, cBody, 0.4);
        if (ringed) {
          vec2 ro = vec2(mp.x * cos(uPhi) + mp.y * sin(uPhi), -mp.x * sin(uPhi) + mp.y * cos(uPhi));
          float rr = length(vec2(ro.x, ro.y / (uSinI * 1.25))) / R;
          ringA = smoothstep(1.35, 1.45, rr) * smoothstep(2.25, 2.15, rr) * (0.75 + 0.25 * sin(rr * 40.0)) * (1.0 - 0.9 * smoothstep(1.8, 1.84, rr) * smoothstep(1.9, 1.86, rr));
          if (ro.y > 0.0) col = mix(col, ringC, ringA * 0.85 * (1.0 - calm.x));
        }
        // halo of lit air
        float limb = smoothstep(-0.3, 0.6, dot(mp / max(r, 1e-5), normalize(L.xy + 1e-4)));
        col = mix(col, mix(cAcc, cPale, 0.5), clamp(0.4 * exp(-max(r - R, 0.0) / (R * 0.08)) * limb * uFlare, 0.0, 1.0) * step(R, r) * (1.0 - 0.85 * calm.x));
        if (r < R + 2.0 * uPx) {
          vec3 N = vec3(mp, sqrt(max(R * R - r * r, 0.0))) / R;
          vec3 base = idx < 1.0 ? mix(cBody, cPale, 0.3) : idx < 2.0 ? mix(cNebB, cPale, 0.35) : idx < 3.0 ? cBody : idx < 4.0 ? mix(cNebA, cPale, 0.45) : idx < 5.0 ? mix(cAcc, cBody, 0.5) : mix(cPale, cNebB, 0.3);
          float lat = N.y * cos(uPhi) - N.x * sin(uPhi);
          float lt = lat * (4.0 + idx * 1.3) * uBands + 0.5 * fbm(N.xy * 3.0 + idx * 7.0 + uSeed, 71u, 3);
          vec3 surf = mix(base, mix(base, cPale, 0.6), 0.5 * smoothstep(0.2, 0.9, 0.5 + 0.5 * sin(lt * 3.0)));
          surf = mix(surf, mix(base, cNebA, 0.4), 0.3 * smoothstep(0.4, 0.95, 0.5 + 0.5 * sin(lt * 7.0 + 1.0)));
          float ndl = dot(N, L), lit = smoothstep(-0.1, 0.4, ndl) * (0.75 + 0.25 * pow(max(N.z, 0.0), 0.5));
          vec3 night = mix(mix(cBg, surf, 0.3) * vec3(mix(0.9, 1.0, 1.0 - uDark), 1.0, 1.0), mix(surf, mix(cBg, cInk, 0.25), 0.55), 1.0 - uDark);
          night = mix(night, mix(cNebA, cAcc, 0.3), 0.18 * pow(1.0 - max(N.z, 0.0), 1.5));   // glow of the system on the dark limb
          vec3 pc = mix(night, surf, lit);
          pc = mix(pc, mix(cAcc, cPale, 0.5), 0.5 * pow(1.0 - max(N.z, 0.0), 2.5) * smoothstep(-0.05, 0.5, ndl));
          pc = mix(pc, mix(cBg, cNebA, 0.04), calm.x * 0.9);
          col = mix(col, pc, smoothstep(uPx, -uPx, r - R));
        }
        if (ringed) {
          vec2 ro = vec2(mp.x * cos(uPhi) + mp.y * sin(uPhi), -mp.x * sin(uPhi) + mp.y * cos(uPhi));
          if (ro.y <= 0.0) col = mix(col, ringC, ringA * 0.85 * (1.0 - calm.x));
        }
      }
      gl_FragColor = vec4(clamp(lab2lin(col), 0.0, 1.0), 1.0);
      #include <colorspace_fragment>
      gl_FragColor.rgb += airDither(gl_FragCoord.xy);
    }`, {
    uAsp: { value: new THREE.Vector2(sx, sy) }, uPx: { value: 1 / Math.min(W, H) }, uSeed: { value: (seed % 113) * 0.713 }, uDark: { value: K.dark ? 1 : 0 },
    uNeb: { value: P.nebula }, uStars: { value: P.stars }, uFlare: { value: P.flare }, uBands: { value: P.bands }, uSinI: { value: sinI }, uPhi: { value: phi },
    uBand: { value: new THREE.Vector2(Math.cos(bandAng), Math.sin(bandAng)) },
    uSun: { value: new THREE.Vector3(sun.x, sun.y, sun.r) }, uOrb: { value: orbits }, uPl: { value: pl }, uL: { value: lights },
    uBright: { value: bright }, uBrightN: { value: nBright },
    cBg: { value: K.bg }, cNebA: { value: K.nebA }, cNebB: { value: K.nebB }, cBody: { value: K.body }, cPale: { value: K.pale }, cAcc: { value: K.acc }, cInk: { value: K.ink },
    uBlock: { value: blockUniform(THREE, lay) }, uFoot: { value: lay.footer ? lay.footTop : 2 }, uHead: { value: lay.header ? lay.headBot : -1 },
  }));
  ctx.frame({ radius: 1, fov: 30, dir: [0, 0, 1] });
}
