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

