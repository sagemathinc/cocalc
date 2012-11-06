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
    $("a[href='#well-create_account']").click((event) ->
        show_page("well-create_account"))
    $("a[href='#well-sign_in']").click((event) ->
        show_page("well-sign_in"))
    $("a[href='#well-forget_password']").click((event) ->
        show_page("well-forget_password"))


    ################################################
    # Account creation
    ################################################

    
    $("#create_account-button").click((event) ->
        salvus.conn.create_account
            first_name      : $("#create_account-first_name").val()
            last_name       : $("#create_account-last_name").val()
            email_address   : $("#create_account-email_address").val()
            password        : $("#create_account-password").val()
            agreed_to_terms : $("#create_account-agreed_to_terms").is(":checked")
            timeout         : 3 # seconds
            cb              : (error, results) ->
                if error
                    # todo
                    return

                if results.event == "account_creation_failed"
                    for key, val of results.reason
                        $("#create_account-#{key}").popover(
                            #title:key
                            content:val
                            trigger:"manual"
                            placement:"left"
                        ).popover("show")
                        console.log("#create_account-#{key}", key, val)
    )

)()