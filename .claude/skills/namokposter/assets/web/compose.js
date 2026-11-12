// Typography compositor. Builds the poster DOM over the rendered 3D layer, sets the copy the way a
// designer would (headline breaks chosen for size and sense, Hangul and Latin tuned separately,
// details aligned on a shared edge) and reports what happened — sizes, overflow, contrast — so
// problems are caught without eyeballing every pixel.
import qrcode from '/skill/assets/vendor/qrcode.min.js';

const $ = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Tiny inline markup: **strong**, *emphasis* (accent colour / italic, the theme decides), newline = line break.
// (a date written with spaces — "2026. 11. 15.(주일)" — is kept on one line)
const inline = (s) => esc(s).replace(/(\d{2,4})\.[ \t]+(\d{1,2})\.[ \t]+(\d{1,2})\./g, '$1.\u00a0$2.\u00a0$3.').replace(/(\d)\.\(/g, '$1.\u2060(').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/\r?\n/g, '<br>');
const plain = (s) => String(s).replace(/\*+/g, '');
const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
const settle = async () => { await document.fonts.ready; await raf(); await raf(); };
const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/g, LETTER = /[\p{L}\p{N}]/gu;

/** 'ko' when a text is mostly Hangul. Hangul and Latin want different leading, tracking and label faces. */
function scriptOf(text) {
  const t = plain(text), h = (t.match(HANGUL) || []).length, n = (t.match(LETTER) || []).length;
  return n && h / n >= 0.3 ? 'ko' : 'latin';
}
const tag = (el, text) => { el.dataset.script = scriptOf(text); return el; };
// rough lightness (0..1) of any CSS colour, resolved by the browser
const lumCtx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
const cssLum = (c) => { lumCtx.clearRect(0, 0, 1, 1); lumCtx.fillStyle = '#000'; lumCtx.fillStyle = String(c).trim() || '#000'; lumCtx.fillRect(0, 0, 1, 1); const d = lumCtx.getImageData(0, 0, 1, 1).data; return (0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2]) / 255; };

function bodyHtml(paras) {
  // Lines starting with "- " / "• " become a list; everything else is a paragraph.
  let html = '', list = [];
  const flush = () => { if (list.length) { html += `<ul>${list.map((l) => `<li>${inline(l)}</li>`).join('')}</ul>`; list = []; } };
  for (const p of paras) {
    for (const line of String(p).split(/\r?\n/)) {
      const m = line.match(/^\s*[-•·]\s+(.*)$/);
      if (m) list.push(m[1]); else if (line.trim()) { flush(); html += `<p>${inline(line)}</p>`; }
    }
  }
  flush();
  return html;
}

function qrSvg(text) {
  const qr = qrcode(0, 'M'); qr.addData(text); qr.make();
  const n = qr.getModuleCount(), q = 4; let d = '';   // q = quiet zone in modules (the QR spec asks for 4)
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += `M${x + q} ${y + q}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 2 * q} ${n + 2 * q}" shape-rendering="crispEdges"><path d="${d}"/></svg>`;
}

function grainTile() {
  const n = 256, c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'), img = g.createImageData(n, n);
  let s = 1234567;
  for (let i = 0; i < n * n; i++) {
    s = (s * 1664525 + 1013904223) >>> 0; const v = 96 + ((s >>> 24) / 255) * 64;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

const loadImage = (img) => (img.complete && img.naturalWidth ? Promise.resolve() : new Promise((res) => { img.onload = img.onerror = () => res(); }));
const addCss = (href) => new Promise((r) => { const l = $('link'); l.rel = 'stylesheet'; l.href = href; l.onload = l.onerror = r; document.head.append(l); });

// ------------------------------------------------------------------ event information
/**
 * The forms the information may take here, best first. A bar of cells is offered where the layout
 * asks for one and there are few enough rows; the composer keeps it only if every cell fits on one
 * line (settleMetaForm). Under a centred headline up to three rows are centred lines, more are a
 * table centred as a whole; otherwise rows on the block's left edge.
 */
function metaForms(meta, layout, two) {
  const n = meta.length, centre = ((two ? layout.aside.halign : layout.halign) || 'left') === 'center';
  const plain = centre ? (n <= 3 ? 'lines' : 'centred') : 'rows';
  if (layout.metaStyle !== 'bar' || n < 2) return [plain];
  // the information has a band of its own: a few rows are a bar of cells; more — or cells that do not
  // fit — are two tables side by side; and where the band is too narrow for that, the plain form
  const forms = [];
  if (n <= (layout.metaMax ?? 3)) forms.push(centre ? 'bar mid' : 'bar');
  if (n >= 4) forms.push(centre ? 'centred two' : 'two');
  return [...forms, plain];
}
function fillMeta(dl, meta, form) {
  const labelled = meta.some((m) => m.label), cells = form.startsWith('bar'), lines = form === 'lines';
  dl.className = `meta${labelled ? '' : ' no-labels'}${cells ? ` cells ${form}` : form === 'rows' ? '' : ` ${form}`}`;
  dl.dataset.form = form;
  dl.style.setProperty('--cells', meta.length);
  dl.replaceChildren();
  if (form.endsWith('two')) { const half = Math.ceil(meta.length / 2); meta = meta.flatMap((m, i) => (i < half ? [m, meta[i + half]].filter(Boolean) : [])); }   // down the first table, then the second
  for (const m of meta) {
    const dt = labelled ? tag($('dt', '', inline(m.label)), m.label) : null, dd = tag($('dd', '', inline(m.value)), m.value);
    if (cells || lines) { const box = $('div', cells ? 'cell' : 'row'); if (dt) box.append(dt); box.append(dd); dl.append(box); } else { if (dt) dl.append(dt); dl.append(dd); }
  }
}
/** Keep the information bar only where it holds: every cell on one line inside the block's width. Otherwise the next form. */
function settleMetaForm(block) {
  const { el, job, layout, two } = state;
  if (!el.meta) return;
  const forms = metaForms(job.content.meta, layout, two);
  if (forms.length < 2) return;
  const z = zonePx(two ? layout.aside.zone : layout.text), dl = el.meta;
  block.style.left = `${z.x0 - z.fx}px`; block.style.width = `${z.x1 - z.x0}px`;
  for (const form of forms) {
    fillMeta(dl, job.content.meta, form);
    if (form === forms.at(-1) || !(dl.scrollWidth > dl.clientWidth + 1 || dl.getBoundingClientRect().width > z.x1 - z.x0 + 1)) break;
  }
}

/**
 * Rows of information keep each value on one line where a small change allows it — a date and its
 * time read as one thing. The changes, in order: the larger size of sparse information is given up;
 * a block that stands beside the headline takes the width the headline leaves (`room`, px); the
 * rows go down a size, and one more (0.88: the size they had before they were made larger). The
 * first state with no broken value is kept, or else the one with the fewest. Returns the zone the
 * block now stands in.
 */
function settleRows(block, zone, room = 0) {
  const { poster, el } = state, dl = el.meta;
  if (!dl || dl.dataset.form !== 'rows' || !block.contains(dl)) return zone;
  if (state.sparse0 === undefined) state.sparse0 = poster.dataset.sparse ?? '';
  const width = (x0) => { block.style.left = `${x0 - zone.fx}px`; block.style.width = `${zone.x1 - x0}px`; };
  const broken = () => [...dl.querySelectorAll('dd')].filter((dd) => dd.getBoundingClientRect().height > parseFloat(getComputedStyle(dd).lineHeight) * 1.5).length;
  const steps = [[true, 0, 1]];                                   // [larger when sparse, extra width, size]
  if (state.sparse0) steps.push([false, 0, 1]);
  if (room > 1) steps.push([false, room, 1]);
  steps.push([false, room > 1 ? room : 0, 0.94], [false, room > 1 ? room : 0, 0.88]);
  const apply = ([sparse, extra, k]) => {
    if (sparse && state.sparse0) poster.dataset.sparse = state.sparse0; else delete poster.dataset.sparse;
    if (k === 1) dl.style.removeProperty('--k-row'); else dl.style.setProperty('--k-row', k);
    width(zone.x0 - extra);
  };
  let best = null;
  for (const st of steps) { apply(st); const n = broken(); if (!best || n < best.n) best = { st, n }; if (!n) break; }
  apply(best.st);
  let x0 = zone.x0 - best.st[1];
  if (best.st[1] > 0 && !best.n) {                               // of the room, only what the longest row needs
    const range = document.createRange();
    const right = Math.max(...[...dl.children].map((c) => { range.selectNodeContents(c); return Math.max(0, ...[...range.getClientRects()].map((q) => q.right)); }));
    const tight = Math.min(zone.x0, Math.max(x0, zone.x1 - (right - x0) - 2));
    width(tight);
    if (broken()) width(x0); else x0 = tight;
  }
  return { ...zone, x0 };
}

let state = null;

window.compose = async function compose(job) {
  // The page may include print bleed on every side; sizes are measured from the trimmed sheet.
  const W = window.innerWidth, H = window.innerHeight, BL = job.bleed || 0, U = Math.min(W - 2 * BL, H - 2 * BL) / 100;
  const { content: c, palette: pal, layout, style } = job;
  const allText = [c.eyebrow, c.title, c.subtitle, ...c.body].join(' ');
  document.documentElement.lang = job.lang || (scriptOf(allText) === 'ko' ? 'ko' : 'en');

  for (const href of job.css_urls || []) await addCss(href);
  if (job.fontFaces?.length) {
    const st = $('style');
    st.textContent = job.fontFaces.map((f) => `@font-face{font-family:${JSON.stringify(f.family)};src:url(${JSON.stringify(f.src)});font-weight:${f.weight ?? '100 900'};font-style:${f.style ?? 'normal'};font-display:block;}`).join('\n');
    document.head.append(st);
  }
  if (job.css) { const st = $('style'); st.textContent = job.css; document.head.append(st); }

  const poster = $('div', 'poster');
  const aspect = W / H;
  Object.assign(poster.dataset, {
    style: style.id, type: job.type || 'bold', tone: style.tone || 'light', layout: layout.layout, orient: job.orient,
    scrim: layout.scrim || 'none', viewing: job.viewing || 'screen', framed: job.framed ? '1' : '0',
    shape: aspect >= 2.4 ? 'banner' : aspect <= 0.42 ? 'tower' : 'normal',
  });
  // A poster that carries little besides its headline — no subtitle, no paragraph, a few rows of
  // information — sets that information larger: it is the only other thing to read. One or two
  // rows go a size up ("1"), three or four half a size ("2").
  if (!c.subtitle && !c.body.length && !c.cta && c.meta.length >= 1 && c.meta.length <= 4) poster.dataset.sparse = c.meta.length <= 2 ? '1' : '2';
  const set = (k, v) => poster.style.setProperty(k, String(v));
  set('--u', `${U}px`); set('--ts', job.typeScale || 1); set('--bleed', `${BL}px`);
  set('--c-bg', pal.bg); set('--c-ink', pal.ink); set('--c-muted', pal.muted); set('--c-accent', pal.accent);
  if (pal.onAccent) set('--c-on-accent', pal.onAccent);
  pal.colors.forEach((col, i) => set(`--c-${i + 1}`, col));
  for (let i = pal.colors.length; i < 5; i++) set(`--c-${i + 1}`, pal.colors[i % pal.colors.length]);
  // Emphasis colours (--em-1…5): the palette's hues for lettering, each pulled towards the ink until it
  // stands off the page — a gradient-filled word must not sink into a dark ground at one end.
  {
    const rgb = (h) => { const x = String(h).replace('#', ''); return [0, 2, 4].map((k) => parseInt(x.slice(k, k + 2), 16) || 0); };
    const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const bg = rgb(pal.bg), ink = rgb(pal.ink);
    for (let i = 0; i < 5; i++) {
      let c = rgb(pal.colors[i % pal.colors.length]);
      for (let n = 0; n < 12 && ratio(c, bg) < 3.4; n++) c = c.map((v, k) => Math.round(v + (ink[k] - v) * 0.16));
      set(`--em-${i + 1}`, `rgb(${c.join(',')})`);
    }
  }
  if (job.fonts?.title) set('--font-title', job.fonts.title);
  if (job.fonts?.body) set('--font-body', job.fonts.body);
  if (job.fonts?.mono) set('--font-mono', job.fonts.mono);
  if (job.margin != null) set('--margin', job.margin);
  for (const [k, v] of Object.entries(job.vars || {})) set(k.startsWith('--') ? k : `--${k}`, v);

  // ---- layers
  // art: an optional ground (an image, or an HTML scene drawn later), then the subject on top of it
  const art = $('div', 'art');
  let artImg = null;
  if (job.ground) { const g = new Image(); g.src = job.ground; g.className = 'art-ground'; art.append(g); }
  const groundSlot = $('div', 'art-html art-ground'); if (job.groundHtml) art.append(groundSlot);
  if (job.art) { artImg = new Image(); artImg.src = job.art; if (job.cutout) artImg.className = 'art-cutout'; art.append(artImg); }
  const scrim = $('div', 'fx fx-scrim'), grain = $('div', 'fx fx-grain'), border = $('div', 'fx fx-frame');
  grain.style.backgroundImage = `url(${grainTile()})`;
  grain.style.backgroundSize = `${256 * Math.max(1, Math.round(U / 12))}px`;

  // ---- frame: header, copy blocks, footer
  const frame = $('div', 'frame');
  const top = $('header', 'top'), main = $('main', 'main'), aside = $('aside', 'aside'), bottom = $('footer', 'bottom');
  const tl = $('div', 'slot slot-left'), tr = $('div', 'slot slot-right');
  const bl = $('div', 'slot slot-left'), br = $('div', 'slot slot-right');
  if (c.logo) { const d = $('div', 'logo'); const i = new Image(); i.src = c.logo; d.append(i); tl.append(d); }
  if (c.brand) tl.append(tag($('div', 'brand', inline(c.brand)), c.brand));
  if (c.badge) tr.append(tag($('div', 'badge', inline(c.badge)), c.badge));

  const el = {};
  const vertical = layout.mode === 'vertical';
  const two = !!layout.aside;                       // headline group and details placed separately
  const head = main, details = two ? aside : main;
  const paras = two && layout.asideHolds === 'meta' ? head : details;   // where the information is a strip of its own, paragraph and button stay with the headline
  main.dataset.halign = layout.halign || 'left';
  if (vertical) main.dataset.mode = 'vertical';
  if (two) aside.dataset.halign = layout.aside.halign || 'left';

  if (c.eyebrow) (vertical ? details : head).append((el.eyebrow = tag($('div', 'eyebrow', inline(c.eyebrow)), c.eyebrow)));
  if (c.title) head.append((el.title = tag($('h1', 'title', inline(c.title)), c.title)));
  if (c.subtitle) head.append((el.subtitle = tag($('p', 'subtitle', inline(c.subtitle)), c.subtitle)));
  // Event information (when, where, who for, fee, sign-up…) comes straight after the headline group
  // and before any paragraph: it is the body of an event poster. Its form — rows, centred lines, a
  // centred table, or the cells of an information bar — is settled once the fonts are in (settleMetaForm).
  if (c.meta.length) {
    el.meta = $('dl', 'meta');
    fillMeta(el.meta, c.meta, metaForms(c.meta, layout, two)[0]);
    details.append(el.meta);
  }
  if (c.body.length) paras.append((el.body = tag($('div', 'body', bodyHtml(c.body)), c.body.join(' '))));
  if (c.cta) paras.append((el.cta = $('div', 'cta', `<span>${inline(c.cta)}</span>`)));

  if (c.footer.length) { el.footer = $('div', 'footer'); for (const f of c.footer) el.footer.append(tag($('span', '', inline(f)), f)); bl.append(el.footer); }
  if (c.logos.length) { const d = $('div', 'logos'); for (const src of c.logos) { const i = new Image(); i.src = src; d.append(i); } br.append(d); }
  if (c.qr) {
    const d = (el.qr = $('div', 'qr'));
    if (/\.(png|jpe?g|svg|webp)$/i.test(c.qr) || c.qr.startsWith('http://poster.local/')) { const i = new Image(); i.src = c.qr; d.append(i); } else d.innerHTML = qrSvg(c.qr);
    if (c.qrLabel) d.append($('span', '', inline(c.qrLabel)));
    br.append(d);
  }
  // custom slots: { slot: 'top-left'|'top-right'|'main'|'aside'|'bottom-left'|'bottom-right'|'free', html }
  const free = $('div', 'free');
  const slotMap = { 'top-left': tl, 'top-right': tr, main: details, aside: details, headline: head, 'bottom-left': bl, 'bottom-right': br, free };
  for (const s of c.slots) (slotMap[s.slot] || free).insertAdjacentHTML('beforeend', String(s.html ?? ''));

  for (const [bar, parts] of [[top, [tl, tr]], [bottom, [bl, br]]]) for (const p of parts) if (p.childNodes.length) bar.append(p);
  frame.append(top, main, aside, bottom);
  poster.append(art, scrim, grain, border, frame, free);
  document.body.replaceChildren(poster);

  await Promise.all([...poster.querySelectorAll('img')].map(loadImage));
  await settle();
  if (getComputedStyle(poster).getPropertyValue('--footer-rule').trim() === '1' && bottom.childNodes.length) bottom.classList.add('ruled');
  // one axis down to the last line: under a centred headline the footer is centred too (unless logos or a QR code share its row)
  if ((layout.halign || 'left') === 'center' && !br.childNodes.length) bottom.dataset.halign = 'center';

  state = { poster, frame, top, bottom, main, aside, el, layout, W, H, U, job, two, vertical, artImg, slots: { tl, tr, bl, br } };
  settleMetaForm(details);
  let fit = fitCopy();
  await settle();
  fit = fitCopy();          // glyph loads triggered by the first fit can nudge metrics
  await settle();
  opticalAlign();
  if (job.matchBackground && artImg && !job.cutout) matchBackground(fit);   // a cut-out has no rendered backdrop to match
  for (const [h, root] of [[job.groundHtml, groundSlot], [job.html, null]]) {
    if (!h) continue;
    try { await buildHtmlArt(job, art, fit.notes, h, root); }
    catch (e) { fit.notes.push({ level: 'error', code: 'render-failed', msg: `HTML scene failed: ${String(e?.message ?? e).split('\n')[0]}` }); }
  }
  if (job.groundHtml || job.html) { await Promise.all([...art.querySelectorAll('img')].map(loadImage)); await settle(); }
  return report(fit);
};

// ------------------------------------------------------------------ HTML art
/**
 * An HTML scene draws the art layer with DOM and SVG, in this page, after the copy has been fitted:
 * it is vector (sharp at any size, and in the PDF), takes no render time, and can be made from the
 * copy itself — the date, the headline, the words. `export default function build(ctx)`.
 */
async function buildHtmlArt(job, art, notes, h, slot) {
  const { W, H, U, frame } = state, L = job.layout;
  const lib = await import('/skill/assets/web/html-lib.js');
  const mod = await import(h.sceneUrl);
  const build = mod.default || mod.build;
  if (typeof build !== 'function') throw new Error('Scene module must `export default function build(ctx)`.');
  const root = slot || $('div', 'art-html');
  if (!slot) art.append(root);
  const c = job.content, strip = (s) => plain(String(s ?? '')).replace(/\s*\n\s*/g, ' ').trim();
  const content = {
    eyebrow: strip(c.eyebrow), title: strip(c.title), subtitle: strip(c.subtitle), cta: strip(c.cta), badge: strip(c.badge), brand: strip(c.brand),
    body: c.body.map(strip), footer: c.footer.map(strip), meta: c.meta.map((m) => ({ label: strip(m.label), value: strip(m.value) })),
    /** the headline as written, with its line breaks and *emphasis* marks */
    titleRaw: String(c.title ?? ''),
  };
  const f = frame.getBoundingClientRect();
  const artRect = L.artRect || [0, 0, 1, 1], [fx, fy] = L.focus || [0.5, 0.5];
  const copyBoxes = [...frame.querySelectorAll('.eyebrow, .title, .subtitle, .meta, .body, .cta, .footer, .brand, .badge, .logo, .logos, .qr, .bottom.ruled')]
    .map((n) => n.getBoundingClientRect()).filter((b) => b.width > 0 && b.height > 0).map((b) => [b.left / W, b.top / H, b.right / W, b.bottom / H]);
  // the faces of the type theme, resolved, so the art can be set in the poster's own voice
  const faceOf = (node, variable) => {
    const probe = $('span'); probe.style.cssText = `position:absolute;visibility:hidden;font-family:var(${variable})`; state.poster.append(probe);
    const cs = getComputedStyle(node || probe), family = (node ? cs.fontFamily : getComputedStyle(probe).fontFamily);
    const out = { family, weight: node ? cs.fontWeight : '500', style: node ? cs.fontStyle : 'normal' };
    probe.remove(); return out;
  };
  const font = { title: faceOf(state.el.title, '--font-title'), body: faceOf(state.el.subtitle || state.el.meta || state.el.body, '--font-body'), mono: faceOf(null, '--font-mono') };
  const px = (r) => ({ x: r[0] * W, y: r[1] * H, w: (r[2] - r[0]) * W, h: (r[3] - r[1]) * H });
  const ctx = {
    root, lib, W, H, width: W, height: H, aspect: W / H, orient: job.orient,
    /** px per 1% of the short side — every length in a scene is a multiple of this */
    unit: U, bleed: job.bleed || 0,
    palette: h.palette || job.palette, params: h.params || {}, seed: h.seed, rng: lib.makeRng(h.seed), motif: h.motif,
    /** "ground" when the scene is drawn under another style's subject; otherwise "art" */
    role: h.role || 'art',
    tone: job.style.tone, lang: document.documentElement.lang,
    content, font,
    /** say something in the render report (a missing date, a fallback): level "warn" or "error" */
    note: (msg, level = 'warn') => notes.push({ level, code: 'art-note', msg: String(msg) }),
    layout: L, focus: { x: fx, y: fy }, artSize: L.artSize, artRect,
    /** rectangles that carry type ([x0,y0,x1,y1] fractions, y down): copy blocks first, then footer/header,
     *  then the box of each piece of copy as laid out — a type theme may draw a rule past the ink */
    quiet: [...(L.quiet || [L.text]), ...copyBoxes],
    /** the safe area (inside the margins), px */
    safe: { x: f.left, y: f.top, w: f.width, h: f.height },
    /** a fraction rectangle [x0,y0,x1,y1] → { x, y, w, h } in px */
    px,
    /**
     * The box for a subject of a given aspect ratio (width / height): the largest one that fits the
     * free space the copy left, kept inside the page margins, centred on the layout's focus.
     * `fill` scales it (1 = all the room there is); `bleed: true` ignores the margins.
     */
    fit(aspect = 1, { fill = 0.92, bleed = false } = {}) {
      let { x, y, w, h: hh } = px(artRect);
      if (!bleed) { const x0 = Math.max(x, f.left), y0 = Math.max(y, f.top), x1 = Math.min(x + w, f.right), y1 = Math.min(y + hh, f.bottom); x = x0; y = y0; w = Math.max(1, x1 - x0); hh = Math.max(1, y1 - y0); }
      const k = Math.min(fill, (L.fill ?? 1) * fill);
      const bw = Math.min(w, hh * aspect) * k, bh = bw / aspect;
      // centre on the focus where that keeps the box inside its room; otherwise as near as it can get
      const cx = Math.min(x + w - bw / 2, Math.max(x + bw / 2, fx * W)), cy = Math.min(y + hh - bh / 2, Math.max(y + bh / 2, fy * H));
      return { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh, cx, cy };
    },
    /**
     * The largest rectangle of the page that no copy touches, for art that is a field rather than an
     * object (a pattern, rows of type): { x, y, w, h } in px, run out to the page edge wherever it
     * reaches the margin, plus `edges` — which page edges it touches ({ left, right, top, bottom }).
     * `gap` is the clearance kept from the copy (px).
     */
    field({ gap = U * 3 } = {}) {
      const N = 96, M = 96, cw = W / N, chh = H / M;
      const blocked = (ix, iy) => { const x0 = ix * cw, y0 = iy * chh, x1 = x0 + cw, y1 = y0 + chh; return ctx.quiet.some((q) => x1 > q[0] * W - gap && x0 < q[2] * W + gap && y1 > q[1] * H - gap && y0 < q[3] * H + gap); };
      // largest empty rectangle on the grid (row histograms)
      const heights = new Array(N).fill(0); let best = { area: 0, x0: 0, y0: 0, x1: N, y1: M };
      for (let iy = 0; iy < M; iy++) {
        for (let ix = 0; ix < N; ix++) heights[ix] = blocked(ix, iy) ? 0 : heights[ix] + 1;
        const stack = [];
        for (let ix = 0; ix <= N; ix++) {
          const hgt = ix < N ? heights[ix] : 0; let start = ix;
          while (stack.length && stack[stack.length - 1][1] >= hgt) { const [sx, sh] = stack.pop(); const area = sh * cw * chh * (ix - sx); if (area > best.area) best = { area, x0: sx, x1: ix, y0: iy + 1 - sh, y1: iy + 1 }; start = sx; }
          stack.push([start, hgt]);
        }
      }
      const edges = { left: best.x0 === 0, right: best.x1 === N, top: best.y0 === 0, bottom: best.y1 === M };
      return { x: best.x0 * cw, y: best.y0 * chh, w: (best.x1 - best.x0) * cw, h: (best.y1 - best.y0) * chh, edges };
    },
  };
  await build(ctx);
}

// ------------------------------------------------------------------ zones and placement
function zonePx(z) {
  const { frame, top, bottom, W, H, U } = state;
  // gap: between a block of copy and the header or footer row. Blocks stand on their ink (place), so
  // this is the gap the eye sees — 4.4% of the short side, about what 3.2% from a line box came to.
  const f = frame.getBoundingClientRect(), gap = U * 4.4, gut = U * 2;
  const th = top.childNodes.length ? top.getBoundingClientRect().height + gap : 0;
  const bh = bottom.childNodes.length ? bottom.getBoundingClientRect().height + gap : 0;
  const [x0, y0, x1, y1] = z;
  // Inner edges get a gutter so copy never touches the subject or the other block.
  return {
    x0: Math.max(f.left, x0 * W + (x0 > 0.01 ? gut : 0)), x1: Math.min(f.right, x1 * W - (x1 < 0.99 ? gut : 0)),
    y0: Math.max(f.top + th, y0 * H + (y0 > 0.01 ? gut : 0)), y1: Math.min(f.bottom - bh, y1 * H - (y1 < 0.99 ? gut : 0)),
    fx: f.left, fy: f.top,
  };
}

/**
 * Where the ink of a block is, top and bottom: the top of the tallest glyph on its first line and the
 * bottom of the lowest on its last. A line box is taller than its letters (leading above, descender
 * room below), so a headline hung from the margin by its box sits visibly lower than a picture that
 * starts on the same margin, and a headline that sits on the foot margin floats above it. A part
 * with a box of its own — a chip, a ruled row, a bar, a button, a picture — ends where its box does.
 */
const inkCtx = document.createElement('canvas').getContext('2d');
const clearColour = (c) => /^rgba\([^)]*,\s*0\)$/.test(c) || /\/\s*0\)$/.test(c) || c === 'transparent';
function inkRect(root) {
  const o = root.getBoundingClientRect();
  if (root.dataset.mode === 'vertical' || getComputedStyle(root).writingMode !== 'horizontal-tb') return o;
  let top = Infinity, bottom = -Infinity;
  const add = (t, b) => { top = Math.min(top, t); bottom = Math.max(bottom, b); };
  const edge = (cs, side) => parseFloat(cs[`border${side}Width`]) > 0 && cs[`border${side}Style`] !== 'none' && !clearColour(cs[`border${side}Color`]);
  const range = document.createRange(), walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const text = n.nodeValue.trim(); if (!text) continue;
    range.selectNodeContents(n);
    const rects = [...range.getClientRects()].filter((q) => q.width > 0 && q.height > 0); if (!rects.length) continue;
    const host = n.parentElement, cs = getComputedStyle(host);
    let t = Math.min(...rects.map((q) => q.top)), b = Math.max(...rects.map((q) => q.bottom));
    if (cs.writingMode === 'horizontal-tb') {
      // a text box runs from the face's ascent to its descent; the letters themselves are measured
      inkCtx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const m = inkCtx.measureText(cs.textTransform === 'uppercase' ? text.toUpperCase() : text);
      if (Number.isFinite(m.fontBoundingBoxAscent) && m.actualBoundingBoxAscent > 0) {
        b = Math.max(...rects.map((q) => q.top)) + m.fontBoundingBoxAscent + Math.max(0, m.actualBoundingBoxDescent);
        t += m.fontBoundingBoxAscent - m.actualBoundingBoxAscent;
      }
    }
    for (let a = host; a; a = a.parentElement) {
      if (a !== root) { const as = getComputedStyle(a), q = a.getBoundingClientRect(), filled = !clearColour(as.backgroundColor); if (filled || edge(as, 'Top')) t = Math.min(t, q.top); if (filled || edge(as, 'Bottom')) b = Math.max(b, q.bottom); }
      if (a === root) break;
    }
    add(t, b);
  }
  root.querySelectorAll('img, svg, .cta').forEach((n) => { const q = n.getBoundingClientRect(); if (q.width > 0 && q.height > 0) add(q.top, q.bottom); });
  if (!Number.isFinite(top)) return o;
  return { left: o.left, right: o.right, top, bottom, width: o.width, height: bottom - top };
}

/**
 * Put a block in its zone. A block that hangs from the top is hung by its ink, and one that sits at
 * the foot sits on its ink (inkRect), so the first and last lines of copy stand exactly on the
 * margins. `pin: "right"` shrinks the block to its content and sets it against the zone's right
 * edge — a block in a right-hand corner then ends on the margin instead of floating beside it.
 */
function place(block, z, halign, valign, pin) {
  const s = block.style, availH = z.y1 - z.y0, availW = z.x1 - z.x0, vertical = block.dataset.mode === 'vertical';
  if (!vertical) { s.left = `${z.x0 - z.fx}px`; s.width = pin === 'right' ? 'fit-content' : `${availW}px`; s.maxWidth = pin === 'right' ? `${availW}px` : ''; }
  const r = block.getBoundingClientRect(), ink = inkRect(block);
  const over = Math.max(0, ink.top - r.top), under = Math.max(0, r.bottom - ink.bottom);
  const y = valign === 'top' ? z.y0 - over : valign === 'bottom' ? z.y1 - r.height + under : z.y0 + (availH - r.height) / 2;
  s.top = `${Math.max(z.y0 - over, y) - z.fy}px`;
  if (vertical) {          // shrink-wrapped: align the whole group in its zone
    const x = halign === 'right' ? z.x1 - r.width : halign === 'center' ? z.x0 + (availW - r.width) / 2 : z.x0;
    s.left = `${x - z.fx}px`; s.width = '';
  } else if (pin === 'right') s.left = `${z.x1 - r.width - z.fx}px`;
}

// ------------------------------------------------------------------ headline composer
const FUNCTION_WORDS = new Set(['a', 'an', 'the', 'of', 'to', 'in', 'on', 'at', 'for', 'and', 'or', 'with', 'by', 'from', 'as', '&']);

/**
 * Split headline source into lines of tokens; each token is a run of segments carrying emphasis flags.
 * `|` closes a unit of sense ("2027 | 봄 웨딩 박람회"): every token carries the number of its unit, and
 * the result is flagged `marked` when the author drew such units.
 */
function tokenize(raw) {
  const lines = [[]]; let tok = null, em = false, strong = false, unit = 0, marked = false;
  const push = () => { if (tok && tok.segs.length) { tok.u = unit; lines[lines.length - 1].push(tok); } tok = null; };
  const src = String(raw).replace(/\r/g, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '*') { if (src[i + 1] === '*') { strong = !strong; i++; } else em = !em; continue; }
    if (ch === '|') { push(); unit++; marked = true; continue; }
    if (ch === '\n') { push(); unit++; lines.push([]); continue; }
    if (/\s/.test(ch)) { push(); continue; }
    if (!tok) tok = { segs: [] };
    const last = tok.segs[tok.segs.length - 1];
    if (last && last.em === em && last.strong === strong) last.text += ch; else tok.segs.push({ text: ch, em, strong });
  }
  push();
  const out = lines.filter((l) => l.length);
  out.marked = marked;
  return out;
}
const tokText = (t) => t.segs.map((s) => s.text).join('');

// Words that can stand apart from the name of the thing: what comes before it (the year, the edition)
// and what comes after it (the level of a class, the round of a contest, a volume, the year again).
const TITLE_LEAD = /^(\d{4}년?|제?\d+(회|기|차|주년|번째)|vol\.?\d*|시즌\d*|\d+(st|nd|rd|th))$/i;
const TITLE_TAIL = /^((기초|입문|초급|중급|고급|심화|실전|정규|주말|평일|오전|오후|저녁)(반|과정|편|코스)|\d+(기|강|차|부|탄|편|주차|회차)|본선|예선|결선|결승전?|준결승전?|시즌\d*|vol\.?\d*|\d{4})$/i;

/**
 * How strongly each word of the headline holds on to the next: 0 where a line may end freely (between
 * two units of sense), up to 1 where the two words are one unit. With units marked by the author the
 * answer is exact. Without them it is a reading of the words: a leading year or edition and a
 * trailing level or round stand apart, and in Korean — where the head comes last — the last two words
 * of what remains name the thing ("서핑 페스티벌", "웨딩 박람회") and hold together.
 */
function titleBonds(toks, marked, ko) {
  const n = toks.length, bond = new Array(Math.max(0, n - 1)).fill(0);
  if (marked) { for (let i = 0; i < n - 1; i++) bond[i] = toks[i].u === toks[i + 1].u ? 1 : 0; return bond; }
  if (n < 3) return bond;
  const text = toks.map(tokText);
  let a = 0, b = n;
  if (TITLE_LEAD.test(text[0])) a = 1;
  if (b - a >= 3 && TITLE_TAIL.test(text[n - 1])) b = n - 1;
  if (!ko) return bond;
  const m = b - a;
  if (m >= 2 && (m >= 3 || a > 0 || b < n)) bond[b - 2] = 0.6;                 // … [서핑 페스티벌]
  if (m >= 4) bond[a] = 0.4;                                                     // [지리산 둘레길] [함께 걷기]
  for (let i = a; i < b - 1; i++) {
    if (/[가-힣]의$/.test(text[i]) && [...text[i]].length >= 2) bond[i] = Math.max(bond[i], 0.5);   // "경로의 날"
    if ([...text[i]].length === 1 && bond[i] < 0.5) { bond[i] = 0.6; if (i > a && bond[i - 1] < 0.5) bond[i - 1] = 0; }   // a one-syllable word leans on what follows
  }
  return bond;
}
function lineHtml(tokens) {
  // emphasis that runs across neighbouring words stays one element (one gradient, one underline)
  const flat = [];
  tokens.forEach((t, i) => {
    if (i) { const a = tokens[i - 1].segs.at(-1), b = t.segs[0]; flat.push({ text: ' ', em: a.em && b.em, strong: a.strong && b.strong }); }
    flat.push(...t.segs);
  });
  let html = '', run = null;
  const close = () => { if (run) { let h = esc(run.text); if (run.strong) h = `<strong>${h}</strong>`; if (run.em) h = `<em>${h}</em>`; html += h; run = null; } };
  for (const s of flat) { if (run && run.em === s.em && run.strong === s.strong) run.text += s.text; else { close(); run = { ...s }; } }
  close();
  // vertical setting: short numbers stand upright side by side (가로모아쓰기) instead of lying on their side
  if (state?.vertical) html = html.replace(/(^|[^\dA-Za-z&;])(\d{1,2})(?![\dA-Za-z])/g, '$1<span class="tcy">$2</span>');
  return html;
}

/**
 * Choose line breaks and size for the headline: the arrangement that sets it largest inside
 * `inline` × `block` px, nudged towards breaks a reader would make (after punctuation, not before a
 * stranded short word, not after "of"/"the", emphasis kept together) and towards fewer lines.
 */
function composeTitle(inlineMax, blockMax, capPx, floorPx) {
  const { el, job, vertical } = state;
  const t = el.title, lines = tokenize(job.content.titleUnits || job.content.title);
  const REF = 200;
  t.style.setProperty('--title-px', `${REF}px`);
  const lh = (parseFloat(getComputedStyle(t).lineHeight) || REF * 1.1) / REF;
  const measure = (ranges) => {
    t.innerHTML = ranges.map((r) => `<span style="display:block;width:max-content">${lineHtml(r)}</span>`).join('');
    // +1.5% keeps a hair of air so rounding never tips a full-width line over the edge
    return [...t.children].map((n) => { const b = n.getBoundingClientRect(); return ((vertical ? b.height : b.width) / REF) * 1.015; });
  };
  const sizeFor = (maxW, k) => Math.min(inlineMax / maxW, blockMax / (k * lh), capPx);

  let best = null;
  if (lines.length > 1) {                       // the author placed the breaks: keep them, just size
    const ws = measure(lines);
    best = { lines, px: sizeFor(Math.max(...ws), lines.length) };
  } else {
    const toks = lines[0], n = toks.length;
    const ranges = [], idx = {};
    for (let i = 0; i < n; i++) for (let j = i; j < n; j++) { idx[`${i}:${j}`] = ranges.length; ranges.push(toks.slice(i, j + 1)); }
    const ws = measure(ranges), w = (i, j) => ws[idx[`${i}:${j}`]];
    const ko = t.dataset.script === 'ko';
    const maxK = Math.min(n, job.layout.titleMaxLines || 4, vertical ? 2 : 4);
    // Two arrangements often set at the same size (both at the cap). Where the subject stands above or
    // below the copy, each line more is height taken from it, so the one with fewer lines wins; where
    // it stands beside the copy a narrower headline leaves it more width, and the stack may win.
    const perLine = ['below-copy', 'above-copy', 'between'].includes(job.layout.artMode) ? 0.05 : 0.035;
    // Units of sense: a line should hold whole units. Cutting one costs size; worst is a line that
    // mixes a piece of one unit with words of another ("송정 서핑 / 페스티벌" for 송정 | 서핑 페스티벌).
    const bond = titleBonds(toks, lines.marked, ko), units = bond.some((v) => v > 0);
    const free = (s, e) => { for (let i = s; i < e; i++) if (bond[i] === 0) return true; return false; };
    const consider = (breaks) => {            // breaks = indices where a new line starts
      const starts = [0, ...breaks], k = starts.length;
      const lw = starts.map((s, a) => w(s, (starts[a + 1] ?? n) - 1));
      const maxW = Math.max(...lw), px = sizeFor(maxW, k);
      let pen = perLine * (k - 1), cut = 0;
      if (units) breaks.forEach((p, a) => {
        const v = bond[p - 1];
        if (!v) { pen -= 0.03; return; }
        cut = Math.max(cut, v);
        pen += 0.34 * v;
        if (free(starts[a], p - 1)) pen += 0.3 * v;
        if (free(p, (starts[a + 2] ?? n) - 1)) pen += 0.3 * v;
      });
      if (px < floorPx) pen += 0.4;           // an arrangement that only fits below the smallest size is a last resort
      starts.forEach((s, a) => {
        const e = (starts[a + 1] ?? n) - 1, lastTok = tokText(toks[e]), isLast = a === k - 1;
        if (!isLast) {
          if (/[,;:·–—!?]$/.test(lastTok)) pen -= 0.05;                           // natural pause
          if (!ko && FUNCTION_WORDS.has(lastTok.toLowerCase())) pen += 0.09;      // "the / of" left dangling
          if (toks[e].segs.at(-1).em && toks[e + 1].segs[0].em) pen += 0.05;      // emphasis split in two
          if (/\d[^\s]*$/.test(lastTok) && /^\d/.test(tokText(toks[e + 1]))) pen += 0.08;   // "12월 / 3일", "10:00 / 18:00" belong together
        } else if (k > 1 && s === e && [...lastTok].length <= (ko ? 2 : 3)) pen += 0.16;   // stranded short word
        if (k > 1) pen += 0.07 * (1 - lw[a] / maxW) * (isLast ? 0.5 : 1) / k;      // ragged block
      });
      const score = px * (1 - Math.min(pen, 0.95));
      if (!best || score > best.score) best = { score, px, cut, lines: starts.map((s, a) => toks.slice(s, starts[a + 1] ?? n)) };
    };
    const walk = (from, left, acc) => {
      if (left === 0) return consider(acc);
      for (let b = from; b <= n - left; b++) walk(b + 1, left - 1, [...acc, b]);
    };
    for (let k = 1; k <= maxK; k++) walk(1, k - 1, []);
  }
  const px = Math.max(1, best.px);
  t.innerHTML = best.lines.map(lineHtml).join('<br>');
  t.style.setProperty('--title-px', `${px}px`);
  return { px, lines: best.lines.length, tooLong: px < floorPx - 0.5, first: best.lines.map((l) => tokText(l[0])[0]), cut: lines.marked && best.cut === 1, text: best.lines.map((l) => l.map(tokText).join(' ')) };
}

// ------------------------------------------------------------------ fitting
function fitCopy() {
  const { poster, main, aside, el, job, layout, two, vertical, U } = state;
  const set = (k, v) => poster.style.setProperty(k, String(v));
  const notes = [];
  const z = zonePx(layout.text), za = two ? zonePx(layout.aside.zone) : null;
  // Copy outranks art: where the subject simply takes what the copy leaves, a long text may claim
  // up to three quarters of the height before anything is reported as overflowing.
  if (state.grow && layout.artMode === 'below-copy') z.y1 = Math.max(z.y1, Math.min(zonePx([0, 0, 1, 0.76]).y1, z.y1 + state.H * 0.2));
  if (state.grow && layout.artMode === 'above-copy') z.y0 = Math.min(z.y0, Math.max(zonePx([0, 0.24, 1, 1]).y0, z.y0 - state.H * 0.2));
  if (state.tall) { const fz = zonePx([0, 0, 1, 1]); z.y0 = fz.y0; z.y1 = fz.y1; }
  const availW = z.x1 - z.x0, availH = z.y1 - z.y0;
  const cs = getComputedStyle(poster), ts = job.typeScale || 1;
  const titleSize = parseFloat(cs.getPropertyValue('--title-size')) || 10.5;
  const fitMin = parseFloat(cs.getPropertyValue('--title-fit-min')) || 0.4, fitMax = parseFloat(cs.getPropertyValue('--title-fit-max')) || 1.16;
  const inHead = ['eyebrow', 'subtitle', ...(two ? (layout.asideHolds === 'meta' ? ['body', 'cta'] : []) : ['body', 'meta', 'cta'])].filter((k) => el[k] && (k !== 'eyebrow' || !vertical)).length;
  // How much of its zone the headline may take: generous when it has the zone to itself.
  const share = layout.titleShare ?? (inHead >= 4 ? 0.5 : inHead >= 2 ? 0.62 : inHead === 1 ? 0.74 : 0.92);

  if (!two && !vertical) settleRows(main, z);
  let scale = 1, title = null;
  const blockH = () => main.getBoundingClientRect().height, blockW = () => main.getBoundingClientRect().width;
  const fits = () => blockH() <= availH + 0.5 && (!vertical || blockW() <= availW + 0.5);
  const layoutMain = () => {
    set('--s', scale);
    if (!vertical) { main.style.left = `${z.x0 - z.fx}px`; main.style.width = `${availW}px`; }
    if (el.title) {
      const cap = U * ts * scale * titleSize * fitMax, floor = U * ts * scale * titleSize * fitMin;
      // The headline gets the room that is really left once everything else in its block is set.
      const compose = () => {
        el.title.style.marginTop = el.title.style.marginBottom = '';
        el.title.style.setProperty('--title-px', '0.01px'); el.title.textContent = '\u00a0';
        const others = vertical ? blockW() : blockH();
        const room = (v) => Math.max(v * 0.2, v - others);
        title = vertical ? composeTitle(availH, room(availW), cap, floor) : composeTitle(availW, Math.min(availH * share, room(availH)), cap, floor);
        return opticalGaps();
      };
      if (el.eyebrow) el.eyebrow.style.marginBottom = '';
      // The eyebrow stands clear of the headline by a share of the headline's own letter height,
      // which is known only once the headline is set. Where that pushed the block past its room,
      // the headline is set once more in what the wider gap leaves.
      if (compose() > 0.5 && !fits()) compose();
    }
  };
  layoutMain();
  const minScale = 0.62;
  while (!fits() && scale > minScale + 1e-6) { scale = Math.max(minScale, scale - 0.03); layoutMain(); }
  // The headline takes what the rest of its block leaves. Where that holds it under four fifths of
  // the theme's size, the block is given more height before the headline is let go that small.
  const weak = () => !!title && !vertical && title.px < U * ts * scale * titleSize * 0.8;
  if ((!fits() || scale < 0.8 || weak()) && !state.grow && !two && ['below-copy', 'above-copy'].includes(layout.artMode)) { state.grow = true; return fitCopy(); }
  // where the subject sits beside the copy (not above or below it), a long block may take the whole height
  if ((!fits() || scale < 0.86 || weak()) && !state.tall && !two && ['fixed', 'free'].includes(layout.artMode) && !vertical && (layout.text[1] > 0.01 || layout.text[3] < 0.99)) { state.tall = true; return fitCopy(); }
  if (title?.cut) notes.push({ level: 'warn', code: 'title-unit-split', msg: `A marked unit of the title is split over two lines (${title.text.join(' / ')}) because one line would have set it too small here — use a layout with a wider text zone (top, band, headline, axis), or shorten the unit.` });
  if (title?.tooLong) notes.push({ level: 'error', code: 'title-too-long', msg: 'Title does not fit even at its smallest size — shorten it, add manual line breaks (\\n), or use a layout with a wider text zone.' });
  if (!fits()) notes.push({ level: 'error', code: 'copy-overflow', msg: `Copy block is ${Math.round(blockH())}px tall but only ${Math.round(availH)}px is available — trim the body/meta, or switch layout.` });
  else if (scale < 0.86) notes.push({ level: 'warn', code: 'copy-dense', msg: `Type was scaled to ${Math.round(scale * 100)}% to fit; consider trimming copy for a stronger hierarchy.` });
  place(main, z, layout.halign, layout.valign, layout.pin);

  let scale2 = 1;
  if (two && aside.childNodes.length) {
    // Details that stand beside the headline (`band`) may take the width its lines leave free.
    let room = 0;
    if (!vertical) {
      const mr = main.getBoundingClientRect(), range = document.createRange(); range.selectNodeContents(main);
      const inkRight = Math.max(mr.left, ...[...range.getClientRects()].filter((q) => q.width > 0 && q.height > 0).map((q) => q.right));
      if (mr.bottom > za.y0 && mr.top < za.y1 && inkRight < za.x0) room = Math.max(0, za.x0 - inkRight - U * 6);
    }
    const zr = settleRows(aside, za, room); za.x0 = zr.x0;
    const aw = za.x1 - za.x0;
    aside.style.left = `${za.x0 - za.fx}px`; aside.style.width = `${aw}px`;
    const h = () => aside.getBoundingClientRect().height;
    set('--s2', scale2);
    // Where the subject sits between headline and details, the details may push upwards into the
    // art's space (never past the headline) before their type is made smaller.
    if (h() > za.y1 - za.y0 && (layout.aside.valign || 'bottom') === 'bottom') {
      const mr = main.getBoundingClientRect(), overlapX = mr.left < za.x1 && mr.right > za.x0 && mr.bottom <= za.y1;
      const ceil = overlapX ? mr.bottom + (layout.artMode === 'between' ? state.H * 0.16 : U * 4) : zonePx([0, 0, 1, 1]).y0;
      za.y0 = Math.min(za.y0, Math.max(ceil, za.y1 - h() - 1));
    }
    // …and details that hang from the top may reach down the same way, towards a headline at the foot
    if (h() > za.y1 - za.y0 && layout.aside.valign === 'top') {
      const mr = main.getBoundingClientRect(), overlapX = mr.left < za.x1 && mr.right > za.x0 && mr.top >= za.y0;
      const floor = overlapX ? mr.top - (layout.artMode === 'between' ? state.H * 0.16 : U * 4) : zonePx([0, 0, 1, 1]).y1;
      za.y1 = Math.max(za.y1, Math.min(floor, za.y0 + h() + 1));
    }
    const ah = za.y1 - za.y0;
    while (h() > ah + 0.5 && scale2 > 0.7 + 1e-6) { scale2 = Math.max(0.7, scale2 - 0.03); set('--s2', scale2); }
    if (h() > ah + 0.5) notes.push({ level: 'error', code: 'copy-overflow', msg: `Details block is ${Math.round(h())}px tall but only ${Math.round(ah)}px is available — trim the body/meta, or switch layout.` });
    else if (scale2 < 0.86) notes.push({ level: 'warn', code: 'copy-dense', msg: `Details were scaled to ${Math.round(scale2 * 100)}% to fit; consider trimming copy.` });
    place(aside, za, layout.aside.halign, layout.aside.valign, layout.aside.pin);
  }
  return { title, scale: Math.min(scale, scale2), titleFit: title ? title.px / (U * ts * titleSize) : 1, notes, layout: layout.layout };
}

/**
 * The headline's line box is a good deal taller than its letters (at 13% of the short side, some 2%
 * above and below), so a gap measured from the box reads wider than it was set, and by a different
 * amount for Hangul, capitals, tight and open leading. The gaps to the headline's neighbours — the
 * eyebrow above, the sub-headline or the information below — are therefore measured from its ink.
 */
function opticalGaps() {
  const t = state.el.title, e = state.el.eyebrow;
  if (!t || state.vertical) return 0;
  const box = t.getBoundingClientRect(), ink = inkRect(t);
  t.style.marginTop = t.previousElementSibling ? `${-Math.max(0, ink.top - box.top)}px` : '';
  t.style.marginBottom = t.nextElementSibling ? `${-Math.max(0, box.bottom - ink.bottom)}px` : '';
  // A small label set one of its own lines above letters five times its size reads as stuck to
  // them, and the larger the headline, the more air the label needs. The clear space from the foot
  // of the eyebrow to the top of the headline's letters is `--eyebrow-clear` of the height of those
  // letters, kept between `--eyebrow-clear-min` and `--eyebrow-clear-max` (% of the short side): never
  // so little that the label sticks, never so much that it stands as far off as the information
  // does. The theme's own gap (`--gap-eyebrow`) holds wherever it is the wider one.
  if (!e || e.nextElementSibling !== t) return 0;
  e.style.marginBottom = '';
  const cs = getComputedStyle(e), v = (k) => parseFloat(cs.getPropertyValue(k)) || 0, su = state.U * (v('--s') || 1) * (v('--ts') || 1);
  const want = Math.max(v('--eyebrow-clear-min') * su, Math.min(v('--eyebrow-clear') * letterHeight(t), (v('--eyebrow-clear-max') || Infinity) * su)), have = eyebrowClear();
  if (!(want > have + 0.5)) return 0;
  e.style.marginBottom = `${parseFloat(cs.marginBottom) + want - have}px`;
  return want - have;
}

/** How tall the letters of the headline's first line stand above their base line. */
function letterHeight(t) {
  let h = 0;
  const walk = document.createTreeWalker(t, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n && n.nodeName !== 'BR'; n = walk.nextNode()) {
    if (n.nodeType !== 3 || !n.nodeValue.trim()) continue;
    const cs = getComputedStyle(n.parentElement);
    inkCtx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    h = Math.max(h, inkCtx.measureText(cs.textTransform === 'uppercase' ? n.nodeValue.toUpperCase() : n.nodeValue).actualBoundingBoxAscent || 0);
  }
  return h || parseFloat(getComputedStyle(t).fontSize) * 0.72;
}

/**
 * The clear space between the eyebrow and the headline, in px: from where the eyebrow visibly ends —
 * the foot of its letters, or of its own chip, box or rule — to the top of the headline's letters.
 */
function eyebrowClear() {
  const t = state.el.title, e = state.el.eyebrow;
  if (!t || !e || state.vertical || e.nextElementSibling !== t) return null;
  const box = e.getBoundingClientRect(), cs = getComputedStyle(e);
  const ruled = parseFloat(cs.borderBottomWidth) > 0 && cs.borderBottomStyle !== 'none' && !clearColour(cs.borderBottomColor);
  const underlined = cs.backgroundImage !== 'none' && parseFloat(cs.backgroundPositionY) > 50;   // a short rule drawn under the label
  const shadow = cs.boxShadow === 'none' ? 0 : Math.max(0, ...cs.boxShadow.split(/,(?![^(]*\))/).map((s) => { const v = (s.replace(/[\w-]+\([^)]*\)/g, '').match(/-?[\d.]+px/g) ?? []).map(parseFloat); return (v[1] ?? 0) + (v[2] ?? 0) + (v[3] ?? 0); }));
  const foot = !clearColour(cs.backgroundColor) || ruled || underlined ? box.bottom + shadow : Math.min(box.bottom, inkRect(e).bottom);
  return inkRect(t).top - foot;
}

/** Large glyphs carry visible side bearing; pull the headline left so its ink lines up with the small text. */
function opticalAlign() {
  const { el, layout, vertical } = state, t = el.title;
  if (!t || vertical || (layout.halign || 'left') !== 'left') return;
  const cs = getComputedStyle(t), g = document.createElement('canvas').getContext('2d');
  g.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const upper = cs.textTransform === 'uppercase';
  const firsts = [...t.childNodes].reduce((acc, n, i, all) => { if (i === 0 || all[i - 1].nodeName === 'BR') acc.push((n.textContent || '')[0]); return acc; }, []).filter(Boolean);
  let off = Infinity;
  for (const ch of firsts) off = Math.min(off, -g.measureText(upper ? ch.toUpperCase() : ch).actualBoundingBoxLeft);
  const fs = parseFloat(cs.fontSize);
  t.style.marginLeft = Number.isFinite(off) && off > 0.5 && off < fs * 0.12 ? `${-off}px` : '';
}

/**
 * A rendered backdrop never lands exactly on the palette colour (lights tint it, tone mapping
 * shifts it). Measure what is actually behind the copy and apply a gentle exposure / white-balance
 * correction to the art so the page reads as the brand colour.
 */
function matchBackground(fit) {
  const { artImg, job, main, W, H } = state;
  try {
    const cw = 160, ch = Math.max(1, Math.round((cw * H) / W));
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(artImg, 0, 0, cw, ch);
    const r = main.getBoundingClientRect();
    // Where is bare backdrop likely? Behind the copy when it sits on the page; otherwise the corners.
    const onPage = job.layout.layout !== 'center';
    const rects = [...(onPage ? [[r.left / W, r.top / H, r.right / W, r.bottom / H]] : []), [0.02, 0.02, 0.2, 0.12], [0.8, 0.02, 0.98, 0.12], [0.02, 0.4, 0.1, 0.6]];
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    for (const [rx0, ry0, rx1, ry1] of rects) {
      const x0 = Math.floor(rx0 * cw), y0 = Math.floor(ry0 * ch), w = Math.max(2, Math.floor((rx1 - rx0) * cw)), h = Math.max(2, Math.floor((ry1 - ry0) * ch));
      const d = g.getImageData(x0, y0, w, h).data, ch3 = [[], [], []];
      for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) ch3[k].push(d[i + k]);
      const med = ch3.map((a) => { a.sort((p, q) => p - q); return a[a.length >> 1]; });
      const spread = Math.max(...ch3.map((a) => a[Math.floor(a.length * 0.9)] - a[Math.floor(a.length * 0.1)]));
      if (spread > 46) continue;                 // not a plain backdrop here
      const hex = job.palette.bg.replace('#', ''), bg = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
      const gains = med.map((m, k) => Math.min(1.45, Math.max(0.68, lin(bg[k]) / Math.max(1e-4, lin(m)))));
      if (gains.every((v) => Math.abs(v - 1) < 0.015)) return;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute"><filter id="bgmatch" color-interpolation-filters="linearRGB"><feColorMatrix type="matrix" values="${gains[0]} 0 0 0 0  0 ${gains[1]} 0 0 0  0 0 ${gains[2]} 0 0  0 0 0 1 0"/></filter></svg>`;
      document.body.insertAdjacentHTML('beforeend', svg);
      artImg.style.filter = 'url(#bgmatch)';
      fit.bgMatch = gains.map((v) => Math.round(v * 1000) / 1000);
      return;
    }
  } catch { /* cosmetic only */ }
}

// ------------------------------------------------------------------ report
function report(fit) {
  const { el, W, H, top, bottom, frame, main, aside, two } = state;
  const f = frame.getBoundingClientRect();
  const items = {};
  const all = { ...el };
  top.querySelectorAll('.brand,.logo,.badge').forEach((n) => (all[n.classList[0]] = n));
  bottom.querySelectorAll('.logos').forEach((n) => (all.logos = n));
  // accent-coloured parts are checked on their own: they are the first thing to fail on a brand palette
  for (const k of ['title', 'subtitle']) { const em = el[k]?.querySelector('em'); if (em) all[`${k}-em`] = em; }
  const dt = el.meta?.querySelector('dt'); if (dt) all['meta-label'] = dt;
  // a fully transparent background: rgba(r, g, b, 0) or "… / 0)" — not an opaque rgb() whose blue channel is 0
  const clearBg = (c) => /^rgba\([^)]*,\s*0\)$/.test(c) || /\/\s*0\)$/.test(c) || c === 'transparent';
  // text is judged where its ink is: a headline's box spans its whole zone, its lines often do not
  const inkOf = (n) => {
    const o = n.getBoundingClientRect(), cs = getComputedStyle(n);
    if (n.matches('.cta, .badge, .logo, .logos, .qr') || !clearBg(cs.backgroundColor)) return o;
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    const range = document.createRange(), walk = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
    for (let x = walk.nextNode(); x; x = walk.nextNode()) { if (!x.nodeValue.trim()) continue; range.selectNodeContents(x); for (const q of range.getClientRects()) if (q.width > 0 && q.height > 0) { l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom); } }
    if (!Number.isFinite(l)) return o;
    // a glyph's content area can be taller than its line box; the element's own box is the limit
    l = Math.max(l, o.left); t = Math.max(t, o.top); r = Math.min(r, o.right); b = Math.min(b, o.bottom);
    return { left: l, top: t, right: r, bottom: b, width: r - l, height: b - t };
  };
  for (const [k, n] of Object.entries(all)) {
    const box = n.getBoundingClientRect(), cs = getComputedStyle(n);
    if (box.width === 0 || box.height === 0) continue;   // hidden for this shape (e.g. body on a banner)
    const r = inkOf(n), ink = inkRect(n);   // r: the boxes of its lines (what contrast is sampled behind); ink: where its letters really begin and end
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
    items[k] = {
      rect: [r.left / W, r.top / H, r.right / W, r.bottom / H].map((v) => Math.round(v * 1e4) / 1e4),
      px: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      fontPx: Math.round(parseFloat(cs.fontSize) * 10) / 10,
      lines: k === 'title' ? fit.title?.lines : ['subtitle', 'eyebrow'].includes(k) ? Math.round(r.height / lh) : undefined,
      breaks: k === 'title' ? fit.title?.text : undefined,   // the headline as it was broken, line by line
      // outlined lettering reads by its outline or by its fill — whichever stands further from the page
      color: parseFloat(cs.webkitTextStrokeWidth) > 0.5 && Math.abs(cssLum(cs.webkitTextStrokeColor) - cssLum(cs.getPropertyValue('--c-paper'))) >= Math.abs(cssLum(cs.color) - cssLum(cs.getPropertyValue('--c-paper'))) ? cs.webkitTextStrokeColor : cs.color, script: n.dataset.script,
      // labels that sit on their own chip are judged against the chip, not the art
      ownBg: /rgba?\(|color\(/.test(cs.backgroundColor) && !clearBg(cs.backgroundColor) ? cs.backgroundColor : undefined,
      // the headline's box may sit a little left of the margin: its ink was optically aligned to it
      outside: ((tol) => r.left < f.left - (k === 'title' ? parseFloat(cs.fontSize) * 0.13 : tol) || r.right > f.right + tol || Math.max(r.top, ink.top) < f.top - tol || Math.min(r.bottom, ink.bottom) > f.bottom + tol)(Math.max(2, state.U * 0.4)),   // a slightly tilted chip may overhang by a hair
    };
    if (items[k].outside && !k.endsWith('-em') && k !== 'meta-label' && k !== 'badge') fit.notes.push({ level: 'error', code: 'outside-safe-area', msg: `"${k}" extends past the safe margin.` });
  }
  // how far the eyebrow stands clear of the headline, and how tall the headline's letters are (px)
  const clear = eyebrowClear();
  if (clear !== null && items.eyebrow && items.title) { items.eyebrow.clear = Math.round(clear * 10) / 10; items.title.letterPx = Math.round(letterHeight(el.title) * 10) / 10; }
  // Display faces often carry only the 2,350 common syllables; anything else silently falls back to
  // another face in the middle of the headline. Say so, so the copy or the type theme can change.
  if (el.title && el.title.dataset.script === 'ko') {
    const fam = getComputedStyle(el.title).fontFamily.split(',').map((x) => x.trim().replace(/^["']|["']$/g, ''));
    const hangulFace = fam.find((name) => [...document.fonts].some((ff) => ff.family.replace(/["']/g, '') === name && /U\+AC|U\+B|U\+C|U\+D[0-7]/i.test(ff.unicodeRange)));
    if (hangulFace) {
      const ranges = [...document.fonts].filter((ff) => ff.family.replace(/["']/g, '') === hangulFace).flatMap((ff) => ff.unicodeRange.split(',').map((r) => { const m = r.trim().match(/U\+([0-9A-F?]+)(?:-([0-9A-F]+))?/i); if (!m) return null; const a = parseInt(m[1].replace(/\?/g, '0'), 16), b = m[2] ? parseInt(m[2], 16) : parseInt(m[1].replace(/\?/g, 'F'), 16); return [a, b]; }).filter(Boolean));
      const missing = [...new Set([...plain(state.job.content.title)].filter((ch) => /[\uAC00-\uD7A3]/.test(ch) && !ranges.some(([a, b]) => ch.codePointAt(0) >= a && ch.codePointAt(0) <= b)))];
      if (missing.length) fit.notes.push({ level: 'warn', code: 'glyph-fallback', msg: `"${missing.join('')}" is not in ${hangulFace}; those syllables are set in a fallback face. Reword the title or use a type theme with a full Hangul set (bold, friendly, swiss, elegant, editorial).` });
    }
  }
  // header/footer rows colliding with themselves (too much footer text for the width)
  for (const bar of [top, bottom]) {
    const kids = [...bar.children]; if (kids.length === 2) {
      const a = kids[0].getBoundingClientRect(), b = kids[1].getBoundingClientRect();
      if (a.right > b.left + 1 && a.bottom > b.top && b.bottom > a.top) fit.notes.push({ level: 'warn', code: 'row-crowded', msg: `${bar.className.split(' ')[0]} row is crowded — shorten the ${bar === top ? 'brand/badge' : 'footer'} text.` });
    }
  }
  // where things ended up (fractions of the poster) — the orchestrator sizes the 3D subject from this
  const norm = (r) => [r.left / W, r.top / H, r.right / W, r.bottom / H];
  const mr = main.getBoundingClientRect(), tr = top.getBoundingClientRect(), br = bottom.getBoundingClientRect();
  // A block is as wide as its zone, but its lines rarely are: report where the ink is, so the subject
  // can use the room a short headline leaves.
  const inkBox = (block) => {
    const o = block.getBoundingClientRect(); let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    const add = (q) => { if (q.width > 0 && q.height > 0) { l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom); } };
    const range = document.createRange(), walk = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) { if (!n.nodeValue.trim()) continue; range.selectNodeContents(n); for (const q of range.getClientRects()) add(q); }
    block.querySelectorAll('.cta, .meta.bar, img, svg').forEach((n) => add(n.getBoundingClientRect()));
    if (!Number.isFinite(l)) return o;
    return { left: Math.max(o.left, l), top: o.top, right: Math.min(o.right, r), bottom: o.bottom };
  };
  const bounds = {
    copy: norm(inkBox(main)),
    aside: two && aside.childNodes.length ? norm(inkBox(aside)) : null,
    headerBottom: top.childNodes.length ? tr.bottom / H : null,
    footerTop: bottom.childNodes.length ? br.top / H : null,
  };
  return { width: W, height: H, bounds, layout: fit.layout, titleFit: Math.round(fit.titleFit * 1000) / 1000, typeScale: Math.round(fit.scale * 100) / 100, bgMatch: fit.bgMatch, items, notes: fit.notes, fonts: [...document.fonts].filter((x) => x.status === 'loaded').map((x) => x.family.replace(/"/g, '')).filter((v, i, a) => a.indexOf(v) === i) };
}

// ---- contrast QA: the orchestrator screenshots the poster with copy hidden and hands it back here.
window.hideCopy = (on) => document.body.classList.toggle('hide-copy', !!on);

window.measureContrast = async function measureContrast(bgDataUrl, rep) {
  const img = new Image(); img.src = bgDataUrl; await img.decode();
  const cw = 640, ch = Math.max(1, Math.round((cw * img.naturalHeight) / img.naturalWidth));
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, cw, ch);
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = (r, gg, b) => 0.2126 * lin(r) + 0.7152 * lin(gg) + 0.0722 * lin(b);
  // Let the browser resolve any CSS colour syntax (rgb(), color(srgb …), alpha) to 8-bit RGBA.
  const px = document.createElement('canvas'); px.width = px.height = 1; const pg = px.getContext('2d', { willReadFrequently: true });
  const parse = (s) => { pg.clearRect(0, 0, 1, 1); pg.fillStyle = '#000'; pg.fillStyle = s; pg.fillRect(0, 0, 1, 1); const d = pg.getImageData(0, 0, 1, 1).data; const a = d[3] / 255; return a > 0 ? [d[0] / a, d[1] / a, d[2] / a, a] : [0, 0, 0, 0]; };
  const out = {};
  for (const [k, it] of Object.entries(rep.items)) {
    if (['logo', 'logos', 'qr', 'cta', 'badge'].includes(k)) continue; // these carry their own background
    const [tr, tg, tb, ta] = parse(it.color);
    if (ta < 0.05) continue;                     // gradient-filled text: nothing meaningful to measure
    if (it.ownBg) {
      const [br, bgc, bb, ba] = parse(it.ownBg);
      if (ba > 0.6) { const a = lum(tr, tg, tb), b = lum(br, bgc, bb), v = Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100; out[k] = { typical: v, worst: v }; continue; }
    }
    const [x0, y0, x1, y1] = it.rect;
    const X0 = Math.max(0, Math.floor(x0 * cw)), Y0 = Math.max(0, Math.floor(y0 * ch));
    const w = Math.max(1, Math.min(cw - X0, Math.ceil((x1 - x0) * cw))), h = Math.max(1, Math.min(ch - Y0, Math.ceil((y1 - y0) * ch)));
    const d = g.getImageData(X0, Y0, w, h).data; const ls = [];
    // how much of the area behind this element is not plain ground: pixels that stand away from its usual colour
    const chan = [[], [], []]; for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) chan[c].push(d[i + c]);
    const med = chan.map((a) => a.slice().sort((p, q) => p - q)[a.length >> 1]);
    let off = 0; for (let i = 0; i < d.length; i += 4) if (Math.max(Math.abs(d[i] - med[0]), Math.abs(d[i + 1] - med[1]), Math.abs(d[i + 2] - med[2])) > 44) off++;
    const busy = Math.round((off / (d.length / 4)) * 100) / 100;
    // …and how much of a band round it (3% of the short side) is not plain ground: a subject that
    // comes that close to the copy touches it, even when it covers only the end of a line.
    let near;
    if (['title', 'subtitle', 'meta', 'body'].includes(k)) {
      const gp = Math.round(0.03 * Math.min(cw, ch));
      const EX0 = Math.max(0, X0 - gp), EY0 = Math.max(0, Y0 - gp), ew = Math.min(cw - EX0, X0 + w + gp - EX0), eh = Math.min(ch - EY0, Y0 + h + gp - EY0);
      const e = g.getImageData(EX0, EY0, ew, eh).data;
      let o2 = 0; for (let i = 0; i < e.length; i += 4) if (Math.max(Math.abs(e[i] - med[0]), Math.abs(e[i + 1] - med[1]), Math.abs(e[i + 2] - med[2])) > 44) o2++;
      near = Math.round((o2 / (e.length / 4)) * 1000) / 1000;
    }
    // semi-transparent ink is judged as it will appear: blended over each background pixel
    for (let i = 0; i < d.length; i += 4) ls.push([lum(d[i], d[i + 1], d[i + 2]), lum(tr * ta + d[i] * (1 - ta), tg * ta + d[i + 1] * (1 - ta), tb * ta + d[i + 2] * (1 - ta))]);
    ls.sort((a, b) => a[0] - b[0]);
    const q = (p) => ls[Math.min(ls.length - 1, Math.floor(p * ls.length))];
    const cr = ([bg, t]) => (Math.max(t, bg) + 0.05) / (Math.min(t, bg) + 0.05);
    // worst case over the bulk of the pixels behind the text (ignores 6% outliers at each end)
    const worst = Math.min(cr(q(0.06)), cr(q(0.94))), typical = cr(q(0.5));
    out[k] = { typical: Math.round(typical * 100) / 100, worst: Math.round(worst * 100) / 100, busy, ...(near !== undefined ? { near } : {}) };
  }
  return out;
};
