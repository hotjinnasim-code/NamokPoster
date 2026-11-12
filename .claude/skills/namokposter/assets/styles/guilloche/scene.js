// Guilloche — banknote and certificate engraving. Everything is drawn as hairlines of one even pen
// width, hundreds of them, in one or two inks: families of phase-shifted sine curves that braid into
// rope-like bands (ribbons), rings of interlaced lobed curves round a medallion, a lattice border
// running round the text panel, and a pale security underprint of fine waves over the whole sheet.
// The copy sits in a blank cartouche — a cleared panel edged with a double rule — exactly where a
// note leaves room for its lettering.
//
// motif: ribbon | medallion | frame
// Palette: bg = paper · colors[0] = first ink · colors[1] = second ink · colors[2] = underprint tint
//          ink / accent = type
import { backgroundQuad, canvasTexture, GLSL_NOISE_KIT, GLSL_DITHER } from '/skill/assets/web/scene-lib.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const TAU = Math.PI * 2;

export default function build(ctx) {
  const { THREE, scene, palette, params, rng, width: W, height: H, unit } = ctx;
  const motif = ['ribbon', 'medallion', 'frame'].includes(params.motif) ? params.motif : 'ribbon';
  const P = {
    density: clamp(params.density ?? 1, 0.5, 2), weight: clamp(params.weight ?? 1, 0.5, 2.5), inks: clamp(Math.round(params.inks ?? 2), 1, 2),
    underprint: clamp(params.underprint ?? 1, 0, 2), cartouche: params.cartouche !== false && params.cartouche !== 0,
  };
  const S = Math.min(W, H), fx = ctx.focus.x * W, fy = ctx.focus.y * H;
  const cols = palette.colors?.length ? palette.colors : [palette.ink];
  const ink1 = cols[0], ink2 = P.inks > 1 ? (cols[1] ?? cols[0]) : cols[0], tint = cols[2] ?? cols[1] ?? cols[0];
  const lw = Math.max(0.35, unit * 0.085 * P.weight);
  const [ax0, ay0, ax1, ay1] = ctx.artRect || [0, 0, 1, 1];
  const D = Math.min((ctx.artSize ?? 0.7) * S, (ax1 - ax0) * W * 0.96, (ay1 - ay0) * H * 0.96);
  const nLines = (n) => Math.max(6, Math.round(n * P.density));
  const ph0 = rng() * TAU;

  // the copy panel and the other type zones, in px
  const pad = S * 0.028;
  const quiet = (ctx.quiet || []).map(([x0, y0, x1, y1]) => ({ x0: x0 * W, y0: y0 * H, x1: x1 * W, y1: y1 * H, strip: x0 <= 0.02 && x1 >= 0.98 }));
  const copy = quiet[0];

  const tex = canvasTexture(W, H, (g) => {
    g.fillStyle = palette.bg; g.fillRect(0, 0, W, H);
    g.lineJoin = 'round'; g.lineCap = 'round';
    const poly = (pts, color, alpha = 0.92, w = lw) => {
      g.strokeStyle = color; g.globalAlpha = alpha; g.lineWidth = w; g.beginPath();
      for (let i = 0; i < pts.length; i += 2) (i ? g.lineTo(pts[i], pts[i + 1]) : g.moveTo(pts[i], pts[i + 1]));
      g.stroke(); g.globalAlpha = 1;
    };
    const step = Math.max(1.2, S / 900);
    const clearRect = (x0, y0, x1, y1, r = 0) => { g.fillStyle = palette.bg; g.beginPath(); g.roundRect(x0, y0, x1 - x0, y1 - y0, r); g.fill(); };

    // ---- security underprint: fine waves over the whole sheet, very pale
    if (P.underprint > 0) {
      const gap = S * 0.0105 / P.density, n = Math.ceil(H / gap) + 6;
      for (let j = -3; j < n; j++) {
        const pts = [];
        for (let x = -10; x <= W + 10; x += step * 2) {
          const t = x / S;
          pts.push(x, j * gap + S * 0.012 * Math.sin(t * TAU * 1.7 + j * 0.11 + ph0) + S * 0.006 * Math.sin(t * TAU * 5.3 - j * 0.05));
        }
        poly(pts, tint, 0.28 * P.underprint, lw * 0.8);
      }
    }

    // ---- a braided ribbon: two families of phase-shifted sine curves round a centre line
    const ribbon = ({ cy, slope = 0, amp, k1 = 3.2, k2 = 4.6, wob = 0.05, wf = 0.55, n = 36, inkA = ink1, inkB = ink2, ph = 0 }) => {
      const centre = (x) => cy + slope * (x - fx) + S * wob * Math.sin((x / S) * TAU * wf + ph);
      const env = (x) => amp * (0.72 + 0.28 * Math.sin((x / S) * TAU * 0.42 + ph * 1.7));
      const fam = (k, count, color, phOff, scale) => {
        for (let i = 0; i < count; i++) {
          const pts = [], phi = (TAU * i) / count + phOff;
          for (let x = -S * 0.05; x <= W + S * 0.05; x += step) { const t = x / S; pts.push(x, centre(x) + env(x) * scale * Math.sin(t * TAU * k + phi)); }
          poly(pts, color);
        }
      };
      fam(k1, nLines(n), inkA, ph, 1);
      fam(k2, nLines(n * 0.75), inkB, ph + 0.5, 0.78);
      // border rules of the band
      for (const s of [-1, 1]) for (const o of [1.06, 1.13]) {
        const pts = []; for (let x = -S * 0.05; x <= W + S * 0.05; x += step) pts.push(x, centre(x) + s * env(x) * o);
        poly(pts, inkA, 0.95, lw * (o > 1.1 ? 1.8 : 1));
      }
    };

    // ---- a rosette ring: N interlaced lobed curves between two radii
    const ring = (cx, cy, rMid, a, lobes, n, color, { ph = 0, mod = 0, modK = 3 } = {}) => {
      const m = Math.max(360, Math.ceil((TAU * (rMid + a)) / step));
      for (let i = 0; i < n; i++) {
        const pts = [], phi = (TAU * i) / n / lobes * 1 + ph;
        for (let s = 0; s <= m; s++) {
          const th = (s / m) * TAU;
          const r = rMid + a * Math.sin(lobes * (th + phi)) * (1 - mod + mod * Math.cos(modK * th));
          pts.push(cx + r * Math.cos(th), cy + r * Math.sin(th));
        }
        poly(pts, color);
      }
    };
    const circle = (cx, cy, r, color, w = lw, alpha = 0.95) => { g.strokeStyle = color; g.globalAlpha = alpha; g.lineWidth = w; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke(); g.globalAlpha = 1; };
    const medallion = (cx, cy, R, simple = false) => {
      g.fillStyle = palette.bg; g.beginPath(); g.arc(cx, cy, R * 1.04, 0, TAU); g.fill();
      ring(cx, cy, R * 0.925, R * 0.055, 30, nLines(24), ink1, { ph: ph0 });
      circle(cx, cy, R * 0.865, ink1, lw * 1.6); circle(cx, cy, R * 0.99, ink1, lw * 1.6); circle(cx, cy, R * 1.015, ink1);
      ring(cx, cy, R * 0.72, R * 0.115, 16, nLines(28), ink2, { ph: ph0 * 0.5, mod: 0.12, modK: 8 });
      if (!simple) {
        circle(cx, cy, R * 0.585, ink1, lw * 1.6);
        ring(cx, cy, R * 0.41, R * 0.15, 9, nLines(34), ink1, { ph: ph0 * 0.3 });
        ring(cx, cy, R * 0.41, R * 0.15, 9, nLines(12), ink2, { ph: ph0 * 0.3 + Math.PI / 9 });
        circle(cx, cy, R * 0.235, ink1, lw * 1.6);
        for (let k = 0; k < nLines(14); k++) circle(cx, cy, R * (0.03 + 0.19 * (k / nLines(14))), ink2, lw, 0.85);
        g.fillStyle = ink1; g.beginPath(); g.arc(cx, cy, R * 0.025, 0, TAU); g.fill();
      } else {
        ring(cx, cy, R * 0.36, R * 0.2, 7, nLines(26), ink1, { ph: ph0 * 0.3, mod: 0.3, modK: 2 });
        circle(cx, cy, R * 0.12, ink2, lw * 1.4);
      }
    };

    // ---- a lattice band round a rectangle: interlaced waves following its outline
    const frameBand = (x0, y0, x1, y1, bw) => {
      const rc = bw * 0.9;
      // centre line of the band as a dense closed polyline with outward normals
      const cxA = x0 - bw / 2, cyA = y0 - bw / 2, cxB = x1 + bw / 2, cyB = y1 + bw / 2;
      const path = [];
      const seg = (ax, ay, bx, by) => { const L = Math.hypot(bx - ax, by - ay), m = Math.max(2, Math.ceil(L / step)); for (let i = 0; i < m; i++) path.push([ax + ((bx - ax) * i) / m, ay + ((by - ay) * i) / m]); };
      const arc = (cx, cy, r, a0, a1) => { const m = Math.max(8, Math.ceil((Math.abs(a1 - a0) * r) / step)); for (let i = 0; i < m; i++) { const a = a0 + ((a1 - a0) * i) / m; path.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } };
      seg(cxA + rc, cyA, cxB - rc, cyA); arc(cxB - rc, cyA + rc, rc, -Math.PI / 2, 0);
      seg(cxB, cyA + rc, cxB, cyB - rc); arc(cxB - rc, cyB - rc, rc, 0, Math.PI / 2);
      seg(cxB - rc, cyB, cxA + rc, cyB); arc(cxA + rc, cyB - rc, rc, Math.PI / 2, Math.PI);
      seg(cxA, cyB - rc, cxA, cyA + rc); arc(cxA + rc, cyA + rc, rc, Math.PI, Math.PI * 1.5);
      const n = path.length, nrm = path.map((p, i) => { const a = path[(i - 1 + n) % n], b = path[(i + 1) % n]; let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; return [dy / l, -dx / l]; });
      const len = []; let acc = 0; for (let i = 0; i < n; i++) { len.push(acc); const b = path[(i + 1) % n]; acc += Math.hypot(b[0] - path[i][0], b[1] - path[i][1]); }
      const cyc1 = Math.round(acc / (bw * 1.1)), cyc2 = Math.round(acc / (bw * 0.72));
      const fam = (cyc, count, color, sc) => {
        for (let j = 0; j < count; j++) {
          const pts = [], phi = (TAU * j) / count;
          for (let i = 0; i <= n; i++) { const k = i % n, o = (bw / 2) * sc * Math.sin((len[k] / acc) * TAU * cyc + phi); pts.push(path[k][0] + nrm[k][0] * o, path[k][1] + nrm[k][1] * o); }
          poly(pts, color);
        }
      };
      // clear everything between the band's inner edge and the sheet edge, leave the inside alone
      g.fillStyle = palette.bg; g.beginPath(); g.rect(-10, -10, W + 20, H + 20); g.roundRect(x0 + bw * 0.08, y0 + bw * 0.08, x1 - x0 - bw * 0.16, y1 - y0 - bw * 0.16, rc * 0.3); g.fill('evenodd');
      fam(cyc1, nLines(16), ink1, 0.92);
      fam(cyc2, nLines(10), ink2, 0.62);
      for (const o of [-0.56, 0.56]) { const pts = []; for (let i = 0; i <= n; i++) { const k = i % n; pts.push(path[k][0] + nrm[k][0] * o * bw, path[k][1] + nrm[k][1] * o * bw); } poly(pts, ink1, 0.95, lw * 1.7); }
      // knots at the corners: small rosettes
      for (const [cx, cy] of [[cxA, cyA], [cxB, cyA], [cxB, cyB], [cxA, cyB]]) {
        const r = bw * 0.95;
        g.fillStyle = palette.bg; g.beginPath(); g.arc(cx, cy, r * 1.08, 0, TAU); g.fill();
        ring(cx, cy, r * 0.6, r * 0.34, 10, nLines(14), ink1, { ph: ph0 });
        ring(cx, cy, r * 0.6, r * 0.34, 10, nLines(6), ink2, { ph: ph0 + Math.PI / 10 });
        circle(cx, cy, r, ink1, lw * 1.6); circle(cx, cy, r * 0.2, ink2, lw * 1.4);
      }
    };

    // ---- compose the motif
    if (motif === 'ribbon') {
      const tilt = (rng() - 0.5) * 0.12;
      const sc = clamp(D / (0.75 * S), 0.6, 1.1);
      ribbon({ cy: fy - S * 0.3 * sc, slope: tilt, amp: S * 0.07 * sc, k1: 3.4, k2: 5.0, wob: 0.04, ph: ph0, n: 32, inkA: ink2, inkB: ink1 });
      ribbon({ cy: fy + S * 0.01, slope: -tilt * 0.6, amp: S * 0.15 * sc, k1: 2.1, k2: 3.1, wob: 0.07, ph: ph0 + 2, n: 52 });
      ribbon({ cy: fy + S * 0.31 * sc, slope: tilt * 0.8, amp: S * 0.065 * sc, k1: 4.0, k2: 5.8, wob: 0.035, ph: ph0 + 4, n: 30, inkA: ink2, inkB: ink1 });
    } else if (motif === 'medallion') {
      // two faint ribbons behind the seal tie it into the sheet
      ribbon({ cy: fy, amp: S * 0.06, k1: 3, k2: 4.4, wob: 0.025, ph: ph0, n: 22, inkA: ink2, inkB: ink2 });
      // the seal is as large as the art space allows without touching a type zone
      let R = D * 0.5;
      for (const q of quiet) { const dx = Math.max(q.x0 - pad - fx, 0, fx - q.x1 - pad), dy = Math.max(q.y0 - pad - fy, 0, fy - q.y1 - pad); R = Math.min(R, Math.hypot(dx, dy) - S * 0.03); }
      medallion(fx, fy, Math.max(R, D * 0.3));
    } else {
      ribbon({ cy: fy, amp: S * 0.075, k1: 2.6, k2: 3.8, wob: 0.04, ph: ph0, n: 32, inkA: ink2, inkB: ink1 });
      let R = D * 0.36;
      for (const q of quiet) { const dx = Math.max(q.x0 - pad - fx, 0, fx - q.x1 - pad), dy = Math.max(q.y0 - pad - fy, 0, fy - q.y1 - pad); R = Math.min(R, Math.hypot(dx, dy) - S * 0.03); }
      medallion(fx, fy, Math.max(R, D * 0.22));
    }
    const bw = S * 0.045, inset = S * 0.022 + bw;            // frame motif: the certificate border's inner edge

    // ---- type zones: cleared panels; the copy gets a cartouche (double rule) or the lattice frame
    const lim = motif === 'frame' ? inset + S * 0.008 : 0;
    const clr = (x0, y0, x1, y1, r = 0) => clearRect(Math.max(x0, lim), Math.max(y0, lim), Math.min(x1, W - lim), Math.min(y1, H - lim), r);
    for (const q of quiet.slice(1)) clr(q.x0 - (q.strip ? 0 : pad), q.y0 - pad * 0.6, q.x1 + (q.strip ? 0 : pad), q.y1 + (q.strip ? pad : pad * 0.6));
    if (motif === 'frame') {
      if (copy) {
        const near = lim + S * 0.08, a = copy.x0 - pad, b = copy.y0 - pad, c = copy.x1 + pad, d = copy.y1 + pad;
        clr(a < near ? 0 : a, b < near ? 0 : b, c > W - near ? W : c, d > H - near ? H : d, S * 0.01);
      }
      frameBand(inset, inset, W - inset, H - inset, bw);
      g.strokeStyle = ink1; g.lineWidth = lw; g.strokeRect(inset + S * 0.009, inset + S * 0.009, W - 2 * inset - S * 0.018, H - 2 * inset - S * 0.018);
    } else if (copy) {
      {
        const x0 = Math.max(copy.x0 - pad, S * 0.015), y0 = Math.max(copy.y0 - pad, S * 0.015), x1 = Math.min(copy.x1 + pad, W - S * 0.015), y1 = Math.min(copy.y1 + pad, H - S * 0.015), r = S * 0.012;
        const near = S * 0.08, e = S * 0.012;
        clearRect(x0 - e < near ? 0 : x0 - e, y0 - e < near ? 0 : y0 - e, x1 + e > W - near ? W : x1 + e, y1 + e > H - near ? H : y1 + e, r * 1.6);
        if (P.cartouche) {
          g.strokeStyle = ink1; g.lineWidth = lw * 2.2; g.beginPath(); g.roundRect(x0, y0, x1 - x0, y1 - y0, r); g.stroke();
          g.lineWidth = lw; g.beginPath(); g.roundRect(x0 + S * 0.007, y0 + S * 0.007, x1 - x0 - S * 0.014, y1 - y0 - S * 0.014, r * 0.6); g.stroke();
        }
      }
    }
    // a hairline border round the sheet, as on a note
    if (motif !== 'frame') { g.strokeStyle = ink1; g.globalAlpha = 0.8; g.lineWidth = lw; g.strokeRect(S * 0.012, S * 0.012, W - S * 0.024, H - S * 0.024); g.globalAlpha = 1; }
  });

  scene.add(backgroundQuad(/* glsl */`
    precision highp float;
    uniform sampler2D uTex; uniform float uUnit, uDark; varying vec2 vUv;
    ${GLSL_NOISE_KIT}
    ${GLSL_DITHER}
    void main(){
      vec3 c = texture2D(uTex, vUv).rgb;
      vec2 p = gl_FragCoord.xy / uUnit;
      // rag paper: soft cloud and a few long fibres
      float cloud = fbm2(p * 0.18, 4) * 0.012;
      float fibre = smoothstep(0.92, 1.0, ridged2(vec2(p.x * 0.6, p.y * 2.4) + 11.0, 3)) * 0.02;
      float tooth = (hash21(gl_FragCoord.xy) - 0.5) * 0.012;
      c += (cloud - fibre * (1.0 - 2.0 * uDark) + tooth) * mix(1.0, 0.5, uDark);
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
      gl_FragColor.rgb += ditherNoise(gl_FragCoord.xy);
    }`, { uTex: { value: tex }, uUnit: { value: unit }, uDark: { value: new THREE.Color(palette.bg).getHSL({}).l < 0.4 ? 1 : 0 } }));

  ctx.frame({ radius: 1, fov: 30, dir: [0, 0, 1] });
}
