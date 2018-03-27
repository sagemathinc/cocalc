###
Modal for editing cell metadata that are attached to any cell
###

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')
{Icon, Space} = require('../r_misc')
{Button, Modal} = require('react-bootstrap')

{JSONEditor} = require('./json-editor')

exports.EditCellMetadata = rclass
    propTypes :
        actions    : rtypes.object.isRequired
        font_size  : rtypes.number
        id         : rtypes.string
        metadata   : rtypes.immutable.Map.isRequired
        cm_options : rtypes.immutable.Map.isRequired

    shouldComponentUpdate: (nextProps) ->
        return nextProps.metadata != @props.metadata or \
            nextProps.font_size != @props.font_size or \
            nextProps.cm_options != @props.cm_options

    close: ->
        @props.actions.setState(edit_cell_metadata: undefined)
        @props.actions.focus_unlock()

    render_directions: ->
        <span color='#666'>
            Manually edit the JSON below to manipulate the custom metadata for this cell.
            The JSON is automatically saved as long as it is valid.
        </span>

    render_note: ->
        <span color='#888'>
            NOTE: The metadata fields "collapsed", "scrolled", "slideshow", and "tags"
            are not visible above, and
            should only be edited through their own toolbar, the UI or via
            'View -> Show Notebook as Raw'.
        </span>


    on_change: (value) ->
        if not @props.id?
            return
        @props.actions.set_cell_metadata(id:@props.id, metadata:value)

    render_editor: ->
        <div style={fontSize:@props.font_size, border: '1px solid #ccc', margin: '5px', borderRadius: '3px'}>
            <JSONEditor
                value      = {@props.metadata}
                font_size  = {@props.font_size}
                on_change  = {@on_change}
                cm_options = {@props.cm_options}
                undo       = {@props.actions.undo}
                redo       = {@props.actions.redo}
            />
        </div>

    render: ->
        <Modal show={@props.id?} onHide={@close} >
            <Modal.Header closeButton>
                <Modal.Title><Icon name='edit'/> Edit Custom Cell Metadata</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {@render_directions()}
                {@render_editor()}
                {@render_note()}
            </Modal.Body>
            <Modal.Footer>
                <Button onClick={@close}>Close</Button>
            </Modal.Footer>
        </Modal>
