// ticket — printed ephemera carrying the event's information: an admission ticket with a perforated
// stub, a boarding-pass-like pass with two large codes, or a long paper receipt in the mono face. The
// words on it are the poster's own (headline, information rows, verbatim); the scene adds only the
// conventions of the form (입장권 / ADMIT ONE, captions, a seeded serial number, a barcode of plain bars).
// An HTML scene: SVG shapes and text in the poster's faces — vector, and it changes with the type theme.
//
// Palette: colors[0] = ticket stock (the admit ticket and the pass)
//          colors[1] = the printed second ink (the stub, the pass's header band, emphasised words)
//          colors[2] = receipt paper
//          lettering on the stock / paper is pal.ink or pal.bg, whichever reads (readableOn)
// Motifs:  admit (admission ticket, horizontal or vertical) · pass (header band, two codes, fields)
//          receipt (zigzag paper, line items, total, barcode)
// Params:  orient = auto | horizontal | vertical (admit and pass: auto follows the shape of the room)
//          tilt = degrees of turn (sign seeded); 0 sets the ticket square
// Helpers written here (not in html-lib): canvas measuring (adv / ellipsize), fitHeadline() (breaks the
// headline into 1–3 lines at the largest size, keeps *emphasis*, truncates with … when it must),
// ticketPath() (rounded ticket with end notches and perforation notches), barcode(), shadow(), placeObject().
import { svg, mix, contrast, readableOn, eventDate, measureInk, MONTH_NAMES, DAY_NAMES, isKorean } from '/skill/assets/web/html-lib.js';

// ------------------------------------------------------------------ measuring
const cv = document.createElement('canvas').getContext('2d');
const spec = (f, size) => `${f.style || 'normal'} ${f.weight || 400} ${size}px ${f.family}`;
async function load(f, text) { try { await document.fonts.load(spec(f, 100), text); } catch { /* measured with what is there */ } }
/** advance width of a string (px), without the trailing letter-space */
function adv(text, f, size, tr = 0) { cv.font = spec(f, size); cv.letterSpacing = `${tr * size}px`; const w = cv.measureText(text).width; cv.letterSpacing = '0px'; return w - (tr && text ? tr * size : 0); }
/** the string cut to `maxW` with an ellipsis (whole string when it fits) */
function ellipsize(text, f, size, maxW, tr = 0) {
  text = String(text);
  if (adv(text, f, size, tr) <= maxW) return text;
  const chars = [...text];
  let lo = 0, hi = chars.length;
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (adv(chars.slice(0, mid).join('').trimEnd() + '…', f, size, tr) <= maxW) lo = mid; else hi = mid - 1; }
  return lo ? chars.slice(0, lo).join('').replace(/[\s·,:;–—-]+$/, '') + '…' : '…';
}
/** the string broken at spaces into at most `maxLines` lines of `maxW`; the last cut with an ellipsis */
function wrapText(text, f, size, maxW, maxLines = 2) {
  const words = String(text).split(/\s+/).filter(Boolean), lines = [];
  let cur = '';
  for (let i = 0; i < words.length; i++) {
    const tryS = cur ? cur + ' ' + words[i] : words[i];
    if (adv(tryS, f, size) <= maxW || !cur) { cur = tryS; continue; }
    lines.push(cur); cur = words[i];
    if (lines.length === maxLines - 1) { cur = words.slice(i).join(' '); break; }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, maxLines).map((l) => ellipsize(l, f, size, maxW));
}
/** an SVG <text> */
function txt(parent, s, x, y, f, size, { anchor = 'start', tr = 0, ...attrs } = {}) {
  const n = svg('text', { x, y, 'font-family': f.family, 'font-weight': f.weight || 400, 'font-style': f.style || 'normal', 'font-size': size, 'text-anchor': anchor, 'letter-spacing': tr ? `${tr * size}px` : null, ...attrs, text: s });
  parent.append(n); return n;
}
/** the width a string really takes when set in SVG (px at `size`): the browser's own fallback faces included */
function setWidth(g, text, f, size, tr = 0) {
  const n = txt(g, text, 0, 0, f, size, { tr, opacity: 0 });
  let w = 0; try { w = n.getBBox().width; } catch { /* not laid out */ }
  n.remove();
  return w || adv(text, f, size, tr);
}
const caps = (s, ko) => (ko ? s : String(s).toUpperCase());
/** the free room the layout left, inside the margins (px) */
function room(ctx) {
  const r = ctx.px(ctx.artRect), s = ctx.safe;
  const x0 = Math.max(r.x, s.x), y0 = Math.max(r.y, s.y), x1 = Math.min(r.x + r.w, s.x + s.w), y1 = Math.min(r.y + r.h, s.y + s.h);
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}
/** the box and scale for an object of w × h local units turned by `deg` */
function boxFor(ctx, w, h, deg, fill) {
  const a = Math.abs(deg) * Math.PI / 180, bw = w * Math.cos(a) + h * Math.sin(a), bh = w * Math.sin(a) + h * Math.cos(a);
  const box = ctx.fit(bw / bh, { fill });
  return { box, s: box.w / bw };
}
/** a group with local coordinates 0..w × 0..h, turned and scaled into the box */
function placeObject(parent, { box, s }, w, h, deg) {
  const g = svg('g', { transform: `translate(${box.cx} ${box.cy}) rotate(${deg}) scale(${s}) translate(${-w / 2} ${-h / 2})` });
  parent.append(g); return g;
}
let uid = 0;
/** a soft shadow under a shape (path data in local units) */
function shadow(ctx, g, d, size, dark) {
  const id = `tk-sh-${ctx.seed}-${uid++}`;
  g.append(svg('defs', {}, [svg('filter', { id, x: '-30%', y: '-30%', width: '160%', height: '160%' }, [svg('feGaussianBlur', { stdDeviation: size })])]));
  g.append(svg('path', { d, fill: dark ? 'rgba(0,0,0,0.6)' : 'rgba(20,16,10,0.28)', transform: `translate(${size * 0.3} ${size * 0.85})`, filter: `url(#${id})` }));
}
const pick = (list, ground, min) => list.find((c) => c && contrast(c, ground) >= min);

/**
 * A ticket outline, w × h, rounded corners rc, a half-round notch rn in the middle of each end and a
 * pair of notches rp where the perforation `at` crosses the edges. vertical: the same ticket turned a
 * quarter (stub at the bottom) — built horizontal and rotated, so the arcs keep their sense.
 */
function ticketPath(w, h, { rc, rn, rp, at, vertical = false }) {
  const W = vertical ? h : w, H = vertical ? w : h;          // the horizontal ticket we draw
  const P = vertical ? (x, y) => [H - y, x] : (x, y) => [x, y];
  const p = (x, y) => P(x, y).map((v) => Math.round(v * 100) / 100).join(' ');
  const arc = (r, sweep, x, y) => `A${r} ${r} 0 0 ${sweep} ${p(x, y)}`;
  let d = `M${p(rc, 0)}`;
  if (at != null) d += `L${p(at - rp, 0)}${arc(rp, 0, at + rp, 0)}`;
  d += `L${p(W - rc, 0)}${arc(rc, 1, W, rc)}`;
  if (rn) d += `L${p(W, H / 2 - rn)}${arc(rn, 0, W, H / 2 + rn)}`;
  d += `L${p(W, H - rc)}${arc(rc, 1, W - rc, H)}`;
  if (at != null) d += `L${p(at + rp, H)}${arc(rp, 0, at - rp, H)}`;
  d += `L${p(rc, H)}${arc(rc, 1, 0, H - rc)}`;
  if (rn) d += `L${p(0, H / 2 + rn)}${arc(rn, 0, 0, H / 2 - rn)}`;
  d += `L${p(0, rc)}${arc(rc, 1, rc, 0)}Z`;
  return d;
}
/** a row of punched holes along a perforation, from (x0, y0) to (x1, y1) */
function perforation(g, x0, y0, x1, y1, r, gap, fill) {
  const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.floor(len / gap));
  for (let i = 0; i <= n; i++) { const t = i / n; g.append(svg('circle', { cx: x0 + (x1 - x0) * t, cy: y0 + (y1 - y0) * t, r, fill })); }
}
/** a barcode of plain bars filling w × h (seeded); vertical: bars run across */
function barcode(g, rng, x, y, w, h, fill, { vertical = false } = {}) {
  const mods = [];
  let n = 0;
  mods.push([1, 1], [1, 0], [1, 1]); n += 3;                    // start guard
  while (n < 88) { const b = rng.int(1, 3), s = rng.int(1, 3); mods.push([b, 1], [s, 0]); n += b + s; }
  mods.push([1, 1], [1, 0], [1, 1]); n += 3;                    // end guard
  const len = vertical ? h : w, k = len / n;
  let t = 0;
  for (const [m, on] of mods) {
    if (on) g.append(vertical ? svg('rect', { x, y: y + t * k, width: w, height: m * k * 0.98, fill }) : svg('rect', { x: x + t * k, y, width: m * k * 0.98, height: h, fill }));
    t += m;
  }
}
const serialOf = (rng) => String(rng.int(0, 9999999)).padStart(7, '0');

/** the headline as words carrying their emphasis: [{ text, segs: [{ text, em }] }] (*emphasis* may start or end mid-word) */
function headlineWords(raw, plain) {
  const words = [];
  let em = false;
  for (const tok of String(raw || plain || '').replace(/\*\*/g, '').split(/\s+/)) {
    const segs = [];
    let cur = '';
    for (const ch of tok) {
      if (ch === '*') { if (cur) segs.push({ text: cur, em }); cur = ''; em = !em; continue; }
      cur += ch;
    }
    if (cur) segs.push({ text: cur, em });
    if (segs.length) words.push({ segs, text: segs.map((x) => x.text).join('') });
  }
  return words;
}
/**
 * Break the headline into at most `maxLines` lines at the largest size that fits w × h (line pitch
 * `lead` em). Below `minSize` the last words go and an ellipsis ends the last line.
 * → { lines: [[word]], size }
 */
function fitHeadline(words, f, w, h, { maxLines = 2, lead = 1.08, minSize = 0, tr = 0 } = {}) {
  if (!words.length) return { lines: [], size: 0 };
  const lineW = (ws) => adv(ws.map((x) => x.text).join(' '), f, 100, tr) / 100;   // in em
  const best = (ws) => {
    let top = null;
    for (let n = 1; n <= Math.min(maxLines, ws.length); n++) {
      // balanced breaks: try every split for short headlines, greedy otherwise
      const splits = [];
      const rec = (start, left, acc) => {
        if (left === 1) { splits.push([...acc, ws.slice(start)]); return; }
        for (let i = start + 1; i <= ws.length - left + 1; i++) rec(i, left - 1, [...acc, ws.slice(start, i)]);
      };
      if (ws.length <= 12) rec(0, n, []); else { const per = Math.ceil(ws.length / n); splits.push(Array.from({ length: n }, (_, k) => ws.slice(k * per, (k + 1) * per)).filter((l) => l.length)); }
      for (const lines of splits) {
        const wide = Math.max(...lines.map(lineW)), size = Math.min(w / wide, h / (lines.length * lead - (lead - 0.82)));
        // prefer fewer lines unless more lines are clearly bigger
        if (!top || size > top.size * 1.12 || (size > top.size && lines.length === top.lines.length)) top = { lines, size };
      }
    }
    return top;
  };
  let r = best(words);
  if (r.size >= minSize || words.length === 1) return r;
  for (let k = words.length - 1; k >= 1; k--) {
    const ws = words.slice(0, k).map((x) => ({ ...x, segs: [...x.segs] }));
    const last = ws[k - 1];
    ws[k - 1] = { text: last.text + '…', segs: [...last.segs.slice(0, -1), { ...last.segs[last.segs.length - 1], text: last.segs[last.segs.length - 1].text + '…' }] };
    r = best(ws);
    if (r.size >= minSize) return r;
  }
  return r;
}
/** draw fitted headline lines from the top-left (x, top) — or centred on x with anchor middle */
function drawHeadline(g, fit, x, top, f, { fill, em, anchor = 'start', lead = 1.08, asc = 0.8, tr = 0 }) {
  fit.lines.forEach((line, i) => {
    const t = svg('text', { x, y: top + fit.size * (asc + i * lead), 'font-family': f.family, 'font-weight': f.weight || 700, 'font-style': f.style || 'normal', 'font-size': fit.size, 'text-anchor': anchor, 'letter-spacing': tr ? `${tr * fit.size}px` : null, fill });
    line.forEach((w, k) => {
      w.segs.forEach((s, j) => t.append(svg('tspan', { fill: s.em ? em : fill, text: (k && !j ? ' ' : '') + s.text })));
    });
    g.append(t);
  });
  return top + fit.size * (asc + (fit.lines.length - 1) * lead);   // baseline of the last line
}

// ------------------------------------------------------------------ reading the copy
const FEE_LABEL = /참가비|입장료|관람료|요금|가격|비용|회비|티켓|fee|price|ticket|admission|cost|entry/i;
const FEE_VALUE = /무료|free|₩|\d\s*원|\$|€|£|¥/i;
const DATE_LABEL = /일시|날짜|기간|일정|언제|date|when|day/i;
const PLACE_LABEL = /장소|위치|곳|venue|place|where|location/i;
function feeOf(meta) {
  const row = meta.find((r) => FEE_LABEL.test(r.label) && r.value) || meta.find((r) => FEE_VALUE.test(r.value));
  if (!row) return null;
  const v = row.value, free = v.match(/무료|free/i);
  if (free && !/₩|\d\s*원|\$|€|£/.test(v)) return { row, text: free[0] };
  const price = v.match(/(?:[₩$€£¥]\s*[\d,.]+|[\d,.]+\s*원)/);
  return { row, text: price ? price[0] : v };
}
function dateWords(date, ko) {
  if (!date) return null;
  const two = (n) => String(n).padStart(2, '0');
  return {
    code: ko ? `${two(date.month)}.${two(date.day)}` : `${MONTH_NAMES.enShort[date.month - 1]} ${date.day}`,
    day: ko ? DAY_NAMES.ko[date.weekday] : DAY_NAMES.enShort[date.weekday],
    full: ko ? `${date.year}.${two(date.month)}.${two(date.day)} (${DAY_NAMES.koShort[date.weekday]})` : `${DAY_NAMES.enShort[date.weekday]} ${date.day} ${MONTH_NAMES.enShort[date.month - 1]} ${date.year}`,
    year: String(date.year),
  };
}

export default async function build(ctx) {
  const { W, H, palette: pal, params, content, font } = ctx;
  const motif = params.motif || 'admit';
  const ko = ctx.lang === 'ko' || isKorean(content.title);
  const date = eventDate(content);
  const meta = (content.meta || []).filter((r) => r.value);
  if (!meta.length) ctx.note('ticket: the copy has no information rows, so the ticket carries the headline, a serial number and a barcode only. Add "meta" rows (일시, 장소, 참가비) to print them on it.');
  const stock = pal.colors[0] || '#f4efe4', paper = pal.colors[2] || '#fbf8f1';
  const f = {
    title: font.title,
    cap: { family: font.body.family, weight: 600, style: 'normal' },
    body: { family: font.body.family, weight: 500, style: 'normal' },
    mono: { family: font.mono.family, weight: 500, style: 'normal' },
    monoB: { family: font.mono.family, weight: 700, style: 'normal' },
  };
  const all = [content.title, content.eyebrow, ...meta.map((r) => r.label + r.value), '입장권ADMITONEPASSNo.0123456789합계TOTAL감사합니다THANKYOU날짜시간요일번호DATETIMEDAY'].join('');
  await Promise.all([load(f.title, all), load(f.cap, all), load(f.body, all), load(f.mono, all), load(f.monoB, all)]);
  const root = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  ctx.root.append(root);
  const rm = room(ctx);
  const vertical = params.orient === 'vertical' || (params.orient !== 'horizontal' && rm.w / rm.h < 1.15);
  const tilt = params.tilt != null && params.tilt !== '' ? Math.abs(+params.tilt) : null;
  const env = { ctx, root, pal, params, content, meta, date, dw: dateWords(date, ko), ko, f, stock, paper, vertical, tilt, dark: ctx.tone === 'dark', words: headlineWords(content.titleRaw, content.title) };
  if (motif === 'pass') await pass(env);
  else if (motif === 'receipt') await receipt(env);
  else await admit(env);
}

/** inks on a ground: lettering, the second ink, hairlines */
function inksOn(ground, pal) {
  const ink = readableOn(ground, [pal.ink, pal.bg]);
  const ink2 = pick([pal.colors[1], pal.accent, pal.bg], ground, 2.6) || ink;
  return { ink, ink2, soft: mix(ink, ground, 0.35), hair: mix(ink, ground, 0.62) };
}
/** pick the rows to print: up to n, the date / place / fee rows first, then the rest in order */
function rowsFor(meta, n) {
  const key = (r) => (DATE_LABEL.test(r.label) ? 0 : PLACE_LABEL.test(r.label) ? 1 : FEE_LABEL.test(r.label) ? 2 : 3);
  return meta.map((r, i) => ({ r, i, k: key(r) })).sort((a, b) => a.k - b.k || a.i - b.i).slice(0, n).sort((a, b) => a.i - b.i).map((x) => x.r);
}
/** a caption over a value, the value cut to the width */
function field(g, label, value, x, y, w, { f, capS, valS, ink, soft, ko, anchor = 'start' }) {
  if (label) txt(g, ellipsize(caps(label, ko), f.cap, capS, w, ko ? 0.04 : 0.14), anchor === 'end' ? x + w : x, y, f.cap, capS, { fill: soft, tr: ko ? 0.04 : 0.14, anchor });
  txt(g, ellipsize(value, f.body, valS, w), anchor === 'end' ? x + w : x, y + valS * 1.45, f.body, valS, { fill: ink, anchor });
}

// ------------------------------------------------------------------ admit: an admission ticket
async function admit({ ctx, root, pal, content, meta, ko, f, stock, vertical, tilt, dark, words }) {
  const rng = ctx.rng, U = ctx.unit;
  const w = vertical ? 520 : 1000, h = vertical ? 1000 : 420;
  const deg = (tilt ?? rng.range(2.2, 4.2)) * rng.sign();
  const place = boxFor(ctx, w, h, deg, 0.86);
  const minS = 1.55 * U / place.s;                                  // nothing under 1.5 unit once scaled
  const g = placeObject(root, place, w, h, deg);
  const { ink, ink2, soft, hair } = inksOn(stock, pal);
  const stubC = ink2, onStub = readableOn(stubC, [stock, pal.ink, pal.bg]);
  const at = vertical ? 735 : 740;                                    // the perforation
  const d = ticketPath(w, h, { rc: 18, rn: 30, rp: 16, at, vertical });
  shadow(ctx, g, d, 18, dark);
  g.append(svg('path', { d, fill: stock }));
  // the stub printed solid in the second ink (clipped to the ticket's outline)
  const cid = `tk-clip-${ctx.seed}-${uid++}`;
  g.append(svg('defs', {}, [svg('clipPath', { id: cid }, [svg('path', { d })])]));
  const clip = svg('g', { 'clip-path': `url(#${cid})` }); g.append(clip);
  clip.append(vertical ? svg('rect', { x: 0, y: at, width: w, height: h - at, fill: stubC }) : svg('rect', { x: at, y: 0, width: w - at, height: h, fill: stubC }));
  if (vertical) perforation(g, 26, at, w - 26, at, 4.2, 15, pal.bg); else perforation(g, at, 26, at, h - 26, 4.2, 15, pal.bg);
  // a fine frame inside the main part
  const inset = 22;
  const mainW = vertical ? w : at, mainH = vertical ? at : h;
  g.append(svg('rect', { x: inset, y: inset, width: mainW - inset * 2, height: mainH - inset * 2, rx: 8, fill: 'none', stroke: hair, 'stroke-width': 2 }));

  const capS = Math.max(20, minS), valS = Math.max(29, minS * 1.3), tr = ko ? 0.04 : 0.16;
  const serial = serialOf(rng);
  const admitKo = '입장권', admitEn = 'ADMIT ONE';
  const pad = 58, x0 = pad, x1 = mainW - pad;
  // top row: 입장권 · ADMIT ONE on the left, the serial on the right
  let y = pad + capS * 0.9;
  const kind = ko ? `${admitKo} · ${admitEn}` : admitEn;
  txt(g, ellipsize(kind, f.cap, capS, x1 - x0, tr), x0, y, f.cap, capS, { fill: ink2, tr });
  // the serial beside it when there is room (it is on the stub in any case)
  if (adv(kind, f.cap, capS, tr) + adv(`No. ${serial}`, f.mono, capS, 0.06) + capS * 2 < x1 - x0) txt(g, `No. ${serial}`, x1, y, f.mono, capS, { fill: soft, anchor: 'end', tr: 0.06 });
  y += capS * 0.9;
  g.append(svg('line', { x1: x0, x2: x1, y1: y, y2: y, stroke: ink, 'stroke-width': 2.4 }));
  // the rows at the foot of the main part
  const rows = rowsFor(meta, 3);
  const rowH = valS * 1.45 + capS * 1.9;
  let rowsTop;
  if (vertical) rowsTop = mainH - pad - rows.length * rowH + capS * 0.4;
  else rowsTop = mainH - pad - rowH + capS * 0.4;
  // the headline in the room between
  const hTop = y + 30, hBot = (rows.length ? rowsTop - capS * 2.4 : mainH - pad - 10);
  const fit = fitHeadline(words, f.title, x1 - x0, hBot - hTop, { maxLines: vertical ? 4 : 2, minSize: 54 });
  const asc = 0.8, lead = 1.08;
  const blockH = fit.size * (asc + (fit.lines.length - 1) * lead + 0.12);
  drawHeadline(g, fit, x0, hTop + Math.max(0, (hBot - hTop - blockH) / 2), f.title, { fill: ink, em: ink2, lead, asc });
  if (rows.length) {
    g.append(svg('line', { x1: x0, x2: x1, y1: rowsTop - capS * 1.5, y2: rowsTop - capS * 1.5, stroke: hair, 'stroke-width': 2 }));
    if (vertical) rows.forEach((r, i) => field(g, r.label, r.value, x0, rowsTop + i * rowH, x1 - x0, { f, capS, valS, ink, soft, ko }));
    else {
      // one row takes the width; several share it, each column as wide as its value asks
      const gap = 28, want = rows.map((r) => adv(r.value, f.body, valS) + 120), tot = want.reduce((a, b) => a + b, 0);
      let x = x0;
      rows.forEach((r, i) => { const cw = (x1 - x0 - gap * (rows.length - 1)) * want[i] / tot; field(g, r.label, r.value, x, rowsTop, cw, { f, capS, valS, ink, soft, ko }); x += cw + gap; });
    }
  }
  // the stub: ADMIT ONE stacked, the serial, a barcode
  if (vertical) {
    const sx0 = 50, sx1 = w - 50, sy0 = at + 40, sy1 = h - 40;
    const big = ko ? admitKo : 'ADMIT';
    const m = await measureInk(big, f.title, ko ? 0 : 0.02);
    const bh = Math.min(60, (sx1 - sx0) * 0.9 * m.height / m.width);
    const bw = bh * m.width / m.height;
    txt(g, big, sx0 - m.left * (bh / m.height), sy0 + m.ascent * (bh / m.height), f.title, bh / m.height, { fill: onStub, tr: ko ? 0 : 0.02 });
    // under it: ADMIT ONE (or ONE) on the left, the serial on the right — the small word only if both fit
    const small = ko ? admitEn : 'ONE', ly = sy0 + bh + capS * 1.9, sw = sx1 - sx0;
    const serW = setWidth(g, `No. ${serial}`, f.mono, capS, 0.06), smW = setWidth(g, small, f.cap, capS, 0.16);
    if (smW + serW + capS * 1.5 <= sw) txt(g, small, sx0, ly, f.cap, capS, { fill: onStub, tr: 0.16 });
    txt(g, ellipsize(`No. ${serial}`, f.mono, capS, sw, 0.06), sx1, ly, f.mono, capS, { fill: onStub, anchor: 'end', tr: 0.06 });
    barcode(g, rng, sx0, ly + capS * 1.1, sw, sy1 - (ly + capS * 1.1), onStub);
  } else {
    const sx0 = at + 40, sx1 = w - 44, sy0 = 50, sy1 = h - 50, sw = sx1 - sx0;
    const big = ko ? admitKo : 'ADMIT';
    const m = await measureInk(big, f.title, 0);
    const size = Math.min(sw / m.width, 64 / m.height);
    txt(g, big, sx0 - m.left * size, sy0 + m.ascent * size, f.title, size, { fill: onStub });
    const yb = sy0 + m.height * size;
    const small = ko ? admitEn : 'ONE';
    if (setWidth(g, small, f.cap, capS, 0.16) <= sw) txt(g, small, sx0, yb + capS * 1.9, f.cap, capS, { fill: onStub, tr: 0.16 });
    txt(g, ellipsize(`No. ${serial}`, f.mono, capS, sw, 0.04), sx0, yb + capS * 3.6, f.mono, capS, { fill: onStub, tr: 0.04 });
    barcode(g, rng, sx0, yb + capS * 4.8, sw, sy1 - (yb + capS * 4.8), onStub);
  }
}

// ------------------------------------------------------------------ pass: a boarding-pass-like pass
async function pass({ ctx, root, pal, content, meta, date, dw, ko, f, stock, vertical, tilt, dark, words }) {
  const rng = ctx.rng, U = ctx.unit;
  const w = vertical ? 540 : 1000, h = vertical ? 1000 : 440;
  const deg = (tilt ?? rng.range(1.2, 2.6)) * rng.sign();
  const place = boxFor(ctx, w, h, deg, 0.88);
  const minS = 1.55 * U / place.s;
  const g = placeObject(root, place, w, h, deg);
  const { ink, ink2, soft, hair } = inksOn(stock, pal);
  const band = ink2, onBand = readableOn(band, [stock, pal.ink, pal.bg]);
  const at = vertical ? 790 : 760;
  const d = ticketPath(w, h, { rc: 22, rn: 0, rp: 18, at, vertical });
  shadow(ctx, g, d, 18, dark);
  g.append(svg('path', { d, fill: stock }));
  const cid = `tk-clip-${ctx.seed}-${uid++}`;
  g.append(svg('defs', {}, [svg('clipPath', { id: cid }, [svg('path', { d })])]));
  const clip = svg('g', { 'clip-path': `url(#${cid})` }); g.append(clip);
  const bandH = vertical ? 150 : 104;
  clip.append(svg('rect', { x: 0, y: 0, width: w, height: bandH, fill: band }));
  if (vertical) perforation(g, 30, at, w - 30, at, 4.2, 15, pal.bg); else perforation(g, at, 30, at, h - 30, 4.2, 15, pal.bg);

  const capS = Math.max(18, minS), valS = Math.max(25, minS * 1.25), tr = ko ? 0.04 : 0.16;
  const serial = serialOf(rng);
  const pad = 44, mainW = vertical ? w : at, x0 = pad, x1 = mainW - pad;
  const kindWord = ko ? '입장 패스' : 'EVENT PASS';
  // the header band: the headline (its first words, fitted) and the kind of pass
  const kw = adv(kindWord, f.cap, capS, tr);
  if (vertical) {
    const fit = fitHeadline(words, f.title, x1 - x0, bandH - 40 - capS * 1.8, { maxLines: 2, minSize: 30 });
    txt(g, kindWord, x0, 26 + capS * 0.85, f.cap, capS, { fill: onBand, tr });
    txt(g, `No. ${serial}`, w - pad, 26 + capS * 0.85, f.mono, capS, { fill: onBand, anchor: 'end', tr: 0.04 });
    drawHeadline(g, fit, x0, 26 + capS * 1.9, f.title, { fill: onBand, em: onBand });
  } else {
    const fit = fitHeadline(words, f.title, x1 - x0 - kw - 40, bandH - 40, { maxLines: 2, minSize: 30 });
    const bh = fit.size * (0.8 + (fit.lines.length - 1) * 1.08);
    drawHeadline(g, fit, x0, (bandH - bh) / 2, f.title, { fill: onBand, em: onBand });
    txt(g, kindWord, x1, bandH / 2 + capS * 0.35, f.cap, capS, { fill: onBand, anchor: 'end', tr });
    txt(g, ko ? '패스' : 'PASS', w - pad + 6, bandH / 2 + capS * 0.35, f.cap, capS, { fill: onBand, anchor: 'end', tr });
  }
  // two large codes: the date and the time (or the weekday) — without a date, the pass number
  // and a short information value
  let codes;
  if (dw && date.end) {
    // a run of days: from → until, like a route
    const e = dateWords({ ...date, ...date.end, weekday: 0 }, ko);
    codes = [[ko ? '시작' : 'FROM', dw.code], [ko ? '종료' : 'UNTIL', e.code]];
  } else if (dw) codes = [[ko ? '날짜' : 'DATE', dw.code], date.time ? [ko ? '시간' : 'TIME', date.time] : [ko ? '요일' : 'DAY', dw.day]];
  else {
    const short = meta.filter((r) => [...r.value].length <= 6 && r.label).sort((a, b) => a.value.length - b.value.length)[0];
    codes = [[ko ? '번호' : 'NO.', serial.slice(-3)]];
    if (short) codes.push([short.label, short.value]);
    ctx.note('ticket: the copy names no date, so the pass shows its number' + (short ? ` and "${short.value}"` : '') + ' as the large codes. Put the date in "meta" (label 일시 / Date).');
  }
  const cTop = bandH + (vertical ? 46 : 38), codeH = vertical ? 92 : 104;
  // both codes at one size, on one baseline, as large as the row allows; a connector between them
  const gapC = 96, ms = await Promise.all(codes.map(([, code]) => measureInk(code, f.title, -0.01)));
  const asc = Math.max(...ms.map((m) => m.ascent)), desc = Math.max(...ms.map((m) => m.descent));
  const wide = codes.map(([, code], i) => Math.max(ms[i].width, setWidth(g, code, f.title, 100, -0.01) / 100));
  const size = Math.min(codeH / (asc + desc), (x1 - x0 - gapC * (codes.length - 1)) / wide.reduce((t, x) => t + x, 0));
  const base = cTop + capS * 1.6 + asc * size;
  let cx = x0;
  codes.forEach(([cap, code], i) => {
    const m = ms[i];
    txt(g, caps(cap, ko), cx, cTop + capS * 0.85, f.cap, capS, { fill: soft, tr });
    const node = txt(g, code, cx - m.left * size, base, f.title, size, { fill: i ? ink2 : ink, tr: -0.01 });
    // advance by what was really set (a fallback face can be wider than the one measured)
    void node;
    cx += wide[i] * size + gapC;
    if (i === 0 && codes.length === 2 && dw) {
      const cy = base - asc * size * 0.5, ax = cx - gapC + 26, bx = cx - 26;
      g.append(svg('line', { x1: ax, x2: bx - 4, y1: cy, y2: cy, stroke: ink, 'stroke-width': 3 }));
      g.append(svg('circle', { cx: ax, cy, r: 4, fill: ink }));
      g.append(svg('circle', { cx: bx, cy, r: 6, fill: ink }));
    }
  });
  // the fields: place, price and the rest of the information rows
  const used = date ? meta.filter((r) => !(DATE_LABEL.test(r.label) || r.value.includes(date.text))) : meta;
  const rows = rowsFor(used, vertical ? 4 : 3);
  const fy = base + desc * size + (vertical ? 44 : 36);
  g.append(svg('line', { x1: x0, x2: x1, y1: fy, y2: fy, stroke: hair, 'stroke-width': 2 }));
  const rowH = valS * 1.45 + capS * 1.9;
  if (vertical) {
    rows.forEach((r, i) => field(g, r.label, r.value, x0, fy + capS * 1.9 + i * rowH, x1 - x0, { f, capS, valS, ink, soft, ko }));
    if (!rows.length && dw) field(g, ko ? '날짜' : 'DATE', dw.full, x0, fy + capS * 1.9, x1 - x0, { f, capS, valS, ink, soft, ko });
  } else {
    const list = rows.length ? rows.map((r) => [r.label, r.value]) : dw ? [[ko ? '날짜' : 'DATE', dw.full]] : [];
    const gap = 30, tot = list.reduce((s, q) => s + adv(q[1], f.body, valS) + 140, 0);
    let x = x0;
    for (const [l, v] of list) { const cw = list.length === 1 ? x1 - x0 : (x1 - x0 - gap * (list.length - 1)) * (adv(v, f.body, valS) + 140) / tot; field(g, l, v, x, fy + capS * 1.9, cw, { f, capS, valS, ink, soft, ko }); x += cw + gap; }
  }
  // the stub: the codes again, small, and a barcode
  if (vertical) {
    const sy = at + 38, sx0 = pad, sx1 = w - pad;
    codes.forEach(([cap, code], i) => {
      const cx = sx0 + i * (sx1 - sx0) / 2;
      txt(g, caps(cap, ko), cx, sy + capS * 0.85, f.cap, capS, { fill: soft, tr });
      txt(g, code, cx, sy + capS * 0.85 + valS * 1.5, f.monoB, valS, { fill: ink });
    });
    barcode(g, rng, sx0, sy + capS + valS * 2.2, sx1 - sx0, h - 36 - (sy + capS + valS * 2.2), ink);
  } else {
    const sx0 = at + 36, sx1 = w - 36, sy = bandH + 38;
    codes.forEach(([cap, code], i) => {
      const yy = sy + i * (capS + valS * 1.9);
      txt(g, caps(cap, ko), sx0, yy + capS * 0.85, f.cap, capS, { fill: soft, tr });
      txt(g, ellipsize(code, f.monoB, valS, sx1 - sx0), sx0, yy + capS * 0.85 + valS * 1.35, f.monoB, valS, { fill: ink });
    });
    const by = sy + 2 * (capS + valS * 1.9) + 6;
    barcode(g, rng, sx0, by, sx1 - sx0, h - 40 - by, ink);
  }
}

// ------------------------------------------------------------------ receipt: a long paper receipt
async function receipt({ ctx, root, pal, content, meta, date, dw, ko, f, paper, tilt, dark, words }) {
  const rng = ctx.rng, U = ctx.unit;
  const rm = room(ctx), w = Math.round(560 * Math.min(1.35, Math.max(1, (rm.w / rm.h) / 0.62))), pad = 44, x0 = pad, x1 = w - pad, iw = x1 - x0;
  const { ink, ink2, soft, hair } = inksOn(paper, pal);
  const deg = (tilt ?? rng.range(1.5, 3)) * rng.sign();
  // the text size depends on the scale, the scale on the length: settle it in two passes
  let s = 26, lay = null, place = null;
  const fee = feeOf(meta);
  for (let k = 0; k < 2; k++) {
    lay = layoutReceipt(s);
    place = boxFor(ctx, w, lay.h, deg, 0.9);
    const need = 1.55 * U / place.s;
    if (need <= s * 0.82 || k) break;
    s = need / 0.82;
  }
  function layoutReceipt(S) {
    const sm = S * 0.82, lh = S * 1.5;
    const items = [];
    let y = 46;                                                   // below the top teeth
    const head = content.eyebrow || content.brand || '';
    if (head) { items.push(['head', y + sm]); y += sm * 2.2; }
    const fit = fitHeadline(words, f.monoB, iw, S * 1.6 * 3.4, { maxLines: 3, minSize: S * 1.25, lead: 1.2 });
    const hsz = Math.min(fit.size, S * 1.9);
    items.push(['title', y, { ...fit, size: hsz }]); y += hsz * (0.8 + (fit.lines.length - 1) * 1.2) + S * 1.3;
    items.push(['stamp', y]); y += lh;
    items.push(['dash', y - S * 0.2]); y += S * 1.2;
    for (const r of meta) {
      const lw = adv(r.label, f.mono, S), vw = adv(r.value, f.mono, S);
      if (lw + vw + S * 2 <= iw) { items.push(['item', y + S, r, false]); y += lh; }
      else { const vl = wrapText(r.value, f.mono, S, iw - S * 1.5, 2); items.push(['item', y + S, r, vl]); y += lh * (1 + vl.length); }
    }
    if (!meta.length) { items.push(['item', y + S, { label: ko ? '입장권' : 'ADMISSION', value: '1' }, false]); y += lh; }
    items.push(['dash', y + S * 0.2]); y += S * 1.4;
    if (fee) { items.push(['total', y + S * 1.2]); y += S * 2.4; items.push(['dash', y]); y += S * 1.2; }
    items.push(['bar', y + S * 0.4]); y += S * 4.4;
    items.push(['serial', y + S * 0.2]); y += S * 1.6;
    items.push(['thanks', y + S * 0.6]); y += S * 2.4;
    return { items, h: y + 40, S };
  }
  const h = lay.h, S = lay.S, sm = S * 0.82, lh = S * 1.5;
  const g = placeObject(root, place, w, h, deg);
  // the paper with torn zigzag ends
  const tooth = 28, n = Math.round(w / tooth), tw = w / n, depth = 14;
  let d = `M0 ${depth}`;
  for (let i = 0; i < n; i++) d += `L${(i + 0.5) * tw} 0L${(i + 1) * tw} ${depth}`;
  d += `L${w} ${h - depth}`;
  for (let i = n; i > 0; i--) d += `L${(i - 0.5) * tw} ${h}L${(i - 1) * tw} ${h - depth}`;
  d += 'Z';
  shadow(ctx, g, d, 16, dark);
  g.append(svg('path', { d, fill: paper }));
  const mid = w / 2, serial = serialOf(rng);
  const dashed = (y) => g.append(svg('line', { x1: x0, x2: x1, y1: y, y2: y, stroke: soft, 'stroke-width': 2.4, 'stroke-dasharray': `${S * 0.45} ${S * 0.3}` }));
  for (const [kind, y, extra, wrap] of lay.items) {
    if (kind === 'head') txt(g, ellipsize(caps(content.eyebrow || content.brand, ko), f.mono, sm, iw, 0.12), mid, y, f.mono, sm, { anchor: 'middle', fill: soft, tr: 0.12 });
    else if (kind === 'title') drawHeadline(g, extra, mid, y, f.monoB, { fill: ink, em: ink2, anchor: 'middle', lead: 1.2 });
    else if (kind === 'stamp') {
      const left = dw ? dw.full : '', right = date && date.time ? date.time : `No.${serial.slice(-4)}`;
      if (left) txt(g, left, x0, y, f.mono, sm, { fill: ink });
      txt(g, right, x1, y, f.mono, sm, { fill: ink, anchor: 'end' });
    } else if (kind === 'dash') dashed(y);
    else if (kind === 'item') {
      const r = extra, lab = ellipsize(r.label, f.mono, S, iw * 0.45);
      txt(g, lab, x0, y, f.mono, S, { fill: ink });
      const lw = adv(lab, f.mono, S);
      if (!wrap) {
        const val = r.value, vw = adv(val, f.mono, S);
        txt(g, val, x1, y, f.mono, S, { fill: ink, anchor: 'end' });
        // dotted leaders between label and value
        const a = x0 + lw + S * 0.5, b = x1 - vw - S * 0.5;
        if (b - a > S) g.append(svg('line', { x1: a, x2: b, y1: y - S * 0.1, y2: y - S * 0.1, stroke: hair, 'stroke-width': 2.4, 'stroke-dasharray': `0.1 ${S * 0.42}`, 'stroke-linecap': 'round' }));
      } else {
        wrap.forEach((line, k) => txt(g, line, x1, y + lh * (k + 1), f.mono, S, { fill: ink, anchor: 'end' }));
        g.append(svg('line', { x1: x0 + lw + S * 0.5, x2: x1, y1: y - S * 0.1, y2: y - S * 0.1, stroke: hair, 'stroke-width': 2.4, 'stroke-dasharray': `0.1 ${S * 0.42}`, 'stroke-linecap': 'round' }));
      }
    } else if (kind === 'total') {
      const big = S * 1.3;
      txt(g, ko ? '합계' : 'TOTAL', x0, y, f.monoB, big, { fill: ink, tr: ko ? 0 : 0.06 });
      txt(g, ellipsize(fee.text, f.monoB, big, iw * 0.6), x1, y, f.monoB, big, { fill: ink2, anchor: 'end' });
    } else if (kind === 'bar') barcode(g, rng, x0 + iw * 0.06, y, iw * 0.88, S * 3.4, ink);
    else if (kind === 'serial') txt(g, serial.split('').join(' '), mid, y, f.mono, sm, { anchor: 'middle', fill: ink });
    else if (kind === 'thanks') txt(g, ko ? '감사합니다' : 'THANK YOU', mid, y, f.monoB, S, { anchor: 'middle', fill: ink, tr: ko ? 0.2 : 0.3 });
  }
}
