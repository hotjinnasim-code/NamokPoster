// City at blue hour — a full-picture scene: four receding layers of towers with lit windows under a
// graded sky, a moon (or a low sun) at the layout focus, haze glowing between the layers and a
// harbour in the foreground that mirrors the lights. The buildings are laid out on the CPU
// (deterministic, seedable) and handed to one fragment shader as a float texture, so the city can be
// composed around the copy: the towers rise beside the hero and the skyline sinks under the text.
// Window light is written in HDR and bloomed.
//
// Palette: bg = upper sky (behind the copy) and deep water · colors[0] = nearest buildings
//          colors[1] = far buildings · colors[2] = horizon glow · colors[3] = second light colour
//          (cool windows, beacons) · accent = window light, haze tint and the moon / sun
import { makeNoise, backgroundQuad, quietUniforms, makeComposer, finishPassShader, hdrClipPassShader, oklabVec, GLSL_OKLAB, GLSL_NOISE_KIT } from '/skill/assets/web/scene-lib.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export default function build(ctx) {
  const { THREE, scene, palette, params, aspect, seed, rng, width: W, height: H } = ctx;
  const sx = Math.max(aspect, 1), sy = Math.max(1 / aspect, 1);          // frame fraction → short-side units
  const P = {
    height: clamp(params.height ?? 1, 0.4, 1.6), lights: clamp(params.lights ?? 1, 0, 2), water: params.water ?? true, haze: clamp(params.haze ?? 1, 0, 2),
    bloom: clamp(params.bloom ?? 1, 0, 2), stars: params.stars ?? 'auto', body: params.body ?? 'auto', moon: clamp(params.moon ?? 1, 0.5, 1.8), towers: params.towers ?? true,
  };

  // ---- colours: everything painted is mixed in OKLab; light sources are added in linear RGB on top
  const cols = palette.colors, mixL = (a, b, t) => a.clone().lerp(b, t);
  const accHex = palette.accentOriginal ?? palette.accent;
  const bg = oklabVec(palette.bg), near = oklabVec(cols[0]), mid = oklabVec(cols[1] ?? cols[0]), hor = oklabVec(cols[2] ?? accHex), acc = oklabVec(accHex);
  const dark = bg.x < 0.6;
  const sun = P.body === 'sun' || (P.body !== 'moon' && (!dark || (hor.z > 0.07 && hor.y > 0.04)));
  const showStars = P.stars === 'auto' ? dark && !sun : !!P.stars && P.stars !== 'none';
  // The hero is only ever a plain disc with a soft round glow, and never a red one: a reddish light colour is
  // turned to amber, and on a light sky the sun is a pale disc (no red or crimson disc on a white or cream field).
  const noRed = (lab) => {
    const C = Math.hypot(lab.y, lab.z), h = (Math.atan2(lab.z, lab.y) * 180) / Math.PI;
    return C > 0.06 && h > -40 && h < 56 ? new THREE.Vector3(lab.x, C * Math.cos(1.22), C * Math.sin(1.22)) : lab;      // hue → ~70° (amber)
  };
  let body = noRed(sun ? (dark ? acc : oklabVec(cols[3] ?? accHex)) : mixL(acc, new THREE.Vector3(1, 0, 0), 0.7));   // the moon is a pale tint of the light colour
  if (!dark) { const C = Math.hypot(body.y, body.z), k = C > 0.055 ? 0.055 / C : 1; body = new THREE.Vector3(Math.max(body.x, 0.955), body.y * k, body.z * k); }
  // by night the windows burn in the accent with a few in the second light colour; by day it is the other way round
  const lWarm = new THREE.Color(dark ? accHex : cols[3] ?? accHex), lCool = new THREE.Color(dark ? cols[3] ?? '#ffffff' : accHex).multiplyScalar(0.72);

  // ---- where the copy sits
  const quiet = (ctx.quiet || []).map(([x0, y0, x1, y1]) => ({ x0, y0, x1, y1 }));
  const strip = (r) => r.x0 <= 0.02 && r.x1 >= 0.98;
  const footer = quiet.find((r) => strip(r) && r.y1 >= 0.98 && r.y0 > 0.5), header = quiet.find((r) => strip(r) && r.y0 <= 0.02 && r.y1 < 0.5);
  const blocks = quiet.filter((r) => r !== footer && r !== header);
  const headBot = header ? header.y1 : 0;

  // ---- the harbour: a mirror along the bottom edge; the footer always lies on open water
  let yW = 1.06;
  if (P.water) {
    yW = 1 - (aspect < 0.87 ? 0.135 : aspect < 1.15 ? 0.15 : 0.17);
    if (footer) yW = Math.min(yW, footer.y0 - 0.025);
    for (const b of blocks) if (b.y1 > yW - 0.02 && b.x1 - b.x0 > 0.7 && b.y0 > 0.45) yW = Math.min(yW, b.y0 - 0.03);   // a wide copy block at the bottom floats on the water
  }
  const yBase = yW;

  // ---- the hero: at the layout focus; if the copy lies on top of it, it moves just below (or above) the copy
  let hx = ctx.focus.x, hy = ctx.focus.y, rS = (0.04 + 0.042 * clamp(ctx.artSize ?? 0.6, 0.3, 1)) * P.moon * (sun ? 1.3 : 1);
  for (const b of blocks) {
    const rx = rS / sx, ry = rS / sy;
    if (!(hx > b.x0 - rx && hx < b.x1 + rx && hy > b.y0 - ry && hy < b.y1 + ry)) continue;
    rS *= 0.85;
    const below = b.y1 + (rS / sy) * 1.3;
    if (yBase - below >= (0.13 + rS) / sy) hy = below; else hy = Math.max(headBot + (rS / sy) * 1.6, b.y0 - (rS / sy) * 1.7);
  }
  // … and it always leaves room for a strip of city underneath
  hy = Math.min(hy, yBase - (0.12 + (sun ? 0.35 : 1.25) * rS) / sy);
  const rx = rS / sx, ry = rS / sy;
  const yNotch = hy + (sun ? 0.3 : 1.22) * ry;                             // the far skyline passes under (moon) or across (sun) the disc

  // ---- upper bound of the skyline at each x: low under the disc, rising beside it, sinking under the copy
  const copy = blocks[0], copyCx = copy ? (copy.x0 + copy.x1) / 2 : 0.5;
  let peakSide = hx >= copyCx ? 1 : -1;
  if (Math.abs(hx - copyCx) < 0.08) peakSide = rng() < 0.5 ? -1 : 1;
  if (hx + peakSide * rx * 3.2 > 0.96 || hx + peakSide * rx * 3.2 < 0.04) peakSide = -peakSide;
  const rise = (0.24 * P.height) / sy;
  const bound = (x) => {
    const du = Math.abs(x - hx) * sx;
    let y = yNotch - rise * ((x - hx) * peakSide > 0 ? 1 : 0.7) * sstep(1.25 * rS, 4.5 * rS, du) * (1 - 0.45 * sstep(0.45, 1.3, du));
    for (const b of blocks) {
      if (b.y0 > yBase - 0.03) continue;                                   // copy on the water
      const fl = clamp((hx - b.x1) * 0.9, 0.1, 0.3), fr = clamp((b.x0 - hx) * 0.9, 0.1, 0.3);   // a long slope down from the towers
      const pad = 0.045 / sx;                                              // the skyline is already down where the mist around the copy begins
      const m = sstep(b.x0 - fr - pad, b.x0 - pad, x) * (1 - sstep(b.x1 + pad, b.x1 + pad + fl, x));
      y = lerp(y, Math.max(y, Math.min(b.y1 + 0.045, yBase - 0.03 / sy)), m);
    }
    return clamp(y, headBot + 0.05, yBase - 0.03 / sy);
  };

  // ---- buildings → float texture. Three rows per layer:
  //   silhouette (R = top y, with masts, crowns and roof clutter) · upper block · lower block,
  //   a block being (top y, x0, x1, id): the rectangle that carries a window grid.
  const LAY = 4, TW = Math.min(4096, 2 ** Math.ceil(Math.log2(W * 2))), ROWS = LAY * 3 + 1;        // + one row: the smooth bound itself
  const data = new Float32Array(TW * ROWS * 4), noise = makeNoise(seed * 29 + 5), beacons = [];
  const kx = (x) => clamp(Math.round(x * (TW - 1)), 0, TW - 1);
  let nextId = 1;
  const clearRange = (i, x0, x1) => { for (let k = kx(x0); k <= kx(x1); k++) { data[(i * 3 * TW + k) * 4] = 3; data[((i * 3 + 1) * TW + k) * 4 + 3] = 0; data[((i * 3 + 2) * TW + k) * 4 + 3] = 0; } };
  const setBlock = (row, x0, x1, top, id) => { for (let k = kx(x0); k <= kx(x1); k++) { const o = (row * TW + k) * 4; data[o] = top; data[o + 1] = x0; data[o + 2] = x1; data[o + 3] = id; } };
  const cut = (i, x0, x1, fn) => { for (let k = kx(x0); k <= kx(x1); k++) { const o = (i * 3 * TW + k) * 4; data[o] = Math.min(data[o], fn(k / (TW - 1))); } };
  const mast = (i, x, y, hU) => { const mw = Math.max(0.0034, 2.4 / Math.min(W, H)) / sx; cut(i, x - mw / 2, x + mw / 2, () => y - hU / sy); beacons.push([x, y - hU / sy, i]); };
  const pickRoof = (i, hU) => {
    const r = rng();
    if (i <= 1) return hU > 0.13 ? (r < 0.34 ? 'setback' : r < 0.5 ? 'mast' : r < 0.58 ? 'slant' : 'flat') : (r < 0.14 ? 'setback' : r < 0.22 ? 'slant' : 'flat');
    if (i === 2) return r < 0.2 ? 'setback' : r < 0.34 ? 'tank' : r < 0.4 ? 'mast' : r < 0.48 ? 'slant' : 'flat';
    return r < 0.3 ? 'tank' : r < 0.42 ? 'setback' : r < 0.5 ? 'slant' : 'flat';
  };
  const building = (i, x0, x1, top, roof0) => {
    const w = x1 - x0, hU = (yBase - top) * sy, roof = roof0 ?? pickRoof(i, hU), id = nextId++;
    if (roof === 'setback' || roof === 'crown') {
      const a = rng.range(0.14, 0.28), b = roof === 'crown' ? a : rng() < 0.3 ? 0 : rng.range(0.14, 0.28);
      const th = clamp(hU * rng.range(0.14, 0.28), 0.02, 0.11) / sy, bodyTop = top + th, tx0 = x0 + w * a, tx1 = x1 - w * b;
      setBlock(i * 3 + 2, x0, x1, bodyTop, id); cut(i, x0, x1, () => bodyTop);
      setBlock(i * 3 + 1, tx0, tx1, top, nextId++); cut(i, tx0, tx1, () => top);
      if (roof === 'crown') {                                              // two more narrowing steps and a mast
        let cx0 = tx0, cx1 = tx1, cy = top;
        for (let s = 0; s < 2; s++) { const ww = cx1 - cx0; cx0 += ww * 0.24; cx1 -= ww * 0.24; cy -= rng.range(0.012, 0.022) / sy; const yy = cy; cut(i, cx0, cx1, () => yy); }
        mast(i, (cx0 + cx1) / 2, cy, rng.range(0.04, 0.075));
      } else if (rng() < 0.35) mast(i, lerp(tx0, tx1, rng.range(0.3, 0.7)), top, rng.range(0.015, 0.04));
    } else {
      setBlock(i * 3 + 2, x0, x1, top, id);
      if (roof === 'slant') { const dh = clamp(w * sx * rng.range(0.25, 0.6), 0.006, 0.03) / sy, dir = rng.sign(); cut(i, x0, x1, (x) => top - dh * clamp(dir > 0 ? (x - x0) / w : (x1 - x) / w, 0, 1)); }
      else cut(i, x0, x1, () => top);
      if (roof === 'mast') mast(i, lerp(x0, x1, rng.range(0.3, 0.7)), top, rng.range(0.018, 0.05));
      if (roof === 'tank') { const tw = w * rng.range(0.22, 0.4), tx = lerp(x0, x1 - tw, rng()), th = rng.range(0.006, 0.013) / sy; cut(i, tx, tx + tw, () => top - th); }
    }
  };
  for (let i = 0; i < LAY; i++) clearRange(i, 0, 1);
  // the bound, smoothed very wide (two box passes) into one gentle slope: sky warmth and haze lie level over the
  // city instead of following the towers beside the disc and the notch under it — bands of glow that rise on
  // either side of the hero would read as wedges spreading from it
  {
    let cur = new Float32Array(TW); for (let k = 0; k < TW; k++) cur[k] = bound(k / (TW - 1));
    const rad = Math.round(TW * 0.28);
    for (let pass = 0; pass < 2; pass++) {
      const nxt = new Float32Array(TW); let sum = 0;
      for (let k = -rad; k <= rad; k++) sum += cur[clamp(k, 0, TW - 1)];
      for (let k = 0; k < TW; k++) { nxt[k] = sum / (2 * rad + 1); sum += cur[clamp(k + rad + 1, 0, TW - 1)] - cur[clamp(k - rad, 0, TW - 1)]; }
      cur = nxt;
    }
    for (let k = 0; k < TW; k++) data[(LAY * 3 * TW + k) * 4] = cur[k];
  }
  const WMIN = [0.02, 0.028, 0.04, 0.055], WMAX = [0.05, 0.066, 0.09, 0.13], HLO = [0.5, 0.36, 0.2, 0.07], HHI = [1.0, 0.82, 0.6, 0.36], GAP = [0.05, 0.09, 0.13, 0.2];
  for (let i = 0; i < LAY; i++) {
    let x = -0.03 - rng() * 0.03; const off = rng.range(0, 50);
    while (x < 1.03) {
      const w = lerp(WMIN[i], WMAX[i], Math.pow(rng(), 1.6)) / sx;
      if (rng() < GAP[i]) { x += w * rng.range(0.3, 0.9); continue; }
      const xc = clamp(x + w / 2, 0, 1), avail = yBase - bound(xc);
      if (i >= 2 && avail * sy < 0.075) { x += w; continue; }               // squeezed under the copy: only the far, hazy shore remains
      const district = clamp(0.5 + 0.9 * noise.noise3(xc * sx * [2.1, 2.6, 3.2, 3.8][i] + off, i * 3.7, 0.5), 0, 1);   // blocks of tall and low buildings
      const hf = lerp(HLO[i], HHI[i], clamp(0.25 * rng() + 0.75 * district * rng.range(0.75, 1.1), 0, 1));
      building(i, x, x + w, yBase - Math.max(avail * hf, (0.016 + 0.03 * (1 - i / 3)) / sy));
      x += w;
    }
  }
  // landmark towers that frame the hero: they are allowed above the general bound, but never into the copy
  if (P.towers) {
    const spots = [[1, peakSide * rng.range(2.0, 2.6), rng.range(0.9, 1.7), rng.range(0.05, 0.064)], [1, -peakSide * rng.range(2.5, 3.3), rng.range(-0.5, 0.4), rng.range(0.042, 0.055)], [0, peakSide * rng.range(4.3, 5.4), rng.range(0.1, 0.9), rng.range(0.04, 0.052)]];
    for (const [layer, dx, up, wU] of spots) {
      const xc = hx + (dx * rS) / sx, x0 = xc - wU / 2 / sx, x1 = xc + wU / 2 / sx;
      let top = Math.max(hy - (up * rS * P.height) / sy, headBot + 0.07);
      if (x0 < 0.01 || x1 > 0.99) continue;
      for (const b of blocks) if (x1 > b.x0 - 0.07 / sx && x0 < b.x1 + 0.07 / sx && top < b.y1 + 0.05) top = b.y1 + 0.06;
      if (top > yBase - 0.1 / sy) continue;
      clearRange(layer, x0, x1); building(layer, x0, x1, top, 'crown');
    }
  }
  let cityTop = 1; for (let i = 0; i < LAY; i++) for (let k = 0; k < TW; k++) cityTop = Math.min(cityTop, data[(i * 3 * TW + k) * 4]);
  const prof = new THREE.DataTexture(data, TW, ROWS, THREE.RGBAFormat, THREE.FloatType);
  prof.minFilter = prof.magFilter = THREE.NearestFilter; prof.needsUpdate = true;
  // aircraft-warning lights on the highest masts
  beacons.sort((a, b) => a[1] - b[1]);
  const bcn = beacons.filter(([x, y]) => x > 0.01 && x < 0.99 && !quiet.some((r) => x > r.x0 - 0.01 && x < r.x1 + 0.01 && y > r.y0 - 0.01 && y < r.y1 + 0.01)).slice(0, 6).map(([x, y, i]) => new THREE.Vector4(x, y, 1, i));
  if (!dark) bcn.length = 0;                                               // no red lamps against a pale sky
  const nBcn = bcn.length; while (bcn.length < 6) bcn.push(new THREE.Vector4(3, 3, 0, 0));

  const short = Math.min(W, H);
  scene.add(backgroundQuad(/* glsl */`
    varying vec2 vUv;
    uniform sampler2D uProf; uniform float uTW; uniform int uBcnN;
    uniform vec2 uRes, uHero, uAsp;
    uniform float uR, uWater, uBase, uPx, uSeed, uSun, uStars, uHaze, uNotch, uLights, uDark, uCityTop;
    uniform float uCW[4]; uniform vec4 uBcn[6], uQuiet[4];
    uniform vec3 cBg, cNear, cMid, cHor, cBody, cHaze;                    // OKLab
    uniform vec3 lWarm, lCool;                                            // linear light colours
    ${GLSL_NOISE_KIT}
    ${GLSL_OKLAB}
    float H2(float a, float b){ return hash21(vec2(a, b)); }
    // distance (short-side units) to the nearest rectangle that carries type; negative inside
    float quietDist(vec2 p){
      float d = 9.0;
      for (int i = 0; i < 4; i++) { vec4 r = uQuiet[i]; vec2 e = (abs(p - 0.5 * (r.xy + r.zw)) - 0.5 * (r.zw - r.xy)) * uAsp; d = min(d, length(max(e, 0.0)) + min(max(e.x, e.y), 0.0)); }
      return d;
    }
    // x: on the copy, y: anywhere near it, z: close to it
    vec3 calmAt(vec2 p){
      float qd = quietDist(p) + 0.03 * noise2(p * uAsp * 2.6 + uSeed);
      return vec3(1.0 - smoothstep(-0.02, 0.05, qd), 1.0 - smoothstep(0.0, 0.5, qd), 1.0 - smoothstep(0.0, 0.24, qd));
    }
    // window grid of one block (top y, x0, x1, id): returns the light it gives off; glass = window mask
    vec3 windowLight(vec4 blk, vec2 p, float cw, float px, out float glass){
      glass = 0.0;
      float s = blk.a, bw = (blk.z - blk.y) * uAsp.x;
      vec2 l = vec2((p.x - blk.y) * uAsp.x, (p.y - blk.x) * uAsp.y);
      float kind = H2(s, 1.0), occ = mix(0.1, 0.62, H2(s, 2.0)) * uLights, mrg = cw * 0.42;
      if (bw < cw * 1.7) return vec3(0.0);
      float cols = max(1.0, floor((bw - 2.0 * mrg) / cw + 0.5)), cwa = (bw - 2.0 * mrg) / cols, ch = cw * (kind < 0.4 ? 1.3 : 1.55);
      vec2 g = vec2((l.x - mrg) / cwa, (l.y - cw * 0.75) / ch);
      if (g.x < 0.0 || g.x >= cols || g.y < 0.0) return vec3(0.0);
      vec2 id = floor(g), f = g - id;
      vec2 gp = kind < 0.4 ? vec2(0.08, 0.3) : vec2(0.25, 0.27), aa = vec2(px / cwa, px / ch) * 0.75;
      float m = smoothstep(gp.x - aa.x, gp.x + aa.x, f.x) * smoothstep(1.0 - gp.x + aa.x, 1.0 - gp.x - aa.x, f.x)
              * smoothstep(gp.y - aa.y, gp.y + aa.y, f.y) * smoothstep(1.0 - gp.y + aa.y, 1.0 - gp.y - aa.y, f.y);
      float on = 0.0, fy = id.y + s * 13.0, fxy = id.x + s * 7.0;
      if (kind < 0.4) {                                                    // offices: whole floors, or a run of bays along a floor
        float b = H2(fy, 5.0), x0 = step(0.55, b) * H2(fy, 4.0) * 0.6, x1 = x0 + mix(0.45, 1.0, H2(fy, 6.0)), t = (id.x + 0.5) / cols;
        on = step(H2(fy, 3.0), occ * 1.1) * step(x0, t) * step(t, x1);
        on = max(on, step(H2(fxy, id.y + 9.0), 0.03));
      } else if (kind < 0.82) {                                            // flats: neighbours switch on together, with the odd dark one between
        float n = noise2(vec2(id.x * 0.6, id.y * 0.45) + s * 3.7);
        on = step(mix(0.42, 0.02, occ), n) * step(0.2, H2(fxy, id.y + 21.0));
        on = max(on, step(H2(fxy, id.y + 33.0), 0.04 + 0.1 * occ));
      } else {                                                             // a dark tower: one lit stair core and a few late workers
        float core = floor(H2(s, 7.0) * cols);
        on = max(step(abs(id.x - core), 0.1) * step(H2(fy, 8.0), 0.82), step(H2(fxy, id.y + 45.0), 0.045 * uLights));
      }
      float br = 0.5 + 0.5 * H2(fxy, id.y + 57.0);
      float cool = step(0.72, H2(kind < 0.4 ? fy : fxy + id.y * 3.0, 61.0));
      glass = m;
      return mix(lWarm, lCool, cool * 0.85) * (on * m * br);
    }
    // everything above the water line for a point p of the frame (y down): painted colour (OKLab) and emitted light (linear).
    // Composited front to back, so a pixel on a near wall never pays for the towers, haze and sky behind it.
    void world(vec2 p, vec3 calm, float soft, out vec3 col, out vec3 light){
      vec2 d = (p - uHero) * uAsp, q = p * uAsp; float dist = length(d);
      float fx = clamp(p.x, 0.0, 1.0) * (uTW - 1.0), ix = floor(fx), fr = fx - ix;
      int k0 = int(ix), k1 = min(k0 + 1, int(uTW) - 1), kn = fr < 0.5 ? k0 : k1;
      float bnd = mix(texelFetch(uProf, ivec2(k0, 12), 0).r, texelFetch(uProf, ivec2(k1, 12), 0).r, fr);   // how high the city may reach here
      float hazeTop = bnd - 0.16 / uAsp.y;
      // sky: the plain upper tone, warming towards the skyline and around the hero
      float v = smoothstep(bnd - 0.62 / uAsp.y, bnd + 0.1 / uAsp.y, p.y);
      float glow = exp(-dot(d * vec2(0.55, 1.0), d * vec2(0.55, 1.0)) / 0.16);
      float warm = clamp(pow(v, 2.2) * (0.5 + 0.4 * glow) + 0.22 * glow * v, 0.0, 1.0) * (1.0 - 0.9 * calm.y);
      vec3 sky = mix(cBg, mix(cBg, cHor, 0.4), smoothstep(0.0, 0.6, warm)); sky = mix(sky, cHor, smoothstep(0.5, 1.0, warm) * 0.72);
      vec3 glowC = mix(cHor, cBody, 0.5);
      col = vec3(0.0); light = vec3(0.0);
      float T = 1.0, hazeBand = smoothstep(hazeTop, max(uBase, hazeTop + 0.1), p.y) * uHaze * (1.0 - 0.8 * calm.z);
      if (p.y > uCityTop - 2.0 * uPx * soft) {
        for (int n = 0; n < 4; n++) {                                      // towers, near to far
          int i = 3 - n; float t = float(i) / 3.0;
          float ta = texelFetch(uProf, ivec2(k0, i * 3), 0).r, tb = texelFetch(uProf, ivec2(k1, i * 3), 0).r;
          float top = mix(ta, tb, fr), slope = (tb - ta) * (uTW - 1.0) * uRes.y / uRes.x;
          float cov = clamp((p.y - top) * uRes.y / sqrt(1.0 + slope * slope) / soft + 0.5, 0.0, 1.0);
          cov = min(cov, clamp((p.y - min(ta, tb)) * uRes.y / soft + 0.5, 0.0, 1.0));      // a wall ends at its roof
          if (cov > 0.0) {
            vec4 up = texelFetch(uProf, ivec2(kn, i * 3 + 1), 0), lo = texelFetch(uProf, ivec2(kn, i * 3 + 2), 0);
            vec4 blk = (up.a > 0.5 && p.y < lo.x) ? up : lo;
            vec3 c = mix(sky, mix(cMid, cNear, smoothstep(0.1, 1.0, t)), mix(0.36, 1.0, pow(t, 0.8)));   // aerial perspective
            float glass = 0.0; vec3 wl = vec3(0.0);
            if (blk.a > 0.5 && p.y >= blk.x) {
              c.x += (H2(blk.a, 71.0) - 0.5) * 0.03 * mix(0.5, 1.0, t);     // neighbours differ a little in tone
              wl = windowLight(blk, p, uCW[i], uPx * soft, glass) * mix(0.5, 1.0, t) * (1.0 - calm.x);
              // the wall that faces the hero catches a little of its light
              float e = (uHero.x > 0.5 * (blk.y + blk.z) ? blk.z - p.x : p.x - blk.y) * uAsp.x;
              c = mix(c, glowC, smoothstep(uCW[i] * 0.4, uCW[i] * 0.1, e) * 0.1 * mix(0.5, 1.0, t));
              c = mix(c, sky, glass * 0.06 * t);                            // dark panes hold a trace of sky
            }
            // street glow pools at the foot of each layer
            float hgt = max(uBase - p.y, 0.0) * uAsp.y;
            c = mix(c, cHaze, mix(0.5, 0.16, t) * exp(-hgt / mix(0.14, 0.05, t)) * uHaze * (1.0 - 0.6 * calm.z));
            col += T * cov * c; light += T * cov * wl; T *= 1.0 - cov;
            if (T < 0.004) break;
          }
          // haze lies behind each layer, over everything farther away; heavier towards the ground
          float hz = (i == 0 ? 0.1 : 0.27) * hazeBand;
          col += T * hz * cHaze; T *= 1.0 - hz;
        }
      } else if (hazeBand > 0.0) {
        float clear = (1.0 - 0.1 * hazeBand) * pow(1.0 - 0.27 * hazeBand, 3.0);
        col += (1.0 - clear) * cHaze; T = clear;
      }
      // aircraft-warning lights
      for (int i = 0; i < uBcnN; i++) {
        vec2 bd = (p - uBcn[i].xy) * uAsp; float r = max(0.0026, 2.2 * uPx) * soft;
        if (abs(bd.x) < r && abs(bd.y) < r) light += mix(vec3(1.0, 0.16, 0.12), lCool, 0.25) * smoothstep(r, r * 0.3, length(bd)) * 2.2 * (1.0 - calm.x);
      }
      if (T < 0.004) return;
      // ---- what is left of the view is sky
      vec3 sc = sky, sl = vec3(0.0);
      // a few stars, thinning out towards the glow
      if (uStars > 0.5 && p.y < hazeTop + 0.04 && calm.x < 0.95) {
        float st = 0.0;
        for (int L = 0; L < 2; L++) {
          float cell = L == 0 ? 0.045 : 0.12; vec2 g = q / cell, id = floor(g), f = g - id;
          vec2 o = 0.2 + 0.6 * hash22(id + float(L) * 37.0); float b = hash21(id + 91.0 + float(L) * 17.0);
          float rad = uPx * (L == 0 ? 1.0 : 1.9) * (0.6 + 0.7 * b) / cell, aa = 0.6 * uPx / cell;
          st += smoothstep(rad + aa, rad - aa, length(f - o)) * step(L == 0 ? 0.55 : 0.4, b) * (L == 0 ? 0.6 : 1.0) * (0.4 + 0.6 * b);
        }
        st *= (1.0 - smoothstep(0.08, 0.6, warm)) * smoothstep(uR * 2.0, uR * 4.5, dist) * (1.0 - 0.85 * calm.x) * smoothstep(hazeTop + 0.04, hazeTop - 0.12, p.y);
        sc = mix(sc, vec3(0.97, 0.0, 0.01), st); sl += vec3(0.25) * st;
      }
      // thin streaks of cloud low in the sky, lit from below by the city
      float band = smoothstep(bnd - 0.5 / uAsp.y, bnd - 0.1 / uAsp.y, p.y) * (1.0 - calm.x) * (1.0 - 0.7 * calm.y);
      if (band > 0.01) sc = mix(sc, mix(sky, cHor, 0.4 + 0.4 * glow), smoothstep(0.6, 0.88, ridged2(vec2(q.x * 0.8 + uSeed, q.y * 6.5 - uSeed * 0.4), 4)) * band * 0.3);
      // a soft round glow, then the plain disc. The glow is kept tight against the limb with only a faint wide veil:
      // a broad, strong radial gradient reads to the motif check as a fan of edges around the disc, and nothing
      // may seem to radiate from it. For the same reason the disc itself is not bloomed.
      float hx = max(dist - uR, 0.0) / uR;
      sc = mix(sc, glowC, (0.22 * exp(-hx / 0.22) + 0.07 * exp(-hx / 0.9) + 0.03 * exp(-hx / 3.0)) * mix(1.0, 1.25, uSun) * (1.0 - 0.7 * calm.y));
      float disc = smoothstep(uPx * soft, -uPx * soft, dist - uR);
      if (disc > 0.0) {
        vec3 bodyC = cBody;
        if (uSun > 0.5) bodyC = mix(cBody, mix(cBody, cHor, 0.22), smoothstep(-uR, uR, d.y));
        else bodyC = mix(bodyC, mix(cBody, cBg, 0.3), smoothstep(0.02, 0.3, fbm2(d / uR * 1.25 + uSeed, 4)) * 0.75);    // maria
        sc = mix(sc, bodyC, disc);
      }
      col += T * sc; light += T * sl;
    }
    void main(){
      vec2 p = vec2(vUv.x, 1.0 - vUv.y);
      vec3 calm = calmAt(p);
      vec3 col, light;
      if (p.y > uWater) {                                                  // the harbour: a mirror broken into streaks that lengthen towards the viewer
        float wd = (p.y - uWater) * uAsp.y, ry = log(wd + 0.012) * 9.0;
        float rip = noise2(vec2(p.x * uAsp.x * 3.4 + ry * 0.35, ry * 2.6) + uSeed) + 0.5 * noise2(vec2(p.x * uAsp.x * 9.0, ry * 7.0) - uSeed);
        vec2 pw = vec2(p.x + rip * 0.002 / uAsp.x, uWater - (p.y - uWater) * 1.15 - rip * (0.012 + 0.22 * wd) * smoothstep(0.0, 0.02, wd) / uAsp.y);
        world(pw, calmAt(pw), 1.0 + 60.0 * wd, col, light);
        vec3 water = mix(cBg, cNear, mix(0.35, 0.1, uDark));
        col = mix(col, water, 0.22 + 0.55 * smoothstep(0.0, 0.45, wd));
        col.x += 0.012 * rip * smoothstep(0.0, 0.05, wd);
        light *= 0.75 * exp(-wd * 2.2);
        col = mix(col, mix(cHor, cBg, 0.45), 0.5 * exp(-wd / 0.005));     // a line of mist along the quay
      } else world(p, calm, 1.0, col, light);
      // mist rolls in wherever the copy sits
      col = mix(col, mix(cBg, cHor, 0.03), calm.x * 0.97); light *= 1.0 - calm.x;
      gl_FragColor = vec4(max(oklabToLinear(col), 0.0) + light * 2.3, 1.0);
      #include <colorspace_fragment>
    }`, {
    uProf: { value: prof }, uTW: { value: TW }, uBcnN: { value: nBcn }, uBcn: { value: bcn },
    uRes: { value: new THREE.Vector2(W, H) }, uHero: { value: new THREE.Vector2(hx, hy) }, uAsp: { value: new THREE.Vector2(sx, sy) },
    uR: { value: rS }, uWater: { value: yW }, uBase: { value: Math.min(yBase, 1) }, uNotch: { value: yNotch }, uPx: { value: 1 / short },
    uSeed: { value: (seed % 113) * 0.713 }, uSun: { value: sun ? 1 : 0 }, uStars: { value: showStars ? 1 : 0 }, uHaze: { value: P.haze }, uLights: { value: P.lights },
    uDark: { value: dark ? 1 : 0 }, uCityTop: { value: cityTop },
    uCW: { value: [0.0056, 0.0076, 0.0102, 0.013] },
    cBg: { value: bg }, cNear: { value: near }, cMid: { value: mid }, cHor: { value: hor }, cBody: { value: body }, cHaze: { value: mixL(hor, mixL(hor, oklabVec('#' + lWarm.getHexString()), 0.45), 0.65) }, lWarm: { value: lWarm }, lCool: { value: lCool },
    ...quietUniforms(ctx),
  }));

  ctx.frame({ radius: 1, fov: 30, dir: [0, 0, 1] });
  return makeComposer(ctx, {
    samples: 0,
    bloom: P.bloom > 0 ? { strength: 0.42 * P.bloom, radius: 0.5, threshold: 1.0 } : false,
    linear: [hdrClipPassShader()],
    display: [finishPassShader(ctx, { vignette: dark ? 0.16 : 0.05, center: [hx, Math.min(hy + 0.1, 0.7)] })],
  });
}
