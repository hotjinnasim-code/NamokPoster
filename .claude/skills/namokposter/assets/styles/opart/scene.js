// Op Art — a flat, hard-edged pattern (stripes, checks or a dot grid) drawn on a surface that is
// not flat: the pattern is evaluated in the coordinates of a bent sheet, so the eye reads volume
// and movement where there is only two- or three-colour print (after Riley and Vasarely).
//
// What it depicts is the `motif` — the way the sheet is bent:
//   sphere  a ball pressing up through the grid (the pattern is mapped onto a hemisphere)
//   wave    ripples running through the sheet, their fronts slanting across the stripes
//   fold    the sheet pleated like a paper screen: the pattern zigzags from face to face
// `pattern` picks what is printed on it (stripes | checks | dots; "auto" = the classic pairing).
//
// The print is made of two inks laid in alternation (dark stripe / light stripe, or the two colours
// of a chequerboard). Towards the copy both inks thin out — lines taper to hairlines, squares and
// dots shrink to points — and bare paper is left for the type. Edges are anti-aliased analytically
// from the pattern's screen-space footprint, and where the bend squeezes the pattern below two
// pixels it resolves to its mean tone instead of shimmering.
//
// Palette: bg = paper · colors[0] = dark ink · colors[1] = the dark ink of the bent zone (ball, wave
//          slopes, far faces of the folds) · colors[2] = the light ink laid between the dark elements
//          (set it to the paper colour for a strict two- or three-colour print)
import { backgroundQuad, quietUniforms, GLSL_DITHER } from '/skill/assets/web/scene-lib.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export default function build(ctx) {
  const { THREE, scene, palette, params, aspect, rng, width: W, height: H, unit } = ctx;
  const sx = Math.max(aspect, 1), sy = Math.max(1 / aspect, 1);
  const motif = ['sphere', 'wave', 'fold'].includes(params.motif) ? params.motif : 'sphere';
  const auto = { sphere: 'checks', wave: 'stripes', fold: 'stripes' }[motif];
  const pattern = ['stripes', 'checks', 'dots'].includes(params.pattern) ? params.pattern : auto;
  const P = { density: clamp(params.density ?? 1, 0.5, 2.2), bend: clamp(params.bend ?? 1, 0.3, 1.6), fade: clamp(params.fade ?? 1, 0.4, 2) };
  const C = (h) => new THREE.Color(h), cols = palette.colors?.length ? palette.colors : [palette.ink];
  const bg = C(palette.bg), cA = C(cols[0]), cB = C(cols[1] ?? cols[0]), cL = C(cols[2] ?? palette.bg);

  const S = clamp(ctx.artSize ?? 0.7, 0.35, 1.05), fx = ctx.focus.x, fy = ctx.focus.y;
  const periods = { stripes: 30, checks: 19, dots: 23 }[pattern] * P.density;           // pattern periods across the art circle
  const cell = S / periods;
  // how far the copy is from the subject: the inks reach full weight just before the subject begins
  const copy = (ctx.quiet || [])[0] ?? [2, 2, 2, 2];
  const dCopy = Math.hypot(Math.max(copy[0] - fx, 0, fx - copy[2]) * sx, Math.max(copy[1] - fy, 0, fy - copy[3]) * sy);
  const Rb = 0.47 * S, reach = clamp(dCopy - 0.7 * (motif === 'sphere' ? Rb : 0.36 * S), 0.12, 0.45) * P.fade;
  // the print lies on the side of the sheet the subject is on: its weight grows along the direction from the copy to the focus
  const ccx = (copy[0] + copy[2]) / 2, ccy = (copy[1] + copy[3]) / 2, ddx = (fx - ccx) * sx, ddy = (fy - ccy) * sy, dl = Math.hypot(ddx, ddy);
  const hasDir = copy[0] < 1.5 && dCopy > 0.05, dir = hasDir ? [ddx / dl, ddy / dl] : [1, 0];
  // snap to the sheet's axes unless the layout is clearly diagonal, so the taper runs parallel to an edge of the copy block
  if (hasDir) { if (Math.abs(dir[0]) > 0.82) { dir[0] = Math.sign(dir[0]); dir[1] = 0; } else if (Math.abs(dir[1]) > 0.82) { dir[1] = Math.sign(dir[1]); dir[0] = 0; } }
  const copyH = Math.abs(dir[0]) * (copy[2] - copy[0]) / 2 * sx + Math.abs(dir[1]) * (copy[3] - copy[1]) / 2 * sy;

  // rotation of the whole print
  const rot = typeof params.angle === 'number' || (typeof params.angle === 'string' && params.angle.trim() !== '' && Number.isFinite(Number(params.angle))) ? (Number(params.angle) * Math.PI) / 180
    : motif === 'sphere' ? (pattern === 'stripes' ? rng.range(-0.5, 0.5) : rng.pick([0, Math.PI / 4]))
      : motif === 'wave' ? rng.range(-0.16, 0.16) + (pattern === 'stripes' ? 0 : Math.PI / 4) : rng.range(-0.22, 0.22);

  // fold: knots of a zigzag across the sheet — wide and narrow faces in turn, like a screen seen at an angle
  const K = 40, knotX = new Float32Array(K), knotH = new Float32Array(K);
  {
    const span = 2.6 * Math.max(sx, sy); let x = -span / 2, hgt = 0, sign = rng.sign();
    const base = 0.2 * S, depth = 3.1 * cell * P.bend * (pattern === 'stripes' ? 1 : 0.8);
    for (let i = 0; i < K; i++) {
      knotX[i] = x; knotH[i] = hgt;
      const wide = i % 2 === 0, wdt = base * (wide ? rng.range(0.9, 1.25) : rng.range(0.4, 0.62));
      x += wdt; hgt = sign * depth * rng.range(0.8, 1.15) * 0.5; sign = -sign;
    }
    const mid = knotX[Math.floor(K / 2)] + rng.range(0, base);                             // a wide face near the focus
    for (let i = 0; i < K; i++) knotX[i] -= mid;
  }

  scene.add(backgroundQuad(/* glsl */`
    varying vec2 vUv;
    uniform vec3 cBg, cA, cB, cL; uniform vec2 uFocus, uAsp, uRes; uniform vec4 uQuiet[4];
    uniform float uCell, uRb, uReach, uBend, uS, uPhase, uLambda, uSlant, uSeedT, uHasDir, uCopyH; uniform vec2 uDir, uCopyC; uniform int uMotif, uPattern; uniform vec2 uRot;
    uniform float uKnotX[${K}], uKnotH[${K}];
    ${GLSL_DITHER}
    const float PI = 3.14159265;

    // distance (short-side units) to the nearest rectangle that carries type; strips (footer, header) count for less
    float quietDist(vec2 p){
      float d = 9.0;
      for (int i = 0; i < 4; i++) {
        vec4 r = uQuiet[i]; bool strip = r.z - r.x > 0.96;
        if (strip && r.w > 0.98) r.w = 3.0; if (strip && r.y < 0.02) r.y = -2.0; if (strip) { r.x = -2.0; r.z = 3.0; }   // strips run on past the edges of the sheet
        vec2 e = (abs(p - (r.xy + r.zw) * 0.5) - (r.zw - r.xy) * 0.5) * uAsp;
        float di = length(max(e, 0.0)) + min(max(e.x, e.y), 0.0);
        d = min(d, strip ? di * 2.4 : di);
      }
      return d;
    }
    // weight of the print at a point given in pattern coordinates (the bend is ignored: it moves things by a cell at most):
    // 0 on the copy, growing to 1 along the direction from the copy to the subject, and 0 on every other block of type
    float weightAt(vec2 uvc){
      vec2 r = uvc * uCell, q = vec2(uRot.x * r.x - uRot.y * r.y, uRot.y * r.x + uRot.x * r.y), p = q / uAsp + uFocus;
      float qd = quietDist(p);
      float t = uHasDir > 0.5 ? dot((p - uCopyC) * uAsp, uDir) - uCopyH : qd;
      return smoothstep(0.0, 1.0, (t - 0.015) / uReach) * smoothstep(0.0, 1.0, (qd - 0.012) / 0.07);
    }
    // the bent sheet: screen position (short-side units about the focus) → pattern coordinates; zone = 1 on the part that is bent away
    vec2 bendSheet(vec2 q, out float zone){
      vec2 r = vec2(uRot.x * q.x + uRot.y * q.y, uRot.x * q.y - uRot.y * q.x); zone = 0.0;
      if (uMotif == 0) {                                   // sphere: equal steps of arc on a hemisphere
        float d = length(r), x = d / uRb;
        if (x < 1.0) { float g = mix(x, asin(x) * (2.0 / PI), uBend); r *= g / max(x, 1e-4); }
        zone = x;                                          // < 1 inside the ball (resolved to an edge by the caller)
      } else if (uMotif == 1) {                            // wave: displacement across the stripes, fronts slanting with the rows
        float env = 0.42 + 0.58 * exp(-dot(r * vec2(0.55, 1.0), r * vec2(0.55, 1.0)) / (0.55 * uS * uS));
        float xx = r.x / uLambda, th = 2.0 * PI * (xx + 0.11 * xx * xx) + uSlant * r.y / uCell + uPhase;
        float amp = 1.45 * uCell * uBend * env;
        r.y += amp * sin(th);
        r.x += 0.55 * amp * cos(th);
        zone = cos(th) - 0.35;                             // > 0 on the slopes that face one way
      } else {                                             // fold: a zigzag of flat faces
        float h = 0.0, sl = 0.0;
        for (int i = 0; i < ${K - 1}; i++) {
          if (r.x >= uKnotX[i] && r.x < uKnotX[i + 1]) { float t = (r.x - uKnotX[i]) / (uKnotX[i + 1] - uKnotX[i]); h = mix(uKnotH[i], uKnotH[i + 1], t); sl = sign(uKnotH[i + 1] - uKnotH[i]) * min(r.x - uKnotX[i], uKnotX[i + 1] - r.x); }
        }
        r.y += h; zone = sl;                               // signed distance to the nearest fold: the sign tells the two sets of faces apart
      }
      return r / uCell;
    }
    void main(){
      vec2 p = vec2(vUv.x, 1.0 - vUv.y), q = (p - uFocus) * uAsp;
      float zone; vec2 uv = bendSheet(q, zone);
      // screen-space footprint of the pattern (pattern units per pixel) from neighbouring evaluations: exact across fold lines
      float e = 1.0 / min(uRes.x, uRes.y), z1, z2;
      vec2 ux = bendSheet(q + vec2(e, 0.0), z1) - uv, uy = bendSheet(q + vec2(0.0, e), z2) - uv;
      float fwx = length(vec2(ux.x, uy.x)), fwy = length(vec2(ux.y, uy.y)), fw = max(fwx, fwy);

      float zedge = uMotif == 0 ? clamp((1.0 - zone) * uRb / e + 0.5, 0.0, 1.0) : uMotif == 2 ? clamp(zone / e + 0.5, 0.0, 1.0) : clamp(zone / max(fwidth(zone), 1e-5) + 0.5, 0.0, 1.0);
      vec3 dark = mix(cA, cB, zedge);

      // Each element takes the weight of its own centre, so a shrinking square stays square and a line tapers evenly.
      float a = 0.0, l = 0.0, mean = 0.0;                  // coverage of the dark ink, of the light ink, and the tone they average to
      if (uPattern == 0) {                                 // stripes: dark and light lines in turn, each up to half a period wide
        float row = floor(uv.y), s = uv.y - row;
        float wa = weightAt(vec2(uv.x, row + 0.25)), wl = weightAt(vec2(uv.x, row + 0.75));
        a = clamp(0.5 - (abs(s - 0.25) - 0.25 * wa) / fwy, 0.0, 1.0) * step(0.004, wa); l = clamp(0.5 - (abs(s - 0.75) - 0.25 * wl) / fwy, 0.0, 1.0) * step(0.004, wl);
        mean = 0.25 * (wa + wl); fw = fwy;
      } else if (uPattern == 1) {                          // checks: squares shrinking about their centres
        vec2 id = floor(uv), f = uv - id - 0.5; float par = mod(id.x + id.y, 2.0), w = weightAt(id + 0.5), hs = 0.5 * pow(w, 0.8);
        float c = min(clamp(0.5 - (abs(f.x) - hs) / fwx, 0.0, 1.0), clamp(0.5 - (abs(f.y) - hs) / fwy, 0.0, 1.0)) * step(0.004, w);
        a = c * (1.0 - par); l = c * par; mean = 2.0 * hs * hs;
      } else {                                             // dots: a square grid of discs, dark and light on alternate cells
        vec2 id = floor(uv), f = uv - id - 0.5; float par = mod(id.x + id.y, 2.0), w = weightAt(id + 0.5), rad = 0.41 * pow(w, 0.7);
        float c = clamp(0.5 - (length(f) - rad) / fw, 0.0, 1.0) * step(0.004, w);
        a = c * (1.0 - par); l = c * par; mean = 3.14159265 * rad * rad * 0.5;
      }
      // finer than the pixel grid can carry: resolve to the mean tone
      float blur = smoothstep(0.32, 0.62, fw);
      a = mix(a, mean, blur); l = mix(l, mean, blur);

      vec3 col = mix(cBg, cL, l);
      col = mix(col, dark, a);
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
      gl_FragColor.rgb += ditherNoise(gl_FragCoord.xy);
    }`, {
    cBg: { value: bg }, cA: { value: cA }, cB: { value: cB }, cL: { value: cL },
    uFocus: { value: new THREE.Vector2(fx, fy) }, uAsp: { value: new THREE.Vector2(sx, sy) }, uRes: { value: new THREE.Vector2(W, H) },
    uCell: { value: cell }, uRb: { value: Rb }, uReach: { value: reach }, uBend: { value: P.bend }, uS: { value: S },
    uPhase: { value: rng.range(0, Math.PI * 2) }, uLambda: { value: 0.46 * S * rng.range(0.9, 1.15) }, uSlant: { value: rng.sign() * rng.range(0.1, 0.16) }, uSeedT: { value: rng() },
    uHasDir: { value: hasDir ? 1 : 0 }, uDir: { value: new THREE.Vector2(dir[0], dir[1]) }, uCopyC: { value: new THREE.Vector2(ccx, ccy) }, uCopyH: { value: copyH },
    uMotif: { value: { sphere: 0, wave: 1, fold: 2 }[motif] }, uPattern: { value: { stripes: 0, checks: 1, dots: 2 }[pattern] },
    uRot: { value: new THREE.Vector2(Math.cos(rot), Math.sin(rot)) },
    uKnotX: { value: Array.from(knotX) }, uKnotH: { value: Array.from(knotH) }, ...quietUniforms(ctx),
  }));

  ctx.frame({ radius: 1, fov: 30, dir: [0, 0, 1] });
}
