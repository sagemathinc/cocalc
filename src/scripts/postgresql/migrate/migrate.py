#!/usr/bin/env python
"""
Import all data from **all** json files in the given path:

  (1) converting them to csv files
  (2) processing timestamps nested in the csv files, if necessary
  (3) importing the csv files to temporary json tables
  (4) write the corresponding relational tables

"""

import os

db = os.environ.get('SMC_DB', 'migrate')

tables = {
   'account_creation_actions':{},
   'accounts':{},
   'blobs':{},
   'central_log':{},
   'client_error_log':{},
   'compute_servers':{},
   'cursors':{},
   'eval_inputs':{},
   'eval_outputs':{},
   'file_access_log':{},
   'file_use':{},
   'hub_servers':{'skip':True},  # ephemeral
   'instance_actions_log':{},
   'instances':{},
   'passport_settings':{},
   'password_reset':{},
   'password_reset_attempts':{},
   'patches':{},
   'project_log':{},
   'projects':{'fix_timestamps':True},
   'public_paths':{},
   'remember_me':{},
   'server_settings':{},
   'stats':{},
   'storage_servers':{},
   'syncstrings':{},
   'system_notifications':{}
}

import os, sys, threading

import fix_timestamps, json_to_csv, read_from_csv, populate_relational_table, export_from_rethinkdb, timing

timing.init()


parallel = export = count = False

def process(table):
    if table not in tables:
        raise RuntimeError("no such table: '%s'"%table)
    if count:
        # only count
        timing.start(table, 'count')
        print "%s:"%table,
        sys.stdout.flush()
        s = "echo 'select count(*) FROM %s' | psql %s"%(table, db)
        c = os.popen(s).read()
        i = c.rfind('-') + 1; j = c.rfind("(")
        print c[i:j].strip()
        timing.done(table, 'count')
        return

    T = tables[table]
    if T.get('skip', False):
        return
    print "get from rethinkdb as csv"
    path_to_json = export_from_rethinkdb.process(table, export)
    print "convert json to csv"
    path_to_csv = json_to_csv.process(path_to_json, export)
    print "fix timestamps in the csv file"
    if T.get('fix_timestamps') and export:
        fix_timestamps.process(path_to_csv)
    print "load csv into database"
    read_from_csv.process(path_to_csv)
    print "parse JSONB data in the database to relational data"
    populate_relational_table.process(table)

def run(table):
    threading.Thread(target = lambda : process(table)).start()

def usage():
    print 'Usage: ' + sys.argv[0] + ' ' + ' '.join(sorted(list(tables)))
    sys.exit(1)

if __name__ == "__main__":
    v = sys.argv[1:]
    if len(v) == 0:
        usage()
    for i in range(len(v)):
        if v[i] == '-p':
            parallel = True
            del v[i]
            break
    for i in range(len(v)):
        if v[i] == '-e':
            export = True
            del v[i]
            break
    for i in range(len(v)):
        if v[i] == '-c':
            count = True
            del v[i]
            break
    if len(v) == 1:
        if v[0] == 'all':
            v = list(tables)
            v.sort()
        elif v[0].startswith('-h'):
            usage()
    if len(v) == 1:
        process(v[0])
    elif len(v) > 1:
        if parallel:
            # run in parallel
            for table in v:
                run(table)
        else:
            # serial
            for table in v:
                process(table)
