const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const required = [
  'manifest.json',
  'background.js',
  'content.js',
  'styles.css',
  'popup.html',
  'popup.css',
  'popup.js',
  '_locales/ko/messages.json',
  '_locales/en/messages.json',
  'icons/icon16.png',
  'icons/icon32.png',
  'icons/icon48.png',
  'icons/icon128.png',
  'icons/lucide/bot.svg',
  'icons/lucide/clock.svg',
  'icons/lucide/message-circle.svg',
  'icons/lucide/messages-square.svg',
  'icons/lucide/music-2.svg',
  'icons/lucide/settings.svg',
  'icons/lucide/share-2.svg',
  'icons/lucide/star.svg',
  'icons/lucide/user-round-check.svg',
  'icons/lucide/video.svg'
];

for (const file of required) {
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing required file: ${file}`);
  }
}

JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
JSON.parse(fs.readFileSync(path.join(root, '_locales/ko/messages.json'), 'utf8'));
JSON.parse(fs.readFileSync(path.join(root, '_locales/en/messages.json'), 'utf8'));

for (const size of [16, 32, 48, 128]) {
  const icon = fs.readFileSync(path.join(root, `icons/icon${size}.png`));
  const pngSignature = icon.subarray(0, 8).toString('hex');
  if (pngSignature !== '89504e470d0a1a0a') {
    throw new Error(`Invalid PNG icon: icon${size}.png`);
  }
}

console.log('Validation passed');
