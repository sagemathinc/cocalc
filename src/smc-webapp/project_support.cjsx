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

underscore = require('underscore')

{React, ReactDOM, Actions, Store, rtypes, rclass, Redux}  = require('./smc-react')

{Col, Row, Button, Input, Well, Alert, Modal} = require('react-bootstrap')
{Icon, Loading, SearchInput, Space, ImmutablePureRenderMixin} = require('./r_misc')
misc            = require('smc-util/misc')
misc_page       = require('./misc_page')
{salvus_client} = require('./salvus_client')
{HelpEmailLink, SiteName} = require('./customize')
{PathLink} = require('./project_new')


ProjectSupportForm = rclass
    displayName : 'ProjectSupport-form'

    getDefaultProps : ->
        show        : true

    propTypes :
        support_body    : rtypes.string.isRequired
        support_subject : rtypes.string.isRequired
        show            : rtypes.bool.isRequired
        submit          : rtypes.func.isRequired
        actions         : rtypes.object.isRequired

    handle_change : ->
        @props.actions.setState(support_body     : @refs.project_support_body.getValue())
        @props.actions.setState(support_subject  : @refs.project_support_subject.getValue())

    render : ->
        if @props.show
            <form onSubmit={@props.submit}>
                <Input
                    ref         = 'project_support_subject'
                    autoFocus
                    type        = 'text'
                    placeholder = "Subject ..."
                    value       = {@props.support_subject}
                    onChange    = {@handle_change} />
                <Input
                    ref         = 'project_support_body'
                    type        = 'textarea'
                    placeholder = 'Describe the problem ...'
                    rows        = 6
                    value       = {@props.support_body}
                    onChange    = {@handle_change} />
            </form>
        else
            <div />


ProjectSupport = (name) -> rclass
    displayName : 'ProjectSupport-main'

    mixins: [ImmutablePureRenderMixin]

    propTypes :
        actions : rtypes.object.isRequired

    getDefaultProps : ->
        support_show        : false
        support_subject     : ''
        support_body        : ''
        support_state       : ''
        support_url         : ''
        support_err         : ''
        support_filepath    : ''

    reduxProps :
        "#{name}" :
            support_show         : rtypes.bool
            support_has_email    : rtypes.bool
            support_subject      : rtypes.string
            support_body         : rtypes.string
            support_state        : rtypes.string # '' ←→ {creating → created|error}
            support_url          : rtypes.string
            support_err          : rtypes.string
            support_filepath     : rtypes.string

    open : ->
        @props.actions.show_support_dialog(true)

    close : ->
        @props.actions.show_support_dialog(false)

    submit : (event) ->
        event.preventDefault()
        @props.actions.support()

    new : (event) ->
        @props.actions.support_new_ticket()

    valid : () ->
        s = @props.support_subject.trim() isnt ''
        b = @props.support_body.trim() isnt ''
        return s and b

    render : () ->
        if @props.support_url?.length > 1
            url = <a href={@props.support_url} target='_blank'>{@props.support_url}</a>
        else
            url = 'no ticket'

        show_form = true

        if not @props.support_has_email
            info = <p>To get support, you have to specify a valid email address in your account first!</p>
            show_form = false
        else
            switch @props.support_state
                when 'error'
                    show_form = false
                    info = <div style={fontWeight:'bold', fontSize: '120%'}>
                        Sorry, there has been an error creating the ticket.
                        Please email <HelpEmailLink /> directly!
                        <pre>
                            {"ERROR:" } {@props.err}
                        </pre>
                    </div>

                when 'creating'
                    show_form = false
                    info = <Loading />

                when 'created'
                    show_form = false
                    info = <div style={textAlign:'center'}>
                        <p>
                            Ticket has been created successfully.
                            Save this link for future reference:
                        </p>
                        <p style={fontSize:'120%'}>{url}</p>
                        <Button style={marginTop:'3em'}
                                bsStyle='info'
                                onClick={@new}>Create New Ticket</Button>
                    </div>

                else
                    if @props.support_filepath? and @props.support_filepath.length > 0
                        what = ["file ", <code key={1}>{@props.support_filepath}</code>]
                    else
                        what = "current project"
                    info = <div>
                        <p>
                            You have a problem in the {what}?
                            Tell us about it by creating a support ticket.
                        </p>
                        <p>
                            After successfully submitting it,
                            you{"'"}ll receive a ticket number and a link to the ticket.
                            Keep it to stay in contact with us!
                        </p>
                    </div>

        <Modal show={@props.support_show} onHide={@close}>
            <Modal.Header closeButton>
                <Modal.Title>Support Ticket</Modal.Title>
            </Modal.Header>

            <Modal.Body>
                {info}
                <ProjectSupportForm
                    support_subject = {@props.support_subject}
                    support_body    = {@props.support_body}
                    show            = {show_form}
                    submit          = {=> @props.submit()}
                    actions         = {@props.actions} />
            </Modal.Body>

            <Modal.Footer>
                <Button bsStyle='default' onClick={@close}>Close</Button>
                {<Button bsStyle='primary' onClick={@submit} disabled={not @valid()}>
                    <Icon name='medkit' /> Get Support
                </Button> if show_form}
            </Modal.Footer>
        </Modal>

render = (project_id, redux) ->
    store   = redux.getProjectStore(project_id)
    actions = redux.getProjectActions(project_id)

    ProjectSupport_connected = ProjectSupport(store.name)

    <Redux redux={redux}>
        <ProjectSupport_connected actions = {actions} />
    </Redux>

exports.render_project_support = (project_id, dom_node, redux) ->
    ReactDOM.render(render(project_id, redux), dom_node)

exports.unmount = unmount = (dom_node) ->
    ReactDOM.unmountComponentAtNode(dom_node)
