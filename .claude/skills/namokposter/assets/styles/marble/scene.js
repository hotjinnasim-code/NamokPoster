// Fluid marbling — a full-picture scene: a flow painting like paper marbling or a paint pour. Pigment
// is dropped at the layout focus and spreads in rings; a few later, smaller drops land in those
// rings and push them aside exactly as a drop does on a marbling bath (every point moves out along
// its radius so that area is kept), so the older rings bend round the new stones. A slow domain-warp
// then drags the whole sheet into veins and pools. Rings are thin and saturated at the heart and
// widen outwards into large calm pools that are only tints of the paper colour; where the copy
// sits the flow opens up completely. Gilded hairlines follow the pool edges, with a foil shimmer
// that depends on the direction the line runs.
//
// The field has one centre per base drop and no added noise, so its level lines are closed rings:
// nothing pinches to a point and nothing radiates from one. The bands are not sampled from a
// texture: the shader walks a short list of band edges and anti-aliases each against the
// screen-space gradient, so edges and hairlines stay sharp at any size.
//
// Palette: bg = paper / the calm pools behind the copy · colors[0..3] = pigments · accent = the metal of the hairlines
import { backgroundQuad } from '/skill/assets/web/scene-lib.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export default function build(ctx) {
  const { THREE, scene, palette, params, aspect, seed, rng, width: W, height: H } = ctx;
  const sx = Math.max(aspect, 1), sy = Math.max(1 / aspect, 1);          // frame fraction → short-side units
  const P = { flow: params.flow ?? 1, veins: params.veins ?? 1, gilt: params.gilt ?? 1, drops: params.drops ?? 2, strokes: params.strokes ?? 1, scale: params.scale ?? 1 };

  // ---- colours in OKLab
  const lab = (hex) => {
    const c = new THREE.Color(hex);
    const l = Math.cbrt(0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b), m = Math.cbrt(0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b), s = Math.cbrt(0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b);
    return new THREE.Vector3(0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s);
  };
  const bg = lab(palette.bg), ink = lab(palette.ink), acc = lab(palette.accentOriginal ?? palette.accent), dark = bg.x < 0.55;
  const pig = palette.colors.map(lab); while (pig.length < 3) pig.push(pig[pig.length - 1].clone().lerp(bg, 0.5));
  const paper = bg.clone().lerp(new THREE.Vector3(dark ? 0.3 : 0.99, 0, 0), dark ? 0.12 : 0.55);   // a lighter relative of the paper colour

  // ---- where the copy sits
  const quiet = (ctx.quiet || []).map(([x0, y0, x1, y1]) => ({ x0, y0, x1, y1 }));
  const strip = (r) => r.x0 <= 0.02 && r.x1 >= 0.98;
  const footer = quiet.find((r) => strip(r) && r.y1 >= 0.98 && r.y0 > 0.5), header = quiet.find((r) => strip(r) && r.y0 <= 0.02 && r.y1 < 0.5);
  const blocks = quiet.filter((r) => r !== footer && r !== header);
  const footTop = footer ? footer.y0 : 1, headBot = header ? header.y1 : 0;
  const blockDist = (x, y) => { let d = 9; for (const b of blocks) { const ex = Math.max(b.x0 - x, x - b.x1) * sx, ey = Math.max(b.y0 - y, y - b.y1) * sy; d = Math.min(d, Math.hypot(Math.max(ex, 0), Math.max(ey, 0)) + Math.min(Math.max(ex, ey), 0)); } return d; };

  // ---- base drops (ring systems): the main one on the focus — or, if the copy lies on the focus,
  // one entering from each free corner. z = radius of the saturated heart.
  let hx = ctx.focus.x, hy = ctx.focus.y, R0 = 0.34 * clamp(ctx.artSize ?? 0.7, 0.35, 1.1) * P.scale;
  const bases = [];
  if (blockDist(hx, hy) < 0.08) {
    const corners = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => ({ x, y, d: blockDist(x, y) - (y > 0.9 && footer ? 0.07 : 0) + rng.range(0, 0.04) })).sort((a, b) => b.d - a.d);
    corners.forEach((c, i) => { if (i === 0 || c.d > 0.14) bases.push(new THREE.Vector4(c.x + (0.5 - c.x) * (i ? 0.1 : 0.16), c.y + (0.5 - c.y) * (i ? 0.1 : 0.16), clamp(c.d * (i ? 0.48 : 0.6), 0.1, i ? 0.3 : 0.42) * P.scale, i ? rng.range(0.1, 0.4) : 0)); });
    hx = bases[0].x; hy = bases[0].y; R0 = bases[0].z;
  } else {
    R0 = Math.min(R0, Math.max(0.12, (blockDist(hx, hy) - 0.03) / 1.05));
    bases.push(new THREE.Vector4(hx, hy, R0, 0));
  }
  // ---- stones: later drops that land in the outer rings of the main one and push them aside — a
  // short trail of them to one side, each smaller than the last. w = where in the band list their own rings start
  const cb = blocks[0], sa = cb ? Math.atan2((hy - (cb.y0 + cb.y1) / 2) * sy, (hx - (cb.x0 + cb.x1) / 2) * sx) + Math.PI / 2 + rng.range(-0.5, 0.5) : rng.range(0, Math.PI);
  const stones = [], trail = sa + (rng() < 0.5 ? 0 : Math.PI) + rng.range(-0.5, 0.5);
  for (let tries = 0; tries < 160 && stones.length < clamp(Math.round(P.drops), 0, 5); tries++) {
    const k = stones.length, a = trail + rng.range(-0.75, 0.75), dist = R0 * (rng.range(0.95, 1.45) + 0.42 * k), r = R0 * rng.range(0.22, 0.32) * Math.pow(0.62, k);
    const x = hx + (Math.cos(a) * dist) / sx, y = hy + (Math.sin(a) * dist) / sy;
    if (x < -0.05 || x > 1.05 || y < -0.05 || y > 1.05 || blockDist(x, y) < r * 1.3 + 0.07) continue;
    if (footer && y > footTop - 0.05 - r / sy) continue;
    if (stones.some((o) => Math.hypot((o.x - x) * sx, (o.y - y) * sy) < (o.z + r) * 1.5)) continue;
    stones.push(new THREE.Vector4(x, y, r, rng.range(0, 0.32)));
  }
  // ---- stylus strokes: a point drawn through the sheet drags the rings into a feather along its
  // line (the pull falls off with distance from the line). Strokes run parallel, never crossing.
  const tines = [], nT = clamp(Math.round(P.strokes), 0, 2), side = rng.sign(), pull = R0 * rng.range(0.5, 0.75) * rng.sign();
  for (let i = 0; i < nT; i++) {
    const ang = sa + rng.range(-0.12, 0.12), off = (i === 0 ? rng.range(0.12, 0.4) : -rng.range(0.7, 1.05)) * R0 * side;
    tines.push(new THREE.Vector4(hx * sx - Math.sin(ang) * off, hy * sy + Math.cos(ang) * off, ang, i === 0 ? pull : -0.8 * pull));
  }
  while (tines.length < 2) tines.push(new THREE.Vector4(0, 0, 0, 0));
  const nBases = bases.length, nStones = stones.length;
  while (bases.length < 4) bases.push(new THREE.Vector4(9, 9, 1, 9));
  while (stones.length < 5) stones.push(new THREE.Vector4(9, 9, 0.001, 0));

  // ---- the band list: thin saturated rings at the heart, wider and paler outwards, tints of the paper far out
  const E = [], C = [], G = [];                                            // edge position, colour after the edge, gilding of the edge
  const tint = (c, k) => c.clone().lerp(bg, k);
  let t = 0, last = -1, lastThin = false;
  const main = Math.min(3, pig.length - (pig.length > 3 ? 1 : 0));      // colors[0..2] fill the pools; a fourth colour is the spice, used for thin veins only
  const pick = (thin = false) => { let i; do i = thin && pig.length > 3 && rng() < 0.6 ? pig.length - 1 : rng() < 0.42 ? 0 : rng.int(0, main - 1); while (i === last); last = i; return i; };
  C.push(pig[1].clone()); last = 1;                                      // the heart of every drop is the quiet second pigment
  t = rng.range(0.07, 0.12);
  while (E.length < 46 && t < 5.8) {
    const zone = t < 1.4 ? 0 : t < 2.8 ? 1 : 2;
    let col, w, gild = 0;
    if (zone === 0) {
      const u = rng(), thin = !lastThin && u < 0.42, metal = thin && rng() < 0.42 * P.gilt, pale = !metal && rng() < 0.22;
      w = (thin ? rng.range(0.012, 0.03) : u < 0.8 ? rng.range(0.05, 0.1) : rng.range(0.11, 0.17)) / clamp(P.veins, 0.4, 2.5);
      col = metal ? null : pale ? (last = -1, paper.clone()) : tint(pig[pick(thin)], rng.range(0, 0.12));
      gild = metal ? 2 : rng() < 0.72 * P.gilt ? 1 : 0; lastThin = thin;
    } else if (zone === 1) {
      const k = (t - 1.4) / 1.4;
      w = rng.range(0.13, 0.26) * (1 + 0.9 * k); col = rng() < 0.25 ? tint(paper, 0.3 + 0.5 * k) : tint(pig[pick()], 0.22 + 0.48 * k + rng.range(-0.06, 0.06));
      gild = rng() < 0.62 * P.gilt ? 1 : 0;
      if (rng() < 0.3 && E.length < 44) { E.push(t); C.push(tint(pig[pick(true)], 0.1 + 0.3 * k)); G.push(1); t += rng.range(0.014, 0.03); }   // a stray saturated vein
    } else {
      const k = clamp((t - 2.8) / 3.2, 0, 1);
      w = rng.range(0.4, 0.85); col = tint(pig[pick()], clamp(0.78 + 0.3 * k + rng.range(-0.03, 0.03), 0, 1));
      gild = rng() < 0.7 * P.gilt ? 1 : 0;
    }
    E.push(t); C.push(col ?? acc.clone()); G.push(gild); t += w;
  }
  const nE = E.length; while (E.length < 48) { E.push(99); G.push(0); } while (C.length < 49) C.push(bg.clone());

  scene.add(backgroundQuad(/* glsl */`
    varying vec2 vUv;
    uniform vec2 uAsp, uDir;
    uniform float uPx, uSeed, uDark, uFlow, uGilt, uFoot, uHead, uE[48], uG[48];
    uniform vec3 uC[49], cBg, cInk, cAcc;
    uniform vec4 uBase[4], uStone[5], uTine[2], uBlock[3]; uniform int uNE, uNB, uNS, uNT; uniform float uLam;
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
    void main(){
      vec2 p = vec2(vUv.x, 1.0 - vUv.y), q = p * uAsp;
      // ---- the flow: two rounds of domain warping, large slow bends first (gentle enough not to fold the sheet)
      vec2 s0 = q * 0.85 + uSeed;
      vec2 w1 = vec2(fbm(s0 + vec2(3.1, 0.0), 11u, 3), fbm(s0 + vec2(0.0, 7.7), 15u, 3));
      vec2 qa = q + 0.6 * uFlow * w1;
      vec2 w2 = vec2(fbm(qa * 1.8 + vec2(5.2, 1.3) + uSeed, 21u, 3), fbm(qa * 1.8 + vec2(1.7, 9.2) - uSeed, 25u, 3));
      vec2 qb = qa + 0.22 * uFlow * w2;
      float ups = max(length(dFdx(qb)), length(dFdy(qb)));                             // sheet units per pixel
      // ---- stones, last drop first: inside a stone we see its own rings; outside it, the sheet as
      // it lay before that drop pushed it out along its radius (area-preserving, as on a real bath)
      vec2 pp = qb; float t = -1.0, rimPx = 1e4;
      for (int i = uNT - 1; i >= 0; i--) {                                             // undo the stylus strokes, last one first
        vec4 tn = uTine[i]; vec2 m = vec2(cos(tn.z), sin(tn.z)); pp -= m * tn.w * uLam / (abs(dot(pp - tn.xy, vec2(-m.y, m.x))) + uLam);
      }
      for (int i = uNS - 1; i >= 0; i--) {
        vec4 d = uStone[i]; vec2 v = pp - d.xy * uAsp; float l = length(v);
        rimPx = min(rimPx, abs(l - d.z) / ups);
        if (l < d.z) { t = d.w + 0.9 * l / d.z; break; }
        pp = d.xy * uAsp + v * sqrt(1.0 - d.z * d.z / (l * l));
      }
      // ---- the rings of the base drop (the nearest one, where several enter from the corners)
      if (t < 0.0) {
        t = 99.0;
        for (int i = 0; i < uNB; i++) { vec4 d = uBase[i]; vec2 v = pp - d.xy * uAsp; t = min(t, length(vec2(dot(v, uDir) / 1.42, dot(v, vec2(-uDir.y, uDir.x)) * 1.1)) / d.z + d.w); }
      }
      float far = smoothstep(1.2, 3.6, t);
      // ---- the copy: the flow opens up towards it and leaves plain paper behind it
      vec2 wq = q * 1.4 - uSeed;
      float qd = quietDist(p) + 0.1 * gn(wq * 0.8, 3u) + 0.05 * w2.x;
      float edge = max(smoothstep(uFoot - 0.06, uFoot + 0.01, p.y), smoothstep(uHead + 0.06, uHead - 0.01, p.y));
      float calm = max(1.0 - smoothstep(-0.03, 0.1, qd), 0.8 * edge);
      float push = 6.5 * pow(1.0 - smoothstep(-0.04, 0.34, qd), 1.7) + 1.4 * smoothstep(uFoot - 0.16, uFoot + 0.02, p.y + 0.05 * w1.y) + 1.4 * smoothstep(uHead + 0.16, uHead - 0.02, p.y);
      float thin = smoothstep(0.04, 1.0, push);                                         // pushed-out veins lose their colour and their gilding before they can bunch up
      t += push;
      t = max(t, 0.0);
      // ---- walk the bands
      vec2 g = vec2(dFdx(t), dFdy(t)); float fw = max(length(g), 1e-5);
      vec3 col = uC[0]; float gold = 0.0, fill = 0.0; int band = 0;
      float lw = 0.00115 / uPx;                                                           // hairline half-width in pixels
      for (int i = 0; i < uNE; i++) {
        float dpx = (t - uE[i]) / fw, k = clamp(dpx + 0.5, 0.0, 1.0);
        col = mix(col, uC[i + 1], k); fill = mix(fill, uG[i] > 1.5 ? 1.0 : 0.0, k);
        if (k > 0.5) band = i + 1;
        if (uG[i] > 0.5) gold = max(gold, smoothstep(lw + 0.6, lw - 0.4, abs(dpx)));
      }
      gold = max(gold, smoothstep(lw * 1.25 + 0.6, lw * 1.25 - 0.4, rimPx));             // every stone is rimmed with metal
      // pigment is never perfectly flat: a slow drift of tone in every pool, a little granulation at the heart
      float hb = h21(ivec2(band, 7), 41u);
      col.x += (0.022 * fbm(qb * 2.2 + float(band) * 3.7, 51u, 3) + 0.012 * (hb - 0.5)) * (1.0 - 0.7 * far);
      // ---- the metal: brightness follows the direction the line runs, as foil does under one light
      float ang = atan(g.y, g.x), sh = 0.5 + 0.5 * cos(2.0 * ang - 0.9 + 2.6 * fbm(q * 1.3 + 2.0, 61u, 3));
      vec3 metalLo = mix(cAcc, mix(cInk, vec3(0.25, 0.02, 0.04), 0.5 * (1.0 - uDark)), mix(0.4, 0.3, uDark)) * vec3(mix(1.0, 0.72, uDark), 1.0, 1.0);
      vec3 metal = mix(metalLo, mix(cAcc, vec3(1.0, 0.0, 0.02), 0.62), smoothstep(0.25, 0.95, sh));
      float lineFade = (1.0 - smoothstep(4.0, 5.4, t)) * mix(1.0, 0.6, far);
      col = mix(col, metal, max(gold * lineFade, fill) * uGilt * (1.0 - smoothstep(0.0, 0.7, thin)));
      col = mix(col, cBg, max(calm * 0.985, 0.85 * thin));
      gl_FragColor = vec4(clamp(lab2lin(col), 0.0, 1.0), 1.0);
      #include <colorspace_fragment>
      float d1 = h21(ivec2(gl_FragCoord.xy), 5u), d2 = h21(ivec2(gl_FragCoord.xy), 6u);
      gl_FragColor.rgb += (d1 + d2 - 1.0) / 255.0;
    }`, {
    uAsp: { value: new THREE.Vector2(sx, sy) }, uPx: { value: 1 / Math.min(W, H) },
    uDir: { value: new THREE.Vector2(Math.cos(sa), Math.sin(sa)) }, uSeed: { value: (seed % 113) * 0.713 }, uDark: { value: dark ? 1 : 0 }, uFlow: { value: P.flow }, uGilt: { value: clamp(P.gilt, 0, 1) },
    uE: { value: E }, uG: { value: G }, uC: { value: C }, uNE: { value: nE }, uBase: { value: bases }, uNB: { value: nBases }, uStone: { value: stones }, uNS: { value: nStones }, uTine: { value: tines }, uNT: { value: nT }, uLam: { value: R0 * 0.17 },
    cBg: { value: bg }, cInk: { value: ink }, cAcc: { value: acc },
    uBlock: { value: [0, 1, 2].map((i) => { const b = blocks[i]; return !b ? new THREE.Vector4(3, 3, 3, 3) : new THREE.Vector4(b.x0, b.y0, b.x1, b.y1); }) },
    uFoot: { value: footer ? footTop : 2 }, uHead: { value: header ? headBot : -1 },
  }));

  ctx.frame({ radius: 1, fov: 30, dir: [0, 0, 1] });
}
