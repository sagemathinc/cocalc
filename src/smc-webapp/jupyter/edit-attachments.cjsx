###
Modal for editing attachments that are attached to a markdown cell
###

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')
{Icon} = require('../r_misc')
{Button, Modal} = require('react-bootstrap')

ROW_STYLE =
    display      : 'flex'
    border       : '1px solid #ddd'
    padding      : '7px'
    borderRadius : '3px'

exports.EditAttachments = rclass
    propTypes :
        actions : rtypes.object.isRequired
        cell    : rtypes.immutable.Map

    shouldComponentUpdate: (nextProps) ->
        return nextProps.cell != @props.cell

    close: ->
        @props.actions.setState(edit_attachments: undefined)
        @props.actions.focus(true)

    delete_attachment: (name) ->
        @props.actions.delete_attachment_from_cell(@props.cell.get('id'), name)

    render_attachment: (name) ->
        <div key={name} width='100%' style={ROW_STYLE}>
            <div style={flex:1}>
                {name}
            </div>
            <div>
                <Button onClick={=>@delete_attachment(name)} bsStyle='danger'>
                    <Icon name='trash'/> Delete
                </Button>
            </div>
        </div>

    render_attachments: ->
        v = []
        @props.cell?.get('attachments')?.forEach (target, name) =>
            if v.length > 0
                v.push(<div style={marginTop:'7px'} key={name+'space'}></div>)
            v.push(@render_attachment(name))
        if v.length == 0
            return <span>There are no attachments. To attach images, use Edit -> Insert Image.</span>
        return v

    render: ->
        <Modal show={@props.cell?} onHide={@close} >
            <Modal.Header closeButton>
                <Modal.Title><Icon name='trash'/> Delete Cell Attachments</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {@render_attachments()}
            </Modal.Body>

            <Modal.Footer>
                <Button onClick={@close}>Close</Button>
            </Modal.Footer>
        </Modal>
