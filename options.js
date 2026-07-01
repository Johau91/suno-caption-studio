const STORAGE_KEY = 'sunoCaptionStudio.settings';
const LICENSE_KEY = 'sunoCaptionStudio.license';
const THEMES = ['system', 'light', 'dark'];
const BULK_OUTPUTS = ['zip', 'merged'];

// Purchase page (webwoori). Opens the 이용권 구매 페이지 where the user pays
// (PayApp) and receives a license key. Phase 2 builds the real purchase flow.
const PURCHASE_URL = 'https://webwoori.com/buy/suno-caption';

// Only accept license keys issued for this app (our server sets meta.app).
const EXPECTED_APP = 'suno-caption';

// Display copy for the purchase button.
const PREMIUM_SUBSCRIBE_LABEL = '프리미엄 이용권 구매';

const langButtons = [...document.querySelectorAll('[data-lang]')];
const themeButtons = [...document.querySelectorAll('[data-theme-choice]')];
const bulkOutputButtons = [...document.querySelectorAll('[data-bulk-output]')];

const licenseEls = {
  status: document.querySelector('[data-role="license-status"]'),
  badge: document.querySelector('[data-role="license-badge"]'),
  statusText: document.querySelector('[data-role="license-status-text"]'),
  activate: document.querySelector('[data-role="license-activate"]'),
  input: document.querySelector('[data-role="license-input"]'),
  deactivate: document.querySelector('[data-role="license-deactivate"]'),
  msg: document.querySelector('[data-role="license-msg"]'),
  activateBtn: document.querySelector('[data-action="activate-license"]'),
  buyBtn: document.querySelector('[data-action="open-checkout"]')
};

let currentLang = 'ko';
let currentTheme = 'system';
let currentBulkOutput = 'zip';
let currentLicense = normalizeLicense(null);
let licenseBusy = false;

init();

async function init() {
  const result = await chrome.storage.local.get([STORAGE_KEY, LICENSE_KEY]);
  const settings = result[STORAGE_KEY] || {};
  currentLang = window.SCS_I18N.normalizeLang(settings.language);
  currentTheme = normalizeTheme(settings.theme);
  currentBulkOutput = normalizeBulkOutput(settings.bulkOutput);
  currentLicense = normalizeLicense(result[LICENSE_KEY]);

  applyTheme(currentTheme);
  applyAll(currentLang);
  syncTheme(currentTheme);
  syncBulkOutput(currentBulkOutput);
  renderLicense();
  revalidateLicense();
  showVersion();
  showShortcut();

  document.querySelector('[data-action="open-shortcuts"]')?.addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });

  for (const button of langButtons) {
    button.addEventListener('click', () => switchLanguage(button.dataset.lang));
  }
  for (const button of themeButtons) {
    button.addEventListener('click', () => switchTheme(button.dataset.themeChoice));
  }
  for (const button of bulkOutputButtons) {
    button.addEventListener('click', () => switchBulkOutput(button.dataset.bulkOutput));
  }

  setupLicenseUi();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[LICENSE_KEY]) {
      currentLicense = normalizeLicense(changes[LICENSE_KEY].newValue);
      renderLicense();
    }
    if (!changes[STORAGE_KEY]?.newValue) return;
    const next = changes[STORAGE_KEY].newValue;
    const lang = window.SCS_I18N.normalizeLang(next.language);
    const theme = normalizeTheme(next.theme);
    if (lang !== currentLang) {
      currentLang = lang;
      applyAll(currentLang);
    }
    if (theme !== currentTheme) {
      currentTheme = theme;
      applyTheme(currentTheme);
      syncTheme(currentTheme);
    }
    const bulkOutput = normalizeBulkOutput(next.bulkOutput);
    if (bulkOutput !== currentBulkOutput) {
      currentBulkOutput = bulkOutput;
      syncBulkOutput(currentBulkOutput);
    }
  });
}

function normalizeLicense(raw) {
  return {
    key: raw?.key || '',
    instanceId: raw?.instanceId || '',
    valid: Boolean(raw?.valid),
    status: raw?.status || '',
    expiresAt: raw?.expiresAt || null,
    customerName: raw?.customerName || ''
  };
}

function isLicenseActive(license) {
  if (!license?.valid) return false;
  if (license.expiresAt && Date.parse(license.expiresAt) <= Date.now()) return false;
  return true;
}

function setupLicenseUi() {
  licenseEls.activateBtn?.addEventListener('click', activateLicense);
  licenseEls.deactivate?.addEventListener('click', deactivateLicense);
  licenseEls.buyBtn?.addEventListener('click', () => {
    if (!PURCHASE_URL) {
      showLicenseMessage('구매 페이지가 아직 준비되지 않았습니다.', 'error');
      return;
    }
    chrome.tabs.create({ url: PURCHASE_URL });
  });
  licenseEls.input?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      activateLicense();
    }
  });
  if (licenseEls.buyBtn) {
    if (PURCHASE_URL) {
      licenseEls.buyBtn.textContent = PREMIUM_SUBSCRIBE_LABEL;
    } else {
      licenseEls.buyBtn.disabled = true;
      licenseEls.buyBtn.title = '구매 페이지 준비 중';
    }
  }
}

function renderLicense() {
  const active = isLicenseActive(currentLicense);
  if (licenseEls.status) {
    licenseEls.status.dataset.state = active ? 'premium' : 'free';
  }
  if (licenseEls.badge) {
    licenseEls.badge.textContent = active ? '프리미엄' : '무료';
  }
  if (licenseEls.statusText) {
    if (active) {
      const until = currentLicense.expiresAt
        ? ` (갱신일: ${formatDate(currentLicense.expiresAt)})`
        : '';
      licenseEls.statusText.textContent = `다운로드 무제한 이용 중${until}`;
    } else {
      licenseEls.statusText.textContent = '다운로드 한도가 적용됩니다.';
    }
  }
  if (licenseEls.activate) {
    licenseEls.activate.hidden = active;
  }
  if (licenseEls.deactivate) {
    licenseEls.deactivate.hidden = !active;
  }
}

function formatDate(value) {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function sendLicense(action, payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'caption-studio:license', action, payload }, resolve);
  });
}

// Map a Lemon Squeezy license_key object to our stored license shape.
function licenseFromResponse(data, key, instanceId) {
  const lk = data?.license_key || {};
  const status = lk.status || '';
  return {
    key,
    instanceId: instanceId || data?.instance?.id || '',
    valid: Boolean(data?.valid ?? data?.activated) && status !== 'expired' && status !== 'disabled',
    status,
    expiresAt: lk.expires_at || null,
    customerName: data?.meta?.customer_name || ''
  };
}

async function activateLicense() {
  if (licenseBusy) return;
  const key = (licenseEls.input?.value || '').trim();
  if (!key) {
    showLicenseMessage('라이선스 키를 입력하세요.', 'error');
    return;
  }
  setLicenseBusy(true);
  showLicenseMessage('활성화 중…', '');
  try {
    const response = await sendLicense('activate', { licenseKey: key });
    if (!response?.ok) {
      throw new Error(response?.error || '활성화에 실패했습니다.');
    }
    const data = response.data || {};
    if (!(data.activated || data.valid)) {
      throw new Error(data.error || '유효하지 않은 라이선스 키입니다.');
    }
    // Guard: make sure this key was issued for this app, not another product.
    const meta = data.meta || {};
    if (meta.app && meta.app !== EXPECTED_APP) {
      throw new Error('이 확장 프로그램의 라이선스 키가 아닙니다.');
    }
    const license = licenseFromResponse(data, key, data?.instance?.id);
    if (!license.valid) {
      throw new Error('이 라이선스는 만료되었거나 비활성 상태입니다.');
    }
    await chrome.storage.local.set({ [LICENSE_KEY]: license });
    currentLicense = license;
    renderLicense();
    showLicenseMessage('프리미엄이 활성화되었습니다. 다운로드 무제한!', 'ok');
    if (licenseEls.input) licenseEls.input.value = '';
  } catch (error) {
    showLicenseMessage(error instanceof Error ? error.message : '활성화에 실패했습니다.', 'error');
  } finally {
    setLicenseBusy(false);
  }
}

async function deactivateLicense() {
  if (licenseBusy) return;
  setLicenseBusy(true);
  try {
    if (currentLicense.key && currentLicense.instanceId) {
      await sendLicense('deactivate', {
        licenseKey: currentLicense.key,
        instanceId: currentLicense.instanceId
      });
    }
  } catch {
    // Best effort — clear locally regardless of API outcome.
  }
  await chrome.storage.local.remove(LICENSE_KEY);
  currentLicense = normalizeLicense(null);
  renderLicense();
  showLicenseMessage('이 기기에서 비활성화했습니다.', 'ok');
  setLicenseBusy(false);
}

// Re-check the stored license against the server (revokes if cancelled/expired).
async function revalidateLicense() {
  if (!currentLicense.key) return;
  try {
    const response = await sendLicense('validate', {
      licenseKey: currentLicense.key,
      instanceId: currentLicense.instanceId
    });
    if (!response?.ok) return;
    const data = response.data || {};
    // Only update when the server gave a definitive answer.
    if (typeof data.valid === 'boolean') {
      const license = licenseFromResponse(data, currentLicense.key, currentLicense.instanceId);
      await chrome.storage.local.set({ [LICENSE_KEY]: license });
      currentLicense = license;
      renderLicense();
    }
  } catch {
    // Network hiccup — keep the cached license until next check.
  }
}

function setLicenseBusy(busy) {
  licenseBusy = busy;
  if (licenseEls.activateBtn) licenseEls.activateBtn.disabled = busy;
  if (licenseEls.input) licenseEls.input.disabled = busy;
}

function showLicenseMessage(message, tone) {
  if (!licenseEls.msg) return;
  licenseEls.msg.textContent = message;
  licenseEls.msg.dataset.tone = tone || '';
  licenseEls.msg.hidden = !message;
}

function normalizeTheme(theme) {
  return THEMES.includes(theme) ? theme : 'system';
}

function normalizeBulkOutput(value) {
  return BULK_OUTPUTS.includes(value) ? value : 'zip';
}

async function switchBulkOutput(value) {
  if (!BULK_OUTPUTS.includes(value) || value === currentBulkOutput) return;
  currentBulkOutput = value;
  syncBulkOutput(currentBulkOutput);
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const next = { ...(result[STORAGE_KEY] || {}), bulkOutput: value };
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
}

function syncBulkOutput(value) {
  for (const button of bulkOutputButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.bulkOutput === value));
  }
}

function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.setAttribute('data-theme', theme);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

async function switchTheme(theme) {
  if (!THEMES.includes(theme) || theme === currentTheme) return;
  currentTheme = theme;
  applyTheme(currentTheme);
  syncTheme(currentTheme);
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const next = { ...(result[STORAGE_KEY] || {}), theme };
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
}

function syncTheme(theme) {
  for (const button of themeButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.themeChoice === theme));
  }
}

async function switchLanguage(lang) {
  if (!window.SCS_I18N.SUPPORTED_LANGS.includes(lang)) return;
  if (lang === currentLang) return;
  currentLang = lang;
  applyAll(currentLang);

  const result = await chrome.storage.local.get(STORAGE_KEY);
  const next = { ...(result[STORAGE_KEY] || {}), language: lang };
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
}

function applyAll(lang) {
  window.SCS_I18N.apply(lang, { titleKey: 'options.docTitle' });
  syncLangToggle(lang);
  showShortcut();
}

function syncLangToggle(lang) {
  for (const button of langButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.lang === lang));
  }
}

function showVersion() {
  const slot = document.querySelector('[data-role="about-version"]');
  if (!slot) return;
  try {
    slot.textContent = `v${chrome.runtime.getManifest().version}`;
  } catch {
    slot.textContent = '—';
  }
}

async function showShortcut() {
  const slot = document.querySelector('[data-role="shortcut-current"]');
  if (!slot) return;

  const suggested = chrome.runtime.getManifest().commands?.['download-current']?.suggested_key?.default || '';
  let bound = '';
  try {
    if (chrome.commands?.getAll) {
      const commands = await chrome.commands.getAll();
      bound = (commands.find((c) => c.name === 'download-current')?.shortcut || '').trim();
    }
  } catch {
    // Ignore — fall back to manifest's suggested key.
  }

  const display = bound || suggested;
  const isUnset = !display;
  slot.textContent = isUnset ? window.SCS_I18N.t(currentLang, 'prefs.shortcut.unset') : display;
  slot.dataset.unset = String(isUnset);
  slot.dataset.suggested = String(!bound && !!suggested);
}
