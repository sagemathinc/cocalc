###
SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
Copyright (C) 2016, Sagemath Inc.
---

Site Customize -- dynamically customize the look of SMC for the client.
###


{redux, Redux, rclass, rtypes, React} = require('./smc-react')
{Loading} = require('./r_misc')
schema = require('smc-util/schema')
misc   = require('smc-util/misc')

actions  = redux.createActions('customize')
defaults = misc.dict( ([k, v.default] for k, v of schema.site_settings_conf) )
store    = redux.createStore('customize', defaults)

# If we are running in the browser, then we customize the schema.  This also gets run on the backend
# to generate static content, which can't be customized.
$?.get (window.smc_base_url + "/customize"), (obj, status) ->
    if status == 'success'
        exports.commercial = obj.commercial = (obj.commercial?[0]?.toLowerCase() == 'y')  # make it true if starts with y
        actions.setState(obj)

HelpEmailLink = rclass
    displayName : 'HelpEmailLink'
    reduxProps :
        customize :
            help_email : rtypes.string
    propTypes :
        text : rtypes.string
    render: ->
        if @props.help_email
            <a href={"mailto:#{@props.help_email}"} target='_blank'>{@props.text ? @props.help_email}</a>
        else
            <Loading/>

exports.HelpEmailLink = rclass
    displayName : 'HelpEmailLink-redux'
    propTypes :
        text : rtypes.string
    render: ->
        <Redux redux={redux}>
            <HelpEmailLink text={@props.text} />
        </Redux>

SiteName = rclass
    displayName : 'SiteName'
    reduxProps :
        customize :
            site_name : rtypes.string
    render: ->
        if @props.site_name
            <span>{@props.site_name}</span>
        else
            <Loading/>

exports.SiteName = rclass
    displayName : 'SiteName-redux'
    render: ->
        <Redux redux={redux}>
            <SiteName />
        </Redux>

SiteDescription = rclass
    displayName : 'SiteDescription'
    propTypes:
        style: rtypes.object
    reduxProps :
        customize :
            site_description : rtypes.string
    render: ->
        style = @props.style ? {color:'#666', fontSize:'16px'}
        if @props.site_description?
            <span style={style}>{@props.site_description}</span>
        else
            <Loading/>

exports.SiteDescription = rclass
    displayName : 'SiteDescription-redux'
    propTypes :
        style : rtypes.object
    render: ->
        <Redux redux={redux}>
            <SiteDescription style={@props.style}/>
        </Redux>

# TODO also make this configurable? Needed in the <Footer/> and maybe elsewhere …
exports.CompanyName = rclass
    displayName : 'CompanyName'
    render:->
        <span>SageMath, Inc.</span>

TermsOfService = rclass
    displayName : 'TermsOfService'

    reduxProps :
        customize :
            terms_of_service : rtypes.string

    propTypes :
        style : rtypes.object

    render: ->
        if not @props.terms_of_service?
            return <div></div>
        return <div style={@props.style} dangerouslySetInnerHTML={__html: @props.terms_of_service}></div>

exports.TermsOfService = rclass
    displayName : 'TermsOfService-redux'

    propTypes :
        style : rtypes.object

    render: ->
        <Redux redux={redux}>
            <TermsOfService style={@props.style} />
        </Redux>

AccountCreationEmailInstructions = rclass
    displayName : 'AccountCreationEmailInstructions'

    reduxProps :
        customize :
            account_creation_email_instructions : rtypes.string

    render: ->
        <h3 style={marginTop: 0, textAlign: 'center'} >{@props.account_creation_email_instructions}</h3>

exports.AccountCreationEmailInstructions = rclass
    displayName : 'AccountCreationEmailInstructions'

    render: ->
        <Redux redux={redux}>
            <AccountCreationEmailInstructions />
        </Redux>

# first step of centralizing these URLs in one place → collecting all such pages into one
# react-class with a 'type' prop is the next step (TODO)
# then consolidate this with the existing site-settings database (e.g. TOS above is one fixed HTML string with an anchor)
smc_base_url = window?.smc_base_url ? ''  # fallback for react-static
exports.PolicyIndexPageUrl     = smc_base_url + '/policies/index.html'
exports.PolicyPricingPageUrl   = smc_base_url + '/policies/pricing.html'
exports.PolicyPrivacyPageUrl   = smc_base_url + '/policies/privacy.html'
exports.PolicyCopyrightPageUrl = smc_base_url + '/policies/copyright.html'
exports.PolicyTOSPageUrl       = smc_base_url + '/policies/terms.html'
exports.SmcWikiUrl             = 'https://github.com/sagemathinc/smc/wiki/Portal'