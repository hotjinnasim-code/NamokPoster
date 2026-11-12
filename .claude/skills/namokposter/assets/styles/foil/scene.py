"""Holographic Foil — mirror-bright metallised film whose reflections break into rainbow
interference colours: inflated mylar balloons with crinkled seams, a crumpled sheet, curled ribbons.

The technique is the material; ``motif`` chooses what is made of it:
  balloons — a cluster of foil balloons (stars, rounds, a heart)
  sheet    — a crumpled disc of foil behind a mirror-smooth sphere
  ribbons  — curled gift ribbons and a burst of confetti
"""
import math
import os
import tempfile

import bpy
import numpy as np

import common as C


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
    """Scene-linear radiance that the view transform (AgX) displays as ``hex_color``."""
    target = _s2l(np.array(C.hex_to_rgb(hex_color)))
    try:
        x = target + 1e-4
        for _ in range(16):
            shown = _s2l(_view(scene, x)[0])
            x = np.clip(x * ((target + 1e-4) / (shown + 1e-4)) ** 0.9, 1e-5, 40.0)
        return x
    except Exception:
        return np.clip(target * (1.0 + 2.6 * target ** 2), 1e-5, 40.0)


# ----------------------------------------------------------------------------- the foil
def _foil(name, colors, tint=None, tint_amount=0.0, rough=0.11, hue=0.8, freq=1.25, crinkle=0.0, film=1.0, seed=0.0):
    """Metallised film. Its colour is not a pigment: it cycles through the palette with the
    direction of the reflection (plus a slow drift over the surface), the way holographic foil
    throws a different colour from every facet. A thin-film layer adds real interference on top."""
    mat = C.material(name, '#e9ecf2', roughness=rough, metallic=1.0)
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mapping = nt.nodes.new('ShaderNodeMapping')
    mapping.inputs['Location'].default_value = (seed * 1.3, seed * -0.7, seed * 0.37)
    nt.links.new(tc.outputs['Object'], mapping.inputs['Vector'])
    P = mapping.outputs[0]

    def math_(op, a, b=None):
        n = nt.nodes.new('ShaderNodeMath')
        n.operation = op
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, bpy.types.NodeSocket):
                nt.links.new(v, n.inputs[i])
            else:
                n.inputs[i].default_value = v
        return n.outputs[0]

    def noise_(scale, detail=2.0):
        n = nt.nodes.new('ShaderNodeTexNoise')
        n.inputs['Scale'].default_value = scale
        n.inputs['Detail'].default_value = detail
        nt.links.new(P, n.inputs['Vector'])
        return n.outputs[0]

    dot = nt.nodes.new('ShaderNodeVectorMath')
    dot.operation = 'DOT_PRODUCT'
    dot.inputs[1].default_value = (0.42, 0.3, 0.86)
    nt.links.new(tc.outputs['Reflection'], dot.inputs[0])
    lw = nt.nodes.new('ShaderNodeLayerWeight')
    lw.inputs['Blend'].default_value = 0.5
    phase = math_('ADD', math_('MULTIPLY', dot.outputs['Value'], freq), math_('MULTIPLY', noise_(1.3), 1.1))
    phase = math_('ADD', phase, math_('MULTIPLY', lw.outputs['Facing'], 0.9))
    phase = math_('FRACT', math_('ADD', phase, seed * 0.173))
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    cyc = list(colors) + [colors[0]]
    els = ramp.color_ramp.elements
    while len(els) < len(cyc):
        els.new(0.5)
    for i, (el, c) in enumerate(zip(els, cyc)):
        el.position = i / (len(cyc) - 1)
        el.color = C.col(C.mix_hex(c, '#ffffff', 0.12))
    nt.links.new(phase, ramp.inputs[0])

    def mix_(fac, a, b):
        n = nt.nodes.new('ShaderNodeMixRGB')
        n.inputs[0].default_value = fac
        for i, v in ((1, a), (2, b)):
            if isinstance(v, bpy.types.NodeSocket):
                nt.links.new(v, n.inputs[i])
            else:
                n.inputs[i].default_value = C.col(v)
        return n.outputs[0]

    base = mix_(hue, '#eef0f5', ramp.outputs[0])
    if tint and tint_amount > 0:
        base = mix_(tint_amount, base, tint)
    nt.links.new(base, bsdf.inputs['Base Color'])

    film_sock = bsdf.inputs.get('Thin Film Thickness')
    if film_sock is not None and film > 0:
        nt.links.new(math_('ADD', math_('MULTIPLY', noise_(2.1, 1.0), 420.0 * film), 330.0), film_sock)
        ior = bsdf.inputs.get('Thin Film IOR')
        if ior is not None:
            ior.default_value = 1.38

    # micro-wrinkles (and, for crumpled foil, a cellular crinkle) through a bump
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.18 + 0.5 * crinkle
    bump.inputs['Distance'].default_value = 0.012
    height = math_('MULTIPLY', noise_(26.0, 3.0), 0.4)
    if crinkle > 0:
        for sc, amp in ((9.0, 1.0), (23.0, 0.45)):
            vor = nt.nodes.new('ShaderNodeTexVoronoi')
            vor.inputs['Scale'].default_value = sc
            nt.links.new(P, vor.inputs['Vector'])
            height = math_('ADD', height, math_('MULTIPLY', vor.outputs[0], amp * crinkle))
    nt.links.new(height, bump.inputs['Height'])
    nt.links.new(bump.outputs[0], bsdf.inputs['Normal'])
    return mat


# ----------------------------------------------------------------------------- environment
def _world(diffuse_strength, stops, tilt):
    """Diffuse rays see plain white (predictable wall exposure); glossy rays see a banded sky —
    the bright and dark the foil needs to mirror."""
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


def _card(location, size, a, b, strength, target=(0, 0, 0), feather=0.3):
    """Gradient light card with soft, rounded edges that exists only in reflections."""
    mat = bpy.data.materials.new('Card')
    try:
        mat.use_nodes = True
    except Exception:
        pass
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Strength'].default_value = strength
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = C.col(a)
    ramp.color_ramp.elements[1].color = C.col(b)
    nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    nt.links.new(sep.outputs[0], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], em.inputs['Color'])
    dist = nt.nodes.new('ShaderNodeVectorMath')
    dist.operation = 'DISTANCE'
    dist.inputs[1].default_value = (0.5, 0.5, 0.0)
    nt.links.new(tc.outputs['Generated'], dist.inputs[0])
    edge = nt.nodes.new('ShaderNodeMapRange')
    edge.interpolation_type = 'SMOOTHSTEP'
    edge.inputs[1].default_value, edge.inputs[2].default_value = 0.5 * (1.0 - feather), 0.5
    edge.inputs[3].default_value, edge.inputs[4].default_value = 1.0, 0.0
    nt.links.new(dist.outputs['Value'], edge.inputs[0])
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


# ----------------------------------------------------------------------------- geometry
def _mesh(name, verts, faces, mat, smooth=True, sharp_edges=None, **kw):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    if smooth:
        me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    me.materials.append(mat)
    ob.location = kw.get('location', (0, 0, 0))
    ob.rotation_euler = kw.get('rotation', (0, 0, 0))
    sc = kw.get('scale', 1.0)
    ob.scale = (sc, sc, sc) if isinstance(sc, (int, float)) else sc
    return ob


def _resample(pts, n):
    """Closed polyline -> n points evenly spaced along it."""
    P = np.asarray(pts, 'f8')
    Q = np.vstack([P, P[:1]])
    seg = np.sqrt(((Q[1:] - Q[:-1]) ** 2).sum(1))
    cum = np.concatenate([[0.0], np.cumsum(seg)])
    t = np.linspace(0.0, cum[-1], n, endpoint=False)
    return np.stack([np.interp(t, cum, Q[:, 0]), np.interp(t, cum, Q[:, 1])], 1)


def _fillet_closed(pts, radii, steps=6):
    out = []
    n = len(pts)
    for i in range(n):
        a, b, c = np.array(pts[i - 1]), np.array(pts[i]), np.array(pts[(i + 1) % n])
        r = radii[i % len(radii)]
        d0, d1 = a - b, c - b
        r = min(r, 0.45 * np.linalg.norm(d0), 0.45 * np.linalg.norm(d1))
        s, e = b + d0 / np.linalg.norm(d0) * r, b + d1 / np.linalg.norm(d1) * r
        for k in range(steps + 1):
            t = k / steps
            out.append((1 - t) ** 2 * s + 2 * (1 - t) * t * b + t ** 2 * e)
    return out


def _outline(kind, n):
    if kind == 'star':
        raw = [((1.0 if i % 2 == 0 else 0.53) * math.cos(math.pi / 2 + math.pi * i / 5), (1.0 if i % 2 == 0 else 0.53) * math.sin(math.pi / 2 + math.pi * i / 5)) for i in range(10)]
        return _resample(_fillet_closed(raw, [0.16, 0.12]), n)
    if kind == 'heart':
        t = np.linspace(0, math.tau, 400, endpoint=False)
        x = 16 * np.sin(t) ** 3
        y = 13 * np.cos(t) - 5 * np.cos(2 * t) - 2 * np.cos(3 * t) - np.cos(4 * t)
        return _resample(np.stack([-x, y + 2.5], 1) / 15.5, n)
    a = np.linspace(0, math.tau, n, endpoint=False)
    return np.stack([np.cos(a), np.sin(a)], 1)


def _dist_to_poly(P, B):
    A, E = B, np.roll(B, -1, 0) - B
    L2 = (E ** 2).sum(1)
    out = np.empty(len(P))
    for s in range(0, len(P), 1500):
        p = P[s:s + 1500][:, None, :]
        t = np.clip(((p - A[None]) * E[None]).sum(2) / L2[None], 0.0, 1.0)
        q = A[None] + t[..., None] * E[None]
        out[s:s + 1500] = np.sqrt(((p - q) ** 2).sum(2)).min(1)
    return out


def _balloon(kind, size, mat, rng, puff=0.46, spokes=420, rings=40, **kw):
    """Two sheets of film sealed along the outline and inflated: a pillow whose cross-section is
    steep at the seam, radial crinkles where the film gathers, a flat seam flange. Faces -Y."""
    B = _outline(kind, spokes)
    s = 1.0 - (1.0 - np.linspace(0.0, 1.0, rings + 1)) ** 2.2          # denser towards the seam
    V = (s[1:, None, None] * B[None]).reshape(-1, 2)                  # rings 1..K
    d = _dist_to_poly(V, B)
    D = float(d.max())
    t = np.clip(d / D, 0.0, 1.0)
    z = puff * D * np.sqrt(np.clip(1.0 - (1.0 - t) ** 2, 0.0, 1.0)) ** 0.9
    # crinkles: sharp little folds running in from the seam, irregular round the outline
    j = np.tile(np.arange(spokes), rings) / spokes * math.tau
    w = np.zeros_like(j)
    for f, amp in ((rng.randint(21, 27), 1.0), (rng.randint(34, 44), 0.7), (rng.randint(55, 70), 0.45)):
        w += amp * np.abs(np.sin(f * j / 2 + rng.uniform(0, math.tau)))
    w = w / 2.15 * (0.55 + 0.45 * np.sin(3 * j + rng.uniform(0, math.tau)) * np.sin(5 * j + rng.uniform(0, math.tau)))
    z *= 1.0 - 0.42 * w * np.exp(-d / (0.17 * D))
    z *= 1.0 + 0.035 * np.sin(2.0 * V[:, 0] * 3 + rng.uniform(0, 6)) * np.cos(2.3 * V[:, 1] * 3 + rng.uniform(0, 6))
    z_c = puff * D

    K, M = rings, spokes
    verts = [(0.0, -z_c, 0.0)]
    verts += [(V[i, 0], -z[i], V[i, 1]) for i in range(K * M)]                           # front rings 1..K (ring K = seam, z = 0)
    back0 = len(verts)
    verts.append((0.0, z_c, 0.0))
    verts += [(V[i, 0], z[i], V[i, 1]) for i in range((K - 1) * M)]                      # back rings 1..K-1
    fl0 = len(verts)
    verts += [(B[k, 0] * 1.045, 0.0, B[k, 1] * 1.045) for k in range(M)]                 # seam flange
    faces = []
    fr = lambda r, k: 1 + (r - 1) * M + (k % M)
    bk = lambda r, k: (back0 + 1 + (r - 1) * M + (k % M)) if r < K else fr(K, k)
    for k in range(M):
        faces.append((0, fr(1, k + 1), fr(1, k)))
        faces.append((back0, bk(1, k), bk(1, k + 1)))
        for r in range(1, K):
            faces.append((fr(r, k), fr(r, k + 1), fr(r + 1, k + 1), fr(r + 1, k)))
            faces.append((bk(r, k), bk(r + 1, k), bk(r + 1, k + 1), bk(r, k + 1)))
        faces.append((fr(K, k), fr(K, k + 1), fl0 + (k + 1) % M, fl0 + k))
    verts = [(x * size, y * size, zz * size) for x, y, zz in verts]
    ob = _mesh('Balloon', verts, faces, mat, **kw)
    try:
        sharp = ob.data.attributes.new('sharp_edge', 'BOOLEAN', 'EDGE')
        seam = set(range(1 + (K - 1) * M, 1 + K * M)) | set(range(fl0, fl0 + M))
        flags = [(e.vertices[0] in seam and e.vertices[1] in seam) for e in ob.data.edges]
        sharp.data.foreach_set('value', flags)
    except Exception:
        pass
    return ob


def _tube(pts, radius, mat, m=8, **kw):
    P = np.asarray(pts, 'f8')
    n = len(P)
    T = np.gradient(P, axis=0)
    T /= np.linalg.norm(T, axis=1)[:, None]
    ref = np.array([0.0, -1.0, 0.0]) if abs(T[0][1]) < 0.9 else np.array([1.0, 0.0, 0.0])
    N = np.zeros_like(P)
    v = ref - (ref @ T[0]) * T[0]
    N[0] = v / np.linalg.norm(v)
    for i in range(1, n):
        v = N[i - 1] - (N[i - 1] @ T[i]) * T[i]
        N[i] = v / np.linalg.norm(v)
    Bn = np.cross(T, N)
    verts, faces = [], []
    for i in range(n):
        for k in range(m):
            a = math.tau * k / m
            verts.append(P[i] + radius * (math.cos(a) * N[i] + math.sin(a) * Bn[i]))
    for i in range(n - 1):
        for k in range(m):
            k2 = (k + 1) % m
            faces.append((i * m + k, i * m + k2, (i + 1) * m + k2, (i + 1) * m + k))
    return _mesh('String', verts, faces, mat, **kw)


def _ribbon(p0, p1, radius, turns, width, mat, rng, n=260, taper=0.6):
    """A curled gift ribbon: a band wound round the line p0 -> p1 like a loose spring."""
    p0, p1 = np.array(p0, 'f8'), np.array(p1, 'f8')
    axis = p1 - p0
    L = np.linalg.norm(axis)
    axis /= L
    ref = np.array([0.0, 1.0, 0.0]) if abs(axis[1]) < 0.8 else np.array([1.0, 0.0, 0.0])
    e1 = np.cross(axis, ref)
    e1 /= np.linalg.norm(e1)
    e2 = np.cross(axis, e1)
    ph0 = rng.uniform(0, math.tau)
    verts, faces = [], []
    for i in range(n + 1):
        t = i / n
        ph = ph0 + math.tau * turns * (t ** 1.15)
        rad = radius * (1.0 - taper * t) * (0.9 + 0.1 * math.sin(7 * t))
        c = p0 + axis * (L * t) + rad * (math.cos(ph) * e1 + math.sin(ph) * e2)
        w = width * (1.0 - 0.25 * t)
        side = axis * math.cos(0.25) + (math.cos(ph) * e1 + math.sin(ph) * e2) * math.sin(0.25)   # slightly coned
        verts += [c - side * w / 2, c, c + side * w / 2]
    for i in range(n):
        a, b = i * 3, (i + 1) * 3
        faces += [(a, a + 1, b + 1, b), (a + 1, a + 2, b + 2, b + 1)]
    return _mesh('Ribbon', verts, faces, mat)


def _crumpled_disc(radius, mat, rng, rings=230, spokes=720, amp=1.0, **kw):
    """A sheet of foil crumpled and smoothed out again: creased cells at two sizes (ridges where
    the cells meet), a slow buckle, a slightly wavy cut edge."""
    off = rng.uniform(0, 50)
    ang = np.linspace(0, math.tau, spokes, endpoint=False)
    edge = radius * (1.0 + 0.012 * np.sin(7 * ang + off) + 0.008 * np.sin(19 * ang + 2 * off))
    rr = np.linspace(0, 1, rings + 1)[1:] ** 0.85
    P = np.stack([(rr[:, None] * (edge * np.cos(ang))[None]).ravel(), (rr[:, None] * (edge * np.sin(ang))[None]).ravel()], 1)

    def worley(count, seed):
        r = np.random.RandomState(seed)
        pts = r.uniform(-radius * 1.1, radius * 1.1, (count, 2))
        out = np.empty(len(P))
        for s in range(0, len(P), 4000):
            dd = P[s:s + 4000][:, None, :] - pts[None]
            out[s:s + 4000] = np.sqrt((dd * dd).sum(2)).min(1)
        return out * math.sqrt(count) / (2.2 * radius)       # ~0..1 whatever the count

    sd = rng.randint(1, 10 ** 6)
    h = 0.085 * worley(46, sd) + 0.034 * worley(260, sd + 1)
    h += 0.05 * np.sin(P[:, 0] * 2.3 + off) * np.cos(P[:, 1] * 1.9 + 2 * off)
    h *= amp
    verts = [(0.0, -float(h[:spokes].mean()), 0.0)] + [(P[k, 0], -h[k], P[k, 1]) for k in range(len(P))]
    faces = []
    at = lambda r, k: 1 + r * spokes + (k % spokes)
    for k in range(spokes):
        faces.append((0, at(0, k + 1), at(0, k)))
        for r in range(rings - 1):
            faces.append((at(r, k), at(r, k + 1), at(r + 1, k + 1), at(r + 1, k)))
    return _mesh('Sheet', verts, faces, mat, **kw)


def _rad(*deg):
    return tuple(math.radians(d) for d in deg)


# ----------------------------------------------------------------------------- motifs
def _balloons(ctx, cols, flip, rng, p):
    string = C.material('String', C.mix_hex(ctx.palette['ink'], ctx.palette['bg'], 0.35), roughness=0.5)
    # (kind, size, x, y, z, tilt-x, yaw, roll)
    plan = [('star', 0.66, -0.16, 0.0, 0.2, -8, 14, 10),
            ('round', 0.5, 0.6, 0.42, 0.5, 6, -20, 0),
            ('heart', 0.47, -0.66, 0.36, -0.42, 4, 22, -12),
            ('round', 0.36, 0.5, -0.26, -0.5, -10, -12, 0),
            ('star', 0.3, -0.84, -0.2, 0.74, 8, 26, -22),
            ('round', 0.2, 0.02, 0.3, -0.9, 0, 10, 0)]
    n = max(3, min(len(plan), int(p.get('count', 6))))
    for i, (kind, size, x, y, z, tx, yaw, roll) in enumerate(plan[:n]):
        mat = _foil('Foil%d' % i, cols[i % len(cols):] + cols[:i % len(cols)], tint=cols[i % len(cols)], tint_amount=0.22 if i else 0.0,
                    rough=0.1, seed=rng.uniform(0, 30), film=float(p.get('film', 1.0)))
        loc = ((x + rng.uniform(-0.03, 0.03)) * flip, y, z + rng.uniform(-0.03, 0.03))
        rot = _rad(tx + rng.uniform(-5, 5), roll + rng.uniform(-8, 8), (yaw + rng.uniform(-6, 6)) * flip)
        _balloon(kind, size, mat, rng, puff=0.5 if kind != 'round' else 0.44, spokes=420 if size > 0.3 else 260, location=loc, rotation=rot)
        # a short curled string under each balloon
        if size >= 0.3:
            bx, bz = loc[0], loc[2] - size * (1.0 if kind != 'heart' else 0.98)
            L = 0.34 + 0.3 * size
            pts = [(bx + 0.02 * math.sin(9 * t + i) * (0.3 + t), loc[1] + 0.02 * math.cos(9 * t + i) * t, bz - L * t) for t in np.linspace(0, 1, 40)]
            _tube(pts, 0.0045, string)
    return dict(radius=1.26, fov=20, direction=(0.03 * flip, -1.0, 0.03))


def _sheet(ctx, cols, flip, rng, p):
    film = float(p.get('film', 1.0))
    crumple = float(p.get('crumple', 1.0))
    _crumpled_disc(1.14, _foil('Crumpled', cols, rough=0.13, hue=0.86, freq=1.6, crinkle=0.6 * crumple, seed=rng.uniform(0, 30), film=film),
                   rng, amp=crumple, location=(0.0, 0.3, 0.0), rotation=_rad(0, rng.uniform(0, 360), 0))
    smooth = _foil('Smooth', cols, rough=0.035, hue=0.5, freq=0.7, seed=rng.uniform(0, 30), film=film * 0.6)
    C.add_sphere(0.45, smooth, location=(0.1 * flip, -0.36, -0.08), segments=128)
    C.add_sphere(0.12, C.material('Bead', cols[0], roughness=0.12, coat=1.0, coat_roughness=0.03), location=(-0.6 * flip, -0.3, -0.56))
    C.add_sphere(0.06, smooth, location=(0.74 * flip, -0.3, 0.52), segments=64)
    return dict(radius=1.24, fov=20, direction=(0.03 * flip, -1.0, 0.03))


def _ribbons(ctx, cols, flip, rng, p):
    film = float(p.get('film', 1.0))
    mats = [_foil('Rib%d' % i, cols[i:] + cols[:i], tint=cols[i % len(cols)], tint_amount=0.35, rough=0.1, freq=1.0, seed=rng.uniform(0, 30), film=film)
            for i in range(len(cols))]
    f = flip
    _ribbon((-0.92 * f, 0.1, 0.56), (0.8 * f, 0.0, -0.46), 0.25, 5.0, 0.18, mats[0], rng, taper=0.45)
    _ribbon((0.12 * f, -0.3, 0.98), (0.98 * f, 0.3, 0.1), 0.15, 4.4, 0.115, mats[1], rng, taper=0.4)
    _ribbon((-0.98 * f, 0.25, -0.36), (-0.06 * f, -0.2, -1.0), 0.125, 4.4, 0.095, mats[2 % len(mats)], rng, taper=0.4)
    # confetti: discs and small rectangles tumbling through the same space, thinning outwards
    count, placed, tries = int(p.get('confetti', 44)), 0, 0
    while placed < count and tries < 4000:
        tries += 1
        a, r = rng.uniform(0, math.tau), 1.16 * math.sqrt(rng.random())
        x, z, y = r * math.cos(a), r * math.sin(a), rng.uniform(-0.5, 0.6)
        if rng.random() < (r / 1.16) ** 2 * 0.5:
            continue
        mat = rng.choice(mats)
        rot = (rng.uniform(-1.0, 1.0), rng.uniform(0, math.tau), rng.uniform(-1.0, 1.0))
        sz = rng.choice((0.035, 0.045, 0.045, 0.06, 0.06, 0.085))
        if rng.random() < 0.6:
            C.add_cylinder(sz, 0.004, 0.0, mat, location=(x, y, z), rotation=(rot[0] + math.pi / 2, rot[1], rot[2]))
        else:
            C.add_box((sz * 1.3, 0.004, sz * 2.6), 0.0, mat, location=(x, y, z), rotation=rot)
        placed += 1
    return dict(radius=1.26, fov=20, direction=(0.03 * flip, -1.0, 0.03))


def build(ctx):
    rng, pal, p = ctx.rng, ctx.palette, ctx.params
    flip = -1.0 if ctx.mirror else 1.0
    motif = str(p.get('motif', 'balloons')).lower()
    ctx.set_view('AgX', 'Medium High Contrast')
    cols = [ctx.color(i) for i in range(max(3, min(5, len(ctx.colors))))]

    # --- wall: its radiance is solved so that AgX shows exactly the palette background
    want = _radiance_for(ctx.scene, pal['bg'])
    level = max(1.0, float(want.max()) / 0.82)
    ambient = 0.36
    sun_dir = (0.34 * flip, 0.86, -0.38)
    cos_wall = sun_dir[1] / math.sqrt(sum(v * v for v in sun_dir))
    sun = C.add_sun(sun_dir, strength=(1.0 - ambient) * level * math.pi / cos_wall, angle=float(p.get('shadow', 12.0)))
    try:
        sun.visible_glossy = False
    except Exception:
        pass

    if motif == 'sheet':
        look = _sheet(ctx, cols, flip, rng, p)
    elif motif == 'ribbons':
        look = _ribbons(ctx, cols, flip, rng, p)
    else:
        look = _balloons(ctx, cols, flip, rng, p)

    wall = C.add_plane(240, C.material('Wall', tuple(want / level), roughness=0.95, specular=0.0))
    wall.rotation_euler = (math.radians(90), 0, 0)
    wall.location = (0, 1.0, 0)
    try:
        wall.visible_glossy = False          # the foil mirrors the light cards, not the set
    except Exception:
        pass

    # --- what the foil mirrors: a banded sky (bright / dark / palette) and big soft cards
    by_lum = sorted(cols, key=C.luminance)
    shade = C.mix_hex(by_lum[0], '#05050a', 0.8)
    pale = C.mix_hex(by_lum[-1], '#ffffff', 0.75)
    lin = lambda h, s=1.0: tuple(v * s for v in C.col(h)[:3])
    _world(ambient * level, [
        (0.00, lin(shade, 0.6)), (0.24, lin(cols[1], 0.5)), (0.40, lin(shade, 0.8)), (0.55, lin(pale, 0.75)),
        (0.70, lin(cols[0], 0.7)), (0.86, lin('#ffffff', 1.1)), (1.00, lin(pale, 0.8)),
    ], (math.radians(-12), math.radians(-24 * flip), 0))
    _card((-4.6 * flip, -4.2, 3.4), (7.0, 7.0), pale, '#ffffff', 3.6)
    _card((4.6 * flip, -3.0, -2.6), (5.4, 6.0), cols[1], pale, 1.9)
    _card((0.6 * flip, -1.2, 5.6), (8.5, 1.6), '#ffffff', pale, 9.0)
    _card((-4.4 * flip, 3.6, -1.6), (4.6, 6.6), cols[2 % len(cols)], pale, 1.9)
    _card((4.4 * flip, 3.8, 2.6), (4.6, 6.6), cols[0], pale, 1.9)

    ctx.frame(**look)
