# Spec reference

The spec is one JSON file. Paths inside it (logos, images, custom scenes) are relative to the spec
file. Only `content.title` is required.

## Contents
- [Top-level fields](#top-level-fields)
- [content](#content) — copy slots, inline markup, extra elements, custom slots
- [format](#format) — presets, ratios, pixels, print
- [posters](#posters) — per-poster style, palette, layout, seed, params
- [Layouts](#layouts)
- [Palettes and fonts](#palettes-and-fonts)
- [Output and CLI](#output-and-cli)
- [report.json](#reportjson)
- [Recipes](#recipes)

## Top-level fields

| Field | Default | Meaning |
|---|---|---|
| `content` | — | The copy and other elements (below). |
| `format` | `"a3"` (A3 portrait, 297×420 mm, 300 dpi, 3508×4961 px) | Size/ratio: a string, an object, or a list of them (one sub-folder per format). Use `"2k"` (2560×1440, 16:9) when the poster is for a screen, a slide or a presentation. |
| `resolution` | `"2k"` | `"4k"` renders the screen formats that name a shape rather than a size — a ratio, `story`, `square`, `web-banner` … — at 4K class (1.5× the pixels each way). Set it only when the user asks for 4K. Explicit pixels, `"4k"` / `"fhd"` and paper sizes ignore it. |
| `bleed` | `0` | Print bleed in mm added on every side of paper formats (`3` is usual). The art runs into it; type keeps to the trimmed sheet. |
| `drafts` | `"auto"` | Array of poster objects, or use `styles`. `"auto"` reads the copy, names its topics and picks styles, motifs, type themes and palettes that suit them (see `--suggest`) — from the three.js and HTML styles, unless `blender` is set. |
| `styles` | `"auto"` | Shorthand: `["papercut","linocut","swiss"]` = posters with defaults. |
| `blender` | `false` | `true` when the user asked for Blender: `"auto"` then makes every poster a Blender style, on its own or on a ground drawn by another engine (minutes per poster). Left out, `"auto"` never picks a Blender style. Posters you list yourself are rendered as written either way. |
| `type` | style default | Typography theme for every poster (`bold`, `editorial`, `myeongjo`, … or a path to a `.css`). |
| `viewing` | from format | `screen` · `mobile` · `print` — how large supporting text must be. 1:1, 4:5 and 9:16 default to `mobile` (≈1.4× larger small type); paper presets to `print`. |
| `framed` | `false` | Draw a thin inset border and widen the margins (classical / programme look). |
| `count` | `3` | How many posters `auto` produces. |
| `palette` | style default | Applied to every poster (brand colours). Poster-level palette wins. |
| `fonts` | style default | `{ "title": "...", "body": "...", "mono": "..." }` CSS font-family for every poster. |
| `fontFaces` | — | Font files to load: `[{ "family", "src", "weight"?, "style"? }]`. |
| `layout` | style default | Layout name for every poster (see [Layouts](#layouts)). |
| `seed` | `7` | Generative variation. Same seed → same image. |
| `quality` | `"standard"` | `draft` (half-res art, fast) · `standard` · `high` (more samples). |
| `typeScale` | `1` | Multiplies all type sizes, footer included (e.g. `0.9`, `1.1`). |
| `margin` | `7.5` (print `8.5`) | Outer margin in % of the short side. Landscape sheets take 1.2× that at the sides. On A3 the print default is 25 mm, clear of the trim and of an office printer's unprintable edge. |
| `css` | — | Extra CSS appended after the theme. |
| `output.formats` | `["png"]` | Any of `png`, `jpg`, `pdf`. |
| `styleDirs` | — | Folders with custom styles. |
| `name` | from title | File name stem. |
| `lang` | auto | `"ko"`, `"en"`… (affects a few typographic rules). |

## content

```json
"content": {
  "eyebrow": "DESIGN WEEK 2026",
  "title": "Shape of\n*Tomorrow*",
  "subtitle": "Three days of talks, workshops and exhibitions",
  "body": ["First paragraph.", "- a bullet\n- another bullet"],
  "meta": [ { "label": "Date", "value": "Oct 14–16, 10:00–18:00" }, { "label": "Venue", "value": "Byeolmoru Art Hall" } ],
  "footer": ["Hosted by Byeolmoru Design Foundation", "designweek.example"],

  "cta": "지금 등록하기",
  "badge": "FREE",
  "brand": "Studio Name",
  "logo": "./logo.svg",
  "logos": ["./sponsor-a.png", "./sponsor-b.png"],
  "qr": "https://designweek.example/register",
  "qrLabel": "Register"
}
```

| Slot | Where it appears | Notes |
|---|---|---|
| `eyebrow` | above the title | short label; usually upper-case |
| `title` | the headline | auto-sized to its zone. `\|` marks the units of sense (`"파랑곶 \| *서핑* 페스티벌"`, or a list `["파랑곶", "*서핑* 페스티벌"]`): the marks never print, and the composer breaks lines only between units, shrinking the type a little before it cuts one (note `title-unit-split` when it has to). Mark titles of three words or more. Unmarked, it reads the words itself (a leading year or edition and a trailing level stand apart; a Korean title keeps its last two words together as the name). `\n` forces exact breaks |
| `subtitle` | under the title | one line or two |
| `body` | under the subtitle | string or array; lines starting with `- ` become a bullet list |
| `meta` (alias `info`) | after the subtitle, before the body | **event information**: when, where, who for, fee, sign-up, contact. Rows of `{ "label", "value" }` set as a table — label and value at one size, the label heavier; also accepts `"일시: 10.14"` strings. Under a centred headline up to three rows are centred lines and a longer table is centred as a block. Where the information has a band of its own (`corners`, `baseline`, `axis`, `strip`) two or three rows become an information bar (label over value), provided every value fits its cell on one line (see [Layouts](#layouts)); ask for plain rows with `"layout": {"layout": "…", "metaStyle": "rows"}`. Size and weights: `"vars": {"--meta-size": 2.7, "--meta-weight": 500, "--meta-label-weight": 700}` — the size is the theme's own figure, set about 14% larger on the sheet (`--k-meta`), and a further 12–30% larger when a few rows are all there is under the headline; label colour `--meta-label-color` |
| `cta` | under everything | a button-like call to action |
| `footer` | bottom edge, left | credits and small print: organiser, sponsors, a bare URL. An array becomes separate items spaced along the row (no separator glyphs); a single string is set exactly as typed, separators included. **Event information found here is lifted into `meta`** when `meta` is empty: dates and times, venues, and anything that names itself (`대상 …`, `참가비 …`, `신청 …`, `문의 …`, `Tickets …`, `RSVP …`); `"a / b / c"` and `"a \| b"` are split first. Credits (`주최 …`, `Hosted by …`), bare links and copyright stay. The run prints what was taken; `"keyFacts": false` in `content` switches this off |
| `logos`, `qr` | bottom edge, right | sponsor/partner logos at equal height; QR is generated from a URL with a 4-module quiet zone (or pass an image path). Size and colours: `"vars": {"--qr-size": 14, "--qr-ink": "#1f4d3a", "--qr-bg": "#f3ead8"}` — keep ink dark on light or scanners struggle |
| `logo` / `brand` | top edge, left | image or text wordmark |
| `badge` | top edge, right | sticker/pill: `FREE`, `D-7`, `NEW`, `SOLD OUT` |

Inline markup works in every text slot: `*emphasis*` (accent colour or italic — the style decides),
`**strong**`, and newline for a line break. Everything else is treated as plain text.

**Banner shapes** (aspect ≥ 2.4:1) hide `body` and `meta` automatically — a strip only has room for a
headline.

### Custom slots

For elements that have no built-in slot, inject HTML into a region:

```json
"slots": [
  { "slot": "main", "html": "<div class='price'>₩29,000</div>" },
  { "slot": "bottom-right", "html": "<img src='./cert.png' style='height:calc(var(--u)*4)'>" },
  { "slot": "free", "html": "<div style='position:absolute;right:8%;top:10%;font-size:calc(var(--u)*2)'>Vol. 3</div>" }
]
```

Regions: `top-left`, `top-right`, `headline` (appended to the headline group), `main` (appended to
the details — the same block as the headline in single-block layouts — so the fitter accounts for
it), `bottom-left`, `bottom-right`, `free` (absolutely positioned over the whole poster). Local
files referenced in slot HTML or `css` (`src="./x.png"`, `url(./y.svg)`) are resolved relative to the spec. Size things
in multiples of `var(--u)` (1% of the short side) so they scale with the format. Useful variables:
`--c-bg`, `--c-ink`, `--c-muted`, `--c-accent`, `--c-1…--c-5` (palette colours), `--c-paper` (the
surface the element sits on), `--m` (the margin), `--font-title`, `--font-body`,
`--font-mono`. Style custom elements with the top-level `css` field.

## format

The two formats every layout is tuned for are `"a3"` (A3 portrait, 297×420 mm at 300 dpi,
3508×4961 px — the default when no format is given) and `"2k"` (16:9 landscape, 2560×1440, for
screens, slides and presentations). `"format": ["a3", "2k"]` renders both: `<out>/a3-300dpi/…` and
`<out>/2k/…`.

Screen formats are 2K class unless the user asks for 4K. Then: `"format": "4k"` for 16:9, or
`"resolution": "4k"` (`--resolution 4k`) beside any ratio or shape preset — `"format": "story",
"resolution": "4k"` is 2160×3840 instead of 1440×2560.

String forms:

```json
"format": "a3"            // paper, portrait, 300 dpi (the default)
"format": "2k"            // 16:9 screen preset; "4k" when asked for
"format": "a2-landscape"  // paper rotated
"format": "4:5"           // ratio; long edge 2560 px (3840 with "resolution": "4k")
"format": "3000x4000"     // exact pixels
```

Object form: `{ "preset": "a3", "orientation": "landscape", "dpi": 200 }`,
`{ "ratio": "9:16", "longEdge": 2160 }`, `{ "width": 2400, "height": 3000 }`.

| Preset | Pixels |
|---|---|
| `2k`, `qhd` / `2k-portrait` / `2k-square` | 2560×1440 / 1440×2560 / 1920×1920 |
| `4k`, `uhd` / `4k-portrait` / `4k-square` | 3840×2160 / 2160×3840 / 2880×2880 |
| `fhd` / `hd` / `8k` | 1920×1080 / 1280×720 / 7680×4320 |
| `youtube-thumbnail` / `og-image` / `x-header` | 1280×720 / 1200×630 / 1500×500 |

Shape presets — 2K class by default, 4K class with `"resolution": "4k"`:

| Preset | 2K class | 4K class |
|---|---|---|
| `slide` | 2560×1440 | 3840×2160 |
| `slide-4x3` | 1920×1440 | 2880×2160 |
| `story`, `reels`, `instagram-story` | 1440×2560 | 2160×3840 |
| `instagram-post` (4:5) | 1440×1800 | 2160×2700 |
| `square` / `instagram-square` | 1920×1920 / 1440×1440 | 2880×2880 / 2160×2160 |
| `web-banner` / `ultrawide` | 2560×853 / 2560×1067 | 3840×1280 / 3840×1600 |
| a ratio (`"4:5"`) | long edge 2560 | long edge 3840 |

Paper presets:

| Preset | Pixels |
|---|---|
| `a5`…`a0`, `b5`…`b1`, `letter`, `tabloid`, `18x24in`, `24x36in` | from mm at 300 dpi — every size, large sheets included (A3 3508×4961, A2 4961×7016, A1 7016×9933, A0 9933×14043). Another density only when asked for: `{ "preset": "a1", "dpi": 150 }` |

**300 dpi everywhere.** Every raster the script writes is stamped with its density — 300 dpi, or
the `dpi` the format names — and PDF pages are sized from it. That holds for screen formats too:
their pixel size does not change, but a 2K file opens as 21.7 × 12.2 cm at 300 dpi rather than as
a 72 dpi image a metre wide. `report.json` carries it as `format.density`.

**Print.** Paper presets carry a dpi, so `viewing` becomes `print`, `bleed` applies, and PDF pages
have the physical sheet size (plus bleed). Up to A3 a Blender art layer is path-traced at every
pixel of the 300 dpi sheet. On larger sheets (A2 and up) standard quality renders it at A3's pixel
count (17.5 megapixels) and scales it — an A0 at 300 dpi is 139 megapixels, hours of path tracing —
while type, QR codes, logos and HTML art stay at full resolution and the PDF keeps them as
vectors; `quality: "high"` or a per-poster `artScale: 1` renders every pixel. The script
does not draw crop marks; colours are sRGB.

Limits: a PNG/JPG side may not exceed 16 000 px. three.js art is rendered at up to 7680 px on the
long edge and scaled beyond that (type stays sharp regardless). For large print, prefer
`"output": {"formats": ["pdf"]}` — vector type, art embedded at render resolution.

## posters

```json
"drafts": [
  { "style": "studio", "palette": "mint", "layout": "right", "seed": 3, "params": { "metal": "gold" } },
  { "style": "flux", "palette": { "colors": ["#00e5ff", "#7c4dff"], "bg": "#05060f" } },
  { "style": "monolith", "content": { "eyebrow": "Opening Exhibition" }, "typeScale": 0.95 }
]
```

| Field | Meaning |
|---|---|
| `style` | Style id (`--list-styles`) — an art technique. |
| `motif` | What the style shows (`"motif": "city"`), from the style's own list in `styles.md`. Shorthand for `"params": {"motif": …}`. A motif can bring its own default palette, type theme and layout. |
| `type` | Typography theme id, or a path to a theme `.css`. |
| `palette` | Named palette of that style, or an object, or an array of hex colours. |
| `layout` | Layout name, or an object to fine-tune (see below). |
| `seed` | Variation for this poster. |
| `params` | Scene parameters of the style (see `styles.md`). |
| `ground` | A second style drawn under the subject, which is then rendered as a cut-out with its shadow: `"ground": "pattern"`, or `{ "style": "pattern", "motif": "checker", "params": {…}, "soft": false, "palette": "…", "seed": 3 }`. See Grounds below. |
| `shadow` | With a `ground`: `false` drops the subject's cast shadow (it then floats on the ground). |
| `scene` | Path to a custom scene file (`.py` → Blender, `.js` → three.js, `*.html.js` → HTML scene); keeps the style's type and palettes. |
| `art` | Path to an image to use as the art layer instead of rendering one. |
| `content` | Per-poster overrides of content slots. |
| `fonts`, `vars`, `css`, `typeScale`, `margin`, `viewing`, `framed` | Per-poster typography tweaks. `vars` sets CSS variables, e.g. `{"--scrim": 0.8, "--title-size": 12, "--title-case": "none"}` (list in `styles.md`). |
| `matchBackground` | `true`/`false` — colour-match a rendered backdrop to the palette `bg` (on by default for Blender styles with a plain wall). |
| `samples`, `artScale`, `timeLimit` | Blender render controls (samples per pixel, art resolution factor ≤ 1, seconds). |

### Grounds

A poster is normally one style. With `ground` it is two layers: a **ground** — a field drawn by
three.js or HTML (a grainy gradient, out-of-focus lights, a checkerboard, marbling, rows of type) —
and the poster's own style on top as a **cut-out subject**: an HTML object (giant numerals, a ticket,
a stamp, a transit map), or a Blender still life rendered on a transparent film with only the
shadow it casts. This is how three.js and HTML are used together in one poster, and how a Blender
subject is set in a graphic world rather than in a studio.

```json
{ "style": "numerals", "palette": "ink", "ground": "bokeh" }
{ "style": "ticket", "ground": { "style": "pattern", "motif": "checker" } }
{ "style": "studio", "palette": "sky", "ground": "pattern" }
{ "style": "felt", "motif": "fruit", "ground": { "style": "pattern", "motif": "checker", "soft": false } }
```

The automatic choice gives a ground to one poster of a set at most, and only a pairing the subject's
style lists as checked: always on a playful, graphic subject, now and then on a sober one.

- The palette is the poster's: the ground is coloured from it. By default the ground is **tonal** —
  the page colour leaning towards the palette's colours — so it stays behind the subject and beside
  the copy. `"soft": false` prints it in the palette's colours at full strength; `"palette"` gives
  the ground colours of its own (a named palette of the ground style, or an object). The page
  colour (`bg`) is always the poster's.
- Which styles can stand on a ground, and which can be one, is in `styles.md` (and
  `--list-styles`): subjects are marked `cut-out`, grounds `ground`. Each subject lists the
  grounds it has been checked with; other pairings may work — look before you deliver.
- A ground itself adds seconds, and under an HTML subject that is all it costs. A Blender cut-out
  is a render of its own (cached separately from the style's normal render) and takes about one and
  a half times as long, up to twice for heavy materials such as `felt` and at A3 (about eighteen
  minutes there): the shadow the subject casts is traced as a second pass.
  `"shadow": false` skips that pass — the subject then floats on the ground — and is quicker than
  the normal render.
- The copy still wants a calm page: if the report says `low-contrast` or `copy-over-art`, use the
  default tonal ground, or a layout that keeps the art in its own half (`left`, `right`, `band`).

## Layouts

Fourteen arrangements in five families, each with a mirror image. A set of posters should differ in family, not only in style:
three split layouts in a row look like one poster in three colours.

| Family | Layout | Landscape | Portrait / square |
|---|---|---|---|
| split | `left`, `right` | copy beside the art | square only (portrait falls back to `top` / `bottom`) |
| | `side` | — (same as `left`) | copy in a column on the left, a little over half the sheet wide — headline hung from the top margin, information sitting on the foot margin — the subject full height beside it |
| stack | `top`, `bottom` | copy in the upper / lower left, the subject in the largest clear spot | copy above / below the art; the art takes whatever the copy leaves |
| | `band` | the subject across the top; underneath, headline on the left and information on the right, both on one base line | — (same as `bottom`) |
| spread | `strip` | headline (with any paragraph and button) top-left, the subject beside it, the information as a bar of up to five cells across the foot | — (same as `corners`) |
| | `corners` | headline bottom-left, details in the top right-hand corner, set against the right margin; subject between | headline on top, subject in the middle, details as an information bar above the footer |
| | `headline` | title across the full width, details bottom-left, subject bottom-right | same as `corners` |
| | `baseline` | title across the full width at the bottom, details top-left, subject top-right | information bar on top, subject in the middle, headline at the foot |
| centre | `center` | copy centred over the art, with a scrim | same |
| | `axis` | one centred axis: headline on top, subject in the middle, information as a centred bar | the same: headline, subject, information as a centred bar |
| vertical | `vertical` | 세로쓰기 title down the right edge, details bottom-left | same, title in the upper right |

- **Mirrored.** Any name with `-mirror` exchanges left and right: `top-mirror` puts the copy top-right
  and the subject bottom-left, `corners-mirror` puts the headline bottom-right and the details top-left. Type stays left-aligned;
  in a two-block layout the block that comes to stand on the right is set against the right margin.
- **Per format.** With several formats, a poster may name one layout for each:
  `"layout": {"landscape": "band", "portrait": "axis"}`.
- **Which layouts a style carries.** Each style lists the layouts it has been checked with in
  `style.json` → `layouts.<orientation>`: `layout` (its default) and `also`. `--list-styles` prints
  them. Automatic posters choose only among those; you can ask for any other and judge the result.
- **Two blocks.** The spread layouts, `band`, `axis`, `side` and `vertical` set the
  headline group (eyebrow, title, subtitle) and the details (information, body, CTA) in separate
  zones. Except for `strip` and `band` they hold less copy than `left` or `top`: with
  a long body or more than four rows of information, use a split or stack layout, or `strip`.
- **How the information is set.** Rows — label beside value — on the block's left edge. Under a
  centred headline (`axis`, `center`) up to three rows are centred lines, label then value, and a
  longer table is centred as a whole. Where the information has a band of its own (`corners`,
  `baseline`, `axis` in portrait; `strip`, `axis` in landscape) up to three rows — five in
  `strip` — are an information bar: cells with the label over the value, tops level, one line
  each. The bar is used only if every value fits its cell on one line; if not, a wide band takes
  two tables side by side and a narrow one the plain rows. `"metaStyle": "rows"` asks for rows
  outright.
- **Where the blocks stand.** A block that hangs from the top margin is hung by the top of its
  first line's letters and one at the foot sits on the bottom of its last line's, so copy and
  picture start on the same margin line. Two blocks always share a line: one left edge when they
  are stacked, one base line when they sit side by side.
- **Where the subject goes.** In `top`, `bottom` and the spread layouts the subject is set in
  the largest spot the measured copy leaves clear, so shorter copy means a bigger subject. A
  `copy-over-art` note means a subject on a plain ground still runs under the copy: change layout,
  or place it yourself with `focus` and `artSize`.

Fine-tuning with an object:
`"layout": { "layout": "left", "text": [0, 0, 0.6, 1], "focus": [0.78, 0.5], "artSize": 0.7, "valign": "bottom", "halign": "left" }`.
`text` is the zone of the headline group (and of all copy in single-block layouts), `aside.zone`
the zone of the details, `focus` the centre of the 3D subject and `artSize` its diameter — fractions
of the poster (artSize: of the short side). Also: `titleMaxLines`, `titleShare` (share of its zone
the headline may take), `metaStyle` (`rows` | `bar`), `metaMax` (the most rows a bar holds), `aside.pin`
(`"right"`: the details block is as wide as its content and set against the right edge of its zone),
`art` with `artMode` (`fixed` | `above-copy` | `below-copy` | `between` | `free`) and `prefer`
(where a `free` subject would like to be).

## Palettes and fonts

A palette is `{ "bg", "ink", "accent", "colors": [...], "muted"? }` in hex. `bg` is the backdrop and
the base for scrims; `ink` the copy colour; `accent` the emphasis colour (eyebrow, `*em*`, labels,
bullets); `colors` (2–5) drive the 3D materials, lights and gradients; `muted` is the body-text
colour (derived from `ink` if absent). Partial objects are merged over the
style's default, so `{"colors": ["#0052ff", "#00d4aa"]}` is enough to brand a poster. The palette is
made safe automatically: an `ink` that no longer contrasts with `bg` becomes near-black or
near-white, an `accent` under about 3.7 : 1 is darkened or lightened until it reads (the original is
kept in `report.json` as `accentOriginal`), and `muted` never drops below AA contrast. For Blender
styles with a plain wall the render is colour-matched to `bg`, so give the real brand hex — no need
to pre-compensate for lighting.

Keep the character of the style when overriding: `flux`, `prism` and `globe` want a near-black `bg`;
most others work on light or dark. `styles.md` lists each style's light and dark palettes.

Bundled fonts (all SIL OFL) — Korean: **Pretendard** (sans, 100–900), **Hahmlet** (명조, 100–900),
**Black Han Sans**, and in the extra pack **Song Myung**, **Nanum Myeongjo**, **Do Hyeon**, **Jua**,
**Bagel Fat One**, **Gaegu**, **Nanum Gothic Coding** and some thirty more (`fonts.md` lists them all). Latin: **Fraunces**, **Archivo** (width axis), **Space Grotesk**,
**JetBrains Mono**, **Instrument Serif**, **Anton**, and in the extra pack **Playfair Display**,
**Bebas Neue**, **Unbounded**, **Bricolage Grotesque**. Normally you choose a type theme rather than
fonts; to override, put a Latin face first and a Korean face after it:

```json
"fonts": { "title": "\"Anton\", \"Black Han Sans\", sans-serif", "body": "\"Pretendard\", sans-serif" }
```

Each Latin display face also exists as `"<Name> KR"` (drawn 6% larger) for headlines that mix it with
Hangul.

To use a font file of your own, declare it and then reference the family:

```json
"fontFaces": [ { "family": "Brand Sans", "src": "./fonts/BrandSans-Variable.woff2", "weight": "100 900" } ],
"fonts": { "title": "\"Brand Sans\", \"Pretendard\", sans-serif" }
```

`src` is relative to the spec (woff2, woff, ttf or otf). Keep a bundled Korean face after it in the
stack if the font has no Hangul.

A face the user hands over or names can also become a whole type theme, sized to sit with the bundled
faces: `scripts/fonts.mjs add --file <font> --base <theme>` (a file), `add --installed "<family>"`
(installed on this computer) or `add "<family>" --asked` (fetched) — see `references/fonts.md`.

## Output and CLI

```
node scripts/poster.mjs <spec.json> [options]
  --out, -o DIR        output folder (default ./poster-out)
  --styles, -s LIST    override drafts: "studio,flux,wave" or "auto"
  --format, -f VALUE   override format (default a3, A3 portrait at 300 dpi); several at once: a3,2k
  --resolution, -r R   2k (default) | 4k — size class of ratio and shape formats
  --bleed MM           print bleed for paper formats
  --quality, -q TIER   draft | standard | high
  --formats LIST       png,jpg,pdf
  --only LIST          re-render just these drafts: letters (A,B) or style ids; the others stay in
                       contact-sheet.jpg and report.json
  --seed N             override the seed
  --type ID            typography theme for every draft
  --layout NAME        layout for every draft
  --viewing MODE       screen | mobile | print
  --style-dir DIR      folder of custom styles
  --blender            the user asked for Blender: "auto" makes every draft a Blender style (same as "blender": true)
  --no-blender         behave as if Blender were missing (a Blender style named in the spec is swapped for a three.js one)
  --no-cache           ignore cached art layers
  --suggest            read the copy: print its topics, what posters on that subject do, and fitting drafts
                       (three.js and HTML; with --blender, Blender styles) — renders nothing
  --list-styles        print styles, palettes, params, type themes, layouts, presets
```

Exit code 0 when every poster rendered (warnings are printed, not fatal), 1 when a poster failed,
2 for a bad spec, 3 when Chromium/Playwright is missing.

Art layers are cached in `~/.cache/namokposter/art` (override with `POSTER_CACHE`), keyed by scene,
size, palette, seed, layout and params, so the same art is reused across output folders. A full run
removes posters of the same name left in the output folder by an earlier run with different styles.

Environment variables: `POSTER_BLENDER` (path to the Blender executable), `POSTER_BPY_PYTHON`
(a Python that can `import bpy`), `POSTER_CHROMIUM` (Chrome/Chromium executable),
`POSTER_DEVICE=cpu` (skip GPU detection), `POSTER_DEBUG=1` (stack traces).

## report.json

`skill` names the version of the skill that made the posters (`namokposter 1.0.0`; the number comes from the
`VERSION` file in the skill folder). Paths are relative to the output folder. One entry per poster: `files`, `preview`, `style`, `engine`, `type`, `palette`, `layout`, `focus`, `artSize`,
`titleFit` (title size factor chosen by the fitter), `typeScale` (global shrink applied to fit),
`bgMatch` (the per-channel correction applied to the art), `items` (each element's rectangle, font
size in px, line count, script; for the title also `breaks`, the lines it was set in, and `letterPx`, the height of its letters;
for the eyebrow `clear`, the clear space in px between it and the top of the headline's letters) and `contrast` (per element — including `title-em` and `meta-label`,
which use the accent colour — `typical` and `worst` WCAG ratio against the pixels actually behind it)
and `notes`.

Note codes: `copy-overflow`, `copy-dense`, `title-too-long`, `title-unit-split`, `outside-safe-area`, `row-crowded`,
`title-unit-split`, `low-contrast`, `copy-over-art`, `glyph-fallback`, `font-pack-missing`, `contrast-unchecked`, `no-preview`, `style-substituted`, `missing-file`, `page-log`,
`render-failed`.

## Recipes

**Minimal — title only, automatic styles**
```json
{ "content": { "title": "Open Studio Day" } }
```

**Brand colours on every poster**
```json
{ "content": { "title": "..." }, "palette": { "colors": ["#0052ff", "#00d4aa", "#ffb800"], "accent": "#0052ff" } }
```

**Portrait print poster as PNG + PDF**
```json
{ "content": { "title": "..." }, "format": "a2", "output": { "formats": ["png", "pdf"] } }
```

**Same design, three variations of one style**
```json
{ "content": { "title": "..." },
  "drafts": [ { "style": "studio", "palette": "peach", "seed": 1 }, { "style": "studio", "palette": "sky", "seed": 2, "layout": "right" }, { "style": "studio", "palette": "noir", "seed": 3 } ] }
```

**Event poster with date/place rows, CTA and QR**
```json
{ "content": { "eyebrow": "Meetup #12", "title": "Rust 솔고을 밋업", "subtitle": "저수준에서 고수준까지",
    "meta": [ {"label": "일시", "value": "12.05 (토) 14:00"}, {"label": "장소", "value": "솔고을 코워킹 라운지"} ],
    "cta": "참가 신청", "qr": "https://example.com/rsvp", "badge": "무료", "footer": "rustseoul.kr" },
  "format": "4:5" }
```
