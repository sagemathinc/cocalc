{React, ReactDOM, rclass, rtypes, flux, Flux} = require('./r')
{Tab, Tabs, Grid} = require('react-bootstrap')
{LandingPageFlux} = require('./landing_page')
{AccountSettingsFlux} = require('./r_account')
{BillingPageFlux} = require('./billing')
{UpgradesPageFlux} = require('./r_upgrades')
{Icon} = require('./r_misc')

AccountTabs = rclass
    propTypes :
        active_page : rtypes.string

    render : ->
        <Tabs activeKey={@props.active_page} onSelect={@handle_select} animation={false}>
            <Tab eventKey="settings" title="Settings">
                {<AccountSettingsFlux />  if not @props.active_page? or @props.active_page == 'settings'}
            </Tab>
            <Tab eventKey="billing" title="Billing">
                {<BillingPageFlux /> if @props.active_page == 'billing'}
            </Tab>
            <Tab eventKey="upgrades" title="Upgrades">
                {<UpgradesPageFlux /> if @props.active_page == 'upgrades'}
            </Tab>
        </Tabs>

AccountPage = rclass
    propTypes :
        active_page : rtypes.string

    handle_select : (key) ->
        if key == "billing"
            flux.getActions('billing')?.update_customer()
        flux.getActions('account').setTo('active_page': key)

    render : ->
        logged_in = flux.getStore('account').is_logged_in()
        <Grid fluid className='constrained'>
            {<LandingPageFlux /> if not logged_in}
            {<AccountTabs active_page={@props.active_page} /> if logged_in}
        </Grid>

AccountPageFlux = rclass
    render : ->
        <Flux flux={flux} connect_to={active_page : 'account'}>
            <AccountPage />
        </Flux>

is_mounted = false
exports.mount = mount = ->
    #console.log("mount account settings")
    if not is_mounted
        ReactDOM.render <AccountPageFlux />, document.getElementById('account')
        is_mounted = true

exports.unmount = unmount = ->
    #console.log("unmount account settings")
    if is_mounted
        ReactDOM.unmountComponentAtNode(document.getElementById("account"))
        is_mounted = false

{top_navbar} = require('./top_navbar')

# This is not efficient in that we're mounting/unmounting all three pages, when only one needs to be mounted.
# When we replace the whole page by a single react component this problem will go away.
top_navbar.on "switch_to_page-account", () ->
    mount()

top_navbar.on "switch_from_page-account", () ->
    unmount()