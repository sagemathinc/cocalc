###
This is...
###

immutable = require('immutable')

misc = require('smc-util/misc')

{rclass, Redux, React, ReactDOM, redux, rtypes} = require('../smc-react')

r_misc = require('../r_misc')
file_editors = require('../file-editors')

{HTML, Space} = r_misc

# Register the Jupyter editor, so we can use it to render public ipynb
require('../jupyter/register-nbviewer').register()

{PDF} = require('./pdf')

extensions = require('./extensions')

{CodeMirrorStatic} = require('../jupyter/codemirror-static')

exports.PublicPath = rclass
    displayName: "PublicPath"

    propTypes :
        info    : rtypes.immutable.Map.isRequired
        content : rtypes.string
        viewer  : rtypes.string.isRequired

    render_view: ->
        path = @props.info.get('path')
        i = path.lastIndexOf('.')
        if i == -1
            return
        ext = misc.filename_extension(path)?.toLowerCase()
        src = @props.info.get('path')

        if extensions.image[ext]
            return <img src={src} />
        else if extensions.pdf[ext]
            return <PDF src={src} />

        if not @props.content?
            return

        if ext == 'md'
            return <r_misc.Markdown value={@props.content} />
        else if ext == 'ipynb'
            name   = file_editors.initialize(path, redux, @props.info.get('project_id'), true, @props.content)
            Viewer = file_editors.generate(path, redux, @props.info.get('project_id'), true)
            <Redux redux={redux}>
                <Viewer name={name} />
            </Redux>
            # TODO: need to call project_file.remove(path, redux, project_id, true) after
            # rendering is done!
        else if extensions.html[ext]
            return <HTML value={@props.content} />
        else if extensions.codemirror[ext]
            options = immutable.fromJS(extensions.codemirror[ext])
            #options = options.set('lineNumbers', true)
            return <CodeMirrorStatic value={@props.content} options={options} style={background:'white', padding:'10px'}/>
        else
            return <pre>{@props.content}</pre>


    render: ->
        if @props.viewer == 'embed'
            return <div>{@render_view()}</div>
        <div style={display: 'flex', flexDirection: 'column'}>
            <div>
                <a href="..">Up</a>
                <Space/> <Space/>  <a href={@props.info.get('path')}>{@props.info.get('path')}</a>
                <Space/> <Space/>
                {@props.info.get('description')}
                <Space/> <Space/>
                Project_id: {@props.info.get('project_id')}
            </div>
            <br/>
            <div style={border: '1px solid grey', padding: '10px', background: 'white', overflow:'auto'}>
                {@render_view()}
            </div>
        </div>
