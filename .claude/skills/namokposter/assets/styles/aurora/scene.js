// Aurora — pearly liquid blob over a soft colour-mesh gradient.
import { makeNoise, paletteEnvironment, backgroundQuad, quietUniforms, GLSL_NOISE, GLSL_QUIET } from '/skill/assets/web/scene-lib.js';

export default function build(ctx) {
  const { THREE, scene, renderer, rng, palette, params, aspect, focus, artSize, seed } = ctx;
  const cols = palette.colors;
  const dark = new THREE.Color(palette.bg).getHSL({}).l < 0.35;

  // --- background: palette colours bloom around the subject and fade to the flat bg behind the copy
  const C = (i) => new THREE.Color(cols[i % cols.length]);
  scene.add(backgroundQuad(/* glsl */`
    varying vec2 vUv; uniform vec3 bg, c0, c1, c2, c3; uniform vec2 focus; uniform float aspect, seed, glow, size, dark;
    ${GLSL_NOISE}
    ${GLSL_QUIET}
    void main(){
      vec2 p = vUv; p.y = 1.0 - p.y;
      vec2 q = (p - focus) * vec2(max(aspect, 1.0), max(1.0 / aspect, 1.0));   // short-side units, centred on the subject
      vec3 w = vec3(q * 1.15, seed);
      vec2 warp = vec2(fbm(w + vec3(3.1, 0.0, 0.0)), fbm(w + vec3(0.0, 7.7, 0.0)));
      vec2 r = q + warp * 0.55;
      float a = fbm(vec3(r * 1.3, seed + 4.0)) * 0.5 + 0.5, b = fbm(vec3(r * 1.0 + 9.0, seed + 11.0)) * 0.5 + 0.5;
      vec3 col = mix(mix(c0, c1, smoothstep(0.25, 0.75, a)), mix(c2, c3, smoothstep(0.2, 0.8, a)), smoothstep(0.3, 0.7, b));
      float d = length(q) / size;
      float m = smoothstep(1.55, 0.25, d + warp.x * 0.35) * glow;   // colour only near the subject
      m *= 1.0 - 0.96 * quietMask(p + warp * 0.11, 0.15);              // …and it retreats from wherever type sits
      vec3 base = mix(bg, col, clamp(m, 0.0, 1.0) * mix(0.86, 0.7, dark));
      base += (1.0 - dark) * 0.05 * smoothstep(0.9, 0.0, d);          // gentle lift at the centre
      gl_FragColor = vec4(base, 1.0);
      #include <colorspace_fragment>
    }`, {
    bg: { value: new THREE.Color(palette.bg) }, c0: { value: C(0) }, c1: { value: C(1) }, c2: { value: C(2) }, c3: { value: C(3) },
    focus: { value: new THREE.Vector2(focus.x, focus.y) }, aspect: { value: aspect }, seed: { value: (seed % 97) * 0.37 },
    glow: { value: params.glow ?? 1 }, size: { value: artSize }, dark: { value: dark ? 1 : 0 }, ...quietUniforms(ctx),
  }));

  // --- subject
  scene.environment = paletteEnvironment(renderer, cols, { base: dark ? '#0a0a14' : '#f4f1ee', rng, blobs: 9, intensity: dark ? 0.9 : 1 });
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = dark ? 1.05 : 1.12;

  const noise = makeNoise(seed * 13 + 5);
  let geo = new THREE.IcosahedronGeometry(1, 80);
  geo.deleteAttribute('normal'); geo.deleteAttribute('uv');
  geo = THREE.BufferGeometryUtils.mergeVertices(geo, 1e-5);
  const pos = geo.attributes.position, v = new THREE.Vector3(), amp = params.blob ?? 0.24;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = noise.fbm(v.x * 0.62 + 1.7, v.y * 0.62 - 0.4, v.z * 0.62 + 3.1, 2, 2.0, 0.32);
    v.multiplyScalar(0.86 + amp * n * 2.2); pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const pearl = new THREE.MeshPhysicalMaterial({
    color: dark ? '#cfc8ff' : '#ffffff', roughness: 0.16, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.08,
    iridescence: 1, iridescenceIOR: 1.7, iridescenceThicknessRange: [180, 620], envMapIntensity: 1.25,
  });
  const blob = new THREE.Mesh(geo, pearl);
  blob.rotation.set(rng.range(-0.6, 0.6), rng.range(0, 6.28), rng.range(-0.4, 0.4));
  scene.add(blob);

  // satellites: small glossy spheres in palette colours, scattered on a ring so they frame the blob
  const count = Math.round(params.satellites ?? 5), sg = new THREE.SphereGeometry(1, 64, 48);
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + rng.range(-0.35, 0.35), rad = rng.range(0.98, 1.22), s = rng.range(0.05, 0.17);
    const m = new THREE.MeshPhysicalMaterial({ color: cols[i % cols.length], roughness: rng.range(0.12, 0.38), metalness: rng() < 0.4 ? 0.9 : 0.05, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.1 });
    const o = new THREE.Mesh(sg, m); o.scale.setScalar(s);
    o.position.set(Math.cos(ang) * rad, Math.sin(ang) * rad * 0.92, rng.range(-0.5, 0.7));
    scene.add(o);
  }
  const key = new THREE.DirectionalLight('#ffffff', 2.2); key.position.set(-2.5, 3.5, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(cols[1 % cols.length], 1.6); rim.position.set(3, -1.5, -2); scene.add(rim);

  ctx.frame({ radius: 1.22, fov: 26, dir: [0.1, 0.1, 1] });
}
