"""
Backend Spawner

Responsible for launching and killing Python processes.
"""

import subprocess, sys

from BaseHTTPServer import BaseHTTPRequestHandler, HTTPServer

def run(port):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == '/spawn':
                print ctype, pdict
                self.send_response(200)
                self.end_headers()
                self.wfile.write('49596')
            elif self.path == '/kill':
                self.send_response(200)
                self.end_headers()
            else:
                self.send_error(404,'File Not Found: %s' % self.path)

    server  = HTTPServer(('', port), Handler)
    server.serve_forever()

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print "Usage: %s PORT"%sys.argv[0]
        sys.exit(1)
    run(int(sys.argv[1]))
    
