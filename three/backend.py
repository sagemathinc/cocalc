#!/usr/bin/env python
"""
Backend server

    - user authentication: facebook and google

    - persistent connections to workers via protocol buffers over an
      unencrypted TCP network socket

    - persistent connections to web browsers via JSON over sockjs and
      other data over HTTP
      
    - transient connections to other backends via protocol buffers
      over a secure SSL encrypted TCP socket

"""
import json, logging, os, socket, sys

from tornado import ioloop
from tornado import iostream
import sockjs.tornado, tornado.web

###########################################
# logging
###########################################
logging.basicConfig()
log = logging.getLogger('backend')
log.setLevel(logging.INFO)

###########################################
# authentication with Facebook and Google
###########################################
from auth import BaseHandler, GoogleLoginHandler, FacebookLoginHandler, LogoutHandler, UsernameHandler


###########################################
# transient encrypted connections to backends
###########################################

###########################################
# persistent connections to workers
###########################################

WORKER_POOL = [('', 6000)]

import struct
import mesg_pb2
from worker import message


message_types_json = json.dumps(dict([(name, val.number) for name, val in mesg_pb2._MESSAGE_TYPE.values_by_name.iteritems()]))
class MessageTypesHandler(BaseHandler):
    def get(self):
        self.write(message_types_json)

class NonblockingConnectionPB(object):
    def __init__(self, hostname, port, callback=None):
        self._sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM, 0)
        self._conn = iostream.IOStream(self._sock)
        self._conn.connect((hostname, port), callback)

    def send(self, mesg, callback=None):
        s = mesg.SerializeToString()
        length_header = struct.pack(">L", len(s))
        self._conn.write(length_header + s, callback)

    def recv(self, callback=None):
        def read_length():
            self._conn.read_bytes(4, read_mesg)
        def read_mesg(s):
            if len(s) < 4:
                if callback is not None:
                    callback(self, None)
                return
            self._conn.read_bytes(struct.unpack('>L', s)[0], handle_mesg)
        def handle_mesg(s):
            if callback is not None:
                m = mesg_pb2.Message()
                m.ParseFromString(s)
                callback(self, m)
        read_length()
    

class WorkerConnection(object):
    connections = set()

    def __init__(self, hostname, port, mesg_callback, init_callback, **options):
        self._options = options
        self._hostname = hostname
        self._port = port
        self._init_callback = init_callback
        self._mesg_callback = mesg_callback
        self._conn = NonblockingConnectionPB(hostname, port, self._start_session)

    def __del__(self):
        print "deleting worker"

    def __repr__(self):
        return "<WorkerConnection pid=%s %s:%s>"%(self._pid if hasattr(self, '_pid') else '?',
                                                  self._hostname, self._port)

    def _listen_for_messages(self):
        log.info("listen for messages: %s", self)
        io = ioloop.IOLoop.instance()
        print self._conn._sock.fileno()
        try:
            io.add_handler(self._conn._sock.fileno(), self._recv, io.READ)
        except IOError:
            # TODO: On linux for some reason sometimes the registration happens
            # multiple times for the same connection, which causes an error.
            # Ignoring the error seems to work fine. 
            pass
        self.on_open()
        if self._init_callback is not None:
            self._init_callback(self)

    def _start_session(self):
        log.info("_start_session")
        self._conn.send(message.start_session(**self._options), self._recv_pid)
        
    def _recv_pid(self):
        log.info("_recv_pid")
        def set_pid(c, mesg):
            self._pid = mesg.session_description.pid
            log.info("set_pid = %s", self._pid)
            self._listen_for_messages()
        self._conn.recv(set_pid)

    def _recv(self, fd, events):
        self._conn.recv(lambda conn, mesg: self._mesg_callback(self, mesg))

    def send(self, mesg, callback=None):
        self._conn.send(mesg, callback)

    def close(self):
        if hasattr(self, '_conn'):
            log.info("deleting %s", self)
            io = ioloop.IOLoop.instance()
            io.remove_handler(self._conn._sock.fileno())
        self.connections.remove(self)

    def on_open(self):
        self.connections.add(self)

    def on_close(self):
        self.connections.remove(self)



###########################################
# persistent connections to browsers (sockjs)
###########################################

# monkey patch websocket.py to detect https using the Origin header, since it
# works with haproxy+stunnel, whereas using self.request.protocol does not.
import sockjs.tornado.websocket
sockjs.tornado.websocket.WebSocketHandler.get_websocket_scheme = lambda self: 'wss' if self.request.headers.get('Origin', 'https').startswith('https') else 'ws'

class BrowserSocketConnection(sockjs.tornado.SockJSConnection):
    connections = set()

    def on_open(self, info):
        #self.broadcast(self.connections, "User connected.")
        self.connections.add(self)
        log.info("new connection from %s", self.__dict__)

    def on_close(self):
        self.connections.remove(self)

    def on_message(self, mesg):
        mesg = json.loads(mesg)
        log.info("on_message: '%s'", mesg)
        if mesg['type'] == mesg_pb2.Message.EXECUTE_CODE:
            self.execute_code(mesg)

    def send_obj(self, obj):
        log.info("sending: '%s'", obj)
        self.send(json.dumps(obj))

    def execute_code(self, mesg):
        log.info("executing code '%s'...", mesg)

        id = mesg['id']
        input = mesg['execute_code']['code']
        
        worker_conn = None
        def start():
            global worker_conn
            log.info("making WorkerConnection...")
            worker_conn = WorkerConnection('', 6000, mesg_callback=handle_mesg, init_callback=send_code,
                                           max_cputime=30, max_walltime=30)
            
        def send_code(worker_conn):
            log.info("got connection; now sending code")
            worker_conn.send(message.execute_code(code=input, id=id))
            
        def handle_mesg(worker_conn, mesg):
            log.info("got mesg:\n%s", mesg)
            if mesg.type == mesg_pb2.Message.OUTPUT:
                if mesg.output.done:
                    worker_conn.close()
                mesg2 = {'type':mesg.type, 'id':mesg.id, 'output':{'done':mesg.output.done}}
                mesg2['output']['stdout'] = mesg.output.stdout
                mesg2['output']['stderr'] = mesg.output.stderr
                log.info("translated to: %s", mesg2)
                self.send_obj(mesg2)
        start()

class IndexHandler(BaseHandler):
    def get(self):
        log.info("connection from %s", self.current_user)
        self.write("Backend sagews Server on Port %s"%args.port)

class AliveHandler(BaseHandler):
    def options(self):
        self.write("ok")

###########################################
# tornado web server
###########################################

def run_server(base, port, debug, pidfile, logfile):
    try:
        open(pidfile,'w').write(str(os.getpid()))
        if logfile:
            log.addHandler(logging.FileHandler(logfile))
        Router = sockjs.tornado.SockJSRouter(BrowserSocketConnection, '/backend')
        handlers = [("/backend/index.html", IndexHandler),
                    ("/alive", AliveHandler),
                    ("/backend/message/types", MessageTypesHandler),
                    ("/backend/auth/google", GoogleLoginHandler), ("/backend/auth/facebook", FacebookLoginHandler),
                    ("/backend/auth/logout", LogoutHandler), ("/backend/auth/username", UsernameHandler)]
        secrets = eval(open(os.path.join(base, "data/secrets/tornado.conf")).read())
        app = tornado.web.Application(handlers + Router.urls, debug=debug, **secrets)
        app.listen(port)
        log.info("listening on port %s"%port)
        ioloop.IOLoop.instance().start()
    finally:
        os.unlink(pidfile)

###########################################
# command line interface
###########################################

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
                        help="store log in this file (default: '' = don't log to a file)")

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
    logfile = os.path.abspath(args.logfile) if args.logfile else None
    base    = os.path.abspath('.')
    main    = lambda: run_server(base=base, port=args.port, debug=args.debug, pidfile=pidfile, logfile=logfile)
    if args.daemon:
        import daemon
        with daemon.DaemonContext():
            main()
    else:
        main()
