/* ============================================================
 * ARC V3 — 데모 데이터 계층 (DEMO MODE)
 * db.js와 100% 동일 인터페이스의 드롭인 목(mock). Supabase 0건.
 * 용도(3-in-1): ①투자자 데모 ②앱스토어 리뷰어 전기능 접근(Apple 2.1) ③웹 무설정 시연
 * 활성: ?demo=true  또는  capacitor(앱)에서 config 미설정 시 자동
 * 상태는 localStorage('arc3.demo.*')에 보존 → 세션 내 쓰기가 실제처럼 동작
 * ⚠️ 가상 데이터는 전부 'DEMO' 라벨. 실멤버 정보 없음(폐쇄형 유지).
 * ==========================================================*/
'use strict';
(() => {
  const params = new URLSearchParams(location.search);
  // 활성 조건: ?demo=true (웹/투자자)  또는  config의 window.ARC_FORCE_DEMO=true (앱 심사 빌드)
  const FORCE_DEMO = params.get('demo') === 'true' || window.ARC_FORCE_DEMO === true;
  // 실서비스 배포 시 둘 다 꺼져 있으면 기존 db.js(Supabase) 그대로 — 프로덕션 안전.
  if (!FORCE_DEMO) return;

  window.__ARC_DEMO = true;
  const NS = 'arc3.demo.';
  const LS = {
    g(k, d) { try { const v = localStorage.getItem(NS + k); return v != null ? JSON.parse(v) : d; } catch { return d; } },
    s(k, v) { try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch {} },
    rm(k) { try { localStorage.removeItem(NS + k); } catch {} }
  };
  const nowISO = () => new Date().toISOString();
  const inDays = (d, h = 7, m = 0) => { const t = new Date(); t.setDate(t.getDate() + d); t.setHours(h, m, 0, 0); return t.toISOString(); };
  const agoH = h => new Date(Date.now() - h * 3600e3).toISOString();

  /* ── 멤버 풀 (DEMO — Who's Going / 참석자 목록용) ───────────── */
  const MEMBERS = [
    { full_name: '김서연', organization: '강남 러닝크루' },
    { full_name: '박지훈', organization: '한강 페이서스' },
    { full_name: '이수민', organization: 'KAIST 웰니스클럽' },
    { full_name: '정민재', organization: '판교 새벽런' },
    { full_name: '최예진', organization: '서초 마라톤클럽' },
    { full_name: '한도윤', organization: '분당 러너스' },
    { full_name: '오하늘', organization: '송파 새벽조' },
    { full_name: '신준호', organization: '마포 리버런' },
    { full_name: '윤채원', organization: '강북 트레일러너스' },
    { full_name: '임태경', organization: '용산 미드나잇런' },
    { full_name: '배소율', organization: '성수 러닝랩' },
    { full_name: '노건우', organization: '일산 호수런' },
    { full_name: '서지아', organization: '대전 둔산런' },
    { full_name: '문해성', organization: '유성 캠퍼스런' },
    { full_name: '장하린', organization: '세종 호수공원런' },
    { full_name: '권민석', organization: '대덕 새벽런' }
  ];
  const pageOf = (arr, offset, size = 20) => arr.slice(offset, offset + size);

  /* ── 데모 유저(투자자 = '나') ───────────────────────────────── */
  const DEMO_UID = 'demo-user-0001';
  function defaultProfile() {
    return {
      user_id: DEMO_UID, email: 'demo@arc.run',
      full_name: '강현우', organization: 'G2 러닝 소사이어티',
      birth_date: '1997-04-12', cohort: 'KWC-1',
      bio: '주말 아침을 달리는 사람. LSD 좋아합니다.',
      profile_visibility: 'members'
    };
  }

  /* ── 허브 (스키마 시드와 일치) ──────────────────────────────── */
  const HUBS = [
    { id: 'hub-seoul', name: 'Seoul Hub', city: '서울', sort_order: 1, is_active: true },
    { id: 'hub-daejeon', name: 'Daejeon Hub', city: '대전', sort_order: 2, is_active: true }
  ];

  /* ── 밋업 시드 (미래 일정) ──────────────────────────────────── */
  function seedMeetups() {
    return [
      { id: 'demo-m1', hub_id: 'hub-seoul', hub_name: 'Seoul Hub', host_name: '김서연', host_uid: 'mem-1', race_id: null,
        title: '일요일 모닝 이지런', description: '5~6km 천천히. 러닝 입문자 환영합니다. 끝나고 커피 한잔.',
        meet_at: inDays(3, 7, 0), location_text: '반포한강공원 잠수교 남단 진입로 계단 앞', capacity: 12, status: 'open',
        joined_count: 7, my_status: null, i_am_host: false },
      { id: 'demo-m2', hub_id: 'hub-seoul', hub_name: 'Seoul Hub', host_name: '강현우', host_uid: DEMO_UID, race_id: null,
        title: '수요일 인터벌 트랙', description: '400m x 8 인터벌. 페이스 그룹 나눠서 진행.',
        meet_at: inDays(5, 19, 30), location_text: '잠실종합운동장 보조경기장 트랙', capacity: 16, status: 'open',
        joined_count: 9, my_status: 'joined', i_am_host: true },
      { id: 'demo-m3', hub_id: 'hub-daejeon', hub_name: 'Daejeon Hub', host_name: '서지아', host_uid: 'mem-13', race_id: null,
        title: '갑천 새벽 LSD', description: '15km 장거리. 페이스 6:00 전후.',
        meet_at: inDays(2, 6, 0), location_text: '갑천 둔산대교 아래 자전거도로 시작점', capacity: 10, status: 'open',
        joined_count: 4, my_status: 'joined', i_am_host: false },
      { id: 'demo-m4', hub_id: 'hub-seoul', hub_name: 'Seoul Hub', host_name: '임태경', host_uid: 'mem-10', race_id: null,
        title: '남산 힐 리피트', description: '언덕 반복 훈련. 중급 이상 권장.',
        meet_at: inDays(7, 6, 30), location_text: '남산 북측순환로 입구 (한옥마을 방면)', capacity: 8, status: 'full',
        joined_count: 8, my_status: null, i_am_host: false },
      { id: 'demo-m5', hub_id: 'hub-seoul', hub_name: 'Seoul Hub', host_name: '박지훈', host_uid: 'mem-2', race_id: null,
        title: '서울마라톤 단체 출주', description: '대회 당일 같이 출발선 서요. 응원 가족도 환영.',
        meet_at: inDays(10, 8, 0), location_text: '광화문광장 동아일보사 앞', capacity: 20, status: 'open',
        joined_count: 13, my_status: null, i_am_host: false },
      { id: 'demo-m6', hub_id: 'hub-daejeon', hub_name: 'Daejeon Hub', host_name: '문해성', host_uid: 'mem-14', race_id: null,
        title: '주말 회복런', description: '가볍게 4km. 전날 장거리 뛴 분들 회복 목적.',
        meet_at: inDays(6, 8, 0), location_text: '유성온천역 5번 출구 앞', capacity: 10, status: 'open',
        joined_count: 3, my_status: null, i_am_host: false }
    ];
  }

  /* ── 알림 시드 ──────────────────────────────────────────────── */
  function seedNotifs() {
    return [
      { id: 'n1', ntype: 'meetup_rsvp', title: '새 참가 신청', body: '‘수요일 인터벌 트랙’에 노건우님이 참가 신청했습니다', created_at: agoH(2), read_at: null, link_target: '#/meetup/demo-m2' },
      { id: 'n2', ntype: 'meetup_reminder', title: '내일 밋업 알림', body: '‘갑천 새벽 LSD’가 내일 오전에 있습니다', created_at: agoH(5), read_at: null, link_target: '#/meetup/demo-m3' },
      { id: 'n3', ntype: 'race_reg', title: '접수 마감 임박', body: 'JTBC 서울마라톤 접수가 곧 마감됩니다', created_at: agoH(26), read_at: agoH(20), link_target: '#/cal' },
      { id: 'n4', ntype: 'meetup_updated', title: '밋업 정보 변경', body: '‘남산 힐 리피트’ 집결 장소가 변경되었습니다', created_at: agoH(50), read_at: agoH(48), link_target: '#/meetup/demo-m4' },
      { id: 'n5', ntype: 'system', title: 'ARC에 오신 것을 환영합니다', body: '데모 둘러보기 — 모든 화면을 자유롭게 확인하세요', created_at: agoH(72), read_at: agoH(70), link_target: null }
    ];
  }

  /* ── 상태 로드/저장 (localStorage 보존) ─────────────────────── */
  const store = {
    get profile() { return LS.g('profile', defaultProfile()); },
    set profile(v) { LS.s('profile', v); },
    get meetups() { return LS.g('meetups', seedMeetups()); },
    set meetups(v) { LS.s('meetups', v); },
    get notifs() { return LS.g('notifs', seedNotifs()); },
    set notifs(v) { LS.s('notifs', v); },
    get going() { return LS.g('going', null); },     // {raceId: bool} 오버레이
    set going(v) { LS.s('going', v); },
    get consents() { return LS.g('consents', { required_pii: true, required_activity: true, required_disclosure: true, service_notif: true, marketing_email: false }); },
    set consents(v) { LS.s('consents', v); },
    get loggedIn() { return LS.g('loggedIn', false); },
    set loggedIn(v) { LS.s('loggedIn', v); }
  };

  /* ── 대회 보드 (preview-races 재사용 → board shape) ─────────── */
  let _racesCache = null;
  function normRegStatus(s) { return ['open', 'closed', 'upcoming'].includes(s) ? s : 'unknown'; }
  async function loadRaceSource() {
    let data = null;
    try {
      const res = await fetch('./assets/preview-races.json', { cache: 'no-store' });
      if (res.ok) data = await res.json();
    } catch {}
    if (!data) {
      await new Promise(done => {
        const s = document.createElement('script');
        s.src = './assets/preview-races.js'; s.onload = done; s.onerror = done;
        document.head.appendChild(s);
      });
      data = window.PREVIEW_RACES || null;
    }
    return (data && Array.isArray(data.races)) ? data.races : [];
  }
  async function buildBoard() {
    if (_racesCache) return _racesCache;
    let src = await loadRaceSource();
    // 데모 활력: 최근 14일 이전 종료 대회는 숨김 (TBA·미래·임박 위주로 → 투자자 첫인상 + 토글 사용성)
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 14);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    src = src.filter(r => !r.date || r.date >= cutoffStr);
    const goingOverlay = store.going || {};
    const rows = src.map((r, i) => {
      const reg = r.registration || {};
      const id = 'demo-r' + String(i + 1).padStart(3, '0');
      const baseGoing = (i * 5 + 3) % 14 + 1;          // 결정적 going_count 1~14
      const seedMine = [1, 4, 8, 12, 19].includes(i);  // 5개 대회 i_am_going 시드
      const mine = id in goingOverlay ? goingOverlay[id] : seedMine;
      return {
        id, name: r.name, race_date: r.date || null, region: r.region || '',
        venue: r.venue || null, courses: r.courses || [],
        reg_start: reg.start || null, reg_end: reg.end || null,
        reg_status: normRegStatus(reg.status),
        organizer: r.organizer || null, official_url: r.official_url || null,
        confidence: r.confidence || null,
        going_count: baseGoing + (mine && !seedMine ? 1 : 0) - (!mine && seedMine ? 1 : 0),
        i_am_going: !!mine
      };
    });
    rows.sort((a, b) => (a.race_date || '9999-99-99') < (b.race_date || '9999-99-99') ? -1 : 1);
    _racesCache = rows;
    return rows;
  }

  // 공유 검증 헬퍼 (db.js와 동일 규칙)
  function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim()); }
  function normalizeCode(raw) {
    let v = String(raw || '').toUpperCase().replace(/[\s\-]/g, '');
    return v.replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');
  }
  function validCodeFormat(raw) { return /^[0-9A-HJKMNP-TV-Z]{12}$/.test(normalizeCode(raw)); }

  const OK = { error: null };

  /* ── 데모 DB (db.js 인터페이스 미러) ───────────────────────── */
  const DEMO = {
    configured: true,
    ready: () => true,
    client: () => null,
    LS,
    validEmail, normalizeCode, validCodeFormat,

    // 세션
    markLogin() { store.loggedIn = true; },
    sessionExpired() { return false; },
    enforceSessionAge() { return Promise.resolve(false); },
    async getSession() { return store.loggedIn ? { user: { id: DEMO_UID } } : null; },
    onAuth(cb) { DEMO._authCb = cb; },
    async uid() { return store.loggedIn ? DEMO_UID : null; },

    isMemberFlag() { return store.loggedIn; },
    setMemberFlag(v) { store.loggedIn = !!v; },

    // 인증 (데모: 어떤 입력도 성공)
    async signUp() { store.loggedIn = true; return { data: { session: { user: { id: DEMO_UID } }, user: { id: DEMO_UID } }, error: null }; },
    async signIn() { store.loggedIn = true; return { error: null }; },
    async signOut() { store.loggedIn = false; },
    async resetRequest() { return { error: null }; },
    async updatePassword() { return { error: null }; },

    // 초대코드 (데모: 항상 통과)
    async redeemInvite() { store.loggedIn = true; return { ok: true }; },

    // 동의
    async saveConsents(map) { store.consents = Object.assign({}, store.consents, map); return { error: null }; },
    async setConsent(type, agreed) { const c = store.consents; c[type] = !!agreed; store.consents = c; return { error: null }; },
    async myConsents() { return store.consents; },

    // 대회
    async raceBoard() { return { data: await buildBoard(), error: null }; },
    async raceAttendees(raceId, offset = 0) {
      const board = await buildBoard();
      const r = board.find(x => x.id === raceId);
      const n = r ? Math.max(0, Number(r.going_count) - (r.i_am_going ? 1 : 0)) : 0;
      const list = [];
      for (let i = 0; i < n; i++) list.push(MEMBERS[(i + (raceId.charCodeAt(raceId.length - 1) || 0)) % MEMBERS.length]);
      return { data: pageOf(list, offset), error: null };
    },
    async setGoing(raceId, on) {
      const board = await buildBoard();
      const r = board.find(x => x.id === raceId);
      if (r) { r.i_am_going = on; r.going_count = Math.max(0, Number(r.going_count || 0) + (on ? 1 : -1)); }
      const g = store.going || {}; g[raceId] = on; store.going = g;
      return { error: null };
    },

    // 허브 / 밋업
    async hubs() { return { data: HUBS, error: null }; },
    async meetupBoard(hubId = null) {
      let list = store.meetups.filter(m => m.status !== 'canceled');
      if (hubId) list = list.filter(m => m.hub_id === hubId);
      list.sort((a, b) => a.meet_at < b.meet_at ? -1 : 1);
      return { data: list, error: null };
    },
    async meetupAttendees(meetupId, offset = 0) {
      const m = store.meetups.find(x => x.id === meetupId);
      const n = m ? Number(m.joined_count) : 0;
      const list = [];
      for (let i = 0; i < n; i++) list.push(MEMBERS[(i + meetupId.length) % MEMBERS.length]);
      return { data: pageOf(list, offset), error: null };
    },
    async createMeetup({ hub_id, race_id, title, description, meet_at, location_text, capacity }) {
      const hub = HUBS.find(h => h.id === hub_id) || HUBS[0];
      const id = 'demo-m' + Date.now();
      const m = {
        id, hub_id: hub.id, hub_name: hub.name, host_name: store.profile.full_name, host_uid: DEMO_UID,
        race_id: race_id || null, title, description: description || null, meet_at,
        location_text, capacity: Number(capacity) || 10, status: 'open',
        joined_count: 1, my_status: 'joined', i_am_host: true
      };
      const arr = store.meetups; arr.unshift(m); store.meetups = arr;
      return { data: { id }, error: null };
    },
    async rsvpMeetup(meetupId, join) {
      const arr = store.meetups; const m = arr.find(x => x.id === meetupId);
      if (!m) return { ok: false, error: 'NOT_FOUND' };
      if (join) {
        if (Number(m.joined_count) >= Number(m.capacity)) return { ok: false, error: 'FULL' };
        m.my_status = 'joined'; m.joined_count = Number(m.joined_count) + 1;
        if (m.joined_count >= m.capacity) m.status = 'full';
      } else {
        m.my_status = null; m.joined_count = Math.max(0, Number(m.joined_count) - 1); m.status = 'open';
      }
      store.meetups = arr;
      return { ok: true };
    },
    async cancelMeetup(meetupId) {
      const arr = store.meetups; const m = arr.find(x => x.id === meetupId);
      if (m) { m.status = 'canceled'; store.meetups = arr; }
      return { ok: true };
    },

    // 프로필
    async myProfile() { return { data: store.profile }; },
    async updateProfile(patch) {
      const p = store.profile;
      ['full_name', 'organization', 'bio', 'profile_visibility'].forEach(k => { if (k in patch) p[k] = patch[k]; });
      store.profile = p;
      return { error: null };
    },
    async deleteAccount() {
      ['profile', 'meetups', 'notifs', 'going', 'consents', 'loggedIn'].forEach(k => LS.rm(k));
      _racesCache = null;
      return { ok: true };
    },

    // 알림
    async notifications() { const n = store.notifs.slice().sort((a, b) => a.created_at < b.created_at ? 1 : -1); return { data: n, error: null }; },
    async markRead(id) { const n = store.notifs; const x = n.find(r => r.id === id); if (x) { x.read_at = nowISO(); store.notifs = n; } return { error: null }; },
    async removeNotification(id) { store.notifs = store.notifs.filter(r => r.id !== id); return { error: null }; },
    async unreadCount() { return store.notifs.filter(r => !r.read_at).length; }
  };

  window.DB = DEMO;

  /* ── 게이트에 "데모 둘러보기" 원탭 진입 버튼 주입 (투자자/리뷰어용) ── */
  function wireDemoEntry() {
    const host = document.getElementById('ob-j1');
    if (!host || document.getElementById('demo-enter')) return;
    const btn = document.createElement('button');
    btn.id = 'demo-enter'; btn.type = 'button'; btn.className = 'ob-link';
    btn.style.cssText = 'color:var(--gold);border:1px solid rgba(201,168,76,.4);padding:11px 0;margin-top:8px;text-decoration:none;letter-spacing:.12em;text-transform:uppercase';
    btn.textContent = '데모 둘러보기 (전체 기능)';
    btn.onclick = () => {
      store.loggedIn = true;
      location.hash = '#/cal';
      location.reload();
    };
    host.appendChild(btn);
    // 데모 배너(리뷰어/투자자에게 데모임을 명시 — 메타데이터 정직성)
    const note = document.getElementById('setup-note');
    if (note) {
      note.hidden = false;
      note.innerHTML = '<b>DEMO MODE</b><br>실제 데이터가 아닌 시연용 데이터입니다. 모든 화면·기능을 자유롭게 확인하세요.';
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireDemoEntry);
  else wireDemoEntry();

  console.info('[ARC] DEMO MODE active — Supabase 미사용, 시연용 데이터');
})();
