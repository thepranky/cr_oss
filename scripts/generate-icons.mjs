#!/usr/bin/env node
/**
 * Generates Cr_oss PNG icons for the Office manifest.
 * Renders "Cr" in Newsreader (white on black) via sharp + embedded TTF.
 */
import { readFileSync } from 'node:fs';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public', 'assets');
const fontPath = join(__dirname, 'fonts', 'Newsreader-Regular.ttf');
const fontBase64 = readFileSync(fontPath).toString('base64');

/** Render large, then downscale for clean edges on tiny Office icon sizes. */
const RENDER_SIZE = 512;

function buildSvg(size) {
  const fontSize = Math.round(size * 0.52);
  const centerY = Math.round(size * 0.56);

  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <style>
      @font-face {
        font-family: 'Newsreader';
        src: url('data:font/ttf;base64,${fontBase64}') format('truetype');
        font-weight: 400;
        font-style: normal;
      }
      text {
        font-family: 'Newsreader', Georgia, serif;
        font-weight: 400;
        text-rendering: geometricPrecision;
      }
    </style>
  </defs>
  <rect width="${size}" height="${size}" fill="#000000"/>
  <text
    x="${size / 2}"
    y="${centerY}"
    font-size="${fontSize}"
    fill="#FFFFFF"
    text-anchor="middle"
    dominant-baseline="middle"
  >Cr</text>
</svg>`);
}

async function createIconPng(targetSize) {
  return sharp(buildSvg(RENDER_SIZE))
    .png()
    .resize(targetSize, targetSize, { kernel: 'lanczos3' })
    .toBuffer();
}

async function main() {
  await mkdir(outDir, { recursive: true });

  const sizes = [16, 32, 80];

  for (const size of sizes) {
    const path = join(outDir, `icon-${size}.png`);
    const png = await createIconPng(size);

    await new Promise((resolve, reject) => {
      const stream = createWriteStream(path);
      stream.on('finish', resolve);
      stream.on('error', reject);
      stream.end(png);
    });

    console.log(`Wrote ${path}`);
  }

  const previewPath = join(outDir, 'logo.png');
  await sharp(buildSvg(RENDER_SIZE)).png().toFile(previewPath);
  console.log(`Wrote ${previewPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
