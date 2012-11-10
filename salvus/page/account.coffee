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
    # Activate buttons
    ################################################
    $("#account-settings-change-settings-button").click (event) ->
        account_settings.load_from_view()
        account_settings.save_to_server(
            cb : (error, mesg) ->
                console.log(error, mesg)
                if error
                    alert_message(type:"error", message:error)
                else
                    account_settings.set_view()
                    alert_message(type:"info", message:"Your settings have been saved by the server.")
        )

    $("#account-settings-cancel-changes-button").click (event) ->
        account_settings.set_view()

                

    ################################################
    # Tooltips
    ################################################

    enable_tooltips = () ->
        $("[rel=tooltip]").tooltip
            delay: {show: 1000, hide: 100}
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
            timeout       : 3
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
        controller.switch_to_page("demo1")
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
                        console.log("value = #{value}")
                        if value
                            console.log("enabling")
                            enable_tooltips()
                        else
                            console.log("disabling")
                            disable_tooltips()
                    when 'email_maintenance', 'email_new_features'
                        element.attr('checked', value)
                    when 'evaluate_key', 'default_system'  # select
                        element.val(value)
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
        
)()