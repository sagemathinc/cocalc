#!/usr/bin/env python3

# One-off script to copy a project to google cloud storage.
# This duplicates code, e.g., -- it's *ONE OFF CODE*!

#GCLOUD_BUCKET = 'sage-math-inc-k8s-bup-prod'
GCLOUD_BUCKET = 'sage-math-inc-k8s-bup-test'

RETHINKDB_SECRET = '/home/salvus/secrets/rethinkdb/rethinkdb'

DB_HOST = 'localhost'

import datetime, os, rethinkdb, shutil, subprocess, sys, time

TIMESTAMP_FORMAT = "%Y-%m-%d-%H%M%S"      # e.g., 2016-06-27-141131

def log(*args):
    print(*args)

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
    for path in ['refs', 'logs']:
        run(['gsutil', '-m', 'rsync', '-c', '-r',
             '{bup}/{path}/'.format(bup=bup, path=path),
             '{target}/{path}/'.format(target=target, path=path)])

    #auth_key = open(RETHINKDB_SECRET).read().strip()
    conn = rethinkdb.connect(host=DB_HOST, timeout=10)#, auth_key=auth_key)
    timestamp = datetime.datetime.fromtimestamp(time.time()).strftime(TIMESTAMP_FORMAT)
    rethinkdb.db('smc').table('projects').get(project_id).update(
        {'last_backup_to_gcloud':timestamp_to_rethinkdb(timestamp)}).run(conn)


if __name__ == "__main__":
    if len(sys.argv) > 1:
        project_id = sys.argv[1]
        upload_project(project_id)
    else:
        # upload all projects not already uploaded
        upload_all_projects()
