###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2016, Sagemath Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################


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

message = require("smc-util/message")
misc    = require('smc-util/misc')
{defaults, required} = misc

{connect_to_locked_socket, enable_mesg} = require('smc-util-node/misc_node')

exports.send_control_message = (opts) ->
    opts = defaults opts,
        host         : 'localhost'
        port         : required
        secret_token : required
        mesg         : required

    sage_control_conn = new exports.Connection
        secret_token : opts.secret_token
        host : opts.host
        port : opts.port
        cb   : ->
            sage_control_conn.send_json(opts.mesg)
            sage_control_conn.close()

exports.send_signal = (opts) ->
    opts = defaults opts,
        host         : 'localhost'
        port         : required
        secret_token : required
        pid          : required
        signal       : required

    exports.send_control_message
        host : opts.host
        port : opts.port
        secret_token : opts.secret_token
        mesg : message.send_signal(pid:opts.pid, signal:opts.signal)


class exports.Connection
    constructor: (options) ->
        options = defaults options,
            secret_token : required
            port         : required
            host         : 'localhost'   # should always be there, since we use port forwarding for security
            recv         : undefined
            cb           : undefined
        @host = options.host
        @port = options.port

        connect_to_locked_socket
            port  : @port
            token : options.secret_token
            cb    : (err, _conn) =>
                if err
                    options.cb(err)
                    return

                if not _conn
                    options.cb("unable to connect to a locked socket")
                    return

                @conn = _conn

                @recv = options.recv  # send message to client
                @buf = null
                @buf_target_length = -1

                @conn.on 'error', (err) =>
                    winston.error("sage connection error: #{err}")
                    @recv?('json', message.terminate_session(reason:"#{err}"))

                enable_mesg(@conn, 'connection to a sage server')
                @conn.on 'mesg', (type, data) =>
                    @recv?(type, data)

                options.cb()

    send_json: (mesg) ->
        @conn?.write_mesg('json', mesg)

    send_blob: (uuid, blob) ->
        @conn?.write_mesg('blob', {uuid:uuid, blob:blob})

    # Close the connection with the server.  You probably instead want
    # to send_signal(...) using the module-level function to kill the
    # session, in most cases, since this will leave the Sage process running.
    close: () ->
        @conn?.end()
        @conn?.destroy()
