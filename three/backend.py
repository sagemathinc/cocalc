# -*- coding: utf-8 -*-
"""
Backend server

"""
import logging, socket, sys

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



if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Run backend server")
    parser.add_argument("--port", dest="port", type=int, default=0,
                        help="port to listen on (default: 0 = determined by operating system)")
    parser.add_argument('--log_level', dest='log_level', type=str, default='INFO',
                        help="log level (default: INFO) useful options include WARNING and DEBUG")

    args = parser.parse_args()
    
    if not args.port:
        # let OS pick a free port
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM); s.bind(('',0))
        args.port = s.getsockname()[1]
        del s

    if args.log_level:
        level = getattr(logging, args.log_level.upper())
        log.setLevel(level)

    Router = sockjs.tornado.SockJSRouter(Connection, '/backend')
    app = tornado.web.Application(Router.urls, debug=True)
    app.listen(args.port)

    log.info("listening on port %s"%args.port)
    tornado.ioloop.IOLoop.instance().start()
