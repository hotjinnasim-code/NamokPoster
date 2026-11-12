// Point Cloud Stipple — a form drawn only with dots. The surface is sampled evenly (area-weighted, one jittered
// sample per cell of its parameter grid), each dot carries an ordered-dither threshold, and the light decides
// which dots are drawn and how big: on a pale ground the dots are ink and gather in the shadows and along the
// contours, like a stippled engraving; on a dark ground they are light and gather where the form is lit, like
// a 3D scan. An invisible copy of the surface fills the depth buffer, so hidden dots stay hidden.
// params.motif:
//   knot     a torus-knot sculpture
//   terrain  a block of mountain terrain cut out like a scan specimen, its walls showing the strata
//   vase     an amphora-like lathe form standing on its stippled shadow
//   shell    a conical sea shell, its whorls winding up to the tip
// Palette: bg = the ground · colors[0] = dots in shadow (pale) or dim dots (dark) · colors[1] = mid-tone dots ·
//          colors[2] = the brightest / accent dots
import { backgroundQuad, quietUniforms, GLSL_QUIET, makeNoise } from '/skill/assets/web/scene-lib.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const TAU = Math.PI * 2;

export default function build(ctx) {
  const { THREE, scene, rng, palette, params, aspect, unit, width: W, height: H, seed } = ctx;
  const P = {
    motif: String(params.motif ?? 'knot'), dot: clamp(params.dot ?? 1, 0.4, 2.5), contrast: clamp(params.contrast ?? 1, 0.3, 2),
    contour: clamp(params.contour ?? 1, 0, 2), color: clamp(params.color ?? 1, 0, 1),
  };
  const cols = palette.colors?.length ? palette.colors : [palette.ink];
  const C = (i) => new THREE.Color(cols[Math.min(i, cols.length - 1)]);
  const bgc = new THREE.Color(palette.bg), dark = bgc.getHSL({}).l < 0.4;
  const sx = Math.max(aspect, 1), sy = Math.max(1 / aspect, 1);
  const copy = ctx.quiet?.[0], ccx = copy ? (copy[0] + copy[2]) / 2 : 0.3;
  const side = Math.abs(ctx.focus.x - ccx) < 0.1 ? (rng() < 0.5 ? -1 : 1) : ctx.focus.x > ccx ? 1 : -1;
  const noise = makeNoise(seed * 3 + 17);

  // ---- surfaces: f(u, v) → [x, y, z], u, v in 0..1; 'wrapU'/'wrapV' close the grid
  const surfaces = []; let R = 1.2, dir = [0, 0.12, 1], rot = [0, 0, 0], ground = null, fitK = 0.97;
  const m = P.motif;
  if (m === 'terrain') {
    const S = 1.25, base = -0.42;
    const hgt = (x, z) => {
      const r = Math.hypot(x * 0.8, z), mass = Math.exp(-r * r * 0.9);
      const ridge = 1 - Math.abs(noise.noise3(x * 1.3 + 4.1, 2.2, z * 1.3));
      const n = noise.fbm(x * 1.1 + 7.3, 0.5, z * 1.1 - 2.1, 5, 2.0, 0.5);
      return 0.1 + 0.8 * mass * (0.55 + ridge * ridge * 0.7) + 0.2 * n * (0.4 + mass);
    };
    surfaces.push({ f: (u, v) => { const x = (u * 2 - 1) * S, z = (v * 2 - 1) * S; return [x, hgt(x, z), z]; }, top: true });
    // four walls: from the base up to the terrain edge
    const wall = (ax) => (u, v) => {
      const t = (u * 2 - 1) * S, [x, z] = ax === 0 ? [t, S] : ax === 1 ? [S, -t] : ax === 2 ? [-t, -S] : [-S, t];
      return [x, base + (hgt(x, z) - base) * v, z];
    };
    for (let a = 0; a < 4; a++) surfaces.push({ f: wall(a), wall: true });
    R = 1.75; dir = [0.0, 0.5, 1]; rot = [0, (0.62 + rng.range(-0.1, 0.1)) * side, 0]; fitK = 0.94;
  } else if (m === 'vase') {
    // amphora profile: radius against height, a Catmull-Rom curve through a few control radii
    const KT = [0, 0.04, 0.12, 0.3, 0.44, 0.58, 0.7, 0.8, 0.9, 0.97, 1], KR = [0.24, 0.21, 0.3, 0.54, 0.57, 0.45, 0.25, 0.16, 0.16, 0.2, 0.23];
    const prof = (t) => {
      t = clamp(t, 0, 1); let i = 0; while (i < KT.length - 2 && t > KT[i + 1]) i++;
      const f = (t - KT[i]) / (KT[i + 1] - KT[i]), p0 = KR[Math.max(i - 1, 0)], p1 = KR[i], p2 = KR[i + 1], p3 = KR[Math.min(i + 2, KR.length - 1)];
      const r = 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f);
      return [r, -1.05 + 2.1 * t];
    };
    surfaces.push({ f: (u, v) => { const [r, y] = prof(u), a = v * TAU; return [Math.cos(a) * r, y, Math.sin(a) * r]; }, wrapV: true });
    // two handles: small tori from shoulder to neck
    for (const sgn of [-1, 1]) surfaces.push({ f: (u, v) => {
      const a = -0.5 * Math.PI + u * Math.PI * 1.05, cx = sgn * 0.3, cy = 0.42, rx = 0.2, ry = 0.3;
      const px = cx + sgn * Math.cos(a) * rx, py = cy + Math.sin(a) * ry, tx = -sgn * Math.sin(a) * rx, ty = Math.cos(a) * ry, tl = Math.hypot(tx, ty);
      const nx = ty / tl * sgn, ny = -tx / tl * sgn, b = v * TAU, r = 0.045;
      return [px + (nx * Math.cos(b)) * r, py + (ny * Math.cos(b)) * r, Math.sin(b) * r];
    }, wrapV: true });
    ground = { y: -1.06, rx: 1.15, rz: 0.75 };
    R = 1.18; dir = [0.2 * side, 0.32, 1];
  } else if (m === 'shell') {
    // conical shell: a tube that winds round a vertical axis, growing exponentially towards the opening
    const turns = 6.2, b = 0.42;
    surfaces.push({ f: (u, v) => {
      const th = u * turns * TAU, g = Math.exp(b * (u * turns * TAU - turns * TAU) / TAU);   // 1 at the opening
      const rC = 0.62 * g, rT = 0.4 * g, y = 1.25 - 2.2 * (1 - Math.pow(1 - g, 1.0)) - 0.25 * g;
      const a = v * TAU, rr = rC + rT * Math.cos(a) * 1.0;
      return [Math.cos(th) * rr, y + rT * Math.sin(a) * 1.15, Math.sin(th) * rr];
    }, wrapV: true });
    R = 1.25; dir = [0.25 * side, 0.18, 1]; rot = [0.25, 0, -0.5 * side];
  } else {   // knot
    const p = 2, q = 3, tube = 0.27;
    const curve = (t) => { const a = t * TAU, r = 0.62 + 0.3 * Math.cos(q * a); return [r * Math.cos(p * a), r * Math.sin(p * a), 0.36 * Math.sin(q * a)]; };
    surfaces.push({ f: (u, v) => {
      const c = curve(u), c2 = curve(u + 1e-4), T = norm(sub(c2, c)), up = norm(c), B = norm(cross(T, up)), N = cross(B, T);
      const a = v * TAU, r = tube * (1 + 0.0 * Math.sin(u * 30));
      return [c[0] + (N[0] * Math.cos(a) + B[0] * Math.sin(a)) * r, c[1] + (N[1] * Math.cos(a) + B[1] * Math.sin(a)) * r, c[2] + (N[2] * Math.cos(a) + B[2] * Math.sin(a)) * r];
    }, wrapU: true, wrapV: true });
    R = 1.22; dir = [0.1 * side, 0.15, 1]; rot = [0.5, 0.3 * side, rng.range(0, 1)];
  }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

  // ---- how many dots: spacing on screen is a fixed fraction of the short side, whatever the resolution
  const pxPerUnit = ((ctx.artSize ?? 0.7) * Math.min(W, H)) / (2 * R);
  const spacingPx = unit * 0.5 * P.dot, spacingW = spacingPx / pxPerUnit;
  const pts = [], nrm = [], thr = [], tag = [];
  const occluders = [];
  for (const s of surfaces) {
    // measure the surface on a coarse grid
    const g = 96, A = new Float64Array(g * g); let area = 0, lu = 0, lv = 0;
    const P3 = (u, v) => s.f(u, v);
    for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) {
      const u = (i + 0.5) / g, v = (j + 0.5) / g, d = 0.5 / g;
      const du = sub(P3(u + d, v), P3(u - d, v)), dv = sub(P3(u, v + d), P3(u, v - d));
      const c = cross(du, dv), a = Math.hypot(...c) * g * g; A[i + j * g] = a / (g * g); area += a / (g * g);
      lu += Math.hypot(...du) * g; lv += Math.hypot(...dv) * g;
    }
    lu /= g * g; lv /= g * g;
    // fine grid of about one dot per cell, cells close to square on the surface
    const nTarget = area / (spacingW * spacingW);
    const nu = Math.max(8, Math.round(Math.sqrt(nTarget * lu / lv))), nv = Math.max(8, Math.round(nTarget / nu));
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const ci = Math.min(g - 1, Math.floor((i + 0.5) / nu * g)), cj = Math.min(g - 1, Math.floor((j + 0.5) / nv * g));
      const expect = A[ci + cj * g] / area * nTarget * (g * g) / (nu * nv) * 1;   // dots this cell should hold
      let k = Math.floor(expect); if (rng() < expect - k) k++;
      for (let e = 0; e < k; e++) {
        const u = (i + rng()) / nu, v = (j + rng()) / nv, p = s.f(u, v), d = 1e-3;
        const n = norm(cross(sub(s.f(u + d, v), s.f(u - d, v)), sub(s.f(u, v + d), s.f(u, v - d))));
        pts.push(p[0], p[1], p[2]); nrm.push(n[0], n[1], n[2]);
        const idx = i + j * nu + e * 7919;
        thr.push((((i * 0.7548776662 + j * 0.5698402910 + e * 0.38) % 1) + 1) % 1);   // R2 sequence on the grid: even stipple
        tag.push(s.wall ? 1 : 0);
      }
    }
    // occluder mesh of the same surface
    const og = new THREE.ParametricGeometry((u, v, t) => { const p = s.f(u, v); t.set(p[0], p[1], p[2]); }, s.wrapU ? 400 : 160, s.wrapV ? 48 : 160);
    occluders.push(og);
  }
  // the vase's cast shadow: dots on an ellipse of ground, denser towards the vase and away from the light
  if (ground) {
    const n = Math.round((Math.PI * ground.rx * ground.rz) / (spacingW * spacingW));
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU, r = Math.sqrt(rng()), x = Math.cos(a) * r * ground.rx, z = Math.sin(a) * r * ground.rz;
      pts.push(x, ground.y, z); nrm.push(0, 1, 0); thr.push(((i * 0.6180339887) % 1)); tag.push(2);
    }
  }
  const count = thr.length;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('thr', new THREE.Float32BufferAttribute(thr, 1));
  geo.setAttribute('tag', new THREE.Float32BufferAttribute(tag, 1));

  const group = new THREE.Group(); group.rotation.set(...rot); scene.add(group);
  const occMat = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4 });
  for (const og of occluders) { const o = new THREE.Mesh(og, occMat); o.renderOrder = 0; group.add(o); }

  const L = new THREE.Vector3(-side * 0.8, 0.9, 0.55).normalize();
  const lab = (c) => new THREE.Vector3(c.r, c.g, c.b);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthTest: true, depthWrite: false,
    uniforms: {
      uL: { value: L }, uSize: { value: spacingPx * 1.05 }, uDark: { value: dark ? 1 : 0 }, uK: { value: P.contrast }, uContour: { value: P.contour },
      c0: { value: lab(C(0)) }, c1: { value: lab(C(1)) }, c2: { value: lab(C(2)) }, cInk: { value: lab(new THREE.Color(palette.ink)) }, uColor: { value: P.color },
      uGround: { value: new THREE.Vector4(ground ? ground.y : -99, ground ? ground.rx : 1, ground ? ground.rz : 1, 0) },
    },
    vertexShader: /* glsl */`
      attribute float thr, tag; uniform vec3 uL, c0, c1, c2, cInk; uniform float uSize, uDark, uK, uContour, uColor; uniform vec4 uGround;
      varying vec3 vC; varying float vA, vS;
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        vec3 N = normalize(mat3(modelMatrix) * normal), V = normalize(cameraPosition - w.xyz);
        float facing = dot(N, V); if (facing < 0.0) { N = -N; facing = -facing; }
        float diff = max(dot(N, uL), 0.0), H = pow(max(dot(N, normalize(uL + V)), 0.0), 24.0);
        float lit = clamp(0.08 + 0.85 * diff + 0.25 * H, 0.0, 1.0);
        if (tag > 1.5) {                                                       // ground: the shadow of the vase
          vec2 g = position.xz / uGround.yz;
          float d = length((position.xz + normalize(uL.xz) * 0.42) * vec2(0.8, 1.3));
          lit = 1.0 - 0.8 * exp(-pow(d / 0.55, 2.0));
          lit = uDark > 0.5 ? lit * 0.55 * (1.0 - smoothstep(0.15, 1.0, length(g)))   // dark ground: a faint pool of light, the shadow in it
                            : mix(lit, 1.0, smoothstep(0.55, 1.0, length(g)));
        }
        if (tag > 0.5 && tag < 1.5) {                                          // the cut walls: strata
          float band = 0.5 + 0.5 * sin(position.y * 56.0 + 2.0 * sin(position.x * 3.0 + position.z * 2.0));
          lit = clamp(0.3 + 0.45 * diff + 0.25 * band * band, 0.0, 1.0);
        }
        float contour = pow(1.0 - facing, 3.0) * uContour;
        // tone = how much of this dot is drawn: ink in the shadows (pale ground) or light where it is lit (dark ground)
        float tone = uDark > 0.5 ? pow(lit, 1.25 * uK) + 0.45 * contour : pow(1.0 - lit, 1.25 * uK) + 0.6 * contour;
        tone = clamp(tone, 0.0, 1.0);
        float keep = step(thr, tone * 0.98 + 0.015);
        vA = keep;
        vS = uSize * mix(0.42, 1.0, tone) * keep;
        vec3 shadowC = uDark > 0.5 ? mix(c0, c1, smoothstep(0.1, 0.6, lit)) : mix(cInk, c0, uColor);
        vec3 lightC = uDark > 0.5 ? mix(c1, c2, smoothstep(0.55, 1.0, lit)) : mix(cInk, c1, uColor);
        vC = mix(shadowC, lightC, uDark > 0.5 ? smoothstep(0.3, 1.0, lit) : smoothstep(0.25, 0.85, lit));
        gl_Position = projectionMatrix * viewMatrix * w;
        gl_PointSize = max(vS, 0.0);
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vC; varying float vA, vS;
      void main(){
        if (vA < 0.5) discard;
        float r = length(gl_PointCoord - 0.5) * vS, a = clamp(0.5 * vS - r + 0.5, 0.0, 1.0);
        if (a <= 0.0) discard;
        gl_FragColor = vec4(vC, a);
        #include <colorspace_fragment>
      }`,
  });
  const cloud = new THREE.Points(geo, mat); cloud.renderOrder = 1; cloud.frustumCulled = false; group.add(cloud);

  // ---- ground: the plain sheet with a whisper of paper or of light at the subject
  scene.add(backgroundQuad(/* glsl */`
    varying vec2 vUv; uniform vec3 bg; uniform vec2 uF, uAsp; uniform float uR, uDark;
    ${GLSL_QUIET}
    float h(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
    void main(){
      vec2 p = vec2(vUv.x, 1.0 - vUv.y), q = (p - uF) * uAsp;
      float g = exp(-dot(q, q) / (2.0 * uR * uR)) * (1.0 - quietMask(p, 0.12));
      vec3 col = bg * (1.0 + mix(0.025, 0.35, uDark) * g) + uDark * 0.012 * g;
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
      gl_FragColor.rgb += (h(gl_FragCoord.xy) + h(gl_FragCoord.xy + 31.7) - 1.0) / 255.0;
    }`, {
    bg: { value: bgc }, uF: { value: new THREE.Vector2(ctx.focus.x, ctx.focus.y) }, uAsp: { value: new THREE.Vector2(sx, sy) },
    uR: { value: 0.32 * (ctx.artSize ?? 0.7) }, uDark: { value: dark ? 1 : 0 }, ...quietUniforms(ctx),
  }));

  // centre what is actually there and state an honest radius
  group.updateMatrixWorld();
  const v = new THREE.Vector3(), bb = new THREE.Box3();
  for (let i = 0; i < count; i += 7) bb.expandByPoint(v.set(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]).applyMatrix4(group.matrixWorld));
  const ctr = bb.getCenter(new THREE.Vector3()); let rad = 0;
  for (let i = 0; i < count; i += 7) rad = Math.max(rad, v.set(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]).applyMatrix4(group.matrixWorld).sub(ctr).length());
  group.position.sub(ctr);
  ctx.frame({ radius: rad * fitK, fov: 26, dir });
}
