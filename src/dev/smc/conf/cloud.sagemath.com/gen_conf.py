#!/usr/bin/env python2
"""
Determine which hosts web[n] exist, i.e., for which DNS resolves web[n], for n=0,1,2, etc.

Then read the file 'haproxy.cfg.template' and make an uncommented copy of all the web0 lines
but for all the web[n] hosts that exist.

(c) William Stein, 2016
"""

import os

def host_exists(hostname):
    """
    Return true if and only if hostname resolves and is pingable.
    """
    return os.system("ping -c 1 -W 1 '%s' 2>/dev/null 1>/dev/null"%hostname) == 0

def web_hosts(bound=20):
    """
    Return all web hosts of the form web[n] that exists for n<bound.
    """
    return ["web%s"%n for n in range(bound) if host_exists("web%s"%n)]

def gen_haproxy():
    hosts = web_hosts()
    v = []
    for x in open('haproxy.cfg.template').xreadlines():
        if 'web0' in x:
            # generate version of x with leading # deleted and web0 replaced by each web hostname
            i = x.find('#')
            t = x[:i] + x[i+1:]
            for h in hosts:
                v.append(t.replace('web0', h))
        else:
            v.append(x)
    # write out our new haproxy config file
    open('haproxy.cfg','w').write(''.join(v))

if __name__ == "__main__":
    gen_haproxy()