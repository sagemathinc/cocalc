###
Modal for inserting an image
###

{React, ReactDOM, rclass, rtypes}  = require('../app-framework')
{Icon} = require('../r_misc')
{Button, Modal} = require('react-bootstrap')
{SMC_Dropzone} = require('../smc-dropzone')

TMP = '.smc/tmp'  # TODO: maybe .smc will change...

exports.InsertImage = rclass
    propTypes :
        actions      : rtypes.object.isRequired
        project_id   : rtypes.string.isRequired
        cur_id       : rtypes.string.isRequired  # id of cell we are inserting image into
        insert_image : rtypes.bool

    shouldComponentUpdate: (nextProps, nextState) ->
        return nextProps.insert_image != @props.insert_image

    close: ->
        @props.actions.setState(insert_image: false)
        @props.actions.focus(true)

    add_file: (file) ->
        @props.actions.add_attachment_to_cell(@props.cur_id, TMP + '/' + file.name)

    render: ->
        <Modal show={@props.insert_image} bsSize='large' onHide={@close} >
            <Modal.Header closeButton>
                <Modal.Title><Icon name='file-image-o'/> Pick image files to attach to this markdown cell</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <SMC_Dropzone
                    project_id       = {@props.project_id}
                    current_path     = {TMP}
                    dropzone_handler = { addedfile: @add_file }
                />
            </Modal.Body>

            <Modal.Footer>
                <Button onClick={@close}>Done</Button>
            </Modal.Footer>
        </Modal>
