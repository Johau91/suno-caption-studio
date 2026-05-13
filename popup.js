const STORAGE_KEY = 'sunoCaptionStudio.settings';
const defaults = {
  format: 'lrc',
  fileName: 'title-song',
  includeMeta: true,
  cleanMode: 'strong'
};

const fields = [...document.querySelectorAll('[data-setting]')];
const status = document.querySelector('[data-role="status"]');

init();

async function init() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const settings = normalizeSettings(result[STORAGE_KEY] || {});
  render(settings);

  for (const field of fields) {
    field.addEventListener('change', () => save(readForm()));
  }
}

function normalizeSettings(saved) {
  const settings = { ...defaults, ...saved };
  if (!['none', 'basic', 'strong'].includes(settings.cleanMode)) {
    settings.cleanMode = saved.cleanMarkers === false ? 'none' : 'strong';
  }
  delete settings.cleanMarkers;
  return settings;
}

function render(settings) {
  for (const field of fields) {
    const key = field.dataset.setting;
    if (field.type === 'checkbox') {
      field.checked = Boolean(settings[key]);
    } else {
      field.value = settings[key];
    }
  }
}

function readForm() {
  const settings = { ...defaults };
  for (const field of fields) {
    const key = field.dataset.setting;
    settings[key] = field.type === 'checkbox' ? field.checked : field.value;
  }
  return settings;
}

async function save(settings) {
  await chrome.storage.local.set({ [STORAGE_KEY]: settings });
  status.textContent = '저장되었습니다.';
  window.setTimeout(() => {
    status.textContent = '설정이 자동 저장됩니다.';
  }, 900);
}
