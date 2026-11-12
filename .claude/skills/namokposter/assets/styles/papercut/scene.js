// Paper Relief — stacked sheets of heavy coloured paper. Each sheet is cut with a knife and laid over
// the next; one soft light from the upper left makes every sheet cast a shadow on the one beneath.
// The top sheet is the page colour and carries the copy untouched; the cuts open only in the art
// area and show the deeper sheets, stepping from the page colour to the deepest palette colour.
//
// How it is made: one fragment shader. A motif (a sibling module) gives every sheet a smooth scalar
// field that is positive where the sheet has paper. The shader walks the stack from the bottom sheet
// to the top one; for each sheet it turns the field into a distance with f / |∇f| (so every cut is
// equally crisp), darkens what lies beneath with two shadows — the same field looked up a little
// towards the light: a tight contact shadow and a wide soft one that grows with the gap to the sheet
// it falls on — plus a faint occlusion all round the cut, and then lays the sheet's own colour with a
// hairline of lighter paper on the edges that face the light. Colours are mixed in OKLab.
//
// The copy: every rectangle that carries type keeps the top sheet whole. Around it the deeper sheets
// step back one after another (uClear), so a cut that comes near the copy ends in a flight of paper
// steps and never runs under the type.
//
// Palette: bg = the top sheet (behind the copy) · colors[] = the deeper sheets, lightest → deepest
//          (the stack is spread along this ramp) · accent = the one disc · ink = type only
// Motifs:  strata (nested contour openings) · tide (wave bands from the far edge) · canopy (leaves round a window)
import { backgroundQuad, quietUniforms, oklabVec, makeComposer, finishPassShader, GLSL_QUIET, GLSL_OKLAB, GLSL_NOISE_KIT } from '/skill/assets/web/scene-lib.js';
import strata from './strata.js';
import tide from './tide.js';
import canopy from './canopy.js';

const MOTIFS = { strata, tide, canopy };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const MAX_SHEETS = 12;

export default function build(ctx) {
  const { THREE, scene, palette, params, aspect, seed, rng, unit, width: W, height: H } = ctx;
  const sx = Math.max(aspect, 1), sy = Math.max(1 / aspect, 1), short = Math.min(W, H);      // frame fraction → short-side units
  const motif = MOTIFS[String(params.motif)] ? String(params.motif) : 'strata';
  const P = {
    layers: Number.isFinite(Number(params.layers)) ? clamp(Math.round(Number(params.layers)), 3, 9) : null,     // null = the motif's own count
    depth: clamp(params.depth ?? 1, 0.4, 2), scale: clamp(params.scale ?? 1, 0.6, 1.4), disc: params.disc !== false && params.disc !== 0,
  };

  // ---- colours, all in OKLab. The stack runs along the ramp page → colors[0] → … → colors[last].
  const bg = oklabVec(palette.bg), dark = bg.x < 0.5;
  const stops = [bg, ...(palette.colors?.length ? palette.colors : [palette.ink]).map((c) => oklabVec(c))];
  const rampAt = (t) => { const x = clamp(t, 0, 1) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x)); return stops[i].clone().lerp(stops[i + 1], x - i); };
  const deepest = stops[stops.length - 1];
  // the disc is the accent, lifted (or lowered) until it stands clear of the sheet it lies on
  const accent = oklabVec(palette.accentOriginal ?? palette.accent);
  const discOn = (under) => {
    const c = accent.clone();
    if (Math.abs(c.x - under.x) < 0.24) c.x = under.x <= 0.7 ? Math.min(0.93, under.x + 0.32) : under.x - 0.3;
    return c;
  };
  const disc = discOn(deepest);
  // … and as a sun or moon it is pale gold when the page is light and the accent a red or an orange: a red disc
  // on a plain field reads as a flag, not as a sun (the stock sea and mountain scenes take the same care)
  const hue = ((Math.atan2(accent.z, accent.y) * 180) / Math.PI + 360) % 360, warm = Math.hypot(accent.y, accent.z) > 0.06 && (hue < 80 || hue > 325);
  const moonOn = (under) => (!dark && warm ? new THREE.Vector3(clamp(under.x + 0.2, 0.84, 0.9), 0.02, 0.105) : discOn(under));

  // ---- where the copy sits (short-side units)
  const quiet = (ctx.quiet || []).map(([x0, y0, x1, y1]) => ({ x0, y0, x1, y1 }));
  const qDist = (x, y) => {                                                                // x, y in frame fractions
    let d = 9;
    for (const r of quiet) { const ex = (Math.abs(x - (r.x0 + r.x1) / 2) - (r.x1 - r.x0) / 2) * sx, ey = (Math.abs(y - (r.y0 + r.y1) / 2) - (r.y1 - r.y0) / 2) * sy; d = Math.min(d, Math.hypot(Math.max(ex, 0), Math.max(ey, 0)) + Math.min(Math.max(ex, ey), 0)); }
    return d;
  };

  // An opening should end in its own curve, not be clipped by the paper steps round the copy. settle() takes
  // the rim of an opening as points (short-side units) for a centre and a scale, and moves the opening away
  // from whatever copy it comes too near — while it stays a margin's width inside the sheet — or, when it
  // cannot move, draws it in a little; `need` is the clearance the rim wants at a given scale.
  const settle = (rim, need, cx, cy, mg = 0.05) => {
    let s = 1;
    const inside = (pts) => pts.every(([x, y]) => x > mg && x < sx - mg && y > mg && y < sy - mg);
    for (let tries = 0; tries < 40; tries++) {
      const pts = rim(cx, cy, s), want = need(s); let worst = 0, gx = 0, gy = 0;
      for (const [x, y] of pts) {
        const d = qDist(x / sx, y / sy) - want; if (d >= 0) continue;
        worst = Math.min(worst, d);
        gx -= d * (qDist((x + 0.01) / sx, y / sy) - qDist((x - 0.01) / sx, y / sy)); gy -= d * (qDist(x / sx, (y + 0.01) / sy) - qDist(x / sx, (y - 0.01) / sy));
      }
      if (worst === 0) break;
      const gl = Math.hypot(gx, gy), step = Math.min(0.03, -worst + 0.004);
      if (gl > 1e-9 && tries % 3 !== 2 && inside(rim(cx + (gx / gl) * step, cy + (gy / gl) * step, s))) { cx += (gx / gl) * step; cy += (gy / gl) * step; } else s *= 0.97;
    }
    return { cx, cy, s };
  };

  // ---- the motif: its sheets (bottom → top), their colours, and the GLSL of their fields
  const env = { P, sx, sy, short, quiet, qDist, settle, rampAt, disc, moonOn, dark, MAX_SHEETS };
  const M = MOTIFS[motif](ctx, env);
  const n = M.cols.length;
  const pad = (arr, fill) => { const a = arr.slice(0, MAX_SHEETS); while (a.length < MAX_SHEETS) a.push(typeof fill === 'function' ? fill() : fill); return a; };

  const gap = 0.0095 * P.depth;                                                            // height of one sheet above the next, in short-side units
  scene.add(backgroundQuad(/* glsl */`
    varying vec2 vUv;
    uniform vec2 uAsp, uL, uSeed; uniform float uShort, uGap, uUp, uHair, uDark, uPer, uClear0; uniform int uN, uDiscAfter;
    uniform vec3 uCol[${MAX_SHEETS}], uDiscCol, uTint; uniform float uClear[${MAX_SHEETS}]; uniform vec4 uDisc;
    ${GLSL_NOISE_KIT}
    ${GLSL_OKLAB}
    ${GLSL_QUIET}
    float smax(float a, float b, float k){ float h = max(k - abs(a - b), 0.0) / k; return max(a, b) + h * h * k * 0.25; }
    float smin(float a, float b, float k){ return -smax(-a, -b, k); }
    // distance (short-side units) from q to the nearest rectangle that carries type; a slow wander keeps
    // the paper steps round the copy from being ruled lines
    float quietD(vec2 q){
      vec2 p = q / uAsp; float d = 9.0;
      for (int i = 0; i < 4; i++) { vec4 r = uQuiet[i]; vec2 e = (abs(p - 0.5 * (r.xy + r.zw)) - 0.5 * (r.zw - r.xy)) * uAsp; d = min(d, length(max(e, 0.0)) + min(max(e.x, e.y), 0.0)); }
      return d + 0.012 * sin(q.x * 5.3 + uSeed.x) * sin(q.y * 4.1 + uSeed.y);
    }
    // keep sheet j clear of the copy: s is its field, unitsPer the field's units per short-side unit.
    // Page on top (uUp = 0): the sheet is kept whole within uClear[j] of the copy. Page at the bottom
    // (uUp = 1): the sheet is cut away within uClear[j] of it. Either way the sheets end one after another,
    // as a flight of steps — a broad one where the steps face away from the lamp and each carries a shadow,
    // a tight one (the edge of a ream of paper) where they face it and would only be a row of pale stripes.
    float terrace(int j, float s, vec2 q, float unitsPer){
      float d0 = quietD(q);
      vec2 g = vec2(quietD(q + vec2(0.004, 0.0)) - quietD(q - vec2(0.004, 0.0)), quietD(q + vec2(0.0, 0.004)) - quietD(q - vec2(0.0, 0.004)));
      float away = dot(g / max(length(g), 1e-6), uL) * (1.0 - 2.0 * uUp);          // > 0: the open side lies down-light of the paper
      float c = uClear0 + (uClear[j] - uClear0) * mix(0.2, 1.0, smoothstep(-0.35, 0.35, away));
      float e = (c - d0) * unitsPer, k = 0.035 * unitsPer;
      return uUp > 0.5 ? smin(s, -e, k) : smax(s, e, k);
    }
    ${M.glsl}
    void main(){
      vec2 p = vec2(vUv.x, 1.0 - vUv.y), q = p * uAsp;
      float px = 1.0 / uShort;
      vec3 lab = uCol[0];
      float z = 0.0, sW = 0.0, sT = 0.0, ao = 0.0, vis = 0.0;      // height of what is visible · wide shadow · contact shadow · occlusion · which sheet
      for (int j = 1; j < uN; j++) {
        // a paper disc glued to the sheet below, half a sheet thick
        if (j - 1 == uDiscAfter) {
          vec2 dv = q - uDisc.xy; float dl = length(dv), f = uDisc.z - dl, h = 0.5 * uGap;
          float cov = clamp(f / px + 0.5, 0.0, 1.0), lit = -dot(dv / max(dl, 1e-6), uL);
          float dS = uDisc.z - length(dv - uL * h);
          sW = 1.0 - (1.0 - sW) * (1.0 - smoothstep(-0.9 * h, 0.9 * h, dS)); sT = 1.0 - (1.0 - sT) * (1.0 - smoothstep(-0.15 * h - 0.5 * px, 0.15 * h + 0.5 * px, uDisc.z - length(dv - uL * 0.3 * h)));
          ao = 1.0 - (1.0 - ao) * (1.0 - 0.6 * (1.0 - smoothstep(0.0, 2.0 * h, -f)));
          vec3 c = uDiscCol; c.x += (1.0 - smoothstep(0.25 * uHair, 1.25 * uHair, f / px)) * (lit > 0.0 ? 0.05 * lit : 0.03 * lit);
          lab = mix(lab, c, cov); z = mix(z, float(j) - 0.5, cov); sW *= 1.0 - cov; sT *= 1.0 - cov; ao *= 1.0 - cov; vis = mix(vis, 40.0, step(0.5, cov));
        }
        float f = sheet(j, q);
        vec2 g = vec2(dFdx(f), -dFdy(f)); float gl = max(length(g), 1e-7);
        float dpx = f / gl, per = uPer > 0.0 ? uPer : gl * uShort;       // distance to the cut in px · field units per short-side unit (a motif whose field
                                                                     // is already a distance says so: the measured slope jumps where two shapes meet)
        float lv = float(j) - z, h = uGap * lv, hT = uGap * min(lv, 1.6);
        // the shadows: where would this sheet be, seen from a little towards the light?
        float dW = sheet(j, q - uL * h) / per, dT = sheet(j, q - uL * (0.3 * hT)) / per;
        // (shadows of different sheets are joined as 1 - (1 - a)(1 - b): no crease where two penumbras cross)
        sW = 1.0 - (1.0 - sW) * (1.0 - smoothstep(-0.8 * h, 0.8 * h, dW));
        sT = 1.0 - (1.0 - sT) * (1.0 - smoothstep(-0.12 * hT - 0.5 * px, 0.12 * hT + 0.5 * px, dT));
        // the sheet itself, with a hairline of light on the cut edges that face the lamp
        float cov = clamp(dpx + 0.5, 0.0, 1.0), lit = dot(g / gl, uL);
        ao = max(ao, (1.0 - smoothstep(0.0, 2.6 * hT, -f / per)) * mix(1.0, 0.3, smoothstep(-0.2, 0.6, lit)));   // occlusion all round the cut, less where the lamp looks in
        float rim = 1.0 - smoothstep(0.25 * uHair, 1.25 * uHair, dpx);
        vec3 c = uCol[j]; c.x += rim * (lit > 0.0 ? mix(0.055, 0.085, uDark) * lit : 0.03 * lit);
        lab = mix(lab, c, cov); z = mix(z, float(j), cov); vis = mix(vis, float(j), step(0.5, cov));
        sW *= 1.0 - cov; sT *= 1.0 - cov; ao *= 1.0 - cov;
      }
      // light: a shadow darkens the sheet it falls on and leans its colour towards the darkest paper of the
      // stack, which is what the light bouncing about in there has passed
      float shade = (1.0 - mix(0.3, 0.36, uDark) * sW) * (1.0 - mix(0.26, 0.3, uDark) * sT) * (1.0 - 0.1 * ao);
      lab.x *= shade; lab.yz = mix(lab.yz, uTint.yz, 0.5 * (1.0 - shade));
      // paper: fibres (each sheet lies at its own angle) and a slow mottle, about ±1.5 % together
      float a = vis * 2.399 + 0.6; mat2 R = mat2(cos(a), -sin(a), sin(a), cos(a));
      vec2 fq = R * (q / 0.0017);
      float fib = 0.6 * noise2(fq * vec2(1.0, 0.3) + vis * 17.0) + 0.4 * noise2(fq * 1.9 + vis * 31.0);
      float mot = fbm2(q * 7.0 + vis * 3.1 + uSeed, 2);
      lab.x += 0.011 * fib + 0.006 * mot;
      lab.x += 0.008 * clamp(-dot(q - 0.5 * uAsp, uL), -1.0, 1.0);     // the lamp is nearer the upper left corner
      gl_FragColor = vec4(clamp(oklabToLinear(lab), 0.0, 1.0), 1.0);
      #include <colorspace_fragment>
    }`, {
    uAsp: { value: new THREE.Vector2(sx, sy) }, uShort: { value: short }, uSeed: { value: new THREE.Vector2(rng.range(0, 60), rng.range(0, 60)) },
    uL: { value: new THREE.Vector2(0.64, 0.77) }, uGap: { value: gap }, uUp: { value: M.up ? 1 : 0 }, uPer: { value: M.per ?? 0 }, uHair: { value: Math.max(1, 0.1 * unit) }, uDark: { value: dark ? 1 : 0 },
    uN: { value: n }, uCol: { value: pad(M.cols, () => bg.clone()) }, uClear: { value: pad(M.clear, 0) }, uClear0: { value: Math.min(...M.clear) },
    uDisc: { value: M.disc ? new THREE.Vector4(M.disc.x, M.disc.y, M.disc.r, 0) : new THREE.Vector4(9, 9, 0, 0) }, uDiscAfter: { value: M.disc ? M.disc.after : -9 }, uDiscCol: { value: M.disc?.col ?? disc }, uTint: { value: bg.x < deepest.x ? bg : deepest },
    ...M.uniforms, ...quietUniforms(ctx),
  }));

  ctx.frame({ radius: 1, fov: 30, dir: [0, 0, 1] });   // nothing three-dimensional to place; kept so the scene obeys the same contract as the others
  // the finishing pass adds the ±1/255 dither that keeps the long soft shadows free of banding
  return makeComposer(ctx, { samples: 0, display: [finishPassShader(ctx, { vignette: 0, dither: true })] });
}
