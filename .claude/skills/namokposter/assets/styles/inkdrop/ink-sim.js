// Ink in water, simulated: a small 2D incompressible-flow solver in which jets of ink are released, and a
// lattice of tracer particles that rides along with the flow. The flow is kept as vorticity on a coarse
// periodic grid (semi-Lagrangian advection, buoyancy and nozzle thrust as sources, the stream function
// from an FFT Poisson solve). The fine filaments come from the tracers: every jet lays down rows of points
// across its nozzle step after step, the flow stretches and folds that sheet, and at the end each little
// quad of the lattice is filled with points that share its ink. Tracers move in the curl of the bilinear
// stream function, which is exactly divergence-free — so ink is stretched into ever finer lamellae, as real
// ink is, and never thins out into a fog. The result is a list of points [x, y, mass, ink] whose density is
// the picture. Pure JavaScript, no DOM, deterministic for a given rng.
//
//   simulateInk({ nx, ny, jets, maxSteps, M, rows, fill, ambient }, rng)        nx, ny: powers of two
//   jet: { x, y, dx, dy, radius, thrust, buoy, reach, inks: [ids], pulse, taper: [a, b] }   (lengths in grid cells, per step)
//   → { points: Float32Array (x, y, mass, ink)*, count, steps, bounds: [x0, y0, x1, y1] }

function makeFFT(n) {
  const rev = new Uint32Array(n), bits = Math.log2(n) | 0, cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
  for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); rev[i] = r; }
  for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos((2 * Math.PI * i) / n); sin[i] = Math.sin((2 * Math.PI * i) / n); }
  // in-place complex FFT of re[o + k*s], im[o + k*s], k = 0..n-1; dir = -1 forward, +1 inverse (unscaled)
  return (re, im, o, s, dir) => {
    for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { const a = o + i * s, b = o + j * s; let t = re[a]; re[a] = re[b]; re[b] = t; t = im[a]; im[a] = im[b]; im[b] = t; } }
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1, stride = n / len;
      for (let i = 0; i < n; i += len) for (let k = 0; k < half; k++) {
        const wr = cos[k * stride], wi = dir * sin[k * stride], a = o + (i + k) * s, b = a + half * s;
        const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
      }
    }
  };
}

export function simulateInk(cfg, rng) {
  const { nx, ny, jets } = cfg;
  const maxSteps = cfg.maxSteps ?? 700, M = cfg.M ?? 96, rows = cfg.rows ?? 2, fill = cfg.fill ?? 10, ambient = cfg.ambient ?? 0.04;
  const n = nx * ny, mx = nx - 1, my = ny - 1;                                 // nx, ny powers of two → wrap with &
  let w = new Float32Array(n), bx = new Float32Array(n), by = new Float32Array(n), w2 = new Float32Array(n), bx2 = new Float32Array(n), by2 = new Float32Array(n);
  const u = new Float32Array(n), v = new Float32Array(n), psi = new Float32Array(n), fxs = new Float32Array(n), fys = new Float32Array(n);
  const re = new Float64Array(n), im = new Float64Array(n), fftX = makeFFT(nx), fftY = makeFFT(ny);
  const inv = new Float64Array(n);                                              // -1 / eigenvalue of the 5-point Laplacian, scaled for the unnormalised FFT pair
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const l = 2 * Math.cos((2 * Math.PI * i) / nx) + 2 * Math.cos((2 * Math.PI * j) / ny) - 4; inv[i + j * nx] = i + j === 0 ? 0 : -1 / (l * n); }

  // ---- a faint ambient swirl so that nothing stays symmetric
  for (let k = 0; k < 7; k++) {
    const kx = Math.round(rng.range(-3, 3)), ky = Math.round(rng.range(-3, 3)), ph = rng() * 6.2832, f = Math.hypot((2 * Math.PI * kx) / nx, (2 * Math.PI * ky) / ny);
    if (f === 0) continue;
    const a = (ambient * f * (0.5 + rng())) / 2.6;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) w[i + j * nx] += a * Math.sin((2 * Math.PI * (kx * i)) / nx + (2 * Math.PI * (ky * j)) / ny + ph);
  }

  // ---- tracers: per jet a lattice of M columns × (rows per step) rows
  const J = jets.map((jet) => {
    const cap = M * rows * maxSteps;
    return { ...jet, px: -jet.dy, py: jet.dx, tx: new Float32Array(cap), ty: new Float32Array(cap), rowMass: new Float32Array(rows * maxSteps), rowSplit: new Float32Array(rows * maxSteps * 2), nRows: 0, progress: 0, gain: 1,
      ph: [rng() * 6.28, rng() * 6.28, rng() * 6.28, rng() * 6.28], inks: jet.inks ?? [0], vloc: 0 };
  });
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  const advect = (src, dst) => {
    for (let j = 0, k = 0; j < ny; j++) for (let i = 0; i < nx; i++, k++) {
      const x = i - u[k] + nx, y = j - v[k] + ny, xf = Math.floor(x), yf = Math.floor(y), fx = x - xf, fy = y - yf;
      const i0 = xf & mx, i1 = (xf + 1) & mx, j0 = (yf & my) * nx, j1 = ((yf + 1) & my) * nx;
      dst[k] = (src[i0 + j0] * (1 - fx) + src[i1 + j0] * fx) * (1 - fy) + (src[i0 + j1] * (1 - fx) + src[i1 + j1] * fx) * fy;
    }
  };
  const solve = () => {
    for (let k = 0; k < n; k++) { re[k] = w[k]; im[k] = 0; }
    for (let j = 0; j < ny; j++) fftX(re, im, j * nx, 1, -1);
    for (let i = 0; i < nx; i++) fftY(re, im, i, nx, -1);
    for (let k = 0; k < n; k++) { re[k] *= inv[k]; im[k] *= inv[k]; }
    for (let j = 0; j < ny; j++) fftX(re, im, j * nx, 1, 1);
    for (let i = 0; i < nx; i++) fftY(re, im, i, nx, 1);
    for (let k = 0; k < n; k++) psi[k] = re[k];
    // velocity at the grid nodes: u = dpsi/dy, v = -dpsi/dx
    for (let j = 0; j < ny; j++) { const ju = ((j - 1) & my) * nx, jd = ((j + 1) & my) * nx, jj = j * nx; for (let i = 0; i < nx; i++) { u[i + jj] = 0.5 * (psi[i + jd] - psi[i + ju]); v[i + jj] = -0.5 * (psi[((i + 1) & mx) + jj] - psi[((i - 1) & mx) + jj]); } }
  };

  let step = 0;
  solve();
  for (; step < maxSteps; step++) {
    // 1. the nozzles: thrust and buoyancy of the fresh ink, tracer rows
    let allDone = true;
    fxs.fill(0); fys.fill(0);
    for (const jet of J) {
      const f = jet.progress / jet.reach;
      const g = (1 - sstep(jet.taper?.[0] ?? 0.5, jet.taper?.[1] ?? 0.86, f)) * (1 + (jet.pulse ?? 0.5) * Math.exp(-step / 30)) * (1 + (jet.beat ?? 0) * Math.sin(step * (jet.beatRate ?? 0.07) + jet.ph[2]));
      jet.gain = g; if (f < 1) allDone = false;
      if (g < 0.03) continue;
      const wob = 0.45 * Math.sin(step * 0.071 + jet.ph[0]) + 0.3 * Math.sin(step * 0.173 + jet.ph[1]);
      const cx = jet.x + jet.px * wob * jet.radius * 0.5, cy = jet.y + jet.py * wob * jet.radius * 0.5;
      const sway = 0.2 * Math.sin(step * 0.05 + jet.ph[2]) + 0.12 * Math.sin(step * 0.13 + jet.ph[3]);      // the jet direction sways a little
      const ddx = jet.dx + jet.px * sway, ddy = jet.dy + jet.py * sway, dl = Math.hypot(ddx, ddy), dx = ddx / dl, dy = ddy / dl;
      const rn = jet.radius * (0.4 + 0.6 * Math.min(g, 1.25)), R = rn * 1.6;
      const ic = Math.round(cx), jc = Math.round(cy), rr = Math.ceil(R) + 1;
      for (let j = jc - rr; j <= jc + rr; j++) for (let i = ic - rr; i <= ic + rr; i++) {
        const d = Math.hypot(i - cx, j - cy) / rn, wt = 1 - sstep(0.5, 1.6, d); if (wt <= 0) continue;
        const k = (i & mx) + (j & my) * nx;
        fxs[k] += jet.thrust * g * dx * wt; fys[k] += jet.thrust * g * dy * wt;
        bx[k] += (jet.buoy * dx - bx[k]) * wt; by[k] += (jet.buoy * dy - by[k]) * wt;
      }
      const kc = (ic & mx) + (jc & my) * nx, vl = Math.max(0.12, u[kc] * dx + v[kc] * dy); jet.vloc = vl;
      for (let r = 0; r < rows; r++) {
        const back = (r / rows) * vl, row = jet.nRows++, o = row * M, px = -dy, py = dx;
        for (let i = 0; i < M; i++) { const s = -1 + (2 * i) / (M - 1); jet.tx[o + i] = cx + px * s * rn - dx * back; jet.ty[o + i] = cy + py * s * rn - dy * back; }
        jet.rowMass[row] = ((2 * rn) / (M - 1)) * (vl / rows);
        // where the nozzle is split between this jet's inks (drifts with time, so the colours braid)
        jet.rowSplit[row * 2] = -0.25 + 0.5 * Math.sin(step * 0.043 + jet.ph[1]) + 0.25 * Math.sin(step * 0.117 + jet.ph[3]);
        jet.rowSplit[row * 2 + 1] = 0.45 + 0.35 * Math.sin(step * 0.057 + jet.ph[0]);
      }
    }
    if (allDone) break;

    // 2. vorticity sources: curl of (buoyancy + thrust)
    for (let k = 0; k < n; k++) { fxs[k] += bx[k]; fys[k] += by[k]; bx[k] *= 0.9975; by[k] *= 0.9975; }
    for (let j = 0; j < ny; j++) { const ju = ((j - 1) & my) * nx, jd = ((j + 1) & my) * nx, jj = j * nx; for (let i = 0; i < nx; i++) w[i + jj] += 0.5 * (fys[((i + 1) & mx) + jj] - fys[((i - 1) & mx) + jj]) - 0.5 * (fxs[i + jd] - fxs[i + ju]); }

    // 3. advect vorticity and buoyancy, then the new stream function
    advect(w, w2); advect(bx, bx2); advect(by, by2);
    let t = w; w = w2; w2 = t; t = bx; bx = bx2; bx2 = t; t = by; by = by2; by2 = t;
    solve();

    // 4. carry the tracers (midpoint rule) in the curl of the bilinear stream function
    for (const jet of J) {
      const cnt = jet.nRows * M, tx = jet.tx, ty = jet.ty; let far = jet.progress;
      for (let q = 0; q < cnt; q++) {
        let x = tx[q], y = ty[q];
        let xf = Math.floor(x), yf = Math.floor(y), fx = x - xf, fy = y - yf, i0 = xf & mx, i1 = (xf + 1) & mx, j0 = (yf & my) * nx, j1 = ((yf + 1) & my) * nx;
        let p00 = psi[i0 + j0], p10 = psi[i1 + j0], p01 = psi[i0 + j1], p11 = psi[i1 + j1];
        const xm = x + 0.5 * ((p01 - p00) * (1 - fx) + (p11 - p10) * fx), ym = y - 0.5 * ((p10 - p00) * (1 - fy) + (p11 - p01) * fy);
        xf = Math.floor(xm); yf = Math.floor(ym); fx = xm - xf; fy = ym - yf; i0 = xf & mx; i1 = (xf + 1) & mx; j0 = (yf & my) * nx; j1 = ((yf + 1) & my) * nx;
        p00 = psi[i0 + j0]; p10 = psi[i1 + j0]; p01 = psi[i0 + j1]; p11 = psi[i1 + j1];
        x += (p01 - p00) * (1 - fx) + (p11 - p10) * fx; y -= (p10 - p00) * (1 - fy) + (p11 - p01) * fy;
        tx[q] = x; ty[q] = y;
        const pr = (x - jet.x) * jet.dx + (y - jet.y) * jet.dy; if (pr > far) far = pr;
      }
      jet.progress = far;
    }
  }

  // ---- fill the lattice. The simulated plane is read as a cut through a round jet: the tracer that left the
  // nozzle at +rho and its mirror image from -rho are the two ends of one ring of ink seen edge-on, so every
  // sample is placed somewhere on the chord between them (uniform in angle round the ring: the ink piles up
  // at the limbs, as it does on a real veil) — with a few azimuthal ripples so that the bells are not lathed.
  const half = M >> 1;
  let quads = 0; for (const jet of J) quads += Math.max(0, jet.nRows - 1) * (half - 1);
  const out = new Float32Array(quads * fill * 4); let c = 0, bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
  for (const jet of J) {
    const { tx, ty, inks } = jet, maxEdge = Math.max(nx, ny) * 0.12, rip = jet.ripple ?? 1;
    const modes = [2, 3, 5, 7].map((m) => [m, rng() * 6.2832, rng.range(-0.012, 0.012), rng.range(0.035, 0.085) * rip, rng() * 6.2832]);
    const sA = rng() * 6.2832, sB = rng() * 6.2832;
    const limbN = Math.round(fill * (jet.limb ?? 0.15));
    for (let r = 0; r + 1 < jet.nRows; r++) {
      const age = 1 - r / jet.nRows;                                             // 1 = the first ink out (the head) … 0 = the tail
      for (let i = half; i + 1 < M; i++) {
        const a = r * M + i, b = a + 1, d = a + M, e = d + 1, la = r * M + (M - 1 - i), lb = la - 1, ld = la + M, le = ld - 1;
        const x00 = tx[a], y00 = ty[a], x10 = tx[b], y10 = ty[b], x01 = tx[d], y01 = ty[d], x11 = tx[e], y11 = ty[e];
        const u00 = tx[la], v00 = ty[la], u10 = tx[lb], v10 = ty[lb], u01 = tx[ld], v01 = ty[ld], u11 = tx[le], v11 = ty[le];
        if (Math.abs(x10 - x00) + Math.abs(y10 - y00) > maxEdge || Math.abs(x01 - x00) + Math.abs(y01 - y00) > maxEdge || Math.abs(x11 - x00) + Math.abs(y11 - y00) > maxEdge) continue;
        if (Math.abs(u10 - u00) + Math.abs(v10 - v00) > maxEdge || Math.abs(u01 - u00) + Math.abs(v01 - v00) > maxEdge || Math.abs(u11 - u00) + Math.abs(v11 - v00) > maxEdge) continue;
        for (let k = 0; k < fill; k++) {
          const fa = rng(), fb = rng(), th = rng() * 6.2832;
          const rx = (x00 * (1 - fa) + x10 * fa) * (1 - fb) + (x01 * (1 - fa) + x11 * fa) * fb, ry = (y00 * (1 - fa) + y10 * fa) * (1 - fb) + (y01 * (1 - fa) + y11 * fa) * fb;
          const lx = (u00 * (1 - fa) + u10 * fa) * (1 - fb) + (u01 * (1 - fa) + u11 * fa) * fb, ly = (v00 * (1 - fa) + v10 * fa) * (1 - fb) + (v01 * (1 - fa) + v11 * fa) * fb;
          const rho = (2 * (i + fa) - (M - 1)) / (M - 1), conc = Math.pow(Math.max(0, 1 - rho * rho), 0.5);
          let rad = 1, lift = 0;
          for (const [m, ph, dr, amp, ph2] of modes) { const w8 = amp * (0.35 + 0.65 * age); rad += w8 * Math.cos(m * th + ph + dr * r); lift += w8 * Math.sin(m * th + ph2 - dr * r); }
          const hx = 0.5 * (rx - lx), hy = 0.5 * (ry - ly), hl = Math.hypot(hx, hy), ct = k < limbN ? (th < 3.1416 ? 1 : -1) : Math.cos(th) * rad;   // a share of the ink sits exactly on the limb: the crisp filaments
          const x = 0.5 * (rx + lx) + hx * ct + jet.dx * hl * lift, y = 0.5 * (ry + ly) + hy * ct + jet.dy * hl * lift;
          const split = 0.52 + 0.3 * Math.sin(th + sA + r * 0.013) + 0.14 * Math.sin(3 * th + sB - r * 0.02);
          const ink = inks.length === 1 ? inks[0] : inks.length === 2 ? (rho < split ? inks[0] : inks[1]) : (rho < split - 0.14 ? inks[0] : rho < split + 0.2 ? inks[1] : inks[2]);
          out[c++] = x; out[c++] = y; out[c++] = (jet.rowMass[r] * conc * rho * Math.min(1, rho * 5) * 4) / fill; out[c++] = ink;
          if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
        }
      }
    }
  }
  return { points: out.subarray(0, c), count: c / 4, steps: step, bounds: [bx0, by0, bx1, by1] };
}
