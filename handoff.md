# Handoff — SUNO 가사 다운로더

## 현재 상태
- 브랜치: `main` (커밋 전, 작업 트리에 변경사항 있음)
- 버전: **1.3.0** (manifest.json / package.json)
- 빌드: `npm run validate` ✅ / `npm run pack` ✅ → `dist/suno-caption-studio.zip`

## 최근 작업: 프리미엄 결제 — 자체 백엔드 + 페이앱 (v1.3.0)
Lemon Squeezy 매장 거절 → **webwoori(Next.js)에 자체 라이선스 서버 + 페이앱 1회성 결제**로 전환. 설정: `SETUP-PAYMENT.md`.
상품: 1개월 ₩2,900 / 1년 ₩9,900 / 평생 ₩15,600 (자동갱신 없음, 카드·카카오·네이버페이).

**확장 쪽 (이 repo):**
- `background.js`: `caption-studio:license` 핸들러 → `https://webwoori.com/api/license/*` (`callLicenseApi`, LS 호환 응답), 12h 자동 재검증
- `content.js`: `isPremium()` → 단일/일괄 quota 우회
- `options.js`: 프리미엄 카드, `meta.app==='suno-caption'` 검증, 구매버튼 → `webwoori.com/buy/suno-caption`
- `popup.js`: 프리미엄이면 quota 숨김 / 한도 시 프리미엄 CTA
- `manifest.json`: host_permission `webwoori.com`

**백엔드 (repo: /Users/johau/project/10_webwoori):**
- `src/lib/{licenses,orders,payapp,license-http}.ts`
- `src/app/api/license/{activate,validate,deactivate}`, `api/payapp/{checkout,feedback,order}`, `api/admin/license`
- `src/app/[locale]/(public)/buy/suno-caption/{page,complete/page}.tsx` + `components/{PurchasePanel,PurchaseComplete}.tsx`
- 저장: `private/licenses.json`, `private/payapp-orders.json` (Docker 영구 볼륨)
- **검증 완료(2026-07-01)**: 로컬 dev + 가짜 연동값으로 결제요청·웹훅검증·발급·멱등성·활성화 전 과정 통과. tsc/eslint/next build ✅

- **출시 전 할 일**: webwoori 프로덕션 `.env`에 `PAYAPP_USERID/LINKKEY/LINKVAL`, `ADMIN_API_SECRET`(현재 빈값), `RESEND_FROM_EMAIL` 설정 → 배포 → 실결제 테스트. (`SETUP-PAYMENT.md` 참고)

## UI 위치 (커버 썸네일 좌상단으로 통일)
- 곡 페이지: 곡 커버(`img[alt="Song Cover Image"]`) 좌상단 → LRC/SRT/TXT 버튼(absolute, 스크롤 따라감)
- 플레이리스트: 커버(`img[alt="Playlist cover art"]`) 좌상단 → 동그란 앱 아이콘, 클릭 시 즉시 다운로드 + 아이콘 둘레 원형 링 진행표시. 저장형태(ZIP/합치기)는 옵션 페이지 설정.
- 가사 DOM 추정 배치(findLyricsAnchor 등) 죽은 코드 제거 완료.

## 최근 작업: 플레이리스트 가사 일괄 다운로드 (v1.2.0)
플레이리스트 페이지(`/playlist/{uuid}`)에서 모든 곡 가사를 한 번에 다운로드.

- **신규 `zip.js`**: 의존성 없는 순수 JS ZIP(STORE) 생성기. UTF-8 파일명 지원(플래그 0x0800). Python zipfile CRC 검증 통과.
- **`background.js`**: `caption-studio:load-playlist` 핸들러 추가 — `studio-api.prod.suno.com/api/playlist/{id}/?page=N` 페이지네이션(50곡/페이지, 최대 40페이지), 중복 제거. `fetchJson`에 AbortController 타임아웃(20s) 추가.
- **`content.js`**:
  - 플레이리스트 페이지 감지(`getPlaylistIdFromLocation`), 우하단 고정 액션 카드(`.scs-bulk`).
  - `ZIP` / `합치기` 토글 → `settings.bulkOutput`(기본 `zip`) 저장.
  - 일괄 다운로드는 **현재 선택된 형식**(LRC/SRT/TXT) 사용, 진행률 표시, 가사 없는 곡 자동 제외.
  - 포맷 헬퍼(`renderExport`/`toLrc`/`toTxt`/`makeFileName`)를 ctx 인자 받도록 리팩터링(단일 곡 경로는 기본값 `currentCtx()`로 동작 동일).
  - `sendMessage`에 lastError 처리 + 선택적 타임아웃. 네비게이션 중단 시 `bulkAbort` 플래그로 안전 종료.
  - 신규 사용자 다운로드 쿼터: 남은 한도까지만 저장(트림) + 안내.
- `scripts/package.js` include 목록에 `zip.js` 추가.

## 테스트 방법
1. `chrome://extensions/` → 확장 새로고침(또는 dist/unpacked 로드)
2. Suno 로그인 상태에서 `suno.com/playlist/{uuid}` 진입
3. 우하단 "전체 가사 다운로드" 버튼 → ZIP 또는 합친 텍스트 확인

## 알려진 제약
- `/playlist/liked` 등 UUID가 아닌 슬러그는 미지원(Suno API 엔드포인트가 UUID 전용).
- 라이브러리 그리드(이미지의 Playlists 탭)에서가 아니라 **플레이리스트 상세 페이지**에서 동작.

## 다음 TODO 후보
- 커밋/PR (사용자 요청 시)
- 필요 시 라이브러리 `/me` 페이지에서 플레이리스트 선택 일괄 다운로드 확장
