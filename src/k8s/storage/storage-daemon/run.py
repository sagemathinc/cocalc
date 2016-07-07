#!/usr/bin/env python3
import datetime, json, os, requests, shutil, socket, subprocess, time

HOSTS = '/node/etc/hosts'


# POD_NAMESPACE must be explicitly set in deployment yaml using downward api --
# see https://github.com/kubernetes/kubernetes/blob/release-1.0/docs/user-guide/downward-api.md
POD_NAMESPACE = os.environ.get('POD_NAMESPACE', 'default')

def run(v, shell=False, path='.', get_output=False, env=None, verbose=True):
    t = time.time()
    if isinstance(v, str):
        cmd = v
        shell = True
    else:
        cmd = ' '.join([(x if len(x.split())<=1 else '"%s"'%x) for x in v])
    if path != '.':
        cur = os.path.abspath(os.curdir)
        if verbose:
            print('chdir %s'%path)
        os.chdir(path)
    try:
        if verbose:
            print(cmd)
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
            print("TOTAL TIME: {seconds} seconds -- to run '{cmd}'".format(seconds=seconds, cmd=cmd))
        return output
    finally:
        if path != '.':
            os.chdir(cur)

def get_service(service):
    """
    Get in json format the kubernetes information about the given service.
    """
    if not os.environ['KUBERNETES_SERVICE_HOST']:
        print('KUBERNETES_SERVICE_HOST environment variable not set')
        return None
    URL = "https://{KUBERNETES_SERVICE_HOST}:{KUBERNETES_SERVICE_PORT}/api/v1/namespaces/{POD_NAMESPACE}/endpoints/{service}"
    URL = URL.format(KUBERNETES_SERVICE_HOST=os.environ['KUBERNETES_SERVICE_HOST'],
                     KUBERNETES_SERVICE_PORT=os.environ['KUBERNETES_SERVICE_PORT'],
                     POD_NAMESPACE=POD_NAMESPACE,
                     service=service)
    token = open('/var/run/secrets/kubernetes.io/serviceaccount/token').read()
    headers={'Authorization':'Bearer {token}'.format(token=token)}
    print("Getting k8s information about '{service}' from '{URL}'".format(service=service, URL=URL))
    x = requests.get(URL, headers=headers, verify='/var/run/secrets/kubernetes.io/serviceaccount/ca.crt').json()
    print("Got {x}".format(x=x))
    return x

def update_etc_hosts():
    print('udpate_etc_hosts')
    try:
        v = get_service('storage-projects')
    except Exception as err:
        # Expected to happen when node is starting up, etc. - we'll retry later soon!
        print("Failed getting storage service info", err)
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
        print("Problem in update_etc_hosts", err)

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
    run_on_minion(["/usr/libexec/kubernetes/kubelet-plugins/volume/exec/smc~smc-storage/smc-storage"] + list(args), **kwds)

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
        print(err)
        return False

def install_zfs():
    try:
        run_on_minion('zpool status')
        print("OK: zfs is installed")
    except:
        print("zfs not installed, so installing it")
        run(['scp', '-r', '/install/gke-zfs', minion_ip()+":"])
        run_on_minion("cd /root/gke-zfs/3.16.0-4-amd64/ && ./install.sh")

def install_bindfs():
    try:
        run_on_minion('which bindfs')
        print("OK: bindfs is installed")
    except:
        print("bindfs not installed, so installing it")
        run_on_minion(["apt-get", "update"])
        run_on_minion(["apt-get", "install", "-y", "bindfs"])

def install_sshfs():
    try:
        run_on_minion('which sshfs')
        print("OK: bindfs is installed")
    except:
        print("bindfs not installed, so installing it")
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
    # Sadly I don't know of any other way to properly restart the minion except to completely reboot it.
    # Just restarting the service leaves everything very broken.
    run_on_minion("reboot")

def create_snapshot(pool, name):
    snapshot = "{timestamp}-{name}".format(timestamp=time_to_timestamp(), name=name)
    run_on_minion(['zfs', 'snapshot', "{pool}@{snapshot}".format(pool=pool, snapshot=snapshot)])

def delete_snapshot(pool, snapshot):
    run_on_minion(['zfs', 'destroy', "{pool}@{snaphot}".format(pool=pool, snapshot=snapshot)])

# Lengths of time in minutes.
SNAPSHOT_INTERVALS = {
    'five'    : 5,
    'hourly'  : 60,
    'daily'   : 60*24,
    'weekly'  : 60*24*7,
    'monthly' : 60*24*7*4
}

# How many of each type of snapshot to retain
SNAPSHOT_COUNTS = {
    'five'    : 12*6,   # 6 hours worth of five-minute snapshots
    'hourly'  : 24*7,   # 1 week of hourly snapshots
    'daily'   : 30,     # 1 month of daily snapshots
    'weekly'  : 8,      # 2 months of weekly snapshots
    'monthly' : 6       # 6 months of monthly snapshots
}

TIMESTAMP_FORMAT = "%Y-%m-%d-%H%M%S"      # e.g., 2016-06-27-141131
TIMESTAMP_N = len("2016-06-27-141131")
def time_to_timestamp(tm=None):
    if tm is None:
        tm = time.time()
    return datetime.datetime.fromtimestamp(tm).strftime(TIMESTAMP_FORMAT)

def timestamp_to_time(timestamp):
    return datetime.datetime.strptime(timestamp, TIMESTAMP_FORMAT).timestamp()

def update_snapshots(pool, snapshots):
    """
    Update the rolling ZFS snapshots on the given pool.
    """
    # determine which snapshots we need to make
    now = time.time()
    for name, interval in SNAPSHOT_INTERVALS.items():
        if SNAPSHOT_COUNTS[name] <= 0: # not making any of these
            continue
        # Is there a snapshot with the given name that is within the given
        # interval of now?  If not, make snapshot.
        v = [s for s in snapshots if s.endswith('-'+name)]
        if len(v) > 0:
            newest = v[-1]
            t = timestamp_to_time(newest[:TIMESTAMP_N])
            age_m = (now - t)/60.0   # age in minutes since snapshot
        else:
            age_m = 999999999999  # 'infinite'
        if age_m > interval:
            # make this snapshot
            create_snapshot(pool, name)
        # Are there too many snapshots of the given type?  If so, delete them:
        if len(v) > SNAPSHOT_COUNTS[name]:
            for s in v[ : len(v) - SNAPSHOT_COUNTS[name]]:
                delete_snapshot(pool, s)

def snapshot_info():
    info = {}
    # Get all pools (some may not be in result of snapshot listing below!)
    for pool in run_on_minion(['zfs', 'list', '-r', '-H', '-o', 'name'], get_output=True).split():
        info[pool] = []
    # Get snapshot info for *all* snapshots on all pools
    for snapshot in sorted(run_on_minion(['zfs', 'list', '-r', '-H', '-t', 'snapshot', '-o', 'name'], get_output=True).split()):
        pool, snap = snapshot.split('@')
        info[pool].append(snap)
    return info

def update_all_snapshots():
    """
    Update the rolling ZFS snapshots on all mounted zpool's.
    """
    for pool, snaps in snapshot_info().items():
        update_snapshots(pool, snaps)

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

def update_all_lock_files():
    smc_storage("update-all-locks")

def start_storage_daemon():
    print("launching storage daemon")
    install_flexvolume_plugin()
    enable_ssh_access_to_minion()
    install_ssh_keys()
    install_zfs()
    install_bindfs()
    install_sshfs()
    if not is_plugin_loaded():
        restart_kubelet()
    last_snapshot_update = last_lock_update = 0
    while True:
        try:
            update_etc_hosts()
        except Exception as err:
            print("ERROR updating etc hosts -- ", err)
        if time.time() - last_snapshot_update >= 60*2.5:
            try:
                update_all_snapshots()
                last_snapshot_update = time.time()
            except Exception as err:
                print("ERROR updating snapshots -- ", err)
        if time.time() - last_lock_update >= 90:
            try:
                update_all_lock_files()
                last_lock_update = time.time()
            except Exception as err:
                print("ERROR updating locks -- ", err)
        time.sleep(10)

if __name__ == "__main__":
    start_storage_daemon()