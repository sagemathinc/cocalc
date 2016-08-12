#!/usr/bin/env python3

import datetime, os, shutil, subprocess, sys, time

TIMESTAMP_FORMAT = "%Y-%m-%d-%H%M%S"      # e.g., 2016-06-27-141131

def log(*args, **kwds):
    print(*args, **kwds)
    sys.stdout.flush()

def run(v, shell=False, path='.', get_output=False, env=None, verbose=1):
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
        if verbose >= 1:
            log("TOTAL TIME: {seconds} seconds -- to run '{cmd}'".format(seconds=seconds, cmd=cmd))
        return output
    finally:
        if path != '.':
            os.chdir(cur)

def migrate_project(project_id, size):
    src = '/projects/%s'%project_id
    if not os.path.exists(src):
        # TODO: or maybe we make it empty?
        raise RuntimeError("no source path "+src)

    path = os.path.join(os.path.abspath('.'), 'projects', project_id+'.zfs')
    if not os.path.exists(path):
        update = False
        os.makedirs(path)
    else:
        update = True

    pool = 'pool-' + project_id
    pool_file = os.path.join(path, 'pool')
    if not os.path.exists(pool_file):
        log("create zpool image file of appropriate size, with compression and dedup")
        image = os.path.join(path, "00.img")
        run('truncate -s %s %s'%(size, image))
        open(pool_file,'w').write(pool)
        run("sudo zpool create %s -f %s"%(pool, image))
        run("sudo zfs set compression=lz4 %s"%pool)
        run("sudo zfs set dedup=on %s"%pool)
    else:
        log("import zpool")
        run("sudo zpool import -d %s -a"%path)

    log("set mountpoint")
    mnt = "/mnt/%s"%project_id
    run("sudo zfs set mountpoint=%s %s"%(mnt, pool))

    log("rsync files over")
    cmd = "sudo rsync -axvH --delete --exclude .ipython-daemon.json --exclude *.sage-history --exclude .forever --exclude .sagemathcloud.log --exclude .snapshots --exclude .sage --exclude ..sagemathcloud.log.sage-backup %s/ %s/"%(src, mnt)
    if update:
        out = run(cmd, get_output=True)
        log(out)
        n = len(out.splitlines())
        log("number of lines",n)
        num_changed = n-4
    else:
        run(cmd)

    log("export zpool")
    run("sudo zpool export %s"%pool)
    run("sudo rmdir %s"%mnt)
    if update and num_changed == 0:
        # no need to update bup
        return

    bup_dir = os.path.join(path, 'bup')
    env = {'BUP_DIR': bup_dir}
    if not os.path.exists(bup_dir):
        log("make bup archive")
        os.makedirs(bup_dir)
        run(['bup', 'init'], env=env)
    else:
        log("update bup archive")
    log("write bup update (this takes a long time)")
    timestamp = datetime.datetime.fromtimestamp(time.time()).strftime(TIMESTAMP_FORMAT)
    run("tar cSf - '{path}' --exclude {bup_dir} | bup split -n '{timestamp}'".format
        (path=path, bup_dir=bup_dir, timestamp=timestamp), env=env)


if __name__ == "__main__":
    project_id = sys.argv[1]
    quota = sys.argv[2] if len(sys.argv) >= 3 else '3G'
    migrate_project(project_id, quota)

