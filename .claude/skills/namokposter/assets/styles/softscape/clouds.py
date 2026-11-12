"""Cloudscape — a full-picture scene: soft, puffy clouds at several depths in a graded pastel sky, with
a hot-air balloon, a sun or a moon at the layout focus.

How the picture is composed around the copy
- The hero sits at the world origin, so ``ctx.frame`` puts it on the layout focus.
- Clouds are placed in poster space and pushed back to their depth: a sea of cloud along the bottom,
  a loose ring around the hero, small far clouds beyond. Any cloud that would reach into a rectangle
  that carries type is dropped (or pulled back to the edge of it), so the clouds gather on the art
  side and the copy sits on open sky.
- The sky is ``bg`` at the top and the bottom of the frame and pales to ``colors[2]`` in a band behind
  the hero. Light palettes are lit from the copy side (white clouds, pastel shadows); dark palettes
  are back-lit from the hero (dark clouds with glowing rims), so the footer never lands on a bright
  cloud.
- Palette, literal ('Standard' view): ``bg`` = sky behind the copy; ``colors`` = [balloon colour 1,
  balloon colour 2, cloud shadow, balloon colour 3]; ``accent`` = copy highlight and moon tint. Clouds
  are white tinted by the sky (dark palettes: rim-lit in a tint of the accent), and the pale band of
  sky behind the hero is derived from ``bg``.
- A sun or moon is only ever a plain pale disc in a soft round glow — never rays; the balloon's
  stripes are level bands, not gores meeting at a point.

No volumetrics: the clouds are metaball clusters with a soft, slightly subsurface material; distance
is faked by fading each depth layer's colour towards the sky.
"""
import math

import bpy
import numpy as np

import common as C

FOV = 30.0          # along the short side of the poster


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

    def math(self, op, a, b=None, c=None):
        n = self.new('ShaderNodeMath', operation=op)
        for i, v in enumerate((a, b, c)):
            self.put(n.inputs[i], v)
        return n.outputs[0]

    def vmath(self, op, a, b=None):
        n = self.new('ShaderNodeVectorMath', operation=op)
        self.put(n.inputs[0], a)
        self.put(n.inputs[1], b)
        return n.outputs['Value'] if op in ('DOT_PRODUCT', 'LENGTH', 'DISTANCE') else n.outputs['Vector']

    def mix(self, fac, a, b):
        n = self.new('ShaderNodeMixRGB', blend_type='MIX')
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

    def ray(self, u, v):
        d = self.tl + (self.tr - self.tl) * u + (self.bl - self.tl) * v
        return d / np.linalg.norm(d)

    def at_depth(self, u, v, y):
        d = self.tl + (self.tr - self.tl) * u + (self.bl - self.tl) * v
        return self.pos + d * ((y - self.pos[1]) / d[1])


# --------------------------------------------------------------------------- sky


def build_world(ctx, S, ambient, stars):
    """Camera: `bg` above and below, paling to the horizon colour in a band at the hero's height, a
    soft round glow at the hero and (sun / moon) a plain pale disc. Everything else: flat sky light."""
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
    z = nb.sep(direction)[2]
    t = nb.maprange(nb.math('ABSOLUTE', nb.math('SUBTRACT', z, S['z_mid'])), 0.0, S['z_span'], 0.0, 1.0)
    colr = nb.ramp(t, [(0.0, S['horizon']), (0.45, S['mid']), (1.0, S['zenith'])], 'EASE')
    cosang = nb.vmath('DOT_PRODUCT', nb.vmath('NORMALIZE', direction), S['hero_dir'])
    ang = nb.math('ARCCOSINE', nb.math('MINIMUM', nb.math('MAXIMUM', cosang, -1.0), 1.0))

    def lobe(sigma, power):
        return nb.math('EXPONENT', nb.math('MULTIPLY', nb.math('POWER', nb.math('DIVIDE', ang, sigma), power), -1.0))

    colr = nb.mix(nb.math('MULTIPLY', lobe(S['glow_wide'], 1.7), S['wide_k']), colr, S['glow'])
    if S['disc']:
        colr = nb.mix(nb.math('MULTIPLY', lobe(S['alpha'] * 2.1, 1.5), 0.6), colr, S['halo'])
        colr = nb.mix(nb.maprange(ang, S['alpha'] * 0.93, S['alpha'], 1.0, 0.0, 'SMOOTHSTEP'), colr, S['sun'])
    if stars > 0:
        vor = nb.new('ShaderNodeTexVoronoi', voronoi_dimensions='3D', feature='F1')
        nb.put(vor.inputs['Vector'], direction)
        vor.inputs['Scale'].default_value = 170.0
        rnd = nb.sep(vor.outputs['Color'])[0]
        dot = nb.maprange(vor.outputs['Distance'], 0.035, 0.08, 1.0, 0.0, 'SMOOTHSTEP')
        pick = nb.math('MULTIPLY', nb.maprange(rnd, 0.95, 1.0, 0.25, 1.0), nb.math('GREATER_THAN', rnd, 0.95))
        away = nb.maprange(ang, S['glow_wide'] * 0.7, S['glow_wide'] * 2.0, 0.0, 1.0)
        colr = nb.mix(nb.math('MULTIPLY', nb.math('MULTIPLY', dot, pick), nb.math('MULTIPLY', away, stars)), colr, S['star'])
    seen = nb.new('ShaderNodeBackground')
    nb.put(seen.inputs['Color'], colr)
    amb = nb.new('ShaderNodeBackground')
    amb.inputs['Color'].default_value = (*ambient, 1.0)
    mix = nb.new('ShaderNodeMixShader')
    nb.put(mix.inputs[0], nb.new('ShaderNodeLightPath').outputs['Is Camera Ray'])
    nt.links.new(amb.outputs[0], mix.inputs[1])
    nt.links.new(seen.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs[0])


# --------------------------------------------------------------------------- clouds


def cloud_material(name, colour_hex, soft, scale):
    """Matte white with a little subsurface so the terminator and the thin edges stay soft."""
    mat = C.material(name, colour_hex, roughness=0.95, specular=0.0)
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    if soft > 0:
        for key, val in (('Subsurface Weight', soft), ('Subsurface', soft), ('Subsurface Scale', scale)):
            sock = bsdf.inputs.get(key)
            if sock is not None:
                try:
                    sock.default_value = val
                except Exception:
                    pass
        rad = bsdf.inputs.get('Subsurface Radius')
        if rad is not None:
            rad.default_value = (1.0, 1.0, 1.0)
        if 'Subsurface Color' in bsdf.inputs:               # Blender < 4.0
            bsdf.inputs['Subsurface Color'].default_value = C.col(colour_hex)
    return mat


def add_cloud(idx, rng, material, centre, width, puff=1.0, res=0.11):
    """One cumulus: a row of merged metaballs for the base and smaller ones heaped on top.
    ``centre`` is the middle of its base, ``width`` its full width (world units)."""
    mb = bpy.data.metaballs.new('CloudData%03d' % idx)
    mb.resolution = res * 1.6
    mb.render_resolution = res
    mb.threshold = 0.6
    ob = bpy.data.objects.new('Cloud%03dx' % idx, mb)       # one family per cloud: they never merge across depths
    bpy.context.scene.collection.objects.link(ob)
    k = 1.0 / 0.575                                         # element radius -> visible radius
    n = rng.randint(4, 6)
    xs = np.linspace(-1.0, 1.0, n)
    for i, x in enumerate(xs):
        edge = abs(x)
        r = (0.36 - 0.14 * edge ** 1.5) * rng.uniform(0.9, 1.12)
        el = mb.elements.new()
        el.co = (x * 0.82 + rng.uniform(-0.05, 0.05), rng.uniform(-0.08, 0.08), r * 0.72)
        el.radius = r * k
    for i in range(rng.randint(3, 5)):                      # the heap
        x = rng.uniform(-0.55, 0.55)
        r = rng.uniform(0.22, 0.36) * (1.0 - 0.35 * abs(x)) * puff
        el = mb.elements.new()
        el.co = (x, rng.uniform(-0.1, 0.1), 0.34 + rng.uniform(0.02, 0.26) * puff + r * 0.3)
        el.radius = r * k
    for i in range(rng.randint(2, 4)):                      # small knobs along the edge
        x = rng.choice((-1, 1)) * rng.uniform(0.5, 1.0)
        r = rng.uniform(0.12, 0.2)
        el = mb.elements.new()
        el.co = (x * 0.9, rng.uniform(-0.1, 0.1), 0.16 + rng.uniform(0.0, 0.2))
        el.radius = r * k
    mb.materials.append(material)
    s = width / 2.4
    ob.location = (float(centre[0]), float(centre[1]), float(centre[2]))
    ob.scale = (s, s * 0.8, s * 0.86)
    return ob


# --------------------------------------------------------------------------- hero


def add_balloon(bands, basket_hex, lit_burner):
    """Hot-air balloon about 1.9 tall, centred on the origin: a round crown tapering to the mouth, a
    basket on four ropes. ``bands`` are hex colours from the mouth up — level bands, not gores."""
    rb, zc, z0 = 0.66, 0.26, -0.47                           # crown radius, its centre height, mouth height
    prof = [(0.105, z0)]
    for i in range(1, 25):                                   # the taper
        t = i / 24.0
        prof.append((0.105 + (rb - 0.105) * math.sin(math.pi / 2 * t) ** 0.9, z0 + (zc - z0) * t))
    for i in range(1, 25):                                   # the crown
        a = math.pi / 2 * i / 24.0
        prof.append((rb * math.cos(a), zc + rb * math.sin(a)))
    prof[-1] = (0.0, zc + rb)
    mat = C.material('Envelope', '#ffffff', roughness=0.55, specular=0.25, sheen=0.3)
    nt = mat.node_tree
    bsdf = next(nd for nd in nt.nodes if nd.type == 'BSDF_PRINCIPLED')
    nb = NB(nt)
    z = nb.sep(nb.new('ShaderNodeTexCoord').outputs['Object'])[2]
    t = nb.maprange(z, z0, zc + rb, 0.0, 1.0)
    edges = [0.0, 0.12, 0.27, 0.4, 0.58, 0.7, 0.86][:len(bands)]
    nb.put(bsdf.inputs['Base Color'], nb.ramp(t, [(e, C.col(c)) for e, c in zip(edges, bands)], 'CONSTANT'))
    C.add_lathe(prof, mat, segments=96)
    dark = C.material('Basket', basket_hex, roughness=0.8)
    C.add_box((0.2, 0.2, 0.15), 0.02, dark, location=(0, 0, -0.86), segments=3)
    C.add_torus(0.105, 0.012, dark, location=(0, 0, z0), major_segments=48, minor_segments=12)
    import mathutils
    for sx in (-1, 1):
        for sy in (-1, 1):
            a = np.array([0.09 * sx, 0.09 * sy, -0.79])
            b = np.array([0.1 * sx * 0.72, 0.1 * sy * 0.72, z0])
            mid, d = (a + b) / 2, b - a
            rope = C.add_cylinder(0.005, float(np.linalg.norm(d)), 0.0, dark, location=tuple(mid))
            rope.rotation_euler = mathutils.Vector(d).to_track_quat('Z', 'Y').to_euler()
    if lit_burner:
        C.add_sphere(0.03, C.emission_material('Burner', '#ffd9a0', 8.0), location=(0, 0, -0.6), segments=16)


# --------------------------------------------------------------------------- build


def build(ctx):
    pal, rng, prm = ctx.palette, ctx.rng, ctx.params
    c1, c2, shade_hex, c3 = (ctx.color(i) for i in range(4))
    dark = C.luminance(pal['bg']) < 0.2
    if dark:
        lit_hex = C.mix_hex(C.mix_hex(pal['accent'], c1, 0.35), '#ffffff', 0.1)      # rim light on the clouds
        horizon_hex = C.mix_hex(pal['bg'], c1, 0.36)
    else:
        lit_hex = C.mix_hex('#ffffff', pal['bg'], 0.05)
        horizon_hex = C.mix_hex(pal['bg'], '#ffffff', 0.6)
    flip = -1.0 if ctx.mirror else 1.0
    ctx.set_view('Standard')                                  # palette colours stay literal
    cy = ctx.scene.cycles
    try:
        ctx.scene.render.dither_intensity = 1.5
        cy.max_bounces, cy.diffuse_bounces, cy.glossy_bounces = 3, 2, 1
        cy.adaptive_min_samples = 8
        cy.use_light_tree = False
    except Exception:
        pass

    hero = str(prm.get('hero', 'auto')).lower()
    if hero == 'auto':
        hero = 'moon' if dark else 'balloon'
    density = max(0.0, float(prm.get('clouds', 1.0)))
    soft = max(0.0, min(1.0, float(prm.get('soft', 0.45))))
    k_stars = float(prm.get('stars', 1.0)) if dark else 0.0

    fx, fy = ctx.focus
    tx0, ty0, tx1, ty1 = ctx.text_rect
    over = (ty1 - ty0) > 0.9 and (tx1 - tx0) > 0.66            # copy centred on the picture: no hero behind it
    dist = ctx.frame(radius=1.0, fov=FOV, direction=(0.0, -1.0, 0.0))
    ctx.camera.data.clip_start, ctx.camera.data.clip_end = 0.05, 400.0 * dist
    view = View(ctx)
    short = min(ctx.width, ctx.height)
    half = math.tan(math.radians(FOV) / 2)
    quiet = [tuple(r) for r in ctx.quiet if r] or [ctx.text_rect]
    if over:                                                   # centred copy sits on a scrim: only its middle must stay clear
        quiet = [(0.2, 0.25, 0.8, 0.72)]

    def gap(rect, u, v):
        x0, y0, x1, y1 = rect
        return math.hypot(max(x0 - u, 0.0, u - x1) * ctx.width, max(y0 - v, 0.0, v - y1) * ctx.height) / short

    # ---- sky
    room = max(0.16, min([gap(r, fx, fy) for r in quiet] + [0.55 * ctx.art_size])) if not over else 0.5 * ctx.art_size
    alpha = math.atan(0.3 / dist)
    hero_dir = view.ray(fx, fy)
    z_mid = float(view.ray(0.5, min(0.93, fy + 0.1 * ctx.art_size * short / ctx.height))[2])
    z_top, z_bot = float(view.ray(0.5, 0.0)[2]), float(view.ray(0.5, 1.0)[2])
    disc = hero in ('sun', 'moon') and not over
    S = {
        'hero_dir': tuple(float(v) for v in hero_dir), 'alpha': alpha, 'disc': disc,
        'z_mid': z_mid, 'z_span': max(0.05, 0.92 * max(z_top - z_mid, z_mid - z_bot)),
        'zenith': C.col(pal['bg']), 'horizon': C.col(horizon_hex), 'mid': C.col(C.mix_hex(horizon_hex, pal['bg'], 0.6)),
        'glow': C.col(C.mix_hex(horizon_hex, '#ffffff', 0.35) if not dark else C.mix_hex(horizon_hex, pal['accent'], 0.45)),
        'halo': C.col(C.mix_hex(horizon_hex, '#ffffff', 0.5) if not dark else C.mix_hex(pal['accent'], horizon_hex, 0.4)),
        # sun / moon: a plain pale disc, lighter than the sky; never saturated, never with rays
        'sun': C.col('#fffaf0' if not dark else C.mix_hex(pal['accent'], '#fff8ec', 0.6)),
        'star': C.col(C.mix_hex(pal['ink'], pal['bg'], 0.15)),
        'glow_wide': max(alpha * 1.8, math.atan(room * 2 * half) * 0.7), 'wide_k': 0.55 if dark else 0.45,
    }
    lit, shade = np.array(C.col(lit_hex)[:3]), np.array(C.col(shade_hex)[:3])
    ambient = np.clip(shade / np.maximum(lit, 1e-3), 0.03, 0.95)      # sky light alone turns a lit cloud into its shadow colour
    build_world(ctx, S, tuple(float(v) for v in ambient), k_stars)

    # ---- key light: from the copy side by day, from behind the hero at night
    if dark:
        to_light = np.array([0.1 * flip, 0.93, 0.36])
    else:
        to_light = np.array([-0.62 * flip, -0.38, 0.69])
    to_light /= np.linalg.norm(to_light)
    direct = (1.0 - ambient) / 0.8
    sun = C.add_sun(direction=tuple(-to_light), strength=1.0, angle=6.0)
    sun.data.color = tuple(float(v) for v in direct / direct.max())
    sun.data.energy = float(direct.max()) * math.pi

    # ---- clouds, placed in poster space
    depth_tint = lambda t: C.mix_hex(lit_hex, C.mix_hex(horizon_hex, pal['bg'], 0.35), 0.62 * t)   # far clouds sink into the sky
    mats = {}

    def mat_for(t, world_w):
        key = (round(t, 2), round(math.log(max(world_w, 1e-3)), 1))
        if key not in mats:
            mats[key] = cloud_material('Cloud', depth_tint(t), soft, 0.14 * world_w)
        return mats[key]

    count = [0]

    def place(u, v, w_frac, depth, t, puff=1.0, pad=0.02):
        """Cloud with its base centred at poster (u, v), `w_frac` of the short side wide, `depth` camera
        distances behind the hero. Skipped if it would touch a rectangle that carries type."""
        w_u = w_frac * short / ctx.width
        h_v = 0.56 * w_frac * short / ctx.height * puff
        box = (u - w_u / 2, v - h_v, u + w_u / 2, v + 0.08 * h_v)
        for q in quiet:
            if box[0] < q[2] + pad and box[2] > q[0] - pad and box[1] < q[3] + pad and box[3] > q[1] - pad:
                return None
        y = depth * dist
        p = view.at_depth(u, v, y)
        world_w = w_frac * short / ctx.width * float(np.linalg.norm(view.at_depth(1.0, v, y) - view.at_depth(0.0, v, y)))
        count[0] += 1
        res = min(0.12, max(0.04, 0.016 / w_frac))            # big near clouds get a finer surface: smooth outlines at 4K
        return add_cloud(count[0], rng, mat_for(t, world_w), p, world_w, puff, res)

    hero_r = 0.5 * ctx.art_size                               # hero circle radius, in short sides
    solid = hero == 'balloon' and not over                    # a body clouds can pass behind (a disc is in the sky itself)
    keep = 0.0 if over else (0.78 if solid else 0.45)         # share of the hero circle that clouds in front must leave free

    def hero_clear(u, v, w_frac, depth):
        """True if a cloud of that size at (u, v) leaves the hero itself uncovered."""
        if keep <= 0 or (solid and depth > 0.25):
            return True
        du, dv = (u - fx) * ctx.width / short, (v - 0.26 * w_frac - fy) * ctx.height / short
        return math.hypot(du, dv) > keep * hero_r + 0.46 * w_frac

    def art_weight(u):
        """1 on the hero's side of the poster, falling to 0 towards the far edge."""
        return math.exp(-((u - fx) / 0.42) ** 2)

    # a sea of cloud along the bottom: overlapping rows, the nearest lowest and largest, heaped up under the hero
    rows = [(7.0, 0.92, 0.15, 0.87), (3.4, 0.62, 0.23, 0.925), (1.3, 0.32, 0.32, 0.99), (-0.4, 0.0, 0.44, 1.08)]
    for depth, t, size, v_base in rows:
        n = max(3, int(round((ctx.width / short) / (size * 0.56) * density)))
        for i in range(n + 2):
            u = (i - 0.5 + rng.uniform(-0.3, 0.3)) / n
            w = size * rng.uniform(0.8, 1.25)
            v = v_base - 0.075 * art_weight(u) * (1.0 + 0.5 * t) + rng.uniform(-0.02, 0.02)
            if hero_clear(u, v, w, depth):
                place(u, v, w, depth, t, rng.uniform(0.85, 1.15))
    # clouds drifting around and behind the hero
    for i in range(int(round(9 * density))):
        a = rng.uniform(0, math.tau)
        rad = hero_r * rng.uniform(0.75, 1.9)
        u = fx + rad * math.cos(a) * short / ctx.width
        v = fy + rad * math.sin(a) * 0.85 * short / ctx.height + 0.05
        w = rng.uniform(0.18, 0.34) * (0.6 + 0.7 * ctx.art_size)
        depth = rng.choice((0.8, 1.5, 2.6))
        if -0.05 < u < 1.05 and hero_clear(u, v, w, depth):
            place(u, v, w, depth, min(1.0, 0.16 + 0.2 * depth), rng.uniform(0.9, 1.2))
    # small far clouds through the pale band of sky
    for i in range(int(round(16 * density))):
        u, v = rng.uniform(-0.05, 1.05), fy + rng.uniform(-0.3, 0.32)
        w = rng.uniform(0.07, 0.14)
        if hero_clear(u, v, w, 9.0):
            place(u, v, w, rng.uniform(6.0, 11.0), 1.0, rng.uniform(0.7, 1.0), pad=0.035)

    # ---- hero
    if over:
        return
    if hero == 'balloon':
        cream = '#fff8ec' if not dark else C.mix_hex(lit_hex, '#fff6e6', 0.4)
        add_balloon([c1, cream, c3, cream, c2, cream, c1], C.mix_hex(pal['ink'], c1, 0.3) if not dark else C.mix_hex(pal['bg'], c1, 0.4), dark)
