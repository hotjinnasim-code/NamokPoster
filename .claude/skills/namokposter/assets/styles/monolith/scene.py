"""Monolith Editorial — plaster architecture in low sun: an arch, steps, a column and spheres."""
import math

import common as C


def build(ctx):
    rng, pal = ctx.rng, ctx.palette
    flip = -1.0 if ctx.mirror else 1.0     # sun comes from the copy side, shadows fall away from it
    c0, c1, c2, c3 = (ctx.color(i) for i in range(4))
    dark = ctx.dark
    FLOOR = -0.86

    def plaster(c, rough=0.86):
        return C.material('Plaster', c, roughness=rough, specular=0.2)

    # --- set: seamless sweep in the poster background colour
    C.add_backdrop(plaster(pal['bg'], 0.95), floor_z=FLOOR, wall_y=2.2, radius=1.6)
    C.set_world('#dfe9ff' if not dark else '#8fa0c0', 0.5 if not dark else 0.25)
    sun_k = float(ctx.params.get('sun', 1.0))
    C.add_sun(direction=(1.0 * flip, 0.62, -0.62), strength=3.1 * sun_k * (1.0 if not dark else 1.6),
              angle=float(ctx.params.get('shadow', 2.5)), color='#fff1dd')

    # --- architecture (x right, y away from camera, z up; everything stands on FLOOR)
    C.add_arch(0.95, 1.55, 0.2, 0.4, plaster(c0), location=(-0.42 * flip, 0.62, FLOOR), rotation=(0, 0, math.radians(-8 * flip)))

    # steps: three slabs climbing away from the camera
    sw, sd, sh = 0.86, 0.3, 0.17
    for i in range(3):
        C.add_box((sw, sd * (3 - i), sh), 0.012, plaster(c1), location=(0.5 * flip, -0.12 + i * sd / 2, FLOOR + sh / 2 + i * sh), segments=3)
    C.add_sphere(0.2, plaster(c2, 0.6), location=(0.5 * flip + rng.uniform(-0.12, 0.12), 0.18, FLOOR + sh * 3 + 0.2))

    # column behind the steps, a low drum and a small cone/sphere in front
    C.add_cylinder(0.15, 1.25, 0.012, plaster(c3), location=(0.98 * flip, 0.78, FLOOR + 0.625))
    C.add_cylinder(0.3, 0.16, 0.014, plaster(c2, 0.7), location=(-0.92 * flip, -0.3, FLOOR + 0.08))
    C.add_sphere(0.13, plaster(c3, 0.5), location=(-0.92 * flip, -0.3, FLOOR + 0.16 + 0.13))
    if rng.random() < 0.6:
        C.add_cone(0.17, 0.4, 0.01, plaster(c0), location=(-0.05 * flip, -0.62, FLOOR + 0.2))
    else:
        C.add_hemisphere(0.2, plaster(c0), location=(-0.05 * flip, -0.62, FLOOR))
    C.add_sphere(0.075, plaster(c1, 0.5), location=(0.18 * flip, -0.82, FLOOR + 0.075))

    ctx.frame(radius=1.34, fov=22, direction=(0.0, -1.0, 0.2))
