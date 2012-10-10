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
SECRETS = os.path.join(DATA,'secrets')

# TODO: factor out all $HOME/salvus/salvus style stuff in code below and use BASE.
BASE = 'salvus/salvus/'

LOG_INTERVAL = 6

GIT_REPO='git@combinat1.salv.us:.'

whoami = os.environ['USER']

# Default ports
HAPROXY_PORT = 8000
NGINX_PORT   = 8080
SAGE_PORT    = 6000  # also used in cassandra.py.
TORNADO_PORT = 5000
TORNADO_TCP_PORT = 5001


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
#log.setLevel(logging.DEBUG)   # WARNING, INFO, etc.
#log.setLevel(logging.WARNING)   # WARNING, INFO, etc.
log.setLevel(logging.INFO)   # WARNING, INFO, etc.

def restrict(path):
    #log.info("ensuring that '%s' has restrictive permissions", path)
    if os.stat(path)[stat.ST_MODE] != 0o40700:
        os.chmod(path, 0o40700)

def init_data_directory():
    #log.info("ensuring that '%s' exist", DATA)

    for path in [DATA, PIDS, LOGS]:
        if not os.path.exists(path):
            os.makedirs(path)
        restrict(path)
    
    #log.info("ensuring that PATH starts with programs in DATA directory")
    os.environ['PATH'] = os.path.join(DATA, 'local/bin/') + ':' + os.environ['PATH']

init_data_directory()

########################################
# Misc operating system interaction
########################################
def system(args):
    c = ' '.join([str(x) for x in args])
    log.info("running '%s' via system", c)
    return os.system(c)

def abspath(path='.'):
    return os.path.abspath(path)

def kill(pid, signal=15):
    """Send signal to the process with pid."""
    if pid is not None:
        return run(['kill', '-%s'%signal, pid])

def copyfile(src, target):
    return shutil.copyfile(src, target)

def readfile(filename):
    """Read the named file and return its contents."""
    if not os.path.exists(filename):
        raise IOError, "no such file or directory: '%s'"%filename
    try:
        return open(filename).read()
    except IOError:
        pass

def writefile(filename, content):
    open(filename,'w').write(content)

def makedirs(path):
    if not os.path.exists(path):
        os.makedirs(path)

def unlink(filename):
    os.unlink(filename)

def path_exists(path):
    return os.path.exists(path)

def is_running(pid):
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False
            
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
    def __init__(self, id, name, port,
                 pidfile, logfile=None, monitor_database=None,
                 start_cmd=None, stop_cmd=None, reload_cmd=None,
                 start_using_system = False,
                 service=None):
        self._name = name
        self._port = port
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
        system(['tail', '-f', self._logfile])

    def _parse_pidfile(self, contents):
        return int(contents)

    def _read_pid(self, file):
        try:
            return self._pids[file]
        except KeyError:
            try:
                self._pids[file] = self._parse_pidfile(readfile(file).strip())
            except IOError: # no file
                self._pids[file] = None
        return self._pids[file]
    
    def pid(self):
        return self._read_pid(self._pidfile)

    def is_running(self):
        return len(self.status()) > 0

    def _start_monitor(self):
        # TODO: temporarily disabled -- they do no real good anyways.
        return
        if self._monitor_database and self._logfile:
            run([PYTHON, 'monitor.py', '--logfile', self._logfile, 
                 '--pidfile', self._monitor_pidfile, '--interval', LOG_INTERVAL,
                 '--database_nodes', self._monitor_database,
                 '--target_pidfile', self._pidfile,
                 '--target_name', self._name,
                 '--target_address', socket.gethostname(),
                 '--target_port', self._port])

    def monitor_pid(self):
        return self._read_pid(self._monitor_pidfile)

    def _stop_monitor(self):
        # NOTE: This function should never need to be called; the
        # monitor stops automatically when the process it is
        # monitoring stops and it has succeeded in recording this fact
        # in the database.
        if self._monitor_database and self._logfile and path_exists(self._monitor_pidfile):
            try:
                kill(self.monitor_pid())
                unlink(self._monitor_pidfile)
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
                print system(self._start_cmd)
            else:
                print run(self._start_cmd)
        print self._start_monitor()
        
    def stop(self):
        pid = self.pid()
        if pid is None: return
        if self._stop_cmd is not None:
            print run(self._stop_cmd)
        else:
            kill(pid)
        try:
            unlink(self._pidfile)
        except Exception, msg:
            print msg

        while True:
            s = process_status(pid, run)
            if not s:
                break
            print "waiting for %s to terminate"%pid
            time.sleep(0.5)
        
        self._pids = {}

    def reload(self):
        self._stop_monitor()
        self._pids = {}
        if self._reload_cmd is not None:
            return run(self._reload_cmd)
        else:
            return 'reload not defined'

    def status(self):
        pid = self.pid()
        if not pid: return {}
        s = process_status(pid, run)
        if not s:
            self._stop_monitor()
            self._pids = {}
            if path_exists(self._pidfile):
                unlink(self._pidfile)
        return s

    def restart(self):
        self.stop()
        self.start()


####################
# Nginx
####################
class Nginx(Process):
    def __init__(self, id=0, port=NGINX_PORT, monitor_database=None):
        log = 'nginx-%s.log'%id
        pid = 'nginx-%s.pid'%id
        nginx = 'nginx.conf'
        conf = Template(open(os.path.join(CONF, nginx)).read())
        conf = conf.substitute(logfile=log, pidfile=pid, http_port=port)
        nginx_conf = 'nginx-%s.conf'%id
        writefile(filename=os.path.join(DATA, nginx_conf), content=conf)
        nginx_cmd = ['nginx', '-c', '../' + nginx_conf]
        Process.__init__(self, id, name='nginx', port=port,
                         monitor_database = monitor_database,
                         logfile   = os.path.join(LOGS, log),
                         pidfile    = os.path.join(PIDS, pid),
                         start_cmd  = nginx_cmd,
                         stop_cmd   = nginx_cmd + ['-s', 'stop'],
                         reload_cmd = nginx_cmd + ['-s', 'reload'])

    def __repr__(self):
        return "Nginx process %s"%self._id
        
####################
# Stunnel
####################
class Stunnel(Process):
    def __init__(self, id=0, accept_port=443, connect_port=HAPROXY_PORT, monitor_database=None):
        logfile = os.path.join(LOGS,'stunnel-%s.log'%id)
        base = abspath()
        pidfile = os.path.join(base, PIDS,'stunnel-%s.pid'%id) # abspath of pidfile required by stunnel
        self._stunnel_conf = os.path.join(DATA, 'stunnel-%s.conf'%id)
        self._accept_port = accept_port
        self._connect_port = connect_port
        Process.__init__(self, id, name='stunnel', port=accept_port, 
                         monitor_database = monitor_database,
                         logfile    = logfile,
                         pidfile    = pidfile,
                         # stunnel typically run as sudo, and sudo need not preserve PATH on Linux.
                         start_cmd  = [os.path.join(base, DATA, 'local/bin', 'stunnel'), self._stunnel_conf])

    def _pre_start(self):
        pem = os.path.join(SECRETS, 'salv.us/nopassphrase.pem')
        if not os.path.exists(pem):
            raise RuntimeError("stunnel requires that the secret '%s' exists"%pem)

        stunnel = 'stunnel.conf'
        conf = Template(open(os.path.join(CONF, stunnel)).read())
        conf = conf.substitute(logfile=self._logfile, pidfile=self._pidfile,
                               accept_port=self._accept_port, connect_port=self._connect_port)
        writefile(filename=self._stunnel_conf, content=conf)
        
    def __repr__(self):
        return "Stunnel process %s"%self._id

####################
# HAproxy
####################
class Haproxy(Process):
    def __init__(self, id=0, 
                 sitename='salv.us',   # name of site, e.g., 'codethyme.com' if site is https://codethyme.com; used only if insecure_redirect is set
                 accept_proxy_port=HAPROXY_PORT,  # port that stunnel sends decrypted traffic to
                 insecure_redirect_port=None,    # if set to a port number (say 80), then all traffic to that port is immediately redirected to the secure site 
                 insecure_testing_port=None, # if set to a port, then gives direct insecure access to full site
                 nginx_servers=None,   # list of ip addresses
                 tornado_servers=None, # list of ip addresses
                 monitor_database=None,  
                 conf_file='conf/haproxy.conf'):

        pidfile = os.path.join(PIDS, 'haproxy-%s.pid'%id)
        logfile = os.path.join(LOGS, 'haproxy-%s.log'%id)

        if nginx_servers:
            t = Template('server nginx$n $ip:$port maxconn $maxconn')
            nginx_servers = '    ' + ('\n    '.join([t.substitute(n=n, ip=x['ip'], port=x.get('port', NGINX_PORT), maxconn=x.get('maxconn',10000)) for
                                                     n, x in enumerate(nginx_servers)]))

        if tornado_servers:
            t = Template('server tornado$n $ip:$port check maxconn $maxconn')
            tornado_servers = '    ' + ('\n    '.join([t.substitute(n=n, ip=x['ip'], port=x.get('port',TORNADO_PORT), maxconn=x.get('maxconn',10000)) for
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
        writefile(filename=target_conf, content=conf)
        Process.__init__(self, id, name='haproxy', port=accept_proxy_port,
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
    def __init__(self, id=0, address='', port=TORNADO_PORT, tcp_port=TORNADO_TCP_PORT,
                 monitor_database=None, debug=False):
        self._port = port
        pidfile = os.path.join(PIDS, 'tornado-%s.pid'%id)
        logfile = os.path.join(LOGS, 'tornado-%s.log'%id)
        extra = []
        if debug:
            extra.append('-g')
        Process.__init__(self, id, name='tornado', port=port,
                         pidfile = pidfile,
                         logfile = logfile, monitor_database=monitor_database,
                         start_cmd = [PYTHON, 'tornado_server.py',
                                      '-p', port, '-t', tcp_port,
                                      '--address', address,
                                      '--database_nodes', monitor_database,
                                      '-d',
                                      '--pidfile', pidfile, '--logfile', logfile] + extra)

    def __repr__(self):
        return "Tornado server %s on port %s"%(self.id(), self._port)

####################
# Sage
####################

class Sage(Process):
    def __init__(self, id=0, address='', port=SAGE_PORT, monitor_database=None, debug=True):
        self._port = port
        pidfile = os.path.join(PIDS, 'sage-%s.pid'%id)
        logfile = os.path.join(LOGS, 'sage-%s.log'%id)
        Process.__init__(self, id, name='sage', port=port,
                         pidfile    = pidfile,
                         logfile = logfile, monitor_database=monitor_database, 
                         start_cmd  = ['sage', '--python', 'sage_server.py',
                                       '-p', port, '--address', address,
                                       '--pidfile', pidfile, '--logfile', logfile, '2>/dev/null', '1>/dev/null', '&'],
                         start_using_system = True,  # since daemon mode currently broken
                         service = ('sage', port))


    def port(self):
        return self._port
        
########################################
# Cassandra database server
########################################
# environ variable for conf/ dir:  CASSANDRA_CONF

class Cassandra(Process):
    def __init__(self, topology=None, path=None, id=0, monitor_database=None, conf_template_path=None, **kwds):
        """
        id -- arbitrary identifier
        conf_template_path -- path that contains the initial conf files
        """
        cassandra_install = os.path.join(DATA, 'local', 'cassandra')
        if conf_template_path is None:
            conf_template_path = os.path.join(cassandra_install, 'conf')
        assert os.path.exists(conf_template_path)

        path = os.path.join(DATA, 'cassandra-%s'%id) if path is None else path
        makedirs(path)
        log_path = os.path.join(path, 'log'); makedirs(log_path)
        lib_path = os.path.join(path, 'lib'); makedirs(lib_path)
        conf_path = os.path.join(path, 'conf'); makedirs(conf_path)

        if topology:
            kwds['endpoint_snitch'] = 'org.apache.cassandra.locator.PropertyFileSnitch'
            kwds['class_name'] = 'org.apache.cassandra.locator.SimpleSeedProvider'
        
        for name in os.listdir(conf_template_path):
            r = open(os.path.join(conf_template_path, name)).read()
            r = r.replace('/var/log/cassandra', log_path)
            r = r.replace('/var/lib/cassandra', lib_path)

            if name == 'cassandra.yaml':
                for k,v in kwds.iteritems():
                    i = r.find('%s:'%k)
                    if i == -1:
                        raise ValueError("no configuration option '%s'"%k)
                    j = r[i:].find('\n')
                    if j == -1:
                        j = len(r)
                    r = r[:i] + '%s: %s'%(k,v) + r[j+i:]

            elif topology and name == 'cassandra-topology.properties':
                
                r = topology
            
            writefile(filename=os.path.join(conf_path, name), content=r)

        pidfile = os.path.join(PIDS, 'cassandra-%s.pid'%id)
        Process.__init__(self, id=id, name='cassandra', port=9160,
                         logfile = '%s/system.log'%log_path,
                         pidfile = pidfile,
                         start_cmd = ['start-cassandra',  '-c', conf_path, '-p', pidfile],
                         monitor_database=monitor_database)

    
##############################################
# A Virtual Machine
##############################################
class Vm(Process):
    def __init__(self, ip_address, hostname=None, vcpus=2, ram=4, vnc=0, vm_type='kvm', disk='', base='salvus', id=0, monitor_database=None, name='virtual_machine'):
        """
        INPUT:
        
            - ip_address -- ip_address machine gets on the VPN
            - hostname -- hostname to set on the machine itself (if
              not given, sets to something based on the ip address)
            - vcpus -- number of cpus
            - ram -- number of gigabytes of ram (an integer)
            - vnc -- port of vnc console (default: 0 for no vnc)
            - vm_type -- 'kvm' (later maybe 'virtualbox'?)
            - disk -- string 'name1:size1,name2:size2,...' with size in gigabytes
            - base -- string (default: 'salvus'); name of base vm image
            - id -- optional, defaulta:0 (basically ignored)
            - monitor_database -- default: None
            - name -- default: "virtual_machine"
        """
        self._ip_address = ip_address
        self._hostname = hostname
        self._vcpus = vcpus
        self._ram = ram
        self._vnc = vnc
        self._vm_type = vm_type
        self._base = base
        self._disk = disk
        pidfile = os.path.join(PIDS, 'vm-%s.pid'%ip_address)
        logfile = os.path.join(LOGS, 'vm-%s.log'%ip_address)

        start_cmd = [PYTHON, 'vm.py', '-d', '--ip_address', ip_address,
                     '--pidfile', pidfile, '--logfile', logfile,
                     '--vcpus', vcpus, '--ram', ram,
                     '--vnc', vnc, 
                     '--vm_type', vm_type, '--base', base] + \
                     (['--disk', disk] if self._disk else []) + \
                     ['--base', base] + \
                     (['--hostname', self._hostname] if self._hostname else [])
        
        Process.__init__(self, id=id, name=name, port=0,
                         pidfile = pidfile, logfile = logfile,
                         start_cmd = start_cmd,
                         monitor_database=monitor_database)

########################################
# tinc VPN management
########################################

def ping(hostname, count=3, timeout=2):
    """
    Try to ping hostname count times, timing out if we do not
    finishing after timeout seconds.
    
    Return False if the ping fails.  If the ping succeeds, return
    (min, average, max) ping times in milliseconds.
    """
    p = subprocess.Popen(['ping', '-t', str(timeout), '-c', str(count), hostname],
                            stdin=subprocess.PIPE, stdout = subprocess.PIPE,
                            stderr=subprocess.PIPE)
    if p.wait() == 0:
        r = p.stdout.read()
        i = r.rfind('=')
        v = [float(t) for t in r[i+1:].strip().split()[0].split('/')]
        return v[0], v[1], v[2]
    else:
        return False # fail

def tinc_conf(ip_address):
    """
    Configure tinc on this machine, so it can be part of the VPN.

       -- ip_address -- address this machine gets on the vpn
    """
    SALVUS = os.path.realpath(__file__)
    os.chdir(os.path.split(SALVUS)[0])

    # make sure the directories are there
    TARGET = 'data/local/etc/tinc'
    if os.path.exists(TARGET):
        print "deleting '%s'"%TARGET
        shutil.rmtree(TARGET)
        
    for path in [TARGET,  'data/local/var/run']:  # .../run used for pidfile
        if not os.path.exists(path):
            os.makedirs(path)

    # create symbolic link to hosts directory in salvus git repo
    os.symlink(os.path.join('../../../../conf/tinc_hosts'),
               os.path.join(TARGET, 'hosts'))

    # determine what our external ip address is
    external_ip = misc.local_ip_address(dest='8.8.8.8')

    # determine our hostname
    hostname = socket.gethostname()

    # Create the tinc-up script
    tinc_up = os.path.join(TARGET, 'tinc-up')
    open(tinc_up,'w').write(
"""#!/bin/sh
ifconfig $INTERFACE %s netmask 255.0.0.0
"""%ip_address)
    os.chmod(tinc_up, stat.S_IRWXU)

    # Create tinc.conf
    tinc_conf = open(os.path.join(TARGET, 'tinc.conf'),'w')
    tinc_conf.write('Name = %s\n'%hostname)
    for h in os.listdir(os.path.join(TARGET, 'hosts')):
        if "Address" in open(os.path.join(TARGET, 'hosts', h)).read():
            tinc_conf.write('ConnectTo = %s\n'%h)
    # on OS X, we need this, but otherwise we don't:
    if os.uname()[0] == "Darwin":
        tinc_conf.write('Device = /dev/tap0\n')
    tinc_conf.close()

    host_file = os.path.join(TARGET, 'hosts', hostname)
    open(host_file,'w').write(
"""Address = %s
Subnet = %s/32"""%(external_ip, ip_address))

    # generate keys
    print sh['data/local/sbin/tincd', '-K']

    # add file to git and checkin, then push to official repo
    print sh['git', 'pull', 'https://github.com/williamstein/salvus.git']
    print sh['git', 'add', os.path.join('conf/tinc_hosts', hostname)]
    print sh['git', 'commit', '-a', '-m', 'tinc config for %s'%hostname]
    print sh['git', 'push', 'https://github.com/williamstein/salvus.git']
        
    print "To join the vpn on startup,"
    print "add this line to /etc/rc.local:\n"
    print "  nice --19 /home/salvus/salvus/salvus/data/local/sbin/tincd"
    print "You *must* also pull the git repo on"
    print "at least one of the ConnectTo machines to connect."

    
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

def parse_groupfile(filename):
    groups = {None:[]}
    group = None
    group_opts = []
    ordered_group_names = []
    for r in open(filename).xreadlines():
        line = r.split('#')[0].strip()  # ignore comments and leading/trailing whitespace
        if line: # ignore blank lines
            i = line.find(' ')
            if i == -1:
                opts = {}
                name = line
            else:
                name = line[:i]
                opts = eval(line[i+1:])
            if name.startswith('['):  # host group
                group = name.strip(' []')
                group_opts = opts
                groups[group] = []
                ordered_group_names.append(group)
            else:
                opts.update(group_opts)
                groups[group].append((name, opts))
    return groups, ordered_group_names

def parse_hosts_file(filename):
    ip = {}  # ip = dictionary mapping from hostname to a list of ip addresses
    hn = {}  # hn = canonical hostnames for each ip address
    for r in open(filename).readlines():
        line = r.split('#')[0].strip()  # ignore comments and leading/trailing whitespace
        v = line.split()
        if len(v) == 0: continue
        if len(v) <= 1:
            raise ValueError("parsing hosts file -- invalid line '%s'"%r)
        address = v[0]
        hostnames = v[1:]
        hn[address] = hostnames[-1]
        for h in hostnames:
            if len(h) < 1 or len(h) > 63 or not (h.replace('-','').isalnum()):
                raise RuntimeError("invalid hostname: must be at most 63 characters from a-z, 0-9, or -")
            if h in ip:
                ip[h].append(address)
            else:
                ip[h] = [address]
    # make ip address lists canonical
    ip = dict([(host, list(sorted(set(addresses)))) for host, addresses in ip.iteritems()])
    return ip, hn

class Hosts(object):
    """
    Defines a set of hosts on a network and provides convenient tools
    for running commands on them using ssh.
    """ 
    def __init__(self, hosts_file, username=whoami):
        self._ssh = {}
        self._username = username
        self._password = None
        self._ip_addresses, self._canonical_hostnames = parse_hosts_file(hosts_file)
        
    def __getitem__(self, hostname):
        """
        Return list of dinstinct ip_address matching the given hostname.  If the hostname
        is an ip address defined in the hosts file, return [hostname].
        """
        v = hostname.split()
        if len(v) > 1:
            return list(sorted(set(sum([self[q] for q in v], []))))
        if hostname in self._canonical_hostnames.keys():   # it is already a known ip address
            return [hostname]
        if hostname == 'all': # return all ip addresses
            return list(sorted(self._canonical_hostnames.keys()))
        if hostname in self._ip_addresses:
            return self._ip_addresses[hostname]
        raise ValueError("unknown ip hostname or address '%s'"%hostname)

    def hostname(self, ip):
        return self._canonical_hostnames[ip]

    def password(self, retry=False):
        if self._password is None or retry:
            import getpass
            self._password = getpass.getpass("%s's password: "%self._username)
        return self._password

    def ssh(self, hostname, timeout=20, keepalive=None, use_cache=True):
        key = (hostname, self._username)
        if use_cache and key in self._ssh:
            return self._ssh[key]
        import paramiko
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
            ssh.connect(hostname=hostname, username=self._username, password=self._password, timeout=timeout)
        except paramiko.AuthenticationException:
            while True:
                try:
                    ssh.connect(hostname=hostname, username=self._username, password=self.password(retry=True))
                    break
                except paramiko.AuthenticationException, msg:
                    print msg
        if keepalive:
            ssh.get_transport().set_keepalive(keepalive)
        self._ssh[key] = ssh
        return ssh

    def _do_map(self, callable, address, **kwds):
        log.info('%s (%s):', address, self.hostname(address))
        x = callable(address, **kwds)
        log.info(x)
        return x
    
    def map(self, callable, hostname, parallel=True, **kwds):
        # needed before parallel
        self.password()
        def f(address, **kwds):
            return ((address, self.hostname(address)), self._do_map(callable, address, **kwds))
        if parallel:
            return misc.thread_map(f, [((address,), kwds) for address in self[hostname]])
        else:
            return [f(address, **kwds) for address in self[hostname]]

    def ping(self, hostname='all', timeout=3, count=3, parallel=True):
        """
        Return list of pairs ((ip, hostname), ping_time) of those that succeed at pinging
        and a list of pairs ((ip, hostname), False) for those that do not.
        """
        v = self.map(ping, hostname, timeout=timeout, count=count, parallel=parallel)
        return [x for x in v if x[1] is not False], [x for x in v if x[1] is False]

    def ip_addresses(self, hostname):
        return [socket.gethostbyname(h) for h in self[hostname]]

    def exec_command(self, hostname, command, sudo=False, timeout=20, wait=True, parallel=True):
        def f(hostname):
            try:
                return self._exec_command(command, hostname, sudo=sudo, timeout=timeout, wait=wait)
            except Exception, msg:
                return {'stdout':None, 'stderr':'Error connecting -- %s: %s'%(hostname, msg)}
        return dict(self.map(f, hostname=hostname, parallel=parallel))

    def __call__(self, *args, **kwds):
        """
        >>> self(hostname, command)
        """
        result = self.exec_command(*args, **kwds)
        for h,v in result.iteritems():
            print '%s :'%(h,),
            print v['stdout'],
            print v['stderr'],
            print
        return result
    
    def _exec_command(self, command, hostname, sudo, timeout, wait):
        start = time.time()
        ssh = self.ssh(hostname, timeout=timeout)
        import paramiko
        try:
            chan = ssh.get_transport().open_session()
        except:
            # try again in case if remote machine got rebooted or something...
            chan = self.ssh(hostname, timeout=timeout, use_cache=False).get_transport().open_session()
        stdin = chan.makefile('wb')
        stdout = chan.makefile('rb')
        stderr = chan.makefile_stderr('rb')
        cmd = ('sudo -S bash -c "%s"' % command.replace('"', '\\"')) if sudo  else command
        log.info("hostname=%s, command='%s'", hostname, cmd)
        chan.exec_command(cmd)
        if sudo and not stdin.channel.closed:
            try:
                print "sending sudo password..."
                stdin.write('%s\n' % self.password()); stdin.flush()
            except:
                pass                 # could have closed in the meantime if password cached
        if not wait:
            return {'stdout':None, 'stderr':None, 'exit_status':None, 'note':"wait=False: '%s'"%cmd}
        while not stdout.channel.closed:
            time.sleep(0.05)
            if time.time() - start >= timeout:
                raise RuntimeError("on %s@%s command '%s' timed out"%(self._username, hostname, command))
        return {'stdout':stdout.read(), 'stderr':stderr.read(), 'exit_status':chan.recv_exit_status()}

    def public_ssh_keys(self, hostname, timeout=5):
        return '\n'.join([x['stdout'] for x in self.exec_command(hostname, 'cat .ssh/id_rsa.pub', timeout=timeout).values()])

    def git_pull(self, hostname, repo=GIT_REPO, timeout=30):
        return self(hostname, 'cd salvus && git pull %s'%repo, timeout=timeout)

    def build(self, hostname, pkg_name, timeout=250):
        return self(hostname, 'cd $HOME/salvus/salvus && . salvus-env && ./build.py --build_%s'%pkg_name, timeout=timeout)

    def python_c(self, hostname, cmd, timeout=30, sudo=False, wait=True):
        command = 'cd \"$HOME/salvus/salvus\" && . salvus-env && python -c "%s"'%cmd
        log.info("python_c: %s", command)
        return self(hostname, command, sudo=sudo, timeout=timeout, wait=wait)

    def apt_upgrade(self, hostname):
        # some nodes (e.g., sage nodes) have a firewall that disables upgrading via apt,
        # so we temporarily disable it.
        try:
            return self(hostname,'ufw --force disable && apt-get update && apt-get -y upgrade', sudo=True, timeout=120)
            # very important to re-enable the firewall, no matter what!
        finally:
            self(hostname,'ufw --force enable', sudo=True, timeout=120)
        

    def apt_install(self, hostname, pkg):
        # EXAMPLE:   hosts.apt_install('cassandra', 'openjdk-7-jre')
        try:
            return self(hostname, 'ufw --force disable && apt-get -y --force-yes install %s'%pkg, sudo=True, timeout=120)
        finally:
            self(hostname,'ufw --force enable', sudo=True, timeout=120)
        

    def reboot(self, hostname):
        return self(hostname, 'reboot -h now', sudo=True, timeout=5)

    def ufw(self, hostname, commands):
        cmd = ' && '.join(['ufw --force reset'] + ['ufw ' + c for c in commands] +
                             (['ufw --force enable'] if commands else []))
        return self(hostname, cmd, sudo=True, timeout=10, wait=False)

    def nodetool(self, args='', hostname='cassandra', wait=False, timeout=120):
        for k, v in self(hostname, 'salvus/salvus/data/local/cassandra/bin/nodetool %s'%args, timeout=timeout, wait=wait).iteritems():
            print k
            print v['stdout']

    #########################################################
    # SFTP support
    #########################################################    
    def put(self, hostname, local_filename, remote_filename=None, timeout=5):
        if remote_filename is None:
            remote_filename = local_filename
        for hostname in self[hostname]:
            sftp = self.ssh(hostname, timeout=timeout).open_sftp()
            log.info('put: %s --> %s:%s', local_filename, hostname, remote_filename)
            sftp.put(local_filename, remote_filename)

    def putdir(self, hostname, local_path, remote_containing_path='.', timeout=5):
        # recursively copy over the local_path directory tree so that it is contained
        # in remote_containing_path on the target
        for hostname in self[hostname]:
            sftp = self.ssh(hostname, timeout=timeout).open_sftp()
            self._mkdir(sftp, remote_containing_path)
            for dirpath, dirnames, filenames in os.walk(local_path):
                print dirpath, dirnames, filenames
                self._mkdir(sftp, os.path.join(remote_containing_path, dirpath))
                for name in filenames:
                    local = os.path.join(dirpath, name)
                    remote = os.path.join(remote_containing_path, dirpath, name)
                    log.info('put: %s --> %s:%s', local, hostname, remote)
                    sftp.put(local, remote)

    def get(self, hostname, remote_filename, local_filename=None, timeout=5):
        if local_filename is None:
            local_filename = remote_filename
        ssh = self.ssh(hostname, timeout=timeout)
        sftp = ssh.open_sftp()
        sftp.get(remote_filename, local_filename)
        # If I want to implement recursive get of directory: http://stackoverflow.com/questions/6674862/recursive-directory-download-with-paramiko

    def rmdir(self, hostname, path, timeout=10):
        # this is a very dangerous function!
        self(hostname, 'rm -rf "%s"'%path, timeout=timeout)

    def _mkdir(self, sftp, path, mode=0o40700):
        try:
            sftp.mkdir(path, mode)
        except IOError:
            from stat import S_ISDIR
            if not S_ISDIR(sftp.stat(path).st_mode):
                raise IOError("remote '%s' (on %s) exists and is not a path"%(path, hostname))
        

    def mkdir(self, hostname, path, timeout=10, mode=0o40700):  # default mode is restrictive=user only, on general principle.
        for hostname in self[hostname]:
            ssh = self.ssh(hostname, timeout=timeout)
            sftp = ssh.open_sftp()
            self._mkdir(sftp, path, mode)

    def unlink(self, hostname, filename, timeout=10):
        for hostname in self[hostname]:
            ssh = self.ssh(hostname, timeout=timeout)
            sftp = ssh.open_sftp()
            try:
                sftp.remove(filename)
            except:
                pass # file doesn't exist

class Services(object):
    def __init__(self, path, username=whoami):
        self._path = path
        self._username = username
        self._hosts = Hosts(os.path.join(path, 'hosts'), username=username)

        import cassandra
        self._cassandra = self._hosts['cassandra']
        cassandra.set_nodes(self._cassandra)

        self._services, self._ordered_service_names = parse_groupfile(os.path.join(path, 'services'))
        del self._services[None]

        # this is the canonical list of options, expanded out by service and host.
        def hostopts(service, query='all', copy=True):
            """Return list of pairs (hostname, options) defined in the services file, where
            the hostname matches the given hostname/group"""
            restrict = set(self._hosts[query])
            return sum([[(h, dict(opts) if copy else opts) for h in self._hosts[query] if h in restrict]
                               for query, opts in self._services[service]], [])
        
        self._options = dict([(service, hostopts(service)) for service in self._ordered_service_names])

        ##########################################
        # Programatically fill in extra options to the list 
        ##########################################
        # CASSANDRA options
        v = self._options['cassandra']
        # determine the seeds
        seeds = ','.join([h for h, o in v if o.get('seed',False)])
        # determine global topology file; ip_address=data_center:rack
        topology = '\n'.join(['%s=%s'%(h, o.get('topology', 'DC0:RAC0'))
                                                              for h, o in v] + ['default=DC0:RAC0'])
        for address, o in v:
            o['seeds'] = seeds
            o['topology'] = topology
            o['listen_address'] = address
            o['rpc_address'] = address
            if 'seed' in o: del o['seed']

        # HAPROXY options
        nginx_servers = [{'ip':h,'port':o.get('port',NGINX_PORT), 'maxconn':10000}
                         for h, o in self._options['nginx']]
        tornado_servers = [{'ip':h,'port':o.get('port',TORNADO_PORT), 'maxconn':10000}
                           for h, o in self._options['tornado']]
        for _, o in self._options['haproxy']:
            if 'nginx_servers' not in o:
                o['nginx_servers'] = nginx_servers
            if 'tornado_servers' not in o:
                o['tornado_servers'] = tornado_servers

        # TORNADO options
        for address, o in self._options['tornado']:
            # very important: set to listen only on our VPN. 
            o['address'] = address
        
        # SAGE options
        for address, o in self._options['sage']:
            # very, very important: set to listen only on our VPN!  There is an attack where a local user
            # can bind to a more specific address and same port on a machine, and intercept all trafic.
            # For Sage this would mean they could effectively man-in-the-middle take over a sage node.
            # By binding on a specific ip address, we prevent this.
            o['address'] = address
            
        # VM options
        for address, o in self._options['vm']:
            # very, very important: set to listen only on our VPN!  There is an attack where a local user
            # can bind to a more specific address and same port on a machine, and intercept all trafic.
            # For Sage this would mean they could effectively man-in-the-middle take over a sage node.
            # By binding on a specific ip address, we prevent this.
            if 'ip_address' not in o:
                addresses = self._hosts[o['hostname']]
                if len(addresses) != 1:
                    raise RuntimeError("Error configuring a VM: hostname %s doesn't uniquely determine one ip address"%o['hostname'])
                o['ip_address'] = addresses[0]
        

    def _hostopts(self, service, hostname, opts):
        """
        Return copy of pairs (hostname, options_dict) for the given
        service, restricted by the given hostname.
        """
        hosts = set(self._hosts[hostname])
        opts1 = set(opts.iteritems())
        return [(h,dict(o)) for h,o in self._options[service] if h in hosts and opts1.issubset(set([(x,y) for x, y in o.iteritems() if x in opts]))]

    def _do_action(self, name, action, address, options, db_string, wait):

        if 'sudo' in options:
            sudo = True
            del options['sudo']
        else:
            sudo = False
        if 'timeout' in options:
            timeout = options['timeout']
            del options['timeout']
        else:
            timeout = 30

        cmd = "import admin; print admin.%s(id=0%s,**%r).%s()"%(name, db_string, options, action)

        if name == "Cassandra":
            self.cassandra_firewall(address, action)

        elif name == "Stunnel":
            self.stunnel_key_files(address, action)

        elif name == "Tornado":
            self.tornado_secrets(address, action)

        ret = self._hosts.python_c(address, cmd, sudo=sudo, timeout=timeout, wait=wait)

        if name == "Sage":
            # TODO: put in separate function
            log.info("Starting Sage firewall")
            self.sage_firewall(address, action)
            log.info("Recording Sage server in Cassandra")
            import cassandra
            if action in ['start', 'restart']:
                log.info("Recording Sage server START in Cassandra")
                cassandra.record_that_sage_server_started(address)
            elif action == 'stop':
                log.info("Recording Sage server STOP in Cassandra")
                cassandra.record_that_sage_server_stopped(address)

        return (address, self._hosts.hostname(address), options, ret)
        
    def _action(self, service, action, host, opts, wait, parallel):
        if service not in self._services:
            raise ValueError("unknown service '%s'"%service)


        name = service.capitalize()
        db_string = "" if name=='Sage' else ",monitor_database='%s'"%(','.join(self._cassandra))        
        v = self._hostopts(service, host, opts)

        self._hosts.password()  # can't get password in thread

        w = [((name, action, address, options, db_string, wait),{}) for address, options in v]
        
        if parallel:
            return misc.thread_map(self._do_action, w)
        else:
            return [self._do_action(*args, **kwds) for args, kwds in w]

    def stunnel_key_files(self, hostname, action):
        target = os.path.join(BASE, SECRETS)
        for hostname in self._hosts[hostname]:
            if hostname == 'localhost': continue
            if action == 'stop':
                self._hosts.rmdir(hostname, os.path.join(target, 'salv.us'))
            elif action in ['start', 'restart']:
                self._hosts.mkdir(hostname, target)
                self._hosts.putdir(hostname, os.path.join(SECRETS, 'salv.us'), BASE)
        # avoid race condition where file is there but not there.
        time.sleep(.5)

    def tornado_secrets(self, hostname, action):
        target = os.path.join(BASE, SECRETS)
        files = ['tornado.conf', 'server.crt', 'server.key']
        for hostname in self._hosts[hostname]:
            if hostname == 'localhost': continue
            if action == 'stop':
                for name in files:
                    self._hosts.unlink(hostname, os.path.join(target, name))
            elif action in ['start', 'restart']:
                self._hosts.mkdir(hostname, target)
                for name in files:
                    self._hosts.put(hostname, os.path.join(SECRETS, name), os.path.join(target, name))
        # avoid race condition where file is there but not there.
        time.sleep(.5)

    def cassandra_firewall(self, hostname, action):
        if action == "restart":
            action = 'start'
        if action == "stop":
            commands = []
        elif action == "start":
            # TODO: when we get bigger and only cassandra runs on cassandra nodes, remove all but 22 below!
            commands = (['allow %s'%p for p in [22,80,443,655,TORNADO_PORT,TORNADO_TCP_PORT,HAPROXY_PORT,NGINX_PORT]] +
                        ['allow from %s'%ip for ip in self._hosts['cassandra tornado laptop']] +
                        ['deny proto tcp to any port 1:65535', 'deny proto udp to any port 1:65535'])
        elif action == 'status':
            return
        else:
            raise ValueError("unknown action '%s'"%action)
        return self._hosts.ufw(hostname, commands)

    def sage_firewall(self, hostname, action):
        if action == "restart":
            action = 'start'
        if action == "stop":
            commands = []
        elif action == "start":   # 22=ssh, 53=dns, 655=tinc vpn, 
            commands = (['default deny outgoing'] + ['allow %s'%p for p in [22,655]] + ['allow out %s'%p for p in [22,53,655]] +
                        ['allow proto tcp from %s to any port %s'%(ip, SAGE_PORT) for ip in self._hosts['tornado laptop']]+
                        ['deny proto tcp to any port 1:65535', 'deny proto udp to any port 1:65535']
                        )
        elif action == 'status':
            return
        else:
            raise ValueError("unknown action '%s'"%action)
        return self._hosts.ufw(hostname, commands)

    def _all(self, callable, reverse=False):
        names = self._ordered_service_names
        return dict([(s, callable(s)) for s in (reversed(names) if reverse else names)])
                
    def start(self, service, host='all', wait=True, parallel=False, **opts):
        if service == 'all':
            return self._all(lambda x: self.start(x, host=host, wait=wait, **opts), reverse=False)
        return self._action(service, 'start', host, opts, wait=wait, parallel=parallel)
        
    def stop(self, service, host='all', wait=True, parallel=False, **opts):
        if service == 'all':
            return self._all(lambda x: self.stop(x, host=host, wait=wait, **opts), reverse=True)
        return self._action(service, 'stop', host, opts, wait, parallel=parallel)

    def status(self, service, host='all', wait=True, parallel=False, **opts):
        if service == 'all':
            return self._all(lambda x: self.status(x, host=host, wait=True, **opts), reverse=False)
        return self._action(service, 'status', host, opts, wait=True, parallel=parallel)

    def restart(self, service, host='all', wait=True, reverse=True, parallel=False, **opts):
        if service == 'all':
            return self._all(lambda x: self.restart(x, host=host, reverse=reverse, wait=wait, **opts), reverse=reverse)
        return self._action(service, 'restart', host, opts, wait, parallel=parallel)

    def wait_until_up(self, host='all'):
        while True:
            v = self._hosts.ping(host)[1]
            if not v: return
            log.info("Waiting for %s"%(v,))

    def start_system(self):
        log.info(" ** Waiting for kvm hosts")
        self.wait_until_up('kvm-host')
        log.info(" ** Starting virtual machines")
        self.start('vm', parallel=True, wait=False)
        log.info(" ** Waiting for VM's to all finish starting")
        self.wait_until_up('all')
        log.info(" ** Starting cassandra databases.")
        self.start('cassandra', wait=True, parallel=True)
        for service in ['haproxy','nginx','tornado']:
            log.info(" ** Starting %s", service)
            self.start(service, parallel=True, wait=False)
        log.info(" ** Starting sage")
        self.start('sage', parallel=False, wait=False)

    def stop_system(self):
        self.stop('cassandra', parallel=True, wait=True)
        self.stop('vm', parallel=True)
        while True:
            time.sleep(1)
            # TODO: this is horrible
            v = [X[1] for X in self.status('vm',parallel=True) if 'cputime' in X[3].items()[0][1]['stdout']]
            if v: 
                print "Waiting to terminate: %s"%(', '.join(v))
            else:
                break
        print "All vm's successfully terminated"
