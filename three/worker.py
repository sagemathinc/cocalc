#!/usr/bin/env python
"""
Worker server
"""
import json, logging, os, resource, shutil, signal, socket, sys, tempfile, threading, time, traceback

import parsing

NULL = '\0'
JSON = 'J'
TERM = 'T'
CONF = '\1'
PID = 'd'
STR = 's'

logging.basicConfig()
log = logging.getLogger('worker')
log.setLevel(logging.INFO)

whoami = os.environ['USER']

def send(conn, typecode, data):
    conn.send(str(len(data)+1)+NULL+typecode+data)

def recv(conn):
    n = ''
    while True:
        a = conn.recv(1)
        if len(a) == 0: return None, None  # EOF
        if a == NULL: break
        n += a
    n = int(n)
    m = ''
    while len(m) < n:
        t = conn.recv(min(8192,n-len(m)))
        if len(t) == 0: return None, None  # EOF
        m += t
    if len(m) < 1: return None, None
    return m[0], m[1:]

def client1(port, hostname):
    conn = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    conn.connect((hostname, int(port)))

    # send configuration
    send(conn, CONF, json.dumps({'maxtime':3600, 'cputime':3600}))

    send(conn, PID, '')
    pid = int(recv(conn)[1])
    print "PID = %s"%pid
    
    id = 0
    while True:
        try:
            code = parsing.get_input('sage [%s]: '%id)
            if code is None:  # EOF
                break
            mesg = {'execute':code, 'id':id}
            send(conn, JSON, json.dumps(mesg))
            while True:
                typecode, mesg = recv(conn)
                if mesg is None:
                    return
                elif typecode == TERM:
                    return
                elif typecode == JSON:
                    mesg = json.loads(mesg)
                    if 'stdout' in mesg:
                        sys.stdout.write(mesg['stdout']); sys.stdout.flush()
                    if 'stderr' in mesg:
                        print '!  ' + '\n!  '.join(mesg['stderr'].splitlines())
                    if mesg['done'] and mesg['id'] >= id:
                        break
            id += 1
            
        except KeyboardInterrupt:
            print "Sending interrupt signal"
            conn2 = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            conn2.connect((hostname, int(port)))
            send(conn2, CONF, json.dumps({'control':'sigint', 'pid':pid}))
            del conn2
            id += 1
            
    send(conn, TERM, '')
    print "\nExiting Sage worker client."

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
        send(conn, JSON, json.dumps({'stdout':output, 'id':id, 'done':done}))
    def send_stderr(output, done):
        send(conn, JSON, json.dumps({'stderr':output, 'id':id, 'done':done}))
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
            sys.stdout.flush()
            sys.stderr.flush(done=True)
        else:
            sys.stdout.flush(done=True)
        (sys.stdout, sys.stderr) = streams

def handle_json_mesg(conn, mesg):
    mesg = json.loads(mesg)
    if 'execute' in mesg:
        execute(conn=conn, id=mesg['id'], code=mesg['execute'], preparse=mesg.get('preparse',True))
    else:
        send(conn, JSON, json.dumps({'error':"no action associated with message", 'done':True, 'id':mesg['id']}))


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
def session(conn, home, cputime, nofile, vmem):
    pid = os.getpid()
    if home is not None:
        drop_privileges(pid%5000+5000, home)

    if cputime is not None:
        resource.setrlimit(resource.RLIMIT_CPU, (cputime,cputime))
    if nofile is not None:
        resource.setrlimit(resource.RLIMIT_NOFILE, (nofile,nofile))
    if vmem is not None:
        if os.uname()[0] == 'Linux':
            resource.setrlimit(resource.RLIMIT_AS, (vmem*1048576L, -1L))
    else:
        log.warning("Server not running on Linux, so there are NO memory constraints.")

    def handle_parent_sigquit(signum, frame):
        send(conn, TERM, '')
        sys.exit(0)
        
    signal.signal(signal.SIGQUIT, handle_parent_sigquit)

    while True:
        try:
            typecode, mesg = recv(conn)
            print 'INFO:child%s: received JSON message "%s" %s'%(pid, mesg, typecode)  # TODO
            if mesg is None: break
            if typecode == TERM:
                return
            elif typecode == PID:
                send(conn,STR,str(os.getpid()))
            elif typecode == JSON:
                handle_json_mesg(conn, mesg)
            else:
                raise RuntimeError("unknown message code: %s"%typecode)
        except KeyboardInterrupt:
            pass

def rmtree(path):
    if not path.startswith('/tmp/') or path.startswith('/var/') or path.startswith('/private/'):
        log.error("Trying to rmtree on '%s' is very suspicious! Refusing!", path)
    else:
        log.info("Removing '%s'", path)
        shutil.rmtree(path)

class Connection(object):
    def __init__(self, pid, home, maxtime):
        self._pid = pid
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
        if self._home is not None:
            rmtree(self._home)
            

connections = {}

CONNECTION_TERM_INTERVAL = 15
def check_for_connection_timeouts():
    global kill_timer
    print "Checking for connection timeouts...: %s"%connections
    
    for pid, C in connections.items():
        tm = C.time_remaining()
        if tm is not None and tm < 0:
            try:
                if tm <= -3*CONNECTION_TERM_INTERVAL:
                    connections[pid].remove_files()
                    del connections[pid]
                elif tm <= -2*CONNECTION_TERM_INTERVAL:
                    C.signal(signal.SIGKILL)
                else:
                    C.signal(signal.SIGQUIT)
            except OSError:
                # means process is already dead
                connections[pid].remove_files()                
                del connections[pid]
    kill_timer = threading.Timer(CONNECTION_TERM_INTERVAL, check_for_connection_timeouts)
    kill_timer.start()

def handle_session_term(signum, frame):
    while True:
        try:
            pid, exit_status = os.waitpid(-1, os.WNOHANG)
        except:
            return
        if not pid: return
        if pid in connections:
            log.info("Cleaning up after child process %s", pid)
            del connections[pid]

def control(mesg):
    log.info("control message: '%s'", mesg)
    action = mesg['control']
    if action == 'sigint':
        if 'pid' not in mesg:
            log.error("missing 'pid' key")
        else:
            os.kill(mesg['pid'], signal.SIGINT)
    else:
        log.error("unknown control action: '%s'", action)
    

def serve(port, whitelist):
    global connections, kill_timer
    check_for_connection_timeouts()
    signal.signal(signal.SIGCHLD, handle_session_term)

    log.info('pre-importing the sage library...')
    import sage.all
    exec "from sage.all import *" in namespace
    
    log.info('opening connection on port %s', port)
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(('', port))
    s.listen(5)
    pid = -1
    try:
        while True:
            log.info('waiting for connection')
            try:
                conn, addr = s.accept()
            except socket.error, msg:
                log.info('error accepting connection: %s', msg)

            if whitelist and addr[0] not in whitelist:
                log.warning("connection attempt from '%s' which is not in whitelist (=%s)", addr[0], whitelist)
                continue

            # first message is a configuration in json format
            typecode, config = recv(conn)
            if typecode != CONF:
                log.error('invalid config -- wrong typecode')
                continue
            else:
                config = json.loads(config)

            log.info('config = %s', config)

            if 'control' in config:
                # handle a control message
                control(config)
                continue
            
            home = tempfile.mkdtemp() if whoami == 'root' else None
            pid = os.fork()
            if pid == 0:
                session(conn, home, cputime=config.get('cputime', None),
                        nofile=config.get('nofile',None), vmem=config.get('vmem',None))
                sys.exit(0)
            else:
                connections[pid] = Connection(pid, home, maxtime=config.get('maxtime',None))
                log.info('accepted connection from %s (pid=%s)', addr, pid)
                
    except Exception, err:
        import traceback
        traceback.print_exc(file=sys.stdout)
        log.error("error: %s %s", type(err), str(err))
    finally:
        if pid: # parent
            kill_timer.cancel()
            connections = {}  # triggers garbage collection, kills all outstanding workers and cleans up
            log.info("closing socket")
            s.shutdown(0)
            s.close()
            log.info("waiting for forked subprocesses to terminate")
            try:
                os.wait()
            except OSError:
                pass
        

def run_server(port, pidfile, logfile, whitelist):
    try:
        if pidfile:
            open(pidfile,'w').write(str(os.getpid()))
        if logfile:
            log.addHandler(logging.FileHandler(logfile))
        log.info("port=%s, pidfile='%s', logfile='%s', whitelist=%s", port, pidfile, logfile, whitelist)
        serve(port, whitelist)
    finally:
        if pidfile:
            os.unlink(pidfile)

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Run worker server")
    parser.add_argument("-p", dest="port", type=int, default=0,
                        help="port to listen on (default: 0 = determined by operating system)")
    parser.add_argument("-l", dest='log_level', type=str, default='INFO',
                        help="log level (default: INFO) useful options include WARNING and DEBUG")
    parser.add_argument("-d", dest="daemon", default=False, action="store_const", const=True,
                        help="daemon mode (default: False)")
    parser.add_argument("--pidfile", dest="pidfile", type=str, default='',
                        help="store pid in this file")
    parser.add_argument("--logfile", dest="logfile", type=str, default='',
                        help="store log in this file (default: '' = don't log to a file)")
    parser.add_argument("--whitelist", dest="whitelist", type=str, default='',
                        help="comma separated list of ip addresses from which we will accept incoming connnections (empty=accept any connection)")

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
        level = getattr(logging, args.log_level.upper())
        log.setLevel(level)

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
    whitelist = args.whitelist.split(',') if args.whitelist else []
    
    main    = lambda: run_server(port=args.port, pidfile=pidfile, logfile=logfile, whitelist=whitelist)
    if args.daemon:
        import daemon
        with daemon.DaemonContext():
            main()
    else:
        main()
