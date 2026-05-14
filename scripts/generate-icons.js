#!/usr/bin/env node
// Resize the source logo (logo.png) into the four icon sizes Chrome expects.
// Uses macOS `sips`. On Linux, install ImageMagick and replace the command
// invocation with `convert` if needed.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'logo.png');
const outDir = path.join(root, 'icons');
const sizes = [16, 32, 48, 128];

if (!fs.existsSync(source)) {
  console.error(`Source logo not found at ${source}`);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

for (const size of sizes) {
  const target = path.join(outDir, `icon${size}.png`);
  if (size === 128) {
    fs.copyFileSync(source, target);
    continue;
  }
  execFileSync('sips', ['-z', String(size), String(size), source, '--out', target], {
    stdio: ['ignore', 'ignore', 'inherit']
  });
}

console.log(`Generated icons from ${path.relative(root, source)}: ${sizes.join(', ')}`);
