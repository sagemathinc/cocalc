#!/usr/bin/env python

"""
Start

"""

import os, json, socket, sys, util

path = os.path.split(os.path.realpath(__file__))[0]; os.chdir(path); sys.path.insert(0, path)

os.environ['DEVEL']='yes'
os.environ['PGHOST']=os.path.join(path, 'postgres_data/socket')

util.chdir()

ports    = util.get_ports()
base_url = util.base_url()

cmd = "cd ../../ && . smc-env &&  service_hub.py --dev --foreground --hostname=0.0.0.0 --port=0 --share_port={share_port} --proxy_port=0 --gap=0 --base_url={base_url} start".format(
    base_url   = base_url,
    share_port = ports['hub-share'])

util.cmd(cmd)


