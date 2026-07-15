/**
 * ARC Email Proxy — Cloudflare Worker
 *
 * Proxies EmailJS send requests so that service_id, template_id, and publicKey
 * are stored as CF Worker environment variables (Secrets), NOT exposed in
 * client-side source code.
 *
 * Environment variables (set via `wrangler secret put` or CF Dashboard):
 *   EMAILJS_PUBLIC_KEY  — EmailJS account public key
 *   EMAILJS_SERVICE_ID  — EmailJS service ID
 *   EMAILJS_TEMPLATE_ID — EmailJS template ID
 *   EMAILJS_PRIVATE_KEY — EmailJS account private key (STRICT MODE / abuse 방어).
 *                         EmailJS Dashboard → Account → Security 에서 "Use Private Key"
 *                         (non-browser API에 private key 강제) 활성화 후, 발급된 private key를
 *                         `wrangler secret put EMAILJS_PRIVATE_KEY` 로 등록.
 *                         이게 설정되면 과거 git 히스토리에 노출된 public key/service/template id
 *                         만으로는 발송이 불가능해져 노출이 무력화됨. (미설정 시 기존 동작 유지)
 *   ALLOWED_ORIGIN      — e.g. "https://kgg2512.github.io" (CORS)
 *
 * 보안(T-06 rate limiting / 비용폭탄 방어): CORS는 브라우저만 강제하므로 curl 등 비브라우저
 *   클라이언트엔 무의미하다(서버 게이트 아님). 아래 per-IP 슬라이딩 윈도우 + 전역 캡으로 EmailJS
 *   쿼터 고갈·이메일 폭탄을 실제로 제한한다. CF-Connecting-IP는 Cloudflare가 세팅하는 신뢰 헤더.
 *   ※ in-isolate 메모리라 isolate 수명 내에서만 유지(경계 초과 시 KV/Durable Object로 승격) —
 *     그래도 단일 소스 반복 버스트라는 최빈 남용 패턴은 차단한다. 배포 시 Turnstile 병행 권장.
 */

// per-IP 슬라이딩 윈도우 (isolate 로컬)
const RL_WINDOW_MS = 10 * 60 * 1000;   // 10분
const RL_MAX_PER_IP = 5;               // IP당 10분 5회
const RL_GLOBAL_MAX = 200;             // 전역 10분 200회(폭주 백스톱)
const _hits = new Map();               // ip -> number[] (timestamps)
let _global = [];

function rateLimited(ip, now) {
  _global = _global.filter((t) => now - t < RL_WINDOW_MS);
  if (_global.length >= RL_GLOBAL_MAX) return true;
  const arr = (_hits.get(ip) || []).filter((t) => now - t < RL_WINDOW_MS);
  if (arr.length >= RL_MAX_PER_IP) { _hits.set(ip, arr); return true; }
  arr.push(now); _hits.set(ip, arr); _global.push(now);
  if (_hits.size > 5000) _hits.clear();   // 메모리 상한(장기 실행 방어)
  return false;
}

export default {
  async fetch(request, env) {
    // ── CORS preflight ────────────────────────────────────────────────────
    const origin = request.headers.get('Origin') || '';
    const allowedOrigin = env.ALLOWED_ORIGIN || 'https://kgg2512.github.io';

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(allowedOrigin),
      });
    }

    // ── Only accept POST /send ────────────────────────────────────────────
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/send') {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(allowedOrigin) },
      });
    }

    // ── Rate limit (T-06): per-IP 슬라이딩 윈도우 + 전역 캡 ────────────────
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (rateLimited(ip, Date.now())) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': '600', ...corsHeaders(allowedOrigin) },
      });
    }

    // ── Parse body ────────────────────────────────────────────────────────
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(allowedOrigin) },
      });
    }

    // ── Validate required fields from client ─────────────────────────────
    const { to_email, code } = body;
    if (!to_email || !code) {
      return new Response(JSON.stringify({ error: 'Missing to_email or code' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(allowedOrigin) },
      });
    }

    // ── Basic email format check (server-side) ───────────────────────────
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to_email)) {
      return new Response(JSON.stringify({ error: 'Invalid email format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(allowedOrigin) },
      });
    }

    // ── Credentials come from env vars, never from client ─────────────────
    const payload = {
      service_id: env.EMAILJS_SERVICE_ID,
      template_id: env.EMAILJS_TEMPLATE_ID,
      user_id: env.EMAILJS_PUBLIC_KEY,
      // STRICT MODE: private key가 설정돼 있으면 accessToken으로 전달.
      // EmailJS가 "Use Private Key"로 강제돼 있을 때 필수이며, 이게 있으면
      // public key 단독(=git 히스토리 노출분)으로는 발송이 거부된다.
      ...(env.EMAILJS_PRIVATE_KEY ? { accessToken: env.EMAILJS_PRIVATE_KEY } : {}),
      template_params: {
        to_email,
        code,
      },
    };

    // ── Forward to EmailJS REST API ───────────────────────────────────────
    let ejsRes;
    try {
      ejsRes = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'EmailJS unreachable', detail: String(err) }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(allowedOrigin) },
      });
    }

    const ejsText = await ejsRes.text();

    return new Response(ejsText, {
      status: ejsRes.status,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(allowedOrigin),
      },
    });
  },
};

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
