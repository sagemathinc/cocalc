####################################################################
#
# misc JS functionality that only makes sense on the node side (not on
# the client)
#
####################################################################

assert = require('assert')

winston = require('winston')

net = require('net')

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

{defaults, required, to_json} = require 'misc'

message = require 'message'

exports.enable_mesg = enable_mesg = (socket) ->
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
                            winston.debug("Error parsing JSON message '#{s}'")
                            throw(e)
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

    socket.write_mesg = (type, data) ->
        send = (s) ->
            buf = new Buffer(4)
            buf.writeInt32BE(s.length, 0)
            socket.write(buf)
            socket.write(s)
        switch type
            when 'json'
                send('j' + JSON.stringify(data))
            when 'blob'
                assert(data.uuid?, "data object *must* have a uuid attribute")
                assert(data.blob?, "data object *must* have a blob attribute")
                send(Buffer.concat([new Buffer('b'), new Buffer(data.uuid), new Buffer(data.blob)]))
            else
                throw("unknown message type '#{type}'")

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

# Connect to a locked socket on localhost, unlock it, and do cb(err,
# unlocked_socket).  We do not allow connection to any other host,
# since this is not an *encryption* protocol; fortunately, traffic on
# localhost can't be sniffed (except as root, of course, when it can be).
exports.connect_to_locked_socket = (opts) ->
    {port, token, timeout, cb} = defaults opts,
        port    : required
        token   : required
        timeout : 5
        cb      : required

    console.log("connecting to a locked socket on port #{port}...")
    timer = undefined

    timed_out = () ->
        cb("Timed out trying to connect to locked socket on port #{port}")
        socket.end()
        timer = undefined

    timer = setTimeout(timed_out, timeout*1000)

    socket = net.connect {port:port}, () =>
        listener = (data) ->
            console.log("got back response: #{data}")
            socket.removeListener('data', listener)
            if data.toString() == 'y'
                if timer?
                    clearTimeout(timer)
                    cb(false, socket)
            else
                socket.destroy()
                if timer?
                    clearTimeout(timer)
                    cb("Permission denied (invalid secret token) when connecting to the local hub.")
        socket.on 'data', listener
        console.log("connected, now sending secret token")
        socket.write(token)


# Compute a uuid v4 from the Sha-1 hash of data.
crypto = require('crypto')
exports.uuidsha1 = (data) ->
    sha1sum = crypto.createHash('sha1')
    sha1sum.update(data)
    s = sha1sum.digest('hex')
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

exports.execute_code = (opts) ->
    opts = defaults opts,
        command    : required
        args       : []
        path       : undefined   # defaults to home directory; where code is executed from
        timeout    : 10          # timeout in *seconds*
        err_on_exit: true        # if true, then a nonzero exit code will result in cb(error_message)
        max_output : undefined   # bound on size of stdout and stderr; further output ignored
        bash       : false       # if true, ignore args and evaluate command as a bash command
        home       : undefined
        uid        : undefined
        gid        : undefined
        cb         : required

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

    winston.debug("execute_code: home='#{opts.home}', path='#{opts.path}'")

    stdout = ''
    stderr = ''
    exit_code = undefined

    if opts.uid?
        env = {HOME:opts.home}

    tmpfilename = undefined

    async.series([
        (c) ->
            if not opts.bash
                c()
                return
            if opts.timeout?
                # This ensures that everything involved with this
                # command really does die no matter what; it's
                # better than killing from outside, since it gets
                # all subprocesses since they inherit the limits.
                cmd = "ulimit -t #{opts.timeout}\n#{opts.command}"
            else
                cmd = opts.command

            winston.debug("execute_code: writing temporary file that contains bash program.")
            temp.open '', (err, info) ->
                if err
                    c(err)
                else
                    opts.command = 'bash'
                    opts.args    = [info.path]
                    fs.write(info.fd, cmd)
                    fs.close(info.fd, c)
                    tmpfilename =info.path

        (c) ->
            if tmpfilename?
                fs.chmod(tmpfilename, 0o777, c)
            else
                c()

        (c) ->
            winston.debug("Spawn the command #{opts.command} with given args #{opts.args}")
            o = {cwd:opts.path}
            if env?
                o.env = env
            if opts.uid
                o.uid = opts.uid
            if opts.gid
                o.gid = opts.gid

            r = child_process.spawn(opts.command, opts.args, o)

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

            finish = () ->
                if stdout_is_done and stderr_is_done and exit_code?
                    if opts.err_on_exit and exit_code != 0
                        c("command '#{opts.command}' (args=#{opts.args.join(' ')}) exited with nonzero code #{exit_code} -- stderr='#{stderr}'")
                    else
                        if opts.max_output?
                            if stdout.length >= opts.max_output
                                stdout += " (truncated at #{opts.max_output} characters)"
                            if stderr.length >= opts.max_output
                                stderr += " (truncated at #{opts.max_output} characters)"
                        c()

            if opts.timeout?
                f = () ->
                    if r.exitCode == null
                        winston.debug("execute_code: subprocess did not exit after #{opts.timeout} seconds, so killing with SIGKILL")
                        r.kill("SIGKILL")  # this does not kill the process group :-(
                        c("killed command '#{opts.command} #{opts.args.join(' ')}'")
                setTimeout(f, opts.timeout*1000)

    ], (err) ->
        if not exit_code?
            exit_code = 1  # don't have one due to SIGKILL
        # TODO:  This is dangerous, e.g., it could print out a secret_token to a log file.
        winston.debug("Running '#{opts.command} #{opts.args.join(' ')}' produced stdout='#{stdout}', stderr='#{stderr}', exit_code=#{exit_code}, err=#{err}")
        opts.cb?(err, {stdout:stdout, stderr:stderr, exit_code:exit_code})
        # Do not litter:
        if tmpfilename?
            fs.unlink(tmpfilename)
    )



###################################
# project_id --> username mapping

# The username associated to a given project id is just the string of
# the uuid, but with -'s replaced by _'s so we obtain a valid unix
# account name, and shortened to fit Linux and sanity requirements.
exports.username = (project_id) ->
    if '..' in project_id or project_id.length != 36
        # a sanity check -- this should never ever be allowed to happen, ever.
        throw "invalid project id #{project_id}"
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

exports.forward_remote_port_to_localhost = (opts) ->
    opts = defaults opts,
        username    : required
        host        : required
        ssh_port    : 22
        remote_port : required
        activity_time : 3600 # kill connection if the HUB doesn't
                             # actively *receive* something on this
                             # port for this many seconds.
        keep_alive_time :  5 # network activity every this many
                             # seconds.; lower to more quickly detect
                             # a broken connection; raise to reduce resources
        cb          : required  # cb(err, local_port)

    winston.debug("Forward a remote port #{opts.remote_port} on #{opts.host} to localhost.")

    remote_address = "#{opts.username}@#{opts.host}:#{opts.ssh_port}"
    local_port = address_to_local_port[remote_address]

    if local_port?
        # We already have a valid forward
        opts.cb(false, local_port)
        return

    # We have to make a new port forward
    portfinder = require('portfinder')
    portfinder.basePort = Math.floor(Math.random()*50000)+8000  # avoid race condition...
    portfinder.getPort (err, local_port) ->
        if err
            opts.cb(err)
            return
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
        kill_no_output_timer = setInterval(kill_if_no_new_output, 2*1000*opts.keep_alive_time)

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
