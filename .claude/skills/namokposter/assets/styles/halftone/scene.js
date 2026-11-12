// Riso Halftone Orbs — two or three big overlapping spheres, each printed as a halftone dot screen in
// one spot colour with its shadow in another, overprinting like translucent ink on paper. Every ink
// has its own screen angle and is nudged slightly out of register, as on a real risograph.
// The whole print is one fragment shader; orbs are laid out around the origin and projected to pixels.
import { backgroundQuad, quietUniforms, GLSL_QUIET, GLSL_NOISE } from '/skill/assets/web/scene-lib.js';

export default function build(ctx) {
  const { THREE, scene, camera, rng, palette, params, width: W, height: H, unit } = ctx;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v)), rad = THREE.MathUtils.degToRad;

  // ---- composition, in world units inside the unit circle: large, medium and small orb, each overlapping the large one
  const count = clamp(Math.round(params.orbs ?? 3), 1, 3);
  const th = rng() * Math.PI * 2, side = rng.sign();
  const polar = (r, a) => [Math.cos(a) * r, Math.sin(a) * r];
  const orbs = [
    { c: polar(0.3, th), r: rng.range(0.58, 0.62) },
    { c: polar(0.48, th + Math.PI + rng.range(-0.4, 0.4)), r: rng.range(0.42, 0.46) },
    { c: polar(0.62, th + side * rad(rng.range(85, 105))), r: rng.range(0.22, 0.27) },
  ].slice(0, count);

  ctx.frame({ radius: 1, fov: 20, dir: [0, 0, 1] });
  camera.updateMatrixWorld();
  const o = new THREE.Vector3(0, 0, 0).project(camera), e = new THREE.Vector3(1, 0, 0).project(camera);
  const ppu = (e.x - o.x) * 0.5 * W, ox = (o.x * 0.5 + 0.5) * W, oy = (0.5 - o.y * 0.5) * H;   // px per unit, origin in px (y down)

  // ---- inks: up to three spot colours; each gets a screen angle and a registration error
  const inks = palette.colors.slice(0, 3); while (inks.length < 3) inks.push(inks[inks.length % Math.max(1, palette.colors.length)]);
  const K = Math.min(3, palette.colors.length);
  const bg = new THREE.Color(palette.bg), dark = bg.getHSL({}, THREE.SRGBColorSpace).l < 0.4;
  const slip = (params.misregister ?? 1) * 0.3 * unit, a0 = rng() * Math.PI * 2;
  const off = [0, 1, 2].map((k) => new THREE.Vector2(Math.cos(a0 + k * 2.2), Math.sin(a0 + k * 2.2)).multiplyScalar(slip * (k === 0 ? 0.5 : 1)));
  const turn = rad(params.angle ?? 0);

  const uniforms = {
    uRes: { value: new THREE.Vector2(W, H) }, uUnit: { value: unit }, uPitch: { value: 0.52 * unit * clamp(params.dot ?? 1, 0.4, 5) },
    uPaper: { value: bg }, uDark: { value: dark ? 1 : 0 },
    uInk: { value: inks.map((c) => new THREE.Color(c)) }, uOff: { value: off }, uAng: { value: [rad(15) + turn, rad(75) + turn, rad(45) + turn] },
    uOrb: { value: [0, 1, 2].map((i) => (orbs[i] ? new THREE.Vector4(ox + orbs[i].c[0] * ppu, oy - orbs[i].c[1] * ppu, orbs[i].r * ppu, 1) : new THREE.Vector4(0, 0, 1, 0))) },
    // x: ink of the orb, y: ink of its shadow — chosen so every overlap mixes to a clean third colour
    uOrbInk: { value: (K >= 3 ? [[0, 1], [1, 0], [2, 0]] : K === 2 ? [[0, 1], [1, 0], [1, 0]] : [[0, 0], [0, 0], [0, 0]]).map((v) => new THREE.Vector2(...v)) },
    // on dark stock ink is light, so the heavy side of each screen has to face the light instead of away from it
    uLight: { value: new THREE.Vector3(-0.5, 0.58, 0.64).multiply(new THREE.Vector3(dark ? -1 : 1, dark ? -1 : 1, 1)).normalize() }, uShade: { value: clamp(params.shade ?? 1, 0, 1.3) },
    uWear: { value: clamp(params.wear ?? 0.5, 0, 1) }, uSeed: { value: (ctx.seed % 89) * 1.7 }, ...quietUniforms(ctx),
  };
  scene.add(backgroundQuad(/* glsl */`
    varying vec2 vUv; uniform vec2 uRes; uniform float uUnit, uPitch, uDark, uShade, uWear, uSeed; uniform vec3 uPaper, uLight;
    uniform vec3 uInk[3]; uniform vec2 uOff[3]; uniform float uAng[3]; uniform vec4 uOrb[3]; uniform vec2 uOrbInk[3];
    ${GLSL_QUIET}
    ${GLSL_NOISE}
    float quietSoft(vec2 px, float inner, float outer){
      float m = 0.0;
      for (int i = 0; i < 4; i++) {
        vec4 r = uQuiet[i] * uRes.xyxy; vec2 q = abs(px - (r.xy + r.zw) * 0.5) - (r.zw - r.xy) * 0.5;
        m = max(m, 1.0 - smoothstep(-inner, outer, length(max(q, 0.0)) + min(max(q.x, q.y), 0.0)));
      }
      return m;
    }
    void main(){
      vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uRes;
      float calm = 1.0 - 0.94 * quietSoft(px, 0.0, 7.0 * uUnit);                 // dots shrink away wherever type sits
      vec3 mul = vec3(1.0), scr = vec3(1.0);
      for (int k = 0; k < 3; k++) {
        vec2 p = px - uOff[k];
        // Euclidean spot function: round dots in the highlights, a chequer at 50 %, round holes in the shadows
        float cs = cos(uAng[k]), sn = sin(uAng[k]); vec2 g = mat2(cs, -sn, sn, cs) * p / uPitch * 6.2831853;
        float f = 0.5 - 0.25 * (cos(g.x) + cos(g.y));
        float w = max(1.5708 / uPitch * length(sin(g)), 0.45 / uPitch);          // |∇f| per pixel, floored so pin-point dots fade instead of aliasing
        float a = 0.0;
        for (int j = 0; j < 3; j++) {
          vec4 orb = uOrb[j]; if (orb.w < 0.5) continue;
          vec2 q = (p - orb.xy) / orb.z; float rr = dot(q, q); if (rr > 1.2) continue;
          float mask = clamp(0.5 - (sqrt(rr) - 1.0) * orb.z, 0.0, 1.0);
          float lit = dot(vec3(q.x, -q.y, sqrt(max(0.0, 1.0 - rr))), uLight);
          float c = 0.0;
          if (int(uOrbInk[j].x + 0.5) == k) c = max(mix(0.97, 0.14, pow(smoothstep(-0.45, 1.0, lit), 1.15)), 0.34 * smoothstep(0.86, 1.0, rr));   // shaded sphere, with a firmer rim
          if (int(uOrbInk[j].y + 0.5) == k) c = max(c, 0.78 * uShade * smoothstep(0.3, -0.6, lit));
          c *= calm;
          float v = c + 0.07 * sin(6.2831853 * c);                                // tone → threshold (inverse of the spot function's area curve)
          a = max(a, mask * clamp(0.5 + (v - f) / w, 0.0, 1.0) * step(0.004, c));
        }
        // the drum never lays ink down perfectly evenly: broad, soft patches of slightly thinner ink, different for every colour
        if (a > 0.0 && uWear > 0.0) a *= 1.0 - uWear * 0.2 * smoothstep(-0.2, 0.7, gnoise(vec3(p / (uUnit * 7.0), uSeed + float(k) * 9.0)) + 0.5 * gnoise(vec3(p / (uUnit * 2.2), uSeed + float(k) * 4.0 + 3.0)));
        mul *= mix(vec3(1.0), uInk[k], a);
        scr *= 1.0 - a * uInk[k];
      }
      vec3 col = mix(uPaper * mul, 1.0 - (1.0 - uPaper) * scr, uDark);           // multiply on light paper, screen on dark stock
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }`, uniforms));
}
