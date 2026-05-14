# Suno Caption Studio

Suno Caption Studio는 Suno 곡 페이지에서 동기화된 가사/캡션을 `LRC`, `SRT`, `TXT`로 저장하는 Chrome 확장 프로그램입니다.

이 프로젝트는 특정 기존 저장소의 수정 포크가 아니라 새로 작성한 독립 코드베이스입니다. Suno와 제휴, 후원, 승인 관계가 없는 비공식 도구입니다.

## 편의 기능

- 곡 페이지의 가사 영역 위에 `LRC`, `SRT`, `TXT` 다운로드 버튼 표시
- 형식별 원클릭 저장
- 파일명 규칙 선택: 제목+곡 ID, 제목만, 곡 ID만
- `LRC/TXT`에 제목과 곡 ID 메타데이터 포함 옵션
- 가사 정리 옵션: 원본 유지, 기본 정리, 강력 정리
- 확장 프로그램 팝업의 개발자 다른 도구 링크
- 설정 자동 저장
- 별도 빌드 도구 없이 Chrome에서 바로 로드 가능

## 지원 페이지

```text
https://suno.com/song/{song-id}
```

Suno에 로그인된 브라우저 세션이 있어야 캡션 데이터를 불러올 수 있습니다. 동기화된 캡션 데이터가 없는 곡에서는 저장 버튼이 비활성화됩니다.

## 설치

1. Chrome에서 `chrome://extensions/` 열기
2. 오른쪽 위 `개발자 모드` 켜기
3. `압축해제된 확장 프로그램을 로드합니다` 클릭
4. 이 프로젝트 폴더 선택

웹스토어 업로드용 zip은 아래 명령으로 만듭니다.

```bash
npm run pack
```

생성 파일:

```text
dist/suno-caption-studio.zip
```

## 개발 명령어

```bash
npm run validate
npm run icons
npm run pack
```

## 개인정보

확장 프로그램은 Suno 페이지와 Suno caption API에만 접근합니다. 자체 서버를 운영하지 않으며, 사용자 데이터나 곡 데이터를 별도 서버로 전송하지 않습니다. 파일 생성과 복사는 사용자의 브라우저 안에서 처리됩니다.

개인정보처리방침은 [`PRIVACY.md`](PRIVACY.md)를 참고하세요.

## 비공식 고지

Suno Caption Studio는 Suno의 공식 제품이 아닙니다. 스토어 설명, 아이콘, 스크린샷, 홍보 문구에서 Suno가 승인하거나 제작한 제품처럼 표현하지 마세요.

## 라이선스

MIT License
