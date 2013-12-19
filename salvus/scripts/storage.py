#!/usr/bin/env python

import argparse, cPickle, hashlib, json, logging, os, sys, time, random
from uuid import UUID, uuid4
from subprocess import Popen, PIPE

def print_json(s):
    print json.dumps(s, separators=(',',':'))


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

def cmd(s, exception_on_error=True):
    log.debug(s)
    t = time.time()
    out = Popen(s, stdin=PIPE, stdout=PIPE, stderr=PIPE, shell=not isinstance(s, list))
    e = out.wait()
    x = out.stdout.read() + out.stderr.read()
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

    cmd("zfs set snapdir=hidden %s"%dataset)
    cmd("chown %s. -R /%s"%(projectid, home))   # chown with snapdir visible doesn't work; can cause other problems too.

    snapshot(project_id)
    cmd("zfs list %s"%dataset)

    umount(project_id)

def mount(project_id):
    cmd('zfs set mountpoint=%s %s'%(path_to_project(project_id), dataset_name(project_id)))

def umount(project_id):
    cmd('zfs set mountpoint=none %s'%dataset_name(project_id))

def create_dataset(project_id):
    """
    Create the dataset the contains the given project data.   It is safe to
    call this function even if the dataset already exists.
    """
    if dataset_exists(project_id):
        return
    dataset = dataset_name(project_id)
    home = path_to_project(project_id)
    cmd('zfs create %s'%dataset)
    cmd('zfs set snapdir=hidden %s'%dataset)
    cmd('zfs set quota=10G %s'%dataset)

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

def list_snapshots(project_id, host=''):
    """
    Return sorted list of snapshots of the given project available on the given host.

    This is very fast if host=None, and the cost of ssh if host isn't.
    """
    c = "sudo zfs list -r -t snapshot -o name -s creation %s"%dataset_name(project_id)
    try:
        if not host:
            v = cmd(c)
        else:
            v = cmd('ssh %s %s'%(host, c))
    except RuntimeError, msg:
        if 'No such file or directory' in str(msg):
            # project isn't available here
            return []
        raise # something else went wrong
    v = v.strip().split()
    v.sort()
    return v

def snapshot(project_id, name=''):
    """
    Create a new snapshot right now with current ISO timestamp at start of name.
    """
    cmd("sudo zfs snapshot %s@%s%s"%(dataset_name(project_id), time.strftime('%Y-%m-%dT%H:%M:%S'), name))

def newest_snapshot(project_id, host=''):
    """
    Return most recent snapshot or empty string if none.
    If host is given, does this on a remote host.

    We *assume* snapshots start with an ISO-formatted name!!!
    You can put anything after the name.
    """
    v = list_snapshots(project_id=project_id, host=host)
    if len(v) == 0:
        return ''
    else:
        return v[-1]


def send_one(project_id, dest):
    log.info("sending %s to %s", project_id, dest)

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
    c = "sudo zfs send -RD %s %s %s | gzip | ssh %s 'gzip -d | sudo zfs recv -F %s'"%('-i' if snap_dest else '', snap_dest, snap_src, dest, dataset)
    cmd(c)
    log.info("done (time=%s seconds)", time.time()-t)

def send_multi(project_id, destinations):
    # Send to multiple destinations
    log.info("sending %s to %s", project_id, destinations)

    snap_src  = newest_snapshot(args.project_id)
    if not snap_src:
        log.warning("send: no local snapshot for '%s'"%project_id)
        return

    snap_dest = [newest_snapshot(project_id, dest) for dest in destinations]
    snap_dest.sort()
    snap_dest = snap_dest[0]  # oldest -- worst case

    log.debug("src: %s, dest: %s", snap_src, snap_dest)

    if snap_src == snap_dest:
        log.info("send %s -- all targets are already up to date", project_id)
        return

    dataset = dataset_name(project_id)
    t = time.time()
    tmp = '/tmp/%s.gz'%uuid4()
    try:
        cmd("sudo zfs send -RD %s %s %s | gzip > %s"%('-i' if snap_dest else '', tmp))
        for dest in destinations:
            cmd("cat %s | ssh %s 'gzip -d | sudo zfs recv -F %s'"%(tmp, snap_dest, snap_src, dest, dataset))
    finally:
        try:
            os.unlink(tmp)
        except:
            pass
    log.info("done (time=%s seconds)", time.time()-t)


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

    parser = argparse.ArgumentParser(description="ZFS based project storage")
    parser.add_argument("--loglevel", dest='loglevel', type=str, default='DEBUG',
                           help="log level: useful options include INFO, WARNING and DEBUG")
    parser.add_argument("--logfile", dest="logfile", type=str, default='',
                        help="store log in this file (default: '' = don't log to a file)")

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

    def _send(args):
        if len(args.dest) == 1:
            send_one(project_id=args.project_id, dest=args.dest[0])
        else:
            send_multi(project_id=args.project_id, dest=args.dest)

    parser_send = subparsers.add_parser('send', help='send latest UTC iso date formated snapshot of project to remote storage servers (this overwrites any changes to the targets)')
    parser_send.add_argument("project_id", help="project id", type=str)
    parser_send.add_argument("dest", help="ip address of destination", type=str, nargs="+")
    parser_send.set_defaults(func=_send)

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


    args = parser.parse_args()

    setup_log(loglevel=args.loglevel, logfile=args.logfile)

    args.func(args)

else:
    setup_log()
