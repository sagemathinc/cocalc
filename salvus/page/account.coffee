(() ->

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

    $("a[href='#well-sign_in']").click (event) ->
        show_page("well-sign_in")

    $("a[href='#well-forget_password']").click (event) ->
        show_page("well-forget_password")

)()