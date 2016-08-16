#!/usr/bin/env python3

# One-off script to copy a project to google cloud storage.
# This duplicates code, e.g., -- it's *ONE OFF CODE*!

PROD = True

if PROD:
    RETHINKDB_SECRET = '/home/salvus/secrets/rethinkdb/rethinkdb'
    GCLOUD_BUCKET = 'sage-math-inc-k8s-bup-prod'; auth_key = open(RETHINKDB_SECRET).read().strip(); DB_HOST='db0'
else:
    GCLOUD_BUCKET = 'sage-math-inc-k8s-bup-test'; auth_key = None; DB_HOST = 'localhost'

import datetime, os, rethinkdb, shutil, subprocess, sys, time

TIMESTAMP_FORMAT = "%Y-%m-%d-%H%M%S"      # e.g., 2016-06-27-141131

goal = 0
def set_goal(g):
    global goal
    goal = g

progress = 0
def make_progress():
    global progress
    progress += 1

def log(*args):
    print("(%s/%s) %s:"%(progress, goal, datetime.datetime.fromtimestamp(time.time()).strftime(TIMESTAMP_FORMAT)), *args)

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

def path_to_project(project_id):
    for i in range(6):
        path = '/mnt/projects/%s/%s.zfs'%(i, project_id)
        if os.path.exists(path):
            return path
    raise RuntimeError("no data for project_id")

def timestamp_to_rethinkdb(timestamp):
    i = timestamp.rfind('-')
    return rethinkdb.iso8601(timestamp[:i].replace('-','') + 'T' + timestamp[i+1:].replace(':','') + 'Z')

def upload_project(project_id):
    """
    Upload the bup backup of this project to the gcloud bucket.
    """
    path = path_to_project(project_id)

    run("sudo chmod a+r -R %s"%path)

    log('path: ', project_id)
    bup = os.path.join(path, 'bup')
    if not os.path.exists(bup):
        raise RuntimeError("no bup directory to upload -- done")
    target = os.path.join('gs://{bucket}/projects/{project_id}.zfs/bup'.format(
            bucket=GCLOUD_BUCKET, project_id=project_id))

    log('upload: rsync new pack files')
    run(['gsutil', '-m', 'rsync', '-x', '.*\.bloom|.*\.midx', '-r',
         '{bup}/objects/'.format(bup=bup),
         '{target}/objects/'.format(target=target)])
    log('gsutil upload refs/logs')
    for bup_path in ['refs', 'logs']:
        run(['gsutil', '-m', 'rsync', '-c', '-r',
             '{bup}/{path}/'.format(bup=bup, path=bup_path),
             '{target}/{path}/'.format(target=target, path=bup_path)])

    disk_usage = {
        'bup': int(run("du -smc {bup}".format(bup=bup), get_output=True).split()[-2]),
        'img': int(run("du -smc {path}/*.img".format(path=path), get_output=True).split()[-2])
    }
    log("disk_usage='%s'"%disk_usage)

    conn = rethinkdb.connect(host=DB_HOST, timeout=10, auth_key=auth_key)
    timestamp = datetime.datetime.fromtimestamp(time.time()).strftime(TIMESTAMP_FORMAT)
    rethinkdb.db('smc').table('projects').get(project_id).update(
        {'last_backup_to_gcloud':timestamp_to_rethinkdb(timestamp), 'disk_usage':disk_usage}).run(conn)

def upload_all_projects(limit, shard):
    global progress
    conn = rethinkdb.connect(host=DB_HOST, timeout=10, auth_key=auth_key)
    timestamp = datetime.datetime.fromtimestamp(time.time()).strftime(TIMESTAMP_FORMAT)
    log("doing query")
    query = rethinkdb.db('smc').table('projects').filter(~rethinkdb.row.has_fields('last_backup_to_gcloud')).pluck(['project_id']).limit(limit)
    v = []
    for x in query.run(conn):
        project_id = x['project_id']
        if not project_id.endswith(shard):
            continue
        v.append(project_id)
    set_goal(len(v))
    for project_id in v:
        log(project_id)
        try:
            upload_project(project_id)
        except Exception as err:
            log("error considering %s "%project_id, err)

        make_progress()
        log('done')


if __name__ == "__main__":
    if len(sys.argv) > 1 and len(sys.argv[1]) == 36:
        project_id = sys.argv[1]
        upload_project(project_id)
    else:
        # upload all projects not already uploaded
        if len(sys.argv) == 1:
            conn = rethinkdb.connect(host=DB_HOST, timeout=10, auth_key=auth_key)
            done = rethinkdb.db('smc').table('projects').filter(rethinkdb.row.has_fields('last_backup_to_gcloud')).count().run(conn)
            print("done so far: ", done)
        else:
            if len(sys.argv) == 3:
                shard = sys.argv[2]
            else:
                shard = ''
            upload_all_projects(int(sys.argv[1]), shard)


