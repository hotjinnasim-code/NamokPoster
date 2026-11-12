// Dot Wave — a perspective field of dots displaced by layered noise.
import { makeNoise, paletteTexture, quietUniforms, GLSL_QUIET } from '/skill/assets/web/scene-lib.js';

export default function build(ctx) {
  const { THREE, scene, camera, palette, params, unit, seed } = ctx;
  const bg = new THREE.Color(palette.bg), dark = bg.getHSL({}).l < 0.35;
  const noise = makeNoise(seed * 5 + 11);
  const amp = 0.62 * (params.height ?? 1), det = params.detail ?? 1;

  // grid in the XZ plane; generous extents so the field still fills the frame after the lens shift
  const X0 = -11, X1 = 11, Z0 = -13, Z1 = 5.2, step = 0.041;
  const nx = Math.floor((X1 - X0) / step), nz = Math.floor((Z1 - Z0) / step);
  const pos = new Float32Array(nx * nz * 3), hgt = new Float32Array(nx * nz);
  let i = 0;
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const x = X0 + ix * step + ((iz & 1) ? step / 2 : 0), z = Z0 + iz * step * 0.866;   // hex packing reads smoother than a square grid
      const swell = noise.fbm(x * 0.2 * det, 0.0, z * 0.2 * det, 3, 2.0, 0.5);
      const ridge = 1.0 - Math.abs(noise.noise3(x * 0.34 * det + 5.0, 1.7, z * 0.34 * det));
      const y = amp * (swell * 1.9 + (ridge * ridge - 0.5) * 0.55) * (0.55 + 0.45 * Math.exp(-(x * x + z * z) / 26));
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; hgt[i] = y / Math.max(amp, 1e-3); i++;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('h', new THREE.BufferAttribute(hgt, 1));
  const ramp = paletteTexture(palette.colors);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, blending: dark ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { ramp: { value: ramp }, uSize: { value: unit * 0.33 * (params.dot ?? 1) }, uDist: { value: 10 }, uDark: { value: dark ? 1 : 0 }, ...quietUniforms(ctx) },
    vertexShader: /* glsl */`
      attribute float h; uniform float uSize, uDist; varying float vH, vA;
      ${GLSL_QUIET}
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        float dist = -mv.z / uDist;                              // 1.0 = distance of the subject
        float s = uSize * (0.74 / dist);                         // perspective: near dots are bigger
        vec2 uv = gl_Position.xy / gl_Position.w * 0.5 + 0.5; uv.y = 1.0 - uv.y;
        float inside = quietMask(uv, 0.07);                      // dots dissolve wherever type sits
        float far = smoothstep(2.05, 0.8, dist), near = smoothstep(0.1, 0.26, dist);   // fade into the horizon and at the lens
        vA = far * near * mix(1.0, 0.03, inside) * (0.62 + 0.38 * smoothstep(-0.9, 0.9, h));
        vH = h; gl_PointSize = max(s, 1.0); vA *= min(1.0, s);  // sub-pixel dots fade instead of flickering
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D ramp; uniform float uDark; varying float vH, vA;
      void main(){
        float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.72, d) * vA;
        if (a < 0.003) discard;
        vec3 col = texture2D(ramp, vec2(clamp(vH * 0.5 + 0.5, 0.01, 0.99), 0.5)).rgb;
        gl_FragColor = vec4(col * mix(1.0, a, uDark), mix(a, 1.0, uDark));
        #include <colorspace_fragment>
      }`,
  });
  scene.add(new THREE.Points(geo, mat));

  const dist = ctx.frame({ radius: 2.3, fov: 34, dir: [0.18, 0.33, 1] });
  mat.uniforms.uDist.value = dist;
  camera.near = dist * 0.02; camera.far = dist * 8; camera.updateProjectionMatrix();
}
