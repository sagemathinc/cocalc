(() ->
    defaults = require("misc").defaults
    required = defaults.required
    
    ################################################
    # id of account client browser thinks it is signed in as
    ################################################
    account_id = null

    ################################################
    # Page Switching Control
    ################################################

    focus =
        'account-sign_in'         : 'sign_in-email'
        'account-create_account'  : 'create_account-first-name'
        'account-forget_password' : 'forget_password-email'
        'account-settings'        : ''

    show_page = (p) ->
        for page, elt of focus
            if page == p
                $("##{page}").show()
                $("##{elt}").focus()
            else
                $("##{page}").hide()


    show_page("account-sign_in")
    #show_page("account-settings")
    
    $("a[href='#account-create_account']").click (event) ->
        show_page("account-create_account")
        return false
        
    $("a[href='#account-sign_in']").click (event) ->
        destroy_create_account_tooltips()
        show_page("account-sign_in");
        return false
        
    $("a[href='#account-forget_password']").click (event) ->
        destroy_create_account_tooltips()
        show_page("account-forget_password")
        return false


    ################################################
    # Account creation
    ################################################

    create_account_fields = ['first_name', 'last_name', 'email_address', 'password', 'agreed_to_terms']

    destroy_create_account_tooltips = () ->
        for field in create_account_fields
            $("#create_account-#{field}").popover "destroy"

    controller.on("hide_page_account", destroy_create_account_tooltips)
    
    $("#create_account-button").click((event) ->
        destroy_create_account_tooltips()

        opts = {}
        for field in create_account_fields
            opts[field] = $("#create_account-#{field}").val()
            opts['agreed_to_terms'] = $("#create_account-agreed_to_terms").is(":checked") # special case
            opts.cb = (error, mesg) ->
                if error
                    alert_message(type:"error", message: "There was an unexpected error trying to create a new account.  Please try again later.")
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
                if error
                    alert_message(type:"error", message: "There was an unexpected error during sign in.  Please try again later.")
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
        # record account_id in a variable global to this file, and pre-load and configure the "account settings" page
        account_id = mesg.account_id
        account_settings.load_from_server((error) ->
            if not error
                account_settings.set_view()
        )
        
        # change the view in the account page to the settings/sign out view
        show_page("account-settings")
        # change the navbar title from "Sign in" to "first_name last_name"
        $("#account-item").find("a").html("#{mesg.first_name} #{mesg.last_name} (<a href='#sign_out'>Sign out</a>)")
        $("a[href='#sign_out']").click (event) ->
            sign_out()
            return false
        controller.switch_to_page("demo1")
        controller.show_page_nav(x) for x in ["feedback", "demo1", "demo2"]

    ################################################
    # Sign out
    ################################################
    sign_out = () ->
        # change the view in the account page to the "sign in" view
        # change the navbar title from "Sign in" to "first_name last_name"
        (controller.hide_page_nav(x) for x in ["feedback", "demo1", "demo2"])
        $("#account-item").find("a").html("Sign in")
        show_page("account-sign_in")
        controller.switch_to_page("account")


    ################################################
    # Account settings
    ################################################
    class AccountSettings
        load_from_server: (cb) ->
            salvus.conn.get_account_settings(account_id, cb:(error, settings_mesg) =>
                if error
                    alert_message(type:"error", message:error)
                    @settings = 'error'
                    cb(error)
                    return

                if settings_mesg.event != "account_settings"
                    alert_message(type:"error", "Received an invalid message back from the server when requesting account settings.  mesg=#{JSON.stringify(settings_mesg)}")
                    cb("invalid message")
                    return
        
                @settings = settings_mesg
                delete @settings['id']
                delete @settings['event']
                
                cb()
            )


        load_from_view: () ->
            for prop of @settings
                val = $("#account-settings-#{prop}").val()
                if prop.slice(0,8) == "connect_"
                    val = (val == "unlink")
                @settings[prop] = val
                
        set_view: () ->
            if not @settings?
                return  # not logged in -- don't bother
                
            if @settings == 'error'
                $("#account-settings-error").show()
                return
                
            for prop of @settings
                $("#account-settings-error").hide()
                value = @settings[prop]
                element = $("#account-settings-#{prop}")
                if prop.slice(0,8) == "connect_"
                    element.val(if value then "unlink" else "Connect to #{prop.slice(8)}")
                else
                    element.val(value)

        # Store the properties that user can freely change to the backend database.
        # The other properties only get saved by direct api calls that require additional
        # information, e.g., password.   The setting in this object are saved; if you
        # want to save the settings in view, you must first call load_from_view.
        save_to_server: (opts) ->
            opts = defaults opts,
                cb       : required
                password : undefined  # must be set, or all restricted settings are ignored by the server
                
            if not @settings? or @settings == 'error'
                cb("There are no account settings to save.")
                return
                
            salvus.conn.save_account_settings
                account_id : account_id
                settings   : @settings
                password   : opts.password
                cb         : opts.cb

    account_settings = new AccountSettings()
        
)()