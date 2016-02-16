#!/usr/bin/env python2
# coding: utf8

import sys, os
d = os.path.abspath(os.path.dirname(__file__))
sys.path.insert(0, d)

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
now = datetime(2016, 3, 1).replace(tzinfo = utc)

# round down to midnight
aga = ago.replace(hour = 0, minute = 0, second = 0, microsecond = 0)

q = central_log.between(ago, now, index='time').filter({'event' : 'successful_sign_in'})

total = q.count().run()
print("Hold tight. Going through {} records for you …".format(total))

q = q.pluck("time", {"value": "account_id"})

day = defaultdict(set)
week = defaultdict(set)
month = defaultdict(set)

t0 = t = time()

for idx, ev in enumerate(q.run()):
    if idx % (total // 10000) == 0 and t < time():
        eta = (total - idx) * (t - t0) / idx if idx > 1000 else np.nan
        print('{:5.2f} %    eta: {:5.2f} s'.format(100. *idx / total, eta))
        t = time() + 2.
    id = ev["value"]["account_id"]
    dt = ev["time"]
    day[dt.date()].add(id)
    w = "{0}-{1:02d}".format(*dt.isocalendar())
    week[w].add(id)
    m = "{0.year}-{0.month:02d}".format(dt)
    month[m].add(id)

print("Daily active users")
for k, v in sorted(day.items()):
    print("{}: {}".format(k, len(v)))

print("")
print("Weekly active users")
for k, v in sorted(week.items()):
    print("{}: {}".format(k, len(v)))

print("")
print("Monthly active users")
for k, v in sorted(month.items()):
    print("{}: {}".format(k, len(v)))
