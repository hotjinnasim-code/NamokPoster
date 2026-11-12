// Flow Field — a generative plotter print. Flat bands of matte ink follow an invisible flow field:
// every band is a line of the field with one constant width, lying beside its neighbours at one
// even gap and never touching them. The copy is a stone in the stream: the field runs round it, so
// the type sits in clear paper behind an even moat, and the whole drawing stops at the page margin
// like the image area of a print.
//
// How it is made (all on the CPU, in "sheet units": 1 = the short side):
//   1. the field  — a direction for every point: along the outlines of the copy blocks pushed
//                   outwards, swung either way by slow seeded noise; `eddy` adds one or two still centres
//   2. the bands  — a seed band is walked through the field; after that every band grows neighbours
//                   along both its sides as exact parallel copies set off by the gap, for as long as
//                   the copy still agrees with the field, and their ends walk on through the field.
//                   A grid of buckets remembers every band's edges, so nothing can come too close.
//                   Wide bands go down first, in the middle of the stream; fine lines fill the banks.
//   3. the print  — each band is cut into a few pieces, the pieces are given inks by area, and each
//                   is filled as a polygon on a 2D canvas; the shader adds only the tooth of the paper.
//
// Motifs:  bands (ribbons from hairline to very wide, cut into colour segments) · threads (hundreds of
//          fine lines of one weight, one ink and a handful in a second) · eddy (bands wrap round still centres)
// Palette: bg = paper · colors[0] = dominant ink (about 60% of the inked area) · colors[1] = second ink (30%)
//          colors[2] = accent ink (10%) · colors[3] = optional extra for the odd fine line · ink, accent = type
import { makeNoise, backgroundQuad, canvasTexture, hexLuminance, GLSL_DITHER } from '/skill/assets/web/scene-lib.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export default function build(ctx) {
  const { THREE, scene, palette, params, aspect, seed, rng, width: W, height: H } = ctx;
  const sx = Math.max(aspect, 1), sy = Math.max(1 / aspect, 1), S = Math.min(W, H);          // sheet units → px: × S
  const motif = ['bands', 'threads', 'eddy'].includes(params.motif) ? params.motif : 'bands';
  const threads = motif === 'threads', eddy = motif === 'eddy';
  const P = { density: clamp(params.density ?? 1, 0.5, 2), weight: clamp(params.weight ?? 1, 0.5, 1.8), turbulence: clamp(params.turbulence ?? 1, 0, 2) };
  const noise = makeNoise(seed * 17 + 3), T0 = performance.now();

  // ---- the sheet: the drawing lives inside the page margin (the same margin the type keeps);
  // a footer or header strip cuts that window short
  const print = Math.abs(Math.max(aspect, 1 / aspect) - Math.SQRT2) < 0.004;                  // paper sizes take the wider print margin
  const my = print ? 0.085 : 0.075, mx = my * (aspect > 1 ? 1.2 : 1);
  const win = { x0: mx, y0: my, x1: sx - mx, y1: sy - my };
  const blocks = [];
  for (const [qx0, qy0, qx1, qy1] of ctx.quiet || []) {
    if (!(qx0 <= 0.02 && qx1 >= 0.98)) blocks.push([qx0 * sx, qy0 * sy, qx1 * sx, qy1 * sy]);
    else if (qy1 >= 0.98) win.y1 = Math.min(win.y1, qy0 * sy); else if (qy0 <= 0.02) win.y0 = Math.max(win.y0, qy1 * sy);
  }
  // A block of copy is a stone in the stream: the rectangle grown by the moat, with round corners.
  // Where a stone stands close to an edge of the window the sliver between them stays empty (the
  // stone is taken to reach past that edge), so lines never creep round the back of the copy and box
  // it in. A wider strip is kept only if it is where the layout puts the art (the focus lies in it).
  const fx = ctx.focus.x * sx, fy = ctx.focus.y * sy, A = clamp(ctx.artSize ?? 0.7, 0.3, 1);
  const MOAT = 0.032, RC = 0.06, stones = [];
  for (let [x0, y0, x1, y1] of blocks) {
    const shut = (room, main) => room < 0.11 || (room < 0.22 && !main), inX = fx > x0 && fx < x1, inY = fy > y0 && fy < y1;
    const l = shut(x0 - MOAT - win.x0, inY && fx < x0), r = shut(win.x1 - x1 - MOAT, inY && fx > x1), t = shut(y0 - MOAT - win.y0, inX && fy < y0), b = shut(win.y1 - y1 - MOAT, inX && fy > y1);
    if (l) x0 = -4; if (r) x1 = sx + 4; if (t) y0 = -4; if (b) y1 = sy + 4;
    const rc = Math.min(RC, (x1 - x0) / 2, (y1 - y0) / 2);
    stones.push({ ix0: x0 + rc, iy0: y0 + rc, ix1: x1 - rc, iy1: y1 - rc, r: rc + MOAT, sign: 1,
      box: [Math.max(win.x0, x0 - MOAT), Math.max(win.y0, y0 - MOAT), Math.min(win.x1, x1 + MOAT), Math.min(win.y1, y1 + MOAT)] });
  }
  // distance to a stone's moat line (negative inside); leaves the outward normal in gX, gY.
  // A still centre (eddy) is a stone too: a disc, i.e. a rectangle of no size with a radius.
  let gX = 0, gY = 0;
  const stoneDist = (s, x, y) => {
    const cx = clamp(x, s.ix0, s.ix1), cy = clamp(y, s.iy0, s.iy1), dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy);
    if (l > 1e-7) { gX = dx / l; gY = dy / l; return l - s.r; }
    const a = x - s.ix0, b = s.ix1 - x, c = y - s.iy0, d = s.iy1 - y, m = Math.min(a, b, c, d);
    if (m === a) { gX = -1; gY = 0; } else if (m === b) { gX = 1; gY = 0; } else if (m === c) { gX = 0; gY = -1; } else { gX = 0; gY = 1; }
    return -m - s.r;
  };
  const copyDist = (x, y) => { let d = 9; for (const s of stones) d = Math.min(d, stoneDist(s, x, y)); return d; };
  const inWin = (x, y, m = 0) => x > win.x0 + m && x < win.x1 - m && y > win.y0 + m && y < win.y1 - m;

  // ---- the field. Every stone spreads an influence that fades with distance, and the direction at
  // a point lies along the level lines of the summed influence. Beside one stone those are its
  // outline pushed outwards — parallel to the moat, turning each corner in a wide arc, never running
  // into the copy. Two blocks add up, so the lines pass along both; but two blocks that face each
  // other across the focus are given opposite signs, and the lines run between them like a stream
  // between its banks. Slow seeded noise then swings the direction either way, which makes the long
  // bends; right beside a stone the swing dies out, so the nearest bands lie exactly alongside it.
  // Once the hero band has been walked through this field it becomes a source itself: around it the
  // lines are the hero's own curve pushed outwards, so the whole stream runs truly parallel to it.
  if (stones.length > 1) {
    const a = stones[0].box;
    for (let i = 1; i < stones.length; i++) {
      const b = stones[i].box, ox = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), oy = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
      if ((ox > 0.25 && ((a[3] < fy && fy < b[1]) || (b[3] < fy && fy < a[1]))) || (oy > 0.25 && ((a[2] < fx && fx < b[0]) || (b[2] < fx && fx < a[0])))) stones[i].sign = -1;
    }
  }
  // still centres for `eddy`: one at the focus, sized to the room it has, and a smaller second one
  // where there is space for it. A still centre is a round stone: the bands ring it, and further out
  // the stream wraps round it. (In an eddy all stones share one sign, so that it does.)
  const eyes = [];
  if (eddy) {
    for (const s of stones) s.sign = 1;
    const room = clamp(Math.min(copyDist(fx, fy), fx - win.x0, win.x1 - fx, fy - win.y0, win.y1 - fy), 0.08, 0.5);       // how far the focus is from anything
    const r1 = clamp(0.28 * room, 0.03, 0.085) * rng.range(0.9, 1.1), two = rng() < 0.55 && A > 0.5;
    eyes.push({ ix0: fx, iy0: fy, ix1: fx, iy1: fy, r: r1, sign: 1.5 });
    for (let t = 0; t < 60 && two && eyes.length < 2; t++) {
      const a = rng.range(0, Math.PI * 2), r2 = r1 * rng.range(0.5, 0.65), d = r1 + r2 + rng.range(0.3, 0.42), x = fx + Math.cos(a) * d, y = fy + Math.sin(a) * d;
      if (inWin(x, y, r2 + 0.1) && copyDist(x, y) > r2 + 0.12) eyes.push({ ix0: x, iy0: y, ix1: x, iy1: y, r: r2, sign: 1.5 });
    }
  }
  const obst = [...stones, ...eyes], nS = obst.length, sd = new Float64Array(nS), snx = new Float64Array(nS), sny = new Float64Array(nS);
  const theta0 = rng.range(0, Math.PI), AMP = (eddy ? 0.5 : 0.72) * P.turbulence, F = 0.72, REACH = 0.16, D0 = 0.01, D1 = 0.34;
  let DX = 1, DY = 0, GX = 1, GY = 0, Z0 = rng.range(0, 40), hero = null, heroSign = 1;
  const dirAt = (x, y) => {
    let gx = Math.cos(theta0), gy = Math.sin(theta0), dmin = 9, hd = 9, hx = 0, hy = 0;
    for (let i = 0; i < nS; i++) { sd[i] = stoneDist(obst[i], x, y); snx[i] = gX; sny[i] = gY; if (sd[i] < dmin) dmin = sd[i]; }
    if (hero) {                                                                      // the hero band: nearest point, and the normal on its left there
      const px = hero.px, py = hero.py, n = hero.n; let m = 1e9, k = 0;
      for (let i = 0; i < n; i += 4) { const dx = px[i] - x, dy = py[i] - y, d2 = dx * dx + dy * dy; if (d2 < m) { m = d2; k = i; } }
      const a = Math.max(0, k - 2), b = Math.min(n - 1, k + 2), tx = px[b] - px[a], ty = py[b] - py[a], tl = Math.hypot(tx, ty) || 1;
      hd = Math.max(0, Math.sqrt(m) - hero.hw); hx = -ty / tl; hy = tx / tl; if (hd < dmin) dmin = hd;
    }
    if (nS || hero) {
      gx = 0; gy = 0; for (let i = 0; i < nS; i++) { const w = obst[i].sign * Math.exp(-(sd[i] - dmin) / REACH); gx += w * snx[i]; gy += w * sny[i]; }
      if (hero) { const w = heroSign * Math.exp(-(hd - dmin) / REACH); gx += w * hx; gy += w * hy; }
    }
    const l = Math.hypot(gx, gy); if (l < 1e-5) return;                              // dead centre between two banks: keep the last direction
    GX = gx; GY = gy;
    const dl = AMP * sstep(D0, D1, dmin) * (1.6 * noise.noise3(x * F, y * F, Z0) + 0.5 * noise.noise3(x * F * 2.2 + 7, y * F * 2.2, Z0 + 3.1));
    const c = Math.cos(dl), s = Math.sin(dl), tx = -gy / l, ty = gx / l;
    DX = tx * c - ty * s; DY = tx * s + ty * c;
  };

  // ---- how densely the sheet is packed: full in the middle of the stream (along the hero band
  // through the focus; round the still centres of an eddy), thinning to fine, widely spaced lines
  // at its banks and towards the copy
  const rho = (x, y) => {
    let dh = Math.hypot(x - fx, y - fy);
    if (eddy) { dh = 9; for (const e of eyes) dh = Math.min(dh, stoneDist(e, x, y) * (e === eyes[0] ? 1 : 1.5)); }
    else if (hero) { let m = 1e9; for (let i = 0; i < hero.n; i += 6) { const dx = hero.px[i] - x, dy = hero.py[i] - y, d2 = dx * dx + dy * dy; if (d2 < m) m = d2; } dh = Math.max(0, Math.sqrt(m) - hero.hw); }
    return clamp((1 - sstep(0.02, (eddy ? 0.16 : 0.1) + (eddy ? 0.36 : 0.27) * A, dh)) * (0.3 + 0.7 * sstep(0, 0.16, copyDist(x, y))), 0, 1);
  };
  const G0 = (threads ? 0.006 : eddy ? 0.0068 : 0.0052) / P.density, THIN = threads ? 0.9 : eddy ? 2.8 : 2.2;
  const gapFor = (r) => G0 * (1 + THIN * Math.pow(1 - r, 1.2));

  // ---- what is already on the sheet: every band leaves points along its two edges (and across its
  // width) in a grid of buckets; a new band may not come nearer to any of them than its gap
  const CELL = 0.01, GW = Math.ceil(sx / CELL) + 8, GH = Math.ceil(sy / CELL) + 8, head = new Int32Array(GW * GH).fill(-1);
  let cap = 1 << 17, np = 0, PX = new Float32Array(cap), PY = new Float32Array(cap), NXT = new Int32Array(cap), LID = new Int32Array(cap), LIX = new Int32Array(cap);
  let dead = new Uint8Array(4096), nextId = 0;
  const add = (x, y, id, ix) => {
    if (np === cap) { cap *= 2; const g = (a, T) => { const b = new T(cap); b.set(a); return b; }; PX = g(PX, Float32Array); PY = g(PY, Float32Array); NXT = g(NXT, Int32Array); LID = g(LID, Int32Array); LIX = g(LIX, Int32Array); }
    const c = clamp(Math.floor(y / CELL) + 4, 0, GH - 1) * GW + clamp(Math.floor(x / CELL) + 4, 0, GW - 1);
    PX[np] = x; PY[np] = y; LID[np] = id; LIX[np] = ix; NXT[np] = head[c]; head[c] = np++;
  };
  // is anything within R of (x, y)? A band's own points count only when they are far along it (a ring closing on itself)
  const hit = (x, y, R, id, ix, skip) => {
    const c0 = clamp(Math.floor((x - R) / CELL) + 4, 0, GW - 1), c1 = clamp(Math.floor((x + R) / CELL) + 4, 0, GW - 1), r0 = clamp(Math.floor((y - R) / CELL) + 4, 0, GH - 1), r1 = clamp(Math.floor((y + R) / CELL) + 4, 0, GH - 1), R2 = R * R;
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) for (let i = head[r * GW + c]; i >= 0; i = NXT[i]) {
      const dx = PX[i] - x, dy = PY[i] - y; if (dx * dx + dy * dy >= R2) continue;
      const li = LID[i]; if (dead[li] || (li === id && Math.abs(LIX[i] - ix) < skip)) continue;
      return true;
    }
    return false;
  };
  const DS = 0.0025, RS = 0.004, OUT = 0.012, EASE = 0.35, FID = Math.sin((12 * Math.PI) / 180);
  // the front edge of a band at (x, y) heading along (tx, ty): is every point of it at least g from everything else?
  // (bands may run a little way past the window — they are trimmed there when printed)
  const rowClear = (x, y, tx, ty, hw, g, id, ix, skip) => {
    if (x < win.x0 - 2 * hw - OUT || x > win.x1 + 2 * hw + OUT || y < win.y0 - 2 * hw - OUT || y > win.y1 + 2 * hw + OUT) return false;
    const n = Math.max(1, Math.ceil((2 * hw) / RS));
    for (let j = 0; j <= n; j++) {
      const o = -hw + (2 * hw * j) / n, px = x - ty * o, py = y + tx * o;
      for (const s of obst) if (stoneDist(s, px, py) < 0) return false;
      if (hit(px, py, g, id, ix, skip)) return false;
    }
    return true;
  };
  const addRow = (x, y, tx, ty, hw, id, ix) => {
    const n = Math.max(1, Math.ceil((2 * hw) / RS));
    for (let j = 0; j <= n; j++) { const o = -hw + (2 * hw * j) / n; add(x - ty * o, y + tx * o, id, ix); }
  };
  const rminOf = (hw) => Math.max(1.8 * hw, 1.4 * (2 * hw + G0));               // the tightest bend a band of this width may take

  // ---- one band. It starts from a core — a single seed point, or a run of points set off from a
  // neighbour — which goes on the sheet as it is; then both ends walk on through the field until
  // something is in the way. Where a set-off run hands over to the field the heading eases round over
  // a few steps, so there is never a kink.
  const lines = [], queue = [], MAXN = 4000;
  const finish = (cx, cy, hw, g, minLen) => {
    const id = nextId++; if (id >= dead.length) { const d = new Uint8Array(dead.length * 2); d.set(dead); dead = d; }
    const m = cx.length, skip = Math.ceil((4 * hw + 6 * g) / DS), maxTurn = DS / rminOf(hw);
    let hx0, hy0, hx1, hy1;                                                          // headings out of the first and the last point of the core
    if (m === 1) { dirAt(cx[0], cy[0]); hx1 = DX; hy1 = DY; hx0 = -DX; hy0 = -DY; addRow(cx[0], cy[0], DX, DY, hw, id, 0); } else {
      for (let i = 0; i < m; i++) {
        const a = Math.max(0, i - 1), b = Math.min(m - 1, i + 1); let tx = cx[b] - cx[a], ty = cy[b] - cy[a]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        addRow(cx[i], cy[i], tx, ty, hw, id, i);
        if (i === 0) { hx0 = -tx; hy0 = -ty; } if (i === m - 1) { hx1 = tx; hy1 = ty; }
      }
    }
    const ends = [[], []];
    for (let e = 0; e < 2; e++) {
      let x = e ? cx[0] : cx[m - 1], y = e ? cy[0] : cy[m - 1], vx = e ? hx0 : hx1, vy = e ? hy0 : hy1; const arr = ends[e];
      for (let k = 1; k <= MAXN; k++) {
        dirAt(x, y); let ax = DX, ay = DY; if (ax * vx + ay * vy < 0) { ax = -ax; ay = -ay; }
        dirAt(x + ax * DS * 0.5, y + ay * DS * 0.5); let bx = DX, by = DY; if (bx * vx + by * vy < 0) { bx = -bx; by = -by; }
        const ez = m === 1 ? 1 : Math.min(1, EASE + 0.05 * k); bx = vx + (bx - vx) * ez; by = vy + (by - vy) * ez; const bl = Math.hypot(bx, by) || 1; bx /= bl; by /= bl;
        if (Math.abs(vx * by - vy * bx) > maxTurn) break;                           // too tight a bend for a band this wide
        const nx = x + bx * DS, ny = y + by * DS, ix = e ? -k : m - 1 + k;
        if (!rowClear(nx, ny, bx, by, hw, g, id, ix, skip)) break;
        addRow(nx, ny, bx, by, hw, id, ix); arr.push(nx, ny); x = nx; y = ny; vx = bx; vy = by;
      }
    }
    const n = m + (ends[0].length + ends[1].length) / 2;
    if ((n - 1) * DS < minLen) { dead[id] = 1; return null; }
    const px = new Float32Array(n), py = new Float32Array(n); let j = 0;
    for (let i = ends[1].length - 2; i >= 0; i -= 2) { px[j] = ends[1][i]; py[j++] = ends[1][i + 1]; }
    for (let i = 0; i < m; i++) { px[j] = cx[i]; py[j++] = cy[i]; }
    for (let i = 0; i < ends[0].length; i += 2) { px[j] = ends[0][i]; py[j++] = ends[0][i + 1]; }
    const L = { id, hw, g, px, py, n, closed: n * DS > 0.1 && Math.hypot(px[0] - px[n - 1], py[0] - py[n - 1]) < g + 4 * DS };
    lines.push(L); queue.push(L); return L;
  };
  const seedLine = (x, y, hw, g, minLen) => {
    if (!inWin(x, y)) return null;
    dirAt(x, y); if (!rowClear(x, y, DX, DY, hw, g, -1, 0, 0)) return null;
    return finish([x], [y], hw, g, minLen);
  };
  const drop = (L) => { dead[L.id] = 1; lines.splice(lines.indexOf(L), 1); queue.splice(queue.indexOf(L), 1); };

  // ---- widths: a few wide, some medium, many narrow, hairlines to fill (class 3 … 0)
  const WK = P.weight * (eddy ? 1.1 : 1), HAIR = 0.00115 * (threads ? P.weight : 1);
  const widthOf = (c) => (c === 3 ? rng.range(0.019, 0.034) * WK : c === 2 ? rng.range(0.0075, 0.014) * WK : c === 1 ? rng.range(0.003, 0.0055) * WK : HAIR * (threads ? 1 : rng.range(0.95, 1.35)));
  const minLenOf = (c, r) => [0.06, 0.09, 0.18, 0.32][c] * (1 + 2.2 * (1 - r));        // short pieces are discarded, the more readily the sparser the place
  const pickClass = (r) => {
    if (threads) return 0;
    const u = rng(), pw = (eddy ? 0.36 : 0.3) * sstep(eddy ? 0.5 : 0.62, 0.95, r), pm = (eddy ? 0.4 : 0.36) * sstep(0.22, 0.7, r), pn = (eddy ? 0.2 : 0.3) + 0.1 * r;
    return u < pw ? 3 : u < pw + pm ? 2 : u < pw + pm + pn ? 1 : 0;
  };

  // ---- neighbours: a band grows a new band along each of its sides, set off by exactly the gap, so
  // the two run perfectly parallel. Where the copy of the curve would stray from the field, bend too
  // tightly or meet something, it is cut; what room is left is tried again with a narrower band.
  const spawn = (L) => {
    const n = L.n, px = L.px, py = L.py, tx = new Float32Array(n), ty = new Float32Array(n), ox = new Float32Array(n), oy = new Float32Array(n), ok = new Uint8Array(n);
    for (let i = 0; i < n; i++) { const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1); const dx = px[b] - px[a], dy = py[b] - py[a], l = Math.hypot(dx, dy) || 1; tx[i] = dx / l; ty[i] = dy / l; }
    for (const side of [1, -1]) {
      const used = new Uint8Array(n);
      let rs = 0, rn = 0; for (let i = 0; i < n; i += 8) { rs += rho(px[i] - ty[i] * side * (L.hw + 0.015), py[i] + tx[i] * side * (L.hw + 0.015)); rn++; }
      const r = rs / rn, g = gapFor(r);
      for (let cls = pickClass(r); cls >= 0; cls--) {
        const hw = widthOf(cls), off = (L.hw + g * 1.01 + hw) * side, minLen = minLenOf(cls, r), kMax = 1 / rminOf(hw);
        // the copy of the curve, and where it folds back on itself or bends tighter than this width allows
        for (let i = 0; i < n; i++) { ox[i] = px[i] - ty[i] * off; oy[i] = py[i] + tx[i] * off; }
        ok.fill(1);
        for (let i = 1; i < n - 1; i++) {
          const ax = ox[i] - ox[i - 1], ay = oy[i] - oy[i - 1], bx = ox[i + 1] - ox[i], by = oy[i + 1] - oy[i], al = Math.hypot(ax, ay), bl = Math.hypot(bx, by);
          if (ax * tx[i] + ay * ty[i] < 0.2 * DS || Math.abs(ax * by - ay * bx) / (al * bl * 0.5 * (al + bl) + 1e-12) > kMax) ok[i] = 0;
        }
        const free = (i) => {
          if (used[i] || !ok[i]) return false;
          dirAt(ox[i], oy[i]); if (Math.abs(tx[i] * DY - ty[i] * DX) > FID) return false;         // the field has turned away from this copy of the curve
          return rowClear(ox[i], oy[i], tx[i], ty[i], hw, g * 0.985, -1, 0, 0);
        };
        // a ring is walked from a place where it is blocked (or from anywhere), so that a free run is never split at the ring's own joint
        let j0 = 0, whole = false;
        if (L.closed) { j0 = -1; for (let i = 0; i < n; i += 3) if (!free(i)) { j0 = i; break; } if (j0 < 0) { j0 = rng.int(0, n - 1); whole = true; } }
        const at = (j) => (j0 + j) % n;
        // runs of free points become bands, one at a time (each is checked afresh: the one before may have walked on into its place)
        for (let a = 0; a < n; a++) {
          if (!free(at(a))) continue;
          const xs = [ox[at(a)]], ys = [oy[at(a)]]; let b = a, len = 0, x = xs[0], y = ys[0], need = DS;
          while (b + 1 < n - (whole ? 4 : 0) && free(at(b + 1))) {                   // gather the run, re-spaced to exactly DS
            b++; const qx = ox[at(b)], qy = oy[at(b)]; let d = Math.hypot(qx - x, qy - y); len += d;
            while (d >= need) { x += ((qx - x) / d) * need; y += ((qy - y) / d) * need; xs.push(x); ys.push(y); d = Math.hypot(qx - x, qy - y); need = DS; }
            need -= d; x = qx; y = qy;
          }
          if (len >= minLen * 0.6 && xs.length > 2 && finish(xs, ys, hw, g, minLen)) for (let i = Math.max(0, a - 4); i <= Math.min(n - 1, b + 4); i++) used[at(i)] = 1;
          a = b;
        }
      }
    }
  };
  let qi = 0;
  const fill = () => { while (qi < queue.length) spawn(queue[qi++]); };

  // ---- seeds. A fine line hugs each stone, so the moat is drawn by a line. Then the hero: in an
  // eddy a bold ring round each still centre; otherwise the widest band, walked through the focus
  // (the longest of a few tries). Everything else grows from these.
  for (const s of stones) {
    const hw = widthOf(0), cx = clamp(fx, s.ix0, s.ix1), cy = clamp(fy, s.iy0, s.iy1), d = Math.hypot(fx - cx, fy - cy) || 1;
    seedLine(cx + ((fx - cx) / d) * (s.r + hw + 0.0005), cy + ((fy - cy) / d) * (s.r + hw + 0.0005), hw, gapFor(0), 0.15);
  }
  if (eddy) {
    // (a ring is as bold as its radius lets it be)
    for (const e of eyes) { const hw = Math.min((e === eyes[0] ? rng.range(0.013, 0.018) : rng.range(0.008, 0.011)) * WK, (0.92 * (e.r - 1.4 * G0)) / 1.8), a = rng.range(0, Math.PI * 2); seedLine(e.ix0 + Math.cos(a) * (e.r + hw + 0.0005), e.iy0 + Math.sin(a) * (e.r + hw + 0.0005), hw, G0, 0.1); }
  } else {
    // several fields are tried (the noise is shifted): the hero is the walk that is long and bends
    // well — about a quarter turn in all, in one or two sweeps — and that field is kept
    const hw = threads ? HAIR : rng.range(0.027, 0.035) * WK; let best = -1e9, bestZ = Z0, pick = null;
    for (let t = 0; t < 12; t++) {
      Z0 = rng.range(0, 40);
      const L = seedLine(fx + (t % 3 ? rng.gauss() * 0.04 : 0), fy + (t % 3 ? rng.gauss() * 0.04 : 0), hw, G0, 0.2); if (!L) continue;
      let turn = 0; for (let i = 8; i + 8 < L.n; i += 8) { const ax = L.px[i] - L.px[i - 8], ay = L.py[i] - L.py[i - 8], bx = L.px[i + 8] - L.px[i], by = L.py[i + 8] - L.py[i]; turn += Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by)); }
      const score = Math.min(L.n * DS, 1.3) - 0.55 * Math.abs(turn - 1.35);
      if (score > best) { if (pick) drop(pick); pick = L; best = score; bestZ = Z0; } else drop(L);
    }
    Z0 = bestZ;
    if (pick) {                                                                      // which way the hero's left side faces in the field it was walked through
      const k = pick.n >> 1, tx = pick.px[k + 1] - pick.px[k - 1], ty = pick.py[k + 1] - pick.py[k - 1];
      dirAt(pick.px[k], pick.py[k]); heroSign = GX * -ty + GY * tx >= 0 ? 1 : -1; hero = pick;
    }
  }
  fill();
  // room the neighbours never reached (the field had turned away): start new bands there and grow again
  for (let round = 0; round < 12; round++) {
    let got = 0;
    for (let k = 0; k < 600; k++) {
      const x = rng.range(win.x0, win.x1), y = rng.range(win.y0, win.y1), r = rho(x, y), g = gapFor(r);
      for (let cls = Math.min(2, pickClass(r)); cls >= 0; cls--) if (seedLine(x, y, widthOf(cls), g, minLenOf(cls, r))) { got++; break; }
    }
    fill(); if (!got) break;
  }

  // ---- pieces: every band is cut along its length into one to four pieces with a paper gap between them
  // (threads stay whole)
  const segs = [];
  for (const L of lines) {
    const len = (L.n - 1) * DS, w = 2 * L.hw, fine = w < 0.004;
    const nSeg = threads || len < Math.max(0.2, 5 * w) ? 1 : clamp(Math.round(len / rng.range(0.3, 0.62)), fine ? 1 : 2, fine ? 2 : 4), gs = (Math.max(L.g, Math.min(1.5 * L.g, 0.2 * w)) * 1.1) / DS;
    const cuts = [0]; for (let k = 1; k < nSeg; k++) cuts.push(((L.n - 1) * (k + rng.range(-0.28, 0.28))) / nSeg); cuts.push(L.n - 1);
    let prev = null;
    for (let k = 0; k < nSeg; k++) {
      const a = cuts[k] + (k ? gs / 2 : 0), b = cuts[k + 1] - (k < nSeg - 1 ? gs / 2 : 0); if (b - a < 2) continue;
      const sg = { L, a, b, area: (b - a) * DS * w, ink: 0, prev, next: null }; if (prev) prev.next = sg; prev = sg; segs.push(sg);
    }
  }
  // ---- inks. The broad pieces share the inks out by area — about 60% the dominant, 30% the second,
  // 10% the accent — largest first, none taking an ink that has no budget left for it, neighbours
  // along one band differing; a few middling pieces are printed in a darker tint of the paper itself.
  // Fine lines are mostly the dominant ink. `threads` is one ink, with a handful of lines in a second.
  const C = palette.colors?.length ? palette.colors : [palette.ink];
  const paper = new THREE.Color(palette.bg), lb = hexLuminance(palette.bg), dark = lb < 0.2;
  const contrast = (hex) => { const l = hexLuminance(hex); return (Math.max(l, lb) + 0.05) / (Math.min(l, lb) + 0.05); };
  // a fourth colour, if the palette has one: close to the paper it stands in for the tint; otherwise it is kept for the odd fine line
  const quiet4 = C.length > 3 && contrast(C[3]) < 2.2, extra = C.length > 3 && !quiet4;
  const tint = quiet4 ? C[3] : '#' + paper.clone().lerp(new THREE.Color(dark ? '#ffffff' : '#000000'), dark ? 0.13 : 0.1).getHexString();
  const inks = [C[0], C[1 % C.length], C[2 % C.length], tint, C[3] ?? C[0]];
  if (threads) {
    const second = contrast(inks[2]) >= 2.2 || contrast(inks[2]) >= contrast(inks[1]) ? 2 : 1, pick = new Set(rng.shuffle(lines.filter((L) => L.n * DS > 0.25)).slice(0, rng.int(5, 8)));
    for (const q of segs) q.ink = pick.has(q.L) ? second : 0;
  } else {
    const share = [0.6, 0.27, 0.085, 0.045], broad = segs.filter((q) => q.L.hw >= 0.003), total = broad.reduce((s, q) => s + q.area, 0), left = share.map((v) => v * total); let tintLeft = 4;
    for (const q of broad.sort((p, r) => r.area - p.area)) {
      const w = 2 * q.L.hw, cand = [];
      for (let i = 0; i < 4; i++) {
        if (left[i] <= 0 || q.area > left[i] * 1.25 + 1e-9) continue;
        if ((q.prev && q.prev.ink === i) || (q.next && q.next.ink === i)) continue;
        if (i === 3 && (w < 0.008 || w > 0.03 || tintLeft <= 0)) continue;
        cand.push(i);
      }
      let ink = 0;
      if (cand.length) { let u = rng() * cand.reduce((s, i) => s + left[i], 0); ink = cand[cand.length - 1]; for (const i of cand) { if (u < left[i]) { ink = i; break; } u -= left[i]; } }
      else ink = [0, 1, 2].filter((i) => !(q.prev && q.prev.ink === i) && !(q.next && q.next.ink === i)).sort((i, j) => left[j] - left[i])[0] ?? 0;
      q.ink = ink; left[ink] -= q.area; if (ink === 3) tintLeft--;
    }
    for (const q of segs) {
      if (q.L.hw >= 0.003) continue;
      const u = rng(); let ink = u < 0.8 ? 0 : u < 0.94 ? 1 : u < 0.97 ? (contrast(inks[2]) >= 1.8 ? 2 : 1) : extra ? 4 : 0;
      if (q.prev && q.prev.ink === ink) ink = ink === 0 ? 1 : 0;
      q.ink = ink;
    }
  }

  // ---- the print: each piece is a filled polygon — the centre line pushed out by half the width on
  // either side, ends cut square — trimmed by the window like a print by its mask
  const tex = canvasTexture(W, H, (g) => {
    g.fillStyle = palette.bg; g.fillRect(0, 0, W, H);
    g.save(); g.beginPath(); g.rect(win.x0 * S, win.y0 * S, (win.x1 - win.x0) * S, (win.y1 - win.y0) * S); g.clip();
    for (const { L, a, b, ink } of segs) {
      const at = (t) => { const i = Math.min(L.n - 2, Math.floor(t)), f = t - i; return [lerp(L.px[i], L.px[i + 1], f), lerp(L.py[i], L.py[i + 1], f)]; };
      const pts = [at(a)]; for (let i = Math.ceil(a + 0.01); i <= Math.floor(b - 0.01); i++) pts.push([L.px[i], L.py[i]]); pts.push(at(b));
      const lf = [], rt = [];
      for (let i = 0; i < pts.length; i++) {
        const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(pts.length - 1, i + 1)]; let tx = p1[0] - p0[0], ty = p1[1] - p0[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        lf.push([(pts[i][0] - ty * L.hw) * S, (pts[i][1] + tx * L.hw) * S]); rt.push([(pts[i][0] + ty * L.hw) * S, (pts[i][1] - tx * L.hw) * S]);
      }
      g.fillStyle = inks[ink]; g.beginPath(); g.moveTo(lf[0][0], lf[0][1]); for (let i = 1; i < lf.length; i++) g.lineTo(lf[i][0], lf[i][1]);
      for (let i = rt.length - 1; i >= 0; i--) g.lineTo(rt[i][0], rt[i][1]); g.closePath(); g.fill();
    }
    g.restore();
    if (params.debug) {
      let bad = 0; const badL = new Set();
      for (const L of lines) for (let e = Math.ceil((L.hw + 0.02) / DS), i = e; i < L.n - e; i += 2) if (hit(L.px[i], L.py[i], L.hw + 0.001, L.id, i, 1e9)) { bad++; badL.add(L.id); g.fillStyle = '#00ff00'; g.fillRect(L.px[i] * S - 2, L.py[i] * S - 2, 4, 4); }
      g.fillStyle = '#c00000'; g.font = `${Math.round(S * 0.018)}px sans-serif`;
      g.fillText(`bad ${bad} in ${badL.size} · ${lines.length} lines · ${segs.length} pieces · ${np} pts · ${Math.round(performance.now() - T0)} ms · ${ctx.layout?.layout}`, S * 0.02, S * 0.03);
    }
  });

  // ---- on the sheet: the drawing, plus the faint tooth of the paper (about ±1.5%) and nothing else
  scene.add(backgroundQuad(/* glsl */`
    varying vec2 vUv; uniform sampler2D uTex; uniform float uGrain, uCell;
    ${GLSL_DITHER}
    float h21(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
    void main(){
      gl_FragColor = vec4(texture2D(uTex, vUv).rgb, 1.0);
      #include <colorspace_fragment>
      float n = h21(gl_FragCoord.xy) + h21(floor(gl_FragCoord.xy / uCell) + 17.0) - 1.0;      // fine grain plus a slightly coarser fleck
      gl_FragColor.rgb += n * uGrain + ditherNoise(gl_FragCoord.xy);
    }`, { uTex: { value: tex }, uGrain: { value: dark ? 0.008 : 0.015 }, uCell: { value: Math.max(1, Math.round(S / 1100)) } }));
  ctx.frame({ radius: 1, fov: 30, dir: [0, 0, 1] });
}
