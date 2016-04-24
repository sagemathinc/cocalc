###
# Account Redux store
###

{Actions, Store, Table, redux}  = require('./smc-react')

misc = require('smc-util/misc')

help = ->
    return redux.getStore('customize').get('help_email')

{salvus_client} = require('./salvus_client')
remember_me = salvus_client.remember_me_key()

# Define account actions
class AccountActions extends Actions
    set_user_type: (user_type) ->
        @setState(user_type: user_type)

    sign_in : (email, password) =>
        @setState(signing_in: true)
        salvus_client.sign_in
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
                        require('./top_navbar').top_navbar.switch_to_page('projects')
                        break
                    when 'error'
                        @setState(sign_in_error : mesg.reason)
                    else
                        # should never ever happen
                        @setState(sign_in_error : "The server responded with invalid message when signing in: #{JSON.stringify(mesg)}")

    create_account : (name, email, password, token) ->
        i = name.lastIndexOf(' ')
        if i == -1
            last_name = ''
            first_name = name
        else
            first_name = name.slice(0,i).trim()
            last_name = name.slice(i).trim()
        @setState(signing_up: true)
        salvus_client.create_account
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
                        ga('send', 'event', 'account', 'create_account')    # custom google analytic event -- user created an account
                        require('./top_navbar').top_navbar.switch_to_page('projects')
                    else
                        # should never ever happen
                        # alert_message(type:"error", message: "The server responded with invalid message to account creation request: #{JSON.stringify(mesg)}")

    forgot_password : (email) ->
        salvus_client.forgot_password
            email_address : email
            cb : (err, mesg) =>
                if err?
                    @setState('forgot_password_error': "Error sending password reset message to #{email} (#{err}); write to #{help()} for help.")
                else if mesg.err
                    @setState('forgot_password_error': "Error sending password reset message to #{email} (#{err}); write to #{help()} for help.")
                else
                    @setState('forgot_password_success': "Password reset message sent to #{email}; if you don't receive it or have further trouble, write to #{help()}.")

    reset_password : (code, new_password) ->
        salvus_client.reset_forgot_password
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
                        history.pushState("", document.title, window.location.pathname)
                        @setState(reset_key : '', reset_password_error : '')
    sign_out : (everywhere) ->
        delete localStorage[remember_me]
        evt = 'sign_out'
        if everywhere
            evt += '_everywhere'
        ga('send', 'event', 'account', evt)    # custom google analytic event -- user explicitly signed out.

        # Send a message to the server that the user explicitly
        # requested to sign out.  The server must clean up resources
        # and *invalidate* the remember_me cookie for this client.
        salvus_client.sign_out
            everywhere : everywhere
            cb         : (error) ->
                if error
                    @setState('sign_out_error' : message.error)
                else
                    # Force a refresh, since otherwise there could be data
                    # left in the DOM, which could lead to a vulnerability
                    # or blead into the next login somehow.
                    window.location.reload(false)

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

    is_logged_in : =>
        return @get('account_id')?

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

    get_confirm_close: =>
        return @getIn(['other_settings', 'confirm_close'])

    # Total ugprades this user is paying for (sum of all upgrades from memberships)
    get_total_upgrades: =>
        require('upgrades').get_total_upgrades(@getIn(['stripe_customer','subscriptions', 'data'])?.toJS())

    get_page_size: =>
        return @getIn(['other_settings', 'page_size']) ? 50  # at least have a valid value if loading...

# Register account store
# Use the database defaults for all account info until this gets set after they login
init = misc.deep_copy(require('smc-util/schema').SCHEMA.accounts.user_query.get.fields)
init.user_type = if localStorage[remember_me]? then 'signing_in' else 'public'  # default
redux.createStore('account', AccountStore, init)

# Create and register account table, which gets automatically
# synchronized with the server.
class AccountTable extends Table
    query: ->
        return 'accounts'

    _change: (table) =>
        @redux.getActions('account').setState(table.get_one()?.toJS?())

redux.createTable('account', AccountTable)

# Login status
salvus_client.on 'signed_in', ->
    redux.getActions('account').set_user_type('signed_in')
salvus_client.on 'signed_out', ->
    redux.getActions('account').set_user_type('public')
salvus_client.on 'remember_me_failed', ->
    redux.getActions('account').set_user_type('public')

# Standby timeout
account_store = redux.getStore('account')
last_set_standby_timeout_m = undefined
account_store.on 'change', ->
    # NOTE: we call this on any change to account settings, which is maybe too extreme.
    x = account_store.getIn(['other_settings', 'standby_timeout_m'])
    if last_set_standby_timeout_m != x
        last_set_standby_timeout_m = x
        salvus_client.set_standby_timeout_m(x)
