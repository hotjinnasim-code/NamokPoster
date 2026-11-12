"""Metal — machined and anodised metal: turned and brushed aluminium, anodised colour, knurling,
chamfers that catch the light, strip-light reflections.

motif: dial (a stack of precision rings and discs) | rods (turned tubes and rods on a plate) |
       blocks (a milled block landscape)
"""
import math
import os
import tempfile

import bmesh
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
def _metal(name, color, rough=0.3, aniso=0.8, finish='spin', grooves=1.0):
    """Machined metal. ``finish``: 'spin' = turned on a lathe (tool marks run around the local Z
    axis), 'line' = brushed along local X, 'blast' = bead-blasted satin (no direction)."""
    mat = C.material(name, color, roughness=rough, metallic=1.0)
    nt = mat.node_tree
    N, L = nt.nodes.new, nt.links.new
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    tc = N('ShaderNodeTexCoord')
    if finish == 'blast':
        n = N('ShaderNodeTexNoise')
        n.inputs['Scale'].default_value = 420.0
        n.inputs['Detail'].default_value = 1.0
        bump = N('ShaderNodeBump')
        bump.inputs['Strength'].default_value = 0.12
        bump.inputs['Distance'].default_value = 0.002
        L(tc.outputs['Object'], n.inputs['Vector'])
        L(n.outputs[0], bump.inputs['Height'])
        L(bump.outputs['Normal'], bsdf.inputs['Normal'])
        return mat
    C._set(bsdf, 'anisotropic', aniso)
    sep = N('ShaderNodeSeparateXYZ')
    L(tc.outputs['Object'], sep.inputs[0])
    comb = N('ShaderNodeCombineXYZ')
    if finish == 'spin':
        tan = N('ShaderNodeTangent')
        tan.direction_type = 'RADIAL'
        tan.axis = 'Z'
        L(tan.outputs[0], bsdf.inputs['Tangent'])
        C._set(bsdf, 'Anisotropic Rotation', 0.25)
        r = N('ShaderNodeVectorMath')                 # distance from the axis
        r.operation = 'LENGTH'
        flat = N('ShaderNodeCombineXYZ')
        L(sep.outputs[0], flat.inputs[0])
        L(sep.outputs[1], flat.inputs[1])
        L(flat.outputs[0], r.inputs[0])
        L(r.outputs['Value'], comb.inputs[0])
        L(sep.outputs[2], comb.inputs[1])
    else:
        vt = N('ShaderNodeVectorTransform')
        vt.vector_type = 'VECTOR'
        vt.convert_from, vt.convert_to = 'OBJECT', 'WORLD'
        vt.inputs[0].default_value = (1.0, 0.0, 0.0)
        L(vt.outputs[0], bsdf.inputs['Tangent'])
        C._set(bsdf, 'Anisotropic Rotation', 0.25)
        slow = N('ShaderNodeMath')                    # a little variation along the stroke
        slow.operation = 'MULTIPLY'
        slow.inputs[1].default_value = 0.012
        L(sep.outputs[0], slow.inputs[0])
        L(sep.outputs[1], comb.inputs[0])
        L(sep.outputs[2], comb.inputs[1])
        L(slow.outputs[0], comb.inputs[2])
    if grooves > 0:
        n = N('ShaderNodeTexNoise')                   # the tool marks: noise that only varies across them
        n.inputs['Scale'].default_value = 110.0
        n.inputs['Detail'].default_value = 2.0
        n.inputs['Roughness'].default_value = 0.6
        bump = N('ShaderNodeBump')
        bump.inputs['Strength'].default_value = min(1.0, 0.045 * grooves)
        bump.inputs['Distance'].default_value = 0.002
        L(comb.outputs[0], n.inputs['Vector'])
        L(n.outputs[0], bump.inputs['Height'])
        L(bump.outputs['Normal'], bsdf.inputs['Normal'])
        vary = N('ShaderNodeMapRange')                # and a slight gloss variation from pass to pass
        vary.inputs[1].default_value, vary.inputs[2].default_value = 0.3, 0.7
        vary.inputs[3].default_value, vary.inputs[4].default_value = rough * 0.86, rough * 1.16
        n2 = N('ShaderNodeTexNoise')
        n2.inputs['Scale'].default_value = 38.0
        n2.inputs['Detail'].default_value = 2.0
        L(comb.outputs[0], n2.inputs['Vector'])
        L(n2.outputs[0], vary.inputs[0])
        L(vary.outputs[0], bsdf.inputs['Roughness'])
    return mat


def _backdrop_material(albedo, radiance, sun_dir, ambient, ref_cos):
    """Matte sheet. The sun is set for the surface that faces it best (``ref_cos``); where the
    sheet turns away a little emission makes up the difference, so it comes out even."""
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


# ----------------------------------------------------------------------------- what the metal mirrors
def _world(diffuse_strength, stops):
    """Diffuse rays see plain white (predictable exposure of the backdrop); glossy rays see a
    vertical gradient — the dark studio with a bright ceiling that the metal mirrors."""
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


def _card(location, size, a, b, strength, feather=0.2, target=(0, 0, 0)):
    """Soft-edged strip light that exists only in reflections (no camera ray, no diffuse light,
    no shadow)."""
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


# ----------------------------------------------------------------------------- machined parts
def _obj(name, bm, mat, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    if smooth:
        me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
        if hasattr(me, 'use_auto_smooth'):          # Blender < 4.1: sharp edges need auto smooth
            me.use_auto_smooth = True
            me.auto_smooth_angle = math.radians(180)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    me.materials.append(mat)
    return ob


def _turn(profile, mat, segments=160, closed=False, name='Turned'):
    """A lathe-turned part: revolve ``profile`` [(radius, z), ...] around Z. Corners of the
    profile stay crisp (sharp edges), which is what makes a chamfer flash. ``closed`` joins the
    last point to the first (a ring); otherwise ends on the axis are capped with a point."""
    bm = bmesh.new()
    n = len(profile)
    rings = []
    for r, z in profile:
        if r <= 1e-6:
            rings.append([bm.verts.new((0.0, 0.0, z))])
        else:
            rings.append([bm.verts.new((r * math.cos(math.tau * i / segments), r * math.sin(math.tau * i / segments), z)) for i in range(segments)])
    pairs = list(zip(range(n - 1), range(1, n))) + ([(n - 1, 0)] if closed else [])
    for ia, ib in pairs:
        a, b = rings[ia], rings[ib]
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
    for j in range(n):                                 # sharp where the profile turns a corner
        if not closed and j in (0, n - 1):
            continue
        p0, p1, p2 = Vector(profile[j - 1]), Vector(profile[j]), Vector(profile[(j + 1) % n])
        d0, d1 = (p1 - p0), (p2 - p1)
        if d0.length < 1e-9 or d1.length < 1e-9 or d0.angle(d1) > math.radians(18):
            ring = rings[j]
            if len(ring) > 1:
                for i in range(segments):
                    e = bm.edges.get((ring[i], ring[(i + 1) % segments]))
                    if e is not None:
                        e.smooth = False
    return _obj(name, bm, mat)


def _chamfered(points, c):
    """Cut every corner of an open profile with a flat chamfer of size ``c``."""
    return C.fillet_profile(points, c, 1)


def _disc(radius, z0, z1, mat, c=0.012, **kw):
    """Solid disc / rod from z0 to z1 with chamfered rims."""
    ob = _turn(_chamfered([(0.0, z0), (radius, z0), (radius, z1), (0.0, z1)], c), mat, **kw)
    return ob


def _ring(r_in, r_out, z0, z1, mat, c=0.012, **kw):
    """Annular part (tube, bezel) with chamfered edges."""
    prof = [(r_in, z0), (r_out, z0), (r_out, z1), (r_in, z1)]
    out = []
    for i, p in enumerate(prof):                       # closed loop: chamfer all four corners
        a, b = Vector(prof[i - 1]), Vector(prof[(i + 1) % 4])
        v = Vector(p)
        cc = min(c, 0.45 * (a - v).length, 0.45 * (b - v).length)
        s, e = v + (a - v).normalized() * cc, v + (b - v).normalized() * cc
        out += [(s.x, s.y), (e.x, e.y)]
    return _turn(out, mat, closed=True, **kw)


def _knurl(radius, z0, z1, mat, around=96, depth=None, name='Knurl'):
    """Diamond knurling as real geometry: a band of little pyramids around Z. The band is closed
    by the parts above and below it."""
    around += around % 2
    pitch = math.tau * radius / around
    rows = max(2, round((z1 - z0) / pitch))
    depth = depth or pitch * 0.5
    bm = bmesh.new()
    grid = []
    for j in range(rows + 1):
        z = z0 + (z1 - z0) * j / rows
        ring = []
        for i in range(around):
            r = radius + (depth if (i + j) % 2 == 0 and 0 < j < rows else 0.0)
            a = math.tau * i / around
            ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), z)))
        grid.append(ring)
    for j in range(rows):
        for i in range(around):
            k = (i + 1) % around
            a, b, c_, d = grid[j][i], grid[j][k], grid[j + 1][k], grid[j + 1][i]
            if (i + j) % 2 == 0:                       # a and c_ are the raised ones: split along b–d
                bm.faces.new((a, b, d))
                bm.faces.new((b, c_, d))
            else:
                bm.faces.new((a, b, c_))
                bm.faces.new((a, c_, d))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj(name, bm, mat, smooth=False)


def _screw(mat, dark, radius=0.04, height=0.03, location=(0, 0, 0)):
    """Socket-head cap screw, head up along +Z from ``location``."""
    x, y, z = location
    head = _turn(_chamfered([(0.0, 0.0), (radius, 0.0), (radius, height), (0.0, height)], radius * 0.18), mat, segments=48, name='Screw')
    sock = _turn([(0.0, height * 0.35), (radius * 0.56, height * 0.35), (radius * 0.56, height + 0.0006), (0.0, height + 0.0006)], dark, segments=6, name='Socket')
    for ob in (head, sock):
        ob.location = (x, y, z)
    return [head, sock]


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


def _fit(ctx, points, direction, fov, margin=1.1):
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


def _mirror(normal, view):
    """Direction a light has to come from to be mirrored by a face (``normal``) into the camera
    (``view`` points from the subject to the camera)."""
    n, v = Vector(normal).normalized(), Vector(view).normalized()
    return (2.0 * n.dot(v) * n - v).normalized()


# ----------------------------------------------------------------------------- build
def build(ctx):
    rng, pal, p = ctx.rng, ctx.palette, ctx.params
    f = -1.0 if ctx.mirror else 1.0
    motif = str(p.get('motif', 'dial')).lower()
    ctx.set_view('AgX', 'Medium High Contrast')

    # --- palette roles: three anodised colours and the bare metal
    c0, c1, c2, c_bare = (ctx.color(i) for i in range(4))
    bare = _metal('Bare', c_bare, 0.26, 0.85, 'spin')
    bare_line = _metal('BareLine', c_bare, 0.28, 0.8, 'line')
    satin = _metal('Satin', c_bare, 0.42, 0.0, 'blast')
    an0 = _metal('Anodised0', c0, 0.34, 0.6, 'spin', grooves=0.6)
    an1 = _metal('Anodised1', c1, 0.36, 0.6, 'spin', grooves=0.6)
    an2 = _metal('Anodised2', c2, 0.36, 0.6, 'spin', grooves=0.6)
    an0_line = _metal('Anodised0Line', c0, 0.34, 0.6, 'line', grooves=0.6)
    an1_line = _metal('Anodised1Line', c1, 0.36, 0.6, 'line', grooves=0.6)
    dark = C.material('Recess', '#0a0a0c', roughness=0.6, metallic=0.6)
    mark = C.material('Mark', pal['accent'], roughness=0.5, emission=pal['accent'], emission_strength=0.6)

    # --- exposure: sun + plain ambient light the backdrop, solved so AgX shows the palette bg
    want = _radiance_for(ctx.scene, pal['bg'])
    level = max(1.0, float(want.max()) / 0.82)
    lin = lambda h, s=1.0: tuple(v * s * level for v in C.col(h)[:3])
    parts = []
    add = parts.append

    if motif == 'dial':
        # ---- floating in front of a wall, turned towards the camera
        ambient = 0.5
        sun_dir = (0.42 * f, 0.76, -0.5)
        ref_cos = Vector(sun_dir).normalized().y
        wall = C.add_plane(240, _backdrop_material(want / level, want, sun_dir, ambient, ref_cos))
        wall.rotation_euler = (math.radians(90), 0, 0)
        wall.location = (0, 0.75, 0)
        try:
            wall.visible_glossy = False
        except Exception:
            pass
        sun = C.add_sun(sun_dir, strength=(1.0 - ambient) * level * math.pi / ref_cos, angle=float(p.get('shadow', 12.0)))

        add(_disc(1.0, -0.12, 0.0, an1, 0.02, name='Body'))                                     # body
        add(_ring(0.8, 0.985, 0.0, 0.03, bare, 0.006, name='BezelFoot'))
        add(_knurl(0.985, 0.03, 0.2, bare, around=128))                                          # knurled bezel
        add(_ring(0.8, 0.985, 0.03, 0.225, bare, 0.014, name='Bezel'))
        add(_ring(0.5, 0.79, 0.0, 0.1, an0, 0.012, name='ColourRing'))                           # anodised ring
        add(_ring(0.3, 0.49, 0.0, 0.16, an1, 0.014, name='Shoulder'))
        add(_knurl(0.288, 0.2, 0.39, bare, around=64))                                           # knob
        add(_disc(0.288, 0.0, 0.4, bare, 0.006, name='KnobCore'))
        add(_ring(0.17, 0.275, 0.4, 0.418, an0, 0.006, name='KnobRing'))
        add(_disc(0.16, 0.36, 0.41, satin, 0.006, name='Cap'))
        for k in range(6):
            a = math.tau * (k + 0.5) / 6
            parts.extend(_screw(satin, dark, 0.036, 0.022, (0.645 * math.cos(a), 0.645 * math.sin(a), 0.1)))
        for k in range(24):                                                                      # index holes on the shoulder
            a = math.tau * k / 24
            add(_turn([(0.0, 0.1603), (0.009 if k % 6 else 0.017, 0.1603)], mark if k == 6 else dark, segments=20, name='Hole'))
            parts[-1].location = (0.395 * math.cos(a), 0.395 * math.sin(a), 0.0)
        add(_turn([(0.0, 0.0), (0.028, 0.0), (0.028, 0.006), (0.0, 0.006)], mark, segments=24, name='Index'))
        parts[-1].location = (0.0, 0.893, 0.225)
        tilt, yaw = math.radians(70), math.radians(-24 * f)
        C.group(parts, 'Dial', rotation=(tilt, 0.0, yaw))
        try:
            sun.visible_glossy = False
        except Exception:
            pass
        view = (0.0, -1.0, 0.03)
        face = (math.sin(tilt) * math.sin(yaw), -math.sin(tilt) * math.cos(yaw), math.cos(tilt))    # where the dial looks
        m = _mirror(face, view)
        side = Vector((0, 0, 1)).cross(m).normalized()
        _world(ambient * level, [(0.0, lin('#000000', 0.0)), (0.3, lin(pal['bg'], 0.2)), (0.55, lin(C.mix_hex(pal['bg'], '#8a8f98', 0.5), 0.3)), (1.0, lin('#ffffff', 0.9))])
        _card(tuple(m * 6.0 + side * 0.9), (0.9, 7.0), '#ffffff', '#ffffff', 15.0 * level, 0.25)                       # key strip, seen in the faces
        _card(tuple(m * 6.0 - side * 3.4 + Vector((0, 0, 0.6))), (0.45, 6.0), c0, '#ffffff', 9.0 * level, 0.25)         # second, tinted strip
        _card(tuple(m * 5.0 + Vector((0, 0, 4.2))), (8.0, 2.2), '#dfe6f0', '#ffffff', 4.0 * level, 0.3)                 # ceiling
        _card((4.6 * f, -1.5, 0.4), (0.5, 6.0), '#ffffff', '#ffffff', 9.0 * level, 0.25)                                # rim strip for the knurling
        ctx.frame(radius=1.14, fov=20, direction=view)
        return

    # ---- standing on a seamless sweep
    ambient = 0.42
    sun_dir = (0.48 * f, 0.4, -0.78)
    ref_cos = -Vector(sun_dir).normalized().z
    C.add_backdrop(_backdrop_material(want / level, want, sun_dir, ambient, ref_cos), floor_z=0.0, wall_y=3.4, radius=2.4)
    sun = C.add_sun(sun_dir, strength=(1.0 - ambient) * level * math.pi / ref_cos, angle=float(p.get('shadow', 12.0)))
    try:
        sun.visible_glossy = False
    except Exception:
        pass
    if motif == 'blocks':
        # a billet milled into a field of bosses: recursive cuts, three sizes, a few tall ones
        W, D, base = 2.1, 1.5, 0.1
        add(C.add_box((W, D, base), 0.012, bare_line, location=(0, 0, base / 2), segments=1))
        cells = []

        def cut(x0, y0, x1, y1, depth):
            w, d = x1 - x0, y1 - y0
            if depth >= 5 or max(w, d) < 0.42 or (depth >= 3 and rng.random() < 0.22):
                cells.append((x0, y0, x1, y1))
                return
            if w * rng.uniform(0.8, 1.25) > d:
                m = x0 + w * rng.choice((0.36, 0.5, 0.64))
                cut(x0, y0, m, y1, depth + 1)
                cut(m, y0, x1, y1, depth + 1)
            else:
                m = y0 + d * rng.choice((0.38, 0.5, 0.62))
                cut(x0, y0, x1, m, depth + 1)
                cut(x0, m, x1, y1, depth + 1)

        cut(-W / 2 + 0.05, -D / 2 + 0.05, W / 2 - 0.05, D / 2 - 0.05, 0)
        gap = 0.028
        order = sorted(range(len(cells)), key=lambda i: -((cells[i][2] - cells[i][0]) * (cells[i][3] - cells[i][1])))
        tall = set(rng.sample(order[len(order) // 3:], max(2, len(cells) // 6)))
        tints = {}
        pool = [i for i in range(len(cells)) if i not in tall]
        rng.shuffle(pool)
        for i, m in zip(pool, [an0_line, an1_line, an0_line, an1_line, an0_line]):
            tints[i] = m
        hero = rng.choice(sorted(tall))
        tints[hero] = an0_line
        for i, (x0, y0, x1, y1) in enumerate(cells):
            back = (y0 + y1) / 2 / D + 0.5                       # taller towards the back
            h = rng.uniform(0.08, 0.26) * (0.7 + 0.7 * back)
            if i in tall:
                h = rng.uniform(0.62, 1.0) * (0.75 + 0.4 * back)
            mat = tints.get(i, bare_line)
            sx, sy = x1 - x0 - gap, y1 - y0 - gap
            add(C.add_box((sx, sy, h), 0.012, mat, location=((x0 + x1) / 2 * f, (y0 + y1) / 2, base + h / 2), segments=1))
            top = base + h
            small = min(sx, sy)
            if i not in tall and small > 0.3 and rng.random() < 0.4:      # a bore, or a turned boss
                cx, cy = (x0 + x1) / 2 * f, (y0 + y1) / 2
                if rng.random() < 0.5:
                    add(_turn([(0.0, 0.0006), (small * 0.26, 0.0006)], dark, segments=48, name='Bore'))
                    parts[-1].location = (cx, cy, top)
                    add(_ring(small * 0.26, small * 0.3, -0.004, 0.004, bare, 0.003, segments=64, name='Lip'))
                    parts[-1].location = (cx, cy, top)
                else:
                    add(_disc(small * 0.3, 0.0, 0.07, bare if mat is not bare_line else an1, 0.01, segments=64, name='Boss'))
                    parts[-1].location = (cx, cy, top)
        view, fov = (0.62 * f, -1.0, 0.62), 16

    else:  # rods
        add(_disc(1.02, 0.0, 0.06, bare, 0.012, name='Plate'))
        add(_ring(0.9, 0.93, 0.055, 0.0612, dark, 0.001, name='Groove'))
        spots, tries = [], 0
        kinds = ['hero', 'tube', 'tube', 'rod', 'rod', 'tube', 'pin', 'pin', 'rod', 'pin', 'tube']
        radii = {'hero': 0.2, 'tube': 0.15, 'rod': 0.1, 'pin': 0.055}
        for kind in kinds:
            r = radii[kind] * rng.uniform(0.88, 1.12)
            for _ in range(400):
                a, d = rng.uniform(0, math.tau), 0.78 * math.sqrt(rng.random())
                x, y = d * math.cos(a), d * math.sin(a)
                if kind == 'hero':
                    x, y = rng.uniform(-0.12, 0.12), rng.uniform(0.1, 0.3)
                if all(math.hypot(x - q[0], y - q[1]) > r + q[2] + 0.05 for q in spots):
                    spots.append((x, y, r, kind))
                    break
        z0 = 0.06
        colours = [an0, an1, an2, an0, bare, an1]
        ci = 0
        for x, y, r, kind in spots:
            back = (y + 0.8) / 1.6
            if kind == 'hero':
                h = 1.75
                add(_disc(r, z0, z0 + h, bare, 0.016, name='Hero'))
                parts[-1].location = (x * f, y, 0)
                add(_knurl(r + 0.001, z0 + h * 0.52, z0 + h * 0.78, bare, around=64))
                parts[-1].location = (x * f, y, 0)
                add(_ring(r - 0.002, r + 0.012, z0 + h * 0.44, z0 + h * 0.5, an0, 0.006, name='Band'))
                parts[-1].location = (x * f, y, 0)
                add(_ring(r - 0.002, r + 0.012, z0 + h * 0.8, z0 + h * 0.83, an0, 0.004, name='Band'))
                parts[-1].location = (x * f, y, 0)
            elif kind == 'tube':
                h = rng.uniform(0.5, 1.15) * (0.7 + 0.5 * back)
                mat = colours[ci % len(colours)]
                ci += 1
                add(_ring(r * 0.72, r, z0, z0 + h, mat, 0.012, name='Tube'))
                parts[-1].location = (x * f, y, 0)
                add(_turn([(0.0, z0 + h * 0.5), (r * 0.72, z0 + h * 0.5)], dark, segments=48, name='BoreFloor'))
                parts[-1].location = (x * f, y, 0)
            elif kind == 'rod':
                h = rng.uniform(0.35, 0.95) * (0.7 + 0.5 * back)
                mat = bare if rng.random() < 0.6 else colours[ci % len(colours)]
                add(_disc(r, z0, z0 + h, mat, 0.012, name='Rod'))
                parts[-1].location = (x * f, y, 0)
                if h > 0.5:
                    add(_ring(r - 0.004, r + 0.0005, z0 + h - 0.12, z0 + h - 0.1, dark, 0.001, name='Cut'))
                    parts[-1].location = (x * f, y, 0)
            else:
                h = rng.uniform(0.18, 0.5)
                add(_disc(r, z0, z0 + h, an0 if ci % 2 else bare, 0.008, segments=64, name='Pin'))
                ci += 1
                parts[-1].location = (x * f, y, 0)
        view, fov = (0.14 * f, -1.0, 0.42), 18

    m = _mirror((0, 0, 1), view)                       # what the flat tops mirror: a ceiling card, in front of the sweep
    _world(ambient * level, [(0.0, lin('#000000', 0.0)), (0.4, lin(pal['bg'], 0.3)), (0.58, lin(C.mix_hex(pal['bg'], '#8a8f98', 0.5), 0.4)), (1.0, lin('#ffffff', 1.2))])
    _card(tuple(m * 3.0 + Vector((0, 0, 0.5))), (8.0, 2.6), '#aab4c4', '#ffffff', 5.0 * level, 0.3, target=(0, 0, 0.4))
    _card((-3.6 * f, -4.6, 3.4), (0.7, 7.0), '#ffffff', '#ffffff', 16.0 * level, 0.25, target=(0, 0, 0.6))    # key strip
    _card((4.4 * f, -1.2, 2.2), (0.5, 6.0), '#ffffff', c0, 8.0 * level, 0.25, target=(0, 0, 0.6))             # rim strip
    _fit(ctx, _points(parts), view, fov, margin=1.12)
