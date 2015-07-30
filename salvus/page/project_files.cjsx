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

{React, Actions, Store, Table, rtypes, rclass, Flux}  = require('flux')
{Col, Row, ButtonToolbar, ButtonGroup, MenuItem, Button, Well, Input,
 ButtonToolbar, Popover, OverlayTrigger, SplitButton, MenuItem} =  require('react-bootstrap')
misc = require('misc')
{Icon, Loading, SearchInput, TimeAgo, ErrorDisplay, ActivityDisplay, Tip} = require('r_misc')
{human_readable_size, open_in_foreground} = require('misc_page')
{MiniTerminal} = require('project_miniterm')
{file_associations} = require('editor')
immutable  = require('immutable')
underscore = require('underscore')

PAGE_SIZE = 50

exports.file_action_buttons = file_action_buttons =
        compress :
            name : 'Compress'
            icon : 'compress'
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

# One segment of the directory links at the top of the files listing.
PathSegmentLink = rclass
    displayName : 'ProjectFiles-PathSegmentLink'

    propTypes :
        path       : rtypes.array
        display    : rtypes.oneOfType([rtypes.string, rtypes.object])
        actions    : rtypes.object.isRequired
        full_name  : rtypes.string

    styles :
        cursor   : 'pointer'
        fontSize : '18px'

    handle_click : ->
        @props.actions.set_current_path(@props.path)

    render_link : ->
        <a style={@styles} onClick={@handle_click}>{@props.display}</a>

    render : ->
        if @props.full_name and @props.full_name isnt @props.display
            <Tip title='Full name' tip={@props.full_name}>
                {@render_link()}
            </Tip>
        else
            return @render_link()

FileCheckbox = rclass
    displayName : 'ProjectFiles-FileCheckbox'

    propTypes :
        name       : rtypes.string
        checked    : rtypes.bool
        actions    : rtypes.object.isRequired

    handle_click : (e) ->
        e.stopPropagation() # so we don't open the file
        @props.actions.set_file_checked(@props.name, not @props.checked)

    render : ->
        <span onClick={@handle_click}>
            <Icon name={if @props.checked then 'check-square-o' else 'square-o'} style={fontSize:'14pt'} />
        </span>

FileRow = rclass
    displayName : 'ProjectFiles-FileRow'

    propTypes :
        name         : rtypes.string.isRequired
        display_name : rtypes.string  # if given, will display this, and will show true filename in popover
        size         : rtypes.number.isRequired
        time         : rtypes.number
        checked      : rtypes.bool
        mask         : rtypes.bool
        current_path : rtypes.array
        actions    : rtypes.object.isRequired

    shouldComponentUpdate : (next) ->
        return @props.name != next.name          or
        @props.display_name != next.display_name or
        @props.size != next.size                 or
        @props.time != next.time                 or
        @props.checked != next.checked           or
        @props.mask != next.mask
        @props.current_path != next.current_path

    render_icon : ->
        ext  = misc.filename_extension(@props.name)
        name = file_associations[ext]?.icon ? 'file'
        <a style={color : if @props.mask then '#bbbbbb'}>
            <Icon name={name} style={fontSize:'14pt'} />
        </a>

    render_name_link : (styles, name, ext) ->
        <a style={styles}>
            <span style={fontWeight: if @props.mask then 'normal' else 'bold'}>{misc.trunc_middle(name,50)}</span>
            <span style={color: if not @props.mask then '#999'}>{if ext is '' then '' else ".#{ext}"}</span>
        </a>

    render_name : ->
        show_tip = (@props.display_name? and @props.name isnt @props.display_name) or @props.name.length > 50
        name     = @props.display_name ? @props.name
        ext      = misc.filename_extension(name)
        if ext isnt ''
            name = name[0...name.length - ext.length - 1] # remove the ext and the .

        styles =
            whiteSpace   : 'pre-wrap'
            wordWrap     : 'break-word'
            overflowWrap : 'break-word'
            color        : if @props.mask then '#bbbbbb'

        if show_tip
            <Tip title={if @props.display_name then 'Displayed filename is an alias. The actual name is:' else 'Full name'} tip={@props.name}>
                {@render_name_link(styles, name, ext)}
            </Tip>
        else
            @render_name_link(styles, name, ext)

    handle_click : (e) ->
        fullpath = misc.path_join(@props.current_path) + @props.name
        @props.actions.open_file(path:fullpath, foreground:open_in_foreground(e))

    render : ->
        row_styles =
            border       : '1px solid #ffffff'
            cursor       : 'pointer'
            borderRadius : '4px'

        <Row style={row_styles} onClick={@handle_click}>
            <Col sm=1>
                <FileCheckbox
                    name       = {@props.name}
                    checked    = {@props.checked}
                    actions    = {@props.actions} />
            </Col>
            <Col sm=1>
                {@render_icon()}
            </Col>
            <Col sm=5>
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
    displayName : 'ProjectFiles-DirectoryRow'

    propTypes :
        name         : rtypes.string.isRequired
        display_name : rtypes.string  # if given, will display this, and will show true filename in popover
        checked      : rtypes.bool
        time         : rtypes.number
        mask         : rtypes.bool
        current_path : rtypes.array
        actions    : rtypes.object.isRequired

    handle_click : ->
        @props.actions.set_current_path(@props.current_path.concat(@props.name))
        @props.actions.setTo(page_number : 0)

    render_time : ->
        if @props.time?
            <TimeAgo date={(new Date(@props.time * 1000)).toISOString()} />

    render_name_link : ->
        if (@props.display_name and @props.display_name isnt @props.name) or @props.name.length > 50
            <Tip title={if @props.display_name then 'Displayed directory name is an alias. The actual name is:' else 'Full name'} tip={@props.name}>
                <a style={color : if @props.mask then '#bbbbbb'}>
                    {misc.trunc_middle(@props.display_name ? @props.name, 50)}
                </a>
            </Tip>
        else
            <a style={color : if @props.mask then '#bbbbbb'}>
                {misc.trunc_middle(@props.display_name ? @props.name, 50)}
            </a>

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
        <Row style={row_styles} onClick={@handle_click}>
            <Col sm=1>
                <FileCheckbox
                    name       = {@props.name}
                    checked    = {@props.checked}
                    actions    = {@props.actions} />
            </Col>
            <Col sm=1>
                <a style={color : if @props.mask then '#bbbbbb'}>
                    <Icon name='folder-open-o' style={fontSize:'14pt'} />
                </a>
            </Col>
            <Col sm=5 style={directory_styles}>
                {@render_name_link()}
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
    displayName : 'ProjectFiles-NoFiles'

    render : ->
        <div>No Files</div>

FileListing = rclass
    displayName : 'ProjectFiles-FileListing'

    propTypes :
        listing       : rtypes.array.isRequired
        checked_files : rtypes.object
        current_path  : rtypes.array
        page_number   : rtypes.number
        page_size     : rtypes.number
        actions    : rtypes.object.isRequired

    render_row : (name, size, time, mask, isdir, display_name) ->
        if isdir
            return <DirectoryRow
                        name         = {name}
                        display_name = {display_name}
                        time         = {time}
                        key          = {name}
                        mask         = {mask}
                        checked      = {@props.checked_files.has(name)}
                        current_path = {@props.current_path}
                        actions      = {@props.actions} />
        else
            return <FileRow
                        name         = {name}
                        display_name = {display_name}
                        time         = {time}
                        size         = {size}
                        mask         = {mask}
                        checked      = {@props.checked_files.has(name)}
                        key          = {name}
                        current_path = {@props.current_path}
                        actions      = {@props.actions} />

    handle_parent : (e) ->
        e.preventDefault()
        @props.actions.set_current_path(@props.current_path[0...-1])
        @props.actions.setTo(page_number : 0)

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
                    <a><Icon name='reply' style={fontSize:'14pt'} /></a>
                </Col>
                <Col sm=4 style={styles}>
                    <a href=''>Parent Directory</a>
                </Col>
            </Row>

    render_rows : ->
        start_index = @props.page_size * @props.page_number
        end_index   = start_index + @props.page_size
        (@render_row(a.name, a.size, a.mtime, a.mask, a.isdir, a.display_name) for a in @props.listing[start_index...end_index])

    render_no_files : ->
        if @props.listing.length is 0
            <NoFiles current_path = {@props.current_path} actions={@props.actions} />

    render : ->
        <Col sm=12>
            {@parent_directory()}
            {@render_rows()}
            {@render_no_files()}
        </Col>

EmptyTrash = rclass
    displayName : 'ProjectFiles-EmptyTrash'

    propTypes :
        actions : rtypes.object

    getInitialState : ->
        state : 'closed'

    empty_trash : ->
        @props.actions.delete_files
            paths : ['.trash']

    render : ->
        <span>
            &nbsp;&nbsp;&nbsp;
            <Button bsSize='xsmall' bsStyle='danger' onClick={@empty_trash}>
                <Icon name='trash-o' /> Empty Trash...
            </Button>
        </span>

ProjectFilesPath = rclass
    displayName : 'ProjectFiles-ProjectFilesPath'

    propTypes :
        current_path : rtypes.array
        actions    : rtypes.object.isRequired

    make_path : ->
        v = []
        v.push <PathSegmentLink path={[]} display={<Icon name='home' />} key='home' actions={@props.actions} />
        for segment, i in @props.current_path
            v.push <span key={2 * i + 1}>&nbsp; / &nbsp;</span>
            v.push <PathSegmentLink
                    path       = {@props.current_path[0...i + 1]}
                    display    = {misc.trunc_middle(segment, 10)}
                    full_name  = {segment}
                    key        = {2 * i + 2}
                    actions    = {@props.actions} />
        return v

    empty_trash : ->
        if underscore.isEqual(['.trash'], @props.current_path)
            <EmptyTrash actions={@props.actions} />
    render : ->
        <div style={wordWrap:'break-word'}>
            {@make_path()}
            {@empty_trash()}
        </div>

ProjectFilesButtons = rclass
    displayName : 'ProjectFiles-ProjectFilesButtons'

    propTypes :
        show_hidden  : rtypes.bool
        sort_by_time : rtypes.bool
        current_path : rtypes.array
        actions    : rtypes.object.isRequired

    handle_refresh : (e) ->
        e.preventDefault()
        @props.actions.set_directory_files(@props.current_path, @props.sort_by_time, @props.show_hidden)

    handle_sort_method : (e) ->
        e.preventDefault()
        @props.actions.setTo(sort_by_time : not @props.sort_by_time)
        @props.actions.set_directory_files(@props.current_path, not @props.sort_by_time, @props.show_hidden)

    handle_hidden_toggle : (e) ->
        e.preventDefault()
        @props.actions.setTo(show_hidden : not @props.show_hidden)
        @props.actions.set_directory_files(@props.current_path, @props.sort_by_time, not @props.show_hidden)

    render_refresh : ->
        <a href='' onClick={@handle_refresh}><Icon name='refresh' /> </a>

    render_sort_method : ->
        if @props.sort_by_time
            <a href='' onClick={@handle_sort_method}><Icon name='sort-numeric-asc' /> </a>
        else
            <a href='' onClick={@handle_sort_method}><Icon name='sort-alpha-asc' /> </a>

    render_hidden_toggle : ->
        if @props.show_hidden
            <a href='' onClick={@handle_hidden_toggle}><Icon name='eye' /> </a>
        else
            <a href='' onClick={@handle_hidden_toggle}><Icon name='eye-slash' /> </a>

    render_trash : ->
        <a href='' onClick={(e)=>e.preventDefault(); @props.actions.open_directory('.trash')}>
            <Icon name='trash' />  </a>

    render_backup : ->
        <a href='' onClick={(e)=>e.preventDefault(); @props.actions.open_directory('.snapshots')}>
            <Icon name='life-saver' /> <span style={fontSize: 14}>Backups</span> </a>

    render : ->
        <Col sm=3 style={textAlign: 'right', fontSize: '14pt'}>
            {@render_refresh()}
            {@render_sort_method()}
            {@render_hidden_toggle()}
            {@render_trash()}
            {@render_backup()}
        </Col>

ProjectFilesActions = rclass
    displayName : 'ProjectFiles-ProjectFilesActions'

    propTypes :
        checked_files : rtypes.object
        listing       : rtypes.array
        page_number   : rtypes.number
        page_size     : rtypes.number
        current_path  : rtypes.array
        actions    : rtypes.object.isRequired

    getInitialState : ->
        select_entire_directory : 'hidden' # hidden -> check -> clear

    componentWillReceiveProps : (nextProps) ->
        if @props.current_path.join('/') isnt nextProps.current_path.join('/')
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
        @props.actions.clear_all_checked_files()
        if @state.select_entire_directory isnt 'hidden'
            @setState(select_entire_directory : 'hidden')

    check_all_click_handler : ->
        if @props.checked_files.size is 0
            files_on_page = @props.listing[@props.page_size * @props.page_number...@props.page_size * (@props.page_number + 1)]
            @props.actions.set_all_checked_files(file.name for file in files_on_page)

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

        <Button bsSize='small' onClick={@check_all_click_handler} >
            <Icon name={button_icon} /> {button_text}
        </Button>

    select_entire_directory : ->
        @props.actions.set_all_checked_files(file.name for file in @props.listing)

    render_select_entire_directory : ->
        switch @state.select_entire_directory
            when 'check'
                <Button bsSize='xsmall' onClick={@select_entire_directory}>
                    Select all {@props.listing.length} items
                </Button>
            when 'clear'
                <Button bsSize='xsmall' onClick={@clear_selection}>
                    Clear entire selection.
                </Button>

    render_currently_selected : ->
        checked = @props.checked_files?.size ? 0
        total = @props.listing.length
        if checked is 0
            <div style={color:'#999'}>
                <span>{"#{total} #{misc.plural(total, 'item')}"}</span>
            </div>
        else
            <div style={color:'#999'}>
                <span>{"#{checked} of #{total} #{misc.plural(total, 'item')} selected"}</span>
                &nbsp;
                {@render_select_entire_directory()}
            </div>

    render_action_button : (name) ->
        obj = file_action_buttons[name]
        <Button
            onClick={=>@props.actions.set_file_action(name)}
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

        <ButtonGroup bsSize='small'>
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
    displayName : 'ProjectFiles-ProjectFilesActionBox'

    propTypes :
        checked_files : rtypes.object
        file_action   : rtypes.string
        current_path  : rtypes.array.isRequired
        project_id    : rtypes.string.isRequired
        flux          : rtypes.object
        actions       : rtypes.object.isRequired

    cancel_action : ->
        @props.actions.set_file_action(undefined)

    delete_click : ->
        pathname = @props.current_path.join('/')
        if pathname != ''
            pathname += '/'
        @props.actions.trash_files
            src : @props.checked_files.map((x) -> pathname + x).toArray()

    compress_click : ->
        destination = @refs.result_archive.getValue()
        @props.actions.zip_files
            src  : @props.checked_files.toArray()
            dest : destination
            path : @props.current_path

    rename_click : ->
        destination = @refs.new_name.getValue()
        @props.actions.move_files
            src  : @props.checked_files.toArray()
            dest : destination
            path : @props.current_path

    move_click : ->
        destination = @refs.move_destination.getValue()
        pathname = @props.current_path.join('/')
        if pathname != ''
            pathname += '/'
        @props.actions.move_files
            src  : @props.checked_files.map((x) -> pathname + x).toArray()
            dest : destination

    copy_click : ->
        destination_directory = @refs.copy_destination_directory.getValue()
        destination_project   = @refs.copy_destination_project.getValue()
        overwrite_newer       = @refs.overwrite_newer_checkbox.getChecked()
        delete_extra_files    = @refs.delete_extra_files_checkbox.getChecked()
        pathname = @props.current_path.join('/')
        if pathname != ''
            pathname += '/'
        @props.actions.copy_files
            src  : @props.checked_files.map((x) -> pathname + x).toArray()
            dest : destination_directory

        console.log('copy to dir', destination_directory, 'copy to project', destination_project, 'overwrite newer?', overwrite_newer, 'delete extra files?', delete_extra_files)

    share_click : ->
        description = @refs.share_description.getValue()
        console.log('share desc', description)

    stop_sharing_click : ->
        console.log('stop sharing')

    download_click : ->
        pathname = misc.path_join(@props.current_path)
        @props.actions.download_file
            path : pathname + @props.checked_files.first()

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
                                key          = 'result_archive'
                                type         = 'text'
                                defaultValue = {if single_item? then "#{single_item}.zip" else require('account').default_filename('zip')}
                                placeholder  = 'Result archive...' />
                        </Col>
                    </Row>
                    <Row>
                        <Col sm=12>
                            <ButtonToolbar>
                                <Button bsStyle='warning' onClick={@compress_click}>
                                    Compress {size} {misc.plural(size, 'item')}
                                </Button>
                                <Button onClick={@cancel_action}>
                                    Cancel
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
                                <Button bsStyle='danger' onClick={@delete_click}>
                                    Delete {size} {misc.plural(size, 'item')}
                                </Button>
                                <Button onClick={@cancel_action}>
                                    Cancel
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
                                key          = 'new_name'
                                type         = 'text'
                                defaultValue = {single_item}
                                placeholder  = 'New file name...' />
                        </Col>
                    </Row>
                    <Row>
                        <Col sm=12>
                            <ButtonToolbar>
                                <Button bsStyle='info' onClick={@rename_click}>
                                    Rename file
                                </Button>
                                <Button onClick={@cancel_action}>
                                    Cancel
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
                                key          = 'move_destination'
                                type         = 'text'
                                defaultValue = {@props.current_path.join('/')}
                                placeholder  = 'Destination folder...' />
                        </Col>
                    </Row>
                    <Row>
                        <Col sm=12>
                            <ButtonToolbar>
                                <Button bsStyle='warning' onClick={@move_click}>
                                    Move {size} {misc.plural(size, 'item')}
                                </Button>
                                <Button onClick={@cancel_action}>
                                    Cancel
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
                                key          = 'copy_destination_directory'
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
                        <Col sm=4>
                            <ButtonToolbar>
                                <Button bsStyle='primary' onClick={@copy_click}>
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
                                <Button onClick={@cancel_action}>
                                    Cancel
                                </Button>
                            </ButtonToolbar>
                        </Col>
                        <Col sm=4>
                            <Input
                                ref   = 'delete_extra_files_checkbox'
                                type  = 'checkbox'
                                label = 'Delete extra files in target directory' />
                        </Col>
                        <Col sm=4>
                            <Input
                                ref   = 'overwrite_newer_checkbox'
                                type  = 'checkbox'
                                label = 'Overwrite newer versions of files' />
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
                                key          = 'share_description'
                                type         = 'text'
                                defaultValue = {''}
                                placeholder  = 'Description...' />
                        </Col>
                    </Row>
                    <Row>
                        <Col sm=12>
                            <ButtonToolbar>
                                <Button bsStyle='primary' onClick={@share_click}>
                                    Share {size} {misc.plural(size, 'item')} publicly
                                </Button>
                                <Button bsStyle='warning' onClick={@stop_sharing_click}>
                                    Stop sharing {size} {misc.plural(size, 'item')} publicly
                                </Button>
                                <Button onClick={@cancel_action}>
                                    Cancel
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
                        <Col sm=5 style={color:'#666'}>
                            <h4>Raw link:</h4>
                        </Col>
                    </Row>
                    <Row>
                        <Col sm=12>
                            <ButtonToolbar>
                                <Button bsStyle='primary' onClick={@download_click}>
                                    Download
                                </Button>
                                <Button onClick={@cancel_action}>
                                    Cancel
                                </Button>
                            </ButtonToolbar>
                        </Col>
                    </Row>
                </div>

    render : ->
        action = @props.file_action
        action_button = file_action_buttons[action]
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
                </Row>
            </Well>

ProjectFilesSearch = rclass
    displayName : 'ProjectFiles-ProjectFilesSearch'

    propTypes :
        file_search : rtypes.string
        actions     : rtypes.object

    getDefaultProps : ->
        file_search : ''

    render : ->
        <SearchInput
            placeholder = "Filename"
            value       = {@props.file_search}
            on_change   = {(v)=>@props.actions.setTo(file_search : v, page_number: 0)}
        />

ProjectFilesNew = rclass
    displayName : 'ProjectFiles-ProjectFilesNew'

    propTypes :
        file_search : rtypes.string.isRequired
        current_path : rtypes.array
        actions    : rtypes.object.isRequired

    getDefaultProps : ->
        file_search : ''

    new_file_button_types : ['sagews', 'term', 'ipynb', 'tex', 'md', 'tasks', 'course', 'sage', 'py']

    file_dropdown_icon : ->
        <span><Icon name='plus-circle' /> New</span>

    file_dropdown_item : (i, ext) ->
        data = file_associations[ext]
        <MenuItem eventKey=i key={i} onClick={=>@create_file(ext)}>
            <Icon name={data.icon.substring(3)} /> <span style={textTransform:'capitalize'}>{data.name} </span> <span style={color:'#666'}>(.{ext})</span>
        </MenuItem>

    handle_file_click : ->
        if @props.file_search.length == 0
            @props.actions.set_focused_page("project-new-file")
        else
            @create_file()

    create_file : (ext) ->
        @props.actions.create_file
            name : @props.file_search
            ext  : ext
            current_path : @props.current_path
            on_download : ((a) => @setState(download: a))
            on_error : ((a) => @setState(error: a))
        @props.actions.setTo(file_search : '', page_number: 0)

    create_folder : ->
        @props.actions.create_folder(@props.file_search, @props.current_path)

    render : ->
        <SplitButton title={@file_dropdown_icon()} onClick={@handle_file_click} >
            {(@file_dropdown_item(i, ext) for i, ext of @new_file_button_types)}
            <MenuItem divider />
            <MenuItem eventKey='folder' key='folder' onClick={@create_folder}>
                <Icon name='folder' /> Folder
            </MenuItem>
        </SplitButton>

error_style =
    marginRight : '1ex'
    whiteSpace  : 'pre-line'
    position    : 'absolute'
    zIndex      : 15
    right       : '5px'
    top         : '-43px'
    boxShadow   : '5px 5px 5px grey'

ProjectFiles = rclass
    displayName : 'ProjectFiles'

    propTypes :
        current_path : rtypes.array
        activity   : rtypes.object
        page_number : rtypes.number
        file_action : rtypes.string
        file_search : rtypes.string
        show_hidden : rtypes.bool
        sort_by_time : rtypes.bool
        error      : rtypes.string
        checked_files : rtypes.object
        project_id : rtypes.string
        flux       : rtypes.object
        actions    : rtypes.object.isRequired

    getDefaultProps : ->
        page_number : 0

    previous_page : ->
        if @props.page_number > 0
            @props.actions.setTo(page_number : @props.page_number - 1)

    next_page : ->
        @props.actions.setTo(page_number : @props.page_number + 1)

    render_paging_buttons : (num_pages) ->
        if num_pages > 1
            <ButtonGroup style={marginBottom:'5px'}>
                <Button onClick={@previous_page} disabled={@props.page_number <= 0} >
                    <Icon name='angle-double-left' /> Prev
                </Button>
                <Button disabled>
                    {"#{@props.page_number + 1}/#{num_pages}"}
                </Button>
                <Button onClick={@next_page} disabled={@props.page_number >= num_pages - 1} >
                    <Icon name='angle-double-right' /> Next
                </Button>
            </ButtonGroup>

    # render the files action box if there is an action and at least 1 file checked
    render_files_action_box : ->
        if @props.checked_files.size > 0 and @props.file_action?
            <Col sm=12>
                <ProjectFilesActionBox
                    file_action   = {@props.file_action}
                    checked_files = {@props.checked_files}
                    current_path  = {@props.current_path}
                    project_id    = {@props.project_id}
                    flux          = {@props.flux}
                    actions       = {@props.actions} />
            </Col>

    render_files_actions : (listing) ->
        if listing.length > 0
            <ProjectFilesActions
                checked_files = {@props.checked_files}
                file_action   = {@props.file_action}
                page_number   = {@props.page_number}
                page_size     = {PAGE_SIZE}
                current_path  = {@props.current_path}
                listing       = {listing}
                actions       = {@props.actions} />

    render_activity : ->
        <ActivityDisplay
            trunc    = 80
            activity = {underscore.values(@props.activity)}
            on_clear = {=>@props.actions.clear_all_activity()}
        />

    render_error : ->
        if @props.error
            <ErrorDisplay
                error   = {@props.error}
                style   = {error_style}
                onClose = {=>@props.actions.setTo(error:'')}
            />
    render_file_listing: (listing, error) ->
        if error
            if error == 'nodir'
                if underscore.isEqual(@props.current_path, ['.trash'])
                    error = 'The trash is empty!'
                else
                    error = "The path #{misc.path_join(@props_current_path)} does not exist."
            <ErrorDisplay error={error} />
        else if listing?
            <FileListing
                listing       = {listing}
                page_size     = {PAGE_SIZE} # TODO: make a user setting
                page_number   = {@props.page_number}
                checked_files = {@props.checked_files}
                current_path  = {@props.current_path}
                actions       = {@props.actions} />
        else
            <Loading />

    render : ->
        {listing,error} = @props.flux.getProjectStore(@props.project_id)?.get_displayed_listing()
        <div>
            {@render_error()}
            {@render_activity()}
            <Row>
                <Col sm=4>
                    <Row>
                        <Col sm=8>
                            <ProjectFilesSearch file_search={@props.file_search} actions={@props.actions} />
                        </Col>
                        <Col sm=4>
                            <ProjectFilesNew file_search={@props.file_search} current_path={@props.current_path} actions={@props.actions} />
                        </Col>
                    </Row>
                </Col>
                <Col sm=5>
                    <ProjectFilesPath current_path={@props.current_path} actions={@props.actions} />
                </Col>
                <ProjectFilesButtons
                    show_hidden  = {@props.show_hidden ? false}
                    sort_by_time = {@props.sort_by_time ? true}
                    current_path = {@props.current_path}
                    actions      = {@props.actions} />
            </Row>
            <Row>
                <Col sm=8>
                    {@render_files_actions(listing) if listing?}
                </Col>
                <Col sm=4>
                    <MiniTerminal
                        current_path = {@props.current_path}
                        project_id   = {@props.project_id}
                        actions      = {@props.actions} />
                </Col>
                {@render_files_action_box()}
            </Row>

            <Row>
                <Col sm=3>
                    {@render_paging_buttons(Math.ceil(listing.length / PAGE_SIZE)) if listing?}
                </Col>
            </Row>
            {@render_file_listing(listing, error)}
        </div>

render = (project_id, flux) ->
    store = flux.getProjectStore(project_id, flux)
    actions = flux.getProjectActions(project_id)
    name = store.name
    connect_to =
        activity               : name
        file_search            : name
        file_action            : name
        error                  : name
        page_number            : name
        checked_files          : name
        current_path           : name
        show_hidden            : name
        sort_by_time           : name
    <Flux flux={flux} connect_to={connect_to}>
        <ProjectFiles project_id={project_id} flux={flux} actions={actions} />
    </Flux>

exports.render_new = (project_id, dom_node, flux) ->
    React.render(render(project_id, flux), dom_node)