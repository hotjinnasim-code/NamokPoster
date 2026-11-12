// calendar — the event's date shown on a calendar: a month sheet with the day ringed in colour, a
// daily tear-off block (일력) with month and day set large together, or the strip of the event's week. An HTML scene: SVG shapes
// and text set in the poster's own faces, so it is vector and changes with the type theme.
//
// Palette: colors[0] = the mark (the disc / band on the event day, the tear-off numeral)
//          colors[1] = paper (the tear-off pages, the month sheet when paper = sheet)
//          colors[2] = binding (the tear-off's strip)
//          accent    = Sundays
// Motifs:  month (a month sheet) · tearoff (a daily tear-off block) · week (the seven days of the event's week)
// Params:  paper = none | sheet (month: on the page, or on a sheet of paper with a shadow)
//          weekStart = sun | mon
// Helpers written here (not in html-lib): text measuring with a shared canvas (adv / inkOf), room(),
// placeObject() (fits a rotated object into ctx.fit), shadow().
import { svg, mix, contrast, readableOn, standOff, eventDate, inkText, MONTH_NAMES, DAY_NAMES, daysIn, isKorean } from '/skill/assets/web/html-lib.js';

// ------------------------------------------------------------------ measuring
const cv = document.createElement('canvas').getContext('2d');
const spec = (f, size) => `${f.style || 'normal'} ${f.weight || 400} ${size}px ${f.family}`;
async function load(f, text) { try { await document.fonts.load(spec(f, 100), text); } catch { /* measured with what is there */ } }
/** advance width of a string (px), without the trailing letter-space */
function adv(text, f, size, tr = 0) { cv.font = spec(f, size); cv.letterSpacing = `${tr * size}px`; const w = cv.measureText(text).width; cv.letterSpacing = '0px'; return w - (tr && text ? tr * size : 0); }
/** ink ascent / descent of a string (px) */
function inkOf(text, f, size) { cv.font = spec(f, size); cv.letterSpacing = '0px'; const m = cv.measureText(text); return { asc: m.actualBoundingBoxAscent, desc: m.actualBoundingBoxDescent }; }
/** an SVG <text> */
function txt(parent, s, x, y, f, size, { anchor = 'start', tr = 0, ...attrs } = {}) {
  const n = svg('text', { x, y, 'font-family': f.family, 'font-weight': f.weight || 400, 'font-style': f.style || 'normal', 'font-size': size, 'text-anchor': anchor, 'letter-spacing': tr ? `${tr * size}px` : null, ...attrs, text: s });
  parent.append(n); return n;
}
/** the free room the layout left, inside the margins (px) */
function room(ctx) {
  const r = ctx.px(ctx.artRect), s = ctx.safe;
  const x0 = Math.max(r.x, s.x), y0 = Math.max(r.y, s.y), x1 = Math.min(r.x + r.w, s.x + s.w), y1 = Math.min(r.y + r.h, s.y + s.h);
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}
/** a group with local coordinates 0..w × 0..h, turned by `deg` and scaled into the box the layout gives */
function placeObject(ctx, parent, w, h, deg, fill) {
  const a = Math.abs(deg) * Math.PI / 180, bw = w * Math.cos(a) + h * Math.sin(a), bh = w * Math.sin(a) + h * Math.cos(a);
  const box = ctx.fit(bw / bh, { fill });
  const s = box.w / bw;
  const g = svg('g', { transform: `translate(${box.cx} ${box.cy}) rotate(${deg}) scale(${s}) translate(${-w / 2} ${-h / 2})` });
  parent.append(g);
  return { g, s, box };
}
let uid = 0;
/** a soft shadow under a shape (path data in local units) */
function shadow(ctx, g, d, size, dark) {
  const id = `cal-sh-${ctx.seed}-${uid++}`;
  g.append(svg('defs', {}, [svg('filter', { id, x: '-30%', y: '-30%', width: '160%', height: '160%' }, [svg('feGaussianBlur', { stdDeviation: size })])]));
  g.append(svg('path', { d, fill: dark ? 'rgba(0,0,0,0.55)' : 'rgba(20,16,10,0.26)', transform: `translate(${size * 0.35} ${size * 0.9})`, filter: `url(#${id})` }));
}
const rectD = (x, y, w, h, r = 0) => r ? `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z` : `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
/** the first colour of the list that stands off `ground` by `min` (keeps flat palette inks instead of muddying them) */
const pick = (list, ground, min) => list.find((c) => c && contrast(c, ground) >= min);
const isoWeek = (y, m, d) => { const t = new Date(Date.UTC(y, m - 1, d)); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y0) / 864e5 + 1) / 7); };

export default async function build(ctx) {
  const { W, H, unit: U, palette: pal, params, content, font } = ctx;
  const motif = params.motif || 'month';
  const ko = ctx.lang === 'ko' || isKorean(content.title);
  const date = eventDate(content);
  // the copy names a weekday that the date does not fall on: say so (the calendar shows the true weekday)
  if (date) {
    const all = [...content.meta.map((r) => r.value), content.eyebrow, content.subtitle, content.title].join(' · '), at = all.indexOf(date.text);
    const after = at >= 0 ? all.slice(at + date.text.length, at + date.text.length + 12) : '', before = at >= 0 ? all.slice(Math.max(0, at - 14), at) : '';
    const wdKo = after.match(/^\.?\s*[(（]\s*(주일|[일월화수목금토])/), wdEn = before.match(/\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\.?,?\s*$/i) || after.match(/^\.?,?\s*\(?(sun|mon|tue|wed|thu|fri|sat)/i);
    const said = wdKo ? (wdKo[1] === '주일' ? 0 : '일월화수목금토'.indexOf(wdKo[1])) : wdEn ? ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(wdEn[1].toLowerCase()) : -1;
    if (said >= 0 && said !== date.weekday) ctx.note(`calendar: the copy gives the date as a ${DAY_NAMES.en[said]}, but ${date.day} ${MONTH_NAMES.en[date.month - 1]} ${date.year} is a ${DAY_NAMES.en[date.weekday]} — the calendar shows the true weekday. Check the date.`);
  }
  const now = new Date();
  const Y = date ? date.year : now.getFullYear(), M = date ? date.month : now.getMonth() + 1;
  if (!date) ctx.note(`calendar: the copy names no date, so the ${motif === 'month' ? 'current month is shown without a mark' : motif === 'week' ? 'current week is shown without a mark' : 'tear-off shows the current month'}. Put the date in "meta" (label 일시 / Date) to mark the day.`);
  const dark = ctx.tone === 'dark';
  const f = {
    title: font.title,
    cap: { family: font.body.family, weight: 600, style: 'normal' },
    body: { family: font.body.family, weight: 500, style: 'normal' },
  };
  const root = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  ctx.root.append(root);
  const two = (n) => String(n).padStart(2, '0');
  const monthName = ko ? `${M}월` : MONTH_NAMES.en[M - 1];
  const env = { ctx, root, pal, params, date, ko, Y, M, f, dark, two, monthName, U };
  await load(f.title, '0123456789' + monthName + DAY_NAMES.ko.join('') + DAY_NAMES.en.join('').toUpperCase());
  await load(f.cap, '0123456789년월일화수목금토주차 SMTWFAEKNUOVBRCJLGPY');
  if (motif === 'tearoff') await tearoff(env);
  else if (motif === 'week') await week(env);
  else await month(env);
}

// ------------------------------------------------------------------ month: a month sheet
async function month({ ctx, root, pal, params, date, ko, Y, M, f, dark, monthName }) {
  const ws = params.weekStart === 'mon' ? 1 : 0;
  const lead = (new Date(Date.UTC(Y, M - 1, 1)).getUTCDay() - ws + 7) % 7, nd = daysIn(Y, M), weeks = Math.ceil((lead + nd) / 7);
  const sheet = params.paper === 'sheet';
  // local units: one column = 100. Row height follows the shape of the room the layout left
  const c = 100, rm = room(ctx), ra = rm.w / rm.h;
  const HDR = 0.78, GAP = 0.34, WK = 0.62, LEG = date ? 0.78 : 0.2, pad = sheet ? 0.62 : 0;
  const fixed = HDR + GAP + WK + LEG;
  let r = ((7 + 2 * pad) / (ra * 0.96) - fixed - 2 * pad) / weeks;
  r = Math.max(0.62, Math.min(1.0, r));
  const rh = r * c, gw = 7 * c, gh = (fixed + weeks * r) * c;
  const w = gw + 2 * pad * c, h = gh + 2 * pad * c;
  const deg = sheet ? ctx.rng.range(0.8, 1.8) * ctx.rng.sign() : 0;
  const { g } = placeObject(ctx, root, w, h, deg, sheet ? 0.86 : 0.92);

  // colours: on the page, or on the sheet
  const paper = pal.colors[1] || pal.bg;
  const ground = sheet ? paper : pal.bg;
  const ink = sheet ? readableOn(paper, [pal.ink, pal.bg]) : pal.ink;
  const sun = sheet ? pick([pal.accent, pal.colors[0], pal.bg], ground, 2.4) || ink : standOff(pal.accent, ground, ink, 2.4);
  const mark = sheet ? pick([pal.colors[0], pal.bg, pal.colors[2]], ground, 2.2) || ink : standOff(pal.colors[0], ground, ink, 1.8);
  const onMark = readableOn(mark, [ground, ink, pal.bg, pal.ink]);
  const hair = mix(ink, ground, 0.72), rule = mix(ink, ground, 0.1);
  if (sheet) {
    shadow(ctx, g, rectD(0, 0, w, h, c * 0.04), c * 0.16, dark);
    g.append(svg('path', { d: rectD(0, 0, w, h, c * 0.04), fill: paper }));
  }
  const G = svg('g', { transform: `translate(${pad * c} ${pad * c})` }); g.append(G);

  // header: the month in the display face, the year at its baseline
  const hdr = await inkText(G, monthName, { x: 0, y: 0, w: gw * 0.72, h: HDR * c }, f.title, { align: 'left', valign: 'bottom', fill: ink, tracking: -0.01 });
  const ys = HDR * c * 0.42;
  txt(G, String(Y), gw, hdr.baseline, f.cap, ys, { anchor: 'end', tr: 0.06, fill: ink });
  let y = (HDR + GAP * 0.5) * c;
  G.append(svg('line', { x1: 0, x2: gw, y1: y, y2: y, stroke: rule, 'stroke-width': c * 0.035 }));
  // weekday row
  const names = ko ? DAY_NAMES.koShort : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const ls = c * 0.24, lAsc = inkOf(ko ? '일월화' : 'SMTWF', f.cap, ls).asc;
  const wy = y + WK * c * 0.5 + GAP * 0.25 * c + lAsc / 2;
  for (let i = 0; i < 7; i++) { const wd = (i + ws) % 7; txt(G, names[wd], (i + 0.5) * c, wy, f.cap, ls, { anchor: 'middle', fill: wd === 0 ? sun : ink, tr: ko ? 0 : 0.08 }); }
  y += (WK + GAP * 0.5) * c;
  G.append(svg('line', { x1: 0, x2: gw, y1: y, y2: y, stroke: hair, 'stroke-width': c * 0.012 }));
  const top = y;

  // the mark: a disc on the day, or a band over a run of days (capped at both ends)
  const cell = (d) => { const i = lead + d - 1; return { col: i % 7, row: Math.floor(i / 7) }; };
  const rad = 0.4 * Math.min(c, rh);
  const marked = new Set();
  if (date && date.year === Y && date.month === M) {
    const endsHere = date.end && date.end.month === M && date.end.year === Y;
    const last = date.end ? (endsHere ? date.end.day : nd) : date.day;
    if (last === date.day) {
      const { col, row } = cell(date.day);
      G.append(svg('circle', { cx: (col + 0.5) * c, cy: top + (row + 0.5) * rh, r: rad, fill: mark }));
    } else {
      const bh = rad * 1.8;
      let segStart = date.day;
      for (let d = date.day; d <= last; d++) {
        const a = cell(d), next = d < last ? cell(d + 1) : null;
        if (next && next.row === a.row) continue;
        const s0 = cell(segStart), cy = top + (a.row + 0.5) * rh;
        const capL = segStart === date.day, capR = d === last && (endsHere || !date.end);
        const x0 = capL ? (s0.col + 0.5) * c - bh / 2 : s0.col * c, x1 = capR ? (a.col + 0.5) * c + bh / 2 : (a.col + 1) * c;
        // round where the run starts or ends, square where it carries on into the next week
        const r0 = capL ? bh / 2 : 0, r1 = capR ? bh / 2 : 0, yT = cy - bh / 2, yB = cy + bh / 2;
        G.append(svg('path', { d: `M${x0 + r0} ${yT}H${x1 - r1}${r1 ? `A${r1} ${r1} 0 0 1 ${x1 - r1} ${yB}` : `V${yB}`}H${x0 + r0}${r0 ? `A${r0} ${r0} 0 0 1 ${x0 + r0} ${yT}` : `V${yT}`}Z`, fill: mark }));
        segStart = d + 1;
      }
    }
    for (let d = date.day; d <= last; d++) marked.add(d);
  }

  // the days, and a hairline under each week
  const ns = 0.36 * Math.min(c, rh) / 0.72;   // a numeral's ink is about 0.72 em high
  const dAsc = inkOf('0123456789', f.title, ns).asc;
  for (let d = 1; d <= nd; d++) {
    const { col, row } = cell(d), wd = (col + ws) % 7;
    txt(G, String(d), (col + 0.5) * c, top + (row + 0.5) * rh + dAsc / 2, f.title, ns, { anchor: 'middle', fill: marked.has(d) ? onMark : wd === 0 ? sun : ink });
  }
  for (let k = 1; k <= weeks; k++) { const yy = top + k * rh; G.append(svg('line', { x1: 0, x2: gw, y1: yy, y2: yy, stroke: k === weeks ? rule : hair, 'stroke-width': k === weeks ? c * 0.02 : c * 0.012 })); }

  // a key under the sheet: the marked day in words, and the time
  if (date) {
    const ky = top + weeks * rh + LEG * c * 0.62, ks = c * 0.24;
    const two = (n) => String(n).padStart(2, '0');
    let s;
    if (date.end) s = ko ? `${date.month}월 ${date.day}일 – ${date.end.month}월 ${date.end.day}일` : `${date.day} ${MONTH_NAMES.en[date.month - 1]} – ${date.end.day} ${MONTH_NAMES.en[date.end.month - 1]}`;
    else s = ko ? `${date.month}월 ${date.day}일 ${DAY_NAMES.ko[date.weekday]}` : `${DAY_NAMES.en[date.weekday]} ${date.day} ${MONTH_NAMES.en[date.month - 1]}`;
    const kAsc = inkOf('0123456789', f.cap, ks).asc;
    G.append(svg('circle', { cx: ks * 0.45, cy: ky - kAsc / 2, r: ks * 0.42, fill: mark }));
    txt(G, s, ks * 1.35, ky, f.cap, ks, { fill: ink, tr: 0.02 });
    if (date.time) txt(G, date.time, gw, ky, f.cap, ks, { anchor: 'end', fill: ink, tr: 0.04 });
    void two;
  }
}

// ------------------------------------------------------------------ tearoff: a daily tear-off block
async function tearoff({ ctx, root, pal, date, ko, Y, M, f, dark }) {
  const w = 1000, top = 70, strip = 135, pageH = 900, under = 4, step = 11;
  const h = top + strip + pageH + under * step + 6;
  const deg = ctx.rng.range(1.6, 3.4) * ctx.rng.sign();
  const { g } = placeObject(ctx, root, w, h, deg, 0.84);
  const paper = pal.colors[1] || '#fbf8f1';
  const ink = readableOn(paper, [pal.ink, pal.bg]);
  const binding = standOff(pal.colors[2] || ink, paper, ink, 1.6);
  // the numeral: the first of the palette's inks that reads on the paper (a pale yellow does not: then the page colour)
  const num = [pal.colors[0], pal.bg, pal.colors[2], ink].find((c) => c && contrast(c, paper) >= 2.6) || ink;
  const sun = pick([pal.accent, pal.colors[0]], paper, 2.6) || num;
  const y0 = top, py = top + strip;     // strip top, page top
  shadow(ctx, g, rectD(0, y0, w, strip + pageH + under * step, 24), 34, dark);
  // pages under the front page: their edges show at the bottom
  for (let k = under; k >= 1; k--) {
    const dx = (k % 2 ? 1 : -1) * k * 1.6;
    g.append(svg('path', { d: rectD(dx, py, w, pageH + k * step, 6), fill: mix(paper, ink, 0.05 + k * 0.035), stroke: mix(paper, ink, 0.28), 'stroke-width': 1.4 }));
  }
  g.append(svg('path', { d: rectD(0, py - 10, w, pageH + 10, 6), fill: paper }));
  // the binding strip, with two punched holes and their rings
  g.append(svg('path', { d: `M0 ${py}V${y0 + 24}A24 24 0 0 1 24 ${y0}H${w - 24}A24 24 0 0 1 ${w} ${y0 + 24}V${py}Z`, fill: binding }));
  const ringC = mix(readableOn(binding, ['#ffffff', '#111111']), binding, 0.35);
  for (const hx of [w * 0.28, w * 0.72]) {
    const hy = y0 + strip * 0.55, hr = 19;
    g.append(svg('circle', { cx: hx, cy: hy, r: hr, fill: mix(binding, '#000000', 0.55) }));
    g.append(svg('path', { d: `M${hx - 11} ${hy + 4}V${y0 - 30}A11 11 0 0 1 ${hx + 11} ${y0 - 30}V${hy - 6}`, fill: 'none', stroke: ringC, 'stroke-width': 9, 'stroke-linecap': 'round' }));
  }
  // the perforation the page is torn along
  g.append(svg('line', { x1: 18, x2: w - 18, y1: py + 22, y2: py + 22, stroke: mix(paper, ink, 0.4), 'stroke-width': 3, 'stroke-dasharray': '3 11', 'stroke-linecap': 'round' }));

  const mx = 80, cs = 46;
  const two = (n) => String(n).padStart(2, '0');
  // month and day together, at one size: a lone day number is not a date (no date in the copy: the month)
  const big = date ? `${M}.${two(date.day)}` : (ko ? `${M}월` : MONTH_NAMES.enShort[M - 1]);
  const left = date ? (ko ? `${M}월` : MONTH_NAMES.en[M - 1].toUpperCase()) : String(Y), right = date ? String(Y) : '';
  const capY = py + 112;
  txt(g, left, mx, capY, f.cap, cs, { fill: ink, tr: ko ? 0.04 : 0.14 });
  if (right) txt(g, right, w - mx, capY, f.cap, cs, { anchor: 'end', fill: ink, tr: 0.1 });
  g.append(svg('line', { x1: mx, x2: w - mx, y1: capY + 30, y2: capY + 30, stroke: mix(ink, paper, 0.55), 'stroke-width': 2.4 }));
  // the date, enormous, placed by its ink
  const nb = { x: mx - 10, y: capY + 96, w: w - 2 * mx + 20, h: 350 };
  await inkText(g, big, nb, f.title, { fill: num, tracking: -0.04 });
  // the weekday, then the time (or the end of the run)
  const isSun = date && date.weekday === 0;
  const under1 = date ? (ko ? DAY_NAMES.ko[date.weekday] : DAY_NAMES.en[date.weekday].toUpperCase()) : String(Y);
  await inkText(g, under1, { x: w * 0.2, y: nb.y + nb.h + 70, w: w * 0.6, h: 78 }, f.title, { fill: isSun ? sun : ink, tracking: ko ? 0.02 : 0.08 });
  const foot = date ? (date.end ? `– ${date.end.month}.${two(date.end.day)}` : date.time || '') : '';
  const fy = nb.y + nb.h + 70 + 78 + 112;
  if (foot) {
    txt(g, foot, w / 2, fy, f.cap, cs, { anchor: 'middle', fill: ink, tr: 0.08 });
    const tw = adv(foot, f.cap, cs, 0.08) / 2 + 36;
    for (const s of [-1, 1]) g.append(svg('line', { x1: w / 2 + s * tw, x2: w / 2 + s * (tw + 120), y1: fy - 16, y2: fy - 16, stroke: mix(ink, paper, 0.55), 'stroke-width': 2.4 }));
  } else g.append(svg('line', { x1: w / 2 - 120, x2: w / 2 + 120, y1: fy - 16, y2: fy - 16, stroke: mix(ink, paper, 0.55), 'stroke-width': 2.4 }));
}

// ------------------------------------------------------------------ week: the seven days of the event's week
async function week({ ctx, root, pal, params, date, ko, Y, M, f }) {
  const ws = params.weekStart === 'mon' ? 1 : 0;
  const now = new Date();
  const d0 = date ? new Date(Date.UTC(date.year, date.month - 1, date.day)) : new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const back = (d0.getUTCDay() - ws + 7) % 7;
  const start = new Date(d0.getTime() - back * 864e5);
  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * 864e5));
  // local units: one day column = 200
  const c = 200, w = 7 * c, capH = 96, rows = [116, 250], h = capH + rows[0] + rows[1] + 40;
  const { g } = placeObject(ctx, root, w, h, 0, 0.94);
  const ink = pal.ink, sun = standOff(pal.accent, pal.bg, ink, 2.4), mark = standOff(pal.colors[0], pal.bg, ink, 1.8);
  const onMark = readableOn(mark, [pal.bg, ink]);
  const muted = mix(ink, pal.bg, 0.6);
  // caption row: month and year, the week of the year
  const cs = 44;
  const wk = isoWeek(d0.getUTCFullYear(), d0.getUTCMonth() + 1, d0.getUTCDate());
  txt(g, ko ? `${Y}년 ${M}월` : `${MONTH_NAMES.en[M - 1].toUpperCase()} ${Y}`, 0, capH - 38, f.cap, cs, { fill: ink, tr: ko ? 0.04 : 0.14 });
  txt(g, ko ? `${wk}주차` : `WEEK ${wk}`, w, capH - 38, f.cap, cs, { anchor: 'end', fill: ink, tr: ko ? 0.04 : 0.14 });
  g.append(svg('line', { x1: 0, x2: w, y1: capH, y2: capH, stroke: ink, 'stroke-width': 5 }));

  // numerals as tall as the row allows, but never wider than their column (wide faces, two digits)
  const names = ko ? DAY_NAMES.koShort : DAY_NAMES.enShort;
  const ls = 48;
  let ns = rows[1] * 0.56 / 0.72;
  const widest = Math.max(...days.map((d) => adv(String(d.getUTCDate()), f.title, ns)));
  if (widest > c * 0.6) ns *= c * 0.6 / widest;
  const nAsc = inkOf('0123456789', f.title, ns).asc, lAsc = inkOf(ko ? '일월화' : 'SMTWF', f.cap, ls).asc;
  const ly = capH + rows[0] * 0.62, ny0 = capH + rows[0];
  const nBase = ny0 + rows[1] * 0.46 + nAsc / 2;          // numerals centred in their row

  // the mark: a tall pill through the weekday and the numeral, run across the days of a range
  const ev = new Set();
  if (date) {
    const end = date.end ? new Date(Date.UTC(date.end.year, date.end.month - 1, date.end.day)) : d0;
    days.forEach((d, i) => { if (d >= d0 && d <= end) ev.add(i); });
    const idx = [...ev];
    if (idx.length) {
      const a = Math.min(...idx), b = Math.max(...idx), pw = c * 0.86, open = end > days[6], r = pw / 2;
      const pad = c * 0.15, yT = Math.max(capH + 10, ly - lAsc - pad), yB = nBase + (ly - lAsc - yT);   // as much air under the numeral as over the weekday
      const x0 = (a + 0.5) * c - pw / 2, x1 = open ? w : (b + 0.5) * c + pw / 2;
      if (!open) g.append(svg('rect', { x: x0, y: yT, width: x1 - x0, height: yB - yT, rx: r, fill: mark }));
      else g.append(svg('path', { d: `M${x1} ${yT}H${x0 + r}A${r} ${r} 0 0 0 ${x0} ${yT + r}V${yB - r}A${r} ${r} 0 0 0 ${x0 + r} ${yB}H${x1}Z`, fill: mark }));
    }
  }
  const nums = [];
  days.forEach((d, i) => {
    const wd = d.getUTCDay(), other = d.getUTCMonth() + 1 !== M, on = ev.has(i);
    const colr = on ? onMark : other ? muted : wd === 0 ? sun : ink;
    txt(g, names[wd], (i + 0.5) * c, ly, f.cap, ls, { anchor: 'middle', fill: on ? onMark : wd === 0 ? sun : ink, tr: ko ? 0 : 0.1 });
    nums.push(txt(g, String(d.getUTCDate()), (i + 0.5) * c, nBase, f.title, ns, { anchor: 'middle', fill: colr }));
  });
  // check what was really set: a face can come out wider than the canvas measured it — then shrink the row
  let real = 0;
  for (const n of nums) { try { real = Math.max(real, n.getBBox().width); } catch { /* keep */ } }
  if (real > c * 0.7) {
    const k = c * 0.66 / real;
    for (const n of nums) { n.setAttribute('font-size', ns * k); n.setAttribute('y', nBase - nAsc * (1 - k) / 2); }
  }
  g.append(svg('line', { x1: 0, x2: w, y1: h - 6, y2: h - 6, stroke: mix(ink, pal.bg, 0.6), 'stroke-width': 2 }));
}
