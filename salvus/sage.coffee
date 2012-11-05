############################################################################
# 
# sage.coffee -- TCP interface between NodeJS and a Sage server instance
#
############################################################################ 

net     = require('net')

winston = require('winston')            # https://github.com/flatiron/winston

message = require("message")

misc    = require("misc"); defaults = misc.defaults; required = defaults.required

exports.send_control_message = (opts={}) ->
    opts = defaults(opts, {host: required, port: required, mesg: required})
    sage_control_conn = new exports.Connection
        host : opts.host
        port : opts.port
        cb   : ->
            sage_control_conn.send(opts.mesg)
            sage_control_conn.close()

exports.send_signal = (opts={}) ->
    opts = defaults(opts, {host: required, port: required, pid:required, signal:required})
    exports.send_control_message
        host : opts.host
        port : opts.port
        mesg : message.send_signal(pid:opts.pid, signal:opts.signal)
    

class exports.Connection
    constructor: (options) ->
        @host = options.host
        @port = options.port
        @conn = net.connect({port:@port, host:@host}, options.cb)
        @recv = options.recv  # send message to client
        @buf = null
        @buf_target_length = -1
        
        @conn.on('error', (err) =>
            winston.error("sage connection error: #{err}")
            @recv(message.terminate_session(reason:"#{err}"))
        )
        
        @conn.on('data', (data) =>
            # read any new data into buf
            if @buf == null
                @buf = data   # first time to ever recv data, so initialize buffer
            else
                @buf = Buffer.concat([@buf, data])   # extend buf with new data

            loop
                if @buf_target_length == -1
                    # starting to read a new message
                    if @buf and @buf.length >= 4
                        @buf_target_length = @buf.readUInt32BE(0) + 4
                    else
                        return  # have to wait for more data
                if @buf_target_length <= @buf.length
                    # read a new message from our buffer
                    mesg = @buf.slice(4, @buf_target_length)
                    s = mesg.toString()
                    #winston.info("(sage.coffee) received message: #{s}")
                    @recv(JSON.parse(s))
                    @buf = @buf.slice(@buf_target_length)
                    @buf_target_length = -1
                    if @buf.length == 0
                        return
                else  # nothing to do but wait for more data
                    return
        )
        @conn.on('end', -> winston.info("(sage.coffee) disconnected from sage server"))

    # send a message to sage_server
    send: (mesg) ->
        s = JSON.stringify(mesg)
        winston.info("(sage.coffee) send message: #{s}")
        buf = new Buffer(4)
        buf.writeInt32BE(s.length, 0)
        @conn.write(buf)
        @conn.write(s)

    close: () ->
        @conn.end()
        @conn.destroy()
        
###
test = (n=1) ->
    message = require("message")
    cb = () ->         
        conn.send(message.start_session())
        for i in [1..n]
            conn.send(message.execute_code(id:0,code:"factor(2012)"))
    tm = (new Date()).getTime()
    conn = new exports.Connection(
        {
            host:'localhost'
            port:10000
            recv:(mesg) -> winston.info("received message #{mesg}; #{(new Date()).getTime()-tm}")
            cb:cb
        }
    )

test(5)
###