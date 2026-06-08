#!/usr/bin/env node
/**
 * Generates Cr_oss PNG icons for the Office manifest.
 * No dependencies — writes raw PNG bytes for 16, 32, and 80 px squares.
 */
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public', 'assets');

const COLORS = {
  bg: [0x25, 0x25, 0x25],
  red: [0xc4, 0x2b, 0x1c],
  blue: [0x00, 0x78, 0xd4],
  white: [0xf3, 0xf2, 0xf1],
};

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  const crcInput = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(crcInput));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function setPixel(pixels, size, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) {
    return;
  }

  const offset = (y * size + x) * 3;
  pixels[offset] = color[0];
  pixels[offset + 1] = color[1];
  pixels[offset + 2] = color[2];
}

function fillRect(pixels, size, x0, y0, x1, y1, color) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      setPixel(pixels, size, x, y, color);
    }
  }
}

function isInsideRoundedRect(x, y, size, margin, radius) {
  const left = margin;
  const top = margin;
  const right = size - margin - 1;
  const bottom = size - margin - 1;

  if (x < left || x > right || y < top || y > bottom) {
    return false;
  }

  const corners = [
    [left + radius, top + radius],
    [right - radius, top + radius],
    [left + radius, bottom - radius],
    [right - radius, bottom - radius],
  ];

  for (const [cx, cy] of corners) {
    if (x < left + radius && y < top + radius && x < cx && y < cy) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > radius * radius) {
        return false;
      }
    }
    if (x > right - radius && y < top + radius && x > cx && y < cy) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > radius * radius) {
        return false;
      }
    }
    if (x < left + radius && y > bottom - radius && x < cx && y > cy) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > radius * radius) {
        return false;
      }
    }
    if (x > right - radius && y > bottom - radius && x > cx && y > cy) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > radius * radius) {
        return false;
      }
    }
  }

  return true;
}

function drawLine(pixels, size, x0, x1, y, thickness, color, gap = null) {
  const yStart = y - Math.floor(thickness / 2);
  const yEnd = yStart + thickness - 1;
  const gapStart = gap ? gap.start : null;
  const gapEnd = gap ? gap.end : null;

  for (let x = x0; x <= x1; x++) {
    if (gapStart !== null && x >= gapStart && x <= gapEnd) {
      continue;
    }

    fillRect(pixels, size, x, yStart, x, yEnd, color);
  }
}

function createIconPng(size) {
  const pixels = Buffer.alloc(size * size * 3, 0xff);
  const margin = Math.max(1, Math.round(size * 0.1));
  const radius = Math.max(2, Math.round(size * 0.2));
  const lineThickness = Math.max(1, Math.round(size / 14));
  const pad = margin + Math.max(2, Math.round(size * 0.12));
  const lineLeft = pad;
  const lineRight = size - pad - 1;
  const gapCenter = Math.floor((lineLeft + lineRight) / 2);
  const gapHalf = Math.max(1, Math.round(size * 0.08));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (isInsideRoundedRect(x, y, size, margin, radius)) {
        setPixel(pixels, size, x, y, COLORS.bg);
      }
    }
  }

  const redY = Math.round(size * 0.4);
  const blueY = Math.round(size * 0.58);

  drawLine(pixels, size, lineLeft, lineRight, redY, lineThickness, COLORS.red, {
    start: gapCenter - gapHalf,
    end: gapCenter + gapHalf,
  });
  drawLine(
    pixels,
    size,
    gapCenter + gapHalf + 1,
    lineRight,
    blueY,
    lineThickness,
    COLORS.blue,
  );

  if (size >= 32) {
    const markSize = Math.max(2, Math.round(size * 0.09));
    const markX = lineLeft;
    const markY = Math.round(size * 0.28);
    fillRect(pixels, size, markX, markY, markX + markSize - 1, markY + markSize - 1, COLORS.white);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const row = Buffer.alloc(1 + size * 3);
  const rawRows = [];
  for (let y = 0; y < size; y++) {
    row[0] = 0;
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 3;
      const o = 1 + x * 3;
      row[o] = pixels[offset];
      row[o + 1] = pixels[offset + 1];
      row[o + 2] = pixels[offset + 2];
    }
    rawRows.push(Buffer.from(row));
  }

  const compressed = deflateSync(Buffer.concat(rawRows));

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function main() {
  await mkdir(outDir, { recursive: true });
  for (const size of [16, 32, 80]) {
    const path = join(outDir, `icon-${size}.png`);
    await new Promise((resolve, reject) => {
      const stream = createWriteStream(path);
      stream.on('finish', resolve);
      stream.on('error', reject);
      stream.end(createIconPng(size));
    });
    console.log(`Wrote ${path}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
