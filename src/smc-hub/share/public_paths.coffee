###
Synchronized table of all public paths.

This will easily scale up to probably 100K+ distinct public paths, which will take year(s) to reach,
and by keeping everything in RAM, the share servers will be very, very fast (basically never hitting
the DB before returning results).  And, since we have everything in memory, we can do a lot of stupid
things involving iterating over everything before writing proper queries.
###

EventEmitter = require('events')

immutable = require('immutable')

misc = require('smc-util/misc')

exports.get_public_paths = (database, cb) ->
    p = new PublicPaths(database)
    p.on 'ready', ->
        cb(undefined, p)

class PublicPaths extends EventEmitter
    constructor: (@database) ->
        @_do_init()

    _do_init: =>
        misc.retry_until_success
            f  : @_init
            cb : => @emit('ready')
        return

    get: (project_id) =>
        if project_id?
            return @_map.get(project_id)
        else
            return @_map

    _handle_change: (id, x) =>
        x         ?= @_synctable.get(id)
        if not x? # should never happen by our design, but just in case.
            return
        project_id = x.get('project_id')
        cur        = @_map.get(project_id) ? immutable.Map()
        @_map      = @_map.set(project_id, cur.set(x.get('path'), x))

    _init: (cb) =>
        @database.synctable
            table    : 'public_paths'
            columns  : ['id', 'project_id', 'path', 'disabled', 'last_edited', 'last_saved']
            cb       : (err, synctable) =>
                if err
                    cb(err)
                else
                    @_synctable = synctable
                    synctable.on('change', @_handle_change)
                    @_map = immutable.Map()
                    @_synctable.get().forEach (x, id) =>
                        @_handle_change(id, x)
                        return
                    cb()
