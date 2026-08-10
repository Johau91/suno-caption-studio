const UPDATE_INFO_KEY = 'sunoCaptionStudio.updateInfo';
const QUOTA_KEY = 'sunoCaptionStudio.quota';
const LICENSE_STORAGE_KEY = 'sunoCaptionStudio.license';
const EXPECTED_LICENSE_APP = 'suno-caption';
const LICENSE_ALARM = 'caption-studio:license-revalidate';
const LICENSE_REVALIDATE_MINUTES = 720; // every 12 hours
const BADGE_TEXT = 'NEW';
const BADGE_COLOR = '#1d4ed8';

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // Fresh install → new user, subject to download quota.
    await chrome.storage.local.set({
      [QUOTA_KEY]: {
        isNewUser: true,
        installedAt: Date.now(),
        shareCount: 0,
        downloadCount: 0
      }
    });
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
    return;
  }
  if (details.reason !== 'update') {
    return;
  }
  // Update flow: grandfather pre-quota users (anyone updating from any older version).
  const existing = await chrome.storage.local.get(QUOTA_KEY);
  if (!existing[QUOTA_KEY]) {
    await chrome.storage.local.set({
      [QUOTA_KEY]: {
        isNewUser: false,
        installedAt: null,
        shareCount: 0,
        downloadCount: 0
      }
    });
  }
  const currentVersion = chrome.runtime.getManifest().version;
  if (details.previousVersion === currentVersion) {
    return;
  }
  await chrome.storage.local.set({
    [UPDATE_INFO_KEY]: {
      version: currentVersion,
      previousVersion: details.previousVersion || null,
      shownAt: Date.now()
    }
  });
  await setUpdateBadge();
});

chrome.runtime.onStartup.addListener(restorePendingBadge);
restorePendingBadge();

// Keep premium status in sync with the subscription: re-check the license on a
// schedule and at browser startup so renewals extend access and cancellations/
// expirations revoke it without the user opening the options page.
function ensureLicenseAlarm() {
  chrome.alarms?.create(LICENSE_ALARM, { periodInMinutes: LICENSE_REVALIDATE_MINUTES });
}

chrome.runtime.onStartup.addListener(() => {
  ensureLicenseAlarm();
  revalidateStoredLicense();
});

chrome.runtime.onInstalled.addListener(ensureLicenseAlarm);
ensureLicenseAlarm();

chrome.alarms?.onAlarm.addListener((alarm) => {
  if (alarm.name === LICENSE_ALARM) {
    revalidateStoredLicense();
  }
});

async function revalidateStoredLicense() {
  try {
    const result = await chrome.storage.local.get(LICENSE_STORAGE_KEY);
    const lic = result[LICENSE_STORAGE_KEY];
    if (!lic?.key) {
      return;
    }
    const params = lic.instanceId
      ? { license_key: lic.key, instance_id: lic.instanceId }
      : { license_key: lic.key };
    const data = await callLicenseApi('validate', params);
    // Only update on a definitive answer; keep the cached license on
    // network/4XX errors so a transient failure doesn't revoke premium.
    if (typeof data.valid !== 'boolean') {
      return;
    }
    const lk = data.license_key || {};
    const status = lk.status || '';
    await chrome.storage.local.set({
      [LICENSE_STORAGE_KEY]: {
        key: lic.key,
        instanceId: lic.instanceId || '',
        valid: data?.meta?.app === EXPECTED_LICENSE_APP
          && Boolean(data.valid)
          && status !== 'expired'
          && status !== 'disabled',
        status,
        expiresAt: lk.expires_at || null,
        customerName: data?.meta?.customer_name || lic.customerName || ''
      }
    });
  } catch (error) {
    // Best effort — keep the cached license.
  }
}

async function restorePendingBadge() {
  try {
    const result = await chrome.storage.local.get(UPDATE_INFO_KEY);
    if (result[UPDATE_INFO_KEY]) {
      await setUpdateBadge();
    }
  } catch (error) {
    // Badge restore is best-effort.
  }
}

async function setUpdateBadge() {
  try {
    await chrome.action.setBadgeText({ text: BADGE_TEXT });
    await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
    if (chrome.action.setBadgeTextColor) {
      await chrome.action.setBadgeTextColor({ color: '#ffffff' });
    }
  } catch (error) {
    // Older Chrome versions may not support every badge API.
  }
}

if (chrome.commands?.onCommand) {
  chrome.commands.onCommand.addListener(async (command) => {
    if (command !== 'download-current') {
      return;
    }
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab.url?.startsWith('https://suno.com/')) {
        return;
      }
      await chrome.tabs.sendMessage(tab.id, {
        type: 'caption-studio:shortcut-download'
      }).catch(() => {
        // Content script may not be ready; ignore.
      });
    } catch (error) {
      // Best effort — shortcut shouldn't surface errors.
    }
  });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url || !changeInfo.url.startsWith('https://suno.com/')) {
    return;
  }

  chrome.tabs.sendMessage(tabId, {
    type: 'caption-studio:navigation',
    url: changeInfo.url
  }).catch(() => {
    // The content script may not be ready during route transitions.
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'caption-studio:load') {
    loadSunoCaptionPayload(message.songId, message.token)
      .then((payload) => sendResponse({ ok: true, payload }))
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      });
    return true;
  }

  if (message?.type === 'caption-studio:load-playlist') {
    loadSunoPlaylist(message.playlistId, message.token)
      .then((playlist) => sendResponse({ ok: true, playlist }))
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      });
    return true;
  }

  if (message?.type === 'caption-studio:license') {
    // Only accept license calls from the extension's own pages (e.g. options),
    // not from content scripts running on web pages.
    if (!sender.url || !sender.url.startsWith(chrome.runtime.getURL(''))) {
      sendResponse({ ok: false, error: 'forbidden' });
      return false;
    }
    handleLicense(message.action, message.payload || {})
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      });
    return true;
  }

  if (message?.type === 'caption-studio:checkout') {
    if (!sender.url || !sender.url.startsWith(chrome.runtime.getURL(''))) {
      sendResponse({ ok: false, error: 'forbidden' });
      return false;
    }
    requestCheckout(message.payload || {})
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      });
    return true;
  }

  if (message?.type === 'caption-studio:order-status') {
    if (!sender.url || !sender.url.startsWith(chrome.runtime.getURL(''))) {
      sendResponse({ ok: false, error: 'forbidden' });
      return false;
    }
    fetchOrderStatus(message.orderId)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      });
    return true;
  }

  return false;
});

const CHECKOUT_URL = 'https://webwoori.com/api/payapp/checkout';
const ORDER_STATUS_URL = 'https://webwoori.com/api/payapp/order';

async function requestCheckout(payload) {
  const response = await fetchWithTimeout(CHECKOUT_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      tier: payload.tier || '',
      phone: payload.phone || '',
      email: payload.email || ''
    }).toString()
  }, 20000);
  return response.json().catch(() => ({ ok: false, error: '응답 오류' }));
}

async function fetchOrderStatus(orderId) {
  const response = await fetchWithTimeout(
    `${ORDER_STATUS_URL}?order=${encodeURIComponent(orderId || '')}`,
    { headers: { Accept: 'application/json' } },
    12000
  );
  return response.json().catch(() => ({ ok: false }));
}

// Self-hosted license API on webwoori. Mirrors the Lemon Squeezy License API
// response shape (activated/valid/deactivated + license_key + instance + meta),
// so premium verification stays client-side and payment providers are swappable.
const LICENSE_API_BASE = 'https://webwoori.com/api/license';
const LICENSE_INSTANCE_NAME = 'SUNO 가사 다운로더';

async function handleLicense(action, payload) {
  const key = (payload.licenseKey || '').trim();
  if (!key) {
    throw new Error('라이선스 키를 입력하세요.');
  }

  if (action === 'activate') {
    return callLicenseApi('activate', {
      license_key: key,
      instance_name: LICENSE_INSTANCE_NAME
    });
  }
  if (action === 'validate') {
    const params = { license_key: key };
    if (payload.instanceId) {
      params.instance_id = payload.instanceId;
    }
    return callLicenseApi('validate', params);
  }
  if (action === 'deactivate') {
    return callLicenseApi('deactivate', {
      license_key: key,
      instance_id: payload.instanceId || ''
    });
  }
  throw new Error('알 수 없는 라이선스 동작입니다.');
}

async function callLicenseApi(path, params) {
  const response = await fetchWithTimeout(`${LICENSE_API_BASE}/${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams(params).toString()
  }, 20000);

  // The license API returns JSON with valid/activated booleans and an `error`
  // field both on success (200) and on handled failures (400/404).
  const json = await response.json().catch(() => ({}));
  return { httpStatus: response.status, ...json };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('request_timeout');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

const PLAYLIST_PAGE_SIZE = 50;
const PLAYLIST_MAX_PAGES = 40; // safety cap (~2000 clips)

async function loadSunoPlaylist(playlistId, token) {
  if (!playlistId) {
    throw new Error('플레이리스트 ID를 찾지 못했습니다.');
  }

  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let name = '';
  const clips = [];
  const seen = new Set();

  for (let page = 1; page <= PLAYLIST_MAX_PAGES; page += 1) {
    const url = `https://studio-api.prod.suno.com/api/playlist/${encodeURIComponent(playlistId)}/?page=${page}`;
    const data = await fetchJson(url, headers);

    if (!name && typeof data?.name === 'string') {
      name = data.name;
    }

    const pageClips = Array.isArray(data?.playlist_clips) ? data.playlist_clips : [];
    for (const entry of pageClips) {
      const clip = entry?.clip || entry;
      const id = clip?.id;
      if (!id || seen.has(id)) {
        continue;
      }
      seen.add(id);
      clips.push({ id, title: typeof clip?.title === 'string' ? clip.title : '' });
    }

    // Stop on the last (short or empty) page.
    if (pageClips.length < PLAYLIST_PAGE_SIZE) {
      break;
    }

    // Courtesy delay between page requests.
    await delay(180);
  }

  return { name, clips };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadSunoCaptionPayload(songId, token) {
  if (!songId) {
    throw new Error('곡 ID를 찾지 못했습니다.');
  }
  if (!token) {
    throw new Error('Suno 로그인 세션을 찾지 못했습니다.');
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  const [captionResult, clipResult] = await Promise.allSettled([
    fetchJson(`https://studio-api.prod.suno.com/api/gen/${encodeURIComponent(songId)}/aligned_lyrics/v2/`, headers),
    fetchJson(`https://studio-api.prod.suno.com/api/clip/${encodeURIComponent(songId)}`, headers)
  ]);

  return {
    captions: captionResult.status === 'fulfilled' ? captionResult.value : null,
    clip: clipResult.status === 'fulfilled' ? clipResult.value : null
  };
}

async function fetchJson(url, headers, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Suno API 응답 오류 (${response.status})`);
    }
    return await response.json();
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Suno API 요청 시간이 초과되었습니다.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
