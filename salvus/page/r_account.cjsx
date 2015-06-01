{React, Actions, Store, flux, rtypes, rclass, FluxComponent}  = require('flux')

{Button, Panel, Grid, Row, Col, Input} = require('react-bootstrap')

{salvus_client}    = require('salvus_client')
{account_settings} = require('account')

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

# in a grid:   Title [text input]
TextSetting = rclass
    propTypes:
        label    : rtypes.string.isRequired
        value    : rtypes.string
        onChange : rtypes.func.isRequired
    getValue : ->
        @refs.input.getValue()
    render : ->
        <Row>
            <Col md=4>
                {@props.label}
            </Col>
            <Col md=8>
                <Input
                    type     = 'text'
                    hasFeedback
                    ref      = 'input'
                    value    = {@props.value}
                    onChange = {@props.onChange}
                />
            </Col>
        </Row>

EmailAddressSetting = rclass
    propTypes:
        email    : rtypes.string

    getInitialState: ->
        state      : 'view'   # view --> edit --> saving --> view or edit
        password   : ''
        email      : ''

    startEditing: ->
        @setState
            state    : 'edit'
            email    : @props.email
            password : ''

    cancelEditing: ->
        @setState
            state    : 'view'
            password : ''  # more secure...

    saveEditing: ->
        console.log('saveEditing')
        @setState
            state : 'saving'
        salvus_client.change_email
            account_id        : account_settings.account_id()  # TODO -- should be prop via store instead
            new_email_address : @state.email
            password          : @state.password
            cb                : (err, resp) =>
                if err
                    @setState
                        state    : 'view'
                        error    : err
                        password : ''
                else
                    flux.getActions('account').setTo(email:@state.email)
                    @setState
                        state    : 'view'
                        error    : ''
                        password : ''

    onChangeEmail: ->
        @setState(email : @refs.email.getValue())

    onChangePassword: ->
        @setState(password : @refs.password.getValue())

    save_button: ->
        if @state.password
            <Button onClick={@saveEditing} bsStyle='primary' style={{marginLeft:'1ex'}}>Change email address</Button>

    render_error: ->
        if @state.error
            <div>{@state.error}</div>

    render_value: ->
        switch @state.state
            when 'view'
                <div>{@props.email} <a style={{cursor:'pointer'}} onClick={@startEditing}>(change)</a></div>

            when 'edit'
                <div>
                    <Input
                        type     = 'email'
                        ref      = 'email'
                        value    = {@state.email}
                        placeholder ='user@example.com'
                        onChange = {@onChangeEmail}
                    />
                    <Input
                        type     = 'password'
                        ref      = 'password'
                        value    = {@state.password}
                        placeholder ='Password'
                        onChange = {@onChangePassword}
                    />
                    <Button bsStyle='default' onClick={@cancelEditing}>Cancel</Button>
                    {@save_button()}
                </div>

            when 'saving'
                <div>
                    Saving...
                </div>

    render: ->
        <Row>
            <Col md=4>
                Email address
            </Col>
            <Col md=8>
                {@render_value()}
                {@render_error()}
            </Col>
        </Row>

AccountSettings = rclass
    propTypes:
        first_name : rtypes.string
        last_name  : rtypes.string
        email      : rtypes.string

    handleChange: =>
        flux.getActions('account').setTo
            first_name : @refs.first_name.getValue()
            last_name  : @refs.last_name.getValue()

    render: ->
        <Panel header='Account Settings'>
            <TextSetting
                label    = "First name"
                value    = {@props.first_name}
                ref      = 'first_name'
                onChange = {@handleChange}
                />
            <TextSetting
                label    = "Last name"
                value    = {@props.last_name}
                ref      = 'last_name'
                onChange = {@handleChange}
                />
            <EmailAddressSetting
                email    = {@props.email}
                ref      = 'email'
                />
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

TerminalSettings = rclass
    propTypes:
        font_size    : rtypes.number
        font_family  : rtypes.string
        color_scheme : rtypes.string
    render: ->
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
