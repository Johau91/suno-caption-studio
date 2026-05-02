(() => {
  const STORAGE_KEY = 'sunoCaptionStudio.settings';
  const FALLBACK_DURATION = 2.4;
  const state = {
    open: false,
    busy: false,
    songId: '',
    title: '',
    lines: [],
    settings: {
      format: 'lrc',
      fileName: 'title-song',
      includeMeta: true,
      autoOpen: true
    }
  };

  let root;
  let els = {};
  let routeTimer = 0;

  init();

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'caption-studio:toggle') {
      setOpen(!state.open);
      if (state.open) {
        refreshCaptions();
      }
    }

    if (message?.type === 'caption-studio:navigation') {
      window.clearTimeout(routeTimer);
      routeTimer = window.setTimeout(() => {
        resetForRoute();
        if (state.settings.autoOpen && getSongIdFromLocation()) {
          setOpen(true);
          refreshCaptions();
        }
      }, 450);
    }
  });

  async function init() {
    state.settings = { ...state.settings, ...(await readSettings()) };
    mount();
    resetForRoute();

    if (state.settings.autoOpen && getSongIdFromLocation()) {
      setOpen(true);
      refreshCaptions();
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
      <button class="scs-launcher" type="button" aria-label="Suno Caption Studio 열기">
        <span class="scs-dot"></span>
        <span>Caption Studio</span>
      </button>
      <section class="scs-panel" aria-label="Suno Caption Studio">
        <header class="scs-header">
          <div class="scs-title">
            <strong>Caption Studio</strong>
            <span data-role="subtitle">Suno 곡 캡션 내보내기</span>
          </div>
          <button class="scs-icon-button" type="button" data-action="close" aria-label="닫기">×</button>
        </header>
        <div class="scs-body">
          <div class="scs-status" data-role="status">곡 페이지에서 캡션을 불러올 수 있습니다.</div>
          <div class="scs-options">
            <div class="scs-field">
              <label for="scs-format">미리보기 형식</label>
              <select id="scs-format" class="scs-select" data-setting="format">
                <option value="lrc">LRC</option>
                <option value="srt">SRT</option>
                <option value="txt">TXT</option>
              </select>
            </div>
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
            <label class="scs-check">
              <input type="checkbox" data-setting="autoOpen">
              <span>곡 페이지에서 자동으로 열기</span>
            </label>
          </div>
          <div class="scs-grid">
            <button class="scs-button" type="button" data-action="save-selected">선택 형식 저장</button>
            <button class="scs-button" type="button" data-action="copy-selected">선택 형식 복사</button>
            <button class="scs-button" type="button" data-action="save-all">LRC/SRT/TXT 저장</button>
            <button class="scs-button" type="button" data-kind="secondary" data-action="refresh">다시 불러오기</button>
          </div>
          <div class="scs-empty">
            현재 페이지에서 동기화된 캡션을 찾지 못했습니다. Suno에 로그인되어 있는지 확인하고 곡 상세 페이지에서 다시 시도하세요.
          </div>
          <div class="scs-preview">
            <div class="scs-preview-head">
              <span data-role="summary">대기 중</span>
              <span data-role="file">파일명 미리보기</span>
            </div>
            <pre data-role="preview"></pre>
          </div>
        </div>
      </section>
    `;

    document.documentElement.appendChild(root);
    els = {
      launcher: root.querySelector('.scs-launcher'),
      status: root.querySelector('[data-role="status"]'),
      subtitle: root.querySelector('[data-role="subtitle"]'),
      summary: root.querySelector('[data-role="summary"]'),
      file: root.querySelector('[data-role="file"]'),
      preview: root.querySelector('[data-role="preview"]'),
      buttons: [...root.querySelectorAll('[data-action]')],
      format: root.querySelector('[data-setting="format"]'),
      fileName: root.querySelector('[data-setting="fileName"]'),
      includeMeta: root.querySelector('[data-setting="includeMeta"]'),
      autoOpen: root.querySelector('[data-setting="autoOpen"]')
    };

    els.launcher.addEventListener('click', () => {
      setOpen(true);
      refreshCaptions();
    });

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
    setStatus('캡션 데이터를 불러오는 중입니다.', '');
    render();

    try {
      const response = await sendMessage({
        type: 'caption-studio:load',
        songId,
        token
      });

      if (!response?.ok) {
        throw new Error(response?.error || '캡션 데이터를 불러오지 못했습니다.');
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

  function renderExport(format) {
    if (format === 'srt') {
      return toSrt(state.lines);
    }
    if (format === 'txt') {
      return toTxt(state.lines, state.settings.includeMeta);
    }
    return toLrc(state.lines, state.settings.includeMeta);
  }

  function toLrc(lines, includeMeta) {
    const meta = includeMeta
      ? [`[ti:${state.title || state.songId}]`, `[re:Suno Caption Studio]`, `[id:${state.songId}]`, '']
      : [];
    return meta.concat(lines.map((line) => `${formatLrcTime(line.start)}${line.text}`)).join('\n');
  }

  function toSrt(lines) {
    return lines.map((line, index) => {
      return `${index + 1}\n${formatSrtTime(line.start)} --> ${formatSrtTime(line.end)}\n${line.text}\n`;
    }).join('\n');
  }

  function toTxt(lines, includeMeta) {
    const meta = includeMeta
      ? [`Title: ${state.title || state.songId}`, `Song ID: ${state.songId}`, `Exported by: Suno Caption Studio`, '']
      : [];
    return meta.concat(lines.map((line) => line.text)).join('\n');
  }

  function render() {
    if (!root) {
      return;
    }

    root.dataset.open = String(state.open);
    root.dataset.empty = String(!state.lines.length && !state.busy);
    els.subtitle.textContent = state.title || state.songId || 'Suno 곡 캡션 내보내기';
    els.summary.textContent = state.lines.length ? `${state.lines.length} lines / ${state.settings.format.toUpperCase()}` : '대기 중';
    els.file.textContent = state.lines.length ? makeFileName(state.settings.format) : '파일명 미리보기';
    els.preview.textContent = state.lines.length ? previewText(renderExport(state.settings.format)) : '';

    for (const button of els.buttons) {
      const action = button.dataset.action;
      button.disabled = state.busy || (!state.lines.length && ['save-selected', 'copy-selected', 'save-all'].includes(action));
    }

    renderSettings();
  }

  function renderSettings() {
    if (!els.format) {
      return;
    }
    els.format.value = state.settings.format;
    els.fileName.value = state.settings.fileName;
    els.includeMeta.checked = Boolean(state.settings.includeMeta);
    els.autoOpen.checked = Boolean(state.settings.autoOpen);
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

  function readCookie(name) {
    const prefix = `${name}=`;
    return document.cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix))
      ?.slice(prefix.length) || '';
  }

  function sendMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, resolve);
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

  function makeFileName(format) {
    const title = slugify(state.title || 'suno-caption');
    const song = slugify(state.songId || 'song');
    const base = state.settings.fileName === 'title'
      ? title
      : state.settings.fileName === 'song'
        ? song
        : `${title}-${song}`;
    return `${base}.${format}`;
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
    const blob = new Blob([content], { type: mimeType });
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
