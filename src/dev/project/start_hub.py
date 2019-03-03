#!/usr/bin/env python

import os, json, socket, sys, util

path = os.path.split(os.path.realpath(__file__))[0]
os.chdir(path)
sys.path.insert(0, path)

os.environ['DEVEL'] = 'yes'
os.environ['PGHOST'] = os.path.join(path, 'postgres_data/socket')

if 'TMUX' in os.environ:  # see https://github.com/sagemathinc/cocalc/issues/563
    del os.environ['TMUX']

util.chdir()

ports = util.get_ports()
base_url = util.base_url()


cmd = "cd ../../ && . smc-env &&  service_hub.py --dev --foreground --hostname=0.0.0.0 --port={hub_port} --share_port=0 --proxy_port=0 --gap=0 --mentions=15000 --base_url={base_url} {test} start".format(
    base_url=base_url, hub_port=ports['hub'], test=util.test())

util.cmd(cmd)
