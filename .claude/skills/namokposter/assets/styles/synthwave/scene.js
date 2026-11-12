// Synthwave — the 1980s retro-future as a full picture: a neon grid running in true perspective to a
// glowing horizon, a big sun at the focus whose lower half is cut by HORIZONTAL slits only (a plain disc
// with a round glow — nothing radiates from it), and in front of it a low-poly range, a canyon or a
// skyline. Faceted mountains are shaded like 80s chrome (sky above a hard horizon line, warm ground
// below), the glossy floor mirrors sun and city, and everything is bloomed softly.
//
// motif: sun (grid, sun, a distant chrome range) | city (skyline with lit windows, mirrored in the floor)
//        | canyon (wireframe walls on both sides, the sun in the gap)
// Palette: bg = upper sky (behind the copy) · colors[0] = sky towards the horizon
//          colors[1] = sun bottom, hot neon · colors[2] = grid and wire · colors[3] = sun top · accent = type
import { makeNoise, backgroundQuad, quietUniforms, GLSL_QUIET, makeComposer, finishPassShader, hdrClipPassShader, quietPassShader } from '/skill/assets/web/scene-lib.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export default function build(ctx) {
  const { THREE, scene, camera, rng, palette, params, unit, width: W, height: H, focus, seed } = ctx;
  const P = {
    motif: ['sun', 'city', 'canyon'].includes(params.motif) ? params.motif : 'sun',
    sun: clamp(params.sun ?? 1, 0.5, 1.6), slits: Math.round(clamp(params.slits ?? 6, 0, 10)), grid: clamp(params.grid ?? 1, 0.5, 2),
    glow: clamp(params.glow ?? 1, 0, 2), stars: clamp(params.stars ?? 1, 0, 2), chrome: clamp(params.chrome ?? 1, 0, 1.5), height: clamp(params.height ?? 1, 0.4, 1.6),
  };
  const cols = palette.colors?.length ? palette.colors : [palette.accent];
  const C = (i) => new THREE.Color(cols[Math.min(i, cols.length - 1)]);
  const bgc = new THREE.Color(palette.bg), dark = bgc.getHSL({}).l < 0.45;
  const cHor = C(0), cHot = C(1), cGrid = C(2), cSunT = C(3), white = new THREE.Color('#ffffff');
  const floorC = dark ? bgc.clone().multiplyScalar(0.42) : bgc.clone().lerp(cHor, 0.4);
  const noise = makeNoise(seed * 13 + 5);

  // ------------------------------------------------------------------ camera
  // The sun (radius 1) is at the origin, i.e. at the layout focus. The camera sits `sink` sun-radii below its
  // centre, so the horizon — eye level — cuts the disc that far under the middle; the floor is `hc` below the eye.
  const quiet = (ctx.quiet || []).map(([x0, y0, x1, y1]) => ({ x0, y0, x1, y1 }));
  const FOV = 44, frameR = 1.9 / P.sun;
  let dist = ctx.frame({ radius: frameR, fov: FOV, dir: [0, 0, 1] });
  const fpx = (Math.min(W, H) / 2) / Math.tan(THREE.MathUtils.degToRad(FOV) / 2), Rpx = fpx / dist;     // focal length and sun radius in px
  let sink = P.motif === 'city' ? 0.3 : P.motif === 'canyon' ? 0.36 : 0.42;
  // the horizon stays under a copy block that starts in the sky: the sun then stands higher above it (up to clear of it)
  const isStrip = (q) => q.x0 <= 0.02 && q.x1 >= 0.98;
  for (const q of quiet) if (!isStrip(q) && q.y0 < focus.y) sink = Math.max(sink, Math.min(1.22, ((q.y1 + 0.03 - focus.y) * H) / Rpx));
  dist = ctx.frame({ radius: frameR, fov: FOV, dir: [0, -sink / dist, 1] });
  const cell = 0.42 / P.grid, hc = 1.05, camY = camera.position.y, camZ = camera.position.z, groundY = camY - hc;
  camera.near = 0.05; camera.far = 600; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  const sunPx = new THREE.Vector2(focus.x * W, focus.y * H), horizonPx = sunPx.y + sink * Rpx;           // px from the top

  // how high (in sun radii above the horizon) anything may rise at a given place on the sheet: under the copy it stays low
  const capAt = (xf) => {
    let cap = 9;
    for (const q of quiet) {
      if (isStrip(q) || q.y0 * H > horizonPx) continue;                     // type lying on the floor (footer) does not limit the skyline
      const lim = Math.max(0, (horizonPx - (q.y1 + 0.025) * H) / Rpx), pad = (1.2 * Rpx) / W;
      const m = (q.x0 < 0.14 ? 1 : sstep(q.x0 - pad, q.x0, xf)) * (q.x1 > 0.86 ? 1 : 1 - sstep(q.x1, q.x1 + pad, xf));      // a block near the edge owns the margin too
      cap = Math.min(cap, lim + (1 - m) * 9);
    }
    return Math.max(cap, 0);
  };
  const screenX = (X, D) => focus.x + ((X / D) * fpx) / W;                    // sheet fraction of a world point at distance D along the view
  const topY = (s, D) => camY + (s * D) / dist;                               // world height that appears s sun-radii above the horizon at distance D

  // ------------------------------------------------------------------ shared GLSL: the sun
  const GLSL_SUN = /* glsl */`
    uniform vec3 uSunT, uSunB; uniform float uSlits, uRpx, uSunk;
    // p in sun radii from the centre, y up; blur in radii. A plain disc: a vertical gradient, and from a little
    // below the middle downwards horizontal gaps that widen towards the bottom. Returns colour and coverage.
    vec4 sunDisc(vec2 p, float blur){
      float aa = 1.0 / uRpx + blur, disc = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, length(p));
      vec3 col = mix(uSunB, uSunT, smoothstep(-uSunk - 0.05, 0.8, p.y));
      float top = 0.34, span = top + uSunk, y = (top - p.y) / span;           // 0 where the slits begin … 1 at the horizon
      if (uSlits > 0.5 && y > 0.0) {
        float k = y * uSlits, f = fract(k), gap = mix(0.2, 0.6, clamp(y, 0.0, 1.0)), w = uSlits / (span * uRpx) + blur * uSlits * 0.6;      // one px, in band units
        disc *= 1.0 - smoothstep(1.0 - gap - w, 1.0 - gap + w, f) * (1.0 - smoothstep(1.0 - w, 1.0, f) * step(w * 2.0, 1.0 - y));
      }
      return vec4(col, disc);
    }`;
  const sunUniforms = () => ({ uSunT: { value: cSunT }, uSunB: { value: cHot }, uSlits: { value: P.slits }, uRpx: { value: Rpx }, uSunk: { value: Math.min(sink, 1) } });
  const baseUniforms = () => ({
    uRes: { value: new THREE.Vector2(W, H) }, uSun: { value: sunPx }, uHy: { value: horizonPx }, uDark: { value: dark ? 1 : 0 }, uGlow: { value: P.glow },
    bg: { value: bgc }, cHor: { value: cHor }, cHot: { value: cHot }, cGrid: { value: cGrid }, cFloor: { value: floorC }, ...sunUniforms(), ...quietUniforms(ctx),
  });

  // ------------------------------------------------------------------ sky, stars, sun
  scene.add(backgroundQuad(/* glsl */`
    varying vec2 vUv; uniform vec3 bg, cHor, cHot, cGrid, cFloor; uniform vec2 uRes, uSun; uniform float uHy, uDark, uGlow, uStars, uUnit, uSeed;
    ${GLSL_QUIET}
    ${GLSL_SUN}
    vec3 h3(vec2 p){ vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yxz + 33.33); return fract((q.xxy + q.yzz) * q.zyx); }
    void main(){
      vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uRes, p = px / uRes;
      float e = (uHy - px.y) / uRpx;                                          // sun radii above the horizon
      float q = quietMask(p, 0.06);
      // sky: the palette background above, warming through the horizon colour to a thin hot band on the horizon
      float band = exp(-max(e, 0.0) / 1.7), low = exp(-max(e, 0.0) / 0.34);
      vec3 col = mix(bg, cHor, band * mix(0.72, 0.45, q));
      col = mix(col, mix(cHor, cHot, 0.55), low * 0.5 * (1.0 - 0.5 * q));
      // a round glow about the sun
      vec2 sp = vec2(px.x - uSun.x, uSun.y - px.y) / uRpx; float d = length(sp);
      vec3 glowC = mix(uSunB, cHor, 0.25);
      float g = (exp(-d * d / 6.0) * 0.1 + exp(-d * d / 1.6) * 0.2) * uGlow * (1.0 - 0.6 * q);
      col = mix(mix(col, mix(glowC, vec3(1.0), 0.5), g * 0.75), col + glowC * g, uDark);
      // stars: small, sparse, thinning towards the horizon and under the copy
      vec2 cellSz = vec2(uUnit * 2.6), id = floor(px / cellSz); vec3 hh = h3(id + uSeed);
      vec2 c = (id + 0.2 + 0.6 * hh.xy) * cellSz; float rs = uUnit * mix(0.045, 0.13, hh.z * hh.z);
      float star = step(1.0 - 0.1 * uStars, h3(id + 7.7 + uSeed).x) * (1.0 - smoothstep(rs - 0.6, rs + 0.6, length(px - c)));
      star *= smoothstep(0.7, 2.6, e) * smoothstep(1.02, 1.5, d) * mix(1.0, 0.3, q) * (0.35 + 0.65 * hh.z);
      col = mix(mix(col, cGrid, star * 0.5), col + mix(vec3(1.0), cGrid, 0.3) * star * 0.85, uDark);
      // the sun itself
      vec4 s = sunDisc(sp, 0.0);
      col = mix(col, s.rgb * mix(1.0, 0.86, uDark), s.a);
      if (e < 0.0) col = mix(cFloor, mix(cHor, cHot, 0.4), exp(e / 0.3) * 0.72);              // the floor's own tone, where the floor mesh ends
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }`, { ...baseUniforms(), uStars: { value: P.stars }, uUnit: { value: unit }, uSeed: { value: rng() * 100 } }));

  // ------------------------------------------------------------------ the floor: grid in perspective, sun mirrored in it
  const far = 320;
  const floorGeo = new THREE.BufferGeometry();
  floorGeo.setAttribute('position', new THREE.Float32BufferAttribute([-far, groundY, -far, far, groundY, -far, far, groundY, camZ + 2, -far, groundY, -far, far, groundY, camZ + 2, -far, groundY, camZ + 2], 3));
  const floor = new THREE.Mesh(floorGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { ...baseUniforms(), uCell: { value: cell }, uLine: { value: Math.max(1.1, unit * 0.2) }, uDist: { value: dist }, uSink: { value: sink }, uMirror: { value: P.motif === 'city' ? 0.62 : 1 } },
    vertexShader: 'varying vec3 vW; void main(){ vW = position; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      varying vec3 vW; uniform vec3 bg, cHor, cHot, cGrid, cFloor; uniform vec2 uRes, uSun; uniform float uHy, uDark, uGlow, uCell, uLine, uDist, uSink, uMirror;
      ${GLSL_QUIET}
      ${GLSL_SUN}
      // a ruled line of even pixel width: thinner than a pixel it dims instead of breaking up, and where the cells
      // become smaller than two pixels it settles to its average tone
      float rule(float x, float fw, float wpx){
        float w = wpx * fw, d = abs(fract(x - 0.5) - 0.5), hw = max(w, fw) * 0.5;
        float a = (1.0 - smoothstep(hw - fw * 0.5, hw + fw * 0.5, d)) * clamp(w / fw, 0.0, 1.0);
        return mix(a, min(w, 0.3), smoothstep(0.2, 0.5, fw));
      }
      void main(){
        vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uRes;
        vec2 g = vW.xz / uCell, fw = fwidth(g);
        float depth = distance(vW, cameraPosition), near = uDist / depth;        // 1 at the distance of the sun plane
        float wpx = uLine * clamp(pow(near, 0.6), 0.34, 1.7);
        float line = max(rule(g.x, fw.x, wpx), rule(g.y, fw.y, wpx));
        float fog = exp(-depth / (uDist * 4.5)), q = quietMask(p, 0.05);
        // the sheen of the horizon lies on the floor
        float e = (gl_FragCoord.y - (uRes.y - uHy)) / uRpx;                       // negative: below the horizon
        vec3 col = mix(cFloor, mix(cHor, cHot, 0.4), exp(e / 0.3) * 0.72);
        // the sun, mirrored about the horizon, stretched and softened — broken by the grid lines that cross it
        vec2 sp = vec2(gl_FragCoord.x - uSun.x, (uRes.y - gl_FragCoord.y) - uSun.y) / uRpx;      // y down from the sun centre
        vec2 mp = vec2(sp.x, 2.0 * uSink - sp.y); mp.y = (mp.y + 1.0) / 1.7 - 1.0;          // the mirror image, drawn out towards the viewer
        vec4 s = sunDisc(vec2(mp.x * (1.0 + 0.25 * smoothstep(-1.0, 1.0, mp.y)), mp.y), 0.02);
        float refl = s.a * 0.34 * uMirror * exp(e / 1.5) * (1.0 - 0.8 * q);
        col = mix(mix(col, s.rgb, refl * 0.8), col + s.rgb * refl, uDark);
        float gl = exp(-sp.x * sp.x / 3.0) * exp(e / 1.6) * 0.2 * uGlow * (1.0 - 0.7 * q);
        col = mix(mix(col, mix(uSunB, vec3(1.0), 0.4), gl), col + mix(uSunB, uSunT, 0.3) * gl, uDark);
        // grid
        float la = line * mix(0.12, 1.0, fog) * mix(1.0, 0.16, q);
        col = mix(mix(col, cGrid, la * 0.9), col + cGrid * la * 1.7 + vec3(1.0) * la * la * 0.25, uDark);
        gl_FragColor = vec4(col, (uMirror < 0.99 ? 0.52 : 1.0) + 0.5 * la);
        gl_FragColor.a = clamp(gl_FragColor.a, 0.0, 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  floor.frustumCulled = false; floor.renderOrder = 5; scene.add(floor);

  // ------------------------------------------------------------------ low-poly mountains with a neon wire and chrome facets
  const mountainMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { ...baseUniforms(), uDist: { value: dist }, uChrome: { value: P.chrome * (P.motif === 'canyon' ? 0.6 : 1) }, uWire: { value: Math.max(1.0, unit * (P.motif === 'canyon' ? 0.16 : 0.13)) }, uGround: { value: groundY } },
    vertexShader: 'attribute vec3 bary; varying vec3 vW, vB; void main(){ vW = position; vB = bary; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      varying vec3 vW, vB; uniform vec3 bg, cHor, cHot, cGrid, cFloor, uSunT, uSunB; uniform vec2 uRes; uniform float uDark, uDist, uChrome, uWire, uGround, uHy, uRpx;
      void main(){
        vec3 n = normalize(cross(dFdx(vW), dFdy(vW))); if (n.y < 0.0) n = -n;       // one normal per facet
        // chrome, the 80s way: each facet takes one tone from a ramp with a hard "horizon" in the middle — warm below it
        // (the sun's colours), a white flash on it, cool sky above — indexed by how squarely the facet faces the sun
        vec3 L = normalize(vec3(-sign(vW.x) * 0.85, 0.4, 0.35));
        float t = dot(n, L);
        vec3 matte = mix(cFloor, cHor, 0.2 + 0.28 * clamp(n.z, 0.0, 1.0));
        vec3 warm = mix(matte, mix(uSunB, uSunT, 0.25), smoothstep(0.12, 0.52, t));
        vec3 cool = mix(mix(vec3(0.92), uSunT, 0.3), mix(cGrid, bg, 0.55), smoothstep(0.52, 0.86, t));
        vec3 chrome = t < 0.52 ? warm : cool;
        vec3 col = mix(matte, chrome, clamp(uChrome * mix(0.7, 0.8, uDark), 0.0, 1.0));
        // wire: every edge of every triangle
        vec3 fw = fwidth(vB), a3 = smoothstep(fw * (uWire * 0.5 - 0.5), fw * (uWire * 0.5 + 0.5), vB);
        float wire = 1.0 - min(min(a3.x, a3.y), a3.z);
        float depth = distance(vW, cameraPosition), fog = exp(-depth / (uDist * 8.0));
        col = mix(mix(cHor, cHot, 0.3), col, mix(0.25, 1.0, fog));                 // far ranges sink into the horizon colour
        col = mix(mix(col, cGrid, wire * 0.85), col * (1.0 - 0.4 * wire) + cGrid * wire * (0.5 + 0.9 * fog), uDark);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  /** a strip of terrain: height(X, Z, D) in world units above the floor, cells of size cm from distance d0 to d1 */
  const terrain = (d0, d1, cm, halfW, height) => {
    const nx = Math.ceil((2 * halfW) / cm), nz = Math.ceil((d1 - d0) / cm), P3 = [];
    for (let iz = 0; iz <= nz; iz++) for (let ix = 0; ix <= nx; ix++) {
      const jx = ix > 0 && ix < nx ? rng.range(-0.3, 0.3) : 0, jz = iz > 0 && iz < nz ? rng.range(-0.3, 0.3) : 0;
      const X = -halfW + (ix + jx) * cm, D = d0 + (iz + jz) * cm, Z = camZ - D;
      P3.push([X, groundY - 0.03 + Math.max(0, height(X, Z, D)), Z]);
    }
    const pos = [], bary = [], at = (ix, iz) => P3[iz * (nx + 1) + ix];
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      const a = at(ix, iz), b = at(ix + 1, iz), c = at(ix + 1, iz + 1), d = at(ix, iz + 1);
      if (Math.max(a[1], b[1], c[1], d[1]) < groundY + 0.02) continue;          // flat cells are left to the floor grid
      const tris = (ix + iz) % 2 ? [[a, b, c], [a, c, d]] : [[a, b, d], [b, c, d]];
      for (const tri of tris) { for (const v of tri) pos.push(...v); bary.push(1, 0, 0, 0, 1, 0, 0, 0, 1); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('bary', new THREE.Float32BufferAttribute(bary, 3));
    const m = new THREE.Mesh(g, mountainMat); m.frustumCulled = false; m.renderOrder = 6; scene.add(m);
  };
  const ridge = (x, z, f) => { const n = 1 - Math.abs(noise.fbm(x * f, 3.7, z * f, 3, 2.1, 0.5) * 2.2); return clamp(n, 0, 1) ** 1.6 * 0.75 + 0.25 * clamp(0.5 + noise.noise3(x * f * 2.3, 9.1, z * f * 2.3), 0, 1); };

  if (P.motif === 'sun') {
    // a distant range across the horizon, dipping under the sun so the disc stays whole
    terrain(dist * 3.4, dist * 6.2, 1.5, dist * 6.5, (X, Z, D) => {
      const sx = (X / D) * dist, env = sstep(0.95, 2.5, Math.abs(sx)) * (0.6 + 0.4 * sstep(7.0, 3.0, Math.abs(sx)));
      const peak = hc + (Math.min(0.95 * P.height, capAt(screenX(X, D))) * D) / dist;                     // under the copy the whole range is lower, not cut off
      return peak * env * Math.pow(ridge(X, Z, 0.085), 1.25) * sstep(dist * 3.4, dist * 4.1, D) * sstep(dist * 6.2, dist * 5.4, D);
    });
  } else if (P.motif === 'canyon') {
    // walls of constant world height on either side of a corridor: tall beside the viewer, sinking to the horizon far away
    const corridor = 2.3;
    terrain(1.4, dist * 9, 0.95, 24, (X, Z, D) => {
      const side = Math.abs(X) - corridor, m = sstep(0, 3.4, side), peak = Math.min(1.3 + 3.6 * P.height * m, Math.max(0.2, hc + (capAt(screenX(X, D)) * D) / dist));
      return peak * ridge(X, Z, 0.12) * sstep(-0.2, 0.9, side);
    });
  } else {
    // ---- city: three rows of towers on the horizon, lit windows, mirrored in the floor
    const pos = [], nrm = [], uvw = [], bid = [], fogA = [], dims = [];
    const quad = (a, b, c, d, n, w, h, id, fg) => { for (const [v, u] of [[a, [0, 0]], [b, [w, 0]], [c, [w, h]], [a, [0, 0]], [c, [w, h]], [d, [0, h]]]) { pos.push(...v); nrm.push(...n); uvw.push(...u); bid.push(id); fogA.push(fg); dims.push(w, h); } };
    const tower = (X, D, w, dp, top, fg) => {
      const Z = camZ - D, x0 = X - w / 2, x1 = X + w / 2, z0 = Z + dp / 2, z1 = Z - dp / 2, y0 = groundY, y1 = Math.max(top, groundY + 0.05), id = rng() * 100;
      const win = 0.16 * (D / (dist * 3)), cw = Math.max(2, Math.round(w / win)), cd = Math.max(2, Math.round(dp / win)), ch = Math.max(1, Math.round((y1 - y0) / (win * 1.25)));
      quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, 1], cw, ch, id, fg);
      quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0], cd, ch, id + 1.7, fg);
      quad([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [-1, 0, 0], cd, ch, id + 3.1, fg);
      quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], 0, 0, id, fg);
      return y1;
    };
    const art = focus.x >= 0.5 ? 1 : -1;                                        // which side of the sun has room for the tall towers
    [[dist * 5.2, 0.5, 1.0], [dist * 3.9, 0.25, 0.86], [dist * 2.9, 0.0, 0.62]].forEach(([D, fg, scale], row) => {
      const halfW = (D / fpx) * W * 0.75; let X = -halfW + rng.range(0, 0.4);
      while (X < halfW) {
        const sw = rng.range(0.16, 0.42) * (row === 2 ? 1.25 : 1), w = (sw * D) / dist, sx = ((X + w / 2) / D) * dist, a = Math.abs(sx);
        // skyline envelope in sun radii above the horizon: low in front of the disc, a cluster of towers beside it, tapering outwards
        let env = 0.34 + 0.5 * sstep(0.75, 1.5, a) * sstep(4.6, 2.2, a) + 0.75 * Math.exp(-(((sx * art - 1.75) / 0.62) ** 2)) + 0.4 * Math.exp(-(((sx * art + 1.9) / 0.7) ** 2));
        env *= P.height * scale * (0.55 + 0.6 * rng() * rng() + (rng() < 0.13 ? 0.35 : 0));
        if (a < 1.0) env = Math.min(env, 0.1 + 0.2 * rng());
        const cap = capAt(screenX(X + w / 2, D));
        // under the copy the city is a low strip that stays below the horizon line
        const s = cap < 0.1 ? -rng.range(0.25, 0.8) * ((hc * dist) / D) : Math.min(Math.max(env, 0.08), cap * (cap < 2 ? rng.range(0.45, 1) : 1));
        if ((s > 0.05 || (cap < 0.1 && row < 2)) && rng() > (row === 2 ? 0.22 : 0.08)) {
          const top = tower(X + w / 2, D, w, w * rng.range(0.7, 1.2), topY(s, D), fg);
          if (rng() < 0.3 && s > 0.5) { const w2 = w * rng.range(0.4, 0.62); tower(X + w / 2 + rng.range(-0.15, 0.15) * w, D, w2, w2, top + (rng.range(0.08, 0.2) * D) / dist, fg); }
        }
        X += w * rng.range(1.02, 1.3);
      }
    });
    const g = new THREE.BufferGeometry(), f = (a, n) => new THREE.Float32BufferAttribute(a, n);
    g.setAttribute('position', f(pos, 3)); g.setAttribute('normal', f(nrm, 3)); g.setAttribute('uvw', f(uvw, 2)); g.setAttribute('bid', f(bid, 1)); g.setAttribute('fogA', f(fogA, 1)); g.setAttribute('dims', f(dims, 2));
    const cityMat = (mirror) => new THREE.ShaderMaterial({
      side: THREE.DoubleSide, transparent: mirror, depthWrite: !mirror,
      uniforms: { ...baseUniforms(), uGround: { value: groundY }, uMirror: { value: mirror ? 1 : 0 }, uDist: { value: dist }, uChrome: { value: P.chrome } },
      vertexShader: /* glsl */`
        attribute vec2 uvw, dims; attribute float bid, fogA; uniform float uGround, uMirror; varying vec2 vUvw, vDims; varying float vId, vFog, vH; varying vec3 vN;
        void main(){ vec3 p = position; vH = p.y - uGround; if (uMirror > 0.5) p.y = 2.0 * uGround - p.y; vUvw = uvw; vDims = dims; vId = bid; vFog = fogA; vN = normal; gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
      fragmentShader: /* glsl */`
        varying vec2 vUvw, vDims; varying float vId, vFog, vH; varying vec3 vN;
        uniform vec3 bg, cHor, cHot, cGrid, cFloor, uSunT, uSunB; uniform float uDark, uMirror, uDist, uChrome;
        float h1(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
        void main(){
          // walls: near-black, tinted by the horizon colour with distance; the flank turned to the sun carries a chrome sheen
          vec3 wall = mix(mix(cFloor * 0.9, bg * 0.3, uDark), mix(cHor, cFloor, 0.5), vFog * 0.8);
          float side = abs(vN.x), up = vN.y;
          float sheen = smoothstep(0.0, 1.0, fract(vH * 0.33 + vId)) ;
          vec3 chrome = mix(mix(cHot, uSunT, 0.4), cGrid, step(0.5, sheen)) * mix(0.25, 0.6, abs(sheen - 0.5) * 2.0);
          wall = mix(wall, chrome, side * 0.3 * uChrome * (1.0 - vFog * 0.6));
          wall = mix(wall, mix(cHor, cHot, 0.4), exp(-vH / (0.05 * uDist)) * 0.4);                      // haze glowing at the foot
          vec3 col = wall;
          if (up < 0.5 && vUvw.x + vUvw.y > 0.0) {
            vec2 id = floor(vUvw), f = fract(vUvw), fw = fwidth(vUvw);
            float on = step(0.86, h1(id + vId * 13.0)) + step(0.94, h1(vec2(id.y, floor(vId * 7.0)))) * step(0.35, h1(id + 3.0));     // single windows, and whole floors
            float m = smoothstep(0.24, 0.24 + fw.x, f.x) * smoothstep(0.76, 0.76 - fw.x, f.x) * smoothstep(0.3, 0.3 + fw.y, f.y) * smoothstep(0.7, 0.7 - fw.y, f.y);
            m *= 1.0 - smoothstep(0.35, 0.7, max(fw.x, fw.y));                                           // too small to draw: leave the wall dark
            vec3 lightC = h1(id.yx + vId) < 0.55 ? cGrid : mix(cHot, uSunT, step(0.6, h1(id + 9.0)));
            float lit = clamp(on, 0.0, 1.0) * m;
            col = mix(mix(wall, lightC, lit * 0.9), wall + lightC * lit * mix(1.15, 0.6, vFog), uDark);
          }
          // a neon outline along the roof and the corners of every tower
          if (up < 0.5 && vDims.x > 0.0) {
            vec2 fw2 = fwidth(vUvw); float dTop = (vDims.y - vUvw.y) / fw2.y, dSide = min(vUvw.x, vDims.x - vUvw.x) / fw2.x;
            float edge = max(1.0 - smoothstep(0.6, 1.9, dTop), (1.0 - smoothstep(0.4, 1.4, dSide)) * 0.55) * mix(1.0, 0.45, vFog);
            col = mix(mix(col, cGrid, edge * 0.8), col + mix(cGrid, cHot, 0.3) * edge * 1.3, uDark);
          }
          float a = 1.0;
          if (uMirror > 0.5) { a = 0.85 * exp(-vH / (0.16 * uDist)); }
          gl_FragColor = vec4(col, a);
          #include <colorspace_fragment>
        }`,
    });
    const refl = new THREE.Mesh(g, cityMat(true)); refl.frustumCulled = false; refl.renderOrder = 3; scene.add(refl);
    const city = new THREE.Mesh(g, cityMat(false)); city.frustumCulled = false; city.renderOrder = 6; scene.add(city);
  }

  // ------------------------------------------------------------------ finish: soft bloom, footer strip calmed, gentle vignette
  return makeComposer(ctx, {
    samples: 4,
    bloom: dark && P.glow > 0 ? { strength: 0.36 * P.glow, radius: 0.55, threshold: 0.66 } : false,
    linear: [hdrClipPassShader({ keep: 0.85 }), quietPassShader(ctx, 0.5, 0.05, { skipCopy: true })],
    display: [finishPassShader(ctx, { vignette: dark ? 0.3 : 0.1, center: ctx.focus, contrast: 0.06 })],
  });
}
