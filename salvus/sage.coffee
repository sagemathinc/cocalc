net = require('net')

message = require("salvus_message")

class exports.Connection
    constructor: (options) ->
        @conn = net.connect({port:options.port, host:options.host}, options.cb)
        @recv = options.recv
        @buf = null
        @buf_target_length = -1
        @conn.on('data', (data) =>
            # read any new data into buf
            if @buf == null
                @buf = data   # first time to ever recv data, so initialize buffer
            else
                @buf = Buffer.concat([@buf, data])   # extend buf with new data

            loop
                if @buf_target_length == -1
                    # starting to read a new message
                    if @buf.length >= 4
                        @buf_target_length = @buf.readUInt32BE(0) + 4
                    else
                        return  # have to wait for more data
                if @buf_target_length <= @buf.length
                    # read a new message from our buffer
                    mesg = @buf.slice(4, @buf_target_length)
                    @recv(JSON.parse(mesg.toString()))
                    @buf = @buf.slice(@buf_target_length)
                    @buf_target_length = -1
                else  # nothing to do but wait for more data
                    return
        )
        
        @conn.on('end', -> console.log("disconnected from sage server"))

    # send a message
    send: (mesg) ->
        s = JSON.stringify(mesg)
        buf = new Buffer(4)
        buf.writeInt32BE(s.length, 0)
        @conn.write(buf)
        @conn.write(s)

    terminate_session: () ->
        @send(message.terminate_session())


        
###
test = (n=1) ->
    message = require("salvus_message")
    cb = () ->         
        conn.send(message.start_session())
        for i in [1..n]
            conn.send(message.execute_code(0,"factor(2012)"))
    tm = (new Date()).getTime()
    conn = new exports.Connection(
        {
            host:'localhost'
            port:10000
            recv:(mesg) -> console.log("received message #{mesg}; #{(new Date()).getTime()-tm}")
            cb:cb
        }
    )

test(5)
###