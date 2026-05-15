const STORAGE_KEY = 'sunoCaptionStudio.settings';
const THEMES = ['system', 'light', 'dark'];

init();

async function init() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const settings = result[STORAGE_KEY] || {};
  const lang = window.SCS_I18N.normalizeLang(settings.language);
  applyTheme(normalizeTheme(settings.theme));
  window.SCS_I18N.apply(lang, { titleKey: 'welcome.docTitle' });

  document.querySelector('[data-action="open-suno"]')?.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://suno.com/' });
  });
  document.querySelector('[data-action="open-options"]')?.addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
    }
  });
  document.querySelector('[data-action="close"]')?.addEventListener('click', () => {
    window.close();
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
