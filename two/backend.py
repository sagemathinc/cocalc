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

import argparse, logging, os, Queue, simplejson, socket, tempfile

from tornado import web, iostream
from tornadio2 import SocketConnection, TornadioRouter, SocketServer, event

#############################################################
# HTTP Server handlers
#############################################################

class IndexHandler(web.RequestHandler):
    def get(self):
        # TODO: need to detect mobile versus desktop here
        #self.render("static/sagews/desktop/backend.html")
        self.render("static/sagews/mobile/backend.html")

class RegisterManagerHandler(web.RequestHandler):
    def post(self):
        m = Manager(self.get_argument('socket_name'))
        if m not in managers:
            unallocated_managers.append(m)

#############################################################
# Sage Managers and worker sessions
#############################################################
unallocated_managers = []
managers = {}
next_sage_session_id = 0
sage_sessions = {}

def manager_for_user(username):
    """
    Return a valid manager for the given user, if there are any
    registered managers available.
    """
    if username in managers:
        M = managers[username]
        if M.is_valid():
            return M
    while len(unallocated_managers) > 0:
        M = unallocated_managers.pop()
        if M.is_valid():
            managers[username] = M
            return M
    raise RuntimeError, "no available valid managers"
    
            

class Manager(object):
    def __init__(self, socket_name):
        self._socket_name = socket_name

    def __hash__(self):
        return hash(self._socket_name)

    def __cmp__(self, other):
        return cmp(type(self),type(other)) and cmp(self._socket_name, other._socket_name)

    def is_valid(self):
        # todo: can probably do better than this
        return os.path.exists(self._socket_name)

    def new_session(self):
        global next_sage_session_id
        id = next_sage_session_id
        next_sage_session_id += 1
        session = SageSession(id=id, socket_name=self._socket_name)
        sage_sessions[id] = session
        return session

class SageSession(object):
    def __init__(self, id, socket_name):
        self.id = id
        self._socket_name = socket_name
        self._stream = None
        self.connect()

    def connect(self):
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM, 0)
        stream = iostream.IOStream(s)
        stream.connect(self._socket_name)
        self._stream = stream
        self._mesg_queue = Queue.Queue()
        self._receiving = False

    def is_connected(self):
        """
        Return True if this session is currently connected.
        """
        return (self._stream is not None) and not self._stream.closed()

    def _send(self, mesg, callback=None):
        self._stream.write(simplejson.dumps(mesg) + '\0', callback=callback)

    def _recv(self, callback=None):
        self._stream.read_until('\0', lambda s: callback(simplejson.loads(s[:-1])))

    def __del__(self):
        if self._stream is not None:
            self._stream.close()

    def send(self, mesg, sender):
        if not self.is_connected():
            sender.emit('recv', {'status':'closed', 'error':'socket is not connected', 'done':True})
            return
        self._mesg_queue.put((mesg, sender))
        self._handle_next_mesg()

    def _handle_next_mesg(self):
        if self._receiving or self._mesg_queue.empty():
            return
        mesg, sender = self._mesg_queue.get()
        self._receiving = True

        try:
            def handle_message(mesg):
                sender.emit('recv', mesg)
                if mesg.get('done'):
                    self._receiving = False
                    # handle another message, if there is one in the queue
                    self._handle_next_mesg()
                else:
                    # receive next message about this computation
                    self._recv(handle_message)

            def when_done_sending():
                self._recv(handle_message)

            self._send(mesg, when_done_sending)
        except IOError, err:
            # the socket connection closed for some reason; record this fact
            self._stream = None
            sender.emit('recv', {'status':'closed', 'error':str(err), 'done':True})


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
        Sends new session id via new_session message.
        """
        # Todo: figure out username properly
        username = 'wstein'
        try:
            self.emit('new_session', manager_for_user(username).new_session().id)
        except RuntimeError:
            # no manager available
            self.emit('new_session', -1)

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
          (r"/register_manager", RegisterManagerHandler),
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



