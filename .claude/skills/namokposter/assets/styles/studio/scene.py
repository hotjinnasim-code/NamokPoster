"""Soft Studio — floating primitives in front of a pastel wall, lit by one big soft key light."""
import math

import common as C

KEY = 2300.0   # key light power (W); tuned so the lit wall lands on the palette background colour


def _pale(h):
    r, g, b = C.hex_to_rgb(h)
    return min(r, g, b) > 0.82


def build(ctx):
    rng, pal = ctx.rng, ctx.palette
    flip = -1.0 if ctx.mirror else 1.0   # keep shadows falling away from the copy
    dark = ctx.dark

    # --- set: a single wall. Its colour is the poster background, so the copy sits on "paper".
    wall = C.add_plane(240, C.material('Wall', pal['bg'], roughness=0.92, specular=0.15))
    wall.rotation_euler = (math.radians(90), 0, 0)
    wall.location = (0, 1.45, 0)
    C.set_world('#ffffff', 0.46)
    # far, large key: even light across the wall (so the copy area stays flat) with soft shadows
    C.add_area_light((-7.8 * flip, -9.6, 8.2), energy=KEY, size=8.0, target=(0.4 * flip, 1.0, -0.3))
    C.add_area_light((6.0 * flip, -4.0, -1.5), energy=KEY * 0.13, size=5.0, color=ctx.color(0), target=(0, 0, 0))   # tinted bounce

    # --- materials
    cols = list(ctx.colors)
    # which colour goes where varies with the seed — but near-white never gets the hero spot
    vivid = [c for c in cols if not _pale(c)] or cols
    pale = [c for c in cols if c not in vivid]
    rng.shuffle(vivid)
    order = vivid + pale

    def clay(c):
        return C.material('Clay', c, roughness=0.62, sheen=0.25, specular=0.35)

    def gloss(c):
        return C.material('Gloss', c, roughness=0.14, coat=1.0, coat_roughness=0.04)

    metal_kind = str(ctx.params.get('metal', 'chrome')).lower()
    metal = C.material('Metal', '#f2c063' if metal_kind == 'gold' else '#f0f0f0', roughness=0.12, metallic=1.0)
    glass = C.material('Glass', C.mix_hex(order[1 % len(order)], '#ffffff', 0.82), roughness=0.0, transmission=1.0, ior=1.47)

    # --- composition: one hero sphere, four mid shapes on a loose ring, small accents between them.
    C.add_sphere(0.56, clay(order[0]), location=(0.06, 0.05, 0.02))

    def torus(c, loc):
        return C.add_torus(0.47, 0.145, gloss(c), location=loc, rotation=(math.radians(62 + rng.uniform(-8, 8)), math.radians(18 * flip), math.radians(rng.uniform(-30, 30))))

    def capsule(c, loc):
        return C.add_capsule(0.165, 0.98, clay(c), location=loc, rotation=(math.radians(rng.uniform(-10, 10)), math.radians(rng.uniform(28, 44) * rng.choice((-1, 1))), 0))

    def box(c, loc):
        return C.add_box(0.5, 0.075, gloss(c), location=loc, rotation=(math.radians(rng.uniform(15, 35)), math.radians(rng.uniform(20, 40)), math.radians(rng.uniform(-25, 25))))

    def cone(c, loc):
        return C.add_cone(0.33, 0.66, 0.035, clay(c), location=loc, rotation=(math.radians(rng.uniform(-28, -12)), math.radians(rng.uniform(-22, 22)), 0))

    makers = [torus, capsule, box, cone]
    rng.shuffle(makers)
    slots = [(-0.66, -0.28, 0.5), (0.8, 0.12, 0.5), (-0.6, 0.1, -0.62), (0.74, -0.22, -0.6)]
    for i, (make, (x, y, z)) in enumerate(zip(makers, slots)):
        make(order[(i + 1) % len(order)], (x * flip + rng.uniform(-0.04, 0.04), y, z + rng.uniform(-0.04, 0.04)))

    if metal_kind != 'none':
        C.add_sphere(0.135, metal, location=(-0.16 * flip, -0.55, 0.98))
    if ctx.params.get('glass', True):
        C.add_sphere(0.2, glass, location=(0.6 * flip, -0.62, 0.02))
    C.add_sphere(0.095, gloss(order[2 % len(order)]), location=(-1.1 * flip, 0.0, 0.02))
    C.add_sphere(0.07, clay(order[3 % len(order)]), location=(1.16 * flip, 0.1, -0.12))
    C.add_cylinder(0.3, 0.1, 0.03, clay(order[1 % len(order)]), location=(0.02 * flip, -0.35, -1.0), rotation=(math.radians(72), 0, math.radians(14)))

    ctx.frame(radius=1.4, fov=20, direction=(0.0, -1.0, 0.03))
