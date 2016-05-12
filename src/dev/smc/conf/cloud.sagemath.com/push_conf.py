#!/usr/bin/env python2

import os
os.chdir(os.path.split(os.path.realpath(__file__))[0])

public_hosts = ["web%s"%n for n in range(3)]

def push_conf_public():
    # These are the web servers that are visible externally -- they also run haproxy
    # and load balance between all web servers.
    TARGETS = public_hosts

    # First update our local haproxy.cfg file
    import gen_conf
    gen_conf.gen_haproxy()

    # Now push out the haproxy script to the externally visible web servers
    for t in TARGETS:
        os.system("scp haproxy.cfg %s:/tmp/"%t)
        os.system("ssh %s 'sudo mv /tmp/haproxy.cfg /etc/haproxy/'"%t)
        os.system("ssh %s 'sudo service haproxy reload'"%t)

def push_conf_private():
    import gen_conf

    TARGETS = [x for x in gen_conf.web_hosts() if x not in public_hosts]

    for host in TARGETS:
        # First update our local haproxy.cfg file
        gen_conf.gen_haproxy(host)
        os.system("scp haproxy.cfg %s:/tmp/"%host)
        os.system("ssh %s 'sudo mv /tmp/haproxy.cfg /etc/haproxy/'"%host)
        os.system("ssh %s 'sudo service haproxy reload'"%host)


if __name__ == "__main__":
    push_conf_public()
    push_conf_private()
