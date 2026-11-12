// Mountain ridges — a full-picture scene: receding ridgelines dissolving into haze under a graded
// sky, a sun or moon at the layout focus, firs on the near slopes and a still lake (or a bank of
// mist) in the foreground. Everything is painted in one fragment shader; the ridge silhouettes are
// generated on the CPU (deterministic, seedable) and handed over as a float texture, so the picture
// can be composed around the copy: the range rises beside the hero and sinks under the text block.
//
// Palette: bg = upper sky (behind the copy) · colors[0] = nearest ridge · colors[1] = middle ridges
//          colors[2] = glow at the horizon · colors[3] = optional mid-sky tone · accent = sun / moon on dark skies
//          (never a red disc: see the note at the colours below)
import { makeNoise, backgroundQuad } from '/skill/assets/web/scene-lib.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export default function build(ctx) {
  const { THREE, scene, palette, params, aspect, seed, rng, width: W, height: H } = ctx;
  const sx = Math.max(aspect, 1), sy = Math.max(1 / aspect, 1);          // frame fraction → short-side units
  const P = {
    layers: params.layers ?? 7, peaks: params.peaks ?? 1, lake: params.lake ?? true, trees: params.trees ?? 1,
    snow: Number.isFinite(Number(params.snow)) ? Number(params.snow) : Number(palette.snow) || 0, birds: params.birds ?? 5, stars: params.stars ?? 'auto', body: params.body ?? 'auto',
    clouds: params.clouds ?? 1, sun: params.sun ?? 1, mist: params.mist ?? 1,
  };

  // ---- colours (OKLab, so every blend in the shader is perceptually even)
  const lab = (hex) => {
    const c = new THREE.Color(hex);
    const l = Math.cbrt(0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b), m = Math.cbrt(0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b), s = Math.cbrt(0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b);
    return new THREE.Vector3(0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s);
  };
  const mixL = (a, b, t) => a.clone().lerp(b, t);
  const cols = palette.colors;
  const bg = lab(palette.bg), near = lab(cols[0]), mid = lab(cols[1] ?? cols[0]), hor = lab(cols[2] ?? palette.accent);
  const sky2 = cols[3] ? lab(cols[3]) : mixL(bg, hor, 0.45);
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

  // ---- the hero: at the layout focus; if the copy lies on top of it, it sets behind the range just below the copy
  let hx = ctx.focus.x, hy = ctx.focus.y, rS = (0.05 + 0.05 * clamp(ctx.artSize ?? 0.6, 0.3, 1)) * P.sun, sunk = 0.45;
  for (const b of blocks) {
    const rx = rS / sx, ry = rS / sy;
    if (!(hx > b.x0 - rx && hx < b.x1 + rx && hy > b.y0 - ry && hy < b.y1 + ry)) continue;
    rS *= 0.85;
    const below = b.y1 + (rS / sy) * 1.15;
    if (1 - below >= 0.09) { hy = below; sunk = 0.1; } else hy = Math.max(headBot + (rS / sy) * 1.5, b.y0 - (rS / sy) * 1.7);
  }
  const rx = rS / sx, ry = rS / sy;
  const yNotch = hy + sunk * ry;                                           // the far ridge crosses the disc here

  // ---- lake: a still mirror along the bottom edge (it also keeps the footer on an even tone)
  let yL = 1.06;
  if (P.lake) {
    yL = 1 - (aspect < 0.87 ? 0.135 : aspect < 1.15 ? 0.15 : 0.17);
    for (const b of blocks) if (b.y0 > hy + ry && b.x1 - b.x0 > 0.7) yL = Math.min(yL, b.y0 - 0.06 / sy);
    yL = Math.max(yL, yNotch + 0.17 / sy);
    if (yL > 0.95) yL = 1.06;
  }
  const yBase = yL;

  // ---- upper bound of the land at each x: low under the disc, rising beside it, sinking under the copy
  const copy = blocks[0], copyCx = copy ? (copy.x0 + copy.x1) / 2 : 0.5;
  let peakSide = hx >= copyCx ? 1 : -1;
  if (Math.abs(hx - copyCx) < 0.08) peakSide = rng() < 0.5 ? -1 : 1;
  if (hx + peakSide * rx * 3 > 0.97 || hx + peakSide * rx * 3 < 0.03) peakSide = -peakSide;
  const rise = (0.2 * P.peaks) / sy;
  const bound = (x, t, wob) => {
    const du = Math.abs(x - hx) * sx;
    let y = yNotch - rise * ((x - hx) * peakSide > 0 ? 1 : 0.6) * sstep(1.2 * rS, 5.5 * rS, du);
    for (const b of blocks) {
      if (b.y0 > yBase - 0.03 || b.y1 < yNotch - rise - 0.05) continue;     // copy on the water, or well up in the sky
      // a long flank down from the hero to the shore; nearer ridges run further out before they sink
      const k = lerp(0.78, 1.3, t), fl = clamp((hx - b.x1) * 0.95, 0.12, 0.36) * k, fr = clamp((b.x0 - hx) * 0.95, 0.12, 0.36) * k;
      const sl = clamp((x + wob - b.x1) / fl, 0, 1), sr = clamp((b.x0 - x - wob) / fr, 0, 1), s = Math.max(sl, sr);
      const m = (1 - Math.pow(s, 1.9) * (3 - 2 * s)) * sstep(0.2, 0.55, t);     // the pale far ridges may pass behind the copy
      y = lerp(y, Math.max(y, Math.min(b.y1 + 0.04, yBase - 0.045)), m);
    }
    return Math.max(y, headBot + 0.04, 0.05);
  };

  // ---- ridge profiles → float texture (one row per layer; R = silhouette, G = the same without trees)
  const N = clamp(Math.round(P.layers), 5, 8), TW = Math.min(8192, 2 ** Math.ceil(Math.log2(W * 2)));
  const data = new Float32Array(TW * N * 4), snowY = new Array(8).fill(-1);
  const noise = makeNoise(seed * 31 + 7);
  const top = new Float32Array(TW), band = new Float32Array(TW);
  const xPeak = peakSide * rS * rng.range(2.5, 3.3), wPeak = rS * rng.range(3.2, 4.2);
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const h0 = 0.09 + 0.69 * Math.pow(1 - t, 1.25), amp = lerp(0.2, 0.08, t), f = lerp(1.7, 0.75, t), off = rng.range(-40, 40);
    const sharp0 = lerp(0.72, 0.04, Math.pow(t, 0.8)) * P.peaks, gain = lerp(0.5, 0.4, t);
    const heroPeak = [0.55, 1, 0.5, 0.2][i] ?? 0;
    let lo = 9, mean = 0;
    for (let k = 0; k < TW; k++) {
      const u = (k / (TW - 1) - hx) * sx;                                   // short-side units from the hero
      const nearHero = Math.exp(-(u * u) / 0.45);
      const sharp = clamp(sharp0 + 0.3 * nearHero * (1 - t) * P.peaks, 0, 1);
      let s = 0, a = 1, fr = f, norm = 0;
      for (let o = 0; o < 6; o++) {
        const n = noise.noise3(u * fr + off, i * 9.17 + o * 1.31, 0.5);
        s += a * lerp(n * 1.5, 1 - 2.3 * Math.abs(n), sharp); norm += a; a *= gain; fr *= 2.07;
      }
      s /= norm;
      let h = h0 + amp * 1.5 * s * (1 + 0.45 * nearHero * (1 - t));
      h += heroPeak * 0.3 * P.peaks * Math.pow(Math.max(0, 1 - Math.abs(u - xPeak) / wPeak), 1.5) * (1 + 0.5 * s);
      h = h > 0.8 ? 0.8 + 0.2 * Math.tanh((h - 0.8) / 0.2) : h;
      const xk = k / (TW - 1), ubk = bound(xk, t, 0.035 * noise.noise3(xk * sx * 2.3 + off, i * 3.7, 4.4)); band[k] = (yBase - ubk) * sy;
      const y = yBase - (yBase - ubk) * Math.max(h, 0.015);
      top[k] = y; lo = Math.min(lo, y); mean += y / TW;
    }
    snowY[i] = P.snow > 0 && t < 0.62 ? lo + (mean - lo) * (0.25 + 0.8 * P.snow) : -1;
    // firs along the nearer crests: stepped triangles, in clumps with clearings between them
    const tree = new Float32Array(TW);
    const rank = i - (N - 3);
    if (P.trees > 0 && rank >= 0) {
      const size = [0.4, 0.66, 1][rank], uMin = -hx * sx - 0.1, uMax = (1 - hx) * sx + 0.1;
      for (let u = uMin; u < uMax;) {
        const clump = noise.noise3(u * 1.7 + i * 5.3, 3.3, 9.1) + 0.28 * P.trees + (rank === 2 ? 0.1 : 0);
        const th = size * (0.022 + 0.05 * Math.pow(rng(), 1.7)) * (0.7 + 0.6 * clamp(clump + 0.3, 0, 1)), tw = th * rng.range(0.22, 0.34), tiers = rng.int(4, 6);
        if (clump > 0.02) {
          const k0 = Math.max(0, Math.floor(((u - tw) / sx + hx) * (TW - 1))), k1 = Math.min(TW - 1, Math.ceil(((u + tw) / sx + hx) * (TW - 1)));
          for (let k = k0; k <= k1; k++) {
            const v = 1 - Math.abs((k / (TW - 1) - hx) * sx - u) / tw; if (v <= 0) continue;
            const e = v * tiers, fl = Math.floor(e), shape = (fl + Math.pow(e - fl, 2.6)) / tiers;
            tree[k] = Math.max(tree[k], (th * (0.35 * v + 0.65 * shape)) / sy);
          }
        }
        u += (tw * (0.6 + 2.2 * Math.pow(rng(), 1.6))) / clamp(P.trees, 0.3, 2) + (clump > 0.02 ? 0 : 0.012);
      }
    }
    for (let k = 0; k < TW; k++) { const o = (i * TW + k) * 4; data[o] = top[k] - tree[k] * sstep(0.04, 0.2, band[k]); data[o + 1] = top[k]; }
  }
  const prof = new THREE.DataTexture(data, TW, N, THREE.RGBAFormat, THREE.FloatType);
  prof.minFilter = prof.magFilter = THREE.NearestFilter; prof.needsUpdate = true;

  // ---- a few birds in the open sky beside the sun (daylight palettes)
  const birds = [];
  if (!dark && !moon && P.birds > 0) {
    const n = Math.round(P.birds), free = (x, y) => x > 0.03 && x < 0.97 && y > headBot + 0.03 && y < yNotch - 0.02 && !quiet.some((r) => x > r.x0 - 0.03 && x < r.x1 + 0.03 && y > r.y0 - 0.03 && y < r.y1 + 0.03);
    const dx = rng.range(2.6, 3.4), dy = rng.range(1.5, 2.3), jit = Array.from({ length: 8 }, () => [rng.range(-0.008, 0.008), rng.range(-0.01, 0.01), rng.range(0.011, 0.02), rng.range(-0.25, 0.25)]);
    let best = [];
    for (const side of [-peakSide, peakSide]) {
      const cx = hx + side * rx * dx, cy = hy - ry * dy, flock = [];
      for (let i = 0; i < n && i < 8; i++) {
        const row = Math.ceil(i / 2), sgn = i % 2 ? 1 : -1;
        const x = cx + side * (row * 0.034 + jit[i][0]) / sx, y = cy + (sgn * row * 0.024 + jit[i][1] - row * 0.014) / sy;
        if (free(x, y)) flock.push(new THREE.Vector4(x, y, jit[i][2] * (1 - row * 0.08), jit[i][3]));
      }
      if (flock.length > best.length) best = flock;
    }
    birds.push(...best);
  }
  const nBirds = birds.length; while (birds.length < 8) birds.push(new THREE.Vector4(2, 2, 1, 0));

  // ---- thin lens clouds beside the hero, kept clear of the copy
  const clouds = [];
  if (P.clouds > 0) {
    const want = Math.min(10, Math.round(5 * P.clouds));
    const clear = (x, y, L) => !(Math.abs(y - hy) * sy < rS * 1.15 && Math.abs(x - hx) * sx < rS * 1.3 + L)
      && !quiet.some((r) => x + L / sx > r.x0 - 0.04 && x - L / sx < r.x1 + 0.04 && y > r.y0 - 0.05 && y < r.y1 + 0.05);
    for (let tries = 0; tries < 80 && clouds.length < want; tries++) {
      const side = rng() < 0.5 ? -1 : 1, L = rng.range(0.11, 0.3), hgt = L * rng.range(0.04, 0.065);
      const x = hx + (side * rng.range(0.16, 0.9)) / sx, y = hy - rng.range(-0.25, 3.1) * ry;
      const x2 = x + (rng.range(-0.5, 0.5) * L) / sx, y2 = y + (rng.sign() * hgt * 1.5) / sy, L2 = L * rng.range(0.4, 0.62), h2 = hgt * rng.range(0.55, 0.8), pair = rng() < 0.6;
      if (y < headBot + 0.04 || y > yNotch - 0.01 || x < -0.05 || x > 1.05 || !clear(x, y, L)) continue;
      if (clouds.some((c) => Math.abs(c.y - y) * sy < 0.035 && Math.abs(c.x - x) * sx < (c.z + L) * 0.9)) continue;
      clouds.push(new THREE.Vector4(x, y, L, hgt));
      if (pair && clouds.length < 10 && clear(x2, y2, L2)) clouds.push(new THREE.Vector4(x2, y2, L2, h2));
    }
  }
  let skyTop = Math.max(headBot, 0);
  for (const b of blocks) if (b.y1 < yNotch + 0.02) skyTop = Math.max(skyTop, b.y1 - 0.04);
  skyTop = Math.min(skyTop, yNotch - 0.2 / sy);
  const dCopy = Math.min(9, ...blocks.map((b) => Math.hypot(Math.max(b.x0 - hx, 0, hx - b.x1) * sx, Math.max(b.y0 - hy, 0, hy - b.y1) * sy)));
  const glowR = clamp(dCopy * 0.75, 0.18, 0.36);
  const nClouds = clouds.length; while (clouds.length < 10) clouds.push(new THREE.Vector4(3, 3, 1, 1));

  scene.add(backgroundQuad(/* glsl */`
    varying vec2 vUv;
    uniform sampler2D uProf; uniform float uTW; uniform int uN, uBirdN, uCloudN;
    uniform vec2 uRes, uHero, uAsp;
    uniform float uR, uLake, uSkyTop, uPx, uSeed, uDark, uMoon, uStars, uMist, uNotch, uGlowR;
    uniform float uSnowY[8], uFoot, uHead; uniform vec4 uBirds[8], uCloud[10], uBlock[3];
    uniform vec3 cBg, cNear, cMid, cHor, cSky2, cAcc;
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
    // distance (short-side units) to the nearest copy block; negative inside
    float quietDist(vec2 p){
      float d = 9.0;
      for (int i = 0; i < 3; i++) { vec4 r = uBlock[i]; vec2 e = (abs(p - 0.5 * (r.xy + r.zw)) - 0.5 * (r.zw - r.xy)) * uAsp; d = min(d, length(max(e, 0.0)) + min(max(e.x, e.y), 0.0)); }
      return d;
    }
    // layer i at x → (silhouette y, crest y without trees, coverage of this pixel)
    vec3 ridge(int i, vec2 p, float soft){
      float fx = clamp(p.x, 0.0, 1.0) * (uTW - 1.0), ix = floor(fx), fr = fx - ix;
      vec4 a = texelFetch(uProf, ivec2(int(ix), i), 0), b = texelFetch(uProf, ivec2(min(int(ix) + 1, int(uTW) - 1), i), 0);
      float top = mix(a.r, b.r, fr), slope = (b.r - a.r) * (uTW - 1.0) * uRes.y / uRes.x;
      float d = (p.y - top) * uRes.y / sqrt(1.0 + slope * slope);
      return vec3(top, mix(a.g, b.g, fr), clamp(d / soft + 0.5, 0.0, 1.0));
    }
    float bird(vec2 q, vec4 b){
      vec2 l = (q - b.xy * uAsp) / b.z; float c = cos(b.w), s = sin(b.w); l = vec2(c * l.x + s * l.y, -s * l.x + c * l.y);
      float ax = abs(l.x); if (ax > 1.0) return 0.0;
      float yw = -0.34 * sin(3.14159 * pow(ax, 0.82)) + 0.1, th = 0.07 * pow(1.0 - ax, 0.55) + 0.012, aa = uPx / b.z;
      return smoothstep(th + aa, th - aa, abs(l.y - yw));
    }
    // everything above the water line, for a point p of the frame (y down). calm.x: on the copy, calm.y: near it
    vec3 world(vec2 p, vec2 calm, float soft){
      vec2 d = (p - uHero) * uAsp; float dist = length(d);
      // sky: plain upper tone, warming towards the hero and the horizon
      float v = smoothstep(uSkyTop, uNotch + 0.02, p.y);
      float glow = exp(-dot(d * vec2(0.62, 1.0), d * vec2(0.62, 1.0)) / (uGlowR * uGlowR));
      float warm = clamp(pow(v, 1.7) * (0.4 + 0.6 * glow) + 0.34 * glow * v, 0.0, 1.0) * (1.0 - calm.y);
      vec3 sky = mix(cBg, cSky2, smoothstep(0.0, 0.6, warm)); sky = mix(sky, cHor, smoothstep(0.38, 1.0, warm));
      vec3 col = sky;
      // stars thin out towards the glow
      if (uStars > 0.5) {
        vec2 q = p * uAsp; float st = 0.0;
        for (int L = 0; L < 3; L++) {
          float cell = L == 0 ? 0.022 : L == 1 ? 0.05 : 0.13; vec2 g = q / cell; ivec2 id = ivec2(floor(g)); vec2 f = g - floor(g);
          vec2 o = 0.2 + 0.6 * h22(id, 70u + uint(L)); float b = h21(id, 90u + uint(L));
          float rad = uPx * (L == 0 ? 0.75 : L == 1 ? 1.25 : 2.1) * (0.55 + 0.75 * b) / cell, aa = 0.6 * uPx / cell;
          st += smoothstep(rad + aa, rad - aa, length(f - o)) * step(L == 0 ? 0.45 : 0.3, b) * (L == 0 ? 0.55 : 0.95) * (0.4 + 0.6 * b);
        }
        col = mix(col, vec3(0.98, 0.0, 0.02), st * (1.0 - smoothstep(0.1, 0.7, warm)) * smoothstep(uR * 2.2, uR * 4.5, dist) * (1.0 - 0.8 * calm.x));
      }
      // halo, then the disc
      vec3 glowC = mix(cHor, cAcc, 0.45);
      float halo = exp(-max(dist - uR, 0.0) / (uR * 1.4));
      col = mix(col, glowC, halo * mix(0.4, 0.3, uDark) * (1.0 - 0.85 * calm.y));
      float disc = smoothstep(uPx * soft, -uPx * soft, dist - uR);
      vec3 body = mix(cAcc, mix(cAcc, cHor, 0.35), smoothstep(-uR, uR, -d.y) * (1.0 - uMoon));
      if (uMoon > 0.5) { float mr = fbm(d / uR * 0.85 + uSeed, 40u); body = mix(body, mix(cAcc, cBg, 0.13), smoothstep(0.0, 0.35, mr)); }
      col = mix(col, body, disc);
      // long thin clouds beside the hero, lit from below
      vec2 q = p * uAsp;
      for (int i = 0; i < uCloudN; i++) {
        vec4 c = uCloud[i]; vec2 l = (q - c.xy * uAsp) / c.zw; float m = 1.0 - l.x * l.x; if (m <= 0.0) continue;
        float ly = l.y + 0.22 * sin(l.x * 3.7 + c.x * 47.0) * m, e = abs(ly) - pow(m, 1.25), aa = uPx * soft / c.w;
        float k = smoothstep(aa, -aa, e) * (1.0 - calm.x);
        vec3 cc = mix(sky, cMid, mix(0.36, 0.5, uDark)); cc = mix(cc, glowC, (0.25 + 0.6 * glow) * smoothstep(-0.5, 1.0, ly));
        col = mix(col, cc, k * 0.9);
      }
      // ridges, far to near
      for (int i = 0; i < uN; i++) {
        vec3 r = ridge(i, p, soft); if (r.z <= 0.0) continue;
        float t = float(i) / float(uN - 1);
        vec3 solid = mix(cMid, cNear, smoothstep(0.2, 1.0, t));
        vec3 c = mix(sky, solid, mix(0.3, 1.0, pow(t, 0.75)));
        float depth = (p.y - r.y) * uAsp.y;
        // snow caps: deeper under the high crests, gone in the saddles, with a ragged lower edge
        if (uSnowY[i] > 0.0) {
          float over = (uSnowY[i] - r.y) * uAsp.y, xs = p.x * uAsp.x * mix(22.0, 13.0, t);
          float teeth = abs(fract(xs + 1.7 * gn(vec2(xs * 0.23, float(i) * 3.1), 31u)) - 0.5) * 2.0;
          float th = over * 0.85 * (0.3 + 0.7 * teeth * (0.6 + 0.8 * abs(gn(vec2(xs * 0.6, float(i) * 5.3), 33u))));
          float aa = uPx * soft * 1.2, sn = smoothstep(aa, -aa, depth - th) * step(0.0, over);
          c = mix(c, mix(sky, vec3(0.985, 0.0, 0.004), mix(0.62, 0.95, t)), sn);
        }
        // mist gathers at the foot of every layer; the sun soaks through the far ones
        float g = smoothstep(0.0, mix(0.1, 0.24, t), depth);
        c = mix(c, mix(sky, cHor, 0.25), g * mix(0.6, 0.34, t) * uMist);
        c = mix(c, glowC, glow * smoothstep(0.9, 0.0, t) * 0.3 * (1.0 - calm.y));
        c = mix(c, sky, calm.x * mix(0.7, 0.975, smoothstep(0.0, 0.5, t)));   // behind the copy the ridges dissolve into the haze
        col = mix(col, c, r.z);
      }
      return col;
    }
    // x: mist on the copy itself · y: how close the copy is (the glow and the colour keep their distance)
    vec2 calmAt(vec2 p){
      vec2 wq = p * uAsp + uSeed;
      float qd = quietDist(p) + 0.07 * gn(wq * vec2(1.7, 4.6), 3u) + 0.03 * gn(wq * vec2(4.3, 11.0), 4u);
      float edge = max(smoothstep(uFoot - 0.045, uFoot + 0.012, p.y), smoothstep(uHead + 0.045, uHead - 0.012, p.y));
      float nearCopy = 1.0 - smoothstep(-0.03, 0.26, qd);
      return vec2(max(1.0 - smoothstep(-0.05, 0.2, qd), 0.72 * edge), max(nearCopy, 0.5 * edge));
    }
    // thin bright horizontal dashes on the water, in rows that widen towards the viewer; they gather under the hero
    float glints(vec2 q, float wd, float dx){
      float row = log(wd + 0.02) * 15.0, ri = floor(row), rf = row - ri, fw = fwidth(row);
      float cx = q.x / 0.085 + 7.3 * h21(ivec2(int(ri), 3), 50u), ci = floor(cx), cf = cx - ci;
      ivec2 id = ivec2(int(ci), int(ri));
      float len = 0.2 + 0.7 * h21(id, 56u), off = h21(id, 57u) * (1.0 - len), pick = h21(id, 58u);
      float inx = smoothstep(off, off + 0.06, cf) * smoothstep(off + len, off + len - 0.06, cf);
      float iny = smoothstep(0.16 + fw, 0.16 - fw, abs(rf - 0.5));
      float column = exp(-dx * dx / (0.0035 + 0.02 * wd));                              // a narrow column of light under the hero, not a fan
      return inx * iny * step(mix(0.9, 0.25, column), pick) * mix(0.35, 1.0, column) * smoothstep(0.004, 0.02, wd);
    }
    void main(){
      vec2 p = vec2(vUv.x, 1.0 - vUv.y);
      vec2 calm = calmAt(p);
      vec2 pw = p; float wd = max(p.y - uLake, 0.0) * uAsp.y, soft = 1.0, rip = 0.0;
      if (p.y > uLake) {                                                   // mirror, broken into streaks that grow towards the viewer
        float ry = log(wd + 0.02) * 6.0;
        rip = gn(vec2(p.x * uAsp.x * 2.6 + ry * 0.3, ry * 1.9), 21u) + 0.4 * gn(vec2(p.x * uAsp.x * 7.0, ry * 5.0), 22u);
        pw.y = uLake - (p.y - uLake) - rip * (0.0015 + 0.1 * wd) * smoothstep(0.0, 0.02, wd) / uAsp.y;
        soft = 1.0 + 40.0 * wd;
      }
      vec3 col = world(pw, calm, soft);
      if (p.y > uLake) {                                                   // the mirror is clearest at the far shore and gives way to open sky-water
        vec3 water = mix(cBg, cSky2, 0.22);
        col = mix(col, water, 0.08 + 0.7 * smoothstep(0.02, 0.36, wd));
        col.x += 0.008 * rip * smoothstep(0.0, 0.05, wd);
        float gl = glints(p * uAsp, wd, (p.x - uHero.x) * uAsp.x) * (1.0 - calm.x);
        col = mix(col, mix(cHor, cAcc, 0.65 * uDark) + vec3(0.04 * (1.0 - uDark), 0.0, 0.0), gl * 0.8);
        col = mix(col, mix(cHor, cBg, 0.4), 0.5 * exp(-wd / 0.005));      // a line of mist along the far shore
        col = mix(col, mix(cBg, cSky2, 0.06), calm.x * 0.8);
      }
      vec2 q = p * uAsp; float bm = 0.0;
      for (int i = 0; i < uBirdN; i++) bm = max(bm, bird(q, uBirds[i]));
      col = mix(col, mix(cNear, cMid, 0.25), bm * 0.92);
      gl_FragColor = vec4(clamp(lab2lin(col), 0.0, 1.0), 1.0);
      #include <colorspace_fragment>
      float n1 = h21(ivec2(gl_FragCoord.xy), 5u), n2 = h21(ivec2(gl_FragCoord.xy), 6u);
      gl_FragColor.rgb += (n1 + n2 - 1.0) / 255.0;                        // dither: no banding in the long gradients
    }`, {
    uProf: { value: prof }, uTW: { value: TW }, uN: { value: N }, uBirdN: { value: nBirds }, uBirds: { value: birds }, uCloudN: { value: nClouds }, uCloud: { value: clouds },
    uRes: { value: new THREE.Vector2(W, H) }, uHero: { value: new THREE.Vector2(hx, hy) }, uAsp: { value: new THREE.Vector2(sx, sy) },
    uR: { value: rS }, uGlowR: { value: glowR }, uLake: { value: yL }, uSkyTop: { value: skyTop }, uNotch: { value: yNotch }, uPx: { value: 1 / Math.min(W, H) },
    uSeed: { value: (seed % 113) * 0.713 }, uDark: { value: dark ? 1 : 0 }, uMoon: { value: moon ? 1 : 0 }, uStars: { value: showStars ? 1 : 0 },
    uMist: { value: P.mist }, uSnowY: { value: snowY },
    cBg: { value: bg }, cNear: { value: near }, cMid: { value: mid }, cHor: { value: hor }, cSky2: { value: sky2 }, cAcc: { value: acc },
    uBlock: { value: [0, 1, 2].map((i) => { const b = blocks[i]; return !b ? new THREE.Vector4(3, 3, 3, 3) : b.x1 - b.x0 > 0.7 ? new THREE.Vector4(-0.3, b.y0, 1.3, b.y1) : new THREE.Vector4(b.x0, b.y0, b.x1, b.y1); }) },
    uFoot: { value: footer ? footTop : 2 }, uHead: { value: header ? headBot : -1 },
  }));

  ctx.frame({ radius: 1, fov: 30, dir: [0, 0, 1] });
}
