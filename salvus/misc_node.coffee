
# Read from the stream until we hit a null 0. At that point we
# return the Buffer before the null, and anything extra after the null
# that we accidentally got.
exports.read_until_null = (socket, cb) ->   # cb(result, extra_data)
    buf = new Buffer('')
    f = (data) ->
        console.log("got #{data}; #{data.toString().length}; #{data.length}")
        for i in [0...data.length]
            if data[2*i] == 0 and data[2*i+1] == 0
                socket.removeListener(f)
                cb(Buffer.concat([buf, data.slice(0,2*i)]), data.slice(2*i+2))
                return
        buf = Buffer.concat([buf, data])
    socket.on 'data', f


