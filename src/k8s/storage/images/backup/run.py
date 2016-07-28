#!/usr/bin/env python3
import datetime, json, os, rethinkdb, shutil, sys, subprocess, time

# TODO: make this get passed in via environ, and do nothing if not there.
GCLOUD_BUCKET = "smc-k8s-storage-backup"

# Every project with changes (=a snapshot was made of the zpool)
# has a new bup backup of itself made every this many hours:
BUP_SAVE_INTERVAL_H = 6

# NOTE/TODO: there is some duplication of code between here and storage-daemon/run.py.

def log(*args, **kwds):
    print(*args, **kwds)
    sys.stdout.flush()

DATA = '/data' # mount point of data volume

TIMESTAMP_FORMAT = "%Y-%m-%d-%H%M%S"      # e.g., 2016-06-27-141131

def time_to_timestamp(tm=None):
    if tm is None:
        tm = time.time()
    return datetime.datetime.fromtimestamp(tm).strftime(TIMESTAMP_FORMAT)

def timestamp_to_rethinkdb(timestamp):
    i = timestamp.rfind('-')
    return rethinkdb.iso8601(timestamp[:i].replace('-','') + 'T' + timestamp[i+1:].replace(':','') + 'Z')

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

def event_loop():
    log('event_loop')
    last_bup_save_all = 0
    while True:
        # Every 5 minutes, call bup_save_all to make bup backups of all projects that have
        # changes that haven't been backed up for at least BUP_SAVE_INTERVAL_H hours.
        if time.time() - last_bup_save_all >= 60*5:
            bup_save_all(BUP_SAVE_INTERVAL_H)
            last_bup_save_all = time.time()

        log('waiting 30s...')
        time.sleep(30)

def bup_save(path):
    """
    Save to the bup archive for the given path.

    An example is path='foo.zfs' if there is a directory /data/foo.zfs
    """
    log("bup_save('%s')"%path)
    full_path = os.path.join(DATA, path)
    if not os.path.exists(full_path):
        raise ValueError("no path '%s'"%full_path)
    bup_dir = os.path.join(full_path, 'bup')
    if not os.path.exists(bup_dir):
        os.makedirs(bup_dir)
    env = {'BUP_DIR': bup_dir}
    run(['bup', 'init'], env=env)
    tm = time.time()
    timestamp = datetime.datetime.fromtimestamp(tm).strftime(TIMESTAMP_FORMAT)
    run("tar cSf - '{full_path}' --exclude {bup_dir} | bup split -n '{timestamp}'".format
        (full_path=full_path, bup_dir=bup_dir, timestamp=timestamp), env=env)
    return timestamp

RETHINKDB_SECRET = '/secrets/rethinkdb/rethinkdb'
def rethinkdb_connection():
    auth_key = open(RETHINKDB_SECRET).read().strip()
    if not auth_key:
        auth_key = None
    return rethinkdb.connect(host='rethinkdb-driver', timeout=5, auth_key=auth_key)

def path_to_project(project_id):
    return os.path.join(DATA, 'projects', project_id) + '.zfs'

def bup_save_all(age_h):
    """
    Make a bup snapshot of every project that has had a snapshot but no backup
    for at least age_h hours.
    """
    log("bup_save_all(%s)"%age_h)
    conn = rethinkdb_connection()
    for x in rethinkdb.db('smc').table('projects').between(age_h*60*60,
               rethinkdb.maxval, index='seconds_since_backup').pluck('project_id').run(conn):
        project_id = x['project_id']
        path = path_to_project(project_id)
        if not os.path.exists(path):
            # project isn't hosted here.
            continue
        log("backing up '%s'"%project_id)
        # create the backup
        timestamp = bup_save(path)
        # convert time of backup to rethinkdb format
        last_backup = timestamp_to_rethinkdb(timestamp)
        # record in database that this backup is done.
        rethinkdb.db('smc').table('projects').get(project_id).update({'last_backup':last_backup}).run(conn)

def bup_extract(path):
    """

    """

def bup_upload_to_gcloud(project_id):
    """
    Upload the bup backup of this project to the gcloud bucket.
    """
    path = path_to_project(project_id)
    if not os.path.exists(path):
        raise RuntimeError("project not hosted here")
    bup = os.path.join(path, 'bup')
    if not os.path.exists(bup):
        log("no bup directory to upload -- done")
        return
    target = os.path.join('gs://{bucket}/{projects}/{project_id}/{bup}/')

def setup():
    gcloud = "/root/.config/gcloud/"
    if not os.path.exists(gcloud):
        os.makedirs(gcloud)
    shutil.copy("/secrets/gcloud/access-token", os.path.join(gcloud, "access_token"))

def main():
    setup()
    event_loop()

if __name__ == "__main__":
    main()