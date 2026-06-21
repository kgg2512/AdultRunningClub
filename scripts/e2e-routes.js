/* 전 라우트 콘솔0 검증 (D1) — 데모 모드 전 화면 순회 + 정적 페이지 */
'use strict';
const GLOBAL = 'C:/Users/kgg25/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const { chromium } = require(GLOBAL);
const EXE = 'C:/Users/kgg25/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const BASE = 'http://localhost:8123';

const allErrs = {};
(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const page = await (await browser.newContext({ viewport:{width:412,height:880} })).newPage();
  let cur = 'init';
  page.on('console', m => { if(m.type()==='error'){ (allErrs[cur]=allErrs[cur]||[]).push('C:'+m.text()); }});
  page.on('pageerror', e => { (allErrs[cur]=allErrs[cur]||[]).push('P:'+String(e).split('\n')[0]); });

  // 데모 진입
  cur='demo-enter';
  await page.goto(BASE+'/index.html?demo=true',{waitUntil:'networkidle'});
  await page.evaluate(()=>{Object.keys(localStorage).filter(k=>k.startsWith('arc3')).forEach(k=>localStorage.removeItem(k));});
  await page.reload({waitUntil:'networkidle'}); await page.waitForTimeout(400);
  const e=await page.$('#demo-enter'); if(e){await e.click();await page.waitForTimeout(1300);}

  const routes = ['#/cal','#/meetups','#/meetup-new','#/alerts','#/profile'];
  for (const r of routes){
    cur='demo '+r;
    await page.goto(BASE+'/index.html?demo=true'+r,{waitUntil:'networkidle'});
    await page.waitForTimeout(700);
  }
  // race detail + meetup detail (id 동적)
  cur='demo #/cal→race';
  await page.goto(BASE+'/index.html?demo=true#/cal',{waitUntil:'networkidle'}); await page.waitForTimeout(700);
  await page.evaluate(()=>{const c=document.querySelector('.race-card'); if(c)c.click();}); await page.waitForTimeout(800);
  cur='demo #/meetups→detail';
  await page.goto(BASE+'/index.html?demo=true#/meetups',{waitUntil:'networkidle'}); await page.waitForTimeout(700);
  await page.evaluate(()=>{const c=document.querySelector('.meet-card'); if(c)c.click();}); await page.waitForTimeout(800);

  // 정적 페이지
  for (const pg of ['privacy.html','terms.html','delete-account.html']){
    cur=pg;
    await page.goto(BASE+'/'+pg,{waitUntil:'networkidle'}); await page.waitForTimeout(500);
  }
  // 프리뷰 모드
  cur='preview #/cal';
  await page.goto(BASE+'/index.html?preview=true#/cal',{waitUntil:'networkidle'}); await page.waitForTimeout(900);
  cur='preview #/meetups';
  await page.goto(BASE+'/index.html?preview=true#/meetups',{waitUntil:'networkidle'}); await page.waitForTimeout(700);

  await browser.close();
  const keys=Object.keys(allErrs);
  if(!keys.length){ console.log('ALL ROUTES CLEAN — 0 console/page errors across all routes'); }
  else { console.log('ERRORS FOUND:'); keys.forEach(k=>console.log('  ['+k+'] '+allErrs[k].join(' ; '))); }
  process.exit(0);
})();
