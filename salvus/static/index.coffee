$ ->
    execute_code = ->
        $("#output").val ""
        $("#time").html ""
        $("#run_status").html "running..."
        salvus.execute $("#input").val(), (mesg) ->
            o = $("#output")
            o.val(o.val() + mesg.output.stdout)
            if mesg.output.stderr
                o.val(o.val() + "\n!!!!!!!!!!!!!!\n" + mesg.output.stderr + "\n!!!!!!!!!!!!!\n") 
            $("#run_status").html (if mesg.output.done then "" else "running...")

    $("#execute").click (e) ->
        execute_code()

    $("body").keydown (e) ->
        if e.which is 13 and e.shiftKey
            execute_code()
            false

    $("#execute").button()

    $("#google").button().click ->
        window.location = "/tornado/auth/google"

    $("#facebook").button().click ->
        window.location = "/tornado/auth/facebook"

    # TODO -- actually delete cookie or something!!!!    very important,
    # since this is unsafe as is.
    $("#sign_out").button().click ->
        $("#username").hide()
        $("#sign_out").hide()
        $("#sign_in").show()

    salvus = new Salvus(
        on_login: (name) ->
            $("#username").show().html name
            $("#sign_in").hide()
            $("#sign_out").show()

        onopen: (protocol) ->
            $("#connection_status").html "connected (" + protocol + ")"

        onclose: ->
            $("#connection_status").html "reconnecting..."
    )
    salvus.connect()

    $("#connection_status").html "connecting..."

    $("#sign_in").show()
    $("#sign_out").hide()
    $("#username").hide()

