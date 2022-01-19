#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

# misc JS functionality that only makes sense on the node side (not on the client)

assert  = require('assert')
fs      = require('fs')
net     = require('net')
{getLogger}   = require('./logger')
async   = require('async')
path    = require('path')

misc = require('@cocalc/util/misc')
{walltime, defaults, required, to_json} = misc
message = require('@cocalc/util/message')

# Asynchronous JSON functionality: these are slower but block the main thread *less*.
#
# - to_json_async - convert object to JSON string without blocking.
#   This uses https://github.com/ckknight/async-json
#
# - from_json_async - convert JSON string to object/etc., without blocking,
#   though 2x times as slow as JSON.parse.  This uses https://github.com/bjouhier/i-json
#
# TESTS:
#
# m=require('misc_node');s=JSON.stringify({x:Buffer.alloc(10000000).toString('hex')}); d=new Date(); m.from_json_async(string: s, chunk_size:10000, cb: (e, r) -> console.log(e, new Date() - d)); new Date() - d

# exports.to_json_async = (opts) ->
#     opts = defaults opts,
#         obj        : required    # Javascript object to convert to a JSON string
#         cb         : required    # cb(err, JSON string)
#
# ijson = require('i-json')
# exports.from_json_async = (opts) ->
#     opts = defaults opts,
#         string     : required   # string in JSON format
#         chunk_size : 50000      # size of chunks to parse -- affects how long this blocks the main thread
#         cb         : required
#     p = ijson.createParser()
#     s = opts.string
#     f = (i, cb) ->
#         #t = misc.mswalltime()
#         p.update(s.slice(i*opts.chunk_size, (i+1)*opts.chunk_size))
#         #console.log("update: #{misc.mswalltime(t)}")
#         setTimeout(cb, 0)
#     async.mapSeries [0...s.length/opts.chunk_size], f, (err) ->
#         opts.cb(err, p.result())

# Our TCP messaging system.  We send a message by first
# sending the length, then the bytes of the actual message.  The code
# in this section is used by:
#       * hub -- to communicate with sage_server and console_server

# Extend the socket object so that listens to all data coming in on this socket
# and fires a 'mesg' event, along with the JSON object or blob in the message
# So, one listens with:
#             socket.on('mesg', (type, value) -> ...)
# where type is one if 'json' or 'blob'.
#
# Calling this function also adds a function .write_mesg to the socket, so that
#             socket.write_mesg(type, data)
# will send the message of the given type on the socket.   When type='json',
# data is just a JSON-able object.  When type='blob', data={uuid:..., blob:...};
# since every blob is tagged with a uuid.


exports.enable_mesg = enable_mesg = (socket, desc) ->
    winston = getLogger('misc_node.enable_mesg')
    socket.setMaxListeners(500)  # we use a lot of listeners for listening for messages
    socket._buf = null
    socket._buf_target_length = -1
    socket._listen_for_mesg = (data) ->
        socket._buf = if socket._buf == null then data else Buffer.concat([socket._buf, data])
        loop
            if socket._buf_target_length == -1
                # starting to read a new message
                if socket._buf.length >= 4
                    socket._buf_target_length = socket._buf.readUInt32BE(0) + 4
                else
                    return # have to wait for more data to find out message length
            if socket._buf_target_length <= socket._buf.length
                # read a new message from our buffer
                type = socket._buf.slice(4, 5).toString()
                mesg = socket._buf.slice(5, socket._buf_target_length)
                switch type
                    when 'j'   # JSON
                        s = mesg.toString()
                        try
                            # Do not use "obj = JSON.parse(s)"
                            obj = misc.from_json_socket(s)  # this properly parses Date objects
                        catch e
                            winston.debug("Error parsing JSON message='#{misc.trunc(s,512)}' on socket #{desc}")
                            # TODO -- this throw can seriously mess up the server; handle this
                            # in a better way in production.  This could happen if there is
                            # corruption of the connection.
                            #throw(e)
                            return
                        socket.emit('mesg', 'json', obj)
                    when 'b'   # BLOB (tagged by a uuid)
                        socket.emit('mesg', 'blob', {uuid:mesg.slice(0,36).toString(), blob:mesg.slice(36)})
                    else
                        throw("unknown message type '#{type}'")
                socket._buf = socket._buf.slice(socket._buf_target_length)
                socket._buf_target_length = -1
                if socket._buf.length == 0
                    return
            else # nothing to do but wait for more data
                return

    socket.on('data', socket._listen_for_mesg)

    socket.write_mesg = (type, data, cb) ->  # cb(err)
        if not data?
            # uncomment this to get a traceback to see what might be causing this...
            #throw Error("write_mesg(type='#{type}': data must be defined")
            cb?("write_mesg(type='#{type}': data must be defined")
            return
        send = (s) ->
            buf = Buffer.alloc(4)
            # This line was 4 hours of work.  It is absolutely
            # *critical* to change the (possibly a string) s into a
            # buffer before computing its length and sending it!!
            # Otherwise unicode characters will cause trouble.
            if typeof(s) == "string"
                s = Buffer.from(s)
            buf.writeInt32BE(s.length, 0)
            if not socket.writable
                cb?("socket not writable")
                return
            else
                socket.write(buf)

            if not socket.writable
                cb?("socket not writable")
                return
            else
                socket.write(s, cb)

        switch type
            when 'json'
                send('j' + misc.to_json_socket(data))
            when 'blob'
                assert(data.uuid?, "data object *must* have a uuid attribute")
                assert(data.blob?, "data object *must* have a blob attribute")
                send(Buffer.concat([Buffer.from('b'),  Buffer.from(data.uuid), Buffer.from(data.blob)]))
            else
                cb?("unknown message type '#{type}'")

    # Wait until we receive exactly *one* message of the given type
    # with the given id, then call the callback with that message.
    # (If the type is 'blob', with the given uuid.)
    socket.recv_mesg = (opts) ->
        opts = defaults opts,
            type    : required
            id      : required      # or uuid
            cb      : required      # called with cb(mesg)
            timeout : undefined

        f = (type, mesg) ->
            if type == opts.type and ((type == 'json' and mesg.id == opts.id) or (type=='blob' and mesg.uuid=opts.id))
                socket.removeListener('mesg', f)
                opts.cb(mesg)
        socket.on 'mesg', f

        if opts.timeout?
            timeout = () ->
                if socket? and f in socket.listeners('mesg')
                    socket.removeListener('mesg', f)
                    opts.cb(message.error(error:"Timed out after #{opts.timeout} seconds."))
            setTimeout(timeout, opts.timeout*1000)


# Stop watching data stream for messages and delete the write_mesg function.
exports.disable_mesg = (socket) ->
    if socket._listen_for_mesg?
        socket.removeListener('data', socket._listen_for_mesg)
        delete socket._listen_for_mesg


# Wait to receive token over the socket; when it is received, call
# cb(false), then send back "y".  If any mistake is made (or the
# socket times out after 10 seconds), send back "n" and close the
# connection.
exports.unlock_socket = (socket, token, cb) ->     # cb(err)
    timeout = setTimeout((() -> socket.destroy(); cb("Unlock socket -- timed out waiting for secret token")), 10000)

    user_token = ''
    listener = (data) ->
        user_token += data.toString()
        if user_token.slice(0,token.length) == token
            socket.removeListener('data', listener)
            # got it!
            socket.write('y')
            clearTimeout(timeout)
            cb(false)
        else if user_token.length > token.length or token.slice(0, user_token.length) != user_token
            socket.removeListener('data', listener)
            socket.write('n')
            socket.write("Invalid secret token.")
            socket.destroy()
            clearTimeout(timeout)
            cb("Invalid secret token.")
    socket.on('data', listener)

# Connect to a locked socket on host, unlock it, and do
#       cb(err, unlocked_socket).
# WARNING: Use only on an encrypted VPN, since this is not
# an *encryption* protocol.
exports.connect_to_locked_socket = (opts) ->
    {port, host, token, timeout, cb} = defaults opts,
        host    : 'localhost'
        port    : required
        token   : required
        timeout : 5
        cb      : required

    if not (port > 0 and port <  65536)
        cb("connect_to_locked_socket -- RangeError: port should be > 0 and < 65536: #{port}")
        return
    winston = getLogger('misc_node.connect_to_locked_socket')

    winston.debug("misc_node: connecting to a locked socket on port #{port}...")
    timer = undefined

    timed_out = () ->
        m = "misc_node: timed out trying to connect to locked socket on port #{port}"
        winston.debug(m)
        cb?(m)
        cb = undefined  # NOTE: here and everywhere below we set cb to undefined after calling it, and only call it if defined, since the event and timer callback stuff is very hard to do right here without calling cb more than once (which is VERY bad to do).
        socket?.end()
        timer = undefined

    timer = setTimeout(timed_out, timeout*1000)

    socket = net.connect {host:host, port:port}, () =>
        listener = (data) ->
            winston.debug("misc_node: got back response: #{data}")
            socket.removeListener('data', listener)
            if data.toString() == 'y'
                if timer?
                    clearTimeout(timer)
                    cb?(undefined, socket)
                    cb = undefined
            else
                socket.destroy()
                if timer?
                    clearTimeout(timer)
                    cb?("Permission denied (invalid secret token) when connecting to the local hub.")
                    cb = undefined
        socket.on 'data', listener
        winston.debug("misc_node: connected, now sending secret token")
        socket.write(token)

    # This is called in case there is an error trying to make the connection, e.g., "connection refused".
    socket.on "error", (err) =>
        if timer?
            clearTimeout(timer)
        cb?(err)
        cb = undefined


# Connect two sockets together.
# If max_burst is optionally given, then parts of a big burst of data
# from s2 will be replaced by '[...]'.
exports.plug = (s1, s2, max_burst) ->   # s1 = hub; s2 = console server
    last_tm = misc.mswalltime()
    last_data = ''
    amount  = 0
    # Connect the sockets together.
    s1_data = (data) ->
        if not s2.writable
            s1.removeListener('data', s1_data)
        else
            s2.write(data)
    s2_data = (data) ->
        if not s1.writable
            s2.removeListener('data', s2_data)
        else
            if max_burst?
                tm = misc.mswalltime()
                if tm - last_tm >= 20
                    if amount < 0 # was truncating
                        try
                            x = last_data.slice(Math.max(0, last_data.length - Math.floor(max_burst/4)))
                        catch e
                            # I don't know why the above sometimes causes an exception, but it *does* in
                            # Buffer.slice, which is a serious problem.   Best to ignore that data.
                            x = ''
                        data = "]" + x + data
                    #console.log("max_burst: reset")
                    amount = 0
                last_tm = tm
                #console.log("max_burst: amount=#{amount}")
                if amount >= max_burst
                    last_data = data
                    data = data.slice(0,Math.floor(max_burst/4)) + "[..."
                    amount = -1 # so do only once every 20ms.
                    setTimeout((()=>s2_data('')), 25)  # write nothing in 25ms just to make sure ...] appears.
                else if amount < 0
                    last_data += data
                    setTimeout((()=>s2_data('')), 25)  # write nothing in 25ms just to make sure ...] appears.
                else
                    amount += data.length
                # Never push more than max_burst characters at once to hub, since that could overwhelm
            s1.write(data)
    s1.on('data', s1_data)
    s2.on('data', s2_data)

###
sha1 hash functionality
###

crypto = require('crypto')
# compute sha1 hash of data in hex
exports.sha1 = (data) ->
    if typeof(data) == 'string'
        # CRITICAL: Code below assumes data is a Buffer; it will seem to work on a string, but give
        # the wrong result where wrong means that it doesn't agree with the frontend version defined
        # in misc.
        data = Buffer.from(data)
    sha1sum = crypto.createHash('sha1')
    sha1sum.update(data)
    return sha1sum.digest('hex')

# Compute a uuid v4 from the Sha-1 hash of data.
# Optionally, if sha1 is given, just uses that, rather than recomputing it.
exports.uuidsha1 = (data, sha1) ->
    if sha1
        s = sha1
    else
        s = exports.sha1(data)
    i = -1
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) ->
        i += 1
        switch c
            when 'x'
                return s[i]
            when 'y'
                # take 8 + low order 3 bits of hex number.
                return ((parseInt('0x'+s[i],16)&0x3)|0x8).toString(16)
    )

{execute_code} = require('./execute-code')
exports.execute_code = execute_code  # since a lot of modules import this from misc_node, not execute-code.

# Applications of execute_code

exports.disk_usage = (path, cb) ->  # cb(err, usage in K (1024 bytes) of path)
    exports.execute_code
        command : "du"
        args    : ['-s', path]
        cb      : (err, output) ->
            if err
                cb(err)
            else
                cb(false, parseInt(output.stdout.split(' ')[0]))


address_to_local_port = {}
local_port_to_child_process = {}

exports.keep_portforward_alive = (port) ->
    r = local_port_to_child_process[port]
    if r?
        r.activity = true

exports.unforward_port = (opts) ->
    opts = defaults opts,
        port : required
        cb   : required
    winston = getLogger('unforward_port')
    winston.debug("Unforwarding port #{opts.port}")
    r = local_port_to_child_process[local_port]
    if r?
        r.kill("SIGKILL")

exports.unforward_all_ports = () ->
    for port, r of local_port_to_child_process
        r.kill("SIGKILL")

exports.forward_remote_port_to_localhost = (opts) ->
    opts = defaults opts,
        username    : required
        host        : required
        ssh_port    : 22
        remote_port : required
        activity_time : 2000 # kill connection if the HUB doesn't
                             # actively *receive* something on this
                             # port for this many seconds.
        keep_alive_time:2000 # network activity every this many
                             # seconds.; lower to more quickly detect
                             # a broken connection; raise to reduce resources
        cb          : required  # cb(err, local_port)
    winston = getLogger('forward_remote_port_to_localhost')

    opts.ssh_port = parseInt(opts.ssh_port)
    if not (opts.ssh_port >= 1 and opts.ssh_port <= 66000)
        opts.cb("Invalid ssh_port option")
        return

    opts.remote_port = parseInt(opts.remote_port)
    if not (opts.remote_port >= 1 and opts.remote_port <= 66000)
        opts.cb("Invalid remote_port option")
        return

    winston.debug("Forward a remote port #{opts.remote_port} on #{opts.host} to localhost.")

    remote_address = "#{opts.username}@#{opts.host}:#{opts.remote_port} -p#{opts.ssh_port}"

    ###
    local_port = address_to_local_port[remote_address]
    if local_port?
        # We already have a valid forward
        opts.cb(false, local_port)
        return
    ###

    # We have to make a new port forward
    free_port (err, local_port) ->
        if err
            opts.cb(err)
            return
        winston.debug("forward_remote_port_to_local_host: local port #{local_port} available")
        command = "ssh"
        args =  ['-o', 'StrictHostKeyChecking=no', "-p", opts.ssh_port,
                 '-L', "#{local_port}:localhost:#{opts.remote_port}",
                 "#{opts.username}@#{opts.host}",
                 "TERM=vt100 /usr/bin/watch -t -n #{opts.keep_alive_time} date"]
        r = child_process.spawn(command, args)
        cb_happened = false
        new_output = false
        r.stdout.on 'data', (data) ->

            # Got a local_port -- let's use it.
            address_to_local_port[remote_address] = local_port
            local_port_to_child_process[local_port] = r

            new_output = true
            # as soon as something is output, it's working (I hope).
            if not cb_happened
                opts.cb(false, local_port)
                cb_happened = true

        stderr = ''
        r.stderr.on 'data', (data) ->
            stderr += data.toString()

        kill_if_no_new_output = () ->
            if not new_output
                winston.debug("Killing ssh port forward #{remote_address} --> localhost:#{local_port} due to it not working")
                r.kill("SIGKILL")
            new_output = false

        # check every few seconds
        kill_no_output_timer = setInterval(kill_if_no_new_output, 1000*opts.keep_alive_time)

        kill_if_no_new_activity = () ->
            if not r.activity?
                winston.debug("Killing ssh port forward #{remote_address} --> localhost:#{local_port} due to not receiving any data for at least #{opts.activity_time} seconds.")
                r.kill("SIGKILL")
            else
                # delete it -- the only way connection won't be killed is if this gets set again by an active call to keep_portforward_alive above.
                delete r.activity

        kill_no_activity_timer = setInterval(kill_if_no_new_activity, 1000*opts.activity_time)

        r.on 'exit', (code) ->
            if not cb_happened
                opts.cb("Problem setting up ssh port forward -- #{stderr}")
            delete address_to_local_port[remote_address]
            clearInterval(kill_no_output_timer)
            clearInterval(kill_no_activity_timer)


exports.process_kill = (pid, signal) ->
    winston = getLogger('process_kill')
    switch signal
        when 2
            signal = 'SIGINT'
        when 3
            signal = 'SIGQUIT'
        when 9
            signal = 'SIGKILL'
        else
            winston.debug("BUG -- process_kill: only signals 2 (SIGINT), 3 (SIGQUIT), and 9 (SIGKILL) are supported")
            return
    try
        process.kill(pid, signal)
    catch e
        # it's normal to get an exception when sending a signal... to a process that doesn't exist.


# Any non-absolute path is assumed to be relative to the user's home directory.
# This function converts such a path to an absolute path.
exports.abspath = abspath = (path) ->
    if path.length == 0
        return process.env.HOME
    if path[0] == '/'
        return path  # already an absolute path
    p = process.env.HOME + '/' + path
    p = p.replace(/\/\.\//g,'/')    # get rid of /./, which is the same as /...
    return p



# Other path related functions...

# Make sure that that the directory containing the file indicated by
# the path exists and has restrictive permissions.
ensure_containing_directory_exists = (path, cb) ->   # cb(err)
    path = abspath(path)
    dir = misc.path_split(path).head  # containing path

    fs.exists dir, (exists) ->
        if exists
            cb?()
        else
            async.series([
                (cb) ->
                    if dir != ''
                        # recursively make sure the entire chain of directories exists.
                        ensure_containing_directory_exists(dir, cb)
                    else
                        cb()
                (cb) ->
                    fs.mkdir(dir, 0o700, cb)
            ], (err) ->
                if err?.code == 'EEXIST'
                    cb?()
                else
                    cb?(err)
            )

exports.ensure_containing_directory_exists = ensure_containing_directory_exists

# like in sage, a quick way to save/load JSON-able objects to disk; blocking and not compressed.
exports.saveSync = (obj, filename) ->
    fs.writeFileSync(filename, JSON.stringify(obj))

exports.loadSync = (filename) ->
    JSON.parse(fs.readFileSync(filename).toString())

exports.sales_tax = require('@cocalc/util/stripe/sales-tax').default;

