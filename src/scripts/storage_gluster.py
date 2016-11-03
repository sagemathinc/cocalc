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



import argparse, cPickle, hashlib, json, logging, os, sys, time, random
from uuid import UUID

log = None

# This is so we can import salvus/salvus/daemon.py
sys.path.append('/home/salvus/salvus/salvus/')

def check_uuid(uuid):
    if UUID(uuid).version != 4:
        raise RuntimeError("invalid uuid")

def uid(uuid):
    # We take the sha-512 of the uuid just to make it harder to force a collision.  Thus even if a
    # user could somehow generate an account id of their choosing, this wouldn't help them get the
    # same uid as another user.
    n = hash(hashlib.sha512(uuid).digest()) % (4294967294-1000)    # 2^32-2=max uid, as keith determined by a program + experimentation.
    return n + 1001

def cmd(s, exit_on_error=True):
    log.debug(s)
    #s += ' &>/dev/null'
    t = time.time()
    if os.system(s):
        if exit_on_error:
            raise RuntimeError("Error running '%s'"%s)
    log.debug("time: %s seconds"%(time.time() - t))

def cmd2(s):
    log.debug(s)
    from subprocess import Popen, PIPE
    out = Popen(s, stdin=PIPE, stdout=PIPE, stderr=PIPE, shell=not isinstance(s, list))
    e = out.wait()
    x = out.stdout.read() + out.stderr.read()
    log.debug(x)
    return x,e

def path_to_project(storage, project_id):
    return os.path.join(storage, project_id[:2], project_id[2:4], project_id)

def migrate_project_to_storage(src, storage, min_size_mb, max_size_mb, new_only):
    info_json = os.path.join(src,'.sagemathcloud','info.json')
    if not os.path.exists(info_json):
        log.debug("Skipping since %s does not exist"%info_json)
        return
    project_id = json.loads(open(info_json).read())['project_id']
    projectid = project_id.replace('-','')
    target = path_to_project(storage, project_id)
    try:
        if os.path.exists(target):
            if new_only:
                log.debug("skipping %s (%s) since it already exists (and new_only=True)"%(src, project_id))
                return
            mount_project(storage=storage, project_id=project_id, force=False)
        else:
            # create
            os.makedirs(target)
            os.chdir(target)
            current_size_mb = int(os.popen("du -s '%s'"%src).read().split()[0])//1000 + 1
            size = min(max_size_mb, max(min_size_mb, current_size_mb))

            # Using many small img files might seem like a good idea.  It isn't, since mount takes massively longer, etc.
            #img_size_mb = 128
            #images = ['%s/%s.img'%(target, i) for i in range(size//img_size_mb + 1)]
            #for img in images:
            #    cmd("truncate -s %sM %s"%(img_size_mb,img))
            #images = ' '.join(images)


            images = '%s/%s.img'%(target,0)
            cmd("truncate -s %sM %s"%(size, images))

            cmd("zpool create -m /home/%s project-%s %s"%(projectid, project_id, images))
            cmd("zfs set compression=gzip project-%s"%project_id)
            cmd("zfs set dedup=on project-%s"%project_id)
            cmd("zfs set snapdir=visible project-%s"%project_id)

        # rsync data over
        double_verbose = False
        cmd("time rsync -axH%s --delete --exclude .forever --exclude .bup %s/ /home/%s/"%(
                                      'v' if double_verbose else '', src, projectid), exit_on_error=False)
        id = uid(project_id)
        cmd("chown %s:%s -R /home/%s/"%(id, id, projectid))
        cmd("df -h /home/%s; zfs get compressratio project-%s; zpool get dedupratio project-%s"%(projectid, project_id, project_id))
    finally:
        unmount_project(project_id=project_id)

def mount_project(storage, project_id, force):
    check_uuid(project_id)
    id = uid(project_id)
    target = path_to_project(storage, project_id)
    out, e = cmd2("zpool import %s project-%s -d %s"%('-f' if force else '', project_id, target))
    if e:
        if 'a pool with that name is already created' in out:
            # no problem
            pass
        else:
            print "could not get pool"
            sys.exit(1)
    projectid = project_id.replace('-','')
    # the -o makes it so in the incredibly unlikely event of a collision, no big deal.
    cmd("groupadd -g %s -o %s"%(id, projectid), exit_on_error=False)
    cmd("useradd -u %s -g %s -o -d /home/%s/  %s"%(id, id, projectid, projectid), exit_on_error=False)  # error if user already exists is fine.

def unmount_project(project_id):
    check_uuid(project_id)
    projectid = project_id.replace('-','')
    cmd("pkill -9 -u %s"%projectid, exit_on_error=False)
    cmd("deluser --force %s"%projectid, exit_on_error=False)
    time.sleep(.5)
    out, e = cmd2("zpool export project-%s"%project_id)
    if e:
        if 'no such pool' not in out:
            # not just a problem due to pool not being mounted.
            print "Error unmounting pool -- %s"%out
            sys.exit(1)

def tinc_address():
    return os.popen('ifconfig tun0|grep "inet addr"').read().split()[1].split(':')[1].strip()

def info_json(path):
    if not os.path.exists('locations.dat'):
        sys.stderr.write('Please run this from a node with db access to create locations.dat\n\t\techo "select location,project_id from projects limit 30000;" | cqlsh_connect 10.1.3.2 |grep "{" > locations.dat')
        sys.exit(1)
    db = {}
    host = tinc_address()
    log.info("parsing database...")
    for x in open('locations.dat').readlines():
        if x.strip():
            location, project_id = x.split('|')
            location = json.loads(location.strip())
            project_id = project_id.strip()
            if location['host'] == host:
                if location['username'] in db:
                    log.warning("WARNING: collision -- %s, %s"%(location, project_id))
                db[location['username']] = {'location':location, 'project_id':project_id, 'base_url':''}
    v = [os.path.abspath(x) for x in path]
    for i, path in enumerate(v):
        log.info("** %s of %s"%(i+1, len(v)))
        SMC = os.path.join(path, '.sagemathcloud')
        if not os.path.exists(SMC):
            log.warning("Skipping '%s' since no .sagemathcloud directory"%path)
            continue
        f = os.path.join(path, '.sagemathcloud', 'info.json')
        username = os.path.split(path)[-1]
        if not os.path.exists(f):
            if username not in db:
                log.warning("Skipping '%s' since not in database!"%username)
            else:
                s = json.dumps(db[username], separators=(',', ':'))
                log.info("writing '%s': '%s'"%(f,s))
                open(f,'w').write(s)
                os.system('chmod a+rw %s'%f)

def modtime(f):
    try:
        return int(os.stat(f).st_mtime)
    except:
        return 0 # 1970...

def copy_file_efficiently(src, dest):
    """
    Copy a possibly sparse file from a brick to a mounted glusterfs volume, if the dest is older.

    This for now -- later we might use a different method when the file is above a certain
    size threshold (?).  However, I can't think of any possible better method, really; anything
    involving computing a diff between the two files would require *reading* them, so already
    takes way too long (in sharp contrast to the ever-clever bup, which uses a blum filter!).

    This will raise a RuntimeError if something goes wrong.
    """
    import uuid
    s0, s1 = os.path.split(dest)
    if s1.startswith('.glusterfs'):
        # never copy around/sync any of the temp files we create below.
        return

    # The clock of the destination is used when doing this copy, so it's
    # *critical* that the clocks be in sync.  Run ntp!!!!!
    dest_modtime = modtime(dest)
    if dest_modtime >= modtime(src):
        return

    if not os.path.exists(s0):
        os.makedirs(s0)
    lock  = os.path.join(s0, ".glusterfs-lock-%s"%s1)
    dest0 = os.path.join(s0, ".glusterfs-tmp-%s-%s"%(str(uuid.uuid4()), s1))

    now = time.time()
    recent = now - 5*60   # recent time = 5 minutes ago
    if os.path.exists(lock):
        log.debug("another daemon is either copying the same file right now (or died).")
        # If mod time of the lock is recent, just give up.
        t = modtime(lock)
        if t >= recent:
            return # recent lock
        # check that dest0 exists and has mod time < 5 minutes; otherwise, take control.
        if os.path.exists(dest0) and modtime(dest0) >= recent:
            return


    if os.stat(src).st_mode == 33280:
        log.info("skipping copy since source '%s' suddenly became special link file", src)
        return

    log.info("sync: %s --> %s"%(src, dest))
    t = time.time()
    try:
        log.info(cmd2('ls -lhs "%s"'%src)[0])
        cmd("touch '%s'; cp -av '%s' '%s'"%(lock, src, dest0), exit_on_error=True)
        # check that modtime of dest is *still* older, i.e., that somehow somebody didn't
        # just step in and change it.
        if modtime(dest) == dest_modtime:
            # modtime was unchanged.
            cmd("mv -v '%s' '%s'"%(dest0, dest), exit_on_error=True)

    finally:
        # remove the tmp file instead of leaving it there all corrupted.
        if os.path.exists(dest0):
            try:
                os.unlink(dest0)
            except:
                pass
        if os.path.exists(lock):
            try:
                os.unlink(lock)
            except:
                pass

    total_time = time.time() - t
    log.info("time: %s"%total_time)
    return total_time

def sync(src, dest):
    """
    copy all older files from src/ to dest/.

    -- src/ = underyling *brick* path for some glusterfs host
    -- dest/ = remote mounted glusterfs filesystem
    """
    src = os.path.abspath(src)
    dest = os.path.abspath(dest)

    cache_file = "/var/lib/glusterd/glustersync/cache.pickle"
    if not os.path.exists("/var/lib/glusterd/glustersync"):
        os.makedirs("/var/lib/glusterd/glustersync")
    if os.path.exists(cache_file):
        cache_all = cPickle.loads(open(cache_file).read())
    else:
        cache_all = {}
    if dest not in cache_all:
        cache_all[dest] = {}
    cache = cache_all[dest]

    log.info("sync: '%s' --> '%s'"%(src, dest))

    import stat
    def walktree(top):
        #log.info("scanning '%s'", top)
        v = os.listdir(top)
        random.shuffle(v)
        for i, f in enumerate(v):
            if f == '.glusterfs':
                # skip the glusterfs meta-data
                continue
            if len(v)>10:
                log.debug("%s(%s/%s): %s", top,i+1,len(v),f)
            pathname = os.path.join(top, f)

            src_name  = os.path.join(src, pathname)
            dest_name = os.path.join(dest, pathname)

            st = os.stat(src_name)

            if st.st_mode == 33280:
                # glusterfs meta-info file to indicate a moved file...
                continue

            if stat.S_ISDIR(st.st_mode):
                # It's a directory: create in target if necessary, then recurse...
                ## !! we skip creation; this is potentially expensive and isn't needed for our application.
                ##if not os.path.exists(dest_name):
                ##  try:
                ##        os.makedirs(dest_name)
                ##    except OSError:
                ##        if not os.path.exists(dest_name):
                ##            raise RuntimeError("unable to make directory '%s'"%dest_name)
                try:
                    walktree(pathname)
                except OSError, mesg:
                    log.warning("error walking '%s': %s", pathname, mesg)

            elif stat.S_ISREG(st.st_mode):
                mtime = int(st.st_mtime)
                if cache.get(src_name, {'mtime':0})['mtime'] >= mtime:
                    continue
                try:
                    copy_file_efficiently(src_name, dest_name)  # checks dest modtime before actually doing copy.
                    cache[src_name] = {'mtime':mtime, 'size_mb':st.st_blocks//2000}
                except RuntimeError, mesg:
                    log.warning("error copying %s to %s; skipping.", src_name, dest_name)

            else:
                # Unknown file type, print a message
                log.warning("unknown file type: %s", pathname)

    os.chdir(src)
    walktree('.')

    s = cPickle.dumps(cache_all)
    open(cache_file,'w').write(s)

def sync_watch(sources, dests, min_sync_time):
    ### WARNING -- this code does not work very well, and is sort of pointless.  AVOID!
    """
    Watch filesystem trees and on modification or creation, cp file, possibly creating directories.
    The frequency of copying is limited in various ways.

    This uses inotify so that it is event driven.   You must increase the number of watched files
    that are allowed!  "sudo sysctl fs.inotify.max_user_watches=10000000" and in /etc/sysctl.conf:
        fs.inotify.max_user_watches=10000000

    - sources   = list of underyling *brick* path for some glusterfs host
    - dests = list of paths of remote mounted glusterfs filesystems
    - min_sync_time = never sync a file more frequently than this many seconds; no matter what, we
      also wait at least twice the time it takes to sync out the file before syncing it again.
    """
    sources = [os.path.abspath(src) for src in sources]
    dests   = [os.path.abspath(dest) for dest in dests]

    next_sync = {}  # soonest time when may again sync a given file

    modified_files = set([])
    received_files = set([])

    def add(pathname):
        try:
            if os.stat(pathname).st_mode == 33280:
                # ignore gluster special files
                log.debug("ignoring gluster special file: '%s'", pathname)
                return
        except:
            pass
        log.debug("inotify: %s"%pathname)
        s = os.path.split(pathname)
        if s[1].startswith('.glusterfs-lock-'):
            received_files.add(os.path.join(s[0], s[1][len('.glusterfs-lock-'):]))
        elif s[1].startswith('.glusterfs'):
            return
        elif os.path.isfile(pathname):
            modified_files.add(pathname)

    def handle_modified_files():
        if not modified_files:
            return
        log.debug("handling modified_files=%s", modified_files)
        log.debug("received_files=%s", received_files)
        now = time.time()
        do_later = []
        for path in modified_files:
            if path in sources:  # ignore changes to the sources directories
                continue
            if path in received_files:   # recently copied to us.
                continue
            if path not in next_sync or now >= next_sync[path]:
                src = None
                for s in sources:
                    if path.startswith(s):
                        src = s
                        break
                if not src:
                    log.warning("not copying '%s' -- must be under a source: %s"%(path, sources))
                    continue
                t0 = time.time()
                for dest in dests:
                    dest_path = os.path.join(dest, path[len(src)+1:])
                    log.info("copy('%s', '%s')"%(path, dest_path))
                    try:
                        copy_file_efficiently(path, dest_path)
                    except Exception, msg:
                        log.warning("problem syncing %s to %s! -- %s"%(path, dest_path, msg))
                # no matter what, we wait at least twice the time (from now) that it takes to sync out the file before syncing it again.
                next_sync[path] = time.time() + max(2*(time.time() - t0), min_sync_time)
            else:
                pass
                #log.debug("waiting until later to sync (too frequent): '%s' "%path)
                do_later.append(path)
        modified_files.clear()
        received_files.clear()
        modified_files.update(do_later)

    import pyinotify
    wm   = pyinotify.WatchManager()  # Watch Manager
    mask = pyinotify.IN_CREATE | pyinotify.IN_MOVED_TO | pyinotify.IN_MODIFY | pyinotify.IN_CLOSE_WRITE

    class EventHandler(pyinotify.ProcessEvent):
        def process_IN_CREATE(self, event):
            print "Creating:", event.pathname
            if os.path.isdir(event.pathname):
                # created a directory -- add it to the watch list
                watchers.append(wm.add_watch(event.pathname, mask))
            add(event.pathname)
        def process_IN_MOVED_TO(self, event):
            print "File moved to:", event.pathname
            add(event.pathname)
        def process_IN_MODIFY(self, event):
            print "Modified:", event.pathname
            add(event.pathname)
        def process_IN_CLOSE_WRITE(self, event):
            print "Close write:", event.pathname
            add(event.pathname)

    handler = EventHandler()

    # we get inotify events for *at most* timeout seconds, then handle them all
    notifier = pyinotify.Notifier(wm, handler, timeout=1)

    t = time.time()

    watchers = []
    for src in sources:
        log.info("adding watches to '%s' (this could take several minutes)..."%src)
        dot_gluster = os.path.join(src, '.glusterfs')
        watchers.append(wm.add_watch(src, mask, rec=True, exclude_filter=pyinotify.ExcludeFilter(['^'+dot_gluster])))
        log.info("watch added (%s seconds): listening for file events..."%(time.time() - t))

    def check_for_events():
        #print "check_for_events"
        notifier.process_events()
        while notifier.check_events():  #loop in case more events appear while we are processing
            notifier.read_events()
            notifier.process_events()

    while True:
        check_for_events()
        handle_modified_files()
        time.sleep(1)

def volume_info():
    # parse 'gluster volume info' as a python object.
    s, e = cmd2('unset PYTHONPATH; unset PYTHONHOME; gluster volume info')
    if e:
        raise RuntimeError(e)
    v = {}
    for x in s.split("\nVolume Name: "):
        z = x.strip().splitlines()
        if z:
            name = z[0]
            m = {'bricks':[]}
            for k in z[1:]:
                i = k.find(':')
                if i == -1:
                    continue
                key = k[:i].strip()
                val = k[i+1:].strip()
                if val:
                    if key.startswith('Brick'):
                        m['bricks'].append(val)
                    else:
                        m[key] = val
            v[name] = m
    return v

def ip_address(dest):
    # get the ip address that is used to communicate with the given destination
    import misc
    return misc.local_ip_address(dest)

def mount_target_volumes(volume_name):
    info = volume_info()
    dests = []
    ip = None
    mount = cmd2('mount')[0]
    for name, data in volume_info().iteritems():
        if name.startswith('dc'):
            v = name.split('-')
            if len(v) >= 2 and v[1] == volume_name:
                use = True
                for brick in data['bricks']:
                    brick_ip, path = brick.split(':')
                    if ip_address(brick_ip) == brick_ip:
                        # this volume is partly hosted on this computer, hence not a target.
                        use = False
                        break
                if use:
                    # ensure volume is mounted and add to list
                    if 'mnt/%s'%name not in mount:
                        cmd("mkdir -p '/mnt/%s'; mount -t glusterfs localhost:'/%s' '/mnt/%s'"%(name, name, name))
                    dests.append('/mnt/%s'%name)
    return dests

def find_bricks(volume_name):
    bricks = []
    ip = None
    for name, data in volume_info().iteritems():
        if name.startswith('dc'):
            v = name.split('-')
            if len(v) >= 2 and v[1] == volume_name:
                for brick in data['bricks']:
                    brick_ip, path = brick.split(':')
                    if ip_address(brick_ip) == brick_ip:
                        bricks.append(path)
    return bricks

def setup_log(loglevel='DEBUG', logfile=''):
    logging.basicConfig()
    global log
    log = logging.getLogger('storage')
    if loglevel:
        level = getattr(logging, loglevel.upper())
        log.setLevel(level)

    if logfile:
        log.addHandler(logging.FileHandler(logfile))

    log.info("logger started")

if __name__ == "__main__":

    parser = argparse.ArgumentParser(description="Project storage")
    parser.add_argument("--loglevel", dest='loglevel', type=str, default='INFO',
                           help="log level: useful options include INFO, WARNING and DEBUG")
    parser.add_argument("--logfile", dest="logfile", type=str, default='',
                        help="store log in this file (default: '' = don't log to a file)")

    subparsers = parser.add_subparsers(help='sub-command help')

    def migrate(args):
        if not args.storage:
            args.storage = os.environ['SALVUS_STORAGE']
        v = [os.path.abspath(x) for x in args.src]
        for i, src in enumerate(v):
            log.info("\n** %s of %s"%(i+1, len(v)))
            migrate_project_to_storage(src=src, storage=args.storage, min_size_mb=args.min_size_mb, max_size_mb=10000,
                                       new_only=args.new_only)

    parser_migrate = subparsers.add_parser('migrate', help='migrate to or update project in storage pool')
    parser_migrate.add_argument("--storage", help="the directory where project image directories are stored (default: $SALVUS_STORAGE enviro var)",
                                type=str, default='')
    parser_migrate.add_argument("--min_size_mb", help="min size of zfs image in megabytes (default: 512)", type=int, default=512)
    parser_migrate.add_argument("--new_only", help="if image already created, do nothing (default: False)", default=False, action="store_const", const=True)
    parser_migrate.add_argument("src", help="the current project home directory", type=str, nargs="+")
    parser_migrate.set_defaults(func=migrate)

    def mount(args):
        if not args.storage:
            args.storage = os.environ['SALVUS_STORAGE']
        mount_project(storage=args.storage, project_id=args.project_id, force=args.f)
    parser_mount = subparsers.add_parser('mount', help='mount a project that is available in the storage pool')
    parser_mount.add_argument("--storage", help="the directory where project image directories are stored (default: $SALVUS_STORAGE enviro var)",
                                type=str, default='')

    parser_mount.add_argument("project_id", help="the project id", type=str)
    parser_mount.add_argument("-f", help="force (default: False)", default=False, action="store_const", const=True)
    parser_mount.set_defaults(func=mount)

    def unmount(args):
        unmount_project(project_id=args.project_id)
    parser_unmount = subparsers.add_parser('umount', help='unmount a project that is available in the storage pool')
    parser_unmount.add_argument("project_id", help="the project id", type=str)
    parser_unmount.set_defaults(func=unmount)

    def _info_json(args):
        info_json(path=args.path)
    parser_migrate = subparsers.add_parser('info_json', help='query database, then write info.json file if there is none')
    parser_migrate.add_argument("path", help="path to a project home directory (old non-pooled)", type=str, nargs="+")
    parser_migrate.set_defaults(func=_info_json)

    def _sync(args):
        if not args.dest:
            args.dest = ','.join(mount_target_volumes(args.volume))
        if not args.src:
            args.src  = ','.join(find_bricks(args.volume))
        def main():
            while True:
                try:
                    if args.watch:
                        sync_watch(sources=args.src.split(','), dests=args.dest.split(','), min_sync_time=args.min_sync_time)
                    else:
                        for src in args.src.split(','):
                            for dest in args.dest.split(','):
                                sync(src=src, dest=dest)
                except KeyboardInterrupt:
                    return
                except Exception, mesg:
                    print mesg
                if not args.daemon:
                    return
                time.sleep(5)
        if args.daemon:
            if not args.pidfile:
                raise RuntimeError("in --daemon mode you *must* specify --pidfile")
            import daemon
            daemon.daemonize(args.pidfile)
        main()


    parser_sync = subparsers.add_parser('sync', help='Cross data center project sync: simply uses the local "cp" command and local mounts of the glusterfs, but provides massive speedups due to sparseness of image files')
    parser_sync.add_argument("--watch", help="after running once, use inotify to watch for changes to the src filesystem and cp when they occur", default=False, action="store_const", const=True)
    parser_sync.add_argument("--min_sync_time", help="never copy a file more frequently than this (default: 30 seconds)",
                             type=int, default=30)
    parser_sync.add_argument("--daemon", help="daemon mode; will repeatedly sync",
                             dest="daemon", default=False, action="store_const", const=True)
    parser_sync.add_argument("--pidfile", dest="pidfile", type=str, default='',  help="store pid in this file when daemonized")
    parser_sync.add_argument("--dest", help="comma separated list of destinations; if not given, all remote gluster volumes with name dc[n]-volume are mounted and targeted", type=str, default='')
    parser_sync.add_argument("--src", help="comma separated paths to bricks; if not given, local bricks for dc[n]-volume are used", type=str, default='')
    parser_sync.add_argument("--volume", help="if there are volumes dc0-projects, dc1-projects, dc2-projects, then pass option --volume=projects (default: 'projects')", default='projects')
    parser_sync.set_defaults(func=_sync)

    args = parser.parse_args()

    setup_log(loglevel=args.loglevel, logfile=args.logfile)

    args.func(args)

else:
    setup_log()




