// Reading the copy: the event's date, a number worth showing large, words that can stand alone.
// Pure functions with no DOM — used by HTML scenes in the page (through html-lib.js) and by the
// orchestrator in Node (to know whether a poster has a date before choosing a style made from one).
const MONTHS_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'], DAYS_EN = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const MONTH_NAMES = { en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'], enShort: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'], ko: Array.from({ length: 12 }, (_, i) => `${i + 1}월`) };
export const DAY_NAMES = { en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], enShort: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'], ko: DAYS_KO.map((d) => `${d}요일`), koShort: DAYS_KO };
const okDate = (m, d) => m >= 1 && m <= 12 && d >= 1 && d <= 31;
const weekdayOf = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();
export const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

function datesIn(text, loose = false) {
  const s = String(text ?? ''), out = [];
  const push = (index, len, y, m, d, endDay = null) => { if (okDate(m, d) && !out.some((o) => index < o.index + o.len && o.index < index + len)) out.push({ index, len, year: y || null, month: m, day: d, endDay }); };
  let m;
  // 2026. 11. 15. · 2026-11-15 · 2026/11/15 · 2026년 11월 15일
  for (const re = /(20\d{2})\s*(?:[.\-/]|년)\s*(\d{1,2})\s*(?:[.\-/]|월)\s*(\d{1,2})(?!\d)/g; (m = re.exec(s));) push(m.index, m[0].length, +m[1], +m[2], +m[3]);
  // 11월 15일
  for (const re = /(\d{1,2})\s*월\s*(\d{1,2})\s*일/g; (m = re.exec(s));) push(m.index, m[0].length, null, +m[1], +m[2]);
  // November 15, 2026 · Nov 15 · Mar 3–5, 2026 · 15 November 2026
  const mon = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  const mi = (name) => MONTHS_EN.findIndex((x) => x.startsWith(name.toLowerCase().slice(0, 3))) + 1;
  for (const re = new RegExp(`(?<!\\d)(\\d{1,2})(?:st|nd|rd|th)?\\s+${mon}\\b\\.?(?:,?\\s*(20\\d{2}))?`, 'gi'); (m = re.exec(s));) push(m.index, m[0].length, m[3] ? +m[3] : null, mi(m[2]), +m[1]);
  for (const re = new RegExp(`\\b${mon}\\.?\\s+(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?(?:\\s*[–-]\\s*(\\d{1,2})(?!\\d))?(?:,?\\s*(20\\d{2}))?`, 'gi'); (m = re.exec(s));) push(m.index, m[0].length, m[4] ? +m[4] : null, mi(m[1]), +m[2], m[3] ? +m[3] : null);
  // 11.15 · 11/15 — not a time (10:30), a decimal with more digits, or part of a longer number. Outside a
  // row of dates a bare pair of numbers is only a date when a weekday follows it: "5.5(화)", "11/15 Sat".
  const wd = '\\s*(?:[(（]\\s*)?(?:주일|[일월화수목금토](?:요일|\\s*[)）])|sun|mon|tue|wed|thu|fri|sat)';
  for (const re = new RegExp(`(?<![\\d.:/])(\\d{1,2})\\s*[./]\\s*(\\d{1,2})(?![\\d:]|\\s*[./]\\s*\\d)${loose ? '' : `(?=${wd})`}`, 'gi'); (m = re.exec(s));) push(m.index, m[0].length, null, +m[1], +m[2]);
  return out.sort((a, b) => a.index - b.index);
}

/**
 * The event's date, read from the copy: the information rows first (a row labelled 일시 / 날짜 / date /
 * when before the others), then eyebrow, subtitle, title, footer.
 * → { year, month, day, weekday (0 = Sunday), weekdayStated (the weekday the copy writes, or null),
 *     end: { year, month, day } | null, time: "19:30" | null, yearKnown, text } or null when the copy
 *     names no date.
 */
export function eventDate(content, now = new Date()) {
  const c = content || {}, meta = c.meta || [];
  const dated = (r) => /일시|날짜|기간|일정|언제|date|when|day/i.test(r.label || '');
  // [text, loose]: in a row of dates (or a row with no label) "11.15" is a date; elsewhere it must say so
  const sources = [...meta.filter(dated).map((r) => [r.value, true]), ...meta.filter((r) => !dated(r)).map((r) => [r.value, !r.label]),
    ...[c.eyebrow, c.subtitle, c.title, ...(c.footer || []), ...(c.body || [])].map((t) => [t, false])].filter(([t]) => t).map(([t, l]) => [String(t), l]);
  const everything = sources.map(([t]) => t).join(' · ');
  for (const [text, loose] of sources) {
    const found = datesIn(text, loose);
    if (!found.length) continue;
    const d = found[0], rest = text.slice(d.index + d.len);
    let year = d.year, yearKnown = !!year;
    if (!year) { const y = everything.match(/(?<!\d)(20\d{2})(?!\d)/); if (y) { year = +y[1]; yearKnown = true; } }
    // a weekday written beside the date: (금), 금요일, Fri
    let weekday = null;
    const near = text.slice(d.index, d.index + d.len + 14);
    const ko = near.match(/[(（\s]\s*(주일|[일월화수목금토])\s*(?:요일|[)）]|$)/), en = near.match(/\b(sun|mon|tue|wed|thu|fri|sat)/i);
    if (ko) weekday = ko[1] === '주일' ? 0 : DAYS_KO.indexOf(ko[1]); else if (en) weekday = DAYS_EN.indexOf(en[1].toLowerCase());
    if (!year) {
      // no year in the copy: the nearest year in which the date falls on the weekday given, else this year
      const y0 = now.getFullYear();
      year = weekday == null ? y0 : ([0, 1, -1, 2, -2, 3].map((k) => y0 + k).find((y) => weekdayOf(y, d.month, d.day) === weekday) ?? y0);
    }
    const weekdayStated = weekday;                 // as written in the copy (null when it names none); may disagree with the date
    weekday = weekdayOf(year, d.month, d.day);
    // a range: the next date after a dash, tilde or "부터"
    let end = null;
    const nx = found[1];
    if (nx && /^[\s\S]{0,18}?(?:[–—~-]|부터|to\b|until\b)/.test(text.slice(d.index + d.len, nx.index + 1))) end = { year: nx.year || year, month: nx.month, day: nx.day };
    if (!end && d.endDay && d.endDay > d.day) end = { year, month: d.month, day: d.endDay };
    if (!end) { const dd = rest.match(/^\s*(?:\([^)]{1,4}\))?\s*[–—~-]\s*(\d{1,2})\s*(?:일|\(|$|\s)/); if (dd && +dd[1] > d.day && +dd[1] <= 31) end = { year, month: d.month, day: +dd[1] }; }
    let time = null;
    const t = text.match(/(?<!\d)(\d{1,2}):(\d{2})(?!\d)/), tk = text.match(/(오전|오후|낮|저녁|밤)?\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분|\s*반)?/), te = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
    if (t) time = `${t[1].padStart(2, '0')}:${t[2]}`;
    else if (tk) { let h = +tk[2]; if (/오후|저녁|밤/.test(tk[1] || '') && h < 12) h += 12; time = `${String(h).padStart(2, '0')}:${tk[3] ? tk[3].padStart(2, '0') : /반/.test(tk[0]) ? '30' : '00'}`; }
    else if (te) { let h = +te[1] % 12; if (/pm/i.test(te[3])) h += 12; time = `${String(h).padStart(2, '0')}:${te[2] || '00'}`; }
    return { year, month: d.month, day: d.day, weekday, weekdayStated, end, time, yearKnown, text: text.slice(d.index, d.index + d.len) };
  }
  return null;
}

/** The first number in the copy worth showing large when there is no date: an edition, a count, a year. */
export function keyNumber(content) {
  const c = content || {};
  for (const text of [c.eyebrow, c.title, c.subtitle, ...(c.meta || []).map((r) => r.value)].filter(Boolean)) {
    const m = String(text).match(/(?:vol\.?|no\.?|제|#)\s*(\d{1,3})|(\d{1,3})\s*(?:회|주년|th|st|nd|rd|기|번째)|(?<!\d)(20\d{2}|\d{1,3})(?!\d)/i);
    if (m) return m[1] || m[2] || m[3];
  }
  return null;
}

/** Short words from the copy that can stand alone on a label, a sticker or a ticket. */
export function keywords(content, max = 6) {
  const c = content || {}, out = [];
  const add = (w) => { w = String(w || '').replace(/\*+/g, '').trim(); if (w && w.length <= 14 && !out.includes(w)) out.push(w); };
  for (const r of c.meta || []) if (/무료|free|선착순|마감|sold|입장|rsvp/i.test(r.value)) add(r.value.match(/무료|free|선착순|마감|입장|rsvp/i)[0]);
  if (c.badge) add(c.badge);
  if (c.cta) add(c.cta);
  if (c.eyebrow) for (const w of String(c.eyebrow).split(/[·|/,–—-]+|\s{2,}/)) add(w);
  if (c.brand) add(c.brand);
  for (const w of String(c.title || '').replace(/\n/g, ' ').split(/\s+/)) add(w);
  return out.slice(0, max);
}

export const isKorean = (s) => /[가-힣]/.test(String(s ?? ''));
