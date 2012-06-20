import json, logging, os, socket, ssl, struct, sys


#####################################################################
# The SQLalchemy database
#####################################################################
from sqlalchemy.ext.declarative import declarative_base
Base = declarative_base()
from sqlalchemy import (create_engine, Column, Float, Integer, String)
from sqlalchemy.orm import sessionmaker

class Entry(Base):
    __tablename__ = "entries"
    id = Column(Integer, primary_key=True)
    module = Column(String)
    levelname = Column(String)
    timestamp = Column(Float)
    formatted = Column(String)
    ip_address = Column(String)
    levelno = Column(Integer)
    lineno = Column(Integer)
    pid = Column(Integer)
    
    def __init__(self, mesg):
        self.__dict__.update(mesg)

    def __repr__(self):
        return self.formatted

class Database(object):
    def __init__(self, file='log.sqlite3'):
        self._file = file
        self._engine = create_engine('sqlite:///%s'%file)
        if not os.path.exists(file):
            Base.metadata.create_all(self._engine)
            
    def session(self):
        return sessionmaker(bind=self._engine)()


#####################################################################
# A simple test client
#####################################################################

class LogHandler(logging.Handler):
    def __init__(self, port, hostname, ip_address):
        logging.Handler.__init__(self)
        self._hostname = str(hostname)
        self._port = int(port)
        self._socket = None
        if not ip_address:
            # this is not reliable
            ip_address = socket.gethostbyaddr(socket.gethostname())
        self._ip_address = ip_address
        
    def emit(self, record):
        if self._socket is None:
            self.connect()
        if self._socket is None:
            sys.stderr.write(self.format(record) + '\n')
            return
        obj = self.makePickle(record)
        length_header = struct.pack(">L", len(obj))
        try:
            self._socket.write(length_header + obj)
        except IOError, err:
            sys.stderr.write("LogHandler: logger down -- '%s'\n"%err)
            sys.stderr.write(self.format(record) + '\n')
            self._socket.close()
            self._socket = None

    def makePickle(self, record):
        return json.dumps({
            'formatted':self.format(record), 'timestamp':record.created, 'ip_address':self._ip_address,
            'levelno':record.levelno, 'levelname':record.levelname,
            'lineno':record.lineno, 'module':record.module, 'pid':record.process, 
            })



    def __del__(self):
        if self._socket is not None:
            self._socket.close()
        

class TestLogHandler(LogHandler):
    def connect(self):
        self._socket = ssl.wrap_socket(socket.socket(socket.AF_INET, socket.SOCK_STREAM))
        try:
            self._socket.connect((self._hostname, self._port))
        except socket.error, err:
            sys.stderr.write("error connecting to logger: %s\n"%err)
            self._socket = None

class TestLog(object):
    def __init__(self, port, hostname):
        self._hostname = hostname
        self._port = port
        self._rootLogger = logging.getLogger('')
        self._rootLogger.setLevel(logging.DEBUG)
        self._rootLogger.addHandler(TestLogHandler(port=port, hostname=hostname, ip_address="127.0.0.1"))

    def run(self):
        i = 0
        while True:
            logging.info(raw_input('mesg: '))
            i += 1

#####################################################################
# The non-blocking SSL-enabled Tornado-based handler 
#####################################################################

class TornadoLogHandler(LogHandler):
    def connect(self):
        from tornado import iostream
        try:
            s = ssl.wrap_socket(socket.socket(socket.AF_INET, socket.SOCK_STREAM), do_handshake_on_connect=False)
            s.connect((self._hostname, self._port))
            self._socket = iostream.SSLIOStream(s)
        except socket.error, err:
            sys.stderr.write("TornadoLogHandler: connection to logger failed -- '%s'"%err)            
            self._socket = None

        
class WebTestLog(object):
    def __init__(self, port, hostname, webport):
        self._hostname = hostname
        self._port = port
        self._webport = webport
        self._rootLogger = logging.getLogger('')
        self._rootLogger.setLevel(logging.DEBUG)
        self._rootLogger.addHandler(TornadoLogHandler(port=port, hostname=hostname, ip_address="127.0.0.1"))

    def run(self):
        import tornado.ioloop
        import tornado.web
        class MainHandler(tornado.web.RequestHandler):
            def get(self):
                logging.info('hello')                
                self.write("Logger")

        application = tornado.web.Application([
            (r"/", MainHandler),
        ])
        application.listen(self._webport)
        tornado.ioloop.IOLoop.instance().start()
        







#####################################################################
# The logging SSL-enabled database socket server 
#####################################################################
class LogServer(object):
    def __init__(self, port, certfile, dbfile, hostname, whitelist):
        self._children = [] # todo: kill em all on exit and wait
        self._db = Database(dbfile)
        self._port = port
        self._certfile = certfile
        self._dbfile = dbfile
        self._hostname = hostname
        self._whitelist = open(whitelist).read().split() if os.path.exists(whitelist) else None

    def __del__(self):
        for pid in self._children:
            try:
                print "Killing %s..."%pid
                os.kill(pid)
                os.wait(pid)
            except:
                pass

    def run(self):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        print "Bind to %s:%s"%(self._hostname, self._port)
        s.bind((self._hostname, self._port))
        s.listen(5)
        while True:
            print "Waiting for secure connection..."
            try:
                conn, addr = s.accept()
                if self._whitelist is not None and   addr not in self._whitelist:
                    print "Rejecting connection from %s since it is not in the whitelist"%addr
                    continue
                import ssl
                conn = ssl.wrap_socket(conn, server_side=True, certfile=self._certfile, keyfile=self._certfile)
            except Exception, err:
                sys.stderr.write("Error making connection: %s"%err)
                continue
            pid = os.fork()
            if pid == 0:
                # child
                self._recv_and_log_loop(conn)
            else:
                # parent
                print "Accepted a new connection, and created process %s to handle it"%pid
                self._children.append(pid)

    def _recv_and_log_loop(self, conn):
        while True:
            mesg = conn.recv(4)
            if len(mesg) < 4:
                break
            slen = struct.unpack('>L', mesg)[0]
            mesg = conn.recv(slen)
            while len(mesg) < slen:
                mesg += conn.recv(slen - len(mesg))
            self.handle(mesg)

    def handle(self, mesg):
        mesg = json.loads(mesg)
        s = self._db.session()
        s.add(Entry(mesg))
        s.commit()
                    

#####################################################################
# Web interface to the logging database
#####################################################################
class WebServer(object):
    def __init__(self, port, certfile, dbfile, hostname):
        self._port = port
        self._certfile = certfile
        self._dbfile = dbfile
        self._hostname = hostname

    def run(self):
        raise NotImplementedError


#####################################################################
# Handle command line options
#####################################################################

if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description="The Sagews Logging Module")

    parser.add_argument('--log_server', dest='log_server', action='store_const', const=True, default=False,
                        help="run as a log server that accepts ssl connections and writes to the database")
    parser.add_argument('--web_server', dest='web_server', action='store_const', const=True, default=False,
                        help="run a web server that allows one to browse the log database")
    
    parser.add_argument('--test_client', dest='test_client', action='store_const', const=True, default=False,
                        help="run very simple command line test client for the log server")
    parser.add_argument('--test_webclient', dest='test_webclient', action='store_const', const=True, default=False,
                        help="run very simple testing web client serving for the Torando-based log server; should specify --webport=xxxx")
    parser.add_argument("--webport", dest="webport", type=int, default=8888,
                        help="port to use for testing web client (default: 8888)")
    
    parser.add_argument("--hostname", dest="hostname", type=str, default=socket.gethostname(),
                        help="hostname/ip address for server to listen on")
    parser.add_argument("--port", dest="port", type=int, default=8514,
                        help="port to use for log server or web server (default: 8514)")

    parser.add_argument("--certfile", dest="certfile", type=str, default="cert.pem",
                        help="use or autogenerate the given certfile")
    parser.add_argument("--dbfile", dest="dbfile", type=str, default="log.sqlite3",
                        help="file in which to store the log database")
    parser.add_argument('--daemon', dest='daemon', action='store_const', const=True,
                        default=False, help="run as a daemon")
    parser.add_argument('--whitelist', dest='whitelist', type=str, default='',
                        help="file with rows ip addresses of computers that are allowed to connect")

    args = parser.parse_args()

    def main():
        if not os.path.exists(args.certfile):
            import subprocess
            subprocess.Popen(['openssl', 'req', '-batch', '-new', '-x509', '-newkey', 'rsa:1024', '-days', '9999', '-nodes', '-out', args.certfile, '-keyout', args.certfile]).wait()
            os.chmod(args.certfile, 0600)
        if args.log_server:
            LogServer(port=args.port, certfile=args.certfile, dbfile=args.dbfile,
                      hostname=args.hostname, whitelist=args.whitelist).run()
        elif args.web_server:
            WebServer(port=args.port, certfile=args.certfile, dbfile=args.dbfile, hostname=args.hostname).run()
        elif args.test_client:
            TestLog(port=args.port, hostname=args.hostname).run()
        elif args.test_webclient:
            WebTestLog(port=args.port, hostname=args.hostname, webport=args.webport).run()
            
    if args.daemon:
        import daemon
        with daemon.DaemonContext():
            main()
    else:
        main()
        
