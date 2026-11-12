// Small colour toolbox shared by the orchestrator (palette derivation + contrast QA).

export function parseHex(hex) {
  let h = String(hex).trim().replace(/^#/, '');
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(h)) throw new Error(`Bad colour "${hex}" — use hex like #1e2a78.`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}
export const toHex = (rgb) => '#' + rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export const luminance = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
export function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
export const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

export function rgbToHsl([r, g, b]) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b); const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min; const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
export function hslToRgb([h, s, l]) {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

/**
 * Merge palettes. A palette is { bg, ink, muted, accent, colors: [...] } (all hex).
 * `override` may be: a palette name defined by the style, a partial palette object, or an array of
 * brand colours (which replace `colors`, and `accent` unless given).
 */
export function resolvePalette(style, ...overrides) {
  const named = style.palettes ?? {};
  let pal = { ...(named[style.defaultPalette] ?? Object.values(named)[0] ?? {}) };
  let name = style.defaultPalette ?? Object.keys(named)[0] ?? 'default';
  for (let o of overrides) {
    if (o == null || o === '') continue;
    if (typeof o === 'string') {
      if (!named[o]) throw new Error(`Style "${style.id}" has no palette "${o}". Available: ${Object.keys(named).join(', ')} — or pass an object like {"colors":["#..."],"bg":"#..."}.`);
      pal = { ...named[o] }; name = o; continue;
    }
    if (Array.isArray(o)) o = { colors: o };
    const next = { ...pal, ...o };
    if (o.colors && !o.accent) next.accent = pickAccent(o.colors, pal.bg ?? o.bg);
    pal = next; name = 'custom';
  }
  for (const k of ['bg', 'ink', 'accent']) if (!pal[k]) throw new Error(`Palette for style "${style.id}" is missing "${k}".`);
  pal.colors = (pal.colors ?? [pal.accent]).map((c) => toHex(parseHex(c)));
  for (const k of Object.keys(pal)) if (typeof pal[k] === 'string' && pal[k].startsWith('#')) pal[k] = toHex(parseHex(pal[k]));
  const bg = parseHex(pal.bg), darkBg = luminance(bg) < 0.4;
  // The copy must stay readable whatever colours were swapped in.
  if (contrast(parseHex(pal.ink), bg) < 4.5) pal.ink = darkBg ? '#f7f6f2' : '#14151a';
  // Accent sets small labels and emphasised words: nudge it away from the background until it reads.
  if (contrast(parseHex(pal.accent), bg) < 3.7) {
    const [h, s0, l0] = rgbToHsl(parseHex(pal.accent)); let l = l0, out = parseHex(pal.accent);
    for (let i = 0; i < 40 && contrast(out, bg) < 3.9; i++) { l += darkBg ? 0.02 : -0.02; if (l <= 0.02 || l >= 0.98) break; out = hslToRgb([h, s0, l]); }
    pal.accentOriginal = pal.accent; pal.accent = toHex(contrast(out, bg) >= 3.7 ? out : parseHex(pal.ink));
  }
  // Muted (body, footer) = ink softened towards the background, but never below AA contrast.
  // (with headroom: body text often sits where the art's glow has already lightened or darkened the page)
  if (!pal.muted || contrast(parseHex(pal.muted), bg) < 5.4) {
    let t = 0.38, m = mix(parseHex(pal.ink), bg, t);
    while (t > 0 && contrast(m, bg) < 5.8) { t -= 0.04; m = mix(parseHex(pal.ink), bg, Math.max(0, t)); }
    pal.muted = toHex(m);
  }
  return { name, ...pal };
}

// The accent is used for small type, so it needs to separate from the background.
function pickAccent(colors, bg) {
  if (!bg) return colors[0];
  const b = parseHex(bg);
  return [...colors].sort((x, y) => contrast(parseHex(y), b) - contrast(parseHex(x), b))[0];
}
