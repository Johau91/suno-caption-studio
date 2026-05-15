const UPDATE_INFO_KEY = 'sunoCaptionStudio.updateInfo';
const QUOTA_KEY = 'sunoCaptionStudio.quota';
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
  if (message?.type !== 'caption-studio:load') {
    return false;
  }

  loadSunoCaptionPayload(message.songId, message.token)
    .then((payload) => sendResponse({ ok: true, payload }))
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    });

  return true;
});

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

async function fetchJson(url, headers) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Suno API 응답 오류 (${response.status})`);
  }
  return response.json();
}
