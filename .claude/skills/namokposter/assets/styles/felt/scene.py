"""Needle Felt — soft, slightly lumpy wool forms with a halo of loose fibres, standing on a sheet of
felt in the poster's colour: a big soft key light and a warm rim from behind that catches the fuzz.

The technique is the style; ``motif`` chooses what is felted: hills (a little landscape),
fruit (a still life) or pebbles (an abstract stack of felted stones, rings and balls)."""
import math

import bmesh
import bpy
import numpy as np

import common as C

FIBRE = 0.03          # length of a loose fibre (world units; the subjects are ~2–3 units wide)


# ----------------------------------------------------------------------------- wool
def _felt(name, color, bump=1.0, mottle=1.0, sheen=0.85):
    """Matte wool: strong sheen, a faint mottling of the dye and (optionally) a fine tooth.
    Procedural textures are paid for at every bounce, so both are kept to one cheap noise each."""
    mat = C.material(name, color, roughness=0.96, sheen=sheen, specular=0.1)
    try:
        nt = mat.node_tree
        bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        for key, val in (('Sheen Roughness', 0.45), ('Sheen Tint', C.col(C.mix_hex(color, '#ffffff', 0.55)))):
            if bsdf.inputs.get(key) is not None:
                try:
                    bsdf.inputs[key].default_value = val
                except Exception:
                    pass
        tc = nt.nodes.new('ShaderNodeTexCoord')
        if mottle > 0:        # large soft clouds, a few percent lighter / darker
            cloud = nt.nodes.new('ShaderNodeTexNoise')
            cloud.inputs['Scale'].default_value = 2.6
            cloud.inputs['Detail'].default_value = 1.0
            mix = nt.nodes.new('ShaderNodeMixRGB')
            mix.inputs[1].default_value = C.col(C.mix_hex(color, '#000000', 0.10 * mottle))
            mix.inputs[2].default_value = C.col(C.mix_hex(color, '#ffffff', 0.09 * mottle))
            nt.links.new(tc.outputs['Object'], cloud.inputs['Vector'])
            nt.links.new(cloud.outputs[0], mix.inputs[0])
            nt.links.new(mix.outputs[0], bsdf.inputs['Base Color'])
        if bump > 0:
            fine = nt.nodes.new('ShaderNodeTexNoise')
            fine.inputs['Scale'].default_value = 95.0
            fine.inputs['Detail'].default_value = 1.0
            b = nt.nodes.new('ShaderNodeBump')
            b.inputs['Strength'].default_value = min(1.0, 0.6 * bump)
            b.inputs['Distance'].default_value = 0.012
            nt.links.new(tc.outputs['Object'], fine.inputs['Vector'])
            nt.links.new(fine.outputs[0], b.inputs['Height'])
            nt.links.new(b.outputs['Normal'], bsdf.inputs['Normal'])
    except Exception:
        pass
    return mat


def _fibre_mat(color):
    """Loose fibres: the wool colour, each strand a little lighter or darker."""
    mat = C.material('Fibre', color, roughness=0.9, sheen=0.6, specular=0.1)
    try:
        nt = mat.node_tree
        bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        info = nt.nodes.new('ShaderNodeHairInfo')
        mix = nt.nodes.new('ShaderNodeMixRGB')
        mix.inputs[1].default_value = C.col(C.mix_hex(color, '#000000', 0.12))
        mix.inputs[2].default_value = C.col(C.mix_hex(color, '#ffffff', 0.24))
        nt.links.new(info.outputs['Random'], mix.inputs[0])
        nt.links.new(mix.outputs[0], bsdf.inputs['Base Color'])
    except Exception:
        pass
    return mat


def _scatter(ob, density, rs, floor):
    """Area-weighted random points (and normals) on a mesh object, in world space."""
    me = ob.data
    me.calc_loop_triangles()
    nv, nt_ = len(me.vertices), len(me.loop_triangles)
    if not nt_:
        return np.zeros((0, 3)), np.zeros((0, 3))
    co = np.empty(nv * 3, 'f4')
    me.vertices.foreach_get('co', co)
    no = np.empty(nv * 3, 'f4')
    me.vertices.foreach_get('normal', no)
    tri = np.empty(nt_ * 3, 'i4')
    me.loop_triangles.foreach_get('vertices', tri)
    co, no, tri = co.reshape(-1, 3).astype('f8'), no.reshape(-1, 3).astype('f8'), tri.reshape(-1, 3)
    mw = np.array(ob.matrix_world)
    co = co @ mw[:3, :3].T + mw[:3, 3]
    no = no @ np.linalg.inv(mw[:3, :3])
    a, b, c = co[tri[:, 0]], co[tri[:, 1]], co[tri[:, 2]]
    area = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)
    n = int(area.sum() * density)
    if n <= 0:
        return np.zeros((0, 3)), np.zeros((0, 3))
    pick = rs.choice(nt_, n, p=area / area.sum())
    u, v = rs.random(n), rs.random(n)
    sw = u + v > 1
    u[sw], v[sw] = 1 - u[sw], 1 - v[sw]
    w = 1 - u - v
    t = tri[pick]
    P = co[t[:, 0]] * w[:, None] + co[t[:, 1]] * u[:, None] + co[t[:, 2]] * v[:, None]
    N = no[t[:, 0]] * w[:, None] + no[t[:, 1]] * u[:, None] + no[t[:, 2]] * v[:, None]
    N /= np.maximum(np.linalg.norm(N, axis=1), 1e-9)[:, None]
    keep = P[:, 2] > floor + 0.004
    return P[keep], N[keep]


def _fuzz(P, N, mat, rs, length=FIBRE, radius=0.001, stray=0.09, steps=4):
    """Loose wool fibres as hair curves: most lie matted along the surface, a share stands out and
    makes the fuzzy silhouette."""
    n = len(P)
    if n == 0:
        return None
    r = rs.normal(size=(n, 3))
    t = r - (r * N).sum(1)[:, None] * N
    t /= np.maximum(np.linalg.norm(t, axis=1), 1e-9)[:, None]
    b = np.cross(N, t)
    out = rs.random(n) < stray
    L = length * rs.uniform(0.45, 1.0, n) * np.where(out, 1.3, 1.0)
    up = np.where(out, rs.uniform(0.5, 1.6, n), rs.uniform(0.02, 0.3, n))
    d0 = t + N * up[:, None]
    d0 /= np.linalg.norm(d0, axis=1)[:, None]
    curl = rs.normal(size=n) * 1.1                      # sideways curl
    arch = rs.normal(size=n) * 0.5 - np.where(out, 0.35, 0.1)   # bends back towards the surface
    pts = np.empty((n, steps, 3))
    pos = P + N * 0.0015
    seg = (L / (steps - 1))[:, None]
    for k in range(steps):
        pts[:, k] = pos
        f = k / (steps - 1)
        d = d0 + b * (curl * f)[:, None] + N * (arch * f)[:, None]
        d /= np.linalg.norm(d, axis=1)[:, None]
        pos = pos + d * seg
    rad = np.linspace(1.0, 0.45, steps)[None, :] * (radius * rs.uniform(0.7, 1.25, n))[:, None]
    try:
        cu = bpy.data.hair_curves.new('Fuzz')
        cu.add_curves([steps] * n)
        cu.points.foreach_set('position', pts.astype('f4').ravel())
        cu.points.foreach_set('radius', rad.astype('f4').ravel())
        ob = bpy.data.objects.new('Fuzz', cu)
        bpy.context.scene.collection.objects.link(ob)
        cu.materials.append(mat)
        return ob
    except Exception:
        return None


# ----------------------------------------------------------------------------- forms
def _lumps(co, rs, strength, scale=2.2):
    """Smooth pseudo-noise at the points ``co`` (sum of a few random plane waves), -1..1."""
    out = np.zeros(len(co))
    for i in range(5):
        k = rs.normal(size=3) * scale * (1.0 + 0.5 * i)
        out += np.sin(co @ k + rs.uniform(0, math.tau)) / (1.0 + 0.6 * i)
    return strength * out / 2.2


class Felt:
    """Collects the felted pieces so the fibres can be scattered once everything is in place."""

    def __init__(self, ctx, floor, bump=1.0):
        self.ctx, self.floor, self.bump = ctx, floor, bump
        self.rs = np.random.default_rng(ctx.rng.randrange(1 << 30))
        self.pieces = []          # (object, colour hex, density factor)
        self.fuzz = []
        self._mats = {}

    def mat(self, color):
        if color not in self._mats:
            self._mats[color] = _felt('Felt', color, bump=self.bump)
        return self._mats[color]

    def add(self, ob, color, fuzz=1.0):
        self.pieces.append((ob, color, fuzz))
        return ob

    def blob(self, centre, radii, color, lump=0.035, rot=(0, 0, 0), sub=5, fuzz=1.0, squash=None):
        """A felted ball / pebble / mound: an ellipsoid with soft lumps."""
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
        ob = C.finish_mesh('Blob', bm, True, self.mat(color))
        me = ob.data
        co = np.empty(len(me.vertices) * 3, 'f4')
        me.vertices.foreach_get('co', co)
        co = co.reshape(-1, 3).astype('f8')
        rad = np.array((radii, radii, radii) if isinstance(radii, (int, float)) else radii, 'f8')
        d = 1.0 + _lumps(co * 1.0, self.rs, lump / max(1e-6, float(rad.min())) * 0.6)
        co = co * d[:, None]
        if squash:                       # flatten the underside a little (things that sit)
            low = co[:, 2] < -squash
            co[low, 2] = -squash - (-(co[low, 2] + squash)) * 0.35
        co = co * rad
        me.vertices.foreach_set('co', co.astype('f4').ravel())
        me.update()
        ob.rotation_euler = rot
        ob.location = centre
        return self.add(ob, color, fuzz)

    def lathe(self, profile, color, location, rot=(0, 0, 0), fuzz=1.0, segments=72, lump=0.02):
        ob = C.add_lathe(profile, self.mat(color), segments=segments, location=location, rotation=rot)
        me = ob.data
        co = np.empty(len(me.vertices) * 3, 'f4')
        me.vertices.foreach_get('co', co)
        co = co.reshape(-1, 3).astype('f8')
        r = np.hypot(co[:, 0], co[:, 1])
        k = 1.0 + _lumps(co, self.rs, lump, 3.0) * (r > 1e-5)
        co[:, 0] *= k
        co[:, 1] *= k
        me.vertices.foreach_set('co', co.astype('f4').ravel())
        me.update()
        return self.add(ob, color, fuzz)

    def tube(self, pts, radius, color, fuzz=1.0, seg=14):
        """A felt cord along a polyline (stems, handles)."""
        bm = bmesh.new()
        rings = []
        P = [np.array(p, 'f8') for p in pts]
        for i, p in enumerate(P):
            t = P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]
            t /= np.linalg.norm(t)
            a = np.cross(t, (0.0, 1.0, 0.0))
            if np.linalg.norm(a) < 1e-3:
                a = np.cross(t, (1.0, 0.0, 0.0))
            a /= np.linalg.norm(a)
            b = np.cross(t, a)
            rr = radius if not callable(radius) else radius(i / (len(P) - 1))
            rings.append([bm.verts.new(tuple(p + rr * (math.cos(math.tau * j / seg) * a + math.sin(math.tau * j / seg) * b))) for j in range(seg)])
        for r0, r1 in zip(rings[:-1], rings[1:]):
            for j in range(seg):
                k = (j + 1) % seg
                bm.faces.new((r0[j], r0[k], r1[k], r1[j]))
        for ring, p, flip in ((rings[0], P[0], True), (rings[-1], P[-1], False)):
            c = bm.verts.new(tuple(p))
            for j in range(seg):
                k = (j + 1) % seg
                bm.faces.new((c, ring[k], ring[j]) if flip else (c, ring[j], ring[k]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return self.add(C.finish_mesh('Cord', bm, True, self.mat(color)), color, fuzz)

    def grow(self, amount=1.0):
        """Scatter the loose fibres over every piece (one curves object per colour)."""
        if amount <= 0:
            return
        bpy.context.view_layer.update()
        by_col = {}
        for ob, color, k in self.pieces:
            P, N = _scatter(ob, 17000.0 * amount * k, self.rs, self.floor)
            if len(P):
                by_col.setdefault(color, []).append((P, N))
        for color, parts in by_col.items():
            P = np.concatenate([p for p, _ in parts])
            N = np.concatenate([n for _, n in parts])
            ob = _fuzz(P, N, _fibre_mat(C.mix_hex(color, '#ffffff', 0.06)), self.rs)
            if ob is not None:
                self.fuzz.append(ob)


def _pale(h):
    return min(C.hex_to_rgb(h)) > 0.8


def _roles(ctx):
    """Palette colours sorted into working roles: vivid wools, one pale wool, a dark 'wood' tone."""
    cols = list(ctx.colors)
    vivid = [c for c in cols if not _pale(c)] or cols
    pale = next((c for c in cols if _pale(c)), None) or C.mix_hex(max(cols, key=C.luminance), '#ffffff', 0.8)
    darkest = min(vivid, key=C.luminance)
    twig = C.mix_hex(C.mix_hex(darkest, '#3a2a20', 0.7), ctx.palette['bg'], 0.12 if ctx.dark else 0.0)
    if ctx.dark:
        twig = C.mix_hex(twig, '#b08a6a', 0.45)
    return vivid, pale, twig


# ----------------------------------------------------------------------------- motifs
# Every motif is built standing on z = 0; ``_fit`` then centres what the camera sees on the origin.
def _hue(h):
    r, g, b = C.hex_to_rgb(h)
    hi, lo = max(r, g, b), min(r, g, b)
    if hi - lo < 1e-6:
        return 0.0
    if hi == r:
        return (60 * ((g - b) / (hi - lo))) % 360
    if hi == g:
        return 120 + 60 * (b - r) / (hi - lo)
    return 240 + 60 * (r - g) / (hi - lo)


def _assign(colors, hues):
    """Give each wanted hue (degrees) the palette colour nearest to it, each colour used once."""
    import itertools
    cols = list(colors)
    while len(cols) < len(hues):
        cols += list(colors)
    dist = lambda c, h: abs((_hue(c) - h + 180) % 360 - 180)
    best = min(itertools.permutations(range(len(cols)), len(hues)), key=lambda perm: sum(dist(cols[i], h) for i, h in zip(perm, hues)))
    return [cols[i] for i in best]


def _hills(ctx, F, flip):
    """A little landscape: three soft hills, cone and ball trees, clouds and a plain sun ball."""
    rng = ctx.rng
    vivid, pale, twig = _roles(ctx)
    v = lambda i: vivid[i % len(vivid)]
    hills = [((-0.42 * flip, 0.62, -0.1), (1.02, 0.62, 1.08), v(0)),
             ((0.72 * flip, 0.28, -0.1), (0.86, 0.56, 0.78), v(1)),
             ((-0.3 * flip, -0.2, -0.08), (0.9, 0.5, 0.46), v(2))]
    for c, r, colr in hills:
        F.blob(c, r, colr, lump=0.03, fuzz=0.7)

    def top(i, x, y):
        (cx, cy, cz), (rx, ry, rz), _ = hills[i]
        q = 1 - ((x - cx) / rx) ** 2 - ((y - cy) / ry) ** 2
        return cz + rz * math.sqrt(max(q, 0.0))

    tree_cols = [C.mix_hex(v(0), '#10261c', 0.42), C.mix_hex(v(1), '#10261c', 0.3), v(3) if len(vivid) > 3 else C.mix_hex(v(2), '#10261c', 0.4)]
    if ctx.dark:
        tree_cols = [C.mix_hex(c, '#ffffff', 0.12) for c in tree_cols]

    def cone_tree(i, x, y, h, colr):
        z = top(i, x, y) - 0.03
        F.tube([(x, y, z), (x, y, z + h * 0.3)], 0.03 * h / 0.5, twig, fuzz=0.6, seg=10)
        w = h * 0.3
        prof = C.fillet_profile([(0, 0), (w, 0), (w * 0.86, h * 0.1), (0.02, h * 0.98), (0, h)], 0.05)
        F.lathe(prof, colr, (x, y, z + h * 0.22), rot=(math.radians(rng.uniform(-4, 4)), math.radians(rng.uniform(-5, 5)), rng.uniform(0, 3)))

    def ball_tree(i, x, y, r, colr):
        z = top(i, x, y) - 0.03
        F.tube([(x, y, z), (x, y, z + r * 1.5)], 0.028, twig, fuzz=0.6, seg=10)
        F.blob((x, y, z + r * 2.1), (r, r, r * 1.08), colr, lump=0.03)

    cone_tree(0, -0.86 * flip, 0.5, 0.56, tree_cols[0])
    cone_tree(0, -0.56 * flip, 0.36, 0.42, tree_cols[1])
    ball_tree(1, 0.98 * flip, 0.1, 0.17, tree_cols[2])
    cone_tree(1, 0.62 * flip, 0.0, 0.36, tree_cols[0])
    cone_tree(2, -0.72 * flip, -0.36, 0.3, tree_cols[1])
    ball_tree(2, 0.12 * flip, -0.5, 0.11, tree_cols[2])

    # sun: a plain felt ball rising behind the saddle between the hills (no rays)
    F.blob((0.3 * flip, 1.3, 0.74), 0.34, ctx.palette['accent'] if not _pale(ctx.palette['accent']) else v(2), lump=0.02)
    # clouds
    cloud = pale if not ctx.dark else C.mix_hex(pale, ctx.palette['bg'], 0.12)
    for cx, cy, cz, s in ((-0.78 * flip, 0.2, 1.72, 1.0), (1.02 * flip, 0.45, 1.42, 0.72)):
        for dx, dz, r in ((-0.26, -0.02, 0.15), (-0.06, 0.06, 0.21), (0.17, 0.02, 0.17), (0.34, -0.04, 0.11)):
            F.blob((cx + dx * s, cy + rng.uniform(-0.03, 0.03), cz + dz * s), (r * s, r * s * 0.9, r * s * 0.92), cloud, lump=0.02, sub=4)


def _fruit(ctx, F, flip):
    """Still life: a pear, an apple, an orange, a plum and a pair of cherries, with felt leaves."""
    vivid, pale, twig = _roles(ctx)
    apple_c, orange_c, pear_c, plum_c = _assign(vivid, (5, 38, 88, 265))
    leaf_c = min(vivid, key=lambda c: abs((_hue(c) - 130 + 180) % 360 - 180))          # the greenest wool
    if leaf_c in (apple_c, orange_c):
        leaf_c = C.mix_hex(pear_c, '#1f3d2a', 0.45)
    elif leaf_c in (pear_c, plum_c):
        leaf_c = C.mix_hex(leaf_c, '#17301f' if not ctx.dark else '#ffffff', 0.35)
    stem = C.mix_hex('#5b3d28', twig, 0.3)

    def leaf(base, length, yaw, tilt, colr):
        ob = F.blob((0, 0, 0), (length * 0.5, length * 0.23, length * 0.06), colr, lump=0.01, sub=4, fuzz=0.9)
        ob.rotation_euler = (0, -tilt, yaw)
        ob.location = (base[0] + math.cos(yaw) * math.cos(tilt) * length * 0.48, base[1] + math.sin(yaw) * math.cos(tilt) * length * 0.48,
                       base[2] + math.sin(tilt) * length * 0.48)

    def profile(pts, n=56):
        """Smooth lathe profile through (radius, z) control points (Catmull-Rom)."""
        P = np.array([pts[0]] + list(pts) + [pts[-1]], 'f8')
        out = []
        for i in range(1, len(P) - 2):
            for k in range(n // (len(P) - 3) + 1):
                t = k / (n // (len(P) - 3) + 1)
                q = 0.5 * ((2 * P[i]) + (-P[i - 1] + P[i + 1]) * t + (2 * P[i - 1] - 5 * P[i] + 4 * P[i + 1] - P[i + 2]) * t * t
                           + (-P[i - 1] + 3 * P[i] - 3 * P[i + 1] + P[i + 2]) * t ** 3)
                out.append((max(float(q[0]), 0.0), float(q[1])))
        out.append((max(float(P[-1][0]), 0.0), float(P[-1][1])))
        out[0], out[-1] = (0.0, out[0][1]), (0.0, out[-1][1])
        return out

    # pear (tallest, behind): a round belly and a narrow shoulder
    px, py, ph = -0.34 * flip, 0.36, 1.06
    F.lathe(profile([(0, 0.02), (0.2, 0.0), (0.36, 0.1), (0.43, 0.3), (0.39, 0.5), (0.28, 0.68), (0.21, 0.84), (0.16, 0.97), (0.08, 1.05), (0, 1.06)]),
            pear_c, (px, py, 0.0), rot=(math.radians(-3), math.radians(5 * flip), 0), lump=0.028)
    F.tube([(px + 0.045 * flip, py, ph - 0.03), (px + 0.06 * flip, py, ph + 0.08), (px + 0.11 * flip, py, ph + 0.16)], 0.022, stem, seg=10)
    leaf((px + 0.07 * flip, py, ph + 0.07), 0.34, math.radians(18 if flip > 0 else 162), math.radians(30), leaf_c)

    # apple (hero, in front): shoulders, and a dimple the stem sits in
    ax, ay, ah = 0.44 * flip, -0.08, 0.8
    F.lathe(profile([(0, 0.07), (0.14, 0.01), (0.3, 0.05), (0.42, 0.24), (0.46, 0.46), (0.41, 0.66), (0.28, 0.79), (0.13, 0.81), (0.04, 0.75), (0, 0.72)]),
            apple_c, (ax, ay, 0.0), rot=(math.radians(4), math.radians(-5 * flip), 0), lump=0.028)
    F.tube([(ax, ay, ah - 0.09), (ax + 0.01 * flip, ay, ah + 0.02), (ax + 0.06 * flip, ay, ah + 0.13)], 0.021, stem, seg=10)
    leaf((ax + 0.01 * flip, ay - 0.02, ah + 0.0), 0.3, math.radians(160 if flip > 0 else 20), math.radians(24), leaf_c)

    # orange with its little green star, plum lying on its side
    F.blob((-0.96 * flip, -0.14, 0.3), 0.31, orange_c, lump=0.02, squash=0.9)
    F.blob((-0.97 * flip, -0.4, 0.42), (0.04, 0.022, 0.04), leaf_c, lump=0.0, sub=3, fuzz=0.5)
    yaw = math.radians(-22 * flip)
    plum = F.blob((1.08 * flip, 0.2, 0.2), (0.29, 0.21, 0.21), plum_c, lump=0.02)
    plum.rotation_euler = (0, math.radians(6), yaw)
    F.tube([(1.08 * flip + 0.27 * math.cos(yaw), 0.2 + 0.27 * math.sin(yaw), 0.21), (1.08 * flip + 0.36 * math.cos(yaw), 0.2 + 0.36 * math.sin(yaw), 0.27)], 0.016, stem, seg=8)

    # cherries on a forked stem
    cc = C.mix_hex(apple_c, '#7a1030', 0.45) if not ctx.dark else C.mix_hex(apple_c, '#ff5a7a', 0.3)
    c1, c2 = (-0.2 * flip, -0.6, 0.125), (0.06 * flip, -0.74, 0.12)
    F.blob(c1, 0.125, cc, lump=0.01, sub=4)
    F.blob(c2, 0.12, cc, lump=0.01, sub=4)
    knot = (-0.1 * flip, -0.58, 0.52)
    for c in (c1, c2):
        mid = ((c[0] + knot[0]) / 2 + (0.06 if c is c2 else -0.05) * flip, (c[1] + knot[1]) / 2, (c[2] + knot[2]) / 2 + 0.08)
        F.tube([(c[0], c[1], c[2] + 0.1), mid, knot], 0.012, stem, seg=8, fuzz=0.7)
    leaf(knot, 0.2, math.radians(200 if flip > 0 else -20), math.radians(10), leaf_c)
    # two loose felt balls as small accents
    F.blob((1.2 * flip, -0.5, 0.075), 0.075, pear_c, lump=0.008, sub=4)
    F.blob((0.9 * flip, -0.7, 0.05), 0.05, pale if not ctx.dark else orange_c, lump=0.005, sub=4)


def _pebbles(ctx, F, flip):
    """Abstract: a balanced stack of felted pebbles, a second low stack, a ring and scattered balls."""
    rng = ctx.rng
    vivid, pale, twig = _roles(ctx)
    order = list(vivid)
    rng.shuffle(order)
    pool = order + [pale]
    v = lambda i: pool[i % len(pool)]

    # main cairn
    z = 0.0
    x, y = -0.1 * flip, 0.1
    sizes = [(0.62, 0.5, 0.26), (0.5, 0.42, 0.22), (0.39, 0.34, 0.19), (0.29, 0.26, 0.16), (0.2, 0.19, 0.13)]
    for i, (rx, ry, rz) in enumerate(sizes):
        ox, oy = rng.uniform(-0.05, 0.05), rng.uniform(-0.03, 0.03)
        F.blob((x + ox, y + oy, z + rz * 0.93), (rx, ry, rz), v(i), lump=0.025, rot=(math.radians(rng.uniform(-4, 4)), math.radians(rng.uniform(-5, 5)), rng.uniform(0, 3)), squash=0.8)
        z += rz * 1.82
        x += ox * 0.5
    F.blob((x + 0.01, y, z + 0.085), 0.1, ctx.palette['accent'], lump=0.008, sub=4)

    # low stack on the lit side
    z = 0.0
    x2, y2 = 0.86 * flip, -0.3
    for i, (rx, ry, rz) in enumerate([(0.34, 0.3, 0.17), (0.24, 0.22, 0.13)]):
        F.blob((x2 + rng.uniform(-0.03, 0.03), y2, z + rz * 0.93), (rx, ry, rz), v(i + 2), lump=0.02, rot=(0, 0, rng.uniform(0, 3)), squash=0.8)
        z += rz * 1.82

    # a felt ring standing in front, leaning back against the cairn
    ring = C.add_torus(0.3, 0.085, F.mat(v(5)), major_segments=96, minor_segments=32,
                       location=(-0.9 * flip, -0.56, 0.365), rotation=(math.radians(74), 0, math.radians(18 * flip)))
    F.add(ring, v(5))
    # scattered balls
    for (bx, by, r), i in zip([(0.3, -0.66, 0.11), (-0.4, -0.86, 0.075), (1.2, 0.16, 0.09), (0.7, -0.8, 0.05)], range(4)):
        F.blob((bx * flip, by, r), r, v(i + 1), lump=0.008, sub=4)


MOTIFS = {'hills': _hills, 'fruit': _fruit, 'pebbles': _pebbles}
VIEW = (0.0, -1.0, 0.2)       # from the origin towards the camera


def _fit(pieces, margin=1.05):
    """Centre the pieces on the origin as the camera sees them. Returns (width, height, floor z)."""
    bpy.context.view_layer.update()
    d = np.array(VIEW) / np.linalg.norm(VIEW)
    up = np.array((0.0, -d[2], -d[1]))            # screen-up for a camera looking along -d
    up = up if up[2] > 0 else -up
    xs, ys = [], []
    for ob, _, _ in pieces:
        co = np.empty(len(ob.data.vertices) * 3, 'f4')
        ob.data.vertices.foreach_get('co', co)
        mw = np.array(ob.matrix_world)
        co = co.reshape(-1, 3)[::3].astype('f8') @ mw[:3, :3].T + mw[:3, 3]
        co = co[co[:, 2] > 0.0]
        xs.append(co[:, 0])
        ys.append(co @ up)
    xs, ys = np.concatenate(xs), np.concatenate(ys)
    cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
    dz = -cy / up[2]
    for ob, _, _ in pieces:
        ob.location.x -= cx
        ob.location.z += dz
    return (xs.max() - xs.min()) * margin + 2 * FIBRE, (ys.max() - ys.min()) * margin + 2 * FIBRE, dz


def build(ctx):
    pal = ctx.palette
    flip = -1.0 if ctx.mirror else 1.0
    p = ctx.params
    motif = str(p.get('motif', 'hills')).lower()
    amount = max(0.0, float(p.get('fuzz', 1.0)))
    F = Felt(ctx, 0.0, bump=0.0 if amount >= 0.5 else 1.0)     # under a coat of fibres the tooth is invisible
    MOTIFS.get(motif, _hills)(ctx, F, flip)
    W, H, floor = _fit(F.pieces)
    F.floor = floor
    F.grow(amount)

    # --- set: a sheet of felt in the poster colour sweeping up behind the pieces
    sheet = _felt('Sheet', pal['bg'], bump=float(p.get('sheet', 0.0)), mottle=0.0, sheen=0.15)
    C.add_backdrop(sheet, floor_z=floor, wall_y=2.6, radius=2.0)

    # --- light: big soft key from the copy side and soft fill; a warm rim from behind that only
    #     touches the wool (light linking), so the sheet stays an even poster colour
    cy = ctx.scene.cycles
    cy.max_bounces, cy.diffuse_bounces = 5, 2
    C.set_world('#ffffff', 0.34)
    C.add_area_light((-5.2 * flip, -5.6, floor + 7.4), energy=float(p.get('key', 1150)), size=5.0, target=(0.3 * flip, 0.6, floor + 0.4))
    warm = float(p.get('rim', 1.0))
    if warm > 0:
        rims = [C.add_area_light((3.4 * flip, 2.2, floor + 3.0), energy=560 * warm, size=1.6, color='#ffcf9a', target=(0, 0, floor + 0.8)),
                C.add_area_light((-3.0 * flip, 2.3, floor + 2.4), energy=190 * warm, size=1.6, color='#ffe2c4', target=(0, 0, floor + 0.8))]
        try:
            coll = bpy.data.collections.new('Wool')
            for ob in [o for o, _, _ in F.pieces] + F.fuzz:
                coll.objects.link(ob)
            for lamp in rims:
                lamp.light_linking.receiver_collection = coll
        except Exception:
            for lamp in rims:                      # no light linking: keep the spill on the sheet small
                lamp.data.energy *= 0.35
    ctx.frame(width=W, height=H, fov=24, direction=VIEW)
