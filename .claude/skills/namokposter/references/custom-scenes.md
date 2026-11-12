# Custom scenes and styles

When the stock scenes don't show what the poster is about — a coffee cup, a rocket, the client's
logo shape, a city skyline — write a scene. A scene is one small file with a `build(ctx)` function.
The runner handles everything around it: render settings, camera maths, placing the subject where
the layout wants it, palette, seeding, caching, export.

## Contents
- [Two ways to plug a scene in](#two-ways-to-plug-a-scene-in)
- [The one rule: build around the origin, then call frame()](#the-one-rule)
- [Two kinds of scene: object and full picture](#two-kinds-of-scene-object-and-full-picture)
- [Blender scenes (`scene.py`)](#blender-scenes-scenepy)
- [three.js scenes (`scene.js`)](#threejs-scenes-scenejs)
- [A type theme](#a-type-theme)
- [A whole new style](#a-whole-new-style)
- [Drawing a motif from nothing](#drawing-a-motif-from-nothing)
- [Motifs that are not allowed](#motifs-that-are-not-allowed)
- [Look-dev loop](#look-dev-loop)
- [Composition and lighting advice](#composition-and-lighting-advice)

For what to build — some forty looks with recipes and pitfalls — see `style-recipes.md`. Art that
is typographic or flat graphics, or that should be made from the copy (the date, the venue), is
better written as an HTML scene: `html-scenes.md`.

## Two ways to plug a scene in

**Per poster** — keep an existing style's typography and palettes, swap the 3D:

```json
{ "style": "studio", "scene": "./coffee.py", "palette": "sand" }
```

The extension picks the engine (`.py` → Blender, `.js`/`.mjs` → three.js). Start by copying the
scene of the nearest style (`assets/styles/<id>/scene.py|js`) into the project and editing it. The
poster still chooses its own `type`, `palette` and `layout`, so one scene can give three different
posters.

**As a style** — to give the scene its own palettes, parameters and defaults, see
[A whole new style](#a-whole-new-style).

## The one rule

Build the subject **around the world origin**, roughly inside a sphere of some radius `R`, then call
`ctx.frame(radius=R, ...)` once. The runner aims the camera so that sphere fills the art area of the
current layout and shifts the lens so the origin lands on the layout's focus point. That is what
lets one scene serve landscape, portrait, square, `left`, `right` and `center` without any
conditionals. Don't position the camera by hand, and don't move the subject off-centre to "make
room for text" — the layout already does that.

Things that should fill the frame regardless (walls, floors, skies, particle fields) can be as big
as you like; only the *subject* needs to respect `R`.

**Subjects that are not round** — a tall stack of books, a wide skyline — should pass their
on-screen size instead: `ctx.frame(width=1.4, height=2.6, ...)` (three.js: `ctx.frame({ width, height })`).
The subject is then fitted into the art rectangle of the current layout, so it is as large as the
space allows instead of being shrunk to a bounding circle. Objects may be added after `frame()`
too (snow, dust, anything placed relative to the camera).

Use `ctx.rng` for every random choice so a given `seed` always reproduces the same image, and take
colours from the palette (`ctx.palette`, `ctx.colors`) so palette overrides and brand colours work.

**Cut-outs.** A poster with a `ground` renders its subject on a transparent film and lays it over
a field drawn by another engine (`spec.md` → Grounds). A Blender scene needs nothing special for
this: `ctx.cutout` is true, and at the end the set — walls, floors, sweeps, recognised by being
many times larger than the subject — is turned into a shadow catcher, so only the subject and the
shadow it casts remain. Tag an object yourself when the guess would be wrong:
`ob['poster_ground'] = True` (part of the set) or `False` (part of the subject). A style says it has
been checked this way with `"cutout": true` in `style.json`, and lists the grounds it was looked
at with in `"grounds": ["pattern/checker", "haze"]`; a style that can be a ground says
`"ground": true`. Scenes that rely on the wall itself — light pooling on it, glow, a horizon —
do not survive the cut and should not claim it.

## Two kinds of scene: object and full picture

**Object scenes** show a subject in front of a plain backdrop (`studio`, `prism`, `ribbon`…). The
copy sits on the empty backdrop, so legibility is easy and any layout works.

**Full-picture scenes** paint the whole poster as one illustration — sky, ground, water, depth,
light, atmosphere — as if a single image had been made for it (`layers`, `softscape`, `linocut`, `sumuk`…).
Use this kind when the brief is about a place, a season, a mood or a story rather than a thing:
festivals, travel, concerts, book and film posters, seasonal campaigns. Mark the style with
`"kind": "picture"` in `style.json`.

A full picture has to be composed around the copy, the way an illustrator leaves room for a title:

- **Paint every part of the frame.** The image should still look complete with the copy removed —
  no blank box, no object floating on nothing.
- **Put calm where the type goes.** `ctx.quiet` lists the rectangles that will carry type. Arrange
  the world so they fall on open sky, still water, mist, a plain wall or soft out-of-focus
  foreground: lower the horizon, let haze thicken on that side, drift the clouds to the other side,
  move the lit window. Fading detail out inside the rectangles is a last resort, and should be soft
  enough to pass as atmosphere.
- **`palette.bg` is the colour behind the copy.** Keep the quiet areas close to `bg` (grade the sky
  from `bg` at the copy towards the other colours at the horizon) so text in `ink` reads. The
  renderer measures real contrast and reports `low-contrast`; a finished scene has none in its
  default layouts. `colors` are the picture's other hues, `accent` its highlight (sun, lit windows).
- **The hero sits at the focus.** Sun, moon, peak, island, lit window, planet: build it at the
  origin and call `ctx.frame(...)`; let everything else run past the frame edges so the picture
  fills 16:9, 4:5, 1:1 and 9:16 alike.
- **Depth makes it a picture.** Three planes at least — far, middle, near — with atmospheric
  perspective (far layers lighter, lower in contrast and closer to the sky colour), one clear light
  direction, and a foreground that frames rather than competes.
- **Default layouts** are usually `top` (copy over the sky) or `bottom` (copy over a dark
  foreground) rather than `left`; say so in `style.json`. Type on a picture gets a soft halo of the
  background colour by default (`--halo`, 0–1) and can add a gradient scrim (`--scrim`).

In three.js a picture is often a fragment shader on `backgroundQuad` (layered silhouettes, noise
clouds, a simple water model) with geometry only for the hero. In Blender it is a small world: a
displaced terrain grid, a water plane, a graded sky from `set_world(color, strength, top=…)` or an
emissive card, one sun. Avoid volumetrics; fake distance with colour.

## Blender scenes (`scene.py`)

```python
import math
import common as C          # scripts/blender/common.py — already on sys.path


def build(ctx):
    pal = ctx.palette                      # {'bg', 'ink', 'accent', 'colors': [...]} hex strings
    flip = -1.0 if ctx.mirror else 1.0     # subject is left of the copy → mirror lights/asymmetry

    # set + light
    wall = C.add_plane(240, C.material('Wall', pal['bg'], roughness=0.9))
    wall.rotation_euler = (math.radians(90), 0, 0)
    wall.location = (0, 1.5, 0)
    C.set_world('#ffffff', 0.45)
    C.add_area_light((-7.8 * flip, -9.6, 8.2), energy=2300, size=8, target=(0, 1, 0))

    # subject, around the origin (X right, Y away from camera, Z up)
    cup = C.add_lathe([(0, -0.6), (0.42, -0.6), (0.55, 0.5), (0.5, 0.5), (0.38, -0.5), (0, -0.5)],
                      C.material('Cup', ctx.color(0), roughness=0.25, coat=1.0))
    C.add_torus(0.26, 0.06, C.material('Handle', ctx.color(0), roughness=0.25),
                location=(0.62 * flip, 0, 0.05), rotation=(math.radians(90), 0, 0))
    C.add_cylinder(0.75, 0.06, 0.02, C.material('Saucer', ctx.color(3), roughness=0.3), location=(0, 0, -0.66))

    ctx.frame(radius=1.0, fov=22, direction=(0.25 * flip, -1.0, 0.35))
```

### `ctx`

| Member | Meaning |
|---|---|
| `ctx.palette`, `ctx.colors`, `ctx.color(i)`, `ctx.bg`, `ctx.dark` | palette (hex); `color(i)` wraps around; `dark` is true for dark backgrounds |
| `ctx.rng` | `random.Random` seeded from the spec |
| `ctx.params` | the poster's `params` dict |
| `ctx.width`, `ctx.height`, `ctx.aspect`, `ctx.orient` | output frame |
| `ctx.focus`, `ctx.art_size`, `ctx.art_rect`, `ctx.layout`, `ctx.mirror` | where the subject goes: centre, diameter (fraction of the short side), reserved rectangle `[x0,y0,x1,y1]` (fractions, y down); `mirror` is true when the subject sits left of the copy |
| `ctx.text_rect`, `ctx.quiet` | nominal zones that carry type. Blender scenes get the layout's zones, not the measured copy box, so a cached render survives copy edits — keep the backdrop plain there rather than relying on exact edges |
| `ctx.scene`, `ctx.camera` | the Blender scene and camera, for anything not wrapped below |
| `ctx.frame(radius, fov=24, direction=(0,-1,0.12), size=None, fstop=None, width=None, height=None)` | aim and place the camera; `direction` points from the origin towards the camera; `fstop` turns on depth of field; `width`/`height` fit a non-round subject to the art rectangle |
| `ctx.set_view(transform, look=None, exposure=0)` | `'Standard'` keeps palette colours literal (default); `'AgX'` (falls back to Filmic) rolls off highlights — use for glass, metal, emitters |

### `common` helpers

All return the created object and accept `location=`, `rotation=` (radians), `scale=`.

| Function | Notes |
|---|---|
| `material(name, color, roughness=0.45, metallic=0, **kw)` | Principled. `kw`: `transmission`, `ior`, `coat`, `coat_roughness`, `sheen`, `subsurface`, `emission`, `emission_strength`, `thin_film` (nm), `specular`, `alpha`. Socket names are mapped across Blender 3.6–5.x for you. |
| `emission_material(name, color, strength, gradient=(hexA, hexB))` | emitter; optional two-colour gradient |
| `add_sphere(radius)`, `add_icosphere(radius, subdivisions)` | |
| `add_box(size, bevel)` | rounded box; `size` scalar or `(x, y, z)` |
| `add_torus(major, minor)` | lies in the XY plane |
| `add_cylinder(radius, height, bevel)`, `add_cone(radius, height, bevel)`, `add_capsule(radius, height)`, `add_hemisphere(radius)` | axis = Z |
| `add_lathe(profile)` | solid of revolution from `[(radius, z), ...]` bottom to top — vases, cups, bottles, chess pieces, rockets |
| `add_extrusion(outline, depth, bevel)` | extrude a 2D outline `[(x, z), ...]` along Y — letters, logos, icons, skylines |
| `add_arch(width, height, thickness, depth)` | doorway arch standing on z = 0 |
| `add_plane(size)`, `add_backdrop(material, floor_z, wall_y, radius)` | wall/floor; seamless studio sweep |
| `displace_blob(ob, strength, scale, seed)`, `subsurf(ob, levels)`, `weighted_normals(ob)` | organic wobble; smoothing |
| `add_area_light(location, energy, size, color, target)`, `add_sun(direction, strength, angle, color)`, `add_point_light(location, energy, color)`, `add_spot_light(location, energy, color, target, angle, blend)` | lamps; a spot lights the subject while leaving the backdrop dark (night scenes) |
| `add_softbox(location, size, color, strength, gradient=...)` | emissive card, invisible to the camera — gives glossy/glass surfaces shaped reflections |
| `set_world(color, strength, top=None)` | ambient light; optional vertical gradient |
| `group(objects, name, location, rotation, scale)` | parent objects to an empty and move them as one |
| `finish_mesh(name, bm, smooth, material_)`, `fillet_profile(points, radius)` | turn your own bmesh into an object; round a lathe profile's corners |
| `col(hex)`, `mix_hex(a, b, t)`, `luminance(hex)`, `look_at(ob, target)` | utilities |

Anything else is plain `bpy`/`bmesh` — import them and go (modifiers, curves, geometry nodes,
procedural textures on a material's node tree, imported `.glb`/`.obj` models via
`bpy.ops.wm.*_import`). Wrap version-specific calls in `try/except` so the scene survives a Blender
upgrade.

3D lettering: Blender text objects need a `.ttf`/`.otf` file (`bpy.data.fonts.load(path)`). The
bundled fonts are web fonts (woff2) and cannot be used for this, so Korean 3D text needs a font
file from the user or the system; otherwise keep words in the typography layer and suggest
lettering with shapes (bars, dots) on 3D objects.

### Exposure and backdrop colour

With the default `'Standard'` view, a matte surface lit by `set_world('#ffffff', 1.0)` alone renders
at exactly its base colour; lamps add on top. So keep world strength around 0.4–0.5 and add a key
light that brings the backdrop back up to its colour.

- **A wall behind floating objects** (the `studio` recipe): world 0.46 + an 8 m area light of
  2300 W about 15 m away. The same numbers work for light and dark walls — do not boost the light
  for a dark palette, the objects are lit by it either way.
- **A floor that sweeps up into a wall** (`add_backdrop`): the floor faces the light more squarely
  and clips sooner; start lower (world ≈ 0.4, key ≈ 1400 W) or use a sun as `monolith` does.
- **Night scenes**: light the subject with `add_spot_light` and keep the world dim, so the backdrop
  stays at the palette colour.

You do not have to land on the hex exactly: for a style or poster with `"matchBackground": true` the
compositor measures the rendered backdrop behind the copy and applies a small exposure /
white-balance correction (up to about ±40%) so the page reads as the palette `bg`. It only works
when the backdrop there is plain, and it cannot rescue a blown-out or murky render — check a poster
render before the full-quality one. Set `"matchBackground": true` on posters that use a custom Blender scene
with a plain wall or floor.

## three.js scenes (`scene.js`)

```js
import { makeNoise, paletteEnvironment, backgroundQuad } from '/skill/assets/web/scene-lib.js';

export default function build(ctx) {
  const { THREE, scene, renderer, rng, palette } = ctx;
  scene.environment = paletteEnvironment(renderer, palette.colors, { rng });   // reflections in palette colours
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const knot = new THREE.Mesh(
    new THREE.TorusKnotGeometry(0.7, 0.24, 400, 64, 2, 3),
    new THREE.MeshPhysicalMaterial({ color: palette.colors[0], roughness: 0.15, metalness: 0.9, clearcoat: 1 }));
  knot.rotation.set(rng.range(0, 3), rng.range(0, 3), 0);
  scene.add(knot);
  scene.add(new THREE.DirectionalLight('#ffffff', 2).translateX(-3).translateY(4).translateZ(5));

  ctx.frame({ radius: 1.3, fov: 28, dir: [0, 0.1, 1] });
  // Optional: return { render() { ... } } to draw with an EffectComposer instead of renderer.render().
}
```

`THREE` is the full three.js namespace (r187) plus bundled add-ons: `EffectComposer`, `RenderPass`,
`ShaderPass`, `UnrealBloomPass`, `OutputPass`, `BokehPass`, `RoomEnvironment`, `RoundedBoxGeometry`,
`ParametricGeometry`, `ConvexGeometry`, `TextGeometry`, `FontLoader`, `GLTFLoader`,
`SVGLoader`, `BufferGeometryUtils`, `ImprovedNoise`, `SimplexNoise`, `MarchingCubes`, `Line2`,
`LineSegments2`, `LineMaterial`, `LineGeometry`, `LineSegmentsGeometry`. There is no network access
to CDNs from the render page, so use these rather than importing by URL. Local files (a `.glb`
model, a texture) load from `http://poster.local/file/<encodeURIComponent(absolute path)>`.

| `ctx` member | Meaning |
|---|---|
| `THREE`, `renderer`, `scene`, `camera`, `canvas` | set up for the output size, sRGB output |
| `width`, `height`, `aspect`, `orient` | output frame |
| `unit` | pixels per 1% of the short side — multiply point sizes and line widths by it so the image looks the same at any resolution |
| `palette`, `params`, `seed`, `rng` | `rng()` → 0..1, plus `rng.range(a,b)`, `rng.int(a,b)`, `rng.pick(arr)`, `rng.gauss()`, `rng.shuffle(arr)` |
| `focus` `{x, y}`, `artSize`, `artRect` `[x0,y0,x1,y1]` | where the subject goes (fractions; y down) |
| `quiet` | rectangles that carry type — the measured copy block first, then details block, footer, header. Keep them calm |
| `textRect` | the measured copy block (same as `quiet[0]`) |
| `frame({ radius, fov, dir, size, width, height })` | aim and place the camera (y up; `dir` from origin towards camera); returns the camera distance; `width`/`height` fit a non-round subject to `artRect` |

`scene-lib.js` exports: `makeRng`, `makeNoise(seed)` → `{ noise3, fbm, curl }`, `ramp(colors, t)`,
`paletteTexture(colors)`, `paletteEnvironment(renderer, colors, opts)`, `backgroundQuad(fragment, uniforms)`
(a full-frame shader behind everything; end the shader with `#include <colorspace_fragment>`),
`GLSL_NOISE` (`gnoise`, `fbm` for shaders), and the quiet-zone helpers `quietUniforms(ctx)`,
`GLSL_QUIET` (`quietMask(uv, edge)` → 1 inside a quiet rectangle) and `quietPassShader(ctx, strength)`
(a post-processing pass that pulls quiet rectangles back to the background colour).

For finished looks it also has (each is documented where it is defined in `assets/web/scene-lib.js`):

| Helper | Use |
|---|---|
| `makeComposer(ctx, { bloom, linear, display })` | a post-processing chain with the output pass in the right place; `linear` passes run before it, `display` passes after |
| `finishPassShader(ctx, { vignette, contrast, saturation, dither })` | the finishing pass: gentle vignette, grade and ±1/255 dither against banding |
| `ditherPassShader(ctx, { colors, cell, bayer })`, `pixelCell(width, target)`, `GLSL_DITHER` | chunky-pixel ordered dithering onto a palette ramp; flattens the copy area |
| `GLSL_NOISE_KIT` | shader noise: value/gradient noise, fbm, ridged fbm, domain warp, cellular |
| `canvasTexture(w, h, draw)`, `deformPolygon(points, rng)` | draw with the 2D canvas API (watercolour washes, ink lines) and show it as a texture |
| `floatTexture(data, w, h)`, `GLSL_BICUBIC` | upload a CPU simulation (reaction–diffusion, height fields) and sample it smoothly |
| `sortByLuminance(colors)`, `hexLuminance`, `srgbVec`, `oklabVec`, `GLSL_OKLAB` | palette ramps and colour mixing that stays clean |
| `hdrClipPassShader` | tame over-bright pixels before bloom |

The stock scenes are worked examples: `layers` (layered silhouettes: mountains, sea, city),
`marble` (domain warping), `turing` and `inkdrop` (CPU simulation → texture), `watercolor`, `crayon`
and `linocut` (canvas painting), `pixel` (dither pass), `airbrush` (lit sphere over a shader sky),
`bojagi`, `mosaic` and `stainedglass` (cell patterns), `blueprint` and `plexus` (line work).

Full-bleed scenes should keep the copy readable: fade or thin out whatever falls inside the `quiet`
rectangles (see `wave/scene.js` and `aurora/scene.js`), or keep bright elements near `focus` and dim
the footer strip in post (see `flux/scene.js`).

**A scene should work in any layout.** The copy may be on either side, above, below, split between
two corners — so do not assume "copy left, picture right". Read the
layout from what you are given: `quiet` holds up to four rectangles that carry type (one or two
blocks of copy, then the footer and header strips), `artRect` is the free
rectangle and `focus` / `artSize` the largest clear spot in it. A subject on a plain ground goes at
`focus` with diameter `artSize` and nothing of it (satellites, shadows, glow) should reach far
outside that circle; a picture fills the sheet and keeps its main motif near `focus`. Then list the
layouts you have looked at in `style.json`:

```json
"layouts": {
  "landscape": { "layout": "left", "also": ["right", "top", "band", "baseline"] },
  "portrait":  { "layout": "top",  "also": ["bottom", "axis", "side"] }
}
```

`layout` is the default; automatic posters pick among `layout` and `also` (and their mirror images)
to give each poster of a set a different structure.

Rendering is a single still: there is no animation loop, so "advance" simulations in a `for` loop
before returning. Additive blending adds up fast — if the image comes out white, cut brightness by
10× rather than 10%.

## A type theme

A type theme is one CSS file scoped to `.poster[data-type="<id>"]`; `"type": "./mytheme.css"` loads
it (the id is the file name). Copy the nearest file from `assets/themes/` and change it. A theme
mostly sets variables — sizes are in % of the poster's short side:

```css
.poster[data-type="mytheme"] {
  --font-title: "Bricolage Grotesque", "Pretendard", sans-serif;   /* Latin face first, Korean after */
  --font-title-ko: "Bricolage Grotesque KR", "Pretendard", sans-serif;   /* size-compensated Latin for mixed headlines */
  --title-size: 11; --title-weight: 800; --title-leading: 1.0; --title-tracking: -0.03em; --title-case: none;
  --title-leading-ko: 1.16; --title-tracking-ko: -0.03em; --title-wordspace-ko: 0.04em; --title-weight-ko: 800;
  --eyebrow-size: 1.5; --eyebrow-tracking: 0.14em; --eyebrow-tracking-ko: 0.05em;
  --subtitle-size: 2.9; --body-size: 1.82; --footer-size: 1.5; --footer-rule: 1; --grain: 0.15;
}
.poster[data-type="mytheme"] .title em { color: var(--c-accent); }
```

Every text style has a Latin value and a `-ko` value (leading, tracking, weight, word space); the
compositor tags each element with its script and applies the right one. Keep the Korean values in
the ranges given in `design-principles.md`. Other hooks: `--font-eyebrow`, `--font-footer`,
`--font-label-ko` (Hangul face for labels when the label face is mono or caps-only), `--gap-*`,
`--eyebrow-clear`, `--eyebrow-clear-min` and `--eyebrow-clear-max` (the clear space between the
eyebrow and the top of the headline's letters: 0.42 of the height of those letters, kept between 4%
and 5.2% of the short side; a theme's `--gap-eyebrow` only shows where it comes out wider),
`--margin`, `--scrim`, `--title-fit-min/max` (how far the headline may shrink or grow: 0.4 and 1.16
times `--title-size` unless the theme says otherwise). A theme's sizes are its own figures; on the
sheet the sub-headline, information, eyebrow, paragraph and footer are multiplied by the step factors
in `poster.css` (`--k-subtitle`, `--k-meta`, `--k-eyebrow`, `--k-body`, `--k-footer`), which keep
every theme's scale in the same balance — set sizes relative to the stock themes and leave the
factors alone. Also
`data-tone="dark|light"` on `.poster` for tone-specific rules, `--c-paper` for "the surface this sits on",
and `--em-1` … `--em-5` — the palette's hues adjusted to stand off the page, for coloured or gradient-filled
lettering (the raw `--c-1` … `--c-5` may be as dark as the ground). Read `assets/web/poster.css` for the element
structure. Sizes must be multiples of `var(--u)` or `em`, never raw `px`, or they will not scale
across formats.

## A whole new style

A style is a folder with a scene and its palettes:

```
my-styles/
  origami/
    style.json     engine, palettes, params, defaults
    scene.js       or scene.py
    style.css      optional: decoration that belongs to this scene only
```

```json
{ "styleDirs": ["./my-styles"], "drafts": [ { "style": "origami" } ] }
```

`style.json`:

```json
{
  "id": "origami", "label": "Origami", "engine": "three",
  "mood": "one line used in listings: the look, and what it suits",
  "tone": "light",
  "type": "swiss", "types": ["editorial", "bold"],
  "defaultPalette": "main",
  "palettes": { "main": { "bg": "#f4f1ea", "ink": "#111111", "accent": "#ff3b00", "colors": ["#111111", "#ff3b00", "#ffd400"] } },
  "params": { "folds": { "default": 5, "note": "number of folds" } },
  "vars": { "--scrim": 0.4 },
  "layouts": { "landscape": { "layout": "left" }, "portrait": { "layout": "top" }, "square": { "layout": "top" } },
  "matchBackground": false,
  "fallback": "wave"
}
```

A style is an art technique, so give it **motifs** — the subjects it can show — and read
`ctx.params.motif` in the scene to choose the composition:

```json
"params": { "motif": { "default": "hills", "note": "hills | city | shapes" } },
"motifs": {
  "hills":  { "note": "rolling hills and a pale sun", "topics": ["travel", "nature"] },
  "city":   { "note": "rooftops and lit windows",     "topics": ["city", "nightlife"], "palette": "night", "type": "condensed" },
  "shapes": { "note": "abstract overlapping forms",   "topics": ["design", "tech"] }
},
"topics": ["craft", "culture"]
```

A motif entry may override the style's `palette` (default palette), `palettes` (the ones tuned for
it), `type`, `types`, `tone`, `layouts`, `vars` and `params` (its own parameters with defaults).
`"context": "korean"` marks a style rooted in one culture (나전, 조각보): the automatic choice offers it
only for Korean copy or a tradition topic. A poster can still ask for it by name.

A parameter may take its value from the poster itself: `"text": { "default": "A가&", "from": "title" }`
is filled with the first letters of the headline's words unless the poster sets it (the `glyph` style
draws its picture from them). The art layer never sees the rest of the copy.

`topics` — for the style and per motif — use the tags of `assets/topics.json` and feed the automatic
choice (`--suggest`, `"styles": "auto"`). A scene may be split over several files in its folder: a
three.js scene imports siblings with `import part from './part.js'`, a Blender scene loads them with
`importlib` from its own directory (see `layers/` and `softscape/`).

`type` is the default typography theme and `types` the others that suit it; `engine` may be
`"none"` for a typography-only style (flat `bg`, no art layer); `fallback` names the three.js style
to use when a Blender style can't run; `matchBackground` is for Blender scenes with a plain backdrop.

## Drawing a motif from nothing

When the motif is a thing no stock scene draws — a saxophone, a tiled roof, an aisle of server
racks — it is built in code from the thing's own structure. Each way below has carried a finished
poster.

- **Know the thing before drawing it.** List its parts and real proportions first: a trumpet is
  48 cm long with a 12.3 cm bell and three valves 2.6 cm apart; a grand piano is 1.48 × 2.2 m with
  the lid hinged on the bass side. Work in the thing's own units round its own origin and scale once
  at the end. Drawn from measurements it reads as the thing; drawn from a memory of its outline it
  reads as an icon.
- **Tubes: a centre line and a half-width.** Wind instruments, neon tubing, stems, cables, branches.
  Sample the centre line (straight runs and arcs), give each sample a half-width and push the outline
  out both ways along the normal; in 3D sweep a circle along it. In Blender a polyline with its
  corners rounded to arcs, given a bevel, makes every slide and crook of a brass instrument.
- **Turned parts: a profile, revolved.** Bells, mouthpieces, valve caps, mortars, lanterns, vases:
  a table of radius by height, revolved in 3D or mirrored in 2D. A bell flares as
  `r = r_end · (d0 / (d + d0)) ** 0.6`.
- **Outlines that carry the likeness: a dozen points, smoothed.** A piano's wing, a double bass, an
  animal's back: place twelve to fifteen points by hand, run a Catmull-Rom curve through them, then
  fill or extrude.
- **Repeating structures: one small function, called many times.** `house(halfWidth, roofKind)`,
  `rack(units)`, `bay()`, `lantern()`. Variation between the calls and overlap between the results
  are what make a village, an aisle or a factory out of them.
- **A true model, projected by hand, for line drawings.** Model in metres, project the points
  yourself (one-point perspective, or orthographic), draw from far to near and let each near face
  erase what is behind it before it draws its own lines. Line weight falls with distance and detail
  drops in steps.
- **Canvases as plates, a shader as the press.** Draw masks on 2D canvases and let the fragment
  shader turn them into the material.
  - Paper relief: a colour canvas and a height canvas (how many sheets up each piece lies); one
    light gives the cast shadows, the dark under each edge, the bright cut edge and the grain.
  - Relief print: one plate per ink in the R, G and B channels; cutting is drawing with
    `destination-out`; the shader prints light to dark, each plate a little out of register, with
    ink squeezed dark at the edges and starved patches inside.
  - Ink and wash: a density canvas for the ink and for each colour; the shader lets ink creep along
    the paper's fibres and leaves a dry stroke only on the high points of the sheet.
  - Foil, mother-of-pearl, halftone work the same way: a mask and a shader. Foil brightens by the
    direction its lines run to the light; mother-of-pearl is one sheet with a fine crackle and a
    slow band of colour that runs across the cracks; a halftone turns each ink's tone into dots on
    its own screen angle.
- **An abstraction follows one rule the eye can count.** A cell that splits in two with every step
  (1, 2, 4, 8, 16) says "scale" better than a field of noise.
- **Read the space; never write it in.** Take the free rectangle from `ctx.artRect` less
  `ctx.quiet`, and choose the pose from its proportions: a trumpet stands steeper in a tall space,
  a factory gets more bays in a wide one, trees grow taller beside a column of copy. Ground lines,
  clouds and fences run to the sheet's edge where no copy stands and fade out where it does. Try
  three layouts in each orientation, and 4:5 and 9:16, before calling the scene finished.
- **Look small, then look close.** At 300 px wide the motif must still be named at a glance. At
  100% look for strokes as smooth as metal, pieces as regular as tiles, and stray dots.
- **What went wrong on the way, so look for it.** Maple leaves with thin lobes read as hemp. A moon
  of large shards, each its own colour, read as stained glass, and rabbits in flat teal and violet
  as cartoons; the same rabbits left as black lacquer inside one pearly sheet read as inlay. A moon
  with a hard, uneven edge read as torn paper. A branch drawn as one even stroke read as wire. A
  parameter named like one the borrowed style already has takes that style's default.

## Motifs that are not allowed

No sun-ray bursts: do not draw rays or alternating wedges radiating from a disc (the sunburst /
"rising sun" motif) — it evokes the Rising Sun flag (욱일기). A sun or moon is a plain disc with a
soft glow. For a retro or festive mood use arches, wavy stripes, checkerboards, stars or halftone
dots.

## Look-dev loop

Iterate small, then render big:

```bash
# ~10 s per try: quarter-size art, 32 samples
node SKILL_DIR/scripts/poster.mjs spec.json --only A --quality draft --format 1920x1080 --out lookdev
```

Look at `lookdev/previews/*.jpg`, adjust, repeat. Check one portrait format too
(`--format 1080x1350`) before the final run — it exposes subjects that are wider than their stated
radius. Scene errors are printed with the Blender traceback / browser console message.

## Composition and lighting advice

- One clear hero, a few supporting shapes, and small accents reads better than many equal objects.
  Odd counts and varied sizes (large / medium / tiny) look composed rather than scattered.
- State an honest `radius`: the farthest visible point of the subject from the origin. Too small and
  the subject is cropped or runs under the copy; too large and it looks lost.
- Keep the backdrop plain behind the copy. Texture, strong shadows and bright lights belong on the
  subject side — use `ctx.mirror` / `flip` so asymmetric lighting follows the layout.
- Limit the palette on the subject to the 3–4 palette colours plus one neutral; let a single
  material (glass, chrome, a glowing emitter) be the special one.
- Blender: big soft lights give soft shadows and clean renders; small bright lights and glass need
  more samples (`"samples": 128` on the poster). Avoid caustics and volumetrics — slow and noisy.
- three.js: generate reflections with `paletteEnvironment`; without an environment, physical
  materials look flat and grey.
