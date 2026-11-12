"""Inflated Toys — puffy star, heart, flower, cloud, ring, pill and a smiling ball in glossy vinyl,
floating and overlapping in front of a pastel wall with soft shadows."""
import math

import bpy
import numpy as np

import common as C

R_SUBJECT = 1.36      # the group is normalised to this radius around the origin
WALL_GAP = 0.28       # wall this far behind the rearmost toy


# ----------------------------------------------------------------------------- implicit surfaces
def _iso_mesh(field, lo, hi, step, name, mat, levels=1):
    """Quad mesh of the surface ``field(P) == 0`` (negative = inside) within the box lo..hi:
    naive surface nets, then every vertex is pulled onto the exact surface, so mirror
    reflections stay clean."""
    lo, hi = np.asarray(lo, 'f8'), np.asarray(hi, 'f8')
    n = np.maximum(4, np.ceil((hi - lo) / step).astype(int) + 1)
    ax = [lo[a] + step * np.arange(n[a]) for a in range(3)]
    gx, gy, gz = np.meshgrid(*ax, indexing='ij')
    inside = (field(np.stack([gx.ravel(), gy.ravel(), gz.ravel()], 1)) < 0).reshape(n)
    cnt = np.zeros(tuple(n - 1), np.int8)
    for i in (0, 1):
        for j in (0, 1):
            for k in (0, 1):
                cnt += inside[i:n[0] - 1 + i, j:n[1] - 1 + j, k:n[2] - 1 + k]
    active = (cnt > 0) & (cnt < 8)
    idx = np.full(active.shape, -1, np.int64)
    idx[active] = np.arange(int(active.sum()))
    V = lo + (np.argwhere(active) + 0.5) * step

    quads = []
    for axis in range(3):
        sl = [slice(1, -1)] * 3
        a_sl, b_sl = list(sl), list(sl)
        a_sl[axis], b_sl[axis] = slice(None, -1), slice(1, None)
        a, b = inside[tuple(a_sl)], inside[tuple(b_sl)]
        m = a != b
        u, v = [x for x in range(3) if x != axis]
        cells = []
        for du, dv in ((0, 0), (1, 0), (1, 1), (0, 1)):
            c_sl = [slice(None)] * 3
            c_sl[u] = slice(1, None) if du else slice(None, -1)
            c_sl[v] = slice(1, None) if dv else slice(None, -1)
            cells.append(idx[tuple(c_sl)][m])
        q = np.stack(cells, 1)
        rev = a[m] if axis != 1 else ~a[m]
        q[rev] = q[rev][:, ::-1]
        quads.append(q)
    Q = np.concatenate(quads)

    def project(P, rounds=3):
        e = step * 0.2
        for _ in range(rounds):
            f = field(P)
            g = np.stack([(field(P + d) - field(P - d)) / (2 * e) for d in np.eye(3) * e], 1)
            mv = -(f / np.maximum((g * g).sum(1), 1e-12))[:, None] * g
            ln = np.sqrt((mv * mv).sum(1))[:, None]
            P = P + mv * np.minimum(1.0, step / np.maximum(ln, 1e-12))
        return P

    V = project(V)
    e0 = np.concatenate([Q[:, i] for i in range(4)])
    e1 = np.concatenate([Q[:, (i + 1) % 4] for i in range(4)])
    deg = np.bincount(e0, minlength=len(V)) + np.bincount(e1, minlength=len(V))
    for _ in range(3):   # even out the vertex spacing along the surface
        acc = np.zeros_like(V)
        np.add.at(acc, e0, V[e1])
        np.add.at(acc, e1, V[e0])
        V = project(V + 0.6 * (acc / np.maximum(deg, 1)[:, None] - V), 2)

    me = bpy.data.meshes.new(name)
    me.from_pydata(V.tolist(), [], Q.tolist())
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    me.materials.append(mat)
    if levels:
        C.subsurf(ob, levels)
    return ob


def _blend(prims, k):
    """Smooth union (log-sum-exp, so the surface has no curvature seams) of distance functions."""
    def field(P):
        out = np.empty(len(P))
        for s in range(0, len(P), 200000):
            p = P[s:s + 200000]
            D = np.stack([f(p) for f in prims], 1)
            m = D.min(1)
            out[s:s + 200000] = m - k * np.log(np.exp(-(D - m[:, None]) / k).sum(1))
        return out
    return field


def _ball(c, r, squash=(1, 1, 1)):
    c, sq = np.asarray(c, 'f8'), np.asarray(squash, 'f8')
    return lambda P: (np.sqrt((((P - c) / sq) ** 2).sum(1)) - r) * sq.min()


def _round_cone(a, b, r1, r2):
    """Tapered capsule from ``a`` (radius r1) to ``b`` (radius r2)."""
    a, b = np.asarray(a, 'f8'), np.asarray(b, 'f8')
    ba = b - a
    l2 = float(ba @ ba)
    rr = r1 - r2
    a2 = l2 - rr * rr
    il2 = 1.0 / l2

    def f(P):
        pa = P - a
        y = pa @ ba
        z = y - l2
        q = pa * l2 - ba[None, :] * y[:, None]
        x2 = (q * q).sum(1)
        y2, z2 = y * y * l2, z * z * l2
        k = np.sign(rr) * rr * rr * x2
        d_b = np.sqrt(x2 + z2) * il2 - r2
        d_a = np.sqrt(x2 + y2) * il2 - r1
        d_m = (np.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1
        return np.where(np.sign(z) * a2 * z2 > k, d_b, np.where(np.sign(y) * a2 * y2 < k, d_a, d_m))
    return f


def _puff(prims, k, depth, half, s, name, mat):
    """Blend the primitives, squash the result front-to-back (an inflated cushion rather than a
    ball) and mesh it."""
    blend = _blend(prims, k)
    sq = np.array([1.0, 1.0 / depth, 1.0])
    field = lambda P: blend(P * sq) * depth
    return _iso_mesh(field, (-half, -half * depth * 0.75, -half), (half, half * depth * 0.75, half), 0.02 * s, name, mat)


# ----------------------------------------------------------------------------- the toys
# Each maker builds its parts facing the camera (-Y) at unit size and returns them as a list.
def _star(rng, mats):
    prims = [_ball((0, 0, 0), 0.3)]
    for i in range(5):
        a = math.radians(90 + 72 * i)
        prims.append(_round_cone((0, 0, 0), (math.cos(a) * 0.6, 0, math.sin(a) * 0.6), 0.25, 0.085))
    return [_puff(prims, 0.05, 0.66, 0.82, 1.0, 'Star', mats[0])]


def _heart(rng, mats):
    tip = (0.0, 0.0, -0.4)
    prims = [_round_cone(tip, (-0.235, 0, 0.15), 0.07, 0.29), _round_cone(tip, (0.235, 0, 0.15), 0.07, 0.29),
             _ball((0, 0, -0.04), 0.24)]
    return [_puff(prims, 0.045, 0.74, 0.74, 1.0, 'Heart', mats[0])]


def _flower(rng, mats):
    n = 6
    prims = [_ball((0, 0, 0), 0.25)]
    for i in range(n):
        a = math.tau * i / n + math.pi / 2
        prims.append(_ball((math.cos(a) * 0.36, 0, math.sin(a) * 0.36), 0.205))
    petals = _puff(prims, 0.022, 0.62, 0.74, 1.0, 'Flower', mats[0])
    eye = C.add_sphere(0.17, mats[1], segments=64, location=(0, -0.13, 0), scale=(1, 0.62, 1))
    return [petals, eye]


def _cloud_toy(rng, mats):
    prims = [_ball((-0.3, 0, -0.07), 0.22), _ball((-0.04, 0, 0.09), 0.3), _ball((0.27, 0, 0.0), 0.25),
             _ball((0.47, 0, -0.1), 0.15), _ball((-0.49, 0, -0.12), 0.14), _ball((0.05, 0, -0.12), 0.2)]
    return [_puff(prims, 0.05, 0.78, 0.84, 1.0, 'Cloud', mats[0])]


def _ring(rng, mats):
    return [C.add_torus(0.36, 0.17, mats[0], rotation=(math.radians(90), 0, 0))]


def _pill(rng, mats):
    ob = C.add_capsule(0.2, 0.96, mats[0])
    ob.data.materials.append(mats[1])
    for poly in ob.data.polygons:                 # two-tone, like a capsule
        if poly.center.z > 0:
            poly.material_index = 1
    return [ob]


def _smiley(rng, mats):
    r = 0.42
    ball = C.add_sphere(r, mats[0])
    ink = mats[2]

    def on_ball(az, el, lift=1.0):
        az, el = math.radians(az), math.radians(el)
        return (r * lift * math.sin(az) * math.cos(el), -r * lift * math.cos(az) * math.cos(el), r * lift * math.sin(el))

    parts = [ball]
    for sx in (-1, 1):
        eye = C.add_sphere(1.0, ink, segments=32, location=on_ball(21 * sx, 14, 0.985), scale=(0.05, 0.03, 0.082))
        eye.rotation_euler = (math.radians(14), 0, math.radians(21 * sx))
        parts.append(eye)
    cu = bpy.data.curves.new('Smile', 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth, cu.bevel_resolution, cu.use_fill_caps = 0.024, 8, True
    sp = cu.splines.new('POLY')
    n = 28
    sp.points.add(n)
    for i in range(n + 1):
        t = i / n * 2 - 1
        x, y, z = on_ball(31 * t, -12 - 13 * (1 - t * t), 0.995)
        sp.points[i].co = (x, y, z, 1.0)
    smile = bpy.data.objects.new('Smile', cu)
    bpy.context.scene.collection.objects.link(smile)
    cu.materials.append(ink)
    parts.append(smile)
    for t in (-1, 1):
        parts.append(C.add_sphere(0.024, ink, segments=24, location=on_ball(31 * t, -12, 0.995)))
    return parts


def _is_red(h):
    """True for strong reds, crimsons and red-oranges."""
    r, g, b = C.hex_to_rgb(h)
    hi, lo = max(r, g, b), min(r, g, b)
    if hi < 0.45 or hi - lo < 0.45 * hi:
        return False
    hue = (60 * ((g - b) / (hi - lo)) % 360) if hi == r else (120 + 60 * (b - r) / (hi - lo)) if hi == g else (240 + 60 * (r - g) / (hi - lo))
    return hue >= 338 or hue <= 26


def _points(obs, stride=2):
    """World-space sample of the mesh vertices of ``obs`` (for spacing and framing)."""
    bpy.context.view_layer.update()
    out = []
    for ob in obs:
        if ob.type != 'MESH':
            continue
        co = np.empty(len(ob.data.vertices) * 3, 'f4')
        ob.data.vertices.foreach_get('co', co)
        co = co.reshape(-1, 3)[::stride].astype('f8')
        mw = np.array(ob.matrix_world)
        out.append(co @ mw[:3, :3].T + mw[:3, 3])
    return np.concatenate(out)


def _enclosing_circle(xz):
    """Smallest circle around 2D points (convex hull, then the incremental algorithm).
    Returns (centre_x, centre_y, radius)."""
    pts = sorted(set(map(tuple, np.round(xz, 5).tolist())))
    if len(pts) < 3:
        c = np.mean(pts, 0)
        return float(c[0]), float(c[1]), max(math.dist(c, q) for q in pts)

    def half(seq):
        out = []
        for q in seq:
            while len(out) >= 2 and ((out[-1][0] - out[-2][0]) * (q[1] - out[-2][1]) - (out[-1][1] - out[-2][1]) * (q[0] - out[-2][0])) <= 0:
                out.pop()
            out.append(q)
        return out[:-1]

    hull = half(pts) + half(pts[::-1])
    eps = 1e-9

    def through(a, b, c=None):
        if c is None:
            return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, math.dist(a, b) / 2)
        d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]))
        if abs(d) < 1e-12:
            return max((through(a, b), through(a, c), through(b, c)), key=lambda t: t[2])
        ux = ((a[0] ** 2 + a[1] ** 2) * (b[1] - c[1]) + (b[0] ** 2 + b[1] ** 2) * (c[1] - a[1]) + (c[0] ** 2 + c[1] ** 2) * (a[1] - b[1])) / d
        uy = ((a[0] ** 2 + a[1] ** 2) * (c[0] - b[0]) + (b[0] ** 2 + b[1] ** 2) * (a[0] - c[0]) + (c[0] ** 2 + c[1] ** 2) * (b[0] - a[0])) / d
        return (ux, uy, math.dist((ux, uy), a))

    inside = lambda q, o: math.dist(q, o[:2]) <= o[2] + eps
    circ = (hull[0][0], hull[0][1], 0.0)
    for i, p in enumerate(hull):
        if inside(p, circ):
            continue
        circ = (p[0], p[1], 0.0)
        for j, q in enumerate(hull[:i]):
            if inside(q, circ):
                continue
            circ = through(p, q)
            for r in hull[:j]:
                if not inside(r, circ):
                    circ = through(p, q, r)
    return circ


def build(ctx):
    rng, pal = ctx.rng, ctx.palette
    flip = -1.0 if ctx.mirror else 1.0
    p = ctx.params

    # --- materials
    finish = str(p.get('finish', 'vinyl')).lower()

    def skin(c):
        if finish == 'matte':
            return C.material('Rubber', c, roughness=0.55, sheen=0.3, specular=0.4)
        if finish == 'foil':
            return C.material('Foil', c, roughness=0.16, metallic=1.0, coat=0.5, coat_roughness=0.05)
        return C.material('Vinyl', c, roughness=0.2, coat=1.0, coat_roughness=0.035, specular=0.5)

    pale = lambda h: min(C.hex_to_rgb(h)) > 0.82
    vivid = [c for c in ctx.colors if not pale(c)] or list(ctx.colors)
    light = [c for c in ctx.colors if pale(c)]
    brightest = max(vivid, key=C.luminance)
    white = light[0] if light else C.mix_hex(brightest, '#ffffff', 0.86)
    # the smiling ball is the one plain disc in the set: bright, and never red or crimson
    calm = sorted((c for c in vivid if not _is_red(c)), key=C.luminance) or [C.mix_hex(brightest, '#ffffff', 0.6)]
    face_col = calm[-1] if C.luminance(calm[-1]) > 0.2 else C.mix_hex(calm[-1], '#ffffff', 0.45)
    rng.shuffle(vivid)
    vivid.sort(key=lambda c: C.luminance(c) < 0.04)       # near-black colours never get the hero
    ink_hex = pal['ink'] if C.luminance(pal['ink']) < 0.1 else '#1b1a1f'
    ink = C.material('Ink', ink_hex, roughness=0.3, coat=1.0)

    # --- which toys, and who is the hero
    count = max(5, min(7, int(p.get('count', 6))))
    heroes = [_star, _heart, _flower] + ([_smiley] if p.get('face', True) else [])
    rng.shuffle(heroes)
    others = [_cloud_toy, _ring, _pill] + heroes[1:]
    rng.shuffle(others)
    makers = [heroes[0]] + others[:count - 1]

    # hero in the middle; the rest alternate in front of / behind it so they can overlap
    near = 0.52 if makers[0] is _smiley else 0.36          # a ball is deeper than the cushions
    slots = [(0.0, 0.0, 0.0, 1.0), (-0.58, -near, 0.44, 0.66), (0.62, near, 0.4, 0.7), (-0.56, near, -0.48, 0.66),
             (0.6, -near, -0.5, 0.62), (0.1, near + 0.06, 0.9, 0.52), (-0.06, -near - 0.06, -0.92, 0.48)]
    groups, clouds = [], []
    turn = 0
    for i, make in enumerate(makers):
        c1 = vivid[turn % len(vivid)]
        c2 = vivid[(turn + 1) % len(vivid)]
        if make is _cloud_toy:
            c1 = white                                   # clouds are always pale
        elif make is _smiley:
            c1 = face_col
        else:
            turn += 1
        if make is _pill:
            c2 = white
        elif make is _flower and (c2 == c1 or _is_red(c2)):
            c2 = white                                   # the flower's round eye is never a red disc
        parts = make(rng, (skin(c1), skin(c2), ink))
        root = bpy.data.objects.new('Toy%d' % i, None)
        bpy.context.scene.collection.objects.link(root)
        for ob in parts:
            ob.parent = root
        x, y, z, s = slots[i]
        root.location = (x * flip + rng.uniform(-0.05, 0.05), y, z + rng.uniform(-0.05, 0.05))
        root.scale = (s, s, s)
        lean = 1.0 if make not in (_ring, _pill) else 1.8
        root.rotation_euler = (math.radians(rng.uniform(-14, 14) * lean), math.radians(rng.uniform(-24, 24) if i else rng.uniform(-10, 10)),
                               math.radians(rng.uniform(-20, 20) * lean))
        if make is _pill:
            root.rotation_euler.y = math.radians(rng.choice((-1, 1)) * rng.uniform(35, 60))
        groups.append(root)
        clouds.append(_points(parts))

    # --- normalise: centre on the origin and fit R_SUBJECT exactly, whatever the seed
    pts = np.concatenate(clouds)
    cx, cz, reach = _enclosing_circle(pts[:, [0, 2]])
    k = (R_SUBJECT - 0.02) / reach
    for root in groups:
        root.location = ((root.location.x - cx) * k, root.location.y * k, (root.location.z - cz) * k)
        root.scale = tuple(v * k for v in root.scale)

    # --- set + light: wall at exactly the palette background, soft sun, window-shaped highlights
    wall = C.add_plane(240, C.material('Wall', pal['bg'], roughness=0.95, specular=0.0))
    wall.rotation_euler = (math.radians(90), 0, 0)
    wall.location = (0, float(pts[:, 1].max()) * k + WALL_GAP, 0)
    ambient = 0.56
    sun_dir = (0.3 * flip, 0.86, -0.4)
    cos_wall = sun_dir[1] / math.sqrt(sum(v * v for v in sun_dir))
    C.set_world('#ffffff', ambient)
    sun = C.add_sun(sun_dir, strength=(1.0 - ambient) * math.pi / cos_wall, angle=float(p.get('shadow', 16.0)))
    cards = [C.add_softbox((-3.6 * flip, -4.6, 3.8), (3.4, 4.6), strength=5.0),
             C.add_softbox((4.2 * flip, -2.6, -1.0), (1.2, 5.0), strength=2.2),
             C.add_softbox((0.5 * flip, -1.5, 5.0), (5.0, 1.2), strength=3.0)]
    for ob in [sun] + cards:
        for attr in (('visible_glossy',) if ob is sun else ('visible_diffuse', 'visible_shadow')):
            try:
                setattr(ob, attr, False)       # cards only make highlights: the wall exposure stays exact
            except Exception:
                pass

    ctx.frame(radius=R_SUBJECT * 1.12, fov=20, direction=(0.0, -1.0, 0.03))   # a little air for the shadows
