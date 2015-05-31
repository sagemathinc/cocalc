{React, Actions, Store, flux, rtypes, FluxComponent}  = require('flux')

# Define account actions
class AccountActions extends Actions
    setFromServer: (settings) ->
        settings : settings
        # NOTE: Can test causing this action by typing this in the Javascript console:
        #    require('flux').flux.getActions('account').setFromServer({first_name:"William"})

# Register account actions
flux.createActions('account', AccountActions)

# Define account store
class AccountStore extends Store
    constructor: (flux) ->
        super()
        ActionIds = flux.getActionIds('account')
        @register(ActionIds.setFromServer, @setFromServer)
        @state = {}

    setFromServer: (message) ->
        @setState(message.settings)

# Register account store
flux.createStore('account', AccountStore, flux)

# Define a component for working with the user's first and
# last name (displaying and changing).
class Name extends React.Component
    @propTypes:
        first_name : rtypes.string
        last_name  : rtypes.string
    render : ->
        <div>
            <div>First Name: {@props.first_name}</div>
            <div>Last  Name: {@props.last_name}</div>
        </div>

# Render the entire account settings component
render = () ->
    <FluxComponent flux={flux} connectToStores={['account']} >
        <Name />
    </FluxComponent>

React.render render(), document.getElementById('r_account')
