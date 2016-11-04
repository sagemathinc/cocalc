#!/usr/bin/env python3

# One off script to migrate a (or all) projects to new format.
# REQUIREMENTS:
#   sudo apt-get install bsdtar
#   sudo pip3 install rethinkdb

import datetime, os, rethinkdb, shutil, subprocess, sys, time

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


RETHINKDB_SECRET = '/home/salvus/smc/src/data/secrets/rethinkdb'
def get_quota(project_id):
    auth_key = open(RETHINKDB_SECRET).read().strip()
    conn = rethinkdb.connect(host='db0', timeout=10, auth_key=auth_key)
    disk_quota = 0
    for x in rethinkdb.db('smc').table('projects').get(project_id).pluck(['users', 'settings']).run(conn).items():
        if x[0] == 'users':
            for y in x[1].items():
                if 'upgrades' in y[1]:
                    if 'disk_quota' in y[1]['upgrades']:
                        disk_quota += y[1]['upgrades']['disk_quota']
        if x[0] == 'settings':
            if 'disk_quota' in x[1]:
                disk_quota += int(x[1]['disk_quota'])
            else:
                disk_quota += 3000  # default
    if disk_quota == 0:
        disk_quota = 3000

    disk_quota = int(disk_quota)
    if disk_quota < 3000:
        disk_quota = 3000
    if disk_quota > 100000:
        disk_quota = 100000
    log('total quota = ', disk_quota)
    return "%sm"%disk_quota

def migrate_project(project_id, quota=None):
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
    mnt = "/mnt/%s"%project_id
    pool_file = os.path.join(path, 'pool')
    try:
        if not os.path.exists(pool_file):
            log("create zpool image file of appropriate size, with compression and dedup")
            image = os.path.join(path, "00.img")
            if quota is None:
                try:
                    quota = get_quota(project_id)
                except Exception as err:
                    if 'pluck on a non-object non-sequence' in str(err):
                        quota = '4G'
                    else:
                        raise
            run('truncate -s %s %s'%(quota, image))
            open(pool_file,'w').write(pool)
            run("sudo zpool create %s -f %s"%(pool, image))
            run("sudo zfs set compression=lz4 %s"%pool)
            run("sudo zfs set dedup=on %s"%pool)
        else:
            log("import zpool")
            run("sudo zpool import -d %s -a"%path)

        log("set mountpoint")
        run("sudo zfs set mountpoint=%s %s"%(mnt, pool))

        log("rsync files over")
        cmd = "sudo rsync -axvH --delete --exclude .trash --exclude .snapshots --exclude .snapshot --exclude .zfs --exclude .ipython-daemon.json --exclude *.sage-history --exclude .forever --exclude .sagemathcloud.log --exclude .snapshots --exclude .sage --exclude ..sagemathcloud.log.sage-backup %s/ %s/"%(src, mnt)
        if update:
            out = run(cmd, get_output=True)
            log(out)
            n = len(out.splitlines())
            log("number of lines",n)
            num_changed = n-4
        else:
            run(cmd)

    finally:
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
    # NOTE: bsdtar is dramatically faster at sparse files than GNU tar; see
    #       http://unix.stackexchange.com/questions/120091/how-can-i-speed-up-operations-on-sparse-files-with-tar-gzip-rsync
    run("bsdtar cSf - --exclude {bup_dir} '{path}' | bup split -n '{timestamp}'".format
        (path=path, bup_dir=bup_dir, timestamp=timestamp), env=env)

def migrate_all_projects():
    log("getting list of all projects here (takes about 20s)...")
    projects = os.listdir('/projects')
    projects.sort()
    log("got %s projects"%len(projects))
    log("getting list of finished project id's")
    done = set([x[:36] for x in os.listdir('projects')])
    log("got %s DONE projects"%len(done))

    def status():
        log("*"*70)
        log("%s of %s"%(len(done), len(projects)))
        log("*"*70)

    log("now migrating all non-migrated projects")
    for project_id in projects:
        if len(project_id) != 36: continue
        if project_id not in done:
            status()
            try:
                migrate_project(project_id)
                done.add(project_id)
            except KeyboardInterrupt:
                log("hit control-c -- deleting current in progress")
                shutil.rmtree('projects/%s.zfs'%project_id)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        project_id = sys.argv[1]
        quota = sys.argv[2] if len(sys.argv) >= 3 else None        
        migrate_project(project_id, quota)
    else:
        # migrates every project for which a local dir hasn't been created yet.
        migrate_all_projects()
