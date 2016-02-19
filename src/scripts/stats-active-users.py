#!/usr/bin/env python3
# coding: utf8

import sys, os
from os.path import abspath, dirname, join
file_dir = abspath(dirname(__file__))
sys.path.insert(0, file_dir)

from smc_rethinkdb import *
from pprint import pprint
from datetime import datetime, timedelta
from pytz import utc
from collections import defaultdict
from time import time
import numpy as np

now = r.maxval
# ago = time_past(24 * 50)

ago = datetime(2015, 1, 1).replace(tzinfo = utc)
# now = datetime(2016, 3, 1).replace(tzinfo = utc)

# round down to midnight
aga = ago.replace(hour = 0, minute = 0, second = 0, microsecond = 0)

# ATTN: central_log doesn't record all sign_in events, probably due to some missing case for passports. hence that's incomplete
# q = central_log.between(ago, now, index='time')#.filter({'event' : 'successful_sign_in', 'value' : {'email_address' : "harald.schilly@gmail.com"}})
# q = q.has_fields({'value' : 'email_address'}).filter({'value' : {'email_address' : "hsy@sagemath.com"}})

# INFO: using file_access_log instead, which has the benefit to be more truthy regarding really "active" users
q = file_access_log.between(ago, now, index='time')
# q = q.filter({"account_id" : '3c40513b-7e7c-450c-aa13-bf4f3411cf33'}) # only hsy@sagemath.com

total = q.count().run()
print("Hold tight. Going through {} records for you …".format(total))

q = q.has_fields('account_id').pluck("time", "account_id")

day    = defaultdict(set)
week   = defaultdict(set)
month  = defaultdict(set)

t0 = None

for idx, ev in enumerate(q.run()):
    if t0 is None:
        t0 = t = time()
    if total > 1001 and idx % int(total * .001) == 0 and t < time():
        eta = (total - idx) * (t - t0) / idx if idx > 1000 else np.nan
        print('{:5.2f} %    eta: {:5.2f} s'.format(100. *idx / total, eta))
        t = time() + 5.
    id = ev["account_id"]
    dt = ev["time"]
    day[dt.date()].add(id)
    w = "{0}-{1:02d}".format(*dt.isocalendar())
    week[w].add(id)
    m = "{0.year}-{0.month:02d}".format(dt)
    month[m].add(id)

with open("active-users-1d.csv", 'w') as out:
    print("Daily active users")
    out.write("day;active\n")
    for k, v in sorted(day.items()):
        print("{}: {}".format(k, len(v)))
        out.write("{};{}\n".format(k, len(v)))

with open("active-users-1w.csv", 'w') as out:
    print("")
    print("Weekly active users")
    out.write("week;active\n")
    for k, v in sorted(week.items()):
        print("{}: {}".format(k, len(v)))
        out.write("{};{}\n".format(k, len(v)))

with open("active-users-1m.csv", 'w') as out:
    print("")
    print("Monthly active users")
    out.write("month;active\n")
    for k, v in sorted(month.items()):
        print("{}: {}".format(k, len(v)))
        out.write("{};{}\n".format(k, len(v)))
