"""
The find and replace modal dialog
"""

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')
{Button, Modal} = require('react-bootstrap')

exports.FindAndReplace = rclass
    propTypes :
        actions          : rtypes.object.isRequired
        find_and_replace : rtypes.immutable.Map

    close: ->
        @props.actions.close_find_and_replace()
        @props.actions.focus()

    render: ->
        <Modal show={@props.find_and_replace?.get('show')} bsSize="large" onHide={@close} >
            <Modal.Header closeButton>
                <Modal.Title>Find and Replace</Modal.Title>
            </Modal.Header>
            <Modal.Body>

            </Modal.Body>

            <Modal.Footer>
                <Button onClick={@close}>Close</Button>
                <Button onClick={@replace_all}>Replace All</Button>
            </Modal.Footer>
        </Modal>
