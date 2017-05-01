###
About dialog -- provides info about the Jupyter Notebook
###

Ansi = require('ansi-to-react')

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')
{Button, Modal} = require('react-bootstrap')
{Icon} = require('../r_misc')

exports.About = rclass
    propTypes :
        actions             : rtypes.object.isRequired
        about               : rtypes.bool
        backend_kernel_info : rtypes.immutable.Map

    close: ->
        @props.actions.setState(about:false)
        @props.actions.focus(true)

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
                <Modal.Title><Icon name='question-circle'/> About CoCalc Jupyter Notebook</Modal.Title>
            </Modal.Header>
            <Modal.Body>

                <p>
                    You are using the CoCalc Jupyter notebook.
                </p>

                <p style={color:'#666', margin: '0px 45px'}>
                    CoCalc Jupyter notebook is a complete rewrite by SageMath, Inc.
                    of the classical Jupyter notebook client from
                    the <a href="http://jupyter.org/" target="_blank">Jupyter project</a>.
                    CoCalc Jupyter notebook maintains full compatibility with the file format
                    and general look and feel of the classical notebook.
                    It improves on the classical notebook
                    in that it supports multiple simultaneous users, TimeTravel showing the history of
                    how a notebook was created, document-wide user-aware undo, a raw file edit mode,
                    a cleaner more modern look with buttons and menus that better reflect state,
                    more sophisticated handling of large output, and background
                    capturing of output even if no user has the notebook open in their browser.
                    Some functionality of classical
                    extensions and widgets are not yet supported (if you need
                    something, let us know).
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
