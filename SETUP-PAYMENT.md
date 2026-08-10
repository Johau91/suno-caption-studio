# 결제/프리미엄 설정 가이드 (자체 백엔드 + 페이앱)

Lemon Squeezy 매장이 거절되어, **webwoori(Next.js) 안에 자체 라이선스 서버 + 페이앱 1회성 결제**로 구현했습니다.
결제사는 부품처럼 교체 가능하고, 여러 상품에 재사용됩니다.

## 구조
```
[크롬 확장] ──라이선스 키──> [webwoori /api/license/*]
[확장 옵션] ──결제요청──> [webwoori /api/payapp/checkout] ──결제창──> [페이앱]
[페이앱] ──웹훅──> [webwoori /api/payapp/feedback] ──발급──> 라이선스 + 이메일(Resend)
[확장 옵션] ──주문상태 폴링──> [webwoori /api/payapp/order] ──자동 활성화
```

## 상품 (1회성 결제, 자동갱신 없음)
| 이용권 | 기간 | 가격 |
|---|---|---|
| 1개월 | 30일 | ₩2,900 |
| 1년 | 365일 | ₩9,900 |
| 평생 | 만료 없음 | ₩15,600 |
- 결제수단: 카드·카카오페이·네이버페이 (간편결제는 1회성만 지원되어 이 방식 채택)
- 가격/기간은 확장의 `options.js`(`TIER_PRICE`)·`options.html`과 `webwoori/src/lib/licenses.ts`(`LICENSE_TIERS`)가 소스입니다. 변경 시 모두 맞춰야 합니다.

## webwoori 쪽 코드 (구현 완료)
- `src/lib/licenses.ts` — 라이선스 발급/검증 (private/licenses.json)
- `src/lib/orders.ts` — 주문 (private/payapp-orders.json)
- `src/lib/payapp.ts` — 페이앱 결제요청 + 웹훅 검증
- `src/app/api/license/{activate,validate,deactivate}` — 확장용 (LS 호환 응답)
- `src/app/api/payapp/{checkout,feedback,order}` — 결제/웹훅/조회
- `src/app/api/admin/license` — 관리자 수동 발급/조회 (Basic auth)
- `src/app/[locale]/(public)/buy/suno-caption` + `/complete` — 구매·결제완료 페이지

## 확장 쪽 (구현 완료)
- `background.js` → `https://webwoori.com/api/license/*` 호출
- `options.js` → 옵션 페이지의 인라인 구매 폼에서 결제 요청, 페이앱 결제창 열기, 주문 상태 확인 후 자동 활성화. `meta.app === 'suno-caption'`을 필수 검증
- `manifest.json` → host_permission `webwoori.com`

## 출시 전 할 일 (env + 배포)
webwoori 프로덕션 `.env`에 설정:
```
PAYAPP_USERID=<페이앱 회원 아이디>
PAYAPP_LINKKEY=<연동 KEY>       # 페이앱 관리자 → 설정 → 연동정보
PAYAPP_LINKVAL=<연동 VALUE>
ADMIN_API_SECRET=<8자 이상>      # 현재 빈 값 — 관리자 발급/환불용, 꼭 설정
RESEND_API_KEY=<이미 설정됨>     # 라이선스 키 이메일 발송
RESEND_FROM_EMAIL=<인증 도메인 from, 예: noreply@webwoori.com>
NEXT_PUBLIC_SITE_URL=https://webwoori.com
```
그다음:
1. **webwoori 배포** (git push → 자동 빌드). `/api/health`와 결제·라이선스 API 응답 확인.
2. **확장 배포/새로고침** (이미 webwoori를 가리킴).
3. **실결제 테스트**: 확장 옵션 → 프리미엄 이용권 구매 → 1개월(₩2,900) 결제 → 주문 상태 확인 → 라이선스 자동 활성화 및 이메일 키 수신 확인.
4. **복구 테스트**: 이메일로 받은 키를 수동 활성화하고, 비활성화·재활성화·만료 응답도 확인.

## 운영 참고
- **수동 발급/환불**: `curl -u ":<ADMIN_API_SECRET>" -X POST https://webwoori.com/api/admin/license -d "tier=lifetime&email=..."` / 조회는 GET.
- **정산**: 페이앱은 실결제 정산 시 업종심사(3~5영업일) + 경우에 따라 보증보험 필요 (월매출 500만↓ 또는 건당 50만↓ 면제).
- **부가세**: MoR 아님 → 세금 직접 처리.
- **데이터**: `private/licenses.json`, `private/payapp-orders.json` (Docker 영구 볼륨, gitignore).
- **자동 재검증**: 확장이 12시간마다 라이선스 재검증 → 만료 시 프리미엄 자동 해제.
- **결제 복구**: 결제 중 옵션 페이지를 닫아도 주문 ID를 로컬에 최대 24시간 보관하고, 다음 실행에서 자동 활성화를 재개.
- **미결제 데이터 정리**: 24시간 지난 pending 주문과 7일 지난 failed 주문은 서버에서 자동 삭제.

## 테스트 완료 (2026-07-01)
로컬 dev + 가짜 연동값으로 전 과정 시뮬레이션 검증: 결제요청 생성, 웹훅 위변조 검증(정상/실패), 라이선스 발급, 멱등성(중복 발급 없음), 키 활성화·만료 계산 — 모두 정상.
