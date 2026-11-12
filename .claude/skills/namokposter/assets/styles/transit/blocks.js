// transit/blocks.js — the blocks motif: a street map from above. City blocks as flat tinted shapes
// with paper-coloured streets between them, on a slightly irregular grid; one 45° avenue cut through
// it; a river as one broad calm band, crossed by bridges; a park; one main road in the accent; and
// a map pin on the venue's block, flagged with its name.
//
// The city fills the field the copy left (ctx.field()) and runs off the page wherever that field
// reaches the edge; towards the copy it ends on a clean line of whole blocks. Everything is plain
// polygons — the blocks are cut by the avenue and the river geometrically, not with masks.
//
// Palette: colors[0] = water · colors[1] = park · the blocks are tints of the ink · accent = main road, pin, flag
import { svg, mix } from '/skill/assets/web/html-lib.js';
import { r2, clamp, measureFlag, FLAG_SIZES, adv, inkOf, txt, overlap, inflate, sameInk } from './kit.js';

/** the part of a convex polygon where nx·x + ny·y ≤ d */
function clipHalf(poly, nx, ny, d) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], da = nx * a[0] + ny * a[1] - d, db = nx * b[0] + ny * b[1] - d;
    if (da <= 0) out.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) { const k = da / (da - db); out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]); }
  }
  return out;
}
/** a convex polygon minus a strip (the band |n·p − d| < hw): the piece on each side */
const cutStrip = (poly, [nx, ny], d, hw) => [clipHalf(poly, nx, ny, d - hw), clipHalf(poly, -nx, -ny, -(d + hw))].map(tidy).filter((p) => p.length >= 3);
/** a cut that passes through a corner leaves the same point twice: keep one */
const tidy = (p) => p.filter((q, i) => { const o = p[(i + p.length - 1) % p.length]; return Math.hypot(q[0] - o[0], q[1] - o[1]) > 0.05; });
const area = (p) => Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0)) / 2;
const bbox = (p) => { const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }; };
/** path data for a polygon with its corners eased by r */
function roundPoly(p, r) {
  const n = p.length; let d = '';
  for (let i = 0; i < n; i++) {
    const a = p[(i + n - 1) % n], b = p[i], c = p[(i + 1) % n];
    const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
    if (l1 < 1e-3 || l2 < 1e-3) continue;
    const t1 = Math.min(r, l1 * 0.42), t2 = Math.min(r, l2 * 0.42);
    const p1 = [b[0] - (b[0] - a[0]) / l1 * t1, b[1] - (b[1] - a[1]) / l1 * t1], p2 = [b[0] + (c[0] - b[0]) / l2 * t2, b[1] + (c[1] - b[1]) / l2 * t2];
    d += `${d ? 'L' : 'M'}${r2(p1[0])} ${r2(p1[1])}Q${r2(b[0])} ${r2(b[1])} ${r2(p2[0])} ${r2(p2[1])}`;
  }
  return d + 'Z';
}
const rectPoly = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

export default async function blocks(env) {
  const { ctx, root, pal, U, W, H, f, rng } = env;
  const F = ctx.field({ gap: U * 3.2 });
  const S = ctx.safe;
  // the field is pulled inside the margins on the sides that face the copy; it bleeds where it reaches the page edge
  const x0 = F.edges.left ? -U * 2 : Math.max(F.x, S.x), x1 = F.edges.right ? W + U * 2 : Math.min(F.x + F.w, S.x + S.w);
  const y0 = F.edges.top ? -U * 2 : Math.max(F.y, S.y), y1 = F.edges.bottom ? H + U * 2 : Math.min(F.y + F.h, S.y + S.h);
  const fw = x1 - x0, fh = y1 - y0, short = Math.min(fw, fh);
  if (short < U * 16) { ctx.note('transit: the copy leaves no room for a street map in this layout — use a layout with a larger art area (left, top, band) or trim the copy.'); return; }
  const flipX = rng() < 0.5, flipY = rng() < 0.5;

  // ---- the grid: columns and rows of slightly different widths; one street is the main road
  const cell = clamp(Math.sqrt(fw * fh) / 7.2, U * 8, U * 13), sw = U * 0.95, mainW = U * 2.7;
  const cuts = (from, to, size, openStart, openEnd) => {
    const ws = []; let s = 0;
    while (s < to - from - size * 0.35) { const w = size * rng.pick([0.78, 1, 1, 1.18, 1.42]); ws.push(w); s += w; }
    // towards the copy the grid ends exactly on the field's edge; towards the page edge it may overshoot
    const k = openStart && openEnd ? 1 : (to - from) / s, out = [openStart && !openEnd ? to - s : from];
    for (const w of ws) out.push(out[out.length - 1] + w * k);
    return out;
  };
  const xs = cuts(x0, x1, cell, F.edges.left, F.edges.right), ys = cuts(y0, y1, cell * 0.8, F.edges.top, F.edges.bottom);
  const nx = xs.length - 1, ny = ys.length - 1;
  // the main road: a horizontal street below the middle (the river takes an upper corner), the full width of the field
  const mainRow = clamp(Math.round(ny * (flipY ? 0.52 : 0.64)), 1, ny - 1), mainY = ys[mainRow];
  const gapY = (j) => (j === mainRow ? mainW : sw);

  // ---- strips at 45°: the avenue one way, the river the other, so that the avenue bridges it
  const SQ = Math.SQRT1_2, sx = flipX ? -1 : 1;
  const nAve = [SQ * sx, SQ], nRiv = [SQ * sx, -SQ];                     // unit normals; the strips run along x∓y = const
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  // the river crosses the corner that lies up-and-away (mirrored with the seed); the avenue passes off-centre the other way
  const cornerX = sx > 0 ? x1 : x0, rivReach = short * rng.range(0.42, 0.52), rivW = clamp(short * 0.1, U * 5.5, U * 9);
  const dRiv = nRiv[0] * (cornerX - sx * rivReach) + nRiv[1] * y0;        // through the point `rivReach` along the top edge from the corner
  const dAve = nAve[0] * (cx - sx * fw * rng.range(0.1, 0.2)) + nAve[1] * (cy + fh * rng.range(-0.04, 0.1));
  const aveW = U * 2.1;

  // ---- blocks: grid cells, some merged with a neighbour; then cut by the strips
  const used = Array.from({ length: ny }, () => new Array(nx).fill(false)), rects = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (used[j][i]) continue;
    let i1 = i, j1 = j; const roll = rng();
    if (roll < 0.15 && i + 1 < nx && !used[j][i + 1]) i1 = i + 1;
    else if (roll < 0.25 && j + 1 < ny && j + 1 !== mainRow && !used[j + 1][i]) j1 = j + 1;
    for (let b = j; b <= j1; b++) for (let a = i; a <= i1; a++) used[b][a] = true;
    rects.push({ i, j, i1, j1, x0: xs[i] + sw / 2, x1: xs[i1 + 1] - sw / 2, y0: ys[j] + gapY(j) / 2, y1: ys[j1 + 1] - gapY(j1 + 1) / 2 });
  }
  const inStrip = (r, n, d, hw) => { const ds = rectPoly(r.x0, r.y0, r.x1, r.y1).map((p) => n[0] * p[0] + n[1] * p[1] - d); return Math.min(...ds) < hw && Math.max(...ds) > -hw; };
  const whole = (r) => !inStrip(r, nAve, dAve, aveW / 2 + sw) && !inStrip(r, nRiv, dRiv, rivW / 2 + sw * 1.4);
  const onPage = (r) => r.x0 > S.x && r.x1 < S.x + S.w && r.y0 > S.y && r.y1 < S.y + S.h;

  // ---- the venue's block: beside the main road if it can be (rather on the side where the pin stands
  // clear of it), whole, well inside the sheet, with room for the flag beside the pin or over it
  const rp = clamp(short * 0.03, U * 1.9, U * 2.6);                      // the pin's head
  const pinOf = (r) => { const px = (r.x0 + r.x1) / 2, ty = (r.y0 + r.y1) / 2 + rp * 0.2; return { px, ty, hy: ty - rp * 2.5 }; };
  // candidates: whole blocks on the sheet — those over the road first, then those under it, then the rest by distance from it
  const rank = (r) => (r.j1 + 1 === mainRow ? 0 : r.j === mainRow ? 1 : 2 + Math.min(Math.abs(r.j - mainRow), Math.abs(r.j1 + 1 - mainRow)));
  const byRoad = rng.shuffle(rects.filter((r) => whole(r) && onPage(r)))
    .sort((a, b) => rank(a) - rank(b) || Math.abs((a.x0 + a.x1) / 2 - cx) - Math.abs((b.x0 + b.x1) / 2 - cx)).slice(0, 14);
  const lo = Math.max(S.x, x0 + U), hi = Math.min(S.x + S.w, x1 - U);   // where a label may stand, left to right
  const spots = (r, m) => {
    const { px, hy } = pinOf(r);
    return [
      { m, x: px + rp + U * 0.9, y: hy - m.fh / 2, align: 'left' }, { m, x: px - rp - U * 0.9 - m.w, y: hy - m.fh / 2, align: 'right' },
      { m, x: clamp(px - m.fw / 2, lo, Math.max(lo, hi - m.w)), y: hy - rp - U * 0.9 - m.h, align: 'left' },
    ];
  };
  // the flag keeps inside the margins and inside the map, and off the main road (it is the road's colour)
  const fits = (b) => b.x >= lo && b.x + b.m.w <= hi && b.y >= Math.max(S.y, y0 + U) && b.y + b.m.h <= Math.min(S.y + S.h, y1 - U) && (b.y > mainY + U * 1.2 || b.y + b.m.h < mainY - U * 1.2);
  let venue = null, flag = null;
  search: for (const [size, rows] of FLAG_SIZES) {
    const m = measureFlag(env, env.venue, env.when, size * U, rows);
    if (!m) continue;
    for (const r of byRoad) for (const b of spots(r, m)) if (fits(b)) { venue = r; flag = b; break search; }
  }
  if (!venue) {
    venue = byRoad[0] || rects.filter(onPage)[0] || rects[0];
    const m = measureFlag(env, env.venue, env.when, U * 1.6, 2) || measureFlag(env, env.venue, env.when, U * 1.6, 1);
    flag = spots(venue, m)[2]; flag.x = clamp(flag.x, S.x, Math.max(S.x, S.x + S.w - m.w)); flag.y = clamp(flag.y, S.y, Math.max(S.y, S.y + S.h - m.h));
    ctx.note('transit: the venue label has little room in this layout — try another layout or a shorter venue name.');
  }

  // ---- the park: the largest whole block away from the venue, grown over its neighbour where it can
  const far = (r) => Math.hypot((r.x0 + r.x1) / 2 - (venue.x0 + venue.x1) / 2, (r.y0 + r.y1) / 2 - (venue.y0 + venue.y1) / 2);
  const park = rects.filter((r) => r !== venue && whole(r) && far(r) > short * 0.3).sort((a, b) => (b.x1 - b.x0) * (b.y1 - b.y0) - (a.x1 - a.x0) * (a.y1 - a.y0))[0];

  // ---- colours: the blocks are tints of the ink; water and park take the first two colours
  const C = pal.colors || [], notMark = (c) => !!c && !sameInk(c, env.mark) && !sameInk(c, pal.ink);
  const tone = (k) => mix(pal.ink, pal.bg, k);
  const water = mix(notMark(C[0]) ? C[0] : pal.ink, pal.bg, notMark(C[0]) ? 0.56 : 0.72);
  const green = mix(notMark(C[1]) ? C[1] : pal.ink, pal.bg, notMark(C[1]) ? 0.56 : 0.8);
  const tints = [tone(0.9), tone(0.9), tone(0.9), tone(0.86), tone(0.93)];

  // ---- draw: river, blocks, bridges, main road
  const gWater = svg('g'), gBlocks = svg('g'), gRoads = svg('g'), gPin = svg('g'), gText = svg('g');
  root.append(gWater, gBlocks, gRoads, gPin, gText);
  const fieldPoly = rectPoly(x0, y0, x1, y1);
  const band = (n, d, hw) => clipHalf(clipHalf(fieldPoly, n[0], n[1], d + hw), -n[0], -n[1], -(d - hw));
  const river = band(nRiv, dRiv, rivW / 2);
  if (river.length >= 3) gWater.append(svg('path', { d: roundPoly(river, 0.01), fill: water }));
  const rc = U * 0.32, minA = (U * 1.7) ** 2;
  const kept = [];
  for (const r of rects) {
    let polys = [rectPoly(r.x0, r.y0, r.x1, r.y1)];
    polys = polys.flatMap((p) => cutStrip(p, nAve, dAve, aveW / 2 + sw / 2)).flatMap((p) => cutStrip(p, nRiv, dRiv, rivW / 2 + sw * 1.1));
    const cutUp = polys.length !== 1 || polys[0].length !== 4 || !whole(r);
    for (const p of polys) {
      const bb = bbox(p);
      if (area(p) < minA || Math.min(bb.w, bb.h) < U * 1.5) continue;       // no slivers
      const fill = r === venue ? mix(env.mark, pal.bg, 0.62) : r === park ? green : rng.pick(tints);
      gBlocks.append(svg('path', { d: roundPoly(p, r === park ? rc * 2.4 : rc), fill }));
      if (!cutUp && r !== venue && r !== park) kept.push(r);
    }
  }
  // the avenue bridges the river: a paper-coloured band across the water
  const bridge = clipHalf(clipHalf(band(nAve, dAve, aveW / 2), nRiv[0], nRiv[1], dRiv + rivW / 2 + sw * 1.2), -nRiv[0], -nRiv[1], -(dRiv - rivW / 2 - sw * 1.2));
  if (bridge.length >= 3) gRoads.append(svg('path', { d: roundPoly(bridge, 0.01), fill: pal.bg }));
  // the main road, in the accent, straight through the city and over the river
  gRoads.append(svg('line', { x1: r2(x0), y1: r2(mainY), x2: r2(x1), y2: r2(mainY), stroke: env.mark, 'stroke-width': r2(U * 1.15) }));

  // ---- the pin on the venue's block, and its flag
  const { px, ty, hy } = pinOf(venue), al = Math.asin(1 / 2.5);
  const ex = rp * Math.cos(al), ey = hy + rp * Math.sin(al);
  gPin.append(svg('path', { d: `M${r2(px)} ${r2(ty)}L${r2(px - ex)} ${r2(ey)}A${r2(rp)} ${r2(rp)} 0 1 1 ${r2(px + ex)} ${r2(ey)}Z`, fill: env.mark, stroke: pal.bg, 'stroke-width': r2(U * 0.3), 'stroke-linejoin': 'round' }));
  gPin.append(svg('circle', { cx: r2(px), cy: r2(hy), r: r2(rp * 0.4), fill: pal.bg }));
  // the date under the flag sits on a slip of paper, so that the streets do not run through it
  const m = flag.m, fx = flag.align === 'right' ? flag.x + m.w - m.fw : flag.x;
  gText.append(svg('rect', { x: r2(fx), y: r2(flag.y), width: r2(m.fw), height: r2(m.fh), rx: r2(U * 0.22), fill: env.mark }));
  const fi = inkOf(env.ko ? '장소홀' : 'HEA', f.flag, m.size);
  m.lines.forEach((l, k) => txt(gText, l, fx + m.padX, flag.y + m.padY + m.size / 2 + fi.asc / 2 + k * m.lead, f.flag, m.size, { fill: env.onMark, tr: m.tr }));
  if (env.when) {
    const wS = adv(env.when, f.sub, m.subSize, 0.02), sh = m.subSize * 1.7, sy = flag.y + m.fh + U * 0.3, si = inkOf('0123', f.sub, m.subSize);
    const sx0 = flag.align === 'right' ? fx + m.fw - wS - 2 * m.padX : fx;
    gText.append(svg('rect', { x: r2(sx0), y: r2(sy), width: r2(wS + 2 * m.padX), height: r2(sh), rx: r2(U * 0.22), fill: pal.bg }));
    txt(gText, env.when, sx0 + m.padX, sy + sh / 2 + si.asc / 2, f.sub, m.subSize, { fill: pal.ink, tr: 0.02 });
  }

  // ---- a few blocks carry a word from the copy, set wide like a district name
  const nameSize = U * 1.55, ink = inkOf(env.ko ? '가을장' : 'HEA', f.name, nameSize), tr = env.ko ? 0.1 : 0.12;
  const busy = [inflate({ x: flag.x, y: flag.y, w: flag.m.w, h: flag.m.h }, U * 2), { x: px - rp * 1.6, y: hy - rp * 1.6, w: rp * 3.2, h: rp * 4.4 }], named = [];
  for (const name of env.names) {
    const label = env.ko ? name : name.toUpperCase(), w = adv(label, f.name, nameSize, tr);
    const r = rng.shuffle(kept).find((b) => b.x1 - b.x0 >= w + U * 2 && b.y1 - b.y0 >= ink.asc + U * 2.4 && onPage(b) && !named.includes(b)
      && !busy.some((o) => overlap({ x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 }, o)) && named.every((o) => Math.hypot(b.x0 - o.x0, b.y0 - o.y0) > short * 0.28));
    if (!r) continue;
    named.push(r);
    txt(gText, label, (r.x0 + r.x1) / 2 + (tr * nameSize) / 2, (r.y0 + r.y1) / 2 + ink.asc / 2, f.name, nameSize, { anchor: 'middle', fill: pal.ink, tr });
  }
}
