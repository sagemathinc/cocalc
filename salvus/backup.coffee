###
Backup -- Make a complete snapshotted dump of the system or individual projects to data/backup/
          Restore from this dump.


###

async = require('async')
misc  = require('misc')

{defaults, required} = misc
misc_node = require('misc_node')
winston = require('winston')


BACKUP_DIR = process.env['SALVUS_ROOT'] + '/data/backup/'

process.env['BUP_DIR'] = BACKUP_DIR + '/bup'

bup = (opts) ->
    opts = defaults opts,
        args    : []
        timeout : 10
        cb      : (err, output) ->
            if err
                winston.debug("Error -- #{err}")
            else
                winston.debug("bup output -- #{misc.to_json(output)}")

    if typeof(opts.args) == "string"
        command = "bup " + opts.args
        opts.args = []
    else
        command = "bup"

    misc_node.execute_code
        command : command
        args    : opts.args
        timeout : opts.timeout
        cb      : opts.cb


exports.backup = (opts) ->
    opts = defaults opts,
        keyspace : 'test'
        db_host  : 'localhost'
        cb       : required
    new Backup(opts.keyspace, opts.db_host, opts.cb)

class Backup
    constructor: (@keyspace, @db_host, cb) ->
        that = @
        async.series([
            (cb) ->
                 misc_node.execute_code
                     command : "mkdir"
                     args    : ['-p', process.env['BUP_DIR']]
                     cb      : cb
            (cb) ->
                bup(args:'init', cb:cb)  # initialize bup dir, if necessary
        ], (err) ->
            if err
                console.log("done init - err=#{err}")
                cb(err)
            else
                console.log("init; success")
                cb(false, that)
        )

    backup_all_projects: () =>
        # Backup all projects to the backup archive.  This creates a new commit
        # for each modified project.

    _projects: () =>
        # Query database for list of all (project_id, location) pairs.

    _backup_project: (project_id, location) =>
        # Backup the project with given id at the given location, if anything has changed
        # since the last backup.

    dump_keyspace: () =>
        # Dump all contents of database to data/backup/db/keyspace/ (which is first deleted),
        # then saves this directory to the bup archive (to "cassandra-"keyspace
        # branch with the commit the current timestamp).

    dump_table: (table) =>
        # Dump all contents of the given table to data/backup/db/keyspace/table

    restore_keyspace: (keyspace, commit) ->
        # 1. Restore the given keyspace (and commit, if given) from the bup archive
        # to the directory data/backup/db/keyspace
        # 2. Copy all data from the given backup into the current keyspace of the
        # database @keyspace.  If you want the result to be exactly what was backed up
        # in data/backup/db/keyspace call init_database first.

    init_keyspace: () ->
        # Delete everything from @keyspace, then initialize all tables
        # using the current db_schema file.




