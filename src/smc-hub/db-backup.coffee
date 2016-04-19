###
Database backup daemon, which runs on db-backup.

db-backup should be a RethinkDB node that contains a non-voting replica of all tables that matter.
It should be possible to restart this server without access to the rest of the database and just
use it.   When it reconnects it backfills, which should be fast and have minimal impact on the rest
of the cluster (unlike dumping all data to json).

See db-backup.md for configuration and other notes.

This daemon is responsible for:

 - creating and deleting rotating ZFS snapshots of the state of the database on the local file system
 - creating bup snapshots of the database files (from the last snapshot)
 - uploading bup repo to gcloud nearline storage

William Stein, SageMath, Inc., (c) 2016.
###

os          = require('os')
{join}      = require('path')

winston     = require('winston')
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, {level: 'debug', timestamp:true, colorize:true})

async       = require('async')

misc_node   = require('smc-util-node/misc_node')

rolling_snapshots = require('./rolling_snapshots')


start_server = exports.start_server = (cb) ->
    host = os.hostname()
    dbg  = (m) -> winston.debug("db-backup(host='#{host}'): #{m}")
    dbg()

    task_update_snapshots = (cb) ->
        dbg("task_update_snapshots")
        rolling_snapshots.update_snapshots
            filesystem : 'data/rethinkdb'
            five       : 0   # no 5-minute
            hourly     : 24  # 1 day of hourly snapshots -- undo in case of idiocy
            daily      : 7   # 1 week of daily
            weekly     : 4   # a month of weekly
            monthly    : 2   # 2 monthly
            cb         : cb

    task_update_bup = (cb) ->
        dbg("task_update_bup")
        
    task_upload_bup_to_gcloud = (cb) ->
        dbg("task_upload_bup_to_gcloud")
        cb()
        return
        misc_node.execute_code
            command     : "/data/bup/push_to_gcloud"
            bash        : true
            timeout     : 60*20
            err_on_exit : true
            cb          : cb


    do_tasks = () ->
        async.series [task_update_snapshots, task_update_bup, task_upload_bup_to_gcloud], (err) ->
            if err
                dbg("FAIL: error -- #{err}")
            else
                dbg("SUCCESS")

    #setInterval(do_tasks, 60*60*1000)
    do_tasks()


###########################
# Daemon -- Command line interface
###########################

program = require('commander')
daemon  = require('start-stop-daemon')

LOGS = join(process.env.HOME, 'logs')
program.usage('[start/stop/restart/status] [options]')
    .option('--pidfile [string]', 'store pid in this file', String, "#{LOGS}/db-backup.pid")
    .option('--logfile [string]', 'write log to this file', String, "#{LOGS}/db-backup.log")
    .option('-e')   # gets passed by coffee -e
    .parse(process.argv)

main = () ->
    winston.debug("running as a deamon")
    # run as a server/daemon (otherwise, is being imported as a library)
    process.addListener "uncaughtException", (err) ->
        winston.debug("BUG ****************************************************************************")
        winston.debug("Uncaught exception: " + err)
        winston.debug(err.stack)
        winston.debug("BUG ****************************************************************************")

    async.series([
        (cb) ->
            misc_node.ensure_containing_directory_exists(program.pidfile, cb)
        (cb) ->
            misc_node.ensure_containing_directory_exists(program.logfile, cb)
        (cb) ->
            daemon({max:9999, pidFile:program.pidfile, outFile:program.logfile, errFile:program.logfile, logFile:'/dev/null'}, start_server)
    ])

if program._name.split('.')[0] == 'db-backup'
    main()
