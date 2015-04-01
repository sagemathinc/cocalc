#!/usr/bin/env python

import os

def cmd(s):
    print s
    return os.popen(s).read()

def cmd2(s):
    print s
    if os.system(s):
        raise RuntimeError
    return

def backup_cassandra(dc, hosts):

    TARGET = "/backups/cassandra-dc%s"%(dc,)

    # first rsync the live snapshots and backups directories
    for host in hosts:
        print host

        for s in ['snapshots', 'backups']:
            print host, s
            cmd2("mkdir -p %s/latest/%s/%s/"%(TARGET,host,s))
            cmd2("time rsync -axH --delete --include '/*' --include '/*/*' --include='*/*/%s/***' --exclude='*' %s:/mnt/cassandra/data/data/ %s/latest/%s/%s/ "%(s, host, TARGET, host, s))

    # then save them via bup to a snapshot
    BUP_DIR = "%s/bup"%TARGET
    os.environ['BUP_DIR'] = BUP_DIR
    if not os.path.exists(BUP_DIR):
        os.makedirs(BUP_DIR)

    cmd2("bup init")
    cmd2("bup index %s/latest"%TARGET)
    cmd2("bup save -n master %s/latest"%TARGET)

    # NOTE: we don't use bup on directly on the targets, because
    # bup uses hundreds of megabytes of RAM, whereas rsync uses about 10MB!
    # It's critical also not to *load* the target hosts, and rsync is much
    # more efficient.

if __name__ == "__main__":
    backup_cassandra(5, ['smc%sdc5'%i for i in range(1,7)])
