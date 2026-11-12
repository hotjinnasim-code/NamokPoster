// Blind Emboss — heavyweight cotton paper pressed with a die. Almost nothing is printed: the design is
// only the sheet raised or sunk, read by one raking light from the upper left, and a single small
// element is stamped in metallic foil. The language of luxury stationery, invitations and book covers.
//
// How it is made
//   1. A height map is drawn with the 2D canvas (mid grey = the sheet, lighter = raised, darker = sunk):
//      plates, rules, beads, leaves, the repeat patterns and — for the monogram — real letterforms set
//      in the bundled serif faces. A second canvas holds the foil mask.
//   2. The height map is blurred a little on the GPU into a float texture. That blur is the rounded
//      shoulder of a real die, and it turns the 8-bit, one-pixel antialiased edges of the drawing into
//      smooth slopes, so curves light evenly with no stair-steps. A second, much wider blur at quarter
//      size gives the ambient occlusion.
//   3. The sheet is shaded from that: slope towards the light = a crisp highlight, slope away = shade,
//      a short soft shadow thrown by anything that stands higher on the light's side, a slightly darker
//      floor in sunk areas, cotton tooth that is pressed smoother where the die has been. Foil is a flat
//      metallic tone with one broad highlight band, faint brushed streaks and the same pressed-in edge.
//
// The object sits at the layout's focus and is sized to the room the copy leaves; the pattern fills the
// art rectangle and fades out, cell by cell, well before the type. Round the whole sheet runs a plate
// mark (the panel inside the margin is sunk by a hair), which ties the copy and the object together.
//
// motif: monogram | pattern | crest
// params: text, letters, plate, font (monogram) · repeat, accent, scale (pattern) · centre (crest) ·
//         frame, foil, relief, soft, grain — see style.json
// Palette: bg = the paper · colors[0] = the foil · ink / accent = type (the art prints no ink at all)
import { backgroundQuad, canvasTexture, oklabVec, GLSL_OKLAB, GLSL_NOISE_KIT, makeComposer, finishPassShader } from '/skill/assets/web/scene-lib.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;

// Faces for the monogram: Latin from the first family, Hangul from the second (both bundled).
const FACES = {
  serif: { family: '"Fraunces", "Hahmlet", serif', weight: 500, load: ['500 100px "Fraunces"', '500 100px "Hahmlet"'] },
  sans: { family: '"Pretendard", sans-serif', weight: 600, load: ['600 100px "Pretendard"'] },
};

/** Bring in the page fonts (the art page does not load them by itself) and wait for the subsets `text` needs. */
async function loadFonts(face, text) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  if (!document.querySelector('link[data-emboss-fonts]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/skill/assets/fonts/fonts.css'; l.dataset.embossFonts = '1';
    const done = new Promise((r) => { l.onload = r; l.onerror = r; });
    document.head.appendChild(l);
    await Promise.race([done, wait(5000)]);
  }
  try { await Promise.race([Promise.all(face.load.map((s) => document.fonts.load(s, text).catch(() => null))), wait(8000)]); } catch { /* fall back to whatever loaded */ }
}

export default async function build(ctx) {
  const { THREE, scene, renderer, camera, palette, params, rng, width: W, height: H, unit: u } = ctx;
  const motif = ['monogram', 'pattern', 'crest'].includes(params.motif) ? params.motif : 'monogram';
  const P = {
    relief: clamp(params.relief ?? 1, 0.4, 1.8), soft: clamp(params.soft ?? 1, 0.6, 2), grain: clamp(params.grain ?? 1, 0, 2),
    foil: params.foil !== false && params.foil !== 0, frame: params.frame !== false && params.frame !== 0,
    scale: clamp(params.scale ?? 1, 0.6, 1.8),
  };
  const S = Math.min(W, H), fx = ctx.focus.x * W, fy = ctx.focus.y * H;

  // ---- the type zones in px, and the room the object has
  const quiet = (ctx.quiet || []).map(([x0, y0, x1, y1]) => ({ x0: x0 * W, y0: y0 * H, x1: x1 * W, y1: y1 * H, strip: x0 <= 0.02 && x1 >= 0.98 }));
  const rectDist = (q, x, y) => Math.hypot(Math.max(q.x0 - x, 0, x - q.x1), Math.max(q.y0 - y, 0, y - q.y1));
  const inset = 0.032 * S;                                   // the plate-mark frame sits this far inside the sheet
  const [ax0, ay0, ax1, ay1] = ctx.artRect || [0, 0, 1, 1];
  let R = 0.5 * Math.min((ctx.artSize ?? 0.7) * S, (ax1 - ax0) * W * 0.96, (ay1 - ay0) * H * 0.96);
  for (const q of quiet) R = Math.min(R, rectDist(q, fx, fy) - (q.strip ? 0.025 : 0.05) * S);
  const edge = inset + 0.05 * S;                              // … and the object keeps this far from the sheet's edge
  R = Math.min(R, fx - edge, W - fx - edge, fy - edge, H - fy - edge);
  R = Math.max(R, 0.07 * S);                                   // a small seal is still a seal; it never grows back under the copy

  // ---- heights. 0 = the untouched sheet, +1 / -1 = the most a die raises or sinks it; drawn as grey.
  const G = (h) => { const v = Math.round(clamp(128 + 127 * h, 0, 255)); return `rgb(${v},${v},${v})`; };
  const base = P.frame ? -0.22 : 0;                          // inside the plate mark the whole panel is pressed a little

  // ---- monogram: which characters, in which face
  const text = Array.from(String(params.text ?? 'A').trim() || 'A').filter((c) => c.trim());
  const isCJK = (c) => c.codePointAt(0) >= 0x1100;
  const want = [1, 2].includes(Number(params.letters)) ? Number(params.letters) : (isCJK(text[0]) ? 1 : 2);   // auto: one Hangul syllable, two Latin letters
  const mono = text.slice(0, want).join('');
  const face = FACES[params.font] ?? FACES.serif;
  if (motif === 'monogram') await loadFonts(face, mono);

  // ---- what the seed decides when the draft does not: plate shape, repeat, accent, the seal's beads and leaves
  const plate = ['circle', 'rect'].includes(params.plate) ? params.plate : (rng() < 0.62 ? 'circle' : 'rect');
  const repeat = ['scallop', 'wave', 'quilt'].includes(params.repeat) ? params.repeat : rng.pick(['scallop', 'wave', 'quilt']);
  const accent = ['disc', 'bar', 'none'].includes(params.accent) ? params.accent : (rng() < 0.6 ? 'disc' : 'bar');
  const ph = [rng() * TAU, rng() * TAU];                                        // phases of the waves
  const seal = { bold: rng() < 0.5, pairs: rng.int(8, 10), ring: ['disc', 'ring'].includes(params.centre) ? params.centre === 'ring' : rng() < 0.35 };

  // the foil's band of light is anchored on the focus; this is the size of the foil element (px)
  let foilR = R;

  /** Everything is drawn twice over: heights on gH, the foil mask on gF. */
  const paint = (gH, gF) => {
    gH.fillStyle = G(0); gH.fillRect(0, 0, W, H);
    gF.fillStyle = '#000'; gF.fillRect(0, 0, W, H);
    gH.lineJoin = gF.lineJoin = 'round'; gH.lineCap = gF.lineCap = 'round';

    const fill = (path, h) => { path(gH); gH.fillStyle = G(h); gH.fill(); };
    const stroke = (path, h, lw) => { path(gH); gH.strokeStyle = G(h); gH.lineWidth = lw; gH.stroke(); };
    /** A foil shape: stamped metal on the mask, and pressed a little into the sheet. */
    const foil = (path, h, lw = 0) => {
      if (!P.foil) return;
      for (const [g, style] of [[gH, G(h)], [gF, '#fff']]) {
        path(g);
        if (lw) { g.strokeStyle = style; g.lineWidth = lw; g.stroke(); } else { g.fillStyle = style; g.fill(); }
      }
    };
    const circle = (cx, cy, r) => (g) => { g.beginPath(); g.arc(cx, cy, Math.max(0.1, r), 0, TAU); };
    const rrect = (x0, y0, x1, y1, r) => (g) => { g.beginPath(); g.roundRect(x0, y0, x1 - x0, y1 - y0, Math.max(0, r)); };

    // ---- the plate mark: the whole panel inside the margin is sunk by a hair, as on a plate-sunk card
    if (P.frame) fill(rrect(inset, inset, W - inset, H - inset, 0.7 * u), base);

    if (motif === 'monogram') {
      // ---- a sunk plate, the characters raised out of it, a foil hairline round the plate
      const isRect = plate === 'rect';
      const two = Array.from(mono).length > 1;
      // plate outline grown by `d` px: a circle, or a rounded rectangle whose proportion follows the letters
      const kw = two ? 0.98 : 0.8, kh = two ? 0.74 : 0.98;
      if (isRect) {
        // a rectangle reaches past the clear circle at its corners: draw it in until it is clear of the type and the plate mark
        const fits = (r) => {
          const hw = (kw + 0.075) * r + 0.035 * S, hh = (kh + 0.075) * r + 0.035 * S;
          return fx - hw > inset && fx + hw < W - inset && fy - hh > inset && fy + hh < H - inset
            && quiet.every((q) => fx + hw < q.x0 || fx - hw > q.x1 || fy + hh < q.y0 || fy - hh > q.y1);
        };
        while (R > 0.07 * S && !fits(R)) R *= 0.97;
      }
      const pw = kw * R, phh = kh * R, rc = 0.06 * R, Rp = 0.9 * R, gap = 0.075 * R;
      const outline = (d) => (isRect ? rrect(fx - pw - d, fy - phh - d, fx + pw + d, fy + phh + d, rc + d) : circle(fx, fy, Rp + d));
      foil(outline(gap), base - 0.22, 0.5 * u);
      fill(outline(0), base - 0.6);
      stroke(outline(-0.045 * R), base - 0.2, 0.3 * u);                      // a fine raised rule just inside the plate: a stepped edge
      // the characters: set from a real face, fitted to the plate, their ink box centred on it
      const font = (px) => `${face.weight} ${px}px ${face.family}`;
      gH.font = font(1000); gH.textBaseline = 'alphabetic'; gH.textAlign = 'left';
      if (two) gH.letterSpacing = '-18px';
      const m = gH.measureText(mono), bl = m.actualBoundingBoxLeft, br = m.actualBoundingBoxRight, ba = m.actualBoundingBoxAscent, bd = m.actualBoundingBoxDescent;
      const bw = Math.max(1, bl + br), bh = Math.max(1, ba + bd);
      const s = isRect
        ? Math.min((2 * pw - 0.5 * R) / bw, (2 * phh - 0.46 * R) / bh)
        : Math.min((1.3 * Rp) / bh, (1.5 * Rp) / bw, (1.64 * Rp) / Math.hypot(bw, bh));
      gH.save(); gH.translate(fx, fy); gH.scale(s, s);
      gH.fillStyle = G(base + 0.5); gH.fillText(mono, -(br - bl) / 2, (ba - bd) / 2);
      gH.restore(); gH.letterSpacing = '0px';
      foilR = isRect ? Math.hypot(pw, phh) : Rp + gap;
    } else if (motif === 'crest') {
      // ---- a round seal, from the rim inwards: raised rim, a channel of beads, a rule, a wreath of
      // leaves laid along the circle, and a plain centre. The foil is either a disc in that centre or a
      // hairline round it. The seed chooses bold or fine beads and how many leaves.
      fill(circle(fx, fy, R), base + 0.45);                                   // rim
      fill(circle(fx, fy, 0.955 * R), base - 0.4);                            // bead channel
      const small = R < 0.17 * S, bold = seal.bold || small;                  // a small seal keeps to bold beads and few leaves
      const rb = (bold ? 0.034 : 0.026) * R, nb = Math.round((TAU * 0.88 * R) / (rb * (bold ? 2.85 : 3.05)));
      for (let i = 0; i < nb; i++) {
        const a = (i / nb) * TAU, bx = fx + 0.88 * R * Math.cos(a), by = fy + 0.88 * R * Math.sin(a);
        const gr = gH.createRadialGradient(bx, by, 0, bx, by, rb);            // each bead a small dome
        gr.addColorStop(0, G(base + 0.6)); gr.addColorStop(0.6, G(base + 0.35)); gr.addColorStop(1, G(base - 0.25));
        gH.fillStyle = gr; gH.beginPath(); gH.arc(bx, by, rb, 0, TAU); gH.fill();
      }
      fill(circle(fx, fy, 0.8 * R), base + 0.45);                             // rule
      fill(circle(fx, fy, 0.78 * R), base - 0.25);                            // wreath field
      // the wreath: two sprays that start together at the foot and leave a gap at the head. Every leaf
      // lies close to the circle (never along a radius), in pairs either side of a fine stem.
      const pairs = small ? 7 : seal.pairs, rw = 0.58 * R, ll = (1.8 / pairs) * R, lwid = 0.32 * ll;
      const leaf = (x, y, ang) => {
        gH.save(); gH.translate(x, y); gH.rotate(ang);
        gH.beginPath(); gH.moveTo(0, 0); gH.quadraticCurveTo(ll * 0.42, -lwid, ll, 0); gH.quadraticCurveTo(ll * 0.42, lwid, 0, 0);
        gH.fillStyle = G(base + 0.5); gH.fill();
        gH.beginPath(); gH.moveTo(ll * 0.1, 0); gH.lineTo(ll * 0.86, 0); gH.strokeStyle = G(base + 0.12); gH.lineWidth = 0.14 * u; gH.stroke();   // midrib
        gH.restore();
      };
      for (const side of [-1, 1]) {
        const a0 = Math.PI / 2 + side * 0.05, a1 = Math.PI / 2 + side * (Math.PI - 0.34);  // foot → head, on its side of the seal
        gH.beginPath(); gH.arc(fx, fy, rw, Math.min(a0, a1), Math.max(a0, a1)); gH.strokeStyle = G(base + 0.3); gH.lineWidth = 0.22 * u; gH.stroke();
        for (let k = 0; k < pairs; k++) {
          const a = a0 + ((a1 - a0) * (k + 0.35)) / pairs, tx = -Math.sin(a) * side, ty = Math.cos(a) * side, tang = Math.atan2(ty, tx);
          const x = fx + rw * Math.cos(a), y = fy + rw * Math.sin(a);
          leaf(x, y, tang - side * 0.5);                                       // outer leaf
          leaf(x, y, tang + side * 0.5);                                       // inner leaf
        }
        const at = a1, tx = -Math.sin(at) * side, ty = Math.cos(at) * side;
        leaf(fx + rw * Math.cos(at), fy + rw * Math.sin(at), Math.atan2(ty, tx));   // one leaf closes the spray
      }
      if (seal.ring && P.foil) {
        foil(circle(fx, fy, 0.375 * R), base - 0.45, 0.5 * u);                // a foil hairline round a plain sunk centre
        fill(circle(fx, fy, 0.33 * R), base - 0.5);
        foilR = 0.375 * R;
      } else {
        fill(circle(fx, fy, 0.355 * R), base + 0.45);                         // rule
        fill(circle(fx, fy, 0.335 * R), base - 0.45);                         // centre plate
        foil(circle(fx, fy, 0.17 * R), base - 0.62);                          // the foil disc
        foilR = 0.17 * R;
      }
    } else {
      // ---- an all-over repeat pressed into the art side of the panel. Its depth dies away towards the
      // copy cell by cell, so the pattern dissolves into flat paper instead of ending at an edge.
      const rd = clamp(0.15 * R, 0.036 * S, 0.062 * S);                       // the foil accent
      const bar = accent === 'bar';
      // The field is the layout's art rectangle. A side that reaches the edge of the sheet stays open (the
      // pattern runs to the plate mark); a side that faces copy fades over a long way, any other side briefly.
      const X0 = ax0 * W, X1 = ax1 * W, Y0 = ay0 * H, Y1 = ay1 * H, near = inset + 0.07 * S;
      const long = clamp(0.3 * P.scale, 0.2, 0.4) * S, brief = 0.09 * S;
      let barL = clamp(0.3 * (X1 - X0), 2.4 * rd, 0.3 * S); const barW = 0.3 * u;   // the bar is a slim rule: half length, half thickness
      const faces = (side) => quiet.some((q) => !q.strip && (
        side === 'l' ? q.x1 <= X0 + 0.06 * S && q.y1 > Y0 && q.y0 < Y1 : side === 'r' ? q.x0 >= X1 - 0.06 * S && q.y1 > Y0 && q.y0 < Y1
          : side === 't' ? q.y1 <= Y0 + 0.06 * S && q.x1 > X0 && q.x0 < X1 : q.y0 >= Y1 - 0.06 * S && q.x1 > X0 && q.x0 < X1));
      const fade = (side, open, room) => (open ? 0 : Math.min(faces(side) ? long : brief, 0.48 * room));
      const fl = fade('l', X0 <= near, X1 - X0), fr = fade('r', X1 >= W - near, X1 - X0), ft = fade('t', Y0 <= near, Y1 - Y0), fb = fade('b', Y1 >= H - near, Y1 - Y0);
      const amp = (x, y) => {
        let a = 1;
        if (fl) a *= sstep(0, fl, x - X0); if (fr) a *= sstep(0, fr, X1 - x);
        if (ft) a *= sstep(0, ft, y - Y0); if (fb) a *= sstep(0, fb, Y1 - y);
        for (const q of quiet) a = Math.min(a, sstep(0.03 * S, (q.strip ? 0.09 : 0.2) * S, rectDist(q, x, y)));   // never under type, whatever the rectangle says
        if (P.frame) a *= sstep(-0.004 * S, 0.02 * S, Math.min(x - inset, W - inset - x, y - inset, H - inset - y));
        return (0.23 * a) / (1 - 0.77 * a);            // the light answers shallow relief strongly: this makes the fade look even
      };
      while (barL > 2.4 * rd && Math.min(amp(fx - barL, fy), amp(fx + barL, fy)) < 0.14) barL *= 0.95;   // the rule ends over the pattern, not out on the flat paper
      gH.save();
      if (P.frame) { rrect(inset, inset, W - inset, H - inset, 0.7 * u)(gH); gH.clip(); }
      if (repeat === 'scallop') {
        // fish scales: rows of discs, each row overlapping the one below; a scale dips at its heart and
        // rises to its rim, which drops sharply onto the next row
        const w = 5 * u * P.scale, r = w / 2, dy = r * 0.9;
        for (let j = Math.ceil(H / dy) + 2; j >= -2; j--) {
          const cy = j * dy, off = (j & 1) ? 0.5 : 0;
          for (let i = -1; i <= Math.ceil(W / w) + 1; i++) {
            const cx = (i + off) * w, a = amp(cx, cy + r * 0.5);
            if (a < 0.004) continue;
            const gr = gH.createRadialGradient(cx, cy, 0, cx, cy, r);
            gr.addColorStop(0, G(base - 0.24 * a)); gr.addColorStop(0.55, G(base - 0.07 * a)); gr.addColorStop(1, G(base + 0.4 * a));
            gH.fillStyle = gr; gH.beginPath(); gH.arc(cx, cy, r, 0, TAU); gH.fill();
          }
        }
      } else if (repeat === 'wave') {
        // fine parallel waves: raised lines that swell and drift a little from one to the next
        const pitch = 1.9 * u * P.scale, lw = pitch * 0.46, A = 1.25 * u * P.scale, lam = 19 * u * P.scale, step = Math.max(2, 0.4 * u);
        for (let j = -3; j < Math.ceil(H / pitch) + 3; j++) {
          let prev = null, run = -1;
          for (let x = -lw; x <= W + lw + step; x += step) {
            const y = j * pitch + A * Math.sin((x / lam) * TAU + ph[0] + j * 0.19) + 0.4 * A * Math.sin((x / (lam * 0.41)) * TAU + ph[1] - j * 0.11);
            const a = Math.round(amp(x, y) * 160) / 160;
            if (a !== run) {                                                  // a new run of the same depth
              if (run > 0) { gH.lineTo(x, y); gH.stroke(); }
              run = a; gH.beginPath(); gH.strokeStyle = G(base + 0.5 * a); gH.lineWidth = lw; if (prev) gH.moveTo(prev[0], prev[1]); else gH.moveTo(x, y);
            }
            gH.lineTo(x, y); prev = [x, y];
          }
          if (run > 0) gH.stroke();
        }
      } else {
        // diamond quilting: tall pillows between seams, a small sunk button where four meet
        const qx = 2.7 * u * P.scale, qy = 4.7 * u * P.scale, seam = 0.14 * u;
        for (let j = -1; j <= Math.ceil(H / qy) + 1; j++) for (let i = -1; i <= Math.ceil(W / (2 * qx)) + 1; i++) {
          const cx = i * 2 * qx + ((j & 1) ? qx : 0), cy = j * qy, a = amp(cx, cy);
          if (a < 0.004) continue;
          gH.save(); gH.translate(cx, cy); gH.scale(1, qy / qx);
          const gr = gH.createRadialGradient(0, 0, 0, 0, 0, qx * 0.86);        // a dome that is nearly flat on top and falls away at the seams
          gr.addColorStop(0, G(base + 0.42 * a)); gr.addColorStop(0.45, G(base + 0.37 * a)); gr.addColorStop(0.75, G(base + 0.17 * a)); gr.addColorStop(1, G(base - 0.17 * a));
          const e = qx - seam;
          gH.beginPath(); gH.moveTo(-e, 0); gH.lineTo(0, -e); gH.lineTo(e, 0); gH.lineTo(0, e); gH.closePath(); gH.fillStyle = gr; gH.fill();
          gH.restore();
        }
        // the seams themselves, stitched a little deeper: a seam that runs along the light shows no lit side,
        // only this darker furrow, and without it the diamonds would read as stripes
        gH.lineWidth = 0.3 * u;
        for (let j = -1; j <= Math.ceil(H / qy) + 1; j++) for (let i = -1; i <= Math.ceil(W / (2 * qx)) + 1; i++) {
          const cx = i * 2 * qx + ((j & 1) ? qx : 0), cy = j * qy, a = amp(cx, cy + qy * 0.5);
          if (a < 0.004) continue;
          gH.strokeStyle = G(base - 0.42 * a); gH.beginPath(); gH.moveTo(cx - qx, cy); gH.lineTo(cx, cy + qy); gH.lineTo(cx + qx, cy); gH.stroke();
        }
        for (let j = -1; j <= Math.ceil(H / qy) + 1; j++) for (let i = -1; i <= Math.ceil(W / (2 * qx)) + 1; i++) {
          const cx = i * 2 * qx + ((j & 1) ? 0 : qx), cy = j * qy, a = amp(cx, cy);
          if (a < 0.02) continue;
          gH.fillStyle = G(base - 0.5 * a); gH.beginPath(); gH.arc(cx, cy, 0.34 * u * P.scale, 0, TAU); gH.fill();
        }
      }
      gH.restore();
      // the accent: foil stamped straight onto the pattern, which the stamp presses flat, with a hair of margin
      if (accent !== 'none' && P.foil) {
        const m = bar ? 0.22 * u : 0.1 * rd;
        if (bar) { fill(rrect(fx - barL - m, fy - barW - m, fx + barL + m, fy + barW + m, barW + m), base - 0.3); foil(rrect(fx - barL, fy - barW, fx + barL, fy + barW, barW), base - 0.55); }
        else { fill(circle(fx, fy, rd + m), base - 0.3); foil(circle(fx, fy, rd), base - 0.55); }
        foilR = bar ? barL : rd;
      }
    }
  };

  let texF;
  const texH = canvasTexture(W, H, (gH) => { texF = canvasTexture(W, H, (gF) => paint(gH, gF), { srgb: false }); }, { srgb: false });

  // ---- GPU: blur the height map into float textures
  const rtOpts = { type: THREE.HalfFloatType, format: THREE.RedFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };   // one channel: height
  const rtA = new THREE.WebGLRenderTarget(W, H, rtOpts), rtB = new THREE.WebGLRenderTarget(W, H, rtOpts);
  const w4 = Math.max(2, Math.round(W / 4)), h4 = Math.max(2, Math.round(H / 4));
  const rtC = new THREE.WebGLRenderTarget(w4, h4, rtOpts), rtD = new THREE.WebGLRenderTarget(w4, h4, rtOpts);
  // separable gaussian of the red channel; neighbouring texels are read in pairs with one bilinear tap
  const BLUR = /* glsl */`
    precision highp float;
    varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uStep; uniform float uSigma;
    void main(){
      float s2 = uSigma * uSigma, sum = texture2D(tSrc, vUv).r, wsum = 1.0;
      for (int i = 1; i <= 39; i += 2) {
        float a = float(i), b = a + 1.0;
        if (a > 3.0 * uSigma + 1.0) break;
        float wa = exp(-0.5 * a * a / s2), wb = exp(-0.5 * b * b / s2), w = wa + wb, o = (a * wa + b * wb) / w;
        sum += w * (texture2D(tSrc, vUv + uStep * o).r + texture2D(tSrc, vUv - uStep * o).r); wsum += 2.0 * w;
      }
      gl_FragColor = vec4(sum / wsum, 0.0, 0.0, 1.0);
    }`;
  const pass = (src, dst, step, sigma) => {
    const sc = new THREE.Scene(); sc.add(backgroundQuad(BLUR, { tSrc: { value: src }, uStep: { value: new THREE.Vector2(...step) }, uSigma: { value: sigma } }));
    renderer.setRenderTarget(dst); renderer.render(sc, camera);
  };
  const sigma = clamp(0.13 * u * P.soft, 1.1, 12);              // the rounded shoulder of the die
  pass(texH, rtA, [1 / W, 0], sigma); pass(rtA.texture, rtB, [0, 1 / H], sigma);
  const sAO = clamp((1.25 * u) / 4, 1, 12);                     // occlusion: the same height, blurred widely at quarter size
  pass(rtB.texture, rtC, [0.5 / w4, 0], 0.7);                   // (step down to quarter size)
  pass(rtC.texture, rtD, [1 / w4, 0], sAO); pass(rtD.texture, rtC, [0, 1 / h4], sAO);
  renderer.setRenderTarget(null);

  // ---- shade the sheet. Colour is worked in OKLab (lightness up and down, chroma a touch richer in shade),
  // the light comes from the upper left, and every length is in units of 1 % of the short side.
  const paper = oklabVec(palette.bg), dark = sstep(0.72, 0.42, paper.x);
  scene.add(backgroundQuad(/* glsl */`
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D tH, tAO, tFoil; uniform vec2 uRes, uLight, uFoilC; uniform float uUnit, uRelief, uGrain, uDark, uFoilR, uBase;
    uniform vec3 uPaper, uFoil;
    ${GLSL_NOISE_KIT}
    ${GLSL_OKLAB}
    // height in die units: 0 = the sheet, ±1 = fully raised / sunk
    float hgt(vec2 fp){ return (texture2D(tH, fp / uRes).r - 0.50196) * 2.0; }
    void main(){
      vec2 fp = gl_FragCoord.xy, q = fp / uUnit;                    // q: in units of 1 % of the short side
      float h = hgt(fp), e = max(1.0, 0.08 * uUnit);
      vec2 g = vec2(hgt(fp + vec2(e, 0.0)) - hgt(fp - vec2(e, 0.0)), hgt(fp + vec2(0.0, e)) - hgt(fp - vec2(0.0, e))) * (uUnit / (2.0 * e));
      float s = -dot(g, uLight);                                    // > 0: the slope faces the light
      float k = s / (abs(s) + 0.45);                                // soft shoulder: gentle domes still read, steep walls do not burn
      float hi = max(k, 0.0), lo = max(-k, 0.0);
      // a short, soft shadow thrown by whatever stands higher on the light's side
      float thrown = 0.0;
      for (int i = 1; i <= 6; i++) { float t = float(i); thrown += max(hgt(fp + uLight * t * 0.17 * uUnit) - h - 0.035 * t, 0.0) * (1.0 - t / 7.0); }
      thrown = clamp(thrown * 0.55, 0.0, 1.0);
      float wide = (texture2D(tAO, vUv).r - 0.50196) * 2.0;
      float ao = clamp((wide - h) * 1.8, 0.0, 1.0);                 // walls close by keep some of the sky off a sunk floor
      float sunk = clamp((uBase - h) * 2.0, 0.0, 1.0);              // how far below the panel the die has pressed

      // paper
      float tooth = noise2(q * 7.3) * 0.62 + noise2(q * 17.0 + 5.0) * 0.38;
      float toothLit = tooth - (noise2((q + uLight * 0.07) * 7.3) * 0.62 + noise2((q + uLight * 0.07) * 17.0 + 5.0) * 0.38);
      float cloud = fbm2(q * 0.23 + 3.0, 3);
      float grain = (0.014 * toothLit + 0.005 * tooth + 0.006 * cloud + (hash21(fp) - 0.5) * 0.008) * uGrain * mix(1.0, 0.35, sunk);   // the die irons the tooth out
      // Shade, thrown shadow, occlusion and the darker floor add up, then roll off towards a limit, so the deepest
      // corner stays within about twelve points of the paper's lightness: pressed paper, not carved stone.
      float lim = mix(0.125, 0.085, uDark) * uRelief;
      float down = uRelief * (mix(0.115, 0.085, uDark) * lo + mix(0.1, 0.08, uDark) * thrown + mix(0.085, 0.065, uDark) * ao) + mix(0.022, 0.016, uDark) * sunk;
      float dL = uRelief * mix(0.05, 0.128, uDark) * hi - lim * (1.0 - exp(-down / lim));
      float fall = dot(vUv - 0.5, uLight) * 0.014;                  // the light is a little stronger on its own side of the sheet
      vec3 lab = uPaper;
      float shade = clamp(-dL * 6.0, 0.0, 1.0);
      lab.x += dL + grain * mix(1.0, 0.7, uDark) + fall;
      lab.yz *= 1.0 + 0.35 * shade - 0.5 * hi * (1.0 - uDark);      // shade a touch richer, highlights whiter

      // foil
      float f = texture2D(tFoil, vUv).r;
      if (f > 0.001) {
        vec2 d = (fp - uFoilC) / uFoilR; float t = dot(d, uLight);
        t += 0.16 * fbm2(q * 0.3 + 9.0, 2);                                                      // the sheet is never quite flat: the reflection wanders
        float bt = (t - 0.06) / 0.46, band = exp(-bt * bt);                                          // one broad band of light across the middle: flat metal, not a ball
        vec2 across = vec2(-uLight.y, uLight.x);
        float streak = fbm2(vec2(dot(q, across) * 0.45, dot(q, uLight) * 30.0), 3);              // brushed along the band
        vec3 fl = uFoil;
        fl.x += -0.065 + 0.21 * band + 0.03 * streak * (0.4 + band) + uRelief * (0.16 * hi - 0.14 * lo - 0.1 * thrown);
        fl.x += (0.05 * toothLit + (hash21(fp + 17.0) - 0.5) * 0.012) * uGrain;                 // the paper's tooth shows through the metal
        fl.yz *= 1.12 - 0.42 * band + 0.25 * lo;
        lab = mix(lab, fl, f);
      }
      gl_FragColor = vec4(max(oklabToLinear(lab), 0.0), 1.0);
      #include <colorspace_fragment>
    }`, {
    tH: { value: rtB.texture }, tAO: { value: rtC.texture }, tFoil: { value: texF }, uRes: { value: new THREE.Vector2(W, H) },
    uLight: { value: new THREE.Vector2(-0.8, 0.6).normalize() }, uFoilC: { value: new THREE.Vector2(fx, H - fy) }, uFoilR: { value: foilR },
    uUnit: { value: u }, uRelief: { value: P.relief }, uGrain: { value: P.grain }, uDark: { value: dark }, uBase: { value: base },
    uPaper: { value: paper }, uFoil: { value: oklabVec(palette.colors?.[0] ?? palette.accentOriginal ?? palette.accent) },
  }));

  ctx.frame({ radius: 1, fov: 30, dir: [0, 0, 1] });     // nothing three-dimensional to place; kept so the scene obeys the same contract as the others
  return makeComposer(ctx, { samples: 0, display: [finishPassShader(ctx, { vignette: 0.05, center: ctx.focus, dither: true })] });
}
