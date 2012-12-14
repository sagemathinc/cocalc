net = require 'net'

server = net.createServer (socket) ->
    socket.write 'hello'

server.listen 8124, () -> console.log 'listening on port 8124'
