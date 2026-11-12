"""Sunlit room — a full-picture interior seen straight on: a large plain wall, a floor, and sunlight
from an off-frame window laying a sharp-edged patch with window-bar and leaf shadows across the wall,
around a few furnishings grouped at the layout focus. Dark palettes become an evening room lit by a
pendant lamp.

How the picture is composed around the copy
- The furnishings stand around the world origin, so ``ctx.frame`` puts them on the layout focus.
- The plain wall *is* the calm area: it renders at the palette ``bg`` (``matchBackground`` trims the
  rest). The light enters from the copy side and lands on the art side only; its patch is placed in
  world space around the group, so it follows the hero in every layout.
- Copy below the art (``bottom`` layouts): the group moves onto a wall shelf, the wall runs on behind
  the copy and the floor is a thin strip under the footer. Otherwise the group stands on the floor.
- Palette ('Standard' view, literal colours): ``bg`` = wall, ``colors`` = [floor, wood, ceramic,
  leaves], ``accent`` = the picture, the berries, the lamp.
"""
import math

import bpy
import numpy as np

import common as C

FOV = 24.0
R = 1.3             # the group fits a sphere of this radius around the origin
WALL_Y = 0.62       # the wall stands this far behind the origin
AMBIENT = 0.8       # share of the wall colour that sky light alone gives; the sun patch adds on top
SUN_WATTS = 2.7     # power per square metre of window; with the 1 degree spread this adds about half the wall colour again
LAMP_WATTS = 105.0  # pendant bulb in the evening palette


class View:
    """Poster coordinates (u right, v down, 0..1) -> world, after ctx.frame()."""

    def __init__(self, ctx):
        bpy.context.view_layer.update()
        cam = ctx.camera
        fr = cam.data.view_frame(scene=ctx.scene)
        rot = cam.matrix_world.to_3x3()
        self.tl = np.array(rot @ max(fr, key=lambda p: -p.x + p.y))
        self.tr = np.array(rot @ max(fr, key=lambda p: p.x + p.y))
        self.bl = np.array(rot @ max(fr, key=lambda p: -p.x - p.y))
        self.pos = np.array(cam.matrix_world.translation)

    def at_depth(self, u, v, y):
        d = self.tl + (self.tr - self.tl) * u + (self.bl - self.tl) * v
        return self.pos + d * ((y - self.pos[1]) / d[1])


def hide_from_camera(ob):
    try:
        ob.visible_camera = False
    except Exception:
        pass
    return ob


def scale_lin(hexcol, k, cap=0.92):
    """Hex colour scaled in linear light (hue kept), as a linear RGBA tuple for a shader input."""
    r, g, b = C.col(hexcol)[:3]
    k = min(k, cap / max(r, g, b, 1e-4))
    return (r * k, g * k, b * k, 1.0)


def matte(name, colour, roughness=0.85, bump=0.0, bump_scale=40.0):
    """Matte paint / plaster. ``colour`` may be a hex string or a linear RGBA tuple."""
    mat = C.material(name, '#ffffff', roughness=roughness, specular=0.15)
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = C.col(colour) if isinstance(colour, str) else colour
    if bump > 0:
        tex = nt.nodes.new('ShaderNodeTexNoise')
        tex.inputs['Scale'].default_value = bump_scale
        tex.inputs['Detail'].default_value = 3.0
        bp = nt.nodes.new('ShaderNodeBump')
        bp.inputs['Strength'].default_value = bump
        bp.inputs['Distance'].default_value = 0.01
        nt.links.new(nt.nodes.new('ShaderNodeNewGeometry').outputs['Position'], tex.inputs['Vector'])
        nt.links.new(tex.outputs[0], bp.inputs['Height'])
        nt.links.new(bp.outputs[0], bsdf.inputs['Normal'])
    return mat


def floor_material(colour, plank=0.55):
    """Pale boards laid parallel to the wall: faint joints and board-to-board variation. The boards run
    across the picture on purpose — joints running towards the camera would fan out from the vanishing
    point behind the hero."""
    mat = C.material('Floor', '#ffffff', roughness=0.55, specular=0.3)
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    base = C.col(colour) if isinstance(colour, str) else colour
    try:
        geo = nt.nodes.new('ShaderNodeNewGeometry')
        brick = nt.nodes.new('ShaderNodeTexBrick')
        brick.offset = 0.5
        brick.inputs['Scale'].default_value = 1.0
        brick.inputs['Mortar Size'].default_value = 0.005
        brick.inputs['Mortar Smooth'].default_value = 0.5
        brick.inputs['Brick Width'].default_value = 4000.0     # endless boards: no butt joints
        brick.inputs['Row Height'].default_value = 0.17
        brick.inputs['Bias'].default_value = 0.0
        brick.inputs['Color1'].default_value = tuple(v * (1.0 + 0.04 * plank) for v in base[:3]) + (1.0,)
        brick.inputs['Color2'].default_value = tuple(v * (1.0 - 0.06 * plank) for v in base[:3]) + (1.0,)
        brick.inputs['Mortar'].default_value = tuple(v * (1.0 - 0.28 * plank) for v in base[:3]) + (1.0,)
        mp = nt.nodes.new('ShaderNodeMapping')
        mp.inputs['Location'].default_value = (1777.0, 0.03, 0.0)   # keep the one joint of the 'endless' boards far out of sight
        nt.links.new(geo.outputs['Position'], mp.inputs['Vector'])
        nt.links.new(mp.outputs[0], brick.inputs['Vector'])
        nt.links.new(brick.outputs['Color'], bsdf.inputs['Base Color'])
    except Exception:
        bsdf.inputs['Base Color'].default_value = base
    return mat


def stroke(points, radius, material, radii=None, name='Stem'):
    """A bent rod through ``points`` (list of xyz): stems, legs, cords."""
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = radius
    cu.bevel_resolution = 3
    cu.use_fill_caps = True
    sp = cu.splines.new('NURBS')
    sp.points.add(len(points) - 1)
    for i, (p, q) in enumerate(zip(sp.points, points)):
        p.co = (q[0], q[1], q[2], 1.0)
        p.radius = radii[i] if radii else 1.0
    sp.use_endpoint_u = True
    sp.order_u = min(4, len(points))
    cu.materials.append(material)
    ob = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def leaf(material, tip, base, width, rng):
    """One flat oval leaf from ``base`` to ``tip``."""
    import mathutils
    b, t = mathutils.Vector(base), mathutils.Vector(tip)
    d = t - b
    ob = C.add_icosphere(0.5, 3, material, location=tuple((b + t) / 2), scale=(width, width * 0.09, d.length))
    ob.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    ob.rotation_euler.rotate_axis('Z', rng.uniform(-0.7, 0.7))
    return ob


# --------------------------------------------------------------------------- furnishings


def add_pot_plant(rng, x, y, z0, mat_pot, mat_leaf, mat_stem, height=1.55, flip=1.0):
    """A leafy indoor tree in a tapered pot: its leaves throw the shadows that make the light patch."""
    ph = 0.36
    C.add_lathe(C.fillet_profile([(0, 0), (0.15, 0), (0.21, ph), (0.185, ph), (0.14, 0.03), (0, 0.03)], 0.02), mat_pot, location=(x, y, z0))
    C.add_cylinder(0.18, 0.02, 0.0, mat_stem, location=(x, y, z0 + ph - 0.05))
    top = z0 + height
    for s in range(3):
        lean = (s - 1) * 0.24 + rng.uniform(-0.05, 0.05)
        hgt = height * (1.0 if s == 1 else rng.uniform(0.72, 0.86))
        pts = [(x, y, z0 + ph - 0.05), (x + lean * 0.25, y + 0.01 * s, z0 + ph + 0.3 * hgt),
               (x + lean * 0.75, y, z0 + ph + 0.62 * (hgt - ph)), (x + lean * 1.1 + 0.03 * flip, y, z0 + hgt)]
        stroke(pts, 0.014, mat_stem, [1.4, 1.1, 0.8, 0.5])
        n = 8 if s == 1 else 6
        for i in range(n):
            f = 0.36 + 0.64 * i / (n - 1)
            px = pts[0][0] + (pts[3][0] - pts[0][0]) * f ** 1.4
            pz = z0 + ph + (hgt - ph) * f
            a = rng.uniform(-1.0, 1.0) + (0.9 if i % 2 else -0.9)
            ln = rng.uniform(0.22, 0.32) * (1.15 - 0.3 * f)
            tip = (px + math.sin(a) * ln, y + rng.uniform(-0.12, 0.1), pz + abs(math.cos(a)) * ln * 0.75 + 0.03)
            leaf(mat_leaf, tip, (px, y, pz), ln * 0.56, rng)
    return top


def add_stool(x, y, z0, mat_wood, height=0.48, radius=0.2):
    C.add_cylinder(radius, 0.035, 0.012, mat_wood, location=(x, y, z0 + height - 0.0175))
    for i in range(3):
        a = math.radians(90 + 120 * i)
        stroke([(x + 0.55 * radius * math.cos(a), y + 0.55 * radius * math.sin(a), z0 + height - 0.03),
                (x + 1.0 * radius * math.cos(a), y + 1.0 * radius * math.sin(a), z0)], 0.014, mat_wood, [1.2, 0.8], 'Leg')
    return z0 + height


def add_vase(rng, x, y, z0, mat_vase, mat_stem, mat_berry, scale=1.0, lean=1.0):
    prof = [(0, 0), (0.07, 0), (0.105, 0.09), (0.1, 0.17), (0.045, 0.27), (0.04, 0.32), (0.052, 0.34), (0.03, 0.34), (0.03, 0.02), (0, 0.02)]
    C.add_lathe(C.fillet_profile([(r * scale, z * scale) for r, z in prof], 0.02 * scale), mat_vase, location=(x, y, z0))
    for i in range(3):
        a = (i - 1) * 0.42 + rng.uniform(-0.1, 0.1) + 0.12 * lean
        ln = scale * rng.uniform(0.62, 0.86)
        pts = [(x, y, z0 + 0.2 * scale), (x + 0.3 * math.sin(a) * ln, y, z0 + 0.34 * scale + 0.4 * ln),
               (x + 0.85 * math.sin(a) * ln + 0.05 * lean, y + rng.uniform(-0.04, 0.04), z0 + 0.34 * scale + 0.9 * ln)]
        stroke(pts, 0.006 * scale, mat_stem, [1.2, 1.0, 0.6])
        for k in range(5):
            f = 0.45 + 0.55 * k / 4
            bx = pts[1][0] + (pts[2][0] - pts[1][0]) * (f - 0.2) / 0.8
            bz = pts[1][2] + (pts[2][2] - pts[1][2]) * (f - 0.2) / 0.8
            C.add_sphere(0.024 * scale * rng.uniform(0.8, 1.25), mat_berry, segments=16,
                         location=(bx + rng.uniform(-0.035, 0.035) * scale, y + rng.uniform(-0.03, 0.03), bz + rng.uniform(-0.02, 0.02)))


def add_picture(x, z, w, h, mat_frame, mat_paper, shapes, tilt=0.0):
    """A framed print hanging on the wall: frame, paper, and a few flat shapes in palette colours."""
    y = WALL_Y - 0.022
    C.add_box((w, 0.03, h), 0.006, mat_frame, location=(x, y, z), rotation=(0, tilt, 0), segments=2)
    C.add_box((w - 0.05, 0.012, h - 0.05), 0.0, mat_paper, location=(x, y - 0.011, z), rotation=(0, tilt, 0))
    yy = y - 0.019
    kind, c1, c2 = shapes
    # Abstract prints made of blocks and an arch only — no discs, no rays.
    if kind == 0:      # an arch standing on a bar
        aw, ah = 0.42 * w, 0.5 * h
        pts = [(-aw / 2, 0.0), (aw / 2, 0.0), (aw / 2, ah - aw / 2)]
        pts += [(aw / 2 * math.cos(t), ah - aw / 2 + aw / 2 * math.sin(t)) for t in [math.pi * i / 24 for i in range(1, 24)]]
        pts += [(-aw / 2, ah - aw / 2)]
        C.add_extrusion(pts, 0.004, 0.0, c1, name='PrintArch', location=(x - 0.04 * w, yy, z - 0.26 * h))
        C.add_box((0.6 * w, 0.004, 0.045 * h), 0.0, c2, location=(x, yy - 0.003, z - 0.3 * h))
    elif kind == 1:    # two stacked blocks
        C.add_box((0.52 * w, 0.004, 0.3 * h), 0.0, c1, location=(x - 0.04 * w, yy, z - 0.13 * h))
        C.add_box((0.34 * w, 0.004, 0.24 * h), 0.0, c2, location=(x + 0.1 * w, yy - 0.003, z + 0.17 * h))
    else:              # three level bars of different lengths
        for i, (bw, cc) in enumerate([(0.56, c1), (0.4, c2), (0.5, c1)]):
            C.add_box((bw * w, 0.004, 0.09 * h), 0.0, cc, location=(x - (0.56 - bw) * w / 2, yy, z + (0.2 - 0.2 * i) * h))


def add_pendant(x, y, z, mat_shade, glow_hex, lit, energy):
    """A dome pendant on a cord. When ``lit`` it carries the evening light."""
    stroke([(x, y, z + 0.16), (x, y, z + 9.0)], 0.006, mat_shade, name='Cord')
    C.add_lathe([(0.0, 0.2), (0.035, 0.2), (0.05, 0.17), (0.14, 0.12), (0.22, 0.0), (0.205, 0.0), (0.13, 0.1), (0.04, 0.15), (0.0, 0.15)],
                mat_shade, location=(x, y, z))
    bulb = C.add_sphere(0.05, C.emission_material('Bulb', glow_hex, 14.0 if lit else 0.0) if lit else C.material('BulbOff', '#f4efe6', roughness=0.3),
                        location=(x, y, z + 0.05), segments=24)
    if lit:
        C.add_point_light((x, y, z + 0.02), energy=energy, color=glow_hex, radius=0.045)
    return bulb


def wall_with_door(mat, z0, x_door, w_door, h_door, thickness=0.22, extent=60.0):
    """The wall as one slab with an arched doorway cut out of its foot (so the jambs have real depth)."""
    a, b = x_door - w_door / 2, x_door + w_door / 2
    r = w_door / 2
    spring = z0 + h_door - r
    pts = [(-extent, z0), (a, z0), (a, spring)]
    pts += [(x_door - r * math.cos(t), spring + r * math.sin(t)) for t in [math.pi * i / 40 for i in range(1, 40)]]
    pts += [(b, spring), (b, z0), (extent, z0), (extent, z0 + extent), (-extent, z0 + extent)]
    ob = C.add_extrusion(pts, thickness, 0.0, mat, name='Wall', location=(0.0, WALL_Y + thickness / 2, 0.0))
    return ob


# --------------------------------------------------------------------------- build


def build(ctx):
    pal, rng, prm = ctx.palette, ctx.rng, ctx.params
    flip = -1.0 if ctx.mirror else 1.0                         # light enters from the copy side, travels towards +flip
    c_floor, c_wood, c_pot, c_leaf = (ctx.color(i) for i in range(4))
    evening = C.luminance(pal['bg']) < 0.14
    ctx.set_view('Standard')                                  # the wall must stay the literal palette colour
    cy = ctx.scene.cycles
    try:
        cy.max_bounces, cy.diffuse_bounces, cy.glossy_bounces = 4, 2, 2
        cy.adaptive_min_samples = 12
        cy.use_light_tree = False
    except Exception:
        pass

    k_sun = float(prm.get('sun', 1.0))
    bars = int(prm.get('bars', 3))
    want_arch = prm.get('arch', True)
    lamp_mode = str(prm.get('lamp', 'auto')).lower()
    lamp_on = evening if lamp_mode == 'auto' else lamp_mode in ('on', 'true', '1')

    tx0, ty0, tx1, ty1 = ctx.text_rect
    shelf = ty0 > 0.2 and (ty1 - ty0) < 0.9                    # copy below the art: hang the group on the wall
    dist = ctx.frame(radius=R, fov=FOV, direction=(0.0, -1.0, 0.0))
    view = View(ctx)
    short = min(ctx.width, ctx.height)

    # ---- floor level, and the size of the standing group
    # Standing group: the floor is one unit under the origin. Copy beside the art runs the full height,
    # so there the floor line is pushed down below it and the whole group grows to stay on the floor.
    side_copy = (ty1 - ty0) > 0.9 and (tx1 - tx0) < 0.66
    over = (ty1 - ty0) > 0.9 and (tx1 - tx0) >= 0.66
    g = 1.0
    if shelf:
        v_floor = 1.0 - 0.036 * short / ctx.height             # a strip of floor under the footer
        z_floor = float(view.at_depth(0.5, v_floor, WALL_Y)[2])
    else:
        if side_copy:
            g = max(1.0, -float(view.at_depth(0.5, 0.865, WALL_Y)[2]))
        z_floor = -g

    # ---- surfaces. Sky light alone gives AMBIENT of a surface's colour, so the wall paint is the
    # palette colour divided by that; in the evening the paint stays mid-toned and the room is dim.
    wall_amb = AMBIENT
    if evening:
        wall_paint = scale_lin(pal['bg'], 6.5, cap=0.5)
        wall_amb = C.col(pal['bg'])[1] / max(1e-4, wall_paint[1])
    else:
        wall_paint = scale_lin(pal['bg'], 1.0 / AMBIENT)
    wall_mat = matte('Wall', wall_paint, 0.92, bump=0.06, bump_scale=55.0)
    floor = C.add_plane(400.0, floor_material(c_floor), location=(0.0, WALL_Y - 150.0, z_floor))
    x_door = 1.02 * flip * g
    has_door = bool(want_arch) and not shelf
    if has_door:
        wall_with_door(wall_mat, z_floor, x_door, 0.82 * g, 2.08 * g)
        # the room beyond: its own wall, a shade lighter in the day (the floor runs on under the slab)
        back = C.add_plane(60.0, matte('Beyond', scale_lin(C.mix_hex(pal['bg'], c_floor, 0.35), 1.0 / AMBIENT) if not evening else wall_paint, 0.92),
                           location=(0.0, WALL_Y + 2.6, 0.0), rotation=(math.radians(90), 0, 0))
        fill = C.add_area_light((x_door, WALL_Y + 1.2, z_floor + 3.2 * g), energy=(70.0 if not evening else 10.0) * g * g, size=2.2 * g,
                                color='#fff4e4' if not evening else '#cfd6ee', target=(x_door, WALL_Y + 2.6, z_floor + 0.9 * g))
        hide_from_camera(fill)                                 # daylight in the room beyond, so the doorway is not a black hole
    else:
        C.add_plane(240.0, wall_mat, location=(0.0, WALL_Y, 0.0), rotation=(math.radians(90), 0, 0))
    skirting = matte('Skirting', C.mix_hex(pal['bg'], '#ffffff', 0.55) if not evening else scale_lin(pal['bg'], 9.0, cap=0.6), 0.6)
    if not shelf:
        for x0, x1 in ([(-60.0, x_door - 0.41 * g), (x_door + 0.41 * g, 60.0)] if has_door else [(-60.0, 60.0)]):
            C.add_box((x1 - x0, 0.025, 0.1), 0.004, skirting, location=((x0 + x1) / 2, WALL_Y - 0.0125, z_floor + 0.05), segments=2)

    # ---- light
    # A wall over a pale floor sees a little more than half the sky plus warm bounce from the floor:
    # a slightly cool sky at 1.9x brings it back to its paint colour x AMBIENT.
    C.set_world('#e4ecff', wall_amb * 1.9)
    patch_x, patch_z = (-0.28 * flip * g, 0.28 * g) if not shelf else (-0.1 * flip, 0.18)
    if not evening and k_sun > 0:
        d = np.array([0.74 * flip, 0.64, -0.36])
        d /= np.linalg.norm(d)
        back_off = 3.6
        w_win, h_win = 1.02 * g, 1.46 * g
        # keep the patch on the art side: clear of the copy's edge beside it and of copy above it
        half_w = 0.5 * w_win * math.hypot(d[0], d[1]) / d[1] + 0.12 * g
        half_h = 0.62 * h_win
        if tx1 < 0.98 and flip > 0:
            patch_x = max(patch_x, float(view.at_depth(tx1 + 0.03, 0.5, WALL_Y)[0]) + half_w)
        elif tx0 > 0.02 and flip < 0:
            patch_x = min(patch_x, float(view.at_depth(tx0 - 0.03, 0.5, WALL_Y)[0]) - half_w)
        if ty0 < 0.05 and ty1 < 0.9 and (tx1 - tx0) > 0.9:
            patch_z = min(patch_z, float(view.at_depth(0.5, ty1 + 0.02, WALL_Y)[2]) - half_h)
        loc = np.array([patch_x, WALL_Y, patch_z]) - d * back_off
        sun = C.add_area_light(tuple(loc), energy=1.0, size=w_win, size_y=h_win, color='#fff1dc', target=tuple(loc + d), spread=1.0)
        sun.data.energy = SUN_WATTS * k_sun * w_win * h_win
        hide_from_camera(sun)
        # glazing bars, a hand's width in front of the pane (they ride with the light)
        bar = C.material('Bar', '#111111', roughness=1.0)
        t = 0.045 * g
        strips = [((0.0, 0.0), (t, h_win + 0.2))] + [((0.0, h_win * (i / bars - 0.5)), (w_win + 0.2, t)) for i in range(1, bars)]
        for (bx, by), (sx, sy) in strips:
            b = C.add_box((sx, sy, 0.02), 0.0, bar)
            b.parent = sun
            b.location = (bx, by, -0.12)
            hide_from_camera(b)
            try:
                b.visible_diffuse = b.visible_glossy = False   # only ever seen as a shadow
            except Exception:
                pass

    # ---- materials
    wood = C.material('Wood', c_wood, roughness=0.5, specular=0.35)
    pot = C.material('Pot', c_pot, roughness=0.7, specular=0.25)
    ceramic = C.material('Ceramic', C.mix_hex(c_pot, '#ffffff', 0.55), roughness=0.35, coat=0.4)
    leafm = C.material('Leaf', c_leaf, roughness=0.5, specular=0.4)
    stem = C.material('Stem', C.mix_hex(c_leaf, c_wood, 0.6), roughness=0.7)
    berry = C.material('Berry', pal['accent'], roughness=0.5)
    paper = matte('Paper', '#f3eee4' if not evening else '#d9d2c6', 0.9)
    art = (rng.randrange(3), matte('Art1', pal['accent'], 0.85), matte('Art2', c_wood, 0.85))
    shade = C.material('Shade', C.mix_hex(c_pot, '#1a1a1a', 0.35) if not evening else c_pot, roughness=0.45, metallic=0.2)
    glow_hex = C.mix_hex(pal['accent'], '#ffd9a0', 0.55)

    # ---- the group (built at unit scale, then scaled about the foot of the wall)
    before = set(bpy.data.objects)
    z_build = z_floor if shelf else -1.0
    if shelf:
        zs = -0.5
        C.add_box((1.75, 0.24, 0.04), 0.008, wood, location=(0.0, WALL_Y - 0.12, zs - 0.02), segments=2)
        for sx in (-0.6, 0.6):
            C.add_box((0.03, 0.2, 0.14), 0.004, wood, location=(sx, WALL_Y - 0.1, zs - 0.11), segments=2)
        add_vase(rng, -0.52 * flip, WALL_Y - 0.13, zs, ceramic, stem, berry, 1.05, flip)
        # books and a small pot on them
        bx = 0.12 * flip
        hts = 0.0
        for i, (w, hh, c) in enumerate([(0.36, 0.05, c_wood), (0.32, 0.04, pal['accent']), (0.28, 0.045, c_pot)]):
            C.add_box((w, 0.19, hh), 0.006, matte('Book%d' % i, c, 0.7), location=(bx + rng.uniform(-0.02, 0.02), WALL_Y - 0.13, zs + hts + hh / 2),
                      rotation=(0, 0, rng.uniform(-0.12, 0.12)), segments=2)
            hts += hh
        C.add_lathe(C.fillet_profile([(0, 0), (0.07, 0), (0.09, 0.12), (0.075, 0.12), (0.06, 0.02), (0, 0.02)], 0.01), pot, location=(bx, WALL_Y - 0.13, zs + hts))
        for i in range(7):
            a = math.tau * i / 7 + rng.uniform(-0.3, 0.3)
            base = (bx, WALL_Y - 0.13, zs + hts + 0.1)
            tip = (bx + 0.2 * math.cos(a), WALL_Y - 0.13 + 0.07 * math.sin(a), zs + hts + 0.2 + rng.uniform(0.0, 0.16))
            leaf(leafm, tip, base, 0.085, rng)
        # trailing plant at the far end of the shelf
        tx = 0.66 * flip
        C.add_lathe(C.fillet_profile([(0, 0), (0.085, 0), (0.11, 0.15), (0.095, 0.15), (0.075, 0.02), (0, 0.02)], 0.012), ceramic, location=(tx, WALL_Y - 0.12, zs))
        for i in range(4):
            dx = (i - 1.5) * 0.085 + rng.uniform(-0.02, 0.02)
            ln = rng.uniform(0.45, 0.9)
            pts = [(tx + dx * 0.4, WALL_Y - 0.14, zs + 0.14), (tx + dx * 1.2, WALL_Y - 0.25, zs + 0.2),
                   (tx + dx * 1.6, WALL_Y - 0.27, zs - 0.1), (tx + dx * 1.8 + rng.uniform(-0.05, 0.05), WALL_Y - 0.25, zs - ln)]
            stroke(pts, 0.005, stem, name='Vine')
            for k in range(int(4 + ln * 5)):
                f = k / (3 + ln * 5)
                pz = zs + 0.1 - (ln + 0.1) * f
                px = tx + dx * (1.3 + 0.5 * f)
                s = 1 if k % 2 else -1
                leaf(leafm, (px + s * 0.075, WALL_Y - 0.24 + rng.uniform(-0.02, 0.03), pz - 0.05), (px, WALL_Y - 0.26, pz), 0.065, rng)
        add_picture(-0.02 * flip, 0.52, 0.6, 0.76, wood, paper, art)
        lamp_x, lamp_z = -0.86 * flip, 0.42
    else:
        add_pot_plant(rng, -0.72 * flip, 0.02, z_build, pot, leafm, stem, 1.62, flip)
        top = add_stool(0.08 * flip, 0.1, z_build, wood)
        add_vase(rng, 0.08 * flip, 0.1, top, ceramic, stem, berry, 1.0, flip)
        if not over:                                           # centred copy: leave the wall behind it bare
            add_picture(0.12 * flip, 0.62, 0.56, 0.72, wood, paper, art)
        # a floor cushion in front of the doorway / at the group's edge
        C.add_sphere(0.27, matte('Pouf', C.mix_hex(c_wood, pal['bg'], 0.5), 0.9), location=(0.62 * flip, -0.3, z_build + 0.13), scale=(1.0, 1.0, 0.5), segments=48)
        lamp_x, lamp_z = -0.34 * flip, 0.74
    if lamp_on or lamp_mode in ('off-visible',):
        add_pendant(lamp_x, WALL_Y - 0.42, lamp_z, shade, glow_hex, lamp_on, LAMP_WATTS * g * g * float(prm.get('glow', 1.0)))
    if g != 1.0:
        made = [o for o in bpy.data.objects if o not in before and o.parent is None]
        C.group(made, 'Group', location=(0.0, WALL_Y * (1.0 - g), 0.0), scale=g)

