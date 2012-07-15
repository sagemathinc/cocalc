#!/usr/bin/env python

"""
Launch control
"""

import logging, os, shutil, stat, subprocess, tempfile, time

DATA = os.path.abspath('data')
CONF = os.path.abspath('conf')
LOGS = os.path.join(DATA, 'logs')

whoami = os.getlogin()

def run(args):
    log.info("running %s", args)
    return subprocess.Popen(args, stdin=subprocess.PIPE, stdout = subprocess.PIPE,
                            stderr=subprocess.PIPE).stdout.read()

class SH(object):
    def __getitem__(self, args):
        return run([args] if isinstance(args, string) else [str(x) for x in args])
    
sh = SH()    

def ps_stat(pid, run):
    fields = ['%cpu', '%mem', 'etime', 'pid', 'start', 'cputime', 'rss', 'vsize']
    v = sh['ps', '-p', str(pid), '-o', ' '.join(fields)].splitlines()
    if len(v) <= 1: return {}
    return dict(zip(fields, v[-1].split()))

log_files = {'postgresql':'postgres.log',
             }

ports = {'postgresql':5432,  # also coded into postgresql.conf
         }  

# Enable logging
logging.basicConfig()
log = logging.getLogger('')
log.setLevel(logging.DEBUG)   # WARNING, INFO

def init_data_directory():
    log.info("ensuring that the data directory exist")
    if not os.path.exists(DATA):
        os.makedirs(DATA)

    if not os.path.exists(LOGS):
        os.makedirs(LOGS)

    log.info("ensuring that the data directory has restrictive permissions")
    if os.stat(DATA)[stat.ST_MODE] != 0o40700:
        os.chmod(DATA, 0o40700)

    os.environ['PATH'] = os.path.join(DATA, 'local/bin/') + ':' + os.environ['PATH']

DATABASE = os.path.join(DATA, 'db')

def read_configuration_file():
    log.info('reading configuration file')

class Account(object):
    def __init__(self, username, hostname='localhost'):
        self._username = username
        self._hostname = hostname
        self._user_at = '%s@%s'%(self._username, self._hostname)

    def run(self, args):
        """Run command with given arguments using this account and return output."""
        if self._username == whoami and self._hostname == 'localhost':
            pre = []
        elif self._username == 'root' and whoami != 'root':
            pre = ['sudo']   # interactive
        else:
            pre = ['ssh', self._user_at]
        return sh[pre + args]

    def kill(self, pid, signal=15):
        self.run(['kill', '-%s'%signal, pid])

    def readfile(self, filename):
        if self._hostname == 'localhost':
            try:
                return open(filename).read()
            except IOError:
                pass
            
        path = tempfile.mkdtemp()  # secure
        try:
            dest = os.path.join(path, filename)
            if self._hostname == 'localhost' and self._username == 'root':
                # use sudo
                sh['sudo', 'cp', filename, dest]
            else:
                # use ssh
                sh['scp', '%s:"%s"'%(self._user_at, filename), dest]
            if os.path.exists(dest):
                return open(dest).read()
        finally:
            shutil.rmtree(path)
        

local_user = Account(username=whoami, hostname='localhost')

class Component(object):
    def __init__(self, processes):
        self._processes = processes

    def _match(self, ids):
        return [p for p in self._processes if ids is None or p.id() in ids]
        
    def start(self, ids=None):
        return [p.start() for p in self._match(ids)]
                
    def stop(self, ids=None):
        return [p.stop() for p in self._match(ids)]

    def reload(self, ids=None):
        return [p.reload() for p in self._match(ids)]

    def status(self, ids=None):
        return [p.status() for p in self._match(ids)]        

class Process(object):
    def __init__(self, account, pidfile, start_cmd=None, stop_cmd=None, reload_cmd=None):
        self._account = account
        self._pidfile = pidfile
        self._start_cmd = start_cmd
        self._stop_cmd = stop_cmd
        self._reload_cmd = reload_cmd
        self._pid = None

    def pid(self):
        if self._pid is not None:
            return self._pid
        try:
            self._pid = self._account.readfile(self._pidfile)
        except IOError: # no file
            self._pid = None
        return self._pid
        
    def start(self):
        self._pid = None
        if self._start_cmd is not None:
            return self._account.run(self._start_cmd)
        
    def stop(self):
        self._pid = None            
        if self._stop_cmd is not None:
            return self._account.run(self._stop_cmd)
        else:
            return self._account.kill(self.pid())

    def reload(self):
        self._pid = None            
        if self._reload_cmd is not None:
            return self._account.run(self._reload_cmd)
        else:
            return 'reload not defined'

    def status(self):
        pid = self.pid()
        return ps_stat(pid, self._account.run) if pid else {}


nginx_cmd = ['nginx', '-c', os.path.join(CONF, 'nginx.conf')]
nginx_pid = os.path.join(DATA, 'local/logs/nginx.pid')
nginx = Component([Process(account = local_user,
                           pidfile = nginx_pid,
                           start_cmd = nginx_cmd,
                           stop_cmd = nginx_cmd + ['-s', 'stop'],
                           reload_cmd = nginx_cmd + ['-s', 'reload'])])

    

def launch_haproxy_servers():
    log.info('launching haproxy servers')
    sh['sudo', 'haproxy', '-f', 'haproxy.conf']

def start_postgresql():
    sh['pg_ctl', 'start', '-D', DATABASE, '-l', os.path.join('data/logs', log_files['postgresql'])]
    
def initialize_postgresql_database():    
    # on OS X this initdb can fail.  The fix (see http://willbryant.net/software/mac_os_x/postgres_initdb_fatal_shared_memory_error_on_leopard) is to type "sudo sysctl -w kern.sysv.shmall=65536" and also create /etc/sysctl.conf with content "kern.sysv.shmall=65536".
    sh['initdb', '-D', DATABASE]
    os.unlink('data/db/postgresql.conf')
    os.symlink('conf/postgresql.conf', os.path.join('data/db', 'postgresql.conf'))
    start_postgresql()
    for i in range(5):  # race condition with server starting -- TODO: detect this better!
        time.sleep(0.5)
        try:
            sh['createdb', '-p', ports['postgresql'], 'sagews']
            break
        except:
            pass

def launch_postgresql_servers():
    log.info('launching postgresql servers')
    if not os.path.exists(DATABASE):
        initialize_postgresql_database()
    else:
        start_postgresql()

def launch_database_servers():
    log.info('launching database servers')        

def launch_memcached_servers():
    log.info('launching memcached servers')        

def launch_backend_servers():
    log.info('launching backend servers')        

def launch_worker_servers():
    log.info('launching worker servers')            

def launch_servers():
    launch_nginx_servers()
    launch_haproxy_servers()
    launch_database_servers()
    launch_memcached_servers()
    launch_backend_servers()
    launch_worker_servers()

def monitor_servers():
    # TODO
    import time
    time.sleep(1e6)

def quit_servers():
    # TODO
    return

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Launch components of sagews")

    parser.add_argument('--launch_nginx', dest='launch_nginx', action='store_const', const=True, default=False,
                        help="launch the NGINX server")

    parser.add_argument('--launch_haproxy', dest='launch_haproxy', action='store_const', const=True, default=False,
                        help="launch the haproxy server")

    parser.add_argument('--launch_postgresql', dest='launch_postgresql', action='store_const', const=True, default=False,
                        help="launch the postgresql database server")

    args = parser.parse_args()
    
    init_data_directory()
    read_configuration_file()

    if args.launch_nginx:
        launch_nginx_servers()

    if args.launch_haproxy:
        launch_haproxy_servers()

    if args.launch_postgresql:
        launch_postgresql_servers()
