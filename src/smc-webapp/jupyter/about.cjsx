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

    render_features: ->
        <ul>
            <li> Multiple people can simultaneously edit notebooks: multiple cursors, document-wide user-aware undo and redo</li>
            <li> TimeTravel shows detailed history of exactly how a notebook was created</li>
            <li> Easy font resizing for demos (or tired eyes)</li>
            <li> Code folding</li>
            <li> Cleaner more modern look with buttons, menus and cell execution hints that better reflect state</li>
            <li> Sophisticated handling of large output (throttling, windowing, backend buffering)</li>
            <li> Background capture of execution output even if no user has the notebook open in their browser</li>
            <li> Improved phone and tablet support</li>
            <li> Easily sharing your work publicly with a client-side notebook viewer</li>
            <li> Raw file edit mode (synchronized editing of underlying JSON ipynb file)</li>
        </ul>

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
                    CoCalc Jupyter notebook is a complete open source rewrite by SageMath, Inc.
                    of the classical Jupyter notebook client from
                    the <a href="http://jupyter.org/" target="_blank">Jupyter project</a>.
                    CoCalc Jupyter notebook maintains full compatibility with the file format
                    and general look and feel of the classical notebook.
                    It improves on the classical notebook as follows:
                    {@render_features()}
                    Some functionality of classical
                    extensions and widgets are not yet supported (if you need
                    something, let us know), and of course some of the above is
                    also available in classical Jupyter via extensions.
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
