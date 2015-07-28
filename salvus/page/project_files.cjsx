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

{React, Actions, Store, Table, rtypes, rclass, FluxComponent}  = require('flux')
{Col, Row, ButtonToolbar, ButtonGroup, MenuItem, Button, Well, Input, ButtonToolbar, Popover, OverlayTrigger} = require('react-bootstrap')
misc = require('misc')
{Icon, Loading, SearchInput, TimeAgo, ErrorDisplay, ActivityDisplay} = require('r_misc')
{human_readable_size, open_in_foreground} = require('misc_page')
project_store = require('project_store')
{MiniTerminal} = require('project_miniterm')
{file_associations} = require('editor')
immutable  = require('immutable')
underscore = require('underscore')

PAGE_SIZE = 10

# A link that goes back to the current directory
# TODO : refactor to use PathSegmentLink?
exports.PathLink = rclass
    propTypes :
        path       : rtypes.array.isRequired
        flux       : rtypes.object
        project_id : rtypes.string.isRequired
        default    : rtypes.string

    styles :
        cursor : 'pointer'

    handle_click : ->
        @props.flux.getProjectActions(@props.project_id).set_focused_page("project-file-listing")

    render : ->
        <a style={@styles} onClick={@handle_click}>{misc.path_join(@props.path, @props.default ? "home directory of project")}</a>


# One segment of the directory links at the top of the files listing.
PathSegmentLink = rclass
    propTypes :
        path       : rtypes.array
        display    : rtypes.oneOfType([rtypes.string, rtypes.object])
        project_id : rtypes.string
        flux       : rtypes.object

    styles :
        cursor   : 'pointer'
        fontSize : '16pt'

    handle_click : ->
        @props.flux.getProjectActions(@props.project_id).set_current_path(@props.path)

    render : ->
        <a style={@styles} onClick={@handle_click}>{@props.display}</a>

FileCheckbox = rclass
    propTypes :
        name       : rtypes.string
        checked    : rtypes.bool
        project_id : rtypes.string
        flux       : rtypes.object

    handle_click : (e) ->
        e.stopPropagation() # so we don't open the file
        @props.flux.getProjectActions(@props.project_id).set_file_checked(@props.name, not @props.checked)

    render : ->
        <span onClick={@handle_click}>
            <Icon name = {if @props.checked then "check-square-o" else "square-o"} style={fontSize:'14pt'} />
        </span>

FileRow = rclass
    propTypes :
        name       : rtypes.string.isRequired
        size       : rtypes.number.isRequired
        time       : rtypes.number
        checked    : rtypes.bool
        mask       : rtypes.bool
        project_id : rtypes.string
        flux       : rtypes.object

    shouldComponentUpdate : (next) ->
        return @props.name != next.name or
        @props.size != next.size        or
        @props.time != next.time        or
        @props.checked != next.checked  or
        @props.mask != next.mask

    render_icon : ->
        ext  = misc.filename_extension(@props.name)
        name = file_associations[ext]?.icon ? 'file'
        <a>
            <Icon name={name} style={fontSize:'14pt'} />
        </a>

    render_name : ->
        ext  = misc.filename_extension(@props.name)
        if ext is ""
            name = @props.name
        else
            name = @props.name.substring(0, @props.name.length - ext.length - 1)

        filename_styles =
            whiteSpace   : 'pre-wrap'
            wordWrap     : 'break-word'
            overflowWrap : 'break-word'

        <a style={filename_styles}>
            <span style={fontWeight:'bold'}>{name}</span>
            <span style={color:'#999'}>{if ext is '' then '' else ".#{ext}"}</span>
        </a>


    handle_click : (e) ->
        @props.flux.getProjectActions(@props.project_id).open_file(path:@props.name, foreground:open_in_foreground(e))

    mask_styles : ->
        if @props.mask or misc.startswith(@props.name, '.')
            color : '#bbbbbb'

    render : ->
        row_styles =
            border       : '1px solid #ffffff'
            cursor       : 'pointer'
            borderRadius : '4px'

        mask_styles = @mask_styles()
        <Row style={row_styles} onClick={@handle_click}>
            <Col sm=2>
                <FileCheckbox
                    name       = {@props.name}
                    checked    = {@props.checked}
                    project_id = {@props.project_id}
                    flux       = {@props.flux} />
            </Col>
            <Col sm=1 style={mask_styles}>
                {@render_icon()}
            </Col>
            <Col sm=4>
                {@render_name()}
            </Col>
            <Col sm=3>
                <TimeAgo date={(new Date(@props.time * 1000)).toISOString()} />
            </Col>
            <Col sm=2>
                {human_readable_size(@props.size)}
            </Col>
        </Row>

DirectoryRow = rclass
    propTypes :
        name         : rtypes.string.isRequired
        checked      : rtypes.bool
        time         : rtypes.number
        current_path : rtypes.array
        project_id   : rtypes.string
        flux         : rtypes.object


    handle_click : ->
        @props.flux.getProjectActions(@props.project_id).set_current_path(@props.current_path.concat(@props.name))
        @props.flux.getProjectActions(@props.project_id).setTo(page : 0)

    render_time : ->
        if @props.time?
            <TimeAgo date={(new Date(@props.time * 1000)).toISOString()} />

    mask_styles : ->
        if misc.startswith(@props.name, '.')
            color : '#bbbbbb'

    render : ->
        row_styles =
            backgroundColor : '#fafafa'
            border          : '1px solid #eee'
            cursor          : 'pointer'
            borderRadius    : '4px'

        directory_styles =
            fontWeight   : 'bold'
            whiteSpace   : 'pre-wrap'
            wordWrap     : 'break-word'
            overflowWrap : 'break-word'

        mask_styles = @mask_styles()

        <Row style={row_styles} onClick={@handle_click}>
            <Col sm=2>
                <FileCheckbox
                    name       = {@props.name}
                    checked    = {@props.checked}
                    project_id = {@props.project_id}
                    flux       = {@props.flux} />
            </Col>
            <Col sm=1>
                <a><Icon name="folder-open-o" style={fontSize:'14pt'} /></a>
            </Col>
            {# TODO: list of styles works with Radium <Col sm=4 style={[directory_styles, mask_styles]}>}
            <Col sm=4 style={directory_styles}>
                <a>{@props.name}</a>
            </Col>
            <Col sm=3>
                {@render_time()}
            </Col>
            <Col sm=2>
                {#size (not applicable for directories)}
            </Col>
        </Row>
#TODO
NoFiles = rclass
    render : ->
        <div>No Files</div>

FileListing = rclass
    propTypes :
        listing       : rtypes.array
        mask          : rtypes.bool   # if true then mask out files that probably won't be opened
        checked_files : rtypes.object
        current_path  : rtypes.array
        page          : rtypes.number
        page_size     : rtypes.number
        project_id    : rtypes.string
        flux          : rtypes.object

    render_row : (name, size, time, isdir) ->
        if isdir
            return <DirectoryRow
                        name         = {name}
                        time         = {time}
                        key          = {name}
                        checked      = {@props.checked_files.has(name)}
                        flux         = {@props.flux}
                        project_id   = {@props.project_id}
                        current_path = {@props.current_path} />
        else
            return <FileRow
                        name       = {name}
                        time       = {time}
                        size       = {size}
                        checked    = {@props.checked_files.has(name)}
                        key        = {name}
                        flux       = {@props.flux}
                        project_id = {@props.project_id} />

    handle_parent : (e) ->
        e.preventDefault()
        @props.flux.getProjectActions(@props.project_id).set_current_path(@props.current_path[0...-1])
        @props.flux.getProjectActions(@props.project_id).setTo(page : 0)

    parent_directory : ->
        styles =
            fontWeight   : 'bold'
            whiteSpace   : 'pre-wrap'
            wordWrap     : 'break-word'
            overflowWrap : 'break-word'

        row_styles =
            backgroundColor : '#fafafa'
            border          : '1px solid #eee'
            cursor          : 'pointer'
            borderRadius    : '4px'

        if @props.current_path.length > 0
            <Row style={row_styles} onClick={@handle_parent}>
                <Col sm=2>
                </Col>
                <Col sm=1>
                    <a><Icon name="reply" style={fontSize:'14pt'} /></a>
                </Col>
                <Col sm=4 style={styles}>
                    <a href="">Parent Directory</a>
                </Col>
            </Row>

    render_rows : ->
        start_index = @props.page_size * @props.page
        end_index   = start_index + @props.page_size
        (@render_row(a.name, a.size, a.mtime, a.isdir) for a in @props.listing[start_index...end_index])

    render_no_files : ->
        if @props.listing.length is 0
            <NoFiles
                project_id   = {@props.project_id}
                current_path = {@props.current_path}
                flux         = {@props.flux} />

    render : ->
        if @props.listing?
            <Col sm=12>
                {@parent_directory()}
                {@render_rows()}
                {@render_no_files()}
            </Col>
        else
            <Loading />

ProjectFilesSearch = rclass
    render : ->
        <Col sm=3>
            Search
        </Col>

ProjectFilesPath = rclass
    make_path : ->
        v = []
        v.push <PathSegmentLink path={[]} display={<Icon name="home" />} flux={@props.flux} project_id={@props.project_id} key="home" />
        for segment, i in @props.current_path
            v.push <span key={2 * i + 1}>&nbsp; / &nbsp;</span>
            v.push <PathSegmentLink
                    path       = {@props.current_path[0...i + 1]}
                    display    = {segment}
                    flux       = {@props.flux}
                    project_id = {@props.project_id}
                    key        = {2 * i + 2} />
        return v

    render : ->
        <Col sm=6>
            <span>{@make_path()}</span>
        </Col>

ProjectFilesButtons = rclass
    propTypes :
        show_hidden  : rtypes.bool
        sort_by_time : rtypes.bool
        current_path : rtypes.array
        project_id   : rtypes.string.isRequired
        flux         : rtypes.object

    handle_refresh : (e) ->
        e.preventDefault()
        @props.flux.getProjectActions(@props.project_id).set_directory_files(@props.current_path, @props.sort_by_time, @props.show_hidden)

    handle_sort_method : (e) ->
        e.preventDefault()
        @props.flux.getProjectActions(@props.project_id).setTo(sort_by_time : not @props.sort_by_time)
        @props.flux.getProjectActions(@props.project_id).set_directory_files(@props.current_path, not @props.sort_by_time, @props.show_hidden)

    handle_hidden_toggle : (e) ->
        e.preventDefault()
        @props.flux.getProjectActions(@props.project_id).setTo(show_hidden : not @props.show_hidden)
        @props.flux.getProjectActions(@props.project_id).set_directory_files(@props.current_path, @props.sort_by_time, not @props.show_hidden)

    render_refresh : ->
        <a href="" onClick={@handle_refresh}><Icon name="refresh" /> </a>

    render_sort_method : ->
        if @props.sort_by_time
            <a href="" onClick={@handle_sort_method}><Icon name="sort-numeric-asc" /> </a>
        else
            <a href="" onClick={@handle_sort_method}><Icon name="sort-alpha-asc" /> </a>

    render_hidden_toggle : ->
        if @props.show_hidden
            <a href="" onClick={@handle_hidden_toggle}><Icon name="eye" /> </a>
        else
            <a href="" onClick={@handle_hidden_toggle}><Icon name="eye-slash" /> </a>

    render_trash : ->
        <a href="" onClick={@handle_click}><Icon name="trash" /> </a>

    render_backup : ->
        <a href="" onClick={@handle_click}><Icon name="life-saver" /> <span style={fontSize: 14}>Backups</span> </a>

    render : ->
        <Col sm=3 style={textAlign: "right", fontSize: "14pt"}>
            {@render_refresh()}
            {@render_sort_method()}
            {@render_hidden_toggle()}
            {@render_trash()}
            {@render_backup()}
        </Col>

ProjectFilesActions = rclass

    propTypes :
        checked_files       : rtypes.object
        listing             : rtypes.array
        file_action         : rtypes.string
        file_action_buttons : rtypes.object
        page                : rtypes.number
        page_size           : rtypes.number
        project_id          : rtypes.string
        current_path        : rtypes.array
        flux                : rtypes.object.isRequired

    getInitialState : ->
        select_entire_directory : 'hidden' # hidden -> check -> clear

    componentWillReceiveProps : (nextProps) ->
        if @props.current_path.join("/") isnt nextProps.current_path.join("/")
            # user changed directory, hide the "select entire directory" button
            if @state.select_entire_directory isnt 'hidden'
                @setState(select_entire_directory : 'hidden')

        else if nextProps.checked_files.size is nextProps.listing.length and @state.select_entire_directory is 'check'
            # user just clicked the "select entire directory" button, show the "clear" button
            @setState(select_entire_directory : 'clear')

        else if not immutable.is(@props.checked_files, nextProps.checked_files)
            # the checked selection changed, hide the "select entire directory" button
            if @state.select_entire_directory isnt 'hidden'
                @setState(select_entire_directory : 'hidden')

    clear_selection : ->
        @props.flux.getProjectActions(@props.project_id).clear_all_checked_files()
        if @state.select_entire_directory isnt 'hidden'
            @setState(select_entire_directory : 'hidden')

    check_all_click_handler : ->
        if @props.checked_files.size is 0
            files_on_page = @props.listing[@props.page_size * @props.page...@props.page_size * (@props.page + 1)]
            @props.flux.getProjectActions(@props.project_id).set_all_checked_files(file.name for file in files_on_page)

            if @props.listing.length > @props.page_size
                # if there are more items than one page, show a button to select everything
                @setState(select_entire_directory : 'check')
        else
            @clear_selection()

    render_check_all_button : ->
        if @props.checked_files.size is 0
            button_icon = 'square-o'
            button_text = 'Check all'
        else
            button_text = 'Uncheck all'

            if @props.checked_files.size >= @props.listing.length
                button_icon = 'check-square-o'
            else
                button_icon = 'minus-square-o'

        <Button bsSize="small" onClick={@check_all_click_handler} >
            <Icon name={button_icon} /> {button_text}
        </Button>

    select_entire_directory : ->
        @props.flux.getProjectActions(@props.project_id).set_all_checked_files(file.name for file in @props.listing)

    render_select_entire_directory : ->
        switch @state.select_entire_directory
            when 'check'
                <Button bsSize='xsmall' onClick={@select_entire_directory}>
                    Select all {@props.listing.length} items in this directory.
                </Button>
            when 'clear'
                <Button bsSize='xsmall' onClick={@clear_selection}>
                    Clear entire selection.
                </Button>

    render_currently_selected : ->
        checked = @props.checked_files?.size ? 0
        total = @props.listing.length
        <div>
            <span>{"#{checked} of #{total} #{misc.plural(total, 'item')} selected"}</span>
            &nbsp;
            {@render_select_entire_directory()}
        </div>

    render_action_button : (name) ->
        obj = @props.file_action_buttons[name]
        <Button
            onClick={=>@props.flux.getProjectActions(@props.project_id).set_file_action(name)}
            key={name} >
            <Icon name={obj.icon} /> {obj.name}
        </Button>

    render_action_buttons : ->
        if @props.checked_files.size is 0
            return

        else if @props.checked_files.size is 1
            item = @props.checked_files.first()
            for file in @props.listing
                if file.name is item
                    isdir = file.isdir

            if isdir
                # one directory selected
                action_buttons = [
                    'compress'
                    'delete'
                    'rename'
                    'move'
                    'copy'
                    'share'
                ]
            else
                # one file selected
                action_buttons = [
                    'download'
                    'delete'
                    'rename'
                    'move'
                    'copy'
                    'share'
                ]
        else
            # multiple items selected
            action_buttons = [
                'compress'
                'delete'
                'move'
                'copy'
                'share'
            ]

        <ButtonGroup bsSize="small">
                {(@render_action_button(v) for v in action_buttons)}
        </ButtonGroup>

    render : ->
        <Row>
            <Col sm=12>
                <ButtonToolbar>
                    <ButtonGroup>
                        {@render_check_all_button()}
                    </ButtonGroup>

                    {@render_action_buttons()}
                </ButtonToolbar>
            </Col>
            <Col sm=12>
                {@render_currently_selected()}
            </Col>
        </Row>

ProjectFilesActionBox = rclass
    propTypes :
        file_action_buttons : rtypes.object.isRequired
        checked_files       : rtypes.object
        file_action         : rtypes.string
        current_path        : rtypes.array.isRequired
        flux                : rtypes.object.isRequired
        project_id          : rtypes.string.isRequired

    getInitialState : ->
        loading : false

    cancel_action : ->
        @props.flux.getProjectActions(@props.project_id).set_file_action(undefined)

    delete_click : ->
        @setState(loading : true)
        pathname = @props.current_path.join("/")
        if pathname != ""
            pathname += "/"
        @props.flux.getProjectActions(@props.project_id).trash_files
            src : @props.checked_files.map((x) -> pathname + x).toArray()

    compress_click : ->
        @setState(loading : true)
        destination = @refs.result_archive.getValue()
        @props.flux.getProjectActions(@props.project_id).zip_files
            src  : @props.checked_files.toArray()
            dest : destination
            path : @props.current_path
            cb   : (err) =>
                @setState
                    loading : false
                    error   : err

    rename_click : ->
        @setState(loading : true)
        destination = @refs.new_name.getValue()
        @props.flux.getProjectActions(@props.project_id).move_files
            src  : @props.checked_files.toArray()
            dest : destination
            path : @props.current_path
            cb   : (err) =>
                @setState
                    loading : false
                    error   : err

    move_click : ->
        @setState(loading : true)
        destination = @refs.move_destination.getValue()
        pathname = @props.current_path.join("/")
        if pathname != ""
            pathname += "/"
        @props.flux.getProjectActions(@props.project_id).move_files
            src  : @props.checked_files.map((x) -> pathname + x).toArray()
            dest : destination
            cb   : (err) =>
                @setState
                    loading : false
                    error   : err

    copy_click : ->
        @setState(loading : true)
        destination_directory = @refs.copy_destination_directory.getValue()
        destination_project = @refs.copy_destination_project.getValue()
        pathname = @props.current_path.join("/")
        if pathname != ""
            pathname += "/"
        @props.flux.getProjectActions(@props.project_id).copy_files
            src : @props.checked_files.map((x) -> pathname + x).toArray()
            dest : destination_directory

        console.log('copy to dir', destination_directory, 'copy to project', destination_project)
        @setState(loading : false)

    share_click : ->
        @setState(loading : true)
        description = @refs.share_description.getValue()
        console.log('share desc', description)
        @setState(loading : false)

    stop_sharing_click : ->
        @setState(loading : true)
        console.log('stop sharing')
        @setState(loading : false)

    download_click : ->
        @setState(loading : true)
        pathname = @props.current_path.join("/")
        if pathname != ""
            pathname += "/"
        @props.flux.getProjectActions(@props.project_id).download_file
            path : pathname + @props.checked_files.first()
            cb   : (err) =>
                @setState(loading : false)

    render_selected_files_list : ->
        <pre style={height:'40px'}>
            {<div key={name}>{name}</div> for name in @props.checked_files.toArray()}
        </pre>

    project_options : ->
        projects = @props.flux.getStore('projects').get_project_select_list(@props.project_id)
        <option value={project[0]} key={project[0]}>{misc.trunc(project[1], 40)}</option> for project in projects

    render_action_box : (action) ->
        size = @props.checked_files.size
        if size is 1
            single_item = @props.checked_files.first()

        switch action
            when 'compress'
                <div>
                    <Row>
                        <Col sm=5 style={color:'#666'}>
                            <h4>Compress:</h4>
                            {@render_selected_files_list()}
                        </Col>

                        <Col sm=5 style={color:'#666'}>
                            <h4>Result archive:</h4>
                            <Input
                                ref          = 'result_archive'
                                type         = 'text'
                                defaultValue = {"#{single_item ? 'Archive'}.zip"}
                                placeholder  = 'Result archive...' />
                        </Col>
                    </Row>
                    <Row>
                        <Col sm=12>
                            <ButtonToolbar>
                                <Button bsStyle='warning' onClick={@compress_click} disabled={@state.loading}>
                                    Compress {size} {misc.plural(size, 'item')}
                                </Button>
                                <Button onClick={@cancel_action} disabled={@state.loading}>
                                    {if @state.loading then <Loading /> else 'Cancel'}
                                </Button>
                            </ButtonToolbar>
                        </Col>
                    </Row>
                </div>

            when 'delete'
                <div>
                    <Row>
                        <Col sm=5 style={color:'#666'}>
                            <h4>Move to trash:</h4>
                            {@render_selected_files_list()}
                        </Col>
                    </Row>
                    <Row>
                        <Col sm=12>
                            <ButtonToolbar>
                                <Button bsStyle='danger' onClick={@delete_click} disabled={@state.loading}>
                                    Delete {size} {misc.plural(size, 'item')}
                                </Button>
                                <Button onClick={@cancel_action} disabled={@state.loading}>
                                    {if @state.loading then <Loading /> else 'Cancel'}
                                </Button>
                            </ButtonToolbar>
                        </Col>
                    </Row>
                </div>

            when 'rename'
                <div>
                    <Row>
                        <Col sm=5 style={color:'#666'}>
                            <h4>Rename:</h4>
                            {@render_selected_files_list()}
                        </Col>
                        <Col sm=5 style={color:'#666'}>
                            <h4>New name:</h4>
                            <Input
                                ref          = 'new_name'
                                type         = 'text'
                                defaultValue = {single_item}
                                placeholder  = 'New file name...' />
                        </Col>
                    </Row>
                    <Row>
                        <Col sm=12>
                            <ButtonToolbar>
                                <Button bsStyle='info' onClick={@rename_click} disabled={@state.loading}>
                                    Rename file
                                </Button>
                                <Button onClick={@cancel_action} disabled={@state.loading}>
                                    {if @state.loading then <Loading /> else 'Cancel'}
                                </Button>
                            </ButtonToolbar>
                        </Col>
                    </Row>
                </div>

            when 'move'
                <div>
                    <Row>
                        <Col sm=5 style={color:'#666'}>
                            <h4>Move:</h4>
                            {@render_selected_files_list()}
                        </Col>
                        <Col sm=5 style={color:'#666'}>
                            <h4>Destination:</h4>
                            <Input
                                ref          = 'move_destination'
                                type         = 'text'
                                defaultValue = {@props.current_path.join('/')}
                                placeholder  = 'Destination folder...' />
                        </Col>
                    </Row>
                    <Row>
                        <Col sm=12>
                            <ButtonToolbar>
                                <Button bsStyle='warning' onClick={@move_click} disabled={@state.loading}>
                                    Move {size} {misc.plural(size, 'item')}
                                </Button>
                                <Button onClick={@cancel_action} disabled={@state.loading}>
                                    {if @state.loading then <Loading /> else 'Cancel'}
                                </Button>
                            </ButtonToolbar>
                        </Col>
                    </Row>
                </div>

            when 'copy'
                <div>
                    <Row>
                        <Col sm=4 style={color:'#666'}>
                            <h4>Copy:</h4>
                            {@render_selected_files_list()}
                        </Col>
                        <Col sm=4 style={color:'#666'}>
                            <h4>Destination:</h4>
                            <Input
                                ref          = 'copy_destination_directory'
                                type         = 'text'
                                defaultValue = {@props.current_path.join('/')}
                                placeholder  = 'Destination folder...' />
                        </Col>
                        <Col sm=4 style={color:'#666'}>
                            <h4>In the project:</h4>
                            <Input
                                ref  = 'copy_destination_project'
                                type = 'select' >
                                {@project_options()}
                            </Input>
                        </Col>
                    </Row>
                    <Row>
                        <Col sm=4 smOffset=4>
                            <Input
                                ref   = 'overwrite_newer_checkbox'
                                type  = 'checkbox'
                                label = 'Overwrite newer versions of files' />
                        </Col>
                        <Col sm=4>
                            <Input
                                ref   = 'delete_extra_files_checkbox'
                                type  = 'checkbox'
                                label = 'Delete extra files in target directory' />
                        </Col>
                    </Row>
                    <Row>
                        <Col sm=12>
                            <ButtonToolbar>
                                <Button bsStyle='primary' onClick={@copy_click} disabled={@state.loading}>
                                    Copy {size} {misc.plural(size, 'item')}
                                </Button>
                                <OverlayTrigger
                                    trigger   = 'click'
                                    rootClose
                                    placement = 'top'
                                    overlay   = {
                                        <Popover title='Copy command:'>
                                            rsync -rltgoDxH --backup --backup-dir=.trash/
                                            {" 'Math 999 Sp15.course' 'Math 999 Sp15.course'"}
                                        </Popover>
                                        } >
                                    <Button bsStyle='info'>
                                        <Icon name='info-circle' />
                                    </Button>
                                </OverlayTrigger>
                                <Button onClick={@cancel_action} disabled={@state.loading}>
                                    {if @state.loading then <Loading /> else 'Cancel'}
                                </Button>
                            </ButtonToolbar>
                        </Col>
                    </Row>
                </div>

            when 'share'
                <div>
                    <Row>
                        <Col sm=5 style={color:'#666'}>
                            <h4>Share publicly:</h4>
                            {@render_selected_files_list()}
                        </Col>
                        <Col sm=5 style={color:'#666'}>
                            <h4>Description of share:</h4>
                            <Input
                                ref          = 'share_description'
                                type         = 'text'
                                defaultValue = {''}
                                placeholder  = 'Description...' />
                        </Col>
                    </Row>
                    <Row>
                        <Col sm=12>
                            <ButtonToolbar>
                                <Button bsStyle='primary' onClick={@share_click} disabled={@state.loading}>
                                    Share {size} {misc.plural(size, 'item')} publicly
                                </Button>
                                <Button bsStyle='warning' onClick={@stop_sharing_click} disabled={@state.loading}>
                                    Stop sharing {size} {misc.plural(size, 'item')} publicly
                                </Button>
                                <Button onClick={@cancel_action} disabled={@state.loading}>
                                    {if @state.loading then <Loading /> else 'Cancel'}
                                </Button>
                            </ButtonToolbar>
                        </Col>
                    </Row>
                </div>

            when 'download'
                <div>
                    <Row>
                        <Col sm=5 style={color:'#666'}>
                            <h4>Download file:</h4>
                            {@render_selected_files_list()}
                        </Col>
                    </Row>
                    <Row>
                        <Col sm=12>
                            <ButtonToolbar>
                                <Button bsStyle='primary' onClick={@download_click} disabled={@state.loading}>
                                    Download
                                </Button>
                                <Button onClick={@cancel_action} disabled={@state.loading}>
                                    {if @state.loading then <Loading /> else 'Cancel'}
                                </Button>
                            </ButtonToolbar>
                        </Col>
                    </Row>
                </div>

    render_error : ->
        if @state.error
            <Col sm=12>
                <ErrorDisplay error={@state.error} onClose={=>@setState(error:'')} />
            </Col>

    render : ->
        action = @props.file_action
        action_button = @props.file_action_buttons[action]
        if not action_button?
            <div>Undefined action</div>
        else
            <Well>
                <Row>
                    <Col sm=12 style={color: '#666', fontWeight: 'bold', fontSize: '15pt'}>
                        <Icon name={action_button.icon ? 'exclamation-circle'} /> {action_button.name}
                    </Col>
                    <Col sm=12>
                        {@render_action_box(action)}
                    </Col>
                    {@render_error()}
                </Row>
            </Well>

ProjectFilesSearch = rclass

    propTypes :
        file_search : rtypes.string

    getDefaultProps : ->
        file_search : ''

    render : ->
        <SearchInput
            placeholder = "Filename"
            value       = {@props.file_search}
            on_change   = {(v)=>@props.flux.getProjectActions(@props.project_id).setTo(file_search : v)}
        />

ProjectFiles = rclass
    propTypes :
        project_id : rtypes.string.isRequired
        flux       : rtypes.object

    getDefaultProps : ->
        page : 0

    match : (words, s, is_dir) ->
        s = s.toLowerCase()
        for t in words
            if t == '/'
                if not is_dir
                    return false
            else if s.indexOf(t) == -1
                return false
        return true

    file_action_buttons :
        compress :
            name : 'Compress'
            icon : 'download'
        delete   :
            name : 'Delete'
            icon : 'trash-o'
        rename   :
            name : 'Rename'
            icon : 'pencil'
        move     :
            name : 'Move'
            icon : 'arrows'
        copy     :
            name : 'Copy'
            icon : 'files-o'
        share    :
            name : 'Share'
            icon : 'share-square-o'
        download :
            name : 'Download'
            icon : 'cloud-download'


    matched_files : (search, listing) ->
        if not listing?
            return []
        words = search.split(" ")
        return (x for x in listing when @match(words, x.name, x.isdir))

    previous_page: ->
        if @props.page > 0
            @props.flux.getProjectActions(@props.project_id).setTo(page : @props.page-1)

    next_page: ->
        @props.flux.getProjectActions(@props.project_id).setTo(page : @props.page+1)

    render_paging_buttons: (num_pages) ->
        if num_pages > 1
            <ButtonGroup style={marginBottom:'5px'}>
                <Button onClick={@previous_page} disabled={@props.page<=0} >
                    <Icon name="angle-double-left" /> Newer
                </Button>
                <Button disabled>
                    {"#{@props.page + 1}/#{num_pages}"}
                </Button>
                <Button onClick={@next_page} disabled={@props.page>=num_pages-1} >
                    <Icon name="angle-double-right" /> Older
                </Button>
            </ButtonGroup>

    # render the files action box if there is an action and at least 1 file checked
    render_files_action_box : ->
        if @props.checked_files.size > 0 and @props.file_action?
            <Col sm=12>
                <ProjectFilesActionBox
                    file_action_buttons = {@file_action_buttons}
                    file_action         = {@props.file_action}
                    checked_files       = {@props.checked_files}
                    current_path        = {@props.current_path}
                    flux                = {@props.flux}
                    project_id          = {@props.project_id} />
            </Col>

    render_files_actions : (listing) ->
        if listing.length > 0
            <ProjectFilesActions
                checked_files       = {@props.checked_files}
                file_action         = {@props.file_action}
                file_action_buttons = {@file_action_buttons}
                flux                = {@props.flux}
                page                = {@props.page}
                page_size           = {PAGE_SIZE}
                project_id          = {@props.project_id}
                current_path        = {@props.current_path}
                listing             = {listing} />

    render_activity: ->
        <ActivityDisplay activity={underscore.values(@props.activity)} trunc=80 />

    render : ->
        listing = @props.directory_file_listing?.get(@props.current_path.join("/")) ? []
        search = @props.file_search
        matched_listing = if search then @matched_files(search, listing) else listing

        <div>
            {@render_activity()}
            <Row>
                <Col sm=3>
                    <ProjectFilesSearch project_id={@props.project_id} flux={@props.flux} file_search={@props.file_search} />
                </Col>
                <Col sm=6>
                    <ProjectFilesPath current_path={@props.current_path} project_id={@props.project_id} flux={@props.flux} />
                </Col>
                <ProjectFilesButtons
                    project_id   = {@props.project_id}
                    flux         = {@props.flux}
                    show_hidden  = {@props.show_hidden ? false}
                    sort_by_time = {@props.sort_by_time ? true}
                    current_path = {@props.current_path} />
            </Row>
            <Row>
                <Col sm=8>
                    {@render_files_actions(listing)}
                </Col>
                <Col sm=4>
                    <MiniTerminal
                        project_id   = {@props.project_id}
                        current_path = {@props.current_path}
                        flux         = {@props.flux} />
                </Col>
                {@render_files_action_box()}
            </Row>

            <Row>
                <Col sm=3>
                    {@render_paging_buttons(Math.ceil(matched_listing.length / PAGE_SIZE))}
                </Col>
            </Row>
            <FileListing
                listing       = {matched_listing}
                page_size     = {PAGE_SIZE} # TODO: make a user setting
                page          = {@props.page}
                checked_files = {@props.checked_files}
                current_path  = {@props.current_path}
                project_id    = {@props.project_id}
                flux          = {@props.flux} />
        </div>

render = (project_id, flux) ->
    store = project_store.getStore(project_id, flux)
    <FluxComponent flux={flux} connectToStores={[store.name]}>
        <ProjectFiles project_id={project_id} flux={flux} />
    </FluxComponent>

exports.render_new = (project_id, dom_node, flux) ->
    React.render(render(project_id, flux), dom_node)