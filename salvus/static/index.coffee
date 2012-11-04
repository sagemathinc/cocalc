$ ->

    mswalltime = require("misc").mswalltime

    # Make it so clicking on the link with given id-item makes the
    # element with given id visible, and all others invisible.  Also,
    # the clicked link gets the active class, and all others become
    # inactive.

    active_page = null
    connect_links_and_pages = (page_ids, default_page=null) ->
        show_page = (id) ->
            active_page = id
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
        
    connect_links_and_pages(["#about", "#demo1", "#demo2", "#demo3"], "#demo1")

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
    # connect to the dynamic Salvus server
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

    # code execution router        
    execute_code = ->
        switch active_page
            when "#demo1"
                execute_code_demo1()
            when "#demo2"
                execute_code_demo2()
            when "#demo3"
                execute_code_demo3()

    interrupt_exec = ->
                        

    # execute when clicking the button
    $("#execute").button().click(execute_code)
    $("#execute2").button().click(execute_code)
    # execute when pressing "shift-enter"
    $("body").keydown (e) ->
        switch active_page
            when "#demo1"
                if e.which is 13 and e.shiftKey
                    execute_code_demo1()
                    return false
            when "#demo2"
                if e.which is 13 and not e.shiftKey
                    execute_code_demo2()
                    return false
                if e.which is 27
                    interrupt_exec2()
                    return false
            when "#demo3"
                if e.which is 13 and e.shiftKey
                    execute_code_demo3()
                    return false

    ############################################
    # Single Cell: Execute the code that is in the #input box
    ############################################

    execute_code_demo1 = () ->
        $("#output").val("")
        $("#time").html("")
        $("#run_status").html("running...")
        t0 = mswalltime()
        salvus.execute_code(
            code  : $("#input").val()
            cb    : (mesg) ->
                $("#time").html("#{mswalltime() - t0} ms") 
                o = $("#output")
                o.val(o.val() + mesg.stdout)
                if mesg.stderr
                    o.val(o.val() + "\n!!!!!!!!!!!!!!\n#{mesg.stderr}\n!!!!!!!!!!!!!\n") 
                $("#run_status").html(if mesg.done then "" else "running...")
            preparse: true
            allow_cache: $("#script-cache").is(':checked')
        )

    ############################################
    # Command line REPL session
    ############################################
    execute_code_demo2 = () ->
        i = $("#input2")
        o = $("#output2")
        if o.val() == ""
            o.val("\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n")  # hackish
        code = i.val()
        i.val("")
        o.val(o.val() + ">>> #{code}\n")
        o.scrollTop(o[0].scrollHeight)
        persistent_session.execute_code(
            code : code
            cb   :(mesg) ->
                if mesg.stdout?
                    o.val(o.val() + mesg.stdout)
                    o.scrollTop(o[0].scrollHeight)
                if mesg.stderr?
                    o.val(o.val() + "!!!!\n" + mesg.stderr + "!!!!\n")
                    o.scrollTop(o[0].scrollHeight)
            preparse: true
        )

    interrupt_exec2 = () ->
        console.log('interrupt')
        persistent_session.interrupt()

    $("#interrupt2").button().click(interrupt_exec2)

    ############################################
    # Worksheet
    ############################################
    execute_code_demo3 = () ->
        alert('demo3')

