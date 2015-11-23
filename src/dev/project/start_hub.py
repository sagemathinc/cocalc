#!/usr/bin/env python

import os, json, socket, util

import os; os.environ['DEVEL']='yes'

util.chdir()

ports = util.get_ports()
base_url = util.base_url()
hostname = socket.gethostname()

cmd = "service_hub.py --dev --foreground --db=localhost:{db_port} --hostname={hostname} --port={hub_port} --proxy_port=0 --gap=0 --base_url={base_url} start".format(
    hostname=hostname, base_url=base_url,
    db_port=ports['rethinkdb'], hub_port=ports['hub'])

util.cmd(cmd)


