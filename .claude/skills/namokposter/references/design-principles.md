# Design principles behind the presets

Why the layouts, sizes and Korean type settings are what they are — and what to hold on to when you
override them. The numbers come from a survey of poster-design guidance, design-studio case studies
and Korean typography sources (listed at the end), and from a second survey that measured fifty-one
posters directly: Canva's event, concert and festival templates (English and Korean), Pentagram's
posters for the Public Theater, Studio Dumbar's for Amsterdam Sinfonietta, Workroom, Sulki & Min,
Everyday Practice, the Sejong Center, Seoul Arts Center and the National Theater of Korea, and
Swiss, German and Dutch posters on typographicposters.com. Where a source gave no number, the value
is this skill's own synthesis and is marked *(preset)*.

## Contents
- [Hierarchy and size](#hierarchy-and-size)
- [Margins, spacing, alignment](#margins-spacing-alignment)
- [Composition archetypes → layouts](#composition-archetypes--layouts)
- [Korean typography](#korean-typography)
- [Mixing Korean and Latin](#mixing-korean-and-latin)
- [Colour and contrast](#colour-and-contrast)
- [What makes a poster look amateur](#what-makes-a-poster-look-amateur)
- [Sources](#sources)

## Hierarchy and size

- **Five levels, in reading order.** Eyebrow (a small label) → headline (the hook) → sub-headline
  (one line of context) → event information (when, where, who for, fee, sign-up) → paragraph and
  footer. The presets run headline ≈ 11–13% of the short side, sub-headline ≈ 3.7%, information
  ≈ 3.1–3.5%, eyebrow ≈ 2.6%, paragraph ≈ 2%, footer ≈ 2%. A theme gives each line its own size;
  the steps between the lines are set in one place (`--k-subtitle`, `--k-meta`, `--k-eyebrow`,
  `--k-body`, `--k-footer` in `poster.css`), so the scale stays in balance across themes. The
  eyebrow and the footer are the smallest lines on the sheet and still have to be read from across
  a room: whatever a theme sets, the eyebrow is never under 2.6% and the footer never under 2%
  (`--eyebrow-floor`, `--footer-floor`).
- **Headline to information about 4 : 1.** On posters by studios and venues the date and place run
  from a third of the headline's size up to its full size, and Canva's templates set them at 3–4.5%
  of the short side. At 5.5 : 1 three rows of information read as a caption under the title; so the
  rows are set at 3.1%, half a size up (3.5%) when three or four rows are all there is under the
  headline, and a size up (4%) when there are one or two.
- **A headline grows to 1.16 times its theme's size, no further** (`--title-fit-max`; the loud
  display themes allow 1.25–1.34). A short headline that was let grow by a third filled the sheet on
  one poster and stood at half that size in the narrow column of another. Within one layout family
  the same copy now sets at about the same size.
- **Of two arrangements at the same size, the subject decides.** With the cap in place a headline
  often sets at the same size on two lines or on three. Where the subject stands above or below the
  copy each line more is height taken from it, so the arrangement with fewer lines wins; where it
  stands beside the copy a narrower headline leaves it more width, and the taller stack may win.
- **A headline is not let go small while its block has room to grow.** In a block that holds
  everything (`top`, `bottom`, `left`, `right`) the headline takes what the other lines leave; where
  that would hold it under four fifths of the theme's size, the block is given more height first.
- **Event information is body copy, not small print.** It is what the poster is for, so it is set
  as a table directly under the headline group, at nearly sub-headline size. Inside the table the
  label and its value are the same size — the label heavier, the value regular — so neither looks
  like a caption to the other; a tiny label beside a large value reads as unbalanced.
- **The footer carries credits only**: organiser, sponsors, a bare URL, copyright. Dates and venues
  never go there.
- **Type-led posters** (`brutal`, `condensed`, the `headline` layout) let the headline grow to
  15–18% of the short side; the information keeps its size.
- **Details never below ~1.5% of the short side** on a poster seen full-screen or in print (about
  19–21 px at 2K and 28–32 px at 4K, the floor suggested for Hangul). Posts seen on a phone need about 1.4× that — the
  `mobile` viewing profile does this automatically for 1:1, 4:5 and 9:16.
- **Copy budget: about 50–75 readable words** (fewer in Korean). More than that and every level
  shrinks; the fitter will report `copy-dense`.
- **Two typefaces at most** — one display face plus one text face, or a single family in two
  weights. Every type theme follows this; adding a third through `fonts` usually hurts.
- **All-caps for one to four words only.** Themes upper-case eyebrows, and a few upper-case the
  title; switch that off (`--title-case: none`) for long Latin titles.

## Margins, spacing, alignment

- **Outer margin ≈ 7.5% of the short side** on screens, **8.5% in print** (25 mm on A3, which also
  clears the unprintable edge of office printers and any trim error); wide sheets take 1.2× that at
  the sides. Workable range 6–10%; airy themes (`luxe`) go to 9%. Tight margins are the quickest
  way to make a poster look cheap — when copy is long, cut copy, not margin.
- **Proximity.** Related lines sit close (eyebrow→title, title→subtitle); groups sit apart by two to
  three body lines; nothing is spaced equally all the way down. The `--gap-*` variables encode this.
- **Copy and picture keep a clear space of 6% of the short side between them** (18 mm on A3) —
  more than any gap inside the copy block, a little less than the page margin. Inside the block the
  gaps grow with the distance in meaning (line → group → block); the space to the picture is the
  next step up, so the picture never reads as attached to the last row of information, while copy
  and picture still read as one sheet. It holds whichever way the picture is made: a framed
  picture or a subject starts that far below (or beside) the copy, and a picture that fills the
  sheet — a field of patches, lines or lights — keeps the same band round the copy calm. The
  picture's rectangle is rounded away from the copy, never towards it.
- **A subject is beside the copy or the copy is on the picture — never in between.** A subject on
  plain ground that just touches the end of the headline reads as a mistake. The answer is another
  layout, not a smaller subject and not a headline laid half over it: the renderer measures a band
  round each block of copy, changes an automatically chosen layout to the style's own when the
  subject reaches into it, and reports a layout the spec asked for (`subject-touches-copy`).
- **The sheet balances left and right.** A subject that is compact — a still life, a model, a
  single object — sits on the sheet's centre line with the copy above and below it (`top`, `bottom`,
  `corners`, `axis`, `baseline` in portrait), or fills one half of a wide sheet with the copy in the
  other (`left`, `right`). It is not pushed to one side of a tall sheet with the information set
  off to the other: that arrangement (the withdrawn `diagonal`) left the subject hanging off-centre
  and the headline crowded. Portrait `side` is for a subject as tall as the sheet — a stem, a strip
  of collage, a column of numerals; the automatic choice seldom gives it to a compact one.
- **One axis.** On a left-aligned sheet the eyebrow, headline, information rows and footer share
  the margin line; large headlines are optically shifted so their ink — not their side bearing —
  sits on that line. On a centred sheet (`axis`, `center`) every line is centred, the footer and
  the information included: up to three rows are set as centred lines (label, then value) or as a
  centred bar of cells, and only a longer table keeps its columns and is centred as a whole. A
  left-aligned table under a centred headline hangs off to one side.
- **Copy stands on the margins by its ink.** A line box is taller than its letters — at headline
  size some 2% of the short side above and below — so a headline hung from the top margin by its
  box sits visibly lower than a picture that starts on the same margin, and a headline at the foot
  floats above it. The composer measures where the letters begin and end (`inkRect` in
  `compose.js`): a block that hangs from the top is hung by the top of its first line's letters,
  and one that sits at the foot sits on the bottom of its last line's. A part with a box of its
  own — a chip, a ruled row, a bar, a button — ends where its box does.
- **Gaps round the headline are measured from its ink too.** Headline → information is nearly two
  rows of information (`--gap-meta`, 5.4% of the short side), rows 0.5 em apart. Measured from the
  line box, the same settings gave a different gap for Hangul, for capitals and for every leading.
- **The eyebrow stands clear of the headline.** A small label set one of its own lines above
  letters five times its size reads as stuck to them, and the heavier the headline the closer it
  looks. From where the eyebrow ends — the foot of its letters, or of its own chip, box or rule —
  to the top of the headline's letters there is 0.42 of the height of those letters, so a larger
  headline gets more air, and never less than 4% of the short side (12 mm on A3) nor more than
  5.2% (`--eyebrow-clear`, `--eyebrow-clear-min`, `--eyebrow-clear-max`; `opticalGaps` in
  `compose.js`). A theme's own `--gap-eyebrow` holds wherever it is the wider one, as in the airy
  serif themes. The space stays smaller than the one between headline and information, so the
  label still belongs to the headline. `report.json` gives the space as set
  (`items.eyebrow.clear`, in px).
- **Two blocks share a line.** Where headline and information are set apart, they are stacked on
  one left edge — the headline hung from the top margin, the information sitting on the foot
  margin, or the other way round (`corners`, `baseline`, `side` in portrait; `headline`,
  `baseline`, `strip` in landscape) — or they sit side by side on one base line, the headline on
  the left margin and the information on a column line five eighths across (`band`; there the rows
  keep the standard size and are set closer, so the block is no taller than the headline's own
  line and stays clear of the subject that runs the width of the sheet above it). `corners` in
  landscape puts the information in the top right-hand corner, set against the right margin: a
  block that ends short of the margin and starts at no line the sheet has reads as a stray caption.
  In a mirrored layout the block that comes to stand on the right is set against the right margin
  in the same way.
- **Line length** 45–75 characters for Latin paragraphs, 25–35 em for Korean (`--body-measure`).
- **Leading** 0.9–1.05 for Latin display, 1.3–1.45 for Latin body; Korean needs about 1.2× more
  (see below).
- **Information belongs in a structure**, not a paragraph: label–value rows (`meta`), an information
  bar, a single footer line. Sponsor logos share one row at equal height; a QR code is at least
  2 cm in print with a quiet zone of 4 modules.
- **An information bar holds only what fits it.** Where the information has a band of its own
  (`corners`, `baseline` and `axis` in portrait; `strip` and `axis` in landscape), up to three rows
  — five in `strip` — are set as cells: label over value, the tops level, one line each. A column is
  as wide as its content at least and shares out what is left of the measure, so three short cells
  stand on thirds and a long date takes the room a short "무료" leaves. If a value would break, the
  bar is not used: in a wide band the rows become two tables side by side, otherwise the plain rows
  (or centred lines). A bar with one cell on two lines and the next on one looks untidy at any size.
- **Little copy, larger information.** A poster with only a headline and a few rows of information
  (no subtitle, paragraph or button) sets those rows larger — by 30% for one or two rows, by 12% for
  three or four. They are the only other thing on the sheet, and at the standard size they read as
  a caption. Cells of a bar are two lines tall already and keep the standard size, and so do rows
  that stand beside the headline (`band`).
- **A value stays on one line where a small change allows it.** A date and its time read as one
  thing, and so does the name of a place. Where a row would break, the composer tries in order: the
  standard size instead of the larger size of sparse information; for details that stand beside the
  headline (`band`), the width the headline's lines leave free; one size down, then one more (0.88
  of the standard, about 2.7% of the short side). The first arrangement with no broken value is
  kept, or else the one with the fewest. A value that still breaks is too long for that column:
  shorten it or choose a layout with a wider block.
- **White space is a feature.** Remove 10–20% of the content before shrinking type.

## Composition archetypes → layouts

| Archetype seen in studio and template work | Layout here | Use it for |
|---|---|---|
| Split image / text | `left`, `right` (landscape), `top`, `bottom`, `side` (portrait) | the plain answer; conferences, launches |
| Image band over a text grid | `band` | exhibitions, film, architecture — the picture leads, the text hangs under it in columns |
| Centred stack | `center` | ceremonies, invitations, formal notices — calm but static |
| One centred axis: title, object, information | `axis` | galas, concerts, weddings, tradition — formal and symmetrical |
| Headline over an information strip | `strip` | conferences, programmes, notices — the facts as a bar of cells across the foot, as on a ticket |
| Four-corner anchored information around a central object | `corners` | exhibitions, fairs, editorial; in portrait it adds an information bar |
| Headline edge to edge, details in columns below | `headline` | type-led cultural posters, Swiss-style work |
| Headline as a base line across the foot | `baseline` | fashion, film, design — the picture floats above a heavy title |
| Vertical title down one edge | `vertical` | Korean / East Asian literature, tradition, exhibitions |
| Framed / bordered | any layout + `"framed": true` | classical, luxury, festival programmes |

A set of posters should come from different rows of this table. Mirroring (`-mirror`) changes the
side the eye enters from, which is enough to make a second poster for the same series, but not a
second concept.

Asymmetric arrangements read as more dynamic than centred ones; reach for `center` only when
calm is the point.

## Korean typography

These rules are built into every type theme (`--*-ko` variables) and the headline composer.

| | Hangul | Latin, for comparison |
|---|---|---|
| Headline leading | 1.12–1.3 (two or more lines ≥ 1.2) | 0.9–1.05 |
| Headline tracking | −0.02 to −0.035 em; ultra-heavy single-weight faces 0 to −0.02 em | −0.01 to −0.045 em |
| Sub-headline | leading 1.3–1.45, tracking −0.01 to −0.03 em | 1.3–1.4 |
| Body | leading 1.6–1.8 (never < 1.5), tracking 0 to −0.02 em, weight 400–500 | 1.5–1.65 |
| Footer / caption | leading ≈ 1.45, tracking 0 to +0.025 em | — |
| Wide-set label | +0.1 to +0.25 em, one line, ≤ 10 syllables | caps + 0.12–0.4 em |

- **Break at word (어절) boundaries, never inside a word** — `word-break: keep-all`. A headline is
  never split mid-word; it shrinks instead.
- **Headline breaks are chosen, not left to the browser.** The composer tries every arrangement and
  keeps the one that sets largest while preferring a break after a comma or other pause, keeping
  `12월 3일` or `10:00 18:00` together, never stranding a one- or two-syllable word on the last line,
  and keeping emphasised words on one line. Write `\n` in the title to decide yourself.
- **Break a headline between units of sense, not between arbitrary words.** "파랑곶 서핑 / 페스티벌"
  ties the place to the sport and strands the event; "2027 봄 웨딩 / 박람회" does the same to a fair.
  Write `|` between the units a reader takes in one at a time (`파랑곶 | *서핑* 페스티벌`,
  `2027 | 봄 *웨딩* 박람회`, `*보태니컬* 아트 | 기초반`); the marks never print. The name of the thing
  (what kind of event it is, with the word that says which) is one unit; the year, edition, place,
  host, season or audience in front, and the level, round or year behind, stand apart. The composer
  breaks only between units and sets the type somewhat smaller before it cuts one, then reports
  `title-unit-split`. Without marks it reads the words itself: a leading year or edition and a
  trailing level are set apart, and a Korean title keeps its last two words together.
- **No italics, no faux bold.** Hangul has no italic; slanted or synthesised-bold Korean looks
  broken. Themes emphasise with colour or weight, and `font-synthesis` is off. For titles of works
  use 〈 〉 or 「 」 rather than italics.
- **Upper-case does nothing to Hangul.** A Latin "small caps" label becomes a modestly letter-spaced
  Korean label in the text face; very wide tracking is kept for short labels only.
- **Display faces often hold only the 2,350 common syllables.** Rare syllables fall back to another
  face mid-word; the report flags it (`glyph-fallback`) so you can reword or pick a theme with a
  full set (`bold`, `friendly`, `swiss`, `elegant`, `editorial`).
- **Vertical setting (세로쓰기)** runs top to bottom, columns right to left; keep it to one to three
  short title columns. One- and two-digit numbers stand upright side by side; longer numbers and
  Latin words lie on their side.
- **Punctuation.** Horizontal Korean uses Latin-shaped `, .` and curly quotes. Use a middle dot with
  spaces in lists (`별모루 · 솔고을`), `–` or `~` without spaces in ranges (`10.14–11.03`).

## Mixing Korean and Latin

- At equal size **Hangul looks 4–8% larger than Latin** (it fills ~90% of the em; Latin capitals
  reach ~70%). When a theme pairs a Latin display face with a Hangul one, mixed headlines use a
  `"<Latin> KR"` alias of the same font drawn 6% larger, so `2026 별모루` or `Rust 밋업` sits level.
- **Digits and Latin letters come from the Latin face** in paired themes (the Latin font is first in
  the stack); the Hangul face supplies everything else. Faces designed as one family — Pretendard,
  Hahmlet — use their own Latin.
- **Mono and caps-only label faces have no Hangul.** A Korean eyebrow, badge or footer in such a
  theme switches to the theme's Korean label face instead of falling back to a system font.
- Dates and prices use lining, tabular figures.

## Colour and contrast

- **Two or three colours plus neutrals.** A palette is `bg`, `ink`, `accent` and 2–5 `colors` for
  the 3D materials; keep brand palettes to that.
- **Contrast floors:** 4.5 : 1 for small text, 3 : 1 for large text and bold labels. The renderer
  measures the real pixels behind each element — including emphasised words and labels in the accent
  colour — and adjusts `accent` and `muted` automatically when a custom palette would fail.
- **A rendered backdrop is never exactly the hex you asked for** (lights tint it). Styles with a
  plain wall or floor are colour-matched to `bg` after rendering, so brand colours land.

## What makes a poster look amateur

| Fault | Fix here |
|---|---|
| Flat hierarchy — everything medium-sized | shorten copy until the fitter stops scaling (`fit=100%`) |
| A huge title over tiny details | leave the size steps alone (`--k-meta`, `--title-fit-max`); headline to information stays near 4 : 1 |
| Blocks that float between the margins | keep `valign` top or bottom; the composer hangs and seats blocks by their ink |
| Thin or uneven margins | leave `margin` alone; never position custom elements by eye — use `var(--m)` |
| Equal gaps everywhere | keep groups: headline group, details group, footer |
| Too many fonts or effects | one type theme per poster; no extra `fonts` unless it is the brand face |
| Text over a busy image | choose a layout that separates them, or `center` with its scrim |
| Centred everything | prefer left-aligned split or `corners` |
| Body copy doing the work of a list | move date/place/price into `meta` |
| Latin-first template with Korean poured in | use the `-ko` settings (automatic) and a Korean-capable theme |

## Sources

Layout and hierarchy: the fifty-one posters measured directly (named at the top of this file) ·
4over4 poster typography guide · Adobe Express — poster layout, common design
mistakes, 2026 trends · Vistaprint — poster layout, poster ideas · madegooddesigns — poster
principles, grid systems, bleed and safe area · Easil poster guide · NN/g — proximity ·
Müller-Brockmann grid notes (neugraphic) · Typeroom on Paula Scher's Public Theater posters ·
It's Nice That on Sulki & Min, studio fnt, Jaemin Lee · Walker Art on Sulki & Min · Letterform
Archive on contemporary Korean design · 월간 디자인 (design.co.kr) · QR size guidance
(qr-code-generator.com) · a Korean venue's promotional-material guide (GS칼텍스 예울마루).

Korean typography: W3C *Requirements for Hangul Text Layout and Typography* (klreq) and the Korean
gap analysis · Google Fonts Knowledge — CJK typesetting rules · Chrome developer notes on
`text-wrap` and i18n line breaking · KRDS, Toss TDS, Daangn SEED and Wanted Montage type tokens ·
Apple Korea production CSS · 타이포그래피 야학 (brunch.co.kr/@typecode) · Kim Byungjo, "Technical
Problems in Multilingual Typography" and Sim Wujin on punctuation (한국타이포그라피학회) ·
Pretendard, SUIT, Spoqa Han Sans, LINE Seed documentation.
