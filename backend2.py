"""
Backend Compute Process

Tornado + TorandIO2 application.
"""

import logging, os, sys

from tornado import web
from tornadio2 import SocketConnection, TornadioRouter, SocketServer, event


ROOT = os.path.normpath(os.path.dirname(__file__))


class IndexHandler(web.RequestHandler):
    def get(self):
        self.render('templates/demo5.html')

class SocketIOHandler(web.RequestHandler):
    def get(self):
        self.render('static/socketio/socket.io.js')

class jQueryIOHandler(web.RequestHandler):
    def get(self):
        self.render('static/jquery/jquery-1.7.1.min.js')

class ExecuteConnection(SocketConnection):
    @event
    def execute(self, id, code):
        self.emit('output', id, eval(code))

def run(port, debug):
    if debug:
        import logging
        logging.getLogger().setLevel(logging.DEBUG)
    ExecuteRouter = TornadioRouter(ExecuteConnection)
    application = web.Application(
        ExecuteRouter.apply_routes([(r"/", IndexHandler),
                                 (r"/socket.io.js", SocketIOHandler),
                                 (r"/jquery-1.7.1.min.js", jQueryIOHandler)]),
        flash_policy_port = 843,
        flash_policy_file = os.path.join(ROOT, 'flashpolicy.xml'),
        socket_io_port = port,
        debug=debug
    )
    SocketServer(application)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print "Usage: %s PORT [DEBUG]"%sys.argv[0]
        sys.exit(1)
    port = int(sys.argv[1])
    if len(sys.argv) >= 3:
        debug = eval(sys.argv[2])
    else:
        debug = False
    run(port, debug)
