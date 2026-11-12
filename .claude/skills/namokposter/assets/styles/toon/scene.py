"""Toon — cel-shaded 3D with ink outlines.

The technique: every surface is drawn in two or three perfectly flat tone bands (a Toon BSDF lit by
one hard sun over a flat emission "shadow" tone — no bounce light, so there are no gradients at
all), and every form gets a coloured contour from an inverted hull: a slightly larger copy of the
mesh, turned inside out, of which only the far side shows. Cast shadows are flat shapes too, and
the backdrop is the literal poster colour.

What is drawn is the ``motif``: desk (a still life), hills (a small landscape), blocks (stacked
solids). Palette: ``bg`` = backdrop, ``ink`` = the outline colour, ``colors`` = five object colours
(warm, light, green, cool, pale), ``accent`` = small highlights.
"""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector

import common as C

SUN_E = 2.0 * math.pi          # sun strength: with it, a size-1 toon band adds exactly its colour
A_MID, A_HI = 0.82, 0.46       # toon cone sizes (x 90 degrees): end of the lit band, end of the highlight
LINE = 0.0135                  # outline width in world units (about 9 px at 4K)


# ----------------------------------------------------------------------------- colour (OKLCH)
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


def _turn(h, target_deg, amount_deg):
    """Rotate hue ``h`` (radians) towards ``target_deg`` by at most ``amount_deg``."""
    d = (math.radians(target_deg) - h + math.pi) % math.tau - math.pi
    return h + max(-math.radians(amount_deg), min(math.radians(amount_deg), d))


def shade(h, k=1.0):
    """The shadow tone of a colour: darker, a little more saturated, hue pulled towards violet."""
    L, c, hue = _to_oklch(h)
    return _from_oklch(max(0.1, L - (0.115 + 0.07 * L) * k), min(0.33, c * 1.1 + 0.02 * k), _turn(hue, 285, 16 * k) if c > 0.02 else math.radians(285))


def tint(h, k=1.0):
    """The highlight tone: lighter, slightly paler, hue pulled towards warm yellow."""
    L, c, hue = _to_oklch(h)
    return _from_oklch(min(0.985, L + 0.075 * k + 0.05 * (1 - L) * k), c * 0.86, _turn(hue, 95, 9 * k) if c > 0.02 else hue)


def mix(a, b, t):
    (L0, c0, h0), (L1, c1, h1) = _to_oklch(a), _to_oklch(b)
    if c0 < 0.03:
        h0 = h1
    if c1 < 0.03:
        h1 = h0
    dh = (h1 - h0 + math.pi) % math.tau - math.pi
    return _from_oklch(L0 + (L1 - L0) * t, c0 + (c1 - c0) * t, h0 + dh * t)


def _fit_view(ctx, P, direction, fov, margin=1.05):
    """Where the camera of ``ctx.frame(width, height, fov, direction)`` will see the points ``P``
    (N x 3, world): returns the shift that centres them on the layout focus and their on-screen
    width and height, in true perspective (near things are bigger than an orthographic guess)."""
    d = Vector(direction).normalized()
    right = (-d).cross(Vector((0, 0, 1))).normalized()
    up = right.cross(-d)
    axes = np.array([tuple(right), tuple(up)]).T
    dv = np.array(tuple(d))
    x0, y0, x1, y1 = ctx.art_rect
    shift = np.zeros(3)
    dist, width, height = None, 1.0, 1.0
    for _ in range(5):
        Q = P - shift
        k = 1.0 if dist is None else (dist / np.maximum(dist * 0.2, dist - Q @ dv))[:, None]
        S = (Q @ axes) * k
        lo, hi = S.min(0), S.max(0)
        mid = (lo + hi) / 2
        shift = shift + np.array(tuple(right)) * mid[0] + np.array(tuple(up)) * mid[1]
        width, height = float(hi[0] - lo[0]) * margin, float(hi[1] - lo[1]) * margin
        ppu = min((x1 - x0) * ctx.width * ctx.fill / width, (y1 - y0) * ctx.height * ctx.fill / height)
        dist = min(ctx.width, ctx.height) / (2.0 * ppu * math.tan(math.radians(fov) / 2))
    return Vector(shift), width, height


# ----------------------------------------------------------------------------- the toon kit
class Toon:
    def __init__(self, ctx):
        self.ctx, self.rng, self.pal = ctx, ctx.rng, ctx.palette
        p = ctx.params
        self.bands = 2 if int(p.get('bands', 3)) <= 2 else 3
        self.line_w = LINE * max(0.0, float(p.get('outline', 1.0)))
        self.flip = -1.0 if ctx.mirror else 1.0
        self.dark = C.luminance(self.pal['bg']) < 0.18
        self.line = self.pal['ink']
        self._mats, self._ink, self._floor = {}, [], None
        self.c = [ctx.color(i) for i in range(5)]
        self.accent = self.pal['accent']
        self.cream = mix(self.c[4], '#fff8ea', 0.6)
        # light travels from the copy side, upper front, towards the far lower side
        self.sun_dir = Vector((0.5 * self.flip, 0.45, -0.9)).normalized()

        cy = ctx.scene.cycles
        cy.max_bounces = cy.diffuse_bounces = cy.glossy_bounces = 0     # direct light only: bands stay flat
        cy.transparent_max_bounces = 64                                 # the hulls are see-through from outside
        cy.use_denoising = False                                        # nothing to denoise; it would eat the lines
        try:
            cy.adaptive_min_samples = 12
            cy.use_light_tree = False
            cy.pixel_filter_type = 'BLACKMAN_HARRIS'
            cy.filter_width = 1.5
        except Exception:
            pass
        ctx.set_view('Standard')
        self._world()
        C.add_sun(tuple(self.sun_dir), strength=SUN_E, angle=0.4)

    # -- set ---------------------------------------------------------------------
    def _world(self):
        """Camera rays see the flat backdrop colour; the world lights nothing."""
        world = bpy.data.worlds.new('World')
        self.ctx.scene.world = world
        try:
            world.use_nodes = True
        except Exception:
            pass
        nt = world.node_tree
        nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputWorld')
        bg = nt.nodes.new('ShaderNodeBackground')
        lp = nt.nodes.new('ShaderNodeLightPath')
        bg.inputs['Color'].default_value = C.col(self.pal['bg'])
        nt.links.new(lp.outputs['Is Camera Ray'], bg.inputs['Strength'])
        nt.links.new(bg.outputs[0], out.inputs[0])

    def _node_mat(self, name):
        mat = bpy.data.materials.new(name)
        try:
            mat.use_nodes = True
        except Exception:
            pass
        nt = mat.node_tree
        nt.nodes.clear()
        return mat, nt, nt.nodes.new('ShaderNodeOutputMaterial')

    def _banded(self, name, tones, sizes):
        """Flat tone bands: tones[0] everywhere, tones[i] added inside the toon cone sizes[i-1]."""
        mat, nt, out = self._node_mat(name)
        lin = [C.col(t)[:3] for t in tones]
        em = nt.nodes.new('ShaderNodeEmission')
        em.inputs['Color'].default_value = (*lin[0], 1.0)
        cur = em.outputs[0]
        for prev, nxt, size in zip(lin[:-1], lin[1:], sizes):
            k = 1.0 - math.cos(size * math.pi / 2)
            tb = nt.nodes.new('ShaderNodeBsdfToon')
            tb.component = 'DIFFUSE'
            tb.inputs['Color'].default_value = (*[max(0.0, (b - a) * k) for a, b in zip(prev, nxt)], 1.0)
            tb.inputs['Size'].default_value = size
            tb.inputs['Smooth'].default_value = 0.0
            add = nt.nodes.new('ShaderNodeAddShader')
            nt.links.new(cur, add.inputs[0])
            nt.links.new(tb.outputs[0], add.inputs[1])
            cur = add.outputs[0]
        nt.links.new(cur, out.inputs[0])
        return mat

    def cel(self, colour, bands=None, soft=1.0):
        """Cel material for an object colour: shadow, base and (with three bands) highlight."""
        bands = bands or self.bands
        key = ('cel', colour, bands, soft)
        if key not in self._mats:
            tones, sizes = [shade(colour, soft), colour], [A_MID]
            if bands >= 3:
                tones.append(tint(colour, soft))
                sizes.append(A_HI)
            self._mats[key] = self._banded('Cel', tones, sizes)
        return self._mats[key]

    def ground(self, colour, k=0.62):
        """A surface that is one flat colour except where a shadow falls on it."""
        key = ('ground', colour, k)
        if key not in self._mats:
            self._mats[key] = self._banded('Ground', [shade(colour, k), colour], [1.0])
        return self._mats[key]

    def flat(self, colour):
        key = ('flat', colour)
        if key not in self._mats:
            self._mats[key] = C.emission_material('Flat', colour, 1.0)
        return self._mats[key]

    def floor(self, z, spot=None, spot_r=1.6, spot_at=(0.0, 0.0), squash=1.0):
        self._floor = C.add_plane(600.0, self.ground(self.pal['bg']), location=(0.0, 0.0, z))
        self.floor_z = z
        if spot:
            C.add_cylinder(spot_r, 0.004, 0.0, self.ground(spot, 0.8), location=(spot_at[0], spot_at[1], z + 0.003), scale=(1.0, squash, 1.0))

    # -- outlines ----------------------------------------------------------------
    def ink(self, ob, w=1.0):
        """Mark an object (or a list of them) for a contour line; returns it."""
        for o in (ob if isinstance(ob, (list, tuple)) else [ob]):
            self._ink.append((o, w))
        return ob

    def _hull_material(self):
        mat, nt, out = self._node_mat('Ink')
        geo = nt.nodes.new('ShaderNodeNewGeometry')
        lp = nt.nodes.new('ShaderNodeLightPath')
        em = nt.nodes.new('ShaderNodeEmission')
        em.inputs['Color'].default_value = C.col(self.line)
        tr = nt.nodes.new('ShaderNodeBsdfTransparent')
        cam = nt.nodes.new('ShaderNodeMath')
        cam.operation = 'SUBTRACT'                       # 1 - is camera ray
        cam.inputs[0].default_value = 1.0
        nt.links.new(lp.outputs['Is Camera Ray'], cam.inputs[1])
        mx = nt.nodes.new('ShaderNodeMath')
        mx.operation = 'MAXIMUM'
        nt.links.new(geo.outputs['Backfacing'], mx.inputs[0])
        nt.links.new(cam.outputs[0], mx.inputs[1])
        ms = nt.nodes.new('ShaderNodeMixShader')
        nt.links.new(mx.outputs[0], ms.inputs['Fac'])
        nt.links.new(em.outputs[0], ms.inputs[1])
        nt.links.new(tr.outputs[0], ms.inputs[2])
        nt.links.new(ms.outputs[0], out.inputs[0])
        return mat

    def fit(self, direction, fov, margin=1.05, shadow=0.55):
        """Measure what was built as the camera will see it (objects and part of their cast shadows),
        move everything so the middle of that sits on the origin, and return its on-screen size."""
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        inked = {o for o, _ in self._ink}
        sun = np.array(self.sun_dir)
        pts = []
        for ob in self.ctx.scene.objects:
            if ob.type not in ('MESH', 'CURVE') or ob is self._floor:
                continue
            try:
                me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
            except Exception:
                continue
            co = np.empty(len(me.vertices) * 3)
            me.vertices.foreach_get('co', co)
            bpy.data.meshes.remove(me)
            mw = np.array(ob.matrix_world)
            P = co.reshape(-1, 3) @ mw[:3, :3].T + mw[:3, 3]
            if not len(P):
                continue
            pts.append(P)
            if ob in inked and shadow > 0:                    # where (part of) its shadow lands on the floor
                pts.append(P + sun * (shadow * (self.floor_z - P[:, 2:3]) / sun[2]))
        shift, width, height = _fit_view(self.ctx, np.concatenate(pts), direction, fov, margin)
        for ob in self.ctx.scene.objects:
            if ob.parent is None and ob.type in ('MESH', 'CURVE', 'EMPTY', 'LIGHT'):
                ob.location = ob.location - shift
        return width, height

    def finish(self):
        """Build the inverted hulls: every inked mesh again, pushed out along its normals by the line
        width and turned inside out, all in one object that casts no shadow."""
        if self.line_w <= 0 or not self._ink:
            return
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        big = bmesh.new()
        for ob, w in self._ink:
            try:
                me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
            except Exception:
                continue
            mw = ob.matrix_world.copy()
            me.transform(mw)
            bm = bmesh.new()
            bm.from_mesh(me)
            bpy.data.meshes.remove(me)
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
            if mw.determinant() < 0:
                bmesh.ops.reverse_faces(bm, faces=bm.faces)
            bm.normal_update()
            width = self.line_w * w
            for v in bm.verts:
                try:
                    f = min(2.2, v.calc_shell_factor())
                except Exception:
                    f = 1.0
                v.co += v.normal * (width * f)
            bmesh.ops.reverse_faces(bm, faces=bm.faces)
            tmp = bpy.data.meshes.new('tmp')
            bm.to_mesh(tmp)
            bm.free()
            big.from_mesh(tmp)
            bpy.data.meshes.remove(tmp)
        hull = C.finish_mesh('InkHull', big, False, self._hull_material())
        for attr in ('visible_shadow', 'visible_diffuse', 'visible_glossy', 'visible_transmission'):
            try:
                setattr(hull, attr, False)
            except Exception:
                pass

    # -- shapes ------------------------------------------------------------------
    def rod(self, p0, p1, r, mat, r1=None, ink=1.0, segments=24):
        """A straight round bar from p0 to p1 (optionally tapering to r1)."""
        a, b = Vector(p0), Vector(p1)
        d = b - a
        ob = C.add_lathe([(0, 0), (r, 0), (r if r1 is None else r1, d.length), (0, d.length)], mat, segments=segments, name='Rod', location=tuple(a))
        ob.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
        return self.ink(ob, ink) if ink else ob

    def leaf(self, base, tip, width, mat, thick=0.16, twist=0.0, ink=0.85):
        b, t = Vector(base), Vector(tip)
        d = t - b
        ob = C.add_icosphere(0.5, 3, mat, location=tuple((b + t) / 2), scale=(width, width * thick, d.length))
        ob.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
        ob.rotation_euler.rotate_axis('Z', twist)
        return self.ink(ob, ink)

    def squiggle(self, pts, r, colour):
        cu = bpy.data.curves.new('Squiggle', 'CURVE')
        cu.dimensions = '3D'
        cu.bevel_depth = r
        cu.bevel_resolution = 3
        cu.use_fill_caps = True
        sp = cu.splines.new('NURBS')
        sp.points.add(len(pts) - 1)
        for p, q in zip(sp.points, pts):
            p.co = (q[0], q[1], q[2], 1.0)
        sp.use_endpoint_u = True
        sp.order_u = min(4, len(pts))
        cu.materials.append(self.flat(colour))
        ob = bpy.data.objects.new('Squiggle', cu)
        bpy.context.scene.collection.objects.link(ob)
        return ob


# ----------------------------------------------------------------------------- motif: desk still life
def _book(T, w, d, h, colour, loc, rz):
    t, ts = 0.024, 0.034
    outline = [(-w / 2, 0), (w / 2, 0), (w / 2, t), (-w / 2 + ts, t), (-w / 2 + ts, h - t), (w / 2, h - t), (w / 2, h), (-w / 2, h)]
    cover = C.add_extrusion(outline, d, 0.006, T.cel(colour), name='Cover')
    pages = C.add_box((w - ts - 0.035, d - 0.05, h - 2 * t + 0.004), 0.0, T.cel(T.cream, 2), location=((ts - 0.035) / 2, 0.0, h / 2))
    T.ink(cover)
    T.ink(pages, 0.55)
    # a ribbon marker and a label band on the spine side
    C.group([cover, pages], 'Book', location=loc, rotation=(0, 0, rz))
    return loc[2] + h


def desk(T):
    rng, c, F = T.rng, T.c, -0.98
    T.floor(F, spot=mix(T.pal['bg'], c[4], 0.45 if not T.dark else 0.3), spot_r=1.5, spot_at=(0.0, 0.0), squash=0.8)

    # --- stack of books with a mug on top
    bx, by = -0.05, -0.3
    z = _book(T, 1.08, 0.74, 0.17, c[3], (bx, by, F), math.radians(7))
    z = _book(T, 0.96, 0.68, 0.14, c[0], (bx + 0.03, by + 0.01, z), math.radians(-6))
    z = _book(T, 0.82, 0.6, 0.12, c[1], (bx - 0.03, by, z), math.radians(13))
    mx, my = bx - 0.02, by + 0.0
    mug = C.add_lathe(C.fillet_profile([(0, 0), (0.175, 0), (0.205, 0.04), (0.205, 0.33), (0.18, 0.33), (0.18, 0.06), (0, 0.06)], 0.012),
                      T.cel(c[4]), location=(mx, my, z))
    T.ink(mug)
    C.add_cylinder(0.181, 0.01, 0.0, T.flat(mix(T.accent, '#3a2018', 0.72)), location=(mx, my, z + 0.285))
    T.ink(C.add_torus(0.105, 0.03, T.cel(c[4]), major_segments=48, minor_segments=16, location=(mx + 0.2, my - 0.03, z + 0.17),
                      rotation=(math.radians(90), 0, math.radians(-12))))
    T.ink(C.add_cylinder(0.207, 0.07, 0.0, T.cel(T.accent, 2), location=(mx, my, z + 0.15)), 0.0)   # painted band
    for i, sx in enumerate((-0.06, 0.07)):                 # two curls of steam, drawn in the line colour
        s0 = z + 0.42 + 0.05 * i
        T.squiggle([(mx + sx, my, s0), (mx + sx + 0.05, my, s0 + 0.09), (mx + sx - 0.05, my, s0 + 0.2), (mx + sx + 0.03, my, s0 + 0.31)], 0.011, T.line)

    # --- desk lamp, back and to the side
    lx, ly = -0.98, 0.42
    lamp, arm = T.cel(c[1]), T.cel(c[3])
    T.ink(C.add_cylinder(0.27, 0.07, 0.02, arm, location=(lx, ly, F + 0.035)))
    elbow, head = (lx - 0.16, ly, F + 0.98), (lx + 0.36, ly - 0.04, F + 1.62)
    T.rod((lx, ly, F + 0.06), elbow, 0.03, arm)
    T.rod(elbow, head, 0.03, arm)
    T.ink(C.add_sphere(0.06, T.cel(T.accent, 2), segments=24, location=elbow))
    tilt = math.radians(118)
    shade_ob = C.add_lathe([(0, 0.0), (0.09, 0.0), (0.12, 0.06), (0.3, 0.36), (0.275, 0.36), (0.1, 0.075), (0, 0.075)], lamp,
                           location=(head[0] - 0.02, head[1], head[2] + 0.02), rotation=(0, tilt, 0))
    T.ink(shade_ob)
    hd = Vector((math.sin(tilt), 0, math.cos(tilt)))
    C.add_sphere(0.1, T.flat(mix(c[1], '#fffbe6', 0.7)), segments=24, location=tuple(Vector(head) + Vector((-0.02, 0, 0.02)) + hd * 0.24))

    # --- potted plant, back right
    px, py = 0.92, 0.38
    T.ink(C.add_lathe(C.fillet_profile([(0, 0), (0.2, 0), (0.285, 0.4), (0.31, 0.4), (0.31, 0.47), (0.25, 0.47), (0.25, 0.42), (0, 0.42)], 0.01),
                      T.cel(c[0]), location=(px, py, F)))
    C.add_cylinder(0.252, 0.01, 0.0, T.flat(shade(mix(c[0], '#3a2018', 0.6))), location=(px, py, F + 0.44))
    leafs = [T.cel(c[2]), T.cel(mix(c[2], c[1], 0.3)), T.cel(shade(c[2], 0.6))]
    base = Vector((px, py, F + 0.44))
    for i, (a, ln, yy) in enumerate([(-1.05, 0.62, 0.05), (-0.5, 0.86, -0.1), (0.0, 1.0, 0.12), (0.45, 0.84, -0.08), (0.98, 0.6, 0.06), (-0.22, 0.56, -0.22), (0.24, 0.5, -0.24)]):
        a += rng.uniform(-0.08, 0.08)
        tip = base + Vector((math.sin(a) * ln, yy, math.cos(a) * ln * 0.95))
        root = base + Vector((math.sin(a) * 0.1, yy * 0.3, 0.02))
        T.leaf(root, tip, ln * 0.4, leafs[i % 3], twist=rng.uniform(-0.25, 0.25))

    # --- small things in front: an apple, a pencil, a ball
    ax, ay = 0.84, -0.52
    T.ink(C.add_sphere(0.19, T.cel(T.accent), segments=48, location=(ax, ay, F + 0.175), scale=(1.0, 1.0, 0.9)))
    T.rod((ax, ay, F + 0.32), (ax + 0.03, ay, F + 0.42), 0.012, T.flat(T.line), ink=0)
    T.leaf((ax + 0.03, ay, F + 0.4), (ax + 0.17, ay - 0.02, F + 0.47), 0.09, T.cel(c[2]), thick=0.3, ink=0.6)
    pa = math.radians(-14)
    pdir = Vector((math.cos(pa), math.sin(pa), 0))
    p0 = Vector((-0.95, -0.82, F + 0.036))
    T.rod(p0, p0 + pdir * 0.74, 0.036, T.cel(c[1]), segments=6)
    T.rod(p0 + pdir * 0.74, p0 + pdir * 0.86, 0.036, T.cel(T.cream, 2), r1=0.008, segments=6)
    T.rod(p0 - pdir * 0.07, p0, 0.037, T.cel(c[4]), segments=6)
    T.ink(C.add_sphere(0.085, T.cel(c[3]), segments=32, location=(0.3, -0.92, F + 0.085)))


# ----------------------------------------------------------------------------- motif: hills
def _hill_z(hill, x, y):
    cx, cy, rx, ry, h = hill
    q = 1.0 - ((x - cx) / rx) ** 2 - ((y - cy) / ry) ** 2
    return h * math.sqrt(q) if q > 0 else 0.0


def hills(T):
    rng, c, F = T.rng, T.c, -0.72
    green = c[2]
    T.floor(F, spot=mix(T.pal['bg'], green, 0.24), spot_r=1.72, spot_at=(0.0, 0.0), squash=0.78)
    # a plain pale disc of a sun standing behind the hills (no rays)
    sun_col = mix(c[1], '#fff6d8', 0.35) if not T.dark else mix(c[1], '#fff6d8', 0.55)
    C.add_cylinder(0.46, 0.01, 0.0, T.flat(sun_col), location=(0.62, 1.5, F + 1.3), rotation=(math.radians(90), 0, 0))

    hills_ = [(-0.42, 0.55, 1.05, 0.8, 0.86), (0.78, 0.42, 0.82, 0.66, 0.52), (0.1, -0.35, 0.66, 0.5, 0.3)]
    tones = [green, mix(green, c[1], 0.34), mix(green, c[3], 0.3)]
    for (cx, cy, rx, ry, h), col in zip(hills_, tones):
        T.ink(C.add_sphere(1.0, T.cel(col), segments=72, location=(cx, cy, F), scale=(rx, ry, h)))

    trunk = T.cel(mix(c[0], T.line if not T.dark else '#3a2a2a', 0.55), 2)

    def ground(x, y):
        return F + max(_hill_z(h, x, y) for h in hills_)

    def lollipop(x, y, s, col):
        z = ground(x, y) - 0.02
        T.rod((x, y, z), (x, y, z + 0.34 * s), 0.028 * s, trunk, ink=0.7, segments=12)
        T.ink(C.add_sphere(0.2 * s, T.cel(col), segments=40, location=(x, y, z + 0.46 * s), scale=(1.0, 1.0, 1.12)))

    def pine(x, y, s, col):
        z = ground(x, y) - 0.02
        T.rod((x, y, z), (x, y, z + 0.16 * s), 0.026 * s, trunk, ink=0.7, segments=12)
        for i in range(3):
            T.ink(C.add_cone(0.2 * s * (1 - 0.2 * i), 0.3 * s, 0.012, T.cel(col), location=(x, y, z + (0.27 + 0.17 * i) * s)), 0.85)

    deep = shade(green, 0.9)
    lollipop(-0.86, 0.3, 1.25, c[0])
    lollipop(-0.2, 0.42, 0.95, c[1])
    pine(-0.56, 0.12, 1.2, deep)
    pine(-1.1, -0.08, 0.9, mix(deep, c[3], 0.35))
    pine(1.12, 0.2, 1.1, deep)
    pine(0.52, -0.5, 0.8, mix(deep, c[3], 0.35))
    lollipop(1.34, -0.2, 0.85, c[0])
    lollipop(-0.5, -0.62, 0.7, c[4])

    # a little house on the second hill
    hx, hy = 0.74, 0.3
    hz = ground(hx, hy) - 0.04
    T.ink(C.add_box((0.36, 0.3, 0.26), 0.0, T.cel(T.cream), location=(hx, hy, hz + 0.13)))
    roof = C.add_extrusion([(-0.23, 0.0), (0.23, 0.0), (0.0, 0.2)], 0.36, 0.0, T.cel(T.accent), name='Roof', location=(hx, hy, hz + 0.26))
    T.ink(roof)
    C.add_box((0.085, 0.01, 0.14), 0.0, T.flat(c[3]), location=(hx - 0.06, hy - 0.152, hz + 0.07))
    C.add_box((0.07, 0.01, 0.07), 0.0, T.flat(T.line), location=(hx + 0.09, hy - 0.152, hz + 0.15))
    T.ink(C.add_box((0.06, 0.06, 0.16), 0.0, T.cel(c[0]), location=(hx + 0.1, hy + 0.06, hz + 0.4)), 0.7)

    # pond in front, clouds above
    C.add_cylinder(0.34, 0.006, 0.0, T.ground(mix(c[3], '#ffffff', 0.25), 0.5), location=(-0.98, -0.62, F + 0.006), scale=(1.0, 0.62, 1.0))
    cloud = T.cel(mix(c[4], '#ffffff', 0.75) if not T.dark else mix(c[4], '#ffffff', 0.4), 2, 0.6)
    for (x, y, z, s) in [(-0.92, 0.5, F + 1.52, 1.0), (0.1, 0.9, F + 1.78, 0.72), (1.28, 0.6, F + 1.18, 0.6)]:
        for dx, dz, r in ((-0.2, 0.0, 0.15), (0.0, 0.07, 0.21), (0.21, 0.0, 0.16), (0.02, -0.03, 0.17)):
            T.ink(C.add_sphere(r * s, cloud, segments=40, location=(x + dx * s, y, z + dz * s), scale=(1.15, 0.8, 0.9)), 0.9)


# ----------------------------------------------------------------------------- motif: stacked solids
def blocks(T):
    rng, c, F = T.rng, T.c, -1.02
    T.floor(F, spot=mix(T.pal['bg'], c[1], 0.4 if not T.dark else 0.25), spot_r=1.5, spot_at=(0.05, 0.0), squash=0.78)
    # centre: slab, arch, ball
    T.ink(C.add_box((1.3, 0.78, 0.2), 0.012, T.cel(c[3]), location=(0.0, 0.05, F + 0.1), segments=2))
    T.ink(C.add_arch(0.96, 0.86, 0.22, 0.44, T.cel(c[0]), location=(0.02, 0.08, F + 0.2)))
    T.ink(C.add_sphere(0.3, T.cel(c[1]), segments=64, location=(0.02, 0.08, F + 0.2 + 0.86 + 0.29)))
    T.ink(C.add_sphere(0.1, T.cel(T.accent), segments=32, location=(0.02, -0.02, F + 0.3)))
    # left: column with a cone on top
    T.ink(C.add_cylinder(0.24, 1.2, 0.012, T.cel(c[2]), location=(-0.98, 0.25, F + 0.6)))
    T.ink(C.add_cone(0.29, 0.5, 0.012, T.cel(c[4]), location=(-0.98, 0.25, F + 1.2 + 0.25)))
    # right: steps and a tilted cube
    for i in range(3):
        T.ink(C.add_box((0.3, 0.5, 0.2 * (i + 1)), 0.008, T.cel(c[4] if i != 1 else c[1]), location=(0.88 + 0.3 * i, 0.12, F + 0.1 * (i + 1)), segments=2))
    T.ink(C.add_box(0.3, 0.008, T.cel(c[0]), location=(1.5, 0.12, F + 0.6 + 0.2), rotation=(0, 0, math.radians(28)), segments=2))
    # front: ring lying down, half ball, cylinder, small ball
    T.ink(C.add_torus(0.24, 0.085, T.cel(c[1]), major_segments=64, minor_segments=24, location=(-0.52, -0.62, F + 0.085)))
    T.ink(C.add_hemisphere(0.24, T.cel(c[2]), location=(0.62, -0.6, F)))
    T.ink(C.add_cylinder(0.13, 0.42, 0.01, T.cel(T.accent), location=(1.12, -0.5, F + 0.21)))
    T.ink(C.add_sphere(0.12, T.cel(c[3]), segments=32, location=(0.12, -0.78, F + 0.12)))
    T.ink(C.add_cone(0.17, 0.36, 0.01, T.cel(c[0]), location=(-1.2, -0.5, F + 0.18)))


MOTIFS = {'desk': desk, 'hills': hills, 'blocks': blocks}


def build(ctx):
    T = Toon(ctx)
    motif = str(ctx.params.get('motif', 'desk')).lower()
    MOTIFS.get(motif, desk)(T)
    view = (0.3 * T.flip, -1.0, 0.36)
    width, height = T.fit(view, 18)
    T.finish()
    ctx.frame(width=width, height=height, fov=18, direction=view)
