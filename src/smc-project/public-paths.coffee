###
Monitoring of public paths in a running project.
###

UPDATE_INTERVAL_S = 20
#UPDATE_INTERVAL_S = 5  # for testing

fs         = require('fs')
{execFile} = require('child_process')

async = require('async')

exports.monitor = (client) ->
    return new MonitorPublicPaths(client)

class MonitorPublicPaths
    constructor: (@_client) ->
        if process.env.COCALC_EPHEMERAL_STATE == "yes"
            # nothing to do -- can't do anything with public paths if can't write to db.
            return
        @_init()

    dbg: (f) =>
        return @_client.dbg("MonitorPublicPaths.#{f}")

    _init: =>
        dbg = @dbg('_init')
        dbg("initializing public_paths table")
        pattern =
            id          : null
            project_id  : @_client.client_id()
            path        : null
            last_edited : null
            disabled    : null
        @_table = @_client.sync_table2(public_paths : [pattern])

        dbg("initializing find updater to run every #{UPDATE_INTERVAL_S} seconds")
        dbg1 = @dbg("do_update")
        do_update = =>
            dbg1("doing update...")
            @update (err) =>
                dbg1("finished an update", err)
        @_interval = setInterval(do_update, UPDATE_INTERVAL_S*1000)

    close: =>
        d = @dbg("close")
        if not @_table?
            d('already closed')
            return
        d('closing...')
        @_table.close()
        delete @_table
        clearInterval(@_interval)
        delete @_interval

    update: (cb) =>
        if not @_table? or @_table.get_state() != "connected"
            cb()
            return
        d = @dbg('update')
        work = []
        @_table.get()?.forEach (info, id) =>
            if not info.get('disabled')
                work.push
                    id          : id
                    path        : info.get('path')
                    last_edited : (info.get('last_edited') ? 0) - 0
            return
        async.mapLimit(work, 1, @_update_path, cb)

    _update_path: (opts, cb) =>
        {id, path, last_edited} = opts
        #d = @dbg("_update_path('#{path}')")
        d = ->  # too verbose...
        # If any file in the given path was modified after last_edited, update last_edited to
        # when the path was modified.
        locals =
            changed: false
        async.series([
            (cb) =>
                d('lstat')
                fs.lstat path, (err, stats) =>
                    if err
                        d('error (no such path?)', err)
                        cb(err)
                        return
                    locals.stats = stats
                    if locals.stats.mtime > last_edited
                        d('clearly modified, since path changed')
                        locals.changed = true
                    cb()
                    return
            (cb) =>
                if locals.changed
                    # already determined above
                    cb(); return
                if not locals.stats.isDirectory()
                    # is file, but mtime older, so done.
                    cb(); return
                # Is a directory, and directory mtime hasn't changed; still possible
                # a file in some subdir has changed, so have to do a full scan.
                days = (new Date() - last_edited)/(1000*60*60*24)
                # This input to find will give return code 1 if and only if it finds a FILE
                # modified since last_edited (since we know the path exists).
                args = [process.env.HOME + '/' + path, '-type', 'f', '-mtime', "-#{days}", '-exec', 'false', '{}', '+']
                d("find with args=", args)
                execFile 'find', args, (err) =>
                    if err?.code
                        d('some files changed')
                        locals.changed = true
                    else
                        d('nothing changed')
                    cb()
            (cb) =>
                if not locals.changed
                    cb()
                else
                    d('change -- update database table')
                    last_edited = new Date()
                    @_table.set({id:id, last_edited:last_edited}, 'shallow')
                    @_table.save()  # and also cause change to get saved to database.
                    # This can be more robust (if actually connected).
                    @_client.query({query:{id:id, last_edited:last_edited}, cb:cb})
        ], (err) =>
            # ignore err
            cb?()
        )
