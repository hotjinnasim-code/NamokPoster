"""Draped Fabric — silk satin or velvet falling in large folds: a fold hierarchy of big swags,
medium folds and small wrinkles, hemmed edges, soft gradient light that runs along the folds as
sheen. The drape and the hanging sheet are real cloth simulations (Blender cloth, ~20–40 s on a CPU);
the curtain starts from a procedural pleated, tied-back shape and is then settled by the simulation.

The technique is the cloth; ``motif`` chooses how it hangs:
  drape   — a cloth thrown over a hidden form on a plinth, pooling on the floor (an unveiling)
  curtain — a stage curtain on a rod, pleated at the top, tied back, pooling on the floor
  flow    — a wide silk sheet hung by two corners, falling into swags, stirred by the wind
``cloth``: satin (silk satin with anisotropic sheen) or velvet (deep pile, bright rims).
"""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector, noise

import common as C


# ----------------------------------------------------------------------------- cloth materials
def _tangent(nt, bsdf):
    try:
        tg = nt.nodes.new('ShaderNodeTangent')
        tg.direction_type = 'UV_MAP'
        tg.uv_map = 'UVMap'
        nt.links.new(tg.outputs[0], bsdf.inputs['Tangent'])
    except Exception:
        pass


def _satin(name, color, dark=False):
    """Silk satin: long anisotropic highlights running across the folds, a little sheen."""
    mat = C.material(name, color, roughness=0.32, specular=0.55, anisotropic=0.55, sheen=0.25)
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    _tangent(nt, bsdf)
    for key, val in (('Sheen Tint', C.col(C.mix_hex(color, '#ffffff', 0.5))), ('Sheen Roughness', 0.3)):
        if bsdf.inputs.get(key) is not None:
            try:
                bsdf.inputs[key].default_value = val
            except Exception:
                pass
    # the weave: a whisper of fine bump, and a very slow change in dye depth
    try:
        tc = nt.nodes.new('ShaderNodeTexCoord')
        n = nt.nodes.new('ShaderNodeTexNoise')
        n.inputs['Scale'].default_value = 1.4
        mix = nt.nodes.new('ShaderNodeMixRGB')
        mix.inputs[1].default_value = C.col(C.mix_hex(color, '#000000', 0.08))
        mix.inputs[2].default_value = C.col(C.mix_hex(color, '#ffffff', 0.04))
        nt.links.new(tc.outputs['Object'], n.inputs['Vector'])
        nt.links.new(n.outputs[0], mix.inputs[0])
        nt.links.new(mix.outputs[0], bsdf.inputs['Base Color'])
    except Exception:
        pass
    return mat


def _velvet(name, color, dark=False):
    """Velvet: a deep, slightly darker body and a strong pale sheen at grazing angles, so every
    fold gets a bright rim and a dark core."""
    body = C.mix_hex(color, '#000000', 0.42)
    mat = C.material(name, body, roughness=0.85, specular=0.15, sheen=1.0)
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    for key, val in (('Sheen Tint', C.col(C.mix_hex(color, '#ffffff', 0.45))), ('Sheen Roughness', 0.45)):
        if bsdf.inputs.get(key) is not None:
            try:
                bsdf.inputs[key].default_value = val
            except Exception:
                pass
    try:   # crushed pile: patches a little lighter or darker
        tc = nt.nodes.new('ShaderNodeTexCoord')
        n = nt.nodes.new('ShaderNodeTexNoise')
        n.inputs['Scale'].default_value = 6.0
        n.inputs['Detail'].default_value = 3.0
        mix = nt.nodes.new('ShaderNodeMixRGB')
        mix.inputs[1].default_value = C.col(C.mix_hex(body, '#000000', 0.12))
        mix.inputs[2].default_value = C.col(C.mix_hex(body, '#ffffff', 0.06))
        nt.links.new(tc.outputs['Object'], n.inputs['Vector'])
        nt.links.new(n.outputs[0], mix.inputs[0])
        nt.links.new(mix.outputs[0], bsdf.inputs['Base Color'])
    except Exception:
        pass
    return mat


# ----------------------------------------------------------------------------- sheet builder
def _grid(fn, nu, nv, mat, name='Cloth', thickness=0.006, levels=1, wrap_u=False):
    """A cloth sheet from fn(u, v) -> (x, y, z), u, v in [0, 1], with UVs (u across the weave)."""
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    us = np.linspace(0, 1, nu, endpoint=not wrap_u)
    vs = np.linspace(0, 1, nv)
    rows = [[bm.verts.new(fn(u, v)) for u in us] for v in vs]
    cols = nu if wrap_u else nu - 1
    for j in range(nv - 1):
        for i in range(cols):
            k = (i + 1) % nu
            f = bm.faces.new((rows[j][i], rows[j][k], rows[j + 1][k], rows[j + 1][i]))
            u0, u1 = us[i], (us[k] if k else 1.0)
            for loop, (a, b) in zip(f.loops, ((u0, vs[j]), (u1, vs[j]), (u1, vs[j + 1]), (u0, vs[j + 1]))):
                loop[uvl].uv = (a * 4.0, b * 4.0)
    ob = C.finish_mesh(name, bm, True, mat)
    if thickness > 0:
        so = ob.modifiers.new('Hem', 'SOLIDIFY')
        so.thickness = thickness
        so.offset = 0.0
        so.use_even_offset = False
    if levels:
        C.subsurf(ob, levels)
    return ob


def _sstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def _n1(x, seed):
    return noise.noise(Vector((x, seed * 1.37, seed * 0.71)))


def _simulate(ctx, ob, pins, colliders, frames, mass=0.3, bending=0.6, self_collide=True, quality=6):
    """Run a cloth simulation on ``ob`` (vertices in ``pins`` held in place) and return a new,
    plain mesh object with the result in world space."""
    sc = ctx.scene
    if pins:
        vg = ob.vertex_groups.new(name='Pin')
        vg.add(list(pins), 1.0, 'REPLACE')
    for o in colliders:
        o.modifiers.new('Collision', 'COLLISION')
        o.collision.thickness_outer = 0.01
        o.collision.cloth_friction = 8.0
    mod = ob.modifiers.new('Cloth', 'CLOTH')
    st = mod.settings
    st.quality = quality
    st.mass = mass
    st.tension_stiffness = st.compression_stiffness = 15
    st.shear_stiffness = 5
    st.bending_stiffness = bending
    st.air_damping = 1.0
    if pins:
        st.vertex_group_mass = 'Pin'
        st.pin_stiffness = 1.0
    cs = mod.collision_settings
    cs.use_collision = bool(colliders)
    cs.distance_min = 0.008
    cs.use_self_collision = self_collide
    cs.self_distance_min = 0.006
    cs.collision_quality = 3
    sc.frame_start, sc.frame_end = 1, frames
    mod.point_cache.frame_end = frames
    for fr in range(1, frames + 1):
        sc.frame_set(fr)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    me.transform(ob.matrix_world.copy())
    mats = list(ob.data.materials)
    name = ob.name
    bpy.data.objects.remove(ob)
    for o in colliders:
        for m in [m for m in o.modifiers if m.type == 'COLLISION']:
            o.modifiers.remove(m)
    sc.frame_set(1)
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    if not me.materials and mats:
        me.materials.append(mats[0])
    out = bpy.data.objects.new(name + 'Sim', me)
    sc.collection.objects.link(out)
    return out


def _finish_cloth(ob, thickness=0.008, levels=1):
    so = ob.modifiers.new('Hem', 'SOLIDIFY')
    so.thickness = thickness
    so.offset = 0.0
    if levels:
        C.subsurf(ob, levels)
    return ob


# ----------------------------------------------------------------------------- motifs
def _curtain(ctx, mat, flip, rng, accent_mat, rod_mat):
    """One panel on a rod: pinch pleats at the top, tied back to one side, pooling on the floor."""
    W, Ht, L = 1.7, 2.75, 3.25         # panel width, rod height, cloth length
    s_t = 1.45                         # where (along the cloth) the tie-back holds it
    x_t = 0.42 * flip                  # the tie is on the side away from the copy
    w_t = 0.2
    nF = 8.5                           # big folds across the panel
    ph = [rng.uniform(0, 6.28) for _ in range(6)]
    sd = rng.uniform(0, 50)

    u_out = 1.0 if flip > 0 else 0.0

    def fn(u, v):
        s = v * L
        p = _sstep(0.0, s_t, s) ** 1.1 if s < s_t else 1.0 - 0.55 * _sstep(s_t, L, s)
        xt = (u - 0.5) * W
        xb = flip * W / 2 + (u - u_out) * w_t          # gathered against the outer edge
        x = xt + (xb - xt) * p
        h = abs(x - xt)
        z = Ht - math.sqrt(max(s * s - h * h, (0.55 * s) ** 2))   # the inner edge sweeps across: it drops less
        q = u * nF + 0.45 * _n1(u * 2.6, sd) + 0.3 * _n1(s * 0.5, sd + 1)
        amp = 0.75 * (0.045 + 0.09 * p + 0.035 * _sstep(s_t, L, s)) * (0.7 + 0.8 * max(0.0, _n1(u * 3.3 + 2, sd + 5) + 0.45))
        y = amp * (math.sin(math.tau * q + ph[0]) + 0.4 * math.sin(math.tau * 2.3 * q + ph[1] + s * 0.8))
        y += 0.012 * _n1(u * 18 + s * 2.0, sd + 3)                            # small wrinkles
        pleat = 1.0 - _sstep(0.0, 0.3, s)                                      # pinch pleats at the top
        y += 0.03 * pleat * math.sin(math.tau * u * 22)
        x += 0.01 * pleat * math.cos(math.tau * u * 22)
        if z < 0.0:                                                            # pooling on the floor
            e = -z
            z = 0.006
            y = y * math.exp(-e * 5) - e * 0.95
            x += (u - 0.5) * e * 0.7
        return (x, y, z)

    nu, nv = 58, 96
    cloth = _grid(fn, nu, nv, mat, 'Curtain', thickness=0, levels=0)
    jt = round(s_t / L * (nv - 1))
    pins = list(range(nu)) + [j * nu + i for j in (jt - 1, jt, jt + 1) for i in range(nu)]
    floor_ = C.add_plane(12.0, None)
    cloth = _simulate(ctx, cloth, pins, [floor_], 45, mass=0.5, bending=2.5)
    bpy.data.objects.remove(floor_)
    _finish_cloth(cloth)
    parts = [cloth]
    # rod, finials, rings and the tie-back cord
    rod_len = W * 1.22
    parts.append(C.add_cylinder(0.022, rod_len, 0.006, rod_mat, location=(0, 0.0, Ht + 0.05), rotation=(0, math.radians(90), 0)))
    for sx in (-1, 1):
        parts.append(C.add_sphere(0.05, rod_mat, segments=32, location=(sx * rod_len / 2, 0.0, Ht + 0.05)))
    for i in range(9):
        u = (i + 0.5) / 9
        parts.append(C.add_torus(0.04, 0.007, rod_mat, major_segments=32, minor_segments=10,
                                 location=((u - 0.5) * W, 0.0, Ht + 0.05), rotation=(0, math.radians(90), 0)))
    tie = [fn(u, s_t / L) for u in np.linspace(0, 1, 9)]
    tx, tz = sum(t[0] for t in tie) / 9, sum(t[2] for t in tie) / 9
    parts.append(C.add_torus(w_t * 0.62, 0.022, accent_mat, location=(tx, 0.0, tz), rotation=(math.radians(8), 0, 0),
                             scale=(1.0, 0.75, 1.0)))
    return parts, dict(width=W * 1.35, height=Ht + 0.2, center_z=(Ht + 0.1) / 2)


def _drape(ctx, mat, flip, rng, plinth_mat):
    """A cloth thrown over a hidden form (a ball on a pillar): a real cloth simulation, so the big
    folds fall from the shoulders, the corners cascade and the hem pools on the floor."""
    sc = ctx.scene
    n, size = 82, 3.7
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    vs = [[bm.verts.new(((i / (n - 1) - 0.5) * size, (j / (n - 1) - 0.5) * size, 1.75)) for i in range(n)] for j in range(n)]
    for j in range(n - 1):
        for i in range(n - 1):
            f = bm.faces.new((vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]))
            for loop, (u, v) in zip(f.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))):
                loop[uvl].uv = (u / (n - 1) * 6, v / (n - 1) * 6)
    cloth = C.finish_mesh('Sheet', bm, False, None)
    cloth.rotation_euler = (math.radians(rng.uniform(-3, 3)), math.radians(rng.uniform(-3, 3)), math.radians(rng.uniform(22, 40)))
    cloth.location = (rng.uniform(-0.06, 0.06), rng.uniform(-0.06, 0.06), 0)
    form = [C.add_sphere(0.46, plinth_mat, segments=32, location=(0, 0, 1.12)),
            C.add_cylinder(0.36, 0.72, 0.02, plinth_mat, location=(0, 0, 0.36))]
    floor = C.add_plane(10.0, plinth_mat)
    for o in form + [floor]:
        o.modifiers.new('Collision', 'COLLISION')
        o.collision.thickness_outer = 0.01
        o.collision.cloth_friction = 8.0
    mod = cloth.modifiers.new('Cloth', 'CLOTH')
    st = mod.settings
    heavy = str(ctx.params.get('cloth', 'satin')).lower() == 'velvet'
    st.quality = 6
    st.mass = 0.45 if heavy else 0.3
    st.tension_stiffness = st.compression_stiffness = 15
    st.shear_stiffness = 5
    st.bending_stiffness = 2.0 if heavy else 0.6
    st.air_damping = 1.0
    cs = mod.collision_settings
    cs.distance_min = 0.008
    cs.use_self_collision = True
    cs.self_distance_min = 0.006
    cs.collision_quality = 3
    frames = 90
    sc.frame_start, sc.frame_end = 1, frames
    mod.point_cache.frame_end = frames
    for fr in range(1, frames + 1):
        sc.frame_set(fr)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(cloth.evaluated_get(dg))
    mw = cloth.matrix_world.copy()
    bpy.data.objects.remove(cloth)
    bpy.data.objects.remove(floor)
    for o in form:
        o.modifiers.clear()
    me.transform(mw)
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    me.materials.append(mat)
    ob = bpy.data.objects.new('Drape', me)
    sc.collection.objects.link(ob)
    so = ob.modifiers.new('Hem', 'SOLIDIFY')
    so.thickness = 0.008
    so.offset = 0.0
    C.subsurf(ob, 1)
    sc.frame_set(1)
    co = np.array([v.co[:] for v in me.vertices])
    W = (co[:, 0].max() - co[:, 0].min())
    Hh = co[:, 2].max()
    return [ob] + form, dict(width=W * 1.05, height=Hh * 1.18 + 0.4, center_z=Hh * 0.46)


def _flow(ctx, mat, flip, rng, back_mat):
    """A broad silk sheet hung by its two top corners and caught by the wind: a sagging top edge,
    one big billow, folds running from the corners and a fluttering hem (cloth simulation)."""
    Wd, D = 3.0, 1.9
    nu, nv = 90, 58

    def fn(u, v):
        # the corners are hung closer together than the cloth is wide: the slack falls into swags
        return ((u - 0.5) * Wd * 0.72, 0.12 * math.sin(math.tau * 3 * u) * (1.0 - 0.5 * v) + 0.02 * math.sin(v * 5.0), D * (1.0 - v))

    sheet = _grid(fn, nu, nv, mat, 'Silk', thickness=0, levels=0)
    pins = [0, 1, nu - 2, nu - 1]
    def effector(kind, loc, rot):
        bpy.ops.object.effector_add(type=kind, location=loc, rotation=rot)
        return bpy.context.active_object

    d = Vector((0.55 * flip, -1.0, 0.35)).normalized()
    wind = effector('WIND', (-1.5 * flip, 2.0, 0.6), d.to_track_quat('Z', 'Y').to_euler())
    wind.field.strength = float(ctx.params.get('wind', 1.0)) * 40.0
    wind.field.noise = 1.2
    wind.field.seed = rng.randint(1, 90)
    turb = effector('TURBULENCE', (0, 0, 1.0), (0, 0, 0))
    turb.field.strength = 18.0
    turb.field.size = 0.9
    turb.field.seed = rng.randint(1, 90)
    sheet = _simulate(ctx, sheet, pins, [], 60, mass=0.15, bending=0.15, self_collide=False, quality=5)
    bpy.data.objects.remove(wind)
    bpy.data.objects.remove(turb)
    _finish_cloth(sheet, 0.005)
    co = np.array([v.co[:] for v in sheet.data.vertices])
    cx, cz = (co[:, 0].max() + co[:, 0].min()) / 2, (co[:, 2].max() + co[:, 2].min()) / 2
    sheet.location = (-cx, 0, 0)
    W = co[:, 0].max() - co[:, 0].min()
    H = co[:, 2].max() - co[:, 2].min()
    return [sheet], dict(width=W * 1.14, height=H * 1.14, center_z=cz, floating=True)


MOTIFS = {'drape': _drape, 'curtain': _curtain, 'flow': _flow}


def build(ctx):
    pal, p, rng = ctx.palette, ctx.params, ctx.rng
    flip = -1.0 if ctx.mirror else 1.0
    motif = str(p.get('motif', 'drape')).lower()
    if motif not in MOTIFS:
        motif = 'drape'
    kind = str(p.get('cloth', 'velvet' if motif == 'curtain' else 'satin')).lower()
    color = ctx.color(int(p.get('colorIndex', 0)))
    mat = (_velvet if kind == 'velvet' else _satin)('Cloth', color, ctx.dark)
    accent = C.material('Cord', ctx.color(1), roughness=0.5, sheen=0.6)
    metal = C.material('Brass', '#c8a15a' if not ctx.dark else '#b8925a', roughness=0.28, metallic=1.0)
    plinth = C.material('Plinth', C.mix_hex(pal['bg'], '#ffffff', 0.25 if not ctx.dark else 0.06), roughness=0.85)

    if motif == 'curtain':
        parts, look = _curtain(ctx, mat, flip, rng, accent, metal)
    elif motif == 'flow':
        parts, look = _flow(ctx, mat, flip, rng, plinth)
    else:
        parts, look = _drape(ctx, mat, flip, rng, plinth)

    floating = look.get('floating', False)
    cz = look['center_z']
    for ob in parts:
        ob.location.z -= cz
    floor = -cz

    cy = ctx.scene.cycles
    cy.max_bounces, cy.diffuse_bounces, cy.glossy_bounces = 6, 3, 3

    wall = C.material('Wall', pal['bg'], roughness=0.95, specular=0.0)
    if floating:
        w = C.add_plane(240, wall)
        w.rotation_euler = (math.radians(90), 0, 0)
        w.location = (0, 3.0, 0)
    else:
        C.add_backdrop(wall, floor_z=floor, wall_y=2.6, radius=1.8)

    # soft gradient light: a big key from above on the copy side, a long strip from the other side
    # for the sheen to run along, a low rim from behind (cloth only) that makes the folds glow at the edge
    C.set_world('#ffffff', 0.4)
    C.add_area_light((-4.6 * flip, -5.0, floor + 7.0 if not floating else 6.0), energy=float(p.get('key', 1500)), size=7.0,
                     target=(0.2 * flip, 0.6, floor + 0.6 if not floating else 0.0))
    rims = [C.add_area_light((3.6 * flip, 2.4, (floor if not floating else -0.6) + 3.0), energy=520 * float(p.get('rim', 1.0)), size=3.0,
                             color='#fff4e6', target=(0, 0, 0)),
            C.add_area_light((4.4 * flip, -2.0, 0.3), energy=240, size=1.0, size_y=6.0, target=(0, 0, 0))]
    for loc, size, st in (((-3.0 * flip, -3.0, 2.0), (1.4, 4.0), 4.0), ((2.6 * flip, -2.4, 1.0), (0.8, 4.0), 2.5)):
        card = C.add_softbox(loc, size, '#ffffff', st, (0, 0, 0))
        for attr in ('visible_camera', 'visible_diffuse', 'visible_shadow', 'visible_transmission'):
            try:
                setattr(card, attr, False)
            except Exception:
                pass
    try:
        coll = bpy.data.collections.new('Cloth')
        for ob in parts:
            coll.objects.link(ob)
        for lamp in rims:
            lamp.light_linking.receiver_collection = coll
    except Exception:
        for lamp in rims:
            lamp.data.energy *= 0.4

    ctx.frame(width=look['width'], height=look['height'], fov=24, direction=(0.0, -1.0, 0.22 if not floating else 0.05))
