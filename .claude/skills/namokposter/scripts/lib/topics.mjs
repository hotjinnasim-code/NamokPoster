// What is this poster about — and which art styles, typography and colours suit that?
//
// `assets/topics.json` holds, per topic, the words that signal it in poster copy (Korean and
// English) and what high-end posters on that subject tend to look like: art styles (with a motif),
// typography themes, colour directions and layouts. `classify` scores the copy against the topics;
// `suggest` turns the leading topics into a set of drafts that differ from one another in
// technique, tone and typography.
import fs from 'node:fs';
import path from 'node:path';
import { parseHex, luminance } from './color.mjs';
import { eventDate } from '../../assets/web/copy-read.mjs';

export function loadTopics(skillRoot) {
  const f = path.join(skillRoot, 'assets', 'topics.json');
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
}

const norm = (s) => String(s ?? '').normalize('NFKC').toLowerCase();
const SEASON = (m) => (m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter');
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Month (1–12) of the first date found in the copy, or null. */
const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'sept'];
export function monthOf(text) {
  const t = norm(text);
  let m = t.match(/(?:20\d\d\s*[.\-/년]\s*)(\d{1,2})\s*[.\-/월]/) || t.match(/(\d{1,2})\s*월/) || t.match(/(?:^|[^\d.])(\d{1,2})\s*[./]\s*\d{1,2}(?:\s*\(|\s|$|[^\d.])/);
  if (m) { const v = Number(m[1]); if (v >= 1 && v <= 12) return v; }
  // month names only as whole words beside a number ("12 March", "Dec 5", "May 2026") — not "decade", "you may", "march past"
  const names = MONTH_NAMES.join('|');
  m = t.match(new RegExp(`\\b\\d{1,4}(?:st|nd|rd|th)?\\s+(${names})\\b`)) || t.match(new RegExp(`\\b(${names})\\.?\\s+\\d{1,4}\\b`));
  return m ? (m[1] === 'sept' ? 9 : (MONTH_NAMES.indexOf(m[1]) % 12) + 1) : null;
}

/** Score every topic against the copy. Returns [{ topic, score, share, hits }] best first (never empty). */
export function classify(content, topics) {
  const fields = [
    [content.title, 3], [content.eyebrow, 2], [content.subtitle, 2], [content.badge, 1.2], [(content.body ?? []).join(' '), 1],
    [(content.meta ?? []).filter((m) => !/^(장소|주소|오시는\s?길|venue|where|place|location|address)$/i.test(String(m.label).trim())).map((m) => `${m.label} ${m.value}`).join(' '), 0.6], [(content.footer ?? []).join(' '), 0.4], [content.brand, 0.5],
    // (the call to action is left out: "Book now", "Register" and "신청하기" say what to do, not what the poster is about)
  ].map(([t, w]) => [norm(t), w]).filter(([t]) => t);
  const stop = new Set([...(topics.general?.ko ?? []), ...(topics.general?.en ?? [])].map(norm));
  // Hangul keywords match anywhere (조사 follow the noun); Latin ones only as whole words
  const lists = Object.entries(topics).filter(([t]) => !t.startsWith('_') && t !== 'general')
    .map(([t, def]) => [t, [...new Set([...(def.ko ?? []), ...(def.en ?? [])].map(norm))].filter((k) => k.length > 1 && !stop.has(k))]);
  // A Hangul keyword that sits inside a longer, unrelated word does not count ("트리" in "트리오", "스트리트"):
  // topics._meta.ko_not_inside lists, per keyword, the words to look past.
  const notInside = topics._meta?.ko_not_inside ?? {};
  const has = (text, k) => {
    if (!/[^\x00-\x7f]/.test(k)) return new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(s|es)?($|[^a-z0-9])`).test(text);
    for (const w of notInside[k] ?? []) text = text.split(norm(w)).join(' ');
    return text.includes(k);
  };
  const score = Object.fromEntries(lists.map(([t]) => [t, 0])), hits = Object.fromEntries(lists.map(([t]) => [t, new Set()]));
  for (const [text, w] of fields) {
    const found = lists.map(([t, words]) => [t, words.filter((k) => has(text, k))]);
    // the longest match wins, across topics: "푸드 페스티벌" is food, not also a music 페스티벌; "머신러닝" is not 러닝
    const all = [...new Set(found.flatMap(([, ks]) => ks))];
    const dominated = new Set(all.filter((k) => all.some((o) => o.length > k.length && o.includes(k))));
    for (const [t, ks] of found) {
      let n = 0;
      for (const k of ks) if (!dominated.has(k)) { n += 1 + Math.min(1, k.length / 6) * 0.5; hits[t].add(k); }   // longer words are more telling
      score[t] += w * Math.sqrt(n);
    }
  }
  const out = lists.filter(([t]) => score[t] > 0).map(([t]) => ({ topic: t, score: score[t], hits: [...hits[t]] }));
  // a dated event leans towards its season
  const month = monthOf(fields.map(([t]) => t).join(' '));
  if (month && topics[SEASON(month)]) {
    const s = SEASON(month), e = out.find((o) => o.topic === s);
    if (e) e.score += 0.8; else out.push({ topic: s, score: 0.8, hits: [`month ${month}`] });
  }
  // a season colours a poster (palette, motif) but rarely decides what kind of poster it is: let the subject lead
  const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
  if (out.some((o) => !SEASONS.includes(o.topic))) for (const o of out) if (SEASONS.includes(o.topic)) o.score *= 0.55;
  out.sort((a, b) => b.score - a.score);
  const top = out.slice(0, 4);
  if (!top.length || top[0].score < 1.2) top.push({ topic: 'general', score: Math.max(0.6, 1.6 - (top[0]?.score ?? 0)), hits: [] });
  const total = top.reduce((a, o) => a + o.score, 0) || 1;
  return top.sort((a, b) => b.score - a.score).map((o) => ({ ...o, score: Math.round(o.score * 100) / 100, share: Math.round((o.score / total) * 100) / 100 }));
}

// What each layout is like: `fam` — its structure (a set of drafts should not repeat one), `room` — how
// much copy it holds (1 little … 3 a lot), `narrow` — the headline gets a narrow column.
const LAYOUT_INFO = {
  landscape: {
    left: { fam: 'split', room: 3 }, right: { fam: 'split', room: 3 },
    top: { fam: 'stack', room: 3 }, bottom: { fam: 'stack', room: 3 }, band: { fam: 'stack', room: 2.5 },
    corners: { fam: 'spread', room: 2 }, headline: { fam: 'spread', room: 2 }, baseline: { fam: 'spread', room: 2 }, strip: { fam: 'spread', room: 3 },
    center: { fam: 'centre', room: 2 }, axis: { fam: 'centre', room: 1.5 }, vertical: { fam: 'vertical', room: 2, narrow: true },
  },
  portrait: {
    top: { fam: 'stack', room: 3 }, bottom: { fam: 'stack', room: 3 },
    corners: { fam: 'spread', room: 2.5 }, baseline: { fam: 'spread', room: 2.5 },
    center: { fam: 'centre', room: 2.5 }, axis: { fam: 'centre', room: 2.5 }, vertical: { fam: 'vertical', room: 2, narrow: true },
    side: { fam: 'split', room: 2, narrow: true },
  },
};
const MIRRORABLE = { landscape: ['top', 'bottom', 'corners', 'headline', 'baseline', 'strip', 'vertical'], portrait: ['side', 'vertical'], square: ['vertical'] };
LAYOUT_INFO.square = { ...LAYOUT_INFO.portrait, left: { fam: 'split', room: 2, narrow: true }, right: { fam: 'split', room: 2, narrow: true } };
delete LAYOUT_INFO.square.side;

// small deterministic hash → 0..1, so two posters on the same topic do not get identical sets
const hash01 = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return ((h >>> 0) % 10007) / 10007; };
const rgbDist = (a, b) => { try { const x = parseHex(a), y = parseHex(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); } catch { return 1; } };
const isDark = (hex) => { try { return luminance(parseHex(hex)) < 0.2; } catch { return false; } };

/** The sober type themes (topics._meta.solemn.types) when the copy mourns or remembers the dead, else null. */
export function solemnTypes(content, topics) {
  const s = topics?._meta?.solemn; if (!s) return null;
  const text = norm([content.title, content.eyebrow, content.subtitle, content.badge, ...(content.body ?? [])].join(' '));
  const hit = (k) => (/[^\x00-\x7f]/.test(k) ? text.includes(norm(k)) : new RegExp(`(^|[^a-z0-9])${norm(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(s)?($|[^a-z0-9])`).test(text));
  return [...(s.ko ?? []), ...(s.en ?? [])].some(hit) ? (s.types ?? []) : null;
}

/** The style's motif that best fits the leading topics (or the one named in the topic entry). */
function pickMotif(style, hint, weights) {
  const motifs = style.motifs ? Object.entries(style.motifs) : [];
  if (!motifs.length) return null;
  const h = norm(hint);
  const named = h && motifs.find(([k, m]) => h.split(/[^a-z0-9가-힣]+/).includes(k) || (h.length > 2 && norm(m.note).includes(h)));
  if (named) return named[0];
  let best = null, bs = 0;
  for (const [k, m] of motifs) { const s = (m.topics ?? []).reduce((a, t) => a + (weights[t] ?? 0), 0); if (s > bs) { bs = s; best = k; } }
  return best ?? style.params?.motif?.default ?? motifs[0][0];
}

/**
 * Build `count` drafts for this copy. `styles` is the loaded style table, `types` the list of theme
 * ids. Returns { topics, drafts: [{ style, motif?, type, palette?, layout?, why }] }.
 *
 * `engines` says which art engines the set is drawn from:
 *   'fast'    — three.js and HTML styles only (the default: a set renders in seconds)
 *   'blender' — every draft is a Blender style, on its own or on a ground drawn by another engine
 *               (what the user gets by asking for Blender; minutes per draft)
 *   'any'     — all styles
 */
export function suggest(content, topics, styles, types, { count = 3, engines = 'fast', seed = 7, orient = 'landscape' } = {}) {
  const allowed = (s) => (engines === 'blender' ? s.engine === 'blender' : engines === 'fast' ? s.engine !== 'blender' : true);
  const ranked = classify(content, topics), weights = Object.fromEntries(ranked.map((r) => [r.topic, r.share]));
  const salt = `${content.title}|${seed}`;
  // ---- candidate styles: what the leading topics recommend, plus what styles say about themselves
  const cand = new Map();
  const add = (id, s, motif, why) => { if (!styles[id]) return; const c = cand.get(id) ?? { id, score: 0, motif: null, why: [] }; if (!c.motif && motif) c.motif = motif; c.score += s; if (why && c.why.length < 2) c.why.push(why); cand.set(id, c); };
  for (const { topic, share } of ranked) {
    const list = topics[topic]?.styles ?? [];
    const lead = topic === ranked[0].topic;   // what the leading topic ranks first should lead the set
    list.forEach((e, i) => { const id = typeof e === 'string' ? e : e.id; add(id, share * (1 - (i / Math.max(1, list.length)) * 0.6) + (lead && i < 3 ? share * (0.3 - i * 0.08) : 0), typeof e === 'object' ? e.motif : null, typeof e === 'object' && e.why ? `${topic}: ${e.why}` : topic); });
  }
  for (const s of Object.values(styles)) {
    const own = (s.topics ?? []).reduce((a, t) => a + (weights[t] ?? 0), 0) * 0.35;
    const viaMotif = Math.max(0, ...Object.values(s.motifs ?? {}).map((m) => (m.topics ?? []).reduce((a, t) => a + (weights[t] ?? 0), 0))) * 0.35;
    if (own + viaMotif > 0) add(s.id, own + viaMotif, null, null);
  }
  if (!cand.size) for (const s of Object.values(styles)) add(s.id, 0.1, null, 'general');
  // ---- what the copy itself offers. A style that is made from something in the copy (the date set
  // enormous, a calendar sheet) is only a candidate when the copy has it — and when a poster is little
  // more than a headline and a date, the date is the picture worth making.
  const date = eventDate(content);
  const load0 = (content.meta ?? []).length + (content.body ?? []).join(' ').length / 70 + (content.subtitle ? 0.5 : 0);
  const has = { date: !!date };
  for (const [id, c] of [...cand]) if ((styles[id].requires ?? []).some((r) => !has[r])) cand.delete(id);
  if (date) for (const c of cand.values()) if ((styles[c.id].requires ?? []).includes('date')) { c.score *= load0 <= 2.5 ? 1.5 : 1.15; if (load0 <= 2.5 && c.why.length < 2) c.why.push('one date to remember'); }
  let pool = [...cand.values()].filter((c) => allowed(styles[c.id]));
  if (pool.length < count) for (const s of Object.values(styles)) if (!pool.some((c) => c.id === s.id) && allowed(s) && !(s.requires ?? []).some((r) => !has[r])) pool.push({ id: s.id, score: 0.05, motif: null, why: [] });
  for (const c of pool) c.score *= 0.88 + 0.24 * hash01(`${salt}|${c.id}`);
  // A style rooted in one culture ("context": "korean" — 나전, 조각보) is for copy in that language or about that tradition;
  // on an English gala poster it would be costume.
  const copyText = [content.title, content.eyebrow, content.subtitle, ...(content.body ?? [])].join(' ');
  const korean = /[\uac00-\ud7a3]/.test(copyText) || (weights.tradition ?? 0) > 0;
  for (const c of pool) if (styles[c.id].context === 'korean' && !korean) c.score *= 0.25;
  // three.js comes first in the default set: a picture with material, light and depth carries a poster
  // further than a flat sheet. An HTML style keeps its place when it is made from the copy itself (it
  // needs the date, and the copy has one); otherwise it ranks behind the rendered techniques.
  if (engines !== 'blender') for (const c of pool) if (styles[c.id].engine === 'html') c.score *= (styles[c.id].requires ?? []).length ? 0.9 : 0.6;

  // ---- choose a set that differs in technique, kind and tone
  // Three drafts are three ideas. What makes two drafts the same idea is their family of technique
  // (two prints, two paper crafts, two typographic sheets), far more than the engine that draws them:
  // the fast set is three.js first, with an HTML sheet beside it where the copy asks for one.
  const familyOf = (s) => s.family ?? s.engine;
  const picked = [];
  while (picked.length < count && pool.length) {
    const scoreOf = (c) => {
      const s = styles[c.id]; let v = c.score;
      for (const p of picked) {
        const q = styles[p.id];
        if (familyOf(q) === familyOf(s)) v *= 0.62;
        else if (q.engine === s.engine && engines !== 'blender') v *= s.engine === 'html' ? 0.8 : 0.92;
        if ((q.kind ?? 'object') === (s.kind ?? 'object')) v *= 0.88;
        if ((q.tone ?? 'light') === (s.tone ?? 'light')) v *= 0.8;
      }
      // one flat sheet in a set at most: the others are rendered
      if (s.engine === 'html' && picked.some((p) => styles[p.id].engine === 'html')) v *= 0.3;
      return v;
    };
    pool.sort((a, b) => scoreOf(b) - scoreOf(a));
    picked.push(pool.shift());
  }

  // ---- typography, palette and layout per draft
  // type voices, weighted by how much of the poster each topic is: a side topic's loud face must not outrank the lead topic's quiet ones
  const typeW = {};
  for (const { topic, share } of ranked) { const list = (topics[topic]?.types ?? []).filter((t) => types.includes(t)); list.forEach((t, i) => { typeW[t] = (typeW[t] ?? 0) + share * (1 - (i / (list.length + 1)) * 0.6); }); }
  // Copy that mourns is set soberly whatever else it mentions: a memorial concert is still a memorial. The
  // sober voices (topics._meta.solemn.types, best first) then lead, and nothing playful is a candidate.
  const sober = solemnTypes(content, topics)?.filter((t) => types.includes(t)) ?? null;
  if (sober?.length) { for (const t of Object.keys(typeW)) if (!sober.includes(t)) delete typeW[t]; sober.forEach((t, i) => { typeW[t] = (typeW[t] ?? 0) + 0.5 * (1 - i / (sober.length + 1)); }); }
  const typeOk = (t) => types.includes(t) && (!sober?.length || sober.includes(t));
  const typePref = Object.keys(typeW).sort((x, y) => typeW[y] - typeW[x]);
  const palDirs = ranked.flatMap(({ topic }) => topics[topic]?.palettes ?? []);
  // layouts each topic's posters tend to use, weighted like the type voices
  const layW = {};
  for (const { topic, share } of ranked) { const list = topics[topic]?.layouts ?? []; list.forEach((l, i) => { layW[l] = (layW[l] ?? 0) + share * (1 - (i / (list.length + 1)) * 0.7); }); }
  const layTop = Math.max(0.001, ...Object.values(layW));
  // what the copy asks of a layout: how much there is to set, and how long the headline is
  const plainTitle = String(content.title ?? '').replace(/[*\n]/g, ' ').trim(), hangul = /[\uac00-\ud7a3]/.test(plainTitle);
  const load = (content.meta ?? []).length + (content.body ?? []).join(' ').length / 70 + (content.cta ? 1 : 0) + (content.subtitle ? 0.5 : 0);
  const longTitle = [...plainTitle].length > (hangul ? 13 : 28);
  // The widest unit of sense has to fit one line of the headline column ("파랑곶 | 서핑 페스티벌" → "서핑 페스티벌"):
  // a column that is too narrow for it sets the whole headline small or has to cut the unit.
  const unitWidth = (u) => [...u.replace(/\*/g, '')].reduce((w, ch) => w + (/[\u1100-\uffdc]/.test(ch) ? 1 : ch === ' ' ? 0.3 : 0.55), 0);
  const widestUnit = Math.max(0, ...String(content.titleUnits || content.title || '').split(/\s*[|\n]\s*/).map(unitWidth));
  const longUnit = widestUnit > 6;
  const usedTypes = new Set(), usedLayouts = []; let darks = 0, lights = 0;
  // ---- layouts for the set: each draft takes one its style is known to carry (its default and the others
  // listed in "also"), chosen so that the set differs in structure, suits the topic and has room for this
  // copy. Drafts with the fewest options choose first, so a style that has one layout keeps it and the
  // others move round it.
  const infoOf = (l) => LAYOUT_INFO[orient][l.replace(/-mirror$/, '')];
  const famOf = (l) => infoOf(l)?.fam;
  const layoutFor = new Map();
  const wanting = picked.map((c) => {
    const style = styles[c.id], motif = pickMotif(style, c.motif, weights), m = motif ? style.motifs?.[motif] ?? {} : {};
    const styleOwn = style.layouts?.[orient]?.layout ?? Object.keys(LAYOUT_INFO[orient])[0];
    const own = m.layouts?.[orient]?.layout ?? styleOwn;
    // a motif that needs its own layout (a neon frame round centred copy) keeps to it; otherwise the style's list applies
    const also = m.layouts?.[orient]?.also ?? (own === styleOwn ? style.layouts?.[orient]?.also : null) ?? [];
    const options = [own, ...also].filter((l, k, a) => infoOf(l) && a.indexOf(l) === k);
    // the mirror image of a layout the style carries is as sound as the layout, where the style also takes copy on the right
    if (orient !== 'landscape' || options.includes('right')) for (const l of options.slice()) if (MIRRORABLE[orient].includes(l)) options.push(`${l}-mirror`);
    return { c, style, own, options };
  });
  for (const { c, style, own, options } of wanting.slice().sort((a, b) => a.options.length - b.options.length)) {
    const lScore = (l) => {
      const info = infoOf(l), base = l.replace(/-mirror$/, ''), flipped = base !== l;
      let v = 0.4 + ((layW[base] ?? 0) / layTop) * (flipped ? 0.9 : 1) + (l === own ? 0.12 : 0) + 0.3 * hash01(`${salt}|${c.id}|${l}`);
      if (usedLayouts.some((u) => u.replace(/-mirror$/, '') === base)) v *= 0.05;      // the same arrangement, or its mirror image
      v *= 0.4 ** usedLayouts.filter((u) => famOf(u) === info.fam).length;
      if (load > 6.5 && info.room < 3) v *= 0.25; else if (load > 4.5 && info.room < 2) v *= 0.35;
      if (longTitle && info.narrow) v *= 0.3;
      else if (longUnit && info.narrow && info.fam !== 'vertical') v *= 0.35;   // portrait `side`: the copy has half the sheet's width
      if (info.fam === 'vertical' && !(hangul && [...plainTitle].length <= 12 && ((weights.tradition ?? 0) + (weights.literature ?? 0) + (weights.culture ?? 0) >= 0.25))) v *= 0.05;   // 세로쓰기 is for short Korean headlines
      if (base === 'center' && l !== own) v *= 0.2;      // copy over the subject only where the style is built for it
      if (base === 'axis' && orient === 'landscape' && (style.kind ?? 'object') !== 'picture') v *= 0.2;   // a wide sheet leaves a subject only the strip between headline and bar: it comes out very small
      if (base === 'strip' && (style.kind ?? 'object') === 'picture') v *= 0.3;   // the bar of information would lie on a picture that fills the sheet
      if (base === 'side' && (style.kind ?? 'object') !== 'picture' && style.engine !== 'html') v *= 0.3;   // a compact subject beside a narrow column of copy leaves the sheet lopsided; a picture that fills its half holds it
      return v;
    };
    const pick = options.length ? options.slice().sort((x, y) => lScore(y) - lScore(x))[0] : own;
    layoutFor.set(c.id, { own, pick }); usedLayouts.push(pick);
  }
  const drafts = picked.map((c, i) => {
    const style = styles[c.id], d = { style: c.id };
    const motif = pickMotif(style, c.motif, weights); if (motif) d.motif = motif;
    const m = motif ? style.motifs?.[motif] ?? {} : {};
    // type: the topic's voices, preferring ones the style is known to suit. A theme's fit is how high the
    // topics rank it plus how well the style carries it. Every theme within reach of the best fit is a
    // sound choice, so which of them a poster gets turns on its headline and seed: the same mood does not
    // come out in the same face every time, and a lettered theme (a brush, a pen, a sign) has its turn
    // beside the plain ones. No theme is used twice in a set while another that fits is free.
    const suits = [m.type ?? style.type, ...(m.types ?? style.types ?? [])].filter(Boolean);
    const fit = (t) => (typeW[t] ?? 0) / (typeW[typePref[0]] || 1) + (suits.includes(t) ? 0.5 - Math.min(suits.indexOf(t), 6) * 0.05 : 0);
    const cands = [...new Set([...typePref, ...suits])].filter(typeOk);
    const fresh = cands.filter((t) => !usedTypes.has(t));
    const pool = fresh.length ? fresh : cands.length ? cands : types.filter((t) => typeOk(t) && !usedTypes.has(t));
    const best = Math.max(0, ...pool.map(fit)), REACH = 0.3;
    const near = pool.filter((t) => fit(t) >= best - REACH).sort((x, y) => fit(y) - fit(x) || x.localeCompare(y));
    const odds = near.map((t) => (fit(t) - (best - REACH) + 0.04) ** 1.4);   // the nearer the best fit, the likelier
    let turn = hash01(`${salt}|type|${i}`) * odds.reduce((x, y) => x + y, 0), k = 0;
    while (k < near.length - 1 && (turn -= odds[k]) > 0) k++;
    d.type = near[k] ?? (typeOk(style.type) ? style.type : null) ?? pool[0] ?? style.type ?? 'bold';
    usedTypes.add(d.type);
    // palette: the style's own palette nearest to the topic's colour directions, keeping light and dark both in the set
    const names = (m.palettes ?? Object.keys(style.palettes ?? {})).filter((n) => style.palettes?.[n]);
    if (names.length) {
      const wantDark = i > 0 && darks === 0 && lights > 0, wantLight = i > 0 && lights === 0 && darks > 0;
      const pScore = (n) => {
        const p = style.palettes[n]; let best = palDirs.length ? Math.min(...palDirs.map((q) => rgbDist(p.bg, q.bg) + 0.6 * rgbDist(p.accent ?? p.ink, q.accent ?? q.ink))) : (n === (m.palette ?? style.defaultPalette) ? 0 : 0.5);
        if (n === (m.palette ?? style.defaultPalette)) best -= 0.2;                     // the tuned default wins ties
        if (wantDark && isDark(p.bg)) best -= 0.28; if (wantLight && !isDark(p.bg)) best -= 0.28;   // a nudge: only when such a palette also suits the topic
        return best + 0.06 * hash01(`${salt}|${n}`);
      };
      d.palette = names.slice().sort((a, b) => pScore(a) - pScore(b))[0];
      if (isDark(style.palettes[d.palette].bg)) darks++; else lights++;
    }
    // layout: chosen for the whole set beforehand (see layoutFor)
    const lay = layoutFor.get(c.id);
    if (lay && lay.pick !== lay.own) d.layout = lay.pick;
    d.why = `${c.why.length ? c.why.join(' + ') : 'range'} · ${style.label ?? c.id}${motif ? ` (${motif})` : ''}`;
    return d;
  });
  // ---- a ground for one draft. A subject that can be cut out (giant numerals, a ticket, a clay still
  // life, felt fruit) may stand on a field drawn by another engine — a grainy gradient, out-of-focus
  // lights, a checkerboard. Whether a style mixes is the style's own business: it lists the grounds it
  // has been checked on ("grounds"), and only those pairings are offered. One draft per set at most, so
  // the set keeps one layered idea beside two plain ones. A playful, graphic subject always takes the
  // chance; a sober one takes it about two times in five.
  const playful = ['celebration', 'kids', 'family', 'community', 'market', 'food', 'retro', 'music', 'nightlife', 'design', 'sports', 'gaming', 'summer', 'spring'].reduce((a, t) => a + (weights[t] ?? 0), 0);
  if (playful >= 0.3 || hash01(`${salt}|mix`) < 0.4) {
    // the grounds a draft has been checked with: its motif's own list, else the style's
    const groundsOf = (d) => ((d.motif && styles[d.style].motifs?.[d.motif]?.grounds) || styles[d.style].grounds || []).filter((g) => styles[String(g).split('/')[0]]);
    const able = drafts.filter((d) => groundsOf(d).length && d.layout !== 'center' && layoutFor.get(d.style)?.pick !== 'center');
    // the 3D subject first: that pairing is the one no single engine can make
    able.sort((a, b) => (styles[b.style].engine === 'blender') - (styles[a.style].engine === 'blender'));
    const d = able[0];
    if (d) {
      const opts = groundsOf(d);
      const [gid, gmotif] = String(opts[Math.floor(hash01(`${salt}|ground|${d.style}`) * opts.length) % opts.length]).split('/');
      d.ground = gmotif ? { style: gid, motif: gmotif } : gid;
      d.why += ` on a ${styles[gid].label ?? gid}${gmotif ? ` (${gmotif})` : ''} ground`;
    }
  }
  return { topics: ranked, drafts, date };
}
