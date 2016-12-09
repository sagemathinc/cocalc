###
Test suite for PostgreSQL interface and functionality.
###

DEBUG    = false
DEBUG = true
RESET    = false # if true, completely deletes database before running tests -- do on schema change for now.
PORT     = 5432  # TODO
DATABASE = 'test-fubar'

async = require('async')
postgres = require('../postgres')

exports.db = undefined
exports.setup = (cb) ->
    async.series([
        (cb) ->
            if exports.db? or not RESET
                cb()
            else
                # first time so delete the entire database
                dropdb(cb)
        (cb) ->
            exports.db = postgres.db(database:DATABASE, port:PORT, debug:DEBUG, cb:cb)
        (cb) ->
            exports.db.update_schema(cb:cb)
        (cb) ->
            exports.teardown(cb)
    ], cb)

exports.teardown = (cb) ->
    # just deletes contents of tables, not schema.
    exports.db?.delete_all(cb:cb, confirm:'yes')

# create n accounts
exports.create_accounts = (n, cb) ->
    f = (i, cb) ->
        exports.db.create_account
            first_name    : "Firstname#{i}"
            last_name     : "Lastname#{i}"
            email_address : "sage+#{i}@sagemath.com"
            password_hash : "#{i}"
            cb            : cb
    async.map([0...n], f, cb)

# create n projects owned by account_id
exports.create_projects = (n, account_id, cb) ->
    f = (i, cb) ->
        exports.db.create_project
            title      : "Project #{i}"
            description: "Description #{i}"
            account_id : account_id
            cb         : cb
    async.map([0...n], f, cb)

# Start with a clean slate -- delete the test database -- TODO: custom rethinkdb
dropdb = (cb) =>
    misc_node = require('smc-util-node/misc_node')
    misc_node.execute_code
        command : 'dropdb'
        args    : ['--port', PORT, DATABASE]
        cb      : (err) -> cb()  # non-fatal -- would give error if db doesn't exist

