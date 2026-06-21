/* ARC E2E 검증 — 데모 모드 풀플로우 + 콘솔 에러 수집 + 스크린샷.
 * 전역 playwright(@playwright/mcp 의존) + ms-playwright chromium 캐시 사용.
 * 사용: node scripts/e2e-verify.js  (서버 http://localhost:8123 선행 기동 필요)
 */
'use strict';
const path = require('path');
const fs = require('fs');
const GLOBAL = 'C:/Users/kgg25/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const { chromium } = require(GLOBAL);

const BASE = process.env.ARC_BASE || 'http://localhost:8123';
const OUT = path.resolve(__dirname, '..', 'screenshots', 'verify');
fs.mkdirSync(OUT, { recursive: true });

const consoleErrors = [];
const pageErrors = [];

async function shot(page, name) {
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  console.log('  shot:', name);
}

(async () => {
  const EXE = 'C:/Users/kgg25/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
  const browser = await chromium.launch({ executablePath: EXE });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 880 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => pageErrors.push(String(e)));

  const step = async (label, fn) => {
    console.log('STEP:', label);
    try { await fn(); } catch (e) { console.log('  !! step failed:', e.message); pageErrors.push(label + ': ' + e.message); }
  };

  // 1) 게이트 (demo 진입 전)
  await step('gate', async () => {
    await page.goto(BASE + '/index.html?demo=true', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await shot(page, '01-gate');
  });

  // 2) 데모 둘러보기 진입 → 캘린더
  await step('enter-demo', async () => {
    const btn = await page.$('#demo-enter');
    if (btn) { await btn.click(); await page.waitForTimeout(1200); }
    // reload happens; ensure cal
    await page.waitForTimeout(800);
    if (!location || true) { await page.goto(BASE + '/index.html?demo=true#/cal', { waitUntil: 'networkidle' }); }
    await page.waitForTimeout(1000);
    await shot(page, '02-calendar');
  });

  // 3) 대회 상세 (첫 카드 클릭)
  await step('race-detail', async () => {
    const card = await page.$('.race-card');
    if (card) { await card.click(); await page.waitForTimeout(900); }
    await shot(page, '03-race-detail');
  });

  // 4) 참가 토글
  await step('going-toggle', async () => {
    const tg = await page.$('.wg-toggle');
    if (tg) { await tg.click(); await page.waitForTimeout(700); }
    await shot(page, '04-going-toggled');
  });

  // 5) 밋업 보드
  await step('meetups', async () => {
    await page.goto(BASE + '/index.html?demo=true#/meetups', { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    await shot(page, '05-meetups');
  });

  // 6) 밋업 상세 + RSVP
  await step('meetup-detail', async () => {
    const mc = await page.$('.meet-card');
    if (mc) { await mc.click(); await page.waitForTimeout(900); }
    await shot(page, '06-meetup-detail');
    const rsvp = await page.$('.meet-rsvp:not([disabled])');
    if (rsvp) { await rsvp.click(); await page.waitForTimeout(800); await shot(page, '07-rsvp-done'); }
  });

  // 7) 밋업 개설
  await step('meetup-new', async () => {
    await page.goto(BASE + '/index.html?demo=true#/meetup-new', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await page.fill('#mn-title', '토요일 테스트 런').catch(()=>{});
    await page.fill('#mn-loc', '여의도공원 정문').catch(()=>{});
    await shot(page, '08-meetup-new');
    const submit = await page.$('#mn-submit');
    if (submit) { await submit.click(); await page.waitForTimeout(1000); await shot(page, '09-meetup-created'); }
  });

  // 8) 알림함
  await step('alerts', async () => {
    await page.goto(BASE + '/index.html?demo=true#/alerts', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await shot(page, '10-alerts');
  });

  // 9) 프로필
  await step('profile', async () => {
    await page.goto(BASE + '/index.html?demo=true#/profile', { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    await shot(page, '11-profile');
  });

  // 10) 로그아웃
  await step('logout', async () => {
    // 프로필 화면 로그아웃 버튼 텍스트로 탐색
    const btns = await page.$$('.pf-action');
    for (const b of btns) {
      const t = (await b.innerText()).trim();
      if (t === '로그아웃') { await b.click(); break; }
    }
    await page.waitForTimeout(1000);
    await shot(page, '12-after-logout');
  });

  // 11) 재진입 후 탈퇴
  await step('delete-account', async () => {
    await page.goto(BASE + '/index.html?demo=true', { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const enter = await page.$('#demo-enter');
    if (enter) { await enter.click(); await page.waitForTimeout(1200); }
    await page.goto(BASE + '/index.html?demo=true#/profile', { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    const btns = await page.$$('.pf-action');
    for (const b of btns) {
      const t = (await b.innerText()).trim();
      if (t === '회원 탈퇴') { await b.click(); break; }
    }
    await page.waitForTimeout(600);
    // 1차 confirm
    let ok = await page.$('#modal-ok'); if (ok) { await ok.click(); await page.waitForTimeout(500); }
    // 2차 confirm
    ok = await page.$('#modal-ok'); if (ok) { await ok.click(); await page.waitForTimeout(1000); }
    await shot(page, '13-after-delete');
  });

  // 12) 한글 렌더 확대 캡처 (캘린더 카드 줌)
  await step('font-zoom', async () => {
    await page.goto(BASE + '/index.html?demo=true', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const enter = await page.$('#demo-enter');
    if (enter) { await enter.click(); await page.waitForTimeout(1200); }
    await page.goto(BASE + '/index.html?demo=true#/cal', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const card = await page.$('.race-card');
    if (card) { await card.screenshot({ path: path.join(OUT, '14-font-zoom-card.png') }); console.log('  shot: 14-font-zoom-card'); }
  });

  await browser.close();

  console.log('\n=== CONSOLE ERRORS (' + consoleErrors.length + ') ===');
  consoleErrors.forEach(e => console.log('  ERR:', e));
  console.log('=== PAGE ERRORS (' + pageErrors.length + ') ===');
  pageErrors.forEach(e => console.log('  PAGEERR:', e));
  console.log('\nscreenshots →', OUT);
  process.exit(0);
})();
