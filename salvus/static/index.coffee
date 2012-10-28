$ ->
    $("#about").hide()  
    $("a[href='#about']").click((e) ->
        $("#demo1-item").removeClass("active")
        $("#about-item").addClass("active")
        $("#demo1").hide()
        $("#about").show()
        return false
    )
    $("a[href='#demo1']").click((e) ->
        $("#demo1-item").addClass("active")
        $("#about-item").removeClass("active")
        $("#demo1").show()
        $("#about").hide()
        return false
    )
    
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
        conn.execute_code($("#input").val(), (mesg) ->
            o = $("#output")
            o.val(o.val() + mesg.stdout)
            if mesg.stderr
                o.val(o.val() + "\n!!!!!!!!!!!!!!\n#{mesg.stderr}\n!!!!!!!!!!!!!\n") 
            $("#run_status").html(if mesg.done then "" else "running..."))

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

    conn = new Salvus(
        on_login: (name) -> sign_in(name)
        onopen: (protocol) -> $("#connection_status").html("connected (#{protocol})")
        onclose: -> $("#connection_status").html("reconnecting...")
    )

    