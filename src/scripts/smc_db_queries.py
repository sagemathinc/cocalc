#!/usr/bin/env python3
# -*- coding: utf8 -*-

from __future__ import print_function

# run me via $ ipython3 -i path/to/me.py

# *********************************************************************************************
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2015 -- 2017, SageMath, Inc.
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

# this was initially written against rethinkdb, but now it's postgres via pycopg2
# import rethinkdb as r
from datetime import datetime, timedelta
from os.path import join
import os, sys, json
from datetime import date, datetime, timedelta
from dateutil.parser import parse as dt_parse
from pytz import timezone, utc
import pandas as pd
import numpy as np
from pprint import pprint
from collections import defaultdict
from uuid import UUID


def secs2hms(secs, as_string=True):
    """
    Convert seconds into hours, minutes, seconds or a human readable string.
    """
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


### DB Setup ###
SMC_ROOT = os.environ.get("SMC_ROOT", '.')

import psycopg2 as pg
import psycopg2.extras
psycopg2.extras.register_uuid()
USER = os.environ['PGUSER']
DB = os.environ.get('SMC_DB', 'smc')
HOST = os.environ.get('PGHOST', 'localhost')
PORT = 5432

if 'PGPASSWORD' in os.environ:
    PW = os.environ['PGPASSWORD']
elif os.environ.get("DEVEL", False):
    # DEV mode
    import dev.project.util
    PORT = dev.project.util.get_ports()["postgres"]  # ???
    # r.connect(host="localhost", db="smc", port=port, timeout=20).repl()
else:
    PW = open(join(SMC_ROOT, 'data/secrets/postgres')).read().strip()
    # r.connect(host="db0", db="smc", auth_key=AUTH, timeout=20).repl()

conn = pg.connect(
    "dbname={DB} user={USER} host={HOST} port={PORT} password={PW}".format(
        **locals()))

# or proxy on localhost:
# r.connect(db = "smc", auth_key=AUTH, timeout=20).repl()

# print("Registering tables:", end=" ")
#for t in r.table_list().run():
#    globals()[t] = r.table(t)
# print(t, end=", ")

# system tables
#rdb = r.db("rethinkdb")
#for t in rdb.table_list().run():
#    globals()['r_%s' % t] = rdb.table(t)

# Library Functions ###


def time_past(hours=24, days=0):
    """
    returns datetime object in the past, by default 24 hours, with
    the utc timestamp sutiable for rethinkdb queries.
    """
    now = datetime.utcnow().replace(tzinfo=utc)
    return now - timedelta(days=days, hours=hours)


def days_ago(days=0):
    return time_past(24 * days)


# Functions Querying Postgres Directly ###


def project_host(project_id):
    # q = projects.get(project_id).get_field("host")["host"]
    try:
        with conn.cursor() as c:
            c.execute(
                "SELECT host ->> 'host' FROM projects WHERE project_id = %(pid)s::uuid",
                {'pid': '81753337-f6ff-43b7-9b0d-86b92902ef14'})
            return (c.fetchone()[0])
    except Exception as e:
        conn.rollback()
        raise e


def project_collaborators(project_id, only_owner=False):
    # q = projects.get(project_id)["users"].coerce_to("array")
    try:
        q = None
        with conn.cursor() as c:
            x = c.mogrify(
                "SELECT users FROM projects WHERE project_id = %(pid)s::uuid",
                {'pid': project_id})
            c.execute(x)
            q = c.fetchone()[0]
            # print(q)
        # q = q.map(lambda u: r.branch(u[1]["group"] == "owner", u, False)).filter(lambda x: x)
        collab_ids = [
            k for (k, v) in q.items()
            if not only_owner or v.get('group') == 'owner'
        ]
        # print("collab_ids %s" % collab_ids)

        #q = q.map(lambda u: (
        #    u[1]["group"],
        #        accounts.get(u[0]).pluck("account_id", "first_name", "last_name", "email_address")))

        with conn.cursor() as c:
            c.execute(
                """\
            SELECT account_id::text, first_name, last_name, email_address
            FROM accounts
            WHERE account_id IN %s""", (tuple(collab_ids), ))
            collabs = c.fetchall()

        #print("collabs %s" % collabs)
        for u in collabs:
            fn, ln = u[1], u[2]
            eml = u[3]
            # print("name:  %s %s" % (fn, ln))
            # print("email: %s" % eml)
            print("%s %s <%s>" % (fn, ln, eml))  # , group, u["account_id"]))
    except Exception as e:
        conn.rollback()
        raise e


def project_owner(project_id):
    project_collaborators(project_id, only_owner=True)


def projects_by_user(account_id):
    # return list(projects.filter(lambda p: p["users"].has_fields(account_id)).run())
    try:
        with conn.cursor() as c:
            c.execute("SELECT project_id FROM projects WHERE users ? %s::text",
                      (account_id, ))
            return [str(_[0]) for _ in c.fetchall()]
    except Exception as e:
        conn.rollback()
        raise e


def search_email(email=None, domain=None, limit=20):
    raise Exception('NYI')

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
    raise Exception('NYI')

    if not outfn.endswith(".yaml.bz2"):
        raise ValueError("filename should end in .yaml.bz2")

    import json
    import bz2

    q = accounts.pluck("first_name", "last_name", "email_address",
                       "account_id", "created", "last_active")
    with bz2.open(outfn, "wt", encoding="utf8") as out:
        for account in q.run():
            if "email_address" in account:
                out.write(json.dumps(account, default=datetime_serialize))
                out.write("\n")
                # email = account.pop("email_address")
                # data[email] = account


def active_courses(days=7, json=False):
    # teacher's course IDs of all active student course projects
    #teacher_course_ids = projects.has_fields('course')\
    #    .filter(r.row["last_edited"] > days_ago(days))\
    #        .pluck('course')["course"]["project_id"].distinct().run()
    with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as c:
        x = c.execute(
            """
        SET work_mem='64MB';
        WITH teacher_course_ids AS (
            SELECT DISTINCT((course ->> 'project_id')::uuid)
            FROM projects
            WHERE last_edited >= NOW() - '%(days)s days'::interval
            AND course IS NOT NULL
        )
        SELECT project_id::text, title, last_edited, created, description,
               (    SELECT array_agg(row_to_json(t))
                    FROM (
                        SELECT account_id, first_name, last_name, email_address
                        FROM accounts
                        WHERE p.users ? account_id::text
                    ) AS t
               ) AS acc_users,
               users,
               c.host as host,
               COALESCE(c.member_host, false) as on_member_host
        FROM projects p LEFT JOIN compute_servers c ON (p.host ->> 'host') = c.host
        WHERE project_id in (SELECT * FROM teacher_course_ids)
        """, {'days': days})
        course_data = c.fetchall()

    courses = defaultdict(list)
    for c in course_data:
        tc = dict(c)  # makes a copy such that we can modify it
        # some courses do not have a created timestamp :-(
        tc["created"] = tc.get(
            "created", datetime.fromtimestamp(0).replace(tzinfo=utc))
        member = 'member' if tc['on_member_host'] else 'free'
        courses[member].append(tc)

    #pprint(courses)
    if json:
        import json
        print(json.dumps(courses, default=datetime_serialize, indent=1))
        return

    # e is a (account_id, account_data) pair
    # group_order = {"owner": 0, "collaborator": 1}
    # sort_collabs = lambda e: (group_order.get(e[1]["group"], np.inf), e[1].get("last_name", "").lower())

    print("<DOCTYPE html>")
    print(
        "<html><head><style>body {font-family: sans-serif; font-size: 85%;}</style></head>"
    )
    print("<body><h1>Active Courses as of {}</h1>".format(
        datetime.utcnow().isoformat()))
    print(
        "<div>Filter: <code>project.last_edited >= '%s days' ago</code></div>"
        % days)
    # with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as c:
    for hosting, projs in sorted(courses.items()):
        print("<h2>{} Hosting</h2>".format(hosting.title()))
        for p in reversed(
                sorted(projs, key=lambda course: course["last_edited"])):
            # pprint(p)
            host = p.get("host", "N/A")
            h3 = '<a href="https://cocalc.com/projects/{project_id}/">{title}</a>'.format(
                **p)
            edited = p["last_edited"].isoformat()[:16]
            started = p.get("created")
            started = started.isoformat()[:16] if started else 'N/A'
            print("<h3>{h3}</h3><div>created: {started}, last edit: {edited}, host: {hostname}"\
                .format(started=started, edited=edited, h3=h3, hostname=host, **p))
            print("<div><i>{description}</i></div>".format(**p))
            print("<ul>")
            # u = list(p["users"].keys())
            # TODO no idea how to integrate this query in the one above. It's an array for each users jsonb
            #c.execute("""SELECT account_id::text, first_name, last_name, email_address
            #          FROM accounts WHERE account_id IN %s""", (tuple(u),))
            for t in p['acc_users']:
                t = dict(t)
                t["email_address"] = t.get("email_address", "None")
                addr = '<a href="mailto:{email_address}">{first_name} {last_name}</a> &lt;{email_address}&gt'.format(
                    **t)
                bg = 'yellow' if p["users"][t["account_id"]].get(
                    'group', '') == 'owner' else ''
                print("<li><span style='background:{bg};'>{addr}</span></li>".
                      format(bg=bg, addr=addr))
            print("</ul></div>")
        print("<hr/>")
    print("</body></html>")


def live(table='projects', max_time=15, filter_str=None):
    """
    Watch queries in real-time.
    * table: the table of interest (e.g. 'patches', 'projects', 'syncstrings', ...)
    * max_time: show only queries below that in seconds (otherwise, you get changefeeds)
    * filter_str: an additional string for filtering the queries.
      e.g. a project uuid via live(filter_str='369491f1')
    """
    raise Exception('NYI')

    q = r_jobs.filter({'type': 'query'})
    q = q.filter(r.row['duration_sec'] < max_time)
    q = q.filter(r.row["info"]["query"].match(r'table\("%s"' % table))
    if filter_str is not None:
        q = q.filter(r.row["info"]["query"].match(filter_str))
    for x in q.changes()['new_val']['info'].run():
        print(x['query'])


if __name__ == "__main__":
    import sys
    if len(sys.argv) >= 2:
        if sys.argv[1] == "courses":
            if len(sys.argv) >= 3 and sys.argv[2] == 'json':
                active_courses(days=100, json=True)
            else:
                active_courses(days=100)
