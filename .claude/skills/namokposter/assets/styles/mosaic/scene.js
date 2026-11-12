// Tesserae mosaic — the whole sheet is set with small hand-cut tiles in grout, and the rows of tiles
// follow the forms of the design (andamento): rings round a disc, courses riding each wave crest,
// three rings of tile following every arch, straight courses in the open field. Nothing is a
// picture cut into squares: every pixel first finds which form it belongs to, then its place in
// that form's own course of tiles, so each tessera is a single flat colour with its own tilt,
// glint and slightly irregular cut. All of it is analytic, so it is sharp at any size.
//
// Where the copy sits the same courses carry on in plain field-coloured tiles: the design gives
// way tile by tile, never with a soft fade.
//
// Palette: bg = the field tiles (behind the copy) · colors = the tesserae, used by role (deepest /
// lightest / warmest and two more) · ink, accent = type.
import { backgroundQuad, srgbVec, GLSL_NOISE_KIT, GLSL_DITHER } from '/skill/assets/web/scene-lib.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lum = (c) => 0.2126 * c.x + 0.7152 * c.y + 0.0722 * c.z;

export default function build(ctx) {
  const { THREE, scene, palette, params, aspect, seed, rng, width: W, height: H } = ctx;
  const sx = Math.max(aspect, 1), sy = Math.max(1 / aspect, 1), short = Math.min(W, H);
  const MOTIFS = ['waves', 'arches', 'bands'], motif = MOTIFS.includes(params.motif) ? params.motif : 'waves';
  const P = { tile: clamp(params.tile ?? 1, 0.6, 2), gloss: clamp(params.gloss ?? 1, 0, 2), grout: clamp(params.grout ?? 1, 0.5, 2), rough: clamp(params.rough ?? 1, 0, 2) };
  const fx = ctx.focus.x * sx, fy = ctx.focus.y * sy, A = clamp(ctx.artSize ?? 0.7, 0.3, 1.1);
  const [ax0, ay0, ax1, ay1] = ctx.artRect || [0, 0, 1, 1];
  const w = 0.0128 * P.tile * clamp(0.75 + 0.35 * A, 0.8, 1.1), snap = (v) => Math.max(1, Math.round(v / w)) * w;

  // ---- colours by role
  const bg = srgbVec(palette.bg), dark = lum(bg) < 0.3;
  let cs = palette.colors.map((h) => srgbVec(h)); while (cs.length < 5) cs.push(srgbVec(cs.length % 2 ? palette.accent : palette.ink).lerp(bg, 0.25 * (cs.length - 1)));
  const warmth = (c) => c.x - c.z + 0.4 * (c.x - c.y);
  const warm = [...cs].sort((a, b) => warmth(b) - warmth(a))[0], rest = cs.filter((c) => c !== warm).sort((a, b) => lum(a) - lum(b));
  const deep = rest[0], light = rest[rest.length - 1], between = rest.slice(1, -1).sort((a, b) => Math.abs(warmth(a) - warmth(deep)) - Math.abs(warmth(b) - warmth(deep)));
  const mid = between[0] ?? deep.clone().lerp(light, 0.45), extra = between[1] ?? warm.clone().lerp(deep, 0.45);      // mid = nearest in hue to the deep colour; extra = the odd one out
  const grout = dark ? bg.clone().multiplyScalar(0.5) : bg.clone().lerp(new THREE.Vector3(0.36, 0.33, 0.3), 0.36);

  // ---- where the copy sits: narrow gaps towards the edge of the sheet and the footer are closed
  const quiet = (ctx.quiet || []).slice(0, 4).map(([x0, y0, x1, y1]) => ({ x0, y0, x1, y1 }));
  const strip = (r) => r.x0 <= 0.02 && r.x1 >= 0.98;
  for (const r of quiet) if (!strip(r)) {
    if (r.x0 < 0.1) r.x0 = -1; if (r.x1 > 0.9) r.x1 = 2; if (r.y0 < 0.1) r.y0 = -1; if (r.y1 > 0.9) r.y1 = 2;
    for (const s of quiet) if (strip(s)) { if (s.y0 > r.y1 && s.y0 - r.y1 < 0.12) r.y1 = 2; if (s.y1 < r.y0 && r.y0 - s.y1 < 0.12) r.y0 = -1; }
  }
  for (const r of quiet) if (strip(r)) { if (r.y1 > 0.9) r.y1 = 2; if (r.y0 < 0.1) r.y0 = -1; r.x0 = -1; r.x1 = 2; }
  const uQ = [0, 1, 2, 3].map((i) => (quiet[i] ? new THREE.Vector4(quiet[i].x0, quiet[i].y0, quiet[i].x1, quiet[i].y1) : new THREE.Vector4(5, 5, 5, 5)));

  // ---- the design, as a handful of numbers for the shader
  const V4 = (a = 0, b = 0, c = 0, d = 0) => new THREE.Vector4(a, b, c, d);
  const uA = [0, 1, 2, 3, 4, 5, 6, 7].map(() => V4()); let uB = V4(), uC = V4();
  if (motif === 'waves') {
    // a low disc, and swells whose courses ride the crests: far ones short and shallow, near ones long and deep
    const hz = fy + 0.1 * A, N = 6, Rd = snap(0.15 * A);
    let y = hz;
    for (let k = 0; k < N; k++) {
      const t = k / (N - 1), lam = (0.26 + 0.3 * t) * (0.6 + 0.6 * A) * rng.range(0.85, 1.15);
      uA[k] = V4(y, w * (1.1 + 2.1 * t), (2 * Math.PI) / lam, rng.range(0, 6.283));
      y += w * Math.round(6 + 9 * t + rng.range(-1, 1));
    }
    uB = V4(fx + rng.range(-0.06, 0.06) * A, hz - Rd * 0.72, Rd, N); uC = V4(hz, 0, 0, 0);
  } else if (motif === 'arches') {
    // an arcade: each opening ringed by three courses, a disc in the middle arch, roundels in the spandrels
    const aw = (ax1 - ax0) * sx, ah = (ay1 - ay0) * sy, n = aw / ah > 2.2 ? 5 : aw / ah < 0.62 ? 1 : 3, band = 3 * w, pier = snap(0.03 * A + w);
    const fit = Math.floor(((aw * 0.97) / n - pier - 2 * band) / 2 / w) * w, Ro = Math.max(4 * w, Math.min(fit, snap(0.2 * ah)));
    const pitch = 2 * (Ro + band) + pier, tall = Math.min(snap(0.36 * A), snap(ah * 0.4)), ys = fy - 0.5 * (tall - Ro - band - 3 * w) , yg = ys + tall;
    uA[0] = V4(Ro, ys, yg, pitch); uB = V4(fx, (n - 1) / 2, snap(Ro * 0.46), ys - Ro * 0.02); uC = V4(rng.range(0, 50), 0, 0, 0);
  } else {
    // overlapping discs of ringed bands, and one straight band of courses passing behind them
    const sg = rng() < 0.5 ? -1 : 1, j = () => rng.range(-0.03, 0.03) * A;
    uA[0] = V4(fx - sg * 0.15 * A + j(), fy + 0.1 * A + j(), snap(0.37 * A), rng.int(0, 5));
    uA[1] = V4(fx + sg * 0.2 * A + j(), fy - 0.17 * A + j(), snap(0.25 * A), rng.int(0, 5));
    uA[2] = V4(fx + sg * 0.17 * A + j(), fy + 0.3 * A + j(), snap(0.14 * A), rng.int(0, 5));
    const ang = sg * rng.range(0.3, 0.5);
    uB = V4(Math.cos(ang), Math.sin(ang), fx + sg * 0.02 * A, fy - 0.02 * A); uC = V4(w * 4, rng.int(0, 5), 0, 0);
  }

  scene.add(backgroundQuad(/* glsl */`
    varying vec2 vUv;
    uniform vec2 uAsp; uniform float uShort, uW, uSeed, uDark, uGloss, uGrout, uRough, uAS; uniform int uMotif;
    uniform vec3 cBg, cGroutC, cDeep, cMid, cLight, cWarm, cExtra; uniform vec4 uQ[4], uA[8], uB, uC;
    ${GLSL_NOISE_KIT}
    ${GLSL_DITHER}
    struct Tile { vec2 id; vec2 loc; vec2 hlf; vec2 ctr; };
    float jit(float i, float j, float salt){ return (hash21(vec2(i, j + salt * 131.0)) - 0.5) * 0.34; }
    // straight course: uv.x along the row, uv.y across it (world units); joints are staggered and unevenly spaced
    Tile rowTile(vec2 uv, float w, float salt){
      float j = floor(uv.y / w), off = hash21(vec2(j, salt + 57.0)), x = uv.x / w + off, i = floor(x);
      float dl = jit(i, j, salt), dr = jit(i + 1.0, j, salt);
      if (x < i + dl) { i -= 1.0; dr = dl; dl = jit(i, j, salt); } else if (x > i + 1.0 + dr) { i += 1.0; dl = dr; dr = jit(i + 1.0, j, salt); }
      float x0 = i + dl, x1 = i + 1.0 + dr;
      Tile t; t.id = vec2(i, j); t.hlf = vec2((x1 - x0) * 0.5 * w, 0.5 * w); t.ctr = vec2(((x0 + x1) * 0.5 - off) * w, (j + 0.5) * w); t.loc = uv - t.ctr; return t;
    }
    // ring course round a centre: rel = position relative to the centre
    Tile ringTile(vec2 rel, float w, float salt){
      float r = length(rel), j = floor(r / w), rc = (j + 0.5) * w, n = max(3.0, floor(6.2832 * rc / w + 0.5));
      float off = hash21(vec2(j, salt + 91.0)), x = fract(atan(rel.y, rel.x) / 6.2832 + 0.5 + off) * n, i = floor(x);
      float dl = jit(mod(i, n), j, salt), dr = jit(mod(i + 1.0, n), j, salt);
      if (x < i + dl) { i -= 1.0; dr = dl; dl = jit(mod(i + n, n), j, salt); } else if (x > i + 1.0 + dr) { i += 1.0; dl = dr; dr = jit(mod(i + 1.0, n), j, salt); }
      float x0 = i + dl, x1 = i + 1.0 + dr, arc = 6.2832 * rc / n, a = ((x0 + x1) * 0.5 / n - off - 0.5) * 6.2832;
      Tile t; t.id = vec2(mod(i + n, n), j); t.hlf = vec2((x1 - x0) * 0.5 * arc, 0.5 * w); t.ctr = rc * vec2(cos(a), sin(a)); t.loc = vec2((x - (x0 + x1) * 0.5) * arc, r - rc); return t;
    }
    vec3 pick(float i){ i = mod(i, 6.0); return i < 0.5 ? cDeep : i < 1.5 ? cWarm : i < 2.5 ? cLight : i < 3.5 ? cMid : i < 4.5 ? cExtra : mix(cBg, cLight, 0.5); }
    float crest(int k, float x){ vec4 s = uA[k]; return s.x + s.y * (0.62 * sin(x * s.z + s.w) + 0.38 * sin(x * s.z * 2.17 + s.w * 1.7)); }
    float quiet(vec2 pp, float edge){
      float m = 0.0;
      for (int i = 0; i < 4; i++) { vec4 r = uQ[i]; m = max(m, smoothstep(r.x - edge, r.x + edge, pp.x) * smoothstep(r.z + edge, r.z - edge, pp.x) * smoothstep(r.y - edge, r.y + edge, pp.y) * smoothstep(r.w + edge, r.w - edge, pp.y)); }
      return m;
    }
    void main(){
      vec2 p = vec2(vUv.x, 1.0 - vUv.y), q = p * uAsp;
      float w = uW, cut = 9.0, salt = 1.0; vec3 dcol = cBg; Tile t; vec2 wc; float plain = 0.0;      // plain = 1: a field tile (takes the calm field treatment)
      vec3 white = mix(vec3(0.96, 0.95, 0.9), cLight, 0.25);

      if (uMotif == 0) {
        // ================= waves
        int N = int(uB.w), reg = -1; float hz = uC.x;
        for (int k = N - 1; k >= 0; k--) if (q.y > crest(k, q.x)) { reg = k; break; }
        vec2 dc = uB.xy; float Rd = uB.z, rd = length(q - dc), halo = Rd + 2.0 * w;
        if (reg < 0) {
          cut = crest(0, q.x) - q.y;
          if (rd < halo) {
            t = ringTile(q - dc, w, 5.0); wc = dc + t.ctr; salt = 5.0; cut = min(cut, halo - rd);
            float j = t.id.y, nD = Rd / w;
            dcol = j < nD - 0.5 ? mix(mix(cWarm, white, 0.55), cWarm, pow(j / max(nD - 1.0, 1.0), 1.5)) : mix(cBg, cWarm, j < nD + 0.5 ? 0.5 : 0.24);
            if (j > nD - 1.5 && j < nD - 0.5) dcol = mix(cWarm, cExtra, 0.45);
          } else {
            t = rowTile(q, w, 1.0); wc = t.ctr; cut = min(cut, rd - halo); plain = 1.0;
            float g = exp(-max(hz - wc.y, 0.0) / (0.2 * uAS)) * smoothstep(1.2, 0.2, abs(wc.x - dc.x) / uAS);
            dcol = mix(cBg, mix(cBg, cWarm, 0.5), 0.55 * g);
          }
        } else {
          float yc = crest(reg, q.x); salt = 10.0 + float(reg);
          t = rowTile(vec2(q.x, q.y - yc), w, salt); wc = vec2(t.ctr.x, t.ctr.y + crest(reg, t.ctr.x));
          if (reg < N - 1) cut = crest(reg + 1, q.x) - q.y;
          float j = t.id.y, far = float(reg) / float(N - 1);
          vec3 body = mix(cMid, cDeep, 0.15 + 0.85 * far), lit = mix(cLight, cMid, 0.15 + 0.45 * far);
          dcol = j < 0.5 ? white : j < 1.5 ? mix(white, lit, 0.75) : j < 2.5 ? lit : mix(mix(lit, body, 0.55), body, smoothstep(2.5, 6.5, j));
          float streak = hash21(vec2(floor(j / 1.0), salt * 3.0));                 // now and then a whole course of a lighter blue
          if (j > 3.5 && streak > 0.72) dcol = mix(dcol, lit, 0.55);
          if (j > 3.5 && streak < 0.1) dcol = mix(dcol, cExtra, 0.35);
        }
      } else if (uMotif == 1) {
        // ================= arches
        float Ro = uA[0].x, ys = uA[0].y, yg = uA[0].z, pitch = uA[0].w, m = uB.y, band = 3.0 * w, Rout = Ro + band;
        float x = q.x - uB.x, k = clamp(floor(x / pitch + 0.5), -m, m), lx = x - k * pitch, cxk = uB.x + k * pitch, spanW = (m + 0.5) * pitch;
        float y = q.y, r = length(vec2(lx, y - ys)), top = ys - Rout;
        bool inSpan = abs(x) < spanW;
        vec3 inner = mix(mix(cDeep, cMid, smoothstep(ys - Ro, yg, y) * 0.8), cWarm, 0.5 * smoothstep(yg - 0.5 * (yg - ys), yg + 0.02, y));
        if (y > yg) {
          // pavement: a few courses of colour, then the field again
          t = rowTile(vec2(q.x, y - yg), w, 2.0); wc = vec2(t.ctr.x, t.ctr.y + yg); salt = 2.0; cut = y - yg; plain = 1.0;
          float j = t.id.y;
          if (abs(wc.x - uB.x) < spanW + w) { plain = j < 5.5 ? 0.0 : 1.0; dcol = j < 0.5 ? cExtra : j < 2.5 ? mix(cBg, cLight, 0.6) : j < 3.5 ? cDeep : j < 5.5 ? mix(cBg, cMid, 0.45) : cBg; }
        } else if (inSpan && ((y >= ys && abs(lx) < Ro) || (y < ys && r < Ro))) {
          // an opening: night inside; the middle one holds the disc
          float ym = uB.w, Rm = uB.z, md = length(vec2(lx, y - ym));
          cut = min(yg - y, y >= ys ? Ro - abs(lx) : Ro - r);
          if (k == 0.0 && md < Rm + w) {
            t = ringTile(vec2(lx, y - ym), w, 6.0); wc = vec2(cxk, ym) + t.ctr; salt = 6.0; cut = min(cut, Rm + w - md);
            float j = t.id.y, nD = Rm / w; dcol = j < nD - 0.5 ? mix(mix(cWarm, white, 0.6), mix(cWarm, white, 0.15), j / max(nD - 1.0, 1.0)) : mix(inner, cWarm, 0.3);
          } else if (y < ys) {
            t = ringTile(vec2(lx, y - ys), w, 8.0 + k); wc = vec2(cxk, ys) + t.ctr; salt = 8.0 + k; dcol = inner;
            if (k == 0.0) cut = min(cut, md - Rm - w);
          } else {
            t = rowTile(vec2(lx, y - ys), w, 20.0 + k); wc = vec2(cxk + t.ctr.x, ys + t.ctr.y); salt = 20.0 + k; dcol = inner;
            if (k == 0.0) cut = min(cut, md - Rm - w);
          }
          // stars: single pale tesserae in the night
          if (hash21(t.id + salt * 3.1) > 0.95 && wc.y < ys + 0.3 * (yg - ys) && (y >= ys || t.id.y > 2.5) && md > Rm + 2.5 * w) dcol = mix(dcol, white, 0.75);
        } else if (inSpan && y < ys && r < Rout) {
          // the arch: three courses following the curve, each its own colour
          t = ringTile(vec2(lx, y - ys), w, 30.0 + k); wc = vec2(cxk, ys) + t.ctr; salt = 30.0 + k; cut = min(Rout - r, min(r - Ro, ys - y));
          float j = floor((length(t.ctr) - Ro) / w + 0.01); dcol = j < 0.5 ? cWarm : j < 1.5 ? white : cExtra;
        } else if (inSpan && y >= ys && abs(lx) < Rout) {
          // the jamb: the same three courses running straight down
          float sgn = lx < 0.0 ? -1.0 : 1.0; salt = 40.0 + k * 2.0 + sgn;
          t = rowTile(vec2(y - ys, abs(lx)), w, salt); wc = vec2(cxk + sgn * t.ctr.y, ys + t.ctr.x); cut = min(min(Rout - abs(lx), abs(lx) - Ro), min(yg - y, y - ys));
          float j = floor((t.ctr.y - Ro) / w + 0.01); dcol = j < 0.5 ? cWarm : j < 1.5 ? white : cExtra;
        } else {
          // wall: straight courses; roundels in the spandrels, a cornice above
          t = rowTile(q, w, 1.0); wc = t.ctr; plain = 1.0;
          if (inSpan) cut = min(yg - y, y < ys ? r - Rout : abs(lx) - Rout);
          float xs = x - (floor(x / pitch) + 0.5) * pitch, yr = top + 2.5 * w, rr = length(vec2(xs, y - yr)), Rr = 2.0 * w;
          bool spandrel = abs(x) < m * pitch + 0.01 && m > 0.5;
          if (spandrel && rr < Rr) {
            t = ringTile(vec2(xs, y - yr), w, 50.0); wc = vec2(q.x - xs, yr) + t.ctr; salt = 50.0 + floor(x / pitch); cut = Rr - rr; plain = 0.0;
            dcol = t.id.y < 0.5 ? cWarm : cDeep;
          } else {
            if (spandrel) cut = min(cut, rr - Rr);
            float jc = floor((top - 2.0 * w) / w);
            if (abs(wc.x - uB.x) < spanW + w && y < ys) {
              if (t.id.y == jc) { dcol = cDeep; plain = 0.0; } else if (t.id.y == jc - 1.0) { dcol = mix(cBg, cWarm, 0.7); plain = 0.0; }
              else if (t.id.y > jc) { dcol = mix(cBg, cLight, uDark > 0.5 ? 0.22 : 0.5); plain = 0.0; }
            }
            if (inSpan && y >= ys) { dcol = mix(cBg, cLight, uDark > 0.5 ? 0.22 : 0.5); plain = 0.0; }
          }
        }
      } else {
        // ================= bands
        bool found = false; float front = 9.0;
        for (int i = 2; i >= 0; i--) {
          vec4 d = uA[i]; vec2 rel = q - d.xy; float r = length(rel);
          if (!found && r < d.z) {
            found = true; salt = 60.0 + float(i);
            t = ringTile(rel, w, salt); wc = d.xy + t.ctr; cut = min(front, d.z - r);
            float j = t.id.y, nR = d.z / w, gw = i == 0 ? 3.0 : 2.0, grp = floor((nR - 1.0 - j) / gw);
            dcol = pick(grp * (i == 1 ? 2.0 : 1.0) + d.w);
            if (mod(nR - 1.0 - j, gw) > gw - 1.5 && i != 2) dcol = mix(dcol, white, 0.82);         // a pale course between the bands
            if (j < 1.5) dcol = i == 1 ? cWarm : cDeep;
          }
          front = min(front, r - d.z);
        }
        if (!found) {
          vec2 n = vec2(-uB.y, uB.x), tng = uB.xy; float s = dot(q - uB.zw, n), hw = uC.x;
          if (abs(s) < hw) {
            salt = 70.0; t = rowTile(vec2(dot(q - uB.zw, tng), s + hw), w, salt); wc = uB.zw + tng * t.ctr.x + n * (t.ctr.y - hw); cut = min(front, hw - abs(s));
            float j = t.id.y; dcol = j < 0.5 || j > 6.5 ? cDeep : j < 2.5 ? pick(uC.y + 1.0) : j < 3.5 ? white : j < 5.5 ? pick(uC.y + 3.0) : white;
          } else { t = rowTile(q, w, 1.0); wc = t.ctr; cut = min(front, abs(s) - hw); plain = 1.0; }
        }
      }

      // ---- one tessera
      vec2 h2 = hash22(t.id + salt * 17.31 + 3.0); float h3 = hash21(t.id * 1.7 + salt * 7.77 - 11.0);
      // the copy: the design gives way tile by tile to the plain field
      float mq = quiet(wc / uAsp, 0.07), hush = step(0.12 + 0.76 * h3, mq * 1.12);
      if (hush > 0.5) { dcol = cBg; plain = 1.0; }
      float gap = w * 0.075 * uGrout * (0.8 + 0.5 * h2.x), rad = w * 0.15;
      vec2 hb = max(t.hlf - gap, vec2(w * 0.04)), dd = abs(t.loc) - hb + rad;
      float d = length(max(dd, 0.0)) + min(max(dd.x, dd.y), 0.0) - rad;
      d += w * 0.04 * uRough * noise2(q / w * 2.1 + h2 * 9.0);                       // hand-cut edges
      d = max(d, gap - cut);
      float aa = 0.8 / uShort, tile = smoothstep(aa, -aa, d);
      // colour: no two tesserae quite alike; field tiles vary less
      float var = mix(1.0, 0.36, plain) * mix(1.0, 0.5, mq);
      vec3 col = dcol * (1.0 + 0.2 * var * (h2.y - 0.5)) + var * 0.035 * vec3(h3 - 0.5, 0.0, 0.5 - h3);
      // each sits at its own small tilt: a different share of the light, now and then a glint
      vec2 tilt = (hash22(t.id * 3.1 + salt * 5.0) - 0.5) * 2.0;
      float lightK = 1.0 + 0.07 * dot(tilt, vec2(-0.7, -0.7)) * mix(1.0, 0.5, mq);
      float glint = pow(max(0.0, 1.0 - length(tilt - vec2(-0.3, -0.42)) * 1.5), 2.0) * 0.2 * uGloss * mix(1.0, 0.4, plain);
      vec2 ln = t.loc / max(t.hlf, vec2(1e-4));
      float rim = 1.0 - smoothstep(0.0, w * 0.2, -d), side = dot(ln, vec2(-0.7, -0.7));
      col *= lightK * (1.0 + 0.13 * rim * side) * (1.0 - 0.1 * rim);
      col += glint * (0.6 + 0.4 * side) * mix(vec3(1.0), col, 0.3);
      col *= 1.0 + 0.035 * noise2(q / w * 14.0) + 0.03 * noise2(q / w * 3.0 + h2 * 5.0);
      vec3 g = cGroutC * (1.0 + 0.12 * noise2(q / w * 9.0)) * (1.0 - 0.18 * smoothstep(w * 0.06, 0.0, d));
      g = mix(g, cBg * mix(0.9, 0.72, uDark), 0.7 * quiet(p, 0.04));
      col = mix(g, col, tile);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0) + ditherNoise(gl_FragCoord.xy), 1.0);
    }`, {
    uAsp: { value: new THREE.Vector2(sx, sy) }, uShort: { value: short }, uW: { value: w }, uSeed: { value: (seed % 83) * 0.61 }, uDark: { value: dark ? 1 : 0 },
    uGloss: { value: P.gloss }, uGrout: { value: P.grout }, uRough: { value: P.rough }, uAS: { value: A }, uMotif: { value: MOTIFS.indexOf(motif) },
    cBg: { value: bg }, cGroutC: { value: grout }, cDeep: { value: deep }, cMid: { value: mid }, cLight: { value: light }, cWarm: { value: warm }, cExtra: { value: extra },
    uQ: { value: uQ }, uA: { value: uA }, uB: { value: uB }, uC: { value: uC },
  }));

  ctx.frame({ radius: 1, fov: 30, dir: [0, 0, 1] });
}
