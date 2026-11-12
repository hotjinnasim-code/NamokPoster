// Print density: every raster the skill writes says how many pixels make an inch (300 unless the
// format gives its own dpi), so a print shop or a layout program opens it at its true size instead
// of at 72 dpi. Pixels are not touched — only the header of the file.
import fs from 'node:fs';

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

/** PNG: write (or replace) the pHYs chunk — pixels per metre — ahead of the image data. */
function tagPng(buf, dpi) {
  if (buf.length < 16 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  const body = Buffer.alloc(13); body.write('pHYs', 0, 'ascii');
  const ppm = Math.round(dpi / 0.0254); body.writeUInt32BE(ppm, 4); body.writeUInt32BE(ppm, 8); body[12] = 1;
  const chunk = Buffer.alloc(21); chunk.writeUInt32BE(9, 0); body.copy(chunk, 4); chunk.writeUInt32BE(crc32(body), 17);
  const parts = []; let o = 8, placed = false;
  parts.push(buf.subarray(0, 8));
  while (o + 12 <= buf.length) {
    const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8), end = o + 12 + len;
    if (type === 'pHYs') { o = end; continue; }                       // an earlier density gives way
    if (!placed && (type === 'IDAT' || type === 'IEND')) { parts.push(chunk); placed = true; }
    if (type === 'IDAT') { parts.push(buf.subarray(o)); o = buf.length; break; }   // the rest is image data: copy it whole
    parts.push(buf.subarray(o, end)); o = end;
  }
  return placed ? Buffer.concat(parts) : null;
}

/** JPEG: set the density in the JFIF header (dots per inch), adding the header if the file has none. */
function tagJpeg(buf, dpi) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  const d = Math.max(1, Math.min(65535, Math.round(dpi)));
  if (buf[2] === 0xff && buf[3] === 0xe0 && buf.toString('ascii', 6, 11) === 'JFIF\0') {
    const out = Buffer.from(buf); out[13] = 1; out.writeUInt16BE(d, 14); out.writeUInt16BE(d, 16); return out;
  }
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x02, 0x01, d >> 8, d & 0xff, d >> 8, d & 0xff, 0x00, 0x00]);
  return Buffer.concat([buf.subarray(0, 2), app0, buf.subarray(2)]);
}

/** Stamp a PNG or JPEG file with its print density. Returns true when the file was tagged. */
export function tagDensity(file, dpi) {
  try {
    const buf = fs.readFileSync(file);
    const out = /\.png$/i.test(file) ? tagPng(buf, dpi) : /\.jpe?g$/i.test(file) ? tagJpeg(buf, dpi) : null;
    if (!out) return false;
    fs.writeFileSync(file, out);
    return true;
  } catch { return false; }   // the image itself is fine; only the density note is missing
}
