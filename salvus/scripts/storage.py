#!/usr/bin/env python

import argparse, cPickle, hashlib, json, logging, os, sys, time, random
from multiprocessing import Pool, TimeoutError
from uuid import UUID, uuid4
from subprocess import Popen, PIPE

CWD = os.path.split(os.path.realpath(__file__))[0]
sys.path.insert(0, CWD)
from hashring import HashRing

def print_json(s):
    print json.dumps(s, separators=(',',':'))

log = None

class MultiHashRing(object):
    def __init__(self, topology=None, rep_factor=2):
        """
        Read the hashrings from the file topology, which defaults to 'storage-topology'
        in the same directory as storage.py.
        """
        if topology is None:
            topology = os.path.join(CWD, 'storage-topology')
        self.topology = topology
        self._rep_factor = rep_factor
        self._load()

    def _load(self):
        v = [x for x in open(self.topology).readlines() if x.strip() and not x.strip().startswith('#')]
        data = {}
        for x in v:
            ip, vnodes, datacenter = x.split()
            vnodes = int(vnodes)
            if datacenter not in data:
                data[datacenter] = {}
            dc = data[datacenter]
            dc[ip] = {'vnodes':vnodes}
        import hashring
        self.rings = [(dc, hashring.HashRing(d)) for dc, d in data.iteritems()]
        self.rings.sort()

    def __call__(self, key):
        return [(dc, r.range(key, self._rep_factor)) for (dc,r) in self.rings]

_multi_hash_ring = None
def multi_hash_ring():
    global _multi_hash_ring
    if _multi_hash_ring is None:
        _multi_hash_ring = MultiHashRing()
    return _multi_hash_ring

def check_uuid(uuid):
    if UUID(uuid).version != 4:
        raise RuntimeError("invalid uuid")

def uid(uuid):
    # We take the sha-512 of the uuid just to make it harder to force a collision.  Thus even if a
    # user could somehow generate an account id of their choosing, this wouldn't help them get the
    # same uid as another user.
    n = hash(hashlib.sha512(uuid).digest()) % (4294967294-1000)    # 2^32-2=max uid, as keith determined by a program + experimentation.
    return n + 1001

def cmd(s, exception_on_error=True):
    log.debug(s)
    t = time.time()
    out = Popen(s, stdin=PIPE, stdout=PIPE, stderr=PIPE, shell=not isinstance(s, list))
    x = out.stdout.read() + out.stderr.read()
    e = out.wait()  # this must be *after* the out.stdout.read(), etc. above or will hang when output large!
    log.debug("(%s seconds): %s", time.time()-t, x)
    if e and exception_on_error:
        raise RuntimeError(x)
    return x

_users = None
def users():
    global _users
    if _users is not None:
        return _users
    _users = {}
    for x in open("/etc/passwd").readlines():
        v = x.split(':')
        _users[v[0].strip()] = int(v[2].strip())  # user to uid
    return _users

def path_to_project(project_id):
    check_uuid(project_id)
    return os.path.join('/projects', project_id)

def dataset_name(project_id):
    check_uuid(project_id)
    return 'projects/%s'%project_id

def dataset_exists(project_id):
    try:
        cmd("sudo zfs list '%s'"%dataset_name(project_id))
        # exit code of 0... so success
        return True
    except RuntimeError, msg:
        if 'does not exist' in str(msg).lower():
            return False
        raise  # something else bad happened.

def migrate_project_to_storage(src, new_only):
    info_json = os.path.join(src, '.sagemathcloud', 'info.json')
    if not os.path.exists(info_json):
        log.debug("skipping since %s does not exist"%info_json)
        return

    project_id = json.loads(open(info_json).read())['project_id']
    projectid = project_id.replace('-','')
    home = path_to_project(project_id)
    dataset = dataset_name(project_id)
    if new_only and os.path.exists(home):
        log.info("skipping %s (%s) since it already exists (and new_only=True)"%(src, project_id))
        return
    create_dataset(project_id)
    create_user(project_id)

    mount(project_id)

    # rsync data over
    cmd("rsync -Hax --delete --exclude .forever --exclude .bup --exclude .zfs %s/ %s/"%(src, home))
    id = uid(project_id)


    # chown with snapdir visible doesn't work; can cause other problems too.
    cmd("sudo zfs set snapdir=hidden %s"%dataset)
    # chown use numeric id, since username=projectid assigned twice in some cases during transition (for new projects)
    cmd("chown %s:%s -R /%s"%(id, id, projectid, home))

    snapshot(project_id)
    cmd("sudo zfs list %s"%dataset)

    umount(project_id)

def mount(project_id):
    cmd('sudo zfs set mountpoint=%s %s'%(path_to_project(project_id), dataset_name(project_id)))

def umount(project_id):
    cmd('sudo zfs set mountpoint=none %s'%dataset_name(project_id))

def create_dataset(project_id):
    """
    Create the dataset the contains the given project data.   It is safe to
    call this function even if the dataset already exists.
    """
    if dataset_exists(project_id):
        return
    dataset = dataset_name(project_id)
    home = path_to_project(project_id)
    cmd('sudo zfs create %s'%dataset)
    cmd('sudo zfs set snapdir=hidden %s'%dataset)
    cmd('sudo zfs set quota=10G %s'%dataset)

def create_user(project_id):
    """
    Create the user the contains the given project data.   It is safe to
    call this function even if the user already exists.
    """
    name = project_id.replace('-','')
    id = uid(project_id)
    u = users().get(name, 0)
    if u == id:
        # user already exists and has correct id
        return
    if u != 0:
        return # for now -- otherwise we would mess up the user
               # after the transition is complete, we'll go through all compute
               # vm's and run this again, which will fix the uid'.s
        # there's the username but with wrong id
        cmd("groupdel %s"%name)
        cmd("userdel %s"%name)

    # Now make correct user.
    # the -o makes it so in the incredibly unlikely event of a collision, no big deal.
    cmd("groupadd -g %s -o %s"%(id, name))
    cmd("useradd -u %s -g %s -o -d %s %s"%(id, id, home, name))

def usage(project_id):
    v = cmd("df %s"%path_to_project(project_id))
    a, b = v.splitlines()
    a = a.replace('Mounted on','mounted').split()
    b = b.split()
    return dict([(a[i].lower(),b[i]) for i in range(len(a))])

#def recently_made_snapshots(age_s):
#    """
#    Return all snapshots that were *explicitly* made on this machine within the last age_s seconds.
#
#    NOTE: Other snapshots could appear due to remote replication. This only returns the ones that
#    were actually made here using the zfs snapshot command.
#    """
#    cmd('sudo zpool history|grep " zfs snapshot projects/"')

def list_snapshots(project_id, host=''):
    """
    Return sorted list of snapshots of the given project available on the given host.

    This is very fast if host=None, and the cost of ssh if host isn't.
    """
    assert isinstance(project_id, str)
    c = "sudo zfs list -r -t snapshot -o name -s creation %s"%dataset_name(project_id)
    try:
        if not host:
            v = cmd(c)
        else:
            v = cmd('ssh %s %s'%(host, c))
    except RuntimeError, msg:
        if 'dataset does not exist' in str(msg):
            # project isn't available here
            return []
        raise # something else went wrong
    v = v.strip().split()
    v = [x for x in v if "Warning" not in x]  # eliminate any ssh key warnings.
    v.sort()
    return v

def snapshot(project_id, name=''):
    """
    Create a new snapshot right now with current ISO timestamp at start of name.

    Returns the name of the created snapshot.
    """
    log.debug("snapshot: %s", project_id)
    name = "%s@%s%s"%(dataset_name(project_id), time.strftime('%Y-%m-%dT%H:%M:%S'), name)
    cmd("sudo zfs snapshot %s"%name)
    return name

def _newest_snapshot(project_id, host=''):
    v = list_snapshots(project_id=project_id, host=host)
    if len(v) == 0:
        return ''
    else:
        return v[-1]

def mp_newest_snapshot(x):
    return (x[1], _newest_snapshot(x[0],x[1]))

def newest_snapshot(project_id, hosts=None, timeout=10):
    """
    Return most recent snapshot or empty string if none.

    If host is a single ip address, return newest snapshot on that host.

    If hosts is a list of ip addresses (or hostnames),
    returns a dictionary with keys the entries in hosts
    and the values the names of the newest snapshots.
    Hosts that don't respond within timeout seconds are
    ignored.
    """
    if not isinstance(hosts, list):
        return _newest_snapshot(project_id, hosts)

    pool = Pool(processes=len(hosts))
    start = time.time()
    x = pool.imap(mp_newest_snapshot, [(project_id, dest) for dest in hosts])
    result = []
    while True:
        try:
            t = timeout - (start-time.time())
            if t > 0:
                result.append(x.next(t))
            else:
                raise TimeoutError
        except TimeoutError, mesg:
            log.info("timed out connecting to some destination -- %s", mesg)
            pool.terminate()
            break
        except StopIteration:
            break

    return dict(result)


def ip_address(dest):
    # get the ip address that is used to communicate with the given destination
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.connect((dest,80))
    return s.getsockname()[0]


# idea for how to send un-encrypted: http://alblue.bandlem.com/2010/11/moving-data-from-one-zfs-pool-to.html

def send_one(project_id, dest, force=True):
    log.info("sending %s to %s", project_id, dest)

    if ip_address(dest) == dest:
        log.info("send to self: nothing to do")
        return

    if force:
        force = "-F"
    else:
        force = ''

    snap_src  = newest_snapshot(args.project_id)
    if not snap_src:
        log.warning("send: no local snapshot for '%s'"%project_id)
        return

    snap_dest = newest_snapshot(project_id, dest)
    log.debug("src: %s, dest: %s", snap_src, snap_dest)

    if snap_src == snap_dest:
        log.info("send %s -- already up to date", project_id)
        return

    dataset = dataset_name(project_id)
    t = time.time()
    c = "sudo zfs send -RD %s %s %s | gzip | ssh %s 'gzip -d | sudo zfs recv %s %s'"%(
                                  '-i' if snap_dest else '', snap_dest, snap_src, dest, force, dataset)
    cmd(c)
    log.info("done (time=%s seconds)", time.time()-t)

def mp_send_multi_helper(x):
    tmp, dest, force, dataset = x
    log.info("sending to %s", dest)
    cmd("cat %s | ssh %s 'gzip -d | sudo zfs recv %s %s'"%(tmp, dest, force, dataset))

def send_multi(project_id, destinations, force=True, snap_src=None, timeout=10):
    """
    Send to multiple destinations

    -- timeout - Ignore destinations that don't respond within timeout seconds to the initial
    call for the newest snapshot.
    """
    log.info("sending %s to %s", project_id, destinations)

    if snap_src is None:
        snap_src  = newest_snapshot(project_id)

    if not snap_src:
        log.warning("send: no local snapshot for '%s'"%project_id)
        return

    snap_destinations = newest_snapshot(project_id, hosts=destinations, timeout=timeout)

    log.debug("src: %s, dest: %s", snap_src, snap_destinations)

    for snap_dest in set(snap_destinations.itervalues()):
        _send_multi(project_id, [dest for dest in snap_destinations if snap_destinations[dest] == snap_dest],
                    snap_src, snap_dest, timeout, force)

def _send_multi(project_id, destinations, snap_src, snap_dest, timeout, force):
    if snap_dest == snap_src:
        log.debug("no update to %s needed", destinations)
        return

    dataset = dataset_name(project_id)
    t = time.time()

    tmp = '/tmp/.storage-%s.gz'%project_id
    if os.path.exists(tmp):
        raise RuntimeError("project %s appears to already be being replicated; delete %s to clear lock", project_id, tmp)

    if force:
        force = "-F"
    else:
        force = ''
    try:
        cmd("sudo zfs send -RD %s %s %s | gzip > %s"%('-i' if snap_dest else '', snap_dest, snap_src, tmp))
        diff_size = os.path.getsize(tmp)
        diff_size_mb = diff_size/1000000.0
        send_timeout = 60 + int(diff_size_mb * 2)
        log.info("%sM of data to send (send_timeout=%s seconds)", diff_size_mb, send_timeout)
        work = []
        for dest in destinations:
            if ip_address(dest) == dest:
                log.info("send to self: nothing to do")
            else:
                log.info("sending to %s", dest)
                work.append((tmp, dest, force, dataset))
        if len(work) > 0:
            pool = Pool(processes=len(work))
            x = pool.imap(mp_send_multi_helper, work)
            start = time.time()
            while True:
                try:
                    t = timeout - (start-time.time())
                    if t > 0:
                        x.next(timeout = send_timeout - t)
                    else:
                        raise TimeoutError
                except TimeoutError, mesg:
                    log.info("timed out connecting to some destination -- %s", mesg)
                    pool.terminate()
                    break
                except StopIteration:
                    break
    finally:
        try:
            os.unlink(tmp)
        except:
            pass
    log.info("done (time=%s seconds)", time.time()-t)

def all_local_project_ids():
    """
    Return list of all ids of projects stored on this computer.

    Takes a few seconds per thousand projects.  In *random* order (on purpose).
    """
    v = []
    for x in os.popen("sudo zfs list").readlines():  # cmd takes too long for some reason given huge output
        w = x.split()
        if w[0].startswith('projects/'):
            v.append(w[0].split('/')[1])
    random.shuffle(v)
    return v

def locations(project_id):
    assert isinstance(project_id, str)
    ring = multi_hash_ring()
    return sum([d[1] for d in ring(project_id)], [])

def replicate(project_id, snap_src=None):
    destinations = locations(project_id)
    log.info("replicating %s out to %s", project_id, destinations)
    send_multi(project_id, destinations, snap_src=snap_src)

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


def activity_watcher(active_path='/home/storage/active', ignore_dot=True):
    """
    Watch the /projects directory, and when any file or path changes,
    touch the file active_path/project_id.

    If ignore_dot is true (the default), do not trigger changes when a path
    that begins ~/.somepath changes.

    NOTES:

     - when this is running projects often can't be unmounted

     - this function *must* be run as root, since otherwise there is no way to use inotify to watch for changes on subdirs.

    """
    import pyinotify
    wm   = pyinotify.WatchManager()
    mask = pyinotify.IN_CREATE | pyinotify.IN_MOVED_TO | pyinotify.IN_MODIFY | pyinotify.IN_CLOSE_WRITE | pyinotify.IN_DELETE

    last_add = {}
    def add(pathname):
        if len(pathname) < 47:
            return
        v = pathname.split('/')
        project_id = v[2]
        # avoid excessive filesystem touching by ignoring requests for 15 seconds after activity.
        t = time.time()
        if last_add.get(project_id) >= t-15:
            return
        last_add[project_id] = t
        log.debug("activity: %s", pathname)
        active = os.path.join(active_path, v[2])
        cmd("mkdir -p '%s'; touch '%s'; chown -R storage. '%s'"%(active_path, active, active_path))

    class EventHandler(pyinotify.ProcessEvent):
        def process_IN_CREATE(self, event):
            add(event.pathname)
        def process_IN_DELETE(self, event):
            add(event.pathname)
        def process_IN_MOVED_TO(self, event):
            add(event.pathname)
        def process_IN_MODIFY(self, event):
            add(event.pathname)
        def process_IN_CLOSE_WRITE(self, event):
            add(event.pathname)

    handler = EventHandler()

    # we receive inotify events for *at most* timeout seconds, then handle them all
    notifier = pyinotify.Notifier(wm, handler)
    watchers = []
    log.info("adding inotify watcher to /projects...")
    if ignore_dot:
        def exclude_filter(s):
            return s[47:].startswith('.')
    else:
        def exclude_filter(s):
            return False

    watchers.append(wm.add_watch('/projects', mask, rec=True, auto_add=True, exclude_filter=exclude_filter))
    log.info("done: now watching for changes")
    notifier.loop()


def replicate_active(active_path='/home/storage/active'):
    """
    Snapshot and replicate out all files in active_path, deleting
    each file the moment the replication has completed.

    Use activity_watcher running as *root* (seperately) to generate
    the files in active_path in realtime.
    """
    for project_id in os.listdir(active_path):
        try:
            name = snapshot(project_id)
            replicate(project_id, snap_src=name)
            os.unlink(os.path.join(active_path, project_id))
        except Exception, mesg:
            log.info("ERROR: replicate_active %s -- %s"%(project_id, mesg))

def replicate_active_watcher(min_time_s=60, active_path='/home/storage/active'):
    """
    Watch active_path for active projects.  If a project is active which has
    not been active for at least min_time_s seconds, then snapshot and replicate
    it out.

    Use activity_watcher running as *root* (seperately) to generate
    the files in active_path in realtime, i.e., "storage.py --activity".
    """
    last_attempt = {}

    while True:
        if os.path.exists(active_path):
            for project_id in os.listdir(active_path):
                now = time.time()
                if last_attempt.get(project_id, 0) + min_time_s >= now:
                    continue
                last_attempt[project_id] = now
                f = os.path.join(active_path, project_id)
                try:
                    # we unlink at the beginning so that if it changes again before we're done,
                    # then it'll get snapshotted again in the future
                    os.unlink(f)
                    name = snapshot(project_id)
                    replicate(project_id, snap_src=name)
                except Exception, mesg:
                    open(f,'w')  # create file, so that snapshot & replicate will be attempted again soon.
                    log.info("ERROR: replicate_active_watcher %s -- %s"%(project_id, mesg))
        time.sleep(1)



if __name__ == "__main__":

    parser = argparse.ArgumentParser(description="ZFS based project storage")
    parser.add_argument("--loglevel", dest='loglevel', type=str, default='DEBUG',
                           help="log level: useful options include INFO, WARNING and DEBUG")
    parser.add_argument("--logfile", dest="logfile", type=str, default='',
                        help="store log in this file (default: '' = don't log to a file)")
    parser.add_argument("--daemon", help="daemon mode",
                         dest="daemon", default=False, action="store_const", const=True)
    parser.add_argument("--pidfile", dest="pidfile", type=str, default='',
                         help="store pid in this file when daemonized")

    subparsers = parser.add_subparsers(help='sub-command help')

    def migrate(args):
        v = [os.path.abspath(x) for x in args.src]
        for i, src in enumerate(v):
            log.info("\n** %s of %s"%(i+1, len(v)))
            migrate_project_to_storage(src=src, new_only=args.new_only)

    parser_migrate = subparsers.add_parser('migrate', help='create or update dataset (and user) corresponding to the given home directories')
    parser_migrate.add_argument("--new_only", help="if dataset already created, do nothing (default: False)", default=False, action="store_const", const=True)
    parser_migrate.add_argument("src", help="the current project home directory", type=str, nargs="+")
    parser_migrate.set_defaults(func=migrate)

    def _snapshot(args):
        snapshot(project_id=args.project_id, name=args.name)

    parser_snapshot = subparsers.add_parser('snapshot', help='make a new snapshot of the given project')
    parser_snapshot.add_argument("project_id", help="project id", type=str)
    parser_snapshot.add_argument("name", help="appended to end of snapshot timestamp", type=str, default='', nargs='?')
    parser_snapshot.set_defaults(func=_snapshot)

    def _snapshots(args):
        print_json({'project_id':args.project_id, 'snapshots':list_snapshots(project_id=args.project_id, host=args.host)})

    parser_snapshots = subparsers.add_parser('snapshots', help='list in order the snapshots of the given project')
    parser_snapshots.add_argument("project_id", help="project id", type=str)
    parser_snapshots.add_argument("host", help="ip address of host (default: ''=localhost)", type=str, default='', nargs='?')
    parser_snapshots.set_defaults(func=_snapshots)

    def _status(args):
        v = newest_snapshot(project_id=args.project_id, hosts=locations(args.project_id), timeout=args.timeout)
        print_json({'project_id':args.project_id, 'newest_snapshots':v})

    parser_status = subparsers.add_parser('status', help='output json object giving newest snapshot on each available host')
    parser_status.add_argument("project_id", help="project id", type=str)
    parser_status.add_argument("--timeout", dest='timeout', type=int, default=10, help="timeout to declare host not available")
    parser_status.set_defaults(func=_status)

    def _usage(args):
        print_json({'project_id':args.project_id, 'usage':usage(args.project_id)})

    parser_usage = subparsers.add_parser('usage', help='disk usage information about the project')
    parser_usage.add_argument("project_id", help="project id", type=str)
    parser_usage.set_defaults(func=_usage)

    def _mount(args):
        mount(args.project_id)
    parser_usage = subparsers.add_parser('mount', help='mount the filesystem')
    parser_usage.add_argument("project_id", help="project id", type=str)
    parser_usage.set_defaults(func=_mount)

    def _umount(args):
        umount(args.project_id)
    parser_usage = subparsers.add_parser('umount', help='unmount the filesystem')
    parser_usage.add_argument("project_id", help="project id", type=str)
    parser_usage.set_defaults(func=_umount)

    def _send(args):
        if len(args.dest) == 1:
            send_one(project_id=args.project_id, dest=args.dest[0])
        else:
            send_multi(project_id=args.project_id, destinations=args.dest)

    parser_send = subparsers.add_parser('send', help='send latest UTC iso date formated snapshot of project to remote storage servers (this overwrites any changes to the targets)')
    parser_send.add_argument("project_id", help="project id", type=str)
    parser_send.add_argument("dest", help="ip address of destination", type=str, nargs="+")
    parser_send.set_defaults(func=_send)

    def _replicate(args):
        if args.all:
            args.project_id = all_local_project_ids()
        for i, project_id in enumerate(args.project_id):
            log.info("REPLICATE (%s/%s):", i+1, len(args.project_id))
            try:
                replicate(project_id = project_id)
            except Exception, mesg:
                # make errors non-fatal; due to network issues usually; try again later.
                log.warning("Failed to replicate '%s' -- %s", project_id, str(mesg))

    parser_replicate = subparsers.add_parser('replicate', help='replicate project out from here to all its replicas, as defined using consistent hashing')
    parser_replicate.add_argument("project_id", help="project id", type=str, nargs="*")
    parser_replicate.add_argument("--all", help="replicate all locally stored projects", default=False, action="store_const", const=True)

    parser_replicate.set_defaults(func=_replicate)

    def _activity_watcher(args):
        activity_watcher()

    parser_activity = subparsers.add_parser('activity',
                        help='watch the /projects directory, and when any file or path changes, touch the file active_path/project_id.')
    parser_activity.set_defaults(func=_activity_watcher)


    def _replicate_watcher(args):
        replicate_active_watcher(min_time_s = args.min_time_s)
    parser_replicate_watcher = subparsers.add_parser('replicate_watcher',
                        help='watch the active directory (created by ./storage.py --activity), and when projects change snapshot them and replicate them.')
    parser_replicate_watcher.add_argument("--min_time_s", help="min interval between snapshots (default: 120)",
                                  type=int, default=120)
    parser_replicate_watcher.set_defaults(func=_replicate_watcher)


    args = parser.parse_args()

    setup_log(loglevel=args.loglevel, logfile=args.logfile)

    if args.daemon:
        if not args.pidfile:
            raise RuntimeError("in --daemon mode you *must* specify --pidfile")
        import daemon
        daemon.daemonize(args.pidfile)

    args.func(args)

else:
    setup_log()
