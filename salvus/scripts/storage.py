#!/usr/bin/env python

import argparse, cPickle, hashlib, json, logging, os, sys, time, random
from uuid import UUID
from subprocess import Popen, PIPE


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
    return os.path.join('/projects', project_id)

def dataset_name(project_id):
    return 'projects/%s'%project_id

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
    if not os.path.exists(home):
        create_dataset(project_id)
    create_user(project_id)

    # rsync data over
    cmd("rsync -Hax --delete --exclude .forever --exclude .bup --exclude .zfs %s/ %s/"%(src, home))
    id = uid(project_id)

    cmd("zfs set snapdir=hidden %s"%dataset)
    cmd("chown %s. -R /%s"%(projectid, home))   # chown with snapdir visible doesn't work; can cause other problems too.

    cmd("zfs snapshot %s@%s"%(dataset, time.strftime('%Y-%m-%dT%H:%M:%S')))
    cmd("zfs list %s"%dataset)

def create_dataset(project_id):
    check_uuid(project_id)
    home = path_to_project(project_id)
    dataset = home.lstrip('/')
    cmd('zfs create %s'%dataset)
    cmd('zfs set snapdir=visible %s'%dataset)
    cmd('zfs set quota=10G %s'%dataset)

def create_user(project_id): # safe to call repeatedly even if user exists
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


def send(project_id, dest):
    log.info("sending %s to %s", project_id, dest)
    dataset = dataset_name(project_id)

    v = cmd("/bin/ls -t " + os.path.join(path_to_project(project_id), '.zfs', 'snapshot')).split()
    if len(v) == 0:
        log.warning("no snapshots of %s", project_id)
        return
    s = v[-1]  # most recent snapshot
    t = time.time()
    c = "zfs send -RD %s@%s | ssh %s zfs recv -F %s"%(dataset, s, dest, dataset)
    print c
    os.system(c)
    log.info("sent -- time=%s seconds", time.time()-t)


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

    def send_projects(args):
        for project_id in args.project_id:
            send(project_id=project_id, dest=args.dest)

    parser_send = subparsers.add_parser('send', help='send project(s) to remote compute vm using ZFS replication; this overwrites any data in the targets, so be careful!')
    parser_send.add_argument("dest", help="ip address of destination", type=str)
    parser_send.add_argument("project_id", help="project id", type=str, nargs="+")
    parser_send.set_defaults(func=send_projects)

    args = parser.parse_args()

    setup_log(loglevel=args.loglevel, logfile=args.logfile)

    args.func(args)

else:
    setup_log()
