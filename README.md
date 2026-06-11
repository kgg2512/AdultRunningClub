# ARC — Members' Running Network

**G2 Company Ltd 공식 프로젝트**

> 폐쇄형 멤버 러닝 네트워크.
> *대회 캘린더 · Who's Going · Hub 밋업.*

초대받은 멤버만 입장하는 러닝 네트워크. 이번 주말 어느 대회에 누가 가는지 확인하고, Hub 밋업으로 함께 달린다.

---

## 라이브

- **V3 (현행)**: [https://kgg2512.github.io/AdultRunningClub/](https://kgg2512.github.io/AdultRunningClub/) — 초대코드 필요 (폐쇄형)
- **V2 데모 (legacy)**: [https://kgg2512.github.io/AdultRunningClub/legacy/?demo=true](https://kgg2512.github.io/AdultRunningClub/legacy/?demo=true) — 기존 데모 링크는 `/legacy/`로 이동했습니다.

---

## 제품 개요 (V3)

| 항목 | 내용 |
|------|------|
| 유형 | 폐쇄형 멤버 러닝 네트워크 (초대코드 전용) |
| 브랜드 | ARC — Members' Running Network |
| 핵심 기능 | 대회 캘린더(큐레이션 시드) · Who's Going · Hub 밋업 · 인앱 알림 |
| 제외 (의도적) | GPS 기록 · 피드/게시글 · 월드맵 · 프로필 사진 · 마일리지 · 인증제 |

## 구조

```text
index.html            V3 마크업 + CSS
js/config.js          Supabase 키 (placeholder — 입력 시 활성화)
js/db.js              데이터 계층 (auth · RPC 래퍼)
js/app.js             해시 라우터 · 렌더링
supabase/schema_v3.sql  V3 스키마 단일 실행본 (SQL Editor 1회 실행)
supabase/seed_races.sql 대회 시드 (scripts/seed_races.py 생성물)
supabase/functions/notify-cron/  D-1 밋업 리마인드 Edge Function
legacy/               V2 보존 (git tag v2.0)
```

## 기술 스택

- **Frontend**: HTML5, CSS3, Vanilla JS (PWA) — 외부 의존성: Supabase JS SDK + Google Fonts만
- **Backend**: Supabase (Postgres RLS · RPC · Edge Functions)
- **배포**: GitHub Pages

---

© 2026 G2 Company Ltd. All rights reserved.
