#################################################################
#
# storage -- a node.js program/library for interacting with
# the SageMath Cloud's ZFS-based replicated distributed snapshotted
# project storage system.
#
#################################################################

winston   = require 'winston'
fs        = require 'fs'
cassandra = require 'cassandra'
async     = require 'async'
misc      = require 'misc'
misc_node = require 'misc_node'
{defaults, required} = misc


SALVUS_HOME=process.cwd()

# Connect to the cassandra database server; sets the global database variable.
database = undefined
connect_to_database = (cb) ->
    fs.readFile "#{SALVUS_HOME}/data/secrets/cassandra/hub", (err, password) ->
        if err
            cb(err)
        else
            new cassandra.Salvus
                hosts    : ['10.1.3.2','10.1.10.2']  # TODO
                keyspace : 'salvus'                  # TODO
                username : 'hub'
                consistency : 1   # for now; later switch to quorum
                password : password.toString().trim()
                cb       : (err, db) ->
                    database = db
                    cb(err)
# TODO
connect_to_database()

filesystem = (project_id) -> "projects/#{project_id}"
mountpoint = (project_id) -> "/projects/#{project_id}"

execute_on = (opts) ->
    opts = defaults opts,
        host    : required
        command : required
        cb      : undefined

    misc_node.execute_code
        command     : "ssh"
        args        : ["storage@#{opts.host}", opts.command]
        err_on_exit : true
        cb          : opts.cb

# Make a snapshot of a given project on a given host and record
# this in the database.
exports.snapshot = (opts) ->
    opts = defaults opts,
        project_id : required
        host       : required
        tag        : undefined
        cb         : undefined

    if opts.tag?
        tag = '-' + opts.tag
    else
        tag = ''
    now = misc.to_iso(new Date())
    name = filesystem(opts.project_id) + '@' + now + tag
    async.series([
        (cb) ->
            # 1. make snapshot
            execute_on
                host    : opts.host
                command : "sudo zfs snapshot #{name}"
                cb          : cb
        (cb) ->
            # 2. record in database that snapshot was made
            record_new_snapshot
                project_id : opts.project_id
                host       : opts.host
                name       : now + tag
                cb         : cb
        (cb) ->
            # 3. record that project needs to be replicated
            project_needs_replication
                project_id : opts.project_id
                cb         : cb
    ], (err) -> opts.cb?(err))

# Destroy snapshot of a given project on all hosts that have that snapshot,
# according to the database.  Updates the database to reflect success,
# when successful.

exports.destroy_snapshot = (opts) ->
    opts.cb?(true)

record_new_snapshot = (opts) ->
    opts.cb?()

project_needs_replication = (opts) ->
    opts.cb?()


