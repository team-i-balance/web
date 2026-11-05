"""콘솔 개발 서버: 정적 파일 + /api/* → 백엔드 프록시 (표준 라이브러리만).

백엔드 CORS 가 콘솔 주소를 허용하지 않아도, 같은 출처의 /api 로 부르면 이 서버가 대신 전달한다.
Vercel 에서는 vercel.json 의 rewrites 가 같은 일을 한다.

    BACKEND_URL=http://13.193.207.69:8501 python3 tools/dev_server.py [포트=5320]
"""
import http.server
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = os.getenv("BACKEND_URL", "http://13.193.207.69:8501").rstrip("/")
PASS_HEADERS = ("content-type", "accept")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def _proxy(self):
        url = BACKEND + self.path[len("/api"):]
        body = None
        if self.command in ("POST", "PUT", "PATCH"):
            body = self.rfile.read(int(self.headers.get("content-length") or 0))
        req = urllib.request.Request(url, data=body, method=self.command,
                                     headers={k: v for k, v in self.headers.items() if k.lower() in PASS_HEADERS})
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                status, headers, data = r.status, r.headers, r.read()
        except urllib.error.HTTPError as e:
            status, headers, data = e.code, e.headers, e.read()
        except Exception as e:  # 백엔드에 닿지 못함
            status, headers, data = 502, {}, f'{{"detail":"backend unreachable: {type(e).__name__}"}}'.encode()
        self.send_response(status)
        self.send_header("Content-Type", headers.get("Content-Type", "application/json"))
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.startswith("/api/"):
            return self._proxy()
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/"):
            return self._proxy()
        self.send_error(405)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5320
    print(f"콘솔 http://localhost:{port}  →  /api → {BACKEND}")
    http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
