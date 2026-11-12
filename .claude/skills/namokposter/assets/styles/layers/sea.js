// Sea and horizon — a full-picture scene: open water to a low horizon under a wide sky, a low sun
// or moon at the layout focus with its glitter path on stylised wave bands that widen towards the
// viewer, thin cloud streaks, far islands and a small sail. One fragment shader paints the picture;
// the horizon is placed from the measured copy, so type sits either wholly in the sky or wholly on
// calm water, never across the horizon line.
//
// Palette: bg = upper sky (behind the copy) · colors[0] = the sea · colors[1] = islands, cloud and wave shade
//          colors[2] = glow at the horizon · colors[3] = optional mid-sky tone · accent = sun / moon and its glitter on
//          dark skies (never a red disc: see the note at the colours below)
import { makeNoise, backgroundQuad } from '/skill/assets/web/scene-lib.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export default function build(ctx) {
  const { THREE, scene, palette, params, aspect, seed, rng, width: W, height: H } = ctx;
  const sx = Math.max(aspect, 1), sy = Math.max(1 / aspect, 1);          // frame fraction → short-side units
  // "auto" lets a palette carry the weather that belongs to its mood (the stormy palette asks for lively water and no stars)
  const auto = (k, d) => (params[k] == null || params[k] === 'auto' ? palette[k] ?? d : params[k]);
  const P = {
    waves: Number(auto('waves', 1)), glitter: params.glitter ?? 1, clouds: Number(auto('clouds', 1)), islands: params.islands ?? 2,
    boat: params.boat ?? true, birds: params.birds ?? 4, dip: params.dip ?? 0.2, sun: params.sun ?? 1,
    body: params.body ?? 'auto', stars: auto('stars', 'auto'),
  };

  // ---- colours in OKLab
  const lab = (hex) => {
    const c = new THREE.Color(hex);
    const l = Math.cbrt(0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b), m = Math.cbrt(0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b), s = Math.cbrt(0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b);
    return new THREE.Vector3(0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s);
  };
  const cols = palette.colors;
  const bg = lab(palette.bg), sea = lab(cols[0]), shade = lab(cols[1] ?? cols[0]), hor = lab(cols[2] ?? palette.accent);
  const sky2 = cols[3] ? lab(cols[3]) : bg.clone().lerp(hor, 0.45);
  // The disc is a plain disc with a soft round glow, and it is never a red one (a red disc on a pale
  // field reads as a flag, not as a sun): under a pale sky it is a pale golden disc held by its warm
  // glow, under a dark sky a red accent is turned to amber. The accent keeps its own colour in the type.
  const dark = bg.x < 0.5, accent = lab(palette.accentOriginal ?? palette.accent);
  const hueDeg = ((Math.atan2(accent.z, accent.y) * 180) / Math.PI + 360) % 360, reddish = Math.hypot(accent.y, accent.z) > 0.06 && (hueDeg < 55 || hueDeg > 325);
  const acc = !dark ? hor.clone().lerp(new THREE.Vector3(0.945, 0.004, 0.115), 0.8) : reddish ? new THREE.Vector3(Math.max(accent.x, 0.82), 0.04, 0.125) : accent;
  const moon = P.body === 'moon' || (P.body !== 'sun' && dark && Math.hypot(accent.y, accent.z) < 0.075 && accent.x > 0.8);
  const showStars = P.stars === 'auto' ? dark : !!P.stars && P.stars !== 'none';

  // ---- where the copy sits
  const quiet = (ctx.quiet || []).map(([x0, y0, x1, y1]) => ({ x0, y0, x1, y1 }));
  const strip = (r) => r.x0 <= 0.02 && r.x1 >= 0.98;
  const footer = quiet.find((r) => strip(r) && r.y1 >= 0.98 && r.y0 > 0.5), header = quiet.find((r) => strip(r) && r.y0 <= 0.02 && r.y1 < 0.5);
  const blocks = quiet.filter((r) => r !== footer && r !== header);
  const footTop = footer ? footer.y0 : 1, headBot = header ? header.y1 : 0;

  // ---- hero and horizon. The hero stays on the focus; the horizon goes just under it, unless that
  // would run the horizon through the copy — then the sea starts below the copy (a higher sun) or
  // above it (copy on the water). Copy lying on the focus pushes the sun down to the horizon.
  let hx = ctx.focus.x, hy = ctx.focus.y, rS = (0.045 + 0.05 * clamp(ctx.artSize ?? 0.6, 0.3, 1)) * P.sun, dip = P.dip;
  for (const b of blocks) {
    const rx = rS / sx, ry = rS / sy;
    if (!(hx > b.x0 - rx && hx < b.x1 + rx && hy > b.y0 - ry && hy < b.y1 + ry)) continue;
    rS *= 0.9;
    const below = b.y1 + (rS / sy) * 1.2;
    if (1 - below >= 0.1) { hy = below; dip = Math.max(dip, 0.45); } else hy = Math.max(headBot + (rS / sy) * 1.5, b.y0 - (rS / sy) * 1.7);
  }
  const rx = rS / sx, ry = rS / sy;
  let yH = hy + ry * (1.3 - 1.6 * dip);
  for (const b of blocks) {
    if (!(yH > b.y0 - 0.03 && yH < b.y1 + 0.03)) continue;
    yH = b.y0 < hy ? b.y1 + 0.035 : Math.min(yH, b.y0 - 0.035);
  }
  yH = clamp(yH, Math.min(hy - ry * 0.4, 0.9), 0.9);
  const seaDepth = (1 - yH) * sy;
  const high = (yH - hy) * sy > rS * 2.6;                                  // the sun stands well clear of the horizon: its glow on the horizon is a pool under it, not a band
  // the sky keeps its plain upper tone down to the foot of any copy that stands in it, and only then begins to warm
  let skyTop = Math.max(headBot, 0);
  for (const b of blocks) if (b.y1 < yH + 0.02) skyTop = Math.max(skyTop, b.y1 - 0.04);
  skyTop = Math.min(skyTop, yH - 0.14 / sy);

  // ---- islands on the horizon: a silhouette profile (height above the horizon, short-side units)
  const TW = Math.min(4096, 2 ** Math.ceil(Math.log2(W)));
  const data = new Float32Array(TW * 4), noise = makeNoise(seed * 17 + 3);
  const room = (x) => { let r = 9; for (const b of blocks) if (x > b.x0 - 0.03 && x < b.x1 + 0.03 && b.y1 < yH + 0.01) r = Math.min(r, (yH - b.y1 - 0.025) * sy); return Math.max(r, 0); };
  const nIsl = clamp(Math.round(P.islands), 0, 4), isl = [];
  for (let tries = 0; tries < 60 && isl.length < nIsl; tries++) {
    const far = isl.length % 2 === 1, w = rng.range(0.16, 0.34) * (far ? 0.7 : 1), x = rng.range(0.02, 0.98), h = w * rng.range(0.16, 0.26);
    if (Math.abs(x - hx) * sx < rS * 2.4 + w * 0.5) continue;                                    // keep the glitter path open
    if (isl.some((o) => Math.abs(o.x - x) * sx < (o.w + w) * 0.42)) continue;
    isl.push({ x, w, h: Math.min(h, room(x) * 0.8), far, off: rng.range(0, 99) });
  }
  for (let k = 0; k < TW; k++) {
    const x = k / (TW - 1); let near = 0, far = 0;
    for (const o of isl) {
      const u = ((x - o.x) * sx) / (o.w * 0.5); if (Math.abs(u) >= 1) continue;
      const env = Math.pow(1 - u * u, 1.3) * (0.62 + 0.38 * Math.cos(u * 2.2 + o.off));
      const hgt = o.h * Math.max(0, env * (0.72 + 0.55 * noise.fbm(u * 2.2 + o.off, o.off, 0.3, 4)) - 0.04);
      if (o.far) far = Math.max(far, hgt * 0.8); else near = Math.max(near, hgt);
    }
    data[k * 4] = near; data[k * 4 + 1] = far;
  }
  const prof = new THREE.DataTexture(data, TW, 1, THREE.RGBAFormat, THREE.FloatType);
  prof.minFilter = prof.magFilter = THREE.NearestFilter; prof.needsUpdate = true;

  // ---- a small sail near the horizon, away from the glitter and the islands
  let boat = new THREE.Vector4(3, 3, 1, 1);
  if (P.boat) {
    for (let tries = 0; tries < 30; tries++) {
      const x = rng.range(0.08, 0.92), s = rng.range(0.022, 0.03) * (0.8 + 0.4 * clamp(seaDepth / 0.4, 0, 1));
      if (Math.abs(x - hx) * sx < rS * 2.2 || isl.some((o) => Math.abs(o.x - x) * sx < o.w * 0.62)) continue;
      const y = yH + (seaDepth * rng.range(0.035, 0.07)) / sy;
      if (quiet.some((r) => x > r.x0 - 0.04 && x < r.x1 + 0.04 && y > r.y0 - 0.08 && y < r.y1 + 0.03)) continue;
      boat = new THREE.Vector4(x, y, s, x < hx ? 1 : -1); break;
    }
  }

  // ---- thin lens clouds and a few gulls, kept clear of the copy and of the disc
  const clear = (x, y, L, m = 0.04) => !(Math.abs(y - hy) * sy < rS * 1.15 && Math.abs(x - hx) * sx < rS * 1.3 + L)
    && !quiet.some((r) => x + L / sx > r.x0 - m && x - L / sx < r.x1 + m && y > r.y0 - m - 0.01 && y < r.y1 + m + 0.01);
  const clouds = [];
  if (P.clouds > 0) {
    const want = Math.min(12, Math.round(6 * P.clouds)), top = Math.max(headBot + 0.04, yH - 0.62 / sy);
    for (let tries = 0; tries < 120 && clouds.length < want; tries++) {
      const L = rng.range(0.12, 0.36), hgt = L * rng.range(0.035, 0.06), x = rng.range(-0.05, 1.05), y = yH - (0.03 + 0.6 * Math.pow(rng(), 1.5)) / sy;
      const x2 = x + (rng.range(-0.5, 0.5) * L) / sx, y2 = y + (rng.sign() * hgt * 1.5) / sy, L2 = L * rng.range(0.4, 0.62), h2 = hgt * rng.range(0.55, 0.8), pair = rng() < 0.6;
      if (y < top || !clear(x, y, L)) continue;
      if (clouds.some((c) => Math.abs(c.y - y) * sy < 0.04 && Math.abs(c.x - x) * sx < (c.z + L) * 0.9)) continue;
      clouds.push(new THREE.Vector4(x, y, L, hgt));
      if (pair && clouds.length < 12 && clear(x2, y2, L2)) clouds.push(new THREE.Vector4(x2, y2, L2, h2));
    }
  }
  const nClouds = clouds.length; while (clouds.length < 12) clouds.push(new THREE.Vector4(3, 3, 1, 1));
  const birds = [];
  if (!dark && !moon && P.birds > 0) {
    const n = Math.round(P.birds), dx = rng.range(2.4, 3.4), dy = rng.range(1.4, 2.4), jit = Array.from({ length: 8 }, () => [rng.range(-0.008, 0.008), rng.range(-0.01, 0.01), rng.range(0.012, 0.021), rng.range(-0.25, 0.25)]);
    let best = [];
    for (const side of hx > 0.5 ? [-1, 1] : [1, -1]) {
      const flock = [];
      for (let i = 0; i < n && i < 8; i++) {
        const row = Math.ceil(i / 2), sgn = i % 2 ? 1 : -1;
        const x = hx + side * rx * dx + (side * (row * 0.036 + jit[i][0])) / sx, y = hy - ry * dy + (sgn * row * 0.024 + jit[i][1] - row * 0.014) / sy;
        if (x > 0.03 && x < 0.97 && y > headBot + 0.03 && y < yH - 0.03 && clear(x, y, 0.02, 0.03)) flock.push(new THREE.Vector4(x, y, jit[i][2] * (1 - row * 0.08), jit[i][3]));
      }
      if (flock.length > best.length) best = flock;
    }
    birds.push(...best);
  }
  const nBirds = birds.length; while (birds.length < 8) birds.push(new THREE.Vector4(2, 2, 1, 0));
  const dCopy = Math.min(9, ...blocks.map((b) => Math.hypot(Math.max(b.x0 - hx, 0, hx - b.x1) * sx, Math.max(b.y0 - hy, 0, hy - b.y1) * sy)));

  scene.add(backgroundQuad(/* glsl */`
    varying vec2 vUv;
    uniform sampler2D uProf; uniform float uTW; uniform int uBirdN, uCloudN;
    uniform vec2 uHero, uAsp, uLow;
    uniform float uR, uHor, uSkyTop, uSkyPow, uDepth, uPx, uSeed, uDark, uMoon, uStars, uGlowR, uWaves, uGlitter, uFoot, uHead;
    uniform vec4 uBirds[8], uCloud[12], uBlock[3], uBoat;
    uniform vec3 cBg, cSea, cShade, cHor, cSky2, cAcc;
    uint pcg(uint v){ uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
    uint hu(ivec2 p, uint s){ return pcg(uint(p.x) + pcg(uint(p.y) + pcg(s))); }
    float h21(ivec2 p, uint s){ return float(hu(p, s)) * (1.0 / 4294967295.0); }
    vec2 h22(ivec2 p, uint s){ uint h = hu(p, s); return vec2(float(h & 0xffffu), float(h >> 16u)) / 65535.0; }
    float gn(vec2 p, uint s){
      vec2 i = floor(p), f = p - i; ivec2 ii = ivec2(i); vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
      float a = dot(h22(ii, s) * 2.0 - 1.0, f), b = dot(h22(ii + ivec2(1, 0), s) * 2.0 - 1.0, f - vec2(1.0, 0.0));
      float c = dot(h22(ii + ivec2(0, 1), s) * 2.0 - 1.0, f - vec2(0.0, 1.0)), d = dot(h22(ii + ivec2(1, 1), s) * 2.0 - 1.0, f - vec2(1.0, 1.0));
      return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 1.5;
    }
    float fbm(vec2 p, uint s){ float a = 0.5, r = 0.0; for (int i = 0; i < 4; i++) { r += a * gn(p, s + uint(i)); p = p * 2.03 + vec2(13.1, -7.7); a *= 0.5; } return r; }
    vec3 lab2lin(vec3 c){
      float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z, m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z, s = c.x - 0.0894841775 * c.y - 1.291485548 * c.z;
      l = l * l * l; m = m * m * m; s = s * s * s;
      return vec3(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
    }
    float quietDist(vec2 p){
      float d = 9.0;
      for (int i = 0; i < 3; i++) { vec4 r = uBlock[i]; vec2 e = (abs(p - 0.5 * (r.xy + r.zw)) - 0.5 * (r.zw - r.xy)) * uAsp; d = min(d, length(max(e, 0.0)) + min(max(e.x, e.y), 0.0)); }
      return d;
    }
    // x: on the copy · y: how close the copy is
    vec2 calmAt(vec2 p){
      vec2 wq = p * uAsp + uSeed;
      float qd = quietDist(p) + 0.05 * gn(wq * vec2(1.7, 4.6), 3u);
      float edge = max(smoothstep(uFoot - 0.05, uFoot + 0.012, p.y), smoothstep(uHead + 0.05, uHead - 0.012, p.y));
      return vec2(max(1.0 - smoothstep(-0.04, 0.16, qd), 0.8 * edge), max(1.0 - smoothstep(-0.02, 0.2, qd), 0.4 * edge));
    }
    float bird(vec2 q, vec4 b){
      vec2 l = (q - b.xy * uAsp) / b.z; float c = cos(b.w), s = sin(b.w); l = vec2(c * l.x + s * l.y, -s * l.x + c * l.y);
      float ax = abs(l.x); if (ax > 1.0) return 0.0;
      float yw = -0.34 * sin(3.14159 * pow(ax, 0.82)) + 0.1, th = 0.07 * pow(1.0 - ax, 0.55) + 0.012, aa = uPx / b.z;
      return smoothstep(th + aa, th - aa, abs(l.y - yw));
    }
    float tri(vec2 p, vec2 a, vec2 b, vec2 c){                       // signed distance to a triangle
      vec2 e0 = b - a, e1 = c - b, e2 = a - c, v0 = p - a, v1 = p - b, v2 = p - c;
      vec2 q0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0), q1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0), q2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
      float s = sign(e0.x * e2.y - e0.y * e2.x);
      vec2 d = min(min(vec2(dot(q0, q0), s * (v0.x * e0.y - v0.y * e0.x)), vec2(dot(q1, q1), s * (v1.x * e1.y - v1.y * e1.x))), vec2(dot(q2, q2), s * (v2.x * e2.y - v2.y * e2.x)));
      return -sqrt(d.x) * sign(d.y);
    }
    const float ROWS = 2.5, D0 = 0.018;
    float rowDepth(float j){ return D0 * (exp2(j / ROWS) - 1.0); }
    // how far the crest line of band j is pushed towards the horizon at x (in rows): pointed crests, round troughs
    float crest(float xq, float j){
      float lam = 0.62 * rowDepth(j + 0.5) + 0.03, ph = 17.0 * h21(ivec2(int(j), 7), 11u);
      float xx = xq / lam + ph + 0.4 * gn(vec2(xq / (lam * 2.6), j * 1.7 + uSeed), 7u);
      return uWaves * (0.3 * mix(0.5 + 0.5 * sin(6.28318 * xx + 1.3), 1.0 - abs(sin(3.14159 * xx)), 0.62) - 0.14);
    }
    // colour of band j at e rows below its crest line
    vec3 band(float j, float e, vec2 p, float dy, float xq, vec2 calm, vec3 skyH, float fw){
      float t = clamp(dy / uDepth, 0.0, 1.0), dx = (p.x - uHero.x) * uAsp.x;
      vec3 nearC = mix(cSea, cBg, 0.78);
      vec3 base = mix(mix(cSea, skyH, 0.4), cSea, smoothstep(0.0, 0.16, t)); base = mix(base, nearC, smoothstep(0.22, 1.0, t));
      base = mix(base, cShade, 0.12 * (h21(ivec2(int(j), 3), 21u) - 0.35) * (1.0 - t));
      base = mix(base, mix(cBg, cSea, 0.02), calm.x * 0.975);
      float k = 1.0 - 0.86 * calm.x;
      vec3 light = mix(base, mix(skyH, vec3(1.0, 0.0, 0.0), 0.35 * (1.0 - uDark)), 0.5);
      vec3 c = mix(base, light, 0.5 * exp(-e / 0.2) * k);                       // the crest catches the sky
      float lineW = 0.0021 / ((dy + D0) * 0.277), fwL = fw;
      c = mix(c, light, 0.42 * smoothstep(lineW + fwL, lineW, e) * k * smoothstep(0.0, 0.03, dy));
      c = mix(c, cShade, 0.1 * smoothstep(0.35, 1.0, e) * k * (1.0 - 0.6 * t));  // the trough falls into shade
      // glitter: the column of light under the hero, breaking up towards the viewer
      float w = uR * (0.85 + 0.3 * dy / uDepth), column = exp(-dx * dx / (w * w));   // a column of near-constant width: a reflection, not a fan of rays
      vec3 gcol = mix(cAcc, vec3(1.0, 0.0, 0.0), 0.25);
      c = mix(c, mix(cHor, cAcc, 0.4), 0.3 * column * exp(-dy / (0.5 * uDepth + 0.05)) * uGlitter * (1.0 - calm.y));
      // … as thin lens-shaped strokes riding just under each crest line
      float lam = 0.62 * rowDepth(j + 0.5) + 0.03, shift = 31.0 * h21(ivec2(int(j), 5), 13u), cell = xq / (lam * 0.42) + shift, ci = floor(cell), cf = cell - ci;
      float xc = (ci + 0.5 - shift) * lam * 0.42 - uHero.x * uAsp.x, colC = exp(-xc * xc / (w * w));          // one decision per stroke
      ivec2 id = ivec2(int(ci), int(j));
      float pick = h21(id, 14u), len = 0.4 + 0.55 * h21(id, 15u), off = (1.0 - len) * h21(id, 16u), u = clamp((cf - off) / len, 0.0, 1.0);
      float thick = min(0.26, 0.011 / ((dy + D0) * 0.277)) * sin(3.14159 * u), e0 = 0.05 + 0.1 * h21(id, 17u), fwE = fw;
      float dash = smoothstep(0.0, fwE, e - e0) * smoothstep(thick + fwE, thick, e - e0) * step(0.02, thick);
      c = mix(c, gcol, dash * step(1.0 - 1.25 * colC, pick) * min(1.0, 2.5 * colC) * uGlitter * (1.0 - calm.x));
      c = mix(c, gcol, 0.85 * exp(-dy / 0.01) * exp(-dx * dx / (uR * uR * 0.5)) * uGlitter);     // where the path meets the horizon
      return c;
    }
    void main(){
      vec2 p = vec2(vUv.x, 1.0 - vUv.y), q = p * uAsp;
      vec2 calm = calmAt(p), d = (p - uHero) * uAsp; float dist = length(d);
      // ---- sky: plain upper tone, warming towards the horizon and around the hero
      float v = smoothstep(uSkyTop, uHor, p.y);
      float glow = exp(-dot(d * vec2(0.75, 1.0), d * vec2(0.75, 1.0)) / (uGlowR * uGlowR));
      float lowGlow = exp(-pow((p.x - uHero.x) * uAsp.x / uLow.x, 2.0));
      float warm = clamp(pow(v, uSkyPow) * (uLow.y + (1.0 - uLow.y) * lowGlow) + 0.2 * pow(v, 1.4) * (0.4 + 0.6 * uLow.y / 0.45) + 0.4 * glow, 0.0, 1.0) * (1.0 - calm.y);
      warm += 0.05 * fbm(vec2(q.x * 0.9 + uSeed, q.y * 6.0), 60u) * smoothstep(0.05, 0.5, warm);
      vec3 sky = mix(cBg, cSky2, smoothstep(0.0, 0.6, warm)); sky = mix(sky, cHor, pow(smoothstep(0.3, 1.0, warm), 1.3));
      vec3 skyH = mix(mix(cBg, cSky2, 0.6), cHor, (0.35 + 0.45 * lowGlow) * (0.3 + 0.7 * uLow.y / 0.45));   // the sky just above the horizon
      vec3 col = sky;
      if (uStars > 0.5) {
        float st = 0.0;
        for (int L = 0; L < 3; L++) {
          float cell = L == 0 ? 0.022 : L == 1 ? 0.05 : 0.13; vec2 g = q / cell; ivec2 id = ivec2(floor(g)); vec2 f = g - floor(g);
          vec2 o = 0.2 + 0.6 * h22(id, 70u + uint(L)); float b = h21(id, 90u + uint(L));
          float rad = uPx * (L == 0 ? 0.75 : L == 1 ? 1.25 : 2.1) * (0.55 + 0.75 * b) / cell, aa = 0.6 * uPx / cell;
          st += smoothstep(rad + aa, rad - aa, length(f - o)) * step(L == 0 ? 0.45 : 0.3, b) * (L == 0 ? 0.55 : 0.95) * (0.4 + 0.6 * b);
        }
        col = mix(col, vec3(0.98, 0.0, 0.02), st * (1.0 - smoothstep(0.1, 0.7, warm)) * smoothstep(uR * 2.2, uR * 4.5, dist) * (1.0 - 0.8 * calm.x));
      }
      vec3 glowC = mix(cHor, cAcc, 0.45);
      float halo = exp(-max(dist - uR, 0.0) / (uR * 1.4));
      col = mix(col, glowC, halo * mix(0.42, 0.32, uDark) * (1.0 - 0.85 * calm.y));
      float disc = smoothstep(uPx, -uPx, dist - uR);
      vec3 body = mix(cAcc, mix(cAcc, cHor, 0.35), smoothstep(-uR, uR, -d.y) * (1.0 - uMoon));
      if (uMoon > 0.5) { float mr = fbm(d / uR * 0.85 + uSeed, 40u); body = mix(body, mix(cAcc, cBg, 0.13), smoothstep(0.0, 0.35, mr)); }
      col = mix(col, body, disc);
      for (int i = 0; i < uCloudN; i++) {
        vec4 c = uCloud[i]; vec2 l = (q - c.xy * uAsp) / c.zw; float m = 1.0 - l.x * l.x; if (m <= 0.0) continue;
        float ly = l.y + 0.22 * sin(l.x * 3.7 + c.x * 47.0) * m, e = abs(ly) - pow(m, 1.25), aa = uPx / c.w;
        float k = smoothstep(aa, -aa, e) * (1.0 - calm.x);
        vec3 cc = mix(sky, cShade, mix(0.3, 0.5, uDark)); cc = mix(cc, glowC, (0.25 + 0.6 * glow) * smoothstep(-0.5, 1.0, ly));
        col = mix(col, cc, k * 0.9);
      }
      // ---- islands: two hazy silhouettes on the horizon
      float fx = clamp(p.x, 0.0, 1.0) * (uTW - 1.0), ix = floor(fx), fr = fx - ix;
      vec4 ia = texelFetch(uProf, ivec2(int(ix), 0), 0), ib = texelFetch(uProf, ivec2(min(int(ix) + 1, int(uTW) - 1), 0), 0);
      vec2 isl = mix(ia.rg, ib.rg, fr); float up = (uHor - p.y) * uAsp.y;
      col = mix(col, mix(skyH, cShade, 0.3), smoothstep(-uPx, uPx, isl.g - up) * step(0.0005, isl.g) * (1.0 - 0.9 * calm.x));
      col = mix(col, mix(skyH, mix(cShade, cSea, 0.3), 0.62), smoothstep(-uPx, uPx, isl.r - up) * step(0.0005, isl.r) * (1.0 - 0.9 * calm.x));
      // ---- the sea: bands that widen towards the viewer
      float dy = (p.y - uHor) * uAsp.y;
      if (dy > -2.0 * uPx) {
        float dd = max(dy, 0.0), n = ROWS * log2(1.0 + dd / D0), fw = max(fwidth(n), 1e-4);
        vec3 seaC = vec3(0.0); float found = 0.0;
        for (int k = 1; k >= -1; k--) {
          float j = floor(n) + float(k); if (j < 0.0) continue;
          float e = n + crest(q.x, j) - j;
          if (e >= -0.5 * fw || j < 0.5) {
            vec3 c = band(j, max(e, 0.0), p, dd, q.x, calm, skyH, fw);
            if (j > 0.5) { float cov = clamp(e / fw + 0.5, 0.0, 1.0); if (cov < 1.0) c = mix(band(j - 1.0, max(n + crest(q.x, j - 1.0) - (j - 1.0), 0.0), p, dd, q.x, calm, skyH, fw), c, cov); }
            seaC = c; found = 1.0; break;
          }
        }
        // haze along the horizon, reflections of the islands
        seaC = mix(seaC, skyH, 0.55 * exp(-dd / 0.012) * (1.0 - 0.5 * calm.x));
        float refl = smoothstep(-uPx * 3.0, uPx * 3.0, max(isl.r, isl.g * 0.8) * 0.75 - dd - 0.004 * gn(vec2(q.x * 60.0, dd * 300.0), 9u));
        seaC = mix(seaC, mix(cShade, cSea, 0.5), 0.3 * refl * (1.0 - calm.x));
        col = mix(col, seaC, smoothstep(-uPx, uPx, dy) * found);
      }
      // ---- sail
      if (uBoat.x < 2.0) {
        vec2 l = (q - uBoat.xy * uAsp) / uBoat.z; l.x *= uBoat.w; float aa = uPx / uBoat.z;
        float sail = min(tri(l, vec2(0.04, -1.0), vec2(0.04, -0.16), vec2(0.5, -0.16)), tri(l, vec2(-0.03, -0.8), vec2(-0.03, -0.16), vec2(-0.36, -0.16)));
        float hull = tri(l, vec2(-0.5, -0.1), vec2(0.6, -0.1), vec2(0.36, 0.06)); hull = min(hull, tri(l, vec2(-0.5, -0.1), vec2(0.36, 0.06), vec2(-0.34, 0.06)));
        vec3 sailC = mix(mix(cBg, vec3(1.0, 0.0, 0.0), 0.6), cHor, 0.2 + 0.2 * uDark);
        col = mix(col, sailC, smoothstep(aa, -aa, sail) * (1.0 - calm.x));
        col = mix(col, mix(cShade, cSea, 0.4) * vec3(0.62, 1.0, 1.0), smoothstep(aa, -aa, hull) * (1.0 - calm.x));
        float rl = smoothstep(aa, -aa, tri(vec2(l.x + 0.03 * sin(l.y * 30.0), l.y), vec2(0.04, 0.9), vec2(0.04, 0.1), vec2(0.42, 0.1)));
        col = mix(col, sailC, 0.3 * rl * (1.0 - calm.x));
      }
      float bm = 0.0;
      for (int i = 0; i < uBirdN; i++) bm = max(bm, bird(q, uBirds[i]));
      col = mix(col, mix(cShade, cSea, 0.5) * vec3(0.6, 1.0, 1.0), bm * 0.9);
      gl_FragColor = vec4(clamp(lab2lin(col), 0.0, 1.0), 1.0);
      #include <colorspace_fragment>
      float n1 = h21(ivec2(gl_FragCoord.xy), 5u), n2 = h21(ivec2(gl_FragCoord.xy), 6u);
      gl_FragColor.rgb += (n1 + n2 - 1.0) / 255.0;                        // dither: no banding in the long gradients
    }`, {
    uProf: { value: prof }, uTW: { value: TW }, uBirdN: { value: nBirds }, uBirds: { value: birds }, uCloudN: { value: nClouds }, uCloud: { value: clouds }, uBoat: { value: boat },
    uHero: { value: new THREE.Vector2(hx, hy) }, uAsp: { value: new THREE.Vector2(sx, sy) },
    uR: { value: rS }, uGlowR: { value: clamp(dCopy * 0.64, 0.16, 0.34) }, uHor: { value: yH }, uSkyTop: { value: skyTop }, uLow: { value: new THREE.Vector2(high ? 0.5 : 1.1, high ? 0.1 : 0.45) }, uSkyPow: { value: clamp(1.1 + 4.5 * (yH - skyTop) * sy, 1.5, 3.6) }, uDepth: { value: Math.max(seaDepth, 0.02) }, uPx: { value: 1 / Math.min(W, H) },
    uSeed: { value: (seed % 113) * 0.713 }, uDark: { value: dark ? 1 : 0 }, uMoon: { value: moon ? 1 : 0 }, uStars: { value: showStars ? 1 : 0 },
    uWaves: { value: P.waves }, uGlitter: { value: P.glitter },
    cBg: { value: bg }, cSea: { value: sea }, cShade: { value: shade }, cHor: { value: hor }, cSky2: { value: sky2 }, cAcc: { value: acc },
    uBlock: { value: [0, 1, 2].map((i) => { const b = blocks[i]; return !b ? new THREE.Vector4(3, 3, 3, 3) : b.x1 - b.x0 > 0.7 ? new THREE.Vector4(-0.3, b.y0, 1.3, b.y1) : new THREE.Vector4(b.x0, b.y0, b.x1, b.y1); }) },
    uFoot: { value: footer ? footTop : 2 }, uHead: { value: header ? headBot : -1 },
  }));

  ctx.frame({ radius: 1, fov: 30, dir: [0, 0, 1] });
}
