#!/usr/bin/env python
"""
sagenb.py -- start a sage notebook server
"""

########################################################################################
#       Copyright (C) 2012 William Stein <wstein@gmail.com>
#
#  Distributed under the terms of the GNU General Public License (GPL), version 2+
#
#                  http://www.gnu.org/licenses/
#########################################################################################

import logging, sys

# configure logging
logging.basicConfig()
log = logging.getLogger('sage_server')
log.setLevel(logging.INFO)

def serve(path, port, address):
    log.info("served")

            
def run_sagenb(path, port, address, pidfile, logfile):
    if pidfile:
        open(pidfile,'w').write(str(os.getpid()))
    if logfile:
        log.addHandler(logging.FileHandler(logfile))
    log.info("port=%s, address=%s, pidfile='%s', logfile='%s'", port, address, pidfile, logfile)
    try:
        serve(path, port, address)
    finally:
        if pidfile:
            os.unlink(pidfile)

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Create two users, and run a Sage notebook server, with code evaluated by one user and the notebook server process run as the other user.")
    
    parser.add_argument("--port", dest="port", type=int, default=8080, help="port to listen on (default: 8080)")
    parser.add_argument("--path", dest="path", type=int, help="path in which to store sage notebook files")
    parser.add_argument("--daemon", dest="daemon", default=False, action="store_const", const=True,
                        help="daemon mode (default: False)")
    parser.add_argument("--address", dest="address", type=str,
                        help="address of interface to bind to")
    parser.add_argument("--pidfile", dest="pidfile", type=str, default='',
                        help="store pid in this file")
    parser.add_argument("--logfile", dest="logfile", type=str, default='',
                        help="store log in this file (default: '' = don't log to a file)")

    parser.add_argument("--log_level", dest='log_level', type=str, default='INFO',
                        help="log level (default: INFO) useful options include WARNING and DEBUG")

    args = parser.parse_args()

    if not args.address:
        print "%s: must specify address to bind to"%sys.argv[0]
        sys.exit(1)

    if args.daemon and not args.pidfile:
        print "%s: must specify pidfile in daemon mode"%sys.argv[0]
        sys.exit(1)
    
    if args.log_level:
        level = getattr(logging, args.log_level.upper())
        log.setLevel(level)

    pidfile = os.path.abspath(args.pidfile) if args.pidfile else ''
    logfile = os.path.abspath(args.logfile) if args.logfile else ''
    
    main = lambda: run_sagenb(args.path, args.port, args.address, pidfile, logfile)
    if args.daemon:
        import daemon
        with daemon.DaemonContext():
            main()
    else:
        main()
