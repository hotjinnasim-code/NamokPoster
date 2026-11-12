// Blueprint — a technical drawing. A solid model is built from boxes, lathes and extrusions and then
// *drawn*, not shaded: its edges are found on the CPU for the isometric view (creases, plus the
// silhouette of every curved surface), outlines heavy and inner edges light as a draughtsman rules
// them, edges that lie behind the model dashed. Around it: dimension lines with arrowheads and
// figures, dash-dot centre lines, numbered balloons, and the sheet itself — a ruled grid, a border
// with zone ticks and a title block — on unevenly exposed blueprint paper.
//
// motif: tower | gear | rocket | chair
// Palette: bg = the paper · colors[0] = the drawn line · colors[1] = grid and construction lines
//          colors[2] = dimensions, centre lines and balloons · accent = type only
import { backgroundQuad, quietUniforms, GLSL_QUIET, GLSL_NOISE_KIT, makeComposer, finishPassShader } from '/skill/assets/web/scene-lib.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const FONT_URL = '/skill/assets/fonts/jetbrains-mono/jetbrains-mono-latin-wght-normal.woff2';

/** The bundled monospaced face, for dimension figures; falls back to the system monospace if it cannot be read. */
async function monoFont() {
  const family = 'Blueprint Mono';
  try {
    if (![...document.fonts].some((f) => f.family === family)) {
      const face = new FontFace(family, `url(${FONT_URL}) format("woff2")`, { weight: '100 800' });
      await Promise.race([face.load(), new Promise((_, no) => setTimeout(() => no(new Error('font timeout')), 5000))]);
      document.fonts.add(face);
    }
    return `"${family}", monospace`;
  } catch { return 'monospace'; }
}

export default async function build(ctx) {
  const { THREE, scene, camera, rng, palette, params, unit, width: W, height: H, focus } = ctx;
  const P = {
    motif: ['tower', 'gear', 'rocket', 'chair'].includes(params.motif) ? params.motif : 'tower',
    hidden: clamp(params.hidden ?? 1, 0, 2), grid: clamp(params.grid ?? 1, 0, 2), line: clamp(params.line ?? 1, 0.5, 2),
    dims: params.dims ?? true, hatch: clamp(params.hatch ?? 1, 0, 2), titleBlock: params.titleBlock ?? true,
  };
  const cols = palette.colors?.length ? palette.colors : [palette.ink];
  const C = (i) => new THREE.Color(cols[Math.min(i, cols.length - 1)]);
  const bgc = new THREE.Color(palette.bg), lineC = C(0), gridC = C(1), dimC = C(2), dark = bgc.getHSL({}).l < 0.45;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const font = await monoFont();

  // ------------------------------------------------------------------ the model: closed solids, baked into world space
  const parts = [];       // { geo, hidden, crease }
  const detail = [];      // thin lines ruled on a surface (floors, panel joints): [a, b]
  const ann = { lines: [], centre: [], arrows: [], labels: [], balloons: [] };
  const mat4 = (pos, rot) => new THREE.Matrix4().compose(V(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), V(1, 1, 1));
  const add = (geo, { at = [0, 0, 0], rot = [0, 0, 0], hidden = true, crease = 30 } = {}) => { geo.applyMatrix4(mat4(at, rot)); parts.push({ geo, hidden, crease }); return geo; };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (rBottom, rTop, h, seg = 64) => new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1);
  const lathe = (profile, seg = 96) => new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0), y)), seg);
  // a flat outline (x, z) extruded upwards by `h`, standing on y = 0
  const slab = (shape, h) => { const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 20 }); g.rotateX(-Math.PI / 2); return g; };
  const circlePath = (cx, cy, r) => { const p = new THREE.Path(); p.absarc(cx, cy, r, 0, Math.PI * 2, true); return p; };

  // dimension: a → b measured on a line pushed out by `off`; witness lines, arrowheads, figure
  let S = 1;                                                                // size of the model: arrowheads and gaps scale with it
  const dim = (a, b, off, text, { witness = true } = {}) => {
    const o = off.clone().normalize(), a2 = a.clone().add(off), b2 = b.clone().add(off), d = b2.clone().sub(a2).normalize();
    if (witness) { ann.lines.push([a.clone().addScaledVector(o, 0.03 * S), a2.clone().addScaledVector(o, 0.035 * S)], [b.clone().addScaledVector(o, 0.03 * S), b2.clone().addScaledVector(o, 0.035 * S)]); }
    ann.lines.push([a2, b2]);
    ann.arrows.push([a2, d, o], [b2, d.clone().negate(), o]);
    ann.labels.push({ a: a2, b: b2, o, text });
  };
  const centre = (a, b) => ann.centre.push([a, b]);
  const balloon = (at, to, n) => ann.balloons.push({ at, to, n });

  if (P.motif === 'tower') {
    S = 3.2;
    add(box(2.5, 0.05, 2.0), { at: [0.05, -0.025, 0], hidden: false });                         // site
    add(box(1.5, 0.3, 1.2), { at: [0.05, 0.15, 0] });                                            // podium
    add(box(0.72, 2.1, 0.72), { at: [-0.14, 1.35, -0.06] });                                     // shaft
    add(box(0.44, 1.2, 0.72), { at: [0.44, 0.9, -0.06] });                                       // wing
    add(box(0.5, 0.4, 0.5), { at: [-0.14, 2.6, -0.06] });                                        // setback
    add(box(0.26, 0.2, 0.26), { at: [-0.14, 2.9, -0.06] });                                      // crown
    add(cyl(0.016, 0.006, 0.62, 12), { at: [-0.14, 3.31, -0.06], hidden: false });               // mast
    add(box(0.46, 0.035, 0.2), { at: [0.05, 0.19, 0.7], hidden: false });                         // canopy
    // curtain wall: floors and mullions ruled on the two faces that look at us
    const rule = (x0, x1, z0, z1, y0, y1, floors, bays) => {
      for (let k = 1; k < floors; k++) { const y = y0 + ((y1 - y0) * k) / floors; detail.push([V(x0, y, z0), V(x1, y, z1)]); }
      for (let k = 1; k < bays; k++) { const t = k / bays; detail.push([V(x0 + (x1 - x0) * t, y0, z0 + (z1 - z0) * t), V(x0 + (x1 - x0) * t, y1, z0 + (z1 - z0) * t)]); }
    };
    const e = 0.002;
    rule(-0.5, 0.22, 0.3 + e, 0.3 + e, 0.3, 2.4, 20, 6); rule(0.22 + e, 0.22 + e, 0.3, -0.42, 1.5, 2.4, 9, 6);       // shaft
    rule(0.22, 0.66, 0.3 + e, 0.3 + e, 0.3, 1.5, 11, 4); rule(0.66 + e, 0.66 + e, 0.3, -0.42, 0.3, 1.5, 11, 6);      // wing
    rule(-0.39, 0.11, 0.19 + e, 0.19 + e, 2.4, 2.8, 4, 4); rule(0.11 + e, 0.11 + e, 0.19, -0.31, 2.4, 2.8, 4, 4);    // setback
    rule(-0.7, 0.8, 0.6 + e, 0.6 + e, 0, 0.3, 2, 10); rule(0.8 + e, 0.8 + e, 0.6, -0.6, 0, 0.3, 2, 8);               // podium
    if (P.dims) {
      dim(V(-0.5, 0, 0.3), V(-0.5, 3.0, 0.3), V(-1.02, 0, 0), '186.00');
      dim(V(-0.5, 0.3, 0.3), V(-0.5, 2.4, 0.3), V(-0.6, 0, 0), '126.00');
      dim(V(-1.2, 0, 1.0), V(1.3, 0, 1.0), V(0, 0, 0.34), '92.50');
      dim(V(1.3, 0, 1.0), V(1.3, 0, -1.0), V(0.34, 0, 0), '74.00');
      centre(V(-0.14, 2.86, -0.06), V(-0.14, 3.95, -0.06));
      balloon(V(0.66, 1.2, 0.0), V(1.42, 1.72, 0.0), 2); balloon(V(-0.14, 2.75, 0.19), V(0.62, 3.2, 0.19), 1); balloon(V(0.74, 0.3, 0.3), V(1.62, 0.95, 0.3), 3);
    }
  } else if (P.motif === 'gear') {
    S = 2.9;
    const gearShape = (n, rTip, rRoot, holes = []) => {
      const s = new THREE.Shape(), p = (Math.PI * 2) / n;
      for (let i = 0; i < n; i++) for (const [r, f] of [[rRoot, 0.22], [rTip, 0.37], [rTip, 0.63], [rRoot, 0.78]]) { const a = (i + f) * p, x = Math.cos(a) * r, y = Math.sin(a) * r; if (i === 0 && f === 0.22) s.moveTo(x, y); else s.lineTo(x, y); }
      s.closePath(); for (const h of holes) s.holes.push(circlePath(...h)); return s;
    };
    const plate = new THREE.Shape(), pw = 1.5, pd = 1.02, pr = 0.14;
    plate.moveTo(-pw + pr, -pd); plate.lineTo(pw - pr, -pd); plate.absarc(pw - pr, -pd + pr, pr, -Math.PI / 2, 0, false); plate.lineTo(pw, pd - pr); plate.absarc(pw - pr, pd - pr, pr, 0, Math.PI / 2, false);
    plate.lineTo(-pw + pr, pd); plate.absarc(-pw + pr, pd - pr, pr, Math.PI / 2, Math.PI, false); plate.lineTo(-pw, -pd + pr); plate.absarc(-pw + pr, -pd + pr, pr, Math.PI, Math.PI * 1.5, false);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) plate.holes.push(circlePath(sx * (pw - 0.2), sz * (pd - 0.2), 0.065));
    add(slab(plate, 0.1), { at: [0.12, 0, 0] });
    const gx = -0.36, px = 0.84, y0 = 0.18;                                                       // big wheel, pinion, underside of the wheels
    const spokes = [0, 1, 2, 3, 4].map((i) => [Math.cos((i / 5) * Math.PI * 2 + 0.3) * 0.5, Math.sin((i / 5) * Math.PI * 2 + 0.3) * 0.5, 0.15]);
    add(cyl(0.3, 0.3, 0.08), { at: [gx, 0.14, 0], hidden: false }); add(cyl(0.2, 0.2, 0.08), { at: [px, 0.14, 0], hidden: false });       // bosses
    add(slab(gearShape(24, 0.88, 0.76, spokes), 0.2), { at: [gx, y0, 0], rot: [0, 0.05, 0], hidden: false });
    add(slab(gearShape(11, 0.44, 0.32), 0.2), { at: [px, y0, 0], rot: [0, Math.PI / 11 + 0.05, 0], hidden: false });
    add(lathe([[0.11, 0], [0.25, 0], [0.25, 0.16], [0.21, 0.2], [0.11, 0.2], [0.11, 0]], 64), { at: [gx, y0 + 0.2, 0] });                 // hub
    add(lathe([[0.075, 0], [0.17, 0], [0.17, 0.2], [0.14, 0.24], [0.075, 0.24], [0.075, 0]], 48), { at: [px, y0 + 0.2, 0] });
    add(lathe([[0, 0], [0.11, 0], [0.11, 0.86], [0.09, 0.88], [0, 0.88]], 48), { at: [gx, 0.1, 0] });                                      // shafts
    add(lathe([[0, 0], [0.075, 0], [0.075, 1.1], [0.06, 1.12], [0, 1.12]], 48), { at: [px, 0.1, 0] });
    if (P.dims) {
      const top = y0 + 0.2 + 0.004;
      centre(V(gx - 1.08, top, 0), V(gx + 0.52, top, 0)); centre(V(gx, top, -1.08), V(gx, top, 1.08));
      centre(V(px - 0.3, top, 0), V(px + 0.66, top, 0)); centre(V(px, top, -0.64), V(px, top, 0.64));
      centre(V(gx, 0.9, 0), V(gx, 1.5, 0)); centre(V(px, 1.14, 0), V(px, 1.72, 0));
      dim(V(gx, 0.1, 1.02), V(px, 0.1, 1.02), V(0, 0, 0.3), '120.0');
      dim(V(0.12 - pw, 0.1, 1.02), V(0.12 + pw, 0.1, 1.02), V(0, 0, 0.62), '300.0');
      dim(V(0.12 + pw, 0.1, 1.02), V(0.12 + pw, 0.1, -1.02), V(0.34, 0, 0), '204.0');
      dim(V(gx - 0.88, top, 0), V(gx - 0.88, top, 0).add(V(0, 0, -1)).setZ(0).setX(gx + 0.88), V(0, 0, -1.3), 'Ø176', { witness: true });
      balloon(V(gx - 0.42, top, 0.5), V(gx - 1.02, 1.0, 0.5), 1); balloon(V(px + 0.2, top, -0.2), V(px + 0.62, 1.2, -0.2), 2); balloon(V(1.38, 0.1, 0.6), V(1.95, 0.52, 0.6), 3);
    }
  } else if (P.motif === 'rocket') {
    S = 3.4;
    const lift = 0.46;                                                                           // exploded: the nose is drawn lifted off the body
    add(lathe([[0, 0.36], [0.27, 0.36], [0.33, 0.5], [0.33, 1.24], [0.348, 1.25], [0.348, 1.33], [0.33, 1.34], [0.33, 2.06], [0.3, 2.1], [0, 2.1]]), {});      // body with a stage ring
    const nose = [[0, 0], [0.3, 0], [0.33, 0.04]]; for (let i = 1; i <= 22; i++) { const t = i / 22; nose.push([0.33 * Math.sqrt(Math.max(0, 1 - Math.pow(t, 1.75))), 0.04 + 0.98 * t]); }
    add(lathe(nose), { at: [0, 2.1 + lift, 0] });
    add(lathe([[0, 0], [0.2, 0], [0.2, 0.14], [0.13, 0.26], [0.13, 0.36], [0, 0.36]], 64), { at: [0, 2.1, 0], hidden: false });                               // payload adapter
    add(lathe([[0, 0.02], [0.25, 0.02], [0.2, 0.14], [0.14, 0.36], [0, 0.36]], 64), {});                                                                      // nozzle
    const fin = new THREE.Shape(); fin.moveTo(0.3, 0.44); fin.lineTo(0.3, 1.12); fin.lineTo(0.5, 0.86); fin.lineTo(0.84, 0.3); fin.lineTo(0.84, 0.04); fin.lineTo(0.56, 0.3); fin.closePath();
    for (let k = 0; k < 4; k++) { const g = new THREE.ExtrudeGeometry(fin, { depth: 0.04, bevelEnabled: false }); g.translate(0, 0, -0.02); add(g, { rot: [0, (k * Math.PI) / 2, 0], hidden: k === 1 || k === 2 }); }
    const port = new THREE.TorusGeometry(0.095, 0.014, 12, 48); port.rotateY(Math.PI / 4); add(port, { at: [0.33 * 0.7071, 1.68, 0.33 * 0.7071], hidden: false });
    for (let k = 1; k <= 2; k++) { const y = 0.5 + k * 0.24, pts = 40; for (let i = 0; i < pts; i++) { const a0 = -0.6 + (i / pts) * 2.8, a1 = -0.6 + ((i + 1) / pts) * 2.8, r = 0.332; detail.push([V(Math.cos(a0) * r, y, Math.sin(a0) * r), V(Math.cos(a1) * r, y, Math.sin(a1) * r)]); } }
    if (P.dims) {
      centre(V(0, -0.3, 0), V(0, 3.58 + lift, 0));
      dim(V(-0.33, 0.36, 0), V(-0.33, 2.1, 0), V(-0.86, 0, 0), '1740');
      dim(V(-0.33, 2.1 + lift, 0), V(-0.33, 3.12 + lift, 0), V(-0.86, 0, 0), '1020');
      dim(V(-0.84, 0.04, 0), V(0.84, 0.04, 0), V(0, 0, 1.12), '1680');
      dim(V(0, 2.1 + lift, 0.33), V(0, 2.1 + lift, -0.33), V(0.86, 0, 0), 'Ø660');
      balloon(V(0.2, 2.9 + lift, 0.2), V(0.95, 3.25 + lift, 0.2), 1); balloon(V(0.2, 2.2, 0), V(1.0, 2.42, 0), 2); balloon(V(0.33, 1.29, 0.1), V(1.1, 1.5, 0.1), 3); balloon(V(0.74, 0.3, 0), V(1.25, 0.72, 0), 4);
    }
  } else {
    S = 2.0;
    const leg = (x, z) => { const g = cyl(0.036, 0.052, 0.86, 4); g.rotateY(Math.PI / 4); add(g, { at: [x, 0.43, z] }); };
    leg(-0.4, 0.4); leg(0.4, 0.4); leg(-0.4, -0.4); leg(0.4, -0.4);
    add(box(0.94, 0.07, 0.92), { at: [0, 0.895, 0] });                                             // seat
    add(box(0.72, 0.09, 0.03), { at: [0, 0.815, 0.4], hidden: false }); add(box(0.72, 0.09, 0.03), { at: [0, 0.815, -0.4], hidden: false });       // aprons
    add(box(0.03, 0.09, 0.72), { at: [-0.4, 0.815, 0], hidden: false }); add(box(0.03, 0.09, 0.72), { at: [0.4, 0.815, 0], hidden: false });
    add(box(0.03, 0.04, 0.76), { at: [-0.4, 0.3, 0], hidden: false }); add(box(0.03, 0.04, 0.76), { at: [0.4, 0.3, 0], hidden: false });           // stretchers
    add(box(0.78, 0.04, 0.03), { at: [0, 0.3, 0], hidden: false });
    const tilt = -0.15, postLen = 0.98;                                                            // the back leans away
    const lean = (y) => -0.43 - Math.sin(-tilt) * (y - 0.93);
    for (const x of [-0.42, 0.42]) add(box(0.07, postLen, 0.06), { at: [x, 0.93 + (postLen / 2) * Math.cos(tilt), lean(0.93 + postLen / 2)], rot: [tilt, 0, 0] });
    add(box(0.92, 0.3, 0.04), { at: [0, 1.72, lean(1.72)], rot: [tilt, 0, 0] });                   // back panel
    add(box(0.78, 0.07, 0.03), { at: [0, 1.3, lean(1.3)], rot: [tilt, 0, 0], hidden: false });      // slat
    // the floor: a datum line under the feet
    ann.lines.push([V(-0.75, 0, 0.4), V(0.75, 0, 0.4)], [V(0.4, 0, -0.75), V(0.4, 0, 0.75)]);
    if (P.dims) {
      dim(V(-0.47, 0, 0.46), V(-0.47, 0.93, 0.46), V(-0.34, 0, 0), '450');
      dim(V(-0.47, 0, 0.46), V(-0.47, 1.9, 0.46), V(-0.66, 0, 0), '820');
      dim(V(-0.47, 0.93, 0.46), V(0.47, 0.93, 0.46), V(0, 0, 0.5), '420');
      dim(V(0.47, 0.93, 0.46), V(0.47, 0.93, -0.46), V(0.5, 0, 0), '400');
      balloon(V(0.2, 1.74, lean(1.74) + 0.03), V(0.95, 2.05, lean(1.74)), 1); balloon(V(0.3, 0.93, 0.1), V(1.12, 1.25, 0.1), 2); balloon(V(0.4, 0.45, 0.4), V(1.02, 0.4, 0.4), 3);
    }
  }

  // ------------------------------------------------------------------ fit: centre what was built in the isometric view and frame it
  const dir = V(1, 0.82, 1).normalize(), right = V(0, 1, 0).cross(dir).normalize(), upv = dir.clone().cross(right);
  let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
  const drawnPts = [];
  const grow = (p, pad = 0) => { drawnPts.push(p.clone()); const u = p.dot(right), v = p.dot(upv); u0 = Math.min(u0, u - pad); u1 = Math.max(u1, u + pad); v0 = Math.min(v0, v - pad); v1 = Math.max(v1, v + pad); };
  const tmp = V();
  for (const { geo } of parts) { const pa = geo.attributes.position; for (let i = 0; i < pa.count; i += 3) grow(tmp.fromBufferAttribute(pa, i)); }
  for (const [a, b] of [...ann.lines, ...ann.centre]) { grow(a, 0.02 * S); grow(b, 0.02 * S); }
  for (const l of ann.labels) grow(l.a.clone().lerp(l.b, 0.5), 0.07 * S);
  for (const b of ann.balloons) grow(b.to, 0.06 * S);
  const T = right.clone().multiplyScalar(-(u0 + u1) / 2).addScaledVector(upv, -(v0 + v1) / 2);
  const dist = ctx.frame({ width: u1 - u0, height: v1 - v0, fov: 7, dir: [dir.x, dir.y, dir.z] });
  const reach = Math.hypot(u1 - u0, v1 - v0) * 1.2 + 2;
  camera.near = Math.max(0.1, dist - reach); camera.far = dist + reach; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  const ppu = (H / 2) / (dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));           // px per world unit at the model
  const camPos = camera.position.clone();
  const toPx = (p) => { tmp.copy(p).project(camera); return [(tmp.x * 0.5 + 0.5) * W, (0.5 - tmp.y * 0.5) * H]; };

  // pen weights (px). They follow the drawing's size on the sheet a little, so a small drawing is not ruled with a marker.
  const k = clamp(((u1 - u0) * ppu) / (Math.min(W, H) * 0.62), 0.62, 1.1) * P.line;
  const PEN = { contour: unit * 0.23 * k, inner: unit * 0.115 * k, detail: unit * 0.06 * k, hidden: unit * 0.085 * k, dim: unit * 0.075 * Math.sqrt(k) };

  // ------------------------------------------------------------------ edges of the model for this view
  // verts are welded by position; an edge is drawn when it is a crease, or when one of its two faces looks at
  // the camera and the other does not (the silhouette of a curved surface).
  const seg = { contour: [], inner: [], hidden: [] };                       // [a, b, idA, idB]
  let vBase = 0;
  for (const part of parts) {
    const g = part.geo.index ? part.geo.toNonIndexed() : part.geo, pa = g.attributes.position, n = pa.count;
    const ids = new Int32Array(n), verts = [], seen = new Map();
    for (let i = 0; i < n; i++) {
      const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i), key = `${Math.round(x * 2e4)},${Math.round(y * 2e4)},${Math.round(z * 2e4)}`;
      let id = seen.get(key); if (id === undefined) { id = verts.length; verts.push(V(x, y, z).add(T)); seen.set(key, id); } ids[i] = id;
    }
    const faces = [], edges = new Map(), e1 = V(), e2 = V();
    for (let f = 0; f < n; f += 3) {
      const a = ids[f], b = ids[f + 1], c = ids[f + 2]; if (a === b || b === c || a === c) continue;
      const nrm = e1.subVectors(verts[b], verts[a]).cross(e2.subVectors(verts[c], verts[a])).clone(), area = nrm.length(); if (area < 1e-10) continue; nrm.divideScalar(area);
      const front = nrm.dot(e1.copy(camPos).sub(verts[a])) > 0, fi = faces.length; faces.push({ nrm, front });
      for (const [p, q] of [[a, b], [b, c], [c, a]]) { const key = p < q ? p * 1e6 + q : q * 1e6 + p; let arr = edges.get(key); if (!arr) edges.set(key, arr = []); arr.push(fi); }
    }
    const cosC = Math.cos((part.crease * Math.PI) / 180);
    for (const [key, fs] of edges) {
      const p = Math.floor(key / 1e6), q = key % 1e6, item = [verts[p], verts[q], vBase + p, vBase + q];
      let kind = null;
      if (fs.length !== 2) kind = 'contour';
      else { const f1 = faces[fs[0]], f2 = faces[fs[1]], hard = f1.nrm.dot(f2.nrm) < cosC; if (f1.front !== f2.front) kind = 'contour'; else if (hard) kind = f1.front ? 'inner' : 'back'; }
      if (!kind) continue;
      if (kind !== 'back') seg[kind].push(item);
      if (part.hidden) seg.hidden.push(item);
    }
    vBase += verts.length;
    part.geo.translate(T.x, T.y, T.z);
  }

  // running length along chains of segments, so that dashes march evenly round a curve instead of restarting at every facet
  const chain = (items) => {
    const at = new Map(), link = (id, i) => { let a = at.get(id); if (!a) at.set(id, a = []); a.push(i); };
    items.forEach((s, i) => { link(s[2], i); link(s[3], i); });
    const done = new Uint8Array(items.length), out = [];
    const walk = (i, fromId, d, sign) => {                               // follow the chain from segment i, entered at vertex fromId
      for (;;) {
        const s = items[i], fwd = s[2] === fromId, len = s[0].distanceTo(s[1]) * ppu;
        done[i] = 1; out[i] = sign > 0 ? (fwd ? [d, d + len] : [d + len, d]) : (fwd ? [d, d - len] : [d - len, d]); d += sign * len;
        const endId = fwd ? s[3] : s[2], nb = at.get(endId); if (nb.length !== 2) return;
        const j = nb[0] === i ? nb[1] : nb[0]; if (done[j]) return;
        const t = items[j], da = e1.subVectors(fwd ? s[1] : s[0], fwd ? s[0] : s[1]).normalize(), db = e2.subVectors(t[2] === endId ? t[1] : t[0], t[2] === endId ? t[0] : t[1]).normalize();
        if (da.dot(db) < 0.75) return;
        i = j; fromId = endId;
      }
    };
    const e1 = V(), e2 = V();
    items.forEach((s, i) => { if (done[i]) return; walk(i, s[2], 0, 1); const nb = at.get(s[2]); if (nb.length === 2) { const j = nb[0] === i ? nb[1] : nb[0]; if (!done[j]) { const t = items[j]; if (e1.subVectors(s[1], s[0]).normalize().dot(e2.subVectors(t[2] === s[2] ? t[0] : t[1], t[2] === s[2] ? t[1] : t[0]).normalize()) >= 0.75) walk(j, s[2], 0, -1); } } });
    return out;
  };

  // ------------------------------------------------------------------ drawing
  const quadGeo = new THREE.PlaneGeometry(2, 2);
  /** fat line segments: width in px, round ends, optional dash pattern [dash, gap, dot, gap] in px, optional depth test */
  const pen = (items, { width, color, alpha = 1, dash = null, dists = null, depthFunc = null, order = 0 }) => {
    if (!items.length) return;
    const A = new Float32Array(items.length * 3), B = new Float32Array(items.length * 3), D = new Float32Array(items.length * 2);
    items.forEach((s, i) => { A.set([s[0].x, s[0].y, s[0].z], i * 3); B.set([s[1].x, s[1].y, s[1].z], i * 3); const d = dists ? dists[i] : [0, s[0].distanceTo(s[1]) * ppu]; D.set(d, i * 2); });
    const g = new THREE.InstancedBufferGeometry(); g.index = quadGeo.index; g.setAttribute('position', quadGeo.attributes.position);
    g.setAttribute('iA', new THREE.InstancedBufferAttribute(A, 3)); g.setAttribute('iB', new THREE.InstancedBufferAttribute(B, 3)); g.setAttribute('iD', new THREE.InstancedBufferAttribute(D, 2));
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: depthFunc !== null, depthFunc: depthFunc ?? THREE.LessEqualDepth,
      uniforms: { uRes: { value: new THREE.Vector2(W, H) }, uW: { value: width }, uCol: { value: color }, uAlpha: { value: alpha }, uDash: { value: new THREE.Vector4(...(dash ?? [0, 0, 0, 0])) } },
      vertexShader: /* glsl */`
        attribute vec3 iA, iB; attribute vec2 iD; uniform vec2 uRes; uniform float uW; varying float vS, vT, vLen, vD;
        void main(){
          mat4 pv = projectionMatrix * viewMatrix; vec4 a = pv * vec4(iA, 1.0), b = pv * vec4(iB, 1.0);
          vec2 d = (b.xy / b.w - a.xy / a.w) * uRes * 0.5; float len = max(length(d), 1e-4); vec2 dir = d / len, nrm = vec2(-dir.y, dir.x);
          float t = position.x * 0.5 + 0.5, hw = uW * 0.5 + 1.0; vec4 c = mix(a, b, t);
          gl_Position = vec4(c.xy + (nrm * position.y + dir * position.x) * hw * 2.0 / uRes * c.w, c.zw);
          vS = position.y * hw; vT = position.x * (len * 0.5 + hw); vLen = len * 0.5; vD = mix(iD.x, iD.y, t) + position.x * hw * sign(iD.y - iD.x);
        }`,
      fragmentShader: /* glsl */`
        uniform float uW, uAlpha; uniform vec3 uCol; uniform vec4 uDash; varying float vS, vT, vLen, vD;
        void main(){
          float dx = max(abs(vT) - vLen, 0.0), r = max(uW * 0.5, 0.5), a = 1.0 - smoothstep(r - 0.6, r + 0.6, length(vec2(dx, vS)));
          a *= min(1.0, uW);
          if (uDash.x > 0.0) { float per = uDash.x + uDash.y + uDash.z + uDash.w, m = mod(vD, per);
            float on = (1.0 - smoothstep(uDash.x - 0.5, uDash.x + 0.5, m)) * smoothstep(-0.5, 0.5, m);
            if (uDash.z > 0.0) on = max(on, smoothstep(uDash.x + uDash.y - 0.5, uDash.x + uDash.y + 0.5, m) * (1.0 - smoothstep(per - uDash.w - 0.5, per - uDash.w + 0.5, m)));
            a *= on; }
          if (a < 0.004) discard;
          gl_FragColor = vec4(uCol, a * uAlpha);
          #include <colorspace_fragment>
        }`,
    }));
    m.frustumCulled = false; m.renderOrder = order; scene.add(m); return m;
  };

  // faces: almost the paper colour — just enough to hide the grid and the far side — with a hatched shade on one flank
  const mixC = (a, b, t) => a.clone().lerp(b, t);
  const fill = new THREE.ShaderMaterial({
    side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1.5 + PEN.contour * 0.5, polygonOffsetUnits: 2,
    uniforms: {
      uTop: { value: dark ? mixC(bgc, lineC, 0.04) : mixC(bgc, new THREE.Color('#ffffff'), 0.5) }, uLeft: { value: dark ? mixC(bgc, lineC, 0.012) : mixC(bgc, lineC, 0.015) },
      uRight: { value: dark ? mixC(bgc, new THREE.Color('#000000'), 0.16) : mixC(bgc, lineC, 0.07) }, uHatchCol: { value: lineC }, uHatch: { value: (dark ? 0.2 : 0.26) * P.hatch },
      uPitch: { value: Math.max(4, Math.round(unit * 0.62 * Math.sqrt(k))) }, uLw: { value: Math.max(0.8, unit * 0.055) },
    },
    vertexShader: 'varying vec3 vN; void main(){ vN = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      uniform vec3 uTop, uLeft, uRight, uHatchCol; uniform float uHatch, uPitch, uLw; varying vec3 vN;
      void main(){
        vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
        vec3 w = max(n, 0.0); w *= w; float s = w.x + w.y + w.z; w = s > 1e-4 ? w / s : vec3(0.0, 0.0, 1.0);
        vec3 col = uRight * w.x + uTop * w.y + uLeft * w.z;
        float h = abs(fract((gl_FragCoord.x + gl_FragCoord.y) / (uPitch * 1.41421) + 0.5) - 0.5) * uPitch;        // 45° hatch, even in px
        float ln = 1.0 - smoothstep(uLw * 0.5 - 0.5, uLw * 0.5 + 0.5, h);
        col = mix(col, uHatchCol, ln * smoothstep(0.45, 0.8, w.x) * uHatch);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  for (const { geo } of parts) { const m = new THREE.Mesh(geo, fill); m.renderOrder = 1; scene.add(m); }

  const u = unit * Math.sqrt(k);
  if (P.hidden > 0) pen(seg.hidden, { width: PEN.hidden, color: lineC, alpha: 0.5 * Math.min(P.hidden, 1), dash: [u * 0.62 * P.hidden, u * 0.46, 0, 0], dists: chain(seg.hidden), depthFunc: THREE.GreaterDepth, order: 2 });
  pen(detail.map(([a, b]) => [a.clone().add(T), b.clone().add(T)]), { width: PEN.detail, color: lineC, alpha: 0.6, depthFunc: THREE.LessEqualDepth, order: 3 });
  pen(seg.inner, { width: PEN.inner, color: lineC, depthFunc: THREE.LessEqualDepth, order: 4 });
  pen(seg.contour, { width: PEN.contour, color: lineC, depthFunc: THREE.LessEqualDepth, order: 5 });

  // ---- annotations lie on the sheet: no depth test
  const sh = (p) => p.clone().add(T);
  pen(ann.centre.map(([a, b]) => [sh(a), sh(b)]), { width: PEN.dim, color: dimC, alpha: 0.95, dash: [u * 1.5, u * 0.38, u * 0.2, u * 0.38], order: 6 });
  const leaders = ann.balloons.map((b) => { const [x0, y0] = toPx(sh(b.at)), [x1, y1] = toPx(sh(b.to)), L = Math.hypot(x1 - x0, y1 - y0), r = u * 1.28; return [sh(b.at), sh(b.at).lerp(sh(b.to), Math.max(0, 1 - r / L))]; });
  pen([...ann.lines.map(([a, b]) => [sh(a), sh(b)]), ...leaders], { width: PEN.dim, color: dimC, order: 6 });
  {
    // arrowheads: slender filled triangles in the plane of the dimension; leaders end in a dot
    const pos = [], aw = 0.052 * S * clamp(1.6 / (S * ppu / (unit * 30)), 0.7, 1.5), ah = aw * 0.17;
    for (const [tip, d, o] of ann.arrows) { const t = sh(tip), b1 = t.clone().addScaledVector(d, aw).addScaledVector(o, ah), b2 = t.clone().addScaledVector(d, aw).addScaledVector(o, -ah); pos.push(t.x, t.y, t.z, b1.x, b1.y, b1.z, b2.x, b2.y, b2.z); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: dimC, side: THREE.DoubleSide, depthTest: false, depthWrite: false, transparent: true })); m.frustumCulled = false; m.renderOrder = 7; if (pos.length) scene.add(m);
  }
  const hex = (c) => '#' + c.getHexString();
  /** a canvas drawn in device pixels and shown as a screen-facing sprite of exactly that size */
  const sprite = (wpx, hpx, at, draw, rotation = 0) => {
    const c = document.createElement('canvas'); c.width = Math.max(2, Math.ceil(wpx)); c.height = Math.max(2, Math.ceil(hpx));
    const g = c.getContext('2d'); draw(g, c.width, c.height);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true, rotation }));
    sp.position.copy(at); sp.scale.set(c.width / ppu, c.height / ppu, 1); sp.renderOrder = 8; scene.add(sp); return sp;
  };
  const fpx = Math.max(7, u * 1.3);                                         // figure height
  const camRight = V().setFromMatrixColumn(camera.matrixWorld, 0), camUp = V().setFromMatrixColumn(camera.matrixWorld, 1);
  for (const l of ann.labels) {
    const [ax, ay] = toPx(sh(l.a)), [bx, by] = toPx(sh(l.b)), [ox, oy] = toPx(sh(l.a.clone().add(l.o)));
    let ang = Math.atan2(-(by - ay), bx - ax); if (ang > Math.PI / 2 + 0.01) ang -= Math.PI; if (ang <= -Math.PI / 2 + 0.01) ang += Math.PI;      // upright, reading from the left or from below
    const nx = -(by - ay), ny = bx - ax, nl = Math.hypot(nx, ny) || 1, side = Math.sign((ox - ax) * nx + (oy - ay) * ny) || 1, off = fpx * 0.95;
    const mid = sh(l.a).lerp(sh(l.b), 0.5).addScaledVector(camRight, (side * nx / nl) * off / ppu).addScaledVector(camUp, -(side * ny / nl) * off / ppu);
    const wpx = l.text.length * fpx * 0.66 + fpx;
    sprite(wpx, fpx * 1.5, mid, (g, w, h) => { g.font = `500 ${fpx}px ${font}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = hex(dimC); g.fillText(l.text, w / 2, h / 2 + fpx * 0.04); }, ang);
  }
  for (const b of ann.balloons) {
    const r = u * 1.28, sz = r * 2 + 4;
    sprite(sz, sz, sh(b.to), (g, w, h) => {
      g.lineWidth = Math.max(1, PEN.dim * 1.15); g.strokeStyle = hex(dimC); g.fillStyle = hex(bgc); g.beginPath(); g.arc(w / 2, h / 2, r - g.lineWidth / 2, 0, Math.PI * 2); g.fill(); g.stroke();
      g.font = `600 ${r * 1.02}px ${font}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = hex(dimC); g.fillText(String(b.n), w / 2, h / 2 + r * 0.06);
    });
    sprite(u * 0.7 + 2, u * 0.7 + 2, sh(b.at), (g, w, h) => { g.fillStyle = hex(dimC); g.beginPath(); g.arc(w / 2, h / 2, u * 0.2, 0, Math.PI * 2); g.fill(); });
  }

  // ------------------------------------------------------------------ the sheet: paper, grid, border with zone ticks
  const m0 = Math.round(unit * 2.3), cell = Math.max(6, Math.round(unit * 1.9));
  scene.add(backgroundQuad(/* glsl */`
    varying vec2 vUv; uniform vec3 bg, lineCol, gridCol; uniform vec2 uRes, uFocus; uniform float uM, uCell, uGrid, uDark, uUnit, uSeed;
    ${GLSL_QUIET}
    ${GLSL_NOISE_KIT}
    float ln(float d, float w){ return 1.0 - smoothstep(w * 0.5 - 0.5, w * 0.5 + 0.5, abs(d)); }
    void main(){
      vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uRes, p = px / uRes;
      float q = quietMask(p, 0.05);
      // unevenly exposed, slightly fibrous paper
      float mott = fbm2(px / (uUnit * 34.0) + uSeed, 4) * 0.5 + fbm2(px / (uUnit * 7.0) - uSeed, 3) * 0.22;
      float fib = (hash21(px) - 0.5) * 0.5 + (noise2(px * vec2(0.9, 0.12)) * 0.5);
      vec3 col = bg * (1.0 + (mott * 0.11 + fib * 0.022) * mix(0.55, 1.0, uDark));
      // grid: fine cells, every fifth line heavier; it thins out where type sits
      vec2 g = px - uM;
      vec2 fine = abs(fract(g / uCell + 0.5) - 0.5) * uCell, bold = abs(fract(g / (uCell * 5.0) + 0.5) - 0.5) * uCell * 5.0;
      float gf = max(ln(fine.x, max(1.0, uUnit * 0.045)), ln(fine.y, max(1.0, uUnit * 0.045)));
      float gb = max(ln(bold.x, max(1.0, uUnit * 0.085)), ln(bold.y, max(1.0, uUnit * 0.085)));
      float inside = step(uM, px.x) * step(px.x, uRes.x - uM) * step(uM, px.y) * step(px.y, uRes.y - uM);
      float ga = max(gf * 0.11, gb * 0.2) * uGrid * inside * mix(1.0, 0.3, q) * (0.75 + 0.5 * mott);
      col = mix(col, gridCol, ga);
      // border and zone ticks
      vec2 c = abs(px - uRes * 0.5), hb = uRes * 0.5 - uM;
      float box = max(c.x - hb.x, c.y - hb.y);
      float frame = ln(box, max(1.5, uUnit * 0.17));
      vec2 zone = uRes / floor(uRes / (uUnit * 16.0) + 0.5);                 // an integer number of zones per side
      vec2 tk = abs(fract(px / zone + 0.5) - 0.5) * zone;
      float tick = step(0.0, box) * step(box, uUnit * 0.95) * max(step(c.y, hb.y + uUnit) * ln(tk.x, max(1.0, uUnit * 0.1)) * step(hb.y, c.y), step(c.x, hb.x + uUnit) * ln(tk.y, max(1.0, uUnit * 0.1)) * step(hb.x, c.x));
      col = mix(col, lineCol, max(frame, tick) * 0.85);
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }`, {
    bg: { value: bgc }, lineCol: { value: lineC }, gridCol: { value: gridC }, uRes: { value: new THREE.Vector2(W, H) }, uFocus: { value: new THREE.Vector2(focus.x, focus.y) },
    uM: { value: m0 }, uCell: { value: cell }, uGrid: { value: P.grid }, uDark: { value: dark ? 1 : 0 }, uUnit: { value: unit }, uSeed: { value: rng() * 50 }, ...quietUniforms(ctx),
  }));

  // ---- title block: in a corner of the border that carries no type
  if (P.titleBlock) {
    const tw = unit * 27, th = unit * 6.6, quiet = ctx.quiet || [];
    const free = ([x0, y0, x1, y1]) => !quiet.some(([qx0, qy0, qx1, qy1]) => x0 / W < qx1 + 0.01 && x1 / W > qx0 - 0.01 && y0 / H < qy1 + 0.01 && y1 / H > qy0 - 0.01);
    const spots = [[W - m0 - tw, H - m0 - th], [W - m0 - tw, m0], [m0, m0], [m0, H - m0 - th]].map(([x, y]) => [x, y, x + tw, y + th]);
    // not on top of the drawing either: no drawn point may fall in or near the block
    const drawnPx = drawnPts.map((p) => toPx(p.add(T))), padPx = unit * 3.5;
    const clear = ([x0, y0, x1, y1]) => !drawnPx.some(([x, y]) => x > x0 - padPx && x < x1 + padPx && y > y0 - padPx && y < y1 + padPx);
    const spot = spots.find((s) => free(s) && clear(s));
    if (spot) {
      const no = { tower: 'A-104', gear: 'M-021', rocket: 'R-007', chair: 'F-012' }[P.motif], scale = { tower: '1:500', gear: '1:1', rocket: '1:20', chair: '1:5' }[P.motif];
      const c = document.createElement('canvas'); c.width = Math.ceil(tw); c.height = Math.ceil(th);
      const g = c.getContext('2d'), lw = Math.max(1, unit * 0.1), ink = hex(lineC);
      g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = Math.max(1.5, unit * 0.17); g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, c.width - g.lineWidth, c.height - g.lineWidth);
      g.lineWidth = lw; const colsX = [0.36, 0.6, 0.8].map((f) => Math.round(f * c.width)), midY = Math.round(c.height * 0.5);
      g.beginPath(); for (const x of colsX) { g.moveTo(x, 0); g.lineTo(x, c.height); } g.moveTo(colsX[0], midY); g.lineTo(c.width, midY); g.stroke();
      const cell2 = (x0, x1, y0, y1, label, value) => {
        g.font = `500 ${unit * 0.78}px ${font}`; g.textAlign = 'left'; g.textBaseline = 'top'; g.globalAlpha = 0.75; g.fillText(label, x0 + unit * 0.55, y0 + unit * 0.45);
        g.font = `600 ${unit * 1.22}px ${font}`; g.textBaseline = 'alphabetic'; g.globalAlpha = 1; g.fillText(value, x0 + unit * 0.55, y1 - unit * 0.62);
      };
      // first cell: a scale bar instead of words
      const bx = unit * 1.1, by = c.height * 0.56, bw = colsX[0] - unit * 2.2, bh = unit * 0.5;
      g.lineWidth = lw; g.strokeRect(bx, by, bw, bh); for (let i = 0; i < 4; i += 2) g.fillRect(bx + (bw * i) / 4, by, bw / 4, bh);
      g.font = `500 ${unit * 0.78}px ${font}`; g.textBaseline = 'top'; g.textAlign = 'left'; g.globalAlpha = 0.75; g.fillText('SCALE BAR', bx, unit * 0.9); g.globalAlpha = 1;
      g.textAlign = 'center'; ['0', '1', '2', '3', '4'].forEach((t, i) => g.fillText(t, bx + (bw * i) / 4, by + bh + unit * 0.4));
      cell2(colsX[0], colsX[1], 0, midY, 'DWG NO.', no); cell2(colsX[1], colsX[2], 0, midY, 'SCALE', scale); cell2(colsX[2], c.width, 0, midY, 'REV', 'C');
      cell2(colsX[0], colsX[1], midY, c.height, 'SHEET', '01/04'); cell2(colsX[1], colsX[2], midY, c.height, 'UNIT', P.motif === 'tower' ? 'M' : 'MM'); cell2(colsX[2], c.width, midY, c.height, 'PROJ.', 'ISO');
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      const [x0, y0, x1, y1] = spot.map(Math.round);
      const tb = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
        transparent: true, depthTest: false, depthWrite: false, uniforms: { map: { value: tex }, uRect: { value: new THREE.Vector4((x0 / W) * 2 - 1, 1 - (y1 / H) * 2, (x1 / W) * 2 - 1, 1 - (y0 / H) * 2) } },
        vertexShader: 'uniform vec4 uRect; varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(mix(uRect.xy, uRect.zw, uv), 0.0, 1.0); }',
        fragmentShader: `uniform sampler2D map; varying vec2 vUv; void main(){ vec4 t = texture2D(map, vUv); gl_FragColor = vec4(t.rgb, t.a * 0.9);
          #include <colorspace_fragment>
        }`,
      }));
      tb.frustumCulled = false; tb.renderOrder = 9; scene.add(tb);
    }
  }

  return makeComposer(ctx, { samples: 4, display: [finishPassShader(ctx, { vignette: dark ? 0.2 : 0.07 })] });
}
