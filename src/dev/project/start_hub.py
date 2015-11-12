#!/usr/bin/env python

import os, json, socket, util

import os; os.environ['DEVEL']='yes'

util.chdir()

ports = util.get_ports()
base_url = util.base_url()
hostname = socket.gethostname()

# Comment out this line for quicker startup -- however, you will have to
# manually run the update_schema.coffee script any time the schema changes.
util.cmd('./update_schema.coffee')

cmd = "service_hub.py --foreground --db=localhost:{db_port} --hostname={hostname} --port={hub_port} --proxy_port={proxy_port} --gap=0 --base_url={base_url} start".format(
    hostname=hostname, base_url=base_url,
    db_port=ports['rethinkdb'], hub_port=ports['hub'], proxy_port=ports['proxy'])

util.cmd(cmd)


