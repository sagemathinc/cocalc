###
Modal for inserting an image
###

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')
{Icon} = require('../r_misc')
{Button, Modal} = require('react-bootstrap')
{SMC_Dropzone} = require('../smc-dropzone')

exports.InsertImage = rclass
    propTypes :
        actions      : rtypes.object.isRequired
        project_id   : rtypes.string.isRequired
        cur_id       : rtypes.string.isRequired  # id of cell we are inserting image into
        insert_image : rtypes.bool

    shouldComponentUpdate: (nextProps, nextState) ->
        return nextProps.insert_image != @props.insert_image or \
                nextState.path != @state.path

    getInitialState: ->
        path : undefined

    close: ->
        @props.actions.setState(insert_image: false)
        @props.actions.focus(true)

    ok: ->

    handle_change: (e) ->
        @setState(path: e.target.value)

    render: ->
        <Modal show={@props.insert_image} bsSize='large' onHide={@close} >
            <Modal.Header closeButton>
                <Modal.Title><Icon name='file-image-o'/> Pick image files to attach to this markdown cell</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <SMC_Dropzone
                    project_id       = {@props.project_id}
                    current_path     = {'.smc/tmp'}
                    dropzone_handler = { {} }
                />
            </Modal.Body>

            <Modal.Footer>
                <Button disabled={not @state.path} onClick={@ok} bsStyle='primary'>OK</Button>
                <Button onClick={@close}>Cancel</Button>
            </Modal.Footer>
        </Modal>
