// Neon Flux — light trails integrated through a curl-noise flow field, with bloom.
import { makeNoise, backgroundQuad, ramp, quietPassShader } from '/skill/assets/web/scene-lib.js';

export default function build(ctx) {
  const { THREE, scene, camera, renderer, rng, palette, params, width: W, height: H, unit, aspect, focus, artSize, seed } = ctx;
  const cols = palette.colors;
  const noise = makeNoise(seed * 7 + 3);
  const turb = params.turbulence ?? 1, density = params.density ?? 1;

  // soft colour haze behind the trails so the subject sits in a pool of light
  scene.add(backgroundQuad(/* glsl */`
    varying vec2 vUv; uniform vec3 bg, c0, c1; uniform vec2 focus; uniform float aspect, size;
    void main(){
      vec2 p = vec2(vUv.x, 1.0 - vUv.y);
      vec2 q = (p - focus) * vec2(max(aspect, 1.0), max(1.0 / aspect, 1.0)) / size;
      float d = length(q * vec2(1.0, 1.15));
      vec3 col = bg + c0 * 0.16 * exp(-d * d * 1.6) + c1 * 0.07 * exp(-pow(length(q - vec2(0.5, -0.3)), 2.0) * 2.4);
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }`, {
    bg: { value: new THREE.Color(palette.bg) }, c0: { value: new THREE.Color(cols[0]) }, c1: { value: new THREE.Color(cols[1 % cols.length]) },
    focus: { value: new THREE.Vector2(focus.x, focus.y) }, aspect: { value: aspect }, size: { value: artSize },
  }));

  // --- trails: bundles of streamlines seeded on a tilted ring, advected by "orbit + curl noise" and
  // softly pulled back to the ring. Each bundle keeps one palette colour, so the swirl reads as
  // distinct ribbons that burn white only where they cross.
  const BUNDLES = 9, PER = Math.round(170 * density), LINES = BUNDLES * PER, STEPS = 170, DT = 0.019;
  const positions = new Float32Array(LINES * (STEPS - 1) * 6), colors = new Float32Array(LINES * (STEPS - 1) * 6);
  const R0 = 0.74, p = new THREE.Vector3(), prev = new THREE.Vector3(), c = new THREE.Color(), fq = 0.62;
  let k = 0;
  for (let b = 0; b < BUNDLES; b++) {
    const a0 = rng() * Math.PI * 2, r0 = R0 + rng.range(-0.2, 0.2), y0 = rng.range(-0.2, 0.2), spread = rng.range(0.025, 0.085);
    const base = new THREE.Color(cols[b % cols.length]).lerp(new THREE.Color(cols[(b + 1) % cols.length]), rng() * 0.35);
    const dir = b % 4 === 3 ? -1 : 1, power = rng.range(0.6, 1.25);
    for (let l = 0; l < PER; l++) {
      const ang = a0 + rng.gauss() * 0.22, rr = r0 + rng.gauss() * spread, bright = (0.3 + rng() * rng() * 1.6) * power;
      p.set(Math.cos(ang) * rr, y0 + rng.gauss() * spread, Math.sin(ang) * rr);
      for (let s = 0; s < STEPS; s++) {
        prev.copy(p);
        const [cx, cy, cz] = noise.curl(p.x * fq, p.y * fq, p.z * fq + seed * 0.13);
        const r = Math.hypot(p.x, p.z) || 1e-4;
        const tx = -p.z / r, tz = p.x / r;               // orbit direction
        const pull = (R0 - r) * 0.8;                     // keeps the swirl together
        p.x += (tx * dir + cx * 0.8 * turb + (p.x / r) * pull) * DT;
        p.y += (cy * 0.8 * turb - p.y * 0.5) * DT;
        p.z += (tz * dir + cz * 0.8 * turb + (p.z / r) * pull) * DT;
        if (s === 0) continue;
        const t = s / (STEPS - 1), fade = Math.sin(Math.PI * t) ** 1.5;     // trails taper at both ends
        c.copy(base).multiplyScalar(bright * fade * 0.05);
        positions.set([prev.x, prev.y, prev.z, p.x, p.y, p.z], k);
        colors.set([c.r, c.g, c.b, c.r, c.g, c.b], k); k += 6;
      }
    }
  }
  const geo = new THREE.LineSegmentsGeometry(); geo.setPositions(positions); geo.setColors(colors);
  const mat = new THREE.LineMaterial({ vertexColors: true, linewidth: Math.max(1, unit * 0.085), transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, toneMapped: false });
  mat.resolution.set(W, H);
  const trails = new THREE.LineSegments2(geo, mat);
  trails.rotation.set(THREE.MathUtils.degToRad(64 + rng.range(-6, 6)), 0, THREE.MathUtils.degToRad(rng.range(-22, 22)));
  scene.add(trails);

  // --- dust: tiny sparks through the whole volume for depth
  const N = Math.round(1100 * density), dp = new Float32Array(N * 3), dc = new Float32Array(N * 3), ds = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const far = rng() < 0.55;
    const r = far ? rng.range(1.0, 5.5) : rng.range(0.15, 1.25), a = rng() * 6.283, y = rng.gauss() * (far ? 1.6 : 0.4);
    dp.set([Math.cos(a) * r, y, Math.sin(a) * r - (far ? 1.5 : 0)], i * 3);
    c.copy(ramp(cols, rng())).multiplyScalar(far ? 0.35 : 0.9); dc.set([c.r, c.g, c.b], i * 3);
    ds[i] = (far ? rng.range(0.04, 0.12) : rng.range(0.05, 0.22)) * unit;
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(dp, 3)); dg.setAttribute('color', new THREE.BufferAttribute(dc, 3)); dg.setAttribute('size', new THREE.BufferAttribute(ds, 1));
  scene.add(new THREE.Points(dg, new THREE.ShaderMaterial({
    transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false,
    vertexShader: 'attribute float size; attribute vec3 color; varying vec3 vC; void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * 2.0; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying vec3 vC; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d); gl_FragColor = vec4(vC * a * a, 1.0); }',
  })));

  ctx.frame({ radius: 1.02, fov: 30, dir: [0, 0.05, 1] });

  // --- bloom
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new THREE.EffectComposer(renderer, rt);
  composer.setPixelRatio(1); composer.setSize(W, H);
  composer.addPass(new THREE.RenderPass(scene, camera));
  composer.addPass(new THREE.UnrealBloomPass(new THREE.Vector2(W, H), 0.55 * (params.bloom ?? 1), 0.7, 0.08));
  // footer/header strips are dimmed; the copy block is kept clear by the composition and the CSS scrim instead
  composer.addPass(new THREE.ShaderPass(quietPassShader(ctx, 0.86, 0.08, { skipCopy: true })));
  composer.addPass(new THREE.OutputPass());
  return { render: () => composer.render() };
}
