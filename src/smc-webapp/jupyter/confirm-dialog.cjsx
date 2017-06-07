"""
Confirmation dialog, for explicitly confirming dangerous actions.
"""

{Icon, Markdown} = require('../r_misc')
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

    render_title_icon: ->
        icon = @props.confirm_dialog?.get('icon')
        if icon?
            <Icon name={icon}/>

    render: ->
        # Show if the confirm_dailog prop is set, but the choice field is not set.
        <Modal
            show   = {@props.confirm_dialog? and not @props.confirm_dialog.get('choice')?}
            onHide = {@close} >
            <Modal.Header closeButton>
                <Modal.Title>{@render_title_icon()} {@props.confirm_dialog?.get('title')}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Markdown value={@props.confirm_dialog?.get('body')} />
            </Modal.Body>

            <Modal.Footer>
                {@render_buttons()}
            </Modal.Footer>
        </Modal>
