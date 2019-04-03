###
Rendering output part of a Sage worksheet cell
###

{rclass, React, rtypes} = require('../app-framework')

misc = require('smc-util/misc')

{FLAGS} = require('smc-util/sagews')

{Stdout} = require('../jupyter/output-messages/stdout')
{Stderr} = require('../jupyter/output-messages/stderr')

{HTML, Markdown} = require('../r_misc')

{fromJS} = require('immutable')

{CodeMirrorStatic} = require('../jupyter/codemirror-static')

exports.CellOutput = rclass
    displayName: "SageCell-Output"

    propTypes :
        output : rtypes.object.isRequired
        flags  : rtypes.string

    render_auto: ->
        # This is deprecated, but can be in some older worksheets.
        # It should do nothing for static rendering.
        return <span/>

    render_stdout: (value, key) ->
        <Stdout key={key} message={fromJS(text:value)} />

    render_stderr: (value, key) ->
        <Stderr key={key} message={fromJS(text:value)} />

    render_md: (value, key) ->
        <Markdown key={key} value={value} />

    render_html: (value, key) ->
        <HTML key={key} value={value} auto_render_math={true} />

    render_interact: (value, key) ->
        <div key={key}>
            Interact: please open in CoCalc
        </div>

    render_d3: (value, key) ->
        <div key={key}>
            d3-based renderer not yet implemented
        </div>

    render_file: (value, key) ->
        console.log 'RENDER_FILE *** ', window.app_base_url
        if value.show? and not value.show
            return
        if value.url?
            target = value.url
        else
            target = "#{window.app_base_url ? ''}/blobs/#{misc.encode_path(value.filename)}?uuid=#{value.uuid}"
        ext = misc.filename_extension(value.filename).toLowerCase()
        switch ext
            when 'svg', 'png', 'gif', 'jpg', 'jpeg'
                return <img key={key} src={target} />
            when 'sage3d'
                return @render_3d(value.filename, key)
            when 'webm'
                return <video key={key} src={target} controls></video>
            else
                if value.text
                    text = value.text
                else
                    text = value.filename
                return <a key={key} href={target} target='_blank'>{text}</a>

    render_3d: (filename, key) ->
        return <div key={key}>
            3D rendering not yet implemented
        </div>

    render_code: (value, key) ->
        options = fromJS({mode:{name:value.mode}})
        <CodeMirrorStatic
            key     = {key}
            value   = {value.source ? ''}
            options = {options}
            style   = {background:'white', padding:'10px'}
        />

    render_tex: (value, key) ->
        html = "$#{value.tex}$"
        if value.display
            html = "$#{html}$"
        <div key={key}>
            <HTML value={html} auto_render_math={true} />
        </div>

    render_raw_input: (value, key) ->
        {prompt, value} = value
        <div key={key}>
            <b>{prompt}</b>
            <input
                style       = {padding: '0em 0.25em', margin: '0em 0.25em'}
                type        = 'text'
                size        = {Math.max(47, value.length + 10)}
                readOnly    = {true}
                value       = {value}
            />
        </div>

    render_output_mesg: (elts, mesg) ->
        for type, value of mesg
            f = @["render_#{type}"]
            if not f?
                f = @render_stderr
                value = "unknown message type '#{type}'"
            elts.push(f(value, elts.length))

    render_output: ->
        elts = []
        for mesg in process_messages(@props.output)
            @render_output_mesg(elts, mesg)
        return elts

    render: ->
        if (@props.flags?.indexOf(FLAGS.hide_output) ? -1) != -1
            return <span/>
        <div style={margin:'15px'}>
            {@render_output()}
        </div>

# sort in order to a list and combine adjacent stdout/stderr messages.
STRIP = ['done', 'error', 'once', 'javascript', 'hide', 'show']   # these are just deleted -- make no sense for static rendering.

process_messages = (output) ->
    v = misc.keys(output)
    v.sort (a,b) -> misc.cmp(parseInt(a), parseInt(b))
    r = []
    for a in v
        m = output[a]
        for s in STRIP
            if m[s]?
                delete m[s]
        n = misc.len(m)
        if n == 0
            continue
        if m.clear
            r = []
            continue
        if m.delete_last
            r.pop()
            continue
        if r.length > 0 and n == 1
            if m.stdout? and r[r.length-1].stdout?
                r[r.length-1] = {stdout: r[r.length-1].stdout + m.stdout}
                continue
            if m.stderr? and r[r.length-1].stderr?
                r[r.length-1] = {stderr: r[r.length-1].stderr + m.stderr}
                continue
        r.push(m)
    return r


