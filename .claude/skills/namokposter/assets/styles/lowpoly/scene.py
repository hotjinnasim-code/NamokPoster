"""Low-poly — faceted, flat-shaded models under a hard sun.

The technique: everything is built from few, visibly flat triangles in three size tiers (big calm
planes, medium forms, small detail), every facet carries its own slightly jittered colour, nothing
is smooth-shaded, and one hard sun gives each facet a single clean value. The model stands or
floats over a floor of the poster colour that only shows its shadow.

What is modelled is the ``motif``: island (a floating island with trees and a hut), peaks (a snowy
mountain range), berg (an iceberg in a disc of sea), rocket (a rocket lifting off a mound of
smoke), forms (abstract faceted solids).
Palette: ``bg`` = backdrop, ``colors`` = [land, rock, foliage, snow / pale, water], ``accent`` =
small man-made things (roof, flag, sail).
"""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector, geometry, noise

import common as C

AMB, SUN = 0.5, 0.36           # sky and sun share of a lit horizontal surface (see Stage)
SKY, WARM = '#dbe6ff', '#fff3e0'


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
    """A floor that renders at exactly the palette background wherever nothing shades it (a size-1
    toon lobe answers the sun the same at any angle, so there is no falloff and no horizon), a
    backdrop of the same colour, a hard sun and a soft sky."""

    def __init__(self, ctx, sun_dir, angle=2.5, lift=0.35):
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
        tb.inputs['Color'].default_value = (*[v * (1 - lift) / (AMB * s + SUN * w) for v, s, w in zip(bg, sky, warm)], 1.0)
        add = nt.nodes.new('ShaderNodeAddShader')
        nt.links.new(em.outputs[0], add.inputs[0])
        nt.links.new(tb.outputs[0], add.inputs[1])
        nt.links.new(add.outputs[0], out.inputs[0])
        self.floor_mat = mat
        self.floor = None

    def add_floor(self, z):
        self.floor = C.add_plane(800.0, self.floor_mat, location=(0.0, 0.0, z))
        self.floor_z = z
        return self.floor

    def fit(self, direction, fov, margin=1.06, shadow=0.5):
        """Centre what was built on the origin as the camera will see it; return its on-screen size.
        ``shadow`` is how much of the cast shadow's extent counts as part of the subject."""
        ctx = self.ctx
        bpy.context.view_layer.update()
        sun = np.array(self.sun_dir)
        pts = []
        for ob in ctx.scene.objects:
            if ob.type != 'MESH' or ob is self.floor:
                continue
            co = np.empty(len(ob.data.vertices) * 3)
            ob.data.vertices.foreach_get('co', co)
            mw = np.array(ob.matrix_world)
            P = co.reshape(-1, 3) @ mw[:3, :3].T + mw[:3, 3]
            if self.floor is not None:
                P = P[P[:, 2] >= self.floor_z - 1e-4]          # what is under the floor is not seen
            if not len(P):
                continue
            pts.append(P)
            if shadow > 0 and self.floor is not None:
                pts.append(P + sun * (shadow * (self.floor_z - P[:, 2:3]) / sun[2]))
        shift, width, height = _fit_view(ctx, np.concatenate(pts), direction, fov, margin)
        for ob in ctx.scene.objects:
            if ob.parent is None and ob.type in ('MESH', 'CURVE', 'EMPTY', 'LIGHT'):
                ob.location = ob.location - shift
        return width, height


# ----------------------------------------------------------------------------- facet builder
_ICO = {}


def _ico(level):
    if level not in _ICO:
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=level, radius=1.0)
        _ICO[level] = ([tuple(v.co) for v in bm.verts], [[v.index for v in f.verts] for f in bm.faces])
        bm.free()
    return _ICO[level]


class Facets:
    """Collects flat faces with one colour each; ``build`` turns them into a single flat-shaded mesh
    whose colours live in a face-corner colour attribute."""

    def __init__(self, rng, jitter=0.055):
        self.rng, self.jitter = rng, jitter
        self.v, self.f, self.c = [], [], []

    def _colour(self, colour, jitter):
        r, g, b = C.col(colour)[:3] if isinstance(colour, str) else colour
        j = self.jitter if jitter is None else jitter
        k = 1.0 + self.rng.uniform(-j, j) * 1.6
        w = self.rng.uniform(-j, j) * 0.5                 # a touch of warm/cool drift as well
        return (min(1.0, r * k * (1 + w)), min(1.0, g * k), min(1.0, b * k * (1 - w)))

    def add(self, verts, faces, colour, jitter=None):
        """``colour``: hex, or a function (centroid, normal) -> hex."""
        base = len(self.v)
        self.v.extend(tuple(v) for v in verts)
        for f in faces:
            if callable(colour):
                p = [Vector(verts[i]) for i in f]
                n = (p[1] - p[0]).cross(p[2] - p[0])
                n = n.normalized() if n.length > 1e-12 else Vector((0, 0, 1))
                col = colour(sum(p, Vector()) / len(p), n)
            else:
                col = colour
            self.f.append([i + base for i in f])
            self.c.append(self._colour(col, jitter))

    def blob(self, centre, radius, colour, level=2, wobble=0.14, scale=(1, 1, 1), floor=None, spin=None, jitter=None):
        """A lumpy faceted ball (rock, tree crown, cloud puff). ``floor`` cuts it flat from below."""
        rng = self.rng
        verts, faces = _ico(level)
        spin = rng.uniform(0, math.tau) if spin is None else spin
        cs, sn = math.cos(spin), math.sin(spin)
        tilt = rng.uniform(-0.5, 0.5)
        ct, st = math.cos(tilt), math.sin(tilt)
        out = []
        for x, y, z in verts:
            y, z = y * ct - z * st, y * st + z * ct
            x, y = x * cs - y * sn, x * sn + y * cs
            k = radius * (1 + rng.uniform(-wobble, wobble))
            p = [x * k * scale[0], y * k * scale[1], z * k * scale[2]]
            if floor is not None:
                p[2] = max(p[2], floor * radius)
            out.append((centre[0] + p[0], centre[1] + p[1], centre[2] + p[2]))
        self.add(out, faces, colour, jitter)

    def cone(self, base, radius, height, colour, sides=7, lean=0.0, cap=True, jitter=None, r_top=0.0):
        rng = self.rng
        a0 = rng.uniform(0, math.tau)
        ring = [(base[0] + radius * math.cos(a0 + math.tau * i / sides) * (1 + rng.uniform(-0.08, 0.08)),
                 base[1] + radius * math.sin(a0 + math.tau * i / sides) * (1 + rng.uniform(-0.08, 0.08)),
                 base[2] + rng.uniform(-0.03, 0.03) * height) for i in range(sides)]
        if r_top > 0:
            top = [(base[0] + lean + r_top * math.cos(a0 + math.tau * i / sides), base[1] + r_top * math.sin(a0 + math.tau * i / sides), base[2] + height) for i in range(sides)]
            verts = ring + top
            faces = [[i, (i + 1) % sides, sides + (i + 1) % sides, sides + i] for i in range(sides)]
            faces.append([sides + i for i in range(sides)])
        else:
            verts = ring + [(base[0] + lean, base[1], base[2] + height)]
            faces = [[i, (i + 1) % sides, sides] for i in range(sides)]
        if cap:
            faces.append(list(range(sides - 1, -1, -1)))
        self.add(verts, faces, colour, jitter)

    def box(self, centre, size, colour, rz=0.0, jitter=None):
        sx, sy, sz = (s / 2 for s in size)
        cs, sn = math.cos(rz), math.sin(rz)
        verts = []
        for z in (-sz, sz):
            for x, y in ((-sx, -sy), (sx, -sy), (sx, sy), (-sx, sy)):
                verts.append((centre[0] + x * cs - y * sn, centre[1] + x * sn + y * cs, centre[2] + z))
        self.add(verts, [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 6, 7], [3, 2, 1, 0]], colour, jitter)

    def roof(self, centre, size, colour, rz=0.0, jitter=None):
        """A gable roof: ridge along local x."""
        sx, sy, h = size[0] / 2, size[1] / 2, size[2]
        cs, sn = math.cos(rz), math.sin(rz)
        loc = [(-sx, -sy, 0), (sx, -sy, 0), (sx, sy, 0), (-sx, sy, 0), (-sx, 0, h), (sx, 0, h)]
        verts = [(centre[0] + x * cs - y * sn, centre[1] + x * sn + y * cs, centre[2] + z) for x, y, z in loc]
        self.add(verts, [[0, 1, 5, 4], [2, 3, 4, 5], [1, 2, 5], [3, 0, 4], [3, 2, 1, 0]], colour, jitter)

    def build(self, name='Facets', roughness=0.85):
        me = bpy.data.meshes.new(name)
        me.from_pydata(self.v, [], self.f)
        me.update()
        attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
        data = np.empty((len(me.loops), 4), 'f4')
        k = 0
        for f, col in zip(self.f, self.c):
            data[k:k + len(f)] = (*col, 1.0)
            k += len(f)
        attr.data.foreach_set('color', data.ravel())
        mat = C.material('Facet', '#ffffff', roughness=roughness, specular=0.2)
        nt = mat.node_tree
        bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        an = nt.nodes.new('ShaderNodeAttribute')
        an.attribute_name = 'Col'
        nt.links.new(an.outputs['Color'], bsdf.inputs['Base Color'])
        me.materials.append(mat)
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        return ob


def _delaunay(points):
    res = geometry.delaunay_2d_cdt([Vector(p) for p in points], [], [], 0, 1e-6)
    return [tuple(v) for v in res[0]], [list(f) for f in res[2]]


def _zip_rings(a, b):
    """Triangles between two closed rings of vertex indices running the same way round."""
    faces, i, j, na, nb = [], 0, 0, len(a), len(b)
    while i < na or j < nb:
        if j >= nb or (i < na and (i + 0.5) / na <= (j + 0.5) / nb):
            faces.append([a[i % na], a[(i + 1) % na], b[j % nb]])
            i += 1
        else:
            faces.append([a[i % na], b[(j + 1) % nb], b[j % nb]])
            j += 1
    return faces


def _mix(a, b, t):
    return C.mix_hex(a, b, t)


# ----------------------------------------------------------------------------- props
def pine(F, x, y, z, s, foliage, trunk):
    F.cone((x, y, z - 0.02 * s), 0.035 * s, 0.2 * s, trunk, sides=5, cap=False, r_top=0.03 * s)
    lean = F.rng.uniform(-0.02, 0.02) * s
    for i, (r, h, z0) in enumerate(((0.21, 0.3, 0.14), (0.165, 0.27, 0.3), (0.115, 0.26, 0.46))):
        F.cone((x + lean * i, y, z + z0 * s), r * s, h * s, _mix(foliage, '#ffffff', 0.07 * i), sides=7, lean=lean)


def round_tree(F, x, y, z, s, foliage, trunk):
    F.cone((x, y, z - 0.02 * s), 0.04 * s, 0.3 * s, trunk, sides=5, cap=False, r_top=0.03 * s)
    F.blob((x, y, z + 0.44 * s), 0.21 * s, foliage, level=2, wobble=0.16, scale=(1.0, 1.0, 1.08))


def cloud(F, x, y, z, s, colour):
    for dx, dz, r in ((-0.22, 0.0, 0.17), (0.0, 0.06, 0.23), (0.23, -0.01, 0.18), (0.1, -0.02, 0.15)):
        F.blob((x + dx * s, y + F.rng.uniform(-0.03, 0.03), z + dz * s), r * s, colour, level=2, wobble=0.1, scale=(1.2, 0.9, 0.82), floor=-0.42, jitter=0.03)


def hut(F, x, y, z, s, wall, roof, door, rz=0.3):
    F.box((x, y, z + 0.09 * s), (0.26 * s, 0.2 * s, 0.2 * s), wall, rz, jitter=0.03)
    F.roof((x, y, z + 0.19 * s), (0.32 * s, 0.26 * s, 0.15 * s), roof, rz, jitter=0.03)
    cs, sn = math.cos(rz), math.sin(rz)
    F.box((x - 0.04 * s * cs + 0.1 * s * sn, y - 0.04 * s * sn - 0.1 * s * cs, z + 0.055 * s), (0.055 * s, 0.012 * s, 0.11 * s), door, rz, jitter=0.0)


# ----------------------------------------------------------------------------- motif: floating island
def island(ctx, st, F, pal):
    rng = ctx.rng
    land, rock, foliage, snow, water = pal
    ph = [rng.uniform(0, math.tau) for _ in range(4)]
    seed = Vector((rng.uniform(0, 50), rng.uniform(0, 50), 0))

    def edge(t):
        return 1.2 * (1 + 0.1 * math.sin(2 * t + ph[0]) + 0.07 * math.sin(3 * t + ph[1]) + 0.04 * math.sin(5 * t + ph[2]))

    def top_z(x, y):
        t = math.atan2(y / 0.82, x)
        d = math.hypot(x, y / 0.82) / edge(t)
        hill = 0.34 * math.exp(-((x + 0.35) ** 2 + (y - 0.15) ** 2) / 0.22) + 0.16 * math.exp(-((x - 0.55) ** 2 + (y + 0.1) ** 2) / 0.12)
        return (hill + 0.05 * noise.noise(Vector((x * 2.2, y * 2.2, 0)) + seed)) * (1 - d ** 4) + 0.03 * (1 - d * d)

    pond = (0.44, -0.4)
    in_pond = lambda x, y, r: math.hypot(x - pond[0], (y - pond[1]) / 0.66) < r
    nb = 26
    ring = []
    for i in range(nb):
        t = math.tau * (i + rng.uniform(-0.25, 0.25)) / nb
        r = edge(t)
        ring.append((r * math.cos(t), 0.82 * r * math.sin(t)))
    pts = list(ring)
    step = 0.34
    for iy in range(-5, 6):
        for ix in range(-5, 6):
            x, y = (ix + (0.5 if iy % 2 else 0.0) + rng.uniform(-0.3, 0.3)) * step, (iy + rng.uniform(-0.3, 0.3)) * step * 0.9
            t = math.atan2(y / 0.82, x)
            if math.hypot(x, y / 0.82) < edge(t) * 0.86 and not in_pond(x, y, 0.31):
                pts.append((x, y))
    for i in range(7):                                      # the pond: a clean little polygon of water
        a = math.tau * (i + rng.uniform(-0.15, 0.15)) / 7
        pts.append((pond[0] + 0.2 * math.cos(a), pond[1] + 0.2 * 0.66 * math.sin(a)))
    pts.append(pond)
    for _ in range(14):                                     # finer facets around the main hill
        a, r = rng.uniform(0, math.tau), rng.uniform(0.05, 0.42)
        pts.append((-0.35 + r * math.cos(a), 0.15 + r * math.sin(a) * 0.8))
    v2, tris = _delaunay(pts)
    top = [(x, y, 0.0 if in_pond(x, y, 0.205) else top_z(x, y) if i >= nb else rng.uniform(-0.02, 0.02)) for i, (x, y) in enumerate(v2)]

    def top_col(c, n):
        if in_pond(c.x, c.y, 0.15):
            return water
        if abs(n.z) < 0.72:
            return _mix(land, rock, 0.55)
        return _mix(land, foliage, 0.25) if c.z > 0.2 else land
    F.add(top, tris, top_col)

    # underside: rings stepping down and in, to a point
    base = len(F.v) - len(top)
    prev = [base + i for i in range(nb)]
    soil, deep = _mix(rock, land, 0.3), _mix(rock, '#20182a', 0.35)
    tip = (rng.uniform(-0.12, 0.12), rng.uniform(-0.08, 0.08))
    levels = [(nb, 0.985, -0.16, soil), (15, 0.8, -0.5, rock), (9, 0.5, -0.92, rock), (5, 0.2, -1.32, deep)]
    for n, k, z, colour in levels:
        cur = []
        for i in range(n):
            t = math.tau * (i + rng.uniform(-0.2, 0.2)) / n
            r = edge(t) * k * (1 + rng.uniform(-0.1, 0.1))
            F.v.append((tip[0] * (1 - k) + r * math.cos(t), tip[1] * (1 - k) + 0.82 * r * math.sin(t), z * (1 + rng.uniform(-0.12, 0.12))))
            cur.append(len(F.v) - 1)
        for f in _zip_rings(prev, cur):
            F.f.append(f)
            F.c.append(F._colour(colour, None))
        prev = cur
    F.v.append((tip[0], tip[1], -1.62))
    for i in range(len(prev)):
        F.f.append([prev[i], prev[(i + 1) % len(prev)], len(F.v) - 1])
        F.c.append(F._colour(deep, None))
    # two smaller hanging spurs
    for (x, y, r, h) in ((-0.62, 0.1, 0.26, 0.85), (0.6, -0.05, 0.2, 0.7)):
        F.cone((x, y, -0.3), r, -h, _mix(rock, deep, 0.5), sides=6, cap=False)

    trunk = _mix(rock, '#3a2a22', 0.45)
    zt = lambda x, y: top_z(x, y)
    for (x, y, s) in ((-0.66, 0.34, 1.25), (-0.38, 0.42, 1.55), (-0.12, 0.3, 1.1), (-0.5, 0.02, 0.95), (-0.84, 0.06, 0.8)):
        pine(F, x, y, zt(x, y), s, foliage, trunk)
    round_tree(F, 0.74, 0.22, zt(0.74, 0.22), 1.15, _mix(foliage, land, 0.45), trunk)
    round_tree(F, 0.36, 0.38, zt(0.36, 0.38), 0.85, _mix(foliage, land, 0.3), trunk)
    hut(F, 0.1, -0.22, zt(0.1, -0.22) - 0.01, 1.2, snow, ctx.palette['accent'], trunk)
    for (x, y, r) in ((-0.2, -0.5, 0.07), (0.8, -0.3, 0.09), (-0.9, -0.3, 0.06)):
        F.blob((x, y, zt(x, y) + r * 0.3), r, rock, level=1, wobble=0.25, scale=(1.2, 1.0, 0.8))
    # drifting rocks and clouds
    for (x, y, z, r) in ((-1.45, 0.1, -0.75, 0.13), (1.3, 0.2, -0.55, 0.1), (1.05, -0.2, -1.05, 0.07)):
        F.blob((x, y, z), r, rock, level=1, wobble=0.28, scale=(1.0, 1.0, 1.25))
    cloud_col = _mix(snow, '#ffffff', 0.5)
    cloud(F, -1.2, 0.5, 0.78, 0.95, cloud_col)
    cloud(F, 1.18, 0.35, 0.42, 0.7, cloud_col)
    st.add_floor(-60.0)                                     # so far below that no shadow reaches the frame
    return 0.3


# ----------------------------------------------------------------------------- motif: mountain range
def peaks(ctx, st, F, pal):
    rng = ctx.rng
    land, rock, foliage, snow, water = pal
    seed = Vector((rng.uniform(0, 50), rng.uniform(0, 50), 0))
    tops = [(-0.05, 0.2, 2.2, 1.02), (-0.9, 0.3, 1.5, 0.75), (0.82, 0.38, 1.75, 0.8), (0.42, -0.28, 0.85, 0.55), (-0.55, -0.32, 0.6, 0.5)]

    def h(x, y):
        best = -1.0
        for px, py, ph_, w in tops:
            d = math.hypot(x - px, (y - py) * 1.25)
            best = max(best, ph_ * (1 - d / w) ** 1.0 - 0.16 * ph_ * abs(noise.noise(Vector((x * 2.6, y * 2.6, ph_)) + seed)))
        apron = 0.14 * (1 - (x / 1.72) ** 2 - (y / 1.0) ** 2)
        return max(-0.12, max(best, apron) + 0.05 * noise.noise(Vector((x * 5, y * 5, 3)) + seed))

    pts = []
    step = 0.3
    for iy in range(-5, 6):
        for ix in range(-7, 8):
            pts.append(((ix + (0.5 if iy % 2 else 0.0) + rng.uniform(-0.3, 0.3)) * step, (iy + rng.uniform(-0.3, 0.3)) * step * 0.85))
    for px, py, ph_, w in tops:
        pts.append((px, py))
        for k in range(int(5 + 6 * ph_)):
            a, r = rng.uniform(0, math.tau), rng.uniform(0.08, 0.5) * w
            pts.append((px + r * math.cos(a), py + r * math.sin(a) * 0.8))
    v2, tris = _delaunay(pts)
    verts = [(x, y, h(x, y)) for x, y in v2]

    def col(c, n):
        steep = abs(n.z) < 0.62
        line = 1.12 + 0.24 * noise.noise(Vector((c.x * 3, c.y * 3, 7)) + seed)
        if c.z > line and not (steep and c.z < line + 0.2):
            return snow
        if c.z > 0.46 or steep:
            return (rock if c.z < 0.8 * line else _mix(rock, snow, 0.16)) if c.z > 0.3 else _mix(rock, land, 0.4)
        return land if c.z > 0.14 else _mix(land, foliage, 0.3)
    F.add(verts, tris, col)

    trunk = _mix(rock, '#3a2a22', 0.4)
    placed = []
    tries = 0
    while len(placed) < 30 and tries < 900:
        tries += 1
        x, y = rng.uniform(-1.65, 1.65), rng.uniform(-0.95, 0.6)
        z = h(x, y)
        if not 0.02 < z < 0.34 or any(math.hypot(x - a, y - b) < 0.11 for a, b in placed):
            continue
        placed.append((x, y))
        s = rng.choice((0.5, 0.6, 0.6, 0.75, 0.95)) * (1.25 if y < -0.6 else 1.0)
        pine(F, x, y, z - 0.01, s, _mix(foliage, land, rng.uniform(0.0, 0.25)), trunk)
    # a summit flag and a cabin for scale
    px, py, ph_, _ = tops[0]
    zt = h(px, py)
    F.box((px, py, zt + 0.1), (0.014, 0.014, 0.22), _mix(rock, '#20182a', 0.5), jitter=0.0)
    F.add([(px + 0.007, py, zt + 0.21), (px + 0.007, py, zt + 0.13), (px + 0.14, py + 0.01, zt + 0.17)], [[0, 1, 2]], ctx.palette['accent'], jitter=0.0)
    hx, hy = 0.02, -0.72
    hut(F, hx, hy, h(hx, hy) - 0.01, 0.9, snow, ctx.palette['accent'], trunk, rz=-0.25)
    cloud_col = _mix(snow, '#ffffff', 0.5)
    cloud(F, -0.95, 0.1, 1.75, 0.9, cloud_col)
    cloud(F, 1.05, 0.2, 1.2, 0.65, cloud_col)
    st.add_floor(0.0)
    return 0.3


# ----------------------------------------------------------------------------- motif: iceberg
def berg(ctx, st, F, pal):
    rng = ctx.rng
    land, rock, foliage, snow, water = pal
    seed = Vector((rng.uniform(0, 50), rng.uniform(0, 50), 0))
    ice, ice_lo = _mix(snow, '#ffffff', 0.4), _mix(snow, water, 0.38)
    # sea: an irregular faceted disc with a low swell
    nb, R = 30, 1.5
    pts = [(R * math.cos(math.tau * i / nb) * (1 + rng.uniform(-0.03, 0.03)), 0.8 * R * math.sin(math.tau * i / nb) * (1 + rng.uniform(-0.03, 0.03))) for i in range(nb)]
    step = 0.3
    for iy in range(-6, 7):
        for ix in range(-7, 8):
            x, y = (ix + (0.5 if iy % 2 else 0.0) + rng.uniform(-0.32, 0.32)) * step, (iy + rng.uniform(-0.32, 0.32)) * step * 0.9
            if math.hypot(x, y / 0.8) < R * 0.92:
                pts.append((x, y))
    v2, tris = _delaunay(pts)
    sea = [(x, y, 0.06 + (0.0 if i < nb else 0.035 * noise.noise(Vector((x * 2.4, y * 2.4, 1)) + seed))) for i, (x, y) in enumerate(v2)]
    deep = _mix(water, '#0b1c3a', 0.3)
    F.add(sea, tris, lambda c, n: _mix(water, snow, 0.16) if n.z > 0.9985 else (water if rng.random() < 0.7 else _mix(water, deep, 0.4)), jitter=0.05)
    rim = len(F.v) - len(sea)
    low = []
    for i in range(nb):
        x, y, _ = sea[i]
        F.v.append((x * 0.97, y * 0.97, -0.16))
        low.append(len(F.v) - 1)
    for f in _zip_rings([rim + i for i in range(nb)], low):
        F.f.append(f)
        F.c.append(F._colour(deep, 0.04))

    def iceberg(cx, cy, r, hgt, lean, n=9):
        rings, prev = [(1.0, 0.0), (0.92, 0.3), (0.66, 0.62), (0.34, 0.86)], None
        a0 = rng.uniform(0, math.tau)
        for k, zf in rings:
            cur = []
            m = n if k > 0.5 else max(4, n - 4)
            for i in range(m):
                t = a0 + math.tau * (i + rng.uniform(-0.22, 0.22)) / m
                rr = r * k * (1 + rng.uniform(-0.16, 0.16))
                F.v.append((cx + lean * zf * hgt + rr * math.cos(t), cy + 0.85 * rr * math.sin(t), 0.03 + zf * hgt * (1 + rng.uniform(-0.08, 0.08))))
                cur.append(len(F.v) - 1)
            if prev:
                for f in _zip_rings(prev, cur):
                    F.f.append(f)
                    z = sum(F.v[i][2] for i in f) / 3
                    F.c.append(F._colour(ice_lo if z < 0.18 * hgt + 0.05 else ice, 0.03))
            prev = cur
        F.v.append((cx + lean * hgt + rng.uniform(-0.1, 0.1) * r, cy, 0.03 + hgt))
        for i in range(len(prev)):
            F.f.append([prev[i], prev[(i + 1) % len(prev)], len(F.v) - 1])
            F.c.append(F._colour(ice, 0.03))

    iceberg(-0.12, 0.14, 0.76, 2.2, -0.08, 10)
    iceberg(0.48, 0.22, 0.48, 1.3, 0.14, 8)
    iceberg(-0.7, -0.02, 0.34, 0.72, -0.12, 7)
    for (x, y, r) in ((0.9, -0.5, 0.2), (-1.02, -0.45, 0.14), (0.2, -0.8, 0.11), (1.1, 0.2, 0.1)):   # floes
        F.blob((x, y, 0.07), r, ice, level=1, wobble=0.2, scale=(1.25, 1.0, 0.3), jitter=0.03)
    # a small boat for scale
    bx, by = 0.42, -0.5
    hull = ctx.palette['accent']
    F.add([(bx - 0.17, by, 0.17), (bx + 0.19, by, 0.17), (bx + 0.11, by - 0.06, 0.07), (bx - 0.11, by - 0.06, 0.07), (bx + 0.11, by + 0.06, 0.07), (bx - 0.11, by + 0.06, 0.07)],
          [[0, 1, 2, 3], [1, 0, 5, 4], [0, 3, 5], [1, 4, 2], [3, 2, 4, 5]], hull, jitter=0.03)
    F.box((bx, by, 0.34), (0.012, 0.012, 0.36), _mix(rock, '#20182a', 0.4), jitter=0.0)
    F.add([(bx + 0.012, by, 0.5), (bx + 0.012, by, 0.21), (bx + 0.16, by, 0.21)], [[0, 1, 2]], _mix(snow, '#ffffff', 0.6), jitter=0.0)
    F.add([(bx - 0.012, by, 0.46), (bx - 0.012, by, 0.21), (bx - 0.11, by, 0.21)], [[0, 1, 2]], _mix(snow, '#ffffff', 0.6), jitter=0.0)
    cloud(F, 1.0, 0.5, 1.7, 0.75, _mix(snow, '#ffffff', 0.5))
    st.add_floor(-0.16)
    return 0.36


# ----------------------------------------------------------------------------- motif: rocket
def rocket(ctx, st, F, pal):
    rng = ctx.rng
    land, rock, foliage, snow, water = pal
    accent = ctx.palette['accent']
    dark = _mix(rock, '#20182a', 0.45)
    body = _mix(snow, '#ffffff', 0.3)
    lean = math.radians(-8)
    cs, sn = math.cos(lean), math.sin(lean)
    lift = 1.28

    def tf(p):
        x, y, z = p
        return (x * cs + z * sn + 0.0, y, -x * sn + z * cs + lift)

    n = 8
    prof = [(0.2, -0.17, dark), (0.29, 0.0, body), (0.37, 0.32, body), (0.37, 0.98, accent), (0.37, 1.13, body), (0.31, 1.52, accent), (0.15, 1.9, accent)]
    rings = []
    for r, z, _ in prof:
        rings.append([(r * math.cos(math.tau * (i + 0.5) / n), r * math.sin(math.tau * (i + 0.5) / n), z) for i in range(n)])
    for k in range(len(prof) - 1):
        verts = [tf(p) for p in rings[k] + rings[k + 1]]
        F.add(verts, [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)], prof[k][2], jitter=0.04)
    F.add([tf(p) for p in rings[-1]] + [tf((0, 0, 2.14))], [[i, (i + 1) % n, n] for i in range(n)], accent, jitter=0.04)
    F.add([tf(p) for p in rings[0]], [list(range(n - 1, -1, -1))], dark, jitter=0.0)
    # fins
    for a in (math.radians(40), math.radians(130), math.radians(220), math.radians(310)):
        ca, sa = math.cos(a), math.sin(a)
        outline = [(0.33, 0.52), (0.33, -0.04), (0.72, -0.36), (0.67, 0.0)]
        verts = []
        for t in (-0.028, 0.028):
            for rho, z in outline:
                verts.append(tf((rho * ca - t * sa, rho * sa + t * ca, z)))
        F.add(verts, [[0, 1, 2, 3], [7, 6, 5, 4], [0, 3, 7, 4], [3, 2, 6, 7], [2, 1, 5, 6]], accent, jitter=0.05)
    # porthole facing the viewer
    phi, R, zc = math.radians(-72), 0.372, 0.68
    c = Vector((R * math.cos(phi), R * math.sin(phi), zc))
    u, v, nrm = Vector((-math.sin(phi), math.cos(phi), 0)), Vector((0, 0, 1)), Vector((math.cos(phi), math.sin(phi), 0))
    outer = [c + (u * math.cos(math.tau * i / 8) + v * math.sin(math.tau * i / 8)) * 0.155 for i in range(8)]
    inner = [c + (u * math.cos(math.tau * i / 8) + v * math.sin(math.tau * i / 8)) * 0.105 + nrm * 0.035 for i in range(8)]
    F.add([tf(p) for p in outer + inner], [[i, (i + 1) % 8, 8 + (i + 1) % 8, 8 + i] for i in range(8)], dark, jitter=0.03)
    F.add([tf(p) for p in inner], [list(range(8))], _mix(water, '#ffffff', 0.2), jitter=0.0)
    # flame: two tiers, hot core colour below
    hot = C.mix_hex(accent, '#ffd45e', 0.72)
    f0 = [(0.19 * math.cos(math.tau * i / 6), 0.19 * math.sin(math.tau * i / 6), -0.17) for i in range(6)]
    f1 = [(0.15 * math.cos(math.tau * (i + 0.5) / 6), 0.15 * math.sin(math.tau * (i + 0.5) / 6), -0.5) for i in range(6)]
    F.add([tf(p) for p in f0 + f1], _zip_rings(list(range(6)), list(range(6, 12))), C.mix_hex(accent, '#ffb03a', 0.45), jitter=0.05)
    F.add([tf(p) for p in f1] + [tf((0.02, 0, -1.02))], [[i, (i + 1) % 6, 6] for i in range(6)], hot, jitter=0.05)
    # launch smoke: a mound of faceted puffs on the ground
    puff, puff2 = _mix(snow, '#ffffff', 0.45), _mix(snow, rock, 0.14)
    spots = [(-0.62, 0.05, 0.4), (0.6, 0.1, 0.42), (-0.2, -0.38, 0.36), (0.28, -0.42, 0.33), (0.05, 0.35, 0.44), (-1.02, -0.12, 0.27), (1.02, -0.1, 0.26),
             (-0.38, 0.12, 0.34), (0.3, 0.1, 0.36), (0.72, -0.4, 0.22), (-0.75, -0.42, 0.22), (0.0, -0.1, 0.4)]
    for i, (x, y, r) in enumerate(spots):
        cz = r * (0.72 if i < 7 else 1.5)
        F.blob((x, y, cz), r, puff if i % 3 else puff2, level=2, wobble=0.1, scale=(1.1, 1.0, 0.92), floor=-cz / r, jitter=0.03)
    # a small cloud passing and a few drifting solids
    cloud(F, 0.98, 0.5, 2.25, 0.7, puff)
    for (x, y, z, r, col) in ((-0.95, 0.2, 2.75, 0.1, hot), (-1.12, 0.3, 1.62, 0.07, water), (0.95, 0.1, 3.05, 0.06, hot), (0.78, 0.0, 1.45, 0.05, snow)):
        F.blob((x, y, z), r, col, level=1, wobble=0.0, jitter=0.06)
    st.add_floor(0.0)
    return 0.24


# ----------------------------------------------------------------------------- motif: abstract solids
def forms(ctx, st, F, pal):
    rng = ctx.rng
    land, rock, foliage, snow, water = pal
    accent = ctx.palette['accent']
    Z = 0.0
    F.blob((0.1, 0.15, Z + 0.86), 0.88, land, level=2, wobble=0.0, jitter=0.08)                    # geodesic ball
    F.cone((-1.02, 0.42, Z), 0.4, 2.05, water, sides=6)                                           # tall spire
    F.cone((-0.72, -0.38, Z), 0.3, 0.9, _mix(water, snow, 0.55), sides=5)
    F.blob((1.12, 0.02, Z + 0.4), 0.46, snow, level=1, wobble=0.2, scale=(1.0, 1.0, 1.2), floor=-0.87, jitter=0.04)   # pale boulder
    F.blob((0.92, -0.62, Z + 0.2), 0.2, accent, level=1, wobble=0.0, jitter=0.07)
    F.blob((-0.2, -0.78, Z + 0.24), 0.25, foliage, level=1, wobble=0.0, jitter=0.07)
    F.cone((0.38, -0.82, Z), 0.19, 0.34, rock, sides=4)
    F.blob((-1.36, -0.42, Z + 0.11), 0.12, accent, level=1, wobble=0.0, jitter=0.06)
    F.blob((0.55, 0.2, Z + 1.95), 0.13, snow, level=1, wobble=0.0, jitter=0.05)                    # one small solid resting on top
    st.add_floor(Z)
    return 0.3


MOTIFS = {'island': island, 'peaks': peaks, 'berg': berg, 'rocket': rocket, 'forms': forms}


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
    st = Stage(ctx, sun_dir=(0.62 * flip, 0.5, -0.62), angle=float(p.get('shadow', 2.5)))
    F = Facets(ctx.rng, jitter=0.055 * float(p.get('jitter', 1.0)))
    pal = [ctx.color(i) for i in range(5)]
    motif = str(p.get('motif', 'island')).lower()
    elev = MOTIFS.get(motif, island)(ctx, st, F, pal)
    F.build()
    view = (0.34 * flip, -1.0, elev)
    width, height = st.fit(view, 20, shadow=0.0 if motif == 'island' else 0.3)
    ctx.frame(width=width, height=height, fov=20, direction=view)
