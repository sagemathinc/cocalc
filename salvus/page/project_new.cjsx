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
{alert_message} = require('alerts')
Dropzone = require('react-dropzone-component')

BAD_FILENAME_CHARACTERS = '\\/'
BAD_LATEX_FILENAME_CHARACTERS = '\'"()"~%'
BANNED_FILE_TYPES = ['doc', 'docx', 'pdf', 'sws']
FROM_WEB_TIMEOUT_S = 45

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

ProjectNewHeader = rclass
    handle_click : ->
        @props.flux.getProjectActions(@props.project_id).set_focused_page("project-file-listing")

    render : ->
        styles =
            color: "#428bca"
            textDecoration: "underline"
            cursor: "pointer"
            fontSize: "16pt"

        <h1>
            <Icon name="plus-circle" /> Create new files in <span style={styles}>{misc.path_join(@props.current_path, "home directory of project")}</span>
        </h1>

NewFileButton = rclass
    propTypes :
        name     : rtypes.string
        icon     : rtypes.string
        on_click : rtypes.func

    render : ->
        <Button onClick={@props.on_click} style={margin: "4px"}>
            <Icon name={@props.icon} /> {@props.name}
        </Button>

ProjectNew = rclass
    propTypes:
        current_path : rtypes.array
        project_id   : rtypes.string

    getInitialState : ->
        filename : @default_filename()

    default_filename : ->
        return misc.to_iso(new Date()).replace('T','-').replace(/:/g,'')

    file_dropdown_icon : ->
        <span>
            <Icon name="file" /> File
        </span>

    file_dropdown_item : (i, ext) ->
        data = file_associations[ext]
        <MenuItem eventKey=i key={i} onClick={=>@create_file(ext)}>
            <Icon name={data.icon.substring(3)} /> <span style={textTransform:"capitalize"}>{data.name} </span> <span style={color:"#666"}>(.{ext})</span>
        </MenuItem>

    file_dropdown : ->
        <SplitButton title={@file_dropdown_icon()} onClick={=>@create_file()} >
            {(@file_dropdown_item(i, ext) for i, ext of new_file_button_types)}
        </SplitButton>

    focus_input : ->
        @refs.project_new_filename.getInputDOMNode().focus()

    path : (ext) ->
        name = @state.filename
        if name.length == 0
            @focus_input()
            return ''
        for bad_char in BAD_FILENAME_CHARACTERS
            if name.indexOf(bad_char) != -1
                @setState(error: "Cannot use '#{bad_char}' in a filename")
                return ''
        dir = misc.path_join(@props.current_path, "")
        s = dir + name
        if ext? and misc.filename_extension(s) != ext
            s += "." + ext
        return s

    create_folder : ->
        p = @path()
        if p.length == 0
            return
        @props.flux.getProjectActions(@props.project_id).ensure_directory_exists
            path : p
            cb   : (err) =>
                if not err
                    #TODO alert
                    page.display_tab("project-file-listing")

    create_file : (ext) ->
        if @state.filename.indexOf("://") != -1 or misc.startswith(@state.filename, "git@github.com")
            @setState(downloading : true)
            @new_file_from_web @state.filename, () =>
                @setState(downloading : false)
            return
        if @state.filename[@state.filename.length - 1] == '/'
            for bad_char in BAD_FILENAME_CHARACTERS
                if name.slice(0, -1).indexOf(bad_char) != -1
                    @setState(error: "Cannot use '#{bad_char}' in a folder name")
                    return
            @create_folder()
            return
        p = @path(ext)
        if not p
            return
        ext = misc.filename_extension(p)
        if ext in BANNED_FILE_TYPES
            @setState(error: "Cannot create a file with the #{ext} extension")
            return
        if ext == 'tex'
            for bad_char in BAD_LATEX_FILENAME_CHARACTERS
                if p.indexOf(bad_char) != -1
                    @setState(error: "Cannot use '#{bad_char}' in a LaTeX filename")
                    return
        if p.length == 0
            return
        salvus_client.exec
            project_id  : @props.project_id
            command     : "new-file"
            timeout     : 10
            args        : [p]
            err_on_exit : true
            cb          : (err, output) =>
                if err
                    @setState(error: "#{output?.stdout ? ""} #{output?.stderr ? ""} #{err}")
                else
                    actions = @props.flux.getProjectActions(@props.project_id)
                    actions.set_focused_page("project-editor")
                    tab = actions.create_editor_tab(filename:p, content:"")
                    actions.display_editor_tab(path: p)

    new_file_from_web : (url, cb) ->
        d = misc.path_join(@props.current_path, "root of project")
        long = () ->
            alert_message
                type    : 'info'
                message : "Downloading '#{url}' to '#{d}', which may run for up to #{FROM_WEB_TIMEOUT_S} seconds..."
                timeout : 5
        timer = setTimeout(long, 3000)
        @props.flux.getProjectActions(@props.project_id).get_from_web
            url     : url
            dest    : @props.current_path
            timeout : FROM_WEB_TIMEOUT_S
            alert   : true
            cb      : (err) =>
                clearTimeout(timer)
                if not err
                    alert_message(type:'info', message:"Finished downloading '#{url}' to #{d}.")
                cb?(err)

    submit : (e) ->
        e.preventDefault()
        @create_file()

    render : ->
        if not @props.project_map? or not @props.current_path?
            return <Loading/>
        <div>
            <ProjectNewHeader current_path={@props.current_path} flux={@props.flux} />
            <Row>
                <Col sm=3>
                    <h4><Icon name="plus" /> Create a new file or directory</h4>
                </Col>
                <Col sm=8>
                    <h4>Name your file or paste in a web link</h4>
                    <form onSubmit={@submit}>
                        <Input
                            ref         = 'project_new_filename'
                            value       = @state.filename
                            autoFocus
                            type        = 'text'
                            placeholder = "Name your new file, worksheet, terminal or directory..."
                            onChange    = {=>@setState(filename : @refs.project_new_filename.getValue())} />
                    </form>
                    {if @state.error then <ErrorDisplay error={@state.error} onClose={=>@setState(error:'')} />}
                    <h4>Select the file type (or directory)</h4>
                    <Row>
                        <Col sm=4>
                            <NewFileButton icon="file-code-o" name="Sage Worksheet" on_click={=>@create_file("sagews")} />
                            <NewFileButton icon="file-code-o" name="Jupyter Notebook" on_click={=>@create_file("ipynb")} />
                        </Col>
                        <Col sm=4>
                            {@file_dropdown()}
                            <NewFileButton icon="folder-open-o" name="Folder" on_click={@create_folder} />
                        </Col>
                    </Row>
                    <Row>
                        <Col sm=12>
                            <NewFileButton icon="file-excel-o" name="LaTeX Document" on_click={=>@create_file("tex")} />
                            <NewFileButton icon="terminal" name="Terminal" on_click={=>@create_file("term")} />
                            <NewFileButton icon="tasks" name="Task List" on_click={=>@create_file("tasks")} />
                            <NewFileButton icon="graduation-cap" name="Manage a Course" on_click={=>@create_file("course")} />
                            <NewFileButton
                                icon     = "cloud"
                                name     = {"Download from Internet" + (if @props.project_map.get(@props.project_id).get('settings')?.get('network') then "" else " (most sites blocked)")}
                                on_click = {=>@create_file()}
                                loading  = {@state.downloading} />
                        </Col>
                    </Row>
                </Col>
            </Row>
        </div>

FileUpload = rclass
    template : ->
        <div className="dz-preview dz-file-preview">
            <div className="dz-details">
                <div className="dz-filename"><span data-dz-name></span></div>
                <img data-dz-thumbnail />
            </div>
            <div className="dz-progress"><span className="dz-upload" data-dz-uploadprogress></span></div>
            <div className="dz-success-mark"><span>✔</span></div>
            <div className="dz-error-mark"><span>✘</span></div>
            <div className="dz-error-message"><span data-dz-errormessage></span></div>
        </div>

    postUrl : ->
        path     = misc.path_join(@props.current_path, "")
        dest_dir = misc.encode_path(path)
        postUrl  = window.salvus_base_url + "/upload?project_id=#{@props.project_id}&dest_dir=#{dest_dir}"
        return postUrl

    render : ->
        <Row>
            <Col sm=3>
                <h4><Icon name="cloud-upload" /> Upload files from your computer</h4>
            </Col>
            <Col sm=8>
                <Dropzone
                    config={postUrl: @postUrl }
                    eventHandlers={{}}
                    djsConfig={previewTemplate: React.renderToStaticMarkup(@template())} />
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