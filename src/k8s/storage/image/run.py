#!/usr/bin/env python3
import datetime, json, os, shutil, subprocess, time

# NOTE/TODO: there is some duplication of code between here and storage-daemon/run.py.

def log(*args, **kwds):
    print(*args, **kwds)

DATA = '/data' # mount point of data volume
LOG = os.path.join(DATA, 'log')
if not os.path.exists(LOG):
    os.makedirs(LOG)

TIMESTAMP_FORMAT = "%Y-%m-%d-%H%M%S"      # e.g., 2016-06-27-141131

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

def sshd_config():
    log('sshd_config')
    open("/etc/ssh/sshd_config",'a').write("""
# Enable very fast (but less secure) cipher; all we need since already on a LAN.
Ciphers arcfour128

# Security: make it so ssh to storage machine can *ONLY* be used
# to sshfs mount /data and nothing else.  Not critical, but might as well reduce attack surfaces.
Match User root
    ChrootDirectory /data
    ForceCommand internal-sftp
""")

def install_secret_ssh_keys():
    log('install_secret_ssh_keys')
    # Copy over ssh keys from the k8s secret
    path = '/root/.ssh'
    if not os.path.exists(path):
        os.makedirs(path)
    src = os.path.join('/ssh', 'id-rsa.pub')
    target = os.path.join(path, 'authorized_keys')
    shutil.copyfile(src, target)
    os.chmod(target, 0o600)
    os.chmod(path, 0o600)

def run_sshd():
    log('run_sshd')
    os.system("service ssh start")

def event_loop():
    log('event_loop')
    while True:
        # nothing implemented yet
        time.sleep(5)

def bup_save(path):
    """
    Save to the bup archive for the given path.

    An example is path='foo.zfs' if there is a directory /data/foo.zfs

    Will write an entry to /data/log/bups.log each time we do this, which is a single line in JSON format
    with keys timestamp, path, action, time and optionally error. E.g.,

    {"path":"testzfs.zfs","time":5.1827569007873535,"timestamp":"2016-07-04-173809","action":"save"}

    means we saved testzfs.zfs at 2016-07-04-173809 and it took about 5 seconds.
    """
    full_path = os.path.join(DATA, path)
    if not os.path.exists(full_path):
        raise ValueError("no path '%s'"%full_path)
    # The /0 is so that we could have a new /1, /2 bup dir, etc., when bup/0 starts to have too many commits,
    # or we want to change the format somehow, etc.
    bup_dir = os.path.join(full_path, 'bup/0')
    if not os.path.exists(bup_dir):
        os.makedirs(bup_dir)
    env = {'BUP_DIR': bup_dir}
    run(['bup', 'init'], env=env)
    tm = time.time()
    timestamp = datetime.datetime.fromtimestamp(tm).strftime(TIMESTAMP_FORMAT)
    log = {'timestamp':timestamp, 'path':path, 'action':'save'}
    try:
        run("tar cSf - '{full_path}' --exclude {bup_dir} | bup split -n '{timestamp}'".format
            (full_path=full_path, bup_dir=bup_dir, timestamp=timestamp), env=env)
    except Exception as err:
        log['error'] = repr(err)
    log['time'] = time.time() - tm
    open(os.path.join(LOG, 'bups.log'), 'a').write(json.dumps(log, separators=(',', ':'))+'\n')

def bup_save_all(interval_h):
    """
    Update the bup archive for each image that has changed within the
    last interval_h hours.
    """
    raise NotImplemented

def rotate_all_logs(maxlines=10000, minlines=1000):
    """
    For each logfile /data/log/foo.log with more than maxlines lines,
    move all but the last minlines lines to /data/log/foo.log.1.gz,
    rotating any other foo.log.n.gz log files.
    """
    raise NotImplemented

def main():
    sshd_config()
    install_secret_ssh_keys()
    run_sshd()
    event_loop()

if __name__ == "__main__":
    main()