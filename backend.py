"""
Backend Workspace Server

There is no polling at all.  

   1. HTTP server, with two functions:
      - /execpath (GET) -- returns the execpath temporary directory
        where the Python process is running.
      - / (POST) with variable 'cells' -- JSON that describes the
        cells to execute.
   2. Compute mode (disables HTTP server):
      - reports output messages when computing cells to output_url
      - reports done with all cells so far and gets more cells to
        execute from finished_url.

It starts in mode 1, then goes to mode 2 when it gets an appropriate
POST request.  It stays in mode 2 so long as it is working very hard
actually doing something.  It does ask the frontend for more cells
to evaluate, but only when it just finished all cells in the queue,
and if there isn't more to evaluate, then no further "polling" occurs;
nothing happens until the POST in 1 occurs. 
"""

# TODO: to avoid one user messing up all the backends, we would need
# to make it so the backend ignores POST requests that aren't
# digitally signed by the frontend.

import cgi, json, os, sys

from BaseHTTPServer import BaseHTTPRequestHandler, HTTPServer

from session import SimpleStreamingSession

from misc import get, post
    
##############################
# compute session object
##############################

class ComputeSession(object):
    def __init__(self, port, finished_url, output_url):
        
        class Handler(BaseHTTPRequestHandler):
            session = self
            def do_GET(self):
                if self.path == '/execpath':
                    self.send_response(200)
                    self.send_header('Content-type', 'text/html')
                    self.end_headers()
                    self.wfile.write(Handler.session._session._execpath)
                else:
                    self.send_error(404,'File Not Found: %s' % self.path)
                    
            def do_POST(self):
                try:
                    ctype, pdict = cgi.parse_header(self.headers.getheader('content-type'))
                    if ctype == 'application/x-www-form-urlencoded':
                        length = int(self.headers.getheader('content-length'))
                        postvars = cgi.parse_qs(self.rfile.read(length), keep_blank_values=1)
                    else:
                        postvars = {}
                    Handler.session._postvars = postvars
                    self.send_response(200)
                    self.end_headers()
                    self.wfile.write('ok')
                except IOError, msg:
                    self.send_error(404,'File Not Found: %s' % self.path)
                    
        self._finished_url = finished_url
        self._output_url   = output_url
        self._port         = port
        self._server       = HTTPServer(('', self._port), Handler)
        self._session      = SimpleStreamingSession(
                             0, lambda msg: self.output(msg),
                             execpath=os.path.abspath(os.curdir))

    def execute_cells(self, cells):
        """
        Execute each cell in the list of cells.
        """
        # TODO: we are ignoring the double check of cell['exec_id']. Find a way to use it. 
        for cell in cells:
            self._session.execute(str(cell['code']))

    def run(self):
        """
        Start the main loop of the backend.  The backend waits for an
        HTTP POST request with a 'cells' variable, that contains a
        JSON message that describes a collection of cells to evaluate.
        It then evaluates all of them, sending the results to the
        frontend.  When it has finished evaluating all cells, it tells
        the frontend it is done, and gets back possibly more cells to
        evaluate; if no new cells are returned it switches back to
        server mode and waits for another HTTP POST request with a
        list of cells to evaluate.
        """
        while True:
            self._postvars = {}
            # Stage 1
            self._server.handle_request()
            # Do we switch to sage 2?
            if self._postvars.has_key('cells'):
                # the request resulted in a POST request with code to execute
                self.execute_cells(json.loads(self._postvars['cells'][0]))
                # Next, get more cells to evaluate, if there are some:
                while True:
                    msg = json.loads(get(self._finished_url))
                    if msg['status'] == 'done':
                        break
                    self.execute_cells(msg['cells'])
                # no more tasks: we go back to top of while loop and
                # which means switching back into webserver state

                
    def output(self, msg):
        """
        Sends the given msg to the output_url via POST.  This is how
        this backend sends output to the frontend.

        INPUT:
        - ``msg`` -- a dictionary 
        """
        # TODO: msg should be JSON?  that would be more flexible and uniform.
        post(self._output_url, msg, timeout=10)
            

if __name__ == '__main__':
    if len(sys.argv) != 4:
        print "Usage: %s PORT FINISHED_URL OUTPUT_URL"%sys.argv[0]
        sys.exit(1)
    port         = int(sys.argv[1])
    finished_url = sys.argv[2]
    output_url   = sys.argv[3]
    
    S = ComputeSession(port, finished_url, output_url)
    S.run()
    
