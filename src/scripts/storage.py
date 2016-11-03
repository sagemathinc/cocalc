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



# NOTE: I'm very unhappy with the multiprocessing issues "messing up" this code.
# Hence I've basically abandoned it for storage.coffee
# Maybe the multiprocessing.dummy module described here could be used: https://medium.com/p/40e9b2b36148

import argparse, cPickle, hashlib, json, logging, os, sys, time, random
from multiprocessing import Pool, TimeoutError
from uuid import UUID, uuid4
from subprocess import Popen, PIPE
CWD = os.path.split(os.path.realpath(__file__))[0]
sys.path.insert(0, CWD)
from hashring import HashRing

# I'm not sure whether or not local compression is optimal yet.
# It will definitely save money when syncing between google data centers or out, since their
# data transfer rates, per gigabyte, or potentially pretty high.
# We can't rely on tinc for compression since it can't compress encrypted data,
# and we're using scp.  Plus tinc is single threaded.
# Hmm: lz4 is massively faster than everything else, and would be perfect for this, according to
#   http://pokecraft.first-world.info/wiki/Quick_Benchmark:_Gzip_vs_Bzip2_vs_LZMA_vs_XZ_vs_LZ4_vs_LZO
COMPRESS = 'lz4'
if COMPRESS == 'gzip':
    compress1 = '| gzip'
    compress2 = 'gzip -d |'
elif COMPRESS == 'lz4':
    compress1 = '| lz4c - '
    compress2 = 'lz4c -d - |'
elif COMPRESS == '':
    compress1 = ''
    compress2 = ''
else:
    raise RuntimeError("unknown compression '%s'"%COMPRESS)


CACHE_PATH = os.path.join(os.environ['HOME'], 'cache')
if not os.path.exists(CACHE_PATH):
    os.makedirs(CACHE_PATH)

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
        self._topology_file = topology
        self._rep_factor = rep_factor
        self._load()

    def _load(self):
        v = [x for x in open(self._topology_file).readlines() if x.strip() and not x.strip().startswith('#')]
        data = {}
        for x in v:
            ip, vnodes, datacenter = x.split()
            print "UPDATE storage_topology set vnodes=%s where data_center='%s' and host='%s';"%(vnodes, datacenter, ip)
            vnodes = int(vnodes)
            if datacenter not in data:
                data[datacenter] = {}
            dc = data[datacenter]
            dc[ip] = {'vnodes':vnodes}
        import hashring
        self.rings = [(dc, hashring.HashRing(d)) for dc, d in data.iteritems()]
        self.rings.sort()
        self.topology = data

    def __call__(self, key):
        return [(dc, r.range(key, self._rep_factor)) for (dc,r) in self.rings]

    def locations(self, key):
        return sum(self.partitioned_locations(key), [])

    def partitioned_locations(self, key):
        return [r.range(key, self._rep_factor) for (dc,r) in self.rings]

    def locations_by_dc(self, key):
        return dict(self(key))

    def datacenter_of(self, host):
        for d, nodes in self.topology.iteritems():
            if host in nodes:
                return d
        raise RuntimeError("node %s is not in any datacenter"%host)



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

    is_new = not dataset_exists(project_id)

    if new_only and not is_new:
        log.info("skipping %s (%s) since it already exists (and new_only=True)"%(src, project_id))
        return

    projectid = project_id.replace('-','')
    home = path_to_project(project_id)
    dataset = dataset_name(project_id)

    create_dataset(project_id)
    create_user(project_id)

    mount(project_id)

    # rsync data over
    cmd("rsync -Hax --delete --exclude .forever --exclude .bup --exclude .zfs %s/ %s/"%(src, home))

    id = uid(project_id)

    # chown with snapdir visible doesn't work; can cause other problems too.
    cmd("sudo zfs set snapdir=hidden %s"%dataset)
    # chown use numeric id, since username=projectid assigned twice in some cases during transition (for new projects)
    cmd("chown %s:%s -R %s"%(id, id, home))

    # TODO: only snapshot if there are actual changes.
    if is_new:
        snapshot(project_id, force=True)
    else:
        snapshot(project_id)
    cmd("sudo zfs list %s"%dataset)

    umount(project_id)

def mount(project_id):
    cmd('sudo zfs set mountpoint=%s %s'%(path_to_project(project_id), dataset_name(project_id)))

def umount(project_id):
    cmd('sudo zfs set mountpoint=none %s'%dataset_name(project_id))

def quota(project_id, new_quota=''):
    locs    = locations(project_id)
    dataset = dataset_name(project_id)
    if new_quota:
        Pool(processes=len(locs)).map(cmd, ["ssh %s 'sudo zfs set quota=%s %s'"%(host, new_quota, dataset) for host in locs])
        return new_quota
    else:
        try:
            out = cmd('sudo zfs get quota %s'%dataset)
        except RuntimeError:
            out = None
            for host in locs:
                try:
                    out = cmd("ssh %s 'sudo zfs get quota %s'"%(host, dataset))
                    break
                except:
                    pass
            if out is None:
                raise RuntimeError("unable to determine quota of %s"%project_id)
        return out.splitlines()[1].split()[2]

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
    cmd("useradd -u %s -g %s -o -d %s %s"%(id, id, path_to_project(project_id), name))

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
    v = v.strip().splitlines()
    n = len(dataset_name(project_id))
    v = [x[n+1:] for x in v if "Warning" not in x and x.startswith('projects/')]  # eliminate any ssh key warnings.
    v.sort()
    return v


ZFS_CHANGES={'-':'removed', '+':'created', 'M':'modified', 'R':'renamed'}
ZFS_FILE_TYPES={'B':'block device', 'C':'character device', '/':'directory',
                '>':'door', '|':'named pipe', '@':'symbolic link',
                'P':'event port', '=':'socket', 'F':'regular file'}

def status(project_id, long_format=False, exclude_system=True):
    """
    The the files that have changed in the given project since the last snapshot.
    """
    log.debug("new_files: %s", project_id)
    d = dataset_name(project_id)
    home = path_to_project(project_id)
    n = len(home)+1
    c = "sudo zfs diff -H%s `sudo zfs list -r -t snapshot -o name -s creation %s|tail -1` %s"%('Ft' if long_format else '', d, d)
    if exclude_system:
        def exclude(x):
            return x == '' or x.startswith('.forever') or x.startswith('.sagemathcloud')
    else:
        def exclude(x):
            return x != ''
    if long_format:
        v = {}
        for x in cmd(c).splitlines():
            t, action, typ, filename = x.split()
            filename = filename[n:]
            if exclude(filename):
                continue
            v[filename] = {'time':t, 'type':ZFS_FILE_TYPES[typ], 'action':ZFS_CHANGES[action]}
    else:
        v = [f.split()[1][n:] for f in cmd(c).splitlines()]
        v = [f for f in v if not exclude(f)]
    return v

def snapshot(project_id, name='', force=False):
    """
    Create a new snapshot right now with current ISO timestamp at start of name.

    Returns the name of the created snapshot or '' if no snapshot was created.

    If force is False (the default), no snapshot is made if no files have changed
    since the last snapshot, except in .forever and .sagemathcloud, which are ignored.
    Checking this takes (at least a second) hence longer than making a snapshot.
    """
    log.debug("snapshot: %s", project_id)
    if not force:
        if len(status(project_id, long_format=False)) == 0:
            log.debug("no changes -- not snapshotting.")
            return ''
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

def newest_snapshot(project_id, hosts=None, timeout=20):
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
        except RuntimeError, mesg:
            log.info("RuntimeError connecting to destination -- %s", mesg)
            # usually due to not being able to ssh, e.g., host down, so just
            # don't include in the result.
            pass

    return dict(result)


def snapshot_cache_file(host=None):
    if host is None:
        host = ip_address()
    return os.path.abspath(os.path.join(CACHE_PATH, 'snapshots-%s.json'%host))

def update_snapshot_cache(host=None):
    if host is not None:
        cmd("ssh %s './storage.py update_snapshot_cache'"%host)
        return
    cache = snapshot_cache_file()
    t = time.time()
    log.info("Updating the snapshot cache %s...", cache)
    snapshots = {}
    out = cmd('sudo zfs list -r -t snapshot -o name -s creation projects')
    log.info("Got list from ZFS (%s seconds); now parsing and saving...", time.time()-t)
    t = time.time()
    for x in out.splitlines():
        if '@' in x:
            filesystem, snap = x.split('@')
            project_id = filesystem.split('/')[-1]
            if project_id not in snapshots:
                snapshots[project_id] = []
            snapshots[project_id].append(snap)
    j = json.dumps(snapshots)
    open(cache,'w').write(j)
    log.info("Finished parsing and saving snapshot cache (%s seconds)", time.time()-t)

def mp_get_other_snapshot_cache_files(host):
    name = snapshot_cache_file(host)
    cmd("scp %s:%s %s"%(host, name, name))

def get_other_snapshot_cache_files():
    hosts = other_hosts()
    pool  = Pool(processes=len(hosts))
    log.info("Copying all other snapshot cache files to this host.")
    pool.map(mp_get_other_snapshot_cache_files, hosts)

def all_hosts():
    return sum([r[1].nodes for r in multi_hash_ring().rings],[])

def update_all_snapshot_caches():
    hosts = all_hosts()
    pool  = Pool(processes=len(hosts))
    log.info("Updating all snapshot caches on all nodes.  This could take up to about 5-10 minutes.")
    pool.map(update_snapshot_cache, hosts)

def other_hosts():
    v = list(all_hosts())
    v.remove(ip_address())
    return v

def snapshot_cache(host=None):
    return json.loads(open(snapshot_cache_file(host)).read())

def global_newest_snapshots_cache():
    hosts     = all_hosts()
    c = {}
    for host in all_hosts():
        for project_id, snapshots in snapshot_cache(host).iteritems():
            if project_id not in c:
                c[project_id] = {}
            c[project_id][host] = snapshots[-1] if len(snapshots) > 0 else ''
    return c

def work_to_sync(send=True, destroy=False):
    """
    Use the snapshot cache files to determine a work list for this particular
    node that will help bring the cluster into sync.   If this is run in series
    on all nodes, and nothing changes, then the cluster will be in sync.  If
    it run again, then all old data will also be deleted.

    # How to get the number of snaps that need to be sent to a given host.
    w = storage.work_to_sync()
    z = [(h,len([x for x in w if x['dest'] ==h])) for h in storage.all_hosts()]
    """
    hashring  = multi_hash_ring()
    work      = []
    cache     = global_newest_snapshots_cache()
    n = len(cache)
    i = 0
    src = ip_address()
    datacenter = hashring.datacenter_of(src)

    for project_id, newest in cache.iteritems():
        i += 1

        newest_snap = ''
        best_host = ''

        # first figure out what the globally newest known snapshot is
        newest_snap = max([snap for _,snap in newest.iteritems()])

        if newest.get(src, '') != newest_snap:
            # we don't have the newest version on this node, so there's nothing further for us to do for this project.
            continue

        # make a list of (host, base_snap) pairs that definitely need to be updated
        stale_hosts = [(host, newest[host]) for host, snap in newest.iteritems() if snap < newest_snap]

        # also, add to the list each host (as determined by consistent hashing) with no snapshot at all
        for host in hashring.locations(project_id):
            if host not in newest:   # newest is a dictionary from hosts that *have* the project to their version (newest snapshot)
                stale_hosts.append((host,''))


        # Now make the actual work items.
        if send:
            # We take all stale hosts in the same data center as us, and at most one from each of the other data centers
            available_dcs = set(hashring.topology.keys())   # we are still allowed to take a host from these data centers
            for dest, snap in stale_hosts:
                dc = hashring.datacenter_of(dest)
                if dc == datacenter or dc in available_dcs:
                    work.append({'action':'send', 'project_id':project_id, 'src':src, 'dest':dest, 'snap_src':newest_snap, 'snap_dest':snap})
                    if dc != datacenter:
                        available_dcs.remove(dc)   # remember not to take any more hosts from this datacenter

        if destroy and len(stale_hosts) == 0:
            # Never put in any destroy work items if the project hasn't been fully replicated out first,
            # since the actual work is run in parallel, not nec. in order!  The destroys will have to happen
            # in a later pass.
            locs = set(hashring.locations(project_id))
            for h in newest:
                if h not in locs:
                    work.append({'action':'destroy', 'project_id':project_id,  'src':h})

    return work

def _do_sync_work_helper(x):
    log.info("doing sync work: %s", x)
    if x['action'] == 'send':
        send_one(project_id=x['project_id'], dest=x['dest'], force=True,
                 snap_src=x['snap_src'], snap_dest=x['snap_dest'], extra=x['extra'])
    else:
        raise RuntimeError("work action %s not implemented yet"%x['action'])

    return x

def do_local_sync_work(work=None, pool_size=5):
    ip = ip_address()
    work = [x for x in work if x['src'] == ip]
    log.info("local work: %s operations", len(work))
    pool = Pool(processes=pool_size)
    n = len(work)

    i = 1
    for w in work:
        w['extra'] = '-%sof%s-'%(i,n)
        i += 1

    i = 0
    x = pool.imap(_do_sync_work_helper, work)
    while True:
        try:
            i += 1
            a = x.next()
            log.debug("do_sync_work -- (%s/%s): finished %s", i, n, a)
        except StopIteration:
            return

def repair(pool_size=5, update_cache=True):
    log.info("initiated repair")
    if update_cache:
        update_all_snapshot_caches()
        get_other_snapshot_cache_files()
    work = work_to_sync()
    do_local_sync_work(work, pool_size=pool_size)



def dump_to_database(outfile):
    """
    Use the snapshot cache files to write a sequence of statements which can
    be read into cassandra and which will set all the locations and snapshots
    fields in the projects table of the database.
    """
    hashring  = multi_hash_ring()
    hosts     = all_hosts()
    c = {}
    log.info("pass 1 -- locations")
    for host in all_hosts():
        for project_id, snapshots in snapshot_cache(host).iteritems():
            if project_id not in c:
                c[project_id] = {}
            c[project_id][host] = list(reversed(sorted([str(x) for x in snapshots])))

    log.info("pass 2 -- generate the CQL")
    cql = open(outfile,'w')
    i = 0
    def j(obj):
        return json.dumps(obj, separators=(',',':'))
    for project_id, locations in c.iteritems():
        i += 1
        if i % 500 == 0:
            log.info("%s/%s"%(i, len(c)))
        x = str(dict([(k,j(v)) for k,v in locations.iteritems()]))
        cql.write('UPDATE projects SET locations=%s WHERE project_id=%s;\n'%(x, project_id))
    return c



def ip_address(dest='10.1.1.1'):
    # get the ip address that is used to communicate with the given destination
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.connect((dest,80))
    return s.getsockname()[0]


# idea for how to send un-encrypted: http://alblue.bandlem.com/2010/11/moving-data-from-one-zfs-pool-to.html

def send_one(project_id, dest, force=True, snap_src=None, snap_dest=None, extra=''):
    """

    ...
       - extra -- put in the filename, since it can be useful for monitoring.
    """
    log.info("sending %s to %s", project_id, dest)

    if ip_address(dest) == dest:
        log.info("send to self: nothing to do")
        return

    if force:
        force = "-F"
    else:
        force = ''

    dataset = dataset_name(project_id)
    if snap_src is None:
        snap_src  = newest_snapshot(args.project_id)
    if snap_src and '@' not in snap_src:
        snap_src = dataset + '@' + snap_src
    if not snap_src:
        log.warning("send: no local snapshot for '%s'"%project_id)
        return
    if snap_dest is None:
        snap_dest = newest_snapshot(project_id, dest)
    if snap_dest and '@' not in snap_dest:
        snap_dest = dataset + '@' + snap_dest
    log.debug("src: %s, dest: %s", snap_src, snap_dest)

    if snap_src == snap_dest:
        log.info("send %s -- already up to date", project_id)
        return

    t = time.time()

    # NOTE: do not use streams between machines; this leads to horrible locking issues.

    tmp = '/tmp/.storage-%s-%s'%(project_id, uuid4())
    try:
        c = "sudo zfs send -RD %s %s %s  %s  > %s && scp %s %s:%s && rm %s && ssh %s 'cat %s | %s sudo zfs recv %s %s; rm %s'"%(
               '-i' if snap_dest else '', snap_dest, snap_src,  compress1,  tmp,   tmp, dest, tmp,  tmp,
               dest, tmp, compress2, force, dataset, tmp)
        cmd(c)
        log.info("done (time=%s seconds)", time.time()-t)
    finally:
        try:
            os.unlink(tmp)
        except:
            pass

def mp_send_multi_helper(x):
    tmp, dest, force, dataset = x

    c = "scp %s %s:%s && rm %s && ssh %s 'cat %s  | %s sudo zfs recv %s %s; rm %s'"%(
           tmp, dest, tmp, tmp, dest, tmp, compress2, force, dataset, tmp)

    log.info("sending to %s", dest)
    cmd(c)

def send_multi(project_id, destinations, force=True, snap_src=None, timeout=60):
    """
    Send to multiple destinations

    -- timeout - Ignore destinations that don't respond within timeout seconds to the initial
    call for the newest snapshot.
    """
    log.info("sending %s to %s", project_id, destinations)

    dataset = dataset_name(project_id)

    if snap_src is None:
        snap_src  = dataset + '@' + newest_snapshot(project_id)

    if not snap_src:
        log.warning("send: no local snapshot for '%s'"%project_id)
        return

    snap_destinations = newest_snapshot(project_id, hosts=destinations, timeout=timeout)

    log.debug("src: %s, dest: %s", snap_src, snap_destinations)

    for s in set(snap_destinations.itervalues()):
        snap_dest = dataset + '@' + s if s else ''
        _send_multi(project_id, [dest for dest in snap_destinations if snap_destinations[dest] == s],
                    snap_src, snap_dest, timeout, force)

def _send_multi(project_id, destinations, snap_src, snap_dest, timeout, force):
    if snap_dest == snap_src:
        log.debug("no update to %s needed", destinations)
        return

    dataset = dataset_name(project_id)
    t0 = time.time()

    tmp = '/tmp/.storage-%s-%s'%(project_id, uuid4())

    if force:
        force = "-F"
    else:
        force = ''
    try:
        cmd("sudo zfs send -RD %s %s %s  %s > %s"%('-i' if snap_dest else '', snap_dest, snap_src, compress1, tmp))
        diff_size = os.path.getsize(tmp)
        diff_size_mb = diff_size/1000000.0
        send_timeout = 60 + int(diff_size_mb * 2)
        log.info("%sM of data to send (send_timeout=%s seconds)", diff_size_mb, send_timeout)
        work = []
        for dest in destinations:
            if ip_address(dest) == dest:
                log.info("send to self: nothing to do")
            else:
                work.append((tmp, dest, force, dataset))
        if len(work) > 0:
            pool = Pool(processes=len(work))
            x = pool.imap(mp_send_multi_helper, work)
            start = time.time()
            while True:
                try:
                    elapsed_time = time.time() - start
                    t = timeout - elapsed_time
                    if t > 0:
                        x.next(timeout = t)
                    else:
                        raise TimeoutError("ran out of time before next fetch")
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
    log.info("done (time=%s seconds)", time.time()-t0)

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
    return ring.locations(project_id)

def replicate(project_id, snap_src=None):
    destinations = locations(project_id)
    log.info("replicating %s out to %s", project_id, destinations)
    send_multi(project_id, destinations, snap_src=snap_src)

def replicate_many(project_ids, pool_size=1):
    # NOTE pool_size > 1 seems to not work due to multiprocessing misery.
    pids = {}
    random.shuffle(project_ids)
    i = 0; n = len(project_ids)
    try:
        while len(project_ids) > 0 or len(pids)>0:
            # get more work, if necessary and available
            while len(pids) < pool_size and len(project_ids) > 0:
                project_id = project_ids.pop()
                try:
                    i += 1
                    log.info("REPLICATE (%s/%s):", i, n)
                    if pool_size > 1:
                        pid = os.fork()
                        if pid:
                            log.debug("FORKED %s to handle %s"%(pid, project_id))
                            pids[pid] = project_id
                        else:
                            # child
                            try:
                                replicate(project_id = project_id)
                            except Exception, mesg:
                                # make errors non-fatal; due to network issues usually; try again later.
                                log.warning("Failed to replicate '%s' -- %s"%(project_id, str(mesg)))
                            return
                    else:
                        try:
                            replicate(project_id = project_id)
                        except Exception, mesg:
                            # make errors non-fatal; due to network issues usually; try again later.
                            log.warning("Failed to replicate '%s' -- %s"%(project_id, str(mesg)))
                except OSError, mesg:
                    log.warning("ERROR: forking to handle %s failed -- %s"%(project_id, mesg))
            if pids:
                log.debug("checking on %s", pids)
                for pid in dict(pids):
                    if os.waitpid(pid, os.WNOHANG) != (0,0):
                        log.debug("%s finished", pid)
                        del pids[pid]
            time.sleep(1)
    finally:
        # send kill signals to any outstanding subprocesses
        for pid in pids:
            try:
                os.kill(pid, 9)
            except OSError:
                pass



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
    pids = {}
    while True:
        if os.path.exists(active_path):
            for project_id in os.listdir(active_path):
                now = time.time()
                if pids.get(project_id, False) or last_attempt.get(project_id, 0) + min_time_s >= now:
                    continue
                last_attempt[project_id] = now
                f = os.path.join(active_path, project_id)
                try:
                    pid = os.fork()
                    if pid:
                        log.debug("FORKED %s to handle %s"%(pid, project_id))
                        pids[pid] = project_id
                    else:
                        # child
                        try:
                            # we unlink at the beginning so that if it changes again before we're done,
                            # then it'll get snapshotted again in the future
                            os.unlink(f)
                            name = snapshot(project_id)
                            replicate(project_id, snap_src=name)
                        except Exception, mesg:
                            open(f,'w')  # create file, so that snapshot & replicate will be attempted again soon.
                            log.warning("ERROR: replicate_active_watcher %s -- %s"%(project_id, mesg))
                        return
                except OSError, mesg:
                    log.warning("ERROR: forking to handle %s failed -- %s", project_id, mesg)
        if pids:
            log.debug("checking on %s", pids)
            for pid in dict(pids):
                if os.waitpid(pid, os.WNOHANG) != (0,0):
                    del pids[pid]
        time.sleep(1)



if __name__ == "__main__":

    parser = argparse.ArgumentParser(description="ZFS based project storage")
    parser.add_argument("--loglevel", dest='loglevel', type=str, default='INFO',
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
        name = snapshot(project_id=args.project_id, name=args.name)
        print_json({'project_id':args.project_id, 'snapshot':name})


    parser_snapshot = subparsers.add_parser('snapshot', help='make a new snapshot of the given project; if only files in ~/.forever and ~/.sagemathcloud change, no snapshot is created')
    parser_snapshot.add_argument("project_id", help="project id", type=str)
    parser_snapshot.add_argument("name", help="appended to end of snapshot timestamp", type=str, default='', nargs='?')
    parser_snapshot.set_defaults(func=_snapshot)

    def _status(args):
        print_json(status(project_id=args.project_id, long_format=args.long))

    parser_status = subparsers.add_parser('status', help='the files that have been modified/changed/created since the last snapshot (JSON format)')
    parser_status.add_argument("--long", help="instead output dictionary {filename:{time:?,type:?,action:?},....}", default=False, action="store_const", const=True)
    parser_status.add_argument("project_id", help="project id", type=str)
    parser_status.set_defaults(func=_status)

    def _snapshots(args):
        print_json({'project_id':args.project_id, 'snapshots':list_snapshots(project_id=args.project_id, host=args.host)})

    parser_snapshots = subparsers.add_parser('snapshots', help='list in order the snapshots of the given project')
    parser_snapshots.add_argument("project_id", help="project id", type=str)
    parser_snapshots.add_argument("host", help="ip address of host (default: ''=localhost)", type=str, default='', nargs='?')
    parser_snapshots.set_defaults(func=_snapshots)

    def _update_snapshot_cache(args):
        if args.all:
            try:
                update_all_snapshot_caches()
            except:
                pass
            get_other_snapshot_cache_files()
        else:
            update_snapshot_cache()
    parser_snapshots_cache = subparsers.add_parser('update_snapshot_cache', help='regenerate the file ~/cache/snapshots-ip_address.json (on unloaded system, takes about 5 seconds per 1000 projects)')
    parser_snapshots_cache.add_argument("--all", help="update snapshot caches on every node in the cluster and copy the caches back to this host (doesn't copy them to every host)", default=False, action="store_const", const=True)
    parser_snapshots_cache.set_defaults(func=_update_snapshot_cache)

    def _repair(args):
        repair(pool_size = args.pool_size, update_cache=not args.no_cache_update)
    parser_repair = subparsers.add_parser('repair', help='Push out any projects that needs to be pushed out (from here, to at least one node in each data center), and if safe, also deletes projects that no longer need to be here.  Run this one at a time on each machine. ')
    parser_repair.add_argument("--pool_size", dest='pool_size', type=int, default=6, help="number of projects to simultaneously replicate; this has a major impact on the load repair puts on a machine; (default: 6)")
    parser_repair.add_argument("--no_cache_update", help="do not update the cache", default=False, action="store_const", const=True)

    parser_repair.set_defaults(func=_repair)

    def _newest_snapshot0(args):
        v = newest_snapshot(project_id=args.project_id, hosts=locations(args.project_id), timeout=args.timeout)
        print_json({'project_id':args.project_id, 'newest_snapshots':v})

    parser_newest_snapshot = subparsers.add_parser('newest_snapshot', help='output json object giving newest snapshot on each available host')
    parser_newest_snapshot.add_argument("project_id", help="project id", type=str)
    parser_newest_snapshot.add_argument("--timeout", dest='timeout', type=int, default=60, help="timeout to declare host not available")
    parser_newest_snapshot.set_defaults(func=_newest_snapshot0)

    def _usage(args):
        print_json({'project_id':args.project_id, 'usage':usage(args.project_id)})

    parser_usage = subparsers.add_parser('usage', help='disk usage information about the project')
    parser_usage.add_argument("project_id", help="project id", type=str)
    parser_usage.set_defaults(func=_usage)

    def _mount(args):
        mount(args.project_id)
    parser_mount = subparsers.add_parser('mount', help='mount the filesystem')
    parser_mount.add_argument("project_id", help="project id", type=str)
    parser_mount.set_defaults(func=_mount)

    def _umount(args):
        umount(args.project_id)
    parser_umount = subparsers.add_parser('umount', help='unmount the filesystem')
    parser_umount.add_argument("project_id", help="project id", type=str)
    parser_umount.set_defaults(func=_umount)

    def _quota(args):
        q = quota(project_id=args.project_id, new_quota=args.new_quota)
        print_json({'project_id':args.project_id, 'quota':q})
    parser_quota = subparsers.add_parser('quota', help='get or set the quota for a project')
    parser_quota.add_argument("project_id", help="project id", type=str)
    parser_quota.add_argument("--set", dest='new_quota', type=str, default='', help="if given set the quota to this value (e.g., 10G)")
    parser_quota.set_defaults(func=_quota)

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
        replicate_many(args.project_id, pool_size=args.pool_size)

    parser_replicate = subparsers.add_parser('replicate', help='replicate project out from here to all its replicas, as defined using consistent hashing')
    parser_replicate.add_argument("project_id", help="project id", type=str, nargs="*")
    parser_replicate.add_argument("--pool_size", dest='pool_size', type=int, default=1, help="number of projects to replicate out at once (this doesn't work very well due to multiprocessing misery!!)")
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

