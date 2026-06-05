# ARC — Google Play Store 스크린샷 가이드

## 제출 규격
- **크기**: 최소 320px 이상, 권장 **1080×1920px** (세로) 또는 **390×844px** (개발 캡처용)
- **형식**: PNG 또는 JPEG (90% 이상 품질)
- **최소 제출 수**: 2장 / 최대 8장
- **비율**: 9:16 권장 (세로 스마트폰 비율)

---

## 캡처 방법

### 방법 A — Chrome 개발자 도구 (권장, 무료)

1. Chrome에서 `https://kgg2512.github.io/AdultRunningClub/` 열기
2. `F12` → 개발자 도구 열기
3. 상단 툴바에서 **기기 토글 아이콘** (Ctrl+Shift+M) 클릭
4. 드롭다운에서 `iPhone 14 Pro` 선택 (390×844)
5. 우상단 `⋮` 메뉴 → **"Capture full size screenshot"** 또는 **"Capture screenshot"**
6. 자동으로 PNG 다운로드됨

> **고해상도 캡처**: 기기 설정에서 DPR(Device Pixel Ratio)을 3으로 설정하면 1170×2532px 출력

### 방법 B — 실제 스마트폰 캡처

1. 스마트폰에서 `https://kgg2512.github.io/AdultRunningClub/` 접속
2. 각 화면에서 스크린샷 (안드로이드: 전원 + 볼륨 다운)
3. USB로 PC에 전송 후 Google Play Console에 업로드

---

## 필수 캡처 화면 목록

### Screenshot 01 — 메인 랜딩 (필수)
- **URL**: `https://kgg2512.github.io/AdultRunningClub/`
- **화면**: 히어로 섹션 (ARC 워드마크 + 슬로건 전체 보이도록)
- **저장명**: `screenshot-01-hero.png`
- **포인트**: 딥 차콜 배경 + 샴페인 골드 타이포그래피 — 럭셔리 무드 강조

### Screenshot 02 — 멤버십 소개 (필수)
- **URL**: `https://kgg2512.github.io/AdultRunningClub/` (스크롤 다운)
- **화면**: 멤버십 티어 또는 "About" 섹션
- **저장명**: `screenshot-02-membership.png`
- **포인트**: 멤버십 가치 제안이 보이는 섹션

### Screenshot 03 — 활동/이벤트 섹션 (권장)
- **URL**: 이벤트/러닝 일정 섹션으로 스크롤
- **저장명**: `screenshot-03-events.png`
- **포인트**: 커뮤니티 활동, 러닝 코스 등 노출

### Screenshot 04 — 회원가입/가입 폼 (권장)
- **URL**: 회원가입 섹션
- **저장명**: `screenshot-04-join.png`
- **포인트**: CTA(행동 유도) 명확히 노출

---

## 파일 저장 위치
```
AdultRunningClub/
└── store-assets/
    ├── feature-graphic.html        ← 브라우저에서 캡처 (1024×500px)
    ├── feature-graphic.png         ← 캡처 후 저장할 위치
    ├── screenshot-01-hero.png      ← 직접 캡처 후 저장
    ├── screenshot-02-membership.png
    ├── screenshot-03-events.png    (선택)
    ├── screenshot-04-join.png      (선택)
    └── SCREENSHOT_GUIDE.md         ← 이 파일
```

---

## Feature Graphic 캡처 방법

`feature-graphic.html`을 정확히 **1024×500px**로 캡처:

1. Chrome에서 `feature-graphic.html` 파일 열기 (드래그 앤 드롭)
2. `F12` → Console 탭 클릭
3. 아래 명령어 입력 후 Enter:
   ```javascript
   // 현재 뷰포트 크기 확인
   console.log(window.innerWidth, window.innerHeight)
   ```
4. 뷰포트가 1024×500이 아니면: 개발자 도구 → 기기 토글(Ctrl+Shift+M) → 우상단 `⋮` → **Edit** → 1024×500 직접 입력
5. `⋮` → **"Capture screenshot"** 클릭
6. `feature-graphic.png`으로 저장

---

## 앱 아이콘 확인

- **현재 파일**: `AdultRunningClub/icons/icon-512.png`
- **Play Store 요건**: 512×512px PNG
- **판단**: icon-512.png 파일이 존재하므로 **사용 가능** (크기 적합)
- **유의사항**: Google Play는 아이콘 배경 투명도를 허용하나, 배경이 딥 차콜(#0A0908)로 채워진 경우도 허용됨

---

## Google Play Console 업로드 순서

1. [Google Play Console](https://play.google.com/console) 접속
2. 앱 선택 → **스토어 등록정보** → **그래픽**
3. 업로드 순서:
   - **앱 아이콘**: `icons/icon-512.png`
   - **Feature Graphic**: `store-assets/feature-graphic.png`
   - **스크린샷**: `screenshot-01~04.png` 순서대로

---

## 주의사항

- Feature Graphic에 **텍스트는 중앙 80% 영역** 안에 위치해야 함 (가장자리 10% 여백 — HTML 이미 준수)
- 스크린샷에 **디바이스 프레임(폰 외곽선) 포함 가능** — Play Console에서 선택 옵션 제공
- **앱 미설치 상태**로도 PWA 스크린샷 제출 가능 (브라우저 캡처 허용)
