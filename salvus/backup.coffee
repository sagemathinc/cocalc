###
Backup -- Make a complete snapshotted dump of the system or individual projects to data/backup/
          Restore from this dump.


###


EXCLUDES=['.bup', '.sage', '.sagemathcloud', '.forever', '.cache', '.fontconfig', '.texmf-var']

async = require('async')
misc  = require('misc')

{defaults, required} = misc
misc_node = require('misc_node')
winston = require('winston')

cassandra = require('cassandra')

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
        hosts    : ['localhost']
        cb       : required
    new Backup(opts.keyspace, opts.hosts, opts.cb)

class Backup
    constructor: (@keyspace, @hosts, cb) ->
        async.series([
            (cb) =>
                 misc_node.execute_code
                     command : "mkdir"
                     args    : ['-p', process.env['BUP_DIR']]
                     cb      : cb
            (cb) =>
                bup(args:'init', cb:cb)  # initialize bup dir, if necessary
            (cb) =>
                @db = new cassandra.Salvus(keyspace:@keyspace, hosts:@hosts, cb:cb)
        ], (err) =>
            if err
                cb(err)
            else
                cb(false, @)
        )

    backup_all_projects: (cb) =>
        # Backup all projects to the backup archive.  This creates a new commit
        # for each modified project.
        @projects (err, v) =>
            if err
                cb?(err)
            else
                winston.debug("Backing up #{v.length} projects...")
                f = () =>
                    if v.length > 0
                        x = v.pop()
                        @backup_project x[0], x[1], (err) =>
                            if err
                                cb?(err)
                            else
                                # do another
                                f()
                    else
                        cb?() # all done successfully
                f() # start it going.

    projects: (cb) =>    # cb(err, list_of_pairs))
        # Query database for list of all (project_id, location) pairs.
        @db.select
            table     : 'projects'
            json      : ['location']
            columns   : ['project_id', 'location']
            objectify : false
            cb        : (error, results) ->
                if error
                    cb(error)
                else
                    cb(false, results)


    backup_project: (project_id, location, cb) =>   # cb(err)
        # Backup the project with given id at the given location, if anything has changed
        # since the last backup.
        if location.username.length != 8
            # skip these that I use for devel/testing
            cb?()
            return

        user = "#{location.username}@#{location.host}"

        # First make the index on the remote machine
        args = ['on', user, 'index']
        for path in EXCLUDES
            args.push('--exclude')
            args.push(path)
        args.push('.')
        bup
            args    : args
            timeout : 3600
            cb      : (err, out) =>
                if err
                    # Error making the index
                    cb?(err)
                else
                    # Make index, now create the backup.
                    bup
                        args    : ['on', user, 'save', '--strip', '-9', '-n', project_id, '.']
                        timeout : 3600  # data could take a while to transfer (?)
                        cb      ( err, out) =>
                            cb?(err)

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




