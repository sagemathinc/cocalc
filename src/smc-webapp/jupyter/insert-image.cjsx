###
Modal for inserting an image
###

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')
{Icon} = require('../r_misc')
{Button, Modal} = require('react-bootstrap')


exports.InsertImage = rclass
    propTypes :
        actions      : rtypes.object.isRequired
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
        console.log 'render', @props.insert_image
        <Modal show={@props.insert_image} onHide={@close} >
            <Modal.Header closeButton>
                <Modal.Title><Icon name='file-image-o'/> Pick an image file</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <form>
                    <fieldset style={lineHeight:1} >
                        <label htmlFor='file'>Select a file to insert.</label>
                        <br />
                        <input type='file' accept='image/*' name='file' onChange={@handle_change} />
                    </fieldset>
                </form>
            </Modal.Body>

            <Modal.Footer>
                <Button disabled={not @state.path} onClick={@ok} bsStyle='primary'>OK</Button>
                <Button onClick={@close}>Cancel</Button>
            </Modal.Footer>
        </Modal>
