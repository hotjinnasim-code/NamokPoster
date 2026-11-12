"""Liquid Chrome — blobby mirror-chrome forms and droplets floating in front of a plain wall,
reflecting big gradient light cards in the palette colours (Y2K / futuristic)."""
import math
import os
import tempfile

import bpy
import numpy as np

import common as C

R_SUBJECT = 1.32      # the forms are normalised to fit this radius around the origin
WALL_GAP = 0.5       # wall this far behind the rearmost form


# ----------------------------------------------------------------------------- view transform
def _view(scene, rgb):
    """Scene-linear RGB rows -> what the current view transform shows (display-encoded 0..1)."""
    rgb = np.atleast_2d(np.asarray(rgb, 'f8'))
    n = len(rgb)
    img = bpy.data.images.new('poster3d_probe', n, 1, float_buffer=True)
    px = np.ones((n, 4), 'f4')
    px[:, :3] = rgb
    img.pixels.foreach_set(px.ravel())
    st = scene.render.image_settings
    keep = (st.file_format, st.color_mode, st.color_depth)
    path = os.path.join(tempfile.gettempdir(), 'poster3d_probe_%d.png' % os.getpid())
    out = None
    try:
        st.file_format, st.color_mode, st.color_depth = 'PNG', 'RGB', '16'
        img.save_render(path, scene=scene)
        out = bpy.data.images.load(path, check_existing=False)
        out.colorspace_settings.name = 'Non-Color'
        a = np.empty(n * 4, 'f4')
        out.pixels.foreach_get(a)
        return a.reshape(n, 4)[:, :3].astype('f8')
    finally:
        st.file_format, st.color_mode, st.color_depth = keep
        bpy.data.images.remove(img)
        if out is not None:
            bpy.data.images.remove(out)
        try:
            os.remove(path)
        except OSError:
            pass


def _s2l(c):
    c = np.asarray(c, 'f8')
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def _radiance_for(scene, hex_color):
    """Scene-linear radiance that the view transform (AgX) displays as ``hex_color``. AgX is not
    the identity, so the wall is given whatever radiance ends up as the palette background."""
    target = _s2l(np.array(C.hex_to_rgb(hex_color)))
    try:
        x = target + 1e-4
        for _ in range(16):
            shown = _s2l(_view(scene, x)[0])
            x = np.clip(x * ((target + 1e-4) / (shown + 1e-4)) ** 0.9, 1e-5, 40.0)
        return x
    except Exception:
        # rough fit of AgX for pale / dark colours if the probe is unavailable
        return np.clip(target * (1.0 + 2.6 * target ** 2), 1e-5, 40.0)


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


def _donut(major, minor, wobble, phase):
    def f(P):
        ang = np.arctan2(P[:, 2], P[:, 0])
        q = np.sqrt(P[:, 0] ** 2 + P[:, 2] ** 2) - major
        return np.sqrt(q * q + P[:, 1] ** 2) - minor * (1 + wobble * np.sin(2 * ang + phase))
    return f


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


def _warped(field, amp, freq, phase):
    """Low-frequency domain warp: breaks up the 'row of spheres' look."""
    ph = np.asarray(phase, 'f8')
    return lambda P: field(P + amp * np.sin(freq * P[:, [1, 2, 0]] + ph))


# ----------------------------------------------------------------------------- the forms
def _amoeba(rng, s):
    prims, n = [_ball((0, 0, 0), 0.46 * s, (1, 0.9, 1))], rng.choice((3, 4, 4, 5))
    a0 = rng.uniform(0, math.tau)
    for i in range(n):
        a = a0 + math.tau * i / n + rng.uniform(-0.3, 0.3)
        d, r = rng.uniform(0.42, 0.66) * s, rng.uniform(0.22, 0.34) * s
        prims.append(_ball((math.cos(a) * d, rng.uniform(-0.12, 0.12) * s, math.sin(a) * d), r))
        if rng.random() < 0.5:      # a bead pulling away from the lobe
            d2 = d + r + rng.uniform(0.06, 0.14) * s
            prims.append(_ball((math.cos(a + 0.1) * d2, rng.uniform(-0.08, 0.08) * s, math.sin(a + 0.1) * d2), rng.uniform(0.1, 0.14) * s))
    return prims, 0.09 * s, 1.1 * s


def _drip(rng, s):
    prims, bend = [], rng.uniform(0.5, 1.0) * rng.choice((-1, 1))
    radii = [0.36, 0.22, 0.14, 0.18, 0.1]
    x = z = 0.0
    ang = rng.uniform(-0.3, 0.3)
    pts = []
    for i, r in enumerate(radii):
        pts.append((x, z, r))
        stepl = (r + radii[min(i + 1, len(radii) - 1)]) * rng.uniform(0.8, 0.95)
        ang += bend * 0.4
        x, z = x + math.cos(ang) * stepl, z + math.sin(ang) * stepl
    cx, cz = sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)
    for px, pz, r in pts:
        prims.append(_ball(((px - cx) * s, 0.0, (pz - cz) * s), r * s))
    return prims, 0.065 * s, 1.0 * s


def _ring(rng, s):
    prims = [_donut(0.43 * s, 0.13 * s, 0.3, rng.uniform(0, math.tau))]
    a = rng.uniform(0, math.tau)
    prims.append(_ball((math.cos(a) * 0.46 * s, 0.0, math.sin(a) * 0.46 * s), 0.21 * s))
    a += rng.uniform(1.8, 2.6)
    prims.append(_ball((math.cos(a) * 0.5 * s, 0.0, math.sin(a) * 0.5 * s), 0.14 * s))
    return prims, 0.05 * s, 0.82 * s


def _peanut(rng, s):
    a = rng.uniform(0, math.tau)
    dx, dz = math.cos(a) * 0.3 * s, math.sin(a) * 0.3 * s
    prims = [_ball((-dx, 0, -dz), 0.32 * s), _ball((dx * 1.05, 0.0, dz * 1.05), 0.23 * s),
             _ball((dx * 2.15, 0.0, dz * 2.15), 0.11 * s)]
    return prims, 0.09 * s, 0.9 * s


def _teardrop(rng, s):
    """A single drop with one soft tail (no star or burst shapes: nothing radiates from a point)."""
    b = rng.choice((-1, 1)) * rng.uniform(0.6, 1.0)
    prims = [_ball((0, 0, -0.2 * s), 0.3 * s),
             _round_cone((0, 0, -0.12 * s), (0.07 * b * s, 0, 0.2 * s), 0.25 * s, 0.12 * s),
             _round_cone((0.07 * b * s, 0, 0.2 * s), (0.2 * b * s, 0, 0.56 * s), 0.12 * s, 0.035 * s)]
    return prims, 0.05 * s, 0.8 * s


def _make_form(kind, rng, s, mat, name):
    prims, k, half = kind(rng, s)
    field = _warped(_blend(prims, k), 0.022 * s, 2.0 / s, [rng.uniform(0, math.tau) for _ in range(3)])
    return _iso_mesh(field, (-half, -0.6 * s, -half), (half, 0.6 * s, half), 0.021 * s, name, mat)


def _cloud(ob, limit=900):
    """World-space sample of an object's vertices (for spacing the forms and for framing)."""
    bpy.context.view_layer.update()
    co = np.empty(len(ob.data.vertices) * 3, 'f4')
    ob.data.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    co = co[::max(1, len(co) // limit)].astype('f8')
    mw = np.array(ob.matrix_world)
    return co @ mw[:3, :3].T + mw[:3, 3]


def _gap(a, b):
    """Smallest distance between two point sets as the camera sees them (X/Z)."""
    best = 1e9
    b2 = b[:, [0, 2]]
    for s in range(0, len(a), 400):
        d = a[s:s + 400][:, None, [0, 2]] - b2[None]
        best = min(best, float(np.sqrt((d * d).sum(2)).min()))
    return best


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


# ----------------------------------------------------------------------------- environment
def _world(diffuse_strength, stops, tilt):
    """Diffuse rays see plain white (predictable wall exposure); glossy rays see a soft gradient
    'sky' in the palette colours, which is what the chrome mirrors between the light cards."""
    world = C.set_world('#ffffff', diffuse_strength)
    nt = world.node_tree
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_WORLD')
    plain = next(n for n in nt.nodes if n.type == 'BACKGROUND')
    peak = max(max(c) for _, c in stops)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    rot = nt.nodes.new('ShaderNodeMapping')
    rot.vector_type = 'VECTOR'
    rot.inputs['Rotation'].default_value = tilt
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    rng_ = nt.nodes.new('ShaderNodeMapRange')
    rng_.inputs[1].default_value, rng_.inputs[2].default_value = -1.0, 1.0
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    try:
        ramp.color_ramp.interpolation = 'EASE'
    except Exception:
        pass
    els = ramp.color_ramp.elements
    while len(els) < len(stops):
        els.new(0.5)
    for el, (pos, c) in zip(els, sorted(stops)):
        el.position = pos
        el.color = (c[0] / peak, c[1] / peak, c[2] / peak, 1.0)
    sky = nt.nodes.new('ShaderNodeBackground')
    sky.inputs['Strength'].default_value = peak
    path = nt.nodes.new('ShaderNodeLightPath')
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(tc.outputs['Generated'], rot.inputs['Vector'])
    nt.links.new(rot.outputs['Vector'], sep.inputs[0])
    nt.links.new(sep.outputs[2], rng_.inputs[0])
    nt.links.new(rng_.outputs[0], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], sky.inputs['Color'])
    nt.links.new(path.outputs['Is Glossy Ray'], mix.inputs[0])
    nt.links.new(plain.outputs[0], mix.inputs[1])
    nt.links.new(sky.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs[0])


def _card(location, size, a, b, strength, feather=0.3, target=(0, 0, 0)):
    """Gradient light card with feathered edges that exists only in reflections (no camera ray,
    no diffuse light, no shadow) — the colour the chrome picks up."""
    mat = bpy.data.materials.new('Card')
    try:
        mat.use_nodes = True
    except Exception:
        pass
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    try:
        ramp.color_ramp.interpolation = 'EASE'
    except Exception:
        pass
    ramp.color_ramp.elements[0].color = C.col(a)
    ramp.color_ramp.elements[1].color = C.col(b)
    nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    nt.links.new(sep.outputs[0], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], em.inputs['Color'])
    edge = None
    for axis in (0, 1):
        inv = nt.nodes.new('ShaderNodeMath')
        inv.operation = 'SUBTRACT'
        inv.inputs[0].default_value = 1.0
        nt.links.new(sep.outputs[axis], inv.inputs[1])
        mn = nt.nodes.new('ShaderNodeMath')
        mn.operation = 'MINIMUM'
        nt.links.new(sep.outputs[axis], mn.inputs[0])
        nt.links.new(inv.outputs[0], mn.inputs[1])
        ss = nt.nodes.new('ShaderNodeMapRange')
        ss.interpolation_type = 'SMOOTHSTEP'
        ss.inputs[1].default_value, ss.inputs[2].default_value = 0.0, max(1e-3, feather)
        nt.links.new(mn.outputs[0], ss.inputs[0])
        if edge is None:
            edge = ss
        else:
            mul = nt.nodes.new('ShaderNodeMath')
            mul.operation = 'MULTIPLY'
            nt.links.new(edge.outputs[0], mul.inputs[0])
            nt.links.new(ss.outputs[0], mul.inputs[1])
            edge = mul
    em.inputs['Strength'].default_value = strength
    clear = nt.nodes.new('ShaderNodeBsdfTransparent')
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(edge.outputs[0], mix.inputs[0])
    nt.links.new(clear.outputs[0], mix.inputs[1])
    nt.links.new(em.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs[0])

    ob = C.add_plane(1.0, mat)
    ob.scale = (size[0], size[1], 1)
    ob.location = location
    C.look_at(ob, target)
    for attr in ('visible_camera', 'visible_diffuse', 'visible_shadow', 'visible_transmission'):
        try:
            setattr(ob, attr, False)
        except Exception:
            pass
    return ob


def _roles(ctx):
    """Palette roles: two vivid colours for the cards, a third, a deep tone for the troughs and a
    pale highlight."""
    by_lum = sorted(ctx.colors, key=C.luminance)
    sat = lambda h: max(C.hex_to_rgb(h)) - min(C.hex_to_rgb(h))
    vivid = sorted(ctx.colors, key=lambda h: -sat(h) * (0.35 + C.luminance(h)) ** 0.5)
    c_a, c_b, c_c = (vivid[i % len(vivid)] for i in range(3))
    shade = by_lum[0] if C.luminance(by_lum[0]) < 0.06 else C.mix_hex(by_lum[0], '#000000', 0.72)
    pale = C.mix_hex(by_lum[-1], '#ffffff', 0.7)
    return c_a, c_b, c_c, shade, pale


def _environment(ctx, roles, world_strength, flip):
    """What the chrome sees: a soft palette sky plus big gradient cards, front and back."""
    c_a, c_b, c_c, shade, pale = roles
    lin = lambda h, s=1.0: tuple(v * s for v in C.col(h)[:3])
    _world(world_strength, [
        (0.00, lin(shade, 0.5)), (0.30, lin(c_b, 0.5)), (0.47, lin(shade, 0.7)),
        (0.62, lin(c_a, 0.7)), (0.82, lin(c_c, 0.9)), (1.00, lin(pale, 0.9)),
    ], (math.radians(-10), math.radians(-20 * flip), 0))
    rim = 1.0 if not ctx.dark else 1.7
    _card((-4.6 * flip, -4.2, 3.4), (6.4, 6.4), c_a, pale, 2.6, 0.35)             # key: upper, copy side
    _card((4.6 * flip, -3.0, -2.6), (5.0, 5.6), c_b, c_a, 1.5, 0.35)              # fill: lower, far side
    _card((0.6 * flip, -1.2, 5.6), (7.5, 1.1), '#ffffff', pale, 7.0, 0.1)          # crisp top strip
    _card((-4.4 * flip, 3.6, -1.6), (4.2, 6.0), c_b, c_c, 1.2 * rim, 0.3)          # rim cards behind the forms
    _card((4.4 * flip, 3.8, 2.6), (4.2, 6.0), c_c, pale, 1.4 * rim, 0.3)


def build(ctx):
    rng, pal = ctx.rng, ctx.palette
    flip = -1.0 if ctx.mirror else 1.0
    ctx.set_view('AgX', 'Medium High Contrast')
    roles = _roles(ctx)

    # --- wall: its radiance is solved so that AgX shows exactly the palette background
    want = _radiance_for(ctx.scene, pal['bg'])
    level = max(1.0, float(want.max()) / 0.82)                 # radiance of a white card at the wall
    ambient = 0.34
    sun_dir = (0.36 * flip, 0.84, -0.4)
    cos_wall = sun_dir[1] / math.sqrt(sum(v * v for v in sun_dir))
    sun = C.add_sun(sun_dir, strength=(1.0 - ambient) * level * math.pi / cos_wall, angle=float(ctx.params.get('shadow', 14.0)))
    try:
        sun.visible_glossy = False
    except Exception:
        pass

    # --- chrome forms around the origin
    chrome = C.material('Chrome', '#f3f4f7', roughness=float(ctx.params.get('roughness', 0.035)), metallic=1.0)
    n_forms = max(3, min(5, int(ctx.params.get('forms', 4))))
    kinds = [_ring, _drip, _peanut, _teardrop]
    rng.shuffle(kinds)
    sizes = [0.7, 0.7, 0.54, 0.5]
    base = rng.uniform(0, math.tau)
    hero = _make_form(_amoeba, rng, 1.0, chrome, 'Hero')
    hero.rotation_euler = (0, rng.uniform(0, math.tau), 0)
    forms, clouds = [hero], [_cloud(hero)]
    for i in range(n_forms - 1):
        ob = _make_form(kinds[i], rng, sizes[i] * rng.uniform(0.94, 1.06), chrome, 'Form%d' % i)
        ob.rotation_euler = (math.radians(rng.uniform(-18, 18)), rng.uniform(0, math.tau), math.radians(rng.uniform(-18, 18)))
        ang = base + math.tau * i / (n_forms - 1) + rng.uniform(-0.25, 0.25)
        y = rng.uniform(-0.25, 0.3)
        d = 0.35
        while True:      # slide outwards until it clears everything already placed
            ob.location = (math.cos(ang) * d, y, math.sin(ang) * d)
            cl = _cloud(ob)
            if min(_gap(cl, other) for other in clouds) > 0.055 or d > 3:
                break
            d += 0.03
        forms.append(ob)
        clouds.append(cl)
    fx, fz, reach = _enclosing_circle(np.concatenate(clouds)[:, [0, 2]])
    drops = []
    tries = 0
    while len(drops) < max(0, int(ctx.params.get('droplets', 7))) and tries < 600:
        # droplets hug the forms (like splashes) and stay inside the circle the forms already span
        tries += 1
        r = rng.uniform(0.035, 0.075) * (1.9 if not drops else 1.4 if len(drops) == 1 else 1.0)
        a, d = rng.uniform(0, math.tau), (reach - r) * math.sqrt(rng.uniform(0.03, 1.0))
        p = np.array([[fx + math.cos(a) * d, 0.0, fz + math.sin(a) * d]])
        g = min(_gap(p, other) for other in clouds)
        if not (r + 0.03 < g < r + 0.16) or any(math.hypot(p[0, 0] - q[0], p[0, 2] - q[2]) < r + q[3] + 0.05 for q in drops):
            continue
        drops.append((p[0, 0], rng.uniform(-0.3, 0.2), p[0, 2], r))
    for x, y, z, r in drops:
        forms.append(C.add_sphere(r, chrome, segments=64, location=(x, y, z), scale=(1.0, 1.0, rng.uniform(0.9, 1.18)),
                                  rotation=(0, rng.uniform(0, math.tau), 0)))
        clouds.append(_cloud(forms[-1]))

    # --- normalise: centre the group on the origin and make it exactly R_SUBJECT big, whatever the seed
    pts = np.concatenate([_cloud(ob, 20000) for ob in forms])
    cx, cz, reach = _enclosing_circle(pts[:, [0, 2]])
    k = (R_SUBJECT - 0.02) / reach
    for ob in forms:
        ob.location = ((ob.location.x - cx) * k, ob.location.y * k, (ob.location.z - cz) * k)
        ob.scale = tuple(v * k for v in ob.scale)

    # --- the wall, a little behind the rearmost form, then everything the chrome mirrors
    wall = C.add_plane(240, C.material('Wall', tuple(want / level), roughness=0.95, specular=0.0))
    wall.rotation_euler = (math.radians(90), 0, 0)
    wall.location = (0, float(pts[:, 1].max()) * k + WALL_GAP, 0)
    try:
        wall.visible_glossy = False      # the chrome mirrors the light cards, not the set
    except Exception:
        pass
    _environment(ctx, roles, ambient * level, flip)

    ctx.frame(radius=R_SUBJECT * 1.14, fov=20, direction=(0.04 * flip, -1.0, 0.03))   # + air for the shadows
