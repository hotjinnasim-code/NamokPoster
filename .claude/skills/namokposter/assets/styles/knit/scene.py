"""Knit — chunky hand-knitted wool. Every stitch is real geometry: one yarn per row, looped through
the row below along the form (stockinette, ribbing, garter, seed stitch, stripes and a little
colourwork), with a haze of loose fibre, pom-poms and a soft raking light that shows the relief.

The technique is the style; ``motif`` chooses what is knitted: winter (a bobble hat and mittens),
bunting (a garland of knitted pennants and pom-poms) or shapes (abstract knitted solids)."""
import math

import bpy
import numpy as np
from mathutils import Euler

import common as C

TAU = math.tau


# ----------------------------------------------------------------------------- yarn
def _rgb(h):
    return np.array(C.col(h)[:3], 'f4')


class Yarn:
    """Collects yarn (thick curves with a colour per point) and makes the curve objects at the end."""

    def __init__(self, ctx):
        self.rs = np.random.default_rng(ctx.rng.randrange(1 << 30))
        self.P, self.R, self.Cc, self.sizes = [], [], [], []
        self.fP, self.fN, self.fC, self.fL = [], [], [], []       # where the loose fibre grows
        self.objects = []                                         # everything the rim light should touch
        self.bounds = []                                          # sample points for framing

    def strand(self, pts, radius, color, fuzz=1.0):
        """One yarn through ``pts`` (n, 3). ``color`` is one rgb or an (n, 3) array."""
        pts = np.asarray(pts, 'f4')
        n = len(pts)
        if n < 2:
            return
        col = np.broadcast_to(np.asarray(color, 'f4'), (n, 3))
        self.P.append(pts)
        self.R.append(np.broadcast_to(np.asarray(radius, 'f4'), (n,)))
        self.Cc.append(col)
        self.sizes.append(n)
        self.bounds.append(pts[::7])
        if fuzz > 0:
            k = max(1, int(n * 0.55 * fuzz))
            i = self.rs.integers(1, n - 1, k)
            t = pts[i + 1] - pts[i - 1]
            t /= np.maximum(np.linalg.norm(t, axis=1), 1e-9)[:, None]
            r = self.rs.normal(size=(k, 3)).astype('f4')
            nrm = r - (r * t).sum(1)[:, None] * t
            nrm /= np.maximum(np.linalg.norm(nrm, axis=1), 1e-9)[:, None]
            rad = np.broadcast_to(np.asarray(radius, 'f4'), (n,))[i]
            self.fP.append(pts[i] + nrm * rad[:, None] * 0.8)
            self.fN.append(nrm)
            self.fC.append(col[i])
            self.fL.append(rad)

    def _curves(self, name, P, R, Cc, sizes, mat):
        try:
            cu = bpy.data.hair_curves.new(name)
            cu.add_curves([int(s) for s in sizes])
            cu.points.foreach_set('position', np.ascontiguousarray(P, 'f4').ravel())
            cu.points.foreach_set('radius', np.ascontiguousarray(R, 'f4').ravel())
            att = cu.attributes.new('tint', 'FLOAT_COLOR', 'POINT')
            rgba = np.concatenate([Cc, np.ones((len(Cc), 1), 'f4')], 1)
            att.data.foreach_set('color', np.ascontiguousarray(rgba, 'f4').ravel())
            ob = bpy.data.objects.new(name, cu)
            bpy.context.scene.collection.objects.link(ob)
            cu.materials.append(mat)
            self.objects.append(ob)
            return ob
        except Exception:
            return None

    def finish(self, fuzz=1.0):
        if not self.P:
            return
        self._curves('Yarn', np.concatenate(self.P), np.concatenate(self.R), np.concatenate(self.Cc), self.sizes, _yarn_mat('Yarn', 0.0))
        if fuzz <= 0 or not self.fP:
            return
        # loose fibre standing off the yarn: short, thin, curled, a little lighter than the wool
        P, N, Cc, L = (np.concatenate(a) for a in (self.fP, self.fN, self.fC, self.fL))
        if fuzz < 1.0:
            keep = self.rs.random(len(P)) < fuzz
            P, N, Cc, L = P[keep], N[keep], Cc[keep], L[keep]
        n, steps = len(P), 4
        rs = self.rs
        side = rs.normal(size=(n, 3)).astype('f4')
        side -= (side * N).sum(1)[:, None] * N
        side /= np.maximum(np.linalg.norm(side, axis=1), 1e-9)[:, None]
        length = L * rs.uniform(0.9, 2.6, n).astype('f4')
        lean = rs.uniform(0.3, 1.6, n).astype('f4')
        curl = rs.normal(size=n).astype('f4') * 1.3
        pts = np.empty((n, steps, 3), 'f4')
        pos = P.copy()
        for k in range(steps):
            pts[:, k] = pos
            f = k / (steps - 1)
            d = N + side * (lean + curl * f)[:, None]
            d /= np.linalg.norm(d, axis=1)[:, None]
            pos = pos + d * (length / (steps - 1))[:, None]
        rad = (L * 0.075)[:, None] * np.linspace(1.0, 0.5, steps, dtype='f4')[None, :]
        col = np.repeat(Cc[:, None, :], steps, 1) * 0.86 + 0.14
        self._curves('Fibre', pts.reshape(-1, 3), rad.ravel(), col.reshape(-1, 3), [steps] * n, _yarn_mat('Fibre', 0.0, sheen=0.4))


def _yarn_mat(name, darken=0.0, sheen=0.55):
    """Wool yarn: matte, soft sheen, colour read from the per-point ``tint`` attribute."""
    mat = C.material(name, '#ffffff', roughness=0.88, sheen=sheen, specular=0.12)
    try:
        nt = mat.node_tree
        bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        if bsdf.inputs.get('Sheen Roughness') is not None:
            bsdf.inputs['Sheen Roughness'].default_value = 0.5
        att = nt.nodes.new('ShaderNodeAttribute')
        att.attribute_name = 'tint'
        nt.links.new(att.outputs['Color'], bsdf.inputs['Base Color'])
    except Exception:
        pass
    return mat


def _wool(color, k=0.0):
    """Plain wool for the cores under the stitches (a shade darker: the gaps between loops)."""
    return C.material('Wool', C.mix_hex(color, '#000000', k), roughness=0.95, sheen=0.3, specular=0.05)


# ----------------------------------------------------------------------------- stitches
STITCH = {
    'stock': lambda k, j: np.ones_like(k, 'f4'),
    'rib1': lambda k, j: np.where(k % 2 == 0, 1.0, -1.0).astype('f4'),
    'rib2': lambda k, j: np.where((k // 2) % 2 == 0, 1.0, -1.0).astype('f4'),
    'garter': lambda k, j: np.full(k.shape, 1.0 if j % 2 == 0 else -1.0, 'f4'),
    'seed': lambda k, j: np.where((k + j) % 2 == 0, 1.0, -1.0).astype('f4'),
}


def _loops(n_st, row, stitch, k0=0, per=14, closed=True, bulge=1.05):
    """Yarn of one row of ``n_st`` stitches in fabric coordinates: (u in stitches, v in rows around
    the row line, depth in units of the yarn radius, stitch index). The classic loop curve:
    u = t + a·sin 2t, v = h·cos t, depth = ∓d·cos 2t (legs in front for a knit stitch)."""
    m = n_st * per
    t = np.linspace(0.0, TAU * n_st, m, endpoint=False) if closed else np.linspace(-math.pi, TAU * n_st - math.pi, m + 1)
    q = t / TAU + 0.5                                # stitch k spans q in [k, k+1), its head at k + 0.5
    k = np.floor(q).astype(int)
    f = q - k
    kk = (k % n_st) if closed else np.clip(k, 0, n_st - 1)
    kn = ((k + 1) % n_st) if closed else np.clip(k + 1, 0, n_st - 1)
    s0, s1 = STITCH[stitch](kk + k0, row), STITCH[stitch](kn + k0, row)
    w = np.clip((f - 0.5) * 2.0, 0.0, 1.0)            # blend to the next stitch's face across the foot
    w = w * w * (3 - 2 * w)
    sgn = s0 * (1 - w) + s1 * w
    u = (t + bulge * np.sin(2 * t)) / TAU
    v = 0.86 * np.cos(t)
    depth = -sgn * 0.95 * np.cos(2 * t) + 0.75 * sgn * (0.0 if stitch in ('stock', 'garter', 'seed') else 1.0)
    return u, v, depth, kk + k0


class Lathe:
    """A knitted solid of revolution. ``profile`` = [(radius, z), ...] bottom to top."""

    def __init__(self, profile, squash=(1.0, 1.0), steps=400):
        pr = np.asarray(profile, 'f8')
        seg = np.hypot(np.diff(pr[:, 0]), np.diff(pr[:, 1]))
        s = np.concatenate([[0.0], np.cumsum(seg)])
        self.length = float(s[-1])
        self.s = np.linspace(0.0, self.length, steps)
        self.rho = np.interp(self.s, s, pr[:, 0])
        self.z = np.interp(self.s, s, pr[:, 1])
        dr, dz = np.gradient(self.rho, self.s), np.gradient(self.z, self.s)
        ln = np.maximum(np.hypot(dr, dz), 1e-9)
        self.nr, self.nz = dz / ln, -dr / ln
        self.squash = squash
        self.profile = pr

    def at(self, turn, s):
        """Point and outward normal at ``turn`` (0..1 around) and arclength ``s``."""
        s = np.clip(s, 0.0, self.length)
        rho, z = np.interp(s, self.s, self.rho), np.interp(s, self.s, self.z)
        nr, nz = np.interp(s, self.s, self.nr), np.interp(s, self.s, self.nz)
        a = TAU * turn
        sx, sy = self.squash
        P = np.stack([rho * np.cos(a) * sx, rho * np.sin(a) * sy, z], 1)
        N = np.stack([nr * np.cos(a) / sx, nr * np.sin(a) / sy, nz], 1)
        N /= np.maximum(np.linalg.norm(N, axis=1), 1e-9)[:, None]
        return P, N


def _xf(location=(0, 0, 0), rotation=(0, 0, 0)):
    return np.array(Euler(rotation, 'XYZ').to_matrix(), 'f8'), np.array(location, 'f8')


def knit_lathe(Y, profile, stitch_w, colors, pattern, zones, location=(0, 0, 0), rotation=(0, 0, 0), squash=(1.0, 1.0),
               gauge=0.74, s0=0.0, s1=None, turn0=0.0, fuzz=1.0, core=None):
    """Knit a solid of revolution in the round. ``zones(s)`` -> stitch name for the row at arclength
    ``s``; ``pattern(k, j, n)`` -> index into ``colors`` for stitch k of row j (n stitches round).
    Returns the number of rows."""
    L = Lathe(profile, squash)
    R, T = _xf(location, rotation)
    pitch = stitch_w * gauge
    yr = stitch_w * 0.2
    rho_max = float(L.rho.max()) * max(squash)
    n0 = max(8, int(round(TAU * rho_max / stitch_w / 8.0)) * 8)
    s1 = L.length if s1 is None else s1
    rows = int((s1 - s0) / pitch)
    rgb = np.stack([_rgb(c) for c in colors])
    for j in range(rows):
        s = s0 + (j + 0.5) * pitch
        rho = float(np.interp(s, L.s, L.rho)) * (sum(squash) / 2)
        n = n0
        while n > 8 and TAU * rho / n < 0.56 * stitch_w:
            n //= 2
        if TAU * rho / n < 0.3 * stitch_w:
            continue
        st = zones(s) if callable(zones) else zones
        u, v, depth, k = _loops(n, j, st)
        P, N = L.at(u / n + turn0, s + v * pitch)
        pts = (P + N * ((depth + 1.15) * yr)[:, None]) @ R.T + T
        pts = np.concatenate([pts, pts[:3]])                      # close the round
        col = rgb[np.asarray(pattern(k, j, n)) % len(rgb)]
        col = np.concatenate([col, col[:3]])
        Y.strand(pts, yr, col, fuzz)
    # core: the same form in wool, a shade darker, just under the loops
    pr = L.profile
    ob = C.add_lathe([(max(r, 0.0), z) for r, z in pr], _wool(core or colors[0], 0.3), segments=72)
    ob.scale = (squash[0], squash[1], 1.0)
    ob.rotation_euler = rotation
    ob.location = location
    Y.objects.append(ob)
    return rows


def knit_flat(Y, outline_fn, cols, rows, stitch_w, colors, pattern, stitch='stock', location=(0, 0, 0), rotation=(0, 0, 0),
              gauge=0.74, fuzz=1.0, core=None, thickness=None):
    """Knit a flat piece hanging in the XZ plane, facing -Y, worked top-down from z = 0.
    ``outline_fn(j)`` -> (first stitch, last stitch) of row j, or None; one yarn zig-zags down."""
    R, T = _xf(location, rotation)
    pitch = stitch_w * gauge
    yr = stitch_w * 0.2
    rgb = np.stack([_rgb(c) for c in colors])
    pts_all, col_all = [], []
    edge = []
    for j in range(rows):
        span = outline_fn(j)
        if span is None:
            continue
        a, b = span
        n = b - a
        if n < 1:
            continue
        st = stitch(j) if callable(stitch) else stitch
        u, v, depth, k = _loops(n, j, st, k0=a, closed=False)
        x = (u + a - cols / 2.0) * stitch_w
        z = -(j + 0.5) * pitch + v * pitch
        P = np.stack([x, -(depth + 1.15) * yr, z], 1)
        col = rgb[np.asarray(pattern(k, j, cols)) % len(rgb)]
        if j % 2:
            P, col = P[::-1], col[::-1]
        pts_all.append(P)
        col_all.append(col)
        edge.append(((a - cols / 2.0) * stitch_w, (b - cols / 2.0) * stitch_w, -(j + 0.5) * pitch))
    if not pts_all:
        return
    P = np.concatenate(pts_all) @ R.T + T
    Y.strand(P, yr, np.concatenate(col_all), fuzz)
    # core: a thin slab of wool behind the loops
    import bmesh
    bm = bmesh.new()
    th = thickness or yr * 1.6
    left = [(x0 + yr * 0.6, z) for x0, _, z in edge]
    right = [(x1 - yr * 0.6, z) for _, x1, z in edge]
    ring = [(left[0][0], left[0][1] + pitch * 0.5)] + left + [(left[-1][0], left[-1][1] - pitch * 0.5), (right[-1][0], right[-1][1] - pitch * 0.5)] + right[::-1] + [(right[0][0], right[0][1] + pitch * 0.5)]
    front = [bm.verts.new((x, 0.0, z)) for x, z in ring]
    back = [bm.verts.new((x, th, z)) for x, z in ring]
    try:
        bm.faces.new(front)
        bm.faces.new(back[::-1])
    except Exception:
        pass
    for i in range(len(ring)):
        k = (i + 1) % len(ring)
        bm.faces.new((front[i], back[i], back[k], front[k]))
    import bmesh as _b
    _b.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = C.finish_mesh('Slab', bm, False, _wool(core or colors[0], 0.3), location=location, rotation=rotation)
    Y.objects.append(ob)


def pompom(Y, centre, radius, colors, yarn_r=0.011, count=None):
    """A pom-pom: a ball of cut yarn ends."""
    rs = Y.rs
    n = count or int(2600 * (radius / 0.2) ** 2 * (0.011 / yarn_r) ** 2 * 0.9)
    d = rs.normal(size=(n, 3))
    d /= np.linalg.norm(d, axis=1)[:, None]
    side = rs.normal(size=(n, 3))
    side -= (side * d).sum(1)[:, None] * d
    side /= np.linalg.norm(side, axis=1)[:, None]
    length = radius * rs.uniform(0.86, 1.04, n)
    bend = rs.normal(size=n) * 0.22
    steps = 4
    rgb = np.stack([_rgb(c) for c in colors])
    col = rgb[rs.integers(0, len(rgb), n)] * rs.uniform(0.9, 1.06, (n, 1)).astype('f4')
    c = np.asarray(centre, 'f8')
    for i in range(0, n, 4000):
        sl = slice(i, i + 4000)
        m = len(d[sl])
        pts = np.empty((m, steps, 3), 'f4')
        for k in range(steps):
            f = 0.3 + 0.7 * k / (steps - 1)
            pts[:, k] = c + (d[sl] + side[sl] * (bend[sl] * f * f)[:, None]) * (length[sl] * f)[:, None]
        Y.P.append(pts.reshape(-1, 3))
        Y.R.append(np.full(m * steps, yarn_r, 'f4'))
        Y.Cc.append(np.repeat(col[sl][:, None, :], steps, 1).reshape(-1, 3))
        Y.sizes.extend([steps] * m)
    Y.bounds.append((c + d[:200] * radius).astype('f4'))
    ob = C.add_sphere(radius * 0.7, _wool(colors[0], 0.25), segments=32, location=tuple(centre))
    Y.objects.append(ob)


def cord(Y, pts, radius, colors, twist=1.0, fuzz=0.6):
    """A two-ply cord along a polyline."""
    P = np.asarray(pts, 'f8')
    seg = np.linalg.norm(np.diff(P, axis=0), axis=1)
    s = np.concatenate([[0.0], np.cumsum(seg)])
    n = max(8, int(s[-1] / (radius * 0.9)))
    si = np.linspace(0, s[-1], n)
    Q = np.stack([np.interp(si, s, P[:, i]) for i in range(3)], 1)
    t = np.gradient(Q, axis=0)
    t /= np.linalg.norm(t, axis=1)[:, None]
    a = np.cross(t, (0.0, 1.0, 0.0))
    a /= np.maximum(np.linalg.norm(a, axis=1), 1e-9)[:, None]
    b = np.cross(t, a)
    ph = si / (radius * 5.5) * twist
    for i, c in enumerate(colors[:2] if len(colors) > 1 else [colors[0], colors[0]]):
        o = ph + math.pi * i
        Y.strand(Q + (a * np.cos(o)[:, None] + b * np.sin(o)[:, None]) * radius * 0.52, radius * 0.62, _rgb(c), fuzz)


# ----------------------------------------------------------------------------- palette roles
def _pale(h):
    return min(C.hex_to_rgb(h)) > 0.8


def _roles(ctx):
    cols = list(ctx.colors)
    vivid = [c for c in cols if not _pale(c)] or cols
    pale = next((c for c in cols if _pale(c)), None) or C.mix_hex(max(cols, key=C.luminance), '#ffffff', 0.82)
    return vivid, pale


def _dome(r, h, z0=0.0, n=40, power=2.3):
    return [(r * (1 - (i / n) ** power) ** 0.5, z0 + h * i / n) for i in range(n + 1)]


def _ball(r, n=48):
    return [(r * math.sin(math.pi * i / n), r - r * math.cos(math.pi * i / n)) for i in range(n + 1)]


# ----------------------------------------------------------------------------- motifs
def _winter(ctx, Y, flip):
    """A bobble hat with a colourwork band and a ribbed brim, a pair of mittens and loose pom-poms."""
    vivid, pale = _roles(ctx)
    main, second, third = vivid[0], vivid[1 % len(vivid)], vivid[2 % len(vivid)]
    w = 0.066

    # --- hat
    hx, hy = -0.5 * flip, 0.12
    brim_h, r_brim, r_body = 0.27, 0.64, 0.6
    prof = [(r_brim - 0.03, 0.0), (r_brim, 0.03), (r_brim, brim_h - 0.02), (r_brim - 0.035, brim_h + 0.012)] + _dome(r_body, 0.78, brim_h + 0.02, power=2.5)[1:]
    brim_len = 0.03 * 1.4 + (brim_h - 0.05) + 0.045

    def hat_cols(k, j, n):
        s = j * w * 0.74
        if s < brim_len:
            return np.full(k.shape, 1)
        r = j - int(brim_len / (w * 0.74)) - 2
        if 0 <= r < 7:
            zig = (k + (r if r < 4 else 6 - r)) % 4
            if r in (0, 6):
                return np.full(k.shape, 2)
            return np.where(zig == 0, 2, 0)
        if r in (9, 10):
            return np.full(k.shape, 3)
        return np.zeros(k.shape, int)

    knit_lathe(Y, prof, w, [main, second, pale, third], hat_cols, lambda s: 'rib2' if s < brim_len else 'stock',
               location=(hx, hy, 0.0), rotation=(0, 0, math.radians(8)), core=main)
    pompom(Y, (hx, hy, brim_h + 0.78 + 0.13), 0.2, [second, pale] if not _pale(second) else [second])

    # --- mittens: flattened, ribbed cuffs, a thumb each; they stand leaning on each other
    def mitten(x, y, lean, yaw, colr, cuff, side):
        mw = 0.056
        prof = [(0.17, 0.0), (0.185, 0.02), (0.185, 0.2), (0.2, 0.24), (0.24, 0.4)] + [(0.24 * math.cos(a) ** 0.8, 0.62 + 0.26 * math.sin(a)) for a in np.linspace(0, math.pi / 2, 16)]
        rot = (0.0, math.radians(lean), math.radians(yaw))
        knit_lathe(Y, prof, mw, [colr, cuff, pale], lambda k, j, n: np.where(j < 5, 1, np.where((j == 7) | (j == 8), 2, 0)) + 0 * k,
                   lambda s: 'rib1' if s < 0.23 else 'stock', location=(x, y, 0.0), rotation=rot, squash=(1.0, 0.5), core=colr)
        # thumb
        R, T = _xf((x, y, 0.0), rot)
        base = np.array((0.2 * side, 0.0, 0.34)) @ R.T + T
        tprof = [(0.075, 0.0), (0.08, 0.1)] + [(0.08 * math.cos(a), 0.14 + 0.08 * math.sin(a)) for a in np.linspace(0, math.pi / 2, 10)]
        knit_lathe(Y, tprof, mw, [colr], lambda k, j, n: 0 * k, 'stock', location=tuple(base), rotation=(0.0, math.radians(lean + 38 * side), math.radians(yaw)),
                   squash=(1.0, 0.62), core=colr)

    mitten(0.52 * flip, -0.22, -9 * flip, 14 * flip, second, main, flip)
    mitten(1.0 * flip, 0.02, 10 * flip, -10 * flip, second, main, -flip)

    # --- loose pom-poms
    pompom(Y, (0.16 * flip, -0.62, 0.105), 0.105, [third if not _pale(third) else main])
    pompom(Y, (-0.08 * flip, -0.8, 0.07), 0.07, [pale])
    return (0.0, -1.0, 0.2)


def _shapes(ctx, Y, flip):
    """Abstract knitted solids: a striped ball, a cone, a pouf with a small ball, a ring."""
    rng = ctx.rng
    vivid, pale = _roles(ctx)
    order = list(vivid)
    rng.shuffle(order)
    v = lambda i: order[i % len(order)]
    w = 0.062

    # big ball, wide stripes
    knit_lathe(Y, _ball(0.56), w, [v(0), pale], lambda k, j, n: ((j // 4) % 2) + 0 * k, 'stock', location=(-0.5 * flip, 0.3, 0.0),
               rotation=(math.radians(-14), math.radians(10 * flip), 0), core=v(0))
    # cone
    cone = C.fillet_profile([(0.0, 0.0), (0.4, 0.0), (0.42, 0.03), (0.02, 1.1), (0.0, 1.1)], 0.03)
    knit_lathe(Y, cone, w, [v(1), v(2)], lambda k, j, n: np.where(j % 6 == 5, 1, 0) + 0 * k, lambda s: 'stock', location=(0.56 * flip, 0.38, 0.0), s0=0.4, core=v(1))
    # pouf in garter ridges, a small seed-stitch ball on it
    pouf = [(0.0, 0.0)] + [(0.34 + 0.1 * math.sin(a), 0.16 - 0.16 * math.cos(a)) for a in np.linspace(0, math.pi, 20)] + [(0.0, 0.32)]
    knit_lathe(Y, pouf, w, [v(2)], lambda k, j, n: 0 * k, 'garter', location=(0.34 * flip, -0.42, 0.0), core=v(2))
    knit_lathe(Y, _ball(0.2), w * 0.82, [v(3), pale], lambda k, j, n: 0 * k, 'seed', location=(0.36 * flip, -0.42, 0.31), rotation=(math.radians(20), 0, 0), core=v(3))
    # ring (a knitted doughnut) leaning on the big ball
    ring = [(0.3 + 0.115 * math.cos(a), 0.115 * math.sin(a)) for a in np.linspace(-math.pi, math.pi, 40)]
    knit_lathe(Y, ring, w * 0.9, [v(3), v(1)], lambda k, j, n: np.where((k // 4) % 2 == 0, 0, 1), 'stock',
               location=(-0.56 * flip, -0.52, 0.4), rotation=(math.radians(76), 0, math.radians(-16 * flip)), core=v(3))
    pompom(Y, (1.02 * flip, -0.3, 0.1), 0.1, [pale])
    pompom(Y, (-0.02 * flip, -0.78, 0.075), 0.075, [v(0)])
    return (0.0, -1.0, 0.2)


def _bunting(ctx, Y, flip):
    """A garland of knitted pennants on a two-ply cord, with a string of pom-poms above."""
    rng = ctx.rng
    vivid, pale = _roles(ctx)
    v = lambda i: vivid[i % len(vivid)]
    span, sag = 3.3, 0.42
    cat = lambda x, s=sag, sp=span: s * ((2 * x / sp) ** 2 - 1.0)
    xs = np.linspace(-span / 2, span / 2, 120)
    line = np.stack([xs, np.zeros_like(xs), cat(xs)], 1)
    cord(Y, line, 0.014, [pale, v(1)])
    w, cols_n = 0.03, 18
    stitches = ['stock', 'garter', 'stock', 'seed', 'stock']
    rows_n = 31

    def tri(j):
        half = cols_n / 2 * (1 - j / rows_n)
        a, b = int(round(cols_n / 2 - half)), int(round(cols_n / 2 + half))
        return (a, b) if b - a >= 1 else None

    pats = [lambda k, j, n: ((j // 3) % 2) + 0 * k,
            lambda k, j, n: 0 * k,
            lambda k, j, n: np.where((j % 6 == 2) & (k % 4 == (j // 6) % 4 // 2 * 2), 1, 0),
            lambda k, j, n: 0 * k,
            lambda k, j, n: np.where((j > 2) & (j < 6), 1, 0) + 0 * k]
    for i in range(5):
        x = (i - 2) * 0.62 * flip
        slope = math.atan(8 * sag * x / span ** 2)
        knit_flat(Y, tri, cols_n, rows_n, w, [v(i), pale if i != 3 else v(i + 2)], pats[i], stitches[i], location=(x, -0.02, cat(x) - 0.012),
                  rotation=(math.radians(rng.uniform(-3, 3)), -slope, 0), core=v(i))
    # tassel pom-poms where the cord is tied off
    for sx in (-1, 1):
        pompom(Y, (sx * span / 2, 0.0, cat(span / 2) - 0.02), 0.085, [v(1 if sx < 0 else 2)], yarn_r=0.009)
    # pom-pom string above
    sp2, sag2, lift = 2.5, 0.26, 0.42
    xs2 = np.linspace(-sp2 / 2, sp2 / 2, 80)
    cord(Y, np.stack([xs2, np.full_like(xs2, 0.06), lift + cat(xs2, sag2, sp2)], 1), 0.008, [v(0), v(0)])
    for i in range(7):
        x = (i - 3) * sp2 / 6.6
        pompom(Y, (x, 0.05, lift + cat(x, sag2, sp2) - 0.03), 0.075 if i % 2 else 0.06, [v(i + 1) if i % 3 else pale], yarn_r=0.008)
    return (0.0, -1.0, 0.04)


MOTIFS = {'winter': _winter, 'bunting': _bunting, 'shapes': _shapes}


def _fit(Y, view, margin=1.04, standing=True):
    """Shift everything so that what the camera sees is centred on the origin.
    Returns (width, height, shift) — the yarn is moved when the curve objects are made."""
    d = np.array(view) / np.linalg.norm(view)
    up = np.array((0.0, -d[2], -d[1]))
    up = up if up[2] > 0 else -up
    pts = np.concatenate(Y.bounds).astype('f8')
    xs, ys = pts[:, 0], pts @ up
    cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
    shift = np.array((-cx, 0.0, -cy / up[2]))
    return (xs.max() - xs.min()) * margin + 0.06, (ys.max() - ys.min()) * margin + 0.06, shift


def build(ctx):
    pal = ctx.palette
    flip = -1.0 if ctx.mirror else 1.0
    p = ctx.params
    motif = str(p.get('motif', 'winter')).lower()
    if motif not in MOTIFS:
        motif = 'winter'
    try:
        ctx.scene.cycles_curves.shape = 'THICK'          # yarn is a round tube, not a ribbon
        ctx.scene.cycles_curves.subdivisions = 2
    except Exception:
        pass
    Y = Yarn(ctx)
    view = MOTIFS[motif](ctx, Y, flip)
    W, H, shift = _fit(Y, view)
    for arr in Y.P:
        arr += shift.astype('f4')
    for arr in Y.fP:
        arr += shift.astype('f4')
    for ob in Y.objects:
        ob.location = (ob.location.x + shift[0], ob.location.y, ob.location.z + shift[2])
    Y.finish(float(p.get('fuzz', 1.0)))
    floor = float(shift[2])

    # --- set: plain sweep in the poster colour (a wall right behind the garland)
    sheet = C.material('Sheet', pal['bg'], roughness=0.95, specular=0.05, sheen=0.1)
    if motif == 'bunting':
        C.add_backdrop(sheet, floor_z=floor - 6.0, wall_y=0.32, radius=1.0)
    else:
        C.add_backdrop(sheet, floor_z=floor, wall_y=2.6, radius=2.0)

    # --- light: soft key raking across the stitches from the copy side, fill, warm rim on the wool only
    cy = ctx.scene.cycles
    cy.max_bounces, cy.diffuse_bounces = 5, 2
    C.set_world('#ffffff', 0.34)
    zf = floor if motif != 'bunting' else -H / 2
    C.add_area_light((-5.6 * flip, -5.2, zf + 7.0), energy=float(p.get('key', 1150)), size=4.5, target=(0.3 * flip, 0.6, zf + 0.4))
    warm = float(p.get('rim', 1.0))
    if warm > 0 and motif != 'bunting':
        rims = [C.add_area_light((3.4 * flip, 2.2, zf + 3.0), energy=420 * warm, size=1.6, color='#ffcf9a', target=(0, 0, zf + 0.8)),
                C.add_area_light((-3.0 * flip, 2.3, zf + 2.4), energy=150 * warm, size=1.6, color='#ffe2c4', target=(0, 0, zf + 0.8))]
        try:
            coll = bpy.data.collections.new('Wool')
            for ob in Y.objects:
                coll.objects.link(ob)
            for lamp in rims:
                lamp.light_linking.receiver_collection = coll
        except Exception:
            for lamp in rims:
                lamp.data.energy *= 0.35
    ctx.frame(width=W, height=H, fov=24, direction=view)
