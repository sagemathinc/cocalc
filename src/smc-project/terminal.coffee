###
Terminal support inside a project

(c) SageMath, Inc. 2017
LICENSE: AGPLv3
###
DEBUG = true
CLIENT_TIMEOUT_M = 3

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
        @_syncdb = @client.sync_db
            path         : @path
            primary_keys : ['table', 'id']
        @_syncdb.once 'change', =>
            @dbg("_init_file: success")
            cb?(err)
        @_syncdb.on('change', @_update_syncdb)

    _update_syncdb: =>
        if not @_syncdb?
            return
        @dbg("syncdb change to #{JSON.stringify(@_syncdb.get())}")
        # TODO: redo this whole function to use immutable more effectively
        clients = @_syncdb.get(table:'clients').toJS()

        # delete clients that haven't updated recently
        cutoff = misc.minutes_ago(CLIENT_TIMEOUT_M)
        v = []
        for client in clients
            if (client.active ? 0) < cutoff
                @dbg("deleting non-active client: #{JSON.stringify(client)}")
                changed = true
                @_syncdb.delete
                    table : 'clients'
                    id    : client.id
            else
                v.push(client)
        clients = v
        @dbg("active clients: #{JSON.stringify(clients)}")

        settings = @_syncdb.get_one(table:'settings')
        if clients.length > 0
            # determine a size that works for all active clients
            {rows, cols} = clients[0]
            for client in clients.slice(1)
                if client.rows < rows
                    rows = client.rows
                if client.cols < cols
                    cols = client.cols
            if @_pty_rows != rows or @_pty_cols != cols
                @dbg("changing pty to (#{rows},#{cols})")
                @_pty?.resize(cols, rows)
                @_pty_rows = rows
                @_pty_cols = cols
                @_syncdb.set
                    rows  : rows
                    cols  : cols
                    table : 'settings'
                @_syncdb.save()
            else
                @dbg("leaving pty as (#{rows},#{cols})")

    _init_pty: (file='bash', args=[], options={}) =>
        if @_pty?
            @_pty.removeAllListeners()
            @_pty.destroy()
        @_pty = pty_js.spawn(file, args, options)
        @_pty.on('exit', @_handle_pty_exit)
        # TODO: also need to reset all @_connections with new pty...

    new_connection: (opts) =>
        opts = defaults opts,
            socket  : required
            channel : required
        key = @_key(opts.socket.id, opts.channel)
        connection = @_connections[key]
        if connection?
            return connection
        connection = @_connections[key] = new TerminalConnection(opts.socket, opts.channel, @_pty, @dbg)
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
    constructor : (@_socket, @_channel, @_pty, @dbg) ->
        # Create pty if not already defined
        @_closed = false
        @_pty.on('data', @_handle_data)
        @_pty.on('exit', @_handle_pty_exit)
        @_socket.on('mesg', @_handle_mesg)
        @_socket.on('end', @close)

    _handle_pty_exit: =>
        # TODO: maybe not...?
        @close()

    _handle_mesg: (type, payload) =>
        if @_closed
            return
        if type == 'channel' and payload.channel == @_channel
            data = payload.data
            if DEBUG
                @dbg("got data from hub; now sending to terminal: data='#{data}'")
            @_pty.write(data)

    _handle_data: (data) =>
        if @_closed
            return
        if DEBUG
            @dbg("got data from terminal; sending on to hub via channel='#{new Buffer(@_channel)}'.  data='#{data}'")
        @_socket.write_mesg('channel', {channel:@_channel, data:data})

    close: =>
        if @_closed
            return
        ##@dbg('close')
        @_closed = true
        @_pty.removeListener('data', @_handle_data)
        @_pty.removeListener('exit', @_handle_pty_exit)
        @_socket.removeListener('mesg', @_handle_mesg)
        @_socket.removeListener('end', @close)
        delete @_pty
        delete @_channel
        delete @path
        delete @_socket
        @emit('end')
        @removeAllListeners()
