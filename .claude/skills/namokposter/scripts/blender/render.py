"""Render one poster art layer with Blender (Cycles).

Run by scripts/poster.mjs — either inside the Blender app:
    blender --background --factory-startup --python render.py -- --job job.json
or with the `bpy` Python module:
    python render.py --job job.json

The job file holds: scene (path to a .py with build(ctx)), out, width, height, samples, palette,
seed, params, layout {focus, artSize, text, layout}, quality, timeLimit, device.
"""
import importlib.util
import json
import os
import sys
import time

sys.dont_write_bytecode = True   # keep __pycache__ out of the skill and the user's project

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bpy  # noqa: E402
import common  # noqa: E402


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    if '--job' not in argv:
        raise SystemExit('usage: render.py --job job.json')
    with open(argv[argv.index('--job') + 1], encoding='utf-8') as f:
        job = json.load(f)

    t0 = time.time()
    ctx = common.Context(job)
    spec = importlib.util.spec_from_file_location('poster_scene', job['scene'])
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    if not hasattr(mod, 'build'):
        raise SystemExit('Scene file must define build(ctx): ' + job['scene'])
    mod.build(ctx)
    ctx.finish()

    os.makedirs(os.path.dirname(os.path.abspath(job['out'])), exist_ok=True)
    print('POSTER3D render start: %dx%d, %d samples, device=%s, blender=%s' % (
        ctx.width, ctx.height, ctx.scene.cycles.samples, ctx.device, bpy.app.version_string), flush=True)
    bpy.ops.render.render(write_still=True)
    if not os.path.exists(job['out']):
        raise SystemExit('Render produced no file at ' + job['out'])
    print('POSTER3D render done in %.1fs' % (time.time() - t0), flush=True)


if __name__ == '__main__':
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        import traceback
        traceback.print_exc()
        sys.exit(3)
