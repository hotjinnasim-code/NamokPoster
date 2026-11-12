// Gouache Cut-outs — the outlines of the cut paper forms.
//
// Every form is a list of closed polygons in its own coordinates (x right, y down, about one unit
// long). The polygons of one form are all wound the same way, so filling them together as one path
// gives their union: a frond is a spine with a blade for every lobe, and the notch between two lobes
// comes out sharp, the way scissors leave it, while the ends of the lobes stay round.
// Nothing here knows about the canvas, the palette or the layout — `place()` at the end fits a form
// into a rectangle of the sheet. Every random choice comes from the `rng` handed in.

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

// ---- polygon tools ------------------------------------------------------------------------------------
const area2 = (p) => { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s; };
/** The same polygon, wound clockwise on screen — polygons wound alike add up when filled as one path. */
const wind = (p) => (area2(p) < 0 ? p.slice().reverse() : p);

/**
 * Scissors go round a tight curve in short straight snips. Here and there a point or two of the outline
 * is dropped, which leaves a slight flat with a soft corner at each end. Sharp corners are left alone.
 */
function snip(poly, rng, chance) {
  const n = poly.length; if (n < 16 || chance <= 0) return poly;
  const turn = (i) => { const a = poly[(i - 1 + n) % n], b = poly[i], c = poly[(i + 1) % n], ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1]; return Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); };
  const drop = new Set();
  for (let k = 0; k < 4; k++) {
    if (rng() > chance) continue;
    const i = rng.int(0, n - 1), m = rng.int(2, 3); let sum = 0, ok = true;
    for (let j = 0; j <= m; j++) { const t = turn((i + j) % n); if (Math.abs(t) > 0.45) ok = false; sum += t; }
    if (ok && Math.abs(sum) > 0.22 && Math.abs(sum) < 0.8) for (let j = 1; j < m; j++) drop.add((i + j) % n);
  }
  return drop.size ? poly.filter((_, i) => !drop.has(i)) : poly;
}

/**
 * A blade grown from (x0, y0) in the direction `ang`: `len` long, `w0` wide at the root and `w1` before
 * its end, its axis turning by `bend` radians on the way.
 *   cap    how long the rounded end is, in half-widths (1 = a half circle, 1.5 = an egg); 0 with
 *          `point: true` gives a blade that tapers to a point (a wing, a leaf tip)
 *   swell  0–0.3: the blade is fuller in the middle than a straight taper
 *   root   width of the square-cut root, if narrower than w0 — so that its corners stay inside a thin stem
 * The root is cut square; it is meant to be hidden inside whatever the blade grows from.
 * The returned polygon carries `.axis` (points {x, y, a} along its middle), for whatever grows from it.
 */
export function blade(x0, y0, ang, len, w0, w1, { bend = 0, cap = 1, swell = 0, point = false, root = w0, n = 18 } = {}) {
  const capLen = point ? 0 : Math.min(len * 0.55, 0.5 * w1 * cap), body = len - capLen, L = [], R = [], axis = [];
  let x = x0, y = y0, a = ang;
  for (let i = 0; i <= n; i++) {
    const s = i / n, h = 0.5 * (point ? w0 * Math.pow(1 - s, 0.8) * (1 + swell * Math.sin(Math.PI * s) * 3) : lerp(w0, w1, smooth(s)) * (1 + swell * Math.sin(Math.PI * s))) * lerp(Math.min(1, root / w0), 1, smooth(s / 0.16));
    const nx = -Math.sin(a), ny = Math.cos(a);
    axis.push({ x, y, a });
    if (!(point && i === n)) { L.push([x + nx * h, y + ny * h]); R.push([x - nx * h, y - ny * h]); } else L.push([x, y]);
    if (i < n) { const da = bend / n; x += Math.cos(a + da / 2) * (body / n); y += Math.sin(a + da / 2) * (body / n); a += da; }
  }
  const end = [];
  if (!point) {                                                              // the rounded end: half an ellipse
    const h = 0.5 * w1, dx = Math.cos(a), dy = Math.sin(a), m = 13;
    for (let k = 1; k < m; k++) { const f = (k / m) * Math.PI; end.push([x + dx * capLen * Math.sin(f) - dy * h * Math.cos(f), y + dy * capLen * Math.sin(f) + dx * h * Math.cos(f)]); }
  }
  const poly = wind(L.concat(end, R.reverse()));
  poly.axis = axis;
  return poly;
}

/** A closed outline from a radius function r(angle), about the origin. */
function polar(r, n = 84, squash = 1, rot = 0) {
  const c = Math.cos(rot), s = Math.sin(rot), out = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU, rr = r(a), x = Math.cos(a) * rr, y = Math.sin(a) * rr * squash; out.push([x * c - y * s, x * s + y * c]); }
  return wind(out);
}

/**
 * A silhouette that is the same on both sides of an upright axis (a vase, a pear, a bowl), from
 * [radius, height] pairs given foot to lip; height runs upwards. The outline is a smooth curve through
 * the pairs; `lean` makes one flank a little fuller than the other, as a freehand cut is.
 */
function lathe(profile, { lean = 0, steps = 8 } = {}) {
  const P = profile, n = P.length, side = [];
  const cr = (p0, p1, p2, p3, t) => 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  for (let i = 0; i < n - 1; i++) {
    const a = P[Math.max(0, i - 1)], b = P[i], c = P[i + 1], d = P[Math.min(n - 1, i + 2)];
    for (let k = 0; k < steps; k++) { const t = k / steps; side.push([Math.max(0, cr(a[0], b[0], c[0], d[0], t)), cr(a[1], b[1], c[1], d[1], t)]); }
  }
  side.push(P[n - 1]);
  const right = side.map(([r, z]) => [r * (1 + lean), -z]), left = side.map(([r, z]) => [-r * (1 - lean), -z]).reverse();
  return wind(right.concat(left));
}

// ---- plants -------------------------------------------------------------------------------------------
/**
 * A frond: a spine that swings in a gentle arc, with rounded lobes alternating up both sides, longest
 * a third of the way up and shorter towards the tip, which ends in a lobe of its own.
 *   pairs   lobes on each side (3 = a squat leaf, 4–5 = a long seaweed)
 *   reach   length of the longest lobe, as a share of the frond's length
 *   lean    angle between a lobe and the spine at the foot of the frond, radians (they lean further forward higher up)
 *   curve   how far the spine swings, radians (signed)
 *   hook    how much each lobe curls towards the tip, radians
 *   girth   thickness of the spine and plumpness of the lobes (1 = usual)
 *   lop     -0.3…0.3: the lobes of one side are that much longer than those of the other
 *   round   1 = lobes end in a half circle … 2 = in a long egg
 *   neck    how wide a lobe is where it leaves the spine (1 = about half its full width)
 *   full    how much of the room between two lobes a lobe fills at its widest (0.8 leaves a slit, 0.65 an open bay)
 */
export function frond(rng, { pairs = 5, reach = 0.3, lean = 1.0, curve = 0.45, hook = 0.35, girth = 1, lop = 0.12, stem = 0.09, round = 1, neck = 1, full = 0.8, cut = 1 } = {}) {
  const N = 90, sp = [], s2 = rng.range(-0.12, 0.12);
  { let x = 0, y = 0; for (let i = 0; i <= N; i++) { const t = i / N, a = curve * (t - 0.42) + s2 * Math.sin(TAU * t); sp.push({ x, y, a }); x += Math.cos(a) / N; y += Math.sin(a) / N; } }
  const at = (t) => { const f = clamp(t, 0, 1) * N, i = Math.min(N - 1, Math.floor(f)), k = f - i, p = sp[i], q = sp[i + 1]; return { x: lerp(p.x, q.x, k), y: lerp(p.y, q.y, k), a: lerp(p.a, q.a, k) }; };
  const polys = [];
  // the spine, cut straight across at the foot and a little askew
  const half = (t) => girth * lerp(0.034, 0.016, smooth(t)), Lp = [], Rp = [], skew = rng.range(-0.014, 0.014);
  for (let i = 0; i <= N * 0.9; i += 3) { const p = sp[i], h = half(i / N), nx = -Math.sin(p.a), ny = Math.cos(p.a), k = i === 0 ? skew : 0; Lp.push([p.x + nx * h + k, p.y + ny * h]); Rp.push([p.x - nx * h - k, p.y - ny * h]); }
  polys.push(wind(Lp.concat(Rp.reverse())));
  // the lobes: plump blades that nearly touch, so that what reads is the slit cut between two of them
  const t0 = stem + 0.01, t1 = 0.79, dt = (t1 - t0) / pairs, peak = t0 + (t1 - t0) * 0.3;
  const env = (t) => (t < peak ? lerp(0.66, 1, smooth((t - t0) / (peak - t0))) : lerp(1, 0.46, Math.pow((t - peak) / (t1 - peak), 1.2)));
  for (const sd of [1, -1]) {
    const ts = []; for (let i = 0; i < pairs; i++) ts.push(t0 + dt * (i + (sd > 0 ? 0.3 : 0.8)) + rng.range(-0.09, 0.09) * dt);   // lobes alternate up the spine, not quite evenly
    for (let i = 0; i < pairs; i++) {
      const t = ts[i], p = at(t), a = lean * lerp(1.05, 0.72, (t - t0) / (t1 - t0)) + rng.range(-0.02, 0.02);
      const room = Math.min(i > 0 ? t - ts[i - 1] : 9, i < pairs - 1 ? ts[i + 1] - t : dt) * Math.sin(a);   // the room it has before it meets a neighbour on its side
      // each lobe leans a little further forward than the one below, so the slits open outwards — more on
      // the outside of the spine's curve, hardly at all (or not) on the inside
      const open = (0.33 * lean) / pairs + sd * curve * dt;
      const len = reach * env(t) * (1 + lop * sd) * rng.range(0.8, 1.1);
      // narrow where it leaves the spine, fullest towards its end: the slit between two lobes ends in a small bay
      const w0 = room * rng.range(0.46, 0.56) * neck, w1 = clamp(room * full + len * Math.min(open, 0.06) * 0.6, w0 * 1.1, room * 1.1) * rng.range(0.94, 1.0);
      polys.push(snip(blade(p.x, p.y, p.a - sd * a, len, w0, w1, { bend: sd * hook * rng.range(0.95, 1.05), cap: rng.range(1.0, 1.5) * round, swell: rng.range(0, 0.05), root: (1.7 * half(t)) / Math.max(0.3, Math.abs(Math.cos(a))) }), rng, 0.3 * cut));
    }
  }
  // the tip: one more lobe that carries the spine on, set a little above the last pair so that it stands clear of them
  const p = at(0.83), wt = dt * rng.range(0.74, 0.86);
  polys.push(snip(blade(p.x, p.y, p.a, 0.17 + reach * 0.12, half(0.83) * 2.4, wt, { bend: curve * 0.2 + rng.range(-0.12, 0.12), cap: rng.range(1.2, 1.6) * round, swell: 0.08, root: half(0.83) * 1.8 }), rng, 0.3 * cut));
  return polys;
}

/**
 * A coral branch: a stout trunk with arms leaving it on alternate sides and turning upwards beside it,
 * the longer arms with a stub of their own; all of one thickness, every end round.
 *   arms    how many arms the trunk carries
 *   girth   thickness, as a share of the trunk's length
 *   spread  angle at which an arm leaves the trunk, radians
 */
export function coral(rng, { arms = 4, girth = 0.12, spread = 0.9, cut = 1 } = {}) {
  const at = (b, s) => b.axis[Math.round(clamp(s, 0, 1) * (b.axis.length - 1))];
  const trunk = blade(0, 0, 0, 1, girth, girth * rng.range(0.95, 1.08), { bend: rng.range(-0.3, 0.3), cap: 1.1, n: 24 }), polys = [snip(trunk, rng, 0.3 * cut)];
  const first = rng.sign();
  for (let i = 0; i < arms; i++) {
    const f = arms > 1 ? i / (arms - 1) : 0, q = at(trunk, lerp(0.15, 0.72, f) + rng.range(-0.025, 0.025)), sd = i % 2 ? -first : first;
    const len = lerp(0.5, 0.3, f) * rng.range(0.85, 1.1);
    const arm = blade(q.x, q.y, q.a + sd * spread * rng.range(0.92, 1.08), len, girth * 0.92, girth * rng.range(0.9, 1.04), { bend: -sd * rng.range(0.35, 0.6), cap: rng.range(1.0, 1.25), n: 16 });
    polys.push(snip(arm, rng, 0.3 * cut));
    if (len > 0.33) { const k = at(arm, rng.range(0.42, 0.56)); polys.push(blade(k.x, k.y, k.a + sd * rng.range(0.8, 1.0), len * rng.range(0.4, 0.5), girth * 0.86, girth * 0.86, { bend: -sd * 0.3, cap: 1.1, n: 8 })); }
  }
  return polys;
}

// ---- plain shapes --------------------------------------------------------------------------------------
/** A disc cut freehand: round, but not from a compass. */
export function disc(rng, { cut = 1 } = {}) {
  const p1 = rng.range(0, TAU), p2 = rng.range(0, TAU), k = 0.012 * Math.min(1.5, cut);
  return [snip(polar((a) => 1 + k * Math.cos(2 * a + p1) + 0.6 * k * Math.cos(3 * a + p2), 96), rng, 0.25 * cut)];
}
/** A pebble: a fat, slightly lopsided oval. */
export function pebble(rng, { squash = rng.range(0.66, 0.86), cut = 1 } = {}) {
  const p1 = rng.range(0, TAU), p2 = rng.range(0, TAU);
  return [snip(polar((a) => 1 + 0.07 * Math.cos(a + p1) * Math.cos(a + p1) + 0.05 * Math.cos(3 * a + p2), 72, squash, rng.range(-0.5, 0.5)), rng, 0.3 * cut)];
}

// ---- the shore -----------------------------------------------------------------------------------------
/**
 * A band of sea, `w` wide and `h` deep below its crests: the upper edge is a row of scallops of unequal
 * width that lean the way the swell runs; the other three sides are straight cuts.
 */
export function wave(rng, { w = 3, h = 0.6, scallops = 5, lift = 0.2, run = 1 } = {}) {
  const ws = []; let tot = 0; for (let i = 0; i < scallops; i++) { const v = rng.range(0.78, 1.3); ws.push(v); tot += v; }
  const top = []; let x = 0;
  for (let i = 0; i < scallops; i++) {
    const ww = (ws[i] / tot) * w, amp = lift * ww * rng.range(0.85, 1.15), sk = run > 0 ? rng.range(0.62, 0.8) : rng.range(1.25, 1.6), m = 14;
    for (let k = i === 0 ? 0 : 1; k <= m; k++) { const u = k / m; top.push([x + ww * u, -amp * Math.pow(Math.sin(Math.PI * Math.pow(u, sk)), 0.82)]); }
    x += ww;
  }
  return [wind(top.concat([[w + rng.range(-0.01, 0.01), h], [rng.range(-0.01, 0.01), h + rng.range(-0.012, 0.012)]]))];
}
/**
 * A bird as it is cut from one snip of paper: two full wings arched over a shallow V, tapering to the
 * tips, one a little longer and higher than the other. About one unit across, centred on the origin.
 */
export function bird(rng, { cut = 1 } = {}) {
  const run = (pts, n = 9) => {                                               // a smooth curve through the points, ends included
    const out = [], cr = (a, b, c, d, t) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
    for (let i = 0; i < pts.length - 1; i++) { const a = pts[Math.max(0, i - 1)], b = pts[i], c = pts[i + 1], d = pts[Math.min(pts.length - 1, i + 2)]; for (let k = 0; k < n; k++) out.push([cr(a[0], b[0], c[0], d[0], k / n), cr(a[1], b[1], c[1], d[1], k / n)]); }
    return out;
  };
  const l = rng.range(0.44, 0.52), r = rng.range(0.46, 0.54), hl = rng.range(0.17, 0.23), hr = rng.range(0.19, 0.26), tl = rng.range(0.0, 0.09), tr = rng.range(-0.04, 0.06), th = rng.range(0.17, 0.2);
  const outline = [
    ...run([[-l, tl], [-l * 0.74, tl - hl * 0.62], [-l * 0.44, -hl], [-l * 0.16, -hl * 0.62], [0, -0.03]]),          // over the left wing, down into the V
    ...run([[0, -0.03], [r * 0.18, -hr * 0.66], [r * 0.46, -hr], [r * 0.76, -hr * 0.56 + tr * 0.4], [r, tr]]),       // up and over the right wing to its tip
    ...run([[r, tr], [r * 0.7, tr - hr * 0.2], [r * 0.4, th - hr * 0.86], [r * 0.14, th * 0.56], [0, th]]),          // back underneath to the breast
    ...run([[0, th], [-l * 0.14, th * 0.56], [-l * 0.4, th - hl * 0.84], [-l * 0.7, tl - hl * 0.18], [-l, tl]]),     // and out under the left wing
  ];
  return [snip(wind(outline), rng, 0.2 * cut)];
}

// ---- the table ------------------------------------------------------------------------------------------
/** A vase, foot at the origin, one unit tall: a round belly, a narrow neck and a lip. `.mouth` is where a stem goes in. */
export function vase(rng, { belly = rng.range(0.3, 0.36), cut = 1 } = {}) {
  const bz = rng.range(0.3, 0.38), nk = rng.range(0.085, 0.11);
  const p = lathe([[0.15, 0], [0.16, 0.012], [belly * 0.86, 0.14], [belly, bz], [belly * 0.82, bz + 0.2], [nk * 1.25, 0.72], [nk, 0.82], [nk * 1.2, 0.93], [nk * 1.75, 1.0]], { lean: rng.range(-0.035, 0.035) });
  const out = [snip(p, rng, 0.3 * cut)]; out.mouth = [0, -0.99]; out.neck = nk;
  return out;
}
/** A bowl on a low foot, rim at y = 0, one unit across. */
export function bowl(rng, { depth = rng.range(0.4, 0.5), cut = 1 } = {}) {
  const n = 40, pts = [], dip = rng.range(0.0, 0.02);
  for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI; pts.push([0.5 * Math.cos(a), depth * Math.pow(Math.sin(a), 0.82)]); }
  pts.push([-0.5, -0.035], [0, -0.035 + dip], [0.5, -0.035]);
  const fw = rng.range(0.15, 0.2);
  return [snip(wind(pts), rng, 0.25 * cut), wind([[-fw, depth * 0.9], [fw, depth * 0.9], [fw * 1.25, depth + 0.075], [-fw * 1.25, depth + 0.075]])];
}
/** A pear standing on the origin, one unit tall, with a stalk. */
export function pear(rng, { cut = 1 } = {}) {
  const p = lathe([[0.1, 0], [0.26, 0.03], [0.345, 0.2], [0.33, 0.4], [0.22, 0.58], [0.15, 0.74], [0.13, 0.86], [0.06, 0.93], [0, 0.94]], { lean: rng.range(-0.06, 0.06), steps: 7 });
  return [snip(p, rng, 0.3 * cut), blade(0.0, -0.9, -Math.PI / 2 + rng.range(-0.5, 0.5), 0.14, 0.032, 0.03, { bend: rng.range(-0.5, 0.5), cap: 0.5, n: 5 })];
}
/** A round fruit with a leaf at the stalk, about one unit across, centred on the origin. */
export function fruit(rng, { cut = 1 } = {}) {
  const p1 = rng.range(0, TAU), sd = rng.sign();
  const body = polar((a) => 0.5 * (1 + 0.025 * Math.cos(2 * a + p1) - 0.035 * Math.pow(Math.max(0, -Math.sin(a)), 6)), 80, rng.range(0.9, 0.97));
  return [snip(body, rng, 0.25 * cut), blade(0.01 * sd, -0.4, -Math.PI / 2 + sd * rng.range(0.55, 0.9), 0.34, 0.15, 0, { bend: sd * 0.5, point: true, swell: 0.07, n: 12 })];
}
/** A lemon lying on its side: an oval drawn out to a nipple at each end. About one unit long. */
export function lemon(rng, { cut = 1 } = {}) {
  return [snip(polar((a) => 0.43 * (1 + 0.2 * Math.pow(Math.abs(Math.cos(a)), 7)), 84, rng.range(0.68, 0.76), 0), rng, 0.25 * cut)];
}
/** A slice: the lower half of a disc with a shallower curve cut out of its top, one unit across. */
export function slice(rng, { thick = rng.range(0.5, 0.62), cut = 1 } = {}) {
  const n = 36, out = [], inn = [];
  for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI; out.push([0.5 * Math.cos(a), 0.5 * Math.sin(a)]); inn.push([0.5 * Math.cos(a), 0.5 * (1 - thick) * Math.sin(a)]); }
  return [snip(wind(out.concat(inn.reverse().slice(1, -1))), rng, 0.25 * cut)];
}

// ---- arranging -------------------------------------------------------------------------------------------
/** A form moved, scaled and turned within a group's own coordinates (a fruit set beside a pear, a second bird behind the first). */
export function move(polys, dx = 0, dy = 0, k = 1, rot = 0) {
  const c = Math.cos(rot), s = Math.sin(rot);
  return polys.map((p) => p.map(([x, y]) => [dx + k * (x * c - y * s), dy + k * (x * s + y * c)]));
}

// ---- placing ---------------------------------------------------------------------------------------------
/**
 * Fit a form into a rectangle of the sheet. The form is turned by `rot` (and mirrored if `flip`), scaled
 * as large as the box [x0, y0, x1, y1] allows (times `fill`) and set in it: `ax`, `ay` say where the spare
 * room goes (0 = form against the left / top, 0.5 = centred, 1 = against the right / bottom).
 * Returns the polygons in sheet coordinates, with `.scale` and `.box` (what the form really covers).
 */
export function place(polys, box, { rot = 0, flip = false, ax = 0.5, ay = 0.5, fill = 1 } = {}) {
  const c = Math.cos(rot), s = Math.sin(rot), f = flip ? -1 : 1;
  const turned = polys.map((p) => p.map(([x, y]) => [x * f * c - y * s, x * f * s + y * c]));
  let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
  for (const p of turned) for (const [x, y] of p) { bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y); }
  const k = fill * Math.min((box[2] - box[0]) / (bx1 - bx0), (box[3] - box[1]) / (by1 - by0));
  const ox = lerp(box[0], box[2] - (bx1 - bx0) * k, ax) - bx0 * k, oy = lerp(box[1], box[3] - (by1 - by0) * k, ay) - by0 * k;
  const out = turned.map((p) => (flip ? p.slice().reverse() : p).map(([x, y]) => [ox + x * k, oy + y * k]));
  out.scale = k; out.box = [ox + bx0 * k, oy + by0 * k, ox + bx1 * k, oy + by1 * k];
  out.at = ([x, y]) => [ox + (x * f * c - y * s) * k, oy + (x * f * s + y * c) * k];
  return out;
}
/** How large `place` would make the form in that box at that turn — to choose the turn that fills the box best. */
export function fitScale(polys, box, rot) {
  const c = Math.cos(rot), s = Math.sin(rot); let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
  for (const p of polys) for (const [x, y] of p) { const X = x * c - y * s, Y = x * s + y * c; bx0 = Math.min(bx0, X); by0 = Math.min(by0, Y); bx1 = Math.max(bx1, X); by1 = Math.max(by1, Y); }
  return Math.min((box[2] - box[0]) / (bx1 - bx0), (box[3] - box[1]) / (by1 - by0));
}
/**
 * `place` for several forms that keep their arrangement (a bowl and the fruit in it): they are fitted as
 * one and handed back separately, in the order given, with the group's `.box`, `.scale` and `.at`.
 */
export function placeGroup(groups, box, opts) {
  const out = place(groups.flat(), box, opts), res = []; let k = 0;
  for (const gp of groups) { res.push(out.slice(k, k + gp.length)); k += gp.length; }
  res.box = out.box; res.scale = out.scale; res.at = out.at;
  return res;
}
