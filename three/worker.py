#!/usr/bin/env python
"""
Worker server
"""
import json, logging, os, socket, sys, time, traceback

import parsing

NULL = '\0'
JSON = 'J'

logging.basicConfig()
log = logging.getLogger('worker')
log.setLevel(logging.INFO)

whoami = os.getlogin()

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
                if mesg is None: return
                if typecode == JSON:
                    mesg = json.loads(mesg)
                    if 'stdout' in mesg:
                        sys.stdout.write(mesg['stdout']); sys.stdout.flush()
                    if 'stderr' in mesg:
                        print '!  ' + '\n!  '.join(mesg['stderr'].splitlines())
                    if mesg['done']:
                        break
            id += 1
        except KeyboardInterrupt:
            print "Press Control-D to quit."
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

namespace = {}
def child(conn):
    exec "from sage.all_cmdline import *" in namespace
    pid = os.getpid()
    while True:
        typecode, mesg = recv(conn)
        if mesg is None: break
        if typecode == JSON:
            print 'INFO:child%s: received JSON message "%s"'%(pid, mesg)  # TODO -- remove/comment out (can't log in child)
            handle_json_mesg(conn, mesg)
        else:
            raise RuntimeError("unknown message code: %s"%mesg[0])

connections = []
def serve(port):
    log.info('pre-importing the sage library...')
    import sage.all_cmdline
    
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
            pid = os.fork()
            if pid == 0:
                child(conn)
            else:
                connections.append(pid)
                log.info('accepted connection (pid=%s)', pid)
    except Exception, err:
        import traceback
        traceback.print_exc(file=sys.stdout)
        log.error("error: %s %s", type(err), str(err))
    finally:
        if pid: # parent
            for p in connections:
                try:
                    os.kill(p, 9)
                except OSError:
                    pass
            log.info("closing socket")
            s.shutdown(0)
            s.close()
            log.info("waiting for forked subprocesses to terminate")
            try:
                os.wait()
            except OSError:
                pass
        

def run_server(port, pidfile, logfile):
    try:
        if pidfile:
            open(pidfile,'w').write(str(os.getpid()))
        if logfile:
            log.addHandler(logging.FileHandler(logfile))
        log.info("port=%s, pidfile='%s', logfile='%s'", port, pidfile, logfile)
        serve(port)
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
    parser.add_argument("--portfile", dest="portfile", type=str, default='',
                        help="write port to this file")
    parser.add_argument("-c", dest="client", default=False, action="store_const", const=True,
                        help="run in test client mode number 1 (command line)")
    parser.add_argument("--hostname", dest="hostname", type=str, default='', 
                        help="hostname to connect to in client mode")

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
    main    = lambda: run_server(port=args.port, pidfile=pidfile, logfile=logfile)
    
    if args.daemon:
        import daemon
        with daemon.DaemonContext():
            main()
    else:
        main()
