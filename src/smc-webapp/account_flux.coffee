###
# Account FLUX
###

{Actions, Store, Table, flux}  = require('./r')

misc = require('smc-util/misc')
help = -> require('./r').flux.getStore('customize').state.help_email

{salvus_client} = require('./salvus_client')

# Define account actions
class AccountActions extends Actions
    displayName : 'AccountActions'
    # NOTE: Can test causing this action by typing this in the Javascript console:
    #    require('./r').flux.getActions('account').setTo({first_name:'William'})
    setTo: (payload) ->
        return payload

    set_user_type: (user_type) ->
        @setTo(user_type: user_type)


    sign_in : (email, password) =>
        @setTo(signing_in: true)
        salvus_client.sign_in
            email_address : email
            password      : password
            remember_me   : true
            timeout       : 30
            cb            : (error, mesg) =>
                @setTo(signing_in: false)
                if error
                    @setTo(sign_in_error : "There was an error signing you in (#{error}).  Please try again; if that doesn't work after a few minutes, email #{help()}.")
                    return
                switch mesg.event
                    when 'sign_in_failed'
                        @setTo(sign_in_error : mesg.reason)
                    when 'signed_in'
                        break
                    when 'error'
                        @setTo(sign_in_error : mesg.reason)
                    else
                        # should never ever happen
                        @setTo(sign_in_error : "The server responded with invalid message when signing in: #{JSON.stringify(mesg)}")

    sign_this_fool_up : (name, email, password, token) ->
        i = name.lastIndexOf(' ')
        if i == -1
            last_name = ''
            first_name = name
        else
            first_name = name.slice(0,i).trim()
            last_name = name.slice(i).trim()
        @setTo(signing_up: true)
        salvus_client.create_account
            first_name      : first_name
            last_name       : last_name
            email_address   : email
            password        : password
            agreed_to_terms : true
            token           : token
            cb              : (err, mesg) =>
                @setTo(signing_up: false)
                if err?
                    @setTo('sign_up_error': err)
                    return
                switch mesg.event
                    when "account_creation_failed"
                        @setTo('sign_up_error': mesg.reason)
                    when "signed_in"
                        ga('send', 'event', 'account', 'create_account')    # custom google analytic event -- user created an account
                    else
                        # should never ever happen
                        # alert_message(type:"error", message: "The server responded with invalid message to account creation request: #{JSON.stringify(mesg)}")

    forgot_password : (email) ->
        salvus_client.forgot_password
            email_address : email
            cb : (err, mesg) =>
                if err?
                    @setTo('forgot_password_error': "Error sending password reset message to #{email} (#{err}); write to #{help()} for help.")
                else if mesg.err
                    @setTo('forgot_password_error': "Error sending password reset message to #{email} (#{err}); write to #{help()} for help.")
                else
                    @setTo('forgot_password_success': "Password reset message sent to #{email}; if you don't receive it or have further trouble, write to #{help()}.")

    reset_password : (code, new_password) ->
        salvus_client.reset_forgot_password
            reset_code   : code
            new_password : new_password
            cb : (error, mesg) =>
                if error
                    @setTo('reset_password_error' : "Error communicating with server: #{error}")
                else
                    if mesg.error
                        @setTo('reset_password_error' : mesg.error)
                    else
                        # success
                        # TODO: can we automatically log them in?
                        history.pushState("", document.title, window.location.pathname)
                        @setTo(reset_key : '', reset_password_error : '')
    sign_out : (everywhere) ->
        delete localStorage.remember_me
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
                    @setTo('sign_out_error' : message.error)
                else
                    # Force a refresh, since otherwise there could be data
                    # left in the DOM, which could lead to a vulnerability
                    # or blead into the next login somehow.
                    window.location.reload(false)

# Register account actions
flux.createActions('account', AccountActions)

# Define account store
class AccountStore extends Store
    constructor: (flux) ->
        super()
        ActionIds = flux.getActionIds('account')
        @register(ActionIds.setTo, @setTo)

        # Use the database defaults for all account info until this gets set after they login
        @state = misc.deep_copy(require('smc-util/schema').SCHEMA.accounts.user_query.get.fields)
        @state.user_type = if localStorage.remember_me? then 'signing_in' else 'public'  # default


    setTo: (payload) ->
        @setState(payload)

    # User type
    #   - 'public'     : user is not signed in at all, and not trying to sign in
    #   - 'signing_in' : user is currently waiting to see if sign-in attempt will succeed
    #   - 'signed_in'  : user has successfully authenticated and has an id
    get_user_type: ->
        return @state.user_type

    get_account_id: ->
        return @state.account_id

    is_logged_in : ->
        return @state.account_id?

    is_admin: ->
        if @state.groups?
            return 'admin' in @state.groups

    get_terminal_settings: ->
        return @state.terminal

    get_editor_settings: ->
        return @state.editor_settings

    get_fullname: =>
        return "#{@state.first_name ? ''} #{@state.last_name ? ''}"

    get_first_name: =>
        return @state.first_name ? ''

    get_color: =>
        return (@state.profile?.color ? @state.account_id.slice(0,6)) ? 'f00'

    get_username: =>
        return misc.make_valid_name(@get_fullname())

    get_confirm_close: =>
        return @state.other_settings?.confirm_close

    # Total ugprades this user is paying for (sum of all upgrades from memberships)
    get_total_upgrades: =>
        require('upgrades').get_total_upgrades(@state.stripe_customer?.subscriptions?.data)

    get_page_size: =>
        return @state.other_settings?.page_size ? 50  # at least have a valid value if loading...

# Register account store
flux.createStore('account', AccountStore)

# Create and register account table, which gets automatically
# synchronized with the server.
class AccountTable extends Table
    query: ->
        return 'accounts'

    _change: (table) =>
        @flux.getActions('account').setTo(table.get_one()?.toJS?())

flux.createTable('account', AccountTable)

# Login status
salvus_client.on 'signed_in', ->
    flux.getActions('account').set_user_type('signed_in')
salvus_client.on 'signed_out', ->
    flux.getActions('account').set_user_type('public')
salvus_client.on 'remember_me_failed', ->
    flux.getActions('account').set_user_type('public')

