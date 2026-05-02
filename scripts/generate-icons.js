const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const outDir = path.resolve(__dirname, '..', 'icons');
const sizes = [16, 32, 48, 128];

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type);
  const size = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([size, name, data, checksum]);
}

function encodePng(size, pixels) {
  const scanlines = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    scanlines[row] = 0;
    pixels.copy(scanlines, row + 1, y * size * 4, (y + 1) * size * 4);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function paintIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const mix = (x + y) / (size * 2);
      pixels[i] = Math.round(7 + 15 * mix);
      pixels[i + 1] = Math.round(36 + 78 * (x / size));
      pixels[i + 2] = Math.round(64 + 96 * (y / size));
      pixels[i + 3] = 255;
    }
  }

  roundedRect(pixels, size, 0.14, 0.16, 0.72, 0.68, 0.14, [248, 250, 252, 238]);
  roundedRect(pixels, size, 0.23, 0.27, 0.54, 0.08, 0.025, [14, 165, 233, 235]);
  roundedRect(pixels, size, 0.23, 0.43, 0.38, 0.07, 0.025, [30, 41, 59, 210]);
  roundedRect(pixels, size, 0.23, 0.56, 0.46, 0.07, 0.025, [30, 41, 59, 185]);
  roundedRect(pixels, size, 0.62, 0.62, 0.2, 0.16, 0.05, [34, 197, 94, 235]);

  const cx = size * 0.72;
  const cy = size * 0.7;
  line(pixels, size, cx - size * 0.07, cy, cx + size * 0.07, cy, [15, 23, 42, 230]);
  line(pixels, size, cx, cy - size * 0.07, cx, cy + size * 0.07, [15, 23, 42, 230]);
  return pixels;
}

function roundedRect(pixels, size, rx, ry, rw, rh, rr, color) {
  const x = rx * size;
  const y = ry * size;
  const width = rw * size;
  const height = rh * size;
  const radius = rr * size;
  for (let py = Math.floor(y); py < Math.ceil(y + height); py += 1) {
    for (let px = Math.floor(x); px < Math.ceil(x + width); px += 1) {
      const nx = px < x + radius ? x + radius : px > x + width - radius ? x + width - radius : px;
      const ny = py < y + radius ? y + radius : py > y + height - radius ? y + height - radius : py;
      const dx = px - nx;
      const dy = py - ny;
      if (dx * dx + dy * dy <= radius * radius + 0.8) {
        blend(pixels, size, px, py, color);
      }
    }
  }
}

function line(pixels, size, x1, y1, x2, y2, color) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1);
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const x = Math.round(x1 + (x2 - x1) * t);
    const y = Math.round(y1 + (y2 - y1) * t);
    blend(pixels, size, x, y, color);
  }
}

function blend(pixels, size, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) {
    return;
  }
  const i = (y * size + x) * 4;
  const alpha = color[3] / 255;
  pixels[i] = Math.round(color[0] * alpha + pixels[i] * (1 - alpha));
  pixels[i + 1] = Math.round(color[1] * alpha + pixels[i + 1] * (1 - alpha));
  pixels[i + 2] = Math.round(color[2] * alpha + pixels[i + 2] * (1 - alpha));
  pixels[i + 3] = 255;
}

fs.mkdirSync(outDir, { recursive: true });
for (const size of sizes) {
  fs.writeFileSync(path.join(outDir, `icon${size}.png`), encodePng(size, paintIcon(size)));
}

console.log(`Generated icons: ${sizes.join(', ')}`);
