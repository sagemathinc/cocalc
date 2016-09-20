# A very simple interface exposed from setup.py

import os, socket, sys
import time

def log(s):
    sys.stderr.write('sage_server: %s\n'%s)
    sys.stderr.flush()

def main(action='', daemon=True):
    SMC = os.environ['SMC']
    PATH = os.path.join(SMC, 'sage_server')
    if not os.path.exists(PATH):
        os.makedirs(PATH)
    file = os.path.join(PATH, 'sage_server.')

    pidfile = file + 'pid'
    portfile = file + 'port'
    logfile = file + 'log'

    if action == '':
        if len(sys.argv) <= 1:
            action = ''
        else:
            action = sys.argv[1]

    def start():
        log("starting...")
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM); s.bind(('',0)) # pick a free port
        port = s.getsockname()[1]
        del s
        log("port=%s"%port)
        open(portfile,'w').write(str(port))
        open(logfile, 'w')  # for now we clear it on restart...
        log("setting logfile to %s"%logfile)

        t0 = time.time()
        import sage_server
        log("seconds to import sage_server: %s"%(time.time() - t0))
        run_server = lambda: sage_server.run_server(port=port, host='127.0.0.1', pidfile=pidfile, logfile=logfile)
        if daemon:
            log("daemonizing")
            from daemon import daemonize
            daemonize(pidfile)
            run_server()
        else:
            log("starting in foreground")
            run_server()

    def stop():
        log("stopping...")
        if os.path.exists(pidfile):
            try:
                pid = int(open(pidfile).read())
                sid = os.getsid(pid)
                log("killing sid %s"%sid)
                os.killpg(sid, 9)
                log("successfully killed")
            except Exception, e:
                log("failed -- %s"%e)
            log("removing '%s'"%pidfile)
            os.unlink(pidfile)
        else:
            log("no pidfile")
    def usage():
        print "Usage: %s [start|stop|restart]"%sys.argv[0]
    if action == 'start':
        start()
    elif action == 'stop':
        stop()
    elif action == 'restart':
        try:
            stop()
        except:
            pass
        start()
    else:
        usage()
