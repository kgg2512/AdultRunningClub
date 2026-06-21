/* 인증/계정 검증 — 로그아웃 세션정리 + 탈퇴 데이터삭제·게이트복귀·재진입데이터0 */
'use strict';
const path = require('path');
const GLOBAL = 'C:/Users/kgg25/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const { chromium } = require(GLOBAL);
const EXE = 'C:/Users/kgg25/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const BASE = 'http://localhost:8123';

async function enter(page){
  await page.goto(BASE + '/index.html?demo=true', { waitUntil:'networkidle' });
  await page.waitForTimeout(500);
  const b = await page.$('#demo-enter'); if(b){ await b.click(); await page.waitForTimeout(1300); }
}
async function clickPfAction(page, label){
  const btns = await page.$$('.pf-action');
  for (const b of btns){ const t=(await b.innerText()).trim(); if(t===label){ await b.click(); return true; } }
  return false;
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const page = await (await browser.newContext({ viewport:{width:412,height:880} })).newPage();
  const errs=[]; page.on('console',m=>{if(m.type()==='error')errs.push('C:'+m.text());}); page.on('pageerror',e=>errs.push('P:'+e));

  // 깨끗 시작
  await page.goto(BASE + '/index.html?demo=true', { waitUntil:'networkidle' });
  await page.evaluate(()=>{Object.keys(localStorage).filter(k=>k.startsWith('arc3')).forEach(k=>localStorage.removeItem(k));});

  // === 로그아웃 ===
  await enter(page);
  // 프로필에서 일부 상태 변경(RSVP 등)으로 세션 데이터 만들기
  await page.goto(BASE + '/index.html?demo=true#/profile', { waitUntil:'networkidle' });
  await page.waitForTimeout(900);
  const loggedInBefore = await page.evaluate(()=>localStorage.getItem('arc3.demo.loggedIn'));
  await clickPfAction(page, '로그아웃');
  await page.waitForTimeout(1000);
  const hashAfterLogout = await page.evaluate(()=>location.hash);
  const loggedInAfter = await page.evaluate(()=>localStorage.getItem('arc3.demo.loggedIn'));
  const gateVisible = await page.evaluate(()=>{const j=document.querySelector('#scr-join'); return j && j.classList.contains('active');});
  console.log('LOGOUT: loggedIn ' + loggedInBefore + '→' + loggedInAfter + ' | hash=' + hashAfterLogout + ' | gateVisible=' + gateVisible);

  // 로그아웃 후 보호 라우트 직접 접근 시 게이트로 차단되는지
  await page.goto(BASE + '/index.html?demo=true#/profile', { waitUntil:'networkidle' });
  await page.waitForTimeout(700);
  // 데모는 loggedIn=false면 어떻게? route guard 확인
  const afterDirectHash = await page.evaluate(()=>location.hash);
  const profileBodyTxt = await page.$eval('#profile-body', el=>el.textContent.slice(0,40)).catch(()=>'');
  console.log('LOGOUT guard: direct #/profile → hash=' + afterDirectHash + ' bodyStart="' + profileBodyTxt.trim() + '"');

  // === 탈퇴 ===
  await page.evaluate(()=>{Object.keys(localStorage).filter(k=>k.startsWith('arc3')).forEach(k=>localStorage.removeItem(k));});
  await enter(page);
  // RSVP 하나 만들어 데이터 생성
  await page.goto(BASE + '/index.html?demo=true#/meetups', { waitUntil:'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(()=>{const c=[...document.querySelectorAll('.meet-card')].find(x=>x.querySelector('.meet-state--open')&&!x.querySelector('.meet-state--full')); if(c)c.click();});
  await page.waitForTimeout(800);
  await page.click('.meet-rsvp:not([disabled])').catch(()=>{});
  await page.waitForTimeout(700);
  const lsKeysBefore = await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('arc3.demo')));
  console.log('DELETE: LS keys before=' + JSON.stringify(lsKeysBefore));

  await page.goto(BASE + '/index.html?demo=true#/profile', { waitUntil:'networkidle' });
  await page.waitForTimeout(900);
  await clickPfAction(page, '회원 탈퇴');
  await page.waitForTimeout(500);
  let ok = await page.$('#modal-ok'); if(ok){ await ok.click(); await page.waitForTimeout(500); }
  ok = await page.$('#modal-ok'); if(ok){ await ok.click(); await page.waitForTimeout(1000); }
  const hashAfterDel = await page.evaluate(()=>location.hash);
  const lsKeysAfter = await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('arc3.demo')));
  const toast = await page.$eval('#toast', el=>el.textContent).catch(()=>'');
  console.log('DELETE: hash=' + hashAfterDel + ' | LS keys after=' + JSON.stringify(lsKeysAfter) + ' | toast="' + toast + '"');

  // 재진입 후 데이터 0 확인 (프로필 = defaultProfile, 밋업 = seed, RSVP 흔적 없음)
  await enter(page);
  await page.goto(BASE + '/index.html?demo=true#/profile', { waitUntil:'networkidle' });
  await page.waitForTimeout(900);
  const myMeetsAfter = await page.evaluate(()=>{
    const secs=[...document.querySelectorAll('.pf-sec')];
    const i=secs.findIndex(s=>s.textContent.trim()==='My Meetups');
    if(i<0) return 'NO-SEC';
    let n=secs[i].nextElementSibling, txt='';
    while(n && !n.classList.contains('pf-sec')){ txt+=n.textContent.trim()+';'; n=n.nextElementSibling; }
    return txt;
  });
  console.log('RE-ENTER after delete: My Meetups="' + myMeetsAfter + '"');

  await browser.close();
  console.log('\nERRORS(' + errs.length + '): ' + errs.join(' | '));
  process.exit(0);
})();
