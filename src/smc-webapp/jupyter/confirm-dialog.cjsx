"""
Confirmation dialog, for explicitly confirming dangerous actions.
"""

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')
{Button, Modal} = require('react-bootstrap')

exports.ConfirmDialog = rclass
    propTypes :
        actions        : rtypes.object.isRequired
        confirm_dialog : rtypes.immutable.Map

    close: ->
        @props.actions.close_confirm_dialog()
        @props.actions.focus(true)

    render_button: (choice) ->
        <Button
            key       = {choice.get('title')}
            bsStyle   = {choice.get('style')}
            autoFocus = {choice.get('default')}
            onClick   = {=> @props.actions.close_confirm_dialog(choice.get('title'))}
        >
            {choice.get('title')}
        </Button>

    render_buttons: ->
        v = []
        @props.confirm_dialog?.get('choices')?.forEach (choice) =>
            v.push(@render_button(choice))
        return v

    render: ->
        # Show if the confirm_dailog prop is set, but the choice field is not set.
        <Modal
            show   = {@props.confirm_dialog? and not @props.confirm_dialog.get('choice')?}
            onHide = {@close} >
            <Modal.Header closeButton>
                <Modal.Title>{@props.confirm_dialog?.get('title')}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {@props.confirm_dialog?.get('body')}
            </Modal.Body>

            <Modal.Footer>
                {@render_buttons()}
            </Modal.Footer>
        </Modal>
