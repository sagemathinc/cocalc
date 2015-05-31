{React, Actions, Store, flux, rtypes, FluxComponent}  = require('flux')

{Panel, Grid, Row, Col, Input} = require('react-bootstrap')


###
# Account
###

# Define account actions
class AccountActions extends Actions
    # NOTE: Can test causing this action by typing this in the Javascript console:
    #    require('flux').flux.getActions('account').setTo({first_name:"William"})
    setTo: (settings) ->
        settings : settings

# Register account actions
flux.createActions('account', AccountActions)

# Define account store
class AccountStore extends Store
    constructor: (flux) ->
        super()
        ActionIds = flux.getActionIds('account')
        @register(ActionIds.setTo, @setTo)
        @state = {}

    setTo: (message) ->
        console.log("setting state using",message.settings)
        @setState(message.settings)

# Register account store
flux.createStore('account', AccountStore, flux)

# Define a component for working with the user's basic
# account information.

class AccountSettings extends React.Component
    @propTypes:
        first_name : rtypes.string
        last_name  : rtypes.string

    handleChange: =>
        flux.getActions('account').setTo
            first_name : @refs.first_name.getValue()
            last_name  : @refs.last_name.getValue()

    render : ->
        <Panel header='Account Settings'>
            <Row>
                <Col md=4>
                    First name
                </Col>
                <Col md=8>
                    <Input
                        type     = 'text'
                        hasFeedback
                        ref      = 'first_name'
                        value    = {@props.first_name}
                        onChange = {@handleChange}
                    />
                </Col>
            </Row>
            <Row>
                <Col md=4>
                    Last name
                </Col>
                <Col md=8>
                    <Input
                        type     = 'text'
                        ref      = 'last_name'
                        value    = {@props.last_name}
                        onChange = {@handleChange}
                    />
                </Col>
            </Row>
            <Row>
                <Col md=4>
                    Email address
                </Col>
                <Col md=8>
                </Col>
            </Row>
            <Row>
                <Col md=4>
                    Password
                </Col>
                <Col md=8>
                </Col>
            </Row>
        </Panel>


###
# Terminal
###

class TerminalSettings extends React.Component
    @propTypes:
        font_size    : rtypes.number
        font_family  : rtypes.string
        color_scheme : rtypes.string
    render : ->
        <Panel header='Terminal (settings applied to newly opened terminals)'>
            <Row>
                <Col xs=3>Font size (px)</Col>
                <Col xs=3>{@props.font_size}</Col>
                <Col xs=6></Col>
            </Row>
            <Row>
                <Col xs=3>Font family</Col>
                <Col xs=9>{@props.font}</Col>
            </Row>
            <Row>
                <Col xs=3>Color scheme</Col>
                <Col xs=9>{@props.color_scheme}</Col>
            </Row>
        </Panel>


# Render the entire account settings component
render = () ->
    <Row>
        <Col xs=12 md=6>
            <FluxComponent flux={flux} connectToStores={'account'} >
                <AccountSettings />
            </FluxComponent>
        </Col>
        <Col xs=12 md=6>
            <FluxComponent flux={flux} connectToStores={'account'} >
                <TerminalSettings />
            </FluxComponent>
        </Col>
    </Row>

React.render render(), document.getElementById('r_account')
