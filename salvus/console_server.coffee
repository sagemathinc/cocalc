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

server = net.createServer (socket) ->
    console.log("PARENT: received connection")
    cp = child_process.fork(__dirname + '/console_server_child.js', [])
    console.log("PARENT: forked off child to handle it")
    opts = {HOME:'/tmp/x/', rows:20, cols:140}
    if process.getuid() == 0  # root
        console.log("running as root, so forking with reduced privileges")
        opts.uid = Math.floor(2000 + Math.random()*1000)
        opts.gid = opts.uid

    cp.send(opts, socket) 


server.listen 8124, () -> console.log 'listening on port 8124'
