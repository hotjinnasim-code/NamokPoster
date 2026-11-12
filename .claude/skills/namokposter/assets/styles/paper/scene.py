"""Paper Cut — a layered cut-paper diorama seen through a round (or arched) window in a sheet of
the poster's background colour: hills or waves stacked in depth, each casting a soft shadow."""
import math

import bmesh
import bpy

import common as C


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
    for _ in range(40):                       # pull the chroma in until the colour fits sRGB
        if all(-0.001 <= v <= 1.001 for v in out):
            break
        c *= 0.94
        out = rgb(c)

    def enc(v):
        v = min(1.0, max(0.0, v))
        return 12.92 * v if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055
    return '#' + ''.join('%02x' % round(255 * enc(v)) for v in out)


def _ramp(stops, t):
    """Interpolate hex colours in OKLCH (hue takes the short way round), so in-between sheets stay
    clean instead of going grey like an RGB blend of two different hues."""
    x = min(max(t, 0.0), 1.0) * (len(stops) - 1)
    i = min(int(x), len(stops) - 2)
    f = x - i
    (L0, c0, h0), (L1, c1, h1) = _to_oklch(stops[i]), _to_oklch(stops[i + 1])
    if c0 < 0.03:
        h0 = h1
    if c1 < 0.03:
        h1 = h0
    dh = (h1 - h0 + math.pi) % math.tau - math.pi
    return _from_oklch(L0 + (L1 - L0) * f, c0 + (c1 - c0) * f, h0 + dh * f)


def _is_red(h):
    """True for strong reds, crimsons and red-oranges."""
    r, g, b = C.hex_to_rgb(h)
    hi, lo = max(r, g, b), min(r, g, b)
    if hi < 0.45 or hi - lo < 0.45 * hi:
        return False
    hue = (60 * ((g - b) / (hi - lo)) % 360) if hi == r else (120 + 60 * (b - r) / (hi - lo)) if hi == g else (240 + 60 * (r - g) / (hi - lo))
    return hue >= 338 or hue <= 26


def _disc_colour(accent, sky):
    """Colour of the sun / moon. It is always a plain disc and never red. On a light sky it is a
    pale warm tone — soft yellow or apricot, whichever separates better from the sky; a saturated
    disc appears only on a dark sky, where the accent is used unless it is red or too dark (then a
    pale moon-yellow)."""
    if C.luminance(sky) < 0.2:
        if not _is_red(accent) and C.luminance(accent) > 0.3:
            return accent
        return _from_oklch(0.9, 0.09, math.radians(95))
    _, c_sky, h_sky = _to_oklch(sky)
    hues = [92.0, 72.0]
    if c_sky > 0.02:
        hues.sort(key=lambda h: -abs((math.degrees(h_sky) - h + 180) % 360 - 180))
    return _from_oklch(0.92, 0.10, math.radians(hues[0]))


# ----------------------------------------------------------------------------- paper
def _paper(name, color, grain=1.0, specular=0.18):
    """Matte sheet with a fine fibre relief (``grain`` 0 = smooth card)."""
    mat = C.material(name, color, roughness=0.88, specular=specular, sheen=0.15 if specular else 0.0)
    if grain <= 0:
        return mat
    try:
        nt = mat.node_tree
        bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        tc = nt.nodes.new('ShaderNodeTexCoord')
        noise = nt.nodes.new('ShaderNodeTexNoise')
        noise.inputs['Scale'].default_value = 150.0
        noise.inputs['Detail'].default_value = 2.0
        noise.inputs['Roughness'].default_value = 0.6
        bump = nt.nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = min(1.0, 0.3 * grain)
        bump.inputs['Distance'].default_value = 0.006
        nt.links.new(tc.outputs['Object'], noise.inputs['Vector'])
        nt.links.new(noise.outputs[0], bump.inputs['Height'])
        nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    except Exception:
        pass
    return mat


def _mesh(name, bm, mat):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    me.materials.append(mat)
    return ob


def _sheet(name, top, y, thick, mat, x0=-1.6, x1=1.6, bottom=-1.7, n=220, extra=()):
    """A sheet standing at depth ``y`` between ``bottom`` (a number or a function of x) and the cut
    edge ``top(x)``. ``extra`` lists x positions that must be sampled exactly (sharp tips)."""
    low = bottom if callable(bottom) else (lambda x: bottom)
    xs = sorted(set([x0 + (x1 - x0) * i / n for i in range(n + 1)] + [x for x in extra if x0 < x < x1]))
    bm = bmesh.new()
    cols = []
    for x in xs:
        z, zb = top(x), low(x)
        z = max(z, zb + 1e-4)
        cols.append((bm.verts.new((x, y, zb)), bm.verts.new((x, y, z)),
                     bm.verts.new((x, y + thick, z)), bm.verts.new((x, y + thick, zb))))
    for a, b in zip(cols[:-1], cols[1:]):
        bm.faces.new((a[0], b[0], b[1], a[1]))      # front
        bm.faces.new((a[1], b[1], b[2], a[2]))      # cut edge
        bm.faces.new((a[2], b[2], b[3], a[3]))      # back
    return _mesh(name, bm, mat)


def _cloud(name, centre, width, rng, y, thick, mat):
    """Scalloped cloud: a rounded bar with three or four bumps on top."""
    cx, cz = centre
    rb = width * 0.1
    xa, xb = -width / 2 + rb, width / 2 - rb
    n = rng.choice((3, 3, 4))
    bumps = []
    for i in range(n):
        t = (i + 0.5) / n
        r = width * rng.uniform(0.15, 0.2) * (1.25 if i == (n // 2) else 0.95)
        c = xa + (xb - xa) * t + rng.uniform(-0.02, 0.02) * width
        c = min(max(c, -width / 2 + r), width / 2 - r)
        bumps.append((c, r))

    def bar(x):
        d = max(xa - x, 0.0, x - xb)
        return math.sqrt(max(0.0, rb * rb - d * d))

    def top(x):
        x -= cx
        return cz + max([bar(x)] + [math.sqrt(max(0.0, r * r - (x - c) ** 2)) for c, r in bumps])

    return _sheet(name, top, y, thick, mat, x0=cx - width / 2, x1=cx + width / 2, bottom=lambda x: cz - bar(x - cx), n=120)


def _pine(u):
    """Height (0..1) of a three-tier pine silhouette at distance ``u`` (0 = trunk, 1 = widest)."""
    if u >= 1.0:
        return -1.0
    tiers = (((0.0, 1.0), (0.42, 0.58)), ((0.16, 0.62), (0.72, 0.28)), ((0.3, 0.36), (1.0, 0.0)))
    return max(t + (b - t) * (u - ut) / (ub - ut) for (ut, t), (ub, b) in tiers if ut <= u <= ub)


def _disc(name, centre, radius, y, thick, mat, n=96):
    bm = bmesh.new()
    front = [bm.verts.new((centre[0] + radius * math.cos(math.tau * i / n), y, centre[1] + radius * math.sin(math.tau * i / n))) for i in range(n)]
    back = [bm.verts.new((v.co.x, y + thick, v.co.z)) for v in front]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    for i in range(n):
        k = (i + 1) % n
        bm.faces.new((front[i], back[i], back[k], front[k]))
    return _mesh(name, bm, mat)


def _window_outline(kind, n=288):
    """Outline of the opening, counter-clockwise, centred on the origin. Returns (points, radius)."""
    if kind == 'arch':
        w, top, bot = 0.74, 0.3, -1.04
        pts = [(w * math.cos(math.pi * i / (n // 2)), top + w * math.sin(math.pi * i / (n // 2))) for i in range(n // 2 + 1)]
        side = n // 5
        pts += [(-w, top + (bot - top) * i / side) for i in range(1, side + 1)]
        pts += [(-w + 2 * w * i / side, bot) for i in range(1, side + 1)]
        pts += [(w, bot + (top - bot) * i / side) for i in range(1, side)]
        return pts, math.hypot(w, bot)
    return [(math.cos(math.tau * i / n), math.sin(math.tau * i / n)) for i in range(n)], 1.0


def _mat_board(outline, mat, bevel=0.022, half=1.7, far=140.0):
    """The front sheet: a huge wall with the window cut out of it, with a small bevelled edge
    (like a picture mount) so the opening reads as a crisp outline."""
    bm = bmesh.new()
    n = len(outline)
    inner, lip, outer = [], [], []
    for x, z in outline:
        d = math.hypot(x, z)
        k = half / max(abs(x), abs(z))
        inner.append(bm.verts.new((x, bevel, z)))                                  # back of the board
        lip.append(bm.verts.new((x * (1 + bevel / d), 0.0, z * (1 + bevel / d))))  # front edge of the cut
        outer.append(bm.verts.new((x * k, 0.0, z * k)))                            # on a square around the window
    on_x = lambda v: abs(v.co.x) >= abs(v.co.z) - 1e-9          # lies on a left/right side of the square
    for i in range(n):
        k = (i + 1) % n
        bm.faces.new((inner[i], inner[k], lip[k], lip[i]))
        bm.faces.new((lip[i], lip[k], outer[k], outer[i]))
        a, b = outer[i], outer[k]
        if on_x(a) != on_x(b) and abs(abs(a.co.x) - abs(a.co.z)) > 1e-6 and abs(abs(b.co.x) - abs(b.co.z)) > 1e-6:
            corner = bm.verts.new((math.copysign(half, a.co.x), 0.0, math.copysign(half, a.co.z)))
            bm.faces.new((a, b, corner))                       # the square's corner between two sides
    for x0, x1, z0, z1 in ((-far, -half, -far, far), (half, far, -far, far), (-half, half, half, far), (-half, half, -far, -half)):
        bm.faces.new([bm.verts.new((x, 0.0, z)) for x, z in ((x0, z0), (x1, z0), (x1, z1), (x0, z1))])   # the rest of the wall
    return _mesh('Board', bm, mat)


def build(ctx):
    rng, pal = ctx.rng, ctx.palette
    flip = -1.0 if ctx.mirror else 1.0
    p = ctx.params
    n_layers = max(5, min(7, int(p.get('layers', 6))))
    window = str(p.get('window', 'circle')).lower()
    edge = str(p.get('edge', 'hills')).lower()
    gap = 0.05 * float(p.get('depth', 1.0))
    grain = float(p.get('grain', 1.0))
    paper = lambda name, color: _paper(name, color, grain)
    thick = 0.006

    # --- colours: light sky and deep foreground on a light poster; on a dark poster the ramp runs
    #     the other way (deep night sky, pale hills) so the window still stands out from the wall
    cols = sorted(ctx.colors, key=lambda h: -C.luminance(h))
    rev = str(p.get('reverse', 'auto')).lower()
    night = ctx.dark if rev == 'auto' else rev in ('true', '1', 'yes')
    if len(cols) < 2:
        cols = [C.mix_hex(cols[0], '#ffffff', 0.5), cols[0], C.mix_hex(cols[0], '#000000', 0.55)]
    if night:
        stops = cols[::-1]
    else:
        stops = ([C.mix_hex(cols[0], '#ffffff', 0.62)] if C.luminance(cols[0]) < 0.75 else []) + cols
    tint = [_ramp(stops, i / (n_layers - 1)) for i in range(n_layers)]      # 0 = sky … n-1 = front

    # --- front sheet with the window, in the poster background colour
    outline, radius = _window_outline(window)
    _mat_board(outline, _paper('Board', pal['bg'], 0.7 * grain, specular=0.0))   # no gloss: renders at exactly bg

    # --- sheets, back to front
    depth = [gap * (n_layers - i) for i in range(n_layers)]
    _sheet('Sky', lambda x: 1.7, depth[0], thick, paper('Sky', tint[0]))
    hi, lo = (0.3, -0.62) if window != 'arch' else (0.34, -0.72)
    n_trees = max(0, int(p.get('trees', 5))) if edge != 'waves' else 0
    tree_layer = 2 if n_layers > 5 else 1
    tops = []
    for i in range(1, n_layers):
        t = (i - 1) / max(1, n_layers - 2)
        base = hi + (lo - hi) * t
        amp = 0.17 - 0.07 * t
        if edge == 'waves':
            lam, ph = 0.62 - 0.1 * t, rng.uniform(0, math.tau)
            sway, ph2 = rng.uniform(1.6, 2.6), rng.uniform(0, math.tau)
            top = (lambda x, b=base, a=amp * 0.42, lam=lam, ph=ph, sway=sway, ph2=ph2:
                   b + a * math.sin(math.tau * x / lam + ph) + a * 0.9 * math.sin(math.tau * x / sway + ph2))
        else:
            l1, l2, l3 = rng.uniform(1.5, 2.5), rng.uniform(0.7, 1.05), rng.uniform(0.36, 0.5)
            p1, p2, p3 = (rng.uniform(0, math.tau) for _ in range(3))
            top = (lambda x, b=base, a=amp, l1=l1, l2=l2, l3=l3, p1=p1, p2=p2, p3=p3:
                   b + a * (0.62 * math.sin(math.tau * x / l1 + p1) + 0.3 * math.sin(math.tau * x / l2 + p2)
                            + 0.08 * math.sin(math.tau * x / l3 + p3)))
            if i == tree_layer and n_trees:
                # little pines standing on the ridge, grouped around its highest point; they are a
                # sheet of their own, two tints further along the ramp, so they read on any palette
                crest = max((k / 50.0 - 0.5 for k in range(51)), key=top)
                gx = crest - 0.075 * (n_trees - 1) * rng.uniform(0.7, 1.0)
                trees = []
                for k in range(n_trees):
                    h = rng.uniform(0.13, 0.2) * (1.15 if k == n_trees // 2 else 1.0)
                    trees.append((gx, top(gx) - 0.02, h, h * rng.uniform(0.3, 0.36)))
                    gx += rng.uniform(0.1, 0.17)
                pines = lambda x, trees=trees: max(b + h * _pine(abs(x - tx) / w) for tx, b, h, w in trees)
                marks = [tx + w * u * sgn + e for tx, b, h, w in trees for u in (0.0, 0.42, 0.72, 1.0) for sgn in (-1, 1) for e in (-1e-4, 1e-4)]
                _sheet('Pines', pines, depth[i] - 0.003, thick, paper('Pines', tint[min(i + 2, n_layers - 1)]),
                       x0=min(marks) - 0.01, x1=max(marks) + 0.01, bottom=lambda x, hill=top: hill(x) - 0.006, n=40, extra=marks)
        tops.append(top)
        _sheet('Layer%d' % i, top, depth[i], thick, paper('Paper%d' % i, tint[i]))

    # --- sun / moon: a plain round disc tucked behind the far ridge, with concentric paper rings
    #     as its glow. No rays; pale on a light sky and never red (see _disc_colour).
    sx = rng.uniform(0.12, 0.42) * rng.choice((-1, 1))
    r = 0.2
    sz = max(tops[0](sx) + r * rng.uniform(0.25, 0.7), 0.3)
    if p.get('disc', True):
        disc_col = _disc_colour(pal['accent'], tint[0])
        rings = max(0, min(3, int(p.get('rings', 2))))
        for k in range(rings, 0, -1):
            _disc('Halo%d' % k, (sx, sz), r * (1.0 + 0.42 * k), depth[0] - gap * (0.3 - 0.07 * k), thick * 0.5,
                  paper('Halo', C.mix_hex(tint[0], disc_col, 0.5 / (k + 0.6))))
        _disc('Disc', (sx, sz), r, depth[0] - gap * 0.3, thick, paper('Disc', disc_col))

    # --- a couple of clouds floating in front of the sky; punched-out stars at night
    reach = 1.0 if window != 'arch' else 0.7                 # how far sideways the sky runs up there
    cloud_col = C.mix_hex(tint[0], '#ffffff', 0.75 if not night else 0.22)
    side = -1.0 if sx > 0 else 1.0
    for k in range(max(0, int(p.get('clouds', 2)))):
        w = rng.uniform(0.4, 0.52) * (1.0 if k == 0 else 0.7)
        cx = (side * rng.uniform(0.2, 0.5) if k % 2 == 0 else -side * rng.uniform(0.3, 0.55)) * reach
        cz = rng.uniform(0.6, 0.72) if k % 2 == 0 else rng.uniform(0.42, 0.52)
        _cloud('Cloud%d' % k, (cx, cz), w, rng, depth[0] - gap * (0.62 + 0.08 * k), thick, paper('Cloud', cloud_col))
    if night and p.get('stars', True):
        star = paper('Star', C.mix_hex(cols[0], '#ffffff', 0.5))
        placed = 0
        for _ in range(300):
            x, z = rng.uniform(-0.85, 0.85) * reach, rng.uniform(0.2, 0.98)
            in_window = math.hypot(x, z) < 0.9 if window != 'arch' else math.hypot(x, max(0.0, z - 0.3)) < 0.66
            if not in_window or z < tops[0](x) + 0.06 or math.hypot(x - sx, z - sz) < 0.3:
                continue
            _disc('Star', (x, z), rng.choice((0.008, 0.011, 0.016)), depth[0] - gap * 0.12, thick * 0.5, star, n=14)
            placed += 1
            if placed >= 11:
                break

    # --- light: soft sky + a sun from the upper side nearest the copy, so shadows fall away from it
    ambient = 0.58
    sun_dir = (0.42 * flip, 0.8, -0.42)
    cos_wall = sun_dir[1] / math.sqrt(sum(v * v for v in sun_dir))
    C.set_world('#ffffff', ambient)
    C.add_sun(sun_dir, strength=(1.0 - ambient) * math.pi / cos_wall, angle=float(p.get('shadow', 14.0)))

    look = dict(fov=12, direction=(0.0, -1.0, 0.0))        # front-on, long lens: the circle stays a circle
    if window == 'arch':
        try:
            ctx.frame(width=1.48 * 1.1, height=2.08 * 1.1, **look)     # tall subject: fit the art rectangle
            return
        except TypeError:
            pass
    ctx.frame(radius=radius * 1.1, **look)
