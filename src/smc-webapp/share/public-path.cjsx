###
This is...
###

immutable = require('immutable')

misc = require('smc-util/misc')

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
        info    : rtypes.immutable.Map
        content : rtypes.string
        viewer  : rtypes.string.isRequired
        path    : rtypes.string.isRequired

    main_view: ->
        path = @props.path
        ext = misc.filename_extension(path)?.toLowerCase()
        src = misc.path_split(path).tail

        if extensions.image[ext]
            return {elt: <img src={src} />}
        else if extensions.pdf[ext]
            return {elt: <PDF src={src} />}

        if not @props.content?
            return

        mathjax = false
        if ext == 'md'
            mathjax = true
            elt = <Markdown value={@props.content} style={margin:'10px', display:'block'}/>
        else if ext == 'ipynb'
            name   = file_editors.initialize(path, redux, undefined, true, @props.content)
            Viewer = file_editors.generate(path, redux, undefined, true)
            mathjax = true
            elt = <Redux redux={redux}>
                <Viewer name={name} />
            </Redux>
            # TODO: need to call project_file.remove(path, redux, project_id, true) after
            # rendering is done!
        else if ext == 'sagews'
            mathjax = true
            elt = <SageWorksheet sagews={parse_sagews(@props.content)} />
        else if extensions.html[ext]
            mathjax = true
            elt = <HTML value={@props.content} />
        else if extensions.codemirror[ext]
            options = immutable.fromJS(extensions.codemirror[ext])
            #options = options.set('lineNumbers', true)
            elt = <CodeMirrorStatic value={@props.content} options={options} style={background:'white', padding:'10px'}/>
        else
            elt = <pre>{@props.content}</pre>

        return {mathjax: mathjax, elt:elt}

    render: ->
        {elt, mathjax} = @main_view()
        if mathjax
            cls = 'cocalc-share-mathjax'
        else
            cls = undefined

        if @props.viewer == 'embed'
            embed = <html>
                        <head><meta name="robots" content="noindex, nofollow" /></head>
                        <body className={cls}>{elt}</body>
                    </html>
            return embed

        <div style={display: 'flex', flexDirection: 'column', flex:1} className={cls}>
            <PublicPathInfo path={@props.path} info={@props.info} />
            <div style={background: 'white', overflow:'auto', flex:1}>
                {elt}
            </div>
        </div>
