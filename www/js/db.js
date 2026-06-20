/* ============================================================
 * ARC V3 — 데이터 계층 (TECH_SPEC §3·§4 데이터 명세)
 * Supabase 클라이언트 · 인증 · RPC 래퍼 전부. UI 로직 없음.
 * 의존: js/config.js (SUPABASE_URL / SUPABASE_ANON_KEY), Supabase JS SDK v2 (CDN)
 * ==========================================================*/
'use strict';

window.DB = (() => {
  // ── 로컬 스토리지 헬퍼 (V2 LS 이식) ───────────────────────
  const LS = {
    g: (k, d) => { try { const v = localStorage.getItem(k); return v != null ? JSON.parse(v) : d; } catch { return d; } },
    s: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    rm: (k) => { try { localStorage.removeItem(k); } catch {} }
  };

  const K_LOGIN_AT = 'arc3.login_at';   // SEC-07: 7일 세션 클라이언트 폴백
  const K_MEMBER = 'arc3.member';
  const SESSION_MAX_MS = 7 * 24 * 60 * 60 * 1000;

  const configured =
    typeof SUPABASE_URL === 'string' && typeof SUPABASE_ANON_KEY === 'string' &&
    !SUPABASE_URL.startsWith('YOUR_') && !SUPABASE_ANON_KEY.startsWith('YOUR_');

  let client = null;
  if (configured && typeof supabase !== 'undefined') {
    try {
      client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    } catch (e) { console.warn('Supabase init failed:', e); }
  }

  const ready = () => configured && !!client;

  // V2 validEmail 이식
  function validEmail(e) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim());
  }

  // 초대코드 정규화 (서버 redeem RPC와 동일 규칙 — 클라이언트 선검증용)
  function normalizeCode(raw) {
    let v = String(raw || '').toUpperCase().replace(/[\s\-]/g, '');
    v = v.replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');
    return v;
  }
  function validCodeFormat(raw) {
    return /^[0-9A-HJKMNP-TV-Z]{12}$/.test(normalizeCode(raw));
  }

  // ── 세션 (SEC-07 7일 클라이언트 폴백) ─────────────────────
  function markLogin() { LS.s(K_LOGIN_AT, Date.now()); }
  function sessionExpired() {
    const t = LS.g(K_LOGIN_AT, null);
    return t != null && (Date.now() - t) > SESSION_MAX_MS;
  }
  async function getSession() {
    if (!ready()) return null;
    const { data } = await client.auth.getSession();
    return data ? data.session : null;
  }
  async function enforceSessionAge() {
    if (!ready()) return false;
    if (sessionExpired()) {
      await signOut();
      return true;  // 만료 처리됨
    }
    return false;
  }
  function onAuth(cb) { if (ready()) client.auth.onAuthStateChange(cb); }

  // ── 멤버 플래그 (스펙 §4.1 비멤버 감지 보조) ──────────────
  function isMemberFlag() { return LS.g(K_MEMBER, false) === true; }
  function setMemberFlag(v) { v ? LS.s(K_MEMBER, true) : LS.rm(K_MEMBER); }

  // ── 인증 (§3.3 — 가입 0통: signUp 확인메일 OFF + redeem 이중검증) ──
  async function signUp({ email, password, full_name, organization, birth_date, cohort }) {
    return client.auth.signUp({
      email, password,
      options: { data: { full_name, organization, birth_date, cohort: cohort || 'KWC-1' } }
    });
  }
  async function signIn(email, password) {
    const r = await client.auth.signInWithPassword({ email, password });
    if (!r.error) markLogin();
    return r;
  }
  async function signOut() {
    LS.rm(K_LOGIN_AT); setMemberFlag(false);
    if (ready()) { try { await client.auth.signOut(); } catch {} }
  }
  async function resetRequest(email) {
    // 복구 전용 — Supabase 내장 메일러 (CFO 예외 확인 대기, TECH_SPEC 부록②)
    const redirectTo = location.origin + location.pathname;
    return client.auth.resetPasswordForEmail(email, { redirectTo });
  }
  async function updatePassword(password) {
    return client.auth.updateUser({ password });
  }
  async function uid() {
    const s = await getSession();
    return s && s.user ? s.user.id : null;
  }

  const NOT_READY_LIST = { data: [], error: null };   // 미설정 시 안전 반환
  const NOT_READY_ACT = { ok: false, error: 'NOT_CONFIGURED' };

  // ── 초대코드 (SEC-02·03·08 — 서버 단일 검증점) ────────────
  async function redeemInvite(code) {
    if (!ready()) return NOT_READY_ACT;
    const { data, error } = await client.rpc('redeem_invite_code', { p_code: code });
    if (error) return { ok: false, error: 'RPC_ERROR', detail: error.message };
    if (data && data.ok) setMemberFlag(true);
    return data || { ok: false, error: 'UNKNOWN' };
  }

  // ── 동의 (CLO 5항목 — agreed_at/revoked_at 서버 기록) ─────
  async function saveConsents(map) {
    // map: { required_pii:true, ..., marketing_email:false }
    const u = await uid();
    if (!u) return { error: { message: 'AUTH_REQUIRED' } };
    const rows = Object.entries(map).map(([consent_type, agreed]) => ({
      user_id: u, consent_type, agreed: !!agreed,
      agreed_at: new Date().toISOString(),
      revoked_at: null   // 온보딩 일괄 기록 = 최초 결정 시점, 철회 없음 (라이브 철회는 setConsent)
    }));
    return client.from('consents').upsert(rows, { onConflict: 'user_id,consent_type' });
  }
  async function setConsent(consent_type, agreed) {
    const u = await uid();
    if (!u) return { error: { message: 'AUTH_REQUIRED' } };
    const patch = agreed
      ? { user_id: u, consent_type, agreed: true, agreed_at: new Date().toISOString(), revoked_at: null }
      : { user_id: u, consent_type, agreed: false, revoked_at: new Date().toISOString() };  // 즉시 반영 (CLO)
    return client.from('consents').upsert(patch, { onConflict: 'user_id,consent_type' });
  }
  async function myConsents() {
    if (!ready()) return {};
    const { data } = await client.from('consents').select('consent_type, agreed, agreed_at, revoked_at');
    const out = {};
    (data || []).forEach(r => { out[r.consent_type] = r.agreed; });
    return out;
  }

  // ── 대회 (§4.2·4.3) ──────────────────────────────────────
  async function raceBoard() {
    if (!ready()) return NOT_READY_LIST;
    const { data, error } = await client.rpc('get_race_board');
    return { data: data || [], error };
  }
  async function raceAttendees(raceId, offset = 0) {
    if (!ready()) return NOT_READY_LIST;
    const { data, error } = await client.rpc('get_race_attendees', { p_race_id: raceId, p_offset: offset });
    return { data: data || [], error };
  }
  async function setGoing(raceId, on) {
    const u = await uid();
    if (!u) return { error: { message: 'AUTH_REQUIRED' } };
    if (on) {
      return client.from('race_attendance').insert({ race_id: raceId, user_id: u });
    }
    return client.from('race_attendance').delete().eq('race_id', raceId).eq('user_id', u);
  }

  // ── 밋업 (§4.4) ──────────────────────────────────────────
  async function hubs() {
    const { data, error } = await client.from('hubs').select('*').eq('is_active', true).order('sort_order');
    return { data: data || [], error };
  }
  async function meetupBoard(hubId = null) {
    if (!ready()) return NOT_READY_LIST;
    const { data, error } = await client.rpc('get_meetup_board', { p_hub_id: hubId });
    return { data: data || [], error };
  }
  async function meetupAttendees(meetupId, offset = 0) {
    if (!ready()) return NOT_READY_LIST;
    const { data, error } = await client.rpc('get_meetup_attendees', { p_meetup_id: meetupId, p_offset: offset });
    return { data: data || [], error };
  }
  async function createMeetup({ hub_id, race_id, title, description, meet_at, location_text, capacity }) {
    const u = await uid();
    if (!u) return { error: { message: 'AUTH_REQUIRED' } };
    return client.from('meetups').insert({
      hub_id, host_id: u, race_id: race_id || null,
      title, description: description || null,
      meet_at, location_text, capacity
    }).select().single();
  }
  async function rsvpMeetup(meetupId, join) {
    if (!ready()) return NOT_READY_ACT;
    const { data, error } = await client.rpc('rsvp_meetup', { p_meetup_id: meetupId, p_join: join });
    if (error) return { ok: false, error: 'RPC_ERROR', detail: error.message };
    return data || { ok: false, error: 'UNKNOWN' };
  }
  async function cancelMeetup(meetupId) {
    if (!ready()) return NOT_READY_ACT;
    const { data, error } = await client.rpc('cancel_meetup', { p_meetup_id: meetupId });
    if (error) return { ok: false, error: 'RPC_ERROR', detail: error.message };
    return data || { ok: false, error: 'UNKNOWN' };
  }

  // ── 프로필 (§4.5) ────────────────────────────────────────
  async function myProfile() {
    const u = await uid();
    if (!u) return { data: null };
    return client.from('users_profile').select('*').eq('user_id', u).single();
  }
  async function updateProfile(patch) {
    const u = await uid();
    if (!u) return { error: { message: 'AUTH_REQUIRED' } };
    const allowed = {};
    ['full_name', 'organization', 'bio', 'profile_visibility'].forEach(k => {
      if (k in patch) allowed[k] = patch[k];
    });
    return client.from('users_profile').update(allowed).eq('user_id', u);
  }
  async function deleteAccount() {
    const { data, error } = await client.rpc('delete_my_account');
    if (error) return { ok: false, detail: error.message };
    await signOut();
    return data || { ok: true };
  }

  // ── UGC 모더레이션 (Apple 1.2 — 신고·차단) ────────────────
  async function reportContent(targetType, targetId, reason) {
    if (!ready()) return NOT_READY_ACT;
    const { data, error } = await client.rpc('file_report', { p_target_type: targetType, p_target_id: String(targetId), p_reason: reason || '' });
    if (error) return { ok: false, error: 'RPC_ERROR', detail: error.message };
    return data || { ok: false, error: 'UNKNOWN' };
  }
  async function blockMember(blockedUid) {
    if (!ready()) return NOT_READY_ACT;
    const { data, error } = await client.rpc('block_member', { p_blocked: blockedUid });
    if (error) return { ok: false, error: 'RPC_ERROR', detail: error.message };
    return data || { ok: false, error: 'UNKNOWN' };
  }
  async function unblockMember(blockedUid) {
    if (!ready()) return NOT_READY_ACT;
    const { data, error } = await client.rpc('unblock_member', { p_blocked: blockedUid });
    if (error) return { ok: false, error: 'RPC_ERROR', detail: error.message };
    return data || { ok: false, error: 'UNKNOWN' };
  }
  async function myBlocks() {
    if (!ready()) return [];
    const { data } = await client.from('blocks').select('blocked_id, created_at');
    return data || [];
  }

  // ── 알림함 (§4.6) ────────────────────────────────────────
  async function notifications(limit = 50) {
    const { data, error } = await client.from('notifications')
      .select('*').order('created_at', { ascending: false }).limit(limit);
    return { data: data || [], error };
  }
  async function markRead(id) {
    return client.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
  }
  async function removeNotification(id) {
    return client.from('notifications').delete().eq('id', id);
  }
  async function unreadCount() {
    const { count } = await client.from('notifications')
      .select('id', { count: 'exact', head: true }).is('read_at', null);
    return count || 0;
  }

  return {
    configured, ready, client: () => client, LS,
    validEmail, normalizeCode, validCodeFormat,
    markLogin, sessionExpired, enforceSessionAge, getSession, onAuth, uid,
    isMemberFlag, setMemberFlag,
    signUp, signIn, signOut, resetRequest, updatePassword,
    redeemInvite, saveConsents, setConsent, myConsents,
    raceBoard, raceAttendees, setGoing,
    hubs, meetupBoard, meetupAttendees, createMeetup, rsvpMeetup, cancelMeetup,
    myProfile, updateProfile, deleteAccount,
    reportContent, blockMember, unblockMember, myBlocks,
    notifications, markRead, removeNotification, unreadCount
  };
})();
