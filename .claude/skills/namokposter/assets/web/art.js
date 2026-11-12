// three.js art runner: loads one scene module, renders a single still at the requested size and
// hands the PNG back to Node. Scenes never deal with canvas setup, framing maths or export.
import * as THREE from '/skill/assets/vendor/three.bundle.min.js';
import * as lib from '/skill/assets/web/scene-lib.js';

window.renderArt = async function renderArt(job) {
  const W = job.width, H = job.height, aspect = W / H;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H; canvas.style.cssText = 'width:100vw;height:100vh;display:block';
  document.body.replaceChildren(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: !!job.transparent, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(new THREE.Color(job.palette.bg), job.transparent ? 0 : 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, aspect, 0.05, 500);
  const rng = lib.makeRng(job.seed);
  const [fx, fy] = job.layout.focus;

  const ctx = {
    THREE, lib, renderer, scene, camera, canvas, rng,
    width: W, height: H, aspect, orient: job.orient,
    /** px per 1% of the short side — multiply point sizes / line widths by this so they scale with resolution */
    unit: Math.min(W, H) / 100,
    palette: job.palette, params: job.params || {}, seed: job.seed, quality: job.quality,
    layout: job.layout, focus: { x: fx, y: fy }, artSize: job.layout.artSize, textRect: job.layout.text,
    /** rectangles that carry type ([x0,y0,x1,y1] fractions, y down): copy block first, then footer/header */
    quiet: job.layout.quiet || [job.layout.text],
    /** rectangle reserved for the subject ([x0,y0,x1,y1] fractions, y down) */
    artRect: job.layout.artRect || [0, 0, 1, 1],
    /**
     * Aim the camera at the origin so that a sphere of `radius` world units fills `artSize` of the
     * short side, then shift the lens so the origin lands on the layout's focus point. Scenes build
     * their subject around the origin and call this once.
     *   dir: direction from the origin towards the camera; fov: field of view along the short side.
     */
    frame({ radius = 1, fov = 30, dir = [0, 0.12, 1], size = job.layout.artSize, up = [0, 1, 0], width, height } = {}) {
      // A subject that is not round can give its on-screen width and height (world units) instead
      // of a radius: it is then fitted into the art rectangle, so a tall tower or a wide still
      // life uses the space it actually has.
      if (width && height) {
        const [ax0, ay0, ax1, ay1] = ctx.artRect, fill = job.layout.fill ?? 1;
        const ppu = Math.min(((ax1 - ax0) * W * fill) / width, ((ay1 - ay0) * H * fill) / height);
        radius = Math.max(width, height) / 2; size = (2 * radius * ppu) / Math.min(W, H);
      }
      const half = THREE.MathUtils.degToRad(fov) / 2;
      const dist = radius / (size * Math.tan(half));
      const d = new THREE.Vector3(...dir).normalize().multiplyScalar(dist);
      camera.position.copy(d); camera.up.set(...up); camera.lookAt(0, 0, 0);
      camera.fov = aspect >= 1 ? fov : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(half) / aspect));
      camera.near = Math.max(0.01, dist / 200); camera.far = dist * 60;
      camera.setViewOffset(W, H, (0.5 - fx) * W, (0.5 - fy) * H, W, H);
      camera.updateProjectionMatrix();
      return dist;
    },
  };

  const mod = await import(job.sceneUrl);
  const build = mod.default || mod.build;
  if (typeof build !== 'function') throw new Error('Scene module must `export default function build(ctx)`.');
  const out = (await build(ctx)) || {};
  camera.updateProjectionMatrix();
  if (typeof out.render === 'function') await out.render();
  else renderer.render(scene, camera);

  const gl = renderer.getContext(); gl.finish();
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = ''; const CH = 0x8000;
  for (let i = 0; i < buf.length; i += CH) bin += String.fromCharCode.apply(null, buf.subarray(i, i + CH));
  const info = renderer.info.render;
  return { png: btoa(bin), calls: info.calls, triangles: info.triangles, points: info.points, lines: info.lines };
};
