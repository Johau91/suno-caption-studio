(() => {
  const STORAGE_KEY = 'sunoCaptionStudio.settings';
  const STATS_KEY = 'sunoCaptionStudio.stats';
  const QUOTA_KEY = 'sunoCaptionStudio.quota';
  const LICENSE_KEY = 'sunoCaptionStudio.license';
  const FALLBACK_DURATION = 2.4;

  function normalizeLicense(raw) {
    return {
      key: raw?.key || '',
      instanceId: raw?.instanceId || '',
      valid: Boolean(raw?.valid),
      status: raw?.status || '',
      expiresAt: raw?.expiresAt || null
    };
  }

  function isPremium() {
    const lic = state.license;
    if (!lic?.valid) {
      return false;
    }
    if (lic.expiresAt && Date.parse(lic.expiresAt) <= Date.now()) {
      return false;
    }
    return true;
  }

  function quotaCap() {
    // Fixed display cap of 20. Sharing refills usage rather than raising it.
    return 20;
  }

  // quota.downloadCount is the current usage balance: +1 per download, -10 per
  // share (applied when sharing, clamped at 0 so credit never banks). Premium
  // removes the limit entirely.
  function effectiveDownloads(quota) {
    return Math.max(0, Number(quota?.downloadCount) || 0);
  }

  function normalizeQuota(raw) {
    return {
      isNewUser: Boolean(raw?.isNewUser),
      shareCount: Number(raw?.shareCount) || 0,
      downloadCount: Number(raw?.downloadCount) || 0,
      installedAt: raw?.installedAt ?? null
    };
  }
  const state = {
    open: false,
    busy: false,
    songId: '',
    title: '',
    lines: [],
    settings: {
      format: 'lrc',
      fileName: 'title-song',
      customPattern: '{title}-{songId}',
      includeMeta: true,
      cleanMode: 'strong',
      autoOpen: false,
      bulkOutput: 'zip'
    },
    quota: { isNewUser: false, shareCount: 0, downloadCount: 0, installedAt: null },
    license: { key: '', instanceId: '', valid: false, status: '', expiresAt: null }
  };

  let root;
  let downloadGroup;
  let bulkPanel;
  let bulkFab;
  let bulkEls = {};
  let bulkBusy = false;
  let bulkAbort = false;
  let bulkShowStatus = false;
  let bulkHideTimer = 0;
  let els = {};
  let routeTimer = 0;
  let thumbnailTimer = 0;
  let pageObserver;

  init();

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'caption-studio:navigation') {
      if (bulkBusy) {
        bulkAbort = true;
      }
      window.clearTimeout(routeTimer);
      routeTimer = window.setTimeout(() => {
        resetForRoute();
        scheduleThumbnailPlacement();
      }, 450);
      return;
    }
    if (message?.type === 'caption-studio:shortcut-download') {
      downloadFromThumbnail(state.settings.format);
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[STORAGE_KEY]?.newValue) {
      state.settings = { ...state.settings, ...changes[STORAGE_KEY].newValue };
      renderSettings();
      scheduleThumbnailPlacement();
    }
    if (changes[QUOTA_KEY]?.newValue) {
      state.quota = normalizeQuota(changes[QUOTA_KEY].newValue);
    }
    if (changes[LICENSE_KEY]) {
      state.license = normalizeLicense(changes[LICENSE_KEY].newValue);
    }
  });

  async function init() {
    state.settings = { ...state.settings, ...(await readSettings()) };
    state.quota = normalizeQuota(await readQuota());
    state.license = normalizeLicense(await readLicense());
    mount();
    resetForRoute();
    observePage();
    scheduleThumbnailPlacement();
  }

  async function readQuota() {
    try {
      const result = await chrome.storage.local.get(QUOTA_KEY);
      return result?.[QUOTA_KEY] || {};
    } catch {
      return {};
    }
  }

  async function readLicense() {
    try {
      const result = await chrome.storage.local.get(LICENSE_KEY);
      return result?.[LICENSE_KEY] || {};
    } catch {
      return {};
    }
  }

  function mount() {
    if (document.getElementById('suno-caption-studio-root')) {
      return;
    }

    root = document.createElement('div');
    root.id = 'suno-caption-studio-root';
    root.className = 'scs-root';
    root.innerHTML = `
      <section class="scs-panel" aria-label="SUNO 가사 다운로더">
        <header class="scs-header">
          <div class="scs-title">
            <strong>가사 저장 설정</strong>
            <span data-role="subtitle">확장 프로그램 아이콘으로 열고 닫기</span>
          </div>
          <button class="scs-icon-button" type="button" data-action="close" aria-label="닫기">×</button>
        </header>
        <div class="scs-body">
          <div class="scs-status" data-role="status">곡 페이지에서 가사를 불러올 수 있습니다.</div>
          <div class="scs-main">
            <div class="scs-field scs-format">
              <label for="scs-format">형식</label>
              <select id="scs-format" class="scs-select" data-setting="format">
                <option value="lrc">LRC</option>
                <option value="srt">SRT</option>
                <option value="txt">TXT</option>
              </select>
            </div>
            <button class="scs-button" type="button" data-action="save-selected">저장</button>
            <button class="scs-button" type="button" data-kind="secondary" data-action="copy-selected">복사</button>
          </div>
          <button class="scs-button scs-wide-button" type="button" data-kind="secondary" data-action="save-all">LRC/SRT/TXT 저장</button>
          <details class="scs-details">
            <summary>옵션</summary>
            <div class="scs-options">
            <div class="scs-field">
              <label for="scs-filename">파일명</label>
              <select id="scs-filename" class="scs-select" data-setting="fileName">
                <option value="title-song">제목 + 곡 ID</option>
                <option value="title">제목만</option>
                <option value="song">곡 ID만</option>
              </select>
            </div>
            <label class="scs-check">
              <input type="checkbox" data-setting="includeMeta">
              <span>LRC/TXT에 제목과 곡 ID 포함</span>
            </label>
            <button class="scs-button scs-wide-button" type="button" data-kind="secondary" data-action="refresh">다시 불러오기</button>
          </div>
          </details>
          <div class="scs-empty">
            현재 페이지에서 동기화된 가사를 찾지 못했습니다. Suno에 로그인되어 있는지 확인하고 곡 상세 페이지에서 다시 시도하세요.
          </div>
          <details class="scs-preview">
            <summary class="scs-preview-head">
              <span data-role="summary">대기 중</span>
              <span data-role="file">파일명 미리보기</span>
            </summary>
            <pre data-role="preview"></pre>
          </details>
        </div>
      </section>
    `;

    document.documentElement.appendChild(root);
    downloadGroup = document.createElement('div');
    downloadGroup.className = 'scs-download-group';
    downloadGroup.hidden = true;
    downloadGroup.innerHTML = `
      <button class="scs-format-download" type="button" data-format="lrc" aria-label="LRC 다운로드">LRC</button>
      <button class="scs-format-download" type="button" data-format="srt" aria-label="SRT 다운로드">SRT</button>
      <button class="scs-format-download" type="button" data-format="txt" aria-label="TXT 다운로드">TXT</button>
    `;
    downloadGroup.addEventListener('click', (event) => {
      const button = event.target.closest('[data-format]');
      if (!button) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      downloadFromThumbnail(button.dataset.format);
    });
    document.body.appendChild(downloadGroup);
    mountBulkPanel();

    els = {
      status: root.querySelector('[data-role="status"]'),
      subtitle: root.querySelector('[data-role="subtitle"]'),
      summary: root.querySelector('[data-role="summary"]'),
      file: root.querySelector('[data-role="file"]'),
      preview: root.querySelector('[data-role="preview"]'),
      buttons: [...root.querySelectorAll('[data-action]')],
      format: root.querySelector('[data-setting="format"]'),
      fileName: root.querySelector('[data-setting="fileName"]'),
      includeMeta: root.querySelector('[data-setting="includeMeta"]')
    };

    root.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (!action) {
        return;
      }
      handleAction(action);
    });

    root.addEventListener('change', (event) => {
      const key = event.target.dataset.setting;
      if (!key) {
        return;
      }
      if (event.target.type === 'checkbox') {
        state.settings[key] = event.target.checked;
      } else {
        state.settings[key] = event.target.value;
      }
      writeSettings(state.settings);
      render();
    });

    renderSettings();
    render();
  }

  function observePage() {
    if (pageObserver || !document.body) {
      return;
    }

    pageObserver = new MutationObserver(scheduleThumbnailPlacement);
    pageObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'style', 'class']
    });
    window.addEventListener('resize', scheduleThumbnailPlacement, { passive: true });
    window.addEventListener('scroll', scheduleThumbnailPlacement, { passive: true });
  }

  function scheduleThumbnailPlacement() {
    window.clearTimeout(thumbnailTimer);
    thumbnailTimer = window.setTimeout(() => {
      placeThumbnailButton();
      placeBulkButton();
    }, 120);
  }

  function placeThumbnailButton() {
    if (!downloadGroup) {
      return;
    }

    const songId = getSongIdFromLocation();
    const cover = songId ? findSongCover() : null;
    if (!cover) {
      downloadGroup.hidden = true;
      return;
    }

    // Overlay the buttons inside the top-left corner of the song cover image,
    // using document coordinates so they scroll naturally with the page.
    const rect = cover.getBoundingClientRect();
    const inset = 8;
    downloadGroup.hidden = false;
    downloadGroup.style.left = `${window.scrollX + rect.left + inset}px`;
    downloadGroup.style.top = `${window.scrollY + rect.top + inset}px`;

    downloadGroup.dataset.busy = String(state.busy);
    for (const button of downloadGroup.querySelectorAll('button')) {
      button.disabled = state.busy;
    }
  }

  function findSongCover() {
    const byAlt = document.querySelector('img[alt="Song Cover Image"]');
    if (byAlt) {
      return byAlt;
    }
    // Fallback: the largest image in the upper-left of the page.
    let best = null;
    let bestArea = 0;
    for (const image of document.images) {
      const rect = image.getBoundingClientRect();
      const aspect = rect.width / Math.max(1, rect.height);
      const inUpperLeft = rect.top < window.innerHeight * 0.7 && rect.left < window.innerWidth * 0.55;
      if (rect.width >= 96 && aspect >= 0.5 && aspect <= 1.4 && inUpperLeft) {
        const area = rect.width * rect.height;
        if (area > bestArea) {
          bestArea = area;
          best = image;
        }
      }
    }
    return best;
  }

  function mountBulkPanel() {
    // Circular launcher button, overlaid on the playlist cover thumbnail.
    // Clicking it downloads every song's lyrics directly (no popover).
    bulkFab = document.createElement('button');
    bulkFab.type = 'button';
    bulkFab.className = 'scs-bulk-fab';
    bulkFab.hidden = true;
    bulkFab.setAttribute('aria-label', '플레이리스트 전체 가사 다운로드');
    bulkFab.title = '플레이리스트 전체 가사 다운로드';
    // Circular progress ring drawn around the icon while downloading.
    const ringNS = 'http://www.w3.org/2000/svg';
    const ring = document.createElementNS(ringNS, 'svg');
    ring.setAttribute('class', 'scs-bulk-ring');
    ring.setAttribute('viewBox', '0 0 40 40');
    ring.setAttribute('aria-hidden', 'true');
    const ringTrack = document.createElementNS(ringNS, 'circle');
    ringTrack.setAttribute('class', 'scs-bulk-ring-track');
    ringTrack.setAttribute('cx', '20');
    ringTrack.setAttribute('cy', '20');
    ringTrack.setAttribute('r', '18');
    const ringFill = document.createElementNS(ringNS, 'circle');
    ringFill.setAttribute('class', 'scs-bulk-ring-fill');
    ringFill.setAttribute('cx', '20');
    ringFill.setAttribute('cy', '20');
    ringFill.setAttribute('r', '18');
    ring.appendChild(ringTrack);
    ring.appendChild(ringFill);
    bulkFab.appendChild(ring);

    const fabIcon = document.createElement('img');
    fabIcon.className = 'scs-bulk-fab-icon';
    fabIcon.alt = '';
    try {
      fabIcon.src = chrome.runtime.getURL('icons/icon48.png');
    } catch {
      // getURL can throw if the extension context is gone; ignore.
    }
    bulkFab.appendChild(fabIcon);
    bulkFab.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      bulkDownload();
    });
    document.body.appendChild(bulkFab);

    // Transient status bubble shown next to the launcher during/after download.
    bulkPanel = document.createElement('div');
    bulkPanel.className = 'scs-bulk-status-bubble';
    bulkPanel.hidden = true;
    bulkPanel.innerHTML = `<span class="scs-bulk-status" data-role="bulk-status"></span>`;
    document.body.appendChild(bulkPanel);

    bulkEls = {
      status: bulkPanel.querySelector('[data-role="bulk-status"]'),
      ring,
      ringFill
    };
  }

  const RING_CIRCUMFERENCE = 2 * Math.PI * 18;

  function setRing(pct, indeterminate) {
    if (!bulkEls.ringFill || !bulkEls.ring) {
      return;
    }
    bulkEls.ringFill.style.strokeDasharray = String(RING_CIRCUMFERENCE);
    if (indeterminate) {
      bulkEls.ring.classList.add('is-indeterminate');
      bulkEls.ringFill.style.strokeDashoffset = String(RING_CIRCUMFERENCE * 0.75);
    } else {
      bulkEls.ring.classList.remove('is-indeterminate');
      const clamped = Math.max(0, Math.min(100, pct));
      bulkEls.ringFill.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - clamped / 100));
    }
  }

  function findPlaylistCover() {
    const byAlt = document.querySelector('img[alt="Playlist cover art"]');
    if (byAlt) {
      return byAlt;
    }
    // Fallback: the largest near-square image in the upper-left of the page.
    let best = null;
    let bestArea = 0;
    for (const image of document.images) {
      const rect = image.getBoundingClientRect();
      const aspect = rect.width / Math.max(1, rect.height);
      const inUpperLeft = rect.top < window.innerHeight * 0.6 && rect.left < window.innerWidth * 0.5;
      if (rect.width >= 96 && aspect >= 0.8 && aspect <= 1.25 && inUpperLeft) {
        const area = rect.width * rect.height;
        if (area > bestArea) {
          bestArea = area;
          best = image;
        }
      }
    }
    return best;
  }

  function placeBulkButton() {
    if (!bulkFab || !bulkPanel) {
      return;
    }

    const isPlaylist = Boolean(getPlaylistIdFromLocation());
    const cover = isPlaylist ? findPlaylistCover() : null;
    if (!cover) {
      bulkFab.hidden = true;
      bulkPanel.hidden = true;
      return;
    }

    const rect = cover.getBoundingClientRect();
    const inset = 8;

    // Launcher sits inside the top-left corner of the cover.
    bulkFab.hidden = false;
    bulkFab.style.left = `${window.scrollX + rect.left + inset}px`;
    bulkFab.style.top = `${window.scrollY + rect.top + inset}px`;
    bulkFab.dataset.busy = String(bulkBusy);

    // Status bubble (only while downloading or briefly after) opens to the
    // right of the cover, in the empty area.
    bulkPanel.hidden = !(bulkBusy || bulkShowStatus);
    if (!bulkPanel.hidden) {
      bulkPanel.style.left = `${window.scrollX + rect.right + 12}px`;
      bulkPanel.style.top = `${window.scrollY + rect.top}px`;
    }
  }

  function setBulkBusy(busy) {
    bulkBusy = busy;
    if (bulkFab) {
      bulkFab.dataset.busy = String(busy);
    }
  }

  // Ring-only progress update. indeterminate=true spins (unknown total).
  function setBulkRing(done, total, indeterminate = false) {
    const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
    setRing(pct, indeterminate);
  }

  // Text bubble used only when there's something to tell the user (errors or
  // partial results). A clean success shows nothing — the filled ring is enough.
  function showBulkMessage(message) {
    if (bulkHideTimer) {
      window.clearTimeout(bulkHideTimer);
      bulkHideTimer = 0;
    }
    if (bulkEls.status) {
      bulkEls.status.textContent = message;
    }
    bulkShowStatus = true;
    placeBulkButton();
    bulkHideTimer = window.setTimeout(() => {
      bulkShowStatus = false;
      bulkHideTimer = 0;
      placeBulkButton();
    }, 4500);
  }

  async function bulkDownload() {
    if (bulkBusy) {
      return;
    }
    const playlistId = getPlaylistIdFromLocation();
    if (!playlistId) {
      return;
    }

    const token = readCookie('__session');
    if (!token) {
      showBulkMessage('Suno 로그인 세션을 찾지 못했습니다.');
      return;
    }

    if (!isPremium() && state.quota?.isNewUser) {
      const cap = quotaCap(state.quota.shareCount);
      if (effectiveDownloads(state.quota) >= cap) {
        showBulkMessage(`다운로드 한도 ${cap}회 도달 — 공유 또는 프리미엄 구독으로 무제한.`);
        return;
      }
    }

    bulkAbort = false;
    setBulkBusy(true);
    setBulkRing(0, 0, true);

    try {
      const listResponse = await sendMessage({
        type: 'caption-studio:load-playlist',
        playlistId,
        token
      }, 120000);
      if (!listResponse?.ok) {
        throw new Error(listResponse?.error || '플레이리스트를 불러오지 못했습니다.');
      }

      const playlistName = listResponse.playlist?.name || 'suno-playlist';
      let clips = listResponse.playlist?.clips || [];
      if (!clips.length) {
        setBulkBusy(false);
        showBulkMessage('플레이리스트에 곡이 없습니다.');
        return;
      }

      // Respect remaining quota for new users by trimming the batch.
      let quotaTrimmed = false;
      if (!isPremium() && state.quota?.isNewUser) {
        const cap = quotaCap(state.quota.shareCount);
        const remaining = Math.max(0, cap - effectiveDownloads(state.quota));
        if (clips.length > remaining) {
          clips = clips.slice(0, remaining);
          quotaTrimmed = true;
        }
      }

      const total = clips.length;
      const width = String(total).length;
      const format = state.settings.format || 'lrc';
      const files = [];
      let failures = 0;

      for (let index = 0; index < clips.length; index += 1) {
        if (bulkAbort) {
          break;
        }
        const clip = clips[index];
        setBulkRing(index, total);
        try {
          const response = await sendMessage({
            type: 'caption-studio:load',
            songId: clip.id,
            token
          }, 30000);
          if (!response?.ok) {
            throw new Error(response?.error || 'load failed');
          }
          const parsed = parseCaptionPayload(response.payload, clip.id);
          const title = clip.title ? cleanTitle(clip.title) : (parsed.title || clip.id);
          if (!parsed.lines.length) {
            failures += 1;
            continue;
          }
          const ctx = { lines: parsed.lines, title, songId: clip.id };
          const content = renderExport(format, ctx);
          // Bulk files use the title only (the numeric prefix already keeps them
          // ordered and unique), so the song-ID UUID never ends up in the name.
          const baseName = slugify(title) || slugify(clip.id) || 'suno-caption';
          const name = `${pad(index + 1, width)} ${baseName}.${format}`;
          files.push({ name, content, title });
        } catch {
          failures += 1;
        }
      }

      if (bulkAbort) {
        return;
      }

      if (!files.length) {
        setBulkBusy(false);
        showBulkMessage('저장할 가사를 찾지 못했습니다.');
        return;
      }

      setBulkRing(total, total);
      const safeName = slugify(playlistName) || 'suno-playlist';

      if (state.settings.bulkOutput === 'merged') {
        const merged = files
          .map((file) => `${'='.repeat(8)} ${file.title} ${'='.repeat(8)}\n${file.content}`)
          .join('\n\n');
        downloadText(merged, `${safeName}.${format}`, mimeFor(format));
      } else {
        if (!window.SCS_ZIP) {
          throw new Error('ZIP 모듈을 불러오지 못했습니다.');
        }
        const blob = window.SCS_ZIP.create(files.map((f) => ({ name: f.name, content: f.content })));
        downloadBlob(blob, `${safeName}.zip`);
      }

      incrementDownloadCount(files.length);

      // Clean success shows nothing — the filled ring is the confirmation.
      // Only surface a message when some songs were skipped or trimmed.
      const notes = [];
      if (failures) {
        notes.push(`가사 없음 ${failures}곡 제외`);
      }
      if (quotaTrimmed) {
        notes.push('남은 한도까지만 저장됨');
      }
      if (notes.length) {
        showBulkMessage(`${files.length}곡 저장 · ${notes.join(' · ')}`);
      }
    } catch (error) {
      showBulkMessage(error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setBulkBusy(false);
      if (bulkAbort) {
        bulkShowStatus = false;
        if (bulkHideTimer) {
          window.clearTimeout(bulkHideTimer);
          bulkHideTimer = 0;
        }
      }
      placeBulkButton();
    }
  }

  function handleAction(action) {
    if (action === 'close') {
      setOpen(false);
      return;
    }
    if (action === 'refresh') {
      refreshCaptions();
      return;
    }
    if (action === 'save-selected') {
      saveFormat(state.settings.format);
      return;
    }
    if (action === 'copy-selected') {
      copyFormat(state.settings.format);
      return;
    }
    if (action === 'save-all') {
      ['lrc', 'srt', 'txt'].forEach((format) => saveFormat(format));
    }
  }

  async function downloadFromThumbnail(format) {
    if (state.busy) {
      return;
    }

    if (!checkQuotaOrWarn()) {
      return;
    }

    const songId = getSongIdFromLocation();
    if (!songId) {
      setStatus('Suno 곡 상세 페이지에서 사용할 수 있습니다.', 'error');
      return;
    }

    if (state.songId !== songId || !state.lines.length) {
      await refreshCaptions();
    }

    if (state.lines.length) {
      saveFormat(format);
    }
  }

  function checkQuotaOrWarn() {
    if (isPremium()) return true;
    if (!state.quota?.isNewUser) return true;
    const cap = quotaCap(state.quota.shareCount);
    if (effectiveDownloads(state.quota) < cap) return true;
    setStatus(`다운로드 한도 ${cap}회 도달 — 공유 또는 프리미엄 구독으로 무제한.`, 'error');
    return false;
  }

  function setOpen(open) {
    state.open = open;
    render();
  }

  function resetForRoute() {
    const songId = getSongIdFromLocation();
    if (state.songId === songId) {
      return;
    }

    state.songId = songId;
    state.title = '';
    state.lines = [];
    render();
  }

  async function refreshCaptions() {
    const songId = getSongIdFromLocation();
    state.songId = songId;
    state.lines = [];

    if (!songId) {
      setStatus('Suno 곡 상세 페이지에서 사용할 수 있습니다.', 'error');
      render();
      return;
    }

    const token = readCookie('__session');
    if (!token) {
      setStatus('Suno 로그인 세션을 찾지 못했습니다. Suno에 로그인한 뒤 다시 시도하세요.', 'error');
      render();
      return;
    }

    state.busy = true;
    setStatus('가사 데이터를 불러오는 중입니다.', '');
    render();

    try {
      const response = await sendMessage({
        type: 'caption-studio:load',
        songId,
        token
      });

      if (!response?.ok) {
        throw new Error(response?.error || '가사 데이터를 불러오지 못했습니다.');
      }

      const parsed = parseCaptionPayload(response.payload, songId);
      state.title = parsed.title;
      state.lines = parsed.lines;

      if (state.lines.length === 0) {
        setStatus('동기화된 캡션 라인을 찾지 못했습니다.', 'error');
      } else {
        setStatus(`${state.lines.length}개 라인을 불러왔습니다.`, 'ok');
      }
    } catch (error) {
      state.lines = [];
      setStatus(error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.', 'error');
    } finally {
      state.busy = false;
      render();
    }
  }

  function parseCaptionPayload(payload, songId) {
    const captions = payload?.captions || {};
    const clip = payload?.clip || {};
    const title = cleanTitle(
      clip?.title ||
      clip?.metadata?.title ||
      clip?.metadata?.prompt_title ||
      document.title ||
      songId
    );
    const duration = pickDuration(captions, clip);
    const container = captions?.data && typeof captions.data === 'object' ? captions.data : captions;
    const lineSource = Array.isArray(container?.aligned_lyrics) ? container.aligned_lyrics : [];
    const wordSource = Array.isArray(container?.aligned_words) ? container.aligned_words : [];

    let rows = lineSource.map(readLineCandidate).filter((line) => line.text);
    if (rows.length === 0 && wordSource.length > 0) {
      rows = buildLinesFromWords(wordSource);
    }

    return {
      title,
      lines: normalizeLines(rows, duration)
    };
  }

  function readLineCandidate(line) {
    const words = Array.isArray(line?.words) ? line.words : [];
    const wordStarts = words.map((word) => numberOrNull(word?.start_s)).filter(isNumber);
    const wordEnds = words.map((word) => numberOrNull(word?.end_s)).filter(isNumber);
    const text = normalizeText(
      typeof line?.text === 'string' ? line.text :
      typeof line?.word === 'string' ? line.word :
      words.map((word) => word?.text || word?.word || '').join('')
    );

    return {
      text,
      start: numberOrNull(line?.start_s) ?? (wordStarts.length ? Math.min(...wordStarts) : null),
      end: numberOrNull(line?.end_s) ?? (wordEnds.length ? Math.max(...wordEnds) : null)
    };
  }

  function buildLinesFromWords(words) {
    const rows = [];
    let bucket = [];

    for (const word of words) {
      const text = normalizeText(word?.text || word?.word || '');
      if (!text) {
        continue;
      }

      bucket.push({
        text,
        start: numberOrNull(word?.start_s),
        end: numberOrNull(word?.end_s)
      });

      const gap = bucket.length > 1 && isNumber(bucket[bucket.length - 2].end) && isNumber(bucket[bucket.length - 1].start)
        ? bucket[bucket.length - 1].start - bucket[bucket.length - 2].end
        : 0;
      const punctuationEnd = /[.!?。！？]$/.test(text);
      if (bucket.length >= 8 || punctuationEnd || gap > 0.8) {
        rows.push(collapseWordBucket(bucket));
        bucket = [];
      }
    }

    if (bucket.length > 0) {
      rows.push(collapseWordBucket(bucket));
    }

    return rows;
  }

  function collapseWordBucket(bucket) {
    const starts = bucket.map((word) => word.start).filter(isNumber);
    const ends = bucket.map((word) => word.end).filter(isNumber);
    return {
      text: joinWordTexts(bucket.map((word) => word.text)),
      start: starts.length ? Math.min(...starts) : null,
      end: ends.length ? Math.max(...ends) : null
    };
  }

  function normalizeLines(rows, duration) {
    if (rows.length === 0) {
      return [];
    }

    const hasAbsoluteStarts = rows.filter((row) => isNumber(row.start) && row.start > 0.02).length >= Math.max(1, rows.length * 0.25);
    const allStartsNearZero = rows.every((row) => !isNumber(row.start) || row.start <= 0.02);

    if (!hasAbsoluteStarts && allStartsNearZero && rows.some((row) => isNumber(row.end) && row.end > 0)) {
      return expandRelativeRows(rows, duration);
    }

    const diffs = rows
      .map((row, index) => index > 0 && isNumber(row.start) && isNumber(rows[index - 1].start) ? row.start - rows[index - 1].start : null)
      .filter((value) => isNumber(value) && value > 0.05);
    const fallback = median(diffs) || FALLBACK_DURATION;
    let cursor = 0;

    return rows.map((row, index) => {
      let start = isNumber(row.start) ? Math.max(row.start, cursor) : cursor;
      let end = isNumber(row.end) && row.end > start ? row.end : null;

      if (!isNumber(end)) {
        const nextStart = findNextStart(rows, index + 1);
        end = isNumber(nextStart) && nextStart > start ? nextStart : start + fallback;
      }

      if (isNumber(duration)) {
        start = Math.min(start, duration);
        end = Math.min(end, duration);
      }

      if (end < start + 0.05) {
        end = start + 0.05;
      }

      cursor = start;
      return {
        text: row.text,
        start: roundTime(start),
        end: roundTime(end)
      };
    });
  }

  function expandRelativeRows(rows, duration) {
    const relativeDurations = rows.map((row) => {
      if (isNumber(row.start) && isNumber(row.end) && row.end > row.start) {
        return row.end - row.start;
      }
      if (isNumber(row.end) && row.end > 0) {
        return row.end;
      }
      return estimateTextDuration(row.text);
    });
    const total = relativeDurations.reduce((sum, value) => sum + value, 0);
    const scale = isNumber(duration) && duration > 0 && total > 0 ? duration / total : 1;
    let cursor = 0;

    return rows.map((row, index) => {
      const start = cursor;
      const end = start + relativeDurations[index] * scale;
      cursor = end;
      return {
        text: row.text,
        start: roundTime(start),
        end: roundTime(Math.max(end, start + 0.05))
      };
    });
  }

  function findNextStart(rows, from) {
    for (let index = from; index < rows.length; index += 1) {
      if (isNumber(rows[index].start)) {
        return rows[index].start;
      }
    }
    return null;
  }

  function saveFormat(format) {
    if (!state.lines.length || state.busy) {
      return;
    }
    downloadText(renderExport(format), makeFileName(format), mimeFor(format));
    setStatus(`${format.toUpperCase()} 파일을 저장했습니다.`, 'ok');
    incrementDownloadCount();
  }

  async function incrementDownloadCount(count = 1) {
    const amount = Math.max(1, Number(count) || 1);
    try {
      const result = await chrome.storage.local.get([STATS_KEY, QUOTA_KEY]);
      const stats = Number(result?.[STATS_KEY]?.downloadCount ?? 0);
      const updates = {
        [STATS_KEY]: {
          downloadCount: stats + amount,
          lastDownloadAt: Date.now()
        }
      };
      const quota = normalizeQuota(result?.[QUOTA_KEY]);
      if (quota.isNewUser) {
        updates[QUOTA_KEY] = {
          ...quota,
          downloadCount: quota.downloadCount + amount
        };
      }
      await chrome.storage.local.set(updates);
    } catch {
      // Stats are best-effort; don't surface errors to the user.
    }
  }

  async function copyFormat(format) {
    if (!state.lines.length || state.busy) {
      return;
    }

    try {
      await navigator.clipboard.writeText(renderExport(format));
      setStatus(`${format.toUpperCase()} 내용을 복사했습니다.`, 'ok');
    } catch (error) {
      setStatus('클립보드 복사에 실패했습니다.', 'error');
    }
  }

  function currentCtx() {
    return { lines: state.lines, title: state.title, songId: state.songId };
  }

  function renderExport(format, ctx = currentCtx()) {
    const cleanMode = getCleanMode();
    const lines = cleanMode === 'none' ? ctx.lines : cleanExportLines(ctx.lines, cleanMode);
    if (format === 'srt') {
      return toSrt(lines);
    }
    if (format === 'txt') {
      return toTxt(lines, state.settings.includeMeta, ctx);
    }
    return toLrc(lines, state.settings.includeMeta, ctx);
  }

  function toLrc(lines, includeMeta, ctx = currentCtx()) {
    const meta = includeMeta
      ? [`[ti:${ctx.title || ctx.songId}]`, `[re:SUNO 가사 다운로더]`, `[id:${ctx.songId}]`, '']
      : [];
    return meta.concat(lines.map((line) => `${formatLrcTime(line.start)}${line.text}`)).join('\n');
  }

  function toSrt(lines) {
    return lines.map((line, index) => {
      return `${index + 1}\n${formatSrtTime(line.start)} --> ${formatSrtTime(line.end)}\n${line.text}\n`;
    }).join('\n');
  }

  function toTxt(lines, includeMeta, ctx = currentCtx()) {
    const output = includeMeta
      ? [`Title: ${ctx.title || ctx.songId}`, `Song ID: ${ctx.songId}`, `Exported by: SUNO 가사 다운로더`, '']
      : [];

    lines.forEach((line, index) => {
      const previous = lines[index - 1];
      const longPause = previous &&
        isNumber(line.start) &&
        isNumber(previous.end) &&
        line.start - previous.end >= 1.35;

      if (longPause && output.length && output[output.length - 1] !== '') {
        output.push('');
      }

      output.push(line.text);
    });

    return collapseBlankLines(output).join('\n');
  }

  function cleanExportLines(lines, mode) {
    return lines
      .map((line) => ({
        ...line,
        text: cleanExportText(line.text, mode)
      }))
      .filter((line) => line.text);
  }

  function cleanExportText(text, mode) {
    const normalized = normalizeText(text);
    if (isSectionLabel(normalized)) {
      return '';
    }

    const withoutTags = mode === 'strong'
      ? normalized.replace(/\[[^\]]+\]/g, ' ')
      : normalized;

    return withoutTags
      .replace(/[~～]+/g, '')
      .replace(/\s*\/+\s*/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  function getCleanMode() {
    if (['none', 'basic', 'strong'].includes(state.settings.cleanMode)) {
      return state.settings.cleanMode;
    }
    if (state.settings.cleanMarkers === false) {
      return 'none';
    }
    return 'strong';
  }

  function isSectionLabel(text) {
    return /^\[[^\]]+\]$/.test(normalizeText(text));
  }

  function collapseBlankLines(lines) {
    const output = [];
    for (const line of lines) {
      if (line === '' && output[output.length - 1] === '') {
        continue;
      }
      output.push(line);
    }
    while (output[0] === '') {
      output.shift();
    }
    while (output[output.length - 1] === '') {
      output.pop();
    }
    return output;
  }

  function render() {
    if (!root) {
      return;
    }

    root.dataset.open = String(state.open);
    root.dataset.empty = String(!state.lines.length && !state.busy);
    els.subtitle.textContent = state.title || state.songId || 'SUNO 가사 다운로드';
    els.summary.textContent = state.lines.length ? `${state.lines.length} lines / ${state.settings.format.toUpperCase()}` : '대기 중';
    els.file.textContent = state.lines.length ? makeFileName(state.settings.format) : '파일명 미리보기';
    els.preview.textContent = state.lines.length ? previewText(renderExport(state.settings.format)) : '';

    for (const button of els.buttons) {
      const action = button.dataset.action;
      button.disabled = state.busy || (!state.lines.length && ['save-selected', 'copy-selected', 'save-all'].includes(action));
    }

    renderSettings();
    scheduleThumbnailPlacement();
  }

  function renderSettings() {
    if (!els.format) {
      return;
    }
    els.format.value = state.settings.format;
    els.fileName.value = state.settings.fileName;
    els.includeMeta.checked = Boolean(state.settings.includeMeta);
  }

  function setStatus(message, tone) {
    if (!els.status) {
      return;
    }
    els.status.textContent = message;
    els.status.dataset.tone = tone || '';
  }

  function getSongIdFromLocation() {
    const match = window.location.pathname.match(/^\/song\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  }

  function getPlaylistIdFromLocation() {
    const match = window.location.pathname.match(/^\/playlist\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
    return match ? match[1] : '';
  }

  function readCookie(name) {
    const prefix = `${name}=`;
    return document.cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix))
      ?.slice(prefix.length) || '';
  }

  function sendMessage(message, timeoutMs = 0) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = timeoutMs
        ? window.setTimeout(() => {
            if (settled) return;
            settled = true;
            reject(new Error('요청 시간이 초과되었습니다.'));
          }, timeoutMs)
        : 0;
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (settled) return;
          settled = true;
          if (timer) window.clearTimeout(timer);
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            reject(new Error(lastError.message || '확장 프로그램 연결이 끊어졌습니다.'));
            return;
          }
          resolve(response);
        });
      } catch (error) {
        if (settled) return;
        settled = true;
        if (timer) window.clearTimeout(timer);
        reject(error);
      }
    });
  }

  async function readSettings() {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      return result?.[STORAGE_KEY] || {};
    } catch {
      return {};
    }
  }

  async function writeSettings(settings) {
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: settings });
    } catch {
      // Storage is a convenience layer; exports should still work without it.
    }
  }

  function pickDuration(...sources) {
    for (const source of sources) {
      const direct = [
        source?.duration_s,
        source?.duration,
        source?.data?.duration_s,
        source?.data?.duration,
        source?.metadata?.duration,
        source?.metadata?.duration_s
      ].map(numberOrNull).find(isNumber);
      if (isNumber(direct)) {
        return direct;
      }
      const formatted = source?.metadata?.duration_formatted;
      if (typeof formatted === 'string') {
        const parsed = parseClockDuration(formatted);
        if (isNumber(parsed)) {
          return parsed;
        }
      }
    }
    return null;
  }

  function parseClockDuration(value) {
    const parts = value.split(':').map((part) => Number(part));
    if (parts.some((part) => Number.isNaN(part))) {
      return null;
    }
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return null;
  }

  function numberOrNull(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  function isNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function normalizeText(value) {
    return String(value || '')
      .replace(/\r/g, '')
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
      .trim();
  }

  function cleanTitle(value) {
    return normalizeText(value)
      .replace(/\s+-\s+Suno.*$/i, '')
      .replace(/\s*\|\s*Suno.*$/i, '')
      .slice(0, 80) || 'suno-caption';
  }

  function joinWordTexts(parts) {
    const joined = parts.join('');
    if (/\s/.test(joined)) {
      return normalizeText(joined);
    }
    return normalizeText(parts.join(' ')).replace(/\s+([,.!?;:])/g, '$1');
  }

  function estimateTextDuration(text) {
    const units = normalizeText(text).replace(/\s+/g, '').length;
    return Math.min(5, Math.max(0.8, units * 0.16));
  }

  function median(values) {
    if (!values.length) {
      return 0;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function roundTime(value) {
    return Math.round(value * 1000) / 1000;
  }

  function formatLrcTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const wholeSeconds = Math.floor(seconds % 60);
    const hundredths = Math.floor((seconds % 1) * 100);
    return `[${pad(minutes, 2)}:${pad(wholeSeconds, 2)}.${pad(hundredths, 2)}]`;
  }

  function formatSrtTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const wholeSeconds = Math.floor(seconds % 60);
    const milliseconds = Math.floor((seconds % 1) * 1000);
    return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(wholeSeconds, 2)},${pad(milliseconds, 3)}`;
  }

  function pad(value, length) {
    return String(value).padStart(length, '0');
  }

  function makeFileName(format, ctx = currentCtx()) {
    const title = slugify(ctx.title || 'suno-caption');
    const song = slugify(ctx.songId || 'song');
    let base;
    if (state.settings.fileName === 'custom') {
      base = renderCustomPattern(state.settings.customPattern, title, song);
    } else if (state.settings.fileName === 'title') {
      base = title;
    } else if (state.settings.fileName === 'song') {
      base = song;
    } else {
      base = `${title}-${song}`;
    }
    return `${base}.${format}`;
  }

  function renderCustomPattern(pattern, title, song) {
    const now = new Date();
    const date = `${now.getFullYear()}${pad(now.getMonth() + 1, 2)}${pad(now.getDate(), 2)}`;
    const time = `${pad(now.getHours(), 2)}${pad(now.getMinutes(), 2)}`;
    const replaced = (pattern || '{title}-{songId}')
      .replace(/\{title\}/gi, title)
      .replace(/\{songId\}/gi, song)
      .replace(/\{date\}/gi, date)
      .replace(/\{time\}/gi, time);
    const cleaned = slugify(replaced);
    return cleaned || `${title}-${song}`;
  }

  function slugify(value) {
    return normalizeText(value)
      .replace(/[\\/:*?"<>|]+/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 90) || 'suno-caption';
  }

  function mimeFor(format) {
    return format === 'srt' ? 'application/x-subrip;charset=utf-8' : 'text/plain;charset=utf-8';
  }

  function downloadText(content, fileName, mimeType) {
    downloadBlob(new Blob([content], { type: mimeType }), fileName);
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 250);
  }

  function previewText(text) {
    const lines = text.split('\n');
    if (lines.length <= 34) {
      return text;
    }
    return `${lines.slice(0, 34).join('\n')}\n...`;
  }
})();
