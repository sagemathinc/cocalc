

class exports.Connection
    constructor: (opts) ->
        #    @sessions = {}
        opts.set_onmessage(@onmessage)
        opts.set_onerror(@onerror)
        @_send = opts.send
        
    send: (mesg) => @_send(JSON.stringify(mesg))

    onmessage: (data) -> console.log("message: #{data}")

    onerror: (data) -> console.log("ERROR: #{data}")
        
        