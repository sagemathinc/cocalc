#!/usr/bin/env python2
import os, shutil, socket

def cmd(s):
    print(s)
    os.system(s)

shutil.rmtree("/var/lib/glusterd")
if not os.path.exists("/brick/glusterd"):
    os.makedirs("/brick/glusterd")
os.symlink("/brick/glusterd", "/var/lib/glusterd")

cmd("service glusterfs-server start")

#if socket.gethostname().startswith('storage0-'):
    pass
    # TODO: use k8s api to find list of all other storage services and probe them.
    # needs to do this periodically, actually...
    # cmd("gluster peer probe storage%s"%n)

os.system("tail -f /var/log/glusterfs/*.log")
