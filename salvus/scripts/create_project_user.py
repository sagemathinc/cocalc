#!/usr/bin/env python
"""
Create a user corresponding to a given project_id.

    create_storage_user.py [project-id]

You should put the following in visudo:

            salvus ALL=(ALL)   NOPASSWD:  /usr/local/bin/create_project_user.py *

"""

import argparse, hashlib, os
from subprocess import Popen, PIPE

def uid(uuid):
    # We take the sha-512 of the uuid just to make it harder to force a collision.  Thus even if a
    # user could somehow generate an account id of their choosing, this wouldn't help them get the
    # same uid as another user.
    #
    # 2^32-2=max uid, as keith determined by a program + experimentation.
    n = hash(hashlib.sha512(uuid).digest()) % (4294967294-1000)
    return n + 1001

def cmd(s):
    out = Popen(s, stdin=PIPE, stdout=PIPE, stderr=PIPE, shell=not isinstance(s, list))
    x = out.stdout.read() + out.stderr.read()
    e = out.wait()
    if e:
        raise RuntimeError(x)
    return x

def home(project_id):
    return os.path.join('/projects', project_id)

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
        cmd("userdel %s"%name)  # this also deletes the group

    # Now make the correct user.  The -o makes it so in the incredibly unlikely
    # event of a collision, no big deal.
    cmd("groupadd -g %s -o %s"%(id, name))
    cmd("useradd -u %s -g %s -o -d %s %s"%(id, id, home(project_id), name))

    # Save account info so it persists through reboots/upgrades/etc. that replaces the ephemeral root fs.
    if os.path.exists("/mnt/home/etc/"): # UW nodes
        cmd("cp /etc/passwd /etc/shadow /etc/group /mnt/home/etc/")
    if os.path.exists("/mnt/conf/etc/"): # GCE nodes
        cmd("cp /etc/passwd /etc/shadow /etc/group /mnt/conf/etc/")

def ensure_ssh_access(project_id):
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
    os.system("pkill -u %s"%uid(project_id))

def copy_skeleton(project_id):
    h = home(project_id)
    u = username(project_id)
    if not os.path.exists(h):
        raise RuntimeError("home directory %s doesn't exist"%h)
    os.system("rsync -axvH --update /home/salvus/salvus/salvus/scripts/skel/ %s/"%h)  # update so we don't overwrite newer versions
    os.system("chown -R %s. %s"%(u, h))

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Project user control script")
    parser.add_argument("--kill", help="kill all processes owned by the user", default=False, action="store_const", const=True)
    parser.add_argument("--skel", help="rsync /home/salvus/salvus/salvus/scripts/skel/ to the home directory of the project", default=False, action="store_const", const=True)
    parser.add_argument("--create", help="create the project user", default=False, action="store_const", const=True)
    parser.add_argument("project_id", help="the uuid of the project", type=str)
    args = parser.parse_args()
    if args.create:
        create_user(args.project_id)
        ensure_ssh_access(args.project_id)
    if args.skel:
        copy_skeleton(args.project_id)
    if args.kill:
        killall_user(args.project_id)


