salvus = {} # namespace for application
salvus.log = (s) ->
    err = undefined
    try
        console.log s # TODO: not cross platform!


#alert(s);
salvus.walltime = ->
    (new Date()).getTime()

salvus.Backend = (options) ->
    
    # message types (see mesg.proto)
    
    #EXECUTE_CODE = 1; START_SESSION = 2; TERMINATE_SESSION = 3;
    #        SESSION_DESCRIPTION = 4; SEND_SIGNAL = 5;    OUTPUT = 6; 
    
    # Merge in default options 
    
    # Execution of code 
    execute = (input, callback) ->
        output_callbacks[id] = callback
        time = salvus.walltime()
        mesg =
            type: types.EXECUTE_CODE
            id: id
            execute_code:
                code: input

        send mesg
        id += 1
    onmessage = (e) ->
        mesg = JSON.parse(e.data)
        salvus.log mesg
        
        #$("#time").html((salvus.walltime() - time)/1000.0 + " s");
        if mesg.type is types.OUTPUT
            output_callbacks[mesg.id] mesg
            delete output_callbacks[mesg.id]    if mesg.done
        # TODO -- make it protobuf 
        opts.on_login mesg.name    if mesg.type is "logged_in"
    
    # Connection to tornado 
    connect = ->
        conn = new SockJS(opts.url)
        conn.onclose = ->
            opts.onclose()
            retry_delay *= 2    if retry_delay < 2048
            salvus.log "Trying to reconnect in " + retry_delay + " milliseconds"
            setTimeout connect, retry_delay

        conn.onopen = ->
            salvus.log "connected."
            opts.onopen conn.protocol
            retry_delay = 1

        conn.onmessage = onmessage
    send = (obj) ->
        conn.send JSON.stringify(obj)
    types = undefined
    $.getJSON "/tornado/message/types", (data) ->
        types = data

    opts = $.extend(
        onopen: (protocol) ->
            salvus.log "open -- " + protocol

        onclose: ->
            salvus.log "onclose"

        on_login: (name) ->
            salvus.log "logged in as " + name

        url: window.location.protocol + "//" + window.location.host + "/tornado"
    , options or {})
    id = 0
    output_callbacks = {}
    time = undefined
    conn = undefined
    retry_delay = 1
    connect()
    
    # The actual connection object 
    conn: conn
    send: send
    execute: execute
    connect: connect

@salvus = salvus