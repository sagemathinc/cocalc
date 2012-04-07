import cgi
from BaseHTTPServer import BaseHTTPRequestHandler, HTTPServer

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            ctype, pdict = cgi.parse_header(self.headers.getheader('content-type'))
            print ctype
            if ctype == 'application/x-www-form-urlencoded':
                length = int(self.headers.getheader('content-length'))
                self.postvars = cgi.parse_qs(self.rfile.read(length), keep_blank_values=1)
            else:
                self.postvars = {}
            self.send_response(200)
            self.end_headers()
            self.wfile.write('ok')
        except IOError:
            self.send_error(404,'File Not Found: %s' % self.path)

class ComputeSession(object):
    def __init__(self, port, work_url, output_url):
        self._port = port
        self._work_url = work_url
        self._output_url = output_url
        self._server = HTTPServer(('', port), Handler)
        #self._session = SimpleStreamingSession(0, lambda msg: self.output(msg))

    def run(self):
        self._server.postvars = {}
        self._server.handle_request()
        print self._server.postvars
        if self._server.postvars.has_key('code'):
            # the request resulted in a POST request with code to execute
            pass

import urllib, urllib2
def post(url, data, read=False):
    """
    POST the dictionary of data to the url.  If read=True return the
    response from the server.
    """
    r = urllib2.urlopen(urllib2.Request(url, urllib.urlencode(data)))
    if read:
        return r.read()
    
    
    
            
        


