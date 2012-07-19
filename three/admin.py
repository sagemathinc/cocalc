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
LOG_INTERVAL = 60  # raise to something much bigger -- short is nice now for debugging.

####################
# Running a subprocess
####################
def run(args, maxtime=10, verbose=True):
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
    if verbose:
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
    v = run(['ps', '-p', str(int(pid)), '-o', ' '.join(fields)], verbose=False).splitlines()
    if len(v) <= 1: return {}
    return dict(zip(fields, v[-1].split()))

########################################
# Standard Python Logging
########################################
logging.basicConfig()
log = logging.getLogger('')
log.setLevel(logging.DEBUG)   # WARNING, INFO, etc.

def restrict(path):
    log.info("ensuring that '%s' has restrictive permissions", path)
    if os.stat(path)[stat.ST_MODE] != 0o40700:
        os.chmod(path, 0o40700)

def init_data_directory():
    log.info("ensuring that '%s' exist", DATA)

    for path in [DATA, PIDS, LOGS]:
        if not os.path.exists(path):
            os.makedirs(path)
        restrict(path)
    
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
        c = ' '.join(self._pre + [str(x) for x in args])
        log.info("running '%s' via system", c)
        return os.system(c)

    def run(self, args, **kwds):
        """Run command with given arguments using this account and return output."""
        return run(self._pre + args, **kwds)

    def abspath(self, path=None):
        if not hasattr(self, '_abspath'):
            if self._hostname == 'localhost' and self._username == whoami:
                self._abspath = os.path.abspath(self._path)
            else:
                self._abspath = self.run(['pwd']).strip()
        if not path:
            return self._abspath
        return os.path.join(self._abspath, path)

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

    def writefile(self, filename, content):
        if self._hostname == 'localhost' and self._username == whoami:
            open(filename,'w').write(content)
        else:
            src = tempfile.NamedTemporaryFile()
            src.write(content)
            self.copyfile(src.name, filename)

    def unlink(self, filename):
        filename = os.path.join(self._path, filename)
        if self._hostname == 'localhost' and self._username == whoami:
            os.unlink(filename)
            return
        if self._hostname == 'localhost' and self._username == 'root':
            sh['sudo', 'rm', filename]
        else:
            sh['ssh', self._user_at, 'rm', filename]

    def path_exists(self, path):
        if self._hostname == 'localhost' and self._username == whoami:
            return os.path.exists(path)
        no_such = 'No such file or directory'  # TODO: could be broken by naming the path this way...
        if self._hostname == 'localhost' and self._username == 'root':
            return no_such not in sh['sudo', 'stat', path]
        else:
            return no_such not in sh['ssh', self._user_at, 'stat', path]
        
    def is_running(self, pid):
        if self._hostname == 'localhost':
            try:
                os.kill(pid, 0)
                return True
            except OSError:
                return False
        else:
            return bool(os.system(['kill', '-0', str(os.getpid())]))
            
            

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

    def restart(self, ids=None):
        return [p.restart() for p in self._procs_with_id(ids)]

    def status(self, ids=None):
        return [p.status() for p in self._procs_with_id(ids)]


########################################
# Process: a daemon process that implements part of sagews
########################################

class Process(object):
    def __init__(self, account, id, pidfile, logfile=None, log_database=None,
                 start_cmd=None, stop_cmd=None, reload_cmd=None,
                 start_using_system = False):
        self._account = account
        self._id = str(id)
        assert len(self._id.split()) == 1
        self._pidfile = pidfile
        self._start_cmd = start_cmd
        self._start_using_system = start_using_system
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
        if self._log_database and self._logfile and self._account.path_exists(self._log_pidfile):
            try:
                self._account.kill(self.log_pid())
                self._account.unlink(self._log_pidfile)
            except Exception, msg:
                print msg
        
    def start(self):
        if self.is_running(): return
        self._pids = {}
        print self._start_logwatch()
        if self._start_cmd is not None:
            if self._start_using_system:
                print self._account.system(self._start_cmd)
            else:
                print self._account.run(self._start_cmd)
        
    def stop(self):
        self._stop_logwatch()
        if self.pid() is None: return
        if self._stop_cmd is not None:
            print self._account.run(self._stop_cmd)
        else:
            self._account.kill(self.pid())
        try:
            self._account.unlink(self._pidfile)
        except Exception, msg:
            print msg
        self._pids = {}

    def reload(self):
        self._stop_logwatch()
        self._pids = {}
        if self._reload_cmd is not None:
            return self._account.run(self._reload_cmd)
        else:
            return 'reload not defined'

    def status(self):
        pid = self.pid()
        if not pid: return {}
        s = process_status(pid, self._account.run)
        if not s:
            self._stop_logwatch()
            self._pids = {}
            if self._account.path_exists(self._pidfile):
                self._account.unlink(self._pidfile)
        return s

    def restart(self):
        self.stop()
        self.start()


####################
# Nginx
####################
class Nginx(Process):
    def __init__(self, account, id, log_database=None, port=8080):
        log = 'nginx-%s.log'%id
        pid = 'nginx-%s.pid'%id
        nginx = 'nginx.conf'
        conf = open(os.path.join(CONF, nginx)).read()
        # fill in template        
        for k, v in [('LOGFILE', log), ('PIDFILE', pid), ('HTTP_PORT', str(port))]:
            conf = conf.replace(k,v)
        nginx_conf = 'nginx-%s.conf'%id
        account.writefile(filename=os.path.join(DATA, nginx_conf), content=conf)
        nginx_cmd = ['nginx', '-c', '../' + nginx_conf]
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
# Stunnel
####################
class Stunnel(Process):
    def __init__(self, account, id, accept_port, connect_port, log_database=None):
        log = os.path.join(LOGS,'stunnel-%s.log'%id)
        pid = account.abspath(os.path.join(PIDS,'stunnel-%s.pid'%id)) # abspath required by stunnel
        stunnel = 'stunnel.conf'
        conf = open(os.path.join(CONF, stunnel)).read()
        # fill in template
        for k, v in [('LOGFILE', log), ('PIDFILE', pid), ('ACCEPT_PORT', str(accept_port)), ('CONNECT_PORT', str(connect_port))]:
            conf = conf.replace(k,v)
        stunnel_conf = os.path.join(DATA, 'stunnel-%s.conf'%id)
        account.writefile(filename=stunnel_conf, content=conf)
        Process.__init__(self, account, id,
                         log_database = log_database,
                         logfile    = log,
                         pidfile    = pid,
                         start_cmd  = ['stunnel', stunnel_conf])

    def __repr__(self):
        return "Stunnel process %s at %s"%(self._id, self._account)

####################
# HAproxy
####################
class HAproxy(Process):
    def __init__(self, account, id, log_database=None):
        pidfile = os.path.join(PIDS, 'haproxy-%s.pid'%id)
        logfile = os.path.join(LOGS, 'haproxy-%s.log'%id)
        Process.__init__(self, account, id, pidfile = pidfile,
                         logfile = logfile, log_database = log_database,
                         start_using_system = True, 
                         start_cmd = ['HAPROXY_LOGFILE='+logfile, 'haproxy', '-D', '-f', 'conf/haproxy.conf', '-p', pidfile])
        
    def _parse_pidfile(self, contents):
        return int(contents.splitlines()[0])

class HAproxy8000(Process):
    def __init__(self, account, id, log_database=None):
        pidfile = os.path.join(PIDS, 'haproxy-%s.pid'%id)
        logfile = os.path.join(LOGS, 'haproxy-%s.log'%id)
        Process.__init__(self, account, id, pidfile = pidfile,
                         logfile = logfile, log_database = log_database,
                         start_using_system = True, 
                         start_cmd = ['HAPROXY_LOGFILE='+logfile, 'haproxy', '-D', '-f', 'conf/haproxy8000.conf', '-p', pidfile])
        
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

class PostgreSQL(Process):
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
                         stop_cmd   = self._cmd('stop') + ['-m', 'fast'],
                         reload_cmd = self._cmd('reload'))
        
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
        self._account.writefile(filename=self._conf, content=pg_conf(**options))

    def createdb(self, name='sagews'):
        self._account.run(['createdb', '-p', self.port(), name])
         
####################
# Memcached -- use like so:
#     import memcache; c = memcache.Client(['localhost:12000']); c.set(...); c.get(...)
####################
class Memcached(Process):
    def __init__(self, account, id, log_database=None, **options):
        """
        maxmem is in megabytes
        """
        self._options = options
        pidfile = os.path.join(PIDS, 'memcached-%s.pid'%id)
        logfile = os.path.join(LOGS, 'memcached-%s.log'%id)
        Process.__init__(self, account, id,
                         pidfile    = pidfile,
                         logfile    = logfile, log_database = log_database,
                         start_cmd  = ['memcached', '-P', account.abspath(pidfile), '-d'] + \
                                      ['-vv', '>' + logfile, '2>&1'] + \
                                      sum([['-' + k, v] for k,v in options.iteritems()],[]),
                         start_using_system = True
                         )

    def port(self):
        return int(self._options.get('p', 11211))

    def stop(self):
        # memcached doesn't delete its .pid file after exiting
        pid = self.pid()
        if pid is not None:
            Process.stop(self)
            if not self._account.is_running(pid):
                try:
                    self._account.unlink(self._pidfile)
                except Exception,msg:
                    log.info("Issue unlinking pid file: %s", msg)
                    
            

####################
# Backend
####################
class Backend(Process):
    def __init__(self, account, id, port, log_database=None, debug=False):
        self._port = port
        pidfile = os.path.join(PIDS, 'backend-%s.pid'%id)
        logfile = os.path.join(LOGS, 'backend-%s.log'%id)
        extra = []
        if debug:
            extra.append('-g')
        Process.__init__(self, account, id, pidfile = pidfile,
                         logfile = logfile, log_database=log_database,
                         start_cmd = ['./backend.py', '-d', '-p', port,
                                      '--pidfile', pidfile, '--logfile', logfile] + extra)

    def __repr__(self):
        return "Backend %s at %s on port %s"%(self.id(), self._account, self._port)

####################
# Worker
####################
class Worker(Process):
    def __init__(self, account, id, port, log_database=None, debug=True):
        self._port = port
        pidfile = os.path.join(PIDS, 'worker-%s.pid'%id)
        logfile = os.path.join(LOGS, 'worker-%s.log'%id)
        Process.__init__(self, account, id, pidfile    = pidfile,
                         logfile = logfile, log_database=log_database,
                         start_cmd  = ['sage', '--python', 'worker.py', '--port', port,
                                       '--pidfile', pidfile, '--logfile', logfile, '2>/dev/null', '1>/dev/null', '&'],
                         start_using_system = True,  # since daemon mode currently broken
                         stop_cmd   = ['sage', '--python', 'worker.py', '--stop', '--pidfile', pidfile])

    def port(self):
        return self._port
        

local_user = Account(username=whoami, hostname='localhost')
root_user =  Account(username='root', hostname='localhost')
remote_user =  Account(username=whoami, hostname='ubuntu')
