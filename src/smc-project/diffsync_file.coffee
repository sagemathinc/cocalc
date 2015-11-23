############################################################################
#
# Differentially-Synchronized document editing sessions for the local_hub
#
# Here's a map
#                              (YOU ARE HERE)
#
#   [client]s.. ---> [hub] ---> [local hub] <--- [hub] <--- [client]s...
#                                   |
#                                  \|/
#                              [a file on disk]
#
#############################################################################

fs        = require('fs')

winston   = require('winston')
async     = require('async')

diffsync  = require('smc-util/diffsync')
misc_node = require('smc-util-node/misc_node')
common    = require('./common.coffee')

# The "live upstream content" of DiffSyncFile_client is the actual file on disk.
class DiffSyncFile_server extends diffsync.DiffSync
    constructor:(@cm_session, cb)  ->
        @path = @cm_session.path

        no_master    = undefined
        stats_path   = undefined
        stats        = undefined
        file         = undefined

        async.series([
            (cb) =>
                fs.stat @path, (_no_master, _stats_path) =>
                    no_master = _no_master
                    stats_path = _stats_path
                    cb()
            (cb) =>
                if no_master
                    # create
                    file = @path
                    misc_node.ensure_containing_directory_exists @path, (err) =>
                        if err
                            cb(err)
                        else
                            fs.open file, 'w', (err, fd) =>
                                if err
                                    cb(err)
                                else
                                    fs.close fd, cb
                else
                    # master exists
                    file = @path
                    stats = stats_path
                    cb()
            (cb) =>
                e = common.check_file_size(stats?.size)
                if e
                    cb(e)
                    return
                fs.readFile file, (err, data) =>
                    if err
                        cb(err); return
                    # NOTE: we immediately delete \r's since the client editor (Codemirror) immediately deletes them
                    # on editor creation; if we don't delete them, all sync attempts fail and hell is unleashed.
                    @init(doc:data.toString().replace(/\r/g,''), id:"file_server")
                    # winston.debug("got new file contents = '#{@live}'")
                    @_start_watching_file()
                    cb(err)

        ], (err) => cb(err, @live))

    kill: () =>
        if @_autosave?
            clearInterval(@_autosave)

        # It is very important to clean up watching files: Otherwise -- after 11 times -- it
        # will suddenly be impossible for the user to open a file without restarting
        # their project server! (NOT GOOD)
        fs.unwatchFile(@path, @_watcher)

    _watcher: (event) =>
        winston.debug("watch: file '#{@path}' modified.")
        if not @_do_watch
            winston.debug("watch: skipping read because watching is off.")
            return
        @_stop_watching_file()
        async.series([
            (cb) =>
                fs.stat @path, (err, stats) =>
                    if err
                        cb(err)
                    else
                        cb(common.check_file_size(stats.size))
            (cb) =>
                fs.readFile @path, (err, data) =>
                    if err
                        cb(err)
                    else
                        @live = data.toString().replace(/\r/g,'')  # NOTE: we immediately delete \r's (see above).
                        @cm_session.sync_filesystem(cb)
        ], (err) =>
            if err
                winston.debug("watch: file '#{@path}' error -- #{err}")
            @_start_watching_file()
        )

    _start_watching_file: () =>
        if @_do_watch?
            @_do_watch = true
            return
        @_do_watch = true
        winston.debug("watching #{@path}")
        fs.watchFile(@path, @_watcher)

    _stop_watching_file: () =>
        @_do_watch = false

    # NOTE: I tried using fs.watch as below, but *DAMN* -- even on
    # Linux 12.10 -- fs.watch in Node.JS totally SUCKS.  It led to
    # file corruption, weird flakiness and errors, etc.  fs.watchFile
    # above, on the other hand, is great for my needs (which are not
    # for immediate sync).
    # _start_watching_file0: () =>
    #     winston.debug("(re)start watching...")
    #     if @_fs_watcher?
    #         @_stop_watching_file()
    #     try
    #         @_fs_watcher = fs.watch(@path, @_watcher)
    #     catch e
    #         setInterval(@_start_watching_file, 15000)
    #         winston.debug("WARNING: failed to start watching '#{@path}' -- will try later -- #{e}")

    # _stop_watching_file0: () =>
    #     if @_fs_watcher?
    #         @_fs_watcher.close()
    #         delete @_fs_watcher

    snapshot: (cb) =>  # cb(err, snapshot of live document)
        cb(false, @live)

    _apply_edits_to_live: (edits, cb) =>
        if edits.length == 0
            cb(); return
        @_apply_edits edits, @live, (err, result) =>
            if err
                cb(err)
            else
                if result == @live
                    cb()  # nothing to do
                else
                    @live = result
                    @write_to_disk(cb)

    write_to_disk: (cb) =>
        @_stop_watching_file()
        misc_node.ensure_containing_directory_exists @path, (err) =>
            if err
                cb?(err); return
            fs.writeFile @path, @live, (err) =>
                @_start_watching_file()
                cb?(err)


# The live content of DiffSyncFile_client is our in-memory buffer.
class DiffSyncFile_client extends diffsync.DiffSync
    constructor:(@server) ->
        super(doc:@server.live, id:"file_client")
        # Connect the two together
        @connect(@server)
        @server.connect(@)

exports.DiffSyncFile_server = DiffSyncFile_server
exports.DiffSyncFile_client = DiffSyncFile_client