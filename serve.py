"""
Lokal server för ledningssidan.

  python serve.py          → http://localhost:5174

Som `python -m http.server`, men med "no-cache" så att webbläsaren alltid hämtar senaste app.js
(annars kan den köra en gammal modul efter en ändring).
"""
import http.server
import mimetypes
import sys
from pathlib import Path

mimetypes.add_type("text/javascript", ".js")   # Windows register kan säga text/plain, då vägrar moduler att laddas
mimetypes.add_type("image/webp", ".webp")
SITE = Path(__file__).resolve().parent
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5174


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SITE), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    print(f"http://localhost:{PORT}")
    http.server.ThreadingHTTPServer(("", PORT), Handler).serve_forever()
