# Style catalogue

A poster is three independent choices plus a palette:

- **style** — the art technique (this file, first half): a folder in `assets/styles/<id>/` with
  `style.json` (engine, motifs, palettes, parameters, defaults) and a scene file. A style is a
  medium — paper cut, linocut, felt, neon tubing — and what it depicts is its **motif**.
- **type** — the typography theme (`assets/themes/<id>.css`): typefaces, weights, spacing, decoration.
- **layout** — where copy and art sit (`spec.md` → Layouts).

There are 77 styles and 67 type themes. `node scripts/poster.mjs --list-styles`
prints the live list, including custom styles.

## Contents
- [Choosing three](#choosing-three) · [By topic](#by-topic)
- [Styles by family](#styles-by-family)
- [Every style](#every-style): [papercut](#papercut) · [emboss](#emboss) · [collage](#collage) · [bojagi](#bojagi) · [najeon](#najeon) · [stitch](#stitch) · [mosaic](#mosaic) · [stainedglass](#stainedglass) · [paper](#paper) · [origami](#origami) · [halftone](#halftone) · [linocut](#linocut) · [gouache](#gouache) · [crayon](#crayon) · [watercolor](#watercolor) · [sumuk](#sumuk) · [cyanotype](#cyanotype) · [marble](#marble) · [layers](#layers) · [airbrush](#airbrush) · [bauhaus](#bauhaus) · [memphis](#memphis) · [opart](#opart) · [artdeco](#artdeco) · [guilloche](#guilloche) · [contour](#contour) · [flowfield](#flowfield) · [wave](#wave) · [haze](#haze) · [glyph](#glyph) · [flux](#flux) · [plexus](#plexus) · [globe](#globe) · [pointcloud](#pointcloud) · [blueprint](#blueprint) · [synthwave](#synthwave) · [glitch](#glitch) · [pixel](#pixel) · [bokeh](#bokeh) · [caustics](#caustics) · [fluted](#fluted) · [inkdrop](#inkdrop) · [liquid](#liquid) · [aurora](#aurora) · [ribbon](#ribbon) · [turing](#turing) · [numerals](#numerals) · [calendar](#calendar) · [swiss](#swiss) · [ticket](#ticket) · [stamp](#stamp) · [transit](#transit) · [stickers](#stickers) · [screen](#screen) · [marquee](#marquee) · [pattern](#pattern) · [studio](#studio) · [puffy](#puffy) · [felt](#felt) · [knit](#knit) · [jelly](#jelly) · [wood](#wood) · [softscape](#softscape) · [prism](#prism) · [chrome](#chrome) · [glass](#glass) · [foil](#foil) · [metal](#metal) · [stone](#stone) · [ceramic](#ceramic) · [neon](#neon) · [monolith](#monolith) · [fabric](#fabric) · [toon](#toon) · [lowpoly](#lowpoly) · [isometric](#isometric) · [voxel](#voxel)
- [Type themes](#type-themes)
- [Pairing type with style](#pairing-type-with-style)
- [Varying a poster](#varying-a-poster)

## Choosing three

A set of posters should give the user a real choice: change the **style**, the **type theme** and the
**layout** between posters, not only the colour. A reliable recipe is one bright and friendly, one
dark or dramatic, one quiet and editorial — from three different families of technique: say a craft
or a print, a generative or light piece, and a typographic poster made from the copy.

The set is drawn with three.js and HTML styles unless the user asks for Blender ("블렌더 사용해서", or a
3D material by name); then all three posters are Blender styles, on their own or on a ground
(`SKILL.md`, step 3).

Start from the subject. `node scripts/poster.mjs spec.json --suggest` reads the copy, names its
topics and prints fitting posters with the reason for each (add `--blender` for the Blender set);
`"styles": "auto"` renders the first three. Then use your own judgement: the suggestion knows the topic words, not the client.

Within a style, pick the **motif** that matches the subject (`"motif": "city"`): the same linocut
can show hills for a hiking club and rooftops for a neighbourhood market.

## By topic

What the topic guide (`assets/topics.json`, explained in `topic-guide.md`) recommends, best first.
The automatic choice draws on the first column; the Blender column is used only when the user asks for Blender.

| Topic | three.js and HTML styles (the default set) | Blender styles (on request) | Type themes |
|---|---|---|---|
| tech | `flux` · `plexus` · `flowfield` · `swiss` · `pointcloud` · `screen` · `transit` | `glass` · `studio` · `isometric` · `prism` | `techno` · `plex` · `grotesk` · `dream` · `impact` |
| science | `turing` · `flowfield` · `airbrush` · `pointcloud` · `swiss` · `cyanotype` · `contour` | `prism` | `plex` · `swiss` · `grotesk` · `techno` · `elegant` |
| business | `wave` · `swiss` · `globe` · `emboss` · `transit` · `flowfield` · `numerals` | `glass` · `studio` · `isometric` · `metal` | `swiss` · `grotesk` · `paperlogy` · `bold` · `dream` |
| finance | `guilloche` · `emboss` · `wave` · `globe` · `numerals` · `contour` · `marble` | `stone` · `glass` · `prism` · `metal` | `elegant` · `garamond` · `swiss` · `didone` · `grotesk` |
| education | `bauhaus` · `swiss` · `crayon` · `calendar` · `transit` · `gouache` · `numerals` | `studio` · `origami` · `isometric` · `paper` | `bold` · `paperlogy` · `friendly` · `gmarket` · `round` |
| design | `bauhaus` · `swiss` · `glyph` · `flowfield` · `opart` · `fluted` · `numerals` | `studio` · `glass` · `origami` · `monolith` | `grotesk` · `swiss` · `brutal` · `geometric` · `slim` |
| architecture | `blueprint` · `swiss` · `bauhaus` · `transit` · `fluted` · `contour` · `pattern` | `monolith` · `isometric` · `stone` · `glass` | `grotesk` · `swiss` · `stencil` · `geometric` · `slim` |
| art | `collage` · `gouache` · `halftone` · `flowfield` · `inkdrop` · `swiss` · `watercolor` | `monolith` · `ceramic` | `editorial` · `grotesk` · `brutal` · `swiss` · `didone` |
| culture | `halftone` · `collage` · `papercut` · `swiss` · `gouache` · `stamp` · `haze` | `paper` · `monolith` | `editorial` · `myeongjo` · `bold` · `maru` · `classic` |
| tradition | `sumuk` · `bojagi` · `najeon` · `stitch` · `linocut` · `watercolor` · `calendar` | `paper` · `ceramic` · `wood` · `origami` | `myeongjo` · `brush` · `calli` · `batang` · `editorial` |
| literature | `watercolor` · `sumuk` · `stamp` · `glyph` · `papercut` · `emboss` · `linocut` | `paper` · `monolith` | `batang` · `myeongjo` · `maru` · `garamond` · `story` |
| music | `flux` · `swiss` · `halftone` · `liquid` · `flowfield` · `ticket` · `fluted` | `chrome` · `neon` | `impact` · `condensed` · `dream` · `brutal` · `wide` |
| nightlife | `flux` · `fluted` · `liquid` · `ticket` · `glitch` · `marquee` · `synthwave` | `chrome` · `neon` · `foil` · `jelly` | `brutal` · `wide` · `techno` · `outline` · `impact` |
| film | `layers` · `halftone` · `bokeh` · `ticket` · `haze` · `collage` · `swiss` | `neon` · `softscape` | `condensed` · `classic` · `editorial` · `didone` · `typewriter` |
| fashion | `emboss` · `fluted` · `ribbon` · `marquee` · `haze` · `numerals` · `inkdrop` | `chrome` · `monolith` · `foil` · `stone` | `didone` · `luxe` · `wide` · `grotesk` · `editorial` |
| luxury | `emboss` · `marble` · `artdeco` · `fluted` · `najeon` · `ribbon` · `guilloche` | `stone` · `prism` · `monolith` · `metal` | `luxe` · `didone` · `garamond` · `elegant` · `deco` |
| beauty | `inkdrop` · `fluted` · `ribbon` · `emboss` · `marble` · `caustics` · `aurora` | `jelly` · `glass` · `stone` · `foil` | `luxe` · `didone` · `elegant` · `flora` · `humanist` |
| food | `linocut` · `crayon` · `gouache` · `halftone` · `ticket` · `pattern` · `watercolor` | `ceramic` · `toon` · `jelly` · `paper` | `signage` · `euljiro` · `retro` · `classic` · `yeonsung` |
| market | `halftone` · `collage` · `linocut` · `pattern` · `gouache` · `transit` · `stamp` | `puffy` · `paper` · `toon` · `isometric` | `euljiro` · `retro` · `signage` · `jalnan` · `pop` |
| kids | `gouache` · `papercut` · `stickers` · `crayon` · `pattern` · `memphis` | `puffy` · `felt` · `toon` · `paper` | `pop` · `maple` · `jua` · `ssurround` · `dongle` |
| family | `papercut` · `gouache` · `stickers` · `watercolor` · `crayon` · `calendar` · `layers` | `softscape` · `paper` · `felt` · `puffy` | `friendly` · `dodum` · `maple` · `round` · `ssurround` |
| community | `crayon` · `papercut` · `transit` · `calendar` · `gouache` · `collage` · `stamp` | `paper` · `isometric` · `felt` · `toon` | `friendly` · `gmarket` · `hand` · `starlight` · `round` |
| sports | `flux` · `halftone` · `marquee` · `flowfield` · `numerals` · `glitch` · `contour` | `metal` · `lowpoly` · `toon` · `chrome` | `esamanru` · `condensed` · `jalnan` · `impact` · `wide` |
| outdoor | `contour` · `layers` · `papercut` · `linocut` · `cyanotype` · `watercolor` · `stitch` | `lowpoly` · `softscape` · `paper` · `wood` | `slab` · `stencil` · `condensed` · `humanist` · `esamanru` |
| travel | `layers` · `stamp` · `papercut` · `transit` · `ticket` · `gouache` · `globe` | `softscape` · `paper` · `isometric` · `lowpoly` | `editorial` · `deco` · `jalnan` · `humanist` · `retro` |
| nature | `cyanotype` · `papercut` · `linocut` · `watercolor` · `turing` · `layers` · `flowfield` | `paper` · `wood` · `softscape` · `felt` | `humanist` · `flora` · `editorial` · `garamond` · `batang` |
| wellness | `haze` · `papercut` · `fluted` · `caustics` · `sumuk` · `flowfield` · `watercolor` | `softscape` · `ceramic` · `monolith` · `glass` | `elegant` · `flora` · `humanist` · `garamond` · `batang` |
| city | `layers` · `transit` · `mosaic` · `bokeh` · `blueprint` · `marquee` · `flowfield` | `isometric` · `neon` · `voxel` · `lowpoly` | `grotesk` · `condensed` · `signage` · `gmarket` · `swiss` |
| spring | `watercolor` · `papercut` · `gouache` · `stitch` · `crayon` · `pattern` · `aurora` | `paper` · `softscape` · `felt` · `origami` | `flora` · `pen` · `goun` · `dodum` · `melody` |
| summer | `caustics` · `gouache` · `layers` · `fluted` · `liquid` · `pattern` · `mosaic` | `jelly` · `softscape` · `puffy` · `paper` | `pop` · `jalnan` · `wide` · `ssurround` · `bold` |
| autumn | `linocut` · `layers` · `papercut` · `sumuk` · `stamp` · `watercolor` · `stitch` | `paper` · `wood` · `knit` · `felt` | `myeongjo` · `batang` · `garamond` · `maru` · `slab` |
| winter | `bokeh` · `papercut` · `stainedglass` · `stamp` · `layers` · `calendar` · `sumuk` | `knit` · `felt` · `paper` · `softscape` | `elegant` · `didone` · `myeongjo` · `calli` · `goun` |
| gaming | `pixel` · `glitch` · `synthwave` · `screen` · `flux` · `stickers` · `airbrush` | `voxel` · `lowpoly` · `neon` · `isometric` | `arcade` · `dunggeunmo` · `bitmap` · `maple` · `techno` |
| retro | `halftone` · `synthwave` · `memphis` · `pattern` · `airbrush` · `pixel` · `liquid` | `neon` · `chrome` | `retro` · `classic` · `euljiro` · `signage` · `deco` |
| celebration | `emboss` · `bokeh` · `stickers` · `ribbon` · `artdeco` · `stamp` · `calendar` | `foil` · `puffy` · `paper` · `origami` | `deco` · `luxe` · `jalnan` · `pop` · `anemone` |
| craft | `papercut` · `stitch` · `gouache` · `stamp` · `linocut` · `bojagi` · `stickers` | `ceramic` · `wood` · `knit` · `felt` | `hand` · `pen` · `kkubulim` · `story` · `goun` |
| general | `haze` · `papercut` · `swiss` · `aurora` · `fluted` · `flowfield` · `numerals` | `studio` · `paper` · `glass` · `softscape` | `bold` · `gmarket` · `swiss` · `paperlogy` · `editorial` |

A Blender style named in a spec is swapped for its `fallback` when Blender is missing.
When the user wants the same subject in every poster, keep one style (or one custom scene) and vary
motif, type theme, palette and layout instead.

## Styles by family

The first five families are drawn with three.js and HTML and make up the default set. The last
three, and `paper` and `origami`, are Blender styles: used only when the user asks for Blender.

**Paper and craft**

| Style | Engine | Technique | Motifs |
|---|---|---|---|
| [`papercut`](#papercut) | three.js | a full picture — stacked sheets of heavy coloured paper, each cut with a knife and laid over the next under one soft lamp from the upper left: every… | strata, tide, canopy |
| [`emboss`](#emboss) | three.js | blind embossing on heavyweight cotton paper — no ink in the picture, only the sheet raised or sunk by a die and read by one raking light from the… | monogram, pattern, crest |
| [`collage`](#collage) | three.js | cut and torn paper pasted up by hand — coloured stocks, a scrap of halftone print, graph paper and newsprint layered with soft shadows, torn edges… | abstract, landscape, city |
| [`bojagi`](#bojagi) | three.js | a Korean patchwork wrapping cloth held up to the light — irregular pieces of translucent ramie and silk gauze, every seam a darker line where the… | patchwork, window, landscape |
| [`najeon`](#najeon) | three.js | Korean mother-of-pearl inlay on polished lacquer — cut shell feathers and petals, snapped strips and crackled fragments that shimmer pink, green and… | cranes, blossom, lattice, waves |
| [`stitch`](#stitch) | three.js | hand embroidery on woven cloth — satin and long-and-short stitch with a silk sheen, fishbone leaves, stem-stitch stalks, French knots and… | flowers, sampler, borders |
| [`mosaic`](#mosaic) | three.js | a wall of small hand-cut tiles in grout — courses of tesserae that follow the forms of the design (rings round a disc, rows riding each wave, three… | waves, arches, bands |
| [`stainedglass`](#stainedglass) | three.js | a leaded stained-glass window glowing in a plain wall — hand-cut pieces of streaky coloured glass, dark lead cames meeting in T-joints, a border… | landscape, flowers, geometric |
| [`paper`](#paper) | Blender | calm, crafted, seasonal — a layered cut-paper diorama (hills or waves, a pale sun or a moon with paper halo rings, little clouds and pines) seen… | — |
| [`origami`](#origami) | Blender | folded paper — crisp creased forms with paper grain, a coloured face and a pale reverse, under one soft top light with clean contact shadows; light,… | cranes, boats, peaks, relief |

**Print and paint**

| Style | Engine | Technique | Motifs |
|---|---|---|---|
| [`halftone`](#halftone) | three.js | tactile, lo-fi, independent — big overlapping spheres printed as halftone dot screens in two or three spot inks, slightly out of register, on paper | — |
| [`linocut`](#linocut) | three.js | hand-carved and bold — a relief print pulled from a lino block: flat fields of ink, tapering white gouge marks, starved ink and up to three colours… | hills, waves, botanical, rooftops |
| [`gouache`](#gouache) | three.js | paper painted flat with gouache, cut freehand with scissors and pinned up — three to six panels of saturated matte colour with hairlines of page… | fronds, still, shore |
| [`crayon`](#crayon) | three.js | warm, naive and hand-made — wax crayon / oil pastel on toothy paper: bold shapes coloured in with back-and-forth strokes, the paper sparkling… | landscape, stilllife, city, scribble |
| [`watercolor`](#watercolor) | three.js | hand-made and quiet — translucent, overlapping watercolour washes on paper with pooled edges, a few fine parallel pen lines and plenty of bare sheet… | — |
| [`sumuk`](#sumuk) | three.js | still and spacious — East Asian ink wash on hanji: wet washes thinning into mist, dry-brush strokes with the paper showing through, a vermilion seal… | mountains, bamboo, plum, strokes |
| [`cyanotype`](#cyanotype) | three.js | a sun print on watercolour paper — pressed ferns and leaves, glass, lace or cut paper laid on a brush-coated sheet and left in the sun, printing… | botanical, objects, shapes, algae |
| [`marble`](#marble) | three.js | a full picture — a flow painting like paper marbling or a paint pour: rings of pigment bent into veins and pools, edged with fine gilded hairlines,… | — |
| [`layers`](#layers) | three.js | flat layered illustration — receding silhouettes cut from flat colour and softened by haze, in the manner of a screen-printed travel poster; the… | mountains, sea, city |
| [`airbrush`](#airbrush) | three.js | retro science-fiction airbrush — soft sprayed gradients, fine grain and glowing rims, as on 1970s paperback covers: a ringed planet in a star field,… | planet, moons, orbits |

**Graphic systems**

| Style | Engine | Technique | Motifs |
|---|---|---|---|
| [`bauhaus`](#bauhaus) | three.js | flat, crisp, playful-but-ordered — a tidy grid of square tiles filled with circles, quarter-circles, arches, stripes and dots in a few flat colours,… | — |
| [`memphis`](#memphis) | three.js | 1980s Memphis Group graphics — candy-coloured solids filled with dots, stripes, grids and terrazzo chips, squiggles, zigzags and confetti triangles,… | confetti, stack, totem |
| [`opart`](#opart) | three.js | optical art — hard-edged stripes, checks or dot grids printed on a sheet that bulges, ripples or folds, so a flat two- or three-colour print seems to… | sphere, wave, fold |
| [`artdeco`](#artdeco) | three.js | art-deco ornament in metallic line and flat colour — stepped skyscraper silhouettes, nested arches, chevrons and fish-scale fields drawn in fine… | tower, arch, scallop |
| [`guilloche`](#guilloche) | three.js | banknote and certificate engraving — hundreds of even hairlines in one or two inks braided into rope-like ribbons, interlaced rosette rings round a… | ribbon, medallion, frame |
| [`contour`](#contour) | three.js | topographic line drawing — even-width isolines of a height field with heavier index lines, one or two flat tint bands, spot heights and survey marks;… | mountain, coast, peak |
| [`flowfield`](#flowfield) | three.js | generative plotter print — flat matte bands of two or three inks that follow an invisible flow field, each curving beside its neighbours without… | bands, threads, eddy |
| [`wave`](#wave) | three.js | calm, precise, minimal — a field of dots rolling like terrain or sound, lots of white space | — |
| [`haze`](#haze) | three.js | quiet, atmospheric, type-first — large soft orbs of colour pooling around the copy and dissolving into a flat ground, with one or two hairline… | — |
| [`glyph`](#glyph) | three.js | typographic art — the picture is made of letterforms: a giant character cropped by its column with a second one overprinted, a type-specimen grid of… | giant, grid, echo |

**Digital, light and motion**

| Style | Engine | Technique | Motifs |
|---|---|---|---|
| [`flux`](#flux) | three.js | dark, electric, high-energy — thousands of glowing light trails swirling through a flow field | — |
| [`plexus`](#plexus) | three.js | network drawing — evenly spaced nodes joined to their neighbours by hairlines so that a form (sphere, torus, flowing sheet, constellation) reads as a… | sphere, torus, wave, constellation |
| [`globe`](#globe) | three.js | global, connected, precise — a globe drawn in evenly spaced dots, with glowing nodes joined by great-circle arcs, thin orbit rings and a rim of light | — |
| [`pointcloud`](#pointcloud) | three.js | a form drawn only with dots — a surface sampled into tens of thousands of points whose size and density follow the light: ink stippling like an… | knot, terrain, vase, shell |
| [`blueprint`](#blueprint) | three.js | technical drawing — an isometric line drawing of a solid model on blueprint paper: heavy outlines, light inner edges, dashed hidden lines, dimension… | tower, gear, rocket, chair |
| [`synthwave`](#synthwave) | three.js | the 1980s retro-future as a full picture — a neon grid in true perspective to a glowing horizon, a big sun cut by horizontal slits, chrome-faceted… | sun, city, canyon |
| [`glitch`](#glitch) | three.js | CRT / VHS / datamosh — a simple, strong subject broken like a damaged video signal: pixel-sorted rows dragged into smears, slipped macroblocks,… | solids, horizon, shapes |
| [`pixel`](#pixel) | three.js | retro computing — a lit still life of chunky primitives on a checkerboard slab in front of a pin-striped desktop window, printed in three to five… | — |
| [`bokeh`](#bokeh) | three.js | out-of-focus photography — lights thrown into soft discs of several sizes with real lens character (brighter rims, colour fringes, cat's-eye discs… | city, string, lantern, glitter |
| [`caustics`](#caustics) | three.js | sunlit water seen from above — bright caustic nets of refracted light rippling over a pool floor, sand or a plain ground, with gentle colour fringes,… | pool, sand, gel |
| [`fluted`](#fluted) | three.js | a pane of reeded glass standing in front of soft coloured light — every rib is a small cylindrical lens that squeezes and flips the slice of picture… | orb, dusk, bloom |
| [`inkdrop`](#inkdrop) | three.js | high-speed ink photography — pigment blooming in clear water: translucent bells and veils rolled up by a real fluid simulation, their edges gathering… | plume, drop, duet, band |
| [`liquid`](#liquid) | three.js | liquid-gradient 3D — lava-lamp metaballs that melt into one another, a colour gradient flowing through the form, a luminous rim, satin or glossy… | mass, rise, wave, drip |
| [`aurora`](#aurora) | three.js | bright, friendly, modern — a pearly liquid blob floating on a soft colour-mesh gradient | — |
| [`ribbon`](#ribbon) | three.js | elegant, glossy, premium — one continuous band of satin colour twisting through space like a sculpture, with a soft pool of light behind it | — |
| [`turing`](#turing) | three.js | an organic print — a Gray–Scott reaction–diffusion pattern embossed like letterpress: an irregular drift of combed stripes (wood grain, fingerprint)… | — |

**Type and vector graphics (HTML)**

| Style | Engine | Technique | Motifs |
|---|---|---|---|
| [`numerals`](#numerals) | HTML | the date as the image — the month and the day of the event set enormous, together, in the poster's own display face, captioned with the year, the… | date, stack, words |
| [`calendar`](#calendar) | HTML | the date shown on a calendar — a month sheet set in fine rules and numerals with the event day marked by a filled disc (a run of days by a capped… | month, tearoff, week |
| [`swiss`](#swiss) | HTML | one abstract geometric figure built by a single stated rule, in black and one signal colour on a plain sheet, in the manner of the Swiss concert and… | arcs, bars, dots, diagonal |
| [`ticket`](#ticket) | HTML | printed ephemera carrying the event's information — an admission ticket with notched ends, a perforated stub printed in a second ink, the headline in… | admit, pass, receipt |
| [`stamp`](#stamp) | HTML | the event as a piece of post — a large postage stamp with perforated edges, a paper border and a hairline frame, a small flat vignette in two or… | single, sheet, airmail |
| [`transit`](#transit) | HTML | the place of the event drawn as a diagram — a metro map in the modernist manner: thick lines in a few flat colours that run only horizontally,… | metro, route, blocks |
| [`stickers`](#stickers) | HTML | die-cut vinyl stickers stuck on a laptop lid or a notebook cover — flat colour shapes with a thick die-cut border in the page's lightest colour and a… | badges, labels, letters |
| [`screen`](#screen) | HTML | a flat, generic user-interface mock-up as the picture — overlapping desktop windows with plain title bars, a message thread, a music-player card or a… | windows, chat, player, search |
| [`marquee`](#marquee) | HTML | type as texture — the poster's own headline repeated end to end in rows that fill the free part of the page and run off its edge, set in the poster's… | rows, tilt, tape, steps |
| [`pattern`](#pattern) | HTML | a flat vector repeat pattern — a checkerboard (straight or gently warped), wavy stripes of even width, a dot grid that thins out towards the copy,… | checker, stripes, dots, terrazzo, arches, grid |

**Soft and tactile 3D**

| Style | Engine | Technique | Motifs |
|---|---|---|---|
| [`studio`](#studio) | Blender | warm, polished, optimistic — a path-traced still life of soft 3D shapes (clay, gloss, glass, metal) floating in front of a pastel wall | — |
| [`puffy`](#puffy) | Blender | kitsch, pop, sweet — puffy inflated shapes (star, heart, flower, cloud, ring, pill, a smiling ball) in glossy vinyl candy colours, floating and… | — |
| [`felt`](#felt) | Blender | needle-felted wool — soft, slightly lumpy forms with a halo of loose fibres, standing on a sheet of felt in the poster's colour under a big soft… | hills, fruit, pebbles |
| [`knit`](#knit) | Blender | chunky hand-knitted wool — every stitch is real yarn looped along the form: stockinette, ribbing, garter ridges, stripes and a little colourwork,… | winter, bunting, shapes |
| [`jelly`](#jelly) | Blender | translucent gummy, jelly and wax — saturated subsurface solids that glow where the form is thin, glossy skins with window highlights, lit from behind… | dessert, gummies, candles, hills |
| [`wood`](#wood) | Blender | wooden toy blocks and turned wood — visible growth rings and long grain, softly rounded edges, some pieces painted in the palette colours with the… | city, turned, hills |
| [`softscape`](#softscape) | Blender | soft matte 3D scenery — simple rounded forms, pastel light and a calm graded backdrop, path-traced like a miniature film set; the scene fills the… | lake, dunes, room, clouds |

**Materials and light (3D)**

| Style | Engine | Technique | Motifs |
|---|---|---|---|
| [`prism`](#prism) | Blender | luxurious, futuristic, cinematic — interlocking glass rings around a glowing core, lit by coloured studio lights on black | — |
| [`chrome`](#chrome) | Blender | Y2K, futuristic, glossy — blobby mirror-chrome forms and droplets floating in front of a plain wall, mirroring big gradient light cards in the… | — |
| [`glass`](#glass) | Blender | glassmorphism made of real glass — thin bevelled slabs of frosted glass with bright rims, blurring the saturated orbs and lights behind them | cards, discs, arch |
| [`foil`](#foil) | Blender | holographic foil — mirror-bright metallised film whose reflections break into rainbow interference colours: inflated mylar balloons with crinkled… | balloons, sheet, ribbons |
| [`metal`](#metal) | Blender | machined and anodised metal — turned and brushed aluminium, anodised colour, knurling and chamfers under strip lights; exact, engineered, cool | dial, rods, blocks |
| [`stone`](#stone) | Blender | polished veined marble with small gold accents in a soft studio — plinths, steps, spheres and arches, the language of a product podium; composed,… | podium, balance, arch |
| [`ceramic`](#ceramic) | Blender | hand-thrown stoneware — lathe-turned pots, bowls and tiles with a glossy glaze over a matte clay body: dip lines, iron speckle, bare foot rings and… | vases, table, tiles |
| [`neon`](#neon) | Blender | neon tube signage — bent glass tubes with a white-hot core, standing off the wall on little mounts, their coloured light spilling over brick, plaster… | arcs, icons, frame |
| [`monolith`](#monolith) | Blender | quiet, cultured, architectural — plaster arches, steps and spheres in low sunlight with long shadows, set with serif type | — |
| [`fabric`](#fabric) | Blender | draped cloth — silk satin or velvet falling in large folds with a clear hierarchy of big swags, medium folds and small wrinkles, hemmed edges and… | drape, curtain, flow |

**Illustrative 3D**

| Style | Engine | Technique | Motifs |
|---|---|---|---|
| [`toon`](#toon) | Blender | cel-shaded 3D with ink outlines — flat tone bands, flat cast shadows and a coloured contour line on a flat backdrop, like a frame of animation | desk, hills, blocks |
| [`lowpoly`](#lowpoly) | Blender | faceted low-poly — models cut from a few flat triangles in big, medium and small sizes, each facet its own slightly shifted colour under one hard… | island, peaks, berg, rocket, forms |
| [`isometric`](#isometric) | Blender | isometric miniature — a tiny diorama on a rounded slab seen from the classic three-quarter angle: matte pastel boxes with one small bevel everywhere,… | room, shop, stage |
| [`voxel`](#voxel) | Blender | voxel art — a scene built cube by cube, each block with a tiny chamfer and a short quantised palette, lit like a miniature | island, city, heart |

## Every style

### papercut
**Paper Relief** · three.js · fills the sheet · default type `editorial` (also suits `myeongjo`, `maru`, `story`, `calli`, `garamond`, `elegant`, `swiss`, `batang`)

a full picture — stacked sheets of heavy coloured paper, each cut with a knife and laid over the next under one soft lamp from the upper left: every cut throws a tight contact shadow and a wider soft one on the sheet beneath, its lit edge shows a hairline of paper thickness, and the colour steps down a tonal ramp to a single disc; the top sheet is the page and carries the copy uncut. Calm, tactile, quietly deep. Good for exhibitions and craft fairs, nature, travel and outdoor programmes, wellness and retreat events, seasonal festivals and family days, book and culture posters.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `vertical`, `strip`, `band`, `baseline` · portrait: `top` (default), `bottom`, `corners`, `vertical`, `axis`, `baseline`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `strata` (default) | nested contour openings round the focus, like a canyon or a geode cut in paper: shelves wide on the lamp's side, a tight flight of lit edges opposite, one punched accent disc in the deepest well Palettes: `terracotta`, `tidewater`, `fern`, `midnight`. | culture, craft, travel, autumn |
| `tide` | wave bands rising from the edge of the sheet farthest from the copy, each sheet ending in one long hand-cut wavy line — a paper sea, with a plain sun or moon slipped between two sheets Palettes: `tidewater`, `terracotta`, `midnight`, `blossom`, `fern`. | travel, outdoor, wellness, nature |
| `canopy` | branches of rounded leaves cut from the rim of a window in every sheet — looking through a paper forest into a clearing with a moon Palettes: `fern`, `blossom`, `midnight`, `terracotta`, `tidewater`. | nature, spring, family, wellness, outdoor |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `terracotta` (default) | light | `#f3eadc` · `#b8431f` · `#ecd2b8` `#e0aa86` `#cb7550` `#a2432e` `#5f201c` |
| `fern` | light | `#f1efe1` · `#9a6417` · `#dfe3c8` `#b7c79c` `#7f9f72` `#4a7552` `#1f4634` |
| `tidewater` | light | `#e9eef0` · `#c2502a` · `#cfdfe2` `#9cc3c8` `#5b9aa6` `#2c6a80` `#133a57` |
| `blossom` | light | `#f7e9e6` · `#b3264f` · `#f1cfd0` `#e5a5b0` `#cf7189` `#a43f61` `#5e1c3a` |
| `midnight` | dark | `#141a33` · `#f1e2b6` · `#232d5a` `#2a3870` `#334688` `#40579f` `#526bb4` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"strata"` | strata | tide | canopy — what is cut into the paper |
| `layers` | `"auto"` | sheets under the page, 3–9 (auto: strata 7, tide 6, canopy 5) |
| `depth` | `1.0` | gap between the sheets, which sets how far the shadows reach: 0.5 = nearly flat … 1.6 = a deep box |
| `scale` | `1.0` | size of the opening (strata, canopy), 0.6–1.4; it never grows into the copy |
| `disc` | `true` | the one disc: a punched hole that shows the accent paper (strata), a sun or moon slipped between two sheets (tide) or in the clearing (canopy); false = none |

### emboss
**Blind Emboss** · three.js · subject on a plain ground · default type `luxe` (also suits `didone`, `fatface`, `garamond`, `elegant`, `myeongjo`, `roman`)

blind embossing on heavyweight cotton paper — no ink in the picture, only the sheet raised or sunk by a die and read by one raking light from the upper left: a monogram of the headline's first letters raised in a sunk plate, an all-over repeat of fish scales, fine waves or diamond quilting that dissolves into flat paper before the copy, or a round seal with beads and a laurel wreath, inside a faint plate mark and with one small element stamped in gold, copper or silver foil. Quiet, tactile, expensive. Good for galas and award nights, weddings and invitations, annual reports and finance, fashion and beauty launches, book and literature events, private views.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `monogram` (default) | the first letters of the headline (one Hangul syllable or two Latin letters), very large, raised inside a sunk round or rounded-rectangle plate with a foil hairline round it | luxury, celebration, fashion, literature |
| `pattern` | an all-over repeat pressed into the art side of the sheet — fish-scale scallops, fine parallel waves or diamond quilting — dissolving into flat paper before the copy, with one small foil disc or slim foil rule | beauty, fashion, luxury, culture |
| `crest` | a round seal: raised rim, a ring of beads, a laurel wreath laid along the circle and a plain centre, the foil either a disc in that centre or a hairline round it | business, finance, celebration, culture |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `cotton` (default) | light | `#f0ede6` · `#8a6516` · `#c2a05c` `#1c1a17` `#d9d3c6` |
| `ivory` | light | `#eee5d1` · `#7c5c17` · `#b08f4a` `#1d3a2c` `#d6cab0` |
| `blush` | light | `#f0dcd7` · `#9a4a3c` · `#cf9682` `#4d1526` `#dcc0ba` |
| `noir` | dark | `#262729` · `#d59468` · `#c58156` `#efe8da` `#3a3b3e` |
| `navy` | dark | `#182645` · `#c5ccd8` · `#b7bec9` `#e9edf4` `#2a3a5e` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"monogram"` | monogram | pattern | crest |
| `text` | `"A"` | monogram: the characters to emboss (the first one or two are used). Left unset, the first letters of the headline's words are used |
| `letters` | `"auto"` | monogram: 1 | 2 characters; auto = one Hangul syllable, two Latin letters |
| `plate` | `"auto"` | monogram: circle | rect (rounded rectangle); auto = chosen by the seed |
| `font` | `"serif"` | monogram: serif (Fraunces, Hangul in Hahmlet) | sans (Pretendard) |
| `repeat` | `"auto"` | pattern: scallop (fish scales) | wave (fine parallel waves) | quilt (diamond quilting); auto = chosen by the seed |
| `accent` | `"auto"` | pattern: the foil accent — disc | bar (a slim rule) | none; auto = chosen by the seed |
| `centre` | `"auto"` | crest: where the foil goes — disc (a foil disc in the plain centre) | ring (a foil hairline round it); auto = chosen by the seed |
| `scale` | `1` | pattern: size of the repeat, 0.6 = fine … 1.8 = large |
| `frame` | `true` | the plate mark: the panel inside the margin is sunk by a hair, as on a plate-sunk card |
| `foil` | `true` | false = entirely blind, no foil |
| `relief` | `1` | strength of the light on the relief, 0.4 = barely there … 1.8 = deep |
| `soft` | `1` | rounding of the die's edges, 0.6 = crisp … 2 = soft |
| `grain` | `1` | cotton tooth of the paper, 0–2 |

### collage
**Paper Collage** · three.js · fills the sheet · default type `editorial` (also suits `brutal`, `singleday`, `kkubulim`, `story`, `yeonsung`, `swiss`, `retro`, `friendly`, `hand`, `classic`)

cut and torn paper pasted up by hand — coloured stocks, a scrap of halftone print, graph paper and newsprint layered with soft shadows, torn edges showing the white fibrous core, held down with masking tape. Playful, tactile, editorial. Good for art and design programmes, exhibitions, children's and community events, markets and zines, culture and music festivals.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `abstract` (default) | a constructivist paste-up: torn sheets, a half disc, strips, halftone and graph-paper offcuts | art, design, education, culture, music |
| `landscape` | torn strips of coloured and printed paper as ranges of hills under a paper sun | travel, nature, outdoor, kids, family |
| `city` | a skyline of cut blocks — windows, stripes, graph paper and newsprint — on a torn street | city, architecture, community, business, market |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `kraft` (default) | light | `#efe8da` · `#d2452c` · `#2f5d8a` `#e0a43a` `#d2452c` `#8fb39a` `#1d1d20` |
| `pastel` | light | `#f6efe8` · `#d94f73` · `#8fb8e0` `#f3c95f` `#f29fb4` `#b4a3df` `#2b2340` |
| `newsprint` | light | `#ecebe5` · `#d8322a` · `#2a2a2a` `#9a9890` `#d8322a` `#d6d2c4` `#151515` |
| `earth` | light | `#e9e1cc` · `#a8502a` · `#6b7a3a` `#c47c3c` `#3f5a6a` `#e3c58a` `#2a2418` |
| `night` | dark | `#1d1e25` · `#f2b84b` · `#3e5c9a` `#f2b84b` `#e06a4e` `#6fb3a0` `#efe6d4` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"abstract"` | abstract | landscape | city |
| `tear` | `1` | how ragged the torn edges are, 0–2 |
| `shadow` | `1` | drop shadow under each piece, 0–2 |
| `tape` | `true` | strips of masking tape holding pieces down |
| `tilt` | `1` | how crooked the pieces are pasted, 0–2.5 |
| `grain` | `1` | paper grain, 0–2 |

### bojagi
**Bojagi Patchwork (조각보)** · three.js · fills the sheet · default type `myeongjo` (also suits `editorial`, `calli`, `maru`, `elegant`, `swiss`, `luxe`)

a Korean patchwork wrapping cloth held up to the light — irregular pieces of translucent ramie and silk gauze, every seam a darker line where the layers double, dyed pieces gathered at the focus and one large undyed panel for the copy. Quiet, hand-made, luminous. Good for traditional and cultural programmes, craft fairs, seasonal greetings, weddings, tea and food, museum and hanok events.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `patchwork` (default) | classic field of irregular rectangles and strips, dyed at the focus, undyed under the copy | tradition, craft, culture, design, market, celebration |
| `window` | nested frames like a door or lattice window with light behind | architecture, tradition, wellness, literature, art |
| `landscape` | pieced mountains, a moon and strips of field and sky | travel, nature, outdoor, autumn, spring, community |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `ramie` (default) | light | `#f3eee2` · `#b4452f` · `#2f4f86` `#d9694a` `#6aa58c` `#e2b244` `#e3a0a8` |
| `obang` | light | `#f5f1e6` · `#b3261e` · `#c63a2c` `#1f4f9e` `#efb62a` `#2f8a5f` `#2b2a33` |
| `indigo` | light | `#eef1f1` · `#234a8f` · `#1d3d7c` `#3f73b8` `#8fb6d9` `#c9dbe6` `#e0a640` |
| `persimmon` | light | `#f2e8d8` · `#a44a1f` · `#b9602c` `#7a4a2a` `#8a8f3f` `#d9a441` `#5f4a6e` |
| `night` | dark | `#141a2e` · `#f0b94f` · `#e45d7a` `#f0b94f` `#43b79a` `#6f7fe0` `#b65fc9` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"patchwork"` | patchwork = classic field of irregular pieces · window = nested frames opening onto pale panes · landscape = mountains, moon and fields pieced from strips and triangles |
| `scale` | `1.0` | piece size: 0.6 = many small pieces … 1.8 = few large ones |
| `dye` | `1.0` | share of dyed pieces at the focus (patchwork): 0 = all undyed, seams only … 1.6 = nearly every piece |
| `seam` | `1.0` | seam width, 0.5–2 |
| `weave` | `1.0` | how strongly the threads show, 0–2 |
| `triangles` | `1.0` | squares cut into two triangles (patchwork), 0–3 |

### najeon
**Mother-of-Pearl Inlay (나전칠기)** · three.js · fills the sheet · default type `myeongjo` (also suits `elegant`, `calli`, `luxe`, `editorial`, `brush`)

Korean mother-of-pearl inlay on polished lacquer — cut shell feathers and petals, snapped strips and crackled fragments that shimmer pink, green and blue in deep black, oxblood, green or navy lacquer, framed by an inlaid border. Precious, traditional, quietly luxurious. Good for traditional music and heritage programmes, museum and craft exhibitions, galas and awards, seasonal greetings, luxury and beauty launches, weddings.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `cranes` (default) | two cranes in flight among scroll clouds before a crackled shell moon (십장생) | tradition, culture, celebration, music, luxury |
| `blossom` | a plum branch in flower: crackled bough, strip twigs, five-petal blossoms | spring, tradition, beauty, wellness, celebration |
| `lattice` | abstract: a roundel of tortoise-shell lattice with flowers, ringed by lozenges | design, architecture, luxury, fashion, craft |
| `waves` | mountain peaks above rows of curling waves, a moon and a cloud | nature, travel, tradition, outdoor |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `black` (default) | dark | `#0d0c0c` · `#d9b46a` · `#f3c3d6` `#b4ead2` `#a6c4f4` `#e9dcb4` |
| `oxblood` | dark | `#3a0e10` · `#e6be72` · `#f6c6cf` `#c9ecd6` `#b4c8f2` `#f1dfb0` |
| `green` | dark | `#0e2a22` · `#e3c37a` · `#bfeedd` `#a9d0f4` `#f1c6da` `#e7e3b4` |
| `navy` | dark | `#0e1830` · `#e2bf78` · `#a8c8f8` `#c3a9ee` `#f3c5d8` `#b5ecd8` |
| `ivory` | light | `#efe6d2` · `#8e2a22` · `#e98fb4` `#6fc6a6` `#7d9de8` `#d9b66e` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"cranes"` | cranes | blossom | lattice | waves |
| `crackle` | `1` | how strongly the crackled (타발) shell shows its cracks, 0–2 |
| `sheen` | `1` | strength of the pink–green–blue iridescence, 0 = silvery … 2 = vivid |
| `gloss` | `1` | the polished reflection across the lacquer, 0–2 |
| `border` | `true` | an inlaid frame of strips and lozenges round the picture |
| `density` | `1` | how many clouds, twigs or lattice cells, 0.5–1.6 |

### stitch
**Hand Embroidery** · three.js · fills the sheet · default type `editorial` (also suits `hand`, `story`, `goun`, `melody`, `starlight`, `gamja`, `calli`, `myeongjo`, `friendly`, `retro`)

hand embroidery on woven cloth — satin and long-and-short stitch with a silk sheen, fishbone leaves, stem-stitch stalks, French knots and running-stitch outlines, every thread casting its small shadow on the weave; or the same design counted out in cross stitch. Warm, patient, domestic. Good for craft fairs and workshops, markets, family and community events, seasonal greetings, food and tea, folk and heritage programmes.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `flowers` (default) | a spray of three blooms with buds, leaves and berries | spring, craft, wellness, beauty, family, celebration |
| `sampler` | moon, two peaks, hills, a house and pines in a stitched frame | travel, outdoor, winter, community, kids, nature |
| `borders` | geometric bands of counted cross stitch | tradition, market, design, food, retro, education |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `linen` (default) | light | `#e9e1d0` · `#a63c2a` · `#c8523c` `#e2a83a` `#2f5f8a` `#3f6f58` `#8fae7c` |
| `rosehip` | light | `#f3e6e0` · `#a2355a` · `#c44a6c` `#e896a6` `#e0b04a` `#55774f` `#a6be8c` |
| `folk` | light | `#efe8da` · `#a8241c` · `#b3261e` `#1d2c4a` `#d99a2b` `#2f5f4a` `#7fa07a` |
| `indigo` | dark | `#1c2540` · `#f0b64a` · `#f3eee0` `#e56b5a` `#f0b64a` `#5fa684` `#a9d3b4` |
| `charcoal` | dark | `#27292c` · `#f08a5d` · `#f08a5d` `#f6d06f` `#e8e4da` `#4f9f84` `#9fd0b0` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"flowers"` | flowers = a spray of blooms, buds, fishbone leaves and berries · sampler = a little landscape (moon, peaks, hills, house, pines) in a running-stitch frame · borders = bands of counted cross stitch (zigzag, hearts, diamonds, tulips) |
| `stitch` | `"satin"` | satin | cross — cross counts the same design out in cross stitches on an even-weave grid (borders are always cross stitch) |
| `thread` | `1.0` | thickness of the floss, 0.6–1.8 |
| `count` | `1.0` | cross-stitch count: 0.6 = big crosses … 1.6 = fine |
| `sheen` | `1.0` | silk sheen on the thread, 0–2 |
| `weave` | `1.0` | how strongly the cloth's weave shows, 0–2 |

### mosaic
**Tesserae Mosaic** · three.js · fills the sheet · default type `bold` (also suits `editorial`, `yeonsung`, `round`, `humanist`, `swiss`, `retro`, `friendly`, `gmarket`)

a wall of small hand-cut tiles in grout — courses of tesserae that follow the forms of the design (rings round a disc, rows riding each wave, three courses round every arch) and carry on as plain field tiles behind the copy. Sunlit, durable, Mediterranean. Good for travel and summer campaigns, food and markets, city and architecture events, pools and spas, public and community programmes.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `headline`, `baseline`, `vertical`, `axis`, `strip` · portrait: `top` (default), `corners`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `waves` (default) | a low sun or moon disc over layered swells with foam crests | summer, travel, outdoor, wellness, sports, nature |
| `arches` | an arcade of arches with a disc in the middle opening and roundels above | architecture, city, culture, market, food, nightlife |
| `bands` | abstract: overlapping discs of ringed bands crossed by a straight band | design, art, education, community, retro, kids |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `aegean` (default) | light | `#ece5d6` · `#993d1c` · `#1f4f7c` `#3f90b2` `#a9d4d6` `#e3a63c` `#c8563c` |
| `terracotta` | light | `#efe2cc` · `#93381a` · `#74301e` `#c8663c` `#ecc48a` `#e59a3a` `#40695a` |
| `garden` | light | `#e8ebdc` · `#9a4020` · `#2f5d46` `#6fa377` `#c9dcae` `#e9b94a` `#d9694a` |
| `byzantine` | dark | `#17182a` · `#e3b34c` · `#22357a` `#3f74b8` `#e9dcae` `#e3b34c` `#9a3144` |
| `lagoon` | dark | `#0f2b33` · `#f2c14e` · `#0f5f6c` `#22a0a4` `#9be3d2` `#f2c14e` `#f0704e` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"waves"` | waves = a low disc over swells whose courses ride the crests · arches = an arcade with a disc in the middle opening · bands = overlapping discs of ringed bands and one straight band |
| `tile` | `1.0` | tessera size: 0.6 = fine … 2 = chunky |
| `grout` | `1.0` | width of the grout joints, 0.5–2 |
| `rough` | `1.0` | how unevenly the tiles are cut, 0–2 |
| `gloss` | `1.0` | glints on tilted tiles (glass smalti), 0–2 |

### stainedglass
**Leaded Stained Glass** · three.js · subject on a plain ground · default type `editorial` (also suits `luxe`, `maru`, `calli`, `myeongjo`, `elegant`, `bold`)

a leaded stained-glass window glowing in a plain wall — hand-cut pieces of streaky coloured glass, dark lead cames meeting in T-joints, a border fillet, light blooming through. Rich, ceremonial, warm. Good for concerts and choirs, year-end and seasonal events, exhibitions, heritage and architecture, book and film nights, markets.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `landscape` (default) | rolling hills, two cypresses and a sun or moon disc under a banded sky | travel, nature, music, celebration, winter, summer |
| `flowers` | tulips with long leaves on a ground of diamond quarries | spring, wellness, beauty, market, family |
| `geometric` | prairie-style light screen: clear panes, ladders of small squares, chevrons and discs | architecture, design, business, education, city |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `cathedral` (default) | dark | `#0e1220` · `#f2b441` · `#1f3f9a` `#5aa7dc` `#f2b441` `#2f9468` `#7a3f9c` |
| `ember` | dark | `#17100c` · `#f0a23a` · `#5a2a1a` `#f3d08a` `#f0a23a` `#6f8f3a` `#c2472c` |
| `rosewood` | dark | `#1a0d15` · `#f2c46a` · `#6a1f48` `#f0a9c0` `#f2c46a` `#3f8f86` `#b7409a` |
| `daylight` | light | `#f1ece2` · `#b8432f` · `#2f5fae` `#a9d0e6` `#f0b545` `#4f9a6a` `#d0553a` |
| `prairie` | light | `#ece4d2` · `#a8501f` · `#3a2a1c` `#ead9a6` `#e09a2b` `#667f3c` `#a8501f` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"landscape"` | landscape = hills, cypresses and a disc of sun or moon under banded sky · flowers = tulips on diamond quarries · geometric = prairie-style screen of panes, ladders, chevrons and discs |
| `frame` | `"auto"` | auto | arch | rect — shape of the window (auto: arched, rectangular for geometric) |
| `border` | `true` | a border fillet of short pieces round the window |
| `lead` | `1.0` | width of the lead cames, 0.6–1.8 |
| `glow` | `1.0` | bloom over the leads and light on the wall, 0–2 |
| `texture` | `1.0` | streaks, seeds and ripple in the glass, 0–2 |

### paper
**Paper Cut** · Blender · subject on a plain ground · default type `editorial` (also suits `myeongjo`, `story`, `maru`, `calli`, `melody`, `hand`, `friendly`, `luxe`, `goun`)

calm, crafted, seasonal — a layered cut-paper diorama (hills or waves, a pale sun or a moon with paper halo rings, little clouds and pines) seen through a round or arched window in a sheet of the poster's colour, each layer casting a soft shadow. Good for children's and family events, cultural programmes, seasonal greetings, markets, travel and nature themes.

**Cut-out**: can stand on a ground — checked with `pattern/checker`, `pattern/stripes`, `pattern/dots`, `pattern/terrazzo`, `pattern/arches`, `pattern/grid`, `haze`, `halftone`.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `dawn` (default) | light | `#f4ede4` · `#e4572e` · `#f9c784` `#f08a5d` `#b83b5e` `#3d2c5e` |
| `forest` | light | `#eef0e6` · `#d9902f` · `#cfe1b9` `#87a878` `#4a7c59` `#1f3b2d` |
| `ocean` | light | `#e9f1f4` · `#ff7a59` · `#bfe3ee` `#5fb3ce` `#2a6f97` `#12355b` |
| `blossom` | light | `#fbeef0` · `#e8497a` · `#ffd6dd` `#f7a1b5` `#c06c84` `#5b3758` |
| `night` | dark | `#141a2b` · `#f6d27a` · `#1c2447` `#3a4a8a` `#6f86c9` `#c7d3f2` |

| Param | Default | Effect |
|---|---|---|
| `layers` | `6` | 5–7 paper sheets including the sky |
| `window` | `"circle"` | circle | arch — shape of the opening the diorama sits in |
| `edge` | `"hills"` | hills (rolling ridges, with pines) | waves (regular sea swell) |
| `disc` | `true` | plain sun / moon disc behind the far ridge (no rays). Pale soft yellow / apricot on a light sky; on a dark sky the accent colour, or pale moon-yellow if the accent is red |
| `rings` | `2` | concentric paper halo rings around the disc (0–3) |
| `clouds` | `2` | number of small paper clouds (0–3) |
| `trees` | `5` | number of little pines cut into one ridge (0 = none; hills only) |
| `depth` | `1.0` | spacing between sheets: 0.6 = shallow, subtle shadows … 1.6 = deep shadow box |
| `shadow` | `14` | shadow softness in degrees: 4 = crisp … 25 = very soft |
| `reverse` | `"auto"` | false = pale sky, deep foreground (light posters) · true = deep night sky with stars, pale hills (automatic on dark backgrounds) |
| `grain` | `1.0` | paper fibre relief: 0 = smooth card (renders ~15% faster) … 2 = rough handmade paper |
| `stars` | `true` | punched-out stars in the night sky (only when the sky is dark) |

### origami
**Origami** · Blender · subject on a plain ground · default type `swiss` (also suits `editorial`, `round`, `story`, `humanist`, `bold`, `myeongjo`, `friendly`)

folded paper — crisp creased forms with paper grain, a coloured face and a pale reverse, under one soft top light with clean contact shadows; light, precise, hand-made. Good for culture and craft programmes, education, travel, seasonal greetings, design talks.

**Cut-out**: can stand on a ground — checked with `pattern/checker`, `pattern/stripes`, `pattern/dots`, `pattern/terrazzo`, `pattern/arches`, `pattern/grid`, `haze`, `halftone`.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `cranes` (default) | a flight of folded paper cranes | tradition, celebration, culture, wellness |
| `boats` | paper boats on a pleated sea | travel, summer, kids, literature |
| `peaks` | a folded landscape of mountains and trees | outdoor, nature, winter, travel |
| `relief` | a tessellated folded relief under raking light | design, architecture, art, education |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `kami` (default) | light | `#f2ede3` · `#d5432b` · `#e2492d` `#2c4f7c` `#f1b233` `#3b8f86` |
| `sky` | light | `#e4eef3` · `#e8553a` · `#f0623f` `#3f86b8` `#1d4e7a` `#f6c453` |
| `blossom` | light | `#f8e9e6` · `#d63f6c` · `#e8537d` `#f4a7a0` `#7c3f6b` `#f3c969` |
| `moss` | light | `#ebeedf` · `#c7602a` · `#dd7a2e` `#5f8f5a` `#2f5d47` `#e9c46a` |
| `night` | dark | `#182036` · `#f2c261` · `#f2c261` `#5d7fd0` `#e2604a` `#b9c8ee` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"cranes"` | cranes | boats | peaks | relief |

### halftone
**Riso Halftone Orbs** · three.js · subject on a plain ground · default type `swiss` (also suits `brutal`, `fatface`, `classic`, `comic`, `jalnan`, `yeonsung`, `retro`, `impact`, `editorial`)

tactile, lo-fi, independent — big overlapping spheres printed as halftone dot screens in two or three spot inks, slightly out of register, on paper. Good for zines, indie music, exhibitions, film nights, book fairs, record sleeves, anything that should feel hand-printed.

**Ground**: can be drawn under a cut-out subject (`"ground": "halftone"`).

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `fluoro` (default) | light | `#f3ede0` · `#0b6fb3` · `#ff48b0` `#0078bf` `#ffe100` |
| `sunset` | light | `#f4eee2` · `#00727a` · `#ff665e` `#00838a` `#ffb511` |
| `duotone` | light | `#efe9dd` · `#2f4f9e` · `#f15060` `#3255a4` |
| `kelp` | light | `#eef0e4` · `#00804a` · `#00a95c` `#235ba8` `#ffb511` |
| `blackpaper` | dark | `#17161a` · `#ff7ab8` · `#ff5fa8` `#3fb2ff` `#ffe14d` |

| Param | Default | Effect |
|---|---|---|
| `orbs` | `3` | number of spheres, 1–3 |
| `dot` | `1.0` | halftone pitch multiplier: 0.6 = fine screen … 2 = coarse pop-art dots |
| `misregister` | `1.0` | how far the ink layers slip out of register: 0 = perfect … 3 = sloppy |
| `shade` | `1.0` | strength of the second-ink shadow on each sphere, 0–1.3 |
| `wear` | `0.5` | uneven ink lay-down: 0 = perfectly even … 1 = patchy, well-used drum |
| `angle` | `0` | rotates all screen angles, degrees |

### linocut
**Linocut Print** · three.js · fills the sheet · default type `retro` (also suits `brutal`, `euljiro`, `yeonsung`, `classic`, `fatface`, `story`, `bold`, `editorial`, `myeongjo`, `hand`)

hand-carved and bold — a relief print pulled from a lino block: flat fields of ink, tapering white gouge marks, starved ink and up to three colours slightly out of register, set as a print on the bare sheet. Good for markets and craft fairs, folk and indie music, book and film festivals, seasonal events, food and farm brands.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `hills` (default) | rolling hills under a moon, a cottage and trees | nature, travel, outdoor, autumn |
| `waves` | sea swell under a moon | summer, travel, music, food |
| `botanical` | a leafy branch in flower | spring, wellness, market, craft |
| `rooftops` | a town of gables, chimneys and lit windows | city, community, winter, literature |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `indigo` (default) | light | `#f3ecdc` · `#b4502a` · `#1b2233` `#3f6c98` `#ebb850` |
| `persimmon` | light | `#f5ebd9` · `#b9482a` · `#2a1c19` `#cf5a30` `#f0c46a` |
| `forest` | light | `#eef0e1` · `#3f6b47` · `#1c2a22` `#4f7f57` `#dcc463` |
| `black` | light | `#f2eee4` · `#a8432a` · `#17171a` |
| `night` | dark | `#17181d` · `#e8b24a` · `#3d5f8f` `#e2a13c` `#f3ecdc` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"hills"` | hills | waves | botanical | rooftops |
| `inks` | `3` | 1–3 colours (the palette's colours, darkest = key block) |
| `misregister` | `1` | 0 = perfect register … 3 = colours visibly slipped |
| `wear` | `1` | 0 = solid ink … 2 = starved, speckled ink |
| `cut` | `1` | 0.4 = fine cuts … 2 = fat gouge marks |
| `grain` | `1` | paper tooth (0–2) |

### gouache
**Gouache Cut-outs** · three.js · subject on a plain ground · default type `editorial` (also suits `grotesk`, `story`, `maru`, `kkubulim`, `singleday`, `garamond`, `didone`, `hand`, `geometric`, `goun`)

paper painted flat with gouache, cut freehand with scissors and pinned up — three to six panels of saturated matte colour with hairlines of page between them, on each one bold form cut from another colour (a frond with rounded lobes, a coral branch, a vase, a plain disc), one cut from the page colour itself and one or two crossing onto the next panel, with faint brush streaks and the small shadow of paper on paper. Joyful and bold, but grown-up. Good for exhibitions and museum programmes, art and craft fairs, spring and summer festivals, food and farmers' markets, family and wellness events, travel and seaside posters.

**Cut-out**: can stand on a ground — checked with `pattern/checker`, `haze`.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `band`, `corners`, `headline`, `baseline`, `strip`, `axis`, `vertical` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `axis`, `side`, `vertical`

| Motif | Shows | Suits |
|---|---|---|
| `fronds` (default) | algae and leaf forms: a long seaweed frond on the largest panel, a squat lobed leaf, a coral branch and one plain disc for rest | art, culture, spring, wellness, craft |
| `still` | a table still life in silhouette: a vase with a frond in it, a bowl of fruit, a pear and its neighbour, a slice, a lemon | food, market, family, craft |
| `shore` | the seaside: bands of sea with scalloped crests, a plain disc of sun or moon, two or three birds, pebbles | travel, summer, family, wellness |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `riviera` (default) | light | `#f3eddd` · `#c4356f` · `#2a45a6` `#ee7f30` `#1f8c64` `#f2d250` `#cc4480` |
| `garden` | light | `#f2eee0` · `#2f7c43` · `#3f8f4e` `#e88fa8` `#dba032` `#86b9dd` `#1f4a36` |
| `noon` | light | `#f6f4ee` · `#d43d25` · `#2251b3` `#e2472d` `#18181b` `#f5cf3d` |
| `citrus` | light | `#f7efc6` · `#c84d14` · `#f08c28` `#253c92` `#4f9e3e` `#ee93b2` |
| `dusk` | dark | `#2d1c35` · `#e9b94c` · `#ee7c64` `#e2b23e` `#2f9b94` `#f1e7d0` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"fronds"` | fronds | still | shore |
| `panels` | `0` | number of colour panels, 3–6 (0 = chosen to suit the space the copy leaves) |
| `cut` | `1` | freehand scissor work — panel corners off square, slight flats on the curves (0 = ruler-true … 2) |
| `gap` | `1` | width of the hairline of page between panels (0.4–3) |
| `streak` | `1` | how visible the brush streaks in the gouache are (0–2.5) |
| `shadow` | `1` | the small shadow of paper lying on paper (0–2.5) |
| `grain` | `1` | tooth of the paper (0–2) |

### crayon
**Crayon Drawing** · three.js · fills the sheet · default type `hand` (also suits `pop`, `starlight`, `gamja`, `kkubulim`, `dongle`, `melody`, `friendly`, `bold`, `retro`)

warm, naive and hand-made — wax crayon / oil pastel on toothy paper: bold shapes coloured in with back-and-forth strokes, the paper sparkling through, a dark outline here and there. Good for children's and family events, schools, markets and fairs, community programmes, picture-book and craft topics.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `landscape` (default) | hills, a sun, a house and trees | kids, family, outdoor, spring |
| `stilllife` | flowers in a vase and fruit on a cloth | food, market, art, education |
| `city` | a street of houses and towers | city, community, education, celebration |
| `scribble` | abstract fields of hatching, loops and dots | art, kids, design, music |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `daylight` (default) | light | `#f6f1e4` · `#d5432f` · `#4b8fd8` `#58a84a` `#f4b92e` `#e2523a` `#8b5db4` |
| `pastel` | light | `#f8f3ea` · `#c4517a` · `#86bce8` `#93cf9a` `#f7d466` `#f1958a` `#c0a2e2` |
| `autumn` | light | `#f3e9d6` · `#b3402c` · `#e08a3a` `#8a9440` `#f0c044` `#b9432f` `#6f4f8f` |
| `kraft` | light | `#cdaa7c` · `#8f2f1f` · `#f4efe2` `#2f7a55` `#f3c62f` `#d8452f` `#2d68b0` |
| `night` | dark | `#1c1c23` · `#f6cf4c` · `#3e6ed6` `#3fae72` `#f7d34e` `#f26d4b` `#b88cf0` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"landscape"` | landscape | stilllife | city | scribble |
| `tip` | `1` | 0.5 = sharp crayon … 2 = fat pastel stick |
| `pressure` | `1` | 0.4 = light, grainy … 1.6 = pressed hard, nearly solid |
| `tooth` | `1` | 0 = smooth paper … 2 = very rough paper |
| `wobble` | `1` | hand tremor (0–2.5) |
| `outline` | `true` | false = no dark outline crayon |

### watercolor
**Watercolour Wash** · three.js · fills the sheet · default type `editorial` (also suits `myeongjo`, `story`, `melody`, `calli`, `maru`, `luxe`, `hand`, `swiss`, `goun`)

hand-made and quiet — translucent, overlapping watercolour washes on paper with pooled edges, a few fine parallel pen lines and plenty of bare sheet for the copy. Good for book talks, exhibitions, weddings and invitations, seasonal greetings, craft and culture programmes.

**Ground**: can be drawn under a cut-out subject (`"ground": "watercolor"`).

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `rose` (default) | light | `#faf6ef` · `#b0457c` · `#e89ab8` `#f2a65a` `#7d6bb0` `#5aa9a3` |
| `indigo` | light | `#f7f4ec` · `#2c58a0` · `#3b6fb6` `#1f3e7a` `#e0a43c` `#7fb7c9` |
| `sage` | light | `#f6f5ea` · `#4f7433` · `#86b36f` `#4f9484` `#e0b84c` `#d98a6a` |
| `autumn` | light | `#faf3e6` · `#96601a` · `#e8a53a` `#d08a3e` `#8a8f3c` `#7a5a86` |
| `night` | dark | `#121318` · `#e9c46a` · `#e9c46a` `#7fd3d8` `#e58fb0` `#f3efe6` |

| Param | Default | Effect |
|---|---|---|
| `size` | `1.0` | 0.5 = small blooms … 1.8 = large washes |
| `depth` | `1.0` | 0.4 = pale, few layers … 1.8 = saturated |
| `wet` | `1.0` | 0 = flat colour … 2 = strong pooling at the wash edges |
| `grain` | `1.0` | paper tooth and granulation (0–2) |
| `ink` | `1.0` | 0 = no pen work … 3 = many parallel pen lines and dotted trails |
| `splatter` | `1.0` | 0 = none … 3 = many droplets around the washes |

### sumuk
**Ink Wash (수묵)** · three.js · fills the sheet · default type `myeongjo` (also suits `editorial`, `calli`, `maru`, `luxe`, `elegant`, `hand`)

still and spacious — East Asian ink wash on hanji: wet washes thinning into mist, dry-brush strokes with the paper showing through, a vermilion seal and most of the sheet left bare for the copy. Good for traditional and cultural programmes, tea and craft, literature, classical and gugak concerts, retreats, seasonal greetings.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `mountains` (default) | mountain ranges in mist, pines and a small boat | nature, travel, wellness, tradition |
| `bamboo` | bamboo stalks and leaves | tradition, wellness, education, summer |
| `plum` | a blossoming plum branch | spring, celebration, literature, culture |
| `strokes` | abstract dry-brush sweeps and splashes | art, design, music, business |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `hanji` (default) | light | `#f3eee2` · `#b23a2a` · `#191817` `#47525c` `#c9655c` `#b93a28` |
| `mist` | light | `#eef0ed` · `#a63b2c` · `#141a21` `#3c5466` `#7da2b8` `#b03a2a` |
| `aged` | light | `#e8dbbd` · `#9a3323` · `#241a12` `#5e4a34` `#b8683f` `#a53423` |
| `gamji` | dark | `#131a31` · `#e3bd62` · `#e6c57e` `#b3925a` `#f1e7cc` `#cf4a33` |
| `meok` | dark | `#1a1a1c` · `#d9634b` · `#e8e4da` `#a39f96` `#d0b77c` `#cf4a33` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"mountains"` | mountains | bamboo | plum | strokes |
| `ink` | `1` | 0.4 = pale, watery … 1.6 = heavy black |
| `dry` | `1` | 0 = wet, solid strokes … 2 = very dry brush, lots of flying white |
| `mist` | `1` | 0 = clear air … 2 = heavy banks of mist |
| `bleed` | `1` | how far the ink creeps into the paper (0–2) |
| `grain` | `1` | paper fibre and tooth (0–2) |
| `seal` | `true` | false = no red seal |

### cyanotype
**Cyanotype Sun Print** · three.js · fills the sheet · default type `editorial` (also suits `myeongjo`, `story`, `maru`, `elegant`, `swiss`, `techno`, `hand`)

a sun print on watercolour paper — pressed ferns and leaves, glass, lace or cut paper laid on a brush-coated sheet and left in the sun, printing white on Prussian blue with soft penumbras, pale translucent veins, a ragged brushed edge and uneven washy blue. Calm, botanical, a little scientific. Good for nature and garden events, science and education programmes, exhibitions and photography, summer festivals, wellness and craft brands.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `botanical` (default) | a pressed fern frond with leaves, a lace-flower umbel, a daisy and grasses | nature, spring, summer, wellness, outdoor |
| `objects` | a photogram of everyday things: a glass bottle, scissors, a key, a feather on a lace doily | craft, market, design, literature, retro |
| `shapes` | abstract: cut and tracing-paper shapes, a punched strip and a loop of string, Bauhaus photogram | design, art, education, architecture, tech |
| `algae` | branching seaweed specimens in the manner of Anna Atkins' British Algae | science, nature, summer, travel, education |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `prussian` (default) | dark | `#1c4787` · `#ffe08a` · `#f3f0e6` `#0f2c62` `#4f7cba` |
| `midnight` | dark | `#142a52` · `#a9cbff` · `#efeadb` `#0a1834` `#35598f` |
| `vandyke` | dark | `#4a2e1c` · `#e9b977` · `#f1e6d0` `#2c190d` `#7d5638` |
| `verdant` | dark | `#1f4a3e` · `#e8d47c` · `#eef0e4` `#0f2d25` `#4f7f6c` |
| `violet` | dark | `#3b2c6a` · `#f4bccd` · `#f1ecf2` `#211743` `#6c5ca1` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"botanical"` | botanical | objects | shapes | algae |
| `lift` | `1` | how far things lifted off the paper: 0 = crisp contact print … 2 = soft penumbras |
| `wash` | `1` | unevenness of the developed blue — pooling, pale patches, tide marks, brush strokes (0–2) |
| `border` | `1` | width of the bare paper round the brushed coating (0–2) |
| `grain` | `1` | watercolour-paper tooth (0–2) |
| `density` | `1` | how many pinnae, florets, grasses (0.5–1.6) |

### marble
**Fluid Marbling** · three.js · fills the sheet · default type `luxe` (also suits `editorial`, `calli`, `myeongjo`, `elegant`)

a full picture — a flow painting like paper marbling or a paint pour: rings of pigment bent into veins and pools, edged with fine gilded hairlines, dense at the focus and opening into large calm pools of the paper colour behind the copy. Elegant, tactile. Good for exhibitions, craft and design fairs, beauty and fragrance, weddings, book covers, premium invitations.

**Ground**: can be drawn under a cut-out subject (`"ground": "marble"`).

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `ivory` (default) | light | `#f3ede2` · `#b98a3c` · `#22395a` `#9db1c2` `#d9b99a` `#7c2f3b` |
| `blush` | light | `#f6e9e3` · `#bd8748` · `#b3536a` `#e9b6b1` `#5a3955` `#f1d2bb` |
| `celadon` | light | `#e9efe6` · `#ad8a3b` · `#1f5e59` `#8fbfae` `#d8c9a2` `#2b3f4f` |
| `onyx` | dark | `#101215` · `#d6a851` · `#2b3039` `#5c6571` `#e8e1d2` `#86673a` |
| `indigo` | dark | `#0c1230` · `#e1b667` · `#1c2f7a` `#3f6fc2` `#b9c8ee` `#5a2a6e` |

| Param | Default | Effect |
|---|---|---|
| `flow` | `1.0` | how far the flow bends the rings: 0.4 = near-concentric agate … 1.5 = long wandering veins |
| `veins` | `1.0` | ring density at the heart: 0.6 = broad pools … 1.8 = many fine veins |
| `strokes` | `1` | stylus strokes drawn through the rings, each dragging them into a feather: 0–2 (parallel, never crossing) |
| `drops` | `2` | later, smaller drops that land in the outer rings and push them aside, 0–5 |
| `gilt` | `1.0` | amount of metallic hairline: 0 = none … 1 = most pool edges gilded |
| `scale` | `1.0` | size of the main drop |

### layers
**Layered Silhouettes** · three.js · fills the sheet · default type `editorial` (also suits `myeongjo`, `maru`, `elegant`, `bold`)

flat layered illustration — receding silhouettes cut from flat colour and softened by haze, in the manner of a screen-printed travel poster; the technique fills the whole sheet and the sky carries the copy. Good for travel, outdoor and city events, festivals, seasonal greetings, covers.

Layouts — landscape: `top` (default), `left`, `right`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `mountains` (default) | mountain ridgelines fading into haze, firs and a still lake, a pale sun or moon Palettes: `dawn`, `dusk`, `night`, `snowy`, `autumn`. | travel, outdoor, nature, wellness, autumn, winter |
| `sea` | open sea to a low horizon, a low sun or moon and its glitter path, far islands and a sail Palettes: `sunrise`, `midday`, `sunset`, `moonlit`, `stormy`. | summer, travel, music, wellness, outdoor |
| `city` | a city at dusk: layers of towers with lit windows, a moon, a harbour mirroring the lights Palettes: `bluehour`, `neon`, `amberdusk`, `fog`, `daybreak`. | city, nightlife, business, music, film, celebration |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `dawn` (default) | light | `#f4e6da` · `#e2553a` · `#2c3157` `#8f7fa9` `#ffc7a0` `#f6d2c4` |
| `dusk` | dark | `#221a3c` · `#ffb45a` · `#120d24` `#5b3a70` `#f06a58` `#6a3b78` |
| `night` | dark | `#0b1430` · `#f6efd2` · `#050916` `#1e3162` `#4166ad` `#152552` |
| `snowy` | light | `#e3ebf2` · `#d9573a` · `#2b4360` `#9bb3cb` `#fdf1e6` `#eef1f2` |
| `autumn` | light | `#f5e8d0` · `#c9421f` · `#4b1f1c` `#c66a2e` `#f8c66a` `#f7dba6` |
| `sunrise` | light | `#fbeadb` · `#e8573f` · `#e9a7a0` `#8c7fb0` `#ffd0a3` `#fbdcc8` |
| `midday` | light | `#dfeef8` · `#e8631f` · `#2f86c9` `#1d5c96` `#fff1cf` `#bfe0f3` |
| `sunset` | dark | `#1c1f4a` · `#ffb454` · `#232a66` `#3a2a6e` `#f2684f` `#7a3a7a` |
| `moonlit` | dark | `#0a1630` · `#f4efd6` · `#0f2450` `#1b3a78` `#3f6bb5` `#132a5c` |
| `stormy` | dark | `#27313c` · `#ffe3a8` · `#2f4250` `#18222c` `#b9c2bf` `#4f5f6b` |
| `bluehour` | dark | `#101b3d` · `#ffc56e` · `#060a1a` `#22376e` `#b9697f` `#a8d8ff` |
| `neon` | dark | `#170a2e` · `#ff58b6` · `#07040f` `#3b1c6b` `#c22f92` `#4fe3ff` |
| `amberdusk` | dark | `#2c1a36` · `#ffb24d` · `#140b1a` `#5c3352` `#f07c3e` `#ffe2ad` |
| `fog` | dark | `#4d5661` · `#ffdca6` · `#1f252c` `#6a747f` `#a9b2ba` `#e3ebf2` |
| `daybreak` | light | `#f3e5db` · `#c4421d` · `#3b3a5c` `#9291b3` `#ffc9a3` `#fff0b8` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"mountains"` | mountains | sea | city — what the picture shows; each motif has its own palettes and parameters |
| `layers (mountains)` | `7` | number of ridgelines, 5–8 |
| `peaks (mountains)` | `1.0` | 0.4 = rolling hills … 1.5 = jagged alpine peaks |
| `lake (mountains)` | `true` | still lake mirroring the range along the bottom; false = the slopes run off the frame |
| `trees (mountains)` | `1.0` | firs on the near crests: 0 = none … 2 = dense |
| `snow (mountains)` | `"auto"` | snow caps: 0 = none … 1 = down to the middle slopes (auto: on for the snowy palette) |
| `birds (mountains)` | `5` | birds beside the sun (daylight palettes), 0–8 |
| `clouds (mountains)` | `1.0` | thin cloud streaks beside the hero, 0 = clear sky |
| `body (mountains)` | `"auto"` | auto · sun · moon (auto: a pale accent on a dark sky becomes a moon) |
| `stars (mountains)` | `"auto"` | auto (dark skies only) · true · false |
| `sun (mountains)` | `1.0` | size of the sun / moon disc |
| `waves (sea)` | `"auto"` | 0.4 = glassy water … 1.6 = lively crests (auto: 1, the stormy palette 1.5) |
| `glitter (sea)` | `1.0` | strength of the light path under the sun or moon |
| `dip (sea)` | `0.2` | 0 = disc clear of the horizon … 1 = more than half set |
| `clouds (sea)` | `"auto"` | thin cloud streaks: 0 = clear … 2 = many (auto: 1, the stormy palette 2) |
| `islands (sea)` | `2` | far islands on the horizon, 0–4 |
| `boat (sea)` | `true` | a small sail near the horizon |
| `birds (sea)` | `4` | gulls beside the sun (daylight palettes), 0–8 |
| `body (sea)` | `"auto"` | auto · sun · moon (auto: a pale accent on a dark sky becomes a moon) |
| `stars (sea)` | `"auto"` | auto (dark skies, not the stormy one) · true · false |
| `sun (sea)` | `1.0` | size of the sun / moon disc |
| `height (city)` | `1.0` | 0.4 = low waterfront … 1.6 = towers high above the moon |
| `lights (city)` | `1.0` | 0 = dark city … 2 = every floor lit |
| `water (city)` | `true` | harbour with reflections in the foreground (false = the city runs to the bottom edge) |
| `haze (city)` | `1.0` | 0 = crisp night … 2 = thick glowing mist between the layers |
| `bloom (city)` | `1.0` | glow around the lights |
| `moon (city)` | `1.0` | size of the moon / sun (0.5–1.8) |
| `body (city)` | `"auto"` | auto | moon | sun |
| `stars (city)` | `"auto"` | auto (on dark, moonlit palettes) | true | false |
| `towers (city)` | `true` | landmark towers framing the moon |

### airbrush
**Airbrush Space Art** · three.js · fills the sheet · default type `elegant` (also suits `techno`, `luxe`, `impact`)

retro science-fiction airbrush — soft sprayed gradients, fine grain and glowing rims, as on 1970s paperback covers: a ringed planet in a star field, moons rising over alien dunes, or an orrery of planets on fine orbit lines; clouds and glows thin out behind the copy. Good for science and tech events, film and music nights, launches, sci-fi and gaming.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `planet` (default) | a large ringed planet with a sunlit limb, a small moon, stars and nebula | science, tech, film, music, gaming |
| `moons` | two or three moons rising over soft alien dunes, a warm glow along the horizon | film, music, nightlife, literature, travel |
| `orbits` | a small sun with planets on fine elliptical orbit lines, like an orrery | science, education, tech, kids |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `nebula` (default) | dark | `#070a1c` · `#ffb86b` · `#3a2a8c` `#c0398f` `#e2703a` `#f6d9b0` |
| `ember` | dark | `#0d0708` · `#ffc978` · `#8a1f2e` `#d4552a` `#5d7fb8` `#dfe6f5` |
| `glacier` | dark | `#050d18` · `#9be7ff` · `#12466e` `#2a8fa8` `#8fb9d6` `#f2fbff` |
| `jade` | dark | `#04100f` · `#ffd98a` · `#0e5c58` `#3aa17e` `#e0705a` `#f4d6b8` |
| `pastel` | light | `#e9e3f6` · `#d6456b` · `#b9c8f5` `#f6c1d6` `#f4a58a` `#fff3c9` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"planet"` | planet | moons | orbits — what the picture shows |
| `ring` | `true` | planet: ringed planet; the ring is turned and sized so it clears the copy (false = plain planet, a little larger). orbits: a ring round the largest planet |
| `moon` | `true` | planet: a small crescent moon near the planet |
| `nebula` | `1.0` | nebula density: 0 = stars only … 1.5 = heavy clouds |
| `stars` | `1.0` | star density and number of bright stars |
| `bands` | `1.0` | cloud bands on the planets: 0.5 = broad … 2 = many fine bands |
| `size` | `1.0` | size multiplier of the hero (planet, big moon, or the whole orrery) |
| `flare` | `1.0` | soft round glow of the bright stars and of the sunlit limb, 0 = none (there are no spikes or streaks) |
| `moons` | `3` | moons: how many moons rise (1–3) |
| `planets` | `5` | orbits: number of planets / orbit lines (3–6) |

### bauhaus
**Geometric Mosaic** · three.js · subject on a plain ground · default type `swiss` (also suits `bold`, `slim`, `brutal`, `editorial`, `impact`)

flat, crisp, playful-but-ordered — a tidy grid of square tiles filled with circles, quarter-circles, arches, stripes and dots in a few flat colours, like a design-studio identity. Good for design weeks, studios and agencies, architecture, education, cultural programmes, brand systems.

**Ground**: can be drawn under a cut-out subject (`"ground": "bauhaus"`).

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `primary` (default) | light | `#f1ece1` · `#d23417` · `#e2401c` `#1f47c8` `#f4b81f` |
| `terrazzo` | light | `#efe8dc` · `#b8452f` · `#c8553d` `#28536b` `#e9b44c` `#9db8a6` |
| `pool` | light | `#e8f1ec` · `#087a5d` · `#0c8a6a` `#ff7a59` `#f6c445` `#2b4bd6` |
| `noir` | dark | `#151517` · `#f4b81f` · `#e8452c` `#f4b81f` `#3b62e0` |
| `midnight` | dark | `#0f1730` · `#ff7a59` · `#ff7a59` `#f6c445` `#7fb6ff` `#2f4fd8` |

| Param | Default | Effect |
|---|---|---|
| `grid` | `5` | tiles per side, 3–8 (4 = bold, 6 = intricate) |
| `merge` | `2` | number of 2×2 tiles (0 = none) |
| `empty` | `0.12` | share of cells left blank, 0–0.5 |
| `air` | `0.42` | how much paper shows inside the block (paper grounds and cut-outs): 0 = solid colour everywhere … 0.9 = mostly shapes on paper |
| `gap` | `0` | gutter between tiles as a fraction of a tile, 0 = flush … 0.3 |

### memphis
**Memphis Pattern** · three.js · subject on a plain ground · default type `pop` (also suits `retro`, `anemone`, `comic`, `kkubulim`, `singleday`, `dongle`, `bold`, `friendly`, `impact`, `brutal`)

1980s Memphis Group graphics — candy-coloured solids filled with dots, stripes, grids and terrazzo chips, squiggles, zigzags and confetti triangles, with black outlines printed slightly out of register; loud, witty, deliberately un-serious. Good for parties and festivals, pop-ups and sales, kids and family events, design markets, retro nights.

**Ground**: can be drawn under a cut-out subject (`"ground": "memphis"`).

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `confetti` (default) | scattered squiggles, triangles, zigzags and patterned solids | celebration, kids, market, music, summer |
| `stack` | a pile of big dotted, striped and gridded solids | design, fashion, education, art, gaming |
| `totem` | a totem of stacked solids standing in a patterned frame | art, culture, retro, craft, architecture |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `milano` (default) | light | `#f6efe1` · `#e3306a` · `#ff5d8f` `#12b3ad` `#ffc93c` `#3d5af1` |
| `carlton` | light | `#f4f1e9` · `#d92b21` · `#e63329` `#1f4fd8` `#f9c80e` `#1f9d7a` |
| `miami` | light | `#fde4e4` · `#0b8f8c` · `#00a9a5` `#ffd23f` `#ee4266` `#6a3fc4` |
| `mint` | light | `#d8f1e4` · `#d83a52` · `#ff6b6b` `#ffd93d` `#4d5bd8` `#ff9ecd` |
| `noir` | dark | `#17161c` · `#ffd23f` · `#ff5d8f` `#2ee6d6` `#ffd23f` `#7a6cff` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"confetti"` | what is drawn: confetti (scattered field of squiggles, triangles and dotted solids) | stack (a pile of big overlapping solids) | totem (a Sottsass-style totem in a patterned frame) |
| `density` | `1` | how much confetti: 0.4 = sparse … 1.8 = packed |
| `scale` | `1` | size of the pieces / the subject, 0.7–1.4 |
| `outline` | `1` | outline weight multiplier, 0 = no outlines |
| `misregister` | `1` | how far the colour sits from its outline, 0 = in register … 2 |

### opart
**Op Art** · three.js · fills the sheet · default type `swiss` (also suits `bold`, `slim`, `impact`, `brutal`, `techno`, `elegant`)

optical art — hard-edged stripes, checks or dot grids printed on a sheet that bulges, ripples or folds, so a flat two- or three-colour print seems to move; the pattern tapers to hairlines and bare paper where the copy sits. Bold, hypnotic, 1960s-modern. Good for music and club nights, design and fashion events, exhibitions, tech launches, anything that should vibrate.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `sphere` (default) | a chequered ball bulging out of the grid (Vasarely's Vega) | science, tech, sports, gaming, art |
| `wave` | stripes rippling like water or sound (Riley) | music, nightlife, fashion, summer, wellness |
| `fold` | striped planes pleated into a zigzag screen | architecture, design, business, education, retro |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `classic` (default) | light | `#f3f0e8` · `#d7321e` · `#111112` `#111112` `#f3f0e8` |
| `signal` | light | `#f4f0e6` · `#d7321e` · `#141416` `#e0391f` `#f4f0e6` |
| `cobalt` | light | `#f1eee6` · `#1f3fd0` · `#1c37c2` `#12205c` `#f1eee6` |
| `pool` | light | `#f2efe6` · `#d2452c` · `#0f4f5c` `#e2543a` `#a9dcd2` |
| `noir` | dark | `#0c0c0e` · `#ffd23f` · `#f3efe6` `#f3efe6` `#0c0c0e` |
| `acid` | dark | `#17102e` · `#ffd23f` · `#ff5c93` `#ffd23f` `#3a2a7a` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"sphere"` | how the sheet is bent: sphere (a ball pressing through the grid) | wave (ripples slanting across the stripes) | fold (pleated like a paper screen) |
| `pattern` | `"auto"` | what is printed on it: auto | stripes | checks | dots (auto = checks on the sphere, stripes on wave and fold) |
| `density` | `1` | pattern fineness: 0.6 = bold … 1.8 = fine |
| `bend` | `1` | strength of the bulge / ripple / pleat, 0.4–1.5 |
| `fade` | `1` | how far from the copy the print reaches full weight: 0.5 = abrupt … 1.8 = long taper |
| `angle` | `"auto"` | rotation of the print in degrees, or auto (chosen from the seed) |

### artdeco
**Art Deco Gilt** · three.js · subject on a plain ground · default type `luxe` (also suits `editorial`, `fatface`, `elegant`, `retro`, `myeongjo`, `impact`)

art-deco ornament in metallic line and flat colour — stepped skyscraper silhouettes, nested arches, chevrons and fish-scale fields drawn in fine parallel gold lines that catch the light like stamped foil; symmetrical, glamorous, 1920s. Good for galas and award nights, jazz and cocktail events, hotels and bars, luxury launches, year-end parties, theatre.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `tower` (default) | stepped skyscraper skyline under a great arch of parallel lines | city, business, architecture, finance, nightlife |
| `arch` | a gateway of nested arches between fluted pilasters | culture, luxury, film, celebration, art |
| `scallop` | a gilded fish-scale pattern dissolving towards the copy | fashion, beauty, food, luxury, music |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `noir` (default) | dark | `#0e0e10` · `#dcb65c` · `#d6b05a` `#1c3b3a` `#26262c` |
| `emerald` | dark | `#0b2a25` · `#e2c06c` · `#dcb865` `#16503f` `#071b18` |
| `midnight` | dark | `#0d1633` · `#cfd6e6` · `#c9cfdb` `#1d3068` `#080e24` |
| `rouge` | dark | `#35101c` · `#eab79c` · `#e2a685` `#5c1b2c` `#1f0810` |
| `ivory` | light | `#f3ecdb` · `#8f6b1e` · `#b48c38` `#1c2730` `#2e6c66` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"tower"` | what is drawn: tower (stepped skyscraper between lower towers under an arch of parallel lines) | arch (gateway of nested arches, fluted pilasters, chevron frieze) | scallop (fish-scale field that thins out towards the copy) |
| `line` | `1` | weight of the gilded lines, 0.6–2 |
| `detail` | `1` | how many parallel lines, chevrons and stars: 0.6 = sparse … 1.6 = rich |
| `sheen` | `1` | strength of the foil reflection, 0 = flat metallic ink … 1.6 |
| `scale` | `1` | size of the subject / of the scales, 0.7–1.3 |

### guilloche
**Guilloche Engraving** · three.js · fills the sheet · default type `didone` (also suits `elegant`, `fatface`, `garamond`, `roman`, `myeongjo`, `deco`)

banknote and certificate engraving — hundreds of even hairlines in one or two inks braided into rope-like ribbons, interlaced rosette rings round a medallion and lattice borders, over a pale wave underprint on rag paper, with the copy in a blank cartouche. Precise, trustworthy, quietly luxurious. Good for finance and business events, awards and ceremonies, anniversaries, premium launches, heritage and culture, invitations.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `ribbon` (default) | three braided wave ribbons sweeping across the sheet, the copy in a cleared cartouche | finance, business, music, celebration |
| `medallion` | a seal of concentric interlaced rosette rings on a ribbon — the watermark of a note | luxury, tradition, culture, celebration |
| `frame` | a certificate: a lattice border band with rosette knots round the whole sheet and the copy, a small seal on a ribbon | education, business, tradition, literature |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `banknote` (default) | light | `#eef0e3` · `#9b3b25` · `#1e4d3a` `#a8553a` `#9dbca9` |
| `bond` | light | `#f5eddc` · `#8c2c3c` · `#363170` `#a3443a` `#cdb98d` |
| `sterling` | light | `#e9edf2` · `#a8432c` · `#1c3557` `#6d5a9a` `#b3c2d4` |
| `treasury` | dark | `#0f2a22` · `#e2be6a` · `#d6b25e` `#8fbfa6` `#2f5c4a` |
| `midnight` | dark | `#111a33` · `#e3bb63` · `#c9d1e8` `#d9b260` `#2b3b68` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"ribbon"` | ribbon | medallion | frame |
| `density` | `1` | how many hairlines per band, 0.5–2 |
| `weight` | `1` | pen width multiplier, 0.5–2.5 |
| `inks` | `2` | 1 = everything in the first ink, 2 = two inks |
| `underprint` | `1` | pale security waves over the sheet, 0–2 |
| `cartouche` | `true` | double rule round the cleared copy panel (ribbon, medallion) |

### contour
**Contour Map** · three.js · fills the sheet · default type `swiss` (also suits `techno`, `slim`, `humanist`, `elegant`, `editorial`, `bold`)

topographic line drawing — even-width isolines of a height field with heavier index lines, one or two flat tint bands, spot heights and survey marks; precise, calm and exploratory. Good for outdoor and travel, research and data, architecture and planning, reports, anything about place, terrain or finding a way.

**Ground**: can be drawn under a cut-out subject (`"ground": "contour"`).

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `mountain` (default) | a massif of ridges and spurs with a summit triangle and index figures | outdoor, travel, nature, sports, wellness |
| `coast` | nautical chart: islands, tinted shallows, depth curves and soundings | travel, summer, nature, community, culture |
| `peak` | abstract data landscape: one smooth peak, cross-hair and the dotted path of an ascent | tech, science, business, finance, education |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `survey` (default) | light | `#f3efe4` · `#d2461f` · `#9a6238` `#a9c6a2` `#eda65c` |
| `nautical` | light | `#f4f2ea` · `#c2267a` · `#2c5796` `#9fcbe6` `#ecd49a` |
| `moss` | light | `#edf0e3` · `#c4531c` · `#3d6b4b` `#b7d19c` `#f1c768` |
| `blueprint` | dark | `#0d1b33` · `#ffb347` · `#86b4ff` `#1d4f8a` `#3c8fd6` |
| `carbon` | dark | `#121314` · `#c8f04a` · `#9da2a9` `#2f4a3d` `#7f9c2c` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"mountain"` | what the map shows: mountain (massif with ridges and a summit) | coast (nautical chart: islands, shallows, soundings) | peak (abstract data landscape: one smooth peak, cross-hair, ascent path) |
| `lines` | `1` | contour density: 0.6 = sparse … 1.6 = dense |
| `weight` | `1` | pen width multiplier |
| `tint` | `1` | strength of the filled elevation bands, 0 = lines only … 1.5 |
| `scale` | `1` | size of the landform around the focus, 0.7–1.4 |
| `labels` | `true` | spot heights, index figures and registration crosses (false = lines and tints only) |

### flowfield
**Flow Field** · three.js · fills the sheet · default type `grotesk` (also suits `swiss`, `slim`, `editorial`, `geometric`, `plex`, `elegant`)

generative plotter print — flat matte bands of two or three inks that follow an invisible flow field, each curving beside its neighbours without touching, from hairlines to very wide, parting round the copy like water round a stone inside a clean paper border. Good for art and design events, music programmes, science and tech talks, culture festivals, anything that should look composed and contemporary.

**Ground**: can be drawn under a cut-out subject (`"ground": "flowfield"`).

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `band`, `strip`, `corners`, `headline`, `baseline`, `axis`, `vertical` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `axis`, `side`, `vertical`

| Motif | Shows | Suits |
|---|---|---|
| `bands` (default) | ribbons from hairline to very wide, cut into colour segments | art, design, music, culture |
| `threads` | hundreds of fine even lines, combed like a wind map | science, tech, nature, wellness |
| `eddy` | bands wrapping round one or two still centres | music, science, art |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `primary` (default) | light | `#f2eee3` · `#d03a25` · `#22459a` `#d9412b` `#efb42a` `#16181d` |
| `clay` | light | `#f0e7d5` · `#b0472a` · `#b9552f` `#d8a03c` `#7f9273` `#2f2a27` |
| `ocean` | light | `#e4eaec` · `#c9462f` · `#16305e` `#2c8a92` `#e2644a` `#9cc7de` |
| `rose` | light | `#f3e2db` · `#8c1f3e` · `#7c1b39` `#de7b92` `#c88a1a` |
| `night` | dark | `#111316` · `#e8a23b` · `#efe6d3` `#e59a35` `#2f9f9a` `#5c6066` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"bands"` | bands | threads | eddy |

### wave
**Dot Wave** · three.js · subject on a plain ground · default type `swiss` (also suits `elegant`, `slim`, `square`, `techno`, `editorial`, `bold`)

calm, precise, minimal — a field of dots rolling like terrain or sound, lots of white space. Good for B2B/tech, research, finance, architecture, reports, anything that should feel considered rather than loud.

**Ground**: can be drawn under a cut-out subject (`"ground": "wave"`).

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `paper` (default) | light | `#f2f0ea` · `#f0441a` · `#16224f` `#2f55ff` `#ff4b1f` |
| `midnight` | dark | `#070b18` · `#7fb2ff` · `#2f55ff` `#6ea8ff` `#c9f6ff` |
| `forest` | light | `#eef1e6` · `#1c7a4a` · `#11231a` `#1f7a4d` `#b9d82c` |
| `graphite` | dark | `#101112` · `#ffd400` · `#62666d` `#f4f4f1` `#ffd400` |
| `blush` | light | `#f7ecec` · `#cf3348` · `#2a1418` `#d43d51` `#ff9e80` |

| Param | Default | Effect |
|---|---|---|
| `height` | `1.0` | wave amplitude multiplier |
| `detail` | `1.0` | 0.6 = broad swells … 1.8 = choppy |
| `dot` | `1.0` | dot size multiplier |

### haze
**Gradient Haze** · three.js · subject on a plain ground · default type `editorial` (also suits `swiss`, `slim`, `maru`, `humanist`, `elegant`, `myeongjo`, `brutal`)

quiet, atmospheric, type-first — large soft orbs of colour pooling around the copy and dissolving into a flat ground, with one or two hairline circles for structure. Good for typography-led posters: talks and lecture series, editorial covers, product statements, playlists, wellness, anything where the words are the hero.

**Ground**: can be drawn under a cut-out subject (`"ground": "haze"`).

Layouts — landscape: `center` (default), `left`, `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `center` (default), `top`, `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `dawn` (default) | light | `#f6f1ea` · `#c63419` · `#ff7a45` `#ff4f8b` `#7a5cff` `#ffc24a` |
| `lagoon` | light | `#eef4f5` · `#0b5fc4` · `#2f7bff` `#19c9c2` `#8f7bff` `#b6f0d8` |
| `orchard` | light | `#f4f2e6` · `#286e33` · `#8fd14f` `#ffd24a` `#2fae7a` `#ff9a5c` |
| `midnight` | dark | `#07080f` · `#9db4ff` · `#3355ff` `#8a4dff` `#00b8d4` `#ff5fa2` |
| `embers` | dark | `#0d0807` · `#ffb07a` · `#ff4d2e` `#ff9a3d` `#c2247a` `#ffd27a` |

| Param | Default | Effect |
|---|---|---|
| `strength` | `1` | how much colour: 0.6 = a whisper … 1.3 = saturated |
| `spread` | `1` | size of the colour field around the focus (0.7 = tight pool … 1.4 = fills the frame) |
| `accent` | `"rings"` | hairline accents: rings (circle + arc) | grid (circle + grid fragment) | circle | both | none |
| `line` | `1` | hairline weight multiplier |

### glyph
**Glyph Typography** · three.js · fills the sheet · default type `swiss` (also suits `grotesk`, `fatface`, `maru`, `bold`, `editorial`, `brutal`, `impact`, `dream`)

typographic art — the picture is made of letterforms: a giant character cropped by its column with a second one overprinted, a type-specimen grid of repeated glyphs, or a solid letter in front of stepped outline echoes, printed in two or three flat inks with a faint letterpress mottle. Confident, graphic, editorial. Good for design and type events, exhibitions, book fairs and literature, brand launches, school and language programmes.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `giant` (default) | one giant character cropped by the edges of its column, a second overprinted in another ink | design, art, literature, culture |
| `grid` | a type-specimen grid: the characters repeated cell by cell in several faces, a big hero cell, cells cleared around the copy | education, design, community, kids |
| `echo` | a solid letter in front of a run of outline echoes stepping back towards the open side | music, film, retro, fashion |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `poster` (default) | light | `#f1ede4` · `#e2412b` · `#151515` `#e2412b` `#2747c9` |
| `riso` | light | `#f6efe1` · `#e8466f` · `#1e2a68` `#ff5c84` `#f2a900` |
| `sage` | light | `#dfe4d5` · `#c9512a` · `#1d2620` `#d65a2f` `#6f8f74` |
| `noir` | dark | `#121212` · `#ffcf3a` · `#f2eee5` `#ffcf3a` `#ff5b37` |
| `klein` | dark | `#1d3bc9` · `#ffe14d` · `#ffffff` `#ffe14d` `#0b1557` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"giant"` | giant | grid | echo |
| `text` | `"A가&"` | the characters the picture is made of, in order (first = hero). Left unset, the first letters of the headline's words are used |
| `font` | `"black"` | black (Black Han Sans) | sans (Pretendard Black) | serif (Hahmlet Black) | display (Anton, Latin; Hangul falls back to Black Han Sans) |
| `echoes` | `9` | echo motif: number of stepped copies behind the letter, 3–24 |
| `marks` | `true` | small specimen marks (code point, face name) in a free corner |
| `print` | `1` | letterpress mottle and paper tooth, 0 = clean vector … 2 = worn |

### flux
**Neon Flux** · three.js · fills the sheet · default type `impact` (also suits `techno`, `elegant`, `brutal`, `esamanru`)

dark, electric, high-energy — thousands of glowing light trails swirling through a flow field. Good for tech conferences, music/club nights, gaming, hackathons, launches that want drama.

Layouts — landscape: `left` (default), `top`, `bottom`, `corners`, `headline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `corners`, `vertical`, `axis`, `side`

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `ultraviolet` (default) | dark | `#06050e` · `#c4b0ff` · `#7c4dff` `#ff3d9a` `#00e5ff` `#ffd166` |
| `ember` | dark | `#0c0605` · `#ffb347` · `#ff5a1f` `#ffb300` `#ff2d55` `#ffe8a3` |
| `aqua` | dark | `#030d16` · `#5ff0ff` · `#00e5ff` `#00ffa3` `#2f6bff` `#b6fff0` |
| `lime` | dark | `#060905` · `#c6ff3d` · `#c6ff3d` `#3dffb5` `#ffe93d` `#ffffff` |
| `mono` | dark | `#08080a` · `#d6d6dc` · `#ffffff` `#9aa0a6` `#e8e8e8` `#6d7178` |

| Param | Default | Effect |
|---|---|---|
| `density` | `1.0` | 0.5 = airy … 2 = dense trails |
| `turbulence` | `1.0` | 0 = clean orbit … 2 = chaotic |
| `bloom` | `1.0` | glow strength |

### plexus
**Plexus Network** · three.js · subject on a plain ground · default type `swiss` (also suits `techno`, `square`, `elegant`, `bold`, `luxe`)

network drawing — evenly spaced nodes joined to their neighbours by hairlines so that a form (sphere, torus, flowing sheet, constellation) reads as a fine irregular mesh, crisp in front and faint behind, with a few glowing signal paths; precise, airy and intelligent. Good for AI and data topics, science, finance, summits, research reports, education.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `sphere` (default) | a globe of nodes and links, one flank dissolving into free points | tech, science, business, finance |
| `torus` | a ring-shaped mesh seen from above — cycles, loops, platforms | science, design, finance, tech |
| `wave` | a flowing sheet of nodes, like a sound or data surface | music, science, wellness, tech |
| `constellation` | a sparse cloud of large and small stars joined by a single branching line | education, community, celebration, winter |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `midnight` (default) | dark | `#060913` · `#8fb6ff` · `#2b4bff` `#7fd0ff` `#ffbf69` |
| `aurora` | dark | `#04110f` · `#6df2c8` · `#0f8f86` `#7af5cf` `#c9a2ff` |
| `ember` | dark | `#0e0707` · `#ff9d5c` · `#b3261e` `#ff8a4c` `#ffe08a` |
| `paper` | light | `#f3f1ea` · `#d2401a` · `#8d97b5` `#1c2a63` `#e2491c` |
| `mist` | light | `#e9eef0` · `#0b7285` · `#8fb0b8` `#0f4c5c` `#e0563a` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"sphere"` | the form the network takes: sphere | torus | wave | constellation |
| `density` | `1` | number of nodes: 0.5 = sparse and graphic … 2 = fine mesh |
| `scatter` | `1` | how far one flank of the form loosens into free nodes (0 = closed form … 2) |
| `signals` | `5` | glowing signal paths ending in a ringed hub, 0–12 |
| `facets` | `1` | faintly filled triangles of the mesh (0 = lines only … 3) |
| `line` | `1` | hairline weight multiplier |
| `glow` | `1` | bloom and backdrop glow (0 = flat) |

### globe
**Dotted Globe** · three.js · subject on a plain ground · default type `techno` (also suits `swiss`, `elegant`, `impact`)

global, connected, precise — a globe drawn in evenly spaced dots, with glowing nodes joined by great-circle arcs, thin orbit rings and a rim of light. Good for AI and network topics, finance, summits, international events, logistics, telecom.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `orbit` (default) | dark | `#05070f` · `#7fb2ff` · `#2447ff` `#5fb8ff` `#ffc56e` `#ffffff` |
| `signal` | dark | `#03100e` · `#5ff0c0` · `#0a8f78` `#5ff0c0` `#ffe27a` `#f4fff9` |
| `ultra` | dark | `#090615` · `#c4a8ff` · `#5a2dff` `#c56bff` `#5fe3ff` `#ffffff` |
| `paper` | light | `#f2f0ea` · `#c8350f` · `#16224f` `#2f55ff` `#ff4b1f` `#16224f` |
| `ledger` | light | `#eef2ee` · `#0b7350` · `#10261d` `#12845c` `#e8641c` `#10261d` |

| Param | Default | Effect |
|---|---|---|
| `density` | `1` | number of dots: 0.5 = sparse and graphic … 2 = fine |
| `dot` | `1` | dot size multiplier |
| `nodes` | `7` | glowing nodes joined by arcs (0 = none … 12) |
| `rings` | `2` | orbit rings, 0–3 |
| `land` | `0.6` | 0 = perfectly even dots … 1 = strong continent-like variation in dot weight |
| `glow` | `1` | rim light and backdrop glow (0 = flat) |

### pointcloud
**Point Cloud Stipple** · three.js · subject on a plain ground · default type `swiss` (also suits `editorial`, `slim`, `plex`, `techno`, `garamond`)

a form drawn only with dots — a surface sampled into tens of thousands of points whose size and density follow the light: ink stippling like an engraving on a pale sheet, or a luminous 3D scan on black. Precise, quiet, scientific. Good for science and research, architecture and design talks, museums and exhibitions, tech launches, craft and heritage programmes.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `knot` (default) | a torus-knot sculpture in stipple | science, tech, design, education |
| `terrain` | a block of mountain terrain cut out like a scan specimen, strata on its walls | outdoor, nature, travel, science |
| `vase` | an amphora-like vessel standing on its stippled shadow | art, culture, craft, tradition |
| `shell` | a conical sea shell winding up to its tip | nature, science, summer, literature |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `engraving` (default) | light | `#f3efe6` · `#c2412d` · `#16192a` `#3b4766` `#c2412d` |
| `sepia` | light | `#efe5d3` · `#9c3d1c` · `#2e1c10` `#7a4a26` `#b8642e` |
| `cobalt` | light | `#eef1f6` · `#e0482b` · `#0e2a8a` `#2f6bd8` `#e0482b` |
| `scan` | dark | `#05070d` · `#59f0ff` · `#1c3a9e` `#2fb5ff` `#d4fcff` |
| `ember` | dark | `#0c0807` · `#ffb15c` · `#7a1f1a` `#ff6a3d` `#ffe3b8` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"knot"` | knot | terrain | vase | shell — the form the dots describe |
| `dot` | `1.0` | dot spacing and size (0.4 = fine engraving … 2.5 = coarse) |
| `contrast` | `1.0` | how hard the light sorts the dots (0.3 = soft … 2 = graphic) |
| `contour` | `1.0` | extra dots along the silhouettes, 0 = none |
| `color` | `1.0` | 0 = one ink (pale grounds) … 1 = palette colours for shadow and mid-tone dots |

### blueprint
**Blueprint Drawing** · three.js · subject on a plain ground · default type `techno` (also suits `swiss`, `square`, `bold`, `impact`, `brutal`, `dream`)

technical drawing — an isometric line drawing of a solid model on blueprint paper: heavy outlines, light inner edges, dashed hidden lines, dimension arrows with figures, dash-dot centre lines, numbered balloons, a ruled grid and a border with a title block; exact, engineered, quietly nostalgic. Good for architecture and engineering events, maker fairs, product launches, hackathons, science and design education.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `tower` (default) | a high-rise with podium, setbacks and mast, floors ruled on the curtain wall | architecture, city, business, finance |
| `gear` | two meshing spur gears on a base plate, with centre lines | tech, science, craft, education |
| `rocket` | a rocket in exploded view: nose cone lifted off the body along its axis | science, tech, kids, education |
| `chair` | a wooden side chair with seat and back dimensions — a product sheet | design, craft, market, art |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `cyanotype` (default) | dark | `#1d4a9e` · `#ffd85e` · `#f4f8ff` `#9fc3ff` `#ffd85e` |
| `navy` | dark | `#0c1f3f` · `#5fe0ff` · `#dff3ff` `#57b8e8` `#5fe0ff` |
| `vellum` | light | `#efe8d6` · `#c8321e` · `#1d1d21` `#8a8474` `#c8321e` |
| `graphite` | dark | `#1b1c1f` · `#ffb347` · `#efede6` `#8d8f96` `#ffb347` |
| `cuttingmat` | dark | `#1f5b46` · `#ffe36b` · `#eefaf0` `#9fd9b8` `#ffe36b` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"tower"` | what is drawn: tower | gear | rocket | chair |
| `hidden` | `1` | dashed hidden lines: 0 = none … 1 = normal … 2 = long dashes |
| `dims` | `true` | dimension lines, centre lines and balloons (false = the bare drawing) |
| `grid` | `1` | strength of the ruled grid on the sheet, 0–2 |
| `hatch` | `1` | hatching on the shaded flank of the model, 0–2 |
| `line` | `1` | pen weight multiplier, 0.5–2 |
| `titleBlock` | `true` | title block in a free corner of the border |

### synthwave
**Synthwave** · three.js · fills the sheet · default type `retro` (also suits `impact`, `comic`, `cute`, `techno`, `brutal`, `bold`, `dunggeunmo`)

the 1980s retro-future as a full picture — a neon grid in true perspective to a glowing horizon, a big sun cut by horizontal slits, chrome-faceted low-poly mountains or a mirrored skyline, soft bloom; nostalgic, electric, cinematic. Good for music and club nights, retro gaming, film screenings, summer festivals, tech parties, launch teasers.

Layouts — landscape: `top` (default), `left`, `right`, `bottom`, `corners`, `headline`, `baseline`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `sun` (default) | grid and slit sun with a distant chrome range on the horizon | music, retro, summer, film |
| `city` | a skyline with lit windows in front of the sun, mirrored in the glossy floor | nightlife, city, gaming, tech |
| `canyon` | wireframe mountain walls on both sides, the sun in the gap | travel, outdoor, gaming, film |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `outrun` (default) | dark | `#120a2e` · `#ffd23f` · `#5a1a8c` `#ff2e93` `#ff4fd8` `#ffd23f` |
| `miami` | dark | `#0b1740` · `#5ff2e6` · `#7a2a8f` `#ff5fa2` `#35e6e0` `#ffd98a` |
| `laser` | dark | `#0b0710` · `#ff9f43` · `#5c1030` `#ff2d55` `#ff7a2a` `#ffe066` |
| `ice` | dark | `#060f26` · `#7fe3ff` · `#1b3f8f` `#4d7dff` `#5fe6ff` `#e8fbff` |
| `vapor` | light | `#f1e4f3` · `#d6247f` · `#ffc7b8` `#ff5fa8` `#17a5a8` `#ffe07a` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"sun"` | what stands on the horizon: sun | city | canyon |
| `sun` | `1` | size of the sun, 0.5–1.6 |
| `slits` | `6` | horizontal slits in the lower half of the sun, 0–10 |
| `grid` | `1` | grid density, 0.5 = wide cells … 2 = fine |
| `height` | `1` | height of mountains or towers, 0.4–1.6 |
| `chrome` | `1` | chrome sheen on mountain facets and tower flanks, 0–1.5 |
| `glow` | `1` | bloom and sun glow, 0–2 |
| `stars` | `1` | stars in the upper sky, 0–2 |

### glitch
**Glitch Signal** · three.js · subject on a plain ground · default type `techno` (also suits `bitmap`, `dunggeunmo`, `cute`, `arcade`, `grotesk`, `brutal`, `condensed`)

CRT / VHS / datamosh — a simple, strong subject broken like a damaged video signal: pixel-sorted rows dragged into smears, slipped macroblocks, slices torn sideways, red and blue guns split apart, scanlines and a VHS tracking band, with the copy left on a clean screen. Electric, edgy, a little nostalgic. Good for tech and gaming events, music and club nights, film and media festivals, hackathons, youth and fashion launches.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `solids` (default) | a stack of lit primitive solids — cube, cylinder, sphere, a cone and a ring | tech, design, education, gaming |
| `horizon` | a landscape on a CRT screen: plain sun disc, ridges, water, VCR display | music, film, retro, nightlife |
| `shapes` | bold flat geometry — disc, square, triangle, ruled bars | art, fashion, design, tech |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `crt` (default) | dark | `#0c0d12` · `#ff3d7f` · `#33d6ff` `#ff3d7f` `#ffe14a` |
| `vhs` | dark | `#1b1033` · `#ffd23d` · `#5ad1ff` `#ff5fa2` `#ffd23d` |
| `terminal` | dark | `#06140c` · `#3dff8b` · `#2fd67a` `#d9ffe6` `#9dffc4` |
| `paper` | light | `#ecebe6` · `#ff2d2d` · `#141414` `#ff2d2d` `#1f49ff` |
| `lilac` | light | `#e7e2f3` · `#ff6a2b` · `#2a1f66` `#7a3cff` `#ff6a2b` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"solids"` | solids | horizon | shapes |
| `amount` | `1` | overall damage, 0 = clean signal … 2 = wrecked |
| `sort` | `1` | pixel-sorted rows and their smears, 0–2 |
| `split` | `1` | red/blue gun separation, 0–3 |
| `scanlines` | `1` | scanline and aperture-grille strength, 0–2 |
| `osd` | `true` | horizon motif: VCR on-screen display (PLAY, counter, channel) |

### pixel
**Dithered Retro** · three.js · subject on a plain ground · default type `techno` (also suits `retro`, `dunggeunmo`, `cute`, `comic`, `brutal`, `impact`, `swiss`)

retro computing — a lit still life of chunky primitives on a checkerboard slab in front of a pin-striped desktop window, printed in three to five colours with an ordered Bayer dither and chunky pixels; the backdrop stays one flat colour. Good for hackathons, game jams, developer events, zines, indie music, anything lo-fi.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `pocket` (default) | light | `#c9d8a2` · `#2d5e2e` · `#0f380f` `#306230` `#8bac0f` |
| `paper` | light | `#f1eee4` · `#2a46d6` · `#16161a` `#77756d` `#bdb9ab` |
| `zine` | light | `#f5ead6` · `#2a56c6` · `#1d2a5b` `#2f6fbf` `#f2b632` |
| `amber` | dark | `#140c04` · `#ffb000` · `#5a2f00` `#c46a00` `#ffb000` `#ffe7b8` |
| `arcade` | dark | `#170f33` · `#5fe6ff` · `#4a2a8a` `#b23ad0` `#ff7ad9` `#ffe6fb` |

| Param | Default | Effect |
|---|---|---|
| `pixel` | `1.0` | pixel size: 0.5 = fine … 2 = very chunky (always a divisor of the output width) |
| `bayer` | `4` | dither matrix: 2 = coarse checker, 4 = classic, 8 = smoothest ramps |
| `window` | `true` | the desktop window (rectangle with a striped title bar and a gradient) behind the still life |
| `dust` | `1.0` | 0 = none … 3 = many small dashes and boxes of pixels around the subject |
| `contrast` | `1.0` | 0.5 = flat … 1.6 = deep shadows |
| `outline` | `"auto"` | one-pixel outline: auto (on light backdrops), true, false |

### bokeh
**Bokeh Lights** · three.js · fills the sheet · default type `elegant` (also suits `luxe`, `calli`, `editorial`, `bold`, `impact`)

out-of-focus photography — lights thrown into soft discs of several sizes with real lens character (brighter rims, colour fringes, cat's-eye discs towards the corners, grain) over a night or dusk ground; the subject is only hinted at by how the lights are arranged. Warm, cinematic, festive. Good for concerts and night events, year-end parties, city and film programmes, festivals, weddings and winter campaigns.

**Ground**: can be drawn under a cut-out subject (`"ground": "bokeh"`).

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `city` (default) | a street at night: rows of lamps running to a vanishing point, head- and tail-lights, signals, window grids | city, nightlife, film, business |
| `string` | festive garlands: sagging strings of evenly spaced bulbs at several depths | celebration, market, winter, community |
| `lantern` | a stream of warm lanterns rising and shrinking into the distance | tradition, culture, celebration, wellness |
| `glitter` | abstract: a diagonal drift of mixed discs | fashion, luxury, music, beauty |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `midnight` (default) | dark | `#070a16` · `#ffc56e` · `#ffb04a` `#ff4d6d` `#39d6c8` `#fff1d6` |
| `dusk` | dark | `#1a1638` · `#ff9d7a` · `#ffb36b` `#ff6f91` `#8ea2ff` `#ffe9cf` |
| `ember` | dark | `#120806` · `#ffb347` · `#ffa63d` `#ff6a2f` `#ffd98a` `#fff0d0` |
| `pine` | dark | `#06120f` · `#ffd27a` · `#ffcf70` `#ff5a4d` `#57e39b` `#fff4dc` |
| `blossom` | light | `#f7ece4` · `#d2567a` · `#f48fa9` `#f6b765` `#a596e6` `#ffffff` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"city"` | what the lights hint at: city | string | lantern | glitter |
| `density` | `1.0` | 0.5 = few lights … 2 = crowded |
| `size` | `1.0` | blur-disc size multiplier (how far out of focus) |
| `rim` | `1.0` | brightness of the disc rims: 0 = flat discs … 2 = soap-bubble rings |
| `cateye` | `1.0` | how strongly discs are squeezed into cat's eyes towards the corners (0 = all round) |
| `blades` | `0` | 0 = round aperture; 5–9 = softly polygonal discs |
| `glow` | `1.0` | bloom around the lights |
| `grain` | `1.0` | film grain (0–2) |

### caustics
**Water Caustics** · three.js · fills the sheet · default type `bold` (also suits `swiss`, `round`, `slim`, `friendly`, `editorial`, `elegant`, `retro`, `gmarket`)

sunlit water seen from above — bright caustic nets of refracted light rippling over a pool floor, sand or a plain ground, with gentle colour fringes, sun glints and the shadow of something floating. The light is computed, not painted: rays are refracted through a wave field and gather where the water focuses them. Fresh, summery, clean. Good for summer festivals and pool parties, swimming and water sports, resorts and travel, spas and wellness, drinks, beauty and glassware, design programmes.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `pool` (default) | square pool tiles, a darker lane line, a swim ring and its shadow | summer, sports, celebration, kids |
| `sand` | shallow sea over rippled sand shading into deeper water, a few small fish | travel, nature, wellness, outdoor |
| `gel` | abstract: pools of coloured liquid on a plain ground, each throwing its own caustic net | design, beauty, science, art |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `pool` (default) | light | `#63c9d8` · `#ff5a3c` · `#1479b8` `#e6faf6` `#ff5a3c` `#ffd23f` |
| `lagoon` | light | `#8edbc3` · `#f2603c` · `#1f9c8f` `#effcec` `#f2603c` `#ffe07a` |
| `shore` | light | `#7fd0cf` · `#e8623a` · `#2191ad` `#f3e3bd` `#e8623a` `#fff3d6` |
| `midnight` | dark | `#0d2f52` · `#ffb84d` · `#061a33` `#7fe0f0` `#ffb84d` `#ff6f91` |
| `prism` | light | `#f5f2ec` · `#ff4f6d` · `#19b5e6` `#ff4f9a` `#ffc928` `#7b5cff` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"pool"` | pool (tiles, lane line, swim ring) | sand (shallow sea over rippled sand, fish) | gel (abstract pools of coloured liquid on a plain ground) |
| `waves` | `1.0` | how strongly the water focuses the light: 0.5 = soft dapples … 1.8 = sharp, busy nets |
| `scale` | `1.0` | size of the waves and so of the caustic cells (0.5–2) |
| `fringe` | `1.0` | colour fringes on the caustic lines (0 = none) |
| `float` | `"auto"` | what floats and casts a shadow: auto | ring | fish | none |
| `glint` | `1.0` | sun glints on the surface (0–2) |
| `tiles` | `1.0` | pool motif: tile density (0.5 = large tiles … 2 = mosaic) |
| `grain` | `1.0` | film grain (0–2) |

### fluted
**Fluted Glass** · three.js · fills the sheet · default type `elegant` (also suits `grotesk`, `slim`, `didone`, `luxe`, `swiss`, `wide`)

a pane of reeded glass standing in front of soft coloured light — every rib is a small cylindrical lens that squeezes and flips the slice of picture behind it, so a sun, a horizon or a few out-of-focus blooms break into vertical slivers with dark joints, thin specular lines and a slight colour fringe, while the same forms run on smooth and whole past the pane's one crisp edge. Calm, luminous, material. Good for design and architecture programmes, fragrance, beauty and fashion launches, album and concert artwork, exhibitions, wellness and spa, summer and late-night events.

**Ground**: can be drawn under a cut-out subject (`"ground": "fluted"`).

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `band`, `strip`, `corners`, `headline`, `baseline`, `axis`, `vertical` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `axis`, `side`, `vertical`

| Motif | Shows | Suits |
|---|---|---|
| `orb` (default) | one large disc in a gentle two-colour gradient and one small one; the pane's edge cuts through the large disc | design, music, art, architecture |
| `dusk` | a horizon: a low sun sinking into three long, rolling bands of colour that the ribs step into slices | nightlife, music, summer, wellness |
| `bloom` | three large soft overlapping blooms and a bud, like out-of-focus flowers behind bathroom glass | beauty, fashion, wellness, art |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `apricot` (default) | light | `#f5ecdd` · `#c2410c` · `#ff8a1f` `#ff4f5e` `#d81e7a` `#ffd9a0` |
| `lagoon` | light | `#e9f0ec` · `#0b6f7d` · `#12b5a6` `#1f4fd8` `#b8e62e` `#bfeee4` |
| `iris` | light | `#edeaf2` · `#7a3cc9` · `#ff5fa8` `#ffb020` `#7b3ff2` `#e3d4ff` |
| `ember` | dark | `#0e0908` · `#ff8a4c` · `#ffae2b` `#ff4a1c` `#d6246e` `#ffd9a8` |
| `deepsea` | dark | `#071a33` · `#5fd8e8` · `#19d3e6` `#2a6bff` `#27c48f` `#bdf3ee` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"orb"` | what stands behind the glass: orb (one large gradient disc and a small one) | dusk (a low sun sinking into rolling bands of colour) | bloom (large soft overlapping blooms) |
| `ribs` | `1` | rib width multiplier (1 = about 1.6% of the short side; 0.6 = fine reeding … 2 = broad flutes) |
| `direction` | `"vertical"` | which way the ribs run: vertical | horizontal |
| `lens` | `1` | how strongly each rib bends the picture (0.5 = gentle ripple … 1.6 = heavy slicing) |
| `fringe` | `1` | colour fringes inside the ribs (0 = none) |
| `sheen` | `1` | strength of the specular lines on the ribs (0–2) |
| `grain` | `1` | fine grain (0–2) |

### inkdrop
**Ink in Water** · three.js · subject on a plain ground · default type `editorial` (also suits `myeongjo`, `calli`, `luxe`, `elegant`, `swiss`)

high-speed ink photography — pigment blooming in clear water: translucent bells and veils rolled up by a real fluid simulation, their edges gathering into fine curling filaments, one to three inks on a clean pale or black ground. Quiet, sensual, a little scientific. Good for exhibitions and art programmes, literature and calligraphy, beauty and fragrance, classical and jazz nights, science talks, tea and wellness brands.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `plume` (default) | one ink drop rising: a bell-shaped head trailing a thin stem | art, science, wellness, literature |
| `drop` | the same drop falling from above | beauty, luxury, design, food |
| `duet` | two inks released towards each other, meeting and wrapping round one another | music, culture, fashion, community |
| `band` | a horizontal train of puffs: a cloud band of braided inks | film, tradition, education, autumn |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `indigo` (default) | light | `#f6f3ec` · `#c8324b` · `#1f2f8f` `#d43b55` `#f2a13a` |
| `sumi` | light | `#f2efe7` · `#b5382a` · `#15151b` `#59616c` `#b5382a` |
| `lagoon` | light | `#eef5f3` · `#0b7f8c` · `#0b7f8c` `#2a4fb0` `#49b89a` |
| `noir` | dark | `#07070a` · `#ffc56e` · `#efe9dd` `#ffb14a` `#6fd3ff` |
| `nebula` | dark | `#0a0a1e` · `#ff7ab8` · `#ff4f9a` `#5b7bff` `#ffd166` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"plume"` | plume (one drop rising) | drop (falling from above) | duet (two inks meeting) | band (a horizontal train of puffs) |
| `inks` | `2` | how many of the palette's inks are used, 1–3 |
| `strength` | `1.0` | how concentrated the ink is: 0.5 = pale veils … 2 = dense |
| `filaments` | `1.0` | share of ink gathered into crisp edge filaments (0–2.5) |
| `ripple` | `1.0` | waviness of the bells round their axis: 0 = smooth, lathed … 2 = frilled |
| `size` | `1.0` | how much of the art area the ink fills (0.5–1.3) |
| `grain` | `1.0` | film grain (0–2) |

### liquid
**Liquid Gradient** · three.js · subject on a plain ground · default type `bold` (also suits `grotesk`, `round`, `slim`, `friendly`, `swiss`, `wide`, `paperlogy`)

liquid-gradient 3D — lava-lamp metaballs that melt into one another, a colour gradient flowing through the form, a luminous rim, satin or glossy finish and fine film grain, as in contemporary brand visuals. Fluid, warm, current. Good for brand and product launches, beauty and fashion, music and nightlife, design talks, tech and wellness campaigns.

**Ground**: can be drawn under a cut-out subject (`"ground": "liquid"`).

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `mass` (default) | one large merging mass of liquid, a drop joining it and two free droplets | design, beauty, tech, fashion |
| `rise` | lava lamp: a heavy blob below, a second pinching off, drops rising away | music, nightlife, retro, wellness |
| `wave` | a thick liquid sheet swelling and curling sideways, its lip breaking into drops | summer, travel, beauty, finance |
| `drip` | a drop stretching from a heavy mass, about to fall | food, beauty, art, luxury |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `peach` (default) | light | `#f6efe9` · `#ff4f6d` · `#ff8a5c` `#ff4f8b` `#7a5cff` `#ffd3b0` |
| `lagoon` | light | `#eaf1f6` · `#1e5bff` · `#1e5bff` `#13c0d8` `#a68bff` `#e6fbff` |
| `acid` | light | `#f0f1e8` · `#5a37ff` · `#b8f53a` `#22c79a` `#5a37ff` `#ff9ad9` |
| `noir` | dark | `#0c0a12` · `#ffb36b` · `#3a1ed0` `#ff3d8b` `#ff9a3d` `#ffe2c4` |
| `ultraviolet` | dark | `#090e1d` · `#7cf2ff` · `#1a2db5` `#7a3cff` `#00c2ff` `#d8f6ff` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"mass"` | mass | rise | wave | drip — what the liquid does |
| `finish` | `"satin"` | matte | satin | gloss — how much the surface reflects |
| `grain` | `1.0` | film grain over the picture, 0 = clean |
| `glow` | `1.0` | soft coloured glow on the ground behind the liquid, 0 = plain ground |
| `wobble` | `1.0` | small irregularity of the surface, 0 = perfectly smooth |
| `detail` | `1.0` | mesh resolution multiplier (0.5–1.6) |

### aurora
**Aurora Gradient** · three.js · subject on a plain ground · default type `friendly` (also suits `bold`, `round`, `dongle`, `pop`, `swiss`, `ssurround`)

bright, friendly, modern — a pearly liquid blob floating on a soft colour-mesh gradient. Good for product launches, community events, education, lifestyle.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `sunset` (default) | light | `#fff3ea` · `#f0356b` · `#ff6a3d` `#ff3d81` `#ffb347` `#7a5cff` |
| `ocean` | light | `#edf5ff` · `#1f5eff` · `#2f6bff` `#00c2ff` `#7a5cff` `#00dcb4` |
| `mint` | light | `#effaf4` · `#009e72` · `#00c389` `#b6f36a` `#00a3ff` `#ffd166` |
| `candy` | light | `#fff0f7` · `#d92d86` · `#ff5fa2` `#a66bff` `#ffd23f` `#3ec9ff` |
| `night` | dark | `#0b0b1c` · `#ff7ab8` · `#6a4cff` `#ff3d9a` `#00d4ff` `#ffb347` |

| Param | Default | Effect |
|---|---|---|
| `blob` | `0.24` | 0 = perfect sphere … 0.4 = very wobbly |
| `satellites` | `5` | number of small companion spheres |
| `glow` | `1.0` | strength of the colour field behind the subject |

### ribbon
**Silk Ribbon** · three.js · subject on a plain ground · default type `elegant` (also suits `luxe`, `melody`, `slim`, `friendly`, `bold`, `swiss`)

elegant, glossy, premium — one continuous band of satin colour twisting through space like a sculpture, with a soft pool of light behind it. Good for product and brand launches, premium tech, keynotes, awards, fashion and beauty.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `silk` (default) | light | `#f3efe9` · `#5b3df5` · `#5b3df5` `#ff4f8b` `#ffb347` `#22c7e8` |
| `glacier` | light | `#edf2f7` · `#1a55f0` · `#1f5eff` `#19c3e6` `#7d6bff` `#b8f0ff` |
| `nebula` | dark | `#07070d` · `#b9a8ff` · `#7b5cff` `#ff4fa3` `#22d3ee` `#ffb86b` |
| `ember` | dark | `#0d0806` · `#ffb36b` · `#ff5a1f` `#ffb300` `#ff2d6f` `#7a3cff` |
| `champagne` | dark | `#0d0b08` · `#e8c98f` · `#e8c98f` `#fff3d6` `#c98b5e` `#7d5a3c` |

| Param | Default | Effect |
|---|---|---|
| `form` | `"eight"` | eight (one crossing, reads most like a ribbon) | ring (open loop — leaves a clear middle) | knot (trefoil, three crossings) |
| `twist` | `1` | full turns of the band per lap, in steps of 0.5 (0.5 = Möbius, calm … 2 = lively) |
| `width` | `1` | band width multiplier (0.6 = slender … 1.4 = broad) |
| `thickness` | `0.2` | cross-section depth ÷ width: 0.08 = flat ribbon … 0.2 = soft lens … 1 = round tube |
| `gloss` | `1` | 0.6 = satin … 1.6 = lacquer |
| `glow` | `1` | strength of the colour pool behind the sculpture (0 = flat backdrop) |

### turing
**Reaction–Diffusion Relief** · three.js · fills the sheet · default type `swiss` (also suits `editorial`, `slim`, `maru`, `bold`, `techno`)

an organic print — a Gray–Scott reaction–diffusion pattern embossed like letterpress: an irregular drift of combed stripes (wood grain, fingerprint) breaking into packed dots, then a calm flat field for the copy. Good for biotech and science, craft and textile, wellness, organic brands, research reports.

**Ground**: can be drawn under a cut-out subject (`"ground": "turing"`).

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `indigo` (default) | light | `#f1ece1` · `#2f55b8` · `#27336e` `#3f6fb5` `#e9b44c` |
| `moss` | light | `#eef0e2` · `#3f7a3a` · `#2f5d46` `#7da04a` `#e9b44c` |
| `ochre` | light | `#f5ecdc` · `#8a5a16` · `#8a5a2b` `#d49a35` `#33261a` |
| `midnight` | dark | `#0e1424` · `#f2b84b` · `#ece2c8` `#86bccb` `#f2b84b` |
| `berry` | dark | `#2a1030` · `#ff8fa3` · `#ff6f91` `#ffb199` `#5b1f5e` |

| Param | Default | Effect |
|---|---|---|
| `pattern` | `"coral"` | core of the drift: coral = long combed stripes … worms = shorter broken stripes … spots = packed dots (the rim is always dots) |
| `flow` | `1.0` | 0.7 = loosely combed … 1.5 = very straight grain (stripes always share one direction) |
| `scale` | `1.0` | 0.6 = fine pattern … 1.8 = large |
| `relief` | `1.0` | 0 = flat print … 2 = deep emboss |
| `buds` | `1.0` | 0–1 strength of the third-colour buds at stripe tips and inside dots |
| `spread` | `1.0` | 0.5 = a narrow drift at the focus … 2 = fills more of the sheet |
| `steps` | `2600` | simulation steps (fewer = younger, blobbier pattern) |

### numerals
**Giant Numerals** · HTML · subject on a plain ground · default type `grotesk` (also suits `brutal`, `fatface`, `esamanru`, `square`, `dream`, `condensed`, `didone`, `editorial`, `impact`, `swiss`, `wide`, `slab`, `bold`)

the date as the image — the month and the day of the event set enormous, together, in the poster's own display face, captioned with the year, the weekday and the time on hairline rows, in the manner of Swiss and contemporary editorial posters. Vector, so it is razor-sharp at any size, and it changes character with the type theme (a heavy grotesque, a high-contrast serif, a brush). Reads the date from the event information; the day is never shown large on its own. Good for anything with one date to remember: concerts, openings, launches, deadlines, church and school events, sales.

Needs a date in the copy. **Cut-out**: can stand on a ground — checked with `haze`, `halftone`, `bokeh`, `liquid`, `turing`, `contour`, `pattern/dots`, `pattern/grid`, `pattern/checker`, `fluted`, `flowfield/threads`.

Layouts — landscape: `band` (default), `top`, `left`, `right`, `strip`, `axis`, `corners` · portrait: `top` (default), `bottom`, `axis`, `corners`

| Motif | Shows | Suits |
|---|---|---|
| `date` (default) | month.day on one line (11.15), as large as the space allows; year and weekday above, time below — a wide image | music, culture, community, celebration, education, tech, business, sale, sports |
| `stack` | month over day (11 above 15), each line fitted to the same width and printed in its own ink — or the first and last day of a run | design, art, fashion, film, culture |
| `words` | month and day spelled as a date: 11월 over 15일 (NOV over 15 in English), each line fitted to the same width | community, family, education, tradition, celebration, market |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `poster` (default) | light | `#f2eee6` · `#e3412a` · `#e3412a` `#161616` `#2a49c8` |
| `cobalt` | dark | `#1f3fd0` · `#ffd84a` · `#ffd84a` `#ffffff` `#0c1a66` |
| `ink` | dark | `#141414` · `#ff5a36` · `#f3efe6` `#ff5a36` `#8d8a84` |
| `meadow` | light | `#e6ecd9` · `#d95a2b` · `#1f5a3c` `#d95a2b` `#e8b23a` |
| `blush` | light | `#f6e3dc` · `#c2264b` · `#c2264b` `#3a1620` `#f0a04a` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"date"` | date | stack | words — month and day are always shown together |
| `treatment` | `"solid"` | solid | offset (second ink out of register behind an outline) | outline | echo (stepped outlines behind) | slice (three bands in three inks) |
| `treatment (stack)` | `"solid"` |  |
| `treatment (words)` | `"solid"` |  |

### calendar
**Calendar** · HTML · subject on a plain ground · default type `grotesk` (also suits `swiss`, `fatface`, `gmarket`, `humanist`, `paperlogy`, `square`, `editorial`, `bold`, `condensed`, `myeongjo`, `slab`, `didone`, `retro`)

the date shown on a calendar — a month sheet set in fine rules and numerals with the event day marked by a filled disc (a run of days by a capped band), a daily tear-off block (일력) with month and day set large together, or the strip of the event's week with the day picked out in a pill. Drawn in the poster's own faces in two or three flat inks, so it is vector and changes voice with the type theme, from a Swiss grotesque to a 명조. Reads the date (and a range) from the event information. Good for anything people must put in their diary: services and church events, school and community days, openings, deadlines, seasonal events, conferences.

Needs a date in the copy. **Cut-out**: can stand on a ground — checked with `haze`, `halftone`, `pattern/dots`, `pattern/grid`.

Layouts — landscape: `left` (default), `right`, `top`, `corners`, `band`, `axis` · portrait: `top` (default), `bottom`, `side`, `corners`, `axis`

| Motif | Shows | Suits |
|---|---|---|
| `month` (default) | a month sheet: month and year as the header, the weekday row and the days, the event day on a filled disc (a run of days on a band capped at both ends), Sundays in the accent | community, education, culture, business, general |
| `tearoff` | a daily tear-off block (일력): binding strip with two rings, the month and the day set large together (11.15), the weekday below, page edges showing underneath, slightly turned | tradition, family, celebration, retro, community |
| `week` | the seven days of the event's week, weekday letters over day numbers, the event day in a tall pill — a wide, low image for bands of art | business, tech, education, sports, music |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `almanac` (default) | light | `#f2eee6` · `#d8402a` · `#d8402a` `#fffdf7` `#262626` |
| `cobalt` | dark | `#2443c9` · `#ffd447` · `#ffd447` `#f7f4ec` `#0f1d66` |
| `night` | dark | `#15161a` · `#ff6b4a` · `#ff6b4a` `#f3eee3` `#3a3d45` |
| `garden` | light | `#dfe9e1` · `#d9532f` · `#1f6b4c` `#fbfaf4` `#183026` |
| `mustard` | light | `#f4c63d` · `#b4271a` · `#b4271a` `#fffaf0` `#1a1712` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"month"` | month | tearoff | week |
| `paper` | `"none"` | month: none (drawn straight on the page in rules and numerals) | sheet (on a sheet of paper, slightly turned, with a soft shadow) |
| `weekStart` | `"sun"` | sun | mon — the first column of the month sheet and the week strip |

### swiss
**Swiss Graphic** · HTML · subject on a plain ground · default type `swiss` (also suits `grotesk`, `slim`, `square`, `geometric`, `plex`, `wide`, `condensed`)

one abstract geometric figure built by a single stated rule, in black and one signal colour on a plain sheet, in the manner of the Swiss concert and exhibition posters of the 1950s and 60s — concentric arc bands whose thickness grows by a fixed ratio while their cuts turn in steps of 22.5°, a row of bars widening from hairline to slab on one baseline, a grid of discs shrinking along its diagonal from touching to pin-point, or 45° bands that double step by step — set large, its fine end beside the copy and its heavy end running off the free edge of the sheet, with two to four tiny captions (the date, the time, the weekday, the year, read from the event information) hung on its cuts, ticks and corners. No illustration, no texture: exact vector geometry in two inks, sharp at any size. Good for concerts and recitals, design and architecture talks, exhibitions, lecture series, conferences, science and technology events — anything that should look precise and confident.

**Cut-out**: can stand on a ground — checked with `haze`, `fluted`.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `band`, `strip`, `corners`, `baseline` · portrait: `top` (default), `bottom`, `side`, `axis`, `corners`

| Motif | Shows | Suits |
|---|---|---|
| `arcs` (default) | seven concentric arc bands around one centre marked by a hairline cross: each band 1.5 times as thick as the one inside it, the gaps constant, each cut turned by a fixed number of 22.5° steps so the whole turns like a spiral stair seen from above; one band in the accent; captions at the ends of arcs | music, culture, art, design |
| `bars` | nine to fourteen bars on one hairline baseline, each 1.5 times as wide as the last, from a hairline to a slab, their heights stepping in a slow wave or a ramp; one bar in the accent; tick captions under the baseline | music, business, tech, education |
| `dots` | a square grid of discs (7, 8 or 9 a side) whose diameter falls by one equal step per diagonal, from touching in one corner to a pin-point in the opposite one; one disc in the accent; captions at the corners of the grid, joined by hairlines. The quiet one: it stays whole inside the margins | design, art, science, tech |
| `diagonal` | six or seven 45° bands across a plain rectangle that runs out to the free page edges: each band twice as wide as the last, and so is the space after it, from hairlines in the corner nearest the copy to a slab cut by the far corner; one band in the accent; tick captions under the lower edge | architecture, design, business, education |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `paper` (default) | light | `#f1eee6` · `#e0261a` · `#121212` `#e0261a` |
| `signal` | light | `#ff6341` · `#6e1200` · `#000000` `#ffffff` |
| `cobalt` | dark | `#1b3bc4` · `#ffd400` · `#ffffff` `#ffd400` |
| `concrete` | light | `#d8d4cb` · `#c43c08` · `#111111` `#c43c08` |
| `ink` | dark | `#101010` · `#ffd400` · `#f2efe8` `#ffd400` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"arcs"` | arcs | bars | dots | diagonal |
| `ratio` | `0` | how much each step grows over the last (0 = the motif's own: arcs 1.5, bars 1.5, diagonal 2); 1.3 is gentle, 1.8 steep. Arcs and bars take 1.3–1.8, diagonal 1.5–2.2; dots do not use it |
| `rule` | `"auto"` | bars only — how the heights step: wave (one slow wave over eight bars) | ramp (each bar one step taller or shorter than the last) | auto (the seed chooses) |
| `captions` | `true` | true | false — the small labels read from the copy (date, time, weekday, year) |
| `crop` | `true` | true | false — whether the heavy end of the figure may run off a page edge that the copy leaves free; false keeps the whole figure inside the margins |

### ticket
**Ticket** · HTML · subject on a plain ground · default type `grotesk` (also suits `condensed`, `classic`, `fatface`, `euljiro`, `yeonsung`, `comic`, `bold`, `slab`, `retro`, `typewriter`, `techno`, `editorial`, `pop`, `dream`)

printed ephemera carrying the event's information — an admission ticket with notched ends, a perforated stub printed in a second ink, the headline in the display face and the date, time and place as captioned fields; a boarding-pass-like pass with a header band and two large codes; or a long paper receipt in the mono face with zigzag ends, the information rows as line items and the fee as its total. Flat inks on card and paper with a soft shadow, a seeded serial number and a barcode of plain bars; the words are the copy's own, verbatim. Good for concerts, screenings, festivals, parties, fairs, markets, workshops and any event with an entry, a fee or a free pass.

**Cut-out**: can stand on a ground — checked with `pattern/checker`, `pattern/stripes`, `pattern/dots`, `pattern/grid`, `haze`, `halftone`, `fluted`, `flowfield/threads`.

Layouts — landscape: `left` (default), `right`, `top`, `corners`, `band`, `axis` · portrait: `top` (default), `bottom`, `side`, `corners`, `axis`

| Motif | Shows | Suits |
|---|---|---|
| `admit` (default) | an admission ticket: notched ends, a perforated stub in the second ink, the headline, date / time / place as captioned fields, 입장권 · ADMIT ONE, a serial number and a barcode, tilted | music, film, culture, celebration, nightlife, art |
| `pass` | a boarding-pass-like pass: a header band with the headline, two large codes (the date and the time), captioned fields for place and price, a barcode on the stub | travel, tech, business, sports, education, gaming |
| `receipt` | a long paper receipt in the mono face with zigzag ends: header, dashed rules, the information rows as line items, the fee (or 무료 / FREE) as the total, a barcode | market, food, community, retro, craft, kids |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `stub` (default) | light | `#ebe5d9` · `#d23f2a` · `#f6cf4a` `#d23f2a` `#fbf8f1` |
| `forest` | dark | `#1f4a40` · `#f2b54a` · `#f4efe4` `#1f4a40` `#fbf8f1` |
| `night` | dark | `#141418` · `#ff6a55` · `#ff6a55` `#141418` `#f4f0e6` |
| `blush` | light | `#f2c4bc` · `#a8142c` · `#fff8ee` `#a8142c` `#fff8ee` |
| `cobalt` | dark | `#2a46d6` · `#ffd34d` · `#ffd34d` `#2a46d6` `#f6f2e8` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"admit"` | admit | pass | receipt |
| `orient` | `"auto"` | admit and pass: auto (horizontal in a wide room, a vertical ticket in a tall one) | horizontal | vertical |
| `tilt` | `""` | degrees the ticket is turned (the direction is seeded); empty = a few degrees, 0 = square to the page |

### stamp
**Stamps & Postmark** · HTML · subject on a plain ground · default type `editorial` (also suits `garamond`, `fatface`, `story`, `maru`, `yeonsung`, `typewriter`, `slab`, `myeongjo`, `news`)

the event as a piece of post — a large postage stamp with perforated edges, a paper border and a hairline frame, a small flat vignette in two or three inks (a disc over wavy bands, two hills, a sprig of five leaves, three arches on a line) and the date as its denomination in the poster's display face, cancelled by a hand-struck round postmark that carries the venue round its ring, the date in the middle and wavy cancellation lines running off to one side; also a block of stamps still joined along their perforations with one torn out, each in another pairing of the inks, or the corner of an airmail envelope with its slanted two-colour border and a PAR AVION label. Flat printing inks and exact geometry drawn in SVG, vector in the PDF; the words are the copy's own and nothing imitates a real country's stamp. Quiet and literary. Good for book fairs, readings and letter-writing, travel and exchange programmes, markets and craft fairs, exhibitions and small concerts, autumn and winter programmes, community notices and anything with one date and one place to remember.

**Cut-out**: can stand on a ground — checked with `haze`, `pattern/grid`, `flowfield/threads`.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `strip`, `baseline`, `headline` · portrait: `top` (default), `bottom`, `side`, `corners`, `axis`, `baseline`

| Motif | Shows | Suits |
|---|---|---|
| `single` (default) | one large stamp turned 2–4°: perforated edge, paper border, hairline frame, the headline as a line of small caps, the vignette in its window, the date as the denomination (03.21) with the year; a round postmark struck over its upper left corner — venue round the ring, weekday at the foot, year / date / time in the middle — with five wavy lines running off the free side | literature, culture, travel, autumn, winter |
| `sheet` | a block of stamps still joined along their perforations (3 × 2 or 2 × 3; a strip of three or four in a long low or tall narrow room), each in another pairing of the palette's inks with another vignette, the one at the upper right torn out; the postmark is struck in the gap over its two neighbours and its lines run off through it | market, community, craft, celebration, culture |
| `airmail` | the corner of an airmail envelope: a band of slanted stripes in the two inks along the top and down the outer side, the stamp in the corner they make, the postmark on its inner edge with the lines running into the envelope, and a plain rectangle label reading PAR AVION (항공우편 for Korean copy) | travel, literature, celebration, winter, community |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `post` (default) | light | `#ece3cf` · `#c4302b` · `#c4302b` `#3b6cb4` `#fbf6ea` |
| `olive` | light | `#e3e0d2` · `#a8481f` · `#b4522a` `#cf9b27` `#f7f4ea` |
| `rose` | light | `#f0d6d0` · `#b03459` · `#c2476b` `#7c987c` `#fcf3ee` |
| `kraft` | light | `#c9a77c` · `#8a1a12` · `#b3271e` `#efe2c6` `#f8f0de` |
| `night` | dark | `#131c33` · `#f0705a` · `#e4553f` `#7db2e0` `#f5eedc` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"single"` | single | sheet | airmail |
| `vignette` | `"auto"` | the little picture on the stamp: auto (seeded) | sea (a disc over three wavy bands) | hills (two hills and a small disc) | sprig (a sprig of five leaves) | arcs (three arches on a line). In a sheet it is the first stamp's; the others follow in a seeded order |
| `orient` | `"auto"` | the stamps: auto (whichever fills the room best; a single stamp prefers upright) | portrait (4 : 5) | landscape (5 : 4) |
| `tilt` | `""` | degrees the stamp or the block is turned (the direction is seeded); empty = a few degrees, 0 = square to the page. The postmark keeps its own 12° |

### transit
**Transit Map** · HTML · subject on a plain ground · default type `grotesk` (also suits `swiss`, `square`, `dream`, `humanist`, `plex`, `geometric`, `bold`, `techno`, `gmarket`)

the place of the event drawn as a diagram — a metro map in the modernist manner: thick lines in a few flat colours that run only horizontally, vertically and at 45°, with bends of one radius, page-coloured station dots, capsule interchanges and a numbered bullet at each line end, the lines running off the sheet wherever the page is free; one interchange is picked out in the accent and flagged with the venue from the poster's own copy, the date and time under it, and a few other stations take words of the headline. Also a single route that winds to the venue in numbered stops, and a street map of tinted blocks with a river, a park, one main road in the accent and a pin on the venue's block. Vector (SVG) in the poster's own text face, laid out on an invisible grid from hand-designed skeletons; where `numerals` makes the date the picture, this makes the place the picture. Good for anything people have to find their way to: exhibitions and openings, concerts and festivals, markets and pop-ups, conferences and meet-ups, open days and campus events, neighbourhood and city events, tours and travel.

**Cut-out**: can stand on a ground — checked with `haze`, `pattern/grid`.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `band`, `strip`, `corners`, `headline`, `baseline`, `axis` · portrait: `top` (default), `bottom`, `side`, `corners`, `axis`, `baseline`

| Motif | Shows | Suits |
|---|---|---|
| `metro` (default) | three to five lines crossing at a few interchanges, some running side by side; one interchange is the venue — a larger marker in the accent with a flag carrying the venue's name, the date and time under it. A few stations are named with words of the headline, line ends carry numbered bullets, and lines run off the page edge where the layout leaves it free | city, tech, business, culture |
| `route` | a single thick line that winds across the box in long straight runs and 45° bends (a step, a hairpin or an S, by the shape of the room) with five to seven numbered stops, the last one the venue, marked in the accent and flagged; the words of the headline name stops on the way | travel, education, community |
| `blocks` | a street map from above that fills the free part of the page and runs off its edge: city blocks as flat tints with paper-coloured streets on a slightly irregular grid, one 45° avenue, a river as one calm band with bridges, a park, one main road in the accent, and a map pin on the venue's block with its flag; a few blocks carry a word of the headline like a district name | market, community, city |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `network` (default) | light | `#f3f0e8` · `#d6332a` · `#1d5fb8` `#1c8a52` `#f0b310` `#ea7a1c` `#d6332a` |
| `paper` | light | `#f1e9d8` · `#cf3329` · `#191817` `#cf3329` |
| `mint` | light | `#dcefe4` · `#d03f28` · `#1d3a6e` `#1f6b4a` `#d39a21` `#d03f28` |
| `signal` | light | `#f5c518` · `#bd1e19` · `#151515` `#ffffff` `#bd1e19` |
| `night` | dark | `#101a36` · `#ff8fa3` · `#7cc4ff` `#8be0b8` `#ffc15a` `#ff8fa3` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"metro"` | metro | route | blocks |
| `lines` | `4` | metro: how many lines, 3–5 (a skeleton draws as many as it holds: the ring three, the others four; the triangle takes a fifth along the foot) |
| `map` | `""` | metro: the skeleton — triangle | junction | ring; empty = picked by the seed (a strip of a room always gets the flat three-line map) |
| `stops` | `""` | route: how many numbered stops, the venue included (5–7); empty = picked by the seed |
| `names` | `3` | how many other stations / stops / blocks take a short word from the copy (0–5) |

### stickers
**Die-cut Stickers** · HTML · subject on a plain ground · default type `pop` (also suits `jua`, `maple`, `dongle`, `anemone`, `comic`, `gamja`, `singleday`, `cute`, `round`, `bold`, `friendly`, `grotesk`, `retro`, `geometric`, `brutal`, `marker`, `kkubulim`)

die-cut vinyl stickers stuck on a laptop lid or a notebook cover — flat colour shapes with a thick die-cut border in the page's lightest colour and a thin soft shadow, each turned a few degrees and overlapping a little, one or two large and several small in a composed cluster: scalloped seals, rounded stars, flowers, hearts, speech bubbles, hang tags, tape and chunky letters. The date, the weekday and short words from the copy are printed on them in the poster's display face. Cheerful, young and hand-made; good for kids and family days, youth and church events, school festivals, markets and pop-ups, cafés, parties and community gatherings.

**Cut-out**: can stand on a ground — checked with `pattern/checker`, `pattern/stripes`, `pattern/dots`, `pattern/grid`, `haze`, `halftone`.

Layouts — landscape: `left` (default), `right`, `band`, `top`, `corners`, `axis` · portrait: `top` (default), `bottom`, `side`, `corners`, `axis`

| Motif | Shows | Suits |
|---|---|---|
| `badges` (default) | a cluster of scalloped seals, rounded stars, flowers, hearts, speech bubbles, pills, an arrow, a smiling face and sparkles; the date, the weekday and keywords from the copy printed on some | kids, family, community, celebration, education, market, food |
| `labels` | a hang tag on its string with the headline's key word, strips of tape carrying the place, a name-tag label, round fruit stickers with the date as their number | market, craft, food, fashion, community, design |
| `letters` | chunky letter stickers spelling the emphasised word of the headline, one letter per die-cut shape in alternating colours, bouncing along a line, with two or three small shape stickers | kids, celebration, music, education, community, sports |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `notebook` (default) | light | `#efe9dd` · `#e8442f` · `#ef4b37` `#2f5cf0` `#ffc531` `#1fa37a` `#ff9cc0` |
| `laptop` | dark | `#26282e` · `#ffcf3a` · `#ffcf3a` `#ff5d8f` `#4fb3ff` `#7be07b` `#ff7a3d` |
| `cobalt` | dark | `#2445d6` · `#ffe14a` · `#ffe14a` `#ff6f91` `#121a4f` `#6ee7b7` `#ff8a3d` |
| `candy` | light | `#fbe4ea` · `#d92a63` · `#e8336d` `#7a4cff` `#ffb321` `#22b2a2` `#ff8a5b` |
| `kraft` | light | `#c99c66` · `#7d150b` · `#e8412f` `#1f4fd1` `#f6c23e` `#2a7a4b` `#1c1c1c` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"badges"` | badges | labels | letters |
| `count` | `0` | badges and labels: the number of stickers; 0 = automatic (7–11, more when the room is wide) |
| `tilt` | `1` | how far the stickers are turned: 0 = straight … 1 = a few degrees … 2 = tossed |
| `letterform` | `"shape"` | letters motif: shape (each letter on a die-cut disc, square or seal) | cut (the die-cut follows the letter itself) |
| `word` | `""` | letters motif: the word to spell (≤ 6 characters). Left empty, the emphasised word of the headline (*…*) is used, else its first word |

### screen
**Flat Screen UI** · HTML · subject on a plain ground · default type `grotesk` (also suits `swiss`, `cute`, `paperlogy`, `square`, `round`, `techno`, `bold`, `geometric`, `plex`, `pop`, `typewriter`, `brutal`, `gmarket`, `dunggeunmo`)

a flat, generic user-interface mock-up as the picture — overlapping desktop windows with plain title bars, a message thread, a music-player card or a search field with its suggestion list, drawn as plain rounded rectangles in a few palette inks with a hairline outline and a hard offset shadow, like a contemporary editorial illustration of a screen. The copy itself is on the screen: the headline typed into the search field or sent as a message, the date in a dialog, the time at the end of the progress bar. Good for tech talks, launches and online events, hackathons, music nights and festivals, youth and campus programmes, webinars and sign-up calls.

**Cut-out**: can stand on a ground — checked with `pattern/checker`, `pattern/stripes`, `pattern/dots`, `pattern/grid`, `haze`, `halftone`.

Layouts — landscape: `left` (default), `right`, `band`, `top`, `corners`, `axis` · portrait: `top` (default), `bottom`, `side`, `corners`, `axis`

| Motif | Shows | Suits |
|---|---|---|
| `windows` (default) | two or three overlapping desktop windows with plain title bars — flat abstract shapes in one, a dialog with the event date set large and an OK button, a short list with a progress bar — and an arrow cursor on top | tech, design, business, education, art, gaming |
| `chat` | a message thread whose bubbles are the copy, verbatim: the headline, the date, the place, then the call to action (or a typing bubble) | community, education, kids, family, celebration, tech |
| `player` | a music-player card: a square cover of flat shapes, the headline as the track title, the eyebrow as the artist, a progress bar ending at the event time, and play controls | music, nightlife, culture, celebration, film |
| `search` | a search field with the headline typed in it and a text cursor, and below it a suggestion list made from the information rows | tech, education, business, community, general |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `desk` (default) | light | `#e9e5db` · `#3550f0` · `#3d5afe` `#ff6a3d` `#ffc93c` `#fbfaf6` |
| `midnight` | dark | `#15161c` · `#9a8cff` · `#8c7bff` `#ff6f91` `#57d6c3` `#272a35` |
| `tomato` | light | `#ff5b3a` · `#fff4e6` · `#1d2bd6` `#ffd23f` `#1b1210` `#fff4e6` |
| `mint` | light | `#cdeedd` · `#d13d33` · `#e0483e` `#2f6df0` `#ffcb3d` `#ffffff` |
| `lilac` | light | `#e2dbf6` · `#d6245a` · `#5b3df5` `#ff4f7b` `#ffc94d` `#fffdf8` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"windows"` | windows | chat | player | search |
| `shadow` | `"hard"` | hard (a flat offset shadow in the ink, printed as vector) | soft (a blurred drop shadow) | none |
| `outline` | `1` | weight of the hairline around windows and controls: 0 = none … 1 = normal … 2 = heavy |
| `radius` | `1` | corner rounding of windows, bubbles and buttons: 0 = square … 1 = normal … 2 = very round |

### marquee
**Marquee Type** · HTML · fills the sheet · default type `bold` (also suits `grotesk`, `classic`, `comic`, `jalnan`, `fatface`, `yeonsung`, `brutal`, `condensed`, `impact`, `swiss`, `pop`, `jua`, `editorial`, `gmarket`)

type as texture — the poster's own headline repeated end to end in rows that fill the free part of the page and run off its edge, set in the poster's display face, alternately solid and outlined, with the date or the eyebrow and a small drawn star between the repeats; or turned on a slant, carried on crossing ribbons of barrier tape, or growing row by row into a crescendo. Loud, rhythmic and contemporary, and it changes voice with the type theme. Reads the headline, the date and the eyebrow from the copy. Good for festivals, concerts, parties, sales, fashion and sports events, launches and youth and church events.

**Ground**: can be drawn under a cut-out subject (`"ground": "marquee"`).

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `band`, `strip`, `corners`, `axis`, `baseline`, `headline`, `vertical` · portrait: `top` (default), `bottom`, `side`, `corners`, `axis`, `baseline`, `vertical`

| Motif | Shows | Suits |
|---|---|---|
| `rows` (default) | horizontal rows of the headline (and date), alternately solid and outlined, each shifted so the repeats do not line up | music, fashion, celebration, market, sports, nightlife, community |
| `tilt` | the same field of rows turned about −12°, cropped by the field's straight edges | sports, nightlife, music, gaming, celebration |
| `tape` | two or three broad ribbons of flat colour crossing the field like barrier tape, each carrying the phrase | market, celebration, tech, city, sports, kids |
| `steps` | rows growing from small beside the copy to very large at the page edge — a crescendo, the largest row cropped | music, film, culture, design, art, literature |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `poster` (default) | light | `#f1ede4` · `#e2412b` · `#151515` `#e2412b` `#2747c9` `#f2b51d` |
| `acid` | light | `#d8ef4a` · `#5a2bd6` · `#121212` `#5a2bd6` `#ff5a36` `#f6f3ea` |
| `night` | dark | `#121212` · `#ff5233` · `#f2eee5` `#ff5233` `#ffd23f` `#4f6bff` |
| `cobalt` | dark | `#1d3bc9` · `#ffe14d` · `#ffffff` `#ffe14d` `#ff6b5b` `#0b1557` |
| `rose` | light | `#f6dfe0` · `#d1295a` · `#2b1220` `#d1295a` `#f0913a` `#ffffff` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"rows"` | rows | tilt | tape | steps |
| `treatment` | `"outline"` | outline (every other row outlined in the second ink) | duo (rows alternate the first two inks) | solid (one ink, marks in the second) |
| `with` | `"auto"` | what alternates with the headline: auto (the date if the copy has one, else a short eyebrow) | date | eyebrow | none |
| `mark` | `"star"` | the drawn separator between repeats: star (four-point) | dot | dash |
| `caps` | `true` | set Latin in capitals (Hangul is unaffected) |
| `rows` | `0` | number of rows; 0 = automatic (5–9 for rows/tilt, up to 6 for steps) |
| `angle` | `-12` | tilt motif: the angle of the rows in degrees |
| `ribbons` | `0` | tape motif: 2 or 3 ribbons; 0 = 3, or 2 when the field is small |
| `phrase` | `"auto"` | auto (a long headline is cut to its first line or clause, else to whole words) | full (the whole headline, however long) |
| `treatment (tilt)` | `"duo"` |  |
| `mark (tilt)` | `"dot"` |  |
| `mark (tape)` | `"dash"` |  |
| `treatment (steps)` | `"solid"` |  |

### pattern
**Flat Pattern** · HTML · fills the sheet · default type `grotesk` (also suits `bold`, `round`, `dongle`, `singleday`, `comic`, `pop`, `jua`, `swiss`, `retro`, `condensed`, `editorial`, `anemone`, `gmarket`)

a flat vector repeat pattern — a checkerboard (straight or gently warped), wavy stripes of even width, a dot grid that thins out towards the copy, terrazzo chips, rows of arches or fine graph paper with a few cells filled — printed in two to four flat inks over the free part of the page and running off its edge, with one clean straight edge towards the copy, in the manner of contemporary Korean event and pop-up posters. Calm enough to sit behind a 3D cut-out as its ground. Reads nothing from the copy; it frames it. Good for markets, festivals, kids' and family days, food and café events, fashion and beauty pop-ups, spring and summer events, church and community gatherings.

**Ground**: can be drawn under a cut-out subject (`"ground": "pattern"`).

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `band`, `strip`, `corners`, `axis`, `baseline`, `headline`, `vertical` · portrait: `top` (default), `bottom`, `side`, `corners`, `axis`, `baseline`, `vertical`

| Motif | Shows | Suits |
|---|---|---|
| `checker` (default) | a checkerboard in two inks, whole squares along the edge towards the copy; wave > 0 warps it into a gentle wave | kids, family, market, food, retro, celebration, spring, summer |
| `stripes` | wavy stripes of even width in two or three inks | summer, outdoor, travel, food, kids, celebration |
| `dots` | a staggered dot grid on the page colour, dots large at the far edge and shrinking to nothing towards the copy | design, art, music, fashion, beauty, tech, general |
| `terrazzo` | angular chips of three or four inks scattered evenly on a pale ground, none cut by the edge towards the copy | design, architecture, craft, food, market, fashion |
| `arches` | rows of round-topped arches, alternately solid and outlined | architecture, design, wellness, beauty, culture, luxury |
| `grid` | fine graph-paper rules, heavier every fifth line, with a few cells filled in flat colour | education, tech, science, business, design, general |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `mint` (default) | light | `#f4f1e8` · `#e2452b` · `#1f8a5b` `#d6ecd9` `#f2b33a` `#e2452b` |
| `cherry` | light | `#fff4ef` · `#d92d3c` · `#e23a46` `#ffd9d2` `#2b1418` `#ffb53b` |
| `butter` | light | `#f6e49c` · `#d93f22` · `#ff6a3d` `#fff5d2` `#2a62d9` `#1c1a14` |
| `cobalt` | dark | `#2443d0` · `#ffe04a` · `#ffffff` `#1a33a8` `#ffe04a` `#ff7a5c` |
| `night` | dark | `#14161b` · `#ffcf3f` · `#f1ede4` `#262a36` `#ffcf3f` `#ff5a3c` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"checker"` | checker | stripes | dots | terrazzo | arches | grid |
| `scale` | `0` | size of one repeat as a fraction of the page's short side (0 = the motif's own default: checker 0.075, stripes 0.06, dots 0.045, terrazzo 0.06, arches 0.09, grid 0.03) |
| `cover` | `"field"` | field (the whole free field, out to the page edge) | band (only a band along the far edge of the field, away from the copy) |
| `tilt` | `0` | turn the pattern by this many degrees inside its straight-edged field (e.g. 45 for a diamond checker, 90 for upright stripes) |
| `wave` | `0` | checker: 0 = straight; 0.3–1 warps the board into a gentle wave. stripes: the wave's amplitude (default 0.5; 0 = straight stripes) |
| `inks` | `2` | stripes, dots, arches: 2 or 3 inks (the third from colors[2]: a third stripe, alternate dot rows, a small solid arch inside each open one) |
| `wave (stripes)` | `0.5` |  |

### studio
**Soft Studio** · Blender · subject on a plain ground · default type `bold` (also suits `friendly`, `round`, `gmarket`, `dongle`, `comic`, `pop`, `retro`, `swiss`, `ssurround`)

warm, polished, optimistic — a path-traced still life of soft 3D shapes (clay, gloss, glass, metal) floating in front of a pastel wall. Good for product/brand launches, startups, education, recruiting, anything that should feel premium but approachable.

**Cut-out**: can stand on a ground — checked with `pattern/checker`, `pattern/stripes`, `pattern/dots`, `pattern/terrazzo`, `pattern/arches`, `pattern/grid`, `haze`, `halftone`, `liquid`, `watercolor`, `memphis`, `turing`.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `axis`, `side`

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `peach` (default) | light | `#f6d5c2` · `#cf3a22` · `#ff6b4a` `#2f4bdc` `#ffc145` `#fff6ee` |
| `lilac` | light | `#dcd4fa` · `#5438e8` · `#6b4eff` `#ff7ea8` `#ffd166` `#ffffff` |
| `mint` | light | `#cbeddc` · `#0a8763` · `#12b886` `#ffd43b` `#ff7b7b` `#ffffff` |
| `sky` | light | `#cde2ff` · `#1c50e0` · `#2f6bff` `#ff9f43` `#ff5d8f` `#ffffff` |
| `sand` | light | `#ebe3d5` · `#b3412b` · `#c8553d` `#28536b` `#f2c14e` `#f8f4ec` |
| `noir` | dark | `#1b1b21` · `#ff7a5c` · `#ff5d3b` `#f2f2f2` `#6b6bff` `#ffd166` |

| Param | Default | Effect |
|---|---|---|
| `glass` | `true` | include a glass sphere (slower to render, prettier) |
| `metal` | `"chrome"` | chrome | gold | none — finish of the small accent sphere |

### puffy
**Inflated Toys** · Blender · subject on a plain ground · default type `pop` (also suits `friendly`, `maple`, `dongle`, `comic`, `anemone`, `gamja`, `round`, `retro`, `bold`, `hand`)

kitsch, pop, sweet — puffy inflated shapes (star, heart, flower, cloud, ring, pill, a smiling ball) in glossy vinyl candy colours, floating and overlapping in front of a pastel wall with soft shadows. Good for kids' and family events, festivals, pop-ups, sales and promotions, parties, anything that should feel fun.

**Cut-out**: can stand on a ground — checked with `pattern/checker`, `pattern/stripes`, `pattern/dots`, `pattern/terrazzo`, `pattern/arches`, `pattern/grid`, `haze`, `halftone`.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `bubblegum` (default) | light | `#ffd9e6` · `#e6257a` · `#ff4f9a` `#ffd23f` `#4d7cff` `#35d6a4` `#ffffff` |
| `lemonade` | light | `#fff0b3` · `#e8431f` · `#ff5a36` `#3aa0ff` `#ff9ecb` `#2fc28b` `#ffffff` |
| `mint` | light | `#cdeee0` · `#e2483d` · `#ff6b6b` `#ffd43b` `#7c5cff` `#ffffff` |
| `sky` | light | `#cfe6ff` · `#1c50e0` · `#2f6bff` `#ff5d8f` `#ffc93c` `#ffffff` |
| `grape` | dark | `#1d1830` · `#ff8ad1` · `#ff5fa8` `#ffd23f` `#6c7bff` `#3ee0c0` `#ffffff` |

| Param | Default | Effect |
|---|---|---|
| `count` | `6` | 5–7 toys (the seed picks which shapes, the hero and the colours) |
| `finish` | `"vinyl"` | vinyl (glossy candy) | matte (soft-touch rubber) | foil (metallic balloon) |
| `face` | `true` | allow the smiling ball; false keeps the set abstract |
| `shadow` | `16` | softness of the shadows on the wall in degrees: 4 = crisp … 28 = very soft |

### felt
**Needle Felt** · Blender · subject on a plain ground · default type `friendly` (also suits `hand`, `gamja`, `starlight`, `dongle`, `melody`, `round`, `editorial`, `bold`, `pop`, `kkubulim`)

needle-felted wool — soft, slightly lumpy forms with a halo of loose fibres, standing on a sheet of felt in the poster's colour under a big soft light and a warm rim; hand-made, warm and gentle. Good for children's and family events, craft fairs and workshops, seasonal greetings, wellness and community programmes.

**Cut-out**: can stand on a ground — checked with `pattern/checker`, `pattern/stripes`, `pattern/dots`, `pattern/terrazzo`, `pattern/arches`, `pattern/grid`, `haze`, `halftone`.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `hills` (default) | a little felt landscape: three soft hills, cone and ball trees, clouds and a plain sun ball | nature, outdoor, travel, kids, spring |
| `fruit` | still life of felt fruit: pear, apple, orange, lemon and cherries | food, market, autumn, family, craft |
| `pebbles` | abstract: a balanced stack of felted pebbles, a ring and scattered balls | wellness, design, art, community, education |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `meadow` (default) | light | `#f1e9da` · `#d9603a` · `#7fa35b` `#3f7d6e` `#e9b949` `#d9604a` `#f6f1e6` |
| `berry` | light | `#f6dfe0` · `#c2335b` · `#c2335b` `#f08a6c` `#7a4b8c` `#f3c85a` `#fbf3ea` |
| `nordic` | light | `#dfe7ea` · `#d9523c` · `#3d6f8e` `#9bb8c4` `#d9523c` `#e8c268` `#f5f2ea` |
| `ember` | dark | `#2a2422` · `#f0a04b` · `#d9603b` `#f0a04b` `#8a9a5b` `#b4486a` `#efe2c8` |
| `midnight` | dark | `#1c2440` · `#f2c14e` · `#5b7fd1` `#f2c14e` `#e86f6f` `#9fd0c2` `#f1ede4` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"hills"` | hills (felt landscape: hills, trees, clouds, a sun ball) | fruit (still life of felt fruit) | pebbles (abstract stack of felted stones, a ring and balls) |
| `fuzz` | `1.0` | amount of loose fibre: 0 = none (fastest) … 1.6 = very woolly |
| `rim` | `1.0` | strength of the warm back light that catches the fibres (0 = off) |

### knit
**Hand Knit** · Blender · subject on a plain ground · default type `friendly` (also suits `hand`, `gamja`, `goun`, `story`, `melody`, `round`, `editorial`, `retro`, `bold`, `starlight`)

chunky hand-knitted wool — every stitch is real yarn looped along the form: stockinette, ribbing, garter ridges, stripes and a little colourwork, with pom-poms and a haze of loose fibre under a soft raking light; cosy, generous, home-made. Good for winter and year-end events, markets and fairs, craft classes, family and community programmes, charity drives.

**Cut-out**: can stand on a ground — checked with `pattern/checker`, `pattern/stripes`, `pattern/dots`, `pattern/terrazzo`, `pattern/arches`, `pattern/grid`, `haze`, `halftone`.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `winter` (default) | a bobble hat with a colourwork band and ribbed brim, a pair of mittens, loose pom-poms | winter, family, market, celebration, community |
| `bunting` | a garland of knitted pennants on a twisted cord with a string of pom-poms | celebration, community, market, kids, spring |
| `shapes` | abstract knitted solids: striped ball, cone, garter pouf, ring | design, art, education, kids, wellness |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `cocoa` (default) | light | `#f2e8dc` · `#c8452f` · `#c8452f` `#2f5d73` `#e3a53c` `#f7f1e5` |
| `fjord` | light | `#dde6ee` · `#d24b3e` · `#2b4f7a` `#d24b3e` `#7fa6bf` `#f4f1ea` |
| `candy` | light | `#fbe3dc` · `#e2557b` · `#e2557b` `#5aa9a3` `#f2b84b` `#fbf5ee` |
| `pine` | dark | `#1f3329` · `#e9b44c` · `#d9503f` `#e9b44c` `#7fae8e` `#f3ecdd` |
| `plum` | dark | `#2b2036` · `#f2a65a` · `#e06d8c` `#f2a65a` `#7c8fd6` `#f6efe6` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"winter"` | winter (bobble hat and mittens) | bunting (garland of knitted pennants and pom-poms) | shapes (abstract knitted ball, cone, pouf and ring) |
| `fuzz` | `1.0` | loose fibre standing off the yarn: 0 = smooth cotton … 1.5 = mohair |
| `rim` | `1.0` | strength of the warm back light (0 = off) |

### jelly
**Jelly & Wax** · Blender · subject on a plain ground · default type `friendly` (also suits `pop`, `dongle`, `maple`, `gamja`, `round`, `melody`, `bold`, `jua`, `hand`, `editorial`, `ssurround`)

translucent gummy, jelly and wax — saturated subsurface solids that glow where the form is thin, glossy skins with window highlights, lit from behind so every rim shines like a sweet held up to the light. Sweet, playful, tactile; good for food and dessert, kids and family events, festivals and celebrations, pop-ups, candle-lit and seasonal evenings.

**Cut-out**: can stand on a ground — checked with `pattern/checker`, `pattern/stripes`, `pattern/dots`, `pattern/terrazzo`, `pattern/arches`, `pattern/grid`, `haze`, `halftone`.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `dessert` (default) | moulded jellies: a fluted two-layer dome, a stack of jelly cubes, a striped slab and small sweets | food, celebration, market, design |
| `gummies` | a heap of gummy bears with gummy rings, a two-tone worm and gumdrops | kids, family, food, celebration, gaming |
| `candles` | pillar candles of soft coloured wax glowing round their flames, drips on the sides | wellness, winter, tradition, celebration, culture |
| `hills` | a little landscape of jelly: a layered island, domed hills, cone trees and a backlit jelly sun | nature, travel, outdoor, spring, kids |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `berry` (default) | light | `#f7e4e7` · `#d81b54` · `#ff3b6b` `#ff9f1c` `#6fcf6a` `#a83ee8` |
| `citrus` | light | `#fbf0d6` · `#d9480f` · `#ffb000` `#fb5607` `#8ac926` `#ff2e7e` |
| `mint` | light | `#ddf0ea` · `#0d8a6c` · `#22c3b0` `#ff5f6d` `#ffcc33` `#4d8dff` |
| `night` | dark | `#161220` · `#ff5d8f` · `#ff3d68` `#ffbe0b` `#3a86ff` `#9b4dff` |
| `ember` | dark | `#1e1511` · `#ffb44c` · `#ff9a3c` `#e63946` `#f5d68a` `#c41e5a` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"dessert"` | dessert (moulded jellies: fluted dome, cube stack, striped slab) | gummies (gummy bears, rings, a worm, gumdrops) | candles (pillar candles of glowing wax) | hills (a jelly landscape: island, domed hills, cone trees, jelly sun) |
| `glow` | `1` | strength of the back and side light that makes thin parts glow: 0.5 = subtle … 1.6 = lantern-bright |
| `key` | `1300` | front key light (W); the backdrop is calibrated to it |

### wood
**Wooden Toys** · Blender · subject on a plain ground · default type `friendly` (also suits `hand`, `euljiro`, `gamja`, `dongle`, `round`, `story`, `yeonsung`, `bold`, `editorial`, `retro`, `jua`, `classic`)

wooden toy blocks and turned wood — visible growth rings and long grain, softly rounded edges, some pieces painted in the palette colours with the grain showing through, the rest left natural under a satin oil finish, in warm side daylight. Honest, warm, hand-made; good for kids and family programmes, education, craft and design fairs, architecture and city events, eco and slow-living brands.

**Cut-out**: can stand on a ground — checked with `pattern/checker`, `pattern/stripes`, `pattern/dots`, `pattern/terrazzo`, `pattern/arches`, `pattern/grid`, `haze`, `halftone`.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `city` (default) | a toy-block town on a board: block towers, a gabled house, an arch bridge, lollipop trees | city, architecture, kids, community, business |
| `turned` | a balanced still life of turned wood: ring stacker, spinning top, spindle, balls, a plank on a fulcrum | design, craft, education, family, finance |
| `hills` | a fret-saw landscape: layered cut-out hills, turned trees, a little house and a wooden sun | nature, outdoor, travel, kids, spring |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `nursery` (default) | light | `#f2ebdf` · `#c8402a` · `#d9503a` `#f0b032` `#2f7d6d` `#3c6db3` |
| `pastel` | light | `#f5e9e3` · `#c4604f` · `#e89e93` `#f1d088` `#94c2ab` `#a3b5dc` |
| `sage` | light | `#e3e7da` · `#a8552f` · `#6f9160` `#d9a356` `#c4623f` `#557e98` |
| `nordic` | light | `#e8ebee` · `#b8352a` · `#c23a2c` `#6f9cc4` `#1f3b60` `#e6bf62` |
| `workshop` | dark | `#211b17` · `#e5a54b` · `#d9553a` `#e5a54b` `#4f8f7f` `#6f8fc4` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"city"` | city (a toy-block town on a board) | turned (a balanced still life of lathe-turned pieces) | hills (a fret-saw landscape of cut-out hills, turned trees, a house and a wooden sun) |
| `wood` | `"beech"` | species of the natural pieces: beech | maple | oak | walnut |
| `shadow` | `9` | shadow softness in degrees: 4 = crisp … 20 = very soft |

### softscape
**Soft 3D Scenery** · Blender · fills the sheet · default type `myeongjo` (also suits `editorial`, `maru`, `luxe`, `swiss`)

soft matte 3D scenery — simple rounded forms, pastel light and a calm graded backdrop, path-traced like a miniature film set; the scene fills the whole sheet and leaves open sky or wall for the copy. Good for travel and retreats, lifestyle and interiors, children and family events, calm campaigns.

Layouts — landscape: `top` (default), `left`, `right`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `lake` (default) | a mirror-calm lake, misty hills, an island with a lone tree Palettes: `dawn`, `mint`, `dusk`, `night`, `ember`. | wellness, literature, travel, nature, music |
| `dunes` | sand dunes in very low sun under a wide sky Palettes: `golden`, `rose`, `moonlit`, `gypsum`, `mars`. | travel, fashion, film, outdoor, luxury |
| `room` | a sunlit wall with window light, a potted tree, a stool and a framed print Palettes: `plaster`, `sage`, `blush`, `sky`, `evening`. | design, architecture, food, community, beauty, spring |
| `clouds` | a pastel cloudscape with a hot-air balloon Palettes: `day`, `candy`, `pistachio`, `sunset`, `midnight`. | kids, family, travel, celebration, education, spring |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `dawn` (default) | light | `#efdcd8` · `#b23c24` · `#fbe6cc` `#5c5f85` `#ffe2b0` `#8f93b5` |
| `mint` | light | `#d3e6df` · `#bf4627` · `#f1ecd0` `#2f5f5c` `#ffe9b4` `#7fa7a0` |
| `dusk` | dark | `#232449` · `#ffb26b` · `#5d4a7c` `#131432` `#ff9461` `#1b1c3d` |
| `night` | dark | `#0a1730` · `#f4f1da` · `#1b3558` `#060e20` `#5b84b4` `#081326` |
| `ember` | dark | `#3a1c38` · `#ffc07a` · `#8a4458` `#1d0e22` `#ff9d5c` `#2a1430` |
| `golden` | light | `#f3d7a6` · `#9c3410` · `#f1c486` `#9c5a3a` `#fae3b4` `#ffe9b2` |
| `rose` | light | `#f1c9cf` · `#8a3a7a` · `#f3c6b2` `#a37aa3` `#fbdcc4` `#ffe6bf` |
| `moonlit` | dark | `#0f1a3c` · `#ffe2a0` · `#465a96` `#111a3a` `#22336a` `#5f7cc0` |
| `gypsum` | light | `#c6dcee` · `#1f5c9e` · `#f4f1ea` `#9fb2d2` `#f3e8d8` `#ffeecb` |
| `mars` | dark | `#35130f` · `#a9d6ff` · `#a2472a` `#35130f` `#6e2c1c` `#9ec3e6` |
| `plaster` | light | `#e4d2bd` · `#b4492a` · `#d9c4a8` `#a8744a` `#c9744e` `#4f6b45` |
| `sage` | light | `#cdd6c4` · `#b5532f` · `#dccfb8` `#9a7550` `#e6dccb` `#3f6248` |
| `blush` | light | `#e6c8c0` · `#a8402f` · `#e3d3c0` `#8f6247` `#f0e4d6` `#55704d` |
| `sky` | light | `#c6d5de` · `#b9532a` · `#ddd2c0` `#a17a55` `#f1ebe0` `#476a52` |
| `evening` | dark | `#29242f` · `#f0a659` · `#7d6654` `#9a6a45` `#c98a62` `#5d7a55` |
| `day` | light | `#bfe0f6` · `#2456c8` · `#2f62d9` `#ff8562` `#c9d9ee` `#ffc94d` |
| `candy` | light | `#f9cfe0` · `#7a3cc2` · `#8a4fd6` `#ff7fb0` `#e6c6ea` `#5fc9c0` |
| `pistachio` | light | `#c9ebe0` · `#0f7a6c` · `#17907f` `#ff9a5c` `#c5ddd9` `#ffd166` |
| `sunset` | dark | `#2b2152` · `#ffc58a` · `#ff8f6b` `#ffd08a` `#33285c` `#c86a9a` |
| `midnight` | dark | `#0d1437` · `#f3ecc8` · `#93a7e6` `#f3ecc8` `#141d47` `#7fd1e8` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"lake"` | lake | dunes | room | clouds — what the picture shows; each motif has its own palettes and parameters |
| `hero (lake)` | `"island"` | island (island with a lone tree) · tree (one tree standing in the shallows) · boat (rowing boat with a lantern) |
| `hills (lake)` | `1.0` | hill height multiplier (0 = open water to the horizon) |
| `mist (lake)` | `1.0` | how much the hills dissolve into the horizon: 0 = clear air, 1.6 = heavy mist |
| `ripples (lake)` | `1.0` | ripple strength on the water: 0 = perfect mirror, 3 = breezy |
| `sun (lake)` | `1.0` | size of the sun / moon — always a plain pale disc in a soft round glow (0 hides the disc, the glow stays) |
| `stars (lake)` | `1.0` | star brightness on dark palettes (0 = none) |
| `sun (dunes)` | `1.0` | size of the sun / moon — always a plain pale disc in a soft round glow (0 hides the disc) |
| `height (dunes)` | `1.0` | dune height multiplier |
| `ripples (dunes)` | `1.0` | strength of the fine sand ripples (0 = smooth sand) |
| `haze (dunes)` | `1.0` | distance haze: 0.5 = clear air, 2 = dusty |
| `elevation (dunes)` | `10.0` | height of the light in degrees: lower = longer shadows |
| `shadow (dunes)` | `0.8` | sun angle in degrees: 0.3 = razor-sharp shadow edges, 4 = soft |
| `stars (dunes)` | `1.0` | star brightness on dark palettes (0 = none) |
| `sun (room)` | `1.0` | strength of the window light (0 = overcast, no patch) |
| `bars (room)` | `3` | window panes per column: 1 = plain opening, 3 or 4 = glazing bars |
| `arch (room)` | `true` | arched doorway on the art side (false = unbroken wall) |
| `lamp (room)` | `"auto"` | pendant lamp: auto (lit on dark palettes) · on · off |
| `glow (room)` | `1.0` | pendant lamp brightness |
| `hero (clouds)` | `"auto"` | auto (balloon on light palettes, moon on dark) · balloon · sun · moon — sun and moon are a plain pale disc in a soft glow |
| `clouds (clouds)` | `1.0` | how many clouds: 0.5 = a few, 1.6 = crowded |
| `soft (clouds)` | `0.45` | subsurface softness of the clouds: 0 = matte clay (fastest), 1 = very soft |
| `stars (clouds)` | `1.0` | star brightness on dark palettes (0 = none) |

### prism
**Dark Prism** · Blender · subject on a plain ground · default type `elegant` (also suits `luxe`, `swiss`, `techno`, `impact`)

luxurious, futuristic, cinematic — interlocking glass rings around a glowing core, lit by coloured studio lights on black. Good for premium tech, AI/science, finance, galas, awards, night events.

**Cut-out**: can stand on a ground — checked with `haze`, `halftone`, `pattern/grid`, `pattern/dots`.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `nebula` (default) | dark | `#07070d` · `#b9a8ff` · `#7b5cff` `#ff4fa3` `#22d3ee` `#ffffff` |
| `ember` | dark | `#0c0807` · `#ffb36b` · `#ff6a2b` `#ffc24a` `#ff2e63` `#fff1dd` |
| `glacier` | dark | `#050b12` · `#8fdcff` · `#38bdf8` `#a5f3fc` `#6366f1` `#ffffff` |
| `emerald` | dark | `#04100c` · `#7ef0c0` · `#34d399` `#a3e635` `#22d3ee` `#f0fff8` |
| `champagne` | dark | `#0d0b08` · `#e8c98f` · `#e8c98f` `#fff3d6` `#c98b5e` `#ffffff` |

| Param | Default | Effect |
|---|---|---|
| `rings` | `3` | 2–5 interlocking rings |
| `core` | `"glow"` | glow | chrome | none — what sits at the centre |
| `frost` | `0.0` | 0 = clear glass … 0.3 = frosted |

### chrome
**Liquid Chrome** · Blender · subject on a plain ground · default type `techno` (also suits `impact`, `elegant`, `brutal`, `swiss`, `esamanru`)

Y2K, futuristic, glossy — blobby mirror-chrome forms and droplets floating in front of a plain wall, mirroring big gradient light cards in the palette colours. Good for music and club nights, fashion drops, tech and gaming launches, festivals, anything that should feel like liquid metal.

**Cut-out**: can stand on a ground — checked with `haze`, `halftone`, `pattern/grid`, `pattern/dots`.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `hologram` (default) | dark | `#07070d` · `#b9a8ff` · `#7b5cff` `#ff4fa3` `#22d3ee` `#ffffff` |
| `acid` | dark | `#070b08` · `#b6ff3c` · `#b6ff3c` `#00d6c4` `#2447ff` `#f6ffe0` |
| `molten` | dark | `#0d0806` · `#ff9d4d` · `#ff5a1f` `#ffc24a` `#d81e5b` `#fff1dd` |
| `pearl` | light | `#efeaf6` · `#6a3df0` · `#6a3df0` `#ff6fb5` `#3ccfff` `#ffffff` |
| `cobalt` | light | `#f2f0ea` · `#f0441a` · `#16224f` `#2f55ff` `#ff4b1f` |

| Param | Default | Effect |
|---|---|---|
| `forms` | `4` | 3–5 chrome forms: a big amoeba plus ring / drip / peanut / teardrop (seed picks which) |
| `droplets` | `7` | number of small chrome droplets around the forms (0 = none) |
| `roughness` | `0.035` | 0 = perfect mirror … 0.25 = brushed / satin metal |
| `shadow` | `14` | softness of the shadows on the wall in degrees: 3 = crisp … 25 = very soft |

### glass
**Frosted Glass** · Blender · subject on a plain ground · default type `swiss` (also suits `elegant`, `slim`, `square`, `bold`, `techno`, `friendly`)

glassmorphism made of real glass — thin bevelled slabs of frosted glass with bright rims, blurring the saturated orbs and lights behind them. Clean, premium, contemporary; good for tech and product launches, design and architecture events, finance, science, beauty.

**Cut-out**: can stand on a ground — checked with `haze`, `halftone`, `pattern/grid`, `pattern/dots`.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `cards` (default) | two overlapping frosted cards with orbs behind — interface, product, membership | tech, business, finance, design |
| `discs` | round lenses and a ring over orbs and a light bar — abstract, sound, optics | science, music, beauty, wellness |
| `arch` | arch slabs standing on glass steps, a glowing disc behind — space, exhibition, opening | architecture, art, luxury, fashion |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `sorbet` (default) | light | `#eceef7` · `#4f46e5` · `#5b6cff` `#ff6fae` `#ffb93f` `#2fd0c4` |
| `peach` | light | `#fbece3` · `#e2502a` · `#ff7a4d` `#ffb347` `#ff5c8a` `#8f7bff` |
| `mint` | light | `#e3f3ed` · `#0b8f6e` · `#1ecf9c` `#2a9dff` `#b9ea3c` `#7a6cff` |
| `aurora` | dark | `#0b1024` · `#8fb4ff` · `#6a5cff` `#ff5fa8` `#29d3ff` `#ffb86b` |
| `ember` | dark | `#140c12` · `#ff9d5c` · `#ff6a3d` `#ff3d81` `#ffc857` `#9b5cff` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"cards"` | cards (overlapping rounded cards) | discs (round lenses and a ring) | arch (arch slabs on glass steps with a glowing disc) |
| `frost` | `0.24` | 0.1 = lightly etched, shapes behind stay readable … 0.4 = heavy frost, pure colour haze |
| `glow` | `1.0` | self-light of the orbs and the lamp behind the glass (0.5 = calm … 1.6 = luminous) |
| `shadow` | `12` | shadow softness in degrees: 4 = crisp … 25 = very soft |

### foil
**Holographic Foil** · Blender · subject on a plain ground · default type `pop` (also suits `bold`, `jalnan`, `comic`, `ssurround`, `dongle`, `yeonsung`, `friendly`, `impact`, `techno`)

holographic foil — mirror-bright metallised film whose reflections break into rainbow interference colours: inflated mylar balloons with crinkled seams, a crumpled sheet, curled ribbons. Festive, glossy, a little Y2K; good for parties and openings, launches and sales, music, fashion and beauty, year-end events.

**Cut-out**: can stand on a ground — checked with `pattern/checker`, `pattern/stripes`, `pattern/dots`, `pattern/terrazzo`, `pattern/arches`, `pattern/grid`, `haze`, `halftone`.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `balloons` (default) | a cluster of mylar balloons — stars, rounds and a heart | celebration, kids, family, community |
| `sheet` | a crumpled disc of foil behind a mirror-smooth sphere — product, fashion, beauty | fashion, beauty, luxury, tech |
| `ribbons` | curled gift ribbons and a burst of confetti — sale, festival, awards | market, music, nightlife, winter |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `holo` (default) | light | `#ebe7f5` · `#6d35e8` · `#ff7ad1` `#7aeaff` `#b59bff` `#fff3a0` |
| `rosegold` | light | `#f6e6df` · `#b83a62` · `#ffb09c` `#ff86b7` `#ffd9a0` `#c9a6ff` |
| `mint` | light | `#e0f2ec` · `#0b7f70` · `#7dffd4` `#7ac8ff` `#d6ff8a` `#ff9fe0` |
| `midnight` | dark | `#0b0a18` · `#b9a8ff` · `#7b5cff` `#ff4fa3` `#22d3ee` `#ffe27a` |
| `blackgold` | dark | `#0e0c0a` · `#f0c06a` · `#f6c667` `#ff8a5c` `#fff1c9` `#b98cff` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"balloons"` | balloons (cluster of foil balloons: stars, rounds, a heart) | sheet (crumpled foil disc behind a mirror-smooth sphere) | ribbons (curled ribbons and confetti) |
| `count` | `6` | balloons motif: number of balloons, 3–6 |
| `crumple` | `1.0` | sheet motif: 0.5 = lightly creased … 1.5 = heavily crumpled |
| `confetti` | `44` | ribbons motif: number of confetti pieces (0 = none) |
| `film` | `1.0` | strength of the thin-film interference on top of the palette shimmer (0 = off) |
| `shadow` | `12` | shadow softness in degrees: 4 = crisp … 25 = very soft |

### metal
**Machined Metal** · Blender · subject on a plain ground · default type `techno` (also suits `swiss`, `square`, `impact`, `bold`, `elegant`, `dream`)

machined and anodised metal — turned and brushed aluminium, anodised colour, knurling and chamfers under strip lights; exact, engineered, cool. Good for tech and hardware launches, engineering and science events, audio and music gear, automotive, finance.

**Cut-out**: can stand on a ground — checked with `haze`, `halftone`, `pattern/grid`, `pattern/dots`.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `dial` (default) | a stack of precision rings and discs, like an instrument dial | tech, design, music, business |
| `rods` | turned tubes and rods standing on a plate | architecture, science, business |
| `blocks` | a landscape of machined blocks with chamfers and knurling | tech, city, design |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `graphite` (default) | dark | `#16181b` · `#ff7a2f` · `#ff6a1c` `#30343a` `#c9a25c` `#d6d9dd` |
| `silver` | light | `#e3e5e8` · `#d83a1e` · `#e2432a` `#23262b` `#2f6fd6` `#dadde1` |
| `cobalt` | dark | `#0b111f` · `#5d9bff` · `#2f6bff` `#141821` `#22c3c9` `#d5dae2` |
| `champagne` | light | `#eae4d9` · `#9a6a2a` · `#c9a36a` `#5e4636` `#8c8f6a` `#dfd9cf` |
| `violet` | dark | `#130f1c` · `#b18cff` · `#8558ff` `#1d1a26` `#ff4f9d` `#d8d6e0` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"dial"` | dial | rods | blocks |

### stone
**Marble & Gold** · Blender · subject on a plain ground · default type `luxe` (also suits `editorial`, `fatface`, `elegant`, `myeongjo`, `swiss`)

polished veined marble with small gold accents in a soft studio — plinths, steps, spheres and arches, the language of a product podium; composed, expensive, calm. Good for luxury and beauty launches, galas and awards, finance, architecture, exhibitions.

**Cut-out**: can stand on a ground — checked with `haze`, `halftone`, `pattern/arches`, `pattern/grid`, `pattern/dots`.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `podium` (default) | a stepped plinth with a sphere and a brass ring | luxury, beauty, fashion, celebration |
| `balance` | spheres and slabs in equilibrium | wellness, art, design, finance |
| `arch` | an arch gateway of veined stone | architecture, culture, luxury, art |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `carrara` (default) | light | `#e8e4de` · `#8a6524` · `#f1efea` `#878b93` `#26272b` `#d8ab52` |
| `nero` | dark | `#121315` · `#d9b46a` · `#2b2c31` `#e6e1d6` `#eeece7` `#dcb05c` |
| `verde` | dark | `#0f1f1a` · `#dab968` · `#1e4c3d` `#cfe2d4` `#ebe6da` `#dbb15b` |
| `rosa` | light | `#eedfd8` · `#a2523b` · `#dca595` `#f7ebe4` `#5a2c2c` `#cf9a52` |
| `lapis` | dark | `#0d1530` · `#e3c173` · `#213f86` `#e8d7a2` `#f0ede5` `#e0b55c` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"podium"` | podium | balance | arch |

### ceramic
**Glazed Ceramic** · Blender · subject on a plain ground · default type `editorial` (also suits `myeongjo`, `story`, `maru`, `calli`, `swiss`, `hand`, `luxe`)

hand-thrown stoneware — lathe-turned pots, bowls and tiles with a glossy glaze over a matte clay body: dip lines, iron speckle, bare foot rings and window highlights. Warm, tactile, quiet; good for craft fairs and markets, cafés and tea, food, exhibitions, homeware, slow-living brands.

**Cut-out**: can stand on a ground — checked with `pattern/checker`, `pattern/stripes`, `pattern/dots`, `pattern/terrazzo`, `pattern/arches`, `pattern/grid`, `haze`, `halftone`.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `vases` (default) | a bottle, a moon jar and small pots on plinth blocks — exhibition, interior, craft | craft, art, design, culture |
| `table` | nested bowls, stacked cups, a carafe and a mug on a round slab — tea, coffee, dining | food, market, family, wellness |
| `tiles` | a panel of hand-glazed wall tiles with two-tone arcs and dots — pattern, space, workshop | architecture, design, education, tradition |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `celadon` (default) | light | `#e8ebe1` · `#2c6f62` · `#9cc4ae` `#2d6a6e` `#f0e8d6` `#c56f4a` |
| `cobalt` | light | `#f0ece2` · `#1f3fae` · `#1f3fae` `#f4efe3` `#86a8d9` `#d7a23f` |
| `oat` | light | `#eee4d4` · `#a94a24` · `#e6d9c0` `#b4532a` `#8a9a7b` `#3d3b37` |
| `blush` | light | `#f5e2da` · `#c0392f` · `#f0b3a2` `#c8463c` `#fff3e6` `#6f8f8a` |
| `kiln` | dark | `#1f1c1a` · `#e8a15a` · `#e9dfcf` `#c8663c` `#3f6f6a` `#e8b04a` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"vases"` | vases (still life of vases on plinth blocks) | table (stacked bowls, cups and a carafe on a round slab) | tiles (panel of patterned wall tiles) |
| `speckle` | `0.6` | iron speckle in the glaze: 0 = clean porcelain … 1 = heavily flecked stoneware |
| `shadow` | `10` | shadow softness in degrees: 4 = crisp … 25 = very soft |

### neon
**Neon Sign** · Blender · fills the sheet · default type `retro` (also suits `impact`, `euljiro`, `yeonsung`, `comic`, `bold`, `techno`, `brutal`, `classic`)

neon tube signage — bent glass tubes with a white-hot core, standing off the wall on little mounts, their coloured light spilling over brick, plaster or a slatted panel. Night-time, urban, a little retro; good for bars and food, music and club nights, film, games, late openings, city events.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `arcs` (default) | abstract arcs and lines: concentric arches, a ring, a baseline and waves | music, design, art, summer |
| `icons` | outline icons — heart, star, cocktail glass, music note, arrow (choose with `icons`) | nightlife, food, gaming, celebration |
| `frame` | a double frame of tubes round the sheet with the copy inside it — type-led announcements | film, retro, city, market |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `tokyo` (default) | dark | `#0e0b16` · `#ff6fb5` · `#ff2e88` `#22d3ee` `#ffd23f` `#f3ecff` |
| `diner` | dark | `#0b1018` · `#ffb02e` · `#ff4a3d` `#ffb02e` `#38e1ff` `#fff4e0` |
| `lagoon` | dark | `#07110f` · `#5ff5c8` · `#2ef2c0` `#3d8bff` `#c5ff4a` `#f0fff8` |
| `ember` | dark | `#150b09` · `#ff8a4d` · `#ff5a2b` `#ffc84a` `#ff3d7a` `#fff1dd` |
| `daylight` | light | `#efd8d1` · `#d81b5c` · `#ff2e7e` `#ff7a1a` `#7a5cff` `#0aa6a0` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"arcs"` | arcs (abstract arches, ring, baseline and waves) | icons (a set of outline icons) | frame (a double frame of tubes round the whole sheet) |
| `icons` | `"heart,star,cocktail,note,arrow"` | icons motif: comma list from heart, star, cocktail, note, arrow, bolt, moon, cup, ring — one name alone makes a single large sign |
| `wall` | `"auto"` | brick | plaster | panel (slatted) — auto: plaster for arcs, brick for icons, panel for frame |
| `glow` | `1.0` | brightness of the tubes and their halo (0.6 = dimmed … 1.5 = blazing) |
| `spill` | `1.0` | how much coloured light lands on the wall (0.5 = tight … 1.6 = floods the wall) |

### monolith
**Monolith Editorial** · Blender · subject on a plain ground · default type `editorial` (also suits `myeongjo`, `maru`, `slim`, `luxe`, `swiss`, `bold`)

quiet, cultured, architectural — plaster arches, steps and spheres in low sunlight with long shadows, set with serif type. Good for exhibitions, galleries, books, fashion, hospitality, weddings, anything editorial or artisanal.

**Cut-out**: can stand on a ground — checked with `haze`, `halftone`, `pattern/arches`, `pattern/checker`, `pattern/dots`.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `terracotta` (default) | light | `#eadfd1` · `#a2462d` · `#c4654a` `#f0dcc4` `#8a3f2c` `#f6efe6` |
| `sage` | light | `#dfe4d7` · `#46664c` · `#7d9471` `#eef1e6` `#3f5445` `#c9d3bf` |
| `stone` | light | `#e3e1dc` · `#8f6718` · `#a9a59d` `#f3f2ee` `#d9a441` `#77746e` |
| `dusk` | light | `#ddd3e2` · `#69508c` · `#8f7aa8` `#f4eef7` `#e7a48c` `#4b3d63` |
| `ink` | dark | `#211f1d` · `#c9a66b` · `#4a4743` `#c9a66b` `#75706a` `#e9e3d8` |

| Param | Default | Effect |
|---|---|---|
| `sun` | `1.0` | sunlight strength multiplier |
| `shadow` | `2.5` | sun angle in degrees: 0.5 = razor-sharp shadows … 8 = soft |

### fabric
**Draped Fabric** · Blender · subject on a plain ground · default type `elegant` (also suits `luxe`, `didone`, `editorial`, `myeongjo`, `garamond`)

draped cloth — silk satin or velvet falling in large folds with a clear hierarchy of big swags, medium folds and small wrinkles, hemmed edges and soft gradient light running along the folds as sheen. Sensual, theatrical, premium; good for fashion and beauty, theatre, film and concerts, exhibition openings and unveilings, luxury launches, weddings and galas.

**Cut-out**: can stand on a ground — checked with `haze`, `halftone`, `pattern/dots`, `pattern/stripes`.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `drape` (default) | a cloth thrown over a hidden form on the floor, taut on top and pooling in folds — an unveiling | art, luxury, design, fashion, business |
| `curtain` | a stage curtain on a brass rod, pinch-pleated, tied back with a cord and pooling on the floor | film, music, culture, celebration, literature |
| `flow` | a broad silk sheet hung by its two top corners, falling into deep swags and stirred by the wind | fashion, beauty, wellness, luxury, spring |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `rose` (default) | light | `#f3e6e1` · `#a8323f` · `#c2414f` `#d9a75b` `#7a2833` `#f0d2c8` |
| `champagne` | light | `#f2ece2` · `#8a6a3f` · `#dcc6a0` `#8a6a3f` `#b9a27a` `#5c4a3a` |
| `sky` | light | `#e6edf3` · `#2f5fa8` · `#3d6fc4` `#e0b04a` `#9cb8dc` `#1f3a66` |
| `theatre` | dark | `#1a1013` · `#e2b25a` · `#b0182e` `#e2b25a` `#5e0c19` `#f0c987` |
| `emerald` | dark | `#0f1d1a` · `#d9b56c` · `#1f7f60` `#d9b56c` `#0f4a3a` `#9fd1bd` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"drape"` | drape (a cloth thrown over a hidden form, pooling on the floor) | curtain (a stage curtain on a rod, pleated, tied back, pooling) | flow (a silk sheet hung by two corners, falling into swags, stirred by the wind) |
| `cloth` | `"satin"` | satin (silk satin, long anisotropic highlights) | velvet (deep pile, bright rims, dark cores); curtain defaults to velvet |
| `colorIndex` | `0` | which palette colour the cloth is dyed |
| `key` | `1500` | key light (W); the backdrop is calibrated to it |
| `rim` | `1` | back light on the cloth only: 0 = none … 2 = strong glowing edges |
| `wind` | `1` | flow only: wind on the hanging sheet, 0 = still … 2 = gusty |
| `cloth (curtain)` | `"velvet"` | satin | velvet |

### toon
**Toon Cel** · Blender · subject on a plain ground · default type `pop` (also suits `friendly`, `maple`, `dongle`, `ssurround`, `comic`, `gamja`, `round`, `singleday`, `bold`, `hand`, `retro`)

cel-shaded 3D with ink outlines — flat tone bands, flat cast shadows and a coloured contour line on a flat backdrop, like a frame of animation. Friendly and graphic: education, kids and family, community events, cafés, design talks.

**Cut-out**: can stand on a ground — checked with `pattern/checker`, `pattern/stripes`, `pattern/dots`, `pattern/terrazzo`, `pattern/arches`, `pattern/grid`, `haze`, `halftone`.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `desk` (default) | still life: stacked books, a steaming mug, a desk lamp, a potted plant, an apple and a pencil | education, literature, design, craft, food |
| `hills` | a small landscape: round hills, lollipop trees and pines, a house, clouds and a pale sun | nature, outdoor, travel, kids, family, spring |
| `blocks` | abstract stacked solids: arch, column, cone, steps, ring and balls | design, art, tech, business, architecture |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `candy` (default) | light | `#fbefd9` · `#f0503f` · `#ff8a5c` `#ffc94d` `#4fb5a0` `#5b7fe0` `#f7a8c4` |
| `mint` | light | `#d6efe2` · `#f2603f` · `#ff9a76` `#f6c453` `#3fa98c` `#2f6fb0` `#fff3d6` |
| `sorbet` | light | `#ffdfe3` · `#e8386a` · `#ff7fa0` `#ffb86b` `#7fcfc0` `#9b8cf0` `#fff5e1` |
| `sky` | light | `#cde4ff` · `#f2603a` · `#ff8f6b` `#ffd166` `#57c7a8` `#4c8dff` `#ffffff` |
| `night` | dark | `#1f1d42` · `#ffc857` · `#ff6f91` `#ffc75f` `#4fd1c5` `#7a7cff` `#f9f1e0` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"desk"` | desk (still life: books, mug, lamp, plant) | hills (small landscape with trees, a house and clouds) | blocks (abstract stacked solids) |
| `bands` | `3` | tone bands per colour: 2 (shadow + base) or 3 (adds a highlight band) |
| `outline` | `1.0` | contour line weight: 0 = no lines, 1 = standard, 1.6 = heavy marker |

### lowpoly
**Low-Poly** · Blender · subject on a plain ground · default type `bold` (also suits `swiss`, `round`, `comic`, `friendly`, `techno`, `impact`, `maple`)

faceted low-poly — models cut from a few flat triangles in big, medium and small sizes, each facet its own slightly shifted colour under one hard sun, standing or floating over the plain poster colour. Crisp and optimistic: outdoor and travel, games, science and climate, start-ups, seasonal campaigns.

**Cut-out**: can stand on a ground — checked with `pattern/checker`, `pattern/stripes`, `pattern/dots`, `pattern/terrazzo`, `pattern/arches`, `pattern/grid`, `haze`, `halftone`.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `island` (default) | a floating island: grass top, hanging rock, pines, a hut, clouds | nature, travel, gaming, kids, community |
| `peaks` | a snowy mountain range with pine forest, a summit flag and a cabin | outdoor, sports, travel, winter, business |
| `berg` | an iceberg in a disc of sea with floes and a small boat | science, winter, nature, finance, summer |
| `rocket` | a rocket lifting off a mound of faceted smoke | tech, science, education, business, kids |
| `forms` | abstract faceted solids: geodesic ball, spires, boulder | design, art, architecture, tech, education |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `meadow` (default) | light | `#dcecee` · `#ee5d3a` · `#86c56c` `#8c705c` `#2f9070` `#f8f4ea` `#48a6c8` |
| `autumn` | light | `#f6e6cf` · `#c53f2a` · `#e0aa45` `#80594a` `#d8602a` `#fbf2e0` `#5a9aa8` |
| `frost` | light | `#e4edf7` · `#e8553d` · `#b7cadc` `#5a6d8c` `#2e6079` `#ffffff` `#62aee0` |
| `coral` | light | `#ffe2d6` · `#f2495e` · `#f6a070` `#8a5878` `#c2477a` `#fff1e4` `#7a70d0` |
| `night` | dark | `#141f3c` · `#ffb347` · `#2f8375` `#474a7c` `#1f6470` `#d2e2f6` `#3c72dc` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"island"` | island (floating island with trees and a hut) | peaks (snowy mountain range with pines) | berg (iceberg in a disc of sea, a small boat) | rocket (a rocket lifting off a mound of smoke) | forms (abstract faceted solids) |
| `jitter` | `1.0` | per-facet colour variation: 0 = uniform colour fields, 1 = standard, 2 = lively mosaic |
| `shadow` | `2.5` | sun size in degrees: 1 = razor shadows, 8 = soft |

### isometric
**Isometric Miniature** · Blender · subject on a plain ground · default type `bold` (also suits `swiss`, `round`, `singleday`, `dongle`, `editorial`, `pop`, `hand`, `paperlogy`)

isometric miniature — a tiny diorama on a rounded slab seen from the classic three-quarter angle: matte pastel boxes with one small bevel everywhere, light tops, a shaded side and little props for scale. Warm and tidy: interiors and cafés, openings, festivals and concerts, workshops, product and service explainers.

**Cut-out**: can stand on a ground — checked with `pattern/checker`, `pattern/stripes`, `pattern/dots`, `pattern/terrazzo`, `pattern/arches`, `pattern/grid`, `haze`, `halftone`.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `room` (default) | a cosy studio room: sofa, desk and window, bookcase, plants, a cat on the rug | design, education, literature, wellness, craft |
| `shop` | a café front: striped awning, shop window, terrace tables, a street tree and lamp | food, market, community, city, business |
| `stage` | a festival stage: truss and canopy, screen, speaker stacks, a band and a small crowd | music, nightlife, celebration, culture, film |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `peach` (default) | light | `#f7e3d3` · `#e8553a` · `#f4b9a2` `#f1dcc0` `#c98d5e` `#8fb8c9` `#6fae7f` |
| `mint` | light | `#dcefe4` · `#f0704a` · `#a9d8c2` `#f3ead7` `#c79a6b` `#7fa8d8` `#4f9f76` |
| `lilac` | light | `#e7e0f6` · `#f2617a` · `#c5b6ec` `#f4ecdf` `#b98b6e` `#8fc7d6` `#6fb08a` |
| `sand` | light | `#efe6d2` · `#d9603a` · `#e3cfa6` `#f6eede` `#a8794f` `#7fa3a8` `#7c9a5a` |
| `night` | dark | `#1e2238` · `#ffb454` · `#5a6aa8` `#3a4166` `#a9754f` `#4f8fb0` `#4f9a78` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"room"` | room (a cosy studio: sofa, desk, bookcase, plants, a cat) | shop (a café front with awning, terrace and street tree) | stage (a festival stage with truss, screen, speakers, a band and a crowd) |
| `shadow` | `6.0` | sun size in degrees: 2 = crisp shadows, 12 = very soft |

### voxel
**Voxel Blocks** · Blender · subject on a plain ground · default type `techno` (also suits `bold`, `cute`, `comic`, `round`, `pop`, `retro`, `impact`, `dunggeunmo`, `maple`)

voxel art — a scene built cube by cube, each block with a tiny chamfer and a short quantised palette, lit like a miniature. Playful and precise: games and hackathons, kids and family, city and community events, maker fairs.

**Cut-out**: can stand on a ground — checked with `pattern/checker`, `pattern/stripes`, `pattern/dots`, `pattern/terrazzo`, `pattern/arches`, `pattern/grid`, `haze`, `halftone`.

Layouts — landscape: `left` (default), `right`, `top`, `bottom`, `corners`, `headline`, `baseline`, `vertical`, `axis`, `band`, `strip` · portrait: `top` (default), `bottom`, `corners`, `baseline`, `vertical`, `axis`, `side`

| Motif | Shows | Suits |
|---|---|---|
| `island` (default) | a terrain block: grass, earth and stone strata, trees, a house, water, clouds | nature, gaming, kids, outdoor, education |
| `city` | a city block: towers with windows, a shop, a pocket park, cars | city, business, architecture, community, tech |
| `heart` | one big voxel heart with a pixel shine and drifting cubes | celebration, community, wellness, family, gaming |

| Palette | Tone | Background · accent · colours |
|---|---|---|
| `garden` (default) | light | `#f1ead8` · `#ef5350` · `#7cc46a` `#a9744f` `#8f98a8` `#4fb3e8` `#f6e7b8` |
| `candy` | light | `#ffe4ec` · `#ff4d8d` · `#8fd9a8` `#c98b6b` `#b9a7d9` `#7cc6f2` `#fff3c4` |
| `desert` | light | `#f5dfc0` · `#d9482b` · `#c9b25a` `#b0693f` `#8c7868` `#3fa7a0` `#fbeccb` |
| `snow` | light | `#e3eef8` · `#e8503a` · `#f4f8fb` `#8a735f` `#6d7f99` `#5aa9e6` `#ffffff` |
| `arcade` | dark | `#1b1b2f` · `#ff4f7b` · `#3ddc97` `#7b5cd6` `#4a4f7d` `#38b6ff` `#ffe66d` |

| Param | Default | Effect |
|---|---|---|
| `motif` | `"island"` | island (terrain block with trees, a house, water and clouds) | city (a city block with towers, a park and cars) | heart (one big voxel heart with loose cubes) |
| `bevel` | `1.0` | chamfer on every cube: 0 = razor cubes, 1 = standard, 2 = soft bricks |
| `shadow` | `4.0` | sun size in degrees: 1 = crisp shadows, 10 = soft |

## Type themes

Any type theme works with any style. Each sets its own Korean and Latin faces, weights, spacing and
small decorations (how the eyebrow, emphasis, button and badge look).

| Theme | Voice | Korean · Latin faces | Title treatment | Good for |
|---|---|---|---|---|
| `bold` | confident all-rounder | Pretendard ExtraBold | tight heavy sans, accent emphasis | almost anything; the safe pick |
| `friendly` | warm, approachable | Pretendard Black | gradient emphasis, pill eyebrow | community, product news, education |
| `impact` | loud, technical | Black Han Sans · Archivo Expanded | upper-case, glow on dark, mono details, crop marks | conferences, music, gaming |
| `swiss` | precise, airy | Pretendard Bold · Space Grotesk | medium grotesk, mono labels, solid hairline | B2B, research, architecture, design |
| `elegant` | quiet, premium | Pretendard Medium · Space Grotesk | light weights set large, gradient emphasis on dark | premium tech, finance, galas |
| `editorial` | magazine, cultured | Hahmlet (명조) · Fraunces | high-contrast serif, italic emphasis (Latin) | exhibitions, books, fashion, hospitality |
| `myeongjo` | literary, traditional | Song Myung (송명) | brush-rooted display 명조, wide-set label | literature, tradition, seasons; best with `vertical` |
| `luxe` | hairline, ceremonial | Nanum Myeongjo · Playfair Display | thin display, very wide-set capitals | fashion, beauty, weddings, hotels, awards |
| `retro` | signage, newtro | Do Hyeon (도현) · Bebas Neue | upper-case with a solid drop shadow, label on a block | markets, festivals, food, pop-ups |
| `brutal` | the headline is the image | Black Han Sans · Archivo Condensed Black | ultra-heavy, tight, grows to fill; thick rules | type-led culture posters, music, protest; best with `headline` |
| `pop` | kitsch, playful | Bagel Fat One · Unbounded | chubby letters with sticker outline, tilted badge | kids, sales, festivals, pop-ups |
| `hand` | personal, informal | Gaegu (개구) | marker handwriting, wavy underline emphasis | classes, clubs, cafés, community notices |
| `techno` | machine, sci-fi | Nanum Gothic Coding · JetBrains Mono | monospaced, bracketed label, corner ticks | hackathons, games, labs, sci-fi |

Notes for Korean copy:

- `myeongjo`, `retro`, `pop`, `hand`, `techno` and `luxe` use display faces from the extra
  font pack. Several cover only the ~2,350 common Hangul syllables; a rare syllable falls back to
  another face and the report says so (`glyph-fallback`).
- `impact`, `retro`, `brutal` and `techno` upper-case Latin titles; this does nothing to Hangul.
  Switch it off for long Latin titles with `"vars": {"--title-case": "none"}`.
- `editorial` and `luxe` italicise emphasised Latin words; Hangul emphasis is colour only.
- `elegant` and `friendly` paint emphasised words with a gradient of palette colours 1–3, so on
  those themes the emphasis follows the 3D colours rather than `accent`.


**More voices** — each follows a tradition of poster and book typography; the faces named in
brackets are the commercial typefaces usually seen there, for which the bundled free faces stand in.
In the lettered themes (`story`, `melody`, `gamja`, `dongle`, `singleday`, `yeonsung`, `calli`) the
Hangul face sets a Korean headline with its own figures and Latin, and a Latin face of the same
voice sets an English one. Every bundled face is free for commercial use and in wide use
(`fonts.md` has the licence and the figures for each); a face that is not bundled can be fetched
with `scripts/fonts.mjs` when the copy asks for it.

| Theme | Tradition it follows | Suits |
|---|---|---|
| `arcade` | the 8-bit title screen and the 오락실 sign above it (Namco and Nintendo bitmap lettering, scoreboard numerals, coin-op marquees). Pixelify Sans for Latin, Do Hyeon — narrow, square-cut sign lettering — for Hangul; a stepped drop shadow, HUD labels. | nightlife, gaming |
| `batang` | Korean literary book design (문학동네·민음사 시집 표지, 본문 명조: SM신명조 / 산돌명조 beside Garamond): one regular-weight 명조, large and quiet. Stand-ins: Gowun Batang + EB Garamond. | culture, tradition, literature, family, nature, wellness |
| `bitmap` | the pixel type of handheld consoles and early Korean PC screens (Nintendo DS system font, 도트 글꼴 of 1990s 한글 BBS): everything on one pixel grid, the headline a pixel bolder. Face: Galmuri11 Regular and Bold (Hangul and Latin drawn on the same grid). | gaming, retro |
| `brush` | 붓글씨 title calligraphy of Korean film posters, 전통주 labels and exhibition titles (hand-lettered 캘리그라피 over a quiet 명조): one sweeping brush headline, everything else small and still. Stand-ins: East Sea Dokdo (its Latin is the same brush) over Gowun Batang + EB Garamond. | tradition, autumn |
| `calli` | brush-pen calligraphy: a handwritten wedding card, a tea house's menu, the title of a travel essay (붓펜 캘리그라피; 나눔손글씨 붓): quick slanted strokes that end in a dry tail, over a quiet 명조. Faces: Nanum Brush Script for Hangul, with its own figures and Latin, over Gowun Batang; Kaushan Script sets a Latin headline. | tradition, literature, beauty, food, travel, spring |
| `comic` | comic-book cover lettering and the caption of a variety show (만화 표지·예능 자막): heavy letters in colour, an ink outline, a hard shadow, the label in a caption box. Faces: Bangers — the leaning capitals of American comics — for a Latin headline; Black Han Sans, heavy and blunt, for Hangul. | nightlife, market, kids, sports, summer, gaming |
| `condensed` | film one-sheets, fight bills and stadium signage (Trade Gothic Bold Condensed, Knockout, Champion Gothic). Big Shoulders Display for Latin, Black Han Sans — the heavy Korean headline gothic — for Hangul; tall capitals, a billing-block footer. | architecture, music, nightlife, film, sports, outdoor |
| `cute` | the small pixel hand of a handheld game's dialogue box and a 2000s phone screen (도트 대화창 글씨; 귀여운 픽셀): thin and narrow, drawn on a grid but friendly. Faces: one face, Cute Font, with its own pixel Latin and figures. | kids, gaming, retro |
| `deco` | art-deco capitals: Cassandre's posters, the Gatsby jacket, cinema marquees, 경성 모던 (Broadway, Peignot, Plaza; Futura Light beside them). Poiret One for Latin, Pretendard ExtraLight — the same single hairline — for Hangul, Jost Light for the details; wide-set caps between twin rules. | luxury, travel, winter, retro, celebration |
| `didone` | fashion-magazine didone: the cover lines of Vogue and Harper's Bazaar (Didot, Bodoni; Brodovitch and Fabien Baron's pages). Bodoni Moda stands in for the Latin, Nanum Myeongjo ExtraBold — a high-contrast 명조 — for Hangul. | finance, art, film, fashion, luxury, beauty |
| `dodum` | the warm humanist gothic of Korean lifestyle and craft publishing (Frutiger / Gill Sans Light beside 산돌고딕Neo Light, 윤고딕 320): open, light, unhurried. Stand-ins: Gowun Dodum + Nunito Sans. | education, kids, family, community, nature, wellness |
| `dongle` | round felt-pen letters with soft ends, the hand of a kindergarten notice board and a sticker sheet (동글동글한 어린이 글씨): small plump syllables set close, like beads on a string. Faces: Dongle Bold for Hangul, with its own figures and Latin; Baloo 2 ExtraBold — as round and as heavy — sets a Latin headline. | education, kids, family, spring, summer, celebration |
| `fatface` | the fat face of a nineteenth-century playbill and of a newspaper's 호외: hairlines against slabs of black, cut in wood or metal (옛 활자의 굵은 견출명조; Thorowgood, Elephant, 신문 제호). Faces: Abril Fatface for Latin and figures, Noto Serif KR Black for Hangul; the details in Hahmlet. | finance, culture, music, film, luxury, retro |
| `flora` | hairline display serifs of beauty and fashion editorial (Canela Thin, Didot Light; 산돌 정체 030, 윤명조 110): one fragile line weight and a lot of white. Stand-ins: Hahmlet Thin + Fraunces Thin, text in Gowun Batang. | beauty, nature, wellness, spring |
| `gamja` | a child's crayon letters, wobbling and proud (삐뚤빼뚤한 크레파스 글씨): the hand of a school fair banner, a lemonade stand, a family day. Faces: Gamja Flower for Hangul, with its own figures and Latin; Caveat Brush — the same blunt marker — sets a Latin headline. | food, kids, family, craft |
| `garamond` | literary book typography: Penguin Classics, Gallimard's "Blanche", Korean 문학 전집 covers (Garamond, Sabon; SM 신명조). Cormorant Garamond for Latin, Nanum Myeongjo Regular — the bookish 명조 — for Hangul; italics and spaced capitals, nothing louder. | science, finance, art, tradition, literature, luxury |
| `geometric` | Bauhaus and the New Typography: Herbert Bayer, Tschichold's film posters, Paul Renner (Futura, Kabel). Jost for Latin, Pretendard SemiBold for Hangul; spaced capitals built from circle and line, a dot and a bar for ornament. | tech, education, design, architecture |
| `grotesk` | Swiss International Style: Müller-Brockmann's concert posters, Hofmann, Vignelli (Akzidenz-Grotesk, Helvetica). Inter Tight for Latin, Pretendard — the same neo-grotesk skeleton — for Hangul; one family, two weights, flush left under a rule. | tech, science, business, finance, education, design |
| `humanist` | the humanist gothic of the Korean web and of every town-hall notice since 2008 (나눔고딕): strokes with the proportions of handwriting, soft at the corners, familiar and easy to trust. Faces: Nanum Gothic ExtraBold for a Korean headline, with its own figures; Nunito Sans, a humanist sans of the same open build, for an English one; Pretendard for the details. | science, business, education, culture, literature, beauty |
| `jua` | round-brush shop-sign lettering as revived by the Baemin faces of Woowa Brothers (주아체; 1960–70s 붓글씨 간판): plump, friendly, loud in a kind way. Stand-ins: Jua + Fredoka. | food, market, kids, family |
| `marker` | the fat-marker placard: protest signs, flea-market boards, gig flyers and pop-up price cards lettered with a chisel marker (매직 글씨; abroad the Sharpie caps of zine culture). Stand-ins: Kirang Haerang (기랑해랑체, a loaded brush that hops along the line) + Permanent Marker. | education, food, market, kids, community, summer |
| `maru` | a warm text serif set as a headline: the title of an essay collection, an interview, a neighbourhood bookshop's programme (마루 부리; 화면에서 읽히도록 새로 그린 부리 글꼴): bold but soft, with the roundness of a brush still in its strokes. One family: MaruBuri Bold over MaruBuri Regular, its own Latin and figures. | art, culture, literature, travel, nature, autumn |
| `melody` | thin, round handwriting from a diary margin or a café's menu card (가늘고 동글한 손글씨): light as a pencil line, set large with air around it. Faces: Hi Melody for Hangul, with its own figures and Latin; Indie Flower — as loose and as light — sets a Latin headline. | beauty, family, nature, wellness, spring, winter |
| `news` | broadsheet front page: The New York Times, The Guardian, a Korean daily's 1면 (Cheltenham, Times, Guardian Headline; 신문 견출명조). Newsreader's display cut for Latin, Nanum Myeongjo ExtraBold for Hangul; a sans kicker, an italic standfirst, a ruled fact box. | business, finance, culture, literature, film, city |
| `outline` | the experimental outline display of Korean independent graphic design (art-book-fair and club posters, riso prints with a slipped second colour): a hollow headline that lets the picture through, its emphasised word printed solid. Faces: Black Han Sans for Hangul and Archivo ExtraBold for Latin, drawn as outlines; Pretendard for the details. | design, art, music, nightlife, fashion, gaming |
| `pen` | the felt-tip note: café chalkboards, zines, letters and open-studio notices written by hand (handwriting faces such as 나눔손글씨 펜, the Korean cousin of Caveat). Faces: Nanum Pen Script (its Latin is the same pen) over Pretendard. | literature, family, nature, spring, craft |
| `plex` | the engineered corporate voice of IBM's design language (Helvetica's heir IBM Plex on the Carbon grid; in Korea beside 산돌고딕Neo): semibold headline, mono labels, a ruled information table. Faces: IBM Plex Sans KR (its Latin is IBM Plex Sans) + IBM Plex Mono. | tech, science, business, finance |
| `roman` | inscriptional capitals: the Trajan column, museum and opera-house lettering, film-title cards (Trajan, Optima capitals). Cinzel for Latin, Song Myung — brush-written and cut, as on a 현판 or a stele — for Hangul; a Garamond italic and Nanum Myeongjo carry the details. |  |
| `round` | the rounded square gothic of school newsletters, public campaigns and children's programmes (둥근 네모 고딕; 나눔스퀘어라운드): heavy, soft-cornered, plain-spoken and kind. Face: NanumSquareRound ExtraBold, with its own Latin and figures; Pretendard for the details. | education, kids, family, community, general |
| `signage` | geometric 도안 lettering of 1970–80s Korean shop signs, record sleeves and electronics logos (레터링 도안집; abroad Eurostile / Microgramma): cut-acrylic gothic by day, a lit sign by night. Stand-ins: Do Hyeon (도현체, drawn after signs cut from acrylic sheet) + Oxanium. | food, market, city, retro |
| `singleday` | angular felt-tip lettering with hooked ends, half doodle and half logo (각지고 삐죽한 장난 글씨; 싱글데이): the hand of an indie zine, a board-game café, an odd little pop-up. Faces: Single Day for Hangul, with its own figures and Latin; Mali Bold — a rounder marker of the same humour — sets a Latin headline. | market, kids |
| `slab` | the fat-face slab of wood-type show bills and Americana letterpress (Clarendon, Rockwell Extra Bold, French Antique; Hatch Show Print). Alfa Slab One for Latin, Hahmlet Black — a blunt, bracket-serifed 명조 — for Hangul and for all the details; ruled bands, stamped and sturdy. | business, education, film, food, market, community |
| `slim` | the light cut of Korean modernist 탈네모꼴 lettering (가는 탈네모꼴; 안상수체·공한체 계열의 가는 획): one thin line and round bowls, set large and left alone, for galleries, architecture talks and design fairs. Faces: Sunflower Light for Hangul; Outfit Light — the same geometry — for Latin and figures. | science, design, architecture, art, fashion, wellness |
| `square` | the square-cut gothic of public notices, company briefings and campus banners (네모 고딕; 나눔스퀘어 네오): terminals cut flat, counters squared, a headline that states a fact. One family: NanumSquare Neo Heavy over Regular, its own Latin and figures. | tech, business, education, community, city, general |
| `stencil` | crate and container marking, workshop signage, Le Corbusier's drawings, street-wear drops (Stencil, Glaser Stencil, Octin Stencil). Black Ops One for Latin, Black Han Sans — as heavy and as blunt — for Hangul; a hazard bar, labels in the same cut capitals. | design, architecture, market, sports, outdoor, city |
| `story` | a neat ballpoint hand: the handwritten preface of an essay collection, a bookshop's shelf note, a letter (수필 같은 또박또박한 손글씨): thin, upright, unhurried. Faces: Nanum Barun Pen (나눔바른펜) for Hangul, with its own figures and Latin; Patrick Hand — the same even pen — sets a Latin headline. | education, literature, food, family, community, outdoor |
| `sunflower` | Korean modernist 탈네모꼴 lettering (안상수체 1985, 공한체) in the line of Bauhaus and Futura: modular bold headline for exhibitions and design events. Stand-ins: Sunflower Bold + Outfit. | kids, community, summer, retro |
| `typewriter` | the typescript page: screenplays, case files, Fluxus scores, zines, 원고 (Courier, Pica, Olivetti's Lettera). Courier Prime for Latin, Hahmlet — an even, slab-footed 명조 — for Hangul; one voice at two sizes, underlining for emphasis, form rules under the facts. | science, literature, film, outdoor, autumn, retro |
| `wide` | the extended grotesque of art-centre, fashion and club identities (Druk Wide, Monument Extended, GT America Extended; Syne was drawn for the Synesthésies art centre). Syne ExtraBold for Latin, Pretendard Black for Hangul, whose square syllables are as wide as the Latin is stretched. | tech, design, architecture, music, nightlife, fashion |
| `yeonsung` | the hand-painted shop sign: 연성체, after signs lettered with a flat brush for 식당, 방앗간 and market stalls (1960–80s 붓글씨 간판): upright, thick and sure of itself. Faces: Yeon Sung for Hangul, with its own figures and Latin; Lobster — the sign painter's script — sets a Latin headline. | tradition, food, market, community, retro, celebration |

## Pairing type with style

The default type of each style is the pairing it was designed with. To widen the range:

- **Contrast the two layers.** A busy, colourful render wants calm type (`swiss`, `elegant`,
  `editorial`); a quiet render (`haze`, `wave`, `bauhaus`) can carry loud type (`brutal`, `retro`,
  `pop`).
- **Match the era.** `halftone`/`bauhaus` + `retro`; `chrome` + `brutal` or `luxe`; `paper` +
  `myeongjo` or `hand`; `pixel` + `techno`; `globe`/`flux` + `techno` or `impact`.
- **Full-picture scenes** already fill the sheet, so their type stays calm: `editorial`, `myeongjo`,
  `elegant`, `swiss`, `bold`. Decorated themes (`pop`, `retro`, `brutal`) fight the picture.
- **Dark renders** (`prism`, `flux`, `globe`) pair best with `elegant`, `impact`, `techno`, `luxe`.
  `pop` and `retro` rely on outlines and solid shadows, which read best on light backgrounds.
- **Vertical titles** (`"layout": "vertical"`) suit `myeongjo`, `editorial`, `luxe` and `bold`;
  avoid them with `brutal`, `pop` and `techno`.
- **Type-led layouts** (`headline`, `baseline`, `center` on `haze`) are where `brutal`, `retro`,
  `editorial` and `luxe` show best.

## Varying a poster

Cheapest to most involved:

1. **Palette** — another named palette, or brand colours as `{"bg": "...", "ink": "...", "accent": "...", "colors": [...]}`.
2. **Type theme** — `"type": "…"`; the single biggest change of voice.
3. **Layout** — one from another family: `left` ↔ `right`, `top`, `band`, `strip`, `corners`, `headline`, `baseline`, `axis`, `vertical`; or its `-mirror`.
4. **Seed** — a different arrangement with the same recipe.
5. **Params** — the tables above.
6. **Type details** — `typeScale`, `"framed": true`, or CSS variables through `vars`:
   `--title-size` (in % of the short side), `--title-weight`, `--title-tracking`, `--title-leading`
   (each also with a `-ko` twin for Hangul), `--subtitle-size`, `--body-size`, `--body-measure`
   (line length in em), `--eyebrow-size`, `--eyebrow-clear-min` (the least clear space between the
   eyebrow and the headline's letters, in % of the short side; 4 unless set), `--meta-size`, `--cta-size`, `--footer-size`, `--margin`,
   `--scrim` (0–1), `--grain` (0–1), `--qr-size`, and the case switches `--title-case`,
   `--eyebrow-case`, `--footer-case` (`none` | `uppercase`). Out of the box every theme
   upper-cases the eyebrow, four also upper-case the title, and everything else is set as typed.
7. **Scene** — a custom scene file (`"scene": "./x.py"`), see `custom-scenes.md`.
8. **A theme or style of your own** — see `custom-scenes.md`.
