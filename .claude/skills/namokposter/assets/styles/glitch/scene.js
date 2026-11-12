// Glitch — CRT / VHS / datamosh. A simple, strong subject (a stack of lit solids, a landscape on a
// CRT screen, bold flat shapes) is rendered clean, read back to the CPU and broken the way a damaged
// signal breaks: rows of the subject are pixel-sorted by brightness and dragged out into fading
// smears, a few macroblocks slip and posterise (datamosh), then a CRT pass tears horizontal slices
// sideways, splits the red and blue guns apart, draws scanlines and a VHS tracking band. The damage
// lives around the subject; the rectangles that carry the copy stay clean (only faint scanlines).
//
// motif: solids | horizon | shapes
// Palette: bg = the screen / page · colors[0..2] = the subject's colours · accent = OSD marks, sun
import { GLSL_NOISE_KIT, GLSL_DITHER } from '/skill/assets/web/scene-lib.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const hex2rgb = (h) => { const c = parseInt(h.replace('#', '').padEnd(6, '0').slice(0, 6), 16); return [(c >> 16) & 255, (c >> 8) & 255, c & 255]; };
const mixHex = (a, b, t) => { const A = hex2rgb(a), B = hex2rgb(b); return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], t))).join(',')})`; };

async function loadMono() {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    if (![...document.fonts].some((f) => f.family === 'Glitch Mono')) {
      const face = new FontFace('Glitch Mono', 'url(/skill/assets/fonts/jetbrains-mono/jetbrains-mono-latin-wght-normal.woff2) format("woff2")', { weight: '100 800' });
      await Promise.race([face.load(), wait(5000).then(() => { throw new Error('timeout'); })]);
      document.fonts.add(face);
    }
    return '"Glitch Mono", monospace';
  } catch { return 'monospace'; }
}

export default async function build(ctx) {
  const { THREE, scene, camera, renderer, palette, params, rng, width: W, height: H, unit } = ctx;
  const motif = ['solids', 'horizon', 'shapes'].includes(params.motif) ? params.motif : 'solids';
  const P = {
    amount: clamp(params.amount ?? 1, 0, 2), sort: clamp(params.sort ?? 1, 0, 2), split: clamp(params.split ?? 1, 0, 3),
    scan: clamp(params.scanlines ?? 1, 0, 2), osd: params.osd !== false && params.osd !== 0,
  };
  const S = Math.min(W, H), fx = ctx.focus.x * W, fy = ctx.focus.y * H;
  const cols = palette.colors?.length ? palette.colors : [palette.ink];
  const col = (i) => cols[i % cols.length];
  const acc = palette.accentOriginal ?? palette.accent;
  const bgRGB = hex2rgb(palette.bg), bgLum = (0.2126 * bgRGB[0] + 0.7152 * bgRGB[1] + 0.0722 * bgRGB[2]) / 255, dark = bgLum < 0.4;
  const [ax0, ay0, ax1, ay1] = (ctx.artRect || [0, 0, 1, 1]);
  const aw = (ax1 - ax0) * W, ah = (ay1 - ay0) * H;
  const D = Math.min((ctx.artSize ?? 0.7) * S, aw * 0.95, ah * 0.95);   // the subject's diameter, px
  // which way is "away from the copy" (smears are dragged that way)
  const q0 = ctx.quiet?.[0] ?? [0, 0, 0, 0];
  const awayX = fx >= ((q0[0] + q0[2]) / 2) * W ? 1 : -1;
  const mono = await loadMono();

  // ------------------------------------------------------------------ 1. the clean subject → RGBA bytes, top row first
  let pix;
  if (motif === 'solids') {
    const rt = new THREE.WebGLRenderTarget(W, H, { samples: 4 }); rt.texture.colorSpace = THREE.SRGBColorSpace;
    const sub = new THREE.Scene(); sub.background = new THREE.Color(palette.bg);
    const mat = (c, r = 0.55) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0 });
    const g = new THREE.Group(); sub.add(g);
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.62, 1.05), mat(col(0))); box.position.y = -0.62; box.rotation.y = Math.PI / 4; g.add(box);
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.56, 96), mat(col(1))); cyl.position.y = -0.03; g.add(cyl);
    const sph = new THREE.Mesh(new THREE.SphereGeometry(0.4, 96, 64), mat(col(2), 0.35)); sph.position.y = 0.64; g.add(sph);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.5, 64), mat(acc)); cone.position.set(0.78 * awayX, -0.68, 0.25); cone.rotation.z = 0.0; g.add(cone);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.07, 32, 96), mat(col(1))); ring.position.set(-0.72 * awayX, -0.86, 0.3); ring.rotation.x = -Math.PI / 2; g.add(ring);
    g.position.y = 0.05;
    sub.add(new THREE.HemisphereLight('#ffffff', palette.bg, dark ? 1.1 : 1.3));
    const key = new THREE.DirectionalLight('#ffffff', 2.4); key.position.set(-3 * awayX, 4, 5); sub.add(key);
    const rim = new THREE.DirectionalLight('#ffffff', dark ? 1.2 : 0.6); rim.position.set(4 * awayX, 1, -3); sub.add(rim);
    ctx.frame({ width: 2.0, height: 2.15, fov: 26, dir: [0, 0.32, 1] });
    renderer.setRenderTarget(rt); renderer.render(sub, camera); renderer.setRenderTarget(null);
    const raw = new Uint8Array(W * H * 4); renderer.readRenderTargetPixels(rt, 0, 0, W, H, raw);
    pix = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) pix.set(raw.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    rt.dispose();
  } else {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.fillStyle = palette.bg; g.fillRect(0, 0, W, H);
    if (motif === 'horizon') {
      // a landscape on a CRT screen: sky, a plain sun disc, two ridges, still water with the sun's reflection
      let pw = Math.min(aw * 0.92, ah * 0.92 * 4 / 3, D * 1.25), ph = pw * 0.75;
      // the screen never runs under the copy: shrink it until it clears every copy rectangle
      const gap = S * 0.035, hits = () => (ctx.quiet || []).some(([a, b, c, d]) => fx + pw / 2 > a * W - gap && fx - pw / 2 < c * W + gap && fy + ph / 2 > b * H - gap && fy - ph / 2 < d * H + gap);
      for (let k = 0; k < 40 && hits(); k++) { pw *= 0.96; ph = pw * 0.75; }
      const x0 = fx - pw / 2, y0 = fy - ph / 2, r = ph * 0.07;
      g.save(); g.beginPath(); g.roundRect(x0, y0, pw, ph, r); g.clip();
      const hor = y0 + ph * 0.62;
      const sky = g.createLinearGradient(0, y0, 0, hor);
      sky.addColorStop(0, mixHex(palette.bg, col(1), dark ? 0.25 : 0.15)); sky.addColorStop(0.7, mixHex(palette.bg, col(1), 0.75)); sky.addColorStop(1, col(1));
      g.fillStyle = sky; g.fillRect(x0, y0, pw, hor - y0);
      const sx = x0 + pw * (awayX > 0 ? 0.62 : 0.38), sr = ph * 0.19, sy = hor - sr * 0.45;
      const glow = g.createRadialGradient(sx, sy, sr * 0.9, sx, sy, sr * 2.4); glow.addColorStop(0, mixHex(col(1), acc, 0.5)); glow.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.5; g.fillStyle = glow; g.fillRect(x0, y0, pw, hor - y0); g.globalAlpha = 1;
      g.fillStyle = acc; g.beginPath(); g.arc(sx, sy, sr, 0, Math.PI * 2); g.fill();
      const ridge = (base, amp, seedOff, color, fine) => {
        g.fillStyle = color; g.beginPath(); g.moveTo(x0, hor + 1);
        for (let i = 0; i <= 200; i++) {
          const t = i / 200, x = x0 + pw * t;
          const yv = base - amp * (0.55 * Math.sin(t * 5.1 + seedOff) * Math.sin(t * 2.3 + seedOff * 2) + 0.35 * Math.abs(Math.sin(t * 13.7 + seedOff * 3)) * fine + 0.3);
          g.lineTo(x, yv);
        }
        g.lineTo(x0 + pw, hor + 1); g.closePath(); g.fill();
      };
      ridge(hor, ph * 0.2, rng.range(0, 6), mixHex(col(0), col(1), 0.55), 0.6);
      ridge(hor, ph * 0.12, rng.range(0, 6), mixHex(col(0), palette.bg, dark ? 0.35 : 0.1), 1);
      const sea = g.createLinearGradient(0, hor, 0, y0 + ph);
      sea.addColorStop(0, mixHex(col(1), col(0), 0.45)); sea.addColorStop(1, mixHex(palette.bg, col(0), dark ? 0.25 : 0.6));
      g.fillStyle = sea; g.fillRect(x0, hor, pw, y0 + ph - hor);
      // the reflection: short horizontal dashes under the sun, narrowing with depth
      g.fillStyle = acc;
      for (let k = 0; k < 14; k++) {
        const t = k / 14, y = hor + ph * 0.02 + t * (y0 + ph - hor) * 0.9, hw = sr * (1 - t * 0.75) * (0.7 + 0.3 * Math.sin(k * 2.7)), hh = ph * 0.011 * (1 + t);
        g.fillRect(sx - hw, y, hw * 2, hh);
      }
      g.restore();
      // the screen's glass edge
      g.strokeStyle = mixHex(palette.bg, palette.ink, 0.35); g.lineWidth = unit * 0.25; g.beginPath(); g.roundRect(x0 - unit * 0.6, y0 - unit * 0.6, pw + unit * 1.2, ph + unit * 1.2, r * 1.2); g.stroke();
      if (P.osd) {
        g.font = `600 ${ph * 0.05}px ${mono}`; g.fillStyle = palette.ink; g.textBaseline = 'top'; g.textAlign = 'left';
        g.fillText('▶ PLAY', x0 + ph * 0.06, y0 + ph * 0.06);
        g.textAlign = 'right'; g.fillText('SP  0:17:24', x0 + pw - ph * 0.06, y0 + ph * 0.06);
        g.textAlign = 'left'; g.font = `600 ${ph * 0.042}px ${mono}`; g.fillText('CH 03', x0 + ph * 0.06, y0 + ph * 0.88);
      }
    } else {
      // bold flat shapes: a disc, a square, a triangle, a ruled bar block
      const cx = fx, cy = fy, d = D;
      g.fillStyle = col(1); g.beginPath(); g.arc(cx - 0.12 * d * awayX, cy - 0.1 * d, 0.3 * d, 0, Math.PI * 2); g.fill();
      g.fillStyle = col(0); g.fillRect(cx + 0.0 * d * awayX - (awayX < 0 ? 0.44 * d : 0), cy - 0.05 * d, 0.44 * d, 0.44 * d);
      g.fillStyle = col(2); g.beginPath(); const tx = cx - 0.28 * d * awayX, ty = cy + 0.38 * d; g.moveTo(tx - 0.2 * d, ty); g.lineTo(tx + 0.2 * d, ty); g.lineTo(tx, ty - 0.36 * d); g.closePath(); g.fill();
      g.fillStyle = palette.ink; for (let k = 0; k < 6; k++) g.fillRect(cx + 0.18 * d * awayX - 0.11 * d, cy - 0.44 * d + k * 0.03 * d, 0.22 * d, 0.012 * d);
      g.fillStyle = acc; g.beginPath(); g.arc(cx + 0.36 * d * awayX, cy - 0.3 * d, 0.06 * d, 0, Math.PI * 2); g.fill();
    }
    pix = g.getImageData(0, 0, W, H).data;
    ctx.frame({ radius: 1, fov: 30, dir: [0, 0, 1] });
  }

  // ------------------------------------------------------------------ 2. damage on the CPU: pixel sorting, smears, macroblocks
  const pad = S * 0.02;
  const qs = (ctx.quiet || []).map(([x0, y0, x1, y1]) => [x0 * W - pad, y0 * H - pad, x1 * W + pad, y1 * H + pad]);
  const isSub = (i) => Math.abs(pix[i] - bgRGB[0]) + Math.abs(pix[i + 1] - bgRGB[1]) + Math.abs(pix[i + 2] - bgRGB[2]) > 30;
  const out = new Uint8ClampedArray(pix);
  const R = D * 0.62;
  const K = clamp(D / (0.7 * S), 0.35, 1.1);                  // damage scales with the subject, not the sheet                                        // reach of the damage around the focus
  if (P.sort > 0 && P.amount > 0) {
    // bands of rows, each sorted and smeared away from the copy
    let y = Math.max(0, Math.floor(fy - R));
    const yEnd = Math.min(H, Math.ceil(fy + R));
    const tmp = new Uint32Array(W);
    while (y < yEnd) {
      const bandH = Math.max(2, Math.round(S * K * rng.range(0.004, 0.03)));
      const on = rng() < 0.22 * P.amount * P.sort;
      const drag = S * K * rng.range(0.03, 0.2) * P.sort, thr = rng.range(0.25, 0.6);
      if (on) {
        for (let yy = y; yy < Math.min(yEnd, y + bandH); yy++) {
          const row = yy * W * 4;
          // the subject's span on this row
          let a = -1, b = -1;
          for (let x = 0; x < W; x++) if (isSub(row + x * 4)) { if (a < 0) a = x; b = x; }
          if (a < 0) continue;
          // sort pixels brighter than the threshold inside the span (ascending towards the open side)
          let n = 0;
          for (let x = a; x <= b; x++) { const i = row + x * 4; tmp[n++] = (Math.round((0.2126 * pix[i] + 0.7152 * pix[i + 1] + 0.0722 * pix[i + 2])) << 24 >>> 0) + (pix[i] << 16) + (pix[i + 1] << 8) + pix[i + 2]; }
          const seg = tmp.subarray(0, n);
          // only the part of the span above the threshold moves (classic interval sort)
          const lumOf = (v) => (v >>> 24) / 255;
          let s0 = -1;
          const flush = (s, e) => { const part = seg.slice(s, e).sort(); if (awayX < 0) part.reverse(); seg.set(part, s); };
          for (let k = 0; k <= n; k++) { const ok = k < n && (dark ? lumOf(seg[k]) > thr * 0.5 : lumOf(seg[k]) < 1 - thr * 0.5); if (ok && s0 < 0) s0 = k; if ((!ok || k === n) && s0 >= 0) { if (k - s0 > 3) flush(s0, k); s0 = -1; } }
          for (let k = 0; k < n; k++) { const x = a + k, i = row + x * 4, v = seg[k]; out[i] = (v >> 16) & 255; out[i + 1] = (v >> 8) & 255; out[i + 2] = v & 255; }
          // the smear: the edge colour dragged out and fading into the screen
          const e = awayX > 0 ? b : a, ei = row + e * 4, er = out[ei], eg = out[ei + 1], eb = out[ei + 2];
          const L = Math.round(drag * rng.range(0.5, 1));
          for (let k = 1; k <= L; k++) {
            const x = e + k * awayX; if (x < 0 || x >= W) break;
            const t = Math.pow(k / L, 0.7), i = row + x * 4;
            out[i] = lerp(er, out[i], t); out[i + 1] = lerp(eg, out[i + 1], t); out[i + 2] = lerp(eb, out[i + 2], t);
          }
        }
      }
      y += bandH + Math.round(S * K * rng.range(0.004, 0.035));
    }
  }
  if (P.amount > 0) {
    // macroblocks that slipped: copied from a neighbour, posterised
    const B = Math.max(6, Math.round(S * K * 0.022)), nb = Math.round(26 * P.amount);
    for (let k = 0; k < nb; k++) {
      const bx = Math.round((fx + rng.gauss() * R * 0.55) / B) * B, by = Math.round((fy + rng.gauss() * R * 0.55) / B) * B;
      const w = B * rng.int(1, 4), h = B * rng.int(1, 2), sx = bx + B * rng.int(-3, 3), sy = by + B * rng.int(-1, 1);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const X = bx + x, Y = by + y, SX = clamp(sx + x, 0, W - 1), SY = clamp(sy + y, 0, H - 1);
        if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const i = (Y * W + X) * 4, j = (SY * W + SX) * 4;
        for (let c = 0; c < 3; c++) out[i + c] = Math.round(pix[j + c] / 48) * 48;
      }
    }
  }
  // the clean copy area: whatever the damage dragged in is wiped back to the screen colour
  for (const q of qs) {
    const x0 = clamp(Math.floor(q[0]), 0, W), x1 = clamp(Math.ceil(q[2]), 0, W), y0 = clamp(Math.floor(q[1]), 0, H), y1 = clamp(Math.ceil(q[3]), 0, H);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * W + x) * 4; out[i] = bgRGB[0]; out[i + 1] = bgRGB[1]; out[i + 2] = bgRGB[2]; }
  }
  const tex = new THREE.DataTexture(out, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.needsUpdate = true;

  // ------------------------------------------------------------------ 3. the CRT pass: tears, gun split, scanlines, tracking, noise
  const qv = [0, 1, 2, 3].map((i) => new THREE.Vector4(...((ctx.quiet || [])[i] || [2, 2, 2, 2])));
  const mat = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: {
      uTex: { value: tex }, uRes: { value: new THREE.Vector2(W, H) }, uUnit: { value: unit }, uFocus: { value: new THREE.Vector2(fx / W, fy / H) },
      uReach: { value: R / S }, uAsp: { value: new THREE.Vector2(W / S, H / S) }, uAmt: { value: P.amount }, uSplit: { value: P.split }, uScan: { value: P.scan },
      uBg: { value: new THREE.Color(palette.bg) }, uDark: { value: dark ? 1 : 0 }, uSeed: { value: rng() * 100 }, uQuiet: { value: qv }, uAway: { value: awayX }, uK: { value: K },
      uTrack: { value: fy / H + (rng() < 0.5 ? -1 : 1) * (R / H) * rng.range(0.35, 0.75) },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */`
      precision highp float;
      uniform sampler2D uTex; uniform vec2 uRes, uFocus, uAsp; uniform float uK, uUnit, uReach, uAmt, uSplit, uScan, uDark, uSeed, uAway, uTrack; uniform vec3 uBg; uniform vec4 uQuiet[4];
      varying vec2 vUv;
      ${GLSL_NOISE_KIT}
      ${GLSL_DITHER}
      float quietM(vec2 p, float e){ float m = 0.0; for (int i = 0; i < 4; i++){ vec4 r = uQuiet[i];
        m = max(m, smoothstep(r.x - e, r.x, p.x) * smoothstep(r.z + e, r.z, p.x) * smoothstep(r.y - e, r.y, p.y) * smoothstep(r.w + e, r.w, p.y)); } return m; }
      vec3 tap(vec2 p){ return texture2D(uTex, clamp(p, vec2(0.0), vec2(1.0))).rgb; }
      void main(){
        vec2 p = vec2(vUv.x, 1.0 - vUv.y);                      // poster space, y down
        vec2 px = p * uRes;
        float d = length((p - uFocus) * uAsp);
        float act = (1.0 - smoothstep(uReach * 0.75, uReach * 1.5, d)) * uAmt;          // damage lives around the subject
        float q = quietM(p, 0.02);
        act *= 1.0 - q;
        // slice tears: rows in bands of varying height slip sideways
        float bandA = floor(px.y / (uUnit * uK * 1.7)), bandB = floor(px.y / (uUnit * uK * 0.45));
        float hA = hash21(vec2(bandA, uSeed)), hB = hash21(vec2(bandB, uSeed + 7.0));
        float shift = 0.0;
        if (hA > 0.78) shift += (hash21(vec2(bandA, uSeed + 3.0)) - 0.35) * 0.09 * uK * uAway;
        if (hB > 0.9) shift += (hash21(vec2(bandB, uSeed + 5.0)) - 0.5) * 0.03 * uK;
        shift *= act;
        // tracking band: a strip of noisy, displaced lines
        float tr = exp(-pow((p.y - uTrack) / (0.012 + 0.006 * sin(px.x * 0.002)), 2.0)) * act;
        shift += tr * (noise2(vec2(px.y * 0.9, uSeed)) * 0.02 * uK);
        vec2 sp = vec2(p.x - shift / uAsp.x, p.y);
        // the guns: red and blue land apart, more where the picture is torn
        float split = (0.18 + 0.5 * step(0.78, hA) + 0.8 * tr) * uSplit * act * uUnit / uRes.x * 3.0;
        vec3 c;
        c.r = tap(sp + vec2(split, 0.0)).r;
        c.g = tap(sp).g;
        c.b = tap(sp - vec2(split, 0.0)).b;
        // chroma bleed along the line (VHS), only where the picture is damaged
        vec3 bleed = (tap(sp + vec2(2.0 * uUnit / uRes.x, 0.0)) + tap(sp + vec2(4.0 * uUnit / uRes.x, 0.0))) * 0.5;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722)), lb = dot(bleed, vec3(0.2126, 0.7152, 0.0722));
        c = mix(c, vec3(l) + (bleed - vec3(lb)), 0.35 * act);
        // tracking noise: white specks streaking along the band
        float sn = step(0.86, hash21(vec2(floor(px.x / (uUnit * 0.9)), floor(px.y / 2.0)) + uSeed));
        c = mix(c, mix(vec3(1.0), uBg, 0.25 * (1.0 - uDark)), sn * tr * 0.8);
        // scanlines everywhere (faint over the copy), a soft phosphor glow on the subject
        float lineP = uUnit * 0.34;
        float scan = 0.5 + 0.5 * cos(6.2831853 * px.y / max(2.0, lineP));
        float sAmt = uScan * (0.045 + 0.12 * act) * mix(1.0, 0.6, 1.0 - uDark);
        c *= 1.0 - sAmt * scan;
        // aperture-grille hint on the damaged area
        float grille = 0.5 + 0.5 * cos(6.2831853 * px.x / max(3.0, uUnit * 0.3));
        c *= 1.0 - 0.05 * grille * act * uScan;
        // signal noise
        float grain = (hash21(px + uSeed) - 0.5) * (0.014 + 0.022 * act);
        // copy rectangles: back to the plain screen (same scanlines and grain, so no panel shows)
        c = mix(c, uBg * (1.0 - sAmt * scan), q * 0.92) + grain;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
        gl_FragColor.rgb += ditherNoise(gl_FragCoord.xy);
      }`,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
  const post = new THREE.Scene(); post.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  return { render() { renderer.setRenderTarget(null); renderer.render(post, cam); } };
}
