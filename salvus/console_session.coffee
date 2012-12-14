net = require 'net'

server = net.createServer (socket) ->
    socket.on 'data', (data) ->
        socket.write data

server.listen 8124, () -> console.log 'listening on port 8124'
