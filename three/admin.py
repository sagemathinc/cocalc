#!/usr/bin/env python

"""
Launch control
"""

####################
# Standard imports
####################
import logging, os, shutil, signal, stat, subprocess, tempfile, time

############################################################
# Paths where data and configuration are stored
############################################################
DATA = 'data'
CONF = 'conf'

####################
# Running a subprocess
####################
def run(args, maxtime=5):
    """
    Run the command line specified by args (using subprocess.Popen)
    and return the stdout and stderr, killing the subprocess if it
    takes more than maxtime seconds to run.
    """
    args = [str(x) for x in args]
    def timeout(*a):
        raise KeyboardInterrupt("running '%s' took more than %s seconds, so killed"%(' '.join(args), maxtime))
    signal.signal(signal.SIGALRM, timeout)
    signal.alarm(maxtime)
    log.info("running '%s'", ' '.join(args))
    try:
        return subprocess.Popen(args, stdin=subprocess.PIPE, stdout = subprocess.PIPE,
                                stderr=subprocess.PIPE).stdout.read()
    finally:
        signal.signal(signal.SIGALRM, signal.SIG_IGN)  # cancel the alarm

# A convenience object "sh":
#      sh['list', 'of', ..., 'arguments'] to run a shell command

class SH(object):
    def __getitem__(self, args):
        return run([args] if isinstance(args, str) else list(args))
sh = SH()    

def process_status(pid, run):
    """
    Return the status of a process, obtained using the ps command.
    The run option is used to run the command (so it could run on
    a remote machine).  The result is a dictionary; it is empty if
    the given process is not running. 
    """
    fields = ['%cpu', '%mem', 'etime', 'pid', 'start', 'cputime', 'rss', 'vsize']
    v = run(['ps', '-p', str(int(pid)), '-o', ' '.join(fields)]).splitlines()
    if len(v) <= 1: return {}
    return dict(zip(fields, v[-1].split()))

########################################
# Standard Python Logging
########################################
logging.basicConfig()
log = logging.getLogger('')
log.setLevel(logging.DEBUG)   # WARNING, INFO, etc.

def init_data_directory():
    log.info("ensuring that '%s' exist", DATA)
    if not os.path.exists(DATA):
        os.makedirs(DATA)

    log.info("ensuring that '%s' has restrictive permissions", DATA)
    if os.stat(DATA)[stat.ST_MODE] != 0o40700:
        os.chmod(DATA, 0o40700)

    log.info("ensuring that PATH starts with programs in DATA directory")
    os.environ['PATH'] = os.path.join(DATA, 'local/bin/') + ':' + os.environ['PATH']



########################################
# Local and remote UNIX user accounts
########################################
whoami = os.getlogin()

class Account(object):
    """
    A UNIX user, which can be either local to this computer or remote.
    
    The sudo command (requiring a password) will be used for 'root@localhost',
    and ssh will be used in *all* other cases, even 'root@any_other_machine'.
    """
    def __init__(self, username, hostname='localhost', path='.'):
        self._username = username
        self._hostname = hostname
        self._path = path
        self._user_at = '%s@%s'%(self._username, self._hostname)

    def __repr__(self):
        return '%s:%s'%(self._user_at, self._path)

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
        """Send the given signal to the process with given pid on self._hostname."""
        self.run(['kill', '-%s'%signal, pid])

    def copyfile(self, src, target):
        """
        Copy the file from the file named src on this computer to the
        file named target on self._hostname.
        """
        if self._hostname == 'localhost':
            if self._username == whoami:
                return shutil.copyfile(src, target)
            elif self._username == 'root':
                return sh['sudo', 'cp', src, target]
        return sh['scp', src, self._user_at + ':' + os.path.join(self._path, target)]

    def readfile(self, filename):
        filename = os.path.join(self._path, filename)
        if self._hostname == 'localhost':
            if not os.path.exists(filename):
                raise IOError, "no such file or directory: '%s'"%filename
            try:
                return open(filename).read()
            except IOError:
                pass
            
        path = tempfile.mkdtemp()  # secure
        try:
            dest = os.path.join(path, filename)
            if self._hostname == 'localhost' and self._username == 'root':
                sh['sudo', 'cp', filename, dest]
            else:
                sh['scp', '%s:"%s"'%(self._user_at, filename), dest]
            return open(dest).read()
        finally:
            shutil.rmtree(path)

local_user = Account(username=whoami, hostname='localhost')
local_root = Account(username='root', hostname='localhost')

class Component(object):
    def __init__(self, id, processes):
        self._processes = processes
        self._id = id

    def __repr__(self):
        return "Component %s with %s processes"%(self._id, len(self._processes))

    def __getitem__(self, i):
        return self._processes[i]

    def _procs_with_id(self, ids):
        return [p for p in self._processes if ids is None or p.id() in ids]
        
    def start(self, ids=None):
        return [p.start() for p in self._procs_with_id(ids)]
                
    def stop(self, ids=None):
        return [p.stop() for p in self._procs_with_id(ids)]

    def reload(self, ids=None):
        return [p.reload() for p in self._procs_with_id(ids)]

    def status(self, ids=None):
        return [p.status() for p in self._procs_with_id(ids)]

class Process(object):
    def __init__(self, account, id, pidfile, start_cmd=None, stop_cmd=None, reload_cmd=None):
        self._account = account
        self._id = id
        self._pidfile = pidfile
        self._start_cmd = start_cmd
        self._stop_cmd = stop_cmd
        self._reload_cmd = reload_cmd
        self._pid = None

    def id(self):
        return self._id

    def _parse_pidfile(self, contents):
        return int(contents)
    
    def pid(self):
        if self._pid is not None:
            return self._pid
        try:
            self._pid = self._parse_pidfile(self._account.readfile(self._pidfile).strip())
        except IOError: # no file
            self._pid = None
        return self._pid

    def is_running(self):
        return len(self.status()) > 0
        
    def start(self):
        if self.is_running(): return
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
        return process_status(pid, self._account.run) if pid else {}

    def restart(self):
        self.stop()
        self.start()


####################
# Nginx
####################
class NginxProcess(Process):
    def __init__(self, account, id):
        nginx_cmd = ['nginx', '-c', os.path.join(CONF, 'nginx.conf')]
        Process.__init__(self, account, id,
                         pidfile    = os.path.join(DATA, 'local/nginx.pid'),
                         start_cmd  = nginx_cmd,
                         stop_cmd   = nginx_cmd + ['-s', 'stop'],
                         reload_cmd = nginx_cmd + ['-s', 'reload'])

    def __repr__(self):
        return "Nginx process %s at %s"%(self._id, self._account)
        
nginx = Component('nginx', [NginxProcess(local_user, 0)])

####################
# HAproxy
####################
class HAproxyProcess(Process):
    def __init__(self, account, id):
        pidfile = os.path.join(DATA, 'local/haproxy.pid')
        Process.__init__(self, account, id,
                         pidfile = pidfile,
                         start_cmd = ['haproxy', '-f', 'conf/haproxy.conf', '-p', pidfile])
        
    def _parse_pidfile(self, contents):
        return int(contents.splitlines()[0])


haproxy = Component('haproxy', [HAproxyProcess(local_root,0)])


####################
# PostgreSQL
####################
def pg_conf(**options):
    r = open('conf/postgresql.conf').read()
    for key, value in options.iteritems():
        i = r.find(key + ' = ')
        if i == -1: raise ValueError('invalid postgreSQL option "%s"'%key)
        start = i; stop = i
        while r[start] != '\n':
            start -= 1
        while r[stop] != '\n':
            stop += 1
        r = r[:start+1] + '#%s\n%s = %s'%(r[start+1:stop], key, value) + r[stop:]
    return r

class PostgreSQLProcess(Process):
    def _cmd(self, name, *opts):
        return ['pg_ctl', name, '-D', self._db] + list(opts)

    def _parse_pidfile(self, contents):
        return int(contents.splitlines()[0])
    
    def __init__(self, account, id):
        self._db = os.path.join(DATA, 'db')
        self._conf = os.path.join(self._db, 'postgresql.conf')
        self._log = 'data/logs/postgresql.log'
        Process.__init__(self, account, id,
                         pidfile    = os.path.join(self._db, 'postmaster.pid'),
                         start_cmd  = self._cmd('start', '-l', self._log),
                         stop_cmd   = self._cmd('stop'),
                         reload_cmd = self._cmd('reload'))
        
    def restart(self):
        return self._account.run(self._cmd('restart'))

    def status2(self):
        return self._account.run(self._cmd('status'))

    def options(self):
        try: return self._options
        except AttributeError:
            self._account.readfile(self._conf)
            # TODO
            raise NotImplementedError
        return self._options

    def port(self):
        return self.options()['port']

    def initdb(self, **options):
        s = self._account.run(self._cmd('initdb'))
        log.info(s)
        src = tempfile.NamedTemporaryFile()
        src.write(pg_conf(**options))
        log.info(self._account.copyfile(src.name, self._conf))

    def createdb(self, name='sagews'):
        self._account.run(['createdb', '-p', self.port(), name])
         
postgresql = Component('postgreSQL', [PostgreSQLProcess(local_user, 0)])


## def launch_haproxy_servers():
##     log.info('launching haproxy servers')
##     sh['sudo', 'haproxy', '-f', 'haproxy.conf']

## def start_postgresql():
##     sh['pg_ctl', 'start', '-D', DATABASE, '-l', os.path.join('data/logs', log_files['postgresql'])]
    
## def initialize_postgresql_database():    
##     # on OS X this initdb can fail.  The fix (see http://willbryant.net/software/mac_os_x/postgres_initdb_fatal_shared_memory_error_on_leopard) is to type "sudo sysctl -w kern.sysv.shmall=65536" and also create /etc/sysctl.conf with content "kern.sysv.shmall=65536".
##     sh['initdb', '-D', DATABASE]
##     os.unlink('data/db/postgresql.conf')
##     os.symlink('conf/postgresql.conf', os.path.join('data/db', 'postgresql.conf'))
##     start_postgresql()
##     for i in range(5):  # race condition with server starting -- TODO: detect this better!
##         time.sleep(0.5)
##         try:
##             sh['createdb', '-p', ports['postgresql'], 'sagews']
##             break
##         except:
##             pass

## def launch_postgresql_servers():
##     log.info('launching postgresql servers')
##     if not os.path.exists(DATABASE):
##         initialize_postgresql_database()
##     else:
##         start_postgresql()

## def launch_database_servers():
##     log.info('launching database servers')        

## def launch_memcached_servers():
##     log.info('launching memcached servers')        

## def launch_backend_servers():
##     log.info('launching backend servers')        

## def launch_worker_servers():
##     log.info('launching worker servers')            

## def launch_servers():
##     launch_nginx_servers()
##     launch_haproxy_servers()
##     launch_database_servers()
##     launch_memcached_servers()
##     launch_backend_servers()
##     launch_worker_servers()

## def monitor_servers():
##     # TODO
##     import time
##     time.sleep(1e6)

## def quit_servers():
##     # TODO
##     return

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
