###
#
#    c = require('client_node').connect("http://localhost:5000")
# 
###

client = require('client')

exports.connect = (url) -> new Connection(url)

class Connection extends client.Connection
    constructor: (url) ->
        conn = require("sockjs-client-ws").create("#{url}/hub")  # note -- https is not supported
        super(
            send: (data) -> conn.write(data)
            set_onmessage: (cb) -> conn.on('data', cb)
            set_onerror: (cb) -> conn.on('error', cb)
        )

        
        
