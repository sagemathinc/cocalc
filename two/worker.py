"""
Backend Worker

Copyright: This file probably has to be GPL'd and made part of Sage,
because it imports Sage to do preparsing.

Having an official-in-Sage socket protocol actually makes a lot of
sense anyways.
"""

import os, json, resource, socket, string, sys, tempfile, time, traceback

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
                return json.loads(mesg)

    def send(self, m):
        self._s.send(json.dumps(m)+self._sep)


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

    def flush(self, done=False):
        self._f(self._buf, done=done)
        self._buf = ''


def preparse_code(code):
    if code.lstrip().startswith('!'):
        # shell escape (TODO: way better)
        code = 'print os.popen(eval("%r")).read()'%code[1:]
    else:
        if args.use_sage:
            import sage.all_cmdline
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
        
## log = open('log','a')
## def lg(m, s):
##     log.write('%s: %s\n'%(m,s))
##     log.flush()

class SageSocketServer(object):
    def __init__(self, backend, socket_name='', port=0, hostname=''):
        self._backend = backend
        self._socket_name = socket_name
        self._port = port
        self._tag = None
        self._hostname = hostname if hostname else socket.gethostname()

    def use_unix_domain_socket(self):
        """Return True if we are using a local Unix Domain socket instead of opening a network port."""
        return self._port == 'uds'

    def evaluate(self, expr, preparse, tag):
        try:
            if preparse:
                expr = preparse_code(expr)
            r = str(eval(expr, self._namespace))
            msg = {'done':True, 'result':r}
        except Exception, errmsg:
            msg = {'done':True, 'error':str(errmsg)}
        if tag is not None:
            msg['tag'] = tag
        self._b.send(msg)

    def execute(self, code, preparse, tag):
        try:
            self._tag = tag
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
            if sys.stdout._buf:
                if sys.stderr._buf:
                    sys.stdout.flush(done=False)
                    sys.stderr.flush(done=True)
                else:
                    sys.stdout.flush(done=True)
            elif sys.stderr._buf:
                sys.stderr.flush(done=True)
            else:
                self._send_done_msg()

    def _send_output(self, stream, data, done=False):
        msg = {stream:data}
        if self._tag is not None:
            msg['tag'] = self._tag
        if done:
            msg['done'] = True
        self._b.send(msg)

    def _send_done_msg(self):
        msg = {'done':True}
        if self._tag is not None:
            msg['tag'] = self._tag
        self._b.send(msg)

    def _recv_eval_send_loop(self, conn):
        # Redirect stdout and stderr to objects that write directly
        # to a JSONsocket.
        self._b = JSONsocket(conn)
        self._orig_streams = sys.stdout, sys.stderr
        sys.stdout = OutputStream(lambda data, done: self._send_output('stdout', data, done))
        sys.stderr = OutputStream(lambda data, done: self._send_output('stderr', data, done))

        # create a clean namespace with Sage imported
        self._namespace = {}
        if args.use_sage:
            exec "from sage.all_cmdline import *" in self._namespace

        while True:
            mesg = self._b.recv()
            if 'evaluate' in mesg:
                self.evaluate(mesg['evaluate'], mesg.get('preparse', True), mesg.get('tag'))
                continue
            if 'execute' in mesg:
                self.execute(mesg['execute'], mesg.get('preparse', True), mesg.get('tag'))
                continue

    def run(self):
            
        if self.use_unix_domain_socket():
            # use Unix Domain Sockets
            s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            if not self._socket_name:
                self._socket_name = tempfile.mktemp() # unsafe, so we bind immediately below
            print "Binding socket to %s"%self._socket_name
            s.bind(self._socket_name)
            register = {'socket_name':self._socket_name}
            
        else:
            # listen on a network port
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)            
            if self._port == 'auto':
                s.bind((self._hostname, 0))
                self._port = s.getsockname()[1] # see http://stackoverflow.com/questions/1365265/on-localhost-how-to-pick-a-free-port-number
            else:
                self._port = int(self._port)
                s.bind((self._hostname, self._port))
            print "Connected socket to http://%s:%s"%(self._hostname, self._port)
            register = {'port':self._port, 'hostname':self._hostname}

        if self._backend:
            url = 'http://%s/register_manager'%self._backend 
            print "Registering with backend server at %s"%url  # todo: proper log
            import misc
            misc.post(url, data = register, timeout=5)  # TODO: 5?

        self._children = []
        s.listen(5)
        
        try:
            while 1:
                print "Waiting for connection..."
                conn, addr = s.accept()
                pid = os.fork()
                if pid == 0:
                    # child
                    self._recv_eval_send_loop(conn)
                    
                else:
                    # parent
                    print "Accepted a new connection, and created process %s to handle it"%pid
                    self._children.append(pid)
        finally:
            print "Cleaning up server..."
            try:
                try:
                    if self.use_unix_domain_socket():
                        os.unlink(self._socket_name)
                except OSError:
                    pass
                try:
                    s.shutdown(0)
                    s.close()
                except:
                    pass
            except OSError:
                pass
            print "Waiting for all forked subprocesses to terminate..."
            os.wait()
            print "All subprocesses have terminated."

class SageSocketTestClient(object):
    def __init__(self, socket_name='', port='', hostname='', num_trials=1):
        self._socket_name = socket_name
        self._port = port
        self._hostname = hostname if hostname else socket.gethostname()
        self._num_trials = num_trials

    def use_unix_domain_socket(self):
        """Return True if we are using a local Unix Domain socket instead of opening a network port."""
        return self._port == 'uds'

    def run(self):
        try:
            if self.use_unix_domain_socket():
                s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                s.connect(self._socket_name)
            else:
                s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                s.connect((self._hostname, int(self._port)))
                
            b = JSONsocket(s)

            while 1:
                r = raw_input('sagews: ')
                while True:
                    z = raw_input('...     ')
                    if z != '':
                        r += '\n' + z
                    else:
                        break
                t = time.time()
                for n in range(self._num_trials):
                    b.send({'execute':r})
                    while 1:
                        mesg = b.recv()
                        stdout = mesg.get('stdout',None)
                        stderr = mesg.get('stderr',None)
                        if n == self._num_trials - 1:
                            if stdout:
                                sys.stdout.write(stdout); sys.stdout.flush()
                            if stderr:
                                sys.stderr.write(stderr); sys.stderr.flush()
                        if mesg.get('done'):
                            break
                if self._num_trials > 1:
                    print '%s trials -- time in seconds:'%self._num_trials,
                    r = (time.time() - t)/self._num_trials
                    print "%s,  number per second: %s"%(r, int(1/r) if r else 'infinity')
                
        finally:
            # properly close socket
            try:
                s.shutdown(0)
                s.close()
            except Exception, msg:
                print msg

def reset_all_accounts(conf_file):
    accounts = json.load(open(conf_file))['accounts']

    import subprocess
    # first launch all kills simultaneously
    print "Launch processes to kill all user processes..."
    v = [subprocess.Popen(['ssh', '%s@localhost'%user, 'killall -u %s -9'%user],
                          stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE) for user in accounts]
    print "Wait for them all to finish..."
    for p in v: p.wait()
    # Now that all processes are dead (TODO: it should be, at least --
    # perhaps should worry about zombies?):
    print "Deleting all files owned by each user account..."
    v = [subprocess.Popen(['ssh', '%s@localhost'%user, 'chmod og-rwx $HOME && rm -rf /tmp "$HOME"'],
                          stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE) for user in accounts]
    print "Waiting for that to finish..."
    for p in v: p.wait()
    
def reset_account(user):
    import subprocess
    subprocess.Popen(['ssh', '%s@localhost'%user, 'killall -u %s -9'%user]).wait()
    subprocess.Popen(['ssh', '%s@localhost'%user, 'chmod og-rwx $HOME && rm -rf /tmp "$HOME"']).wait()

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description="Run a worker")
    parser.add_argument("--port", dest="port", type=str, default='auto',
                        help="numerical port that worker binds, 'auto' to find an available port, or 'uds' to instead use a local Unix Domain socket (default: 'auto')")
    parser.add_argument("--use_sage", dest="use_sage", type=str, default='True',
                        help="If True (the default), assume that the Sage library can be imported and is available")
    parser.add_argument("--hostname", dest="hostname", type=str, default=0,
                        help="hostname to listen on (default: ''=socket.gethostname())")
    parser.add_argument("--backend", dest="backend", type=str, default='', 
                        help="address:port of backend server to register with (or '' to not register)")
    parser.add_argument("--socket_name", dest="socket_name", type=str, default='',
                        help="name of UD socket to serve on (used for devel/testing)")
    parser.add_argument("--client", dest="client", action="store_const", const=True, default=False,
                        help="run a command line client instead (make sure to specify the socket with --socket_name or --port)")
    parser.add_argument('--num_trials', dest="num_trials", type=int, default=1,
                        help="used by the test client -- repeat inputs this many times and average time")
    parser.add_argument('--workspace_id', dest="workspace_id", type=int, default=-1,
                        help="id of workspace that will be run")

    parser.add_argument('--reset_all_accounts', dest='reset_all_accounts', action='store_const', const=True, default=False,
                        help="*DANGEROUS*: this kills all processes and delete all content from all accounts specified in the file given in the conf option")
    parser.add_argument('--conf', dest="conf", type=str, default="conf.json", help="Configuration file used for certain commands")

    parser.add_argument('--reset_account', dest="reset_account", type=str, default='',
                        help="if specified reset just this account")

    parser.add_argument('--daemon', dest='daemon', action='store_const', const=True, default=False,
                        help="run as a silent daemon")

    args = parser.parse_args()
    args.use_sage = bool(eval(args.use_sage))

    def main():
        if args.reset_account:
            reset_account(args.reset_account)
        elif args.reset_all_accounts:
            reset_all_accounts(args.conf)
        elif args.client:
            SageSocketTestClient(socket_name=args.socket_name, port=args.port, hostname=args.hostname, num_trials=args.num_trials).run()
        else:
            SageSocketServer(args.backend, args.socket_name, args.port, args.hostname).run()


    if args.daemon:
        import daemon
        with daemon.DaemonContext():
            main()
    else:
        main()
