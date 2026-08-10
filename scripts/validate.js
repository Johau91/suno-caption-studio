const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const required = [
  'manifest.json',
  'background.js',
  'zip.js',
  'content.js',
  'styles.css',
  'popup.html',
  'popup.css',
  'popup.js',
  'options.html',
  'options.css',
  'options.js',
  'welcome.html',
  'welcome.css',
  'welcome.js',
  'i18n.js',
  'logo.png',
  '_locales/ko/messages.json',
  '_locales/en/messages.json',
  'icons/icon16.png',
  'icons/icon32.png',
  'icons/icon48.png',
  'icons/icon128.png',
  'icons/suno.png',
  'icons/lucide/bot.svg',
  'icons/lucide/clock.svg',
  'icons/lucide/external-link.svg',
  'icons/lucide/link-2.svg',
  'icons/lucide/message-circle.svg',
  'icons/lucide/messages-square.svg',
  'icons/lucide/music-2.svg',
  'icons/lucide/settings.svg',
  'icons/lucide/share-2.svg',
  'icons/lucide/star.svg',
  'icons/lucide/user-round-check.svg',
  'icons/lucide/video.svg',
  'icons/brand/discord.svg',
  'icons/brand/kakaotalk.svg',
  'icons/brand/naver.svg',
  'icons/brand/threads.svg',
  'icons/brand/webwoori.svg',
  'icons/brand/x.svg',
  'icons/brand/youtube.svg'
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

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (manifest.version !== pkg.version) {
  throw new Error(`Version mismatch: manifest ${manifest.version}, package ${pkg.version}`);
}

const jsFiles = fs.readdirSync(root)
  .filter((name) => name.endsWith('.js'))
  .concat(fs.readdirSync(path.join(root, 'scripts')).filter((name) => name.endsWith('.js')).map((name) => `scripts/${name}`));
for (const file of jsFiles) {
  execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'pipe' });
}

const i18nContext = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'i18n.js'), 'utf8'), i18nContext);
const { dict, SUPPORTED_LANGS } = i18nContext.window.SCS_I18N;
const baseKeys = Object.keys(dict.ko).sort();
for (const lang of SUPPORTED_LANGS) {
  const keys = Object.keys(dict[lang] || {}).sort();
  const missing = baseKeys.filter((key) => !keys.includes(key));
  const extra = keys.filter((key) => !baseKeys.includes(key));
  if (missing.length || extra.length) {
    throw new Error(`i18n key mismatch (${lang}): missing [${missing.join(', ')}], extra [${extra.join(', ')}]`);
  }
}

for (const file of ['popup.html', 'options.html', 'welcome.html']) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const matches = html.matchAll(/data-i18n(?:-title|-tooltip|-aria-label|-placeholder)?="([^"]+)"/g);
  for (const match of matches) {
    if (!Object.prototype.hasOwnProperty.call(dict.ko, match[1])) {
      throw new Error(`Unknown i18n key in ${file}: ${match[1]}`);
    }
  }
}

const packageSource = fs.readFileSync(path.join(root, 'scripts/package.js'), 'utf8');
for (const file of required) {
  if (!packageSource.includes(`'${file}'`)) {
    throw new Error(`Packaging list is missing required file: ${file}`);
  }
}

for (const size of [16, 32, 48, 128]) {
  const icon = fs.readFileSync(path.join(root, `icons/icon${size}.png`));
  const pngSignature = icon.subarray(0, 8).toString('hex');
  if (pngSignature !== '89504e470d0a1a0a') {
    throw new Error(`Invalid PNG icon: icon${size}.png`);
  }
}

console.log('Validation passed');
