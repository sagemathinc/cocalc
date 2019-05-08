#!/usr/bin/env python

import os, sys

SALVUS_ROOT = os.environ['SALVUS_ROOT']

sys.path.append(SALVUS_ROOT)

import admin

a = admin.Services('%s/conf/deploy_smc/' % SALVUS_ROOT, password='')

for x in a._hosts('hub', 'cd salvus/salvus; . smc-env; ./update', timeout=60):
    print(x)
