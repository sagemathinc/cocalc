{React, Actions, Store, Table, flux, rtypes, rclass, FluxComponent}  = require('flux')

# Define user actions
class UsersActions extends Actions
    setTo: (payload) -> payload

# Register the actions
flux.createActions('users', UsersActions)

# Define user store: all the users you collaborate with
class UsersStore extends Store
    constructor: (flux) ->
        super()
        ActionIds = flux.getActionIds('users')
        @register(ActionIds.setTo, @setTo)
        @state = {}

    setTo: (payload) ->
        @setState(payload)

# Register user store
flux.createStore('users', UsersStore, flux)

# Create and register projects table, which gets automatically
# synchronized with the server.
class UsersTable extends Table
    query: ->
        return 'collaborators'

    _change: (table, keys) =>
        @flux.getActions('users').setTo(users: table.get())

flux.createTable('users', UsersTable)

UserComponent = rclass
    propTypes: ->
        account_id : rtypes.string.isRequired
        users      : undefined  # immutable map if known

    shouldComponentUpdate: (nextProps) ->
        n = nextProps.users.get(@props.account_id)
        if not n?
            return true
        return not n.equals(@props.users?.get(@props.account_id))

    render : ->
        info = @props.users?.get(@props.account_id)
        if not info?
            return <span>Loading...</span>
        else
            info = info.toJS()
            <span>{info.first_name} {info.last_name}</span>

exports.User = User = rclass
    propTypes: ->
        account_id : rtypes.string.isRequired
        users      : undefined
    render : ->
        <FluxComponent flux={flux} connectToStores={'users'}>
            <UserComponent account_id={@props.account_id} users={@props.users?.users} />
        </FluxComponent>


