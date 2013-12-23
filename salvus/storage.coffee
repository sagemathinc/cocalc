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

# Make a snapshot of a given project on a given host
exports.make_snapshot = (opts) ->
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
            # 1. try to make snapshot
            misc_node.execute_code
                command     : "ssh"
                args        : ["storage@#{opts.host}", "sudo zfs snapshot #{name}"]
                err_on_exit : true
                cb          : cb
        (cb) ->
            # 2. record in database that snapshot was made
            cb()
        (cb) ->
            # 3. record that project needs to be replicated
            cb()
    ], opts.cb)
