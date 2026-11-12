// Locate a usable Blender (the app, or the `bpy` Python module) and run the render script with it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { SKILL_ROOT } from './browser.mjs';

const RENDER_PY = path.join(SKILL_ROOT, 'scripts', 'blender', 'render.py');
export const BPY_VENV = path.join(os.homedir(), '.cache', 'namokposter', 'bpy-venv');

const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', timeout: 60000, ...opts });

function blenderCandidates() {
  const out = [];
  if (process.env.POSTER_BLENDER) out.push(process.env.POSTER_BLENDER);
  if (process.env.BLENDER_BIN) out.push(process.env.BLENDER_BIN);
  out.push('blender');
  if (process.platform === 'darwin') out.push('/Applications/Blender.app/Contents/MacOS/Blender', path.join(os.homedir(), 'Applications/Blender.app/Contents/MacOS/Blender'));
  if (process.platform === 'win32') {
    for (const root of [process.env['ProgramFiles'], process.env['ProgramFiles(x86)']].filter(Boolean)) {
      const dir = path.join(root, 'Blender Foundation');
      try { for (const d of fs.readdirSync(dir).sort().reverse()) out.push(path.join(dir, d, 'blender.exe')); } catch { /* none */ }
    }
  }
  if (process.platform === 'linux') {
    out.push('/usr/bin/blender', '/usr/local/bin/blender', '/snap/bin/blender', '/opt/blender/blender');
    try { for (const d of fs.readdirSync('/opt').filter((n) => /^blender/i.test(n)).sort().reverse()) out.push(path.join('/opt', d, 'blender')); } catch { /* none */ }
  }
  return out;
}

function pythonCandidates() {
  const out = [];
  if (process.env.POSTER_BPY_PYTHON) out.push(process.env.POSTER_BPY_PYTHON);
  const bin = process.platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python'];
  out.push(path.join(BPY_VENV, ...bin));
  out.push('python3', 'python');
  return out;
}

let cached;
/** Returns { kind: 'blender'|'bpy', cmd, version } or null. Result is memoised. */
export function findBlender({ refresh = false } = {}) {
  if (cached !== undefined && !refresh) return cached;
  for (const cmd of blenderCandidates()) {
    if (cmd.includes(path.sep) && !isFile(cmd)) continue;
    const r = run(cmd, ['--version']);
    const m = r.status === 0 && /Blender\s+(\d+\.\d+(?:\.\d+)?)/.exec(r.stdout ?? '');
    if (m) return (cached = { kind: 'blender', cmd, version: m[1] });
  }
  for (const cmd of pythonCandidates()) {
    if (cmd.includes(path.sep) && !isFile(cmd)) continue;
    const r = run(cmd, ['-c', 'import bpy;print("BPY", bpy.app.version_string)']);
    const m = r.status === 0 && /BPY\s+(\d+\.\d+(?:\.\d+)?)/.exec(r.stdout ?? '');
    if (m) return (cached = { kind: 'bpy', cmd, version: m[1] });
  }
  return (cached = null);
}

/**
 * Install Blender-as-a-module into a private virtualenv. Works without admin rights and without a
 * display. PyPI only publishes bpy wheels for the one Python version each Blender release is
 * built against, so try the interpreters that are around until one resolves.
 */
export function installBpy(log = console.log) {
  const pythons = [process.env.POSTER_PYTHON, 'python3.13', 'python3.11', 'python3.12', 'python3', 'python'].filter(Boolean);
  const venvPy = path.join(BPY_VENV, ...(process.platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python']));
  const errors = [];
  for (const py of pythons) {
    const v = run(py, ['-c', 'import sys;print("%d.%d"%sys.version_info[:2])']);
    if (v.status !== 0) continue;
    log(`  trying ${py} (Python ${v.stdout.trim()}) …`);
    fs.rmSync(BPY_VENV, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(BPY_VENV), { recursive: true });
    if (run(py, ['-m', 'venv', BPY_VENV], { timeout: 180000 }).status !== 0) { errors.push(`${py}: could not create venv`); continue; }
    const pip = run(venvPy, ['-m', 'pip', 'install', '--quiet', '--disable-pip-version-check', 'bpy'], { timeout: 1800000 });
    if (pip.status === 0 && run(venvPy, ['-c', 'import bpy']).status === 0) { cached = undefined; return findBlender({ refresh: true }); }
    errors.push(`${py}: ${(pip.stderr || pip.stdout || '').trim().split('\n').slice(-2).join(' ')}`);
  }
  fs.rmSync(BPY_VENV, { recursive: true, force: true });
  const err = new Error('Could not install bpy with any available Python.\n  ' + errors.join('\n  '));
  err.code = 'BPY_INSTALL_FAILED';
  throw err;
}

/** Render one Blender job (a JSON file read by scripts/blender/render.py). Resolves with the tail of the log. */
export function renderBlender(blender, jobFile, { timeoutMs = 3600000, onLine } = {}) {
  const args = blender.kind === 'blender'
    ? ['--background', '--factory-startup', '--python-exit-code', '3', '--python', RENDER_PY, '--', '--job', jobFile]
    : [RENDER_PY, '--job', jobFile];
  return new Promise((resolve, reject) => {
    const child = spawn(blender.cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONDONTWRITEBYTECODE: '1' } });
    const tail = [];
    const feed = (buf) => {
      for (const line of buf.toString().split(/\r?\n/)) {
        if (!line.trim()) continue;
        tail.push(line); if (tail.length > 60) tail.shift();
        if (onLine) onLine(line);
      }
    };
    child.stdout.on('data', feed); child.stderr.on('data', feed);
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`Blender render timed out after ${Math.round(timeoutMs / 1000)}s`)); }, timeoutMs);
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(tail.join('\n'));
      else reject(new Error(`Blender exited with code ${code}\n${tail.slice(-25).join('\n')}`));
    });
  });
}
