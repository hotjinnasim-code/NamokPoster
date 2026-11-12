// screen — a flat, generic user-interface mock-up as the picture: plain rounded rectangles in a few
// palette inks with a hairline outline and a hard offset shadow. Deliberately no particular operating
// system, messenger or player: plain title bars, plain bubbles, plain icons drawn in SVG.
// The copy is on the screen, verbatim: the headline, the date, the place, the call to action.
//
// Palette: colors[0] = primary (buttons, outgoing bubbles, progress, selection)
//          colors[1] = second shape colour (abstract shapes, cover, avatar)
//          colors[2] = third shape colour (headline bubble, shapes, title bar of the art window)
//          colors[3] = the window surface (light on light pages, a dark slate on dark ones)
//          The outline and the hard shadow are the ink (on a dark page: a muted surface line and a
//          shadow in a deep tint of the primary).
// Motifs:  windows · chat · player · search
// Params:  shadow (hard | soft | none), outline (0–2), radius (0–2)
// Helpers written here (not in html-lib): box(), txt(), icon() — absolutely positioned DOM in design
//          units (the canvas is 100 units wide), and the SVG icons.
import { el, svg, mix, alpha, luminance, readableOn, eventDate, keyNumber, keywords, inkText, DAY_NAMES, isKorean } from '/skill/assets/web/html-lib.js';

const pad2 = (n) => String(n).padStart(2, '0');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const DATE_RE = /일시|날짜|기간|일정|언제|date|when|day/i, PLACE_RE = /장소|곳|위치|venue|place|where|location/i;

export default async function build(ctx) {
  const { W, H, unit: U, palette: pal, params, content, font, rng } = ctx;
  const motif = ['windows', 'chat', 'player', 'search'].includes(params.motif) ? params.motif : 'windows';
  const ko = ctx.lang === 'ko' || isKorean(content.title);
  const C = pal.colors || [];
  const darkPage = luminance(pal.bg) < 0.18;
  const primary = C[0] || pal.accent, second = C[1] || mix(pal.accent, pal.ink, 0.4), third = C[2] || mix(pal.accent, pal.bg, 0.5);
  const surface = C[3] || (darkPage ? mix(pal.bg, pal.ink, 0.12) : mix(pal.bg, '#ffffff', 0.75));
  const line = darkPage ? mix(surface, pal.ink, 0.28) : pal.ink;
  const onSurface = readableOn(surface, [pal.ink, '#141414', '#ffffff']), muted = mix(onSurface, surface, 0.45);
  const on = (c) => readableOn(c, [surface, pal.ink, '#ffffff', '#141414']);
  const outlineK = clamp(Number(params.outline ?? 1), 0, 3), radK = clamp(Number(params.radius ?? 1), 0, 3);
  const shadowMode = ['hard', 'soft', 'none'].includes(params.shadow) ? params.shadow : 'hard';

  // ---- the copy
  const d = eventDate(content);
  const rowOf = (re) => (content.meta || []).find((r) => re.test(r.label || ''));
  const dateRow = rowOf(DATE_RE) || (d ? (content.meta || []).find((r) => r.value.includes(d.text)) : null);
  const placeRow = rowOf(PLACE_RE);
  const em = ((content.titleRaw.match(/\*+([^*]+?)\*+/) || [])[1] || '').trim();
  const weekdayOf = () => {
    if (!d) return '';
    const src = dateRow ? dateRow.value : '';
    const wko = src.match(/[(（]\s*(주일|[일월화수목금토])\s*[)）]|(주일|[일월화수목금토])요일/), wen = src.match(/\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/i);
    if (wko) { const k = wko[1] || wko[2]; return k === '주일' ? '주일' : `${k}요일`; }
    if (wen) return wen[1].toUpperCase();
    return ko ? DAY_NAMES.ko[d.weekday] : DAY_NAMES.enShort[d.weekday];
  };

  // ---- the room's shape decides the arrangement; the motif decides the object's aspect
  const room = ctx.px(ctx.artRect), sx0 = Math.max(room.x, ctx.safe.x), sy0 = Math.max(room.y, ctx.safe.y);
  const rw = Math.min(room.x + room.w, ctx.safe.x + ctx.safe.w) - sx0, rh = Math.min(room.y + room.h, ctx.safe.y + ctx.safe.h) - sy0;
  const A = clamp(rw / Math.max(1, rh), 0.4, 3);
  const wide = A >= 1.12;

  // design units: the canvas is CW units wide; q = px per unit (set once the box is known)
  let q = 1, root = null;
  const SO = 1.25;                                     // the hard shadow's offset, in units
  const px = (v) => `${(v * q).toFixed(2)}px`;
  const fs = (u) => Math.max(U * 1.5, u * q);          // a font size in px, never under 1.5 × unit
  const lw = () => (outlineK ? Math.max(U * 0.1, 0.36 * q * outlineK) : 0);
  const shadowCss = () => {
    if (shadowMode === 'none') return 'none';
    if (shadowMode === 'soft') return `0 ${(SO * 0.7 * q).toFixed(1)}px ${(SO * 2.2 * q).toFixed(1)}px ${alpha('#000000', darkPage ? 0.55 : 0.2)}`;
    return `${(SO * q).toFixed(1)}px ${(SO * q).toFixed(1)}px 0 ${darkPage ? mix(primary, pal.bg, 0.45) : line}`;
  };
  const R = (u) => u * radK;
  const begin = (aspect, fill = 0.9) => {
    const box = ctx.fit(aspect, { fill });
    root = el('div', { class: 'screen-art', style: { position: 'absolute', left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px` } });
    ctx.root.append(root);
    return box;
  };
  /** an absolutely positioned div, in units */
  function box(parent, x, y, w, h, style = {}, kids) {
    const s = { position: 'absolute', boxSizing: 'border-box', left: px(x), top: px(y) };
    if (w != null) s.width = px(w);
    if (h != null) s.height = px(h);
    const n = el('div', { style: { ...s, ...style } }, kids);
    parent.append(n);
    return n;
  }
  /** a line of text (or a wrapping block) in units; size in units */
  function txt(parent, x, y, w, text, size, { face = font.body, weight, color = onSurface, align = 'left', wrap = false, track = 0, caps = false, lh = 1.2 } = {}) {
    const n = el('div', {
      text: caps && !isKorean(text) ? String(text).toUpperCase() : String(text), style: {
        position: 'absolute', left: px(x), top: px(y), width: w == null ? 'auto' : px(w), fontFamily: face.family, fontWeight: weight || face.weight || 500, fontStyle: face.style || 'normal',
        fontSize: `${fs(size).toFixed(2)}px`, lineHeight: String(lh), color, textAlign: align, letterSpacing: track ? `${track}em` : 'normal',
        whiteSpace: wrap ? 'normal' : 'nowrap', overflow: wrap ? 'visible' : 'hidden', textOverflow: wrap ? 'clip' : 'ellipsis', wordBreak: 'keep-all', overflowWrap: 'anywhere',
      },
    });
    parent.append(n);
    return n;
  }
  /** an SVG icon on a 24-unit grid, s units square */
  function icon(parent, x, y, s, kids, style = {}) {
    const n = svg('svg', { width: (s * q).toFixed(2), height: (s * q).toFixed(2), viewBox: '0 0 24 24', style: `position:absolute;left:${px(x)};top:${px(y)};overflow:visible` }, kids);
    Object.assign(n.style, style);
    parent.append(n);
    return n;
  }
  const strokeW = (k = 1) => (24 / 5) * 0.42 * k;      // icon stroke on the 24 grid
  const magnifier = (c) => [svg('circle', { cx: 10.5, cy: 10.5, r: 6.5, fill: 'none', stroke: c, 'stroke-width': strokeW(1.1) }), svg('path', { d: 'M15.4 15.4L21 21', stroke: c, 'stroke-width': strokeW(1.3), 'stroke-linecap': 'round' })];
  const cross = (c) => [svg('path', { d: 'M6 6L18 18M18 6L6 18', stroke: c, 'stroke-width': strokeW(1), 'stroke-linecap': 'round' })];
  const dash = (c) => [svg('path', { d: 'M6 12H18', stroke: c, 'stroke-width': strokeW(1), 'stroke-linecap': 'round' })];
  const cursorArrow = () => [svg('path', { d: 'M3 2L3 20.5L8 15.8L11.4 23L14.6 21.6L11.3 14.6L18 14.6Z', fill: pal.ink === line ? '#ffffff' : surface, stroke: darkPage ? '#0d0d0d' : line, 'stroke-width': 1.5, 'stroke-linejoin': 'round' })];
  const playIcon = (c) => [svg('path', { d: 'M8 5.2L19 12L8 18.8Z', fill: c, stroke: c, 'stroke-width': 1.6, 'stroke-linejoin': 'round' })];
  const skipIcon = (c, dir) => [svg('g', { transform: dir < 0 ? 'translate(24 0) scale(-1 1)' : '' }, [svg('path', { d: 'M5 6L15 12L5 18Z', fill: c, stroke: c, 'stroke-width': 1.6, 'stroke-linejoin': 'round' }), svg('rect', { x: 16.6, y: 5.6, width: 2.6, height: 12.8, rx: 1, fill: c })])];
  const sendIcon = (c) => [svg('path', { d: 'M12 19V6M6.5 11.5L12 6L17.5 11.5', fill: 'none', stroke: c, 'stroke-width': strokeW(1.2), 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })];
  const dotsV = (c) => [5, 12, 19].map((y) => svg('circle', { cx: 12, cy: y, r: 2, fill: c }));

  /** a window: outline, shadow, a plain title bar (small square, title, minimise and close) → content div */
  function windowAt(x, y, w, h, { bar, title = '', tb = 6.2 } = {}) {
    const o = box(root, x, y, w, h, { background: surface, border: `${lw()}px solid ${line}`, borderRadius: px(R(2.2)), boxShadow: shadowCss(), overflow: 'hidden' });
    const b = box(o, 0, 0, null, tb, { right: '0', background: bar, borderBottom: `${lw()}px solid ${line}` });
    const tc = on(bar);
    box(b, 2.2, tb / 2 - 1.3, 2.6, 2.6, { border: `${Math.max(1, lw() * 0.8)}px solid ${tc}`, borderRadius: px(R(0.6)) });
    if (title) txt(b, 6.2, tb / 2 - 1.55, w - 18, title, 2.4, { color: tc, weight: 600, caps: true, track: isKorean(title) ? 0.02 : 0.06, lh: 1.25 });
    icon(b, w - 10.6, tb / 2 - 1.6, 3.2, dash(tc));
    icon(b, w - 6.4, tb / 2 - 1.6, 3.2, cross(tc));
    return { node: box(o, 0, tb, null, null, { right: '0', bottom: '0' }), w: w - (2 * lw()) / q, h: h - tb - (2 * lw()) / q };
  }

  // ======================================================================== windows
  if (motif === 'windows') {
    const CW = 100, a = wide ? clamp(A, 1.3, 1.85) : clamp(A, 0.66, 0.95), CH = CW / a;
    q = begin(a, 0.9).w / CW;
    const UW = CW - SO, UH = CH - SO;
    const L = wide
      ? { art: [0, 0, 0.56, 0.6], list: [0.04, 0.6, 0.46, 0.4], dlg: [0.4, 0.2, 0.6, 0.62] }
      : { art: [0, 0, 0.84, 0.4], dlg: [0.12, 0.27, 0.88, 0.42], list: [0.02, 0.66, 0.78, 0.34] };
    const at = (k) => [L[k][0] * UW, L[k][1] * UH, L[k][2] * UW, L[k][3] * UH];

    // 1 · the art window: flat abstract shapes (a circle, an arch, blocks on a ground)
    {
      const [x, y, w, h] = at('art');
      const artTitle = (content.eyebrow && [...content.eyebrow].length <= 26 ? content.eyebrow : '') || content.brand || (ko ? '그림' : 'Untitled');
      const win = windowAt(x, y, w, h, { bar: third, title: artTitle });
      const cw = win.w, ch = win.h, g = win.node;
      box(g, 0, 0, null, null, { right: '0', bottom: '0', background: mix(surface, third, 0.22) });
      const ground = ch * 0.78, m = Math.min(cw, ch);
      box(g, 0, ground, null, null, { right: '0', bottom: '0', background: line });
      const cr = m * 0.3;
      box(g, cw * 0.66 - cr, ch * 0.42 - cr, cr * 2, cr * 2, { background: second, borderRadius: '50%' });
      const aw = Math.min(cw * 0.26, ch * 0.42);
      box(g, cw * 0.1, ground - aw * 1.5, aw, aw * 1.5, { background: primary, borderRadius: `${px(aw / 2)} ${px(aw / 2)} 0 0` });
      box(g, cw * 0.1 + aw * 0.3, ground - aw * 0.62, aw * 0.4, aw * 0.62, { background: mix(surface, third, 0.22), borderRadius: `${px(aw * 0.2)} ${px(aw * 0.2)} 0 0` });
      const bw = aw * 0.62;
      box(g, cw * 0.44, ground - bw, bw * 1.3, bw, { background: third, border: `${lw()}px solid ${line}` });
      box(g, cw * 0.44 + bw * 0.3, ground - bw * 1.8, bw * 0.8, bw * 0.8, { background: surface, border: `${lw()}px solid ${line}` });
    }

    // 2 · the list window: rows from the information and a progress bar
    {
      const [x, y, w, h] = at('list');
      const win = windowAt(x, y, w, h, { bar: surface, title: ko ? '정보' : 'Info' });
      const g = win.node, cw = win.w, ch = win.h;
      const rows = (content.meta || []).filter((r) => r !== dateRow).slice(0, 3);
      // as many rows (up to three) as fit at a readable size
      const minRow = (fs(2.5) / q) * 1.75, top = 2.6;
      const n = clamp(Math.floor((ch - 9) / minRow), 1, 3), rowH = clamp((ch - 10) / n, minRow, 7.6);
      for (let i = 0; i < n; i++) {
        const yy = top + i * rowH, r = rows[i];
        box(g, 3, yy + rowH / 2 - 1.3, 2.6, 2.6, { background: [primary, second, third][i], borderRadius: px(R(0.6)) });
        if (r) txt(g, 7.4, yy + rowH / 2 - (fs(2.5) / q) * 0.62, cw - 11, r.value, 2.5, { lh: 1.25 });
        else box(g, 7.4, yy + rowH / 2 - 0.8, (cw - 14) * [0.8, 0.55, 0.68][i], 1.6, { background: mix(surface, onSurface, 0.14), borderRadius: px(0.8) });
        if (i < n - 1) box(g, 3, yy + rowH, cw - 6, Math.max(1, lw() * 0.6) / q, { background: mix(surface, onSurface, 0.15) });
      }
      const py = Math.min(ch - 6, top + n * rowH + 3.4), f = rng.range(0.58, 0.78);
      box(g, 3, py, cw - 6, 2.6, { background: mix(surface, onSurface, 0.1), border: `${lw() * 0.8}px solid ${line}`, borderRadius: px(1.3), overflow: 'hidden' }, [
        el('div', { style: { position: 'absolute', left: '0', top: '0', bottom: '0', width: `${(f * 100).toFixed(1)}%`, background: primary } })]);
    }

    // 3 · the dialog: the date set large, OK and Cancel, and the cursor on OK
    {
      const [x, y, w, h] = at('dlg');
      const win = windowAt(x, y, w, h, { bar: primary, title: dateRow ? dateRow.label : (ko ? '알림' : 'Notice') });
      const g = win.node, cw = win.w, ch = win.h;
      let big, cap;
      if (d) {
        big = `${d.month}.${pad2(d.day)}` + (d.end ? `–${d.end.month}.${pad2(d.end.day)}` : '');
        cap = [d.end ? '' : weekdayOf(), d.yearKnown ? String(d.year) : '', d.time || ''].filter(Boolean).join(' · ');
      } else {
        big = em || keywords(content, 1)[0] || content.title.split(/\s+/)[0];
        cap = content.eyebrow || '';
        ctx.note(`screen: the copy names no date, so the dialog shows "${big}". Put the date in "meta" (label 일시 / Date) to set it large.`);
      }
      const bt = fs(2.6) / q, btnH = Math.max(6.4, bt * 2.1), pad = 3.6;   // buttons grow with their (minimum-size) lettering
      if (cap) txt(g, pad, pad * 0.8, cw - pad * 2, cap, 2.5, { color: muted, weight: 600, caps: true, track: ko ? 0.02 : 0.08, lh: 1.25 });
      const bigTop = pad * 0.8 + (cap ? 4.8 : 0.6), bigH = ch - bigTop - btnH - pad * 2.2;
      const s = svg('svg', { width: (cw * q).toFixed(1), height: (ch * q).toFixed(1), style: 'position:absolute;left:0;top:0;overflow:visible' });
      g.append(s);
      await inkText(s, big, { x: pad * q, y: bigTop * q, w: (cw - pad * 2) * q, h: bigH * q }, font.title, { fill: onSurface, align: 'left', valign: 'middle', tracking: -0.02 });
      const by = ch - btnH - pad * 0.9, okW = Math.max(clamp(cw * 0.26, 14, 22), bt * 3), noW = Math.max(okW * 1.05, bt * (ko ? 3 : 4.6));
      const okX = cw - pad - okW, noX = okX - 2.4 - noW;
      const b1 = box(g, noX, by, noW, btnH, { border: `${lw()}px solid ${line}`, borderRadius: px(R(1.6)), background: surface });
      txt(b1, 0, btnH / 2 - bt * 0.62 - lw() / q, noW - (2 * lw()) / q, ko ? '취소' : 'Cancel', 2.6, { align: 'center', weight: 600, lh: 1.25 });
      const b2 = box(g, okX, by, okW, btnH, { border: `${lw()}px solid ${line}`, borderRadius: px(R(1.6)), background: primary });
      txt(b2, 0, btnH / 2 - bt * 0.62 - lw() / q, okW - (2 * lw()) / q, ko ? '확인' : 'OK', 2.6, { align: 'center', weight: 700, color: on(primary), lh: 1.25 });
      // the cursor (on the root, so the window's clipping does not cut it)
      icon(root, x + okX + okW * 0.62, y + 6.2 + by + btnH * 0.5, 6.4, cursorArrow());
    }
    return;
  }

  // ======================================================================== chat
  if (motif === 'chat') {
    // a wide room gets a wide card (the units follow its height, so the bars keep their size)
    const a = wide ? clamp(A * 0.75, 0.95, 2.1) : clamp(A, 0.62, 0.86), CW = Math.max(100, 80 * a), CH = CW / a;
    q = begin(a, 0.92).w / CW;
    const UW = CW - SO, UH = CH - SO;
    const card = box(root, 0, 0, UW, UH, { background: surface, border: `${lw()}px solid ${line}`, borderRadius: px(R(3.4)), boxShadow: shadowCss(), overflow: 'hidden' });
    const iw = UW - (2 * lw()) / q, ih = UH - (2 * lw()) / q;
    // header: an avatar and the thread's name (the eyebrow or the brand, as written)
    const hb = 11;
    box(card, 0, 0, null, hb, { right: '0', borderBottom: `${lw()}px solid ${line}`, background: mix(surface, second, 0.12) });
    const name = content.eyebrow || content.brand || '';
    box(card, 3.4, hb / 2 - 3.4, 6.8, 6.8, { background: second, borderRadius: '50%', border: `${lw()}px solid ${line}` });
    if (name) txt(card, 12.6, hb / 2 - 1.75, iw - 24, name, 2.8, { weight: 700, lh: 1.25 });
    else box(card, 12.6, hb / 2 - 0.9, iw * 0.3, 1.8, { background: mix(surface, onSurface, 0.18), borderRadius: px(0.9) });
    icon(card, iw - 7, hb / 2 - 2, 4, dotsV(onSurface));
    // the input bar
    const ib = 12;
    box(card, 0, ih - ib, null, ib, { right: '0', borderTop: `${lw()}px solid ${line}` });
    box(card, 3.4, ih - ib + 2.6, iw - 16, ib - 5.2, { border: `${lw()}px solid ${line}`, borderRadius: px(R(3.4)) }, [
      el('div', { style: { position: 'absolute', left: px(2.6), top: '50%', width: px((iw - 16) * 0.35), height: px(1.6), marginTop: px(-0.8), borderRadius: px(0.8), background: mix(surface, onSurface, 0.16) } })]);
    const sb = ib - 5.2;
    box(card, iw - 3.4 - sb, ih - ib + 2.6, sb, sb, { background: primary, borderRadius: '50%', border: `${lw()}px solid ${line}` });
    icon(card, iw - 3.4 - sb + sb * 0.2, ih - ib + 2.6 + sb * 0.2, sb * 0.6, sendIcon(on(primary)));

    // the thread: the copy, verbatim
    const msgs = [{ text: content.title, head: true }];
    if (dateRow) msgs.push({ text: dateRow.value });
    if (placeRow && placeRow !== dateRow) msgs.push({ text: placeRow.value });
    if (content.cta) msgs.push({ text: content.cta });
    else msgs.push({ typing: true });
    if (!dateRow && !placeRow) ctx.note('screen: no date or place row in the copy — the thread shows the headline and a typing bubble only.');
    const top = hb + 4, bottom = ih - ib - 3.5, maxW = iw * (a > 1.5 ? 0.52 : wide ? 0.66 : 0.74);
    const layer = box(card, 0, 0, null, null, { right: '0', bottom: '0' });
    const layout = (size) => {
      layer.textContent = '';
      let y = top * q;
      msgs.forEach((m, i) => {
        const right = i % 2 === 1, fill = m.head ? third : right ? primary : surface;
        const color = m.head ? on(third) : right ? on(primary) : onSurface;
        const r = R(size * 1.25) * q, padX = size * 0.95 * q, padY = size * 0.62 * q;
        const b = el('div', { style: {
          position: 'absolute', top: `${y}px`, [right ? 'right' : 'left']: px(3.4), maxWidth: px(maxW), boxSizing: 'border-box', padding: `${padY}px ${padX}px`,
          background: fill, color, border: `${lw()}px solid ${line}`, borderRadius: right ? `${r}px ${r}px ${r * 0.25}px ${r}px` : `${r}px ${r}px ${r}px ${r * 0.25}px`,
          fontFamily: (m.head ? font.title : font.body).family, fontWeight: m.head ? (font.title.weight || 700) : 500, fontStyle: m.head ? font.title.style || 'normal' : 'normal',
          fontSize: `${Math.max(U * 1.5, (m.head ? size * 1.18 : size) * q).toFixed(2)}px`, lineHeight: m.head ? '1.22' : '1.32', wordBreak: 'keep-all', overflowWrap: 'anywhere',
        } });
        if (m.typing) {
          const dsz = size * 0.55 * q;
          for (let k = 0; k < 3; k++) b.append(el('span', { style: { display: 'inline-block', width: `${dsz}px`, height: `${dsz}px`, margin: `${dsz * 0.35}px ${dsz * 0.32}px`, borderRadius: '50%', background: mix(color, fill, 0.15 + k * 0.22) } }));
        } else b.textContent = m.text;
        layer.append(b);
        y += b.getBoundingClientRect().height + size * 0.85 * q;
      });
      return y - size * 0.85 * q;
    };
    // the largest type that keeps the thread inside the card
    let lo = 1.5, hi = wide ? 6.2 : 7;
    if (layout(hi) > bottom * q) {
      for (let k = 0; k < 14; k++) { const mid = (lo + hi) / 2; if (layout(mid) <= bottom * q) lo = mid; else hi = mid; }
      if (layout(lo) > bottom * q) ctx.note('screen: the thread is long for the room — the bubbles may crowd the input bar.');
    }
    return;
  }

  // ======================================================================== player
  if (motif === 'player') {
    // tall: the cover, then two lines of title, the progress bar and the controls below it
    const CW = 100, a = wide ? clamp(A * 1.1, 1.9, 2.4) : 0.68, CH = CW / a;
    q = begin(a, 0.92).w / CW;
    const UW = CW - SO, UH = CH - SO, pad = wide ? 4 : 5.5;
    const card = box(root, 0, 0, UW, UH, { background: surface, border: `${lw()}px solid ${line}`, borderRadius: px(R(3.2)), boxShadow: shadowCss(), overflow: 'hidden' });
    const iw = UW - (2 * lw()) / q, ih = UH - (2 * lw()) / q;
    const cs = wide ? ih - pad * 2 : iw - pad * 2;
    // the cover: flat shapes, one of three compositions
    const cov = svg('svg', { width: (cs * q).toFixed(1), height: (cs * q).toFixed(1), viewBox: '0 0 100 100', style: `position:absolute;left:${px(pad)};top:${px(pad)};border-radius:${px(R(1.6))};outline:${lw()}px solid ${line}` });
    card.append(cov);
    const v = rng.int(0, 2);
    cov.append(svg('rect', { x: 0, y: 0, width: 100, height: 100, fill: second }));
    if (v === 0) {
      cov.append(svg('circle', { cx: 64, cy: 38, r: 24, fill: third }), svg('rect', { x: 0, y: 74, width: 100, height: 26, fill: line === pal.ink ? pal.ink : mix(surface, '#000', 0.4) }),
        svg('path', { d: 'M12 74V48A14 14 0 0 1 40 48V74Z', fill: primary }), svg('rect', { x: 50, y: 60, width: 22, height: 14, fill: surface }));
    } else if (v === 1) {
      const cl = [primary, third, surface, line === pal.ink ? pal.ink : mix(surface, '#000', 0.4)];
      const quads = [[0, 0, 'M0 50A50 50 0 0 1 50 0V50Z'], [50, 0, 'M50 0A50 50 0 0 1 100 50H50Z'], [0, 50, 'M0 50H50V100A50 50 0 0 1 0 50Z'], [50, 50, 'M50 50H100A50 50 0 0 1 50 100Z']];
      rng.shuffle(quads).forEach((qq, i) => cov.append(svg('path', { d: qq[2], fill: cl[i] })));
    } else {
      [[46, primary], [36, third], [26, surface], [16, second]].forEach(([r, c]) => cov.append(svg('path', { d: `M${50 - r} 92A${r} ${r} 0 0 1 ${50 + r} 92Z`, fill: c })));
      cov.append(svg('rect', { x: 0, y: 92, width: 100, height: 8, fill: primary }));
    }
    // the information
    const ix = wide ? pad * 2 + cs : pad, iy = wide ? pad + 1 : pad * 2 + cs - 0.5, infoW = wide ? iw - ix - pad : iw - pad * 2;
    const artist = content.eyebrow || content.brand || content.subtitle || '';
    let y = iy;
    if (artist) { txt(card, ix, y, infoW, artist, 2.5, { color: muted, weight: 600, caps: true, track: isKorean(artist) ? 0.02 : 0.08, lh: 1.25 }); y += 4.6; }
    // the title: up to two lines, as large as fits
    const titleRoom = wide ? ih - pad - 22 - (y - iy) - pad : ih - y - 21 - pad;
    const tnode = txt(card, ix, y, infoW, content.title, 7, { face: font.title, wrap: true, lh: 1.1 });
    let tsz = wide ? 10 : 12;
    const fits = () => tnode.getBoundingClientRect().height <= Math.min(titleRoom, tsz * 2.3) * q + 0.5 && tnode.scrollWidth <= infoW * q + 1;
    for (; tsz > 2.4; tsz *= 0.94) { tnode.style.fontSize = `${fs(tsz).toFixed(2)}px`; if (fits()) break; }
    if (!fits()) { tnode.style.display = '-webkit-box'; tnode.style.webkitLineClamp = '2'; tnode.style.webkitBoxOrient = 'vertical'; tnode.style.overflow = 'hidden'; }
    // progress, with the event's time at its end
    const pY = wide ? ih - pad - 15.5 : ih - pad - 17;
    const f = rng.range(0.32, 0.5);
    box(card, ix, pY, infoW, 1.3, { background: mix(surface, onSurface, 0.14), borderRadius: px(0.65) });
    box(card, ix, pY, infoW * f, 1.3, { background: primary, borderRadius: px(0.65) });
    box(card, ix + infoW * f - 1.7, pY + 0.65 - 1.7, 3.4, 3.4, { background: surface, border: `${Math.max(lw(), q * 0.5)}px solid ${primary}`, borderRadius: '50%' });
    const leftT = d ? `${d.month}.${pad2(d.day)}` : '', rightT = d ? (d.time || (d.end ? `${d.end.month}.${pad2(d.end.day)}` : weekdayOf())) : '';
    if (!d) ctx.note('screen: no date in the copy — the progress bar carries no time.');
    else if (!d.time) ctx.note('screen: the copy names no time — the progress bar ends with the ' + (d.end ? 'last day' : 'weekday') + '.');
    if (leftT) txt(card, ix, pY + 2.6, infoW / 2, leftT, 2.3, { face: font.mono, color: muted, lh: 1.25 });
    if (rightT) txt(card, ix + infoW / 2, pY + 2.6, infoW / 2, rightT, 2.3, { face: font.mono, color: muted, align: 'right', lh: 1.25 });
    // controls
    const cy = pY + 10.4, mid = ix + infoW / 2, pr = 4.6;
    box(card, mid - pr, cy - pr, pr * 2, pr * 2, { background: primary, borderRadius: '50%', border: `${lw()}px solid ${line}` });
    icon(card, mid - pr * 0.5 + 0.3, cy - pr * 0.5, pr, playIcon(on(primary)));
    icon(card, mid - pr - 9.4, cy - 2.4, 4.8, skipIcon(onSurface, -1));
    icon(card, mid + pr + 4.6, cy - 2.4, 4.8, skipIcon(onSurface, 1));
    return;
  }

  // ======================================================================== search
  {
    let rows = (content.meta || []).slice(0, 5).map((r) => ({ label: r.label, value: r.value }));
    if (!rows.length) {
      rows = keywords(content, 4).filter((w) => w !== content.title).map((w) => ({ label: '', value: w }));
      ctx.note('screen: no information rows — the suggestions are words from the copy.');
    }
    const CW = wide ? 100 : 78, fh = 14, gap = 2.6, rh = 10.2, n = Math.max(1, rows.length);
    const CH = fh + gap + n * rh + 2.4 + SO, a = CW / CH;
    q = begin(a, 0.92).w / CW;
    const UW = CW - SO;
    // the field: magnifier, the headline as typed, a text cursor
    const field = box(root, 0, 0, UW, fh, { background: surface, border: `${lw() * 1.4}px solid ${line}`, borderRadius: px(R(fh / 2) || 1), boxShadow: shadowCss() });
    icon(field, 4.2, fh / 2 - 2.9 - lw() / q, 5.8, magnifier(onSurface));
    const tx = 12.6, tw = UW - tx - 9;
    const t = txt(field, tx, 0, null, content.title, 5.2, { face: font.title, lh: 1.2 });
    let tsz = 5.4;
    for (; tsz > 1.6; tsz *= 0.95) { t.style.fontSize = `${fs(tsz).toFixed(2)}px`; if (t.getBoundingClientRect().width <= tw * q) break; }
    const th = t.getBoundingClientRect().height, tW = Math.min(t.getBoundingClientRect().width, tw * q);
    t.style.top = `${(fh * q - th) / 2 - lw() * 1.4}px`;
    if (t.getBoundingClientRect().width > tw * q) { t.style.width = px(tw); }
    box(field, tx + tW / q + 0.6, fh / 2 - 3.2 - lw() * 1.4 / q, 0.55, 6.4, { background: primary });
    icon(field, UW - 7.6, fh / 2 - 2 - lw() * 1.4 / q, 4, cross(muted));
    // the suggestions
    const panel = box(root, 0, fh + gap, UW, n * rh + 2.4, { background: surface, border: `${lw()}px solid ${line}`, borderRadius: px(R(2.6)), boxShadow: shadowCss(), overflow: 'hidden' });
    const labW = rows.some((r) => r.label) ? (wide ? 15 : 13) : 0;
    rows.forEach((r, i) => {
      const y = 1.2 + i * rh;
      if (i === 0) box(panel, 0, y, null, rh, { right: '0', background: mix(surface, primary, darkPage ? 0.28 : 0.14) });
      icon(panel, 4.6, y + rh / 2 - 1.9, 3.8, magnifier(i === 0 ? primary : muted));
      if (r.label) txt(panel, 11.4, y + rh / 2 - 1.5, labW - 1.5, r.label, 2.3, { color: i === 0 ? mix(primary, onSurface, darkPage ? 0 : 0.25) : muted, weight: 700, caps: true, track: isKorean(r.label) ? 0.02 : 0.08, lh: 1.25 });
      txt(panel, 11.4 + labW, y + rh / 2 - 1.95, UW - 11.4 - labW - 5, r.value, 3, { weight: i === 0 ? 600 : 500, lh: 1.25 });
      if (i < n - 1) box(panel, 11.4, y + rh, UW - 15, Math.max(1, lw() * 0.6) / q, { background: mix(surface, onSurface, 0.12) });
    });
  }
}
