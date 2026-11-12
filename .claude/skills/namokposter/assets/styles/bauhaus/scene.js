// Bauhaus Mosaic — a tidy grid of square tiles, each holding one flat primitive.
// No lighting and no perspective: every tile is a quad in the z = 0 plane whose fragment shader
// evaluates a signed-distance shape with analytic anti-aliasing, and the grid is snapped to whole
// pixels after framing, so tile edges are razor sharp at any output size.

const T = { solid: 0, circle: 1, half: 2, quarter: 3, triangle: 4, stripes: 5, rings: 6, dots: 7, plus: 8, arch: 9, leaf: 10, diamond: 11 };

export default function build(ctx) {
  const { THREE, scene, camera, rng, palette, params, width: W, height: H } = ctx;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // The block is a square inscribed in the art circle; frame first, then measure what one world unit is in pixels.
  ctx.frame({ radius: 1, fov: 20, dir: [0, 0, 1] });
  camera.updateMatrixWorld();
  const o = new THREE.Vector3(0, 0, 0).project(camera), e = new THREE.Vector3(1, 0, 0).project(camera);
  const ppu = (e.x - o.x) * 0.5 * W, ox = (o.x * 0.5 + 0.5) * W, oy = (0.5 - o.y * 0.5) * H;   // px per unit, origin in px (y down)

  const N = clamp(Math.round(params.grid ?? 5), 3, 8);
  const pitch = Math.max(6, Math.round((0.92 * 2 * ppu) / N));            // whole pixels per tile
  const gap = Math.round(pitch * clamp(params.gap ?? 0, 0, 0.3));
  const block = N * pitch - gap;
  const left = Math.round(ox - block / 2), top = Math.round(oy - block / 2);

  // ---- colours: paper (bg) + the palette colours + ink
  const srgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const dist = (a, b) => Math.hypot(a.s[0] - b.s[0], a.s[1] - b.s[1], a.s[2] - b.s[2]);
  const mk = (hex) => ({ hex, s: srgb(hex), c: new THREE.Color(hex), used: 0 });
  const paper = mk(palette.bg);
  const strong = [];
  for (const hex of [...palette.colors, palette.ink]) {
    const c = mk(hex); c.ink = hex === palette.ink;
    if (dist(c, paper) > 0.1 && strong.every((s) => dist(s, c) > 0.08)) strong.push(c);
  }
  if (!strong.length) strong.push(mk(palette.accent));
  const all = [paper, ...strong];
  const fair = (c, k) => (c === paper ? 1 : 1 / (1 + (c.used - Math.min(...strong.map((s) => s.used))) * k));   // even out colour use
  const air = clamp(params.air ?? 0.42, 0, 0.9);                                                               // share of tiles on a paper ground
  const weighted = (items, w) => { let s = 0; const ws = items.map((it) => (s += Math.max(0, w(it)))); if (s <= 0) return items[0]; const r = rng() * s; return items[ws.findIndex((v) => r < v)] ?? items[items.length - 1]; };

  // ---- layout of the grid: a few 2×2 tiles, a few empty cells, single tiles everywhere else
  const cell = Array.from({ length: N }, () => new Array(N).fill(null));   // cell[row][col]
  const tiles = [];
  const merges = clamp(Math.round(params.merge ?? (N * N) / 12), 0, Math.floor((N * N) / 8));
  for (let m = 0, tries = 0; m < merges && tries < 200; tries++) {
    const r = rng.int(0, N - 2), c = rng.int(0, N - 2);
    let free = true;   // keep big tiles from touching each other so they read as separate accents
    for (let y = r - 1; y <= r + 2; y++) for (let x = c - 1; x <= c + 2; x++) if (y >= 0 && x >= 0 && y < N && x < N && cell[y][x]) free = false;
    if (!free) continue;
    const t = { r, c, span: 2 }; tiles.push(t); m++;
    for (let y = r; y < r + 2; y++) for (let x = c; x < c + 2; x++) cell[y][x] = t;
  }
  const singles = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!cell[r][c]) singles.push([r, c]);
  const empties = Math.round(clamp(params.empty ?? 0.12, 0, 0.5) * singles.length);
  const EMPTY = { empty: true };
  for (let k = 0, tries = 0; k < empties && tries < 300; tries++) {
    const [r, c] = rng.pick(singles);
    const corner = (r === 0 || r === N - 1) && (c === 0 || c === N - 1);
    const near = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].some(([y, x]) => cell[y]?.[x] === EMPTY);
    if (cell[r][c] || corner || near) continue;
    cell[r][c] = EMPTY; k++;
  }
  for (const [r, c] of singles) if (!cell[r][c]) { const t = { r, c, span: 1 }; tiles.push(t); cell[r][c] = t; }
  tiles.sort((a, b) => a.r - b.r || a.c - b.c);

  // ---- what goes in each tile
  const deck = [];
  const refill = () => deck.push(...rng.shuffle(['circle', 'circle', 'circle', 'half', 'half', 'half', 'quarter', 'quarter', 'quarter', 'triangle', 'triangle',
    'stripes', 'stripes', 'rings', 'rings', 'dots', 'dots', 'plus', 'plus', 'arch', 'arch', 'leaf', 'diamond', 'solid']));
  const neighbours = (t) => {
    const out = new Set();
    for (let k = 0; k < t.span; k++) for (const [y, x] of [[t.r - 1, t.c + k], [t.r + t.span, t.c + k], [t.r + k, t.c - 1], [t.r + k, t.c + t.span]]) { const n = cell[y]?.[x]; if (n && n !== EMPTY && n.type) out.add(n); }
    return [...out];
  };
  for (const t of tiles) {
    const near = neighbours(t), big = t.span > 1;
    // shape: big tiles take the shapes that stay elegant when large; singles draw from a shuffled deck, never repeating a neighbour
    if (big) t.type = weighted(['circle', 'quarter', 'rings', 'arch', 'half'], (k) => (near.some((n) => n.type === k) ? 0.15 : 1));
    else {
      if (deck.length < 6) refill();
      let i = deck.findIndex((k) => !near.some((n) => n.type === k)); if (i < 0) i = 0;
      t.type = deck.splice(i, 1)[0];
    }
    // ground: paper often (air), otherwise a colour no neighbour uses as its ground
    const paperP = t.type === 'solid' ? 0 : big ? air * 0.7 : air;
    t.g = rng() < paperP ? paper : weighted(strong, (c) => (c.ink ? 0.55 : 1) * (near.some((n) => n.g === c) ? 0.08 : 1) * fair(c, 0.5));
    // figure: must separate clearly from the ground; favour colours that have been used least
    const figs = all.filter((c) => c !== t.g && dist(c, t.g) > 0.3);
    t.f = weighted(figs.length ? figs : all.filter((c) => c !== t.g), (c) => (c === paper ? Math.min(0.8, air * 1.9) : c.ink ? 0.7 : 1) * fair(c, 0.6));   // paper cut-outs follow `air` too
    const thirds = all.filter((c) => c !== t.g && c !== t.f && dist(c, t.f) > 0.25 && dist(c, t.g) > 0.2);
    t.h = thirds.length ? weighted(thirds, (c) => (c === paper ? Math.min(0.6, air * 1.4) : 1) * fair(c, 0.4)) : t.g;
    t.g.used += t.span * t.span * 0.6; t.f.used += t.span * t.span;
    t.rot = rng.int(0, 3);
    const P = (t.prm = [0, 0, 0, 0]);
    switch (t.type) {
      case 'circle': P[0] = big || rng() < 0.62 ? 0.5 : 0.34; P[1] = big ? 0.22 : P[0] === 0.5 && rng() < 0.4 ? 0.2 : 0; break;
      case 'half': P[0] = rng() < (big ? 0.7 : 0.3) ? 1 : 0; break;                       // second half-disc on the opposite edge
      case 'quarter': P[0] = big ? 0.5 : rng() < 0.45 ? 0.5 : 0; break;                    // inner quarter in the third colour
      case 'triangle': P[0] = rng() < 0.6 ? 0 : 1; break;                                  // diagonal half / isosceles
      case 'stripes': P[1] = rng() < 0.25 ? 1 : 0; P[0] = P[1] ? 4 : rng.pick([3, 4]); break;
      case 'rings': P[1] = rng() < 0.5 ? 1 : 0; P[0] = big ? 6 : 4; if (rng() < 0.6) t.h = t.g; break;   // centred bullseye / quarter rainbow
      case 'dots': P[0] = rng.pick([3, 4]); P[1] = 0.29; break;
      case 'plus': P[0] = rng() < 0.3 ? 1 : 0; break;                                      // + or ×
      case 'arch': P[0] = big ? 3 : rng.pick([1, 2, 2, 3]); break;                         // nested arches
      default: break;
    }
    if (t.type === 'solid') { t.f = t.g; t.h = t.g; }
    // a red disc on white reads as a flag, however small: turn such a tile inside out, and never put a red dot in a white disc
    if (t.type === 'circle') {
      const whitish = (c) => Math.min(...c.s) > 0.78, reddish = (c) => c.s[0] > 0.6 && c.s[0] - Math.max(c.s[1], c.s[2]) > 0.3;
      if (whitish(t.g) && reddish(t.f)) [t.g, t.f] = [t.f, t.g];
      if (P[1] > 0 && whitish(t.f) && reddish(t.h)) { if (reddish(t.g)) P[1] = 0; else t.h = t.g; }
    }
  }

  // ---- quiet zones: a tile that sits under type is printed tone-on-tone instead of in full colour
  const quiet = ctx.quiet || [];
  const hush = 0.88;                                                                // how far a quiet tile is pulled towards the paper colour
  const mute = (t) => {
    const s = t.span * pitch - gap, x0 = left + t.c * pitch, y0 = top + t.r * pitch;
    let worst = 0;
    quiet.forEach(([qx0, qy0, qx1, qy1], i) => {
      const pad = i === 0 ? 0.02 : 0;   // the copy rectangle arrives padded; a tile that merely grazes the padding stays loud
      const w = Math.min(x0 + s, (qx1 - pad) * W) - Math.max(x0, (qx0 + pad) * W), h = Math.min(y0 + s, (qy1 - pad) * H) - Math.max(y0, (qy0 + pad) * H);
      if (w > 0 && h > 0) worst = Math.max(worst, (w * h) / (s * s));
    });
    return worst > 0.1 ? hush : 0;
  };

  // ---- geometry: one quad per tile, everything the shader needs as vertex attributes
  const n = tiles.length;
  const pos = new Float32Array(n * 12), loc = new Float32Array(n * 8), typ = new Float32Array(n * 4), prm = new Float32Array(n * 16);
  const c0 = new Float32Array(n * 12), c1 = new Float32Array(n * 12), c2 = new Float32Array(n * 12), size = new Float32Array(n * 4), idx = [];
  const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]], tmp = new THREE.Color();
  tiles.forEach((t, i) => {
    const s = t.span * pitch - gap, x0 = left + t.c * pitch, y0 = top + t.r * pitch;
    const m = mute(t), cs = Math.cos((t.rot * Math.PI) / 2), sn = Math.sin((t.rot * Math.PI) / 2);
    corners.forEach(([u, v], k) => {
      const j = i * 4 + k;
      pos.set([(x0 + (u + 0.5) * s - ox) / ppu, -(y0 + (0.5 - v) * s - oy) / ppu, 0], j * 3);
      loc.set([Math.round(u * cs - v * sn + 0.5) - 0.5, Math.round(u * sn + v * cs + 0.5) - 0.5], j * 2);
      typ[j] = T[t.type]; prm.set(t.prm, j * 4); size[j] = s;
      [[c0, t.g], [c1, t.f], [c2, t.h]].forEach(([arr, col]) => { tmp.copy(col.c).lerp(paper.c, m); arr.set([tmp.r, tmp.g, tmp.b], j * 3); });
    });
    idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aLoc', new THREE.BufferAttribute(loc, 2));
  geo.setAttribute('aType', new THREE.BufferAttribute(typ, 1)); geo.setAttribute('aPrm', new THREE.BufferAttribute(prm, 4));
  geo.setAttribute('aC0', new THREE.BufferAttribute(c0, 3)); geo.setAttribute('aC1', new THREE.BufferAttribute(c1, 3)); geo.setAttribute('aC2', new THREE.BufferAttribute(c2, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1)); geo.setIndex(idx);

  const mat = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    vertexShader: /* glsl */`
      attribute vec2 aLoc; attribute float aType, aSize; attribute vec4 aPrm; attribute vec3 aC0, aC1, aC2;
      varying vec2 vP; varying float vType, vSize; varying vec4 vPrm; varying vec3 vC0, vC1, vC2;
      void main(){ vP = aLoc; vType = aType; vSize = aSize; vPrm = aPrm; vC0 = aC0; vC1 = aC1; vC2 = aC2; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      varying vec2 vP; varying float vType, vSize; varying vec4 vPrm; varying vec3 vC0, vC1, vC2;
      // d = signed distance in tile units (negative inside) → pixel coverage with a one-pixel ramp
      float cov(float d){ return clamp(0.5 - d * vSize, 0.0, 1.0); }
      float box(vec2 p, vec2 b){ vec2 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0); }
      float band(float t){ return abs(fract(t + 0.25) - 0.5) - 0.25; }   // periodic: < 0 on the first half of every unit of t
      void main(){
        vec2 p = vP; vec3 col = vC0; int ty = int(vType + 0.5);
        if (ty == 1) {                                   // circle (+ optional centre dot)
          col = mix(col, vC1, cov(length(p) - vPrm.x));
          if (vPrm.y > 0.0) col = mix(col, vC2, cov(length(p) - vPrm.y));
        } else if (ty == 2) {                            // half-disc on an edge (+ optional second one opposite)
          col = mix(col, vC1, cov(length(p - vec2(0.0, -0.5)) - 0.5));
          if (vPrm.x > 0.5) col = mix(col, vC2, cov(length(p - vec2(0.0, 0.5)) - 0.5));
        } else if (ty == 3) {                            // quarter-disc from a corner (+ optional inner quarter)
          float r = length(p + 0.5);
          col = mix(col, vC1, cov(r - 1.0));
          if (vPrm.x > 0.0) col = mix(col, vC2, cov(r - vPrm.x));
        } else if (ty == 4) {                            // triangle: diagonal half, or isosceles
          float d = vPrm.x < 0.5 ? (p.x + p.y) * 0.70710678 : dot(vec2(abs(p.x), p.y) - vec2(0.0, 0.5), vec2(0.89442719, 0.4472136));
          col = mix(col, vC1, cov(d));
        } else if (ty == 5) {                            // stripes: straight or diagonal
          float d = vPrm.y < 0.5 ? band((p.y + 0.5) * vPrm.x) / vPrm.x : band((p.x + p.y + 1.0) * 0.5 * vPrm.x) / (vPrm.x * 0.70710678);
          col = mix(col, vC1, cov(d));
        } else if (ty == 6) {                            // concentric rings: bullseye, or a quarter rainbow from a corner
          float R = vPrm.y < 0.5 ? 0.5 : 1.0, r = length(vPrm.y < 0.5 ? p : p + 0.5), u = (R - r) / R * vPrm.x;
          vec3 ring = mix(vC2, vC1, cov(band(u * 0.5) * 2.0 * R / vPrm.x));
          col = mix(col, ring, cov(r - R));
        } else if (ty == 7) {                            // dot grid
          vec2 q = fract((p + 0.5) * vPrm.x) - 0.5;
          col = mix(col, vC1, cov((length(q) - vPrm.y) / vPrm.x));
        } else if (ty == 8) {                            // plus / cross
          vec2 q = vPrm.x < 0.5 ? p : vec2(p.x + p.y, p.y - p.x) * 0.70710678;
          col = mix(col, vC1, cov(min(box(q, vec2(0.36, 0.115)), box(q, vec2(0.115, 0.36)))));
        } else if (ty == 9) {                            // arch (nested)
          for (int i = 0; i < 3; i++) {
            if (float(i) >= vPrm.x) break;
            float s = 1.0 - float(i) / vPrm.x;
            float d = min(length(p) - 0.5 * s, box(p - vec2(0.0, -0.25), vec2(0.5 * s, 0.25)));
            col = mix(col, i == 1 ? vC2 : (i == 2 && vPrm.x > 2.5 ? vC0 : vC1), cov(d));
          }
        } else if (ty == 10) {                           // leaf: where two opposite quarter-discs overlap
          col = mix(col, vC1, cov(max(length(p + 0.5) - 1.0, length(p - 0.5) - 1.0)));
        } else if (ty == 11) {                           // diamond
          col = mix(col, vC1, cov((abs(p.x) + abs(p.y) - 0.5) * 0.70710678));
        }
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false;
  scene.add(mesh);
}
