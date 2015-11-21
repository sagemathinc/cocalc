###
SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
Copyright (C) 2015, William Stein, GPL v3.
---

Site Customize -- dynamically customize the look of SMC for the client.
###


{Actions, Store, flux, Flux, rclass, rtypes, React} = require('./r')
{Loading} = require('./r_misc')

misc = require('smc-util/misc')

class CustomizeActions extends Actions
    # NOTE: Can test causing this action by typing this in the Javascript console:
    #    require('./r').flux.getActions('account').setTo({first_name:'William'})
    setTo: (payload) ->
        return payload

    # email address that help emails go to
    set_help_email: (email) ->
        @setTo(help_email: email)

    # name that we call the site, e.g., "SageMathCloud"
    set_site_name: (site_name) ->
        @setTo(site_name: site_name)

    set_site_description: (site_description) ->
        @setTo(site_description: site_description)

    set_terms_of_service: (terms_of_service) ->
        @setTo(terms_of_service: terms_of_service)

    set_account_creation_email_instructions: (account_creation_email_instructions) ->
        @setTo(account_creation_email_instructions: account_creation_email_instructions)


actions = flux.createActions('customize', CustomizeActions)

# Define account store
class CustomizeStore extends Store
    constructor: (flux) ->
        super()
        ActionIds = flux.getActionIds('customize')
        @register(ActionIds.setTo, @setTo)

    setTo: (payload) ->
        @setState(payload)

store = flux.createStore('customize', CustomizeStore)

# initially set to defaults
actions.setTo(misc.dict( ([k, v.default] for k, v of require('smc-util/schema').site_settings_conf) ))

# If we are running in the browser, then we customize the schema.  This also gets run on the backend
# to generate static content, which can't be customized.
$?.get (window.smc_base_url + "/customize"), (obj, status) ->
    if status == 'success'
        actions.setTo(obj)

HelpEmailLink = rclass
    displayName : 'HelpEmailLink'
    propTypes :
        help_email : rtypes.string
        text : rtypes.string
    render : ->
        if @props.help_email
            <a href={"mailto:#{@props.help_email}"} target='_blank'>{@props.text ? @props.help_email}</a>
        else
            <Loading/>

exports.HelpEmailLink = rclass
    displayName : 'HelpEmailLink'
    propTypes :
        text : rtypes.string
    render      : ->
        <Flux flux={flux} connect_to={help_email:'customize'}>
            <HelpEmailLink text={@props.text} />
        </Flux>

SiteName = rclass
    displayName : 'SiteName'
    propTypes :
        site_name : rtypes.string
    render : ->
        if @props.site_name
            <span>{@props.site_name}</span>
        else
            <Loading/>

exports.SiteName = rclass
    displayName : 'SiteName'
    render      : ->
        <Flux flux={flux} connect_to={site_name:'customize'}>
            <SiteName />
        </Flux>

SiteDescription = rclass
    displayName : 'SiteDescription'
    propTypes :
        site_description : rtypes.string
    render : ->
        if @props.site_description?
            <span style={color:"#666", fontSize:'16px'}>{@props.site_description}</span>
        else
            <Loading/>

exports.SiteDescription = rclass
    displayName : 'SiteDescription'
    render      : ->
        <Flux flux={flux} connect_to={site_description:'customize'}>
            <SiteDescription />
        </Flux>
