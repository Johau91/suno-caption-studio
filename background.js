chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url || !tab.url.startsWith('https://suno.com/')) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'caption-studio:toggle' });
  } catch (error) {
    console.debug('[Suno Caption Studio] content script is not ready', error);
  }
});

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
