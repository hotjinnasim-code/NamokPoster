// Strata — nested contour openings round the focus, like a canyon or a geode cut in paper.
//
// The opening of every sheet is the same kind of shape: a long ellipse laid along the longer side of
// the art area (across a diagonal when the area is square), bowed into a C or an S by one sine along
// its length and a little wider at one end — a river stone, a bend of a canyon — with three small
// slow waves on top so that nothing is a pure construction (no noise: the curves stay smooth, as if
// drawn in one stroke). Going down the stack the opening shrinks by unequal steps — some sheets show
// a wide shelf, some a sliver — and its centre drifts along the chamber towards the lower right, so
// the shelves on the lamp's side run out long and carry the shadows while the far wall is a tight
// flight of lit edges. Each sheet's cut also wanders a little on its own, the way a second hand-cut
// copy of a curve never quite follows the first. The last sheet is whole except for one punched
// disc, in the deepest well, that shows the accent paper underneath.

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export default function strata(ctx, env) {
  const { THREE, rng, focus, artSize } = ctx;
  const { P, sx, sy, settle, rampAt, disc, MAX_SHEETS } = env;
  const deep = clamp(P.layers ?? 7, 3, MAX_SHEETS - 2), hole = P.disc;          // sheets under the page · punched disc in the last one

  // ---- the room the layout leaves (short-side units, centred on the focus), kept a margin's width inside the sheet
  const [ax0, ay0, ax1, ay1] = ctx.artRect || [0, 0, 1, 1], mg = 0.055;
  const fx = focus.x * sx, fy = focus.y * sy, base = 0.5 * clamp(artSize ?? 0.7, 0.3, 1.1);
  const hx = clamp(Math.min(fx - Math.max(ax0 * sx, mg), Math.min(ax1 * sx, sx - mg) - fx), base * 0.9, base * 1.7);
  const hy = clamp(Math.min(fy - Math.max(ay0 * sy, mg), Math.min(ay1 * sy, sy - mg) - fy), base * 0.9, base * 1.7);

  // ---- the chamber, sized so that its bounding box, bow included, fits the room
  const long = Math.max(hx, hy) / Math.min(hx, hy), fit = 1.02 * P.scale;
  const rot = long > 1.22 ? (hy > hx ? Math.PI / 2 : 0) + rng.range(-0.2, 0.2) : rng.sign() * rng.range(0.6, 0.95);
  const ct = Math.cos(rot), st = Math.sin(rot), slim = rng.range(1.65, 2.05) * (long > 1.4 ? 1.12 : 1);
  const bow = rng.range(0.24, 0.4) * rng.sign(), kappa = rng.range(1.5, 2.9), taper = rng.range(-0.16, 0.16);
  const phase = rng.range(-0.6, 0.6) - (kappa > 2.2 ? 0 : (Math.PI / 2) * rng.sign());      // a short wave is centred as an S, a long one as a C
  const wide = (1 + Math.abs(bow) * 0.6) / slim;                                            // half width with the bow, in units of the half length
  const ra0 = Math.min((hx * fit) / Math.hypot(ct, st * wide), (hy * fit) / Math.hypot(st, ct * wide));
  // … then moved or drawn in until its rim, with room for the bends, is clear of the paper steps round the copy
  const rimOf = (x0, y0, k) => Array.from({ length: 72 }, (_, i) => {
    const a = Math.cos((i / 72) * TAU), c = Math.sin((i / 72) * TAU) * (1 + taper * a) + bow * Math.sin(kappa * a + phase), r = ra0 * k;
    return [x0 + a * r * ct - ((c * r) / slim) * st, y0 + a * r * st + ((c * r) / slim) * ct];
  });
  const fitted = settle(rimOf, (k) => 0.052 + 0.035 * ra0 * k, focus.x * sx, focus.y * sy);
  const cx = fitted.cx, cy = fitted.cy, ra = ra0 * fitted.s, rc = ra / slim, rm = Math.sqrt(ra * rc);

  // ---- small bends on top: three slow waves
  const waves = [[1.4, 0.05], [2.3, 0.035], [3.6, 0.02]].map(([f, a]) => {
    const ka = rng.range(0, TAU), da = ka + rng.range(0.6, 2.5);
    return { kx: (Math.cos(ka) * f) / rm, ky: (Math.sin(ka) * f) / rm, ph: rng.range(0, TAU), amp: a * rm, dx: Math.cos(da), dy: Math.sin(da) };
  });
  const warp = (x, y) => { let wx = 0, wy = 0; for (const w of waves) { const s = w.amp * Math.sin(w.kx * x + w.ky * y + w.ph); wx += w.dx * s; wy += w.dy * s; } return [wx, wy]; };

  // ---- the steps down: unequal, never two slivers in a row; the innermost well keeps about a quarter of the radius
  const pool = [1.9, 0.5, 1.2, 0.65, 1.6, 0.45, 1.0, 0.7, 1.4];
  let steps = [];
  for (let tries = 0; tries < 40; tries++) {
    steps = rng.shuffle(pool).slice(0, deep - 1);
    if (!steps.some((s, i) => i && s < 0.75 && steps[i - 1] < 0.75)) break;
  }
  const well = rng.range(0.25, 0.3), sum = steps.reduce((a, b) => a + b, 0) || 1, T = [0];
  for (const s of steps) T.push(T[T.length - 1] + (s / sum) * (1 - well));               // T[k]: how far sheet k's opening has closed, k = 0 (page) … deep-1
  // the centre of each deeper opening drifts with the light, and mostly along the chamber
  const La = 0.64 * ct + 0.77 * st, Lc = -0.64 * st + 0.77 * ct, dl = Math.hypot(La * 1.6, Lc * 0.7), dm = rng.range(0.46, 0.58);
  const drift = [((La * 1.6) / dl) * dm, ((Lc * 0.7) / dl) * dm * 0.8];

  // ---- every sheet's own small wander (two waves each)
  const own = [];
  for (let k = 0; k < MAX_SHEETS; k++) for (let i = 0; i < 2; i++) {
    const a = rng.range(0, TAU), f = (rng.range(2.2, 3.8) * (i ? 1.8 : 1)) / rm;
    own.push(new THREE.Vector4(Math.cos(a) * f, Math.sin(a) * f, rng.range(0, TAU), (i ? 0.011 : 0.026) * (k === 0 ? 0.5 : 1)));
  }

  // ---- the punched disc: in the middle of the deepest well (undo the bow, then the small bends by fixed-point iteration)
  const tl = T[deep - 1], ua = drift[0] * tl, uc = drift[1] * tl * (1 + taper * ua) + bow * Math.sin(kappa * ua + phase);
  const gx = ua * ra * ct - uc * rc * st, gy = ua * ra * st + uc * rc * ct;
  let px = gx, py = gy;
  for (let i = 0; i < 16; i++) { const [wx, wy] = warp(px, py); px = gx - wx; py = gy - wy; }
  const holeR = 0.5 * (1 - tl) * rc * (1 + taper * ua);

  // ---- the stack, bottom → top: [accent paper,] last sheet, …, sheet 1, page
  const n = deep + 1 + (hole ? 1 : 0), cols = [], clear = [];
  for (let j = 0; j < n; j++) {
    const k = n - 1 - j;                                                                    // depth: 0 = the page
    cols.push(k > deep ? disc.clone() : rampAt(k / deep));
    clear.push(0.03 + 0.11 * (T[Math.min(k, deep - 1)] ?? 0) + (k >= deep ? 0.02 : 0));     // the deeper the sheet, the further it stays from the copy
  }
  const Tpad = T.slice(); while (Tpad.length < MAX_SHEETS) Tpad.push(1);

  return {
    cols, clear, up: false, disc: null,
    glsl: /* glsl */`
      uniform vec2 uC, uRot, uAx, uDrift, uWd[3]; uniform float uT[${MAX_SHEETS}], uUnitsPer; uniform vec4 uWk[3], uBow, uOwn[${2 * MAX_SHEETS}]; uniform vec3 uHole; uniform int uKLast;
      // > 0 where sheet k (0 = the page) has paper: outside its opening
      float ringField(int k, vec2 q){
        vec2 v = q - uC, w = v;
        for (int i = 0; i < 3; i++) w += uWd[i] * (uWk[i].w * sin(dot(uWk[i].xy, v) + uWk[i].z));
        vec2 u = vec2(dot(w, uRot), dot(w, vec2(-uRot.y, uRot.x))) / uAx;                       // the chamber's own frame: along it, across it
        u.y = (u.y - uBow.x * sin(uBow.y * u.x + uBow.z)) / (1.0 + uBow.w * clamp(u.x, -1.2, 1.2));   // the bow and the taper
        vec4 a = uOwn[2 * k], b = uOwn[2 * k + 1];
        return length(u - uDrift * uT[k]) + a.w * sin(dot(a.xy, v) + a.z) + b.w * sin(dot(b.xy, v) + b.z) - (1.0 - uT[k]);
      }
      float sheet(int j, vec2 q){
        int k = uN - 1 - j;
        if (k == uKLast) return (length(q - uHole.xy) - uHole.z) * uUnitsPer;       // the last sheet: whole but for the punched disc
        return terrace(j, ringField(k, q), q, uUnitsPer);
      }`,
    uniforms: {
      uC: { value: new THREE.Vector2(cx, cy) }, uRot: { value: new THREE.Vector2(ct, st) }, uAx: { value: new THREE.Vector2(ra, rc) }, uDrift: { value: new THREE.Vector2(...drift) },
      uT: { value: Tpad }, uUnitsPer: { value: 1 / rm }, uOwn: { value: own }, uBow: { value: new THREE.Vector4(bow, kappa, phase, taper) },
      uWk: { value: waves.map((w) => new THREE.Vector4(w.kx, w.ky, w.ph, w.amp)) }, uWd: { value: waves.map((w) => new THREE.Vector2(w.dx, w.dy)) },
      uHole: { value: new THREE.Vector3(cx + px, cy + py, holeR) }, uKLast: { value: hole ? deep : -1 },
    },
  };
}
