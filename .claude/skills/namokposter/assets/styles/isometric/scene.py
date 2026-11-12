"""Isometric miniature — a small diorama on a rounded slab, seen from the classic three-quarter
angle through a very long lens.

The technique: everything is a bevelled box, cylinder or ball with the same small edge radius;
surfaces are matte pastel; the view is (almost) parallel, 45 degrees round and 35 degrees down, so
every top is light, one side mid and the other side shaded; tiny props give the scale. The slab
stands on a floor of the poster colour and drops one soft shadow.

What is modelled is the ``motif``: room (a cosy studio), shop (a cafe front), stage (a festival
stage). Palette: ``bg`` = backdrop, ``colors`` = [walls / main, floor / ground, wood / furniture,
cool second colour, plants], ``accent`` = small hot accents.
"""
import math

import bpy
import numpy as np
from mathutils import Vector

import common as C

AMB, SUN, FILL = 0.5, 0.36, 0.1
SKY, WARM = '#dfe8ff', '#fff3e2'
BEV = 0.016            # the one edge radius used everywhere
T = 0.2                # slab thickness; z of the diorama floor


def _fit_view(ctx, P, direction, fov, margin=1.05):
    """Where the camera of ``ctx.frame(width, height, fov, direction)`` will see the points ``P``
    (N x 3, world): returns the shift that centres them on the layout focus and their on-screen
    width and height, in true perspective (near things are bigger than an orthographic guess)."""
    d = Vector(direction).normalized()
    right = (-d).cross(Vector((0, 0, 1))).normalized()
    up = right.cross(-d)
    axes = np.array([tuple(right), tuple(up)]).T
    dv = np.array(tuple(d))
    x0, y0, x1, y1 = ctx.art_rect
    shift = np.zeros(3)
    dist, width, height = None, 1.0, 1.0
    for _ in range(5):
        Q = P - shift
        k = 1.0 if dist is None else (dist / np.maximum(dist * 0.2, dist - Q @ dv))[:, None]
        S = (Q @ axes) * k
        lo, hi = S.min(0), S.max(0)
        mid = (lo + hi) / 2
        shift = shift + np.array(tuple(right)) * mid[0] + np.array(tuple(up)) * mid[1]
        width, height = float(hi[0] - lo[0]) * margin, float(hi[1] - lo[1]) * margin
        ppu = min((x1 - x0) * ctx.width * ctx.fill / width, (y1 - y0) * ctx.height * ctx.fill / height)
        dist = min(ctx.width, ctx.height) / (2.0 * ppu * math.tan(math.radians(fov) / 2))
    return Vector(shift), width, height


# ----------------------------------------------------------------------------- set: floor, sky, sun
class Stage:
    """Floor and backdrop that render at exactly the palette background (a size-1 toon lobe answers
    a light the same at any angle: no falloff, no horizon), a sun, a shadowless fill and a soft sky."""

    def __init__(self, ctx, sun_dir, fill_dir, angle=6.0, lift=0.35):
        self.ctx = ctx
        bg = C.col(ctx.palette['bg'])[:3]
        sky, warm = C.col(SKY)[:3], C.col(WARM)[:3]
        world = bpy.data.worlds.new('World')
        ctx.scene.world = world
        try:
            world.use_nodes = True
        except Exception:
            pass
        nt = world.node_tree
        nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputWorld')
        lp = nt.nodes.new('ShaderNodeLightPath')
        b_cam, b_sky = nt.nodes.new('ShaderNodeBackground'), nt.nodes.new('ShaderNodeBackground')
        b_cam.inputs['Color'].default_value = (*bg, 1.0)
        b_sky.inputs['Color'].default_value = (*sky, 1.0)
        b_sky.inputs['Strength'].default_value = AMB
        mx = nt.nodes.new('ShaderNodeMixShader')
        nt.links.new(lp.outputs['Is Camera Ray'], mx.inputs['Fac'])
        nt.links.new(b_sky.outputs[0], mx.inputs[1])
        nt.links.new(b_cam.outputs[0], mx.inputs[2])
        nt.links.new(mx.outputs[0], out.inputs[0])
        self.sun_dir = Vector(sun_dir).normalized()
        C.add_sun(tuple(self.sun_dir), strength=2 * math.pi * SUN, angle=angle, color=WARM)
        fill = C.add_sun(tuple(Vector(fill_dir).normalized()), strength=2 * math.pi * FILL, angle=20.0, color=SKY)
        for attr in ('use_shadow',):
            try:
                setattr(fill.data, attr, False)
            except Exception:
                pass
        try:
            fill.data.cycles.cast_shadow = False
        except Exception:
            pass

        mat = bpy.data.materials.new('Floor')
        try:
            mat.use_nodes = True
        except Exception:
            pass
        nt = mat.node_tree
        nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        em = nt.nodes.new('ShaderNodeEmission')
        em.inputs['Color'].default_value = (*[v * lift for v in bg], 1.0)
        tb = nt.nodes.new('ShaderNodeBsdfToon')
        tb.component = 'DIFFUSE'
        tb.inputs['Size'].default_value = 1.0
        tb.inputs['Smooth'].default_value = 0.0
        tb.inputs['Color'].default_value = (*[v * (1 - lift) / (AMB * s + SUN * w + FILL * s) for v, s, w in zip(bg, sky, warm)], 1.0)
        add = nt.nodes.new('ShaderNodeAddShader')
        nt.links.new(em.outputs[0], add.inputs[0])
        nt.links.new(tb.outputs[0], add.inputs[1])
        nt.links.new(add.outputs[0], out.inputs[0])
        self.floor = C.add_plane(800.0, mat, location=(0.0, 0.0, 0.0))
        self.floor_z = 0.0

    def fit(self, direction, fov, margin=1.04, shadow=0.5):
        """Centre what was built on the origin as the camera will see it; return its on-screen size."""
        ctx = self.ctx
        bpy.context.view_layer.update()
        sun = np.array(self.sun_dir)
        pts = []
        for ob in ctx.scene.objects:
            if ob.type not in ('MESH', 'CURVE') or ob is self.floor:
                continue
            bb = np.array([tuple(c) for c in ob.bound_box])
            mw = np.array(ob.matrix_world)
            P = bb @ mw[:3, :3].T + mw[:3, 3]
            pts.append(P)
            if shadow > 0:
                pts.append(P + sun * (shadow * (self.floor_z - P[:, 2:3]) / sun[2]))
        shift, width, height = _fit_view(ctx, np.concatenate(pts), direction, fov, margin)
        for ob in ctx.scene.objects:
            if ob.parent is None and ob.type in ('MESH', 'CURVE', 'EMPTY', 'LIGHT'):
                ob.location = ob.location - shift
        return width, height


# ----------------------------------------------------------------------------- kit of parts
def _mixw(h, t):
    return C.mix_hex(h, '#ffffff', t)


def _mixk(h, t):
    return C.mix_hex(h, '#1c1a24', t)


class Kit:
    """Bevelled primitives placed by the centre of their base (x, y, z of the underside)."""

    def __init__(self, ctx):
        self.ctx, self.rng = ctx, ctx.rng
        self.dark = ctx.dark
        self._mats = {}

    def mat(self, colour, rough=0.62, glow=0.0):
        key = (colour, rough, glow)
        if key not in self._mats:
            kw = dict(emission=colour, emission_strength=glow) if glow else {}
            self._mats[key] = C.material('Matte', colour, roughness=rough, specular=0.25, **kw)
        return self._mats[key]

    def box(self, sx, sy, sz, x, y, z, colour, bevel=BEV, rz=0.0, glow=0.0, rx=0.0, ry=0.0):
        b = min(bevel, 0.42 * min(sx, sy, sz))
        return C.add_box((sx, sy, sz), b, self.mat(colour, glow=glow), segments=3, location=(x, y, z + sz / 2), rotation=(rx, ry, rz))

    def cyl(self, r, h, x, y, z, colour, bevel=BEV, glow=0.0, rx=0.0, ry=0.0, segments=48):
        prof = C.fillet_profile([(0, -h / 2), (r, -h / 2), (r, h / 2), (0, h / 2)], min(bevel, 0.42 * min(r, h)), steps=4)
        return C.add_lathe(prof, self.mat(colour, glow=glow), segments=segments, name='Cyl', location=(x, y, z + h / 2), rotation=(rx, ry, 0.0))

    def cone(self, r0, r1, h, x, y, z, colour, bevel=BEV, glow=0.0, rx=0.0, ry=0.0, segments=48):
        pts = [(0, -h / 2), (r0, -h / 2), (r1, h / 2), (0, h / 2)] if r1 > 1e-4 else [(0, -h / 2), (r0, -h / 2), (0, h / 2)]
        prof = C.fillet_profile(pts, min(bevel, 0.3 * r0), steps=4)
        return C.add_lathe(prof, self.mat(colour, glow=glow), segments=segments, name='Cone', location=(x, y, z + h / 2), rotation=(rx, ry, 0.0))

    def ball(self, r, x, y, z, colour, glow=0.0, scale=(1, 1, 1)):
        return C.add_sphere(r, self.mat(colour, glow=glow), segments=32, location=(x, y, z), scale=scale)

    def slab(self, w, d, colour, radius=0.26, t=T):
        """The rounded base everything stands on."""
        pts = []
        for cx, cy, a0 in ((w / 2 - radius, d / 2 - radius, 0), (-w / 2 + radius, d / 2 - radius, 90), (-w / 2 + radius, -d / 2 + radius, 180), (w / 2 - radius, -d / 2 + radius, 270)):
            for i in range(13):
                a = math.radians(a0 + 90 * i / 12)
                pts.append((cx + radius * math.cos(a), cy + radius * math.sin(a)))
        ob = C.add_extrusion(pts, t, 0.03, self.mat(colour), name='Slab', location=(0, 0, t / 2), rotation=(math.radians(90), 0, 0))
        return ob

    # -- recurring props -----------------------------------------------------------
    def plant(self, x, y, z, s, pot, leaf, kind='bush'):
        self.cone(0.075 * s, 0.1 * s, 0.16 * s, x, y, z, pot, bevel=0.012)
        if kind == 'bush':
            for dx, dy, dz, r in ((0, 0, 0.3, 0.14), (-0.08, 0.04, 0.22, 0.1), (0.08, -0.03, 0.23, 0.105), (0.02, 0.07, 0.36, 0.085)):
                self.ball(r * s, x + dx * s, y + dy * s, z + dz * s, leaf if dz < 0.3 else _mixw(leaf, 0.12))
        else:                                                     # tall leaves
            for i in range(7):
                a = math.tau * i / 7 + 0.3
                tilt = 0.5 if i % 2 else 0.25
                ln = (0.34 if i % 2 else 0.46) * s
                ob = C.add_icosphere(0.5, 3, self.mat(leaf if i % 2 else _mixw(leaf, 0.14)), scale=(0.11 * s, 0.03 * s, ln))
                d = Vector((math.cos(a) * math.sin(tilt), math.sin(a) * math.sin(tilt), math.cos(tilt)))
                ob.location = Vector((x, y, z + 0.14 * s)) + d * (ln * 0.48)
                ob.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()

    def tree(self, x, y, z, s, trunk, leaf):
        self.cyl(0.035 * s, 0.4 * s, x, y, z, trunk, bevel=0.008)
        for dx, dy, dz, r in ((0, 0, 0.6, 0.23), (-0.14, 0.05, 0.47, 0.16), (0.13, -0.06, 0.5, 0.17), (0.02, 0.1, 0.78, 0.14)):
            self.ball(r * s, x + dx * s, y + dy * s, z + dz * s, leaf if dz < 0.6 else _mixw(leaf, 0.14))

    def person(self, x, y, z, colour, skin, s=1.0):
        self.cyl(0.05 * s, 0.17 * s, x, y, z, colour, bevel=0.04 * s, segments=24)
        self.ball(0.043 * s, x, y, z + 0.215 * s, skin)

    def books(self, x, y, z, colours, along='x', n=5):
        p = 0.0
        for i in range(n):
            w = self.rng.uniform(0.03, 0.05)
            h = self.rng.uniform(0.15, 0.21)
            col = colours[i % len(colours)]
            if along == 'x':
                self.box(w, 0.13, h, x + p + w / 2, y, z, col, bevel=0.005)
            else:
                self.box(0.13, w, h, x, y + p + w / 2, z, col, bevel=0.005)
            p += w + 0.004
        return p


# ----------------------------------------------------------------------------- motif: cosy room
def room(K, pal, accent):
    wall, floor, wood, cool, leaf = pal
    dark = K.dark
    rng = K.rng
    white = _mixw(wall, 0.82)
    lamp_glow = 6.0 if dark else 0.0
    W = 3.0
    K.slab(W + 0.16, W + 0.16, _mixk(floor, 0.12))
    K.box(W, W, 0.04, 0, 0, T - 0.01, floor, bevel=0.01)
    z0 = T + 0.03
    # two walls
    H = 1.75
    K.box(0.1, W, H, -W / 2 + 0.05, 0, z0 - 0.03, wall)
    K.box(W - 0.1, 0.1, H, 0.05, W / 2 - 0.05, z0 - 0.03, _mixw(wall, 0.14))
    K.box(0.02, W - 0.1, 0.07, -W / 2 + 0.11, -0.05, z0, white, bevel=0.006)
    K.box(W - 0.12, 0.02, 0.07, 0.06, W / 2 - 0.11, z0, white, bevel=0.006)
    # rug
    K.box(1.55, 1.15, 0.018, 0.3, -0.45, z0, _mixw(accent, 0.55), bevel=0.008)
    K.box(1.33, 0.93, 0.02, 0.3, -0.45, z0, _mixw(accent, 0.78), bevel=0.008)

    # sofa along the left wall
    sx, sy = -1.02, -0.45
    sofa = cool
    for dy in (-0.62, 0.62):
        for dx in (-0.25, 0.25):
            K.cyl(0.025, 0.07, sx + dx, sy + dy, z0, wood, bevel=0.005, segments=16)
    K.box(0.7, 1.5, 0.22, sx, sy, z0 + 0.06, sofa, bevel=0.03)
    K.box(0.17, 1.5, 0.5, sx - 0.265, sy, z0 + 0.2, sofa, bevel=0.04)
    for dy in (-0.68, 0.68):
        K.box(0.7, 0.15, 0.34, sx, sy + dy, z0 + 0.14, sofa, bevel=0.04)
    for dy in (-0.31, 0.31):
        K.box(0.5, 0.58, 0.1, sx + 0.08, sy + dy, z0 + 0.27, _mixw(sofa, 0.16), bevel=0.04)
    K.box(0.22, 0.24, 0.1, sx - 0.1, sy - 0.38, z0 + 0.4, accent, bevel=0.04, rz=0.3, ry=-0.9)
    K.box(0.2, 0.22, 0.1, sx - 0.1, sy + 0.3, z0 + 0.4, _mixw(leaf, 0.3), bevel=0.04, rz=-0.2, ry=-0.9)
    # shelf with books above the sofa, two frames
    K.box(0.17, 1.05, 0.035, -1.31, sy, z0 + 1.18, wood, bevel=0.008)
    K.books(-1.32, sy - 0.46, z0 + 1.215, [accent, cool, _mixw(wood, 0.3), leaf, white], along='y', n=6)
    K.plant(-1.31, sy + 0.36, z0 + 1.215, 0.55, white, leaf)
    K.box(0.025, 0.36, 0.46, -1.385, 0.86, z0 + 0.95, wood, bevel=0.006)
    K.box(0.02, 0.29, 0.39, -1.377, 0.86, z0 + 0.985, white, bevel=0.003)
    K.cyl(0.085, 0.02, -1.365, 0.86, z0 + 1.18, accent, bevel=0.003, ry=math.radians(90), segments=32)
    K.box(0.02, 0.2, 0.05, -1.366, 0.86, z0 + 1.03, cool, bevel=0.003)
    # floor lamp by the sofa
    lx, ly = -1.18, -1.34
    K.cyl(0.1, 0.025, lx, ly, z0, wood, bevel=0.008)
    K.cyl(0.013, 1.08, lx, ly, z0 + 0.02, wood, bevel=0.004, segments=12)
    K.cone(0.15, 0.09, 0.2, lx, ly, z0 + 1.05, _mixw(accent, 0.25), bevel=0.01, glow=lamp_glow * 0.25)
    if dark:
        C.add_point_light((lx, ly, z0 + 1.0), energy=22.0, color=C.mix_hex(accent, '#ffd9a0', 0.6), radius=0.06)

    # desk along the back wall, with a window above it
    dx_, dy_ = 0.55, 1.1
    K.box(1.3, 0.56, 0.045, dx_, dy_, z0 + 0.6, wood, bevel=0.01)
    for ox in (-0.6, 0.6):
        K.box(0.04, 0.5, 0.6, dx_ + ox, dy_, z0, _mixk(wood, 0.12), bevel=0.006)
    K.box(0.34, 0.48, 0.34, dx_ + 0.4, dy_, z0 + 0.26, _mixw(wood, 0.2), bevel=0.01)
    K.box(0.3, 0.012, 0.13, dx_ + 0.4, dy_ - 0.245, z0 + 0.3, _mixw(wood, 0.36), bevel=0.004)
    K.box(0.3, 0.012, 0.13, dx_ + 0.4, dy_ - 0.245, z0 + 0.45, _mixw(wood, 0.36), bevel=0.004)
    top = z0 + 0.645
    K.box(0.2, 0.13, 0.014, dx_ - 0.1, dy_ + 0.1, top, _mixk(cool, 0.55), bevel=0.005)
    K.box(0.03, 0.03, 0.14, dx_ - 0.1, dy_ + 0.12, top, _mixk(cool, 0.55), bevel=0.005)
    K.box(0.54, 0.03, 0.33, dx_ - 0.1, dy_ + 0.1, top + 0.1, _mixk(cool, 0.55), bevel=0.008)
    K.box(0.49, 0.012, 0.28, dx_ - 0.1, dy_ + 0.083, top + 0.125, _mixw(cool, 0.45), bevel=0.003, glow=1.6 if dark else 0.0)
    K.box(0.32, 0.11, 0.014, dx_ - 0.1, dy_ - 0.1, top, white, bevel=0.005)
    K.cyl(0.035, 0.075, dx_ - 0.44, dy_ - 0.08, top, accent, bevel=0.008, segments=24)
    K.cyl(0.07, 0.016, dx_ + 0.4, dy_ + 0.08, top, accent, bevel=0.005, segments=24)                 # desk lamp
    K.cyl(0.01, 0.26, dx_ + 0.4, dy_ + 0.08, top, accent, bevel=0.003, segments=12)
    K.cone(0.085, 0.035, 0.09, dx_ + 0.36, dy_ + 0.05, top + 0.24, accent, bevel=0.006, ry=math.radians(-28), glow=lamp_glow * 0.1)
    K.books(dx_ + 0.22, dy_ - 0.14, top, [leaf, white, accent], along='x', n=3)
    # chair
    cx, cy = dx_ - 0.1, dy_ - 0.52
    K.cyl(0.15, 0.025, cx, cy, z0, _mixk(cool, 0.5), bevel=0.008)
    K.cyl(0.02, 0.3, cx, cy, z0 + 0.02, _mixk(cool, 0.5), bevel=0.004, segments=12)
    K.box(0.36, 0.36, 0.06, cx, cy, z0 + 0.32, accent, bevel=0.025)
    K.box(0.34, 0.05, 0.36, cx, cy - 0.17, z0 + 0.4, accent, bevel=0.025)
    # window
    wx, wz = dx_ - 0.1, z0 + 0.92
    K.box(1.02, 0.03, 0.74, wx, W / 2 - 0.105, wz, white, bevel=0.008)
    sky = _mixw(cool, 0.62) if not dark else _mixk(cool, 0.45)
    K.box(0.92, 0.012, 0.64, wx, W / 2 - 0.122, wz + 0.05, sky, bevel=0.004, glow=0.0)
    K.box(0.025, 0.02, 0.64, wx, W / 2 - 0.128, wz + 0.05, white, bevel=0.004)
    K.box(0.92, 0.02, 0.025, wx, W / 2 - 0.128, wz + 0.36, white, bevel=0.004)
    K.box(1.1, 0.09, 0.03, wx, W / 2 - 0.14, wz - 0.02, white, bevel=0.008)
    K.plant(wx + 0.38, W / 2 - 0.15, wz + 0.01, 0.5, accent, leaf)
    # wall clock
    K.cyl(0.13, 0.03, -0.42, W / 2 - 0.115, z0 + 1.2, white, bevel=0.008, rx=math.radians(90))
    K.cyl(0.105, 0.012, -0.42, W / 2 - 0.132, z0 + 1.225, _mixw(wall, 0.5), bevel=0.003, rx=math.radians(90))
    K.box(0.014, 0.012, 0.08, -0.42, W / 2 - 0.142, z0 + 1.33, _mixk(wood, 0.5), bevel=0.003)
    K.box(0.06, 0.012, 0.014, -0.39, W / 2 - 0.142, z0 + 1.323, accent, bevel=0.003)
    # bookcase in the corner
    bx, by = -1.02, 1.22
    case = _mixw(wood, 0.12)
    K.box(0.62, 0.3, 1.3, bx, by + 0.02, z0, _mixk(case, 0.18), bevel=0.01)
    for ox in (-0.3, 0.3):
        K.box(0.03, 0.34, 1.32, bx + ox, by, z0, case, bevel=0.006)
    for i in range(5):
        K.box(0.6, 0.34, 0.03, bx, by, z0 + 0.32 * i + (0.0 if i else 0.0), case, bevel=0.006)
    cols = [accent, cool, leaf, white, _mixw(accent, 0.4), _mixk(cool, 0.3)]
    for i in range(4):
        rng.shuffle(cols)
        if i == 2:
            K.books(bx - 0.26, by - 0.08, z0 + 0.03 + 0.32 * i, cols, along='x', n=4)
            K.plant(bx + 0.14, by - 0.06, z0 + 0.03 + 0.32 * i, 0.5, white, leaf)
        else:
            K.books(bx - 0.26, by - 0.08, z0 + 0.03 + 0.32 * i, cols, along='x', n=rng.choice((7, 9, 10)))
    K.box(0.2, 0.16, 0.1, bx - 0.12, by - 0.05, z0 + 1.32, accent, bevel=0.01)
    K.ball(0.09, bx + 0.14, by - 0.04, z0 + 1.41, _mixw(cool, 0.3))
    # big floor plant, coffee table, pouf, a cat
    K.plant(-1.14, 0.56, z0, 1.75, white, leaf, kind='tall')
    tx, ty = 0.28, -0.42
    K.cyl(0.3, 0.035, tx, ty, z0 + 0.24, _mixw(wood, 0.25), bevel=0.012)
    for a in (0.5, 2.6, 4.7):
        K.cyl(0.018, 0.24, tx + 0.2 * math.cos(a), ty + 0.2 * math.sin(a), z0, wood, bevel=0.004, segments=12)
    K.cyl(0.04, 0.07, tx - 0.1, ty + 0.06, z0 + 0.275, white, bevel=0.008, segments=24)
    K.box(0.2, 0.15, 0.028, tx + 0.08, ty - 0.07, z0 + 0.275, cool, bevel=0.006, rz=0.4)
    K.box(0.18, 0.13, 0.024, tx + 0.08, ty - 0.07, z0 + 0.303, accent, bevel=0.006, rz=0.1)
    K.cyl(0.2, 0.2, 0.95, -0.95, z0, _mixw(leaf, 0.25), bevel=0.06)
    catc = _mixk(wood, 0.55) if not dark else white
    kx, ky = 0.72, -0.2
    K.ball(0.1, kx, ky, z0 + 0.085, catc, scale=(1.35, 0.9, 0.85))
    K.ball(0.065, kx + 0.13, ky - 0.03, z0 + 0.15, catc)
    for e in (-0.035, 0.035):
        K.cone(0.025, 0.0, 0.05, kx + 0.13, ky - 0.03 + e, z0 + 0.195, catc, bevel=0.0, segments=12)
    K.cyl(0.016, 0.2, kx - 0.2, ky + 0.02, z0 + 0.03, catc, bevel=0.012, rx=math.radians(75), segments=12)
    return 0.45


# ----------------------------------------------------------------------------- motif: cafe front
def shop(K, pal, accent):
    wall, ground, wood, cool, leaf = pal
    dark = K.dark
    white = _mixw(wall, 0.85)
    W, D = 3.1, 2.8
    K.slab(W, D, ground)
    z0 = T
    K.box(W - 0.3, 0.5, 0.012, 0, -D / 2 + 0.38, z0 - 0.004, _mixk(ground, 0.1), bevel=0.004)     # kerb strip
    # the building
    bx, by, bw, bd, bh = -0.32, 0.55, 2.05, 1.3, 1.6
    fy = by - bd / 2                                           # facade plane
    K.box(bw, bd, bh, bx, by, z0, wall, bevel=0.02)
    K.box(bw + 0.08, bd + 0.08, 0.1, bx, by, z0 + bh, white, bevel=0.02)
    K.box(bw - 0.1, bd - 0.1, 0.04, bx, by, z0 + bh + 0.08, _mixk(wall, 0.25), bevel=0.01)
    K.box(bw + 0.02, 0.03, 0.16, bx, fy - 0.01, z0, _mixk(wall, 0.3), bevel=0.008)
    K.box(0.03, bd + 0.02, 0.16, bx + bw / 2 + 0.01, by, z0, _mixk(wall, 0.3), bevel=0.008)
    lit = 2.4 if dark else 0.0
    glass = _mixw(cool, 0.18) if not dark else C.mix_hex(accent, '#ffd58a', 0.75)
    lit = lit or 0.35
    # shop window
    wx = bx - 0.42
    K.box(1.02, 0.04, 0.78, wx, fy - 0.015, z0 + 0.34, white, bevel=0.01)
    K.box(0.92, 0.02, 0.68, wx, fy - 0.035, z0 + 0.39, glass, bevel=0.004, glow=lit)
    K.box(0.025, 0.03, 0.68, wx, fy - 0.04, z0 + 0.39, white, bevel=0.004)
    K.box(1.1, 0.12, 0.035, wx, fy - 0.06, z0 + 0.31, white, bevel=0.01)
    K.box(0.9, 0.11, 0.09, wx, fy - 0.075, z0 + 0.2, wood, bevel=0.012)                             # flower box
    for i in range(7):
        K.ball(0.062, wx - 0.38 + 0.127 * i, fy - 0.08, z0 + 0.31, leaf if i % 3 else accent)
    # door
    dx_ = bx + 0.6
    K.box(0.5, 0.04, 0.98, dx_, fy - 0.015, z0, white, bevel=0.01)
    K.box(0.4, 0.03, 0.9, dx_, fy - 0.035, z0 + 0.02, wood, bevel=0.008)
    K.box(0.26, 0.02, 0.36, dx_, fy - 0.05, z0 + 0.46, glass, bevel=0.004, glow=lit)
    K.ball(0.022, dx_ + 0.14, fy - 0.07, z0 + 0.42, accent)
    K.box(0.62, 0.22, 0.045, dx_, fy - 0.12, z0, _mixk(ground, 0.18), bevel=0.01)
    # striped awning over window and door
    n, aw = 9, 1.86
    for i in range(n):
        K.box(aw / n + 0.002, 0.52, 0.035, bx - 0.02 - aw / 2 + aw / n * (i + 0.5), fy - 0.23, z0 + 1.1, accent if i % 2 == 0 else white, bevel=0.006, rx=math.radians(24))
        K.box(aw / n + 0.002, 0.03, 0.09, bx - 0.02 - aw / 2 + aw / n * (i + 0.5), fy - 0.47, z0 + 0.95, accent if i % 2 == 0 else white, bevel=0.006)
    # sign: a board with a cup pictogram and two bars for lettering
    K.box(1.2, 0.05, 0.27, bx - 0.02, fy - 0.02, z0 + 1.27, _mixk(wood, 0.35), bevel=0.012)
    K.cyl(0.07, 0.02, bx - 0.45, fy - 0.05, z0 + 1.335, white, bevel=0.004, rx=math.radians(90), segments=32)
    K.box(0.42, 0.02, 0.05, bx + 0.02, fy - 0.05, z0 + 1.42, white, bevel=0.004)
    K.box(0.28, 0.02, 0.035, bx - 0.05, fy - 0.05, z0 + 1.34, accent, bevel=0.004)
    # side wall: round window, a pipe; roof: a big cup as the shop sign, an AC unit, planters
    sxw = bx + bw / 2
    K.cyl(0.2, 0.04, sxw + 0.0, by + 0.1, z0 + 0.82, white, bevel=0.01, ry=math.radians(90))
    K.cyl(0.16, 0.05, sxw + 0.0, by + 0.1, z0 + 0.86, glass, bevel=0.006, ry=math.radians(90), glow=lit)
    K.cyl(0.022, bh - 0.05, sxw + 0.03, by - 0.5, z0, _mixk(wall, 0.3), bevel=0.004, segments=12)
    rz_ = z0 + bh + 0.12
    K.cyl(0.24, 0.03, bx - 0.5, by + 0.05, rz_, white, bevel=0.01)
    K.cone(0.13, 0.19, 0.25, bx - 0.5, by + 0.05, rz_ + 0.03, accent, bevel=0.015)
    K.cyl(0.165, 0.012, bx - 0.5, by + 0.05, rz_ + 0.262, _mixk(wood, 0.5), bevel=0.003)
    C.add_torus(0.085, 0.024, K.mat(accent), major_segments=32, minor_segments=12, location=(bx - 0.5 + 0.2, by + 0.05, rz_ + 0.16), rotation=(math.radians(90), 0, 0))
    K.box(0.34, 0.26, 0.2, bx + 0.55, by + 0.3, rz_, _mixw(cool, 0.5), bevel=0.012)
    K.cyl(0.08, 0.012, bx + 0.55, by + 0.3, rz_ + 0.2, _mixk(cool, 0.4), bevel=0.003, segments=24)
    K.box(0.5, 0.14, 0.1, bx + 0.3, by - 0.45, rz_, wood, bevel=0.01)
    for i in range(4):
        K.ball(0.07, bx + 0.12 + 0.12 * i, by - 0.45, rz_ + 0.12, leaf)
    # terrace: two tables with stools, a parasol
    for (tx, ty, par) in ((-1.14, -0.92, True), (-0.3, -0.95, False)):
        K.cyl(0.11, 0.02, tx, ty, z0, _mixk(wood, 0.3), bevel=0.006, segments=24)
        K.cyl(0.014, 0.34, tx, ty, z0 + 0.01, _mixk(wood, 0.3), bevel=0.004, segments=12)
        K.cyl(0.19, 0.025, tx, ty, z0 + 0.34, white, bevel=0.008)
        K.cyl(0.028, 0.05, tx - 0.06, ty + 0.03, z0 + 0.365, accent, bevel=0.006, segments=16)
        K.cyl(0.028, 0.05, tx + 0.07, ty - 0.04, z0 + 0.365, cool, bevel=0.006, segments=16)
        for a in (0.6, 3.7) if par else (1.9, 5.0):
            px, py = tx + 0.31 * math.cos(a), ty + 0.31 * math.sin(a)
            K.cyl(0.085, 0.03, px, py, z0 + 0.2, wood, bevel=0.01, segments=24)
            K.cyl(0.012, 0.2, px, py, z0, _mixk(wood, 0.3), bevel=0.003, segments=12)
            K.cyl(0.06, 0.012, px, py, z0, _mixk(wood, 0.3), bevel=0.003, segments=16)
        if par:
            K.cyl(0.012, 0.78, tx, ty, z0 + 0.36, white, bevel=0.003, segments=12)
            K.cone(0.42, 0.03, 0.17, tx, ty, z0 + 1.05, _mixw(cool, 0.1), bevel=0.012)
            K.ball(0.025, tx, ty, z0 + 1.23, white)
    # planters by the door, a menu board, a mailbox
    for px in (dx_ - 0.36, dx_ + 0.36):
        K.plant(px, fy - 0.16, z0, 1.05, white, leaf)
    mx, my = 0.5, -0.78
    K.box(0.26, 0.02, 0.4, mx, my, z0, _mixk(wood, 0.4), bevel=0.006, rx=math.radians(-14))
    K.box(0.26, 0.02, 0.4, mx, my + 0.1, z0, _mixk(wood, 0.4), bevel=0.006, rx=math.radians(14))
    K.box(0.16, 0.012, 0.03, mx, my - 0.038, z0 + 0.27, white, bevel=0.003, rx=math.radians(-14))
    K.box(0.12, 0.012, 0.03, mx - 0.02, my - 0.027, z0 + 0.2, accent, bevel=0.003, rx=math.radians(-14))
    K.box(0.16, 0.012, 0.03, mx, my - 0.016, z0 + 0.13, white, bevel=0.003, rx=math.radians(-14))
    # tree, street lamp, bench at the open end
    K.box(0.42, 0.42, 0.03, 1.12, 0.62, z0 - 0.01, _mixk(wood, 0.5), bevel=0.008)
    K.tree(1.12, 0.62, z0, 1.75, _mixk(wood, 0.25), leaf)
    lx, ly = 1.25, -1.05
    K.cyl(0.07, 0.04, lx, ly, z0, _mixk(cool, 0.6), bevel=0.01, segments=24)
    K.cyl(0.018, 1.25, lx, ly, z0 + 0.02, _mixk(cool, 0.6), bevel=0.004, segments=12)
    K.cyl(0.085, 0.02, lx, ly, z0 + 1.25, _mixk(cool, 0.6), bevel=0.006, segments=24)
    K.ball(0.075, lx, ly, z0 + 1.2, C.mix_hex(accent, '#fff3c8', 0.8), glow=5.0 if dark else 0.0)
    if dark:
        C.add_point_light((lx, ly, z0 + 1.12), energy=14.0, color='#ffd9a0', radius=0.07)
        C.add_point_light((wx, fy - 0.5, z0 + 0.6), energy=10.0, color='#ffd9a0', radius=0.2)
    K.box(0.5, 0.17, 0.035, 1.12, -0.2, z0 + 0.18, wood, bevel=0.01)
    for ox in (-0.2, 0.2):
        K.box(0.03, 0.15, 0.18, 1.12 + ox, -0.2, z0, _mixk(wood, 0.3), bevel=0.006)
    K.person(0.22, -0.42, z0, cool, _mixw(wood, 0.5))
    K.person(-0.72, -0.62, z0, accent, _mixw(wood, 0.55), 0.95)
    return 0.4


# ----------------------------------------------------------------------------- motif: festival stage
def stage(K, pal, accent):
    wall, ground, wood, cool, leaf = pal
    dark = K.dark
    rng = K.rng
    white = _mixw(wall, 0.85)
    metal = _mixk(cool, 0.62)
    black = _mixk(wood, 0.72)
    W, D = 3.2, 2.8
    K.slab(W, D, ground)
    z0 = T
    # deck
    sy, sw, sd, sh = 0.42, 2.3, 1.3, 0.3
    K.box(sw, sd, sh, 0, sy, z0, _mixk(wood, 0.2), bevel=0.02)
    K.box(sw + 0.04, sd + 0.04, 0.035, 0, sy, z0 + sh - 0.005, wood, bevel=0.012)
    K.box(sw - 0.3, 0.012, 0.12, 0, sy - sd / 2 - 0.004, z0 + 0.09, accent, bevel=0.004)
    for i in range(2):
        K.box(0.3, 0.2 * (2 - i), 0.1, sw / 2 + 0.17, sy - 0.3 + 0.1 * i, z0 + 0.1 * i, _mixk(wood, 0.1), bevel=0.01)
    zd = z0 + sh + 0.03
    # truss towers, beams and a canopy
    th = 1.5
    for ox in (-sw / 2 + 0.07, sw / 2 - 0.07):
        for oy in (-sd / 2 + 0.07, sd / 2 - 0.07):
            K.box(0.07, 0.07, th, ox, sy + oy, zd, metal, bevel=0.008)
    for oy in (-sd / 2 + 0.07, sd / 2 - 0.07):
        K.box(sw - 0.07, 0.06, 0.06, 0, sy + oy, zd + th - 0.03, metal, bevel=0.008)
    for ox in (-sw / 2 + 0.07, sw / 2 - 0.07):
        K.box(0.06, sd - 0.07, 0.06, ox, sy, zd + th - 0.03, metal, bevel=0.008)
    K.box(sw + 0.3, sd + 0.25, 0.05, 0, sy, zd + th + 0.1, wall, bevel=0.02, rx=math.radians(-7))
    K.box(sw + 0.3, 0.03, 0.12, 0, sy - sd / 2 - 0.12, zd + th + 0.115, white, bevel=0.008)
    # screen at the back: a few flat shapes, lit at night
    scr_y = sy + sd / 2 - 0.16
    g = 2.0 if dark else 0.0
    K.box(1.86, 0.06, 1.08, 0, scr_y, zd + 0.2, black, bevel=0.01)
    K.box(1.76, 0.02, 0.98, 0, scr_y - 0.03, zd + 0.25, _mixw(cool, 0.2), bevel=0.004, glow=g * 0.6)
    K.cyl(0.3, 0.02, -0.3, scr_y - 0.045, zd + 0.48, _mixw(accent, 0.1), bevel=0.004, rx=math.radians(90), glow=g)
    K.box(0.5, 0.02, 0.98, 0.6, scr_y - 0.04, zd + 0.25, wall, bevel=0.004, glow=g * 0.6)
    K.box(1.76, 0.02, 0.2, 0, scr_y - 0.045, zd + 0.25, _mixk(cool, 0.25), bevel=0.004, glow=g * 0.4)
    # lights on the front beam
    for i, col in enumerate((accent, white, cool, white, accent)):
        lx = -0.84 + 0.42 * i
        K.box(0.02, 0.02, 0.07, lx, sy - sd / 2 + 0.07, zd + th - 0.1, metal, bevel=0.004)
        K.cyl(0.055, 0.12, lx, sy - sd / 2 + 0.09, zd + th - 0.21, black, bevel=0.012, rx=math.radians(28), segments=24)
        K.cyl(0.045, 0.012, lx, sy - sd / 2 + 0.12, zd + th - 0.215, C.mix_hex(col, '#ffffff', 0.25), bevel=0.003, rx=math.radians(28), segments=24, glow=7.0 if dark else 0.6)
    if dark:
        wash = C.add_area_light((0, sy - 0.3, zd + th - 0.3), energy=60.0, size=1.6, color=C.mix_hex(accent, '#ffffff', 0.5), target=(0, sy, zd))
        try:
            wash.visible_camera = False
        except Exception:
            pass
    # speaker stacks on the ground at both sides
    for sx in (-sw / 2 - 0.3, sw / 2 + 0.3):
        for i in range(2):
            K.box(0.36, 0.34, 0.42, sx, sy - 0.25, z0 + 0.43 * i, black, bevel=0.014)
            fyy = sy - 0.25 - 0.17
            K.cyl(0.11, 0.02, sx, fyy - 0.004, z0 + 0.43 * i + 0.23, _mixw(black, 0.22), bevel=0.004, rx=math.radians(90), segments=32)
            K.cyl(0.045, 0.02, sx, fyy - 0.004, z0 + 0.43 * i + 0.05, _mixw(black, 0.22), bevel=0.004, rx=math.radians(90), segments=24)
        K.box(0.4, 0.38, 0.03, sx, sy - 0.25, z0 + 0.86, accent, bevel=0.01)
    # drum kit on a riser
    K.box(0.86, 0.6, 0.08, 0.0, sy + 0.1, zd, black, bevel=0.012)
    zr = zd + 0.08
    K.cyl(0.17, 0.2, 0.0, sy + 0.02, zr + 0.01, accent, bevel=0.012, rx=math.radians(90))
    K.cyl(0.145, 0.012, 0.0, sy - 0.085, zr + 0.105, white, bevel=0.003, rx=math.radians(90))
    for (ox, oy, r, h, zz) in ((-0.2, -0.02, 0.075, 0.07, 0.26), (0.2, -0.02, 0.08, 0.08, 0.26), (0.3, 0.16, 0.1, 0.16, 0.12)):
        K.cyl(0.012, zz, ox, sy + 0.1 + oy, zr, metal, bevel=0.003, segments=12)
        K.cyl(r, h, ox, sy + 0.1 + oy, zr + zz, accent, bevel=0.008, segments=32)
        K.cyl(r - 0.008, 0.008, ox, sy + 0.1 + oy, zr + zz + h - 0.002, white, bevel=0.002, segments=32)
    gold = C.mix_hex(accent, '#f2c45a', 0.75)
    for (ox, oy, zz) in ((-0.36, 0.1, 0.5), (0.4, -0.05, 0.56)):
        K.cyl(0.01, zz, ox, sy + 0.1 + oy, zr, metal, bevel=0.003, segments=12)
        K.cyl(0.12, 0.012, ox, sy + 0.1 + oy, zr + zz, gold, bevel=0.004, segments=32, ry=math.radians(8))
    K.cyl(0.07, 0.03, 0.0, sy + 0.3, zr + 0.2, black, bevel=0.01, segments=24)
    K.cyl(0.012, 0.2, 0.0, sy + 0.3, zr, metal, bevel=0.003, segments=12)
    # front line: mic, amps, keyboard, wedges
    K.cyl(0.07, 0.014, 0.0, sy - 0.42, zd, metal, bevel=0.004, segments=24)
    K.cyl(0.009, 0.52, 0.0, sy - 0.42, zd, metal, bevel=0.003, segments=12)
    K.cyl(0.02, 0.07, 0.0, sy - 0.44, zd + 0.5, black, bevel=0.01, rx=math.radians(60), segments=16)
    for ax in (-0.62, 0.66):
        K.box(0.3, 0.2, 0.3, ax, sy + 0.3, zd, _mixk(wood, 0.5), bevel=0.012)
        K.box(0.25, 0.012, 0.18, ax, sy + 0.195, zd + 0.03, _mixw(wood, 0.35), bevel=0.004)
        K.box(0.25, 0.012, 0.035, ax, sy + 0.195, zd + 0.235, accent, bevel=0.004)
    kx, ky = -0.72, sy - 0.2
    K.box(0.5, 0.17, 0.035, kx, ky, zd + 0.3, black, bevel=0.008)
    K.box(0.46, 0.09, 0.012, kx, ky - 0.03, zd + 0.33, white, bevel=0.003)
    for ox in (-0.14, 0.14):
        K.box(0.02, 0.02, 0.36, kx + ox, ky, zd, metal, bevel=0.004, ry=math.radians(18 if ox < 0 else -18))
    for wx in (-0.3, 0.35):
        K.box(0.22, 0.16, 0.09, wx, sy - sd / 2 + 0.14, zd, black, bevel=0.012, rx=math.radians(-18))
    # performers
    skin = _mixw(wood, 0.5)
    K.person(0.0, sy - 0.3, zd, accent, skin, 1.25)
    K.person(kx + 0.05, ky + 0.16, zd, cool, skin, 1.25)
    K.person(0.62, sy - 0.12, zd, white, skin, 1.25)
    K.person(0.0, sy + 0.3, zr + 0.2, wall, skin, 1.1)
    # the crowd, a barrier, flags
    crowd = [accent, cool, wall, white, leaf, _mixw(accent, 0.4), _mixk(cool, 0.2)]
    placed = []
    while len(placed) < 15:
        x, y = rng.uniform(-1.2, 1.2), rng.uniform(-1.22, -0.72)
        if all(math.hypot(x - a, y - b) > 0.14 for a, b in placed):
            placed.append((x, y))
            K.person(x, y, z0, crowd[len(placed) % len(crowd)], skin, rng.uniform(0.92, 1.1))
    for i in range(5):
        bx = -1.0 + 0.5 * i
        K.box(0.46, 0.02, 0.03, bx, -0.52, z0 + 0.2, metal, bevel=0.006)
        K.box(0.46, 0.02, 0.03, bx, -0.52, z0 + 0.09, metal, bevel=0.006)
        for ox in (-0.21, 0.21):
            K.box(0.02, 0.02, 0.24, bx + ox, -0.52, z0, metal, bevel=0.005)
    for (fx, fy_, col) in ((-1.42, -1.18, accent), (1.42, -1.18, cool), (-1.42, 1.15, cool), (1.42, 1.15, accent)):
        K.cyl(0.014, 0.9, fx, fy_, z0, white, bevel=0.004, segments=12)
        C.add_extrusion([(0.0, 0.0), (0.26, 0.07), (0.0, 0.15)], 0.012, 0.0, K.mat(col), name='Flag', location=(fx + 0.012, fy_, z0 + 0.74))
    return 0.4


MOTIFS = {'room': room, 'shop': shop, 'stage': stage}


def build(ctx):
    flip = -1.0 if ctx.mirror else 1.0
    p = ctx.params
    ctx.set_view('Standard')
    cy = ctx.scene.cycles
    try:
        cy.max_bounces, cy.diffuse_bounces, cy.glossy_bounces = 4, 2, 1
        cy.adaptive_min_samples = 16
    except Exception:
        pass
    # screen-right r = (1, 1), depth d = (-1, 1): the sun sits to the copy side and a little towards us
    side = -0.8 * flip
    sun_pos = Vector((side * 0.7071 + 0.3 * 0.7071, side * 0.7071 - 0.3 * 0.7071, 0.88))
    fill_pos = Vector((-side * 0.7071 + 0.5 * 0.7071, -side * 0.7071 - 0.5 * 0.7071, 0.45))
    st = Stage(ctx, sun_dir=tuple(-sun_pos), fill_dir=tuple(-fill_pos), angle=float(p.get('shadow', 6.0)))
    K = Kit(ctx)
    pal = [ctx.color(i) for i in range(5)]
    motif = str(p.get('motif', 'room')).lower()
    MOTIFS.get(motif, room)(K, pal, ctx.palette['accent'])
    view = (1.0, -1.0, 0.816)
    width, height = st.fit(view, 9, shadow=0.45)
    ctx.frame(width=width, height=height, fov=9, direction=view)
