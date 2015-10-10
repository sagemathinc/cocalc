#!/usr/bin/env python

import os, shutil, sys

# NOTE: It's better if /backup is a btrfs filesystem mounted using /etc/fstab line like this:
# UUID=f52862ce-abdb-44ae-aea5-f649dfadc32b /tmp btrfs compress-force=lzo,noatime,nobootwait 0 2

# so works in crontab
os.environ['PATH']='/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin:/home/salvus/google-cloud-sdk/bin/'

os.chdir('/backup')

AUTH = '/home/salvus/salvus/salvus/data/secrets/rethinkdb'

def cmd(s):
    print s
    i = os.system(s)
    if i:
        raise RuntimeError

def tables():
    import rethinkdb as r
    r.connect(host="db0", auth_key=open(AUTH).read().strip(), timeout=20).repl()
    return r.db('smc').table_list().run()

def dump_tables(tables):
    if isinstance(tables, str):
        tables = [tables]
    shutil.rmtree('tmp', ignore_errors=True)
    shutil.rmtree('tmp_part', ignore_errors=True)
    t = ' '.join(['-e smc.%s'%table for table in tables])
    cmd("time rethinkdb export -a `cat /home/salvus/salvus/salvus/data/secrets/rethinkdb` -c db0 -d tmp %s"%t)
    cmd("mkdir -p data/smc; mv -v tmp/smc/* data/smc/")

def upload_to_gcs():
    cmd("time gsutil -m  rsync -c -r /backup/bup gs://smc-db-backup/admin0-bup/")

def bup_save():
    os.environ["BUP_DIR"] = '/backup/bup'
    cmd("bup init")
    cmd("bup index /backup/data")
    cmd("du -sc $BUP_DIR")
    cmd("time bup save /backup/data -n master")
    cmd("du -sc $BUP_DIR")

def backup(args):
    exclude = [x.strip() for x in args.exclude.split(',')]
    T = [x for x in tables() if x not in exclude]
    print 'Dumping %s'%", ".join(T)
    dump_tables(T)
    bup_save()
    upload_to_gcs()

if __name__ == "__main__":

    import argparse
    parser = argparse.ArgumentParser(description="Backup the database to a local bup repo and upload that to a Google cloud storage bucket")
    subparsers = parser.add_subparsers(help='sub-command help')

    parser.add_argument("--exclude", help="don't backup comma separated list tables here", dest="exclude", default="", type=str)

    parser_backup = subparsers.add_parser('backup', help='dump tables, create bup snapshot, and upload to google cloud storage bucket')
    parser_backup.set_defaults(func=backup)

    args = parser.parse_args()
    args.func(args)
