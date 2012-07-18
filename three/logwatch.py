#!/usr/bin/env python
"""

Copyright (c) William Stein, 2012.  Not open source or free. Will be
assigned to University of Washington.
"""

import daemon, os, time

def mtime(file):
    try:
        return os.path.getmtime(file)
    except OSError:
        return 0

from sqlalchemy import (Column, DateTime, Integer, String, func)

from sqlalchemy.ext.declarative import declarative_base
Base = declarative_base()

class LogMessage(Base):
    __tablename__ = "log"
    id = Column(Integer, primary_key=True, autoincrement=True)
    logfile = Column(String)
    time = Column(DateTime, default=func.now())
    message = Column(String)

    def __init__(self, message, logfile):
        self.message = message
        self.logfile = logfile

def get_session(database):
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    engine = create_engine(database)
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()

def main(logfile, pidfile, timeout, database):
    filename = os.path.split(logfile)[-1]
    try:
        open(pidfile,'w').write(str(os.getpid()))
        lastmod = mtime(logfile)
        while True:
            if lastmod != mtime(logfile):
                while True: # file changed; now waiting to stabilize
                    lastmod = mtime(logfile)
                    time.sleep(timeout)
                    mod = mtime(logfile)
                    if lastmod == mod:
                        # file stabilized (e.g., the copy must have completed)
                        try:
                            # Get new connection each time, since submitting
                            # log back to DB is rare, but must fault taulerant.
                            session = get_session(database)
                            for r in open(logfile).readlines():
                                session.add(LogMessage(r, filename))
                            session.commit()
                            del session
                            open(logfile,'w').close()  # clear file if submit worked
                        except Exception, msg:
                            print msg
                        break
            time.sleep(1)
    finally:
        os.unlink(pidfile)

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Log watcher watches the given file, then submits it to a database if it subsequently does not change for t seconds; on success it then empties the file.  The file is assumed to change as a result of rotating a log file, not because the file is actively being written to.")

    parser.add_argument("-g", dest='debug', default=False, action="store_const", const=True,
                        help="debug mode (default: False)")
    parser.add_argument("-l", dest='logfile', type=str, required=True,
                        help="when this file changes it is sent to the database server")
    parser.add_argument("-d", dest="database", type=str, required=True,
                        help="SQLalchemy description of database server, e.g., postgresql://user@hostname:port/dbname")
    parser.add_argument("-p", dest="pidfile", type=str, required=True,
                        help="PID file of this daemon process")
    parser.add_argument("-t", dest="timeout", type=int, default=2,  # TODO
                        help="time in seconds file must remain unchanged after modification before we send to database")
    

    args = parser.parse_args()
        
    logfile = os.path.abspath(args.logfile)
    pidfile = os.path.abspath(args.pidfile)

    if args.debug:
        main(logfile, pidfile, args.timeout, args.database)
    else:
        with daemon.DaemonContext():
            main(logfile, pidfile, args.timeout, args.database)
    
    
    
