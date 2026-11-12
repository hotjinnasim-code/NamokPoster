// Dotted Globe — a sphere of evenly spaced dots (Fibonacci lattice) with the far side showing through
// faintly, great-circle links between glowing nodes, thin orbit rings and a soft rim of light.
// Additive glow on dark palettes, plain ink (normal blending) on light ones.
// Palette roles: colors[0] → colors[1] shade the dots from night side to day side, colors[2] is the hot
// colour of nodes and links, colors[3] (if given) tints the first satellite.
// params: density, dot, nodes, rings, land, glow — see style.json.
import { makeNoise, backgroundQuad, quietUniforms, GLSL_QUIET } from '/skill/assets/web/scene-lib.js';

const TAU = Math.PI * 2;

export default function build(ctx) {
  const { THREE, scene, rng, palette, params, unit, width: W, height: H, aspect, focus, artSize, seed } = ctx;
  const cols = palette.colors?.length ? palette.colors : [palette.accent];
  const C = (i) => new THREE.Color(cols[i % cols.length]);
  const bgc = new THREE.Color(palette.bg), dark = bgc.getHSL({}).l < 0.35;
  const P = { density: params.density ?? 1, dot: params.dot ?? 1, nodes: Math.round(params.nodes ?? 7), rings: Math.round(params.rings ?? 2), land: params.land ?? 0.6, glow: params.glow ?? 1 };
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

  // The orbit rings reach 1.42 globe radii, so that is the honest size of the subject. Laid over centred copy
  // the globe is a backdrop instead: it is framed tighter and the rings may run off the frame.
  const RING = [1.24, 1.42], FRAME = ctx.layout?.layout === 'center' ? 1.12 : 1.5, FOV = 26;
  const view = V(0, 0.2, 1).normalize();                               // towards the camera
  const flip = focus.x < 0.45 ? -1 : 1;                                // light comes from the side the copy is on
  const light = V(-0.74 * flip, 0.56, 0.3).normalize();
  const px = (unit * 100 * artSize) / (2 * FRAME) / 300;               // 1 "px" when the globe is 300 px in radius → everything scales with it
  const blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
  const common = { transparent: true, depthTest: false, depthWrite: false, blending, side: THREE.DoubleSide };
  const OUT = /* glsl */`gl_FragColor = vec4(col * mix(1.0, a, uDark), mix(a, 1.0, uDark));
        #include <colorspace_fragment>`;
  const base = () => ({ uDark: { value: dark ? 1 : 0 }, uRes: { value: new THREE.Vector2(W, H) }, ...quietUniforms(ctx) });
  // 1 where a world point is hidden behind the unit sphere (soft at the limb), 0 where it is in front or outside
  const GLSL_BEHIND = /* glsl */`
    float behind(vec3 p){ vec3 d = p - cameraPosition; float len = length(d); d /= len; float b = dot(cameraPosition, d);
      float m = sqrt(max(dot(cameraPosition, cameraPosition) - b * b, 0.0));
      return step(-b, len) * (1.0 - smoothstep(0.95, 1.0, m)); }`;

  // ------------------------------------------------------------------ backdrop: a wide, faint pool of colour behind the globe
  scene.add(backgroundQuad(/* glsl */`
    varying vec2 vUv; uniform vec3 bg, c0, c1; uniform vec2 focus, lit; uniform float aspect, size, uDark, glow;
    ${GLSL_QUIET}
    vec3 hash3(vec2 p){ vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yxz + 33.33); return fract((q.xxy + q.yzz) * q.zyx); }
    void main(){
      vec2 p = vec2(vUv.x, 1.0 - vUv.y);
      vec2 q = (p - focus) * vec2(max(aspect, 1.0), max(1.0 / aspect, 1.0)) / size;   // 1.0 = diameter of the framed subject
      float g = exp(-dot(q, q) / 0.2) * 0.7 + exp(-dot(q - lit, q - lit) / 0.07) * 0.5;
      g *= glow * (1.0 - 0.92 * quietMask(p, 0.12));
      vec3 tint = mix(c0, c1, 0.35);
      vec3 col = mix(mix(bg, tint, g * 0.12), bg + tint * g * 0.1, uDark);
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
      gl_FragColor.rgb += (hash3(gl_FragCoord.xy) + hash3(gl_FragCoord.xy + 59.3) - 1.0) / 255.0;   // ±1 LSB dither against banding
    }`, {
    bg: { value: bgc }, c0: { value: C(0) }, c1: { value: C(1) }, focus: { value: new THREE.Vector2(focus.x, focus.y) },
    lit: { value: new THREE.Vector2(light.x * 0.22, -light.y * 0.22) }, aspect: { value: aspect }, size: { value: artSize },
    uDark: { value: dark ? 1 : 0 }, glow: { value: P.glow }, ...quietUniforms(ctx),
  }));

  // ------------------------------------------------------------------ rim: light gathers at the limb, strongest on the lit side
  const rim = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.ShaderMaterial({
    ...common, uniforms: { ...base(), cA: { value: C(0) }, cB: { value: C(1) }, uLight: { value: light }, uGlow: { value: P.glow } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: /* glsl */`
      uniform vec3 cA, cB, uLight; uniform float uDark, uGlow; uniform vec2 uRes; varying vec3 vW;
      ${GLSL_QUIET}
      void main(){
        vec3 d = normalize(vW - cameraPosition); float b = dot(cameraPosition, d);
        vec3 cp = cameraPosition - b * d; float m = length(cp);                 // how close this line of sight passes to the centre (1 = limb)
        float lam = dot(cp / max(m, 1e-4), uLight) * 0.5 + 0.5;
        float inner = pow(min(m, 1.0), 14.0), outer = exp(-max(m - 1.0, 0.0) / 0.05);
        float body = (1.0 - smoothstep(0.985, 1.0, m)) * 0.035;                     // a breath of fill so the far side sits "inside" something
        float g = (m < 1.0 ? inner * 0.42 + body : outer * 0.42) * mix(0.1, 1.0, smoothstep(0.25, 0.95, lam));
        g *= (1.0 - smoothstep(1.3, 1.68, m)) * uGlow * (1.0 - 0.9 * quietMask(vec2(gl_FragCoord.x / uRes.x, 1.0 - gl_FragCoord.y / uRes.y), 0.08));
        vec3 col = mix(cA, cB, smoothstep(0.35, 0.95, lam)); float a = g * mix(0.16, 1.0, uDark);
        ${OUT}
      }`,
  }));
  scene.add(rim);

  // ------------------------------------------------------------------ dots
  const n = Math.round(11000 * P.density), noise = makeNoise(seed * 3 + 17), golden = Math.PI * (3 - Math.sqrt(5));
  const spin = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rng.range(0.25, 0.6), rng() * TAU, rng.range(-0.4, 0.4)));
  const dpos = new Float32Array(n * 3), dland = new Float32Array(n), lattice = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), a = i * golden;
    const p = V(Math.cos(a) * r, y, Math.sin(a) * r).applyMatrix4(spin); lattice.push(p);
    dpos.set([p.x, p.y, p.z], i * 3);
    const f = noise.fbm(p.x * 1.35 + 3.1, p.y * 1.35 - 1.7, p.z * 1.35 + 0.4, 4, 2.1, 0.5);
    dland[i] = THREE.MathUtils.smoothstep(f, -0.04, 0.07);                        // soft "continents": only size and weight change, never the spacing
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(dpos, 3)); dg.setAttribute('land', new THREE.BufferAttribute(dland, 1));
  const spacing = Math.sqrt((4 * Math.PI) / n) * 300 * px;                        // px between neighbouring dots at the centre of the disc
  const dots = new THREE.Points(dg, new THREE.ShaderMaterial({
    ...common, uniforms: { ...base(), cA: { value: C(0) }, cB: { value: C(1) }, uLight: { value: light }, uSize: { value: spacing * (dark ? 0.38 : 0.54) * P.dot }, uDist: { value: 1 }, uLand: { value: P.land } },
    vertexShader: /* glsl */`
      attribute float land; uniform float uSize, uDist, uLand, uDark; uniform vec3 cA, cB, uLight; varying vec3 vCol; varying float vA, vS;
      ${GLSL_QUIET}
      void main(){
        vec4 mv = viewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        float face = dot(position, normalize(cameraPosition - position));        // > 0: near side
        float front = smoothstep(-0.08, 0.1, face);
        float lit = smoothstep(-0.45, 0.75, dot(position, uLight)), w = mix(1.0, land, uLand);   // day side; "land" weight
        vec2 uv = gl_Position.xy / gl_Position.w * 0.5 + 0.5; uv.y = 1.0 - uv.y;
        float s = uSize * (uDist / -mv.z) * mix(mix(0.66, 0.52, uDark), 1.0, w) * mix(0.7, 1.0, front) * mix(0.6, 1.0, smoothstep(0.0, 0.4, abs(face)));
        float far = mix(0.17, 0.05, smoothstep(0.0, 1.0, -face)) * mix(1.0, 0.75, uDark);   // far side: fainter the deeper it is
        vA = mix(far, mix(mix(0.66, 0.5, uDark), 1.0, w) * mix(mix(0.8, 0.14, uDark), 1.0, lit), front);
        vA *= 1.0 - 0.92 * quietMask(uv, 0.07);                                    // dissolve under type
        vCol = mix(cA, cB, lit * lit);
        // keep each dot's light the same at any resolution: sub-pixel dots fade instead of flickering, and the
        // soft edge (which adds area to a small disc) is paid for in opacity
        vS = max(s, 1.0); float rr = 0.25 * vS * vS; vA *= min(1.0, s * s) * rr / (rr + 0.14);
        gl_PointSize = vS + 1.5;
      }`,
    fragmentShader: /* glsl */`
      uniform float uDark; varying vec3 vCol; varying float vA, vS;
      void main(){
        float d = length(gl_PointCoord - 0.5) * (vS + 1.5);                         // px from the dot centre
        float a = (1.0 - smoothstep(vS * 0.5 - 0.65, vS * 0.5 + 0.65, d)) * vA;
        if (a < 0.004) discard;
        vec3 col = vCol;
        ${OUT}
      }`,
  }));
  scene.add(dots);

  // ------------------------------------------------------------------ line strips with soft edges (width in px, colour + alpha per point)
  const lineMat = (dash = 0) => new THREE.ShaderMaterial({
    ...common, uniforms: { ...base(), uFar: { value: dark ? 0.2 : 0.16 }, uDash: { value: dash } },
    vertexShader: /* glsl */`
      attribute vec3 prev, next, col; attribute float side, alpha, lw, along; uniform vec2 uRes; uniform float uFar;
      varying vec3 vCol; varying float vA, vS, vHalf, vLen;
      ${GLSL_QUIET}
      ${GLSL_BEHIND}
      void main(){
        mat4 pv = projectionMatrix * viewMatrix;
        vec4 c = pv * vec4(position, 1.0), a = pv * vec4(prev, 1.0), b = pv * vec4(next, 1.0);
        vec2 dir = normalize((b.xy / b.w - a.xy / a.w) * uRes), nrm = vec2(-dir.y, dir.x);
        float hw = lw * 0.5 + 0.9;
        gl_Position = vec4(c.xy + nrm * side * hw * 2.0 / uRes * c.w, c.zw);
        vec2 uv = c.xy / c.w * 0.5 + 0.5; uv.y = 1.0 - uv.y;
        vA = alpha * mix(1.0, uFar, behind(position)) * (1.0 - 0.92 * quietMask(uv, 0.07));
        vCol = col; vS = side * hw; vHalf = lw * 0.5; vLen = along;
      }`,
    fragmentShader: /* glsl */`
      uniform float uDark, uDash; varying vec3 vCol; varying float vA, vS, vHalf, vLen;
      void main(){
        float a = (1.0 - smoothstep(vHalf - 0.75, vHalf + 0.75, abs(vS))) * vA;
        if (uDash > 0.0) { float t = abs(fract(vLen * uDash) - 0.5) * 2.0; a *= smoothstep(0.45, 0.62, t); }
        if (a < 0.003) discard;
        vec3 col = vCol;
        ${OUT}
      }`,
  });
  /** pts: Vector3[]; style(t) → { color, alpha, width } for t in 0..1 along the strip */
  function strip(pts, style, mat) {
    const m = pts.length, pos = [], prev = [], next = [], col = [], side = [], alpha = [], lw = [], along = [], idx = [];
    for (let i = 0; i < m; i++) {
      const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(m - 1, i + 1)];
      const t = i / (m - 1), st = style(t);
      for (const s of [-1, 1]) { pos.push(p.x, p.y, p.z); prev.push(a.x, a.y, a.z); next.push(b.x, b.y, b.z); col.push(st.color.r, st.color.g, st.color.b); side.push(s); alpha.push(st.alpha); lw.push(st.width * px); along.push(t); }
      if (i < m - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const g = new THREE.BufferGeometry(), f = (arr, k) => new THREE.Float32BufferAttribute(arr, k);
    g.setAttribute('position', f(pos, 3)); g.setAttribute('prev', f(prev, 3)); g.setAttribute('next', f(next, 3)); g.setAttribute('col', f(col, 3));
    g.setAttribute('side', f(side, 1)); g.setAttribute('alpha', f(alpha, 1)); g.setAttribute('lw', f(lw, 1)); g.setAttribute('along', f(along, 1)); g.setIndex(idx);
    const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; scene.add(mesh); return mesh;
  }
  const solid = lineMat(0);

  // ------------------------------------------------------------------ nodes sit on lattice dots, mostly on the near side
  const marks = [];   // { p, r (core radius px), halo, ring, color, alpha }
  const nodes = [];
  for (let tries = 0; nodes.length < P.nodes && tries < 4000; tries++) {
    const z = rng.range(-1, 1), a = rng() * TAU, r = Math.sqrt(1 - z * z), p = V(r * Math.cos(a), z, r * Math.sin(a));
    const face = p.dot(view), want = nodes.length < Math.ceil(P.nodes * 0.72) ? 0.22 : -0.45;
    if (face < want || face > 0.93 || nodes.some((q) => q.angleTo(p) < 0.42)) continue;
    let bestI = 0, bd = -2; for (let i = 0; i < n; i++) { const d = lattice[i].dot(p); if (d > bd) { bd = d; bestI = i; } }
    nodes.push(lattice[bestI].clone());
  }
  const hot = C(2), sat3 = C(cols.length > 3 ? 3 : 2), linkA = dark ? C(1) : hot;   // on paper a link keeps one ink colour and only gains weight
  const links = [], seen = new Set();
  for (let i = 1; i < nodes.length; i++) {
    const order = rng() < 0.5 ? [0, ...rng.shuffle([...Array(i).keys()])] : rng.shuffle([...Array(i).keys()]);
    for (const j of order) { const ang = nodes[i].angleTo(nodes[j]); if (ang > 0.5 && ang < 1.75 && !seen.has(`${j}-${i}`)) { seen.add(`${j}-${i}`); links.push([j, i, ang]); break; } }
  }
  if (nodes.length > 3) { const ang = nodes[0].angleTo(nodes[nodes.length - 1]); if (ang > 0.5 && ang < 1.75 && !seen.has(`0-${nodes.length - 1}`)) links.push([0, nodes.length - 1, ang]); }
  const degree = nodes.map(() => 0);
  for (const [i, j, ang] of links) {
    degree[i]++; degree[j]++;
    const A = nodes[i], B = nodes[j], lift = 0.04 + 0.17 * (ang / Math.PI) ** 1.1, steps = Math.max(24, Math.round(ang * 46)), pts = [];
    for (let k = 0; k <= steps; k++) {
      const t = k / steps, s0 = Math.sin((1 - t) * ang) / Math.sin(ang), s1 = Math.sin(t * ang) / Math.sin(ang);
      pts.push(A.clone().multiplyScalar(s0).addScaledVector(B, s1).multiplyScalar(1 + lift * Math.sin(Math.PI * t)));
    }
    // each link brightens towards the node it arrives at, like a signal in flight
    strip(pts, (t) => ({ color: linkA.clone().lerp(hot, t * t), alpha: (dark ? 0.22 : 0.4) + (dark ? 0.78 : 0.6) * t ** 2.2, width: dark ? 1.7 : 2.3 }), solid);
  }
  nodes.forEach((p, i) => {
    const hub = degree[i] >= 2, k = dark ? 1 : 1.45;
    marks.push({ p, r: (hub ? 3.3 : 2.5) * k, halo: hub ? 16 : 11, ring: hub ? 10.5 : 0, color: hot, alpha: 1 });
  });

  // ------------------------------------------------------------------ orbit rings, each with one small satellite
  for (let k = 0; k < Math.min(P.rings, 3); k++) {
    const R = RING[k] ?? RING[1] - 0.09 * (k - 1), pts = [], m = 360;
    // ring plane: tilted so the ellipse opens towards the viewer; the second ring crosses the first
    const tilt = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rng.range(1.12, 1.3) * (k % 2 ? -1 : 1), 0, (k % 2 ? rng.range(0.5, 0.9) : rng.range(-0.5, -0.15)) * flip, 'ZXY'));
    for (let i = 0; i < m; i++) { const a = (i / m) * TAU; pts.push(V(Math.cos(a) * R, Math.sin(a) * R, 0).applyMatrix4(tilt)); }
    // start the strip at the point farthest from the viewer so the satellite's bright tail lies on the near side
    let far = 0; pts.forEach((p, i) => { if (p.dot(view) < pts[far].dot(view)) far = i; });
    const ring = pts.slice(far).concat(pts.slice(0, far)); ring.push(ring[0].clone());   // closed: first point repeated (the seam sits on the far side)
    const sat = rng.range(0.34, 0.66), tone = dark ? (k % 2 ? C(1).lerp(hot, 0.5) : C(1)) : (k % 2 ? C(0).lerp(hot, 0.5) : C(0));
    const tail = (t) => { const d = sat - t; return d >= 0 && d < 0.2 ? (1 - d / 0.2) ** 2 : 0; };
    strip(ring, (t) => ({ color: tone.clone().lerp(hot, tail(t)), alpha: (k % 2 ? 0.55 : 0.42) + 0.55 * tail(t), width: ((k % 2 ? 1.5 : 1.1) + 0.5 * tail(t)) * (dark ? 1 : 1.25) }), k % 2 ? lineMat(150) : solid);
    marks.push({ p: ring[Math.round(sat * (ring.length - 1))], r: dark ? 2.2 : 2.8, halo: 10, ring: 0, color: k % 2 ? hot : sat3, alpha: 1 });
  }

  // ------------------------------------------------------------------ nodes & satellites: core, halo, optional hairline ring (screen-facing)
  const quad = new THREE.PlaneGeometry(2, 2), ig = new THREE.InstancedBufferGeometry();
  ig.index = quad.index; ig.setAttribute('position', quad.attributes.position);
  const ic = [], icol = [], iprm = [];
  for (const mk of marks) { ic.push(mk.p.x, mk.p.y, mk.p.z); icol.push(mk.color.r, mk.color.g, mk.color.b); iprm.push(mk.r * px, mk.halo * px, mk.ring * px, mk.alpha); }
  ig.setAttribute('center', new THREE.InstancedBufferAttribute(new Float32Array(ic), 3));
  ig.setAttribute('ncol', new THREE.InstancedBufferAttribute(new Float32Array(icol), 3));
  ig.setAttribute('prm', new THREE.InstancedBufferAttribute(new Float32Array(iprm), 4));
  const nodeMesh = new THREE.Mesh(ig, new THREE.ShaderMaterial({
    ...common, uniforms: { ...base(), uHair: { value: Math.max(1.1 * px, 0.8) } },
    vertexShader: /* glsl */`
      attribute vec3 center, ncol; attribute vec4 prm; uniform vec2 uRes; varying vec3 vCol; varying vec4 vPrm; varying vec2 vP; varying float vVis;
      ${GLSL_QUIET}
      ${GLSL_BEHIND}
      void main(){
        vec4 c = projectionMatrix * viewMatrix * vec4(center, 1.0);
        float ext = max(prm.y, prm.z + 2.0) + 2.0;                                   // px half-size of the quad
        gl_Position = vec4(c.xy + position.xy * ext * 2.0 / uRes * c.w, c.zw);
        vec2 uv = c.xy / c.w * 0.5 + 0.5; uv.y = 1.0 - uv.y;
        vVis = prm.w * mix(1.0, 0.22, behind(center * 1.004)) * (1.0 - 0.95 * quietMask(uv, 0.07));
        vCol = ncol; vPrm = prm; vP = position.xy * ext;
      }`,
    fragmentShader: /* glsl */`
      uniform float uDark, uHair; varying vec3 vCol; varying vec4 vPrm; varying vec2 vP; varying float vVis;
      void main(){
        float d = length(vP);
        float core = 1.0 - smoothstep(vPrm.x - 0.75, vPrm.x + 0.75, d);
        float halo = exp(-d * d / (vPrm.y * vPrm.y * 0.16)) * (1.0 - smoothstep(vPrm.y * 0.8, vPrm.y, d));
        float ring = vPrm.z > 0.0 ? 1.0 - smoothstep(uHair * 0.5 - 0.7, uHair * 0.5 + 0.7, abs(d - vPrm.z)) : 0.0;
        float a = max(core, max(halo * mix(0.22, 0.5, uDark), ring * 0.75)) * vVis;
        if (a < 0.003) discard;
        vec3 col = mix(vCol, vec3(1.0), (1.0 - smoothstep(0.0, vPrm.x * 0.75, d)) * uDark * 0.7);   // cores burn towards white on dark
        ${OUT}
      }`,
  }));
  nodeMesh.frustumCulled = false; if (marks.length) scene.add(nodeMesh);

  const dist = ctx.frame({ radius: FRAME, fov: FOV, dir: [view.x, view.y, view.z] });
  dots.material.uniforms.uDist.value = dist;
  rim.quaternion.copy(ctx.camera.quaternion);   // the glow card faces the lens
}
