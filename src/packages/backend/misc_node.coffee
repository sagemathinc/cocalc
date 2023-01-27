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

exports.enable_mesg = require('./tcp/enable-messaging-protocol').default

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

exports.abspath = require('./misc/abspath').default



