"""
Backend Worker

Copyright: This file probably has to be GPL'd and made part of Sage,
because it imports Sage to do preparsing.

Having an official-in-Sage socket protocol actually makes a lot of
sense anyways. 
"""

import argparse, os, simplejson, socket, string, sys, traceback

import time

from backend_mesg import MESG

######################################################################    
    
class JSONsocket(object):
    """
    This classes send messages back and forth over a socket using JSON
    encoding.

    NOTES: The guide http://docs.python.org/howto/sockets.html#socket-howto
    is against using a terminator character for messages, but we are only
    using JSON, so it is safe to separate messages with the null character
    '\0', since this character will not appear in any properly encoded JSON
    message. 
    """
    def __init__(self, s, bufsize=8192):
        self._s = s
        self._data = ''
        self._bufsize = bufsize
        self._sep = '\0'

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
    def __init__(self, f, flush_size=4096, flush_interval=.1):
        self._f = f
        self._buf = ''
        self._flush_size = flush_size
        self._flush_interval = flush_interval
        self.reset()

    def reset(self):
        self._last_flush_time = time.time()

    def write(self, output):
        self._buf += output
        t = time.time()
        if ((len(self._buf) >= self._flush_size) or
                  (t - self._last_flush_time >= self._flush_interval)):
            self.flush()
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
        #print "connecting to socket '%s'..."%socket_name  # todo -- use logging module
        self._s.connect(socket_name)
        #print "connected."
        self._b = JSONsocket(self._s)
        self._orig_streams = sys.stdout, sys.stderr
        sys.stdout = OutputStream(lambda m: self._b.send(
            {MESG.status:MESG.running, MESG.stdout:m}) if m else None)
        sys.stderr = OutputStream(lambda m: self._b.send(
            {MESG.status:MESG.running, MESG.stderr:m}) if m else None)
        self._namespace = {}
        exec "from sage.all_cmdline import *" in self._namespace

    def do_eval(self, expr, preparse):
        try:
            if preparse:
                expr = preparse_code(expr)
            r = str(eval(expr))
            self._b.send({MESG.status:MESG.done, MESG.result:r})
        except Exception, msg:
            self._b.send({MESG.status:MESG.error, MESG.exception:str(msg)})

    def do_exec(self, code, preparse):
        try:
            for start, stop, block in divide_into_blocks(code):
                if preparse:
                    block = preparse_code(block)
                sys.stdout.reset(); sys.stderr.reset()                
                exec compile(block, '', 'single') in self._namespace
        except:
            #TODO: what if there are no blocks?
            #sys.stderr.write('Error in lines %s-%s\n'%(start+1, stop+1))
            traceback.print_exc()
        finally:
            sys.stdout.flush(); sys.stderr.flush()
            self._b.send({MESG.status:MESG.done})

    def run(self):
        data = ''
        while True:
            mesg = self._b.recv()
            cmd = mesg[MESG.cmd]
            if cmd == MESG.evaluate:
                self.do_eval(mesg[MESG.code], mesg.get(MESG.preparse, True))
            elif cmd == MESG.execute:
                self.do_exec(mesg[MESG.code], mesg.get(MESG.preparse, True))
                

def test_server():
    import tempfile
    #socket_name = tempfile.mktemp()
    socket_name = 'a'
    print "socket_name =", socket_name
    
    try:
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.bind(socket_name)
        s.listen(1)
        conn, addr = s.accept()
        b = JSONsocket(conn)

        while 1:
            r = raw_input('sagews: ')
            t = time.time()
            b.send({MESG.cmd:MESG.execute, MESG.code:r})
            while 1:
                mesg = b.recv()
                stdout = mesg.get(MESG.stdout,None)
                stderr = mesg.get(MESG.stderr,None)
                if stdout:
                    sys.stdout.write(stdout); sys.stdout.flush()
                if stderr:
                    sys.stderr.write(stderr); sys.stderr.flush()                    
                if mesg[MESG.status] != MESG.running:
                    break
            print time.time() - t

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
    
