###
This is...
###

immutable = require('immutable')

misc = require('smc-util/misc')

{human_readable_size} = misc

{rclass, Redux, React, ReactDOM, redux, rtypes} = require('../smc-react')

{HTML, Markdown} = require('../r_misc')
file_editors = require('../file-editors')

# Register the Jupyter editor, so we can use it to render public ipynb
require('../jupyter/register-nbviewer').register()

{PDF} = require('./pdf')

extensions = require('./extensions')

{CodeMirrorStatic} = require('../jupyter/codemirror-static')

SageWorksheet = require('../sagews/worksheet').Worksheet
{parse_sagews}  = require('../sagews/parse-sagews')

{PublicPathInfo} = require('./public-path-info')

exports.PublicPath = rclass
    displayName: "PublicPath"

    propTypes :
        info     : rtypes.immutable.Map
        content  : rtypes.string
        viewer   : rtypes.string.isRequired
        path     : rtypes.string.isRequired
        size     : rtypes.number
        max_size : rtypes.number

    render_too_big: ->
        <div style={margin: '30px', color: '#333'}>
            <h3>File too big to display</h3>
            <br/>
            {human_readable_size(@props.size)} is bigger than {human_readable_size(@props.max_size)}
            <br/>
            <br/>
            You can download this file using the Raw link above.
        </div>

    main_view: ->
        mathjax = false
        path = @props.path
        ext = misc.filename_extension(path)?.toLowerCase()
        src = misc.path_split(path).tail

        if extensions.image[ext]
            return {elt: <img src={src} />}
        else if extensions.pdf[ext]
            return {elt: <PDF src={src} />}
        else if extensions.video[ext]
            video_style = {maxWidth: '100%', height: 'auto'}
            return {elt: <video controls autoPlay loop style={video_style} src={src}/>}

        if not @props.content?
            # This happens if the file is too big
            elt = @render_too_big()
        else if ext == 'md'
            mathjax = true
            elt = <Markdown value={@props.content} style={margin:'10px', display:'block'}/>
        else if ext == 'ipynb'
            name   = file_editors.initialize(path, redux, undefined, true, @props.content)
            Viewer = file_editors.generate(path, redux, undefined, true)
            mathjax = true
            elt = <Redux redux={redux}>
                <Viewer name={name} />
            </Redux>
            f = ->
                file_editors.remove(path, redux, undefined, true)
            # TODO: should really happen after render; however, don't know how yet... so just wait a bit and do it.
            # This is critical to do; otherwise, when the ipynb is updated, we'll see the old version.
            setTimeout(f, 10000)
        else if ext == 'sagews'
            mathjax = true
            elt = <SageWorksheet sagews={parse_sagews(@props.content)} style={margin:'30px'} />
        else if extensions.html[ext]
            mathjax = true
            elt = <HTML value={@props.content} />
        else if extensions.codemirror[ext]
            options = immutable.fromJS(extensions.codemirror[ext])
            #options = options.set('lineNumbers', true)
            elt = <CodeMirrorStatic value={@props.content} options={options} style={background:'white', margin:'10px 20px'}/>
        else
            elt = <pre>{@props.content}</pre>

        return {mathjax: mathjax, elt:elt}

    render: ->
        {elt, mathjax} = @main_view()

        if @props.viewer == 'embed'
            embed = <html>
                        <head><meta name="robots" content="noindex, nofollow" /></head>
                        <body>{elt}</body>
                    </html>
            return embed

        # TODO: has_mathjax doesn't work at all -- it always processes, which is slow.  Maybe because has_mathjax isn't a div prop?  It is ignored by the walker in mathjax-support...
        <div style={display: 'flex', flexDirection: 'column', flex:1} has_mathjax={if mathjax then "true"}>
            <PublicPathInfo path={@props.path} info={@props.info} />
            <div style={background: 'white', overflow:'auto', flex:1}>
                {elt}
            </div>
        </div>
