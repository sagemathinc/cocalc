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
        @flux.getActions('users').setTo(user_map: table.get())

flux.createTable('users', UsersTable)

exports.User = User = rclass
    propTypes: ->
        account_id : rtypes.string.isRequired
        user_map   : undefined  # immutable map if known

    shouldComponentUpdate: (nextProps) ->
        n = nextProps.user_map.get(@props.account_id)
        if not n?
            return true
        return not n.equals(@props.user_map?.get(@props.account_id))

    render : ->
        info = @props.user_map?.get(@props.account_id)
        if not info?
            return <span>Loading...</span>
        else
            info = info.toJS()
            <span>{info.first_name} {info.last_name}</span>

# NOTE: Only use the component below if no containing component does *NOT* itself also
# connect to the users store.  If any containing component connects to the user store,
# you *must* use the Users component above directly.   See, e.g., ProjectSelector.
exports.UserAuto = rclass
    propTypes: ->
        account_id : rtypes.string.isRequired
        user_map   : undefined
    render : ->
        <FluxComponent connectToStores={'users'}>
            <User account_id={@props.account_id} />
        </FluxComponent>


