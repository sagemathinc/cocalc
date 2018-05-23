###
# Account Redux store
###

async = require('async')
immutable = require('immutable')

{Actions, Store, Table, redux}  = require('./smc-react')

{alert_message} = require('./alerts')

misc = require('smc-util/misc')
{defaults, required} = misc

{get_utm, get_referrer} = require('./misc_page')

help = ->
    return redux.getStore('customize').get('help_email')

{webapp_client} = require('./webapp_client')
remember_me = webapp_client.remember_me_key()

# Define account actions
class AccountActions extends Actions
    set_user_type: (user_type) =>
        @setState
            user_type    : user_type
            is_logged_in : user_type == 'signed_in'

    sign_in: (email, password) =>
        @setState(signing_in: true)
        webapp_client.sign_in
            email_address : email
            password      : password
            remember_me   : true
            timeout       : 30
            utm           : get_utm()
            referrer      : get_referrer()
            get_api_key   : redux.getStore('page')?.get('get_api_key')
            cb            : (error, mesg) =>
                @setState(signing_in: false)
                if error
                    @setState(sign_in_error : "There was an error signing you in (#{error}).  Please try again; if that doesn't work after a few minutes, email #{help()}.")
                    return
                switch mesg.event
                    when 'sign_in_failed'
                        @setState(sign_in_error : mesg.reason)
                    when 'signed_in'
                        #redux.getActions('page').set_active_tab('projects')
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
            utm             : get_utm()
            referrer        : get_referrer()
            get_api_key     : redux.getStore('page')?.get('get_api_key')
            cb              : (err, mesg) =>
                @setState(signing_up: false)
                if err?
                    # generic error.
                    @setState('sign_up_error': {'generic': JSON.stringify(err)})
                    return
                switch mesg.event
                    when "account_creation_failed"
                        @setState('sign_up_error': mesg.reason)
                    when "signed_in"
                        redux.getActions('page').set_active_tab('projects')
                        {analytics_event, track_conversion} = require('./misc_page')
                        analytics_event('account', 'create_account') # user created an account
                        track_conversion('create_account')
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
                    window.location = APP_BASE_URL + '/app?signed_out' # redirect to sign in page

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

    # Add an ssh key for this user, with the given fingerprint, title, and value
    add_ssh_key: (opts) =>
        opts = defaults opts,
            fingerprint : required
            title       : required
            value       : required
        @redux.getTable('account').set
            ssh_keys :
                "#{opts.fingerprint}" :
                    title          : opts.title
                    value          : opts.value
                    creation_date  : new Date() - 0

    # Delete the ssh key with given fingerprint for this user.
    delete_ssh_key: (fingerprint) =>
        @redux.getTable('account').set
            ssh_keys :
                "#{fingerprint}" : null   # null is how to tell the backend/synctable to delete this...

    set_intro: (opts) =>
        opts = defaults opts,
            key    : required
            value  : required
        @redux.getTable('account').set
            intro :
                "#{opts.key}": opts.value
                last_update  : new Date() - 0

    reset_intro: =>
        # for now, we only have level:<int>
        @set_intro(key:'level', value:0)

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

    is_admin: =>
        return @get('groups').includes('admin')

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

    # Total ugprades this user is paying for (sum of all upgrades from subscriptions)
    get_total_upgrades: =>
        require('upgrades').get_total_upgrades(@getIn(['stripe_customer','subscriptions', 'data'])?.toJS())

    # uses the total upgrades information to determine, if this is a paying member
    is_paying_member: =>
        ups = @get_total_upgrades()
        return ups? and (v for k, v of ups).reduce(((a, b) -> a + b), 0) > 0

    get_page_size: =>
        return @getIn(['other_settings', 'page_size']) ? 50  # at least have a valid value if loading...

    get_intro: (key) =>
        return @getIn(['intro', key]) ? 0

    ###
    TODO: This is deleted, but if you do setState(show_global_info: true), then it gets shown.
    We need to delete this function and instead do like in the _init of actions, i.e.,
    set derived state based on changes to account store in AccountActions.  -- william

    is_global_info_visible: =>
        # TODO when there is more time, rewrite this to be tied to announcements of a specific type (and use their timestamps)
        # for now, we use the existence of a timestamp value to indicate that the banner is not shown
        sgi2 = @getIn(['other_settings', 'show_global_info2'])
        if sgi2 == 'loading'   # unknown state, right after opening the application
            return false
        if not sgi2?           # not set means there is no timestamp → show banner
            return false  # true ## change to true, if reimplemnted.
        sgi2_dt = new Date(sgi2)
        ## idea behind this: show the banner only if its start_dt timetstamp is earlier than now
        ## *and* when the last "dismiss time" by the user is prior to it. I.e. also change the
        ## fallback in case there is no timestamp back to true.
        # start_dt = new Date('2017-08-25T19:00:00.000Z')
        # return start_dt < webapp_client.server_time() and sgi2_dt < start_dt
        return false
    ###

# Register account store
# Use the database defaults for all account info until this gets set after they login
init = misc.deep_copy(require('smc-util/schema').SCHEMA.accounts.user_query.get.fields)
# ... except for show_global_info2 (null or a timestamp)
init.other_settings.show_global_info2 = 'loading' # indicates it is starting up
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
webapp_client.on 'signed_in', (mesg) ->
    if mesg?.api_key
        # wait for sign in to finish and cookie to get set, then redirect
        f = ->
            window.location.href = "https://authenticated?api_key=#{mesg.api_key}"
        setTimeout(f, 2000)
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

