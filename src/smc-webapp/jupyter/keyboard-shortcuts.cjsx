"""
The keyboard shortcuts and command listing dialog, which:

  - lets you search through all available commands
  - see and change the keyboard shortcuts for those commands
"""

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')
{Button, Modal} = require('react-bootstrap')

exports.KeyboardShortcuts = rclass
    propTypes :
        actions            : rtypes.object.isRequired
        keyboard_shortcuts : rtypes.immutable.Map

    close: ->
        @props.actions.close_keyboard_shortcuts()
        @props.actions.focus()

    render: ->
        <Modal show={@props.keyboard_shortcuts?.get('show')} bsSize="large" onHide={@close} >
            <Modal.Header closeButton>
                <Modal.Title>Jupyter Notebook Commands and Keyboard Shortcuts</Modal.Title>
            </Modal.Header>
            <Modal.Body>

            </Modal.Body>

            <Modal.Footer>
                <Button onClick={@close}>Close</Button>
            </Modal.Footer>
        </Modal>
