"""Helpers for namokposter Blender scenes.

A scene file only has to define ``build(ctx)``. ``ctx`` (a :class:`Context`) owns the Blender scene,
the camera and the render settings, and offers small, version-tolerant helpers for meshes,
materials and lights so scene files stay short and keep working from Blender 3.6 to 5.x.

Coordinates: Blender's — X right, Y away from the camera, Z up. Build the subject around the
origin, then call ``ctx.frame(radius=...)`` once; it sizes and places the subject according to the
poster layout (so the same scene works for landscape, portrait and square posters).
"""
import math
import random

import bmesh
import bpy
from mathutils import Matrix, Vector

# --------------------------------------------------------------------------- colour


def hex_to_rgb(h):
    h = h.lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def col(h, alpha=1.0):
    """Hex colour -> linear RGBA tuple, which is what Blender shader inputs expect."""
    if isinstance(h, (tuple, list)):
        return tuple(h) if len(h) == 4 else (*h, alpha)
    r, g, b = hex_to_rgb(h)
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), alpha)


def mix_hex(a, b, t):
    ra, rb = hex_to_rgb(a), hex_to_rgb(b)
    return '#' + ''.join('%02x' % round(255 * (x + (y - x) * t)) for x, y in zip(ra, rb))


def luminance(h):
    r, g, b = (srgb_to_linear(c) for c in hex_to_rgb(h))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


# --------------------------------------------------------------------------- materials

# Principled BSDF socket names changed in Blender 4.0; try the new name first, then the old one.
_SOCKETS = {
    'base_color': ['Base Color'], 'roughness': ['Roughness'], 'metallic': ['Metallic'], 'ior': ['IOR'], 'alpha': ['Alpha'],
    'transmission': ['Transmission Weight', 'Transmission'],
    'specular': ['Specular IOR Level', 'Specular'],
    'emission': ['Emission Color', 'Emission'], 'emission_strength': ['Emission Strength'],
    'coat': ['Coat Weight', 'Clearcoat'], 'coat_roughness': ['Coat Roughness', 'Clearcoat Roughness'],
    'sheen': ['Sheen Weight', 'Sheen'], 'sheen_roughness': ['Sheen Roughness'],
    'subsurface': ['Subsurface Weight', 'Subsurface'], 'subsurface_radius': ['Subsurface Radius'],
    'subsurface_scale': ['Subsurface Scale'],
    'thin_film': ['Thin Film Thickness'], 'thin_film_ior': ['Thin Film IOR'],
    'anisotropic': ['Anisotropic'],
}


def _set(node, key, value):
    for name in _SOCKETS.get(key, [key]):
        sock = node.inputs.get(name)
        if sock is not None:
            try:
                sock.default_value = value
                return True
            except Exception:
                pass
    return False


def _node_tree(mat):
    try:
        mat.use_nodes = True  # no-op / deprecated on 5.x, required on older versions
    except Exception:
        pass
    return mat.node_tree


def material(name, color='#ffffff', roughness=0.45, metallic=0.0, **kw):
    """Principled material. Extra keywords: transmission, ior, emission (hex), emission_strength,
    coat, coat_roughness, sheen, subsurface, subsurface_radius, thin_film (nm), specular, alpha."""
    mat = bpy.data.materials.new(name)
    nt = _node_tree(mat)
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf is None:
        nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
        nt.links.new(bsdf.outputs[0], out.inputs[0])
    _set(bsdf, 'base_color', col(color))
    _set(bsdf, 'roughness', roughness)
    _set(bsdf, 'metallic', metallic)
    for k, v in kw.items():
        if k == 'emission':
            v = col(v)
        elif k == 'subsurface_radius':
            v = tuple(v)
        _set(bsdf, k, v)
    if kw.get('subsurface'):
        _set(bsdf, 'subsurface_radius', tuple(kw.get('subsurface_radius', (0.6, 0.35, 0.25))))
    mat.diffuse_color = col(color)
    return mat


def emission_material(name, color='#ffffff', strength=5.0, gradient=None, camera_visible=True):
    """Pure emitter. ``gradient=(hexA, hexB)`` blends along the object's local X — handy for softboxes
    that put a two-colour reflection on glossy/glass subjects."""
    mat = bpy.data.materials.new(name)
    nt = _node_tree(mat)
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Strength'].default_value = strength
    if gradient:
        tc = nt.nodes.new('ShaderNodeTexCoord')
        sep = nt.nodes.new('ShaderNodeSeparateXYZ')
        ramp = nt.nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].color = col(gradient[0])
        ramp.color_ramp.elements[1].color = col(gradient[1])
        nt.links.new(tc.outputs['Generated'], sep.inputs[0])
        nt.links.new(sep.outputs[0], ramp.inputs[0])
        nt.links.new(ramp.outputs[0], em.inputs['Color'])
    else:
        em.inputs['Color'].default_value = col(color)
    nt.links.new(em.outputs[0], out.inputs[0])
    return mat


# --------------------------------------------------------------------------- meshes


def _finish(name, bm, smooth=True, material_=None, location=(0, 0, 0), rotation=(0, 0, 0), scale=(1, 1, 1)):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    if smooth:
        me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = location
    ob.rotation_euler = rotation
    ob.scale = (scale, scale, scale) if isinstance(scale, (int, float)) else scale
    if material_ is not None:
        me.materials.append(material_)
    return ob


def weighted_normals(ob):
    """Keeps big flat faces flat on bevelled meshes while everything is shaded smooth."""
    me = ob.data
    if hasattr(me, 'use_auto_smooth'):  # Blender < 4.1
        me.use_auto_smooth = True
        me.auto_smooth_angle = math.radians(180)
    mod = ob.modifiers.new('WeightedNormal', 'WEIGHTED_NORMAL')
    mod.keep_sharp = True
    mod.weight = 100
    return ob


def add_sphere(radius=1.0, material_=None, segments=96, **kw):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=segments // 2, radius=radius)
    return _finish('Sphere', bm, True, material_, **kw)


def add_icosphere(radius=1.0, subdivisions=5, material_=None, **kw):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=radius)
    return _finish('Ico', bm, True, material_, **kw)


def add_box(size=(1, 1, 1), bevel=0.06, material_=None, segments=6, **kw):
    """Box with rounded edges. ``bevel`` is the edge radius in world units (0 = razor sharp)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    sx, sy, sz = (size, size, size) if isinstance(size, (int, float)) else size
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    if bevel > 0:
        b = min(bevel, 0.49 * min(sx, sy, sz))
        try:
            bmesh.ops.bevel(bm, geom=list(bm.edges), offset=b, segments=segments, profile=0.5, affect='EDGES')
        except TypeError:
            bmesh.ops.bevel(bm, geom=list(bm.edges), offset=b, segments=segments, profile=0.5)
    ob = _finish('Box', bm, True, material_, **kw)
    return weighted_normals(ob) if bevel > 0 else ob


def add_torus(major=1.0, minor=0.28, material_=None, major_segments=128, minor_segments=48, **kw):
    bm = bmesh.new()
    rings = []
    for i in range(major_segments):
        a = 2 * math.pi * i / major_segments
        ring = []
        for j in range(minor_segments):
            b = 2 * math.pi * j / minor_segments
            r = major + minor * math.cos(b)
            ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), minor * math.sin(b))))
        rings.append(ring)
    for i in range(major_segments):
        r0, r1 = rings[i], rings[(i + 1) % major_segments]
        for j in range(minor_segments):
            k = (j + 1) % minor_segments
            bm.faces.new((r0[j], r1[j], r1[k], r0[k]))
    return _finish('Torus', bm, True, material_, **kw)


def add_lathe(profile, material_=None, segments=96, name='Lathe', **kw):
    """Solid of revolution around Z from ``profile`` = [(radius, z), ...] listed bottom to top.
    A radius of 0 at either end closes the shape with a point."""
    bm = bmesh.new()
    rings = []
    for (r, z) in profile:
        if r <= 1e-6:
            rings.append([bm.verts.new((0, 0, z))])
        else:
            rings.append([bm.verts.new((r * math.cos(2 * math.pi * i / segments), r * math.sin(2 * math.pi * i / segments), z)) for i in range(segments)])
    for a, b in zip(rings[:-1], rings[1:]):
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
    return _finish(name, bm, True, material_, **kw)


def _fillet_profile(points, radius, steps=8):
    """Round the corners of an open (radius, z) polyline so lathed shapes get soft edges."""
    if radius <= 0 or len(points) < 3:
        return list(points)
    out = [points[0]]
    for p0, p1, p2 in zip(points[:-2], points[1:-1], points[2:]):
        a, b, c = Vector(p0), Vector(p1), Vector(p2)
        d0, d1 = (a - b), (c - b)
        r = min(radius, 0.45 * d0.length, 0.45 * d1.length)
        if r <= 1e-6:
            out.append(p1)
            continue
        s, e = b + d0.normalized() * r, b + d1.normalized() * r
        for i in range(steps + 1):
            t = i / steps
            q = (1 - t) ** 2 * s + 2 * (1 - t) * t * b + t ** 2 * e  # quadratic bezier ~ arc
            out.append((q.x, q.y))
    out.append(points[-1])
    return out


def add_cylinder(radius=0.5, height=1.0, bevel=0.04, material_=None, **kw):
    h = height / 2
    prof = _fillet_profile([(0, -h), (radius, -h), (radius, h), (0, h)], bevel)
    return add_lathe(prof, material_, name='Cylinder', **kw)


def add_cone(radius=0.5, height=1.0, bevel=0.04, material_=None, **kw):
    h = height / 2
    prof = _fillet_profile([(0, -h), (radius, -h), (0, h)], bevel)
    return add_lathe(prof, material_, name='Cone', **kw)


def add_capsule(radius=0.3, height=1.2, material_=None, **kw):
    h = max(0.0, height / 2 - radius)
    prof = [(radius * math.cos(a), -h + radius * math.sin(a)) for a in [(-math.pi / 2) + (math.pi / 2) * i / 16 for i in range(17)]]
    prof += [(radius * math.cos(a), h + radius * math.sin(a)) for a in [(math.pi / 2) * i / 16 for i in range(17)]]
    prof[0] = (0, prof[0][1])
    prof[-1] = (0, prof[-1][1])
    return add_lathe(prof, material_, name='Capsule', **kw)


def add_hemisphere(radius=0.5, material_=None, **kw):
    prof = [(0, 0)] + [(radius * math.cos(a), radius * math.sin(a)) for a in [(math.pi / 2) * i / 24 for i in range(25)]]
    prof[-1] = (0, radius)
    return add_lathe(_fillet_profile(prof[:2] + prof[2:], 0), material_, name='Hemisphere', **kw)


def add_plane(size=10.0, material_=None, **kw):
    bm = bmesh.new()
    s = size / 2
    bm.faces.new([bm.verts.new(p) for p in ((-s, -s, 0), (s, -s, 0), (s, s, 0), (-s, s, 0))])
    return _finish('Plane', bm, False, material_, **kw)


def add_extrusion(outline, depth=0.3, bevel=0.02, material_=None, name='Extrusion', **kw):
    """Extrude a 2D outline given in the XZ plane ([(x, z), ...], any simple polygon) along Y."""
    bm = bmesh.new()
    front = [bm.verts.new((x, -depth / 2, z)) for x, z in outline]
    back = [bm.verts.new((x, depth / 2, z)) for x, z in outline]
    n = len(outline)
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    for i in range(n):
        k = (i + 1) % n
        bm.faces.new((front[i], back[i], back[k], front[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = _finish(name, bm, True, material_, **kw)
    if bevel > 0:
        mod = ob.modifiers.new('Bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = 4
        mod.limit_method = 'ANGLE'
        mod.angle_limit = math.radians(40)
    return weighted_normals(ob)


def add_arch(width=1.0, height=1.6, thickness=0.22, depth=0.35, material_=None, **kw):
    """A doorway arch standing on z=0, centred on x."""
    w, t = width / 2, thickness
    r_in = w - t
    top = height - w  # where the outer semicircle starts
    pts = [(-w, 0), (-w, top)]
    pts += [(w * math.cos(a), top + w * math.sin(a)) for a in [math.pi - math.pi * i / 32 for i in range(1, 32)]]
    pts += [(w, top), (w, 0), (r_in, 0), (r_in, top)]
    pts += [(r_in * math.cos(a), top + r_in * math.sin(a)) for a in [math.pi * i / 32 for i in range(1, 32)]]
    pts += [(-r_in, top), (-r_in, 0)]
    return add_extrusion(pts, depth, 0.012, material_, name='Arch', **kw)


def add_backdrop(material_, floor_z=0.0, wall_y=4.0, radius=2.5, width=80.0, extent=60.0):
    """Seamless studio sweep: a floor that curves up into a back wall (no horizon line behind the copy)."""
    bm = bmesh.new()
    prof = [(-extent, floor_z), (wall_y - radius, floor_z)]
    prof += [(wall_y - radius + radius * math.sin(a), floor_z + radius - radius * math.cos(a)) for a in [(math.pi / 2) * i / 24 for i in range(1, 25)]]
    prof += [(wall_y, floor_z + extent)]
    left = [bm.verts.new((-width / 2, y, z)) for y, z in prof]
    right = [bm.verts.new((width / 2, y, z)) for y, z in prof]
    for i in range(len(prof) - 1):
        bm.faces.new((left[i], right[i], right[i + 1], left[i + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = _finish('Backdrop', bm, True, material_)
    # normals should face the camera (which sits at -Y, above the floor)
    me = ob.data
    if me.polygons[0].normal.z < 0:
        me.flip_normals()
    return ob


def displace_blob(ob, strength=0.25, scale=1.2, seed=0):
    """Organic wobble: displaces vertices along their normals with smooth 3D noise."""
    from mathutils import noise
    me = ob.data
    off = Vector((seed * 1.37, seed * -2.11, seed * 0.73))
    for v in me.vertices:
        n = noise.noise(v.co * scale + off)
        v.co += v.normal * (strength * n)
    me.update()
    return ob


def subsurf(ob, levels=2):
    mod = ob.modifiers.new('Subsurf', 'SUBSURF')
    mod.levels = levels
    mod.render_levels = levels
    return ob


# --------------------------------------------------------------------------- lights / world


def look_at(ob, target=(0, 0, 0), roll=0.0):
    d = Vector(target) - ob.location
    ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    if roll:
        ob.rotation_euler.rotate_axis('Z', roll)
    return ob


def add_area_light(location, energy=800.0, size=3.0, color='#ffffff', target=(0, 0, 0), size_y=None, spread=None):
    data = bpy.data.lights.new('Area', 'AREA')
    data.energy = energy
    data.color = col(color)[:3]
    data.size = size
    if size_y:
        data.shape = 'RECTANGLE'
        data.size_y = size_y
    if spread is not None and hasattr(data, 'spread'):
        data.spread = math.radians(spread)
    ob = bpy.data.objects.new('Area', data)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = location
    return look_at(ob, target)


def add_sun(direction=(-1, -1, -1), strength=3.0, angle=3.0, color='#ffffff'):
    """``direction`` is where the light travels to. ``angle`` (degrees) sets shadow softness."""
    data = bpy.data.lights.new('Sun', 'SUN')
    data.energy = strength
    data.color = col(color)[:3]
    data.angle = math.radians(angle)
    ob = bpy.data.objects.new('Sun', data)
    bpy.context.scene.collection.objects.link(ob)
    ob.rotation_euler = Vector(direction).to_track_quat('-Z', 'Y').to_euler()
    return ob


def add_spot_light(location, energy=800.0, color='#ffffff', target=(0, 0, 0), angle=45.0, blend=0.5, radius=0.2):
    """Spot lamp: a pool of light on the subject that leaves the backdrop dark (night scenes)."""
    data = bpy.data.lights.new('Spot', 'SPOT')
    data.energy = energy
    data.color = col(color)[:3]
    data.spot_size = math.radians(angle)
    data.spot_blend = blend
    data.shadow_soft_size = radius
    ob = bpy.data.objects.new('Spot', data)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = location
    return look_at(ob, target)


def add_point_light(location, energy=200.0, color='#ffffff', radius=0.2):
    data = bpy.data.lights.new('Point', 'POINT')
    data.energy = energy
    data.color = col(color)[:3]
    data.shadow_soft_size = radius
    ob = bpy.data.objects.new('Point', data)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = location
    return ob


def add_softbox(location, size=(3, 3), color='#ffffff', strength=6.0, target=(0, 0, 0), gradient=None, camera_visible=False):
    """An emissive card. Unlike a lamp it shows up as a shaped reflection in glossy and glass
    surfaces, which is what makes them look like a studio photo."""
    ob = add_plane(1.0, emission_material('Softbox', color, strength, gradient))
    ob.scale = (size[0], size[1], 1)
    ob.location = location
    look_at(ob, target)
    try:
        ob.visible_camera = camera_visible
        ob.visible_diffuse = True
    except Exception:
        pass
    return ob


def set_world(color='#ffffff', strength=1.0, top=None):
    """Uniform world colour, or a vertical gradient from ``color`` (horizon/bottom) to ``top``."""
    scene = bpy.context.scene
    world = bpy.data.worlds.new('World')
    scene.world = world
    nt = _node_tree(world)
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld')
    bg = nt.nodes.new('ShaderNodeBackground')
    bg.inputs['Strength'].default_value = strength
    if top:
        tc = nt.nodes.new('ShaderNodeTexCoord')
        sep = nt.nodes.new('ShaderNodeSeparateXYZ')
        mp = nt.nodes.new('ShaderNodeMapRange')
        mp.inputs[1].default_value = -0.3
        mp.inputs[2].default_value = 0.7
        mixn = nt.nodes.new('ShaderNodeMixRGB')
        mixn.inputs[1].default_value = col(color)
        mixn.inputs[2].default_value = col(top)
        nt.links.new(tc.outputs['Generated'], sep.inputs[0])
        nt.links.new(sep.outputs[2], mp.inputs[0])
        nt.links.new(mp.outputs[0], mixn.inputs[0])
        nt.links.new(mixn.outputs[0], bg.inputs['Color'])
    else:
        bg.inputs['Color'].default_value = col(color)
    nt.links.new(bg.outputs[0], out.inputs[0])
    return world


# --------------------------------------------------------------------------- context


class Context:
    """Everything a scene needs: palette, rng, layout info and the camera/render setup."""

    def __init__(self, job):
        self.job = job
        self.width, self.height = int(job['width']), int(job['height'])
        self.aspect = self.width / self.height
        self.orient = job.get('orient', 'landscape')
        self.palette = job['palette']
        self.colors = list(self.palette.get('colors') or [self.palette['accent']])
        self.params = job.get('params') or {}
        self.seed = int(job.get('seed', 1))
        self.rng = random.Random(self.seed)
        lay = job.get('layout') or {}
        self.focus = tuple(lay.get('focus', (0.5, 0.5)))
        self.art_size = float(lay.get('artSize', 0.8))
        self.text_rect = tuple(lay.get('text', (0, 0, 1, 1)))
        self.art_rect = tuple(lay.get('artRect', (0, 0, 1, 1)))     # where the subject goes (fractions, y down)
        self.quiet = [tuple(r) for r in lay.get('quiet', [])]         # nominal zones that carry type
        self.fill = float(lay.get('fill', 1.0))
        self.layout = lay.get('layout', 'left')
        # True when the subject sits left of the copy: scenes use it to flip lighting so shadows
        # fall away from the text instead of across it.
        self.mirror = self.focus[0] < 0.45
        self.quality = job.get('quality', 'standard')
        self._framed = False

        bpy.ops.wm.read_factory_settings(use_empty=True)
        self.scene = scene = bpy.context.scene
        self._setup_render(job)

        cam_data = bpy.data.cameras.new('Camera')
        self.camera = bpy.data.objects.new('Camera', cam_data)
        scene.collection.objects.link(self.camera)
        scene.camera = self.camera
        cam_data.clip_start, cam_data.clip_end = 0.05, 500

    # -- render settings ------------------------------------------------------
    def _setup_render(self, job):
        scene = self.scene
        r = scene.render
        r.engine = 'CYCLES'
        r.resolution_x, r.resolution_y, r.resolution_percentage = self.width, self.height, 100
        r.film_transparent = bool(job.get('transparent', False))
        r.image_settings.file_format = 'PNG'
        r.image_settings.color_mode = 'RGBA' if r.film_transparent else 'RGB'
        r.image_settings.color_depth = '8'
        r.image_settings.compression = 40
        r.use_file_extension = False
        r.filepath = job['out']

        cy = scene.cycles
        cy.samples = int(job.get('samples', 64))
        cy.use_adaptive_sampling = True
        cy.adaptive_threshold = 0.05 if self.quality == 'draft' else 0.02
        cy.seed = self.seed % 9973
        cy.max_bounces, cy.diffuse_bounces, cy.glossy_bounces = 8, 3, 4
        cy.transmission_bounces, cy.transparent_max_bounces, cy.volume_bounces = 8, 8, 0
        cy.caustics_reflective = cy.caustics_refractive = False
        cy.sample_clamp_indirect = 8.0
        try:
            cy.use_denoising = True
            cy.denoiser = 'OPENIMAGEDENOISE'
        except Exception:
            pass
        try:
            if job.get('timeLimit'):
                cy.time_limit = float(job['timeLimit'])
        except Exception:
            pass
        self.device = self._pick_device(job.get('device', 'auto'))
        self.set_view('Standard')

    def _pick_device(self, want):
        cy = self.scene.cycles
        cy.device = 'CPU'
        if str(want).lower() == 'cpu':
            return 'CPU'
        try:
            prefs = bpy.context.preferences.addons['cycles'].preferences
            for kind in ('OPTIX', 'CUDA', 'METAL', 'HIP', 'ONEAPI'):
                try:
                    prefs.compute_device_type = kind
                    (getattr(prefs, 'refresh_devices', None) or prefs.get_devices)()
                    devs = [d for d in prefs.devices if d.type == kind]
                    if devs:
                        for d in prefs.devices:
                            d.use = d.type == kind
                        cy.device = 'GPU'
                        return kind
                except Exception:
                    continue
            prefs.compute_device_type = 'NONE'
        except Exception:
            pass
        return 'CPU'

    def set_view(self, transform='Standard', look=None, exposure=0.0, gamma=1.0):
        """Colour management. 'Standard' keeps palette colours literal (graphic look); 'AgX' /
        'Filmic' roll highlights off like a camera (use for glass, metal, strong lights)."""
        vs = self.scene.view_settings
        for name in ([transform] + (['Filmic'] if transform == 'AgX' else []) + ['Standard']):
            try:
                vs.view_transform = name
                break
            except Exception:
                continue
        if look:
            for name in (look, 'AgX - ' + look, look.replace('AgX - ', '')):
                try:
                    vs.look = name
                    break
                except Exception:
                    continue
        vs.exposure, vs.gamma = exposure, gamma

    # -- palette ----------------------------------------------------------------
    def color(self, i):
        return self.colors[i % len(self.colors)]

    @property
    def bg(self):
        return self.palette['bg']

    @property
    def dark(self):
        return luminance(self.palette['bg']) < 0.12

    # -- camera -------------------------------------------------------------------
    def frame(self, radius=1.0, fov=24.0, direction=(0.0, -1.0, 0.12), size=None, fstop=None, focus_distance=None,
              width=None, height=None):
        """Aim at the origin so a sphere of ``radius`` spans ``size`` (default: the layout's artSize)
        of the poster's short side, then shift the lens so the origin lands on the layout focus.
        ``direction`` points from the origin towards the camera. Returns the camera distance.

        A subject that is not round can pass its on-screen ``width`` and ``height`` (world units)
        instead of ``radius``; it is then fitted into the art rectangle, so a tall tower or a wide
        still life uses the space it really has. Objects may still be added after this call."""
        if width and height:
            x0, y0, x1, y1 = self.art_rect
            ppu = min((x1 - x0) * self.width * self.fill / width, (y1 - y0) * self.height * self.fill / height)
            radius = max(width, height) / 2.0
            size = 2.0 * radius * ppu / min(self.width, self.height)
        size = size or self.art_size
        cam, data = self.camera, self.camera.data
        half = math.radians(fov) / 2
        dist = radius / (size * math.tan(half))
        cam.location = Vector(direction).normalized() * dist
        look_at(cam, (0, 0, 0))
        # field of view is defined along the short side so the subject keeps its size in any aspect
        if self.aspect >= 1:
            data.sensor_fit = 'VERTICAL'
            data.angle_y = math.radians(fov)
        else:
            data.sensor_fit = 'HORIZONTAL'
            data.angle_x = math.radians(fov)
        data.shift_x = data.shift_y = 0.0
        self._shift_to_focus()
        if fstop:
            data.dof.use_dof = True
            data.dof.focus_distance = focus_distance or dist
            data.dof.aperture_fstop = fstop
        data.clip_start, data.clip_end = max(0.01, dist / 200), dist * 80
        self._framed = True
        self.camera_distance = dist
        return dist

    def _project(self, p=(0, 0, 0)):
        from bpy_extras.object_utils import world_to_camera_view
        bpy.context.view_layer.update()
        v = world_to_camera_view(self.scene, self.camera, Vector(p))
        return v.x, 1.0 - v.y  # poster coordinates: y grows downward

    def _shift_to_focus(self):
        # Solve the lens shift numerically instead of trusting unit conventions (they depend on
        # sensor fit and have changed between Blender versions).
        data = self.camera.data
        x0, y0 = self._project()
        data.shift_x = 0.1
        x1, _ = self._project()
        data.shift_x = 0.0
        data.shift_y = 0.1
        _, y1 = self._project()
        data.shift_y = 0.0
        kx, ky = (x1 - x0) / 0.1, (y1 - y0) / 0.1
        fx, fy = self.focus
        data.shift_x = (fx - x0) / kx if abs(kx) > 1e-9 else 0.0
        data.shift_y = (fy - y0) / ky if abs(ky) > 1e-9 else 0.0

    @property
    def cutout(self):
        """True when the subject is rendered on a transparent film to be laid over another ground."""
        return bool(self.job.get('transparent', False))

    def finish(self):
        if not self._framed:
            self.frame()
        if self.cutout:
            # The studio sweep stays in the light transport (its colour still bounces onto the
            # subject) but is not seen: only the shadow it catches is kept, as alpha, so the subject
            # can stand on a pattern or a gradient drawn by another engine.
            # The set is recognised by its size: walls, floors and sweeps are many times larger than
            # any subject (or tag an object yourself: ob['poster_ground'] = True / False).
            keep_shadow = self.job.get('shadow', True)
            bpy.context.view_layer.update()
            for ob in self.scene.objects:
                tag = ob.get('poster_ground')
                if ob.type == 'MESH' and tag is not False and (tag or ob.name.startswith('Backdrop') or max(ob.dimensions) >= 14.0):
                    if keep_shadow:
                        ob.is_shadow_catcher = True
                    else:
                        ob.visible_camera = False
                        ob.visible_shadow = False
        bpy.context.view_layer.update()


# --------------------------------------------------------------------------- grouping / raw meshes


def group(objects, name='Group', location=(0, 0, 0), rotation=(0, 0, 0), scale=1.0):
    """Parent ``objects`` to an empty so they can be moved, turned and scaled as one."""
    empty = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(empty)
    for ob in objects:
        ob.parent = empty
    empty.location = location
    empty.rotation_euler = rotation
    empty.scale = (scale, scale, scale) if isinstance(scale, (int, float)) else scale
    return empty


def finish_mesh(name, bm, smooth=True, material_=None, **kw):
    """Turn a bmesh you built yourself into a linked object (accepts location/rotation/scale)."""
    return _finish(name, bm, smooth, material_, **kw)


fillet_profile = _fillet_profile   # round the corners of a (radius, z) profile before add_lathe()
