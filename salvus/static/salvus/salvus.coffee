###
This module defines the Salvus class, which is exported in the global namespace
when it is included.

AUTHOR: William Stein
COPYRIGHT: University of Washington, 2012.

LICENSE: No open source license.
###

log = (s) ->
    try  # we use try because this is not cross platform.
        console.log(s)    

walltime = () -> (new Date()).getTime()

# get the types from the server
types = null
$.getJSON("/tornado/message/types", (data) -> types = data; return)

class (exports ? this).Salvus
    constructor: (options) -> 
        @opts = $.extend(
            onopen: (protocol) ->
                log("open -- " + protocol)
            onclose: ->
                log("onclose")
            on_login: (name) ->
                log("logged in as " + name)
            url: "#{window.location.protocol}//#{window.location.host}/tornado"
        , options or {})

        # State involving execution of code
        @id = 0   # id number associated to evaluation of particular block of code
        @output_callbacks = {}  # callback functions to call when evaluating given code
        @time = walltime()

        # Connection to sockjs server
        @conn = null
        @retry_delay = 1

        @connect()  # start attemping to connect (TODO: maybe client should have to explicitly call this?)

    execute: (input, callback) =>
        @output_callbacks[@id] = callback
        @time = walltime()
        mesg =
            type: types.EXECUTE_CODE
            id: @id
            execute_code:
                code: input
        @send(mesg)
        @id += 1
        
    onmessage: (e) =>
        mesg = JSON.parse(e.data)
        log(mesg)
        
        $("#time").html("#{(walltime() - @time)/1000.0} s")
        if mesg.type is types.OUTPUT
            @output_callbacks[mesg.id](mesg)
            delete @output_callbacks[mesg.id] if mesg.done
        else if mesg.type is "logged_in"  # TODO -- types.?
            @opts.on_login(mesg.name)

    connect: () =>
        @conn = new SockJS(@opts.url)
        
        @conn.onclose = () =>
            @opts.onclose()
            @retry_delay *= 2 if @retry_delay < 2048
            log("Trying to reconnect in #{@retry_delay} milliseconds")
            setTimeout(@connect, @retry_delay)
            
        @conn.onopen = () =>
            @opts.onopen(@conn.protocol)
            @retry_delay = 1

        @conn.onmessage = @onmessage

    send: (obj) =>
        @conn.send(JSON.stringify(obj))
