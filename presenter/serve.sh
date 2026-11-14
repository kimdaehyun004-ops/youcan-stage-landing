#!/usr/bin/env bash
# 유캔 프리젠터 로컬 서버
# localhost 는 브라우저가 "보안 컨텍스트"로 취급하므로 화면 캡처/창 관리 권한이 정상 동작한다.
# (file:// 로 열면 ES 모듈·getDisplayMedia·getScreenDetails 가 모두 막힌다)
set -euo pipefail
PORT="${1:-8123}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "→ http://localhost:${PORT}/presenter/  (Chrome/Edge 권장)"
cd "$ROOT"
exec python3 -m http.server "$PORT" --bind 127.0.0.1
