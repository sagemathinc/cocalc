###
Handling of output messages.

TODO: most components should instead be in separate files.
###

misc = require('smc-util/misc')

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')
{Icon, ImmutablePureRenderMixin, Markdown, HTML} = require('../r_misc')
{sanitize_html} = require('../misc_page')
{Button} = require('react-bootstrap')

Ansi = require('ansi-to-react')

{IFrame} = require('./cell-output-iframe')

{get_blob_url} = require('./server-urls')

{javascript_eval} = require('./javascript-eval')

OUT_STYLE =
    whiteSpace    : 'pre-wrap'
    wordWrap      : 'break-word'
    fontFamily    : 'monospace'
    paddingTop    : '5px'
    paddingBottom : '5px'
    paddingLeft   : '5px'

ANSI_STYLE      = OUT_STYLE
STDOUT_STYLE    = OUT_STYLE
STDERR_STYLE    = misc.merge({backgroundColor:'#fdd'}, STDOUT_STYLE)
TRACEBACK_STYLE = misc.merge({backgroundColor: '#f9f2f4'}, OUT_STYLE)

exports.Stdout = Stdout = rclass
    propTypes :
        message : rtypes.immutable.Map.isRequired

    mixins: [ImmutablePureRenderMixin]

    render: ->
        value = @props.message.get('text')
        if is_ansi(value)
            <div style={STDOUT_STYLE}>
                <Ansi>{value}</Ansi>
            </div>
        else
            <div style={STDOUT_STYLE}>
                {### This span below is solely to workaround an **ancient** Firefox bug ###}
                {### See https://github.com/sagemathinc/cocalc/issues/1958    ###}
                <span>{value}</span>
            </div>

exports.Stderr = Stderr = rclass
    propTypes :
        message : rtypes.immutable.Map.isRequired

    mixins: [ImmutablePureRenderMixin]

    render: ->
        # span below?  what? -- See https://github.com/sagemathinc/cocalc/issues/1958
        <div style={STDERR_STYLE}><span>{@props.message.get('text')}</span>
        </div>

Image = rclass
    propTypes:
        type       : rtypes.string.isRequired
        sha1       : rtypes.string   # one of sha1 or value should be given
        value      : rtypes.string
        project_id : rtypes.string
        width      : rtypes.number
        height     : rtypes.number

    getInitialState: ->
        attempts : 0

    load_error: ->
        if @state.attempts < 5 and @_is_mounted
            f = =>
                if @_is_mounted
                    @setState(attempts : @state.attempts + 1)
            setTimeout(f, 500)

    componentDidMount: ->
        @_is_mounted = true

    componentWillUnmount: ->
        @_is_mounted = false

    extension: ->
        return @props.type.split('/')[1].split('+')[0]

    render_using_server: ->
        src = get_blob_url(@props.project_id, @extension(), @props.sha1) + "&attempts=#{@state.attempts}"
        return <img src={src} onError={@load_error} width={@props.width} height={@props.height} />

    encoding: ->
        switch @props.type
            when "image/svg+xml"
                return 'utf8'
            else
                return 'base64'

    render_locally: ->
        src = "data:#{@props.type};#{@encoding()},#{@props.value}"
        return <img src={src}  width={@props.width} height={@props.height}/>

    render: ->
        if @props.value?
            return @render_locally()
        else if @props.sha1? and @props.project_id?
            return @render_using_server()
        else # not enough info to render
            return <span>[unavailable {@extension()} image]</span>

TextPlain = rclass
    propTypes:
        value : rtypes.string.isRequired

    render: ->
        <div style={STDOUT_STYLE}>
            {### span?  what? -- See https://github.com/sagemathinc/cocalc/issues/1958 ###}
            <span>{@props.value}</span>
        </div>

UntrustedJavascript = rclass
    propTypes:
        value : rtypes.oneOfType([rtypes.object, rtypes.string]).isRequired

    render: ->
        <span style={color:'#888'}>
            (not running untrusted Javascript)
        </span>

Javascript = rclass
    propTypes:
        value : rtypes.oneOfType([rtypes.object, rtypes.string]).isRequired

    componentDidMount: ->
        element = $(ReactDOM.findDOMNode(@))
        element.empty()
        value = @props.value
        if typeof(value) != 'string'
            value = value.toJS()
        if not misc.is_array(value)
            value = [value]
        for line in value
            javascript_eval(line, element)

    render: ->
        <div></div>

PDF = rclass
    propTypes:
        project_id : rtypes.string
        value      : rtypes.oneOfType([rtypes.object, rtypes.string]).isRequired

    render: ->
        if misc.is_string(@props.value)
            href  = get_blob_url(@props.project_id, 'pdf', @props.value)
        else
            value = @props.value.get('value')
            href = "data:application/pdf;base64,#{value}"
        <div style={OUT_STYLE}>
            <a href={href} target='_blank' style={cursor:'pointer'}>
                View PDF
            </a>
        </div>

Data = rclass
    propTypes:
        message    : rtypes.immutable.Map.isRequired
        project_id : rtypes.string
        directory  : rtypes.string
        id         : rtypes.string
        actions    : rtypes.object
        trust      : rtypes.bool

    mixins: [ImmutablePureRenderMixin]

    render_html: (value) ->
        <div>
            <HTML
                value            = {value}
                auto_render_math = {true}
                project_id       = {@props.project_id}
                file_path        = {@props.directory}
                safeHTML         = {not @props.trust}
            />
        </div>

    render_markdown: (value) ->
        <div>
            <Markdown
                value          = {value}
                project_id     = {@props.project_id}
                file_path      = {@props.directory}
                safeHTML       = {not @props.trust}
                checkboxes     = {true}
            />
        </div>

    render: ->
        type  = undefined
        value = undefined
        data = @props.message.get('data')
        data?.forEach? (v, k) ->
            type  = k
            value = v
            return false
        if type
            [a, b] = type.split('/')
            switch a
                when 'text'
                    switch b
                        when 'plain'
                            if is_ansi(value)
                                return <div style={STDOUT_STYLE}><Ansi>{value}</Ansi></div>
                            else
                                return <TextPlain value={value}/>
                        when 'html', 'latex'  # put latex as HTML, since jupyter requires $'s anyways.
                            return @render_html(value)
                        when 'markdown'
                            return @render_markdown(value)
                when 'image'
                    height = width = undefined
                    @props.message.get('metadata')?.forEach? (value, key) =>
                        if key == 'width'
                            width = value
                        else if key == 'height'
                            height = value
                        else
                            # sometimes metadata is e.g., "image/png":{width:, height:}
                            value?.forEach? (value, key) =>
                                if key == 'width'
                                    width = value
                                else if key == 'height'
                                    height = value
                    return <Image
                        project_id = {@props.project_id}
                        type       = {type}
                        sha1       = {value if typeof(value) == 'string'}
                        value      = {value.get('value') if typeof(value) == 'object'}
                        width      = {width}
                        height     = {height}
                        />

                when 'iframe'
                    return <IFrame sha1={value} project_id={@props.project_id}/>

                when 'application'
                    switch b
                        when 'javascript'
                            if @props.trust
                                return <Javascript value={value} />
                            else
                                return <UntrustedJavascript value={value} />

                        when 'pdf'
                            return <PDF value={value} project_id = {@props.project_id}/>

        return <pre>Unsupported message: {JSON.stringify(@props.message.toJS())}</pre>

Traceback = rclass
    propTypes :
        message : rtypes.immutable.Map.isRequired

    mixins: [ImmutablePureRenderMixin]

    render: ->
        v = []
        n = 0
        @props.message.get('traceback').forEach (x) ->
            if not misc.endswith(x, '\n')
                x += '\n'
            v.push(<Ansi key={n}>{x}</Ansi>)
            n += 1
            return
        <div style={TRACEBACK_STYLE}>
            {v}
        </div>

MoreOutput = rclass
    propTypes :
        message : rtypes.immutable.Map.isRequired
        actions : rtypes.object  # if not set, then can't get more ouput
        id      : rtypes.string.isRequired

    shouldComponentUpdate: (next) ->
        return next.message != @props.message

    show_more_output: ->
        @props.actions?.fetch_more_output(@props.id)

    render: ->
        if not @props.actions? or @props.message.get('expired')
            <Button bsStyle = "info" disabled>
                <Icon name='eye-slash'/> Additional output not available
            </Button>
        else
            <Button onClick={@show_more_output} bsStyle = "info">
                <Icon name='eye'/> Fetch additional output...
            </Button>

INPUT_STYLE =
    padding : '0em 0.25em'
    margin  : '0em 0.25em'

InputDone = rclass
    propTypes :
        message : rtypes.immutable.Map.isRequired

    render: ->
        value = @props.message.get('value') ? ''
        <div style={STDOUT_STYLE}>
            {@props.message.getIn(['opts', 'prompt']) ? ''}
            <input
                style       = {INPUT_STYLE}
                type        = {if @props.message.getIn(['opts', 'password']) then 'password' else 'text'}
                size        = {Math.max(47, value.length + 10)}
                readOnly    = {true}
                value       = {value}
            />
        </div>

Input = rclass
    propTypes :
        message : rtypes.immutable.Map.isRequired
        actions : rtypes.object
        id      : rtypes.string.isRequired

    getInitialState: ->
        value : ''

    key_down: (evt) ->
        if evt.keyCode == 13
            evt.stopPropagation()
            @submit()
        # Official docs: If the user hits EOF (*nix: Ctrl-D, Windows: Ctrl-Z+Return), raise EOFError.
        # The Jupyter notebook does *NOT* properly implement this.  We do something at least similar
        # and send an interrupt on control d or control z.
        if (evt.keyCode == 68 or evt.keyCode == 90) and evt.ctrlKey
            evt.stopPropagation()
            @props.actions?.signal('SIGINT')
            setTimeout(@submit, 10)

    submit: ->
        @props.actions?.submit_input(@props.id, @state.value)
        @props.actions?.focus_unlock()

    render: ->
        <div style={STDOUT_STYLE}>
            {@props.message.getIn(['opts', 'prompt']) ? ''}
            <input
                style       = {INPUT_STYLE}
                autoFocus   = {true}
                readOnly    = {not @props.actions?}
                type        = {if @props.message.getIn(['opts', 'password']) then 'password' else 'text'}
                ref         = 'input'
                size        = {Math.max(47, @state.value.length + 10)}
                value       = {@state.value}
                onChange    = {(e) => @setState(value: e.target.value)}
                onBlur      = {@props.actions?.focus_unlock}
                onFocus     = {@props.actions?.blur_lock}
                onKeyDown   = {@key_down}
            />
        </div>


NotImplemented = rclass
    propTypes :
        message : rtypes.immutable.Map.isRequired

    mixins: [ImmutablePureRenderMixin]

    render: ->
        <pre style={STDERR_STYLE}>
            {JSON.stringify(@props.message.toJS())}
        </pre>


message_component = (message) ->
    if message.get('more_output')?
        return MoreOutput
    if message.get('name') == 'stdout'
        return Stdout
    if message.get('name') == 'stderr'
        return Stderr
    if message.get('name') == 'input'
        if message.get('value')?
            return InputDone
        else
            return Input
    if message.get('data')?
        return Data
    if message.get('traceback')?
        return Traceback
    return NotImplemented

exports.CellOutputMessage = CellOutputMessage = rclass
    propTypes :
        message    : rtypes.immutable.Map.isRequired
        project_id : rtypes.string
        directory  : rtypes.string
        actions    : rtypes.object  # optional  - not needed by most messages
        id         : rtypes.string  # optional, and not usually needed either
        trust      : rtypes.bool    # is notebook trusted by the user (if not won't eval javascript)

    render: ->
        C = message_component(@props.message)
        <C
            message    = {@props.message}
            project_id = {@props.project_id}
            directory  = {@props.directory}
            actions    = {@props.actions}
            trust      = {@props.trust}
            id         = {@props.id}
            />

OUTPUT_STYLE =
    flex            : 1
    overflowX       : 'auto'
    lineHeight      : 'normal'
    backgroundColor : '#fff'
    border          : 0
    marginBottom    : 0
    marginLeft      : '1px'

OUTPUT_STYLE_SCROLLED = misc.merge({maxHeight:'40vh'}, OUTPUT_STYLE)

exports.CellOutputMessages = rclass
    propTypes :
        actions    : rtypes.object  # optional actions
        output     : rtypes.immutable.Map.isRequired  # the actual messages
        project_id : rtypes.string
        directory  : rtypes.string
        scrolled   : rtypes.bool
        trust      : rtypes.bool
        id         : rtypes.string

    shouldComponentUpdate: (next) ->
        return \
            next.output   != @props.output or \
            next.scrolled != @props.scrolled or \
            next.trust    != @props.trust

    render_output_message: (n, mesg) ->
        if not mesg?
            return
        <CellOutputMessage
            key        = {n}
            message    = {mesg}
            project_id = {@props.project_id}
            directory  = {@props.directory}
            actions    = {@props.actions}
            trust      = {@props.trust}
            id         = {@props.id}
        />

    message_list: ->
        v = []
        k = 0
        # TODO: use caching to make this more efficient...
        for n in [0...@props.output.size]
            mesg = @props.output.get("#{n}")
            # Make this renderer robust against any possible weird shap of the actual
            # output object, e.g., undefined or not immmutable js.
            # Also, we're checking that get is defined --
            #   see https://github.com/sagemathinc/cocalc/issues/2404
            if not mesg?.get?
                continue
            name = mesg.get('name')
            if k > 0 and (name == 'stdout' or name == 'stderr') and v[k-1].get('name') == name
                # combine adjacent stdout / stderr messages...
                v[k-1] = v[k-1].set('text', v[k-1].get('text') + mesg.get('text'))
            else
                v[k] = mesg
                k += 1
        return v

    render: ->
        # (yes, I know n is a string in the next line, but that's fine since it is used only as a key)
        v = (@render_output_message(n, mesg) for n, mesg of @message_list())
        <div
            style     = {if @props.scrolled then OUTPUT_STYLE_SCROLLED else OUTPUT_STYLE}
            className = 'cocalc-jupyter-rendered'
            >
            {v}
        </div>

is_ansi = (s) ->
    return s? and s.indexOf("\u001b") != -1
