// Plexus — a network drawing: nodes spread evenly over a form (blue-noise spacing, never a random spray)
// and joined to their nearest neighbours by hairlines, so the form reads as a fine irregular mesh.
// Depth does the modelling: the near side is crisp and bright, the far side thin and faint; a few
// facets are filled with a breath of colour, a few chains of links carry a "signal" in the hot colour
// and end in a ringed hub. One flank of the form loosens into free nodes.
// Additive light on dark palettes, plain ink on light ones.
//
// motif: sphere | torus | wave (a flowing sheet) | constellation (a sparse cloud joined by a spanning tree)
// Palette: colors[0] → colors[1] shade lines and nodes from the far / shaded side to the near / lit side,
//          colors[2] = the hot colour of signals and hubs, bg = backdrop.
import { backgroundQuad, quietUniforms, GLSL_QUIET, makeComposer, finishPassShader } from '/skill/assets/web/scene-lib.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export default function build(ctx) {
  const { THREE, scene, camera, rng, palette, params, unit, width: W, height: H, aspect, focus, artSize } = ctx;
  const cols = palette.colors?.length ? palette.colors : [palette.ink, palette.accent];
  const C = (i) => new THREE.Color(cols[Math.min(i, cols.length - 1)]);
  const bgc = new THREE.Color(palette.bg), dark = bgc.getHSL({}).l < 0.4;
  const P = {
    motif: ['sphere', 'torus', 'wave', 'constellation'].includes(params.motif) ? params.motif : 'sphere',
    density: clamp(params.density ?? 1, 0.4, 2.2), scatter: clamp(params.scatter ?? 1, 0, 2), signals: Math.round(clamp(params.signals ?? 5, 0, 12)),
    facets: clamp(params.facets ?? 1, 0, 3), glow: clamp(params.glow ?? 1, 0, 2), line: clamp(params.line ?? 1, 0.5, 2.5),
  };
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const flip = focus.x < 0.45 ? -1 : 1;                                 // the copy is on the left (1) or on the right (-1) of the subject

  // ------------------------------------------------------------------ nodes
  // Poisson-disc by dart throwing: a candidate is kept when no earlier node is closer than the local spacing.
  const nodes = [];                                                     // { p, n (surface normal, for shading), s (local spacing), w (weight 0..1) }
  const throwDarts = (sample, want, tries = 60) => {
    for (let t = 0; t < want * tries && nodes.length < want; t++) {
      const c = sample(); if (!c) continue;
      let ok = true;
      for (let i = 0; i < nodes.length; i++) { const q = nodes[i], m = 0.5 * (c.s + q.s); if (c.p.distanceToSquared(q.p) < m * m) { ok = false; break; } }
      if (ok) nodes.push(c);
    }
  };
  const onSphere = () => { const y = rng.range(-1, 1), a = rng() * TAU, r = Math.sqrt(1 - y * y); return V(r * Math.cos(a), y, r * Math.sin(a)); };

  let view, FOV = 24, frameArgs, R = 1, reach = 1.62, maxDeg = 7, lightDir, extent = 1;
  const loose = V(0.86 * flip, 0.42, 0.28).normalize();                 // the flank that comes apart, away from the copy
  if (P.motif === 'sphere') {
    view = V(0, 0.16, 1).normalize(); lightDir = V(-0.6 * flip, 0.62, 0.5).normalize();
    const want = Math.round(520 * P.density), s0 = Math.sqrt((4 * Math.PI) / want) * 0.86;
    // spacing opens up towards the loose flank, so the mesh is finest where the light falls
    throwDarts(() => { const p = onSphere(), d = p.dot(loose); return { p, n: p.clone(), s: s0 * (1 + 0.32 * sstep(0.1, 1, d)) }; }, want);
    for (const nd of nodes) {
      const d = nd.p.dot(loose), k = P.scatter * Math.pow(sstep(0.42, 1.0, d), 1.5);
      if (k > 0) { nd.p.multiplyScalar(1 + k * rng.range(0.0, 0.5)).add(V(rng.gauss(), rng.gauss(), rng.gauss()).multiplyScalar(0.035 * k)); nd.free = k; }
    }
    extent = 1 + 0.3 * P.scatter; frameArgs = { radius: 1.05 + 0.17 * Math.min(P.scatter, 1.4) };
  } else if (P.motif === 'torus') {
    view = V(0.0, 0.62, 1).normalize(); lightDir = V(-0.55 * flip, 0.75, 0.35).normalize();
    const A = 0.74, B = 0.33, want = Math.round(640 * P.density), s0 = Math.sqrt((4 * Math.PI * Math.PI * A * B) / want) * 0.86;
    const tilt = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.18, rng() * TAU, -0.2 * flip));
    throwDarts(() => {
      const u = rng() * TAU, v = rng() * TAU; if (rng() > (A + B * Math.cos(v)) / (A + B)) return null;      // uniform by area
      const n = V(Math.cos(v) * Math.cos(u), Math.sin(v), Math.cos(v) * Math.sin(u)), p = V(A * Math.cos(u), 0, A * Math.sin(u)).addScaledVector(n, B);
      p.applyMatrix4(tilt); n.applyMatrix4(tilt);
      return { p, n, s: s0 * (1 + 0.5 * sstep(0.0, 1, p.clone().normalize().dot(loose))) };
    }, want);
    for (const nd of nodes) {
      const d = nd.p.clone().normalize().dot(loose), k = P.scatter * Math.pow(sstep(0.45, 1.0, d), 1.6);
      if (k > 0) { nd.p.addScaledVector(nd.n, k * rng.range(0.0, 0.5)).add(V(rng.gauss(), rng.gauss(), rng.gauss()).multiplyScalar(0.03 * k)); nd.free = k; }
    }
    R = A + B; extent = R + 0.2 * P.scatter; frameArgs = { width: 2 * (A + B) + 0.3 * P.scatter, height: 1.5 + 0.2 * P.scatter };
  } else if (P.motif === 'wave') {
    view = V(0.34 * flip, 0.5, 1).normalize(); lightDir = V(-0.5 * flip, 0.8, 0.3).normalize();
    const LX = 1.75, LZ = 1.0, ph = [rng() * TAU, rng() * TAU, rng() * TAU], k1 = rng.range(1.5, 1.9), k2 = rng.range(0.7, 1.1) * rng.sign();
    const hgt = (x, z) => 0.3 * Math.sin(k1 * x + k2 * z + ph[0]) + 0.13 * Math.sin(2.9 * x - 1.6 * z + ph[1]) + 0.07 * Math.sin(1.1 * x + 3.4 * z + ph[2]);
    const want = Math.round(620 * P.density), s0 = Math.sqrt((4 * LX * LZ) / want) * 0.9;
    throwDarts(() => {
      const x = rng.range(-LX, LX), z = rng.range(-LZ, LZ), e = 0.01, y = hgt(x, z);
      const n = V(-(hgt(x + e, z) - hgt(x - e, z)) / (2 * e), 1, -(hgt(x, z + e) - hgt(x, z - e)) / (2 * e)).normalize();
      const rim = Math.max(sstep(0.62, 1.0, Math.abs(x) / LX), sstep(0.5, 1.0, Math.abs(z) / LZ));          // the sheet thins out towards its edges
      if (rng() < rim * 0.55) return null;
      return { p: V(x, y, z), n, s: s0 * (1 + 0.8 * rim), free: rim > 0.75 ? (rim - 0.75) * 2 : 0 };
    }, want);
    for (const nd of nodes) if (nd.free) nd.p.y += rng.gauss() * 0.05 * nd.free * P.scatter;
    R = 1.6; extent = 1.9; frameArgs = { width: 3.25, height: 1.75 }; reach = 1.66;
  } else {
    // constellation: a shallow cloud of stars, large and small, joined later by a spanning tree
    view = V(0.0, 0.1, 1).normalize(); lightDir = V(-0.5 * flip, 0.6, 0.6).normalize();
    const want = Math.round(170 * P.density), lobes = [[0, 0, 0, 1.0], [0.62 * flip, 0.3, -0.2, 0.62], [-0.6 * flip, -0.28, 0.1, 0.56]];
    throwDarts(() => {
      const [cx, cy, cz, sc] = rng.pick(lobes), g = V(rng.gauss() * 0.5, rng.gauss() * 0.36, rng.gauss() * 0.34).multiplyScalar(sc);
      if (g.length() > 1.25 * sc) return null;
      const p = V(cx, cy, cz).add(g);
      return { p, n: p.clone().normalize(), s: 0.105 * (0.8 + 1.2 * rng()) / Math.sqrt(P.density) };
    }, want, 200);
    R = 1.25; extent = 1.3; frameArgs = { width: 2.9, height: 1.9 }; reach = 2.6; maxDeg = 3;
  }
  const N = nodes.length;

  // ------------------------------------------------------------------ camera, then everything that depends on where a node lands on the sheet
  const dist = ctx.frame({ fov: FOV, dir: [view.x, view.y, view.z], ...frameArgs });
  camera.updateMatrixWorld(); camera.updateProjectionMatrix();
  const quiet = (ctx.quiet || []).slice(0, 4);
  const quietAt = (u, v, edge = 0.06) => {
    let m = 0;
    for (const [x0, y0, x1, y1] of quiet) m = Math.max(m, sstep(x0 - edge, x0 + edge, u) * sstep(x1 + edge, x1 - edge, u) * sstep(y0 - edge, y0 + edge, v) * sstep(y1 + edge, y1 - edge, v));
    return m;
  };
  const camPos = camera.position.clone(), fwd = view.clone().negate(), tmp = V();
  for (const nd of nodes) {
    tmp.copy(nd.p).project(camera);
    nd.u = tmp.x * 0.5 + 0.5; nd.v = 0.5 - tmp.y * 0.5;
    const z = tmp.copy(nd.p).sub(camPos).dot(fwd);                      // distance along the view axis
    nd.near = 1 - clamp((z - (dist - extent)) / (2 * extent), 0, 1);     // 1 = nearest point of the form, 0 = farthest
    nd.lit = clamp(0.5 + 0.5 * nd.n.dot(lightDir), 0, 1);
    nd.facing = nd.n.dot(tmp.copy(camPos).sub(nd.p).normalize());        // > 0: this patch of surface faces the lens
    nd.q = 1 - 0.94 * quietAt(nd.u, nd.v);
    // visibility: depth first, light second. Far-side nodes of a closed form stay as a faint lining.
    const depth = P.motif === 'constellation' ? 0.3 + 0.7 * Math.pow(nd.near, 1.3) : P.motif === 'wave' ? 0.3 + 0.7 * nd.near : 0.2 + 0.8 * Math.pow(sstep(-0.25, 0.5, nd.facing) * (0.35 + 0.65 * nd.near), 1.15);
    nd.a = depth * (0.5 + 0.5 * nd.lit) * nd.q;
    nd.col = C(0).lerp(C(1), dark ? clamp(nd.lit * 0.75 + nd.near * 0.35 - 0.05, 0, 1) : clamp(nd.lit * 0.55 + nd.near * 0.7 - 0.1, 0, 1));
  }

  // ------------------------------------------------------------------ links
  const links = [], adj = nodes.map(() => new Set()), key = new Set();
  const link = (i, j, w = 1) => { const k = i < j ? i * N + j : j * N + i; if (i === j || key.has(k)) return; key.add(k); adj[i].add(j); adj[j].add(i); links.push([i, j, w]); };
  if (P.motif === 'constellation') {
    // minimum spanning tree (Prim) — every star is reached, nothing crosses twice, no tangle
    const inTree = new Uint8Array(N), best = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1);
    best[0] = 0;
    for (let it = 0; it < N; it++) {
      let u = -1; for (let i = 0; i < N; i++) if (!inTree[i] && (u < 0 || best[i] < best[u])) u = i;
      inTree[u] = 1; if (from[u] >= 0 && best[u] < 0.36 * 0.36) link(u, from[u]);
      for (let i = 0; i < N; i++) if (!inTree[i]) { const d = nodes[u].p.distanceToSquared(nodes[i].p); if (d < best[i]) { best[i] = d; from[i] = u; } }
    }
    // a few short extra links close small triangles here and there
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) { const m = 0.5 * (nodes[i].s + nodes[j].s) * 1.5; if (adj[i].size < maxDeg && adj[j].size < maxDeg && nodes[i].p.distanceToSquared(nodes[j].p) < m * m && rng() < 0.5) link(i, j); }
  } else {
    for (let i = 0; i < N; i++) {
      const cand = [];
      for (let j = 0; j < N; j++) { if (j === i) continue; const m = 0.5 * (nodes[i].s + nodes[j].s) * reach, d = nodes[i].p.distanceToSquared(nodes[j].p); if (d < m * m) cand.push([d / (m * m), j]); }
      cand.sort((a, b) => a[0] - b[0]);
      for (const [, j] of cand.slice(0, maxDeg)) link(i, j);
    }
  }
  const lenOf = ([i, j]) => nodes[i].p.distanceTo(nodes[j].p) / (0.5 * (nodes[i].s + nodes[j].s) * reach);     // 0 … 1 of the allowed reach

  // signals: short chains of links walked in a steady direction on the near side; they brighten towards their end
  const hot = C(2), signalEdge = new Map(), hubs = new Map();
  for (let s = 0, tries = 0; s < P.signals && tries < 400; tries++) {
    let cur = rng.int(0, N - 1); const st = nodes[cur];
    if (st.a < 0.45 || st.free || st.q < 0.9 || hubs.has(cur)) continue;
    const path = [cur]; let dir = null;
    const steps = P.motif === 'constellation' ? rng.int(3, 5) : rng.int(4, 7);
    for (let k = 0; k < steps; k++) {
      let bestJ = -1, bestS = -1e9;
      for (const j of adj[cur]) {
        if (path.includes(j) || nodes[j].free || nodes[j].a < 0.3) continue;
        const d = tmp.copy(nodes[j].p).sub(nodes[cur].p).normalize(), sc = (dir ? d.dot(dir) : rng()) + rng() * 0.25;
        if (sc > bestS) { bestS = sc; bestJ = j; }
      }
      if (bestJ < 0 || (dir && bestS < 0.2)) break;
      dir = nodes[bestJ].p.clone().sub(nodes[cur].p).normalize(); cur = bestJ; path.push(cur);
    }
    if (path.length < 4) continue;
    path.forEach((j, k) => { if (k) signalEdge.set(Math.min(j, path[k - 1]) * N + Math.max(j, path[k - 1]), [(k - 1) / (path.length - 1), k / (path.length - 1), path[k - 1] < j]); });
    hubs.set(cur, 1); hubs.set(path[0], 0.45); s++;
  }

  // ------------------------------------------------------------------ materials
  // the hairline follows the size of the form on the sheet (≈ 0.1 % of the short side for a form that fills the art area),
  // so a small subject in a crowded portrait keeps the same fine mesh instead of turning into beads on wire
  const ppu = (H / 2) / (dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  const px = clamp(ppu / (P.motif === 'wave' || P.motif === 'constellation' ? 250 : 285), unit * 0.045, unit * 0.14);
  const blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
  const common = { transparent: true, depthTest: false, depthWrite: false, blending, side: THREE.DoubleSide };
  const OUT = /* glsl */`gl_FragColor = vec4(col * mix(1.0, a, uDark), mix(a, 1.0, uDark));
        #include <colorspace_fragment>`;
  const base = () => ({ uDark: { value: dark ? 1 : 0 }, uRes: { value: new THREE.Vector2(W, H) } });
  const quadGeo = new THREE.PlaneGeometry(2, 2);
  const instanced = (attrs) => {
    const g = new THREE.InstancedBufferGeometry(); g.index = quadGeo.index; g.setAttribute('position', quadGeo.attributes.position);
    for (const [name, [arr, size]] of Object.entries(attrs)) g.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(arr), size));
    return g;
  };

  // ---- facets: triangles of three mutually linked nodes, a few of them, barely tinted
  if (P.facets > 0 && P.motif !== 'constellation') {
    const pos = [], col = [];
    for (let i = 0; i < N; i++) for (const j of adj[i]) { if (j <= i) continue; for (const k of adj[j]) {
      if (k <= j || !adj[i].has(k)) continue;
      const a = nodes[i], b = nodes[j], c = nodes[k];
      if (a.free || b.free || c.free || rng() > 0.3 * P.facets) continue;
      const al = Math.min(a.a, b.a, c.a) * (dark ? 0.16 : 0.1) * rng.range(0.35, 1);
      for (const nd of [a, b, c]) { pos.push(nd.p.x, nd.p.y, nd.p.z); col.push(nd.col.r, nd.col.g, nd.col.b, al); }
    } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('col', new THREE.Float32BufferAttribute(col, 4));
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ ...common, uniforms: base(),
      vertexShader: 'attribute vec4 col; varying vec4 vC; void main(){ vC = col; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uDark; varying vec4 vC; void main(){ vec3 col = vC.rgb; float a = vC.a; ${OUT} }` }));
    m.frustumCulled = false; scene.add(m);
  }

  // ---- links: one screen-facing quad per segment, width in px, soft edges, colour and alpha per end
  {
    const A = [], B = [], cA = [], cB = [], wd = [];
    const push = (i, j, ai, aj, ci, cj, w) => { const a = nodes[i], b = nodes[j]; A.push(a.p.x, a.p.y, a.p.z); B.push(b.p.x, b.p.y, b.p.z); cA.push(ci.r, ci.g, ci.b, ai); cB.push(cj.r, cj.g, cj.b, aj); wd.push(w); };
    for (const l of links) {
      const [i, j] = l, a = nodes[i], b = nodes[j], t = lenOf(l);
      const fall = P.motif === 'constellation' ? 0.9 : 1 - Math.pow(t, 2.2) * 0.85;      // long links are fainter: the mesh breathes
      const k = (dark ? 0.62 : 1.25) * fall, w = px * P.line * (0.75 + 0.5 * Math.min(a.near, b.near)) * (dark ? 1 : 1.25);
      push(i, j, Math.min(1, a.a * k), Math.min(1, b.a * k), a.col, b.col, w);
    }
    for (const [k, [t0, t1, fwdDir]] of signalEdge) {
      const i = Math.floor(k / N), j = k % N, [s, e] = fwdDir ? [i, j] : [j, i];
      const al = (t) => 0.12 + 0.88 * t * t;
      push(s, e, al(t0) * nodes[s].q, al(t1) * nodes[e].q, nodes[s].col.clone().lerp(hot, 0.35 + 0.65 * t0), nodes[e].col.clone().lerp(hot, 0.35 + 0.65 * t1), px * P.line * 1.9);
    }
    const g = instanced({ iA: [A, 3], iB: [B, 3], iCa: [cA, 4], iCb: [cB, 4], iW: [wd, 1] });
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ ...common, uniforms: base(),
      vertexShader: /* glsl */`
        attribute vec3 iA, iB; attribute vec4 iCa, iCb; attribute float iW; uniform vec2 uRes; varying vec4 vC; varying float vS, vHalf;
        void main(){
          mat4 pv = projectionMatrix * viewMatrix; vec4 a = pv * vec4(iA, 1.0), b = pv * vec4(iB, 1.0);
          vec2 d = (b.xy / b.w - a.xy / a.w) * uRes; float len = max(length(d), 1e-4); vec2 nrm = vec2(-d.y, d.x) / len;
          float t = position.x * 0.5 + 0.5, hw = iW * 0.5 + 0.9; vec4 c = mix(a, b, t);
          gl_Position = vec4(c.xy + nrm * position.y * hw * 2.0 / uRes * c.w, c.zw);
          vC = mix(iCa, iCb, t); vS = position.y * hw; vHalf = iW * 0.5;
          vC.a *= min(1.0, iW);                                            // thinner than a pixel: fade rather than flicker
        }`,
      fragmentShader: /* glsl */`uniform float uDark; varying vec4 vC; varying float vS, vHalf;
        void main(){ float a = (1.0 - smoothstep(max(vHalf, 0.5) - 0.7, max(vHalf, 0.5) + 0.7, abs(vS))) * vC.a; if (a < 0.003) discard; vec3 col = vC.rgb; ${OUT} }` }));
    m.frustumCulled = false; scene.add(m);
  }

  // ---- nodes: core, soft halo and, on hubs, a hairline ring
  {
    const ctr = [], ncol = [], prm = [];
    nodes.forEach((nd, i) => {
      const deg = adj[i].size, hub = hubs.get(i) ?? 0, big = P.motif === 'constellation' ? Math.pow(rng(), 3) : deg >= 7 ? 0.6 : 0;
      let r = px * (1.25 + 1.5 * nd.near + 1.6 * big) * (nd.free ? 0.8 : 1) * (dark ? 1 : 1.3), a = clamp(nd.a * (dark ? 1.5 : 2.1) + 0.08 * nd.q, 0, 1), c = nd.col.clone(), halo = 0, ring = 0;
      if (dark) c.lerp(new THREE.Color('#ffffff'), 0.25 * nd.near);
      if (hub) { r = px * (hub === 1 ? 3.7 : 2.7); a = nd.q; c = hot.clone(); halo = r * (hub === 1 ? 6 : 4.2); ring = hub === 1 ? r * 3.3 : 0; }
      else if (big > 0.35) halo = r * 3.6;
      ctr.push(nd.p.x, nd.p.y, nd.p.z); ncol.push(c.r, c.g, c.b); prm.push(r, halo, ring, a);
    });
    const g = instanced({ center: [ctr, 3], ncol: [ncol, 3], prm: [prm, 4] });
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ ...common, uniforms: { ...base(), uHair: { value: Math.max(0.9, px * 0.9) } },
      vertexShader: /* glsl */`
        attribute vec3 center, ncol; attribute vec4 prm; uniform vec2 uRes; varying vec3 vCol; varying vec4 vPrm; varying vec2 vP;
        void main(){
          vec4 c = projectionMatrix * viewMatrix * vec4(center, 1.0); float ext = max(prm.x, max(prm.y, prm.z + 2.0)) + 2.0;
          gl_Position = vec4(c.xy + position.xy * ext * 2.0 / uRes * c.w, c.zw); vCol = ncol; vPrm = prm; vP = position.xy * ext;
        }`,
      fragmentShader: /* glsl */`
        uniform float uDark, uHair; varying vec3 vCol; varying vec4 vPrm; varying vec2 vP;
        void main(){
          float d = length(vP), core = 1.0 - smoothstep(vPrm.x - 0.7, vPrm.x + 0.7, d);
          float halo = vPrm.y > 0.0 ? exp(-d * d / (vPrm.y * vPrm.y * 0.16)) * (1.0 - smoothstep(vPrm.y * 0.8, vPrm.y, d)) : 0.0;
          float ring = vPrm.z > 0.0 ? 1.0 - smoothstep(uHair * 0.5 - 0.7, uHair * 0.5 + 0.7, abs(d - vPrm.z)) : 0.0;
          float a = max(core, max(halo * mix(0.16, 0.42, uDark), ring * 0.7)) * vPrm.w; if (a < 0.003) discard;
          vec3 col = mix(vCol, vec3(1.0), (1.0 - smoothstep(0.0, vPrm.x * 0.8, d)) * uDark * step(0.5, vPrm.y) * 0.65);
          ${OUT}
        }` }));
    m.frustumCulled = false; scene.add(m);
  }

  // ------------------------------------------------------------------ backdrop: a faint pool of colour behind the form
  scene.add(backgroundQuad(/* glsl */`
    varying vec2 vUv; uniform vec3 bg, c0, c1; uniform vec2 focus, lit; uniform float aspect, size, uDark, glow;
    ${GLSL_QUIET}
    void main(){
      vec2 p = vec2(vUv.x, 1.0 - vUv.y);
      vec2 q = (p - focus) * vec2(max(aspect, 1.0), max(1.0 / aspect, 1.0)) / size;
      float g = exp(-dot(q, q) / 0.22) * 0.6 + exp(-dot(q - lit, q - lit) / 0.09) * 0.4;
      g *= glow * (1.0 - 0.9 * quietMask(p, 0.12));
      vec3 tint = mix(c0, c1, 0.4);
      vec3 col = mix(mix(bg, tint, g * 0.1), bg + tint * g * 0.09, uDark);
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }`, {
    bg: { value: bgc }, c0: { value: C(0) }, c1: { value: C(1) }, focus: { value: new THREE.Vector2(focus.x, focus.y) },
    lit: { value: new THREE.Vector2(lightDir.x * 0.2, -lightDir.y * 0.2) }, aspect: { value: aspect }, size: { value: artSize },
    uDark: { value: dark ? 1 : 0 }, glow: { value: P.glow }, ...quietUniforms(ctx),
  }));

  return makeComposer(ctx, {
    samples: 4, bloom: dark && P.glow > 0 ? { strength: 0.42 * P.glow, radius: 0.55, threshold: 0.12 } : false,
    display: [finishPassShader(ctx, { vignette: dark ? 0.22 : 0.06, center: ctx.focus })],
  });
}
