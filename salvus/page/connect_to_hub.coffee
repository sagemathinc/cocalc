############################################
# connection to Salvus hub
############################################

salvus_client = require("client_browser").connect("#{window.location.protocol}//#{window.location.host}")

(() ->

    salvus_client.on "connecting", () ->
        $("#connection_status").html("<font color='#a00'>connecting...</font>")
        $("#connection_protocol").html('')
        $("#ping_time").html('')

    salvus_client.on "connected", (protocol) ->
        $("#connection_status").html("")
        $("#connection_protocol").html(protocol)

    salvus_client.on "ping", (ping_time) ->
        $("#ping_time").html(", last ping=#{(ping_time*1000).toFixed(0)}ms")

)()