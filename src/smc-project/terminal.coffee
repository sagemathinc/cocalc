###
Terminal support inside a project

(c) SageMath, Inc. 2017
LICENSE: AGPLv3
###
{EventEmitter} = require('events')
pty_js         = require('pty.js')
async          = require('async')
message        = require('smc-util/message')
misc           = require('smc-util/misc')

# Map from session_id's to session objects
session_cache = {}

# Handle a request from a hub for a terminal session
exports.get_session = (socket, mesg) ->
    # - If we have already created this session.
    # - If session over the given socket, return an error -- the hub should know better.
    # - If session exists, but not given current socket, create new stream wrapper object,
    #   and return channel to hub.  This is the situation when you have multiple terminals
    #   (for one or more users) on the same session.
    # - If session does not exist, create new session, wrapper object and return channel
    #   to the hub.
    dbg = (m) -> winston.debug("get_session(id='#{mesg.session_id}'): #{m}")
    dbg(JSON.stringify(mesg.term_opts))

    # - Check if we already have this session, over this socket, with the requested channel.
    key = "#{mesg.session_id}-#{socket.id}-#{mesg.channel}"
    if session_cache[key]?
        socket.write_mesg('json', message.success(id:mesg.id))
        return

    # create terminal session and store in our cache
    options = mesg.options
    if not options?
        options =
            name : 'xterm'
            cols : 80
            rows : 30
            cwd  : process.env.HOME
            env  : process.env
    session = session_cache[key] = new TerminalSession(socket, mesg.channel, mesg.session_id, mesg.file, mesg.args, options)

    # set terminal session to remove from cache when it ends
    session.once 'end', ->
        delete session_cache[key]
        m = message.terminal_session_end
            id         : misc.uuid()
            session_id : mesg.session_id
            channel    : mesg.channel
        socket.write_mesg('json', m)

    # inform client that terminal session exists.
    socket.write_mesg('json', message.success(id:mesg.id))

###

The TerminalSession object plugs an actual forked off pty process
to a socket connection to a hub.  It then pushes all io back
and forth between these two.

Events:

   - 'data', (data) -- data from the terminal
   - 'end', -- the terminal session disconnects/closes/fails for some reason;
               will be called at most once.


###

# Map from session_id to pty term objects
pty_cache = {}

class TerminalSession extends EventEmitter
    constructor : (@socket, @channel, @session_id, file, args, options) ->

        # Create pty if not already defined
        @term = pty_cache[@session_id] ?= pty_js.spawn(file, args, options)

        @_closed = false
        @term.on('data', @_handle_data)
        @term.on 'exit', =>
            @close()
            # the terminal itself has died, so make sure and remove it from the cache.
            delete pty_cache[@session_id]

        @socket.on('mesg', @_handle_mesg)
        @socket.on('end', @close)

    _handle_mesg: (type, payload) =>
        if @_closed
            return
        if type == 'channel' and payload.channel == @channel
            @term.write(payload.data)

    _handle_data: (data) =>
        if @_closed
            return
        @socket.write_mesg(@channel, data)

    close: =>
        if @_closed
            return
        @_closed = true
        @term.removeListener('data', @_handle_data)
        @term.removeListener('exit', @close)
        @socket.removeListener('mesg', @_handle_mesg)
        @socket.removeListener('end', @close)
        delete @term
        delete @channel
        delete @session_id
        delete @socket
        @emit('end')
