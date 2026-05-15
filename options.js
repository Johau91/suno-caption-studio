const STORAGE_KEY = 'sunoCaptionStudio.settings';
const langButtons = [...document.querySelectorAll('[data-lang]')];

let currentLang = 'ko';

init();

async function init() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const settings = result[STORAGE_KEY] || {};
  currentLang = window.SCS_I18N.normalizeLang(settings.language);
  applyAll(currentLang);

  for (const button of langButtons) {
    button.addEventListener('click', () => switchLanguage(button.dataset.lang));
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[STORAGE_KEY]?.newValue) return;
    const lang = window.SCS_I18N.normalizeLang(changes[STORAGE_KEY].newValue.language);
    if (lang !== currentLang) {
      currentLang = lang;
      applyAll(currentLang);
    }
  });
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
  syncToggle(lang);
}

function syncToggle(lang) {
  for (const button of langButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.lang === lang));
  }
}
