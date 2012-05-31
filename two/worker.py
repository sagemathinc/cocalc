"""
Backend Worker


"""

import argparse, os, simplejson, socket, string, sys, traceback

import time

class JSONsocket(object):
    def __init__(self, s, bufsize=4096, sep='\0'):
        self._s = s
        self._data = ''
        self._bufsize = bufsize
        self._sep = sep

    def recv(self):
        while True:
            i = self._data.find(self._sep)
            if i == -1:
                self._data += self._s.recv(self._bufsize)
            else:
                mesg = self._data[:i]
                self._data = self._data[i+1:]
                return simplejson.loads(mesg)

    def send(self, m):
        self._s.send(simplejson.dumps(m)+self._sep)


class OutputStream(object):
    def __init__(self, f, flush_size=4096, flush_interval=0.1):
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

    def flush(self):
        self._f(self._buf)
        self._buf = ''


import sage.all_cmdline

def preparse_code(code):
    if code.lstrip().startswith('!'):
        # shell escape
        code = 'print os.popen(eval("%r")).read()'%code[1:]
    else:
        code = sage.all_cmdline.preparse(code)
    return code

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
        

class Worker(object):
    def __init__(self, socket_name):
        self._socket_name = socket_name
        self._s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        print "connecting to socket '%s'..."%socket_name  # todo -- use logging module
        self._s.connect(socket_name)
        print "connected."
        self._b = JSONsocket(self._s)
        self._orig_streams = sys.stdout, sys.stderr
        sys.stdout = OutputStream(lambda m: self._b.send({'status':'running', 'stdout':m}) if m else None)
        sys.stderr = OutputStream(lambda m: self._b.send({'status':'running', 'stderr':m}) if m else None)
        self._namespace = {}
        exec "from sage.all_cmdline import *" in self._namespace

    def do_eval(self, expr, preparse):
        try:
            if preparse:
                expr = preparse_code(expr)
            r = str(eval(expr))
            self._b.send({'status':'done', 'result':r})
        except Exception, msg:
            self._b.send({'status':'error', 'exception':str(msg)})

    def do_exec(self, code, preparse):
        try:
            for start, stop, block in divide_into_blocks(code):
                if preparse:
                    block = preparse_code(block)
                exec compile(block, '', 'single') in self._namespace
        except:
            #TODO: what if there are no blocks?
            #sys.stderr.write('Error in lines %s-%s\n'%(start+1, stop+1))
            traceback.print_exc()
        finally:
            sys.stdout.flush(); sys.stderr.flush()
            self._b.send({'status':'done'})

    def run(self):
        data = ''
        while True:
            mesg = self._b.recv()
            cmd = mesg['cmd']
            if cmd == 'eval':
                self.do_eval(mesg['code'], mesg.get('preparse', True))
            elif cmd == 'exec':
                self.do_exec(mesg['code'], mesg.get('preparse', True))
                

def test_server():
    import tempfile
    #socket_name = tempfile.mktemp()
    socket_name = 'a'
    print "creating new socket '%s'"%socket_name
    
    try:
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        print "binding to socket"
        s.bind(socket_name)
        s.listen(1)
        print "listening for connection..."
        conn, addr = s.accept()
        b = JSONsocket(conn)

        while 1:
            r = raw_input('sage: ')
            print "sending work"
            t = time.time()
            #b.send({'cmd':'eval', 'code':r})
            
            b.send({'cmd':'exec', 'code':r})
            while 1:
                mesg = b.recv()
                print mesg
                if mesg['status'] != 'running':
                    break
                
            #print time.time() - t, len(answer)

    finally:
        try:
            os.unlink(socket_name)
        except OSError:
            pass
        

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Run backend worker instance")
    parser.add_argument("-s", dest="socket_name", type=str, 
                        help="name of local unix domain socket of the backend server",
                        default='')
    parser.add_argument("-t", dest="test", action="store_const",
                        const=True, default=False, help="run a simple test server that creates a socket")
                        
    args = parser.parse_args()
    if args.test:
        test_server()
    else:
        Worker(args.socket_name).run()
    
