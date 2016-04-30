#!/usr/bin/env python
# coding: utf8
from __future__ import division

import os, shutil, sys
from os.path import join
from pytz import utc
from datetime import datetime, timedelta

# so works in crontab
os.environ['PATH']='/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin:/home/salvus/google-cloud-sdk/bin/'

BACKUP_DIR = '/backup/'

AUTH = '/home/salvus/smc/src/data/secrets/rethinkdb'

DB_HOST = "db1"

## the field name to be used to indicate where the blob has been backed up to
#BACKUP_FIELD = "backup"
## the value in the list of "backup" : [...] indicating that it is GCS
#GCS_VALUE = "gcs"
## the directory, where the "blob" data blobs are written to (the blobs metadata is still there, hint: "table-fields")
#BLOBSDIR = "blobs"

# this script only works relative to where it is stored
os.chdir(BACKUP_DIR)


def cmd(s):
    print s
    i = os.system(s)
    if i:
        raise RuntimeError

def now():
    return datetime.utcnow().replace(tzinfo = utc)


def tables():
    import rethinkdb as r
    r.connect(host=DB_HOST, auth_key=open(AUTH).read().strip(), timeout=20).repl()
    return r.db('smc').table_list().run()


def dump_tables(tables, table_fields = None):
    """
    tables is a string for one table name or a list of table names.

    table_fields is a dictionary, mapping from to table name to the list of fields to export (whitelist)
    """
    export_cmd = "time rethinkdb export --clients 1 --password-file /home/salvus/smc/src/data/secrets/rethinkdb -d tmp -c %s " % DB_HOST
    if isinstance(tables, basestring):
        tables = [tables]
    shutil.rmtree('tmp', ignore_errors=True)
    shutil.rmtree('tmp_part', ignore_errors=True)
    t = ' '.join(['-e smc.%s'%table for table in tables])
    cmd(export_cmd + t)
    cmd("mkdir -p data/smc; mv -v tmp/smc/* data/smc/")

    if table_fields is not None:
        for table, fields in table_fields.items():
            shutil.rmtree('tmp', ignore_errors=True)
            shutil.rmtree('tmp_part', ignore_errors=True)
            f = ','.join(fields)
            cmd(export_cmd + "-e smc.%s --fields %s" % (table, f))
            cmd("mkdir -p data/smc; mv -v tmp/smc/* data/smc/")


def upload_to_gcs(gs_url):
    """
    uploading the bup directory (with special handling of object files) to gs_url/bup
    and the "blobs" files to gs_url/blobs
    """
    # upload new pack file objects -- don't use -c, since it would be very slow on these and isn't needed, since
    # time stamps are enough
    cmd("time gsutil -m rsync -r %s/bup/objects/ %s/bup/objects/" % (BACKUP_DIR, gs_url))
    # Upload everything else.  Here using -c is VERY important.
    for x in os.listdir(join(BACKUP_DIR, "bup")):
        if x != 'objects' and os.path.isdir(join(BACKUP_DIR, 'bup/%s'%x)):
            cmd("time gsutil -m  rsync -c -r %s/bup/%s/ %s/bup/%s/"%(BACKUP_DIR, x, gs_url, x))
    cmd("time gsutil -m  rsync -c %s/bup/ %s" % (BACKUP_DIR, gs_url))

    # TODO Backup of blobs will be done differently
    ## Upload the blobs directory
    #cmd("time gsutil -m  rsync -c /backup/blobs/ %s/blobs" % gs_url)


def bup_save():
    os.environ["BUP_DIR"] = join(BACKUP_DIR, 'bup')
    cmd("bup init")
    cmd("bup index %s/data" % BACKUP_DIR)
    cmd("du -sc $BUP_DIR")
    cmd("time bup save %s -n master" % join(BACKUP_DIR, 'data'))
    cmd("du -sc $BUP_DIR")


# UNFINISHED
def dump_blobs():
    print "WARNING: blob backup will be done differently"
    return

    from os.path import join
    start = now()
    cmd("mkdir -p %s" % BLOBSDIR)

    # use 1296 (36^2) subdirectories to avoid excessively full directories
    # make sure all such subdirs exist (avoid such a checkin the loop below)
    from string import ascii_lowercase, digits
    chars = ascii_lowercase + digits
    for a in chars:
        for b in chars:
            path = join(BLOBSDIR, a + b)
            if not os.path.exists(path):
                os.mkdir(path)

    import rethinkdb as r
    r.connect(host=DB_HOST, auth_key=open(AUTH).read().strip(), timeout=20).repl()

    blobs = r.db('smc').table("blobs") # use all of them for the total number (faster)
    total = blobs.count().run()
    steps = total // 10000
    # blobs_query = blobs.filter(r.row["expire"] > now, default=True).pluck("id")
    blobs_query = blobs
    for idx, blob in enumerate(blobs_query.run()):
        if idx % steps == 0:
            pct = idx / total
            if pct > .05:
                eta = ((now() - start).total_seconds() * (1 - pct)) / 60.
                print "dumping blobs: %5.1%% (ETA: %5.1f minutes)" % (100. * pct, eta)
        id = blob["id"]

        blob_fn = join(BLOBSDIR, id[:2], id[2:])
        if not os.path.exists(blob_fn):
            with open(blob_fn, 'wb') as blobfile:
                blobfile.write(blob["blob"])
                # TODO optimistically tag this object to being backuped at GCS
                blobs.get(id).update({BACKUP_FIELD, r.row[BACKUP_FIELD].setInsert(GCS_VALUE)}).run()


def backup(args):
    if args.include:
        T = args.include.split(',')
    else:
        exclude = [x.strip() for x in args.exclude.split(',')]
        T = [x for x in tables() if x not in exclude]
    if args.table_fields is not None:
        import ast
        table_fields = ast.literal_eval(args.table_fields)
        for x in table_fields.keys():
            T.remove(x)
    else:
        table_fields = {}

    print 'Dumping %s'%", ".join(T)
    # the target URL at GCS, e.g. gs://smc-db-backup/admin0-0/
    gs_url = "gs://%s/%s" % (args.bucket, args.target)
    for e in table_fields.items():
        print 'Exporting table "%s" with fields %s only' % e
    print 'GCS storage target: "%s"' % gs_url
    # dump_blobs()
    dump_tables(T, table_fields)
    bup_save()
    upload_to_gcs(gs_url)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Backup the database to a local bup repo and upload that to a Google cloud storage bucket")
    subparsers = parser.add_subparsers(help='sub-command help')

    parser.add_argument("--bucket",
                        dest="bucket",
                        default="smc-db-backup",
                        help="The name of the storage bucket.")

    parser.add_argument("--target",
                        dest="target",
                        default="admin0-3",
                        help="The name of the default target directory on GCS in the bucket.")

    parser.add_argument("--exclude",
                        dest="exclude",
                        default="",
                        type=str,
                        help="don't backup comma separated list tables here.")

    parser.add_argument("--include",
                        dest="include",
                        default="",
                        type=str,
                        help="if anything given, only backup comma separated list tables given here.")

    parser.add_argument("--table-fields",
                        dest="table_fields",
                        default=None,
                        help="""explicitly list the fields in a table that should be backed up.
                        e.g. '{"blobs" : ["id", "size", "count", "created", "expire", "project_id", "last_active"]}' """)

    parser_backup = subparsers.add_parser('backup',
                                          help='dump tables, create bup snapshot,\
                                          and upload to google cloud storage bucket')
    parser_backup.set_defaults(func=backup)

    args = parser.parse_args()
    args.func(args)
