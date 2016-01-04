###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014, William Stein
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################


####################################################################
#
# misc JS functionality that only makes sense on the node side (not on
# the client)
#
####################################################################

assert  = require('assert')
fs      = require('fs')
net     = require('net')
winston = require('winston')
async   = require('async')

misc = require('smc-util/misc')
{walltime, defaults, required, to_json} = misc
message = require('smc-util/message')

###
Asynchronous JSON functionality: these are slower but block the main thread *less*.

- to_json_async - convert object to JSON string without blocking.
  This uses https://github.com/ckknight/async-json

- from_json_async - convert JSON string to object/etc., without blocking,
  though 2x times as slow as JSON.parse.  This uses https://github.com/bjouhier/i-json

TESTS:

m=require('misc_node');s=JSON.stringify({x:new Buffer(10000000).toString('hex')}); d=new Date(); m.from_json_async(string: s, chunk_size:10000, cb: (e, r) -> console.log(e, new Date() - d)); new Date() - d
###

###
exports.to_json_async = (opts) ->
    opts = defaults opts,
        obj        : required    # Javascript object to convert to a JSON string
        cb         : required    # cb(err, JSON string)

ijson = require('i-json')
exports.from_json_async = (opts) ->
    opts = defaults opts,
        string     : required   # string in JSON format
        chunk_size : 50000      # size of chunks to parse -- affects how long this blocks the main thread
        cb         : required
    p = ijson.createParser()
    s = opts.string
    f = (i, cb) ->
        #t = misc.mswalltime()
        p.update(s.slice(i*opts.chunk_size, (i+1)*opts.chunk_size))
        #console.log("update: #{misc.mswalltime(t)}")
        setTimeout(cb, 0)
    async.mapSeries [0...s.length/opts.chunk_size], f, (err) ->
        opts.cb(err, p.result())
###

######################################################################
# Our TCP messaging system.  We send a message by first
# sending the length, then the bytes of the actual message.  The code
# in this section is used by:
#       * hub -- to communicate with sage_server and console_server
######################################################################

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
                            obj = JSON.parse(s)
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
        send = (s) ->
            buf = new Buffer(4)
            # This line was 4 hours of work.  It is absolutely
            # *critical* to change the (possibly a string) s into a
            # buffer before computing its length and sending it!!
            # Otherwise unicode characters will cause trouble.
            if typeof(s) == "string"
                s = Buffer(s)
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
                send('j' + JSON.stringify(data))
            when 'blob'
                assert(data.uuid?, "data object *must* have a uuid attribute")
                assert(data.blob?, "data object *must* have a blob attribute")
                send(Buffer.concat([new Buffer('b'), new Buffer(data.uuid), new Buffer(data.blob)]))
            else
                cb("unknown message type '#{type}'")

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
        if user_token == token
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

crypto = require('crypto')
# compute sha1 hash of data in hex
exports.sha1 = (data) ->
    sha1sum = crypto.createHash('sha1')
    sha1sum.update(data)
    return sha1sum.digest('hex')

# Compute a uuid v4 from the Sha-1 hash of data.
exports.uuidsha1 = (data) ->
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



###################################################################
# Execute code
###################################################################
#
temp           = require('temp')
async          = require('async')
fs             = require('fs')
child_process  = require 'child_process'

exports.execute_code = execute_code = (opts) ->
    opts = defaults opts,
        command    : required
        args       : []
        path       : undefined   # defaults to home directory; where code is executed from
        timeout    : 10          # timeout in *seconds*
        ulimit_timeout : true    # if set, use ulimit to ensure a cpu timeout -- don't use when launching a daemon!
        err_on_exit: true        # if true, then a nonzero exit code will result in cb(error_message)
        max_output : undefined   # bound on size of stdout and stderr; further output ignored
        bash       : false       # if true, ignore args and evaluate command as a bash command
        home       : undefined
        uid        : undefined
        gid        : undefined
        env        : undefined   # if given, added to exec environment
        verbose    : true
        cb         : undefined

    start_time = walltime()
    if opts.verbose
        winston.debug("execute_code: \"#{opts.command} #{opts.args.join(' ')}\"")

    s = opts.command.split(/\s+/g) # split on whitespace
    if opts.args.length == 0 and s.length > 1
        opts.bash = true

    if not opts.home?
        opts.home = process.env.HOME

    if not opts.path?
        opts.path = opts.home
    else if opts.path[0] != '/'
        opts.path = opts.home + '/' + opts.path

    stdout = ''
    stderr = ''
    exit_code = undefined

    env = misc.copy(process.env)

    if opts.env?
        for k, v of opts.env
            env[k] = v

    if opts.uid?
        env.HOME = opts.home

    tmpfilename = undefined
    ran_code = false

    async.series([
        (c) ->
            if not opts.bash
                c()
                return
            if opts.timeout? and opts.ulimit_timeout
                # This ensures that everything involved with this
                # command really does die no matter what; it's
                # better than killing from outside, since it gets
                # all subprocesses since they inherit the limits.
                cmd = "ulimit -t #{opts.timeout}\n#{opts.command}"
            else
                cmd = opts.command

            if opts.verbose
                winston.debug("execute_code: writing temporary file that contains bash program.")
            temp.open '', (err, info) ->
                if err
                    c(err)
                else
                    opts.command = 'bash'
                    opts.args    = [info.path]
                    tmpfilename  = info.path
                    fs.write(info.fd, cmd)
                    fs.close(info.fd, c)

        (c) ->
            if tmpfilename?
                fs.chmod(tmpfilename, 0o777, c)
            else
                c()

        (c) ->
            if opts.verbose
                winston.debug("Spawning the command #{opts.command} with given args #{opts.args} and timeout of #{opts.timeout}s...")
            o = {cwd:opts.path}
            if env?
                o.env = env
            if opts.uid
                o.uid = opts.uid
            if opts.gid
                o.gid = opts.gid

            try
                r = child_process.spawn(opts.command, opts.args, o)
            catch e
                # Yes, spawn can cause this error if there is no memory, and there's no event! --  Error: spawn ENOMEM
                c("error #{misc.to_json(e)}")
                return

            ran_code = true

            if opts.verbose
                winston.debug("Listen for stdout, stderr and exit events.")
            stdout = ''
            r.stdout.on 'data', (data) ->
                data = data.toString()
                if opts.max_output?
                    if stdout.length < opts.max_output
                        stdout += data.slice(0,opts.max_output - stdout.length)
                else
                    stdout += data

            r.stderr.on 'data', (data) ->
                data = data.toString()
                if opts.max_output?
                    if stderr.length < opts.max_output
                        stderr += data.slice(0,opts.max_output - stderr.length)
                else
                    stderr += data

            stderr_is_done = stdout_is_done = false

            r.stderr.on 'end', () ->
                stderr_is_done = true
                finish()

            r.stdout.on 'end', () ->
                stdout_is_done = true
                finish()

            r.on 'exit', (code) ->
                exit_code = code
                finish()

            # This can happen, e.g., "Error: spawn ENOMEM" if there is no memory.  Without this handler,
            # an unhandled exception gets raised, which is nasty.
            # From docs: "Note that the exit-event may or may not fire after an error has occured. "
            r.on 'error', (err) ->
                if not exit_code?
                    exit_code = 1
                stderr += to_json(err)
                finish()

            callback_done = false
            finish = () ->
                if stdout_is_done and stderr_is_done and exit_code?
                    if opts.err_on_exit and exit_code != 0
                        if not callback_done
                            callback_done = true
                            c("command '#{opts.command}' (args=#{opts.args.join(' ')}) exited with nonzero code #{exit_code} -- stderr='#{stderr}'")
                    else
                        if opts.max_output?
                            if stdout.length >= opts.max_output
                                stdout += " (truncated at #{opts.max_output} characters)"
                            if stderr.length >= opts.max_output
                                stderr += " (truncated at #{opts.max_output} characters)"
                        if not callback_done
                            callback_done = true
                            c()

            if opts.timeout?
                f = () ->
                    if r.exitCode == null
                        if opts.verbose
                            winston.debug("execute_code: subprocess did not exit after #{opts.timeout} seconds, so killing with SIGKILL")
                        try
                            r.kill("SIGKILL")  # this does not kill the process group :-(
                        catch e
                            # Exceptions can happen, which left uncaught messes up calling code bigtime.
                        if opts.verbose
                            winston.debug("execute_code: r.kill raised an exception.")
                        if not callback_done
                            callback_done = true
                            c("killed command '#{opts.command} #{opts.args.join(' ')}'")
                setTimeout(f, opts.timeout*1000)

    ], (err) ->
        if not exit_code?
            exit_code = 1  # don't have one due to SIGKILL

        # TODO:  This is dangerous, e.g., it could print out a secret_token to a log file.
        # winston.debug("(time: #{walltime() - start_time}): Done running '#{opts.command} #{opts.args.join(' ')}'; resulted in stdout='#{misc.trunc(stdout,512)}', stderr='#{misc.trunc(stderr,512)}', exit_code=#{exit_code}, err=#{err}")
        # Do not litter:
        if tmpfilename?
            try
                fs.unlink(tmpfilename)
            catch e
                winston.debug("failed to unlink #{tmpfilename}")


        if opts.verbose
            winston.debug("finished exec of #{opts.command} (took #{walltime(start_time)}s)")
            winston.debug("stdout='#{misc.trunc(stdout,512)}', stderr='#{misc.trunc(stderr,512)}', exit_code=#{exit_code}")
        if not opts.err_on_exit and ran_code
            # as long as we made it to running some code, we consider this a success (that is what err_on_exit means).
            opts.cb?(false, {stdout:stdout, stderr:stderr, exit_code:exit_code})
        else
            opts.cb?(err, {stdout:stdout, stderr:stderr, exit_code:exit_code})
    )


#
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


#
# project_id --> username mapping

# The username associated to a given project id is just the string of
# the uuid, but with -'s replaced by _'s so we obtain a valid unix
# account name, and shortened to fit Linux and sanity requirements.
exports.username = (project_id) ->
    if '..' in project_id or project_id.length != 36
        # a sanity check -- this should never ever be allowed to happen, ever.
        throw Error("invalid project id #{project_id}")
    # Return a for-sure safe username
    return project_id.slice(0,8).replace(/[^a-z0-9]/g,'')

# project_id --> LINUX uid mapping
exports.uid = (project_id) ->
    # (comment copied from smc_compute.py)
    # We take the sha-512 of the uuid just to make it harder to force a collision.  Thus even if a
    # user could somehow generate an account id of their choosing, this wouldn't help them get the
    # same uid as another user.
    # 2^31-1=max uid which works with FUSE and node (and Linux, which goes up to 2^32-2).
    sha512sum = crypto.createHash('sha512')
    n = parseInt(sha512sum.update(project_id).digest('hex').slice(0,8), 16)  # up to 2^32
    n //= 2  # floor division
    return if n>65537 then n else n+65537   # 65534 used by linux for user sync, etc.

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
    winston.debug("Unforwarding port #{opts.port}")
    r = local_port_to_child_process[local_port]
    if r?
        r.kill("SIGKILL")

exports.unforward_all_ports = () ->
    for port, r of local_port_to_child_process
        r.kill("SIGKILL")

free_port = exports.free_port = (cb) ->    # cb(err, available port as assigned by the operating system)
    server = require("net").createServer()
    port = 0
    server.on "listening", () ->
        port = server.address().port
        server.close()
    server.on "close", ->
        f = () ->
            cb(null, port)
        # give the OS a chance to really make the port available again.
        setTimeout(f, 500)
    server.listen(0)

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


# Determine if path (file or directory) is writable -- this works even if permissions are right but
# filesystem is read only, e.g., ~/.zfs/snapshot/...
# It's an error if the path doesn't exist.
exports.is_file_readonly = (opts) ->
    opts = defaults opts,
        path : required
        cb   : required    # cb(err, true if read only (false otherwise))

    if process.platform == 'darwin'
        # TODO: there is no -writable option to find on OS X, which breaks this; for now skip check
        opts.cb(undefined, false)
        return

    readonly = undefined
    # determine if file is writable
    execute_code
        command     : 'find'
        args        : [opts.path, '-maxdepth', '0', '-writable']
        err_on_exit : false
        cb          : (err, output) =>
            if err
                opts.cb(err)
            else if output.stderr or output.exit_code
                opts.cb("no such path '#{opts.path}'")
            else
                readonly = output.stdout.length == 0
                opts.cb(undefined, readonly)

# like in sage, a quick way to save/load JSON-able objects to disk; blocking and not compressed.
exports.saveSync = (obj, filename) ->
    fs.writeFileSync(filename, JSON.stringify(obj))

exports.loadSync = (filename) ->
    JSON.parse(fs.readFileSync(filename).toString())


# WA state sales tax rates, as of August 2015.
# Generated scripts/sales_tax.py

WA_sales_tax = {98001:0.095000, 98002:0.095000, 98003:0.095000, 98004:0.095000, 98005:0.095000, 98006:0.095000, 98007:0.095000, 98008:0.095000, 98009:0.095000, 98010:0.086000, 98011:0.095000, 98012:0.096000, 98014:0.086000, 98015:0.095000, 98019:0.086000, 98020:0.095000, 98021:0.095000, 98022:0.086000, 98023:0.095000, 98024:0.086000, 98025:0.086000, 98026:0.095000, 98027:0.095000, 98028:0.095000, 98029:0.095000, 98030:0.095000, 98031:0.095000, 98032:0.095000, 98033:0.095000, 98034:0.095000, 98035:0.095000, 98036:0.095000, 98037:0.095000, 98038:0.086000, 98039:0.095000, 98040:0.095000, 98041:0.095000, 98042:0.086000, 98043:0.095000, 98045:0.086000, 98046:0.095000, 98047:0.095000, 98050:0.086000, 98051:0.086000, 98052:0.095000, 98053:0.086000, 98055:0.095000, 98056:0.095000, 98057:0.095000, 98058:0.095000, 98059:0.095000, 98061:0.087000, 98062:0.095000, 98063:0.095000, 98064:0.095000, 98065:0.086000, 98068:0.086000, 98070:0.086000, 98071:0.095000, 98072:0.095000, 98073:0.095000, 98074:0.095000, 98075:0.095000, 98077:0.086000, 98082:0.096000, 98083:0.095000, 98087:0.095000, 98089:0.095000, 98092:0.095000, 98093:0.095000, 98101:0.096000, 98102:0.096000, 98103:0.096000, 98104:0.096000, 98105:0.096000, 98106:0.096000, 98107:0.096000, 98108:0.096000, 98109:0.096000, 98110:0.087000, 98111:0.096000, 98112:0.096000, 98113:0.096000, 98114:0.096000, 98115:0.096000, 98116:0.096000, 98117:0.096000, 98118:0.096000, 98119:0.096000, 98121:0.096000, 98122:0.096000, 98124:0.096000, 98125:0.096000, 98126:0.096000, 98127:0.096000, 98129:0.095000, 98131:0.095000, 98132:0.096000, 98133:0.096000, 98134:0.096000, 98136:0.096000, 98138:0.095000, 98139:0.096000, 98144:0.096000, 98145:0.096000, 98146:0.095000, 98148:0.095000, 98154:0.095000, 98155:0.095000, 98158:0.095000, 98161:0.096000, 98164:0.095000, 98165:0.096000, 98166:0.095000, 98168:0.095000, 98170:0.096000, 98174:0.095000, 98175:0.096000, 98177:0.095000, 98178:0.095000, 98181:0.096000, 98185:0.096000, 98188:0.095000, 98189:0.096000, 98191:0.096000, 98194:0.096000, 98195:0.096000, 98198:0.095000, 98199:0.096000, 98201:0.092000, 98203:0.092000, 98204:0.095000, 98205:0.092000, 98206:0.095000, 98207:0.092000, 98208:0.095000, 98213:0.092000, 98220:0.085000, 98221:0.085000, 98222:0.081000, 98223:0.088000, 98224:0.086000, 98225:0.087000, 98226:0.087000, 98227:0.087000, 98228:0.087000, 98229:0.087000, 98230:0.085000, 98231:0.085000, 98232:0.085000, 98233:0.085000, 98235:0.085000, 98236:0.087000, 98237:0.085000, 98238:0.081000, 98239:0.087000, 98240:0.085000, 98241:0.086000, 98243:0.081000, 98244:0.085000, 98245:0.081000, 98247:0.085000, 98248:0.087000, 98249:0.087000, 98250:0.081000, 98251:0.086000, 98252:0.086000, 98253:0.087000, 98255:0.085000, 98256:0.086000, 98257:0.085000, 98258:0.086000, 98259:0.088000, 98260:0.087000, 98261:0.081000, 98262:0.085000, 98263:0.085000, 98264:0.087000, 98266:0.085000, 98267:0.085000, 98270:0.088000, 98271:0.088000, 98272:0.089000, 98273:0.085000, 98274:0.085000, 98275:0.095000, 98276:0.085000, 98277:0.087000, 98278:0.087000, 98279:0.081000, 98280:0.081000, 98281:0.085000, 98282:0.087000, 98283:0.085000, 98284:0.085000, 98286:0.081000, 98287:0.086000, 98288:0.086000, 98290:0.077000, 98291:0.088000, 98292:0.077000, 98293:0.086000, 98294:0.086000, 98295:0.085000, 98296:0.077000, 98303:0.079000, 98304:0.079000, 98305:0.082000, 98310:0.087000, 98311:0.087000, 98312:0.087000, 98314:0.087000, 98315:0.087000, 98320:0.090000, 98321:0.079000, 98322:0.087000, 98323:0.079000, 98324:0.082000, 98325:0.090000, 98326:0.082000, 98327:0.088000, 98328:0.079000, 98329:0.079000, 98330:0.079000, 98331:0.084000, 98332:0.079000, 98333:0.079000, 98335:0.079000, 98336:0.078000, 98337:0.087000, 98338:0.079000, 98339:0.090000, 98340:0.087000, 98342:0.087000, 98344:0.079000, 98345:0.087000, 98346:0.087000, 98348:0.079000, 98349:0.079000, 98350:0.082000, 98351:0.079000, 98352:0.088000, 98353:0.087000, 98354:0.094000, 98355:0.078000, 98356:0.078000, 98357:0.082000, 98358:0.090000, 98359:0.087000, 98360:0.079000, 98361:0.078000, 98362:0.084000, 98363:0.084000, 98364:0.087000, 98365:0.090000, 98366:0.087000, 98367:0.087000, 98368:0.090000, 98370:0.087000, 98371:0.094000, 98372:0.094000, 98373:0.094000, 98374:0.094000, 98375:0.088000, 98376:0.090000, 98377:0.078000, 98380:0.087000, 98381:0.082000, 98382:0.082000, 98383:0.087000, 98384:0.087000, 98385:0.079000, 98386:0.087000, 98387:0.094000, 98388:0.094000, 98390:0.088000, 98391:0.088000, 98392:0.087000, 98393:0.087000, 98394:0.079000, 98395:0.079000, 98396:0.079000, 98401:0.095000, 98402:0.095000, 98403:0.095000, 98404:0.095000, 98405:0.095000, 98406:0.095000, 98407:0.095000, 98408:0.095000, 98409:0.095000, 98411:0.095000, 98413:0.095000, 98416:0.095000, 98417:0.095000, 98418:0.095000, 98419:0.095000, 98421:0.095000, 98422:0.095000, 98424:0.094000, 98430:0.095000, 98431:0.095000, 98433:0.088000, 98438:0.088000, 98439:0.094000, 98443:0.094000, 98444:0.094000, 98445:0.094000, 98446:0.088000, 98447:0.094000, 98448:0.095000, 98464:0.094000, 98465:0.095000, 98466:0.094000, 98467:0.094000, 98490:0.095000, 98496:0.094000, 98498:0.094000, 98499:0.094000, 98501:0.088000, 98502:0.088000, 98503:0.087000, 98505:0.087000, 98506:0.088000, 98507:0.088000, 98508:0.088000, 98509:0.087000, 98511:0.087000, 98512:0.087000, 98513:0.087000, 98516:0.079000, 98520:0.086300, 98524:0.085000, 98526:0.085000, 98527:0.079000, 98528:0.085000, 98530:0.079000, 98531:0.080000, 98532:0.080000, 98533:0.078000, 98535:0.085000, 98536:0.085000, 98537:0.085000, 98538:0.078000, 98539:0.078000, 98540:0.079000, 98541:0.085000, 98542:0.078000, 98544:0.078000, 98546:0.085000, 98547:0.079000, 98548:0.085000, 98550:0.085000, 98552:0.085000, 98554:0.079000, 98555:0.085000, 98556:0.079000, 98557:0.085000, 98558:0.079000, 98559:0.085000, 98560:0.085000, 98562:0.085000, 98563:0.085000, 98564:0.078000, 98565:0.078000, 98566:0.085000, 98568:0.085000, 98569:0.085000, 98570:0.078000, 98571:0.085000, 98572:0.078000, 98575:0.085000, 98576:0.079000, 98577:0.079000, 98579:0.079000, 98580:0.079000, 98581:0.077000, 98582:0.078000, 98583:0.085000, 98584:0.085000, 98585:0.078000, 98586:0.079000, 98587:0.085000, 98588:0.085000, 98589:0.079000, 98590:0.079000, 98591:0.078000, 98592:0.085000, 98593:0.078000, 98595:0.085000, 98596:0.078000, 98597:0.079000, 98601:0.077000, 98602:0.070000, 98603:0.077000, 98604:0.077000, 98605:0.075000, 98606:0.077000, 98607:0.084000, 98609:0.077000, 98610:0.077000, 98611:0.077000, 98612:0.076000, 98613:0.070000, 98614:0.079000, 98616:0.077000, 98617:0.070000, 98619:0.070000, 98620:0.070000, 98621:0.076000, 98622:0.077000, 98623:0.070000, 98624:0.079000, 98625:0.077000, 98626:0.080000, 98628:0.070000, 98629:0.077000, 98631:0.079000, 98632:0.080000, 98635:0.070000, 98637:0.079000, 98638:0.079000, 98639:0.077000, 98640:0.079000, 98641:0.079000, 98642:0.077000, 98643:0.076000, 98644:0.079000, 98645:0.077000, 98647:0.076000, 98648:0.077000, 98649:0.077000, 98650:0.070000, 98651:0.077000, 98660:0.084000, 98661:0.084000, 98662:0.084000, 98663:0.084000, 98664:0.084000, 98665:0.084000, 98666:0.084000, 98668:0.084000, 98670:0.070000, 98671:0.084000, 98672:0.070000, 98673:0.070000, 98674:0.077000, 98675:0.077000, 98682:0.084000, 98683:0.084000, 98684:0.084000, 98685:0.084000, 98686:0.084000, 98687:0.084000, 98801:0.084000, 98802:0.082000, 98807:0.084000, 98811:0.082000, 98812:0.081000, 98813:0.077000, 98814:0.081000, 98815:0.082000, 98816:0.082000, 98817:0.082000, 98819:0.081000, 98821:0.082000, 98822:0.082000, 98823:0.080000, 98824:0.079000, 98826:0.082000, 98827:0.081000, 98828:0.082000, 98829:0.081000, 98830:0.078000, 98831:0.082000, 98832:0.079000, 98833:0.081000, 98834:0.081000, 98836:0.082000, 98837:0.079000, 98840:0.082000, 98841:0.081000, 98843:0.082000, 98844:0.081000, 98845:0.078000, 98846:0.081000, 98847:0.082000, 98848:0.079000, 98849:0.081000, 98850:0.082000, 98851:0.079000, 98852:0.082000, 98853:0.079000, 98855:0.081000, 98856:0.082000, 98857:0.079000, 98858:0.082000, 98859:0.081000, 98860:0.079000, 98862:0.081000, 98901:0.082000, 98902:0.082000, 98903:0.079000, 98907:0.082000, 98908:0.082000, 98909:0.082000, 98920:0.079000, 98921:0.079000, 98922:0.080000, 98923:0.079000, 98925:0.080000, 98926:0.080000, 98930:0.079000, 98932:0.079000, 98933:0.079000, 98934:0.080000, 98935:0.079000, 98936:0.079000, 98937:0.079000, 98938:0.079000, 98939:0.079000, 98940:0.080000, 98941:0.080000, 98942:0.079000, 98943:0.080000, 98944:0.079000, 98946:0.080000, 98947:0.079000, 98948:0.079000, 98950:0.080000, 98951:0.079000, 98952:0.079000, 98953:0.079000, 99001:0.089000, 99003:0.081000, 99004:0.087000, 99005:0.081000, 99006:0.081000, 99008:0.077000, 99009:0.081000, 99011:0.087000, 99012:0.081000, 99013:0.076000, 99014:0.087000, 99016:0.087000, 99017:0.078000, 99018:0.081000, 99019:0.087000, 99020:0.081000, 99021:0.081000, 99022:0.081000, 99023:0.081000, 99025:0.081000, 99026:0.081000, 99027:0.081000, 99029:0.077000, 99030:0.081000, 99031:0.081000, 99032:0.077000, 99033:0.078000, 99034:0.076000, 99036:0.081000, 99037:0.087000, 99039:0.081000, 99040:0.076000, 99101:0.076000, 99102:0.078000, 99103:0.077000, 99104:0.078000, 99105:0.077000, 99107:0.077000, 99109:0.076000, 99110:0.076000, 99111:0.078000, 99113:0.078000, 99114:0.076000, 99115:0.079000, 99116:0.077000, 99117:0.077000, 99118:0.077000, 99119:0.076000, 99121:0.077000, 99122:0.077000, 99123:0.079000, 99124:0.077000, 99125:0.078000, 99126:0.076000, 99128:0.078000, 99129:0.076000, 99130:0.078000, 99131:0.076000, 99133:0.079000, 99134:0.077000, 99135:0.079000, 99136:0.078000, 99137:0.076000, 99138:0.077000, 99139:0.076000, 99140:0.077000, 99141:0.076000, 99143:0.078000, 99144:0.077000, 99146:0.077000, 99147:0.077000, 99148:0.076000, 99149:0.078000, 99150:0.077000, 99151:0.076000, 99152:0.076000, 99153:0.076000, 99154:0.077000, 99155:0.077000, 99156:0.076000, 99157:0.076000, 99158:0.078000, 99159:0.077000, 99160:0.077000, 99161:0.078000, 99163:0.078000, 99164:0.078000, 99166:0.077000, 99167:0.076000, 99169:0.077000, 99170:0.078000, 99171:0.078000, 99173:0.076000, 99174:0.078000, 99176:0.078000, 99179:0.078000, 99180:0.076000, 99181:0.076000, 99185:0.077000, 99201:0.087000, 99202:0.087000, 99203:0.087000, 99204:0.087000, 99205:0.087000, 99206:0.087000, 99207:0.087000, 99208:0.087000, 99209:0.087000, 99210:0.087000, 99211:0.087000, 99212:0.087000, 99213:0.087000, 99214:0.087000, 99216:0.087000, 99217:0.087000, 99218:0.087000, 99219:0.087000, 99220:0.087000, 99223:0.087000, 99224:0.087000, 99228:0.087000, 99251:0.087000, 99252:0.087000, 99256:0.087000, 99258:0.087000, 99260:0.087000, 99301:0.086000, 99302:0.086000, 99320:0.086000, 99321:0.079000, 99322:0.070000, 99323:0.081000, 99324:0.087000, 99326:0.080000, 99328:0.083000, 99329:0.081000, 99330:0.080000, 99333:0.078000, 99335:0.080000, 99336:0.086000, 99337:0.086000, 99338:0.080000, 99341:0.077000, 99343:0.080000, 99344:0.077000, 99345:0.080000, 99346:0.080000, 99347:0.077000, 99348:0.081000, 99349:0.079000, 99350:0.086000, 99352:0.086000, 99353:0.086000, 99354:0.086000, 99356:0.070000, 99357:0.079000, 99359:0.081000, 99360:0.081000, 99361:0.081000, 99362:0.089000, 99363:0.081000, 99371:0.077000, 99401:0.077000, 99402:0.077000, 99403:0.077000}

exports.sales_tax = (zip) -> return WA_sales_tax[zip] ? 0


# Sanitizing HTML: loading the jquery file, caching it, and then exposing it in the API
_jQuery_cached = null

run_jQuery = (cb) ->
    if _jQuery_cached != null
        cb(_jQuery_cached)
    else
        jquery_file = fs.readFileSync("../static/jquery/jquery.min.js", "utf-8")
        require("jsdom").env
          html: "<html></html>",
          src: [jquery_file],
          done: (err, window) ->
            _jQuery_cached = window.$
            cb(_jQuery_cached)


exports.sanitize_html = (html, cb) ->
    run_jQuery ($) ->
        cb($("<div>").html(html).html())
