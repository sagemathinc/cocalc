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
{PathLink} = require('./project_new')


ProjectSupportForm = rclass
    displayName : 'ProjectSupport-form'

    propTypes :
        body    : rtypes.string.isRequired
        subject : rtypes.string.isRequired
        actions : rtypes.object.isRequired

    handle_change : ->
        @props.actions.setState(body     : @refs.project_support_body.getValue())
        @props.actions.setState(subject  : @refs.project_support_subject.getValue())

    render : ->
        <form onSubmit={@submit}>
            <Input
                ref         = 'project_support_subject'
                autoFocus
                type        = 'text'
                placeholder = "Subject ..."
                value       = {@props.subject}
                onChange    = {@handle_change} />
            <Input
                ref         = 'project_support_body'
                type        = 'textarea'
                placeholder = 'Describe the problem ...'
                value       = {@props.body}
                onChange    = {@handle_change} />
        </form>


ProjectSupport2 = (name) -> rclass
    displayName : 'ProjectSupport2-main'

    mixins: [ImmutablePureRenderMixin]

    getInitialState : ->
        show: false

    propTypes :
        actions     : rtypes.object.isRequired
        filepath    : rtypes.string

    getDefaultProps : ->
        subject : ''
        body    : ''
        status  : ''
        url     : ''
        error   : false

    reduxProps :
        "#{name}" :
            subject     : rtypes.string
            body        : rtypes.string
            status      : rtypes.string
            url         : rtypes.string
            error       : rtypes.bool

    open : ->
        @setState(show: true)

    close : ->
        @setState(show: false)

    submit : (event) ->
        event.preventDefault()
        @props.actions.support(@props.filepath)

    valid : () ->
        s = @props.subject.trim() isnt ''
        b = @props.body.trim() isnt ''
        return s and b

    render : ->
        if @props.url?.length > 1
            url = <a href={@props.url}>{@props.url}</a>
        else
            url = 'no ticket'

        <a data-toggle="tooltip" data-placement="bottom" title="Support" onClick={@open}>
            <Icon name='medkit' className="project-control-icon" />
            <Modal show={@state.show} onHide={@close}>
                <Modal.Header closeButton>
                    <Modal.Title>Support Ticket</Modal.Title>
                </Modal.Header>

                <Modal.Body>
                    <p>
                        Contact us about a problem you have by creating a support ticket.
                        The following additional data will be submitted and
                        you{"'"}ll receive a ticket number and a link to the ticket.
                        Keep it to stay in contact with us!

                        <ul>
                            <li>filepath: {@props.filepath ? 'no recent document'}</li>
                            <li>status: {@props.status}</li>
                            <li>ticket url: {url}</li>
                            <li>error: {@props.error}</li>
                        </ul>
                    </p>
                    <ProjectSupportForm
                        subject = {@props.subject}
                        body    = {@props.body}
                        actions = {@props.actions} />
                </Modal.Body>

                <Modal.Footer>
                    <Button bsStyle='default' onClick={@close}>Close</Button>
                    <Button bsStyle='primary' onClick={@submit} disabled={not @valid()}>
                        <Icon name='medkit' /> Get Support
                    </Button>
                </Modal.Footer>
            </Modal>
        </a>

render = (project_id, filepath, redux) ->
    store   = redux.getProjectStore(project_id)
    actions = redux.getProjectActions(project_id)

    # TODO how to properly store the filepath in this store?!?!
    ProjectSupport2_connected = ProjectSupport2(store.name)

    <Redux redux={redux}>
        <ProjectSupport2_connected
                filepath   = {filepath}
                actions    = {actions} />
    </Redux>

exports.render_project_support = (project_id, filepath, dom_node, redux) ->
    ReactDOM.render(render(project_id, filepath, redux), dom_node)

exports.unmount = (dom_node) ->
    #console.log("unmount project_support")
    ReactDOM.unmountComponentAtNode(dom_node)
