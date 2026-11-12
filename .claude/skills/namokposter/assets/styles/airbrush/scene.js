// Deep space — a full-picture scene: a large banded planet at the layout focus (lit limb, soft
// terminator, a ring that casts and receives shadow), a small moon, a dense star field with a few
// bright stars, and nebula clouds of layered, domain-warped noise that thin out behind the copy.
// Bright stars are soft round glows (no diffraction spikes). One fragment shader paints everything
// analytically, so limbs, ring edges and stars stay crisp at
// any size. The planet is sized, lit and its ring turned so that nothing crosses the copy; when the
// copy lies on the focus itself the planet becomes a sunlit horizon rising from the bottom edge.
//
// Palette: bg = open space (behind the copy) · colors[0], colors[1] = nebula · colors[2] = the planet
//          colors[3] = optional ring / pale band tone · accent = sunlit rim, light bands, bright stars
import { backgroundQuad } from '/skill/assets/web/scene-lib.js';
import buildMoons from './moons.js';
import buildOrbits from './orbits.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export default function build(ctx) {
  // motifs `moons` and `orbits` live in sibling modules; everything below is the `planet` motif
  const motif = String(ctx.params.motif ?? 'planet');
  if (motif === 'moons') return buildMoons(ctx);
  if (motif === 'orbits') return buildOrbits(ctx);
  const { THREE, scene, palette, params, aspect, seed, rng, width: W, height: H } = ctx;
  const sx = Math.max(aspect, 1), sy = Math.max(1 / aspect, 1);          // frame fraction → short-side units
  const P = {
    ring: params.ring ?? true, moon: params.moon ?? true, nebula: params.nebula ?? 1, stars: params.stars ?? 1,
    bands: params.bands ?? 1, size: params.size ?? 1, flare: params.flare ?? 1,
  };

  // ---- colours in OKLab
  const lab = (hex) => {
    const c = new THREE.Color(hex);
    const l = Math.cbrt(0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b), m = Math.cbrt(0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b), s = Math.cbrt(0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b);
    return new THREE.Vector3(0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s);
  };
  const cols = palette.colors;
  const bg = lab(palette.bg), nebA = lab(cols[0]), nebB = lab(cols[1] ?? cols[0]), body = lab(cols[2] ?? palette.accent), acc = lab(palette.accentOriginal ?? palette.accent);
  const pale = cols[3] ? lab(cols[3]) : body.clone().lerp(new THREE.Vector3(0.97, 0, 0.01), 0.6);
  const ink = lab(palette.ink), dark = bg.x < 0.55;

  // ---- where the copy sits
  const quiet = (ctx.quiet || []).map(([x0, y0, x1, y1]) => ({ x0, y0, x1, y1 }));
  const strip = (r) => r.x0 <= 0.02 && r.x1 >= 0.98;
  const footer = quiet.find((r) => strip(r) && r.y1 >= 0.98 && r.y0 > 0.5), header = quiet.find((r) => strip(r) && r.y0 <= 0.02 && r.y1 < 0.5);
  const blocks = quiet.filter((r) => r !== footer && r !== header);
  const footTop = footer ? footer.y0 : 1, headBot = header ? header.y1 : 0;
  // distance (short-side units) from a point of the frame to the nearest copy block, negative inside
  const blockDist = (x, y) => { let d = 9; for (const b of blocks) { const ex = Math.max(b.x0 - x, x - b.x1) * sx, ey = Math.max(b.y0 - y, y - b.y1) * sy; d = Math.min(d, Math.hypot(Math.max(ex, 0), Math.max(ey, 0)) + Math.min(Math.max(ex, ey), 0)); } return d; };

  // ---- the planet
  let hx = ctx.focus.x, hy = ctx.focus.y;
  const copy = blocks[0], ccx = copy ? (copy.x0 + copy.x1) / 2 : hx - 0.3, ccy = copy ? (copy.y0 + copy.y1) / 2 : hy - 0.3;
  const Rmax = 0.46 * clamp(ctx.artSize ?? 0.7, 0.3, 1.1) * P.size;
  let R, ringOn = false, phi = 0, incl = 0.36, horizon = false;
  let L = new THREE.Vector3(1, 0.5, 0.4);
  if (blockDist(hx, hy) < 0.06) {
    // copy on the focus: a sunlit horizon under it
    horizon = true;
    const b = blocks.find((r) => hx > r.x0 - 0.05 && hx < r.x1 + 0.05 && hy > r.y0 - 0.05 && hy < r.y1 + 0.05) ?? copy;
    R = (0.72 * sx + 0.2) * P.size;
    const top = Math.min(Math.max(b.y1 + 0.05, 0.7), 0.9);
    hx = 0.5 + rng.range(-0.06, 0.06); hy = top + R / sy;
    L.set(rng.sign() * rng.range(0.1, 0.16), 0.5, -0.84);
  } else {
    // light comes from the side away from the copy and a little from above, so the night side faces the type
    const ax = (hx - ccx) * sx, ay = -(hy - ccy) * sy, al = Math.hypot(ax, ay) || 1;
    L.set((ax / al) * 0.9 + (Math.abs(ax / al) < 0.3 ? rng.sign() * 0.5 : 0), (ay / al) * 0.5 + 0.5, 0.42);
    // on a dark sky the night side may slip a little way under the corner of the copy: it is as dark as the sky there
    const free = blockDist(hx, hy), tuck = dark ? 0.7 : 1, fits = (r) => free - 0.03 >= r * tuck;
    const Rplain = Math.max(0.1, Math.min(Rmax, (free - 0.03) / tuck));
    R = Rplain;
    if (P.ring) {
      // turn the ring so that it clears the copy with the largest planet; flat rings are preferred
      let best = null;
      for (const deg of [14, -14, 26, -26, 40, -40, 56, -56, 72, -72]) {
        const f = (deg * Math.PI) / 180;
        let r = Rmax * 0.82;
        for (let it = 0; it < 14; it++) {
          let ok = true;
          for (let k = 0; k < 48 && ok; k++) {
            const a = (k / 48) * Math.PI * 2, ex = Math.cos(a) * 1.5 * r, ey = Math.sin(a) * 1.5 * r * incl;
            const x = hx + (ex * Math.cos(f) - ey * Math.sin(f)) / sx, y = hy - (ex * Math.sin(f) + ey * Math.cos(f)) / sy;
            if (blockDist(x, y) < (dark ? 0.0 : 0.03)) ok = false;
          }
          if (ok && fits(r)) break;
          r *= 0.92;
        }
        const tip = [1, -1].map((sg) => blockDist(hx + (sg * 1.9 * r * Math.cos(f)) / sx, hy - (sg * 1.9 * r * Math.sin(f)) / sy));
        const score = r * (1 - 0.8 * Math.abs(deg) / 90) * (1 + 0.25 * clamp(Math.min(...tip), -0.2, 0.3));
        if (!best || score > best.score) best = { score, r, f };
      }
      if (best && best.r > 0.6 * Rplain) { ringOn = true; R = best.r; phi = best.f; }
    }
  }
  L.normalize();
  // ring plane normal: tipped towards the viewer by `incl`, then turned on screen by phi (y up)
  const A = new THREE.Vector3(-Math.sin(phi) * Math.cos(Math.asin(incl)), Math.cos(phi) * Math.cos(Math.asin(incl)), incl).normalize();

  // ---- a small moon near the planet, on a free patch of sky
  let moon = new THREE.Vector4(9, 9, 0.01, 0);
  if (P.moon) {
    for (let tries = 0; tries < 60; tries++) {
      const a = rng.range(0, Math.PI * 2), dist = horizon ? rng.range(1.04, 1.2) : rng.range(1.45, 2.3), mr = horizon ? rng.range(0.035, 0.05) : R * rng.range(0.11, 0.17);
      const x = hx + (Math.cos(a) * dist * R) / sx, y = hy - (Math.sin(a) * dist * R) / sy;
      if (x < 0.06 || x > 0.94 || y < headBot + 0.06 || y > footTop - 0.08 || blockDist(x, y) < mr + 0.05) continue;
      if (horizon && (Math.abs(x - 0.5) < 0.2 || y > hy - R / sy - 0.02)) continue;
      if (ringOn) {   // not on the ring
        const dx = (x - hx) * sx, dy = -(y - hy) * sy, u = dx * Math.cos(phi) + dy * Math.sin(phi), v = (-dx * Math.sin(phi) + dy * Math.cos(phi)) / incl;
        if (Math.hypot(u, v) < 2.35 * R && Math.hypot(u, v) > 1.05 * R) continue;
      }
      moon = new THREE.Vector4(x, y, mr, 0); break;
    }
  }

  // ---- a few bright stars with flares, clear of the copy, the planet and the moon
  const bright = [];
  for (let tries = 0; tries < 200 && bright.length < Math.round(7 * P.stars); tries++) {
    const x = rng.range(0.03, 0.97), y = rng.range(0.03, 0.97), s = 0.0035 + 0.006 * Math.pow(rng(), 2.2);
    if (blockDist(x, y) < 0.07 || (footer && y > footTop - 0.03) || (header && y < headBot + 0.03)) continue;
    if (Math.hypot((x - hx) * sx, (y - hy) * sy) < R * (ringOn ? 2.3 : 1.25) || Math.hypot((x - moon.x) * sx, (y - moon.y) * sy) < 0.1) continue;
    if (bright.some((o) => Math.hypot((o.x - x) * sx, (o.y - y) * sy) < 0.18)) continue;
    bright.push(new THREE.Vector4(x, y, s, rng()));
  }
  const nBright = bright.length; while (bright.length < 10) bright.push(new THREE.Vector4(9, 9, 0.001, 0));

  // the nebula drifts as a broad band through the planet, turned away from the copy
  const toHero = Math.atan2(-(hy - ccy) * sy, (hx - ccx) * sx), bandAng = horizon ? rng.range(-0.25, 0.25) : toHero + Math.PI / 2 + rng.range(-0.45, 0.45);

  scene.add(backgroundQuad(/* glsl */`
    varying vec2 vUv;
    uniform vec2 uAsp, uC, uBand;
    uniform float uR, uPx, uSeed, uDark, uRingOn, uNeb, uStars, uBands, uFoot, uHead, uHorizon, uFlare;
    uniform vec3 uL, uA; uniform vec4 uMoon, uBright[10], uBlock[3]; uniform int uBrightN;
    uniform vec3 cBg, cNebA, cNebB, cBody, cPale, cAcc, cInk;
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
    float fbm(vec2 p, uint s, int oct){ float a = 0.5, r = 0.0; for (int i = 0; i < oct; i++) { r += a * gn(p, s + uint(i)); p = mat2(1.62, 1.18, -1.18, 1.62) * p + vec2(13.1, -7.7); a *= 0.5; } return r; }
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
    // stars of one size class; "rich" raises the density (along the nebula)
    float starLayer(vec2 q, float cell, float radPx, float keep, uint s, out float tint){
      vec2 g = q / cell; ivec2 id = ivec2(floor(g)); vec2 f = g - floor(g);
      vec2 o = 0.18 + 0.64 * h22(id, s); float b = h21(id, s + 1u); tint = h21(id, s + 2u);
      float rad = uPx * radPx * (0.6 + 0.7 * b) / cell, aa = 0.7 * uPx / cell;
      return smoothstep(rad + aa, rad - aa, length(f - o)) * step(1.0 - keep, h21(id, s + 3u)) * (0.35 + 0.65 * b * b);
    }
    // ring opacity at rho planet radii from the centre
    float ringAt(float rho, float fw){
      // a soft inner fade, one clear division and a clean outer edge: few hard nested ellipses
      float d = smoothstep(1.2, 1.52, rho) * smoothstep(2.12 + fw, 2.12 - fw, rho);
      d *= 1.0 - 0.9 * smoothstep(0.03 + fw, 0.012, abs(rho - 1.78));                 // the wide division
      float fine = smoothstep(0.02, 0.006, fw);                                          // grooves only where they can be resolved
      d *= mix(0.78, 0.6 + 0.4 * (0.5 + 0.5 * gn(vec2(rho * 46.0, 3.7 + uSeed), 5u)) + 0.16 * gn(vec2(rho * 150.0, 9.1), 6u), fine);
      return d * mix(1.0, 0.7, smoothstep(1.8, 2.12, rho));
    }
    void main(){
      vec2 p = vec2(vUv.x, 1.0 - vUv.y), q = p * uAsp;
      vec2 wq = q * 1.3 + uSeed;
      float qd = quietDist(p) + 0.06 * gn(wq * 1.6, 3u);
      float edge = max(smoothstep(uFoot - 0.05, uFoot + 0.012, p.y), smoothstep(uHead + 0.05, uHead - 0.012, p.y));
      float edgeWide = max(smoothstep(uFoot - 0.2, uFoot + 0.05, p.y + 0.03 * gn(wq * 0.8, 8u)), smoothstep(uHead + 0.2, uHead - 0.05, p.y));
      vec2 calm = vec2(max(1.0 - smoothstep(-0.03, 0.14, qd), 0.75 * edge), max(1.0 - smoothstep(-0.02, 0.34, qd), 0.6 * edgeWide));
      vec2 pos = vec2(q.x - uC.x, uC.y - q.y); float r = length(pos);                  // from the planet's centre, y up

      // ---- nebula: two warped cloud layers and a few bright filaments, densest along a band through the planet
      vec3 col = cBg;
      vec2 nq = pos * 1.05 + vec2(uSeed * 1.7, -uSeed);
      float along = dot(pos, uBand), across = dot(pos, vec2(-uBand.y, uBand.x));
      float where = max(max(exp(-pow(across / (0.5 + 0.2 * sin(along * 1.3 + uSeed)), 2.0)), 0.42 * exp(-r * r / 1.2)), 0.2) * (1.0 - 0.97 * calm.y) * uNeb, dA = 0.0;
      if (where > 0.004) {
        vec2 w1 = vec2(fbm(nq * 0.9 + vec2(3.1, 0.0), 11u, 4), fbm(nq * 0.9 + vec2(0.0, 7.7), 15u, 4));
        where *= 0.6 + 0.4 * smoothstep(-0.2, 0.5, fbm(nq * 0.45 + 5.0, 21u, 3) + 0.2);
        float n1 = fbm(nq * 1.25 + 1.15 * w1, 31u, 5), n2 = fbm(nq * 2.1 - 0.9 * w1 + 9.0, 41u, 4);
        dA = smoothstep(-0.3, 0.42, n1) * where; float dB = smoothstep(-0.12, 0.5, n2) * where;
        float fil = pow(clamp(1.0 - abs(fbm(nq * 2.6 + 1.6 * w1 + 4.0, 51u, 4)) * 3.2, 0.0, 1.0), 3.0) * where;
        col = mix(col, cNebA, min(1.0, mix(1.25, 0.86, uDark) * dA));
        col = mix(col, cNebB, min(1.0, mix(1.1, 0.74, uDark) * dB * (0.25 + 0.75 * dA)));
        col = mix(col, mix(cNebB, cPale, 0.5), 0.5 * fil * dA + 0.4 * smoothstep(0.35, 0.9, dA * dB));
        col.x += mix(0.03, 0.05, uDark) * dA;                                             // a little light in the thick of it
        col = mix(col, mix(cBg, cInk, 0.1 * (1.0 - uDark)) * vec3(mix(0.72, 1.0, 1.0 - uDark), 1.0, 1.0), 0.6 * smoothstep(0.05, 0.5, fbm(nq * 1.7 + w1 * 0.8 - 3.0, 61u, 3)) * dA);   // dust lanes
      }

      // ---- stars
      float rich = clamp(dA * 1.4, 0.0, 1.0), t1, t2, t3;
      float big = mix(1.5, 1.0, uDark);
      float s1 = starLayer(q, 0.0105, 0.55 * big, 0.55 + 0.3 * rich, 70u, t1) * mix(0.9, 0.55, uDark);
      float s2 = starLayer(q + 0.37, 0.026, 0.95 * big, 0.5 + 0.3 * rich, 80u, t2) * mix(1.0, 0.8, uDark);
      float s3 = starLayer(q + 0.71, 0.075, 1.55 * big, 0.42, 90u, t3);
      float tint = s3 > 0.0 ? t3 : s2 > 0.0 ? t2 : t1;
      vec3 starC = vec3(mix(1.0, 0.985, uDark), 0.0, 0.0) + vec3(0.0, 0.05, 0.06) * (tint - 0.5) * uDark;
      if (uDark < 0.5 && tint > 0.42) starC = mix(cBg, mix(cInk, cNebA, 0.45), 0.42);
      col = mix(col, starC, clamp((s1 * (1.0 - 0.6 * calm.x) + (s2 + s3) * (1.0 - 0.92 * calm.x)) * uStars, 0.0, 1.0) * mix(0.85, 1.0, uDark));
      for (int i = 0; i < uBrightN; i++) {
        vec4 b = uBright[i]; vec2 dd = q - b.xy * uAsp; float rr = length(dd), s = b.z;
        float core = smoothstep(s * 0.5 + uPx, s * 0.5 - uPx, rr), halo = (0.55 * exp(-rr / (s * 1.3)) + 0.16 * exp(-rr / (s * 4.5))) * uFlare;   // a soft round glow, no spikes
        vec3 sc = mix(vec3(1.0, 0.0, 0.0), mix(mix(cAcc, cPale, b.w), cPale, 1.0 - uDark), mix(0.25, 0.5, 1.0 - uDark));
        col = mix(col, sc, clamp(core + halo, 0.0, 1.0));
      }

      // ---- ring geometry (shared by the ring itself and by its shadow on the planet)
      float zr = -(uA.x * pos.x + uA.y * pos.y) / uA.z;                                // depth of the ring plane on this line of sight
      float rho = length(vec3(pos, zr)) / uR, fwR = fwidth(rho) * 0.75 + 1e-4;
      vec3 sunC = mix(cAcc, cPale, 0.5);

      // ---- the planet
      float aa = uPx * 1.2, disc = smoothstep(aa, -aa, r - uR);
      // air glowing beyond the sunlit limb
      float limbLit = smoothstep(-0.35, 0.55, dot(pos / max(r, 1e-4), uL.xy) + 0.6 * uL.z - 0.2);
      float airK = mix(1.0, 0.22, uHorizon);
      col = mix(col, mix(mix(cAcc, cPale, 0.3), mix(cPale, cBody, 0.3), 1.0 - uDark), (0.5 * exp(-max(r - uR, 0.0) / (uR * 0.035 * airK)) + 0.2 * exp(-max(r - uR, 0.0) / (uR * 0.16 * airK))) * limbLit * (1.0 - disc) * (1.0 - 0.8 * calm.x));
      if (disc > 0.0) {
        float z = sqrt(max(uR * uR - r * r, 0.0)); vec3 N = vec3(pos, z) / uR;
        // banded atmosphere in the planet's own frame (pole = ring axis)
        vec3 ax = normalize(uA), e1 = normalize(cross(ax, vec3(0.0, 0.0, 1.0))), e2 = cross(ax, e1);
        float lat = dot(N, ax), lon = atan(dot(N, e2), dot(N, e1));
        vec2 sp = vec2(lon * 1.2, lat * 4.0) + uSeed;
        float turb = fbm(sp * vec2(1.6, 2.4), 71u, 4), lt = lat * 7.5 * uBands + 0.55 * turb + 0.25 * fbm(sp * vec2(5.0, 9.0), 75u, 3);
        float b1 = 0.5 + 0.5 * sin(lt * 2.1 + 0.6 * sin(lt * 0.9 + 1.3)), b2 = 0.5 + 0.5 * sin(lt * 5.3 + 2.0);
        vec3 surf = mix(cBody, mix(cBody, cPale, 0.75), smoothstep(0.25, 0.8, b1));
        surf = mix(surf, mix(cBody, cNebB, 0.35) * vec3(0.86, 1.0, 1.0), 0.5 * smoothstep(0.5, 0.95, b2) * (1.0 - 0.5 * b1));
        surf = mix(surf, cAcc, 0.3 * smoothstep(0.62, 0.9, b1 * (0.6 + 0.4 * b2)));
        float storm = smoothstep(0.16, 0.05, length((sp - vec2(uSeed + 0.7, uSeed - 1.2 + 0.0)) * vec2(1.0, 2.6)));
        surf = mix(surf, mix(cPale, cAcc, 0.4), 0.6 * storm);
        surf = mix(surf, mix(cBody, cPale, 0.5), 0.35 * smoothstep(0.72, 0.98, abs(lat)));        // pale polar caps
        // light: soft terminator, limb darkening, the ring's shadow, a rim of lit air
        float ndl = dot(N, uL), lit = smoothstep(-0.12, mix(0.42, 0.3, uHorizon), ndl) * (0.72 + 0.28 * pow(max(N.z, 0.0), 0.45));
        if (uRingOn > 0.5) {
          float tS = -dot(vec3(pos, z), uA) / dot(uL, uA);
          if (tS > 0.0) { vec3 Q = vec3(pos, z) + tS * uL; lit *= 1.0 - 0.72 * ringAt(length(Q) / uR, 0.012) * smoothstep(0.0, 0.2, ndl); }
        }
        vec3 night = mix(mix(cBg, surf, 0.16) * vec3(mix(0.8, 1.0, 1.0 - uDark), 1.0, 1.0), mix(surf, mix(cBg, cInk, 0.3), 0.5), 1.0 - uDark);
        vec3 pc = mix(night, surf, lit);
        pc = mix(pc, mix(cAcc, cPale, 0.45), mix(0.55, 0.9, uHorizon) * pow(1.0 - max(N.z, 0.0), mix(2.6, 9.0, uHorizon)) * smoothstep(-0.05, 0.5, ndl));
        pc = mix(pc, mix(cBg, cNebA, 0.04), calm.x * 0.94);
        col = mix(col, pc, disc);
      }
      // ---- the ring: behind the planet where it passes behind, in front where it passes in front
      if (uRingOn > 0.5) {
        float dn = ringAt(rho, fwR);
        if (dn > 0.001) {
          float zs = sqrt(max(uR * uR - r * r, 0.0)), front = r < uR ? step(zs, zr) : 1.0;
          vec3 Q = vec3(pos, zr); float along = dot(Q, uL), perp = length(Q - along * uL);
          float shadow = (1.0 - smoothstep(uR * 0.985, uR * 1.03, perp)) * step(along, 0.0);      // the planet's shadow across the ring
          vec3 rc = mix(mix(cPale, cBody, 0.35 + 0.3 * sin(rho * 9.0 + uSeed)), cAcc, 0.25 * smoothstep(1.3, 2.1, rho));
          rc = mix(rc, mix(cBg, rc, mix(0.1, 0.55, 1.0 - uDark)), shadow);
          col = mix(col, rc, dn * 0.9 * mix(1.0, front, disc) * pow(1.0 - calm.y, 1.5));
        }
      }
      // ---- the moon: a small crescent lit by the same sun
      vec2 mp = vec2(q.x - uMoon.x * uAsp.x, uMoon.y * uAsp.y - q.y); float mr = length(mp);
      if (mr < uMoon.z + 2.0 * uPx) {
        vec3 N = vec3(mp, sqrt(max(uMoon.z * uMoon.z - mr * mr, 0.0))) / uMoon.z;
        float lit = smoothstep(-0.05, 0.3, dot(N, uL));
        vec3 ms = mix(cPale, cBody, 0.2 + 0.25 * smoothstep(-0.1, 0.3, fbm(N.xy * 2.6 + uSeed, 91u, 3)));
        vec3 mc = mix(mix(mix(cBg, ms, 0.12), mix(ms, mix(cBg, cInk, 0.3), 0.5), 1.0 - uDark), ms, lit);
        col = mix(col, mc, smoothstep(uPx, -uPx, mr - uMoon.z) * (1.0 - 0.9 * calm.x));
      }
      // ---- light on the limb: a soft round glint where the sun grazes it; in the horizon view the sun
      // itself blooms over the edge and lights a thin line of air along it. Round glows only: no spikes, no streaks.
      if (uFlare > 0.0) {
        vec2 g = pos - normalize(uL.xy) * uR * mix(0.995, 1.0, uHorizon); float gl = length(g);
        float fl = uHorizon > 0.5
          ? 0.9 * exp(-gl / 0.014) + 0.5 * exp(-gl / 0.06) + 0.2 * exp(-gl / 0.22) + 0.85 * exp(-abs(r - uR) / 0.0028) * exp(-gl / 0.75)
          : 0.5 * exp(-gl / (uR * 0.05)) * smoothstep(0.1, 0.5, length(uL.xy));
        col = mix(col, mix(vec3(1.0, 0.0, 0.0), mix(sunC, cPale, 0.5), 0.75 * (1.0 - uDark)), clamp(fl * uFlare, 0.0, 1.0) * (1.0 - calm.x));
      }
      gl_FragColor = vec4(clamp(lab2lin(col), 0.0, 1.0), 1.0);
      #include <colorspace_fragment>
      float d1 = h21(ivec2(gl_FragCoord.xy), 5u), d2 = h21(ivec2(gl_FragCoord.xy), 6u);
      gl_FragColor.rgb += (d1 + d2 - 1.0) / 255.0;                        // dither: no banding in the soft clouds
    }`, {
    uAsp: { value: new THREE.Vector2(sx, sy) }, uC: { value: new THREE.Vector2(hx * sx, hy * sy) },
    uBand: { value: new THREE.Vector2(Math.cos(bandAng), Math.sin(bandAng)) },
    uR: { value: R }, uPx: { value: 1 / Math.min(W, H) }, uSeed: { value: (seed % 113) * 0.713 }, uDark: { value: dark ? 1 : 0 },
    uRingOn: { value: ringOn ? 1 : 0 }, uNeb: { value: P.nebula }, uStars: { value: P.stars }, uBands: { value: P.bands }, uHorizon: { value: horizon ? 1 : 0 }, uFlare: { value: P.flare },
    uL: { value: L }, uA: { value: A }, uMoon: { value: moon }, uBright: { value: bright }, uBrightN: { value: nBright },
    cBg: { value: bg }, cNebA: { value: nebA }, cNebB: { value: nebB }, cBody: { value: body }, cPale: { value: pale }, cAcc: { value: acc }, cInk: { value: ink },
    uBlock: { value: [0, 1, 2].map((i) => { const b = blocks[i]; return !b ? new THREE.Vector4(3, 3, 3, 3) : new THREE.Vector4(b.x0, b.y0, b.x1, b.y1); }) },
    uFoot: { value: footer ? footTop : 2 }, uHead: { value: header ? headBot : -1 },
  }));

  ctx.frame({ radius: 1, fov: 30, dir: [0, 0, 1] });
}
