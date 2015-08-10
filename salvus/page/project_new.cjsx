###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2015, William Stein
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################

misc = require('misc')
misc_page = require('misc_page')
underscore = require('underscore')

{React, Actions, Store, Table, rtypes, rclass, FluxComponent}  = require('flux')
{Col, Row, Button, ButtonGroup, ButtonToolbar, Input, Panel, Well, SplitButton, MenuItem} = require('react-bootstrap')
{ErrorDisplay, Icon, Loading, TimeAgo, Tip} = require('r_misc')
{User} = require('users')
{salvus_client} = require('salvus_client')
project_store = require('project_store')
{project_page} = require('project')
{file_associations} = require('editor')
Dropzone = require('react-dropzone-component')

v = misc.keys(file_associations)
v.sort()

file_type_list = (list, exclude) ->
    extensions = []
    file_types_so_far = {}
    for ext in list
        if not ext
            continue
        data = file_associations[ext]
        if exclude and data.exclude_from_menu
            continue
        if data.name? and not file_types_so_far[data.name]
            file_types_so_far[data.name] = true
            extensions.push ext
    return extensions

new_file_button_types = file_type_list(v, true)

# A link that goes back to the current directory
# TODO : refactor to use PathSegmentLink?
PathLink = exports.PathLink = rclass
    displayName : 'ProjectNew-PathLink'

    propTypes :
        path       : rtypes.string.isRequired
        flux       : rtypes.object
        project_id : rtypes.string.isRequired
        default    : rtypes.string

    getDefaultProps : ->
        default : 'home directory of project'

    styles :
        cursor : 'pointer'

    handle_click : ->
        @props.flux.getProjectActions(@props.project_id).set_focused_page('project-file-listing')

    render : ->
        <a style={@styles} onClick={@handle_click}>{if @props.path then @props.path else @props.default}</a>

ProjectNewHeader = rclass
    displayName : 'ProjectNew-ProjectNewHeader'

    propTypes :
        project_id   : rtypes.string
        current_path : rtypes.string
        flux         : rtypes.object

    render : ->
        <h1>
            <Icon name='plus-circle' /> Create new files in&nbsp;
            <PathLink
                project_id = {@props.project_id}
                path       = {@props.current_path}
                flux       = {@props.flux} />
        </h1>

NewFileButton = rclass
    displayName : 'ProjectNew-ProjectNewFileButton'

    propTypes :
        name     : rtypes.string
        icon     : rtypes.string
        on_click : rtypes.func

    render : ->
        <Button onClick={@props.on_click}  style={marginRight:'5px'} >
            <Icon name={@props.icon} /> {@props.name}
        </Button>

ProjectNew = rclass
    displayName : 'ProjectNew'

    propTypes :
        current_path     : rtypes.string
        project_id       : rtypes.string
        default_filename : rtypes.string
        flux             : rtypes.object

    getInitialState : ->
        return filename : @props.default_filename ? @default_filename()

    componentWillReceiveProps: (newProps) ->
        if newProps.default_filename != @props.default_filename
            @setState(filename: newProps.default_filename)

    default_filename : ->
        return require('account').default_filename()

    file_dropdown_icon : ->
        <span>
            <Icon name='file' /> File
        </span>

    file_dropdown_item : (i, ext) ->
        data = file_associations[ext]
        <MenuItem eventKey=i key={i} onClick={=>@create_file(ext)}>
            <Icon name={data.icon.substring(3)} /> <span style={textTransform:'capitalize'}>{data.name} </span> <span style={color:'#666'}>(.{ext})</span>
        </MenuItem>

    file_dropdown : ->
        <SplitButton title={@file_dropdown_icon()} onClick={=>@create_file()}>
            {(@file_dropdown_item(i, ext) for i, ext of new_file_button_types)}
        </SplitButton>

    focus_input : ->
        @refs.project_new_filename.getInputDOMNode().focus()

    create_file : (ext) ->
        @props.flux.getProjectActions(@props.project_id).create_file
            name         : @state.filename
            ext          : ext
            current_path : @props.current_path
            on_download  : ((a) => @setState(download: a))
            on_error     : ((a) => @setState(error: a))
            on_empty     : @focus_input

    submit : (e) ->
        e.preventDefault()
        @create_file()

    render_header: ->
        if @props.current_path?
            <ProjectNewHeader
                current_path = {@props.current_path}
                flux         = {@props.flux}
                project_id   = {@props.project_id} />

    render_error : ->
        error = @state.error
        if error is 'not running'
            message = 'The project is not running. Please try again in a moment'
        else
            message = error
        <ErrorDisplay error={message} onClose={=>@setState(error:'')} />

    blocked: ->
        if not @props.project_map?
            return ''
        if @props.project_map.get(@props.project_id)?.get('settings')?.get('network')
            return ''
        else
            return ' (most sites blocked)'

    render : ->
        <div>
            {@render_header()}
            <Row key={@props.default_filename} >  {#  key is so autofocus works below}
                <Col sm=3>
                    <h4><Icon name='plus' /> Create a new file or directory</h4>
                </Col>
                <Col sm=8>
                    <h4 style={color:"#666"}>Name your file, folder or paste in a link</h4>
                    <form onSubmit={@submit}>
                        <Input
                            autoFocus
                            ref         = 'project_new_filename'
                            value       = @state.filename
                            type        = 'text'
                            placeholder = 'Name your file, folder, or paste in a link...'
                            onChange    = {=>@setState(filename : @refs.project_new_filename.getValue())} />
                    </form>
                    {if @state.error then @render_error()}
                    <h4 style={color:"#666"}>Select the type</h4>
                    <Row style={marginBottom:'8px'}>
                        <Col sm=6>
                            <Tip icon='file-code-o' title='SageMath Worksheet' tip='Create an interactive worksheet for using the SageMath mathematical software, R, and many other systems.  Do sophisticated mathematics, draw plots, compute integrals, work with matrices, etc.'>
                                <NewFileButton icon='file-code-o' name='SageMath Worksheet' on_click={=>@create_file('sagews')} />
                            </Tip>
                            <Tip icon='file-code-o' title='Jupyter Notebook' tip='Create an interactive notebook for using Python, Julia, R and more.'>
                                <NewFileButton icon='file-code-o' name='Jupyter Notebook' on_click={=>@create_file('ipynb')} />
                            </Tip>
                        </Col>
                        <Col sm=6>
                            <Tip icon='file' title='Any Type of File' tip='Create a wide range of files, including HTML, Markdown, C/C++ and Java programs, etc.'>
                                {@file_dropdown()}
                            </Tip>
                            <span style={marginRight:'5px'}></span>
                            <Tip
                                title='Folder'  placement='left' icon='folder-open-o'
                                tip='Create a folder in which to store and organize your files.  SageMathCloud provides a full featured filesystem.' >
                                <NewFileButton
                                    icon='folder-open-o' name='Folder'
                                    on_click={=>@props.flux.getProjectActions(@props.project_id).create_folder(@state.filename, @props.current_path)} />
                            </Tip>
                        </Col>
                    </Row>
                    <Row style={marginBottom:'8px'}>
                        <Col sm=6>
                            <Tip title='LaTeX Document'   icon='file-excel-o'
                                tip='Create a professional quality technical paper that contains sophisticated mathematical formulas.'>
                                <NewFileButton icon='file-excel-o' name='LaTeX Document' on_click={=>@create_file('tex')} />
                            </Tip>
                            <Tip title='Terminal'  icon='terminal'
                                tip="Create a command line terminal.  SageMathCloud includes a full interactive Linux command line console and color xterm.  Run command line software, vim, emacs and more.">
                                <NewFileButton icon='terminal' name='Terminal' on_click={=>@create_file('term')} />
                            </Tip>
                            <Tip title='Task List'   icon='tasks'
                                tip='Create a todo list to keep track of everything you are doing on a project.  Put #hashtags in the item descriptions and set due dates.'>
                                <NewFileButton icon='tasks' name='Task List' on_click={=>@create_file('tasks')} />
                            </Tip>
                        </Col>
                        <Col sm=6>
                            <Tip title='Manage a Course'  placement='left'  icon='graduation-cap'
                                tip='If you are a teacher, click here to create a new course.  This is a file that you can add students and assignments to, and use to automatically create projects for everybody, send assignments to students, collect them, grade them, etc.'>
                                <NewFileButton icon='graduation-cap' name='Manage a Course' on_click={=>@create_file('course')} />
                            </Tip>
                        </Col>
                    </Row>
                    <Row>
                        <Col sm=12>
                            <Tip title='Download files from the Internet'  icon = 'cloud'
                                tip="Paste a URL into the box above, then click here to download a file from the internet. #{@blocked()}" >
                                <NewFileButton
                                    icon     = 'cloud'
                                    name     = {"Download from Internet #{@blocked()}"}
                                    on_click = {=>@create_file()}
                                    loading  = {@state.downloading} />
                            </Tip>
                        </Col>
                    </Row>
                </Col>
            </Row>
        </div>

FileUpload = rclass
    displayName : 'ProjectNew-FileUpload'

    template : ->
        <div className='dz-preview dz-file-preview'>
            <div className='dz-details'>
                <div className='dz-filename'><span data-dz-name></span></div>
                <img data-dz-thumbnail />
            </div>
            <div className='dz-progress'><span className='dz-upload' data-dz-uploadprogress></span></div>
            <div className='dz-success-mark'><span><Icon name='check'></span></div>
            <div className='dz-error-mark'><span><Icon name='times'></span></div>
            <div className='dz-error-message'><span data-dz-errormessage></span></div>
        </div>

    postUrl : ->
        dest_dir = misc.encode_path(@props.current_path)
        postUrl  = window.salvus_base_url + "/upload?project_id=#{@props.project_id}&dest_dir=#{dest_dir}"
        return postUrl

    render : ->
        <Row>
            <Col sm=3>
                <h4><Icon name='cloud-upload' /> Upload files from your computer</h4>
            </Col>
            <Col sm=8>
                <Tip icon='file' title='Drag and drop files'
                    tip='Drag and drop files from your computer into the box below to upload them into your project.  You can upload individual files that are up to 30MB in size.'>
                    <h4 style={color:"#666"}>Drag and drop files</h4>
                </Tip>
                <div style={border: '2px solid #ccc', boxShadow: '4px 4px 2px #bbb', borderRadius: '5px', padding: 0}>
                    <Dropzone
                        config={postUrl: @postUrl }
                        eventHandlers={{}}
                        djsConfig={previewTemplate: React.renderToStaticMarkup(@template())} />
                </div>
            </Col>
        </Row>

render = (project_id, flux) ->
    store = project_store.getStore(project_id, flux)
    <FluxComponent flux={flux} connectToStores={['projects', store.name]}>
        <ProjectNew project_id={project_id} />
        <hr />
        <FileUpload project_id={project_id} />
    </FluxComponent>

exports.render_new = (project_id, dom_node, flux) ->
    #console.log("mount project_new")
    React.render(render(project_id, flux), dom_node)

exports.unmount = (dom_node) ->
    #console.log("unmount project_new")
    React.unmountComponentAtNode(dom_node)
