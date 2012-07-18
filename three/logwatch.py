#!/usr/bin/env python

import daemon, os, time

def mtime(file):
    try:
        return os.path.getmtime(file)
    except OSError:
        return 0

def main(logfile, pidfile, timeout):
    try:
        open(pidfile,'w').write(str(os.getpid()))
        lastmod = mtime(logfile)
        while True:
            if lastmod != mtime(logfile):
                while True: # file changed; now waiting to stabilize
                    lastmod = mtime(logfile)
                    time.sleep(timeout)
                    mod = mtime(logfile)
                    if lastmod == mod:
                        # stabilized
                        print "doing it."
                        try:
                            open('/tmp/a','w').write(open(logfile).read())
                            open(logfile,'w').close()  # clear file
                        except OSError:
                            pass
                        break
            time.sleep(1)
    finally:
        os.unlink(pidfile)

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Log watcher watches the given file, then submits it to a database if it subsequently does not change for t seconds; on success it then empties the file.  The file is assumed to change as a result of rotating a log file, not because the file is actively being written to.")

    parser.add_argument("-g", dest='debug', default=False, action="store_const", const=True,
                        help="debug mode (default: False)")
    parser.add_argument("-l", dest='logfile', type=str, 
                        help="when this file changes it is sent to the database server")
    parser.add_argument("-d", dest="database", type=str,
                        help="SQLalchemy description of database server, e.g., postgresql://user@hostname:port/dbname")
    parser.add_argument("-p", dest="pidfile", type=str,
                        help="PID file of this daemon process")
    parser.add_argument("-t", dest="timeout", type=int, default=2,
                        help="time in seconds file must remain unchanged after modification before we send to database")
    

    args = parser.parse_args()
    logfile = os.path.abspath(args.logfile)
    pidfile = os.path.abspath(args.pidfile)
    timeout = args.timeout

    if args.debug:
        main(logfile, pidfile, timeout)
    else:
        with daemon.DaemonContext():
            main(logfile, pidfile, timeout)
    
    
    
