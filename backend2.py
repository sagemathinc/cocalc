"""
Backend Compute Process

Tornado + TorandIO2 application.
"""

import json, logging, os, signal, string, StringIO, sys, time, traceback

from tornado import web
from tornadio2 import SocketConnection, TornadioRouter, SocketServer, event

FLUSH_SIZE = 8092; FLUSH_INTERVAL = 0.1

ROOT = os.path.abspath(os.path.normpath(os.path.dirname(__file__)))
print ROOT

class IndexHandler(web.RequestHandler):
    def get(self):
        self.render(os.path.join(ROOT, 'templates/backend_index.html'))

class SocketStream(object):
    def __init__(self, connection, stream, selector, broadcast):
        self._connection = connection
        self._stream = stream
        self._selector = selector
        self._first = True
        self._broadcast = broadcast
        
    def write(self, s):
        if self._broadcast:
            self._connection.broadcast(self._stream, self._selector, s, self._first)
        else:
            self._connection.emit(self._stream, self._selector, s, self._first)
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

    def getvalue(self):
        return self._f.getvalue()

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
        self._f.write(self._buf)
        self._buf = ''

def output_streams(connection, selector, broadcast, stream):
    if stream:
        v = [SocketStream(connection, s, selector, broadcast) for s in ['stdout', 'stderr']]
    else:
        v = [StringIO.StringIO() for s in ['stdout', 'stderr']]
    return tuple([OutputStream(s) for s in v])
    

namespace = {}
import sage.all_cmdline
exec "from sage.all_cmdline import *" in namespace

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
            blocks.insert(0, [i, stop, bs])
        code = code[:i]
        i = len(code)-1

    # merge try/except/finally blocks
    i = 1
    while i < len(blocks):
        s = blocks[i][-1].lstrip()
        if s.startswith('finally:') or s.startswith('except'):
            if blocks[i-1][-1].lstrip().startswith('try:'):
                blocks[i-1][-1] += '\n' + blocks[i][-1]
                blocks[i-1][1] = blocks[i][1]
            del blocks[i]
        else:
            i += 1
            
    return blocks

class SageWS(object):
    def __init__(self, selector, code, connection, state, extra_data):
        self.selector = selector
        self.code = code
        self.connection = connection
        self.state = state
        self.extra_data = extra_data
        
    def mesg(self, value):
        self.connection.broadcast('mesg', self.selector, value)

    def javascript(self, code):
        self.mesg({'type':'javascript', 'value':code})

state = {'cells':{}}
    
class ExecuteConnection(SocketConnection):
    clients = set()
    
    def on_open(self, *args, **kwargs):
        self.clients.add(self)
        print "new connection: %s"%self

    def broadcast(self, *args, **kwds):
        self.emit_to_backend(*args, **kwds)        
        for c in self.clients:
            c.emit(*args, **kwds)

    def broadcast_other(self, *args, **kwds):
        self.emit_to_backend(*args, **kwds)
        for c in self.clients:
            if c != self:
                c.emit(*args, **kwds)

    def emit_to_backend(self, tag, *args, **kwds):
        if tag == 'stdout':
            # TODO: ugly
            X = state['cells'][args[0]]
            X['stdout'] += args[1]

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
    def XXX_execute(self, selector, code, preparse):
        state['cells'][selector] = {'stdin':code, 'stdout':'', 'stderr':''}  # TODO: hack -- shouldn't be here
        streams = (sys.stdout, sys.stderr)
        bstreams = output_streams(self, selector, True, True)
        (sys.stdout, sys.stderr) = bstreams
        if preparse:
            code = sage.all_cmdline.preparse(code)
        namespace['sagews'] = SageWS(selector, code, self, state)
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

    @event
    def execute(self, selector, code, preparse, broadcast=True, stream=True, do_callback=True, extra_data=None):
        """
        INPUT:
        
        - selector -- string that output messages are tagged with
        - code -- string of python code to evaluate
        - preparse -- whether or not to preparse the code using the sage preparser
        - broadcast -- whether messages should be broadcast to all connected clients
        - stream -- whether output is streamed or sent as one big message at the end
        - do_callback -- if false (and stream=False), do not bother to emit/broadcast result

        If stream is false no start messages are sent -- the only
        message that is sent is at the very end with all output.
        """
        state['cells'][selector] = {'stdin':code, 'stdout':'', 'stderr':''}  # TODO: hack -- shouldn't be here
        
        streams = (sys.stdout, sys.stderr)
        bstreams = output_streams(self, selector, broadcast, stream)
        (sys.stdout, sys.stderr) = bstreams
        if preparse:
            code = sage.all_cmdline.preparse(code)
        namespace['sagews'] = SageWS(selector, code, self, state, extra_data)
        
        if stream and broadcast:
            self.start_other(selector) # TODO: what if client is slow?  would that make this slow?
        try:
            for start, stop, block in divide_into_blocks(code):
                exec compile(block, '', 'single') in namespace
        except:
            #TODO: what if there are no blocks?
            #sys.stderr.write('Error in lines %s-%s\n'%(start+1, stop+1))
            traceback.print_exc()
        finally:
            bstreams[0].flush(); bstreams[1].flush()
            (sys.stdout, sys.stderr) = streams
            if stream:
                if broadcast:
                    self.broadcast('done', selector)
                else:
                    self.emit('done', selector)
            else:
                if do_callback:
                    mesg = {'selector':selector, 'stdout':bstreams[0].getvalue(), 'stderr':bstreams[1].getvalue()}
                    if broadcast:
                        self.broadcast('execute', mesg)
                    else:
                        self.emit('execute', mesg)

    @event
    def blocking_eval(self, code, preparse):
        if preparse:
            code = sage.all_cmdline.preparse(code)
        try:
            output = eval(code, namespace)
            success = True
        except Exception, msg:
            output = msg
            success = False
        self.broadcast('blocking_eval', str(output), success)


# Keywords from http://docs.python.org/release/2.7.2/reference/lexical_analysis.html
_builtin_completions = __builtins__.__dict__.keys() + ['and', 'del', 'from', 'not', 'while', 'as', 'elif', 'global', 'or', 'with', 'assert', 'else', 'if', 'pass', 'yield', 'break', 'except', 'import', 'print', 'class', 'exec', 'in', 'raise', 'continue', 'finally', 'is', 'return', 'def', 'for', 'lambda', 'try']

def _completions(col_offset, lineno, preparse=True, jsonify=False, base64encoded=True):
    code = namespace['sagews'].extra_data
    z = code.splitlines()
    code = '\n'.join(z[:lineno-1]) + '\n' + z[lineno-1][:col_offset]
    # we could use the entire buffer, but for now restrict to the line
    result = []
    target = ''
    expr = ''
    if not code.splitlines()[lineno][:col_offset].isspace():
        try:
            code0, literals, state = strip_string_literals(code)
            # TODO: this has to be replaced by using ast on preparsed version.  Not easy.
            i = max([code0.rfind(t) for t in '\n;='])+1
            while i<len(code0) and code0[i] in string.whitespace:
                i += 1
            expr = code0[i:]%literals
            before_expr = code0[:i]%literals
            #sys.stderr.write('expr='+expr)
            #sys.stderr.write('before_expr='+before_expr)            
            if '.' not in expr and '(' not in expr and ')' not in expr and '?' not in expr:
                get_help = False
                target = expr
                v = [x for x in (namespace.keys() + _builtin_completions) if x.startswith(expr)]
            else:
                
                i = max([expr.rfind(s) for s in '?('])
                if i == len(expr)-1:
                    get_help = True
                    target = expr[i+1:]
                    obj = expr[:i]
                else:
                    get_help = False
                    i = expr.rfind('.')
                    target = expr[i+1:]
                    obj = expr[:i]
                    
                if obj in namespace:
                    O = namespace[obj]
                else:
                    # the more dangerous eval.
                    try:
                        def mysig(*args): raise KeyboardInterrupt
                        signal.signal(signal.SIGALRM, mysig)
                        signal.alarm(1)
                        import sage.all_cmdline
                        if before_expr.strip():
                            try:
                                exec (before_expr if not preparse else sage.all_cmdline.preparse(before_expr)) in namespace
                            except Exception, msg:
                                traceback.print_exc()
                        O = eval(obj if not preparse else sage.all_cmdline.preparse(obj), namespace)
                    finally:
                        signal.signal(signal.SIGALRM, signal.SIG_IGN)
                if get_help:
                    import sage.misc.sageinspect
                    result = eval('f(obj)', {'obj':O, 'f':sage.misc.sageinspect.sage_getdoc})
                    
                else:
                    v = dir(O)
                    if hasattr(O, 'trait_names'):
                        v += O.trait_names()
                    if not target.startswith('_'):
                        v = [x for x in v if x and not x.startswith('_')]
                        
            if not get_help:
                result = list(sorted(set(v), lambda x,y:cmp(x.lower(),y.lower())))
        except Exception, msg:
            traceback.print_exc()
            result = []
            status = 'ok'
        else:
            status = 'ok'
    r = {'result':result, 'target':target, 'expr':expr, 'status':status, 'help':get_help}
    if jsonify:
        r = json.dumps(r)
    return r

namespace['_completions'] = _completions
        
        
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
