"""
Backend Server

The backend server proccesses run on each compute node.  The frontend
sends clients here to either start a new session or join an existing
computing session.  On a multiprocessor machine, we could have several
of these running on the same computer in order to balance the load
between them.  The backend server is a TornadoWeb application.  It:

* Registers itself with the frontend

* HTTP server:
   - static html/css/javascript of socket.io application:
        - desktop version
        - mobile version 
   - load statistics
   
* Socket.io server that handles connections from desktop/mobile
  application

* Spawn (jailed/limited) worker processes

* Communication with worker processes via a *non-blocking* Unix Domain
  Socket

"""


from tornado import web
from tornadio2 import SocketConnection, TornadioRouter, SocketServer, event
import logging


class IndexHandler(web.RequestHandler):
    def get(self):
        self.write("Backend Server")

class SocketIO(SocketConnection):
    clients = set()

    def on_open(self, *args, **kwargs):
        self.clients.add(self)
        print "new connection: %s"%self
        
router = TornadioRouter(SocketIO)

routes = [(r"/", IndexHandler),
          (r"/static/(.*)", web.StaticFileHandler)]

def run(port, address, debug):
    if debug:
        logging.getLogger().setLevel(logging.DEBUG)

    app = web.Application(router.apply_routes(routes),
                socket_io_port=port, socket_io_address=address, debug=debug)

    SocketServer(app, auto_start=True)
        



