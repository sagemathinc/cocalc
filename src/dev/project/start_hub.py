#!/usr/bin/env python

import os, json, socket, sys, util

path = os.path.split(os.path.realpath(__file__))[0]; os.chdir(path); sys.path.insert(0, path)

os.environ['DEVEL']='yes'
os.environ['PGHOST']=os.path.join(path, 'postgres_data/socket')

if 'TMUX' in os.environ: # see https://github.com/sagemathinc/cocalc/issues/563
    del os.environ['TMUX']

util.chdir()

ports = util.get_ports()
base_url = util.base_url()

# disabling hostname, because nslookup of project-UUID does not return anything
#hostname = socket.gethostname()
# instead, take the ip of the local hostname
from subprocess import check_output
host_ips = check_output(['hostname', '--all-ip-addresses']).splitlines()[0]

# will be --host=... for the hub's http server, no lookup needed any more
hostname = host_ips

cmd = "cd ../../ && . smc-env &&  service_hub.py --dev --foreground --hostname={hostname} --port={hub_port} --proxy_port=0 --gap=0 --base_url={base_url} start".format(
    hostname      = hostname,
    base_url      = base_url,
    hub_port      = ports['hub'])

util.cmd(cmd)


