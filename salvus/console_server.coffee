#################################################################
#
# console_server -- a node.js tty console server
#
#   * the server, which runs as a command-line daemon (or can
#     be used as a library)
#
#   * the client, which e.g. gets imported by hub and used
#     for communication between hub and the server daemon.
#
#################################################################

async          = require 'async'
fs             = require 'fs'
net            = require 'net'
child_process  = require 'child_process'
message        = require 'message'
{read_until_null} = require 'misc_node'

{to_json, from_json, defaults, required}   = require 'misc'


makedirs = (path, uid, gid, cb) ->
    # TODO: this should split the path and make sure everything is
    # made along the way like in Python, but I'm going to wait on
    # implementing, since with internet maybe find that already in a
    # library.
    async.series([
        (c) -> fs.exists path, (exists) ->
            if exists # done
                cb(); c(true)
            else
                c()
        (c) -> fs.mkdir path, (err) ->
            if err
                cb(err); c(true)
            else
                c()
        (c) ->
            if not uid? or not gid?
                cb(); c()
            else
                fs.chown path, uid, gid, (err) ->
                    if err
                        cb(err); c(true)
                    else
                        cb(); c()
    ])

start_session = (socket, mesg) ->
    console.log("start_session #{to_json(mesg)}")
    opts = defaults mesg.params,
        home    : required
        rows    : 24
        cols    : 80
        command : undefined
        args    : ['--norc']
        ps1     : '\\w\\$ '
        path    : process.env.PATH
        cwd     : undefined          # starting PATH -- default is computed below

    if process.getuid() == 0  # root
        console.log("running as root, so forking with reduced privileges")
        opts.uid = Math.floor(2000 + Math.random()*1000)  # TODO: just for testing; hub/database will *have* to assign this soon
        opts.gid = opts.uid

    # If opts.home does not exist, create it and set the right
    # permissions before dropping privileges:
    opts.home = "/tmp/salvus/#{opts.home}"
    if not opts.cwd?
        opts.cwd = opts.home
    makedirs opts.home, opts.uid, opts.gid, (err) ->
        if err
            console.log("ERROR: #{err}")  # no way to report error further... yet
        else
            # Fork of a child process that drops privileges and does all further work to handle a connection.
            child = child_process.fork(__dirname + '/console_server_child.js', [])
            # Send the pid of the child back
            socket.write(child.pid + '\u0000')
            # Give the socket to the child, along with the options
            child.send(opts, socket)
            console.log("PARENT: forked off child to handle it")

handle_client = (socket, mesg) ->
    try
        switch mesg.event
            when 'start_session'
                start_session(socket, mesg)
            when 'send_signal'
                switch mesg.signal
                    when 2
                        signal = 'SIGINT'
                    when 3
                        signal = 'SIGQUIT'
                    when 9
                        signal = 'SIGKILL'
                    else
                        throw("only signals 2 (SIGINT), 3 (SIGQUIT), and 9 (SIGKILL) are supported")
                process.kill(mesg.pid, signal)
                socket.write(to_json(message.signal_sent(id:mesg.id)))
            else
                err = message.error(id:mesg.id, error:"Console server received an invalid mesg type '#{mesg.event}'")
                socket.write(to_json(err))
    catch e
        console.log("ERROR: '#{e}' handling message '#{to_json(mesg)}'")

server = net.createServer (socket) ->
    console.log("PARENT: received connection")
    # Receive a single control message, which is a JSON object terminated by null.
    read_until_null(socket, (result, extra_data) ->
        console.log("... and read #{result}, #{extra_data}")
        handle_client(socket, from_json(result.toString()))
    )

server.listen 8124, () -> console.log 'listening on port 8124'
