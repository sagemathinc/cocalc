#!/usr/bin/env python2
# coding: utf8
# this script should be python3, but geolite2 requires 2 :-\
from __future__ import print_function, unicode_literals

print("WARNING: don't share the generated data publicly. It is solely used to improve the service!")

import sys, os
d = os.path.abspath(os.path.dirname(__file__))
sys.path.insert(0, d)

from smc_rethinkdb import *
from pprint import pprint
from datetime import datetime
from pytz import utc
from Queue import Queue
from threading import Thread

try:
    from geoip import geolite2
except:
    print("do $ pip install python-geoip-geolite2 ... or something like that")
    sys.exit(1)

try:
    from geopy.geocoders import Nominatim
    geolocator = Nominatim()
except:
    print("do $ pip install --user geopy")

get_acc_id = r.row["new_val"]["value"]["account_id"]

q = Queue()

def print_data():
    # doing this async because of Nominatim
    while True:
        left, right = q.get()
        c = left["new_val"]
        event = c["event"]
        value = c["value"]
        now = datetime.utcnow().replace(tzinfo = utc)
        last_active = right.get("last_active", None)
        if last_active:
            ago = (now - last_active).total_seconds() / (24 * 60 * 60)
            last_active = str(last_active)[:16]
            right.pop("last_active")
        else:
            last_active = "NaN"

        ip = value["ip_address"]
        email_address = right.get("email_address", value.get("email_address", None))
        name = "{first_name} {last_name} <{email}>".format(email = email_address, **right)
        print("{name:<60s}\n    last seen: {last_active} ({ago:.2f} days ago)"\
              .format(ago=ago, name = name, ip = ip, last_active = last_active, **right))

        geo = geolite2.lookup(ip)
        loc = geolocator.reverse("{0}, {1}".format(*geo.location))
        addr = loc.address.split(",")
        addr = ", ".join(addr[2:])
        print(u"    location: {}".format(addr))
        print("")
        q.task_done()

t = Thread(target = print_data)
t.daemon = True
t.start()

for c in central_log.changes().eq_join(get_acc_id, accounts).run():
    left, right = c["left"], c["right"]
    q.put((left, right))

q.join()