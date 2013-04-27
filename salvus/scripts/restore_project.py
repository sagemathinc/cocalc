#!/usr/bin/env python

import argparse, json, os, shutil, sys

parser = argparse.ArgumentParser(description="Restore project from a backup.")
parser.add_argument("--project_id", dest="project_id", type=str, help="project_id", required=True)
parser.add_argument("--username", dest='username',  type=str, help="username", required=True)
parser.add_argument("--host", dest='host', type=str, help='host', required=True)
parser.add_argument('--path', dest='path', type=str, help='path', default='.')
parser.add_argument('--port', dest='port', type=str, help='port', default='22')
args = parser.parse_args()


SALVUS_ROOT = os.environ['SALVUS_ROOT']
BACKUP = os.path.join(SALVUS_ROOT, 'data', 'backup')

project_id = args.project_id
#print "project_id =", project_id

username = args.username
#print "username =", username
host = args.host
#print "host =", host
path = args.path
#print "path =", path
port = args.port
#print "port =", port

def bup(cmd):
    s = "bup "+cmd
    print s
    exit_code = os.system(s)
    print "exit_code =", exit_code
    if exit_code:
        raise RuntimeError

restore_path = os.path.join(BACKUP, 'restore', project_id)

try:
    os.makedirs(restore_path)
    bup("restore --outdir '%s' %s/latest/."%(restore_path, project_id))
    cmd = "rsync -axH '%s/' %s@%s:%s"%(restore_path, username, host, path)
    print cmd
    os.system(cmd)

finally:
    print "Deleting '%s'..."%restore_path
    shutil.rmtree(restore_path, ignore_errors=True)











