###
# Account FLUX
###

{Actions, Store, Table, flux}  = require('./r')

misc = require('smc-util/misc')
help = -> require('./r').flux.getStore('customize').state.help_email

{salvus_client} = require('./salvus_client')
remember_me = salvus_client.remember_me_key()

# Define account actions
class AccountActions extends Actions
    displayName : 'AccountActions'

    setTo: (payload) ->
        return payload

    action_creators :
        SET_USER_TYPE :
            (action) => flux.getActions('account').setTo(user_type : action.user_type)
        SIGNING_IN :
            (action) => flux.getActions('account').setTo(signing_in : true)
        SIGN_IN_ERROR :
            (action) => flux.getActions('account').setTo(signing_in : false, sign_in_error : action.error)
        HIDE_SIGN_IN_ERROR :
            (action) => flux.getActions('account').setTo(sign_in_error : undefined)
        SIGN_IN_SUCCESS :
            (action) => flux.getActions('account').setTo(signing_in : false)
        SIGNING_UP :
            (action) => flux.getActions('account').setTo(signing_up : false)
        SIGN_UP_ERROR :
            (action) => flux.getActions('account').setTo(signing_up : false, sign_up_error : action.error)
        SIGN_UP_SUCCESS :
            (action) => flux.getActions('account').setTo(signing_up : false)
        FORGOT_PASSWORD :
            (action) => flux.getActions('account').setTo(show_forgot_password : true)
        HIDE_FORGOT_PASSWORD :
            (action) => flux.getActions('account').setTo(show_forgot_password : false, forgot_password_error : undefined, forgot_password_success : undefined)
        FORGOT_PASSWORD_ERROR :
            (action) => flux.getActions('account').setTo(forgot_oassword_error : action.error)
        FORGOT_PASSWORD_SUCCESS :
            (action) => flux.getActions('account').setTo(forgot_password_success : action.message)
        RESET_PASSWORD_ERROR :
            (action) => flux.getActions('account').setTo(reset_password_error : action.error)
        HIDE_RESET_PASSWORD :
            (action) => flux.getActions('account').setTo(reset_key : '', reset_password_error : '')
        SIGN_OUT :
            (action) => flux.getActions('account').setTo(sign_out_error : action.error)
        SET_STRATEGIES :
            (action) => flux.getActions('account').setTo(strategies : action.strategies)
        SET_TOKEN :
            (action) => flux.getActions('account').setTo(token : action.token)
        SET_ALL_FROM_TABLE :
            (action) => flux.getActions('account').setTo(action.value)
        SET_ACCOUNT_SETTINGS :
            (action) => flux.getActions('account').setTo("#{action.field}" : action.value)
        HIDE_SIGN_OUT_ERROR :
            (action) => flux.getActions('account').setTo(sign_out_error : '')
        SIGN_OUT_ERROR :
            (action) => flux.getActions('account').setTo(sign_out_error : action.error)
        SHOW_SIGN_OUT :
            (action) => flux.getActions('account').setTo(show_sign_out : true, everywhere : action.everywhere)
        HIDE_SIGN_OUT :
            (action) => flux.getActions('account').setTo(show_sign_out : false)
        REMEMBER_ME :
            (action) => flux.getActions('account').setTo(remember_me : true)
        REMEMBER_ME_FAILED :
            (action) => flux.getActions('account').setTo(remember_me : false)
        SET_HUB :
            (action) => flux.getActions('account').setTo(hub : action.hub)
        SET_ACTIVE_PAGE :
            (action) => flux.getActions('account').setTo(active_page : action.page)
    send_action : (action) ->
        console.log("dispatched", action)
        if @action_creators[action.type]?
            @action_creators[action.type](action)
        else
            console.warn("Used unknown action: #{action.type}")

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
        @state.user_type = if localStorage[remember_me]? then 'signing_in' else 'public'  # default


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
        @flux.getActions('account').send_action
            type : 'SET_ALL_FROM_TABLE'
            value : table.get_one()?.toJS?()

flux.createTable('account', AccountTable)

# Login status
salvus_client.on 'signed_in', ->
    flux.getActions('account').send_action
        type : 'SET_USER_TYPE'
        user_type : 'signed_in'
salvus_client.on 'signed_out', ->
    flux.getActions('account').send_action
        type : 'SET_USER_TYPE'
        user_type : 'public'
salvus_client.on 'remember_me_failed', ->
    flux.getActions('account').send_action
        type : 'SET_USER_TYPE'
        user_type : 'public'

