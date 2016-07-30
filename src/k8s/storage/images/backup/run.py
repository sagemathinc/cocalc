#!/usr/bin/env python3
import datetime, json, os, rethinkdb, shutil, socket, subprocess, sys, time

# TODO: make this get passed in via environ, and do nothing if not there.
GCLOUD_BUCKET = os.environ['GCLOUD_BUCKET']

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
conn = None
def rethinkdb_connection():
    global conn
    if conn is not None:
        return conn
    auth_key = open(RETHINKDB_SECRET).read().strip()
    if not auth_key:
        auth_key = None
    conn = rethinkdb.connect(host='rethinkdb-driver', timeout=5, auth_key=auth_key)
    return conn

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
        try:
            bup_save_and_upload(project_id)
        except Exception as err:
            # Report an error in the log.  If anything failed above will try again during next loop.
            # TODO: we need to somehow recover in case repo were corrupted or something else, or this
            # could really go to hell.
            log("bup_save_all - ERROR backing up '{project_id}' -- ".format(project_id=project_id), err)

def bup_save_and_upload(project_id):
    path = path_to_project(project_id)
    if not os.path.exists(path):
        log("bup_save_and_upload('%s') -- WARNING: project isn't hosted here or has never been opened here"%project_id)
        return
    log("backing up '%s'"%project_id)
    # create the backup
    timestamp = bup_save(path)
    # convert time of backup to rethinkdb format
    last_backup = timestamp_to_rethinkdb(timestamp)
    # record in database that this backup is done.
    conn = rethinkdb_connection()
    rethinkdb.db('smc').table('projects').get(project_id).update({'last_backup':last_backup}).run(conn)
    # upload backup to google cloud storage
    bup_upload_to_gcloud(project_id, timestamp)

def bup_upload_to_gcloud(project_id, timestamp):
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
    target = os.path.join('gs://{bucket}/projects/{project_id}.zfs/bup'.format(
            bucket=GCLOUD_BUCKET, project_id=project_id))

    # Upload new pack file objects -- don't use -c, since it would be very (!!) slow on these
    # huge files, and isn't needed, since time stamps are enough.  We also don't save the
    # midx and bloom files, since they are automatically recreated by bup from the pack files.
    log('gsutil upload: rsync new pack files')
    run(['gsutil', '-m', 'rsync', '-x', '.*\.bloom|.*\.midx', '-r',
         '{bup}/objects/'.format(bup=bup),
         '{target}/objects/'.format(target=target)])
    # Upload refs/logs; using -c below is critical, since filenames don't change
    # but content does (and timestamps aren't used by gsutil!).
    log('gsutil upload refs/logs')
    for path in ['refs', 'logs']:
        run(['gsutil', '-m', 'rsync', '-c', '-r',
             '{bup}/{path}/'.format(bup=bup, path=path),
             '{target}/{path}/'.format(target=target, path=path)])
    # NOTE: we don't save HEAD, since it is always "ref: refs/heads/master"

    log("record in database that we successfully backed project up to gcloud")
    rethinkdb.db('smc').table('projects').get(project_id).update(
        {'last_backup_to_gcloud':timestamp_to_rethinkdb(timestamp)}).run(rethinkdb_connection())

def archive(project_id):
    """
    Do a final bup save of this project, upload to google cloud storage,
    delete all files from local disk, and mark project as no longer storage_ready.
    """
    def dbg(*args):
        log('archive("%s")'%project_id, *args)
    # First check if volume is recently mounted, in which case absolutely
    # refuse to archive.
    dbg("making lock")
    path = path_to_project(project_id)
    try:
        lock = os.path.join(path, 'lock')  # name also used in driver/smc-storage
        if os.path.exists(lock) and time.time() - os.path.getmtime(lock) < 300:
            raise RuntimeError("project '%s' is probably locked and currently mounted; can't archive."%project_id)
        # Write lock file to guarantee that this project won't suddenly get mounted right as we are archiving it.
        open(lock, 'w').write(socket.gethostname())
        bup_save_and_upload(project_id)
        log("deleting local files")
        try:
            shutil.rmtree(path)
        except Exception as err:
            # this should never happen and would just waste disk space.
            dbg("error deleting files -- ", err)
        conn = rethinkdb_connection()
        query = rethinkdb.db('smc').table('projects').get(project_id)
        log("set storage_ready to false so next open will use GCS")
        query.update({'storage_ready':False}).run(conn)
        log("clear the storage server from the database, so any server can be used next time.")
        query.replace(rethinkdb.row.without('storage_server')).run(conn)
    finally:
        try:
            if os.path.exists(lock):
                os.unlink(lock)
        except:
            pass

def setup():
    gcloud = "/root/.config/"
    if not os.path.exists(gcloud):
        os.makedirs(gcloud)
    run('tar xvf /secrets/gcloud/gcloud.tar', path="/root/.config/")

def main():
    setup()
    event_loop()

if __name__ == "__main__":
    main()