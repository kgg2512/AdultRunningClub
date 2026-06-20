// ARC V3 — Supabase 연결 설정 (회장 입력 — TECH_SPEC §10 액션 8)
// 키 입력만으로 활성화되는 구조. anon key는 공개 전제 설계 — RLS가 방어.
// ⚠️ placeholder 문자열('YOUR_' 접두) 변경 전에는 앱이 "설정 대기" 안내를 표시한다.
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

// ── 데모/심사 빌드 플래그 (DEMO MODE) ──────────────────────────
// 웹은 ?demo=true 로 데모 진입. 앱(쿼리스트링 불가)에서 데모를 켜려면 아래 주석 해제.
// 실서비스(Supabase 연결) 빌드에서는 반드시 false/주석 유지.
// window.ARC_FORCE_DEMO = true;
