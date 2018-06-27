###
About dialog -- provides info about the Jupyter Notebook
###

Ansi = require('ansi-to-react')

{React, ReactDOM, rclass, rtypes}  = require('../app-framework')
{Button, Modal} = require('react-bootstrap')
{Icon} = require('../r_misc')

{ShowSupportLink} = require('../support')

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

    render_faq: ->
        <span>
            Read <a href='https://github.com/sagemathinc/cocalc/wiki/sagejupyter' target='_new'>documentation</a>, create a <ShowSupportLink />, or see the latest <a href='https://github.com/sagemathinc/cocalc/wiki/JupyterClassicModern' target='_blank'>status  of Jupyter in CoCalc.</a>
        </span>

    render_features: ->
        <ul style={marginTop:'10px', backgroundColor: '#eee'}>
            <li> Multiple people can simultaneously edit notebooks: multiple cursors, document-wide user-specific undo and redo</li>
            <li> TimeTravel shows detailed history of exactly how a notebook was created</li>
            <li> Zoom in and out for demos or tired eyes</li>
            <li> Code folding</li>
            <li> Modern look with buttons, menus and cell execution hints that better reflect state</li>
            <li> Sophisticated handling of large output: throttling, windowing, backend buffering</li>
            <li> Background capture of output even if no user has the notebook open</li>
            <li> Improved phone and tablet support</li>
            <li> Click blue line between cells to create new cells</li>
            <li> Easily sharing your work publicly with our client-side notebook viewer</li>
            <li> Raw file edit mode: synchronized editing of underlying ipynb file</li>
            <li> Easily export notebook to LaTeX, then edit the generated LaTeX with our integrated LaTeX editor</li>
            <li> VIM, Emacs, and Sublime keybindings, and color schemes (in account settings)</li>
        </ul>

    render: ->
        <Modal show={@props.about} bsSize="large" onHide={@close} >
            <Modal.Header closeButton>
                <Modal.Title><Icon name='question-circle'/> About CoCalc Jupyter notebook</Modal.Title>
            </Modal.Header>
            <Modal.Body>

                <p>
                    You are using the CoCalc Jupyter notebook.
                </p>

                <div style={color:'#666', margin: '0px 45px'}>
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
                </div>

                <h4>Questions</h4>
                {@render_faq()}

                <h4>Server Information</h4>
                {@render_server_info()}

                <h4>Current Kernel Information</h4>
                {@render_kernel_info()}
            </Modal.Body>

            <Modal.Footer>
                <Button onClick={@close}>Close</Button>
            </Modal.Footer>
        </Modal>
