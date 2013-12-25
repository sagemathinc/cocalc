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

def create_user(project_id):
    """
    Create the user the contains the given project data.   It is safe to
    call this function even if the user already exists.
    """
    name = project_id.replace('-','')
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
    cmd("useradd -u %s -g %s -o -d %s %s"%(id, id, os.path.join('/projects', project_id), name))

    # Save account info so it persists through reboots/upgrades/etc. that replaces the ephemeral root fs.
    if os.path.exists("/mnt/home/etc/"): # UW nodes
        cmd("cp /etc/passwd /etc/shadow /etc/group /mnt/home/etc/")
    if os.path.exists("/mnt/conf/etc/"): # GCE nodes
        cmd("cp /etc/passwd /etc/shadow /etc/group /mnt/conf/etc/")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="create project user")
    parser.add_argument("project_id", help="the uuid of the project", type=str)
    args = parser.parse_args()
    create_user(args.project_id)


