"""Wooden Toys — turned and sawn wood: visible growth rings and long grain, softly rounded edges,
some pieces painted in the palette colours with the grain showing through the paint, the rest left
natural under a satin oil finish; warm daylight from one side.

The technique is the material; ``motif`` chooses what is made of it:
  city   — a toy-block town on a board: towers, a gabled house, an arch bridge, lollipop trees
  turned — a balanced still life of lathe-turned pieces: ring stacker, spinning top, spindle, balls,
           a plank balanced on a fulcrum
  hills  — a fret-saw landscape: cut-out hills standing in layers, turned trees, a little house and
           a wooden sun
"""
import math

import bmesh
import bpy
import numpy as np

import common as C

VIEW = (0.0, -1.0, 0.3)
SPECIES = {   # (earlywood, latewood) — the two tones of the growth rings
    'beech':  ('#e6c79c', '#b98656'),
    'maple':  ('#efdcbc', '#c9a074'),
    'walnut': ('#9a6a46', '#5a3826'),
    'oak':    ('#d9b382', '#9c7247'),
}


# ----------------------------------------------------------------------------- node helpers
def _is_sock(v):
    return isinstance(v, bpy.types.NodeSocket)


def _math(nt, op, a, b=None, clamp=False):
    n = nt.nodes.new('ShaderNodeMath')
    n.operation = op
    n.use_clamp = clamp
    for i, v in enumerate((a, b)):
        if v is None:
            continue
        if _is_sock(v):
            nt.links.new(v, n.inputs[i])
        else:
            n.inputs[i].default_value = v
    return n.outputs[0]


def _mix(nt, fac, a, b):
    n = nt.nodes.new('ShaderNodeMixRGB')
    for i, v in enumerate((fac, a, b)):
        if _is_sock(v):
            nt.links.new(v, n.inputs[i])
        elif i == 0:
            n.inputs[0].default_value = v
        else:
            n.inputs[i].default_value = C.col(v) if isinstance(v, str) else v
    return n.outputs[0]


def _noise(nt, vec, scale, detail=2.0, rough=0.5):
    n = nt.nodes.new('ShaderNodeTexNoise')
    n.inputs['Scale'].default_value = scale
    n.inputs['Detail'].default_value = detail
    n.inputs['Roughness'].default_value = rough
    nt.links.new(vec, n.inputs['Vector'])
    return n.outputs[0]


def _scaled(nt, vec, s):
    m = nt.nodes.new('ShaderNodeMapping')
    m.inputs['Scale'].default_value = s
    nt.links.new(vec, m.inputs['Vector'])
    return m.outputs[0]


# ----------------------------------------------------------------------------- wood
class Shop:
    """Makes the wood: every piece gets its own cut of the log (ring offset, grain direction)."""

    def __init__(self, ctx, species):
        self.ctx, self.rng = ctx, ctx.rng
        self.early, self.late = SPECIES.get(species, SPECIES['beech'])
        self.n = 0
        self.pieces = []

    def wood(self, axis='Z', paint=None, pith=None, freq=None, figure=1.0, species=None):
        """``axis``: the grain direction in the piece's own space. ``pith``: distance of the tree's
        centre from the piece's axis — small for turned work (flame figure), large for sawn boards
        (gentle arcs). ``paint``: hex colour of a thin paint coat; the grain still shows through."""
        rng = self.rng
        self.n += 1
        early, late = (SPECIES[species] if species else (self.early, self.late))
        base = paint or early
        mat = C.material('Wood%d' % self.n, base, roughness=0.42 if paint else 0.55, coat=0.35 if paint else 0.18,
                         coat_roughness=0.22 if paint else 0.35, specular=0.4)
        nt = mat.node_tree
        bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        tc = nt.nodes.new('ShaderNodeTexCoord')
        mp = nt.nodes.new('ShaderNodeMapping')
        rot = {'Z': (0, 0, 0), 'X': (0, math.radians(90), 0), 'Y': (math.radians(90), 0, 0)}[axis]
        mp.inputs['Rotation'].default_value = rot
        pd = pith if pith is not None else rng.uniform(0.6, 1.4)
        a = rng.uniform(0, math.tau)
        mp.inputs['Location'].default_value = (pd * math.cos(a), pd * math.sin(a), rng.uniform(-20, 20))
        nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
        P = mp.outputs[0]
        sep = nt.nodes.new('ShaderNodeSeparateXYZ')
        nt.links.new(P, sep.inputs[0])
        x, y, _ = sep.outputs
        d = _math(nt, 'SQRT', _math(nt, 'ADD', _math(nt, 'MULTIPLY', x, x), _math(nt, 'MULTIPLY', y, y)))
        # rings wander: noise stretched along the grain
        warp = _math(nt, 'MULTIPLY', _math(nt, 'SUBTRACT', _noise(nt, _scaled(nt, P, (2.2, 2.2, 0.35)), 1.0, 3.0, 0.55), 0.5), 0.11)
        f = freq or rng.uniform(26, 38)
        ring = _math(nt, 'FRACT', _math(nt, 'MULTIPLY', _math(nt, 'ADD', d, warp), f))
        late_w = _math(nt, 'POWER', ring, 3.2)                                   # gradual early → late, then a sharp return
        streak = _noise(nt, _scaled(nt, P, (60.0, 60.0, 1.6)), 1.0, 2.0, 0.6)    # fine long fibres
        t = _math(nt, 'ADD', _math(nt, 'MULTIPLY', late_w, 1.0 * figure),
                  _math(nt, 'MULTIPLY', _math(nt, 'SUBTRACT', streak, 0.5), 0.55 * figure), clamp=True)
        if paint:
            # thin paint: the grain reads as a slight darkening and as texture in the gloss
            colr = _mix(nt, _math(nt, 'MULTIPLY', t, 0.22), C.mix_hex(paint, '#ffffff', 0.03), C.mix_hex(paint, '#000000', 0.3))
        else:
            tone = _noise(nt, _scaled(nt, P, (0.8, 0.8, 0.2)), 1.0, 1.0)         # board-to-board colour drift
            light = _mix(nt, tone, C.mix_hex(early, '#000000', 0.04), C.mix_hex(early, '#ffffff', 0.06))
            colr = _mix(nt, t, light, late)
        nt.links.new(colr, bsdf.inputs['Base Color'])
        bump = nt.nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = 0.12 if paint else 0.2
        bump.inputs['Distance'].default_value = 0.004
        nt.links.new(_math(nt, 'ADD', _math(nt, 'MULTIPLY', late_w, 0.6), _math(nt, 'MULTIPLY', streak, 0.4)), bump.inputs['Height'])
        nt.links.new(bump.outputs[0], bsdf.inputs['Normal'])
        return mat

    def add(self, ob):
        self.pieces.append(ob)
        return ob

    # sawn pieces: the grain runs along the longest side
    def block(self, size, loc, paint=None, bevel=None, rot_z=0.0, **kw):
        sx, sy, sz = size
        axis = 'XYZ'[int(np.argmax(size))]
        b = bevel if bevel is not None else min(0.035, 0.1 * min(size))
        return self.add(C.add_box(size, b, self.wood(axis, paint, **kw), segments=4,
                                  location=(loc[0], loc[1], loc[2] + sz / 2), rotation=(0, 0, rot_z)))

    def prism(self, w, h, depth, loc, paint=None, rot_z=0.0):
        """A gable roof: triangle in XZ, extruded along Y, standing on loc z."""
        ob = C.add_extrusion([(-w / 2, 0), (w / 2, 0), (0, h)], depth, 0.014, self.wood('Y', paint), name='Roof')
        ob.location = loc
        ob.rotation_euler = (0, 0, rot_z)
        return self.add(ob)

    def turn(self, profile, loc, paint=None, pith=None, rot=(0, 0, 0), segments=96, species=None):
        """A lathe-turned piece from [(r, z), ...]; grain along the axis."""
        prof = C.fillet_profile(profile, 0.012, steps=4)
        ob = C.add_lathe(prof, self.wood('Z', paint, pith=pith if pith is not None else self.rng.uniform(0.04, 0.25), species=species),
                         segments=segments, name='Turned', location=loc, rotation=rot)
        return self.add(ob)

    def ball(self, r, loc, paint=None):
        return self.add(C.add_sphere(r, self.wood('Z', paint, pith=self.rng.uniform(0.05, 0.3)), segments=64, location=(loc[0], loc[1], loc[2] + r)))

    def cutout(self, outline, depth, loc, paint=None):
        """A fret-saw cut-out: a 2D outline in XZ, sawn from a board of ``depth`` (grain along X)."""
        ob = C.add_extrusion(outline, depth, 0.016, self.wood('X', paint), name='Cutout')
        ob.location = loc
        return self.add(ob)


# ----------------------------------------------------------------------------- motifs
def _city(S, cols, flip):
    rng = S.rng
    c0, c1, c2, c3 = cols
    X = lambda v: v * flip
    # the board everything stands on
    S.block((3.0, 1.15, 0.08), (0, 0.0, 0.0), pith=3.0)
    g = 0.08
    # back row: tall tower, slim column, gate
    S.block((0.42, 0.42, 0.42), (X(-0.55), 0.25, g))
    S.block((0.32, 0.32, 0.62), (X(-0.55), 0.25, g + 0.42), paint=c0)
    S.turn([(0.0, 0.0), (0.15, 0.0), (0.15, 0.26), (0.0, 0.26)], (X(-0.55), 0.25, g + 1.04))
    S.turn([(0.0, 0.0), (0.18, 0.0), (0.0, 0.3)], (X(-0.55), 0.25, g + 1.3), paint=c1)
    S.block((0.2, 0.2, 0.86), (X(0.12), 0.32, g))
    S.ball(0.12, (X(0.12), 0.32, g + 0.86), paint=c2)
    # arch bridge
    arch = C.add_arch(0.7, 0.5, 0.15, 0.24, S.wood('X'), location=(X(0.78), 0.28, g))
    S.add(arch)
    S.block((0.86, 0.28, 0.1), (X(0.78), 0.28, g + 0.5), paint=c3)
    S.block((0.2, 0.2, 0.2), (X(0.6), 0.28, g + 0.6), rot_z=math.radians(12))
    S.turn([(0.0, 0.0), (0.1, 0.0), (0.1, 0.16), (0.0, 0.16)], (X(1.0), 0.28, g + 0.6), paint=c0)
    # front row: gabled house, small blocks, trees
    S.block((0.5, 0.36, 0.34), (X(-0.12), -0.2, g), paint=c2)
    S.prism(0.58, 0.28, 0.4, (X(-0.12), -0.2, g + 0.34), paint=c1)
    S.block((0.26, 0.26, 0.26), (X(-1.12), -0.15, g), paint=c3, rot_z=math.radians(-10))
    S.prism(0.3, 0.2, 0.26, (X(-1.12), -0.15, g + 0.26), rot_z=math.radians(-10))
    S.turn([(0.0, 0.0), (0.12, 0.0), (0.12, 0.08), (0.0, 0.1)], (X(0.48), -0.3, g), paint=c0)
    for x, y, h, r, pc in ((-0.92, 0.3, 0.42, 0.17, c1), (0.42, -0.06, 0.3, 0.13, c3), (1.25, -0.2, 0.34, 0.15, c2)):
        S.turn([(0.0, 0.0), (0.06, 0.0), (0.03, 0.02), (0.025, h), (0.0, h)], (X(x), y, g))
        S.ball(r, (X(x), y, g + h - 0.04), paint=pc)
    S.block((0.34, 0.16, 0.16), (X(0.95), -0.32, g), rot_z=math.radians(8))
    return dict(rot=math.radians(-12 * flip))


def _turned(S, cols, flip):
    rng = S.rng
    c0, c1, c2, c3 = cols
    X = lambda v: v * flip
    # ring stacker: natural base and peg, painted rings
    bx = X(-0.62)
    S.turn([(0.0, 0.0), (0.38, 0.0), (0.39, 0.05), (0.34, 0.1), (0.0, 0.1)], (bx, 0.1, 0))
    S.turn([(0.0, 0.0), (0.055, 0.0), (0.05, 0.92), (0.0, 0.94)], (bx, 0.1, 0.08))
    z = 0.1
    for i, (R, pc) in enumerate(((0.32, c0), (0.28, c1), (0.24, c2), (0.2, c3), (0.16, c0))):
        m = 0.075 - 0.004 * i
        S.add(C.add_torus(R - m, m, S.wood('Z', pc, pith=0.0), major_segments=96, minor_segments=28,
                          location=(bx, 0.1, z + m), scale=(1, 1, 0.95)))
        z += 2 * m * 0.95
    S.ball(0.085, (bx, 0.1, z - 0.01))
    # a tall spindle of darker wood
    S.turn([(0.0, 0.0), (0.16, 0.0), (0.17, 0.05), (0.09, 0.14), (0.07, 0.4), (0.12, 0.52), (0.07, 0.64), (0.05, 0.9),
            (0.09, 0.98), (0.0, 1.06)], (X(0.12), 0.42, 0), species='walnut')
    # balance: a plank on a fulcrum with a ball and two blocks
    fx = X(0.62)
    S.add(C.add_extrusion([(-0.16, 0), (0.16, 0), (0, 0.22)], 0.3, 0.02, S.wood('Y'), name='Fulcrum', location=(fx, -0.05, 0)))
    S.block((1.0, 0.18, 0.05), (fx, -0.05, 0.22), pith=2.5, bevel=0.015)
    S.ball(0.11, (fx - 0.36, -0.05, 0.27), paint=c1)
    S.block((0.16, 0.16, 0.16), (fx + 0.36, -0.05, 0.27), paint=c3, rot_z=math.radians(10))
    S.block((0.12, 0.12, 0.12), (fx + 0.36, -0.05, 0.43), rot_z=math.radians(-14))
    # spinning top
    S.turn([(0.0, 0.0), (0.05, 0.03), (0.2, 0.14), (0.21, 0.18), (0.12, 0.25), (0.03, 0.27), (0.025, 0.42), (0.0, 0.44)],
           (X(-0.08), -0.38, 0), paint=c2)
    # loose balls and an egg cup with an egg
    S.ball(0.13, (X(1.08), 0.32, 0), paint=c0)
    S.ball(0.08, (X(-0.98), -0.42, 0))
    S.turn([(0.0, 0.0), (0.09, 0.0), (0.09, 0.02), (0.035, 0.06), (0.04, 0.1), (0.1, 0.16), (0.1, 0.22), (0.0, 0.2)],
           (X(0.38), -0.5, 0))
    egg = [(0.075 * math.sin(math.pi * t) * (1 - 0.12 * t), 0.2 * (1 - math.cos(math.pi * t)) / 2) for t in np.linspace(0, 1, 18)]
    egg[0], egg[-1] = (0.0, egg[0][1]), (0.0, egg[-1][1])
    S.turn(egg, (X(0.38), -0.5, 0.15), paint=c3)
    return dict(rot=0.0)


def _hill_outline(rng, width, base, amp, bumps, seed):
    xs = np.linspace(-width / 2, width / 2, 90)
    hs = base + sum(a * np.sin(xs * f + p) for a, f, p in zip(amp, bumps, seed))
    # round the two ends down to the board
    edge = np.clip((width / 2 - np.abs(xs)) / 0.18, 0, 1)
    hs = 0.03 + (hs - 0.03) * np.sqrt(edge)
    return [(float(xs[0]), 0.0)] + [(float(x), float(h)) for x, h in zip(xs, hs)] + [(float(xs[-1]), 0.0)]


def _hills(S, cols, flip):
    rng = S.rng
    c0, c1, c2, c3 = cols
    X = lambda v: v * flip
    S.block((3.0, 1.0, 0.07), (0, 0.05, 0.0), pith=3.0)
    g = 0.07
    # a wooden sun on a dowel, behind everything
    sun_paint = max(cols, key=lambda h: C.hex_to_rgb(h)[0] + C.hex_to_rgb(h)[1] - C.hex_to_rgb(h)[2])
    S.turn([(0.0, 0.0), (0.012, 0.0), (0.012, 0.9), (0.0, 0.9)], (X(0.62), 0.5, g))
    disc = C.add_lathe(C.fillet_profile([(0.0, -0.04), (0.3, -0.04), (0.3, 0.04), (0.0, 0.04)], 0.015, 4),
                       S.wood('Y', sun_paint), location=(X(0.62), 0.5, g + 0.98), rotation=(math.radians(90), 0, 0))
    S.add(disc)
    # three rows of cut-out hills, back to front: painted, painted, natural
    rows = [(0.42, 0.62, c1, 2.9), (0.15, 0.42, c2, 2.8), (-0.14, 0.24, None, 2.7)]
    for i, (y, base, pc, w) in enumerate(rows):
        out = _hill_outline(rng, w, base, (0.16, 0.08, 0.04), (1.7 + 0.4 * i, 3.1, 6.3),
                            (rng.uniform(0, 6), rng.uniform(0, 6), rng.uniform(0, 6)))
        if flip < 0:
            out = [(-x, z) for x, z in reversed(out)]
        S.cutout(out, 0.09, (0, y, g), paint=pc)
    # a little house between the rows
    S.block((0.24, 0.18, 0.2), (X(-0.3), 0.02, g + 0.1), paint=c0)
    S.prism(0.3, 0.17, 0.22, (X(-0.3), 0.02, g + 0.3), paint=c3)
    # turned trees on the front of the board: cones and lollipops
    for x, y, h, kind, pc in ((-1.15, -0.32, 0.62, 'cone', c3), (-0.9, -0.36, 0.42, 'ball', c1), (0.15, -0.36, 0.5, 'cone', None),
                              (1.0, -0.3, 0.56, 'ball', c3), (1.24, -0.38, 0.36, 'cone', c1)):
        S.turn([(0.0, 0.0), (0.07, 0.0), (0.07, 0.03), (0.022, 0.05), (0.02, h * 0.45), (0.0, h * 0.45)], (X(x), y, g))
        if kind == 'cone':
            S.turn([(0.0, 0.0), (0.16 * h / 0.5, 0.0), (0.03, h * 0.8), (0.0, h * 0.82)], (X(x), y, g + h * 0.3), paint=pc)
        else:
            S.ball(0.16 * h / 0.5, (X(x), y, g + h * 0.38), paint=pc)
    return dict(rot=0.0)


MOTIFS = {'city': _city, 'turned': _turned, 'hills': _hills}


def _fit(objs, margin=1.05):
    bpy.context.view_layer.update()
    d = np.array(VIEW) / np.linalg.norm(VIEW)
    up = np.array((0.0, -d[2], -d[1]))
    up = up if up[2] > 0 else -up
    xs, ys = [], []
    for ob in objs:
        if ob.type != 'MESH':
            continue
        co = np.empty(len(ob.data.vertices) * 3, 'f4')
        ob.data.vertices.foreach_get('co', co)
        mw = np.array(ob.matrix_world)
        co = co.reshape(-1, 3).astype('f8') @ mw[:3, :3].T + mw[:3, 3]
        xs.append(co[:, 0])
        ys.append(co @ up)
    xs, ys = np.concatenate(xs), np.concatenate(ys)
    cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
    return (xs.max() - xs.min()) * margin, (ys.max() - ys.min()) * margin, cx, -cy / up[2]


def build(ctx):
    pal, p = ctx.palette, ctx.params
    flip = -1.0 if ctx.mirror else 1.0
    motif = str(p.get('motif', 'city')).lower()
    if motif not in MOTIFS:
        motif = 'city'
    S = Shop(ctx, str(p.get('wood', 'beech')).lower())
    cols = [ctx.color(i) for i in range(4)]
    look = MOTIFS[motif](S, cols, flip)

    root = C.group(S.pieces, 'Toys', rotation=(0, 0, look.get('rot', 0.0)))
    W, H, cx, dz = _fit(S.pieces)
    root.location = (-cx, 0, dz)
    floor = dz

    # set: the poster colour, a floor sweeping into the wall
    wall = C.material('Wall', pal['bg'], roughness=0.95, specular=0.0)
    C.add_backdrop(wall, floor_z=floor, wall_y=2.8, radius=1.8)

    # light: warm daylight from the copy side, soft shadows falling away from the type
    ambient = 0.55
    sun_dir = (0.55 * flip, 0.62, -0.62)
    cos_wall = sun_dir[1] / math.sqrt(sum(v * v for v in sun_dir))
    C.set_world('#ffffff', ambient)
    C.add_sun(sun_dir, strength=(1.0 - ambient) * math.pi / cos_wall, angle=float(p.get('shadow', 9.0)), color='#fff6ea')
    # a window for the satin finish to catch
    for loc, size, st in (((-3.2 * flip, -3.0, floor + 2.4), (1.4, 3.4), 3.0), ((0.4 * flip, -1.4, floor + 4.4), (4.0, 0.8), 2.0)):
        card = C.add_softbox(loc, size, '#ffffff', st, (0, 0, floor + 0.4))
        for attr in ('visible_camera', 'visible_diffuse', 'visible_shadow', 'visible_transmission'):
            try:
                setattr(card, attr, False)
            except Exception:
                pass
    cy = ctx.scene.cycles
    cy.max_bounces, cy.diffuse_bounces, cy.glossy_bounces = 6, 3, 2
    ctx.frame(width=W, height=H, fov=22, direction=VIEW)
