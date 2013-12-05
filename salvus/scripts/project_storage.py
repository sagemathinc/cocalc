#!/usr/bin/env python

import argparse, json, os, sys

def cmd(s, exit_on_error=True, verbose=True):  # TODO: verbose ignored right now
    print s
    if os.system(s):
        if exit_on_error:
            print "Error running '%s' -- terminating"%s
            sys.exit(1)

def migrate_project_to_storage(src, storage, size, verbose):
    info_json = os.path.join(src,'.sagemathcloud','info.json')
    if not os.path.exists(info_json):
        if verbose:
            print "Skipping since %s does not exist"%info_json
        return
    project_id = json.loads(open(info_json).read())['project_id']
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

def tinc_address():
    return os.popen('ifconfig tun0|grep "inet addr"').read().split()[1].split(':')[1].strip()

def info_json(path, verbose):
    if not os.path.exists('locations.dat'):
        sys.stderr.write('Please run this from a node with db access to create locations.dat\n\t\techo "select location,project_id from projects limit 30000;" | cqlsh_connect 10.1.3.2 |grep "{" > locations.dat')
        sys.exit(1)
    db = {}
    host = tinc_address()
    if verbose:
        print "parsing database..."
    for x in open('locations.dat').readlines():
        if x.strip():
            location, project_id = x.split('|')
            location = json.loads(location.strip())
            project_id = project_id.strip()
            if location['host'] == host:
                db[location['username']] = {'location':location, 'project_id':project_id, 'base_url':''}
    v = [os.path.abspath(x) for x in path]
    for i, path in enumerate(v):
        if verbose:
            print "** %s of %s"%(i+1, len(v))
        SMC = os.path.join(path, '.sagemathcloud')
        if not os.path.exists(SMC):
            if verbose:
                print "Skipping '%s' since no .sagemathcloud directory"%path
            continue
        f = os.path.join(path, '.sagemathcloud', 'info.json')
        username = os.path.split(path)[-1]
        if not os.path.exists(f):
            if username not in db:
                if verbose:
                    print "Skipping '%s' since not in database!"%username
            else:
                s = json.dumps(db[username], separators=(',', ':'))
                if verbose:
                    print "writing '%s': '%s'"%(f,s)
                open(f,'w').write(s)


if __name__ == "__main__":

    parser = argparse.ArgumentParser(description="Project storage")
    parser.add_argument("--storage", help="the directory where project image directories are stored (default: /mnt/storage)",
                        type=str, default="/mnt/glusterfs/projects/")
    parser.add_argument("--verbose", help="be very verbose (default: False)", default=False, action="store_const", const=True)

    subparsers = parser.add_subparsers(help='sub-command help')

    def migrate(args):
        v = [os.path.abspath(x) for x in args.src]
        for i, src in enumerate(v):
            if args.verbose:
                print "\n** %s of %s"%(i+1, len(v))
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

    def _info_json(args):
        info_json(path=args.path, verbose=args.verbose)
    parser_migrate = subparsers.add_parser('info_json', help='query database, then write info.json file if there is none')
    parser_migrate.add_argument("path", help="path to a project home directory (old non-pooled)", type=str, nargs="+")
    parser_migrate.set_defaults(func=_info_json)


    args = parser.parse_args()
    args.func(args)




