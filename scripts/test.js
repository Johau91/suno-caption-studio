const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

async function main() {
  testExportHelpers();
  testI18n();
  await testZip();
  console.log('Functional tests passed');
}

function testExportHelpers() {
  const hooks = {};
  const context = {
    __SCS_TEST_HOOKS__: hooks,
    Blob,
    URL,
    clearTimeout,
    setTimeout,
    chrome: {
      runtime: { onMessage: { addListener() {} } },
      storage: { onChanged: { addListener() {} } }
    }
  };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'content.js'), 'utf8'), context);

  assert.strictEqual(hooks.formatLrcTime(65.349), '[01:05.34]');
  assert.strictEqual(hooks.formatSrtTime(3661.009), '01:01:01,009');
  assert.strictEqual(hooks.cleanExportText('[Chorus]', 'strong'), '');
  assert.strictEqual(hooks.cleanExportText('hello / [ad-lib] world~', 'strong'), 'hello world');
  assert.strictEqual(hooks.slugify('A/B: C?'), 'AB-C');

  // Orphaned content scripts (extension updated while a Suno tab was open) must
  // be recognised so the user gets a "reload the page" toast instead of silence.
  assert.strictEqual(hooks.isContextInvalidatedError(new Error('Extension context invalidated.')), true);
  assert.strictEqual(hooks.isContextInvalidatedError(new Error('Could not establish connection. Receiving end does not exist.')), true);
  assert.strictEqual(hooks.isContextInvalidatedError(new Error('Suno API 응답 오류 (500)')), false);
  assert.strictEqual(hooks.isContextInvalidatedError(null), false);

  const normalized = hooks.normalizeLines([
    { text: 'one', start: 0, end: 1.2 },
    { text: 'two', start: 1.2, end: 2.4 }
  ], 2.4);
  assert.strictEqual(normalized.length, 2);
  assert.deepStrictEqual({ ...normalized[1] }, { text: 'two', start: 1.2, end: 2.4 });
}

function testI18n() {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'i18n.js'), 'utf8'), context);
  const i18n = context.window.SCS_I18N;
  for (const lang of i18n.SUPPORTED_LANGS) {
    const label = i18n.t(lang, 'content.loaded', { count: 7 });
    assert.ok(label.includes('7'), `content.loaded interpolation failed for ${lang}`);
  }
}

async function testZip() {
  const context = { ArrayBuffer, Blob, DataView, Date, TextEncoder, Uint32Array, window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'zip.js'), 'utf8'), context);
  const blob = context.window.SCS_ZIP.create([
    { name: '01 안녕.lrc', content: '[00:00.00]안녕' },
    { name: '02 hello.txt', content: 'hello' }
  ]);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer);
  assert.strictEqual(view.getUint32(0, true), 0x04034b50);
  assert.strictEqual(view.getUint16(6, true) & 0x0800, 0x0800, 'UTF-8 filename flag missing');
  assert.strictEqual(view.getUint32(bytes.length - 22, true), 0x06054b50);
  assert.strictEqual(view.getUint16(bytes.length - 12, true), 2);
  const nameLength = view.getUint16(26, true);
  const name = new TextDecoder().decode(bytes.slice(30, 30 + nameLength));
  assert.strictEqual(name, '01 안녕.lrc');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
