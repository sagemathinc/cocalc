#!/usr/bin/env python

"""
Administration and Launch control of sagews components
"""

####################
# Standard imports
####################
import logging, os, shutil, signal, socket, stat, subprocess, tempfile, time

from string import Template

import misc

############################################################
# Paths where data and configuration are stored
############################################################
DATA   = 'data'
CONF   = 'conf'
PIDS   = os.path.join(DATA, 'pids')   # preferred location for pid files
LOGS   = os.path.join(DATA, 'logs')   # preferred location for pid files
BIN    = os.path.join(DATA, 'local', 'bin')
PYTHON = os.path.join(BIN, 'python')

LOG_INTERVAL = 6

####################
# Running a subprocess
####################
def run(args, maxtime=10, verbose=True, env=None):
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
        out = subprocess.Popen(args, stdin=subprocess.PIPE, stdout = subprocess.PIPE,
                                stderr=subprocess.PIPE).stdout.read()
        #log.info("output '%s'", out)
        return out
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

    for path in [DATA, PIDS, LOGS, os.path.join(DATA,'secrets')]:
        if not os.path.exists(path):
            os.makedirs(path)
        restrict(path)
    
    log.info("ensuring that PATH starts with programs in DATA directory")
    os.environ['PATH'] = os.path.join(DATA, 'local/bin/') + ':' + os.environ['PATH']

init_data_directory()

########################################
# Local and remote UNIX user accounts
########################################
whoami = os.environ['USER']

class Account(object):
    """
    A UNIX user, which can be either local to this computer or remote.
    
    The sudo command (requiring a password) will be used for 'root@localhost',
    and ssh will be used in *all* other cases, even 'root@any_other_machine'.
    """
    def __init__(self, username, hostname='localhost', path='.', site=''):
        self._site = site
        self._username = username
        self._hostname = hostname
        self._path = path
        self._user_at = '%s@%s'%(self._username, self._hostname)
        if self._username == whoami and self._hostname == 'localhost':
            self._pre = []
        elif self._username == 'root' and whoami != 'root':
            self._pre = ['sudo', 'LD_LIBRARY_PATH=%s/local/lib'%DATA]   # interactive
        else:
            self._pre = ['ssh', self._user_at, 'LD_LIBRARY_PATH=%s/local/lib'%DATA]  # TODO: works?

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
            if self._hostname == 'localhost':# and self._username == whoami:
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
            src = tempfile.NamedTemporaryFile(delete=False)
            src.write(content)
            src.close()
            self.copyfile(src.name, filename)
            src.unlink(src.name)  # weird semantics

    def makedirs(self, path):
        if self._hostname == 'localhost' and self._username == whoami:
            if not os.path.exists(path):
                os.makedirs(path)
        else:
            self.run(['mkdir', '-p', path])

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
            
            
local_user = Account(username=whoami, hostname='localhost')

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
    def __init__(self, account, id, name, port,
                 pidfile, logfile=None, monitor_database=None,
                 start_cmd=None, stop_cmd=None, reload_cmd=None,
                 start_using_system = False,
                 service=None):
        self._name = name
        self._port = port
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
        self._monitor_database = monitor_database
        self._monitor_pidfile = os.path.splitext(pidfile)[0] + '-log.pid'

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

    def _start_monitor(self):
        if self._monitor_database and self._logfile:
            self._account.run([PYTHON, 'monitor.py', '--logfile', self._logfile, 
                               '--pidfile', self._monitor_pidfile, '--interval', LOG_INTERVAL,
                               '--target_pidfile', self._pidfile,
                               '--target_name', self._name,
                               '--target_address', self._account._hostname,
                               '--target_port', self._port])

    def monitor_pid(self):
        return self._read_pid(self._monitor_pidfile)

    def _stop_monitor(self):
        # NOTE: This function should never need to be called; the
        # monitor stops automatically when the process it is
        # monitoring stops and it has succeeded in recording this fact
        # in the database.
        if self._monitor_database and self._logfile and self._account.path_exists(self._monitor_pidfile):
            try:
                self._account.kill(self.monitor_pid())
                self._account.unlink(self._monitor_pidfile)
            except Exception, msg:
                print msg

    def _pre_start(self):
        pass # overload to add extra config steps before start
    
    def start(self):
        if self.is_running(): return
        self._pids = {}
        self._pre_start()
        if self._start_cmd is not None:
            if self._start_using_system:
                print self._account.system(self._start_cmd)
            else:
                print self._account.run(self._start_cmd)
        print self._start_monitor()
        
    def stop(self):
        pid = self.pid()
        if pid is None: return
        if self._stop_cmd is not None:
            print self._account.run(self._stop_cmd)
        else:
            self._account.kill(pid)
        try:
            self._account.unlink(self._pidfile)
        except Exception, msg:
            print msg

        while True:
            s = process_status(pid, local_user.run if self._account._hostname=='localhost' else self._account.run)
            if not s:
                break
            print "waiting for %s to terminate"%pid
            time.sleep(0.5)
        
        self._pids = {}

    def reload(self):
        self._stop_monitor()
        self._pids = {}
        if self._reload_cmd is not None:
            return self._account.run(self._reload_cmd)
        else:
            return 'reload not defined'

    def status(self):
        pid = self.pid()
        if not pid: return {}
        s = process_status(pid, local_user.run if self._account._hostname=='localhost' else self._account.run)
        if not s:
            self._stop_monitor()
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
    def __init__(self, account, id, port, monitor_database=None):
        log = 'nginx-%s.log'%id
        pid = 'nginx-%s.pid'%id
        nginx = 'nginx.conf'
        conf = Template(open(os.path.join(CONF, nginx)).read())
        conf = conf.substitute(logfile=log, pidfile=pid, http_port=port)
        nginx_conf = 'nginx-%s.conf'%id
        account.writefile(filename=os.path.join(DATA, nginx_conf), content=conf)
        nginx_cmd = ['nginx', '-c', '../' + nginx_conf]
        Process.__init__(self, account, id, name='nginx', port=port,
                         monitor_database = monitor_database,
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
    def __init__(self, account, id, accept_port, connect_port, monitor_database=None):
        logfile = os.path.join(LOGS,'stunnel-%s.log'%id)
        base = account.abspath()
        pidfile = os.path.join(base, PIDS,'stunnel-%s.pid'%id) # abspath of pidfile required by stunnel
        self._stunnel_conf = os.path.join(DATA, 'stunnel-%s.conf'%id)
        self._accept_port = accept_port
        self._connect_port = connect_port
        Process.__init__(self, account, id, name='stunnel', port=accept_port, 
                         monitor_database = monitor_database,
                         logfile    = logfile,
                         pidfile    = pidfile,
                         # stunnel typically run as sudo, and sudo need not preserve PATH on Linux.
                         start_cmd  = [os.path.join(base, DATA, 'local/bin', 'stunnel'), self._stunnel_conf])

    def _pre_start(self):
        stunnel = 'stunnel.conf'
        conf = Template(open(os.path.join(CONF, stunnel)).read())
        conf = conf.substitute(logfile=self._logfile, pidfile=self._pidfile,
                               accept_port=self._accept_port, connect_port=self._connect_port)
        self._account.writefile(filename=self._stunnel_conf, content=conf)
        
    def __repr__(self):
        return "Stunnel process %s at %s"%(self._id, self._account)

####################
# HAproxy
####################
class HAproxy(Process):
    def __init__(self, account, id, 
                 sitename,    # name of site, e.g., 'codethyme.com' if site is https://codethyme.com; used only if insecure_redirect is set
                 accept_proxy_port=8000,  # port that stunnel sends decrypted traffic to
                 insecure_redirect_port=None,    # if set to a port number (say 80), then all traffic to that port is immediately redirected to the secure site 
                 insecure_testing_port=None, # if set to a port, then gives direct insecure access to full site
                 nginx_servers='',   # list of dictionaries [{'ip':ip, 'port':port, 'maxconn':number}, ...] 
                 tornado_servers='', # list of dictionaries [{'ip':ip, 'port':port, 'maxconn':number}, ...]
                 monitor_database=None,  
                 conf_file='conf/haproxy.conf'):

        pidfile = os.path.join(PIDS, 'haproxy-%s.pid'%id)
        logfile = os.path.join(LOGS, 'haproxy-%s.log'%id)

        if nginx_servers:
            t = Template('server nginx$n $ip:$port maxconn $maxconn')
            nginx_servers = '    ' + ('\n    '.join([t.substitute(n=n, ip=x['ip'], port=x['port'], maxconn=x['maxconn']) for
                                                     n, x in enumerate(nginx_servers)]))

        if tornado_servers:
            t = Template('server tornado$n $ip:$port check maxconn $maxconn')
            tornado_servers = '    ' + ('\n    '.join([t.substitute(n=n, ip=x['ip'], port=x['port'], maxconn=x['maxconn']) for
                                                     n, x in enumerate(tornado_servers)]))

        if insecure_redirect_port:
            insecure_redirect = Template(
"""                
frontend unsecured *:$port
    redirect location https://$sitename
""").substitute(port=insecure_redirect_port, sitename=sitename)
        else:
            insecure_redirect=''

        conf = Template(open(conf_file).read()).substitute(
            accept_proxy_port=accept_proxy_port,
            insecure_testing_bind='bind *:%s'%insecure_testing_port if insecure_testing_port else '',
            nginx_servers=nginx_servers,
            tornado_servers=tornado_servers,
            insecure_redirect=insecure_redirect
            )
        
        haproxy_conf = 'haproxy-%s.conf'%id
        target_conf = os.path.join(DATA, haproxy_conf)
        account.writefile(filename=target_conf, content=conf)
        Process.__init__(self, account, id, name='haproxy', port=accept_proxy_port,
                         pidfile = pidfile,
                         logfile = logfile, monitor_database = monitor_database,
                         start_using_system = True, 
                         start_cmd = ['HAPROXY_LOGFILE='+logfile, os.path.join(BIN, 'haproxy'), '-D', '-f', target_conf, '-p', pidfile])
        
    def _parse_pidfile(self, contents):
        return int(contents.splitlines()[0])



####################
# Tornado
####################
class Tornado(Process):
    def __init__(self, account, id, port, monitor_database=None, debug=False):
        self._port = port
        pidfile = os.path.join(PIDS, 'tornado-%s.pid'%id)
        logfile = os.path.join(LOGS, 'tornado-%s.log'%id)
        extra = []
        if debug:
            extra.append('-g')
        Process.__init__(self, account, id, name='tornado', port=port,
                         pidfile = pidfile,
                         logfile = logfile, monitor_database=monitor_database,
                         start_cmd = [PYTHON, 'tornado_server.py', '-d', '-p', port,
                                      '--pidfile', pidfile, '--logfile', logfile] + extra)

    def __repr__(self):
        return "Tornado server %s at %s on port %s"%(self.id(), self._account, self._port)

####################
# Sage
####################

class Sage(Process):
    def __init__(self, account, id, port, monitor_database=None, debug=True):
        self._port = port
        pidfile = os.path.join(PIDS, 'sage-%s.pid'%id)
        logfile = os.path.join(LOGS, 'sage-%s.log'%id)
        Process.__init__(self, account, id, name='sage', port=port,
                         pidfile    = pidfile,
                         logfile = logfile, monitor_database=monitor_database, 
                         start_cmd  = ['sage', '--python', 'sage_server.py', '-p', port,
                                       '--pidfile', pidfile, '--logfile', logfile, '2>/dev/null', '1>/dev/null', '&'],
                         start_using_system = True,  # since daemon mode currently broken
                         service = ('sage', account, port))


    def port(self):
        return self._port
        
########################################
# Cassandra database server
########################################
# environ variable for conf/ dir:  CASSANDRA_CONF

class Cassandra(Process):
    def __init__(self, account, id, conf_template_path=None):
        """
        account - an Account
        id -- arbitrary identifier
        conf_template_path -- path that contains the conf files
        """
        cassandra_install = os.path.join(DATA, 'local', 'cassandra')
        if conf_template_path is None:
            conf_template_path = os.path.join(cassandra_install, 'conf')
        assert os.path.exists(conf_template_path)
        
        target_path = os.path.join(DATA, 'cassandra-%s'%id)
        account.makedirs(target_path)
        log_path = os.path.join(target_path, 'log'); account.makedirs(log_path)
        lib_path = os.path.join(target_path, 'lib'); account.makedirs(lib_path)
        conf_path = os.path.join(target_path, 'conf'); account.makedirs(conf_path)
        
        for name in os.listdir(conf_template_path):
            r = open(os.path.join(conf_template_path, name)).read()
            r = r.replace('/var/log/cassandra', log_path)
            r = r.replace('/var/lib/cassandra', lib_path)
            account.writefile(filename=os.path.join(conf_path, name), content=r)

        pidfile = os.path.join(PIDS, 'cassandra-%s.pid'%id)
        Process.__init__(self, account=account, id=id, name='cassandra', port=9160,
                         logfile = '%s/system.log'%log_path,
                         pidfile = pidfile,
                         start_cmd = ['start-cassandra',  '-c', conf_path, '-p', pidfile])

########################################
# tinc VPN management
########################################

def is_alive(hostname, maxtime=1):
    return subprocess.Popen(['ping', '-t', str(maxtime), '-c', '1', hostname],
                            stdin=subprocess.PIPE, stdout = subprocess.PIPE,
                            stderr=subprocess.PIPE).wait() == 0


def tinc_conf(hostname, connect_to, external_ip=None, delete=True, port=8200):
    """
    Configure tinc on this machine, so it can be part of the VPN.

    hostname = It *must* be the case that DNS resolves hostname.salv.us to the
    ip address that this machine should have.  

    connect_to = list of names of machines that this node should
    try to establish a direct connection to.

    external_ip = non-VPN address of this node; if None, it will
    be automatically determined by connecting

    delete = if true (the default), deletes contents of
    data/local/etc/tinc and remakes from scratch
    """
    assert '.' not in hostname, "hostname must not contain a dot; it should be the name of this node on the VPN"
    
    SALVUS = os.path.realpath(__file__)
    os.chdir(os.path.split(SALVUS)[0])

    # make sure the directories are there
    TARGET = 'data/local/etc/tinc'
    if delete and os.path.exists(TARGET):
        print "deleting '%s'"%TARGET
        shutil.rmtree(TARGET)
        
    for path in [TARGET,  'data/local/var/run']:  # .../run used for pidfile
        if not os.path.exists(path):
            os.makedirs(path)

    # create symbolic link to hosts directory in salvus git repo
    os.symlink(os.path.join('../../../../conf/tinc_hosts'),
               os.path.join(TARGET, 'hosts'))

    # determine what our ip address is
    ip_address = socket.gethostbyname(hostname + '.salv.us')
    print "ip address = ", ip_address

    # Create the tinc-up script
    tinc_up = os.path.join(TARGET, 'tinc-up')
    open(tinc_up,'w').write(
"""#!/bin/sh
ifconfig $INTERFACE %s netmask 255.255.0.0
"""%ip_address)
    os.chmod(tinc_up, stat.S_IRWXU)

    # Create tinc.conf
    tinc_conf = open(os.path.join(TARGET, 'tinc.conf'),'w')
    tinc_conf.write('Name = %s\n'%hostname)
    for h in connect_to:
        tinc_conf.write('ConnectTo = %s\n'%h)
    # on OS X, we need this, but otherwise we don't:
    if os.uname()[0] == "Darwin":
        tinc_conf.write('Device = /dev/tap0\n')
    tinc_conf.close()

    # create the host/hostname file
    if external_ip is None:
        external_ip = misc.local_ip_address()
    host_file = os.path.join(TARGET, 'hosts', hostname)
    open(host_file,'w').write(
"""Address = %s
Subnet = %s/32
Port = %s"""%(external_ip, ip_address, port))

    # generate keys
    sh['data/local/sbin/tincd', '-K']
        
    print "pushing out host file to servers (for security, requires typing password a few times):"
    for h in connect_to:
        addr = None
        for x in open(os.path.join(TARGET, 'hosts', h)).readlines():
            v = x.split()
            if v[0].lower().startswith('address'):
                addr = v[2]
                break
        if addr is None:
            raise RuntimeError, "unable to find address of host %s"%h
        sh['scp', host_file, addr + ':' + os.path.join('salvus/salvus', TARGET, 'hosts/')]

    print "Starting tincd"
    tincd = os.path.abspath('data/local/sbin/tincd')
    sh['sudo', tincd, '-k']
    sh['sudo', tincd]

    print "To join the vpn automatically on startup,"
    print "add this line to /etc/rc.local:\n"
    print "  /home/salvus/salvus/salvus/data/local/sbin/tincd"
    print "\nWhen you git pull on some remote hosts, you may have to"
    print "delete the host files we pushed out above first"
    print "You might also want to git add, push, etc., the new"
    print "host file for this machine..."


    
########################################
# Grouped collection of hosts
# See the files conf/hosts* for examples.
# The format is
#   [group1]
#   hostname1
#   hostname2
#   [group2]
#   hostname3
#   hostname1  # repeats allowed, comments allowed
########################################

class Hosts(object):
    def __init__(self, filename):
        self._groups = {None:[]}
        group = None
        for r in open(filename).xreadlines():
            line = r.split('#')[0].strip()  # ignore comments and leading/trailing whitespace
            if line: # ignore blank lines
                if line.startswith('['):  # host group
                    group = line.strip(' []')
                    self._groups[group] = []
                else:
                    self._groups[group].append(line)

    def __getitem__(self, query='all'):
        if query == 'all': # return all hosts
            return list(sorted(set(sum(self._groups.values(),[]))))
        elif query in self._groups:
            return self._groups[query]
        all = set(self['all'])
        if query in all:
            return [query]
        return [x for x in all if x.startswith(query)]

    def _do_map(self, callable, hostname, **kwds):
        log.info('%s --> ', hostname)
        x = callable(hostname, **kwds)
        log.info(x)
        return x
    
    def map(self, callable, query='all', **kwds):
        return dict((hostname, self._do_map(callable, hostname, **kwds)) for hostname in self[query])

    def ping(self, query='all', maxtime=3):
        return self.map(is_alive, query, maxtime=maxtime)

    def run(self, args, query='all', username=whoami, maxtime=3, **kwds):
        def f(hostname):
            return Account(username, hostname).run(args, maxtime=maxtime, **kwds)
        return self.map(f, query=query)
        
    
                
                
        
    
