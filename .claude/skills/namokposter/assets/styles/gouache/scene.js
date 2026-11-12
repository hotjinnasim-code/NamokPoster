// Gouache Cut-outs — paper painted flat with gouache, cut freehand with scissors and pinned up.
// A few rectangular panels of saturated matte colour sit together with hairline gaps of page between
// them; on each lies one large form cut from another colour — a frond with rounded lobes, a coral
// branch, a vase, a plain disc — and one or two forms cross from their panel onto the next. One form
// is cut from the page colour itself.
//
// How it is made: every piece of paper is a closed outline (see forms.js) filled on a 2D canvas, back
// to front, each with the small soft shadow of paper lying on paper. A second canvas notes, per pixel,
// which piece is on top and which way it was brushed; the shader adds the gouache — faint parallel
// brush streaks along that direction, a little unevenness, the tooth of the paper — at full resolution.
//
// The arrangement is an object: it fills the layout's art rectangle and keeps clear of the copy. On a
// ground (a cut-out render) the page is left transparent, so only the papers and their shadows remain.
//
// Palette: bg = the page (and the paper of one form) · colors = the tubes of gouache, the first for the
//          largest panel · ink / accent = type.
// Motifs:  fronds (algae and leaf forms, a disc) · still (a vase with a frond, a bowl, fruit)
//          shore (a disc, bands of sea, pebbles, birds)
import { backgroundQuad, oklabVec, GLSL_NOISE_KIT, GLSL_DITHER } from '/skill/assets/web/scene-lib.js';
import * as F from './forms.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

export default function build(ctx) {
  const { THREE, scene, renderer, palette, params, rng, seed, width: W, height: H } = ctx;
  const cutout = renderer.getClearAlpha() === 0;                             // rendered as a subject on a ground: no page
  const P = {
    motif: ['fronds', 'still', 'shore'].includes(params.motif) ? params.motif : 'fronds',
    panels: clamp(Math.round(Number(params.panels) || 0), 0, 6), streak: clamp(params.streak ?? 1, 0, 2.5), shadow: clamp(params.shadow ?? 1, 0, 2.5),
    cut: clamp(params.cut ?? 1, 0, 2), gap: clamp(params.gap ?? 1, 0.4, 3), grain: clamp(params.grain ?? 1, 0, 2),
  };

  // ---- canvases: the paste-up, and notes for the shader (R piece number · G brush direction · B 255 = painted paper)
  const kc = Math.min(1, 5600 / Math.max(W, H)), cw = Math.round(W * kc), ch = Math.round(H * kc), u = ctx.unit * kc;
  const mk = () => { const c = document.createElement('canvas'); c.width = cw; c.height = ch; return c.getContext('2d', { willReadFrequently: true }); };
  const g = mk(), gn = mk();
  if (!cutout) { g.fillStyle = palette.bg; g.fillRect(0, 0, cw, ch); }
  gn.fillStyle = '#000'; gn.fillRect(0, 0, cw, ch);

  // ---- colour
  const C = [...new Set((palette.colors?.length ? palette.colors : [palette.accent, palette.ink]).map((c) => c.toLowerCase()))], bg = palette.bg.toLowerCase();
  const labs = new Map(), lab = (h) => { if (!labs.has(h)) labs.set(h, oklabVec(h)); return labs.get(h); };
  const dL = (a, b) => Math.abs(lab(a).x - lab(b).x), dE = (a, b) => lab(a).distanceTo(lab(b));
  const dark = lab(bg).x < 0.5;
  // red, crimson, rose: such a paper is never cut into a lone disc (on a pale sheet it would read as a flag)
  const reddish = (hex) => { const v = lab(hex), c = Math.hypot(v.y, v.z), h = (Math.atan2(v.z, v.y) * 180) / Math.PI; return c > 0.07 && h > -14 && h < 52; };

  // ---- where the arrangement goes: the art rectangle, inside the page margins and clear of the copy
  const quiet = (ctx.quiet || []).map(([x0, y0, x1, y1]) => ({ x0: x0 * cw, y0: y0 * ch, x1: x1 * cw, y1: y1 * ch }));
  const ar = ctx.artRect || [0, 0, 1, 1], B = { x0: ar[0] * cw, y0: ar[1] * ch, x1: ar[2] * cw, y1: ar[3] * ch };
  const S = (ctx.artSize || 0.6) * Math.min(cw, ch), fx = ctx.focus.x * cw, fy = ctx.focus.y * ch;
  // a draft may place the subject by hand (focus, artSize): then it is a square of that size on that spot
  if (Math.hypot(fx - (B.x0 + B.x1) / 2, fy - (B.y0 + B.y1) / 2) > 0.45 * S || Math.min(B.x1 - B.x0, B.y1 - B.y0) > 1.5 * S) Object.assign(B, { x0: fx - S / 2, y0: fy - S / 2, x1: fx + S / 2, y1: fy + S / 2 });
  // beside a column of copy set flush left, the column's own rules (a theme may hang the label from one) run to the
  // column's edge, a little past where the art rectangle starts: begin the arrangement clear of them
  if (/^(left|side|right-mirror)$/.test(ctx.layout?.layout ?? '')) B.x0 += 0.04 * cw;
  const mX = (W > H * 1.2 ? 9 : 7.5) * u, mY = 7.5 * u;
  B.x0 = Math.max(B.x0, mX); B.x1 = Math.min(B.x1, cw - mX); B.y0 = Math.max(B.y0, mY); B.y1 = Math.min(B.y1, ch - mY);
  const gapQ = 3 * u, area = (b) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
  for (const q of quiet) {
    if (q.x1 + gapQ <= B.x0 || q.x0 - gapQ >= B.x1 || q.y1 + gapQ <= B.y0 || q.y0 - gapQ >= B.y1) continue;
    const opts = [{ ...B, x0: Math.max(B.x0, q.x1 + gapQ) }, { ...B, x1: Math.min(B.x1, q.x0 - gapQ) }, { ...B, y0: Math.max(B.y0, q.y1 + gapQ) }, { ...B, y1: Math.min(B.y1, q.y0 - gapQ) }];
    Object.assign(B, opts.reduce((a, b) => (area(b) > area(a) ? b : a)));
  }
  B.w = B.x1 - B.x0; B.h = B.y1 - B.y0;
  if (B.w < 8 * u || B.h < 8 * u) { finish(); return; }                       // no room at all: the bare page

  // ---- the panels: columns of unequal width, each cut into one to three rows, the cuts staggered.
  // One column is left whole and made the widest: its panel carries the main form.
  // (a tall block is worked out lying on its side and turned back)
  const gap = 0.62 * u * P.gap, lying = B.w / B.h < 0.8, bw = lying ? B.h : B.w, bh = lying ? B.w : B.h;
  const panels = (() => {
    const r = bw / bh, cands = [];
    const weights = (rows) => { let lead = false; return rows.map((k) => (k > 1 ? [0, 0, 0.9, 0.84][k] : lead ? 1 : ((lead = true), 1.26))); };
    for (let nc = 1; nc <= 6; nc++) {
      const rec = (rows) => {
        if (rows.length < nc) { for (const k of [1, 2, 3]) rec(rows.concat(k)); return; }
        const n = rows.reduce((a, b) => a + b, 0), wt = weights(rows), tw = wt.reduce((a, b) => a + b, 0);
        if (P.panels ? n !== P.panels : n < 3 || n > 6) return;
        let sc = [0, 0, 0, 1.0, 1.6, 1.2, 0.4][n], lead = false;
        rows.forEach((k, i) => {
          const a = ((wt[i] / tw) * r) * k, e = Math.abs(Math.log(a));       // a panel's width over its height
          sc -= k * (e > 0.85 ? 6 * e : e > 0.5 ? 1.2 * e : 0.3 * e);        // no slivers
          if (k === 1 && a > 0.42 && a < 1.5) lead = true;
        });
        if (lead) sc += 2;                                                   // one panel large enough to carry the main form
        for (let i = 1; i < nc; i++) sc += rows[i] !== rows[i - 1] ? 0.5 : 0;   // neighbours cut differently: not a grid
        cands.push({ rows, sc });
      };
      rec([]);
    }
    cands.sort((a, b) => b.sc - a.sc);
    const rows = rng.pick(cands.filter((c) => c.sc > cands[0].sc - 0.6)).rows.slice(); if (rng() < 0.5) rows.reverse();
    // unequal widths: no two columns are quite alike
    let ws = weights(rows).map((v) => v * rng.range(0.94, 1.06)); if (rng() < 0.5) { rows.reverse(); ws.reverse(); }
    const tw = ws.reduce((a, b) => a + b, 0); ws = ws.map((v) => (v / tw) * bw);
    const out = []; let x = 0, lastF = rng() < 0.5 ? 0.4 : 0.6;
    rows.forEach((k, i) => {
      let fs;
      if (k === 1) fs = [1];
      else if (k === 2) { const f = lastF >= 0.5 ? rng.range(0.36, 0.44) : rng.range(0.56, 0.64); lastF = f; fs = [f, 1 - f]; }   // staggered against the column before
      else { const a = rng.range(0.27, 0.31), b = rng.range(0.38, 0.42); fs = rng.shuffle([a, b, 1 - a - b]); lastF = fs[0] > 0.34 ? 0.3 : 0.7; }
      let y = 0;
      fs.forEach((f) => { out.push({ x, y, w: ws[i], h: f * bh }); y += f * bh; });
      x += ws[i];
    });
    return out.map((p) => (lying ? { x: B.x0 + p.y, y: B.y0 + p.x, w: p.h, h: p.w } : { x: B.x0 + p.x, y: B.y0 + p.y, w: p.w, h: p.h }));
  })();
  // hairline gaps: every panel gives up half a gap on each side that faces another panel
  for (const p of panels) {
    const l = p.x > B.x0 + 0.5, t = p.y > B.y0 + 0.5, r = p.x + p.w < B.x1 - 0.5, b = p.y + p.h < B.y1 - 0.5;
    p.x0 = p.x + (l ? gap / 2 : 0); p.y0 = p.y + (t ? gap / 2 : 0); p.x1 = p.x + p.w - (r ? gap / 2 : 0); p.y1 = p.y + p.h - (b ? gap / 2 : 0);
    p.W = p.x1 - p.x0; p.H = p.y1 - p.y0; p.m = Math.min(p.W, p.H); p.area = p.W * p.H; p.long = Math.max(p.W / p.H, p.H / p.W);
  }
  // which panels touch, and on which side
  const touch = (a, b) => {
    const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
    if (oy > 0.3 * Math.min(a.H, b.H) && Math.abs(a.x1 - b.x0) < 2 * gap) return 'right';
    if (oy > 0.3 * Math.min(a.H, b.H) && Math.abs(b.x1 - a.x0) < 2 * gap) return 'left';
    if (ox > 0.3 * Math.min(a.W, b.W) && Math.abs(a.y1 - b.y0) < 2 * gap) return 'bottom';
    if (ox > 0.3 * Math.min(a.W, b.W) && Math.abs(b.y1 - a.y0) < 2 * gap) return 'top';
    return null;
  };
  panels.forEach((p, i) => { p.i = i; p.nb = {}; panels.forEach((q, j) => { if (i !== j) { const s = touch(p, q); if (s) (p.nb[s] ??= []).push(j); } }); });
  const bySize = [...panels].sort((a, b) => b.area - a.area), big = bySize[0];

  // ---- placing forms. Each piece of paper: { panel, kind, polys (sheet px), over: [panels it crosses onto],
  //      z (pasting order), apart: [pieces it lies against and must differ from], lead (the main form) }
  const blocked = panels.map(() => []);                                      // per panel: where a form from next door already lies
  const boxOf = (p, out = null, by = 0.17) => {
    const pad = 0.07 * p.m + 0.6 * u; let b = [p.x0 + pad, p.y0 + pad, p.x1 - pad, p.y1 - pad];
    // keep off whatever has crossed in from a neighbour: give up the side that costs least
    const ar4 = (r) => Math.max(0, r[2] - r[0]) * Math.max(0, r[3] - r[1]), off = 1.4 * u;
    for (const o of blocked[p.i]) {
      if (o[2] <= b[0] || o[0] >= b[2] || o[3] <= b[1] || o[1] >= b[3]) continue;
      b = [[Math.max(b[0], o[2] + off), b[1], b[2], b[3]], [b[0], b[1], Math.min(b[2], o[0] - off), b[3]], [b[0], Math.max(b[1], o[3] + off), b[2], b[3]], [b[0], b[1], b[2], Math.min(b[3], o[1] - off)]].reduce((x, y) => (ar4(y) > ar4(x) ? y : x));
    }
    if (out) {
      // crossing a gap: as far as a sixth of this panel, but never more than a fifth of the one it lands on
      const nbs = p.nb[out].map((j) => panels[j]), horiz = out === 'left' || out === 'right';
      const d = gap + Math.min(by * (horiz ? p.W : p.H), ...nbs.map((q) => 0.22 * (horiz ? q.W : q.H)));
      if (out === 'left') b[0] = p.x0 - d; if (out === 'right') b[2] = p.x1 + d; if (out === 'top') b[1] = p.y0 - d; if (out === 'bottom') b[3] = p.y1 + d;
    }
    return b;
  };
  const UP = -Math.PI / 2, dirOf = { left: Math.PI, right: 0, top: UP, bottom: Math.PI / 2 };
  const wOf = (b) => b[2] - b[0], hOf = (b) => b[3] - b[1], elongOf = (b) => Math.max(wOf(b) / hOf(b), hOf(b) / wOf(b));
  // turn a form so that it fills its box best; `towards` (an angle) keeps its tip within `fan` radians of that direction
  const bestTurn = (polys, box, towards = UP, fan = 1.3) => {
    let top = null;
    for (let i = 0; i < 25; i++) { const rot = towards + lerp(-fan, fan, i / 24), s = F.fitScale(polys, box, rot) * (1 + 0.05 * rng() - 0.07 * Math.sin(rot)); if (!top || s > top.s) top = { s, rot }; }   // growing upwards, if it is all the same
    return top.rot;
  };
  const items = [], placed = new Set();
  const put = (p, kind, polys, { z = 0, apart = [], lead = false } = {}) => {
    // which other panels does the piece come to lie on, and where? (their own forms keep off that part)
    // Its outline is walked in short steps, so that a long straight cut across a panel is not missed.
    const over = [];
    for (const q of panels) {
      if (q === p) continue;
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, hit = false;
      for (const poly of polys) for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (2 * u)));
        for (let k = 0; k < n; k++) { const x = lerp(a[0], b[0], k / n), y = lerp(a[1], b[1], k / n); if (x > q.x0 && x < q.x1 && y > q.y0 && y < q.y1) { hit = true; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } }
      }
      if (!hit) continue;
      // the piece reaches in from its own panel: everything between is taken too
      if (p.x1 <= q.x0 + gap) x0 = q.x0; if (p.x0 >= q.x1 - gap) x1 = q.x1; if (p.y1 <= q.y0 + gap) y0 = q.y0; if (p.y0 >= q.y1 - gap) y1 = q.y1;
      over.push(q.i); blocked[q.i].push([x0, y0, x1, y1]);
    }
    placed.add(p.i); items.push({ panel: p, kind, polys, over, z: z + (over.length ? 0.5 : 0), apart, lead });
    return items.length - 1;
  };
  // a side on which this panel's form may cross onto a neighbour: one whose own form is not yet down
  const crossSide = (p, prefer = () => true, only = false) => {
    const free = Object.keys(p.nb).filter((s) => p.nb[s].every((j) => !placed.has(j))), liked = free.filter(prefer);
    return liked.length ? rng.pick(liked) : free.length && !only ? rng.pick(free) : null;
  };
  const alignOf = (out) => ({ ax: out === 'left' ? 0 : out === 'right' ? 1 : 0.5, ay: out === 'top' ? 0 : out === 'bottom' ? 1 : 0.5 });

  // the plants, shaped to the box they are for
  const seaweed = (box, small = false) => F.frond(rng, { pairs: small ? rng.int(3, 4) : rng.int(4, 5), reach: clamp(0.62 / elongOf(box), 0.28, 0.42), lean: rng.range(0.95, 1.12), curve: rng.sign() * rng.range(0.35, 0.7), hook: rng.range(0.3, 0.55), lop: rng.range(-0.22, 0.22), girth: small ? 1.25 : 1, cut: P.cut });
  const squat = () => F.frond(rng, { pairs: 3, reach: rng.range(0.42, 0.5), lean: rng.range(1.15, 1.3), curve: rng.sign() * rng.range(0.15, 0.35), hook: rng.range(0.12, 0.3), girth: 1.5, lop: rng.range(-0.12, 0.12), stem: 0.13, round: 1.3, neck: 0.85, full: 0.66, cut: P.cut });
  const branch = () => F.coral(rng, { arms: rng.int(4, 5), girth: rng.range(0.11, 0.125), spread: rng.range(0.82, 0.98), cut: P.cut });
  const plant = (p, kind, out = null, opts = {}) => {
    const box = boxOf(p, out), shape = kind === 'seaweed' ? seaweed(box, p.area < 0.6 * big.area) : kind === 'leaf' ? squat() : branch();
    return put(p, kind, F.place(shape, box, { rot: bestTurn(shape, box, out ? dirOf[out] : UP, out ? 0.9 : 1.35), ...alignOf(out) }), opts);
  };
  const discIn = (p) => { const box = boxOf(p); return put(p, 'disc', F.place(F.disc(rng, { cut: P.cut }), box, { fill: elongOf(box) > 1.25 ? 0.86 : rng.range(0.66, 0.76), ax: rng.range(0.3, 0.7), ay: rng.range(0.3, 0.7) })); };

  const motifs = {
    // ---- algae and leaf forms: a frond on the largest panel, a squat leaf and a coral branch, one plain disc for rest
    fronds() {
      const rest = [...panels].sort((a, b) => (a.long > 1.7) - (b.long > 1.7) || a.area - b.area)[0];   // the smallest panel that is not a strip
      const plants = bySize.filter((p) => p !== rest), longest = plants.reduce((a, b) => (b.long > a.long ? b : a)), deal = rng.shuffle(['coral', 'leaf']); let dealt = 0;
      plants.forEach((p, n) => {
        const out = n < 2 ? crossSide(p, (s) => (s === 'top' || s === 'bottom') === (p.H >= p.W)) : null;      // the two largest cross onto a neighbour
        plant(p, n === 0 || p === longest || elongOf(boxOf(p, out)) > 1.75 ? 'seaweed' : deal[dealt++ % 2], out, { lead: n === 0 });
      });
      discIn(rest);
    },

    // ---- a table: a vase with a frond in it; a bowl of fruit, a pear and its neighbour, a slice, a lemon, a leaf
    still() {
      // the vase wants an upright panel: of the large ones, the tallest (a wide one suits the bowl better)
      const sgn = rng.sign(), p = bySize.filter((q) => q.area >= 0.55 * big.area).sort((a, b) => b.H / b.W - a.H / a.W)[0];
      {
        const out = crossSide(p, (s) => s === 'top', true) ?? crossSide(p, (s) => s !== 'bottom', true), box = boxOf(p, out), tall = hOf(box) / wOf(box);
        const hv = Math.min((tall > 1.25 ? 0.43 : tall > 0.8 ? 0.5 : 0.56) * hOf(box), 0.95 * wOf(box));        // the vase's height
        const side = out === 'left' ? -1 : out === 'right' ? 1 : sgn, fbox = [box[0], box[1], box[2], box[3] - hv * 0.86];
        // in a wide panel the frond leans right over, so that vase and frond together span it
        const over = clamp(wOf(fbox) / hOf(fbox), 1, 2.6), tilt = side * (over > 1.2 ? rng.range(0.34, 0.42) * over : rng.range(0.2, 0.42));
        const shape = F.frond(rng, { pairs: rng.int(4, 5), reach: clamp((0.62 * wOf(fbox)) / hOf(fbox), 0.3, 0.42), lean: rng.range(1.0, 1.15), curve: -side * rng.range(0.45, 0.75), hook: rng.range(0.25, 0.45), lop: rng.range(-0.15, 0.15), stem: 0.2, cut: P.cut });
        let fr = F.place(shape, fbox, { rot: UP + clamp(tilt, -1.05, 1.05), ax: 0.5 + 0.3 * side, ay: 1 });
        // the vase stands under the foot of the frond, wherever that came to be
        const foot = fr.at([0, 0]), cx = clamp(foot[0], box[0] + 0.37 * hv, box[2] - 0.37 * hv), vs = F.vase(rng, { cut: P.cut });
        if (cx !== foot[0]) fr = F.move(fr, cx - foot[0], 0);
        const fi = put(p, 'seaweed', fr, { z: 1, lead: true });
        put(p, 'vase', F.move(vs, cx, foot[1] + hv * 0.86, hv), { z: 2, apart: [fi] });
      }
      const used = new Set();
      const take = (list) => { const k = list.find((v) => !used.has(v)) ?? list[0]; used.add(k); return k; };
      for (const p of bySize.filter((q) => !placed.has(q.i))) {
        const box = boxOf(p), a = wOf(box) / hOf(box);
        const kind = a > 1.3 ? take(['bowl', 'slice', 'pair', 'lemon']) : a > 0.78 ? take(['pair', 'bowl', 'fruit', 'lemon', 'leaf']) : take(['pear', 'leaf', 'pair']);
        if (kind === 'bowl') {
          // fruit shows over the rim: the bowl is pasted on top of it
          const f1 = F.move(F.disc(rng, { cut: P.cut }), rng.range(-0.2, -0.12), -0.1, rng.range(0.17, 0.2)), f2 = F.move(F.disc(rng, { cut: P.cut }), rng.range(0.1, 0.2), -0.06, rng.range(0.14, 0.17));
          const gp = F.placeGroup([f1, f2, F.bowl(rng, { cut: P.cut })], box, { fill: 0.94, ay: 0.6 });
          const i1 = put(p, 'fruit', gp[0]), i2 = put(p, 'fruit', gp[1], { z: 0.2, apart: [i1] }); put(p, 'bowl', gp[2], { z: 1, apart: [i1, i2] });
        } else if (kind === 'pair') {
          const gp = F.placeGroup([F.pear(rng, { cut: P.cut }), F.move(F.fruit(rng, { cut: P.cut }), sgn * 0.5, -0.3, 0.6)], box, { fill: 0.92, ay: 0.7 });
          const i1 = put(p, 'pear', gp[0]); put(p, 'fruit', gp[1], { z: 0.3, apart: [i1] });
        } else if (kind === 'slice') put(p, kind, F.place(F.slice(rng, { cut: P.cut }), box, { rot: rng.range(-0.35, 0.35), fill: 0.88 }));
        else if (kind === 'lemon') put(p, kind, F.place(F.lemon(rng, { cut: P.cut }), box, { rot: rng.range(-0.5, 0.5), fill: 0.84 }));
        else if (kind === 'fruit') put(p, kind, F.place(F.fruit(rng, { cut: P.cut }), box, { fill: 0.8 }));
        else if (kind === 'pear') put(p, kind, F.place(F.pear(rng, { cut: P.cut }), box, { fill: 0.9, rot: rng.range(-0.12, 0.12) }));
        else plant(p, 'leaf');
      }
    },

    // ---- the shore: bands of sea on the largest panel, a plain disc, birds, pebbles; a frond if there is a panel to spare
    shore() {
      {
        // the sea runs from edge to edge of its panel (a hair over it, as paper cut to fit is) and on across one gap
        const p = big, out = crossSide(p, (s) => s === 'left' || s === 'right', true), e = () => rng.range(0.05, 0.28) * u;
        const box = [p.x0 - e(), p.y0, p.x1 + e(), p.y1 + e()], cross = out ? boxOf(p, out) : null;
        if (out === 'left') box[0] = cross[0]; if (out === 'right') box[2] = cross[2];
        const n = hOf(box) / wOf(box) > 0.8 ? 3 : 2, hb = (rng.range(0.56, 0.64) * hOf(box)) / n, run = rng.sign(); let last = null;
        for (let k = 0; k < n; k++) {
          // each band is laid over the foot of the one above; all are cut off level with one another at the bottom
          const sc = Math.max(3, Math.round(wOf(box) / (hb * rng.range(1.5, 1.9)))) + (k % 2), lift = rng.range(0.2, 0.26);
          const band = F.move(F.wave(rng, { w: wOf(box), h: (n - k) * hb, scallops: sc, lift, run }), box[0], box[3] - (n - k) * hb);
          last = put(p, k === n - 1 ? 'swell' : 'wave', band, { z: 0.1 * k, apart: last === null ? [] : [last], lead: k === 0 });
        }
      }
      const rest = bySize.slice(1), roles = ['disc', 'birds', 'pebbles', 'seaweed', 'coral'].slice(0, rest.length);
      // the disc takes the squarest of the panels left, the birds the next
      rest.sort((a, b) => a.long - b.long);
      rest.forEach((p, n) => {
        const kind = roles[n], box = boxOf(p), a = wOf(box) / hOf(box);
        if (kind === 'disc') discIn(p);
        else if (kind === 'birds') {
          const wide = a > 1.2, flock = [F.bird(rng, { cut: P.cut }), F.move(F.bird(rng, { cut: P.cut }), wide ? 0.96 : 0.36, wide ? -0.4 : -0.6, 0.78, rng.range(-0.25, 0.1)), F.move(F.bird(rng, { cut: P.cut }), wide ? 1.72 : -0.2, wide ? 0.02 : -1.08, 0.6, rng.range(-0.1, 0.25))];
          put(p, kind, F.place(flock.flat(), box, { fill: 0.9, flip: rng() < 0.5, rot: rng.range(-0.12, 0.12) }));
        } else if (kind === 'pebbles') {
          // three stones: in a row if the panel is wide, balanced one on another if not
          const wide = a > 1.2, st = [F.pebble(rng, { cut: P.cut }), F.move(F.pebble(rng, { cut: P.cut }), wide ? 1.4 : rng.range(-0.15, 0.15), wide ? 0.2 : -1.22, 0.7), F.move(F.pebble(rng, { cut: P.cut }), wide ? 2.2 : rng.range(-0.1, 0.1), wide ? 0.36 : -2.05, 0.46)];
          const gp = F.placeGroup(st, box, { fill: 0.9, flip: rng() < 0.5, ay: 0.62 }); let prev = null;
          gp.forEach((poly, k) => { prev = put(p, 'pebble', poly, { z: 0.1 * k, apart: prev === null ? [] : [prev] }); });
        } else plant(p, kind);
      });
    },
  };
  (motifs[P.motif] ?? motifs.fronds)();

  // ---- colours: every panel a tube of gouache, every form a colour that stands off its panel in
  // lightness as well as hue. Scored as a whole and improved one choice at a time, from several starts.
  let pool = C.filter((c) => dE(c, bg) > 0.1); if (!pool.length) pool = [palette.ink.toLowerCase()];              // a palette of page colours only: cut from the ink
  const formPool = [...pool, bg], nP = panels.length;
  const pairs = []; panels.forEach((p) => Object.values(p.nb).flat().forEach((j) => { if (j > p.i) pairs.push([p.i, j]); }));
  const leadK = items.findIndex((it) => it.lead);
  const score = (v) => {
    const pc = v.slice(0, nP), fc = v.slice(nP); let s = 0, pages = 0;
    for (const [i, j] of pairs) s += pc[i] === pc[j] ? -100 : 5 * Math.min(0.3, dE(pc[i], pc[j]));
    s -= (nP - new Set(pc).size) * (nP <= pool.length ? 16 : 3);
    s -= (fc.length - new Set(fc).size) * 6;
    if (P.motif !== 'shore' && pc[big.i] === pool[0]) s += 9;                // the first colour of the palette takes the largest panel
    if (leadK >= 0 && fc[leadK] === bg) s += 10;                             // … and the page colour its form, if it stands off well
    items.forEach((it, k) => {
      const c = fc[k], on = pc[it.panel.i], d = dL(c, on);
      s += c === on ? -200 : d < 0.22 ? -25 - 150 * (0.22 - d) : 14 * Math.min(d, 0.5);
      if (c === bg) pages++;
      if (it.kind === 'disc' && reddish(c)) s -= 100;
      // the sea is cut from the cool colours and its foam from the page — but not the lowest band, which closes the panel
      if (it.kind === 'wave' || it.kind === 'swell') s += c === bg ? (it.kind === 'swell' ? -60 : 4) : 110 * clamp(-lab(c).z - 0.4 * lab(c).y - 0.02, -0.1, 0.12);
      if (it !== items[leadK] && leadK >= 0 && c === fc[leadK] && it.panel.area > 0.5 * big.area) s -= 14;      // two large forms of one colour read as a pair
      for (const m of it.apart) s += c === fc[m] ? -200 : dE(c, fc[m]) < 0.16 ? -30 : 0;                         // pieces that lie against each other
      for (const j of it.over) { s += c === pc[j] ? -200 : dL(c, pc[j]) < 0.14 ? -30 : 2; items.forEach((o, m) => { if (o.panel.i === j && fc[m] === c) s -= 40; }); }   // a form that crosses a gap stands off what it lands on, and off the form there
      for (const j of Object.values(it.panel.nb).flat()) if (!it.over.includes(j) && c === pc[j]) s += 1.2;      // a form that echoes the colour next door
    });
    return s + (pages === 1 ? 8 : pages === 0 ? -30 : -6 * (pages - 1));     // one form is cut from the page colour
  };
  let best = null;
  for (let start = 0; start < 14; start++) {
    const v = panels.map(() => rng.pick(pool)).concat(items.map(() => rng.pick(formPool))); let s = score(v);
    for (let pass = 0, moved = true; pass < 8 && moved; pass++) {
      moved = false;
      for (const k of rng.shuffle(v.map((_, i) => i))) for (const c of k < nP ? pool : formPool) { const old = v[k]; if (c === old) continue; v[k] = c; const s2 = score(v); if (s2 > s + 1e-9) { s = s2; moved = true; } else v[k] = old; }
    }
    if (!best || s > best.s) best = { s, pc: v.slice(0, nP), fc: v.slice(nP) };
  }

  // ---- paste: panels first, then the forms in their order, those that cross a gap after those that do not
  const trace = (gc, polys) => { gc.beginPath(); for (const p of polys) { gc.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) gc.lineTo(p[i][0], p[i][1]); gc.closePath(); } };
  let pieceNo = 0;
  const paste = (polys, hex, lift = 1) => {
    const id = 1 + ((pieceNo++ * 37) % 250), dirn = (rng() < 0.5 ? 0 : Math.PI / 2) + rng.range(-0.3, 0.3);
    g.save();
    g.shadowColor = `rgba(${dark ? '0,0,0' : '46,30,18'},${clamp((dark ? 0.34 : 0.2) * P.shadow * lift, 0, 0.8)})`; g.shadowBlur = 0.3 * u * Math.sqrt(P.shadow) * lift; g.shadowOffsetX = 0.1 * u * P.shadow * lift; g.shadowOffsetY = 0.15 * u * P.shadow * lift;
    g.fillStyle = hex; trace(g, polys); g.fill(); g.restore();
    gn.fillStyle = `rgb(${id},${Math.round((((dirn % Math.PI) + Math.PI) % Math.PI) / Math.PI * 255)},255)`; trace(gn, polys); gn.fill();
  };
  // a panel: four cuts with scissors — straight, but each a hair off true, with the slightest bend where the hand moved on
  const jit = 0.17 * u * P.cut;
  panels.forEach((p, i) => {
    const c = [[p.x0, p.y0], [p.x1, p.y0], [p.x1, p.y1], [p.x0, p.y1]].map(([x, y]) => [x + rng.range(-jit, jit), y + rng.range(-jit, jit)]), poly = [];
    for (let k = 0; k < 4; k++) { const a = c[k], b = c[(k + 1) % 4], t = rng.range(0.3, 0.7), o = rng.range(-0.5, 0.5) * jit, len = Math.hypot(b[0] - a[0], b[1] - a[1]); poly.push(a, [lerp(a[0], b[0], t) - ((b[1] - a[1]) / len) * o, lerp(a[1], b[1], t) + ((b[0] - a[0]) / len) * o]); }
    paste([poly], best.pc[i], 0.9);
  });
  items.map((it, k) => ({ it, k })).sort((a, b) => a.it.z - b.it.z || a.k - b.k).forEach(({ it, k }) => paste(it.polys, best.fc[k]));

  finish();

  // ---- the gouache: brush streaks, unevenness and paper tooth, added per pixel
  function finish() {
    const tex = (gc, premult) => { const t = new THREE.CanvasTexture(gc.canvas); t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = false; t.premultiplyAlpha = premult; t.minFilter = t.magFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; };
    scene.add(backgroundQuad(/* glsl */`
      varying vec2 vUv; uniform sampler2D tCol, tNote; uniform vec2 uAsp; uniform float uStreak, uGrain, uSeed, uFine, uDark;
      ${GLSL_NOISE_KIT}
      ${GLSL_DITHER}
      void main(){
        vec2 q = vec2(vUv.x, 1.0 - vUv.y) * uAsp;                             // the sheet in short-side units
        vec4 t = texture2D(tCol, vUv); vec3 nt = texture2D(tNote, vUv).rgb;
        float alpha = t.a; vec3 c = t.rgb / max(alpha, 1e-4);                 // the canvas arrives premultiplied
        float id = floor(nt.r * 255.0 + 0.5), paint = nt.b;
        // each piece was brushed in its own direction, with its own run of strokes
        float a = nt.g * 3.14159265, cs = cos(a), sn = sin(a); vec2 r = mat2(cs, sn, -sn, cs) * q + id * vec2(0.37, 0.61) + uSeed;
        float broad = noise2(vec2(r.x * 1.1, r.y * 30.0)), mid = noise2(vec2(r.x * 2.6, r.y * 95.0) + 7.3), fine = noise2(vec2(r.x * 7.0, r.y * 300.0 * uFine) + 3.1);
        float streak = 0.5 * broad + 0.32 * mid + 0.18 * fine;
        float pool = fbm2(q * 2.6 + id * 1.7 + uSeed, 2);                      // where the paint lay a little thicker
        float tooth = noise2(q * 540.0 * uFine);
        float k = paint * (0.036 * uStreak * streak + 0.012 * uStreak * pool) + uGrain * 0.012 * tooth * mix(1.0, 0.6, paint);
        c = c * (1.0 + k * mix(1.0, 1.4, uDark)) + paint * 0.006 * uStreak * streak;  // dark paints show their streaks as a sheen
        c = clamp(c, 0.0, 1.0);
        gl_FragColor = vec4(mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)), alpha);
        #include <colorspace_fragment>
        gl_FragColor.rgb += ditherNoise(gl_FragCoord.xy);
        gl_FragColor.rgb *= alpha;
      }`, {
      tCol: { value: tex(g, true) }, tNote: { value: tex(gn, false) }, uAsp: { value: new THREE.Vector2(Math.max(W / H, 1), Math.max(H / W, 1)) },
      uStreak: { value: P.streak }, uGrain: { value: P.grain }, uSeed: { value: (seed % 89) * 0.37 }, uFine: { value: Math.min(1, Math.min(W, H) / 1900) }, uDark: { value: dark ? 1 : 0 },
    }));
    ctx.frame({ radius: 1, fov: 30, dir: [0, 0, 1] });
  }
}
