const STORAGE_KEY = 'sunoCaptionStudio.settings';
const STATS_KEY = 'sunoCaptionStudio.stats';
const UPDATE_INFO_KEY = 'sunoCaptionStudio.updateInfo';
const REVIEW_PROMPT_KEY = 'sunoCaptionStudio.reviewPrompt';
const QUOTA_KEY = 'sunoCaptionStudio.quota';
const LICENSE_KEY = 'sunoCaptionStudio.license';

let premiumActive = false;

function isLicenseActive(raw) {
  if (!raw?.valid) return false;
  if (raw.expiresAt && Date.parse(raw.expiresAt) <= Date.now()) return false;
  return true;
}

function quotaCap() {
  // Fixed display cap of 20. Sharing refills usage rather than raising it.
  return 20;
}

function normalizeQuota(raw) {
  return {
    isNewUser: Boolean(raw?.isNewUser),
    shareCount: Number(raw?.shareCount) || 0,
    downloadCount: Number(raw?.downloadCount) || 0,
    installedAt: raw?.installedAt ?? null
  };
}
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
const quotaRow = document.querySelector('[data-role="quota-row"]');
const quotaCurrent = document.querySelector('[data-role="quota-current"]');
const quotaCap_el = document.querySelector('[data-role="quota-cap"]');
const quotaBoost = document.querySelector('[data-role="quota-boost"]');
const quotaBarFill = document.querySelector('[data-role="quota-bar-fill"]');
const quotaPremiumCta = document.querySelector('[data-role="quota-premium-cta"]');
const toolsToggleButton = document.querySelector('[data-action="toggle-tools"]');
const toolsToggleLabel = document.querySelector('[data-role="tools-toggle-label"]');
const extraToolLinks = [...document.querySelectorAll('.tool-link-more')];

let currentLang = 'ko';
let statusTimer = 0;
let toastTimer = 0;

init();

async function init() {
  const result = await chrome.storage.local.get([STORAGE_KEY, UPDATE_INFO_KEY, STATS_KEY, REVIEW_PROMPT_KEY, QUOTA_KEY, LICENSE_KEY]);
  const settings = normalizeSettings(result[STORAGE_KEY] || {});
  premiumActive = isLicenseActive(result[LICENSE_KEY]);

  currentLang = window.SCS_I18N.normalizeLang(settings.language);
  applyTheme(normalizeTheme(settings.theme));
  applyI18n(currentLang);

  render(settings);
  updateCustomPatternVisibility(settings.fileName);
  showUpdateBannerIfNeeded(result[UPDATE_INFO_KEY]);
  showStats(result[STATS_KEY]);
  maybeShowReviewPrompt(result[STATS_KEY], result[REVIEW_PROMPT_KEY]);
  showQuota(normalizeQuota(result[QUOTA_KEY]));

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

  sharePopover?.addEventListener('keydown', handleShareMenuKeydown);

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

  quotaPremiumCta?.addEventListener('click', () => {
    // Send users to the options page where they can subscribe and enter the key.
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
    }
    window.close();
  });

  toolsToggleButton?.addEventListener('click', () => {
    setToolsExpanded(toolsToggleButton.getAttribute('aria-expanded') !== 'true');
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
    if (changes[LICENSE_KEY]) {
      premiumActive = isLicenseActive(changes[LICENSE_KEY].newValue);
    }
    if (changes[QUOTA_KEY] || changes[LICENSE_KEY]) {
      chrome.storage.local.get(QUOTA_KEY).then((r) => showQuota(normalizeQuota(r[QUOTA_KEY])));
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

function showQuota(quota) {
  if (!quotaRow) return;
  if (premiumActive) {
    quotaRow.hidden = true;
    return;
  }
  if (!quota?.isNewUser) {
    quotaRow.hidden = true;
    return;
  }
  const cap = quotaCap(quota.shareCount);
  // Refill model: each share credits back 10 downloads.
  const used = effectiveDownloads(quota);
  const remaining = Math.max(0, cap - used);

  quotaCurrent.textContent = String(Math.min(used, cap));
  quotaCap_el.textContent = `/${cap}`;
  // Sharing always credits +10, so it always helps when the limit is hit.
  quotaBoost.textContent = remaining > 0
    ? window.SCS_I18N.t(currentLang, 'quota.boost')
    : window.SCS_I18N.t(currentLang, 'quota.exhaustedHint');
  const pct = Math.min(100, (used / cap) * 100);
  quotaBarFill.style.width = pct + '%';
  quotaBarFill.dataset.unlimited = 'false';
  quotaBarFill.dataset.full = String(remaining === 0);

  // Surface the premium upsell once the free quota is used up.
  if (quotaPremiumCta) {
    quotaPremiumCta.hidden = remaining > 0;
  }
  quotaRow.hidden = false;
}

// quota.downloadCount is the current usage balance (+1 per download, -10 per
// share, clamped at 0 so credit never banks).
function effectiveDownloads(quota) {
  return Math.max(0, Number(quota?.downloadCount) || 0);
}

async function bumpShareCount() {
  const result = await chrome.storage.local.get(QUOTA_KEY);
  const quota = normalizeQuota(result[QUOTA_KEY]);
  if (!quota.isNewUser) return; // grandfathered users don't get share credits
  // Refund 10 from the usage balance, clamped at 0 (no banking below zero).
  const refunded = Math.max(0, (quota.downloadCount || 0) - 10);
  await chrome.storage.local.set({
    [QUOTA_KEY]: { ...quota, downloadCount: refunded, shareCount: (quota.shareCount || 0) + 1 }
  });
  showToast(window.SCS_I18N.t(currentLang, 'quota.tier.refill'));
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
  refreshToolsToggleLabel();
}

function setToolsExpanded(expanded) {
  if (!toolsToggleButton) return;
  toolsToggleButton.setAttribute('aria-expanded', String(expanded));
  for (const link of extraToolLinks) {
    link.hidden = !expanded;
  }
  refreshToolsToggleLabel();
}

function refreshToolsToggleLabel() {
  if (!toolsToggleButton || !toolsToggleLabel) return;
  const expanded = toolsToggleButton.getAttribute('aria-expanded') === 'true';
  const key = expanded ? 'tools.showLess' : 'tools.showAll';
  toolsToggleLabel.dataset.i18n = key;
  toolsToggleLabel.textContent = window.SCS_I18N.t(currentLang, key);
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
  if (open) {
    window.requestAnimationFrame(() => shareOptionButtons[0]?.focus());
  }
}

function handleShareMenuKeydown(event) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const current = shareOptionButtons.indexOf(document.activeElement);
  let next = current;
  if (event.key === 'Home') next = 0;
  if (event.key === 'End') next = shareOptionButtons.length - 1;
  if (event.key === 'ArrowDown') next = current < 0 ? 0 : (current + 1) % shareOptionButtons.length;
  if (event.key === 'ArrowUp') next = current < 0 ? shareOptionButtons.length - 1 : (current - 1 + shareOptionButtons.length) % shareOptionButtons.length;
  shareOptionButtons[next]?.focus();
}

async function handleShare(target) {
  setSharePopoverOpen(false);
  shareToggleButton?.focus();
  await bumpShareCount();
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
