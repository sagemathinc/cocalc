#!/usr/bin/env python3
# -*- coding: utf8 -*-

from __future__ import print_function

# run me via $ ipython3 -i path/to/me.py

# *********************************************************************************************
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2015, SageMathCloud Authors
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
# *********************************************************************************************

# Authors:
# Harald Schilly <hsy@sagemath.com>

import rethinkdb as r
from datetime import datetime, timedelta
from pytz import utc
import os
from os.path import join
import json
import numpy as np
from pprint import pprint
from collections import defaultdict


def secs2hms(secs, as_string=True):
    '''
    Convert seconds into hours, minutes, seconds or a human readable string.
    '''
    h = int(secs // 60**2)
    m = int((secs // 60) % 60)
    s = secs % 60
    if as_string:
        if h > 0:
            # rounding
            if s > 30:
                m += 1
                if m == 60:
                    h += 1
            hms = "{h:d}h{m:02d}m"
        elif m > 0:
            hms = "{m:d}m{s:02.0f}s"
        else:
            hms = "{s:5.2f}s"
        return hms.format(**locals())
    else:
        return h, m, s


def datetime_serialize(obj):
    """
    To help json.dump to deal with datetime.datetime objects.
    """
    from datetime import datetime
    if isinstance(obj, datetime):
        serial = obj.isoformat()
        return serial
    raise TypeError("Type not serializable")

# Rethinkdb Setup ###
SMC_ROOT = os.environ.get("SMC_ROOT", '.')
if os.environ.get("DEVEL", False):
    # DEV mode
    import dev.project.util
    port = dev.project.util.get_ports()["rethinkdb"]
    r.connect(host="localhost", db="smc", port=port, timeout=20).repl()
else:
    AUTH = open(join(SMC_ROOT, 'data/secrets/rethinkdb')).read().strip()
    r.connect(host="db0", db="smc", auth_key=AUTH, timeout=20).repl()
# or proxy on localhost:
# r.connect(db = "smc", auth_key=AUTH, timeout=20).repl()

# print("Registering tables:", end=" ")
for t in r.table_list().run():
    globals()[t] = r.table(t)
    # print(t, end=", ")

# Library Functions ###
_print = print


def print(x=""):
    if isinstance(x, dict):
        import json
        _print(json.dumps(x, indent=2, default=lambda t: t.isoformat()))
    else:
        _print(x)


def time_past(hours=24, days=0):
    """
    returns datetime object in the past, by default 24 hours, with
    the utc timestamp sutiable for rethinkdb queries.
    """
    now = datetime.utcnow().replace(tzinfo=utc)
    return now - timedelta(days=days, hours=hours)

# Functions Querying RethinkDB Directly ###


def project_host(project_id):
    q = projects.get(project_id).get_field("host")["host"]
    try:
        return q.run()  # there is only one result
    except:
        return None


def project_collaborators(project_id, only_owner=False):
    q = projects.get(project_id)["users"].coerce_to("array")
    if only_owner:
        q = q.map(lambda u: r.branch(u[1]["group"] == "owner", u, False)).filter(lambda x: x)
    q = q.map(lambda u: (
        u[1]["group"],
            accounts.get(u[0]).pluck("account_id", "first_name", "last_name", "email_address")))
    for group, u in q.run():
        fn, ln = u['first_name'], u['last_name']
        try:
            eml = u["email_address"]
            # print("name:  %s %s" % (fn, ln))
            # print("email: %s" % eml)
            print("%s %s <%s>" % (fn, ln, eml))  # , group, u["account_id"]))
        except:
            print("FIXME no email for %s = %s %s" % (fn, ln, k))


def project_owner(project_id):
    project_collaborators(project_id, only_owner=True)


def projects_by_user(account_id):
    return list(projects.filter(lambda p: p["users"].has_fields(account_id)).run())


def search_email(email=None, domain=None, limit=20):
    email = email or r".*"
    if domain:
        regex = r'^%s.*@%s$' % (email, domain)
    else:
        regex = r'^%s$' % email
    q = accounts.filter(r.row["email_address"].match(regex))
    q = q.pluck("first_name", "last_name", "email_address", "account_id")
    for idx, entry in enumerate(q.limit(limit).run()):
        estr = '"{first_name} {last_name} <{email_address}>"'.format(**entry)
        aid = entry["account_id"]
        print('%-60s  %s' % (estr, aid))
        if idx == limit - 1:
            print("\n--- limit of %d entries reached ---" % limit)


def export_accounts(outfn):
    """
    * outfn: output filename, should end in .yaml.bz2
    """
    if not outfn.endswith(".yaml.bz2"):
        raise ValueError("filename should end in .yaml.bz2")

    import json
    import bz2

    q = accounts.pluck("first_name", "last_name", "email_address", "account_id", "created", "last_active")
    with bz2.open(outfn, "wt", encoding="utf8") as out:
        for account in q.run():
            if "email_address" in account:
                out.write(json.dumps(account, default=datetime_serialize))
                out.write("\n")
                # email = account.pop("email_address")
                # data[email] = account


def active_courses(days=14):
    # teacher's course IDs of all active student course projects
    teacher_course_ids = projects.has_fields('course')\
        .filter(r.row["last_edited"] > time_past(days * 24))\
            .pluck('course')["course"]["project_id"].distinct().run()

    courses = defaultdict(list)
    for tc in projects.get_all(*teacher_course_ids)\
        .pluck("project_id", "title", "last_edited", 'created', 'description', "users", {"host":"host"}).run():
        t = 'member' if tc["host"]["host"] >= 'compute4-us' else 'free'
        # some courses do not have a created timestamp :-(
        tc["created"] = tc.get("created", datetime.fromtimestamp(0).replace(tzinfo=utc))
        courses[t].append(tc)

    # e is a (account_id, account_data) pair
    group_order = {"owner": 0, "collaborator": 1}
    sort_collabs = lambda e: (group_order.get(e[1]["group"], np.inf), e[1].get("last_name", "").lower())

    print("<DOCTYPE html>")
    print("<html><head><style>body {font-family: sans-serif;}</style></head>")
    print("<body><h1>Active Courses as of {}</h1>".format(datetime.utcnow().isoformat()))
    for hosting, projs in courses.items():
        print("<h2>{} Hosting</h2>".format(hosting.title()))
        for p in sorted(projs, key=lambda course: course["created"]):
            h3 = '<a href="https://cloud.sagemath.com/projects/{project_id}/">{title}</a>'.format(**p)
            edited = p["last_edited"].isoformat()[:16]
            started = p["created"].isoformat()[:16]
            course = "<h3>{h3}</h3><div>created: {started}, last edit: {edited}, host: {host[host]}"\
                        .format(started=started, edited=edited, h3=h3, **p)
            print(course)
            print("<div><i>{description}</i></div>".format(**p))
            print("<ul>")
            u = p["users"]
            for k, v in sorted(u.items(), key=sort_collabs):
                t = accounts.get(k).pluck("first_name", "last_name", "email_address").run()
                t["email_address"] = t.get("email_address", "None")
                addr = '<a href="mailto:{email_address}">{first_name} {last_name}</a> &lt;{email_address}&gt'.format(**t)
                print("<li>{addr} ({group})</li>".format(addr=addr, **v))
            print("</ul></div>")
    print("</body></html>")


def rewrite_stats():
    """
    This little helper changes entries in the stats table. The goal is, that
    'last_week_projects': 3533, 'last_day_projects': 1202, and  'last_month_projects': 10443
    are transformed into 'projects_edited' : {'1d' : ..., '1h':, ... }
    """
    from time import sleep
    dt = timedelta(days=1)

    first = stats.order_by(index="time").run().next()
    start = first["time"]
    #start += 17*dt

    while start < time_past(days=7):
        start += dt
        end = start + dt
        print(start)

        nb = stats.between(start, end, index="time").has_fields('last_day_projects').count().run()
        if nb == 0:
            sleep(.1)
            continue
        print("modifying %d documents between %s → %s" % (nb, start.isoformat(), end.isoformat()))

        #pprint(stats.between(start, end, index="time").has_fields('last_day_projects').run().next())
        #return

        trans = stats.between(start, end, index="time")\
            .has_fields('last_day_projects')\
            .replace(
                lambda d: d
                    .merge({"projects_edited": {
                            "5min": d['active_projects'],
                            "1d": d["last_day_projects"],
                            "1h": d["last_hour_projects"].default(None),
                            "7d": d["last_week_projects"],
                            "30d": d["last_month_projects"]}})
                    .without('active_projects',
                             "last_day_projects",
                             "last_hour_projects",
                             "last_week_projects",
                             'last_month_projects')
        )
        res = trans.run(durability='soft')
        # print(res)
        if res["errors"] > 0:
            print(res)
            for i in stats.between(start, end, index="time").has_fields('last_day_projects').run():
                print("stats.get('%s')" % i["id"])
                pprint(i)
            #return
        elif res["replaced"] > 0:
            # top speed is above 10k/sec, but we want to keep this throttled
            # therefore, for every 1k replacements, sleep 15 secs (1 sec isn't enough)
            sleep(15. * res["replaced"] / 1000.)
        else:
            sleep(.1)


# This class & methods queries the backup, which is a plain `rethinkdb export` dump ###
# the tricky part is, that not all tables can be loaded into memory at once.

try:
    from functools import lru_cache

    class Backup(object):

        """
        This reads directly the dumped files from disk.
        """

        def __init__(self, root="/backup/data/smc/"):
            self.root = root

        def fn(self, db):
            from os.path import join
            return join(self.root, db + ".json")

        @lru_cache(maxsize=32)
        def get(self, db):
            from json import load
            data = load(open(self.fn(db), "r"))
            return data

        @lru_cache(maxsize=32)
        def get_accounts(self):
            data = {}
            for account in self.get("accounts"):
                account_id = account["account_id"]
                data[account_id] = account
            return data

        @lru_cache(maxsize=32)
        def get_account(self, account_id):
            return self.get_accounts().get(account_id, None)

        def projects_search(self, search_string):
            from os.path import join
            from json import loads
            import os
            fn = self.fn("projects")
            cmd = "grep '%s' '%s'" % (search_string, fn)
            # print(cmd)
            results = os.popen(cmd).read()
            return [loads(line[:-1]) for line in results.split("\n") if len(line) > 0]

        def projects_of_owner(self, account_id):
            projects = []
            for project in self.projects_search(account_id):
                for user_id, config in project["users"].items():
                    if config.get("group", None) == "owner":
                        projects.append(project)
            return projects

        def sort_projects(self, projects, key="time"):
            if key == "time":
                return sorted(projects, key=lambda p: p['last_edited']['epoch_time'])
            else:
                raise ValueError("key %s unkown" % key)

        def pprint_account(self, account):
            account["first_name"] = account.get("first_name", "")
            account["last_name"] = account.get("last_name", "")
            account["email_address"] = account.get("email_address", "???@???.??")
            estr = u'"{first_name} {last_name} <{email_address}>"'.format(**account)
            aid = account["account_id"]
            return u'%-60s  %s' % (estr, aid)

        def pprint_projects(self, projects, width=111):
            """
            pretty print one or more projects
            """
            from datetime import datetime
            from textwrap import wrap

            for p in projects:
                ts = p['last_edited']['epoch_time']
                last_edited = datetime.utcfromtimestamp(ts).isoformat()
                accounts = [self.get_account(aid) for aid in p["users"].keys()]
                title = p['title']
                description = '\n'.join(wrap(p["description"], width))
                deleted = p.get("deleted", False)
                project_id = p["project_id"]

                print()
                print('{title} ({project_id})'.format(**locals()).center(width, "-"))
                print(description)
                print()
                print("last edited: {last_edited}   deleted: {deleted}".format(**locals()))
                print()
                for account in accounts:
                    if account is None:
                        print("unknown")
                        continue

                    print(self.pprint_account(account), end=" -- ")
                    print(p["users"][account["account_id"]]["group"])

        def search_email(self, email=None, domain=None, regex=None, limit=20):
            import re
            accounts = self.get("accounts")

            email = email or r".*"
            if regex is None:
                if domain:
                    regex = r'^%s.*@%s$' % (email, domain)
                else:
                    regex = r'^%s$' % email
            regex = re.compile(regex)

            for idx, account in enumerate(accounts):
                if "email_address" not in account:
                    continue
                if regex.search(account["email_address"]):
                    print(self.pprint_account(account))
                    if idx == limit - 1:
                        print("\n--- limit of %d entries reached ---" % limit)

    backup = Backup()

except:
    print("warning: running under python 2. lru_cache doesn't exist and 'Backup' is disabled...")

if __name__ == "__main__":
    import sys
    if len(sys.argv) >= 2:
        if sys.argv[1] == "courses":
            active_courses()
        elif sys.argv[1] == 'rewrite_stats':
            rewrite_stats()
