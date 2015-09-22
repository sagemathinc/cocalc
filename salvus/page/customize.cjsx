###
SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
Copyright (C) 2015, William Stein, GPL v3.
---

Site Customize -- dynamically customize the look of SMC for the client.
###


{Actions, Store, flux, Flux, rclass, rtypes, React} = require('flux')
{Loading} = require('r_misc')

misc = require('misc')

class CustomizeActions extends Actions
    # NOTE: Can test causing this action by typing this in the Javascript console:
    #    require('flux').flux.getActions('account').setTo({first_name:'William'})
    setTo: (payload) ->
        return payload

    set_help_email: (email) ->
        @setTo(help_email: email)

actions = flux.createActions('customize', CustomizeActions)

temporary_jquery_hacks = (obj) ->
    if not $?
        return  # running on node.js
    if obj.help_email?
        $('.smc-help-email').text(obj.help_email).attr('href', obj.help_email)

# Define account store
class CustomizeStore extends Store
    constructor: (flux) ->
        super()
        ActionIds = flux.getActionIds('customize')
        @register(ActionIds.setTo, @setTo)

    setTo: (payload) ->
        @setState(payload)
        temporary_jquery_hacks(payload)

store = flux.createStore('customize', CustomizeStore)

# initially set to defaults
actions.setTo(misc.dict( ([k, v.default] for k, v of require('schema').site_settings_conf) ))

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


