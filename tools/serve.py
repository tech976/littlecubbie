"""Local preview server that never lets the browser cache files (so edits show up on refresh)."""
import functools, http.server, os, sys

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "site")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5180

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

http.server.ThreadingHTTPServer(("127.0.0.1", PORT), functools.partial(NoCache, directory=ROOT)).serve_forever()
