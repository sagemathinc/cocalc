###
# Account FLUX
###

{Actions, Store, Table, flux}  = require('./flux')

misc = require('smc-common/misc')

{salvus_client} = require('./salvus_client')

# Define account actions
class AccountActions extends Actions
    # NOTE: Can test causing this action by typing this in the Javascript console:
    #    require('./flux').flux.getActions('account').setTo({first_name:'William'})
    setTo: (payload) ->
        return payload

    set_user_type: (user_type) ->
        @setTo(user_type: user_type)

# Register account actions
flux.createActions('account', AccountActions)

# Define account store
class AccountStore extends Store
    constructor: (flux) ->
        super()
        ActionIds = flux.getActionIds('account')
        @register(ActionIds.setTo, @setTo)

        # Use the database defaults for all account info until this gets set after they login
        @state = misc.deep_copy(require('smc-common/schema').SCHEMA.accounts.user_query.get.fields)
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
        require('smc-common/upgrades').get_total_upgrades(@state.stripe_customer?.subscriptions?.data)

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

