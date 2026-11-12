// Spec normalisation: turns whatever the user/Claude wrote into one predictable job description.
// Everything here is pure (no I/O) so it is easy to reason about and to test.

// A poster is A3 portrait unless the spec says otherwise (paper sizes are 300 dpi, see DEFAULT_DPI).
export const DEFAULT_FORMAT = 'a3';
// Screen formats come in two classes: 2K (the default) and 4K (only when it is asked for).
export const LONG_EDGE = { '2k': 2560, '4k': 3840 };
export const DEFAULT_RESOLUTION = '2k';
export const DEFAULT_LONG_EDGE = LONG_EDGE[DEFAULT_RESOLUTION];

// Pixel presets with a fixed size. Paper sizes are resolved from millimetres at a DPI (see PAPER_MM).
export const PRESETS = {
  '2k': [2560, 1440], 'qhd': [2560, 1440], '2k-landscape': [2560, 1440], '2k-portrait': [1440, 2560], '2k-square': [1920, 1920],
  '4k': [3840, 2160], 'uhd': [3840, 2160], '4k-landscape': [3840, 2160], '4k-portrait': [2160, 3840], '4k-square': [2880, 2880],
  '8k': [7680, 4320], 'fhd': [1920, 1080], 'hd': [1280, 720],
  'youtube-thumbnail': [1280, 720], 'og-image': [1200, 630], 'x-header': [1500, 500],
};
// Presets that name a shape rather than a size: written here at 4K class, rendered at two thirds of
// it (2K class) unless the spec asks for "resolution": "4k".
export const CLASS_PRESETS = {
  'square': [2880, 2880],
  'instagram-post': [2160, 2700], 'instagram-square': [2160, 2160], 'instagram-story': [2160, 3840],
  'story': [2160, 3840], 'reels': [2160, 3840],
  'web-banner': [3840, 1280], 'ultrawide': [3840, 1600],
  'slide': [3840, 2160], 'slide-4x3': [2880, 2160],
};
export function resolutionOf(r) {
  const k = String(r ?? DEFAULT_RESOLUTION).trim().toLowerCase();
  if (k === 'uhd') return '4k';
  if (k === 'qhd') return '2k';
  if (!LONG_EDGE[k]) throw new Error(`Unknown resolution "${r}". Use 2k (default) or 4k.`);
  return k;
}
// Print density. Every paper size is 300 dpi unless the format gives its own "dpi", and every raster
// that is written is stamped with its density (300 for screen formats too), so it opens at its true size.
export const DEFAULT_DPI = 300;
// Portrait millimetre sizes; add "-landscape" to a paper preset (or orientation: "landscape") to rotate.
export const PAPER_MM = {
  a0: [841, 1189], a1: [594, 841], a2: [420, 594], a3: [297, 420], a4: [210, 297], a5: [148, 210],
  b1: [707, 1000], b2: [500, 707], b3: [353, 500], b4: [250, 353], b5: [176, 250],
  letter: [215.9, 279.4], tabloid: [279.4, 431.8], '18x24in': [457.2, 609.6], '24x36in': [609.6, 914.4],
};

const even = (n) => Math.max(2, Math.round(n));

export function parseRatio(r) {
  if (typeof r === 'number' && r > 0) return r;
  if (typeof r !== 'string') return null;
  const m = r.trim().match(/^(\d+(?:\.\d+)?)\s*[:/xX×]\s*(\d+(?:\.\d+)?)$/);
  if (m) return parseFloat(m[1]) / parseFloat(m[2]);
  const f = parseFloat(r);
  return Number.isFinite(f) && f > 0 ? f : null;
}

/**
 * Resolve a format description to { width, height, dpi, density, label }.
 * Accepts a string ("2k", "4k", "a3", "a3-landscape", "4:5", "3000x4000") or an object
 * { preset, width, height, ratio, longEdge, orientation, dpi }.
 * No format at all means A3 portrait at 300 dpi (DEFAULT_FORMAT).
 * `resolution` ("2k" by default, or "4k") sets the size of everything that names a shape rather than
 * a size: a ratio, or a preset such as "story" or "square". Explicit pixels, the
 * presets that are a size ("4k", "fhd") and paper sizes (millimetres at a DPI) are not touched by it.
 */
export function resolveFormat(fmt, resolution) {
  const res = resolutionOf(resolution);
  const k = LONG_EDGE[res] / LONG_EDGE['4k'];
  let f = fmt ?? {};
  if (f === '' || (typeof f === 'object' && !Array.isArray(f) && !Object.keys(f).length)) f = DEFAULT_FORMAT;   // nothing said: A3 portrait
  if (typeof f === 'string') {
    const s = f.trim().toLowerCase();
    const px = s.match(/^(\d{2,5})\s*[x×*]\s*(\d{2,5})$/);
    if (px) f = { width: +px[1], height: +px[2] };
    else if (/^\d+(\.\d+)?\s*[:/]\s*\d+(\.\d+)?$/.test(s)) f = { ratio: s };
    else f = { preset: s };
  }
  f = { ...f };
  if (!f.preset && !f.width && !f.height && !f.ratio) f.preset = DEFAULT_FORMAT;   // { dpi: 150 } alone still means A3
  let dpi = f.dpi ? Number(f.dpi) : null;
  let width = f.width ? Number(f.width) : null;
  let height = f.height ? Number(f.height) : null;
  let label = null;
  let orientation = f.orientation ? String(f.orientation).toLowerCase() : null;

  if (f.preset) {
    let p = String(f.preset).toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-');
    const mo = p.match(/^(.*)-(landscape|portrait)$/);
    if (mo && !PRESETS[p] && !CLASS_PRESETS[p]) { p = mo[1]; orientation = orientation || mo[2]; }
    if (PRESETS[p]) { [width, height] = PRESETS[p]; label = p; }
    else if (CLASS_PRESETS[p]) { width = even(CLASS_PRESETS[p][0] * k); height = even(CLASS_PRESETS[p][1] * k); label = p; }
    else if (PAPER_MM[p]) {
      const [mw, mh] = PAPER_MM[p];
      dpi = dpi || DEFAULT_DPI;
      width = even((mw / 25.4) * dpi); height = even((mh / 25.4) * dpi);
      label = `${p}@${dpi}dpi`;
    } else {
      throw new Error(`Unknown format preset "${f.preset}". Known: ${[...Object.keys(PRESETS), ...Object.keys(CLASS_PRESETS), ...Object.keys(PAPER_MM)].join(', ')} — or give "WxH" / a ratio like "4:5".`);
    }
  }
  const ratio = parseRatio(f.ratio);
  if (ratio && !(width && height)) {
    const long = Number(f.longEdge) || LONG_EDGE[res];
    if (width) height = even(width / ratio);
    else if (height) width = even(height * ratio);
    else if (ratio >= 1) { width = even(long); height = even(long / ratio); }
    else { height = even(long); width = even(long * ratio); }
    label = label || `${f.ratio}`;
  }
  if (!(width && height)) { [width, height] = PRESETS[res]; label = label || res; }
  if (f.longEdge && (f.preset || (f.width && f.height))) {
    const z = Number(f.longEdge) / Math.max(width, height);
    width = even(width * z); height = even(height * z);
  }
  if (orientation === 'landscape' && height > width) [width, height] = [height, width];
  if (orientation === 'portrait' && width > height) [width, height] = [height, width];
  // dpi: set for paper formats only (it ties pixels to millimetres); density: what the files are stamped with
  return { width, height, dpi: dpi || null, density: dpi || DEFAULT_DPI, label: label || `${width}x${height}` };
}

export function orientOf(width, height) {
  const a = width / height;
  if (a >= 1.15) return 'landscape';
  if (a <= 0.87) return 'portrait';
  return 'square';
}

// ---------------------------------------------------------------- layout archetypes
// Rectangles are [x0, y0, x1, y1] as fractions of the poster.
//   text   — zone of the headline group (eyebrow, title, subtitle) and, unless `aside` is set,
//            of all the copy; the fitter keeps the block inside it
//   aside  — optional second zone for the details (body, date/place rows, button)
//   art    — where the 3D subject goes. artMode "fixed": as given; "below-copy" / "above-copy" /
//            "between": whatever the measured copy leaves free, so short copy earns a bigger subject;
//            "free": the largest clear spot inside `art` once both copy blocks are measured
//   scrim  — side the legibility gradient grows from (only visible in styles that set --scrim)
//   mode   — "vertical" sets the headline top-to-bottom (세로쓰기)
//   aside.pin, pin — "right": the details block (pin: the headline block) is as wide as its content and
//            set against the right edge of its zone, so a block in a right-hand corner ends on the margin
// Two blocks always share a line: stacked, they stand on one left edge (the headline hung from the top
// margin, the details sitting on the foot margin, or the other way round); side by side, they sit on
// one base line, the headline on the left margin and the details on a column line of their own (`band`)
// or against the right margin (`corners` in landscape).
// The subject is centred in the art rectangle and sized to `fill` × its smaller side.
const L = (text, halign, valign, extra = {}) => ({ text, halign, valign, artMode: 'fixed', fill: 1, ...extra });
export const LAYOUTS = {
  landscape: {
    left:     L([0, 0, 0.53, 1], 'left', 'center', { scrim: 'right', art: [0.50, 0, 1, 1], fill: 0.97 }),
    right:    L([0.47, 0, 1, 1], 'left', 'center', { scrim: 'left', art: [0, 0, 0.50, 1], fill: 0.97 }),
    center:   L([0.14, 0, 0.86, 1], 'center', 'center', { scrim: 'center', art: [0, 0, 1, 1] }),
    bottom:   L([0, 0.40, 0.60, 1], 'left', 'bottom', { scrim: 'up', art: [0.3, 0, 1, 1], artMode: 'free', prefer: [0.74, 0.42], fill: 0.96 }),
    top:      L([0, 0, 0.60, 0.60], 'left', 'top', { scrim: 'down', art: [0.3, 0, 1, 1], artMode: 'free', prefer: [0.74, 0.6], fill: 0.96 }),
    // headline anchored bottom-left, details in a narrow column top-right, subject between them
    corners:  L([0, 0.44, 0.62, 1], 'left', 'bottom', { scrim: 'up', titleShare: 0.82, aside: { zone: [0.6, 0, 1, 0.58], halign: 'left', valign: 'top', pin: 'right' }, art: [0, 0, 1, 1], artMode: 'free', prefer: [0.46, 0.3], fill: 0.94 }),
    // headline across the full width, details bottom-left, subject bottom-right
    headline: L([0, 0, 1, 0.58], 'left', 'top', { scrim: 'down', titleShare: 0.8, titleMaxLines: 2, aside: { zone: [0, 0.56, 0.42, 1], halign: 'left', valign: 'bottom' }, art: [0.3, 0, 1, 1], artMode: 'free', prefer: [0.74, 0.7], fill: 0.94 }),
    // vertical headline down the right edge, details bottom-left
    vertical: L([0.76, 0, 1, 1], 'right', 'top', { scrim: 'left', mode: 'vertical', aside: { zone: [0, 0.42, 0.36, 1], halign: 'left', valign: 'bottom' }, art: [0.34, 0, 0.78, 1], fill: 0.95 }),
    // headline top-left with the subject beside it; the information runs as a strip across the foot
    strip:    L([0, 0, 0.6, 0.64], 'left', 'top', { scrim: 'right', titleShare: 0.82, metaStyle: 'bar', metaMax: 5, asideHolds: 'meta', aside: { zone: [0, 0.6, 1, 1], halign: 'left', valign: 'bottom' }, art: [0.3, 0, 1, 0.82], artMode: 'free', prefer: [0.77, 0.36], fill: 0.96 }),
    // one centred axis: headline on top, subject in the middle, the information as a bar underneath
    axis:     L([0.06, 0, 0.94, 0.46], 'center', 'top', { scrim: 'down', titleShare: 0.74, titleMaxLines: 2, metaStyle: 'bar', aside: { zone: [0.06, 0.6, 0.94, 1], halign: 'center', valign: 'bottom' }, art: [0.06, 0.2, 0.94, 0.84], artMode: 'between', fill: 1.1 }),
    // the subject across the top; underneath, headline on the left and information on the right
    // (the information keeps its own column line, five eighths across: set against the right margin it
    // stood in the shadow a wide subject throws into the lower right-hand corner)
    band:     L([0, 0.42, 0.6, 1], 'left', 'bottom', { scrim: 'up', titleShare: 0.82, titleMaxLines: 2, aside: { zone: [0.64, 0.42, 1, 1], halign: 'left', valign: 'bottom' }, art: [0, 0, 1, 0.6], artMode: 'above-copy', fill: 1.02 }),
    // headline across the full width at the bottom, details top-left, subject top-right
    baseline: L([0, 0.42, 1, 1], 'left', 'bottom', { scrim: 'up', titleShare: 0.8, titleMaxLines: 2, aside: { zone: [0, 0, 0.42, 0.46], halign: 'left', valign: 'top' }, art: [0.4, 0, 1, 0.7], artMode: 'free', prefer: [0.74, 0.3] }),
  },
  portrait: {
    top:      L([0, 0, 1, 0.6], 'left', 'top', { scrim: 'down', art: [0, 0.5, 1, 1], artMode: 'below-copy', fill: 1.06 }),
    bottom:   L([0, 0.4, 1, 1], 'left', 'bottom', { scrim: 'up', art: [0, 0, 1, 0.5], artMode: 'above-copy', fill: 1.06 }),
    center:   L([0, 0, 1, 1], 'center', 'center', { scrim: 'center', art: [0, 0, 1, 1] }),
    // headline on top, subject in the middle, details as an information bar at the bottom
    corners:  L([0, 0, 1, 0.46], 'left', 'top', { scrim: 'down', titleShare: 0.86, metaStyle: 'bar', aside: { zone: [0, 0.60, 1, 1], halign: 'left', valign: 'bottom' }, art: [0, 0.3, 1, 0.8], artMode: 'between', fill: 1.06 }),
    vertical: L([0.68, 0, 1, 0.82], 'right', 'top', { scrim: 'left', mode: 'vertical', aside: { zone: [0, 0.60, 0.64, 1], halign: 'left', valign: 'bottom' }, art: [0, 0.03, 0.70, 0.62] }),
    // one centred axis: headline on top, subject in the middle, information centred underneath
    axis:     L([0, 0, 1, 0.5], 'center', 'top', { scrim: 'down', titleShare: 0.86, metaStyle: 'bar', aside: { zone: [0, 0.56, 1, 1], halign: 'center', valign: 'bottom' }, art: [0, 0.26, 1, 0.84], artMode: 'between', fill: 1.06 }),
    // information as a bar on top, subject in the middle, the headline at the foot of the sheet
    baseline: L([0, 0.5, 1, 1], 'left', 'bottom', { scrim: 'up', titleShare: 0.86, metaStyle: 'bar', aside: { zone: [0, 0, 1, 0.4], halign: 'left', valign: 'top' }, art: [0, 0.16, 1, 0.74], artMode: 'between', fill: 1.06 }),
    // copy in a column on the left (headline above, information at the foot), the subject full height beside it
    // (the column is 56% of the sheet: at half the sheet the headline set too small and a date broke over
    // two lines; any wider and the subject beside it shrinks)
    side:     L([0, 0, 0.56, 0.62], 'left', 'top', { scrim: 'right', titleShare: 0.86, aside: { zone: [0, 0.5, 0.56, 1], halign: 'left', valign: 'bottom' }, art: [0.54, 0, 1, 1], fill: 1.0 }),
  },
  square: {
    top:      L([0, 0, 1, 0.54], 'left', 'top', { scrim: 'down', art: [0, 0.5, 1, 1], artMode: 'below-copy', fill: 1.06 }),
    bottom:   L([0, 0.46, 1, 1], 'left', 'bottom', { scrim: 'up', art: [0, 0, 1, 0.5], artMode: 'above-copy', fill: 1.06 }),
    left:     L([0, 0, 0.56, 1], 'left', 'center', { scrim: 'right', art: [0.54, 0, 1, 1] }),
    right:    L([0.44, 0, 1, 1], 'left', 'center', { scrim: 'left', art: [0, 0, 0.46, 1] }),
    center:   L([0.06, 0, 0.94, 1], 'center', 'center', { scrim: 'center', art: [0, 0, 1, 1], fill: 0.94 }),
    corners:  L([0, 0, 1, 0.46], 'left', 'top', { scrim: 'down', titleShare: 0.86, metaStyle: 'bar', aside: { zone: [0, 0.62, 1, 1], halign: 'left', valign: 'bottom' }, art: [0, 0.3, 1, 0.8], artMode: 'between', fill: 1.06 }),
    vertical: L([0.70, 0, 1, 0.84], 'right', 'top', { scrim: 'left', mode: 'vertical', aside: { zone: [0, 0.58, 0.64, 1], halign: 'left', valign: 'bottom' }, art: [0, 0.03, 0.72, 0.60] }),
    axis:     L([0, 0, 1, 0.5], 'center', 'top', { scrim: 'down', titleShare: 0.86, titleMaxLines: 2, metaStyle: 'bar', aside: { zone: [0, 0.56, 1, 1], halign: 'center', valign: 'bottom' }, art: [0, 0.26, 1, 0.84], artMode: 'between', fill: 1.06 }),
    baseline: L([0, 0.5, 1, 1], 'left', 'bottom', { scrim: 'up', titleShare: 0.86, titleMaxLines: 2, metaStyle: 'bar', aside: { zone: [0, 0, 1, 0.4], halign: 'left', valign: 'top' }, art: [0, 0.16, 1, 0.74], artMode: 'between', fill: 1.06 }),
  },
};
// When a layout name does not exist for an orientation, use the nearest sensible one.
// `diagonal` was withdrawn (headline top-left, information bottom-right, the subject between them: the
// subject kept landing against the headline); an old spec that names it gets the nearest layout.
const LAYOUT_ALIAS = {
  landscape: { diagonal: 'top', side: 'left', split: 'left', stack: 'axis', panel: 'left', 'panel-left': 'left', 'panel-right': 'right', 'panel-top': 'top', 'panel-bottom': 'band', card: 'bottom' },
  portrait: { diagonal: 'corners', 'diagonal-mirror': 'corners', left: 'top', right: 'bottom', headline: 'corners', strip: 'corners', band: 'bottom', split: 'top', stack: 'axis', panel: 'bottom', 'panel-bottom': 'bottom', 'panel-top': 'top', 'panel-left': 'side', 'panel-right': 'side-mirror', card: 'bottom' },
  square: { diagonal: 'corners', 'diagonal-mirror': 'corners', headline: 'corners', strip: 'corners', band: 'bottom', side: 'left', split: 'left', stack: 'axis', panel: 'bottom', 'panel-bottom': 'bottom', 'panel-top': 'top', 'panel-left': 'left', 'panel-right': 'right', card: 'bottom' },
};

/** The same arrangement with left and right exchanged ("top-mirror": copy top-right, subject bottom-left). Type stays left-aligned. */
function mirrored(l) {
  const fx = (r) => [Math.round((1 - r[2]) * 1000) / 1000, r[1], Math.round((1 - r[0]) * 1000) / 1000, r[3]];
  const o = { ...l, text: fx(l.text) };
  if (l.art) o.art = fx(l.art);
  if (l.aside) {
    // Of two blocks, the one that now stands in the right-hand part of the sheet is set against the
    // right margin (its lines still left-aligned); the one that came to the left stands on the left
    // margin. Two blocks stacked in one column (`side`) keep the column's left edge instead.
    const right = (z) => z[0] > 0.01 && z[2] > 0.99;
    o.aside = { ...l.aside, zone: fx(l.aside.zone) };
    delete o.aside.pin; delete o.pin;
    const column = Math.abs(o.aside.zone[0] - o.text[0]) < 0.01 && Math.abs(o.aside.zone[2] - o.text[2]) < 0.01;
    if (right(o.aside.zone) && !column) o.aside.pin = 'right';
    if (right(o.text) && !column && l.mode !== 'vertical') o.pin = 'right';
  }
  if (l.prefer) o.prefer = [1 - l.prefer[0], l.prefer[1]];
  if (l.scrim === 'right' || l.scrim === 'left') o.scrim = l.scrim === 'right' ? 'left' : 'right';
  if (l.mode === 'vertical') o.halign = l.halign === 'right' ? 'left' : 'right';
  return o;
}
/** Look a layout up by name; "<name>-mirror" is made from <name> unless the table has its own. */
function layoutByName(orient, name) {
  const table = LAYOUTS[orient];
  if (!name) return null;
  if (table[name]) return { name, def: table[name] };
  const alias = LAYOUT_ALIAS[orient][name];
  if (alias && table[alias]) return { name: alias, def: table[alias] };
  if (name.endsWith('-mirror')) { const base = layoutByName(orient, name.slice(0, -7)); if (base) return { name: `${base.name}-mirror`, def: mirrored(base.def) }; }
  return null;
}

/** Pick the layout for one draft: explicit request > style default for this orientation > first archetype. */
export function resolveLayout(orient, style, requested) {
  const table = LAYOUTS[orient];
  const styleDefault = style.layouts?.[orient] ?? {};
  // a draft may name one layout per orientation: {"landscape": "band", "portrait": "axis"}
  if (requested && typeof requested === 'object' && ['landscape', 'portrait', 'square'].some((k) => k in requested)) requested = requested[orient];
  let name = requested && typeof requested === 'string' ? requested : (requested?.layout ?? styleDefault.layout);
  let found = layoutByName(orient, name);
  if (!found) { name = Object.keys(table)[0]; found = { name, def: table[name] }; }
  name = found.name;
  // Style tweaks only apply when the style's own default layout is in use (they were tuned for it).
  const tweaks = name === styleDefault.layout ? styleDefault : {};
  const custom = requested && typeof requested === 'object' ? requested : {};
  const { also, ...own } = tweaks;                 // "also" lists the other layouts the style carries; it is not a setting
  const out = { ...found.def, ...own, ...custom, layout: name };
  if (found.def.aside && custom.aside) out.aside = { ...found.def.aside, ...custom.aside };
  return out;
}

const q = (v, step) => Math.round(v / step) * step;
const r3 = (v) => Math.round(v * 1000) / 1000;

/**
 * Decide where the 3D subject goes, from the layout and the *measured* copy.
 * `bounds` comes from a typography-only pre-pass: { copy, aside, headerBottom, footerTop }.
 * Returns the layout with `focus` (subject centre), `artSize` (diameter / short side), `artRect`
 * and `quiet` (rectangles that carry type) filled in; focus and artSize can be forced.
 */
export function placeArt(layout, bounds, W, H) {
  const short = Math.min(W, H);
  const gy = (0.03 * short) / H, gx = (0.045 * short) / W;
  // Clear space between the copy and the picture: 6% of the short side. That is more than any gap
  // inside the copy block (so the picture never reads as attached to the last row of information)
  // and a little less than the page margin (7.5–8.5%), so copy and picture still read as one sheet.
  const clearance = 0.06 * short, cy = clearance / H, cx = clearance / W;
  const top = bounds.headerBottom != null ? bounds.headerBottom + gy : gy;
  const bottom = bounds.footerTop != null ? bounds.footerTop - gy : 1 - gy;
  let [x0, y0, x1, y1] = layout.art ?? [0, 0, 1, 1];
  const mode = layout.artMode;
  const blocks = [bounds.copy, bounds.aside].filter(Boolean);
  if (mode === 'below-copy') y0 = bounds.copy[3] + cy;
  if (mode === 'above-copy') y1 = Math.min(...blocks.map((b) => b[1])) - cy;      // above both columns of a two-column foot
  if (mode === 'between') {                       // between the upper block and the lower one, whichever is which
    const [up, low] = blocks.slice().sort((a, b) => a[1] - b[1]);
    y0 = up[3] + cy; if (low) y1 = low[1] - cy;
  }
  x0 = Math.max(x0, gx); x1 = Math.min(x1, 1 - gx); y0 = Math.max(y0, top); y1 = Math.min(y1, bottom);
  if (mode !== 'free' && layout.layout?.replace(/-mirror$/, '') !== 'center') {
    // A wide headline can reach into the rectangle kept for the subject: give way on the side that costs least.
    for (const b of blocks) {
      const bx0 = b[0] - cx, bx1 = b[2] + cx, by0 = b[1] - cy, by1 = b[3] + cy;
      if (bx1 <= x0 || bx0 >= x1 || by1 <= y0 || by0 >= y1) continue;
      const cands = [[x0, y0, Math.min(x1, bx0), y1], [Math.max(x0, bx1), y0, x1, y1], [x0, y0, x1, Math.min(y1, by0)], [x0, Math.max(y0, by1), x1, y1]]
        .filter((r) => r[2] - r[0] > 0.1 && r[3] - r[1] > 0.1).sort((p, q) => (q[2] - q[0]) * (q[3] - q[1]) - (p[2] - p[0]) * (p[3] - p[1]));
      if (cands.length) [x0, y0, x1, y1] = cands[0];
    }
  }
  if (y1 - y0 < 0.16) { const c = (y0 + y1) / 2; y0 = c - 0.08; y1 = c + 0.08; }   // never collapse completely
  let size = Math.max(0.24, ((layout.fill ?? 1) * Math.min((x1 - x0) * W, (y1 - y0) * H)) / short);
  let centre = [(x0 + x1) / 2, (y0 + y1) / 2];
  if (mode === 'free') {
    // The largest circle that stays inside the art rectangle and clear of every block of copy; among
    // near-equals, the one closest to where the layout would like the subject.
    const pad = clearance, want = layout.prefer ?? centre;
    const dist = (px, py, r) => Math.hypot(Math.max(r[0] * W - px, 0, px - r[2] * W), Math.max(r[1] * H - py, 0, py - r[3] * H));
    let best = null;
    for (let iy = 0; iy <= 48; iy++) for (let ix = 0; ix <= 64; ix++) {
      const cx = x0 + ((x1 - x0) * ix) / 64, cy = y0 + ((y1 - y0) * iy) / 48, px = cx * W, py = cy * H;
      let rad = Math.min(px - x0 * W, x1 * W - px, py - y0 * H, y1 * H - py);
      for (const b of blocks) rad = Math.min(rad, dist(px, py, b) - pad);
      if (rad <= 0) continue;
      const score = rad - 0.14 * Math.hypot((cx - want[0]) * W, (cy - want[1]) * H);
      if (!best || score > best.score) best = { score, rad, cx, cy };
    }
    if (best) {
      centre = [best.cx, best.cy]; size = Math.max(0.24, ((layout.fill ?? 1) * 2 * best.rad) / short);
      // The rectangle reserved for a subject that is not round: the circle's square, drawn in until it is
      // clear, then let out towards whatever room is left (to 3:2 at most).
      const clear = (r) => r[0] >= x0 - 1e-6 && r[1] >= y0 - 1e-6 && r[2] <= x1 + 1e-6 && r[3] <= y1 + 1e-6
        && blocks.every((b) => r[2] <= b[0] - pad / W || r[0] >= b[2] + pad / W || r[3] <= b[1] - pad / H || r[1] >= b[3] + pad / H);
      const sq = (k) => [best.cx - (best.rad * k) / W, best.cy - (best.rad * k) / H, best.cx + (best.rad * k) / W, best.cy + (best.rad * k) / H];
      let k = 1; while (k > 0.5 && !clear(sq(k))) k -= 0.04;
      let rect = sq(k);
      for (let n = 0; n < 60; n++) {
        let grew = false;
        for (const [i, d] of [[1, -0.01], [3, 0.01], [0, -0.01], [2, 0.01]]) {
          const t = rect.slice(); t[i] += d;
          const w = (t[2] - t[0]) * W, h = (t[3] - t[1]) * H;
          if (Math.max(w / h, h / w) <= 1.5 && clear(t)) { rect = t; grew = true; }
        }
        if (!grew) break;
      }
      [x0, y0, x1, y1] = rect;
    }
  }
  // Quantised so small copy edits do not invalidate cached renders.
  const focus = layout.focus ?? [r3(q(centre[0], 0.01)), r3(q(centre[1], 0.01))];
  const artSize = layout.artSize ?? r3(q(size, 0.02));
  const pad = (v, d) => r3(Math.min(1, Math.max(0, q(v + d, 0.02))));
  // A block of copy and the clearance round it, rounded outwards: a picture that fills the sheet (a
  // field of patches, lines, lights) keeps this much of it calm, so its first mark is as far from the
  // last row of copy as a framed picture's edge would be.
  const outw = (v, d) => r3(Math.min(1, Math.max(0, (d < 0 ? Math.floor((v + d) / 0.02 + 1e-6) : Math.ceil((v + d) / 0.02 - 1e-6)) * 0.02)));
  const grow = (r) => [outw(r[0], -cx), outw(r[1], -cy), outw(r[2], cx), outw(r[3], cy)];
  const copy = grow(bounds.copy);
  // "Quiet" rectangles: areas that carry type. Scenes keep them calm (fade colour, thin out particles).
  const quiet = [copy];
  if (bounds.aside) quiet.push(grow(bounds.aside));
  if (bounds.footerTop != null) quiet.push([0, pad(bounds.footerTop, -0.02), 1, 1]);
  if (bounds.headerBottom != null) quiet.push([0, 0, 1, pad(bounds.headerBottom, 0.02)]);
  // Quantised inwards (never towards the copy): rounding to the nearest step used to eat up to a
  // third of the clearance on a tall sheet.
  const qIn = (v, up) => (up ? Math.ceil(v / 0.02 - 1e-6) : Math.floor(v / 0.02 + 1e-6)) * 0.02;
  const artRect = [qIn(x0, true), qIn(y0, true), qIn(x1, false), qIn(y1, false)].map(r3);
  return { ...layout, focus, artSize, artRect, copy, quiet };
}

/** Who looks at this, and from how far? Decides how large supporting text has to be. */
export function viewingOf(format, requested) {
  const v = String(requested ?? '').toLowerCase();
  if (['mobile', 'screen', 'print'].includes(v)) return v;
  if (format.dpi) return 'print';
  const a = format.width / format.height, near = (x) => Math.abs(a - x) < 0.012;
  // feed posts, stories and link cards are seen at phone width
  if (near(1) || near(0.8) || near(0.5625) || near(1.91) || near(1200 / 630)) return 'mobile';
  if (/instagram|story|reels|og-image|thumbnail/.test(format.label ?? '')) return 'mobile';
  return 'screen';
}

// ---------------------------------------------------------------- content
const asList = (v) => (v == null || v === '' ? [] : Array.isArray(v) ? v : [v]);
const str = (v) => (v == null ? '' : String(v));

// ---- event information must not hide in the footer ----------------------------------------------
// People hand over "footer: 2026.11.20 (금) / 눈모루 컨벤션 그랜드볼룸 / 참가비 무료 / site.example". When, where,
// who it is for, what it costs, how to sign up and whom to ask are the body of an event poster, so
// they are lifted out of the footer into the information block (`meta`). Credits (주최, 후원…),
// bare links and copyright lines stay in the footer.
const HANGUL = /[\u3131-\u318e\uac00-\ud7a3]/;
const RE_LINK = /(https?:\/\/|www\.|@[\w.]{2,}|[\w-]+\.(kr|com|org|net|io|co|ai|dev|app|me|xyz|info|art|studio|example)(\b|\/))/i;
const RE_CREDIT = /^\s*(주최|주관|후원|협찬|협력|기획|제작|디자인|presented by|hosted by|organi[sz]ed by|sponsor(ed by)?|supported by|in partnership|©|copyright|ⓒ)/i;
const RE_DATE = new RegExp([
  '\\d{4}\\s*[.\\-/년]\\s*\\d{1,2}', '\\d{1,2}\\s*[./]\\s*\\d{1,2}', '\\d{1,2}\\s*월(\\s*\\d{1,2}\\s*일)?', '\\d{1,2}:\\d{2}',
  '\\d{1,2}\\s*(am|pm)\\b', '(오전|오후|저녁|밤)\\s*\\d', '\\d{1,2}\\s*시(\\b|\\s|$)', '\\(([월화수목금토일])\\)', '매주|매월|매일|[월화수목금토일]요일',
  '\\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\\b', '\\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?\\s*\\d{1,2}', '\\d{1,2}(st|nd|rd|th)?\\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)',
].join('|'), 'i');
const RE_PLACE = /(홀|센터|회관|극장|미술관|박물관|도서관|갤러리|캠퍼스|대학교?|호텔|광장|공원|시장|골목|스튜디오|라운지|빌딩|타워|아트|플라자|컨벤션|코엑스|킨텍스|벡스코|DDP|\d\s*층|\d\s*호|\d\s*관|\d\s*동|[로길]\s?\d|온라인|줌|hall|cent(er|re)|theat(er|re)|museum|gallery|library|studio|campus|university|hotel|arena|stadium|park|plaza|room|floor|street|\bst\.|\bave\b|road|\brd\.|online|zoom|livestream)/i;
// an item that already names what it is: "참가비 무료", "신청 site.kr", "문의: 02-123-4567", "Tickets from $10"
const RE_LABELLED = /^\s*(일시|일정|기간|날짜|시간|장소|대상|정원|모집|참가비|참가|관람료|입장료|수강료|회비|가격|신청|접수|예매|예약|등록|문의|준비물|드레스\s?코드|date|time|when|where|venue|place|location|for|fee|price|cost|admission|tickets?|rsvp|register|registration|sign[- ]?up|contact|info|dress code)\s*[:：]?\s+(\S.*)$/i;
const RE_NOTE = /(휴관|휴무|무료|유료|선착순|사전\s?(신청|등록|예약)|closed|free (entry|admission)|admission free|all ages|\b18\+|\b21\+)/i;
const RE_PHONE = /\b\d{2,4}[-.)\s]\d{3,4}[-.\s]\d{4}\b/;

/** Split "a / b | c" style footers into items; a lone separator inside a phrase is left alone. */
function footerItems(list) {
  return list.flatMap((s) => String(s).split(/\s+[\/|｜]\s+|\s+[·•]\s+(?=\S+\.[a-z]{2,}\b)|\n+/i)).map((t) => t.trim()).filter(Boolean);
}
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
export function liftInfo(footer, context = '') {
  const items = footerItems(footer), ko = HANGUL.test(items.join('') + context);
  const when = [], where = [], rows = [], rest = [];
  for (const it of items) {
    const lab = it.match(RE_LABELLED);
    if (RE_CREDIT.test(it) || it.length > 60) rest.push(it);
    else if (lab) rows.push({ label: /^[a-z]/.test(lab[1]) ? cap(lab[1]) : lab[1].replace(/\s/g, ''), value: lab[2].trim(), at: items.indexOf(it) });
    else if (RE_LINK.test(it)) rest.push(it);
    else if (RE_DATE.test(it) && !RE_NOTE.test(it)) when.push(it);
    else if (RE_PHONE.test(it)) rows.push({ label: ko ? '문의' : 'Contact', value: it, at: items.indexOf(it) });
    else if (/^\s*(무료|free)(\s*(입장|관람|참가|entry|admission))?\s*$/i.test(it)) rows.push({ label: ko ? '참가비' : 'Admission', value: ko ? '무료' : 'Free', at: items.indexOf(it) });
    else if (RE_NOTE.test(it)) rows.push({ label: ko ? '안내' : 'Note', value: it, at: items.indexOf(it) });
    else if (RE_PLACE.test(it)) where.push(it);
    else rest.push(it);
  }
  // an unclassified short item right after a date is almost always the venue ("12.3 (목) / 서교동 틈")
  if (when.length && !where.length && !rows.some((r) => /^(장소|venue|where|place|location)$/i.test(r.label))) {
    const i = rest.findIndex((it) => !RE_LINK.test(it) && !RE_CREDIT.test(it) && it.length <= 28 && items.indexOf(it) > items.indexOf(when[0]));
    if (i >= 0) where.push(...rest.splice(i, 1));
  }
  if (!when.length && !where.length && !rows.length) return { meta: [], footer };   // nothing to lift: the footer stays exactly as written
  const meta = [];
  if (when.length) meta.push({ label: ko ? '일시' : 'Date', value: when.join(' ') });
  if (where.length) meta.push({ label: ko ? '장소' : 'Venue', value: where.join(ko ? ' ' : ', ') });
  // labelled rows keep the order they were written in; "일시"/"장소" written out by the user go first
  rows.sort((x, y) => x.at - y.at);
  const first = (r) => /^(일시|일정|기간|날짜|date|when|time)$/i.test(r.label) ? 0 : /^(장소|venue|where|place|location)$/i.test(r.label) ? 1 : 2;
  const lead = rows.filter((r) => first(r) < 2).sort((x, y) => first(x) - first(y)), tail = rows.filter((r) => first(r) === 2);
  return { meta: [...lead, ...meta, ...tail].map(({ label, value }) => ({ label, value })), footer: rest };
}

export function normalizeContent(c = {}) {
  let meta = asList(c.meta ?? c.info).map((m) => {
    if (m && typeof m === 'object') return { label: str(m.label ?? m.key ?? ''), value: str(m.value ?? m.text ?? '') };
    const s = str(m); const i = s.search(/[:：|]/);
    return i > 0 && i < 14 ? { label: s.slice(0, i).trim(), value: s.slice(i + 1).trim() } : { label: '', value: s };
  }).filter((m) => m.value);
  let footer = asList(c.footer).map(str).filter(Boolean);
  // `"keyFacts": false` keeps the footer exactly as written
  let lifted = false;
  if (!meta.length && footer.length && c.keyFacts !== false) { ({ meta, footer } = liftInfo(footer, asList(c.title).map(str).join(' ') + str(c.subtitle))); lifted = meta.length > 0; }
  // The title may mark its units of sense: "2027 | 봄 웨딩 박람회" or ["2027", "봄 웨딩 박람회"].
  // Words of one unit stay on one line where they can; the marks never print.
  const titleSrc = Array.isArray(c.title) ? c.title.map(str).map((x) => x.trim()).filter(Boolean).join(' | ') : str(c.title);
  const title = titleSrc.replace(/[ \t]*\|[ \t]*/g, ' ').replace(/[ \t]{2,}/g, ' ').trim();
  return {
    lifted,
    eyebrow: str(c.eyebrow), title, titleUnits: titleSrc.includes('|') ? titleSrc.trim() : '', subtitle: str(c.subtitle),
    body: asList(c.body).map(str).filter(Boolean),
    footer,
    meta, cta: str(c.cta), badge: str(c.badge), brand: str(c.brand),
    logo: str(c.logo), logos: asList(c.logos).map(str).filter(Boolean),
    qr: str(c.qr), qrLabel: str(c.qrLabel),
    slots: asList(c.slots).filter((s) => s && typeof s === 'object'),
  };
}

export function slugify(s, fallback = 'poster') {
  const t = String(s || '').normalize('NFKC').replace(/[*_`~]/g, '').trim().toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return t || fallback;
}

/** Quality tiers. artScale scales the 3D layer only; type is always rendered at full resolution. */
export const QUALITY = {
  draft:    { artScale: 0.5, samples: 32,  timeLimit: 90 },
  standard: { artScale: 1.0, samples: 64,  timeLimit: 420 },
  high:     { artScale: 1.0, samples: 192, timeLimit: 1500 },
};

export function normalizeSpec(raw = {}, cli = {}) {
  const spec = { ...raw };
  const resolution = resolutionOf(cli.resolution ?? spec.resolution);
  const format = resolveFormat(cli.format ?? spec.format, resolution);
  const content = normalizeContent(spec.content ?? spec);
  const quality = String(cli.quality ?? spec.quality ?? 'standard').toLowerCase();
  if (!QUALITY[quality]) throw new Error(`Unknown quality "${quality}". Use draft | standard | high.`);

  // drafts: explicit list of objects, or a list of style ids, or "auto"
  let drafts = spec.drafts ?? spec.styles ?? 'auto';
  if (cli.styles) drafts = cli.styles;
  if (typeof drafts === 'string') drafts = drafts === 'auto' ? 'auto' : drafts.split(',').map((s) => s.trim()).filter(Boolean);
  if (Array.isArray(drafts)) drafts = drafts.map((d) => (typeof d === 'string' ? { style: d } : { ...d }));

  const out = spec.output ?? {};
  const formats = asList(cli.formats ?? out.formats ?? out.format ?? 'png').flatMap((s) => String(s).split(',')).map((s) => s.trim().toLowerCase()).filter(Boolean);
  for (const f of formats) if (!['png', 'jpg', 'jpeg', 'pdf', 'webp'].includes(f)) throw new Error(`Unsupported output format "${f}" (png, jpg, pdf).`);

  return {
    name: slugify(spec.name ?? content.title),
    content, rawContent: spec.content ?? spec, format, resolution, quality,
    orient: orientOf(format.width, format.height),
    drafts,
    // The automatic choice draws from three.js and HTML styles unless Blender is asked for
    // ("blender": true, --blender); then every draft uses Blender.
    blender: cli.blender === true || spec.blender === true,
    count: Number(cli.count ?? spec.count ?? 3),
    seed: Number.isFinite(Number(cli.seed ?? spec.seed)) ? Number(cli.seed ?? spec.seed) : 7,
    palette: spec.palette ?? null,   // applied to every draft (brand colours)
    fonts: spec.fonts ?? null,       // { title, body, mono } font-family overrides for every draft
    fontFaces: asList(spec.fontFaces).filter((f) => f && f.family && f.src),   // [{ family, src, weight?, style? }] user font files
    layout: spec.layout ?? null,     // applied to every draft unless the draft says otherwise
    lang: spec.lang ?? null,
    css: str(spec.css),              // extra CSS appended after the theme (escape hatch)
    formats: [...new Set(formats.map((f) => (f === 'jpeg' ? 'jpg' : f)))],
    typeScale: Number(spec.typeScale ?? 1),
    margin: spec.margin ?? null,
    type: spec.type ?? null,           // typography theme applied to every draft
    viewing: viewingOf(format, cli.viewing ?? spec.viewing),
    // print bleed (mm) only means something for paper formats, where a dpi ties pixels to millimetres
    bleedMm: format.dpi ? Math.max(0, Number(cli.bleed ?? spec.bleed ?? 0)) || 0 : 0,
    get bleedPx() { return this.bleedMm ? Math.round((this.bleedMm / 25.4) * format.dpi) : 0; },
    framed: !!spec.framed,
  };
}
