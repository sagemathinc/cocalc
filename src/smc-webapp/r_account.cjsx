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

async = require('async')

{React, ReactDOM, rtypes, rclass, redux}  = require('./app-framework')

{Button, ButtonToolbar, Checkbox, Panel, Grid, Row, Col, FormControl, FormGroup, Well, Modal, ProgressBar, Alert, Radio} = require('react-bootstrap')

{A, ErrorDisplay, Icon, LabeledRow, Loading, NumberInput, Saving, SelectorInput, Tip, Space, TimeAgo} = require('./r_misc')

{SiteName, TermsOfService, Footer} = require('./customize')

{ColorPicker} = require('./colorpicker')
{Avatar} = require('./other-users')
{ProfileImageSelector} = require('./r_profile_image')

{KEYBOARD_VARIANTS} = require('./frame-editors/x11-editor/xpra/keyboards')
{EditorSettingsPhysicalKeyboard, EditorSettingsKeyboardVariant} = require('./account/editor-settings/x11-keyboard')

{NewFilenameFamilies, NewFilenames} = require('smc-webapp/project/utils')
{NEW_FILENAMES} = require('smc-util/db-schema')

{SignOut} =require('./account/sign-out')
{DeleteAccount} = require('./account/delete-account')
{EditorSettingsCheckboxes} = require('./account/editor-settings/checkboxes')
{EditorSettingsAutosaveInterval} = require('./account/editor-settings/autosave-interval')
{EditorSettingsColorScheme} = require('./account/editor-settings/color-schemes')
{EditorSettingsFontSize} = require('./account/editor-settings/font-size')
{EditorSettingsIndentSize} = require('./account/editor-settings/indent-size')
{EditorSettingsKeyboardBindings} = require('./account/editor-settings/keyboard-bindings')

{log} = require("./user-tracking")

{alert_message} = require('./alerts')

md5 = require('md5')

misc       = require('smc-util/misc')

smc_version = require('smc-util/smc-version')

{webapp_client} = require('./webapp_client')

{PROJECT_UPGRADES} = require('smc-util/schema')


# Define a component for working with the user's basic
# account information.

set_account_table = (obj) ->
    table = redux.getTable('account')
    if table?
        table.set(obj)
    return;


exports.EmailVerification = rclass
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
        try
            await webapp_client.account_client.send_verification_email(@props.account_id)
        catch err
            err_msg = "Problem sending email verification: #{err}"
            console.log(err_msg)
            alert_message(type:"error", message:err_msg)
        finally
            @setState(disabled_button: true)

    test : ->
        if not @props.email_address?
            <span>Unknown</span>
        else
            if @props.email_address_verified?.get(@props.email_address)
                <span style={color: 'green'}>Verified</span>
            else
                <React.Fragment>
                    <span key={1} style={color: 'red', paddingRight: '3em'}>Not Verified</span>
                    <Button
                        key        = {2}
                        onClick    = {@verify}
                        bsStyle    = 'success'
                        disabled   = {@state.disabled_button}
                    >
                        {
                            if @state.disabled_button
                                'Email Sent'
                            else
                                'Send Verification Email'
                        }
                    </Button>
                </React.Fragment>

    render : ->
        <LabeledRow label='Email verification' style={marginBottom: '15px'}>
            <div>
                Status: {@test()}
            </div>
        </LabeledRow>

exports.EmailAddressSetting = rclass
    displayName : 'Account-EmailAddressSetting'

    propTypes :
        account_id    : rtypes.string
        email_address : rtypes.string
        redux         : rtypes.object
        disabled      : rtypes.bool
        is_anonymous  : rtypes.bool
        verify_emails : rtypes.bool

    getInitialState: ->
        state      : 'view'   # view --> edit --> saving --> view or edit
        password   : ''
        email_address : ''    # The new email address

    start_editing: ->
        @setState
            state    : 'edit'
            email_address : @props.email_address ? ''
            error    : ''
            password : ''

    cancel_editing: ->
        @setState
            state    : 'view'
            password : ''  # more secure...

    save_editing: ->
        if @state.password.length < 6
            @setState
                state : 'edit'
                error : 'Password must be at least 6 characters long.'
            return
        @setState
            state : 'saving'
        try
            await webapp_client.account_client.change_email(@state.email_address, @state.password)
        catch err
            @setState
                state    : 'edit'
                error    : "Error -- #{err}"
            return
        if @props.is_anonymous
            log("email_sign_up", {source: "anonymous_account"});
        @setState
            state    : 'view'
            error    : ''
            password : ''
        # if email verification is enabled, send out a token
        # in any case, send a welcome email to an anonymous user, possibly including an email verification link
        if not (@props.verify_emails or @props.is_anonymous)
            return
        try
            # anonymouse users will get the "welcome" email
            await webapp_client.account_client.send_verification_email(@props.account_id, not @props.is_anonymous)
        catch err
            err_msg = "Problem sending welcome email: #{err}"
            console.log(err_msg)
            alert_message(type:"error", message:err_msg)

    is_submittable: ->
        return @state.password != '' and @state.email_address != @props.email_address

    change_button: ->
        <Button disabled={not @is_submittable()} onClick={@save_editing} bsStyle='success'>{@button_label()}</Button>

    render_error: ->
        if @state.error
            <ErrorDisplay error={@state.error} onClose={=>@setState(error:'')} style={marginTop:'15px'} />

    render_edit: ->
        password_label = if @props.email_address then "Current password" else "Choose a password"
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
            {password_label}
            <form onSubmit={(e)=>e.preventDefault();if @is_submittable() then @save_editing()}>
                <FormGroup>
                    <FormControl
                        type        = 'password'
                        ref         = 'password'
                        value       = {@state.password}
                        placeholder = {password_label}
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

    button_label: ->
        if @props.is_anonymous
            return "Sign up using an email address and password"
        else if @props.email_address
            return "Change email address"
        else
            return "Set email address and password"

    render: ->
        label = if @props.is_anonymous then <h5 style={color:"#666"}>Sign up using an email address and password</h5> else 'Email address'
        <LabeledRow label={label}  style={if @props.disabled then {color:"#666"}}>
            <div>
                {@props.email_address}
                {if @state.state == 'view' then <Button disabled={@props.disabled} className='pull-right' onClick={@start_editing}>{@button_label()}...</Button>}
            </div>
            {@render_edit() if @state.state != 'view'}
        </LabeledRow>

exports.NewsletterSetting = rclass
    displayName : 'Account-NewsletterSetting'

    propTypes :
        other_settings : rtypes.object
        email_address  : rtypes.string
        redux          : rtypes.object

    on_change: (value) ->
        set_account_table({"other_settings": {"newsletter" : value}})

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

exports.ProfileSettings = rclass
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
        set_account_table(profile : {color: value})

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
exports.TerminalSettings = rclass
    displayName : 'Account-TerminalSettings'

    propTypes :
        terminal : rtypes.immutable.Map
        redux    : rtypes.object

    shouldComponentUpdate: (props) ->
        return @props.terminal != props.terminal

    handleChange: (obj) ->
        set_account_table(terminal: obj)

    render_color_scheme: ->
        <LabeledRow label='Terminal color scheme'>
            <SelectorInput
                selected  = {@props.terminal.get('color_scheme')}
                options   = {TERMINAL_COLOR_SCHEMES}
                on_change = {(color_scheme)=>@handleChange(color_scheme : color_scheme)}
            />
        </LabeledRow>

    render_font_family: ->
        return  # disabled due to https://github.com/sagemathinc/cocalc/issues/3304
        <LabeledRow label='Terminal font family'>
            <SelectorInput
                selected  = {@props.terminal.get('font')}
                options   = {TERMINAL_FONT_FAMILIES}
                on_change = {(font)=>@handleChange(font:font)}
            />
        </LabeledRow>


    render: ->
        if not @props.terminal?
            return <Loading />
        <Panel header={<h2> <Icon name='terminal' /> Terminal</h2>}>
            {@render_color_scheme()}
            {@render_font_family()}
        </Panel>


exports.EditorSettings = rclass
    displayName : 'Account-EditorSettings'

    propTypes :
        redux           : rtypes.object
        autosave        : rtypes.number
        tab_size        : rtypes.number
        font_size       : rtypes.number
        email_address   : rtypes.string
        editor_settings : rtypes.immutable.Map

    shouldComponentUpdate: (props) ->
        return misc.is_different(@props, props, ['autosave', 'font_size', 'editor_settings', 'tab_size'])

    get_keyboard_variant_options: (val) ->
        val ?= @props.editor_settings.get('physical_keyboard')
        options = misc.deep_copy(KEYBOARD_VARIANTS[val] ? [])
        options.unshift({value:"", display: "No variant"})
        return options

    on_change: (name, val) ->
        if name == 'autosave' or name == 'font_size'
            set_account_table("#{name}" : val)
        else
            set_account_table(editor_settings:{"#{name}":val})

        if name == 'physical_keyboard'
            options = @get_keyboard_variant_options(val)
            @actions('account').setState(keyboard_variant_options: options)
            for opt in options
                if opt.value == 'nodeadkeys'
                    @on_change('keyboard_variant', opt.value)
                    return
            # otherwise, select default
            @on_change('keyboard_variant', '')

    render: ->
        if not @props.editor_settings?
            return <Loading />
        <Panel header={<h2> <Icon name='edit' /> Editor</h2>}>
            <EditorSettingsFontSize
                on_change={@on_change} font_size={@props.font_size} />
            <EditorSettingsAutosaveInterval
                on_change={@on_change} autosave={@props.autosave} />
            <EditorSettingsIndentSize
                on_change={@on_change} tab_size={@props.tab_size} />
            <EditorSettingsColorScheme
                on_change={(value)=>@on_change('theme',value)} theme={@props.editor_settings.get('theme')} editor_settings={@props.editor_settings} font_size={@props.font_size} />
            <EditorSettingsKeyboardBindings
                on_change={(value)=>@on_change('bindings',value)} bindings={@props.editor_settings.get('bindings')} />
            <EditorSettingsPhysicalKeyboard
                on_change={(value)=>@on_change('physical_keyboard',value)} physical_keyboard={@props.editor_settings.get('physical_keyboard')} />
            <EditorSettingsKeyboardVariant
                on_change={(value)=>@on_change('keyboard_variant',value)} keyboard_variant={@props.editor_settings.get('keyboard_variant')} keyboard_variant_options = {@get_keyboard_variant_options()} />
            <EditorSettingsCheckboxes
                on_change={@on_change} editor_settings={@props.editor_settings} email_address={@props.email_address}/>
        </Panel>

KEYBOARD_SHORTCUTS =
    #'Next file tab'                : 'control+]'  # temporarily disabled since broken in many ways
    #'Previous file tab'            : 'control+['
    'Build project / run code'     : 'shift+enter; alt+T; command+T'
    'Force build project'          : 'shift+alt+enter; shift+alt+T; shift+command+T'
    'LaTeX forward sync'           : 'alt+enter; cmd+enter'
    'Smaller text'                 : 'control+<'
    'Bigger text'                  : 'control+>'
    'Toggle comment'               : 'control+/'
    'Go to line'                   : 'control+L'
    'Find'                         : 'control+F'
    'Find next'                    : 'control+G'
    'Fold/unfold selected code'    : 'control+Q'
    'Shift selected text right'    : 'tab'
    'Shift selected text left'     : 'shift+tab'
    'Split view in Sage worksheet' : 'shift+control+I'
    'Autoindent selection'         : "control+'"
    'Format code (use Prettier, etc)' : 'control+shift+F'
    'Multiple cursors'             : 'control+click'
    'Simple autocomplete'          : 'control+space'
    'Sage autocomplete'            : 'tab'
    'Split cell in Sage worksheet' : 'control+;'

EVALUATE_KEYS =
    'Shift-Enter' : 'shift+enter'
    'Enter'       : 'enter (shift+enter for newline)'

exports.KeyboardSettings = rclass
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
        set_account_table(evaluate_key : value)

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

exports.OtherSettings = rclass
    displayName : 'Account-OtherSettings'

    propTypes :
        redux              : rtypes.object
        other_settings     : rtypes.immutable.Map
        is_stripe_customer : rtypes.bool

    on_change: (name, value) ->
        set_account_table(other_settings:{"#{name}":value})

    toggle_global_banner: (val) ->
        if val
            # this must be "null", not "undefined" – otherwise the data isn't stored in the DB.
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
        BIG_PAGE_SIZE = 5000
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


    render_new_filenames: ->
        selected = @props.other_settings.get(NEW_FILENAMES) ? NewFilenames.default_family
        <LabeledRow label='Generated filenames'>
            <SelectorInput
                selected  = {selected}
                options   = {NewFilenameFamilies}
                on_change = {(value)=>@on_change(NEW_FILENAMES, value)}
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

    render_allow_mentions: ->
        <Checkbox
            checked  = {!!@props.other_settings.get('allow_mentions')}
            ref      = 'allow_mentions'
            onChange = {(e)=>@on_change('allow_mentions', e.target.checked)}
        >
            Allow mentioning others in chats (disable to work around a bug)
        </Checkbox>


    render_dark_mode: ->
        <Checkbox
            checked  = {!!@props.other_settings.get('dark_mode')}
            ref      = 'allow_mentions'
            onChange = {(e)=>@on_change('dark_mode', e.target.checked)}
            style    = {color: 'rgba(229, 224, 216, 0.65)', backgroundColor: 'rgb(36, 37, 37)', marginLeft: '-5px', padding: '5px', borderRadius: '3px'}
        >
            Dark mode: reduce eye strain by showing a dark background (via <A href="https://darkreader.org/">Dark Reader</A>)
        </Checkbox>

    render: ->
        if not @props.other_settings
            return <Loading />
        <Panel header={<h2> <Icon name='gear' /> Other</h2>}>
            {@render_dark_mode()}
            {@render_confirm()}
            {@render_first_steps()}
            {@render_global_banner()}
            {@render_allow_mentions()}
            {@render_time_ago_absolute()}
            {### @render_katex() ###}
            {@render_mask_files()}
            {@render_no_free_warnings()}
            {@render_new_filenames()}
            {@render_default_file_sort()}
            {@render_page_size()}
            {@render_standby_timeout()}
            {@render_page_size_warning()}
        </Panel>



STRATEGIES = ['email']
f = () ->
    $.get "#{window.app_base_url}/auth/strategies", (strategies, status) ->
        if status == 'success'
            STRATEGIES = strategies

            ###
            # Pro Tip:
            # Type the following in the javascript console to make all strategy
            # buttons appear, purely for UI testing:
            #  smc.redux.getActions('account').setState({strategies:["email","facebook","github","google","twitter"]})
            ###

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
    alert_message(type:"error", message:"Settings error -- #{err}")

