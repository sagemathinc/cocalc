###
# Account Redux store
###

async = require('async')

{Actions, Store, Table, redux}  = require('./smc-react')

{alert_message} = require('./alerts')

misc = require('smc-util/misc')

help = ->
    return redux.getStore('customize').get('help_email')

{webapp_client} = require('./webapp_client')
remember_me = webapp_client.remember_me_key()

# Define account actions
class AccountActions extends Actions
    set_user_type: (user_type) =>
        @setState(user_type: user_type)

    sign_in: (email, password) =>
        @setState(signing_in: true)
        webapp_client.sign_in
            email_address : email
            password      : password
            remember_me   : true
            timeout       : 30
            cb            : (error, mesg) =>
                @setState(signing_in: false)
                if error
                    @setState(sign_in_error : "There was an error signing you in (#{error}).  Please try again; if that doesn't work after a few minutes, email #{help()}.")
                    return
                switch mesg.event
                    when 'sign_in_failed'
                        @setState(sign_in_error : mesg.reason)
                    when 'signed_in'
                        redux.getActions('page').set_active_tab('projects')
                        break
                    when 'error'
                        @setState(sign_in_error : mesg.reason)
                    else
                        # should never ever happen
                        @setState(sign_in_error : "The server responded with invalid message when signing in: #{JSON.stringify(mesg)}")

    create_account: (first_name, last_name, email, password, token) =>
        @setState(signing_up: true)
        webapp_client.create_account
            first_name      : first_name
            last_name       : last_name
            email_address   : email
            password        : password
            agreed_to_terms : true
            token           : token
            cb              : (err, mesg) =>
                @setState(signing_up: false)
                if err?
                    @setState('sign_up_error': err)
                    return
                switch mesg.event
                    when "account_creation_failed"
                        @setState('sign_up_error': mesg.reason)
                    when "signed_in"
                        {analytics_event} = require('./misc_page')
                        analytics_event('account', 'create_account') # user created an account
                        redux.getActions('page').set_active_tab('projects')
                    else
                        # should never ever happen
                        # alert_message(type:"error", message: "The server responded with invalid message to account creation request: #{JSON.stringify(mesg)}")

    # deletes the account and then signs out everywhere
    delete_account: =>
        async.series([
            (cb) =>
                # cancel any subscriptions
                redux.getActions('billing').cancel_everything (err) =>
                    if err and redux.getStore('billing').get('no_stripe')
                        # stripe not configured on backend, so no this err is expected
                        cb()
                    else
                        cb(err)
            (cb) =>
                # actually request to delete the account
                webapp_client.delete_account
                    account_id : @redux.getStore('account').get_account_id()
                    timeout       : 40
                    cb            : cb

        ], (err) =>
            if err?
                @setState(account_deletion_error: "Error trying to delete the account: #{err}")
            else
                @sign_out(true)
        )

    forgot_password: (email) =>
        webapp_client.forgot_password
            email_address : email
            cb : (err, mesg) =>
                if mesg?.error
                    err = mesg.error
                if err?
                    @setState
                        forgot_password_error   : "Error sending password reset message to #{email} -- #{err}. Write to #{help()} for help."
                        forgot_password_success : ''
                else
                    @setState
                        forgot_password_success : "Password reset message sent to #{email}; if you don't receive it, check your spam folder; if you have further trouble, write to #{help()}."
                        forgot_password_error   : ''

    reset_password: (code, new_password) =>
        webapp_client.reset_forgot_password
            reset_code   : code
            new_password : new_password
            cb : (error, mesg) =>
                if error
                    @setState('reset_password_error' : "Error communicating with server: #{error}")
                else
                    if mesg.error
                        @setState('reset_password_error' : mesg.error)
                    else
                        # success
                        # TODO: can we automatically log them in?
                        window.history.pushState("", document.title, window.location.pathname)
                        @setState(reset_key : '', reset_password_error : '')

    sign_out: (everywhere) =>
        misc.delete_local_storage(remember_me)

        # disable redirection from main index page to landing page
        # (existence of cookie signals this is a known client)
        # note: similar code is in account.coffee → signed_in
        {APP_BASE_URL} = require('./misc_page')
        exp = misc.server_days_ago(-30).toGMTString()
        document.cookie = "#{APP_BASE_URL}has_remember_me=false; expires=#{exp} ;path=/"

        # record this event
        evt = 'sign_out'
        if everywhere
            evt += '_everywhere'
        {analytics_event} = require('./misc_page')
        analytics_event('account', evt)  # user explicitly signed out.

        # Send a message to the server that the user explicitly
        # requested to sign out.  The server must clean up resources
        # and *invalidate* the remember_me cookie for this client.
        webapp_client.sign_out
            everywhere : everywhere
            cb         : (error) =>
                if error
                    # We don't know error is a string; and the state when this happens could be
                    # arbitrarily messed up.  So... both pop up an error (which user will see),
                    # and set something in the store, which may or may not get displayed.
                    err = "Error signing you out -- #{misc.to_json(error)} -- please refresh your browser and try again."
                    alert_message(type:"error", message: err)
                    @setState
                        sign_out_error : err
                        show_sign_out  : false
                else
                    # Invalidate the remember_me cookie and force a refresh, since otherwise there could be data
                    # left in the DOM, which could lead to a vulnerability
                    # or bleed into the next login somehow.
                    $(window).off('beforeunload', redux.getActions('page').check_unload)
                    window.location.hash = ''
                    {APP_BASE_URL} = require('./misc_page')
                    window.location = APP_BASE_URL + '/?signed_out' # redirect to base page

    push_state: (url) =>
        {set_url} = require('./history')
        if not url?
            url = @_last_history_state
        if not url?
            url = ''
        @_last_history_state = url
        set_url('/settings' + misc.encode_path(url))

    set_active_tab: (tab) =>
        @setState(active_page : tab)

# Register account actions
actions = redux.createActions('account', AccountActions)

# Define account store
class AccountStore extends Store
    # User type
    #   - 'public'     : user is not signed in at all, and not trying to sign in
    #   - 'signing_in' : user is currently waiting to see if sign-in attempt will succeed
    #   - 'signed_in'  : user has successfully authenticated and has an id
    get_user_type: =>
        return @get('user_type')

    get_account_id: =>
        return @get('account_id')

    is_logged_in: =>
        return @get_user_type() == 'signed_in'

    is_admin: =>
        return 'admin' in @get('groups')

    get_terminal_settings: =>
        return @get('terminal')?.toJS()

    get_editor_settings: =>
        return @get('editor_settings')?.toJS()

    get_fullname: =>
        return "#{@get('first_name') ? ''} #{@get('last_name') ? ''}"

    get_first_name: =>
        return @get('first_name') ? ''

    get_color: =>
        return (@getIn(['profile', 'color']) ? @get('account_id')?.slice(0,6)) ? 'f00'

    get_username: =>
        return misc.make_valid_name(@get_fullname())

    get_email_address: =>
        return @get('email_address')

    get_confirm_close: =>
        return @getIn(['other_settings', 'confirm_close'])

    # Total ugprades this user is paying for (sum of all upgrades from memberships)
    get_total_upgrades: =>
        require('upgrades').get_total_upgrades(@getIn(['stripe_customer','subscriptions', 'data'])?.toJS())

    # uses the total upgrades information to determine, if this is a paying member
    is_paying_member: =>
        ups = @get_total_upgrades()
        return ups? and (v for k, v of ups).reduce(((a, b) -> a + b), 0) > 0

    get_page_size: =>
        return @getIn(['other_settings', 'page_size']) ? 50  # at least have a valid value if loading...

# Register account store
# Use the database defaults for all account info until this gets set after they login
init = misc.deep_copy(require('smc-util/schema').SCHEMA.accounts.user_query.get.fields)
# ... except for show_global_info
init.other_settings.show_global_info = false
init.user_type = if misc.get_local_storage(remember_me) then 'signing_in' else 'public'  # default
redux.createStore('account', AccountStore, init)

# Create and register account table, which gets automatically
# synchronized with the server.
class AccountTable extends Table
    query: =>
        return 'accounts'

    _change: (table) =>
        @redux.getActions('account').setState(table.get_one()?.toJS?())

redux.createTable('account', AccountTable)

# Login status
webapp_client.on 'signed_in', ->
    redux.getActions('account').set_user_type('signed_in')
webapp_client.on 'signed_out', ->
    redux.getActions('account').set_user_type('public')
webapp_client.on 'remember_me_failed', ->
    redux.getActions('account').set_user_type('public')

# Autosave interval
_autosave_interval = undefined
init_autosave = (autosave) ->
    if _autosave_interval
        # This function can safely be called again to *adjust* the
        # autosave interval, in case user changes the settings.
        clearInterval(_autosave_interval)
        _autosave_interval = undefined

    # Use the most recent autosave value.
    if autosave
        save_all_files = () ->
            if webapp_client.is_connected()
                redux.getActions('projects').save_all_files()
        _autosave_interval = setInterval(save_all_files, autosave * 1000)

account_store = redux.getStore('account')

_last_autosave_interval_s = undefined
account_store.on 'change', ->
    interval_s = account_store.get('autosave')
    if interval_s != _last_autosave_interval_s
        _last_autosave_interval_s = interval_s
        init_autosave(interval_s)

# Standby timeout
last_set_standby_timeout_m = undefined
account_store.on 'change', ->
    # NOTE: we call this on any change to account settings, which is maybe too extreme.
    x = account_store.getIn(['other_settings', 'standby_timeout_m'])
    if last_set_standby_timeout_m != x
        last_set_standby_timeout_m = x
        webapp_client.set_standby_timeout_m(x)

account_store.on 'change', ->
    x = account_store.getIn(['editor_settings', 'jupyter_classic'])
    if x?
        if x
            require('./editor').switch_to_ipynb_classic()
        else
            require('./jupyter/register').register()
