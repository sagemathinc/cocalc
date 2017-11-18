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

    # immutables List of ids that sorts the public_paths from newest (last edited) to oldest
    order: =>
        if @_order?
            return @_order
        v = []
        @_synctable.get().forEach (val, id) =>
            v.push([val.get('last_edited'), id])
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
                    @_synctable.on 'change', =>
                        # just delete cached for now...; later could be more efficient...
                        delete @_order
                    cb()
