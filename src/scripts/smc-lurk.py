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
from datetime import datetime, timedelta
from pytz import utc
from Queue import Queue
from threading import Thread
import socket
import numpy as np
from collections import Counter

try:
    from geoip import geolite2
    print("don't forget ot periodically update the geolite2 db via pip install --user -U python-geoip-geolite2")
except:
    print("do $ pip install --user python-geoip-geolite2 ... or something like that")
    sys.exit(1)

try:
    from geopy.geocoders import Nominatim
    geolocator = Nominatim()
except:
    print("do $ pip install --user geopy")
    sys.exit(1)

get_acc_id = r.row["new_val"]["value"]["account_id"]

q = Queue()

recent = dict()
countries = Counter()

def print_data():
    # doing this async because of Nominatim
    while True:
        try:
            left, right = q.get()

            # first, a bit of rate limiting
            account_id = right["account_id"]
            if account_id in recent:
                if datetime.utcnow() - timedelta(minutes = 10) < recent[account_id]:
                    continue
            recent[account_id] = datetime.utcnow()

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
                ago = np.nan
                last_active = "NaN"

            ip = value["ip_address"]
            email_address = right.get("email_address", value.get("email_address", None))
            name = "{first_name} {last_name} <{email}>".format(email = email_address, **right)
            print("{name:<60s}\n    last seen: {last_active} ({ago:.2f} days ago)"\
                  .format(ago=ago, name = name, ip = ip, last_active = last_active, **right))

            try:
                dns = socket.gethostbyaddr(ip)[0]
                print("    IP: {ip:<15s} → DNS: {dns}".format(**locals()))
            except Exception as ex:
                pass

            geo = geolite2.lookup(ip)
            if geo is not None:
                loc = geolocator.reverse("{0}, {1}".format(*geo.location))
                addr = loc.address.split(",")
                country = addr[-1]
                countries[country] += 1
                addr = ", ".join(reversed(addr[min(len(addr), 2):]))
                print(u"    location: {}".format(addr))

        except Exception as ex:
            print("Error: %s" % ex)
        finally:
            print("")
            q.task_done()

t = Thread(target = print_data)
t.daemon = True
t.start()

try:
    for c in central_log.changes().eq_join(get_acc_id, accounts).run():
        q.put((c["left"], c["right"]))
except KeyboardInterrupt:
    q.join()

    print("")
    print("Countries:")
    for c, n in countries.most_common(20):
        print("{:<3d}x {}".format(n, c))
