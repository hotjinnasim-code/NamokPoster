// Tide — wave bands rising from the edge of the sheet farthest from the copy, like a paper sea.
//
// Every sheet ends in one long hand-cut wavy line: a leaning sine with a smaller second wave on it,
// each line with its own length and phase so that crests ride over the troughs of the line before.
// The lines lie across the direction that leads from the copy to the open part of the sheet, at
// unequal distances — some bands are wide, some slivers — and the colour deepens towards the far
// edge. A plain disc of accent paper (a sun or a moon: no rays) is slipped between two sheets.
//
// The lamp is in the upper left, so a cut throws a visible shadow only when its paper lies above or
// left of it. When the far edge is the bottom or the right, the page is the top sheet and the bands
// step down towards the edge; when it is the top or the left, the same picture is built the other
// way up — the page is the bottom sheet and the bands are piled on it, the deepest colour on top —
// and the shadows fall towards the copy instead. Either way they fall to the lower right.

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export default function tide(ctx, env) {
  const { THREE, rng, focus } = ctx;
  const { P, sx, sy, quiet, qDist, rampAt, moonOn, MAX_SHEETS } = env;
  const deep = clamp(P.layers ?? 6, 3, MAX_SHEETS - 1);                                      // sheets besides the page = number of wavy lines

  // ---- which way the tide comes in: from the copy towards the middle of the open part of the sheet
  const blocks = quiet.filter((r) => !(r.x0 <= 0.02 && r.x1 >= 0.98 && r.y1 - r.y0 < 0.3));       // footer and header strips do not count
  let bx = 0, by = 0, bw = 0;
  for (const r of blocks.length ? blocks : [{ x0: 0, y0: 0, x1: 1, y1: 0.4 }]) { const w = (r.x1 - r.x0) * (r.y1 - r.y0) + 1e-4; bx += w * (r.x0 + r.x1) / 2; by += w * (r.y0 + r.y1) / 2; bw += w; }
  bx = (bx / bw) * sx; by = (by / bw) * sy;
  let fx = 0, fy = 0, fw = 0;
  for (let iy = 0; iy < 28; iy++) for (let ix = 0; ix < 28; ix++) {
    const x = (ix + 0.5) / 28, y = (iy + 0.5) / 28, w = Math.pow(clamp(qDist(x, y) / 0.3, 0, 1), 1.5);
    fx += w * x * sx; fy += w * y * sy; fw += w;
  }
  const ang0 = Math.atan2(fy / fw - by, fx / fw - bx);
  // For a direction: the far end of the zone (the farthest point of the sheet that is clear of the footer and
  // header strips and of the paper steps round them), the near end of the sheet for scale, how far from the far
  // end the first line may lie — it stops short of the nearest corner of a copy block, by a margin and its own
  // swing — and how much of the sheet the bands would then cover.
  const bank = 0.055, corners = [[0, 0], [sx, 0], [0, sy], [sx, sy]];
  const zoneOf = (ang) => {
    const ax = Math.cos(ang), ay = Math.sin(ang), E0 = Math.min(...corners.map(([x, y]) => x * ax + y * ay));
    let E = -1e9;
    for (let iy = 0; iy <= 40; iy++) for (let ix = 0; ix <= 40; ix++) { const x = ix / 40, y = iy / 40; if (qDist(x, y) > bank + 0.045) E = Math.max(E, x * sx * ax + y * sy * ay); }
    if (E < -1e8) E = Math.max(...corners.map(([x, y]) => x * ax + y * ay));
    let T1 = (E - E0) * 0.62;
    for (const r of blocks) for (const [x, y] of [[r.x0, r.y0], [r.x1, r.y0], [r.x0, r.y1], [r.x1, r.y1]]) T1 = Math.min(T1, (E - (x * sx * ax + y * sy * ay) - 0.04) / 1.12);
    let area = 0;
    for (let iy = 0; iy < 36; iy++) for (let ix = 0; ix < 36; ix++) { const x = (ix + 0.5) / 36, y = (iy + 0.5) / 36; if (qDist(x, y) > 0.03 && E - (x * sx * ax + y * sy * ay) < T1) area++; }
    return { ax, ay, E, T1: Math.max(T1, 0.14), area };
  };
  // A tide that comes in dead level from the side reads as a curtain: lean it, so that the bands rise across
  // the sheet and widen towards the foot. One that comes from above or below keeps its own line, unless
  // coming in square to the sheet would cover clearly more of it (a short strip under a wide block of copy).
  let Z;
  if (Math.abs(Math.cos(ang0)) > 0.86) Z = zoneOf(Math.cos(ang0) > 0 ? rng.range(0.34, 0.5) : Math.PI - rng.range(0.34, 0.5));
  else { const own = zoneOf(ang0), square = zoneOf(Math.sign(Math.sin(ang0)) * Math.PI / 2); Z = own.area * 1.15 >= square.area ? own : square; }
  const { ax, ay, E, T1 } = Z, px = -ay, py = ax;                                              // a: towards the far end · p: along the lines
  const up = ax * 0.64 + ay * 0.77 < -0.12;                                                  // far end above or left of the copy: pile the bands on the page

  // ---- the lines: [distance from the far end, amplitude, wave number, phase] and [second wave: amplitude, wave number, phase, lean]
  const amp = Array.from({ length: deep + 1 }, () => clamp(T1 * 0.085, 0.02, 0.046) * rng.range(0.8, 1.15));
  const pool = [1.7, 0.6, 1.25, 0.8, 1.5, 0.55, 1.0, 1.35, 0.7];
  let steps = [];
  for (let tries = 0; tries < 40; tries++) { steps = rng.shuffle(pool).slice(0, deep - 1); if (!steps.some((s, i) => i && s < 0.75 && steps[i - 1] < 0.75)) break; }
  const sum = steps.reduce((a, b) => a + b, 0) || 1, last = rng.range(0.13, 0.17), C = [0];   // C[m-1]: how far line m has moved from the first line to the far edge
  for (const s of steps) C.push(C[C.length - 1] + (s / sum) * (1 - last));
  const lean = rng.sign() * rng.range(0.3, 0.5), lineA = [new THREE.Vector4(9, 0, 0, 0)], lineB = [new THREE.Vector4(0, 0, 0, 0)];
  let ph = rng.range(0, TAU);
  for (let m = 1; m <= deep; m++) {
    const k = TAU / rng.range(0.8, 1.3);
    ph += rng.range(1.7, 2.7);
    lineA.push(new THREE.Vector4(T1 * (1 - C[m - 1]), amp[m] * (1 - 0.25 * C[m - 1]), k, ph));
    lineB.push(new THREE.Vector4(amp[m] * rng.range(0.22, 0.36), k * rng.range(1.9, 2.5), rng.range(0, TAU), lean));
  }
  const lineT = (m, x) => { const a = lineA[m], b = lineB[m], th = a.z * x + a.w; return a.x + a.y * Math.sin(th + b.w * Math.sin(th)) + b.x * Math.sin(b.y * x + b.z); };

  // ---- the stack (bottom → top) and how far each sheet keeps from the copy
  const n = deep + 1, cols = [], clear = [];
  for (let j = 0; j < n; j++) {
    const k = up ? j : n - 1 - j;                                                             // depth: 0 = the page
    cols.push(rampAt(k / deep));
    clear.push(0.028 + bank * (C[Math.max(0, k - (up ? 1 : 0))] ?? 1));
  }

  // ---- the disc: a sun or moon on the fourth sheet, a third of it tucked under the sheet above
  let discSpec = null;
  if (P.disc && deep >= 3) {
    const r = clamp(0.19 * T1, 0.05, 0.095), xf = focus.x * sx * px + focus.y * sy * py;
    const xs = corners.map(([x, y]) => x * px + y * py), x0 = Math.min(...xs), x1 = Math.max(...xs);
    // of the places along the line where the whole disc is on the sheet and clear of the copy, the one nearest the focus;
    // if the fourth sheet has none, try the third, then the second
    for (let kd = Math.min(3, deep - 1); kd >= 1 && !discSpec; kd--) {
      const m = Math.min(up ? kd + 1 : kd, deep); let best = null;                              // the line it is tucked behind
      for (let i = 0; i <= 60; i++) {
        const x = x0 + ((x1 - x0) * i) / 60, t = lineT(m, x) + (up ? 0.3 : -0.3) * r, qx = x * px + (E - t) * ax, qy = x * py + (E - t) * ay;
        if (qx < r + 0.06 || qx > sx - r - 0.06 || qy < r + 0.06 || qy > sy - r - 0.06 || qDist(qx / sx, qy / sy) < r + 0.08) continue;
        if (!best || Math.abs(x - xf) < best.d) best = { d: Math.abs(x - xf), qx, qy };
      }
      if (best) discSpec = { x: best.qx, y: best.qy, r, after: up ? kd : n - 1 - kd, col: moonOn(rampAt(kd / deep)) };
    }
  }
  while (lineA.length < MAX_SHEETS + 1) { lineA.push(new THREE.Vector4(9, 0, 0, 0)); lineB.push(new THREE.Vector4(0, 0, 0, 0)); }

  return {
    cols, clear, up, disc: discSpec, per: 1,
    glsl: /* glsl */`
      uniform vec2 uA; uniform float uE; uniform vec4 uLineA[${MAX_SHEETS + 1}], uLineB[${MAX_SHEETS + 1}];
      // > 0 on the copy's side of wavy line m (short-side units)
      float lineD(int m, vec2 q){
        float t = uE - dot(q, uA), x = dot(q, vec2(-uA.y, uA.x));
        vec4 a = uLineA[m], b = uLineB[m]; float th = a.z * x + a.w;
        return t - (a.x + a.y * sin(th + b.w * sin(th)) + b.x * sin(b.y * x + b.z));
      }
      float sheet(int j, vec2 q){
        if (uUp > 0.5) return terrace(j, -lineD(j, q), q, 1.0);       // piled on the page: band j lies beyond its line
        return terrace(j, lineD(uN - j, q), q, 1.0);                  // page on top: each sheet reaches as far as the line it is cut along
      }`,
    uniforms: { uA: { value: new THREE.Vector2(ax, ay) }, uE: { value: E }, uLineA: { value: lineA }, uLineB: { value: lineB } },
  };
}
