###
Terminal support inside a project

(c) SageMath, Inc. 2017
LICENSE: AGPLv3
###
DEBUG = true

{EventEmitter} = require('events')

pty_js         = require('pty.js')
async          = require('async')

message        = require('smc-util/message')
misc           = require('smc-util/misc')

{defaults, required} = misc

# Handle a request from a hub for a connection to a terminal session.
exports.get_session = (client, socket, mesg) ->
    # - If we have already created this session.
    # - If session over the given socket, return an error -- the hub should know better.
    # - If session exists, but not given current socket, create new stream wrapper object,
    #   and return channel to hub.  This is the situation when you have multiple terminals
    #   (for one or more users) on the same session.
    # - If session does not exist, create new session, wrapper object and return channel
    #   to the hub.
    dbg = client.dbg("session.get_session(path='#{mesg.path}')")
    dbg(JSON.stringify(mesg))

    dbg("create terminal session and store in our cache")
    session = terminal(client, mesg.path).new_connection
        socket  : socket
        channel : mesg.channel

    dbg("inform client that terminal session exists.")
    socket.write_mesg('json', message.success(id:mesg.id))

exports.cancel_session = (socket, mesg) ->
    session_cache[get_key(mesg.path, socket.id, mesg.channel)]?.close()

terminal_cache = {}
terminal = (client, path) ->
    return terminal_cache[path] ?= new Terminal(client, path)

# Manages a collection of connections to a *single* pty.js session
class Terminal
    constructor: (@client, @path) ->
        @dbg = @client.dbg("Terminal(path='#{@path}')")
        @dbg("constructor")
        @_connections = {}
        @_init_pty()
        @_init_file()

    _key: (socket_id, channel) =>
        return "#{socket_id}-#{channel}"

    _init_file: (cb) =>
        @dbg("_init_file")
        @client.syncdb
            path : @path
            cb   : (err, syncdb) =>
                if err
                    @dbg("_init_file -- ERROR=#{err}")
                else
                    @dbg("_init_file: success")
                @_syncdb = syncdb
                @_syncdb.update
                    set :
                        rows : 40
                        cols : 120
                    where :
                        table : 'settings'
                @_syncdb.save()
                @_syncdb.on 'change', =>
                    @dbg("syncdb change to #{JSON.stringify(@_syncdb.select())}")

                cb?(err)

    _init_pty: (file='bash', args=[], options={}) =>
        if @pty?
            @pty.removeAllListeners()
            @pty.destroy()
        @pty = pty_js.spawn(file, args, options)
        @pty.on('exit', @_handle_pty_exit)
        # TODO: also need to reset all @_connections with new pty...

    new_connection: (opts) =>
        opts = defaults opts,
            socket  : required
            channel : required
        key = @_key(opts.socket.id, opts.channel)
        connection = @_connections[key]
        if connection?
            return connection
        connection = @_connections[key] = new TerminalConnection(opts.socket, opts.channel, @pty, @dbg)
        @dbg("set terminal connection to remove from cache when it ends")
        connection.once 'end', =>
            delete @_connections[key]
            @dbg("tell hub that terminal connection ended")
            opts.socket.write_mesg('json', message.terminal_session_cancel(path:@path))
        return connection

    _handle_pty_exit: =>
        # TODO


###

The TerminalConnection object plugs an actual forked off pty process
to a socket connection to a hub.  It then pushes all io back
and forth between these two.

Events:

   - 'data', (data) -- data from the terminal
   - 'end', -- the terminal session disconnects/closes/fails for some reason;
               will be called at most once.


###

class TerminalConnection extends EventEmitter
    constructor : (@socket, @channel, @pty, @dbg) ->
        # Create pty if not already defined
        @_closed = false
        @pty.on('data', @_handle_data)
        @pty.on('exit', @_handle_pty_exit)
        @socket.on('mesg', @_handle_mesg)
        @socket.on('end', @close)

    _handle_pty_exit: =>
        # TODO: maybe not...?
        @close()

    _handle_mesg: (type, payload) =>
        if @_closed
            return
        if type == 'channel' and payload.channel == @channel
            data = payload.data
            if DEBUG
                @dbg("got data from hub; now sending to terminal: data='#{data}'")
            @pty.write(data)

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
        @pty.removeListener('data', @_handle_data)
        @pty.removeListener('exit', @_handle_pty_exit)
        @socket.removeListener('mesg', @_handle_mesg)
        @socket.removeListener('end', @close)
        delete @pty
        delete @channel
        delete @path
        delete @socket
        @emit('end')
        @removeAllListeners()
