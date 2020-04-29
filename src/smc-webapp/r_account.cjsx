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

{set_account_table} = require('./account/util')



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
