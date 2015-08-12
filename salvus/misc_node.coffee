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

assert = require('assert')
winston = require('winston')
net = require('net')
fs = require('fs')
misc = require 'misc'
async = require('async')

{walltime, defaults, required, to_json} = misc

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


message = require 'message'

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


####
## Applications of execute_code

exports.disk_usage = (path, cb) ->  # cb(err, usage in K (1024 bytes) of path)
    exports.execute_code
        command : "du"
        args    : ['-s', path]
        cb      : (err, output) ->
            if err
                cb(err)
            else
                cb(false, parseInt(output.stdout.split(' ')[0]))


###################################
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
                if err.code == 'EEXIST'
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

