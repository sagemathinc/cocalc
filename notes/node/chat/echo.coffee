http = require 'http'
sockjs = require 'sockjs'
node_static = require 'node-static'

echo = sockjs.createServer({sockjs_url: "http://cdn.sockjs.org/sockjs-0.3.min.js"})

connections = []

echo.on 'connection', (conn) ->
    connections.push(conn)
    conn.on 'data', (message) ->
        c.write(message) for c in connections when c != conn

static_directory = new node_static.Server __dirname

server = http.createServer()

server.addListener 'request', (req, res) -> static_directory.serve req, res
server.addListener 'upgrade', (req, res) -> res.end()

echo.installHandlers server, {prefix:'/echo'}

console.log "listening on port 9999"
server.listen 9999, '0.0.0.0'
