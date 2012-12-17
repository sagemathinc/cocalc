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

net            = require 'net'
child_process  = require 'child_process'
message        = require 'message'

{to_json, from_json}   = require 'misc'


start_session = (socket, mesg) ->
    console.log("start_session #{to_json(mesg)}")
    # Fork of a child process that drops privileges and does all further work to handle a connection.
    child = child_process.fork(__dirname + '/console_server_child.js', [])
    console.log("PARENT: forked off child to handle it")
    opts = {home:'/tmp/x/', rows:20, cols:80, command:'/bin/bash', path:process.env.PATH}
    if process.getuid() == 0  # root
        console.log("running as root, so forking with reduced privileges")
        opts.uid = Math.floor(2000 + Math.random()*1000)
        opts.gid = opts.uid
    child.send(opts, socket)

handle_client = (socket, mesg) ->
    switch mesg.event
        when 'start_session'
            start_session(socket, mesg)
        when 'send_signal'
            process.kill(mesg.pid, mesg.signal)
            socket.write(to_json(message.signal_sent(id:mesg.id)))
        else
            socket.write(to_json(message.error(id:mesg.id, error:"Console server received an invalid mesg type '#{mesg.event}'")))

server = net.createServer (socket) ->
    console.log("PARENT: received connection")
    # Receive a single control message, which is a JSON object terminated by null.
    buf = null
    socket.on 'data', (data) ->
        console.log("RECEIVED: #{data}")
        if buf == null
            buf = data
        else
            buf = Buffer.concat([buf, data])
        if buf[buf.length-1] == 0
            # received a complete message; handle it
            console.log("mesg = #{from_json(buf.slice(0,buf.length-1).toString())}")
            socket.removeAllListeners 'data'
            handle_client(socket, from_json(buf.slice(0,buf.length-1).toString()))


server.listen 8124, () -> console.log 'listening on port 8124'
