# Style recipes

Looks that Blender and three.js can produce procedurally, with enough of a recipe to build each as a
custom scene. Read this when no stock style fits the brief ("isometric room", "felt mascot",
"topographic map", "stained glass"…) and you are about to write a scene with
`custom-scenes.md`. The stock styles are finished versions of several of these; the rest are
starting points.

Numbers are starting values gathered from Blender and three.js documentation and published
breakdowns (see Sources). Nothing here is tuned for your scene — render a poster, look, adjust.

## Contents
- [Choosing the engine](#choosing-the-engine)
- [What makes a render look finished](#what-makes-a-render-look-finished)
- [Blender recipes](#blender-recipes)
- [three.js recipes](#threejs-recipes)
- [Full-picture scenes](#full-picture-scenes)
- [Finishing pass](#finishing-pass)
- [Do not build these](#do-not-build-these)
- [Sources](#sources)

## Choosing the engine

| Wanted | Engine | Why |
|---|---|---|
| Real materials: glass, metal, wax, fabric, soft shadows, depth of field | Blender | path tracing gets them for free |
| A flat, graphic or printed look; patterns; particles; lines | three.js | a fragment shader or instancing does it in seconds |
| A whole landscape or sky as one illustration | either | three.js paints it in 2D layers; Blender builds and lights it |
| Fast iteration, many variants, no Blender on the machine | three.js | 2–15 s per poster |

Cost guide for Cycles on a CPU, relative to a matte scene with one sun: toon, low-poly, isometric,
origami, marble ≈ 1×; subsurface (jelly, wax) 1.3–2×; hair fibres 1.5–3×; rough transmission
(frosted glass) 1.5–2.5×; clear refractive gems 2×+; real volumetric fog 2–4× — avoid, fake it with
a mist pass or gradient planes.

## What makes a render look finished

The difference between a poster and a demo is rarely the technique:

- **One idea per image**, one focal point, and one cue for scale (a bird, a lit window, a tiny prop).
- **A limited palette with assigned values** — decide which colour is the 60%, the 30% and the 10%
  before building; mix colours in linear space; never use pure black for shadows.
- **Hierarchy of sizes** — big, medium and small forms; evenly sized or evenly spaced elements read
  as a test pattern.
- **Controlled imperfection** — ±5% colour jitter, slight rotation, 2–3% grain; nothing perfectly
  uniform.
- **Light with a direction** — a key from one side and a visible shadow or rim; front-lit scenes go
  flat. Translucent and fuzzy materials need back light.
- **Room for the words** — detail fades inside `ctx.quiet`; the horizon sits in the lower third
  when the sky carries the copy.

## Blender recipes

Shared settings: keep the view transform `Standard` for flat, toon and graphic looks so palette
colours survive (`ctx.set_view('Standard')`), `AgX` for glass, metal and strong lights. Prefer real
bevels on geometry (`add_box(bevel=…)`) over shader tricks. Leave caustics off.

| Look | Build | Starting values | What goes wrong |
|---|---|---|---|
| **Isometric miniature** (room, shop, town block on a slab) | bevelled boxes, cylinders, lathes on a rounded slab; orthographic-looking view from a three-quarter angle (`ctx.frame(…, fov=8–12, direction=(1, -1, 1))`); one sun, soft world fill | 5–9 hero props + 10–20 small ones; roughness 0.6; sun 45° up, angle 5–10°; world 0.3–0.5; colours 60/30/10 | mixed bevel radii; more than five hues; props that float without a contact shadow |
| **Low-poly** (mountains, islands, animals) | icosphere or grid, jitter vertices, shade flat, colour faces by height or slope | facet sizes in three tiers; ±5% colour per face; hard sun | uniform triangles; accidental smooth shading |
| **Toon with ink outline** | two or three flat tone bands + a slightly larger back-facing shell in the line colour (solidify with flipped normals) | one sun with angle < 1°; flat world; coloured rather than black lines; line ≥ 3 px at 4K | soft shadows blur the bands; hairlines get eaten by the denoiser |
| **Fuzzy felt / wool** | rounded shapes, `material(roughness=0.95, sheen=0.9)` + fine noise bump; short fibres on the hero only | fibre length 1.5–3% of the object, half randomised; big soft key + strong rim from behind | no fibres on the silhouette reads as velvet; dark colours hide the sheen |
| **Knit / woven** | shader only: banded wave pattern offset per row, into bump | stitches small enough to follow the form; slight colour jitter | stitches too large and too regular |
| **Jelly, gummy, wax** | `material(subsurface=1, subsurface_radius=…)`, optionally mixed with a little transmission | saturated colours; light from behind or the side so thin parts glow | front-lit it is just plastic |
| **Frosted glass panels** | thin bevelled slabs, `material(transmission=1, roughness=0.15–0.3)`, saturated shapes or emitters behind | at most two panels deep; crisp bright rim | grey glass over a grey wall shows nothing |
| **Holographic foil** | `material(thin_film=400–800)` with the thickness varied by noise; crumpled normals | high-contrast surroundings to reflect | uniform thickness gives one flat tint |
| **Marble and gold** | veins from a noise-distorted wave through a ramp; `material(metallic=1)` accents | veins sparse and directional; gold under 10% of the area; light cards to reflect | tiled veins; gold reflecting an empty world |
| **Ceramic glaze, terrazzo** | lathe vessels with `material(coat=1, coat_roughness=0.05)`; chips from a cellular pattern at two or three scales | palette-coloured chips; matte body under a glossy coat | single-scale dots |
| **Brushed or anodised metal** | `material(metallic=1, roughness=0.35)` + strongly stretched noise bump, strip softboxes | saturated anodised colour; chamfered edges | even grey gloss |
| **Neon sign** | bevelled curves with emission on a wall, plus hidden area lights of the same colour for the spill | white-hot core, coloured spill with fall-off, mounts and cable | flat coloured lines with no light on the wall |
| **Voxel / brick** | cube instances from an occupancy test; tiny bevel and gap | quantised palette; 16–32 units across the hero | unbevelled stair-steps |
| **Crystal, gem** | flat-shaded scaled icospheres, `material(transmission=1, ior=1.5–2.4)`, one strong back light | coloured glass; one hero cluster on dark | clear glass on white; slow — near the time budget |
| **Origami** | low-poly creased mesh, flat shading, `roughness=0.85`, paper-grain bump, two-sided colour | one soft top light, clean facet values | glossy paper |
| **Planet** | noise bands or continents through a ramp, slightly larger rim shell, ring disc | crescent lighting; small–large scale contrast | a front-lit ball |
| **Stylised plants** | lathe or bent-plane petals placed by the golden angle; instanced fields | size and tilt randomness; light through petals; depth of field | identical clones |
| **Painterly** | toon-like values first, then a Kuwahara-style smoothing in post | simple shapes, limited palette | filtering a noisy photoreal render turns to mush |

## three.js recipes

Add-ons such as `GPUComputationRenderer`, `Sky`, `Water` or `OutlinePass` are not in the bundle;
write the effect as a `ShaderMaterial`, a full-screen quad (`backgroundQuad`) or CPU code.

| Look | Build | Starting values | What goes wrong |
|---|---|---|---|
| **Layered silhouettes** (ridges, forest, skyline) | 4–8 layers back to front, each a noise curve; colour mixes from the darkest palette colour toward the haze colour with depth; lighten each layer toward its base | ridged noise `n = offset - abs(n); n *= n`; 4–5 octaves near, 2 far; geometric spacing | evenly spaced bands; pure black; no scale cue |
| **Windows at night** | building height from a hash of the column; windows from a tile grid lit where a per-tile random passes a threshold | lit share ≈ 18%; switch whole floors, vary by building; far layers lighter and bluer; restrained bloom | windows under 4 px alias; purely random lights look like noise |
| **Fluid marbling** | domain warping `f(p) = fbm(p + fbm(p + fbm(p)))`, colour from the intermediate warps, comb lines from `fract(f*8)` | one colour above 60% of the area; relax the warp toward the copy side | more than three hues turn to mud; banding without dither |
| **Reaction–diffusion** (coral, fingerprint) | Gray–Scott on a CPU grid, then shade as a relief with a crisp iso-edge | DA 1.0, DB 0.5, feed 0.055, kill 0.062; 3–8k steps; vary kill across the frame so the pattern dies out toward the copy | uniform wallpaper coverage; blurry upscaling |
| **Dither / pixel retro** | render a simple lit scene, then one pass: snap to cells, add a Bayer threshold, pick a palette colour by luminance | cell 6–12 px and a divisor of the frame width; 2–4 colours; no bloom or anti-aliasing after | grey noise behind small text — flatten the copy area to one colour |
| **Watercolour** | on a 2D canvas: a polygon deformed several times, then 30–100 translucent layers each deformed again; shown as a full-screen texture with paper grain | ≈ 4% opacity per layer; leave 40% bare paper; a few ink lines on top | one deformation variance everywhere; too many layers go dark |
| **Topographic contours** | isolines of a noise height field with even pixel width (divide the field by the length of its screen-space gradient) | line ≈ 1.5 px; every fifth line heavier; one filled band | fuzzy, variable-width lines |
| **Stained glass / mosaic** | cellular (Voronoi) cells, border from the second-nearest distance | cell size graded across the frame; ±10% luminance per cell; larger, paler cells under the copy | uniform cells |
| **Truchet / op-art** | tile the plane, rotate a motif per cell | one distortion focus; two colours | aliasing shimmer; moiré against print screens |
| **Flow-field ink lines** | step curves through a noise angle field; stop a curve when it comes too close to another | step 0.1–0.5% of the width; varied lengths | the default "Perlin hair" look — vary density |
| **Attractor / fat lines** | integrate a strange attractor (Lorenz a=10, b=28, c=8/3), draw with wide lines, alpha fading along each trail | colour by height; light bloom | single-weight spaghetti |
| **Point-cloud form** | sample points on a surface by area, size by depth, fade with distance | density follows curvature or light | an even spray |
| **Instanced relief field** | thousands of rounded boxes or pins, height and colour from noise or an image | strong side light; one accent colour | a flat top-down view |
| **Synthwave grid** | displaced wireframe plane with dark fog and a calm gap for the copy | few segments (≈ 24×24); slight colour fringing | over-bloomed lines |
| **Aurora curtains** | additive vertical noise ribbons with an exponential fall-off upward, hash stars, a ground silhouette | two hues | a green smear |
| **Galaxy / bokeh** | additive points with vertex colours; a few large soft discs and many small ones | colour gradient from core to rim | uniform sprinkle |

## Full-picture scenes

A full-picture style (`"kind": "picture"`) fills the poster with one illustration; see
`custom-scenes.md` → "Two kinds of scene". Proven subjects:

| Scene | Blender | three.js | Where the copy goes |
|---|---|---|---|
| Mountain ridges in haze | displaced strips at growing distance + mist | layered ridged-noise silhouettes | sky above the highest ridge (keep it under 45%) |
| Sea and horizon | ocean surface under a low sun | horizon split, stretched noise, a glitter column under the sun | upper sky |
| Dunes in low light | grid displaced by triangle + saw waves bent by noise; sun 5–12° up | dune curves with a lit and a shadow side | sky, or the shadow side of the nearest dune |
| Still lake | mirror plane with faint ripples | mirror the scene about the waterline, jitter and darken it | water or sky |
| Cloudscape | clustered displaced spheres, limited palette | warped 2D noise | a clear gap of sky |
| City at night | boxes with tile-grid emission + mist | the windows recipe above | sky |
| Room with window light | box room, window cut-out, sun patches on wall and floor | wall gradient with projected pane shapes | the bare wall |
| Field of flowers or trees | instanced stems, depth of field, mist | layered trunk silhouettes | sky or blurred foreground |
| Snowfield with aurora | emission curtains over pale ground | additive ribbons, stars, blue-shadowed snow | dark sky or the snow |
| Deep space | planet + emission world | warped-noise nebula, stars, rim-lit sphere | black space |
| Isometric town | the miniature recipe, scaled up | instanced boxes under an orthographic camera | backdrop beside the slab |

Keeping text-safe areas: horizon in the lower third; haze flattening the middle distance; a soft or
dark foreground; detail amplitude multiplied by the quiet mask (`ctx.quiet`, `GLSL_QUIET`).

## Finishing pass

Applied last, lightly: ±1/255 dither on every gradient (banding shows at 4K), 2–3% grain, a gentle
vignette. In three.js run bloom before the output pass and keep it restrained (strength 0.4–0.8,
threshold 0.7–0.85). In Blender prefer adaptive sampling and the denoiser to more samples.

## Do not build these

Sunburst backdrops, god rays fanning out from a sun, and mandalas with alternating wedges all draw
the sun-ray burst this skill leaves out (`custom-scenes.md` → "Motifs that are not allowed").
Light through a window is fine as parallel patches on a wall or floor.

## Sources

Blender manual — Principled BSDF, Toon BSDF, Sky Texture, Glare node, light paths, sampling, Ocean,
Remesh, Solidify and Wireframe modifiers; Blender 4.0–5.0 release notes. three.js documentation —
`MeshPhysicalMaterial`, `MeshToonMaterial`, `UnrealBloomPass`, `OutputPass`, `Line2`,
`MarchingCubes`. The Book of Shaders (chapters 9, 12, 13). Maxime Heckel's write-ups on dithering,
halftone, refraction, caustics, Moebius-style post-processing, painterly filters and volumetric
clouds. Karl Sims, "Reaction-Diffusion Tutorial". Tyler Hobbs on flow fields and simulated
watercolour. Paul Bourke on attractors. 80.lv breakdowns (night city, anime clouds, felt tool).
Trend surveys: Garagefarm 2026, Adobe Express 2026, Creative Boom, Canva design-trend reports as
relayed by Design Compass and DI Today, 월간 디자인.
