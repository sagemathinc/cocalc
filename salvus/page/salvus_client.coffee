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
    $(".salvus-connection-status-connecting").show()
    $(".salvus-fullscreen-activate").hide()
    $(".salvus-connection-status-protocol").html('')
    $(".salvus-connection-status-ping-time").html('')
    connection_protocol = ''
    last_ping_time = ''
    $("a[href=#salvus-connection-reconnect]").find("i").addClass('fa-spin')

salvus_client.on "connected", (protocol) ->
    connection_protocol = protocol
    $(".salvus-connection-status-connecting").hide()
    if not salvus_client.in_fullscreen_mode()
        $(".salvus-fullscreen-activate").show()
    $(".salvus-connection-status-protocol").html(protocol.slice(0,9))   # more than 9 characters takes too much space.
    $("a[href=#salvus-connection-reconnect]").find("i").removeClass('fa-spin')

salvus_client.on "ping", (ping_time) ->
    last_ping_time = ping_time
    $(".salvus-connection-status-ping-time").html("#{(ping_time*1000).toFixed(0)}ms")
