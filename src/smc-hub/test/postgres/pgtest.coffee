###
Test suite for PostgreSQL interface and functionality.

WARNING: The server timezone **MUST BE** UTC everywhere, or tests will fail!

COPYRIGHT : (c) 2017 SageMath, Inc.
LICENSE   : AGPLv3
###

require('coffee-cache')

DEBUG    = !!(process.env['SMC_DEBUG'] ? false)
#DEBUG = true
# if true, completely deletes database before running tests -- do on schema change for now.
RESET    = !!(process.env['SMC_DB_RESET'] ? false)
#RESET = true
DATABASE = 'test-fubar'

async = require('async')
postgres = require('../../postgres')

if DEBUG
    log = (args...) -> console.log('pgtest: ', args...)
else
    log = ->

exports.db = undefined
exports.setup = (cb) ->
    async.series([
        (cb) ->
            if exports.db?
                log("db already defined")
                cb()
            else
                exports.db = postgres.db(database:DATABASE, debug:DEBUG, connect:false)
                if RESET
                    log("delete the entire database (e.g., since schema could have changed from previous runs)")
                    dropdb(cb)
                else
                    cb()
        (cb) ->
            log("ensure db defined and we are connected")
            exports.db.connect(cb:cb)
        (cb) ->
            log("connected")
            exports.db.update_schema(cb:cb)
        (cb) ->
            log("drop contents of tables")
            exports.teardown(cb)
    ], (err) ->
        if err
            log("ERROR running setup", err)
        cb(err)
    )

exports.teardown = (cb) ->
    # just deletes contents of tables, not schema.
    exports.db?.delete_all(cb:cb, confirm:'yes')

# create n accounts
exports.create_accounts = (n, m, cb) ->
    if typeof(m) == 'function'
        cb = m
        m = 0
    f = (i, cb) ->
        exports.db.create_account
            first_name    : "Firstname#{i}"
            last_name     : "Lastname#{i}"
            email_address : "sage+#{i}@sagemath.com"
            cb            : cb
    async.map([m...n+m], f, cb)

# create n projects owned by the account_id's in the array account_ids (or string account_id)
exports.create_projects = (n, account_ids, cb) ->
    if typeof(account_ids) == "string"
        account_id = account_ids
        collabs = []
    else
        account_id = account_ids[0]
        collabs = account_ids.slice(1)
    f = (i, cb) ->
        project_id = undefined
        async.series([
            (cb) ->
                exports.db.create_project
                    title      : "Project #{i}"
                    description: "Description #{i}"
                    account_id : account_id
                    cb         : (err, _project_id) ->
                        project_id = _project_id; cb(err)
            (cb) ->
                g = (id, cb) ->
                    exports.db.add_user_to_project
                        account_id: id
                        project_id: project_id
                        cb        : cb
                async.map(collabs, g, cb)
        ], (err) -> cb(err, project_id))
    async.map([0...n], f, cb)

# Used to test a sequence of results from a changefeed (see usage below)
exports.changefeed_series = (v, cb) ->
    n = -1
    done = (err) ->
        cb?(err)
        cb = undefined
    f = (err, x) ->
        if DEBUG
            if err
                console.log("changefeed_series: err=",err)
            else
                console.log("changefeed_series: x=#{JSON.stringify(x)}")
        n += 1
        if err
            done(err)
            return
        h = v[n]
        if not h?
            done()
            return
        if typeof(h) != 'function'
            throw Error("each element of v must be a function, but v[#{n}]='#{h}' is not!")
        h x, (err) ->
            if err
                done(err)
            else
                if n+1 >= v.length
                    # success
                    done()
    return f

# Start with a clean slate -- delete the test database
dropdb = (cb) ->
    misc_node = require('smc-util-node/misc_node')
    log 'delete the test database'
    if not exports.db?
        console.log "ERROR -- exports.db is not defined!"
        cb()
        return
    port = exports.db._port
    host = exports.db._host
    misc_node.execute_code
        command : 'dropdb'
        args    : ['--port', port, '--host', host, DATABASE]
        cb      : (err) ->
            exports.db.disconnect()
            log 'done deleting test database'
            if err
                log('WARNING: dropdb error', err)
            cb()  # non-fatal -- would give error if db doesn't exist

