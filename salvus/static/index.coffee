$ ->

    # Make it so clicking on the link with given id-item makes the
    # element with given id visible, and all others invisible.  Also,
    # the clicked link gets the active class, and all others become
    # inactive.
    connect_links_and_pages = (page_ids, default_page=null) ->
        show_page = (id) ->
            for p in page_ids
                if p == id
                    $(p).show()
                    $(p+"-item").addClass("active")
                else
                    $(p).hide()
                    $(p+"-item").removeClass("active")
        for p in page_ids
            $("a[href='"+p+"']").click((e) -> show_page(e.target.hash); return false)
        if default_page?
            show_page(default_page)
        else
            show_page(page_ids[0])
        
    connect_links_and_pages(["#about", "#demo1", "#demo2", "#demo3"], "#demo2")

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

    