"""Voxel — scenes built from small cubes.

The technique: every form is quantised to a cubic grid; each cube is a real block with a tiny
chamfer and a hair of a gap, so edges catch the light; colours come from a short, quantised
palette (each material in two or three fixed shades, never a gradient). One sun, soft sky, and a
floor of the poster colour that only shows the model's shadow.

What is built is the ``motif``: island (a terrain block with trees, a house, water and clouds),
city (a city block), heart (one big object). Palette: ``bg`` = backdrop, ``colors`` = [grass,
earth / wood, stone / concrete, water / glass, sand / light], ``accent`` = roofs, flowers, the heart.
"""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector, noise

import common as C

AMB, SUN = 0.5, 0.37
SKY, WARM = '#dbe6ff', '#fff3e0'


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


# ----------------------------------------------------------------------------- set: floor, sky, sun
class Stage:
    """Floor and backdrop that render at exactly the palette background (a size-1 toon lobe answers
    the sun the same at any angle: no falloff, no horizon), a sun and a soft sky."""

    def __init__(self, ctx, sun_dir, angle=4.0, lift=0.35):
        self.ctx = ctx
        bg = C.col(ctx.palette['bg'])[:3]
        sky, warm = C.col(SKY)[:3], C.col(WARM)[:3]
        world = bpy.data.worlds.new('World')
        ctx.scene.world = world
        try:
            world.use_nodes = True
        except Exception:
            pass
        nt = world.node_tree
        nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputWorld')
        lp = nt.nodes.new('ShaderNodeLightPath')
        b_cam, b_sky = nt.nodes.new('ShaderNodeBackground'), nt.nodes.new('ShaderNodeBackground')
        b_cam.inputs['Color'].default_value = (*bg, 1.0)
        b_sky.inputs['Color'].default_value = (*sky, 1.0)
        b_sky.inputs['Strength'].default_value = AMB
        mx = nt.nodes.new('ShaderNodeMixShader')
        nt.links.new(lp.outputs['Is Camera Ray'], mx.inputs['Fac'])
        nt.links.new(b_sky.outputs[0], mx.inputs[1])
        nt.links.new(b_cam.outputs[0], mx.inputs[2])
        nt.links.new(mx.outputs[0], out.inputs[0])
        self.sun_dir = Vector(sun_dir).normalized()
        C.add_sun(tuple(self.sun_dir), strength=2 * math.pi * SUN, angle=angle, color=WARM)

        mat = bpy.data.materials.new('Floor')
        try:
            mat.use_nodes = True
        except Exception:
            pass
        nt = mat.node_tree
        nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        em = nt.nodes.new('ShaderNodeEmission')
        em.inputs['Color'].default_value = (*[v * lift for v in bg], 1.0)
        tb = nt.nodes.new('ShaderNodeBsdfToon')
        tb.component = 'DIFFUSE'
        tb.inputs['Size'].default_value = 1.0
        tb.inputs['Smooth'].default_value = 0.0
        tb.inputs['Color'].default_value = (*[v * (1 - lift) / (AMB * s + SUN * w) for v, s, w in zip(bg, sky, warm)], 1.0)
        add = nt.nodes.new('ShaderNodeAddShader')
        nt.links.new(em.outputs[0], add.inputs[0])
        nt.links.new(tb.outputs[0], add.inputs[1])
        nt.links.new(add.outputs[0], out.inputs[0])
        self.floor = C.add_plane(800.0, mat, location=(0.0, 0.0, 0.0))
        self.floor_z = 0.0

    def fit(self, direction, fov, margin=1.05, shadow=0.5):
        """Centre what was built on the origin as the camera will see it; return its on-screen size."""
        ctx = self.ctx
        bpy.context.view_layer.update()
        sun = np.array(self.sun_dir)
        pts = []
        for ob in ctx.scene.objects:
            if ob.type != 'MESH' or ob is self.floor:
                continue
            co = np.empty(len(ob.data.vertices) * 3)
            ob.data.vertices.foreach_get('co', co)
            mw = np.array(ob.matrix_world)
            P = co.reshape(-1, 3) @ mw[:3, :3].T + mw[:3, 3]
            if not len(P):
                continue
            pts.append(P)
            if shadow > 0:
                pts.append(P + sun * (shadow * (self.floor_z - P[:, 2:3]) / sun[2]))
        shift, width, height = _fit_view(ctx, np.concatenate(pts), direction, fov, margin)
        for ob in ctx.scene.objects:
            if ob.parent is None and ob.type in ('MESH', 'CURVE', 'EMPTY', 'LIGHT'):
                ob.location = ob.location - shift
        return width, height


# ----------------------------------------------------------------------------- voxel grid
def _hex(rgb):
    return '#' + ''.join('%02x' % round(255 * min(1.0, max(0.0, v))) for v in rgb)


def tone(h, k):
    """A fixed step lighter (k > 0) or darker (k < 0) of a colour, hue kept."""
    r, g, b = C.hex_to_rgb(h)
    if k >= 0:
        return _hex((r + (1 - r) * k, g + (1 - g) * k, b + (1 - b) * k))
    return _hex((r * (1 + k), g * (1 + k * 0.9), b * (1 + k * 0.75)))


class Vox:
    """A sparse grid of coloured cells -> one mesh of chamfered cubes (hidden cells are skipped)."""

    def __init__(self, rng):
        self.rng = rng
        self.cells = {}
        self.glow = {}

    def put(self, i, j, k, colour, vary=0.0, glow=0.0):
        """``vary`` > 0 picks one of three fixed shades of the colour at random (quantised, not noisy)."""
        if vary:
            u = self.rng.random()
            colour = tone(colour, vary) if u < 0.22 else tone(colour, -vary) if u > 0.8 else colour
        self.cells[(i, j, k)] = colour
        if glow:
            self.glow[(i, j, k)] = glow

    def box(self, i0, j0, k0, i1, j1, k1, colour, vary=0.0):
        for i in range(i0, i1 + 1):
            for j in range(j0, j1 + 1):
                for k in range(k0, k1 + 1):
                    self.put(i, j, k, colour, vary)

    def clear(self, i, j, k):
        self.cells.pop((i, j, k), None)

    def top(self, i, j):
        ks = [k for (a, b, k) in self.cells if a == i and b == j]
        return max(ks) + 1 if ks else 0

    def build(self, unit, bevel=0.085, gap=0.03, mirror=False, origin=None, roughness=0.6):
        cells = self.cells
        vis = [c for c in cells if any((c[0] + d[0], c[1] + d[1], c[2] + d[2]) not in cells
                                       for d in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)))]
        vis.sort()
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0 - gap)
        try:
            bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=1, profile=0.5, affect='EDGES')
        except TypeError:
            bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=1, profile=0.5)
        bm.verts.ensure_lookup_table()
        tv = np.array([tuple(v.co) for v in bm.verts])
        tf = [[v.index for v in f.verts] for f in bm.faces]
        bm.free()
        nv, n = len(tv), len(vis)
        pos = np.array(vis, 'f8') + 0.5
        if origin is None:
            origin = ((pos[:, 0].min() + pos[:, 0].max()) / 2, (pos[:, 1].min() + pos[:, 1].max()) / 2, 0.0)
        pos -= np.array(origin)
        if mirror:
            pos[:, 0] *= -1
        co = ((pos[:, None, :] + tv[None, :, :]) * unit).reshape(-1, 3)
        loop_tpl = np.concatenate([np.array(f) for f in tf])
        totals_tpl = np.array([len(f) for f in tf])
        loops = (loop_tpl[None, :] + (np.arange(n) * nv)[:, None]).ravel()
        totals = np.tile(totals_tpl, n)
        starts = np.concatenate([[0], np.cumsum(totals)[:-1]])
        me = bpy.data.meshes.new('Voxels')
        me.vertices.add(len(co))
        me.vertices.foreach_set('co', co.ravel())
        me.loops.add(len(loops))
        me.loops.foreach_set('vertex_index', loops.astype('i4'))
        me.polygons.add(len(totals))
        me.polygons.foreach_set('loop_start', starts.astype('i4'))
        me.polygons.foreach_set('loop_total', totals.astype('i4'))
        me.update(calc_edges=True)
        cache = {}
        cols = np.empty((n, 4), 'f4')
        glow = np.zeros(n, 'f4')
        for idx, c in enumerate(vis):
            h = cells[c]
            if h not in cache:
                cache[h] = C.col(h)
            cols[idx] = cache[h]
            glow[idx] = self.glow.get(c, 0.0)
        attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
        attr.data.foreach_set('color', np.repeat(cols, nv, axis=0).ravel())
        ga = me.attributes.new('Glow', 'FLOAT', 'POINT')
        ga.data.foreach_set('value', np.repeat(glow, nv))
        mat = C.material('Voxel', '#ffffff', roughness=roughness, specular=0.3)
        nt = mat.node_tree
        bsdf = next(nd for nd in nt.nodes if nd.type == 'BSDF_PRINCIPLED')
        an = nt.nodes.new('ShaderNodeAttribute')
        an.attribute_name = 'Col'
        nt.links.new(an.outputs['Color'], bsdf.inputs['Base Color'])
        if self.glow:
            gn = nt.nodes.new('ShaderNodeAttribute')
            gn.attribute_name = 'Glow'
            for name in ('Emission Color', 'Emission'):
                if bsdf.inputs.get(name) is not None:
                    nt.links.new(an.outputs['Color'], bsdf.inputs[name])
                    break
            nt.links.new(gn.outputs['Fac'], bsdf.inputs['Emission Strength'])
        me.materials.append(mat)
        ob = bpy.data.objects.new('Voxels', me)
        bpy.context.scene.collection.objects.link(ob)
        return ob


def tree(V, i, j, k, foliage, trunk, size=1, tall=2):
    for t in range(tall):
        V.put(i, j, k + t, trunk, 0.06)
    k += tall
    r = size
    for dk in range(2 if size == 1 else 3):
        for di in range(-r, r + 1):
            for dj in range(-r, r + 1):
                if abs(di) == r and abs(dj) == r and (dk != 0 or size > 1):
                    continue
                V.put(i + di, j + dj, k + dk, foliage, 0.12)
    top = k + (2 if size == 1 else 3)
    for di, dj in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)) if size >= 1 else ((0, 0),):
        if size == 1 and (di or dj):
            continue
        V.put(i + di, j + dj, top, foliage, 0.09)
    if size > 1:
        V.put(i, j, top + 1, foliage, 0.09)


def cloud(V, i, j, k, colour, big=True):
    spans = [(0, 5, 0, 2, 0), (1, 4, 0, 2, 1)] if big else [(0, 3, 0, 1, 0), (1, 2, 0, 1, 1)]
    for a, b, c, d, dk in spans:
        V.box(i + a, j + c, k + dk, i + b, j + d, k + dk, colour)
    if big:
        V.box(i + 2, j, k + 2, i + 3, j + 1, k + 2, colour)


# ----------------------------------------------------------------------------- motif: island
def island(ctx, V, pal, accent):
    rng = ctx.rng
    grass, earth, stone, water, sand = pal
    foliage = tone(C.mix_hex(grass, water, 0.3), -0.22)
    wood = tone(earth, -0.3)
    N, W = 22, 4
    seed = Vector((rng.uniform(0, 40), rng.uniform(0, 40), 0))
    cx, cy = 7.5, 13.5
    hts = {}
    for i in range(N):
        for j in range(N):
            bay = math.hypot(i - (N + 1.0), (j + 2.0) * 1.1)                 # distance from the near corner
            hill = math.exp(-((i + 0.5 - cx) ** 2 + (j + 0.5 - cy) ** 2) / 34.0)
            g = 6.3 + 3.4 * hill + 1.1 * noise.noise(Vector((i * 0.17, j * 0.17, 0)) + seed) - 5.0 * max(0.0, 1.0 - (bay - 6.0) / 9.0) ** 1.4
            g = int(round(max(2.0, min(10.0, g))))
            hts[(i, j)] = g
            for k in range(g):
                if k == g - 1:
                    col, var = (grass, 0.08) if g > W + 1 else (sand, 0.05)
                elif k >= g - 3 and g > W + 1:
                    col, var = earth, 0.08
                elif k >= g - 2 and g > W - 1:
                    col, var = sand, 0.05
                else:
                    col, var = stone, 0.09
                V.put(i, j, k, col, var)
            for k in range(g, W):
                V.put(i, j, k, water, 0.06)
    # ore and fossils in the cut faces
    for _ in range(9):
        i, j = (rng.choice((0, N - 1)), rng.randrange(N)) if rng.random() < 0.5 else (rng.randrange(N), rng.choice((0, N - 1)))
        k = rng.randrange(0, 3)
        if V.cells.get((i, j, k)) and k < hts[(i, j)] - 3:
            V.put(i, j, k, rng.choice((accent, sand, tone(stone, -0.3))))
    g = lambda i, j: hts[(i, j)]
    # trees: a big one on the hill, a blossom tree, small ones around
    tree(V, 6, 16, g(6, 16), foliage, wood, size=2, tall=4)
    tree(V, 2, 9, g(2, 9), foliage, wood, size=1, tall=2)
    tree(V, 13, 18, g(13, 18), tone(foliage, 0.12), wood, size=1, tall=3)
    tree(V, 2, 3, g(2, 3), tone(foliage, 0.12), wood, size=1, tall=3)
    tree(V, 17, 17, g(17, 17), accent, wood, size=1, tall=2)
    tree(V, 6, 2, g(6, 2), foliage, wood, size=1, tall=2)
    # house
    hi_, hj = 9, 8
    base = max(g(i, j) for i in range(hi_, hi_ + 4) for j in range(hj, hj + 3))
    for i in range(hi_, hi_ + 4):
        for j in range(hj, hj + 3):
            for k in range(g(i, j), base):
                V.put(i, j, k, stone, 0.06)
    wall = tone(sand, 0.45)
    V.box(hi_, hj, base, hi_ + 3, hj + 2, base + 1, wall)
    V.put(hi_ + 1, hj, base, wood)
    V.put(hi_ + 3, hj, base + 1, water)
    V.put(hi_ + 3, hj + 1, base + 1, water)
    V.box(hi_ - 1, hj - 1, base + 2, hi_ + 4, hj + 3, base + 2, accent, 0.07)
    V.box(hi_, hj, base + 3, hi_ + 3, hj + 2, base + 3, accent, 0.07)
    V.box(hi_ + 1, hj + 1, base + 4, hi_ + 2, hj + 1, base + 4, accent, 0.07)
    V.box(hi_ + 3, hj + 2, base + 3, hi_ + 3, hj + 2, base + 5, stone)
    # flowers, a rock, a jetty with a boat
    spots = [(i, j) for (i, j), h in hts.items() if h > W + 1 and (i, j, h) not in V.cells and 1 < i < N - 2 and 1 < j < N - 2]
    rng.shuffle(spots)
    for (i, j), col in zip(spots[:7], (accent, sand, accent, '#ffffff', sand, accent, '#ffffff')):
        V.put(i, j, g(i, j), col)
    jj = 5                                                    # a jetty out from the beach, and a boat
    shore = next((i for i in range(N) if hts[(i, jj)] <= W - 1), N - 6)
    V.box(shore - 1, jj, W, min(N - 3, shore + 3), jj, W, wood, 0.08)
    bi = min(N - 3, shore + 4)
    V.box(bi, jj - 3, W, bi + 1, jj - 2, W, accent)
    V.put(bi, jj - 2, W + 1, '#ffffff')
    V.put(bi, jj - 2, W + 2, '#ffffff')
    cloud(V, 13, 12, 18, '#ffffff', True)
    cloud(V, 0, 5, 15, '#ffffff', False)
    return dict(unit=2.7 / N, view=(0.82, -1.0, 0.72), shadow=0.6)


# ----------------------------------------------------------------------------- motif: city block
def city(ctx, V, pal, accent):
    rng = ctx.rng
    grass, earth, stone, water, sand = pal
    dark = ctx.dark
    N = 26
    road = tone(stone, -0.52)
    pave = tone(stone, 0.45)
    glass = tone(water, -0.35) if not dark else tone(water, -0.6)
    lit = C.mix_hex(sand, '#ffe9a8', 0.5)
    foliage = tone(C.mix_hex(grass, water, 0.3), -0.2)
    wood = tone(earth, -0.35)
    V.box(0, 0, 0, N - 1, N - 1, 0, road, 0.05)
    V.box(3, 3, 1, N - 4, N - 4, 1, pave, 0.05)
    for a in range(2, N - 2, 3):                              # centre-line dashes on the two near streets
        V.put(a, 1, 0, lit if dark else sand)
        V.put(N - 2, a, 0, lit if dark else sand)
    O = 1                                                     # everything below sits one cell in from the kerb

    def building(i0, j0, w, d, h, wall, roof, step=2):
        i0, j0 = i0 + O, j0 + O
        for i in range(i0, i0 + w):
            for j in range(j0, j0 + d):
                for k in range(2, 2 + h):
                    edge_i, edge_j = i in (i0, i0 + w - 1), j in (j0, j0 + d - 1)
                    if not (edge_i or edge_j) and k < 1 + h:
                        continue                                # hollow inside
                    col, glow = wall, 0.0
                    win = (k - 2) % step == 1 and k < 1 + h and ((edge_j and (i - i0) % 2 == 1 and not edge_i) or (edge_i and (j - j0) % 2 == 1 and not edge_j))
                    if win:
                        on = rng.random() < (0.55 if dark else 0.0)
                        col, glow = (lit, 2.2) if on else (glass, 0.0)
                    if k == 1 + h:
                        col = roof
                    V.put(i, j, k, col, 0.0 if win else 0.04, glow)
        return 2 + h

    B = lambda i0, j0, k0, i1, j1, k1, col, vary=0.0: V.box(i0 + O, j0 + O, k0, i1 + O, j1 + O, k1, col, vary)
    t = building(3, 13, 6, 6, 13, pal[3], tone(pal[3], -0.3))                 # tower with a set-back crown
    for k in range(t, t + 4):
        for i in range(4, 8):
            for j in range(14, 18):
                edge = i in (4, 7) or j in (14, 17)
                if edge or k == t + 3:
                    win = edge and (k - t) % 2 == 1 and k < t + 3 and (i in (5, 6) or j in (15, 16))
                    on = win and rng.random() < (0.55 if dark else 0.0)
                    V.put(i + O, j + O, k, lit if on else glass if win else pal[3] if k < t + 3 else tone(pal[3], -0.3), 0.0 if win else 0.04, 2.2 if on else 0.0)
    B(5, 15, t + 4, 5, 15, t + 7, accent)
    t = building(11, 14, 6, 7, 9, tone(sand, 0.3), earth)                     # mid block
    B(12, 16, t, 13, 17, t + 1, stone, 0.05)
    B(15, 19, t, 15, 19, t + 1, pave)
    t = building(18, 13, 4, 8, 12, earth, tone(earth, -0.3))                  # slim slab
    B(19, 15, t, 20, 16, t, accent)
    t = building(3, 3, 7, 6, 5, accent, tone(accent, -0.3), step=3)           # low shop
    B(3, 2, 4, 9, 2, 4, '#ffffff')                                            # striped awning
    for i in range(3, 10, 2):
        V.put(i + O, 2 + O, 4, accent)
    B(4, 5, t, 5, 6, t, pave)
    t = building(17, 3, 5, 6, 7, stone, tone(stone, -0.35))                   # corner office
    B(18, 5, t, 19, 6, t + 1, sand)
    # pocket park between the low shop and the corner office
    B(11, 3, 1, 15, 9, 1, grass, 0.08)
    B(12, 5, 1, 13, 6, 1, water, 0.05)
    tree(V, 11 + O, 8 + O, 2, foliage, wood, size=1, tall=2)
    tree(V, 15 + O, 4 + O, 2, tone(foliage, 0.12), wood, size=1, tall=3)
    B(14, 8, 2, 15, 8, 2, wood)
    # street trees and cars
    for a in (2, 21):
        tree(V, a + O, 11 + O, 2, foliage, wood, size=1, tall=2)
    for (i, j, col, along) in ((6, 0, accent, True), (15, 0, sand, True), (N - 1, 8, pal[3], False), (N - 1, 17, '#ffffff', False), (N - 3, 12, accent, False)):
        di, dj = (1, 0) if along else (0, 1)
        for s in range(3):
            V.put(i + di * s, j + dj * s, 1, col)
        V.put(i + di, j + dj, 2, glass)
    return dict(unit=2.7 / N, view=(0.82, -1.0, 0.7), shadow=0.6)


# ----------------------------------------------------------------------------- motif: heart
def heart(ctx, V, pal, accent):
    rng = ctx.rng
    grass, earth, stone, water, sand = pal
    n = 11
    deep, hi = tone(accent, -0.28), tone(accent, 0.3)
    lift = 1
    for i in range(-n - 3, n + 4):
        for j in range(-7, 8):
            for k in range(-n - 2, n + 5):
                x, y, z = i / (n * 0.86), j / (n * 0.86) * 1.22, (k - 1.0) / (n * 0.86)
                if (x * x + 2.25 * y * y + z * z - 1) ** 3 - x * x * z ** 3 - 0.1125 * y * y * z ** 3 < 0:
                    band = x * 0.62 - z * 0.5
                    col = accent if band < 0.42 else deep if band < 0.86 else tone(deep, -0.22)
                    V.put(i, j, k + n + lift, col)
    # pixel-art shine on the upper lobe that faces the light
    front = {}
    for (i, j, k) in V.cells:
        if (i, k) not in front or j < front[(i, k)]:
            front[(i, k)] = j
    for (di, dk, col) in ((-7, 7, '#ffffff'), (-6, 8, '#ffffff'), (-5, 8, '#ffffff'), (-7, 6, '#ffffff'), (-7, 5, hi), (-4, 8, hi), (-6, 7, hi), (-5, 7, hi)):
        key = (di, dk + n + lift)
        if key in front:
            V.put(di, front[key], key[1], col)
    # loose cubes drifting around it
    for (i, j, k, col) in ((-15, 2, 20, sand), (-13, -3, 7, pal[3]), (14, 1, 23, pal[0]), (15, -2, 9, sand), (12, 3, 3, accent), (-11, 4, 27, accent), (16, 4, 16, pal[3])):
        V.put(i, j, k, col)
    for (i, j, k, col) in ((-16, 0, 13, hi), (11, -4, 28, sand)):                 # two plus-shaped sparkles
        for d in ((0, 0, 0), (1, 0, 0), (-1, 0, 0), (0, 0, 1), (0, 0, -1)):
            V.put(i + d[0], j + d[1], k + d[2], col)
    return dict(unit=2.6 / 30, view=(0.42, -1.0, 0.3), shadow=1.0, origin=(0.5, 0.5, 0.0), sun=(0.34, 0.3, -0.9))


MOTIFS = {'island': island, 'city': city, 'heart': heart}


def build(ctx):
    flip = -1.0 if ctx.mirror else 1.0
    p = ctx.params
    ctx.set_view('Standard')
    cy = ctx.scene.cycles
    try:
        cy.max_bounces, cy.diffuse_bounces, cy.glossy_bounces = 4, 2, 1
        cy.adaptive_min_samples = 16
    except Exception:
        pass
    V = Vox(ctx.rng)
    pal = [ctx.color(i) for i in range(5)]
    motif = str(p.get('motif', 'island')).lower()
    info = MOTIFS.get(motif, island)(ctx, V, pal, ctx.palette['accent'])
    sx, sy, sz = info.get('sun', (0.6, 0.42, -0.72))
    st = Stage(ctx, sun_dir=(sx * flip, sy, sz), angle=float(p.get('shadow', 4.0)))
    V.build(info['unit'], bevel=0.085 * float(p.get('bevel', 1.0)), gap=0.03, mirror=ctx.mirror, origin=info.get('origin'))
    vx, vy, vz = info['view']
    view = (vx * flip, vy, vz)
    width, height = st.fit(view, 14, shadow=info.get('shadow', 0.4))
    ctx.frame(width=width, height=height, fov=14, direction=view)
