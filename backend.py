"""
Backend Compute Process

The backend has two states that it switches back and forth between as
explained below. 

   *  WAIT STATE: HTTP server that handles one kind of request:
      - / (POST) with variable 'cells' -- JSON that describes the
        cells to execute.
            |                  /|\
            |                   |
      start computing           |
            |              done computing
           \|/                  |
   * COMPUTE STATE: 
      - http server disabled
      - reports output to sys.std* via POST to output_url, as they appear
      - reports on files that are created or modified
      - reports done with all cells so far and gets more cells to
        execute via a GET request to finished_url.

The backend starts in the compute state.  The backend stays in the
compute state so long as it is working on computations, reporting
results, and getting back more input to execute.  When the backend
finishes computing all cells in the queue, and the server reports that
there is nothing more to execute, the backend switches to the wait
state.
"""

import cgi, json, os, sys, time
from BaseHTTPServer import BaseHTTPRequestHandler, HTTPServer

from session import SimpleStreamingSession
from misc import get, post, is_temp_directory
    
##############################
# compute session object
##############################

class ComputeSession(object):
    """
    EXAMPLES::
    
        >>> import backend
        >>> import tempfile; os.chdir(tempfile.mkdtemp())  # IMPORTANT
        >>> CS = backend.ComputeSession(5000, 'finished_url', 'output_url')
        >>> del CS._server
    """
    def __init__(self, port, finished_url, output_url):
        """
        INPUT:

        - ``port`` -- positive integer
        - ``finished_url`` -- string; do GET request on this url when
          backed server is done with all computations
        - ``output_url`` -- string; do POST request here to report on
          output and modified or created files
        """
        execpath = os.path.abspath(os.curdir)
        # protection against doing something stupid and hosing files
        assert is_temp_directory(execpath), '"%s" must be a temporary directory'%execpath   

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

        max_tries = 20 # TODO: ugly
        for i in range(max_tries):
            try:
                self._server = HTTPServer(('', self._port), Handler)
                break
            except Exception, msg:
                #TODO: for testing only
                open('/tmp/port_issue','a').write("trying again to start on port %s (%s)..."%(self._port, msg))
                time.sleep(0.1)
            
        self._session      = SimpleStreamingSession(
                             0, lambda msg: self.output(msg),
                             execpath=execpath)

    def execute_cells(self, cells):
        r"""
        Execute each cell in the list of cells.

        INPUT:

        - ``cells`` -- list of cells, where a "cell" is a dictionary that
          has a 'code' key.q

        EXAMPLES::

            >>> import misc, backend; backend.post = misc.fake_post
            >>> here = os.path.abspath('.')
            >>> import tempfile; os.chdir(tempfile.mkdtemp())  # IMPORTANT
            >>> CS = backend.ComputeSession(5000, 'finished_url', 'output_url')
            >>> CS.execute_cells([{'code':'print(2+3)'}, {'code':'print(5*3)'}])
            POST: ('output_url', {'output': '5\n', 'cell_id': 0, 'done': False, 'modified_files': []}) [('timeout', 10)]
            POST: ('output_url', {'cell_id': 0, 'done': True}) [('timeout', 10)]
            POST: ('output_url', {'output': '15\n', 'cell_id': 1, 'done': False, 'modified_files': []}) [('timeout', 10)]
            POST: ('output_url', {'cell_id': 1, 'done': True}) [('timeout', 10)]
            >>> del CS._server  # shutdown HTTP server
            >>> os.chdir(here)
        """
        # TODO: we are ignoring the double check of cell['cell_id']. Find a way to use it. 
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
##         while True:
##             self._postvars = {}
##             # Enter WAIT STATE:
##             self._server.handle_request()
##             if self._postvars.has_key('cells'):
##                 # Enter COMPUTE STATE:
##                 # the request resulted in a POST request with code to execute
##                 self.execute_cells(json.loads(self._postvars['cells'][0]))
##                 # Next, get more cells to evaluate, if there are some:
##                 while True:
##                     msg = json.loads(get(self._finished_url))
##                     if msg['status'] == 'done':
##                         break
##                     self.execute_cells(msg['cells'])
##                 # No more tasks, so we switch back to WAIT STATE

        while True:
            # COMPUTE STATE:
            while True:
                msg = json.loads(get(self._finished_url))
                if msg['status'] != 'done':
                    self.execute_cells(msg['cells'])
                else:
                    break

            # WAIT STATE:
            self._postvars = {}
            self._server.handle_request()

            if self._postvars.has_key('cells'):
                # COMPUTE STATE:
                # the request resulted in a POST request with code to execute
                self.execute_cells(json.loads(self._postvars['cells'][0]))

            # and now back up to the top to compute some more....
            
                
                
    def output(self, msg):
        """
        Sends the given msg to the output_url via POST.  This is how
        the backend sends output to the frontend.

        INPUT:
        
        - ``msg`` -- a dictionary

        EXAMPLES::

            >>> import misc, backend; backend.post = misc.fake_post
            >>> here = os.path.abspath('.')
            >>> import tempfile; os.chdir(tempfile.mkdtemp())  # IMPORTANT
            >>> CS = backend.ComputeSession(5000, 'finished_url', 'output_url')
            >>> CS.output({'test':'message'})
            POST: ('output_url', {'test': 'message'}) [('timeout', 10)]
            >>> del CS._server  # shutdown HTTP server
            >>> os.chdir(here)
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
    
