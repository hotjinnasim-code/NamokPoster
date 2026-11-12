// Silk Ribbon — one closed band of glossy colour twisting through space.
// A smooth closed curve (three harmonics; the best of a few dozen seeded candidates) is swept with a
// lens-shaped cross-section whose width and twist change along the loop, while the colour travels once
// round the palette. Satin-gloss physical material lit by a palette environment; a soft pool of the
// same colours sits on the backdrop behind it.
// params: form (eight | ring | knot), twist, width, thickness, gloss, glow — see style.json.
import { paletteEnvironment, backgroundQuad, quietUniforms, GLSL_QUIET } from '/skill/assets/web/scene-lib.js';

const TAU = Math.PI * 2;

export default function build(ctx) {
  const { THREE, scene, renderer, rng, palette, params, aspect, focus, artSize } = ctx;
  const cols = palette.colors?.length ? palette.colors : [palette.accent];
  const bgc = new THREE.Color(palette.bg), dark = bgc.getHSL({}).l < 0.35;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const P = { width: params.width ?? 1, thickness: params.thickness ?? 0.2, twist: params.twist ?? 1, gloss: params.gloss ?? 1, glow: params.glow ?? 1 };

  // ------------------------------------------------------------------ 1. centre line
  const randUnit = () => { const z = rng.range(-1, 1), a = rng() * TAU, r = Math.sqrt(1 - z * z); return V(r * Math.cos(a), r * Math.sin(a), z); };
  const form = String(params.form ?? 'eight');
  function candidate() {
    const e1 = randUnit(), e2 = randUnit().cross(e1).normalize(), e3 = e1.clone().cross(e2);
    const jit = (amp) => randUnit().multiplyScalar(amp);
    if (form === 'knot') {   // trefoil: three lobes that pass over and under each other
      return [
        { a: e2.clone().add(jit(0.14)), b: e1.clone().add(jit(0.14)) },
        { a: e2.clone().multiplyScalar(-2).add(jit(0.16)), b: e1.clone().multiplyScalar(2).add(jit(0.16)) },
        { a: jit(0.1), b: e3.clone().multiplyScalar(-rng.range(0.8, 1.2)) },
      ];
    }
    if (form === 'eight') {   // a figure of eight whose two strands cross at different depths
      return [
        { a: e1.clone(), b: e3.clone().multiplyScalar(rng.range(0.3, 0.4)).add(jit(0.06)) },
        { a: jit(0.08), b: e2.clone().multiplyScalar(rng.range(0.52, 0.66)) },
        { a: jit(0.05), b: jit(0.05) },
      ];
    }
    const lift = (amp) => e3.clone().multiplyScalar(amp * rng.range(0.55, 1) * rng.sign()).add(randUnit().multiplyScalar(amp * 0.55));
    return [
      { a: e1, b: e2.multiplyScalar(rng.range(0.72, 1)) },
      { a: lift(rng.range(0.22, 0.46)), b: lift(rng.range(0.22, 0.46)) },
      { a: lift(rng.range(0.03, 0.13)), b: lift(rng.range(0.03, 0.13)) },
    ];
  }
  /** n points evenly spaced by arc length along the closed curve, centred, farthest point at distance 1 */
  function resample(h, n) {
    const m = n * 4, raw = [], acc = [0];
    for (let i = 0; i <= m; i++) {
      const t = (i / m) * TAU, p = V();
      h.forEach((c, k) => p.addScaledVector(c.a, Math.cos((k + 1) * t)).addScaledVector(c.b, Math.sin((k + 1) * t)));
      raw.push(p); if (i) acc.push(acc[i - 1] + p.distanceTo(raw[i - 1]));
    }
    const L = acc[m], out = []; let j = 0;
    for (let i = 0; i < n; i++) {
      const s = (i / n) * L; while (acc[j + 1] < s) j++;
      out.push(raw[j].clone().lerp(raw[j + 1], (s - acc[j]) / (acc[j + 1] - acc[j] || 1)));
    }
    const c = V(); out.forEach((p) => c.add(p)); c.multiplyScalar(1 / n);
    for (let k = 1; k <= 80; k++) { let far = out[0]; for (const p of out) if (p.distanceToSquared(c) > far.distanceToSquared(c)) far = p; c.lerp(far, 1 / (k + 1)); }   // ≈ smallest enclosing sphere
    let R = 0; out.forEach((p) => { p.sub(c); R = Math.max(R, p.length()); });
    out.forEach((p) => p.multiplyScalar(1 / R));
    return { pts: out, ds: L / R / n };
  }
  /** per-point curvature and clearance (distance to the nearest other strand of the loop) */
  function measure({ pts, ds }) {
    const n = pts.length, skip = Math.round(n * 0.15), curv = new Float32Array(n), clear = new Float32Array(n), tan = [];
    for (let i = 0; i < n; i++) tan.push(pts[(i + 1) % n].clone().sub(pts[(i + n - 1) % n]).normalize());
    for (let i = 0; i < n; i++) {
      curv[i] = tan[(i + 1) % n].distanceTo(tan[(i + n - 1) % n]) / (2 * ds);
      let d2 = 1e9;
      for (let j = i + skip; j <= i + n - skip; j++) d2 = Math.min(d2, pts[i].distanceToSquared(pts[j % n]));
      clear[i] = Math.sqrt(d2);
    }
    return { tan, curv, clear };
  }
  /** principal axes of the point cloud, largest spread first */
  function axes(pts) {
    const C = [0, 0, 0, 0, 0, 0];
    for (const p of pts) { C[0] += p.x * p.x; C[1] += p.x * p.y; C[2] += p.x * p.z; C[3] += p.y * p.y; C[4] += p.y * p.z; C[5] += p.z * p.z; }
    const mul = (m, v) => V(m[0] * v.x + m[1] * v.y + m[2] * v.z, m[1] * v.x + m[3] * v.y + m[4] * v.z, m[2] * v.x + m[4] * v.y + m[5] * v.z);
    const power = (m) => { let v = V(0.61, 0.53, 0.59), l = 0; for (let i = 0; i < 60; i++) { v = mul(m, v); l = v.length(); v.multiplyScalar(1 / (l || 1)); } return [v, l]; };
    const [a1, l1] = power(C), tr = C[0] + C[3] + C[5];
    const [a3, k3] = power([tr - C[0], -C[1], -C[2], tr - C[3], -C[4], tr - C[5]]);
    const l3 = tr - k3, l2 = tr - l1 - l3;
    a3.addScaledVector(a1, -a3.dot(a1)).normalize();
    return { a1, a2: a3.clone().cross(a1).normalize(), a3, l1, l2, l3 };
  }
  let best = null;
  for (let k = 0; k < 48; k++) {
    const h = candidate(), rs = resample(h, 180), m = measure(rs), ax = axes(rs.pts);
    const cmin = Math.min(...m.clear), kmax = Math.max(...m.curv);
    const score = Math.min(1, cmin / 0.46) ** 2 * Math.min(1, (form === 'ring' ? 2.2 : 3.0) / kmax) ** 3 * Math.min(1, Math.sqrt(ax.l3 / ax.l1) / 0.36) * Math.min(1, Math.sqrt(ax.l2 / ax.l1) / 0.72);
    if (!best || score > best.score) best = { h, score };
  }

  const N = 900, M = 44;
  const line = resample(best.h, N), geo0 = measure(line), ax = axes(line.pts);
  // orient: widest spread across the picture, thinnest towards the camera, then a seeded tilt so depth shows
  const basis = new THREE.Matrix4().makeBasis(ax.a1, ax.a2, ax.a1.clone().cross(ax.a2)).transpose();
  const tilt = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rng.range(0.3, 0.62) * rng.sign(), rng.range(-0.5, 0.5), rng.range(-0.55, 0.55) + (rng() < 0.5 ? Math.PI : 0), 'ZYX'));
  const orient = tilt.multiply(basis);
  line.pts.forEach((p) => p.applyMatrix4(orient)); geo0.tan.forEach((t) => t.transformDirection(orient));

  // ------------------------------------------------------------------ 2. frames: rotation-minimising, closed, then twisted
  const T = geo0.tan, R = [V()], ds = line.ds;
  { const t0 = T[0], up = Math.abs(t0.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0); R[0].copy(up).addScaledVector(t0, -up.dot(t0)).normalize(); }
  for (let i = 0; i < N; i++) {   // double reflection (Wang et al. 2008)
    const j = (i + 1) % N, v1 = line.pts[j].clone().sub(line.pts[i]), c1 = v1.lengthSq();
    const rL = R[i].clone().addScaledVector(v1, (-2 / c1) * v1.dot(R[i])), tL = T[i].clone().addScaledVector(v1, (-2 / c1) * v1.dot(T[i]));
    const v2 = T[j].clone().sub(tL), c2 = v2.lengthSq();
    R[i + 1] = rL.addScaledVector(v2, (-2 / c2) * v2.dot(rL)).normalize();
  }
  const closing = Math.atan2(R[0].clone().cross(R[N]).dot(T[0]), R[0].dot(R[N]));   // holonomy: how far the frame has turned after one lap
  const Rc = [], Sc = [], bend = new Float32Array(N), kap = new Float32Array(N);
  for (let i = 0; i < N; i++) {   // spread the holonomy evenly → a frame that closes on itself
    const a = -closing * (i / N), s0 = T[i].clone().cross(R[i]);
    Rc.push(R[i].clone().multiplyScalar(Math.cos(a)).addScaledVector(s0, Math.sin(a))); Sc.push(T[i].clone().cross(Rc[i]));
    const kv = T[(i + 1) % N].clone().sub(T[(i + N - 1) % N]).multiplyScalar(1 / (2 * ds));
    kap[i] = kv.length(); bend[i] = Math.atan2(kv.dot(Sc[i]), kv.dot(Rc[i]));   // direction the curve bends towards, in this frame
  }
  // Twist: a chosen number of half turns per lap plus a slow wobble. Its phase is searched so that tight bends
  // are taken the way a real band takes them — across its width, never in its own plane (which reads as a kink).
  const halfTurns = Math.round(P.twist * 2), th = new Float32Array(N), dir = rng.sign(), jitter = rng() * Math.PI;
  const angle = (o, u) => o.th0 + dir * halfTurns * Math.PI * u + o.wob * Math.sin(TAU * u + o.wph);
  let pick = null;
  for (let a = 0; a < 24; a++) for (let b = 0; b < 8; b++) for (const wob of [0.16, 0.3, 0.44]) {
    const o = { th0: jitter + (a / 24) * Math.PI, wph: jitter + (b / 8) * TAU, wob, cost: 0 };
    for (let i = 0; i < N; i += 4) o.cost += (kap[i] * Math.sin(bend[i] - angle(o, i / N))) ** 4;
    if (!pick || o.cost < pick.cost) pick = o;
  }
  for (let i = 0; i < N; i++) th[i] = angle(pick, i / N);
  const Nrm = [], Bin = [], kgeo = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    Nrm.push(Rc[i].clone().multiplyScalar(Math.cos(th[i])).addScaledVector(Sc[i], Math.sin(th[i])));
    Bin.push(T[i].clone().cross(Nrm[i]).normalize());
    kgeo[i] = kap[i] * Math.abs(Math.sin(bend[i] - th[i]));   // what is left of in-plane bending
  }

  // ------------------------------------------------------------------ 3. width: a slow swell, held back near other strands and in-plane bends
  const half = new Float32Array(N), w0 = 0.2 * P.width, f1 = rng() * TAU, f2 = rng() * TAU;
  const limit = new Float32Array(N), win = Math.round(N * 0.035);
  for (let i = 0; i < N; i++) limit[i] = Math.min(0.46 * geo0.clear[i], 0.6 / Math.max(kgeo[i], 1e-3));
  for (let i = 0; i < N; i++) {   // erode, then blur: stays under the limit everywhere but changes smoothly
    let s = 0;
    for (let a = -win; a <= win; a++) { let lo = 1e9; for (let b = -win; b <= win; b++) lo = Math.min(lo, limit[(i + a + b + 2 * N) % N]); s += lo; }
    const cap = s / (2 * win + 1), u = (i / N) * TAU;
    const want = w0 * (1 + 0.36 * Math.sin(u + f1) + 0.2 * Math.sin(2 * u + f2));
    half[i] = -Math.log(Math.exp(-want * 14) + Math.exp(-cap * 14)) / 14;   // smooth minimum
  }
  // Fit to what the camera sees. A band is rarely round, so it is fitted as a box: its silhouette (perspective
  // included) is centred on the origin and handed to frame() as width × height, which makes it as large as the
  // art area of the layout allows — a wide figure of eight fills a wide space instead of a small circle in it.
  // The radius of the same silhouette goes along for runners that only fit a bounding circle.
  const FOV = 24, PAD = 1.1, tanH = Math.tan(THREE.MathUtils.degToRad(FOV) / 2), short = Math.min(ctx.width, ctx.height);
  const rect = ctx.artRect, artW = rect ? (rect[2] - rect[0]) * ctx.width : 0, artH = rect ? (rect[3] - rect[1]) * ctx.height : 0;
  const edge = []; for (let i = 0; i < N; i += 2) for (const sg of [-1, 1]) edge.push(line.pts[i].clone().addScaledVector(Bin[i], sg * half[i]));
  let zlo = 1e9, zhi = -1e9; edge.forEach((e) => { zlo = Math.min(zlo, e.z); zhi = Math.max(zhi, e.z); });
  const mid = V(0, 0, (zlo + zhi) / 2); let boxW = 2, boxH = 2, rad = 1, camDist = 9, onScreen = artSize;
  for (let it = 0; it < 6; it++) {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; const pr = [];
    for (const e of edge) { const k = camDist / (camDist - (e.z - mid.z)), x = (e.x - mid.x) * k, y = (e.y - mid.y) * k; pr.push([x, y]); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    mid.x += cx; mid.y += cy; boxW = x1 - x0; boxH = y1 - y0; rad = 0;
    for (const [x, y] of pr) rad = Math.max(rad, Math.hypot(x - cx, y - cy));
    const ppu = rect ? Math.min(artW / (boxW * PAD), artH / (boxH * PAD)) : (artSize * short) / (2 * rad * PAD);   // px per world unit, as frame() will set it
    camDist = short / (2 * ppu * tanH); onScreen = (Math.max(boxW, boxH) * ppu) / short;
  }
  line.pts.forEach((p) => p.sub(mid));

  // ------------------------------------------------------------------ 4. colour along the loop (cyclic, mixed in OKLab so mid-tones stay clean)
  const toLab = (c) => { const l = Math.cbrt(0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b), m = Math.cbrt(0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b), s = Math.cbrt(0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]; };
  const fromLab = ([L, a, b]) => { const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [Math.max(0, 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), Math.max(0, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), Math.max(0, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)]; };
  const labs = cols.map((c) => toLab(new THREE.Color(c))), nc = labs.length, cph = rng();
  const colourAt = (u) => {
    const x = (((u + cph) % 1) + 1) % 1 * nc, i = Math.floor(x), f = x - i, e = f * f * (3 - 2 * f), a = labs[i % nc], b = labs[(i + 1) % nc];
    return fromLab([a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e]);
  };

  // ------------------------------------------------------------------ 5. mesh
  const pos = new Float32Array(N * M * 3), col = new Float32Array(N * M * 3), idx = new Uint32Array(N * M * 6);
  const p = V();
  for (let i = 0; i < N; i++) {
    const w = half[i], h = Math.max(0.012, w * P.thickness);
    for (let j = 0; j < M; j++) {
      const a = (j / M) * TAU, k = i * M + j, ca = Math.cos(a), sa = Math.sin(a);
      p.copy(line.pts[i]).addScaledVector(Bin[i], ca * w).addScaledVector(Nrm[i], sa * h);
      pos.set([p.x, p.y, p.z], k * 3);
      col.set(colourAt(i / N + (ca * ca - 0.5) * 0.05), k * 3);   // edges run slightly ahead of the middle, so broad faces are not flat colour
    }
  }
  const shift = (halfTurns & 1) ? M / 2 : 0;   // an odd number of half turns closes like a Möbius band
  let q = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
    const i1 = (i + 1) % N, o = i1 === 0 ? shift : 0;
    const a = i * M + j, b = i * M + (j + 1) % M, c = i1 * M + (j + o) % M, d = i1 * M + (j + 1 + o) % M;
    idx.set([a, c, b, b, c, d], q); q += 6;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();

  scene.environment = paletteEnvironment(renderer, cols, { base: dark ? '#0b0b12' : '#f3f1ee', rng, blobs: 9, intensity: dark ? 0.95 : 1 });
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = dark ? 1.1 : 1.05;
  const silk = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.3 / P.gloss, metalness: 0.42, clearcoat: 0.9, clearcoatRoughness: 0.14,
    iridescence: 0.55, iridescenceIOR: 1.5, iridescenceThicknessRange: [240, 520],
    sheen: 0.6, sheenRoughness: 0.45, sheenColor: new THREE.Color(cols[1 % nc]),
    envMapIntensity: dark ? 1.25 : 1.05,
  });
  // where type sits, the band dissolves into the background (matters when the copy is laid over the art)
  const qu = { ...quietUniforms(ctx), uQBg: { value: bgc.clone().convertLinearToSRGB() }, uQRes: { value: new THREE.Vector2(ctx.width, ctx.height) } };
  silk.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, qu);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL_QUIET}\nuniform vec3 uQBg; uniform vec2 uQRes;`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uQBg, 0.72 * quietMask(vec2(gl_FragCoord.x / uQRes.x, 1.0 - gl_FragCoord.y / uQRes.y), 0.08));`);
  };
  scene.add(new THREE.Mesh(geo, silk));

  const key = new THREE.DirectionalLight('#ffffff', 2.4); key.position.set(-2.2, 3.6, 3.4); scene.add(key);
  const rim = new THREE.DirectionalLight(cols[1 % nc], 2.0); rim.position.set(3, -1.2, -2.4); scene.add(rim);
  const fill = new THREE.DirectionalLight(cols[2 % nc], 0.8); fill.position.set(2.4, 0.6, 3); scene.add(fill);

  // ------------------------------------------------------------------ 6. backdrop: a soft pool of palette colour behind the sculpture
  const C = (i) => new THREE.Color(cols[i % nc]);
  const off = (r) => { const a = rng() * TAU; return new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r); };
  scene.add(backgroundQuad(/* glsl */`
    varying vec2 vUv; uniform vec3 bg, c0, c1, c2; uniform vec2 focus, o0, o1, o2; uniform float aspect, size, dark, glow;
    ${GLSL_QUIET}
    vec3 hash3(vec2 p){ vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yxz + 33.33); return fract((q.xxy + q.yzz) * q.zyx); }
    void main(){
      vec2 p = vec2(vUv.x, 1.0 - vUv.y);
      vec2 q = (p - focus) * vec2(max(aspect, 1.0), max(1.0 / aspect, 1.0)) / size;   // 1.0 = diameter of the subject
      float g0 = exp(-dot(q - o0, q - o0) / 0.16), g1 = exp(-dot(q - o1, q - o1) / 0.11), g2 = exp(-dot(q - o2, q - o2) / 0.09);
      float sum = g0 + g1 + g2 + 1e-4;
      vec3 tint = (c0 * g0 + c1 * g1 + c2 * g2) / sum;
      float m = (1.0 - exp(-sum * 1.1)) * glow * (1.0 - 0.94 * quietMask(p, 0.12));
      vec3 col = mix(mix(bg, tint, m * 0.34), bg + (c0 * g0 * 0.6 + c1 * g1 * 0.4 + c2 * g2 * 0.3) * 0.17 * glow * (1.0 - 0.94 * quietMask(p, 0.12)), dark);
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
      gl_FragColor.rgb += (hash3(gl_FragCoord.xy) + hash3(gl_FragCoord.xy + 59.3) - 1.0) / 255.0;   // ±1 LSB dither: no banding in the 8-bit file
    }`, {
    bg: { value: bgc }, c0: { value: C(0) }, c1: { value: C(1) }, c2: { value: C(2) },
    o0: { value: off(0.16) }, o1: { value: off(0.3) }, o2: { value: off(0.34) },
    focus: { value: new THREE.Vector2(focus.x, focus.y) }, aspect: { value: aspect }, size: { value: onScreen },
    dark: { value: dark ? 1 : 0 }, glow: { value: P.glow }, ...quietUniforms(ctx),
  }));

  ctx.frame({ radius: rad * PAD, width: boxW * PAD, height: boxH * PAD, fov: FOV, dir: [0, 0, 1] });
}
