#!/usr/bin/env python
"""
Copyright (c) William Stein, 2012.  Not open source or free. Will be
assigned to University of Washington.
"""

import os, time

import daemon
import psycopg2

import misc
from db import table_exists

def mtime(file):
    try:
        return os.path.getmtime(file)
    except OSError:
        return 0

def create_log_table(cur):
    cur.execute("CREATE TABLE log (id serial PRIMARY KEY, logfile varchar, time timestamp, message varchar)")

lastmod = None
def send_log_to_database(database, logfile, filename):
    global lastmod
    print "Making psycopg2 connection to '%s'..."%database
    conn = psycopg2.connect(database)
    cur = conn.cursor()
    if not table_exists(cur, 'log'):
        create_log_table(cur)
    c = open(logfile).read()
    if len(c) == 0:
        print "logfile is empty"
        return
    try:
        now = psycopg2.TimestampFromTicks(time.time())
        for r in c.splitlines():    
            cur.execute("INSERT INTO log (logfile, time, message) VALUES(%s, %s, %s)",
                        (filename, now, r))
        conn.commit()
        conn.rollback()
        print "Successful commit, now deleting logfile..."
        # potential race condition situation below
        if mtime(logfile) != lastmod:
            # file appended to during db send, so delete the part of file we sent (but not the rest)
            open(logfile,'w').write(open(logfile).read()[len(c):])
        else:
            # just clear file
            open(logfile,'w').close()
        lastmod = mtime(logfile)
    except Exception, msg:
        print "Failed to commit log messages to databaes (%s)"%msg
    finally:
        cur.close()
        conn.close()

def watched_process_still_running(watched_pidfile):
    if not os.path.exists(watched_pidfile):
        return False
    try:
        # pidfiles sometimes have more info in them; first line is always master pid
        if not misc.is_running(int(open(watched_pidfile).readlines()[0])):
            return False
    except IOError:  # in case file vanished after above check.
        return os.path.exists(watched_pidfile)
    return True

def main(logfile, pidfile, watched_pidfile, timeout, database):
    global lastmod
    filename = os.path.split(logfile)[-1]
    try:
        open(pidfile,'w').write(str(os.getpid()))
        lastmod = None
        while True:
            modtime = mtime(logfile)
            if lastmod != modtime:
                lastmod = modtime
                try:
                    send_log_to_database(database, logfile, filename)
                except Exception, msg:
                    print msg
            print "Sleeping %s seconds"%timeout
            time.sleep(timeout)
            if not watched_process_still_running(watched_pidfile):
                return
    finally:
        os.unlink(pidfile)

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Monitor checks on the logfile every to t seconds to see if it changes, and when it does sends contents to the database, and on successful DB commit empties the file (this is subject to race conditions that could result in a small amount of lost or corrupted data, but the simplicity of implementing this for all clients makes it worth it, especially because the data isn't that important).   The monitor also put an entry in the services table, puts regular status updates in the status table, and these updates are memcached.")

    parser.add_argument("-g", dest='debug', default=False, action="store_const", const=True,
                        help="debug mode (default: False)")
    parser.add_argument("-l", dest='logfile', type=str, required=True,
                        help="when this file changes it is sent to the database server")
    parser.add_argument("-d", dest="database", type=str, required=True,
                        help="database server, e.g., dbname=monitor")
    parser.add_argument("-p", dest="pidfile", type=str, required=True,
                        help="PID file of this daemon process")
    parser.add_argument("-t", dest="timeout", type=int, default=60,  
                        help="check every t seconds to see if logfile has changed")
    parser.add_argument("-w", dest="watched_pidfile", type=str, required=True,
                        help="pid of the process being watched")
    
    args = parser.parse_args()
        
    logfile = os.path.abspath(args.logfile)
    pidfile = os.path.abspath(args.pidfile)
    watched_pidfile = os.path.abspath(args.watched_pidfile)

    f = lambda: main(logfile=logfile, pidfile=pidfile, watched_pidfile=watched_pidfile,
                     timeout=args.timeout, database=args.database)
    if args.debug:
        f()
    else:
        with daemon.DaemonContext():
            f()
    
    
    
