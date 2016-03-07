###
Some convenient command-line shortcuts.  If you're working on the command line, do

    require('./c.coffee')

The functiosns below in some cases return things, and in some cases set global variables!  Read docs.

###

db_hosts = process.env.SMC_DB_HOSTS?.split(',') ? ['db0']

misc = require('smc-util/misc')
global.done = misc.done

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


global.close_unused_projects = (host) ->
    require('smc-hub/compute-client').compute_server
        db_hosts : db_hosts
        cb       : (err, s)->
            if err
                done("FAIL -- #{err}")
                return
            s.close_open_unused_projects
                dry_run      : false
                min_age_days : 50
                max_age_days : 1000
                threads      : 2
                host         : host
                cb           : done()

console.log("close_unused_projects('hostname') -- close all projects on that host not used in the last 60 days")

global.active_students = (cb) ->
    cb ?= done()
    require('./smc-hub/rethink').rethinkdb
        hosts:db_hosts
        pool:1
        cb: (err, db) ->
            if err
                cb("FAIL -- #{err}")
                return
            q = db.table('projects').hasFields('course')
            # only consider courses that have been touched in the last month
            q = q.filter(db.r.row("last_edited").gt(misc.days_ago(30)))
            q.pluck('project_id', 'course', 'last_edited', 'settings', 'users').run (err, t) ->
                if err
                    cb(err)
                    return
                days14 = misc.days_ago(14)
                days7  = misc.days_ago(7)
                days1  = misc.days_ago(1)
                # student pay means that the student is required to pay
                num_student_pay = (x for x in t when x.course.pay).length
                # prof pay means that student isn't required to pay but nonetheless project is on members only host
                num_prof_pay    = 0
                for x in t
                    if not x.course.pay  # student isn't paying
                        if x.settings?.member_host
                            num_prof_pay += 1
                            continue
                        for _, d of x.users
                            if d.upgrades?.member_host
                                num_prof_pay += 1
                                continue
                # free - neither student pays and project not on members only server
                num_free        = t.length - num_prof_pay - num_student_pay
                conversion_rate = 100*(num_student_pay + num_prof_pay) / t.length
                data =
                    conversion_rate : conversion_rate
                    num_student_pay : num_student_pay
                    num_prof_pay    : num_prof_pay
                    num_free        : num_free
                    num_1days       : (x for x in t when x.last_edited >= days1).length
                    num_7days       : (x for x in t when x.last_edited >= days7).length
                    num_14days      : (x for x in t when x.last_edited >= days14).length
                    num_30days      : t.length
                console.log(data)
                cb(undefined, data)

console.log("active_students() -- stats about student course projects during the last 30 days")

