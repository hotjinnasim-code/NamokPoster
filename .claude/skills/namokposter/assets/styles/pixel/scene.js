// Dithered retro — a lit still life of chunky primitives on a checkerboard slab, in front of a
// desktop "window" (a rectangle with a pin-striped title bar and a vertical gradient), rendered
// normally and then pushed through an ordered-dither / pixel pass: the frame is cut into square cells
// and each cell's brightness picks one of the palette colours through a Bayer threshold. No
// anti-aliasing after the pass; the backdrop and every text zone stay one flat colour.
// The backdrop shape is a rectangle on purpose (never a disc), its stripes are horizontal, and the
// pixel dust around it is made of squares — nothing radiates from anything.
//
// Palette: bg = the flat backdrop · bg + colors = the ramp the image is printed in (sorted dark → light)
//          accent = type only
import { makeComposer, ditherPassShader, pixelCell, sortByLuminance, hexLuminance } from '/skill/assets/web/scene-lib.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export default function build(ctx) {
  const { THREE, scene, camera, renderer, rng, palette, params, width: W, height: H, unit } = ctx;
  const P = {
    pixel: clamp(params.pixel ?? 1, 0.5, 3), bayer: [2, 4, 8].includes(params.bayer) ? params.bayer : 4, window: params.window ?? true,
    dust: clamp(params.dust ?? 1, 0, 3), outline: params.outline ?? 'auto', contrast: clamp(params.contrast ?? 1, 0.5, 1.6),
  };
  const ramp = sortByLuminance([palette.bg, ...palette.colors]);
  const dark = hexLuminance(palette.bg) < 0.18;
  // chunky, but never so chunky that a small subject (crowded portrait formats) turns to mush: it keeps ≥ ~125 cells
  const cell = pixelCell(W, Math.max(unit * 0.26, Math.min(unit * 0.55, ((ctx.artSize ?? 0.7) * Math.min(W, H)) / 125)) * P.pixel);

  // greys only: the pass turns brightness into palette colours. `lin` gives the linear value that ends up at display level d.
  const lin = (d) => Math.pow(d, 2.2), grey = (d) => new THREE.Color(lin(d), lin(d), lin(d));
  const lambert = (d, extra = {}) => new THREE.MeshLambertMaterial({ color: grey(d), ...extra });

  // ---- light: one hard key from the upper left with a shadow map, a whisper of fill from the other side
  renderer.setClearColor(0x000000, 0);                                  // undrawn pixels stay transparent → flat backdrop
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  const flip = ctx.focus.x < 0.42 ? -1 : 1;                             // subject left of the copy: light comes from the copy side
  const key = new THREE.DirectionalLight('#ffffff', Math.PI * 1.3); key.position.set(-2.4 * flip, 4.0, 1.9);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0006; key.shadow.normalBias = 0.02; key.shadow.radius = 2.5;
  Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 0.5, far: 12 });
  scene.add(key);
  const fill = new THREE.DirectionalLight('#ffffff', 0.55); fill.position.set(3 * flip, 0.8, 1.5); scene.add(fill);
  scene.add(new THREE.AmbientLight('#ffffff', 0.25));

  // ---- the slab: a square block with a faint checkerboard top, one corner towards the viewer
  const group = new THREE.Group(); scene.add(group);
  const S = 1.66, TH = 0.15, topY = -0.4, turn = Math.PI / 4 + rng.range(-0.16, 0.16);
  const chk = document.createElement('canvas'); chk.width = chk.height = 4;
  const g2 = chk.getContext('2d');
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const c = Math.round(((i + j) % 2 ? 0.7 : 0.52) * 255); g2.fillStyle = `rgb(${c},${c},${c})`; g2.fillRect(i, j, 1, 1); }
  const chkTex = new THREE.CanvasTexture(chk); chkTex.magFilter = chkTex.minFilter = THREE.NearestFilter; chkTex.generateMipmaps = false; chkTex.colorSpace = THREE.SRGBColorSpace;
  const side = lambert(0.7), slab = new THREE.Mesh(new THREE.BoxGeometry(S, TH, S), [side, side, new THREE.MeshLambertMaterial({ map: chkTex }), side, side, side]);
  slab.position.y = topY - TH / 2; slab.receiveShadow = true; slab.castShadow = true; group.add(slab);
  // a narrower plinth below, so the block reads as a solid object and not a tile
  const foot = new THREE.Mesh(new THREE.BoxGeometry(S * 0.7, TH * 1.6, S * 0.7), lambert(0.4)); foot.position.y = topY - TH - TH * 0.8; group.add(foot);
  group.rotation.y = turn;

  // ---- the still life, placed in view coordinates (x to the right, z towards the viewer) so nothing hides anything:
  // a large sphere (the smooth gradient the dither loves) and a pillar at the back, three small solids in front
  const put = (mesh, x, z, y = 0) => {
    mesh.position.set(x * Math.cos(turn) - z * Math.sin(turn), topY + y, x * Math.sin(turn) + z * Math.cos(turn));     // view → slab coordinates
    mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
  };
  const j = () => rng.range(-0.04, 0.04), mx = rng.sign();               // mirror the arrangement for variety
  const rBall = rng.range(0.38, 0.43);
  put(new THREE.Mesh(new THREE.SphereGeometry(rBall, 64, 48), lambert(0.97)), -0.3 * mx + j(), -0.2 + j(), rBall);
  const hPil = rng.range(0.95, 1.2);
  put(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, hPil, 40), lambert(0.95)), 0.14 * mx + j(), -0.72 + j(), hPil / 2);
  const front = rng.shuffle([[0.5 * mx, -0.12], [0.3 * mx, 0.44], [-0.36 * mx, 0.5]]);
  const hCone = rng.range(0.6, 0.74);
  put(new THREE.Mesh(new THREE.ConeGeometry(0.23, hCone, 48), lambert(0.95)), front[0][0] + j(), front[0][1] + j(), hCone / 2);
  if (rng() < 0.5) { const cube = put(new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.31, 0.31), lambert(0.97)), front[1][0] + j(), front[1][1] + j(), 0.155); cube.rotation.y = rng.range(0, 1.5); }
  else { const ico = put(new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), lambert(0.97, { flatShading: true })), front[1][0] + j(), front[1][1] + j(), 0.22 * 0.8); ico.rotation.set(0.55, rng.range(0, 3), 0); }
  const ring = put(new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.062, 24, 64), lambert(0.95)), front[2][0] + j(), front[2][1] + j(), 0.062); ring.rotation.x = Math.PI / 2;

  ctx.frame({ radius: 1.4, fov: 24, dir: [0.0, 0.6, 1] });
  camera.updateMatrixWorld(); camera.updateProjectionMatrix();

  // ---- the window behind: a rectangle laid out on the pixel grid itself, so its title-bar stripes are exact rows
  const cols = W / cell, rows = Math.floor(H / cell), short = Math.min(W, H);
  const ppu = (((ctx.artSize ?? 0.7) * short) / 2 / 1.4) / cell;                        // cells per world unit at the subject
  const fcx = ctx.focus.x * cols, fcy = (ctx.focus.y * H) / cell;
  // a point of the pixel grid, far behind the still life (depth 0.9995 is about twenty camera distances away)
  const corner = (cx, cy, z = 0.9995) => new THREE.Vector3(((cx * cell) / W) * 2 - 1, 1 - ((cy * cell) / H) * 2, z).unproject(camera);
  let winRect = null;
  if (P.window) {
    const x0 = Math.round(fcx + (-0.78 + 0.1 * mx) * ppu), x1 = Math.round(fcx + (0.78 + 0.1 * mx) * ppu), y0 = Math.round(fcy - 1.06 * ppu), y1 = Math.round(fcy + 0.3 * ppu);
    const bar = Math.max(5, 2 * Math.round(ppu * 0.055) + 1);                            // title bar: an odd number of rows
    winRect = [x0, y0, x1, y1];
    const wg = new THREE.BufferGeometry(), c = [corner(x0, y0), corner(x1, y0), corner(x1, y1), corner(x0, y1)];
    wg.setAttribute('position', new THREE.Float32BufferAttribute([c[0], c[1], c[2], c[0], c[2], c[3]].flatMap((v) => [v.x, v.y, v.z]), 3));
    const win = new THREE.Mesh(wg, new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: { uRect: { value: new THREE.Vector4(x0, y0, x1, y1) }, uCell: { value: cell }, uH: { value: H }, uBar: { value: bar }, uA: { value: dark ? 0.16 : 0.1 }, uB: { value: dark ? 0.8 : 0.62 } },
      vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
        uniform vec4 uRect; uniform float uCell, uH, uBar, uA, uB;
        void main(){
          vec2 r = floor(vec2(gl_FragCoord.x, uH - gl_FragCoord.y) / uCell) - uRect.xy, size = uRect.zw - uRect.xy;      // cell inside the window, y down
          float d;
          if (r.y < uBar) {                                               // title bar: light, pin-striped, with a close box
            d = 0.97;
            if (mod(r.y, 2.0) > 0.5 && r.y < uBar - 1.0 && r.x > uBar + 2.5 && r.x < size.x - 3.5) d = 0.08;
            vec2 b = r - vec2(2.0, 1.0); float bs = uBar - 3.0;
            if (b.x >= 0.0 && b.x <= bs && b.y >= 0.0 && b.y <= bs) d = (b.x < 0.5 || b.x > bs - 0.5 || b.y < 0.5 || b.y > bs - 0.5) ? 0.08 : 0.97;
          } else if (r.y < uBar + 1.0) d = 0.08;                           // rule under the bar
          else { float t = (r.y - uBar) / max(size.y - uBar, 1.0); d = mix(uB, uA, t * t * (3.0 - 2.0 * t)); }      // light at the top, deep at the foot
          gl_FragColor = vec4(vec3(pow(d, 2.2)), 1.0);
        }`,
    }));
    win.frustumCulled = false; scene.add(win);
  }

  // ---- pixel dust: short horizontal dashes and small boxes scattered around the subject, away from the type.
  // Deliberately rectangles: with the pass's outline they come out as pills and frames, never as round dots.
  if (P.dust > 0) {
    const quiet = ctx.quiet || [], solid = [], hollow = [], outlined = P.outline === 'auto' ? !dark : !!P.outline;
    const free = (cx, cy, pad) => !quiet.some(([qx0, qy0, qx1, qy1]) => (cx + 0.5) / cols > qx0 - pad && (cx + 0.5) / cols < qx1 + pad && ((cy + 0.5) * cell) / H > qy0 - pad && ((cy + 0.5) * cell) / H < qy1 + pad);
    const want = Math.round(20 * P.dust); let made = 0;
    for (let tries = 0; tries < want * 12 && made < want; tries++) {
      const sig = 0.2 + 0.4 * (ctx.artSize ?? 0.7);                       // in short-side units
      const cx = Math.round((ctx.focus.x + (rng.gauss() * sig) / Math.max(ctx.aspect, 1)) * cols), cy = Math.round((ctx.focus.y + (rng.gauss() * sig) / Math.max(1 / ctx.aspect, 1)) * rows);
      const box = rng() < 0.25, nx = box ? rng.int(6, 7) : outlined ? rng.int(3, 5) : rng.int(1, 3), ny = box ? 3 : 1;      // cells
      if (cx < 6 || cy < 6 || cx > cols - 12 || cy > rows - 9 || !free(cx, cy, 0.04) || !free(cx + nx, cy + ny, 0.04)) continue;
      if (winRect && cx > winRect[0] - 9 && cx < winRect[2] + 3 && cy > winRect[1] - 6 && cy < winRect[3] + 3) continue;      // not on the window
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const v = corner(cx + i + 0.5, cy + j + 0.5, 0.999), edge = i === 0 || j === 0 || i === nx - 1 || j === ny - 1;
        (box && (outlined || !edge) ? hollow : solid).push(v.x, v.y, v.z);
      }
      made++;
    }
    const dustPts = (pts, d) => {
      if (!pts.length) return;
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const m = new THREE.Points(sg, new THREE.ShaderMaterial({
        uniforms: { uSize: { value: cell }, uL: { value: Math.pow(d, 2.2) } },
        vertexShader: 'uniform float uSize; void main(){ gl_PointSize = uSize; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform float uL; void main(){ gl_FragColor = vec4(vec3(uL), 1.0); }',
      }));
      m.frustumCulled = false; scene.add(m);
    };
    dustPts(solid, dark ? 0.98 : 0.12); dustPts(hollow, dark ? 0.03 : 0.985);
  }

  const outline = P.outline === 'auto' ? (dark ? null : ramp[0]) : P.outline ? (dark ? ramp[ramp.length - 1] : ramp[0]) : null;
  // copy lying on the subject (layout "center"): its flat rectangle gets a one-pixel frame and reads as a dialog box
  const q0 = (ctx.quiet || [])[0], boxed = !!q0 && ctx.focus.x > q0[0] && ctx.focus.x < q0[2] && ctx.focus.y > q0[1] && ctx.focus.y < q0[3];
  return makeComposer(ctx, { samples: 4, display: [ditherPassShader(ctx, { colors: ramp, cell, bayer: P.bayer, gamma: 0.8 / P.contrast, background: palette.bg, outline, border: boxed ? palette.ink : null, quietPad: boxed ? 0.022 : 0 })] });
}
