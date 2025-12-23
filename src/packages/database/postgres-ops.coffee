#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: MS-RSL – see LICENSE.md for details
#########################################################################

###
PostgreSQL -- operations code, e.g., backups, maintenance, etc.

COPYRIGHT : (c) 2017 SageMath, Inc.
LICENSE   : MS-RSL
###

fs         = require('fs')
async      = require('async')

misc_node  = require('@cocalc/backend/misc_node')

{defaults} = misc = require('@cocalc/util/misc')
required   = defaults.required

{SCHEMA}   = require('@cocalc/util/schema')

# TypeScript imports for migrated methods
{getBackupTables} = require('./postgres/ops')

exports.extend_PostgreSQL = (ext) -> class PostgreSQL extends ext
    # Backups up the indicated tables.
    # WARNING: This is NOT guaranteed to give a point
    # in time backup of the entire database across tables!
    # The backup of each table is only consistent within that
    # table.  For CoCalc, this tends to be fine, due to our design.
    # The advantage of this is that we can backup huge tables
    # only once a week, and other smaller tables much more frequently.

    # For tables:
    #    - a list of tables
    #    - 'all' (the string) -- backs up everything in the SMC schema (not the database!)
    #    - 'critical' -- backs up only smaller critical tables, which we would desperately
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

    # Migrated to TypeScript: postgres/ops.ts
    _get_backup_tables: (tables) =>
        return getBackupTables(tables)

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
                        PGUSER     : @_user
                        PGHOST     : @_host
                    err_on_exit : true
                    cb      : cb
        ], (err) => opts.cb(err))

