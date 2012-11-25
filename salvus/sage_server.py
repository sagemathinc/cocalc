#!/usr/bin/env python
"""
sage_server.py -- unencrypted forking TCP server that can run as root,
               create accounts on the fly, and serve sage as those
               accounts, using protobuf messages.
"""

# This is the one file that must be GPL'd (if salvus is
# redistributed...) because it imports the Sage library.  This file is
# not directly imported by anything else; the Python process it runs
# is used over a TCP connection.  So nothing viral here.

########################################################################################
#       Copyright (C) 2012 William Stein <wstein@gmail.com>
#
#  Distributed under the terms of the GNU General Public License (GPL), version 2+
#
#                  http://www.gnu.org/licenses/
#########################################################################################


import json, os, resource, shutil, signal, socket, struct, sys, \
       tempfile, time, traceback

import parsing

LIMITS = {'cputime':60, 'walltime':60, 'vmem':2000, 'numfiles':1000, 'quota':128}

# Configure logging
#logging.basicConfig()
#log = logging.getLogger('sage_server')
#log.setLevel(logging.INFO)

# JSON Message wrapper around a connection
class ConnectionJSON(object):
    def __init__(self, conn):
        assert not isinstance(conn, ConnectionJSON)
        self._conn = conn

    def close(self):
        self._conn.close()

    def send(self, m):
        #log.debug('send:pid=%s: "%s"', os.getpid(), m)    # todo -- waste of time
        s = json.dumps(m)
        length_header = struct.pack(">L", len(s))
        self._conn.send(length_header + s)

    def _recv(self, n):
        #print "_recv(%s)"%n
        for i in range(20): # see http://stackoverflow.com/questions/3016369/catching-blocking-sigint-during-system-call
            try:
                #print "blocking recv (i = %s), pid=%s"%(i, os.getpid())
                r = self._conn.recv(n)
                #print "got it = '%s'"%r
                return r
            except socket.error as (errno, msg):
                #print "socket.error, msg=%s"%msg
                if errno != 4:
                    raise
        raise EOFError

    def recv(self):
        n = self._recv(4)
        if len(n) < 4:
            raise EOFError
        n = struct.unpack('>L', n)[0]   # big endian 32 bits
        s = self._recv(n)
        while len(s) < n:
            t = self._recv(n - len(s))
            if len(t) == 0:
                raise EOFError
            s += t
        m = json.loads(s)
        #log.debug('recv:pid=%s: "%s"', os.getpid(), m)  # todo -- remove
        return m

class Message(object):
    def _new(self, event, props={}):
        m = {'event':event}
        for key, val in props.iteritems():
            if key != 'self':
                m[key] = val
        return m

    def start_session(self, limits={'walltime':3600, 'cputime':3600, 'numfiles':1000, 'vmem':2048}):
        limits = dict(limits)
        return self._new('start_session', locals())

    def session_description(self, pid, limits):
        return self._new('session_description', locals())

    def send_signal(self, pid, signal=signal.SIGINT):
        return self._new('send_signal', locals())

    def terminate_session(self, done=True):
        return self._new('terminate_session', locals())

    def execute_code(self, id, code, preparse=True):
        return self._new('execute_code', locals())

    def output(self, id, stdout=None, stderr=None, done=None):
        m = self._new('output')
        m['id'] = id
        if stdout is not None: m['stdout'] = stdout
        if stderr is not None: m['stderr'] = stderr
        if done is not None: m['done'] = done
        return m

    def introspect_completions(self, id, completions):
        m = self._new('introspect_completions', locals())
        m['id'] = id
        return m

    def introspect_docstring(self, id, docstring):
        m = self._new('introspect_docstring', locals())
        m['id'] = id
        return m

    def introspect_source_code(self, id, source_code):
        m = self._new('introspect_source_code', locals())
        m['id'] = id
        return m

message = Message()

whoami = os.environ['USER']

def client1(port, hostname):
    conn = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    conn.connect((hostname, int(port)))
    conn = ConnectionJSON(conn)

    conn.send(message.start_session())
    mesg = conn.recv()
    pid = mesg['pid']
    print "PID = %s"%pid

    id = 0
    while True:
        try:
            code = parsing.get_input('sage [%s]: '%id)
            if code is None:  # EOF
                break
            conn.send(message.execute_code(code=code, id=id))
            while True:
                mesg = conn.recv()
                if mesg['event'] == 'terminate_session':
                    return
                elif mesg['event'] == 'output':
                    if 'stdout' in mesg:
                        sys.stdout.write(mesg['stdout']); sys.stdout.flush()
                    if 'stderr' in mesg:
                        print '!  ' + '\n!  '.join(mesg['stderr'].splitlines())
                    if 'done' in mesg and mesg['id'] >= id:
                        break
            id += 1

        except KeyboardInterrupt:
            print "Sending interrupt signal"
            conn2 = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            conn2.connect((hostname, int(port)))
            conn2 = ConnectionJSON(conn2)
            conn2.send(message.send_signal(pid))
            del conn2
            id += 1

    conn.send(message.terminate_session())
    print "\nExiting Sage client."

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

def execute(conn, id, code, preparse):
    def send_stdout(output, done):
        conn.send(message.output(stdout=output, done=done, id=id))
    def send_stderr(output, done):
        conn.send(message.output(stderr=output, done=done, id=id))
    try:
        streams = (sys.stdout, sys.stderr)
        sys.stdout = OutputStream(send_stdout)
        sys.stderr = OutputStream(send_stderr)
        for start, stop, block in parsing.divide_into_blocks(code):
            if preparse:
                block = parsing.preparse_code(block)
            sys.stdout.reset(); sys.stderr.reset()
            try:
                exec compile(block, '', 'single') in namespace
            except:
                sys.stderr.write('Error in lines %s-%s\n'%(start+1, stop+1))
                traceback.print_exc()
    finally:
        # there must be exactly one done message
        if sys.stderr._buf:
            if sys.stdout._buf:
                sys.stdout.flush()
            sys.stderr.flush(done=True)
        else:
            sys.stdout.flush(done=True)
        (sys.stdout, sys.stderr) = streams


def drop_privileges(id, home):
    gid = id
    uid = id
    os.chown(home, uid, gid)
    os.setgid(gid)
    os.setuid(uid)
    os.environ['DOT_SAGE'] = home
    os.environ['IPYTHON_DIR'] = home
    os.chdir(home)

namespace = {}
def session(conn, home, cputime, numfiles, vmem, uid):
    pid = os.getpid()
    if home is not None:
        drop_privileges(uid, home)

    if cputime is not None:
        resource.setrlimit(resource.RLIMIT_CPU, (cputime,cputime))
    if numfiles is not None:
        resource.setrlimit(resource.RLIMIT_NOFILE, (numfiles,numfiles))
    if vmem is not None:
        if os.uname()[0] == 'Linux':
            resource.setrlimit(resource.RLIMIT_AS, (vmem*1048576L, -1L))
    else:
        #log.warning("Server not running on Linux, so there are NO memory constraints.")
        pass

    def handle_parent_sigquit(signum, frame):
        conn.send(message.terminate_session())
        print "** Sage process killed by external SIGQUIT signal (time limit probably exceeded) **\n\n"
        sys.exit(0)

    signal.signal(signal.SIGQUIT, handle_parent_sigquit)

    # seed the random number generator(s)
    import sage.all; sage.all.set_random_seed()
    import time; import random; random.seed(time.time())

    while True:
        try:
            mesg = conn.recv()
            #print 'INFO:child%s: received message "%s"'%(pid, mesg)
            event = mesg['event']
            if event == 'terminate_session':
                return
            elif event == 'execute_code':
                execute(conn=conn, id=mesg['id'], code=mesg['code'], preparse=mesg['preparse'])
            elif event == 'introspect':
                introspect(conn=conn, id=mesg['id'],
                           text_before_cursor=mesg['text_before_cursor'],
                           text_after_cursor=mesg.get('text_after_cursor', None))
            else:
                raise RuntimeError("invalid message '%s'"%mesg)
        except KeyboardInterrupt:
            pass

def introspect(conn, id, text_before_cursor, text_after_cursor):
    stub = message.introspect_completions(id=id, completions=['stub','your','function','using','sage'])
    conn.send(stub)

def rmtree(path):
    if not path.startswith('/tmp/') or path.startswith('/var/') or path.startswith('/private/'):
        #log.error("Trying to rmtree on '%s' is very suspicious! Refusing!", path)
        pass
    else:
        #log.info("Removing '%s'", path)
        shutil.rmtree(path)

class Connection(object):
    def __init__(self, pid, uid, home=None, maxtime=3600):
        self._pid = pid
        self._uid = uid
        self._home = home
        self._start_time = time.time()
        self._maxtime = maxtime

    def __repr__(self):
        return 'pid=%s, home=%s, start_time=%s, maxtime=%s'%(
            self._pid, self._home, self._start_time, self._maxtime)

    def time_remaining(self):
        if self._maxtime is not None:
            return self._maxtime - (time.time() - self._start_time)

    def signal(self, sig):
        os.kill(self._pid, sig)

    def remove_files(self):
        # remove any other files created in /tmp by this user, if server is running as root.
        if whoami == 'root':
            if self._home is not None:
                rmtree(self._home)
            for dirpath, dirnames, filenames in os.walk('/tmp', topdown=False):
                for name in dirnames + filenames:
                    path = os.path.join(dirpath, name)
                    if os.stat(path).st_uid == self._uid:
                        try:
                            if os.path.isdir(path):
                                shutil.rmtree(path)
                            else:
                                os.unlink(path)
                        except Exception, msg:
                            print "Error removing a file -- ", msg
                            pass

    def monitor(self, interval=1):
        try:
            while True:
                tm = self.time_remaining()
                if tm < 0:
                    try:
                        if tm <= -2*interval:
                            self.signal(signal.SIGKILL)
                        else:
                            self.signal(signal.SIGQUIT)
                    except OSError:
                        return # subprocess is dead
                else:
                    try:
                        self.signal(0)
                    except OSError: # subprocess is dead
                        return
                time.sleep(interval)
        finally:
            self.remove_files()

def handle_session_term(signum, frame):
    while True:
        try:
            pid, exit_status = os.waitpid(-1, os.WNOHANG)
        except:
            return
        if not pid: return

def serve_connection(conn):
    conn = ConnectionJSON(conn)
    mesg = conn.recv()
    if mesg['event'] == 'send_signal':
        if mesg['pid'] == 0:
            print "invalid signal mesg (pid=0)"
            # TODO: send error message back (?)
            #log.info("invalid signal mesg (pid=0?): %s", mesg)
        else:
            #log.info("sending signal %s to process %s", mesg['signal'], mesg['pid'])
            os.kill(mesg['pid'], mesg['signal'])
        return
    if mesg['event'] != 'start_session':
        return

    # start a session
    home = tempfile.mkdtemp() if whoami == 'root' else None
    uid = (os.getpid() % 5000) + 5000
    pid = os.fork()
    limits = mesg.get('limits', {})
    if pid:
        # parent
        quota = limits.get('quota', LIMITS['quota'])
        if whoami == 'root':
            # TODO TODO on linux, set disk quota for given user
            pass
        C = Connection(pid=pid, uid=uid, home=home, maxtime=limits.get('walltime', LIMITS['walltime']))
        C.monitor()
    else:
        # child
        conn.send(message.session_description(os.getpid(), limits))
        session(conn, home, uid=uid,
                cputime=limits.get('cputime', LIMITS['cputime']),
                numfiles=limits.get('numfiles', LIMITS['numfiles']),
                vmem=limits.get('vmem', LIMITS['vmem']))

def serve(port, address):
    #log.info('opening connection on port %s', port)
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind((address, port))
    print 'Sage server %s:%s'%(address, port)

    signal.signal(signal.SIGCHLD, handle_session_term)

    tm = time.time()
    print "pre-importing the sage library..."
    import sage.all
    # Doing an integral start embedded ECL; unfortunately, it can
    # easily get put in a broken state after fork that impacts future forks... ?
    exec "from sage.all import *; import scipy; import sympy; import pylab; from sage.calculus.predefined import x; integrate(sin(x**2),x);" in namespace
    #exec "from sage.all import *; from sage.calculus.predefined import x; import scipy" in namespace
    print 'imported sage library in %s seconds'%(time.time() - tm)


    t = time.time()
    s.listen(128)
    i = 0
    try:
        while True:
            i += 1
            #print i, time.time()-t, 'cps: ', int(i/(time.time()-t))
            # do not use log.info(...) in the server loop; threads = race conditions that hang server every so often!!
            try:
                conn, addr = s.accept()
                print "connection from", addr
            except socket.error, msg:
                continue
            if not os.fork(): # child
                try:
                    serve_connection(conn)
                finally:
                    conn.close()
                    os._exit(0)
        # end while
    except Exception, err:
        traceback.print_exc(file=sys.stdout)
        #log.error("error: %s %s", type(err), str(err))

    finally:
        #log.info("closing socket")
        #s.shutdown(0)
        s.close()

def serve2(port, address):
    # this approach SUCKS: zombies, zombies; the socket can't be reused.
    import sage.all
    exec "from sage.all import *; from sage.calculus.predefined import x; integrate(sin(x**2),x); import scipy" in namespace

    import socket
    import SocketServer
    class Handler(SocketServer.StreamRequestHandler):
        def handle(self):
            serve_connection(self.request)
            self.request.close()
            os._exit(0)

    class ForkingTCPServer(SocketServer.ForkingMixIn, SocketServer.TCPServer):
        pass
    S = ForkingTCPServer((address, port), Handler)
    S.serve_forever()


def run_server(port, address, pidfile, logfile):
    if pidfile:
        open(pidfile,'w').write(str(os.getpid()))
    if logfile:
        #log.addHandler(logging.FileHandler(logfile))
        pass
    #log.info("port=%s, address=%s, pidfile='%s', logfile='%s'", port, address, pidfile, logfile)
    try:
        serve(port, address)
    finally:
        if pidfile:
            os.unlink(pidfile)

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Run Sage server")
    parser.add_argument("-p", dest="port", type=int, default=0,
                        help="port to listen on (default: 0 = determined by operating system)")
    parser.add_argument("-l", dest='log_level', type=str, default='INFO',
                        help="log level (default: INFO) useful options include WARNING and DEBUG")
    parser.add_argument("-d", dest="daemon", default=False, action="store_const", const=True,
                        help="daemon mode (default: False)")
    parser.add_argument("--address", dest="address", type=str, default='',
                        help="address of interface to bind to")
    parser.add_argument("--pidfile", dest="pidfile", type=str, default='',
                        help="store pid in this file")
    parser.add_argument("--logfile", dest="logfile", type=str, default='',
                        help="store log in this file (default: '' = don't log to a file)")
    parser.add_argument("-c", dest="client", default=False, action="store_const", const=True,
                        help="run in test client mode number 1 (command line)")
    parser.add_argument("--hostname", dest="hostname", type=str, default='',
                        help="hostname to connect to in client mode")
    parser.add_argument("--portfile", dest="portfile", type=str, default='',
                        help="write port to this file")

    args = parser.parse_args()

    if args.daemon and not args.pidfile:
        print "%s: must specify pidfile in daemon mode"%sys.argv[0]
        sys.exit(1)

    if args.log_level:
        pass
        #level = getattr(logging, args.log_level.upper())
        #log.setLevel(level)

    if args.client:
        client1(port=args.port if args.port else int(open(args.portfile).read()), hostname=args.hostname)
        sys.exit(0)

    if not args.port:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM); s.bind(('',0)) # pick a free port
        args.port = s.getsockname()[1]
        del s

    if args.portfile:
        open(args.portfile,'w').write(str(args.port))

    pidfile = os.path.abspath(args.pidfile) if args.pidfile else ''
    logfile = os.path.abspath(args.logfile) if args.logfile else ''

    main = lambda: run_server(port=args.port, address=args.address, pidfile=pidfile, logfile=logfile)
    if args.daemon:
        import daemon
        with daemon.DaemonContext():
            main()
    else:
        main()
