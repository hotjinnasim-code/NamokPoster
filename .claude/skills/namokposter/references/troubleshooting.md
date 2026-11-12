# Setup and troubleshooting

Run `node scripts/doctor.mjs` first — it tells you which of the two halves (Chromium, Blender) is
missing. Posters need Chromium, and the default set (three.js and HTML styles) needs nothing else.
Blender is needed only when the user asks for Blender styles or a custom `.py` scene.

## Requirements

| Piece | Needed for | How to get it |
|---|---|---|
| Node 18+ | everything | — |
| Playwright + Chromium | typography, three.js and HTML styles — every poster | `npm install playwright && npx playwright install chromium` |
| Blender 4.2+ **or** the `bpy` module | Blender styles, on request only | install Blender, or `node scripts/doctor.mjs --install-blender` |

Fonts and three.js are bundled; nothing is downloaded at render time. The Blender scenes are tested
on 4.5 LTS and 5.2; the helpers also map the older (3.6) material socket names, but that version is
not tested.

## Chromium / Playwright

**"Playwright is not installed"** — install it in the project (or globally) and re-run:

```bash
npm install playwright
```

```bash
npx playwright install chromium
```

If the environment already provides a browser, don't install another: point at it instead with
`POSTER_CHROMIUM=/path/to/chrome` (works with `playwright-core`, which downloads nothing). The
script also tries the system Chrome and Edge channels automatically.

**"Could not start Chromium"** on Linux usually means missing system libraries:
`npx playwright install-deps chromium` (needs root), or use a system Chrome via `POSTER_CHROMIUM`.

**"Unable to capture screenshot"** — Chromium missed a frame deadline, typically because the CPU is
saturated by another render. The script retries automatically and prefers the full Chromium build
over Playwright's lighter headless shell; if a poster still fails, re-run (art layers are cached, so
it takes seconds) or wait for the other job to finish. `POSTER_CHROMIUM=/path/to/chrome` forces a
specific browser.

**WebGL unavailable** — three.js styles need WebGL2. The script launches Chromium with software GL
(SwiftShader) enabled, so no GPU is required. If `doctor.mjs` still reports no WebGL, use Blender
styles or supply `art` images.

## Blender

The script looks for, in order: `POSTER_BLENDER`, `blender` on `PATH`, the standard install
locations on macOS/Windows/Linux, then a Python with `bpy` (`POSTER_BPY_PYTHON`, the private venv at
`~/.cache/namokposter/bpy-venv`, `python3`).

**Not found** — pick one:

- Install Blender from blender.org (or `brew install --cask blender`, `sudo snap install blender --classic`,
  `winget install BlenderFoundation.Blender`). If it is not on `PATH`, set
  `POSTER_BLENDER=/Applications/Blender.app/Contents/MacOS/Blender` (or the `blender.exe` path).
- `node scripts/doctor.mjs --install-blender` — pip-installs `bpy` (Blender as a Python module,
  ~350 MB) into a private venv. No admin rights or display needed; good for sandboxes and CI. PyPI
  publishes `bpy` only for the exact Python each Blender release is built with (3.11 for Blender
  4.x–5.0, 3.13 for 5.1+), so the installer tries the interpreters it can find. If none match,
  install a matching Python (`uv python install 3.13`, pyenv, …) and set `POSTER_PYTHON` to it.
- Neither possible → render with the three.js styles; the script substitutes them automatically
  and notes it in the output. Tell the user.

**Renders are slow** — on the default A3 sheet Cycles on a CPU takes about ten minutes per poster at
300 dpi — eighteen when it is cut out for a `ground`, with about 6 GB of memory at the peak
(subsurface `jelly` and cloth-simulated `fabric` up to twice that; path tracing stops at 7 minutes
and is denoised). A 2K poster takes roughly 2–3 minutes on 4 cores and a 4K poster 3–5. A GPU is used
automatically when Blender can see one (OptiX, CUDA, Metal, HIP, oneAPI) and is several times
faster. To go faster:

- Render the three directions with `--quality draft` first and the one the user picks at standard
  quality: a minute or two per poster instead of ten.
- If the poster is for a screen, use `"format": "2k"` — a fifth of A3's pixels, and the art layer
  renders in a few minutes. Stay at 2K unless 4K was asked for.

- `--quality draft` while iterating (half-resolution art, 32 samples).
- `"artScale": 0.75` on a poster renders the 3D layer at 75% and scales it up — the type stays
  full-resolution and the difference is hard to see on soft-lit scenes. The sheet itself stays
  300 dpi; only the path-traced layer is coarser. Offer it to the user rather than deciding it.
- `"samples": 32` on a poster; the denoiser hides most of the noise in matte scenes.
- Each render stops at `timeLimit` seconds (420 by default at standard quality) and is denoised as is.

**Render fails with a Python traceback** — it is printed in the output. In a custom scene the usual
causes are a typo in a `common` helper name or a Principled socket that does not exist in the
installed Blender version (use `C.material(...)` keywords instead of setting sockets by name).

**Colours look washed out or blown** — see "Exposure" in `custom-scenes.md`. Stock scenes are
calibrated; if a custom palette blows out, darken `bg` slightly or lower the style's light via
`params` (`monolith`: `sun`).

## Layout and type

**`copy-overflow` / `copy-dense`** — there is more copy than the zone holds. Shorten the body (keep
the date and place — they are the last things to cut), drop the CTA, or switch layout (`center` gives the widest zone in
landscape; `top`/`bottom` in portrait trade subject size for copy room automatically).

**`title-too-long`** — a single word is wider than the zone at the smallest allowed size (common
with long Korean compounds or URLs as titles). Add `\n` breaks, shorten, or widen the zone:
`"layout": {"layout": "left", "text": [0, 0, 0.62, 1]}`.

**Bad line break in the title** — put `\n` where you want it. Korean is set with `word-break:
keep-all`, so breaks only happen at spaces.

**`title-unit-split`** — a unit of the title marked with `|` (or read as one by the composer) did not
fit one line of a narrow text column even at a smaller size, so a line break cuts it
(`파랑곶 서핑 / 페스티벌`). Give that poster a layout with a wide text zone (`top`, `band`, `headline`,
`axis`), shorten the unit, or move a `|` so the units are shorter. Check `items.title.breaks` in
`report.json` for the lines it chose, and put `\n` in the title only when you want one exact
arrangement.

**`subject-touches-copy`** — a subject that stands on plain ground comes right up to the headline
or the information (a wide still life beside a long headline, in a layout that leaves it a narrow
space). Neither shrinking the subject nor laying the copy over it looks right: give that poster
another layout the style carries (`--list-styles`), usually one that sets copy and subject side by
side (`left`, `right`, `band`). When the layout was chosen automatically the renderer does this
itself, once, and says so (`layout-changed`). Copy that lies on a picture on purpose — a style
whose picture fills the sheet, the `center` layout, a `ground` — is not reported.

**`low-contrast`** — the pixels behind an element are too close to its colour. In order of
preference: choose a palette whose `bg`/`ink` suit the art, move the copy (`layout`), strengthen
the scrim (`"vars": {"--scrim": 0.8}`), or set `"palette": {"ink": "#..."}`.

**Missing glyphs (□)** — the bundled fonts cover Korean and Latin. For Japanese, Chinese or other
scripts add a font with `fontFaces` and put it in the `fonts` stacks.

**`copy-over-art`** — a subject on a plain ground runs under the headline or the information. The
layout was not checked with this style (see `layouts.<orientation>.also` in its `style.json`), or
the copy is long for it. Pick a layout the style lists, or place the subject yourself:
`"layout": {"layout": "corners", "focus": [0.5, 0.3], "artSize": 0.4}`.

**All three posters have the same layout** — you named the styles but no layouts, so each took its
default (usually `left` in landscape, `top` in portrait). Give each poster a `layout` from a
different family, or let `"styles": "auto"` choose.

**`font-pack-missing`** — the type theme is built on faces from the optional font pack
(`assets/fonts-extra`), and this copy of the skill was installed without it, so the theme falls
back to the core faces and loses its character. `--list-styles` shows which themes are complete
here; pick one of those, or install the full package. Automatic posters already avoid the
incomplete themes.

**A logo is too big/small** — logos are 4.2% of the short side tall by default. Override in `css`:
`.logo img { height: calc(var(--u) * 6); }`.

## Output

**Huge PNGs** — a 2K PNG is 1–5 MB, a 4K PNG 5–15 MB, an A3 at 300 dpi 5–20 MB and an A0 at 300 dpi
can pass 100 MB (grainy/gradient art compresses poorly). Add `jpg` to `output.formats` for a lighter
copy, hand the print shop the PDF, and always inspect `previews/*.jpg` rather than the full files.
Paper sizes are 300 dpi by default; a lower density is the user's call (`{"preset": "a0", "dpi": 150}`),
not a shortcut to take for them.

**The file opens at the wrong size / "72 dpi"** — it should not: every PNG and JPG is stamped with
its density (300 dpi by default). If a tool still shows 72, it is ignoring the header; the pixel
count is what counts — width ÷ 300 is the print width in inches.

**Print** — use a paper preset with `pdf` output; add bleed by rendering slightly larger and
cropping in the print shop's tool, since the script does not add crop marks or bleed itself.
Colours are sRGB; convert to CMYK at the printer.

**Stale image after editing a scene** — the cache key includes the scene file's contents, so edits
are picked up. If you changed a file the scene imports, pass `--no-cache`.
