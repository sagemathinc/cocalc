(() ->
    misc = require("misc")
    to_json = misc.to_json
    defaults = misc.defaults
    required = defaults.required



    set_account_tab_label = (signed_in, first_name, last_name) ->
        # TODO: this is UGLY
        if signed_in 
            $("#account-item").find("a").html("#{first_name} #{last_name} (<a href='#sign_out'>Sign out</a>)")
            $("a[href='#sign_out']").click((event) ->
                sign_out()
                return false
            )
        else
            $("#account-item").find("a").html("Sign in")
    
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
        'account-settings'        : ''

    current_account_page = null
    show_page = (p) ->
        current_account_page = p
        for page, elt of focus
            if page == p
                $("##{page}").show()
                $("##{elt}").focus()
            else
                $("##{page}").hide()


    show_page("account-sign_in")
    #show_page("account-settings")

    controller.on("show_page_account", (() -> $("##{focus[current_account_page]}").focus()))
    
    $("a[href='#account-create_account']").click (event) ->
        show_page("account-create_account")
        return false
        
    $("a[href='#account-sign_in']").click (event) ->
        destroy_create_account_tooltips()
        show_page("account-sign_in");
        return false
        
    ################################################
    # Activate buttons
    ################################################
    $("#account-settings-change-settings-button").click (event) ->
        console.log("change-settings-button...")
        account_settings.load_from_view()
        account_settings.save_to_server(
            cb : (error, mesg) ->
                console.log(error,mesg)
                if error
                    alert_message(type:"error", message:error)
                else
                    account_settings.set_view()
                    alert_message(type:"info", message:"You have saved your settings.")
        )

    $("#account-settings-cancel-changes-button").click (event) ->
        account_settings.set_view()

                

    ################################################
    # Tooltips
    ################################################

    enable_tooltips = () ->
        $("[rel=tooltip]").tooltip
            delay: {show: 1500, hide: 100}
            placement: 'right'

    disable_tooltips = () ->
        $("[rel=tooltip]").tooltip("destroy")

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
            timeout       : 10
            cb            : (error, mesg) ->
                if error
                    alert_message(type:"error", message: "There was an unexpected error during sign in.  Please try again later. #{error}")
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
        set_account_tab_label(true, mesg.first_name, mesg.last_name)
        controller.switch_to_page("account")
        controller.show_page_nav(x) for x in ["feedback", "demo1", "demo2"]

    ################################################
    # Sign out
    ################################################
    sign_out = () ->
        set_account_tab_label(false)
        # change the view in the account page to the "sign in" view
        # change the navbar title from "Sign in" to "first_name last_name"
        (controller.hide_page_nav(x) for x in ["feedback", "demo1", "demo2"])
        show_page("account-sign_in")
        controller.switch_to_page("account")


    ################################################
    # Account settings
    ################################################

    class AccountSettings
        load_from_server: (cb) ->
            salvus.conn.get_account_settings(account_id:account_id, cb:(error, settings_mesg) =>
                if error
                    alert_message(type:"error", message:"Error loading account settings - #{error}")
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
            if not @settings? or @settings == "error"
                return  # not logged in -- don't bother
                
            for prop of @settings
                element = $("#account-settings-#{prop}")
                switch prop
                    when 'email_maintenance', 'email_new_features', 'enable_tooltips'
                        val = element.is(":checked")
                    when 'connect_Github', 'connect_Google', 'connect_Dropbox'
                        val = (element.val() == "unlink")
                    else
                        val = element.val()
                @settings[prop] = val
                
        set_view: () ->
            if not @settings?
                return  # not logged in -- don't bother
                
            if @settings == 'error'
                $("#account-settings-error").show()
                return

            set = (element, value) ->
                # TODO: dumb and dangerous -- do better
                element.val(value)
                element.html(value)
            
            
            $("#account-settings-error").hide()

            for prop, value of @settings
                element = $("#account-settings-#{prop}")
                switch prop
                    when 'enable_tooltips'
                        element.attr('checked', value)
                        if value
                            enable_tooltips()
                        else
                            disable_tooltips()
                    when 'email_maintenance', 'email_new_features'
                        element.attr('checked', value)
                    when 'evaluate_key'
                        element.val(value)
                        execute_router.set_evaluate_key(value)
                    when 'default_system'
                        element.val(value)
                        $("#demo1-system").val(value)
                        $("#demo2-system").val(value)
                    when 'connect_Github', 'connect_Google', 'connect_Dropbox'
                        set(element, if value then "unlink" else "Connect to #{prop.slice(8)}")
                    else
                        set(element, value)

            set_account_tab_label(true, @settings.first_name, @settings.last_name)

        # Store the properties that user can freely change to the backend database.
        # The other properties only get saved by direct api calls that require additional
        # information, e.g., password.   The setting in this object are saved; if you
        # want to save the settings in view, you must first call load_from_view.
        save_to_server: (opts) ->
            opts = defaults opts,
                cb       : required
                password : undefined  # must be set, or all restricted settings are ignored by the server

            if not @settings? or @settings == 'error'
                opts.cb("There are no account settings to save.")
                return
            salvus.conn.save_account_settings
                account_id : account_id
                settings   : @settings
                password   : opts.password
                cb         : opts.cb

    account_settings = new AccountSettings()
        
    ################################################
    # Change Email Address
    ################################################

    change_email_address = $("#account-change_email_address")
    
    close_change_email_address = () ->
        change_email_address.modal('hide').find('input').val('')
        change_email_address.find(".account-error-text").hide()
        
    # When click in the cancel button on the change email address
    # dialog, it is important to hide an error messages; also clear
    # password.
    change_email_address.find(".close").click((event) -> close_change_email_address())
    $("#account-change_email_address_cancel_button").click((event)->close_change_email_address())

    change_email_address.on("shown", () -> $("#account-change_email_new_address").focus())

    # User clicked button to change the email address, so try to
    # change it.
    $("#account-change_email_address_button").click (event) ->
        new_email_address = $("#account-change_email_new_address").val()
        password = $("#account-change_email_password").val()
            
        salvus.conn.change_email
            old_email_address : account_settings.settings.email_address
            new_email_address : new_email_address
            password          : password
            account_id        : account_settings.settings.account_id
            cb                : (error, mesg) ->
                $("#account-change_email_address").find(".account-error-text").hide()
                if error  # exceptional condition -- some sort of server or connection error
                    alert_message(type:"error", message:error)
                    close_change_email_address() # kill modal (since this is a weird error condition)
                    return
                if mesg.error
                    x = $("#account-change_email_address-#{mesg.error}")
                    if x.length == 0
                        # this should not happen
                        alert_message(type:"error", message:"Email change error: #{mesg.error}")
                        close_change_email_address()
                    else
                        x.show()
                        if mesg.error == 'too_frequent' and mesg.ttl
                            x.find("span").html(" #{mesg.ttl } seconds ")
                            setTimeout((() -> x.hide()), mesg.ttl*1000)
                        $("#account-change_email_password").val(password)
                else
                    # success
                    $("#account-settings-email_address").html(new_email_address)
                    account_settings.settings.email_address = new_email_address
                    close_change_email_address()
        return false
        
    ################################################
    # Change password
    ################################################

    change_password = $("#account-change_password")

    close_change_password = () ->
        change_password.modal('hide').find('input').val('')
        change_password.find(".account-error-text").hide()

    change_password.find(".close").click((event) -> close_change_password())
    $("#account-change_password-button-cancel").click((event)->close_change_password())
    change_password.on("shown", () -> $("#account-change_password-old_password").focus())

    $("#account-change_password-button-submit").click (event) ->
        salvus.conn.change_password
            email_address : account_settings.settings.email_address
            old_password  : $("#account-change_password-old_password").val()
            new_password  : $("#account-change_password-new_password").val()
            cb : (error, mesg) ->
                if error
                    $("#account-change_password-error").html("Error communicating with server: #{error}")
                else
                    change_password.find(".account-error-text").hide()
                    if mesg.error
                        # display errors
                        for key, val of mesg.error
                            x = $("#account-change_password-error-#{key}")
                            if x.length == 0
                                x = $("#account-change_password-error")
                            x.html(val)
                            x.show()
                    else
                        # success
                        alert_message(type:"info", message:"You have changed your password.")
                        close_change_password()
        return false

    ################################################
    # Forgot your password?
    ################################################
    
    forgot_password = $("#account-forgot_password")

    close_forgot_password = () ->
        forgot_password.modal('hide').find('input').val('')
        forgot_password.find(".account-error-text").hide()

    forgot_password.find(".close").click((event) -> close_forgot_password())
    $("#account-forgot_password-button-cancel").click((event)->close_forgot_password())
    forgot_password.on("shown", () -> $("#account-forgot_password-email_address").focus())

    $("#account-forgot_password-button-submit").click (event) ->
        email_address = $("#account-forgot_password-email_address").val()
        forgot_password.find(".account-error-text").hide()
        salvus.conn.forgot_password
            email_address : email_address
            cb : (error, mesg) ->
                if error
                    $("#account-forgot_password-error").html("Error communicating with server: #{error}").show()
                else
                    if mesg.error
                        $("#account-forgot_password-error").html(mesg.error).show()
                    else
                        # success
                        alert_message(type:"info", message:"Salvus has sent a password reset email message to #{email_address}")
                        close_forgot_password()
        return false
    

    #################################################################
    # Page you get when you click "Forgot your password" email link and main page loads
    #################################################################
    forgot_password_reset = $("#account-forgot_password_reset")
    url_args = window.location.href.split("#")
    if url_args.length == 3 and url_args[1] == "forgot"
        forget_password_reset_key = url_args[2]
        forgot_password_reset.modal("show")

    
    

)()