#!/usr/bin/env python3
# startup-wrapper for alertmanager (mainly, reading the password for emails)
import yaml
import os
import sys
from os.path import join, realpath, dirname, abspath
from pprint import pprint

# change to script's dir
os.chdir(dirname(realpath(__file__)))

config_fn = 'alertmanager.yml'
config_fn_in = config_fn + ".in"

#HOME = os.environ['HOME']
password = open('/home/salvus/smc/src/data/secrets/salvusmath_email_password').read().strip()
assert len(password) > 3, 'no data in password file?'

config = yaml.load(open(config_fn_in))

config['global']['smtp_auth_username'] = 'salvusmath'
config['global']['smtp_auth_password'] = password

config_yaml = yaml.dump(config, default_flow_style=False, canonical=False, indent=2)

#pprint(config_yaml)

with open(config_fn, 'w') as out:
    out.write(config_yaml)

from shutil import which
DATA = os.environ['DATA'] # set in prometheus.env
os.execl(which('alertmanager'), '-config.file=%s' % config_fn, '-storage.path', DATA)


