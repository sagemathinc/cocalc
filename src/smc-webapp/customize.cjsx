###
CoCalc: Collaborative Calculation in the Cloud
Copyright (C) 2016, Sagemath Inc.
---

Site Customize -- dynamically customize the look of SMC for the client.
###


{redux, Redux, rclass, rtypes, React} = require('./smc-react')
{Loading} = require('./r_misc')
schema = require('smc-util/schema')
misc   = require('smc-util/misc')
theme  = require('smc-util/theme')

test_commercial = (c) ->
    return c[0]?.toLowerCase() == 'y'  # make it true if starts with y

store    = redux.createStore('customize', defaults)
actions  = redux.createActions('customize')
actions.setState(is_commercial: true)  # really simple way to have a default value -- gets changed below once the $?.get returns.
defaults = misc.dict( ([k, v.default] for k, v of schema.site_settings_conf) )
defaults.is_commercial = test_commercial(defaults.commercial)


# If we are running in the browser, then we customize the schema.  This also gets run on the backend
# to generate static content, which can't be customized.
$?.get (window.app_base_url + "/customize"), (obj, status) ->
    if status == 'success'
        obj.commercial = obj.commercial ? defaults.commercial
        obj.is_commercial = exports.commercial = test_commercial(obj.commercial)
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
            <div>
                Is this broken?
            </div>

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
        {COMPANY_NAME} = require('smc-util/theme')
        <span>{COMPANY_NAME}</span>

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
app_base_url = window?.app_base_url ? ''  # fallback for react-static
exports.PolicyIndexPageUrl     = app_base_url + '/policies/index.html'
exports.PolicyPricingPageUrl   = app_base_url + '/policies/pricing.html'
exports.PolicyPrivacyPageUrl   = app_base_url + '/policies/privacy.html'
exports.PolicyCopyrightPageUrl = app_base_url + '/policies/copyright.html'
exports.PolicyTOSPageUrl       = app_base_url + '/policies/terms.html'
exports.SmcWikiUrl             = theme.WIKI_URL