###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2016, SageMath, Inc.
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

underscore = _ = require('underscore')
{React, ReactDOM, Actions, Store, rtypes, rclass, Redux, redux, COLOR}  = require('./smc-react')
{Col, Row, Button, Input, Well, Alert, Modal} = require('react-bootstrap')
{Icon, Loading, SearchInput, Space, ImmutablePureRenderMixin} = require('./r_misc')
misc            = require('smc-util/misc')
misc_page       = require('./misc_page')
{top_navbar}    = require('./top_navbar')
{salvus_client} = require('./salvus_client')
feature         = require('./feature')
{markdown_to_html} = require('./markdown')
{HelpEmailLink, SiteName} = require('./customize')

STATE =
    NEW        : 'new'      # new/default/resetted/no problem
    CREATING   : 'creating' # loading ...
    CREATED    : 'created'  # ticket created
    ERROR      : 'error'    # there was a problem

class SupportStore extends Store


class SupportActions extends Actions

    get_store: =>
        @redux.getStore('support')

    get: (key) =>
        @get_store().get(key)

    set: (update) =>
        @setState(update)
        u = underscore
        fields = ['email_err', 'subject', 'body']
        if u.intersection(u.keys(update), fields).length > 0
            @check_valid()

    reset: =>
        @init_email_address()
        @set
            state   : STATE.NEW
            err     : ''
            valid   : @check_valid()

    show: (show) =>
        if show
            @reset()
        @set(show: show)

    new_ticket: (evt) =>
        evt?.preventDefault()
        @reset()

    init_email_address: () =>
        if not @get('email')?.length > 0
            account  = @redux.getStore('account')
            email    = account.get_email_address()
            email    = email ? ''
            @set_email(email)

    set_email: (email) =>
        @set(email: email)
        if email?.length == 0
            @set(email_err: 'Please enter a valid email address above.')
        else if misc.is_valid_email_address(email)
            @set(email_err: null)
        else
            @set(email_err: 'Email address is invalid!')

    check_valid: () =>
        s = @get('subject')?.trim() isnt ''
        b = @get('body')?.trim() isnt ''
        e = not @get('email_err')?
        @set(valid: s and b and e)

    project_id : ->
        pid = top_navbar.current_page_id
        if misc.is_valid_uuid_string(pid)
            return pid
        else
            return null

    projects : =>
        @redux.getStore("projects")

    project_title : ->
        if @project_id()?
            return @projects().get_title(@project_id())
        else
            return null

    location : ->
        window.location.pathname.slice(window.smc_base_url.length)

    # sends off the support request
    support: () =>
        account    = @redux.getStore('account')
        account_id = account.get_account_id() # null if not authenticated
        project_id = @project_id()
        project    = @projects()?.get_project(project_id)

        @set(state: STATE.CREATING)

        if misc.is_valid_uuid_string(project_id)
            u = @projects().get_upgrades_to_project(project_id)
            # console.log("PID", project, u)
            # sum up upgrades for each category
            proj_upgrades = _.mapObject(u,
                (v, k) -> _.values(v).reduce((a,b)->a+b))
            proj_settings = @projects().get_project(project_id).settings
            quotas = misc.map_sum(proj_upgrades, proj_settings)
        else
            proj_upgrades = null
            quotas = {}

        tags = []

        # all upgrades the user has available
        # that's a sum of membership benefits (see schema.coffee)
        upgrades = account.get_total_upgrades()
        if upgrades? and _.values(upgrades).reduce((a,b)->a+b) > 0
            tags.push('member')
        else
            tags.push('free')

        if proj_upgrades? and _.values(proj_upgrades).reduce((a,b)->a+b) > 0
            tags.push('upgraded')

        course = @projects()?.get_course_info(project_id)?.get('project_id')
        if course?
            tags.push('student')

        info =  # additional data dict, like browser/OS
            project_id : project_id
            browser    : feature.get_browser()
            user_agent : navigator.userAgent
            mobile     : feature.get_mobile() ? false
            internet   : (quotas?.network ? 0) > 0
            hostname   : project?.host?.host ? 'unknown'
            course     : course ? 'no'
            quotas     : JSON.stringify(quotas)

        name = account.get_fullname()
        name = if name?.trim?().length > 0 then name else null
        salvus_client.create_support_ticket
            opts:
                username     : name
                email_address: @get('email')
                subject      : @get('subject')
                body         : @get('body')
                #body         : markdown_to_html(@get('body')).s # html doesn't work
                tags         : tags
                location     : @location()
                account_id   : account_id
                info         : info
            cb : @process_support

    process_support: (err, url) =>
        if not err?
            @set    # only clear subject/body, if there has been a success!
                subject  : ''
                body     : ''
                url      : url
        @set
            state  : if err? then STATE.ERROR else STATE.CREATED
            err    : err ? ''


SupportInfo = rclass
    displayName : 'Support-info'

    propTypes :
        actions      : rtypes.object.isRequired
        state        : rtypes.string.isRequired
        url          : rtypes.string.isRequired
        err          : rtypes.string.isRequired

    error : () ->
        <Alert bsStyle='danger' style={fontWeight:'bold'}>
            <p>
            Sorry, there has been an error creating the ticket.
            Please email <HelpEmailLink /> directly!
            </p>
            <p>Error message:</p>
            <pre>{@props.err}</pre>
        </Alert>

    created : () ->
        if @props.url?.length > 1
            url = <a href={@props.url} target='_blank'>{@props.url}</a>
        else
            url = 'no ticket'
        <div style={textAlign:'center'}>
          <p>
              Ticket has been created successfully.
              Keep this link in order to stay in contact with us:
          </p>
          <p style={fontSize:'120%'}>{url}</p>
          <Button
              bsStyle  = 'success'
              style    = {marginTop:'3em'}
              tabIndex = 4
              onClick  = {@props.actions.new_ticket}>Create New Ticket</Button>
       </div>

    default : () ->
        title = @props.actions.project_title()
        if title?
            loc  = @props.actions.location()
            fn   = loc.slice(47) # / projects / uuid /
            what = "You have a problem with \"#{fn}\" in project \"#{title}\"?"
        else
            what = "You have a problem or question?"
        <div>
            <p>
                {what} {" "}
                Please tell us more about it by creating a support ticket.
            </p>
            <p>
                After successfully submitting it,
                you{"'"}ll receive a a link to your ticket.
                Keep it save in order to stay in contact with us!
            </p>
        </div>

    render : ->
        switch @props.state
            when STATE.ERROR
                return @error()
            when STATE.CREATING
                return <Loading />
            when STATE.CREATED
                return @created()
            else
                return @default()

SupportFooter = rclass
    displayName : 'Support-footer'

    propTypes :
        close    : rtypes.func.isRequired
        submit   : rtypes.func.isRequired
        show_form: rtypes.bool.isRequired
        valid    : rtypes.bool.isRequired

    render : ->
        if @props.show_form
            btn = <Button bsStyle  = 'primary'
                          tabIndex = 4
                          onClick  = {@props.submit}
                          disabled = {not @props.valid}>
                       <Icon name='medkit' /> Get Support
                   </Button>
        else
            btn = <span/>

        <Modal.Footer>
            <Button
                tabIndex  = 5
                bsStyle   ='default'
                onClick   = {@props.close}>Close</Button>
            {btn}
        </Modal.Footer>

SupportForm = rclass
    displayName : 'Support-form'

    propTypes :
        email     : rtypes.string.isRequired
        email_err : rtypes.string
        subject   : rtypes.string.isRequired
        body      : rtypes.string.isRequired
        show      : rtypes.bool.isRequired
        submit    : rtypes.func.isRequired
        actions   : rtypes.object.isRequired

    email_change  : ->
        @props.actions.set_email(@refs.email.getValue())

    data_change : ->
        @props.actions.set
            body     : @refs.body.getValue()
            subject  : @refs.subject.getValue()

    render : ->
        if not @props.show
            return <div />

        alert = if @props.email_err?.length > 0
            <Alert bsStyle='danger'>
                 <div>{@props.email_err}</div>
            </Alert>

        <form>
            <Input
                label       = 'Your email address'
                ref         = 'email'
                type        = 'text'
                tabIndex    = 1
                placeholder = 'your_email@address.com'
                bsStyle     = {if ee? then 'warning'}
                value       = {@props.email}
                onChange    = {@email_change} />
            {alert if alert?}
            <Input
                ref         = 'subject'
                autoFocus
                type        = 'text'
                tabIndex    = 2
                label       = 'Message'
                placeholder = "Subject ..."
                value       = {@props.subject}
                onChange    = {@data_change} />
            <Input
                ref         = 'body'
                type        = 'textarea'
                tabIndex    = 3
                placeholder = 'Describe the problem ...'
                rows        = 6
                value       = {@props.body}
                onChange    = {@data_change} />
        </form>


Support = rclass
    displayName : 'Support-main'

    propTypes :
        actions : rtypes.object.isRequired

    getDefaultProps : ->
        show        : false
        email       : ''
        subject     : ''
        body        : ''
        state       : STATE.NEW
        url         : ''
        err         : ''
        email_err   : ''
        valid       : false

    reduxProps :
        support:
            show         : rtypes.bool
            email        : rtypes.string
            subject      : rtypes.string
            body         : rtypes.string
            state        : rtypes.string
            url          : rtypes.string
            err          : rtypes.string
            email_err    : rtypes.string
            valid        : rtypes.bool

    componentWillReceiveProps : (newProps) ->
        newProps.actions.check_valid()

    open : ->
        @props.actions.show(true)

    close : ->
        @props.actions.show(false)

    submit : (event) ->
        event?.preventDefault()
        @props.actions.support()

    render : () ->
        show_form = false

        if (not @props.state?) or @props.state == STATE.NEW
            show_form = true

        <Modal show={@props.show} onHide={@close}>
            <Modal.Header closeButton>
                <Modal.Title>Support Ticket</Modal.Title>
            </Modal.Header>

            <Modal.Body>
                <SupportInfo
                    actions   = {@props.actions}
                    state     = {@props.state}
                    url       = {@props.url}
                    err       = {@props.err} />
                <SupportForm
                    actions   = {@props.actions}
                    email     = {@props.email}
                    email_err = {@props.email_err}
                    subject   = {@props.subject}
                    body      = {@props.body}
                    show      = {show_form}
                    submit    = {(e) => @submit(e)} />
            </Modal.Body>

            <SupportFooter
                    show_form       = {show_form}
                    close           = {=> @close()}
                    submit          = {(e) => @submit(e)}
                    valid           = {@props.valid} />
        </Modal>

render = (redux) ->
    store   = redux.getStore('support')
    actions = redux.getActions('support')

    <Redux redux={redux}>
        <Support actions = {actions} />
    </Redux>

render_project_support = (dom_node, redux) ->
    ReactDOM.render(render(redux), dom_node)

unmount = unmount = (dom_node) ->
    ReactDOM.unmountComponentAtNode(dom_node)

init_redux = (redux) ->
    if not redux.getActions('support')?
        redux.createActions('support', SupportActions)
        redux.createStore('support', SupportStore, {})
init_redux(redux)

# hooking this up to the website

$support = $('.navbar a.smc-top_navbar-support')
$targ = $support.find('.react-target')
render_project_support($targ[0], redux)
$support.click () ->
    exports.show()

# project wide public API

exports.ShowSupportLink = rclass
    displayName : 'ShowSupportLink'

    propTypes :
        text : rtypes.string

    getDefaultProps : ->
        text : 'support ticket'

    show: (evt) ->
        evt.preventDefault()
        exports.show()

    render : ->
        <Redux redux={redux}>
            <a onClick={@show} href='#' style={cursor: 'pointer'}>
                {@props.text}
            </a>
        </Redux>

exports.show = ->
    redux.getActions('support').show(true)