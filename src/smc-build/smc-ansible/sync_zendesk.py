#!/usr/bin/env python3
import sys
import os
from os.path import join, expanduser, relpath, normpath
from datetime import datetime
import json

SMC_ROOT = os.environ["SMC_ROOT"]
sys.path.insert(0, join(SMC_ROOT, "scripts"))
from smc_rethinkdb import accounts

now_ts = datetime.utcnow().timestamp()

q = accounts.has_fields({'stripe_customer': "subscriptions"})\
    .pluck('email_address', 'first_name', 'last_name', 'stripe_customer')

for idx, acc in enumerate(q.run()):
    print("{:3d} {:s}".format(idx, acc["email_address"]))
    print(json.dumps(acc, indent=2))
    if idx > 1:
        break
