const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const unpacked = path.join(dist, 'unpacked');
const zipPath = path.join(dist, 'suno-caption-studio.zip');
const include = [
  'manifest.json',
  'background.js',
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
  '_locales/en/messages.json',
  '_locales/ko/messages.json',
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
  'icons/brand/x.svg'
];

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

execFileSync(process.execPath, [path.join(__dirname, 'validate.js')], { stdio: 'inherit' });
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

const files = include.map((name) => ({
  name,
  data: fs.readFileSync(path.join(root, name))
}));

for (const file of files) {
  const destination = path.join(unpacked, file.name);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, file.data);
}

console.log(`Created ${path.relative(root, unpacked)}`);
fs.writeFileSync(zipPath, createZip(files));
console.log(`Created ${path.relative(root, zipPath)}`);

function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name.replace(/\\/g, '/'));
    const crc = crc32(file.data);
    const local = localHeader(name, file.data, crc);
    localParts.push(local, file.data);
    centralParts.push(centralHeader(name, file.data, crc, offset));
    offset += local.length + file.data.length;
  }

  const central = Buffer.concat(centralParts);
  const end = endRecord(files.length, central.length, offset);
  return Buffer.concat([...localParts, central, end]);
}

function localHeader(name, data, crc) {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(dosTime(), 10);
  header.writeUInt16LE(dosDate(), 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(name.length, 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, name]);
}

function centralHeader(name, data, crc, offset) {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(dosTime(), 12);
  header.writeUInt16LE(dosDate(), 14);
  header.writeUInt32LE(crc, 16);
  header.writeUInt32LE(data.length, 20);
  header.writeUInt32LE(data.length, 24);
  header.writeUInt16LE(name.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(offset, 42);
  return Buffer.concat([header, name]);
}

function endRecord(count, centralSize, centralOffset) {
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(count, 8);
  end.writeUInt16LE(count, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);
  return end;
}

function dosTime() {
  const now = new Date();
  return (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
}

function dosDate() {
  const now = new Date();
  return ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
