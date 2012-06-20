

#####################################################################
# The SQLalchemy database
#####################################################################



#####################################################################
# The non-blocking SSL-enabled Tornado-based handler 
#####################################################################

import logging
class SSLIOStreamLogHandler(logging.Handler):
    def emit(self, record):
        print "This is just a test Handler:", record




#####################################################################
# Python library (=command line) interface to the logging database
#####################################################################





#####################################################################
# The logging SSL-enabled database socket server 
#####################################################################

class LogServer(object):
    def __init__(self, port, certfile, dbfile):
        self._port = port
        self._certfile = certfile
        self._dbfile = dbfile

    def run(self):
        raise NotImplementedError






#####################################################################
# Web interface to the logging database
#####################################################################
class WebServer(object):
    def __init__(self, port, certfile, dbfile):
        self._port = port
        self._certfile = certfile
        self._dbfile = dbfile

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
    parser.add_argument("--certfile", dest="certfile", type=str, default="cert.pem",
                        help="use or autogenerate the given certfile")
    parser.add_argument("--dbfile", dest="dbfile", type=str, default="log.sqlite3",
                        help="file in which to store the log database")
    parser.add_argument("--port", dest="port", type=int, default=0,
                        help="port to use for log server or web server")
    parser.add_argument('--daemon', dest='daemon', action='store_const', const=True,
                        default=False, help="run as a daemon")

    args = parser.parse_args()

    def main():
        if not os.path.exists(args.certfile):
            import subprocess
            subprocess.Popen(['openssl', 'req', '-batch', '-new', '-x509', '-newkey', 'rsa:1024', '-days', '9999', '-nodes', '-out', args.certfile, '-keyout', args.certfile]).wait()
            os.chmod(args.certfile, 0600)
        if args.log_server:
            LogServer(port=args.port, certfile=args.certfile, dbfile=args.dbfile).run()
        elif args.web_server:
            WebServer(port=args.port, certfile=args.certfile, dbfile=args.dbfile).run()
            
    if args.daemon:
        import daemon
        with daemon.DaemonContext():
            main()
    else:
        main()
        
