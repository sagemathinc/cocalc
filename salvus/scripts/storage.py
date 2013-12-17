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
    _users = set([x.split(":")[0].strip() for x in open("/etc/passwd").readlines()])
    return _users

def path_to_project(project_id):
    return os.path.join('/projects', project_id)

def migrate_project_to_storage(src, new_only):
    info_json = os.path.join(src, '.sagemathcloud', 'info.json')
    if not os.path.exists(info_json):
        log.debug("skipping since %s does not exist"%info_json)
        return

    project_id = json.loads(open(info_json).read())['project_id']
    projectid = project_id.replace('-','')
    home = path_to_project(project_id)
    dataset = home.lstrip('/')
    if new_only and os.path.exists(home):
        log.info("skipping %s (%s) since it already exists (and new_only=True)"%(src, project_id))
        return
    if not os.path.exists(home):
        create_dataset(project_id)

    # rsync data over
    cmd("rsync -Hax --delete --exclude .forever --exclude .bup --exclude .zfs %s/ %s/"%(src, home))
    id = uid(project_id)
    cmd("chown %s:%s -R /%s"%(id, id, home))
    cmd("zfs snapshot %s@%s"%(dataset, time.strftime('%Y-%m-%dT%H:%M:%S')))
    cmd("zfs list %s"%dataset)

def create_dataset(project_id):
    check_uuid(project_id)
    id = uid(project_id)
    home = path_to_project(project_id)
    dataset = home.lstrip('/')
    cmd('zfs create %s'%dataset)
    cmd('zfs set snapdir=visible %s'%dataset)
    cmd('zfs set quota=10G %s'%dataset)
    projectid = project_id.replace('-','')
    # the -o makes it so in the incredibly unlikely event of a collision, no big deal.
    if projectid not in users():
        cmd("groupadd -g %s -o %s"%(id, projectid))
        cmd("useradd -u %s -g %s -o -d %s  %s"%(id, id, home, projectid))

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
    parser.add_argument("--loglevel", dest='loglevel', type=str, default='INFO',
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



    args = parser.parse_args()

    setup_log(loglevel=args.loglevel, logfile=args.logfile)

    args.func(args)

else:
    setup_log()
