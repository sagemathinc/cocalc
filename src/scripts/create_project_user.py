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


"""
Create a user corresponding to a given project_id.

    create_storage_user.py [project-id]

You should put the following in visudo:

            salvus ALL=(ALL)   NOPASSWD:  /usr/local/bin/create_project_user.py *

"""

import argparse, hashlib, os, random, time
from subprocess import Popen, PIPE

def uid(uuid):
    # We take the sha-512 of the uuid just to make it harder to force a collision.  Thus even if a
    # user could somehow generate an account id of their choosing, this wouldn't help them get the
    # same uid as another user.
    # 2^32-2=max uid, as keith determined by a program + experimentation.
    n = hash(hashlib.sha512(uuid).digest()) % (4294967294-1000)
    return n + 1001

def cmd(s):
    out = Popen(s, stdin=PIPE, stdout=PIPE, stderr=PIPE, shell=not isinstance(s, list))
    x = out.stdout.read() + out.stderr.read()
    e = out.wait()
    if e:
        raise RuntimeError(s+x)
    return x

def home(project_id):
    return os.path.join('/projects', project_id)

def zfs_home_is_mounted(project_id):
    h = home(project_id)
    if not os.path.exists(os.path.join(h, '.zfs')):
        raise RuntimeError("ZFS filesystem %s is not mounted"%h[1:])

def username(project_id):
    return project_id.replace('-','')

def create_user(project_id):
    """
    Create the user the contains the given project data.   It is safe to
    call this function even if the user already exists.
    """
    name = username(project_id)
    id = uid(project_id)
    r = open('/etc/passwd').read()
    i = r.find(name)
    if i != -1:
        r = r[i:]
        i = r.find('\n')
        u = int(r[:i].split(':')[2])
    else:
        u = 0
    if u == id:
        # user already exists and has correct id
        return
    if u != 0:
        # there's the username but with wrong id
        ##  during migration deleting that user would be a disaster!
        raise RuntimeError("user %s already exists but with wrong id"%name)
        #cmd("userdel %s"%name)  # this also deletes the group

    # Now make the correct user.  The -o makes it so in the incredibly unlikely
    # event of a collision, no big deal.
    c = "groupadd -g %s -o %s"%(id, name)
    for i in range(3):
        try:
            cmd(c)
            break
        except:
            time.sleep(random.random())

    # minimal attemp to avoid locking issues
    c = "useradd -u %s -g %s -o -d %s %s"%(id, id, home(project_id), name)
    for i in range(3):
        try:
            cmd(c)
            break
        except:
            time.sleep(random.random())


    # Save account info so it persists through reboots/upgrades/etc. that replaces the ephemeral root fs.
    if os.path.exists("/mnt/home/etc/"): # UW nodes
        cmd("cp /etc/passwd /etc/shadow /etc/group /mnt/home/etc/")
    if os.path.exists("/mnt/conf/etc/"): # GCE nodes
        cmd("cp /etc/passwd /etc/shadow /etc/group /mnt/conf/etc/")

def chown_all(project_id):
    zfs_home_is_mounted(project_id)
    cmd("zfs set snapdir=hidden %s"%home(project_id).lstrip('/'))  # needed for historical reasons
    id = uid(project_id)
    cmd('chown %s:%s -R %s'%(id, id, home(project_id)))

def write_info_json(project_id, host='', base_url=''):
    zfs_home_is_mounted(project_id)
    if not host:
        import socket
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('10.1.1.1',80))
        host = s.getsockname()[0]

    path = os.path.join(home(project_id), '.sagemathcloud' + ('-local' if base_url else ''))
    info_json = os.path.join(path, 'info.json')
    if not os.path.exists(path):
        os.makedirs(path)
    obj = {"project_id":project_id,"location":{"host":host,"username":username(project_id),"port":22,"path":"."},"base_url":base_url}
    import json
    open(info_json,'w').write(json.dumps(obj, separators=(',',':')))

def ensure_ssh_access(project_id):
    zfs_home_is_mounted(project_id)
    # If possible, make some attempts to ensure ssh access to this account.
    h = home(project_id)
    if not os.path.exists(h):
        # there is nothing we can possibly do yet -- filesystem not mounted
        return
    ssh_path = os.path.join(h, '.ssh')
    authorized_keys2 = os.path.join(ssh_path, 'authorized_keys2')
    public_key = open('/home/salvus/.ssh/id_rsa.pub').read().strip()
    add_public_key = '\n#Added by SageMath Cloud\n' + public_key + '\n'
    if not os.path.exists(ssh_path):
        os.makedirs(ssh_path)
    if not os.path.exists(authorized_keys2):
        open(authorized_keys2,'w').write(add_public_key)
    elif public_key not in open(authorized_keys2).read():
        open(authorized_keys2,'a').write(add_public_key)
    os.system('chown -R %s. %s'%(username(project_id), ssh_path))
    os.system('chmod og-rwx -R %s'%ssh_path)

def killall_user(project_id):
    u = uid(project_id)
    os.system("pkill -u %s; sleep 1; pkill -9 -u %s; killall -u %s"%(u,u,username(project_id)))

def umount_user_home(project_id):
    os.system("umount %s"%home(project_id))

def copy_skeleton(project_id):
    zfs_home_is_mounted(project_id)
    h = home(project_id)
    u = username(project_id)
    if not os.path.exists(h):
        raise RuntimeError("home directory %s doesn't exist"%h)

    os.system("rsync -axH --update /home/salvus/salvus/salvus/scripts/skel/ %s/"%h)  # update so we don't overwrite newer versions
    # TODO: must fix this -- it could overwrite a user bash or ssh stuff.  BAD.
    cmd("chown -R %s. %s/.sagemathcloud/ %s/.ssh %s/.bashrc"%(u, h, h, h))
    cmd("chown %s. %s"%(u, h))

def cgroup(project_id, cpu=1024, memory='8G'):
    """
    Create a cgroup for the given project, and ensure all of the project's processes are in the cgroup.

    INPUT:

       - project_id -- uuid of the project
       - cpu -- (default: 1024) total number of cpu.shares allocated to this project (across all processes)
       - memory -- (default: '8G') total amount of RAM allocated to this project (across all processes)
    """
    if not os.path.exists('/sys/fs/cgroup/memory'):
   
        # do nothing on platforms where cgroups isn't supported (GCE right now, I'm looking at you.)
        return
    uname = username(project_id)
    shares=100000
    if os.path.exists('/projects/%s/coin'%project_id):
        shares = 1000
    if os.path.exists('/projects/%s/minerd'%project_id):
        shares = 1000
    if os.path.exists('/projects/%s/sh'%project_id):
        shares = 1000
    cmd("cgcreate -g memory,cpu:%s"%uname)
    cmd('echo "%s" > /sys/fs/cgroup/memory/%s/memory.limit_in_bytes'%(memory, uname))
    cmd('echo "%s" > /sys/fs/cgroup/cpu/%s/cpu.shares'%(cpu, uname))
    cmd('echo "%s" > /sys/fs/cgroup/cpu/%s/cpu.cfs_quota_us'%(shares, uname))
    z = "\n%s  cpu,memory  %s\n"%(uname, uname)
    cur = open("/etc/cgrules.conf").read()
    if z not in cur:
        open("/etc/cgrules.conf",'a').write(z)
    cmd('service cgred restart')
    try:
        pids = cmd("ps -o pid -u %s"%uname).split()[1:]
    except RuntimeError:
        # ps returns an error code if there are NO processes at all (a common condition).
        pids = []
    if pids:
        try:
            cmd("cgclassify %s"%(' '.join(pids)))
            # ignore cgclassify errors, since processes come and go, etc.
        except RuntimeError:
            pass

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Project user control script")
    parser.add_argument("--kill", help="kill all processes owned by the user", default=False, action="store_const", const=True)
    parser.add_argument("--umount", help="run umount on the project's home as root", default=False, action="store_const", const=True)
    parser.add_argument("--skel", help="rsync /home/salvus/salvus/salvus/scripts/skel/ to the home directory of the project", default=False, action="store_const", const=True)
    parser.add_argument("--create", help="create the project user", default=False, action="store_const", const=True)
    parser.add_argument("--base_url", help="the base url (default:'')", default="", type=str)
    parser.add_argument("--host", help="the host ip address on the tinc vpn (default: auto-detect)", default="", type=str)
    parser.add_argument("--chown", help="chown all the files in /projects/projectid", default=False, action="store_const", const=True)
    parser.add_argument("--cgroup", help="put project in given control group (format: --cgroup=cpu:1024,memory:10G)", default="", type=str)
    parser.add_argument("project_id", help="the uuid of the project", type=str)
    args = parser.parse_args()
    if args.create:
        create_user(args.project_id)
        write_info_json(project_id=args.project_id, host=args.host, base_url=args.base_url)
        ensure_ssh_access(args.project_id)
    if args.skel:
        copy_skeleton(args.project_id)
    if args.kill:
        killall_user(args.project_id)
    if args.umount:
        umount_user_home(args.project_id)
    if args.chown:
        chown_all(args.project_id)
    if args.cgroup:
        kwds = dict([x.split(':') for x in args.cgroup.split(',')])
        cgroup(args.project_id, **kwds)


