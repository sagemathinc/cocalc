#!/usr/bin/env python2

import os
os.chdir(os.path.split(os.path.realpath(__file__))[0])
import gen_conf

public_hosts = ["web%s" % n for n in range(3)]

hacfg = "haproxy.cfg"

os.system("mkdir -p bkb")


def create(host = ''):
    bkbfn = "bkb/haproxy-%s.cfg" % host
    # generate the configuration file
    gen_conf.gen_haproxy(host)
    if os.path.exists(bkbfn):
        if open(hacfg).read() == open(bkbfn).read():
            # identical files, no need to update to targets
            return False
    # since it changed, make backup for the next time
    os.system("cp -a haproxy.cfg %s" % bkbfn)
    return True


def push_conf(mode):
    assert mode in ['public', 'private']

    if mode == "public":
        # These are the web servers that are visible externally -- they also run haproxy
        # and load balance between all web servers.
        TARGETS = public_hosts

    elif mode == "private":
        TARGETS = [x for x in gen_conf.web_hosts() if x not in public_hosts]

    # Now push out the haproxy script to the externally visible web servers
    for host in TARGETS:
        if (mode == "public" and create()) or (mode == "private" and create(host)):
            os.system("scp %s %s:/tmp/" % (hacfg, host))
            os.system("ssh %s 'sudo mv /tmp/%s /etc/haproxy/'" % (hacfg, host))
            os.system("ssh %s 'sudo service haproxy reload'" % host)

if __name__ == "__main__":
    push_conf('public')
    push_conf('private')
