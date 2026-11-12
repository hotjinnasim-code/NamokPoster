// transit/metro.js — the metro motif: three to five lines on an integer grid, crossing at a few
// interchanges, one of which is the venue.
//
// The map is not a random walk. It is a hand-designed skeleton on a grid of C × R cells, sized to the
// room the copy left; the seed picks the skeleton, deals the colours and names the stations, and the
// skeleton is mirrored so that its open ends face the free edges of the page. Every run is
// horizontal, vertical or at 45°; lines meet at grid points; where two lines share a corridor they
// run side by side one pitch apart.
import { svg } from '/skill/assets/web/html-lib.js';
import { r2, clamp, room, fitBox, quietPx, inflate, overlap, inside, segHitsRect, roundPath, octilinear, capsule, capsuleBox, bullet, measureFlag, FLAG_SIZES, drawFlag, faint, sameInk, adv, inkOf, txt } from './kit.js';

// ------------------------------------------------------------------ skeletons (grid units, y down)
// A skeleton is { min: [C, R], build(C, R, dl, n) } and build returns
//   { lines: [{ pts, ends: [a, b], express, bare, closed, badge }], hubs: [{ pts, on, venue, prefs }] }.
//   ends:    'stop' = a terminus with the line's bullet · 'exit' = runs on to the page edge when that edge is free
//   express: the line has no stations of its own between interchanges · bare: runs (by index) without stations
//   closed:  a loop line (the last point joins the first); `badge` = where its bullet sits on the line
//   hubs:    interchanges. pts = the points a capsule joins, one per line that runs through side by
//            side; on = the lines that call there (on[k] is the line of pts[k]; the rest cross it);
//            `venue` marks the event's place, `prefs` the quadrants around it that the skeleton keeps clear
// `dl` is the pitch between two lines that share a corridor, in cells; n = how many lines are wanted.
// Coordinates need not be whole numbers, but every run must be octilinear (checked when drawn).

/**
 * "Triangle": a straight trunk (1) with a second line riding it through the centre (4), a line
 * straight down through the venue (2), and a line that comes down beside it and cuts across at 45°
 * (3). The three crossings make a triangle; the quadrant above the trunk, beside line 2, stays empty
 * for the venue's flag. On the far side the lines leave the sheet at even intervals. A fifth line
 * is a second straight run along the foot.
 */
const triangle = {
  min: [10, 9],
  build(C, R, dl, n) {
    const dx = C >= 13 && R >= 12 ? 3 : 2;                    // the triangle's leg, in cells
    const five = n >= 5 && R >= 3 * dx + 4;
    const yv = five ? R - 3 * dx - 1 : clamp(Math.round((R - 2 * dx) * 0.6), 3, R - 2 * dx - 1);
    const xv = clamp(Math.round(C * 0.56), dx + 4, C - dx - 2), x1 = xv - dx, yf = yv + 3 * dx;
    const lines = [
      { pts: [[0, yv], [C, yv]], ends: ['stop', 'exit'] },
      { pts: [[xv, five ? yf + 1 : R], [xv, 0]], ends: ['stop', 'exit'] },
      { pts: [[x1, 0], [x1, yv + 1], [xv + dx - 1, yv + 2 * dx], [C, yv + 2 * dx]], ends: ['stop', 'exit'] },
      { pts: [[0, yv + 2], [1, yv + 2], [3 - dl, yv + dl], [xv + 1, yv + dl], [xv + 1 + dx - dl, yv + dx], [C, yv + dx]], ends: ['stop', 'exit'], express: true },
    ];
    const hubs = [
      { pts: [[xv, yv], [xv, yv + dl]], on: [0, 3, 1], venue: true, prefs: [[1, -1], [-1, -1]] },
      { pts: [[x1, yv], [x1, yv + dl]], on: [0, 3, 2] },
      { pts: [[xv, yv + 1 + dx]], on: [1, 2] },
    ];
    if (five) {
      lines.push({ pts: [[x1 - 1, yf], [C, yf]], ends: ['stop', 'exit'] });
      hubs.push({ pts: [[xv, yf]], on: [4, 1] });
    }
    return { lines, hubs };
  },
};

/**
 * "Junction": two lines converge on one long diagonal and part again — line 1 comes down from the
 * top and leaves to the side, line 2 comes in from the side and leaves downwards. The venue is the
 * station they share on the diagonal, with the open corner above it for the flag. A third line
 * crosses line 1 on the far side, a fourth runs along the foot and meets lines 2 and 3.
 */
const junction = {
  min: [10, 9],
  build(C, R, dl) {
    const q = dl * Math.SQRT2;                                  // line 2 sits this far below line 1 on the diagonal
    const k = R >= 11 ? 5 : 4, xe = 2 + k, ye = 1 + k;          // the diagonal runs k cells; line 1 turns at (xe, ye)
    const x3 = clamp(Math.round(C * 0.8), xe + 2, C - 2), y4 = Math.min(R - 2, ye + 3), xm = 4;
    return {
      lines: [
        { pts: [[2, 0], [2, 1], [xe, ye], [C, ye]], ends: ['stop', 'exit'] },
        { pts: [[0, 2], [3 - q, 2], [xe, ye + q], [xe, y4 + 1]], ends: ['exit', 'stop'], bare: [1] },
        { pts: [[x3, R], [x3, 0]], ends: ['stop', 'exit'] },
        { pts: [[1, y4], [C, y4]], ends: ['stop', 'exit'] },
      ],
      hubs: [
        { pts: [[xm, xm - 1], [xm - q / 2, xm - 1 + q / 2]], on: [0, 1], venue: true, prefs: [[1, -1], [-1, 1]] },
        { pts: [[x3, ye]], on: [0, 2] },
        { pts: [[xe, y4]], on: [1, 3] },
        { pts: [[x3, y4]], on: [2, 3] },
      ],
    };
  },
};

/**
 * "Ring": a loop line as a long octagon, a straight line through it and a third that comes down
 * through it with one 45° step. The two meet inside the loop, off its centre: that is the venue,
 * and the loop frames its flag. The loop has no ends, so its bullet sits on the line.
 */
const ring = {
  min: [10, 9],
  build(C, R) {
    const k = 2, xa = 1, xb = C - 1, ya = 1, yb = R - 1, y2 = ya + 3, x3 = xb - 3;
    return {
      lines: [
        { pts: [[xa + k, ya], [xb - k, ya], [xb, ya + k], [xb, yb - k], [xb - k, yb], [xa + k, yb], [xa, yb - k], [xa, ya + k]], closed: true, badge: [xa + k / 2, yb - k / 2] },
        { pts: [[0, y2], [C, y2]], ends: ['stop', 'exit'] },
        { pts: [[x3 - 2, R], [x3 - 2, y2 + 3], [x3, y2 + 1], [x3, 0]], ends: ['stop', 'exit'] },
      ],
      hubs: [
        { pts: [[x3, y2]], on: [1, 2], venue: true, prefs: [[-1, -1], [1, 1]] },
        { pts: [[xa, y2]], on: [0, 1] }, { pts: [[xb, y2]], on: [0, 1] },
        { pts: [[x3, ya]], on: [0, 2] }, { pts: [[x3 - 2, yb]], on: [0, 2] },
      ],
    };
  },
};

/**
 * "Flat": for a strip of a room, four or five cells high. A straight trunk, a second line that rides it
 * through the venue and drops away again, and one short line straight across. The flag stands
 * above the trunk.
 */
const flat = {
  min: [10, 4],
  build(C, R, dl) {
    const ty = R * 0.57, by = R - 0.45, drop = by - ty - dl, xv = Math.round(C * 0.5);
    return {
      lines: [
        { pts: [[0, ty], [C, ty]], ends: ['stop', 'exit'] },
        { pts: [[xv, R - 0.15], [xv, 0.35]], ends: ['stop', 'exit'] },
        { pts: [[0, by], [1, by], [1 + drop, ty + dl], [xv + 1.5, ty + dl], [xv + 1.5 + drop, by], [C, by]], ends: ['stop', 'exit'], express: true },
      ],
      hubs: [{ pts: [[xv, ty], [xv, ty + dl]], on: [0, 2, 1], venue: true, prefs: [[1, -1], [-1, -1]] }],
    };
  },
};
const SKELETONS = [triangle, junction, ring];

// ------------------------------------------------------------------ the motif
export default async function metro(env) {
  const { ctx, root, pal, U, W, H, f, rng } = env;
  const rm = room(ctx), quiet = quietPx(ctx);

  // ---- the grid: cells on the short side, the long side follows the room's shape
  const shortU = Math.min(rm.w, rm.h) / U, A = rm.w / rm.h, tall = A < 0.74, a = tall ? 1 / A : A;
  if (shortU < 12) { ctx.note('transit: the copy leaves no room for a map in this layout — use a layout with a larger art area (left, top, band) or trim the copy.'); return; }
  const strip = shortU < 38;                                             // a strip of a room: the flat skeleton
  let C, R;
  if (strip) { R = shortU < 24 ? 4 : 5; C = clamp(Math.round(R * a), 10, 18); }
  else if (a >= 1.42) { R = 9; C = clamp(Math.round(R * a), 13, 20); }  // a wide map
  else if (a >= 1) { R = 10; C = Math.round(R * a); }                    // squarish
  else { C = 10; R = Math.round(C / a); }
  const gw = tall ? R : C, gh = tall ? C : R;                           // the grid as it stands on the page
  const box = fitBox(ctx, rm, gw / gh, 0.94);
  const c = box.w / gw;                                                  // one cell, px
  const t = clamp(c * 0.2, U * 1.0, U * 1.5);                           // line thickness
  const pitch = t * 1.42, dl = pitch / c;                               // two lines side by side
  const bend = c * 0.85;                                                 // the one radius of every bend
  const rb = Math.max(U * 1.4, t * 1.2);                                // a bullet's radius
  const hubR = t * 0.8, ringW = Math.max(U * 0.24, t * 0.2), venR = t * 1.28, venRing = ringW * 1.25;
  const stride = c < U * 4.6 ? 2 : 1;                                   // small cells: a station every other grid point
  const P = (g) => [box.x + g[0] * c, box.y + g[1] * c];                // grid → px
  const clear = t / 2 + U * 4;                                           // an open end keeps this far from the copy on its way off the sheet
  const want = clamp(Math.round(Number(env.params.lines ?? 4)) || 4, 3, 5);
  // the seed picks the skeleton (a draft may name one: "map": "triangle" | "junction" | "ring")
  const able = SKELETONS.filter((s) => C >= s.min[0] && R >= s.min[1]), picked = able[Math.floor(rng() * 9973) % Math.max(1, able.length)] || triangle;
  const sk = (strip ? flat : { triangle, junction, ring }[env.params.map] || picked).build(C, R, dl, want);
  const nLines = Math.min(want, sk.lines.length);
  const lim = inflate(ctx.safe, U * 0.2);

  /**
   * The skeleton under one mirroring, worked out in full but not drawn: lines in px with their ends
   * decided, interchanges, stations, bullets and the venue's flag — and a score for how well it sits.
   */
  const plan = (flipX, flipY) => {
    const tf = ([x, y]) => { let X = flipX ? C - x : x, Y = flipY ? R - y : y; if (tall) [X, Y] = [Y, X]; return [X, Y]; };
    const tv = ([x, y]) => { let X = flipX ? -x : x, Y = flipY ? -y : y; if (tall) [X, Y] = [Y, X]; return [X, Y]; };
    let open = 0;
    const lines = sk.lines.slice(0, nLines).map((l, i) => {
      const grid = l.pts.map(tf), ends = l.closed ? [] : [...l.ends];
      if (!octilinear(grid, l.closed)) ctx.note(`transit: line ${i + 1} of the skeleton is not octilinear`, 'error');
      // an end marked 'exit' runs on off the sheet when nothing stands between it and the page edge
      for (const end of l.closed ? [] : [0, 1]) {
        if (ends[end] !== 'exit') continue;
        const n = grid.length, g = end ? grid[n - 1] : grid[0], q = end ? grid[n - 2] : grid[1], p = P(g);
        const d = [Math.sign(r2(g[0] - q[0])), Math.sign(r2(g[1] - q[1]))];
        ends[end] = 'stop';
        if (d[0] && d[1]) continue;                                     // only straight off an edge
        const out = d[0] ? [d[0] > 0 ? W + t * 2 : -t * 2, p[1]] : [p[0], d[1] > 0 ? H + t * 2 : -t * 2];
        const sweep = { x: Math.min(p[0], out[0]) - (d[1] ? clear : 0), y: Math.min(p[1], out[1]) - (d[0] ? clear : 0), w: Math.abs(out[0] - p[0]) + (d[1] ? 2 * clear : 0), h: Math.abs(out[1] - p[1]) + (d[0] ? 2 * clear : 0) };
        if (quiet.some((qr) => overlap(sweep, qr))) continue;
        ends[end] = 'off'; open++;
        const far = [(out[0] - box.x) / c, (out[1] - box.y) / c];       // the end, moved off the sheet (grid units)
        if (end) grid[n - 1] = far; else grid[0] = far;
      }
      return { i, grid, px: grid.map(P), ends, express: !!l.express, bare: l.bare || [], closed: !!l.closed, badge: l.badge ? tf(l.badge) : null };
    });
    const hubs = sk.hubs.map((h) => ({ venue: !!h.venue, prefs: (h.prefs || []).map(tv), grid: h.pts.filter((_, k) => h.on[k] < nLines).map(tf), n: h.on.filter((k) => k < nLines).length }))
      .filter((h) => h.n > 1 && h.grid.length).map((h) => ({ ...h, px: h.grid.map(P) }));
    const venue = hubs.find((h) => h.venue) || hubs[0];

    // stations: one at every grid point of a run (every other one when the cells are small), clear of
    // the bends, the ends and the interchanges; the rhythm carries on to the page edge
    const hubPts = hubs.flatMap((h) => h.grid), stations = [];
    for (const l of lines) {
      if (l.express) continue;
      const g = l.grid, n = g.length, badge = l.badge ? [l.badge] : [];
      for (let s = 0; s < (l.closed ? n : n - 1); s++) {
        if (l.bare.includes(s)) continue;
        const a0 = g[s], b0 = g[(s + 1) % n], dx = b0[0] - a0[0], dy = b0[1] - a0[1];
        const along = Math.abs(dx) > 1e-6 ? 0 : 1, len = Math.abs(along ? dy : dx), lo = Math.min(a0[along], b0[along]), hi = lo + len;
        const dir = Math.abs(dx) < 1e-6 ? 'v' : Math.abs(dy) < 1e-6 ? 'h' : (dx * dy > 0 ? 'd' : 'u');   // d: "\" · u: "/"
        // keep clear of a bend by 0.6 of a cell, of a bullet by 0.9
        const m0 = !l.closed && s === 0 ? (l.ends[0] === 'stop' ? 0.9 : 0) : 0.6, m1 = !l.closed && s === n - 2 ? (l.ends[1] === 'stop' ? 0.9 : 0) : 0.6;
        const from = a0[along] < b0[along] ? [m0, m1] : [m1, m0];
        for (let v = Math.ceil(lo + from[0] - 1e-6); v <= hi - from[1] + 1e-6; v++) {
          const k = (v - a0[along]) / (b0[along] - a0[along]), p = [a0[0] + dx * k, a0[1] + dy * k];
          if (hubPts.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.7) || badge.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.9)) continue;
          if (stride > 1 && (Math.round(p[0]) + Math.round(p[1])) % stride) continue;
          stations.push({ line: l, grid: p, px: P(p), dir });
        }
      }
    }
    const bullets = [];
    const addBullet = (l, p) => bullets.push({ line: l, p, box: { x: p[0] - rb, y: p[1] - rb, w: 2 * rb, h: 2 * rb } });
    for (const l of lines) {
      for (const end of [0, 1]) if (l.ends[end] === 'stop') addBullet(l, end ? l.px[l.px.length - 1] : l.px[0]);
      if (l.badge) addBullet(l, P(l.badge));                           // a loop has no end: its bullet sits on the line
    }

    // labels go where no line, marker, bullet or other label is — and never under the copy
    const segs = lines.flatMap((l) => [...l.px.slice(1).map((p, k) => [l.px[k], p]), ...(l.closed ? [[l.px[l.px.length - 1], l.px[0]]] : [])]);
    const taken = [...bullets.map((b) => b.box), ...hubs.map((h) => capsuleBox(h.px, (h === venue ? venR + venRing : hubR + ringW)))];
    const free = (b, pad) => {
      if (!inside(b, lim)) return false;
      const bb = inflate(b, pad);
      if (quiet.some((q) => overlap(inflate(b, U * 1.6), q)) || taken.some((o) => overlap(bb, o))) return false;
      const bs = inflate(b, pad + t / 2);
      return !segs.some((s) => segHitsRect(s[0], s[1], bs));
    };
    // the venue's flag: the quadrants the skeleton keeps clear first, then the others; smaller if it must
    const mb = capsuleBox(venue.px, venR + venRing);
    const quads = [...venue.prefs, [1, -1], [1, 1], [-1, -1], [-1, 1]].filter((q, k, all) => all.findIndex((o) => o[0] === q[0] && o[1] === q[1]) === k);
    const at = (m, [sx, sy]) => ({ m, x: sx > 0 ? mb.x + mb.w + U * 0.7 : mb.x - U * 0.7 - m.w, y: sy < 0 ? mb.y - U * 0.6 - m.h : mb.y + mb.h + U * 0.6, align: sx > 0 ? 'left' : 'right' });
    let flag = null, score = open;
    // one line as large as it goes, then the name on two lines, then smaller
    for (const [rank, [size, rows]] of FLAG_SIZES.entries()) {
      const m = measureFlag(env, env.venue, env.when, size * U, rows);
      if (!m) continue;
      const k = quads.findIndex((q) => { const b = at(m, q); return free({ x: b.x, y: b.y, w: m.w, h: m.h }, U * 0.7); });
      if (k < 0) continue;
      flag = at(m, quads[k]); score += (FLAG_SIZES.length - rank) * 0.7 + (k < venue.prefs.length ? 1.5 : 0);
      break;
    }
    if (!flag) {
      // nowhere clear: set it small in the first quadrant, pulled inside the margins
      const m = measureFlag(env, env.venue, env.when, U * 1.7, 2) || measureFlag(env, env.venue, env.when, U * 1.7, 1);
      flag = at(m, quads[0]); flag.forced = true; score -= 100;
      flag.x = clamp(flag.x, lim.x, lim.x + lim.w - m.w); flag.y = clamp(flag.y, lim.y, lim.y + lim.h - m.h);
    }
    taken.push({ x: flag.x, y: flag.y, w: flag.m.w, h: flag.m.h });
    return { lines, hubs, venue, stations, bullets, flag, free, taken, mb, score };
  };
  const tries = rng.shuffle([[false, false], [true, false], [false, true], [true, true]]).map(([fx, fy]) => plan(fx, fy));
  const { lines, hubs, venue, stations, bullets, flag, free, taken, mb } = tries.reduce((best, p) => (p.score > best.score + 1e-6 ? p : best), tries[0]);
  // ---- the colours are dealt by the seed, under three rules: two lines that share a corridor never
  // take the same colour, two that cross rather not, and the venue's own colour (the accent) keeps
  // off the lines that call at the venue. A palette with fewer colours than lines repeats one.
  const side = [], cross = [], atVenue = new Set();
  for (const h of sk.hubs) {
    const on = h.on.filter((k) => k < nLines), together = on.slice(0, h.pts.length);
    for (let i = 0; i < on.length; i++) for (let j = i + 1; j < on.length; j++) (together.includes(on[i]) && together.includes(on[j]) ? side : cross).push([on[i], on[j]]);
    if (h.venue) on.forEach((k) => atVenue.add(k));
  }
  const has = (list, a, b) => list.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  const inks = rng.shuffle(env.lineColors.slice(0, Math.max(1, Math.min(nLines, env.lineColors.length))));
  for (const l of [...lines].sort((p, q) => (atVenue.has(q.i) ? 1 : 0) - (atVenue.has(p.i) ? 1 : 0))) {
    const cost = (col) => lines.reduce((sum, o) => sum + (o.color !== col ? 0 : has(side, l.i, o.i) ? 10 : has(cross, l.i, o.i) ? 2 : 0.6), 0) + (atVenue.has(l.i) && sameInk(col, env.mark) ? 3 : 0);
    l.color = inks.reduce((best, col) => (cost(col) < cost(best) - 1e-9 ? col : best), inks[0]);
  }

  // ---- draw: lines, stations, interchanges
  const gLines = svg('g'), gDots = svg('g'), gHubs = svg('g'), gEnds = svg('g'), gText = svg('g');
  root.append(gLines, gDots, gHubs, gEnds, gText);
  for (const l of [...lines].reverse()) {
    const d = roundPath(l.px, bend, l.closed);
    // a line too pale for the page (white on yellow) is drawn with an outline in the ink
    if (faint(l.color, pal.bg)) gLines.append(svg('path', { d, fill: 'none', stroke: pal.ink, 'stroke-width': r2(t + U * 0.36), 'stroke-linejoin': 'round' }));
    gLines.append(svg('path', { d, fill: 'none', stroke: l.color, 'stroke-width': r2(t), 'stroke-linejoin': 'round' }));
  }
  const dotR = t * 0.27;
  for (const s of stations) gDots.append(svg('circle', { cx: r2(s.px[0]), cy: r2(s.px[1]), r: r2(dotR), fill: faint(s.line.color, pal.bg) ? pal.ink : pal.bg }));
  for (const h of hubs) if (h !== venue) capsule(gHubs, h.px, hubR, ringW, pal.bg, pal.ink);
  // the venue: a larger capsule in the accent, a page-coloured pip where each line calls
  capsule(gHubs, venue.px, venR, venRing, env.mark, pal.ink);
  for (const p of venue.px) gHubs.append(svg('circle', { cx: r2(p[0]), cy: r2(p[1]), r: r2(t * 0.36), fill: pal.bg }));

  // ---- bullets at the ends that stay on the sheet: the line's number (or letter)
  const marks = env.ko || rng() < 0.5 ? ['1', '2', '3', '4', '5'] : ['A', 'B', 'C', 'D', 'E'];
  for (const b of bullets) bullet(gEnds, b.p[0], b.p[1], rb, b.line.color, marks[b.line.i], f.num, pal, faint(b.line.color, pal.bg));

  // ---- the venue's flag
  if (flag.forced) ctx.note('transit: the venue label has no clear spot in this layout and may touch a line — try another layout or a shorter venue name.');
  drawFlag(env, gText, env.venue, env.when, flag.m, flag.x, flag.y, flag.align);

  // ---- other stations take a short name from the copy: spread out, each beside its dot on the open side
  const nameSize = Math.max(U * 1.5, Math.min(U * 1.75, c * 0.27)), ink = inkOf(env.ko ? '가을장' : 'HEA', f.name, nameSize);
  const off = t / 2 + U * 0.75, named = [];
  const spots = (s, w) => {
    const [x, y] = s.px, above = { x: x - w / 2, y: y - off - ink.asc, w, h: ink.asc, tx: x, ty: y - off, anchor: 'middle' }, below = { x: x - w / 2, y: y + off, w, h: ink.asc, tx: x, ty: y + off + ink.asc, anchor: 'middle' };
    const right = { x: x + off, y: y - ink.asc / 2, w, h: ink.asc, tx: x + off, ty: y + ink.asc / 2, anchor: 'start' }, left = { x: x - off - w, y: y - ink.asc / 2, w, h: ink.asc, tx: x - off, ty: y + ink.asc / 2, anchor: 'end' };
    return s.dir === 'h' ? [above, below] : s.dir === 'v' ? [right, left] : [right, left, above, below];
  };
  const inBox = (s) => s.grid[0] > 0.5 && s.grid[0] < gw - 0.5 && s.grid[1] > 0.5 && s.grid[1] < gh - 0.5;
  const order = rng.shuffle(stations.filter(inBox)).sort((p, q) => (p.dir === 'h' ? 0 : 1) - (q.dir === 'h' ? 0 : 1));
  const vc = [mb.x + mb.w / 2, mb.y + mb.h / 2];
  for (const name of strip ? env.names.slice(0, 1) : env.names) {
    const w = adv(name, f.name, nameSize, 0.01);
    for (const s of order) {
      if (s.name || Math.hypot(s.px[0] - vc[0], s.px[1] - vc[1]) < c * 1.8 || named.some((o) => Math.hypot(s.px[0] - o.px[0], s.px[1] - o.px[1]) < c * 2.6 || o.line === s.line)) continue;
      // its ringed dot is wider than the line: keep it off the flag and the bullets too
      const dot = { x: s.px[0] - t - U * 1.2, y: s.px[1] - t - U * 1.2, w: 2 * (t + U * 1.2), h: 2 * (t + U * 1.2) };
      if (taken.some((o) => overlap(dot, o))) continue;
      const spot = spots(s, w).find((b) => free(b, U * 0.55));
      if (!spot) continue;
      s.name = name; named.push(s);
      taken.push({ x: spot.x, y: spot.y, w: spot.w, h: spot.h });
      // a named station is a ringed dot, so the name has something to belong to
      capsule(gDots, [s.px], t * 0.52, ringW * 0.8, pal.bg, pal.ink);
      txt(gText, name, spot.tx, spot.ty, f.name, nameSize, { anchor: spot.anchor, fill: pal.ink, tr: 0.01 });
      break;
    }
  }
}
