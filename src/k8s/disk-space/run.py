#!/usr/bin/env python3

import datetime, math, os, shutil, sys, subprocess, time

# Enlarge disk if percent usage exceeds this:
MAX_ALLOWED_PERCENT = 95

# Enlarge disk by this percent
ENLARGE_BY_PERCENT  = 10

# Enlarge root partition by this amount if it runs nearly out.  We enlarge by more,
# since a reboot is required, which is potentially very disruptive.
ROOT_ENLARGE_BY_PERCENT = 50

# How long to sleep before each check of usage
SLEEP_M = 5

HOSTS = '/node/etc/hosts'

def log(*args, **kwds):
    print(datetime.datetime.fromtimestamp(time.time()).strftime("%Y-%m-%d-%H%M%S"), *args, **kwds)
    sys.stdout.flush()

def run(cmd):
    log(cmd)
    child = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=True, executable='/bin/bash')
    output = child.stdout.read().decode()
    log("output", output)
    if child.wait():
        log("error runing ", cmd)
        raise RuntimeError(output + child.stderr.read().decode())
    log("done runing ", cmd)
    return output

MINION_IP = 'unknown'
def enable_ssh_access_to_minion():
    global MINION_IP
    # create our own local ssh key
    if os.path.exists('/root/.ssh'):
        shutil.rmtree('/root/.ssh')
    run("ssh-keygen -b 2048 -N '' -f /root/.ssh/id_rsa")
    # make root user of minion node allow login using this key.
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
    return run("ssh " + minion_ip() + " '%s'"%v, *args, **kwds)

def df():
    headers = None   # Filesystem     1K-blocks  Used Available Use% Mounted on
    data = []
    def process(x):
        if len(x) == 0 or not x.startswith('/'):
            return
        info = dict(zip(headers, x.split()))
        if info['Filesystem'] != '/dev/sda1':  # we always include /dev/sda1
            last = info['Filesystem'][-1]
            if last >= '0' and last <= '9':
                # device name ends in number, so no full disk ext4, so auto-expand not supported
                return
        data.append(info)

    for path in ['/', '/var/lib/kubelet/plugins/kubernetes.io/gce-pd/mounts/*']:
        try:
            for x in run_on_minion("df --type=ext4 {path}".format(path=path)).splitlines():
                if headers is None:
                    headers = x.split()[:-1]
                else:
                    process(x)
        except Exception as err:
            if 'such file or directory' in str(err):
                # df errors when there are no filesystems mounted at all -- that's fine.
                continue
            else:
                raise
    return data

def check_disk_space(data):
    for info in data:
        percent_used = int(info['Use%'].strip('%'))
        if percent_used > MAX_ALLOWED_PERCENT:
            disk   = os.path.split(info['Mounted'])[-1]
            if not disk: # root filesystem
                disk = run_on_minion('hostname').strip()
            device = info['Filesystem']
            enlarge_disk(disk, device)

def enlarge_disk(disk, device):
    log("enlarge_disk(disk='{disk}', device='{device}')".format(disk=disk, device=device))
    # > gcloud compute disks list k8s-dev-rethinkdb-test-server0
    # NAME                           ZONE          SIZE_GB TYPE        STATUS
    # k8s-dev-rethinkdb-test-server0 us-central1-c 10      pd-standard READY
    log('get current disk size')
    v = run_on_minion("gcloud compute disks list {disk}".format(disk=disk)).splitlines()[1].split()
    size_gb = int(v[2])
    zone    = v[1]
    log("current_size", size_gb)
    if device == '/dev/sda1':
        new_size_gb =  math.ceil(size_gb * (1 + ROOT_ENLARGE_BY_PERCENT/100.0))
    else:
        new_size_gb = math.ceil(size_gb * (1 + ENLARGE_BY_PERCENT/100.0))
    if new_size_gb <= size_gb:  # impossible... but be defensive
        new_size_gb = size_gb + 1
    log("resize persistent disk to", new_size_gb)
    run_on_minion("gcloud --quiet compute disks resize {disk} --zone {zone} --size {new_size_gb}GB".format(
            disk=disk, new_size_gb=new_size_gb, zone=zone))
    # resize is simple since our PD volumes use the full disk as ext4 (no partitions to worry about)
    log("resize filesystem")
    if device == '/dev/sda1':
        # k8s mininion node -- here the only solution is to reboot, unfortunately, (maybe)
        # since the / partition is on /dev/sda1 instead of /dev/sda.  In any case, this is what
        # we have to do. It's better than running out of disk space.
        run_on_minion("reboot")
    else:
        run_on_minion("resize2fs {device}".format(device=device))
        # VERY scary thought -- if resize2fs fails, then df will report disk as too full still,
        # causing resize to happen again, etc., thus quickly WASTING terabytes of space!

if __name__ == "__main__":
    run_on_minion("gcloud --quiet components update")
    while True:
        check_disk_space(df())
        log("Sleeping...")
        time.sleep(SLEEP_M*60)
