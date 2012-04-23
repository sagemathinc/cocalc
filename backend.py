"""
Backend Compute Process

The backend has wait and compute states that it switches back and
forth between as explained below.

   1. WAIT STATE: HTTP server that handles one kind of request:
      - / (POST) with variable 'cells' -- JSON that describes the
        cells to execute.
            |                  /|\
            |                   |
      start computing           |
            |              done computing
           \|/                  |
   2. COMPUTE STATE: 
      - http server disabled
      - reports output to sys.std* via POST to output_url, as they appear
      - reports on files that are created or modified
      - reports done with all cells so far and gets more cells to
        execute via a GET request to finished_url.

The backend starts in the wait state, then switches to the compute
when it gets a POST request.  The backend stays in the compute state
so long as it is working on computations, reporting results, and
getting back more input to execute.  When the backend finishes
computing all cells in the queue, and the server reports that there is
nothing more to execute, the backend switches back to the wait state.
"""

import cgi, json, os, sys
from BaseHTTPServer import BaseHTTPRequestHandler, HTTPServer

from session import SimpleStreamingSession
from misc import get, post
    
##############################
# compute session object
##############################

class ComputeSession(object):
    def __init__(self, port, finished_url, output_url):
        """
        INPUT:

        - ``port`` -- positive integer
        - ``finished_url`` -- string; do GET request on this url when
          backed server is done with all computations
        - ``output_url`` -- string; do POST request here to report on
          output and modified or created files
        """

        # Define an HTTP server to implement the WAIT STATE.  We do not
        # use flask since (1) it is a bit heavy, and (2) we only want
        # to handle exactly one request, and I don't know how to do that
        # with flask.
        class Handler(BaseHTTPRequestHandler):
            session = self
            # The *only* thing we handle is POST to /.  Anything else is an error.
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

        execpath = os.path.abspath(os.curdir)
        # some protection against doing something stupid.
        assert 'tmp' in execpath  # this is little consolation, but is a good idea
        assert len(os.listdir(execpath)) == 0 # this is very good.

        assert False
        self._session      = SimpleStreamingSession(
                             0, lambda msg: self.output(msg),
                             execpath=execpath)

    def execute_cells(self, cells):
        """
        Execute each cell in the list of cells.

        INPUT:

        - ``cells`` -- list of cells, where a "cell" is a dictionary that has a 'code' key.q

        EXAMPLES::

        
        """
        # TODO: we are ignoring the double check of cell['exec_id']. Find a way to use it. 
        for cell in cells:
            self._session.execute(str(cell['code']))

    def run(self):
        """
        Start the main loop of the backend.  The backend waits for an
        HTTP POST request with a 'cells' variable, that contains a
        JSON message that describes a collection of cells to execute.
        It then executes all of them, sending the results to the
        frontend.  When it has finished evaluating all cells, it tells
        the frontend it is done, and gets back possibly more cells to
        execute; if no new cells are returned it switches back to
        server mode and waits for another HTTP POST request with a
        list of cells to execute.
        """
        while True:
            self._postvars = {}
            # Enter WAIT STATE:
            self._server.handle_request()
            if self._postvars.has_key('cells'):
                # Enter COMPUTE STATE:
                # the request resulted in a POST request with code to execute
                self.execute_cells(json.loads(self._postvars['cells'][0]))
                # Next, get more cells to evecute, if there are some:
                while True:
                    msg = json.loads(get(self._finished_url))
                    if msg['status'] == 'done':
                        break
                    self.execute_cells(msg['cells'])
                # No more tasks, so we switch back to WAIT STATE
                
    def output(self, msg):
        """
        Sends the given msg to the output_url via POST.  This is how
        the backend sends output to the frontend.

        INPUT:
        
        - ``msg`` -- a dictionary

        EXAMPLES::

            >>> def f(*args, **kwds): print 'POST', args, kwds
            ...
            >>> import misc, backend; backend.post = f
            >>> import tempfile; os.chdir(tempfile.mkdtemp())  # IMPORTANT
            >>> CS = backend.ComputeSession(5000, 'finished_url', 'output_url')
            >>> CS.output({'test':'message'})
            POST ('output_url', {'test': 'message'}) {'timeout': 10}
        """
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
    
