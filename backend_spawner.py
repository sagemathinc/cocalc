"""
Backend Spawner
"""

import subprocess

from BaseHTTPServer import BaseHTTPRequestHandler, HTTPServer

def run(port):
    class Handler(BaseHTTPRequestHandler):
         def do_GET(self):
            if self.path == '/spawn':
                self.send_response(200)
                self.send_header('Content-type', 'text/html')
                self.end_headers()
            elif self.path == '/kill':
                self.send_response(200)
                self.send_header('Content-type', 'text/html')
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
    
