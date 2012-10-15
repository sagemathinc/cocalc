$ ->
    ############################################
    # Login/logout management
    ############################################
    #$("#facebook").button().click ->
    #    window.location = "/tornado/auth/facebook"

    sign_out = ->
        $.getJSON("/tornado/auth/logout", ->
            $("#username").hide()
            $("#sign_out").hide()
            $("#sign_in").show()
        )

    sign_in = (username) ->
        $("#sign_in").hide()
        $("#username").show().html(username)
        $("#sign_out").show()

    $("#sign_in").button().click ->
        window.location = "/tornado/auth/google"
    $("#sign_out").button().hide().click(sign_out)

    ############################################
    # Execute the code that is in the #input box
    ############################################
    execute_code = ->
        $("#output").val("")
        $("#time").html("")
        $("#run_status").html("running...")
        salvus.execute($("#input").val(), (mesg) ->
            o = $("#output")
            o.val(o.val() + mesg.output.stdout)
            if mesg.output.stderr
                o.val(o.val() + "\n!!!!!!!!!!!!!!\n#{mesg.output.stderr}\n!!!!!!!!!!!!!\n") 
            $("#run_status").html(if mesg.output.done then "" else "running..."))

    # execute when clicking the button
    $("#execute").button().click (e) -> execute_code()
    
    # execute when pressing "shift-enter"
    $("body").keydown (e) ->
        if e.which is 13 and e.shiftKey
            execute_code()
            false
            
    ############################################
    # connect to the dynamic Salvus server
    ############################################
    $("#connection_status").html("connecting...")
    salvus = new Salvus(
        on_login: (name) -> sign_in(name)
        onopen: (protocol) -> $("#connection_status").html("connected (#{protocol})")
        onclose: -> $("#connection_status").html("reconnecting...")
    )

