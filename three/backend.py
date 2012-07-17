# -*- coding: utf-8 -*-
"""
Backend server

"""
import logging, os, socket, sys

import sockjs.tornado, tornado.ioloop, tornado.web

logging.getLogger().setLevel(logging.INFO)
log = logging.getLogger('')

class Connection(sockjs.tornado.SockJSConnection):
    connections = set()

    def on_open(self, info):
        #self.broadcast(self.connections, "User connected.")
        self.connections.add(self)
        log.info("new connection from %s", self.__dict__)

    def on_close(self):
        self.connections.remove(self)

    def on_message(self, message):
        pass

class IndexHandler(tornado.web.RequestHandler):
    def get(self):
        self.write("Backend sagews Server on Port %s"%args.port)

def run_server(port, debug, pidfile, logfile):
    try:
        open(pidfile,'w').write(str(os.getpid()))
        if logfile:
            log.addHandler(logging.FileHandler(logfile))
        Router = sockjs.tornado.SockJSRouter(Connection, '/backend')
        app = tornado.web.Application([(r"/", IndexHandler)] + Router.urls, debug=debug)
        app.listen(port)
        log.info("listening on port %s"%port)
        tornado.ioloop.IOLoop.instance().start()
    finally:
        os.unlink(pidfile)

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Run backend server")
    parser.add_argument("-p", dest="port", type=int, default=0,
                        help="port to listen on (default: 0 = determined by operating system)")
    parser.add_argument("-l", dest='log_level', type=str, default='INFO',
                        help="log level (default: INFO) useful options include WARNING and DEBUG")
    parser.add_argument("-g", dest='debug', default=False, action="store_const", const=True,
                        help="debug mode (default: False)")
    parser.add_argument("-d", dest="daemon", default=False, action="store_const", const=True,
                        help="daemon mode (default: False)")
    parser.add_argument("--pidfile", dest="pidfile", type=str, default='backend.pid',
                        help="store pid in this file (default: 'backend.pid')")
    parser.add_argument("--logfile", dest="logfile", type=str, default='',
                        help="store log in this file (default: '')")

    args = parser.parse_args()
    
    if not args.port:
        # let OS pick a free port
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM); s.bind(('',0))
        args.port = s.getsockname()[1]
        del s

    if args.log_level:
        level = getattr(logging, args.log_level.upper())
        log.setLevel(level)

    pidfile = os.path.abspath(args.pidfile)
    if args.logfile:
        logfile = os.path.abspath(args.logfile)
    main = lambda: run_server(port=args.port, debug=args.debug, pidfile=pidfile, logfile=logfile)
    if args.daemon:
        import daemon
        with daemon.DaemonContext():
            main()
    else:
        main()
