#!/usr/bin/env python
"""
Worker server
"""
import json, logging, os, socket, sys, time

import parsing

NULL = '\0'

logging.basicConfig()
log = logging.getLogger('worker')
log.setLevel(logging.INFO)

whoami = os.getlogin()

def send(conn, data):
    conn.send(str(len(data))+NULL+data)

def recv(conn):
    n = ''
    while True:
        a = conn.recv(1)
        if len(a) == 0: return None  # EOF
        if a == NULL: break
        n += a
    n = int(n)
    m = ''
    while len(m) < n:
        t = conn.recv(min(8192,n-len(m)))
        if len(t) == 0: return None  # EOF
        m += t
    return m

def client1(port, hostname):
    conn = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    conn.connect((hostname, int(port)))
    id = 0
    while True:
        code = parsing.get_input('sage [%s]: '%id)
        if code is None:  # EOF
            break
        mesg = {'execute':code, 'id':id}
        send(conn, json.dumps(mesg))
        while True:
            mesg = recv(conn)
            if mesg is None:
                return
            print mesg
            if json.loads(mesg)['done']:
                break
            
def child(conn):
    while True:
        mesg = recv(conn)
        print mesg
        if mesg is None: break
        send(conn, json.dumps({'done':True, 'foo':'bar'}))

connections = []
def serve(port):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(('', port))
    log.info('listening on port %s', port)
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
        client1(port=args.port, hostname=args.hostname)
        sys.exit(0)

    if not args.port:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM); s.bind(('',0)) # pick a free port
        args.port = s.getsockname()[1]
        del s

    pidfile = os.path.abspath(args.pidfile) if args.pidfile else ''
    logfile = os.path.abspath(args.logfile) if args.logfile else ''
    main    = lambda: run_server(port=args.port, pidfile=pidfile, logfile=logfile)
    
    if args.daemon:
        import daemon
        with daemon.DaemonContext():
            main()
    else:
        main()
