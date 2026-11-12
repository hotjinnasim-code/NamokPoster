// marquee — type as texture. The poster's own headline, set in its own display face, repeated end to
// end in rows that fill the free field of the page (ctx.field()) and run out to the page edge, with one
// clean straight edge towards the copy. Between the repeats a small drawn mark (dot, four-point star,
// dash), and — every other repeat — the date or the eyebrow.
// An HTML scene: SVG text and shapes, clipped to the field, vector at any size.
//
// Palette: colors[0] = main ink (solid rows; the first tape) · colors[1] = second ink (outlined rows, the
//          marks, alternate rows in "duo"; the second tape) · colors[2] = the third tape · colors[3] = only a
//          candidate for the lettering on a tape (whichever palette colour reads best on it is used).
// Motifs:  rows (horizontal rows, alternately solid and outlined, each shifted)
//          tilt (the same rows turned about −12°) · tape (two or three broad ribbons of flat colour crossing
//          the field, each carrying the phrase) · steps (rows growing from small to very large, the largest
//          cropped by the page edge)
// Params:  treatment = outline | duo | solid · with = auto | date | eyebrow | none
//          mark = star | dot | dash · caps = true | false (Latin only; Hangul has no case)
//          rows = 0 (auto, 5–9) or a count · angle (tilt, degrees) · ribbons (tape, 2–3)
//          phrase = auto (a long headline is cut to its first line / clause / whole words) | full
// Helpers written here (not in html-lib.js): copySides() — which sides of the field face the copy;
//          guardCopy() — adds the laid-out copy boxes to ctx.quiet before ctx.field() (grotesk's eyebrow rule
//          runs wider than the measured copy block); markNode() — the drawn separators.
import { svg, eventDate, measureInk, MONTH_NAMES, isKorean, standOff, readableOn, contrast, alpha, mix } from '/skill/assets/web/html-lib.js';

const r2 = (v) => Math.round(v * 100) / 100;

/** A small drawn separator, centred on (cx, cy), `s` = half its height. → SVG node */
function markNode(kind, cx, cy, s, attrs) {
  if (kind === 'dot') return svg('circle', { cx: r2(cx), cy: r2(cy), r: r2(s * 0.62), ...attrs });
  if (kind === 'dash') return svg('rect', { x: r2(cx - s * 1.1), y: r2(cy - s * 0.26), width: r2(s * 2.2), height: r2(s * 0.52), ...attrs });
  // four-point star: pinched curves between the four tips
  const k = s * 0.16;
  const d = `M${r2(cx)} ${r2(cy - s)}Q${r2(cx + k)} ${r2(cy - k)} ${r2(cx + s)} ${r2(cy)}Q${r2(cx + k)} ${r2(cy + k)} ${r2(cx)} ${r2(cy + s)}Q${r2(cx - k)} ${r2(cy + k)} ${r2(cx - s)} ${r2(cy)}Q${r2(cx - k)} ${r2(cy - k)} ${r2(cx)} ${r2(cy - s)}Z`;
  return svg('path', { d, ...attrs });
}
const markWidth = (kind, s) => (kind === 'dash' ? s * 2.2 : kind === 'dot' ? s * 1.24 : s * 2);

/** Which sides of field F face the copy, heaviest first: [{ side, w }]. Sides at the page edge never do. */
function copySides(F, ctx) {
  const { W, H } = ctx, out = [];
  const beyond = { left: [0, F.y, F.x, F.y + F.h], right: [F.x + F.w, F.y, W, F.y + F.h], top: [F.x, 0, F.x + F.w, F.y], bottom: [F.x, F.y + F.h, F.x + F.w, H] };
  for (const side of ['left', 'right', 'top', 'bottom']) {
    if (F.edges[side]) continue;
    const [a0, b0, a1, b1] = beyond[side];
    let w = 0;
    for (const q of ctx.quiet) {
      const x0 = Math.max(a0, q[0] * W), x1 = Math.min(a1, q[2] * W), y0 = Math.max(b0, q[1] * H), y1 = Math.min(b1, q[3] * H);
      if (x1 > x0 && y1 > y0) w += (x1 - x0) * (y1 - y0);
    }
    out.push({ side, w: w + 1 });
  }
  return out.sort((a, b) => b.w - a.w);
}

/** Add the copy's boxes as laid out (eyebrow with its rule, headline, information, footer …) to ctx.quiet before ctx.field(). */
function guardCopy(ctx) {
  const { W, H } = ctx, extra = [];
  for (const n of document.querySelectorAll('.poster .frame :is(.eyebrow, .title, .subtitle, .meta, .body, .cta, .footer, .brand, .badge, .logo, .logos, .qr), .poster .frame .bottom.ruled')) {
    const b = n.getBoundingClientRect();
    if (b.width > 0 && b.height > 0) extra.push([b.left / W, b.top / H, b.right / W, b.bottom / H]);
  }
  ctx.quiet = [...ctx.quiet, ...extra];
}

export default async function build(ctx) {
  const { W, H, unit: U, palette: pal, params, content, font } = ctx;
  const motif = params.motif || ctx.motif || 'rows';
  const rng = ctx.rng;
  const ko = ctx.lang === 'ko' || isKorean(content.title);
  const inks = [0, 1, 2, 3].map((i) => standOff(pal.colors[i % pal.colors.length], pal.bg, pal.ink, 1.5));

  // ---- the phrase: the headline, optionally alternating with the date or the eyebrow
  const caps = params.caps !== false && params.caps !== 'false';
  const up = (s) => (caps ? s.toUpperCase() : s);    // toUpperCase leaves Hangul as it is
  let title = content.title || content.eyebrow || content.subtitle || '';
  if (!content.title) ctx.note('marquee: the copy has no headline, so the rows repeat ' + (title ? 'the eyebrow / subtitle' : 'a plain row of marks') + '.');
  title = title.replace(/\s+/g, ' ').trim();
  // a long headline is cut to its first clause (up to a line break, comma or dash), else to whole words,
  // so one repeat stays short enough to read as a phrase — the words are the copy's own, never rewritten
  const LONG = ko ? 16 : 26;
  if (params.phrase !== 'full' && [...title].length > LONG) {
    const first = String(content.titleRaw || '').replace(/\*+/g, '').split(/\n/)[0].replace(/\s+/g, ' ').trim();
    const clause = title.split(/\s*[,，、;:–—]\s*|\s+-\s+/)[0];
    const words = (n) => { let out = ''; for (const w of title.split(' ')) { if ([...(out ? out + ' ' + w : w)].length > n) break; out = out ? out + ' ' + w : w; } return out; };
    const pick = [first, clause].find((t) => t && t !== title && [...t].length >= 4 && [...t].length <= LONG + 4) || words(LONG + 2) || title.slice(0, LONG);
    title = pick;
  }
  title = up(title);
  let second = null;
  const want = params.with || 'auto';
  const date = want === 'auto' || want === 'date' ? eventDate(content) : null;
  if (date) {
    const two = (n) => String(n).padStart(2, '0');
    if (ko) second = date.end ? `${date.month}.${two(date.day)} – ${date.end.month}.${two(date.end.day)}` : `${date.month}월 ${date.day}일`;
    else second = date.end ? `${MONTH_NAMES.enShort[date.month - 1]} ${date.day} – ${date.end.month !== date.month ? MONTH_NAMES.enShort[date.end.month - 1] + ' ' : ''}${date.end.day}` : `${MONTH_NAMES.enShort[date.month - 1]} ${date.day}`;
  } else if ((want === 'auto' || want === 'eyebrow') && content.eyebrow && content.eyebrow.length <= 28 && content.eyebrow !== content.title) {
    second = up(content.eyebrow);
  } else if (want === 'date') ctx.note('marquee: no date in the copy — the rows repeat the headline alone.');
  if (second && !caps) second = second;
  const markKind = ['star', 'dot', 'dash'].includes(params.mark) ? params.mark : 'star';

  // ---- measure (this also loads the faces the strings need)
  const tracking = ko ? -0.01 : 0.0;
  const strings = [title, second].filter(Boolean);
  const ms = await Promise.all(strings.map((t) => measureInk(t, font.title, tracking)));
  if (!title) strings.length = 0;
  const asc = Math.max(0.5, ...ms.map((m) => m.ascent)), desc = Math.max(0, ...ms.map((m) => m.descent));
  const mid = ms.length ? (ms[0].ascent - ms[0].descent) / 2 : 0.35;        // the title's ink centre above the baseline
  const capH = ms.length ? ms[0].ascent : 0.7;
  const markS = capH * (markKind === 'dash' ? 0.34 : markKind === 'dot' ? 0.24 : 0.36);   // half height, em
  const space = capH * 0.5;                                                  // air either side of a mark, em
  // one period of the repeat, in ems: [ { kind: 'text', i, x } | { kind: 'mark', x } ], width. Faces with an
  // optical-size axis set wider at small sizes than at the size measureInk uses, so each row size is laid
  // out again with the advance the SVG text really has at that size (k = rendered / measured).
  const layoutAt = (k) => {
    const seq = []; let px = 0;
    const addText = (i) => { seq.push({ kind: 'text', i, x: px, left: ms[i].left * k[i] }); px += ms[i].width * k[i]; };
    const addMark = () => { px += space; seq.push({ kind: 'mark', x: px + markWidth(markKind, markS) / 2 }); px += markWidth(markKind, markS) + space; };
    if (strings.length) { addText(0); addMark(); if (strings.length > 1) { addText(1); addMark(); } }
    else { for (let n = 0; n < 4; n++) addMark(); }
    return { seq, period: px };
  };
  const textAttrs = (s) => ({ 'font-family': font.title.family, 'font-weight': font.title.weight || 700, 'font-style': font.title.style || 'normal', 'font-size': r2(s), 'letter-spacing': tracking ? `${r2(tracking * s)}px` : null });
  const layouts = new Map();
  const layoutFor = (s) => {
    const key = Math.round(s * 10);
    if (!layouts.has(key)) {
      const k = strings.map((t, i) => {
        const probe = svg('text', { x: 0, y: -s * 4, ...textAttrs(s), text: t });
        probeRoot.append(probe);
        const adv = probe.getComputedTextLength(); probe.remove();
        const r = adv > 0 && ms[i].advance > 0 ? adv / (ms[i].advance * s) : 1;
        return Math.max(0.8, Math.min(1.35, r));
      });
      layouts.set(key, layoutAt(k));
    }
    return layouts.get(key);
  };
  let probeRoot = null;

  // ---- the field, and a clip with straight edges
  guardCopy(ctx);
  const F = ctx.field({ gap: U * 3.5 });
  const sides = copySides(F, ctx);
  const root = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  ctx.root.append(root);
  const defs = svg('defs'); root.append(defs);
  defs.append(svg('clipPath', { id: 'mq-field' }, [svg('rect', { x: r2(F.x), y: r2(F.y), width: r2(F.w), height: r2(F.h) })]));
  const clip = svg('g', { 'clip-path': 'url(#mq-field)' }); root.append(clip);
  probeRoot = svg('g', { 'aria-hidden': 'true' }); root.append(probeRoot);
  if (F.w < U * 12 || F.h < U * 8) ctx.note('marquee: the copy leaves only a small field for the rows in this layout — try left, top or band.');


  const treatment = params.treatment || 'outline';
  const sw = (s) => Math.max(1, s * 0.024);
  /** one row of the phrase: baseline y, size s (px per em), from x0 to x1, shifted by `shift` periods */
  const row = (g, y, s, x0, x1, shift, look) => {
    const { seq, period } = layoutFor(s);
    const P = period * s;
    let x = x0 - ((((shift % 1) + 1) % 1) * P) - P;
    const fill = look.outline ? 'none' : look.ink;
    const stroke = look.outline ? { stroke: look.ink, 'stroke-width': r2(sw(s)), 'stroke-linejoin': 'round' } : {};
    for (; x < x1 + P; x += P) {
      for (const it of seq) {
        if (it.kind === 'text') {
          g.append(svg('text', { x: r2(x + (it.x + it.left) * s), y: r2(y), ...textAttrs(s), fill, ...stroke, text: strings[it.i] }));
        } else {
          g.append(markNode(markKind, x + it.x * s, y - mid * s, markS * s, look.outline ? { fill: 'none', ...stroke } : { fill: look.mark || look.ink }));
        }
      }
    }
  };
  const lookOf = (i) => {
    if (treatment === 'solid') return { ink: inks[0], mark: inks[1] };
    if (treatment === 'duo') return i % 2 ? { ink: inks[1], mark: inks[0] } : { ink: inks[0], mark: inks[1] };
    return i % 2 ? { ink: inks[1], outline: true } : { ink: inks[0], mark: inks[1] };
  };
  const LEAD = 0.2;                                 // air between rows, as a fraction of the ink height
  const inkH = asc + desc;
  const autoRows = (h) => Math.max(5, Math.min(9, Math.round(h / (U * 9.5))));
  const nRows = +params.rows > 0 ? Math.round(+params.rows) : autoRows(F.h);

  /** rows filling a rectangle edge to edge (y from y0 to y0 + h, n rows) */
  const rowsIn = (g, x0, y0, w, h, n, pitch = h / n) => {
    const s = pitch / (inkH * (1 + LEAD));
    const off = rng();
    for (let i = 0; i < n; i++) {
      const y = y0 + i * pitch + pitch / 2 + ((asc - desc) / 2) * s;
      row(g, y, s, x0, x0 + w, off + i * 0.382 + (i % 2) * 0.17, lookOf(i));
    }
  };

  if (motif === 'tilt') {
    const ang = Number.isFinite(+params.angle) ? +params.angle : -12, a = (Math.abs(ang) * Math.PI) / 180;
    const cw = F.w * Math.cos(a) + F.h * Math.sin(a), ch = F.w * Math.sin(a) + F.h * Math.cos(a);
    const pitch = F.h / nRows, n = Math.ceil(ch / pitch) + 1;
    const cx = F.x + F.w / 2, cy = F.y + F.h / 2;
    const g = svg('g', { transform: `rotate(${ang} ${r2(cx)} ${r2(cy)})` }); clip.append(g);
    rowsIn(g, cx - cw / 2, cy - (n * pitch) / 2, cw, n * pitch, n, pitch);
  } else if (motif === 'steps') {
    // a crescendo: small rows on the side of the copy, the largest cropped by the page edge
    // the largest row goes to a page edge (and is cropped by it); a field that reaches neither the top nor
    // the bottom of the page puts it on the side away from the heavier copy, whole
    const vs = sides.filter((d) => d.side === 'top' || d.side === 'bottom');
    const bigAtTop = F.edges.top && !F.edges.bottom ? true : F.edges.bottom && !F.edges.top ? false : F.edges.top ? true : vs.length ? vs[0].side === 'bottom' : true;
    const cropped = bigAtTop ? F.edges.top : F.edges.bottom, show = cropped ? 0.8 : 1;
    let n = Math.max(4, Math.min(8, +params.rows > 0 ? Math.round(+params.rows) : 6)), r = 1.45, h0;
    const solve = () => { let sum = 0; for (let i = 0; i < n - 1; i++) sum += r ** i; return F.h / (sum + show * r ** (n - 1)); };
    h0 = solve();
    while (n > 4 && h0 / (1 + LEAD) < U * 2.6) { n--; h0 = solve(); }
    const x0 = Math.max(F.x, ctx.safe.x);
    const g = svg('g'); clip.append(g);
    let y = bigAtTop ? F.y + F.h : F.y;
    for (let i = 0; i < n; i++) {
      const pitch = h0 * r ** i, s = pitch / (inkH * (1 + LEAD));
      const top = bigAtTop ? y - pitch : y, base = top + pitch / 2 + ((asc - desc) / 2) * s;
      // every row starts flush at the same x, so the crescendo reads as one column of type
      row(g, base, s, x0, F.x + F.w, 0, lookOf(n - 1 - i));
      y += bigAtTop ? -pitch : pitch;
    }
  } else if (motif === 'tape') {
    // broad ribbons of flat colour crossing the field at different angles, like barrier tape
    const nT = Math.max(2, Math.min(3, +params.ribbons || (Math.min(F.w, F.h) < U * 22 ? 2 : 3)));
    const t = Math.max(U * 6, Math.min(U * 18, Math.min(F.w, F.h) * 0.26));
    const lim = Math.max(7, Math.min(26, (Math.atan2(F.h, F.w) * 180) / Math.PI * 0.6));
    const sgn = rng() < 0.5 ? 1 : -1;
    const plan = [[-0.24, 0.8 * lim], [0.02, -lim], [0.27, 0.32 * lim]].slice(0, nT);
    if (nT === 2) { plan[0][0] = -0.16; plan[1][0] = 0.16; }
    const cx = F.x + F.w / 2, cy = F.y + F.h / 2, L = Math.hypot(F.w, F.h) * 1.4;
    const colours = [inks[0], inks[1], pal.colors[2] ? inks[2] : mix(inks[0], inks[1], 0.5)];
    const s = (t * 0.5) / inkH;
    const laid = [];
    plan.forEach(([oy, deg], k) => {
      const ang = deg * sgn, px0 = cx + (k - (nT - 1) / 2) * F.w * 0.08, py0 = cy + oy * F.h;
      const tf = `rotate(${r2(ang)} ${r2(px0)} ${r2(py0)})`;
      const band = { x: px0 - L / 2, y: py0 - t / 2, width: L, height: t };
      // the shadow of this ribbon falls only on the ribbons it lies over
      if (laid.length) {
        const id = `mq-under-${k}`;
        defs.append(svg('clipPath', { id }, laid.map((l) => svg('rect', { ...l.band, transform: l.tf }))));
        const sh = svg('g', { 'clip-path': `url(#${id})` }); clip.append(sh);
        sh.append(svg('rect', { x: r2(band.x), y: r2(band.y + t * 0.07), width: r2(L), height: r2(t), fill: alpha(pal.ink, ctx.tone === 'dark' ? 0.45 : 0.22), transform: tf }));
      }
      const g = svg('g', { transform: tf }); clip.append(g);
      const colour = colours[k % colours.length];
      g.append(svg('rect', { x: r2(band.x), y: r2(band.y), width: r2(L), height: r2(t), fill: colour }));
      const ink = readableOn(colour, [pal.bg, pal.ink, ...pal.colors.filter((c) => c !== colour)]);
      const hair = Math.max(1, t * 0.035);
      for (const e of [0.11, 0.89]) g.append(svg('rect', { x: r2(band.x), y: r2(band.y + t * e - hair / 2), width: r2(L), height: r2(hair), fill: ink }));
      const y = py0 + ((asc - desc) / 2) * s;
      row(g, y, s, band.x, band.x + L, rng(), { ink, mark: ink });
      laid.push({ band, tf });
    });
  } else {
    const g = svg('g'); clip.append(g);
    rowsIn(g, F.x, F.y, F.w, F.h, nRows);
  }
}
