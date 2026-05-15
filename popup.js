const STORAGE_KEY = 'sunoCaptionStudio.settings';
const STATS_KEY = 'sunoCaptionStudio.stats';
const UPDATE_INFO_KEY = 'sunoCaptionStudio.updateInfo';
const STORE_URL = 'https://chromewebstore.google.com/detail/bhmcpeaeeammcbcadpmkanfhfjklddkn';

const defaults = {
  format: 'lrc',
  fileName: 'title-song',
  customPattern: '{title}-{songId}',
  includeMeta: true,
  cleanMode: 'strong',
  language: 'ko'
};

const fields = [...document.querySelectorAll('[data-setting]')];
const toolLinks = [...document.querySelectorAll('[data-url]')];
const status = document.querySelector('[data-role="status"]');
const updateBanner = document.querySelector('[data-role="update-banner"]');
const updateVersionLabel = document.querySelector('[data-role="update-version"]');
const updateDismissButton = document.querySelector('[data-role="update-dismiss"]');
const customPatternField = document.querySelector('[data-role="custom-pattern-field"]');
const statsRow = document.querySelector('[data-role="stats-row"]');
const statsCount = document.querySelector('[data-role="stats-count"]');
const openSunoButton = document.querySelector('[data-action="open-suno"]');
const shareButton = document.querySelector('[data-action="share-extension"]');
const openOptionsButton = document.querySelector('[data-action="open-options"]');
const toast = document.querySelector('[data-role="toast"]');

let currentLang = 'ko';
let statusTimer = 0;
let toastTimer = 0;

init();

async function init() {
  const result = await chrome.storage.local.get([STORAGE_KEY, UPDATE_INFO_KEY, STATS_KEY]);
  const settings = normalizeSettings(result[STORAGE_KEY] || {});

  currentLang = window.SCS_I18N.normalizeLang(settings.language);
  applyI18n(currentLang);

  render(settings);
  updateCustomPatternVisibility(settings.fileName);
  showUpdateBannerIfNeeded(result[UPDATE_INFO_KEY]);
  showStats(result[STATS_KEY]);

  for (const field of fields) {
    const eventName = field.tagName === 'INPUT' && field.type === 'text' ? 'input' : 'change';
    field.addEventListener(eventName, () => {
      const next = readForm();
      if (field.dataset.setting === 'fileName') {
        updateCustomPatternVisibility(next.fileName);
      }
      save(next);
    });
  }

  for (const link of toolLinks) {
    link.addEventListener('click', () => {
      chrome.tabs.create({ url: link.dataset.url });
    });
  }

  openSunoButton?.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://suno.com/' });
  });

  shareButton?.addEventListener('click', shareExtension);

  openOptionsButton?.addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
    }
    window.close();
  });

  updateDismissButton?.addEventListener('click', dismissUpdateBanner);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[STATS_KEY]) {
      showStats(changes[STATS_KEY].newValue);
    }
    if (changes[STORAGE_KEY]?.newValue) {
      const lang = window.SCS_I18N.normalizeLang(changes[STORAGE_KEY].newValue.language);
      if (lang !== currentLang) {
        currentLang = lang;
        applyI18n(currentLang);
      }
    }
  });
}

function normalizeSettings(saved) {
  const settings = { ...defaults, ...saved };
  if (!['none', 'basic', 'strong'].includes(settings.cleanMode)) {
    settings.cleanMode = saved.cleanMarkers === false ? 'none' : 'strong';
  }
  if (!['title-song', 'title', 'song', 'custom'].includes(settings.fileName)) {
    settings.fileName = 'title-song';
  }
  if (typeof settings.customPattern !== 'string' || !settings.customPattern.trim()) {
    settings.customPattern = defaults.customPattern;
  }
  settings.language = window.SCS_I18N.normalizeLang(settings.language);
  delete settings.cleanMarkers;
  return settings;
}

function render(settings) {
  for (const field of fields) {
    const key = field.dataset.setting;
    if (field.type === 'checkbox') {
      field.checked = Boolean(settings[key]);
    } else {
      field.value = settings[key] ?? '';
    }
  }
}

function readForm() {
  const settings = { ...defaults };
  for (const field of fields) {
    const key = field.dataset.setting;
    settings[key] = field.type === 'checkbox' ? field.checked : field.value;
  }
  settings.language = currentLang;
  return settings;
}

async function save(settings) {
  await chrome.storage.local.set({ [STORAGE_KEY]: settings });
  status.textContent = window.SCS_I18N.t(currentLang, 'status.saved');
  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => {
    status.textContent = window.SCS_I18N.t(currentLang, 'status.idle');
  }, 900);
}

function updateCustomPatternVisibility(fileName) {
  if (!customPatternField) return;
  customPatternField.hidden = fileName !== 'custom';
}

function showUpdateBannerIfNeeded(info) {
  if (!info?.version || !updateBanner) return;
  const previous = info.previousVersion ? `v${info.previousVersion} → ` : '';
  updateVersionLabel.textContent = `${previous}v${info.version}`;
  updateBanner.hidden = false;
}

async function dismissUpdateBanner() {
  if (updateBanner) updateBanner.hidden = true;
  await chrome.storage.local.remove(UPDATE_INFO_KEY);
  try {
    await chrome.action.setBadgeText({ text: '' });
  } catch (error) {
    // Best effort.
  }
}

function showStats(stats) {
  const count = Number(stats?.downloadCount ?? 0);
  if (!statsRow || !statsCount) return;
  if (count <= 0) {
    statsRow.hidden = true;
    return;
  }
  statsCount.textContent = count.toLocaleString();
  statsRow.hidden = false;
}

function applyI18n(lang) {
  window.SCS_I18N.apply(lang);
  if (status && !statusTimer) {
    status.textContent = window.SCS_I18N.t(lang, 'status.idle');
  }
}

async function shareExtension() {
  try {
    if (navigator.share) {
      await navigator.share({
        title: window.SCS_I18N.t(currentLang, 'docTitle'),
        text: window.SCS_I18N.t(currentLang, 'docTitle'),
        url: STORE_URL
      });
      return;
    }
  } catch (error) {
    // Web Share cancelled or unavailable — fall through to clipboard copy.
  }
  try {
    await navigator.clipboard.writeText(STORE_URL);
    showToast(window.SCS_I18N.t(currentLang, 'toast.copied'));
  } catch (error) {
    showToast(window.SCS_I18N.t(currentLang, 'toast.copyFailed'));
  }
}

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  void toast.offsetWidth;
  toast.classList.add('is-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.classList.remove('is-visible');
    window.setTimeout(() => {
      toast.hidden = true;
    }, 200);
  }, 1800);
}
