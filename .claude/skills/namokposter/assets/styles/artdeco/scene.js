// Art Deco — ornament in metallic line and flat colour: stepped (ziggurat) silhouettes, round arches,
// chevrons, fish-scale fields and above all fine parallel lines, strictly symmetrical.
// The drawing is made twice on 2D canvases at the output size — a flat-colour plate and a metal plate
// (a mask of every gilded line) — and a shader turns the metal plate into foil: broad bands of sheen
// across the sheet, a brushed grain and a lit edge, so the lines read as stamped gold rather than yellow ink.
//
// What it depicts is the `motif`:
//   tower    a stepped skyscraper between lower towers, under a great arch of parallel lines
//   arch     a gateway: nested arches between fluted pilasters, a chevron frieze, steps leading in
//   scallop  a fish-scale field of gilded arcs that sheds its colour and thins to points towards the copy
// No ray fans anywhere: depth comes from stepping, nesting and parallel lines.
//
// Palette: bg = ground · colors[0] = the metal (gold, silver, copper) · colors[1], colors[2] = flat colours
//          ink / accent = type
import { backgroundQuad, canvasTexture, GLSL_NOISE_KIT, GLSL_DITHER } from '/skill/assets/web/scene-lib.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

export default function build(ctx) {
  const { THREE, scene, palette, params, aspect, rng, seed, width: W, height: H, unit: u } = ctx;
  const short = Math.min(W, H);
  const motif = ['tower', 'arch', 'scallop'].includes(params.motif) ? params.motif : 'tower';
  const P = { line: clamp(params.line ?? 1, 0.5, 2.5), sheen: clamp(params.sheen ?? 1, 0, 2), scale: clamp(params.scale ?? 1, 0.6, 1.4), detail: clamp(params.detail ?? 1, 0.5, 1.8) };
  const C = (h) => new THREE.Color(h), bgc = C(palette.bg), dark = bgc.getHSL({}).l < 0.4;
  const cols = palette.colors?.length ? palette.colors : [palette.accent];
  const metal = cols[0], flat1 = cols[1] ?? palette.ink, flat2 = cols[2] ?? flat1;
  const mixHex = (a, b, t) => '#' + C(a).lerp(C(b), t).getHexString();

  // ---- where the copy sits
  const quiet = (ctx.quiet || []).map(([x0, y0, x1, y1]) => ({ x0, y0, x1, y1 }));
  const qDist = (x, y) => {
    let d = 1e9;
    for (const r of quiet) {
      const ex = Math.abs(x - ((r.x0 + r.x1) / 2) * W) - ((r.x1 - r.x0) / 2) * W, ey = Math.abs(y - ((r.y0 + r.y1) / 2) * H) - ((r.y1 - r.y0) / 2) * H;
      d = Math.min(d, Math.hypot(Math.max(ex, 0), Math.max(ey, 0)) + Math.min(Math.max(ex, ey), 0));
    }
    return d;
  };
  const fx = ctx.focus.x * W, fy = ctx.focus.y * H;
  const [ax0, ay0, ax1, ay1] = ctx.artRect || [0, 0, 1, 1], aw = (ax1 - ax0) * W, ah = (ay1 - ay0) * H;
  const copy = quiet[0] ?? { x0: 2, y0: 2, x1: 2, y1: 2 }, ccx = ((copy.x0 + copy.x1) / 2) * W, ccy = ((copy.y0 + copy.y1) / 2) * H;
  let dx = fx - ccx, dy = fy - ccy; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
  if (Math.abs(dx) > 0.82) { dx = Math.sign(dx); dy = 0; } else if (Math.abs(dy) > 0.82) { dy = Math.sign(dy); dx = 0; }
  const copyHalf = Math.abs(dx) * ((copy.x1 - copy.x0) / 2) * W + Math.abs(dy) * ((copy.y1 - copy.y0) / 2) * H;
  const centred = quiet.length === 0 || qDist(fx, fy) < 3 * u;

  // pen widths (px)
  const hair = Math.max(1, 0.085 * u * P.line), fine = Math.max(1, 0.14 * u * P.line), med = 0.24 * u * P.line, bold = 0.42 * u * P.line;
  const snap = (v, w = hair) => (Math.round(w) % 2 === 1 || w < 1.5 ? Math.floor(v) + 0.5 : Math.round(v));   // keep thin straight lines on the pixel grid

  let gm = null;                                                                           // metal plate (drawn inside the colour plate's callback)
  const metalTex = canvasTexture(W, H, (g) => { gm = g; g.fillStyle = '#000'; g.fillRect(0, 0, W, H); }, { srgb: false });
  const colTex = canvasTexture(W, H, (gc) => {
    gc.fillStyle = palette.bg; gc.fillRect(0, 0, W, H);
    for (const g of [gc, gm]) { g.lineJoin = 'miter'; g.lineCap = 'butt'; g.miterLimit = 8; }
    // ---- the two plates. A flat fill also clears the metal under it, so shapes drawn later hide the lines behind them.
    const flat = (trace, colour) => { gc.beginPath(); trace(gc); gc.fillStyle = colour; gc.fill(); gm.beginPath(); trace(gm); gm.fillStyle = '#000'; gm.fill(); };
    const gild = (trace, w = fine, a = 1) => { gm.beginPath(); trace(gm); gm.strokeStyle = `rgba(255,255,255,${a})`; gm.lineWidth = w; gm.stroke(); };
    const gildFill = (trace, a = 1) => { gm.beginPath(); trace(gm); gm.fillStyle = `rgba(255,255,255,${a})`; gm.fill(); };
    const rectP = (x, y, w, h) => (g) => g.rect(x, y, w, h);
    const lineP = (x0, y0, x1, y1) => (g) => { g.moveTo(x0, y0); g.lineTo(x1, y1); };
    const vlines = (x0, x1, y0, y1, n, w = hair, a = 1) => { for (let i = 0; i < n; i++) { const x = snap(lerp(x0, x1, n === 1 ? 0.5 : i / (n - 1)), w); gild(lineP(x, y0, x, y1), w, a); } };
    const hlines = (x0, x1, y0, y1, n, w = hair, a = 1) => { for (let i = 0; i < n; i++) { const y = snap(lerp(y0, y1, n === 1 ? 0.5 : i / (n - 1)), w); gild(lineP(x0, y, x1, y), w, a); } };
    const archP = (cx, base, w, h) => (g) => { const r = w / 2; g.moveTo(cx - r, base); g.lineTo(cx - r, base - h + r); g.arc(cx, base - h + r, r, Math.PI, 0); g.lineTo(cx + r, base); };
    const archClosed = (cx, base, w, h) => (g) => { archP(cx, base, w, h)(g); g.closePath(); };
    const sparkle = (x, y, r, a = 1) => gildFill((g) => { g.moveTo(x, y - r); g.quadraticCurveTo(x, y, x + r * 0.7, y); g.quadraticCurveTo(x, y, x, y + r); g.quadraticCurveTo(x, y, x - r * 0.7, y); g.quadraticCurveTo(x, y, x, y - r); }, a);
    const chevrons = (cx, y0, w, h, n, wd = fine) => { for (let i = 0; i < n; i++) { const y = y0 + (i * h) / n; gild((g) => { g.moveTo(cx - w / 2, y + h / n); g.lineTo(cx, y); g.lineTo(cx + w / 2, y + h / n); }, wd); } };

    if (motif === 'tower' || motif === 'arch') {
      // the subject stands on a ground line in a box fitted to the free space; everything is measured in fractions of its height
      const Hh = Math.min(ah * 0.95, aw / 1.16) * P.scale, baseY = Math.round(fy + Hh / 2), topY = baseY - Hh, reachX = aw / 2 - 1.5 * u;
      // a stepped block: tiers [half-width, height] from the ground up (fractions of Hh), fluted with fine parallel lines
      const stepped = (cx, k, hk, tiers, fill, fill2, weight = 0, bay = false) => {
        let y = baseY;
        tiers.forEach(([tw, th], i) => {
          const w = Math.max(2, Math.round(tw * Hh * k)) * 2, h = Math.round(th * Hh * hk), x0 = Math.round(cx - w / 2), y0 = y - h;
          flat(rectP(x0, y0, w, h), i % 2 === 0 ? fill : mixHex(fill, fill2, 0.55));
          const n = Math.max(3, Math.round((w / (1.05 * u)) * P.detail) | 1), inset = Math.max(2 * hair, 0.45 * u);
          vlines(x0 + inset, x0 + w - inset, y0 + inset, y, n, hair, weight ? 0.95 : 0.75);
          if (bay && i >= 1 && i <= 3) {                                                 // a brighter central bay up the main shaft
            const bw = Math.round(w * 0.34);
            flat(rectP(Math.round(cx - bw / 2), y0 + inset * 1.5, bw, h - inset * 1.5), fill2);
            gild(rectP(snap(cx - bw / 2, fine), snap(y0 + inset * 1.5, fine), bw, h - inset * 1.5), fine);
            if (i === 1) chevrons(cx, y0 + inset * 3.5, bw * 0.62, h - inset * 6, Math.round(13 * P.detail), fine);
            else vlines(cx - bw / 2 + inset, cx + bw / 2 - inset, y0 + inset * 3, y, 3, hair);
          }
          gild(rectP(snap(x0, med), snap(y0, med), w, h), weight ? med : fine);
          gild(lineP(x0 - 0.3 * u, snap(y0, med), x0 + w + 0.3 * u, snap(y0, med)), weight ? bold : med);            // cornice
          y = y0;
        });
        return y;
      };
      const ground = (half) => { for (let i = 0; i < 4; i++) { const y = snap(baseY + i * (0.5 + i * 0.2) * u + (i ? 0.45 * u : 0), i ? fine : bold), k = 1.04 - i * 0.13; gild(lineP(fx - half * k, y, fx + half * k, y), i === 0 ? bold : i === 1 ? med : fine); } };
      const stars = (n, x0, x1, y0, y1, avoid) => {
        for (let i = 0, tries = 0; i < n && tries < 400; tries++) {
          const x = rng.range(x0, x1), y = rng.range(y0, y1), r = rng.range(0.35, 1.0) * u;
          if (avoid(x, y) || qDist(x, y) < 4 * u || x < 2 * u || x > W - 2 * u || y < 2 * u) continue;
          sparkle(x, y, r, rng.range(0.7, 1)); i++;
        }
      };

      if (motif === 'tower') {
        // --- a great arch of parallel lines behind the skyline (concentric, like a rainbow — no rays)
        const R1 = Math.min(0.56 * Hh, reachX), nArc = Math.round(8 * P.detail), gap = Math.max(3 * hair, 0.9 * u);
        for (let k = 0, r = R1; k < nArc && r > R1 * 0.45; k++) { gild((g) => g.arc(fx, baseY, r, Math.PI, 0), k === 0 ? med : k % 3 === 0 ? fine : hair, k === 0 ? 1 : 0.9); r -= gap * (1 + k * 0.1); }
        stars(Math.round(10 * P.detail), fx - Math.min(reachX, R1 * 1.5), fx + Math.min(reachX, R1 * 1.5), topY - 0.02 * Hh, topY + 0.6 * Hh, (x, y) => Math.hypot(x - fx, y - baseY) < R1 * 1.04 && Math.hypot(x - fx, y - baseY) > R1 * 0.42 || Math.abs(x - fx) < 0.06 * Hh);
        // --- towers, farthest first: lower and plainer with distance from the centre, as far out as the space allows
        const kinds = [
          [[0.105, 0.09], [0.088, 0.27], [0.066, 0.14], [0.044, 0.09], [0.022, 0.055]],
          [[0.085, 0.2], [0.062, 0.15], [0.036, 0.08]],
          [[0.07, 0.12], [0.05, 0.16], [0.028, 0.07], [0.012, 0.04]],
        ];
        const offs = [];
        for (let k = 1, x = 0.262; k <= 5; k++) { if (x * Hh + 0.09 * Hh > reachX) break; offs.push([x, k]); x += 0.215 - k * 0.012; }
        for (const [x, k] of offs.reverse()) for (const sgn of [-1, 1]) {
          const tiers = kinds[(k - 1) % 3], hk = (k === 1 ? 1 : 1.05 - k * 0.1) * (sgn > 0 ? 1 : 1.1) * (k % 2 ? 1 : 0.9);
          const top = stepped(fx + sgn * x * Hh, 1, hk, tiers, k === 1 ? flat2 : mixHex(palette.bg, k % 2 ? flat2 : flat1, 0.72), flat1, 0, false);
          if (k <= 2) gild(lineP(snap(fx + sgn * x * Hh, fine), top, snap(fx + sgn * x * Hh, fine), top - 0.03 * Hh), fine);
        }
        for (const sgn of [-1, 1]) stepped(fx + sgn * 0.135 * Hh, 1, 1, [[0.07, 0.15], [0.05, 0.07]], mixHex(flat2, flat1, 0.4), flat1, 0, false);   // low blocks at the foot of the shaft
        const main = [[0.158, 0.075], [0.128, 0.335], [0.1, 0.17], [0.074, 0.11], [0.05, 0.08], [0.03, 0.055], [0.014, 0.04]];
        const top = stepped(fx, 1, 1, main, flat1, flat2, 1, true);
        gild(lineP(snap(fx, med), top, snap(fx, med), topY), med);                                                // spire
        gildFill((g) => g.arc(fx, top - (top - topY) * 0.45, 0.34 * u, 0, 7));
        ground(Math.min(reachX, Math.max(R1, (offs[0]?.[0] ?? 0.3) * Hh + 0.1 * Hh)));
      } else {
        // --- a gateway. From the outside in: stepped wings, stepped wall, pilasters, nested arches, the opening with its stair.
        const wallW = Math.min(Hh * 0.82, 2 * reachX), wallH = Hh * 0.74, crownH = Hh * 0.17, steps = 4;
        // wings stepping down to either side, as far as the space allows
        for (let k = 1, x = wallW / 2; k <= 4; k++) {
          const w = Hh * (0.15 - k * 0.012), h = wallH * (0.78 - k * 0.17); if (x + w > reachX || h < 0.08 * Hh) break;
          for (const sgn of [-1, 1]) {
            const x0 = Math.round(sgn > 0 ? fx + x : fx - x - w);
            flat(rectP(x0, baseY - h, Math.round(w), h), mixHex(palette.bg, k % 2 ? flat1 : flat2, 0.8));
            vlines(x0 + 0.5 * u, x0 + w - 0.5 * u, baseY - h + 0.5 * u, baseY, Math.max(3, Math.round((w / (1.05 * u)) * P.detail) | 1), hair, 0.7);
            gild(rectP(snap(x0, fine), snap(baseY - h, fine), Math.round(w), h), fine); gild(lineP(x0 - 0.3 * u, snap(baseY - h, med), x0 + w + 0.3 * u, snap(baseY - h, med)), med);
          }
          x += w;
        }
        // stepped (ziggurat) crown and finial
        for (let i = 0; i < steps; i++) {
          const w = Math.round(wallW * (0.86 - i * 0.2)), h = Math.round(crownH / steps), y0 = baseY - wallH - (i + 1) * h;
          flat(rectP(Math.round(fx - w / 2), y0, w, h + 1), i % 2 ? flat2 : mixHex(flat2, flat1, 0.5));
          vlines(fx - w / 2 + 0.5 * u, fx + w / 2 - 0.5 * u, y0 + 0.3 * u, y0 + h, Math.max(3, Math.round((w / (1.05 * u)) * P.detail) | 1), hair, 0.7);
          gild(rectP(snap(fx - w / 2, fine), snap(y0, fine), w, h), fine); gild(lineP(fx - w / 2 - 0.3 * u, snap(y0, med), fx + w / 2 + 0.3 * u, snap(y0, med)), med);
        }
        gild(lineP(snap(fx, med), baseY - wallH - crownH, snap(fx, med), topY), med); gildFill((g) => g.arc(fx, topY + (baseY - wallH - crownH - topY) * 0.5, 0.36 * u, 0, 7));
        // the wall, hatched with fine parallel lines (the arches drawn later cover its middle)
        flat(rectP(Math.round(fx - wallW / 2), baseY - wallH, Math.round(wallW), wallH), flat2);
        vlines(fx - wallW / 2 + 0.6 * u, fx + wallW / 2 - 0.6 * u, baseY - wallH, baseY, Math.round((wallW / (0.95 * u)) * P.detail) | 1, hair, 0.55);
        // frieze: two rows of chevrons between ruled lines
        const frH = wallH * 0.1, frY = baseY - wallH;
        flat(rectP(Math.round(fx - wallW / 2), frY, Math.round(wallW), frH), mixHex(flat2, palette.bg, 0.35));
        { const n = Math.round(11 * P.detail) | 1, cw = (wallW - 1.2 * u) / n; for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) gild((g) => { const x = fx - wallW / 2 + 0.6 * u + i * cw, y = frY + frH * (0.2 + k * 0.17); g.moveTo(x + cw * 0.06, y + frH * 0.36); g.lineTo(x + cw / 2, y); g.lineTo(x + cw * 0.94, y + frH * 0.36); }, k === 0 ? fine : hair, k === 0 ? 1 : 0.8); }
        gild(lineP(fx - wallW / 2, snap(frY + frH, med), fx + wallW / 2, snap(frY + frH, med)), med);
        gild(rectP(snap(fx - wallW / 2, med), snap(baseY - wallH, med), Math.round(wallW), wallH), med);
        gild(lineP(fx - wallW / 2 - 0.4 * u, snap(baseY - wallH, bold), fx + wallW / 2 + 0.4 * u, snap(baseY - wallH, bold)), bold);
        // pilasters: fluted shafts that step in twice towards the top
        const pilW = wallW * 0.1, pilTop = frY + frH + 0.9 * u;
        for (const sgn of [-1, 1]) {
          const cx = fx + sgn * (wallW / 2 - pilW * 0.95);
          [[1.5, 0.12], [1.18, 0.82], [0.86, 1]].forEach(([wk, hk], i) => {
            const w = Math.round(pilW * wk), h = Math.round((baseY - pilTop) * hk), x0 = Math.round(cx - w / 2);
            flat(rectP(x0, baseY - h, w, h), i === 1 ? flat1 : mixHex(flat1, flat2, 0.45));
            if (i) vlines(x0 + w * 0.16, x0 + w * 0.84, baseY - h + 0.4 * u, baseY, Math.max(3, Math.round(i === 2 ? 3 : 5 * P.detail) | 1), hair);
            gild(rectP(snap(x0, fine), snap(baseY - h, fine), w, h), fine);
          });
        }
        // nested arches, alternating the flat colours, each with a gilded edge and an inner hairline
        const aW0 = wallW * 0.62, aH0 = (baseY - pilTop) * 0.95, nA = 6, dW = 0.125;
        for (let k = 0; k < nA; k++) {
          const w = aW0 * (1 - k * dW), h = aH0 - k * aW0 * dW * 0.5, fill = k === nA - 1 ? palette.bg : k % 2 === 0 ? flat1 : mixHex(flat2, palette.bg, 0.3);
          flat(archClosed(fx, baseY, w, h), fill);
          gild(archP(fx, baseY, w, h), k === 0 ? bold : fine);
          if (k < nA - 1) gild(archP(fx, baseY, w - aW0 * dW * 0.34, h - aW0 * dW * 0.17), hair, 0.85);
        }
        // the opening: fine parallel lines closing in from the sides, and a stair of four steps running in
        const oW = aW0 * (1 - (nA - 1) * dW), oH = aH0 - (nA - 1) * aW0 * dW * 0.5;
        gm.save(); gm.beginPath(); archClosed(fx, baseY, oW - 2 * med, oH - med)(gm); gm.clip();
        for (let i = 0, n = Math.round(15 * P.detail) | 1; i < n; i++) { const t = (i / (n - 1)) * 2 - 1, x = snap(fx + Math.sign(t) * Math.pow(Math.abs(t), 0.7) * oW * 0.5, hair); if (Math.abs(t) > 0.2) gild(lineP(x, baseY - oH, x, baseY), hair, 0.35 + 0.6 * Math.abs(t)); }
        gm.restore();
        for (let i = 0; i < 4; i++) { const w = oW * (0.4 + i * 0.17), h = oH * 0.045, y0 = baseY - (4 - i) * h; flat(rectP(Math.round(fx - w / 2), Math.round(y0), Math.round(w), Math.ceil(h)), i % 2 ? flat1 : flat2); gild(rectP(snap(fx - w / 2, hair), snap(y0, hair), Math.round(w), Math.round(h)), hair); }
        // keystone
        { const ky = baseY - aH0, kw = aW0 * 0.07, key = (g) => { g.moveTo(fx - kw, ky - kw * 1.3); g.lineTo(fx + kw, ky - kw * 1.3); g.lineTo(fx + kw * 0.6, ky + kw * 1.3); g.lineTo(fx - kw * 0.6, ky + kw * 1.3); g.closePath(); }; flat(key, flat2); gild(key, fine); vlines(fx - kw * 0.3, fx + kw * 0.3, ky - kw * 0.9, ky + kw * 0.9, 3, hair); }
        // plinth: three wide steps, then the ground
        for (let i = 0; i < 3; i++) { const w = Math.min(wallW * (1.05 + i * 0.07), 2 * reachX + 2 * u), h = Math.round(0.7 * u), y0 = baseY + i * h; flat(rectP(Math.round(fx - w / 2), y0, Math.round(w), h), i % 2 ? flat2 : flat1); gild(rectP(snap(fx - w / 2, fine), snap(y0, fine), Math.round(w), h), fine); }
        stars(Math.round(9 * P.detail), fx - Math.min(reachX, Hh * 0.8), fx + Math.min(reachX, Hh * 0.8), topY, topY + 0.5 * Hh, (x, y) => Math.abs(x - fx) < wallW * 0.5 * (0.2 + 0.9 * clamp((y - topY) / (crownH + 0.06 * Hh), 0, 1)) + 1.5 * u);
      }
    } else {
      // --- fish scales: rows of overlapping discs, each lower row covering the feet of the one above.
      // A scale is fully dressed (colour, four gilded arcs, a bud) in the open, loses colour and arcs towards the copy, and ends as a point.
      const r = clamp(Math.min(aw, ah) / 11, 3.2 * u, 6.2 * u) * P.scale, stepX = r * 1.96, stepY = r * 0.56;
      const side = (x, y) => (centred ? clamp((qDist(x, y) - 4 * u) / (22 * u), 0, 1) : clamp(((x - ccx) * dx + (y - ccy) * dy - copyHalf - 2 * u) / (Math.max(18 * u, 0.3 * Math.hypot(fx - ccx, fy - ccy))), 0, 1));
      // footer / header strips end the field with a ruled edge instead of thinning it
      let yLo = -1, yHi = H + 1;
      for (const q of quiet) if (q.x0 <= 0.02 && q.x1 >= 0.98) { if (q.y1 >= 0.98) yHi = Math.min(yHi, Math.round(q.y0 * H - 1.2 * u)); if (q.y0 <= 0.02) yLo = Math.max(yLo, Math.round(q.y1 * H + 1.2 * u)); }
      const blocks = quiet.filter((q) => !(q.x0 <= 0.02 && q.x1 >= 0.98));
      const bDist = (x, y) => { let d = 1e9; for (const r of blocks) { const ex = Math.abs(x - ((r.x0 + r.x1) / 2) * W) - ((r.x1 - r.x0) / 2) * W, ey = Math.abs(y - ((r.y0 + r.y1) / 2) * H) - ((r.y1 - r.y0) / 2) * H; d = Math.min(d, Math.hypot(Math.max(ex, 0), Math.max(ey, 0)) + Math.min(Math.max(ex, ey), 0)); } return d; };
      for (const g of [gc, gm]) { g.save(); g.beginPath(); g.rect(-2, yLo, W + 4, yHi - yLo); g.clip(); }
      const cols0 = Math.round(fx / stepX) + 2, rows = Math.ceil(H / stepY) + 4;
      let xMin = W, xMax = 0;
      for (let j = -2; j < rows; j++) {
        const y = j * stepY;
        for (let i = -cols0; i < W / stepX + 2; i++) {
          const x = fx + (i + (j & 1 ? 0.5 : 0)) * stepX;
          if (x < -r || x > W + r) continue;
          let wgt = side(x, y - r * 0.5) * clamp((bDist(x, y - r * 0.5) - 1.5 * u) / (6 * u), 0, 1);
          wgt = clamp(wgt + (rng() - 0.5) * 0.16, 0, 1) * (wgt > 0 ? 1 : 0);
          if (wgt <= 0.02) continue;
          const disc = (rr) => (g) => g.arc(x, y, rr, 0, Math.PI * 2), upper = (rr) => (g) => g.arc(x, y, rr, Math.PI, 0);
          if (wgt < 0.3) { gildFill(disc(Math.max(1, (0.1 + 0.5 * wgt) * u)), 0.5 + wgt); continue; }
          if (y > yLo && y - r < yHi) { xMin = Math.min(xMin, x - r); xMax = Math.max(xMax, x + r); }
          const k = clamp((wgt - 0.3) / 0.45, 0, 1), tone = ((i * 2 + (j & 1)) % 4 + 4) % 4 < 2 ? flat1 : flat2;                // how fully dressed
          flat(disc(r), mixHex(palette.bg, (j % 4 + 4) % 4 < 2 ? tone : mixHex(flat1, flat2, 0.5), k * k));
          gild(upper(r - med / 2), k > 0.6 ? med : fine, 0.6 + 0.4 * k);
          const nIn = Math.round(lerp(0, 4, k));
          for (let a = 1; a <= nIn; a++) gild(upper(r * (1 - a * 0.19)), a === nIn && k > 0.95 ? fine : hair, 0.9);
          if (k > 0.5) gildFill(disc(r * 0.075), 1);
        }
      }
      for (const g of [gc, gm]) g.restore();
      // ruled edges where the field was cut
      for (const [yy, sgn] of [[yHi, 1], [yLo, -1]]) if (yy > 0 && yy < H && xMax > xMin) { gild(lineP(Math.max(-2, xMin), snap(yy, med), Math.min(W + 2, xMax), snap(yy, med)), med); gild(lineP(Math.max(-2, xMin), snap(yy + sgn * 0.5 * u, hair), Math.min(W + 2, xMax), snap(yy + sgn * 0.5 * u, hair)), hair, 0.9); }
    }
  });

  const cm = C(metal);
  scene.add(backgroundQuad(/* glsl */`
    varying vec2 vUv; uniform sampler2D uCol, uMask; uniform vec2 uRes; uniform vec3 cMetal; uniform float uDark, uSheen, uSeed;
    ${GLSL_NOISE_KIT}
    ${GLSL_DITHER}
    void main(){
      vec3 base = texture2D(uCol, vUv).rgb; vec2 px = 1.0 / uRes;
      float m = texture2D(uMask, vUv).r;
      vec2 gr = vec2(texture2D(uMask, vUv + vec2(px.x, 0.0)).r - texture2D(uMask, vUv - vec2(px.x, 0.0)).r, texture2D(uMask, vUv + vec2(0.0, px.y)).r - texture2D(uMask, vUv - vec2(0.0, px.y)).r);
      vec2 q = vec2(vUv.x * uRes.x / uRes.y, vUv.y);
      // foil: slow diagonal bands of reflection, a little warped, plus a brushed grain along the sheet
      float t = dot(q, vec2(0.78, 0.62)) * 1.9 + 0.3 * fbm2(q * 1.2 + uSeed, 3) + uSeed;
      float s = 0.5 + 0.5 * sin(t * 6.2831853); s = s * s * (3.0 - 2.0 * s);
      s = mix(0.55, s, uSheen);
      vec3 lo = cMetal * mix(vec3(0.5, 0.42, 0.36), vec3(0.62, 0.52, 0.42), uDark);
      vec3 hi = mix(cMetal, vec3(1.0, 0.97, 0.9), mix(0.3, 0.62, uDark));
      vec3 foil = mix(mix(lo, cMetal, smoothstep(0.0, 0.5, s)), hi, smoothstep(0.5, 1.0, s));
      foil *= 1.0 + 0.07 * fbm2(q * vec2(260.0, 26.0) + 7.0, 2);
      foil += dot(gr, vec2(-0.6, 0.8)) * 0.22 * cMetal;                                 // lit upper-left edge, shaded lower-right
      vec3 col = mix(base, max(foil, 0.0), clamp(m, 0.0, 1.0));
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
      gl_FragColor.rgb += (hash21(gl_FragCoord.xy) - 0.5) * 0.012 + ditherNoise(gl_FragCoord.xy);
    }`, {
    uCol: { value: colTex }, uMask: { value: metalTex }, uRes: { value: new THREE.Vector2(W, H) }, cMetal: { value: cm },
    uDark: { value: dark ? 1 : 0 }, uSheen: { value: P.sheen }, uSeed: { value: (seed % 97) * 0.173 },
  }));

  ctx.frame({ radius: 1, fov: 30, dir: [0, 0, 1] });
}
