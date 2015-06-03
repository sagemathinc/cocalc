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

account            = require('account')
misc               = require('misc')

{salvus_client}    = require('salvus_client')
{account_settings} = account

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
        @setState(message.settings)

# Register account store
flux.createStore('account', AccountStore, flux)

# Font Awesome component -- obviously TODO move to own file
# Converted from https://github.com/andreypopp/react-fa
PropTypes = React.PropTypes
Icon = rclass
    propTypes:
        name       : PropTypes.string.isRequired
        size       : PropTypes.oneOf(['lg', '2x', '3x', '4x', '5x'])
        rotate     : PropTypes.oneOf(['45', '90', '135', '180', '225', '270', '315'])
        flip       : PropTypes.oneOf(['horizontal', 'vertical'])
        fixedWidth : PropTypes.bool
        spin       : PropTypes.bool
        stack      : React.PropTypes.oneOf(['1x', '2x'])
        inverse    : React.PropTypes.bool

    render : ->
        {name, size, rotate, flip, spin, fixedWidth, stack, inverse, className, style} = @props
        classNames = "fa fa-#{name}"
        if size
            classNames += " fa-#{size}"
        if rotate
            classNames += " fa-rotate-#{rotate}"
        if flip
            classNames += " fa-flip-#{flip}"
        if fixedWidth
            classNames += " fa-fw"
        if spin
            classNames += " fa-spin"
        if stack
            classNames += " fa-stack-#{stack}"
        if inverse
            classNames += " fa-inverse"
        if className
            classNames += " #{className}"
        return <span style={style} className={classNames} />

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
                    <Icon name='times' />
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
        email_address : rtypes.string
        account_id    : rtypes.string

    getInitialState: ->
        state      : 'view'   # view --> edit --> saving --> view or edit
        password   : ''
        email_adress : ''

    startEditing: ->
        @setState
            state    : 'edit'
            email_address : @props.email_address
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
            old_email_address : @props.email_address
            new_email_address : @state.email_address
            password          : @state.password
            cb                : (err, resp) =>
                if not err and resp.error?
                    err = resp.error
                if err
                    @setState
                        state    : 'edit'
                        error    : "Error saving -- #{err}"
                else
                    flux.getActions('account').setTo(email_address:@state.email_address)
                    @setState
                        state    : 'view'
                        error    : ''
                        password : ''

    change_button: ->
        if @state.password and @state.email_address != @props.email_address
            <Button onClick={@saveEditing} bsStyle='primary' style={marginLeft:'1ex'}>Change email address</Button>
        else
            <Button disabled bsStyle='primary' style={marginLeft:'1ex'}>Change email address</Button>

    render_error: ->
        if @state.error
            <ErrorDisplay error={@state.error} onClose={=>@setState(error:'')} />

    render_value: ->
        switch @state.state
            when 'view'
                <div>{@props.email_address}
                     <Button className="pull-right" style={marginRight:'1ex'} onClick={@startEditing}>Change</Button>
                </div>
            when 'edit'
                <Well>
                    <Input
                        type        = 'email'
                        ref         = 'email_address'
                        value       = {@state.email_address}
                        placeholder ='user@example.com'
                        onChange    = {=>@setState(email_address : @refs.email_address.getValue())}
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
        email_address : rtypes.string

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
            zxcvbn   : undefined
            old_password : ''
            new_password : ''
            strength     : 0

    cancel_editing: ->
        @setState
            state    : 'view'
            old_password : ''
            new_password : ''
            zxcvbn   : undefined
            strength     : 0

    save_new_password: ->
        @setState
            state : 'saving'
        salvus_client.change_password
            email_address : @props.email_address
            old_password  : @state.old_password
            new_password  : @state.new_password
            cb            : (err, resp) =>
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
        email_address : rtypes.string

    handleChange: ->
        flux.getActions('account').setTo
            first_name : @refs.first_name.getValue()
            last_name  : @refs.last_name.getValue()
        save_to_server()

    render: ->
        <Panel header={<h2> <Icon name='user' /> Account</h2>}>
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
                email_address = {@props.email_address}
                account_id = {@props.account_id}
                ref        = 'email_address'
                />
            <PasswordSetting
                email_address = {@props.email_address}
                ref   = 'password'
                />
        </Panel>


###
# Terminal
###

# Plan: have this exact same control be available directly when using a terminal (?)
# Here Terminal = term.js global object
terminal_color_schemes = ({value:theme, display:val.comment} for theme, val of Terminal.color_schemes)
terminal_color_schemes.sort (a,b) -> misc.cmp(a.display, b.display)

TerminalColorScheme = rclass
    propTypes:
        color_scheme : rtypes.string
        onChange     : rtypes.func
    handleChange : ->
        @props.onChange?(@refs.input.getValue())
    render_options: ->
        for x in terminal_color_schemes
            if @props.color_scheme == x.value
                <option selected key={x.value} value={x.value}>{x.display}</option>
            else
                <option key={x.value} value={x.value}>{x.display}</option>
    render : ->
        <Input type='select' ref='input' onChange={@handleChange}>
            {@render_options()}
        </Input>


TerminalFontSize = rclass
    propTypes:
        font_size : rtypes.number
        onChange  : rtypes.func.isRequired

    getInitialState: ->
        font_size : @props.font_size

    saveChange : (event) ->
        event.preventDefault()
        n = parseInt(@state.font_size)
        if "#{n}" == "NaN"
            n = @props.font_size
        if n < 3
            n = 3
        else if n > 100
            n = 100
        @setState(font_size:n)
        @props.onChange(n)

    render_save_button : ->
        if @state.font_size? and @state.font_size != @props.font_size
            <Button className="pull-right" bsStyle='primary' onClick={@saveChange}>Save size</Button>

    render : ->
        <Row>
            <Col xs=6>
                <form onSubmit={@saveChange}>
                    <Input type="text" ref="input"
                           value={if @state.font_size? then @state.font_size else @props.font_size}
                           onChange={=>@setState(font_size:@refs.input.getValue())}/>
                </form>
            </Col>
            <Col xs=6>
                {@render_save_button()}
            </Col>
        </Row>

TerminalFontFamily = rclass
    propTypes:
        font     : rtypes.string
        onChange : rtypes.func
    handleChange : ->
        @props.onChange?(@refs.input.getValue())
    render_options: ->
        for x in [{value:'droid-sans-mono', display:'Droid Sans Mono'},
                  {value:'Courier New',     display:'Courier New'},
                  {value:'monospace',       display:'Monospace'}]
            if @props.font == x.value
                <option selected key={x.value} value={x.value}>{x.display}</option>
            else
                <option key={x.value} value={x.value}>{x.display}</option>

    render : ->
        <Input type='select' ref='input' onChange={this.handleChange}>
            {@render_options()}
        </Input>

# TODO: in console.coffee there is also code to set the font size,
# which our store ignores...
TerminalSettings = rclass
    handleChange: (obj) ->
        terminal = misc.copy(@props.terminal)
        for k, v of obj
            terminal[k] = v
        flux.getActions('account').setTo(terminal : terminal)
        save_to_server()

    render : ->
        <Panel header={<h2> <Icon name='terminal' /> Terminal <span className='lighten'>(settings applied to newly opened terminals)</span></h2>}>
            <Row>
                <Col xs=3>Font size (px)</Col>
                <Col xs=9>
                    <TerminalFontSize
                        font_size = {@props.terminal?.font_size}
                        onChange  = {(font_size)=>@handleChange(font_size:font_size)}
                    />
                </Col>
            </Row>
            <Row>
                <Col xs=3>Font family</Col>
                <Col xs=9>
                    <TerminalFontFamily
                        font     = {@props.terminal?.font}
                        onChange = {(font)=>@handleChange(font:font)}
                    />
                </Col>
            </Row>
            <Row>
                <Col xs=3>Color scheme</Col>
                <Col xs=9>
                    <TerminalColorScheme
                        color_scheme = {@props.terminal?.color_scheme}
                        onChange     = {(color_scheme)=>@handleChange(color_scheme : color_scheme)}
                    />
                </Col>
            </Row>
        </Panel>

render_sign_out_buttons = ->
    <Row style={padding: '1ex'}>
        <Col xs=12 md=6>
        </Col>
        <Col xs=12 md=6>
            <div className='pull-right'>
                <Button bsStyle='warning'
                 style={marginRight:'1ex'} onClick={account.sign_out_confirm}>
                    <Icon name='sign-out'/> Sign out
                </Button>
                <Button bsStyle='warning'
                 onClick={account.sign_out_everywhere_confirm}>
                    <Icon name='sign-out'/> Sign out everywhere
                </Button>
            </div>
        </Col>
    </Row>

# Render the entire settings component
render = () ->
    <div>
        {render_sign_out_buttons()}
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
    </div>

React.render render(), document.getElementById('r_account')

## Communication with backend
# load settings into store when we login and load settings
account_settings.on "loaded", ->
    flux.getActions('account').setTo
        account_id : account_settings.account_id()
    flux.getActions('account').setTo(account_settings.settings)


# save settings to backend from store
_last_save = undefined
_save_timer = undefined
MIN_SAVE_INTERVAL = 4000 # 4 seconds
save_to_server = (ignore_timer) ->
    if _save_timer? and not ignore_timer
        return
    if _last_save? and new Date() - _last_save < MIN_SAVE_INTERVAL
        _save_timer = setTimeout((->save_to_server(true)), MIN_SAVE_INTERVAL)
        return
    _save_timer = undefined
    _last_save = new Date()
    account_settings.settings = require('flux').flux.getStore('account').state
    # TODO -- maybe should only save thing that changed (not everything)?
    account_settings.save_to_server
        cb : (err) =>
            # TODO: Provide better feedback about success or failure
            # of a save (e.g., like when editing a document), instead
            # of this is old-school error message...
            if err
                {alert_message} = require('alerts')
                alert_message(type:"error", message:"Error saving account settings -- #{err}")

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
