const STORAGE_KEY = 'sunoCaptionStudio.settings';
const STATS_KEY = 'sunoCaptionStudio.stats';
const UPDATE_INFO_KEY = 'sunoCaptionStudio.updateInfo';
const REVIEW_PROMPT_KEY = 'sunoCaptionStudio.reviewPrompt';
const STORE_URL = 'https://chromewebstore.google.com/detail/bhmcpeaeeammcbcadpmkanfhfjklddkn';
const REVIEW_URL = 'https://chromewebstore.google.com/detail/bhmcpeaeeammcbcadpmkanfhfjklddkn/reviews';
const REVIEW_THRESHOLDS = [5, 25];

const defaults = {
  format: 'lrc',
  fileName: 'title-song',
  customPattern: '{title}-{songId}',
  includeMeta: true,
  cleanMode: 'strong',
  language: 'ko',
  theme: 'system'
};

const THEMES = ['system', 'light', 'dark'];

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
const shareToggleButton = document.querySelector('[data-action="toggle-share"]');
const sharePopover = document.querySelector('[data-role="share-popover"]');
const shareOptionButtons = [...document.querySelectorAll('[data-share]')];
const openOptionsButton = document.querySelector('[data-action="open-options"]');
const toast = document.querySelector('[data-role="toast"]');
const reviewPrompt = document.querySelector('[data-role="review-prompt"]');
const reviewPromptTitle = document.querySelector('[data-role="review-prompt-title"]');
const reviewPromptLeave = document.querySelector('[data-role="review-prompt-leave"]');
const reviewPromptLater = document.querySelector('[data-role="review-prompt-later"]');
const reviewPromptClose = document.querySelector('[data-role="review-prompt-close"]');

let currentLang = 'ko';
let statusTimer = 0;
let toastTimer = 0;

init();

async function init() {
  const result = await chrome.storage.local.get([STORAGE_KEY, UPDATE_INFO_KEY, STATS_KEY, REVIEW_PROMPT_KEY]);
  const settings = normalizeSettings(result[STORAGE_KEY] || {});

  currentLang = window.SCS_I18N.normalizeLang(settings.language);
  applyTheme(normalizeTheme(settings.theme));
  applyI18n(currentLang);

  render(settings);
  updateCustomPatternVisibility(settings.fileName);
  showUpdateBannerIfNeeded(result[UPDATE_INFO_KEY]);
  showStats(result[STATS_KEY]);
  maybeShowReviewPrompt(result[STATS_KEY], result[REVIEW_PROMPT_KEY]);

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

  shareToggleButton?.addEventListener('click', (event) => {
    event.stopPropagation();
    setSharePopoverOpen(sharePopover?.hidden);
  });

  sharePopover?.addEventListener('click', (event) => event.stopPropagation());

  for (const button of shareOptionButtons) {
    button.addEventListener('click', () => handleShare(button.dataset.share));
  }

  document.addEventListener('click', () => setSharePopoverOpen(false));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sharePopover && !sharePopover.hidden) {
      setSharePopoverOpen(false);
      shareToggleButton?.focus();
    }
  });

  openOptionsButton?.addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
    }
    window.close();
  });


  updateDismissButton?.addEventListener('click', dismissUpdateBanner);
  reviewPromptLeave?.addEventListener('click', () => handleReviewPrompt('leave'));
  reviewPromptLater?.addEventListener('click', () => handleReviewPrompt('later'));
  reviewPromptClose?.addEventListener('click', () => handleReviewPrompt('close'));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[STATS_KEY]) {
      showStats(changes[STATS_KEY].newValue);
    }
    if (changes[STORAGE_KEY]?.newValue) {
      const next = changes[STORAGE_KEY].newValue;
      const lang = window.SCS_I18N.normalizeLang(next.language);
      if (lang !== currentLang) {
        currentLang = lang;
        applyI18n(currentLang);
      }
      applyTheme(normalizeTheme(next.theme));
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
  settings.theme = normalizeTheme(settings.theme);
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
  refreshReviewPromptTitle();
}

function maybeShowReviewPrompt(stats, state) {
  if (!reviewPrompt) return;
  const count = Number(stats?.downloadCount ?? 0);
  const promptState = normalizeReviewPromptState(state);
  if (promptState.nextThreshold === null) {
    reviewPrompt.hidden = true;
    return;
  }
  if (count < promptState.nextThreshold) {
    reviewPrompt.hidden = true;
    return;
  }
  reviewPrompt.dataset.count = String(count);
  refreshReviewPromptTitle();
  reviewPrompt.hidden = false;
}

function refreshReviewPromptTitle() {
  if (!reviewPrompt || !reviewPromptTitle) return;
  const count = Number(reviewPrompt.dataset.count ?? 0);
  if (count <= 0) return;
  reviewPromptTitle.textContent = window.SCS_I18N.t(currentLang, 'review.prompt.title', { count });
}

function normalizeReviewPromptState(state) {
  const next = {
    nextThreshold: REVIEW_THRESHOLDS[0],
    snoozes: 0,
    ...(state || {})
  };
  if (next.nextThreshold !== null && typeof next.nextThreshold !== 'number') {
    next.nextThreshold = REVIEW_THRESHOLDS[0];
  }
  return next;
}

async function handleReviewPrompt(action) {
  const result = await chrome.storage.local.get(REVIEW_PROMPT_KEY);
  const state = normalizeReviewPromptState(result[REVIEW_PROMPT_KEY]);

  if (action === 'leave') {
    state.nextThreshold = null;
    chrome.tabs.create({ url: REVIEW_URL });
  } else {
    // 'later' or 'close' both snooze, with the next threshold from the schedule.
    state.snoozes = (state.snoozes || 0) + 1;
    const nextIndex = Math.min(state.snoozes, REVIEW_THRESHOLDS.length - 1);
    state.nextThreshold = state.snoozes > REVIEW_THRESHOLDS.length - 1
      ? null
      : REVIEW_THRESHOLDS[nextIndex];
  }

  await chrome.storage.local.set({ [REVIEW_PROMPT_KEY]: state });
  if (reviewPrompt) reviewPrompt.hidden = true;
}

function setSharePopoverOpen(open) {
  if (!sharePopover || !shareToggleButton) return;
  sharePopover.hidden = !open;
  shareToggleButton.setAttribute('aria-expanded', String(Boolean(open)));
}

async function handleShare(target) {
  setSharePopoverOpen(false);
  const title = window.SCS_I18N.t(currentLang, 'docTitle');
  const text = window.SCS_I18N.t(currentLang, 'share.text');

  switch (target) {
    case 'copy': {
      await copyToClipboard(STORE_URL, 'toast.copied');
      return;
    }
    case 'kakao': {
      // KakaoTalk has no public URL share scheme without the JS SDK; the most
      // reliable path is to copy a chat-friendly snippet so the user can paste
      // into a conversation. The link unfurls into a card automatically.
      await copyToClipboard(`${text}\n${STORE_URL}`, 'toast.kakaoCopied');
      return;
    }
    case 'discord': {
      // Discord has no share-link API either — copy the snippet so the user
      // can paste into any server/DM. Discord auto-embeds the URL preview.
      await copyToClipboard(`${text}\n${STORE_URL}`, 'toast.discordCopied');
      return;
    }
    case 'x': {
      const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(STORE_URL)}`;
      chrome.tabs.create({ url });
      return;
    }
    case 'threads': {
      const url = `https://www.threads.net/intent/post?text=${encodeURIComponent(`${text} ${STORE_URL}`)}`;
      chrome.tabs.create({ url });
      return;
    }
    case 'naver-blog': {
      const url = `https://blog.naver.com/openapi/share?url=${encodeURIComponent(STORE_URL)}&title=${encodeURIComponent(title)}`;
      chrome.tabs.create({ url });
      return;
    }
    case 'naver-cafe': {
      // Naver Cafe has no generic share endpoint — open the developer's cafe and
      // copy the link so the user can paste it into a post.
      await copyToClipboard(`${text}\n${STORE_URL}`, 'toast.cafeCopied');
      chrome.tabs.create({ url: 'https://cafe.naver.com/playlistforge' });
      return;
    }
    default:
      return;
  }
}

async function copyToClipboard(value, successKey) {
  try {
    await navigator.clipboard.writeText(value);
    showToast(window.SCS_I18N.t(currentLang, successKey));
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
