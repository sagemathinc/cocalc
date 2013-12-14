#!/usr/bin/env python


import argparse, json, os, pyinotify, sys, time
from uuid import UUID

def check_uuid(uuid):
    if UUID(uuid).version != 4:
        raise RuntimeError("invalid uuid")

def uid(uuid):
    return UUID(uuid).int % (2**31)

def cmd(s, exit_on_error=True, verbose=True):  # TODO: verbose ignored right now
    print s
    t = time.time()
    if os.system(s):
        if exit_on_error:
            print "Error running '%s' -- terminating"%s
            sys.exit(1)
    print "time: %s seconds"%(time.time() - t)

def migrate_project_to_storage(src, storage, min_size_mb, new_only, verbose):
    info_json = os.path.join(src,'.sagemathcloud','info.json')
    if not os.path.exists(info_json):
        if verbose:
            print "Skipping since %s does not exist"%info_json
        return
    project_id = json.loads(open(info_json).read())['project_id']
    projectid = project_id.replace('-','')
    target = os.path.join(storage, project_id)
    try:
        if os.path.exists(target):
            if new_only:
                if verbose:
                    print "skipping %s (%s) since it already exists (and new_only=True)"%(src, project_id)
                return
            mount_project(storage=storage, project_id=project_id, verbose=verbose)
        else:
            # create
            os.makedirs(target)
            os.chdir(target)
            current_size_mb = int(os.popen("du -s '%s'"%src).read().split()[0])//1000 + 1
            size = max(min_size_mb, 2*current_size_mb)
            cmd("truncate -s %sM 0.img"%size, verbose=verbose)
            cmd("zpool create -m /home/%s project-%s %s/0.img"%(projectid, project_id, target), verbose=verbose)
            cmd("zfs set compression=gzip project-%s"%project_id, verbose=verbose)
            cmd("zfs set dedup=on project-%s"%project_id, verbose=verbose)

        # rsync data over
        double_verbose = False
        cmd("time rsync -axH%s --delete --exclude .forever --exclude .bup %s/ /home/%s/"%(
                                      'v' if double_verbose else '', src, projectid), exit_on_error=False, verbose=verbose)
        id = uid(project_id)
        cmd("chown %s:%s -R /home/%s/"%(id, id, projectid))
        cmd("df -h /home/%s; zfs get compressratio project-%s; zpool get dedupratio project-%s"%(projectid, project_id, project_id), verbose=verbose)
    finally:
        unmount_project(project_id=project_id, verbose=verbose)

def mount_project(storage, project_id, verbose):
    check_uuid(project_id)
    id = uid(project_id)
    target = os.path.join(storage, project_id)
    cmd("zpool import project-%s -d %s"%(project_id, target), exit_on_error=False, verbose=verbose)
    projectid = project_id.replace('-','')
    # the -o makes it so in the incredibly unlikely event of a collision, no big deal.
    cmd("groupadd -g %s -o %s"%(id, projectid))
    cmd("useradd -u %s -g %s -o -d /home/%s/  %s"%(id, id, projectid, projectid), exit_on_error=False)  # error if user already exists is fine.

def unmount_project(project_id, verbose):
    check_uuid(project_id)
    projectid = project_id.replace('-','')
    cmd("pkill -9 -u %s"%projectid, exit_on_error=False)
    cmd("deluser --force %s"%projectid, exit_on_error=False)
    time.sleep(.5)
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
                if location['username'] in db:
                    print "WARNING: collision -- %s, %s"%(location, project_id)
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
                os.system('chmod a+rw %s'%f)

def copy_efficiently(src, dest, verbose):
    # This for now -- later we might use a different method when the file is above a certain
    # size threshhold (?)
    import uuid
    s0, s1 = os.path.split(dest)
    dest0 = os.path.join(s0, ".tmp-%s-%s"%(str(uuid.uuid4()), s1))
    if verbose:
        print("sync: %s --> %s"%(src, dest))
        t = time.time()
    try:
        cmd("cp -av '%s' '%s'"%(src, dest0), verbose=verbose, exit_on_error=False)
        cmd("mv -v '%s' '%s'"%(dest0, dest), verbose=verbose, exit_on_error=False)
    except:
        # remove the tmp file instead of leaving it there all corrupted.
        if os.path.exists(dest0):
            os.unlink(dest0)
        raise
    if verbose:
        print "time: %s"%(time.time()-t)

def sync(src, dest, verbose):
    """
    copy all older files from src/ to dest/.

    -- src/ = underyling *brick* path for some glusterfs host
    -- dest/ = remote mounted glusterfs filesystem
    """
    src = os.path.abspath(src)
    dest = os.path.abspath(dest)
    import stat
    def walktree(top):
        v = os.listdir(top)
        v.sort()
        for i, f in enumerate(v):
            if f == '.glusterfs':
                # skip the glusterfs meta-data
                continue
            if verbose:
                if len(v)>10:
                    print("%s/%s: %s"%(i+1,len(v),f))
            pathname = os.path.join(top, f)

            src_name  = os.path.join(src, pathname)
            dest_name = os.path.join(dest, pathname)

            st = os.stat(src_name)

            if st.st_mode == 33280:
                # glusterfs meta-info file to indicate a move...
                continue

            if stat.S_ISDIR(st.st_mode):
                # It's a directory: create in target if necessary, then recurse
                if not os.path.exists(dest_name):
                    try:
                        os.mkdir(dest_name)
                    except OSError:
                        if not os.path.exists(dest_name):
                            raise RuntimeError("unable to make directory '%s'"%dest_name)
                walktree(pathname)

            elif stat.S_ISREG(st.st_mode):
                # It's a file: cp if target doesn't exist or is older
                if not os.path.exists(dest_name):
                    copy_efficiently(src_name, dest_name, verbose=verbose)
                else:
                    # exists, so check mtime -- int due to gluster having less precision
                    # if the dest file is older, overwrite.  The clock of the destination
                    # is used when doing this copy, so it's *critical* that the clocks be
                    # in sync.  Run ntp!
                    if int(os.stat(dest_name).st_mtime) < int(st.st_mtime):
                        # target is older, so copy
                        copy_efficiently(src_name, dest_name, verbose=verbose)
            else:
                # Unknown file type, print a message
                raise RuntimeError("unknown file type: %s"%pathname)

    os.chdir(src)
    walktree('.')

def sync_watch(src, dest, verbose):
    """
    watch src/ filesystem tree and on modification or creation, cp file from src/ to dest/.

    This uses inotify so that it is event driven.   You must increase the number of watched files
    that are allowed!  "sudo sysctl fs.inotify.max_user_watches=10000000" and in /etc/sysctl.conf:
        fs.inotify.max_user_watches=10000000

    - src/ = underyling *brick* path for some glusterfs host
    - dest/ = remote mounted glusterfs filesystem
    """
    src = os.path.abspath(src)
    dest = os.path.abspath(dest)

    min_sync_time = 10 # never sync a file more frequently than this many seconds.

    last_sync = {}  # time when given file was last sync'd; we track this so that we
                    # don't continually try to copy a file while it is being actively modified

    modified_dirs = set([])

    def add(pathname):
        if os.path.isdir(pathname):
            modified_dirs.add(pathname)
        elif os.path.isfile(pathname):
            path = os.path.split(pathname)[0]
            modified_dirs.add(path)
        else:
            print "todo -- SKIPPING nonfile/nondirectory -- %s"%pathname

    def handle_modified_dirs():
        #print "handle_modified_dirs: %s"%modified_dirs
        if not modified_dirs:
            return
        now = time.time()
        for path in modified_dirs:
            if path == src:  # ignore changes to the src directory itself...
                continue
            if path not in last_sync or now - last_sync[path] >= min_sync_time:
                if not path.startswith(src):
                    raise RuntimeError("path=(%s) must be under %s"%(path, src))
                dest_path = os.path.join(dest, path[len(src)+1:])
                if verbose:
                    print "sync('%s', '%s')"%(path, dest_path)
                sync(path, dest_path, verbose)
                last_sync[path] = time.time()
        modified_dirs.clear()

    wm   = pyinotify.WatchManager()  # Watch Manager
    mask = pyinotify.IN_CREATE | pyinotify.IN_MOVED_TO | pyinotify.IN_MODIFY | pyinotify.IN_CLOSE_WRITE

    class EventHandler(pyinotify.ProcessEvent):
        def process_IN_CREATE(self, event):
            #print "Creating:", event.pathname
            add(event.pathname)
        def process_IN_MOVED_TO(self, event):
            #print "File moved to:", event.pathname
            add(event.pathname)
        def process_IN_MODIFY(self, event):
            #print "Modified:", event.pathname
            add(event.pathname)
        def process_IN_CLOSE_WRITE(self, event):
            #print "Close write:", event.pathname
            add(event.pathname)

    handler = EventHandler()

    # we get inotify events for *at most* timeout seconds, then handle them all
    notifier = pyinotify.Notifier(wm, handler, timeout=1)

    t = time.time()
    if verbose:
        print "adding watches to '%s' (this could take several minutes)..."%src

    dot_gluster = os.path.join(src, '.glusterfs/')
    wdd = wm.add_watch(src, mask, rec=True, exclude_filter=pyinotify.ExcludeFilter(['^'+dot_gluster]))

    if verbose:
        print "watch added (%s seconds).  Now listening"%(time.time() - t)
    def check_for_events():
        #print "check_for_events"
        notifier.process_events()
        while notifier.check_events():  #loop in case more events appear while we are processing
            notifier.read_events()
            notifier.process_events()

    while True:
        check_for_events()
        handle_modified_dirs()
        time.sleep(1)


if __name__ == "__main__":

    parser = argparse.ArgumentParser(description="Project storage")
    parser.add_argument("--storage", help="the directory where project image directories are stored (default: /mnt/projects/)",
                        type=str, default="/mnt/projects/")
    parser.add_argument("--verbose", help="be very verbose (default: False)", default=False, action="store_const", const=True)

    subparsers = parser.add_subparsers(help='sub-command help')

    def migrate(args):
        v = [os.path.abspath(x) for x in args.src]
        for i, src in enumerate(v):
            if args.verbose:
                print "\n** %s of %s"%(i+1, len(v))
            migrate_project_to_storage(src=src, storage=args.storage, min_size_mb=args.min_size_mb,
                                       new_only=args.new_only, verbose=args.verbose)

    parser_migrate = subparsers.add_parser('migrate', help='migrate to or update project in storage pool')
    parser_migrate.add_argument("--min_size_mb", help="min size of zfs image in megabytes (default: 512)", type=int, default=512)
    parser_migrate.add_argument("--new_only", help="if image already created, do nothing (default: False)", default=False, action="store_const", const=True)
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

    def _sync(args):
        if args.watch:
            sync_watch(src=args.src, dest=args.dest, verbose=args.verbose)
        else:
            sync(src=args.src, dest=args.dest, verbose=args.verbose)
    parser_sync = subparsers.add_parser('sync', help='Cross data center project sync: simply uses the local "cp" command and local mounts of the glusterfs, but provides massive speedups due to sparseness of image files')
    parser_sync.add_argument("--watch", help="use inotify to watch for changes to the src filesystem and cp when they occur", default=False, action="store_const", const=True)
    parser_sync.add_argument("src", help="source directory", type=str)
    parser_sync.add_argument("dest", help="destination directory", type=str)
    parser_sync.set_defaults(func=_sync)

    args = parser.parse_args()
    args.func(args)




