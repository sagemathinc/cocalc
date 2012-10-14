$ ->
    execute_code = ->
        $("#output").val ""
        $("#time").html ""
        $("#run_status").html "running"
        backend.execute $("#input").val(), (mesg) ->
            o = $("#output")
            o.val o.val() + mesg.output.stdout
            o.val o.val() + "\n!!!!!!!!!!!!!!\n" + mesg.output.stderr + "\n!!!!!!!!!!!!!\n"    if mesg.output.stderr
            $("#run_status").html (if mesg.output.done then "" else "running...")

    $("#execute").click (e) ->
        execute_code()

    $("#connection_status").html "connecting..."
    
    backend = salvus.Backend(
        onopen: (protocol) ->
            $("#connection_status").html "connected (" + protocol + ")"
        onclose: ->
            $("#connection_status").html "reconnecting..."
    )
    

