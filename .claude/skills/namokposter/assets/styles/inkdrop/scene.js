// Ink in Water — pigment blooming in a tank, as in high-speed ink photography. The plume is not painted: a
// small fluid simulation (ink-sim.js) releases jets of ink into still water and lets the flow roll them up
// into vortex rings; a lattice of tracers carried by the flow records where every drop of ink went, and
// the cut through the jet is spun round its axis, so the picture is a pile of translucent bells and veils
// whose edges gather into dark, curling filaments. A couple of million points are accumulated into an
// ink-density image (one channel per ink) and developed like a photograph: the inks absorb the light of a
// pale ground (Beer–Lambert), or glow against a black one.
// params.motif:
//   plume   one ink drop rising: a bell-shaped head trailing a thin stem
//   drop    the same, falling from above
//   duet    two inks released towards each other, meeting and wrapping round one another
//   band    a horizontal train of puffs: a cloud band across the art area, three inks braided
//
// Palette: bg = the water (kept clean) · colors[0], colors[1], colors[2] = the inks · a dark bg makes the inks luminous
import { quietUniforms, GLSL_QUIET, GLSL_NOISE_KIT, backgroundQuad } from '/skill/assets/web/scene-lib.js';
import { simulateInk } from './ink-sim.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export default function build(ctx) {
  const { THREE, scene, camera, renderer, palette, params, aspect, rng, unit, width: W, height: H } = ctx;
  const sx = Math.max(aspect, 1), sy = Math.max(1 / aspect, 1);            // frame fraction → short-side units
  const P = {
    motif: String(params.motif ?? 'plume'), inks: clamp(Math.round(params.inks ?? 2), 1, 3), strength: clamp(params.strength ?? 1, 0.3, 2.5),
    ripple: clamp(params.ripple ?? 1, 0, 2.5), filaments: clamp(params.filaments ?? 1, 0, 2.5), size: clamp(params.size ?? 1, 0.5, 1.3), grain: clamp(params.grain ?? 1, 0, 2.5),
  };
  const cols = palette.colors?.length ? palette.colors : [palette.ink];
  const bgc = new THREE.Color(palette.bg), dark = bgc.getHSL({}).l < 0.4;

  // ---- the art area (short-side units, y down) and the square of water that is simulated around it
  const [fx0, fy0, fx1, fy1] = ctx.artRect; let ax0 = fx0 * sx, ay0 = fy0 * sy, ax1 = fx1 * sx, ay1 = fy1 * sy;
  const acx = ctx.focus.x * sx, acy = ctx.focus.y * sy;
  { const hw = Math.min(acx - ax0, ax1 - acx) * P.size, hh = Math.min(acy - ay0, ay1 - acy) * P.size; ax0 = acx - hw; ax1 = acx + hw; ay0 = acy - hh; ay1 = acy + hh; }   // centred on the focus
  const aw = ax1 - ax0, ah = ay1 - ay0;
  const copy = ctx.quiet?.[0], copyCx = copy ? ((copy[0] + copy[2]) / 2) * sx : acx - 1;
  const side = Math.abs(acx - copyCx) < 0.12 * sx ? (rng() < 0.5 ? -1 : 1) : acx > copyCx ? 1 : -1;      // which way "away from the copy" is
  const wide = aw / ah > 1.7, NX = wide ? 256 : 128, NY = 128;
  const cell = Math.max(aw / (NX * 0.74), ah / (NY * 0.74));                // the art area takes the middle three quarters of the grid
  const gx = (x) => (x - acx) / cell + NX / 2, gy = (y) => (y - acy) / cell + NY / 2;
  const gw = aw / cell, gh = ah / cell;

  // ---- the jets, in grid cells
  const jet = (x, y, dx, dy, reach, inks, o = {}) => {
    const sc = reach / 90, l = Math.hypot(dx, dy);
    return { x: gx(x), y: gy(y), dx: dx / l, dy: dy / l, reach, radius: 4.3 * sc * (o.radius ?? 1), thrust: 0.04 * sc * (o.thrust ?? 1), buoy: 0.0045 * sc * (o.buoy ?? 1), inks,
      pulse: o.pulse ?? 0.5, beat: o.beat ?? 0.8, beatRate: o.beatRate ?? rng.range(0.05, 0.09), taper: o.taper, ripple: P.ripple, limb: 0.17 * P.filaments };
  };
  const inkSet = [[0], [0, 1], [0, 1, 2]][P.inks - 1];
  let jets;
  if (P.motif === 'duet') {
    // along the longer diagonal of the art area, slightly out of line so that the two heads turn round each other
    const dx = aw * 0.72 * side, dy = -ah * 0.72, l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l, L = Math.min(gw / Math.abs(ux), gh / Math.abs(uy)) * 0.95, off = 0.045 * L * cell;
    const a = [acx - ux * 0.44 * L * cell + uy * off, acy - uy * 0.44 * L * cell - ux * off], b = [acx + ux * 0.44 * L * cell - uy * off, acy + uy * 0.44 * L * cell + ux * off];
    jets = [jet(a[0], a[1], ux, uy, 0.42 * L, [0], { beat: 0.6 }), jet(b[0], b[1], -ux, -uy, 0.42 * L, [P.inks > 1 ? 1 : 0], { beat: 0.6 })];
    if (P.inks > 2) { jets[0].inks = [0, 2]; }
  } else if (P.motif === 'band') {
    // released at the outer side, travelling towards the copy in puffs
    const L = gw * 0.98, y = acy + rng.range(-0.05, 0.05) * ah;
    jets = [jet(acx + side * 0.45 * aw, y, -side, rng.range(-0.08, 0.08), 0.8 * L, P.inks > 1 ? [0, 1, 2].slice(0, Math.max(2, P.inks)) : [0], { beat: 1.0, beatRate: rng.range(0.055, 0.075), buoy: 0.25, taper: [0.78, 0.97], pulse: 0.3, radius: Math.min(1.25, (gh / L) * 1.9) })];
  } else {
    // one drop: rising (plume) or falling (drop); in a wide art area it leans so that it uses the width
    const up = P.motif === 'drop' ? 1 : -1, lean = clamp((aw / ah - 0.85) * 0.75, 0, 0.95) * side * (P.motif === 'drop' ? -1 : 1);
    const dx = Math.sin(lean), dy = up * Math.cos(lean), L = Math.min(gw / Math.max(Math.abs(dx), 1e-3), gh / Math.abs(dy)) * 0.94;
    jets = [jet(acx - dx * 0.47 * L * cell, acy - dy * 0.47 * L * cell, dx, dy, 0.8 * L, inkSet, {})];
  }
  const sim = simulateInk({ nx: NX, ny: NY, jets, maxSteps: 640, M: 128, rows: 3, fill: Math.round(56 / jets.length), ambient: 0.04 * (jets[0].reach / 90) }, rng);

  // ---- points → ink density (one channel per ink), accumulated in a float target
  // The plume is then fitted into the art area: its bounding box (ignoring the faintest wisps) is centred on
  // the focus and scaled to fill the rectangle, so the ink is as large as the layout allows in any format.
  const n = sim.count, src = sim.points, attr = new Float32Array(n * 4);
  const xs = [], ys = []; for (let i = 0; i < n; i += 29) { xs.push(src[i * 4]); ys.push(src[i * 4 + 1]); }
  xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
  const lo = Math.floor(xs.length * 0.004), hi = Math.max(lo, Math.ceil(xs.length * 0.996) - 1);
  const bw = Math.max(xs[hi] - xs[lo], 1), bh = Math.max(ys[hi] - ys[lo], 1), bcx = (xs[hi] + xs[lo]) / 2, bcy = (ys[hi] + ys[lo]) / 2;
  const fit = Math.min((aw * 0.95) / bw, (ah * 0.95) / bh), cellPx = fit * Math.min(W, H);
  for (let i = 0; i < n; i++) {
    attr[i * 4] = ((src[i * 4] - bcx) * fit + acx) / sx; attr[i * 4 + 1] = ((src[i * 4 + 1] - bcy) * fit + acy) / sy;       // frame fraction, y down
    attr[i * 4 + 2] = src[i * 4 + 2] * cellPx * cellPx; attr[i * 4 + 3] = src[i * 4 + 3];                                  // ink in px² of full cover
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); geo.setAttribute('a', new THREE.BufferAttribute(attr, 4));
  const spot = Math.max(3, unit * 0.25);                                      // sprite diameter in px
  const pts = new THREE.Points(geo, new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false, transparent: true, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    uniforms: { uSize: { value: spot } },
    vertexShader: /* glsl */`attribute vec4 a; uniform float uSize; varying vec4 vInk;
      void main(){ vInk = vec4(a.w < 0.5 ? 1.0 : 0.0, a.w > 0.5 && a.w < 1.5 ? 1.0 : 0.0, a.w > 1.5 ? 1.0 : 0.0, 0.0) * a.z;
        gl_Position = vec4(a.x * 2.0 - 1.0, 1.0 - a.y * 2.0, 0.0, 1.0); gl_PointSize = uSize; }`,
    fragmentShader: /* glsl */`uniform float uSize; varying vec4 vInk;
      void main(){ vec2 d = (gl_PointCoord - 0.5) * uSize; float s = uSize * 0.26;      // gaussian footprint, unit volume
        gl_FragColor = vInk * exp(-dot(d, d) / (2.0 * s * s)) / (6.2832 * s * s); }`,
  }));
  pts.frustumCulled = false;
  const inkScene = new THREE.Scene(); inkScene.add(pts);
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });

  // ---- development: density → colour
  const C = (i) => new THREE.Color(cols[Math.min(i, cols.length - 1)]);
  scene.add(backgroundQuad(/* glsl */`
    varying vec2 vUv; uniform sampler2D tD; uniform vec2 uRes, uAsp, uFocus; uniform vec3 bg, ink0, ink1, ink2; uniform float uDark, uK, uLod, uGrain, uGrainPx;
    ${GLSL_QUIET}
    ${GLSL_NOISE_KIT}
    vec3 soft(vec2 uv, float lod){                                            // four taps of a coarse level: a round, cheap blur
      vec2 o = exp2(lod) * 0.6 / uRes;
      return 0.25 * (textureLod(tD, uv + o * vec2(1.0, 0.4), lod).rgb + textureLod(tD, uv + o * vec2(-0.4, 1.0), lod).rgb + textureLod(tD, uv + o * vec2(-1.0, -0.4), lod).rgb + textureLod(tD, uv + o * vec2(0.4, -1.0), lod).rgb);
    }
    void main(){
      vec2 p = vec2(vUv.x, 1.0 - vUv.y);
      vec3 fine = textureLod(tD, vUv, uLod).rgb, mid = soft(vUv, uLod + 1.6), halo = soft(vUv, uLod + 3.6);
      vec3 d = (0.56 * fine + 0.32 * mid + 0.16 * halo) * uK;                  // crisp filaments in a little diffused pigment
      d *= 1.0 - 0.94 * quietMask(p, 0.05);
      vec2 q = (p - uFocus) * uAsp; float vig = dot(q, q);
      vec3 col;
      if (uDark < 0.5) {
        // absorption: each ink removes its complement; thick ink goes deep and saturated rather than black
        vec3 tau = 2.2 * (1.0 - exp(-d / 2.2));
        vec3 a0 = -log(max(ink0, 0.012)), a1 = -log(max(ink1, 0.012)), a2 = -log(max(ink2, 0.012));
        col = bg * (1.0 - 0.035 * smoothstep(0.1, 1.2, vig)) * exp(-(a0 * tau.r + a1 * tau.g + a2 * tau.b) * 0.9);
      } else {
        // lit pigment against black water: brightness saturates, the densest folds lift towards white
        vec3 e = 1.0 - exp(-1.5 * d); float thick = 1.0 - exp(-0.55 * (d.r + d.g + d.b));
        col = bg * (1.0 + 0.5 * exp(-2.5 * vig)) + ink0 * e.r + ink1 * e.g + ink2 * e.b;
        col = mix(col, vec3(1.0), 0.22 * thick * thick);
      }
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
      vec2 g = floor(gl_FragCoord.xy / uGrainPx); float nz = hash21(g) + hash21(g + 57.3) - 1.0;
      gl_FragColor.rgb = clamp(gl_FragColor.rgb + nz * uGrain * mix(0.6, 1.0, uDark), 0.0, 1.0);
    }`, {
    tD: { value: rt.texture }, uRes: { value: new THREE.Vector2(W, H) }, uAsp: { value: new THREE.Vector2(sx, sy) }, uFocus: { value: new THREE.Vector2(ctx.focus.x, ctx.focus.y) },
    bg: { value: bgc }, ink0: { value: C(0) }, ink1: { value: C(1) }, ink2: { value: C(2) }, uDark: { value: dark ? 1 : 0 }, uK: { value: 1.15 * P.strength },
    uLod: { value: Math.max(0, Math.log2(unit / 12)) }, uGrain: { value: 0.022 * P.grain }, uGrainPx: { value: Math.max(1, unit / 10.8) }, ...quietUniforms(ctx),
  }));

  ctx.frame({ radius: 1, fov: 30, dir: [0, 0, 1] });   // the ink is composed in frame space inside ctx.artRect; nothing for the camera to place

  return {
    render() {
      const prev = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha();
      renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(inkScene, camera);
      renderer.setRenderTarget(null); renderer.setClearColor(prev, prevA); renderer.render(scene, camera);
    },
  };
}
