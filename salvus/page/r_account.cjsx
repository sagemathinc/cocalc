###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2015, William Stein
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################

{React, Actions, Store, flux, rtypes, rclass, FluxComponent}  = require('flux')

{Button, Panel, Grid, Row, Col, Input, Well, Modal, ProgressBar} = require('react-bootstrap')

{salvus_client}    = require('salvus_client')
{account_settings} = require('account')
misc               = require('misc')

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


ErrorDisplay = rclass
    propTypes:
        error   : rtypes.string
        onClose : rtypes.func
    render : ->
        <Row style={backgroundColor:'white', margin:'1ex', padding:'1ex', border:'1px solid lightgray', dropShadow:'3px 3px 3px lightgray', borderRadius:'3px'}>
            <Col md=8 xs=8>
                <span style={color:'red', marginRight:'1ex'}>{@props.error}</span>
            </Col>
            <Col md=4 xs=4>
                <Button className="pull-right" onClick={@props.onClose} bsSize="small">
                    <i className='fa fa-times'></i>
                </Button>
            </Col>
        </Row>


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
        email      : rtypes.string
        account_id : rtypes.string

    getInitialState: ->
        state      : 'view'   # view --> edit --> saving --> view or edit
        password   : ''
        email      : ''

    startEditing: ->
        @setState
            state    : 'edit'
            email    : @props.email
            error    : ''
            password : ''

    cancelEditing: ->
        @setState
            state    : 'view'
            password : ''  # more secure...

    saveEditing: ->
        @setState
            state : 'saving'
        salvus_client.change_email
            account_id        : @props.account_id
            old_email_address : @props.email
            new_email_address : @state.email
            password          : @state.password
            cb                : (err, resp) =>
                if not err and resp.error?
                    err = resp.error
                if err
                    @setState
                        state    : 'edit'
                        error    : "Error saving -- #{err}"
                else
                    flux.getActions('account').setTo(email:@state.email)
                    @setState
                        state    : 'view'
                        error    : ''
                        password : ''

    change_button: ->
        if @state.password and @state.email != @props.email
            <Button onClick={@saveEditing} bsStyle='primary' style={marginLeft:'1ex'}>Change email address</Button>
        else
            <Button disabled bsStyle='primary' style={marginLeft:'1ex'}>Change email address</Button>

    render_error: ->
        if @state.error
            <ErrorDisplay error={@state.error} onClose={=>@setState(error:'')} />

    render_value: ->
        switch @state.state
            when 'view'
                <div>{@props.email}
                     <Button className="pull-right" style={marginRight:'1ex'} onClick={@startEditing}>Change</Button>
                </div>
            when 'edit'
                <Well>
                    <Input
                        type        = 'email'
                        ref         = 'email'
                        value       = {@state.email}
                        placeholder ='user@example.com'
                        onChange    = {=>@setState(email : @refs.email.getValue())}
                    />
                    <Input
                        type        = 'password'
                        ref         = 'password'
                        value       = {@state.password}
                        placeholder ='Password'
                        onChange    = {=>@setState(password : @refs.password.getValue())}
                    />
                    <Button bsStyle='default' onClick={@cancelEditing}>Cancel</Button>
                    {@change_button()}
                    {@render_error()}
                </Well>

            when 'saving'
                <div>
                    Saving...
                </div>

    render: ->
        <Row>
            <Col md=4 style={height:'49px'}>
                Email address
            </Col>
            <Col md=8>
                {@render_value()}
            </Col>
        </Row>

PasswordSetting = rclass
    propTypes:
        email : rtypes.string

    getInitialState: ->
        state        : 'view'   # view --> edit --> saving --> view
        old_password : ''
        new_password : ''
        strength     : 0
        error        : ''

    change_password: ->
        @setState
            state    : 'edit'
            error    : ''
            old_password : ''
            new_password : ''
            strength     : 0

    cancel_editing: ->
        @setState
            state    : 'view'
            old_password : ''
            new_password : ''
            strength     : 0

    save_new_password: ->
        @setState
            state : 'saving'
        salvus_client.change_password
            email_address : @props.email
            old_password  : @state.old_password
            new_password  : @state.new_password
            cb            : (err, resp) =>
                console.log("got back ", err, resp)
                if not err and resp.error
                    err = misc.to_json(resp.error)
                if err
                    @setState
                        state        : 'edit'
                        error        : "Error changing password -- #{err}"
                else
                    @setState
                        state        : 'view'
                        error        : ''
                        old_password : ''
                        new_password : ''
                        strength     : 0

    change_button: ->
        if @state.new_password and @state.new_password != @state.old_password and (not @state.zxcvbn? or @state.zxcvbn?.score > 0)
            <Button onClick={@save_new_password} bsStyle='primary' style={marginLeft:'1ex'}>Change password</Button>
        else
            <Button disabled bsStyle='primary' style={marginLeft:'1ex'}>Change password</Button>

    render_error: ->
        if @state.error
            <ErrorDisplay error={@state.error} onClose={=>@setState(error:'')} />

    password_meter: ->
        result = @state.zxcvbn
        if result?
            score = ['Very weak', 'Weak', 'So-so', 'Good', 'Awesome!']
            return <div style={marginBottom: '1em'}>
                <ProgressBar striped bsStyle='info' now={2*result.entropy} />
                {score[result.score]} (crack time: {result.crack_time_display})
            </div>

    render_value: ->
        switch @state.state
            when 'view'
                <Button className="pull-right" style={marginRight:'1ex'} onClick={@change_password}>Change</Button>

            when 'edit'
                <Well>
                    <Input
                        type        = 'password'
                        ref         = 'old_password'
                        value       = {@state.old_password}
                        placeholder = 'Current password'
                        onChange    = {=>@setState(old_password : @refs.old_password.getValue())}
                    />
                    <Input
                        type        = 'password'
                        ref         = 'new_password'
                        value       = {@state.new_password}
                        placeholder = 'New password'
                        onChange    = {=>x=@refs.new_password.getValue(); @setState(zxcvbn:password_score(x), new_password:x)}
                    />
                    {@password_meter()}
                    <Button bsStyle='default' onClick={@cancel_editing}>Cancel</Button>
                    {@change_button()}
                    {@render_error()}
                </Well>

            when 'saving'
                <div>
                    Saving...
                </div>

    render: ->
        <Row>
            <Col md=4 style={height:'49px'}>
                Password
            </Col>
            <Col md=8>
                {@render_value()}
            </Col>
        </Row>

AccountSettings = rclass
    propTypes:
        first_name : rtypes.string
        last_name  : rtypes.string
        email      : rtypes.string

    handleChange: ->
        flux.getActions('account').setTo
            first_name : @refs.first_name.getValue()
            last_name  : @refs.last_name.getValue()

    render: ->
        <Panel header='Account'>
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
                email      = {@props.email}
                account_id = {@props.account_id}
                ref        = 'email'
                />
            <PasswordSetting
                email = {@props.email}
                ref   = 'password'
                />
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

account_settings.on "loaded", ->
    s = account_settings.settings
    flux.getActions('account').setTo
        account_id : account_settings.account_id()
        first_name : s.first_name
        last_name  : s.last_name
        email      : s.email_address

# returns password score if password checker library
# loaded; otherwise returns undefined and starts load
zxcvbn = undefined
password_score = (password) ->
    # if the password checking library is loaded, render a password strength indicator -- otherwise, don't
    if zxcvbn?
        if zxcvbn != 'loading'
            # explicitly ban some words.
            return zxcvbn(password, ['sagemath','salvus','sage','sagemathcloud','smc','mathematica','pari'])
    else
        zxcvbn = 'loading'
        $.getScript "/static/zxcvbn/zxcvbn.js", () =>
            zxcvbn = window.zxcvbn
    return
