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

#########################################################
# services table
#########################################################

def create_services_table(cur):
    cur.execute("""
CREATE TABLE services (
    id serial PRIMARY KEY,
    name varchar,
    address varchar,
    port integer,
    running boolean,
    username varchar,
    pid integer,
    monitor_pid integer)
""")

@misc.call_until_succeed(0.01, 60)
def record_that_service_started(database, name, address, port, username, pid, monitor_pid):
    conn = psycopg2.connect(database)
    cur = conn.cursor()
    try:
        if not table_exists(cur, 'services'):
            create_services_table(cur)
        cur.execute("INSERT INTO services (name, address, port, running, username, pid, monitor_pid) VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id", (name, address, port, True, username, pid, monitor_pid))
        id = cur.fetchone()[0]
        conn.commit()
        return id
    finally:
        cur.close()
        conn.close()

@misc.call_until_succeed(0.01, 30)
def record_that_service_stopped(database, id):
    conn = psycopg2.connect(database)
    cur = conn.cursor()
    try:
        if not table_exists(cur, 'services'):
            return
        cur.execute("UPDATE services SET running=%s WHERE id=%s", (False, id))
        conn.commit()
    finally:
        cur.close()
        conn.close()

    
    

#########################################################
# status updates table
#########################################################


def create_status_table(cur):
    cur.execute("""
CREATE TABLE status (
    id integer,
    time timestamp,
    load integer,
    percent_mem float,
    percent_cpu float,
    cputime float,
    walltime float,
    virtmem_size integer,
    resmem_size integer,
    PRIMARY KEY(id, time))
""")

def update_status(database):
    if not table_exists(cur, 'status'):
        create_status_table(cur)


#########################################################
# log table
#########################################################

def create_log_table(cur):
    cur.execute("""
CREATE TABLE log (
    id serial PRIMARY KEY,
    sid integer,
    logfile varchar,
    time timestamp,
    message varchar)
""")

def mtime(file):
    try:
        return os.path.getmtime(file)
    except OSError:
        return 0

lastmod = None

@misc.call_until_succeed(0.01, 30, 10)
def send_log_to_database(database, sid, logfile, filename):
    global lastmod
    print "Making psycopg2 connection to '%s'..."%database
    conn = psycopg2.connect(database)
    cur = conn.cursor()
    if not table_exists(cur, 'log'):
        create_log_table(cur)
    c = unicode(open(logfile).read(), errors='ignore')  # ignore non-unicode characters in log file
    if len(c) == 0:
        print "logfile is empty"
        return
    try:
        now = psycopg2.TimestampFromTicks(time.time())
        for r in c.splitlines():    
            cur.execute("INSERT INTO log (sid, logfile, time, message) VALUES(%s, %s, %s, %s)",
                        (sid, filename, now, r))
        conn.commit()
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
        print "Failed to commit log messages to database (%s)"%msg
        conn.rollback()
    finally:
        cur.close()
        conn.close()

def target_pid(target_pidfile):
    if not os.path.exists(target_pidfile):
        return None
    try:
        # pidfiles sometimes have more info in them; first line is always master pid
        pid = int(open(target_pidfile).readlines()[0])
        if not misc.is_running(pid):
            return None
        return pid
    except IOError:  # in case file vanished after above check.
        return None

def target_process_still_running(target_pidfile):
    return target_pid(target_pidfile) is not None

def main(name, logfile, pidfile, target_pidfile, target_address, target_port, interval, database):

    @misc.call_until_succeed(0.01, 30, 60)  # processes (e.g., sage) can take a long time to start initially!
    def f():
        p = target_pid(target_pidfile)
        assert p is not None
        return p
    wpid = f()
    id = record_that_service_started(database=database,
                                     name=name, address=target_address, port=target_port,
                                     username=os.environ['USER'], pid=wpid, monitor_pid=os.getpid())
    
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
                    send_log_to_database(database, id, logfile, filename)
                except Exception, msg:
                    print msg
            print "Sleeping %s seconds"%interval
            time.sleep(interval)
            if not target_process_still_running(target_pidfile):
                record_that_service_stopped(database, id)
                return
    finally:
        os.unlink(pidfile)
        record_that_service_stopped(database, id)

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Monitor checks on the logfile every to t seconds to see if it changes, and when it does sends contents to the database, and on successful DB commit empties the file (this is subject to race conditions that could result in a small amount of lost or corrupted data, but the simplicity of implementing this for all clients makes it worth it, especially because the data isn't that important).   The monitor also put an entry in the services table, puts regular status updates in the status table, and these updates are memcached.")

    parser.add_argument("--debug", dest='debug', default=False, action="store_const", const=True,
                        help="debug mode (default: False)")
    parser.add_argument("--logfile", dest='logfile', type=str, required=True,
                        help="when this file changes it is sent to the database server")
    parser.add_argument("--database", dest="database", type=str, required=True,
                        help="database server, e.g., dbname=monitor")
    parser.add_argument("--pidfile", dest="pidfile", type=str, required=True,
                        help="PID file of this daemon process")
    parser.add_argument("--interval", dest="interval", type=int, default=60,  
                        help="check every t seconds to see if logfile has changed and update status info")

    parser.add_argument("--target_name", dest="target_name", type=str, required=True,
                        help="descriptive name of the target service")
    parser.add_argument("--target_pidfile", dest="target_pidfile", type=str, required=True,
                        help="file containing the pid of the process being monitored")
    parser.add_argument("--target_address", dest="target_address", type=str, required=True,
                        help="address that the process being watched listens on")
    parser.add_argument("--target_port", dest="target_port", type=int, required=True,
                        help="port that the process being watched listen on")
    
    args = parser.parse_args()
        
    logfile = os.path.abspath(args.logfile)
    pidfile = os.path.abspath(args.pidfile)
    target_pidfile = os.path.abspath(args.target_pidfile)

    f = lambda: main(name=args.target_name, logfile=logfile, pidfile=pidfile, target_pidfile=target_pidfile,
                     target_address=args.target_address, target_port=args.target_port,
                     interval=args.interval, database=args.database)
    if args.debug:
        f()
    else:
        with daemon.DaemonContext():
            f()
    
    
    
