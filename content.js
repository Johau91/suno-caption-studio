(() => {
  const testHooks = globalThis.__SCS_TEST_HOOKS__;
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
  let statusTimer = 0;
  let els = {};
  let routeTimer = 0;
  let thumbnailTimer = 0;
  let pageObserver;
  let contextDead = false;

  // Chrome orphans the content script when the extension is updated or reloaded
  // while a Suno tab is open. Every chrome.* call then throws
  // "Extension context invalidated" and the UI silently stops responding, so we
  // detect it and tell the user to reload instead of failing quietly.
  function isContextAlive() {
    try {
      return Boolean(chrome.runtime?.id);
    } catch {
      return false;
    }
  }

  function isContextInvalidatedError(error) {
    return /Extension context invalidated|Receiving end does not exist/i
      .test(String(error?.message || error || ''));
  }

  function handleDeadContext() {
    if (contextDead) return;
    contextDead = true;
    pageObserver?.disconnect();
    pageObserver = null;
    window.clearTimeout(thumbnailTimer);
    window.clearTimeout(routeTimer);
    if (!root?.isConnected) {
      mountRoot();
    }
    downloadGroup?.remove();
    bulkFab?.remove();
    bulkPanel?.remove();
    setStatus(tr('content.contextInvalidated'), 'error', true);
  }

  function tr(key, params) {
    const lang = window.SCS_I18N?.normalizeLang(state.settings.language);
    return window.SCS_I18N?.t(lang || 'ko', key, params) || key;
  }

  function localizeRuntimeError(message) {
    const text = String(message || '');
    const apiStatus = text.match(/Suno API 응답 오류 \((\d+)\)/);
    if (apiStatus) return tr('content.apiError', { status: apiStatus[1] });
    if (text.includes('요청 시간이 초과')) return tr('content.requestTimeout');
    if (text.includes('로그인 세션')) return tr('content.loginRequired');
    if (text.includes('연결이 끊어')) return tr('content.connectionLost');
    if (isContextInvalidatedError({ message: text })) return tr('content.contextInvalidated');
    return text || tr('content.unknownError');
  }

  if (!testHooks) init();

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
      updateLocalizedLabels();
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

  // Suno is a SPA and other extensions share this DOM, so any of our nodes can
  // be torn off the page at any time. Each piece is re-created independently
  // whenever it goes missing — otherwise the UI stays gone until a page reload
  // (which is why uninstall/reinstall appeared to "fix" it).
  function mount() {
    let rebuilt = false;

    if (!root?.isConnected) {
      document.getElementById('suno-caption-studio-root')?.remove();
      mountRoot();
      rebuilt = true;
    }
    if (!downloadGroup?.isConnected) {
      mountDownloadGroup();
      rebuilt = true;
    }
    if (!bulkFab?.isConnected || !bulkPanel?.isConnected) {
      bulkFab?.remove();
      bulkPanel?.remove();
      mountBulkPanel();
      if (bulkBusy) setRing(0, true);
      rebuilt = true;
    }
    if (rebuilt) {
      updateLocalizedLabels();
    }
  }

  function mountRoot() {
    root = document.createElement('div');
    root.id = 'suno-caption-studio-root';
    root.className = 'scs-root';
    root.innerHTML = `
      <div class="scs-toast" data-role="status" role="status" aria-live="polite" aria-atomic="true" hidden></div>
    `;

    document.documentElement.appendChild(root);
    els = { status: root.querySelector('[data-role="status"]') };
  }

  function mountDownloadGroup() {
    downloadGroup = document.createElement('div');
    downloadGroup.className = 'scs-download-group';
    downloadGroup.hidden = true;
    downloadGroup.innerHTML = `
      <button class="scs-format-download" type="button" data-format="lrc">LRC</button>
      <button class="scs-format-download" type="button" data-format="srt">SRT</button>
      <button class="scs-format-download" type="button" data-format="txt">TXT</button>
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
  }

  function updateLocalizedLabels() {
    for (const button of downloadGroup?.querySelectorAll('[data-format]') || []) {
      button.setAttribute('aria-label', tr('content.downloadFormat', { format: button.dataset.format.toUpperCase() }));
    }
    const bulkLabel = tr('content.bulkLabel');
    bulkFab?.setAttribute('aria-label', bulkLabel);
    if (bulkFab) bulkFab.title = bulkLabel;
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
    // The toast root is attached to <html>, not <body>, so watch that level too —
    // otherwise removing the root goes unnoticed and never self-heals.
    pageObserver.observe(document.documentElement, { childList: true });
    window.addEventListener('resize', scheduleThumbnailPlacement, { passive: true });
    window.addEventListener('scroll', scheduleThumbnailPlacement, { passive: true });
  }

  function scheduleThumbnailPlacement() {
    if (contextDead) return;
    window.clearTimeout(thumbnailTimer);
    thumbnailTimer = window.setTimeout(() => {
      if (!isContextAlive()) {
        handleDeadContext();
        return;
      }
      mount();
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
    bulkFab.setAttribute('aria-label', tr('content.bulkLabel'));
    bulkFab.title = tr('content.bulkLabel');
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
      showBulkMessage(tr('content.loginRequired'));
      return;
    }

    if (!isPremium() && state.quota?.isNewUser) {
      const cap = quotaCap(state.quota.shareCount);
      if (effectiveDownloads(state.quota) >= cap) {
        showBulkMessage(tr('content.quotaReached', { cap }));
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
        throw new Error(listResponse?.error || tr('content.playlistLoadFailed'));
      }

      const playlistName = listResponse.playlist?.name || 'suno-playlist';
      let clips = listResponse.playlist?.clips || [];
      if (!clips.length) {
        setBulkBusy(false);
        showBulkMessage(tr('content.playlistEmpty'));
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
        showBulkMessage(tr('content.noLyrics'));
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
          throw new Error(tr('content.zipMissing'));
        }
        const blob = window.SCS_ZIP.create(files.map((f) => ({ name: f.name, content: f.content })));
        downloadBlob(blob, `${safeName}.zip`);
      }

      incrementDownloadCount(files.length);

      // Clean success shows nothing — the filled ring is the confirmation.
      // Only surface a message when some songs were skipped or trimmed.
      const notes = [];
      if (failures) {
        notes.push(tr('content.bulkSkipped', { count: failures }));
      }
      if (quotaTrimmed) {
        notes.push(tr('content.bulkQuotaTrimmed'));
      }
      if (notes.length) {
        showBulkMessage(`${tr('content.bulkSaved', { count: files.length })} · ${notes.join(' · ')}`);
      }
    } catch (error) {
      showBulkMessage(localizeRuntimeError(error instanceof Error ? error.message : ''));
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

  async function downloadFromThumbnail(format) {
    if (state.busy) {
      return;
    }

    if (!checkQuotaOrWarn()) {
      return;
    }

    const songId = getSongIdFromLocation();
    if (!songId) {
      setStatus(tr('content.songOnly'), 'error');
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
    setStatus(tr('content.quotaReached', { cap }), 'error');
    return false;
  }

  function resetForRoute() {
    const songId = getSongIdFromLocation();
    if (state.songId === songId) {
      return;
    }

    state.songId = songId;
    state.title = '';
    state.lines = [];
    scheduleThumbnailPlacement();
  }

  async function refreshCaptions() {
    const songId = getSongIdFromLocation();
    state.songId = songId;
    state.lines = [];

    if (!songId) {
      setStatus(tr('content.songOnly'), 'error');
      scheduleThumbnailPlacement();
      return;
    }

    const token = readCookie('__session');
    if (!token) {
      setStatus(tr('content.loginRequired'), 'error');
      scheduleThumbnailPlacement();
      return;
    }

    state.busy = true;
    setStatus(tr('content.loading'), '');
    scheduleThumbnailPlacement();

    try {
      const response = await sendMessage({
        type: 'caption-studio:load',
        songId,
        token
      });

      if (!response?.ok) {
        throw new Error(response?.error || tr('content.noCaptions'));
      }

      const parsed = parseCaptionPayload(response.payload, songId);
      state.title = parsed.title;
      state.lines = parsed.lines;

      if (state.lines.length === 0) {
        setStatus(tr('content.noCaptions'), 'error');
      } else {
        setStatus(tr('content.loaded', { count: state.lines.length }), 'ok');
      }
    } catch (error) {
      state.lines = [];
      setStatus(localizeRuntimeError(error instanceof Error ? error.message : ''), 'error');
    } finally {
      state.busy = false;
      scheduleThumbnailPlacement();
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
    setStatus(tr('content.saved', { format: format.toUpperCase() }), 'ok');
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

  function setStatus(message, tone, sticky) {
    if (!els.status?.isConnected) {
      return;
    }
    if (statusTimer) window.clearTimeout(statusTimer);
    els.status.textContent = message;
    els.status.dataset.tone = tone || '';
    els.status.hidden = !message;
    if (message && !sticky) {
      statusTimer = window.setTimeout(() => {
        els.status.hidden = true;
        statusTimer = 0;
      }, tone === 'error' ? 6500 : 3200);
    }
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
            reject(new Error(tr('content.requestTimeout')));
          }, timeoutMs)
        : 0;
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (settled) return;
          settled = true;
          if (timer) window.clearTimeout(timer);
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            if (!isContextAlive()) handleDeadContext();
            reject(new Error(lastError.message || tr('content.connectionLost')));
            return;
          }
          resolve(response);
        });
      } catch (error) {
        if (settled) return;
        settled = true;
        if (timer) window.clearTimeout(timer);
        if (isContextInvalidatedError(error) || !isContextAlive()) handleDeadContext();
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

  if (testHooks) {
    Object.assign(testHooks, {
      cleanExportText,
      formatLrcTime,
      formatSrtTime,
      normalizeLines,
      slugify,
      isContextInvalidatedError
    });
  }
})();
