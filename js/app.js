/* ============================================================
 * ARC V3 — UI 로직 (해시 라우팅 · 렌더링 · 이벤트)
 * TECH_SPEC §4 화면 6개 + DELTA 컴포넌트. innerHTML 미사용(DOM API + textContent).
 * 라우트: #/join #/cal #/race/{id} #/meetups #/meetup-new #/meetup/{id} #/profile #/alerts #/reset
 * ==========================================================*/
'use strict';

/* ── 기본 헬퍼 ─────────────────────────────────────────── */
const $ = (s, p) => (p || document).querySelector(s);
const $$ = (s, p) => Array.from((p || document).querySelectorAll(s));

function esc(s) {  // V2 이식 — 템플릿 문자열 삽입 시 필수 경유
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function svgUse(id, size) {
  const NS = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('class', 'icon');
  s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('aria-hidden', 'true');
  const u = document.createElementNS(NS, 'use');
  u.setAttribute('href', '#' + id);
  s.appendChild(u);
  return s;
}
function toast(msg, dur = 2800) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._tm);
  toast._tm = setTimeout(() => t.classList.remove('show'), dur);
}

/* ── 날짜 헬퍼 (race_date는 'YYYY-MM-DD' 로컬 자정 기준) ── */
const DAY = 864e5;
const MONTH_EN = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
const WD_KO = ['일','월','화','수','목','금','토'];
function todayMid() { const d = new Date(); d.setHours(0,0,0,0); return d; }
function parseD(s) { const [y,m,dd] = s.split('-').map(Number); return new Date(y, m-1, dd); }
function fmtDateK(s) {
  if (!s) return '일정 미정';
  const d = parseD(s);
  return `${d.getMonth()+1}월 ${d.getDate()}일 (${WD_KO[d.getDay()]})`;
}
function fmtMeet(iso) {
  const d = new Date(iso);
  const h = d.getHours(), ap = h < 12 ? '오전' : '오후', h12 = h % 12 === 0 ? 12 : h % 12;
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth()+1}월 ${d.getDate()}일 (${WD_KO[d.getDay()]}) · ${ap} ${h12}:${mm}`;
}
function ago(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60e3) return '방금 전';
  if (ms < 3600e3) return Math.floor(ms / 60e3) + '분 전';
  if (ms < DAY) return Math.floor(ms / 3600e3) + '시간 전';
  return Math.floor(ms / DAY) + '일 전';
}

/* ── 이니셜 아바타 (DELTA §3 — 결정적 해시, 사진 전면 대체) ── */
const AVATAR_PALETTE = ['#6B2D3E','#A8892F','#5E7A52','#4A4E6E','#7A5A44','#5E6672'];
function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) { h = (h * 31 + name.charCodeAt(i)) >>> 0; }
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}
function initials(name) {
  const t = String(name || '?').trim();
  if (/[가-힣]/.test(t)) return t.slice(0, 2);
  return t.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
}
function makeAvatar(name, size = 32) {
  const a = el('span', 'avatar');
  a.style.cssText = `width:${size}px;height:${size}px;background:${avatarColor(name || '?')};font-size:${Math.round(size * 0.4)}px`;
  a.textContent = initials(name);
  a.setAttribute('aria-label', name || '');
  return a;
}

/* ── 대회 상태 계산 (DELTA §2.4) ─────────────────────────── */
function raceDerived(r) {
  const t0 = todayMid();
  const rd = r.race_date ? parseD(r.race_date) : null;
  const dday = rd ? Math.round((rd - t0) / DAY) : null;
  const done = rd != null && dday < 0;
  let st = 'tba', stTxt = '일정 미발표';
  if (done) { st = 'done'; stTxt = '종료'; }
  else if (r.reg_status === 'open') {
    const re = r.reg_end ? parseD(r.reg_end) : null;
    const left = re ? Math.round((re - t0) / DAY) : null;
    if (re && left < 0) { st = 'closed'; stTxt = '접수마감'; }
    else if (re && left <= 7) { st = 'soon'; stTxt = `D-${left} 마감`; }
    else { st = 'open'; stTxt = '접수중'; }
  }
  else if (r.reg_status === 'closed') { st = 'closed'; stTxt = '접수마감'; }
  else if (r.reg_status === 'upcoming') { st = 'upcoming'; stTxt = '접수예정'; }
  const ddayTxt = done ? '종료' : (rd ? (dday === 0 ? 'D-DAY' : `D-${dday}`) : '미정');
  return { st, stTxt, dday, ddayTxt, done };
}

/* ── 상태 ────────────────────────────────────────────────── */
const state = {
  authed: false, member: false,
  races: [], hubs: [], meetups: [],
  consents: {}, profile: null,
  calQ: '', calRegion: '전체', hubFilter: null,
  obCode: '', obConsents: null, obProfile: null,
  pendingRaceLink: null, pendingGoing: null,
  attOffset: 0
};

/* ── 화면 전환 (V2 show() 이식 — 해시 라우터 래핑) ───────── */
const TAB_ROUTES = ['#/cal', '#/meetups', '#/alerts', '#/profile'];
function show(id) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  const sc = $('#' + id);
  if (sc) { sc.classList.add('active'); sc.scrollTop = 0; }
  const tabRoute = location.hash.split('/').slice(0, 2).join('/');
  const isTab = TAB_ROUTES.includes(tabRoute) || ['#/race', '#/meetup', '#/meetup-new'].includes(tabRoute);
  $('#bnav').classList.toggle('on', isTab);
  $$('.bnav-btn').forEach(b => b.classList.toggle('active',
    b.dataset.tab === tabRoute ||
    (b.dataset.tab === '#/cal' && tabRoute === '#/race') ||
    (b.dataset.tab === '#/meetups' && (tabRoute === '#/meetup' || tabRoute === '#/meetup-new'))));
  $('#fab-new-meetup').classList.toggle('on', tabRoute === '#/meetups');
}
function nav(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

/* ── 모달 ────────────────────────────────────────────────── */
function confirmModal(title, body) {
  return new Promise(resolve => {
    $('#modal-title').textContent = title;
    $('#modal-body').textContent = body;
    const ovl = $('#modal-ovl');
    ovl.classList.add('on');
    const done = v => { ovl.classList.remove('on'); $('#modal-ok').onclick = $('#modal-cancel').onclick = null; resolve(v); };
    $('#modal-ok').onclick = () => done(true);
    $('#modal-cancel').onclick = () => done(false);
  });
}
function consentModal() {
  return new Promise(resolve => {
    const ovl = $('#consent-ovl'), chk = $('#consent-m-chk'), ok = $('#consent-m-ok');
    chk.checked = false; ok.disabled = true;
    ovl.classList.add('on');
    chk.onchange = () => { ok.disabled = !chk.checked; };
    const done = v => { ovl.classList.remove('on'); ok.onclick = $('#consent-m-cancel').onclick = chk.onchange = null; resolve(v); };
    ok.onclick = () => done(true);
    $('#consent-m-cancel').onclick = () => done(false);
  });
}

/* ── 빈 상태 (DELTA §7.2) ───────────────────────────────── */
function emptyState(copy) {
  const w = el('div', 'empty');
  w.appendChild(el('span', 'empty-orn'));
  w.appendChild(el('p', 'empty-copy', copy));
  return w;
}

/* ════════════════════════════════════════════════════════
 * 캘린더 홈 (SPEC §4.2 / DELTA §2)
 * ══════════════════════════════════════════════════════ */
async function loadRaces(force) {
  if (!force && state.races.length) return state.races;
  if (!DB.ready()) return [];
  const { data, error } = await DB.raceBoard();
  if (error) { toast('대회 정보를 불러오지 못했습니다'); return state.races; }
  state.races = data;
  return data;
}
function buildRegionChips() {
  const wrap = $('#cal-chips');
  wrap.textContent = '';
  const regions = ['전체', ...new Set(state.races.map(r => r.region).filter(Boolean))];
  regions.forEach(rg => {
    const c = el('button', 'chip' + (state.calRegion === rg ? ' on' : ''), rg);
    c.type = 'button';
    c.onclick = () => { state.calRegion = rg; renderCalendar(); };
    wrap.appendChild(c);
  });
}
function raceCard(r) {
  const d = raceDerived(r);
  const card = el('article', 'race-card');
  card.dataset.status = d.st;
  if (r.confidence === 'low') card.dataset.confidence = 'low';

  const top = el('div', 'race-card-top');
  top.appendChild(el('span', 'race-dday', d.ddayTxt));
  top.appendChild(el('span', `race-status race-status--${d.st === 'done' ? 'closed' : d.st}`, d.stTxt));
  card.appendChild(top);

  card.appendChild(el('h3', 'race-name', r.name));
  const meta = el('div', 'race-meta');
  meta.appendChild(el('span', 'race-date', fmtDateK(r.race_date)));
  meta.appendChild(el('span', 'race-sep', '·'));
  meta.appendChild(el('span', 'race-region', r.region || ''));
  card.appendChild(meta);
  if (r.venue) card.appendChild(el('div', 'race-venue', r.venue));

  const cs = el('div', 'race-courses');
  (r.courses || []).forEach(c => {
    const chip = el('span', 'course-chip', c.toUpperCase());
    chip.dataset.c = c;
    cs.appendChild(chip);
  });
  card.appendChild(cs);

  const foot = el('div', 'race-card-foot');
  const wg = el('div', 'whosgoing');
  const cnt = Number(r.going_count || 0);
  if (r.i_am_going) {
    const f = el('span', 'race-flag');
    f.appendChild(svgUse('i-flag', 13));
    f.appendChild(el('span', null, '참가 예정'));
    wg.appendChild(f);
    wg.appendChild(el('span', 'whosgoing-count', `· 멤버 ${cnt}명`));
  } else {
    wg.appendChild(el('span', 'whosgoing-count',
      cnt > 0 ? `멤버 ${cnt}명 참가 예정` : '첫 참가자가 되어보세요'));
  }
  foot.appendChild(wg);
  const chev = svgUse('i-chevron', 16); chev.classList.add('race-chev');
  foot.appendChild(chev);
  card.appendChild(foot);

  card.onclick = () => nav('#/race/' + r.id);
  return card;
}
function renderCalendar(list) {
  const races = list || state.races;
  buildRegionChips();
  const box = $('#cal-list');
  box.textContent = '';
  const q = state.calQ.trim().toLowerCase();
  const filtered = races.filter(r =>
    (state.calRegion === '전체' || r.region === state.calRegion) &&
    (!q || (r.name + ' ' + (r.region || '')).toLowerCase().includes(q)));
  if (!races.length) { box.appendChild(emptyState('아직 등록된 대회가 없습니다. 곧 큐레이션됩니다.')); return; }
  if (!filtered.length) { box.appendChild(emptyState(`'${state.calQ.trim() || state.calRegion}'와 일치하는 대회가 없습니다.`)); return; }
  const groups = new Map();
  filtered.forEach(r => {
    const k = r.race_date ? r.race_date.slice(0, 7) : 'tba';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  });
  groups.forEach((rs, k) => {
    const h = el('div', 'race-month');
    if (k === 'tba') {
      h.appendChild(el('span', 'race-month-en', 'TBA'));
      h.appendChild(el('span', 'race-month-ko', '일정 미정'));
    } else {
      const [y, m] = k.split('-').map(Number);
      h.appendChild(el('span', 'race-month-en', MONTH_EN[m - 1]));
      h.appendChild(el('span', 'race-month-ko', `${y}년 ${m}월`));
    }
    h.appendChild(el('span', 'race-month-rule'));
    box.appendChild(h);
    rs.forEach(r => box.appendChild(raceCard(r)));
  });
}

/* ════════════════════════════════════════════════════════
 * 대회 상세 + Who's Going (SPEC §4.3 / DELTA §4)
 * ══════════════════════════════════════════════════════ */
async function renderRaceDetail(id) {
  await loadRaces();
  const r = state.races.find(x => x.id === id);
  if (!r) { toast('대회를 찾을 수 없습니다'); nav('#/cal'); return; }
  const d = raceDerived(r);
  $('#race-title').textContent = r.name;
  $('#race-dday').textContent = d.ddayTxt + ' · ' + fmtDateK(r.race_date);
  const body = $('#race-body');
  body.textContent = '';

  const info = el('div', 'dt-body');
  const rows = [
    ['날짜', fmtDateK(r.race_date)],
    ['지역', r.region || '—'],
    ['장소', r.venue || '미확인'],
    ['코스', (r.courses || []).join(' · ') || '—'],
    ['접수기간', (r.reg_start || r.reg_end) ? `${r.reg_start || '?'} ~ ${r.reg_end || '?'}` : '접수 일정 미발표'],
    ['접수상태', d.stTxt],
    ['주최', r.organizer || '—']
  ];
  rows.forEach(([k, v]) => {
    const row = el('div', 'dt-row');
    row.appendChild(el('span', 'dt-row-k', k));
    row.appendChild(el('span', 'dt-row-v', v));
    info.appendChild(row);
  });
  body.appendChild(info);

  const acts = el('div', 'dt-actions');
  if (r.official_url) {
    const a = el('a', 'dt-btn', '공식 사이트');
    a.href = r.official_url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    acts.appendChild(a);
  }
  const shareBtn = el('button', 'dt-btn');
  shareBtn.type = 'button';
  shareBtn.appendChild(svgUse('i-share', 15));
  shareBtn.appendChild(el('span', null, '공유'));
  shareBtn.onclick = () => shareText(`[ARC] ${r.name} ${fmtDateK(r.race_date)} — 같이 뛰실 분?`);
  acts.appendChild(shareBtn);
  const mkMeet = el('button', 'dt-btn', '연계 밋업 개설');
  mkMeet.type = 'button';
  mkMeet.onclick = () => { state.pendingRaceLink = { id: r.id, name: r.name }; nav('#/meetup-new'); };
  acts.appendChild(mkMeet);
  body.appendChild(acts);

  // Who's Going
  const head = el('div', 'wg-head');
  head.appendChild(el('span', 'wg-title', '참가 예정 멤버'));
  head.appendChild(el('span', 'wg-count', String(r.going_count || 0)));
  body.appendChild(head);

  const tg = el('button', 'wg-toggle');
  tg.type = 'button';
  const ico = el('span', 'wg-toggle-ico');
  ico.appendChild(svgUse('i-plus', 18));
  const txt = el('span', 'wg-toggle-txt');
  tg.appendChild(ico); tg.appendChild(txt);
  const applyTgState = () => {
    let s;
    if (d.done) { s = 'closed'; txt.textContent = '참가 표시 기간이 종료되었습니다'; }
    else if (r.i_am_going) { s = 'going'; txt.textContent = '참가 예정 · 표시 취소'; }
    else if (!state.consents.required_disclosure) { s = 'needs-consent'; txt.textContent = '참가 표시하려면 멤버 간 정보공개 동의가 필요합니다'; }
    else { s = 'idle'; txt.textContent = '이 대회 참가 예정으로 표시'; }
    tg.dataset.state = s;
  };
  applyTgState();
  tg.onclick = async () => {
    const s = tg.dataset.state;
    if (s === 'closed') return;
    if (s === 'needs-consent') {
      const ok = await consentModal();
      if (!ok) return;
      const res = await DB.setConsent('required_disclosure', true);
      if (res.error) { toast('동의 저장에 실패했습니다'); return; }
      state.consents.required_disclosure = true;
    }
    const on = !r.i_am_going;
    const res = await DB.setGoing(r.id, on);
    if (res.error) { toast('처리하지 못했습니다. 다시 시도해 주세요.'); return; }
    r.i_am_going = on;
    r.going_count = Number(r.going_count || 0) + (on ? 1 : -1);
    if (r.going_count < 0) r.going_count = 0;
    applyTgState();
    head.querySelector('.wg-count').textContent = String(r.going_count);
    toast(on ? '참가 예정으로 표시했습니다' : '표시를 취소했습니다');
    loadAttendees(true);
  };
  body.appendChild(tg);

  const list = el('ul', 'wg-list');
  body.appendChild(list);
  state.attOffset = 0;
  const moreBtn = el('button', 'wg-more-btn', '더 보기');
  moreBtn.type = 'button';
  moreBtn.hidden = true;
  moreBtn.onclick = () => loadAttendees(false);
  body.appendChild(moreBtn);

  async function loadAttendees(reset) {
    if (reset) { list.textContent = ''; state.attOffset = 0; }
    const { data } = await DB.raceAttendees(r.id, state.attOffset);
    if (state.attOffset === 0 && !data.length) {
      const li = el('li');
      li.appendChild(emptyState('아직 참가 표시한 멤버가 없습니다. 첫 번째가 되어보세요.'));
      list.appendChild(li);
      moreBtn.hidden = true;
      return;
    }
    data.forEach(a => {
      const li = el('li', 'wg-row');
      li.appendChild(makeAvatar(a.full_name, 36));
      const main = el('span', 'wg-row-main');
      main.appendChild(el('span', 'wg-row-name', a.full_name));
      main.appendChild(el('span', 'wg-row-org', a.organization || ''));
      li.appendChild(main);
      list.appendChild(li);
    });
    state.attOffset += data.length;
    moreBtn.hidden = data.length < 20;   // SEC-09: 20건/페이지
  }
  loadAttendees(true);
}

/* ── 공유 (SEC-11: 멤버 정보 절대 미포함) ─────────────────── */
function appUrl() { return location.origin + location.pathname; }
async function shareText(text) {
  const full = `${text} ${appUrl()}`;
  if (navigator.share) {
    try { await navigator.share({ text: full }); } catch {}
  } else if (navigator.clipboard) {
    try { await navigator.clipboard.writeText(full); toast('링크를 복사했습니다'); }
    catch { toast('복사하지 못했습니다'); }
  } else toast('공유를 지원하지 않는 브라우저입니다');
}

/* ════════════════════════════════════════════════════════
 * 밋업 (SPEC §4.4 / DELTA §5)
 * ══════════════════════════════════════════════════════ */
async function loadHubs() {
  if (state.hubs.length) return state.hubs;
  if (!DB.ready()) return [];
  const { data } = await DB.hubs();
  state.hubs = data;
  return data;
}
async function renderMeetups() {
  await loadHubs();
  const chips = $('#hub-chips');
  chips.textContent = '';
  const all = el('button', 'chip' + (state.hubFilter === null ? ' on' : ''), '전체');
  all.type = 'button';
  all.onclick = () => { state.hubFilter = null; renderMeetups(); };
  chips.appendChild(all);
  state.hubs.forEach(h => {
    const c = el('button', 'chip' + (state.hubFilter === h.id ? ' on' : ''), h.name);
    c.type = 'button';
    c.onclick = () => { state.hubFilter = h.id; renderMeetups(); };
    chips.appendChild(c);
  });

  const box = $('#meetup-list');
  box.textContent = '';
  if (!DB.ready()) { box.appendChild(emptyState('서버 연결 대기 중입니다.')); return; }
  const { data, error } = await DB.meetupBoard(state.hubFilter);
  if (error) { toast('밋업을 불러오지 못했습니다'); return; }
  state.meetups = data;
  if (!data.length) { box.appendChild(emptyState('열린 밋업이 없습니다. 첫 밋업을 개설해보세요.')); return; }
  data.forEach(m => box.appendChild(meetCard(m)));
}
function meetCard(m) {
  const card = el('article', 'meet-card');
  const top = el('div', 'meet-card-top');
  top.appendChild(el('span', 'meet-hub', m.hub_name || ''));
  const full = Number(m.joined_count) >= Number(m.capacity) || m.status === 'full';
  top.appendChild(el('span', `meet-state meet-state--${full ? 'full' : 'open'}`, full ? '정원 마감' : '모집중'));
  card.appendChild(top);
  card.appendChild(el('h3', 'meet-title', m.title));
  card.appendChild(el('div', 'meet-when', fmtMeet(m.meet_at)));
  card.appendChild(el('div', 'meet-loc', m.location_text || ''));
  const host = el('div', 'meet-host');
  host.appendChild(makeAvatar(m.host_name || '?', 28));
  host.appendChild(el('span', 'meet-host-name', (m.host_name || '멤버') + ' 호스트'));
  card.appendChild(host);
  const cap = el('div', 'meet-cap');
  cap.dataset.full = String(full);
  const bar = el('div', 'meet-cap-bar');
  const fill = el('span', 'meet-cap-fill');
  fill.style.width = Math.min(100, Math.round(Number(m.joined_count) / Number(m.capacity) * 100)) + '%';
  bar.appendChild(fill);
  cap.appendChild(bar);
  cap.appendChild(el('span', 'meet-cap-num', `${m.joined_count} / ${m.capacity}`));
  card.appendChild(cap);
  card.onclick = () => nav('#/meetup/' + m.id);
  return card;
}

/* ── 밋업 개설 ───────────────────────────────────────────── */
async function renderMeetupNew() {
  await loadHubs();
  const sel = $('#mn-hub');
  sel.textContent = '';
  state.hubs.forEach(h => {
    const o = el('option', null, h.name);
    o.value = h.id;
    sel.appendChild(o);
  });
  const now = new Date(Date.now() + 3600e3);
  now.setMinutes(0, 0, 0);
  const pad = n => String(n).padStart(2, '0');
  const minLocal = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const dt = $('#mn-date');
  dt.min = minLocal;
  if (!dt.value) dt.value = minLocal;
  const wrap = $('#mn-race-wrap'), nameEl = $('#mn-race-name');
  if (state.pendingRaceLink) { wrap.hidden = false; nameEl.textContent = state.pendingRaceLink.name; }
  else { wrap.hidden = true; nameEl.textContent = ''; }
  $('#mn-err').classList.remove('on');
}
async function submitMeetup() {
  const err = $('#mn-err');
  err.classList.remove('on');
  const title = $('#mn-title').value.trim();
  const hub_id = $('#mn-hub').value;
  const dtv = $('#mn-date').value;
  const loc = $('#mn-loc').value.trim();
  const cap = parseInt($('#mn-cap').textContent, 10);
  const desc = $('#mn-desc').value.trim();
  const fail = m => { err.textContent = m; err.classList.add('on'); };
  if (title.length < 2) return fail('제목을 2자 이상 입력해 주세요.');
  if (!hub_id) return fail('거점을 선택해 주세요.');
  if (!dtv) return fail('일시를 선택해 주세요.');
  const meetAt = new Date(dtv);
  if (meetAt.getTime() <= Date.now()) return fail('미래 일시만 선택할 수 있습니다.');
  if (loc.length < 2) return fail('집결 장소를 2자 이상 입력해 주세요.');
  const res = await DB.createMeetup({
    hub_id, race_id: state.pendingRaceLink ? state.pendingRaceLink.id : null,
    title, description: desc || null,
    meet_at: meetAt.toISOString(), location_text: loc, capacity: cap
  });
  if (res.error) return fail('개설하지 못했습니다: ' + (res.error.message || '오류'));
  state.pendingRaceLink = null;
  $('#mn-title').value = ''; $('#mn-loc').value = ''; $('#mn-desc').value = '';
  toast('밋업을 개설했습니다');
  nav('#/meetup/' + res.data.id);
}

/* ── 밋업 상세 ───────────────────────────────────────────── */
async function renderMeetupDetail(id) {
  let m = state.meetups.find(x => x.id === id);
  if (!m) {
    const { data } = await DB.meetupBoard(null);
    state.meetups = data;
    m = data.find(x => x.id === id);
  }
  const body = $('#mt-body');
  body.textContent = '';
  if (!m) {
    $('#mt-title').textContent = '밋업';
    $('#mt-hub').textContent = '';
    body.appendChild(emptyState('취소된 밋업입니다.'));
    return;
  }
  $('#mt-title').textContent = m.title;
  $('#mt-hub').textContent = m.hub_name || '';

  const info = el('div', 'dt-body');
  const linkedRace = m.race_id ? state.races.find(r => r.id === m.race_id) : null;
  const rows = [
    ['일시', fmtMeet(m.meet_at)],
    ['장소', m.location_text || ''],
    ['정원', `${m.joined_count} / ${m.capacity}`],
    ['호스트', m.host_name || '멤버']
  ];
  if (linkedRace) rows.push(['연계 대회', linkedRace.name]);
  if (m.description) rows.push(['안내', m.description]);
  rows.forEach(([k, v]) => {
    const row = el('div', 'dt-row');
    row.appendChild(el('span', 'dt-row-k', k));
    row.appendChild(el('span', 'dt-row-v', v));
    info.appendChild(row);
  });
  body.appendChild(info);

  const acts = el('div', 'dt-actions');
  const shareBtn = el('button', 'dt-btn');
  shareBtn.type = 'button';
  shareBtn.appendChild(svgUse('i-share', 15));
  shareBtn.appendChild(el('span', null, '공유'));
  shareBtn.onclick = () => shareText(`[ARC] ${m.title} ${fmtMeet(m.meet_at)} — 같이 뛰실 분?`);
  acts.appendChild(shareBtn);
  if (m.i_am_host) {
    const cx = el('button', 'dt-btn dt-btn--danger', '밋업 취소');
    cx.type = 'button';
    cx.onclick = async () => {
      const ok = await confirmModal('밋업 취소', '참가자 전원에게 취소 알림이 전송됩니다. 취소하시겠습니까?');
      if (!ok) return;
      const r = await DB.cancelMeetup(m.id);
      if (!r.ok) { toast('취소하지 못했습니다'); return; }
      toast('밋업을 취소했습니다');
      nav('#/meetups');
    };
    acts.appendChild(cx);
  }
  body.appendChild(acts);

  // RSVP 버튼 (호스트 제외)
  if (!m.i_am_host && m.status !== 'canceled') {
    const joined = m.my_status === 'joined';
    const full = (Number(m.joined_count) >= Number(m.capacity) || m.status === 'full') && !joined;
    const btn = el('button', 'meet-rsvp');
    btn.type = 'button';
    btn.dataset.state = joined ? 'joined' : (full ? 'full' : 'open');
    btn.textContent = joined ? '신청 완료 · 취소' : (full ? '정원 마감' : '참가 신청');
    btn.disabled = full;
    btn.onclick = async () => {
      const res = await DB.rsvpMeetup(m.id, !joined);
      if (!res.ok) {
        toast(res.error === 'FULL' ? '정원이 마감되었습니다.' : '처리하지 못했습니다');
        return;
      }
      toast(joined ? '참가를 취소했습니다' : '참가 신청 완료');
      const { data } = await DB.meetupBoard(null);
      state.meetups = data;
      renderMeetupDetail(id);
    };
    body.appendChild(btn);
  }

  // 참석자
  const head = el('div', 'wg-head');
  head.appendChild(el('span', 'wg-title', '참석 멤버'));
  head.appendChild(el('span', 'wg-count', String(m.joined_count || 0)));
  body.appendChild(head);
  const list = el('ul', 'wg-list');
  body.appendChild(list);
  let off = 0;
  const moreBtn = el('button', 'wg-more-btn', '더 보기');
  moreBtn.type = 'button'; moreBtn.hidden = true;
  body.appendChild(moreBtn);
  async function loadAtt() {
    const { data } = await DB.meetupAttendees(m.id, off);
    if (off === 0 && !data.length) {
      const li = el('li');
      li.appendChild(emptyState('아직 참석 멤버가 없습니다.'));
      list.appendChild(li);
      return;
    }
    data.forEach(a => {
      const li = el('li', 'wg-row');
      li.appendChild(makeAvatar(a.full_name, 36));
      const main = el('span', 'wg-row-main');
      main.appendChild(el('span', 'wg-row-name', a.full_name));
      main.appendChild(el('span', 'wg-row-org', a.organization || ''));
      li.appendChild(main);
      list.appendChild(li);
    });
    off += data.length;
    moreBtn.hidden = data.length < 20;
  }
  moreBtn.onclick = loadAtt;
  loadAtt();
}

/* ════════════════════════════════════════════════════════
 * 알림함 (SPEC §4.6 / DELTA §7.1)
 * ══════════════════════════════════════════════════════ */
const NTYPE_ICON = {
  meetup_reminder: 'i-bell', meetup_rsvp: 'i-meetup', meetup_canceled: 'i-close',
  meetup_updated: 'i-meetup', race_reg: 'i-calendar', system: 'i-bell'
};
async function renderAlerts() {
  const box = $('#alerts-list');
  box.textContent = '';
  if (!DB.ready()) { box.appendChild(emptyState('서버 연결 대기 중입니다.')); return; }
  const { data } = await DB.notifications(50);
  if (!data.length) { box.appendChild(emptyState('새로운 소식이 없습니다.')); updateBadge(); return; }
  const ul = el('ul', 'alert-list');
  data.forEach(n => {
    const li = el('li', 'alert-row');
    li.dataset.unread = String(!n.read_at);
    const ic = el('span', 'alert-ico');
    ic.appendChild(svgUse(NTYPE_ICON[n.ntype] || 'i-bell', 18));
    li.appendChild(ic);
    const main = el('span', 'alert-main');
    const t = el('span', 'alert-txt');
    const b = el('b', null, n.title);
    t.appendChild(b);
    if (n.body) t.appendChild(document.createTextNode(' — ' + n.body));
    main.appendChild(t);
    main.appendChild(el('span', 'alert-time', ago(n.created_at)));
    li.appendChild(main);
    const x = el('button', 'alert-x');
    x.type = 'button';
    x.setAttribute('aria-label', '알림 삭제');
    x.appendChild(svgUse('i-close', 14));
    x.onclick = async ev => {
      ev.stopPropagation();
      await DB.removeNotification(n.id);
      li.remove();
      updateBadge();
    };
    li.appendChild(x);
    li.onclick = async () => {
      if (!n.read_at) { await DB.markRead(n.id); n.read_at = new Date().toISOString(); li.dataset.unread = 'false'; updateBadge(); }
      if (n.link_target && /^#\//.test(n.link_target)) nav(n.link_target);
    };
    ul.appendChild(li);
  });
  box.appendChild(ul);
  updateBadge();
}
async function updateBadge() {
  if (!DB.ready() || !state.member) { $('#bnav-dot').hidden = true; return; }
  try {
    const c = await DB.unreadCount();
    $('#bnav-dot').hidden = !(c > 0);
  } catch { $('#bnav-dot').hidden = true; }
}

/* ════════════════════════════════════════════════════════
 * 프로필 (SPEC §4.5)
 * ══════════════════════════════════════════════════════ */
async function renderProfile() {
  const box = $('#profile-body');
  box.textContent = '';
  if (!DB.ready()) { box.appendChild(emptyState('서버 연결 대기 중입니다.')); return; }
  const { data: p } = await DB.myProfile();
  if (!p) { box.appendChild(emptyState('프로필을 불러오지 못했습니다.')); return; }
  state.profile = p;
  state.consents = await DB.myConsents();

  const head = el('div', 'pf-head');
  head.appendChild(makeAvatar(p.full_name, 56));
  const hm = el('div');
  hm.appendChild(el('div', 'pf-name', p.full_name));
  hm.appendChild(el('div', 'pf-org', p.organization));
  if (p.cohort) hm.appendChild(el('div', 'pf-cohort', p.cohort));
  head.appendChild(hm);
  box.appendChild(head);
  if (p.bio) box.appendChild(el('p', 'pf-bio', p.bio));

  // 프로필 수정 (인라인)
  box.appendChild(el('div', 'pf-sec', 'Profile'));
  const editBtn = el('button', 'pf-action', '프로필 수정');
  editBtn.type = 'button';
  const editBox = el('div', 'form-body');
  editBox.hidden = true;
  editBox.style.paddingTop = '4px'; editBox.style.paddingBottom = '8px';
  const mkInput = (lbl, val, max) => {
    const g = el('div', 'v-ig');
    g.appendChild(el('label', 'v-lbl', lbl));
    const i = el('input', 'v-inp');
    i.type = 'text'; i.value = val || ''; i.maxLength = max;
    g.appendChild(i);
    editBox.appendChild(g);
    return i;
  };
  const inName = mkInput('실명', p.full_name, 40);
  const inOrg = mkInput('소속', p.organization, 60);
  const inBio = mkInput('한줄소개', p.bio, 300);
  const saveBtn = el('button', 'v-btn', '저장');
  saveBtn.type = 'button';
  saveBtn.onclick = async () => {
    if (!inName.value.trim() || !inOrg.value.trim()) { toast('실명·소속은 비울 수 없습니다'); return; }
    const r = await DB.updateProfile({ full_name: inName.value.trim(), organization: inOrg.value.trim(), bio: inBio.value.trim() || null });
    if (r.error) { toast('저장하지 못했습니다'); return; }
    toast('저장했습니다');
    renderProfile();
  };
  editBox.appendChild(saveBtn);
  editBtn.onclick = () => { editBox.hidden = !editBox.hidden; };
  box.appendChild(editBtn);
  box.appendChild(editBox);

  // 동의 관리 (선택 2건 — OFF 즉시 반영, CLO)
  box.appendChild(el('div', 'pf-sec', 'Consents'));
  [['service_notif', '서비스 알림 수신'], ['marketing_email', '마케팅 정보 수신']].forEach(([key, lbl]) => {
    const lab = el('label', 'consent-item consent-item--light');
    lab.style.padding = '12px 20px';
    const inp = el('input');
    inp.type = 'checkbox';
    inp.checked = !!state.consents[key];
    const boxEl = el('span', 'consent-box');
    lab.appendChild(inp); lab.appendChild(boxEl);
    lab.appendChild(el('span', 'consent-label', lbl));
    inp.onchange = async () => {
      const r = await DB.setConsent(key, inp.checked);
      if (r.error) { toast('변경하지 못했습니다'); inp.checked = !inp.checked; return; }
      state.consents[key] = inp.checked;
      toast(inp.checked ? '동의했습니다' : '수신 거부가 즉시 반영되었습니다');
    };
    box.appendChild(lab);
  });

  // 공개 설정
  box.appendChild(el('div', 'pf-sec', 'Visibility'));
  const vr = el('div', 'pf-row');
  vr.appendChild(el('span', null, '멤버 간 프로필 공개'));
  const sel = el('select', 'vis-sel');
  [['members', '멤버에게 공개'], ['hidden', '숨김']].forEach(([v, l]) => {
    const o = el('option', null, l); o.value = v;
    if (p.profile_visibility === v) o.selected = true;
    sel.appendChild(o);
  });
  sel.onchange = async () => {
    const r = await DB.updateProfile({ profile_visibility: sel.value });
    if (r.error) { toast('변경하지 못했습니다'); return; }
    toast('반영되었습니다');
  };
  vr.appendChild(sel);
  box.appendChild(vr);

  // 내 참가 예정 대회 (board 캐시 i_am_going)
  box.appendChild(el('div', 'pf-sec', 'My Races'));
  await loadRaces();
  const mine = state.races.filter(r => r.i_am_going);
  if (!mine.length) box.appendChild(el('div', 'pf-row', '참가 예정 대회가 없습니다'));
  else {
    const ul = el('ul', 'pf-mini-list');
    mine.forEach(r => {
      const li = el('li', 'pf-mini');
      li.appendChild(el('span', null, r.name));
      li.appendChild(el('span', 'pf-mini-sub', fmtDateK(r.race_date)));
      li.onclick = () => nav('#/race/' + r.id);
      ul.appendChild(li);
    });
    box.appendChild(ul);
  }

  // 내 RSVP 밋업
  box.appendChild(el('div', 'pf-sec', 'My Meetups'));
  const { data: mb } = await DB.meetupBoard(null);
  const myMeets = (mb || []).filter(m => m.my_status === 'joined' || m.i_am_host);
  if (!myMeets.length) box.appendChild(el('div', 'pf-row', '예정된 밋업이 없습니다'));
  else {
    const ul = el('ul', 'pf-mini-list');
    myMeets.forEach(m => {
      const li = el('li', 'pf-mini');
      li.appendChild(el('span', null, (m.i_am_host ? '[호스트] ' : '') + m.title));
      li.appendChild(el('span', 'pf-mini-sub', fmtMeet(m.meet_at)));
      li.onclick = () => nav('#/meetup/' + m.id);
      ul.appendChild(li);
    });
    box.appendChild(ul);
  }

  // 계정
  box.appendChild(el('div', 'pf-sec', 'Account'));
  const lo = el('button', 'pf-action', '로그아웃');
  lo.type = 'button';
  lo.onclick = async () => {
    await DB.signOut();
    state.authed = state.member = false;
    nav('#/join');
  };
  box.appendChild(lo);
  const delBtn = el('button', 'pf-action pf-action--danger', '회원 탈퇴');
  delBtn.type = 'button';
  delBtn.onclick = async () => {
    const a = await confirmModal('회원 탈퇴', '참가 예정·밋업 기록이 즉시 삭제됩니다.');
    if (!a) return;
    const b = await confirmModal('정말 탈퇴하시겠습니까?', '이 작업은 되돌릴 수 없습니다. 주최 중인 밋업은 자동 취소됩니다.');
    if (!b) return;
    const r = await DB.deleteAccount();
    if (!r.ok) { toast('탈퇴 처리에 실패했습니다'); return; }
    state.authed = state.member = false;
    state.races = []; state.meetups = [];
    toast('탈퇴가 완료되었습니다');
    nav('#/join');
  };
  box.appendChild(delBtn);
  box.appendChild(el('div', 'cal-notice', `ARC — Members' Running Network`));
}

/* ════════════════════════════════════════════════════════
 * 온보딩 (SPEC §3.3 J1→J4 / DELTA §6)
 * — 가입 0통: signUp(확인메일 OFF) + redeem RPC 이중검증
 * ══════════════════════════════════════════════════════ */
const OB_STEPS = ['j1', 'j2', 'j3', 'j4', 'login', 'forgot'];
function showJoinStep(step) {
  OB_STEPS.forEach(s => { $('#ob-' + s).hidden = (s !== step); });
}
function wireOnboarding() {
  // J1 — 4-4-4 자동 포맷팅 (DELTA §6.2)
  const codeInp = $('#j1-code'), j1Btn = $('#j1-next'), j1Err = $('#j1-err');
  codeInp.addEventListener('input', e => {
    const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    e.target.value = v.replace(/(.{4})(?=.)/g, '$1-');
    j1Btn.disabled = v.length !== 12;
  });
  j1Btn.onclick = async () => {
    j1Err.classList.remove('on');
    if (!DB.ready()) { toast('서버 미설정 — 운영자 설정 대기 중입니다'); return; }
    const raw = codeInp.value;
    if (!DB.validCodeFormat(raw)) {
      j1Err.textContent = '코드 형식이 올바르지 않습니다. 다시 확인해 주세요.';
      j1Err.classList.add('on');
      return;
    }
    state.obCode = raw;
    if (state.authed) {
      // 가입 성공 + redeem 실패 이탈자 복귀 경로 (SPEC §4.1)
      const res = await DB.redeemInvite(state.obCode);
      if (res.ok) {
        state.member = true;
        if (!state.consents.required_disclosure) { showJoinStep('j2'); return; }
        toast('환영합니다');
        nav('#/cal');
      } else showRedeemError(res, j1Err);
      return;
    }
    showJoinStep('j2');
  };
  $('#go-login').onclick = () => showJoinStep('login');

  // 뒤로가기
  $$('[data-back]').forEach(b => { b.onclick = () => showJoinStep(b.dataset.back); });

  // J2 — 동의 (마스터 ↔ 개별 동기화 + 필수3 게이트)
  const items = $$('#consent-list .consent-item input');
  const master = $('#consent-all');
  const j2Btn = $('#j2-next');
  const syncConsent = () => {
    const reqs = $$('#consent-list .consent-item[data-req] input');
    j2Btn.disabled = !reqs.every(c => c.checked);
    master.checked = items.every(c => c.checked);
  };
  master.addEventListener('change', () => {
    items.forEach(c => { c.checked = master.checked; });
    syncConsent();
  });
  items.forEach(c => c.addEventListener('change', syncConsent));
  j2Btn.onclick = () => {
    const map = {};
    items.forEach(c => { map[c.dataset.key] = c.checked; });
    state.obConsents = map;
    if (state.authed) {
      // redeem 복귀 사용자: 동의 저장 후 입장
      DB.saveConsents(map).then(r => {
        if (r.error) { toast('동의 저장에 실패했습니다'); return; }
        state.consents = Object.assign({}, state.consents, map);
        toast('환영합니다');
        nav('#/cal');
      });
      return;
    }
    showJoinStep('j3');
  };

  // J3 — 프로필 (만 18세 클라이언트 선검증, CLO)
  const jName = $('#j3-name'), jOrg = $('#j3-org'), jBirth = $('#j3-birth'), jBio = $('#j3-bio');
  const j3Btn = $('#j3-next'), j3Err = $('#j3-err');
  const adultMax = () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 18);
    return d.toISOString().slice(0, 10);
  };
  jBirth.max = adultMax();
  const syncJ3 = () => {
    j3Btn.disabled = !(jName.value.trim() && jOrg.value.trim() && jBirth.value);
  };
  [jName, jOrg, jBirth].forEach(i => i.addEventListener('input', syncJ3));
  j3Btn.onclick = () => {
    j3Err.classList.remove('on');
    if (jBirth.value > adultMax()) {
      j3Err.textContent = '만 18세 이상만 가입할 수 있습니다';
      j3Err.classList.add('on');
      return;
    }
    state.obProfile = {
      full_name: jName.value.trim(), organization: jOrg.value.trim(),
      birth_date: jBirth.value, bio: jBio.value.trim()
    };
    showJoinStep('j4');
  };

  // J4 — 계정 생성 + 제출 일괄 처리 (SPEC §3.3)
  const jEmail = $('#j4-email'), jPw = $('#j4-pw');
  const j4Btn = $('#j4-submit'), j4Err = $('#j4-err');
  const syncJ4 = () => { j4Btn.disabled = !(DB.validEmail(jEmail.value) && jPw.value.length >= 8); };
  [jEmail, jPw].forEach(i => i.addEventListener('input', syncJ4));
  j4Btn.onclick = async () => {
    j4Err.classList.remove('on');
    j4Btn.disabled = true;
    try {
      const { data, error } = await DB.signUp({
        email: jEmail.value.trim(), password: jPw.value,
        full_name: state.obProfile.full_name,
        organization: state.obProfile.organization,
        birth_date: state.obProfile.birth_date,
        cohort: 'KWC-1'
      });
      if (error) {
        const m = error.message || '';
        if (/already|registered/i.test(m)) j4Err.textContent = '이미 가입된 이메일입니다. 로그인해 주세요.';
        else if (/UNDERAGE/.test(m)) j4Err.textContent = '만 18세 이상만 가입할 수 있습니다';
        else j4Err.textContent = '가입에 실패했습니다: ' + m;
        j4Err.classList.add('on');
        return;
      }
      if (!data.session) {
        j4Err.textContent = '서버 설정 확인 필요: Auth → Confirm email을 OFF로 설정해야 즉시 입장됩니다.';
        j4Err.classList.add('on');
        return;
      }
      DB.markLogin();
      state.authed = true;
      const res = await DB.redeemInvite(state.obCode);
      if (!res.ok) { showRedeemError(res, j1Err); showJoinStep('j1'); return; }
      state.member = true;
      const cr = await DB.saveConsents(state.obConsents);
      if (cr.error) console.warn('consents save failed:', cr.error.message);
      else state.consents = Object.assign({}, state.obConsents);
      if (state.obProfile.bio) await DB.updateProfile({ bio: state.obProfile.bio });
      toast('환영합니다 — ARC 입장 완료');
      nav('#/cal');
    } finally {
      j4Btn.disabled = false;
    }
  };

  // 로그인
  $('#li-submit').onclick = async () => {
    const err = $('#li-err');
    err.classList.remove('on');
    if (!DB.ready()) { toast('서버 미설정 — 운영자 설정 대기 중입니다'); return; }
    const { error } = await DB.signIn($('#li-email').value.trim(), $('#li-pw').value);
    if (error) {
      err.textContent = '이메일 또는 비밀번호가 올바르지 않습니다.';
      err.classList.add('on');
      return;
    }
    state.authed = true;
    // 멤버 감지 (SPEC §4.1): 플래그 또는 board 응답
    if (DB.isMemberFlag()) state.member = true;
    else {
      const { data } = await DB.raceBoard();
      if (data.length) { state.member = true; DB.setMemberFlag(true); state.races = data; }
    }
    if (state.member) {
      state.consents = await DB.myConsents();
      toast('어서 오세요');
      nav('#/cal');
    } else {
      toast('초대코드 인증이 필요합니다');
      showJoinStep('j1');
    }
  };
  $('#go-forgot').onclick = () => showJoinStep('forgot');

  // 복구 요청
  $('#fg-submit').onclick = async () => {
    const err = $('#fg-err');
    err.classList.remove('on');
    const em = $('#fg-email').value.trim();
    if (!DB.validEmail(em)) {
      err.textContent = '이메일 형식을 확인해 주세요.';
      err.classList.add('on');
      return;
    }
    const { error } = await DB.resetRequest(em);
    if (error) {
      err.textContent = '발송에 실패했습니다. 잠시 후 다시 시도해 주세요.';
      err.classList.add('on');
      return;
    }
    toast('재설정 링크를 발송했습니다');
    showJoinStep('login');
  };

  // 새 비밀번호 설정 (#/reset)
  $('#rs-submit').onclick = async () => {
    const err = $('#rs-err');
    err.classList.remove('on');
    const p1 = $('#rs-pw').value, p2 = $('#rs-pw2').value;
    const fail = m => { err.textContent = m; err.classList.add('on'); };
    if (p1.length < 8) return fail('8자 이상 입력해 주세요.');
    if (p1 !== p2) return fail('비밀번호가 일치하지 않습니다.');
    const { error } = await DB.updatePassword(p1);
    if (error) return fail('변경에 실패했습니다: ' + error.message);
    DB.markLogin();
    toast('비밀번호를 변경했습니다');
    nav(state.member || DB.isMemberFlag() ? '#/cal' : '#/join');
  };
}
function showRedeemError(res, errEl) {
  const msgs = {
    RATE_LIMITED: '시도 횟수를 초과했습니다. 1시간 후 다시 시도해 주세요.',
    NOT_ELIGIBLE: '초대코드 또는 이메일을 확인해 주세요. 문제가 계속되면 운영진에게 문의하세요.',
    AUTH_REQUIRED: '세션이 만료되었습니다. 다시 로그인해 주세요.'
  };
  errEl.textContent = msgs[res.error] || '인증에 실패했습니다. 다시 시도해 주세요.';
  errEl.classList.add('on');
}

/* ════════════════════════════════════════════════════════
 * 라우터
 * ══════════════════════════════════════════════════════ */
const MEMBER_ROUTES = ['cal', 'race', 'meetups', 'meetup-new', 'meetup', 'alerts', 'profile'];
async function route() {
  const h = location.hash || '#/join';
  const m = h.match(/^#\/([a-z-]+)(?:\/([0-9a-fA-F-]+))?/);
  const name = m ? m[1] : 'join';
  const id = m ? m[2] : null;

  if (MEMBER_ROUTES.includes(name) && !(state.authed && state.member)) {
    if (location.hash !== '#/join') { location.hash = '#/join'; return; }
  }
  switch (name) {
    case 'join':
      show('scr-join');
      break;
    case 'cal':
      show('scr-cal');
      await loadRaces();
      renderCalendar();
      updateBadge();
      break;
    case 'race':
      show('scr-race');
      await renderRaceDetail(id);
      break;
    case 'meetups':
      show('scr-meetups');
      await renderMeetups();
      updateBadge();
      break;
    case 'meetup-new':
      show('scr-meetup-new');
      await renderMeetupNew();
      break;
    case 'meetup':
      show('scr-meetup');
      await loadRaces();
      await renderMeetupDetail(id);
      break;
    case 'alerts':
      show('scr-alerts');
      await renderAlerts();
      break;
    case 'profile':
      show('scr-profile');
      await renderProfile();
      updateBadge();
      break;
    case 'reset':
      show('scr-reset');
      break;
    default:
      show('scr-join');
  }
}

/* ════════════════════════════════════════════════════════
 * 부트스트랩
 * ══════════════════════════════════════════════════════ */
async function boot() {
  wireOnboarding();

  // 캘린더 검색
  $('#cal-q').addEventListener('input', e => { state.calQ = e.target.value; renderCalendar(); });

  // 4탭 + FAB
  $$('.bnav-btn').forEach(b => { b.onclick = () => nav(b.dataset.tab); });
  $('#fab-new-meetup').onclick = () => { state.pendingRaceLink = null; nav('#/meetup-new'); };

  // 밋업 폼: 정원 stepper + 제출 + 헤더 back
  const capOut = $('#mn-cap');
  $('#mn-cap-minus').onclick = () => { capOut.textContent = String(Math.max(2, parseInt(capOut.textContent, 10) - 1)); };
  $('#mn-cap-plus').onclick = () => { capOut.textContent = String(Math.min(50, parseInt(capOut.textContent, 10) + 1)); };
  $('#mn-submit').onclick = submitMeetup;
  $$('[data-nav]').forEach(b => { b.onclick = () => nav(b.dataset.nav); });

  if (!DB.ready()) {
    $('#setup-note').hidden = false;
    showJoinStep('j1');
    if (location.hash && location.hash !== '#/join') location.hash = '#/join';
    window.addEventListener('hashchange', route);
    route();
    return;
  }

  DB.onAuth((event) => {
    if (event === 'PASSWORD_RECOVERY') nav('#/reset');
    if (event === 'SIGNED_OUT') { state.authed = state.member = false; }
  });

  const expired = await DB.enforceSessionAge();   // SEC-07
  if (expired) toast('세션이 만료되었습니다. 다시 로그인해 주세요.');

  const session = await DB.getSession();
  state.authed = !!session;
  if (state.authed) {
    state.member = DB.isMemberFlag();
    if (!state.member) {
      const { data } = await DB.raceBoard();
      if (data.length) { state.member = true; DB.setMemberFlag(true); state.races = data; }
    }
    if (state.member) state.consents = await DB.myConsents();
  }

  window.addEventListener('hashchange', route);
  if (state.authed && state.member) {
    if (!location.hash || location.hash === '#/join') location.hash = '#/cal';
    route();
  } else if (state.authed) {
    showJoinStep('j1');                            // redeem 미완 복귀 (SPEC §4.1)
    if (location.hash !== '#/join') location.hash = '#/join';
    route();
  } else {
    showJoinStep('j1');
    if (location.hash && location.hash !== '#/join' && !/^#\/reset/.test(location.hash)) location.hash = '#/join';
    route();
  }
}

document.addEventListener('DOMContentLoaded', boot);

// PWA — Service Worker (file:// 로컬 열람 시 스킵)
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.register('./sw.js');
}

/* 검증·디버그용 공개 네임스페이스 (데모 데이터 미포함 — 폐쇄형 유지) */
window.ARC = { state, show, nav, renderCalendar, renderMeetups, raceDerived, makeAvatar, esc };
