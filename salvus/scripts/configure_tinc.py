#!/usr/bin/env python

# Configure tinc on this node

import json, os, socket, sys

tinc_path = '/home/salvus/salvus/salvus/data/local/etc/tinc/'
tinc_conf = os.path.join(tinc_path, 'tinc.conf')

def init():
    external_address = sys.argv[2]
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

    open(tinc_conf,'w').write("Name = %s\nKeyExpire = 2592000\n"%tincname)

    rsa_key_priv = os.path.join(tinc_path, 'rsa_key.priv')
    rsa_key_pub  = os.path.join(tinc_path, 'hosts', tincname)

    if os.path.exists(rsa_key_priv): os.unlink(rsa_key_priv)
    if os.path.exists(rsa_key_pub): os.unlink(rsa_key_pub)

    os.popen("tincd --config %s -K"%tinc_path).read()

    host_file  = os.path.join(tinc_path, 'hosts', tincname)
    public_key = open(rsa_key_pub).read().strip()

    open(host_file,'w').write("Address = %s\nTCPonly=yes\nCompression=10\nCipher = aes-128-cbc\nSubnet = %s\n%s"%(external_address, tinc_address, public_key))

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

