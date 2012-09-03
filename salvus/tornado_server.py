#!/usr/bin/env python
"""
Tornado server

    - user authentication: Facebook, Google, Dropbox

    - persistent connections to sage servers speaking protocol buffers over an
      unencrypted TCP network socket

    - persistent connections to web browsers speaking JSON over sockjs and
      other data over HTTP
      
    - connections to other tornados speaking protocol buffers over a
      secure SSL encrypted TCP socket

    - almost static templated content, e.g., anything that needs to be
      translated to other languages (not javascript, but things like
      help pages)
"""

import json, logging, os, random, socket, sys, time

from tornado import ioloop, iostream
import sockjs.tornado, tornado.web

import cassandra

###########################################
# Logging
###########################################
logging.basicConfig()
log = logging.getLogger('tornado')
log.setLevel(logging.INFO)

###########################################
# Authentication with Facebook, Google, and DropBox (TODO)
###########################################
from auth import BaseHandler, GoogleLoginHandler, FacebookLoginHandler, LogoutHandler, UsernameHandler

###########################################
# Encrypted connections for tornados to send messages to each other
###########################################
from tornado_mesg import TornadoConnectionServer, connect_to_tornado

def handle_tornado_mesg(mesg):
    log.info("received tornado message '%s'", mesg)

class TestTornadoMesgHandler(BaseHandler):
    def get(self):
        log.info("testing tornado mesg system")
        t = time.time()
        c = connect_to_tornado(self.get_argument('hostname','localhost'), int(self.get_argument('port')))
        mesg = message.output(id=7, stdout="some output", done=True)
        c.send(mesg)
        self.write("sent message successfully in %.1f milliseconds"%(1000*(time.time()-t)))
        

###########################################
# Async Connections to Sage servers
###########################################

from tornado_sage import SageConnection, message, mesg_pb2

message_types_json = json.dumps(dict([(name, val.number) for name, val in mesg_pb2._MESSAGE_TYPE.values_by_name.iteritems()]))
class MessageTypesHandler(BaseHandler):
    def get(self):
        self.write(message_types_json)

monitor_database = 'user=wstein dbname=monitor'  # TODO!

import monitor
def random_sage_server(callback):
    """Find a random Sage server that is currently up, according to the databass, then do
       callback(address, port).  If there are no available Sage servers, port=0."""
    # IDEA: we might want to instead base this on load or roundrobin,
    # though there are subtle issues with that, since load changes so
    # quickly and is hard to accurately measure.  roundrobin could be
    # hard, because the sage servers might come and go dynamically.

    # For the record: this is a *synchronous* way to get all sage services
    # x = [s for s in monitor.running_services(database=monitor_database) if s['name'] == 'sage']

    def choose_server(x):
        if len(x) == 0:
            # no sage servers available
            callback('',0)
        else:
            t = random.choice(x)
            callback(t[0], t[1])

    # TODO: currently not async; maybe doesn't need to be as 
    server = cassandra.get_sage_servers()
    choose_server(server)


####################################################
# cassandra version of stateless_execution database
####################################################
stateless_execution_cache = cassandra.StatelessExec()


###########################################
# persistent connections to browsers (sockjs)
###########################################

# monkey patch websocket.py to detect https using the Origin header, since it
# works with haproxy+stunnel, whereas using self.request.protocol does not.
import sockjs.tornado.websocket
sockjs.tornado.websocket.WebSocketHandler.get_websocket_scheme = lambda self: 'wss' if self.request.headers.get('Origin', 'https').startswith('https') else 'ws'

# Define the sockjs connection:  tornado <---> browser
class BrowserSocketConnection(sockjs.tornado.SockJSConnection):
    connections = set()

    def on_open(self, info):
        self.connections.add(self)
        log.info("new connection from %s", self.__dict__)

        def connect(address, port):
            if not port:
                # TODO: handle error condition sensibly ??
                raise RuntimeError("TOOD: handle this error sensibly")
            self._stateful_execution = StatefulExecution(self, address=address, port=port,
                                                         max_cputime=30, max_walltime=30, timeout=1)
        # TODO -- this is ONLY for testing right now    
        #random_sage_server(connect)

    def on_close(self):
        self.connections.remove(self)

    def on_message(self, mesg):
        mesg = json.loads(mesg)
        log.info("on_message: '%s'", mesg)
        if mesg['type'] == mesg_pb2.Message.EXECUTE_CODE:
            self.stateless_execution(mesg)
            #self._stateful_execution.execute(mesg['execute_code']['code'], mesg['id'])

    def send_obj(self, obj):
        log.info("sending: '%s'", obj)
        self.send(json.dumps(obj))

    def stateless_execution(self, mesg):
        log.info("stateless executing code '%s'...", mesg)

        if hasattr(self, '_stateless_execution'):
            self._stateless_execution.kill()
            
        input = mesg['execute_code']['code'].strip()
        answer = stateless_execution_cache[input]
        if answer is not None:
            for m in answer:  # replay messages
                m1 = dict(m)
                m1['id'] = mesg['id']
                self.send_obj(m1)
            return

        def connect_and_execute(address, port):
            if not port: # there are no sage servers at all available
                # TODO: message should not use stderr, but instead maybe a new/extended protobuf2 type
                self.send_obj({'type':mesg_pb2.Message.OUTPUT, 'id':mesg['id'],
                               'output':{'done':True, 'stdout':'', 'stderr':'there are no Sage servers currently available'}})
                return

            self._stateless_execution = StatelessExecution(self, mesg=mesg,
                      address=address, port=port, max_cputime=3, max_walltime=3, timeout=1)
        
        random_sage_server(connect_and_execute)

class StatelessExecution(object):
    def __init__(self, browser_conn, mesg, address, port, timeout, **options):
        self._browser_conn = browser_conn
        self._mesg = mesg
        self._address = address
        self._port = port
        self._options = options
        self._sage_conn = None
        self._result = []
        self._timeout = timeout
        self._start()

    def kill(self):
        if self._sage_conn is not None:
            # TODO: message should not use stderr, but instead maybe a new/extended protobuf2 type
            self._browser_conn.send_obj({'type':mesg_pb2.Message.OUTPUT, 'id':self._mesg['id'],
                                         'output':{'done':True, 'stdout':'', 'stderr':'killed'}})
            self._sage_conn.close()
            self._sage_conn = None
            
    def _start(self):
        log.info("StatelessExecution: making SageConnection to address=%s, port=%s", self._address, self._port)        
        self._sage_conn = SageConnection(self._address, self._port, mesg_callback=self._handle_mesg,
             init_callback=self._send_code, fail_callback=self._fail, log=log, timeout=self._timeout, **self._options)

    def _send_code(self, sage_conn):
        log.info("got connection; now sending code")
        sage_conn.send(message.execute_code(code=self._mesg['execute_code']['code'], id=self._mesg['id']))

    def _fail(self, sage_conn):
        self._sage_conn = None
        # TODO: message should not use stderr, but instead maybe a new/extended protobuf2 type
        self._browser_conn.send_obj({'type':mesg_pb2.Message.OUTPUT, 'id':self._mesg['id'],
                                      'output':{'done':True, 'stdout':'', 'stderr':'unable to connect to Sage server'}})

    def _handle_mesg(self, sage_conn, mesg):
        log.info("got mesg:\n%s", mesg)
        if mesg.type == mesg_pb2.Message.OUTPUT:
            mesg2 = {'type':mesg.type, 'id':mesg.id, 'output':{'done':mesg.output.done}}
            mesg2['output']['stdout'] = mesg.output.stdout
            mesg2['output']['stderr'] = mesg.output.stderr
            log.info("translated to: %s", mesg2)
            self._result.append(mesg2)
            self._browser_conn.send_obj(mesg2)
            if mesg.output.done:
                sage_conn.close()
                self._sage_conn = None
                stateless_execution_cache[self._mesg['execute_code']['code']] = self._result


class StatefulExecution(object):
    def __init__(self, browser_conn, address, port, timeout, **options):
        self._browser_conn = browser_conn
        self._address = address
        self._port = port
        self._sage_conn = None
        self._done = True
        self._is_connected = False
        self._timeout = timeout
        def f(*args):
            print "callback!!!!!!!!!!!!!!!"
            self._is_connected = True
        log.info("StatefulExecution: making SageConnection to address=%s, port=%s", self._address, self._port)
        self._sage_conn = SageConnection(self._address, self._port, mesg_callback=self._handle_mesg,
                        init_callback=f, fail_callback=self._fail, timeout=self._timeout, log=log, **options)


    def _fail(self, sage_conn):
        self._sage_conn = None
        self._browser_conn.send_obj({'type':mesg_pb2.Message.OUTPUT, 'id':self._mesg['id'],
                                      'output':{'done':True, 'stdout':'', 'stderr':'unable to connect to Sage server'}})

    def execute(self, input, id):
        if self._is_connected:
            self._done = False
            log.info("sending code to execute: '%s'", input)        
            self._sage_conn.send(message.execute_code(code=input, id=id))
        else:
            log.info("connection not ready yet -- TODO -- queue up input?")

    def _handle_mesg(self, sage_conn, mesg):
        log.info("StatefulExecution: got mesg:\n%s", mesg)
        if mesg.type == mesg_pb2.Message.OUTPUT:
            mesg2 = {'type':mesg.type, 'id':mesg.id, 'output':{'done':mesg.output.done}}
            mesg2['output']['stdout'] = mesg.output.stdout
            mesg2['output']['stderr'] = mesg.output.stderr
            log.info("translated to: %s", mesg2)
            self._browser_conn.send_obj(mesg2)
            if mesg.output.done:
                self._done = True
                
    def kill(self):
        if self._sage_conn is not None:
            self._browser_conn.send_obj({'type':mesg_pb2.Message.OUTPUT, 'id':self._mesg['id'],
                                         'output':{'done':True, 'stdout':'', 'stderr':'killed'}})
            self._sage_conn.close()
            self._sage_conn = None
    

###########################################
# health, etc.
###########################################

class IndexHandler(BaseHandler):
    def get(self):
        log.info("connection from %s", self.current_user)
        self.write("Tornado sagews Server on Port %s"%args.port)

class AliveHandler(BaseHandler):
    def options(self):
        self.write("ok")

###########################################
# tornado web server
###########################################

def run_server(base, port, tcp_port, debug, address, pidfile, logfile, database_nodes):
    cassandra.set_nodes(database_nodes.split(','))
    cassandra.init_salvus_schema()
    
    try:
        open(pidfile,'w').write(str(os.getpid()))
        if logfile:
            log.addHandler(logging.FileHandler(logfile))
        Router = sockjs.tornado.SockJSRouter(BrowserSocketConnection, '/tornado')
        handlers = [("/tornado/index.html", IndexHandler),
                    ("/alive", AliveHandler),
                    ("/tornado/message/types", MessageTypesHandler),
                    ("/tornado/auth/google", GoogleLoginHandler), ("/tornado/auth/facebook", FacebookLoginHandler),
                    ("/tornado/auth/logout", LogoutHandler), ("/tornado/auth/username", UsernameHandler)]
        if debug:
            # It may be dangerous to export these handlers, so only do it in debug mode!
            handlers.append(("/test_tornado_mesg", TestTornadoMesgHandler))
        secrets = eval(open(os.path.join(base, "data/secrets/tornado.conf")).read())
        app = tornado.web.Application(handlers + Router.urls, debug=debug, **secrets)
        app.listen(port, address=address)
        log.info("accepting HTTP and websockets connections on port %s"%port)
        log.info("accepting SSL/TCP connections on port %s"%tcp_port)
        certfile = 'data/secrets/server.crt' # TODO
        keyfile = 'data/secrets/server.key'  # TODO
        tornado_connection_server = TornadoConnectionServer(tcp_port, address, handle_tornado_mesg,
                                                            certfile, keyfile) 
        ioloop.IOLoop.instance().start()
    finally:
        os.unlink(pidfile)

###########################################
# command line interface
###########################################

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Run tornado server")
    parser.add_argument("-p", dest="port", type=int, default=0,
                        help="port to listen on (default: 0 = determined by operating system)")
    parser.add_argument("-t", dest="tcp_port", type=int, default=0,
                        help="tcp port to listen on from other tornado servers (default: 0 = determined by operating system)")
    parser.add_argument("-l", dest='log_level', type=str, default='INFO',
                        help="log level (default: INFO) useful options include WARNING and DEBUG")
    parser.add_argument("-g", dest='debug', default=False, action="store_const", const=True,
                        help="debug mode (default: False)")
    parser.add_argument("-d", dest="daemon", default=False, action="store_const", const=True,
                        help="daemon mode (default: False)")
    parser.add_argument("--address", dest="address", type=str, default='',
                        help="address of interface to bind to")
    parser.add_argument("--pidfile", dest="pidfile", type=str, default='tornado.pid',
                        help="store pid in this file (default: 'tornado.pid')")
    parser.add_argument("--logfile", dest="logfile", type=str, default='',
                        help="store log in this file (default: '' = don't log to a file)")
    parser.add_argument("--database_nodes", dest="database_nodes", type=str, required=True,
                        help="list of ip addresses of all database nodes in the cluster")

    args = parser.parse_args()
    
    if not args.port:
        # let OS pick a free port
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM); s.bind(('',0))
        args.port = s.getsockname()[1]
        del s
    if not args.tcp_port:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM); s.bind(('',0))
        args.tcp_port = s.getsockname()[1]
        del s

    if args.log_level:
        level = getattr(logging, args.log_level.upper())
        log.setLevel(level)

    pidfile = os.path.abspath(args.pidfile)
    logfile = os.path.abspath(args.logfile) if args.logfile else None
    base    = os.path.abspath('.')
    main    = lambda: run_server(base=base, port=args.port, tcp_port=args.tcp_port,
                                 debug=args.debug, address=args.address, pidfile=pidfile,
                                 logfile=logfile, database_nodes=args.database_nodes)
    if args.daemon:
        import daemon
        with daemon.DaemonContext():
            main()
    else:
        main()
