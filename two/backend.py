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

import argparse, logging, socket, tempfile

from tornado import web, iostream
from tornadio2 import SocketConnection, TornadioRouter, SocketServer, event

from backend_mesg import MESG

class IndexHandler(web.RequestHandler):
    def get(self):
        self.write("Backend Server")

class LaunchWorkerInstanceHandler(web.RequestHandler):
    def post(self):
        # create socket
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM, 0)
        #socket_name = tempfile.mktemp()
        socket_name = 'a'
        s.bind(socket_name)
        conn, addr = s.accept()
        stream = iostream.IOStream(conn)
        
        
        # todo -- verify that user who can launch process is logged in
        
        # launch process pointed at new socket
        
        # return id number for process
        

class SocketIO(SocketConnection):
    clients = set()

    def on_open(self, *args, **kwargs):
        self.clients.add(self)
        print "new connection: %s"%self
        
router = TornadioRouter(SocketIO)

routes = [(r"/", IndexHandler),
          (r"/static/(.*)", web.StaticFileHandler)]

def run(port, address, debug, secure):
    print "Launching backend%s: http%s://%s:%s"%(
        ' in debug mode' if debug else ' in production mode',
        's' if secure else '',
        address if address else '*', port)

    if debug:
        logging.getLogger().setLevel(logging.DEBUG)

    if secure:  # todo
        raise NotImplementedError

    app = web.Application(router.apply_routes(routes),
                socket_io_port=port, socket_io_address=address, debug=debug)

    SocketServer(app, auto_start=True)
        
if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Run backend server instance")

    parser.add_argument("-p", dest='port', type=int, default=8080,
                        help="port the server listens on (default: 8080)")
    parser.add_argument("-a", dest="address", type=str, default="",
                        help="address the server listens on (default: '')")
    parser.add_argument("-d", dest="debug", action='store_const', const=True,
                        help="debug mode (default: False)", default=False)
    parser.add_argument("-s", dest="secure", action='store_const', const=True,
                        help="SSL secure mode (default: False)", default=False)
    
    args = parser.parse_args()
    run(args.port, args.address, args.debug, args.secure)



