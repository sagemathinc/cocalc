#!/usr/bin/env python
###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014, William Stein
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################


"""
Copyright (c) William Stein, 2012.  Not open source or free. Will be
assigned to University of Washington.
"""

import os, subprocess, time, uuid
import daemon
import cassandra, misc

#########################################################
# services table
#########################################################

service_columns = ['service_id', 'name', 'address', 'port', 'running', 'username', 'pid', 'monitor_pid']

@misc.call_until_succeed(0.01, 60, 3600)
def record_that_service_started(name, address, port, username, pid, monitor_pid):    
    service_id = uuid.uuid1()
    cassandra.cursor().execute("""
UPDATE services SET name = :name, address = :address, port = :port,
                    running = :running, username = :username, pid = :pid, monitor_pid = :monitor_pid
                    WHERE service_id = :service_id""",
                               {'service_id':service_id, 'name':name, 'address':address, 'running':'true',
                                'port':port, 'username':username, 'pid':pid, 'monitor_pid':monitor_pid})
    return service_id

@misc.call_until_succeed(0.01, 15, 3600)
def record_that_service_stopped(service_id):
    cassandra.cursor().execute("UPDATE services SET running = :running WHERE service_id = :service_id",
                {'running':'false', 'service_id':service_id})

def running_services():
    """
    Return list of the currently running services. 
    """
    cur = cassandra.cursor()
    cur.execute("SELECT * FROM services WHERE running = 'true'")
    r = cur.fetchall()
    return [dict([(c,t[i]) for i,c in enumerate(service_columns)]) for t in r]
    

#########################################################
# status updates table
#########################################################

status_columns = ['service_id', 'time', 'pmem', 'pcpu', 'cputime', 'vsize', 'rss']

def cputime_to_float(s):
    z = s.split(':')
    cputime = float(z[-1])
    if len(z) > 1:
        cputime += float(z[-2])*60
    if len(z) > 2:
        cputime += float(z[-3])*3600
    return cputime

last_status = None
@misc.call_until_succeed(0.01, 5, 10)  # give up relatively quickly since not so important
def update_status(service_id, pid):
    global last_status
    fields = ['pcpu', 'pmem', 'pid', 'cputime', 'rss', 'vsize']
    v = subprocess.Popen(['ps', '-p', str(int(pid)), '-o', ' '.join(fields)],
                         stdin=subprocess.PIPE, stdout = subprocess.PIPE,
                         stderr=subprocess.PIPE).stdout.read().splitlines()
    if len(v) <= 1:
        return    # process not running -- no status

    d = dict(zip(fields, v[-1].split()))
    if d != last_status:
        last_status = d
        now = cassandra.time_to_timestamp(time.time())
        cputime = cputime_to_float(d['cputime'])
        cassandra.cursor().execute("""UPDATE status SET 
                                      pmem = :pmem, pcpu = :pcpu, cputime = :cputime, vsize = :vsize, rss = :rss
                                      WHERE service_id = :service_id AND time = :time""",
                    {'service_id':service_id, 'time':now, 'pmem':d['pmem'], 'pcpu':d['pcpu'],
                     'cputime':cputime, 'vsize':d['vsize'], 'rss':d['rss']})

def latest_status(service_id):
    """
    Return latest status information about service with given id, or
    None if there is no known status information.
    """
    cur = cassandra.cursor()
    cur.execute('SELECT * FROM status WHERE service_id = :service_id ORDER BY time DESC LIMIT 1', {'service_id':service_id})
    r = cur.fetchone()
    if r is None:
        return None
    else:
        return dict([(c, r[i]) for i, c in enumerate(status_columns)])

def lifetime_status(service_id):
    cur = cassandra.cursor()
    cur.execute('SELECT * FROM status WHERE service_id = :service_id ORDER BY time ASC', {'service_id':service_id})
    return cur.fetchall()

#########################################################
# log table
#########################################################

def mtime(file):
    try:
        return os.path.getmtime(file)
    except OSError:
        return 0

lastmod = None

@misc.call_until_succeed(0.01, 30, 10)
def send_log_to_database(service_id, logfile, filename):
    global lastmod
    cur = cassandra.cursor()
    c = unicode(open(logfile).read(), errors='ignore')  # ignore non-unicode characters in log file
    if len(c) == 0:
        print "logfile is empty"
        return
    now = cassandra.time_to_timestamp(time.time())
    for r in c.splitlines():
        print {'logfile':logfile, 'message':r, 'service_id':service_id, 'time':now}
        cur.execute("UPDATE log SET logfile = :logfile, message = :message WHERE service_id = :service_id AND time = :time",
                    {'logfile':os.path.split(logfile)[-1], 'message':r, 'service_id':service_id, 'time':now})
        
    # potential race condition situation below
    if mtime(logfile) != lastmod:
        # file appended to during db send, so delete the part of file we sent (but not the rest)
        open(logfile,'w').write(open(logfile).read()[len(c):])
    else:
        # just clear file
        open(logfile,'w').close()
    lastmod = mtime(logfile)

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

def target_process_still_running(target_pidfile, tpid):
    p = target_pid(target_pidfile)
    return p is not None and p == tpid

def main(name, logfile, pidfile, target_pidfile, target_address, target_port, interval, database_nodes):

    cassandra.set_nodes(database_nodes.split(','))

    @misc.call_until_succeed(0.01, 30, 60)  # processes (e.g., sage) can take a long time to start initially!
    def f():
        p = target_pid(target_pidfile)
        assert p is not None
        return p
    tpid = f()
    service_id = record_that_service_started(name=name, address=target_address, port=target_port,
                                             username=os.environ['USER'], pid=tpid, monitor_pid=os.getpid())
    
    global lastmod
    filename = os.path.split(logfile)[-1]
    try:
        open(pidfile,'w').write(str(os.getpid()))
        lastmod = None
        while True:
            update_status(service_id, tpid)
            
            modtime = mtime(logfile)
            if lastmod != modtime:
                lastmod = modtime
                try:
                    send_log_to_database(service_id, logfile, filename)
                except Exception, msg:
                    print msg
            print "Sleeping %s seconds"%interval
            time.sleep(interval)
            if not target_process_still_running(target_pidfile, tpid):
                record_that_service_stopped(service_id)
                return
    finally:
        os.unlink(pidfile)
        record_that_service_stopped(service_id)

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Monitor checks on the logfile every to t seconds to see if it changes, and when it does sends contents to the database, and on successful DB commit empties the file (this is subject to race conditions that could result in a small amount of lost or corrupted data, but the simplicity of implementing this for all clients makes it worth it, especially because the data isn't that important).   The monitor also put an entry in the services table, puts regular status updates in the status table, and these updates are memcached.")

    parser.add_argument("--debug", dest='debug', default=False, action="store_const", const=True,
                        help="debug mode (default: False)")
    parser.add_argument("--logfile", dest='logfile', type=str, required=True,
                        help="when this file changes it is sent to the database server")
    parser.add_argument("--pidfile", dest="pidfile", type=str, required=True,
                        help="PID file of this daemon process")
    parser.add_argument("--interval", dest="interval", type=int, default=60,  
                        help="check every t seconds to see if logfile has changed and update status info")
    parser.add_argument("--database_nodes", dest="database_nodes", type=str, required=True,
                        help="list of ip addresses of all database nodes in the cluster")
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
                     interval=args.interval, database_nodes=args.database_nodes)
    if args.debug:
        f()
    else:
        with daemon.DaemonContext():
            f()
    
    
    
