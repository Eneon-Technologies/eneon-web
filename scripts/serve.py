#!/usr/bin/env python3
"""Local preview server with clean URLs, matching production hosting.

/contact serves contact.html, /contact.html redirects to /contact, and unknown
paths get 404.html with a 404 status. Usage: ./scripts/serve.py [port]
"""
import http.server
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class CleanUrlHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        path, _, query = self.path.partition("?")
        if path.endswith(".html"):
            clean = "/" if path == "/index.html" else path[: -len(".html")]
            self.send_response(301)
            self.send_header("Location", clean + ("?" + query if query else ""))
            self.end_headers()
            return
        local = os.path.join(ROOT, path.lstrip("/"))
        if path != "/" and not os.path.splitext(path)[1] and os.path.isfile(local.rstrip("/") + ".html"):
            self.path = path.rstrip("/") + ".html" + ("?" + query if query else "")
        elif path != "/" and not os.path.exists(local):
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            with open(os.path.join(ROOT, "404.html"), "rb") as page:
                self.wfile.write(page.read())
            return
        super().do_GET()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f"Serving {ROOT} at http://localhost:{port}")
    http.server.ThreadingHTTPServer(("", port), CleanUrlHandler).serve_forever()
