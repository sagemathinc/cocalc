############################################
# connection to Salvus hub
############################################
$("#connection_status").html("connecting...")

persistent_session = null

salvus = new Salvus(
    on_login: (name) -> sign_in(name)
    on_connected: (protocol) ->
        $("#connection_status").html("")
        $("#connection_protocol").html(protocol)
        persistent_session = salvus.conn.new_session()
    on_connecting: ->
        $("#connection_status").html("<font color='#a00'>connecting...</font>")
        $("#connection_protocol").html('')
        $("#ping_time").html('')
    on_ping: (ping_time) ->
        $("#ping_time").html(", last ping=#{(ping_time*1000).toFixed(0)}ms")
)
