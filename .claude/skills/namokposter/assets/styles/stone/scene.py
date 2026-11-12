"""Stone — polished, veined marble with small gold accents in a soft studio: plinths, steps,
spheres and arches, the language of a product podium.

motif: podium (stepped plinth, sphere and ring) | balance (spheres and slabs in equilibrium) |
       arch (a gateway of nested arches on steps)
"""
import math
import os
import tempfile

import bpy
import numpy as np
from mathutils import Vector

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


# ----------------------------------------------------------------------------- materials
def _mix(nt, blend='MIX'):
    try:
        n = nt.nodes.new('ShaderNodeMix')
        n.data_type = 'RGBA'
        n.blend_type = blend
        return n.inputs[0], n.inputs[6], n.inputs[7], n.outputs[2]
    except Exception:
        n = nt.nodes.new('ShaderNodeMixRGB')
        n.blend_type = blend
        return n.inputs[0], n.inputs[1], n.inputs[2], n.outputs[0]


def _marble(name, base, vein, seed=0.0, scale=1.0, amount=1.0, rough=0.085, turn=(0.5, 0.9, 0.3)):
    """Polished stone. A vein is one line of a set of parallel bands whose phase is bent by slow
    noise, so it runs long and one way but never straight; most bands of a set are left out
    (sparse), each fades in and out along its length and carries a soft halo. A second, finer set
    crosses at another angle. The pattern is solid (object space), offset per object so no two
    blocks match."""
    mat = C.material(name, base, roughness=rough, coat=0.22, coat_roughness=0.03, specular=0.5)
    deep = C.luminance(base) < 0.12                    # pale veins on a dark ground read much stronger
    k_halo, k_cloud = (0.1, 0.07) if deep else (0.24, 0.15)
    nt = mat.node_tree
    N, L = nt.nodes.new, nt.links.new
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')

    def math_(op, a=None, b=None, c=None, clamp=False):
        n = N('ShaderNodeMath')
        n.operation = op
        n.use_clamp = clamp
        for sock, v in zip(n.inputs, (a, b, c)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                sock.default_value = v
            else:
                L(v, sock)
        return n.outputs[0]

    def noise(vec, sc, detail=2.0, rough_=0.55):
        n = N('ShaderNodeTexNoise')
        n.inputs['Scale'].default_value = sc
        n.inputs['Detail'].default_value = detail
        n.inputs['Roughness'].default_value = rough_
        L(vec, n.inputs['Vector'])
        return n

    def ramp(value, lo, hi, out_lo=0.0, out_hi=1.0, kind='SMOOTHSTEP'):
        m = N('ShaderNodeMapRange')
        m.interpolation_type = kind
        m.inputs[1].default_value, m.inputs[2].default_value = lo, hi
        m.inputs[3].default_value, m.inputs[4].default_value = out_lo, out_hi
        L(value, m.inputs[0])
        return m.outputs[0]

    tc = N('ShaderNodeTexCoord')
    info = N('ShaderNodeObjectInfo')
    shift = N('ShaderNodeVectorMath')
    shift.operation = 'SCALE'
    shift.inputs[0].default_value = (31.7, 17.3, 23.9)
    L(info.outputs['Random'], shift.inputs['Scale'])
    moved = N('ShaderNodeVectorMath')
    moved.inputs[1].default_value = (seed * 1.37, seed * 2.11, seed * 0.73)
    L(tc.outputs['Object'], moved.inputs[0])
    moved2 = N('ShaderNodeVectorMath')
    L(moved.outputs[0], moved2.inputs[0])
    L(shift.outputs[0], moved2.inputs[1])
    pos = moved2.outputs[0]

    def vein_set(rotation, period, bend, width, keep, salt):
        mp = N('ShaderNodeMapping')
        mp.inputs['Rotation'].default_value = rotation
        mp.inputs['Scale'].default_value = (scale, scale, scale)
        L(pos, mp.inputs['Vector'])
        q = mp.outputs[0]
        sep = N('ShaderNodeSeparateXYZ')
        L(q, sep.inputs[0])
        slow = math_('MULTIPLY', math_('SUBTRACT', noise(q, 0.75, 2.0, 0.5).outputs[0], 0.5), bend)
        quick = math_('MULTIPLY', math_('SUBTRACT', noise(q, 4.5, 2.0, 0.5).outputs[0], 0.5), bend * 0.1)
        t = math_('ADD', math_('ADD', math_('MULTIPLY', sep.outputs[0], 1.0 / period), slow), quick)
        t = math_('ADD', t, salt)
        dist = math_('ABSOLUTE', math_('SUBTRACT', math_('FRACT', t), 0.5))         # 0 on the vein
        core = ramp(dist, 0.0, width / period, 1.0, 0.0, 'SMOOTHERSTEP')
        halo = math_('MULTIPLY', ramp(dist, 0.0, 5.5 * width / period, 1.0, 0.0, 'SMOOTHERSTEP'), k_halo)
        band = math_('FLOOR', t)                                                     # which vein
        rnd = math_('FRACT', math_('MULTIPLY', math_('SINE', math_('MULTIPLY', math_('ADD', band, salt), 12.9898)), 43758.5453))
        kept = math_('LESS_THAN', rnd, keep)
        fade = ramp(noise(q, 0.9, 1.0).outputs[0], 0.34, 0.56)                       # in and out along its length
        return math_('MULTIPLY', math_('MULTIPLY', math_('ADD', core, halo), kept), fade)

    main = vein_set(turn, 0.42, 1.5, 0.011, 0.62, 3.1 + seed)
    cross = vein_set((turn[0] + 0.7, turn[1] - 0.5, turn[2] + 1.1), 0.27, 1.1, 0.006, 0.45, 7.7 + seed)
    veins = math_('MULTIPLY', math_('ADD', main, math_('MULTIPLY', cross, 0.55)), amount, clamp=True)
    pv = pos

    cloud = N('ShaderNodeMapRange')                # slow tonal drift of the ground
    cloud.inputs[1].default_value, cloud.inputs[2].default_value = 0.3, 0.72
    cloud.inputs[3].default_value, cloud.inputs[4].default_value = 0.0, k_cloud
    L(noise(pv, 0.9 * scale, 5.0, 0.62).outputs[0], cloud.inputs[0])
    f0, a0, b0, ground = _mix(nt)
    L(cloud.outputs[0], f0)
    a0.default_value, b0.default_value = C.col(base), C.col(C.mix_hex(base, vein, 0.55))
    f1, a1, b1, out = _mix(nt)
    L(veins, f1)
    L(ground, a1)
    b1.default_value = C.col(vein)
    L(out, bsdf.inputs['Base Color'])
    return mat


def _gold(color, rough=0.17):
    return C.material('Gold', color, roughness=rough, metallic=1.0)


def _backdrop_material(albedo, radiance, sun_dir, ambient, ref_cos):
    """Matte sweep. The sun is set for the floor; where the sheet turns away from it (the wall) a
    little emission makes up the difference, so floor, bend and wall come out the same."""
    mat = C.material('Backdrop', tuple(albedo), roughness=0.95, specular=0.0)
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    dot = nt.nodes.new('ShaderNodeVectorMath')
    dot.operation = 'DOT_PRODUCT'
    dot.inputs[1].default_value = -Vector(sun_dir).normalized()
    nt.links.new(geo.outputs['Normal'], dot.inputs[0])
    cl = nt.nodes.new('ShaderNodeMath')
    cl.operation = 'MAXIMUM'
    cl.inputs[1].default_value = 0.0
    nt.links.new(dot.outputs['Value'], cl.inputs[0])
    k = nt.nodes.new('ShaderNodeMath')
    k.operation = 'MULTIPLY_ADD'
    k.inputs[1].default_value = (1.0 - ambient) / ref_cos
    k.inputs[2].default_value = ambient
    nt.links.new(cl.outputs[0], k.inputs[0])
    inv = nt.nodes.new('ShaderNodeMath')
    inv.operation = 'SUBTRACT'
    inv.use_clamp = True
    inv.inputs[0].default_value = 1.0
    nt.links.new(k.outputs[0], inv.inputs[1])
    scale = nt.nodes.new('ShaderNodeVectorMath')
    scale.operation = 'SCALE'
    scale.inputs[0].default_value = tuple(radiance)
    nt.links.new(inv.outputs[0], scale.inputs['Scale'])
    for name in ('Emission Color', 'Emission'):
        if bsdf.inputs.get(name) is not None:
            nt.links.new(scale.outputs['Vector'], bsdf.inputs[name])
            break
    C._set(bsdf, 'emission_strength', 1.0)
    return mat


# ----------------------------------------------------------------------------- what the polish mirrors
def _world(diffuse_strength, stops):
    """Diffuse rays see plain white (predictable exposure); glossy rays see a soft vertical
    gradient — the studio the polished stone and the gold mirror."""
    world = C.set_world('#ffffff', diffuse_strength)
    nt = world.node_tree
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_WORLD')
    plain = next(n for n in nt.nodes if n.type == 'BACKGROUND')
    peak = max(max(c) for _, c in stops)
    tc = nt.nodes.new('ShaderNodeTexCoord')
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
    nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    nt.links.new(sep.outputs[2], rng_.inputs[0])
    nt.links.new(rng_.outputs[0], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], sky.inputs['Color'])
    nt.links.new(path.outputs['Is Glossy Ray'], mix.inputs[0])
    nt.links.new(plain.outputs[0], mix.inputs[1])
    nt.links.new(sky.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs[0])


def _card(location, size, a, b, strength, feather=0.3, target=(0, 0, 0)):
    """Soft-edged light card that exists only in reflections (no camera ray, no diffuse light, no
    shadow): the window the polish picks up."""
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
    ramp.color_ramp.elements[0].color = C.col(a)
    ramp.color_ramp.elements[1].color = C.col(b)
    nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    nt.links.new(sep.outputs[1], ramp.inputs[0])
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


# ----------------------------------------------------------------------------- shapes
def _slab_arch(width, height, depth, mat, **kw):
    """A solid round-topped slab standing on z = 0."""
    w = width / 2
    top = height - w
    pts = [(-w, 0.0), (-w, top)] + [(w * math.cos(a), top + w * math.sin(a)) for a in [math.pi - math.pi * i / 48 for i in range(1, 48)]] + [(w, top), (w, 0.0)]
    return C.add_extrusion(pts, depth, 0.012, mat, name='Slab', **kw)


def _half_disc(radius, depth, mat, **kw):
    pts = [(radius * math.cos(a), radius * math.sin(a)) for a in [math.pi * i / 48 for i in range(49)]]
    return C.add_extrusion(pts, depth, 0.012, mat, name='HalfDisc', **kw)


def _points(objects, limit=1500):
    """World-space sample of the objects' vertices."""
    bpy.context.view_layer.update()
    out = []
    for ob in objects:
        vs = ob.data.vertices
        step = max(1, len(vs) // limit)
        mw = ob.matrix_world
        out += [mw @ vs[i].co for i in range(0, len(vs), step)]
    return out


def _fit(ctx, points, direction, fov, margin=1.06):
    """Centre the subject (as the camera sees it) on the origin by moving the whole set, then fit
    its on-screen width and height into the art rectangle."""
    d = Vector(direction).normalized()
    right = Vector((0, 0, 1)).cross(d).normalized()
    up = d.cross(right).normalized()
    xs = [p.dot(right) for p in points]
    ys = [p.dot(up) for p in points]
    off = right * ((min(xs) + max(xs)) / 2) + up * ((min(ys) + max(ys)) / 2)
    for ob in bpy.data.objects:
        if ob.parent is None and ob.type != 'CAMERA':
            ob.location = Vector(ob.location) - off
    ctx.frame(width=(max(xs) - min(xs)) * margin, height=(max(ys) - min(ys)) * margin, fov=fov, direction=tuple(d))


# ----------------------------------------------------------------------------- build
def build(ctx):
    rng, pal, p = ctx.rng, ctx.palette, ctx.params
    f = -1.0 if ctx.mirror else 1.0            # art on the right: key light from the left (the copy side)
    motif = str(p.get('motif', 'podium')).lower()
    veins = float(p.get('veins', 1.0))
    ctx.set_view('AgX', 'Medium High Contrast')

    # --- palette roles: the main stone, its veins, a second stone, the metal
    c_a, c_vein, c_b, c_gold = (ctx.color(i) for i in range(4))
    vein_b = C.mix_hex(c_b, '#ffffff', 0.78) if C.luminance(c_b) < 0.2 else C.mix_hex(c_b, c_vein if C.luminance(c_vein) < 0.3 else '#3c3a3a', 0.6)
    seed = rng.uniform(0, 40)
    stone_a = _marble('StoneA', c_a, c_vein, seed, amount=veins)
    stone_b = _marble('StoneB', c_b, vein_b, seed + 9.0, scale=0.9, amount=veins, turn=(0.9, 0.4, 1.2))
    gold = _gold(c_gold)

    # --- set and light: sun + plain ambient decide the exposure, solved so AgX shows the backdrop
    #     at exactly the palette background
    want = _radiance_for(ctx.scene, pal['bg'])
    level = max(1.0, float(want.max()) / 0.82)
    ambient = 0.4
    sun_dir = (0.5 * f, 0.42, -0.76)
    ref_cos = -Vector(sun_dir).normalized().z
    C.add_backdrop(_backdrop_material(want / level, want, sun_dir, ambient, ref_cos), floor_z=0.0, wall_y=3.2, radius=2.2)
    sun = C.add_sun(sun_dir, strength=(1.0 - ambient) * level * math.pi / ref_cos, angle=float(p.get('shadow', 15.0)), color='#fff6ea')
    try:
        sun.visible_glossy = False
    except Exception:
        pass
    lin = lambda h, s=1.0: tuple(v * s * level for v in C.col(h)[:3])
    tint = C.mix_hex(pal['bg'], '#ffffff', 0.5)
    _world(ambient * level, [(0.0, lin(pal['bg'], 0.12)), (0.45, lin(pal['bg'], 0.3)), (0.62, lin(tint, 0.75)), (1.0, lin('#ffffff', 1.5))])
    k = 1.0 if not ctx.dark else 1.35
    _card((-3.8 * f, -4.4, 4.4), (4.6, 4.6), '#fff4e4', '#ffffff', 9.0 * level * k, 0.35, target=(0, 0, 0.8))     # key window
    _card((4.8 * f, -0.6, 2.4), (0.8, 6.0), '#ffffff', '#ffffff', 7.0 * level * k, 0.2, target=(0, 0, 0.8))       # rim strip
    _card((0.0, 5.0, 5.2), (9.0, 3.0), tint, '#ffffff', 2.6 * level * k, 0.3, target=(0, 0, 0.5))                 # sheen on the flat tops

    parts = []
    add = parts.append
    B = 0.012                                                     # polished arris

    if motif == 'balance':
        add(C.add_box((0.92, 0.56, 0.22), B, stone_a, location=(0.0, 0.0, 0.11), rotation=(0, 0, math.radians(16 * f)), segments=3))
        r1 = 0.36
        add(C.add_sphere(r1, stone_b, location=(-0.05 * f, 0.0, 0.22 + r1)))
        tilt = math.radians(-5.0 * f)
        zc = 0.22 + 2 * r1 + 0.04
        cx = 0.12 * f
        add(C.add_box((1.6, 0.46, 0.075), B, stone_a, location=(cx, 0.0, zc + 0.012), rotation=(0, tilt, math.radians(-5 * f)), segments=3))
        top = lambda x: zc + 0.012 + 0.0375 / math.cos(tilt) - (x - cx) * math.tan(tilt)   # top face of the tilted slab
        xr, rr = cx + 0.5 * f, 0.23
        add(C.add_sphere(rr, stone_a, location=(xr, 0.0, top(xr) + rr)))
        xm = cx - 0.36 * f
        add(C.add_box((0.3, 0.3, 0.3), B, stone_b, location=(xm, 0.02, top(xm) + 0.15), rotation=(0, tilt, math.radians(24 * f)), segments=3))
        add(C.add_sphere(0.105, gold, segments=64, location=(xm, 0.02, top(xm) + 0.3 + 0.105)))
        add(C.add_cylinder(0.14, 0.012, 0.003, gold, location=(xr, 0.0, top(xr) + 2 * rr + 0.006)))            # a coin on the crown
        add(C.add_sphere(0.12, stone_b, segments=64, location=(-0.66 * f, -0.3, 0.12)))
        add(C.add_torus(0.21, 0.011, gold, location=(0.6 * f, -0.36, 0.011), rotation=(0, 0, 0), minor_segments=16))
        view, fov = (0.1 * f, -1.0, 0.2), 20

    elif motif == 'arch':
        steps = ((2.2, 1.5, 0.0), (1.96, 1.26, 0.085), (1.72, 1.02, 0.17))
        for w, d, z in steps:
            add(C.add_box((w, d, 0.085), B, stone_b, location=(0.0, 0.12, z + 0.0425), segments=3))
        z0 = 0.255
        add(C.add_arch(1.46, 1.9, 0.25, 0.34, stone_a, location=(0.0, -0.1, z0)))
        add(C.add_arch(0.96, 1.65, 0.17, 0.26, stone_b, location=(0.0, 0.22, z0)))
        add(C.add_arch(0.62, 1.48, 0.022, 0.05, gold, location=(0.0, 0.5, z0)))
        add(C.add_sphere(0.15, gold, segments=64, location=(0.0, 0.5, z0 + 0.15)))
        add(C.add_sphere(0.2, stone_a, location=(-0.9 * f, -0.52, 0.2)))
        add(C.add_sphere(0.085, stone_b, segments=64, location=(-0.56 * f, -0.74, 0.085)))
        add(C.add_cylinder(0.12, 0.62, B, stone_a, location=(0.98 * f, -0.42, 0.31)))
        add(C.add_sphere(0.06, gold, segments=48, location=(0.98 * f, -0.42, 0.62 + 0.06)))
        view, fov = (0.26 * f, -1.0, 0.2), 20

    else:  # podium
        add(C.add_cylinder(1.04, 0.1, B, stone_b, location=(0.0, 0.0, 0.05)))
        add(C.add_cylinder(0.78, 0.1, B, stone_a, location=(0.07 * f, 0.03, 0.15)))
        add(C.add_cylinder(0.5, 0.36, B, stone_a, location=(0.12 * f, 0.05, 0.38)))
        ztop = 0.56
        add(C.add_cylinder(0.505, 0.022, 0.004, gold, location=(0.12 * f, 0.05, 0.29)))                 # inlaid band
        add(_slab_arch(0.9, 1.62, 0.11, stone_b, location=(-0.34 * f, 0.66, 0.1), rotation=(0, 0, math.radians(7 * f))))
        add(C.add_arch(0.936, 1.638, 0.018, 0.135, gold, location=(-0.34 * f, 0.66, 0.1), rotation=(0, 0, math.radians(7 * f))))      # gilt rim
        add(C.add_cylinder(0.13, 1.12, B, stone_a, location=(0.74 * f, 0.44, 0.1 + 0.56)))
        add(C.add_sphere(0.085, gold, segments=64, location=(0.74 * f, 0.44, 1.22 + 0.085)))
        rs = 0.25
        add(C.add_sphere(rs, stone_b, location=(0.02 * f, 0.02, ztop + rs)))
        add(C.add_torus(0.33, 0.0105, gold, location=(0.2 * f, 0.1, ztop + 0.33), rotation=(math.radians(90), 0, math.radians(-38 * f)), minor_segments=16))
        add(C.add_sphere(0.1, stone_a, segments=64, location=(-0.62 * f, -0.5, 0.1 + 0.1)))
        add(C.add_sphere(0.05, gold, segments=48, location=(-0.4 * f, -0.66, 0.1 + 0.05)))
        view, fov = (0.08 * f, -1.0, 0.26), 20

    _fit(ctx, _points(parts), view, fov, margin=1.1)
