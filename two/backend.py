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

import argparse, logging, Queue, simplejson, socket, tempfile

from tornado import web, iostream
from tornadio2 import SocketConnection, TornadioRouter, SocketServer, event

from backend_mesg import MESG

class IndexHandler(web.RequestHandler):
    def get(self):
        # TODO: need to detect mobile versus desktop here
        self.render("static/sagews/desktop/backend.html")

#############################################################
# Sage sessions
#############################################################
next_sage_session_id = 0
sage_sessions = {}

def new_sage_session():
    global next_sage_session_id
    id = next_sage_session_id
    next_sage_session_id += 1
    session = SageSession(id)
    sage_sessions[id] = session
    return session

class SageSession(object):
    def __init__(self, id):
        self.id = id
        socket_name = 'a' # TODO
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM, 0)
        stream = iostream.IOStream(s)
        stream.connect(socket_name)
        self._stream = stream
        self._mesg_queue = Queue.Queue()
        self._receiving = False

    def _send(self, mesg, callback=None):
        self._stream.write(simplejson.dumps(mesg) + '\0', callback=callback)

    def _recv(self, callback=None):
        self._stream.read_until('\0', lambda s: callback(simplejson.loads(s[:-1])))

    def __del__(self):
        self._stream.close()

    def send(self, mesg, sender):
        self._mesg_queue.put((mesg, sender))
        self._handle_next_mesg()

    def _handle_next_mesg(self):
        if self._receiving or self._mesg_queue.empty():
            return
        mesg, sender = self._mesg_queue.get()
        self._receiving = True
        
        def handle_message(mesg):
            sender.emit('recv', mesg)
            if mesg['status'] == 'done':
                self._receiving = False
                # handle another message, if there is one in the queue
                self._handle_next_mesg()
            else:
                # receive next message about this computation
                self._recv(handle_message)
                
        def when_done_sending():
            self._recv(handle_message)
            
        self._send(mesg, when_done_sending)
        

#############################################################
# Socket.io server
#############################################################
class SocketIO(SocketConnection):
    clients = set()

    def on_open(self, *args, **kwargs):
        self.clients.add(self)
        print "new connection: %s"%self

    @event
    def new_session(self):
        """
        Returns a new session id.
        """
        self.emit('new_session', new_sage_session().id)

    @event
    def session_send(self, id, mesg):
        """
        Send a JSON mesg to the Sage session with given id.
        Returns {'status':'ok'} or {'status':'error', 'mesg':'...'}.
        """
        if not isinstance(id, int):
            return {'status':'error', 'mesg':'session id must be an integer'}
        if id not in sage_sessions:
            return {'status':'error', 'mesg':'unknown session id'}

        sage_sessions[id].send(mesg, self)
    
        
#############################################################
# Configure and run the socket.io/web server
#############################################################
        
router = TornadioRouter(SocketIO)
routes = [(r"/", IndexHandler),
          (r"/static/(.*)", web.StaticFileHandler, {'path':'static'})]

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
        
#############################################################
# Command line interface
#############################################################

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



