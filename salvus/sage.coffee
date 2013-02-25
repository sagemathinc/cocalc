############################################################################
#
# sage.coffee -- TCP interface between NodeJS and a Sage server instance
#
# The TCP interface to the sage server is necessarily "weird" because
# the Sage process that is actually running the code *is* the server
# one talks to via TCP after starting a session.  Since Sage itself is
# blocking when running code, and running as the user when running
# code can't be trusted, e.g., anything in the server can be
# arbitrarily modified, all *control* messages, e.g., sending signals,
# cleaning up, etc. absolutely require making a separate TCP connection.
#
# So:
#
#    1. Make a connection to the TCP server, which runs as root and
#       forks on connection.
#
#    2. Create a new session, which drops privileges to a random clean
#       user, and continues to listen on the TCP socket when not doing
#       computations.
#
#    3. Send request-to-exec, etc., messages to the socket in (2)
#       and get back output over (2).
#
#    4. To send a signal, get files, save worksheet state, etc.,
#       make a new connection to the TCP server, and send a message
#       in the freshly forked off process, which runs as root.
#
# With this architecture, the sage process that the user is
# interacting with has ultimate control over the messages it sends and
# receives (which is incredibly powerful and customizable), with no
# stupid pexpect or anything else like that to get in the way.  At the
# same time, we still have a root out-of-process control mechanism,
# though with the overhead of establishing a new connection each time.
# Since control messages are much less frequent, this overhead is
# acceptable.
#
############################################################################

net     = require('net')

winston = require('winston')            # https://github.com/flatiron/winston

message = require("message")

misc    = require("misc"); defaults = misc.defaults; required = defaults.required

{enable_mesg} = require('misc_node')

exports.send_control_message = (opts={}) ->
    opts = defaults(opts, {host: required, port: required, mesg: required})
    sage_control_conn = new exports.Connection
        host : opts.host
        port : opts.port
        cb   : ->
            sage_control_conn.send_json(opts.mesg)
            sage_control_conn.close()

exports.send_signal = (opts={}) ->
    opts = defaults(opts, {host: required, port: required, pid:required, signal:required})
    exports.send_control_message
        host : opts.host
        port : opts.port
        mesg : message.send_signal(pid:opts.pid, signal:opts.signal)


class exports.Connection
    constructor: (options) ->
        options = defaults(options,
            host: required
            port: required
            recv: undefined
            cb:   undefined
        )
        @host = options.host
        @port = options.port
        @conn = net.connect({port:@port, host:@host}, options.cb)
        @recv = options.recv  # send message to client
        @buf = null
        @buf_target_length = -1

        @conn.on 'error', (err) =>
            winston.error("sage connection error: #{err}")
            @recv?('json', message.terminate_session(reason:"#{err}"))

        enable_mesg(@conn)
        @conn.on 'mesg', (type, data) =>
            @recv?(type, data)

    send_json: (mesg) ->
        @conn.write_mesg('json', mesg)

    send_blob: (uuid, blob) ->
        @conn.write_mesg('blob', {uuid:uuid, blob:blob})

    # Close the connection with the server.  You probably instead want
    # to send_signal(...) using the module-level function to kill the
    # session, in most cases, since this will leave the Sage process running.
    close: () ->
        @conn.end()
        @conn.destroy()

###
test = (n=1) ->
    message = require("message")
    cb = () ->
        conn.send_json(message.start_session())
        for i in [1..n]
            conn.send_json(message.execute_code(id:0,code:"factor(2012)"))
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