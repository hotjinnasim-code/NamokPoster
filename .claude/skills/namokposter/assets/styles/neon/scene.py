"""Neon Sign — bent glass tubes glowing with a white-hot core, standing off a wall on little
mounts, their coloured light spilling over brick, plaster or a slatted panel.

The technique is the tube and its light; ``motif`` chooses what the tubes draw:
  arcs  — abstract arcs and lines: concentric arches, a ring, a baseline and waves
  icons — a set of simple outline icons (heart, star, cocktail glass, music note, arrow …)
  frame — a double frame of tubes round the whole sheet, the copy inside it
"""
import math
import os
import tempfile

import bpy
import numpy as np
from mathutils import Vector

import common as C

TUBE = 0.0135        # tube radius
OFF = 0.07           # distance of the tube axis from the wall
WALL_Y = 0.0


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


# ----------------------------------------------------------------------------- 2D strokes
def _resample(pts, ds):
    P = np.asarray(pts, 'f8')
    seg = np.sqrt(((P[1:] - P[:-1]) ** 2).sum(1))
    cum = np.concatenate([[0.0], np.cumsum(seg)])
    n = max(2, int(round(cum[-1] / ds)) + 1)
    t = np.linspace(0.0, cum[-1], n)
    return np.stack([np.interp(t, cum, P[:, 0]), np.interp(t, cum, P[:, 1])], 1)


def _fillet(pts, r, steps=7):
    """Open polyline with every inner corner rounded — glass is bent, never creased."""
    pts = [np.array(p, 'f8') for p in pts]
    out = [pts[0]]
    for a, b, c in zip(pts[:-2], pts[1:-1], pts[2:]):
        d0, d1 = a - b, c - b
        l0, l1 = np.linalg.norm(d0), np.linalg.norm(d1)
        rr = min(r, 0.45 * l0, 0.45 * l1)
        s, e = b + d0 / l0 * rr, b + d1 / l1 * rr
        for k in range(steps + 1):
            t = k / steps
            out.append((1 - t) ** 2 * s + 2 * (1 - t) * t * b + t ** 2 * e)
    out.append(pts[-1])
    return np.array(out)


def _loop(pts, r=0.03, gap=0.045):
    """Closed outline as one tube: it starts and ends in the middle of the first side, a small gap
    apart (where the two ends turn back into the wall)."""
    pts = [np.array(p, 'f8') for p in pts]
    mid = (pts[0] + pts[1]) / 2
    d = (pts[1] - pts[0]) / np.linalg.norm(pts[1] - pts[0])
    path = [mid + d * gap / 2] + pts[1:] + [pts[0], mid - d * gap / 2]
    return _fillet(path, r)


def _arc(cx, cz, r, a0, a1, rz=None):
    n = max(8, int(abs(a1 - a0) / 4))
    rz = r if rz is None else rz
    return np.array([(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)), cz + rz * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)])


def _icon(name):
    """Outline icons in a unit box (about -0.5 .. 0.5). Returns [(points, colour slot), ...]."""
    if name == 'heart':
        t = np.linspace(0.05, math.tau - 0.05, 140)
        x = 16 * np.sin(t) ** 3
        y = 13 * np.cos(t) - 5 * np.cos(2 * t) - 2 * np.cos(3 * t) - np.cos(4 * t)
        return [(np.stack([x, y + 2.6], 1) / 34.0, 0)]
    if name == 'star':
        raw = [((0.5 if i % 2 == 0 else 0.2) * math.cos(math.pi / 2 + math.pi * i / 5), (0.5 if i % 2 == 0 else 0.2) * math.sin(math.pi / 2 + math.pi * i / 5) - 0.03) for i in range(10)]
        return [(_loop(raw[1:] + raw[:1], 0.03), 0)]
    if name == 'cocktail':
        return [(_loop([(-0.38, 0.42), (0.38, 0.42), (0.0, -0.06)], 0.035), 0),
                (np.array([(0.0, -0.13), (0.0, -0.41)]), 0),
                (np.array([(-0.2, -0.47), (0.2, -0.47)]), 0),
                (_arc(0.1, 0.24, 0.075, 100, 440), 1),
                (np.array([(0.17, 0.33), (0.36, 0.6)]), 2)]
    if name == 'note':
        tilt = math.radians(20)

        def head(cx, cz):
            e = _arc(0.0, 0.0, 0.125, 20, 370, 0.09)
            return np.stack([cx + e[:, 0] * math.cos(tilt) - e[:, 1] * math.sin(tilt), cz + e[:, 0] * math.sin(tilt) + e[:, 1] * math.cos(tilt)], 1)
        return [(_fillet([(-0.13, -0.3), (-0.13, 0.36), (0.39, 0.48), (0.39, -0.18)], 0.04), 0),
                (head(-0.26, -0.36), 0), (head(0.26, -0.24), 0)]
    if name == 'arrow':
        return [(np.array([(-0.46, 0.0), (0.36, 0.0)]), 0),
                (_fillet([(0.14, 0.27), (0.45, 0.0), (0.14, -0.27)], 0.03), 0)]
    if name == 'bolt':
        return [(_loop([(0.16, 0.5), (-0.24, -0.02), (0.02, -0.02), (-0.14, -0.5), (0.28, 0.1), (0.02, 0.1)], 0.02), 0)]
    if name == 'moon':
        outer = _arc(0.0, 0.0, 0.44, 62, 298)
        inner = _arc(0.2, 0.0, 0.4, 256, 104)
        return [(np.vstack([outer, inner[1:-1]]), 0), (_icon('star')[0][0] * 0.3 + np.array([0.3, 0.22]), 1)]
    if name == 'cup':
        steam = lambda x: np.array([(x + 0.035 * math.sin(t * 7.5), 0.3 + 0.26 * t) for t in np.linspace(0, 1, 30)])
        return [(_loop([(-0.33, 0.16), (-0.25, -0.34), (0.17, -0.34), (0.25, 0.16)], 0.05), 0),
                (_arc(0.26, -0.08, 0.15, 68, -68, 0.14), 0),
                (steam(-0.14), 1), (steam(0.06), 1),
                (np.array([(-0.42, -0.45), (0.36, -0.45)]), 2)]
    if name == 'ring':
        return [(_arc(0.0, 0.0, 0.44, 93, 447), 0)]
    return _icon('heart')


# ----------------------------------------------------------------------------- 3D build
def _mesh(name, verts, faces, mat):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(float(c) for c in v) for v in verts], [], faces)
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    me.materials.append(mat)
    return ob


def _sweep(P, radius, m=12):
    """Vertices and faces of a round tube along the 3D polyline P (parallel-transport frames)."""
    P = np.asarray(P, 'f8')
    n = len(P)
    T = np.gradient(P, axis=0)
    T /= np.maximum(np.linalg.norm(T, axis=1), 1e-9)[:, None]
    ref = np.array([0.0, -1.0, 0.0]) if abs(T[0][1]) < 0.9 else np.array([1.0, 0.0, 0.0])
    N = np.zeros_like(P)
    v = ref - (ref @ T[0]) * T[0]
    N[0] = v / np.linalg.norm(v)
    for i in range(1, n):
        v = N[i - 1] - (N[i - 1] @ T[i]) * T[i]
        N[i] = v / np.linalg.norm(v)
    B = np.cross(T, N)
    ang = np.linspace(0, math.tau, m, endpoint=False)
    ring = np.cos(ang)[None, :, None] * N[:, None, :] + np.sin(ang)[None, :, None] * B[:, None, :]
    verts = (P[:, None, :] + radius * ring).reshape(-1, 3)
    faces = []
    for i in range(n - 1):
        for k in range(m):
            k2 = (k + 1) % m
            faces.append((i * m + k, i * m + k2, (i + 1) * m + k2, (i + 1) * m + k))
    faces.append(tuple(range(m - 1, -1, -1)))
    faces.append(tuple((n - 1) * m + k for k in range(m)))
    return verts, faces


def _hide(ob, camera=True):
    for attr, val in (('visible_camera', camera), ('visible_diffuse', False), ('visible_glossy', False),
                      ('visible_transmission', False), ('visible_shadow', False), ('visible_volume_scatter', False)):
        try:
            setattr(ob, attr, val)
        except Exception:
            pass
    return ob


def _no_sampling(mat):
    try:
        mat.cycles.emission_sampling = 'NONE'
    except Exception:
        pass
    return mat


def _tube_material(name, color, edge, core, white=0.64):
    """Lit glass: saturated at the edges of the tube, white-hot along its middle."""
    mat = bpy.data.materials.new(name)
    try:
        mat.use_nodes = True
    except Exception:
        pass
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    lw = nt.nodes.new('ShaderNodeLayerWeight')
    lw.inputs['Blend'].default_value = 0.5
    hot = nt.nodes.new('ShaderNodeMapRange')
    hot.interpolation_type = 'SMOOTHSTEP'
    hot.inputs[1].default_value, hot.inputs[2].default_value = 0.08, 0.66
    hot.inputs[3].default_value, hot.inputs[4].default_value = 1.0, 0.0
    nt.links.new(lw.outputs['Facing'], hot.inputs[0])
    mix = nt.nodes.new('ShaderNodeMixRGB')
    mix.inputs[1].default_value = C.col(color)
    mix.inputs[2].default_value = C.col(C.mix_hex(color, '#ffffff', white))
    nt.links.new(hot.outputs[0], mix.inputs[0])
    power = nt.nodes.new('ShaderNodeMapRange')
    power.inputs[1].default_value, power.inputs[2].default_value = 0.0, 1.0
    power.inputs[3].default_value, power.inputs[4].default_value = edge, core
    nt.links.new(hot.outputs[0], power.inputs[0])
    nt.links.new(mix.outputs[0], em.inputs['Color'])
    nt.links.new(power.outputs[0], em.inputs['Strength'])
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    return _no_sampling(mat)


def _halo_material(name, color, strength):
    """A see-through shell round the tube that only adds light: the bloom, without a compositor."""
    mat = bpy.data.materials.new(name)
    try:
        mat.use_nodes = True
    except Exception:
        pass
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    lw = nt.nodes.new('ShaderNodeLayerWeight')
    lw.inputs['Blend'].default_value = 0.5
    inv = nt.nodes.new('ShaderNodeMath')
    inv.operation = 'SUBTRACT'
    inv.inputs[0].default_value = 1.0
    nt.links.new(lw.outputs['Facing'], inv.inputs[1])
    fall = nt.nodes.new('ShaderNodeMath')
    fall.operation = 'POWER'
    fall.inputs[1].default_value = 3.2
    nt.links.new(inv.outputs[0], fall.inputs[0])
    k = nt.nodes.new('ShaderNodeMath')
    k.operation = 'MULTIPLY'
    k.inputs[1].default_value = strength
    nt.links.new(fall.outputs[0], k.inputs[0])
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = C.col(color)
    nt.links.new(k.outputs[0], em.inputs['Strength'])
    clear = nt.nodes.new('ShaderNodeBsdfTransparent')
    add = nt.nodes.new('ShaderNodeAddShader')
    nt.links.new(clear.outputs[0], add.inputs[0])
    nt.links.new(em.outputs[0], add.inputs[1])
    nt.links.new(add.outputs[0], out.inputs['Surface'])
    return _no_sampling(mat)


class Sign:
    """Collects strokes and builds tubes, halos, electrodes, mounts and the hidden lights."""

    def __init__(self, ctx, glow, spill):
        self.ctx, self.glow, self.spill = ctx, glow, spill
        self.mats = {}
        self.ends = []
        self.length = 0.0
        self.black = C.material('Electrode', '#0c0c0e', roughness=0.4)
        self.peg = C.material('Mount', '#c9ccd2', roughness=0.35, specular=0.5)
        self.cable_mat = C.material('Cable', '#101013', roughness=0.5)

    def _mat(self, color):
        if color not in self.mats:
            i = len(self.mats)
            if self.ctx.dark:
                self.mats[color] = (_tube_material('Tube%d' % i, color, 5.0 * self.glow, 11.0 * self.glow),
                                    _halo_material('Halo%d' % i, color, 1.5 * self.glow))
            else:       # on a pale wall the tube has to be deeper than the wall to read: full colour, hardly any white core
                self.mats[color] = (_tube_material('Tube%d' % i, color, 0.95 * self.glow, 1.7 * self.glow, 0.16),
                                    _halo_material('Halo%d' % i, color, 0.28 * self.glow))
        return self.mats[color]

    def stroke(self, pts, color, turn_in=True):
        """One tube along 2D points (x, z). Its ends turn back into the wall inside black sleeves."""
        P2 = _resample(pts, 0.012)
        y = WALL_Y - OFF
        main = np.stack([P2[:, 0], np.full(len(P2), y), P2[:, 1]], 1)
        path = main
        if turn_in:
            rb = 0.034
            parts = []
            for end, sign in ((0, -1.0), (-1, 1.0)):
                e = P2[end]
                t = (P2[end] - P2[end - 1]) if end == -1 else (P2[0] - P2[1])
                t = t / np.linalg.norm(t)
                bend = [(e[0] + rb * math.sin(a) * t[0], y + rb * (1 - math.cos(a)), e[1] + rb * math.sin(a) * t[1]) for a in np.linspace(0.2, math.pi / 2, 7)]
                tip = (e[0] + rb * t[0], WALL_Y - 0.012, e[1] + rb * t[1])
                seg = np.array(bend + [tip])
                parts.append(seg[::-1] if end == 0 else seg)
                self.ends.append((tip[0], tip[2]))
                C.add_cylinder(TUBE * 1.5, 0.034, 0.004, self.black, location=(tip[0], WALL_Y - 0.017, tip[2]), rotation=(math.radians(90), 0, 0))
            path = np.vstack([parts[0], main, parts[1]])
        tube_mat, halo_mat = self._mat(color)
        v, f = _sweep(path, TUBE)
        _hide(_mesh('Tube', v, f, tube_mat), camera=True)
        v, f = _sweep(main, TUBE * 3.4, m=14)
        _hide(_mesh('Halo', v, f, halo_mat), camera=True)

        # mounts: little pegs holding the glass off the wall
        seg = np.sqrt(((P2[1:] - P2[:-1]) ** 2).sum(1))
        cum = np.concatenate([[0.0], np.cumsum(seg)])
        L = cum[-1]
        self.length += L
        count = max(1, int(round(L / 0.42)))
        for k in range(count):
            s = L * (k + 0.5) / count
            x, z = np.interp(s, cum, P2[:, 0]), np.interp(s, cum, P2[:, 1])
            C.add_cylinder(0.0065, OFF - TUBE * 0.6, 0.0, self.peg, location=(x, WALL_Y - (OFF - TUBE * 0.6) / 2, z), rotation=(math.radians(90), 0, 0))
            C.add_cylinder(0.016, 0.006, 0.002, self.peg, location=(x, WALL_Y - 0.003, z), rotation=(math.radians(90), 0, 0))

        # hidden lights of the tube's colour: the spill on the wall, clean and noise-free
        step = 0.085
        n = max(1, int(round(L / step)))
        rgb = C.hex_to_rgb(color)
        watts = 0.72 * self.spill * (0.5 + 0.5 * (max(rgb) - min(rgb))) * (L / n) / step * (1.0 if self.ctx.dark else 2.6)
        for k in range(n):
            s = L * (k + 0.5) / n
            x, z = np.interp(s, cum, P2[:, 0]), np.interp(s, cum, P2[:, 1])
            lamp = C.add_point_light((x, y, z), energy=watts, color=color, radius=TUBE)
            try:
                lamp.visible_glossy = True
                lamp.visible_camera = False
            except Exception:
                pass

    def cable(self, box_at, start=None):
        """A slack lead from a tube end down to a small transformer box on the wall."""
        if not self.ends:
            return
        bx, bz = box_at
        C.add_box((0.17, 0.04, 0.085), 0.012, self.black, location=(bx, WALL_Y - 0.02, bz), segments=3)
        ex, ez = min(self.ends, key=lambda e: (e[0] - (start or box_at)[0]) ** 2 + (e[1] - (start or box_at)[1]) ** 2)
        pts = []
        for t in np.linspace(0, 1, 48):
            x = ex + (bx - ex) * (t ** 1.6)
            z = ez + (bz + 0.045 - ez) * t - 0.05 * math.sin(math.pi * t) * (1 - t)
            pts.append((x, WALL_Y - 0.008, z))
        v, f = _sweep(pts, 0.0048, m=8)
        _mesh('Cable', v, f, self.cable_mat)

    def lead(self, start, end):
        v, f = _sweep([(start[0] + (end[0] - start[0]) * t + 0.012 * math.sin(6 * t), WALL_Y - 0.008, start[1] + (end[1] - start[1]) * t) for t in np.linspace(0, 1, 30)], 0.0045, m=8)
        _mesh('Lead', v, f, self.cable_mat)


# ----------------------------------------------------------------------------- walls
def _wall(kind, albedo, rng):
    """The surface the sign hangs on, in the palette background colour. Relief only shows where
    the tubes rake light across it, so the copy area stays calm."""
    mat = C.material('Wall', tuple(albedo), roughness=0.82, specular=0.25)
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    bump = nt.nodes.new('ShaderNodeBump')
    lin = tuple(albedo) + (1.0,)
    shade = lambda k: tuple(min(1.0, c * k) for c in albedo) + (1.0,)

    def noise(scale, detail):
        n = nt.nodes.new('ShaderNodeTexNoise')
        n.inputs['Scale'].default_value = scale
        n.inputs['Detail'].default_value = detail
        nt.links.new(tc.outputs['Object'], n.inputs['Vector'])
        return n.outputs[0]

    def math_(op, a, b):
        n = nt.nodes.new('ShaderNodeMath')
        n.operation = op
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, bpy.types.NodeSocket):
                nt.links.new(v, n.inputs[i])
            else:
                n.inputs[i].default_value = v
        return n.outputs[0]

    if kind == 'brick':
        br = nt.nodes.new('ShaderNodeTexBrick')
        br.offset = 0.5
        calm = float(np.max(albedo)) > 0.47          # a pale wall: keep the bricks quiet
        br.inputs['Color1'].default_value = shade(1.04 if calm else 1.1)
        br.inputs['Color2'].default_value = shade(0.95 if calm else 0.86)
        br.inputs['Mortar'].default_value = shade(0.84 if calm else 0.62)
        br.inputs['Scale'].default_value = 2.15
        br.inputs['Mortar Size'].default_value = 0.022
        br.inputs['Mortar Smooth'].default_value = 0.35
        br.inputs['Bias'].default_value = 0.0
        br.inputs['Brick Width'].default_value = 0.5
        br.inputs['Row Height'].default_value = 0.165
        nt.links.new(tc.outputs['Object'], br.inputs['Vector'])
        nt.links.new(br.outputs['Color'], bsdf.inputs['Base Color'])
        height = math_('ADD', math_('MULTIPLY', br.outputs['Fac'], -1.0), math_('MULTIPLY', noise(38.0, 4.0), 0.4))
        bump.inputs['Strength'].default_value = 0.8
        bump.inputs['Distance'].default_value = 0.012
        bsdf.inputs['Roughness'].default_value = 0.7
    elif kind == 'panel':
        sep = nt.nodes.new('ShaderNodeSeparateXYZ')
        nt.links.new(tc.outputs['Object'], sep.inputs[0])
        phase = math_('FRACT', math_('MULTIPLY', math_('ADD', sep.outputs[0], rng.uniform(0, 1)), 1.0 / 0.115), None)
        groove = nt.nodes.new('ShaderNodeMapRange')
        groove.interpolation_type = 'SMOOTHSTEP'
        groove.inputs[1].default_value, groove.inputs[2].default_value = 0.0, 0.11
        nt.links.new(phase, groove.inputs[0])
        groove2 = nt.nodes.new('ShaderNodeMapRange')
        groove2.interpolation_type = 'SMOOTHSTEP'
        groove2.inputs[1].default_value, groove2.inputs[2].default_value = 1.0, 0.89
        nt.links.new(phase, groove2.inputs[0])
        height = math_('MULTIPLY', groove.outputs[0], groove2.outputs[0])
        bump.inputs['Strength'].default_value = 1.0
        bump.inputs['Distance'].default_value = 0.014
        bsdf.inputs['Roughness'].default_value = 0.42
    else:   # plaster
        height = math_('ADD', math_('MULTIPLY', noise(3.0, 4.0), 1.0), math_('MULTIPLY', noise(60.0, 2.0), 0.12))
        bump.inputs['Strength'].default_value = 0.2
        bump.inputs['Distance'].default_value = 0.02
    nt.links.new(height, bump.inputs['Height'])
    nt.links.new(bump.outputs[0], bsdf.inputs['Normal'])
    wall = C.add_plane(300, mat)
    wall.rotation_euler = (math.radians(90), 0, 0)
    wall.location = (0, WALL_Y, 0)
    return wall


# ----------------------------------------------------------------------------- motifs
def _arcs(ctx, sign, cols, flip, rng):
    c0, c1, c2, c3 = cols
    X = lambda pts: np.stack([np.asarray(pts)[:, 0] * flip, np.asarray(pts)[:, 1]], 1)
    ax, az = -0.26, -0.16
    for r, col_ in ((0.88, c0), (0.69, c1), (0.5, c2)):
        sign.stroke(X(_arc(ax, az, r, 180, 0)), col_)
    sign.stroke(X([(-1.2, -0.32), (0.74, -0.32)]), c3)
    sign.stroke(X(_arc(0.86, 0.6, 0.27, 100, 440)), c3)
    wave = lambda x0, x1, z, ph: [(x, z + 0.07 * math.sin((x - x0) * 6.6 + ph)) for x in np.linspace(x0, x1, 90)]
    sign.stroke(X(wave(-0.88, 1.16, -0.56, 0.0)), c1)
    sign.stroke(X(wave(-1.16, 0.84, -0.78, 2.2)), c2)
    sign.cable((0.98 * flip, -0.98), start=(0.74 * flip + 0.034 * flip, -0.32))
    return dict(width=2.9, height=2.3, fov=20, direction=(0.0, -1.0, 0.0))


def _icons(ctx, sign, cols, flip, rng, names):
    x0, y0, x1, y1 = ctx.art_rect
    ar = max(0.3, (x1 - x0) * ctx.width) / max(1.0, (y1 - y0) * ctx.height)
    n = len(names)
    if n == 1:
        rows = [1]
    else:
        nrows = max(1, min(n, int(round(math.sqrt(n / max(0.5, min(3.0, ar)))))))
        if n == 5 and nrows == 2:
            rows = [2, 3]
        elif n == 5 and nrows >= 3:
            rows = [2, 1, 2]
        else:
            base, extra = divmod(n, nrows)
            rows = [base + (1 if i < extra else 0) for i in range(nrows)]
    pitch_x, pitch_z = 1.18, 1.14
    if rows == [2, 1, 2]:
        pitch_z = 0.78
        pitch_x = 1.5
    k = 0
    W = max(rows) * pitch_x
    H = len(rows) * pitch_z
    for ri, cnt in enumerate(rows):
        z = (len(rows) - 1) / 2 * pitch_z - ri * pitch_z
        for ci in range(cnt):
            x = (ci - (cnt - 1) / 2) * pitch_x
            name = names[k]
            sc = 1.0 if n > 1 else 1.9
            rot = math.radians(rng.uniform(-7, 7)) if n > 1 else 0.0
            if name == 'arrow':
                rot += math.radians(rng.choice((20, -15, 35)))
            for pts, slot in _icon(name):
                p = np.asarray(pts, 'f8') * sc
                q = np.stack([p[:, 0] * math.cos(rot) - p[:, 1] * math.sin(rot), p[:, 0] * math.sin(rot) + p[:, 1] * math.cos(rot)], 1)
                q = q + np.array([x * sc, z * sc])
                q[:, 0] *= flip
                sign.stroke(q, cols[(k + slot) % len(cols)])
            k += 1
    if n == 1:
        W, H = 2.1, 2.1
        sign.cable((0.0, -1.16))
        return dict(width=W + 0.3, height=H + 0.5, fov=20, direction=(0.0, -1.0, 0.0))
    sign.cable((0.5 * pitch_x * flip, -H / 2 - 0.04) if rows != [2, 1, 2] else (0.0, -H / 2 + 0.06))
    return dict(width=W + 0.16, height=H + 0.22, fov=20, direction=(0.0, -1.0, 0.0))


def _wall_point(ctx, u, v):
    """World position on the wall behind the poster point (u, v) (fractions, v down)."""
    bpy.context.view_layer.update()
    cam = ctx.camera
    tr, br, bl, tl = cam.data.view_frame(scene=ctx.scene)
    p = tl + (tr - tl) * u + (bl - tl) * v
    mw = cam.matrix_world
    o = mw.translation
    d = (mw @ p) - o
    t = (WALL_Y - OFF - o.y) / d.y
    q = o + d * t
    return q.x, q.z


def _frame(ctx, sign, cols, rng):
    """Two tubes round the whole sheet, in the page margin, so every line of copy sits inside."""
    c0, c1, c2, c3 = cols
    ctx.frame(radius=1.0, fov=24, direction=(0.0, -1.0, 0.0), size=1.0)
    xa, za = _wall_point(ctx, 0.0, 0.0)
    xb, zb = _wall_point(ctx, 1.0, 1.0)
    short = min(abs(xb - xa), abs(za - zb))

    def rect(inset, r, col_, gap_top):
        l, rgt, top, bot = xa + inset, xb - inset, za - inset, zb + inset
        cx = (l + rgt) / 2
        g = gap_top / 2
        # left half and right half, meeting (almost) at the middle of the top and bottom sides
        sign.stroke(_fillet([(cx - g, top), (l, top), (l, bot), (cx - g, bot)], r), col_)
        sign.stroke(_fillet([(cx + g, top), (rgt, top), (rgt, bot), (cx + g, bot)], r), col_)
        return l, rgt, top, bot

    m1, m2 = 0.03 * short, 0.052 * short
    l, r, top, bot = rect(m1, 0.085 * short, c0, 0.05 * short)
    rect(m2, 0.085 * short - (m2 - m1), c1, 0.11 * short)
    # quarter arcs tucked into the top corners (the bottom corners stay free for the footer line)
    rr = 0.085 * short
    for sx, sz, a0 in ((l, top, 270), (r, top, 180)):
        cx = sx + (m2 - m1 + 0.02 * short) * (1 if sx == l else -1)
        cz = sz - (m2 - m1 + 0.02 * short) * (1 if sz == top else -1)
        ccx, ccz = cx + rr * (1 if sx == l else -1), cz - rr * (1 if sz == top else -1)
        b0, b1 = {270: (100, 170), 180: (10, 80), 90: (280, 350), 0: (190, 260)}[a0]
        sign.stroke(_arc(ccx, ccz, rr * 0.62, b0, b1), c2)
    sign.lead(((l + r) / 2 - 0.025 * short, bot - 0.012), ((l + r) / 2 - 0.02 * short, zb - 0.05))
    return None


def build(ctx):
    rng, pal, p = ctx.rng, ctx.palette, ctx.params
    flip = -1.0 if ctx.mirror else 1.0
    motif = str(p.get('motif', 'arcs')).lower()
    kind = str(p.get('wall', 'auto')).lower()
    if kind not in ('brick', 'plaster', 'panel'):
        kind = {'icons': 'brick', 'frame': 'panel'}.get(motif, 'plaster')
    ctx.set_view('AgX', 'Medium High Contrast')
    cols = [ctx.color(i) for i in range(4)]

    # --- wall and ambient light: together they show exactly the palette background where no
    #     neon reaches. The wall paint is a mid tone of the background's hue, so it takes colour.
    want = _radiance_for(ctx.scene, pal['bg'])
    norm = want / max(float(want.max()), 1e-6)
    if float(want.max()) > 0.2:
        albedo = 0.5 * norm
    else:
        albedo = 0.3 + 0.16 * norm
    world = want / albedo
    peak = float(world.max())
    C.set_world(tuple(world / peak), peak)
    _wall(kind, albedo, rng)

    sign = Sign(ctx, float(p.get('glow', 1.0)), float(p.get('spill', 1.0)))
    if motif == 'frame':
        _frame(ctx, sign, cols, rng)
        return
    if motif == 'icons':
        names = [s.strip().lower() for s in str(p.get('icons', 'heart,star,cocktail,note,arrow')).split(',') if s.strip()]
        look = _icons(ctx, sign, cols, flip, rng, names[:8] or ['heart'])
    else:
        look = _arcs(ctx, sign, cols, flip, rng)
    ctx.frame(**look)
