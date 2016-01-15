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

{React, ReactDOM, rtypes, rclass, Redux} = require('./smc-react')
{Col, Row, ButtonToolbar, ButtonGroup, MenuItem, Button, Well, Input,
 ButtonToolbar, Popover, OverlayTrigger, SplitButton, MenuItem, Alert} =  require('react-bootstrap')
misc = require('smc-util/misc')
{ActivityDisplay, DeletedProjectWarning, DirectoryInput, Icon, Loading, ProjectState,
 SearchInput, TimeAgo, ErrorDisplay, Space, Tip, LoginLink} = require('./r_misc')
{BillingPageLink}     = require('./billing')
{human_readable_size} = require('./misc_page')
{MiniTerminal}        = require('./project_miniterm')
{file_associations}   = require('./editor')
account               = require('./account')
{top_navbar}          = require('./top_navbar')
immutable             = require('immutable')
underscore            = require('underscore')

Combobox = require('react-widgets/lib/Combobox') #TODO: delete this when the combobox is in r_misc

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
        @props.actions.set_url_to_path(@props.path)

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
        name         : rtypes.string
        checked      : rtypes.bool
        actions      : rtypes.object.isRequired
        current_path : rtypes.string
        style        : rtypes.object

    handle_click : (e) ->
        e.stopPropagation() # so we don't open the file
        full_name = misc.path_to_file(@props.current_path, @props.name)
        if e.shiftKey
            @props.actions.set_selected_file_range(full_name, not @props.checked)
        else
            @props.actions.set_file_checked(full_name, not @props.checked)

        @props.actions.set_most_recent_file_click(full_name)

    render : ->
        <span onClick={@handle_click} style={@props.style}>
            <Icon name={if @props.checked then 'check-square-o' else 'square-o'} fixedWidth style={fontSize:'14pt'}/>
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
        public_data  : rtypes.object
        is_public    : rtypes.bool
        current_path : rtypes.string
        actions      : rtypes.object.isRequired

    shouldComponentUpdate : (next) ->
        return @props.name != next.name          or
        @props.display_name != next.display_name or
        @props.size != next.size                 or
        @props.time != next.time                 or
        @props.checked != next.checked           or
        @props.mask != next.mask                 or
        @props.public_data != next.public_data   or
        @props.current_path != next.current_path

    render_icon : ->
        ext  = misc.filename_extension(@props.name)
        name = file_associations[ext]?.icon ? 'file'
        style =
            color         : if @props.mask then '#bbbbbb'
            verticalAlign : 'sub'
        <a style={style}>
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
            whiteSpace    : 'pre-wrap'
            wordWrap      : 'break-word'
            overflowWrap  : 'break-word'
            verticalAlign : 'middle'
            color         : if @props.mask then '#bbbbbb'

        if show_tip
            <Tip title={if @props.display_name then 'Displayed filename is an alias. The actual name is:' else 'Full name'} tip={@props.name}>
                {@render_name_link(styles, name, ext)}
            </Tip>
        else
            @render_name_link(styles, name, ext)


    render_public_file_info_popover : ->
        <Popover title='This file is being shared publicly' id='public_share' >
            <span style={wordWrap:'break-word'}>
                Description: {@props.public_data.description}
            </span>
        </Popover>

    render_public_file_info : ->
        if @props.public_data? and @props.is_public
            <span><Space/>
                <OverlayTrigger
                    trigger   = 'click'
                    rootClose
                    overlay   = {@render_public_file_info_popover()} >
                    <Button
                        bsStyle = 'info'
                        bsSize  = 'xsmall'
                        onClick = {(e)->e.stopPropagation()}
                    >
                        <Icon name='bullhorn' /> <span className='hidden-xs'>Public</span>
                    </Button>
                </OverlayTrigger>
            </span>

    handle_click : (e) ->
        fullpath = misc.path_to_file(@props.current_path, @props.name)
        @props.actions.open_file
            path       : fullpath
            foreground : misc.should_open_in_foreground(e)
        @props.actions.set_file_search('')

    render : ->
        row_styles =
            cursor          : 'pointer'
            borderRadius    : '4px'
            backgroundColor : @props.color

        <Row style={row_styles} onClick={@handle_click} className={'noselect'}>
            <Col sm=2 xs=3>
                <FileCheckbox
                    name         = {@props.name}
                    checked      = {@props.checked}
                    current_path = {@props.current_path}
                    actions      = {@props.actions}
                    style        = {verticalAlign:'sub'} />
                {@render_public_file_info()}
            </Col>
            <Col sm=1 xs=3>
                {@render_icon()}
            </Col>
            <Col sm=4 smPush=5 xs=6>
                <TimeAgo date={(new Date(@props.time * 1000)).toISOString()} style={color:'#666'}/>
                <span className='pull-right' style={color:'#666'}>{human_readable_size(@props.size)}</span>
            </Col>
            <Col sm=5 smPull=4 xs=12>
                {@render_name()}
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
        public_data  : rtypes.object
        is_public    : rtypes.bool
        current_path : rtypes.string
        actions      : rtypes.object.isRequired

    handle_click : ->
        path = misc.path_to_file(@props.current_path, @props.name)
        @props.actions.set_current_path(path)
        @props.actions.set_file_search('')
        @props.actions.set_url_to_path(path)

    render_public_directory_info_popover : ->
        <Popover id={@props.name} title='This folder is being shared publicly' style={wordWrap:'break-word'}>
            Description: {@props.public_data.description}
        </Popover>

    render_public_directory_info : ->
        if @props.public_data? and @props.is_public
            <span><Space/>
                <OverlayTrigger
                    trigger   = 'click'
                    rootClose
                    overlay   = {@render_public_directory_info_popover()} >
                    <Button
                        bsStyle = 'info'
                        bsSize  = 'xsmall'
                        onClick = {(e)->e.stopPropagation()}
                    >
                        <Icon name='bullhorn' /> <span className='hidden-xs'>Public</span>
                    </Button>
                </OverlayTrigger>
            </span>

    render_time : ->
        if @props.time?
            <TimeAgo date={(new Date(@props.time * 1000)).toISOString()} style={color:'#666'} />

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
            fontWeight     : 'bold'
            whiteSpace     : 'pre-wrap'
            wordWrap       : 'break-word'
            overflowWrap   : 'break-word'
            verticalAlign  : 'sub'

        <Row style={row_styles} onClick={@handle_click} className={'noselect'}>
            <Col sm=2 xs=3>
                <FileCheckbox
                    name         = {@props.name}
                    checked      = {@props.checked}
                    current_path = {@props.current_path}
                    actions      = {@props.actions}
                    style        = {verticalAlign:'sub'} />
                {@render_public_directory_info()}
            </Col>
            <Col sm=1 xs=3>
                <a style={color : if @props.mask then '#bbbbbb'}>
                    <Icon name='folder-open-o' style={fontSize:'14pt',verticalAlign:'sub'} />
                    <Icon name='caret-right' style={marginLeft:'3px',fontSize:'14pt',verticalAlign:'sub'} />
                </a>
            </Col>
            <Col sm=4 smPush=5 xs=6>
                {@render_time()}
                {#size (not applicable for directories)}
            </Col>
            <Col sm=5 smPull=4 xs=12 style={directory_styles}>
                {@render_name_link()}
            </Col>
        </Row>

NoFiles = rclass
    propTypes :
        actions     : rtypes.object.isRequired
        public_view : rtypes.bool

    displayName : 'ProjectFiles-NoFiles'

    render_new_button : ->
        <Button
            style   = {fontSize:'40px', color:'#888'}
            onClick = {=>@props.actions.set_focused_page('project-new-file')}>
            <Icon name='plus-circle' /> Create or upload files...
        </Button>

    render : ->
        <div style={textAlign:'center', color:'#888', marginTop:'20px'} >
            <span style={fontSize:'20px'}>
                No Files
            </span>
            <hr/>
            {@render_new_button() if not @props.public_view}
        </div>

pager_range = (page_size, page_number) ->
    start_index = page_size*page_number
    return {start_index: start_index, end_index: start_index + page_size}

FileListing = rclass
    displayName : 'ProjectFiles-FileListing'

    propTypes :
        listing       : rtypes.array.isRequired
        file_map      : rtypes.object.isRequired
        checked_files : rtypes.object
        current_path  : rtypes.string
        page_number   : rtypes.number
        page_size     : rtypes.number
        public_view   : rtypes.bool
        actions       : rtypes.object.isRequired

    render_row : (name, size, time, mask, isdir, display_name, public_data, index) ->
        checked = @props.checked_files.has(misc.path_to_file(@props.current_path, name))
        is_public = @props.file_map[name].is_public
        if checked
            if index % 2 == 0
                color = 'rgb(250, 250, 209)'
            else
                color = 'rgb(255, 255, 220)'
        else if index % 2 == 0
            color = '#eee'
        else
            color = 'white'
        if isdir
            return <DirectoryRow
                name         = {name}
                display_name = {display_name}
                time         = {time}
                key          = {index}
                color        = {color}
                mask         = {mask}
                public_data  = {public_data}
                is_public    = {is_public}
                checked      = {checked}
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
                public_data  = {public_data}
                is_public    = {is_public}
                checked      = {checked}
                key          = {index}
                current_path = {@props.current_path}
                actions      = {@props.actions} />

    handle_parent : (e) ->
        e.preventDefault()
        path = misc.path_split(@props.current_path).head
        @props.actions.set_current_path(path)
        @props.actions.set_url_to_path(path)

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
                <Col sm=1 smOffset=1>
                    <a><Icon name='reply' style={fontSize:'14pt'} /></a>
                </Col>
                <Col sm=4 style={styles}>
                    <a href=''>Parent Directory</a>
                </Col>
            </Row>

    render_rows : ->
        (@render_row(a.name, a.size, a.mtime, a.mask, a.isdir, a.display_name, a.public, i) for a, i in @props.listing)

    render_no_files : ->
        if @props.listing.length is 0
            <NoFiles current_path={@props.current_path} actions={@props.actions} public_view={@props.public_view}/>

    render : ->
        <Col sm=12>
            {@parent_directory()}
            {@render_rows()}
            {@render_no_files()}
        </Col>

EmptyTrash = rclass
    displayName : 'ProjectFiles-EmptyTrash'

    propTypes :
        actions : rtypes.object.isRequired

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
            <Space/><Space/><Space/>
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
            v.push <span key={2 * i + 1}><Space/> / <Space/></span>
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
        public_view  : rtypes.bool
        actions      : rtypes.object.isRequired

    handle_refresh : (e) ->
        e.preventDefault()
        @props.actions.set_directory_files(@props.current_path, @props.sort_by_time, @props.show_hidden)

    handle_sort_method : (e) ->
        e.preventDefault()
        @props.actions.setState(sort_by_time : not @props.sort_by_time)
        @props.actions.set_directory_files(@props.current_path, not @props.sort_by_time, @props.show_hidden)

    handle_hidden_toggle : (e) ->
        e.preventDefault()
        @props.actions.setState(show_hidden : not @props.show_hidden)
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
        if @props.public_view
            return
        <a href='' onClick={(e)=>e.preventDefault(); @props.actions.open_directory('.trash')}>
            <Icon name='trash' />  </a>

    render_backup : ->
        if @props.public_view
            return
        <a href='' onClick={(e)=>e.preventDefault(); @props.actions.open_directory('.snapshots')}>
            <Icon name='life-saver' /> <span style={fontSize: 14} className='hidden-sm'>Backups</span> </a>

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
        public_view   : rtypes.bool.isRequired
        current_path  : rtypes.string
        actions       : rtypes.object.isRequired

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
        @props.actions.set_all_files_unchecked()
        if @state.select_entire_directory isnt 'hidden'
            @setState(select_entire_directory : 'hidden')

    check_all_click_handler : ->
        if @props.checked_files.size == 0
            files_on_page = @props.listing[@props.page_size * @props.page_number...@props.page_size * (@props.page_number + 1)]
            @props.actions.set_file_list_checked(misc.path_to_file(@props.current_path, file.name) for file in files_on_page)

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
        @props.actions.set_file_list_checked(misc.path_to_file(@props.current_path, file.name) for file in @props.listing)

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
            <div style={color:'#999',height:'22px'}>
                <span>{"#{total} #{misc.plural(total, 'item')}"}</span>
            </div>
        else
            <div style={color:'#999',height:'22px'}>
                <span>{"#{checked} of #{total} #{misc.plural(total, 'item')} selected"}</span>
                <Space/>
                {@render_select_entire_directory()}
            </div>

    render_action_button : (name) ->
        obj = file_action_buttons[name]
        <Button
            onClick={=>@props.actions.set_file_action(name)}
            key={name} >
            <Icon name={obj.icon} /> <span className='hidden-sm'>{obj.name}...</span>
        </Button>

    render_action_buttons : ->
        if @props.checked_files.size is 0
            return

        else if @props.checked_files.size is 1
            item = @props.checked_files.first()
            for file in @props.listing
                if misc.path_to_file(@props.current_path, file.name) is item
                    isdir = file.isdir

            if isdir
                # one directory selected
                action_buttons = [
                    'download'
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
                'download'
                'compress'
                'delete'
                'move'
                'copy'
            ]
        if @props.public_view
            action_buttons = [
                'copy',
                'download'
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
        public_view   : rtypes.bool
        file_map      : rtypes.object.isRequired
        redux         : rtypes.object
        actions       : rtypes.object.isRequired

    getInitialState : ->
        copy_destination_directory  : ''
        copy_destination_project_id : if @props.public_view then '' else @props.project_id
        move_destination            : ''
        new_name                    : misc.path_split(@props.checked_files?.first()).tail
        show_different_project      : @props.public_view

    pre_styles :
        marginBottom    : '15px'
        maxHeight       : '80px'
        minHeight       : '34px'
        fontSize        : '14px'
        fontFamily      : 'inherit'
        color           : '#555'
        backgroundColor : '#eee'
        padding         : '6px 12px'

    cancel_action : ->
        @props.actions.set_file_action()

    render_selected_files_list : ->
        <pre style={@pre_styles}>
            {<div key={name}>{misc.path_split(name).tail}</div> for name in @props.checked_files.toArray()}
        </pre>

    compress_click : ->
        destination = @refs.result_archive.getValue()
        @props.actions.zip_files
            src  : @props.checked_files.toArray()
            dest : misc.path_to_file(@props.current_path, destination)
        @props.actions.set_all_files_unchecked()
        @props.actions.set_file_action()

    render_compress : ->
        size = @props.checked_files.size
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
                        defaultValue = {account.default_filename('zip')}
                        placeholder  = 'Result archive...' />
                </Col>
            </Row>
            <Row>
                <Col sm=12>
                    <ButtonToolbar>
                        <Button bsStyle='warning' onClick={@compress_click}>
                            <Icon name='compress' /> Compress {size} {misc.plural(size, 'item')}
                        </Button>
                        <Button onClick={@cancel_action}>
                            Cancel
                        </Button>
                    </ButtonToolbar>
                </Col>
            </Row>
        </div>

    delete_click : ->
        @props.actions.trash_files
            src : @props.checked_files.toArray()
        @props.actions.set_file_action()
        @props.actions.set_all_files_unchecked()


    render_delete_warning : ->
        if @props.current_path is '.trash'
            <Col sm=5>
                <Alert bsStyle='danger'>
                    <h4><Icon name='exclamation-triangle' /> Notice</h4>
                    <p>Your files have already been moved to the trash.</p>
                </Alert>
            </Col>

    render_delete : ->
        size = @props.checked_files.size
        <div>
            <Row>
                <Col sm=5 style={color:'#666'}>
                    <h4>Move to the trash</h4>
                    {@render_selected_files_list()}
                </Col>
                {@render_delete_warning()}
            </Row>
            <Row>
                <Col sm=12>
                    <ButtonToolbar>
                        <Button bsStyle='danger' onClick={@delete_click} disabled={@props.current_path is '.trash'}>
                            <Icon name='trash-o' /> Delete {size} {misc.plural(size, 'item')}
                        </Button>
                        <Button onClick={@cancel_action}>
                            Cancel
                        </Button>
                    </ButtonToolbar>
                </Col>
            </Row>
        </div>

    rename_click : ->
        rename_dir = misc.path_split(@props.checked_files?.first()).head
        destination = @refs.new_name.getValue()
        @props.actions.move_files
            src  : @props.checked_files.toArray()
            dest : misc.path_to_file(rename_dir, destination)
        @props.actions.set_file_action()
        @props.actions.set_all_files_unchecked()

    render_rename_warning : ->
        initial_ext = misc.filename_extension(@props.checked_files.first())
        current_ext = misc.filename_extension(@state.new_name)
        if initial_ext isnt current_ext
            if initial_ext is ''
                message = "Are you sure you want to add the extension #{current_ext}?"
            else if current_ext is ''
                message = "Are you sure you want to remove the extension #{initial_ext}?"
            else
                message = "Are you sure you want to change the file extension from #{initial_ext} to #{current_ext}?"

            <Alert bsStyle='warning' style={wordWrap:'break-word'}>
                <h4><Icon name='exclamation-triangle' /> Warning</h4>
                <p>{message}</p>
                <p>This may cause your file to no longer open properly.</p>
            </Alert>

    valid_rename_input : (single_item) ->
        if @state.new_name.length > 250 or misc.contains(@state.new_name, '/')
            return false
        return @state.new_name.trim() isnt misc.path_split(single_item).tail

    render_rename : ->
        single_item = @props.checked_files.first()
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
                        defaultValue = {misc.path_split(single_item).tail}
                        placeholder  = 'New file name...'
                        onChange     = {=>@setState(new_name : @refs.new_name.getValue())} />
                    {@render_rename_warning()}
                </Col>
            </Row>
            <Row>
                <Col sm=12>
                    <ButtonToolbar>
                        <Button bsStyle='info' onClick={@rename_click} disabled={not @valid_rename_input(single_item)}>
                            <Icon name='pencil' /> Rename file
                        </Button>
                        <Button onClick={@cancel_action}>
                            Cancel
                        </Button>
                    </ButtonToolbar>
                </Col>
            </Row>
        </div>

    move_click : ->
        @props.actions.move_files
            src  : @props.checked_files.toArray()
            dest : @state.move_destination
        @props.actions.set_file_action()
        @props.actions.set_all_files_unchecked()

    valid_move_input : ->
        dest = @state.move_destination.trim()
        if misc.contains(dest, '//') or misc.startswith(dest, '/')
            return false
        if dest.charAt(dest.length - 1) is '/'
            dest = dest[0...dest.length - 1]
        return dest isnt @props.current_path

    render_move : ->
        size = @props.checked_files.size
        <div>
            <Row>
                <Col sm=5 style={color:'#666'}>
                    <h4>Move to a folder</h4>
                    {@render_selected_files_list()}
                </Col>
                <Col sm=5 style={color:'#666',marginBottom:'15px'}>
                    <h4>Destination</h4>
                    <DirectoryInput
                        on_change     = {(value)=>@setState(move_destination:value)}
                        key           = 'move_destination'
                        default_value = ''
                        placeholder   = 'Home directory'
                        redux         = {@props.redux}
                        project_id    = {@props.project_id} />
                </Col>
            </Row>
            <Row>
                <Col sm=12>
                    <ButtonToolbar>
                        <Button bsStyle='warning' onClick={@move_click} disabled={not @valid_move_input()}>
                            <Icon name='arrows' /> Move {size} {misc.plural(size, 'item')}
                        </Button>
                        <Button onClick={@cancel_action}>
                            Cancel
                        </Button>
                    </ButtonToolbar>
                </Col>
            </Row>
        </div>

    render_different_project_dialog : ->
        if @state.show_different_project
            data = @props.redux.getStore('projects').get_project_select_list(@props.project_id)
            if not data?
                return <Loading />
            <Col sm=4 style={color:'#666',marginBottom:'15px'}>
                <h4>In the project</h4>
                <Combobox
                    valueField   = 'id'
                    textField    = 'title'
                    data         = {data}
                    filter       = 'contains'
                    defaultValue = {if not @props.public_view then @props.project_id}
                    placeholder  = 'Select a project...'
                    onSelect     = {(value) => @setState(copy_destination_project_id : value.id)}
                    messages     = {emptyFilter : '', emptyList : ''} />
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

    different_project_button : ->
        <Button
            bsSize  = 'large'
            onClick = {=>@setState(show_different_project : true)}
            style   = {padding:'0px 5px'}
        >
            a different project
        </Button>

    copy_click : ->
        destination_directory  = @state.copy_destination_directory
        destination_project_id = @state.copy_destination_project_id
        overwrite_newer        = @refs.overwrite_newer_checkbox?.getChecked()
        delete_extra_files     = @refs.delete_extra_files_checkbox?.getChecked()
        paths = @props.checked_files.toArray()
        if destination_project_id? and @props.project_id isnt destination_project_id
            @props.actions.copy_paths_between_projects
                public            : @props.public_view
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

    valid_copy_input : ->
        input = @state.copy_destination_directory
        if @state.copy_destination_project_id is ''
            return false
        if input is @props.current_directory
            return false
        if misc.startswith(input, '/') # TODO: make this smarter
            return false
        return true

    render_copy : ->
        size = @props.checked_files.size
        signed_in = @props.redux.getStore('account').get_user_type() == 'signed_in'
        if @props.public_view and not signed_in
            <div>
                <LoginLink />
                <Row>
                    <Col sm=12>
                        <ButtonToolbar>
                            <Button bsStyle='primary' disabled={true}>
                                <Icon name='files-o' /> Copy {size} {misc.plural(size, 'item')}
                            </Button>
                            <Button onClick={@cancel_action}>
                                Cancel
                            </Button>
                        </ButtonToolbar>
                    </Col>
                </Row>
            </div>
        else
            <div>
                <Row>
                    <Col sm={if @state.show_different_project then 4 else 5} style={color:'#666'}>
                        <h4>
                            Copy to a folder or {if @state.show_different_project then 'project' else @different_project_button()}
                        </h4>
                        {@render_selected_files_list()}
                    </Col>
                    {@render_different_project_dialog()}
                    <Col sm={if @state.show_different_project then 4 else 5} style={color:'#666'}>
                        <h4 style={{height:'25px'} if not @state.show_different_project}>Destination</h4>
                        <DirectoryInput
                            on_change     = {(value)=>@setState(copy_destination_directory:value)}
                            key           = 'copy_destination_directory'
                            placeholder   = 'Home directory'
                            default_value = ''
                            redux         = {@props.redux}
                            project_id    = {@state.copy_destination_project_id} />
                    </Col>
                </Row>
                <Row>
                    <Col sm=12>
                        <ButtonToolbar>
                            <Button bsStyle='primary' onClick={@copy_click} disabled={not @valid_copy_input()}>
                                <Icon name='files-o' /> Copy {size} {misc.plural(size, 'item')}
                            </Button>
                            <Button onClick={@cancel_action}>
                                Cancel
                            </Button>
                        </ButtonToolbar>
                    </Col>
                </Row>
            </div>

    share_click : ->
        description = @refs.share_description.getValue()
        @props.actions.set_public_path(@props.checked_files.first(), description)
        @props.actions.set_file_action()

    stop_sharing_click : ->
        @props.actions.disable_public_path(@props.checked_files.first())
        @props.actions.set_file_action()

    render_share_warning : ->
        <Alert bsStyle='warning' style={wordWrap:'break-word'}>
            <h4><Icon name='exclamation-triangle' /> Notice!</h4>
            <p>This file is in a public folder.</p>
            <p>In order to stop sharing it, you must stop sharing the parent.</p>
        </Alert>

    render_public_share_url : (single_item) ->
        url = document.URL
        url = url[0...url.indexOf('/projects/')]
        display_url = "#{url}/projects/#{@props.project_id}/files/#{misc.encode_path(single_item)}"
        if @props.file_map[misc.path_split(single_item).tail]?.isdir
            display_url += '/'
        <pre style={@pre_styles}>
            <a href={display_url} target='_blank'>
                {display_url}
            </a>
        </pre>

    render_share : ->
        # currently only works for a single selected file

        single_file = @props.checked_files.first()
        single_file_data = @props.file_map[misc.path_split(single_file).tail]
        if not single_file_data?
            console.warn("BUG: render_share -- please report")
        else
            if single_file_data.is_public and single_file_data.public?.path isnt single_file
                parent_is_public = true
        <div>
            <Row>
                <Col sm=4 style={color:'#666'}>
                    <h4>Share publicly</h4>
                    {@render_selected_files_list()}
                </Col>
                <Col sm=4 style={color:'#666'}>
                    <h4>Description of share (optional)</h4>
                    <Input
                        ref          = 'share_description'
                        key          = 'share_description'
                        type         = 'text'
                        defaultValue = {single_file_data.public?.description ? ''}
                        disabled     = {parent_is_public}
                        placeholder  = 'Description...' />
                    {@render_share_warning() if parent_is_public}
                </Col>
                <Col sm=4 style={color:'#666'}>
                    <h4>Public access link</h4>
                    {@render_public_share_url(single_file)}
                </Col>
            </Row>
            <Row>
                <Col sm=12>
                    <ButtonToolbar>
                        <Button bsStyle='primary' onClick={@share_click} disabled={parent_is_public}>
                            <Icon name='share-square-o' /><Space/>
                            {if single_file_data.is_public then 'Change description' else 'Make item public'}
                        </Button>
                        <Button bsStyle='warning' onClick={@stop_sharing_click} disabled={not single_file_data.is_public or parent_is_public}>
                            <Icon name='shield' /> Stop sharing item publicly
                        </Button>
                        <Button onClick={@cancel_action}>
                            Cancel
                        </Button>
                    </ButtonToolbar>
                </Col>
            </Row>
        </div>

    download_click : ->
        @props.actions.download_file
            path : @props.checked_files.first()
        @props.actions.set_file_action()

    render_download_link : (single_item) ->
        url = document.URL
        url = url[0...url.indexOf('/projects/')]
        <pre style={@pre_styles}>
            <a href={"/#{@props.project_id}/raw/#{misc.encode_path(single_item)}"} target='_blank'>
                {"#{url}/#{@props.project_id}/raw/#{misc.encode_path(single_item)}"}
            </a>
        </pre>

    render_download_alert : ->
        <Alert bsStyle='info'>
            <h4><Icon name='exclamation-triangle' /> Notice</h4>
            <p>Download for multiple files and directories is not yet implemented.</p>
            <p>For now, create a zip archive or download files one at a time.</p>
            <p>This functionality is coming soon!</p>
        </Alert>

    render_download : ->
        single_item = @props.checked_files.first()
        if @props.checked_files.size isnt 1 or @props.file_map[misc.path_split(single_item).tail]?.isdir
            download_not_implemented_yet = true
        <div>
            <Row>
                <Col sm=5 style={color:'#666'}>
                    <h4>Download file to your computer</h4>
                    {@render_selected_files_list()}
                </Col>
                <Col sm=7 style={color:'#666'}>
                    <h4>Download link</h4>
                    {if download_not_implemented_yet then @render_download_alert() else @render_download_link(single_item)}
                </Col>
            </Row>
            <Row>
                <Col sm=12>
                    <ButtonToolbar>
                        <Button bsStyle='primary' onClick={@download_click} disabled={download_not_implemented_yet}>
                            <Icon name='cloud-download' /> Download
                        </Button>
                        <Button onClick={@cancel_action}>
                            Cancel
                        </Button>
                    </ButtonToolbar>
                </Col>
            </Row>
        </div>

    render_action_box : (action) ->
        @["render_#{action}"]?()  # calls the render_(action) function above for the given action

    render : ->
        action = @props.file_action
        action_button = file_action_buttons[action]
        if not action_button?
            return <div>Undefined action</div>
        if not @props.file_map?
            return <Loading />
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
        current_path  : rtypes.string
        actions       : rtypes.object.isRequired
        selected_file : rtypes.object   # if given, file selected by cursor, which we open on pressing enter

    getDefaultProps : ->
        file_search : ''

    render_warning : ->
        if @props.file_search?.length > 0
            <Alert style={wordWrap:'break-word'} bsStyle='warning'>
                Showing only files matching "{@props.file_search}"
            </Alert>

    open_selected_file: ->
        if not @props.selected_file?
            return
        new_path = misc.path_to_file(@props.current_path, @props.selected_file.name)
        if @props.selected_file
            if @props.selected_file.isdir
                @props.actions.set_current_path(new_path)
            else
                @props.actions.open_file(path: new_path)
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
        <MenuItem eventKey=i key={i} onSelect={=>@create_file(ext)}>
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
        @props.actions.setState(file_search : '', page_number: 0)

    create_folder : ->
        @props.actions.create_folder(@props.file_search, @props.current_path)

    render : ->
        # This div prevents the split button from line-breaking when the page is small
        <div style={width:'97px'}>
            <SplitButton id='new_file_dropdown' title={@file_dropdown_icon()} onClick={@handle_file_click} >
                {(@file_dropdown_item(i, ext) for i, ext of @new_file_button_types)}
                <MenuItem divider />
                <MenuItem eventKey='folder' key='folder' onSelect={@create_folder}>
                    <Icon name='folder' /> Folder
                </MenuItem>
            </SplitButton>
        </div>

error_style =
    marginRight : '1ex'
    whiteSpace  : 'pre-line'
    position    : 'absolute'
    zIndex      : 15
    right       : '5px'
    top         : '-43px'
    boxShadow   : '5px 5px 5px grey'

ProjectFiles = (name) -> rclass
    displayName : 'ProjectFiles'

    reduxProps :
        projects :
            project_map   : rtypes.immutable
        account :
            other_settings : rtypes.immutable
        "#{name}" :
            current_path  : rtypes.string
            activity      : rtypes.object
            page_number   : rtypes.number
            file_action   : rtypes.string
            file_search   : rtypes.string
            show_hidden   : rtypes.bool
            sort_by_time  : rtypes.bool
            error         : rtypes.string
            checked_files : rtypes.immutable

    propTypes :
        project_id    : rtypes.string
        redux         : rtypes.object
        actions       : rtypes.object.isRequired

    getDefaultProps : ->
        page_number : 0

    previous_page : ->
        if @props.page_number > 0
            @props.actions.setState(page_number : @props.page_number - 1)

    next_page : ->
        @props.actions.setState(page_number : @props.page_number + 1)

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

    render_files_action_box : (file_map, public_view) ->
        if not file_map?
            return
        <Col sm=12>
            <ProjectFilesActionBox
                file_action   = {@props.file_action}
                checked_files = {@props.checked_files}
                current_path  = {@props.current_path}
                project_id    = {@props.project_id}
                public_view   = {public_view}
                file_map      = {file_map}
                redux         = {@props.redux}
                actions       = {@props.actions} />
        </Col>

    render_files_actions : (listing, public_view) ->
        if listing.length > 0
            <ProjectFilesActions
                checked_files = {@props.checked_files}
                file_action   = {@props.file_action}
                page_number   = {@props.page_number}
                page_size     = {@file_listing_page_size()}
                public_view   = {public_view}
                current_path  = {@props.current_path}
                listing       = {listing}
                actions       = {@props.actions} />

    render_miniterm : ->
        <MiniTerminal
            current_path = {@props.current_path}
            project_id   = {@props.project_id}
            actions      = {@props.actions} />

    render_new_file : ->
        <Col sm=2>
            <ProjectFilesNew file_search={@props.file_search} current_path={@props.current_path} actions={@props.actions} />
        </Col>

    render_activity : ->
        <ActivityDisplay
            trunc    = 80
            activity = {underscore.values(@props.activity)}
            on_clear = {=>@props.actions.clear_all_activity()} />

    render_course_payment_required: () ->
        <Alert bsStyle='danger'>
            <h4 style={padding: '2em'}>
                <Icon name='exclamation-triangle'/> Error: You must <BillingPageLink text='pay the course fee'/> for this project.
            </h4>
        </Alert>

    render_course_payment_warning: (pay) ->
        <Alert bsStyle='warning'>
            <Icon name='exclamation-triangle'/> Warning: You will need to <BillingPageLink text='pay the course fee'/> for this project
            within <TimeAgo date={pay}/>.
        </Alert>

    render_deleted: ->
        if @props.project_map?.getIn([@props.project_id, 'deleted'])
            <DeletedProjectWarning/>

    render_error : ->
        if @props.error
            <ErrorDisplay
                error   = {@props.error}
                style   = {error_style}
                onClose = {=>@props.actions.setState(error:'')} />

    render_file_listing: (listing, file_map, error, project_state, public_view) ->
        if project_state? and project_state not in ['running', 'saving']
            return @render_project_state(project_state)

        if error
            switch error
                when 'no_dir'
                    if @props.current_path == '.trash'
                        e = <Alert bsStyle='success'>The trash is empty!</Alert>
                    else
                        e = <ErrorDisplay title="No such directory" error={"The path #{@props.current_path} does not exist."} />
                when 'not_a_dir'
                    e = <ErrorDisplay title="Not a directory" error={"#{@props.current_path} is not a directory."} />
                when 'not_running'
                    # This shouldn't happen, but due to maybe a slight race condition in the backend it can.
                    e = <ErrorDisplay title="Project still not running" error={"The project was not running when this directory listing was requested.  Please try again in a moment."} />
                when 'no_instance'
                    e = <ErrorDisplay title="Host down" error={"The host for this project is down, being rebooted, or is overloaded with users.   Free projects are hosted on Google Pre-empt instances, which are rebooted at least once per day and periodically become unavailable.   To increase the robustness of your projects, please become a paying customer (US $7/month) by entering your credit card in the Billing tab next to account settings, then move your projects to a members only server."} />
                else
                    e = <ErrorDisplay title="Directory listing error" error={error} />
            return <div>
                {e}
                <br />
                <Button onClick={=>@props.actions.set_directory_files(@props.current_path, @props.sort_by_time, @props.show_hidden)}>
                    <Icon name='refresh'/> Try again to get directory listing
                </Button>
            </div>
        else if listing?
            <FileListing
                listing       = {listing}
                page_size     = {@file_listing_page_size()}
                page_number   = {@props.page_number}
                file_map      = {file_map}
                checked_files = {@props.checked_files}
                current_path  = {@props.current_path}
                public_view   = {public_view}
                actions       = {@props.actions} />
        else
            <div style={fontSize:'40px', textAlign:'center', color:'#999999'} >
                <Loading />
            </div>

    render_project_state: (project_state) ->
        <div style={fontSize:'40px', textAlign:'center', color:'#999999'} >
            <ProjectState state={project_state} />
        </div>

    file_listing_page_size: ->
        return @props.other_settings?.get('page_size') ? 50

    render : ->
        if not @props.checked_files?  # hasn't loaded/initialized at all
            return <Loading />

        projects_store = @props.redux.getStore('projects')  # component depends on this so OK

        pay = projects_store.date_when_course_payment_required(@props.project_id)
        if pay? and pay <= new Date()
            return @render_course_payment_required()

        # TODO: public_view is *NOT* a function of the props of this component. This is bad, but we're
        # going to do this temporarily so we can make a release.
        public_view = projects_store.get_my_group(@props.project_id) == 'public'

        if not public_view
            project_state = @props.project_map?.getIn([@props.project_id, 'state', 'state'])

        {listing, error, file_map} = @props.redux.getProjectStore(@props.project_id)?.get_displayed_listing()

        file_listing_page_size= @file_listing_page_size()
        if listing?
            {start_index, end_index} = pager_range(file_listing_page_size, @props.page_number)
            visible_listing = listing[start_index...end_index]
        <div>
            {if pay? then @render_course_payment_warning(pay)}
            {@render_deleted()}
            {@render_error()}
            {@render_activity()}
            <Row>
                <Col sm=3>
                    <ProjectFilesSearch
                        key           = {@props.current_path}
                        file_search   = {@props.file_search}
                        actions       = {@props.actions}
                        current_path  = {@props.current_path}
                        selected_file = {visible_listing?[0]} />
                </Col>
                {@render_new_file() if not public_view}
                <Col sm={if public_view then 6 else 4}>
                    <ProjectFilesPath current_path={@props.current_path} actions={@props.actions} />
                </Col>
                <Col sm=3>
                    <ProjectFilesButtons
                        show_hidden  = {@props.show_hidden ? false}
                        sort_by_time = {@props.sort_by_time ? true}
                        current_path = {@props.current_path}
                        public_view  = {public_view}
                        actions      = {@props.actions} />
                </Col>
            </Row>
            <Row>
                <Col sm=8>
                    {@render_files_actions(listing, public_view) if listing?}
                </Col>
                <Col sm=4>
                    {@render_miniterm() if not public_view}
                </Col>
                {@render_files_action_box(file_map, public_view) if @props.checked_files.size > 0 and @props.file_action?}
            </Row>
            {@render_paging_buttons(Math.ceil(listing.length / file_listing_page_size)) if listing?}
            {@render_file_listing(visible_listing, file_map, error, project_state, public_view)}
            {@render_paging_buttons(Math.ceil(listing.length / file_listing_page_size)) if listing?}
        </div>

render = (project_id, redux) ->
    store   = redux.getProjectStore(project_id, redux)
    actions = redux.getProjectActions(project_id)
    C = ProjectFiles(store.name)
    <Redux redux={redux}>
        <C project_id={project_id} redux={redux} actions={actions}/>
    </Redux>

exports.render_new = (project_id, dom_node, redux) ->
    #console.log("mount")
    ReactDOM.render(render(project_id, redux), dom_node)

exports.mount = (project_id, dom_node, redux) ->
    #console.log("mount")
    ReactDOM.render(render(project_id, redux), dom_node)

exports.unmount = (dom_node) ->
    #console.log("unmount")
    ReactDOM.unmountComponentAtNode(dom_node)

