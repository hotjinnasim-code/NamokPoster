// Shared pieces of the airbrush motifs `moons` and `orbits` (the `planet` motif keeps its own code in scene.js):
// OKLab colours, where the copy sits, and the sprayed-paint GLSL kit (integer-hash noise, fbm, star field,
// OKLab → linear, ±1 LSB dither).

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** hex → OKLab Vector3 */
export function labOf(THREE, hex) {
  const c = new THREE.Color(hex);
  const l = Math.cbrt(0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b), m = Math.cbrt(0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b), s = Math.cbrt(0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b);
  return new THREE.Vector3(0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s);
}

/** The palette in OKLab, with the roles the planet motif uses. */
export function airColours(ctx) {
  const { THREE, palette } = ctx, cols = palette.colors, lab = (h) => labOf(THREE, h);
  const bg = lab(palette.bg), body = lab(cols[2] ?? palette.accent);
  return {
    bg, nebA: lab(cols[0]), nebB: lab(cols[1] ?? cols[0]), body, acc: lab(palette.accentOriginal ?? palette.accent),
    pale: cols[3] ? lab(cols[3]) : body.clone().lerp(new THREE.Vector3(0.97, 0, 0.01), 0.6), ink: lab(palette.ink), dark: bg.x < 0.55,
  };
}

/** Copy blocks, footer and header strips, and a signed distance (short-side units) from a frame point to the nearest block. */
export function copyLayout(ctx) {
  const sx = Math.max(ctx.aspect, 1), sy = Math.max(1 / ctx.aspect, 1);
  const quiet = (ctx.quiet || []).map(([x0, y0, x1, y1]) => ({ x0, y0, x1, y1 }));
  const strip = (r) => r.x0 <= 0.02 && r.x1 >= 0.98;
  const footer = quiet.find((r) => strip(r) && r.y1 >= 0.98 && r.y0 > 0.5), header = quiet.find((r) => strip(r) && r.y0 <= 0.02 && r.y1 < 0.5);
  const blocks = quiet.filter((r) => r !== footer && r !== header);
  const blockDist = (x, y) => { let d = 9; for (const b of blocks) { const ex = Math.max(b.x0 - x, x - b.x1) * sx, ey = Math.max(b.y0 - y, y - b.y1) * sy; d = Math.min(d, Math.hypot(Math.max(ex, 0), Math.max(ey, 0)) + Math.min(Math.max(ex, ey), 0)); } return d; };
  const copy = blocks[0];
  return { sx, sy, blocks, footer, header, footTop: footer ? footer.y0 : 1, headBot: header ? header.y1 : 0, blockDist, copy,
    ccx: copy ? (copy.x0 + copy.x1) / 2 : ctx.focus.x - 0.3, ccy: copy ? (copy.y0 + copy.y1) / 2 : ctx.focus.y - 0.3 };
}

export function blockUniform(THREE, lay) {
  return [0, 1, 2].map((i) => { const b = lay.blocks[i]; return !b ? new THREE.Vector4(3, 3, 3, 3) : new THREE.Vector4(b.x0, b.y0, b.x1, b.y1); });
}

/** GLSL: needs uniforms uPx (1 / short side px), uAsp, uBlock[3], uFoot, uHead declared by the caller's shader (they are here). */
export const GLSL_AIR = /* glsl */`
  uniform vec2 uAsp; uniform float uPx, uFoot, uHead; uniform vec4 uBlock[3];
  uint pcg(uint v){ uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
  uint hu(ivec2 p, uint s){ return pcg(uint(p.x) + pcg(uint(p.y) + pcg(s))); }
  float h21(ivec2 p, uint s){ return float(hu(p, s)) * (1.0 / 4294967295.0); }
  vec2 h22(ivec2 p, uint s){ uint h = hu(p, s); return vec2(float(h & 0xffffu), float(h >> 16u)) / 65535.0; }
  float gn(vec2 p, uint s){
    vec2 i = floor(p), f = p - i; ivec2 ii = ivec2(i); vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    float a = dot(h22(ii, s) * 2.0 - 1.0, f), b = dot(h22(ii + ivec2(1, 0), s) * 2.0 - 1.0, f - vec2(1.0, 0.0));
    float c = dot(h22(ii + ivec2(0, 1), s) * 2.0 - 1.0, f - vec2(0.0, 1.0)), d = dot(h22(ii + ivec2(1, 1), s) * 2.0 - 1.0, f - vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 1.5;
  }
  float fbm(vec2 p, uint s, int oct){ float a = 0.5, r = 0.0; for (int i = 0; i < 6; i++) { if (i >= oct) break; r += a * gn(p, s + uint(i)); p = mat2(1.62, 1.18, -1.18, 1.62) * p + vec2(13.1, -7.7); a *= 0.5; } return r; }
  vec3 lab2lin(vec3 c){
    float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z, m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z, s = c.x - 0.0894841775 * c.y - 1.291485548 * c.z;
    l = l * l * l; m = m * m * m; s = s * s * s;
    return vec3(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  }
  float quietDist(vec2 p){
    float d = 9.0;
    for (int i = 0; i < 3; i++) { vec4 r = uBlock[i]; vec2 e = (abs(p - 0.5 * (r.xy + r.zw)) - 0.5 * (r.zw - r.xy)) * uAsp; d = min(d, length(max(e, 0.0)) + min(max(e.x, e.y), 0.0)); }
    return d;
  }
  // calm.x: tight (crisp detail leaves the copy), calm.y: wide (clouds and glows thin out around it)
  vec2 calmAt(vec2 p, vec2 wq){
    float qd = quietDist(p) + 0.06 * gn(wq * 1.6, 3u);
    float edge = max(smoothstep(uFoot - 0.05, uFoot + 0.012, p.y), smoothstep(uHead + 0.05, uHead - 0.012, p.y));
    float edgeWide = max(smoothstep(uFoot - 0.2, uFoot + 0.05, p.y + 0.03 * gn(wq * 0.8, 8u)), smoothstep(uHead + 0.2, uHead - 0.05, p.y));
    return vec2(max(1.0 - smoothstep(-0.03, 0.14, qd), 0.75 * edge), max(1.0 - smoothstep(-0.02, 0.34, qd), 0.6 * edgeWide));
  }
  float starLayer(vec2 q, float cell, float radPx, float keep, uint s, out float tint){
    vec2 g = q / cell; ivec2 id = ivec2(floor(g)); vec2 f = g - floor(g);
    vec2 o = 0.18 + 0.64 * h22(id, s); float b = h21(id, s + 1u); tint = h21(id, s + 2u);
    float rad = uPx * radPx * (0.6 + 0.7 * b) / cell, aa = 0.7 * uPx / cell;
    return smoothstep(rad + aa, rad - aa, length(f - o)) * step(1.0 - keep, h21(id, s + 3u)) * (0.35 + 0.65 * b * b);
  }
  // a star field in OKLab: returns the colour to mix in (rgb) and its weight (a)
  vec4 stars(vec2 q, float rich, float calmx, float dark, vec3 cBg, vec3 cInk, vec3 cTint){
    float t1, t2, t3, big = mix(1.5, 1.0, dark);
    float s1 = starLayer(q, 0.0105, 0.55 * big, 0.55 + 0.3 * rich, 70u, t1) * mix(0.9, 0.55, dark);
    float s2 = starLayer(q + 0.37, 0.026, 0.95 * big, 0.5 + 0.3 * rich, 80u, t2) * mix(1.0, 0.8, dark);
    float s3 = starLayer(q + 0.71, 0.075, 1.55 * big, 0.42, 90u, t3);
    float tint = s3 > 0.0 ? t3 : s2 > 0.0 ? t2 : t1;
    vec3 c = vec3(mix(1.0, 0.985, dark), 0.0, 0.0) + vec3(0.0, 0.05, 0.06) * (tint - 0.5) * dark;
    if (dark < 0.5 && tint > 0.42) c = mix(cBg, mix(cInk, cTint, 0.45), 0.42);
    return vec4(c, clamp(s1 * (1.0 - 0.6 * calmx) + (s2 + s3) * (1.0 - 0.92 * calmx), 0.0, 1.0) * mix(0.85, 1.0, dark));
  }
  vec3 airDither(vec2 fc){ return vec3(h21(ivec2(fc), 5u) + h21(ivec2(fc), 6u) - 1.0) / 255.0; }
`;
