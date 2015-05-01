db = new (require("cassandra").Salvus)(keyspace:'salvus', hosts:['10.240.97.10'], username:'hub', password:require('fs').readFileSync('data/secrets/cassandra/hub').toString().trim())

f = () ->
    s=require('bup_server').global_client(database:db, cb:(err,c)->console.log("err=",err);c.migrate_update_recent_loop(limit:12, max_age_h:6, cb:(e)->console.log("DONE",e)))
setTimeout(f, 5000)
