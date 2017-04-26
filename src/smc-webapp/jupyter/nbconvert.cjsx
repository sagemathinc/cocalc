###
NBConvert dialog -- for running nbconvert
###

{Icon, Loading} = require('../r_misc')
{React, ReactDOM, rclass, rtypes}  = require('../smc-react')
TimeAgo = require('react-timeago').default
{Button, ButtonGroup, Modal} = require('react-bootstrap')

misc = require('smc-util/misc')

immutable = require('immutable')

NAMES =
    python   : {ext:'py'         , display:'Python',   internal:true}
    html     : {ext:'html'       , display:'HTML'}
    markdown : {ext:'md'         , display:'Markdown', internal:true}
    rst      : {ext:'rst'        , display:'reST',     internal:true}
    asciidoc : {ext:'asciidoc'   , display:'AsciiDoc'}
    slides   : {ext:'slides.html', display:'Slides'}
    latex    : {ext:'tex'        , display:'LaTeX',    internal:true}
    pdf      : {ext:'pdf'        , display:'PDF'}
    script   : {ext:'txt'        , display:'Executable Script', internal:true}

Error = rclass
    propTypes :
        actions          : rtypes.object.isRequired
        nbconvert        : rtypes.immutable.Map

    componentDidMount: ->
       setTimeout((()=>@scroll()),10)

    componentWillReceiveProps: (next) ->
        if not misc.is_string(@props.nbconvert.get('error')) and misc.is_string(next.nbconvert.get('error'))
            setTimeout((()=>@scroll()),10)

    scroll: ->
        d = $(ReactDOM.findDOMNode(@refs.pre))
        d.scrollTop(d.prop("scrollHeight"))

    render_time: ->
        time = @props.nbconvert?.get('time')
        if not time?
            return
        <b><TimeAgo title='' date={new Date(time)} minPeriod={5} /></b>

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
                Running nbconvert failed with an error {@render_time()}.  Read the error log below, update your Jupyter
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

    render_edit: (target_path) ->
        <div>
            <br />
            <Button
                onClick = {=>@props.actions.file_action('open_file', target_path); @close()}
            >
                Edit exported file...
            </Button>
        </div>

    render_download: ->
        if @props.nbconvert.get('error')
            return
        info = NAMES[@props.nbconvert_dialog.get('to')]
        if not info?
            return
        target_path = misc.change_filename_extension(@props.path, info.ext)
        url = @props.actions.store.get_raw_link(target_path)
        <div style={fontSize: '14pt'}>
            <a href={url} target="_blank">{target_path}</a>
            {@render_edit(target_path) if info.internal}
        </div>

    render_result: ->
        if @props.nbconvert?.get('error')
            <Error actions={@props.actions} nbconvert={@props.nbconvert} />

    render_recent_run: ->
        time = @props.nbconvert?.get('time')
        if not time?
            return
        if time < misc.server_minutes_ago(5)  # only show if recent
            return
        if not @props.nbconvert?.get('args')?.equals(immutable.fromJS(@args()))
            # Only show if same args.
            return
        time = <b><TimeAgo title='' date={new Date(time)} minPeriod={5} /></b>
        <div style={marginTop:'15px'} >
            Last exported {time}.
            {@render_cmd()}
            {@render_result()}
            <ButtonGroup>
                {@render_download()}
            </ButtonGroup>
        </div>

    render_cmd: ->
        cmd = "nbconvert #{@args().join(' ')} #{@props.path}"
        <pre  style={margin: '15px 0px', overflowX: 'auto'}>{cmd}</pre>

    render_started: ->
        start = @props.nbconvert?.get('start')
        if not start?
            return
        <span>
            (started <TimeAgo title='' date={new Date(start)} minPeriod={1} />)
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
                <div style={marginTop:'15px'}>
                    Requesting to run
                    {@render_cmd()}
                </div>
            when 'run'
                <div style={marginTop:'15px'}>
                    Running... {@render_started()}
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
                bsSize   = 'large'
                disabled = {state in ['start', 'run']}
            >
                Export to {@target_name()}...
            </Button>
        </div>

    nbconvert_docs: ->
        <a
            href   = 'http://nbconvert.readthedocs.io/en/latest/usage.html'
            target = '_blank'
            className = 'pull-right'
        >
            <Icon name="external-link"/> nbconvert documentation
        </a>

    target_name: ->
        to = @props.nbconvert_dialog?.get('to')
        if to?
            return NAMES[to]?.display
        else
            return ''

    render: ->
        <Modal show={@props.nbconvert_dialog?} bsSize="large" onHide={@close} >
            <Modal.Header closeButton>
                <Modal.Title>Download</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {@nbconvert_docs()}
                {@render_run_button()}
                {@render_current()}
            </Modal.Body>

            <Modal.Footer>
                <Button onClick={@close}>Close</Button>
            </Modal.Footer>
        </Modal>
