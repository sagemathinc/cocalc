#!/usr/bin/env python
###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2016, Sagemath Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################



# Configure tinc on this node

import json, os, socket, sys

salvus_root = os.environ['SALVUS_ROOT']
sys.path.append(salvus_root)
import misc

tinc_conf_hosts = os.path.join(salvus_root, 'conf/tinc_hosts')
tinc_path = '/home/salvus/salvus/salvus/data/local/etc/tinc/'

if not os.path.exists(tinc_path):
    os.makedirs(tinc_path)

tinc_conf = os.path.join(tinc_path, 'tinc.conf')
hosts_path = os.path.join(tinc_path, 'hosts')
if not os.path.exists(hosts_path):
    # symbolic link from tinc_conf_hosts to hosts_path
    os.symlink(tinc_conf_hosts, hosts_path)
        

def init():
    external_address = sys.argv[2]
    internal_address = misc.local_ip_address()
    tinc_address     = sys.argv[3]
    tincname         = sys.argv[4]

    if not os.path.exists(tinc_path):
        os.makedirs(tinc_path)

    run_path = '/home/salvus/salvus/salvus/data/local/var/run/'
    if not os.path.exists(run_path):
        os.makedirs(run_path)

    tinc_up = os.path.join(tinc_path, 'tinc-up')

    open(tinc_up,'w').write(
          "#!/bin/sh\nifconfig $INTERFACE %s netmask 255.192.0.0 txqueuelen 10000"%tinc_address)

    os.popen("chmod a+rx %s"%tinc_up)

    open(tinc_conf,'w').write("Name = %s\nKeyExpire = 2592000\nProcessPriority = high\n"%tincname)

    rsa_key_priv = os.path.join(tinc_path, 'rsa_key.priv')
    rsa_key_pub  = os.path.join(tinc_path, 'hosts', tincname)

    if os.path.exists(rsa_key_priv): os.unlink(rsa_key_priv)
    if os.path.exists(rsa_key_pub): os.unlink(rsa_key_pub)

    os.popen("tincd --config %s -K"%tinc_path).read()

    host_file  = os.path.join(hosts_path, tincname)
    public_key = open(rsa_key_pub).read().strip()

    # We give the internal address for Address= since only other GCE nodes will connect to these nodes, and
    # though using the external address would work, it would incur significant additional *charges* from Google.
    open(host_file,'w').write("Address = %s\nTCPonly=yes\nCompression=10\nCipher = aes-128-cbc\nSubnet = %s\n%s"%(
                      internal_address, tinc_address, public_key))

    print json.dumps({"tincname":tincname, "host_file":open(host_file).read()}, separators=(',',':'))

def connect_to():
    s = '\n' + '\n'.join(["ConnectTo = %s"%host for host in sys.argv[2:]]) + '\n'
    open(tinc_conf,'a').write(s)


command = sys.argv[1]
if command == "init":
    init()
elif command == "connect_to":
    connect_to()
else:
    raise RuntimeError("unknown command '%s'"%command)

