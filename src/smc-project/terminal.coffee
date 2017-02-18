###
Terminal support inside a project

(c) SageMath, Inc. 2017
LICENSE: AGPLv3
###
{EventEmitter} = require('events')
fs             = require('fs')

pty_js         = require('pty.js')
async          = require('async')

message        = require('smc-util/message')
misc           = require('smc-util/misc')

# Map from keys to session objects
session_cache = {}

get_key = (path, socket_id, channel) -> "#{path}-#{socket_id}-#{channel}"

abspath = (path) ->
    if not path?
        return
    if path.length == 0
        return process.env.HOME
    if path[0] == '/'
        return path  # already an absolute path
    return process.env.HOME + '/' + path

# Handle a request from a hub for a terminal session
exports.get_session = (socket, mesg) ->
    # - If we have already created this session.
    # - If session over the given socket, return an error -- the hub should know better.
    # - If session exists, but not given current socket, create new stream wrapper object,
    #   and return channel to hub.  This is the situation when you have multiple terminals
    #   (for one or more users) on the same session.
    # - If session does not exist, create new session, wrapper object and return channel
    #   to the hub.
    dbg = require('./local_hub').client.dbg("session.get_session(path='#{mesg.path}')")
    dbg(JSON.stringify(mesg))

    # - Check if we already have this session, over this socket, with the requested channel.
    key = get_key(mesg.path, socket.id, mesg.channel)
    if session_cache[key]?
        dbg("using cache")
        socket.write_mesg('json', message.success(id:mesg.id))
        return

    dbg("create terminal session and store in our cache")
    options =
        name : 'xterm'
        cols : 100
        rows : 40
        cwd  : abspath(mesg.path)
        env  : process.env

    session = session_cache[key] = new TerminalSession(socket, mesg.channel, mesg.path, 'bash', [], options, dbg)

    dbg("set terminal session to remove from cache when it ends")
    session.once 'end', ->
        delete session_cache[key]
        dbg("telling hub that terminal session ended")
        m = message.terminal_session_cancel
            id   : misc.uuid()
            path : mesg.path
        socket.write_mesg('json', m)

    dbg("inform client that terminal session exists.")
    socket.write_mesg('json', message.success(id:mesg.id))


exports.cancel_session = (socket, mesg) ->
    session_cache[get_key(mesg.path, socket.id, mesg.channel)]?.close()


###

The TerminalSession object plugs an actual forked off pty process
to a socket connection to a hub.  It then pushes all io back
and forth between these two.

Events:

   - 'data', (data) -- data from the terminal
   - 'end', -- the terminal session disconnects/closes/fails for some reason;
               will be called at most once.


###

# Map from path to pty term objects
pty_cache = {}

DEBUG = true

class TerminalSession extends EventEmitter
    constructor : (@socket, @channel, @path, file, args, options, @dbg) ->
        # Create pty if not already defined
        @dbg("pty_cache sessions = #{JSON.stringify(misc.keys(pty_cache))}")
        @term = pty_cache[@path] ?= pty_js.spawn(file, args, options)

        @_closed = false

        @term.on('data', @_handle_data)
        @term.on('exit', @_handle_term_exit)

        @socket.on('mesg', @_handle_mesg)
        @socket.on('end', @close)

    _handle_term_exit: =>
        @dbg("the terminal has died, so make sure and remove it from the cache.")
        delete pty_cache[@path]
        @close()

    _handle_mesg: (type, payload) =>
        if @_closed
            return
        if type == 'channel' and payload.channel == @channel
            data = payload.data
            if DEBUG
                @dbg("got data from hub; now sending to terminal: data='#{data}'")
            @term.write(data)

    _handle_data: (data) =>
        if @_closed
            return
        if DEBUG
            @dbg("got data from terminal; sending on to hub via channel='#{new Buffer(@channel)}'.  data='#{data}'")
        @socket.write_mesg('channel', {channel:@channel, data:data})

    close: =>
        if @_closed
            return
        ##@dbg('close')
        @_closed = true
        @term.removeListener('data', @_handle_data)
        @term.removeListener('exit', @_handle_term_exit)
        @socket.removeListener('mesg', @_handle_mesg)
        @socket.removeListener('end', @close)
        delete @term
        delete @channel
        delete @path
        delete @socket
        @emit('end')
        @removeAllListeners()
