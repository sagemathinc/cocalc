#!/usr/bin/env python

import os, shutil, sys

# NOTE: It's better if /backup is a btrfs filesystem mounted using /etc/fstab line like this:
# UUID=f52862ce-abdb-44ae-aea5-f649dfadc32b /tmp btrfs compress-force=lzo,noatime,nobootwait 0 2

# so works in crontab
os.environ['PATH']='/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin:/home/salvus/google-cloud-sdk/bin/'

os.chdir('/mnt/backup')

AUTH = '/home/salvus/smc/src/data/secrets/rethinkdb'

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
    cmd("time rethinkdb export -a `cat /home/salvus/smc/src/data/secrets/rethinkdb` -c db0 -d tmp %s"%t)
    cmd("mkdir -p data/smc; mv -v tmp/smc/* data/smc/")

def upload_to_gcs():
    # upload new pack file objects -- don't use -c, since it would be very slow on these and isn't needed, since
    # time stamps are enough
    cmd("time gsutil -m   rsync  -r /mnt/backup/bup/objects/ gs://smc-db-backup/admin0-bup/objects/")
    # Uplood everything else.  Here using -c is VERY important.
    for x in os.listdir("/mnt/backup/bup"):
        if x != 'objects' and os.path.isdir('/mnt/backup/bup/%s'%x):
            cmd("time gsutil -m  rsync -c -r /mnt/backup/bup/%s/ gs://smc-db-backup/admin0-bup/%s/"%(x,x))
    cmd("time gsutil -m  rsync -c /mnt/backup/bup/ gs://smc-db-backup/admin0-bup/")

def bup_save():
    os.environ["BUP_DIR"] = '/mnt/backup/bup'
    cmd("bup init")
    cmd("bup index /mnt/backup/data")
    cmd("du -sc $BUP_DIR")
    cmd("time bup save /mnt/backup/data -n master")
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
