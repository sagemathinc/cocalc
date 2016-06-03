#!/usr/bin/env python

import os, json, socket, sys, util

path = os.path.split(os.path.realpath(__file__))[0]; os.chdir(path); sys.path.insert(0, path)

os.environ['DEVEL']='yes'

util.chdir()

ports = util.get_ports()
base_url = util.base_url()
hostname = socket.gethostname()

cmd = "service_hub.py --dev --foreground --db=localhost:{db_port} --db_concurrent_warn=100 --db_pool=10 --hostname={hostname} --port={hub_port} --proxy_port=0 --gap=0 --base_url={base_url} start".format(
    hostname=hostname, base_url=base_url,
    db_port=ports['rethinkdb'], hub_port=ports['hub'])

util.cmd(cmd)


