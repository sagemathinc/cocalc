###
Modal for editing cell metadata that are attached to any cell
###

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')
{Icon} = require('../r_misc')
{Button, Modal} = require('react-bootstrap')

exports.EditCellMetadata = rclass
    propTypes :
        actions : rtypes.object.isRequired
        cell    : rtypes.immutable.Map

    getInitialState: ->
        metadata : JSON.stringify(@props.cell.get('metadata')?.toJS() ? {})
        error    : undefined

    shouldComponentUpdate: (nextProps) ->
        return nextProps.cell != @props.cell

    componentDidMount: ->
        @init_codemirror()

    close: ->
        @props.actions.setState(edit_cell_metadata: undefined)
        @props.actions.focus(true)

    save: ->
        try
            metadata = JSON.parse(@state.metadata)
        catch error
            @setState(error: error)
            return
        @props.actions.set_cell_metadata(@props.cell.get('id'), metadata)

    render_directions: ->
        <span color='#666'>
            Manually edit the JSON below to manipulate the metadata for this cell.
        </span>

    render_editor: ->
        <textarea
            value={@state.metadata}
        >
        </textarea>

    render: ->
        <Modal show={@props.cell?} onHide={@close} >
            <Modal.Header closeButton>
                <Modal.Title><Icon name='trash'/> Edit Cell Metadata</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {@render_directions()}
                {@render_editor()}
            </Modal.Body>
            <Modal.Footer>
                <Button onClick={@close}>Close</Button>
            </Modal.Footer>
        </Modal>
