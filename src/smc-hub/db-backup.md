# Configuring db-backup

Remarks about how I configured db-backup.

## Install SMC

    sudo apt-get install dpkg-dev
    git clone ...

## ZFS

    apt-get install zfsutils-linux
    zpool create data -f /dev/sdb
    zfs set compression=lz4 data


## Install RethinkDB

- Install following https://www.rethinkdb.com/docs/install/ubuntu/
- Put rethinkdb's /var/lib/rethinkdb/ on the zfs pool: `zfs create data/rethinkdb; chown rethinkdb. /data/rethinkdb`
- Configure rethinkdb: copy the conf from db1, but add the line `directory=/data/rethinkdb`.
- Configure server tags by adding this to config file: `server-tag=backup`, but this didn't work, maybe due to connecting once without it, so I did `db.r.db('rethinkdb').table('server_config').get("279277af-2905-47b2-8764-f19648de0eb3").update(tags:['backup']).run(done())`

## Adding non-voting replicas for each table, one by one, depending on sharding, e.g.

    db.table('instance_actions_log').reconfigure(dryRun:false, shards:1, replicas:{default:3, backup:1}, primaryReplicaTag:'default', nonvotingReplicaTags:['backup']).run(done())

    db.table('public_paths').reconfigure(dryRun:false, shards:6, replicas:{default:3, backup:1}, primaryReplicaTag:'default', nonvotingReplicaTags:['backup']).run(done())

## Setup bup (and scripts)

    sudo zfs create data/bup
    sudo chown salvus. /data/bup
    sudo apt-get install bup
    sudo zfs set compression=off data/bup

    salvus@db-backup:/data/bup$ more update
    export BUP_DIR=/data/bup
    bup init
    bup index /data/rethinkdb
    bup save /data/rethinkdb -n master
    salvus@db-backup:/data/bup$ more push_to_gcloud
    #!/usr/bin/env python
    import os
    os.chdir('/data/bup')

    def cmd(s):
        print s
        if os.system(s):
            raise RuntimeError

    t = "gs://smc-db-backup/db-backup/bup-raw"

    cmd("time gsutil -m rsync -r objects/ %s/objects/"%t)
    # Upload everything else.  Here using -c is VERY important.
    for x in os.listdir('.'):
        if x != 'objects' and os.path.isdir(x):
            cmd("time gsutil -m  rsync -c -r %s/ %s/%s/"%(x, t, x))

    cmd("time gsutil -m  rsync -c ./ %s"%t)

## Other

Getting backfill status:

    db.r.db("rethinkdb").table("jobs").filter(type:'backfill', info:{destination_server:'backup'}).run((e,t)->global.t=t)