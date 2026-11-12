# HTML scenes

An HTML scene draws the art layer with DOM and SVG inside the poster page itself, instead of
rendering an image first. Use one when the picture is typographic or graphic rather than a material
or a painting:

- it is **vector** — razor-sharp at any size and in the PDF, and it takes no render time;
- it can be **made from the copy** — the date set enormous, a ticket printed with the venue, rows
  of the headline — because it runs in the same page as the copy, after the copy has been fitted;
- it is set in the **poster's own typefaces**, so it changes voice with the type theme.

It is the wrong tool for light, depth, texture and material: that is what Blender and three.js are
for. Stock HTML styles: see the "Type and vector graphics" group in `styles.md` — `numerals`,
`calendar`, `ticket`, `stickers`, `screen` (objects) and `marquee`, `pattern` (fields). Their scene
files are the worked examples: `numerals/scene.js` is the shortest.

## Contents
- [Plugging one in](#plugging-one-in)
- [The scene function](#the-scene-function)
- [The context](#the-context)
- [Helpers (`html-lib.js`)](#helpers-html-libjs)
- [Rules](#rules)
- [Look-dev loop](#look-dev-loop)

## Plugging one in

Per poster, beside an existing HTML style (its palettes and type defaults stay):

```json
{ "style": "numerals", "scene": "./my-art.js" }
```

or with any style when the file is named `*.html.js`:

```json
{ "style": "studio", "scene": "./my-art.html.js" }
```

As a style of its own: a folder with `style.json` (`"engine": "html"`) and `scene.js`, exactly like
a three.js style (see `custom-scenes.md` → A whole new style). `"kind": "object"` if the scene
draws one thing in the space the copy leaves; `"kind": "picture"` if it covers the page. A style
that cannot work without something in the copy says so: `"requires": ["date"]` keeps the automatic
choice from picking it for a poster with no date. An object style can stand on any ground as it is
(HTML has no background to cut away); list the grounds you checked in `"grounds"`. A field style
that sits well under a subject says `"ground": true`.

## The scene function

```js
// assets/styles/<id>/scene.js
import { svg, mix, eventDate } from '/skill/assets/web/html-lib.js';

export default async function build(ctx) {
  const { W, H, unit: U, palette } = ctx;
  const box = ctx.fit(1.4);                       // a 1.4 : 1 box in the room the copy left
  const root = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  ctx.root.append(root);
  root.append(svg('rect', { x: box.x, y: box.y, width: box.w, height: box.h, rx: U * 2, fill: palette.colors[0] }));
}
```

The function may be `async`. It is called once per output: for the PNG at full pixel size and
again for the PDF at page size, so **every length must be derived from `ctx.W`, `ctx.H` or
`ctx.unit`** — never a constant number of pixels.

## The context

| Field | What it is |
|---|---|
| `ctx.root` | the art layer (`div.art-html`, the whole page, under the copy). Append to it |
| `ctx.W`, `ctx.H` | page size in px (bleed included) |
| `ctx.unit` | px per 1% of the short side — the unit for line widths, radii, small type |
| `ctx.orient`, `ctx.aspect` | `landscape` / `portrait` / `square`, and W / H |
| `ctx.palette` | `{ bg, ink, muted, accent, colors[] }` — take every colour from here |
| `ctx.params`, `ctx.motif` | the style's parameters (defaults merged with the poster's) and the motif name |
| `ctx.rng`, `ctx.seed` | seeded random numbers: `rng()`, `rng.range(a, b)`, `rng.int(a, b)`, `rng.pick(list)`, `rng.shuffle(list)` |
| `ctx.content` | the copy as plain strings: `title`, `eyebrow`, `subtitle`, `cta`, `badge`, `brand`, `body[]`, `footer[]`, `meta[] = { label, value }`, and `titleRaw` (with `*emphasis*` and line breaks) |
| `ctx.font` | the type theme's faces, resolved: `font.title`, `font.body`, `font.mono`, each `{ family, weight, style }` |
| `ctx.lang`, `ctx.tone` | `ko` / `en`; `light` / `dark` (from the background colour) |
| `ctx.fit(aspect, { fill, bleed })` | **the box for an object**: the largest box of that aspect ratio (width / height) in the free space the copy left, inside the page margins, centred on the layout's focus → `{ x, y, w, h, cx, cy }` px. `fill` (default 0.92) scales it |
| `ctx.field({ gap })` | **the area for a field** (a pattern, rows of type): the largest rectangle no copy touches → `{ x, y, w, h, edges }` px; `edges.left/right/top/bottom` say which page edges it reaches |
| `ctx.artRect`, `ctx.focus`, `ctx.artSize` | the layout's raw answer, as fractions of the page: free rectangle, focus point, subject size |
| `ctx.quiet` | rectangles that carry type (`[x0, y0, x1, y1]` fractions): copy blocks first, then footer and header, then the box of each piece of copy as laid out (a type theme may draw a rule past the ink). Nothing busy may run under them |
| `ctx.role` | `"art"`, or `"ground"` when the scene is drawn under another style's cut-out subject (`spec.md` → Grounds). As a ground the palette it receives is already tonal; keep the geometry calm |
| `ctx.safe` | the area inside the margins, px |
| `ctx.px(rect)` | a fraction rectangle → `{ x, y, w, h }` px |
| `ctx.note(msg)` | add a warning to the render report ("no date in the copy — showing the year") |

## Helpers (`html-lib.js`)

```js
import { el, svg, css, pathOf, ring, mix, alpha, contrast, readableOn, standOff, luminance,
         fitText, measureInk, inkText, label, eventDate, keyNumber, keywords,
         MONTH_NAMES, DAY_NAMES, daysIn, isKorean, makeRng } from '/skill/assets/web/html-lib.js';
```

- **DOM** — `el('div', { class, style: {…}, text }, [children])`; `svg('circle', { cx, cy, r, fill })`;
  `css(ctx.root, text)` adds a stylesheet (scope every rule under `.art-html` and prefix class
  names with the style id); `pathOf(points, { closed, smooth })` → SVG path data; `ring(cx, cy, r, n,
  { inner })` → points of a polygon, or of a star / scalloped seal.
- **Colour** — `mix(a, b, t)`, `alpha(hex, a)`, `contrast(a, b)`, `luminance(hex)`,
  `readableOn(bg, [candidates])` (lettering on a coloured shape), `standOff(hex, bg, towards, min)`
  (pull a colour away from the page until it shows).
- **Lettering by its ink** — glyphs leave air inside their line box, so large type is placed by
  measurement: `await inkText(parent, text, box, ctx.font.title, { fill, align, valign, tracking })`
  makes an SVG `<text>` whose ink fills the box; `await measureInk(text, font)` gives the ink's
  extent in ems; `label(parent, text, x, y, font, size, { anchor, tracking, caps })` sets a small
  caption; `fitText(node, maxW, maxH)` shrinks an HTML node's font to fit.
- **Reading the copy** — `eventDate(ctx.content)` → `{ year, month, day, weekday, weekdayStated, end,
  time, yearKnown, text }` or `null` (it understands `2026. 11. 15.(주일)`, `11월 15일 오후 7시`,
  `10.14 (수) – 11.03 (화)`, `Nov 15, 2026 · 7pm`, `Sat 21 March 2026`); `keyNumber(content)` → an
  edition, count or year to show when there is no date; `keywords(content)` → short words that can
  stand alone on a label; `MONTH_NAMES.en / enShort / ko`, `DAY_NAMES.en / enShort / ko / koShort`,
  `daysIn(year, month)`.

## Rules

- **Stay out from under the copy.** An object keeps to `ctx.fit()`; a field keeps to `ctx.field()`.
  The report flags `copy-over-art` and `low-contrast` otherwise. Never put a plain panel under the
  copy to make it readable — move the art instead.
- **Everything scales** from `W`, `H`, `unit`. Check both 16:9 and A3 portrait.
- **Colours from the palette**, so brand colours and palette overrides work. Lettering on a
  coloured shape: `readableOn(shape, [palette.bg, palette.ink])`.
- **The poster's faces**: `ctx.font.title` for display lettering, `ctx.font.body` for captions,
  `ctx.font.mono` for codes. Don't name a font family yourself; no web fonts, no network, no images
  from outside. No emoji (they depend on the machine's fonts) — draw the icon in SVG.
- **Small lettering inside the art is still read**: nothing under `1.5 × unit`.
- **A date set large is month and day together.** When numerals are the picture, show `11.15`, `11`
  over `15`, or `11월` over `15일` at one scale — never the day alone: a lone "15" is not a date, and
  the reader has to hunt for the month. The stock styles follow this (`numerals`, the tear-off
  calendar, the dialog in `screen`, the seal in `stickers`).
- **Degrade, don't fail.** No date in the copy → show something sensible and `ctx.note()` it.
- **Seeded**: every random choice through `ctx.rng`.
- **Vector first.** SVG shapes, text and CSS print as vectors. Filters, blurs, masks and
  `mix-blend-mode` are rasterised in the PDF and cost quality: use them sparingly (a soft shadow
  under a ticket is fine).
- **Motifs that are not allowed**: rays radiating from a disc or from a point on the horizon read as
  the Rising Sun flag (욱일기). No sunbursts, no ray fans — also not as a seal, a badge or a
  background. Scalloped edges, stars, checkerboards, wavy stripes and dots are fine.

## Look-dev loop

HTML scenes render in a second or two, so iterate on the real thing:

```bash
node SKILL_DIR/scripts/poster.mjs test.json --out try --format 2k,a3
```

Use copy with a date, copy without one, a long Korean headline and a short English one; try three
or four layouts (`left`, `band`, `corners`, `axis`; portrait `top`, `bottom`, `side`). Look at the
contact sheets, then record the layouts that work in the style's `layouts.<orientation>`
(`layout` = default, `also` = others checked).
