import logging, os, socket, ssl, struct



#####################################################################
# The SQLalchemy database
#####################################################################



#####################################################################
# A simple test client
#####################################################################

class TestLogHandler(logging.Handler):
    def __init__(self, port, hostname):
        logging.Handler.__init__(self)
        self._hostname = str(hostname)
        self._port = int(port)
        
    def emit(self, record):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s = ssl.wrap_socket(s)
        s.connect((self._hostname, self._port))
        mesg = str(record)
        length_header = struct.pack(">L", len(s))
        s.send(length_header + mesg)
        s.shutdown(0)
        s.close()

class TestLog(object):
    def __init__(self, port, hostname):
        self._hostname = hostname
        self._port = port
        self._rootLogger = logging.getLogger('')
        self._rootLogger.setLevel(logging.DEBUG)
        self._rootLogger.addHandler(TestLogHandler(port=port, hostname=hostname))

    def run(self):
        while True:
            logging.info(raw_input('mesg: '))
        
    

#####################################################################
# The non-blocking SSL-enabled Tornado-based handler 
#####################################################################

class SSLIOStreamLogHandler(logging.Handler):
    def __init__(self, hostname, port):
        self._hostname = str(hostame)
        self._port = int(port)
        
    def emit(self, record):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s = ssl.wrap_socket(s)
        s.connect((self._hostname, self._port))
        mesg = str(record)
        length_header = struct.pack(">L", len(s))
        s.send(length_header + mesg)
        s.shutdown(0)
        s.close()
        
        




#####################################################################
# Python library (=command line) interface to the logging database
#####################################################################





#####################################################################
# The logging SSL-enabled database socket server 
#####################################################################
class LogServer(object):
    def __init__(self, port, certfile, dbfile, hostname, whitelist):
        self._port = port
        self._certfile = certfile
        self._dbfile = dbfile
        self._hostname = hostname
        self._whitelist = open(whitelist).read().split() if os.path.exists(whitelist) else None

    def run(self):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        print "Bind to %s:%s"%(self._hostname, self._port)
        s.bind((self._hostname, self._port))
        s.listen(5)
        while True:
            # todo -- try accept this?
            print "Waiting for secure connection..."
            conn, addr = s.accept()
            if self._whitelist is not None and   addr not in self._whitelist:
                print "Rejecting connection from %s since it is not in the whitelist"%addr
                continue
            import ssl
            conn = ssl.wrap_socket(conn, server_side=True, certfile=self._certfile, keyfile=self._certfile)
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
        print mesg
                    

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
                        help="run a simple command line test client for the log server")
    
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
            
    if args.daemon:
        import daemon
        with daemon.DaemonContext():
            main()
    else:
        main()
        
