// transit — the place of the event drawn as a diagram. A metro map in the modernist manner: thick
// lines in a few flat colours that run only horizontally, vertically and at 45°, bends of one radius,
// page-coloured station dots, and one interchange picked out in the accent and flagged with the venue
// from the poster's own copy, the date and time under it. Where `numerals` makes the date the
// picture, this makes the place the picture. An HTML scene: one SVG, vector at any size.
//
// Read from the copy: the venue (the information row labelled 장소 / 주소 / 오시는 길 / Venue / Where /
//          Place / Location / Address; without one, the first words of the headline, with a note),
//          the date and time (eventDate), and a few short words of the eyebrow and headline that
//          name other stations (keywords, minus the button, the badge and the articles).
// Palette: colors[]  = the line colours (blocks: colors[0] water, colors[1] park)
//          accent    = the venue: marker, flag, pin, main road. Lines take the other colours first
//          ink / bg  = station rings and labels / station dots and streets
// Motifs:  metro  — three to five lines, the venue an interchange              (metro.js)
//          route  — one line with numbered stops, the last one the venue       (route.js)
//          blocks — a street map from above with a pin on the venue's block    (blocks.js)
// Params:  lines (metro: 3–5) · map (metro: triangle | junction | ring; empty = seeded)
//          stops (route: 5–7; empty = seeded) · names (other names from the copy: 0–5)
// Files:   kit.js — what html-lib.js does not have: canvas measuring, the room clear of the copy,
//          polylines with rounded bends, rectangle and segment tests for placing labels, the flag,
//          the bullet. Every length comes from ctx.unit / W / H, every colour from the palette,
//          every random choice from ctx.rng.
import { svg, standOff, eventDate, keywords, MONTH_NAMES, DAY_NAMES, isKorean } from '/skill/assets/web/html-lib.js';
import { load, sameInk, onInk } from './kit.js';
import metro from './metro.js';
import route from './route.js';
import blocks from './blocks.js';

const PLACE_RE = /장소|주소|오시는\s*길|위치|곳|venue|where|place|location|address/i;
// words that cannot stand alone as a station name
const STOP_WORDS = /^(the|of|a|an|and|in|on|at|for|to|by|with|from|or|is|are|our|your|my|now|&)$/i;
const FLAG_WORDS = /^(무료|free|선착순|마감|입장|rsvp|sold)$/i;
const count = (s) => [...String(s)].length;

/**
 * The venue as written in the copy. A long one is shortened: anything in brackets goes, then it is
 * cut at a comma (keeping the parts before it until there is enough to stand as a name), and in the
 * end at a word boundary.
 */
function venueOf(ctx) {
  const { content } = ctx;
  const row = (content.meta || []).find((r) => PLACE_RE.test(r.label || '') && r.value);
  if (row) {
    let v = row.value.trim();
    if (count(v) > 16) {
      const bare = v.replace(/\s*[(（\[][^)）\]]*[)）\]]?\s*/g, ' ').trim();
      if (count(bare) >= 2) v = bare;
      let s = '';
      for (const part of v.split(/\s*[,·|/]\s*/).filter(Boolean)) { if (s && (count(s) >= 10 || count(s + ', ' + part) > 24)) break; s = s ? `${s}, ${part}` : part; }
      if (count(s) >= 2) v = s;
    }
    if (count(v) > 26) { let s = ''; for (const w of v.split(/\s+/)) { if (s && count(s + ' ' + w) > 24) break; s = s ? s + ' ' + w : w; } v = [...s].slice(0, 26).join(''); }
    return v;
  }
  // no venue in the copy: the first words of the headline stand in for it
  let s = '';
  for (const w of content.title.split(/\s+/).filter(Boolean)) { if (s && count(s + ' ' + w) > 14) break; s = s ? s + ' ' + w : w; }
  ctx.note('transit: the copy names no venue, so the marked station carries the first words of the headline. Put the place in "meta" (label 장소 / Venue) to print it on the map.');
  return s || '—';
}

/** One line of small type for under the flag: the date (or the run of dates) and the time, read from the copy. */
function whenOf(content, ko) {
  const d = eventDate(content);
  if (!d) return '';
  const two = (n) => String(n).padStart(2, '0');
  const day = (m, dd) => (ko ? `${m}.${two(dd)}` : `${dd} ${MONTH_NAMES.enShort[m - 1]}`);
  const wd = d.weekdayStated ?? d.weekday;                               // the weekday as the copy writes it, when it does
  let s = d.end ? `${day(d.month, d.day)} – ${day(d.end.month, d.end.day)}` : ko ? `${day(d.month, d.day)} (${DAY_NAMES.koShort[wd]})` : `${DAY_NAMES.enShort[wd]} ${day(d.month, d.day)}`;
  if (d.time) s += ` · ${d.time}`;
  return s;
}

/**
 * Short words from the copy that can name a station: the words of the eyebrow, the brand and the
 * headline. Not the button or the badge, not "free" or "first come", no articles, no bare numbers,
 * nothing the venue already says.
 */
function namesOf(content, venue, max) {
  const out = [], skip = [content.cta, content.badge].filter(Boolean).map((s) => s.toLowerCase());
  // A Hangul word that ends in an object or topic particle ("밤을", "건너는") is a piece of a sentence,
  // not a name a station could carry; the few nouns that end the same way are let through.
  const sentencePiece = (w) => /[을를은는]$/.test(w) && !/(가을|마을|노을|고을)$/.test(w);
  for (const w of keywords(content, 16)) {
    const n = count(w), ko = isKorean(w);
    if (n < (ko ? 1 : 3) || n > (ko ? 7 : 11) || STOP_WORDS.test(w) || FLAG_WORDS.test(w) || /^[\d\s.,:/-]+$/.test(w) || skip.includes(w.toLowerCase()) || venue.includes(w)) continue;
    if (ko && n >= 2 && sentencePiece(w)) continue;
    if (!out.includes(w)) out.push(w);
  }
  return out.slice(0, max);
}

export default async function build(ctx) {
  const { W, H, unit: U, palette: pal, params, content, font } = ctx;
  const motif = ['metro', 'route', 'blocks'].includes(params.motif) ? params.motif : 'metro';
  const ko = ctx.lang === 'ko' || isKorean(content.title);
  const root = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  ctx.root.append(root);

  // ---- the copy: venue, date and time, a few words for other stations
  const venue = venueOf(ctx), when = whenOf(content, ko);
  const names = namesOf(content, venue, Math.max(0, Math.min(5, Number(params.names ?? 3))));

  // ---- the inks. The accent is the venue's; every line colour is kept clear of the page
  const mark = standOff(pal.accent, pal.bg, pal.ink, 3);
  const lines = (pal.colors || []).map((c) => standOff(c, pal.bg, pal.ink, 1.18));
  // lines take the colours that are not the accent first, so the venue's colour stays rare on the map
  const lineColors = [...lines.filter((c) => !sameInk(c, mark)), ...lines.filter((c) => sameInk(c, mark))];
  if (!lineColors.length) lineColors.push(pal.ink);

  const f = {
    flag: { family: font.body.family, weight: 700, style: 'normal' },   // the venue's name on its tag
    name: { family: font.body.family, weight: 600, style: 'normal' },   // other stations
    sub: { family: font.body.family, weight: 600, style: 'normal' },    // date and time
    num: { family: font.body.family, weight: 700, style: 'normal' },    // numbers in bullets
  };
  await load(f.flag, venue + '장소홀HEA');
  await load(f.name, names.join('') + when + '0123456789ABCDE');

  const onMark = onInk(mark, pal);                                       // the lettering on the flag and the venue's stop
  const env = { ctx, root, pal, U, W, H, ko, f, venue, when, names, mark, onMark, lineColors, params, rng: ctx.rng };
  if (motif === 'route') await route(env);
  else if (motif === 'blocks') await blocks(env);
  else await metro(env);
}
