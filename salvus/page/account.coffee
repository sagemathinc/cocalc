(() ->

    ################################################
    # Page Switching Control
    ################################################

    focus =
        'well-sign_in':'sign_in-email'
        'well-create_account':'create_account-first-name'
        'well-forget_password':'forget_password-email'

    show_page = (p) ->
        for page, elt of focus
            if page == p
                $("##{page}").show()
                $("##{elt}").focus()
            else
                $("##{page}").hide()


    show_page("well-sign_in")
    
    $("a[href='#well-create_account']").click (event) ->
        show_page("well-create_account")
        return false
        
    $("a[href='#well-sign_in']").click (event) ->
        destroy_create_account_tooltips()
        show_page("well-sign_in");
        return false
        
    $("a[href='#well-forget_password']").click (event) ->
        destroy_create_account_tooltips()
        show_page("well-forget_password")
        return false


    ################################################
    # Account creation
    ################################################

    create_account_fields = ['first_name', 'last_name', 'email_address', 'password', 'agreed_to_terms']

    destroy_create_account_tooltips = () ->
        for field in create_account_fields
            $("#create_account-#{field}").popover "destroy"

    call_when_hiding_page('sign_in', destroy_create_account_tooltips)
    
    $("#create_account-button").click((event) ->
        destroy_create_account_tooltips()

        opts = {}
        for field in create_account_fields
            opts[field] = $("#create_account-#{field}").val()
            opts['agreed_to_terms'] = $("#create_account-agreed_to_terms").is(":checked") # special case
            opts.cb = (error, mesg) ->
                if error
                    alert_message(type:"error", message: "There was an error trying to create a new account ('#{error}').")
                    return
                switch mesg.event
                    when "account_creation_failed"
                        for key, val of mesg.reason
                            $("#create_account-#{key}").popover(
                                title:val
                                trigger:"manual"
                                placement:"left"
                                template: '<div class="popover popover-create-account"><div class="arrow"></div><div class="popover-inner"><h3 class="popover-title"></h3></div></div>'  # using template -- see https://github.com/twitter/bootstrap/pull/2332
                            ).popover("show")
                    when "signed_in"
                        alert_message(type:"success", message: "Account created!  You are now signed in as #{mesg.first_name} #{mesg.last_name}.")
                        sign_in(mesg)
                    else
                        # should never ever happen
                        alert_message(type:"error", message: "The server responded with invalid message to account creation request: #{JSON.stringify(mesg)}")

        salvus.conn.create_account(opts)
    )


    ################################################
    # Sign in
    ################################################


    $("#sign_in-button").click((event) ->
        salvus.conn.sign_in
            email_address : $("#sign_in-email").val()
            password      : $("#sign_in-password").val()
            remember_me   : $("#sign_in-remember_me").is(":checked")
            timeout       : 3
            cb            : (error, mesg) ->
                console.log(JSON.stringify(mesg))
                if error
                    alert_message(type:"error", message: "There was an error during sign in ('#{error}').")
                    return
                switch mesg.event
                    when 'sign_in_failed'
                        alert_message(type:"error", message: mesg.reason)
                    when 'signed_in'
                        sign_in(mesg)
                    when 'error'
                        alert_message(type:"error", message: mesg.reason)                        
                    else
                        # should never ever happen
                        alert_message(type:"error", message: "The server responded with invalid message when signing in: #{JSON.stringify(mesg)}")
    )
        


    
    sign_in = (mesg) ->
        alert_message(type:"info", message:"Signed in as #{mesg.first_name} #{mesg.last_name}.")
        show_page("demo1")
    

)()