###
# This module defines the Salvus class, which is exported in the global namespace
# when it is included.
#
# AUTHOR: William Stein
# COPYRIGHT: University of Washington, 2012.
# 
# LICENSE: No open source license.
###

client_browser = require("client_browser")

log = (s) ->
    try  # we use try because this is not cross platform.
        #console.log(s)    

mswalltime = require("misc").mswalltime

class (exports ? this).Salvus
    constructor: (options) -> 
        @opts = $.extend(
            onopen: (protocol) ->
                log("open -- " + protocol)
            onclose: ->
                log("onclose")
            on_login: (name) ->
                log("logged in as " + name)
            url: "#{window.location.protocol}//#{window.location.host}"
        , options or {})

        @time = null
        @conn = null
        @retry_delay = 1
        @connect()  # start attemping to connect

    execute_code: (input, cb) =>
        @conn.execute_code(input, cb)
        @time = mswalltime()
        
    on_output: (mesg) =>
        log(mesg)
        $("#time").html("#{mswalltime() - @time} ms")  # TODO: ugly / dangerous?

    connect: () =>
        @conn = client_browser.connect(@opts.url, @opts.onopen)
        
        @conn.on("close", () =>
            @opts.onclose()
            @retry_delay *= 2 if @retry_delay < 2048
            log("Trying to reconnect in #{@retry_delay} milliseconds")
            setTimeout(@connect, @retry_delay)
        )
            
        @conn.on('open', () =>
            @opts.onopen(@conn.protocol)
            @retry_delay = 1
        )

        @conn.on("output", @on_output)

