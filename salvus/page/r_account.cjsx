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

{ErrorDisplay, Icon, LabeledRow, Loading, NumberInput, Saving, SelectorInput} = require('r_misc')

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
        <LabeledRow label={@props.label}>
            <Input
                type     = 'text'
                hasFeedback
                ref      = 'input'
                value    = {@props.value}
                onChange = {@props.onChange}
            />
        </LabeledRow>

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
                     <Button className="pull-right" style={marginRight:'1ex'} onClick={@startEditing}>Change email</Button>
                </div>
            when 'edit', 'saving'
                <Well>
                    <Input
                        type        = 'email_address'
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
                    {@render_saving()}
                </Well>

    render_saving: ->
        if @state.state == 'saving'
            <Saving />

    render: ->
        <LabeledRow label="Email address">
            {@render_value()}
        </LabeledRow>

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
                <Button className="pull-right" style={marginRight:'1ex'} onClick={@change_password}>Change password</Button>

            when 'edit', 'saving'
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
                    {@render_saving()}
                </Well>

    render_saving: ->
        if @state.state == 'saving'
            <Saving />

    render: ->
        <LabeledRow label="Password">
            {@render_value()}
        </LabeledRow>

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

    render_strategy: (strategy) ->
        if strategy != 'email'
            <Button key={strategy}
                   href={"/auth/#{strategy}"}
                   bsStyle={if @props.passports?[strategy]? then 'warning' else 'default'}
                   style={marginRight:'1ex'}>
                <Icon name={strategy} /> {misc.capitalize(strategy)}
            </Button>

    render_sign_in_strategies: ->
        if not STRATEGIES? or STRATEGIES.length <= 1
            return
        <div>
            <hr key='hr0' />
            {(@render_strategy(strategy) for strategy in STRATEGIES)}
            <hr key='hr1' />
            <span key='span' className="lighten">NOTE: Linked accounts are
                currently <em><strong>only</strong></em> used for sign
                in; in particular, sync is not
                yet implemented.
            </span>
        </div>

    render_strategy: (strategy) ->
        if strategy != 'email'
            <Button key={strategy}
                   href={"/auth/#{strategy}"}
                   bsStyle={if @props.passports?[strategy]? then 'warning' else 'default'}
                   style={marginRight:'1ex'}>
                <Icon name={strategy} /> {misc.capitalize(strategy)}
            </Button>

    render_sign_in_strategies: ->
        if not STRATEGIES? or STRATEGIES.length <= 1
            return
        <div>
            <hr key='hr0' />
            {(@render_strategy(strategy) for strategy in STRATEGIES)}
            <hr key='hr1' />
            <span key='span' className="lighten">NOTE: Linked accounts are
                currently <em><strong>only</strong></em> used for sign
                in; in particular, sync is not
                yet implemented.
            </span>
        </div>

    render: ->
        <Panel header={<h2> <Icon name='user' /> Account settings</h2>}>
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
            {render_sign_out_buttons()}
            {@render_sign_in_strategies()}
        </Panel>

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
        if not @props.terminal?
            return <Loading />
        <Panel header={<h2> <Icon name='terminal' /> Terminal <span className='lighten'>(settings applied to newly opened terminals)</span></h2>}>
            <LabeledRow label="Terminal font size (px)">
                <NumberInput
                    on_change = {(font_size)=>@handleChange(font_size:font_size)}
                    min       = 3
                    max       = 80
                    number    = {@props.terminal.font_size} />
            </LabeledRow>
            <LabeledRow label="Terminal font family">
                <SelectorInput
                    selected  = {@props.terminal.font}
                    options   = {TERMINAL_FONT_FAMILIES}
                    on_change = {(font)=>@handleChange(font:font)}
                />
            </LabeledRow>
            <LabeledRow label="Terminal color scheme">
                <SelectorInput
                    selected  = {@props.terminal.color_scheme}
                    options   = {TERMINAL_COLOR_SCHEMES}
                    on_change = {(color_scheme)=>@handleChange(color_scheme : color_scheme)}
                />
            </LabeledRow>
        </Panel>

EDITOR_SETTINGS_CHECKBOXES =
    line_wrapping              : "scroll or wrap long lines"
    line_numbers               : "show line numbers"
    code_folding               : "fold code using control+Q"
    smart_indent               : "context sensitive indentation"
    electric_chars             : "sometimes reindent current line"
    match_brackets             : "highlight matching brackets near cursor"
    auto_close_brackets        : "automatically close brackets"
    match_xml_tags             : "automatically match XML tags"
    auto_close_xml_tags        : "automatically close XML tags"
    delete_trailing_whitespace : "remove whenever file is saved"
    show_trailing_whitespace   : "show spaces at ends of lines"
    spaces_instead_of_tabs     : "send 4 spaces when the tab key is pressed"
    track_revisions            : "record all changes when editing files"
    extra_button_bar           : "more editing functions (mainly in Sage worksheets)"

EditorSettingsCheckboxes = rclass
    propTypes:
        editor_settings : rtypes.object.isRequired
        on_change       : rtypes.func.isRequired

    label_checkbox: (name, desc) ->
        return misc.capitalize(name.replace(/_/g,' ').replace(/-/g,' ').replace('xml','XML')) + ": " + desc

    render_checkbox: (name, desc) ->
        <Input checked  = {@props.editor_settings[name]}
               key      = {name}
               type     = 'checkbox'
               label    = {@label_checkbox(name, desc)}
               ref      = {name}
               onChange = {=>@props.on_change(name, @refs[name].getChecked())}
        />

    render: ->
        <span>
            {(@render_checkbox(name, desc) for name, desc of EDITOR_SETTINGS_CHECKBOXES)}
        </span>

EditorSettingsAutosaveInterval = rclass
    propTypes:
        autosave  : rtypes.number.isRequired
        on_change : rtypes.func.isRequired
    render: ->
        <LabeledRow label="Autosave interval (seconds)">
            <NumberInput
                on_change = {(n)=>@props.on_change('autosave',n)}
                min       = 15
                max       = 900
                number    = {@props.autosave} />
        </LabeledRow>

EDITOR_COLOR_SCHEMES =
    'default': 'Default'
    '3024-day': '3024 day'
    '3024-night': '3024 night'
    'ambiance-mobile': 'Ambiance mobile'
    'ambiance': 'Ambiance'
    'base16-dark': 'Base 16 dark'
    'base16-light': 'Base 16 light'
    'blackboard': 'Blackboard'
    'cobalt': 'Cobalt'
    'eclipse': 'Eclipse'
    'elegant': 'Elegant'
    'erlang-dark': 'Erlang dark'
    'lesser-dark': 'Lesser dark'
    'the-matrix': 'The Matrix'
    'midnight': 'Midnight'
    'monokai': 'Monokai'
    'neat': 'Neat'
    'night': 'Night'
    'paraiso-dark': 'Paraiso dark'
    'paraiso-light': 'Paraiso light'
    'pastel-on-dark': 'Pastel on dark'
    'rubyblue': 'Rubyblue'
    'solarized dark': 'Solarized dark'
    'solarized light': 'Solarized light'
    'tomorrow-night-eighties': 'Tomorrow Night - Eighties'
    'twilight': 'Twilight'
    'vibrant-ink': 'Vibrant ink'
    'xq-dark': 'Xq dark'
    'xq-light': 'Xq light'

EditorSettingsColorScheme = rclass
    propTypes:
        theme     : rtypes.string.isRequired
        on_change : rtypes.func.isRequired
    render: ->
        <LabeledRow label="Editor color scheme">
            <SelectorInput
                options   = {EDITOR_COLOR_SCHEMES}
                selected  = {@props.theme}
                on_change = {@props.on_change}
            />
        </LabeledRow>

EDITOR_BINDINGS =
    standard : "Standard"
    sublime  : "Sublime"
    vim      : "Vim"
    emacs    : "Emacs"

EditorSettingsKeyboardBindings = rclass
    propTypes:
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
    on_change: (name, val) ->
        if name == 'autosave'
            flux.getActions('account').setTo(autosave : val)
        else
            x = misc.copy(@props.editor_settings)
            x[name] = val
            flux.getActions('account').setTo(editor_settings:x)
        save_to_server()

    render: ->
        if not @props.editor_settings?
            return <Loading />
        <Panel header={<h2> <Icon name='edit' /> Editor (settings apply to newly (re-)opened files)</h2>}>
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
    "Next file tab"     : "control+]"
    "Previous file tab" : "control+["
    "Smaller text"      : "control+<"
    "Bigger text"       : "control+>"
    "Go to line"        : "control+L"
    "Find"              : "control+F"
    "Find next"         : "control+G"
    "Fold/unfold selected code" : "control+Q"
    "Shift selected text right" : "tab"
    "Shift selected text left"  : "shift+tab"
    "Split view in any editor"  : "control+I"
    "Autoindent selection"      : "control+'"
    "Multiple cursors"          : "control+click"
    "Simple autocomplete"       : "control+space"
    "Sage autocomplete"         : "tab"
    "Split cell in Sage worksheet": "control+;"

EVALUATE_KEYS =
    'Shift-Enter' : "shift+enter"
    'Enter'       : "enter (shift+enter for newline)"

KeyboardSettings = rclass
    render_keyboard_shortcuts: ->
        for desc, shortcut of KEYBOARD_SHORTCUTS
            <LabeledRow key={desc} label={desc}>
                {shortcut}
            </LabeledRow>

    eval_change: (value) ->
        flux.getActions('account').setTo(evaluate_key : value)
        save_to_server()

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
    on_change: (name, value) ->
        x = misc.copy(@props.other_settings)
        x[name] = value
        flux.getActions('account').setTo(other_settings:x)
        save_to_server()

    render_confirm: ->
        if not require('feature').IS_MOBILE
            <Input
                type     = "checkbox"
                checked  = {@props.other_settings.confirm_close}
                ref      = "confirm_close"
                onChange = {=>@on_change('confirm_close', @refs.confirm_close.getChecked())}
                label    = "Confirm: always ask for confirmation before closing the browser window"
            />
    render: ->
        if not @props.other_settings
            return <Loading />
        <Panel header={<h2> <Icon name='gear' /> Other settings</h2>}>
            {@render_confirm()}
            <Input
                type     = "checkbox"
                checked  = {@props.other_settings.mask_files}
                ref      = "mask_files"
                onChange = {=>@on_change('mask_files', @refs.mask_files.getChecked())}
                label    = "Mask files: grey-out files in the files viewer that you probably don't want to open"
            />
            <LabeledRow label="Default file sort">
                <SelectorInput
                    selected  = {@props.other_settings.default_file_sort}
                    options   = {time:"Sort by time", name:"Sort by name"}
                    on_change = {(value)=>@on_change('default_file_sort', value)}
                />
            </LabeledRow>
        </Panel>
    
AdminSettings = rclass
    getInitialState: ->
        state      : 'view'   # view --> load --> edit --> save --> view or edit
        token      : ''
        password   : ''
        error      : ''

    edit: ->
        if @state.token
            @setState(state:'edit')
        else
            @setState(state:'load')
            salvus_client.get_account_creation_token
                cb : (err, token) =>
                    if err
                        @setState(state:'view', error:err)
                    else
                        @setState(state:'edit', error:'', token:token, server_token:token)

    save: ->
        @setState(state:'save')
        token = @state.token
        salvus_client.set_account_creation_token
            token : token
            cb    : (err) =>
                if err
                    @setState(state:'view', error:err)
                else
                    @setState(state:'edit', server_token:token, error:'')

    render_save_button: ->
        if @state.server_token != @state.token
            <Button style={marginRight:'1ex'} onClick={@save} bsStyle="primary">Save token</Button>
        else
            <Button style={marginRight:'1ex'} disabled bsStyle="primary">Save token</Button>

    render_control: ->
        switch @state.state
            when 'view'
                <Button onClick={@edit} bsStyle="primary">Click to show token</Button>
            when 'load'
                <Loading />
            when 'edit', 'save'
                <Well>
                    <form onSubmit={@save}>
                        <Input
                            ref      = 'input'
                            type     = 'text'
                            value    = {@state.token}
                            onChange = {=>@setState(token:@refs.input.getValue())}}
                        />
                    </form>
                    {@render_save_button()}
                    <Button onClick={=>@setState(state:'view')}>Hide</Button>
                </Well>

    render_error: ->
        if @state.error
            <ErrorDisplay error={@state.error} onClose={=>@setState(error:'')} />

    render_save: ->
        if @state.state == 'save'
            <Saving />

    render: ->
        if not @props.groups? or 'admin' not in @props.groups
            return <span />
        <Panel header={<h2> <Icon name='users' /> Administrative server settings</h2>}>
             <div>
                 Secret Account Creation Token:&nbsp;&nbsp;
                     <span className="lighten">users must know this to create an account</span>
             </div>
             <hr />
             <LabeledRow label="Token">
                 {@render_control()}
             </LabeledRow>
             {@render_save()}
             {@render_error()}
        </Panel>

render_sign_out_buttons = ->
    <Row style={padding: '1ex'}>
        <Col xs=12>
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
    <div style={marginTop:'1em'}>
        <Row>
            <Col xs=12 md=6>
                <FluxComponent flux={flux} connectToStores={'account'} >
                    <TerminalSettings />
                    <EditorSettings />
                    <KeyboardSettings />
                </FluxComponent>
            </Col>
            <Col xs=12 md=6>
                <FluxComponent flux={flux} connectToStores={'account'} >
                    <AccountSettings />
                    <OtherSettings />
                    <AdminSettings />
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

STRATEGIES = ['email']
f = () ->
    $.get '/auth/strategies', (strategies, status) ->
        if status == 'success'
            STRATEGIES = strategies
        else
            setTimeout(f, 60000)
f()

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




