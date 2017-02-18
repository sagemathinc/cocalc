###
Terminal support from the hub

(c) SageMath, Inc. 2017

LICENSE: AGPLv3
###

{EventEmitter} = require('events')
async          = require('async')
message        = require('smc-util/message')
misc           = require('smc-util/misc')

{defaults, required} = misc

# Return an object that is just like the stream in the project,
# but is proxied over the socket connection to the local_hub
# using a binary channel.

# Map from project_id-path to session stream objects.
session_cache = {}

# get_session callbacks
get_session_cbs = {}

get_key = (project_id, path) -> "#{project_id}-#{path}"

exports.get_session = (opts) ->
    opts = defaults opts,
        local_hub : required
        path      : required
        cb        : required
    dbg = (m) -> opts.local_hub.dbg("get_session(path='#{opts.path}'): #{m}")
    dbg(JSON.stringify(opts.term_opts))

    # - Check if we already have this session over the given
    #   local_hub socket.  If so, just return it.
    key = get_key(opts.local_hub.project_id, opts.path)
    if session_cache[key]?
        opts.cb(undefined, session_cache[key])
        return

    if get_session_cbs[key]?
        dbg("add request to queue")
        get_session_cbs[key].push(opts.cb)
        return
    else
        get_session_cbs[key] = [opts.cb]

    dbg("create session and add to cache")
    socket = channel = undefined

    async.series([
        (cb) ->
            dbg("get socket connection to the project")
            opts.local_hub.local_hub_socket (err, _socket) ->
                socket = _socket
                cb(err)
        (cb) ->
            dbg("send message to local_hub requesting terminal session")
            channel = socket.get_channel()
            opts.local_hub.call
                mesg    :
                    message.terminal_session_create
                        project_id : opts.local_hub.project_id
                        path       : opts.path
                        channel    : channel
                timeout : 20
                cb      : cb
    ], (err) ->
        cbs = get_session_cbs[key]
        delete get_session_cbs[key]
        if err
            for cb in cbs
                cb(err)
            # Important -- things didn't work -- at least strongly encourage local
            # hub to cancel this session, so that it doesn't keep sending data back to us.
            opts.local_hub.call
                mesg    :
                    message.terminal_session_cancel
                        path    : opts.path
                        channel : channel
        else
            session = session_cache[key] = new TerminalSession(socket, channel, dbg)
            session.once('end', -> delete session_cache[key])
            for cb in cbs
                cb(undefined, session)
    )


# The hub calls this when a terminal session is terminated by the project.
# Of course the socket need NOT be disconnected.
exports.session_ended = (project_id, path) ->
    session_cache[get_key(project_id, path)]?.close()

###

The TerminalSession object:

Methods:

   - write(data, cb) -- write data to the terminal

Events:

   - 'data', (data) -- data from the terminal
   - 'end', -- the terminal session disconnects/closes/fails for some reason;
               will be called exactly once


###

DEBUG = true

class TerminalSession extends EventEmitter
    constructor : (@socket, @channel, @dbg) ->
        @_closed = false
        @socket.on('mesg', @_handle_mesg)
        @socket.on('end', @close)

    _handle_mesg: (type, payload) =>
        if @_closed
            return
        if type == 'channel' and payload.channel == @channel
            data = payload.data
            if DEBUG
                @dbg("got data='#{data}' from project")
            @emit('data', data)

    write : (data, cb) =>
        if @_closed
            cb?("closed")
        else
            if DEBUG
                @dbg("writing data '#{data}' got from user to project socket via channel #{new Buffer(@channel)}")
            @socket.write_mesg('channel', {channel:@channel, data:data}, cb)

    close: =>
        if @_closed
            return
        @_closed = true
        @socket.removeListener('mesg', @_handle_mesg)
        @socket.removeListener('end', @close)
        delete @socket
        delete @channel
        @emit('end')  # emitted exactly once
        @removeAllListeners()

