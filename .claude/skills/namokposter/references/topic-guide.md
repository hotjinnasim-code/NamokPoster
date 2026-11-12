# Topic guide — from a poster's subject to its design

Companion to `topics.json` (researched 2026-11-10). The JSON holds the decisions; this file says where they come from, how sure they are, and the rules that cut across topics.

**Evidence tags.** **[R]** I opened the page and read it. **[S]** seen only in a search-result summary (page blocked, missing or not opened) — unverified. **[Syn]** my own synthesis; no source says it. Short quoted phrases are as returned by the fetch tool's reading of the page: check the page before reusing them verbatim. Links are reference-style; every URL is listed once under [Sources](#sources).

**How strong is this?** Trade-press case studies and studio pages were read for tech, science, education, design, art, culture, tradition, literature, music, nightlife, film, food, market, kids, sports, travel, gaming and craft. For business, family, community, the four seasons, celebration and most of fashion, luxury, beauty and wellness I found no award-level analysis that would open; those entries are **[Syn]** built on genre convention and on the earlier research notes (`layout-references.md`, `korean-typography.md`, `3d-style-references.md`), which are reused here and not repeated. Nothing in the JSON was test-rendered: styles and themes marked "planned" did not exist when this was written.

## Contents
- [How the topics were derived](#how-the-topics-were-derived) · [Using topics.json](#using-topicsjson) · [Classifying copy](#classifying-copy)
- [Reference patterns per topic](#reference-patterns-per-topic)
- [Cross-topic rules](#cross-topic-rules): [register](#1-register-formal--playful) · [seasons](#2-seasonal-colour) · [Korean tradition](#3-korean-traditional-subjects) · [light, dark, quiet](#4-light-dark-quiet) · [two topics](#5-two-topics-at-once) · [always](#6-rules-that-hold-for-every-topic)
- [Sources](#sources) · [Pages that would not open](#pages-that-would-not-open)

## How the topics were derived

The 36 tags plus `general` are the vocabulary the style briefs already use for `style.json → topics`, so a topic chosen here can be joined directly to a style's own `topics` and `motifs[*].topics` lists. They fall into four kinds, which matter when two apply at once (rule 5):

| Kind | Tags | What it decides first |
|---|---|---|
| Sector (who is speaking) | tech, science, business, finance, education, design, architecture | type voice and layout discipline |
| Genre (what kind of event) | art, culture, tradition, literature, music, nightlife, film, fashion, luxury, beauty, food, market, sports, gaming, craft | style technique and composition |
| Audience and place | kids, family, community, outdoor, travel, nature, wellness, city | tone, motif, level of play |
| Time and mood | spring, summer, autumn, winter, retro, celebration | palette and motif; rarely the type voice |

For each topic I looked for (a) an award archive or curated source, (b) a Korean studio or institution case, (c) the genre convention a lay viewer already knows, and wrote down only what at least one of them supports; the rest is tagged **[Syn]**.

## Using topics.json

- `styles` are ordered best first; `motif` is a plain-words subject to map onto the style's own `motif` parameter (or a custom scene); `why` is the reason to say to the user.
- `types`, `layouts` are ordered best first. `palettes` all pass ink/bg ≥ 7:1 and accent/bg ≥ 3.5:1; notes start with `light`, `dark`, and `quiet` where the palette is low in chroma.
- `_trios[topic]` is three ready posters: `tone` light / dark / quiet, three different styles (at least one per engine), three type themes, three layouts. Use it as the default answer; swap one poster for a higher-ranked style when the copy points to a specific motif.
- `_meta` carries the vocabulary, matching notes, the engine assumption and a month → season table. Keys beginning with `_` are not topics.
- The lists mix all three engines. HTML styles (`numerals`, `calendar`, `ticket`, `stickers`, `screen`, `marquee`, `pattern`) sit in the middle of a topic's list: they are the typographic answer to a subject, not its first image. What the copy offers moves them: a style made from a date (`numerals`, `calendar`) is dropped when the copy has no date and promoted when the poster is little more than a headline and a date; and once a rendered style leads a set, an HTML one is preferred for a place beside it, so that three posters come from different engines where the topic allows.
- On playful topics (celebration, kids, family, community, market, food, retro, music, nightlife, design, sports, gaming, spring, summer) one poster of a set may be given a `ground` — a pattern or a gradient under a cut-out subject — from the pairings its style lists as checked (`grounds` in `style.json`).

## Classifying copy

All **[Syn]**; none of this was run against real posters.

- Korean keywords: substring match. English: word boundaries, case-insensitive, acronyms (AI, UX, DJ, IR, LoL) case-sensitive.
- **Longest match wins.** Many keywords nest: `푸드 페스티벌` (food) contains `페스티벌` (music); `머신러닝` (tech) contains `러닝` (sports); `인디게임` contains `인디`; `와인바` contains `와인`. Consume the longest keyword at each position and do not count the shorter one. A few stems were dropped or lengthened because they hide inside unrelated words (`스키` in 위스키 → `스키장`; `테크` in 테크노 and 재테크; `정원` as 'quota'; bare `파티`, `축제`, `거리`).
- One-syllable Korean words (봄, 꽃, 숲, 책, 시, 산 …) are deliberately absent from the lists; `_meta.ko_whole_word` gives the ones worth counting when they stand alone as a word.
- Place names and organiser lines are not evidence: venue lines put 서울, 한강, 시청, 호텔 on every poster. Classify from eyebrow, title, subtitle and body; ignore `meta` values and `footer`.
- Weight title and eyebrow about three times the body. Keep the top one or two topics. `general` keywords are stop-words; use `general` only when nothing else scores.
- Dates give a season (`_meta.month_to_season`) but only as a tie-breaker for palettes (rule 2). Start times of 18:00 or later, or words such as 야간 / 심야 / night, justify putting the dark poster first.
- Register words shift the type voice inside any topic (rule 1): 초청 · 기념식 · 시상식 · 포럼 · 귀하 push formal; 놀자 · 같이 · ~해요 · 느낌표 push playful.

## Reference patterns per topic

Each entry: what high-end work does → what `topics.json` encodes.

**tech.** Conference identities are shape systems renewed yearly: Figma's Config 2024 extends a shape language, builds six palettes so "nothing would feel tired", and lets the wordmark behave differently each year [R · It's Nice That][config]; Meta Connect 2025 grows wireframe lines into finished forms [R · Studio Dumbar][connect]; Strelka's Future Architect merges stage and screen in a black-and-white grid to escape the stock branded stage [R · Eye on Design][strelka]. Mexico Tech Week's redesign set out to avoid the clichéd tech look [S · Contra][mtw]. → abstract system styles (`flux`, `plexus`, `glass`, `pointcloud`), mono and grotesque voices, one accent on dark; circuit boards and glowing brains in `avoid`.

**science.** Co.Scienza keeps two stripes and overlapping boxes and renews palette and illustration each year (F37 K9 Slab + Geist Sans) [R · Fonts In Use][coscienza]; an art-and-science festival links everything with a "map" drawn from charts and data [S · a designer portfolio][neonfest]. → one phenomenon shown exactly (`turing`, `cyanotype`, `contour`, `prism`), captions like figure labels; the specimen-sheet approach and the cyanotype reference are [Syn].

**business.** No dedicated high-end source opened. Built from the layout research (split image/text for conferences, one sponsor row, label–value information) and from the finance and tech cases. All [Syn]. → `wave`, `glass`, `globe`, plain sans voices, `left` / `band`.

**finance.** Palettes are polarising between vivid and calm; Revolut's monotone utility against Stripe's gradients; illustration has moved past "Corporate Memphis" [R · 11:FS][11fs]. Blue remains the banking default, serif reads as heritage for banks and wealth managers, and the rounded friendly sans has itself become a cliché [S · agency blogs][finsnip]. → engraving and stone (`guilloche`, `stone`, `marble`) for institutions, `glass` / `plexus` for fintech; serif-led type list. The red caution is [Syn]: in Korean market displays red means a rise and blue a fall, the reverse of Western usage.

**education.** Goldsmiths' recruitment campaign: hot pink, yellow and charcoal colour blocks, large eclectic type, black-and-white reportage [R · Creative Boom][goldsmiths]. UAL describes its identity as "bold, simple and direct" with Helvetica Neue Bold; Essex uses Archivo and a bold palette [S · university brand pages][edusnip]. → colour-field palettes (`sunny`, `campus-sky`), `bold` / `geometric` / `humanist`, `left` layout; the insistence on a label–value table is from the skill's own principles.

**design.** The title is the image: Sulki & Min fold a programme name into the core graphic [R · It's Nice That][sulki]; Cho Hyun-yeol sets posters in letters alone, stretching them for mood, and built Jeonju IFF identities from the initials ㅈ and ㅍ [R · 월간 디자인][cho]; Typojanchi 2021 treats letters as signs and icons [R · 월간 디자인][typojanchi]. Seoul Design Festival's symbol colour is red [S · DI Today][sdf]. → `glyph`, `bauhaus`, `opart`; `grotesk` / `brutal`; `headline` and `corners`; two-ink palettes.

**architecture.** Strelka's grid [R · Eye on Design][strelka]. CCA lecture posters lay type over a generative image, or over the PostScript code of the layout itself; Yale's 2015 lecture poster is by Michael Bierut and Jessica Svendsen [S · AGI, Yale][archsnip]. The 2021 Seoul Biennale symbol is five coloured lines crossing [S · 서울시][sbau]. → `blueprint`, `monolith`, `isometric`, `contour`; `grotesk` / `stencil`; the claim that plan and axonometric are the "native" images is [Syn].

**art.** The 2025 jury of 100 Beste Plakate describes a year "just as compelling in minimalist typography and black-and-white" as in "large-scale imagery and expressive colour combinations", with analogue techniques (risography, silkscreen, pen plotters, even chalk and cress seeds) inside digital design [R · Staatliche Museen zu Berlin][100bp25]. Seoul's printed poster is "pretty much extinct" outside Daehak-ro and the phone is now the poster wall [R · It's Nice That][viewseoul]. Minimal Korean exhibition systems: bold black Hangul title, dates, logo [R · It's Nice That][sulki]. → `collage`, `halftone`, `monolith`, `inkdrop`; four-corner layout; `gallery` and `black-pink` palettes for the two extremes.

**culture.** Everyday Practice: serif, sans and Hangul looped together in white and gold on pale blue (HereThere); yellow, pink and blue for Content Impact; modular systems planned for motion [R · It's Nice That][everyday]. Fixed signature, changing graphic (Studio Dumbar's Sinfonietta) and Korean–English set as parallel columns (studio fnt) are in the earlier notes [R]. Two 2026 Korean festival briefs ask for tradition with a contemporary sense and rule out composited night-view photographs [S · contest briefs][briefs]. → `halftone`, `paper`, `collage`, `glyph`; `editorial` / `myeongjo` / `brutal`.

**tradition.** Typojanchi 2021: crane and turtle from the ten longevity symbols, drawn by a tattooist, on a fluorescent ground chosen so it would not look like a folk painting; Hangul, hanja and Latin together [R · 월간 디자인][typojanchi]. A study of 147 National Gugak Center recital posters (2017–2020) reports mostly two-part split layouts, active use of empty space and little variety [S · catalogue record][gugak]. A 2026 anthology of 47 Korean poster designers declines to define one "Korean" look (earlier notes [R]). → material styles (`sumuk`, `bojagi`, `najeon`, `paper`, `stitch`), `myeongjo` / `brush` / `batang`, `vertical` first. Palette hex values are my screen approximations of named traditional colours [Syn]; see rule 3.

**literature.** Seoul International Book Fair: Workroom's identity since 2018 shows people taking books from shelves; the 2024 poster by the group Cement pairs Gulliver with the dolphin Jedol, and the image changes with each year's theme [R · 월간 디자인][sibf]. → cover logic [Syn]: `watercolor`, `sumuk`, `glyph`, marbled endpapers; `batang` / `myeongjo` / `garamond`; `vertical` and `center`.

**music.** Line-ups: Coachella has ranked by type size since 2003; Tomorrowland sets more than 850 names at one size, alphabetically; III Points uses a circle so that nobody is plainly the headliner — billing is a negotiation with agents [R · Wallpaper*][wallpaper]. A typology of nine line-up layouts, from strict A–Z to "highlighted A–Z" (Dekmantel: headliners in yellow, the rest beige) [R · Joe Delon][delon]. A concert poster must explain concept and information in one image; albums can be layered because they are merchandise [R · Bandwagon][jiyoon]. Classical: San Francisco Symphony on black with coloured accents and serif letters that respond to sound [R · Creative Boom][sfs]; BBC Philharmonic 2025/26 with Proza Display, three core tones and candid portraits [R · Fonts In Use][bbcphil]; curved lines of varying weight to "visualise music" (Bielefeld), the photograph's dominant colour applied to the type (Thonik), and the LSO avoiding rolling-hills imagery [S · Red Dot and others][orchsnip]. → six palettes covering stage, riso, sunset, line-up yellow, concert hall and a two-colour jazz sleeve.

**nightlife.** Two poles: "gridded calm" (Saville for the Haçienda; Fabric without DayGlo or lurid type, small plain text under art-directed images) [R · Eye on Design][clubbed] and rave density — "brash and bold" type, "retina-burning neon", cut-and-paste, the smiley after 1988 [R · Eye on Design][rave]. Early flyers were hand-made, photocopied and coded: a smiley or one word [R · Museum of Youth Culture][myc]. Posters now double as phone wallpapers [R · Eye on Design][rave]. → `chrome`, `neon`, `flux`, `liquid`, `glitch`; a `lounge` palette and `elegant` for bars. The chrome-type emphasis comes from the earlier 3D trend notes, not from these articles.

**film.** Trade vocabulary: key art is the one image adapted to every format; the billing block's sizes and order are contractual [R · Poster House][posterhouse]. Bitnaneun's Siyoung Park: colour is the most important thing to get right; ask "does the poster resemble the film?"; condensing a film is like "replacing a novel with a passage of poetry" [R · It's Nice That][bitnaneun]. Jeonju's *100 Films 100 Posters* treats the poster as experiment and plans motion from the start [R · 월간 디자인][100films]. A study of 70 Korean festival posters finds colour illustration combined with photography and type [S · earticle][iffstudy]. → `layers`, `halftone`, `bokeh`, `glyph`; `condensed` for the billing block, `bottom` layout. The comedy red-title remark rests on a headline only [S · The Guardian][guardian].

**fashion, luxury, beauty.** Thin evidence, mostly font-vendor pages [S · vendor pages][luxsnip]: didones since Bodoni and Didot; capitals with generous tracking (a Brunello Cucinelli print piece is described that way); black, off-white, charcoal and soft gold; in beauty, tonal ink (charcoal, plum, muted gold) instead of black and two typefaces as the ideal. The Game Awards' new identity pairs "baroque gold" with black and white [S · Creative Bloq, vendor blogs][gamesnip], which shows the prestige code crossing sectors. Gold kept under a tenth of the area is from the earlier 3D notes. Everything else — one object, large silence, texture as the beauty image — is [Syn]. No description of Seoul Fashion Week's key visual could be found.

**food.** Mina (Barcelona) by Davy Denduyver: over a hundred rough charcoal drawings, handwritten logo, black on warm yellow, olive and blue, layouts borrowed from old film posters, a toolbox instead of guidelines [R · It's Nice That][mina]. Hand-crafted type and warm palettes are reported as 2025 restaurant trends [S · trade blog][foodsnip]. → `linocut`, `crayon`, `ceramic`; `signage` / `hand` / `slab`; warm grounds. Linocut as "the strongest food-poster tradition" is my judgement [Syn].

**market.** Kapani Market (Athens): a custom face from old shop signs, handwriting, rough texture and raw illustration, explicitly refusing a clean, staged market image [R · 디자인 나침반][kapani]. Korean retro signboard lettering has been an established current since the late 2000s (earlier notes [R]). → `halftone`, `collage`, `linocut`; `retro` / `signage` / `marker`; `headline` and `top`.

**kids.** Bologna Children's Book Fair hands the identity each year to a young illustrator under Chialab; 2024's brief asked for indefinite forms, soft contours and transparent colour, and the palette moved to cool blues and greens as a contrast to 2023's reds [R · BCBF][bcbf]. Pentagram's Young V&A mixes a hacked extrabold face with hand-made characters, doodles and zine-like photography; the voice is "Seriously Spirited" [R · Pentagram][youngva]. → toy and hand styles (`puffy`, `felt`, `crayon`, `toon`); `pop` / `jua`; three or four colours. Cool palettes are allowed: children's work is not obliged to be primary-coloured.

**family, community.** No dedicated sources. Family is derived from kids (softened) and wellness; community from the hand-made family in the layout notes and from the 2025 Beste Plakate jury's remark that posters again carry social messages in bold type and bright colour [R · Staatliche Museen zu Berlin][100bp25]. All else [Syn].

**sports.** Bold condensed sans as the workhorse, obliques for forward lean, diagonals for speed, flat team colours; Tokyo 2020's checker and Paris 2024's Art Deco-influenced graphics as event systems [R · Made Good Designs][sportsmg]. Korean running events now work through fashion collaborations and colour concepts [S · Careet][runsnip]. No Olympic-poster analysis was found; the "number as hero" rule is [Syn]. → `flux`, `halftone`, `metal`, `contour`; `condensed` / `impact` / `stencil`.

**outdoor, travel, nature.** Roger Broders' railway posters: simple lines, bold flat colour areas, strong perspective, plain bold lettering naming the place plus a short slogan [R · Wikipedia][broders]. WPA park posters: silkscreen in four or five flat colours with blocky shapes; Dorothy Waugh's park posters were largely abstract [S · Journal of Antiques and others][wpa]. A 2025 festival poster cut in lino by a local printmaker, and a forest-conference palette of rust, ochre, deep green and lime [S · People of Print, DesignRush][outsnip]. → `layers`, `linocut`, `contour`, `softscape`, `cyanotype`; `slab` / `stencil` outdoors, `editorial` / `deco` for travel, `humanist` / `flora` for nature. Contour maps and herbarium logic are [Syn].

**wellness.** Snippets only [S · agency blogs][wellsnip]: muted earth tones with a contrasting serif; sage and terracotta on cream with green-black text; high-saturation colour works against calm; and a designer's complaint that every retreat has a lotus, a muted palette and a whispering sans. → the working palette is kept, the symbol clichés are in `avoid`, and one concrete image (water, a bowl, a place) is preferred [Syn].

**city.** The Seoul Biennale's crossing lines [S · 서울시][sbau] and the festival brief against night-view composites [S · contest briefs][briefs]; window grids and layered haze from the earlier 3D notes. → the city's own graphics (`layers`, `mosaic`, `blueprint`, `neon`); `grotesk` / `condensed` / `signage`. Place names were removed from the keyword list on purpose.

**spring, summer, autumn, winter.** No source analysing seasonal poster colour opened; see rule 2. All [Syn].

**gaming.** G-STAR 2025 commissioned its key visual from the manhwa artist Moon Jung-hoo and applied it across halls, video and goods, aiming for a new one each year [S · 아이뉴스24][gstar]. Pentagram's Nuverse: fifty glossy 3D "player" shapes, saturated colour, an angled wordmark, deliberately theatrical rather than "techy" [R · It's Nice That][nuverse]. Vendor blogs agree on neon over dark and warn against setting everything in a pixel face [S · Creative Bloq, vendor blogs][gamesnip]. → `pixel`, `voxel`, `synthwave`, `glitch`; `arcade` / `bitmap` for the title only.

**retro.** Korean retro lettering as an established current since the late 2000s [R · 월간 디자인][retro-kr] (read for the earlier notes); its link to Kim Kijo's 2008 lettering for 장기하와 얼굴들 and to period revival fonts is from this session's search summary of the same page [S]; lo-fi and risograph trend signals in the earlier notes. The decade-discipline rule is [Syn]. The ban on rays from a disc is the skill's own rule.

**celebration, craft.** Celebration is [Syn], including the Korean taboos (white chrysanthemums, names in red). Craft: the Korea Craft Trend Fair's 2024 theme was 일상명품, craft as part of daily life [R · 월간 디자인][craft24]; 2025's was 손끝의 미학, and a 2021 edition was known for monotone visuals [S · 뉴시스, 헤이팝][craftsnip]. → material styles first (`ceramic`, `linocut`, `stitch`, `knit`, `wood`), natural-dye palettes, quiet type.

## Cross-topic rules

All **[Syn]** unless tagged.

### 1. Register (formal ↔ playful)

The same topic can be a gala or a picnic. Decide the register first; it overrides the topic's first-choice type theme.

| Register | Typical topics | Type voices | Layout | Colour | Style families |
|---|---|---|---|---|---|
| Ceremonial | finance, luxury, tradition, awards, institutional notices | `luxe` `didone` `garamond` `myeongjo` `elegant` `deco` | `center`, `corners`, `vertical`; frame allowed | ivory or near-black, one metal or one deep hue | engraved, stone, lacquer, ink |
| Professional | business, tech, science, architecture, higher education | `grotesk` `swiss` `plex` `humanist` `bold` | `left`, `band`, `corners` | two brand hues + neutrals | dots, glass, network, diagram |
| Editorial | art, culture, literature, film, design, craft | `editorial` `batang` `myeongjo` `grotesk` `brutal` `typewriter` | `corners`, `headline`, `vertical` | one or two inks, odd pairings | print and paint techniques |
| Energetic | music, nightlife, sports, gaming, summer, market, retro | `condensed` `impact` `wide` `brutal` `retro` `signage` `arcade` | `headline`, `baseline`, `strip` | maximum contrast, neon on black or ink on yellow | light, chrome, halftone, pixel |
| Warm | kids, family, community, food, spring, celebration | `pop` `jua` `friendly` `dodum` `hand` `marker` | `left`, `top`, `center` | three or four clear colours on a warm ground | toys, felt, paper, crayon |

- Move one row toward Ceremonial when the organiser is a ministry, bank, foundation or university, when the copy uses honorifics or 식 / 포럼 / 총회, or when there is a fee tier or dress code. Move toward Warm when the audience is named as 어린이 / 가족 / 주민 / 누구나.
- Formal does not mean centred and symmetrical; it means fewer sizes, wider margins and one accent. Playful does not mean more fonts; it means rounder forms, more colour and a hand-made image.
- Never cross more than one row from the topic's home (a bank's children's day is Warm type on Professional structure, not `pop` on confetti).

### 2. Seasonal colour

| Season (KR months) | Light | Ground | Accents | Texture | Not |
|---|---|---|---|---|---|
| Spring (3–5) | high-key, soft | pale pink, cream, yellow-green | blossom pink + new green; forsythia yellow + sky | watercolour, paper, thread | heavy black type; pastel on pastel |
| Summer (6–8) | hard, high contrast | white, lemon, aqua; navy at night | cobalt, coral, watermelon, mint | water, tile, gloss | pale spring pastels; rays from a sun disc |
| Autumn (9–11) | low and warm | cream, kraft, chestnut | maple red, persimmon, ginkgo gold, bark brown | lino, wood, wool, 한지 | cold blue-grey; Halloween props on 추석 |
| Winter (12–2) | clear, or dark with one warm light | snow white, ice blue; navy, charcoal | navy + one red; silver; candle gold | knit, felt, frost, bokeh | saturated red-plus-green; snowflake clip-art |

- A season is a modifier. Keep the main topic's style and type; take the palette from the season only when the topic has no strong colour code of its own (community, family, market, culture, music, general). For coded topics (finance, luxury, tech, tradition) change the accent at most.
- If the poster is *about* the season (벚꽃축제, 눈꽃축제), the season is the main topic and its own trio applies.
- Traditional theory maps colours to seasons differently — blue/east/spring, red/south/summer, white/west/autumn, black/north/winter [R · Korean Color Atlas][atlas] — which is a system of directions and elements, not of observed colour. Use it for 절기 and ritual subjects, not for a flower festival.
- Korean seasonal subjects to prefer over imported ones: 매화 · 개나리 · 진달래 · 벚꽃 (spring); 장마 · 수박 · 빙수 · 해수욕장 (summer); 단풍 · 은행 · 억새 · 감 (autumn); 첫눈 · 붕어빵 · 눈꽃 · 동지 (winter).

### 3. Korean traditional subjects

- **Sign system, not costume.** The strongest contemporary work puts one traditional sign into a modern frame — Typojanchi's crane and turtle on fluorescent colour [R · 월간 디자인][typojanchi] — and festival briefs ask for exactly that balance [S · contest briefs][briefs]. One motif, modern grid, wide margins.
- **Material maps to style.** 한지 → `paper` · 먹 → `sumuk`, `inkdrop` · 조각보 → `bojagi` · 자개 → `najeon` · 자수 → `stitch` · 목판 / 민화 → `linocut` · 백자 / 청자 → `ceramic` · 창살 / 결구 → `wood` · 연등 → `origami`. 단청 is a palette (`dancheong`), not a style.
- **Colour.** 오방색 pairs colours with directions — centre yellow, east blue, west white, south red, north black — and shows in 색동, 단청 and food garnish [S · 행복이 가득한 집][obang]. On a poster use one or two of them with 소색 (undyed white) or 먹 (ink black), never all five at full strength; the softer 오간색 and plant-dye colours (쪽빛, 치자, 옥색) read as more refined. The hex values in `topics.json` are approximations for screens [Syn]; the one colour reference that opened gives no hex values and warns against treating screen values as exact [R · Korean Color Atlas][atlas].
- **Type.** `myeongjo` or `batang` for the title, `brush` only for one short title, and a quiet sans or 명조 for information. A vertical title in one to three columns, read right to left; hanja at most as a single display character (earlier notes).
- **Occasions.** 설: white ground, 색동, red–blue pairs, 복주머니 colours. 추석: full moon as a plain disc, persimmon and chestnut browns. 단오: 창포 green and blue. 연등회: lantern pink and yellow on dusk blue. 한글날: the letters themselves (`glyph`).
- **Cautions.** No rays from a sun disc. Do not borrow Japanese crests, torii or red Chinese lanterns. Avoid funeral codes (white chrysanthemum, black ribbon, black-and-white portrait frame) and names written in red. A palace roofline or taegeuk used as decoration reads as tourist-office work.

### 4. Light, dark, quiet

- Every trio offers one of each because the three answer different doubts: *is it friendly?* (light), *is it an event?* (dark), *is it serious?* (quiet).
- Topics whose home is dark: nightlife, gaming, music at night, film, luxury, tech keynotes. Topics whose home is light: kids, family, community, education, spring, food, market, craft, wellness. Put the home tone first when presenting.
- The quiet poster is the one with the least chroma and the most empty space; it takes a serif, 명조 or light sans and usually the `corners`, `center` or `vertical` layout. It is the poster institutions choose.
- Mid-tone grounds (most pure reds, greens, mid-blues, greys) cannot give 7:1 with any ink. Keep them for the art, and choose grounds that are clearly light (yellow, pink, mint, cream) or clearly dark (navy, forest, burgundy, cobalt).
- A picture-filling style already supplies colour: pair it with calm type. A quiet style (`haze`, `wave`, `glyph`) can carry loud type. This restates the pairing rule in `styles.md`.

### 5. Two topics at once

The main topic (highest score, or the genre when a sector and a genre tie) chooses style and type; the second chooses palette or motif.

| Copy is about | Main → style, type | Second → palette, motif |
|---|---|---|
| 어린이 과학 체험 | kids → `voxel` / `toon`, `jua` | science → `deep-field`; motif rocket, planet |
| 여름 록 페스티벌 | music → `layers` / `halftone`, `condensed` | summer → `lemon-cobalt` or `summer-night` |
| 국악 콘서트 | tradition → `sumuk` / `najeon`, `myeongjo` | music → `headline` or `bottom` layout for the programme |
| 개발자 부트캠프 | education → `studio` / `isometric`, `bold` | tech → `signal` palette, mono labels |
| 전통시장 야시장 | market → `neon` / `linocut`, `signage` | tradition → `bojagi` awning motif, `hanji` palette |
| 금융 교육 강좌 | education → `isometric`, `humanist` | finance → `ledger` palette |
| 강변 야외 상영회 | film → `layers`, `condensed` | city + summer → `blue-hour`, riverside motif |
| 와인 디너 | luxury → `stone` / `ceramic`, `luxe` | food → `olive-night` palette |
| 숲 명상 리트릿 | wellness → `softscape` / `haze`, `flora` | nature → `moss` or `botanical` |
| 어린이 미술 전시 | art → `collage` / `crayon`, `friendly` | kids → `sky-primary` |
| 크리스마스 마켓 | market → `felt` / `paper`, `retro` | winter → `evergreen` or `candle` |
| 창립 20주년 기념식 | celebration → `stone` / `ribbon`, `deco` | the sector's palette (e.g. finance `vault`) |

When the second topic is a season, rule 2 applies. When it is `retro`, apply it to type and print texture and keep the main topic's motif.

### 6. Rules that hold for every topic

- **No icon of the topic as the hero.** Every `avoid` list begins with the clip-art a template would use (light bulbs, treble clefs, chef hats, lotus flowers). Show a material, a place or a phenomenon instead.
- **No sunburst** — rays or wedges radiating from a disc read as the Rising Sun flag. It is the default "retro", "summer", "celebration" and Art Deco device, so the temptation recurs; use a plain disc, arches, wavy stripes, checkerboards or stars.
- **One system, one sparkle.** One image idea, one accent, at most two typefaces; in celebration and nightlife, one kind of shine.
- **Display faces are for the title.** Pixel, brush, script, stencil and signboard faces set one line; information stays in a text face (and several Korean display fonts hold only 2,350 syllables — earlier notes).
- **The number can be the hero**: edition, date, distance, year — for series, sport, sales and anniversaries.
- **Information is still a table.** Whatever the topic, date, place, fee and sign-up sit as label–value rows under the headline; luxury and fashion shrink the copy, they do not hide the date.
- **Phone first.** The Korean poster's real infrastructure is now the smartphone, as Jude Kang argues [R · It's Nice That][viewseoul]; the motif must survive at thumbnail size, which favours one large form over many small ones.

## Sources

Read **[R]**:

- It's Nice That — [Config 2024][config] · [Sulki & Min][sulki] · [The View From Seoul][viewseoul] · [Everyday Practice][everyday] · [Bitnaneun's film posters][bitnaneun] · [Mina restaurant identity][mina] · [Pentagram's Nuverse][nuverse]
- AIGA Eye on Design — [conference branding (Strelka)][strelka] · [the legacy of clubbing on graphics][clubbed] · [what rave culture teaches designers][rave]
- 월간 디자인 — [조현열][cho] · [타이포잔치 2021][typojanchi] · [서울국제도서전][sibf] · [100 필름 100 포스터][100films] · [레트로 그래픽의 부상][retro-kr] · [2024 공예트렌드페어][craft24]
- Fonts In Use — [Co.Scienza Festival 2025][coscienza] · [BBC Philharmonic 2025/26][bbcphil]
- Creative Boom — [Goldsmiths campaign][goldsmiths] · [San Francisco Symphony][sfs]
- Studios, museums, fairs — [Studio Dumbar: Meta Connect][connect] · [Pentagram: Young V&A][youngva] · [Bologna Children's Book Fair: 2024 identity][bcbf] · [Staatliche Museen zu Berlin: 100 Best Posters 25][100bp25] · [Poster House: movie poster terms][posterhouse] · [Museum of Youth Culture: rave flyers][myc]
- Others — [Wallpaper*: line-up posters][wallpaper] · [Joe Delon: a typology of line-up posters][delon] · [Bandwagon: Jiyoon Lee interview][jiyoon] · [11:FS: finance design trends][11fs] · [디자인 나침반: Kapani Market][kapani] · [Made Good Designs: sports graphics][sportsmg] · [Wikipedia: Roger Broders][broders] · [Korean Color Atlas][atlas]

Search-summary only **[S]** (not opened, or opened without the detail needed):

- Tech, science, finance, education — [Mexico Tech Week redesign][mtw] · [Neon art and science festival][neonfest] · [finance branding blogs][finsnip] · [UAL and Essex brand pages][edusnip]
- Design, architecture, culture, tradition — [서울디자인페스티벌][sdf] · [CCA and Yale lecture posters][archsnip] · [서울도시건축비엔날레 2021][sbau] · [2026 festival poster briefs][briefs] · [국악공연 포스터 레이아웃 연구][gugak] · [오방색][obang]
- Music, film, fashion, luxury, beauty — [orchestra identities][orchsnip] · [국제영화제 포스터 70종 분석][iffstudy] · [The Guardian on comedy posters][guardian] · [luxury and beauty type pages][luxsnip]
- Food, sports, outdoor, wellness, gaming, craft — [restaurant branding trends][foodsnip] · [Korean running events][runsnip] · [WPA park posters][wpa] · [linocut festival poster and forest palette][outsnip] · [wellness branding][wellsnip] · [지스타 2025 키비주얼][gstar] · [The Game Awards and esports type][gamesnip] · [공예트렌드페어 2025, 2021][craftsnip]

Link targets (name and URL for every source above):

[config]: https://itsnicethat.com/features/figma-config-2024-identity-graphic-design-spotlight-090724 "It's Nice That — How Figma built the identity for Config 2024"
[connect]: https://studiodumbar.com/work/meta-connect "Studio Dumbar — Meta Connect visual identity"
[strelka]: https://eyeondesign.aiga.org/is-this-the-future-of-conference-branding/ "AIGA Eye on Design — Is this the future of conference branding?"
[coscienza]: https://fontsinuse.com/uses/71785/co-scienza-festival-2025 "Fonts In Use — Co.Scienza Festival 2025"
[11fs]: https://www.11fs.com/article/the-2022-design-trends-that-will-make-a-mark-on-financial-services "11:FS — design trends in financial services"
[goldsmiths]: https://www.creativeboom.com/work/baxter-and-bailey-help-goldsmiths-university-of-london-to-attract-the-brightest-and-best/ "Creative Boom — Baxter & Bailey for Goldsmiths"
[sulki]: https://www.itsnicethat.com/articles/sulki-and-min-overrated-creative-freedom-graphic-design-251018 "It's Nice That — Sulki & Min (read for the earlier layout notes)"
[cho]: https://design.co.kr/article/16397/ "월간 디자인 — 글자 디자인으로 모든 걸 말하다, 조현열"
[typojanchi]: https://design.co.kr/article/19338/ "월간 디자인 — 타이포잔치 2021 〈거북이와 두루미〉"
[100bp25]: https://www.smb.museum/en/exhibitions/detail/100-best-posters-25-germany-austria-switzerland "Staatliche Museen zu Berlin — 100 Best Posters 25"
[viewseoul]: https://itsnicethat.com/articles/the-view-from-seoul-korean-poster-archive-graphic-design-170924 "It's Nice That — The View From Seoul: Korean poster design"
[everyday]: https://itsnicethat.com/articles/everyday-practice-designing-for-all-aspects-of-korean-culture-graphic-design-080119 "It's Nice That — Everyday Practice"
[sibf]: https://design.co.kr/article/22750/ "월간 디자인 — 서울국제도서전"
[wallpaper]: https://www.wallpaper.com/art/why-are-festival-line-up-poster-designs-getting-so-hard-to-read "Wallpaper* — festival line-up poster designs"
[delon]: https://buttondown.com/joedelon/archive/festival-lineup-posters-a-typology "Joe Delon — Festival lineup posters: a typology"
[jiyoon]: https://www.bandwagon.asia/articles/jiyoon-lee-studio-xxx-6-k-pop-art-design-bts-kang-daniel-loona-shinee-taemin-txt-tomorrow-x-together-taeyeon-interview-2021 "Bandwagon — interview with K-pop designer Jiyoon Lee"
[sfs]: https://www.creativeboom.com/work/collins-creates-new-san-francisco-symphony-branding-to-affirm-that-classical-music-is-relevant/ "Creative Boom — COLLINS for the San Francisco Symphony"
[bbcphil]: https://fontsinuse.com/uses/79294/bbc-philharmonic-orchestra-2025-26 "Fonts In Use — BBC Philharmonic 2025/26"
[clubbed]: https://eyeondesign.aiga.org/acid-house-swiss-modernism-the-legacy-of-clubbing-on-graphics/ "AIGA Eye on Design — the legacy of clubbing on graphics (Rick Banks, Clubbed)"
[rave]: https://eyeondesign.aiga.org/what-rave-culture-is-teaching-modern-graphic-designers/ "AIGA Eye on Design — what rave culture is teaching modern graphic designers"
[myc]: https://museumofyouthculture.com/design-of-rave-in-underground-flyers "Museum of Youth Culture — the design of rave in underground flyers"
[posterhouse]: https://access.posterhouse.org/?p=1926 "Poster House — A Little Book of Movie Poster Terms"
[bitnaneun]: https://www.itsnicethat.com/articles/siyoung-park-bitnaneun-mid90s-maggie-graphic-design-251019 "It's Nice That — Bitnaneun's Siyoung Park on film posters"
[100films]: https://design.co.kr/article/163108/ "월간 디자인 — 〈100 필름 100 포스터〉전"
[mina]: https://itsnicethat.com/articles/davy-denduyver-mina-graphic-design-project-040225 "It's Nice That — Davy Denduyver's Mina restaurant identity"
[kapani]: https://designcompass.org/project/kapani-market/ "디자인 나침반 — Kapani Market"
[bcbf]: https://bolognachildrensbookfair.com/en/about/visual-identity/2024-backstage/13066.html "Bologna Children's Book Fair — visual identity 2024 backstage"
[youngva]: https://www.pentagram.com/work/young-v-and-a/story "Pentagram — Young V&A"
[sportsmg]: https://madegooddesigns.com/sports-graphic-design/ "Made Good Designs — sports graphic design"
[broders]: https://en.wikipedia.org/wiki/Roger_Broders "Wikipedia — Roger Broders"
[nuverse]: https://www.itsnicethat.com/news/hudson-powell-pentagram-nuverse-identity-graphic-design-180321 "It's Nice That — Pentagram's Nuverse identity"
[retro-kr]: https://design.co.kr/article/28138/ "월간 디자인 — 레트로 그래픽의 부상 (read for the earlier layout notes)"
[craft24]: https://design.co.kr/article/36481/ "월간 디자인 — 2024 공예트렌드페어"
[atlas]: https://korean-color-atlas.pages.dev/ "Korean Color Atlas — the five cardinal colours (no hex values)"
[mtw]: https://contra.com/p/3WL7cXrv-visual-identity-redesign-for-mexico-tech-week "Contra — Mexico Tech Week identity redesign"
[neonfest]: https://samgorecki44.myportfolio.com/neon-art-and-science-festival "Portfolio — Neon art and science festival"
[finsnip]: https://kota.co.uk/blog/5-finance-brands-that-ditched-corporate-design-and-won/ "Kota and other agency blogs on finance branding"
[edusnip]: https://www.arts.ac.uk/brand/how-we-look "UAL brand pages; University of Essex visual style"
[sdf]: https://ditoday.com/?p=34545 "DI Today — 제18회 서울디자인페스티벌"
[archsnip]: https://a-g-i.org/design/fall-2012-cca-architecture-lecture-series "AGI — CCA architecture lecture series posters; Yale printer blog"
[sbau]: https://news.seoul.go.kr/citybuild/archives/512412 "서울시 — 제3회 서울도시건축비엔날레 포스터"
[briefs]: https://thinkyou.co.kr/contest/64258/ "공모전 공고 — 2026 진주남강유등축제, 동편제국악축제 포스터"
[gugak]: https://vufind.katalog.k.utb.cz/SummonRecord/FETCH-LOGICAL-k849-e5f207f83d85173b8511eb71332e540c8156ae1cc74b01c9637e4941e16aab0d3 "Catalogue record — 한국 국악공연 포스터의 레이아웃 유형 분석 연구 (2017–2020 국립국악원 독주회)"
[obang]: https://happy.designhouse.co.kr/magazine/magazine_view/00010005/2374 "행복이 가득한 집 — 오방색"
[orchsnip]: https://www.red-dot.org/project/philharmonic-orchestra-bielefeld-16199-16196 "Red Dot — Bielefeld Philharmonic posters; Thonik; LSO 2018/19"
[iffstudy]: https://www.earticle.net/Article/A387691 "earticle — 국내 3대 국제영화제 포스터 70종 분석"
[guardian]: https://www.theguardian.com/film/2022/may/09/scarlet-ohaha-why-do-film-posters-for-comedies-always-have-huge-red-letters "The Guardian — why comedy posters have huge red letters (blocked)"
[luxsnip]: https://www.designrush.com/best-designs/print/brunello-cucinelli-print-design "DesignRush — Brunello Cucinelli print; font-vendor pages on luxury and beauty type"
[gamesnip]: https://www.creativebloq.com/design/logos-icons/the-new-game-awards-logo-shows-less-can-be-a-lot-more "Creative Bloq — The Game Awards identity; esports font blogs"
[foodsnip]: https://modernrestaurantmanagement.com/biting-into-branding-restaurant-design-trends-for-2025/ "Modern Restaurant Management — restaurant branding trends 2025"
[runsnip]: https://www.careet.net/1984 "Careet and others — Korean running-event marketing"
[wpa]: https://journalofantiques.com/digital-publications/joac-magazine/features/the-significance-and-nostalgia-of-the-wpa-national-park-posters/ "Journal of Antiques — WPA national park posters; Poster House on Dorothy Waugh"
[outsnip]: https://peopleofprint.com/?p=89628 "People of Print — linocut festival poster; DesignRush — Into the Woods conference"
[wellsnip]: https://www.ebaqdesign.com/blog/wellness-branding "Agency and vendor pages on wellness branding"
[gstar]: https://www.inews24.com/view/wrlted/1888169 "아이뉴스24 and others — 지스타 2025 키비주얼"
[craftsnip]: https://mobile.newsis.com/view/NISX20251211_0003436728 "뉴시스 — 2025 공예트렌드페어; 헤이팝 — 2021 edition"

## Pages that would not open

- MAK press release on *100 Beste Plakate 24* (PDF returned as binary); a search summary says it notes hand-drawn lettering beside digital fonts and visible AI use [S].
- Poster House on Dorothy Waugh, Type Magazine on the WPA style, a Graphis blog post on Platinum winners, and the gugak layout study record (all HTTP 404).
- The Guardian (fetch blocked) and Design Week on IBM TechXchange (403).
- Tokyo TDC: results pages list winners without design commentary; recent grand prizes went to branding, animation and type design, not posters [S], so nothing was drawn from it.
- Graphis Poster Annual: winner lists only, no subject categories or commentary [S].
- Korean sources that returned no usable description of the work itself: Seoul Fashion Week key visual, 공예주간, seasonal festival posters (벚꽃 · 단풍 · 눈꽃), marathon key visuals, Marché@ and 밤도깨비야시장, children's museum identities. typographyseoul.com, studio fnt, Workroom, Shin Shin, Ordinary People and Jaemin Lee were not searched again — what the earlier notes hold on them was reused.
- Many search results for sports, luxury, wellness and gaming type were auto-generated font-vendor pages; they are cited only as [S] and only where several agreed.
