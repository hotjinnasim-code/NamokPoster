// Caustics — sunlight through moving water. The light pattern is computed the way it forms: a fine mesh of
// "sun rays" is laid over the water surface, every vertex is refracted through the slope of a wave field
// (a sum of sine swells and ripples) and lands on the floor; where the mesh bunches up the light is bright,
// where it spreads the floor is dim, and where it folds over the caustic lines appear. Brightness is the
// inverse of the area change (the Jacobian of the refraction map), accumulated additively in a float
// target; three passes with slightly different refraction give the colour fringes. A second shader then
// looks down through the same surface: floor pattern and light are seen displaced by the waves, with sun
// glints on top and, optionally, something floating that throws a shadow.
// params.motif:
//   pool   square pool tiles, a darker lane line, a swim ring and its shadow
//   sand   shallow sea over rippled sand, shading into deeper water behind the copy; a few small fish
//   gel    abstract — pools of coloured liquid on a plain ground, each throwing its own caustic net and
//          mixing subtractively where they overlap
//
// Palette: bg = the water / ground behind the copy · colors[0] = depth and shadow colour (grout, lane line,
//          deep water) · colors[1] = pale light colour (lit sand, highlights) · colors[2], colors[3] = floating
//          things · gel: colors[0..2] are the three liquids · accent = ring stripes, one fish
import { backgroundQuad, quietUniforms, GLSL_QUIET, GLSL_NOISE_KIT } from '/skill/assets/web/scene-lib.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const NW = 14, NB = 9;

const GLSL_WAVES = /* glsl */`
#define NW ${NW}
#define NB ${NB}
uniform vec4 uWave[NW];      // unit direction xy, wavenumber k, focusing strength s at the crest
uniform vec4 uWave2[NW];     // phase, crest sharpness kappa, sideways wiggle (amount, wavenumber)
uniform vec4 uBlob[NB];      // gel pools: centre xy, radius, liquid index
// Refraction offset of a vertical ray entering the water at x (short-side units), and its Jacobian. Each wave
// train has narrow crests and broad flat troughs (profile exp(kappa (sin t - 1))): a crest is a strong little
// lens that focuses light into a line, a trough spreads it thinly — which is what draws a net of bright lines
// round dim cells instead of round blotches. The crests wiggle sideways so the lines are not ruled.
vec2 waveShift(vec2 x, out mat2 J){
  vec2 g = vec2(0.0); J = mat2(0.0);
  for (int i = 0; i < NW; i++) {
    vec4 w = uWave[i], v = uWave2[i]; vec2 d = w.xy, e = vec2(-d.y, d.x);
    float side = dot(e, x) * v.w + v.x * 1.7, th = dot(d, x) * w.z + v.x + v.z * sin(side);
    vec2 m = d * w.z + e * (v.z * v.w * cos(side));                           // gradient of the phase
    float sn = sin(th), cs = cos(th), f = exp(v.y * (sn - 1.0)), A = w.w / (w.z * w.z);
    g += m * (A * cs * f);
    J += A * f * ((v.y * cs * cs - sn) * mat2(m.x * m.x, m.x * m.y, m.x * m.y, m.y * m.y) - cs * v.z * v.w * v.w * sin(side) * mat2(e.x * e.x, e.x * e.y, e.x * e.y, e.y * e.y));
  }
  return g;
}
// one liquid's pool: the summed blob field (its edge is the 0.46 contour)
float pool(vec2 x, float id){
  float f = 0.0;
  for (int i = 0; i < NB; i++) { vec4 b = uBlob[i]; if (abs(b.w - id) > 0.5) continue; vec2 d = x - b.xy; f += exp(-dot(d, d) / (b.z * b.z)); }
  return f;
}
`;

export default function build(ctx) {
  const { THREE, scene, camera, renderer, palette, params, aspect, rng, unit, width: W, height: H } = ctx;
  const sx = Math.max(aspect, 1), sy = Math.max(1 / aspect, 1);            // frame fraction → short-side units
  const P = {
    motif: String(params.motif ?? 'pool'), waves: clamp(params.waves ?? 1, 0.2, 2.2), scale: clamp(params.scale ?? 1, 0.4, 2.5), fringe: clamp(params.fringe ?? 1, 0, 3),
    float: String(params.float ?? 'auto'), glint: clamp(params.glint ?? 1, 0, 2.5), tiles: clamp(params.tiles ?? 1, 0.4, 2.5), grain: clamp(params.grain ?? 1, 0, 2.5),
  };
  const gel = P.motif === 'gel', sand = P.motif === 'sand';
  const cols = palette.colors?.length ? palette.colors : [palette.ink, palette.accent];
  const C = (i) => new THREE.Color(cols[Math.min(i, cols.length - 1)]);
  const bgc = new THREE.Color(palette.bg), dark = bgc.getHSL({}).l < 0.35, accent = new THREE.Color(palette.accentOriginal ?? palette.accent);
  const F = { x: ctx.focus.x * sx, y: ctx.focus.y * sy }, S = clamp(ctx.artSize ?? 0.7, 0.3, 1.1);
  const copy = ctx.quiet?.[0], copyC = copy ? { x: ((copy[0] + copy[2]) / 2) * sx, y: ((copy[1] + copy[3]) / 2) * sy } : { x: F.x - 1, y: F.y };
  const away = (() => { const dx = F.x - copyC.x, dy = F.y - copyC.y, l = Math.hypot(dx, dy) || 1; return { x: dx / l, y: dy / l }; })();   // from the copy towards the art

  // ---- wave fields
  const waveSet = (strength, scale, mainDir) => {
    const w = [], w2 = [];
    const push = (lam, th, s, kappa, wig) => { const k = (2 * Math.PI) / (lam * scale); w.push(new THREE.Vector4(Math.cos(th), Math.sin(th), k, s * strength)); w2.push(new THREE.Vector4(rng() * 6.2832, kappa, wig, k * rng.range(0.28, 0.5))); };
    for (let i = 0; i < 3; i++) push(rng.range(0.3, 0.5), mainDir + rng.range(-1.0, 1.0), rng.range(0.1, 0.18), 1.0, 0.3);                               // long swells: broad light and dark
    for (let i = 0; i < 7; i++) push(rng.range(0.11, 0.2), mainDir + (i % 2 ? 1.25 : 0) + rng.range(-0.55, 0.55), rng.range(0.62, 0.98), rng.range(2.2, 3.4), rng.range(0.7, 1.5));   // two crossing families of crests: the net
    for (let i = 0; i < 4; i++) push(rng.range(0.06, 0.1), rng() * 6.2832, rng.range(0.1, 0.2), 1.5, rng.range(0.5, 1.2));                             // fine chop
    return { w, w2 };
  };
  const mainDir = rng() * 6.2832;
  const water = waveSet(P.waves, P.scale, mainDir);

  // ---- gel pools: three liquids, each a few merged blobs gathered round the focus
  const blobs = [];
  if (gel) {
    const a0 = rng() * 6.2832;
    for (let id = 0; id < 3; id++) {
      const a = a0 + (id * 2 * Math.PI) / 3 + rng.range(-0.3, 0.3), d = rng.range(0.12, 0.2) * S, cx = F.x + Math.cos(a) * d, cy = F.y + Math.sin(a) * d * 0.9, r = rng.range(0.2, 0.26) * S;
      blobs.push(new THREE.Vector4(cx, cy, r, id));
      for (let k = 0; k < 2; k++) { const b = a + rng.range(-1.3, 1.3), rr = r * rng.range(0.4, 0.62); blobs.push(new THREE.Vector4(cx + Math.cos(b) * (r * 0.6 + rr * 0.5), cy + Math.sin(b) * (r * 0.6 + rr * 0.5), rr, id)); }
    }
    // a small satellite drop or two
    blobs.pop(); blobs.push(new THREE.Vector4(F.x + Math.cos(a0 + 2.6) * 0.47 * S, F.y + Math.sin(a0 + 2.6) * 0.42 * S, 0.055 * S, rng.int(0, 2)));
  }
  while (blobs.length < NB) blobs.push(new THREE.Vector4(99, 99, 0.01, 9));
  const gelSets = gel ? [0, 1, 2].map(() => waveSet(P.waves * 1.05, P.scale * 0.8, rng() * 6.2832)) : [];

  // ---- the ray mesh (short-side units, a margin beyond the frame so that light can come in from outside)
  const step = Math.max(2.4, Math.sqrt((W * H) / 1.15e6)) / Math.min(W, H), margin = 0.1;
  const nx = Math.ceil((sx + 2 * margin) / step), ny = Math.ceil((sy + 2 * margin) / step);
  const pos = new Float32Array((nx + 1) * (ny + 1) * 3), idx = new Uint32Array(nx * ny * 6);
  for (let j = 0, k = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) { pos[k++] = -margin + i * step; pos[k++] = -margin + j * step; pos[k++] = 0; }
  for (let j = 0, k = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = i + j * (nx + 1), b = a + 1, c = a + nx + 1, d = c + 1; idx[k++] = a; idx[k++] = b; idx[k++] = c; idx[k++] = b; idx[k++] = d; idx[k++] = c; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const rayMat = (set, depth, chan, id, tinted) => new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false, transparent: true, side: THREE.DoubleSide, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    uniforms: { uWave: { value: set.w }, uWave2: { value: set.w2 }, uBlob: { value: blobs }, uAsp: { value: new THREE.Vector2(sx, sy) }, uDepth: { value: depth }, uChan: { value: chan }, uId: { value: id }, uTinted: { value: tinted }, uPx: { value: 1 / Math.min(W, H) }, ...quietUniforms(ctx) },
    vertexShader: /* glsl */`
      uniform vec2 uAsp; uniform float uDepth, uId, uTinted; varying float vI; varying vec2 vX;
      ${GLSL_WAVES}
      ${GLSL_QUIET}
      void main(){
        vec2 x = position.xy; mat2 J; vec2 g = waveShift(x, J);
        float amp = uDepth;
        if (uId > -0.5) {                                                    // a gel pool: ripples only inside it, swelling in from the edge
          float f = pool(x, uId), cover = smoothstep(0.43, 0.5, f); amp *= smoothstep(0.46, 1.2, f);
          vI = mix(1.0 - cover, cover, uTinted);
        } else {
          amp *= 1.0 - 0.78 * quietMask(x / uAsp, 0.1);                       // calmer water where the copy sits
          vI = 1.0;
        }
        J *= amp; g *= amp;
        vX = x;
        vec2 f = (x + g) / uAsp;
        gl_Position = vec4(f.x * 2.0 - 1.0, 1.0 - f.y * 2.0, 0.0, 1.0);
      }`,
    // brightness = how much water surface sends its light to this pixel: the area of surface per area of floor.
    // Measured per triangle from screen-space derivatives, so the light is conserved exactly, folds included.
    fragmentShader: /* glsl */`uniform vec3 uChan; uniform float uPx; varying float vI; varying vec2 vX;
      void main(){ vec2 a = dFdx(vX), b = dFdy(vX); float I = min(abs(a.x * b.y - a.y * b.x) / (uPx * uPx), 14.0); gl_FragColor = vec4(uChan * (vI * I), 1.0); }`,
  });
  const mk = (mat) => { const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; return m; };
  const chan = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
  const sceneU = new THREE.Scene(), sceneA = new THREE.Scene();
  const fr = 0.02 * P.fringe;
  if (gel) for (let i = 0; i < 3; i++) { sceneU.add(mk(rayMat(gelSets[i], 1, chan[i], i, 0))); sceneA.add(mk(rayMat(gelSets[i], 1, chan[i], i, 1))); }
  else for (let i = 0; i < 3; i++) sceneU.add(mk(rayMat(water, 1 + (i - 1) * fr, chan[i], -1, 0)));
  const rtOpts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
  const rtU = new THREE.WebGLRenderTarget(W, H, rtOpts), rtA = gel ? new THREE.WebGLRenderTarget(W, H, rtOpts) : null;

  // ---- floating things (short-side units)
  const floatKind = P.float === 'auto' ? (gel ? 'none' : sand ? 'fish' : 'ring') : P.float;
  const sun = (() => { const a = rng.range(-2.4, -2.0); return { x: Math.cos(a), y: Math.sin(a) }; })();      // the direction light comes from (upper left)
  const ring = new THREE.Vector4(F.x + away.x * 0.02, F.y + away.y * 0.02, floatKind === 'ring' ? 0.3 * S : 0, 0.56);
  const fish = [];
  if (floatKind === 'fish') {
    const head = rng() * 6.2832, n = 6;
    for (let i = 0; i < n; i++) { const a = head + rng.range(-0.35, 0.35), r = i === 0 ? 0 : rng.range(0.1, 0.36) * S, b = rng() * 6.2832; fish.push(new THREE.Vector4(F.x + Math.cos(b) * r, F.y + Math.sin(b) * r * 0.8, a, (i === 0 ? 0.075 : rng.range(0.04, 0.062)) * S)); }
  }
  while (fish.length < 6) fish.push(new THREE.Vector4(99, 99, 0, 0.001));
  const tileA = rng.range(0.14, 0.3) * rng.sign(), tile = (0.062 / P.tiles) * (0.75 + 0.5 * S);
  // the lane line runs along the tile axis that points least at the copy, on the far side of the focus
  const ax = [{ x: Math.cos(tileA), y: Math.sin(tileA) }, { x: -Math.sin(tileA), y: Math.cos(tileA) }];
  const laneAxis = Math.abs(ax[0].x * away.x + ax[0].y * away.y) > Math.abs(ax[1].x * away.x + ax[1].y * away.y) ? 1 : 0;      // 0: band runs along axis 0 (varies in axis 1)
  const nrm = ax[1 - laneAxis], laneAt = (F.x * nrm.x + F.y * nrm.y) + Math.sign(away.x * nrm.x + away.y * nrm.y || 1) * 0.36 * S;

  scene.add(backgroundQuad(/* glsl */`
    varying vec2 vUv; uniform sampler2D tU, tA; uniform vec2 uAsp, uFocus, uSun, uAway; uniform vec3 bg, cDeep, cPale, cA, cB, cAcc, uLane;
    uniform float uDebug, uMotif, uDark, uView, uGlint, uPx, uTile, uTileA, uS, uGrain, uGrainPx; uniform vec4 uRing, uFish[6];
    ${GLSL_WAVES}
    ${GLSL_QUIET}
    ${GLSL_NOISE_KIT}
    vec3 lightAt(vec2 xf){ vec2 uv = vec2(xf.x / uAsp.x, 1.0 - xf.y / uAsp.y), o = 1.1 * uPx / uAsp;                 // the sun is not a point: a touch of blur
      return 0.25 * (texture2D(tU, uv + o * vec2(1.0, 0.5)).rgb + texture2D(tU, uv + o * vec2(-0.5, 1.0)).rgb + texture2D(tU, uv + o * vec2(-1.0, -0.5)).rgb + texture2D(tU, uv + o * vec2(0.5, -1.0)).rgb); }
    float ringShape(vec2 x, float soft){ float r = length(x - uRing.xy); return smoothstep(uRing.z * uRing.w - soft, uRing.z * uRing.w + soft, r) * (1.0 - smoothstep(uRing.z - soft, uRing.z + soft, r)); }
    float fishShape(vec2 x, vec4 f, float soft){
      vec2 d = x - f.xy; float c = cos(f.z), s = sin(f.z); vec2 q = vec2(c * d.x + s * d.y, -s * d.x + c * d.y) / f.w;          // +x = heading
      float body = length(vec2(q.x * (q.x > 0.0 ? 1.1 : 0.8), q.y * (3.6 + 2.2 * smoothstep(0.1, -1.1, q.x)))) - 1.0;      // slim, tapering towards the tail
      float tx = -q.x - 1.0, tail = max(max(abs(q.y) - 0.42 * tx, -tx), tx - 0.7 + 0.5 * (0.3 - abs(q.y)));               // a forked tail fin
      float fin = max(abs(abs(q.y) - 0.3 - 0.5 * (0.2 - q.x)) - 0.07, max(q.x - 0.2, -0.25 - q.x));                         // two small side fins
      return 1.0 - smoothstep(-soft, soft, min(min(body, tail), fin) * f.w);
    }
    void main(){
      vec2 fr = vec2(vUv.x, 1.0 - vUv.y), p = fr * uAsp;
      float quiet = quietMask(fr, 0.1);
      mat2 J; vec2 g = waveShift(p, J) * (1.0 - 0.78 * quiet);
      vec3 col;
      if (uMotif > 1.5) {
        // ---- gel: light on a plain ground; each liquid filters the light and redistributes it
        vec3 U = texture2D(tU, vUv).rgb, A = texture2D(tA, vUv).rgb;
        if (uDark < 0.5) {
          vec3 g0 = mix(vec3(1.0), cDeep, 0.66), g1 = mix(vec3(1.0), cPale, 0.66), g2 = mix(vec3(1.0), cA, 0.66);
          col = bg * (U.r + A.r * g0) * (U.g + A.g * g1) * (U.b + A.b * g2);
          col = mix(col, bg, 0.85 * quiet);
        } else {
          col = bg + (cDeep * A.r + cPale * A.g + cA * A.b) * 0.62 * (1.0 - 0.9 * quiet);
        }
        col = min(col, vec3(1.0)) + 0.35 * (1.0 - exp(-max(col - 1.0, 0.0)));           // the hottest lines roll off instead of clipping flat
      } else {
        // ---- water: the floor seen through the surface
        vec2 xf = p + uView * g;                                               // floor point under this pixel
        vec3 I = lightAt(xf);
        float lum = dot(I, vec3(0.3333));
        vec3 base; float shadow = 0.0;
        if (uMotif < 0.5) {
          // pool tiles
          float c = cos(uTileA), s = sin(uTileA); vec2 q = vec2(c * xf.x + s * xf.y, -s * xf.x + c * xf.y) / uTile;
          vec2 id = floor(q), f = q - id; float var = hash21(id), var2 = hash21(id + 37.0);
          float gw = 0.055, aa = 1.5 * uPx / uTile, grout = 1.0 - smoothstep(gw, gw + aa, f.x) * smoothstep(gw, gw + aa, f.y) * smoothstep(gw, gw + aa, 1.0 - f.x) * smoothstep(gw, gw + aa, 1.0 - f.y);
          base = bg * (0.94 + 0.12 * var) * (1.0 + 0.05 * (var2 - 0.5));
          base = mix(base, mix(base, cPale, 0.5), mix(0.12, 0.05, uDark) * step(0.86, var2));
          float lq = (uLane.z > 0.5 ? q.x : q.y) - uLane.x, lane = step(0.0, lq) * step(lq, 3.0) * (1.0 - 0.9 * quiet);
          base = mix(base, mix(cDeep, bg, 0.12 + 0.1 * var), lane);
          base = mix(base, mix(cDeep, bg, 0.55), grout * (0.5 - 0.3 * quiet));
          base *= 1.0 - 0.06 * (1.0 - smoothstep(0.0, 0.35, min(min(f.x, f.y), min(1.0 - f.x, 1.0 - f.y))));           // tiles are a touch darker towards the joints
        } else {
          // rippled sand, sinking into deeper water towards the copy
          vec2 q = xf / uS;
          float rip = sin(dot(q, vec2(0.34, 0.94)) * 46.0 + 5.0 * fbm2(q * 1.7, 3) + 1.5 * noise2(q * 5.0));
          float fine = noise2(xf * 260.0) * 0.5 + noise2(xf * 610.0) * 0.5;
          vec3 sandc = cPale * (0.93 + 0.07 * rip + 0.035 * fine);
          vec3 pb = cellular2(xf * 34.0); sandc = mix(sandc, cPale * (pb.z > 0.5 ? 0.7 : 1.08), 0.8 * smoothstep(0.16, 0.09, pb.x) * step(0.93, hash21(floor(xf * 34.0) + 5.0)));
          float deep = smoothstep(0.42, -0.5, dot(xf - uFocus, uAway) / uS + 0.12 * fbm2(q * 1.3 + 4.0, 3));
          deep = max(deep, quiet);
          base = mix(sandc * mix(vec3(1.0), bg, 0.3), bg, deep * 0.94);
          base = mix(base, base * mix(cDeep, vec3(1.0), 0.55), 0.3 * smoothstep(0.5, 1.0, deep));
          lum = mix(lum, 1.0, 0.25 * deep); I = mix(I, vec3(1.0), 0.25 * deep);
        }
        // shadows of what floats or swims above the floor (they shiver with the waves)
        vec2 xs = xf + uSun * 0.07 * uS + 0.6 * uView * g;
        if (uRing.z > 0.0) shadow = max(shadow, ringShape(xs, 0.012));
        for (int i = 0; i < 6; i++) if (uFish[i].w > 0.002) shadow = max(shadow, 0.8 * fishShape(xf + uSun * 0.03 * uS, uFish[i], 0.006));
        // light: ambient + sun through the waves; the brightest lines go pale
        vec3 Ld = I * (1.0 - 0.85 * shadow);
        float k = mix(0.3, 0.5, uDark) * mix(1.0, 0.5, quiet);
        col = base * (1.0 - k + k * min(Ld, 4.0)) * (1.0 - 0.22 * shadow);
        col = mix(col, col * mix(cDeep, vec3(1.0), 0.5), 0.35 * shadow);
        vec3 hot = smoothstep(vec3(2.2), vec3(7.0), Ld) * (1.0 - 0.7 * quiet);                 // only the caustic lines themselves burn out (per channel: the fringes)
        col = mix(col, mix(cPale, vec3(1.0), 0.6), 0.9 * hot);
        // fish swim between surface and floor
        for (int i = 0; i < 6; i++) if (uFish[i].w > 0.002) {
          float m = fishShape(p + 0.55 * uView * g, uFish[i], 1.2 * uPx);
          vec3 fc = i == 0 ? cAcc : mix(cDeep, bg, 0.18) * 0.62; col = mix(col, fc * (0.8 + 0.2 * lum), m * 0.94);
        }
        // sun glints: tiny mirrors where the slope turns the sky's brightest spot to the eye
        float gl = smoothstep(0.016, 0.004, length(g - vec2(0.013, -0.009))) * smoothstep(0.45, 0.9, noise2(p * 70.0) * 0.5 + 0.5);
        col += vec3(1.0) * 0.55 * uGlint * gl * (1.0 - quiet);
        // the swim ring rides on the surface
        if (uRing.z > 0.0) {
          vec2 d = p - uRing.xy; float r = length(d), ri = uRing.z * uRing.w, ro = uRing.z, t = clamp((r - ri) / (ro - ri), 0.0, 1.0), aa = 1.2 * uPx;
          float m = smoothstep(ri - aa, ri + aa, r) * (1.0 - smoothstep(ro - aa, ro + aa, r));
          float ang = atan(d.y, d.x), seg = 0.5 + 0.5 * sin(ang * 6.0 + 0.6), stripe = smoothstep(0.5 - 0.02 / max(r / ro, 0.2), 0.5 + 0.02 / max(r / ro, 0.2), seg);
          vec3 n = vec3(normalize(d + 1e-5) * (2.0 * t - 1.0), sqrt(max(1.0 - (2.0 * t - 1.0) * (2.0 * t - 1.0), 0.0)));
          vec3 L = normalize(vec3(uSun * 0.75, 0.8)); float dif = clamp(dot(n, L), 0.0, 1.0), wrap = 0.55 + 0.45 * dif;
          vec3 rc = mix(vec3(0.985, 0.975, 0.955), cAcc, stripe) * wrap; rc = mix(rc, rc * mix(bg, vec3(1.0), 0.5), 0.5 * (1.0 - n.z));      // the water's colour creeps up the sides
          rc += vec3(1.0) * 0.5 * pow(clamp(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0, 1.0), 40.0);
          col = mix(col, col * 0.72, 0.5 * (smoothstep(ro + 0.02 * uS, ro, r) * smoothstep(ri - 0.02 * uS, ri, r)) * (1.0 - m));     // contact shade on the water
          col = mix(col, rc, m);
        }
      }
      if (uDebug > 0.5) col = vec3(texture2D(tU, vUv).r * 0.5);
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
      vec2 gc = floor(gl_FragCoord.xy / uGrainPx); float nz = hash21(gc) + hash21(gc + 57.3) - 1.0;
      gl_FragColor.rgb = clamp(gl_FragColor.rgb + nz * uGrain, 0.0, 1.0);
    }`, {
    tU: { value: rtU.texture }, tA: { value: rtA ? rtA.texture : rtU.texture }, uWave: { value: water.w }, uWave2: { value: water.w2 }, uBlob: { value: blobs },
    uAsp: { value: new THREE.Vector2(sx, sy) }, uFocus: { value: new THREE.Vector2(F.x, F.y) }, uSun: { value: new THREE.Vector2(sun.x, sun.y) }, uAway: { value: new THREE.Vector2(away.x, away.y) },
    bg: { value: bgc }, cDeep: { value: C(0) }, cPale: { value: C(1) }, cA: { value: C(2) }, cB: { value: C(3) }, cAcc: { value: accent },
    uDebug: { value: params.debug ? 1 : 0 }, uMotif: { value: gel ? 2 : sand ? 1 : 0 }, uDark: { value: dark ? 1 : 0 }, uView: { value: 0.8 }, uGlint: { value: P.glint }, uPx: { value: 1 / Math.min(W, H) },
    uTile: { value: tile }, uTileA: { value: tileA }, uS: { value: S }, uLane: { value: new THREE.Vector3(Math.round(laneAt / tile) - 1, 0, laneAxis === 1 ? 1 : 0) },
    uRing: { value: ring }, uFish: { value: fish.slice(0, 6) }, uGrain: { value: 0.016 * P.grain }, uGrainPx: { value: Math.max(1, unit / 10.8) }, ...quietUniforms(ctx),
  }));

  ctx.frame({ radius: 1, fov: 30, dir: [0, 0, 1] });   // a view straight down: composed in frame space around ctx.focus

  return {
    render() {
      const prev = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha();
      renderer.setClearColor(0x000000, 0);
      renderer.setRenderTarget(rtU); renderer.clear(); renderer.render(sceneU, camera);
      if (rtA) { renderer.setRenderTarget(rtA); renderer.clear(); renderer.render(sceneA, camera); }
      renderer.setRenderTarget(null); renderer.setClearColor(prev, prevA); renderer.render(scene, camera);
    },
  };
}
