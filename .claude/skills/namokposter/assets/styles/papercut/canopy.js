// Canopy — looking through a paper forest: branches of rounded leaves cut from the rim of a window
// in every sheet, framing the art area, with deeper and deeper sheets showing between them.
//
// Each sheet has a window — a soft-cornered oval fitted to the art area, a little smaller on every
// sheet down — and keeps two or three branches that grow from its rim into the opening. A branch is
// a stem that sets off at a slant and arches along the rim (so the middle of the window stays a
// clearing), with broad leaves set alternately on either side, smaller towards the tip, and one leaf
// at the end. A leaf is two arcs meeting in a soft point, broader towards its base and bowed a
// little. The branches of one sheet stand between those of the sheet above and get smaller with
// depth, as far foliage does. The last sheet is whole except for one punched disc — a moon in the
// clearing — that shows the accent paper underneath.

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const MAX_LEAVES = 128;

export default function canopy(ctx, env) {
  const { THREE, rng, focus, artSize } = ctx;
  const { P, sx, sy, settle, rampAt, moonOn, MAX_SHEETS } = env;
  const deep = clamp(P.layers ?? 5, 3, MAX_SHEETS - 2), hole = P.disc;          // sheets under the page · punched disc in the last one

  // ---- the window: the room the layout leaves (short-side units, centred on the focus), a margin's width inside the sheet
  const [ax0, ay0, ax1, ay1] = ctx.artRect || [0, 0, 1, 1], mg = 0.055;
  const fx = focus.x * sx, fy = focus.y * sy, base = 0.5 * clamp(artSize ?? 0.7, 0.3, 1.1);
  const hx = clamp(Math.min(fx - Math.max(ax0 * sx, mg), Math.min(ax1 * sx, sx - mg) - fx), base * 0.9, base * 1.9);
  const hy = clamp(Math.min(fy - Math.max(ay0 * sy, mg), Math.min(ay1 * sy, sy - mg) - fy), base * 0.9, base * 1.9);
  const sq = 2.25, sr = (x, y) => Math.pow(Math.pow(Math.abs(x), sq) + Math.pow(Math.abs(y), sq), 1 / sq);   // squareness of the oval · 1 on its rim
  // half axes of the page's window, once it has been moved or drawn in until its rim, with room for its bends,
  // is clear of the paper steps round the copy
  const rimOf = (x0, y0, k) => Array.from({ length: 72 }, (_, i) => { const a = (i / 72) * TAU, r = (1.07 * k) / sr(Math.cos(a), Math.sin(a)); return [x0 + Math.cos(a) * r * hx * 0.97 * P.scale, y0 + Math.sin(a) * r * hy * 0.97 * P.scale]; });
  const fitted = settle(rimOf, () => 0.056, fx, fy);
  const cx = fitted.cx, cy = fitted.cy, Wx = hx * 0.97 * P.scale * fitted.s, Wy = hy * 0.97 * P.scale * fitted.s, minR = Math.min(Wx, Wy);

  // ---- how far each sheet's window has closed: small unequal steps (the leaves do the overlapping)
  const pool = [0.05, 0.022, 0.065, 0.03, 0.08, 0.04, 0.055], steps = rng.shuffle(pool).slice(0, deep - 1), T = [0];
  for (const s of steps) T.push(T[T.length - 1] + s);

  // ---- the moon: a little off the middle of the clearing
  const ma = rng.range(0, TAU), mr = rng.range(0.05, 0.16), moon = { x: Math.cos(ma) * mr * Wx, y: Math.sin(ma) * mr * Wy, r: clamp(0.2 * minR, 0.03, 0.09) };

  // ---- branches. A leaf is [centre x, y, axis x, y] + [half length, half width, bow, how much broader the base is];
  // a piece of stem is [from x, y, to x, y] + its half width
  const leafA = [], leafB = [], stemA = [], stemR = [], range = [];
  const leaf = (bx, by, ang, len, bow) => {
    if (leafA.length >= MAX_LEAVES) return;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const tx = bx + dx * len - moon.x, ty = by + dy * len - moon.y, td = Math.hypot(tx, ty);                  // a leaf stops short of the moon
    if (td < moon.r * 2) len *= clamp(td / (moon.r * 2), 0.5, 1) * 0.9;
    const h = len / 2;
    leafA.push(new THREE.Vector4(bx + dx * h * 0.92, by + dy * h * 0.92, dx, dy));
    leafB.push(new THREE.Vector4(h, h * rng.range(0.44, 0.54), bow * rng.range(0.06, 0.14), rng.range(0.14, 0.26)));
  };
  // places on the rim are given as a share of the way round it, so that a long window gets branches along its
  // long sides too: a table of the rim's length against its angle
  const RIM = 240, arc = [0];
  for (let i = 1; i <= RIM; i++) {
    const a0 = ((i - 1) / RIM) * TAU, a1 = (i / RIM) * TAU, r0 = 1 / sr(Math.cos(a0), Math.sin(a0)), r1 = 1 / sr(Math.cos(a1), Math.sin(a1));
    arc.push(arc[i - 1] + Math.hypot((Math.cos(a1) * r1 - Math.cos(a0) * r0) * Wx, (Math.sin(a1) * r1 - Math.sin(a0) * r0) * Wy));
  }
  const round = arc[RIM], angleAt = (share) => { const want = (((share % 1) + 1) % 1) * round; let i = 1; while (i < RIM && arc[i] < want) i++; return ((i - (arc[i] - want) / (arc[i] - arc[i - 1] || 1)) / RIM) * TAU; };
  const perSheet = clamp(Math.round(round / (2.1 * minR)), 3, 4);                             // about one branch for every window-radius of rim
  let phi = rng();
  for (let k = 0; k < deep; k++) {
    const l0 = leafA.length, s0 = stemA.length, nb = k === 0 ? perSheet - 1 : perSheet, size = k === 0 ? 1.12 : Math.pow(0.9, k);       // the nearest branches are the fewest and the largest
    phi += 0.382 + rng.range(-0.03, 0.03);                                                   // the golden section: branches fall between those of the sheet above
    for (let b = 0; b < nb; b++) {
      const a = angleAt(phi + b / nb + rng.range(-0.045, 0.045)), ux = Math.cos(a), uy = Math.sin(a), rim = (1 - T[k]) / sr(ux, uy);
      const rx = ux * rim * Wx, ry = uy * rim * Wy, rl = Math.hypot(rx, ry);                 // the point of the rim the branch grows from
      // it leans one way and keeps turning that way; the nearest branches reach further in, so that their leaves stand
      // clear of the rim of their own sheet
      const way = rng.sign(), slant = way * (k === 0 ? rng.range(0.35, 0.6) : rng.range(0.55, 0.9)), bend = way * (k === 0 ? rng.range(0.25, 0.5) : rng.range(0.3, 0.65));
      const L = Math.min(minR * rng.range(0.78, 1.0), rl * 0.95) * size * (k === 0 ? 0.9 : 1), m = rng.int(5, 7), ds = L / m, big = L * rng.range(0.36, 0.44);
      const pu = ux * rim, pv = uy * rim, nxi = -Math.sign(pu) * Math.pow(Math.abs(pu), sq - 1) / Wx, nyi = -Math.sign(pv) * Math.pow(Math.abs(pv), sq - 1) / Wy;      // straight in from the rim
      let th = Math.atan2(nyi, nxi) + slant, x = rx - Math.cos(th) * 0.08 * L, y = ry - Math.sin(th) * 0.08 * L;
      for (let i = 1; i <= m; i++) {
        const nx = x + Math.cos(th) * ds, ny = y + Math.sin(th) * ds, f = i / m;
        if (stemA.length < MAX_LEAVES) { stemA.push(new THREE.Vector4(x, y, nx, ny)); stemR.push(L * (0.024 - 0.014 * f)); }
        x = nx; y = ny; th += bend / m;
        const side = (i % 2 ? 1 : -1) * way, len = big * (1 - 0.45 * Math.pow(f, 1.3)) * rng.range(0.9, 1.08);
        if (i === 1) continue;                                                                // the stem comes in bare
        if (i < m) leaf(x, y, th + side * (1.0 - 0.3 * f) + rng.range(-0.1, 0.1), len, -side);
        else leaf(x, y, th + rng.range(-0.15, 0.15), len * 1.2, rng.sign() * 0.5);            // the leaf at the tip
      }
    }
    range.push(new THREE.Vector4(l0, leafA.length, s0, stemA.length));
  }
  while (leafA.length < MAX_LEAVES) { leafA.push(new THREE.Vector4(9, 9, 1, 0)); leafB.push(new THREE.Vector4(0.01, 0.005, 0, 0)); }
  while (stemA.length < MAX_LEAVES) { stemA.push(new THREE.Vector4(9, 9, 9.1, 9)); stemR.push(0.001); }
  while (range.length < MAX_SHEETS) range.push(new THREE.Vector4(0, 0, 0, 0));

  // ---- slow bends of the rim, and every sheet's own small wander (as in strata)
  const waves = [[1.3, 0.035], [2.4, 0.022]].map(([f, a]) => {
    const ka = rng.range(0, TAU);
    return new THREE.Vector4((Math.cos(ka) * f) / minR, (Math.sin(ka) * f) / minR, rng.range(0, TAU), a);
  });
  const own = [];
  for (let k = 0; k < MAX_SHEETS; k++) { const a = rng.range(0, TAU), f = rng.range(2.0, 3.4) / minR; own.push(new THREE.Vector4(Math.cos(a) * f, Math.sin(a) * f, rng.range(0, TAU), 0.014)); }

  // ---- the stack, bottom → top: [accent paper,] last sheet, …, sheet 1, page
  const n = deep + 1 + (hole ? 1 : 0), cols = [], clear = [];
  for (let j = 0; j < n; j++) {
    const k = n - 1 - j;                                                                    // depth: 0 = the page
    cols.push(k > deep ? moonOn(rampAt(1)) : rampAt(k / deep));
    clear.push(0.03 + 0.3 * (T[Math.min(k, deep - 1)] ?? 0) + (k >= deep ? 0.02 : 0));
  }
  const Tpad = T.slice(); while (Tpad.length < MAX_SHEETS) Tpad.push(1);

  return {
    cols, clear, up: false, disc: null, per: 1,
    glsl: /* glsl */`
      uniform vec2 uC, uW; uniform float uT[${MAX_SHEETS}], uStemR[${MAX_LEAVES}], uSq, uMinR; uniform vec4 uRange[${MAX_SHEETS}], uWave[2], uOwn[${MAX_SHEETS}], uLeafA[${MAX_LEAVES}], uLeafB[${MAX_LEAVES}], uStemA[${MAX_LEAVES}]; uniform vec3 uHole; uniform int uKLast;
      // distance to a leaf (< 0 inside): two arcs meeting in a point at each end, bowed sideways, broader towards the base, the points rounded off
      float leafD(vec2 d, vec4 A, vec4 B){
        vec2 p = vec2(dot(d, vec2(-A.w, A.z)), dot(d, A.zw));                         // across the leaf · along it (towards the tip)
        float t = clamp(p.y / B.x, -1.3, 1.3), rho = 0.3 * B.y;
        p.x += B.z * B.x * (1.0 - t * t);
        p.x /= 1.0 - B.w * t;
        p = abs(p); float h = B.x - rho, w = B.y - rho, c = 0.5 * (h * h - w * w) / w;
        return ((h * p.x < c * (p.y - h)) ? length(p - vec2(0.0, h)) : length(p + vec2(c, 0.0)) - (c + w)) - rho;
      }
      float stemD(vec2 p, vec4 S, float r){ vec2 a = p - S.xy, b = S.zw - S.xy; return length(a - b * clamp(dot(a, b) / dot(b, b), 0.0, 1.0)) - r; }
      // > 0 where sheet k (0 = the page) has paper: outside its window, and in its branches
      float canopyField(int k, vec2 q){
        vec2 v = q - uC, u = v / uW;
        float s = (pow(pow(abs(u.x), uSq) + pow(abs(u.y), uSq), 1.0 / uSq) - (1.0 - uT[k])
                + uWave[0].w * sin(dot(uWave[0].xy, v) + uWave[0].z) + uWave[1].w * sin(dot(uWave[1].xy, v) + uWave[1].z)
                + uOwn[k].w * sin(dot(uOwn[k].xy, v) + uOwn[k].z)) * uMinR;
        vec4 R = uRange[k]; float d = 9.0;
        for (int i = int(R.x); i < int(R.y); i++) d = min(d, leafD(v - uLeafA[i].xy, uLeafA[i], uLeafB[i]));
        for (int i = int(R.z); i < int(R.w); i++) d = smin(d, stemD(v, uStemA[i], uStemR[i]), 0.006);
        return smax(s, -d, 0.01);
      }
      float sheet(int j, vec2 q){
        int k = uN - 1 - j;
        if (k == uKLast) return length(q - uHole.xy) - uHole.z;                       // the last sheet: whole but for the punched moon
        return terrace(j, canopyField(k, q), q, 1.0);
      }`,
    uniforms: {
      uC: { value: new THREE.Vector2(cx, cy) }, uW: { value: new THREE.Vector2(Wx, Wy) }, uSq: { value: sq }, uMinR: { value: minR }, uT: { value: Tpad },
      uWave: { value: waves }, uOwn: { value: own }, uRange: { value: range }, uLeafA: { value: leafA }, uLeafB: { value: leafB }, uStemA: { value: stemA }, uStemR: { value: stemR },
      uHole: { value: new THREE.Vector3(cx + moon.x, cy + moon.y, moon.r) }, uKLast: { value: hole ? deep : -1 },
    },
  };
}
