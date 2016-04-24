# Configuring db-backup

Remarks about how I configured db-backup.

## Install SMC

    sudo apt-get install dpkg-dev
    git clone ...


## Recreating it

    g.create_vm(name:'db-backup', disks:['db-backup', 'db-backup-rethinkdb', 'db-backup-bup'], type:'n1-highmem-4', preemptible : true, cb:done(), storage:'read_write', tags:['db'])

## Install RethinkDB

- Install following https://www.rethinkdb.com/docs/install/ubuntu/
- Put rethinkdb's /var/lib/rethinkdb/ on the zfs pool: `zfs create data/rethinkdb; chown rethinkdb. /data/rethinkdb`
- Configure rethinkdb: copy the conf from db1, but add the line `directory=/data/rethinkdb`.
- Configure server tags by adding this to config file: `server-tag=backup`, but this didn't work, maybe due to connecting once without it, so I did `db.r.db('rethinkdb').table('server_config').get("279277af-2905-47b2-8764-f19648de0eb3").update(tags:['backup']).run(done())`

## Adding non-voting replicas for each table, one by one, depending on sharding, e.g.

    db.table('instance_actions_log').reconfigure(dryRun:false, shards:1, replicas:{default:3, backup:1}, primaryReplicaTag:'default', nonvotingReplicaTags:['backup']).run(done())

    db.table('public_paths').reconfigure(dryRun:false, shards:6, replicas:{default:3, backup:1}, primaryReplicaTag:'default', nonvotingReplicaTags:['backup']).run(done())

## Setup bup (and scripts)

    mkdir data/bup
    chown salvus. /data/bup
    apt-get install bup

## Other

Getting backfill status:

    db.r.db("rethinkdb").table("jobs").filter(type:'backfill', info:{destination_server:'backup'}).run((e,t)->global.t=t)

Then check up:

    db.r.db("rethinkdb").table("jobs").filter(type:'backfill', info:{destination_server:'backup'}).run((e,s)->global.s=s)
    a = ([i,s[i].info.table, s[i].info.progress - t[i].info.progress, s[i].info.source_server] for i in [0...t.length] when s[i].info.progress != t[i].info.progress)
