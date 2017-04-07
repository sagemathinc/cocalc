###
About dialog -- provides info about the Jupyter Notebook
###

Ansi = require('ansi-to-react')

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')
{Button, Modal} = require('react-bootstrap')

exports.About = rclass ({name}) ->
    propTypes :
        actions : rtypes.object.isRequired

    reduxProps:
        "#{name}" :
            about               : rtypes.bool
            backend_kernel_info : rtypes.immutable.Map

    close: ->
        @props.actions.setState(about:false)
        @props.actions.focus()

    render_server_info: ->
        version = @props.backend_kernel_info?.get('nodejs_version')
        if not version
            <div>Waiting for server to be available...</div>
        else
            <pre>Node.js Version {version}</pre>

    render_kernel_info: ->
        banner = @props.backend_kernel_info?.get('banner')
        if not banner?
            <div>Waiting for kernel to be available...</div>
        else
            <pre>
                <Ansi>
                    {banner}
                </Ansi>
            </pre>

    render: ->
        <Modal show={@props.about} bsSize="large" onHide={@close} >
            <Modal.Header closeButton>
                <Modal.Title>About CoCalc Jupyter Notebook</Modal.Title>
            </Modal.Header>
            <Modal.Body>

                <p>
                    You are using the CoCalc Jupyter notebook.
                </p>

                <p style={color:'#666'}>
                    CoCalc Jupyter notebook is a reimplementation by SageMath, Inc.
                    of both the Jupyter notebook client and server that was made popular
                    by the <a href="http://jupyter.org/" target="_blank">Jupyter project</a>.
                    CoCalc Jupyter notebook is better than the official Jupyter notebook
                    in that it supports TimeTravel showing the history of
                    how a notebook was created, document-wide undo, multiple
                    simultaneous people editing the same document, and
                    much, much more.  The main drawback is that official
                    extensions and widgets are not yet supported (if you need
                    something in an extension, let us know).
                </p>

                <h4>Server Information</h4>
                {@render_server_info()}

                <h4>Current Kernel Information</h4>
                {@render_kernel_info()}
            </Modal.Body>

            <Modal.Footer>
                <Button onClick={@close}>Close</Button>
            </Modal.Footer>
        </Modal>
