############################################
# connection to Salvus hub
############################################

if window.location.hash.length > 1
    window.salvus_target = decodeURIComponent(window.location.hash.slice(1))

if not window.salvus_base_url?
    window.salvus_base_url = ""

exports.salvus_client = salvus_client = require("client_browser").connect("#{window.location.protocol}//#{window.location.host}#{window.salvus_base_url}")

connection_protocol = ''
exports.protocol = () ->
    if connection_protocol
        return connection_protocol
    else
        return "not connected"

last_ping_time = ''
exports.ping_time = () -> last_ping_time

salvus_client.on "connecting", () ->
    $("#connection_status").html("<font color='#a00'>connecting...</font>")
    $("#connection_protocol").html('')
    $("#connection_bars").hide()
    $("#ping_time").html('')
    connection_protocol = ''
    last_ping_time = ''

salvus_client.on "connected", (protocol) ->
    connection_protocol = protocol
    $("#connection_status").html("")
    $("#connection_protocol").html(protocol.slice(0,9))   # more than 9 characters takes too much space.
    $("#connection_bars").show()

salvus_client.on "ping", (ping_time) ->
    last_ping_time = ping_time
    $("#ping_time").html("#{(ping_time*1000).toFixed(0)}ms")
