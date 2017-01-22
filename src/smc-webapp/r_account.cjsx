##############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2016, Sagemath Inc.
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

{React, ReactDOM, rtypes, rclass, redux}  = require('./smc-react')

{Button, ButtonToolbar, Checkbox, Panel, Grid, Row, Col, FormControl, FormGroup, Well, Modal, ProgressBar, Alert} = require('react-bootstrap')

{ErrorDisplay, Icon, LabeledRow, Loading, NumberInput, Saving, SelectorInput, Tip, Footer, Space} = require('./r_misc')

{SiteName} = require('./customize')

{ColorPicker} = require('./colorpicker')
{Avatar} = require('./other-users')

md5 = require('md5')

misc       = require('smc-util/misc')

{salvus_client} = require('./salvus_client')

{PROJECT_UPGRADES} = require('smc-util/schema')

# Define a component for working with the user's basic
# account information.

# in a grid:   Title [text input]
TextSetting = rclass
    displayName : 'Account-TextSetting'

    propTypes :
        label     : rtypes.string.isRequired
        value     : rtypes.string
        onChange  : rtypes.func.isRequired
        onBlur    : rtypes.func
        maxLength : rtypes.number

    getValue: ->
        ReactDOM.findDOMNode(@refs.input).value

    render: ->
        <LabeledRow label={@props.label}>
            <FormGroup>
                <FormControl
                    ref      = 'input'
                    type     = 'text'
                    value    = {@props.value}
                    onChange = {@props.onChange}
                    onBlur   = {@props.onBlur}
                    maxLength= {@props.maxLength}
                />
            </FormGroup>
        </LabeledRow>

EmailAddressSetting = rclass
    displayName : 'Account-EmailAddressSetting'

    propTypes :
        email_address : rtypes.string
        redux         : rtypes.object

    getInitialState: ->
        state      : 'view'   # view --> edit --> saving --> view or edit
        password   : ''
        email_address : ''    # The new email address

    start_editing: ->
        @setState
            state    : 'edit'
            email_address : @props.email_address
            error    : ''
            password : ''

    cancel_editing: ->
        @setState
            state    : 'view'
            password : ''  # more secure...

    save_editing: ->
        @setState
            state : 'saving'
        salvus_client.change_email
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
                    @props.redux.getTable('account').set(email_address: @state.email_address)
                    @setState
                        state    : 'view'
                        error    : ''
                        password : ''
    is_submittable: ->
        return @state.password and @state.email_address != @props.email_address

    change_button: ->
        if @is_submittable()
            <Button onClick={@save_editing} bsStyle='success'>Change email address</Button>
        else
            <Button disabled bsStyle='success'>Change email address</Button>

    render_error: ->
        if @state.error
            <ErrorDisplay error={@state.error} onClose={=>@setState(error:'')} style={marginTop:'15px'} />

    render_edit: ->
        <Well style={marginTop: '3ex'}>
            <FormGroup>
                New email address
                <FormControl
                    autoFocus
                    type        = 'email_address'
                    ref         = 'email_address'
                    value       = {@state.email_address}
                    placeholder = 'user@example.com'
                    onChange    = {=>@setState(email_address : ReactDOM.findDOMNode(@refs.email_address).value)}
                    maxLength   = 254
                />
            </FormGroup>
            Current password
            <form onSubmit={(e)=>e.preventDefault();if @is_submittable() then @save_editing()}>
                <FormGroup>
                    <FormControl
                        type        = 'password'
                        ref         = 'password'
                        value       = {@state.password}
                        placeholder = 'Current password'
                        onChange    = {=>@setState(password : ReactDOM.findDOMNode(@refs.password).value)}
                    />
                </FormGroup>
            </form>
            <ButtonToolbar>
                {@change_button()}
                <Button bsStyle='default' onClick={@cancel_editing}>Cancel</Button>
            </ButtonToolbar>
            {@render_error()}
            {@render_saving()}
        </Well>

    render_saving: ->
        if @state.state == 'saving'
            <Saving />

    render: ->
        <LabeledRow label='Email address'>
            <div>
                {@props.email_address}
                <Button className='pull-right'  disabled={@state.state != 'view'} onClick={@start_editing}>Change email...</Button>
            </div>
            {@render_edit() if @state.state != 'view'}
        </LabeledRow>

PasswordSetting = rclass
    displayName : 'Account-PasswordSetting'

    propTypes :
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

    is_submittable: ->
        return @state.new_password and @state.new_password != @state.old_password and (not @state.zxcvbn? or @state.zxcvbn?.score > 0)

    change_button: ->
        if @is_submittable()
            <Button onClick={@save_new_password} bsStyle='success'>
                Change password
                </Button>
        else
            <Button disabled bsStyle='success'>Change password</Button>

    render_error: ->
        if @state.error
            <ErrorDisplay error={@state.error} onClose={=>@setState(error:'')} style={marginTop:'15px'}  />

    password_meter: ->
        result = @state.zxcvbn
        if result?
            score = ['Very weak', 'Weak', 'So-so', 'Good', 'Awesome!']
            return <div style={marginBottom: '1em'}>
                <ProgressBar striped bsStyle='info' now={2*result.entropy} />
                {score[result.score]} (crack time: {result.crack_time_display})
            </div>

    render_edit: ->
        <Well style={marginTop:'3ex'}>
            <FormGroup>
                Current password
                <FormControl
                    autoFocus
                    type        = 'password'
                    ref         = 'old_password'
                    value       = {@state.old_password}
                    placeholder = 'Current password'
                    onChange    = {=>@setState(old_password : ReactDOM.findDOMNode(@refs.old_password).value)}
                />
            </FormGroup>
            New password
            <form onSubmit={(e)=>e.preventDefault();if @is_submittable() then @save_new_password()}>
                <FormGroup>
                    <FormControl
                        type        = 'password'
                        ref         = 'new_password'
                        value       = {@state.new_password}
                        placeholder = 'New password'
                        onChange    = {=>x=ReactDOM.findDOMNode(@refs.new_password).value; @setState(zxcvbn:password_score(x), new_password:x)}
                    />
                </FormGroup>
            </form>
            {@password_meter()}
            <ButtonToolbar>
                {@change_button()}
                <Button bsStyle='default' onClick={@cancel_editing}>Cancel</Button>
            </ButtonToolbar>
            {@render_error()}
            {@render_saving()}
        </Well>

    render_saving: ->
        if @state.state == 'saving'
            <Saving />

    render: ->
        <LabeledRow label='Password'>
            <div style={height:'30px'}>
                <Button className='pull-right' disabled={@state.state != 'view'} onClick={@change_password}  style={marginTop: '8px'}>
                    Change password...
                </Button>
            </div>
            {@render_edit() if @state.state != 'view'}
        </LabeledRow>

# WARNING: issue -- if edit an account setting in another browser and in the middle of editing
# a field here, this one will get overwritten on the prop update.  I think using state would
# fix that.
AccountSettings = rclass
    displayName : 'AccountSettings'

    propTypes :
        first_name           : rtypes.string
        last_name            : rtypes.string
        email_address        : rtypes.string
        passports            : rtypes.object
        show_sign_out        : rtypes.bool
        sign_out_error       : rtypes.string
        everywhere           : rtypes.bool
        redux                : rtypes.object
        delete_account_error : rtypes.string

    getInitialState: ->
        add_strategy_link      : undefined
        remote_strategy_button : undefined

    handle_change: (evt, field) ->
        # value = ReactDOM.findDOMNode(@refs[field]).value
        value = evt.target.value
        if field in ['first_name', 'last_name'] and not value and (not @props.first_name or not @props.last_name)
            # special case -- don't let them make their name empty -- that's just annoying (not enforced server side)
            return
        @actions('account').setState("#{field}": value)

    save_change: (evt, field) ->
        value = evt.target.value
        @props.redux.getTable('account').set("#{field}": value)

    render_add_strategy_link: ->
        if not @state.add_strategy_link
            return
        strategy = @state.add_strategy_link
        name = misc.capitalize(strategy)
        <Well>
            <h4><Icon name={strategy}/> {name}</h4>
            Link to your {name} account, so you can use {name} to
            login to your <SiteName/> account.
            <br /> <br />
            <ButtonToolbar style={textAlign: 'center'}>
                <Button href={"#{window.smc_base_url}/auth/#{@state.add_strategy_link}"} target="_blank"
                    onClick={=>@setState(add_strategy_link:undefined)}>
                    <Icon name="external-link" /> Link my {name} account
                </Button>
                <Button onClick={=>@setState(add_strategy_link:undefined)} >
                    Cancel
                </Button>
            </ButtonToolbar>
        </Well>

    remove_strategy_click: ->
        strategy = @state.remove_strategy_button
        @setState(remove_strategy_button:undefined, add_strategy_link:undefined)
        for k, _ of @props.passports
            if misc.startswith(k, strategy)
                id = k.split('-')[1]
                break
        if not id
            return
        salvus_client.unlink_passport
            strategy : strategy
            id       : id
            cb       : (err) ->
                if err
                    ugly_error(err)

    render_remove_strategy_button: ->
        if not @state.remove_strategy_button
            return
        strategy = @state.remove_strategy_button
        name = misc.capitalize(strategy)
        if misc.len(@props.passports) <= 1 and not @props.email_address
            <Well>
                You must set an email address above or add another login method before
                you can disable login to your <SiteName/> account using your {name} account.
                Otherwise you would completely lose access to your account!
            </Well>
        else
            <Well>
                <h4><Icon name={strategy}/> {name}</h4>
                Your <SiteName/> account is linked to your {name} account, so you can
                login using it.
                <br /> <br />
                If you delink your {name} account, you will no longer be able to
                use your account to log into <SiteName/>.
                <br /> <br />
                <ButtonToolbar style={textAlign: 'center'}>
                    <Button bsStyle='danger' onClick={@remove_strategy_click} >
                        <Icon name="unlink" /> Delink my {name} account
                    </Button>
                    <Button onClick={=>@setState(remove_strategy_button:undefined)} >
                        Cancel
                    </Button>
                </ButtonToolbar>
            </Well>

    render_strategy: (strategy, strategies) ->
        if strategy != 'email'
            <Button
                onClick = {=>@setState(if strategy in strategies then {remove_strategy_button:strategy, add_strategy_link:undefined} else {add_strategy_link:strategy, remove_strategy_button:undefined})}
                key     = {strategy}
                bsStyle = {if strategy in strategies then 'info' else 'default'}>
                <Icon name={strategy} /> {misc.capitalize(strategy)}...
            </Button>

    render_sign_out_error: ->
        <ErrorDisplay error={@props.sign_out_error} onClose={=>@actions('account').setState(sign_out_error : '')} />

    render_sign_out_confirm: ->
        if @props.everywhere
            text = "Are you sure you want to sign out on all web browsers?  Every web browser will have to reauthenticate before using this account again."
        else
            text = "Are you sure you want to sign out of your account on this web browser?"
        <Well style={marginTop: '15px'}>
            {text}
            <ButtonToolbar style={textAlign: 'center', marginTop: '15px'}>
                <Button bsStyle="primary" onClick={=>@actions('account').sign_out(@props.everywhere)}>
                    <Icon name="external-link" /> Sign out
                </Button>
                <Button onClick={=>@actions('account').setState(show_sign_out : false)}} >
                    Cancel
                </Button>
            </ButtonToolbar>
            {render_sign_out_error() if @props.sign_out_error}
        </Well>

    render_sign_out_buttons: ->
        <ButtonToolbar className='pull-right'>
            <Button bsStyle='warning' disabled={@props.show_sign_out and not @props.everywhere}
                onClick={=>@actions('account').setState(show_sign_out : true, everywhere : false)}>
                <Icon name='sign-out'/> Sign out...
            </Button>
            <Button bsStyle='warning' disabled={@props.show_sign_out and @props.everywhere}
                onClick={=>@actions('account').setState(show_sign_out : true, everywhere : true)}>
                <Icon name='sign-out'/> Sign out everywhere...
            </Button>
        </ButtonToolbar>

    render_sign_in_strategies: ->
        if not STRATEGIES? or STRATEGIES.length <= 1
            return
        strategies = (x.slice(0,x.indexOf('-')) for x in misc.keys(@props.passports ? {}))
        <div>
            <hr key='hr0' />
            <h5 style={color:"#666"}>Linked accounts (only used for sign in)</h5>
            <ButtonToolbar style={marginBottom:'10px'} >
                {(@render_strategy(strategy, strategies) for strategy in STRATEGIES)}
            </ButtonToolbar>
            {@render_add_strategy_link()}
            {@render_remove_strategy_button()}
        </div>

    render: ->
        <Panel header={<h2> <Icon name='user' /> Account settings</h2>}>
            <TextSetting
                label     = 'First name'
                value     = {@props.first_name}
                ref       = 'first_name'
                onChange  = {(e)=>@handle_change(e, 'first_name')}
                onBlur    = {(e)=>@save_change(e, 'first_name')}
                maxLength = 254
                />
            <TextSetting
                label    = 'Last name'
                value    = {@props.last_name}
                ref      = 'last_name'
                onChange = {(e)=>@handle_change(e, 'last_name')}
                onBlur   = {(e)=>@save_change(e, 'last_name')}
                maxLength = 254
                />
            <EmailAddressSetting
                email_address = {@props.email_address}
                redux         = {@props.redux}
                ref           = 'email_address'
                maxLength     = 254
                />
            <PasswordSetting
                email_address = {@props.email_address}
                ref   = 'password'
                maxLength = 64
                />
            <Row style={marginTop: '1ex'}>
                <Col xs=12>
                    {@render_sign_out_buttons()}
                </Col>
            </Row>
            {@render_sign_out_confirm() if @props.show_sign_out}
            <Row>
                <Col xs=12>
                    <DeleteAccount
                        style={marginTop:'1ex'}
                        initial_click = {()=>@setState(show_delete_confirmation:true)}
                        confirm_click = {=>@actions('account').delete_account()}
                        cancel_click  = {()=>@setState(show_delete_confirmation:false)}
                        user_name     = {@props.first_name + ' ' + @props.last_name}
                        show_confirmation={@state.show_delete_confirmation}
                        />
                </Col>
            </Row>
            {@render_sign_in_strategies()}
        </Panel>

DeleteAccount = rclass
    displayName : 'Account-DeleteAccount'

    propTypes:
        initial_click     : rtypes.func.isRequired
        confirm_click     : rtypes.func.isRequired
        cancel_click      : rtypes.func.isRequired
        user_name         : rtypes.string.isRequired
        show_confirmation : rtypes.bool
        style             : rtypes.object

    render: ->
        <div>
            <div style={height:'26px'}>
                <Button
                    disabled={@props.show_confirmation}
                    className='pull-right'
                    bsStyle='danger'
                    style={@props.style}
                    onClick=@props.initial_click>
                <Icon name='trash' /> Delete Account...
                </Button>
            </div>
            {<DeleteAccountConfirmation
                confirm_click={@props.confirm_click}
                cancel_click={@props.cancel_click}
                required_text={@props.user_name}
             /> if @props.show_confirmation}
        </div>

# Concious choice to make them actually click the confirm delete button.
DeleteAccountConfirmation = rclass
    displayName : 'Account-DeleteAccountConfirmation'

    propTypes:
        confirm_click : rtypes.func.isRequired
        cancel_click  : rtypes.func.isRequired
        required_text : rtypes.string.isRequired

    # Loses state on rerender from cancel. But this is what we want.
    getInitialState: ->
        confirmation_text : ''

    render: ->
        <Well style={marginTop: '26px', textAlign:'center', fontSize: '15pt', backgroundColor: 'darkred', color: 'white'}>
            Are you sure you want to DELETE YOUR ACCOUNT?<br/>
            You will <span style={fontWeight:'bold'}>immediately</span> lose access to <span style={fontWeight:'bold'}>all</span> of your projects, and any subscriptions will be canceled.<br/>
            <hr style={marginTop:'10px', marginBottom:'10px'}/>
            To DELETE YOUR ACCOUNT, enter your first and last name below.
            <FormGroup>
                <FormControl
                    autoFocus
                    value       = {@state.confirmation_text}
                    type        = 'text'
                    ref        = 'confirmation_field'
                    onChange    = {=>@setState(confirmation_text : ReactDOM.findDOMNode(@refs.confirmation_field).value)}
                    style       = {marginTop : '1ex'}
                />
            </FormGroup>
            <ButtonToolbar style={textAlign: 'center', marginTop: '15px'}>
                <Button
                    disabled={@state.confirmation_text != @props.required_text}
                    bsStyle='danger'
                    onClick={@props.confirm_click}
                >
                    <Icon name='trash' /> Confirm Account Deletion
                </Button>
                <Button
                    style={paddingRight:'8px'}
                    bsStyle='primary'
                    onClick={@props.cancel_click}}
                >
                    Cancel
                </Button>
            </ButtonToolbar>
        </Well>

###
# Terminal
###

# Plan: have this exact same control be available directly when using a terminal (?)
# Here Terminal = term.js global object
TERMINAL_COLOR_SCHEMES = {}
for theme, val of Terminal.color_schemes
    TERMINAL_COLOR_SCHEMES[theme] = val.comment

TERMINAL_FONT_FAMILIES =
    'droid-sans-mono': 'Droid Sans Mono'
    'Courier New'    : 'Courier New'
    'monospace'      : 'Monospace'

ProfileSettings = rclass
    displayName : 'Account-ProfileSettings'

    propTypes :
        redux         : rtypes.object
        email_address : rtypes.string
        first_name    : rtypes.string
        last_name     : rtypes.string

    reduxProps:
        account :
            account_id : rtypes.string
            profile    : rtypes.immutable

    getInitialState: ->
        show_instructions : false

    onColorChange: (value) ->
        @props.redux.getTable('account').set(profile : {color: value})

    onGravatarSelect: (e) ->
        if e.target.checked
            email = @props.email_address
            gravatar_url = "https://www.gravatar.com/avatar/#{md5 email.toLowerCase()}?d=identicon&s=#{30}"
            @props.redux.getTable('account').set(profile : {image: gravatar_url})
        else
            @props.redux.getTable('account').set(profile : {image: ""})

    render_gravatar_button: ->
        <Button bsStyle='info' onClick={=>@setState(show_instructions:true)}>
            Set Gravatar...
        </Button>

    render_instruction_well: ->
        <Well style={marginTop:'10px', marginBottom:'10px'}>
            Go to the <a href="https://en.gravatar.com" target="_blank"> Wordpress Gravatar site </a> and
            sign in (or create an account) using {@props.email_address}.
            <br/><br/>
            <br/><br/>
            <Button onClick={=>@setState(show_instructions:false)}>
                Close
            </Button>
        </Well>

    render_set_gravatar: ->
        <Row>
            <Col md=6 key='checkbox'>
                <Checkbox
                    ref      = "checkbox"
                    checked  = {!!@props.profile.get('image')}
                    onChange = {@onGravatarSelect}>
                    Use gravatar
                </Checkbox>
            </Col>
            <Col md=6 key='set'>
                {@render_gravatar_button() if not @state.show_instructions}
            </Col>
        </Row>

    render_header: ->
        <h2>
            <Avatar
                account_id = {@props.account_id}
                size       = 40
            />
            <Space />
            <Space />
            Profile
        </h2>

    render: ->
        if not @props.account_id? or not @props.profile?
            return <Loading />
        <Panel header={@render_header()}>
            <LabeledRow label='Color'>
                <ColorPicker color={@props.profile.get('color')} style={maxWidth:"150px"} onChange={@onColorChange}/>
            </LabeledRow>
            <LabeledRow label='Color'>
                {if @state.show_instructions then @render_instruction_well() else @render_set_gravatar()}
             </LabeledRow>
        </Panel>

# WARNING: in console.coffee there is also code to set the font size,
# which our store ignores...
TerminalSettings = rclass
    displayName : 'Account-TerminalSettings'

    propTypes :
        terminal : rtypes.object
        redux    : rtypes.object

    handleChange: (obj) ->
        @props.redux.getTable('account').set(terminal: obj)

    render: ->
        if not @props.terminal?
            return <Loading />
        <Panel header={<h2> <Icon name='terminal' /> Terminal <span className='lighten'>(settings applied to newly opened terminals)</span></h2>}>
            <LabeledRow label='Terminal font size'>
                <NumberInput
                    on_change = {(font_size)=>@handleChange(font_size:font_size)}
                    min       = 3
                    max       = 80
                    number    = {@props.terminal.font_size}
                    unit      = "px" />
            </LabeledRow>
            <LabeledRow label='Terminal font family'>
                <SelectorInput
                    selected  = {@props.terminal.font}
                    options   = {TERMINAL_FONT_FAMILIES}
                    on_change = {(font)=>@handleChange(font:font)}
                />
            </LabeledRow>
            <LabeledRow label='Terminal color scheme'>
                <SelectorInput
                    selected  = {@props.terminal.color_scheme}
                    options   = {TERMINAL_COLOR_SCHEMES}
                    on_change = {(color_scheme)=>@handleChange(color_scheme : color_scheme)}
                />
            </LabeledRow>
        </Panel>

EDITOR_SETTINGS_CHECKBOXES =
    line_wrapping             : 'wrap long lines'
    line_numbers              : 'show line numbers'
    code_folding              : 'fold code using control+Q'
    smart_indent              : 'context sensitive indentation'
    electric_chars            : 'sometimes reindent current line'
    match_brackets            : 'highlight matching brackets near cursor'
    auto_close_brackets       : 'automatically close brackets'
    match_xml_tags            : 'automatically match XML tags'
    auto_close_xml_tags       : 'automatically close XML tags'
    strip_trailing_whitespace : 'remove whenever file is saved'
    show_trailing_whitespace  : 'show spaces at ends of lines'
    spaces_instead_of_tabs    : 'send 4 spaces when the tab key is pressed'
    extra_button_bar          : 'more editing functions (mainly in Sage worksheets)'

EditorSettingsCheckboxes = rclass
    displayName : 'Account-EditorSettingsCheckboxes'

    propTypes :
        editor_settings : rtypes.object.isRequired
        on_change       : rtypes.func.isRequired

    label_checkbox: (name, desc) ->
        return misc.capitalize(name.replace(/_/g,' ').replace(/-/g,' ').replace('xml','XML')) + ': ' + desc

    render_checkbox: (name, desc) ->
        <Checkbox checked  = {@props.editor_settings[name]}
               key      = {name}
               ref      = {name}
               onChange = {(e)=>@props.on_change(name, e.target.checked)}>
            {@label_checkbox(name, desc)}
        </Checkbox>

    render: ->
        <span>
            {(@render_checkbox(name, desc) for name, desc of EDITOR_SETTINGS_CHECKBOXES)}
        </span>

EditorSettingsAutosaveInterval = rclass
    displayName : 'Account-EditorSettingsAutosaveInterval'

    propTypes :
        autosave  : rtypes.number.isRequired
        on_change : rtypes.func.isRequired

    render: ->
        <LabeledRow label='Autosave interval'>
            <NumberInput
                on_change = {(n)=>@props.on_change('autosave',n)}
                min       = 15
                max       = 900
                number    = {@props.autosave}
                unit      = "seconds" />
        </LabeledRow>

EditorSettingsFontSize = rclass
    displayName : 'Account-EditorSettingsFontSize'

    propTypes :
        font_size : rtypes.number.isRequired
        on_change : rtypes.func.isRequired

    render: ->
        <LabeledRow label='Font Size'>
            <NumberInput
                on_change = {(n)=>@props.on_change('font_size',n)}
                min       = 6
                max       = 32
                number    = {@props.font_size}
                unit      = "px" />
        </LabeledRow>

EDITOR_COLOR_SCHEMES =
    'default'                 : 'Default'
    '3024-day'                : '3024 day'
    '3024-night'              : '3024 night'
    'ambiance-mobile'         : 'Ambiance mobile'
    'ambiance'                : 'Ambiance'
    'base16-dark'             : 'Base 16 dark'
    'base16-light'            : 'Base 16 light'
    'blackboard'              : 'Blackboard'
    'cobalt'                  : 'Cobalt'
    'eclipse'                 : 'Eclipse'
    'elegant'                 : 'Elegant'
    'erlang-dark'             : 'Erlang dark'
    'lesser-dark'             : 'Lesser dark'
    'the-matrix'              : 'The Matrix'
    'midnight'                : 'Midnight'
    'monokai'                 : 'Monokai'
    'neat'                    : 'Neat'
    'night'                   : 'Night'
    'paraiso-dark'            : 'Paraiso dark'
    'paraiso-light'           : 'Paraiso light'
    'pastel-on-dark'          : 'Pastel on dark'
    'rubyblue'                : 'Rubyblue'
    'solarized dark'          : 'Solarized dark'
    'solarized light'         : 'Solarized light'
    'tomorrow-night-eighties' : 'Tomorrow Night - Eighties'
    'twilight'                : 'Twilight'
    'vibrant-ink'             : 'Vibrant ink'
    'xq-dark'                 : 'Xq dark'
    'xq-light'                : 'Xq light'

EditorSettingsColorScheme = rclass
    displayName : 'Account-EditorSettingsColorScheme'

    propTypes :
        theme     : rtypes.string.isRequired
        on_change : rtypes.func.isRequired

    render: ->
        <LabeledRow label='Editor color scheme'>
            <SelectorInput
                options   = {EDITOR_COLOR_SCHEMES}
                selected  = {@props.theme}
                on_change = {@props.on_change}
            />
        </LabeledRow>

EDITOR_BINDINGS =
    standard : 'Standard'
    sublime  : 'Sublime'
    vim      : 'Vim'
    emacs    : 'Emacs'

EditorSettingsKeyboardBindings = rclass
    displayName : 'Account-EditorSettingsKeyboardBindings'

    propTypes :
        bindings  : rtypes.string.isRequired
        on_change : rtypes.func.isRequired

    render: ->
        <LabeledRow label='Editor keyboard bindings'>
            <SelectorInput
                options   = {EDITOR_BINDINGS}
                selected  = {@props.bindings}
                on_change = {@props.on_change}
            />
        </LabeledRow>

EditorSettings = rclass
    displayName : 'Account-EditorSettings'

    propTypes :
        redux    : rtypes.object
        autosave : rtypes.number
        font_size: rtypes.number
        editor_settings : rtypes.object

    on_change: (name, val) ->
        if name == 'autosave'
            @props.redux.getTable('account').set(autosave : val)
        else if name == 'font_size'
            @props.redux.getTable('account').set(font_size : val)
        else
            @props.redux.getTable('account').set(editor_settings:{"#{name}":val})

    render: ->
        if not @props.editor_settings?
            return <Loading />
        <Panel header={<h2> <Icon name='edit' /> Editor (settings apply to newly (re-)opened files)</h2>}>
            <EditorSettingsFontSize
                on_change={@on_change} font_size={@props.font_size} />
            <EditorSettingsAutosaveInterval
                on_change={@on_change} autosave={@props.autosave} />
            <EditorSettingsColorScheme
                on_change={(value)=>@on_change('theme',value)} theme={@props.editor_settings.theme} />
            <EditorSettingsKeyboardBindings
                on_change={(value)=>@on_change('bindings',value)} bindings={@props.editor_settings.bindings} />
            <EditorSettingsCheckboxes
                on_change={@on_change} editor_settings={@props.editor_settings} />
        </Panel>

KEYBOARD_SHORTCUTS =
    #'Next file tab'                : 'control+]'  # temporarily disabled since broken in many ways
    #'Previous file tab'            : 'control+['
    'Smaller text'                 : 'control+<'
    'Bigger text'                  : 'control+>'
    'Go to line'                   : 'control+L'
    'Find'                         : 'control+F'
    'Find next'                    : 'control+G'
    'Fold/unfold selected code'    : 'control+Q'
    'Shift selected text right'    : 'tab'
    'Shift selected text left'     : 'shift+tab'
    'Split view in any editor'     : 'control+I'
    'Autoindent selection'         : "control+'"
    'Multiple cursors'             : 'control+click'
    'Simple autocomplete'          : 'control+space'
    'Sage autocomplete'            : 'tab'
    'Split cell in Sage worksheet' : 'control+;'

EVALUATE_KEYS =
    'Shift-Enter' : 'shift+enter'
    'Enter'       : 'enter (shift+enter for newline)'

KeyboardSettings = rclass
    displayName : 'Account-KeyboardSettings'

    propTypes :
        redux        : rtypes.object
        evaluate_key : rtypes.string

    render_keyboard_shortcuts: ->
        for desc, shortcut of KEYBOARD_SHORTCUTS
            <LabeledRow key={desc} label={desc}>
                {shortcut}
            </LabeledRow>

    eval_change: (value) ->
        @props.redux.getTable('account').set(evaluate_key : value)

    render_eval_shortcut: ->
        if not @props.evaluate_key?
            return <Loading />
        <LabeledRow label='Sage Worksheet evaluate key'>
            <SelectorInput
                options   = {EVALUATE_KEYS}
                selected  = {@props.evaluate_key}
                on_change = {@eval_change}
            />
        </LabeledRow>

    render: ->
        <Panel header={<h2> <Icon name='keyboard-o' /> Keyboard shortcuts</h2>}>
            {@render_keyboard_shortcuts()}
            {@render_eval_shortcut()}
        </Panel>

OtherSettings = rclass
    displayName : 'Account-OtherSettings'

    propTypes :
        other_settings : rtypes.object
        redux          : rtypes.object

    on_change: (name, value) ->
        @props.redux.getTable('account').set(other_settings:{"#{name}":value})

    render_confirm: ->
        if not require('./feature').IS_MOBILE
                <Checkbox
                    checked  = {@props.other_settings.confirm_close}
                    ref      = 'confirm_close'
                    onChange = {(e)=>@on_change('confirm_close', e.target.checked)}>
                    Confirm: always ask for confirmation before closing the browser window
                </Checkbox>
    render_page_size_warning: ->
        BIG_PAGE_SIZE = 500
        if @props.other_settings.page_size > BIG_PAGE_SIZE
            <Alert bsStyle='warning'>
                Your file listing page size is set to {@props.other_settings.page_size}. Sizes above {BIG_PAGE_SIZE} may cause the file listing to render slowly for directories with lots of files.
            </Alert>

    render: ->
        if not @props.other_settings
            return <Loading />
        <Panel header={<h2> <Icon name='gear' /> Other settings</h2>}>
            {@render_confirm()}
            <Checkbox
                checked  = {@props.other_settings.mask_files}
                ref      = 'mask_files'
                onChange = {(e)=>@on_change('mask_files', e.target.checked)}
            >
                Mask files: grey-out files in the files viewer that you probably do not want to open
            </Checkbox>
            <LabeledRow label='Default file sort'>
                <SelectorInput
                    selected  = {@props.other_settings.default_file_sort}
                    options   = {time:'Sort by time', name:'Sort by name'}
                    on_change = {(value)=>@on_change('default_file_sort', value)}
                />
            </LabeledRow>
            <LabeledRow label='Number of files per page'>
                <NumberInput
                        on_change = {(n)=>@on_change('page_size',n)}
                        min       = 1
                        max       = 1000000
                        number    = {@props.other_settings.page_size} />
            </LabeledRow>
            <LabeledRow label='Standby timeout'>
                <NumberInput
                    on_change = {(n)=>@on_change('standby_timeout_m',n)}
                    min       = 1
                    max       = 180
                    unit      = "minutes"
                    number    = {@props.other_settings.standby_timeout_m} />
            </LabeledRow>
            {@render_page_size_warning()}
        </Panel>

AccountCreationToken = rclass
    displayName : 'AccountCreationToken'

    getInitialState: ->
        state : 'view'   # view --> edit --> save --> view
        token : ''
        error : ''

    edit: ->
        @setState(state:'edit')

    save: ->
        @setState(state:'save')
        token = @state.token
        salvus_client.query
            query :
                server_settings : {name:'account_creation_token',value:token}
            cb : (err) =>
                if err
                    @setState(state:'edit', error:err)
                else
                    @setState(state:'view', error:'', token:'')

    render_save_button: ->
        <Button style={marginRight:'1ex'} onClick={@save} bsStyle='success'>Save token</Button>

    render_control: ->
        switch @state.state
            when 'view'
                <Button onClick={@edit} bsStyle='warning'>Change token...</Button>
            when 'load'
                <Loading />
            when 'edit', 'save'
                <Well>
                    <form onSubmit={@save}>
                        <FormGroup>
                            <FormControl
                                ref      = 'input'
                                type     = 'text'
                                value    = {@state.token}
                                onChange = {(e)=>@setState(token:e.target.value)}}
                            />
                        </FormGroup>
                    </form>
                    {@render_save_button()}
                    <Button onClick={=>@setState(state:'view', token:'')}>Cancel</Button>
                    <br /><br />
                    (Set to empty to not require a token.)
                </Well>

    render_error: ->
        if @state.error
            <ErrorDisplay error={@state.error} onClose={=>@setState(error:'')} />

    render_save: ->
        if @state.state == 'save'
            <Saving />

    render_unsupported: ->  # see https://github.com/sagemathinc/smc/issues/333
        <div style={color:"#666"}>
            Not supported since some passport strategies are enabled.
        </div>

    render: ->
        if STRATEGIES.length > 1
            return @render_unsupported()
        <div>
             {@render_control()}
             {@render_save()}
             {@render_error()}
        </div>


StripeKeys = rclass
    displayName : 'Account-StripeKeys'

    getInitialState: ->
        state           : 'view'   # view --> edit --> save --> saved
        secret_key      : ''
        publishable_key : ''
        error           : undefined

    edit: ->
        @setState(state:'edit')

    save: ->
        @setState(state:'save')
        f = (name, cb) =>
        query = (server_settings : {name:"stripe_#{name}_key", value:@state["#{name}_key"]} for name in ['secret', 'publishable'])
        salvus_client.query
            query : query
            cb    : (err) =>
                if err
                    @setState(state:'edit', error:err)
                else
                    @setState(state:'saved', error:'', secret_key:'', publishable_key:'')

    cancel: ->
        @setState(state:'view', error:'', secret_key:'', publishable_key:'')

    render: ->
        <div>
            {@render_main()}
            {@render_error()}
        </div>

    render_main:->
        switch @state.state
            when 'view', 'saved'
                <div>
                    {"stripe keys saved!" if @state.state == 'saved'}
                    <Button bsStyle='warning' onClick={@edit}>Change stripe keys...</Button>
                </div>
            when 'save'
                <div>Saving stripe keys...</div>
            when 'edit'
                <Well>
                    <LabeledRow label='Secret key'>
                        <FormGroup>
                            <FormControl ref='input_secret_key' type='text' value={@state.secret_key}
                                onChange={(e)=>@setState(secret_key:e.target.value)} />
                        </FormGroup>
                    </LabeledRow>
                    <LabeledRow label='Publishable key'>
                        <FormGroup>
                            <FormControl ref='input_publishable_key' type='text' value={@state.publishable_key}
                                onChange={(e)=>@setState(publishable_key:e.target.value)} />
                        </FormGroup>
                    </LabeledRow>
                    <ButtonToolbar>
                        <Button bsStyle='success' onClick={@save}>Save stripe keys...</Button>
                        <Button onClick={@cancel}>Cancel</Button>
                    </ButtonToolbar>
                </Well>

    render_error: ->
        if @state.error
            <ErrorDisplay error={@state.error} onClose={=>@setState(error:'')} />

site_settings_conf = require('smc-util/schema').site_settings_conf
async = require('async')
underscore = require('underscore')
SiteSettings = rclass
    displayName : 'Account-SiteSettings'

    getInitialState: ->
        return {state :'view'}  # view --> load --> edit --> save --> view, and error

    render_error: ->
        if @state.error
            <ErrorDisplay error={@state.error} onClose={=>@setState(error:'')} />

    render: ->
        <div>
            {@render_main()}
            {@render_error()}
        </div>

    load: ->
        @setState(state:'load')
        salvus_client.query
            query :
                site_settings : [{name:null, value:null}]
            cb : (err, result) =>
                if err
                    @setState(state:'error', error:err)
                else
                    data = {}
                    for x in result.query.site_settings
                        data[x.name] = x.value
                    @setState
                        state  : 'edit'
                        error  : undefined
                        data   : data
                        edited : misc.deep_copy(data)

    render_edit_button: ->
        <Button onClick={=>@load()}>Edit...</Button>

    save: ->
        @setState(state:'save')
        f = (x, cb) =>
            salvus_client.query
                query :
                    site_settings : {name: x.name, value: x.value}
                cb : cb
        v = []
        for name, value of @state.edited
            if not underscore.isEqual(value, @state.data[name])
                v.push({name:name, value:value})
        async.map v, f, (err) =>
            if err
                @setState(state:'error', error:err)
            else
                @setState(state:'view')

    render_save_button: ->
        <Button onClick={@save}>Save</Button>

    render_row: (name, value) ->
        if not value?
            value = site_settings_conf[name].default
        conf = site_settings_conf[name]
        label = <Tip key={name} title={conf.name} tip={conf.desc}>{conf.name}</Tip>
        <LabeledRow key={name} label={label}>
            <FormGroup>
                <FormControl ref={name} type='text' value={value}
                    onChange={=>e = misc.copy(@state.edited); e[name]=ReactDOM.findDOMNode(@refs[name]).value; @setState(edited:e)} />
            </FormGroup>
        </LabeledRow>

    render_editor: ->
        for name in misc.keys(site_settings_conf)
            @render_row(name, @state.edited[name])

    render_main: ->
        switch @state.state
            when 'view'
                @render_edit_button()
            when 'edit'
                <Well>
                    {@render_editor()}
                    {@render_save_button()}
                </Well>
            when 'save'
                <div>Saving site configuration...</div>
            when 'load'
                <div>Loading site configuration...</div>

SystemMessage = rclass
    displayName : 'Account-SystemMessage'

    reduxProps :
        system_notifications :
            notifications : rtypes.immutable

    getInitialState: ->
        return {state :'view'}  # view <--> edit

    render_buttons: ->
        open = 0
        @props.notifications.map (mesg, id) ->
            if not mesg.get('done')
                open += 1
        <ButtonToolbar>
            <Button onClick={=>@setState(state:'edit')}>Compose...</Button>
            {<Button onClick={@mark_all_done}>Mark {open} {misc.plural(open, 'notification')} done</Button> if open > 0}
            {<Button disabled=true>No outstanding notifications</Button> if open == 0}
        </ButtonToolbar>


    render_editor: ->
        <Well>
            <FormGroup>
                <FormControl
                    autoFocus
                    value={@state.mesg}
                    ref='input'
                    rows=3
                    componentClass='textarea'
                    onChange={=>@setState(mesg:ReactDOM.findDOMNode(@refs.input).value)}
                />
            </FormGroup>
            <ButtonToolbar>
                <Button onClick={@send} bsStyle="danger"><Icon name='paper-plane-o'/> Send</Button>
                <Button onClick={=>@setState(state:'view')}>Cancel</Button>
            </ButtonToolbar>
        </Well>

    send: ->
        @setState(state:'view')
        mesg = @state.mesg?.trim()  # mesg need not be defined
        if mesg
            redux.getActions('system_notifications').send_message
                text     : mesg
                priority : 'high'

    mark_all_done: ->
        redux.getActions('system_notifications').mark_all_done()

    render: ->
        if not @props.notifications?
            return <Loading/>
        switch @state.state
            when 'view'
                @render_buttons()
            when 'edit'
                @render_editor()

AddStripeUser = rclass
    displayName : 'Account-AddStripeUser'

    getInitialState: ->
        email : ''
        status: ''

    status_mesg: (s) ->
        @setState(status:@state.status + (if @state.status then '\n' else '') + s.trim())

    add_stripe_user: ->
        email = @state.email
        if not email
            # nothing to do -- shouldn't happen since button should be disabled.
            return false

        @status_mesg("Adding #{email}...")
        @setState(email: '')
        salvus_client.stripe_admin_create_customer
            email_address : email
            cb            : (err, mesg) =>
                if err
                    @status_mesg("Error: #{misc.to_json(err)}")
                else
                    @status_mesg("Successfully added #{email}")

        return false

    render_form: ->
        <form onSubmit={(e)=>e.preventDefault();@add_stripe_user()}>
            <Row>
                <Col md=6>
                    <FormGroup>
                        <FormControl
                            ref   = 'input'
                            type  = 'text'
                            value = {@state.email}
                            placeholder = "Email address"
                            onChange    = {=>@setState(email:ReactDOM.findDOMNode(@refs.input).value)}
                        />
                    </FormGroup>
                </Col>
                <Col md=6>
                    <Button bsStyle='warning' disabled={not misc.is_valid_email_address(@state.email)} onClick={@add_stripe_user}>Add User to Stripe</Button>
                </Col>
            </Row>
        </form>

    render_status: ->
        if not @state.status
            return
        <div>
            <pre>{@state.status}</pre>
            <Button onClick={=>@setState(status:'')}>Clear</Button>
        </div>

    render: ->
        <div>
            {@render_form()}
            {@render_status()}
        </div>

AdminSettings = rclass
    propTypes :
        groups : rtypes.array

    render: ->
        if not @props.groups? or 'admin' not in @props.groups
            return <span />

        add_stripe_label = <Tip title="Add Stripe User" tip="Make it so the SMC user with the given email address has a corresponding stripe identity, even if they have never entered a credit card.  You'll need this if you want to directly create a plan for them in Stripe.">Add Stripe Users</Tip>

        <Panel header={<h2> <Icon name='users' /> Administrative server settings</h2>}>
            <LabeledRow label='Account Creation Token'>
                <AccountCreationToken />
            </LabeledRow>
            <LabeledRow label='Stripe API Keys' style={marginTop:'15px'}>
                <StripeKeys />
            </LabeledRow>
            <LabeledRow label='Site Settings' style={marginTop:'15px'}>
                <SiteSettings />
            </LabeledRow>
            <LabeledRow label='System Notifications' style={marginTop:'15px'}>
            <SystemMessage />
            </LabeledRow>
            <LabeledRow label={add_stripe_label} style={marginTop:'15px'}>
            <AddStripeUser />
            </LabeledRow>
        </Panel>

# Render the entire settings component
exports.AccountSettingsTop = rclass
    displayName : 'AccountSettingsTop'

    propTypes :
        redux           : rtypes.object
        first_name      : rtypes.string
        last_name       : rtypes.string
        email_address   : rtypes.string
        passports       : rtypes.object
        show_sign_out   : rtypes.bool
        sign_out_error  : rtypes.string
        everywhere      : rtypes.bool
        terminal        : rtypes.object
        evaluate_key    : rtypes.string
        autosave        : rtypes.number
        font_size       : rtypes.number
        editor_settings : rtypes.object
        other_settings  : rtypes.object
        groups          : rtypes.array

    render: ->
        <div style={marginTop:'1em'}>
            <Row>
                <Col xs=12 md=6>
                    <AccountSettings
                        first_name     = {@props.first_name}
                        last_name      = {@props.last_name}
                        email_address  = {@props.email_address}
                        passports      = {@props.passports}
                        show_sign_out  = {@props.show_sign_out}
                        sign_out_error = {@props.sign_out_error}
                        everywhere     = {@props.everywhere}
                        redux          = {@props.redux} />
                    <TerminalSettings
                        terminal = {@props.terminal}
                        redux    = {@props.redux} />
                    <KeyboardSettings
                        evaluate_key = {@props.evaluate_key}
                        redux        = {@props.redux} />
                </Col>
                <Col xs=12 md=6>
                    <EditorSettings
                        autosave        = {@props.autosave}
                        font_size       = {@props.font_size}
                        editor_settings = {@props.editor_settings}
                        redux           = {@props.redux} />
                    <OtherSettings
                        other_settings  = {@props.other_settings}
                        redux           = {@props.redux} />
                    <ProfileSettings
                        email_address = {@props.email_address}
                        first_name    = {@props.first_name}
                        last_name     = {@props.last_name}
                        redux         = {@props.redux} />
                    <AdminSettings groups={@props.groups} />
                </Col>
            </Row>
            <Footer/>
        </div>

STRATEGIES = ['email']
f = () ->
    $.get "#{window.smc_base_url}/auth/strategies", (strategies, status) ->
        if status == 'success'
            STRATEGIES = strategies
            # OPTIMIZATION: this forces re-render of the strategy part of the component above!
            # It should directly depend on the store, but instead right now still
            # depends on STRATEGIES.
            redux.getActions('account').setState(strategies:strategies)
        else
            setTimeout(f, 60000)
f()

ugly_error = (err) ->
    if typeof(err) != 'string'
        err = misc.to_json(err)
    require('./alerts').alert_message(type:"error", message:"Settings error -- #{err}")

# returns password score if password checker library
# loaded; otherwise returns undefined and starts load
zxcvbn = undefined
password_score = (password) ->
    return  # temporary until loading iof zxcvbn below is fixed. See https://github.com/sagemathinc/smc/issues/687
    # if the password checking library is loaded, render a password strength indicator -- otherwise, don't
    if zxcvbn?
        if zxcvbn != 'loading'
            # explicitly ban some words.
            return zxcvbn(password, ['sagemath','salvus','sage','sagemathcloud','smc','mathematica','pari'])
    else
        zxcvbn = 'loading'
        require.ensure [], =>
            zxcvbn = require("script!zxcvbn/zxcvbn.js")
            # $.getScript '/static/zxcvbn/zxcvbn.js', () =>
            #    zxcvbn = window.zxcvbn
    return