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
{ErrorDisplay, Icon, Loading, TimeAgo} = require('r_misc')
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
        <Button onClick={@props.on_click} style={margin: '4px'}>
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
        filename : ''

    componentWillReceiveProps: (newProps) ->
        if newProps.default_filename != @props.default_filename
            @setState(filename: newProps.default_filename)

    getInitialState : ->
        return filename : @props.default_filename ? @default_filename()

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
        <SplitButton title={@file_dropdown_icon()} onClick={=>@create_file()} >
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

    render : ->
        if not @props.project_map? or not @props.current_path?
            return <Loading/>
        <div>
            <ProjectNewHeader
                current_path = {@props.current_path}
                flux         = {@props.flux}
                project_id   = {@props.project_id} />
            <Row key={@props.default_filename} >  {#  key is so autofocus works below}
                <Col sm=3>
                    <h4><Icon name='plus' /> Create a new file or directory</h4>
                </Col>
                <Col sm=8>
                    <h4>Name your file or paste in a web link</h4>
                    <form onSubmit={@submit}>
                        <Input
                            autoFocus
                            ref         = 'project_new_filename'
                            value       = @state.filename
                            type        = 'text'
                            placeholder = 'Name your new file, worksheet, terminal or directory...'
                            onChange    = {=>@setState(filename : @refs.project_new_filename.getValue())} />
                    </form>
                    {if @state.error then <ErrorDisplay error={@state.error} onClose={=>@setState(error:'')} />}
                    <h4>Select the file type (or directory)</h4>
                    <Row>
                        <Col sm=4>
                            <NewFileButton icon='file-code-o' name='Sage Worksheet' on_click={=>@create_file('sagews')} />
                            <NewFileButton icon='file-code-o' name='Jupyter Notebook' on_click={=>@create_file('ipynb')} />
                        </Col>
                        <Col sm=4>
                            {@file_dropdown()}
                            <NewFileButton icon='folder-open-o' name='Folder' on_click={=>@props.flux.getProjectActions(@props.project_id).create_folder(@state.filename, @props.current_path)} />
                        </Col>
                    </Row>
                    <Row>
                        <Col sm=12>
                            <NewFileButton icon='file-excel-o' name='LaTeX Document' on_click={=>@create_file('tex')} />
                            <NewFileButton icon='terminal' name='Terminal' on_click={=>@create_file('term')} />
                            <NewFileButton icon='tasks' name='Task List' on_click={=>@create_file('tasks')} />
                            <NewFileButton icon='graduation-cap' name='Manage a Course' on_click={=>@create_file('course')} />
                            <NewFileButton
                                icon     = 'cloud'
                                name     = {'Download from Internet' + (if @props.project_map.get(@props.project_id)?.get('settings')?.get('network') then '' else ' (most sites blocked)')}
                                on_click = {=>@create_file()}
                                loading  = {@state.downloading} />
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
    React.render(render(project_id, flux), dom_node)