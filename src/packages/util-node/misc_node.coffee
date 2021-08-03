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

misc = require('smc-util/misc')
{walltime, defaults, required, to_json} = misc
message = require('smc-util/message')

exports.SALVUS_HOME = exports.SMC_ROOT = SMC_ROOT = process.env.SMC_ROOT

exports.WEBAPP_LIB = 'webapp-lib' # was 'static' in the old days, contains js libraries

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


# WA state sales tax rates, as of July 11 2017.
# Generated via scripts/sales_tax.py

WA_sales_tax = {98001:0.099000, 98002:0.086000, 98003:0.100000, 98004:0.100000, 98005:0.100000, 98006:0.086000, 98007:0.100000, 98008:0.100000, 98009:0.100000, 98010:0.086000, 98011:0.100000, 98012:0.077000, 98013:0.086000, 98014:0.086000, 98015:0.100000, 98019:0.077000, 98020:0.100000, 98021:0.077000, 98022:0.079000, 98023:0.100000, 98024:0.086000, 98025:0.086000, 98026:0.100000, 98027:0.086000, 98028:0.100000, 98029:0.086000, 98030:0.100000, 98031:0.100000, 98032:0.100000, 98033:0.100000, 98034:0.100000, 98035:0.100000, 98036:0.103000, 98037:0.103000, 98038:0.086000, 98039:0.100000, 98040:0.100000, 98041:0.100000, 98042:0.086000, 98043:0.100000, 98045:0.086000, 98046:0.104000, 98047:0.093000, 98050:0.086000, 98051:0.086000, 98052:0.086000, 98053:0.086000, 98054:0.086000, 98055:0.100000, 98056:0.100000, 98057:0.100000, 98058:0.086000, 98059:0.086000, 98061:0.090000, 98062:0.100000, 98063:0.100000, 98064:0.100000, 98065:0.086000, 98068:0.080000, 98070:0.086000, 98071:0.100000, 98072:0.077000, 98073:0.100000, 98074:0.086000, 98075:0.086000, 98077:0.077000, 98082:0.104000, 98083:0.100000, 98087:0.103000, 98089:0.100000, 98092:0.086000, 98093:0.100000, 98101:0.101000, 98102:0.101000, 98103:0.101000, 98104:0.101000, 98105:0.101000, 98106:0.100000, 98107:0.101000, 98108:0.100000, 98109:0.101000, 98110:0.090000, 98111:0.101000, 98112:0.101000, 98113:0.101000, 98114:0.101000, 98115:0.101000, 98116:0.101000, 98117:0.101000, 98118:0.101000, 98119:0.101000, 98121:0.101000, 98122:0.101000, 98124:0.101000, 98125:0.100000, 98126:0.100000, 98127:0.101000, 98129:0.101000, 98131:0.100000, 98132:0.100000, 98133:0.100000, 98134:0.101000, 98136:0.101000, 98138:0.100000, 98139:0.101000, 98141:0.101000, 98144:0.100000, 98145:0.101000, 98146:0.100000, 98148:0.100000, 98151:0.100000, 98154:0.101000, 98155:0.100000, 98158:0.100000, 98160:0.100000, 98161:0.101000, 98164:0.101000, 98165:0.101000, 98166:0.100000, 98168:0.100000, 98170:0.100000, 98171:0.100000, 98174:0.101000, 98175:0.101000, 98177:0.100000, 98178:0.100000, 98181:0.101000, 98184:0.101000, 98185:0.101000, 98188:0.100000, 98189:0.100000, 98190:0.100000, 98191:0.101000, 98194:0.101000, 98195:0.101000, 98198:0.100000, 98199:0.101000, 98201:0.089000, 98203:0.077000, 98204:0.097000, 98205:0.097000, 98206:0.097000, 98207:0.097000, 98208:0.077000, 98213:0.097000, 98220:0.085000, 98221:0.081000, 98222:0.081000, 98223:0.077000, 98224:0.086000, 98225:0.079000, 98226:0.079000, 98227:0.087000, 98228:0.087000, 98229:0.079000, 98230:0.079000, 98231:0.085000, 98232:0.085000, 98233:0.081000, 98235:0.085000, 98236:0.087000, 98237:0.079000, 98238:0.081000, 98239:0.087000, 98240:0.085000, 98241:0.081000, 98243:0.081000, 98244:0.079000, 98245:0.081000, 98247:0.085000, 98248:0.079000, 98249:0.087000, 98250:0.081000, 98251:0.086000, 98252:0.077000, 98253:0.087000, 98255:0.085000, 98256:0.089000, 98257:0.081000, 98258:0.077000, 98259:0.091000, 98260:0.087000, 98261:0.081000, 98262:0.079000, 98263:0.085000, 98264:0.085000, 98266:0.085000, 98267:0.085000, 98270:0.077000, 98271:0.077000, 98272:0.077000, 98273:0.081000, 98274:0.081000, 98275:0.097000, 98276:0.085000, 98277:0.087000, 98278:0.087000, 98279:0.081000, 98280:0.081000, 98281:0.079000, 98282:0.077000, 98283:0.079000, 98284:0.077000, 98286:0.081000, 98287:0.089000, 98288:0.086000, 98290:0.077000, 98291:0.091000, 98292:0.077000, 98293:0.089000, 98294:0.077000, 98295:0.085000, 98296:0.077000, 98297:0.081000, 98303:0.079000, 98304:0.078000, 98305:0.084000, 98310:0.085000, 98311:0.090000, 98312:0.085000, 98314:0.090000, 98315:0.090000, 98320:0.085000, 98321:0.079000, 98322:0.090000, 98323:0.079000, 98324:0.084000, 98325:0.090000, 98326:0.084000, 98327:0.079000, 98328:0.079000, 98329:0.079000, 98330:0.078000, 98331:0.084000, 98332:0.079000, 98333:0.079000, 98335:0.079000, 98336:0.078000, 98337:0.090000, 98338:0.079000, 98339:0.090000, 98340:0.090000, 98342:0.090000, 98343:0.084000, 98344:0.079000, 98345:0.090000, 98346:0.090000, 98348:0.079000, 98349:0.079000, 98350:0.084000, 98351:0.079000, 98352:0.093000, 98353:0.090000, 98354:0.099000, 98355:0.078000, 98356:0.078000, 98357:0.084000, 98358:0.090000, 98359:0.079000, 98360:0.079000, 98361:0.078000, 98362:0.084000, 98363:0.084000, 98364:0.090000, 98365:0.090000, 98366:0.090000, 98367:0.090000, 98368:0.090000, 98370:0.090000, 98371:0.099000, 98372:0.093000, 98373:0.093000, 98374:0.093000, 98375:0.093000, 98376:0.090000, 98377:0.078000, 98378:0.090000, 98380:0.085000, 98381:0.084000, 98382:0.084000, 98383:0.090000, 98384:0.090000, 98385:0.079000, 98386:0.090000, 98387:0.079000, 98388:0.079000, 98390:0.093000, 98391:0.079000, 98392:0.090000, 98393:0.090000, 98394:0.079000, 98395:0.079000, 98396:0.079000, 98397:0.079000, 98398:0.079000, 98401:0.101000, 98402:0.099000, 98403:0.101000, 98404:0.099000, 98405:0.093000, 98406:0.093000, 98407:0.099000, 98408:0.099000, 98409:0.099000, 98411:0.101000, 98412:0.101000, 98413:0.101000, 98415:0.101000, 98416:0.101000, 98417:0.101000, 98418:0.101000, 98419:0.101000, 98421:0.099000, 98422:0.099000, 98424:0.099000, 98430:0.093000, 98431:0.093000, 98433:0.093000, 98438:0.093000, 98439:0.093000, 98442:0.093000, 98443:0.099000, 98444:0.093000, 98445:0.093000, 98446:0.079000, 98447:0.099000, 98448:0.099000, 98450:0.099000, 98455:0.099000, 98460:0.099000, 98464:0.099000, 98465:0.099000, 98466:0.099000, 98467:0.099000, 98471:0.101000, 98477:0.101000, 98481:0.101000, 98490:0.101000, 98492:0.101000, 98493:0.099000, 98496:0.099000, 98497:0.099000, 98498:0.093000, 98499:0.093000, 98501:0.079000, 98502:0.079000, 98503:0.087000, 98504:0.088000, 98505:0.087000, 98506:0.079000, 98507:0.088000, 98508:0.088000, 98509:0.089000, 98511:0.089000, 98512:0.079000, 98513:0.079000, 98516:0.079000, 98520:0.088000, 98522:0.078000, 98524:0.085000, 98526:0.088000, 98527:0.080000, 98528:0.079000, 98530:0.079000, 98531:0.078000, 98532:0.078000, 98533:0.078000, 98535:0.088000, 98536:0.088000, 98537:0.080000, 98538:0.078000, 98539:0.078000, 98540:0.079000, 98541:0.085000, 98542:0.078000, 98544:0.078000, 98546:0.085000, 98547:0.080000, 98548:0.085000, 98550:0.088000, 98552:0.088000, 98554:0.080000, 98555:0.085000, 98556:0.079000, 98557:0.085000, 98558:0.079000, 98559:0.088000, 98560:0.085000, 98561:0.080000, 98562:0.088000, 98563:0.085000, 98564:0.078000, 98565:0.078000, 98566:0.088000, 98568:0.078000, 98569:0.088000, 98570:0.078000, 98571:0.088000, 98572:0.078000, 98575:0.088000, 98576:0.079000, 98577:0.080000, 98579:0.078000, 98580:0.079000, 98581:0.078000, 98582:0.078000, 98583:0.088000, 98584:0.085000, 98585:0.078000, 98586:0.080000, 98587:0.088000, 98588:0.085000, 98589:0.079000, 98590:0.080000, 98591:0.078000, 98592:0.085000, 98593:0.078000, 98595:0.088000, 98596:0.078000, 98597:0.079000, 98599:0.088000, 98601:0.077000, 98602:0.070000, 98603:0.078000, 98604:0.077000, 98605:0.070000, 98606:0.077000, 98607:0.077000, 98609:0.078000, 98610:0.077000, 98611:0.078000, 98612:0.076000, 98613:0.070000, 98614:0.080000, 98616:0.078000, 98617:0.070000, 98619:0.070000, 98620:0.070000, 98621:0.076000, 98622:0.077000, 98623:0.070000, 98624:0.080000, 98625:0.078000, 98626:0.078000, 98628:0.070000, 98629:0.077000, 98631:0.080000, 98632:0.076000, 98635:0.070000, 98637:0.080000, 98638:0.076000, 98639:0.077000, 98640:0.080000, 98641:0.080000, 98642:0.077000, 98643:0.076000, 98644:0.080000, 98645:0.078000, 98647:0.076000, 98648:0.077000, 98649:0.078000, 98650:0.070000, 98651:0.077000, 98660:0.077000, 98661:0.084000, 98662:0.077000, 98663:0.084000, 98664:0.084000, 98665:0.084000, 98666:0.084000, 98667:0.084000, 98668:0.084000, 98670:0.070000, 98671:0.077000, 98672:0.070000, 98673:0.070000, 98674:0.077000, 98675:0.077000, 98682:0.077000, 98683:0.084000, 98684:0.084000, 98685:0.077000, 98686:0.077000, 98687:0.084000, 98801:0.082000, 98802:0.082000, 98807:0.084000, 98811:0.082000, 98812:0.078000, 98813:0.077000, 98814:0.081000, 98815:0.082000, 98816:0.081000, 98817:0.082000, 98819:0.081000, 98821:0.082000, 98822:0.082000, 98823:0.078000, 98824:0.079000, 98826:0.082000, 98827:0.081000, 98828:0.082000, 98829:0.081000, 98830:0.077000, 98831:0.082000, 98832:0.079000, 98833:0.081000, 98834:0.081000, 98836:0.082000, 98837:0.079000, 98840:0.077000, 98841:0.077000, 98843:0.078000, 98844:0.081000, 98845:0.078000, 98846:0.081000, 98847:0.082000, 98848:0.078000, 98849:0.081000, 98850:0.078000, 98851:0.079000, 98852:0.082000, 98853:0.079000, 98855:0.081000, 98856:0.081000, 98857:0.077000, 98858:0.078000, 98859:0.081000, 98860:0.079000, 98862:0.081000, 98901:0.079000, 98902:0.081000, 98903:0.079000, 98904:0.079000, 98907:0.082000, 98908:0.079000, 98909:0.081000, 98920:0.079000, 98921:0.079000, 98922:0.080000, 98923:0.079000, 98925:0.080000, 98926:0.080000, 98929:0.080000, 98930:0.079000, 98932:0.079000, 98933:0.079000, 98934:0.080000, 98935:0.070000, 98936:0.079000, 98937:0.078000, 98938:0.079000, 98939:0.079000, 98940:0.080000, 98941:0.080000, 98942:0.079000, 98943:0.080000, 98944:0.079000, 98946:0.080000, 98947:0.079000, 98948:0.079000, 98950:0.080000, 98951:0.079000, 98952:0.079000, 98953:0.079000, 99001:0.088000, 99003:0.081000, 99004:0.081000, 99005:0.081000, 99006:0.076000, 99008:0.080000, 99009:0.076000, 99011:0.088000, 99012:0.081000, 99013:0.076000, 99014:0.088000, 99016:0.081000, 99017:0.078000, 99018:0.081000, 99019:0.081000, 99020:0.081000, 99021:0.081000, 99022:0.081000, 99023:0.081000, 99025:0.081000, 99026:0.076000, 99027:0.081000, 99029:0.080000, 99030:0.081000, 99031:0.081000, 99032:0.077000, 99033:0.078000, 99034:0.076000, 99036:0.081000, 99037:0.081000, 99039:0.081000, 99040:0.076000, 99101:0.076000, 99102:0.078000, 99103:0.079000, 99104:0.078000, 99105:0.077000, 99107:0.077000, 99109:0.076000, 99110:0.076000, 99111:0.078000, 99113:0.078000, 99114:0.076000, 99115:0.078000, 99116:0.077000, 99117:0.080000, 99118:0.077000, 99119:0.076000, 99121:0.077000, 99122:0.076000, 99123:0.079000, 99124:0.077000, 99125:0.077000, 99126:0.076000, 99128:0.078000, 99129:0.076000, 99130:0.078000, 99131:0.076000, 99133:0.078000, 99134:0.080000, 99135:0.079000, 99136:0.078000, 99137:0.076000, 99138:0.077000, 99139:0.076000, 99140:0.077000, 99141:0.076000, 99143:0.078000, 99144:0.080000, 99146:0.077000, 99147:0.080000, 99148:0.076000, 99149:0.078000, 99150:0.077000, 99151:0.076000, 99152:0.076000, 99153:0.076000, 99154:0.080000, 99155:0.077000, 99156:0.076000, 99157:0.076000, 99158:0.078000, 99159:0.077000, 99160:0.077000, 99161:0.078000, 99163:0.078000, 99164:0.078000, 99165:0.078000, 99166:0.077000, 99167:0.076000, 99169:0.077000, 99170:0.078000, 99171:0.078000, 99173:0.076000, 99174:0.078000, 99176:0.078000, 99179:0.078000, 99180:0.076000, 99181:0.076000, 99185:0.080000, 99201:0.088000, 99202:0.088000, 99203:0.081000, 99204:0.088000, 99205:0.081000, 99206:0.081000, 99207:0.088000, 99208:0.081000, 99209:0.088000, 99210:0.088000, 99211:0.088000, 99212:0.081000, 99213:0.088000, 99214:0.088000, 99215:0.088000, 99216:0.081000, 99217:0.081000, 99218:0.081000, 99219:0.088000, 99220:0.088000, 99223:0.081000, 99224:0.081000, 99228:0.088000, 99251:0.088000, 99252:0.088000, 99256:0.088000, 99258:0.088000, 99260:0.088000, 99299:0.088000, 99301:0.080000, 99302:0.086000, 99320:0.080000, 99321:0.079000, 99322:0.070000, 99323:0.081000, 99324:0.087000, 99326:0.077000, 99328:0.081000, 99329:0.081000, 99330:0.080000, 99333:0.078000, 99335:0.080000, 99336:0.080000, 99337:0.080000, 99338:0.080000, 99341:0.077000, 99343:0.080000, 99344:0.077000, 99345:0.080000, 99346:0.080000, 99347:0.079000, 99348:0.081000, 99349:0.079000, 99350:0.070000, 99352:0.080000, 99353:0.080000, 99354:0.086000, 99356:0.070000, 99357:0.079000, 99359:0.081000, 99360:0.081000, 99361:0.081000, 99362:0.081000, 99363:0.081000, 99371:0.077000, 99401:0.077000, 99402:0.077000, 99403:0.079000}

exports.sales_tax = (zip) -> return WA_sales_tax[zip] ? 0



