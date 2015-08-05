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
 ButtonToolbar, Popover, OverlayTrigger, SplitButton, MenuItem, Alert} =  require('react-bootstrap')
misc = require('misc')
{ActivityDisplay, DirectoryInput, Icon, Loading, SearchInput, TimeAgo, ErrorDisplay, Tip} = require('r_misc')
{human_readable_size, open_in_foreground} = require('misc_page')
{MiniTerminal} = require('project_miniterm')
{file_associations} = require('editor')
immutable  = require('immutable')
underscore = require('underscore')

Combobox = require('react-widgets/lib/Combobox') #TODO: delete this when the combobox is in r_misc

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
        path       : rtypes.string
        display    : rtypes.oneOfType([rtypes.string, rtypes.object])
        actions    : rtypes.object.isRequired
        full_name  : rtypes.string

    styles :
        cursor   : 'pointer'
        fontSize : '18px'

    handle_click : ->
        @props.actions.set_current_path(@props.path)
        @props.actions.set_focused_page('project-file-listing')

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
        name    : rtypes.string
        checked : rtypes.bool
        actions : rtypes.object.isRequired

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
        current_path : rtypes.string
        actions      : rtypes.object.isRequired

    shouldComponentUpdate : (next) ->
        return @props.name != next.name          or
        @props.display_name != next.display_name or
        @props.size != next.size                 or
        @props.time != next.time                 or
        @props.checked != next.checked           or
        @props.mask != next.mask                 or
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
        name = @props.display_name ? @props.name
        ext  = misc.filename_extension(name)
        if ext isnt ''
            name = name[0...name.length - ext.length - 1] # remove the ext and the .

        show_tip = (@props.display_name? and @props.name isnt @props.display_name) or name.length > 50

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
        fullpath = misc.path_to_file(@props.current_path, @props.name)
        @props.actions.open_file
            path       : fullpath
            foreground : open_in_foreground(e)
        @props.actions.set_file_search('')

    render : ->
        row_styles =
            cursor          : 'pointer'
            borderRadius    : '4px'
            backgroundColor : @props.color

        <Row style={row_styles} onClick={@handle_click}>
            <Col sm=1>
                <FileCheckbox
                    name    = {@props.name}
                    checked = {@props.checked}
                    actions = {@props.actions} />
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
        current_path : rtypes.string
        actions      : rtypes.object.isRequired

    handle_click : ->
        @props.actions.set_current_path(misc.path_to_file(@props.current_path, @props.name))
        @props.actions.set_focused_page('project-file-listing')
        @props.actions.setTo(page_number : 0)
        @props.actions.set_file_search('')

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
            cursor          : 'pointer'
            borderRadius    : '4px'
            backgroundColor : @props.color

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

pager_range = (page_size, page_number) ->
    start_index = page_size*page_number
    return {start_index: start_index, end_index: start_index + page_size}

FileListing = rclass
    displayName : 'ProjectFiles-FileListing'

    propTypes :
        listing       : rtypes.array.isRequired
        checked_files : rtypes.object
        current_path  : rtypes.string
        page_number   : rtypes.number
        page_size     : rtypes.number
        actions       : rtypes.object.isRequired

    render_row : (name, size, time, mask, isdir, display_name, index) ->
        color = 'white'
        if index % 2 == 0
            color = '#eee'
        if isdir
            return <DirectoryRow
                name         = {name}
                display_name = {display_name}
                time         = {time}
                key          = {index}
                color        = {color}
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
                color        = {color}
                mask         = {mask}
                checked      = {@props.checked_files.has(name)}
                key          = {index}
                current_path = {@props.current_path}
                actions      = {@props.actions} />

    handle_parent : (e) ->
        e.preventDefault()
        @props.actions.set_current_path(misc.path_split(@props.current_path).head)
        @props.actions.set_focused_page('project-file-listing')
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
        (@render_row(a.name, a.size, a.mtime, a.mask, a.isdir, a.display_name, i) for a, i in @props.listing)

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
        open : false

    empty_trash : ->
        @props.actions.delete_files(paths : ['.trash'])
        @setState(open : false)

    render_confirm : ->
        if @state.open
            <Alert bsStyle='danger'>
                Are you sure? This will permanently delete all items in the trash.
                <ButtonToolbar>
                    <Button onClick={@empty_trash} bsStyle='danger'>Empty trash</Button>
                    <Button onClick={=>@setState(open : false)}>Cancel</Button>
                </ButtonToolbar>
            </Alert>

    render : ->
        <span>
            &nbsp;&nbsp;&nbsp;
            <Button bsSize='xsmall' bsStyle='danger' onClick={=>@setState(open : not @state.open)}>
                <Icon name='trash-o' /> Empty Trash...
            </Button>
            {@render_confirm()}
        </span>

ProjectFilesPath = rclass
    displayName : 'ProjectFiles-ProjectFilesPath'

    propTypes :
        current_path : rtypes.string
        actions      : rtypes.object.isRequired

    make_path : ->
        v = []
        v.push <PathSegmentLink path='' display={<Icon name='home' />} key='home' actions={@props.actions} />
        if @props.current_path == ""
            return v
        path = @props.current_path.split('/')
        for segment, i in path
            v.push <span key={2 * i + 1}>&nbsp; / &nbsp;</span>
            v.push <PathSegmentLink
                    path      = {path[0...i + 1].join('/')}
                    display   = {misc.trunc_middle(segment, 15)}
                    full_name = {segment}
                    key       = {2 * i + 2}
                    actions   = {@props.actions} />
        return v

    empty_trash : ->
        if @props.current_path == '.trash'
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
        current_path : rtypes.string
        actions      : rtypes.object.isRequired

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
        <div style={textAlign: 'right', fontSize: '14pt'}>
            {@render_refresh()}
            {@render_sort_method()}
            {@render_hidden_toggle()}
            {@render_trash()}
            {@render_backup()}
        </div>

ProjectFilesActions = rclass
    displayName : 'ProjectFiles-ProjectFilesActions'

    propTypes :
        checked_files : rtypes.object
        listing       : rtypes.array
        page_number   : rtypes.number
        page_size     : rtypes.number
        current_path  : rtypes.string
        actions    : rtypes.object.isRequired

    getInitialState : ->
        select_entire_directory : 'hidden' # hidden -> check -> clear

    componentWillReceiveProps : (nextProps) ->
        if @props.current_path isnt nextProps.current_path
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
            <Icon name={obj.icon} /> {obj.name}...
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
        current_path  : rtypes.string.isRequired
        project_id    : rtypes.string.isRequired
        flux          : rtypes.object
        actions       : rtypes.object.isRequired

    getInitialState : ->
        copy_destination_directory  : undefined
        copy_destination_project_id : @props.project_id
        move_destination            : undefined
        new_name                    : @props.checked_files?.first()
        show_different_project      : false

    pre_styles :
        marginBottom    : '15px'
        maxHeight       : '80px'
        minHeight       : '34px'
        fontSize        : '14px'
        fontFamily      : 'inherit'
        color           : '#555'
        backgroundColor : 'white'
        padding         : '6px 12px'

    cancel_action : ->
        @props.actions.set_file_action(undefined)

    delete_click : ->
        path = @props.current_path
        if path != ''
            path += '/'
        @props.actions.trash_files
            src : @props.checked_files.map((x) -> path + x).toArray()
        @props.actions.set_file_action()

    compress_click : ->
        destination = @refs.result_archive.getValue()
        @props.actions.zip_files
            src  : @props.checked_files.toArray()
            dest : destination
            path : @props.current_path
        @props.actions.set_file_action()

    rename_click : ->
        destination = @refs.new_name.getValue()
        @props.actions.move_files
            src  : @props.checked_files.toArray()
            dest : destination
            path : @props.current_path
        @props.actions.set_file_action()

    move_click : ->
        path = @props.current_path
        if path != ''
            path += '/'
        @props.actions.move_files
            src  : @props.checked_files.map((x) -> path + x).toArray()
            dest : @state.move_destination ? ''
        @props.actions.set_file_action()

    copy_click : ->
        destination_directory  = @state.copy_destination_directory
        destination_project_id = @state.copy_destination_project_id
        overwrite_newer        = @refs.overwrite_newer_checkbox?.getChecked()
        delete_extra_files     = @refs.delete_extra_files_checkbox?.getChecked()
        path = @props.current_path
        if path != ''
            path += '/'
        paths = @props.checked_files.map((x) -> path + x).toArray()
        if destination_project_id? and @props.project_id isnt destination_project_id
            @props.actions.copy_paths_between_projects
                src_project_id    : @props.project_id
                src               : paths
                target_project_id : destination_project_id
                target_path       : destination_directory
                overwrite_newer   : overwrite_newer
                delete_missing    : delete_extra_files
        else
            @props.actions.copy_files
                src  : paths
                dest : destination_directory
        @props.actions.set_file_action()

    share_click : ->
        description = @refs.share_description.getValue()
        obj = {}
        for path in @props.checked_files.toArray()
            obj[path] = description
        @props.flux.getActions('projects').set_public_paths(@props.project_id, obj)
        @props.actions.set_file_action()

    stop_sharing_click : ->
        @props.actions.set_file_action()

    download_click : ->
        @props.actions.download_file
            path : misc.path_to_file(@props.current_path, @props.checked_files.first())
        @props.actions.set_file_action()

    render_selected_files_list : ->
        <pre style={@pre_styles}>
            {<div key={name}>{name}</div> for name in @props.checked_files.toArray()}
        </pre>

    render_rename_warning : ->
        initial_ext = misc.filename_extension(@props.checked_files.first())
        current_ext = misc.filename_extension(@state.new_name)
        if initial_ext isnt current_ext
            <Alert bsStyle='warning'>
                <h4><Icon name='exclamation-triangle' /> Warning</h4>
                <p>Are you sure you want to change the file extension?</p>
                <p>This may cause your file to no longer open properly.</p>
            </Alert>

    different_project_button : ->
        <Button bsSize='xsmall' onClick={=>@setState(show_different_project : true)}>a different project</Button>

    render_different_project_dialog : ->
        if @state.show_different_project
            <Col sm=4 style={color:'#666'}>
                <h4>In the project</h4>
                <Combobox
                    valueField   = {'id'}
                    textField    = {'title'}
                    data         = {@props.flux.getStore('projects').get_project_select_list(@props.project_id)}
                    filter       = {'contains'}
                    defaultValue = {@props.project_id}
                    onSelect     = {(value) => @setState(copy_destination_project_id : value.id)}
                    messages     = {emptyFilter : '', emptyList : ''}
                    />
                {@render_copy_different_project_options()}
            </Col>

    render_copy_different_project_options : ->
        if @props.project_id isnt @state.copy_destination_project_id
            <div>
                <Input
                    ref   = 'delete_extra_files_checkbox'
                    type  = 'checkbox'
                    label = 'Delete extra files in target directory' />
                <Input
                    ref   = 'overwrite_newer_checkbox'
                    type  = 'checkbox'
                    label = 'Overwrite newer versions of files' />
            </div>

    render_action_box : (action) ->
        size = @props.checked_files.size
        if size is 1
            single_item = @props.checked_files.first()

        switch action
            when 'compress'
                <div>
                    <Row>
                        <Col sm=5 style={color:'#666'}>
                            <h4>Create a zip file</h4>
                            {@render_selected_files_list()}
                        </Col>

                        <Col sm=5 style={color:'#666'}>
                            <h4>Result archive</h4>
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
                            <h4>Move to the trash</h4>
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
                            <h4>Change the name</h4>
                            {@render_selected_files_list()}
                        </Col>
                        <Col sm=5 style={color:'#666'}>
                            <h4>New name</h4>
                            <Input
                                autoFocus
                                ref          = 'new_name'
                                key          = 'new_name'
                                type         = 'text'
                                defaultValue = {single_item}
                                placeholder  = 'New file name...'
                                onChange     = {=>@setState(new_name : @refs.new_name.getValue())}
                                />
                            {@render_rename_warning()}
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
                            <h4>Move to a folder</h4>
                            {@render_selected_files_list()}
                        </Col>
                        <Col sm=5 style={color:'#666'}>
                            <h4>Destination</h4>
                            <DirectoryInput
                                on_change    = {(value)=>@setState(move_destination:value)}
                                key          = 'move_destination'
                                default_value = {@props.current_path}
                                placeholder  = 'Destination folder...'
                                flux={@props.flux} project_id={@props.project_id}
                                />
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
                            <h4 style={height:'19px'}>
                                Copy to a folder or {if @state.show_different_project then 'project' else @different_project_button()}
                            </h4>
                            {@render_selected_files_list()}
                        </Col>
                        {@render_different_project_dialog()}
                        <Col sm=4 style={color:'#666'}>
                            <h4>Destination</h4>
                            <DirectoryInput
                                on_change    = {(value)=>@setState(copy_destination_directory:value)}
                                key          = 'copy_destination_directory'
                                placeholder  = 'Destination folder...'
                                flux         = {@props.flux}
                                project_id   = {@state.copy_destination_project_id}
                                />
                        </Col>
                    </Row>
                    <Row>
                        <Col sm=4>
                            <ButtonToolbar>
                                <Button bsStyle='primary' onClick={@copy_click}>
                                    Copy {size} {misc.plural(size, 'item')}
                                </Button>
                                <Button onClick={@cancel_action}>
                                    Cancel
                                </Button>
                            </ButtonToolbar>
                        </Col>
                    </Row>
                </div>

            when 'share'
                <div>
                    <Row>
                        <Col sm=5 style={color:'#666'}>
                            <h4>Share publicly</h4>
                            {@render_selected_files_list()}
                        </Col>
                        <Col sm=5 style={color:'#666'}>
                            <h4>Description of share (optional)</h4>
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
                            <h4>Download file to your computer</h4>
                            {@render_selected_files_list()}
                        </Col>
                        <Col sm=7 style={color:'#666'}>
                            <h4>Raw link</h4>
                            <pre style={@pre_styles}>
                                <a href={"#{window.salvus_base_url}/#{@props.project_id}/raw/#{misc.encode_path(single_item)}"} target='_blank'>
                                    {"...#{window.salvus_base_url}/#{@props.project_id}/raw/#{misc.encode_path(single_item)}"}
                                </a>
                            </pre>
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
        file_search   : rtypes.string
        actions       : rtypes.object
        selected_file : rtypes.object   # if given, file selected by cursor, which we open on pressing enter

    getDefaultProps : ->
        file_search : ''

    render_warning : ->
        if @props.file_search?.length > 0
            <Alert style={wordWrap:'break-word'} bsStyle='warning'>
                Showing only files matching "{@props.file_search}"
            </Alert>

    open_selected_file: ->
        if @props.selected_file
            if @props.selected_file.isdir
                @props.actions.set_current_path(@props.selected_file.name)
            else
                @props.actions.open_file(path: @props.selected_file.name)
            @props.actions.set_file_search('')

    render : ->
        <span>
            <SearchInput
                autoFocus autoSelect
                placeholder   = 'Filename'
                default_value = {@props.file_search}
                on_change     = {@props.actions.set_file_search}
                on_submit     = {@open_selected_file}
            />
            {@render_warning()}
        </span>

ProjectFilesNew = rclass
    displayName : 'ProjectFiles-ProjectFilesNew'

    propTypes :
        file_search  : rtypes.string.isRequired
        current_path : rtypes.string
        actions      : rtypes.object.isRequired

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
            @props.actions.set_focused_page('project-new-file')
        else
            @create_file()

    create_file : (ext) ->
        @props.actions.create_file
            name         : @props.file_search
            ext          : ext
            current_path : @props.current_path
            on_download  : ((a) => @setState(download: a))
            on_error     : ((a) => @setState(error: a))
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
        current_path  : rtypes.string
        activity      : rtypes.object
        page_number   : rtypes.number
        file_action   : rtypes.string
        file_search   : rtypes.string
        show_hidden   : rtypes.bool
        sort_by_time  : rtypes.bool
        error         : rtypes.string
        checked_files : rtypes.object
        project_id    : rtypes.string
        flux          : rtypes.object
        actions       : rtypes.object.isRequired

    getDefaultProps : ->
        page_number : 0

    previous_page : ->
        if @props.page_number > 0
            @props.actions.setTo(page_number : @props.page_number - 1)

    next_page : ->
        @props.actions.setTo(page_number : @props.page_number + 1)

    render_paging_buttons : (num_pages) ->
        if num_pages > 1
            <Row>
                <Col sm=4>
                    <ButtonGroup style={marginBottom:'5px'}>
                        <Button onClick={@previous_page} disabled={@props.page_number <= 0} >
                            <Icon name='angle-double-left' /> Prev
                        </Button>
                        <Button disabled>
                            {"#{@props.page_number + 1}/#{num_pages}"}
                        </Button>
                        <Button onClick={@next_page} disabled={@props.page_number >= num_pages - 1} >
                             Next <Icon name='angle-double-right' />
                        </Button>
                    </ButtonGroup>
                </Col>
            </Row>

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
            on_clear = {=>@props.actions.clear_all_activity()} />

    render_error : ->
        if @props.error
            <ErrorDisplay
                error   = {@props.error}
                style   = {error_style}
                onClose = {=>@props.actions.setTo(error:'')} />

    render_file_listing: (listing, error) ->
        if error
            if error == 'nodir'
                if @props.current_path == '.trash'
                    <Alert bsStyle='success'>The trash is empty!</Alert>
                else
                    <ErrorDisplay error={"The path #{@props.current_path} does not exist."} />
        else if listing?
            <FileListing
                listing       = {listing}
                page_size     = {PAGE_SIZE} # TODO: make a user setting
                page_number   = {@props.page_number}
                checked_files = {@props.checked_files}
                current_path  = {@props.current_path}
                actions       = {@props.actions} />
        else
            <div style={fontSize:'40px', textAlign:'center', color:'#999999'} >
                <Loading />
            </div>

    render : ->
        {listing, error} = @props.flux.getProjectStore(@props.project_id)?.get_displayed_listing()
        if listing?
            {start_index, end_index} = pager_range(PAGE_SIZE, @props.page_number)
            visible_listing = listing[start_index...end_index]
        <div>
            {@render_error()}
            {@render_activity()}
            <Row>
                <Col sm=4>
                    <ProjectFilesSearch key={@props.current_path}
                        file_search={@props.file_search} actions={@props.actions} selected_file={visible_listing?[0]} />
                </Col>
                <Col sm=2>
                    <ProjectFilesNew file_search={@props.file_search} current_path={@props.current_path} actions={@props.actions} />
                </Col>
                <Col sm=3>
                    <ProjectFilesPath current_path={@props.current_path} actions={@props.actions} />
                </Col>
                <Col sm=3>
                    <ProjectFilesButtons
                        show_hidden  = {@props.show_hidden ? false}
                        sort_by_time = {@props.sort_by_time ? true}
                        current_path = {@props.current_path}
                        actions      = {@props.actions} />
                </Col>
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
            {@render_paging_buttons(Math.ceil(listing.length / PAGE_SIZE)) if listing?}
            {@render_file_listing(visible_listing, error)}
        </div>

render = (project_id, flux) ->
    store = flux.getProjectStore(project_id, flux)
    actions = flux.getProjectActions(project_id)
    name = store.name
    connect_to =
        activity      : name
        file_search   : name
        file_action   : name
        error         : name
        page_number   : name
        checked_files : name
        current_path  : name
        show_hidden   : name
        sort_by_time  : name
    <Flux flux={flux} connect_to={connect_to}>
        <ProjectFiles project_id={project_id} flux={flux} actions={actions} />
    </Flux>

exports.render_new = (project_id, dom_node, flux) ->
    #console.log("mount")
    React.render(render(project_id, flux), dom_node)

exports.mount = (project_id, dom_node, flux) ->
    #console.log("mount")
    React.render(render(project_id, flux), dom_node)

exports.unmount = (dom_node) ->
    #console.log("unmount")
    React.unmountComponentAtNode(dom_node)

