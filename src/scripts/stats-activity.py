#!/usr/bin/env python3
# coding: utf8

# this script scans the table recording file edits and tabulates the most active users and projects.
# it bin-counts the active projects or active users by 10 minutes sized bins.
# that's much more accurate than just counting activities in bulk and allows to discretely sum up the event bins.

print("WARNING: don't share the generated data publicly. It is solely used to improve the service!")

import sys, os
d = os.path.abspath(os.path.dirname(__file__))
sys.path.insert(0, d)

from smc_rethinkdb import r, accounts, file_access_log, secs2hms
from pprint import pprint
from datetime import datetime, timedelta
from pytz import utc
from queue import Queue
from threading import Thread
import socket
import numpy as np
from collections import Counter, defaultdict
import itertools as it

# map account and project IDs to integers.
#pid_count = it.count()
#anon_pid = defaultdict(lambda : next(pid_count))
#aid_count = it.count()
#anon_aid = defaultdict(lambda : next(aid_count))

DAYS_AGO = 7
now = datetime.utcnow().replace(tzinfo = utc)
ago = now - timedelta(days = DAYS_AGO)

# round down to midnight
# ago = ago.replace(hour = 0, minute = 0, second = 0, microsecond = 0)

q = file_access_log\
    .between(ago, now, index='time')\
    .eq_join(r.row["account_id"], accounts)\
    .pluck({"left" : ["time", "account_id", "project_id"], "right": ["first_name", "last_name", "email_address"]})

users = dict()

# mapping hourly timestamp to set of users
users_bins = defaultdict(set)
projs_bins = defaultdict(set)

# summing up total number of bins when active
users_tot = Counter()
projs_tot = Counter()

for idx, res in enumerate(q.run()):
    what = res["left"]; who = res["right"]
    # print(what); print(who)
    # who:  {'first_name': 'xxx', 'email_address': 'xxx', 'last_name': 'xxx'}
    # what: {'project_id': 'xxx-xxx-xxx', 'account_id': 'xxx-xxx-xxx', 'time': ' ... ' }
    aid = what["account_id"]
    pid = what["project_id"]
    if aid not in users:
        who["email_address"] = who.get("email_address", "None")
        users[aid] = "{0[first_name]} {0[last_name]} <{0[email_address]}>".format(who)

    # full hour bin
    t = what["time"]
    ts = int(t.replace(minute=t.minute - t.minute % 10, second=0,  microsecond=0).timestamp())
    users_bins[ts].add(aid)
    projs_bins[ts].add(pid)

    #if idx > 1000:
    #    break

# print(projs)

for name, bins, tot in [("users", users_bins, users_tot), ("projects", projs_bins, projs_tot)]:
    print()
    print("{} Bins".format(name.title()))
    for ts, ids in sorted(bins.items()):
        ts = datetime.fromtimestamp(ts).isoformat()
        print("{} → {}".format(ts, len(ids)))
        tot.update(Counter(ids))

sum_user_total = 0
print("Top Users")
for (aid, nb) in users_tot.most_common(30):
    # nb: number of 10min intervals
    x = 60 * 10 * nb
    print("{:>9}s {}".format(secs2hms(x), users[aid]))
    sum_user_total += x

print()
ratio = (sum_user_total / 60.) / (DAYS_AGO * 24 * 60)
print("Sum of user activity: {} (radio: 1:{:.2f})".format(secs2hms(sum_user_total), ratio))
