#!/usr/bin/env python3
# coding: utf8
# Author: Harald Schilly <hsy@sagemath.com>
# Copyright: GPL3

"""
When a server in the GCE environment is started with a new IP and a new instance ID,
the host SSH keys in /etc/ssh are recreated.
That's in general a nice security feature, but this also happens when the instance type
changes (some scripts can change pre-empt to non-pre-empt boxes causing this, etc.).

This script hardcodes the current four /etc/ssh/ key-pairs in a config file for cloud-init.
This cloud-init is part of Ubuntu and managing a couple of things in the VM (hostname, network, etc.)
The generated config file then contains the key-pairs and on each boot they are used for writing
the keys.

So, the output in `/etc/cloud/cloud.cfg.d/99-smc.cfg` is like:

```
ssh_keys:
  dsa_private: |
    -----BEGIN DSA PRIVATE KEY-----
    MIIBugIBAAKBgQD…
    …
    …
    -----END DSA PRIVATE KEY-----

  dsa_public: "ssh-dss AAA………"
```

Documentation:
http://cloudinit.readthedocs.org/en/latest/index.html
"""
import sys
import os
from os.path import join, basename, dirname, exists
from glob import glob
from pwd import getpwnam

out_fn = '/etc/cloud/cloud.cfg.d/99-smc.cfg'

try:
    import yaml
except:
    print("ERROR: I need yaml for python3, i.e. sudo apt-get install -y python3-yaml")
    sys.exit(1)

class literal(str): pass

def literal_presenter(dumper, data):
    return dumper.represent_scalar('tag:yaml.org,2002:str', data, style='|')
yaml.add_representer(literal, literal_presenter)

def main():
    # hold key data, dict for key_type_public/key_type_private for each key_type
    keys = {}

    for key_fn in glob('/etc/ssh/ssh_host_*_key'):
        key_type = basename(key_fn)[9:-4]
        print("Reading key {}".format(key_type))
        priv = open(key_fn).read()
        publ = open(key_fn + ".pub").read()
        keys[key_type + '_private'] = literal(priv)
        keys[key_type + '_public'] = publ

    out = yaml.dump({"ssh_keys" : keys}, default_flow_style = False)
    # print(out)

    if not exists(dirname(out_fn)):
        raise Exception("Directory for {} does not exist. Are the clout-init utils installed?".format(out_fn))

    open(out_fn, 'w').write(out)
    root = getpwnam("root")
    os.chown(out_fn, root.pw_uid, root.pw_gid)
    os.chmod(out_fn, 0o600)


if __name__ == '__main__':
    try:
        main()
    except IOError as e:
        raise e
        print("You need to be root or prefix this with sudo")