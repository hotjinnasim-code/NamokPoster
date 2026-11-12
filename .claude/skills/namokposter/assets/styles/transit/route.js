// transit/route.js — the route motif: one line that winds across the box in long straight runs and
// 45° bends, with five to seven numbered stops. The last stop is the venue: marked in the accent and
// flagged with its name, the date and time under it. Reads as "the way there".
//
// The path is one of four hand-designed shapes, chosen by the shape of the room: a single step (a
// very wide room), a hairpin, an S of three runs, or four runs (a tall room). Every turn is made of
// 45° bends of one radius. The seed mirrors the shape and sets the number of stops.
import { svg, contrast } from '/skill/assets/web/html-lib.js';
import { r2, clamp, room, fitBox, quietPx, inflate, overlap, inside, segHitsRect, roundPath, capsule, measureFlag, FLAG_SIZES, drawFlag, sameInk, adv, inkOf, txt } from './kit.js';

/** The path in cells (y down), from the first stop to the venue. C × R is the box; m = the margin the stops need. */
function pathFor(C, R, m) {
  const A = C / R;
  if (A > 1.9) {
    // a step: a long run, one 45° drop, a second run — the venue at the low end
    const d = R - 2 * m, l = C - 2 * m - d, a = l * 0.56;
    return [[m, m], [m + a, m], [m + a + d, R - m], [C - m, R - m]];
  }
  // runs joined by octagonal turns: 2 = a hairpin, 3 = an S, 4 for a tall room
  const runs = A >= 1.25 ? 2 : A >= 0.62 ? 3 : 4, gap = (R - 2 * m) / (runs - 1), d = Math.min(1.5, gap * 0.36);
  const pts = [[m, m]];
  for (let i = 0; i < runs; i++) {
    const y = m + i * gap, right = i % 2 === 0, xo = right ? C - m : m, xi = right ? C - m - d : m + d;
    if (i < runs - 1) pts.push([xi, y], [xo, y + d], [xo, y + gap - d], [xi, y + gap]);
    else pts.push([right ? C - m : m, y]);
  }
  return pts;
}

export default async function route(env) {
  const { ctx, root, pal, U, f, rng } = env;
  const rm = room(ctx), quiet = quietPx(ctx);
  if (Math.min(rm.w, rm.h) < U * 12) { ctx.note('transit: the copy leaves no room for the route in this layout — use a layout with a larger art area (left, top, band) or trim the copy.'); return; }
  const A = clamp(rm.w / rm.h, 0.5, 2.7);
  const box = fitBox(ctx, rm, A, 0.94);
  // cells: about nine on the short side (fewer in a flat room, where the step wants long runs)
  const R = A > 1.9 ? 5 : A >= 1 ? 9 : 9 / A, C = R * A, c = box.w / C;
  const t = clamp(c * 0.27, U * 1.3, U * 2.2);                          // the line
  const rs = Math.max(U * 1.7, t * 1.0), ringW = Math.max(U * 0.26, t * 0.16);   // a stop
  const rv = rs * 1.42;                                                  // the venue
  const bend = c * 0.8;
  const m = (rv + ringW) / c + 0.12;                                     // keep the end stops inside the box
  const base = pathFor(C, R, m);
  const lim = inflate(ctx.safe, U * 0.2);
  const nStops = clamp(Math.round(Number(env.params.stops)) || rng.int(5, 7), 3, 9);
  const P = (g) => [box.x + g[0] * c, box.y + g[1] * c];

  /** the path under one mirroring, with its stops and the venue's flag — worked out, not drawn */
  const plan = (flipX, flipY) => {
    const px = base.map(([x, y]) => P([flipX ? C - x : x, flipY ? R - y : y]));
    // stops: as even along the line as its shape allows — each on a tidy spot of a straight run (its
    // middle, or thirds and so on of a long one), never on a bend
    const segs = px.slice(1).map((p, k) => [px[k], p]), lens = segs.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1])), total = lens.reduce((s, l) => s + l, 0);
    const anchors = [];
    let run = 0;
    segs.forEach(([a, b], i) => {
      const n = Math.max(1, Math.round(lens[i] / (c * 2.1)));
      const dir = Math.abs(b[1] - a[1]) < 1e-6 ? 'h' : Math.abs(b[0] - a[0]) < 1e-6 ? 'v' : 'd';
      for (let j = 0; j < n; j++) {
        // the first run starts on a stop and the last ends on one; the other spots sit inside their run
        const u = i === 0 ? j / (n - 0.5) : i === segs.length - 1 ? (j + 0.5) / (n - 0.5) : (j + 0.5) / n;
        anchors.push({ s: run + u * lens[i], p: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], dir });
      }
      run += lens[i];
    });
    const stops = [], nS = Math.min(nStops, anchors.length);              // a short line holds fewer stops than asked for
    let from = 0;
    for (let k = 0; k < nS; k++) {
      const want = (k / (nS - 1)) * total, left = nS - 1 - k;
      let best = from;
      for (let i = from; i < anchors.length - left; i++) if (Math.abs(anchors[i].s - want) < Math.abs(anchors[best].s - want)) best = i;
      if (k === nS - 1) best = anchors.length - 1;
      stops.push({ ...anchors[best], n: k + 1 });
      from = best + 1;
    }
    const venue = stops[stops.length - 1], v = venue.p;
    const taken = stops.map((s) => { const r = (s === venue ? rv : rs) + ringW; return { x: s.p[0] - r, y: s.p[1] - r, w: 2 * r, h: 2 * r }; });
    const free = (b, pad) => {
      if (!inside(b, lim)) return false;
      const bb = inflate(b, pad);
      if (quiet.some((q) => overlap(inflate(b, U * 1.6), q)) || taken.some((o) => overlap(bb, o))) return false;
      const bs = inflate(b, pad + t / 2);
      return !segs.some((s) => segHitsRect(s[0], s[1], bs));
    };
    // the flag: over or under the venue with one edge on the stop's edge, or beside it
    const R2 = rv + ringW, g = U * 0.8;
    const inL = v[0] < box.x + box.w / 2, up = v[1] > box.y + box.h / 2;   // which way lies the inside of the box
    const spots = (mm) => {
      const L = { x: v[0] - R2, align: 'left' }, Rt = { x: v[0] + R2 - mm.w, align: 'right' }, ya = v[1] - R2 - g - mm.h, yb = v[1] + R2 + g;
      const [a, b] = inL ? [L, Rt] : [Rt, L], [y1, y2] = up ? [ya, yb] : [yb, ya];
      return [{ ...a, y: y1 }, { ...a, y: y2 }, { ...b, y: y1 }, { ...b, y: y2 }, { x: v[0] + R2 + g, y: v[1] - mm.fh / 2, align: 'left' }, { x: v[0] - R2 - g - mm.w, y: v[1] - mm.fh / 2, align: 'right' }];
    };
    let flag = null, score = 0;
    for (const [rank, [size, rows]] of FLAG_SIZES.entries()) {
      const mm = measureFlag(env, env.venue, env.when, size * U, rows);
      if (!mm) continue;
      const k = spots(mm).findIndex((b) => free({ x: b.x, y: b.y, w: mm.w, h: mm.h }, U * 0.7));
      if (k < 0) continue;
      flag = { m: mm, ...spots(mm)[k] }; score = (FLAG_SIZES.length - rank) * 0.7 - k * 0.2;
      break;
    }
    if (!flag) {
      const mm = measureFlag(env, env.venue, env.when, U * 1.7, 2) || measureFlag(env, env.venue, env.when, U * 1.7, 1);
      flag = { m: mm, ...spots(mm)[0], forced: true }; score = -100;
      flag.x = clamp(flag.x, lim.x, lim.x + lim.w - mm.w); flag.y = clamp(flag.y, lim.y, lim.y + lim.h - mm.h);
    }
    taken.push({ x: flag.x, y: flag.y, w: flag.m.w, h: flag.m.h });
    return { px, stops, venue, flag, free, taken, score };
  };
  const tries = rng.shuffle([[false, false], [true, false], [false, true], [true, true]]).map(([fx, fy]) => plan(fx, fy));
  const { px, stops, venue, flag, free, taken } = tries.reduce((best, p) => (p.score > best.score + 1e-6 ? p : best), tries[0]);

  // ---- draw: the line, its stops, the venue
  // the line takes one of the palette's stronger colours: a pale yellow alone does not carry a sheet
  // — and not the accent, which is the venue's
  const strong = env.lineColors.filter((col) => contrast(col, pal.bg) >= 2.4 && !sameInk(col, env.mark));
  const color = rng.pick(strong.length ? strong.slice(0, 3) : env.lineColors.slice(0, 1));
  const gLine = svg('g'), gStops = svg('g'), gText = svg('g');
  root.append(gLine, gStops, gText);
  gLine.append(svg('path', { d: roundPath(px, bend), fill: 'none', stroke: color, 'stroke-width': r2(t), 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  const numSize = rs * 1.16;
  for (const s of stops) {
    const here = s === venue, r = here ? rv : rs;
    capsule(gStops, [s.p], r, here ? ringW * 1.25 : ringW, here ? env.mark : pal.bg, pal.ink);
    const size = here ? numSize * 1.3 : numSize, mk = String(s.n), ink = inkOf(mk, f.num, size);
    txt(gStops, mk, s.p[0], s.p[1] + ink.asc / 2 - ink.desc / 2, f.num, size, { anchor: 'middle', fill: here ? (env.onMark) : pal.ink });
  }
  if (flag.forced) ctx.note('transit: the venue label has no clear spot in this layout and may touch the line — try another layout or a shorter venue name.');
  drawFlag(env, gText, env.venue, env.when, flag.m, flag.x, flag.y, flag.align);

  // ---- a few stops on the way take a word of the headline, in the order it is read
  const nameSize = Math.max(U * 1.5, Math.min(U * 1.8, c * 0.26)), ink = inkOf(env.ko ? '가을장' : 'HEA', f.name, nameSize), off = rs + ringW + U * 0.7;
  const words = env.names, mid = stops.slice(0, -1);
  let from = 0;
  words.forEach((name, k) => {
    const w = adv(name, f.name, nameSize, 0.01);
    // the k-th word wants the stop that far along the way; take the first stop from there on with a clear side
    const want = Math.round((k * (mid.length - 1)) / Math.max(1, words.length));
    for (let i = Math.max(from, want); i < mid.length; i++) {
      const [x, y] = mid[i].p;
      const above = { x: x - w / 2, y: y - off - ink.asc, w, h: ink.asc, tx: x, ty: y - off, anchor: 'middle' }, below = { x: x - w / 2, y: y + off, w, h: ink.asc, tx: x, ty: y + off + ink.asc, anchor: 'middle' };
      const right = { x: x + off, y: y - ink.asc / 2, w, h: ink.asc, tx: x + off, ty: y + ink.asc / 2, anchor: 'start' }, left = { x: x - off - w, y: y - ink.asc / 2, w, h: ink.asc, tx: x - off, ty: y + ink.asc / 2, anchor: 'end' };
      const spot = (mid[i].dir === 'h' ? [below, above] : [right, left, below, above]).find((b) => free(b, U * 0.5));
      if (!spot) continue;
      taken.push({ x: spot.x, y: spot.y, w: spot.w, h: spot.h });
      txt(gText, name, spot.tx, spot.ty, f.name, nameSize, { anchor: spot.anchor, fill: pal.ink, tr: 0.01 });
      from = i + 1;
      break;
    }
  });
}
