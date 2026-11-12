// Glyph — typographic art. The picture is made of letterforms set in the bundled faces: one giant
// character cropped by the edges of its column with a second one overprinted on it, a specimen grid
// of repeated characters, or a stack of outline echoes behind a solid letter. Everything is set with
// the 2D canvas text engine (so Hangul, Latin and symbols come out of real fonts) and then printed:
// the solid ink gets a faint letterpress mottle and the paper a fine tooth.
//
// The characters come from `text` (default "A가&"; the art layer does not see the poster copy, so
// pass e.g. the first syllables of the title). Free space for the letters is what remains of the sheet
// once the copy rectangles (ctx.quiet) are taken away — the letters are cropped by that column, never
// set under the type.
//
// motif: giant | grid | echo
// Palette: bg = paper · colors[0] = main ink · colors[1] = second ink · colors[2] = overprint / third ink
//          accent = details (specimen marks, a few grid cells)
import { backgroundQuad, canvasTexture, GLSL_NOISE_KIT, GLSL_DITHER } from '/skill/assets/web/scene-lib.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

const FACES = {
  black: { family: '"Black Han Sans", "Pretendard", sans-serif', weight: '400', load: ['400 100px "Black Han Sans"', '900 100px "Pretendard"'] },
  sans: { family: '"Pretendard", sans-serif', weight: '900', load: ['900 100px "Pretendard"'] },
  serif: { family: '"Hahmlet", serif', weight: '900', load: ['900 100px "Hahmlet"'] },
  display: { family: '"Anton", "Black Han Sans", sans-serif', weight: '400', load: ['400 100px "Anton"', '400 100px "Black Han Sans"'] },
  mono: { family: '"JetBrains Mono", "Pretendard", monospace', weight: '500', load: ['500 100px "JetBrains Mono"'] },
};

/** Bring in the page fonts (the art page does not load them by itself) and wait for the subsets `text` needs. */
async function loadFonts(text) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  if (!document.querySelector('link[data-glyph-fonts]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/skill/assets/fonts/fonts.css'; l.dataset.glyphFonts = '1';
    const done = new Promise((r) => { l.onload = r; l.onerror = r; });
    document.head.appendChild(l);
    await Promise.race([done, wait(5000)]);
  }
  const specs = Object.values(FACES).flatMap((f) => f.load);
  const sample = text + 'U+0123456789ABCDEF·—/';
  try { await Promise.race([Promise.all(specs.map((s) => document.fonts.load(s, sample).catch(() => null))), wait(8000)]); } catch { /* fall back to whatever loaded */ }
}

export default async function build(ctx) {
  const { THREE, scene, palette, params, rng, width: W, height: H, unit } = ctx;
  const motif = ['giant', 'grid', 'echo'].includes(params.motif) ? params.motif : 'giant';
  const text = String(params.text ?? 'A가&').trim() || 'A가&';
  const chars = Array.from(text).filter((c) => c.trim());
  const faceId = FACES[params.font] ? params.font : (motif === 'grid' ? 'black' : motif === 'echo' ? 'black' : 'black');
  const face = FACES[faceId];
  const P = { print: clamp(params.print ?? 1, 0, 2), marks: params.marks !== false && params.marks !== 0, echoes: clamp(Math.round(params.echoes ?? 9), 3, 24) };
  await loadFonts(chars.join(''));

  const cols = palette.colors?.length ? palette.colors : [palette.ink];
  const col = (i) => cols[i % cols.length];
  const acc = palette.accentOriginal ?? palette.accent;
  const S = Math.min(W, H);

  // ---- free space: the sheet minus the copy rectangles (each cut away by the one side that keeps most room)
  const gut = 0.03 * S;
  const quiet = (ctx.quiet || []).map(([x0, y0, x1, y1]) => [x0 * W - gut, y0 * H - gut, x1 * W + gut, y1 * H + gut]);
  const fx = ctx.focus.x * W, fy = ctx.focus.y * H;
  let R = [0, 0, W, H];
  for (const q of quiet) {
    if (q[2] <= R[0] || q[0] >= R[2] || q[3] <= R[1] || q[1] >= R[3]) continue;
    const cands = [[R[0], R[1], Math.min(R[2], q[0]), R[3]], [Math.max(R[0], q[2]), R[1], R[2], R[3]], [R[0], R[1], R[2], Math.min(R[3], q[1])], [R[0], Math.max(R[1], q[3]), R[2], R[3]]]
      .filter((c) => c[2] - c[0] > S * 0.05 && c[3] - c[1] > S * 0.05);
    if (!cands.length) continue;
    const area = (c) => (c[2] - c[0]) * (c[3] - c[1]) * (fx >= c[0] && fx <= c[2] && fy >= c[1] && fy <= c[3] ? 1.25 : 1);
    R = cands.sort((a, b) => area(b) - area(a))[0];
  }
  const [rx0, ry0, rx1, ry1] = R, rw = rx1 - rx0, rh = ry1 - ry0;
  const outer = { l: rx0 <= 1, r: rx1 >= W - 1, t: ry0 <= 1, b: ry1 >= H - 1 };
  // the side of the sheet the copy is on, as a unit vector from the copy towards the free space
  const c0 = ctx.quiet?.[0] ?? [0, 0, 0, 0];
  let ax = (rx0 + rx1) / 2 - ((c0[0] + c0[2]) / 2) * W, ay = (ry0 + ry1) / 2 - ((c0[1] + c0[3]) / 2) * H;
  { const l = Math.hypot(ax, ay) || 1; ax /= l; ay /= l; }

  const font = (px, f = face) => `${f.weight} ${px}px ${f.family}`;
  /** ink box of one character at 1000 px */
  const inkBox = (ch, f = face) => {
    const g = document.createElement('canvas').getContext('2d'); g.font = font(1000, f);
    const m = g.measureText(ch);
    const l = m.actualBoundingBoxLeft, r = m.actualBoundingBoxRight, a = m.actualBoundingBoxAscent, d = m.actualBoundingBoxDescent;
    return { l, r, a, d, w: l + r, h: a + d };
  };
  /** draw `ch` with the centre of its ink box at (cx, cy), ink height `h` */
  const setChar = (g, ch, cx, cy, h, { f = face, fill = null, stroke = null, lw = 1, rot = 0 } = {}) => {
    const b = inkBox(ch, f), s = h / Math.max(1, b.h);
    g.save(); g.translate(cx, cy); g.rotate(rot); g.scale(s, s);
    g.font = font(1000, f); g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    const ox = -(b.r - b.l) / 2, oy = (b.a - b.d) / 2;           // origin so that the ink box is centred
    if (fill) { g.fillStyle = fill; g.fillText(ch, ox, oy); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw / s; g.lineJoin = 'round'; g.strokeText(ch, ox, oy); }
    g.restore();
    return { w: b.w * s, h: b.h * s };
  };
  const layer = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const mono = (px) => font(px, FACES.mono);

  const tex = canvasTexture(W, H, (g) => {
    g.fillStyle = palette.bg; g.fillRect(0, 0, W, H);
    g.save(); g.beginPath(); g.rect(rx0, ry0, rw, rh); g.clip();

    if (motif === 'giant') {
      // one character set so large that only the column holds it; a second overprinted on its outer corner
      const a = chars[0], b = chars[1] ?? chars[0];
      const bx = inkBox(a), asp = bx.w / Math.max(1, bx.h);
      const bothInnerV = !outer.t && !outer.b, bothInnerH = !outer.l && !outer.r;
      let h = Math.max(rh * (bothInnerV ? 1.06 : 1.14), (rw * 1.02) / asp);
      h = Math.min(h, rh * (bothInnerV ? 1.12 : 1.9), (rw * 1.5) / asp);
      // a Latin capital survives a hard crop; a 한글 syllable (or any dense square character) does not, so it stays whole
      const dense = a.codePointAt(0) >= 0x1100;
      if (dense) h = Math.min(rh * 0.94, (rw * 0.96) / asp);
      const w = h * asp;
      // anchor the ink to the copy-side edges so the overflow runs off the sheet
      const place = (lo, hi, size, oLo, oHi) => (oLo && !oHi ? hi - size / 2 - S * 0.0 : !oLo && oHi ? lo + size / 2 : (lo + hi) / 2);
      const cx = dense ? (rx0 + rx1) / 2 : place(rx0, rx1, w, outer.l, outer.r), cy = dense ? (ry0 + ry1) / 2 : place(ry0, ry1, h, outer.t, outer.b);
      const A = layer(), B = layer();
      setChar(A.getContext('2d'), a, cx, cy, h, { fill: '#000' });
      // the second letter sits inside the column, low and towards the open side, overlapping the first
      const b2 = inkBox(b), asp2 = b2.w / Math.max(1, b2.h);
      const h2 = Math.min(rh * 0.6, (rw * 0.55) / asp2), w2 = h2 * asp2;
      const cx2 = clamp(lerp(rx0, rx1, 0.5 + ax * 0.22) + (Math.abs(ax) < 0.5 ? rw * 0.16 : 0), rx0 + w2 * 0.55, rx1 - w2 * 0.45);
      const cy2 = clamp(lerp(ry0, ry1, 0.5 + ay * 0.22) + (Math.abs(ay) < 0.5 ? rh * 0.14 : 0), ry0 + h2 * 0.55, ry1 - h2 * 0.5);
      setChar(B.getContext('2d'), b, cx2, cy2, h2, { fill: '#000' });
      const tint = (src, color) => { const c = layer(), t = c.getContext('2d'); t.drawImage(src, 0, 0); t.globalCompositeOperation = 'source-in'; t.fillStyle = color; t.fillRect(0, 0, W, H); return c; };
      g.drawImage(tint(A, col(0)), 0, 0);
      g.drawImage(tint(B, col(1)), 0, 0);
      // overprint: where the two letters cross, the third ink
      const O = layer(), o = O.getContext('2d'); o.drawImage(A, 0, 0); o.globalCompositeOperation = 'source-in'; o.drawImage(B, 0, 0);
      g.drawImage(tint(O, col(2)), 0, 0);
      // a hairline outline of the giant letter, slipped a little towards the free space
      const sh = S * 0.018;
      setChar(g, a, cx + ax * sh + sh * 0.6, cy + ay * sh + sh * 0.6, h, { stroke: col(cols.length > 2 ? 2 : 1), lw: unit * 0.16 });
      if (P.marks) {
        // specimen marks in the column's inner corner: code point, face, a measuring hairline
        const cp = 'U+' + a.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
        const name = { black: 'Black Han Sans', sans: 'Pretendard Black', serif: 'Hahmlet Black', display: 'Anton' }[faceId];
        const px = unit * 1.05, mx = outer.l && !outer.r ? rx1 - S * 0.04 : rx0 + S * 0.04, my = outer.t && !outer.b ? ry1 - S * 0.04 : ry0 + S * 0.05;
        g.font = mono(px); g.textAlign = outer.l && !outer.r ? 'right' : 'left'; g.textBaseline = 'middle';
        // a small plate under the label so it reads over the ink
        const lines = [`${cp}`, name, `${chars.length} / ${chars.join(' ')}`];
        const tw = Math.max(...lines.map((s) => g.measureText(s).width)) + px * 1.4, th = px * 1.6 * lines.length + px * 0.8;
        const left = g.textAlign === 'right' ? mx - tw + px * 0.7 : mx - px * 0.7, top = my - px * 1.2;
        g.fillStyle = palette.bg; g.fillRect(left, top, tw, th);
        g.fillStyle = acc; lines.forEach((s, i) => g.fillText(s, mx, my + i * px * 1.6));
        g.fillRect(left, top, tw, unit * 0.12);
      }
    } else if (motif === 'grid') {
      // a type-specimen sheet: the characters repeated cell by cell; cells that touch the copy are left empty
      const n = Math.max(3, Math.round(Math.max(W, H) / (S * 0.135)));
      const cell = Math.max(W, H) / n, nx = Math.ceil(W / cell), ny = Math.ceil(H / cell);
      // the grid is anchored to the free column, so whole rows and columns fill it
      const ox = rx0 - Math.ceil(rx0 / cell) * cell, oy = ry0 - Math.ceil(ry0 / cell) * cell;
      const nx2 = Math.ceil((W - ox) / cell), ny2 = Math.ceil((H - oy) / cell);
      g.restore(); g.save();
      const qPad = S * 0.012, qs = (ctx.quiet || []).map(([x0, y0, x1, y1]) => [x0 * W - qPad, y0 * H - qPad, x1 * W + qPad, y1 * H + qPad]);
      const blocked = (x0, y0, x1, y1) => qs.some((q) => x1 > q[0] && x0 < q[2] && y1 > q[1] && y0 < q[3]);
      const faces = [face, FACES.serif, FACES.sans, FACES.display];
      const used = new Set();
      // one hero: a 2×2 (or 3×3) block near the focus, if it fits
      const heroes = [];
      for (const k of [3, 2]) {
        let best = null;
        for (let j = 0; j <= ny2 - k; j++) for (let i = 0; i <= nx2 - k; i++) {
          const x0 = ox + i * cell, y0 = oy + j * cell;
          if (blocked(x0, y0, x0 + k * cell, y0 + k * cell)) continue;
          const d = Math.hypot(x0 + (k * cell) / 2 - fx, y0 + (k * cell) / 2 - fy);
          if (!best || d < best.d) best = { i, j, d };
        }
        if (best) { heroes.push({ ...best, k }); for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) used.add(`${best.i + a},${best.j + b}`); break; }
      }
      const lw = unit * 0.11;
      g.strokeStyle = col(1); g.globalAlpha = 0.55; g.lineWidth = lw;
      // hairline grid only where cells are drawn
      const inR = (i, j) => { const x = ox + (i + 0.5) * cell, y = oy + (j + 0.5) * cell; return x > rx0 && x < rx1 && y > ry0 && y < ry1; };
      const cellOK = (i, j) => inR(i, j) && !blocked(ox + i * cell, oy + j * cell, ox + (i + 1) * cell, oy + (j + 1) * cell);
      for (let j = 0; j < ny2; j++) for (let i = 0; i < nx2; i++) if (cellOK(i, j)) g.strokeRect(ox + i * cell, oy + j * cell, cell, cell);
      g.globalAlpha = 1;
      let idx = 0;
      for (let j = 0; j < ny2; j++) for (let i = 0; i < nx2; i++) {
        if (!cellOK(i, j) || used.has(`${i},${j}`)) continue;
        const ch = chars[(i + j * 2 + idx) % chars.length];
        const x0 = ox + i * cell, y0 = oy + j * cell, cx = x0 + cell / 2, cy = y0 + cell / 2;
        const r = rng();
        const f = faces[(i * 3 + j * 5 + Math.floor(r * 2)) % faces.length];
        const hh = cell * 0.6;
        if (r < 0.1) {                                                      // a filled cell with a knocked-out letter
          g.fillStyle = col(0); g.fillRect(x0, y0, cell, cell); setChar(g, ch, cx, cy, hh, { f, fill: palette.bg });
        } else if (r < 0.17) {
          g.fillStyle = acc; g.fillRect(x0, y0, cell, cell); setChar(g, ch, cx, cy, hh, { f, fill: col(0) });
        } else if (r < 0.42) {
          setChar(g, ch, cx, cy, hh, { f, stroke: col(0), lw: unit * 0.16 });
        } else if (r < 0.5) {
          setChar(g, ch, cx, cy, hh, { f, fill: col(2 % cols.length) });
        } else {
          setChar(g, ch, cx, cy, hh, { f, fill: col(0) });
        }
        if (P.marks && r > 0.93) { g.font = mono(cell * 0.07); g.fillStyle = col(1); g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText('U+' + ch.codePointAt(0).toString(16).toUpperCase(), x0 + cell * 0.06, y0 + cell * 0.06); }
        idx++;
      }
      for (const hcell of heroes) {
        const x0 = ox + hcell.i * cell, y0 = oy + hcell.j * cell, sz = hcell.k * cell;
        g.fillStyle = col(0); g.fillRect(x0, y0, sz, sz);
        const A = layer(), a = A.getContext('2d');
        setChar(a, chars[0], x0 + sz / 2, y0 + sz / 2, sz * 0.78, { fill: palette.bg });
        g.drawImage(A, 0, 0);
        if (P.marks) { g.font = mono(cell * 0.075); g.fillStyle = acc; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText('U+' + chars[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0'), x0 + cell * 0.07, y0 + cell * 0.07); }
      }
    } else {
      // echo: a solid letter in front of a run of outline echoes that step back and shrink towards the open side
      const a = chars[0], bx = inkBox(a), asp = bx.w / Math.max(1, bx.h), n = P.echoes;
      const step = S * 0.022, shrink = 0.03;
      const ex = ax * 0.75 + 0.35, ey = ay * 0.75 - 0.55;                    // echoes drift up and away from the copy
      const el = Math.hypot(ex, ey) || 1, dx = (ex / el) * step, dy = (ey / el) * step;
      // fit the whole stack into the column
      let h = Math.min((rh * 0.8), (rw * 0.8) / asp);
      const spanX = Math.abs(dx) * n, spanY = Math.abs(dy) * n;
      h = Math.min(h, (rh - spanY) * 0.86, ((rw - spanX) * 0.86) / asp);
      const cx = (rx0 + rx1) / 2 - (dx * n) / 2, cy = (ry0 + ry1) / 2 - (dy * n) / 2;
      for (let k = n; k >= 1; k--) {
        const t = k / n, hk = h * (1 - shrink * k * 0.35);
        const c = k % 3 === 0 ? col(1) : col(cols.length > 2 ? 2 : 1);
        g.globalAlpha = lerp(1, 0.45, t);
        // every third echo is a solid slab, the rest hairlines
        if (k % 3 === 0) { setChar(g, a, cx + dx * k, cy + dy * k, hk, { fill: c }); setChar(g, a, cx + dx * k, cy + dy * k, hk, { stroke: palette.bg, lw: unit * 0.35 }); }
        else setChar(g, a, cx + dx * k, cy + dy * k, hk, { stroke: c, lw: unit * 0.18 });
      }
      g.globalAlpha = 1;
      setChar(g, a, cx, cy, h, { fill: palette.bg });
      setChar(g, a, cx, cy, h, { fill: col(0) });
      // the other characters, small, as a caption line under the stack
      if (chars.length > 1 && P.marks) {
        const px = unit * 1.1; g.font = mono(px); g.fillStyle = acc; g.textAlign = 'center'; g.textBaseline = 'middle';
        const by = Math.min(ry1 - px * 1.6, cy + h / 2 + px * 2.6);
        g.fillText(chars.join('  ·  ') + '   —   U+' + a.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'), cx, by);
      }
    }
    g.restore();
  });

  scene.add(backgroundQuad(/* glsl */`
    precision highp float;
    uniform sampler2D uTex; uniform vec3 uBg; uniform float uPrint, uUnit, uDark; uniform vec2 uRes; varying vec2 vUv;
    ${GLSL_NOISE_KIT}
    ${GLSL_DITHER}
    void main(){
      vec3 c = texture2D(uTex, vUv).rgb;
      vec2 p = gl_FragCoord.xy / uUnit;                          // in units of 1 % of the short side
      float ink = smoothstep(0.02, 0.12, length(c - uBg));
      // letterpress: the ink film is a touch uneven and the paper bites through in a few specks
      float mott = fbm2(p * 0.35, 4) * 0.5 + noise2(p * 3.1) * 0.25;
      c = mix(c, c * (1.0 + 0.07 * mott), ink * uPrint);
      float speck = smoothstep(0.78, 0.95, noise2(p * 5.3) * 0.5 + fbm2(p * 1.2 + 7.0, 3) * 0.6 + 0.2);
      c = mix(c, uBg, ink * speck * 0.18 * uPrint);
      // paper tooth
      float tooth = (hash21(gl_FragCoord.xy) - 0.5) * 0.018 + fbm2(p * 0.6 + 3.0, 3) * 0.012;
      c += tooth * uPrint * (1.0 - 0.5 * ink) * mix(1.0, 0.4, uDark);
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
      gl_FragColor.rgb += ditherNoise(gl_FragCoord.xy);
    }`, {
    uTex: { value: tex }, uBg: { value: new THREE.Color(palette.bg) }, uPrint: { value: P.print }, uDark: { value: new THREE.Color(palette.bg).getHSL({}).l < 0.4 ? 1 : 0 }, uUnit: { value: unit }, uRes: { value: new THREE.Vector2(W, H) },
  }));

  ctx.frame({ radius: 1, fov: 30, dir: [0, 0, 1] });
}
