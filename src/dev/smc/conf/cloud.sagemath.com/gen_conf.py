#!/usr/bin/env python2
"""
Determine which hosts web[n] exist, i.e., for which DNS resolves web[n], for n=0,1,2, etc.

Then read the file 'haproxy.cfg.template' and make an uncommented copy of all the web0 lines
but for all the web[n] hosts that exist.

(c) William Stein, 2016
"""
import sys
import os

#EXCLUDE=['web6']
EXCLUDE=[]

def host_exists(hostname):
    """
    Return true if and only if hostname resolves and is pingable.
    """
    return os.system("ping -c 1 -W 1 '%s' 2>/dev/null 1>/dev/null"%hostname) == 0

def web_hosts_2(bound=9):
    import subprocess as sp
    import json
    cmd = sp.Popen("gcloud compute instances list --filter='name ~ ^web' --format=json",
                   shell=True, stdout=sp.PIPE, stderr=sp.PIPE)
    webs, err = cmd.communicate()
    try:
        webs = json.loads(webs)
        assert len(webs) >= 3
    except Exception as e:
        print("ERROR, fallback -- %s" % e)
        webs = ["web%s"%n for n in range(bound)]
    # maybe filter additionally on something?
    names = [w['name'] for w in webs if w['status'] == "RUNNING"]
    return [name for name in names if name not in EXCLUDE]

def web_hosts(bound=20):
    """
    Return all web hosts of the form web[n] that exists for n<bound.
    """
    v = ["web%s"%n for n in range(bound) if host_exists("web%s"%n)]
    return [x for x in v if x not in EXCLUDE]

def gen_haproxy(x=''):
    if not x:
        hosts = web_hosts()
    else:
        hosts = [x]
    v = []
    for x in open('haproxy.cfg.template').xreadlines():
        if 'web0' in x:
            # generate version of x with leading # deleted and web0 replaced by each web hostname
            i = x.find('#')
            t = x[:i] + x[i+1:]
            for h in hosts:
                n = h[3:]
                v.append(t.replace('web0',h).replace('nginx0','nginx'+n).replace('proxy0','proxy'+n).replace('hub0','hub'+n))
        else:
            v.append(x)
    # write out our new haproxy config file
    open('haproxy.cfg','w').write(''.join(v))

if __name__ == "__main__":
    if len(sys.argv) == 1:
        gen_haproxy()
    else:
        gen_haproxy(sys.argv[1])
