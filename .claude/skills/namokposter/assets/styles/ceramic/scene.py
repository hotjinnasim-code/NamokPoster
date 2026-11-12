"""Glazed Ceramic — lathe-turned stoneware with a glossy glaze over a matte clay body: dip lines,
iron speckle, a bare foot ring, window-shaped highlights in the glaze.

The technique is the material; ``motif`` chooses what is made of it:
  vases — a still life of vases on plinth blocks
  table — stacked bowls, cups and a carafe on a round slab (tea / coffee table)
  tiles — a panel of hand-made glazed wall tiles with two-tone geometric patterns
"""
import math

import bmesh
import bpy

import common as C


# ----------------------------------------------------------------------------- node helpers
def _is_sock(v):
    return isinstance(v, bpy.types.NodeSocket)


def _math(nt, op, a, b=None, clamp=False):
    n = nt.nodes.new('ShaderNodeMath')
    n.operation = op
    n.use_clamp = clamp
    for i, v in enumerate((a, b)):
        if v is None:
            continue
        if _is_sock(v):
            nt.links.new(v, n.inputs[i])
        else:
            n.inputs[i].default_value = v
    return n.outputs[0]


def _mix(nt, fac, a, b, blend='MIX'):
    n = nt.nodes.new('ShaderNodeMixRGB')
    n.blend_type = blend
    for i, v in enumerate((fac, a, b)):
        if _is_sock(v):
            nt.links.new(v, n.inputs[i])
        elif i == 0:
            n.inputs[0].default_value = v
        else:
            n.inputs[i].default_value = C.col(v) if isinstance(v, str) else v
    return n.outputs[0]


def _step(nt, value, lo, hi):
    """Smoothstep of a socket between lo and hi."""
    n = nt.nodes.new('ShaderNodeMapRange')
    n.interpolation_type = 'SMOOTHSTEP'
    n.inputs[1].default_value, n.inputs[2].default_value = lo, hi
    n.inputs[3].default_value, n.inputs[4].default_value = 0.0, 1.0
    nt.links.new(value, n.inputs[0])
    return n.outputs[0]


def _noise(nt, vec, scale, detail=2.0, rough=0.5):
    n = nt.nodes.new('ShaderNodeTexNoise')
    n.inputs['Scale'].default_value = scale
    n.inputs['Detail'].default_value = detail
    n.inputs['Roughness'].default_value = rough
    nt.links.new(vec, n.inputs['Vector'])
    return n.outputs[0]


def _voronoi(nt, vec, scale):
    n = nt.nodes.new('ShaderNodeTexVoronoi')
    n.inputs['Scale'].default_value = scale
    nt.links.new(vec, n.inputs['Vector'])
    return n.outputs[0]


# ----------------------------------------------------------------------------- the glaze
def _glaze(name, color, clay, over=None, dip=None, tilt=0.0, raw_below=False, speckle=0.5, foot=0.014,
           gloss=1.0, pattern=None, size=1.0, seed=0.0):
    """Glossy glaze over a matte clay body.

    ``dip``      height (object z) of a dip line; above it ``color``, below it ``over`` (a second
                 glaze) or bare clay when ``raw_below``.
    ``foot``     the unglazed ring at the very bottom (0 = none).
    ``speckle``  0..1 iron speckle breaking through the glaze.
    ``pattern``  tiles only: (kind, second colour) drawn in the tile's own x/z, ``size`` = tile edge.
    """
    mat = C.material(name, color, roughness=0.3, coat=1.0, coat_roughness=0.035, specular=0.4)
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mapping = nt.nodes.new('ShaderNodeMapping')
    mapping.inputs['Location'].default_value = (seed * 3.1, seed * -1.7, 0.0)
    nt.links.new(tc.outputs['Object'], mapping.inputs['Vector'])
    P = mapping.outputs[0]                      # offset copy for the noises: every pot differs
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Object'], sep.inputs[0])
    x, y, z = sep.outputs

    # the glaze colour: mottled a little, two-tone across a wavy dip line
    mottle = _noise(nt, P, 3.2, 3.0, 0.55)
    col_a = _mix(nt, _step(nt, mottle, 0.3, 0.75), C.mix_hex(color, '#000000', 0.1), C.mix_hex(color, '#ffffff', 0.07))
    glaze = col_a
    glazed = None                                # 1 where there is glaze, 0 on bare clay
    if pattern:
        kind, second = pattern
        k = 1.0 / size
        u, v = _math(nt, 'MULTIPLY', x, k), _math(nt, 'MULTIPLY', z, k)     # -0.5 .. 0.5 across the tile
        wob = _math(nt, 'MULTIPLY', _math(nt, 'SUBTRACT', _noise(nt, P, 9.0, 2.0), 0.5), 0.03)

        def dist(cu, cv):
            du, dv = _math(nt, 'SUBTRACT', u, cu), _math(nt, 'SUBTRACT', v, cv)
            d2 = _math(nt, 'ADD', _math(nt, 'MULTIPLY', du, du), _math(nt, 'MULTIPLY', dv, dv))
            return _math(nt, 'ADD', _math(nt, 'SQRT', d2), wob)

        e = 0.012
        if kind == 'quarter':
            d = dist(0.5, 0.5)
            m = _math(nt, 'SUBTRACT', 1.0, _step(nt, d, 0.74 - e, 0.74 + e))
        elif kind == 'rings':
            d = dist(0.5, 0.5)
            outer_ = _math(nt, 'SUBTRACT', 1.0, _step(nt, d, 0.86 - e, 0.86 + e))
            mid = _step(nt, d, 0.58 - e, 0.58 + e)
            inner_ = _math(nt, 'SUBTRACT', 1.0, _step(nt, d, 0.3 - e, 0.3 + e))
            m = _math(nt, 'MAXIMUM', _math(nt, 'MULTIPLY', outer_, mid), inner_)
        elif kind == 'dot':
            m = _math(nt, 'SUBTRACT', 1.0, _step(nt, dist(0.0, 0.0), 0.27 - e, 0.27 + e))
        elif kind == 'arch':
            m = _math(nt, 'SUBTRACT', 1.0, _step(nt, dist(0.0, -0.5), 0.4 - e, 0.4 + e))
        elif kind == 'diag':
            m = _step(nt, _math(nt, 'ADD', _math(nt, 'ADD', u, v), wob), -e, e)
        else:   # 'half'
            m = _step(nt, _math(nt, 'ADD', u, wob), -e, e)
        col_b = _mix(nt, _step(nt, mottle, 0.3, 0.75), C.mix_hex(second, '#000000', 0.1), C.mix_hex(second, '#ffffff', 0.07))
        glaze = _mix(nt, m, col_a, col_b)
        # glaze pools darker along the tile edges
        edge = _step(nt, _math(nt, 'MAXIMUM', _math(nt, 'ABSOLUTE', u), _math(nt, 'ABSOLUTE', v)), 0.4, 0.5)
        glaze = _mix(nt, _math(nt, 'MULTIPLY', edge, 0.3), glaze, '#2a211c')
    elif dip is not None:
        wave = _math(nt, 'MULTIPLY', _math(nt, 'SUBTRACT', _noise(nt, P, 2.6, 2.0), 0.5), 0.05)
        line = _math(nt, 'ADD', _math(nt, 'ADD', z, wave), _math(nt, 'MULTIPLY', x, tilt))
        upper = _step(nt, line, dip - 0.004, dip + 0.004)
        if raw_below:
            glazed = upper
        else:
            col_b = _mix(nt, _step(nt, mottle, 0.3, 0.75), C.mix_hex(over, '#000000', 0.1), C.mix_hex(over, '#ffffff', 0.07))
            # where the two glazes overlap they run into a darker band
            band = _math(nt, 'MULTIPLY', _step(nt, line, dip - 0.03, dip), _math(nt, 'SUBTRACT', 1.0, upper))
            glaze = _mix(nt, upper, _mix(nt, _math(nt, 'MULTIPLY', band, 0.35), col_b, C.mix_hex(color, over, 0.5)), col_a)
    if foot > 0:
        above = _step(nt, z, foot - 0.002, foot + 0.002)
        glazed = above if glazed is None else _math(nt, 'MULTIPLY', glazed, above)

    # iron speckle: sparse dark flecks in two sizes, clustered by a slow noise
    if speckle > 0:
        cluster = _step(nt, _noise(nt, P, 5.0, 2.0), 0.35, 0.7)
        fine = _math(nt, 'SUBTRACT', 1.0, _step(nt, _voronoi(nt, P, 40.0), 0.09, 0.17))
        big = _math(nt, 'SUBTRACT', 1.0, _step(nt, _voronoi(nt, P, 15.0), 0.04, 0.08))
        flecks = _math(nt, 'MAXIMUM', _math(nt, 'MULTIPLY', fine, cluster), big)
        flecks = _math(nt, 'MULTIPLY', flecks, min(1.0, speckle), clamp=True)
        glaze = _mix(nt, flecks, glaze, '#3b2a20')
    else:
        flecks = None

    clay_col = _mix(nt, _step(nt, _noise(nt, P, 40.0, 3.0, 0.7), 0.3, 0.8), C.mix_hex(clay, '#000000', 0.08), C.mix_hex(clay, '#ffffff', 0.08))
    if glazed is not None:
        base = _mix(nt, glazed, clay_col, glaze)
        nt.links.new(_math(nt, 'MULTIPLY', glazed, gloss), bsdf.inputs.get('Coat Weight') or bsdf.inputs.get('Clearcoat'))
        rough = _math(nt, 'ADD', _math(nt, 'MULTIPLY', glazed, -0.5), 0.85)
        nt.links.new(rough, bsdf.inputs['Roughness'])
    else:
        base = glaze
        (bsdf.inputs.get('Coat Weight') or bsdf.inputs.get('Clearcoat')).default_value = gloss
        bsdf.inputs['Roughness'].default_value = 0.35
    nt.links.new(base, bsdf.inputs['Base Color'])

    # the glaze surface is never optically flat: a slow wobble, plus pits where the flecks are
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.07
    bump.inputs['Distance'].default_value = 0.02
    height = _noise(nt, P, 7.0, 2.0)
    if flecks is not None:
        height = _math(nt, 'SUBTRACT', height, _math(nt, 'MULTIPLY', flecks, 0.25))
    nt.links.new(height, bump.inputs['Height'])
    nt.links.new(bump.outputs[0], bsdf.inputs['Normal'])
    coat_n = bsdf.inputs.get('Coat Normal') or bsdf.inputs.get('Clearcoat Normal')
    if coat_n is not None:
        soft = nt.nodes.new('ShaderNodeBump')
        soft.inputs['Strength'].default_value = 0.05
        soft.inputs['Distance'].default_value = 0.02
        nt.links.new(_noise(nt, P, 4.0, 1.0), soft.inputs['Height'])
        nt.links.new(soft.outputs[0], coat_n)
    return mat


# ----------------------------------------------------------------------------- lathe work
SHAPES = {   # outside profiles (radius, height) for a pot of height 1, foot to lip
    'bottle':   [(0.19, 0.0), (0.25, 0.05), (0.33, 0.24), (0.31, 0.44), (0.17, 0.62), (0.085, 0.75), (0.072, 0.9), (0.1, 1.0)],
    'moon':     [(0.25, 0.0), (0.42, 0.12), (0.57, 0.42), (0.54, 0.66), (0.39, 0.88), (0.24, 0.955), (0.235, 1.0)],
    'shoulder': [(0.17, 0.0), (0.22, 0.05), (0.31, 0.36), (0.33, 0.62), (0.23, 0.82), (0.145, 0.9), (0.16, 1.0)],
    'cylinder': [(0.2, 0.0), (0.235, 0.03), (0.245, 0.5), (0.24, 0.96), (0.232, 1.0)],
    'bud':      [(0.22, 0.0), (0.38, 0.2), (0.43, 0.45), (0.3, 0.72), (0.125, 0.87), (0.11, 1.0)],
    'gourd':    [(0.2, 0.0), (0.34, 0.12), (0.37, 0.28), (0.25, 0.48), (0.21, 0.56), (0.27, 0.7), (0.25, 0.82), (0.12, 0.93), (0.115, 1.0)],
    'carafe':   [(0.24, 0.0), (0.3, 0.04), (0.33, 0.3), (0.29, 0.52), (0.15, 0.7), (0.12, 0.84), (0.17, 1.0)],
    'bowl':     [(0.42, 0.0), (0.5, 0.05), (0.95, 0.4), (1.38, 0.82), (1.5, 1.0)],
    'cup':      [(0.62, 0.0), (0.72, 0.05), (0.84, 0.5), (0.92, 1.0)],
    'tumbler':  [(0.3, 0.0), (0.36, 0.04), (0.38, 0.5), (0.4, 1.0)],
    'plate':    [(2.4, 0.0), (2.7, 0.12), (4.4, 0.62), (5.0, 1.0)],
}


def _smooth(pts, n=9):
    """Catmull–Rom through the control points."""
    P = [pts[0]] + list(pts) + [pts[-1]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(n):
            t = k / n
            out.append(tuple(0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t * t
                                    + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t ** 3) for j in (0, 1)))
    out.append(tuple(pts[-1]))
    return out


def _vessel(shape, height, mat, wall=0.02, **kw):
    """A thrown pot: smooth outside, rounded lip, a real inside. Stands on z = 0 of its own space."""
    outer = _smooth([(r * height, z * height) for r, z in SHAPES[shape]])
    outer = [(max(r, 0.004), z) for r, z in outer]
    prof = [(0.0, 0.0), (outer[0][0] * 0.94, 0.0)] + outer
    rt, zt = outer[-1]
    prof += [(rt - wall / 2 + wall / 2 * math.cos(a), zt + wall / 2 * math.sin(a)) for a in [math.pi * i / 8 for i in range(1, 8)]]
    floor_in = max(wall * 1.6, 0.03 * height)
    inner = []
    for i in range(len(outer) - 1, 0, -1):
        (r0, z0), (r1, z1) = outer[i - 1], outer[min(i + 1, len(outer) - 1)]
        tx, tz = r1 - r0, z1 - z0
        ln = math.hypot(tx, tz) or 1.0
        r, z = outer[i][0] - wall * tz / ln, outer[i][1] + wall * tx / ln
        if z <= floor_in:
            break
        if r > 0.004 and (not inner or z < inner[-1][1] - 1e-4):
            inner.append((r, z))
    prof += inner
    prof.append((max(0.004, (inner[-1][0] if inner else rt) * 0.7), floor_in))
    prof.append((0.0, floor_in))
    return C.add_lathe(prof, mat, segments=112, name=shape.title(), **kw)


def _handle(radius, thick, mat, location, flip=1.0):
    """C-shaped mug handle: a tube along an arc in the XZ plane."""
    bm = bmesh.new()
    n, m = 40, 14
    rings = []
    for i in range(n + 1):
        a = math.radians(-112 + 224 * i / n)
        cx, cz = radius * math.cos(a) * 0.86, radius * math.sin(a)
        nx, nz = math.cos(a), math.sin(a)
        rings.append([bm.verts.new((flip * (cx + thick * math.cos(b) * nx), thick * 0.8 * math.sin(b), cz + thick * math.cos(b) * nz))
                      for b in [math.tau * j / m for j in range(m)]])
    for a, b in zip(rings[:-1], rings[1:]):
        for j in range(m):
            k = (j + 1) % m
            bm.faces.new((a[j], a[k], b[k], b[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return C.finish_mesh('Handle', bm, True, mat, location=location)


def _window_card(location, size, strength, target):
    """A bright card seen only in reflections: the window highlight in the glaze."""
    ob = C.add_softbox(location, size, '#ffffff', strength, target)
    for attr in ('visible_camera', 'visible_diffuse', 'visible_shadow', 'visible_transmission'):
        try:
            setattr(ob, attr, False)
        except Exception:
            pass
    return ob


# ----------------------------------------------------------------------------- motifs
def _recipes(ctx, clay, rng, speck):
    """Glaze recipes from the palette: solid, two-tone dips, glaze over bare clay."""
    c = [ctx.color(i) for i in range(4)]
    count = [0]

    def make(kind, a, b=None, h=1.0):
        count[0] += 1
        sd = rng.uniform(0, 40)
        t = rng.uniform(-0.12, 0.12)
        nm = 'Glaze%d' % count[0]
        if kind == 'solid':
            return _glaze(nm, a, clay, speckle=speck * rng.uniform(0.5, 1.0), seed=sd)
        if kind == 'dip':       # second glaze below the line
            return _glaze(nm, a, clay, over=b, dip=h * rng.uniform(0.32, 0.5), tilt=t, speckle=speck * 0.7, seed=sd)
        if kind == 'raw':       # bare clay below the line
            return _glaze(nm, a, clay, dip=h * rng.uniform(0.2, 0.34), tilt=t, raw_below=True, speckle=speck, seed=sd)
        return _glaze(nm, a, clay, over=b, dip=h * rng.uniform(0.6, 0.74), tilt=t, speckle=speck * 0.7, seed=sd)   # 'collar'
    return c, make


def _vases(ctx, clay, plinth, flip, rng, speck, floor):
    c, make = _recipes(ctx, clay, rng, speck)
    X = lambda v: (v - 0.12) * flip
    # plinth blocks: a low slab and a tall block
    C.add_box((1.3, 0.62, 0.16), 0.012, plinth, location=(X(0.3), 0.08, floor + 0.08), segments=3)
    C.add_box((0.42, 0.42, 0.7), 0.012, plinth, location=(X(-0.62), 0.3, floor + 0.35), segments=3)
    slab, block = floor + 0.16, floor + 0.7
    pale = max(c, key=C.luminance)
    others = [k for k in c if k != pale]
    rng.shuffle(others)
    a, b, d = others[0], others[1 % len(others)], others[2 % len(others)]
    _vessel('bottle', 1.04, make('dip', a, pale, 1.04), location=(X(0.06), 0.1, slab), rotation=(0, 0, rng.uniform(0, 6)))
    _vessel('moon', 0.56, make('solid', pale), location=(X(0.6), 0.02, slab), rotation=(0, 0, rng.uniform(0, 6)))
    _vessel('gourd', 0.52, make('raw', b, h=0.52), location=(X(-0.62), 0.3, block), rotation=(0, 0, rng.uniform(0, 6)))
    _vessel('shoulder', 0.5, make('collar', d, a, 0.5), location=(X(0.98), -0.42, floor), rotation=(0, 0, rng.uniform(0, 6)))
    _vessel('cup', 0.15, make('raw', a, h=0.15), wall=0.014, location=(X(-0.3), -0.36, floor), rotation=(0, 0, rng.uniform(0, 6)))
    return dict(width=2.2, height=1.7, fov=20, direction=(0.0, -1.0, 0.15))


def _table(ctx, clay, plinth, flip, rng, speck, floor):
    c, make = _recipes(ctx, clay, rng, speck)
    C.add_cylinder(0.92, 0.1, 0.02, plinth, location=(0.04 * flip, 0.06, floor + 0.05))
    top = floor + 0.1
    pale = max(c, key=C.luminance)
    others = [k for k in c if k != pale]
    rng.shuffle(others)
    a, b, d = others[0], others[1 % len(others)], others[2 % len(others)]
    # three nested bowls, each a little askew
    z, r = top, 0.26
    for i, (col_, kind) in enumerate(((a, 'raw'), (pale, 'solid'), (b, 'raw'))):
        h = 0.2 - 0.012 * i
        _vessel('bowl', h, make(kind, col_, h=h), wall=0.016, location=(-0.46 * flip + rng.uniform(-0.012, 0.012), 0.12 + rng.uniform(-0.012, 0.012), z),
                rotation=(math.radians(rng.uniform(-2.5, 2.5)), math.radians(rng.uniform(-2.5, 2.5)), rng.uniform(0, 6)), scale=1.0 - 0.07 * i)
        z += 0.07
    _vessel('carafe', 0.74, make('dip', d, pale, 0.74), location=(0.1 * flip, 0.5, top), rotation=(0, 0, rng.uniform(0, 6)))
    # two cups on a saucer
    _vessel('plate', 0.045, make('solid', pale), wall=0.012, location=(0.54 * flip, 0.02, top))
    _vessel('cup', 0.17, make('raw', a, h=0.17), wall=0.013, location=(0.54 * flip, 0.02, top + 0.02), rotation=(0, 0, rng.uniform(0, 6)))
    _vessel('cup', 0.17, make('solid', b), wall=0.013, location=(0.55 * flip, 0.03, top + 0.115), rotation=(math.radians(2.5), math.radians(-2), rng.uniform(0, 6)))
    # a mug with a handle, a small dish
    mug = make('collar', pale, d, 0.24)
    _vessel('tumbler', 0.24, mug, wall=0.014, location=(0.02 * flip, -0.42, top))
    _handle(0.07, 0.016, mug, (0.02 * flip + 0.128 * flip, -0.42, top + 0.125), flip)
    _vessel('plate', 0.03, make('solid', d), wall=0.01, location=(-0.42 * flip, -0.52, top), scale=0.7)
    _vessel('bud', 0.24, make('raw', b, h=0.24), location=(0.74 * flip, 0.5, top), rotation=(0, 0, rng.uniform(0, 6)))
    return dict(width=1.96, height=1.3, fov=20, direction=(0.0, -1.0, 0.34))


def _tiles(ctx, clay, flip, rng, speck):
    c = [ctx.color(i) for i in range(4)]
    x0, y0, x1, y1 = ctx.art_rect
    ar = max(0.3, (x1 - x0) * ctx.width) / max(1.0, (y1 - y0) * ctx.height)
    cols, rows = min(((4, 4), (4, 5), (5, 4), (5, 3), (6, 3)), key=lambda g: abs(math.log(g[0] / g[1] / max(0.6, min(2.4, ar)))))
    s, gap = 0.36, 0.016
    pitch = s + gap
    W, H = cols * pitch, rows * pitch
    # grout bed
    C.add_box((W + 0.05, 0.03, H + 0.05), 0.006, C.material('Grout', C.mix_hex(clay, '#ffffff', 0.35), roughness=0.95, specular=0.0),
              location=(0, 0.03, 0), segments=2)
    kinds = ['quarter', 'rings', 'quarter', 'arch', 'dot', 'half', 'diag', 'plain', 'plain']
    n = 0
    for i in range(cols):
        for j in range(rows):
            kind = rng.choice(kinds)
            a, b = rng.sample(c, 2)
            n += 1
            mat = _glaze('Tile%d' % n, a, clay, speckle=speck * rng.uniform(0.2, 0.8), foot=0.0,
                         pattern=None if kind == 'plain' else (kind, b), size=s, seed=rng.uniform(0, 40))
            C.add_box((s, 0.045, s), 0.014, mat, segments=4,
                      location=((i - (cols - 1) / 2) * pitch, rng.uniform(-0.004, 0.004), (j - (rows - 1) / 2) * pitch),
                      rotation=(math.radians(rng.uniform(-1.2, 1.2)), math.radians(90 * rng.randrange(4)), math.radians(rng.uniform(-1.2, 1.2))),
                      scale=rng.uniform(0.985, 1.0))
    return dict(width=W * 1.1, height=H * 1.1, fov=18, direction=(0.1 * flip, -1.0, 0.04))


def build(ctx):
    rng, pal, p = ctx.rng, ctx.palette, ctx.params
    flip = -1.0 if ctx.mirror else 1.0
    dark = ctx.dark
    motif = str(p.get('motif', 'vases')).lower()
    speck = max(0.0, min(1.0, float(p.get('speckle', 0.6))))
    clay = C.mix_hex('#c9a987' if not dark else '#b78a68', pal['bg'], 0.12)

    ambient = 0.56
    if motif == 'tiles':
        sun_dir = (0.5 * flip, 0.66, -0.56)
    else:
        sun_dir = (0.52 * flip, 0.7, -0.7)            # floor and wall face the sun equally
    cos_wall = sun_dir[1] / math.sqrt(sum(v * v for v in sun_dir))
    C.set_world('#ffffff', ambient)
    C.add_sun(sun_dir, strength=(1.0 - ambient) * math.pi / cos_wall, angle=float(p.get('shadow', 10.0)))
    wall_mat = C.material('Wall', pal['bg'], roughness=0.95, specular=0.0)
    plinth = C.material('Plinth', C.mix_hex(pal['bg'], '#ffffff', 0.22 if not dark else 0.07), roughness=0.85, specular=0.15)

    if motif == 'tiles':
        look = _tiles(ctx, clay, flip, rng, speck)
        wall = C.add_plane(240, wall_mat)
        wall.rotation_euler = (math.radians(90), 0, 0)
        wall.location = (0, 0.045, 0)
    elif motif == 'table':
        floor = -0.52
        look = _table(ctx, clay, plinth, flip, rng, speck, floor)
        C.add_backdrop(wall_mat, floor_z=floor, wall_y=2.6, radius=1.6)
    else:
        floor = -0.8
        look = _vases(ctx, clay, plinth, flip, rng, speck, floor)
        C.add_backdrop(wall_mat, floor_z=floor, wall_y=2.2, radius=1.5)

    # what the glaze mirrors: a tall window on the light side, a long strip above, a dim card opposite
    if motif == 'tiles':
        # a wall of tiles faces the viewer: the window sits behind the camera, a little to the light side
        w = _window_card((-1.2 * flip, -9.0, 1.3), (1.5, 6.0), 7.0, (0, 0, 0))
        w.rotation_euler.rotate_axis('Z', math.radians(-24 * flip))
        _window_card((2.6 * flip, -9.0, -1.6), (0.5, 4.0), 3.0, (0, 0, 0)).rotation_euler.rotate_axis('Z', math.radians(-24 * flip))
    else:
        _window_card((-3.4 * flip, -3.2, 2.2), (1.6, 4.6), 9.0, (0, 0, 0.1))
        _window_card((0.6 * flip, -1.6, 4.4), (5.0, 0.9), 5.0, (0, 0, 0))
        _window_card((4.2 * flip, -2.4, 0.6), (2.4, 3.6), 1.2, (0, 0, 0))

    ctx.frame(**look)
