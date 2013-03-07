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
# cb(false), then send back "y".  If any mistake is made (or
# the socket times out), send back "n" and close the connection.
exports.unlock_socket = (socket, token, cb) ->     # cb(err)
    console.log("unlocking a socket")
    user_token = ''
    listener = (data) ->
        user_token += data.toString()
        console.log("so far, got: '#{user_token}'; looking for '#{token}'")
        console.log("token.length = #{token.length}")
        console.log("user_token.length = #{user_token.length}")
        for i in [0...token.length]
            if user_token[i] != token[i]
                console.log(i, user_token[i], token[i])
        if user_token == token
            socket.removeListener('data', listener)
            console.log("got it!")
            # got it!
            socket.write('y')
            cb(false)
        else if user_token.length > token.length or token.slice(0, user_token.length) != user_token
            console.log("client-provided secret token is wrong -- denying access")
            socket.removeListener('data', listener)
            socket.write('n')
            socket.destroy()
            cb("Invalid secret token.")

    socket.on('data', listener)


# Connect to a locked socket on localhost, unlock it, and do cb(err,
# unlocked_socket).  We do not allow connection to any other host,
# since this is not an *encryption* protocol; fortunately, traffic on
# localhost can't be sniffed (except as root, of course, when it can be).
exports.connect_to_locked_socket = (port, token, cb) ->
    console.log("connecting to a locked socket...")
    socket = net.connect {port:port}, () =>
        listener = (data) ->
            console.log("got back response: #{data}")
            socket.removeListener('data', listener)
            if data.toString() == 'y'
                cb(false, socket)
            else
                socket.destroy()
                cb("Permission denied (invalid secret token) when connecting to the local hub.")
        socket.on 'data', listener
        console.log("connected, now sending secret token")
        socket.write(token)
    return socket

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
