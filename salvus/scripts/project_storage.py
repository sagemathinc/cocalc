#!/usr/bin/env python

import argparse, json, os, sys

def cmd(s, exit_on_error=True, verbose=True):  # TODO: verbose ignored right now
    print s
    if os.system(s):
        if exit_on_error:
            print "Error running '%s' -- terminating"%s
            sys.exit(1)

def migrate_project_to_storage(src, storage, size, verbose):
    if not os.path.exists(src):
        raise ValueError("src=(%s) does not exist"%src)
    project_id = json.loads(open(os.path.join(src,'.sagemathcloud','info.json')).read())['project_id']
    target = os.path.join(storage, project_id)
    if os.path.exists(target):
        mount_project(storage=storage, project_id=project_id, verbose=verbose)
    else:
        # create
        os.makedirs(target)
        os.chdir(target)
        cmd("truncate -s %s 0.img"%size, verbose=verbose)
        cmd("zpool create -m /mnt/projects/%s project-%s %s/0.img"%(project_id, project_id, target), verbose=verbose)
        cmd("zfs set compression=gzip project-%s"%project_id, verbose=verbose)
        cmd("zfs set dedup=on project-%s"%project_id, verbose=verbose)

    # sync data over
    cmd("time rsync -axH%s --delete --exclude .forever --exclude .bup %s/ /mnt/projects/%s/"%(
                                  'v' if verbose else '', src, project_id), exit_on_error=False, verbose=verbose)
    cmd("time chown 1001:1001 -R /mnt/projects/%s"%project_id, verbose=verbose)
    cmd("df -h /mnt/projects/%s; zfs get compressratio project-%s; zpool get dedupratio project-%s"%(project_id, project_id, project_id), verbose=verbose)
    unmount_project(project_id=project_id, verbose=verbose)

def mount_project(storage, project_id, verbose):
    target = os.path.join(storage, project_id)
    cmd("zpool import project-%s -d %s"%(project_id, target), exit_on_error=False, verbose=verbose)

def unmount_project(project_id, verbose):
    cmd("zpool export project-%s"%project_id, verbose=verbose)

if __name__ == "__main__":

    parser = argparse.ArgumentParser(description="Project storage")
    parser.add_argument("--storage", help="the directory where project image directories are stored (default: /mnt/storage)",
                        type=str, default="/mnt/glusterfs/projects/")
    parser.add_argument("--verbose", help="be very verbose (default: False)", default=False, action="store_const", const=True)

    subparsers = parser.add_subparsers(help='sub-command help')

    def migrate(args):
        for src in [os.path.abspath(x) for x in args.src]:
            migrate_project_to_storage(src=src, storage=args.storage, size=args.size, verbose=args.verbose)

    parser_migrate = subparsers.add_parser('migrate', help='migrate to or update project in storage pool')
    parser_migrate.add_argument("--size", help="initial size of zfs image (default: 4G)", type=str, default="4G")
    parser_migrate.add_argument("src", help="the current project home directory", type=str, nargs="+")
    parser_migrate.set_defaults(func=migrate)

    def mount(args):
        mount_project(storage=args.storage, project_id=args.project_id, verbose=args.verbose)
    parser_mount = subparsers.add_parser('mount', help='mount a project that is available in the storage pool')
    parser_mount.add_argument("project_id", help="the project id", type=str)
    parser_mount.set_defaults(func=mount)

    def unmount(args):
        unmount_project(project_id=args.project_id, verbose=args.verbose)
    parser_unmount = subparsers.add_parser('unmount', help='unmount a project that is available in the storage pool')
    parser_unmount.add_argument("project_id", help="the project id", type=str)
    parser_unmount.set_defaults(func=unmount)

    args = parser.parse_args()
    args.func(args)




