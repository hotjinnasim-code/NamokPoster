"""Frosted Glass — glassmorphism in real glass: thin bevelled slabs of frosted glass (cards, discs,
arches) with bright thin rims, blurring the saturated orbs and lights that sit behind them.

The technique is the material; ``motif`` chooses what is built from it:
  cards — overlapping rounded cards (interface / product feel)
  discs — round lenses and a ring (abstract, science, sound)
  arch  — an arch-and-steps architecture of glass on a floor, with a glowing disc behind
"""
import math

import bmesh
import bpy

import common as C


# ----------------------------------------------------------------------------- materials
def _frost(name, tint, rough=0.24, milk=0.12, rim=1.0, shadow=0.76, ior=1.46):
    """Frosted glass: rough transmission, a little white 'milk' so the slab reads on any wall, a
    bright thin rim where the bevel turns away from the camera, and see-through shadows (Cycles
    has caustics off here, so plain glass would cast a solid shadow on what it should reveal)."""
    mat = C.material(name, tint, roughness=rough, transmission=1.0, ior=ior)
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')

    diff = nt.nodes.new('ShaderNodeBsdfDiffuse')
    diff.inputs['Color'].default_value = C.col(C.mix_hex(tint, '#ffffff', 0.6))
    milky = nt.nodes.new('ShaderNodeMixShader')
    milky.inputs[0].default_value = milk
    nt.links.new(bsdf.outputs[0], milky.inputs[1])
    nt.links.new(diff.outputs[0], milky.inputs[2])

    lw = nt.nodes.new('ShaderNodeLayerWeight')
    lw.inputs['Blend'].default_value = 0.5
    edge = nt.nodes.new('ShaderNodeMapRange')
    edge.interpolation_type = 'SMOOTHSTEP'
    edge.inputs[1].default_value, edge.inputs[2].default_value = 0.26, 0.56
    edge.inputs[3].default_value, edge.inputs[4].default_value = 0.0, 0.92
    nt.links.new(lw.outputs['Facing'], edge.inputs[0])
    glow = nt.nodes.new('ShaderNodeEmission')
    glow.inputs['Color'].default_value = C.col(C.mix_hex(tint, '#ffffff', 0.85))
    glow.inputs['Strength'].default_value = rim
    rimmed = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(edge.outputs[0], rimmed.inputs[0])
    nt.links.new(milky.outputs[0], rimmed.inputs[1])
    nt.links.new(glow.outputs[0], rimmed.inputs[2])

    path = nt.nodes.new('ShaderNodeLightPath')
    k = nt.nodes.new('ShaderNodeMath')
    k.operation = 'MULTIPLY'
    k.inputs[1].default_value = shadow
    nt.links.new(path.outputs['Is Shadow Ray'], k.inputs[0])
    clear = nt.nodes.new('ShaderNodeBsdfTransparent')
    clear.inputs['Color'].default_value = C.col(C.mix_hex(tint, '#ffffff', 0.5))
    final = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(k.outputs[0], final.inputs[0])
    nt.links.new(rimmed.outputs[0], final.inputs[1])
    nt.links.new(clear.outputs[0], final.inputs[2])
    nt.links.new(final.outputs[0], out.inputs['Surface'])
    return mat


def _orb(name, color, glow, rough=0.34):
    """Saturated satin ball; a little self-light keeps the colour clean behind the glass."""
    return C.material(name, color, roughness=rough, emission=color, emission_strength=glow, coat=0.4, coat_roughness=0.15)


def _lamp(name, a, b, strength):
    """A light source: two-colour gradient emitter."""
    return C.emission_material(name, a, strength, gradient=(a, b))


def _sheen_card(location, size, strength, target=(0, 0, 0)):
    """White card that only shows up in reflections: the soft sheen that says 'glass'."""
    ob = C.add_softbox(location, size, '#ffffff', strength, target)
    for attr in ('visible_camera', 'visible_diffuse', 'visible_shadow', 'visible_transmission'):
        try:
            setattr(ob, attr, False)
        except Exception:
            pass
    return ob


# ----------------------------------------------------------------------------- shapes
def _rrect(w, h, r, n=14):
    """Rounded rectangle outline in the XZ plane, counter-clockwise."""
    r = min(r, 0.49 * w, 0.49 * h)
    pts = []
    for cx, cz, a0 in ((w / 2 - r, h / 2 - r, 0.0), (-w / 2 + r, h / 2 - r, 90.0), (-w / 2 + r, -h / 2 + r, 180.0), (w / 2 - r, -h / 2 + r, 270.0)):
        for i in range(n + 1):
            a = math.radians(a0 + 90.0 * i / n)
            pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    return pts


def _circle(r, n=160):
    return [(r * math.cos(math.tau * i / n), r * math.sin(math.tau * i / n)) for i in range(n)]


def _arch(w, h, n=72, r=0.03):
    """Filled doorway shape standing on z = 0: straight sides, semicircular head, eased feet."""
    half = w / 2
    top = h - half
    pts = [(half - r, 0.0), (half, r), (half, top)]
    pts += [(half * math.cos(math.pi * i / n), top + half * math.sin(math.pi * i / n)) for i in range(1, n)]
    pts += [(-half, top), (-half, r), (-half + r, 0.0)]
    return pts


def _slab(outline, thick, mat, bevel=0.02, **kw):
    ob = C.add_extrusion(outline, thick, bevel, mat, name='Glass', **kw)
    for m in ob.modifiers:
        if m.type == 'BEVEL':
            m.segments = 5
    return ob


def _ring(outer, inner, thick, mat, bevel=0.016, segments=192, **kw):
    """Flat ring (annulus) with eased edges, axis along Y — a rounded-rectangle section swept round."""
    h = thick / 2
    sec = []
    for cr, cy, a0 in ((outer - bevel, h - bevel, 0.0), (inner + bevel, h - bevel, 90.0), (inner + bevel, -h + bevel, 180.0), (outer - bevel, -h + bevel, 270.0)):
        for i in range(6):
            a = math.radians(a0 + 90.0 * i / 5)
            sec.append((cr + bevel * math.cos(a), cy + bevel * math.sin(a)))
    bm = bmesh.new()
    rings = []
    for s in range(segments):
        a = math.tau * s / segments
        rings.append([bm.verts.new((r * math.cos(a), y, r * math.sin(a))) for r, y in sec])
    m = len(sec)
    for s in range(segments):
        a, b = rings[s], rings[(s + 1) % segments]
        for j in range(m):
            k = (j + 1) % m
            bm.faces.new((a[j], a[k], b[k], b[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return C.weighted_normals(C.finish_mesh('GlassRing', bm, True, mat, **kw))


def _rad(*deg):
    return tuple(math.radians(d) for d in deg)


# ----------------------------------------------------------------------------- motifs
def _cards(ctx, glass, orbs, lamps, flip, rng):
    # two cards, the hero in front; orbs half behind them, one small orb in front
    _slab(_rrect(1.42, 0.92, 0.14), 0.05, glass[0], 0.02, location=(0.06 * flip, 0.0, -0.14),
          rotation=_rad(-7, -9 * flip, 15 * flip))
    _slab(_rrect(1.06, 0.7, 0.12), 0.045, glass[1], 0.02, location=(-0.3 * flip, 0.4, 0.5),
          rotation=_rad(6, 12 * flip, -12 * flip))
    C.add_sphere(0.47, orbs[0], location=(0.52 * flip, 0.72, 0.3))
    C.add_sphere(0.34, orbs[1], location=(-0.56 * flip, 0.52, -0.46))
    C.add_sphere(0.21, lamps[0], location=(-0.8 * flip, 0.85, 0.78), rotation=_rad(0, 35, 20))
    C.add_sphere(0.15, orbs[2], location=(0.8 * flip, 0.3, -0.6))
    C.add_sphere(0.06, orbs[3], location=(-0.98 * flip, 0.1, 0.06))
    C.add_torus(0.19, 0.045, orbs[3], location=(0.16 * flip, 0.62, -0.8), rotation=_rad(64, 18 * flip, 20))
    return dict(radius=1.14, fov=22, direction=(0.0, -1.0, 0.03))


def _discs(ctx, glass, orbs, lamps, flip, rng):
    # a big lens, a smaller one overlapping it in front, and a ring; never more than two deep
    _slab(_circle(0.72), 0.05, glass[0], 0.024, location=(-0.16 * flip, 0.1, -0.06), rotation=_rad(-6, 0, 16 * flip))
    _slab(_circle(0.43), 0.045, glass[1], 0.022, location=(0.56 * flip, -0.3, 0.46), rotation=_rad(8, 0, -14 * flip))
    _ring(0.46, 0.31, 0.05, glass[1], 0.02, location=(0.6 * flip, 0.3, -0.6), rotation=_rad(-12, 0, -22 * flip))
    C.add_sphere(0.44, orbs[0], location=(-0.5 * flip, 0.74, 0.34))
    C.add_capsule(0.13, 1.0, lamps[0], location=(0.02 * flip, 0.72, -0.4), rotation=_rad(0, 52 * flip, 0))
    C.add_sphere(0.27, orbs[1], location=(0.72 * flip, 0.66, 0.62))
    C.add_sphere(0.15, orbs[2], location=(0.6 * flip, 0.42, -0.6))
    C.add_sphere(0.11, orbs[3], location=(-0.86 * flip, 0.2, -0.66))
    C.add_sphere(0.05, orbs[1], location=(-0.2 * flip, 0.3, 0.92))
    return dict(radius=1.14, fov=22, direction=(0.0, -1.0, 0.03))


def _arches(ctx, glass, orbs, lamps, flip, rng, floor):
    # three shallow steps of milky glass, two arch slabs standing on them, a glowing disc behind
    for i, (w, d) in enumerate(((1.78, 0.96), (1.42, 0.72), (1.06, 0.5))):
        C.add_box((w, d, 0.1), 0.014, glass[2], location=(0.0, 0.34 + 0.1 * i, floor + 0.05 + 0.1 * i), segments=4)
    top = floor + 0.3
    _slab(_arch(0.8, 1.5), 0.055, glass[0], 0.022, location=(-0.16 * flip, 0.34, top), rotation=_rad(0, 0, 14 * flip))
    _slab(_arch(0.6, 1.0), 0.05, glass[1], 0.022, location=(0.34 * flip, 0.06, top - 0.1), rotation=_rad(0, 0, -16 * flip))
    C.add_sphere(0.36, lamps[0], location=(0.18 * flip, 1.15, top + 1.02), rotation=_rad(0, 90, 0))
    C.add_sphere(0.2, orbs[1], location=(-0.46 * flip, 0.86, top + 0.36))
    C.add_sphere(0.14, orbs[2], location=(0.72 * flip, 0.3, floor + 0.2 + 0.14))
    C.add_sphere(0.085, orbs[0], location=(-0.78 * flip, -0.2, floor + 0.085))
    C.add_sphere(0.05, orbs[3], location=(0.5 * flip, -0.36, floor + 0.05))
    return dict(width=1.9, height=2.16, fov=22, direction=(0.0, -1.0, 0.15))


def build(ctx):
    rng, pal, p = ctx.rng, ctx.palette, ctx.params
    flip = -1.0 if ctx.mirror else 1.0
    dark = ctx.dark
    motif = str(p.get('motif', 'cards')).lower()
    frost = max(0.08, min(0.45, float(p.get('frost', 0.24))))
    glow = float(p.get('glow', 1.0))

    c = [ctx.color(i) for i in range(4)]
    order = c[:3]
    rng.shuffle(order)
    order.append(c[3])

    # --- glass: nearly neutral, a breath of the palette in the second sheet
    milk = (0.1 if dark else 0.16) * float(p.get('milk', 1.0))
    rim = 0.75 if dark else 1.05
    tint0 = C.mix_hex(pal['bg'], '#ffffff', 0.92) if not dark else '#f2f4ff'
    tint1 = C.mix_hex(order[0], '#ffffff', 0.94)
    glass = [_frost('GlassA', tint0, frost, milk, rim),
             _frost('GlassB', tint1, frost * 0.85, milk, rim),
             C.material('Step', C.mix_hex(pal['bg'], '#ffffff', 0.6 if not dark else 0.14), roughness=0.7, specular=0.2)]
    self_light = (0.55 if dark else 0.22) * glow
    orbs = [_orb('Orb%d' % i, col_, self_light) for i, col_ in enumerate(order)]
    lamps = [_lamp('Lamp', order[1], order[0], (1.5 if dark else 1.05) * glow)]

    # --- light: soft sky + a sun from the copy side; a matte wall renders at exactly the palette colour
    ambient = 0.52
    FLOOR = -0.9
    if motif == 'arch':
        sun_dir = (0.5 * flip, 0.72, -0.72)          # floor and wall face the sun equally
    else:
        sun_dir = (0.3 * flip, 0.88, -0.32)
    cos_wall = sun_dir[1] / math.sqrt(sum(v * v for v in sun_dir))
    C.set_world('#ffffff', ambient)
    C.add_sun(sun_dir, strength=(1.0 - ambient) * math.pi / cos_wall, angle=float(p.get('shadow', 12.0)))
    wall_mat = C.material('Wall', pal['bg'], roughness=0.95, specular=0.0)

    if motif == 'discs':
        look = _discs(ctx, glass, orbs, lamps, flip, rng)
    elif motif == 'arch':
        look = _arches(ctx, glass, orbs, lamps, flip, rng, FLOOR)
    else:
        look = _cards(ctx, glass, orbs, lamps, flip, rng)

    if motif == 'arch':
        C.add_backdrop(wall_mat, floor_z=FLOOR, wall_y=2.3, radius=1.5)
    else:
        wall = C.add_plane(240, wall_mat)
        wall.rotation_euler = (math.radians(90), 0, 0)
        wall.location = (0, 1.32, 0)

    _sheen_card((-3.2 * flip, -3.0, 3.6), (5.0, 5.0), 1.6)
    _sheen_card((3.6 * flip, -2.2, -1.0), (3.0, 4.0), 0.7)

    ctx.frame(**look)
