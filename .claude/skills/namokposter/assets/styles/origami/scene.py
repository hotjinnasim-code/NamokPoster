"""Origami — folded paper. Crisp creased low-poly forms with paper grain, a coloured face and a
pale reverse, one soft top light and clean contact shadows.

motif: cranes (a flight of paper cranes) | boats (paper boats on a pleated sea) |
       peaks (folded mountains and firs) | relief (a pleated tessellation panel)
"""
import math

import bpy
from mathutils import Matrix, Vector

import common as C


# ----------------------------------------------------------------------------- paper
def _mix(nt, blend='MIX'):
    """A colour mix node that exists on every Blender version: returns (fac, a, b, out)."""
    try:
        n = nt.nodes.new('ShaderNodeMix')
        n.data_type = 'RGBA'
        n.blend_type = blend
        return n.inputs[0], n.inputs[6], n.inputs[7], n.outputs[2]
    except Exception:
        n = nt.nodes.new('ShaderNodeMixRGB')
        n.blend_type = blend
        return n.inputs[0], n.inputs[1], n.inputs[2], n.outputs[0]


def _paper_material(grain=1.0):
    """One material for every sheet: the face colour and the reverse colour are stored on the mesh
    (per fold facet), the back of a sheet shows the reverse; fibre mottling and a fine grain bump."""
    mat = C.material('Paper', '#ffffff', roughness=0.87, specular=0.2, sheen=0.1)
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    front = nt.nodes.new('ShaderNodeAttribute')
    front.attribute_name = 'paper_front'
    back = nt.nodes.new('ShaderNodeAttribute')
    back.attribute_name = 'paper_back'
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    fac, a, b, side = _mix(nt)
    nt.links.new(geo.outputs['Backfacing'], fac)
    nt.links.new(front.outputs['Color'], a)
    nt.links.new(back.outputs['Color'], b)
    out = side
    if grain > 0:
        tc = nt.nodes.new('ShaderNodeTexCoord')
        # soft cloudy mottling of the pulp (a few percent) ...
        cloud = nt.nodes.new('ShaderNodeTexNoise')
        cloud.inputs['Scale'].default_value = 7.0
        cloud.inputs['Detail'].default_value = 4.0
        cloud.inputs['Roughness'].default_value = 0.65
        rng_ = nt.nodes.new('ShaderNodeMapRange')
        rng_.inputs[1].default_value, rng_.inputs[2].default_value = 0.25, 0.75
        rng_.inputs[3].default_value, rng_.inputs[4].default_value = 1.0 - 0.07 * grain, 1.0 + 0.05 * grain
        fac2, a2, b2, out = _mix(nt, 'MULTIPLY')
        fac2.default_value = 1.0
        nt.links.new(tc.outputs['Object'], cloud.inputs['Vector'])
        nt.links.new(cloud.outputs[0], rng_.inputs[0])
        nt.links.new(side, a2)
        nt.links.new(rng_.outputs[0], b2)
        # ... and the tooth of the sheet
        fine = nt.nodes.new('ShaderNodeTexNoise')
        fine.inputs['Scale'].default_value = 190.0
        fine.inputs['Detail'].default_value = 3.0
        fine.inputs['Roughness'].default_value = 0.7
        bump = nt.nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = min(1.0, 0.34 * grain)
        bump.inputs['Distance'].default_value = 0.006
        nt.links.new(tc.outputs['Object'], fine.inputs['Vector'])
        nt.links.new(fine.outputs[0], bump.inputs['Height'])
        nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    nt.links.new(out, bsdf.inputs['Base Color'])
    return mat


class Folded:
    """Collects flat facets (each with its own vertices, so every crease stays crisp) and turns
    them into one mesh. ``face()`` takes points in local space and bakes ``self.m`` into them."""

    def __init__(self, rng, jitter=0.035):
        self.rng, self.jitter = rng, jitter
        self.m = Matrix.Identity(4)
        self.verts, self.faces, self.front, self.back = [], [], [], []

    def face(self, pts, front, back=None, ref=None, hint=None, shade=1.0):
        """``ref``: a point on the reverse side of the sheet (inside the model); ``hint``: a vector
        the coloured side should face. One of them fixes which side is the face of the paper."""
        P = [self.m @ Vector(p) for p in pts]
        n = Vector((0.0, 0.0, 0.0))
        for i in range(len(P)):                                   # Newell normal
            p, q = P[i], P[(i + 1) % len(P)]
            n += Vector(((p.y - q.y) * (p.z + q.z), (p.z - q.z) * (p.x + q.x), (p.x - q.x) * (p.y + q.y)))
        if ref is not None:
            hint = sum(P, Vector()) / len(P) - self.m @ Vector(ref)
        elif hint is not None:
            hint = self.m.to_3x3() @ Vector(hint)
        if hint is not None and n.dot(hint) < 0:
            P.reverse()
        i0 = len(self.verts)
        self.verts += [tuple(p) for p in P]
        self.faces.append(tuple(range(i0, i0 + len(P))))
        j = shade * (1.0 + self.rng.uniform(-self.jitter, self.jitter))
        f = [min(1.0, v * j) for v in C.col(front)[:3]]
        b = [min(1.0, v * j) for v in C.col(back or front)[:3]]
        self.front += (f + [1.0]) * len(P)
        self.back += (b + [1.0]) * len(P)

    def points(self):
        return [Vector(v) for v in self.verts]

    def build(self, name, mat):
        me = bpy.data.meshes.new(name)
        me.from_pydata(self.verts, [], self.faces)
        me.update()
        for attr, data in (('paper_front', self.front), ('paper_back', self.back)):
            layer = me.color_attributes.new(attr, 'FLOAT_COLOR', 'CORNER')
            layer.data.foreach_set('color', data)
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        me.materials.append(mat)
        return ob


def _place(pos, yaw=0.0, pitch=0.0, roll=0.0, scale=1.0, mirror=False):
    m = (Matrix.Translation(pos) @ Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Rotation(-pitch, 4, 'Y')
         @ Matrix.Rotation(roll, 4, 'X') @ Matrix.Scale(scale, 4))
    return (Matrix.Scale(-1, 4, (1, 0, 0)) @ m) if mirror else m


# ----------------------------------------------------------------------------- models
def _crane(fold, col, back, wing=0.34, sweep=0.0):
    """The traditional crane, head towards +x, wings along ±y. ``wing`` = how far the wings are
    raised (radians)."""
    inside = (0.0, 0.0, -0.06)
    bl, nb, tb, top = (0.0, 0.0, -0.25), (0.27, 0.0, -0.13), (-0.27, 0.0, -0.13), (0.0, 0.0, 0.1)
    nt, tt = (0.6, 0.0, 0.6), (-0.7, 0.0, 0.56)
    beak = (0.83, 0.0, 0.47)
    for s in (1.0, -1.0):
        ns, ts, ls = (0.17, 0.06 * s, 0.0), (-0.17, 0.06 * s, 0.0), (0.0, 0.135 * s, 0.01)
        # body: a keel below, a low pyramid on the back
        for tri in ((bl, nb, ns), (bl, ns, ls), (bl, ls, ts), (bl, ts, tb), (top, ls, ns), (top, ts, ls)):
            fold.face(tri, col, back, ref=inside)
        # neck and tail: narrow slivers folded along their leading edge
        fold.face((nb, nt, ns), col, back, hint=(0.25, s, -0.1))
        fold.face((tb, tt, ts), col, back, hint=(-0.25, s, -0.1))
        # head: the tip of the neck reverse-folded forwards
        hs = tuple(a + (b - a) * 0.26 for a, b in zip(nt, (ns[0], ns[1] * 1.5, ns[2])))
        fold.face((nt, beak, hs), col, back, hint=(0.1, s, 0.2))
        # wing: two facets either side of a shallow crease from the root to the tip
        tip = (-0.07 + sweep, s * (0.1 + math.cos(wing) * 0.76), 0.02 + math.sin(wing) * 0.76)
        root_f, root_b = (0.27, 0.05 * s, -0.01), (-0.3, 0.05 * s, -0.01)
        mid = (-0.02, s * (0.1 + 0.2 * math.cos(wing)), 0.05 + 0.2 * math.sin(wing))
        fold.face((root_f, tip, mid), col, back, hint=(0, 0, 1))
        fold.face((mid, tip, root_b), col, back, hint=(0, 0, 1))
        fold.face((root_f, mid, ls), col, back, hint=(0, 0, 1))
        fold.face((ls, mid, root_b), col, back, hint=(0, 0, 1))
    fold.face((top, (0.17, 0.06, 0.0), (0.17, -0.06, 0.0)), col, back, ref=inside)
    fold.face((top, (-0.17, 0.06, 0.0), (-0.17, -0.06, 0.0)), col, back, ref=inside)


def _boat(fold, col, back, sail=None):
    """The classic paper boat: length 1 along x, keel on z = 0."""
    bow, stern = (0.52, 0.0, 0.25), (-0.52, 0.0, 0.25)
    kf, k0, kb = (0.27, 0.0, 0.0), (0.0, 0.0, -0.01), (-0.27, 0.0, 0.0)
    inside = (0.0, 0.0, 0.14)
    for s in (1.0, -1.0):
        g = (0.0, 0.185 * s, 0.17)
        for tri in ((bow, kf, g), (kf, k0, g), (k0, kb, g), (kb, stern, g)):
            fold.face(tri, col, back, ref=inside)
    apex, sx, sy = (0.0, 0.0, 0.56), 0.215, 0.05
    base = ((sx, 0.0, 0.1), (0.0, sy, 0.085), (-sx, 0.0, 0.1), (0.0, -sy, 0.085))
    for i in range(4):
        fold.face((apex, base[i], base[(i + 1) % 4]), sail or col, back, ref=(0.0, 0.0, 0.2))


def _miura(fold, nx, ny, a, b, zig, height, col, back, rng):
    """A Miura-ori pleated sheet centred on the origin: crests run along x and zigzag in y."""
    xs = [a * (i - nx / 2) for i in range(nx + 1)]
    ys, zs = [], []
    y = 0.0
    for j in range(ny + 1):
        env = 0.72 + 0.28 * math.sin(math.pi * j / ny) + rng.uniform(-0.08, 0.08)
        zs.append(height * env if j % 2 else 0.0)
        ys.append(y)
        y += b * (1.0 + rng.uniform(-0.12, 0.12))
    y0 = ys[-1] / 2
    pt = lambda i, j: (xs[i], ys[j] - y0 + (zig if i % 2 else 0.0), zs[j])
    for j in range(ny):
        for i in range(nx):
            fold.face((pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1)), col, back, hint=(0, 0, 1))
    return [ys[j] - y0 + zig / 2 for j in range(ny + 1)], zs


def _mountain(fold, rng, pos, radius, height, col, snow, back, n=6, snowline=0.34):
    """A folded peak: ridges and valleys alternate around the summit; the snow cap is the pale
    reverse of the sheet, with a zigzag edge."""
    cx, cy, cz = pos
    apex = Vector((cx + rng.uniform(-0.08, 0.08) * radius, cy + rng.uniform(-0.05, 0.05) * radius, cz + height))
    a0 = rng.uniform(0, math.tau)
    ring, snows = [], []
    for k in range(2 * n):
        ang = a0 + math.tau * (k + rng.uniform(-0.22, 0.22)) / (2 * n)
        r = radius * (rng.uniform(0.92, 1.1) if k % 2 == 0 else rng.uniform(0.62, 0.76))
        p = Vector((cx + r * math.cos(ang), cy + r * 0.9 * math.sin(ang), cz))
        t = snowline * (rng.uniform(1.0, 1.25) if k % 2 == 0 else rng.uniform(0.5, 0.7))
        ring.append(p)
        snows.append(apex + (p - apex) * t)
    inside = (cx, cy, cz + height * 0.2)
    for k in range(2 * n):
        k2 = (k + 1) % (2 * n)
        fold.face((apex, snows[k], snows[k2]), snow, back, ref=inside)
        fold.face((snows[k], ring[k], ring[k2], snows[k2]), col, back, ref=inside)


def _fir(fold, rng, pos, height, radius, col, back, trunk, tiers=3, n=5):
    """A folded fir: stacked star-shaped paper cones on a small trunk."""
    x, y, z = pos
    th = height * 0.14
    for k in range(4):                                        # trunk: a square paper tube
        a, b = math.tau * k / 4 + 0.6, math.tau * (k + 1) / 4 + 0.6
        r = radius * 0.13
        p, q = (x + r * math.cos(a), y + r * math.sin(a)), (x + r * math.cos(b), y + r * math.sin(b))
        fold.face(((p[0], p[1], z), (q[0], q[1], z), (q[0], q[1], z + th * 1.6), (p[0], p[1], z + th * 1.6)), trunk, back, ref=(x, y, z + th))
    a0 = rng.uniform(0, math.tau)
    for t in range(tiers):
        f0, f1 = t / tiers, (t + 1) / tiers
        zb = z + th + (height - th) * f0 * 0.78
        zt = z + th + (height - th) * min(1.0, f1 * 0.78 + 0.3)
        r = radius * (1.0 - 0.27 * t)
        apex = (x, y, zt)
        ring = []
        for k in range(2 * n):
            ang = a0 + t * 0.5 + math.tau * k / (2 * n)
            rr = r * (1.0 if k % 2 == 0 else 0.56)
            ring.append((x + rr * math.cos(ang), y + rr * math.sin(ang), zb + (0.0 if k % 2 == 0 else 0.05 * height)))
        for k in range(2 * n):
            fold.face((apex, ring[k], ring[(k + 1) % (2 * n)]), col, back, ref=(x, y, zb), shade=1.0 - 0.05 * t)


def _relief(fold, rng, side, ramp, back, accents):
    """A square sheet pleated into pyramids on a quadtree grid — big, medium and small cells —
    whose apexes lean along a smooth field, so the facet values drift across the sheet.
    Lies in the XZ plane, facing -y; the flat margin of the sheet is left around the pleats."""
    cells = []

    def split(x, z, s, depth):
        u, v = (x + s / 2) / side + 0.5, (z + s / 2) / side + 0.5
        d = math.hypot(u - 0.82, v - 0.2)                        # the dense corner
        chance = (1.2 - 1.35 * d) if depth == 0 else (0.85 - 1.5 * d)
        if depth < 2 and rng.random() < chance:
            for dx in (0, 1):
                for dz in (0, 1):
                    split(x + dx * s / 2, z + dz * s / 2, s / 2, depth + 1)
        else:
            cells.append((x, z, s, depth, u, v))

    n0 = 4
    for i in range(n0):
        for j in range(n0):
            split(-side / 2 + i * side / n0, -side / 2 + j * side / n0, side / n0, 0)
    turn = rng.uniform(0, math.tau)
    smalls = [k for k, cell in enumerate(cells) if cell[3] == 2]
    marked = dict(zip(rng.sample(smalls, min(len(accents) * 3, len(smalls))), accents * 3)) if smalls else {}
    for k, (x, z, s, depth, u, v) in enumerate(cells):
        ang = turn + 2.6 * u + 1.9 * v
        lean = 0.26 * s
        apex = (x + s / 2 + lean * math.cos(ang), -s * (0.4, 0.46, 0.5)[depth], z + s / 2 + lean * math.sin(ang))
        t = min(1.0, max(0.0, 0.5 + 0.7 * ((1 - u) - v) + rng.uniform(-0.05, 0.05)))
        col = marked.get(k) or ramp(t)
        corners = ((x, 0.0, z), (x + s, 0.0, z), (x + s, 0.0, z + s), (x, 0.0, z + s))
        for q in range(4):
            fold.face((apex, corners[q], corners[(q + 1) % 4]), col, back, hint=(0, -1, 0))
    m, h = side * 0.045, side / 2
    edge = ramp(0.5)
    for quad in (((-h - m, -h - m), (h + m, -h - m), (h + m, -h), (-h - m, -h)), ((-h - m, h), (h + m, h), (h + m, h + m), (-h - m, h + m)),
                 ((-h - m, -h), (-h, -h), (-h, h), (-h - m, h)), ((h, -h), (h + m, -h), (h + m, h), (h, h))):
        fold.face([(qx, 0.0, qz) for qx, qz in quad], edge, back, hint=(0, -1, 0))


# ----------------------------------------------------------------------------- colour ramp (OKLCH)
def _to_oklch(h):
    r, g, b = (C.srgb_to_linear(v) for v in C.hex_to_rgb(h))
    l = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) ** (1 / 3)
    m = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) ** (1 / 3)
    s = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b) ** (1 / 3)
    L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
    a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
    b_ = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    return L, math.hypot(a, b_), math.atan2(b_, a)


def _from_oklch(L, c, h):
    def rgb(c_):
        a, b_ = c_ * math.cos(h), c_ * math.sin(h)
        l = (L + 0.3963377774 * a + 0.2158037573 * b_) ** 3
        m = (L - 0.1055613458 * a - 0.0638541728 * b_) ** 3
        s = (L - 0.0894841775 * a - 1.2914855480 * b_) ** 3
        return (4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)
    out = rgb(c)
    for _ in range(40):
        if all(-0.001 <= v <= 1.001 for v in out):
            break
        c *= 0.94
        out = rgb(c)

    def enc(v):
        v = min(1.0, max(0.0, v))
        return 12.92 * v if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055
    return '#' + ''.join('%02x' % round(255 * enc(v)) for v in out)


def _ramp(stops):
    """Blend hex colours in OKLCH (hue the short way round) so the in-between papers stay clean."""
    lch = [_to_oklch(h) for h in stops]

    def at(t):
        x = min(max(t, 0.0), 1.0) * (len(lch) - 1)
        i = min(int(x), len(lch) - 2)
        f = x - i
        (L0, c0, h0), (L1, c1, h1) = lch[i], lch[i + 1]
        if c0 < 0.03:
            h0 = h1
        if c1 < 0.03:
            h1 = h0
        dh = (h1 - h0 + math.pi) % math.tau - math.pi
        return _from_oklch(L0 + (L1 - L0) * f, c0 + (c1 - c0) * f, h0 + dh * f)
    return at


# ----------------------------------------------------------------------------- set
def _backdrop_material(bg, sun_dir, ambient, ref_cos):
    """Matte sweep in the palette background. The sun is set for the floor; where the sheet turns
    away from it (the wall) a little emission makes up the difference, so floor, bend and wall
    all come out at the same colour and shadows still read."""
    mat = C.material('Backdrop', bg, roughness=0.95, specular=0.0)
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    L = -Vector(sun_dir).normalized()
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    dot = nt.nodes.new('ShaderNodeVectorMath')
    dot.operation = 'DOT_PRODUCT'
    dot.inputs[1].default_value = L
    nt.links.new(geo.outputs['Normal'], dot.inputs[0])
    k = nt.nodes.new('ShaderNodeMath')            # ambient + (1 - ambient) * cos / ref_cos
    k.operation = 'MULTIPLY_ADD'
    k.inputs[1].default_value = (1.0 - ambient) / ref_cos
    k.inputs[2].default_value = ambient
    cl = nt.nodes.new('ShaderNodeMath')
    cl.operation = 'MAXIMUM'
    cl.inputs[1].default_value = 0.0
    nt.links.new(dot.outputs['Value'], cl.inputs[0])
    nt.links.new(cl.outputs[0], k.inputs[0])
    inv = nt.nodes.new('ShaderNodeMath')            # what is missing: max(0, 1 - k)
    inv.operation = 'SUBTRACT'
    inv.use_clamp = True
    inv.inputs[0].default_value = 1.0
    nt.links.new(k.outputs[0], inv.inputs[1])
    scale = nt.nodes.new('ShaderNodeVectorMath')
    scale.operation = 'SCALE'
    scale.inputs[0].default_value = C.col(bg)[:3]
    nt.links.new(inv.outputs[0], scale.inputs['Scale'])
    for name in ('Emission Color', 'Emission'):
        if bsdf.inputs.get(name) is not None:
            nt.links.new(scale.outputs['Vector'], bsdf.inputs[name])
            break
    C._set(bsdf, 'emission_strength', 1.0)
    return mat


def _light(sun_dir, ambient, ref_cos, shadow):
    C.set_world('#ffffff', ambient)
    C.add_sun(sun_dir, strength=(1.0 - ambient) * math.pi / ref_cos, angle=shadow, color='#fffaf2')


def _fit(ctx, points, direction, fov, margin=1.06, lift=0.0):
    """Centre the subject (as the camera sees it) on the origin by moving the whole set, then fit
    its on-screen width and height into the art rectangle."""
    d = Vector(direction).normalized()
    right = Vector((0, 0, 1)).cross(d).normalized()
    up = d.cross(right).normalized()
    xs = [p.dot(right) for p in points]
    ys = [p.dot(up) for p in points]
    off = right * ((min(xs) + max(xs)) / 2) + up * ((min(ys) + max(ys)) / 2 + lift)
    for ob in bpy.data.objects:
        if ob.parent is None and ob.type != 'CAMERA':
            ob.location = Vector(ob.location) - off
    w, h = (max(xs) - min(xs)) * margin, (max(ys) - min(ys)) * margin
    ctx.frame(width=w, height=h, fov=fov, direction=tuple(d))


# ----------------------------------------------------------------------------- build
def build(ctx):
    rng, pal, p = ctx.rng, ctx.palette, ctx.params
    mirror = bool(ctx.mirror)
    flip = -1.0 if mirror else 1.0
    motif = str(p.get('motif', 'cranes')).lower()
    grain = float(p.get('grain', 1.0))
    shadow = float(p.get('shadow', 14.0))
    c = [ctx.color(i) for i in range(4)]
    light = max(ctx.colors + [pal['bg']], key=C.luminance)
    if str(p.get('reverse', 'white')).lower() == 'tone':
        white = C.mix_hex(c[0], '#ffffff', 0.62)
    else:
        white = C.mix_hex(light, '#ffffff', 0.8)
    paper = _paper_material(grain)
    fold = Folded(rng)

    if motif in ('boats', 'peaks'):
        # ---- on a seamless sweep, lit from above
        sun_dir = (0.36 * flip, 0.4, -0.84)
        ambient = 0.54
        ref_cos = -Vector(sun_dir).normalized().z
        C.add_backdrop(_backdrop_material(pal['bg'], sun_dir, ambient, ref_cos), floor_z=0.0, wall_y=3.4, radius=2.4)
        _light(sun_dir, ambient, ref_cos, shadow)
        if motif == 'boats':
            view = (0.0, -1.0, 0.68)
            sea = c[1] if C.luminance(c[1]) > 0.1 else C.mix_hex(c[1], '#ffffff', 0.22)
            fold.m = _place((0, 0, 0), yaw=math.radians(-16), mirror=mirror)
            rows, zs = _miura(fold, 9, 13, 0.25, 0.15, 0.105, 0.15, sea, white, rng)
            crest = max(zs)
            boats = [((-0.1, -0.3), 1.0, 26, c[0]), ((0.62, 0.52), 0.52, -16, c[2]), ((-0.7, 0.62), 0.36, 44, c[3])]
            for (bx, by), s, yaw, col in boats:
                fold.m = _place((bx, by, crest * 0.6), yaw=math.radians(yaw + rng.uniform(-5, 5)), roll=math.radians(rng.uniform(-5, 5)),
                                pitch=math.radians(rng.uniform(-3, 4)), scale=s, mirror=mirror)
                _boat(fold, col, white, sail=white)
        else:
            view = (0.0, -1.0, 0.5)
            fold.m = _place((0, 0, 0), mirror=mirror)
            peaks = [((-0.08, 0.5, 0), 0.8, 1.38, c[2]), ((0.74, 0.74, 0), 0.6, 0.98, c[0]), ((-0.9, 0.8, 0), 0.5, 0.76, c[0])]
            for pos, r, h, col in peaks:
                _mountain(fold, rng, pos, r, h, col, white, white, n=5 if r < 0.7 else 6, snowline=0.4)
            dark = min(c, key=C.luminance)
            trunk = C.mix_hex(dark, '#3a2a20', 0.55)
            spots = [(-0.86, -0.1, 0.66), (-0.56, -0.3, 0.46), (-1.14, -0.34, 0.38), (0.56, -0.26, 0.54), (0.88, -0.06, 0.38), (0.2, -0.5, 0.3), (1.14, -0.38, 0.27)]
            for k, (x, y, h) in enumerate(spots):
                _fir(fold, rng, (x + rng.uniform(-0.04, 0.04), y + rng.uniform(-0.04, 0.04), 0.0), h * rng.uniform(0.92, 1.08), h * 0.37,
                     c[3] if k not in (1, 4) else c[1], white, trunk)
        fold.build('Origami', paper)
        _fit(ctx, fold.points(), view, 20, margin=1.1)
        return

    # ---- in front of a wall
    raking = motif == 'relief'
    sun_dir = (0.62 * flip, 0.5, -0.62) if raking else (0.36 * flip, 0.7, -0.62)
    ambient = 0.6 if raking else 0.55
    ref_cos = Vector(sun_dir).normalized().y
    wall = C.add_plane(240, C.material('Wall', pal['bg'], roughness=0.95, specular=0.0))
    wall.rotation_euler = (math.radians(90), 0, 0)
    _light(sun_dir, ambient, ref_cos, shadow)

    if raking:
        ramp = _ramp([c[0], C.mix_hex(c[0], white, 0.86)])
        fold.m = _place((0, 0, 0), yaw=math.radians(-6), mirror=mirror)
        _relief(fold, rng, 2.0, ramp, white, [c[1]])
        fold.build('Origami', paper)
        wall.location = (0, 0.14, 0)
        ctx.frame(width=2.75, height=2.75, fov=18, direction=(0.0, -1.0, 0.0))
        return

    # cranes: one hero and a few followers, flying up towards the copy
    flock = [((-0.2, 0.0, -0.3), 1.0, 30, 15, -6, 0.52, c[0]),
             ((0.74, 0.14, 0.44), 0.5, 40, 10, 6, 0.3, c[1]),
             ((0.9, 0.06, -0.62), 0.34, 22, 20, -4, 0.62, c[2]),
             ((-0.36, 0.2, 0.88), 0.3, 46, 9, 8, 0.4, c[3]),
             ((0.3, 0.24, 1.08), 0.2, 30, 14, -6, 0.5, c[0])]
    for pos, s, yaw, pitch, roll, wing, col in flock:
        fold.m = _place(pos, yaw=math.pi + math.radians(yaw + rng.uniform(-6, 6)), pitch=math.radians(pitch + rng.uniform(-4, 4)),
                        roll=math.radians(roll), scale=s, mirror=mirror)
        _crane(fold, col, white, wing=wing + rng.uniform(-0.06, 0.06))
    ob = fold.build('Origami', paper)
    pts = fold.points()
    cx = (min(q.x for q in pts) + max(q.x for q in pts)) / 2
    cz = (min(q.z for q in pts) + max(q.z for q in pts)) / 2
    reach = max(math.hypot(q.x - cx, q.z - cz) for q in pts)
    k = 1.3 / reach
    ob.scale = (k, k, k)
    ob.location = (-cx * k, 0.0, -cz * k)
    wall.location = (0, max(q.y for q in pts) * k + 0.26, 0)
    ctx.frame(radius=1.34, fov=20, direction=(0.0, -1.0, 0.04))
