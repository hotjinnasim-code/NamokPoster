// numerals — the date as the image. The month and the day of the event are set enormous, together,
// in the poster's own display face, with the year, the weekday and the time as small caption rows.
// The day is never shown large on its own: a lone "15" is not a date.
// An HTML scene: SVG text, so it is vector at any size and changes with the type theme.
//
// Palette: colors[0] = the numerals · colors[1] = second ink (offset, echo, slices) · colors[2] = third
// Motifs: date ("11.15" on one line) · stack (month over day, each line fitted to the same width)
//         · words ("11월" over "15일" / "NOV" over "15")
// Params: treatment = solid | offset | outline | echo | slice
import { svg, mix, eventDate, keyNumber, measureInk, inkText, label, MONTH_NAMES, DAY_NAMES, isKorean, standOff } from '/skill/assets/web/html-lib.js';

export default async function build(ctx) {
  const { W, H, unit: U, palette: pal, params, content, font } = ctx;
  const motif = ['date', 'stack', 'words'].includes(params.motif) ? params.motif : 'date', treatment = params.treatment || 'solid';
  const ko = ctx.lang === 'ko' || isKorean(content.title);
  // the three inks, each kept clear of the page
  const inks = [0, 1, 2].map((i) => standOff(pal.colors[i % pal.colors.length], pal.bg, pal.ink, 1.6));

  // ---- what to show: read the date from the copy
  const date = eventDate(content);
  let lines, rows;   // lines: the giant strings; rows: [[top-left, top-right], [bottom-left, bottom-right]]
  if (date) {
    const two = (n) => String(n).padStart(2, '0');
    const wd = ko ? DAY_NAMES.ko[date.weekday] : DAY_NAMES.en[date.weekday];
    const year = date.yearKnown ? String(date.year) : '';
    const until = date.end ? `– ${date.end.month}.${two(date.end.day)}` : null;
    // month and day always appear together, at the same scale
    if (motif === 'date') { lines = [`${date.month}.${two(date.day)}`]; rows = [[year, wd], [date.time || '', until || '']]; }
    else if (date.end) { lines = [`${date.month}.${two(date.day)}`, `${date.end.month}.${two(date.end.day)}`]; rows = [[year, ''], [date.time || '', '']]; }   // a run: first day over last day
    else {
      lines = motif === 'words' ? (ko ? [`${date.month}월`, `${date.day}일`] : [MONTH_NAMES.enShort[date.month - 1], String(date.day)]) : [two(date.month), two(date.day)];
      rows = [[year, wd], [date.time || '', '']];
    }
  } else {
    // no date in the copy: the edition, the year or a count — else the first letter of the headline
    const n = keyNumber(content);
    lines = [n || [...content.title.replace(/[^\p{L}\p{N}]/gu, '')][0] || '1'];
    rows = [[content.eyebrow.slice(0, 22), ''], ['', '']];
    ctx.note('numerals: the copy names no date, so the image shows ' + (n ? `the number ${n}` : 'the first letter of the headline') + '. Put the date in "meta" (label 일시 / Date) to set it large.');
  }
  rows = rows.map((r) => r.map((t) => String(t || '')));

  // ---- measure, then ask the layout for a box of that shape
  const tracking = -0.03;
  const inks_ = await Promise.all(lines.map((t) => measureInk(t, font.title, tracking)));
  const hasTop = rows[0].some(Boolean), hasBottom = rows[1].some(Boolean);
  const ROW = 0.105, GAP = 0.06;                                   // caption row and line gap, as fractions of the box width
  const linesH = inks_.reduce((s, m) => s + m.height / m.width, 0) + GAP * (lines.length - 1);
  const aspect = 1 / (linesH + (hasTop ? ROW : 0) + (hasBottom ? ROW : 0));
  const box = ctx.fit(aspect, { fill: treatment === 'echo' || treatment === 'offset' ? 0.84 : 0.9 });
  const root = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  ctx.root.append(root);

  const capSize = Math.max(U * 1.5, Math.min(U * 2.6, box.w * 0.042));
  const capFont = { family: font.body.family, weight: 600 };
  const hair = Math.max(1, U * 0.12);
  let y = box.y;
  const caption = (pair, atTop) => {
    const base = atTop ? y + capSize * 0.82 : y + box.w * ROW - capSize * 0.12;
    const a = pair[0] && label(root, pair[0], box.x, base, capFont, capSize, { fill: pal.ink, tracking: ko ? 0.04 : 0.14 });
    const b = pair[1] && label(root, pair[1], box.x + box.w, base, capFont, capSize, { fill: pal.ink, anchor: 'end', tracking: ko ? 0.04 : 0.14 });
    // a hairline runs between the two captions (or to the far edge when there is only one)
    const x0 = a ? box.x + a.getComputedTextLength() + capSize * 0.9 : box.x, x1 = b ? box.x + box.w - b.getComputedTextLength() - capSize * 0.9 : box.x + box.w;
    if (x1 - x0 > capSize * 2) root.append(svg('line', { x1: x0, y1: base - capSize * 0.34, x2: x1, y2: base - capSize * 0.34, stroke: pal.ink, 'stroke-width': hair }));
    y += box.w * ROW;
  };
  if (hasTop) caption(rows[0], true);

  // ---- the numerals
  const defs = svg('defs'); root.append(defs);
  for (let i = 0; i < lines.length; i++) {
    const m = inks_[i], h = (m.height / m.width) * box.w, slot = { x: box.x, y, w: box.w, h };
    const g = svg('g'); root.append(g);
    const put = (attrs, dx = 0, dy = 0) => inkText(g, lines[i], { ...slot, x: slot.x + dx, y: slot.y + dy }, font.title, { tracking, ...attrs });
    const e = h * 0.045;                                            // one step of offset
    if (treatment === 'outline') {
      const sw = Math.max(2, h * 0.012);
      await put({ fill: 'none', stroke: inks[0], 'stroke-width': sw, 'stroke-linejoin': 'round' });
    } else if (treatment === 'offset') {
      // the numeral in flat colour, its outline printed out of register over it
      await put({ fill: inks[0] }, e, e);
      await put({ fill: 'none', stroke: pal.ink, 'stroke-width': Math.max(2, h * 0.01), 'stroke-linejoin': 'round' }, -e * 0.4, -e * 0.4);
    } else if (treatment === 'echo') {
      // stepped copies falling away behind the solid numeral
      const n = 5;
      for (let k = n; k >= 1; k--) await put({ fill: 'none', stroke: mix(inks[1], pal.bg, (k - 1) / (n + 1)), 'stroke-width': Math.max(1.5, h * 0.007), 'stroke-linejoin': 'round' }, e * 0.7 * k, e * 0.7 * k);
      await put({ fill: inks[0] });
    } else if (treatment === 'slice') {
      // the numeral cut into three bands, each printed in its own ink and slipped sideways
      const bands = [[0, 0.36, inks[0], -1], [0.36, 0.66, inks[1], 1], [0.66, 1, inks[2] || inks[0], -0.4]];
      bands.forEach(([a, b, colr, dir], k) => {
        const id = `nm-${i}-${k}`;
        defs.append(svg('clipPath', { id }, [svg('rect', { x: -W, y: slot.y + h * a, width: W * 3, height: h * (b - a) })]));
        const gg = svg('g', { 'clip-path': `url(#${id})` }); g.append(gg);
        inkText(gg, lines[i], { ...slot, x: slot.x + dir * box.w * 0.018 }, font.title, { tracking, fill: colr });
      });
    } else {
      // solid; in a stack the lines take turns with the page's ink, so month and day read apart
      await put({ fill: lines.length > 1 && i % 2 === 0 ? standOff(pal.ink, pal.bg, pal.ink, 1.6) : inks[0] });
    }
    y += h + box.w * GAP;
  }
  y -= box.w * GAP;
  if (hasBottom) caption(rows[1], false);
}
