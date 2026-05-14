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

const i18n = {
  ko: {
    'header.title': '가사 다운로드 설정',
    'header.subtitle': '썸네일 다운로드 버튼 기본값',
    'header.openSuno': 'Suno 열기 ↗',
    'update.title': '새 버전으로 업데이트되었습니다',
    'update.dismiss': '확인',
    'field.format': '다운로드 형식',
    'field.fileName': '파일명',
    'field.customPattern': '파일명 패턴 (변수: {title}, {songId}, {date}, {time})',
    'field.cleanMode': '가사 정리',
    'fileName.titleSong': '제목 + 곡 ID',
    'fileName.title': '제목만',
    'fileName.song': '곡 ID만',
    'fileName.custom': '직접 입력',
    'cleanMode.none': '원본 유지',
    'cleanMode.basic': '기본: 섹션 줄, /, ~ 제거',
    'cleanMode.strong': '강력: 섞인 [태그]까지 제거',
    'check.includeMeta': 'LRC/TXT에 제목과 곡 ID 포함',
    'status.idle': '설정이 자동 저장됩니다.',
    'status.saved': '저장되었습니다.',
    'stats.downloaded': '지금까지',
    'stats.unit': '개 가사를 저장했어요',
    'shortcut.hint': '단축키: Alt + Shift + L (Suno 곡 페이지에서 즉시 다운로드)',
    'tools.title': '개발자의 다른 도구',
    'tools.subtitle': '바로가기',
    'prefs.label': '환경설정',
    'prefs.language': '언어 / Language',
    'share.title': '친구에게 공유',
    'share.subtitle': '설치 링크를 클립보드에 복사합니다',
    'review.title': '후기 공유하기',
    'review.subtitle': '크롬 웹스토어에 별점과 후기를 남겨주세요',
    'toast.copied': '설치 링크를 복사했습니다',
    'toast.copyFailed': '복사에 실패했습니다',
    'docTitle': 'SUNO 가사 다운로더'
  },
  en: {
    'header.title': 'Lyrics download settings',
    'header.subtitle': 'Defaults for the thumbnail download buttons',
    'header.openSuno': 'Open Suno ↗',
    'update.title': 'Updated to a new version',
    'update.dismiss': 'OK',
    'field.format': 'Download format',
    'field.fileName': 'File name',
    'field.customPattern': 'File name pattern (vars: {title}, {songId}, {date}, {time})',
    'field.cleanMode': 'Lyrics cleanup',
    'fileName.titleSong': 'Title + Song ID',
    'fileName.title': 'Title only',
    'fileName.song': 'Song ID only',
    'fileName.custom': 'Custom pattern',
    'cleanMode.none': 'Keep original',
    'cleanMode.basic': 'Basic: strip section markers, /, ~',
    'cleanMode.strong': 'Strong: also strip inline [tags]',
    'check.includeMeta': 'Include title and song ID in LRC/TXT',
    'status.idle': 'Settings save automatically.',
    'status.saved': 'Saved.',
    'stats.downloaded': 'You have saved',
    'stats.unit': 'lyrics file(s) so far',
    'shortcut.hint': 'Shortcut: Alt + Shift + L (download instantly on a Suno song page)',
    'tools.title': "Developer's other tools",
    'tools.subtitle': 'Open',
    'prefs.label': 'Preferences',
    'prefs.language': 'Language',
    'share.title': 'Share with a friend',
    'share.subtitle': 'Copies the install link to the clipboard',
    'review.title': 'Leave a review',
    'review.subtitle': 'Rate and review on the Chrome Web Store',
    'toast.copied': 'Install link copied',
    'toast.copyFailed': 'Copy failed',
    'docTitle': 'SUNO Lyrics Downloader'
  },
  ja: {
    'header.title': '歌詞ダウンロード設定',
    'header.subtitle': 'サムネイルのダウンロードボタンの初期値',
    'header.openSuno': 'Suno を開く ↗',
    'update.title': '新しいバージョンに更新されました',
    'update.dismiss': 'OK',
    'field.format': 'ダウンロード形式',
    'field.fileName': 'ファイル名',
    'field.customPattern': 'ファイル名パターン (変数: {title}, {songId}, {date}, {time})',
    'field.cleanMode': '歌詞のクリーンアップ',
    'fileName.titleSong': 'タイトル + 曲 ID',
    'fileName.title': 'タイトルのみ',
    'fileName.song': '曲 ID のみ',
    'fileName.custom': 'カスタム入力',
    'cleanMode.none': 'オリジナルを保持',
    'cleanMode.basic': '基本: セクション行・/・~ を削除',
    'cleanMode.strong': '強力: 混在する [タグ] も削除',
    'check.includeMeta': 'LRC/TXT にタイトルと曲 ID を含める',
    'status.idle': '設定は自動保存されます。',
    'status.saved': '保存しました。',
    'stats.downloaded': 'これまでに',
    'stats.unit': '件の歌詞を保存しました',
    'shortcut.hint': 'ショートカット: Alt + Shift + L (Suno 曲ページですぐにダウンロード)',
    'tools.title': '開発者のその他のツール',
    'tools.subtitle': '開く',
    'prefs.label': '環境設定',
    'prefs.language': '言語',
    'share.title': '友達に共有',
    'share.subtitle': 'インストールリンクをクリップボードにコピーします',
    'review.title': 'レビューを書く',
    'review.subtitle': 'Chrome ウェブストアで星とレビューをお願いします',
    'toast.copied': 'インストールリンクをコピーしました',
    'toast.copyFailed': 'コピーに失敗しました',
    'docTitle': 'SUNO 歌詞ダウンローダー'
  },
  zh: {
    'header.title': '歌词下载设置',
    'header.subtitle': '缩略图下载按钮的默认值',
    'header.openSuno': '打开 Suno ↗',
    'update.title': '已更新到新版本',
    'update.dismiss': '好的',
    'field.format': '下载格式',
    'field.fileName': '文件名',
    'field.customPattern': '文件名模板 (变量: {title}, {songId}, {date}, {time})',
    'field.cleanMode': '歌词清理',
    'fileName.titleSong': '标题 + 曲目 ID',
    'fileName.title': '仅标题',
    'fileName.song': '仅曲目 ID',
    'fileName.custom': '自定义',
    'cleanMode.none': '保留原始内容',
    'cleanMode.basic': '基础: 去除段落行、/、~',
    'cleanMode.strong': '强力: 一并去除内嵌 [标签]',
    'check.includeMeta': '在 LRC/TXT 中包含标题和曲目 ID',
    'status.idle': '设置已自动保存。',
    'status.saved': '已保存。',
    'stats.downloaded': '到目前为止已保存',
    'stats.unit': '个歌词文件',
    'shortcut.hint': '快捷键: Alt + Shift + L (在 Suno 曲目页面立即下载)',
    'tools.title': '开发者的其他工具',
    'tools.subtitle': '打开',
    'prefs.label': '偏好设置',
    'prefs.language': '语言',
    'share.title': '分享给好友',
    'share.subtitle': '将安装链接复制到剪贴板',
    'review.title': '撰写评价',
    'review.subtitle': '在 Chrome 应用商店为我们打分留评',
    'toast.copied': '已复制安装链接',
    'toast.copyFailed': '复制失败',
    'docTitle': 'SUNO 歌词下载器'
  },
  es: {
    'header.title': 'Ajustes de descarga de letras',
    'header.subtitle': 'Valores por defecto para los botones de la miniatura',
    'header.openSuno': 'Abrir Suno ↗',
    'update.title': 'Actualizado a una nueva versión',
    'update.dismiss': 'Aceptar',
    'field.format': 'Formato de descarga',
    'field.fileName': 'Nombre de archivo',
    'field.customPattern': 'Patrón del nombre (vars: {title}, {songId}, {date}, {time})',
    'field.cleanMode': 'Limpieza de la letra',
    'fileName.titleSong': 'Título + ID de canción',
    'fileName.title': 'Solo título',
    'fileName.song': 'Solo ID de canción',
    'fileName.custom': 'Personalizado',
    'cleanMode.none': 'Mantener original',
    'cleanMode.basic': 'Básico: quita líneas de sección, /, ~',
    'cleanMode.strong': 'Fuerte: también quita [etiquetas] mezcladas',
    'check.includeMeta': 'Incluir título e ID de canción en LRC/TXT',
    'status.idle': 'Los ajustes se guardan automáticamente.',
    'status.saved': 'Guardado.',
    'stats.downloaded': 'Has guardado',
    'stats.unit': 'archivo(s) de letras hasta ahora',
    'shortcut.hint': 'Atajo: Alt + Shift + L (descarga al instante en una página de canción de Suno)',
    'tools.title': 'Otras herramientas del desarrollador',
    'tools.subtitle': 'Abrir',
    'prefs.label': 'Preferencias',
    'prefs.language': 'Idioma',
    'share.title': 'Compartir con un amigo',
    'share.subtitle': 'Copia el enlace de instalación al portapapeles',
    'review.title': 'Dejar una reseña',
    'review.subtitle': 'Califica y comenta en la Chrome Web Store',
    'toast.copied': 'Enlace de instalación copiado',
    'toast.copyFailed': 'Error al copiar',
    'docTitle': 'Descargador de letras SUNO'
  }
};

const SUPPORTED_LANGS = ['ko', 'en', 'ja', 'zh', 'es'];

const fields = [...document.querySelectorAll('[data-setting]')];
const toolLinks = [...document.querySelectorAll('[data-url]')];
const status = document.querySelector('[data-role="status"]');
const updateBanner = document.querySelector('[data-role="update-banner"]');
const updateVersionLabel = document.querySelector('[data-role="update-version"]');
const updateDismissButton = document.querySelector('[data-role="update-dismiss"]');
const customPatternField = document.querySelector('[data-role="custom-pattern-field"]');
const customPatternInput = document.querySelector('[data-setting="customPattern"]');
const fileNameSelect = document.querySelector('[data-setting="fileName"]');
const statsRow = document.querySelector('[data-role="stats-row"]');
const statsCount = document.querySelector('[data-role="stats-count"]');
const langButtons = [...document.querySelectorAll('[data-lang]')];
const openSunoButton = document.querySelector('[data-action="open-suno"]');
const shareButton = document.querySelector('[data-action="share-extension"]');
const toast = document.querySelector('[data-role="toast"]');
const prefsToggleButton = document.querySelector('[data-action="toggle-prefs"]');
const prefsPopover = document.querySelector('[data-role="prefs-popover"]');

let currentLang = 'ko';
let statusTimer = 0;
let toastTimer = 0;

init();

async function init() {
  const result = await chrome.storage.local.get([STORAGE_KEY, UPDATE_INFO_KEY, STATS_KEY]);
  const settings = normalizeSettings(result[STORAGE_KEY] || {});

  currentLang = SUPPORTED_LANGS.includes(settings.language) ? settings.language : 'ko';
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

  for (const button of langButtons) {
    button.addEventListener('click', () => switchLanguage(button.dataset.lang));
  }

  openSunoButton?.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://suno.com/' });
  });

  shareButton?.addEventListener('click', shareExtension);
  updateDismissButton?.addEventListener('click', dismissUpdateBanner);

  prefsToggleButton?.addEventListener('click', (event) => {
    event.stopPropagation();
    setPrefsOpen(prefsPopover.hidden);
  });

  prefsPopover?.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  document.addEventListener('click', () => setPrefsOpen(false));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && prefsPopover && !prefsPopover.hidden) {
      setPrefsOpen(false);
      prefsToggleButton?.focus();
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[STATS_KEY]) {
      showStats(changes[STATS_KEY].newValue);
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
  if (!SUPPORTED_LANGS.includes(settings.language)) {
    settings.language = 'ko';
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
      field.value = settings[key] ?? '';
    }
  }
  syncLangToggle(settings.language);
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
  status.textContent = t('status.saved');
  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => {
    status.textContent = t('status.idle');
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
    // best effort
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

async function switchLanguage(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) return;
  if (lang === currentLang) return;
  currentLang = lang;
  applyI18n(currentLang);
  syncLangToggle(currentLang);
  await save(readForm());
}

function syncLangToggle(lang) {
  for (const button of langButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.lang === lang));
  }
}

function setPrefsOpen(open) {
  if (!prefsPopover || !prefsToggleButton) return;
  prefsPopover.hidden = !open;
  prefsToggleButton.setAttribute('aria-expanded', String(open));
}

function applyI18n(lang) {
  const dict = i18n[lang] || i18n.ko;
  document.documentElement.lang = lang;
  document.title = dict.docTitle ?? document.title;
  for (const node of document.querySelectorAll('[data-i18n]')) {
    const key = node.dataset.i18n;
    const value = dict[key];
    if (typeof value !== 'string') continue;
    const attr = node.dataset.i18nAttr;
    if (attr) {
      node.setAttribute(attr, value);
    }
    if (!attr || node.firstChild?.nodeType === Node.TEXT_NODE || node.tagName === 'OPTION') {
      setTextPreservingChildren(node, value);
    }
  }
  if (status && !statusTimer) {
    status.textContent = dict['status.idle'];
  }
}

function setTextPreservingChildren(node, text) {
  // For OPTION and simple text nodes, just replace the textContent.
  // For STRONG containing trailing icon span, preserve the trailing element.
  const trailing = node.querySelector('span[aria-hidden="true"]');
  if (trailing && trailing.parentElement === node) {
    node.textContent = `${text} `;
    node.appendChild(trailing);
  } else {
    node.textContent = text;
  }
}

function t(key) {
  return i18n[currentLang]?.[key] ?? i18n.ko[key] ?? key;
}

async function shareExtension() {
  try {
    if (navigator.share) {
      await navigator.share({
        title: t('docTitle'),
        text: t('docTitle'),
        url: STORE_URL
      });
      return;
    }
  } catch (error) {
    // Web Share cancelled or unavailable — fall through to clipboard copy.
  }
  try {
    await navigator.clipboard.writeText(STORE_URL);
    showToast(t('toast.copied'));
  } catch (error) {
    showToast(t('toast.copyFailed'));
  }
}

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  // Force reflow before adding the visible class so the transition fires.
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
