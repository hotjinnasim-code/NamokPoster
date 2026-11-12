"""Still water — a full-picture scene: a mirror-calm lake at dawn or dusk reflecting layered hills and a
low sun or moon, with a small island and its lone tree (or a boat) at the layout focus.

How the picture is composed around the copy
- The hero stands at the world origin, so ``ctx.frame`` puts it on the layout focus; the horizon is
  solved to run just below it, through the hero's waterline.
- Sky above and water below are both calm. Hills are only as tall as the copy allows: full height on
  the art side, low under copy that sits in the sky, and gone — the far shore lost in mist — where
  the copy runs across the horizon (``left`` / ``right``). The sun sits on the art side in a dip of
  the skyline and its glow dies out before it reaches the copy.
- Palette, literal ('Standard' view): ``bg`` = upper sky (and, mirrored, the near water),
  ``colors`` = [sky at the horizon, nearest hill, glow around the sun, water tint], ``accent`` tints the moon / sun on dark palettes
  and the tree's crown (the disc itself is always pale and plain: no saturated disc, no rays).

No volumetrics: aerial perspective is material colour per hill layer plus a height/side fade into the
horizon colour; the water is one glossy plane with a slight ripple bump.
"""
import math

import bpy
import numpy as np

import common as C

FOV = 30.0          # along the short side of the poster


# --------------------------------------------------------------------------- small helpers


class NB:
    """Tiny node-graph builder: every method returns an output socket; inputs take sockets or constants."""

    def __init__(self, nt):
        self.nt = nt

    def new(self, kind, **props):
        n = self.nt.nodes.new(kind)
        for k, v in props.items():
            try:
                setattr(n, k, v)
            except Exception:
                pass
        return n

    def put(self, sock, v):
        if v is None:
            return
        if isinstance(v, bpy.types.NodeSocket):
            self.nt.links.new(v, sock)
        else:
            sock.default_value = v

    def math(self, op, a, b=None, c=None, clamp=False):
        n = self.new('ShaderNodeMath', operation=op, use_clamp=clamp)
        for i, v in enumerate((a, b, c)):
            self.put(n.inputs[i], v)
        return n.outputs[0]

    def vmath(self, op, a, b=None):
        n = self.new('ShaderNodeVectorMath', operation=op)
        self.put(n.inputs[0], a)
        self.put(n.inputs[1], b)
        return n.outputs['Value'] if op in ('DOT_PRODUCT', 'LENGTH', 'DISTANCE') else n.outputs['Vector']

    def mix(self, fac, a, b, blend='MIX'):
        n = self.new('ShaderNodeMixRGB', blend_type=blend)
        self.put(n.inputs[0], fac)
        self.put(n.inputs[1], a)
        self.put(n.inputs[2], b)
        return n.outputs[0]

    def ramp(self, fac, stops, interp='EASE'):
        n = self.new('ShaderNodeValToRGB')
        cr = n.color_ramp
        cr.interpolation = interp
        els = cr.elements
        els[0].position, els[0].color = stops[0][0], stops[0][1]
        els[1].position, els[1].color = stops[-1][0], stops[-1][1]
        for pos, colr in stops[1:-1]:
            els.new(pos).color = colr
        self.put(n.inputs[0], fac)
        return n.outputs[0]

    def maprange(self, v, a, b, c=0.0, d=1.0, interp='LINEAR'):
        n = self.new('ShaderNodeMapRange', interpolation_type=interp, clamp=True)
        for i, x in enumerate((v, a, b, c, d)):
            self.put(n.inputs[i], x)
        return n.outputs[0]

    def sep(self, v):
        n = self.new('ShaderNodeSeparateXYZ')
        self.put(n.inputs[0], v)
        return n.outputs

    def comb(self, x, y, z):
        n = self.new('ShaderNodeCombineXYZ')
        for i, v in enumerate((x, y, z)):
            self.put(n.inputs[i], v)
        return n.outputs[0]


class Noise2:
    """Seeded 2D gradient noise on numpy arrays."""

    def __init__(self, seed):
        rs = np.random.RandomState(seed % (2 ** 31))
        self.perm = np.concatenate([rs.permutation(256)] * 2)
        ang = rs.uniform(0, 2 * np.pi, 256)
        self.gx, self.gy = np.cos(ang), np.sin(ang)

    def perlin(self, x, y):
        x, y = np.broadcast_arrays(np.asarray(x, dtype=np.float64), np.asarray(y, dtype=np.float64))
        x0, y0 = np.floor(x), np.floor(y)
        xf, yf = x - x0, y - y0
        xi, yi = x0.astype(np.int64) & 255, y0.astype(np.int64) & 255

        def g(ix, iy, dx, dy):
            h = self.perm[self.perm[ix] + iy]
            return self.gx[h] * dx + self.gy[h] * dy

        u = xf * xf * xf * (xf * (xf * 6 - 15) + 10)
        v = yf * yf * yf * (yf * (yf * 6 - 15) + 10)
        a = g(xi, yi, xf, yf) * (1 - u) + g((xi + 1) & 255, yi, xf - 1, yf) * u
        b = g(xi, (yi + 1) & 255, xf, yf - 1) * (1 - u) + g((xi + 1) & 255, (yi + 1) & 255, xf - 1, yf - 1) * u
        return (a * (1 - v) + b * v) * 1.41

    def fbm(self, x, y, octaves=3, gain=0.5):
        out, amp, f = 0.0, 1.0, 1.0
        for i in range(octaves):
            out = out + amp * self.perlin(x * f + 17.1 * i, y * f - 9.3 * i)
            amp *= gain
            f *= 2.03
        return out


class View:
    """Poster coordinates (u right, v down, 0..1) <-> world, after ctx.frame()."""

    def __init__(self, ctx):
        bpy.context.view_layer.update()
        cam = ctx.camera
        fr = cam.data.view_frame(scene=ctx.scene)
        rot = cam.matrix_world.to_3x3()
        self.tl = np.array(rot @ max(fr, key=lambda p: -p.x + p.y))
        self.tr = np.array(rot @ max(fr, key=lambda p: p.x + p.y))
        self.bl = np.array(rot @ max(fr, key=lambda p: -p.x - p.y))
        self.pos = np.array(cam.matrix_world.translation)

    def ray(self, u, v):
        d = self.tl + (self.tr - self.tl) * u + (self.bl - self.tl) * v
        return d / np.linalg.norm(d)

    def at_depth(self, u, v, y):
        """World points where the rays through (u, v) cross the vertical plane Y = y (numpy arrays ok)."""
        u, v = np.asarray(u, dtype=np.float64), np.asarray(v, dtype=np.float64)
        d = self.tl[None, :] + (self.tr - self.tl)[None, :] * u.reshape(-1, 1) + (self.bl - self.tl)[None, :] * v.reshape(-1, 1)
        t = (y - self.pos[1]) / d[:, 1]
        return self.pos[None, :] + d * t[:, None]


def grid_mesh(name, pts, material, smooth=True):
    nr, nc = pts.shape[:2]
    me = bpy.data.meshes.new(name)
    me.vertices.add(nr * nc)
    me.vertices.foreach_set('co', pts.reshape(-1).astype(np.float32))
    r, c = np.meshgrid(np.arange(nr - 1), np.arange(nc - 1), indexing='ij')
    i0 = (r * nc + c).reshape(-1)
    quads = np.stack([i0, i0 + 1, i0 + nc + 1, i0 + nc], axis=1).astype(np.int32)
    nq = len(quads)
    me.loops.add(nq * 4)
    me.loops.foreach_set('vertex_index', quads.reshape(-1))
    me.polygons.add(nq)
    me.polygons.foreach_set('loop_start', np.arange(0, nq * 4, 4, dtype=np.int32))
    me.polygons.foreach_set('loop_total', np.full(nq, 4, dtype=np.int32))
    me.polygons.foreach_set('use_smooth', np.full(nq, bool(smooth)))
    me.update(calc_edges=True)
    me.materials.append(material)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def smooth01(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3 - 2 * x)


def new_material(name):
    mat = bpy.data.materials.new(name)
    try:
        mat.use_nodes = True
    except Exception:
        pass
    mat.node_tree.nodes.clear()
    return mat, NB(mat.node_tree)


# --------------------------------------------------------------------------- sky


def sky_nodes(nb, direction, S, disc):
    """Sky colour for a direction: ramp horizon -> zenith, a warm band along the horizon near the sun,
    a soft glow around it and the disc itself."""
    x, y, z = nb.sep(direction)
    zc = nb.math('ABSOLUTE', z)                                # below the horizon the sky is mirrored
    t = nb.maprange(zc, 0.0, S['z_top'], 0.0, 1.0)
    colr = nb.ramp(t, [(0.0, S['horizon']), (0.4, S['mid']), (1.0, S['zenith'])], 'EASE')
    up = nb.comb(x, y, zc)
    cosang = nb.vmath('DOT_PRODUCT', nb.vmath('NORMALIZE', up), S['sun_dir'])
    ang = nb.math('ARCCOSINE', nb.math('MINIMUM', nb.math('MAXIMUM', cosang, -1.0), 1.0))

    def lobe(sigma, power=2.0):
        return nb.math('EXPONENT', nb.math('MULTIPLY', nb.math('POWER', nb.math('DIVIDE', ang, sigma), power), -1.0))

    band = nb.math('MULTIPLY', lobe(S['band_az'], 2.0),
                   nb.math('EXPONENT', nb.math('MULTIPLY', nb.math('POWER', nb.math('DIVIDE', zc, S['band_el']), 1.3), -1.0)))
    colr = nb.mix(nb.math('MULTIPLY', band, S['band_k']), colr, S['glow'])
    colr = nb.mix(nb.math('MULTIPLY', lobe(S['glow_wide'], 1.6), S['wide_k']), colr, S['glow'])
    colr = nb.mix(nb.math('MULTIPLY', lobe(S['glow_tight'], 1.5), S['tight_k']), colr, S['halo'])
    if disc:
        edge = nb.maprange(ang, S['alpha'] * 0.93, S['alpha'], 1.0, 0.0, 'SMOOTHSTEP')
        colr = nb.mix(edge, colr, S['sun'])
    return colr, ang, zc


def horizon_colour(S, ang):
    """The sky of sky_nodes(), evaluated in Python on the horizon at `ang` radians from the sun."""
    def mix(a, b, f):
        f = min(1.0, max(0.0, f))
        return tuple(x + (y - x) * f for x, y in zip(a, b))
    colr = S['horizon']
    colr = mix(colr, S['glow'], math.exp(-(ang / S['band_az']) ** 2.0) * S['band_k'])
    colr = mix(colr, S['glow'], math.exp(-(ang / S['glow_wide']) ** 1.6) * S['wide_k'])
    colr = mix(colr, S['halo'], math.exp(-(ang / S['glow_tight']) ** 1.5) * S['tight_k'])
    return colr


def build_world(ctx, S, ambient, stars):
    world = bpy.data.worlds.new('Sky')
    ctx.scene.world = world
    try:
        world.use_nodes = True
    except Exception:
        pass
    nt = world.node_tree
    nt.nodes.clear()
    nb = NB(nt)
    out = nb.new('ShaderNodeOutputWorld')
    direction = nb.new('ShaderNodeTexCoord').outputs['Generated']
    colr, ang, zc = sky_nodes(nb, direction, S, disc=True)
    if stars > 0:
        vor = nb.new('ShaderNodeTexVoronoi', voronoi_dimensions='3D', feature='F1')
        nb.put(vor.inputs['Vector'], direction)
        vor.inputs['Scale'].default_value = 190.0
        rnd = nb.sep(vor.outputs['Color'])[0]
        dot = nb.maprange(vor.outputs['Distance'], 0.035, 0.075, 1.0, 0.0, 'SMOOTHSTEP')
        pick = nb.math('MULTIPLY', nb.maprange(rnd, 0.955, 1.0, 0.25, 1.0), nb.math('GREATER_THAN', rnd, 0.955))
        high = nb.maprange(nb.sep(direction)[2], S['z_top'] * 0.25, S['z_top'] * 0.8, 0.0, 1.0)
        away = nb.maprange(ang, S['glow_wide'] * 0.8, S['glow_wide'] * 2.2, 0.0, 1.0)
        k = nb.math('MULTIPLY', nb.math('MULTIPLY', dot, pick), nb.math('MULTIPLY', nb.math('MULTIPLY', high, away), stars))
        colr = nb.mix(k, colr, S['star'])
    seen = nb.new('ShaderNodeBackground')                     # what the camera and the water's mirror see
    nb.put(seen.inputs['Color'], colr)
    amb = nb.new('ShaderNodeBackground')                      # what lights the hills and the hero
    amb.inputs['Color'].default_value = (*ambient, 1.0)
    lp = nb.new('ShaderNodeLightPath')
    direct = nb.math('MAXIMUM', lp.outputs['Is Camera Ray'], lp.outputs['Is Glossy Ray'])
    mix = nb.new('ShaderNodeMixShader')
    nb.put(mix.inputs[0], direct)
    nt.links.new(amb.outputs[0], mix.inputs[1])
    nt.links.new(seen.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs[0])


def haze_socket(nb, S):
    """Horizon colour behind the shading point (depends only on the bearing from the sun): one ramp."""
    geo = nb.new('ShaderNodeNewGeometry')
    x, y, z = nb.sep(geo.outputs['Incoming'])
    flat = nb.vmath('NORMALIZE', nb.comb(nb.math('MULTIPLY', x, -1.0), nb.math('MULTIPLY', y, -1.0), 0.0))
    cosang = nb.math('MINIMUM', nb.math('MAXIMUM', nb.vmath('DOT_PRODUCT', flat, S['sun_dir']), -1.0), 1.0)
    stops = []
    for i in range(14):
        ang = (math.pi / 2) * (i / 13.0) ** 1.8
        stops.append((ang / (math.pi / 2), horizon_colour(S, max(ang, 1e-4))))
    return nb.ramp(nb.math('DIVIDE', nb.math('ARCCOSINE', cosang), math.pi / 2), stops, 'LINEAR'), geo


def hill_material(S, colour_hex, base_mist, mist_top, water_z, fade):
    """Matte hill in one colour; the lower slopes — and the whole hill, towards the copy side —
    dissolve into the colour of the horizon behind them. ``fade`` = (x0, x1) in world X: full hill
    colour at x1, full mist at x0 (None = no side fade)."""
    mat, nb = new_material('Hill')
    out = nb.new('ShaderNodeOutputMaterial')
    haze, geo = haze_socket(nb, S)
    px, py, pz = nb.sep(geo.outputs['Position'])
    low = nb.maprange(pz, water_z, water_z + mist_top, 1.0, 0.0, 'SMOOTHSTEP')
    f = nb.math('ADD', base_mist, nb.math('MULTIPLY', low, (1.0 - base_mist) * 0.75))
    if fade is not None:
        side = nb.maprange(px, fade[0], fade[1], 1.0, 0.0, 'SMOOTHSTEP')
        f = nb.math('MAXIMUM', f, side)
    diff = nb.new('ShaderNodeBsdfDiffuse')
    diff.inputs['Color'].default_value = C.col(colour_hex)
    em = nb.new('ShaderNodeEmission')
    nb.put(em.inputs['Color'], haze)
    mix = nb.new('ShaderNodeMixShader')
    nb.put(mix.inputs[0], nb.math('MINIMUM', f, 1.0))
    mat.node_tree.links.new(diff.outputs[0], mix.inputs[1])
    mat.node_tree.links.new(em.outputs[0], mix.inputs[2])
    mat.node_tree.links.new(mix.outputs[0], out.inputs['Surface'])
    return mat


def water_material(near_hex, tint_hex, ripple, unit, d_near):
    """A glossy mirror with a slight ripple bump. Far water is a sharp mirror; towards the viewer the
    ripples open up and the reflection gives way to the water's own colour (``near_hex``, close to the
    sky behind the copy), so the bottom of the frame — where the footer sits — is always calm.
    ``d_near`` is the distance from the camera at which the two are about half and half."""
    mat, nb = new_material('Water')
    out = nb.new('ShaderNodeOutputMaterial')
    geo = nb.new('ShaderNodeNewGeometry')
    dist = nb.new('ShaderNodeCameraData').outputs['View Distance']
    gloss = nb.new('ShaderNodeBsdfGlossy')
    gloss.inputs['Color'].default_value = C.col(tint_hex)
    gloss.inputs['Roughness'].default_value = 0.012
    body = nb.new('ShaderNodeEmission')
    body.inputs['Color'].default_value = C.col(near_hex)
    if ripple > 0:
        mp = nb.new('ShaderNodeMapping')
        nb.put(mp.inputs['Vector'], geo.outputs['Position'])
        mp.inputs['Scale'].default_value = (1.0 / (0.9 * unit), 1.0 / (0.11 * unit), 1.0)   # long, flat wavelets
        n1 = nb.new('ShaderNodeTexNoise', noise_dimensions='3D')
        nb.put(n1.inputs['Vector'], mp.outputs[0])
        n1.inputs['Scale'].default_value = 1.0
        n1.inputs['Detail'].default_value = 2.0
        n1.inputs['Roughness'].default_value = 0.55
        bump = nb.new('ShaderNodeBump')
        near = nb.maprange(dist, 2.0 * unit, 14.0 * unit, 1.0, 0.25, 'SMOOTHSTEP')
        nb.put(bump.inputs['Strength'], nb.math('MULTIPLY', near, min(1.0, 0.055 * ripple)))
        bump.inputs['Distance'].default_value = 0.03 * unit
        nb.put(bump.inputs['Height'], n1.outputs[0])
        nb.put(gloss.inputs['Normal'], bump.outputs[0])
    k = nb.maprange(dist, 0.55 * d_near, 2.3 * d_near, 0.4, 1.0, 'SMOOTHSTEP')
    mix = nb.new('ShaderNodeMixShader')
    nb.put(mix.inputs[0], k)
    mat.node_tree.links.new(body.outputs[0], mix.inputs[1])
    mat.node_tree.links.new(gloss.outputs[0], mix.inputs[2])
    mat.node_tree.links.new(mix.outputs[0], out.inputs['Surface'])
    return mat


# --------------------------------------------------------------------------- hero


def add_island(rng, mat_ground, water, size=1.0):
    ob = C.add_icosphere(1.0, 4, mat_ground, location=(0.0, 0.0, water - 0.03 * size), scale=(0.66 * size, 0.42 * size, 0.2 * size))
    C.displace_blob(ob, 0.22, 2.4, rng.randrange(100))
    for i in range(3):
        a = rng.uniform(0, math.tau)
        r = C.add_icosphere(1.0, 3, mat_ground, location=(0.6 * size * math.cos(a) * rng.uniform(0.75, 1.15), 0.3 * size * math.sin(a), water - 0.01),
                            scale=(rng.uniform(0.05, 0.11) * size, rng.uniform(0.05, 0.09) * size, rng.uniform(0.035, 0.07) * size))
        C.displace_blob(r, 0.3, 3.0, rng.randrange(100))
    return ob


def add_tree(rng, mat_trunk, mat_leaf, base_z, height=1.0, lean=1.0, x0=0.0):
    """A lone broad-crowned tree: a bent trunk, two boughs and a crown of merged blobs."""
    top = base_z + 0.52 * height
    pts = [(x0, 0.0, base_z - 0.03), (x0 + 0.018 * lean * height, 0.0, base_z + 0.16 * height), (x0 + 0.05 * lean * height, 0.0, base_z + 0.34 * height), (x0 + 0.035 * lean * height, 0.0, top)]
    cu = bpy.data.curves.new('Trunk', 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = 0.026 * height
    cu.bevel_resolution = 4

    def stroke(points, r0, r1):
        sp = cu.splines.new('NURBS')
        sp.points.add(len(points) - 1)
        for i, (p, q) in enumerate(zip(sp.points, points)):
            p.co = (*q, 1.0)
            p.radius = r0 + (r1 - r0) * i / (len(points) - 1)
        sp.use_endpoint_u = True
        sp.order_u = min(4, len(points))
    stroke(pts, 1.25, 0.55)
    stroke([pts[2], (x0 + 0.15 * lean * height, 0.0, base_z + 0.47 * height), (x0 + 0.24 * lean * height, 0.0, base_z + 0.56 * height)], 0.6, 0.3)
    stroke([pts[1], (x0 - 0.07 * lean * height, 0.0, base_z + 0.36 * height), (x0 - 0.17 * lean * height, 0.0, base_z + 0.5 * height)], 0.7, 0.3)
    ob = bpy.data.objects.new('Trunk', cu)
    bpy.context.scene.collection.objects.link(ob)
    cu.materials.append(mat_trunk)
    crown = [(0.03, 0.0, 0.72, 0.24), (0.22, 0.03, 0.66, 0.17), (-0.18, -0.02, 0.63, 0.16), (0.1, -0.04, 0.86, 0.17),
             (-0.08, 0.04, 0.82, 0.15), (0.3, 0.0, 0.56, 0.11), (-0.27, 0.02, 0.54, 0.1), (0.0, 0.0, 0.58, 0.16)]
    for i, (x, y, z, r) in enumerate(crown):
        b = C.add_icosphere(r * height * rng.uniform(0.9, 1.1), 4, mat_leaf,
                            location=(x0 + x * lean * height + rng.uniform(-0.02, 0.02) * height, y, base_z + z * height), scale=(1.0, 0.8, 0.86))
        C.displace_blob(b, 0.05 * height, 6.0 / height, rng.randrange(100))
    return ob


def add_boat(rng, mat_hull, mat_dark, lamp_hex, flip, water, k=1.0):
    """A small rowing boat seen from the side, a figure in the stern and a lantern on a pole."""
    n = 28
    top, bot = [], []
    for i in range(n + 1):
        t = i / n
        x = (-0.62 + 1.24 * t) * k
        sheer = 0.085 * (2 * t - 1) ** 2                       # the gunwale rises to bow and stern
        top.append((x, water + (0.12 + sheer) * k))
        bot.append((x, water + (-0.06 + 0.2 * abs(2 * t - 1) ** 3.2) * k))
    outline = top + bot[::-1]
    hull = C.add_extrusion(outline, 0.3 * k, 0.02 * k, mat_hull, name='Hull')
    hull.scale = (flip, 1.0, 1.0)
    # figure
    C.add_capsule(0.06 * k, 0.3 * k, mat_dark, location=(-0.3 * flip * k, 0.0, water + 0.27 * k), rotation=(0, math.radians(8 * flip), 0))
    C.add_sphere(0.052 * k, mat_dark, location=(-0.285 * flip * k, 0.0, water + 0.47 * k), segments=32)
    # lantern pole at the bow
    C.add_cylinder(0.008 * k, 0.52 * k, 0.0, mat_dark, location=(0.42 * flip * k, 0.0, water + 0.4 * k))
    lamp = C.add_sphere(0.038 * k, C.emission_material('Lantern', lamp_hex, 6.0), location=(0.42 * flip * k, 0.0, water + 0.68 * k), segments=32)
    return hull, lamp


# --------------------------------------------------------------------------- build


def build(ctx):
    pal, rng, prm = ctx.palette, ctx.rng, ctx.params
    horizon_hex, hill_hex, glow_hex, deep_hex = (ctx.color(i) for i in range(4))
    dark = C.luminance(pal['bg']) < 0.2
    ctx.set_view('Standard')                                  # palette colours stay literal
    cy = ctx.scene.cycles
    try:
        ctx.scene.render.dither_intensity = 1.5               # no banding in the long sky / water gradients
        cy.max_bounces, cy.diffuse_bounces, cy.glossy_bounces = 3, 1, 2
        cy.adaptive_min_samples = 8
        cy.use_light_tree = False
    except Exception:
        pass

    hero = str(prm.get('hero', 'island')).lower()
    k_hills = float(prm.get('hills', 1.0))
    k_mist = max(0.0, float(prm.get('mist', 1.0)))
    k_ripple = float(prm.get('ripples', 1.0))
    k_sun = float(prm.get('sun', 1.0))
    k_stars = float(prm.get('stars', 1.0)) if dark else 0.0

    # ---- layout: where is the copy, where is the horizon
    fx, fy = ctx.focus
    tx0, ty0, tx1, ty1 = ctx.text_rect
    tall, wide = (ty1 - ty0) > 0.9, (tx1 - tx0) > 0.66
    mode = 'over' if (tall and wide) else 'side' if tall else 'bottom' if ty0 > 0.2 else 'top'
    short = min(ctx.width, ctx.height)
    diam = ctx.art_size * short / ctx.height                  # hero circle, as a fraction of the frame height
    diam_w = ctx.art_size * short / ctx.width
    # The hero is about one unit tall. Normally it is centred on the origin and the horizon runs just
    # above its waterline; with the copy below (`bottom`) the waterline itself goes to the focus, so the
    # hero and its whole reflection stay inside the art area and the water under the copy is clear.
    below = mode == 'bottom'
    water = 0.0 if below else -0.5
    hy = min(0.9, fy + (-0.03 if below else 0.17) * diam)
    foot_top = 1.0 - 0.1 * short / ctx.height                 # roughly where the footer line begins
    half = math.tan(math.radians(FOV) / 2)
    pitch = math.atan((hy - fy) * 2 * half / (1.0 if ctx.aspect >= 1 else ctx.aspect))
    dist = ctx.frame(radius=1.0, fov=FOV, direction=(0.0, -math.cos(pitch), -math.sin(pitch)))
    ctx.camera.data.clip_start, ctx.camera.data.clip_end = 0.05, 4000.0 * dist
    view = View(ctx)
    cam = view.pos
    side = -1.0 if fx < 0.45 else 1.0                          # the sun and the tall hills sit on this side of the hero

    # ---- sun / moon: on the art side, low over the far shore
    if mode == 'over':
        k_sun = 0.0                                            # copy sits on the picture: keep the glow, drop the disc
    su = min(0.92, max(0.08, fx + side * 0.40 * diam_w))
    h_s = min((0.33 if below else 0.47) * diam, 0.82 * (1.0 - hy) - 0.08 * diam)   # low enough that its reflection stays in the frame
    sv = hy - max(h_s, 0.12 * diam)
    sun_dir = view.ray(su, sv)
    alpha = math.atan(0.15 * max(k_sun, 1e-3) / dist)

    def gap(rect):
        x0, y0, x1, y1 = rect
        dx = max(x0 - su, 0.0, su - x1) * ctx.width
        dy = max(y0 - sv, 0.0, sv - y1) * ctx.height
        return math.hypot(dx, dy) / short
    quiet = [r for r in ctx.quiet if r] or [ctx.text_rect]
    room = max(0.14, min([gap(r) for r in quiet] + [0.6 * ctx.art_size])) if mode != 'over' else 0.45 * ctx.art_size
    room_ang = math.atan(room * 2 * half)
    z_top = max(0.06, float(view.ray(0.5, max(0.0, hy - 0.6))[2]))
    # The sun / moon is only ever a plain pale disc inside a soft round glow (plus its glitter on the
    # water): lighter than the sky on light palettes, a pale tint of the accent on dark ones. No rays.
    sun_hex = C.mix_hex(glow_hex, '#ffffff', 0.72) if not dark else C.mix_hex(pal['accent'], '#fff8ec', 0.55)
    S = {
        'sun_dir': tuple(float(v) for v in sun_dir), 'alpha': alpha, 'z_top': z_top,
        'zenith': C.col(pal['bg']), 'horizon': C.col(horizon_hex),
        'mid': C.col(C.mix_hex(horizon_hex, pal['bg'], 0.6)),
        'glow': C.col(glow_hex), 'halo': C.col(C.mix_hex(glow_hex, '#ffffff', 0.3 if dark else 0.12)),
        'sun': C.col(sun_hex), 'star': C.col(C.mix_hex(pal['ink'], pal['bg'], 0.15)),
        'band_az': max(math.radians(6), room_ang * 1.1), 'band_el': max(0.015, 0.2 * z_top), 'band_k': 0.75 if dark else 0.85,
        'glow_wide': max(alpha * 2.6, room_ang * 0.6), 'wide_k': 0.55 if dark else 0.6,
        'glow_tight': alpha * 2.0, 'tight_k': 0.6 if k_sun > 0 else 0.0,
    }
    if k_sun <= 0:
        S['alpha'] = 1e-5
    amb = np.array(C.col(C.mix_hex(pal['bg'], horizon_hex, 0.5))[:3])
    amb = 0.82 * (0.55 + 0.45 * amb / max(1e-3, float(amb.max())))     # soft, sky-tinted fill: colours stay near literal
    build_world(ctx, S, tuple(float(v) for v in amb), k_stars)
    # the sun itself: a low back light that rims the hero and the ridges
    back = C.add_sun(direction=tuple(float(-v) for v in sun_dir), strength=1.6, angle=2.0, color=glow_hex)
    try:
        back.visible_glossy = False                            # the water mirrors the painted disc, not the lamp
    except Exception:
        pass

    # ---- water
    fr = view.ray(0.5, foot_top)                               # the water under the footer line is this far away
    d_foot = (cam[2] - water) / max(1e-3, -float(fr[2]))
    lake = C.add_plane(1.0, water_material(C.mix_hex(pal['bg'], deep_hex, 0.22), C.mix_hex('#ffffff', deep_hex, 0.08), k_ripple, 1.0, d_foot))
    lake.scale = (60000.0, 60000.0, 1.0)
    lake.location = (0.0, 20000.0, water)

    # ---- hills: displaced strips at several depths, each only as tall as the copy allows
    art_top = max(ctx.art_rect[1], 0.05)
    h_art = max(0.04, (hy - art_top) * 0.9)
    if mode == 'bottom':
        h_art = min(h_art, max(0.05, 0.95 * (ty0 - hy)))      # their reflection must not run under the copy
    if mode == 'top':
        h_copy = max(0.0, hy - ty1 - 0.04)
    elif mode == 'side':
        h_copy = 0.0
    else:
        h_copy = 0.55 * h_art
    h_sun = max(0.02, hy - (sv + 0.11 * diam * max(k_sun, 0.3)))   # the skyline dips under the sun

    def limit(u):
        """Tallest hill allowed in column u, as a fraction of the frame height."""
        if mode in ('top', 'side'):
            if side > 0:
                w = smooth01((u - (tx1 - 0.02)) / 0.17)
            else:
                w = smooth01(((tx0 + 0.02) - u) / 0.17)
            h = h_copy + (h_art - h_copy) * w
        else:
            h = np.full_like(u, h_art if mode == 'bottom' else h_copy + (h_art - h_copy) * 0.6)
        notch = np.exp(-((u - su) / (0.2 * diam_w + 0.02)) ** 2)
        return h * (1.0 - notch) + np.minimum(h, h_sun) * notch

    nz = Noise2(rng.randrange(1 << 30))
    n_layers = 5
    depths = [1.1, 2.2, 4.0, 7.0, 12.0]                       # in camera distances behind the hero
    share = [0.34, 0.5, 0.68, 0.86, 1.0]                      # near hills are low, the far range is the tallest
    far_hex = C.mix_hex(hill_hex, horizon_hex, 0.84)
    us = np.linspace(-0.35, 1.35, 520)
    uc = np.clip(us, -0.02, 1.02)
    lim = limit(uc) * k_hills
    for i in range(n_layers):
        y_i = depths[i] * dist
        k_i = (y_i - cam[1]) / (0.0 - cam[1])                 # how much larger things must be to look the same
        f = 2.2 + 1.3 * (n_layers - 1 - i)                    # nearer layers: finer profile
        o1, o2 = rng.uniform(0, 50), rng.uniform(0, 50)
        prof = 0.56 + 0.3 * nz.fbm(us * f + o1, np.full_like(us, o2), 3) + 0.2 * (1.0 - np.abs(nz.perlin(us * f * 0.6 + o2, np.full_like(us, o1))))
        prof = np.clip(prof, 0.12, 1.15) * share[i]
        h = lim * prof                                        # fraction of the frame height above the horizon
        if i < 3:                                             # dark near hills: keep their reflection off the footer
            h = np.minimum(h, max(0.02, foot_top - hy - 0.015) * (1.0 + 0.7 * i))
        crest = view.at_depth(us, hy - h, y_i)                # world points of the skyline
        base_z = water - 0.02 * k_i
        rows = 12
        thick = 0.55 * k_i
        pts = np.zeros((rows, len(us), 3))
        for r in range(rows):
            v = r / (rows - 1)
            y = y_i + (v - 0.35) * thick
            lift = math.sin(math.pi * min(1.0, v / 0.7) / 2) ** 0.8 if v <= 0.7 else math.cos(math.pi * (v - 0.7) / 0.6) ** 0.7
            spur = 1.0 + 0.2 * nz.perlin(us * f * 2.3 + 3.1 * r, np.full_like(us, o1 + 0.37 * r)) * (1.0 - abs(2 * min(1.0, v / 0.7) - 1.0) ** 2 if v <= 0.7 else 0.0)
            pts[r, :, 0] = crest[:, 0]
            pts[r, :, 1] = y
            pts[r, :, 2] = base_z + np.maximum(0.0, crest[:, 2] - base_z) * lift * spur
        t = i / (n_layers - 1)
        colour = C.mix_hex(hill_hex, far_hex, t ** 0.75 if mode != 'over' else 0.6 + 0.4 * t)   # centred copy: all hills pale
        fade = None
        if mode == 'side':                                    # far shore lost in mist where the copy crosses the horizon
            ua, ub = (tx1 + 0.0, tx1 + 0.2) if side > 0 else (tx0 - 0.0, tx0 - 0.2)
            xa = float(view.at_depth([ua], [hy], y_i)[0, 0])
            xb = float(view.at_depth([ub], [hy], y_i)[0, 0])
            fade = (xa, xb)
        mist = min(0.9, (0.1 + 0.5 * t) * k_mist)
        band = (0.055 + 0.03 * t) * (2.0 / diam) * k_i        # mist over the far shore: a share of the frame, not of the hill
        grid_mesh('Hills%d' % i, pts, hill_material(S, colour, mist, band, water, fade))

    # ---- hero at the origin
    sil = C.mix_hex(hill_hex, '#000000', 0.25 if not dark else 0.4)
    if mode == 'over':
        sil = C.mix_hex(sil, horizon_hex, 0.74)                # behind centred copy the hero is a shape in the mist
    ground = C.material('Ground', sil, roughness=0.9, specular=0.1)
    leaf = C.material('Leaf', C.mix_hex(sil, pal['accent'], 0.2 if not dark else 0.14), roughness=0.85, specular=0.1)
    k = 1.0
    if hero == 'boat':
        add_boat(rng, C.material('Hull', C.mix_hex(sil, pal['accent'], 0.25), roughness=0.6), ground, C.mix_hex(glow_hex, '#ffffff', 0.35), side, water, 1.25 * k)
    elif hero == 'tree':
        add_island(rng, ground, water, 0.45 * k)
        add_tree(rng, ground, leaf, water + 0.02 * k, 1.0 * k, side)
    else:
        add_island(rng, ground, water, k)
        add_tree(rng, ground, leaf, water + 0.12 * k, 0.92 * k, side, 0.1 * side * k)
        add_tree(rng, ground, leaf, water + 0.1 * k, 0.4 * k, -side, -0.33 * side * k)     # a sapling keeps the island from looking like a logo
