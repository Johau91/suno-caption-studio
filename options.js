const STORAGE_KEY = 'sunoCaptionStudio.settings';
const LICENSE_KEY = 'sunoCaptionStudio.license';
const PENDING_ORDER_KEY = 'sunoCaptionStudio.pendingOrder';
const THEMES = ['system', 'light', 'dark'];
const BULK_OUTPUTS = ['zip', 'merged'];

// Only accept license keys issued for this app (our server sets meta.app).
const EXPECTED_APP = 'suno-caption';

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
  buyBtn: document.querySelector('[data-action="open-checkout"]'),
  purchase: document.querySelector('[data-role="license-purchase"]'),
  tiers: [...document.querySelectorAll('[data-tier]')],
  phone: document.querySelector('[data-role="buy-phone"]'),
  email: document.querySelector('[data-role="buy-email"]'),
  payBtn: document.querySelector('[data-role="pay-btn"]')
};

const TIER_PRICE = { '1month': 2900, '1year': 9900, lifetime: 15600 };

let currentLang = 'ko';
let currentTheme = 'system';
let currentBulkOutput = 'zip';
let currentLicense = normalizeLicense(null);
let licenseBusy = false;
let selectedTier = '1year';
let paymentPolling = false;

init();

async function init() {
  const result = await chrome.storage.local.get([STORAGE_KEY, LICENSE_KEY, PENDING_ORDER_KEY]);
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
  resumePendingPayment(result[PENDING_ORDER_KEY]).catch(() => {
    paymentPolling = false;
    if (licenseEls.payBtn) licenseEls.payBtn.disabled = false;
    showLicenseMessage(tr('prefs.license.msg.requestFailed'), 'error');
  });

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
  // 구매 버튼 → 인라인 구매 폼(이용권/휴대폰/이메일) 토글.
  licenseEls.buyBtn?.addEventListener('click', () => {
    if (!licenseEls.purchase) return;
    const open = licenseEls.purchase.hidden;
    setPurchaseOpen(open);
    if (open) {
      licenseEls.phone?.focus();
    }
  });
  // 이용권 선택.
  for (const tierBtn of licenseEls.tiers) {
    tierBtn.addEventListener('click', () => selectTier(tierBtn.dataset.tier));
  }
  renderPayButton();

  // 결제하기.
  licenseEls.payBtn?.addEventListener('click', startPayment);

  licenseEls.input?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      activateLicense();
    }
  });
}

function selectTier(tier) {
  if (!TIER_PRICE[tier]) return;
  selectedTier = tier;
  for (const btn of licenseEls.tiers) {
    const selected = btn.dataset.tier === tier;
    btn.dataset.selected = String(selected);
    btn.setAttribute('aria-pressed', String(selected));
  }
  renderPayButton();
}

function setPurchaseOpen(open) {
  if (licenseEls.purchase) licenseEls.purchase.hidden = !open;
  licenseEls.buyBtn?.setAttribute('aria-expanded', String(Boolean(open)));
}

function renderPayButton() {
  if (!licenseEls.payBtn) return;
  const price = TIER_PRICE[selectedTier] || 0;
  licenseEls.payBtn.textContent = tr('prefs.license.pay', {
    price: price.toLocaleString(localeForLanguage(currentLang))
  });
}

async function startPayment() {
  if (paymentPolling) return;
  const phone = (licenseEls.phone?.value || '').replace(/[^0-9]/g, '');
  if (phone.length < 10 || phone.length > 11) {
    showLicenseMessage(tr('prefs.license.msg.phoneInvalid'), 'error');
    licenseEls.phone?.focus();
    return;
  }
  const email = (licenseEls.email?.value || '').trim();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showLicenseMessage(tr('prefs.license.msg.emailInvalid'), 'error');
    licenseEls.email?.focus();
    return;
  }

  if (licenseEls.payBtn) licenseEls.payBtn.disabled = true;
  showLicenseMessage(tr('prefs.license.msg.openingPayment'), '');
  try {
    const response = await sendRuntimeMessage({
      type: 'caption-studio:checkout',
      payload: { tier: selectedTier, phone, email }
    });
    const data = response?.ok ? response.data : null;
    if (!data?.ok || !data.payurl || !data.orderId) {
      throw new Error(data?.error || response?.error || tr('prefs.license.msg.paymentRequestFailed'));
    }
    // 결제창을 팝업으로 (payurl = 페이앱/카드결제 바로).
    const pendingOrder = { orderId: data.orderId, createdAt: Date.now() };
    await chrome.storage.local.set({ [PENDING_ORDER_KEY]: pendingOrder });
    openPaymentWindow(data.payurl);
    showLicenseMessage(tr('prefs.license.msg.completePayment'), '');
    pollForPayment(data.orderId);
  } catch (error) {
    showLicenseMessage(friendlyErrorMessage(error, 'prefs.license.msg.paymentRequestFailed'), 'error');
    if (licenseEls.payBtn) licenseEls.payBtn.disabled = false;
  }
}

function openPaymentWindow(payurl) {
  // NICEPAY 결제창은 데스크톱 레이아웃(UA 기반)이라 넉넉한 폭이 필요.
  if (chrome.windows?.create) {
    chrome.windows.create({ url: payurl, type: 'popup', width: 820, height: 880 });
  } else {
    chrome.tabs.create({ url: payurl });
  }
}

// 결제 완료를 폴링해서 라이선스 키를 받아 자동 활성화.
async function pollForPayment(orderId) {
  if (!orderId || paymentPolling) return;
  paymentPolling = true;
  if (licenseEls.payBtn) licenseEls.payBtn.disabled = true;
  const deadline = Date.now() + 6 * 60 * 1000;
  const handleTickError = () => {
    paymentPolling = false;
    if (licenseEls.payBtn) licenseEls.payBtn.disabled = false;
    showLicenseMessage(tr('prefs.license.msg.requestFailed'), 'error');
  };

  const tick = async () => {
    let data = null;
    try {
      const res = await sendRuntimeMessage({ type: 'caption-studio:order-status', orderId }, 15000);
      data = res?.ok ? res.data : null;
    } catch {
      // 무시하고 계속 폴링
    }
    if (data?.ok && data.status === 'paid' && data.licenseKey) {
      paymentPolling = false;
      if (licenseEls.payBtn) licenseEls.payBtn.disabled = false;
      const activated = await activateWithKey(data.licenseKey);
      if (activated) {
        await chrome.storage.local.remove(PENDING_ORDER_KEY);
      }
      return;
    }
    if (data?.ok && data.status === 'failed') {
      paymentPolling = false;
      await chrome.storage.local.remove(PENDING_ORDER_KEY);
      if (licenseEls.payBtn) licenseEls.payBtn.disabled = false;
      showLicenseMessage(tr('prefs.license.msg.paymentFailed'), 'error');
      return;
    }
    if (Date.now() >= deadline) {
      paymentPolling = false;
      if (licenseEls.payBtn) licenseEls.payBtn.disabled = false;
      showLicenseMessage(tr('prefs.license.msg.paymentDelayed'), 'error');
      return;
    }
    window.setTimeout(() => tick().catch(handleTickError), 3000);
  };
  tick().catch(handleTickError);
}

async function resumePendingPayment(pending) {
  const orderId = typeof pending?.orderId === 'string' ? pending.orderId : '';
  const createdAt = Number(pending?.createdAt) || 0;
  if (!orderId) return;
  if (!createdAt || Date.now() - createdAt > 24 * 60 * 60 * 1000) {
    await chrome.storage.local.remove(PENDING_ORDER_KEY);
    return;
  }
  showLicenseMessage(tr('prefs.license.msg.resumingPayment'), '');
  pollForPayment(orderId);
}

// 결제로 받은 키를 입력칸에 채우고 활성화까지 자동 실행.
async function activateWithKey(key) {
  if (licenseEls.input) licenseEls.input.value = key;
  showLicenseMessage(tr('prefs.license.msg.activatingPaid'), 'ok');
  const activated = await activateLicense();
  if (activated) setPurchaseOpen(false);
  return activated;
}

function renderLicense() {
  const active = isLicenseActive(currentLicense);
  if (licenseEls.status) {
    licenseEls.status.dataset.state = active ? 'premium' : 'free';
  }
  if (licenseEls.badge) {
    licenseEls.badge.textContent = tr(active ? 'prefs.license.premium' : 'prefs.license.free');
  }
  if (licenseEls.statusText) {
    if (active) {
      const until = currentLicense.expiresAt
        ? ` (${tr('prefs.license.renewal', { date: formatDate(currentLicense.expiresAt) })})`
        : '';
      licenseEls.statusText.textContent = `${tr('prefs.license.statusActive')}${until}`;
    } else {
      licenseEls.statusText.textContent = tr('prefs.license.statusFree');
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
  return new Intl.DateTimeFormat(localeForLanguage(currentLang), {
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(ms));
}

function sendLicense(action, payload) {
  return sendRuntimeMessage({ type: 'caption-studio:license', action, payload });
}

function sendRuntimeMessage(message, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(tr('prefs.license.msg.requestTimeout')));
    }, timeoutMs);
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message || tr('prefs.license.msg.requestFailed')));
          return;
        }
        resolve(response);
      });
    } catch (error) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      reject(error);
    }
  });
}

// Map a Lemon Squeezy license_key object to our stored license shape.
function licenseFromResponse(data, key, instanceId) {
  const lk = data?.license_key || {};
  const status = lk.status || '';
  const expectedApp = data?.meta?.app === EXPECTED_APP;
  return {
    key,
    instanceId: instanceId || data?.instance?.id || '',
    valid: expectedApp && Boolean(data?.valid ?? data?.activated) && status !== 'expired' && status !== 'disabled',
    status,
    expiresAt: lk.expires_at || null,
    customerName: data?.meta?.customer_name || ''
  };
}

async function activateLicense() {
  if (licenseBusy) return false;
  const key = (licenseEls.input?.value || '').trim();
  if (!key) {
    showLicenseMessage(tr('prefs.license.msg.enterKey'), 'error');
    return false;
  }
  setLicenseBusy(true);
  showLicenseMessage(tr('prefs.license.msg.activating'), '');
  try {
    const response = await sendLicense('activate', { licenseKey: key });
    if (!response?.ok) {
      throw new Error(response?.error || tr('prefs.license.msg.activationFailed'));
    }
    const data = response.data || {};
    if (!(data.activated || data.valid)) {
      throw new Error(data.error || tr('prefs.license.msg.invalidKey'));
    }
    // Guard: make sure this key was issued for this app, not another product.
    const meta = data.meta || {};
    if (meta.app !== EXPECTED_APP) {
      throw new Error(tr('prefs.license.msg.wrongApp'));
    }
    const license = licenseFromResponse(data, key, data?.instance?.id);
    if (!license.valid) {
      throw new Error(tr('prefs.license.msg.inactive'));
    }
    await chrome.storage.local.set({ [LICENSE_KEY]: license });
    currentLicense = license;
    renderLicense();
    showLicenseMessage(tr('prefs.license.msg.activated'), 'ok');
    if (licenseEls.input) licenseEls.input.value = '';
    return true;
  } catch (error) {
    showLicenseMessage(friendlyErrorMessage(error, 'prefs.license.msg.activationFailed'), 'error');
    return false;
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
  showLicenseMessage(tr('prefs.license.msg.deactivated'), 'ok');
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

function friendlyErrorMessage(error, fallbackKey) {
  const message = error instanceof Error ? error.message : '';
  if (message === 'request_timeout') return tr('prefs.license.msg.requestTimeout');
  return message || tr(fallbackKey);
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
  renderLicense();
  renderPayButton();
}

function tr(key, params) {
  return window.SCS_I18N.t(currentLang, key, params);
}

function localeForLanguage(lang) {
  return ({ ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN', es: 'es-ES' })[lang] || 'ko-KR';
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
