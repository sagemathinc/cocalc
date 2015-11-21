misc = require('smc-util/misc')

{React, ReactDOM, rclass, rtypes, flux, Flux} = require('./r')
{Tab, Tabs, Grid} = require('react-bootstrap')
{LandingPage} = require('./landing_page')
{AccountSettingsTop} = require('./r_account')
{BillingPageFlux} = require('./billing')
{UpgradesPage} = require('./r_upgrades')
{Icon} = require('./r_misc')
browser = require('./browser')

AccountPage = rclass
    displayName : 'AccountPage'

    propTypes :
        active_page             : rtypes.string
        flux                    : rtypes.object
        actions                 : rtypes.object.isRequired
        strategies              : rtypes.array
        sign_up_error           : rtypes.object
        sign_in_error           : rtypes.string
        signing_in              : rtypes.bool
        signing_up              : rtypes.bool
        forgot_password_error   : rtypes.string
        forgot_password_success : rtypes.string #is this needed?
        show_forgot_password    : rtypes.bool
        token                   : rtypes.bool
        reset_key               : rtypes.string
        reset_password_error    : rtypes.string
        remember_me             : rtypes.bool
        first_name              : rtypes.string
        last_name               : rtypes.string
        email_address           : rtypes.string
        passports               : rtypes.object
        show_sign_out           : rtypes.bool
        sign_out_error          : rtypes.string
        everywhere              : rtypes.bool
        terminal                : rtypes.object
        evaluate_key            : rtypes.string
        autosave                : rtypes.number
        editor_settings         : rtypes.object
        other_settings          : rtypes.object
        profile                 : rtypes.object
        groups                  : rtypes.array

    handle_select : (key) ->
        if key == "billing"
            @props.flux.getActions('billing')?.update_customer()
        @props.flux.getActions('account').setTo('active_page': key)
        window.history.pushState("", "", window.smc_base_url + "/settings/#{key}")

    render_upgrades : ->
        <UpgradesPage
            flux={@props.flux}
            stripe_customer={@props.stripe_customer}
            project_map={@props.project_map} />

    render_account_settings : ->
        <AccountSettingsTop
            first_name={@props.first_name}
            last_name={@props.last_name}
            email_address={@props.email_address}
            passports={@props.passports}
            show_sign_out={@props.show_sign_out}
            sign_out_error={@props.sign_out_error}
            everywhere={@props.everywhere}
            flux={@props.flux}
            terminal={@props.terminal}
            evaluate_key={@props.evaluate_key}
            autosave={@props.autosave}
            editor_settings={@props.editor_settings}
            other_settings={@props.other_settings}
            profile={@props.profile}
            groups={@props.groups} />

    render_landing_page : ->
        <LandingPage
            flux={@props.flux}
            actions={@props.actions}
            strategies={@props.strategies}
            sign_up_error={@props.sign_up_error}
            sign_in_error={@props.sign_in_error}
            signing_in={@props.signing_in}
            signing_up={@props.signing_up}
            forgot_password_error={@props.forgot_password_error}
            forgot_password_success={@props.forgot_password_success}
            show_forgot_password={@props.show_forgot_password}
            token={@props.token}
            reset_key={@props.reset_key}
            reset_password_error={@props.reset_password_error}
            remember_me={@props.remember_me}
            has_account={localStorage.length > 0} />

    render : ->
        logged_in = @props.flux.getStore('account').is_logged_in()
        <Grid fluid className='constrained'>
            {@render_landing_page() if not logged_in}
            {<Tabs activeKey={@props.active_page} onSelect={@handle_select} animation={false} style={paddingTop: "1em"}>
                <Tab eventKey="account" title="Settings">
                    {@render_account_settings()  if not @props.active_page? or @props.active_page == 'account'}
                </Tab>
                <Tab eventKey="billing" title="Billing">
                    {<BillingPageFlux /> if @props.active_page == 'billing'}
                </Tab>
                <Tab eventKey="upgrades" title="Upgrades">
                    {@render_upgrades() if @props.active_page == 'upgrades'}
                </Tab>
            </Tabs> if logged_in}
        </Grid>

AccountPageFlux = rclass
    render : ->
        connect_to = {}
        for x in misc.split('active_page autosave editor_settings email_address evaluate_key everywhere first_name forgot_password_error forgot_password_success groups last_name other_settings passports profile project_map remember_me reset_key reset_password_error show_forgot_password show_sign_out sign_in_error sign_out_error sign_up_error signing_in signing_up strategies stripe_customer terminal token')
            connect_to[x] = 'account'
        actions = flux.getActions('account')
        <Flux flux={flux} connect_to={connect_to}>
            <AccountPage actions={actions} />
        </Flux>

is_mounted = false
exports.mount = mount = ->
    #console.log("mount account settings")
    if not is_mounted
        ReactDOM.render <AccountPageFlux />, document.getElementById('account')
        is_mounted = true
    if not flux.getStore('account').is_logged_in()
        browser.set_window_title("") # empty string gives just the <SiteName/>

exports.unmount = unmount = ->
    #console.log("unmount account settings")
    if is_mounted
        ReactDOM.unmountComponentAtNode(document.getElementById("account"))
        is_mounted = false

{top_navbar} = require('./top_navbar')

top_navbar.on "switch_to_page-account", () ->
    mount()

top_navbar.on "switch_from_page-account", () ->
    unmount()