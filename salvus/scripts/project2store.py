#!/usr/bin/env python

import argparse, json, os, sys

def cmd(s, exit_on_error=True):
    print s
    if os.system(s):
        if exit_on_error:
            print "Error running '%s' -- terminating"%s
            sys.exit(1)

def project2store(src, store, project_id, size, verbose):
    if not os.path.exists(src):
        raise ValueError("src=(%s) does not exist"%src)
    if not project_id:
        project_id = json.loads(open(os.path.join(src,'.sagemathcloud','info.json')).read())['project_id']

    target = os.path.join(store, project_id)
    if os.path.exists(target):
        # mount
        cmd("zpool import project-%s -d %s"%(project_id, target), exit_on_error=False)
    else:
        # create
        os.makedirs(target)
        os.chdir(target)
        cmd("truncate -s %s 0.img"%size)
        cmd("zpool create -m /mnt/projects/%s project-%s %s/0.img"%(project_id, project_id, target))
        cmd("zfs set compression=gzip project-%s"%project_id)
        cmd("zfs set dedup=on project-%s"%project_id)

    # sync data over
    cmd("time rsync -axH%s --delete --exclude .forever --exclude .bup %s/ /mnt/projects/%s/"%('v' if verbose else '', src, project_id), exit_on_error=False)
    cmd("time chown 1001:1001 -R /mnt/projects/%s"%project_id)
    cmd("df -h /mnt/projects/%s; zfs get compressratio project-%s; zpool get dedupratio project-%s"%(project_id, project_id, project_id))
    # cmd("zpool export project-%s"%project_id)

if __name__ == "__main__":

    parser = argparse.ArgumentParser(description="Migrate or update project image file.")
    parser.add_argument("src", help="the current project home directory", type=str)
    parser.add_argument("--store", help="the directory where project image directories get stored", type=str)
    parser.add_argument("--project_id", dest="project_id", help="id of the project (if not given, looks for info.json)", type=str, default="")
    parser.add_argument("--size", help="initial size of zfs image (default: 4G)", type=str, default="4G")
    parser.add_argument("--verbose", help="be very verbose (default: False)", default=False, action="store_const", const=True)

    args = parser.parse_args()

    project2store(src=args.src, store=args.store, project_id=args.project_id, size=args.size, verbose=args.verbose)




