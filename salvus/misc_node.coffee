####################################################################
#
# misc JS functionality that only makes sense on the node side (not on
# the client)
#
####################################################################


######################################################################
# Our TCP messaging system.  We send a message by first
# sending the length, then the bytes of the actual message.  The code
# in this section is used by:
#       * hub -- to communicate with sage_server and console_server
######################################################################

# Extend the socket object so that listens to all data coming in on this socket
# and fires a 'mesg' event, along with the JSON object or blob in the message
# So, one listens with:
#             socket.on('mesg', (type, value) -> ...)
# where type is one if 'json' or 'blob'.
#
# Calling this function also adds a function .write_mesg to the socket, so that
#             socket.write_mesg(type, data)
# will send the message of the given type on the socket.   When type='json',
# data is just a JSON-able object.  When type='blob', data={uuid:..., blob:...};
# since every blob is tagged with a uuid.

exports.enable_mesg = enable_mesg = (socket) ->
    socket._buf = null
    socket._buf_target_length = -1
    socket._listen_for_mesg = (data) ->
        socket._buf = if socket._buf == null then data else Buffer.concat([socket._buf, data])
        loop
            if socket._buf_target_length == -1
                # starting to read a new message
                if socket._buf.length >= 4
                    socket._buf_target_length = socket._buf.readUInt32BE(0) + 4
                else
                    return # have to wait for more data to find out message length
            if socket._buf_target_length <= socket._buf.length
                # read a new message from our buffer
                type = socket._buf.slice(4, 5).toString()
                mesg = socket._buf.slice(5, socket._buf_target_length)
                switch type
                    when 'j'   # JSON
                        s = mesg.toString()
                        socket.emit('mesg', 'json', JSON.parse(s))
                    when 'b'   # BLOB (tagged by a uuid)
                        socket.emit('mesg', 'blob', {uuid:mesg.slice(0,36).toString(), blob:mesg.slice(36)})
                    else
                        throw("unknown message type '#{type}'")
                socket._buf = socket._buf.slice(socket._buf_target_length)
                socket._buf_target_length = -1
                if socket._buf.length == 0
                    return
            else # nothing to do but wait for more data
                return

    socket.on('data', socket._listen_for_mesg)

    socket.write_mesg = (type, data) ->
        send = (s) ->
            buf = new Buffer(4)
            buf.writeInt32BE(s.length, 0)
            socket.write(buf)
            socket.write(s)
        switch type
            when 'json'
                send('j' + JSON.stringify(data))
            when 'blob'
                send(Buffer.concat([new Buffer('b'), new Buffer(data.uuid), new Buffer(data.blob)]))
            else
                throw("unknown message type '#{type}'")

# Stop watching data stream for messages and delete the write_mesg function.
exports.disable_mesg = (socket) ->
    if self._listen_for_mesg?
        socket.removeListener('data', self._listen_for_mesg)
        delete self._listen_for_mesg

# TODO: remove
exports.read_until_null = () ->


