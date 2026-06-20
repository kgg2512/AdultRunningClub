# Digital Asset Links

assetlinks.json은 TWA(Trusted Web Activity) 검증을 위해 필요합니다.
이 파일은 https://kgg2512.github.io/.well-known/assetlinks.json 에 위치해야 합니다.
즉, kgg2512/kgg2512.github.io 루트 레포에도 동일 파일을 배포해야 합니다.

SHA-256 교체 방법:
1. Google Play Console -> 앱 -> 설정 -> 앱 서명
2. "앱 서명 인증서" 섹션의 SHA-256 인증서 지문 복사
3. 위 JSON의 REPLACE_WITH_SHA256_FROM_PLAY_CONSOLE_MANAGED_SIGNING 대체
