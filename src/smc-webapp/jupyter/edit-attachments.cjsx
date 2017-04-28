###
Modal for editing attachments that are attached to a markdown cell
###

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')
{Icon} = require('../r_misc')
{Button, Modal} = require('react-bootstrap')

exports.EditAttachments = rclass
    propTypes :
        actions : rtypes.object.isRequired
        cell    : rtypes.immutable.Map

    shouldComponentUpdate: (nextProps, nextState) ->
        return nextProps.edit_attachments != @props.edit_attachments

    close: ->
        @props.actions.setState(edit_attachments: undefined)
        @props.actions.focus(true)

    apply: ->

    render_attachments: ->

    render: ->
        <Modal show={@props.cell?} onHide={@close} >
            <Modal.Header closeButton>
                <Modal.Title><Icon name='file-image-o'/> Edit Cell Attachments</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                Current cell attachments
                {@render_attachments()}
            </Modal.Body>

            <Modal.Footer>
                <Button disabled={true} onClick={@apply} bsStyle='primary'>Apply</Button>
                <Button onClick={@close}>Cancel</Button>
            </Modal.Footer>
        </Modal>
