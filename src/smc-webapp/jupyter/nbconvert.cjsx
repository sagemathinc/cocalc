###
NBConvert dialog -- for running nbconvert
###


{React, ReactDOM, rclass, rtypes}  = require('../smc-react')
TimeAgo = require('react-timeago').default
{Button, Modal} = require('react-bootstrap')

misc = require('smc-util/misc')

NAMES =
    python   : {ext:'py'         , display:'Python'}
    html     : {ext:'html'       , display:'HTML'}
    markdown : {ext:'md'         , display:'Markdown'}
    rst      : {ext:'rst'        , display:'ReST'}
    asciidoc : {ext:'asciidoc'   , display:'AsciiDoc'}
    slides   : {ext:'slides.html', display:'Slides'}
    latex    : {ext:'tex'        , display:'LaTeX'}
    pdf      : {ext:'pdf'        , display:'PDF'}

Error = rclass
    propTypes :
        actions          : rtypes.object.isRequired
        nbconvert        : rtypes.immutable.Map

    componentDidMount: ->
        d = $(ReactDOM.findDOMNode(@refs.pre))
        d.scrollTop(d.prop("scrollHeight"))

    render: ->
        error = @props.nbconvert.get('error')
        if not error
            return <span/>
        if not misc.is_string(error)
            @props.actions.nbconvert_get_error()
            return <Loading/>
        else
            <span>
                <h3>Error</h3>
                Running nbconvert failed with an error.  Read the error log below, update your Jupyter
                notebook, then try again.
                <pre ref='pre' style={maxHeight: '40vh', margin: '5px 30px'}>
                    {error}
                </pre>
            </span>

exports.NBConvert = rclass
    propTypes :
        actions          : rtypes.object.isRequired
        path             : rtypes.string.isRequired
        nbconvert        : rtypes.immutable.Map
        nbconvert_dialog : rtypes.immutable.Map

    close: ->
        @props.actions.setState(nbconvert_dialog:undefined)
        @props.actions.focus(true)

    render_download_link: ->
        if @props.nbconvert.get('error')
            return
        target_path = misc.change_filename_extension(@props.path, NAMES[@props.nbconvert_dialog.get('to')]?.ext)
        <div>
            <br/>
            <a  style   = {cursor:'pointer'}
                onClick = {=>@props.actions.file_action('download', target_path); @close()}
            >
                Download {target_path}...
            </a>
        </div>

    render_open_link: ->
        if @props.nbconvert.get('error')
            return
        target_path = misc.change_filename_extension(@props.path, NAMES[@props.nbconvert_dialog.get('to')]?.ext)
        <div>
            <br/>
            <a  style   = {cursor:'pointer'}
                onClick = {=>@props.actions.file_action('open_file', target_path); @close()}
            >
                Open {target_path}...
            </a>
        </div>

    render_recent_run: ->
        time = @props.nbconvert.get('time')
        if not time?
            return
        if time < misc.server_minutes_ago(3)  # only show recent
            return
        # Only show if is the same target output
        <div>
            Last export via
            {@render_cmd()}
            <Error actions={@props.actions} nbconvert={@props.nbconvert} />
            {@render_download_link()}
            {@render_open_link()}
        </div>

    render_cmd: ->
        cmd = "nbconvert #{@args().join(' ')} #{@props.path}"
        <pre  style={margin: '15px 30px', overflowX: 'auto'}>{cmd}</pre>

    render_started: ->
        start = @props.nbconvert?.get('start')
        if not start?
            return
        <span>
            (started <TimeAgo title='' date={new Date(start)} minPeriod={1000} />)
        </span>

    render_current: ->
        if not @props.nbconvert_dialog?
            return
        state = @props.nbconvert?.get('state')
        args  = @props.nbconvert?.get('args')?.toJS()
        if args?
            cmd = "nbconvert #{args.join(' ')} #{@props.path}"
        switch state
            when 'start'
                <div>Requesting to run
                    {@render_cmd()}
                </div>
            when 'run'
                <div>Currently running... {@render_started()}
                    {@render_cmd()}
                </div>
            when 'done'
                return @render_recent_run()

    args: ->
        return ['--to', @props.nbconvert_dialog.get('to')]

    run: ->
        @props.actions.nbconvert(@args())

    render_run_button: ->
        if not @props.nbconvert_dialog?
            return
        state = @props.nbconvert?.get('state')
        <div>
            <Button
                onClick  = {@run}
                bsStyle  = 'success'
                disabled = {state in ['start', 'run']}
            >
                Run Export Command...
            </Button>
        </div>

    target_name: ->
        to = @props.nbconvert_dialog?.get('to')
        if to?
            return NAMES[to]?.display
        else
            return ''

    render: ->
        <Modal show={@props.nbconvert_dialog?} bsSize="large" onHide={@close} >
            <Modal.Header closeButton>
                <Modal.Title>Export to {@target_name()}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {@render_run_button()}
                {@render_current()}
            </Modal.Body>

            <Modal.Footer>
                <Button onClick={@close}>Close</Button>
            </Modal.Footer>
        </Modal>
