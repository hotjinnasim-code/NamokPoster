// Watercolour wash — translucent blooms of pigment on paper, gathered at the layout focus, with the
// copy area left as open paper. Each bloom is one soft shape drawn 30–50 times as a differently
// deformed polygon at a few percent opacity (after Tyler Hobbs), on a 2D canvas that the shader then
// treats as pigment: it pools darker along wash edges, settles into the tooth of the paper and thins
// out where water was dropped back in. Fine pen lines run side by side through the washes.
//
// Motif rules built in: blooms are lobed, elongated washes that overlap (never a clean disc); on light
// paper a red or crimson pigment is used only for large overlapping washes, never for a lone bloom or
// droplet; the pen lines are level lines of one slope — parallel strata that cannot fan out from a point.
//
// Palette: bg = paper · colors = pigments (colors[0]+[1] paint the large washes, the rest are accents)
//          ink = pen lines · accent = type only. A dark bg flips the model: light pigment on black paper.
import { makeNoise, backgroundQuad, quietUniforms, canvasTexture, deformPolygon, srgbVec, oklabVec, GLSL_NOISE_KIT, GLSL_QUIET, GLSL_DITHER } from '/skill/assets/web/scene-lib.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

export default function build(ctx) {
  const { THREE, scene, camera, palette, params, aspect, seed, rng, width: W, height: H, unit } = ctx;
  const sx = Math.max(aspect, 1), sy = Math.max(1 / aspect, 1), short = Math.min(W, H);       // frame fraction → short-side units
  const P = {
    size: clamp(params.size ?? 1, 0.5, 1.8), depth: clamp(params.depth ?? 1, 0.4, 1.8), ink: clamp(params.ink ?? 1, 0, 3),
    splatter: clamp(params.splatter ?? 1, 0, 3), wet: clamp(params.wet ?? 1, 0, 2), grain: clamp(params.grain ?? 1, 0, 2),
  };
  const paper = srgbVec(palette.bg), dark = 0.2126 * paper.x + 0.7152 * paper.y + 0.0722 * paper.z < 0.3;
  const noise = makeNoise(seed * 23 + 9);
  const css = (hex, a) => { const v = srgbVec(hex); return `rgba(${Math.round(v.x * 255)},${Math.round(v.y * 255)},${Math.round(v.z * 255)},${a})`; };

  // ---- where the copy sits: signed distance (short-side units) to the nearest rectangle that carries type
  const quiet = (ctx.quiet || []).map(([x0, y0, x1, y1]) => ({ x0, y0, x1, y1 }));
  const qDist = (x, y) => {
    let d = 9;
    for (const r of quiet) {
      const ex = (Math.abs(x - (r.x0 + r.x1) / 2) - (r.x1 - r.x0) / 2) * sx, ey = (Math.abs(y - (r.y0 + r.y1) / 2) - (r.y1 - r.y0) / 2) * sy;
      d = Math.min(d, Math.hypot(Math.max(ex, 0), Math.max(ey, 0)) + Math.min(Math.max(ex, ey), 0));
    }
    return d;
  };

  // ---- the blooms: two large, a few medium, a scatter of small ones; large ones nearest the focus
  const fx = ctx.focus.x, fy = ctx.focus.y, A = clamp(ctx.artSize ?? 0.7, 0.35, 1), k = (0.5 + 0.62 * A) * P.size;
  const copy = quiet[0], wreath = !!copy && fx > copy.x0 && fx < copy.x1 && fy > copy.y0 && fy < copy.y1;   // copy on the focus: blooms ring the copy
  const cols = palette.colors, blobs = [];
  const sizes = [0.27, 0.21, 0.16, 0.13, 0.105, 0.085, 0.07, 0.055, 0.045, 0.038];
  // pigments come in harmonious pairs (colors[0]+[1], colors[2]+[3]): one pair paints the large washes, which may
  // overlap freely; the other pair is kept to small accents that sit mostly on bare paper, so nothing turns to mud
  const nC = cols.length, flipPair = rng() < 0.5, main = flipPair ? [cols[1 % nC], cols[0]] : [cols[0], cols[1 % nC]], side = nC >= 4 ? [cols[2], cols[3]] : main;
  const blend = (a, b, t) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
  // red / crimson / rose pigments (OKLab hue between magenta and orange): on light paper they never stand alone
  const reddish = (hex) => { const v = oklabVec(hex), C = Math.hypot(v.y, v.z), h = (Math.atan2(v.z, v.y) * 180) / Math.PI; return C > 0.07 && h > -14 && h < 52; };
  const calmCols = cols.filter((c) => !reddish(c)), guard = !dark;
  for (let i = 0; i < sizes.length; i++) {
    const r0 = sizes[i] * k;
    for (let tries = 0; tries < 60; tries++) {
      let x, y;
      if (wreath) {                                                        // the roomiest of a few random spots: corners and edges, running off the sheet
        let best = -1;
        for (let c = 0; c < (i < 4 ? 10 : 3); c++) {
          const cx = rng.range(-0.06, 1.06), cy = rng.range(-0.06, 1.06);
          const score = Math.min(qDist(cx, cy), 0.5) - 0.6 * blobs.reduce((m, b) => Math.max(m, (b.r + r0) * 0.9 - Math.hypot((b.x - cx) * sx, (b.y - cy) * sy)), 0);
          if (score > best) { best = score; x = cx; y = cy; }
        }
      } else {
        const sig = (0.1 + 0.22 * A) * (i < 2 ? 0.45 : i < 5 ? 0.9 : 1.35);
        x = fx + (rng.gauss() * sig) / sx; y = fy + (rng.gauss() * sig) / sy;
      }
      const dq = qDist(x, y);
      if (x < -0.07 || x > 1.07 || y < -0.07 || y > 1.07 || dq < 0.05 + r0 * 0.25) continue;
      const r = Math.min(r0, (dq - 0.03) * 1.08);                          // a bloom shrinks to the room it has, it is not cut off
      if (r < r0 * 0.55 && tries < 45) continue;
      if (blobs.some((b) => Math.hypot((b.x - x) * sx, (b.y - y) * sy) < (i < 4 ? (b.r + r) * 0.6 : b.big ? b.r * 0.8 + r * 0.3 : (b.r + r) * 1.05))) continue;   // large washes overlap, accents keep to the rims
      let col = i < 4 ? main[i % 2] : rng() < 0.7 ? side[i % 2] : main[i % 2];
      if (guard && reddish(col)) {
        if (i >= 4) { if (!calmCols.length) break; col = calmCols[i % calmCols.length]; }                              // accents: another pigment, or none
        else if (blobs.length && !blobs.some((b) => b.big && Math.hypot((b.x - x) * sx, (b.y - y) * sy) < (b.r + r) * 0.92) && tries < 50) continue;   // large: must run into a neighbour
      }
      blobs.push({ x, y, r, col, col2: i < 4 ? blend(col, main[(i + 1) % 2], 0.4) : col, big: i < 4 });
      break;
    }
  }
  // base outline of each bloom: a soft lobed loop whose radius gives way where the copy is, with crisp and bleeding stretches
  for (const b of blobs) {
    const n = 14, a0 = rng() * 6.283, pts = [], ph = [rng() * 6.283, rng() * 6.283, rng() * 6.283], amp = [rng.range(0.1, 0.24), rng.range(0.08, 0.18), rng.range(0.03, 0.1)];
    const tilt = rng() * Math.PI, squash = guard && reddish(b.col) ? rng.range(0.52, 0.64) : rng.range(0.6, 0.82);      // an oval, then lobes: no bloom is round
    for (let j = 0; j < n; j++) {
      const a = a0 + (j / n) * Math.PI * 2, oval = squash / Math.hypot(squash * Math.cos(a - tilt), Math.sin(a - tilt));
      let r = b.r * 1.18 * oval * (1 + amp[0] * Math.sin(2 * a + ph[0]) + amp[1] * Math.sin(3 * a + ph[1]) + amp[2] * Math.sin(5 * a + ph[2]));
      const margin = rng.range(0.035, 0.08);
      for (let s = 1; s <= 8; s++) { const rr = (b.r * 1.3 * s) / 8; if (qDist(b.x + (Math.cos(a) * rr) / sx, b.y + (Math.sin(a) * rr) / sy) < margin) { r = Math.min(r, (b.r * 1.3 * (s - 1)) / 8); break; } }
      const v = clamp(0.2 + 1.7 * Math.abs(noise.noise3(Math.cos(a) * 1.1 + b.x * 9, Math.sin(a) * 1.1 + b.y * 9, 0.5)), 0.15, 1.5);
      pts.push([b.x * sx + Math.cos(a) * r, b.y * sy + Math.sin(a) * r, v]);            // short-side units
    }
    b.base = pts; b.shape = deformPolygon(pts, rng, { rounds: 1, amount: 0.3 });
  }

  // ---- paint: every layer of every bloom, interleaved, multiplied onto white (or screened onto black)
  const kc = Math.min(1, 2048 / Math.max(W, H)), cw = Math.round(W * kc), chh = Math.round(H * kc), su = Math.min(cw, chh);   // canvas px per short-side unit
  const tex = canvasTexture(cw, chh, (g) => {
    g.fillStyle = dark ? '#000' : '#fff'; g.fillRect(0, 0, cw, chh);
    g.globalCompositeOperation = dark ? 'screen' : 'multiply'; g.lineJoin = 'round';
    const trace = (poly) => { g.beginPath(); g.moveTo(poly[0][0] * su, poly[0][1] * su); for (let i = 1; i < poly.length; i++) g.lineTo(poly[i][0] * su, poly[i][1] * su); g.closePath(); };
    const jobs = [];
    for (const b of blobs) { const L = Math.round((b.big ? rng.range(30, 42) : rng.range(20, 30)) * P.depth); for (let l = 0; l < L; l++) jobs.push({ b, l, key: l / L + rng() * 0.08 }); }
    // more pigment dropped into the wet middle of the large washes: a deeper, off-centre core
    for (const b of blobs) {
      if (!b.big) continue;
      const a = rng() * 6.283, d = b.r * rng.range(0.1, 0.3), f = rng.range(0.45, 0.62), ox = b.x * sx + Math.cos(a) * d, oy = b.y * sy + Math.sin(a) * d;
      b.core = b.shape.map(([x, y, v]) => [ox + (x - b.x * sx) * f, oy + (y - b.y * sy) * f, 1.2]);
      const L = Math.round(rng.range(8, 14) * P.depth); for (let l = 0; l < L; l++) jobs.push({ b, l: -1, key: 0.3 + 0.7 * rng() });
    }
    jobs.sort((a, b) => a.key - b.key);
    for (const { b, l } of jobs) {
      const poly = deformPolygon(l < 0 ? b.core : b.shape, rng, { rounds: l < 0 ? 4 : b.big ? 5 : 4, amount: l < 0 ? 0.55 : 0.46 });
      trace(poly);
      g.fillStyle = css(l % 4 === 3 ? b.col2 : b.col, dark ? 0.03 : 0.028); g.fill();
      if (l >= 0 && l % 7 === 0) { g.strokeStyle = css(b.col, 0.05); g.lineWidth = Math.max(1, su * 0.0014); g.stroke(); }     // pigment left at the drying edge
    }
    // drops of clean water fallen into a wash: the pigment is pushed out to a ragged rim
    g.globalCompositeOperation = 'source-over';
    for (const b of blobs) {
      if (!b.big || rng() < 0.3) continue;
      const a = rng() * 6.283, d = b.r * rng.range(0.15, 0.5), r = b.r * rng.range(0.2, 0.34), pts = [];
      for (let j = 0; j < 9; j++) { const t = (j / 9) * 6.283; pts.push([b.x * sx + Math.cos(a) * d + Math.cos(t) * r * rng.range(0.8, 1.2), b.y * sy + Math.sin(a) * d + Math.sin(t) * r * rng.range(0.8, 1.2), rng.range(0.5, 1.4)]); }
      const shape = deformPolygon(pts, rng, { rounds: 2, amount: 0.36 });
      for (let l = 0; l < 7; l++) { trace(deformPolygon(shape, rng, { rounds: 3, amount: 0.5 })); g.fillStyle = dark ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)'; g.fill(); }
    }
    // splatter: droplets flicked off the brush, thrown outwards from the blooms
    g.globalCompositeOperation = dark ? 'screen' : 'multiply';
    for (const b of blobs) {
      const count = Math.round((b.big ? 7 : 3) * P.splatter), dropCol = guard && reddish(b.col) ? calmCols[0] : b.col;
      if (!dropCol) continue;
      for (let s = 0; s < count; s++) {
        const a = rng() * 6.283, d = b.r * rng.range(0.9, 1.8), x = b.x * sx + Math.cos(a) * d, y = b.y * sy + Math.sin(a) * d, r = b.r * 0.012 + Math.pow(rng(), 3) * 0.013;
        if (qDist(x / sx, y / sy) < 0.04 + r) continue;
        const pts = []; for (let j = 0; j < 7; j++) { const t = (j / 7) * 6.283; pts.push([x + Math.cos(t) * r * rng.range(0.8, 1.2), y + Math.sin(t) * r * rng.range(0.8, 1.2), 0.8]); }
        trace(deformPolygon(pts, rng, { rounds: 2, amount: 0.25 })); g.fillStyle = css(dropCol, rng.range(0.35, 0.7)); g.fill();
      }
    }
  }, { srgb: false });

  scene.add(backgroundQuad(/* glsl */`
    varying vec2 vUv; uniform sampler2D tWash; uniform vec2 uAsp, uTexel; uniform vec3 uPaper; uniform float uDark, uWet, uGrain, uSeed;
    ${GLSL_NOISE_KIT}
    ${GLSL_QUIET}
    ${GLSL_DITHER}
    // how much light the paint lets through: 1 = bare paper (for light paint on black paper: how much black remains)
    vec3 wash(vec2 uv){ vec3 t = texture2D(tWash, uv).rgb; return uDark > 0.5 ? 1.0 - t : t; }
    float dens(vec2 uv){ vec3 t = wash(uv); return 1.0 - min(t.r, min(t.g, t.b)); }
    void main(){
      vec2 p = vec2(vUv.x, 1.0 - vUv.y), q = p * uAsp;
      // the sheet buckles a little: wash edges wander by a hair
      vec2 uv = vUv + 0.0011 * vec2(noise2(q * 17.0 + uSeed), noise2(q * 17.0 - uSeed)) / uAsp;
      vec3 t = wash(uv);
      // pigment pools where a wash stops: a fine dark line at the edge, and a broader deepening towards it
      vec2 e1 = uTexel * 1.6, e2 = uTexel * 6.0;
      float g1 = length(vec2(dens(uv + vec2(e1.x, 0.0)) - dens(uv - vec2(e1.x, 0.0)), dens(uv + vec2(0.0, e1.y)) - dens(uv - vec2(0.0, e1.y))));
      float g2 = length(vec2(dens(uv + vec2(e2.x, 0.0)) - dens(uv - vec2(e2.x, 0.0)), dens(uv + vec2(0.0, e2.y)) - dens(uv - vec2(0.0, e2.y))));
      float pool = uWet * mix(1.0, 0.4, uDark) * (1.3 * smoothstep(0.0, 0.25, g1) + 0.7 * smoothstep(0.0, 0.5, g2));
      // cold-pressed paper: pigment settles into the dimples; water marks drift through the wash
      vec3 cell = cellular2(warp2(q * 290.0, 0.5));
      float tooth = (0.36 - cell.x) * 1.2 + 0.6 * noise2(q * 130.0);
      float drift = fbm2(q * 3.4 + uSeed, 4);
      t = pow(t, vec3(max(0.25, 1.0 + pool + uGrain * 0.2 * tooth + 0.45 * drift)));
      // the paint stays off the type (a soft edge, should a bloom reach that far)
      t = mix(t, vec3(1.0), quietMask(p + 0.02 * vec2(drift, noise2(q * 5.0)), 0.03) * 0.97);
      float sheet = 1.0 + uGrain * (0.012 * tooth + 0.01 * fbm2(q * vec2(40.0, 7.0) + 3.0, 3));          // tooth and a few long fibres
      vec3 col = uDark > 0.5 ? 1.0 - (1.0 - uPaper * sheet) * t : uPaper * sheet * t;
      col = clamp(col, 0.0, 1.0);
      gl_FragColor = vec4(mix(col / 12.92, pow((col + 0.055) / 1.055, vec3(2.4)), step(0.04045, col)), 1.0);     // display → linear
      #include <colorspace_fragment>
      gl_FragColor.rgb += ditherNoise(gl_FragCoord.xy);
    }`, {
    tWash: { value: tex }, uAsp: { value: new THREE.Vector2(sx, sy) }, uTexel: { value: new THREE.Vector2(1 / cw, 1 / chh) }, uPaper: { value: paper },
    uDark: { value: dark ? 1 : 0 }, uWet: { value: P.wet }, uGrain: { value: P.grain }, uSeed: { value: (seed % 97) * 0.61 }, ...quietUniforms(ctx),
  }));

  ctx.frame({ radius: 1, fov: 30, dir: [0, 0, 1] });
  camera.updateMatrixWorld(); camera.updateProjectionMatrix();

  // ---- pen work, drawn as real lines over the wash (resolution independent)
  if (P.ink > 0 && blobs.length) {
    const toWorld = (ux, uy) => new THREE.Vector3((ux / sx) * 2 - 1, 1 - (uy / sy) * 2, 0.5).unproject(camera);     // short-side units → world
    const inkCol = new THREE.Color(palette.ink), group = new THREE.Group(); group.renderOrder = 10; scene.add(group);
    const addLine = (pts, width, opacity) => {
      if (pts.length < 4) return;
      const geo = new THREE.LineGeometry(), flat = [];
      for (const [x, y] of pts) { const v = toWorld(x, y); flat.push(v.x, v.y, v.z); }
      geo.setPositions(flat);
      const mat = new THREE.LineMaterial({ color: inkCol, linewidth: Math.max(1, unit * width), transparent: true, opacity, depthTest: false, depthWrite: false });
      mat.resolution.set(W, H);
      const line = new THREE.Line2(geo, mat); line.frustumCulled = false; group.add(line);
    };
    // strata: level lines of one gently warped slope. They run side by side like the grain of wood or lines of a
    // score — by construction they never meet, cross or fan out from a point.
    const th = rng.range(-0.32, 0.32), ct = Math.cos(th), st = Math.sin(th), eps = 0.075;
    const level = (xp, c) => { let yp = c; for (let it = 0; it < 3; it++) yp = c + eps * 2 * noise.fbm(xp * 1.3, yp * 1.3, 7.7, 2); return yp; };
    const stratum = (c, xa, xb, width, opacity, dotted) => {
      let run = [];
      for (let xp = xa; xp <= xb; xp += 0.006) {
        const yp = level(xp, c), x = xp * ct - yp * st, y = xp * st + yp * ct;
        if (x < -0.03 || x > sx + 0.03 || y < -0.03 || y > sy + 0.03 || qDist(x / sx, y / sy) < 0.04) { if (!dotted) addLine(run, width, opacity); run = []; } else run.push([x, y]);
      }
      if (dotted) return run;
      addLine(run, width, opacity); return run;
    };
    const big = blobs.filter((b) => b.big), dotRuns = [];
    for (let i = 0, n = Math.round(4 * P.ink); i < n; i++) {
      const b = big[i % Math.max(1, big.length)] ?? blobs[0], bxp = b.x * sx * ct + b.y * sy * st, byp = -b.x * sx * st + b.y * sy * ct;
      const c = byp + rng.range(-0.75, 0.75) * b.r, len = rng.range(0.35, 0.85) * (0.6 + 0.6 * A), xa = bxp - len * rng.range(0.35, 0.65), xb = xa + len;
      stratum(c, xa, xb, 0.11, 0.8);
      if (rng() < 0.5) stratum(c + rng.range(0.009, 0.014), xa + len * rng.range(0.05, 0.3), xb - len * rng.range(0.05, 0.3), 0.07, 0.55);     // a fainter twin
      if (rng() < 0.7) dotRuns.push(stratum(c, xb + 0.012, xb + rng.range(0.08, 0.2), 0, 0, true));                                  // the line trails off in dots
    }
    // a loose pencil ring around the largest blooms, broken where it would cross the copy
    for (const b of big.slice(0, 2 + (rng() < 0.5 ? 1 : 0))) {
      let ring = b.base.map(([x, y]) => [b.x * sx + (x - b.x * sx) * 1.1 + rng.range(-0.012, 0.012), b.y * sy + (y - b.y * sy) * 1.1 + rng.range(-0.012, 0.012)]);
      for (let c = 0; c < 4; c++) { const nx = []; for (let j = 0; j < ring.length; j++) { const p0 = ring[j], p1 = ring[(j + 1) % ring.length]; nx.push([lerp(p0[0], p1[0], 0.25), lerp(p0[1], p1[1], 0.25)], [lerp(p0[0], p1[0], 0.75), lerp(p0[1], p1[1], 0.75)]); } ring = nx; }   // Chaikin
      const start = rng.int(0, ring.length - 1), keep = Math.round(ring.length * rng.range(0.55, 0.9)); let run = [];
      for (let j = 0; j <= keep; j++) {
        const pt = ring[(start + j) % ring.length];
        if (qDist(pt[0] / sx, pt[1] / sy) < 0.04) { addLine(run, 0.075, 0.6); run = []; } else run.push(pt);
      }
      addLine(run, 0.075, 0.6);
    }
    // stippled dots: each one continues a pen line along its own stratum, shrinking as it goes
    const dots = [], sizes2 = [];
    for (const run of dotRuns) {
      for (let j = 2; j < run.length; j += 3) { const v = toWorld(run[j][0], run[j][1]); dots.push(v.x, v.y, v.z); sizes2.push(unit * lerp(0.3, 0.12, j / run.length)); }
    }
    if (dots.length) {
      const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.Float32BufferAttribute(dots, 3)); dg.setAttribute('size', new THREE.Float32BufferAttribute(sizes2, 1));
      const pm = new THREE.Points(dg, new THREE.ShaderMaterial({
        transparent: true, depthTest: false, depthWrite: false, uniforms: { uCol: { value: inkCol } },
        vertexShader: 'attribute float size; void main(){ gl_PointSize = size; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform vec3 uCol; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; gl_FragColor = vec4(uCol, smoothstep(1.0, 0.72, d) * 0.8); \n#include <colorspace_fragment>\n }',
      }));
      pm.frustumCulled = false; pm.renderOrder = 11; scene.add(pm);
    }
  }
}
