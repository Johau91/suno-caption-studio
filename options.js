const STORAGE_KEY = 'sunoCaptionStudio.settings';
const THEMES = ['system', 'light', 'dark'];

const langButtons = [...document.querySelectorAll('[data-lang]')];
const themeButtons = [...document.querySelectorAll('[data-theme-choice]')];

let currentLang = 'ko';
let currentTheme = 'system';

init();

async function init() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const settings = result[STORAGE_KEY] || {};
  currentLang = window.SCS_I18N.normalizeLang(settings.language);
  currentTheme = normalizeTheme(settings.theme);

  applyTheme(currentTheme);
  applyAll(currentLang);
  syncTheme(currentTheme);
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

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[STORAGE_KEY]?.newValue) return;
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
  });
}

function normalizeTheme(theme) {
  return THEMES.includes(theme) ? theme : 'system';
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
