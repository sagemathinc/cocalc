#!/usr/bin/env python

"""
Administration and Launch control of sagews components
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
PIDS = os.path.join(DATA, 'pids')   # preferred location for pid files
LOGS = os.path.join(DATA, 'logs')   # preferred location for pid files
LOG_INTERVAL = 5  # raise to something much bigger -- 5 seconds is nice now for debugging.

####################
# Running a subprocess
####################
def run(args, maxtime=10):
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

    for path in [DATA, PIDS, LOGS]:
        if not os.path.exists(path):
            os.makedirs(path)

    log.info("ensuring that '%s' has restrictive permissions", DATA)
    if os.stat(DATA)[stat.ST_MODE] != 0o40700:
        os.chmod(DATA, 0o40700)

    log.info("ensuring that PATH starts with programs in DATA directory")
    os.environ['PATH'] = os.path.join(DATA, 'local/bin/') + ':' + os.environ['PATH']

init_data_directory()

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
        if self._username == whoami and self._hostname == 'localhost':
            self._pre = []
        elif self._username == 'root' and whoami != 'root':
            self._pre = ['sudo']   # interactive
        else:
            self._pre = ['ssh', self._user_at]

    def __repr__(self):
        return '%s:%s'%(self._user_at, self._path)

    def system(self, args):
        os.system(' '.join(self._pre + args))

    def run(self, args):
        """Run command with given arguments using this account and return output."""
        return sh[self._pre + args]

    def abspath(self, path):
        if self._hostname == 'localhost':
            return os.path.abspath(path)
        else:
            return os.path.join(self.run('pwd'), path)

    def kill(self, pid, signal=15):
        """Send signal to the process with pid on self._hostname."""
        if pid is not None:
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
        """Read the named file and return its contents."""
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

########################################
# Component: named collection of Process objects
########################################

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


########################################
# Process: a daemon process that implements part of sagews
########################################

class Process(object):
    def __init__(self, account, id, pidfile, logfile=None, log_database=None,
                       start_cmd=None, stop_cmd=None, reload_cmd=None):
        self._account = account
        self._id = id
        self._pidfile = pidfile
        self._start_cmd = start_cmd
        self._stop_cmd = stop_cmd
        self._reload_cmd = reload_cmd
        self._pids = {}
        self._logfile = logfile
        self._log_database = log_database
        self._log_pidfile = os.path.splitext(pidfile)[0] + '-log.pid'

    def id(self):
        return self._id

    def log_tail(self):
        if self._logfile is None:
            raise NotImplementedError("the logfile is not known")
        self._account.system(['tail', '-f', self._logfile])

    def _parse_pidfile(self, contents):
        return int(contents)

    def _read_pid(self, file):
        try:
            return self._pids[file]
        except KeyError:
            try:
                self._pids[file] = self._parse_pidfile(self._account.readfile(file).strip())
            except IOError: # no file
                self._pids[file] = None
        return self._pids[file]
    
    def pid(self):
        return self._read_pid(self._pidfile)

    def is_running(self):
        return len(self.status()) > 0

    def _start_logwatch(self):
        if self._log_database and self._logfile:
            self._account.run(['./logwatch.py', '-l', self._logfile, '-d', self._log_database,
                               '-p', self._log_pidfile, '-t', LOG_INTERVAL])

    def log_pid(self):
        return self._read_pid(self._log_pidfile)

    def _stop_logwatch(self):
        if self._log_database and self._logfile and os.path.exists(self._log_pidfile):
            try:
                self._account.kill(self.log_pid())
            except Exception, msg:
                print msg
        
    def start(self):
        if self.is_running(): return
        self._pids = {}
        print self._start_logwatch()
        if self._start_cmd is not None:
            print self._account.run(self._start_cmd)
        
    def stop(self):
        self._stop_logwatch()
        if self._stop_cmd is not None:
            print self._account.run(self._stop_cmd)
        else:
            self._account.kill(self.pid())
        self._pids = {}

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
    def __init__(self, account, id, log_database=None, port=8080):
        log = 'nginx-%s.log'%id
        pid = 'nginx-%s.pid'%id
        nginx = 'nginx.conf'
        conf = open(os.path.join(CONF, nginx)).read()
        for k, v in [('LOGFILE', log), ('PIDFILE', pid), ('HTTP_PORT', str(port))]:
            conf = conf.replace(k,v)
        open(os.path.join(DATA, nginx),'w').write(conf)
        nginx_cmd = ['nginx', '-c', '../' + nginx]
        Process.__init__(self, account, id,
                         log_database = log_database,
                         logfile   = os.path.join(LOGS, log),
                         pidfile    = os.path.join(PIDS, pid),
                         start_cmd  = nginx_cmd,
                         stop_cmd   = nginx_cmd + ['-s', 'stop'],
                         reload_cmd = nginx_cmd + ['-s', 'reload'])

    def __repr__(self):
        return "Nginx process %s at %s"%(self._id, self._account)
        
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


####################
# PostgreSQL Database
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
    
    def __init__(self, account, id, log_database=None):
        self._db   = os.path.join(DATA, 'db')
        self._conf = os.path.join(self._db, 'postgresql.conf')
        self._log  = os.path.join(LOGS, 'postgresql-%s.log'%id)
        Process.__init__(self, account, id,
                         log_database=log_database, logfile = self._log,
                         pidfile    = os.path.join(self._db, 'postmaster.pid'),
                         start_cmd  = self._cmd('start') + ['-l', self._log],
                         stop_cmd   = self._cmd('stop'),
                         reload_cmd = self._cmd('reload'))
        
    def restart(self):
        return self._account.run(self._cmd('restart'))

    def status2(self):
        return self._account.run(self._cmd('status'))

    def options(self):
        v = [x for x in self._account.readfile(self._conf).splitlines() if x.strip() and not x.strip().startswith('#')]
        return dict([[a.split()[0] for a in x.split('=')[:2]] for x in v])

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
         
####################
# Memcached -- use like so:
#     import memcache; c = memcache.Client(['localhost:12000']); c.set(...); c.get(...)
####################
class Memcached(Process):
    def __init__(self, account, id, **options):
        """
        maxmem is in megabytes
        """
        self._options = options
        pidfile = os.path.join(PIDS, 'memcached-%s.pid'%id)
        Process.__init__(self, account, id,
                         pidfile    = pidfile,
                         start_cmd  = ['memcached', '-P', account.abspath(pidfile), '-d'] + \
                                             sum([['-' + k, v] for k,v in options.iteritems()],[])
                         )

    def port(self):
        return int(self._options.get('p', 11211))


####################
# Backend
####################
class Backend(Process):
    def __init__(self, account, id, port, debug=True):
        self._port = port
        self._pidfile = os.path.join(PIDS, 'backend-%s.pid'%id)
        self._logfile = os.path.join(LOGS, 'backend-%s.log'%id)
        extra = []
        if debug:
            extra.append('-g')
        Process.__init__(self, account, id, self._pidfile,
                         start_cmd = ['./backend.py', '-d', '-p', port,
                                      '--pidfile', self._pidfile, '--logfile', self._logfile] + extra)

    def __repr__(self):
        return "Backend %s at %s on port %s"%(self.id(), self._account, self._port)

####################
# Worker
####################
class Worker(Process):
    def __init__(self, account, id, port, debug=True):
        self._port = port
        pidfile = os.path.join(DATA, 'local/worker-%s.pid'%id)
        Process.__init__(self, account, id,
                         pidfile    = pidfile,
                         start_cmd  = ['./worker.py', '--daemon', '--port', port, '--pidfile', pidfile],
                         stop_cmd   = ['./worker.py', '--stop', '--pidfile', pidfile])

    def port(self):
        return self._port
        

####################
# A configuration
####################

# define two important local accounts
local_user = Account(username=whoami, hostname='localhost')
local_root = Account(username='root', hostname='localhost')

log_database = "postgresql://localhost:5432/sagews"

nginx      = Component('nginx', [NginxProcess(local_user, 0)])
haproxy    = Component('haproxy', [HAproxyProcess(local_root,0)])
postgresql = Component('postgreSQL', [PostgreSQLProcess(local_user, 0, log_database=log_database)])
memcached  = Component('memcached', [Memcached(local_user, 0)])
backend    = Component('backend', [Backend(local_user, 0, 5560)])


if __name__ == "__main__":

    import argparse
    parser = argparse.ArgumentParser(description="Launch components of sagews")
