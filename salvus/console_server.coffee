net = require 'net'
pty = require 'pty.js'

server = net.createServer (socket) ->
    opts =
        name : 'xterm'
        rows : 20
        cols : 100
        cwd  : process.env.HOME

    term = pty.fork('bash', [], opts)

    socket.on 'data', (data) ->
        term.write data

    term.on 'data', (data) ->
        socket.write data

server.listen 8124, () -> console.log 'listening on port 8124'
