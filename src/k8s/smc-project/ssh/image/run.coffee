###
This is the ssh gateway.  It:

  - Watches the database for which running projects require ssh access
  - Creates corresponding user accounts here that -- when ssh'd to -- forward the connection to the project

(c) 2016, William Stein, SageMathInc.

LICENSE: GPLv3

NOTE: This code doesn't depend on the rest of the SMC library.
###

fs            = require('fs')
async         = require('async')

rethinkdb = require('rethinkdb')

conn      = undefined  # connection to rethinkdb
DATABASE  = 'smc'

log = (m...) ->
    console.log("#{(new Date()).toISOString()}:",  m...)

connect_to_rethinkdb = (cb) ->
    log("connect_to_rethinkdb: connecting...")
    try
        authKey = fs.readFileSync("/secrets/rethinkdb/rethinkdb").toString().trim()
    catch
        authKey = undefined
    rethinkdb.connect {authKey:authKey, host:"rethinkdb-driver", timeout:15}, (err, _conn) ->
        if not err
            log("connect_to_rethinkdb: connected")
        conn = _conn
        cb?(err)

# Create a changefeed of all potentially requested-to-be-ssh'd to projects, which
# dynamically updates the projects object.
projects = {}
init_projects_changefeed = (cb) ->
    log("init_projects_changefeed")
    query = rethinkdb.db(DATABASE).table('projects').getAll(true, index:'run')
    query = query.pluck(['project_id', 'ssh', 'kubernetes'])
    query.changes(includeInitial:true, includeStates:true).run conn, (err, cursor) ->
        if err
            log('error setting up rethinkdb query', err)
            cb?(err)
            return
        state = 'initializing'
        cursor.each (err, x) ->
            if err
                throw "error in changefeed -- #{err}"
            if x.state
                state = x.state
                if state == 'ready'
                    log("init_projects_changefeed: done loading initial state of all projects.")
                    cb?()
                    return
            if x.new_val
                project_id = x.new_val.project_id
                z = projects[project_id] ?= {}
                z.ssh = x.new_val.ssh
                z.kubernetes = x.new_val.kubernetes
                if state == 'ready'
                    log("ssh change for '#{project_id}'")
                    reconcile(project_id)
                    return
            else if x.old_val  # no new value -- removed from changefeed result, so run is now false.
                project_id = x.old_val.project_id
                delete projects[project_id]
                reconcile(project_id)
            return

reconcile = (project_id, cb) ->
    x = projects[project_id]
    dbg = (m...) -> log("reconcile('#{project_id}')", m...)
    dbg()
    cb?()

reconcile_all = (cb) ->
    log("reconcile_all")
    v = (project_id for project_id, _ of projects)
    async.mapSeries(v, reconcile, (err)->cb?(err))

start_ssh_server = (cb) ->
    dbg = (m...) -> log("start_ssh_server", m...)
    dbg()
    cb?()

main = () ->
    async.series [connect_to_rethinkdb,
                  init_projects_changefeed,
                  reconcile_all,
                  start_ssh_server], (err) ->
        if err
            log("FAILED TO INITIALIZE! ", err)
            process.exit(1)
        else
            log("SUCCESSFULLY INITIALIZED; now RUNNING")

main()
