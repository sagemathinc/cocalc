##############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
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

{React, ReactDOM, rtypes, rclass, redux}  = require('./app-framework')

{Button, ButtonToolbar, Checkbox, Panel, Grid, Row, Col, FormControl, FormGroup, Well, Modal, ProgressBar, Alert, Radio} = require('react-bootstrap')

{ErrorDisplay, Icon, LabeledRow, Loading, NumberInput, Saving, SelectorInput, Tip, Footer, Space} = require('./r_misc')

{SiteName} = require('./customize')

{ColorPicker} = require('./colorpicker')
{Avatar} = require('./other-users')
{ProfileImageSelector} = require('./r_profile_image')

md5 = require('md5')

misc       = require('smc-util/misc')

smc_version = require('smc-util/smc-version')

{webapp_client} = require('./webapp_client')

{PROJECT_UPGRADES} = require('smc-util/schema')

{APIKeySetting} = require('./api-key')


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


EmailVerification = rclass
    displayName : 'Account-EmailVerification'

    propTypes :
        account_id             : rtypes.string
        email_address          : rtypes.string
        email_address_verified : rtypes.immutable.Map

    getInitialState: ->
        disabled_button : false

    componentWillReceiveProps: (next) ->
        if next.email_address != @props.email_address
            @setState(disabled_button: false)

    verify : ->
        webapp_client.send_verification_email
            account_id         : @props.account_id
            cb                 : (err, resp) =>
                @setState(disabled_button: true)
                if not err and resp.error?
                    err = resp.error
                if err
                    console.log("TODO: error sending email verification: #{err}")

    test : ->
        if not @props.email_address?
            <span>Unkown</span>
        else
            if @props.email_address_verified?.get(@props.email_address)
                <span style={color: 'green'}>Verified</span>
            else
                [
                    <span key={1} style={color: 'red', paddingRight: '3em'}>Not Verified</span>
                    <Button
                        key        = {2}
                        onClick    = {@verify}
                        bsStyle    = 'success'
                        disabled   = {@state.disabled_button}
                    >
                        {
                            if @state.disabled_button
                                'Email sent'
                            else
                                'Send verification email'
                        }
                    </Button>
                ]

    render : ->
        <LabeledRow label='Email verification' style={marginBottom: '15px'}>
            <div>
                Status: {@test()}
            </div>
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
        webapp_client.change_email
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
                    maxLength   = {254}
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
        <LabeledRow label='Email address'  style={marginBottom: '15px'}>
            <div>
                {@props.email_address}
                <Button className='pull-right'  disabled={@state.state != 'view'} onClick={@start_editing}>Change email...</Button>
            </div>
            {@render_edit() if @state.state != 'view'}
        </LabeledRow>

NewsletterSetting = rclass
    displayName : 'Account-NewsletterSetting'

    propTypes :
        other_settings : rtypes.object
        email_address  : rtypes.string
        redux          : rtypes.object

    on_change: (value) ->
        @props.redux.getTable('account').set({"other_settings": {"newsletter" : value}})

    blog: ->
        {BLOG_URL} = require('smc-util/theme')
        return if not BLOG_URL
        return <span>(<a href={BLOG_URL} target="_blank">check out our blog</a>)</span>

    render_checkbox: ->
        <Checkbox
            style    = {margin: '0'}
            checked  = {@props.other_settings.get('newsletter')}
            ref      = 'newsletter'
            onChange = {(e)=>@on_change(e.target.checked)}
        >
            <span>
                Receive periodic updates {@blog()}
                <br/>
                (Changes take up to 24 hours to be effective.)
            </span>
        </Checkbox>

    render: ->
        has_email = @props.email_address?.length > 0
        <LabeledRow label='Newsletter'  style={marginBottom: '15px'}>
        {
            if has_email
                @render_checkbox()
            else
                <span style={fontWeight: 'bold'}>
                    You need to enter an email address above!
                </span>
        }
        </LabeledRow>

PasswordSetting = rclass
    displayName : 'Account-PasswordSetting'

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
        webapp_client.change_password
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
                Current password <span color='#888'>(leave blank if you have not set a password)</span>
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
        <LabeledRow label='Password' style={marginBottom: '15px'}>
            <div style={height:'30px'}>
                <Button className='pull-right' disabled={@state.state != 'view'} onClick={@change_password}>
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
        account_id             : rtypes.string
        first_name             : rtypes.string
        last_name              : rtypes.string
        email_address          : rtypes.string
        email_address_verified : rtypes.immutable.Map
        passports              : rtypes.immutable.Map
        show_sign_out          : rtypes.bool
        sign_out_error         : rtypes.string
        everywhere             : rtypes.bool
        redux                  : rtypes.object
        delete_account_error   : rtypes.string
        other_settings         : rtypes.object

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
                <Button href={"#{window.app_base_url}/auth/#{@state.add_strategy_link}"} target="_blank"
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
        for k, _ of @props.passports?.toJS() ? {}
            if misc.startswith(k, strategy)
                id = k.split('-')[1]
                break
        if not id
            return
        webapp_client.unlink_passport
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
        if @props.passports?.size <= 1 and not @props.email_address
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
                <Button onClick={=>@actions('account').setState(show_sign_out : false)}>
                    Cancel
                </Button>
            </ButtonToolbar>
            {@render_sign_out_error() if @props.sign_out_error}
        </Well>

    render_sign_out_buttons: ->
        <ButtonToolbar className='pull-right'>
            <Button bsStyle='warning' disabled={@props.show_sign_out and not @props.everywhere}
                onClick={=>@actions('account').setState(show_sign_out : true, everywhere : false, sign_out_error:undefined)}>
                <Icon name='sign-out'/> Sign out...
            </Button>
            <Button bsStyle='warning' disabled={@props.show_sign_out and @props.everywhere}
                onClick={=>@actions('account').setState(show_sign_out : true, everywhere : true, sign_out_error:undefined)}>
                <Icon name='sign-out'/> Sign out everywhere...
            </Button>
        </ButtonToolbar>

    render_sign_in_strategies: ->
        if not STRATEGIES? or STRATEGIES.length <= 1
            return
        strategies = (x.slice(0,x.indexOf('-')) for x in misc.keys(@props.passports?.toJS() ? {}))
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
                maxLength = {254}
                />
            <TextSetting
                label    = 'Last name'
                value    = {@props.last_name}
                ref      = 'last_name'
                onChange = {(e)=>@handle_change(e, 'last_name')}
                onBlur   = {(e)=>@save_change(e, 'last_name')}
                maxLength = {254}
                />
            <EmailAddressSetting
                email_address = {@props.email_address}
                redux         = {@props.redux}
                ref           = 'email_address'
                maxLength     = {254}
                />
            <EmailVerification
                account_id             = {@props.account_id}
                email_address          = {@props.email_address}
                email_address_verified = {@props.email_address_verified}
                ref                    = 'email_address_verified'
                />
            <NewsletterSetting
                redux          = {@props.redux}
                email_address  = {@props.email_address}
                other_settings = {@props.other_settings}
                />
            <PasswordSetting
                ref   = 'password'
                maxLength = {64}
                />
            <APIKeySetting />
            <Row style={marginTop: '15px', borderTop: '1px solid #ccc', paddingTop: '15px'}>
                <Col xs={12}>
                    {@render_sign_out_buttons()}
                </Col>
            </Row>
            {@render_sign_out_confirm() if @props.show_sign_out}
            <Row>
                <Col xs={12}>
                    <DeleteAccount
                        style={marginTop:'1ex'}
                        initial_click = {=>@setState(show_delete_confirmation:true)}
                        confirm_click = {=>@actions('account').delete_account()}
                        cancel_click  = {=>@setState(show_delete_confirmation:false)}
                        user_name     = {(@props.first_name + ' ' + @props.last_name).trim()}
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
                    disabled  = {@props.show_confirmation}
                    className = 'pull-right'
                    bsStyle   = 'danger'
                    style     = {@props.style}
                    onClick   = {@props.initial_click}
                >
                <Icon name='trash' /> Delete Account...
                </Button>
            </div>
            {<DeleteAccountConfirmation
                confirm_click = {@props.confirm_click}
                cancel_click  = {@props.cancel_click}
                required_text = {@props.user_name}
             /> if @props.show_confirmation}
        </div>

# Concious choice to make them actually click the confirm delete button.
DeleteAccountConfirmation = rclass
    displayName : 'Account-DeleteAccountConfirmation'

    propTypes:
        confirm_click : rtypes.func.isRequired
        cancel_click  : rtypes.func.isRequired
        required_text : rtypes.string.isRequired

    reduxProps:
        account :
            account_deletion_error : rtypes.string

    # Loses state on rerender from cancel. But this is what we want.
    getInitialState: ->
        confirmation_text : ''

    render_error: ->
        if not @props.account_deletion_error?
            return
        <ErrorDisplay error={@props.account_deletion_error} />

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
                    ref         = 'confirmation_field'
                    onChange    = {=>@setState(confirmation_text : ReactDOM.findDOMNode(@refs.confirmation_field).value)}
                    style       = {marginTop : '1ex'}
                />
            </FormGroup>
            <ButtonToolbar style={textAlign: 'center', marginTop: '15px'}>
                <Button
                    disabled = {@state.confirmation_text != @props.required_text}
                    bsStyle  = 'danger'
                    onClick  = {=>@props.confirm_click()}
                >
                    <Icon name='trash' /> Confirm Account Deletion
                </Button>
                <Button
                    style   = {paddingRight:'8px'}
                    bsStyle = 'primary'
                    onClick = {@props.cancel_click}
                >
                    Cancel
                </Button>
            </ButtonToolbar>
            {@render_error()}
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
            profile    : rtypes.immutable.Map

    getInitialState: ->
        show_instructions : false

    onColorChange: (value) ->
        @props.redux.getTable('account').set(profile : {color: value})

    render_header: ->
        <h2>
            <Avatar
                account_id = {@props.account_id}
                size       = {40}
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
            <LabeledRow label='Picture'>
                <ProfileImageSelector
                    account_id={@props.account_id}
                    email_address={@props.email_address}
                    redux={@props.redux}
                    profile={@props.profile}
                />
             </LabeledRow>
        </Panel>

# WARNING: in console.coffee there is also code to set the font size,
# which our store ignores...
TerminalSettings = rclass
    displayName : 'Account-TerminalSettings'

    propTypes :
        terminal : rtypes.immutable.Map
        redux    : rtypes.object

    shouldComponentUpdate: (props) ->
        return @props.terminal != props.terminal

    handleChange: (obj) ->
        @props.redux.getTable('account').set(terminal: obj)

    render: ->
        if not @props.terminal?
            return <Loading />
        <Panel header={<h2> <Icon name='terminal' /> Terminal settings <span className='lighten'>(applied to newly opened terminals)</span></h2>}>
            <LabeledRow label='Terminal font size'>
                <NumberInput
                    on_change = {(font_size)=>@handleChange(font_size:font_size)}
                    min       = {3}
                    max       = {80}
                    number    = {@props.terminal.get('font_size')}
                    unit      = "px" />
            </LabeledRow>
            <LabeledRow label='Terminal font family'>
                <SelectorInput
                    selected  = {@props.terminal.get('font')}
                    options   = {TERMINAL_FONT_FAMILIES}
                    on_change = {(font)=>@handleChange(font:font)}
                />
            </LabeledRow>
            <LabeledRow label='Terminal color scheme'>
                <SelectorInput
                    selected  = {@props.terminal.get('color_scheme')}
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
    auto_close_latex          : 'automatically close LaTeX environments'
    strip_trailing_whitespace : 'remove whenever file is saved'
    show_trailing_whitespace  : 'show spaces at ends of lines'
    spaces_instead_of_tabs    : 'send spaces when the tab key is pressed'
    extra_button_bar          : 'more editing functions (mainly in Sage worksheets)'
    build_on_save             : 'build LaTex file whenever it is saved to disk'
    show_exec_warning         : 'warn that certain files are not directly executable'
    jupyter_classic           : <span>use classical Jupyter notebook <a href='https://github.com/sagemathinc/cocalc/wiki/JupyterClassicModern' target='_blank'>(DANGER: this can cause trouble...)</a></span>

EditorSettingsCheckboxes = rclass
    displayName : 'Account-EditorSettingsCheckboxes'

    propTypes :
        editor_settings : rtypes.immutable.Map.isRequired
        on_change       : rtypes.func.isRequired

    shouldComponentUpdate: (props) ->
        return @props.editor_settings != props.editor_settings

    label_checkbox: (name, desc) ->
        <span>
            {misc.capitalize(name.replace(/_/g,' ').replace(/-/g,' ').replace('xml','XML').replace('latex','LaTeX')) + ': '}
            {desc}
        </span>

    render_checkbox: (name, desc) ->
        <Checkbox checked  = {@props.editor_settings.get(name)}
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
                min       = {15}
                max       = {900}
                number    = {@props.autosave}
                unit      = "seconds" />
        </LabeledRow>

EditorSettingsIndentSize = rclass
    displayName : 'Account-EditorSettings-IndentSize'

    propTypes :
        tab_size  : rtypes.number.isRequired
        on_change : rtypes.func.isRequired

    render: ->
        <LabeledRow label='Indent size'>
            <NumberInput
                on_change = {(n)=>@props.on_change('tab_size',n)}
                min       = {1}
                max       = {10}
                number    = {@props.tab_size} />
        </LabeledRow>



EditorSettingsFontSize = rclass
    displayName : 'Account-EditorSettingsFontSize'

    propTypes :
        font_size : rtypes.number.isRequired
        on_change : rtypes.func.isRequired

    render: ->
        <LabeledRow label='Font Size' className='cc-account-prefs-font-size'>
            <NumberInput
                on_change = {(n)=>@props.on_change('font_size',n)}
                min       = {6}
                max       = {32}
                number    = {@props.font_size}
                unit      = "px" />
        </LabeledRow>

EDITOR_COLOR_SCHEMES =
    'default'                 : 'Default'
    '3024-day'                : '3024 day'
    '3024-night'              : '3024 night'
    'abcdef'                  : 'abcdef'
    'ambiance-mobile'         : 'Ambiance mobile'
    'ambiance'                : 'Ambiance'
    'base16-dark'             : 'Base 16 dark'
    'base16-light'            : 'Base 16 light'
    'bespin'                  : 'Bespin'
    'blackboard'              : 'Blackboard'
    'cobalt'                  : 'Cobalt'
    'colorforth'              : 'Colorforth'
    'darcula'                 : 'Darcula'
    'dracula'                 : 'Dracula'
    'duotone-dark'            : 'Duotone Dark'
    'duotone-light'           : 'Duotone Light'
    'eclipse'                 : 'Eclipse'
    'elegant'                 : 'Elegant'
    'erlang-dark'             : 'Erlang dark'
    'gruvbox-dark'            : 'Gruvbox-Dark'
    'hopscotch'               : 'Hopscotch'
    'icecoder'                : 'Icecoder'
    'idea'                    : 'Idea'
    'isotope'                 : 'Isotope'
    'lesser-dark'             : 'Lesser dark'
    'liquibyte'               : 'Liquibyte'
    'lucario'                 : 'Lucario'
    'the-matrix'              : 'The Matrix'
    'material'                : 'Material'
    'mbo'                     : 'mbo'
    'mdn-like'                : 'MDN like'
    'midnight'                : 'Midnight'
    'monokai'                 : 'Monokai'
    'neat'                    : 'Neat'
    'neo'                     : 'Neo'
    'night'                   : 'Night'
    'oceanic-next'            : 'Oceanic next'
    'panda-syntax'            : 'Panda syntax'
    'paraiso-dark'            : 'Paraiso dark'
    'paraiso-light'           : 'Paraiso light'
    'pastel-on-dark'          : 'Pastel on dark'
    'railscasts'              : 'Railscasts'
    'rubyblue'                : 'Rubyblue'
    'seti'                    : 'Seti'
    'shadowfox'               : 'Shadowfox'
    'solarized dark'          : 'Solarized dark'
    'solarized light'         : 'Solarized light'
    'ssms'                    : 'ssms'
    'tomorrow-night-bright'   : 'Tomorrow Night - Bright'
    'tomorrow-night-eighties' : 'Tomorrow Night - Eighties'
    'ttcn'                    : 'ttcn'
    'twilight'                : 'Twilight'
    'vibrant-ink'             : 'Vibrant ink'
    'xq-dark'                 : 'Xq dark'
    'xq-light'                : 'Xq light'
    'yeti'                    : 'Yeti'
    'zenburn'                 : 'Zenburn'


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
        redux           : rtypes.object
        autosave        : rtypes.number
        tab_size        : rtypes.number
        font_size       : rtypes.number
        editor_settings : rtypes.immutable.Map

    shouldComponentUpdate: (props) ->
        return misc.is_different(@props, props, ['autosave', 'font_size', 'editor_settings', 'tab_size'])

    on_change: (name, val) ->
        if name == 'autosave' or name == 'font_size'
            @props.redux.getTable('account').set("#{name}" : val)
        else
            @props.redux.getTable('account').set(editor_settings:{"#{name}":val})

    render: ->
        if not @props.editor_settings?
            return <Loading />
        <Panel header={<h2> <Icon name='edit' /> Editor settings</h2>}>
            <EditorSettingsFontSize
                on_change={@on_change} font_size={@props.font_size} />
            <EditorSettingsAutosaveInterval
                on_change={@on_change} autosave={@props.autosave} />
            <EditorSettingsIndentSize
                on_change={@on_change} tab_size={@props.tab_size} />
            <EditorSettingsColorScheme
                on_change={(value)=>@on_change('theme',value)} theme={@props.editor_settings.get('theme')} />
            <EditorSettingsKeyboardBindings
                on_change={(value)=>@on_change('bindings',value)} bindings={@props.editor_settings.get('bindings')} />
            <EditorSettingsCheckboxes
                on_change={@on_change} editor_settings={@props.editor_settings} />
        </Panel>

KEYBOARD_SHORTCUTS =
    #'Next file tab'                : 'control+]'  # temporarily disabled since broken in many ways
    #'Previous file tab'            : 'control+['
    'Build project / run code'     : 'shift+enter; alt+t; command+t'
    'Smaller text'                 : 'control+<'
    'Bigger text'                  : 'control+>'
    'Toggle comment'               : 'control+/'
    'Go to line'                   : 'control+L'
    'Find'                         : 'control+F'
    'Find next'                    : 'control+G'
    'Fold/unfold selected code'    : 'control+Q'
    'Shift selected text right'    : 'tab'
    'Shift selected text left'     : 'shift+tab'
    'Split view in any editor'     : 'control+I'
    'Autoindent selection'         : "control+'"
    'Format code (use Prettier)'   : 'control+shift+F'
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
        redux              : rtypes.object
        other_settings     : rtypes.immutable.Map
        is_stripe_customer : rtypes.bool

    on_change: (name, value) ->
        @props.redux.getTable('account').set(other_settings:{"#{name}":value})

    toggle_global_banner: (val) ->
        if val
            # this must be null, not undefined. no idea why...
            @on_change('show_global_info2', null)
        else
            @on_change('show_global_info2', webapp_client.server_time())

    render_first_steps: ->
        <Checkbox
            checked  = {!!@props.other_settings.get('first_steps')}
            ref      = 'first_steps'
            onChange = {(e)=>@on_change('first_steps', e.target.checked)}
        >
            Offer to setup the "First Steps" guide (if available).
        </Checkbox>

    render_global_banner: ->
        <Checkbox
            checked  = {!@props.other_settings.get('show_global_info2')}
            ref      = 'global_banner'
            onChange = {(e)=>@toggle_global_banner(e.target.checked)}
        >
            Show announcement banner (only shows up if there is a message)
        </Checkbox>

    render_time_ago_absolute: ->
        <Checkbox
            checked  = {!!@props.other_settings.get('time_ago_absolute')}
            ref      = 'time_ago_absolute'
            onChange = {(e)=>@on_change('time_ago_absolute', e.target.checked)}
        >
            Display timestamps as absolute points in time – otherwise they are relative to the current time.
        </Checkbox>

    render_katex: ->
        <Checkbox
            checked  = {!!@props.other_settings.get('katex')}
            ref      = 'katex'
            onChange = {(e)=>@on_change('katex', e.target.checked)}
        >
            KaTeX: render using <a href="https://khan.github.io/KaTeX/" target="_blank">KaTeX</a> when possible, instead of <a href="https://www.mathjax.org/" target="_blank">MathJax</a>
        </Checkbox>

    render_confirm: ->
        if not require('./feature').IS_MOBILE
            <Checkbox
                checked  = {!!@props.other_settings.get('confirm_close')}
                ref      = 'confirm_close'
                onChange = {(e)=>@on_change('confirm_close', e.target.checked)}
            >
                Confirm: always ask for confirmation before closing the browser window
            </Checkbox>

    render_page_size_warning: ->
        BIG_PAGE_SIZE = 500
        if @props.other_settings.get('page_size') > BIG_PAGE_SIZE
            <Alert bsStyle='warning'>
                Your file listing page size is set to {@props.other_settings.get('page_size')}. Sizes above {BIG_PAGE_SIZE} may cause the file listing to render slowly for directories with lots of files.
            </Alert>

    render_standby_timeout: ->
        if require('./feature').IS_TOUCH
            return
        <LabeledRow label='Standby timeout'>
            <NumberInput
                on_change = {(n)=>@on_change('standby_timeout_m',n)}
                min       = {1}
                max       = {180}
                unit      = "minutes"
                number    = {@props.other_settings.get('standby_timeout_m')} />
        </LabeledRow>

    render_mask_files: ->
        <Checkbox
            checked  = {!!@props.other_settings.get('mask_files')}
            ref      = 'mask_files'
            onChange = {(e)=>@on_change('mask_files', e.target.checked)}
        >
            Mask files: grey-out files in the files viewer that you probably do not want to open
        </Checkbox>

    render_default_file_sort: ->
        <LabeledRow label='Default file sort'>
            <SelectorInput
                selected  = {@props.other_settings.get('default_file_sort')}
                options   = {time:'Sort by time', name:'Sort by name'}
                on_change = {(value)=>@on_change('default_file_sort', value)}
            />
        </LabeledRow>

    render_page_size: ->
        <LabeledRow label='Number of files per page'>
            <NumberInput
                    on_change = {(n)=>@on_change('page_size',n)}
                    min       = {1}
                    max       = {1000000}
                    number    = {@props.other_settings.get('page_size')} />
        </LabeledRow>

    render_no_free_warnings: ->
        if not @props.is_stripe_customer
            extra = <span>(only available to customers)</span>
        else
            extra = <span>(thanks for being a customer)</span>
        <Checkbox
            disabled = {not @props.is_stripe_customer}
            checked  = {!!@props.other_settings.get('no_free_warnings')}
            ref      = 'no_free_warnings'
            onChange = {(e)=>@on_change('no_free_warnings', e.target.checked)}
        >
            Hide free warnings: do <b><i>not</i></b> show a warning banner when using a free trial project {extra}
        </Checkbox>

    render: ->
        if not @props.other_settings
            return <Loading />
        <Panel header={<h2> <Icon name='gear' /> Other settings</h2>}>
            {@render_confirm()}
            {@render_first_steps()}
            {@render_global_banner()}
            {@render_time_ago_absolute()}
            {### @render_katex() ###}
            {@render_mask_files()}
            {@render_no_free_warnings()}
            {@render_default_file_sort()}
            {@render_page_size()}
            {@render_standby_timeout()}
            {@render_page_size_warning()}
        </Panel>



AdminSettings = rclass
    propTypes :
        groups : rtypes.immutable.List

    render: ->
        if not @props.groups?.contains('admin')
            return <span />

        <Panel header={<h2> <Icon name='users' /> Administrative server settings</h2>}>
            Moved to the new Admin top level page.
        </Panel>

# Render the entire settings component
exports.AccountSettingsTop = rclass
    displayName : 'AccountSettingsTop'

    propTypes :
        redux                  : rtypes.object
        account_id             : rtypes.string
        first_name             : rtypes.string
        last_name              : rtypes.string
        email_address          : rtypes.string
        email_address_verified : rtypes.immutable.Map
        passports              : rtypes.immutable.Map
        show_sign_out          : rtypes.bool
        sign_out_error         : rtypes.string
        everywhere             : rtypes.bool
        terminal               : rtypes.immutable.Map
        evaluate_key           : rtypes.string
        autosave               : rtypes.number
        tab_size               : rtypes.number
        font_size              : rtypes.number
        editor_settings        : rtypes.immutable.Map
        other_settings         : rtypes.immutable.Map
        groups                 : rtypes.immutable.List
        stripe_customer        : rtypes.immutable.Map

    render: ->
        <div style={marginTop:'1em'}>
            <Row>
                <Col xs={12} md={6}>
                    <AccountSettings
                        account_id             = {@props.account_id}
                        first_name             = {@props.first_name}
                        last_name              = {@props.last_name}
                        email_address          = {@props.email_address}
                        email_address_verified = {@props.email_address_verified}
                        passports              = {@props.passports}
                        show_sign_out          = {@props.show_sign_out}
                        sign_out_error         = {@props.sign_out_error}
                        everywhere             = {@props.everywhere}
                        other_settings         = {@props.other_settings}
                        redux                  = {@props.redux} />
                    <TerminalSettings
                        terminal = {@props.terminal}
                        redux    = {@props.redux} />
                    <KeyboardSettings
                        evaluate_key = {@props.evaluate_key}
                        redux        = {@props.redux} />
                </Col>
                <Col xs={12} md={6}>
                    <EditorSettings
                        autosave        = {@props.autosave}
                        tab_size        = {@props.tab_size}
                        font_size       = {@props.font_size}
                        editor_settings = {@props.editor_settings}
                        redux           = {@props.redux} />
                    <OtherSettings
                        other_settings     = {@props.other_settings}
                        is_stripe_customer = {@props.stripe_customer?}
                        redux              = {@props.redux} />
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
    $.get "#{window.app_base_url}/auth/strategies", (strategies, status) ->
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
    return  # temporary until loading iof zxcvbn below is fixed. See https://github.com/sagemathinc/cocalc/issues/687
    # if the password checking library is loaded, render a password strength indicator -- otherwise, don't
    ###
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
    ###