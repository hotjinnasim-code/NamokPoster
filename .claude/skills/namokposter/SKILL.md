---
name: namokposter
description: Make posters with rendered artwork and typeset copy, in Korean or English. Give it poster copy — eyebrow, title, subtitle, event information (date, venue, fee), body, footer, CTA, logo, QR code — and it returns three finished posters, each with a picture conceived for that poster's content (a saxophone for a jazz festival, the stack of books for a book fair) and built in a different technique with three.js and HTML — print, paint and craft techniques (linocut, ink wash, paper relief, embossing), flat graphics, and type-led pictures made from the copy itself (the date set huge, a calendar, a ticket, the venue as a transit map). When the user asks for Blender (블렌더 사용해서, or a 3D material such as clay, glass, felt or chrome) all three posters are path-traced in Blender instead. A3 portrait by default (300 dpi, print-ready), 16:9 for screens when asked, or any size (4:5, 9:16, square, banner). Nearly eighty techniques, nearly seventy typography themes (명조, 붓글씨, retro, 세로쓰기) and thirteen layouts. Use this skill whenever the user asks for a poster, key visual, event or conference announcement image, promo banner, title card, cover or thumbnail — and also when they just hand over poster copy and ask for 시안, drafts, mockups or design options, even if they never mention 3D. 포스터 제작, 포스터 시안, 키비주얼, 행사·세미나·전시 홍보 이미지, 배너, 썸네일, 한글 포스터 요청에 사용.
---

# namokposter

Turns poster copy into finished posters: an art layer with typography composited on top in
headless Chromium. One command renders three finished posters at full size — they are what the user
keeps, not sketches for a later round; a contact sheet and a QA report tell you whether each one is
actually good. Three engines make the art. **A set is drawn with three.js first, and HTML where the motif is
made from the copy, unless the user asks for Blender**; when they do, all three posters use Blender
from the first run (step 3):

- **three.js** renders print, paint, craft, generative and light techniques — linocut, ink wash,
  patchwork, paper relief, blind embossing, fluted glass, halftone, contour maps, light trails.
  Seconds per image.
- **HTML** draws type and vector graphics made from the copy itself — the date set enormous, a
  calendar sheet, a ticket, a stamp and postmark, the venue as a transit map, the headline as a
  pattern. Instant, and vector in the PDF.
- The two combine where a style calls for it: an HTML subject can stand on a **ground** drawn by
  three.js (numerals on out-of-focus lights, a ticket on a grainy gradient).
- **Blender (Cycles)**, on request only, renders real materials — clay, felt, glass, chrome,
  ceramics, neon, folded paper, miniature rooms. Minutes per image. A Blender subject can also
  stand on a ground (a clay still life on a checkerboard).

The copy is always set in **HTML/CSS**: sharp at any resolution, Korean and Latin each typeset by
their own rules, and laid out again for every aspect ratio.

Each poster is a **motif** (what its picture shows — conceived from this poster's content, then
built), a **style** (the technique the picture is made in), a **type** theme and a **layout** (where
copy and art sit) — plus a palette. `SKILL_DIR` below means the folder this file is in.

## Workflow

### 1. Collect the brief

**Read the whole request before anything else: what the user asks for in it shapes the first three
posters.** A first request often carries more than the copy, and every part of it is honoured from
the first run — never make three default A3 posters first and leave the rest for a second round.

| The request names | What you do with it |
|---|---|
| a size or ratio — "가로 16:9로", "인스타 4:5", "스토리 9:16", "A3랑 16:9 둘 다", "A2 인쇄용", "발표 화면용" | `format` (several at once as a list); print asks add PDF and bleed (below) |
| colours — brand colours ("#0f3b3a 바탕에 금색"), a mood ("따뜻한 가을 색", "어둡게") | the palette of all three posters (step 3) |
| a technique or look — "수묵으로", "종이 오리기로", "레트로하게", "블렌더 사용해서" | the technique of the posters; Blender when it is asked for (step 3) |
| what the picture shows — "달이 꼭 들어가게", "사람은 빼고", "우리 제품이 보이게" | the motif of the posters (step 3) |
| a kind of lettering — "손글씨 느낌", "명조로", "세로쓰기로" | the type theme and layout (step 3); a face they name that is not bundled can be fetched if it passes the font policy |
| more copy and parts — a subtitle, an organiser, a web address, a QR code, a logo | their slots (below) |
| how many, or how they differ — "한 장만", "다섯 장", "셋 다 같은 색으로" | the number of posters and what stays the same across them |

Whatever the request leaves open is yours to decide, and only that: no size named means A3
portrait, no colours named means a palette that suits the content, and so on. When you deliver
(step 7), say in a line which of these you chose yourself, so the user knows they can name them
next time or change them now.

A poster is its **headline** and its **event information**, with a short **eyebrow** above the
headline: those are all a poster needs, and all you put on one unless the user gives you more.

| Slot | What it is | Keep it to |
|---|---|---|
| `eyebrow` | small label above the title: the series, the organiser, the venue or the category — taken from what the user said | a few words |
| `title` | the headline — the only slot that is required | ~2–6 words / ≤ 14 Korean characters is ideal |
| `meta` | **event information** — when, where, who it is for, what it costs, how to sign up, whom to ask. On an event poster this is the body: set as labelled rows, label and value at one size, right after the headline | 2–6 rows: `{ "label": "일시", "value": "…" }` |

The other slots are filled **only with what the user supplies** — text they wrote for it, or a line
they asked you to add:

| Slot | What it is | Keep it to |
|---|---|---|
| `subtitle` | one supporting line under the title | one sentence |
| `body` | a descriptive paragraph or a short bullet list, set after the information rows | ≤ 2 sentences or ≤ 4 bullets |
| `footer` | credits and small print along the bottom edge: organiser, sponsors, a bare URL, copyright | 1–3 short items (an array is laid out as spaced items) |
| extras | `cta`, `badge`, `brand`/`logo`, `logos`, `qr` | see `references/spec.md` |

**Do not write a subtitle or a footer of your own.** A request such as "한가위 달맞이 한마당 포스터 만들어
줘. 9월 15일 수요일 오후 5시부터 9시까지 달여울 한옥마을 마당에서 하고, 누구나 무료야" gives a headline,
three rows of information and an eyebrow you can take from it (달여울 한옥마을), and that is the whole copy: no
invented tagline under the title, no made-up organiser or web address at the foot. When the user
does give a tagline, an organiser or a URL, put each in its slot and set it as written; the layouts
take them in without being asked. Leave the eyebrow out when nothing the user said would make one.

When the user supplies copy, set it as written: don't reword it, and add emphasis marks or line
breaks only where they help the layout (say so if you do). If the user gave only a topic, write the
headline and the information rows yourself — short. A poster is read in two seconds.

**Event information is body copy, never footer.** Date, time, place, audience, fee, how to register
and contact are what the poster exists to tell people. They go in `meta`, which is set as a clear
table directly under the headline group — label and value the same size, the label heavier — and
not in the footer's small print or inside a paragraph. People often hand all of it over as a
"footer" ("footer: 11.20 (금) / 눈모루 컨벤션 / 참가비 무료 / site.example"): sort it yourself — information rows
into `meta`, credits and the bare link into `footer`. If you leave it in the footer the renderer
lifts it out on its own and prints what it took; read that line, because it guesses from the
wording.

The reading order the layouts are built on: eyebrow (small label) → title (the hook, by far the
largest) → event information (the table). When the user gave them, a subtitle sits under the title,
a paragraph after the table and the footer along the bottom edge.

**Mark the title's units of sense.** On most layouts a headline runs over two or three lines, and
a break in the wrong place reads wrongly: "파랑곶 서핑 / 페스티벌" ties the place to the sport and
strands the event; "2027 봄 웨딩 / 박람회" does the same to a fair. Write the title with `|` between
the units a reader takes in one at a time — the marks never print — and the composer keeps every
unit on a line of its own or whole beside its neighbours:

- **The name of the thing is one unit** — what kind of event it is, with the word that says
  which: `서핑 페스티벌`, `봄 웨딩 박람회`, `규방공예 작품전`, `보태니컬 아트`.
- **What only qualifies it stands apart, in front** — the year, the edition, the place, the host,
  the season, the audience: `2027 | 봄 *웨딩* 박람회`, `제5회 | *규방공예* 작품전`,
  `파랑곶 | *서핑* 페스티벌`, `어린이 | *요트* 교실`.
- **So does what follows the name** — the level of a class, the round, a volume, a year at the
  end: `*보태니컬* 아트 | 기초반`, `청년 *가요제* | 본선`, `보드게임 *페스타* | 2027`.
- **A long name may be two halves that each read whole**: `안개령 *둘레길* | 함께 걷기`,
  `배다리 *도시재생* | 주민 설명회`.

Mark every title of three words or more (`"title": "파랑곶 | *서핑* 페스티벌"`, or a list:
`["파랑곶", "*서핑* 페스티벌"]`); two words need no mark. Never put a mark inside a compound or a
proper name (`작은 아씨들`, `경로의 날`), and keep a one-syllable word with its neighbour (`시 낭독의 밤`,
`필름사진 전`). This is layout, not rewording — do it for the user's own title too.

The composer then breaks between units only, as long as that keeps the type large; where a unit
does not fit one line of a narrow column it sets the title somewhat smaller rather than cut the
unit, and when it has to cut one it reports `title-unit-split` — give that poster a layout with a
wide text zone (`top`, `band`, `headline`, `axis`) or shorten the unit. Without marks it reads the
words itself — a leading year or edition and a trailing level stand apart, and in Korean the last
two words are taken as the name — which is right most of the time, not always. `\n` still forces
one exact arrangement. Each poster's `report.json` lists the lines it chose (`items.title.breaks`).

**Format.** Two formats are first-class and every layout is tuned for both:

- **A3 portrait** (`"a3"`, 297×420 mm at 300 dpi, 3508×4961 px) — the default when nothing is
  said: a poster is a sheet on a wall first, and the three the user gets are finished A3 posters.
  When it is going to a printer add `"output": {"formats": ["png", "pdf"]}`
  (the PDF keeps type as vectors) and, for a print shop, `"bleed": 3`.
- **2K 16:9 landscape** (`"2k"`, 2560×1440) — use it when the user says screen, slide, 화면, 발표,
  가로형, 16:9, 유튜브, signage, or the poster is clearly for a display.

If both are useful — or you cannot tell — render both in one run with `"format": ["a3", "2k"]`.
Anything else (4:5, 9:16, square, banner, custom pixels) works the same way.

**Screen formats are 2K class; 4K only when the user asks for it** (4K, UHD, 3840, "고해상도", a
large display wall). 2K renders in under half the time, the files are a third of the size, and it
is more than a screen or a slide shows. For 4K write `"format": "4k"` (16:9), or add
`"resolution": "4k"` to give any other screen format — a ratio, `story`, `square`, `web-banner` —
its 4K-class size. Paper formats are not affected: they are sized in millimetres at 300 dpi
whatever the resolution says.

**300 dpi is the default everywhere.** Every paper size — A5 to A0, B sizes, letter, the inch
sizes — is rendered at 300 dpi unless the user asks for another density (`{"preset": "a1", "dpi":
150}`), and every PNG, JPG and PDF is stamped 300 dpi, screen formats included, so the file opens
at its true print size (a 2K poster is 21.7 × 12.2 cm). Don't lower the dpi to save time.

Don't interrogate the user. Missing style preference → you pick (step 3). Ask only when something
essential is ambiguous.

### 2. Check the machine (first use in a session)

```bash
node SKILL_DIR/scripts/doctor.mjs
```

It reports whether Chromium/WebGL is usable — all the default set needs — and whether Blender
(4.2 or newer, or the `bpy` Python module) is there. Blender matters only once the user has asked
for it (step 3). Then, if it is missing, run `node SKILL_DIR/scripts/doctor.mjs --install-blender` —
it pip-installs `bpy` into a private venv under `~/.cache/namokposter` (no admin rights, about 1 GB,
a few minutes) — unless the user has asked you not to install software. If Blender cannot be had,
say so and offer the default set; a Blender style named in a spec is then swapped for a three.js
one, and the report says which. Don't install Blender for a request that did not ask for it.
Other fixes: `references/troubleshooting.md`.

### 3. Decide what each poster shows

The picture comes from this poster's content, not from a list. Work in this order every time:
**read the content → conceive three motifs → choose a technique for each → build them.**

**Read the content.** Before any style is in your head, write down what the event is: the thing
itself (jazz, a book fair, a ceramics class), what people will see and handle there (a saxophone, a
stack of second-hand books, a wheel and wet clay), the place (an outdoor stage in a ginkgo wood),
the season and hour (October, late afternoon), who it is for, and the mood.

**Conceive three motifs.** A motif is what one poster's picture shows. From your notes, think of
six or eight pictures this event could have, then keep three that are *different ideas*, each
conceived for this event:

- the thing itself, made large (the saxophone; the stack of books);
- the place or the moment (the stage among yellow trees; the reading corner by a window);
- something made from the copy (the date as a calendar sheet, an admission ticket, the headline set
  as a pattern) or from the season (ginkgo leaves on piano keys);
- an abstraction of what the event is like — its rhythm, movement, temperature, structure (two inks
  meeting and winding round each other for a cello and piano duo; bars widening and narrowing like
  a solo; still haze for a meditation retreat).

A poster does not have to show its subject literally. An abstract picture is a motif as good as any
other, provided it was conceived for this poster: you can say what in the event it expresses, and
its forms, colours and rhythm were chosen for that. A set may be one literal picture and two
abstract ones, or the other way round — whatever serves the event.

Say each motif in a sentence before you go on — "a tenor saxophone cut from layers of coloured
paper, ginkgo leaves falling past it"; "three bands of colour pulsing like a walking bass line". If
you cannot say what the picture has to do with this event — it is simply a pleasant sunset, a
gradient, a pattern that was to hand — it is not a motif for this poster: think again. Three
pictures of one kind (three suns, three landscapes, the same instrument three times) are one idea,
not three.

**The stock motifs are examples, not a menu.** Every style in the tables below comes with a few
motifs that are already built — hills, a still life, a festival stage. They show how that technique
draws things, and they are there for the day one of them *is* the picture you conceived (a transit
map for a walk along Line 2). Do not start from them, and never settle for one because it is there:
a poster whose picture has nothing to do with its words is the commonest failure of this skill.
When no stock motif is your picture — the usual case — you build it (step 4).

**Then the technique.** A style is a way of making a picture — paper relief, linocut, embossing,
ink wash, flat Swiss graphics, neon tubes, glazed ceramics. Choose for each motif the technique
that would make it best, and make the three differ: different families of technique, different
type themes, different layouts, different grounds (one **bright and friendly**, one **dark or
dramatic**, one **quiet and editorial** is a reliable spread). Layout is the axis most easily
forgotten: three posters with the copy on the left and the art on the right read as one poster in
three colours. Styles marked HTML are drawn in the page (instant, vector), those marked Blender are
path-traced (minutes per image, on request only); the rest are three.js (seconds).

```bash
node SKILL_DIR/scripts/poster.mjs poster.json --suggest
```

reads the copy and names its topics (music, tradition, tech, kids… — 37 of them), says what
high-end posters on that subject tend to do and what to avoid, and lists techniques, type themes
and palettes that suit it (add `--blender` when the user asked for Blender). Use it for the
*technique, type and colour*; the motifs it prints are stock ones, to be taken only under the rule
above. `"styles": "auto"` renders its first three as they are — a fallback for running the script
by hand, not the way you make a poster. `references/topic-guide.md` explains the reasoning per topic.

**The default set: three.js first.** Unless the user asks for Blender, the posters are made with
three.js, and HTML where the motif calls for it. Reach for **three.js** first: a picture with
material, light and depth — paper with its shadows, ink with its grain, glass, embossing, a printed
or painted surface — carries a poster further than a flat sheet. Use **HTML** for a poster only when
the motif is made from the copy itself (the date set enormous, a calendar sheet, an admission
ticket, the venue as a transit map) or the user asks for a flat vector graphic, and for one poster
of the three at most:

| The motif is… | Reach for |
|---|---|
| a thing or a scene — in a print, paint or craft technique, as an illustration, in light, glass or paper you could touch | a **three.js** scene (the default) |
| made from the date, the place or the headline itself; or a flat vector graphic the user asked for | an **HTML** scene — vector, and it can read the copy |
| a typographic subject that should live in a richer field | an HTML subject on a three.js **ground**: `{ "style": "numerals", "ground": "bokeh" }` |

A set of three is strongest when the posters are three different families of technique — say one
paper or craft, one print or paint, one graphic or light piece. HTML styles that are made from a
date (`numerals`, `calendar`) need one in the copy. A style says for itself whether it mixes: it
lists the grounds it has been checked on (`references/spec.md` → Grounds).

When a date is the picture, month and day are shown large together (`11.15`, `11` over `15`, `11월`
over `15일`) — never the day on its own.

**Blender is by request.** Use Blender only when the user asks for it:

- in so many words — "블렌더 사용해서 만들어 줘", "블렌더로 만들어줘", "블렌더 포함", "Blender", "3D 렌더로";
- or by pointing at what only Blender makes — a Blender style by name, or a real 3D material or
  object: 클레이, 펠트, 니트, 젤리, 나무 블록, 유리, 크롬, 홀로그램 포일, 금속, 대리석, 도자기, 네온사인,
  천, 종이접기, 로우폴리, 아이소메트릭, 복셀 ("유리 재질로", "클레이 느낌으로", "3D 커피잔을 메인으로").

Then set `"blender": true` in the spec (or pass `--blender`) **in the first run**: a request that
says "블렌더 사용해서 만들어 줘" is answered with three Blender posters straight away, not with the
default set and an offer to make it again. **All three posters use Blender** — the motif modelled
in 3D in a Blender technique, on its own or on a ground drawn by three.js or HTML — and none is a
plain three.js or HTML poster. The three motifs are conceived the same way (the thing itself as a
real object, the place as a miniature, a sign in neon tubes). The request holds for later revisions
of that poster. Without it, do not use Blender even where the topic would suit it: deliver the
default set and mention that a Blender set is available (step 7).

**The techniques.** Each style below is a technique with the stock motifs built for it.

<!-- styles:start -->
The default set — three.js, and HTML where marked:

**Paper and craft**

| Style | Technique | Stock motifs (examples) |
|---|---|---|
| `papercut` | layered paper relief | strata, tide, canopy |
| `emboss` | blind emboss and foil on cotton paper | monogram, pattern, crest |
| `collage` | cut and torn paper collage | abstract, landscape, city |
| `bojagi` | Korean patchwork cloth (조각보) | patchwork, window, landscape |
| `najeon` | mother-of-pearl lacquer (자개) | cranes, blossom, lattice, waves |
| `stitch` | embroidery | flowers, sampler, borders |
| `mosaic` | tile mosaic | waves, arches, bands |
| `stainedglass` | leaded stained glass | landscape, flowers, geometric |

**Print and paint**

| Style | Technique | Stock motifs (examples) |
|---|---|---|
| `halftone` | riso halftone print | — |
| `linocut` | block print | hills, waves, botanical, rooftops |
| `gouache` | gouache paper cut-outs | fronds, still, shore |
| `crayon` | oil pastel and crayon | landscape, stilllife, city, scribble |
| `watercolor` | watercolour wash | — |
| `sumuk` | ink wash (수묵) | mountains, bamboo, plum, strokes |
| `cyanotype` | sun-print photogram | botanical, objects, shapes, algae |
| `marble` | paper marbling | — |
| `layers` | flat layered silhouettes | mountains, sea, city |
| `airbrush` | retro airbrush space art | planet, moons, orbits |

**Graphic systems**

| Style | Technique | Stock motifs (examples) |
|---|---|---|
| `bauhaus` | geometric tile system | — |
| `memphis` | 1980s Memphis pattern | confetti, stack, totem |
| `opart` | optical art | sphere, wave, fold |
| `artdeco` | art-deco line ornament | tower, arch, scallop |
| `guilloche` | banknote engraving | ribbon, medallion, frame |
| `contour` | topographic contour lines | mountain, coast, peak |
| `flowfield` | flow-field bands | bands, threads, eddy |
| `wave` | dot-matrix terrain | — |
| `haze` | grainy gradient field | — |
| `glyph` | letterforms as image | giant, grid, echo |

**Digital, light and motion**

| Style | Technique | Stock motifs (examples) |
|---|---|---|
| `flux` | neon light trails | — |
| `plexus` | node-and-line network | sphere, torus, wave, constellation |
| `globe` | dotted globe | — |
| `pointcloud` | forms drawn in dots | knot, terrain, vase, shell |
| `blueprint` | technical drawing | tower, gear, rocket, chair |
| `synthwave` | 1980s retro-futurism | sun, city, canyon |
| `glitch` | CRT and VHS glitch | solids, horizon, shapes |
| `pixel` | dithered pixel art | — |
| `bokeh` | out-of-focus lights | city, string, lantern, glitter |
| `caustics` | sunlit water | pool, sand, gel |
| `fluted` | light behind fluted glass | orb, dusk, bloom |
| `inkdrop` | ink blooming in water | plume, drop, duet, band |
| `liquid` | lava-lamp gradient | mass, rise, wave, drip |
| `aurora` | pearly gradient blob | — |
| `ribbon` | satin ribbon | — |
| `turing` | reaction–diffusion relief | — |

**Type and vector graphics (HTML)**

| Style | Technique | Stock motifs (examples) |
|---|---|---|
| `numerals` | giant numerals — the date as the image · HTML | date, stack, words |
| `calendar` | calendar sheets · HTML | month, tearoff, week |
| `swiss` | Swiss geometric graphics · HTML | arcs, bars, dots, diagonal |
| `ticket` | tickets, passes and receipts · HTML | admit, pass, receipt |
| `stamp` | stamps and a postmark · HTML | single, sheet, airmail |
| `transit` | the venue as a transit map · HTML | metro, route, blocks |
| `stickers` | die-cut stickers · HTML | badges, labels, letters |
| `screen` | flat interface mock-up · HTML | windows, chat, player, search |
| `marquee` | the headline repeated as texture · HTML | rows, tilt, tape, steps |
| `pattern` | flat vector patterns · HTML | checker, stripes, dots, terrazzo, arches, grid |

Blender styles — only when the user asks for Blender:

**Paper and craft**

| Style | Technique | Stock motifs (examples) |
|---|---|---|
| `paper` | layered paper cut | — |
| `origami` | folded paper | cranes, boats, peaks, relief |

**Soft and tactile 3D**

| Style | Technique | Stock motifs (examples) |
|---|---|---|
| `studio` | soft clay still life | — |
| `puffy` | inflated glossy toys | — |
| `felt` | needle-felted wool | hills, fruit, pebbles |
| `knit` | knitted wool | winter, bunting, shapes |
| `jelly` | translucent jelly and wax | dessert, gummies, candles, hills |
| `wood` | wooden blocks and turned wood | city, turned, hills |
| `softscape` | soft pastel 3D scenery | lake, dunes, room, clouds |

**Materials and light (3D)**

| Style | Technique | Stock motifs (examples) |
|---|---|---|
| `prism` | glass rings on black | — |
| `chrome` | liquid chrome | — |
| `glass` | frosted glass panels | cards, discs, arch |
| `foil` | holographic foil | balloons, sheet, ribbons |
| `metal` | machined, anodised metal | dial, rods, blocks |
| `stone` | marble and gold | podium, balance, arch |
| `ceramic` | glazed ceramics | vases, table, tiles |
| `neon` | neon tube signs | arcs, icons, frame |
| `monolith` | plaster arches in low sun | — |
| `fabric` | draped cloth | drape, curtain, flow |

**Illustrative 3D**

| Style | Technique | Stock motifs (examples) |
|---|---|---|
| `toon` | cel-shaded 3D with ink outlines | desk, hills, blocks |
| `lowpoly` | faceted low-poly | island, peaks, berg, rocket, forms |
| `isometric` | isometric miniature | room, shop, stage |
| `voxel` | voxel blocks | island, city, heart |
<!-- styles:end -->

**Type themes** — sixty-seven voices; any theme works with any style, and each style has a sensible default.

<!-- themes:start -->
- **Clean sans** — `bold` confident all-rounder · `friendly` warm, gradient emphasis · `swiss` precise, mono labels · `grotesk` Swiss neo-grotesk · `geometric` Bauhaus geometric caps · `elegant` light weights set large · `dodum` warm, light humanist · `humanist` 나눔고딕, familiar and plain · `square` square-cut public-notice gothic · `round` rounded square gothic · `plex` engineered corporate · `sunflower` modular Korean modernism · `slim` the same in one thin line · `gmarket` full-square geometric gothic of sale banners (G마켓 산스) · `paperlogy` slide and card-news gothic, three weights (페이퍼로지) · `dream` tall rectangular title gothic (에스코어 드림)
- **Loud display** — `impact` expanded caps · `brutal` the headline is the image · `condensed` film-poster gothic · `wide` extended grotesque · `slab` wood-type slab · `fatface` playbill fat face, 굵은 견출명조 · `stencil` industrial stencil · `pop` chubby sticker lettering · `comic` comic-cover letters, outlined and shadowed · `jua` round shop-sign brush · `outline` hollow headline · `jalnan` heavy promotional gothic (여기어때 잘난체) · `anemone` chunky, soft-cornered, tilted ㅇ (카페24 아네모네) · `ssurround` round-ended thumbnail headline (카페24 써라운드) · `esamanru` baseball-game stadium lettering (이사만루) · `maple` cheerful game-title lettering (메이플스토리)
- **Serif and literary** — `editorial` magazine serif · `myeongjo` brush-rooted 명조 · `batang` quiet book 명조 · `maru` warm text serif (마루 부리) · `garamond` literary classic · `didone` fashion-magazine contrast · `news` broadsheet headline · `roman` inscriptional capitals · `flora` hairline display serif · `luxe` thin, wide-set capitals · `deco` art-deco capitals
- **Hand and brush** — `hand` marker handwriting · `pen` felt-tip note · `story` neat pen, an essay's hand (나눔바른펜) · `melody` thin round diary hand · `gamja` a child's crayon · `dongle` round kindergarten letters · `singleday` angular doodle lettering · `marker` fat-marker placard · `brush` 붓글씨 title calligraphy · `calli` brush-pen calligraphy · `starlight` bold felt pen (카페24 빛나는별) · `goun` slender evening hand (카페24 고운밤) · `kkubulim` wobbly, curling hand (꾸불림체)
- **Signs** — `retro` newtro signage with drop shadow · `signage` 1970–80s cut-acrylic shop sign · `yeonsung` hand-painted shop sign (연성체) · `euljiro` Euljiro's painted sign lettering (을지로체) · `classic` 1970–80s display face with wedged ends (카페24 클래식타입)
- **Machine** — `techno` monospaced, bracketed · `typewriter` typescript page · `bitmap` pixel type · `arcade` 8-bit title screen · `cute` handheld-game dialogue box · `dunggeunmo` 1990s PC-network bitmap (둥근모꼴)
<!-- themes:end -->

**Choose the lettering as widely as the pictures.** When the copy is the kind that wants lettering
with a hand in it — a children's show, a market, a party, a reading group, a class — choose among
all the hand, brush and sign themes, not the first that comes to mind: `pop` on every playful poster
makes a set, and a year of posters, look alike. Match the voice to the occasion (a round, plump hand
for a family musical; a painted shop sign for an anniversary party; a neat pen for a winter reading
group), and never give two of the three posters the same theme. `--suggest` already does both: it
draws from every theme that suits the topic and the style, varies the pick with the headline and the
seed, and keeps sober copy (a memorial) away from playful faces.

**A face from outside the bundle.** Every bundled face is free for commercial use and in wide use
(`references/fonts.md` has the figures). Set the posters in the bundled type themes; do not go
looking for a face outside on your own, whatever the copy is about. When the user asks for a face —
names it, hands over a file, or asks you to bring one in — the font policy is no reason to refuse it
(they may hold its licence). Take it in this order (`node SKILL_DIR/scripts/fonts.mjs …`):

1. a font file the user gave: `add --file <path> --base <theme>`;
2. a bundled face: its bundled theme (`check "<name>"` says which);
3. a face installed on this computer: `add --installed "<family>" --base <theme>`;
4. a face on Fontsource or the checked list: `add "<family>" --asked --base <theme>`;
5. a face its publisher gives away on its own page: fetch it there and nowhere else, read the terms
   there, then `add --file <path> --source <page> --note "<terms>"`; tell the user any condition
   that touches the poster (some forbid a trade, some ask for a credit);
6. a paid face that is neither given nor installed: fetch it from nowhere; ask for the file (or to
   install it), and meanwhile set the poster in the nearest bundled theme.

Never take a face from a copy someone else has put up or from a file-sharing site. `search <words>`
is for the user who asks you to find a face; it lists only faces that pass the policy. If a fetch
fails (no network), carry on with a bundled theme and say so. At delivery, say in one line which face
came from where under what licence — for a file the user gave or an installed face, that its licence
is the user's to answer for; `report.json` records the same under `fontsFromOutside`.

**Layouts** — thirteen arrangements in five structural families, each with a mirror image; a set of
posters should use three different families:

| Family | Layouts | What it looks like |
|---|---|---|
| split | `left` · `right` · `side` (portrait) | copy beside the art |
| stack | `top` · `bottom` · `band` | copy above or below the art; `band` sets headline and information in two columns under it |
| spread | `strip` · `corners` · `headline` · `baseline` | headline and information anchored apart, the subject between them; `strip` runs the information as a bar across the foot (the roomiest of these), `headline` / `baseline` run the title across the full width at the top / bottom |
| centre | `axis` · `center` | one centred axis (headline, subject, information bar); `center` sets the copy over the art |
| vertical | `vertical` | 세로쓰기 title down the edge — short Korean headlines, tradition and literature |

Add `-mirror` to exchange left and right (`top-mirror`, `headline-mirror`, `corners-mirror`). Layouts
re-flow per orientation, and a poster may name one per format: `"layout": {"landscape": "band",
"portrait": "axis"}`. Each style lists the layouts it has been checked with (`--list-styles`, or
`layouts.<orientation>.also` in its `style.json`); others may work — look before you deliver. The
spread and centre layouts hold less copy than `left` or `top`: with a long body or more than four
rows of information, stay with split, stack or `strip`. Details: `references/spec.md` → Layouts.

For the full catalogue — every motif, palette and parameter, the tradition behind each type theme,
styles and themes by topic — read `references/styles.md`; it is worth the read before choosing,
because the right pairing is most of the design.

There is no sunburst style, on purpose: rays radiating from a sun disc read as the Rising Sun flag
(욱일기). Don't build that motif in a custom scene either; for a retro mood use arches, wavy stripes,
checkerboards, halftone dots or stars.

### 4. Build each motif

A motif you conceived is built as a **scene**: a small program that draws the picture in the
technique you chose. This is ordinary work in this skill, not an exception — expect to write a scene
for most posters.

1. **Take the technique from the nearest style.** Open that style's scene file
   (`assets/styles/<id>/scene.js`, `scene.html.js` or `scene.py`) and read how it makes its look —
   the paper and its shadows, the ink and its grain, the glass tube and its glow, the glaze and the
   light. Copy the file next to your spec and keep that part.
2. **Draw your motif in place of its stock one.** Replace what the scene draws with your picture,
   built from curves, shapes and solids in code: a tube whose width changes along a centre line for
   a saxophone, a lathe profile for a bell or a vase, a fan with a notch for a ginkgo leaf, boxes
   and cylinders for a stage and its drum kit. Get the proportions of the real thing right — it has
   to be recognised at a glance. Camera, placement beside the copy, palette and render settings are
   handled for you (`ctx.frame`, `ctx.artRect`, `ctx.palette`).
3. **Point the poster at it**: `{ "style": "<the style you took the technique from>", "scene":
   "./sax-papercut.js" }` — the style still supplies its type theme, palettes and layouts. A `.js`
   file is a three.js scene, `.html.js` an HTML scene (DOM and SVG drawn in the poster page,
   `references/html-scenes.md`), `.py` a Blender scene.
4. **Render small, look, correct** — `"format": {"preset": "a3", "dpi": 60}` renders in a second or
   two (Blender: tens of seconds). Look at the preview and ask: is it recognisable at thumbnail
   size? Are the proportions right? Does it look *made* in the technique, or pasted on? Is the
   sheet balanced? Three or four rounds is normal.

`references/custom-scenes.md` has the scene API for each engine, the ways of drawing a motif that
have carried finished posters ("Drawing a motif from nothing": tubes, turned parts, a true model
projected by hand, canvases as plates with a shader as the press, what went wrong on the way) and
the look-dev loop; `references/style-recipes.md` lists some forty looks with how
to build each. Do not download pictures or trace ready-made icons for a motif: draw it. A motif is
never a symbol sprinkled over the sheet (floating notes, clip-art stars); it is one picture, made
properly.

Use a stock motif as it is only when it is the picture you conceived: `{ "style": "transit",
"motif": "metro" }`.

### 5. Write the spec and render

Write a JSON spec in the user's project/working folder (not the skill folder):

```json
{
  "content": {
    "eyebrow": "2026 별모루 디자인 위크",
    "title": "내일의 *모양*을 | 묻다",
    "subtitle": "서른 개 스튜디오가 그리는 다음 십 년",
    "body": "가구, 공간, 그래픽, 디지털 제품까지. 주목받는 스튜디오의 신작을 3주간 공개합니다.",
    "meta": [ { "label": "일시", "value": "10.14 (수) – 11.03 (화)" }, { "label": "장소", "value": "별모루 디자인랩 2관" } ],
    "footer": ["주최 별모루디자인재단", "shapeoftomorrow.example"]
  },
  "format": "a3",
  "drafts": [
    { "style": "studio", "type": "bold", "palette": "sky" },
    { "style": "halftone", "type": "brutal", "layout": "corners" },
    { "style": "layers", "motif": "city", "type": "editorial", "palette": "bluehour" }
  ]
}
```

```bash
node SKILL_DIR/scripts/poster.mjs poster.json --out poster-out
```

- `drafts` is the spec's name for the set of three; every entry is rendered as a finished poster at
  full size.
- In copy, `*word*` marks emphasis (accent colour, gradient or italic — the theme decides),
  `**word**` is bold, and `\n` forces a line break. In the title, `|` separates its units of sense
  (step 1): headline breaks are chosen automatically for size and sense and fall between units;
  add `\n` only when you want one specific break.
- `format` accepts presets (`2k`, `4k`, `a3`, `a2-landscape`, `fhd`, `instagram-post`, `story`, `square`,
  `web-banner`, …), a ratio (`"4:5"`), exact pixels (`"3000x4000"`), or a list of these — each
  format then gets its own sub-folder with its own contact sheet and report. A layout name that
  only exists in one orientation maps to its counterpart (`left` → `top` in portrait), so one spec
  serves both A3 and 16:9; still, look at both contact sheets — copy that sits well on A3 can be
  cramped in 16:9, and a poster may want a different `layout` per format
  (`"layout": {"landscape": "corners", "portrait": "axis"}`).
- Feed posts and stories (1:1, 4:5, 9:16) are treated as phone-viewed: supporting text is set about
  1.4× larger, so they hold less copy. Override with `"viewing": "screen" | "mobile" | "print"`.
- Brand colours: `"palette": { "bg": "#f3ead8", "ink": "#1f4d3a", "accent": "#d9622b", "colors": ["#d9622b", "#1f4d3a"] }`
  at the top level (all posters) or per poster. Rendered walls are colour-matched to `bg`, and an
  accent that would be unreadable on `bg` is adjusted automatically.
- **Timing.** What the first run delivers is the finished poster: render at standard quality from
  the start, in the format the user will keep. The default set takes seconds: a three.js poster a
  few seconds (up to ten or so on an A3 sheet), an HTML poster about one. A Blender set takes
  minutes, because on the default A3 sheet the 3D layer is path-traced at every pixel of 300 dpi:
  about ten minutes per poster on a 4-core CPU and nearer eighteen for one cut out for a `ground`
  (peak memory about 6 GB; a GPU is several times faster), so three run about half an hour on a CPU.
  Tell the user how long it will take, then start — do not ask them to choose a quick version
  first. At 2K a Blender poster takes roughly 2–3 minutes and 3–5 at 4K (translucent `jelly` and
  simulated `fabric` up to twice that); a subject cut out for a `ground` takes one and a half to two
  times as long as the same style rendered normally. Sheets larger than A3 take about as long as A3,
  because there the layer is rendered at A3's pixel count and scaled while type stays at full
  resolution (`--quality high` renders every pixel). Start a Blender run as a background command
  (or with the longest timeout your shell tool allows) and wait for it — a quiet terminal means
  Cycles is rendering, not that it hung.
- **`--quality draft` is for your own trial runs.** It renders the 3D layer at half resolution (type
  as sharp as ever), a minute or two for a Blender set: use it while you work on a custom scene or
  settle a difficult layout, then render at standard quality. Never deliver its output, and do not
  propose a "quick version first, final later" round unless the user asks for a quick look. Art
  layers are cached per user, so re-runs that only change copy or type take seconds, in any output
  folder.

Everything else the spec can do — extra elements, per-poster seed/params, fonts, PDF/JPG output,
custom CSS and HTML slots, your own background image — is in `references/spec.md`.

### 6. Look at the result and fix it

The script prints one line per poster plus any problems it measured, and writes:

```
poster-out/
  <name>-A-<style>.png …         full-resolution finals
  previews/<name>-A-<style>.jpg  1600 px previews
  contact-sheet.jpg              all drafts side by side
  report.json                    measurements: sizes, positions, contrast
```

Open `contact-sheet.jpg` (and a preview if something looks off) — the previews, not the full-size files.
The measurements catch overflow and low contrast; only looking catches a subject that crowds the
title, a palette that fights the content, or three posters that feel the same. Typical fixes:

| Symptom | Fix |
|---|---|
| `copy-dense` / `copy-overflow` | cut body text first (never the date or place); or a roomier layout |
| `title-too-long`, or a break you dislike | shorten, or place `\n` yourself |
| `low-contrast` | follow the hint in the message: another palette, an explicit `accent`/`muted`, a different layout, or `"vars": {"--scrim": 0.8}` |
| `glyph-fallback` | a rare Hangul syllable is missing from the display face: reword, or use `bold`/`swiss`/`editorial` |
| posters look alike | give each a layout from a different family (split / stack / spread / centre); then style and type theme — not only the palette |
| `copy-over-art` | the subject runs under the copy: another layout, or place it with `"layout": {"layout": "…", "focus": [x, y], "artSize": 0.4}` |
| composition feels off | another `"seed"`, `"layout"`, or the style's `params` |
| Korean title feels cramped or loose | it should not — check the theme (`myeongjo`/`editorial` for 명조, `bold` for 고딕) before touching spacing |

Re-run after each change; only what changed is re-rendered (`--only B` re-renders one poster and
keeps the others in the contact sheet). Don't hand over a poster with errors in the report.

### 7. Deliver

Give the user the three finished posters (use the file-sharing mechanism your environment has;
otherwise state the paths) with one line each on the concept — style, type, mood. They are finished
work at full size, so present them that way: in Korean say "포스터 세 장" or "완성본", never "시안" or
"초안". Mention anything they should know (a Blender style was substituted, a line break or emphasis
you added), and which choices were yours because the request left them open (A3 portrait, the
techniques, the colours). Then say what they can ask for next — a change to one of them (palette,
layout, type theme, copy), another size (16:9, 4:5, 9:16), a print PDF — and do it when they ask.
Add that any of this can be said in the first request next time: size, colours, technique, what the
picture shows, extra copy.

With the default set, add one line that a Blender set is there for the asking, since the user may
not know: real 3D materials (the script prints which Blender styles would suit this copy), how to
ask ("블렌더 사용해서 만들어 줘"), and that it takes minutes rather than seconds. Say it once per poster, not
after every revision, and not at all when the set already is the Blender one.

## Other requests

- **Other ratios or several sizes** — change `format` (or `--format`) and re-run into another
  `--out` folder; check each contact sheet, since copy that fits 16:9 may be dense at 9:16.
- **The same subject in all three posters** ("all with our product", "a stack of books in each") —
  build that subject once (step 4) and vary the technique round it, or keep one scene and vary type
  theme, palette, layout and lighting.
- **A look the stock styles don't have** — `references/style-recipes.md` lists some forty looks
  with how to build each, in three.js and in Blender, and what goes wrong.
- **A new typographic voice** — a type theme is one small CSS file; `"type": "./my-theme.css"`. For a face the user asks for that is not bundled, `scripts/fonts.mjs add` writes one (`references/fonts.md`).
- **Brand fonts** — `fontFaces` + `fonts` in the spec.
- **User's own image as the art** — `{"style": "wave", "art": "./photo.jpg"}`.
- **Elements with no slot** (sponsor strip, price tag, speaker list) — `content.slots` and `css`.

## Reference files

- `references/styles.md` — every style, palette and parameter; type themes and how to pair them; layouts.
- `references/fonts.md` — the font policy (commercial licence, real use), the bundled faces against it, fetching a face from outside.
- `references/spec.md` — every spec field, formats, extra elements, CLI flags, report format.
- `references/design-principles.md` — the layout, hierarchy and Korean typography rules the presets
  encode, with sources. Read it when you override sizes or spacing, or write a theme.
- `references/custom-scenes.md` — writing your own Blender / three.js scene, type theme or style; cut-outs.
- `references/html-scenes.md` — writing an HTML scene: art drawn with DOM and SVG, made from the copy.
- `references/style-recipes.md` — recipes for looks beyond the stock styles, in Blender and three.js.
- `references/troubleshooting.md` — installing Blender/Playwright, slow renders, fonts, errors.
