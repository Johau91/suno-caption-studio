// Shared i18n dictionary used by popup.html and options.html.
// Exposes window.SCS_I18N with: SUPPORTED_LANGS, dict, apply(lang), t(lang, key), normalizeLang(lang).
// Conventions:
//   data-i18n="key"           → replace text content (preserves trailing aria-hidden span)
//   data-i18n-title="key"     → replace title attribute
//   data-i18n-aria-label="key"→ replace aria-label attribute
(() => {
  const SUPPORTED_LANGS = ['ko', 'en', 'ja', 'zh', 'es'];
  const dict = {
    ko: {
      'header.title': '가사 다운로드 설정',
      'header.subtitle': '썸네일 다운로드 버튼 기본값',
      'header.openSuno': 'Suno 열기',
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
      'prefs.languageHint': '팝업과 옵션 페이지의 표시 언어를 선택하세요. 설정은 자동 저장됩니다.',
      'prefs.pageTitle': '환경설정',
      'prefs.back': '← 팝업으로 돌아가기',
      'share.title': '친구에게 공유',
      'share.subtitle': '설치 링크를 클립보드에 복사합니다',
      'review.title': '후기 공유하기',
      'review.subtitle': '크롬 웹스토어에 별점과 후기를 남겨주세요',
      'toast.copied': '설치 링크를 복사했습니다',
      'toast.copyFailed': '복사에 실패했습니다',
      'docTitle': 'SUNO 가사 다운로더',
      'options.docTitle': 'SUNO 가사 다운로더 — 환경설정'
    },
    en: {
      'header.title': 'Lyrics download settings',
      'header.subtitle': 'Defaults for the thumbnail download buttons',
      'header.openSuno': 'Open Suno',
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
      'prefs.languageHint': 'Choose the display language for the popup and options page. Saves automatically.',
      'prefs.pageTitle': 'Preferences',
      'prefs.back': '← Back to popup',
      'share.title': 'Share with a friend',
      'share.subtitle': 'Copies the install link to the clipboard',
      'review.title': 'Leave a review',
      'review.subtitle': 'Rate and review on the Chrome Web Store',
      'toast.copied': 'Install link copied',
      'toast.copyFailed': 'Copy failed',
      'docTitle': 'SUNO Lyrics Downloader',
      'options.docTitle': 'SUNO Lyrics Downloader — Preferences'
    },
    ja: {
      'header.title': '歌詞ダウンロード設定',
      'header.subtitle': 'サムネイルのダウンロードボタンの初期値',
      'header.openSuno': 'Suno を開く',
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
      'prefs.languageHint': 'ポップアップと設定ページの表示言語を選びます。自動保存されます。',
      'prefs.pageTitle': '環境設定',
      'prefs.back': '← ポップアップに戻る',
      'share.title': '友達に共有',
      'share.subtitle': 'インストールリンクをクリップボードにコピーします',
      'review.title': 'レビューを書く',
      'review.subtitle': 'Chrome ウェブストアで星とレビューをお願いします',
      'toast.copied': 'インストールリンクをコピーしました',
      'toast.copyFailed': 'コピーに失敗しました',
      'docTitle': 'SUNO 歌詞ダウンローダー',
      'options.docTitle': 'SUNO 歌詞ダウンローダー — 環境設定'
    },
    zh: {
      'header.title': '歌词下载设置',
      'header.subtitle': '缩略图下载按钮的默认值',
      'header.openSuno': '打开 Suno',
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
      'prefs.languageHint': '选择弹窗和设置页面的显示语言。自动保存。',
      'prefs.pageTitle': '偏好设置',
      'prefs.back': '← 返回弹窗',
      'share.title': '分享给好友',
      'share.subtitle': '将安装链接复制到剪贴板',
      'review.title': '撰写评价',
      'review.subtitle': '在 Chrome 应用商店为我们打分留评',
      'toast.copied': '已复制安装链接',
      'toast.copyFailed': '复制失败',
      'docTitle': 'SUNO 歌词下载器',
      'options.docTitle': 'SUNO 歌词下载器 — 偏好设置'
    },
    es: {
      'header.title': 'Ajustes de descarga de letras',
      'header.subtitle': 'Valores por defecto para los botones de la miniatura',
      'header.openSuno': 'Abrir Suno',
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
      'prefs.languageHint': 'Elige el idioma de la ventana emergente y de la página de preferencias. Se guarda automáticamente.',
      'prefs.pageTitle': 'Preferencias',
      'prefs.back': '← Volver a la ventana',
      'share.title': 'Compartir con un amigo',
      'share.subtitle': 'Copia el enlace de instalación al portapapeles',
      'review.title': 'Dejar una reseña',
      'review.subtitle': 'Califica y comenta en la Chrome Web Store',
      'toast.copied': 'Enlace de instalación copiado',
      'toast.copyFailed': 'Error al copiar',
      'docTitle': 'Descargador de letras SUNO',
      'options.docTitle': 'Descargador de letras SUNO — Preferencias'
    }
  };

  function setTextPreservingChildren(node, text) {
    const trailing = node.querySelector(':scope > span[aria-hidden="true"]');
    if (trailing) {
      node.textContent = `${text} `;
      node.appendChild(trailing);
    } else {
      node.textContent = text;
    }
  }

  function apply(lang, options = {}) {
    const d = dict[lang] || dict.ko;
    document.documentElement.lang = lang;
    const titleKey = options.titleKey || 'docTitle';
    if (d[titleKey]) document.title = d[titleKey];
    for (const node of document.querySelectorAll('[data-i18n]')) {
      const value = d[node.dataset.i18n];
      if (typeof value === 'string') setTextPreservingChildren(node, value);
    }
    for (const node of document.querySelectorAll('[data-i18n-title]')) {
      const value = d[node.dataset.i18nTitle];
      if (typeof value === 'string') node.setAttribute('title', value);
    }
    for (const node of document.querySelectorAll('[data-i18n-aria-label]')) {
      const value = d[node.dataset.i18nAriaLabel];
      if (typeof value === 'string') node.setAttribute('aria-label', value);
    }
  }

  function t(lang, key) {
    return dict[lang]?.[key] ?? dict.ko[key] ?? key;
  }

  function normalizeLang(lang) {
    return SUPPORTED_LANGS.includes(lang) ? lang : 'ko';
  }

  window.SCS_I18N = { SUPPORTED_LANGS, dict, apply, t, normalizeLang };
})();
