"""Dark Prism — interlocking glass rings around a glowing core, on black, with coloured softboxes."""
import math

import bpy
import common as C


def _camera_only_world(bg_hex, light_hex, light_strength):
    """The camera sees the exact poster background colour; the scene is lit by a dim tinted sky."""
    world = C.set_world(bg_hex, 1.0)
    nt = world.node_tree
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_WORLD')
    cam_bg = next(n for n in nt.nodes if n.type == 'BACKGROUND')
    lit = nt.nodes.new('ShaderNodeBackground')
    lit.inputs['Color'].default_value = C.col(light_hex)
    lit.inputs['Strength'].default_value = light_strength
    path = nt.nodes.new('ShaderNodeLightPath')
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(path.outputs['Is Camera Ray'], mix.inputs[0])
    nt.links.new(lit.outputs[0], mix.inputs[1])
    nt.links.new(cam_bg.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs[0])


def build(ctx):
    rng, pal = ctx.rng, ctx.palette
    flip = -1.0 if ctx.mirror else 1.0
    c0, c1, c2, c3 = (ctx.color(i) for i in range(4))
    ctx.set_view('AgX', 'Medium High Contrast')
    _camera_only_world(pal['bg'], C.mix_hex(c0, '#101018', 0.6), 0.12)
    ctx.scene.cycles.transmission_bounces = 12
    ctx.scene.cycles.max_bounces = 12

    frost = float(ctx.params.get('frost', 0.0))
    n_rings = max(2, min(5, int(ctx.params.get('rings', 3))))

    # --- rings: same centre, shrinking radius, each tipped onto a different axis (a gyroscope)
    tints = [c3, C.mix_hex(c0, '#ffffff', 0.7), C.mix_hex(c2, '#ffffff', 0.7), C.mix_hex(c1, '#ffffff', 0.7), c3]
    base_tilt = [(72, 12, 0), (18, 58, 40), (96, -48, 80), (40, 20, 120), (120, 70, 10)]
    for i in range(n_rings):
        major = 1.0 - i * (0.56 / max(1, n_rings - 1)) if n_rings > 1 else 1.0
        minor = 0.085 - i * 0.008
        glass = C.material('Glass%d' % i, tints[i % len(tints)], roughness=frost, transmission=1.0, ior=1.5, thin_film=rng.uniform(380, 620), thin_film_ior=1.4)
        rx, ry, rz = base_tilt[i]
        C.add_torus(major, minor, glass, major_segments=192, minor_segments=64,
                    rotation=(math.radians(rx + rng.uniform(-9, 9)), math.radians((ry + rng.uniform(-9, 9)) * flip), math.radians(rz + rng.uniform(-20, 20))))

    core = str(ctx.params.get('core', 'glow')).lower()
    if core == 'glow':
        C.add_sphere(0.2, C.emission_material('Core', c0, 4.0, gradient=(c1, c0)), rotation=(0, math.radians(40), math.radians(30)))
        C.add_point_light((0, 0, 0), energy=120, color=c0, radius=0.2)
        C.add_sphere(0.33, C.material('Shell', '#ffffff', roughness=0.0, transmission=1.0, ior=1.33))
    elif core == 'chrome':
        C.add_sphere(0.3, C.material('Chrome', '#f4f4f6', roughness=0.06, metallic=1.0))

    # satellites
    chrome = C.material('Sat', '#f2f2f4', roughness=0.08, metallic=1.0)
    for i in range(5):
        a, r = rng.uniform(0, math.tau), rng.uniform(0.62, 1.12)
        C.add_sphere(rng.uniform(0.03, 0.075), chrome if i % 2 else C.material('SatC', ctx.color(i), roughness=0.15, coat=1.0),
                     location=(math.cos(a) * r, rng.uniform(-0.5, 0.3), math.sin(a) * r))

    # --- lighting: coloured cards (seen only in reflections/refractions) + two rim lights
    C.add_softbox((-3.4 * flip, -2.6, 2.4), (2.6, 4.2), strength=9.0, gradient=(c0, c1))
    C.add_softbox((3.6 * flip, -1.8, -1.6), (2.2, 3.6), strength=7.0, gradient=(c2, c0))
    C.add_softbox((0.4 * flip, -3.2, 4.2), (4.5, 1.4), color='#ffffff', strength=5.0)
    C.add_softbox((0.0, 3.6, 0.6), (5.5, 3.0), strength=2.2, gradient=(c1, c2))          # behind: lights the glass from within
    C.add_area_light((-4.0 * flip, 2.5, 3.0), energy=420, size=2.5, color=c1)
    C.add_area_light((4.2 * flip, 2.0, -2.0), energy=320, size=2.5, color=c2)

    ctx.frame(radius=1.14, fov=22, direction=(0.12 * flip, -1.0, 0.1))
