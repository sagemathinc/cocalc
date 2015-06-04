###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014, William Stein
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################


############################################################
# Account Settings
############################################################

async = require('async')


{top_navbar}    = require('top_navbar')
{salvus_client} = require('salvus_client')
{alert_message} = require('alerts')
{IS_MOBILE}     = require("feature")

misc     = require("misc")
message  = require("message")
to_json  = misc.to_json
defaults = misc.defaults
required = defaults.required

set_account_tab_label = (signed_in, label) ->
    if signed_in
        top_navbar.pages['account'].icon = 'fa-cog'
        top_navbar.set_button_label("account", label)
    else
        # nothing
        top_navbar.set_button_label("account", "Sign in", "", false)

################################################
# id of account client browser thinks it is signed in as
################################################
account_id = undefined

top_navbar.on "switch_to_page-account", () ->
    if account_id?
        window.history.pushState("", "", window.salvus_base_url + '/settings')
        account_settings.reload()
    else
        window.history.pushState("", "", window.salvus_base_url)

################################################
# Page Switching Control
################################################

focus =
    'account-sign_in'         : 'sign_in-email'
    'account-create_account'  : 'create_account-name'
    'account-settings'        : ''

current_account_page = null
show_page = exports.show_page  = (p) ->
    if p == "account-create_account"
        $.get "/registration", (obj, status) ->
            if status == 'success'
                if obj.token  # registration token is required, so show the field
                    $(".salvus-create_account-token").show()
    current_account_page = p
    for page, elt of focus
        if page == p
            $("##{page}").show()
            $("##{elt}").focus()
        else
            $("##{page}").hide()

if localStorage.remember_me or window.location.hash.substr(1) == 'login'
    show_page("account-sign_in")
else
    show_page("account-create_account")

top_navbar.on "show_page_account", () ->
    $("##{focus[current_account_page]}").focus()

$("a[href='#account-create_account']").click (event) ->
    show_page("account-create_account")
    return false

$("a[href='#account-sign_in']").click (event) ->
    destroy_create_account_tooltips()
    show_page("account-sign_in")
    return false

################################################
# Activate buttons
################################################

$("#account-settings-tab").find("form").click (event) ->
    return false

$("a[href=#account-settings-tab]").click () =>
    account_settings.reload()

$("a[href=#reload-account-settings]").click () =>
    account_settings.reload()


################################################
# Tooltips
################################################

enable_tooltips = () ->
    if IS_MOBILE
        # never enable on mobile -- they are totally broken
        return
    $("[rel=tooltip]").tooltip
        delay: {show: 1000, hide: 100}
        placement: 'right'

disable_tooltips = () ->
    $("[rel=tooltip]").tooltip("destroy")

################################################
# Account creation
################################################

create_account_fields = ['token', 'name', 'email_address', 'password', 'agreed_to_terms']

destroy_create_account_tooltips = () ->
    for field in create_account_fields
        $("#create_account-#{field}").popover("destroy")

top_navbar.on("switch_from_page-account", destroy_create_account_tooltips)

$("a[href=#link-terms]").click (event) ->
    $("#link-terms").modal('show')
    return false

$("#create_account-button").click (event) ->

    #if $("#create_account-retype_password").val() != $("#create_account-password").val()
    #    bootbox.alert("Passwords don't match.")
    #    return false

    destroy_create_account_tooltips()

    opts = {}
    for field in create_account_fields
        elt = $("#create_account-#{field}")
        if elt[0].type == "checkbox"
            v = elt.is(":checked")
        else
            v = elt.val().trim()
        if field == 'name'
            i = v.lastIndexOf(' ')
            if i == -1
                last_name = ''
                first_name = v
            else
                first_name = v.slice(0,i).trim()
                last_name = v.slice(i).trim()
            opts.first_name = first_name
            opts.last_name  = last_name
        else
            opts[field] = v

    opts.cb = (error, mesg) ->
        if error
            alert_message(type:"error", message: "There may have been an error creating your account (#{error}).  Please try again, and if that doesn't work, email help@sagemath.com.")
            return
        switch mesg.event
            when "account_creation_failed"
                for key, val of mesg.reason
                    if key == "first_name" or key == "last_name"
                        key = "name"
                    $("#create_account-#{key}").popover(
                        title     : val
                        animation : false
                        trigger   : "manual"
                        placement : if $(window).width() <= 800 then "top" else "right"
                        template: '<div class="popover popover-create-account"><div class="arrow"></div><div class="popover-inner"><h3 class="popover-title"></h3></div></div>'  # using template -- see https://github.com/twitter/bootstrap/pull/2332
                    ).popover("show").focus( () -> $(@).popover("destroy"))
            when "signed_in"
                ga('send', 'event', 'account', 'create_account')    # custom google analytic event -- user created an account
                alert_message(type:"success", message: "Account created!  You are now signed in as #{mesg.first_name} #{mesg.last_name}.")
                ## THIS is taken care of by an event handler elsewhere
                # signed_in(mesg)
            else
                # should never ever happen
                alert_message(type:"error", message: "The server responded with invalid message to account creation request: #{JSON.stringify(mesg)}")

    salvus_client.create_account(opts)
    return false


# Enhance HTML element to display feedback about a choice of password
#     input   -- jQuery wrapped <input> element where password is typed
password_strength_meter = (input) ->
    if require("feature").IS_MOBILE
        return
    # TODO: move this html into account.html
    display = $('<div class="progress progress-striped" style="margin-bottom: 3px;"><div class="progress-bar"></div>&nbsp;<font size=-1></font></div>')
    input.after(display)
    score = ['Very weak', 'Weak', 'So-so', 'Good', 'Awesome!']
    input.bind 'change keypress paste focus textInput input', () ->
        if input.val()
            async.series([
                (cb) ->
                    if zxcvbn?
                        cb()
                    else
                        $.getScript("/static/zxcvbn/zxcvbn.js", cb)
                (cb) ->
                    result = zxcvbn(input.val().trim(), ['sagemath','salvus','sage','sagemathcloud','smc','mathematica','pari'])  # explicitly ban some words.
                    display.find(".progress-bar").show().css("width", "#{13*(result.score+1)}%")
                    display.find("font").html(score[result.score])
                    cb()
                ])
    return input

$.fn.extend
    password_strength_meter: (options) ->
        settings = {}
        settings = $.extend settings, options
        return @each () ->
            password_strength_meter($(this))

$('.salvus-password-meter').password_strength_meter()

################################################
# Sign in
################################################

$(".salvus-sign_in-form").submit((event) -> sign_in(); return false)

$("#sign_in-button").click((event) -> sign_in(); return false)

sign_in = () ->
    $("#sign_in-button").icon_spin(start:true)
    $("#sign_in-email").focus()

    salvus_client.sign_in
        email_address : $("#sign_in-email").val().trim()
        password      : $("#sign_in-password").val().trim()
        remember_me   : true
        timeout       : 30
        cb            : (error, mesg) ->
            $("#sign_in-button").icon_spin()
            if error
                alert_message(type:"error", message: "There was an error signing you in (#{error}).  Possibly clear your cloud.sagemath.com cookies, refresh your browser and try again; if that doesn't work, email help@sagemath.com.")
                return
            switch mesg.event
                when 'sign_in_failed'
                    alert_message(type:"error", message: mesg.reason)

                when 'signed_in'
                    # Signed_in gets handled by the signed_in event listener below -- do not do it here also.
                    pass=0
                when 'error'
                    alert_message(type:"error", message: mesg.reason)
                else
                    # should never ever happen
                    alert_message(type:"error", message: "The server responded with invalid message when signing in: #{JSON.stringify(mesg)}")

first_login = true
hub = undefined
signed_in = (mesg) ->
    #console.log("signed_in: ", mesg)

    top_navbar.show_page_button("salvus-help")

    ga('send', 'event', 'account', 'signed_in')    # custom google analytic event -- user signed in
    # Record which hub we're connected to.
    hub = mesg.hub

    top_navbar.show_page_button("projects")
    load_file = window.salvus_target and window.salvus_target != 'login'
    if first_login
        first_login = false
        if not load_file
            require('history').load_target('projects')

    # Record account_id in a variable global to this file, and pre-load and configure the "account settings" page
    account_id = mesg.account_id
    account_settings.load_from_server (error) ->
        if error
            if account_settings.settings?
                # don't show an error if already loaded settings before successefully; error
                # is probably just due to trying to reload settings too frequently.
                return
            alert_message(type:"error", message:error)
        else
            account_settings.emit("loaded")
            if load_file
                require('history').load_target(window.salvus_target)
                window.salvus_target = ''
            account_settings.set_view()
            # change the view in the account page to the settings/sign out view
            show_page("account-settings")
            # change the navbar title from "Sign in" to their name
            set_account_tab_label(true, account_settings.fullname())
            $("#account-forgot_password-email_address").val(account_settings.settings.email_address)

            # If this is the initial login, switch to the project
            # page.  We do this because if the user's connection is
            # flakie, they might get dropped and re-logged-in multiple
            # times, and we definitely don't want to switch to the
            # projects page in that case.  Also, if they explicitly
            # log out, then log back in as another user, seeing
            # the account page by default in that case makes sense.


# Listen for pushed sign_in events from the server.  This is one way that
# the sign_in function above can be activated, but not the only way.
salvus_client.on("signed_in", signed_in)

################################################
# Explicit sign out
################################################
sign_out = (opts={}) ->
    opts = defaults opts,
        everywhere : false

    evt = 'sign_out'
    if opts.everywhere
        evt += '_everywhere'
    ga('send', 'event', 'account', evt)    # custom google analytic event -- user explicitly signed out.

    # Send a message to the server that the user explicitly
    # requested to sign out.  The server must clean up resources
    # and *invalidate* the remember_me cookie for this client.
    salvus_client.sign_out
        everywhere : opts.everywhere
        cb         : (error) ->
            if error
                alert_message(type:"error", message:error)
            else
                # Force a refresh, since otherwise there could be data
                # left in the DOM, which could lead to a vulnerability
                # or blead into the next login somehow.
                window.location.reload(false)

    return false

exports.sign_out_confirm = (event) ->
    bootbox.confirm "<h3><i class='fa fa-sign-out'></i> Sign out?</h3> <hr> Are you sure you want to sign out of your account on this web browser?", (result) ->
        if result
            sign_out()
    event.stopPropagation()

$("#account").find("a[href=#sign-out]").click (event) ->
    exports.sign_out_confirm(event)


exports.sign_out_everywhere_confirm = (event) ->
    bootbox.confirm "<h3><i class='fa fa-sign-out'></i> Sign out everywhere?</h3> <hr> Are you sure you want to sign out on <b>ALL</b> web browser?  Every web browser will have to reauthenticate before using this account again.", (result) ->
        if result
            sign_out(everywhere:true)
    event.stopPropagation()

$("#account").find("a[href=#sign-out-everywhere]").click (event) ->
    exports.sign_out_everywhere_confirm(event)


################################################
# Account settings
################################################

EDITOR_SETTINGS_CHECKBOXES = ['strip_trailing_whitespace',
                              'show_trailing_whitespace',
                              'line_wrapping',
                              'line_numbers',
                              'smart_indent',
                              'match_brackets',
                              'auto_close_brackets',
                              'match_xml_tags',
                              'auto_close_xml_tags',
                              'code_folding'
                              'electric_chars',
                              'spaces_instead_of_tabs',
                              'track_revisions',
                              'extra_button_bar']

OTHER_SETTINGS_CHECKBOXES = ['confirm_close',
                             'mask_files']

# These are not the *defaults* in the sense of account settings for a new users.
# These are the defaults before a user has logged in, e.g., for anonymous users
# viewing public files.
DEFAULT_ACCOUNT_SETTINGS =
    account_id      : undefined
    first_name      : "Anonymous"
    last_name       : "Users"
    default_system  : "sage"
    evaluate_key    : "Shift-Enter"
    enable_tooltips : true
    autosave        : 45
    terminal        :
        font_size    : 6
        color_scheme : "default"
        font         :"monospace"
    editor_settings :
        strip_trailing_whitespace : true
        show_trailing_whitespace  : true
        line_wrapping             : true
        line_numbers              : true
        smart_indent              : true
        electric_chars            : true
        match_brackets            : true
        auto_close_brackets       : true
        auto_close_xml_tags       : true
        code_folding              : true
        match_xml_tags            : true
        spaces_instead_of_tabs    : true
        multiple_cursors          : true
        track_revisions           : false
        first_line_number         : 1
        indent_unit               : 4
        tab_size                  : 4
        bindings                  : "default"
        theme                     : "default"
        undo_depth                : 300
    other_settings  :
        confirm_close     : false  # non-logged in user shouldn't have to confirm leave.
        mask_files        : true
        default_file_sort : 'filename'
    email_address   : 'anonymous@example.com'
    groups          : []

{EventEmitter} = require('events')
class AccountSettings extends EventEmitter
    constructor: () ->
        # defaults before loaded from backend or for non-logged-in-users
        @settings = DEFAULT_ACCOUNT_SETTINGS

    account_id: () =>
        return account_id

    is_signed_in: () =>
        return account_id?

    load_from_server: (cb) =>
        salvus_client.get_account_settings
            account_id : account_id
            cb         : (error, settings_mesg) =>
                #console.log("load got back ", error, settings_mesg)
                if error or settings_mesg.event == 'error'
                    $("#account-settings-error").show()
                    $(".smc-account-settings-error-message").text(error or settings_mesg.error)
                    # try to get settings again in a bit to fix that the settings aren't known
                    setTimeout(@reload, 15000)
                    cb?(error)
                    return


                if settings_mesg.event != "account_settings"
                    $("#account-settings-error").show()
                    $(".smc-account-settings-error-message").text('')
                    alert_message(type:"error", message:"Received an invalid message back from the server when requesting account settings.  mesg=#{JSON.stringify(settings_mesg)}")
                    cb?("invalid message")
                    return

                $("#account-settings-error").hide()
                @settings = settings_mesg
                delete @settings['id']
                delete @settings['event']

                cb?()

    reload: () =>
        @load_from_server (err) =>
            if not err
                @set_view()
                $("#account-settings-error").hide()
                account_settings.emit("loaded")

    git_author: () =>
        return misc.git_author(@settings.first_name, @settings.last_name, @settings.email_address)

    fullname: () =>
        return @settings.first_name + " " + @settings.last_name

    username: () =>
        return misc.make_valid_name(@fullname())

    set_view: () ->
        if not @settings?
            return  # not logged in -- don't bother
        # most stuff is now done in r_account.cjsx via react.
        top_navbar.activity_indicator('account')
        set_account_tab_label(true, @fullname())

    # Store the properties that user can freely change to the backend database.
    # The other properties only get saved by direct api calls that require additional
    # information, e.g., password.   The setting in this object are saved; if you
    # want to save the settings in view, you must first call load_from_view.
    save_to_server: (opts={}) ->
        opts = defaults opts,
            cb       : undefined
            password : undefined  # must be set or all restricted settings are ignored by the server

        if not @settings? or @settings == 'error'
            opts.cb?("There are no account settings to save.")
            return
        salvus_client.save_account_settings
            account_id : account_id
            settings   : @settings
            password   : opts.password
            cb         : opts.cb

account_settings = exports.account_settings = new AccountSettings()

################################################
# Make it so changing each editor property impacts all open editors instantly
# TODO: just started with theme -- need to do the rest
################################################
###
editor_theme = $(".account-settings-editor-color_scheme").on 'change', () ->
    val = editor_theme.val()
    if account_settings.settings.editor_settings.theme == val
        return
    account_settings.settings.editor_settings.theme = val
    for x in $(".salvus-editor-codemirror")
        $(x).data("editor")?.set_theme(val)
    account_settings.save_to_server()
###


################################################
# Forgot your password?
################################################

forgot_password = $("#account-forgot_password")
$("a[href=#account-forgot_password]").click (event) ->
    forgot_password.modal()
    $("#account-forgot_password-email_address").focus()
    return false

close_forgot_password = () ->
    forgot_password.modal('hide').find('input').val('')
    forgot_password.find(".account-error-text").hide()

forgot_password.find(".close").click((event) -> close_forgot_password())
$("#account-forgot_password-button-cancel").click((event)->close_forgot_password())
forgot_password.on("shown", () -> $("#account-forgot_password-email_address").focus())

$("#account-forgot_password-button-submit").click (event) ->
    email_address = $("#account-forgot_password-email_address").val()
    forgot_password.find(".account-error-text").hide()
    salvus_client.forgot_password
        email_address : email_address
        cb : (error, mesg) ->
            if error
                alert_message(type:"error", message:"Error sending password reset message to #{email_address} (#{mesg.error}); write to help@sagemath.com for help.")
            else if mesg.error
                alert_message(type:"error", message:"Error sending password reset message to #{email_address} (#{mesg.error}); write to help@sagemath.com for help.")
            else
                alert_message(type:"info", message:"Password reset message sent to #{email_address}; if you don't receive it or have further trouble, write to help@sagemath.com.")


#################################################################
# Page you get when you click "Forgot your password" email link and main page loads
#################################################################
forgot_password_reset = $("#account-forgot_password_reset")
url_args = window.location.href.split("#")
if url_args.length == 2 and url_args[1].slice(0,6) == "forgot"
    forget_password_reset_key = url_args[1].slice(7,7+36)
    forgot_password_reset.modal("show")

    # this line is just stupid; but it doesn't matter if it fails
    setTimeout((()=>forgot_password_reset.find("input").focus()), 1000)

close_forgot_password_reset = () ->
    forgot_password_reset.modal('hide').find('input').val('')
    forgot_password_reset.find(".account-error-text").hide()
    window.history.pushState("", "", "/")  # this gets rid of the #forgot, etc. part of the URL.

forgot_password_reset.find(".close").click((event) -> close_forgot_password_reset())
$("#account-forgot_password_reset-button-cancel").click((event)->close_forgot_password_reset())
forgot_password_reset.on("shown", () -> $("#account-forgot_password_reset-new_password").focus())

$("#account-forgot_password_reset-button-submit").click (event) ->
    ga('send', 'event', 'account', 'forgot_password')    # custom google analytic event -- user forgot password

    new_password = $("#account-forgot_password_reset-new_password").val()
    forgot_password_reset.find(".account-error-text").hide()
    salvus_client.reset_forgot_password
        reset_code   : url_args[1].slice(7)
        new_password : new_password
        cb : (error, mesg) ->
            if error
                $("#account-forgot_password_reset-error").html("Error communicating with server: #{error}").show()
            else
                if mesg.error
                    $("#account-forgot_password_reset-error").html(mesg.error).show()
                else
                    # success
                    alert_message(type:"info", message:'Your new password has been saved.')
                    close_forgot_password_reset()
                    window.history.pushState("", "", "/") # get rid of the hash-tag in URL (requires html5 to work, but doesn't matter if it doesn't work)
    return false


################################################
# Version number check
################################################
client_version = require('salvus_version').version  # client version

version_check = () ->
    salvus_client.server_version
        cb : (err, server_version) ->
            if not err and server_version > client_version
                $(".salvus_client_version_warning").show()

$(".salvus_client_version_warning").draggable().find(".fa-times").click () ->
    $(".salvus_client_version_warning").hide()


setTimeout(version_check, 15000)  # check on first connection.

setInterval(version_check, 3*60*1000)  # check once every three minutes


# Connection information dialog

$(".salvus-connection-status").click () ->
    show_connection_information()
    return false

$("a[href=#salvus-connection-reconnect]").click () ->
    salvus_client._fix_connection()
    return false

show_connection_information = () ->
    dialog = $(".salvus-connection-info")
    dialog.modal('show')
    if hub?
        dialog.find(".salvus-connection-hub").show().find('pre').text(hub)
        dialog.find(".salvus-connection-nohub").hide()
    else
        dialog.find(".salvus-connection-nohub").show()
        dialog.find(".salvus-connection-hub").hide()
    s = require('salvus_client')

    if s.ping_time()
        dialog.find(".salvus-connection-ping").show().find('pre').text("#{s.ping_time()}ms")
    else
        dialog.find(".salvus-connection-ping").hide()



################################################
# Automatically log in
################################################
if localStorage.remember_me or window.location.hash.substr(1) == 'login'
    $(".salvus-remember_me-message").show()
    $(".salvus-sign_in-form").hide()
    # just in case, always show manual login screen after 45s.
    setTimeout((()=>$(".salvus-remember_me-message").hide(); $(".salvus-sign_in-form").show()), 45000)

salvus_client.on "remember_me_failed", () ->
    $(".salvus-remember_me-message").hide()
    $(".salvus-sign_in-form").show()
    if current_account_page == 'account-settings'  # user was logged in but now isn't due to cookie failure
        show_page("account-sign_in")
        set_account_tab_label(true, "Account")
        alert_message(type:"info", message:"You must sign in again.", timeout:1000000)

salvus_client.on "signed_in", () ->
    $(".salvus-remember_me-message").hide()
    require('projects').update_project_list()
    update_billing_tab()


###
# Stripe billing integration
###

stripe = undefined
update_billing_tab = () ->
    if not stripe?
        stripe = require('stripe').stripe_user_interface()
    stripe.update()

$("a[href=#smc-billing-tab]").click(update_billing_tab)

$("a[href=#account-settings-tab]").click () ->
    $(".smc-billing-tab-refresh-spinner").removeClass('fa-spin').hide()


###
# Sign-in Strategies -- show only configured buttons
###

$.get '/auth/strategies', (strategies, status) ->
    if strategies.length <= 1  # just ['email']
        $(".smc-signup-strategies").hide()
        $(".smc-signin-strategies").hide()
        return
    $(".smc-signup-strategies").show()
    $(".smc-signin-strategies").show()
    for strategy in strategies
        $(".smc-auth-#{strategy}").show()
    $(".smc-signup-strategies").find("a").click (evt) ->
        # check that terms of service was clicked on
        terms = $("#create_account-agreed_to_terms")
        if not terms.is(":checked")
            terms.popover(
                title     : "Agree to the terms of service."
                animation : false
                trigger   : "manual"
                placement : if $(window).width() <= 800 then "top" else "right"
                template: '<div class="popover popover-create-account"><div class="arrow"></div><div class="popover-inner"><h3 class="popover-title"></h3></div></div>'
            ).popover("show").focus( () -> $(@).popover("destroy"))
            return false   # cancel actually creating the account

    # account settings
    elt = $("#account-settings-passports")
    for strategy in strategies
        elt.find(".smc-auth-#{strategy}").data(strategy:strategy).removeClass('disabled').click (evt) ->
            toggle_account_strategy($(evt.target).data('strategy'))
            return false

toggle_account_strategy = (strategy) ->
    if not strategy?
        bootbox.alert("Please try linking your account again in a minute.")
        return
    id = account_settings.settings.passports?[strategy]
    Strategy = strategy[0].toUpperCase() + strategy.slice(1)
    if id
        if account_settings.settings.passports? and misc.keys(account_settings.settings.passports).length == 1 and not account_settings.settings.email_address
            bootbox.alert("You can't unlink #{strategy} since it is the only login method.  Please set an email address first (as an alternate login method).")
        else
            bootbox.confirm "<h3><i class='fa fa-#{strategy}'></i> Unlink #{strategy} from your account?</h3> <hr> DANGER: You won't be able to log in using #{Strategy}.", (result) ->
                if result
                    btn = $("#account-settings-passports").find(".smc-auth-#{strategy}")
                    btn.icon_spin(start:true)
                    salvus_client.unlink_passport
                        strategy : strategy
                        id       : id
                        cb       : (err) ->
                            btn.icon_spin(false)
                            if err
                                alert_message(type:"error", message:"Unable to unlink #{strategy} -- #{err}")
                            else
                                alert_message(type:"info", message:"Successfully unlinked #{strategy}")
                                account_settings.reload()
    else
        bootbox.alert("<h3><i class='fa fa-#{strategy}'></i> Link #{Strategy} to your account?</h3><hr>  Click the big green button and you will be able to log into your account using #{Strategy}.  <br><br>NOTE: No exciting extra linking or synchronization features are implemented yet.<br><br><a class='btn btn-lg btn-success' href='/auth/#{strategy}' target='_blank'><i class='fa fa-#{strategy}'></i> Link to #{Strategy}...</a>")


    ###
        if strategy == 'email'
            continue
        icon = strategy
        name = strategy[0].toUpperCase() + strategy.slice(1)
        btn = $("<a href='##{strategy}' class='btn btn-default'><i class='fa fa-#{icon}'></i> #{name}</a>")
        e.append(btn)
    ###

