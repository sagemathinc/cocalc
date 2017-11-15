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

    _init: (cb) =>
        @database.synctable
            table    : 'public_paths'
            columns  : ['project_id', 'path', 'description', 'created', 'last_edited', 'last_saved', 'counter']
            where    : "disabled IS NOT TRUE"
            cb       : (err, synctable) =>
                if err
                    cb(err)
                else
                    @_synctable = synctable
                    cb()
