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

# Map from project_id-session_id to session stream objects.
session_cache = {}

# get_session callbacks
get_session_cbs = {}

exports.get_session = (opts) ->
    opts = defaults opts,
        local_hub  : required
        session_id : required
        file       : 'bash'
        args       : []
        options    : undefined
        cb         : required
    dbg = (m) -> opts.local_hub.dbg("console_session(id='#{opts.session_id}'): #{m}")
    dbg(JSON.stringify(opts.term_opts))

    # - Check if we already have this session over the given
    #   local_hub socket.  If so, just return it.
    key = "#{opts.local_hub.project_id}-#{opts.session_id}"
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
                        session_id : opts.session_id
                        channel    : channel
                        file       : opts.file
                        args       : opts.args
                        options    : opts.options
                timeout : 15
                cb      : cb
    ], (err) ->
        cbs = get_session_cbs[key]
        delete get_session_cbs[key]
        if err
            for cb in cbs
                cb(err)
        else
            session = session_cache[key] = new TerminalSession(socket, channel, dbg)
            session.once('end', -> delete session_cache[key])
            for cb in cbs
                cb(undefined, session)
    )

###

The TerminalSession object:

Methods:

   - write(data, cb) -- write data to the terminal

Events:

   - 'data', (data) -- data from the terminal
   - 'end', -- the terminal session disconnects/closes/fails for some reason;
               will be called exactly once


###

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
            #@dbg("got data='#{data}' from project")
            @emit('data', data)

    write : (data, cb) =>
        if @_closed
            cb?("closed")
        else
            #@dbg("writing data '#{data}' got from user to project socket")
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

