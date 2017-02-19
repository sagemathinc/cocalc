###
Some convenient command-line shortcuts.  If you're working on the command line, do

    require('./c.coffee')

The functions below in some cases return things, and in some cases set global variables!  Read docs.

COPYRIGHT : (c) 2017 SageMath, Inc.
LICENSE   : AGPLv3
###

async = require('async')

# disable incredibly verbose DB debugging, which makes interactive use hard
require('smc-hub/postgres-base').DEBUG = false

global.misc = require('smc-util/misc')
global.done = misc.done
global.done1 = misc.done1
global.done2 = misc.done2

db = undefined
get_db = (cb) ->
    if db?
        cb?(undefined, db)  # HACK -- might not really be initialized yet!
        return db
    else
        db = require('./smc-hub/postgres').db()
        db.connect(cb:cb)
        return db

# get a connection to the db
global.db = (cb) ->
    global.db = get_db(cb)
    return
console.log("db() -- sets global variable db to a database")

global.gcloud = ->
    global.g = require('./smc-hub/smc_gcloud.coffee').gcloud(db:get_db())
    console.log("setting global variable g to a gcloud interface")

console.log("gcloud() -- sets global variable g to gcloud instance")

global.vms = () ->
    get_db (err) ->
        global.g = require('./smc-hub/smc_gcloud.coffee').gcloud(db:db)
        global.vms = global.g.vm_manager(manage:false)
console.log("setting global variable g to a gcloud interface and vms to vm manager")

console.log("vms() -- sets vms to gcloud VM manager (and g to gcloud interface)")

# make the global variable s be the compute server
global.compute_server = () ->
    return require('smc-hub/compute-client').compute_server
        cb       : (e,s)->
            global.s = s
console.log("compute_server() -- sets global variable s to compute server")

# make the global variable p be the project with given id and the global variable s be the compute server
global.proj = global.project = (id) ->
    require('smc-hub/compute-client').compute_server
        cb       : (e,s)->
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
    get_db (err) ->
        if err
            done("FAIL -- #{err}")
            return
        db.mark_account_deleted
            email_address : email
            cb            : (err) ->
                if err
                    done("FAIL -- #{err}")
                else
                    done("SUCCESS!")

console.log("delete_account 'email@foo.bar'  -- marks an account deleted")

DEFAULT_CLOSE_DAYS = 45

global.close_unused_projects = (host, cb) ->
    cb ?= done()
    require('smc-hub/compute-client').compute_server
        cb       : (err, s)->
            if err
                cb("FAIL -- #{err}")
                return
            s.close_open_unused_projects
                dry_run      : false
                min_age_days : DEFAULT_CLOSE_DAYS
                max_age_days : 1000
                threads      : 3
                host         : host
                cb           : (err) -> cb?(err)

console.log("close_unused_projects('hostname') -- closes all projects on that host not used in the last #{DEFAULT_CLOSE_DAYS} days")

global.close_unused_free_projects = () ->
    free = [0..3].map((n) -> "compute#{n}-us")
    async.mapSeries(free, global.close_unused_projects, done())

console.log("close_unused_free_projects() -- closes all projects on all free hosts not used in the last #{DEFAULT_CLOSE_DAYS} days")

global.active_students = (cb) ->
    cb ?= done()
    get_db (err) ->
        if err
            cb("FAIL -- #{err}")
            return
        db.get_active_student_stats
            cb : (err, stats) ->
                if err
                    console.log("FAILED")
                    cb(err)
                else
                    console.log(stats)
                    cb()
    return


console.log("active_students() -- stats about student course projects during the last 30 days")

global.save = (obj, filename) ->
    if filename.slice(filename.length - 5) != '.json'
        filename += '.json'
    fs.writeFileSync(filename, JSON.stringify(obj))

global.load = (filename) ->
    if filename.slice(filename.length - 5) != '.json'
        filename += '.json'
    JSON.parse(fs.readFileSync(filename))

global.stripe = (account_id) ->
    get_db (err, db) ->
        db.stripe_update_customer(account_id:account_id,cb:done())
console.log 'stripe [account_id] -- update stripe info about user'
