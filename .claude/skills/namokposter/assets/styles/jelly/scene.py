"""Jelly & Wax — translucent gummy solids: saturated subsurface scattering that glows where the
form is thin, glossy skins with sharp window highlights, lit from behind and the side so every
rim and edge shines like a sweet held up to the light.

The technique is the material; ``motif`` chooses what is made of it:
  dessert — moulded jellies: a fluted two-layer dome, a stack of jelly cubes, a striped slab
  gummies — a heap of gummy bears, rings, a two-tone worm and gumdrops
  candles — pillar candles of soft wax glowing round their flames, drips on the sides
  hills   — a little landscape of jelly: layered island, domed hills, cone trees, a jelly sun
"""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector

import common as C

VIEW = (0.0, -1.0, 0.42)


# ----------------------------------------------------------------------------- materials
def _jelly(name, color, scale=0.3, rough=0.05, cloud=1.0, wax=False, clear=0.2):
    """Saturated subsurface solid. The scatter radius follows the colour, so light travelling
    through thin parts keeps (and deepens) the hue instead of going grey."""
    if not wax:     # scattering lifts and greys a colour a little: start a touch richer
        import colorsys
        r, g, b = C.hex_to_rgb(color)
        h_, l_, s_ = colorsys.rgb_to_hls(r, g, b)
        r, g, b = colorsys.hls_to_rgb(h_, l_ * 0.94, min(1.0, s_ * 1.18 + 0.04))
        color = '#%02x%02x%02x' % tuple(round(255 * max(0.0, min(1.0, v))) for v in (r, g, b))
    lin = C.col(color)[:3]
    m = max(lin) or 1.0
    radius = tuple(0.12 + 1.0 * (c / m) ** 1.5 for c in lin)
    mat = C.material(name, color, roughness=0.32 if wax else rough, subsurface=1.0, subsurface_radius=radius,
                     specular=0.45 if wax else 0.75, ior=1.45 if wax else 1.38,
                     coat=0.0 if wax else 0.5, coat_roughness=0.02, transmission=0.0 if wax else clear)
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    C._set(bsdf, 'subsurface_scale', scale)
    for meth in ('RANDOM_WALK', 'RANDOM_WALK_SKIN', 'RANDOM_WALK_FIXED_RADIUS'):
        try:
            bsdf.subsurface_method = meth
            break
        except Exception:
            continue
    try:
        tc = nt.nodes.new('ShaderNodeTexCoord')
        if cloud > 0:     # a faint internal mottling, a few percent either way
            n = nt.nodes.new('ShaderNodeTexNoise')
            n.inputs['Scale'].default_value = 2.2
            n.inputs['Detail'].default_value = 1.5
            mix = nt.nodes.new('ShaderNodeMixRGB')
            mix.inputs[1].default_value = C.col(C.mix_hex(color, '#000000', 0.08 * cloud))
            mix.inputs[2].default_value = C.col(C.mix_hex(color, '#ffffff', 0.08 * cloud))
            nt.links.new(tc.outputs['Object'], n.inputs['Vector'])
            nt.links.new(n.outputs[0], mix.inputs[0])
            nt.links.new(mix.outputs[0], bsdf.inputs['Base Color'])
        # a soft, slow wobble of the skin: hand-poured, not machined
        n2 = nt.nodes.new('ShaderNodeTexNoise')
        n2.inputs['Scale'].default_value = 3.0 if not wax else 14.0
        n2.inputs['Detail'].default_value = 2.0
        b = nt.nodes.new('ShaderNodeBump')
        b.inputs['Strength'].default_value = 0.08 if not wax else 0.12
        b.inputs['Distance'].default_value = 0.02
        nt.links.new(tc.outputs['Object'], n2.inputs['Vector'])
        nt.links.new(n2.outputs[0], b.inputs['Height'])
        nt.links.new(b.outputs['Normal'], bsdf.inputs['Normal'])
    except Exception:
        pass
    return mat


def _flame_mat():
    mat = bpy.data.materials.new('Flame')
    nt = C._node_tree(mat)
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Strength'].default_value = 3.2
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = C.col('#ff7a1a')
    ramp.color_ramp.elements[1].position = 0.6
    ramp.color_ramp.elements[1].color = C.col('#ffe9a8')
    e = ramp.color_ramp.elements.new(0.12)
    e.color = C.col('#ffb347')
    nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    nt.links.new(sep.outputs[2], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], em.inputs['Color'])
    nt.links.new(em.outputs[0], out.inputs[0])
    return mat


# ----------------------------------------------------------------------------- geometry
def _smooth(pts, n=8):
    """Catmull–Rom through the control points."""
    P = [pts[0]] + list(pts) + [pts[-1]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(n):
            t = k / n
            out.append(tuple(0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t * t
                                    + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t ** 3) for j in (0, 1)))
    out.append(tuple(pts[-1]))
    return out


def _revolve(profile, mat, flutes=0, depth=0.0, segments=128, wobble=0.0, seed=0.0, name='Jelly', drips=(), **kw):
    """Lathe around Z from [(r, z), ...] bottom to top; ``flutes`` ribs of relative ``depth`` like a
    jelly mould, fading out towards the axis; ``wobble`` makes it a little hand-made."""
    rmax = max(r for r, _ in profile) or 1.0
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        if r <= 1e-6:
            rings.append([bm.verts.new((0, 0, z))])
            continue
        ring = []
        for i in range(segments):
            a = math.tau * i / segments
            f = 1.0
            if flutes:
                f += depth * math.cos(flutes * a) * min(1.0, (r / rmax) ** 0.5)
            if wobble:
                f += wobble * (math.sin(2 * a + seed) * 0.6 + math.sin(3 * a + 1.7 * seed + z * 4) * 0.4)
            for da, top, ln, wd, amt in drips:        # wax runs: a ridge from the lip, ending in a round bead
                d = math.atan2(math.sin(a - da), math.cos(a - da))
                below = top - z
                if -0.01 < below < ln:
                    u = below / ln
                    w = wd * (0.75 + 0.5 * u)
                    along = min(1.0, (ln - below) / (0.35 * ln)) if u > 0.65 else 1.0
                    bead = 1.0 + 0.5 * math.exp(-((u - 0.92) / 0.06) ** 2)
                    f += amt * math.exp(-(d / w) ** 2) * math.sqrt(max(0.0, along)) * bead
            ring.append(bm.verts.new((r * f * math.cos(a), r * f * math.sin(a), z)))
        rings.append(ring)
    for a, b in zip(rings[:-1], rings[1:]):
        for i in range(segments):
            k = (i + 1) % segments
            if len(a) == 1 and len(b) == 1:
                continue
            if len(a) == 1:
                bm.faces.new((a[0], b[k], b[i]))
            elif len(b) == 1:
                bm.faces.new((a[i], a[k], b[0]))
            else:
                bm.faces.new((a[i], a[k], b[k], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return C.finish_mesh(name, bm, True, mat, **kw)


def _dome_profile(r, h, base_round=0.04, flat_top=0.0, steps=18):
    """A jelly from a mould: near-vertical sides that round over into a dome."""
    pts = [(0.0, 0.0), (r - base_round, 0.0)]
    pts += [(r - base_round + base_round * math.sin(t * math.pi / 2), base_round * (1 - math.cos(t * math.pi / 2))) for t in (0.5, 1.0)]
    for i in range(1, steps + 1):
        t = i / steps
        a = t * math.pi / 2
        pts.append((r * math.cos(a) * (1 - flat_top * t) + flat_top * r * (1 - t) * 0, base_round + (h - base_round) * math.sin(a) ** 0.85))
    pts[-1] = (0.0, h)
    return pts


def _tube(path, radius, mat, ring=20, name='Tube', taper=0.18):
    """A soft tube along a polyline [(x, y, z), ...] with rounded ends."""
    P = [Vector(p) for p in path]
    n = len(P)
    bm = bmesh.new()
    rings = []
    prev_n = None
    for i, p in enumerate(P):
        t = (P[min(i + 1, n - 1)] - P[max(i - 1, 0)]).normalized()
        if prev_n is None:
            ref = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
            nrm = (ref - t * ref.dot(t)).normalized()
        else:
            nrm = (prev_n - t * prev_n.dot(t)).normalized()
        prev_n = nrm
        bi = t.cross(nrm)
        s = i / (n - 1)
        end = min(s, 1 - s) / taper
        rr = radius * (math.sqrt(max(0.0, 1 - (1 - min(1.0, end)) ** 2)) if end < 1 else 1.0)
        rr = max(rr, radius * 0.08)
        rings.append([bm.verts.new(p + rr * (math.cos(a) * nrm + math.sin(a) * bi)) for a in [math.tau * j / ring for j in range(ring)]])
    for a, b in zip(rings[:-1], rings[1:]):
        for j in range(ring):
            k = (j + 1) % ring
            bm.faces.new((a[j], a[k], b[k], b[j]))
    c0 = bm.verts.new(P[0] - (P[1] - P[0]).normalized() * radius * 0.02)
    c1 = bm.verts.new(P[-1] + (P[-1] - P[-2]).normalized() * radius * 0.02)
    for j in range(ring):
        k = (j + 1) % ring
        bm.faces.new((rings[0][k], rings[0][j], c0))
        bm.faces.new((rings[-1][j], rings[-1][k], c1))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return C.finish_mesh(name, bm, True, mat)


_MB = [0]


def _blob(elems, mat, res=0.025, threshold=0.6, **kw):
    """Metaball body baked to a mesh: soft, fused gummy forms (bears, drops)."""
    _MB[0] += 1
    name = 'Blob%d' % _MB[0]
    mb = bpy.data.metaballs.new(name)
    mb.resolution = mb.render_resolution = res
    mb.threshold = threshold
    ob = bpy.data.objects.new(name, mb)
    bpy.context.scene.collection.objects.link(ob)
    for kind, co, rad, size in elems:
        e = mb.elements.new()
        e.type = kind
        e.co = co
        e.radius = rad * 1.72        # the surface of a ball at threshold 0.6 sits at ~0.58 of its radius
        e.stiffness = 2.0
        if size is not None:
            e.size_x, e.size_y, e.size_z = size
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob)
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    me.materials.append(mat)
    out = bpy.data.objects.new(name + 'Mesh', me)
    bpy.context.scene.collection.objects.link(out)
    out.location = kw.get('location', (0, 0, 0))
    out.rotation_euler = kw.get('rotation', (0, 0, 0))
    s = kw.get('scale', 1.0)
    out.scale = (s, s, s) if isinstance(s, (int, float)) else s
    return out


def _bear(mat, **kw):
    """A gummy bear sitting up, facing -Y, about 1 unit tall, feet on z = 0."""
    E = 'ELLIPSOID'
    els = [
        (E, (0, 0, 0.36), 0.42, (0.78, 0.6, 0.86)),       # body
        (E, (0, -0.02, 0.8), 0.36, (0.86, 0.72, 0.74)),   # head
        ('BALL', (-0.2, 0.0, 1.0), 0.14, None),            # ears
        ('BALL', (0.2, 0.0, 1.0), 0.14, None),
        (E, (0, -0.2, 0.74), 0.15, (1.0, 0.7, 0.62)),     # snout
        (E, (-0.27, -0.1, 0.46), 0.17, (0.7, 0.62, 1.0)),  # arms
        (E, (0.27, -0.1, 0.46), 0.17, (0.7, 0.62, 1.0)),
        (E, (-0.18, -0.16, 0.08), 0.2, (0.85, 1.0, 0.62)),  # feet
        (E, (0.18, -0.16, 0.08), 0.2, (0.85, 1.0, 0.62)),
    ]
    ob = _blob(els, mat, **kw)
    _drop_to_floor(ob)
    return ob


def _drop_to_floor(ob, z=0.0):
    """Shift a mesh object so its lowest point (in world space) sits on ``z``."""
    bpy.context.view_layer.update()
    mw = ob.matrix_world
    low = min((mw @ v.co).z for v in ob.data.vertices)
    ob.location.z += z - low
    return ob


# ----------------------------------------------------------------------------- motifs
class Set:
    def __init__(self, ctx, flip):
        self.ctx, self.flip, self.rng = ctx, flip, ctx.rng
        self.pieces = []          # jelly / wax: receive the back light
        self.other = []           # flames, wicks, plinths: moved with the set
        self.flames = []
        self._n = 0
        cols = [ctx.color(i) for i in range(max(4, len(ctx.colors)))]
        self.cols = cols

    def mat(self, color, **kw):
        self._n += 1
        return _jelly('Jelly%d' % self._n, color, **kw)

    def add(self, ob):
        self.pieces.append(ob)
        return ob

    def X(self, x):
        return x * self.flip


def _dessert(S):
    rng, X = S.rng, S.X
    c = S.cols
    # hero: a fluted dome in two layers
    prof = _smooth([(0.66, 0.0), (0.68, 0.06), (0.66, 0.34), (0.58, 0.6), (0.4, 0.82), (0.0, 0.9)], 8)
    split = 0.36
    lo = [p for p in prof if p[1] <= split]
    hi = [p for p in prof if p[1] >= split]
    r_at = lo[-1][0] + (hi[0][0] - lo[-1][0]) * ((split - lo[-1][1]) / max(1e-6, hi[0][1] - lo[-1][1])) if hi else lo[-1][0]
    base = [(0.0, 0.0)] + lo + [(r_at, split), (0.0, split)]
    top = [(0.0, split + 0.004), (r_at, split + 0.004)] + [p for p in hi if p[1] > split + 0.004]
    hx = X(0.32)
    S.add(_revolve(base, S.mat(c[1], scale=0.35), flutes=12, depth=0.045, location=(hx, 0.1, 0)))
    S.add(_revolve(top, S.mat(c[0], scale=0.35), flutes=12, depth=0.045, location=(hx, 0.1, 0)))
    # a stack of three cubes, each turned a little
    z = 0.0
    for i, (s, ci) in enumerate(((0.5, 2), (0.38, 3))):
        h = s * 0.92
        S.add(C.add_box((s, s, h), 0.07 * s / 0.4, S.mat(c[ci], scale=0.25), segments=5,
                        location=(X(-0.66) + rng.uniform(-0.03, 0.03), 0.42, z + h / 2),
                        rotation=(0, 0, math.radians(rng.uniform(-14, 14) + 9 * i))))
        z += h
    # a striped slab: three layers
    z = 0.0
    for i, (h, ci) in enumerate(((0.14, 1), (0.1, 2), (0.14, 3))):
        S.add(C.add_box((0.62, 0.3, h), 0.035, S.mat(c[ci], scale=0.2), segments=4,
                        location=(X(-0.3), -0.42, z + h / 2), rotation=(0, 0, math.radians(-8 * S.flip))))
        z += h + 0.002
    # small things for scale
    S.add(_revolve(_smooth([(0.0, 0.0), (0.2, 0.0), (0.21, 0.08), (0.15, 0.2), (0.0, 0.24)], 6),
                   S.mat(c[2], scale=0.25), flutes=8, depth=0.06, location=(X(1.06), -0.38, 0)))
    S.add(C.add_box(0.18, 0.04, S.mat(c[3], scale=0.2), location=(X(0.5), -0.6, 0.09),
                    rotation=(0, 0, math.radians(rng.uniform(10, 35)))))
    S.add(C.add_sphere(0.1, S.mat(c[0], scale=0.2), location=(X(0.78), -0.62, 0.1)))


def _gummies(S):
    rng, X = S.rng, S.X
    c = S.cols
    # bears: one big sitting up, one leaning on it, one small in front
    S.add(_bear(S.mat(c[0], scale=0.22), location=(X(0.05), 0.2, 0), rotation=(0, 0, math.radians(-12 * S.flip)), scale=1.05))
    S.add(_bear(S.mat(c[1], scale=0.22), location=(X(-0.62), 0.42, 0), rotation=(0, math.radians(-14 * S.flip), math.radians(18 * S.flip)), scale=0.82))
    S.add(_bear(S.mat(c[2], scale=0.22), location=(X(0.62), -0.32, 0), rotation=(0, 0, math.radians(-30 * S.flip)), scale=0.5))
    # a small bear tipped over on its side at the front
    S.add(_bear(S.mat(c[3], scale=0.22), location=(X(-0.42), -0.3, 0.0), rotation=(0, math.radians(84 * S.flip), math.radians(-25 * S.flip)), scale=0.42))
    # rings: one flat, one leaning
    r1 = S.add(C.add_torus(0.22, 0.085, S.mat(c[1], scale=0.2), major_segments=96, minor_segments=32,
                           location=(X(0.98), 0.22, 0.085)))
    S.add(C.add_torus(0.19, 0.075, S.mat(c[3], scale=0.2), major_segments=96, minor_segments=32,
                      location=(X(1.0), 0.28, 0.27), rotation=(math.radians(62), 0, math.radians(30 * S.flip))))
    # a two-tone worm curling across the front
    path = []
    for i in range(60):
        t = i / 59
        path.append((X(-1.15 + 1.25 * t), -0.72 + 0.12 * math.sin(t * 7.5), 0.065 + 0.05 * max(0.0, math.sin(t * 7.5 + 1.2)) * (1 - t)))
    S.add(_tube(path[:31], 0.065, S.mat(c[2], scale=0.15), name='WormA'))
    S.add(_tube(path[29:], 0.065, S.mat(c[0], scale=0.15), name='WormB'))
    # gumdrops
    for (x, y, s, ci) in ((0.32, -0.7, 0.12, 3), (1.12, -0.32, 0.1, 0), (-1.2, 0.05, 0.13, 2)):
        S.add(_revolve(_smooth([(0.0, 0.0), (s, 0.0), (s * 1.02, s * 0.25), (s * 0.7, s * 1.0), (0.0, s * 1.25)], 6),
                       S.mat(c[ci], scale=0.15), location=(X(x), y, 0), wobble=0.02, seed=rng.uniform(0, 6)))


def _candles(S):
    rng, X = S.rng, S.X
    c = S.cols
    wick_mat = C.material('Wick', '#2a211c', roughness=0.8)
    flame = _flame_mat()
    specs = [   # x, y, radius, height, colour
        (0.0, 0.18, 0.3, 1.25, 0),
        (X(-0.62), 0.36, 0.26, 0.86, 1),
        (X(0.6), -0.1, 0.24, 0.62, 2),
        (X(-0.22), -0.46, 0.2, 0.42, 3),
        (X(1.08), 0.36, 0.17, 0.98, 1),
    ]
    for x, y, r, h, ci in specs:
        wax_col = C.mix_hex(c[ci], '#fff6e8', 0.18)
        mat = S.mat(wax_col, scale=0.5, wax=True, cloud=0.6)
        # pillar with a softened, melted-in top: a raised lip round a shallow pool; wax runs down the
        # side the camera sees (part of the same surface — separate overlapping solids scatter badly)
        side = [(r * (1.0 + 0.004 * math.sin(7 * t)), 0.03 + (h - 0.06) * t) for t in np.linspace(0, 1, 28)]
        prof = [(0.0, 0.0), (r * 0.97, 0.0), (r, 0.012)] + side + [(r * 0.985, h - 0.012), (r * 0.965, h + 0.01),
                (r * 0.9, h + 0.002), (r * 0.8, h - 0.035), (r * 0.5, h - 0.05), (0.0, h - 0.052)]
        drips = [(rng.uniform(-2.5, -0.65), h, rng.uniform(0.12, 0.42) * min(1.0, h), rng.uniform(0.12, 0.18), 0.05)
                 for _ in range(rng.randint(2, 3))]
        S.add(_revolve(prof, mat, wobble=0.006, seed=rng.uniform(0, 6), location=(x, y, 0), drips=drips, segments=160))
        # wick and flame
        top = h - 0.05
        wick = C.add_cylinder(0.008, 0.07, 0.003, wick_mat, location=(x, y, top + 0.035),
                              rotation=(math.radians(rng.uniform(-6, 6)), math.radians(rng.uniform(-6, 6)), 0))
        S.other.append(wick)
        fl = C.add_lathe(_smooth([(0.0, 0.0), (0.03, 0.02), (0.045, 0.07), (0.03, 0.14), (0.0, 0.2)], 6), flame,
                         location=(x, y, top + 0.06), scale=(1.0, 1.0, 1.0))
        try:
            fl.visible_shadow = False
        except Exception:
            pass
        S.other.append(fl)
        S.flames.append((x, y, top + 0.11))


def _hills(S):
    rng, X = S.rng, S.X
    import colorsys
    c = list(S.cols[:4])

    def warmth(h):
        r, g, b = C.hex_to_rgb(h)
        hue, _, sat = colorsys.rgb_to_hls(r, g, b)
        return -abs(((hue * 360 - 40 + 180) % 360) - 180) + 60 * sat
    sun_c = max(c, key=warmth)
    rest = [k for k in c if k != sun_c] or [sun_c]
    r0, r1, r2 = rest[0], rest[1 % len(rest)], rest[2 % len(rest)]
    # island: two layers of jelly, a rounded disc
    R = 1.25
    S.add(C.add_cylinder(R, 0.16, 0.05, S.mat(C.mix_hex(r2, '#000000', 0.22), scale=0.3), location=(0, 0, 0.08), scale=(1.0, 0.62, 1.0)))
    S.add(C.add_cylinder(R * 0.98, 0.12, 0.05, S.mat(r2, scale=0.3), location=(0, 0, 0.222), scale=(1.0, 0.62, 1.0)))
    top = 0.28
    # a thin jelly sun standing behind the hills, lit from behind so it glows
    # (kept out of the back light, which would blow it out; a faint inner glow instead)
    sun_m = S.mat(sun_c, scale=0.5, clear=0.0)
    C._set(next(n for n in sun_m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), 'emission', C.col(sun_c))
    C._set(next(n for n in sun_m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), 'emission_strength', 0.9 if S.ctx.dark else 0.35)
    S.other.append(C.add_cylinder(0.4, 0.12, 0.05, sun_m, location=(X(-0.3), 0.7, top + 0.86), rotation=(math.radians(90), 0, 0)))
    # domed hills
    for x, y, r, h, col_ in ((X(0.18), 0.2, 0.62, 0.62, r0), (X(-0.52), 0.12, 0.5, 0.42, sun_c), (X(0.74), -0.05, 0.36, 0.3, r1)):
        S.add(_revolve(_dome_profile(r, h, base_round=0.03), S.mat(col_, scale=0.35), wobble=0.015, seed=rng.uniform(0, 6),
                       location=(x, y, top - 0.01), scale=(1.0, 0.7, 1.0)))
    # cone trees: a single soft cone each on a short trunk
    for x, y, s in ((X(-0.92), -0.1, 0.62), (X(0.98), 0.12, 0.5), (X(-0.1), -0.3, 0.4)):
        S.add(C.add_cylinder(0.05 * s, 0.16 * s, 0.01, S.mat(sun_c, scale=0.2), location=(x, y, top + 0.08 * s)))
        tiers = [(0.0, 0.0), (0.3, 0.0), (0.31, 0.05), (0.13, 0.3), (0.24, 0.3), (0.25, 0.34), (0.09, 0.56), (0.17, 0.56),
                 (0.175, 0.6), (0.0, 0.84)]
        prof = C.fillet_profile([(r * s, z * s) for r, z in tiers], 0.025 * s, steps=4)
        S.add(_revolve(prof, S.mat(r1, scale=0.25), location=(x, y, top + 0.15 * s)))
    # a few gummy stones on the shore
    for x, y, r, col_ in ((X(0.4), -0.48, 0.07, r0), (X(0.52), -0.5, 0.045, sun_c), (X(-0.55), -0.46, 0.06, r1)):
        S.add(_revolve(_dome_profile(r, r * 0.7, 0.01), S.mat(col_, scale=0.15), location=(x, y, top - 0.005)))


MOTIFS = {'dessert': _dessert, 'gummies': _gummies, 'candles': _candles, 'hills': _hills}


# ----------------------------------------------------------------------------- fitting
def _fit(objs, margin=1.06):
    """Centre the set on the origin as the camera sees it. Returns (width, height, floor z)."""
    bpy.context.view_layer.update()
    d = np.array(VIEW) / np.linalg.norm(VIEW)
    up = np.array((0.0, -d[2], -d[1]))
    up = up if up[2] > 0 else -up
    xs, ys = [], []
    for ob in objs:
        if ob.type != 'MESH' or not len(ob.data.vertices):
            continue
        co = np.empty(len(ob.data.vertices) * 3, 'f4')
        ob.data.vertices.foreach_get('co', co)
        mw = np.array(ob.matrix_world)
        co = co.reshape(-1, 3).astype('f8') @ mw[:3, :3].T + mw[:3, 3]
        xs.append(co[:, 0])
        ys.append(co @ up)
    xs, ys = np.concatenate(xs), np.concatenate(ys)
    cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
    dz = -cy / up[2]
    for ob in objs:
        if ob.parent is None:
            ob.location.x -= cx
            ob.location.z += dz
    return (xs.max() - xs.min()) * margin, (ys.max() - ys.min()) * margin, dz, -cx


def build(ctx):
    pal, p = ctx.palette, ctx.params
    flip = -1.0 if ctx.mirror else 1.0
    motif = str(p.get('motif', 'dessert')).lower()
    if motif not in MOTIFS:
        motif = 'dessert'
    S = Set(ctx, flip)
    MOTIFS[motif](S)
    W, H, floor, dx = _fit(S.pieces + S.other)
    S.flames = [(x + dx, y, z + floor) for x, y, z in S.flames]

    cy = ctx.scene.cycles
    cy.max_bounces, cy.diffuse_bounces, cy.glossy_bounces = 8, 3, 3
    cy.transmission_bounces = 4

    # set: the poster colour, a floor sweeping up into the wall
    wall = C.material('Wall', pal['bg'], roughness=0.95, specular=0.0)
    backdrop = C.add_backdrop(wall, floor_z=floor, wall_y=3.0, radius=2.0)

    # light: a soft key from the copy side keeps the set at its colour; strong back and side
    # lights reach only the jelly (light linking), so the rims glow while the wall stays even
    candles = motif == 'candles'
    back = float(p.get('glow', 1.0))
    C.set_world('#ffffff', 0.14 if candles else 0.36)
    key = C.add_area_light((-5.0 * flip, -6.0, floor + 7.0), energy=float(p.get('key', 1300)) * (1.35 if candles else 1.0), size=6.0,
                           target=(0.3 * flip, 0.8, floor + 0.3))
    lamps = [
        C.add_area_light((2.6 * flip, 3.4, floor + 3.6), energy=900 * back, size=2.5, color='#fff1dc', target=(0, 0, floor + 0.4)),
        C.add_area_light((-2.4 * flip, 3.0, floor + 2.6), energy=420 * back, size=2.0, color='#ffffff', target=(0, 0, floor + 0.4)),
        C.add_area_light((4.2 * flip, -0.6, floor + 1.4), energy=260 * back, size=1.6, color='#ffffff', target=(0, 0, floor + 0.4)),
    ]
    for x, y, z in S.flames:
        lamps.append(C.add_point_light((x, y, z - 0.07), energy=22 * back, color='#ffa552', radius=0.04))
    # what the gloss mirrors: a tall window on the key side and a strip above
    for loc, size, st in (((-3.2 * flip, -3.0, floor + 2.6), (1.4, 3.6), 7.0), ((0.4 * flip, -1.2, floor + 4.6), (4.0, 0.7), 4.0)):
        card = C.add_softbox(loc, size, '#ffffff', st, (0, 0, floor + 0.4))
        for attr in ('visible_camera', 'visible_diffuse', 'visible_shadow', 'visible_transmission'):
            try:
                setattr(card, attr, False)
            except Exception:
                pass
    if candles:     # candle light: the wax is lit by its flames and a dim back light, not by the key
        for lamp in lamps[:3]:
            lamp.data.energy *= 0.35
        try:
            room = bpy.data.collections.new('Room')
            room.objects.link(backdrop)
            key.light_linking.receiver_collection = room
        except Exception:
            key.data.energy *= 0.5
    try:
        coll = bpy.data.collections.new('Jelly')
        for ob in S.pieces:
            coll.objects.link(ob)
        for lamp in lamps[:3]:
            lamp.light_linking.receiver_collection = coll
        if lamps[3:]:           # flames light the wax and throw a warm pool on the table
            warm = bpy.data.collections.new('Lit')
            for ob in S.pieces + [backdrop]:
                warm.objects.link(ob)
            for lamp in lamps[3:]:
                lamp.light_linking.receiver_collection = warm
    except Exception:
        for lamp in lamps:
            lamp.data.energy *= 0.4

    ctx.frame(width=W, height=H, fov=24, direction=VIEW)
