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

    get: (id) =>
        return @_synctable.get(id)

    _update_public_paths: (id) =>
        if not id?
            # initialize
            v = @_public_paths_in_project = {}
            @_last_public_paths = @_synctable.get()   # have to track in order to deal with deletes
            @_last_public_paths.forEach (info, id) =>
                x = v[info.get('project_id')] ?= {}
                x[info.get('path')] = true
                return
        else
            # update
            v = @_public_paths_in_project ?= {}
            info = @get(id)
            if not info?
                info = @_last_public_paths.get(id)
                delete v[info.get('project_id')]?[info.get('path')]
            else
                x = v[info.get('project_id')] ?= {}
                x[info.get('path')] = true
            @_last_public_paths = @_synctable.get()


    is_public: (project_id, path) =>
        paths = @_public_paths_in_project?[project_id]
        if not paths?
            return false
        return !!misc.containing_public_path(path, paths)

    # immutables List of ids that sorts the public_paths from newest (last edited) to oldest
    order: =>
        if @_order?
            return @_order
        v = []
        @_synctable.get().forEach (info, id) =>
            v.push([info.get('last_edited'), id])
        v.sort((a,b) -> -misc.cmp(a[0] ? 0, b[0] ? 0))
        ids = (x[1] for x in v)
        @_order = immutable.fromJS(ids)
        return @_order

    _init: (cb) =>
        @database.synctable
            table    : 'public_paths'
            columns  : ['id', 'project_id', 'path', 'description', 'created', 'last_edited', 'last_saved', 'counter']
            where    : "disabled IS NOT TRUE"
            cb       : (err, synctable) =>
                if err
                    cb(err)
                else
                    @_synctable = synctable
                    @_synctable.on 'change', (id) =>
                        # just delete cached for now...; later could be more efficient...
                        delete @_order
                        @_update_public_paths(id)
                    @_update_public_paths()
                    cb()
