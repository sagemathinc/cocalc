#!/usr/bin/env python
###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2016, Sagemath Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################



import os, sys, hashlib, uuid, time
def cmd(s):
    t = time.time()
    print s
    if os.system(s):
        raise RuntimeError('failed to run %s'%s)
    print "command took %s seconds"%(time.time()-t)

project_id = sys.argv[1]

if uuid.UUID(project_id).get_version() != 4:
    raise RuntimeError("invalid project uuid='%s'"%project_id)

uid = int(hashlib.sha512(project_id).hexdigest()[:8], 16)
if uid<=1000:
    uid += 1000

snap_path  = "/projects/%s/.zfs/snapshot"%project_id
rsync_path = "/tmp/rsync/%s/"%project_id
bup_path   ='/tmp/bup/%s/'%project_id

cmd("mkdir -p /tmp/rsync; chmod og-rwx /tmp/rsync")
cmd("mkdir -p /tmp/bup; chmod og-rwx /tmp/bup")

if not os.path.exists(snap_path):
    raise RuntimeError("project not mounted")

is_update = os.path.exists(bup_path)

os.environ['BUP_DIR']=bup_path

if not is_update:
    cmd("bup init")

snapshots = os.listdir(snap_path)
snapshots.sort()

def sdate(s):
    return time.mktime(time.strptime(s, "%Y-%m-%dT%H:%M:%S"))

if is_update:
    known_snapshots = os.popen("bup ls master").read().split()[:-1]
    known_snap_dates = set([time.mktime(time.strptime(snapshot, "%Y-%m-%d-%H%M%S")) for snapshot in known_snapshots])
    snapshots = [s for s in snapshots if sdate(s) not in known_snap_dates]

v = []
for i, snapshot in enumerate(snapshots):
    date = sdate(snapshot)
    print "***** Starting %s/%s ****"%(i+1, len(snapshots))
    t = time.time()
    cmd("rsync -axH  --delete --exclude *.sage-backup --exclude .sage/cache --exclude .trash --exclude .fontconfig --exclude .sage/temp --exclude .zfs --exclude .npm --exclude .sagemathcloud --exclude .node-gyp --exclude .cache --exclude .forever --exclude .ssh %s/%s/ %s/"%(snap_path, snapshot, rsync_path))
    #cmd("chown -R %s:%s %s"%(uid, uid, rsync_path))
    cmd("bup index %s"%rsync_path)
    cmd("bup save %s --strip -n master -d %s"%(rsync_path, date))

    v.append(time.time()-t)
    if len(v) > 1:
        avg = float(sum(v[1:])/(len(v)-1))
        eta = (len(snapshots) - len(v))*avg
        print "*****\nIt took %s seconds.\nAverage time so far: %s seconds\nETA:%ss=%sm=%sh\n*****"%(v[-1], avg, eta, eta/60, eta/3600)

if not is_update:
    # This repacks everything into one (?) pack.
    cmd("cd %s; git repack -lad"%bup_path)

cmd("rm -rf '%s'"%rsync_path)





