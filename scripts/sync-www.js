#!/usr/bin/env node
/* ============================================================
 * ARC — www/ 동기화 (Capacitor 빌드 소스 = webDir:"www")
 * V3는 JS를 js/로 분리했으므로 index.html 1개만 복사하던 구 스크립트로는
 * 앱 빌드가 깨진다(js/ 누락). 이 스크립트가 전체 웹 번들을 www/로 복제한다.
 * 크로스플랫폼(Node fs) — Windows cmd/PowerShell/bash 모두 동작.
 * 사용: node scripts/sync-www.js   (npm run sync / npm run build 가 호출)
 * ⚠️ npx cap sync 전에 반드시 실행.
 * ==========================================================*/
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WWW = path.join(ROOT, 'www');

// 앱 번들에 포함할 항목 (웹 배포 루트와 동일하게 유지)
const INCLUDE = [
  'index.html',
  'js',
  'assets',
  'icons',
  'manifest.webmanifest',
  'sw.js',
  'privacy.html',
  'terms.html',
  'delete-account.html',
  'robots.txt',
  '.well-known'
];
// www/에서 정리할 구 V2 잔재 (동기화 시 제거)
const STALE = ['offline.html', 'screenshots'];

function rmrf(p) { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); }

fs.mkdirSync(WWW, { recursive: true });

// 1) 구 잔재 제거
for (const s of STALE) rmrf(path.join(WWW, s));

// 2) 포함 항목 복제 (덮어쓰기)
let copied = 0, skipped = [];
for (const item of INCLUDE) {
  const src = path.join(ROOT, item);
  const dst = path.join(WWW, item);
  if (!fs.existsSync(src)) { skipped.push(item); continue; }
  rmrf(dst);
  fs.cpSync(src, dst, { recursive: true });
  copied++;
}

console.log(`[sync-www] ${copied}개 항목 복제 → www/`);
if (skipped.length) console.log(`[sync-www] 원본 없음(건너뜀): ${skipped.join(', ')}`);
console.log('[sync-www] 완료. 다음: npx cap sync');
