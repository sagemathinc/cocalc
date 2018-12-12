##############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2016, Sagemath Inc.
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

misc = require('smc-util/misc')
misc_page = require('./misc_page')
underscore = require('underscore')

{React, ReactDOM, Actions, Store, Table, rtypes, rclass, Redux, Fragment, redux}  = require('./app-framework')
{Col, Row, Button, ButtonGroup, ButtonToolbar, FormControl, FormGroup, Panel, Input,
Well, SplitButton, MenuItem, Alert} = require('react-bootstrap')
{ErrorDisplay, Icon, Loading, TimeAgo, Tip, ImmutablePureRenderMixin, Space, CloseX2} = require('./r_misc')
{User} = require('./users')
{webapp_client} = require('./webapp_client')
{file_associations} = require('./file-associations')
{special_filenames_with_no_extension} = require('./project_file')

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
# FUTURE: refactor to use PathSegmentLink?
PathLink = exports.PathLink = rclass
    displayName : 'ProjectNew-PathLink'

    mixins : [ImmutablePureRenderMixin]

    propTypes :
        path       : rtypes.string.isRequired
        actions    : rtypes.object.isRequired
        default    : rtypes.string

    getDefaultProps: ->
        default : 'home directory of project'

    styles :
        cursor : 'pointer'

    handle_click: ->
        @props.actions.set_active_tab('files')

    render: ->
        <a style={@styles} onClick={@handle_click}>{if @props.path then @props.path else @props.default}</a>

ProjectNewHeader = rclass
    displayName : 'ProjectNew-ProjectNewHeader'

    mixins : [ImmutablePureRenderMixin]

    propTypes :
        current_path : rtypes.string
        actions      : rtypes.object.isRequired

    render: ->
        <h1 style={marginTop:"0px"}>
            <Icon name='plus-circle' /> Create new files in<Space/>
            <PathLink
                path       = {@props.current_path}
                actions    = {@props.actions} />
        </h1>

exports.NewFileButton = NewFileButton = rclass
    displayName : 'ProjectNew-ProjectNewFileButton'

    mixins : [ImmutablePureRenderMixin]

    propTypes :
        name     : rtypes.string
        icon     : rtypes.string
        on_click : rtypes.func
        ext      : rtypes.string

    on_click: ->
        if @props.ext?
            @props.on_click(@props.ext)
        else
            @props.on_click()
    render: ->
        <Button onClick={@on_click}  style={marginRight:'5px'} >
            <Icon name={@props.icon} /> {@props.name}
            {@props.children}
        </Button>

NewFileDropdown = rclass
    propTypes :
        create_file : rtypes.func

    mixins : [ImmutablePureRenderMixin]

    file_dropdown_icon: ->
        <span>
            <Icon name='file' /> File
        </span>

    file_dropdown_item: (i, ext) ->
        {file_options} = require('./editor')
        data = file_options('x.' + ext)
        <MenuItem eventKey={i} key={i} onSelect={=>@props.create_file(ext)}>
            <Icon name={data.icon} /> <span style={textTransform:'capitalize'}>{data.name} </span> <span style={color:'#666'}>(.{ext})</span>
        </MenuItem>

    render: ->
        <SplitButton id='new_file_dropdown'  title={@file_dropdown_icon()} onClick={=>@props.create_file()}>
            {(@file_dropdown_item(i, ext) for i, ext of new_file_button_types)}
        </SplitButton>

# Use Rows and Cols to append more buttons to this class.
# Could be changed to auto adjust to a list of pre-defined button names.
exports.FileTypeSelector = FileTypeSelector = rclass
    proptypes :
        create_file   : rtypes.func.required
        create_folder : rtypes.func.required
        styles        : rtypes.object

    render: ->
        row_style =
            marginBottom:'8px'
        <Fragment>
            <Row style={row_style}>
                <Col sm={6}>
                    <Tip icon='cc-icon-sagemath-bold' title='Sage worksheet' tip='Create an interactive worksheet for using the SageMath mathematical software, R, and many other systems.  Do sophisticated mathematics, draw plots, compute integrals, work with matrices, etc.'>
                        <NewFileButton icon='cc-icon-sagemath-bold' name='Sage worksheet' on_click={@props.create_file} ext='sagews' />
                    </Tip>
                    <Tip icon='cc-icon-jupyter' title='Jupyter notebook' tip='Create an interactive notebook for using Python, Julia, R and more.'>
                        <NewFileButton icon='cc-icon-jupyter' name='Jupyter notebook' on_click={@props.create_file} ext={'ipynb'} />
                    </Tip>
                    <Tip title='RMarkdown File'  icon='cc-icon-r'
                        tip='RMarkdown document with real-time preview.'>
                        <NewFileButton icon='cc-icon-r' name='RMarkdown' on_click={@props.create_file} ext='rmd' />
                    </Tip>
                </Col>
                <Col sm={6}>
                    <Tip icon='file' title='Any Type of File' tip='Create a wide range of files, including HTML, Markdown, C/C++ and Java programs, etc.'>
                        <NewFileDropdown create_file={@props.create_file} />
                    </Tip>
                    <span style={marginRight:'5px'}></span>
                    <Tip
                        title='Folder'  placement='left' icon='folder-open-o'
                        tip='Create a folder in which to store and organize your files.  CoCalc provides a full featured filesystem.' >
                        <NewFileButton
                            icon='folder-open-o' name='Folder'
                            on_click={@props.create_folder} />
                    </Tip>
                </Col>
            </Row>
            <Row style={row_style}>
                <Col sm={6}>
                    <Tip title='Markdown File'   icon='cc-icon-markdown'
                        tip='Create a Markdown formatted document with real-time preview.'>
                        <NewFileButton icon='cc-icon-markdown' name='Markdown' on_click={@props.create_file} ext='md' />
                    </Tip>
                    <Tip title='LaTeX Document'   icon='cc-icon-tex-file'
                        tip='Create a professional quality technical paper that contains sophisticated mathematical formulas.'>
                        <NewFileButton icon='cc-icon-tex-file' name='LaTeX' on_click={@props.create_file} ext='tex' />
                    </Tip>
                    <Tip title='Terminal'  icon='terminal'
                        tip="Create a command line terminal.  CoCalc includes a full interactive Linux command line console and color xterm.  Run command line software, vim, emacs and more.">
                        <NewFileButton icon='terminal' name='Terminal' on_click={@props.create_file} ext='term' />
                    </Tip>
                    <Tip title='Task list'   icon='tasks'
                        tip='Create a todo list to keep track of everything you are doing on a project.  Put #hashtags in the item descriptions and set due dates.'>
                        <NewFileButton icon='tasks' name='Task list' on_click={@props.create_file} ext='tasks' />
                    </Tip>
                    <Tip title='Stopwatch'   icon='stopwatch'
                        tip='Create a collaborative stopwatch to keep track how long it takes to do something.'>
                        <NewFileButton icon='stopwatch' name='Stopwatch' on_click={@props.create_file} ext='time' />
                    </Tip>
                    <Tip title='X11 Desktop'   icon='window-restore'
                        tip='Create an X11 desktop for running graphical applications.'>
                        <NewFileButton icon='window-restore' name='X11 Desktop' on_click={@props.create_file} ext='x11' />
                    </Tip>
                </Col>
                <Col sm={6}>
                    <Tip title='Manage a course'  placement='left'  icon='graduation-cap'
                        tip='If you are a teacher, click here to create a new course.  This is a file that you can add students and assignments to, and use to automatically create projects for everybody, send assignments to students, collect them, grade them, etc.'>
                        <NewFileButton icon='graduation-cap' name='Manage a course' on_click={@props.create_file} ext='course' />
                    </Tip>
                </Col>
            </Row>
            {@props.children}
        </Fragment>

exports.ProjectNewForm = ProjectNewForm = rclass ({name}) ->
    displayName : 'ProjectNewForm'

    reduxProps :
        "#{name}" :
            current_path        : rtypes.string
            default_filename    : rtypes.string
            file_creation_error : rtypes.string
        projects :
            project_map              : rtypes.immutable
            get_total_project_quotas : rtypes.func

    propTypes :
        actions     : rtypes.object.isRequired
        close       : rtypes.func
        show_header : rtypes.bool

    getInitialState: ->
        filename           : @props.default_filename ? @default_filename()
        extension_warning  : false

    getDefaultProps: ->
        show_header        : true

    componentWillReceiveProps: (newProps) ->
        if newProps.default_filename != @props.default_filename
            @setState(filename: newProps.default_filename)

    componentDidUpdate: ->
        if not @state.extension_warning
            ReactDOM.findDOMNode(@refs.project_new_filename).focus()

    default_filename: ->
        return require('./account').default_filename()

    focus_input: ->
        ReactDOM.findDOMNode(@refs.project_new_filename).focus()

    create_file: (ext) ->
        if not @state.filename
            @focus_input()
            return
        @props.actions.create_file
            name         : @state.filename
            ext          : ext
            current_path : @props.current_path
        @props.close?()

    submit: (ext) ->
        if not @state.filename  # empty filename
            return
        if ext or special_filenames_with_no_extension().indexOf(@state.filename) > -1
            @create_file(ext)
        else if @state.filename[@state.filename.length - 1] == '/'
            @create_folder()
        else if misc.filename_extension(@state.filename) or misc.is_only_downloadable(@state.filename)
            @create_file()
        else
            @setState(extension_warning : true)

    submit_via_enter: (e) ->
        e.preventDefault()
        @submit()

    close_button: ->
        return if not @props.close
        <Button
            onClick   = {=> @props.close()}
            className = {"pull-right"}
        >
            Close
        </Button>

    render_header: ->
        if @props.current_path?
            <ProjectNewHeader
                current_path = {@props.current_path}
                actions      = {@props.actions} />

    render_error: ->
        error = @props.file_creation_error
        if error is 'not running'
            message = 'The project is not running. Please try again in a moment'
        else
            message = error
        <ErrorDisplay error={message} onClose={=>@props.actions.setState(file_creation_error:'')} />

    blocked: ->
        if not @props.project_map?
            return ''
        if @props.get_total_project_quotas(@props.project_id)?.network
            return ''
        else
            return ' (access blocked -- see project settings)'

    create_folder: ->
        @props.actions.create_folder
            name         : @state.filename
            current_path : @props.current_path
            switch_over  : true
        @props.close?()

    render_no_extension_alert: ->
        <Alert bsStyle='warning' style={marginTop: '10px', fontWeight : 'bold'}>
            <p>Warning: Are you sure you want to create a file with no extension? This will use a plain text editor. If you do not want this, click a button below to create the corresponding type of file.</p>
            <ButtonToolbar style={marginTop:'10px'}>
                <Button onClick={=>@create_file()} bsStyle='success'>
                    Yes, please create this file with no extension
                </Button>
                <Button onClick={=>@setState(extension_warning : false)} bsStyle='default'>
                    Cancel
                </Button>
            </ButtonToolbar>
        </Alert>

    render_upload: ->
        {SMC_Dropzone} = require('./smc-dropzone')
        <Fragment>
            <Row style={marginTop: '20px'}>
                <Col sm={12}>
                    <h4><Icon name='cloud-upload' /> Upload</h4>
                </Col>
            </Row>
            <Row>
                <Col sm={12}>
                    <SMC_Dropzone
                            dropzone_handler     = {{}}
                            project_id           = {@props.project_id}
                            current_path         = {@props.current_path}
                            show_header          = {false}
                    />
                </Col>
            </Row>
            <Row>
                <Col sm={9}>
                    <div style={color: "#666"}>
                        <em>You can also drag&drop onto the file listing below.</em>
                    </div>
                </Col>
                <Col sm={3}>
                    {if @props.close
                        <Row>
                            <Col sm={12}>{@close_button()}</Col>
                        </Row>
                    }
                </Col>
            </Row>
        </Fragment>

    render: ->
        <Fragment>
            {@render_header() if @props.show_header}
            <Row sm={3}>
                <Col sm={10}>
                    <h4><Icon name='plus-circle' /> Create a new file or directory</h4>
                </Col>
                <Col sm={2}>
                  <CloseX2 close={@props.close} />
                </Col>
            </Row>
            <Row key={@props.default_filename} >  {### key is so autofocus works below ###}
                <Col sm={12}>
                    <Row>
                        <Col sm={12}>
                            <h4 style={color:"#666"}>Name your file, folder or paste in a link</h4>
                            <form onSubmit={@submit_via_enter}>
                                <FormGroup>
                                    <FormControl
                                        autoFocus
                                        ref         = 'project_new_filename'
                                        value       = {@state.filename}
                                        type        = 'text'
                                        disabled    = {@state.extension_warning}
                                        placeholder = 'Name your file, folder, or paste in a link...'
                                        onChange    = {=>if @state.extension_warning then @setState(extension_warning : false) else @setState(filename : ReactDOM.findDOMNode(@refs.project_new_filename).value)} />
                                </FormGroup>
                            </form>
                            {if @state.extension_warning then @render_no_extension_alert()}
                            {if @props.file_creation_error then @render_error()}
                            <h4 style={color:"#666"}>Select the type</h4>
                        </Col>
                    </Row>
                    <FileTypeSelector create_file={@submit} create_folder={@create_folder}>
                        <Row>
                            <Col sm={6}>
                                <Tip title='Download files from the Internet'  icon = 'cloud'
                                    tip="Paste a URL into the box above, then click here to download a file from the internet. #{@blocked()}" >
                                    <NewFileButton
                                        icon     = 'cloud'
                                        name     = {"Download from Internet #{@blocked()}"}
                                        on_click = {@create_file}
                                        loading  = {@state.downloading} />
                                </Tip>
                            </Col>
                            <Col sm={6}>
                                <Tip title='Create a chatroom'  placement='left'  icon='comment'
                                    tip='Create a chatroom for chatting with other collaborators on this project.'>
                                    <NewFileButton icon='comment' name='Create a chatroom' on_click={@create_file} ext='sage-chat' />
                                </Tip>
                            </Col>
                        </Row>
                    </FileTypeSelector>
                </Col>
            </Row>
            {@render_upload()}
        </Fragment>

render = (project_id, redux) ->
    store   = redux.getProjectStore(project_id)
    actions = redux.getProjectActions(project_id)
    ProjectNew_connnected = ProjectNew(store.name)
    <div>
        <Redux redux={redux}>
            <ProjectNew_connnected project_id={project_id} actions={actions} projects_store={redux.getStore('projects')}/>
        </Redux>
        <hr />
        <div className='center'>Looking for file upload? Goto "Files" and click on "Upload".</div>
    </div>

exports.render_new = (project_id, dom_node, redux) ->
    #console.log("mount project_new")
    ReactDOM.render(render(project_id, redux), dom_node)

exports.unmount = (dom_node) ->
    #console.log("unmount project_new")
    ReactDOM.unmountComponentAtNode(dom_node)

FileUpload = rclass ({name}) ->
    displayName : 'ProjectNew-FileUpload'

    reduxProps :
        "#{name}" :
            current_path : rtypes.string

    propTypes :
        project_id : rtypes.string.isRequired

    mixins : [ImmutablePureRenderMixin]

    render: ->
        {SMC_Dropzone} = require('./smc-dropzone')

        <Row>
            <Col sm={3}>
                <h4><Icon name='cloud-upload' /> Upload files from your computer</h4>
            </Col>
            <Col sm={9}>
                <SMC_Dropzone
                    dropzone_handler     = {{}}
                    project_id           = {@props.project_id}
                    current_path         = {@props.current_path} />
            </Col>
        </Row>

exports.ProjectNew = rclass ({name}) ->
    propTypes :
        project_id : rtypes.string
        name : rtypes.string

    show_files_tab: ->
        pa = redux.getProjectActions(@props.project_id)
        pa.set_active_tab("files")

    render: ->
        style =
            textAlign: 'center'
            padding: '3rem'

        <Row>
            <Col xs={8} xsOffset={2} style={style}>
                <Alert bsStyle={"info"}>
                    Creating files, the library and upload moved to the{' '}
                    <Button onClick={=>@show_files_tab()}>
                        Files panel
                    </Button>.
                    <br/>
                    <img
                        src={"https://storage.googleapis.com/cocalc-extra/cc-files-new-library-upload-arrow.png"}
                        style={{width: "100%", marginTop: "3rem"}}
                    />
                </Alert>
            </Col>
        </Row>

