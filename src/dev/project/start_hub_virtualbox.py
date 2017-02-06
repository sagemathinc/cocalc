#!/usr/bin/env python

import os, json, socket, sys, util

path = os.path.split(os.path.realpath(__file__))[0]; os.chdir(path); sys.path.insert(0, path)

os.environ['DEVEL']='yes'
os.environ['PGHOST']=os.path.join(path, 'postgres_data/socket')


if 'TMUX' in os.environ: # see https://github.com/sagemathinc/smc/issues/563
    del os.environ['TMUX']

util.chdir()

ports = util.get_ports()
hostname='0.0.0.0'

cmd = "service_hub.py --dev --foreground --hostname={hostname} --port={hub_port} --proxy_port=0 --gap=0 start".format(
    hostname      = hostname,
    hub_port      = ports['hub'])

util.cmd(cmd)


