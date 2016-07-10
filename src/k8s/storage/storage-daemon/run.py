#!/usr/bin/env python3
import datetime, json, os, requests, shutil, signal, socket, subprocess, time

HOSTS = '/node/etc/hosts'


# POD_NAMESPACE must be explicitly set in deployment yaml using downward api --
# see https://github.com/kubernetes/kubernetes/blob/release-1.0/docs/user-guide/downward-api.md
POD_NAMESPACE = os.environ.get('POD_NAMESPACE', 'default')

def log(*args, **kwds):
    print(time_to_timestamp(), *args, **kwds)

alarm_time=0
def mysig(a,b):
    raise KeyboardInterrupt
def alarm(seconds):
    seconds = int(seconds)
    signal.signal(signal.SIGALRM, mysig)
    global alarm_time
    alarm_time = seconds
    signal.alarm(seconds)
def cancel_alarm():
    signal.signal(signal.SIGALRM, signal.SIG_IGN)

def run(v, shell=False, path='.', get_output=False, env=None, verbose=True, timeout=20):
    try:
        alarm(timeout)
        t = time.time()
        if isinstance(v, str):
            cmd = v
            shell = True
        else:
            cmd = ' '.join([(x if len(x.split())<=1 else '"%s"'%x) for x in v])
        if path != '.':
            cur = os.path.abspath(os.curdir)
            if verbose:
                log('chdir %s'%path)
            os.chdir(path)
        try:
            if verbose:
                log(cmd)
            if shell:
                kwds = {'shell':True, 'executable':'/bin/bash', 'env':env}
            else:
                kwds = {'env':env}
            if get_output:
                output = subprocess.Popen(v, stdout=subprocess.PIPE, **kwds).stdout.read().decode()
            else:
                if subprocess.call(v, **kwds):
                    raise RuntimeError("error running '{cmd}'".format(cmd=cmd))
                output = None
            seconds = time.time() - t
            if verbose:
                log("TOTAL TIME: {seconds} seconds -- to run '{cmd}'".format(seconds=seconds, cmd=cmd))
            return output
        finally:
            if path != '.':
                os.chdir(cur)
    finally:
        cancel_alarm()

def get_service(service):
    """
    Get in json format the kubernetes information about the given service.
    """
    if not os.environ['KUBERNETES_SERVICE_HOST']:
        log('KUBERNETES_SERVICE_HOST environment variable not set')
        return None
    URL = "https://{KUBERNETES_SERVICE_HOST}:{KUBERNETES_SERVICE_PORT}/api/v1/namespaces/{POD_NAMESPACE}/endpoints/{service}"
    URL = URL.format(KUBERNETES_SERVICE_HOST=os.environ['KUBERNETES_SERVICE_HOST'],
                     KUBERNETES_SERVICE_PORT=os.environ['KUBERNETES_SERVICE_PORT'],
                     POD_NAMESPACE=POD_NAMESPACE,
                     service=service)
    token = open('/var/run/secrets/kubernetes.io/serviceaccount/token').read()
    headers={'Authorization':'Bearer {token}'.format(token=token)}
    log("Getting k8s information about '{service}' from '{URL}'".format(service=service, URL=URL))
    x = requests.get(URL, headers=headers, verify='/var/run/secrets/kubernetes.io/serviceaccount/ca.crt').json()
    log("Got {x}".format(x=x))
    return x

def update_etc_hosts():
    log('udpate_etc_hosts')
    try:
        v = get_service('storage-projects')
    except Exception as err:
        # Expected to happen when node is starting up, etc. - we'll retry later soon!
        log("Failed getting storage service info", err)
        return
    if v.get('status', None) == 'Failure':
        return
    try:
        if 'addresses' not in v['subsets'][0]:
            return   # nothing to do; no known addresses
        namespace = v['metadata']['namespace']
        hosts = ["{ip}    {namespace}-{name}".format(ip=x['ip'], namespace=namespace,
                              name=x['targetRef']['name'].split('-')[0]) for x in v['subsets'][0]['addresses']]
        start = "# start smc-storage dns - namespace="+namespace+"\n\n"
        end = "# end smc-storage dns - namespace="+namespace+"\n\n"
        block = '\n'.join([start] + hosts + [end])
        current = open(HOSTS).read()
        if block in current:
            return
        i = current.find(start)
        j = current.find(end)
        if i == -1 or j == -1:
            new = current + '\n' + block
        else:
            new = current[:i] + block + current[j+len(end):]
        open(HOSTS,'w').write(new)
    except Exception as err:
        log("Problem in update_etc_hosts", err)

MINION_IP = 'unknown'
def enable_ssh_access_to_minion():
    global MINION_IP
    # create our own local ssh key
    if os.path.exists('/root/.ssh'):
        shutil.rmtree('/root/.ssh')
    run(['ssh-keygen', '-b', '2048', '-N', '', '-f', '/root/.ssh/id_rsa'])
    # make root user of minion allow login using this (and only this) key.
    run('cat /root/.ssh/id_rsa.pub >> /node/root/.ssh/authorized_keys')
    open("/root/.ssh/config",'w').write("StrictHostKeyChecking no\nUserKnownHostsFile=/dev/null\n")
    # record hostname of minion
    for x in open("/node/etc/hosts").readlines():
        if 'group' in x:
            MINION_IP = x.split()[0]
            open("/node/minion_ip",'w').write(MINION_IP)

def minion_ip():
    global MINION_IP
    if MINION_IP == 'unknown':
        if os.path.exists("/node/minion_ip"):
            MINION_IP = open("/node/minion_ip").read()
            return MINION_IP
        else:
            enable_ssh_access_to_minion()
            if MINION_IP == 'unknown':
                raise RuntimeError("first run enable_ssh_access_to_minion")
            else:
                return MINION_IP
    else:
        return MINION_IP

def run_on_minion(v, *args, **kwds):
    if isinstance(v, str):
        v = "ssh " + minion_ip() + " '%s'"%v
    else:
        v = ['ssh', minion_ip() ] + v
    return run(v, *args, **kwds)

def smc_storage(*args, **kwds):
    return run_on_minion(["/usr/libexec/kubernetes/kubelet-plugins/volume/exec/smc~smc-storage/smc-storage"] + list(args), **kwds)

def install_flexvolume_plugin():
    # we always copy it over, which at least upgrades it if necessary.
    shutil.copyfile("/install/smc-storage", "/node/plugin/smc-storage")
    shutil.copymode("/install/smc-storage", "/node/plugin/smc-storage")

def is_plugin_loaded():
    try:
        if int(run_on_minion("zgrep Loaded /var/log/kubelet*|grep smc-storage|wc -l", get_output=True).strip()) > 0:
            return True
        else:
            return False
    except Exception as err:
        log(err)
        return False

def install_zfs():
    try:
        run_on_minion('zpool status')
        log("OK: zfs is installed")
    except:
        log("zfs not installed, so installing it")
        run(['scp', '-r', '/install/gke-zfs', minion_ip()+":"])
        run_on_minion("cd /root/gke-zfs/3.16.0-4-amd64/ && ./install.sh")

def install_bindfs():
    try:
        run_on_minion('which bindfs')
        log("OK: bindfs is installed")
    except:
        log("bindfs not installed, so installing it")
        run_on_minion(["apt-get", "update"])
        run_on_minion(["apt-get", "install", "-y", "bindfs"])

def install_sshfs():
    try:
        run_on_minion('which sshfs')
        log("OK: bindfs is installed")
    except:
        log("bindfs not installed, so installing it")
        run_on_minion(["apt-get", "update"])
        run_on_minion(["apt-get", "install", "-y", "sshfs"])

def install_ssh_keys():
    # Copy the shared secret ssh keys to the minion so that it is able to sshfs
    # mount the storage servers.
    path = '/node/root/.ssh/smc-storage/{POD_NAMESPACE}'.format(POD_NAMESPACE = POD_NAMESPACE)
    if not os.path.exists(path):
        os.makedirs(path)
    for x in ['id-rsa', 'id-rsa.pub']:
        src = os.path.join('/ssh', x); target = os.path.join(path, x.replace('-', '_'))
        shutil.copyfile(src, target)
        os.chmod(target, 0o600)

def restart_kubelet():
    run_on_minion("kill `pidof /usr/local/bin/kubelet`")


TIMESTAMP_FORMAT = "%Y-%m-%d-%H%M%S"      # e.g., 2016-06-27-141131
def time_to_timestamp(tm=None):
    if tm is None:
        tm = time.time()
    return datetime.datetime.fromtimestamp(tm).strftime(TIMESTAMP_FORMAT)


# TODO: this entire approach is pointless and broken because when multiple processes
# append to the same file, the result is broken corruption.
def update_zpool_active_log():
    """
    Update log file showing which ZFS filesystems are mounted, which is used by the backup system.
    """
    prefix = "/mnt/smc-storage/{namespace}/".format(namespace=POD_NAMESPACE)
    try:
        v = run_on_minion("zpool status -PL|grep {prefix}".format(prefix=prefix),
                          get_output=True).splitlines()
    except:
        # Nothing to do -- get error if no pools are mounted
        return
    for x in v:
        w = x.split()
        if w:
            path = w[0].strip()           # '/mnt/smc-storage/test/storage0/foo/bar/abc.zfs/00.img'
            path = path[len(prefix):]     # 'storage0/foo/bar/abc.zfs/00.img'
            path = os.path.split(path)[0] # 'storage0/foo/bar/abc.zfs'
            i = path.find('/')
            server = path[:i]
            image = path[i+1:]
            log = "{timestamp} {image}".format(timestamp=time_to_timestamp(), image=image)
            run_on_minion("echo '{log}' >> {prefix}/{server}/log/active.log".format(
                    log=log, prefix=prefix, server=server))

def update_all_snapshots():
    v = json.loads(smc_storage("zpool-update-snapshots", get_output=True))
    db_set_last_snapshot(v['new_snapshots'])

RETHINKDB_SECRET = '/secrets/rethinkdb/rethinkdb'
import rethinkdb

def rethinkdb_connection():
    auth_key = open(RETHINKDB_SECRET).read().strip()
    if not auth_key:
        auth_key = None
    return rethinkdb.connect(host='rethinkdb-driver', timeout=4, auth_key=auth_key)

def db_set_last_snapshot(new_snapshots):
    """
    new_snapshots should be a dictionary with keys the project_id's and values timestamps.

    This function will connect to the database if possible, and set the last_snapshot field of
    each project (in the projects table) to the given timestamp.
    """
    print("db_set_last_snapshot", new_snapshots)
    if len(new_snapshots) == 0:
        return
    # Open connection to the database
    conn = rethinkdb_connection()
    # Do the queries
    for project_id, timestamp in new_snapshots.items():
        rethinkdb.db("smc").table("projects").get(project_id).update({'last_snapshot':timestamp}).run(conn)
    conn.close()

def update_all_lock_files():
    smc_storage("update-all-locks")

def zpool_clear_errors():
    smc_storage("zpool-clear-errors")

def start_storage_daemon():
    log("launching storage daemon")
    install_flexvolume_plugin()
    enable_ssh_access_to_minion()
    install_ssh_keys()
    install_zfs()
    install_bindfs()
    install_sshfs()
    if not is_plugin_loaded():
        restart_kubelet()
    last_snapshot_update = last_lock_update = last_zpool_clear_errors = 0
    while True:
        try:
            update_etc_hosts()
        except Exception as err:
            log("ERROR updating etc hosts -- ", err)
        if time.time() - last_snapshot_update >= 60*2.5:
            try:
                update_all_snapshots()
                last_snapshot_update = time.time()
            except Exception as err:
                log("ERROR updating snapshots -- ", err)
        if time.time() - last_lock_update >= 90:
            try:
                update_all_lock_files()
                last_lock_update = time.time()
            except Exception as err:
                log("ERROR updating locks -- ", err)
        if time.time() - last_zpool_clear_errors >= 20:
            try:
                zpool_clear_errors()
                last_zpool_clear_errors = time.time()
            except Exception as err:
                log("ERROR zpool_clear_errors -- ", err)
        time.sleep(10)

if __name__ == "__main__":
    start_storage_daemon()