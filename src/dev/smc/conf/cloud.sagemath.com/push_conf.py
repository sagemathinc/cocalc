#!/usr/bin/env python2

def push_conf():
    # These are the web servers that are visible externally -- they also run haproxy
    # and load balance between all web servers.
    TARGETS = ["web%s"%n for n in range(3)]

    # First update our local haproxy.cfg file
    import gen_conf
    gen_conf.gen_haproxy()

    # Now push out the haproxy script to the externally visible web servers
    import os
    for t in TARGETS:
        os.system("scp haproxy.cfg %s:/tmp/"%t)
        os.system("ssh %s 'sudo mv /tmp/haproxy.cfg /var/haproxy/'"%t)


if __name__ == "__main__":
    push_conf()