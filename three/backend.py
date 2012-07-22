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

import mesg_pb2
from worker import message

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
                    callback(None)
                return
            self._conn.read_bytes(int(s), handle_mesg)
        def handle_mesg(s):
            if callback is not None:
                m = mesg.pb2.Message()
                m.ParseFromString(s)
                callback(m)
        read_length()
    

class WorkerConnection(object):
    connections = set()

    def __init__(self, hostname, port, **options):
        self._options = options
        self._conn = NonblockingConnectionPB(hostname, port, self._start_session)
        ioloop = ioloop.IOLoop.instance()
        ioloop.add_handler(self._conn._sock.fileno(), self._recv, io_loop.READ)

    def _start_session(self):
        self._conn.send(message.start_session(**self._options), self._recv_pid)
        
    def _recv_pid(self):
        def set_pid(mesg):
            self._pid = mesg.session_description.pid
        self._conn.recv(set_pid)

    def __del__(self):
        ioloop = ioloop.IOLoop.instance()
        ioloop.remove_handler(self._conn._sock.fileno())

    def _recv(self, fd, events):
        self._conn.recv(self.on_message)

    def send(self, mesg, callback=None):
        self._conn.send(mesg, callback)

    def on_open(self, info):
        self.connections.add(self)

    def on_close(self):
        self.connections.remove(self)

    def on_message(self, mesg):
        pass



###########################################
# persistent connections to browsers (sockjs)
###########################################

class BrowserSocketConnection(sockjs.tornado.SockJSConnection):
    connections = set()

    def on_open(self, info):
        #self.broadcast(self.connections, "User connected.")
        self.connections.add(self)
        log.info("new connection from %s", self.__dict__)

    def on_close(self):
        self.connections.remove(self)

    def on_message(self, message):
        message = json.loads(message)
        log.info("on_message: '%s'", message)
        if 'execute' in message:
            self.execute(message['execute'], message['id'], message['session'])

    def send_obj(self, obj):
        log.info("sending: '%s'", obj)
        self.send(json.dumps(obj))

    def execute(self, input, id, session):
        #self.send_obj({'stdout':r, 'done':True, 'id':id})

        log.info("executing '%s'...", input)

        import mesg_pb2
        conn = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        conn.connect(('', 6000))
        from worker import message, ConnectionPB
        conn = ConnectionPB(conn)
        conn.send(message.start_session(max_walltime=60*10, max_cputime=60*10))
        worker_pid = conn.recv().session_description.pid

        log.info("now asking for computation to happen")
        conn.send(message.execute_code(code=input, id=id))
                  
        some_output = False
        while True:
            try:
                mesg = conn.recv()
            except EOFError:
                break
            if mesg.type == mesg_pb2.Message.TERMINATE_SESSION:
                break
            elif mesg.type == mesg_pb2.Message.OUTPUT:
                done = mesg.output.done
                if mesg.output.stdout:
                    some_output=True
                    self.send_obj({'stdout':mesg.output.stdout, 'done':done, 'id':id})
                if mesg.output.stderr:
                    some_output=True
                    self.send_obj({'stderr':mesg.output.stderr, 'done':done, 'id':id})
                if done:
                    break
        if not some_output:
            self.send_obj({'done':done, 'id':id})

class IndexHandler(BaseHandler):
    def get(self):
        log.info("connection from %s", self.current_user)
        self.write("Backend sagews Server on Port %s"%args.port)

###########################################
# tornado web server
###########################################

def run_server(base, port, debug, pidfile, logfile):
    try:
        open(pidfile,'w').write(str(os.getpid()))
        if logfile:
            log.addHandler(logging.FileHandler(logfile))
        log.info("foo")
        Router = sockjs.tornado.SockJSRouter(BrowserSocketConnection, '/backend')
        handlers = [("/backend/index.html", IndexHandler),
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
