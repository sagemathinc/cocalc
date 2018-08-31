##############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2015 -- 2016, SageMath, Inc.
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

{React, ReactDOM, rtypes, rclass, redux, Redux, Fragment} = require('./app-framework')
{Col, Row, ButtonToolbar, ButtonGroup, MenuItem, Button, Well, FormControl, FormGroup, Radio,
ButtonToolbar, Popover, OverlayTrigger, SplitButton, MenuItem, Alert, Checkbox, Breadcrumb, Navbar} =  require('react-bootstrap')
misc = require('smc-util/misc')
{ActivityDisplay, DirectoryInput, Icon, ProjectState, COLORS,
SearchInput, TimeAgo, ErrorDisplay, Space, Tip, Loading, LoginLink, Footer, CourseProjectExtraHelp, CopyToClipBoard, VisibleMDLG} = require('./r_misc')
{SMC_Dropwrapper} = require('./smc-dropzone')
{FileTypeSelector, NewFileButton} = require('./project_new')
{SiteName} = require('./customize')
{file_actions} = require('./project_store')

STUDENT_COURSE_PRICE = require('smc-util/upgrade-spec').upgrades.subscription.student_course.price.month4

{BillingPageLink, BillingPageForCourseRedux, PayCourseFee}     = require('./billing')
{human_readable_size} = misc
{MiniTerminal}        = require('./project_miniterm')
{file_associations}   = require('./file-associations')
account               = require('./account')
immutable             = require('immutable')
underscore            = require('underscore')
{webapp_client}       = require('./webapp_client')
{AccountPage}         = require('./account_page')
{UsersViewing}        = require('./other-users')
{project_tasks}       = require('./project_tasks')

feature = require('./feature')

Combobox = require('react-widgets/lib/Combobox') # TODO: delete this when the combobox is in r_misc
TERM_MODE_CHAR = '/'

FileCheckbox = rclass
    displayName : 'ProjectFiles-FileCheckbox'

    propTypes :
        name         : rtypes.string
        checked      : rtypes.bool
        actions      : rtypes.object.isRequired
        current_path : rtypes.string
        style        : rtypes.object

    handle_click: (e) ->
        e.stopPropagation() # so we don't open the file
        full_name = misc.path_to_file(@props.current_path, @props.name)
        if e.shiftKey
            @props.actions.set_selected_file_range(full_name, not @props.checked)
        else
            @props.actions.set_file_checked(full_name, not @props.checked)

        @props.actions.set_most_recent_file_click(full_name)

    render: ->
        <span onClick={@handle_click} style={@props.style}>
            <Icon name={if @props.checked then 'check-square-o' else 'square-o'} fixedWidth style={fontSize:'14pt'}/>
        </span>

# TODO: Something should uniformly describe how sorted table headers work.
# 5/8/2017 We have 3 right now, Course students and assignments panel and this one.
ListingHeader = rclass
    propTypes:
        active_file_sort : rtypes.object    # {column_name : string, is_descending : bool}
        sort_by          : rtypes.func      # Invoked as `sort_by(string)

    render_sort_link: (column_name, display_name) ->
        <a href=''
            onClick={(e)=>e.preventDefault();@props.sort_by(column_name)}>
            {display_name}
            <Space/>
            {<Icon style={marginRight:'10px'}
                name={if @props.active_file_sort.is_descending then 'caret-up' else 'caret-down'}
            /> if @props.active_file_sort.column_name == column_name}
        </a>

    render: ->
        row_styles =
            cursor          : 'pointer'
            color           : '#666'
            backgroundColor : '#fafafa'
            border          : '1px solid #eee'
            borderRadius    : '4px'

        <Row style={row_styles}>
            <Col sm={2} xs={3}>
            </Col>
            <Col sm={1} xs={3}>
                {@render_sort_link("type", "Type")}
            </Col>
            <Col sm={4} smPush={5} xs={6}>
                {@render_sort_link("time", "Date Modified")}
                <span className='pull-right'>
                    {@render_sort_link("size", "Size")}
                </span>
            </Col>
            <Col sm={5} smPull={4} xs={12}>
                {@render_sort_link("name", "Name")}
            </Col>
        </Row>
PublicButton = ({on_click}) ->
    <span><Space/>
        <Button
            bsStyle = 'info'
            bsSize  = 'xsmall'
            onClick = {on_click}
        >
            <Icon name='bullhorn' /> <span className='hidden-xs'>Public</span>
        </Button>
    </span>

CopyButton = ({on_click}) ->
    <span><Space/>
        <Button
            bsStyle = 'info'
            bsSize  = 'xsmall'
            onClick = {on_click}
        >
            <Icon name='files-o' /> <span className='hidden-xs'>Copy</span>
        </Button>
    </span>

generate_click_for = (file_action_name, full_path, project_actions) =>
    (e) =>
        e.preventDefault()
        e.stopPropagation()
        unless file_actions[file_action_name].allows_multiple_files
            project_actions.set_all_files_unchecked()
        project_actions.set_file_checked(full_path, true)
        project_actions.set_file_action(file_action_name)

FileRow = rclass
    displayName : 'ProjectFiles-FileRow'

    propTypes :
        name         : rtypes.string.isRequired
        display_name : rtypes.string  # if given, will display this, and will show true filename in popover
        size         : rtypes.number.isRequired
        time         : rtypes.number
        checked      : rtypes.bool
        bordered     : rtypes.bool
        color        : rtypes.string
        mask         : rtypes.bool
        public_data  : rtypes.object
        is_public    : rtypes.bool
        current_path : rtypes.string
        actions      : rtypes.object.isRequired
        no_select    : rtypes.bool
        public_view  : rtypes.bool

    shouldComponentUpdate: (next) ->
        return @props.name  != next.name         or
        @props.display_name != next.display_name or
        @props.size         != next.size         or
        @props.time         != next.time         or
        @props.checked      != next.checked      or
        @props.mask         != next.mask         or
        @props.public_data  != next.public_data  or
        @props.current_path != next.current_path or
        @props.bordered     != next.bordered     or
        @props.no_select    != next.no_select    or
        @props.public_view  != next.public_view

    render_icon: ->
        # get the file_associations[ext] just like it is defined in the editor
        {file_options} = require('./editor')
        name           = file_options(@props.name)?.icon ? 'file'
        style          =
            color         : if @props.mask then '#bbbbbb'
            verticalAlign : 'sub'
        <a style={style}>
            <Icon name={name} style={fontSize:'14pt'} />
        </a>

    render_name_link: (styles, name, ext) ->
        <a style={styles}>
            <span style={fontWeight: if @props.mask then 'normal' else 'bold'}>{misc.trunc_middle(name,50)}</span>
            <span style={color: if not @props.mask then '#999'}>{if ext is '' then '' else ".#{ext}"}</span>
        </a>

    render_name: ->
        name = @props.display_name ? @props.name
        name_and_ext = misc.separate_file_extension(name)
        name = name_and_ext.name
        ext = name_and_ext.ext

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


    render_public_file_info: ->
        if @props.public_view
            <CopyButton
                on_click = {generate_click_for('copy', @full_path(), @props.actions)}
            />
        else if @props.is_public
            <PublicButton
                on_click = {generate_click_for('share', @full_path(), @props.actions)}
            />

    full_path: ->
        misc.path_to_file(@props.current_path, @props.name)

    handle_mouse_down: (e) ->
        @setState
            selection_at_last_mouse_down : window.getSelection().toString()

    handle_click: (e) ->
        if window.getSelection().toString() == @state.selection_at_last_mouse_down
            foreground = misc.should_open_in_foreground(e)
            @props.actions.open_file
                path       : @full_path()
                foreground : foreground
            if foreground
                @props.actions.set_file_search('')

    handle_download_click: (e) ->
        e.preventDefault()
        e.stopPropagation()
        @props.actions.download_file
            path : @full_path()
            log : true

    render_timestamp: ->
        try
            <TimeAgo date={(new Date(@props.time * 1000)).toISOString()} style={color:'#666'}/>
        catch
            <div style={color:'#666', display:'inline'}>Invalid Date Time</div>

    render_download_button: (url_href) ->
        <Button style   = {marginLeft: '1em', background:'transparent'}
                bsStyle = 'default'
                bsSize  = 'xsmall'
                href    = "#{url_href}"
                onClick = {@handle_download_click}>
            <Icon name='cloud-download' style={color: '#666'} />
        </Button>


    render: ->
        row_styles =
            cursor          : 'pointer'
            borderRadius    : '4px'
            backgroundColor : @props.color
            borderStyle     : 'solid'
            borderColor     : if @props.bordered then COLORS.BLUE_BG else @props.color

        # See https://github.com/sagemathinc/cocalc/issues/1020
        # support right-click → copy url for the download button
        url_href = project_tasks(@props.actions.project_id).url_href(@full_path())

        <Row
            style       = {row_styles}
            onMouseDown = {@handle_mouse_down}
            onClick     = {@handle_click}
            className   = {'noselect' if @props.no_select}
        >
            <Col sm={2} xs={3}>
                <FileCheckbox
                    name         = {@props.name}
                    checked      = {@props.checked}
                    current_path = {@props.current_path}
                    actions      = {@props.actions}
                    style        = {verticalAlign:'sub'} />
                {@render_public_file_info()}
            </Col>
            <Col sm={1} xs={3}>
                {@render_icon()}
            </Col>
            <Col sm={4} smPush={5} xs={6}>
                {@render_timestamp()}
                <span className='pull-right' style={color:'#666'}>
                    {human_readable_size(@props.size)}
                    {@render_download_button(url_href)}
                </span>
            </Col>
            <Col sm={5} smPull={4} xs={12}>
                {@render_name()}
            </Col>
        </Row>

DirectoryRow = rclass
    displayName : 'ProjectFiles-DirectoryRow'

    propTypes :
        name         : rtypes.string.isRequired
        display_name : rtypes.string  # if given, will display this, and will show true filename in popover
        checked      : rtypes.bool
        color        : rtypes.string
        bordered     : rtypes.bool
        time         : rtypes.number
        mask         : rtypes.bool
        public_data  : rtypes.object
        is_public    : rtypes.bool
        current_path : rtypes.string
        actions      : rtypes.object.isRequired
        no_select    : rtypes.bool
        public_view  : rtypes.bool

    shouldComponentUpdate: (next) ->
        return @props.name  != next.name         or
        @props.display_name != next.display_name or
        @props.checked      != next.checked      or
        @props.color        != next.color        or
        @props.bordered     != next.bordered     or
        @props.time         != next.time         or
        @props.mask         != next.mask         or
        @props.public_data  != next.public_data  or
        @props.is_public    != next.is_public    or
        @props.current_path != next.current_path or
        @props.no_select    != next.no_select    or
        @props.public_view  != next.public_view

    handle_mouse_down: (e) ->
        @setState
            selection_at_last_mouse_down : window.getSelection().toString()

    handle_click: (e) ->
        if window.getSelection().toString() == @state.selection_at_last_mouse_down
            @props.actions.open_directory(@full_path())
            @props.actions.set_file_search('')

    render_public_directory_info: ->
        if @props.public_view
            <CopyButton
                on_click = {generate_click_for('copy', @full_path(), @props.actions)}
            />
        else if @props.is_public
            <PublicButton
                on_click = {generate_click_for('share', @full_path(), @props.actions)}
            />

    full_path: ->
        misc.path_to_file(@props.current_path, @props.name)

    render_time: ->
        if @props.time?
            try
                <TimeAgo date={(new Date(@props.time * 1000)).toISOString()} style={color:'#666'} />
            catch
                <div style={color:'#666', display:'inline'}>Invalid Date Time</div>


    render_name_link: ->
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

    render: ->
        row_styles =
            cursor          : 'pointer'
            borderRadius    : '4px'
            backgroundColor : @props.color
            borderStyle     : 'solid'
            borderColor     : if @props.bordered then COLORS.BLUE_BG else @props.color

        directory_styles =
            fontWeight     : 'bold'
            whiteSpace     : 'pre-wrap'
            wordWrap       : 'break-word'
            overflowWrap   : 'break-word'
            verticalAlign  : 'sub'

        <Row
            style={row_styles}
            onMouseDown={@handle_mouse_down}
            onClick={@handle_click}
            className={'noselect' if @props.no_select}
        >
            <Col sm={2} xs={3}>
                <FileCheckbox
                    name         = {@props.name}
                    checked      = {@props.checked}
                    current_path = {@props.current_path}
                    actions      = {@props.actions}
                    style        = {verticalAlign:'sub'} />
                {@render_public_directory_info()}
            </Col>
            <Col sm={1} xs={3}>
                <a style={color : if @props.mask then '#bbbbbb'}>
                    <Icon name='folder-open-o' style={fontSize:'14pt',verticalAlign:'sub'} />
                    <Icon name='caret-right' style={marginLeft:'3px',fontSize:'14pt',verticalAlign:'sub'} />
                </a>
            </Col>
            <Col sm={4} smPush={5} xs={6}>
                {@render_time()}
            </Col>
            <Col sm={5} smPull={4} xs={12} style={directory_styles}>
                {@render_name_link()}
            </Col>
        </Row>

TerminalModeDisplay = rclass
    render: ->
        <Row style={textAlign:'left', color:'#888', marginTop:'5px', wordWrap:'break-word'} >
            <Col sm={2}>
            </Col>
            <Col sm={8}>
                <Alert style={marginTop: '5px', fontWeight : 'bold'} bsStyle='info'>
                    You are in <a target="_blank" href="https://github.com/sagemathinc/cocalc/wiki/File-Listing#terminal-mode">terminal mode</a>.
                </Alert>
            </Col>
            <Col sm={2}>
            </Col>
        </Row>

FirstSteps = rclass
    displayName : 'ProjectFiles-FirstSteps'

    propTypes :
        actions : rtypes.object.isRequired
        redux   : rtypes.object

    get_first_steps: ->
        @props.actions.copy_from_library(entry:'first_steps')

    dismiss_first_steps: ->
        @props.redux.getTable('account').set(other_settings:{first_steps:false})

    render: ->
        style =
            textAlign  : 'center'
            padding    : '10px'
            color      : COLORS.GRAY_L
            position   : 'absolute'
            bottom     : 0
            fontSize   : '110%'

        a =
            cursor     : 'pointer'
            color      : COLORS.GRAY

        line2 =
            fontSize   : '80%'

        <Col sm={12} style={style}>
            <Row>
                <span>
                    Are you new to <SiteName/>?
                </span>
                <Space/>
                <span>
                    <a onClick = {@get_first_steps} style={a}>
                        Click to start the <strong>First Steps</strong> guide!
                    </a>
                </span>
                <Space/>
                <span>or</span>
                <Space/>
                <span>
                    <a onClick={@dismiss_first_steps} style={a}>dismiss this message</a>.
                </span>
                <br/>
                <span style={line2}>
                    You can also load it via "+ Add" → "Library" → "First Steps in <SiteName />"
                </span>
            </Row>
        </Col>

NoFiles = rclass
    propTypes :
        actions       : rtypes.object.isRequired
        create_folder : rtypes.func.isRequired
        create_file   : rtypes.func.isRequired
        public_view   : rtypes.bool
        file_search   : rtypes.string
        current_path  : rtypes.string

    displayName : 'ProjectFiles-NoFiles'

    getDefaultProps: ->
        file_search : ''

    # Go to the new file tab if there is no file search
    handle_click: ->
        if @props.file_search.length == 0
            @props.actions.set_active_tab('new')
        else if @props.file_search[@props.file_search.length - 1] == '/'
            @props.create_folder()
        else
            @props.create_file()

    # Returns the full file_search text in addition to the default extension if applicable
    full_path_text: ->
        if @props.file_search.lastIndexOf('.') <= @props.file_search.lastIndexOf('/')
            ext = "sagews"
        if ext and @props.file_search.slice(-1) isnt '/'
            "#{@props.file_search}.#{ext}"
        else
            "#{@props.file_search}"

    # Text for the large create button
    button_text: ->
        if @props.file_search.length == 0
            "Create or Upload Files..."
        else
            "Create #{@full_path_text()}"

    render_create_button: ->
        <Button
            style   = {fontSize:'40px', color:'#888', maxWidth:'100%'}
            onClick = {=>@handle_click()} >
            <Icon name='plus-circle' /> {@button_text()}
        </Button>

    render_help_alert: ->
        last_folder_index = @props.file_search.lastIndexOf('/')
        if @props.file_search.indexOf('\\') != -1
            <Alert style={marginTop: '10px', fontWeight : 'bold'} bsStyle='danger'>
                Warning: \ is an illegal character
            </Alert>
        else if @props.file_search.indexOf('/') == 0
            <Alert style={marginTop: '10px', fontWeight : 'bold'} bsStyle='danger'>
                Warning: Names cannot begin with /
            </Alert>
        else if ['.', '..'].indexOf(@props.file_search) > -1
            <Alert style={marginTop: '10px', fontWeight : 'bold'} bsStyle='danger'>
                Warning: Cannot create a file named . or ..
            </Alert>
        # Non-empty search and there is a file divisor ('/')
        else if @props.file_search.length > 0 and last_folder_index > 0
            <Alert style={marginTop: '10px'} bsStyle='info'>
                {@render_help_text(last_folder_index)}
            </Alert>

    render_help_text: (last_folder_index) ->
        # Ends with a '/' ie. only folders
        if last_folder_index == @props.file_search.length - 1
            if last_folder_index isnt @props.file_search.indexOf('/')
                # More than one sub folder
                <div>
                    <span style={fontWeight:'bold'}>
                            {@props.file_search}
                        </span> will be created as a <span style={fontWeight:'bold'}>folder path</span> if non-existant
                </div>
            else
                # Only one folder
                <div>
                    Creates a <span style={fontWeight:'bold'}>folder</span> named <span style={fontWeight:'bold'}>
                        {@props.file_search}
                    </span>
                </div>
        else
            <div>
                <span style={fontWeight:'bold'}>
                    {@full_path_text().slice(last_folder_index + 1)}
                </span> will be created under the folder path <span style={fontWeight:'bold'}>
                    {@props.file_search.slice(0, last_folder_index + 1)}
                </span>
            </div>

    render_file_type_selection: ->
        <div>
            <h4 style={color:"#666"}>Or select a file type</h4>
            <FileTypeSelector create_file={@props.create_file} create_folder={@props.create_folder} >
                <Row>
                    <Col sm={12}>
                        <Tip title='Create a Chatroom'  placement='right'  icon='comment'
                            tip='Create a chatroom for chatting with other collaborators on this project.'>
                            <NewFileButton icon='comment' name='Chatroom' on_click={@props.create_file} ext='sage-chat' />
                        </Tip>
                    </Col>
                </Row>
            </FileTypeSelector>
        </div>

    render: ->
        <Row style={textAlign:'left', color:'#888', marginTop:'20px', wordWrap:'break-word'} >
            <Col sm={2}>
            </Col>
            <Col sm={8}>
                <span style={fontSize:'20px'}>
                    No files found
                </span>
                <hr/>
                {@render_create_button() if not @props.public_view}
                {@render_help_alert()}
                {@render_file_type_selection() if @props.file_search.length > 0}
            </Col>
            <Col sm={2}>
            </Col>
        </Row>

pager_range = (page_size, page_number) ->
    start_index = page_size*page_number
    return {start_index: start_index, end_index: start_index + page_size}

FileListing = rclass
    displayName: 'ProjectFiles-FileListing'

    propTypes:  # TODO: everything but actions/redux should be immutable JS data, and use shouldComponentUpdate
        actions                : rtypes.object.isRequired
        redux                  : rtypes.object

        active_file_sort       : rtypes.object
        listing                : rtypes.array.isRequired
        file_map               : rtypes.object.isRequired
        file_search            : rtypes.string
        checked_files          : rtypes.object
        current_path           : rtypes.string
        page_number            : rtypes.number
        page_size              : rtypes.number
        public_view            : rtypes.bool
        create_folder          : rtypes.func.isRequired   # TODO: should be action!
        create_file            : rtypes.func.isRequired   # TODO: should be action!
        selected_file_index    : rtypes.number
        project_id             : rtypes.string
        show_upload            : rtypes.bool
        shift_is_down          : rtypes.bool
        sort_by                : rtypes.func              # TODO: should be data
        library                : rtypes.object
        other_settings         : rtypes.immutable

    getDefaultProps: ->
        file_search           : ''
        show_upload           : false

    render_row: (name, size, time, mask, isdir, display_name, public_data, index) ->
        checked = @props.checked_files.has(misc.path_to_file(@props.current_path, name))
        is_public = @props.file_map[name].is_public
        if checked
            if index % 2 == 0
                color = '#a3d4ff'
            else
                color = '#a3d4f0'
        else if index % 2 == 0
            color = '#eee'
        else
            color = 'white'
        apply_border = index == @props.selected_file_index and @props.file_search[0] isnt TERM_MODE_CHAR
        if isdir
            return <DirectoryRow
                name         = {name}
                display_name = {display_name}
                time         = {time}
                key          = {index}
                color        = {color}
                bordered     = {apply_border}
                mask         = {mask}
                public_data  = {public_data}
                is_public    = {is_public}
                checked      = {checked}
                current_path = {@props.current_path}
                actions      = {@props.actions}
                no_select    = {@props.shift_is_down}
                public_view  = {@props.public_view}
            />
        else
            return <FileRow
                name         = {name}
                display_name = {display_name}
                time         = {time}
                size         = {size}
                color        = {color}
                bordered     = {apply_border}
                mask         = {mask}
                public_data  = {public_data}
                is_public    = {is_public}
                checked      = {checked}
                key          = {index}
                current_path = {@props.current_path}
                actions      = {@props.actions}
                no_select    = {@props.shift_is_down}
                public_view  = {@props.public_view}
            />

    render_rows: ->
        (@render_row(a.name, a.size, a.mtime, a.mask, a.isdir, a.display_name, a.public, i) for a, i in @props.listing)

    render_no_files: ->
        if @props.listing.length is 0 and @props.file_search[0] isnt TERM_MODE_CHAR
            <NoFiles
                current_path  = {@props.current_path}
                actions       = {@props.actions}
                public_view   = {@props.public_view}
                file_search   = {@props.file_search}
                create_folder = {@props.create_folder}
                create_file   = {@props.create_file} />

    render_first_steps: ->
        return  # See https://github.com/sagemathinc/cocalc/issues/3138
        name = 'first_steps'
        return if @props.public_view
        return if not @props.library[name]
        return if not (@props.other_settings?.get(name) ? false)
        return if @props.current_path isnt '' # only show in $HOME
        return if @props.file_map[name]?.isdir  # don't show if we have it ...
        return if @props.file_search[0] is TERM_MODE_CHAR

        <FirstSteps
            actions         = {@props.actions}
            redux           = {@props.redux} />

    render_terminal_mode: ->
        if @props.file_search[0] == TERM_MODE_CHAR
            <TerminalModeDisplay/>

    render : ->
        <Fragment>
            <Col sm={12} style={zIndex:1}>
                {@render_terminal_mode() if not @props.public_view}
                {<ListingHeader
                    active_file_sort = {@props.active_file_sort}
                    sort_by          = {@props.sort_by}
                    check_all        = {false}
                    /> if @props.listing.length > 0}
                {@render_rows()}
                {@render_no_files()}
            </Col>
            <VisibleMDLG>
                {@render_first_steps()}
            </VisibleMDLG>
        </Fragment>

# One segment of the directory links at the top of the files listing.
PathSegmentLink = rclass
    displayName : 'ProjectFiles-PathSegmentLink'

    propTypes :
        path       : rtypes.string
        display    : rtypes.oneOfType([rtypes.string, rtypes.object])
        actions    : rtypes.object.isRequired
        full_name  : rtypes.string
        history    : rtypes.bool
        active     : rtypes.bool

    getDefaultProps: ->
        active     : false

    handle_click: ->
        @props.actions.open_directory(@props.path)

    render_content: ->
        if @props.full_name and @props.full_name isnt @props.display
            <Tip tip={@props.full_name} placement='bottom' title='Full name'>
                {@props.display}
            </Tip>
        else
            return @props.display

    style: ->
        if @props.history
            return {color: '#c0c0c0'}
        else if @props.active
            return {color: COLORS.BS_BLUE_BGRND}
        {}

    render: ->
        <Breadcrumb.Item
            onClick    = {@handle_click}
            active     = {@props.active}
            style      = {@style()} >
                {@render_content()}
        </Breadcrumb.Item>

# This path consists of several PathSegmentLinks
ProjectFilesPath = rclass
    displayName : 'ProjectFiles-ProjectFilesPath'

    propTypes :
        current_path : rtypes.string
        history_path : rtypes.string
        actions      : rtypes.object.isRequired

    make_path: ->
        v = []
        v.push <PathSegmentLink path='' display={<Icon name='home' />} key={0} actions={@props.actions} />
        path = @props.current_path
        history_path = @props.history_path
        root = path[0] == '/'
        if @props.current_path == ''
            path_segments = []
        else
            path_segments = path.split('/')
        history_segments = history_path.split('/')
        for segment, i in history_segments
            if root and i == 0
                continue
            is_current = i == path_segments.length - 1
            is_history = i >= path_segments.length
            v.push <PathSegmentLink
                    path      = {history_segments[..i].join('/')}
                    display   = {misc.trunc_middle(segment, 15)}
                    full_name = {segment}
                    key       = {i+1}
                    actions   = {@props.actions}
                    active    = {is_current}
                    history   = {is_history} />
        return v

    render: ->
        <Breadcrumb bsSize='small' style={marginBottom: '0'}>
            {@make_path()}
        </Breadcrumb>

ProjectFilesButtons = rclass
    displayName : 'ProjectFiles-ProjectFilesButtons'

    propTypes :
        show_hidden  : rtypes.bool
        public_view  : rtypes.bool
        actions      : rtypes.object.isRequired

    handle_refresh: (e) ->
        e.preventDefault()
        @props.actions.fetch_directory_listing()

    handle_hidden_toggle: (e) ->
        e.preventDefault()
        @props.actions.setState(show_hidden : not @props.show_hidden)

    handle_backup: (e) ->
        e.preventDefault()
        @props.actions.open_directory('.snapshots')

    render_refresh: ->
        <Button bsSize='small' onClick={@handle_refresh}>
            <Icon name='refresh' />
        </Button>

    render_hidden_toggle: ->
        icon = if @props.show_hidden then 'eye' else 'eye-slash'
        <Button bsSize='small' onClick={@handle_hidden_toggle}>
            <Icon name={icon} />
        </Button>

    render_backup: ->
        if @props.public_view or not require('./customize').commercial
            return
        # NOTE -- snapshots aren't available except in commercial version -- they are complicated nontrivial thing that isn't usually setup...
        <Button bsSize='small' onClick={@handle_backup}>
            <Icon name='life-saver' /> <span style={fontSize: 12} className='hidden-sm'>Backups</span>
        </Button>

    render: ->
        <ButtonToolbar style={whiteSpace:'nowrap', padding: '0'} className='pull-right'>
            <ButtonGroup bsSize='small'>
                <Button bsSize='small' className="upload-button">
                    <Icon name='upload' /> Upload
                </Button>
            </ButtonGroup>
            <ButtonGroup bsSize='small' className='pull-right'>
                {@render_refresh()}
                {@render_hidden_toggle()}
                {@render_backup()}
            </ButtonGroup>
        </ButtonToolbar>

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

    getInitialState: ->
        select_entire_directory : 'hidden' # hidden -> check -> clear

    componentWillReceiveProps: (nextProps) ->
        if @props.current_path isnt nextProps.current_path
            # user changed directory, hide the "select entire directory" button
            if @state.select_entire_directory isnt 'hidden'
                @setState(select_entire_directory : 'hidden')

        else if nextProps.checked_files.size is nextProps.listing.length and @state.select_entire_directory is 'check'
            # user just clicked the "select entire directory" button, show the "clear" button
            @setState(select_entire_directory : 'clear')

    clear_selection: ->
        @props.actions.set_all_files_unchecked()
        if @state.select_entire_directory isnt 'hidden'
            @setState(select_entire_directory : 'hidden')

    check_all_click_handler: ->
        if @props.checked_files.size == 0
            files_on_page = @props.listing[(@props.page_size * @props.page_number)...(@props.page_size * (@props.page_number + 1))]
            @props.actions.set_file_list_checked(misc.path_to_file(@props.current_path, file.name) for file in files_on_page)
            if @props.listing.length > @props.page_size
                # if there are more items than one page, show a button to select everything
                @setState(select_entire_directory : 'check')
        else
            @clear_selection()

    render_check_all_button: ->
        if @props.checked_files.size is 0
            button_icon = 'square-o'
            button_text = 'Check All'
        else
            button_text = 'Uncheck All'

            if @props.checked_files.size >= @props.listing.length
                button_icon = 'check-square-o'
            else
                button_icon = 'minus-square-o'

        <Button bsSize='small' onClick={@check_all_click_handler} >
            <Icon name={button_icon} /> {button_text}
        </Button>

    select_entire_directory: ->
        @props.actions.set_file_list_checked(misc.path_to_file(@props.current_path, file.name) for file in @props.listing)

    render_select_entire_directory: ->
        switch @state.select_entire_directory
            when 'check'
                <Button bsSize='xsmall' onClick={@select_entire_directory}>
                    Select All {@props.listing.length} Items
                </Button>
            when 'clear'
                <Button bsSize='xsmall' onClick={@clear_selection}>
                    Clear Entire Selection
                </Button>

    render_currently_selected: ->
        checked = @props.checked_files?.size ? 0
        total = @props.listing.length
        style =
            color      : '#999'
            height     : '22px'
            margin     : '3px 20px'

        if checked is 0
            <div style={style}>
                <span>{"#{total} #{misc.plural(total, 'item')}"}</span>
                <div style={fontWeight:'200', display:'inline'}> -- Check an entry below to see options.</div>
            </div>
        else
            <div style={style}>
                <span>{"#{checked} of #{total} #{misc.plural(total, 'item')} selected"}</span>
                <Space/>
                {@render_select_entire_directory()}
            </div>

    render_action_button: (name) ->
        disabled = (name in ["move","compress","rename","delete","share","duplicate"] and @props.current_path?.startsWith(".snapshots"))
        obj = file_actions[name]
        get_basename = =>
            misc.path_split(@props.checked_files?.first()).tail
        <Button
            onClick={=>@props.actions.set_file_action(name, get_basename)}
            disabled={disabled}
            key={name} >
            <Icon name={obj.icon} /> <span className='hidden-sm'>{obj.name}...</span>
        </Button>

    render_action_buttons: ->
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
                    'duplicate'
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
                    'duplicate'
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

    render: ->
        <Row>
            <Col sm={12}>
                <ButtonToolbar>
                    <ButtonGroup>
                        {@render_check_all_button()}
                    </ButtonGroup>
                    {@render_action_buttons()}
                </ButtonToolbar>
            </Col>
            <Col sm={12}>
                {@render_currently_selected()}
            </Col>
        </Row>

WIKI_SHARE_HELP_URL = 'https://github.com/sagemathinc/cocalc/wiki/share'

ProjectFilesActionBox = rclass
    displayName : 'ProjectFiles-ProjectFilesActionBox'

    propTypes :
        checked_files     : rtypes.object
        file_action       : rtypes.string
        current_path      : rtypes.string.isRequired
        project_id        : rtypes.string.isRequired
        public_view       : rtypes.bool
        file_map          : rtypes.object.isRequired
        actions           : rtypes.object.isRequired
        displayed_listing : rtypes.object

    reduxProps :
        projects :
            get_project_select_list : rtypes.func
            # get_total_project_quotas relys on this data
            # Will be removed by #1084
            project_map                       : rtypes.immutable.Map
            get_total_project_quotas          : rtypes.func

        account :
            get_user_type : rtypes.func
        customize :
            site_name : rtypes.string

    getInitialState: ->
        copy_destination_directory  : ''
        copy_destination_project_id : if @props.public_view then '' else @props.project_id
        move_destination            : ''
        new_name                    : @props.new_name
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

    cancel_action: ->
        @props.actions.set_file_action()

    action_key: (e) ->
        switch e.keyCode
            when 27
                @cancel_action()
            when 13
                @["submit_action_#{@props.file_action}"]?()

    render_selected_files_list: ->
        <pre style={@pre_styles}>
            {<div key={name}>{misc.path_split(name).tail}</div> for name in @props.checked_files.toArray()}
        </pre>

    compress_click: ->
        destination = ReactDOM.findDOMNode(@refs.result_archive).value
        @props.actions.zip_files
            src  : @props.checked_files.toArray()
            dest : misc.path_to_file(@props.current_path, destination)
        @props.actions.set_all_files_unchecked()
        @props.actions.set_file_action()

    render_compress: ->
        size = @props.checked_files.size
        <div>
            <Row>
                <Col sm={5} style={color:'#666'}>
                    <h4>Create a zip file</h4>
                    {@render_selected_files_list()}
                </Col>

                <Col sm={5} style={color:'#666'}>
                    <h4>Result archive</h4>
                    <FormGroup>
                        <FormControl
                            autoFocus    = {true}
                            ref          = 'result_archive'
                            key          = 'result_archive'
                            type         = 'text'
                            defaultValue = {account.default_filename('zip')}
                            placeholder  = 'Result archive...'
                            onKeyDown    = {@action_key}
                        />
                    </FormGroup>
                </Col>
            </Row>
            <Row>
                <Col sm={12}>
                    <ButtonToolbar>
                        <Button bsStyle='warning' onClick={@compress_click}>
                            <Icon name='compress' /> Compress {size} {misc.plural(size, 'Item')}
                        </Button>
                        <Button onClick={@cancel_action}>
                            Cancel
                        </Button>
                    </ButtonToolbar>
                </Col>
            </Row>
        </div>

    submit_action_compress: () ->
        @compress_click()

    delete_click: ->
        @props.actions.delete_files
            paths : @props.checked_files.toArray()
        @props.actions.set_file_action()
        @props.actions.set_all_files_unchecked()
        @props.actions.fetch_directory_listing()


    render_delete_warning: ->
        if @props.current_path is '.trash'
            <Col sm={5}>
                <Alert bsStyle='danger'>
                    <h4><Icon name='exclamation-triangle' /> Notice</h4>
                    <p>Your files have already been moved to the trash.</p>
                </Alert>
            </Col>

    render_delete: ->
        size = @props.checked_files.size
        <div>
            <Row>
                <Col sm={5} style={color:'#666'}>
                    {@render_selected_files_list()}
                </Col>
                {@render_delete_warning()}
            </Row>
            <Row style={marginBottom:'10px'}>
                <Col sm={12}>
                    Deleting a file immediately deletes it from disk freeing up space; however, older
                    backups of your files may still be available in
                    the <a href='' onClick={(e)=>e.preventDefault(); @props.actions.open_directory('.snapshots')}>~/.snapshots</a> directory.
                </Col>
            </Row>
            <Row>
                <Col sm={12}>
                    <ButtonToolbar>
                        <Button bsStyle='danger' onClick={@delete_click} disabled={@props.current_path is '.trash'}>
                            <Icon name='trash-o' /> Delete {size} {misc.plural(size, 'Item')}
                        </Button>
                        <Button onClick={@cancel_action}>
                            Cancel
                        </Button>
                    </ButtonToolbar>
                </Col>
            </Row>
        </div>

    rename_or_duplicate_click: ->
        rename_dir = misc.path_split(@props.checked_files?.first()).head
        destination = ReactDOM.findDOMNode(@refs.new_name).value
        switch @props.file_action
            when 'rename'
                @props.actions.move_files
                    src            : @props.checked_files.toArray()
                    dest           : misc.path_to_file(rename_dir, destination)
                    dest_is_folder : false
                    include_chats  : true
            when 'duplicate'
                @props.actions.copy_paths
                    src           : @props.checked_files.toArray()
                    dest          : misc.path_to_file(rename_dir, destination)
                    only_contents : true
        @props.actions.set_file_action()
        @props.actions.set_all_files_unchecked()

    render_rename_warning: ->
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

    valid_rename_input: (single_item) ->
        if @state.new_name.length > 250 or misc.contains(@state.new_name, '/')
            return false
        return @state.new_name.trim() isnt misc.path_split(single_item).tail

    render_rename_or_duplicate: () ->
        single_item = @props.checked_files.first()
        switch @props.file_action
            when 'rename'
                action_title = 'Rename'
                first_heading = 'Change the name'
            when 'duplicate'
                action_title = 'Duplicate'
                first_heading = 'File to duplicate'
        <div>
            <Row>
                <Col sm={5} style={color:'#666'}>
                    <h4>{first_heading}</h4>
                    {@render_selected_files_list()}
                </Col>
                <Col sm={5} style={color:'#666'}>
                    <h4>New name</h4>
                    <FormGroup>
                        <FormControl
                            autoFocus    = {true}
                            ref          = 'new_name'
                            key          = 'new_name'
                            type         = 'text'
                            defaultValue = {@state.new_name}
                            placeholder  = 'New file name...'
                            onChange     = {=>@setState(new_name : ReactDOM.findDOMNode(@refs.new_name).value)}
                            onKeyDown    = {@action_key}
                        />
                    </FormGroup>
                    {@render_rename_warning()}
                </Col>
            </Row>
            <Row>
                <Col sm={12}>
                    <ButtonToolbar>
                        <Button bsStyle='info' onClick={=>@rename_or_duplicate_click()} disabled={not @valid_rename_input(single_item)}>
                            <Icon name='pencil' /> {action_title} Item
                        </Button>
                        <Button onClick={@cancel_action}>
                            Cancel
                        </Button>
                    </ButtonToolbar>
                </Col>
            </Row>
        </div>

    render_rename: ->
        @render_rename_or_duplicate()

    render_duplicate: ->
        @render_rename_or_duplicate()

    submit_action_rename: ->
        single_item = @props.checked_files.first()
        if @valid_rename_input(single_item)
            @rename_or_duplicate_click()

    # Make submit_action_duplicate an alias for submit_action_rename, due to how our
    # dynamically generated function calls work.
    submit_action_duplicate: ->
        @submit_action_rename()

    move_click: ->
        @props.actions.move_files
            src            : @props.checked_files.toArray()
            dest           : @state.move_destination
            dest_is_folder : true
            include_chats  : true
        @props.actions.set_file_action()
        @props.actions.set_all_files_unchecked()

    valid_move_input: ->
        src_path = misc.path_split(@props.checked_files.first()).head
        dest = @state.move_destination.trim()
        if dest == src_path
            return false
        if misc.contains(dest, '//') or misc.startswith(dest, '/')
            return false
        if dest.charAt(dest.length - 1) is '/'
            dest = dest[0...dest.length - 1]
        return dest isnt @props.current_path

    render_move: ->
        size = @props.checked_files.size
        <div>
            <Row>
                <Col sm={5} style={color:'#666'}>
                    <h4>Move to a folder</h4>
                    {@render_selected_files_list()}
                </Col>
                <Col sm={5} style={color:'#666',marginBottom:'15px'}>
                    <h4>Destination</h4>
                    <DirectoryInput
                        autoFocus     = {true}
                        on_change     = {(value) => @setState(move_destination:value)}
                        key           = 'move_destination'
                        default_value = ''
                        placeholder   = 'Home directory'
                        project_id    = {@props.project_id}
                        on_key_up     = {@action_key}
                        exclusions    = {@props.checked_files.toArray()}
                    />
                </Col>
            </Row>
            <Row>
                <Col sm={12}>
                    <ButtonToolbar>
                        <Button bsStyle='warning' onClick={@move_click} disabled={not @valid_move_input()}>
                            <Icon name='arrows' /> Move {size} {misc.plural(size, 'Item')}
                        </Button>
                        <Button onClick={@cancel_action}>
                            Cancel
                        </Button>
                    </ButtonToolbar>
                </Col>
            </Row>
        </div>

    submit_action_move: () ->
        if @valid_move_input()
            @move_click()

    render_different_project_dialog: ->
        if @state.show_different_project
            data = @props.get_project_select_list(@props.project_id)
            if not data?
                return <Loading />
            <Col sm={4} style={color:'#666',marginBottom:'15px'}>
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

    render_copy_different_project_options: ->
        if @props.project_id isnt @state.copy_destination_project_id
            <div>
                <Checkbox
                    ref = 'delete_extra_files_checkbox'
                    onChange = {(e)=>@setState('delete_extra_files': e.target.checked)}>
                    Delete extra files in target directory
                </Checkbox>
                <Checkbox
                    ref = 'overwrite_newer_checkbox'
                    onChange = {(e)=>@setState('overwrite_newer': e.target.checked)}>
                    Overwrite newer versions of files
                </Checkbox>
            </div>

    different_project_button: ->
        <Button
            bsSize  = 'large'
            onClick = {=>@setState(show_different_project : true)}
            style   = {padding:'0px 5px'}
        >
            A Different Project
        </Button>

    copy_click: ->
        destination_directory  = @state.copy_destination_directory
        destination_project_id = @state.copy_destination_project_id
        overwrite_newer        = @state.overwrite_newer
        delete_extra_files     = @state.delete_extra_files
        paths                  = @props.checked_files.toArray()
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
            @props.actions.copy_paths
                src  : paths
                dest : destination_directory
        @props.actions.set_file_action()

    valid_copy_input: ->
        src_path = misc.path_split(@props.checked_files.first()).head
        input = @state.copy_destination_directory
        if input == src_path and @props.project_id == @state.copy_destination_project_id
            return false
        if @state.copy_destination_project_id is ''
            return false
        if input is @props.current_directory
            return false
        if misc.startswith(input, '/')
            return false
        return true

    render_copy: ->
        size = @props.checked_files.size
        signed_in = @props.get_user_type() == 'signed_in'
        if @props.public_view and not signed_in
            <div>
                <LoginLink />
                <Row>
                    <Col sm={12}>
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
                            autoFocus     = {true}
                            on_change     = {(value)=>@setState(copy_destination_directory:value)}
                            key           = 'copy_destination_directory'
                            placeholder   = 'Home directory'
                            default_value = ''
                            project_id    = {@state.copy_destination_project_id}
                            on_key_up     = {@action_key}
                        />
                    </Col>
                </Row>
                <Row>
                    <Col sm={12}>
                        <ButtonToolbar>
                            <Button bsStyle='primary' onClick={@copy_click} disabled={not @valid_copy_input()}>
                                <Icon name='files-o' /> Copy {size} {misc.plural(size, 'Item')}
                            </Button>
                            <Button onClick={@cancel_action}>
                                Cancel
                            </Button>
                        </ButtonToolbar>
                    </Col>
                </Row>
            </div>

    submit_action_copy: () ->
        if @valid_copy_input()
            @copy_click()

    share_click: ->
        description = ReactDOM.findDOMNode(@refs.share_description).value
        @props.actions.set_public_path(@props.checked_files.first(), {description: description})

    stop_sharing_click: ->
        @props.actions.disable_public_path(@props.checked_files.first())

    render_share_warning: ->
        <Alert bsStyle='warning' style={wordWrap:'break-word'}>
            <h4><Icon name='exclamation-triangle' /> Notice!</h4>
            <p>This file is in a public folder.</p>
            <p>In order to stop sharing it, you must stop sharing the parent.</p>
        </Alert>

    construct_public_share_url: (single_file) ->
        url = document.URL
        url = url[0...url.indexOf('/projects/')]
        display_url = "#{url}/share/#{@props.project_id}/#{misc.encode_path(single_file)}?viewer=share"
        if @props.file_map[misc.path_split(single_file).tail]?.isdir
            display_url += '/'
        return display_url

    render_public_link_header: (url, as_link) ->
        if as_link
            <h4><a href={url} target="_blank">Public link</a></h4>
        else
            <h4>Public link (not active)</h4>

    render_share_defn: ->
        <div style={color:'#555'}>
            <a href="https://github.com/sagemathinc/cocalc/wiki/share" target="_blank">Use sharing</a> to make a file or directory <a href="https://cocalc.com/share" target="_blank"><b><i>visible to the world.</i></b></a>   (If you would instead like to privately collaborate and chat with people in this project, go the project Settings tab and "Add people to project".)
        </div>

    set_public_file_unlisting_to: (new_value) ->
        description = ReactDOM.findDOMNode(@refs.share_description).value
        @props.actions.set_public_path(@props.checked_files.first(), {description : description, unlisted : new_value})

    render_unlisting_checkbox: (single_file_data) ->
        is_unlisted = !!(single_file_data.public?.unlisted)

        <form>
            <Checkbox
                checked  = {is_unlisted}
                onChange = {=>@set_public_file_unlisting_to(not is_unlisted)} >
                <i>Unlisted:</i> Only allow those with a link to view this.
            </Checkbox>
        </form>

    render_share_error: ->
        <Alert bsStyle={'danger'} style={padding:'30px', marginBottom:'30px'}>
            <h3>
                Publicly sharing files requires internet access
            </h3>
            <div style={fontSize:'12pt'}>
                You <b>must</b> first enable the 'Internet access' upgrade in project
                settings in order to publicly share files from this project.
            </div>
        </Alert>

    render_how_shared: (parent_is_public, single_file_data) ->
        if parent_is_public
            return
        <div>
            <br/>
            <div style={color:'#444', fontSize:'15pt'}>How this file or directory is shared</div>
            <br/>
            {@render_sharing_options(single_file_data)}
        </div>

    render_share: ->
        # currently only works for a single selected file
        single_file = @props.checked_files.first()
        single_file_data = @props.file_map[misc.path_split(single_file).tail]
        if not single_file_data?
            # directory listing not loaded yet... (will get re-rendered when loaded)
            return <Loading />
        else
            if single_file_data.is_public and single_file_data.public?.path isnt single_file
                parent_is_public = true
        show_social_media = require('./customize').commercial and single_file_data.is_public

        url = @construct_public_share_url(single_file)
        {open_new_tab} = require('smc-webapp/misc_page')
        button_before =
            <Button bsStyle='default' onClick={=>open_new_tab(url)}>
                <Icon name='external-link' />
            </Button>

        <div>
            <Row>
                <Col sm={8} style={color:'#666', fontSize:'12pt'}>
                    {@render_share_defn()}
                </Col>
            </Row>
            <Row>
                <Col sm={12} style={fontSize:'12pt'}>
                    {@render_how_shared(parent_is_public, single_file_data)}
                </Col>
            </Row>
            {if not single_file_data.is_public then undefined else <>
                <Row>
                    <Col sm={4} style={color:'#666'}>
                        <h4>Description</h4>
                        <FormGroup>
                            <FormControl
                                autoFocus     = {true}
                                ref          = 'share_description'
                                key          = 'share_description'
                                type         = 'text'
                                defaultValue = {single_file_data.public?.description ? ''}
                                disabled     = {parent_is_public}
                                placeholder  = 'Description...'
                                onKeyUp      = {@action_key}
                            />
                        </FormGroup>
                        {@render_share_warning() if parent_is_public}
                    </Col>
                    <Col sm={4} style={color:'#666'}>
                        <h4>Items</h4>
                        {@render_selected_files_list()}
                    </Col>
                    {<Col sm={4} style={color:'#666'}>
                        <h4>Shared publicly</h4>
                        <CopyToClipBoard
                            value         = {url}
                            button_before = {button_before}
                            hide_after    = {true}
                        />
                    </Col> if single_file_data.is_public}
                </Row>
                <Row>
                    <Col sm={12}>
                        <Button bsStyle='primary' onClick={@share_click} disabled={parent_is_public} style={marginBottom:"5px"}>
                            <Icon name='share-square-o' /> Update Description
                        </Button>
                    </Col>
                </Row>
            </>}
            <Row>
                <Col sm={12}>
                    <Button onClick={@cancel_action}>
                        Close
                    </Button>
                </Col>
            </Row>
        </div>

    handle_sharing_options_change: (single_file_data) -> (e) =>
        # The reason we need single_fie_data is because I think "set_public_path" does not
        # merge the "options", so you have to pass in the current description.
        state = e.target.value
        if state == "private"
            @props.actions.disable_public_path(@props.checked_files.first())
        else if state == "public_listed"
            # single_file_data.public is suppose to work in this state
            description = single_file_data.public?.description ? ''
            @props.actions.set_public_path(@props.checked_files.first(), {description: description, unlisted: false})
        else if state == "public_unlisted"
            description = single_file_data.public?.description ? ''
            @props.actions.set_public_path(@props.checked_files.first(), {description: description, unlisted: true})

    get_sharing_options_state: (single_file_data) ->
        if single_file_data.is_public and single_file_data.public?.unlisted
            return "public_unlisted"
        if single_file_data.is_public and not single_file_data.public?.unlisted
            return "public_listed"
        return "private"

    render_sharing_options: (single_file_data) ->
        state = @get_sharing_options_state(single_file_data)
        handler = @handle_sharing_options_change(single_file_data)
        <>
            <FormGroup>
            {if @props.get_total_project_quotas(@props.project_id)?.network then <Radio name="sharing_options" value="public_listed" checked={state == "public_listed"} onChange={handler} inline>
                    <Icon name='eye'/><Space/>
                    <i>Public (listed)</i> - This will appear on the <a href="https://cocalc.com/share" target="_blank">public share server</a>.
              </Radio> else <Radio disabled={true} name="sharing_options" value="public_listed" checked={state == "public_listed"} inline>
                    <Icon name='eye'/><Space/>
                    <del><i>Public (listed)</i> - This will appear on the <a href="https://cocalc.com/share" target="_blank">share server</a>.</del> Public (listed) is only available for projects with network enabled.
                </Radio>}
              <br/>
              <Radio name="sharing_options" value="public_unlisted" checked={state == "public_unlisted"} onChange={handler} inline>
                <Icon name='eye-slash'/><Space/>
                <i>Public (unlisted)</i> - Only people with the link can view this.
              </Radio>
              <br/>
              <Radio name="sharing_options" value="private" checked={state == "private"} onChange={handler} inline>
                <Icon name='lock'/><Space/>
                <i>Private</i> - Only collaborators on this project can view this.
              </Radio>
            </FormGroup>
        </>

    render_social_buttons: (single_file) ->
        # sort like in account settings
        btns =  # mapping ID to button title and icon name
            email    : ['Email', 'envelope']
            facebook : ['Facebook', 'facebook']
            google   : ['Google+', 'google-plus']
            twitter  : ['Twitter', 'twitter']
        strategies = redux.getStore('account').get('strategies')?.toArray() ? []
        _ = require('underscore')
        btn_keys = _.sortBy(_.keys(btns), (b) ->
            i = strategies.indexOf(b)
            return if i >= 0 then i else btns.length + 1
        )
        ret = []
        for b in btn_keys
            do (b) =>
                [title, icon] = btns[b]
                ret.push(<Button onClick={=>@share_social_network(b, single_file)} key={b}>
                    <Icon name={icon} /> {title}
                </Button>)
        return ret

    share_social_network: (where, single_file) ->
        {SITE_NAME, TWITTER_HANDLE} = require('smc-util/theme')
        file_url   = @construct_public_share_url(single_file)
        public_url = encodeURIComponent(file_url)
        filename   = misc.path_split(single_file).tail
        text       = encodeURIComponent("Check out #{filename}")
        site_name  = @props.site_name ? SITE_NAME
        switch where
            when 'facebook'
                # https://developers.facebook.com/docs/sharing/reference/share-dialog
                # 806558949398043 is the ID of "SageMathcloud"
                # TODO CoCalc
                url = """https://www.facebook.com/dialog/share?app_id=806558949398043&display=popup&
                href=#{public_url}&redirect_uri=https%3A%2F%2Ffacebook.com&quote=#{text}"""
            when 'twitter'
                # https://dev.twitter.com/web/tweet-button/web-intent
                url = "https://twitter.com/intent/tweet?text=#{text}&url=#{public_url}&via=#{TWITTER_HANDLE}"
            when 'google'
                url = "https://plus.google.com/share?url=#{public_url}"
            when 'email'
                url = """mailto:?to=&subject=#{filename} on #{site_name}&
                body=A file is shared with you: #{public_url}"""
        if url?
            {open_popup_window} = require('./misc_page')
            open_popup_window(url)
        else
            console.warn("Unknown social media channel '#{where}'")

    submit_action_share: () ->
        single_file = @props.checked_files.first()
        single_file_data = @props.file_map[misc.path_split(single_file).tail]
        if single_file_data?
            if not (single_file_data.is_public and single_file_data.public?.path isnt single_file)
                @share_click()

    download_single_click: ->
        @props.actions.download_file
            path : @props.checked_files.first()
            log : true
        @props.actions.set_file_action()

    download_multiple_click: ->
        destination = ReactDOM.findDOMNode(@refs.download_archive).value
        dest = misc.path_to_file(@props.current_path, destination)
        @props.actions.zip_files
            src  : @props.checked_files.toArray()
            dest : dest
            cb   : (err) =>
                if err
                    @props.actions.set_activity(id:misc.uuid(), error: err)
                    return
                @props.actions.download_file
                    path : dest
                    log  : true
                @props.actions.fetch_directory_listing()
        @props.actions.set_all_files_unchecked()
        @props.actions.set_file_action()

    render_download_single: (single_item) ->
        target = @props.actions.get_store().get_raw_link(single_item)
        <div>
            <h4>Download link</h4>
            <pre style={@pre_styles}>
                <a href={target} target='_blank'>{target}</a>
            </pre>
        </div>

    render_download_multiple: ->
        <div>
            <h4>Download as archive</h4>
            <FormGroup>
                <FormControl
                    autoFocus    = {true}
                    ref          = 'download_archive'
                    key          = 'download_archive'
                    type         = 'text'
                    defaultValue = {account.default_filename('zip')}
                    placeholder  = 'Result archive...'
                    onKeyDown    = {@action_key}
                />
            </FormGroup>
        </div>

    render_download: ->
        single_item = @props.checked_files.first()
        if @props.checked_files.size isnt 1 or @props.file_map[misc.path_split(single_item).tail]?.isdir
            download_multiple_files = true
        <div>
            <Row>
                <Col sm={5} style={color:'#666'}>
                    <h4>Download file(s) to your computer</h4>
                    {@render_selected_files_list()}
                </Col>
                <Col sm={7} style={color:'#666'}>
                    {if download_multiple_files then @render_download_multiple() else @render_download_single(single_item)}
                </Col>
            </Row>
            <Row>
                <Col sm={12}>
                    <ButtonToolbar>
                        <Button bsStyle='primary' onClick={if download_multiple_files then @download_multiple_click else @download_single_click}>
                            <Icon name='cloud-download' /> Download
                        </Button>
                        <Button onClick={@cancel_action}>
                            Cancel
                        </Button>
                    </ButtonToolbar>
                </Col>
            </Row>
        </div>

    render_action_box: (action) ->
        @["render_#{action}"]?()  # calls the render_(action) function above for the given action

    render: ->
        action = @props.file_action
        action_button = file_actions[action]
        if not action_button?
            return <div>Undefined action</div>
        if not @props.file_map?
            return <Loading />
        else
            <Well>
                <Row>
                    <Col sm={12} style={color: '#666', fontWeight: 'bold', fontSize: '15pt'}>
                        <Icon name={action_button.icon ? 'exclamation-circle'} /> {action_button.name}
                    </Col>
                    <Col sm={12}>
                        {@render_action_box(action)}
                    </Col>
                </Row>
            </Well>

# Commands such as CD throw a setState error.
# Search WARNING to find the line in this class.
ProjectFilesSearch = rclass
    displayName : 'ProjectFiles-ProjectFilesSearch'

    propTypes :
        project_id         : rtypes.string.isRequired  # Added by miniterm functionality
        file_search        : rtypes.string
        current_path       : rtypes.string
        actions            : rtypes.object.isRequired
        create_file        : rtypes.func.isRequired
        create_folder      : rtypes.func.isRequired
        selected_file      : rtypes.object   # if given, file selected by cursor, which we open on pressing enter
        selected_file_index: rtypes.number
        file_creation_error: rtypes.string
        num_files_displayed: rtypes.number
        public_view        : rtypes.bool.isRequired

    getDefaultProps: ->
        file_search : ''
        selected_file_index : 0
        num_files_displayed : 0

    getInitialState: ->  # Miniterm functionality
        stdout : undefined
        state  : 'edit'   # 'edit' --> 'run' --> 'edit'
        error  : undefined

    # Miniterm functionality
    execute_command: (command) ->
        @setState
            stdout : ''
            error  : ''
        input = command.trim()
        if not input
            return
        input0 = input + '\necho $HOME "`pwd`"'
        @setState(state:'run')

        @_id = (@_id ? 0) + 1
        id = @_id
        webapp_client.exec
            project_id : @props.project_id
            command    : input0
            timeout    : 10
            max_output : 100000
            bash       : true
            path       : @props.current_path
            err_on_exit: false
            cb         : (err, output) =>
                if @_id != id
                    # computation was cancelled -- ignore result.
                    return
                if err
                    @setState(error:JSON.stringify(err), state:'edit')
                else
                    if output.stdout
                        # Find the current path
                        # after the command is executed, and strip
                        # the output of "pwd" from the output:
                        s = output.stdout.trim()
                        i = s.lastIndexOf('\n')
                        if i == -1
                            output.stdout = ''
                        else
                            s = s.slice(i+1)
                            output.stdout = output.stdout.slice(0,i)
                        i = s.indexOf(' ')
                        full_path = s.slice(i+1)
                        if full_path.slice(0,i) == s.slice(0,i)
                            # only change if in project
                            path = s.slice(2*i+2)
                            @props.actions.open_directory(path)
                    if not output.stderr
                        # only log commands that worked...
                        @props.actions.log({event:'termInSearch', input:input})
                    # WARNING: RENDER ERROR. Move state to redux store
                    @setState(state:'edit', error:output.stderr, stdout:output.stdout)
                    if not output.stderr
                        @props.actions.set_file_search('')

    render_help_info: ->
        if @props.file_search.length > 0 and @props.num_files_displayed > 0 and @props.file_search[0] isnt TERM_MODE_CHAR
            firstFolderPosition = @props.file_search.indexOf('/')
            if @props.file_search == ' /'
                text = "Showing all folders in this directory"
            else if firstFolderPosition == @props.file_search.length - 1
                text = "Showing folders matching #{@props.file_search.slice(0, @props.file_search.length - 1)}"
            else
                text = "Showing files matching #{@props.file_search}"
            <Alert style={wordWrap:'break-word'} bsStyle='info'>
                {text}
            </Alert>

    render_file_creation_error: ->
        if @props.file_creation_error
            <Alert style={wordWrap:'break-word'} bsStyle='danger' onDismiss={@dismiss_alert}>
                {@props.file_creation_error}
            </Alert>

    # Miniterm functionality
    render_output: (x, style) ->
        if x
            <pre style={style}>
                <a onClick={(e)=>e.preventDefault(); @setState(stdout:'', error:'')}
                   href=''
                   style={right:'5px', top:'0px', color:'#666', fontSize:'14pt', position:'absolute'}>
                       <Icon name='times' />
                </a>
                {x}
            </pre>

    dismiss_alert: ->
        @props.actions.setState(file_creation_error : '')

    search_submit: (value, opts) ->
        if value[0] == TERM_MODE_CHAR and not @props.public_view
            command = value.slice(1, value.length)
            @execute_command(command)
        else if @props.selected_file
            new_path = misc.path_to_file(@props.current_path, @props.selected_file.name)
            opening_a_dir = @props.selected_file.isdir
            if opening_a_dir
                @props.actions.open_directory(new_path)
                @props.actions.setState(page_number: 0)
            else
                @props.actions.open_file
                    path: new_path
                    foreground : not opts.ctrl_down
            if opening_a_dir or not opts.ctrl_down
                @props.actions.set_file_search('')
                @props.actions.clear_selected_file_index()
        else if @props.file_search.length > 0
            if @props.file_search[@props.file_search.length - 1] == '/'
                @props.create_folder(not opts.ctrl_down)
            else
                @props.create_file(null, not opts.ctrl_down)
            @props.actions.clear_selected_file_index()

    on_up_press: ->
        if @props.selected_file_index > 0
            @props.actions.decrement_selected_file_index()

    on_down_press: ->
        if @props.selected_file_index < @props.num_files_displayed - 1
            @props.actions.increment_selected_file_index()

    on_change: (search, opts) ->
        @props.actions.zero_selected_file_index()
        @props.actions.set_file_search(search)

    on_clear: ->
        @props.actions.clear_selected_file_index()
        @setState(input: '', stdout:'', error:'')

    render: ->
        <span>
            <SearchInput
                autoFocus   = {not feature.IS_TOUCH}
                autoSelect  = {not feature.IS_TOUCH}
                placeholder = 'Filename'
                value       = {@props.file_search}
                on_change   = {@on_change}
                on_submit   = {@search_submit}
                on_up       = {@on_up_press}
                on_down     = {@on_down_press}
                on_clear    = {@on_clear}
            />
            {@render_file_creation_error()}
            {@render_help_info()}
            <div style={position:'absolute', zIndex:1, width:'95%', boxShadow: '0px 0px 7px #aaa'}>
                {@render_output(@state.error, {color:'darkred', margin:0})}
                {@render_output(@state.stdout, {margin:0})}
            </div>
        </span>

ProjectFilesNew = rclass
    displayName : 'ProjectFiles-ProjectFilesNew'

    propTypes :
        file_search   : rtypes.string.isRequired
        current_path  : rtypes.string
        actions       : rtypes.object.isRequired
        create_folder : rtypes.func.isRequired
        create_file   : rtypes.func.isRequired

    getDefaultProps: ->
        file_search : ''

    new_file_button_types : ['sagews', 'term', 'ipynb', 'tex', 'rnw', 'rtex', 'md', 'tasks', 'course', 'sage', 'py', 'sage-chat']

    file_dropdown_icon: ->
        <span style={whiteSpace: 'nowrap'}>
            <Icon name='plus-circle' /> Create
        </span>

    file_dropdown_item: (i, ext) ->
        {file_options} = require('./editor')
        data = file_options('x.' + ext)
        <MenuItem eventKey={i} key={i} onClick={=>@on_menu_item_clicked(ext)}>
            <Icon name={data.icon} /> <span style={textTransform:'capitalize'}>{data.name} </span> <span style={color:'#666'}>(.{ext})</span>
        </MenuItem>

    on_menu_item_clicked: (ext) ->
        if @props.file_search.length == 0
            # Tell state to render an error in file search
            @props.actions.setState(file_creation_error : "You must enter a filename above.")
        else
            @props.create_file(ext)

    # Go to new file tab if no file is specified
    on_create_button_clicked: ->
        if @props.file_search.length == 0
            @props.actions.set_active_tab('new')
        else if @props.file_search[@props.file_search.length - 1] == '/'
            @props.create_folder()
        else
            @props.create_file()

    render: ->
        <SplitButton id='new_file_dropdown'
            title={@file_dropdown_icon()}
            onClick={@on_create_button_clicked} >
                {(@file_dropdown_item(i, ext) for i, ext of @new_file_button_types)}
                <MenuItem divider />
                <MenuItem eventKey='folder' key='folder' onSelect={@props.create_folder}>
                    <Icon name='folder' /> Folder
                </MenuItem>
        </SplitButton>

error_style =
    marginRight : '1ex'
    whiteSpace  : 'pre-line'
    position    : 'absolute'
    zIndex      : 15
    right       : '5px'
    boxShadow   : '5px 5px 5px grey'

# TODO: change/rewrite ProjectFiles to not have any rtypes.objects and
# add a shouldComponentUpdate!!
exports.ProjectFiles = rclass ({name}) ->
    displayName : 'ProjectFiles'

    reduxProps :
        projects :
            project_map                       : rtypes.immutable.Map
            date_when_course_payment_required : rtypes.func
            get_my_group                      : rtypes.func
            get_total_project_quotas          : rtypes.func
        account :
            other_settings : rtypes.immutable.Map
            is_logged_in   : rtypes.bool
        billing :
            customer       : rtypes.object

        "#{name}" :
            active_file_sort      : rtypes.object
            current_path          : rtypes.string
            history_path          : rtypes.string
            activity              : rtypes.object
            page_number           : rtypes.number
            file_action           : rtypes.string
            file_search           : rtypes.string
            show_hidden           : rtypes.bool
            error                 : rtypes.string
            checked_files         : rtypes.immutable
            selected_file_index   : rtypes.number
            file_creation_error   : rtypes.string
            displayed_listing     : rtypes.object
            new_name              : rtypes.string
            library               : rtypes.object

    propTypes :
        project_id             : rtypes.string
        actions                : rtypes.object
        redux                  : rtypes.object

    getDefaultProps: ->
        page_number           : 0
        file_search           : ''
        new_name              : ''
        actions               : redux.getActions(name) # TODO: Do best practices way
        redux                 : redux

    getInitialState: ->
        show_pay      : false
        shift_is_down : false

    componentDidMount: ->
        @props.redux.getActions('billing')?.update_customer()
        $(window).on("keydown", @handle_files_key_down)
        $(window).on("keyup", @handle_files_key_up)

    componentWillUnmount: ->
        $(window).off("keydown", @handle_files_key_down)
        $(window).off("keyup", @handle_files_key_up)

    handle_files_key_down: (e) ->
        if e.key == "Shift"
            @setState(shift_is_down : true)

    handle_files_key_up: (e) ->
        if e.key == "Shift"
            @setState(shift_is_down : false)

    previous_page: ->
        if @props.page_number > 0
            @actions(name).setState(page_number : @props.page_number - 1)

    next_page: ->
        @actions(name).setState(page_number : @props.page_number + 1)

    create_file: (ext, switch_over=true) ->
        if not ext? and @props.file_search.lastIndexOf('.') <= @props.file_search.lastIndexOf('/')
            ext = "sagews"
        @actions(name).create_file
            name         : @props.file_search
            ext          : ext
            current_path : @props.current_path
            switch_over  : switch_over
        @props.actions.setState(file_search : '', page_number: 0)
        if not switch_over
            @props.actions.fetch_directory_listing()

    create_folder: (switch_over=true) ->
        @props.actions.create_folder
            name         : @props.file_search
            current_path : @props.current_path
            switch_over  : switch_over
        @props.actions.setState(file_search : '', page_number: 0)
        if not switch_over
            @props.actions.fetch_directory_listing()

    render_paging_buttons: (num_pages) ->
        if num_pages > 1
            <Row>
                <Col sm={4}>
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

    render_files_action_box: (file_map, public_view) ->
        if not file_map?
            return
        <Col sm={12}>
            <ProjectFilesActionBox
                file_action       = {@props.file_action}
                checked_files     = {@props.checked_files}
                current_path      = {@props.current_path}
                project_id        = {@props.project_id}
                public_view       = {public_view}
                file_map          = {file_map}
                new_name          = {@props.new_name}
                actions           = {@props.actions}
                displayed_listing = {@props.displayed_listing} />
        </Col>

    render_files_actions: (listing, public_view) ->
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

    render_miniterm: ->
        <MiniTerminal
            current_path = {@props.current_path}
            project_id   = {@props.project_id}
            actions      = {@props.actions} />

    render_new_file : ->
        <ProjectFilesNew
            file_search   = {@props.file_search}
            current_path  = {@props.current_path}
            actions       = {@props.actions}
            create_file   = {@create_file}
            create_folder = {@create_folder} />

    render_activity: ->
        <ActivityDisplay
            trunc    = {80}
            activity = {underscore.values(@props.activity)}
            on_clear = {=>@props.actions.clear_all_activity()} />

    render_pay: ->
        <PayCourseFee project_id={@props.project_id} redux={@props.redux} />

    render_upgrade_in_place: ->
        cards = @props.customer?.sources?.total_count ? 0
        <div style={marginTop: '10px'}>
            <BillingPageForCourseRedux redux={redux} />
            {@render_pay() if cards}
        </div>

    render_course_payment_required: () ->
        cards = @props.customer?.sources?.total_count ? 0
        <Alert bsStyle='danger'>
            <h4 style={padding: '2em'}>
                <Icon name='exclamation-triangle'/> Error: Your instructor requires that you pay the one-time ${STUDENT_COURSE_PRICE} course fee for this project.
                {<CourseProjectExtraHelp/> if cards}
            </h4>
            {@render_upgrade_in_place()}
        </Alert>

    render_course_payment_warning: (pay) ->
        if @state.show_pay
            link = <span>pay the one-time ${STUDENT_COURSE_PRICE} course fee</span>
        else
            link = <a style={cursor:'pointer'} onClick={=>@setState(show_pay: true)}>pay the one-time ${STUDENT_COURSE_PRICE} course fee</a>
        <Alert bsStyle={'warning'} style={fontSize:'12pt'}>
            <Icon name='exclamation-triangle'/> Warning: Your instructor requires that you {link} for this project
            within <TimeAgo date={pay}/>.
            {@render_upgrade_in_place() if @state.show_pay}
        </Alert>

    render_error: ->
        if @props.error
            <ErrorDisplay
                error   = {@props.error}
                style   = {error_style}
                onClose = {=>@props.actions.setState(error:'')} />

    render_access_error: ->
        public_view = @props.get_my_group(@props.project_id) == 'public'
        if public_view
            if @props.is_logged_in
                <ErrorDisplay style={maxWidth:'100%'} bsStyle="warning" title="Showing only public files" error={"You are viewing a project that you are not a collaborator on. To view non-public files or edit files in this project you need to ask a collaborator of the project to add you."} />
            else
                <div>
                    <ErrorDisplay style={maxWidth:'100%'}  bsStyle="warning" title="Showing only public files" error={"You are not logged in. To view non-public files or edit files in this project you will need to sign in. If you are not a collaborator then you need to ask a collaborator of the project to add you to access non public files."} />
                </div>
        else
            if @props.is_logged_in
                <ErrorDisplay title="Directory is not public" error={"You are trying to access a non public project that you are not a collaborator on. You need to ask a collaborator of the project to add you."} />
            else
                <div>
                    <ErrorDisplay title="Directory is not public" error={"You are not signed in. If you are collaborator on this project you need to sign in first. This project is not public."} />
                    <AccountPage />
                </div>

    render_file_listing: (listing, file_map, error, project_state, public_view) ->
        if project_state?.get('state') and project_state.get('state') not in ['running', 'saving']
            return @render_project_state(project_state)

        if error
            quotas = @props.get_total_project_quotas(@props.project_id)
            switch error
                when 'not_public'
                    e = @render_access_error()
                when 'no_dir'
                    e = <ErrorDisplay title="No such directory" error={"The path #{@props.current_path} does not exist."} />
                when 'not_a_dir'
                    e = <ErrorDisplay title="Not a directory" error={"#{@props.current_path} is not a directory."} />
                when 'not_running'
                    # This shouldn't happen, but due to maybe a slight race condition in the backend it can.
                    e = <ErrorDisplay title="Project still not running" error={"The project was not running when this directory listing was requested.  Please try again in a moment."} />
                else
                    if error == 'no_instance' or (require('./customize').commercial and quotas? and not quotas?.member_host)
                        # the second part of the or is to blame it on the free servers...
                        e = <ErrorDisplay title="Project unavailable" error={"This project seems to not be responding.   Free projects are hosted on massively overloaded computers, which are rebooted at least once per day and periodically become unavailable.   To increase the robustness of your projects, please become a paying customer (US $14/month) by entering your credit card in the Billing tab next to account settings, then move your projects to a members only server. \n\n#{error if not quotas?.member_host}"} />
                    else
                        e = <ErrorDisplay title="Directory listing error" error={error} />
            # TODO: the refresh button text is inconsistant
            return <div>
                {e}
                <br />
                <Button onClick={@update_current_listing}>
                    <Icon name='refresh'/> Try again to get directory listing
                </Button>
            </div>
        else if listing?
            <SMC_Dropwrapper
                project_id     = {@props.project_id}
                dest_path      = {@props.current_path}
                event_handlers = {complete : => @props.actions.fetch_directory_listing()}
                config         = {clickable : ".upload-button"}
                disabled       = {public_view}
            >
                <FileListing
                    active_file_sort       = {@props.active_file_sort}
                    listing                = {listing}
                    page_size              = {@file_listing_page_size()}
                    page_number            = {@props.page_number}
                    file_map               = {file_map}
                    file_search            = {@props.file_search}
                    checked_files          = {@props.checked_files}
                    current_path           = {@props.current_path}
                    public_view            = {public_view}
                    actions                = {@props.actions}
                    create_file            = {@create_file}
                    create_folder          = {@create_folder}
                    selected_file_index    = {@props.selected_file_index}
                    project_id             = {@props.project_id}
                    shift_is_down          = {@state.shift_is_down}
                    sort_by                = {@props.actions.set_sorted_file_column}
                    other_settings         = {@props.other_settings}
                    library                = {@props.library}
                    redux                  = {@props.redux}
                    event_handlers
                />
            </SMC_Dropwrapper>
        else
            @update_current_listing()
            <div style={fontSize:'40px', textAlign:'center', color:'#999999'} >
                <Loading />
            </div>

    update_current_listing: ->
        setTimeout(@props.actions.fetch_directory_listing, 0)

    start_project: ->
        @actions('projects').start_project(@props.project_id)

    render_start_project_button: (project_state) ->
        <Button
            disabled = {project_state?.get('state') not in ['opened', 'closed', 'archived']}
            bsStyle  = "primary"
            bsSize   = "large"
            onClick  = {@start_project} >
                <Icon name="flash"/> Start Project
        </Button>

    render_project_state: (project_state) ->
        <div style={fontSize:'40px', textAlign:'center', color:'#666666'} >
            <ProjectState state={project_state} show_desc={true} />
            <br/>
            {@render_start_project_button(project_state)}
        </div>

    file_listing_page_size: ->
        return @props.other_settings?.get('page_size') ? 50

    render: ->
        if not @props.checked_files?  # hasn't loaded/initialized at all
            return <Loading />

        pay = @props.date_when_course_payment_required(@props.project_id)
        if pay? and pay <= webapp_client.server_time()
            return @render_course_payment_required()

        public_view = @props.get_my_group(@props.project_id) == 'public'

        if not public_view
            project_state = @props.project_map?.getIn([@props.project_id, 'state'])

        {listing, error, file_map} = @props.displayed_listing

        file_listing_page_size= @file_listing_page_size()
        if listing?
            {start_index, end_index} = pager_range(file_listing_page_size, @props.page_number)
            visible_listing = listing[start_index...end_index]

        <div style={padding:'5px'}>
            {if pay? then @render_course_payment_warning(pay)}
            {@render_error()}
            {@render_activity()}
            <div style={display: 'flex', flexFlow: 'row wrap', justifyContent: 'space-between', alignItems: 'stretch'}>
                <div style={flex: '1 0 25%', marginRight: '10px', minWidth: '20em'}>
                    <ProjectFilesSearch
                        project_id          = {@props.project_id}
                        key                 = {@props.current_path}
                        file_search         = {@props.file_search}
                        actions             = {@props.actions}
                        current_path        = {@props.current_path}
                        selected_file       = {visible_listing?[@props.selected_file_index ? 0]}
                        selected_file_index = {@props.selected_file_index}
                        file_creation_error = {@props.file_creation_error}
                        num_files_displayed = {visible_listing?.length}
                        create_file         = {@create_file}
                        create_folder       = {@create_folder}
                        public_view         = {public_view} />
                </div>
                {<div
                    style={flex: '0 1 auto', marginRight: '10px', marginBottom:'15px'}
                    className='cc-project-files-create-dropdown' >
                        {@render_new_file()}
                </div> if not public_view}
                <div
                    className = 'cc-project-files-path'
                    style={flex: '5 1 auto', marginRight: '10px', marginBottom:'15px'}>
                    <ProjectFilesPath
                        current_path = {@props.current_path}
                        history_path = {@props.history_path}
                        actions      = {@props.actions} />
                </div>
                {<div style={flex: '0 1 auto', marginRight: '10px', marginBottom:'15px'}>
                    <UsersViewing project_id={@props.project_id} />
                </div> if not public_view}
                {<div style={flex: '1 0 auto', marginBottom:'15px'}>
                    <ProjectFilesButtons
                        show_hidden  = {@props.show_hidden ? false}
                        current_path = {@props.current_path}
                        public_view  = {public_view}
                        actions      = {@props.actions} />
                </div> if not public_view}
            </div>
            <Row>
                <Col sm={8}>
                    {@render_files_actions(listing, public_view) if listing?}
                </Col>
                <Col sm={4}>
                    {@render_miniterm() if not public_view}
                </Col>
                {@render_files_action_box(file_map, public_view) if @props.checked_files.size > 0 and @props.file_action?}
            </Row>
            {### Only show the access error if there is not another error. ###}
            {@render_access_error() if public_view and not error}
            {@render_file_listing(visible_listing, file_map, error, project_state, public_view)}
            {@render_paging_buttons(Math.ceil(listing.length / file_listing_page_size)) if listing?}
        </div>
