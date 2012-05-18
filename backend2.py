"""
Backend Compute Process

Tornado + TorandIO2 application.
"""

import logging, os, string, sys, time, traceback

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
    import sage.all_cmdline
    exec "from sage.all_cmdline import *" in namespace
except Exception, msg:
    print msg
    print "Sage not available."
    pass

# this is copied then modified (to include #) from
# sage/misc/preparser.py -- I and/or Robert Bradshaw probably wrote
# it.  See big tests/docstring there.
def strip_string_literals(code, state=None):
    new_code = []
    literals = {}
    counter = 0
    start = q = 0
    if state is None:
        in_quote = False
        raw = False
    else:
        in_quote, raw = state
    while True:
        sig_q = code.find("'", q)
        dbl_q = code.find('"', q)
        hash_q = code.find('#', q)
        q = min(sig_q, dbl_q)
        if q == -1: q = max(sig_q, dbl_q)
        if not in_quote and hash_q != -1 and (q == -1 or hash_q < q):
            # it's a comment
            newline = code.find('\n', hash_q)
            if newline == -1: newline = len(code)
            counter += 1
            label = "L%s" % counter
            literals[label] = code[hash_q:newline]   # changed from sage
            new_code.append(code[start:hash_q].replace('%','%%'))
            new_code.append("%%(%s)s" % label)
            start = q = newline
        elif q == -1:
            if in_quote:
                counter += 1
                label = "L%s" % counter
                literals[label] = code[start:]
                new_code.append("%%(%s)s" % label)
            else:
                new_code.append(code[start:].replace('%','%%'))
            break
        elif in_quote:
            if code[q-1] == '\\':
                k = 2
                while code[q-k] == '\\':
                    k += 1
                if k % 2 == 0:
                    q += 1
            if code[q:q+len(in_quote)] == in_quote:
                counter += 1
                label = "L%s" % counter
                literals[label] = code[start:q+len(in_quote)]
                new_code.append("%%(%s)s" % label)
                q += len(in_quote)
                start = q
                in_quote = False
            else:
                q += 1
        else:
            raw = q>0 and code[q-1] in 'rR'
            if len(code) >= q+3 and (code[q+1] == code[q] == code[q+2]):
                in_quote = code[q]*3
            else:
                in_quote = code[q]
            new_code.append(code[start:q].replace('%', '%%'))
            start = q
            q += len(in_quote)
    
    return "".join(new_code), literals, (in_quote, raw)

def divide_into_blocks(code):
    code, literals, state = strip_string_literals(code)
    code = code.splitlines()
    i = len(code)-1
    blocks = []
    while i >= 0:
        stop = i
        while i>=0 and len(code[i]) > 0 and code[i][0] in string.whitespace:
            i -= 1
        # remove comments 
        for k, v in literals.iteritems():
            if v.startswith('#'):
                literals[k] = ''
        block = ('\n'.join(code[i:]))%literals
        bs = block.strip()
        if bs: # has to not be only whitespace
            blocks.insert(0, (i, stop, bs))
        code = code[:i]
        i = len(code)-1
    #print blocks
    return blocks

class SageWS(object):
    def __init__(self, selector, code, connection):
        self.selector = selector
        self.code = code
        self.connection = connection
        
    def mesg(self, value):
        self.connection.broadcast('mesg', self.selector, value)

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
    def execute(self, selector, code, preparse):
        streams = (sys.stdout, sys.stderr)
        bstreams = output_streams(self, selector)
        (sys.stdout, sys.stderr) = bstreams
        if preparse:
            code = sage.all_cmdline.preparse(code)
        namespace['sagews'] = SageWS(selector, code, self)
        self.start_other(selector) # TODO: what if client is slow?  would that make this slow?
        try:
            for start, stop, block in divide_into_blocks(code):
                exec compile(block, '', 'single') in namespace
        except:
            sys.stderr.write('Error in lines %s-%s\n'%(start+1, stop+1))
            traceback.print_exc()
        finally:
            bstreams[0].flush(); bstreams[1].flush()
            (sys.stdout, sys.stderr) = streams
            self.broadcast('done', selector)

def run(port, address, debug):
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
        socket_io_address = address, 
        debug=debug
    ))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print "Usage: %s PORT [ADDRESS] [DEBUG]"%sys.argv[0]
        sys.exit(1)
    port = int(sys.argv[1])

    if len(sys.argv) >= 3:
        print sys.argv[2]
        address = sys.argv[2]
    else:
        address = '127.0.0.1'
        
    if len(sys.argv) >= 4:
        debug = eval(sys.argv[3])
    else:
        debug = True
        
    run(port, address, debug)
