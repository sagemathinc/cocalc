"""
Backend Server

The backend server proccesses run on each compute node.  The frontend
sends clients here to either start a new session or join an existing
computing session.  On a multiprocessor machine, we could have several
of these running on the same computer in order to balance the load
between them.  The backend server is a TornadoWeb application.  It:

* Sends status updates to the frontend

* HTTP server:
   - static html/css/javascript of socket.io application:
        - desktop version
        - mobile version 
   - load statistics
   
* Socket.io server that handles connections from desktop/mobile
  application

* Spawn (jailed/limited) worker processes

* Communication with worker processes via a *non-blocking* Unix Domain
  Socket.

"""

DATA = None

import argparse, os, Queue, signal, simplejson, socket, tempfile, time

from tornado import web, iostream
from tornadio2 import SocketConnection, TornadioRouter, SocketServer, event

import misc

##########################################################
# Setup logging
##########################################################
import logging
logging.basicConfig()
log = logging.getLogger()

#############################################################
# HTTP Server handlers
#############################################################

class IndexHandler(web.RequestHandler):
    def get(self):
        # TODO: need to detect mobile versus desktop here
        self.render("static/sagews/desktop/backend.html")
        #self.render("static/sagews/mobile/backend.html")

class RegisterManagerHandler(web.RequestHandler):
    def post(self):
        m = Manager(self.get_argument('socket_name'))
        if m not in managers:
            unallocated_managers.append(m)

#############################################################
#  Start a worker process
#############################################################

def start_worker():
    cmd = "exec ./sage worker.py --backend_port=%s &"%args.port
    log.debug(os.popen(cmd).read())


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
        log.debug("new connection: %s"%self)

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

def status_update_uri(frontend_uri):
    return frontend_uri + '/backend/send_status_update'

def send_status_mesg(id, frontend_uri, status):
    uri = status_update_uri(frontend_uri)
    data={'id':id, 'status':status}
    log.debug("Sending status update to %s with data=%s"%(uri, data))
    misc.post(uri, data=data)

def start_mesg(id, frontend_uri):
    send_status_mesg(id, frontend_uri, 'running')

def stop_mesg(id, frontend_uri):
    send_status_mesg(id, frontend_uri, 'stopped')

def run(id, port, address, debug, secure, frontend_uri):
    if os.path.exists(pidfile):
        try:
            pid = int(open(pidfile).read())
            os.kill(pid, 0)
            raise RuntimeError, "server with process %s already running"%pid
        except OSError:
            pass

    open(pidfile,'w').write(str(os.getpid()))
        
    log.debug("Launching backend%s: http%s://%s:%s"%(
        ' in debug mode' if debug else ' in production mode',
        's' if secure else '',
        address if address else '*', port))

    if secure:  # todo
        raise NotImplementedError

    app = web.Application(router.apply_routes(routes),
                socket_io_port=port, socket_io_address=address, debug=debug)

    if frontend_uri:
        start_mesg(id, frontend_uri)

    try:
        SocketServer(app, auto_start=True)
    except Exception, mesg:
        log.debug(str(mesg))
        # now it has stopped, so we remove the pidfile
        os.unlink(pidfile)
        # and send a stop message
        if frontend_uri:
            stop_mesg(id, frontend_uri)

def stop(id, frontend_uri):
    if not os.path.exists(pidfile):
        log.debug("No pidfile, so nothing to stop.")
    else:
        pid = int(open(pidfile).read())
        quits = 5
        for i in range(50):  # try at most n times
            try:
                if quits:
                    os.kill(pid, signal.SIGQUIT)
                    log.debug("Sent SIGQUIT to process %s"%pid)
                    quits -= 1
                else:
                    os.kill(pid, signal.SIGKILL)
                    log.debug("Sent SIGKILL to process %s"%pid)                            
                time.sleep(.25)
            except OSError:
                log.debug("Process %s has died"%pid)
                if os.path.exists(pidfile): # it could be there if death was not clean
                    try:
                        os.unlink(pidfile)
                    except OSError:  # just in case
                        pass
                break
                
    if frontend_uri:
        stop_mesg(id, frontend_uri)

        
#############################################################
# Command line interface
#############################################################

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Run or stop a backend server instance")

    parser.add_argument("--id", dest="id", type=int, default='1',
                        help="database id number of backend server (default: 1)")
    parser.add_argument("--port", dest='port', type=int, default=8080,
                        help="port the server listens on (default: 8080)")
    parser.add_argument("--address", dest="address", type=str, default="",
                        help="address the server listens on (default: '')")
    parser.add_argument("--debug", "-d", dest="debug", action='store_const', const=True,
                        help="debug mode (default: True)", default=True)
    parser.add_argument("--secure", "-s", dest="secure", action='store_const', const=True,
                        help="SSL secure mode (default: False)", default=False)
    parser.add_argument("--frontend", dest="frontend_uri", type=str,
                        help="URI of frontend server to status update to", default='')
    parser.add_argument("--stop", dest="stop", type=bool, 
                        help="Stop the backend with given id, if it is running", default=False)
    
    args = parser.parse_args()

    # setup data directory variable
    DATA = os.path.join('data', 'backend-%s'%args.id)
    if not os.path.exists(DATA):
        os.makedirs(DATA)
    pidfile = os.path.join(DATA, 'pid')

    if args.debug:
        log.setLevel(logging.DEBUG)

    if args.stop:
        stop(args.id, args.frontend_uri)
    else:
        run(args.id, args.port, args.address, args.debug, args.secure, args.frontend_uri)



