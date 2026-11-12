"""Desert dunes — a full-picture scene: a sea of sand dunes with crisp ridgelines and long shadows in
very low sun, under a graded sky with a small sun (or moon) at the layout focus.

How the picture is composed around the copy
- The sun is the hero: it sits at the world origin, so ``ctx.frame`` puts it on the layout focus.
- The camera pitch is solved so the horizon falls just below the sun — or lower when the copy runs
  the full height beside the art (``left`` / ``right``): then the sky is the calm area and one big
  dune rises under the sun on the art side only.
- The camera stands near the top of a gentle slope, so the bottom of the frame (footer, and the whole
  copy block in ``bottom`` layouts) is one calm, evenly lit sand face with fine ripples.
- Sky, haze and sand are literal palette colours ('Standard' view): ``bg`` = upper sky (behind the
  copy), ``colors`` = [lit sand, shadowed sand, horizon haze, glow around the sun], ``accent`` = the moon / sun tint on dark palettes (on light ones
  the disc is simply paler than the sky; it is never a saturated disc and has no rays).

No volumetrics: distance haze is a view-distance mix in the sand material; the sky is the world.
"""
import math

import bpy
import numpy as np

import common as C

FOV = 36.0          # along the short side of the poster
TOON_SIZE, TOON_SMOOTH = 0.93, 0.1
EYE = 2.6           # camera height above the sand it stands on (world units ~ metres)


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
    """Seeded 2D gradient noise on numpy arrays (so half a million vertices cost a fraction of a second)."""

    def __init__(self, seed):
        rs = np.random.RandomState(seed % (2 ** 31))
        self.perm = np.concatenate([rs.permutation(256)] * 2)
        ang = rs.uniform(0, 2 * np.pi, 256)
        self.gx, self.gy = np.cos(ang), np.sin(ang)

    def perlin(self, x, y):
        x, y = np.asarray(x, dtype=np.float64), np.asarray(y, dtype=np.float64)
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
    """World-space rays through poster coordinates (u right, v down, both 0..1), after ctx.frame()."""

    def __init__(self, ctx):
        bpy.context.view_layer.update()
        cam = ctx.camera
        fr = cam.data.view_frame(scene=ctx.scene)
        self.tl = max(fr, key=lambda p: -p.x + p.y)
        self.tr = max(fr, key=lambda p: p.x + p.y)
        self.bl = max(fr, key=lambda p: -p.x - p.y)
        self.rot = cam.matrix_world.to_3x3()
        self.pos = cam.matrix_world.translation.copy()

    def ray(self, u, v):
        p = self.tl + (self.tr - self.tl) * u + (self.bl - self.tl) * v
        return (self.rot @ p).normalized()


def grid_mesh(name, pts, material, smooth=True):
    """Mesh from a (rows, cols, 3) array of points, quads wound so normals point up."""
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


def lin3(hexcol):
    return np.array(C.col(hexcol)[:3])


def smooth01(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3 - 2 * x)


# --------------------------------------------------------------------------- sky


def sky_nodes(nb, direction, S, disc):
    """Sky colour for a direction socket: vertical ramp horizon -> zenith, a warm band along the horizon
    near the sun, a soft glow around it and (camera only) the disc. Used by the world and by the haze."""
    x, y, z = nb.sep(direction)
    zc = nb.math('MAXIMUM', z, 0.0)
    t = nb.maprange(zc, 0.0, S['z_top'], 0.0, 1.0)
    colr = nb.ramp(t, [(0.0, S['horizon']), (0.42, S['mid']), (1.0, S['zenith'])], 'EASE')
    cosang = nb.vmath('DOT_PRODUCT', nb.vmath('NORMALIZE', direction), S['sun_dir'])
    ang = nb.math('ARCCOSINE', nb.math('MINIMUM', nb.math('MAXIMUM', cosang, -1.0), 1.0))

    def lobe(sigma, power=2.0):
        return nb.math('EXPONENT', nb.math('MULTIPLY', nb.math('POWER', nb.math('DIVIDE', ang, sigma), power), -1.0))

    # band hugging the horizon, widest at the sun's bearing
    band = nb.math('MULTIPLY', lobe(S['band_az'], 2.0),
                   nb.math('EXPONENT', nb.math('MULTIPLY', nb.math('POWER', nb.math('DIVIDE', zc, S['band_el']), 1.3), -1.0)))
    colr = nb.mix(nb.math('MULTIPLY', band, S['band_k']), colr, S['glow'])
    wide = nb.math('MULTIPLY', lobe(S['glow_wide'], 1.6), S['wide_k'])
    colr = nb.mix(wide, colr, S['glow'])
    tight = nb.math('MULTIPLY', lobe(S['glow_tight'], 1.5), S['tight_k'])
    colr = nb.mix(tight, colr, S['halo'])
    if disc and S['disc']:
        edge = nb.maprange(ang, S['alpha'] * 0.93, S['alpha'] * 1.0, 1.0, 0.0, 'SMOOTHSTEP')
        colr = nb.mix(edge, colr, S['sun'])
    return colr, ang, zc


def horizon_colour(S, ang):
    """The same sky as sky_nodes(), evaluated in Python on the horizon at `ang` radians from the sun."""
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
        pick = nb.maprange(rnd, 0.955, 1.0, 0.25, 1.0)
        pick = nb.math('MULTIPLY', pick, nb.math('GREATER_THAN', rnd, 0.955))
        high = nb.maprange(zc, S['z_top'] * 0.12, S['z_top'] * 0.7, 0.0, 1.0)
        away = nb.maprange(ang, S['glow_wide'] * 0.8, S['glow_wide'] * 2.2, 0.0, 1.0)
        k = nb.math('MULTIPLY', nb.math('MULTIPLY', dot, pick), nb.math('MULTIPLY', nb.math('MULTIPLY', high, away), stars))
        colr = nb.mix(k, colr, S['star'])
    cam_bg = nb.new('ShaderNodeBackground')
    nb.put(cam_bg.inputs['Color'], colr)
    amb = nb.new('ShaderNodeBackground')
    up = nb.math('MAXIMUM', nb.sep(direction)[2], 0.0)
    low = nb.math('POWER', nb.math('SUBTRACT', 1.0, up), 2.0)
    amb_col = nb.mix(low, tuple(0.82 * v / 0.9 for v in ambient) + (1.0,), tuple(1.36 * v / 0.9 for v in ambient) + (1.0,))
    nb.put(amb.inputs['Color'], amb_col)
    mix = nb.new('ShaderNodeMixShader')
    nb.put(mix.inputs[0], nb.new('ShaderNodeLightPath').outputs['Is Camera Ray'])
    nt.links.new(amb.outputs[0], mix.inputs[1])
    nt.links.new(cam_bg.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs[0])


def sand_material(S, lit_hex, haze_len, ripple, ripple_rot, ripple_len):
    mat = bpy.data.materials.new('Sand')
    try:
        mat.use_nodes = True
    except Exception:
        pass
    nt = mat.node_tree
    nt.nodes.clear()
    nb = NB(nt)
    out = nb.new('ShaderNodeOutputMaterial')
    geo = nb.new('ShaderNodeNewGeometry')
    dist = nb.new('ShaderNodeCameraData').outputs['View Distance']

    # Mostly a toon response: every face that sees the sun shows the palette's lit colour, every face
    # that does not shows the shadow colour — the two-tone look of a printed landscape. A third of
    # ordinary diffuse keeps a little modelling on the slopes.
    lamb = nb.new('ShaderNodeBsdfDiffuse')
    lamb.inputs['Color'].default_value = C.col(lit_hex)
    toon = nb.new('ShaderNodeBsdfToon', component='DIFFUSE')
    toon.inputs['Color'].default_value = C.col(lit_hex)
    toon.inputs['Size'].default_value = TOON_SIZE
    toon.inputs['Smooth'].default_value = TOON_SMOOTH
    diff = nb.new('ShaderNodeMixShader')
    diff.inputs[0].default_value = 0.36
    nt.links.new(toon.outputs[0], diff.inputs[1])
    nt.links.new(lamb.outputs[0], diff.inputs[2])
    if ripple > 0:
        mp = nb.new('ShaderNodeMapping')
        nb.put(mp.inputs['Vector'], geo.outputs['Position'])
        mp.inputs['Rotation'].default_value = (0.0, 0.0, ripple_rot)
        # bands across the line of sight: they read as level ripples and never fan out from a point
        wave = nb.new('ShaderNodeTexWave', wave_type='BANDS', bands_direction='Y', wave_profile='SIN')
        nb.put(wave.inputs['Vector'], mp.outputs[0])
        wave.inputs['Scale'].default_value = 0.314 / ripple_len
        wave.inputs['Distortion'].default_value = 3.4
        wave.inputs['Detail'].default_value = 1.6
        wave.inputs['Detail Scale'].default_value = 0.55
        wave.inputs['Detail Roughness'].default_value = 0.45
        patch = nb.new('ShaderNodeTexNoise', noise_dimensions='3D')
        nb.put(patch.inputs['Vector'], geo.outputs['Position'])
        patch.inputs['Scale'].default_value = 0.05
        patch.inputs['Detail'].default_value = 2.0
        fade = nb.math('MULTIPLY', nb.maprange(dist, 5.0, 85.0, 1.0, 0.0, 'SMOOTHSTEP'), nb.maprange(patch.outputs[0], 0.3, 0.62, 0.35, 1.0, 'SMOOTHSTEP'))
        bump = nb.new('ShaderNodeBump')
        nb.put(bump.inputs['Strength'], nb.math('MULTIPLY', fade, min(1.0, 0.5 * ripple)))
        bump.inputs['Distance'].default_value = 0.05 * ripple_len / 0.3
        nb.put(bump.inputs['Height'], wave.outputs[0])
        nb.put(lamb.inputs['Normal'], bump.outputs[0])
        nb.put(toon.inputs['Normal'], bump.outputs[0])

    # distance haze: sand dissolves into the sky colour of the horizon it is seen against. That colour
    # depends only on the angle to the sun, so it is tabulated into one colour ramp (cheap to shade).
    x, y, z = nb.sep(geo.outputs['Incoming'])
    flat = nb.vmath('NORMALIZE', nb.comb(nb.math('MULTIPLY', x, -1.0), nb.math('MULTIPLY', y, -1.0), 0.0))
    cosang = nb.math('MINIMUM', nb.math('MAXIMUM', nb.vmath('DOT_PRODUCT', flat, S['sun_dir']), -1.0), 1.0)
    stops = []
    for i in range(14):
        ang = (math.pi / 2) * (i / 13.0) ** 1.8
        stops.append((ang / (math.pi / 2), horizon_colour(S, max(ang, 1e-4))))
    haze_col = nb.ramp(nb.math('DIVIDE', nb.math('ARCCOSINE', cosang), math.pi / 2), stops, 'LINEAR')
    f = nb.math('SUBTRACT', 1.0, nb.math('EXPONENT', nb.math('MULTIPLY', nb.math('POWER', nb.math('DIVIDE', dist, haze_len), 1.15), -1.0)))
    f = nb.math('MULTIPLY', f, nb.new('ShaderNodeLightPath').outputs['Is Camera Ray'])
    em = nb.new('ShaderNodeEmission')
    nb.put(em.inputs['Color'], haze_col)
    mix = nb.new('ShaderNodeMixShader')
    nb.put(mix.inputs[0], f)
    nt.links.new(diff.outputs[0], mix.inputs[1])
    nt.links.new(em.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs['Surface'])
    return mat


# --------------------------------------------------------------------------- terrain


def dune_profile(t, c):
    """One dune across its crest: t in [0,1), crest at t=0; a long gentle fall over [0,c], then the
    short steep slip face of the next dune climbing back up over [c,1]. Returns height 0..1."""
    q = 1.0 - np.clip(t / c, 0.0, 1.0)                       # gentle side: 1 at the crest -> 0 in the trough
    gentle = 0.8 * (0.5 - 0.5 * np.cos(np.pi * q)) + 0.2 * q
    r = np.clip((t - c) / (1.0 - c), 0.0, 1.0)               # steep side: 0 in the trough -> 1 at the crest
    steep = r ** 1.45
    return np.where(t < c, gentle, steep)


def build(ctx):
    pal, rng, prm = ctx.palette, ctx.rng, ctx.params
    lit_hex, shade_hex, horizon_hex, glow_hex = (ctx.color(i) for i in range(4))
    dark = C.luminance(pal['bg']) < 0.2
    ctx.set_view('Standard')                                  # palette colours stay literal
    cy = ctx.scene.cycles
    try:
        ctx.scene.render.dither_intensity = 1.5               # keeps the long sky gradient free of banding
        cy.max_bounces, cy.diffuse_bounces, cy.glossy_bounces = 2, 1, 0   # sun + sky + one bounce is all sand needs
        cy.adaptive_min_samples = 8                           # the open sky converges at once; let it stop early
        cy.use_light_tree = False                             # one sun and the sky: the light tree only costs time
    except Exception:
        pass

    k_height = float(prm.get('height', 1.0))
    k_haze = max(0.2, float(prm.get('haze', 1.0)))
    k_ripple = float(prm.get('ripples', 1.0))
    k_sun = float(prm.get('sun', 1.0))
    k_stars = float(prm.get('stars', 1.0)) if dark else 0.0

    # ---- where the copy sits decides the horizon
    fx, fy = ctx.focus
    tx0, ty0, tx1, ty1 = ctx.text_rect
    tall, wide = (ty1 - ty0) > 0.9, (tx1 - tx0) > 0.66
    mode = 'over' if (tall and wide) else 'side' if tall else 'bottom' if ty0 > 0.2 else 'top'
    diam = ctx.art_size * min(ctx.width, ctx.height) / ctx.height      # hero circle as a fraction of the frame height
    hy = fy + (0.28 if mode == 'over' else 0.24) * diam
    if mode == 'side':
        hy = max(hy, 0.8)
    hy = min(hy, 0.87)
    side = -1.0 if fx < 0.45 else 1.0                          # which side the light comes from (keeps the footer corner lit)
    plain = mode in ('bottom', 'side')                         # one big calm slope instead of diagonal bands

    half = math.tan(math.radians(FOV) / 2)
    tan_pitch = (hy - fy) * 2 * half / (1.0 if ctx.aspect >= 1 else ctx.aspect)
    pitch = math.atan(tan_pitch)
    dist = ctx.frame(radius=1.0, fov=FOV, direction=(0.0, -math.cos(pitch), -math.sin(pitch)))
    view = View(ctx)
    cam = view.pos
    sun_dir = (-cam).normalized()                              # the hero: straight through the layout focus
    ctx.camera.data.clip_start, ctx.camera.data.clip_end = 0.2, 6000.0

    # ---- sky
    # how far the calm copy area is from the sun, as an angle: glows must die out before they reach it
    def gap(rect):
        x0, y0, x1, y1 = rect
        dx = max(x0 - fx, 0.0, fx - x1) * ctx.width
        dy = max(y0 - fy, 0.0, fy - y1) * ctx.height
        return math.hypot(dx, dy) / min(ctx.width, ctx.height)
    quiet = [r for r in ctx.quiet if r] or [ctx.text_rect]
    room = min([gap(r) for r in quiet] + [0.5 * ctx.art_size])
    room = max(room, 0.12) if mode != 'over' else 0.5 * ctx.art_size
    room_ang = math.atan(room * 2 * half)
    if mode == 'over':
        k_sun = 0.0                                            # copy sits on the sun: keep only its glow
    alpha = math.atan(0.105 * max(k_sun, 1e-3) / dist)         # angular radius of the disc
    z_top = max(0.08, view.ray(0.5, max(0.0, hy - 0.62)).z)    # the sky has reached `bg` this far above the horizon
    # The sun / moon is only ever a plain pale disc inside a soft round glow: lighter than the sky on
    # light palettes, a pale tint of the accent on dark ones. Never a saturated disc, never rays.
    sun_hex = C.mix_hex(glow_hex, '#ffffff', 0.72) if not dark else C.mix_hex(pal['accent'], '#fff8ec', 0.55)
    S = {
        'sun_dir': tuple(sun_dir), 'alpha': alpha, 'z_top': z_top,
        'zenith': C.col(pal['bg']), 'horizon': C.col(horizon_hex),
        'mid': C.col(C.mix_hex(horizon_hex, pal['bg'], 0.62)),
        'glow': C.col(glow_hex), 'halo': C.col(C.mix_hex(glow_hex, '#ffffff', 0.25 if dark else 0.12)),
        'sun': C.col(sun_hex), 'star': C.col(C.mix_hex(pal['ink'], pal['bg'], 0.15)),
        'band_az': max(math.radians(7), room_ang * 1.25), 'band_el': max(0.02, 0.26 * z_top), 'band_k': 0.7 if dark else 0.85,
        'glow_wide': max(alpha * 3.0, room_ang * 0.62), 'wide_k': 0.5 if dark else 0.6,
        'glow_tight': alpha * 2.1, 'tight_k': 0.55 if k_sun > 0 else 0.0, 'disc': k_sun > 0,
    }
    lit, shade = lin3(lit_hex), lin3(shade_hex)
    ambient = np.clip(shade / np.maximum(lit, 1e-3), 0.02, 0.92)   # sky light alone turns lit sand into shadowed sand
    build_world(ctx, S, tuple(float(v) for v in ambient), k_stars)

    # ---- dune sea parameters
    seed = rng.randrange(1 << 30)
    nz = Noise2(seed)
    lam = 60.0 * rng.uniform(0.9, 1.12)                        # crest-to-crest distance
    amp = 6.6 * k_height
    c_gentle = 0.72                                           # share of each dune that is the gentle, lit face
    m_near = 0.85
    o = [rng.uniform(0, 90) for _ in range(8)]
    a_cam = 0.1 * c_gentle * lam                              # camera: this far down the gentle face from its crest

    # Crest direction. `plain`: nearly along the view, so the slope under the camera runs to the horizon.
    # Otherwise diagonal: the camera looks across the troughs at the shadowed faces of the next dunes,
    # turned just far enough that the first trough stays above the footer.
    if plain:
        crest_az = math.radians(rng.uniform(10.0, 15.0))
    else:
        crest_az = -math.radians(rng.uniform(31.0, 37.0) if side > 0 else rng.uniform(15.0, 19.0))
        fr = view.ray(0.45, hy)
        az_f = math.atan2(fr.x * side, fr.y)
        h_c = m_near * amp * float(dune_profile(np.array([a_cam / lam]), c_gentle)[0])

        def trough_y(caz):
            rel = az_f - caz
            if rel < math.radians(2.0):
                return hy
            d_t = (c_gentle * lam - a_cam) / math.sin(rel)
            return ctx._project((side * d_t * math.sin(az_f) + cam.x, d_t * math.cos(az_f) + cam.y, cam.z - EYE - h_c))[1]
        y_max = min(0.865, hy + 0.6 * (1.0 - hy))
        while crest_az < -math.radians(4.0) and trough_y(crest_az) > y_max:
            crest_az += math.radians(1.0)

    # ---- sun lamp: low and from the hero's side, so every crest splits into a lit and a shadowed face
    light_az = math.radians(float(prm.get('azimuth', 42.0)))
    light_el = math.radians(float(prm.get('elevation', 10.0)))
    to_light = np.array([side * math.sin(light_az) * math.cos(light_el), math.cos(light_az) * math.cos(light_el), math.sin(light_el)])
    cone = min(math.pi / 2, (TOON_SIZE + TOON_SMOOTH) * math.pi / 2)
    direct = (1.0 - ambient) * 2.0 * (1.0 - math.cos(cone))    # sun + sky on a lit face = the palette's lit colour
    lamp = C.add_sun(direction=tuple(-to_light), strength=1.0, angle=float(prm.get('shadow', 0.8)))
    lamp.data.color = tuple(float(v) for v in direct / direct.max())
    lamp.data.energy = float(direct.max()) * math.pi

    def field(X, Y):
        """Dune coordinates. X is mirrored so the light always comes from +X."""
        b = X * math.sin(crest_az) + Y * math.cos(crest_az)       # along the crests
        a = X * math.cos(crest_az) - Y * math.sin(crest_az)       # across them (towards the light)
        warp = lam * (0.46 * nz.perlin(b / (3.1 * lam) + o[0], a / (5.0 * lam) + o[1])
                      + 0.17 * nz.perlin(b / (1.15 * lam) + o[2], a / (2.1 * lam) + o[3]))
        return a, b, warp

    w0 = float(field(np.zeros(1), np.zeros(1))[2][0])

    # The camera stands on the gentle, lit face of a dune, so the bottom of the frame is calm sand.
    # `bottom` layouts: its crest passes on the far-from-light side and is solved to enter the frame
    # just under the horizon, leaving one big slope for the copy. Otherwise the camera is near the top
    # of the slope and looks diagonally across the troughs at the shadowed faces of the next dunes.
    if plain:
        u_edge = 0.0 if side > 0 else 1.0
        er = view.ray(u_edge, hy)
        az_edge = math.atan2(er.x * side, er.y)
        y_entry = hy + (0.2 * max(0.02, ty0 - hy) if mode == 'bottom' else 0.035)
        fan = min(math.radians(90.0), max(math.radians(6.0), crest_az - az_edge))

        def entry_y(a_c):
            rise = amp * m_near * (1.0 - float(dune_profile(np.array([a_c / lam]), c_gentle)[0]))
            d_e = a_c / math.sin(fan)
            px = (side * d_e * math.sin(az_edge) + cam.x, d_e * math.cos(az_edge) + cam.y, cam.z - EYE + rise)
            return ctx._project(px)[1]
        lo, hi = 2.0, 0.62 * c_gentle * lam
        for _ in range(26):
            mid = 0.5 * (lo + hi)
            if entry_y(mid) > y_entry:
                lo = mid
            else:
                hi = mid
        a_cam = 0.5 * (lo + hi)
    phase0 = a_cam / lam - w0 / lam

    def height(X, Y):
        a, b, warp = field(X, Y)
        calm = np.exp(-((X * X + Y * Y) / (75.0 * 75.0)))         # no meander right around the camera
        u = (a + warp * (1.0 - calm) + w0 * calm) / lam + phase0
        cell = np.floor(u)
        t = u - cell
        crest = np.where(t < c_gentle, cell, cell + 1.0)          # which crest this point belongs to
        m = 0.5 + 0.5 * nz.perlin(b / (3.6 * lam) + 17.31 * crest + o[4], crest * 0.731 + o[5])
        near = np.exp(-(np.abs(crest) / 1.2) ** 2) * np.exp(-(b / (4 * lam)) ** 2)   # the camera's own dune keeps its size
        far = smooth01((np.sqrt(X * X + Y * Y) - 110.0) / 320.0)                 # dunes grow towards the horizon: a skyline
        m = (0.5 + 0.62 * m) * (1.0 + 1.15 * far * (0.55 + 0.45 * smooth01(0.5 + X / 500.0))) * (1 - near) + m_near * near
        h = amp * m * dune_profile(t, c_gentle)
        return h + 1.3 * k_height * nz.fbm(X / 240.0 + o[6], Y / 240.0 + o[7], 2)

    h_cam = float(height(np.zeros(1), np.zeros(1))[0])

    # the big dune under the sun: only in view on the art side, its crest coming towards the camera
    def scr_az(u):
        d = view.ray(u, hy)
        return math.atan2(d.x, d.y)
    if mode == 'side':
        peak_u, peak_v, d_m = fx + 0.03 * side, fy + 0.42 * (hy - fy), 150.0
    else:
        peak_u, peak_v, d_m = fx + (0.22 if ctx.aspect >= 1 else 0.3) * side, hy - (0.05 if mode != 'bottom' else 0.03), 190.0
    pr = view.ray(min(0.98, max(0.02, peak_u)), peak_v)
    az_m = math.atan2(pr.x, pr.y)
    rise = d_m * pr.z / math.hypot(pr.x, pr.y)                     # crest height above the eye
    xm, ym = side * d_m * math.sin(az_m), d_m * math.cos(az_m)    # mirrored X
    big_h = (rise + EYE + h_cam) * k_height ** 0.5
    th2 = az_m * side + math.radians(7.0)
    w_steep, w_gentle, l_m = (max(16.0, 1.75 * big_h), 120.0, 150.0) if mode == 'side' else (max(16.0, 1.75 * big_h), 130.0, 170.0)

    def big(X, Y):
        b = (X - xm) * math.sin(th2) + (Y - ym) * math.cos(th2)
        a = (X - xm) * math.cos(th2) - (Y - ym) * math.sin(th2)
        a = a + 14.0 * nz.perlin(b / 95.0 + o[1], o[2]) + 5.0 * nz.perlin(b / 31.0 + o[3], o[5])
        steep = np.clip(1.0 + a / w_steep, 0.0, 1.0) ** 1.45
        q = 1.0 - np.clip(a / w_gentle, 0.0, 1.0)
        gentle = 0.8 * (0.5 - 0.5 * np.cos(np.pi * q)) + 0.2 * q
        prof = np.where(a < 0, steep, gentle)
        along = np.exp(-(np.abs(b) / l_m) ** 2.2) * smooth01((b + d_m - 58.0) / (d_m * 0.45))
        return big_h * prof * along, prof * along

    # azimuth span: the frame plus a margin on the light side so off-frame dunes still cast their shadows in
    us = [0.0, 1.0]
    azs = [math.atan2(view.ray(u, v).x, view.ray(u, v).y) for u in us for v in (hy, 1.0)]
    m_light, m_far = math.radians(24), math.radians(9)
    az0 = min(azs) - (m_light if side < 0 else m_far)
    az1 = max(azs) + (m_light if side > 0 else m_far)
    dep = max(-view.ray(u, 1.0).z for u in (0.0, 0.5, 1.0))
    d0 = max(0.6, 0.55 * EYE / max(1e-3, math.tan(math.asin(min(0.99, max(dep, 0.02))))))
    d1 = 2600.0
    nr, nc = 820, 700
    az = np.linspace(az0, az1, nc)[None, :]
    dd = (d0 * (d1 / d0) ** np.linspace(0.0, 1.0, nr))[:, None]
    Xw, Yw = dd * np.sin(az), dd * np.cos(az)
    Xm = Xw * side
    hb, wb = big(Xm, Yw)
    h = height(Xm, Yw) * (1.0 - 0.72 * wb) + hb
    Z = cam.z - EYE - h_cam + h
    pts = np.stack([Xw + cam.x, Yw + cam.y, Z], axis=-1)
    haze_len = 800.0 / k_haze
    ripple_len = 0.23
    sand = sand_material(S, lit_hex, haze_len, k_ripple * (0.7 if mode == 'bottom' else 1.0), 0.0, ripple_len)
    grid_mesh('Dunes', pts, sand)
