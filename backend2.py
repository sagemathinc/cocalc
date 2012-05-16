"""
Backend Compute Process

Tornado + TorandIO2 application.
"""

import logging, os, sys, time
from tornado import web
from tornadio2 import SocketConnection, TornadioRouter, SocketServer, event

FLUSH_SIZE = 8092; FLUSH_INTERVAL = 0.1

ROOT = os.path.abspath(os.path.normpath(os.path.dirname(__file__)))
print ROOT

class IndexHandler(web.RequestHandler):
    def get(self):
        self.render(os.path.join(ROOT, 'templates/backend_index.html'))

class BroadcastStream(object):
    def __init__(self, connection, stream, selector):
        self._connection = connection
        self._stream = stream
        self._selector = selector
        self._first = True
        
    def __call__(self, s):
        self._connection.broadcast(self._stream, self._selector, s, self._first)
        if self._first:
            self._first = False

class OutputStream(object):
    def __init__(self, f, flush_size=FLUSH_SIZE, flush_interval=FLUSH_INTERVAL):
        self._f = f
        self._buf = ''
        self._last_flush = 0
        self._flush_size = flush_size
        self._last_flush_time = time.time()
        self._flush_interval = flush_interval

    def write(self, output):
        self._buf += output
        t = time.time()
        if ((len(self._buf) - self._last_flush >= self._flush_size) or
                            (t - self._last_flush_time >= self._flush_interval)):
            self.flush()
            self._last_flush = len(self._buf)
            self._last_flush_time = t

    def write0(self, output):
        self._buf += output
        t = time.time()
        if (len(self._buf) - self._last_flush >= self._flush_size):
            self.flush()
            self._last_flush = len(self._buf)

    def flush(self):
        self._f(self._buf)
        self._buf = ''

def output_streams(connection, selector):
    return tuple([OutputStream(BroadcastStream(connection, s, selector)) for s in ['stdout', 'stderr']])
    

namespace = {}
try:
    exec "from sage.all_cmdline import *" in namespace
except Exception, msg:
    print msg
    print "Sage not available."
    pass

class SageWS(object):
    def __init__(self, selector, code, connection):
        self._selector = selector
        self._code = code
        self._connection = connection
        
    def mesg(self, value):
        self._connection.broadcast('mesg', self._selector, value)

    def javascript(self, code):
        self.mesg({'type':'javascript', 'value':code})
    
class ExecuteConnection(SocketConnection):
    clients = set()
    
    def on_open(self, *args, **kwargs):
        self.clients.add(self)
        print "new connection: %s"%self

    def broadcast(self, *args, **kwds):
        for c in self.clients:
            c.emit(*args, **kwds)

    def broadcast_other(self, *args, **kwds):
        for c in self.clients:
            if c != self:
                c.emit(*args, **kwds)

    @event
    def set_other(self, selector, value):
        self.broadcast_other('set', selector, value)

    @event
    def stdout_other(self, selector, value, replace):
        self.broadcast_other('stdout', selector, value, replace)
        
    @event
    def mesg_other(self, selector, value):
        self.broadcast_other('mesg', selector, value)

    @event
    def stderr_other(self, selector, value, replace):
        self.broadcast_other('stderr', selector, value, replace)

    @event
    def done_other(self, selector):
        self.broadcast_other('done', selector)

    @event
    def start_other(self, selector):
        self.broadcast_other('start', selector)

    @event
    def execute(self, selector, code):
        streams = (sys.stdout, sys.stderr)
        bstreams = output_streams(self, selector)
        (sys.stdout, sys.stderr) = bstreams
        namespace['sagews'] = SageWS(selector, code, self)
        self.start_other(selector) # TODO: what if client is slow?  would that make this slow?
        try:
            exec code in namespace
        except:
            bstreams[1].write(repr(sys.exc_info()[1]))
        finally:
            bstreams[0].flush(); bstreams[1].flush()
            (sys.stdout, sys.stderr) = streams
            self.broadcast('done', selector)

def run(port, debug):
    if debug:
        logging.getLogger().setLevel(logging.DEBUG)
    router = TornadioRouter(ExecuteConnection)
    SocketServer(web.Application(
        router.apply_routes([(r"/", IndexHandler),
                             (r"/static/(.*)", web.StaticFileHandler,
                              {'path':os.path.join(ROOT ,'static')}),
                             ]),
        flash_policy_port = 843,
        flash_policy_file = os.path.join(ROOT, 'flashpolicy.xml'),
        socket_io_port = port,
        debug=debug
    ))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print "Usage: %s PORT [DEBUG]"%sys.argv[0]
        sys.exit(1)
    port = int(sys.argv[1])
    if len(sys.argv) >= 3:
        debug = eval(sys.argv[2])
    else:
        debug = False
    run(port, debug)
