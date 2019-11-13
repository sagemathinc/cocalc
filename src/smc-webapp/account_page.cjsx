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

misc = require('smc-util/misc')
immutable = require('immutable')

{React, ReactDOM, rclass, rtypes, redux} = require('./app-framework')
{Tab, Tabs, Grid, Col, Row}              = require('react-bootstrap')
{LandingPage}                            = require('./landing_page')
{AccountSettingsTop}                     = require('./r_account')
{BillingPage}                            = require('./billing/billing-page')
{UpgradesPage}                           = require('./r_upgrades')
{SupportPage}                            = require('./support')
{SSHKeysPage}                            = require('./account_ssh_keys')
{Icon, Loading}                          = require('./r_misc')
{set_url}                                = require('./history')

ACCOUNT_SPEC =  # WARNING: these must ALL be comparable with == and != !!!!!
    account_id              : rtypes.string
    active_page             : rtypes.string
    strategies              : rtypes.immutable.List
    sign_up_error           : rtypes.immutable.Map
    sign_in_error           : rtypes.string
    signing_in              : rtypes.bool
    signing_up              : rtypes.bool
    is_logged_in            : rtypes.bool
    forgot_password_error   : rtypes.string
    forgot_password_success : rtypes.string # is this needed?
    show_forgot_password    : rtypes.bool
    token                   : rtypes.bool
    reset_key               : rtypes.string
    reset_password_error    : rtypes.string
    remember_me             : rtypes.bool
    has_remember_me         : rtypes.bool
    first_name              : rtypes.string
    last_name               : rtypes.string
    email_address           : rtypes.string
    email_address_verified  : rtypes.immutable.Map
    passports               : rtypes.immutable.Map
    show_sign_out           : rtypes.bool
    sign_out_error          : rtypes.string
    everywhere              : rtypes.bool
    terminal                : rtypes.immutable.Map
    evaluate_key            : rtypes.string
    autosave                : rtypes.number
    font_size               : rtypes.number
    editor_settings         : rtypes.immutable.Map
    other_settings          : rtypes.immutable.Map
    groups                  : rtypes.immutable.List
    stripe_customer         : rtypes.immutable.Map
    ssh_keys                : rtypes.immutable.Map

ACCOUNT_FIELDS = misc.keys(ACCOUNT_SPEC)

exports.AccountPage = rclass
    displayName : 'AccountPage'

    reduxProps :
        projects :
            project_map             : rtypes.immutable.Map
        customize :
            kucalc                  : rtypes.string
        account : ACCOUNT_SPEC

    propTypes :
        actions : rtypes.object.isRequired
        redux   : rtypes.object.isRequired

    shouldComponentUpdate: (props) ->
        return misc.is_different(@props, props, ['project_map', 'kucalc']) or \
               misc.is_different(@props, props, ACCOUNT_FIELDS)

    getDefaultProps: ->
        actions : redux.getActions('account')
        redux   : redux

    handle_select: (key) ->
        switch key
            when 'billing'
                @props.redux.getActions('billing')?.update_customer()
            when 'support'
                @props.redux.getActions('support')?.load_support_tickets()
        @props.redux.getActions('account').set_active_tab(key)
        @props.redux.getActions('account').push_state("/#{key}")

    render_upgrades: ->
        <UpgradesPage
            redux           = {@props.redux}
            stripe_customer = {@props.stripe_customer}
            project_map     = {@props.project_map} />

    render_ssh_keys_page: ->
        <SSHKeysPage
            account_id = {@props.account_id}
            ssh_keys   = {@props.ssh_keys}
        />

    render_account_settings: ->
        <AccountSettingsTop
            redux                  = {@props.redux}
            account_id             = {@props.account_id}
            first_name             = {@props.first_name}
            last_name              = {@props.last_name}
            email_address          = {@props.email_address}
            email_address_verified = {@props.email_address_verified}
            passports              = {@props.passports}
            show_sign_out          = {@props.show_sign_out}
            sign_out_error         = {@props.sign_out_error}
            everywhere             = {@props.everywhere}
            terminal               = {@props.terminal}
            evaluate_key           = {@props.evaluate_key}
            autosave               = {@props.autosave}
            tab_size               = {@props.editor_settings?.get('tab_size')}
            font_size              = {@props.font_size}
            editor_settings        = {@props.editor_settings}
            stripe_customer        = {@props.stripe_customer}
            other_settings         = {@props.other_settings}
            groups                 = {@props.groups} />

    render_landing_page: ->
        <LandingPage
            redux                   = {redux}
            strategies              = {@props.strategies}
            sign_up_error           = {@props.sign_up_error}
            sign_in_error           = {@props.sign_in_error}
            signing_in              = {@props.signing_in}
            signing_up              = {@props.signing_up}
            forgot_password_error   = {@props.forgot_password_error}
            forgot_password_success = {@props.forgot_password_success}
            show_forgot_password    = {@props.show_forgot_password}
            token                   = {@props.token}
            reset_key               = {@props.reset_key}
            reset_password_error    = {@props.reset_password_error}
            remember_me             = {@props.remember_me}
            has_remember_me         = {@props.has_remember_me}
            has_account             = {misc.local_storage_length() > 0}
        />

    render_commercial_tabs: ->
        if not require('./customize').commercial
            return null
        v = []
        v.push <Tab key='billing' eventKey="billing" title={<span><Icon name='money'/> {'Subscriptions and Course Packages'}</span>}>
            {<BillingPage is_simplified={false} /> if @props.active_page == 'billing'}
        </Tab>
        v.push <Tab key='upgrades' eventKey="upgrades" title={<span><Icon name='arrow-circle-up'/> Upgrades</span>}>
            {@render_upgrades() if @props.active_page == 'upgrades'}
        </Tab>
        if @props.kucalc is 'yes'
            v.push <Tab key='ssh-keys' eventKey="ssh-keys" title={<span><Icon name='key'/> SSH keys</span>}>
                {@render_ssh_keys_page() if @props.active_page == 'ssh-keys'}
            </Tab>
        v.push <Tab key='support' eventKey="support" title={<span><Icon name='medkit'/> Support</span>}>
            {<SupportPage/> if @props.active_page == 'support'}
        </Tab>
        return v

    render_loading_view: ->
        <div style={textAlign: 'center', paddingTop: '15px'}>
            <Loading theme={"medium"} />
        </div>

    render_logged_in_view: ->
        if not @props.account_id
            return @render_loading_view()
        <Row>
            <Col md={12}>
                <Tabs activeKey={@props.active_page} onSelect={@handle_select} animation={false} style={paddingTop: "1em"} id="account-page-tabs">
                    <Tab key='account' eventKey="account" title={<span><Icon name='wrench'/> Preferences</span>}>
                        {@render_account_settings()  if not @props.active_page? or @props.active_page == 'account'}
                    </Tab>
                    {@render_commercial_tabs()}
                </Tabs>
            </Col>
        </Row>

    render: ->
        logged_in = @props.is_logged_in
        <div style={overflow:'auto'}>
            <Grid className='constrained'>
                {@render_landing_page() if not logged_in}
                {@render_logged_in_view() if logged_in}
            </Grid>
        </div>
