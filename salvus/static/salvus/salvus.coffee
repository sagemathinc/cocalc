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
            on_connected: () -> 
            on_connecting: () ->
            on_login: (name) -> log("logged in as " + name)
            url: "#{window.location.protocol}//#{window.location.host}"
        , options or {})

        @time = null
        @conn = null
        @retry_delay = 1
        @connect()  # start attemping to connect

    execute_code: (input, cb) =>
        @conn.execute_code(input, cb)
        
    connect: () =>
        @conn = client_browser.connect(@opts.url)

        @conn.on("ping", @opts.on_ping) if @opts.on_ping
        
        @conn.on("connecting", () =>
            @opts.on_connecting()
        )
            
        @conn.on('connected', (protocol) =>
            @opts.on_connected(protocol)
        )


