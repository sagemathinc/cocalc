

import cgi, sys, urllib, urllib2
from BaseHTTPServer import BaseHTTPRequestHandler, HTTPServer

from simple import SimpleStreamingSession

def post(url, data, read=False):
    """
    POST the dictionary of data to the url.  If read=True return the
    response from the server.
    """
    r = urllib2.urlopen(urllib2.Request(url, urllib.urlencode(data)))
    if read:
        return r.read()
    
##############################
# compute session object
##############################

class ComputeSession(object):
    def __init__(self, url, frontend_url, output_url, execpath):
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
                except IOError:
                    self.send_error(404,'File Not Found: %s' % self.path)
        self._url = url
        self._frontend_url = frontend_url
        self._output_url = output_url
        port = int(url.split(':')[-1])
        # TODO: the '' in the next line is probably wrong
        self._server  = HTTPServer(('', int(port)), Handler)
        self._session = SimpleStreamingSession(
                          0, lambda msg: self.output(msg), execpath=execpath)

    def run(self):
        while True:
            print "waiting to handle a request: %s"%self._url
            self._postvars = {}
            self._server.handle_request()
            print self._postvars
            if self._postvars.has_key('code'):
                # the request resulted in a POST request with code to execute
                code = self._postvars['code'][0]
                print "code = ", code
                self._session.execute(code)
                # done
                urllib2.urlopen(self._frontend_url).read()

    def output(self, msg):
        post(self._output_url, msg)
            

        


if __name__ == '__main__':
    if len(sys.argv) != 5:
        print "Usage: %s URL FRONTEND_URL OUTPUT_URL EXEC_PATH"%sys.argv[0]
        sys.exit(1)
    url          = sys.argv[1]
    frontend_url = sys.argv[2]
    output_url   = sys.argv[3]
    execpath     = sys.argv[4]
    S = ComputeSession(url, frontend_url, output_url, execpath)
    S.run()
    
