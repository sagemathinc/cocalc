#!/usr/bin/env python
###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2016, Sagemath Inc.
#
#    LICENSE: AGPLv3
#
###############################################################################


"""
Administration and Launch control of salvus components

Use it like so

import admin; reload(admin); a = admin.Services('dev/smc/conf/cloud.sagemath.com')
a.monitor.go(10,3)

"""

####################
# Standard imports
####################
import json, logging, os, shutil, signal, socket, stat, subprocess, sys, time, tempfile

DISK_THRESHOLD = int(os.environ.get("SMC_DISK_THRESHOLD", '96'))

from string import Template

import misc

############################################################
# Paths where data and configuration are stored
############################################################
SITENAME = 'cloud.sagemath.com'
DATA   = 'data'
CONF   = 'conf'
AGENT  = os.path.join(os.environ['HOME'], '.ssh', 'agent')
PWD    = os.path.abspath('.')
PIDS   = os.path.join(DATA, 'pids')   # preferred location for pid files
LOGS   = os.path.join(DATA, 'logs')   # preferred location for pid files
BIN    = os.path.join(DATA, 'local', 'bin')
PYTHON = os.path.join(BIN, 'python')
SECRETS = os.path.join(DATA,'secrets')


# Read in socket of ssh-agent, if there is an AGENT file.
# NOTE: I'm using this right now on my laptop, but it's not yet
# deployed on cloud.sagemath *yet*.  When done, it will mean the
# ssh key used by the hub is password protected, which
# will be much more secure: someone who steals ~/.ssh gets nothing,
# though still if somebody logs in as the salvus user on one of
# these nodes, they can ssh to other nodes, though they can't
# change passwords, etc.   Also, this means having the ssh private
# key on the compute vm's is no longer a security risk, since it
# is protected by a (very long, very random) passphrase.
if os.path.exists(AGENT):
    for X in open(AGENT).readlines():
        if 'SSH_AUTH_SOCK' in X:
            # The AGENT file is as output by ssh-agent.
            os.environ['SSH_AUTH_SOCK'] = X.split(';')[0][len('SSH_AUTH_SOCK='):]

# TODO: factor out all $HOME/smc/src style stuff in code below and use BASE.
BASE = 'smc/src/'

LOG_INTERVAL = 6

GIT_REPO=''   # TODO

whoami = os.environ['USER']

# Default ports
HAPROXY_PORT = 8000
NGINX_PORT   = 8080

HUB_PORT       = 5000
HUB_PROXY_PORT = 5001

SYNCSTRING_PORT = 6001


####################
# Sending an email (useful for monitoring script)
# See http://www.nixtutor.com/linux/send-mail-through-gmail-with-python/
####################

def email(msg= '', subject='ADMIN -- cloud.sagemath.com', toaddrs='monitoring@sagemath.com', fromaddr='salvusmath@gmail.com'):
    log.info("sending email to %s", toaddrs)
    username = 'salvusmath'
    password = open(os.path.join(os.environ['HOME'],'smc/src/data/secrets/salvusmath_email_password')
                    ).read().strip()
    import smtplib
    from email.mime.text import MIMEText
    msg = MIMEText(msg)
    server = smtplib.SMTP('smtp.gmail.com:587')
    server.starttls()
    server.login(username,password)
    for x in toaddrs.split(','):
        toaddr = x.strip()
        msg['Subject'] = subject
        msg['From'] = fromaddr
        msg['To'] = toaddr
        server.sendmail(fromaddr, toaddr, msg.as_string())
    server.quit()

def zfs_size(s):
    """
    Convert a zfs size string to gigabytes (float)
    """
    if len(s) == 0:
        return 0.0
    u = s[-1]; q = float(s[:-1])
    if u == 'M':
        q /= 1000
    elif u == 'T':
        q *= 1000
    elif u == 'K':
        q /= 1000000
    return q

####################
# Running a subprocess
####################
MAXTIME_S=300

def run(args, maxtime=MAXTIME_S, verbose=True, stderr=True):
    """
    Run the command line specified by args (using subprocess.Popen)
    and return the stdout and stderr, killing the subprocess if it
    takes more than maxtime seconds to run.

    If stderr is false, don't include in the returned output.

    If args is a list of lists, run all the commands separately in the
    list.

    if ignore_errors is true, completely ignores any error codes!
    """
    if args and isinstance(args[0], list):
        return '\n'.join([str(run(a, maxtime=maxtime, verbose=verbose)) for a in args])

    args = [str(x) for x in args]

    if maxtime:
        def timeout(*a):
            raise KeyboardInterrupt("running '%s' took more than %s seconds, so killed"%(' '.join(args), maxtime))
        signal.signal(signal.SIGALRM, timeout)
        signal.alarm(maxtime)
    if verbose:
        log.info("running '%s'", ' '.join(args))
    try:
        a = subprocess.Popen(args,
                             stdin  = subprocess.PIPE,
                             stdout = subprocess.PIPE,
                             stderr = subprocess.PIPE)
        if stderr:
            out = a.stderr.read()
        else:
            out = ''
        out += a.stdout.read()
        if verbose:
            log.info("output '%s'", out[:256])
        return out
    finally:
        if maxtime:
            signal.signal(signal.SIGALRM, signal.SIG_IGN)  # cancel the alarm

# A convenience object "sh":
#      sh['list', 'of', ..., 'arguments'] to run a shell command

class SH(object):
    def __init__(self, maxtime=MAXTIME_S):
        self.maxtime = maxtime
    def __getitem__(self, args):
        return run([args] if isinstance(args, str) else list(args), maxtime=self.maxtime)
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


def dns(host, timeout=10):
    """
    Return list of ip addresses of a given host.  Errors out after timeout seconds.
    """
    a = os.popen3("host -t A -W %s %s | awk '{print $4}'"%(timeout,host))
    err = a[2].read().strip()
    if err:
        raise RuntimeError(err)
    out = a[1].read()
    if 'found' in out:
        raise RuntimeError("unknown domain '%s'"%host)
    else:
        return out.split()

########################################
# Standard Python Logging
########################################
logging.basicConfig()
log = logging.getLogger('')
#log.setLevel(logging.DEBUG)   # WARNING, INFO, etc.
log.setLevel(logging.WARNING)   # WARNING, INFO, etc.
#log.setLevel(logging.INFO)   # WARNING, INFO, etc.

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
    """
    Run the command line specified by args (using os.system) and
    return the stdout and stderr, killing the subprocess if it takes
    more than maxtime seconds to run.  If args is a list of lists, run
    all the commands separately in the list, returning *sum* of error
    codes output by os.system.
    """
    if args and isinstance(args[0], list):
        return sum([system(a) for a in args])

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
    if not os.path.exists(filename):
        return groups, ordered_group_names
    namespace = {}
    namespace['os'] = os
    for r in open(filename).xreadlines():
        line = r.split('#')[0].strip()  # ignore comments and leading/trailing whitespace
        if line: # ignore blank lines
            if line.startswith('import ') or '=' in line:
                # import modules for use in assignments below
                print "exec ", line
                exec line in namespace
                continue

            i = line.find(' ')
            if i == -1:
                opts = {}
                name = line
            else:
                name = line[:i]
                opts = eval(line[i+1:], namespace)
            if name.startswith('['):  # host group
                group = name.strip(' []')
                group_opts = opts
                groups[group] = []
                ordered_group_names.append(group)
            else:
                opts.update(group_opts)
                groups[group].append((name, opts))
    for k in sorted(namespace.keys()):
        if not k.startswith('_') and k not in ['os']:
            print "%-20s = %s"%(k, namespace[k])
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
    def __init__(self, hosts_file, username=whoami, passwd=True, password=None):
        """
        - passwd -- if False, don't ask for a password; in this case nothing must require sudo to
          run, and all logins must work using ssh with keys
        """
        self._ssh = {}
        self._username = username
        self._password = password
        self._passwd = passwd
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

    def is_valid_hostname(self, hostname):
        return hostname in self._canonical_hostnames   # ok, since is dictionary mapping hostnames to canonical ones

    def password(self, retry=False):
        if not self._passwd:
            log.info("Explicitly skipping asking for password, due to passwd=False option.")
            return self._password
        if self._password is None or retry:
            import getpass
            self._password = getpass.getpass("%s's password: "%self._username)
        return self._password

    def ssh(self, hostname, timeout=10, keepalive=None, use_cache=True, username=None):
        if username is None:
            username = self._username
        key = (hostname, username)
        if use_cache and key in self._ssh:
            return self._ssh[key]
        import paramiko
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect(hostname=hostname, username=username, password=self._password, timeout=timeout)
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

    def exec_command(self, hostname, command, sudo=False, timeout=90, wait=True, parallel=True, username=None, verbose=True):
        def f(hostname):
            try:
                return self._exec_command(command, hostname, sudo=sudo, timeout=timeout, wait=wait, username=username, verbose=verbose)
            except Exception, msg:
                return {'stdout':'', 'stderr':'Error connecting -- %s: %s'%(hostname, msg)}
        return dict(self.map(f, hostname=hostname, parallel=parallel))

    def __call__(self, *args, **kwds):
        """
        >>> self(hostname, command)
        """
        result = self.exec_command(*args, **kwds)
        if kwds.get('verbose',True):
            for h,v in result.iteritems():
                print '%s :'%(h,),
                print v.get('stdout',''),
                print v.get('stderr',''),
                print
        return result

    def _exec_command(self, command, hostname, sudo, timeout, wait, username=None, verbose=True):
        if not self._passwd:
            # never use sudo if self._passwd is false...
            sudo = False
        start = time.time()
        ssh = self.ssh(hostname, username=username, timeout=timeout)
        try:
            chan = ssh.get_transport().open_session()
        except:
            # try again in case if remote machine got rebooted or something...
            chan = self.ssh(hostname, username=username, timeout=timeout, use_cache=False).get_transport().open_session()
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

    def git_pull(self, hostname, repo=GIT_REPO, timeout=60):
        return self(hostname, 'cd salvus && git pull %s'%repo, timeout=timeout)

    def build(self, hostname, pkg_name, timeout=250):
        return self(hostname, 'cd $HOME/smc/src && source ./smc-env && ./build.py --build_%s'%pkg_name, timeout=timeout)

    def python_c(self, hostname, cmd, timeout=60, sudo=False, wait=True):
        command = 'cd \"$HOME/smc/src\" && source ./smc-env && python -c "%s"'%cmd
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
        if self[hostname] == ['127.0.0.1']:
            print "Not enabling firewall on 127.0.0.1"
            return
        cmd = ' && '.join(['/home/salvus/smc/src/scripts/ufw_clear'] + ['ufw disable'] +
                          ['ufw default allow incoming'] + ['ufw default allow outgoing'] + ['ufw --force reset']
                          + ['ufw ' + c for c in commands] +
                             (['ufw --force enable'] if commands else []))
        return self(hostname, cmd, sudo=True, timeout=10, wait=False)


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

class Monitor(object):
    def __init__(self, hosts, services):
        self._hosts    = hosts
        self._services = services  # used for self-healing

    def compute(self):
        ans = []
        c = 'nproc && uptime && free -g && nprojects && cd smc/src; source smc-env'
        for k, v in self._hosts('compute', c, wait=True, parallel=True, timeout=120).iteritems():
            d = {'host':k[0], 'service':'compute'}
            stdout = v.get('stdout','')
            m = stdout.splitlines()
            if v.get('exit_status',1) != 0 or len(m) < 7:
                d['status'] = 'down'
            else:
                d['status'] = 'up'
                d['nproc']  = int(m[0])
                z = m[1].replace(',','').split()
                d['load1']  = float(z[-3]) / d['nproc']
                d['load5']  = float(z[-2]) / d['nproc']
                d['load15'] = float(z[-1]) / d['nproc']
                z = m[3].split()
                d['ram_used_GB'] = int(z[2])
                d['ram_free_GB'] = int(z[3])
                d['nprojects'] = int(m[6])
            ans.append(d)
        w = [(-d.get('load15',0), d) for d in ans]
        w.sort()
        return [y for x,y in w]

    def nettest(self):
        # Verify that outbound network access is blocked for the nettest user, which was created
        # specifically for this test, and gets the same firewall treatment as all other users except
        # salvus/root.   We actually just test google.com, but odds are that if the firewall were
        # broken, it would at least let that through.
        ans = []
        c = "ping -c 1 -W 1 google.com"
        for k, v in self._hosts('compute', c, wait=True, parallel=True, timeout=120, username='nettest').iteritems():
            if "Operation not permitted" not in v.get('stderr',''):
                status = 'down'
            else:
                status = 'up'
            d = {'host':k[0], 'service':'nettest', 'status':status}
            ans.append(d)
        return ans

    def database(self):
        ans = []
        c = 'pidof postgres'
        for k, v in self._hosts('database', c, wait=True, parallel=True, timeout=120).iteritems():
            d = {'host':k[0], 'service':'database'}
            if v.get('exit_status',1) != 0 :
                d['status'] = 'down'
            else:
                d['status'] = 'up'
            ans.append(d)
        return ans

    def hub(self):
        ans = []
        cmd = 'export TERM=vt100; cd smc/src && source smc-env && check_hub && check_hub_block |tail -1'
        for k, v in self._hosts('hub', cmd, wait=True, parallel=True, timeout=60).iteritems():
            d = {'host':k[0], 'service':'hub'}
            if v['exit_status'] != 0 or v['stderr']:
                d['status'] = 'down'
                continue
            for x in v['stdout'].splitlines()[:5]:
                i = x.find(' ')
                if i != -1:
                    d[x[:i]] = x[i:].strip()
            if 'sign_in_timeouts' in d:
                d['sign_in_timeouts'] = int(d['sign_in_timeouts'])
            if 'db_errors' in d:
                d['db_errors'] = int(d['db_errors'])
            if 'concurrent_warn' in d:
                d['concurrent_warn'] = int(d['concurrent_warn'])
            d['status'] = 'up'
            if d['etime'] == 'ELAPSED':
                d['status'] = 'down'
            if d['sign_in_timeouts'] > 4:
                d['status'] = 'down'  # demands attention!
            if d['db_errors'] > 0:
                d['status'] = 'down'  # demands attention!
            if d['concurrent_warn'] > 0:
                d['status'] = 'down'  # demands attention!
            try:
               d['block'] = int(v['stdout'].splitlines()[3].split()[-1].rstrip('ms'))
               if d['block'] > 15000:
                   d['status'] = 'down'  # demands attention!
            except: pass
            ans.append(d)
        def f(x,y):
            if x['status'] == 'down':
                return -1
            if y['status'] == 'down':
                return 1
            if 'loadavg' in x and 'loadavg' in y:
                return -cmp(float(x['loadavg'].split()[0]), float(y['loadavg'].split()[0]))
            return -1
        ans.sort(f)
        return ans

    def load(self):
        """
        Return normalized load on *everything*, sorted by highest current load first.
        """
        ans = []
        for k, v in self._hosts('all', 'nproc && uptime', parallel=True, wait=True, timeout=80).iteritems():
            d = {'host':k[0]}
            m = v.get('stdout','').splitlines()
            if v.get('exit_status',1) != 0 or len(m) < 2:
                d['status'] = 'down'
            else:
                d['status'] = 'up'
                d['nproc'] = int(m[0])
                z = m[1].replace(',','').split()
                d['load1'] = float(z[-3])/d['nproc']
                d['load5'] = float(z[-2])/d['nproc']
                d['load15'] = float(z[-1])/d['nproc']
                ans.append(d)
        w = [(-d['load15'], d) for d in ans]
        w.sort()
        return [y for x,y in w]

    def pingall(self, hosts='all', on=None):
        v = []
        for x in hosts.split():
            try:
                v += self._hosts[x]
            except ValueError:
                v.append(x)
        c = 'pingall ' + ' '.join(v)
        if on is not None:
            c = 'ssh %s "cd smc/src && source smc-env && %s"'%(on, c)
        print c
        s = os.popen(c).read()
        print s
        return json.loads(s)

    def disk_usage(self, hosts='all', disk_threshold=DISK_THRESHOLD):
        """
        Verify that no disk is more than disk_threshold (=disk_threshold%).
        """
        cmd = "df --output=pcent,source |grep -v fuse | sort -n|tail -1"
        ans = []
        for k, v in self._hosts(hosts, cmd, parallel=True, wait=True, timeout=30).iteritems():
            d = {'host':k[0], 'service':'disk_usage'}
            percent = int((v.get('stdout','100') + ' 0').split()[0].strip().strip('%'))
            d['percent'] = percent
            if percent > disk_threshold:
                d['status'] = 'down'
                print k,v
            else:
                d['status'] = 'up'
            ans.append(d)
        w = [((-d['percent'],d['host']),d) for d in ans]
        w.sort()
        return [y for x,y in w]

    def dns(self, hosts='all', rounds=1):
        """
        Verify that DNS is working well on all machines.
        """
        cmd = '&&'.join(["host -v google.com > /dev/null"]*rounds) + "; echo $?"
        ans = []
        exclude = set([])  # set(self._hosts['cellserver'])  # + self._hosts['webdev'])
        h = ' '.join([host for host in self._hosts[hosts] if host not in exclude])
        if not h:
            return []
        for k, v in self._hosts(h, cmd, parallel=True, wait=True, timeout=30).iteritems():
            d = {'host':k[0], 'service':'dns'}
            exit_code = v.get('stdout','').strip()
            if exit_code == '':
                exit_code = '1'
            if exit_code=='1' or v.get('exit_status',1) != 0:
                d['status'] = 'down'
                print k,v
            else:
                d['status'] = 'up'
            ans.append(d)
        w = [((d.get('status','down'),d['host']),d) for d in ans]
        w.sort()
        return [y for x,y in w]

    def stats(self, timeout=90):
        """
        Get all ip addresses that SITENAME resolves to, then verify that https://ip_address/stats returns
        valid data, for each ip.  This tests that all stunnel and haproxy servers are running.

        NOTE: now that we use cloudflare this test is no longer possible.
        """
        ans = []
        import urllib2, ssl
        ctx = ssl.create_default_context()  # see http://stackoverflow.com/questions/19268548/python-ignore-certicate-validation-urllib2
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        try:
            for ip_address in dns(SITENAME, timeout):
                entry = {'host':ip_address, 'service':'stats'}
                ans.append(entry)
                try:
                    # site must return and be valid json
                    json.loads(urllib2.urlopen('https://%s/stats'%ip_address, timeout=timeout, context=ctx).read())
                    entry['status'] = 'up'
                except:   # urllib2.URLError:  # there are other possible errors
                    entry['status'] = 'down'
        except (RuntimeError, ValueError):
            ans = [{'host':SITENAME, 'service':'stats', 'status':'down'}]

        w = [(d.get('status','down'),d) for d in ans]
        w.sort()
        return [y for x,y in w]

    def ignored_storage_requests(self):
        try:
            n = int(os.popen('ignored_storage_requests').read().strip())
        except:
            n = 10000
        if n > 10:
            status = 'down'
        else:
            status = 'up'
        return [{"ignored_storage_requests":n, 'status':status}]

    def all(self):
        return {
            'timestamp'   : time.time(),
            'disk_usage'  : self.disk_usage(),
            'dns'         : self.dns(),
            'load'        : self.load(),
            #'hub'         : self.hub(),
            #'stats'       : self.stats(),  # disabled due to using cloudflare.
            'compute'     : self.compute(),
            'nettest'     : self.nettest(),
            'database'    : self.database(),
            'storage'     : self.ignored_storage_requests()
        }

    def down(self, all):
        # Make a list of down services
        down = []
        for service, v in all.iteritems():
            if isinstance(v, list):
                for x in v:
                    if x.get('status','') == 'down':
                        down.append(x)
        return down

    def print_status(self, all=None, n=9):
        if all is None:
            all = self.all( )

        print "TIME: " + time.strftime("%Y-%m-%d  %H:%M:%S")

        #print "DNS"
        #for x in all['dns'][:n]:
        #    print x

        #print "HUB"
        #for x in all['hub'][:n]:
        #    print x

        print "DATABASE"
        for x in all['database'][:n]:
            print x

        print "DISK USAGE"
        for x in all['disk_usage'][:n]:
            print x

        print "LOAD"
        for x in all['load'][:n]:
            print x

        #print "STATS"
        #for x in all['stats'][:n]:
        #    print x

        print "COMPUTE"
        vcompute = all['compute']
        print "%s projects running"%(sum([x.get('nprojects',0) for x in vcompute]))
        for x in all['compute'][:n]:
            print x

        if 'storage' in all:
            print "IGNORED_STORAGE_REQUESTS"
            print all['storage'][0]['ignored_storage_requests']

    def _go(self):
        all = self.all()
        self.print_status(all=all)
        down = self.down(all=all)
        m = ''
        if len(down) > 0:
            m += "The following are down: %s"%down
        for x in all['load']:
            if x['load15'] > 400:
                m += "A machine is going *crazy* with load!: %s"%x
        #for x in all['zfs']:
        #    if x['nproc'] > 10000:
        #        m += "Large amount of ZFS: %s"%x
        if m:
            try:
                email(m, subject="SMC issue")
            except Exception, msg:
                print "Failed to send email! -- %s\n%s"%(msg, m)

    def go(self, interval=5, residue=0):
        """
        Run a full monitor scan when the current time in *minutes* since the epoch
        is congruent to residue modulo interval.
        """
        self._services._hosts.password()  # ensure known for self-healing
        import time
        last_time = 0
        i = 0
        while True:
            now = int(time.time()/60)  # minutes since epoch
            if now != last_time:
                #print "%s minutes since epoch"%now
                if now % interval == residue:
                    last_time = now
                    try:
                        self._go()
                    except:
                        print sys.exc_info()[:2]
                        print "ERROR"
                        try:
                            self._go()
                        except:
                            print sys.exc_info()[:2]
                            print "ERROR"
            time.sleep(20)

class Services(object):
    def __init__(self, path, username=whoami, keyspace='salvus', passwd=True, password=""):
        """
        - passwd -- if False, don't ask for a password; in this case nothing must require sudo to
          run, and all logins must work using ssh with keys
        """
        self._keyspace = keyspace
        self._path = path
        self._username = username
        self._hosts = Hosts(os.path.join(path, 'hosts'), username=username, passwd=passwd, password=password)

        self._services, self._ordered_service_names = parse_groupfile(os.path.join(path, 'services'))
        del self._services[None]

        self.monitor = Monitor(Hosts(os.path.join(path, 'hosts'), username=username, passwd=False), services = self)

        # this is the canonical list of options, expanded out by service and host.
        def hostopts(service, query='all', copy=True):
            """Return list of pairs (hostname, options) defined in the services file, where
            the hostname matches the given hostname/group"""
            restrict = set(self._hosts[query])
            return sum([[(h, dict(opts) if copy else opts) for h in self._hosts[query] if h in restrict]
                               for query, opts in self._services[service]], [])

        self._options = dict([(service, hostopts(service)) for service in self._ordered_service_names])

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


    def _action(self, service, action, host, opts, wait, parallel):
        if service not in self._services:
            raise ValueError("unknown service '%s'"%service)


        name = service.capitalize()
        def db_string(address):
            return ""

        v = self._hostopts(service, host, opts)

        self._hosts.password()  # can't get password in thread

        w = [((name, action, address, options, db_string(address), wait),{}) for address, options in v]
        if parallel:
            return misc.thread_map(self._do_action, w)
        else:
            return [self._do_action(*args, **kwds) for args, kwds in w]

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
            timeout = 60

        for t in ['hub', 'nginx', 'proxy']:
            s = '%s_servers'%t
            if s in options:
                # restrict to the subset of servers in the same data center
                dc = self.ip_address_to_dc(address)
                options[s] = [dict(x) for x in options[s] if self.ip_address_to_dc(x['ip']) == dc]
                # turn the ip's into hostnames
                for x in options[s]:
                    x['ip'] = self._hosts.hostname(x['ip'])

        if 'id' not in options:
            options['id'] = 0
        if 'monitor_database' in options:
            db_string = ''
        elif db_string.strip():
            db_string = db_string + ', '

        cmd = "import admin; print admin.%s(%s**%r).%s()"%(name, db_string, options, action)

        ret = self._hosts.python_c(address, cmd, sudo=sudo, timeout=timeout, wait=wait)

        if name == "Compute":
            log.info("Recording compute server in database")
            # TODO...

        return (address, self._hosts.hostname(address), options, ret)

