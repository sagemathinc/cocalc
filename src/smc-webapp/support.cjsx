
###############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
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
$          = window.$
underscore = _ = require('underscore')
{React, ReactDOM, Actions, Store, rtypes, rclass, redux, COLOR}  = require('./smc-react')
{Button, FormControl, FormGroup, Well, Alert, Modal, Table} = require('react-bootstrap')
{Icon, Markdown, Loading, Space, ImmutablePureRenderMixin, Footer} = require('./r_misc')
misc            = require('smc-util/misc')
misc_page       = require('./misc_page')
{webapp_client} = require('./webapp_client')
feature         = require('./feature')
{HelpEmailLink, SiteName, SmcWikiUrl} = require('./customize')

STATE =
    NEW        : 'new'      # new/default/resetted/no problem
    CREATING   : 'creating' # loading ...
    CREATED    : 'created'  # ticket created
    ERROR      : 'error'    # there was a problem

cmp_tickets = (t1, t2) ->
    key = 'updated_at'
    e1 = t1[key] # an iso date string is lexicographically sortable
    e2 = t2[key]
    if e1 > e2
        return -1
    else if e1 < e2
        return 1
    return 0

date2str = (d) ->
    try
        if _.isString(d)
            d = new Date(d)
        dstr = d.toISOString().slice(0, 10)
        tstr = d.toLocaleTimeString()
        return "#{dstr} #{tstr}"
    catch e
        console.warn("support/date2str: could not convert #{d}")
        return '?'

class SupportStore extends Store

class SupportActions extends Actions

    # TODO: the public api of actions is not supposed to return anything.  An action *DOES* stuff.
    # These get_store and get should be private.
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

    load_support_tickets: () ->
        # mockup for testing -- set it to "true" to see some tickets
        if DEBUG and false
            @setState
                support_tickets : [
                    id : 123
                    status: 'open'
                    description: 'test ticket 123'
                ,
                    id : 456
                    status : 'open'
                    description: 'test ticket 456'
                ]
                support_ticket_error : null
        else
            webapp_client.get_support_tickets (err, tickets) =>
                # console.log("tickets: #{misc.to_json(tickets)}")
                # sort by .updated_at
                if err?
                    @setState
                        support_ticket_error : err
                        support_tickets      : []
                else
                    tickets = tickets.sort(cmp_tickets)
                    @setState
                        support_ticket_error : err
                        support_tickets      : tickets

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
        s = @get('subject')?.trim().length > 0
        b = @get('body')?.trim().length > 0
        e = not @get('email_err')?
        v = s and b and e
        # console.log("support/actions/check_valid: #{v} (s: #{s}, b: #{b}, e: #{e})")
        @set(valid: v)

    project_id: ->
        pid = @redux.getStore('page').get('active_top_tab')
        if misc.is_valid_uuid_string(pid)
            return pid
        else
            return null

    projects: =>
        @redux.getStore("projects")

    project_title: ->
        if @project_id()?
            return @projects().get_title(@project_id())
        else
            return null

    location: ->
        window.location.pathname.slice(window.app_base_url.length)

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
            proj_upgrades = _.mapObject(u, (v, k) -> misc.sum(_.values(v)))
            proj_settings = @projects().get_project(project_id).settings
            quotas = misc.map_sum(proj_upgrades, proj_settings)
        else
            proj_upgrades = null
            quotas = {}

        tags = []

        # all upgrades the user has available
        # that's a sum of subscription benefits (see schema.coffee)
        upgrades = account.get_total_upgrades()
        if upgrades? and misc.sum(_.values(upgrades)) > 0
            tags.push('member')
        else
            tags.push('free')

        if proj_upgrades? and misc.sum(_.values(proj_upgrades)) > 0
            tags.push('upgraded')

        course = @projects()?.get_course_info(project_id)?.get('project_id')
        if course?
            tags.push('student')

        info =  # additional data dict, like browser/OS
            project_id : project_id
            browser    : feature.get_browser()
            user_agent : navigator?.userAgent
            mobile     : feature.get_mobile() ? false
            internet   : (quotas?.network ? 0) > 0
            hostname   : project?.host?.host ? 'unknown'
            course     : course ? 'no'
            quotas     : JSON.stringify(quotas)

        name = account.get_fullname()
        name = if name?.trim?().length > 0 then name else null
        webapp_client.create_support_ticket
            opts:
                username     : name
                email_address: @get('email')
                subject      : @get('subject')
                body         : @get('body')
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


exports.SupportPage = rclass
    displayName : "SupportPage"

    reduxProps :
        support:
            support_tickets      : rtypes.array
            support_ticket_error : rtypes.string

    render_header: ->
        <tr style={fontWeight:"bold"}>
            <th>Ticket</th>
            <th>Status</th>
        </tr>

    open: (ticket_id) ->
        url = misc.ticket_id_to_ticket_url(ticket_id)
        {open_new_tab} = require('smc-webapp/misc_page')
        open_new_tab(url, '_blank')

    render_body: ->
        for i, ticket of @props.support_tickets
            do (ticket, i) =>
                style = switch ticket.status
                    when 'open', 'new'
                        'danger'
                    when 'closed'
                        'info'
                    when 'solved'
                        'success'
                    else
                        'info'

                <tr key={i} className="#{style}">
                    <td><h4>{ticket.subject}</h4>
                        <div style={fontSize:"85%", color:'#555', marginBottom: '1em'}>
                            created: {date2str(ticket.created_at)},
                            {' '}
                            last update: {date2str(ticket.updated_at)}
                        </div>
                        <div style={maxHeight:"10em", "overflowY":"auto"}>
                            <Markdown value={ticket.description} />
                        </div>
                    </td>
                    <td>
                        <br/>
                        <Button bsStyle="#{style}"
                            onClick={=> @open(ticket.id)}>
                            {ticket.status.toUpperCase()}
                            <br/>
                            Go to {ticket.id}
                        </Button>
                    </td>
                </tr>

    render_table: ->
        divStyle = {textAlign:"center", marginTop: "4em"}

        if not @props.support_tickets?
            return <div style={divStyle}>
                        <Loading />
                   </div>

        if @props.support_tickets.length > 0
            <Table responsive style={borderCollapse: "separate", borderSpacing: "0 1em"}>
                <tbody>{@render_body()}</tbody>
            </Table>
        else
            <div style={divStyle}>
                No support tickets found.
            </div>

    render: ->
        if @props.support_ticket_error?.length > 0
            content = <Alert bsStyle='danger'>
                          Error retriving tickets: {@props.support_ticket_error}
                          <br/>
                          Please contact <HelpEmailLink /> directly!
                      </Alert>
        else
            content = @render_table()

        <div>
            <h2>Support tickets</h2>
            <div style={color:'#666'}>
                Check the status of your support tickets here.<br/>
                To report an issue, navigate to the file in question
                and click the <Icon name='medkit' /> button in the top right corner.
            </div>
            <div style={minHeight:"65vh"}>
                {content}
            </div>
            <Footer/>
        </div>

SupportInfo = rclass
    displayName : 'Support-info'

    propTypes :
        actions      : rtypes.object.isRequired
        state        : rtypes.string.isRequired
        url          : rtypes.string.isRequired
        err          : rtypes.string.isRequired

    shouldComponentUpdate: (props) ->
        return misc.is_different(@props, props, ['state', 'url', 'err'])

    error: () ->
        <Alert bsStyle='danger' style={fontWeight:'bold'}>
            <p>
            Sorry, there has been an error creating the ticket.
            <br/>
            Please email <HelpEmailLink /> directly!  (NOTE: You can click "Help" again to reopen the support ticket form and copy your content to email.)
            </p>
            <p>Error message:</p>
            <pre>{@props.err}</pre>
        </Alert>

    created: () ->
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
              tabIndex = {4}
              onClick  = {@props.actions.new_ticket}>Create New Ticket</Button>
       </div>

    default: () ->
        title = @props.actions.project_title()
        if title?
            loc  = @props.actions.location()
            fn   = loc.slice(47) # / projects / uuid /
            what = <p>
                       If you have a problem involving "{fn}" in the
                       project "{title}", please create a support ticket below.
                   </p>
        else
            what = <p>
                       If you have a problem involving a specific project or file,
                       close this dialog, navigate to that file, then click on
                       {" "}<Icon name='medkit' />{" "}
                       in the top right corner to open it again.
                       Otherwise, please fill out this form.
                   </p>
        <div>
            <ul>
                <li>
                    <b>Looking for documentation and help?</b> Go to
                    the <a href="#{SmcWikiUrl}" target="_blank">CoCalc documentation</a>.
                </li>
                <li>
                    <b>Trying to sign out?</b>  Click on Account on the top right, then click
                    "Sign out..." in Preferences.
                </li>
                <li>
                    <a target="_blank" href="https://github.com/sagemathinc/cocalc/wiki/MySubscriptionDoesNotWork">Bought a subscription but it does not work?</a>
                </li>
                <li>
                    <a target="_blank" href="https://github.com/sagemathinc/cocalc/wiki/DeleteProject">Files or project seem gone?</a>
                </li>
                <li>
                    <a target="_blank" href="https://github.com/sagemathinc/cocalc/wiki/SageWorksheetWontRun">Sage worksheet or Jupyter notebook is very slow or will not run?</a>
                </li>
                <li>
                    <a target="_blank" href="https://github.com/sagemathinc/cocalc/wiki/KernelTerminated">Jupyter notebook keeps crashing with "Kernel terminated"?</a>
                </li>
                <li>
                    <a target="_blank" href="https://github.com/sagemathinc/cocalc/wiki/SageQuestion">Have a question about how to use Sage?</a>
                </li>
                <li>
                    <b>Requesting that we install software?</b> Fill out the form below and
                    include a complete example
                    that we can easily use to verify that we properly installed the software.
                </li>
                <li>
                    <b>Hit a bug or just need to talk with us?</b>  Fill out the form below...
                </li>
            </ul>

            <h2>Create a support ticket</h2>

            {what}
            <p>
                After submitting a ticket, you{"'"}ll receive a link, which you should save until
                you receive a confirmation email.
                You can also check the status of your ticket under "Support"
                in your account settings.
            </p>
        </div>

    render: ->
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

    shouldComponentUpdate: (props) ->
        return misc.is_different(@props, props, ['show_form', 'valid'])

    render: ->
        if @props.show_form
            btn = <Button bsStyle  = 'primary'
                          tabIndex = {4}
                          onClick  = {@props.submit}
                          disabled = {not @props.valid}>
                       <Icon name='medkit' /> Get Support
                   </Button>
        else
            btn = <span/>

        <Modal.Footer>
            {btn}
            <Button
                tabIndex  = {5}
                bsStyle   ='default'
                onClick   = {@props.close}>Close</Button>
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

    email_change: ->
        @props.actions.set_email(ReactDOM.findDOMNode(@refs.email).value)

    data_change: ->
        @props.actions.set
            body     : ReactDOM.findDOMNode(@refs.body).value
            subject  : ReactDOM.findDOMNode(@refs.subject).value

    render: ->
        if not @props.show
            return <div />

        ee = @props.email_err
        email_info = if ee?.length > 0
            <Alert bsStyle='danger'>
                 <div>{ee}</div>
            </Alert>
        else
            <Alert bsStyle='info'>
                Please make sure your email address is correct.
            </Alert>

        <form>
            <FormGroup validationState={if ee?.length > 0 then 'error'}>
                <FormControl
                    label       = 'Your email address'
                    ref         = 'email'
                    type        = 'text'
                    tabIndex    = {1}
                    placeholder = 'your_email@address.com'
                    value       = {@props.email}
                    onChange    = {@email_change} />
            </FormGroup>
            {email_info}
            <Space />
            <FormGroup>
                <FormControl
                    ref         = 'subject'
                    autoFocus
                    type        = 'text'
                    tabIndex    = {2}
                    label       = 'Message'
                    placeholder = "Subject ..."
                    value       = {@props.subject}
                    onChange    = {@data_change} />
            </FormGroup>
            <div style={margin:'10px', color:'#666'}>
                1. What did you do exactly?  2. What happened?  3. How did this differ from what you expected?
                <br/>
                <b><em>If your support request involves any files at all, include the link (the URL in your browser) to the file; otherwise, answering your question may take many extra hours.</em></b>
            </div>
            <FormGroup>
                <FormControl
                    componentClass = "textarea"
                    ref         = 'body'
                    tabIndex    = {3}
                    placeholder = 'Describe the problem ...'
                    rows        = {6}
                    value       = {@props.body}
                    onChange    = {@data_change} />
            </FormGroup>
        </form>


exports.Support = rclass
    displayName : 'Support-main'

    propTypes :
        actions : rtypes.object.isRequired

    getDefaultProps: ->
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

    componentWillReceiveProps: (newProps) ->
        newProps.actions.check_valid()

    open: ->
        @props.actions.show(true)

    close: ->
        @props.actions.show(false)

    submit: (event) ->
        event?.preventDefault()
        @props.actions.support()

    render: () ->
        show_form = false

        if (not @props.state?) or @props.state == STATE.NEW
            show_form = true

        <Modal bsSize={"large"} show={@props.show} onHide={@close} animation={false}>
            <Modal.Header closeButton>
                <Modal.Title><Icon name='medkit' /> Help</Modal.Title>
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

init_redux = (redux) ->
    if not redux.hasActions('support')
        redux.createStore('support', SupportStore, {})
        redux.createActions('support', SupportActions)
init_redux(redux)

# project wide public API

exports.ShowSupportLink = rclass
    displayName : 'ShowSupportLink'

    propTypes :
        text : rtypes.string

    getDefaultProps: ->
        text : 'support ticket'

    show: (evt) ->
        evt.preventDefault()
        redux.getActions('support').show(true)

    render: ->
        <a onClick={@show} href='#' style={cursor: 'pointer'}>
            {@props.text}
        </a>
