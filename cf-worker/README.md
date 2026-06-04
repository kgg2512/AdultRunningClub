# ARC Email Proxy — Cloudflare Worker 배포 가이드

## 목적
EmailJS credentials(service_id, template_id, publicKey)를 클라이언트 소스코드에서 완전 분리.
CF Worker가 프록시 역할을 하며, 실제 credentials는 Worker 환경변수(Secret)에만 저장됨.

---

## 1. 사전 준비
- Cloudflare 계정 (무료 티어 가능)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) 설치:
  ```
  npm install -g wrangler
  wrangler login
  ```

---

## 2. wrangler.toml 생성

`cf-worker/` 폴더 내에 `wrangler.toml` 파일을 아래 내용으로 생성:

```toml
name = "arc-email-proxy"
main = "email-proxy.js"
compatibility_date = "2024-01-01"
```

---

## 3. 환경변수(Secret) 등록

아래 명령을 하나씩 실행. 각 명령 실행 시 값 입력 프롬프트가 뜸:

```bash
wrangler secret put EMAILJS_PUBLIC_KEY
# 입력: xBoQd6PMFec8hCvVD

wrangler secret put EMAILJS_SERVICE_ID
# 입력: service_ayss3t8

wrangler secret put EMAILJS_TEMPLATE_ID
# 입력: inz0rw3

wrangler secret put ALLOWED_ORIGIN
# 입력: https://kgg2512.github.io
```

> Cloudflare Dashboard에서 직접 등록도 가능:
> Workers & Pages → arc-email-proxy → Settings → Variables and Secrets

---

## 4. Worker 배포

```bash
cd cf-worker
wrangler deploy
```

배포 완료 후 Worker URL이 출력됨:
```
https://arc-email-proxy.<your-subdomain>.workers.dev
```

---

## 5. index.html 연결

`index.html`에서 `YOUR_CF_WORKER_URL` 플레이스홀더를 실제 URL로 교체:

```javascript
// 변경 전
const CF_WORKER_URL = 'YOUR_CF_WORKER_URL';

// 변경 후 (예시)
const CF_WORKER_URL = 'https://arc-email-proxy.myname.workers.dev';
```

---

## 6. 테스트

브라우저에서 ARC 앱 열고 이메일 인증 플로우 실행.
Worker 로그는 Cloudflare Dashboard → Workers & Pages → arc-email-proxy → Logs 에서 확인.

---

## 무료 티어 한도
- 요청 수: 100,000회/일 (ARC 초기 트래픽 충분)
- 실행 시간: 10ms CPU/요청
- 비용: $0
