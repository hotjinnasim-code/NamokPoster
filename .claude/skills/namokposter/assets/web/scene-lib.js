// Helpers shared by three.js scenes. Import what you need:
//   import { makeRng, fbm2, paletteTexture, ... } from '/skill/assets/web/scene-lib.js';
import * as THREE from '/skill/assets/vendor/three.bundle.min.js';

/** Deterministic RNG: same seed → same poster. */
export function makeRng(seed = 1) {
  let a = (seed >>> 0) || 1;
  const next = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const rng = () => next();
  rng.range = (lo, hi) => lo + (hi - lo) * next();
  rng.int = (lo, hi) => Math.floor(rng.range(lo, hi + 1));
  rng.pick = (arr) => arr[Math.floor(next() * arr.length)];
  rng.sign = () => (next() < 0.5 ? -1 : 1);
  rng.gauss = () => { let u = 0, v = 0; while (u === 0) u = next(); while (v === 0) v = next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  rng.shuffle = (arr) => { const a2 = [...arr]; for (let i = a2.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a2[i], a2[j]] = [a2[j], a2[i]]; } return a2; };
  return rng;
}

export const color = (hex) => new THREE.Color(hex);
export const lerpColor = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);
/** Sample a multi-stop gradient made from hex colours, t in 0..1. */
export function ramp(colors, t) {
  const n = colors.length - 1; const x = Math.min(0.9999, Math.max(0, t)) * n; const i = Math.floor(x);
  return new THREE.Color(colors[i]).lerp(new THREE.Color(colors[Math.min(n, i + 1)]), x - i);
}

/** 1×N gradient texture from palette colours (handy as a uniform in shaders). */
export function paletteTexture(colors, size = 256) {
  const c = document.createElement('canvas'); c.width = size; c.height = 1;
  const g = c.getContext('2d'); const grad = g.createLinearGradient(0, 0, size, 0);
  colors.forEach((col, i) => grad.addColorStop(colors.length === 1 ? 0 : i / (colors.length - 1), col));
  g.fillStyle = grad; g.fillRect(0, 0, size, 1);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** Equirect environment made of soft colour blobs — gives glossy materials something on-palette to reflect. */
export function paletteEnvironment(renderer, colors, { base = '#101014', rng = Math.random, blobs = 7, intensity = 1 } = {}) {
  const w = 1024, h = 512, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < blobs; i++) {
    const x = rng() * w, y = h * (0.15 + rng() * 0.7), r = h * (0.25 + rng() * 0.45);
    for (const dx of [-w, 0, w]) { // wrap horizontally so there is no seam
      const grad = g.createRadialGradient(x + dx, y, 0, x + dx, y, r);
      const col = new THREE.Color(colors[i % colors.length]).multiplyScalar(intensity);
      grad.addColorStop(0, `rgba(${(col.r * 255) | 0},${(col.g * 255) | 0},${(col.b * 255) | 0},0.95)`); grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
    }
  }
  // a bright soft "key light" strip keeps highlights crisp
  const key = g.createRadialGradient(w * 0.3, h * 0.18, 0, w * 0.3, h * 0.18, h * 0.3);
  key.addColorStop(0, 'rgba(255,255,255,1)'); key.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = key; g.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(c); tex.mapping = THREE.EquirectangularReflectionMapping; tex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer); const env = pmrem.fromEquirectangular(tex).texture; pmrem.dispose(); tex.dispose();
  return env;
}

// ---- value noise / fbm on the CPU (deterministic, good enough for geometry) ----
export function makeNoise(seed = 1) {
  const rng = makeRng(seed); const p = new Uint8Array(512); const perm = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10), lerp = (a, b, t) => a + (b - a) * t;
  const grad = (h, x, y, z) => { const u = (h & 15) < 8 ? x : y, v = (h & 15) < 4 ? y : (h & 15) === 12 || (h & 15) === 14 ? x : z; return ((h & 1) ? -u : u) + ((h & 2) ? -v : v); };
  const noise3 = (x, y, z) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255; x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z); const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z, B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
    return lerp(lerp(lerp(grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z), u), lerp(grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z), u), v),
      lerp(lerp(grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1), u), lerp(grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1), u), v), w);
  };
  const fbm = (x, y, z, oct = 4, lac = 2, gain = 0.5) => { let a = 0.5, f = 1, s = 0; for (let i = 0; i < oct; i++) { s += a * noise3(x * f, y * f, z * f); f *= lac; a *= gain; } return s; };
  /** Divergence-free flow (curl of a noise potential) — particles following it never bunch up. */
  const curl = (x, y, z, e = 0.01) => {
    const n = (a, b, c2) => [noise3(a, b, c2), noise3(a + 31.4, b - 12.7, c2 + 7.1), noise3(a - 5.3, b + 44.2, c2 - 19.9)];
    const dx = [n(x + e, y, z), n(x - e, y, z)], dy = [n(x, y + e, z), n(x, y - e, z)], dz = [n(x, y, z + e), n(x, y, z - e)];
    const d = (pair, i) => (pair[0][i] - pair[1][i]) / (2 * e);
    return [d(dy, 2) - d(dz, 1), d(dz, 0) - d(dx, 2), d(dx, 1) - d(dy, 0)];
  };
  return { noise3, fbm, curl };
}

/** GLSL snippets for shaders that need noise. */
export const GLSL_NOISE = /* glsl */`
vec3 _h3(vec3 p){ p = vec3(dot(p,vec3(127.1,311.7,74.7)), dot(p,vec3(269.5,183.3,246.1)), dot(p,vec3(113.5,271.9,124.6))); return -1.0 + 2.0*fract(sin(p)*43758.5453123); }
float gnoise(vec3 p){ vec3 i=floor(p), f=fract(p); vec3 u=f*f*f*(f*(f*6.0-15.0)+10.0);
  return mix(mix(mix(dot(_h3(i+vec3(0,0,0)),f-vec3(0,0,0)), dot(_h3(i+vec3(1,0,0)),f-vec3(1,0,0)),u.x), mix(dot(_h3(i+vec3(0,1,0)),f-vec3(0,1,0)), dot(_h3(i+vec3(1,1,0)),f-vec3(1,1,0)),u.x),u.y),
             mix(mix(dot(_h3(i+vec3(0,0,1)),f-vec3(0,0,1)), dot(_h3(i+vec3(1,0,1)),f-vec3(1,0,1)),u.x), mix(dot(_h3(i+vec3(0,1,1)),f-vec3(0,1,1)), dot(_h3(i+vec3(1,1,1)),f-vec3(1,1,1)),u.x),u.y),u.z); }
float fbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ s+=a*gnoise(p); p=p*2.02+vec3(17.3,-9.1,4.7); a*=0.5; } return s; }
`;

/** Full-frame background quad drawn behind everything (ignores camera). `fragment` gets vUv and uniforms. */
export function backgroundQuad(fragmentShader, uniforms = {}) {
  const mat = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false, uniforms,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }',
    fragmentShader,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); mesh.frustumCulled = false; mesh.renderOrder = -1000;
  return mesh;
}

/**
 * "Quiet" rectangles are the parts of the poster that carry type (copy block, footer, header).
 * Add `...quietUniforms(ctx)` to a material's uniforms and GLSL_QUIET to its shader, then call
 * quietMask(uv) with uv in poster space (0..1, y down): 1 inside a quiet rectangle, 0 well outside.
 */
export function quietUniforms(ctx, { skipCopy = false } = {}) {
  const rects = (ctx.quiet || []).slice(skipCopy ? 1 : 0, skipCopy ? 5 : 4);   // [0] is the copy block, the rest footer/header
  const value = [0, 1, 2, 3].map((i) => new THREE.Vector4(...(rects[i] || [2, 2, 2, 2])));
  return { uQuiet: { value } };
}
export const GLSL_QUIET = /* glsl */`
uniform vec4 uQuiet[4];
float quietMask(vec2 uv, float edge){
  float m = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 r = uQuiet[i];
    float inside = smoothstep(r.x - edge, r.x + edge, uv.x) * smoothstep(r.z + edge, r.z - edge, uv.x)
                 * smoothstep(r.y - edge, r.y + edge, uv.y) * smoothstep(r.w + edge, r.w - edge, uv.y);
    m = max(m, inside);
  }
  return m;
}
`;
/** Post-processing shader that pulls quiet rectangles back towards the background colour (for bright additive scenes). */
export function quietPassShader(ctx, strength = 0.8, edge = 0.07, opts = {}) {
  return {
    uniforms: { tDiffuse: { value: null }, uBg: { value: new THREE.Color(ctx.palette.bg) }, uStrength: { value: strength }, uEdge: { value: edge }, ...quietUniforms(ctx, opts) },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec3 uBg; uniform float uStrength, uEdge; varying vec2 vUv; ${GLSL_QUIET}
      void main(){ vec4 c = texture2D(tDiffuse, vUv); float m = quietMask(vec2(vUv.x, 1.0 - vUv.y), uEdge) * uStrength; gl_FragColor = vec4(mix(c.rgb, uBg, m), c.a); }`,
  };
}

// =====================================================================================================
// Wave 3 additions: 2D GLSL noise kit, anti-banding dither, composer / dither-pixel / finishing passes,
// display-space colour helpers, a canvas-texture helper and the watercolour polygon tools.
// =====================================================================================================

/** Hex colour → Vector3 of display (sRGB-encoded) values, for passes that run after OutputPass and must hit a hex exactly. */
export function srgbVec(hex) {
  const c = new THREE.Color(hex), o = {}; c.getRGB(o, THREE.SRGBColorSpace);
  return new THREE.Vector3(o.r, o.g, o.b);
}
/** Relative luminance (0..1) of a hex colour — for sorting palette colours dark → light. */
export function hexLuminance(hex) { const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; }
/** Palette colours sorted dark → light (duplicates removed) — the ramp a dither or toon pass maps luminance onto. */
export function sortByLuminance(colors) {
  return [...new Set(colors.map((c) => '#' + new THREE.Color(c).getHexString()))].sort((a, b) => hexLuminance(a) - hexLuminance(b));
}

/**
 * 2D noise kit for fragment shaders (GLSL ES 3.0 — integer hashes, identical on every GPU).
 * Does not clash with GLSL_NOISE, so both can be included.
 *   float hash21(vec2 p)                 0..1 per integer cell
 *   vec2  hash22(vec2 p)                 0..1
 *   float noise2(vec2 p)                 gradient noise, about -1..1
 *   float fbm2(vec2 p, int octaves)      fractal sum, about -1..1
 *   float ridged2(vec2 p, int octaves)   ridged multifractal 0..1 — sharp crests: ridgelines, veins, ripples, cloud streaks
 *   vec2  warp2(vec2 p, float amount)    domain warp: p pushed along an fbm vector field (marbling, organic edges)
 *   vec3  cellular2(vec2 p)              Voronoi: x = distance to nearest point, y = distance to the cell border, z = cell id 0..1
 */
export const GLSL_NOISE_KIT = /* glsl */`
uint _nkPcg(uint v){ uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
uint _nkH(vec2 p){ ivec2 i = ivec2(floor(p)); return _nkPcg(uint(i.x) + _nkPcg(uint(i.y))); }
float hash21(vec2 p){ return float(_nkH(p)) * (1.0 / 4294967295.0); }
vec2 hash22(vec2 p){ uint h = _nkH(p); return vec2(float(h & 0xffffu), float(h >> 16u)) * (1.0 / 65535.0); }
float noise2(vec2 p){
  vec2 i = floor(p), f = p - i, u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(hash22(i) * 2.0 - 1.0, f), b = dot(hash22(i + vec2(1.0, 0.0)) * 2.0 - 1.0, f - vec2(1.0, 0.0));
  float c = dot(hash22(i + vec2(0.0, 1.0)) * 2.0 - 1.0, f - vec2(0.0, 1.0)), d = dot(hash22(i + vec2(1.0, 1.0)) * 2.0 - 1.0, f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 1.5;
}
float fbm2(vec2 p, int octaves){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 8; i++) { if (i >= octaves) break; s += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + vec2(13.1, -7.7); a *= 0.5; }
  return s;
}
float ridged2(vec2 p, int octaves){
  float a = 0.5, s = 0.0, w = 1.0, norm = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    float n = 1.0 - abs(noise2(p)); n *= n;
    s += a * n * w; norm += a; w = clamp(n * 1.6, 0.0, 1.0);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + vec2(-5.3, 9.2); a *= 0.5;
  }
  return s / norm;
}
vec2 warp2(vec2 p, float amount){
  return p + amount * vec2(fbm2(p + vec2(5.2, 1.3), 3), fbm2(p + vec2(-3.7, 8.1), 3));
}
vec3 cellular2(vec2 p){
  vec2 i = floor(p), f = p - i, mg = vec2(0.0), mr = vec2(0.0); float md = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y)), r = g + hash22(i + g) - f; float d = dot(r, r);
    if (d < md) { md = d; mr = r; mg = g; }
  }
  float edge = 8.0;
  for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
    vec2 g = mg + vec2(float(x), float(y)), r = g + hash22(i + g) - f;
    if (dot(mr - r, mr - r) > 1e-5) edge = min(edge, dot(0.5 * (mr + r), normalize(r - mr)));
  }
  return vec3(sqrt(md), edge, hash21(i + mg + 71.0));
}
`;

/**
 * Anti-banding dither for gradients. Add as the very last statement of a fragment shader that writes
 * display colour (after `#include <colorspace_fragment>`):  gl_FragColor.rgb += ditherNoise(gl_FragCoord.xy);
 * Triangular noise of ±1/255 — invisible, but long sky/paper gradients no longer step in 8 bits.
 */
export const GLSL_DITHER = /* glsl */`
float _dnH(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
vec3 ditherNoise(vec2 fragCoord){ return vec3(_dnH(fragCoord) + _dnH(fragCoord + 71.37) - 1.0) / 255.0; }
`;

const _passVertex = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const _asPass = (p) => (p && typeof p.render === 'function' ? p : new THREE.ShaderPass(p));

/**
 * EffectComposer at the output size, ready to render:  return makeComposer(ctx, { bloom: { strength: 0.6 } });
 *   bloom    false | { strength 0.3–1, radius 0.3–0.8, threshold 0.7–1 } — UnrealBloomPass on the HDR image
 *   linear   passes / pass-shader objects that work on linear HDR colour (before OutputPass), e.g. quietPassShader
 *   display  passes / pass-shader objects that work on final display colour (after OutputPass), e.g.
 *            finishPassShader, ditherPassShader — the last one writes straight to the canvas
 *   samples  MSAA of the scene render (0 for shader-only scenes: faster)
 * Returns { composer, render }; a scene can return it directly.
 */
export function makeComposer(ctx, { bloom = false, linear = [], display = [], samples = 4, scene = ctx.scene, camera = ctx.camera } = {}) {
  const { renderer, width: W, height: H } = ctx;
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples });
  const composer = new THREE.EffectComposer(renderer, rt);
  composer.setPixelRatio(1); composer.setSize(W, H);
  composer.addPass(new THREE.RenderPass(scene, camera));
  if (bloom) composer.addPass(new THREE.UnrealBloomPass(new THREE.Vector2(W, H), bloom.strength ?? 0.6, bloom.radius ?? 0.5, bloom.threshold ?? 0.85));
  for (const p of linear) composer.addPass(_asPass(p));
  composer.addPass(new THREE.OutputPass());
  for (const p of display) composer.addPass(_asPass(p));
  return { composer, render: () => composer.render() };
}

/**
 * Finishing pass for the `display` list of makeComposer: vignette, a grain-free tone curve and the
 * final anti-banding dither.
 *   vignette   0–0.6: how far the corners fall towards `vignetteColor` (default: a darker shade of the image itself)
 *   contrast   -0.3–0.5: S-curve around mid grey (0 = none)
 *   lift       -0.1–0.1: raises / lowers the blacks
 *   gamma      0.8–1.25: mid-tone brightness (1 = none; > 1 brightens)
 *   saturation 0–1.5 (1 = none)
 *   center     [x, y] fraction (y down) the vignette is centred on — pass ctx.focus to keep the hero bright
 */
export function finishPassShader(ctx, { vignette = 0.25, vignetteColor = null, contrast = 0, lift = 0, gamma = 1, saturation = 1, center = null, dither = true } = {}) {
  const c = center ? (Array.isArray(center) ? center : [center.x, center.y]) : [0.5, 0.5];
  return {
    uniforms: {
      tDiffuse: { value: null }, uVig: { value: vignette }, uVigCol: { value: vignetteColor ? srgbVec(vignetteColor) : new THREE.Vector3(-1, -1, -1) },
      uContrast: { value: contrast }, uLift: { value: lift }, uGamma: { value: gamma }, uSat: { value: saturation },
      uCenter: { value: new THREE.Vector2(c[0], c[1]) }, uAsp: { value: new THREE.Vector2(Math.max(ctx.aspect, 1), Math.max(1 / ctx.aspect, 1)) }, uDither: { value: dither ? 1 : 0 },
    },
    vertexShader: _passVertex,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse; uniform float uVig, uContrast, uLift, uGamma, uSat, uDither; uniform vec3 uVigCol; uniform vec2 uCenter, uAsp; varying vec2 vUv;
      ${GLSL_DITHER}
      void main(){
        vec4 t = texture2D(tDiffuse, vUv); vec3 c = t.rgb;
        c = c * (1.0 - uLift) + uLift;
        c = pow(max(c, 0.0), vec3(1.0 / uGamma));
        vec3 s = c * c * (3.0 - 2.0 * c); c = mix(c, s, uContrast);                      // S-curve, no clipping
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = mix(vec3(l), c, uSat);
        vec2 d = (vec2(vUv.x, 1.0 - vUv.y) - uCenter) * uAsp; float v = smoothstep(0.35, 1.25, length(d)) * uVig;
        c = uVigCol.r < 0.0 ? c * (1.0 - v) : mix(c, uVigCol, v);
        gl_FragColor = vec4(clamp(c, 0.0, 1.0) + uDither * ditherNoise(gl_FragCoord.xy), t.a);
      }`,
  };
}

/** Pixel-cell size for chunky-pixel looks: the divisor of `width` nearest to `target` px, so cells tile the frame exactly. */
export function pixelCell(width, target) {
  const t = Math.max(1, Math.round(target)); let best = 1;
  for (let c = 1; c <= Math.min(width, t * 3); c++) if (width % c === 0 && Math.abs(c - t) < Math.abs(best - t)) best = c;
  return best;
}

/**
 * Ordered-dither / pixel pass for the `display` list of makeComposer (must be last: nothing may
 * resample the image afterwards). The frame is cut into square cells; each cell's luminance picks one
 * of 2–6 colours with a Bayer threshold, so gradients become classic dither patterns.
 *   colors     ramp, dark → light (use sortByLuminance(...)); 3–5 reads best
 *   cell       cell size in px — use pixelCell(ctx.width, ctx.unit * 0.55) so it divides the width
 *   bayer      2 | 4 | 8: size of the threshold matrix (8 = smoothest ramps, 2 = coarse checker)
 *   spread     0–1: 1 = full dither between neighbouring colours, 0 = hard posterise
 *   gamma      > 1 lifts mid-tones before quantising (default 1)
 *   background colour for pixels the scene did not draw (render with renderer.setClearAlpha(0)):
 *              the backdrop is then one flat colour, with no dither noise behind type
 *   outline    colour of a one-cell outline around drawn pixels, or null
 *   flatQuiet  true: the rectangles that carry type (ctx.quiet) are forced to `background`, snapped to cells
 *   border     colour of a one-cell frame drawn inside the first quiet rectangle (the copy block) — turns the
 *              flat area into a retro dialog box when the picture runs behind the copy; null = none
 */
export function ditherPassShader(ctx, { colors, cell = 8, bayer = 8, spread = 1, gamma = 1, background = null, outline = null, flatQuiet = true, quietPad = 0, border = null } = {}) {
  const ramp = colors.slice(0, 6), n = ramp.length;
  const bg = background ?? ramp[n - 1];
  const rects = (flatQuiet ? ctx.quiet || [] : []).slice(0, 4).map(([x0, y0, x1, y1]) => new THREE.Vector4(x0 - quietPad, y0 - quietPad, x1 + quietPad, y1 + quietPad));
  while (rects.length < 4) rects.push(new THREE.Vector4(2, 2, 2, 2));
  return {
    uniforms: {
      tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(ctx.width, ctx.height) }, uCell: { value: cell }, uN: { value: n },
      uRamp: { value: [0, 1, 2, 3, 4, 5].map((i) => srgbVec(ramp[Math.min(i, n - 1)])) }, uBg: { value: srgbVec(bg) }, uUseAlpha: { value: background ? 1 : 0 },
      uOutline: { value: srgbVec(outline ?? bg) }, uHasOutline: { value: outline ? 1 : 0 }, uBayer: { value: bayer }, uSpread: { value: spread }, uGamma: { value: gamma },
      uRect: { value: rects }, uBorder: { value: srgbVec(border ?? bg) }, uHasBorder: { value: border ? 1 : 0 },
    },
    vertexShader: _passVertex,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uCell, uUseAlpha, uHasOutline, uBayer, uSpread, uGamma; uniform int uN;
      uniform vec3 uRamp[6]; uniform vec3 uBg, uOutline, uBorder; uniform vec4 uRect[4]; uniform float uHasBorder; varying vec2 vUv;
      float b2(vec2 a){ a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
      float bayerAt(vec2 a){
        float v = b2(a), s = 4.0;
        if (uBayer > 3.0) { v = b2(0.5 * a) * 0.25 + v; s = 16.0; }
        if (uBayer > 7.0) { v = b2(0.25 * a) * 0.0625 + v; s = 64.0; }
        return v + 0.5 / s;
      }
      // mean of the cell (2×2 taps), y measured from the top so the grid is anchored top-left
      vec4 cellAt(vec2 id){
        vec4 s = vec4(0.0);
        for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
          vec2 px = (id + (vec2(float(i), float(j)) + 0.5) * 0.5) * uCell;
          s += texture2D(tDiffuse, vec2(px.x, uRes.y - px.y) / uRes);
        }
        return s * 0.25;
      }
      void main(){
        vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y), id = floor(px / uCell), uvc = (id + 0.5) * uCell / uRes;
        vec4 t = cellAt(id);
        float cover = mix(1.0, t.a, uUseAlpha);
        vec3 src = uUseAlpha > 0.5 ? t.rgb / max(t.a, 1e-3) : t.rgb;
        float l = pow(clamp(dot(src, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0), 1.0 / uGamma);
        float x = l * float(uN - 1), f = fract(x), th = bayerAt(id);
        float stepUp = step(mix(0.5, th, uSpread), f);
        int k = int(clamp(floor(x) + stepUp, 0.0, float(uN - 1)));
        vec3 c = uRamp[k];
        if (cover < 0.5) {
          c = uBg;
          if (uHasOutline > 0.5) {
            float nb = max(max(cellAt(id + vec2(1.0, 0.0)).a, cellAt(id - vec2(1.0, 0.0)).a), max(cellAt(id + vec2(0.0, 1.0)).a, cellAt(id - vec2(0.0, 1.0)).a));
            if (nb >= 0.5) c = uOutline;
          }
        }
        vec2 cs = uCell / uRes;                                             // one cell, as a fraction of the frame
        for (int i = 0; i < 4; i++) {
          vec4 r = uRect[i]; if (!(uvc.x > r.x && uvc.x < r.z && uvc.y > r.y && uvc.y < r.w)) continue;
          bool rim = uvc.x - cs.x < r.x || uvc.x + cs.x > r.z || uvc.y - cs.y < r.y || uvc.y + cs.y > r.w;
          c = (i == 0 && uHasBorder > 0.5 && rim) ? uBorder : uBg;
        }
        gl_FragColor = vec4(c, 1.0);
      }`,
  };
}

/**
 * Float32Array → linearly filterable data texture (half float, so it filters on every WebGL2 device).
 * For simulation grids, height maps and lookup tables computed on the CPU.
 *   channels 1 | 2 | 4;  filter 'linear' (default) or 'nearest';  row 0 of `data` is the TOP of the picture
 *   (sample it with uv.y measured downwards, as the quiet rectangles are).
 */
export function floatTexture(data, width, height, { channels = 1, filter = 'linear' } = {}) {
  const half = new Uint16Array(data.length);
  for (let i = 0; i < data.length; i++) half[i] = THREE.DataUtils.toHalfFloat(data[i]);
  const format = channels === 1 ? THREE.RedFormat : channels === 2 ? THREE.RGFormat : THREE.RGBAFormat;
  const tex = new THREE.DataTexture(half, width, height, format, THREE.HalfFloatType);
  tex.minFilter = tex.magFilter = filter === 'nearest' ? THREE.NearestFilter : THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.generateMipmaps = false; tex.needsUpdate = true;
  return tex;
}

/**
 * Smooth (cubic B-spline) magnification of a small texture:  vec4 textureBicubic(sampler2D t, vec2 uv, vec2 texSize).
 * Use it when a coarse grid is blown up many times and then thresholded or lit — bilinear filtering
 * shows facets and star-shaped highlights there; this costs four bilinear taps. The texture needs LinearFilter.
 */
export const GLSL_BICUBIC = /* glsl */`
vec4 _bcW(float v){ vec4 n = vec4(1.0, 2.0, 3.0, 4.0) - v; vec4 s = n * n * n; float x = s.x, y = s.y - 4.0 * s.x, z = s.z - 4.0 * s.y + 6.0 * s.x; return vec4(x, y, z, 6.0 - x - y - z) * (1.0 / 6.0); }
vec4 textureBicubic(sampler2D t, vec2 uv, vec2 texSize){
  vec2 st = uv * texSize - 0.5, f = fract(st); st -= f;
  vec4 xc = _bcW(f.x), yc = _bcW(f.y), c = st.xxyy + vec2(-0.5, 1.5).xyxy;
  vec4 s = vec4(xc.xz + xc.yw, yc.xz + yc.yw), o = (c + vec4(xc.yw, yc.yw) / s) / texSize.xxyy;
  float sx = s.x / (s.x + s.y), sy = s.z / (s.z + s.w);
  return mix(mix(texture2D(t, o.yw), texture2D(t, o.xw), sx), mix(texture2D(t, o.yz), texture2D(t, o.xz), sx), sy);
}
`;

/**
 * OKLab helpers — mix palette colours perceptually (no muddy or over-dark midpoints in sky gradients, haze, ramps).
 *   oklabVec(hex)                       → THREE.Vector3 (L, a, b) to pass as a uniform
 *   GLSL_OKLAB: vec3 oklabToLinear(vec3 lab)
 * Typical use: keep every colour of a painted scene in OKLab, mix() freely, convert once at the end.
 */
export function oklabVec(hex) {
  const c = new THREE.Color(hex);
  const l = Math.cbrt(0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b), m = Math.cbrt(0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b), s = Math.cbrt(0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b);
  return new THREE.Vector3(0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s);
}
export const GLSL_OKLAB = /* glsl */`
vec3 oklabToLinear(vec3 c){
  float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z, m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z, s = c.x - 0.0894841775 * c.y - 1.291485548 * c.z;
  l = l * l * l; m = m * m * m; s = s * s * s;
  return vec3(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
}
`;

/**
 * Pass for the `linear` list of makeComposer, placed after bloom: brings HDR colours back into the
 * display range by scaling them (not clipping channel by channel), so emissive lights keep their hue
 * — an amber window stays amber with a glow around it instead of burning out to white.
 *   keep 0–1: 1 = full hue preservation, 0 = plain clipping
 */
export function hdrClipPassShader({ keep = 1 } = {}) {
  return {
    uniforms: { tDiffuse: { value: null }, uKeep: { value: keep } },
    vertexShader: _passVertex,
    fragmentShader: /* glsl */`uniform sampler2D tDiffuse; uniform float uKeep; varying vec2 vUv;
      void main(){ vec4 t = texture2D(tDiffuse, vUv); float m = max(max(t.r, t.g), max(t.b, 1.0)); gl_FragColor = vec4(mix(min(t.rgb, 1.0), t.rgb / m, uKeep), t.a); }`,
  };
}

/**
 * Paint on a 2D canvas and get it back as a texture:  canvasTexture(w, h, (g, w, h) => { g.fillRect(...) })
 * For hand-made looks that are easier to draw than to shade (washes, brush marks, stamped shapes).
 *   srgb   true: colours painted are display colours and arrive linear in the shader (default);
 *          false: raw values — do your own maths in display space
 * The picture is upright when sampled with the usual vUv of backgroundQuad (not the y-down poster uv).
 * Keep the canvas ≤ ~2048 px on the long side for soft content and let the shader add the fine grain.
 */
export function canvasTexture(width, height, draw, { srgb = true, filter = 'linear' } = {}) {
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(width)); c.height = Math.max(1, Math.round(height));
  const g = c.getContext('2d', { willReadFrequently: true });           // stays on the CPU: many small fills are faster there than on software GL
  draw(g, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; tex.generateMipmaps = false;
  tex.minFilter = tex.magFilter = filter === 'nearest' ? THREE.NearestFilter : THREE.LinearFilter; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * Watercolour-style polygon deformation (after Tyler Hobbs): every edge gets a new midpoint pushed
 * sideways by a random amount proportional to the edge's length; repeated `rounds` times the outline
 * becomes a ragged, fractal wash edge. Draw 30–60 differently deformed copies of one base shape at
 * 3–6 % opacity and the overlaps build a wash that is dense in the middle and feathered at the rim.
 *   points  [[x, y, v?], …] closed polygon; v (default 1) is the local variance: 0.2 keeps that part of
 *           the edge crisp, 1.5 lets it bleed — vary it around the shape so the edge is not uniformly fuzzy
 *   rounds  3–5 (each doubles the point count);  amount 0.3–0.6: how far midpoints move (× edge length)
 *   spread  0–1.2: how far the push may lean away from the edge normal (radians, gaussian)
 * Returns a new array of [x, y, v].
 */
export function deformPolygon(points, rng, { rounds = 3, amount = 0.42, spread = 0.7 } = {}) {
  let cur = points;
  for (let r = 0; r < rounds; r++) {
    const next = new Array(cur.length * 2);
    for (let i = 0; i < cur.length; i++) {
      const a = cur[i], b = cur[(i + 1) % cur.length], ex = b[0] - a[0], ey = b[1] - a[1], len = Math.hypot(ex, ey);
      const v = ((a[2] ?? 1) + (b[2] ?? 1)) / 2, ang = Math.atan2(ey, ex) + Math.PI / 2 + rng.gauss() * spread, d = rng.gauss() * amount * v * len;
      next[i * 2] = a;
      next[i * 2 + 1] = [(a[0] + b[0]) / 2 + Math.cos(ang) * d, (a[1] + b[1]) / 2 + Math.sin(ang) * d, Math.min(2, Math.max(0.05, v * (0.82 + rng() * 0.36)))];
    }
    cur = next;
  }
  return cur;
}
