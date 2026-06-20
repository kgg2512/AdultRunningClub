# ARC — 런칭 준비 상태 & 회장 액션 (2026-06-21)

> 단일 진실 원천. 웹 실서비스 · 앱(양대 스토어) · 투자자 데모 — 3개 목표의 현재 상태와 남은 작업.
> Alpha가 코드/설정으로 끝낼 수 있는 건 끝냈다. **회장만 할 수 있는 것**(계정·키·제출·실기기 빌드)이 남았다.

---

## 0. 한눈에

| 목표 | 상태 | 남은 블로커(누가) |
|------|------|------------------|
| **투자자 데모** | ✅ **완료·구동** | 없음 (지금 시연 가능) |
| **웹 실서비스** | 🟡 코드 완성, 백엔드 대기 | Supabase 프로젝트 생성+키 입력 (회장) |
| **앱 — 심사 통과** | 🟡 심사 결함 대거 해소, 빌드/제출 대기 | 개발자 계정·실기기 빌드·메타데이터·제출 (회장) |

**투자자 데모 링크 (지금 바로):** `https://kgg2512.github.io/AdultRunningClub/?demo=true`
→ 게이트에서 **"데모 둘러보기"** 한 번 누르면 캘린더·Who's Going·밋업·RSVP·알림·프로필 전부 살아있음. Supabase 불필요.

---

## 1. 이번 세션에 완료한 것 (검증 증빙 포함)

### A. 데모 모드 (키스톤) — `js/db-demo.js`
- db.js와 동일 인터페이스의 드롭인 목 레이어. Supabase 0건으로 전 기능 구동.
- 시드: 멤버 16 · 밋업 6 · 알림 5 · 대회 43(최근14일+ 필터) · localStorage 보존(쓰기가 실제처럼).
- 활성: 웹 `?demo=true` / 앱 `config.js`의 `window.ARC_FORCE_DEMO=true`.
- **3-in-1 용도:** ①투자자 데모 ②앱스토어 리뷰어 전기능 접근(Apple 2.1) ③웹 무설정 시연.
- **검증:** Playwright 풀플로우 PASS(게이트→데모진입→캘린더33→대회상세→참가토글→밋업→RSVP→밋업개설→알림→프로필), 콘솔오류 0.

### B. 앱 빌드 정합 (심사 블로커 해소)
- 🔴 **www/ V2→V3 동기화:** 앱이 옛 V2(148K, js/ 없음)를 올리던 치명 결함 해소. `scripts/sync-www.js`(크로스플랫폼)로 전체 번들 복제.
- 🔴 **Android 위치권한 제거:** `ACCESS_FINE/COARSE_LOCATION` 삭제(V3 GPS 미사용 — 미사용 위험권한=반려). INTERNET만.
- 🔴 **targetSdk 34→35:** Google Play 2025-08-31~ 신규앱 35 필수.
- 🟡 **미사용 플러그인 제거:** geolocation·push-notifications(APNs/FCM 미설정 시 반려) 제거.
- 🟡 **메타데이터 통일:** appName "Running Society"→"ARC", package 메타 V3 정정.
- 🟡 **iOS Privacy Manifest:** PreciseLocation/DeviceID(V2 GPS/푸시) → Email/Name/OtherUserContent(V3 현실). Info.plist 위치/백그라운드 모드 제거.

### C. UGC 모더레이션 (Apple 1.2 / Google UGC — 하드 블로커)
- 멤버 신고·차단(Who's Going·참석자 행), 밋업 신고, 프로필 차단목록 관리. 차단 시 콘텐츠 숨김.
- schema: `blocks`·`reports` 테이블 + RLS + `file_report`/`block_member`/`unblock_member` RPC.
- 약관 `terms.html`: 골격→완성 + **무관용 EULA 조항**.
- **검증:** Playwright PASS(신고 접수·차단 행제거·프로필 차단목록·해제·밋업신고), 콘솔오류 0.

### D. 웹 계정삭제 페이지 — `delete-account.html` (Google 정책: 앱 없이 삭제 요청 URL)
- (인앱 삭제는 V3에 이미 존재: 마이→회원 탈퇴)

---

## 2. 회장 액션 — 웹 실서비스 켜기 (≈30분)

1. **Supabase 프로젝트 생성** (supabase.com, 무료 Hobby).
2. SQL Editor에서 순서대로 실행: `supabase/schema_v3.sql` → `supabase/seed_races.sql`.
3. **Auth 설정:** Email 인증 활성화, **Confirm email = OFF**(가입 즉시 입장 설계).
4. `js/config.js`에 **Project URL + anon key** 입력(placeholder 교체).
5. 초대코드 발급: `SELECT public.admin_create_invite_code('KWC-1', 130, NOW() + INTERVAL '90 days');`
6. 화이트리스트 이메일 등록(`allowed_emails`).
7. push: `git add -A && git commit && git push` → GitHub Pages 자동 반영.
→ 이후 실가입 1회 스모크(가입→초대코드→캘린더) 권장. Alpha가 키 받으면 검증 대행 가능.

---

## 3. 회장 액션 — 앱 스토어 제출

### 3-1. 사전 (계정·환경)
- [ ] **Apple Developer Program** 가입 ($99/년) — iOS 필수.
- [ ] **Google Play Console** 등록 ($25 1회) — Android.
- [ ] 개발 환경: **Xcode**(Mac, iOS 빌드) / **Android Studio + SDK 35**(Android 빌드).

### 3-2. 빌드 (Alpha가 코드/설정은 끝냄, 실기기 빌드만 회장)
```
cd AdultRunningClub
npm install                 # 플러그인 변경 반영(geolocation·push 제거)
npm run sync                # www/ 최신화 (node scripts/sync-www.js)
npx cap sync                # 네이티브 프로젝트 동기화
npx cap open android        # Android Studio → SDK35 빌드/서명(AAB)
npx cap add ios && npx cap open ios   # (Mac) iOS — Privacy Manifest/Info.plist 병합 후 Archive
```
- iOS: `ios-templates/PrivacyInfo.xcprivacy` → `ios/App/App/`에 복사, `Info.plist.additions` 내용 병합.
- ⚠️ **빌드 검증은 미완**(이 환경에 Android SDK/Xcode 없음). 위 변경의 컴파일 통과는 회장 환경에서 확인 필요. targetSdk 35가 Capacitor 6에서 빌드 이슈 시 Capacitor 7 업그레이드 검토.
- 심사용 빌드: `config.js`에서 `window.ARC_FORCE_DEMO = true` 주석 해제 → 리뷰어가 데모로 전기능 접근(Apple 2.1). **단 실서비스 정식 출시 빌드는 반드시 false로.**

### 3-3. 스토어 등록 메타데이터 (양쪽 일치 必)
- **앱 이름:** ARC (부제 "Members' Running Network"). "Adult Running Club" 표기 지양(성인콘텐츠 오해).
- **개인정보처리방침 URL:** `https://kgg2512.github.io/AdultRunningClub/privacy.html`
- **계정삭제 URL(Google Data Safety):** `https://kgg2512.github.io/AdultRunningClub/delete-account.html`
- **App Privacy / Data Safety 선언(일치):** 이메일·이름·기타사용자콘텐츠(소속·소개·밋업) = 앱기능, 추적 안 함. (iOS PrivacyInfo.xcprivacy와 동일하게.)
- **연령 등급:** 18+ (멤버 실명공개 소셜 + UGC). 질문지에 "사용자 생성 콘텐츠·사용자 간 소통 있음" 정직 체크.
- **App Review 노트(Apple 2.1):** "초대 전용 폐쇄 네트워크. 리뷰는 데모 모드로 전기능 접근(앱 첫 화면 '데모 둘러보기'). 또는 데모 계정 [이메일/비번] + 초대코드 [코드]." + 신고/차단 위치 안내.
- [ ] **스크린샷**(필수): iPhone 6.7"/6.5", Android. 데모 모드로 캘린더·대회상세·밋업·프로필 캡처. (Alpha가 Playwright로 생성 대행 가능.)
- [ ] **아이콘/피처그래픽:** `icons/` 보유. Play 피처그래픽(1024×500) 필요 시 별도 제작.

---

## 4. 남은 보완 (제출 전 권장 — 회장 판단)

| 항목 | 상태 | 비고 |
|------|------|------|
| terms/privacy **CLO 최종검토** | 🟡 기능 baseline 완성 | 준거법·사업자정보·개인정보 항목 법무 확정 권장 |
| 차단 **서버측 필터** | 🟡 데모 완료, 실백엔드 주석 | schema 10.9 주석대로 attendee RPC에 차단필터 적용(배포 시) |
| 네이티브 **빌드 컴파일 검증** | 🔴 미검증 | Android SDK/Xcode 필요(회장) |
| 스크린샷·피처그래픽 | ⬜ 미생성 | Alpha 대행 가능 |
| 실가입 백엔드 스모크 | ⬜ 키 입력 후 | Alpha 대행 가능 |

---

## 5. 정직한 한계 (Alpha가 검증 못 한 것)
- **네이티브 빌드가 실제로 컴파일/실행되는지**는 이 환경(Android SDK·Xcode 없음)에서 확인 불가. 설정은 소스 기준 정확하나, 실기기 빌드는 회장 환경에서 검증 필요.
- **Supabase 백엔드 경로**(실 auth·RPC·RLS·신규 moderation RPC)는 라이브 인스턴스 없이는 런타임 검증 불가. 검증된 것은 데모/클라이언트 경로.
- 스토어 심사는 사람 리뷰어 재량 — "모든 기준 충족"을 보장할 수는 없으나, 알려진 반려 사유(2.1/4.2/1.2/5.1.1/권한/메타/targetSdk)는 선제 해소.
