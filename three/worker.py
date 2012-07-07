"""
Backend Worker

Copyright: This file probably has to be GPL'd and made part of Sage,
because it imports Sage to do preparsing.

Having an official-in-Sage socket protocol actually makes a lot of
sense anyways.
"""

import os, json, pwd, random, resource, shutil, signal, socket, string, sys, tempfile, time, traceback

#####################################
# Setup the authentication token file
#####################################
TOKEN_LENGTH = 16    # 16 = 60,000 years on the fastest cluster I can imagine
if not os.path.exists('data'):
    os.makedirs('data')
TOKEN_FILE = os.path.join('data', 'worker_tokens_%s'%os.environ['USER'])

##########################################################
# Setup logging
##########################################################
import logging
logging.basicConfig()
log = logging.getLogger('')

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
                b = self._s.recv(self._bufsize)
                #log.debug("recv: b='%s'; len(b)=%s", b, len(b))
                if len(b) == 0:
                    raise EOFError
                self._data += b
            else:
                mesg = self._data[:i]
                self._data = self._data[i+1:]
                return json.loads(mesg)

    def send(self, m):
        log.debug("send: %s", m)
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

class Connection(object):
    def __init__(self, user=None, temp_path=None):
        self._user = user
        self._temp_path = temp_path
        
    def __del__(self):
        if self._temp_path:
            log.info("Removing '%s'", self._temp_path)
            shutil.rmtree(self._temp_path)
        
class SageSocketServer(object):
    def __init__(self, backend, socket_name='', port=0, hostname='', no_sage=False,
                 use_ssl=False, certfile='', keyfile='', users=''):
        self._backend = backend
        self._socket_name = socket_name
        self._port = port
        self._tag = None
        self._use_ssl = use_ssl
        self._certfile = certfile
        self._keyfile = keyfile
        self._hostname = hostname if hostname else socket.gethostname()
        self._no_sage = no_sage
        self._configure_users(users)
        self.init_tokens()
        self._limits = {'CPU':1800,    # max CPU time = this many seconds of *cpu* time (not wall)
                        'NOFILE':2048,  # max number of open files
                        'DATA':1000000, # max heap size (todo: units?)
                        }
        self._connections = {}
        #signal.signal(signal.SIGCHLD, signal.SIG_IGN)
        signal.signal(signal.SIGCHLD, self._handle_child_term)

    def _handle_child_term(self, signum, frame):
        while True:
            try:
                pid, exit_status = os.waitpid(-1, os.WNOHANG)
            except:
                return
            if not pid: return
            if pid in self._connections:
                log.info("Cleaning up after child process %s", pid)
                del self._connections[pid]
                
    def _configure_users(self, users):
        whoami = os.environ['USER']
        if whoami == 'root' and not users.strip():
            raise RuntimeError("When running as root, you must specify at least one user")
        if users:
            self._users = [x.strip() for x in users.split(',')]
        else:
            self._users = [whoami]

    def init_tokens(self):
        alpha = '_' + string.ascii_letters + string.digits
        sr = random.SystemRandom()  # officially "suitable" for cryptographic use
        self._tokens = [''.join([sr.choice(alpha) for _ in range(TOKEN_LENGTH)])
                           for _ in range(len(self._users))]
        file = open(TOKEN_FILE,'w')
        os.chmod(TOKEN_FILE, 0600) # set restrictive perm on file before writing to it
        file.write('\n'.join(self._tokens))
        log.info("stored %s random 16-character authentication tokens in %s"%(
            len(self._users), TOKEN_FILE))
        # TODO -- remove
        log.info('\n'.join(self._tokens))

    def use_unix_domain_socket(self):
        """Return True if we are using a local Unix Domain socket instead of opening a network port."""
        return self._port == 'uds'

    def evaluate(self, expr, preparse, tag):
        try:
            if preparse and not self._no_sage:
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
                if preparse and not self._no_sage:
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
        log.info("recv_eval_send_loop")
        # Redirect stdout and stderr to objects that write directly
        # to a JSONsocket.
        self._b = JSONsocket(conn)
        self._orig_streams = sys.stdout, sys.stderr
        sys.stdout = OutputStream(lambda data, done: self._send_output('stdout', data, done))
        sys.stderr = OutputStream(lambda data, done: self._send_output('stderr', data, done))

        # create a clean namespace with Sage imported
        self._namespace = {}
        if not self._no_sage:
            exec "from sage.all_cmdline import *" in self._namespace

        while True:
            mesg = self._b.recv()
            log.debug("receive: %s", mesg)
            if 'evaluate' in mesg:
                self.evaluate(mesg['evaluate'], mesg.get('preparse', True), mesg.get('tag'))
                continue
            if 'execute' in mesg:
                self.execute(mesg['execute'], mesg.get('preparse', True), mesg.get('tag'))
                continue

    def run(self):
        global log
            
        if self.use_unix_domain_socket():
            # use Unix Domain Sockets
            s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            if not self._socket_name:
                self._socket_name = tempfile.mktemp() # unsafe, so we bind immediately below
            log.info("Binding socket to %s"%self._socket_name)
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
            log.info("Binding socket %s:%s", self._hostname, self._port)
            register = {'port':self._port, 'hostname':self._hostname}

        if self._backend:
            url = 'http://%s/register_manager'%self._backend 
            log.info("Registering with backend server at %s", url)
            import misc
            misc.post(url, data = register, timeout=5)  # TODO: 5?

        self._children = []
        s.listen(5)
        as_root = (os.environ['USER'] == 'root')

        pid = None
        try:
            while 1:
                log.info("Waiting for %sconnection..."%('SSL secure ' if self._use_ssl else ''))
                try:
                    conn, addr = s.accept()
                except socket.error:
                    log.info("Handling a SIGCHLD signal, which temporarily stops server listening for incoming connections")
                    continue
                
                if self._use_ssl:
                    import ssl
                    conn = ssl.wrap_socket(conn, server_side=True, certfile=self._certfile, keyfile=self._keyfile)
                    log.info("Upgraded to SSL connection.")


                if as_root:
                    temp_path = tempfile.mkdtemp()
                else:
                    temp_path = None
                    
                pid = os.fork()

                if pid == 0:
                    # client must send the secret authentication token within 10 seconds, or we refuse to serve
                    TIMEOUT = 10
                    # child
                    if args.log:
                        log = logging.getLogger('')
                        log.setLevel(logging.DEBUG)
                        from log import StandardLogHandler
                        log.addHandler(StandardLogHandler(address=args.log, tag='session'))

                    def auth_fail(*args):
                        log.info("Client failed to correctly send correct token within %s seconds.", TIMEOUT)
                        sys.exit(1)

                    signal.signal(signal.SIGALRM, auth_fail)
                    signal.alarm(TIMEOUT)
                    token = conn.recv(TOKEN_LENGTH)
                    signal.signal(signal.SIGALRM, signal.SIG_IGN)  # cancel the alarm
                    if token not in self._tokens:
                        conn.send("NO")
                        auth_fail()
                    else:
                        conn.send("OK")
                        i = self._tokens.index(token)

                    # for safety -- since about to switch user and they must not know token
                    del self._tokens   

                    #############################################
                    # switch user, if root
                    if as_root:
                        log.info("Dropping privileges since server is running as root")

                        user = self._users[i]

                        
                        v = pwd.getpwnam(user)

                        os.chown(temp_path, v[2], v[3])
                            
                        os.setgid(v[3])
                        os.setuid(v[2])
                        log.info("Privileges successfully dropped to user %s", user)

                        log.info("Modifying environment for restricted use")

                        # TODO: make dir better; clean up on exit, notify clients on exit...
                        os.environ['DOT_SAGE'] = temp_path
                        os.environ['IPYTHON_DIR'] = temp_path

                        #############################################                    
                        # limit user
                        if 'CPU' in self._limits:
                            t = self._limits['CPU']
                            log.info("Setting maximum CPU time to %s seconds", t)
                            resource.setrlimit(resource.RLIMIT_CPU, (t,t))

                        if 'NOFILE' in self._limits:
                             t = self._limits['NOFILE']
                             log.info("Setting maximum number of open files to %s", t)
                             resource.setrlimit(resource.RLIMIT_NOFILE, (t,t))

                        if 'DATA' in self._limits:
                             t = self._limits['DATA']
                             log.info("Setting maximum heap size to %s", t)
                             resource.setrlimit(resource.RLIMIT_DATA, (t,t))

                    self._recv_eval_send_loop(conn)
                    
                else:
                    # parent
                    self._connections[pid] = Connection(temp_path=temp_path)
                    log.info("Accepted a new connection, and created process %s to handle it"%pid)
                    self._children.append(pid)

        except Exception, err:
            import traceback
            traceback.print_exc(file=sys.stdout)
            log.error("Error: %s %s", (type(err), str(err)))
            
        finally:
            if pid == 0:
                log.info("A connection was terminated; forked subprocess with pid %s quitting", os.getpid())
                return  # child -- no cleanup needed (?)
            
            log.info("Cleaning up server...")
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
            log.info("Waiting for all forked subprocesses to terminate...")
            try:
                os.wait()
            except OSError:
                log.info("There are no forked processes to terminate.")
                pass
            log.info("All subprocesses have terminated.")

class SageSocketTestClient(object):
    def __init__(self, socket_name='', port='', hostname='', num_trials=1, use_ssl=False, token=''):
        self._socket_name = socket_name
        self._port = port
        if not socket_name and port == 'auto':
            print "You must specify a valid --port number or a --socket_name"
            sys.exit(1)
        self._use_ssl = use_ssl
        self._hostname = hostname if hostname else socket.gethostname()
        self._num_trials = num_trials
        self._token = token if token else open(TOKEN_FILE).read()

    def use_unix_domain_socket(self):
        """Return True if we are using a local Unix Domain socket instead of opening a network port."""
        return self._port == 'uds'

    def run(self):
        try:
            log.info("Connecting...")
            if self.use_unix_domain_socket():
                log.info("using Unix domain socket")
                s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                if self._use_ssl:
                    import ssl
                    s = ssl.wrap_socket(s)
                s.connect(self._socket_name)
                banner = "Connected to Sage Workspace server on the Unix Domain socket %s"%self._socket_name
            else:
                log.info("using network socket")
                s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                if self._use_ssl:
                    import ssl
                    s = ssl.wrap_socket(s)
                s.connect((self._hostname, int(self._port)))
                banner = "Connected to %sSage Workspace server at %s:%s"%('SSL encrypted ' if self._use_ssl else '',
                                                                  self._hostname, self._port)

            # send authentication token
            print "Authenticating..."
            s.send(self._token)
            r = s.recv(2)
            if r == "OK":
                print "Session granted."
            else:
                print "Session denied (invalid token)."
                sys.exit(1)
                
            print '-'*(len(banner)+4)
            print '| ' + banner + ' |'
            print '-'*(len(banner)+4)

                
            log.disabled = True
            b = JSONsocket(s)
            quit = False
            while not quit:
                try:
                    r = raw_input('sage: ')
                    z = r
                    if z.rstrip().endswith(':'):
                        while True:
                            try:
                                z = raw_input('...       ')
                            except EOFError:
                                quit = True
                                break
                            if z != '':
                                r += '\n    ' + z
                            else:
                                break
                except EOFError:
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
    # TODO: It is *might* be necessary to use a root account and do
    # this cleanup from a root account, because a malicious user
    # *might* be able to mess with the paths on ssh'ing in, or run a
    # program that instantly kills any new processes; I don't know if
    # either is possible.  If it is, then I won't be able to ensure that
    # everything is killed until doing a VM reset.  A simple solution
    # would be to make the manager user *be* root and change this and the
    # above reset functions.  This may make perfect sense given how
    # ephemeral worker VM's are. 
    subprocess.Popen(['ssh', '%s@localhost'%user, 'killall -u %s -9'%user]).wait()
    subprocess.Popen(['ssh', '%s@localhost'%user, 'chmod og-rwx $HOME && rm -rf /tmp "$HOME"']).wait()

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description="Run a worker")
    parser.add_argument("--port", dest="port", type=str, default='auto',
                        help="numerical port that worker binds, 'auto' to find an available port, or 'uds' to instead use a local Unix Domain socket (default: 'auto')")
    parser.add_argument("--hostname", dest="hostname", type=str, default=0,
                        help="hostname to listen on (default: ''=socket.gethostname())")
    parser.add_argument("--backend", dest="backend", type=str, default='', 
                        help="address:port of backend server to register with (or '' to not register)")
    parser.add_argument("--socket_name", dest="socket_name", type=str, default='',
                        help="name of UD socket to serve on (used for devel/testing)")

    parser.add_argument("--client", dest="client", action="store_const", const=True, default=False,
                        help="run a command line client instead (make sure to specify the socket with --socket_name or --port)")
    parser.add_argument('--token', dest='token', type=str, default='',
                        help="use this token to connect as a client")


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

    parser.add_argument('--no_ssl', dest='no_ssl', default=False, action='store_const', const=True,
                        help="if set, do not use SSL to encrypt communication between the client and server (default is to use SSL)")
    parser.add_argument('--certfile', dest='certfile', default='', type=str, help="SSL cert file to use")
    parser.add_argument('--keyfile', dest='keyfile', default='', type=str, help="SSL key file to use")
    parser.add_argument('--gen_cert', dest="gen_cert", default='', type=str,
                        help="generate a self-signed 2048 bit certificate and put in this file; this overrides certfile and keyfile above")
    parser.add_argument('--gen_cert_bits', dest="gen_cert_bits", default=1024, type=int,
                        help="number of bits of RSA private key (default: 1024)")

    parser.add_argument("--no_sage", dest="no_sage", default=False, action='store_const', const=True,
                        help="if set, do *not* import the Sage library and do not preparse input")


    parser.add_argument("--log", dest="log", type=str, default="",
                        help="if specified also log to secure remote log server at that location (e.g., 'localhost:9020')")
    parser.add_argument("--log_tag", dest="log_tag", type=str, default="worker",
                        help="tag to include in remote log server messages, which could be used to identify this process, e.g., 'worker'")
    parser.add_argument('--log_level', dest='log_level', type=str, default='INFO',
                        help="log level (default: INFO) useful options include WARNING and DEBUG")

    parser.add_argument('--users', dest='users', type=str, default='',
                        help="list of available users to switch to if running as root")

    args = parser.parse_args()
    if args.socket_name and args.port == 'auto':
        args.port = 'uds'

    if args.log:
        from log import StandardLogHandler
        log.addHandler(StandardLogHandler(address=args.log, tag=args.log_tag))

    if args.log_level:
        level = getattr(logging, args.log_level.upper())
        #print "Setting log level to %s (=%s)"%(args.log_level, level)
        log.setLevel(level)

    use_ssl = not args.no_ssl
    if use_ssl:
        if not args.certfile and not args.keyfile and not args.gen_cert:
            args.gen_cert = 'cert.pem'
            
        if args.gen_cert:
            # ensure certificate exists
            if not os.path.exists(args.gen_cert):
                log.info("Generating self-signed certificate: '%s'", args.gen_cert)
                import subprocess
                p = subprocess.Popen(['openssl', 'req', '-batch', '-new', '-x509', '-newkey', 'rsa:%s'%args.gen_cert_bits, '-days', '9999', '-nodes', '-out', args.gen_cert, '-keyout', args.gen_cert])
                if p.wait():
                    log.info("Error running openssl")
                    os.unlink(args.gen_cert)
                    sys.exit(1)
                os.chmod(args.gen_cert, 0600)
            args.certfile = args.gen_cert
            args.keyfile = args.gen_cert

    def main():
        if args.reset_account:
            reset_account(args.reset_account)
        elif args.reset_all_accounts:
            reset_all_accounts(args.conf)
        elif args.client:
            SageSocketTestClient(socket_name=args.socket_name, port=args.port, hostname=args.hostname,
                                 num_trials=args.num_trials, use_ssl=use_ssl,
                                 token=args.token).run()
        else:
            try:
                SageSocketServer(args.backend, args.socket_name, args.port, args.hostname,
                             use_ssl=use_ssl, certfile=args.certfile, keyfile=args.keyfile,
                             no_sage=args.no_sage, users=args.users).run()
            except Exception, msg:
                print '%s: %s'%(sys.argv[0], msg)
                sys.exit(1)

    if args.daemon:
        import daemon
        with daemon.DaemonContext():
            main()
    else:
        main()
