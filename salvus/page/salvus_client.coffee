############################################
# connection to Salvus hub
############################################

exports.salvus_client = salvus_client = require("client_browser").connect("#{window.location.protocol}//#{window.location.host}")

salvus_client.on "connecting", () ->
    $("#connection_status").html("<font color='#a00'>connecting...</font>")
    $("#connection_protocol").html('')
    $("#connection_bars").hide()
    $("#ping_time").html('')

salvus_client.on "connected", (protocol) ->
    $("#connection_status").html("")
    $("#connection_protocol").html(protocol)
    $("#connection_bars").show()

salvus_client.on "ping", (ping_time) ->
    $("#ping_time").html("#{(ping_time*1000).toFixed(0)}ms ping")
