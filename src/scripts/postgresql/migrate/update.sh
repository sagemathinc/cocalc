#!/usr/bin/env bash
set -e
cd /migrate/smc/src
. smc-env
echo "require('./smc-hub/rethink').rethinkdb(hosts:['db0','db1','db2','db3','db4','db5'], pool:10, cb:(err,db)->db.update_migrate(hours:$1, cb:(err)->console.log('DONE',err); process.exit(if err then 1 else 0)))" | coffee
