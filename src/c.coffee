###
Some convenient command-line shortcuts.  If you're working on the command line, do

    require('./c.coffee')

The functiosns below in some cases return things, and in some cases set global variables!  Read docs.

###

db_hosts = [process.env.SMC_DB_HOSTS ? 'db0']

global.done = () ->
    start_time = new Date()
    return (args...) ->
        try
            s = JSON.stringify(args)
        catch
            s = args
        console.log("*** TOTALLY DONE! (#{(new Date() - start_time)/1000}s since start) ", s)

db = undefined
get_db = (cb) ->
    if db?
        cb(undefined, db)  # HACK -- might not really be initialized yet!
        return db
    else
        db = require('./smc-hub/rethink').rethinkdb(hosts:db_hosts, pool:1, cb:cb)
        return db

# get a connection to the db
global.db = ->
    return global.db = get_db()
console.log("db() -- sets global variable db to a database")

global.gcloud = ->
    global.g = require('./smc-hub/smc_gcloud.coffee').gcloud(db:get_db())
    console.log("setting global variable g to a gcloud interface")

console.log("gcloud() -- sets global variable g to gcloud instance")

global.vms = () ->
    require('./smc-hub/rethink').rethinkdb
        hosts : db_hosts
        pool  : 1
        cb    : (err, db) =>
            global.g = require('./smc-hub/smc_gcloud.coffee').gcloud(db:db)
            global.vms = global.g.vm_manager(manage:false)
    console.log("setting global variable g to a gcloud interface and vms to vm manager")

console.log("vms() -- sets vms to gcloud VM manager (and g to gcloud interface)")

# make the global variable s be the compute server
global.compute_server = () ->
    return require('smc-hub/compute-client').compute_server
        db_hosts:db_hosts
        cb:(e,s)->
            global.s=s
console.log("compute_server() -- sets global variable s to compute server")

# make the global variable p be the project with given id and the global variable s be the compute server
global.proj = global.project = (id) ->
    require('smc-hub/compute-client').compute_server
        db_hosts: db_hosts
        cb:(e,s)->
            global.s=s
            s.project
                project_id:id
                cb:(e,p)->global.p=p

console.log("project 'project_id' -- set p = project, s = compute server")

global.activity = (opts={}) ->
    opts.cb = (err, a) ->
        if err
            console.log("failed to initialize activity")
        else
            console.log('initialized activity')
            global.activity = a
    require('smc-hub/storage').activity(opts)

console.log("activity()  -- makes activity the activity monitor object")

global.delete_account = (email) ->
    require('./smc-hub/rethink').rethinkdb
        hosts:db_hosts
        pool:1
        cb: (err, db) ->
            if err
                done("FAIL -- #{err}")
                return
            db.mark_account_deleted
                email_address: email
                cb           : (err) ->
                    if err
                        done("FAIL -- #{err}")
                    else
                        done("SUCCESS!")
console.log("delete_account 'email@foo.bar'  -- marks an account deleted")
