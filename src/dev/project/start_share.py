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
base_url = util.base_url(ports['hub-share-2'], write=False)

print('''\n\nBASE URL: {}\n\n'''.format(base_url))

if 'COCALC_PROJECT_PATH' in os.environ:
    share_path = os.environ['COCALC_PROJECT_PATH'] + '[project_id]'
else:
    share_path= os.path.join(os.environ['SMC_ROOT'], 'data/projects/[project_id]')

cmd = "unset NODE_ENV; cd ../../ && . smc-env &&  service_hub.py --share_path={share_path} --foreground --hostname=0.0.0.0 --port=0 --share_port={share_port} --proxy_port=0 --gap=0 --base_url={base_url} {test} start".format(
    base_url   = base_url,
    share_port = ports['hub-share-2'],
    share_path = share_path, test=util.test())

util.cmd(cmd)


