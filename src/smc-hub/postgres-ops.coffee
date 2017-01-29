###
PostgreSQL -- operations code, e.g., backups, maintenance, etc.

COPYRIGHT : (c) 2017 SageMath, Inc.
LICENSE   : AGPLv3
###

fs         = require('fs')
async      = require('async')

misc_node  = require('smc-util-node/misc_node')

{defaults} = misc = require('smc-util/misc')
required   = defaults.required

{SCHEMA}   = require('smc-util/schema')

{PostgreSQL} = require('./postgres')

class exports.PostgreSQL extends PostgreSQL
    # Backups up the indicated tables.
    # WARNING: This is NOT guaranteed to give a point
    # in time backup of the entire database across tables!
    # The backup of each table is only consistent within that
    # table.  For SMC, this tends to be fine, due to our design.
    # The advantage of this is that we can backup huge tables
    # only once a week, and other smaller tables much more frequently.

    # For tables:
    #    - a list of tables
    #    - 'all' (the string) -- backs up everything in the SMC schema (not the database!)
    #    - 'critical' -- backs up only smaller critical tables, which we would desparately
    #                    need for disaster recovery
    backup_tables: (opts) =>
        opts = defaults opts,
            tables : required   # list of tables, 'all' or 'critical'
            path   : 'backup'
            limit  : 3          # number of tables to backup in parallel
            bup    : true       # creates/updates a bup archive in backup/.bup,
                                # so we have snapshots of all past backups!
            cb     : required
        tables = @_get_backup_tables(opts.tables)
        dbg = @_dbg("backup_tables()")
        dbg("backing up tables: #{misc.to_json(tables)}")
        async.series([
            (cb) =>
                backup = (table, cb) =>
                    dbg("backup '#{table}'")
                    @_backup_table
                        table : table
                        path  : opts.path
                        cb    : cb
                async.mapLimit(tables, opts.limit, backup, cb)
            (cb) =>
                @_backup_bup
                    path : opts.path
                    cb   : cb
        ], (err) => opts.cb(err))

    _backup_table: (opts) =>
        opts = defaults opts,
            table : required
            path  : 'backup'
            cb    : required
        dbg = @_dbg("_backup_table(table='#{opts.table}')")
        cmd = "mkdir -p #{opts.path}; time pg_dump -Fc --table #{opts.table} #{@_database} > #{opts.path}/#{opts.table}.bak"
        dbg(cmd)
        misc_node.execute_code
            command : cmd
            timeout : 0
            home    : '.'
            env     :
                PGPASSWORD : @_password
                PGUSER     : 'smc'
                PGHOST     : @_host
            err_on_exit : true
            cb      : opts.cb

    _backup_bup: (opts) =>
        opts = defaults opts,
            path  : 'backup'
            cb    : required
        dbg = @_dbg("_backup_bup(path='#{opts.path}')")
        # We use no compression because the backup files are already all highly compressed.
        cmd = "mkdir -p '#{opts.path}' && export  && bup init && bup index '#{opts.path}' && bup save --strip --compress=0 '#{opts.path}' -n master"
        dbg(cmd)
        misc_node.execute_code
            command : cmd
            timeout : 0
            home    : '.'
            env     :
                BUP_DIR : "#{opts.path}/.bup"
            err_on_exit : true
            cb      : opts.cb

    _get_backup_tables: (tables) =>
        if misc.is_array(tables)
            return tables
        all = (t for t,s of SCHEMA when not s.virtual)
        if tables == 'all'
            return all
        else if tables == 'critical'
            # TODO: critical for backup or not should probably be in the schema itself, not here.
            v = []
            non_critical = ['stats','syncstrings','file_use','eval_outputs','blobs','eval_inputs','patches','cursors']
            for x in all
                if x.indexOf('log') == -1 and x not in non_critical
                    v.push(x)
            return v
        else
            return [tables]

    # Restore the given tables from the backup in the given directory.
    restore_tables: (opts) =>
        opts = defaults opts,
            tables : undefined    # same as for backup_tables, or undefined to use whatever we have in the path
            path   : '/backup/postgres'
            limit  : 5
            cb     : required
        backed_up_tables = (filename[...-4] for filename in fs.readdirSync(opts.path) when filename[-4..] == '.bak')
        if not opts.tables?
            tables = backed_up_tables
        else
            tables = @_get_backup_tables(opts.tables)
        for table in tables
            if table not in backed_up_tables
                opts.cb("there is no backup of '#{table}'")
                return
        dbg = @_dbg("restore_tables()")
        dbg("restoring tables: #{misc.to_json(tables)}")
        restore = (table, cb) =>
            dbg("restore '#{table}'")
            @_restore_table
                table : table
                path  : opts.path
                cb    : cb
        async.mapLimit(tables, opts.limit, restore, (err)=>opts.cb(err))

    _restore_table: (opts) =>
        opts = defaults opts,
            table : required
            path  : 'backup'
            cb    : required
        dbg = @_dbg("_restore_table(table='#{opts.table}')")
        async.series([
            (cb) =>
                dbg("dropping existing table if it exists")
                @_query
                    query : "DROP TABLE IF EXISTS #{opts.table}"
                    cb    : cb
            (cb) =>
                cmd = "time pg_restore -C -d #{@_database} #{opts.path}/#{opts.table}.bak"
                dbg(cmd)
                misc_node.execute_code
                    command : cmd
                    timeout : 0
                    home    : '.'
                    env     :
                        PGPASSWORD : @_password
                        PGUSER     : 'smc'
                        PGHOST     : @_host
                    err_on_exit : true
                    cb      : cb
        ], (err) => opts.cb(err))

