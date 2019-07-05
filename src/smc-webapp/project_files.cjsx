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
{Col, Row, ButtonToolbar, ButtonGroup, MenuItem, Button, Well, Form, FormControl, ControlLabel, FormGroup, Radio,
ButtonToolbar, Popover, OverlayTrigger, SplitButton, MenuItem, Alert, Checkbox, Breadcrumb, Navbar} =  require('react-bootstrap')
misc = require('smc-util/misc')
misc2 = require('smc-util/misc2')
{ActivityDisplay, DirectoryInput, Icon, ProjectState, COLORS,
SearchInput, TimeAgo, ErrorDisplay, Space, Tip, Loading, LoginLink, Footer, CourseProjectExtraHelp, CopyToClipBoard, VisibleMDLG, VisibleLG, HiddenSM, CloseX2} = require('./r_misc')
{SMC_Dropwrapper} = require('./smc-dropzone')
{NewFileButton, ProjectNewForm} = require('./project_new')
{SiteName} = require('./customize')
{file_actions} = require('./project_store')
{Library} = require('./library')
{ProjectSettingsPanel} = require('./project/project-settings-support')
{analytics_event} = require('./tracker')
{compute_image2name, compute_image2basename, CUSTOM_IMG_PREFIX} = require('./custom-software/util')
{ default_ext, EXTs} = require('./project/file-listing/utils')
ALL_FILE_BUTTON_TYPES = EXTs

STUDENT_COURSE_PRICE = require('smc-util/upgrade-spec').upgrades.subscription.student_course.price.month4

{BillingPageLink, BillingPageForCourseRedux, PayCourseFee}     = require('./billing')
{MiniTerminal, output_style_searchbox}  = require('./project_miniterm')
{file_associations}   = require('./file-associations')
account               = require('./account')
immutable             = require('immutable')
underscore            = require('underscore')
{webapp_client}       = require('./webapp_client')
{AccountPage}         = require('./account_page')
{UsersViewing}        = require('./other-users')
{project_tasks}       = require('./project_tasks')
{CustomSoftwareInfo}  = require('./custom-software/info-bar')
{CustomSoftwareReset} = require('./custom-software/reset-bar')

ConfigureShare = require('./share/config/config').Configure

ROW_INFO_STYLE = Object.freeze
    color      : COLORS.GRAY
    height     : '22px'
    margin     : '5px 3px'

{FileListing, TERM_MODE_CHAR} = require("./project/file-listing")

feature = require('./feature')
{AskNewFilename}      = require('./project/ask-filename')

Combobox = require('react-widgets/lib/Combobox') # TODO: delete this when the combobox is in r_misc

pager_range = (page_size, page_number) ->
    start_index = page_size*page_number
    return {start_index: start_index, end_index: start_index + page_size}


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
        kucalc             : rtypes.string
        show_hidden        : rtypes.bool
        show_masked        : rtypes.bool
        public_view        : rtypes.bool
        show_new           : rtypes.bool
        show_library       : rtypes.bool
        available_features : rtypes.object
        actions            : rtypes.object.isRequired

    handle_refresh: (e) ->
        e.preventDefault()
        @props.actions.fetch_directory_listing()

    handle_hidden_toggle: (e) ->
        e.preventDefault()
        @props.actions.setState(show_hidden : not @props.show_hidden)

    handle_masked_toggle: (e) ->
        e.preventDefault()
        @props.actions.setState(show_masked : not @props.show_masked)

    handle_backup: (e) ->
        e.preventDefault()
        @props.actions.open_directory('.snapshots')

    render_refresh: ->
        <Button bsSize='small' cocalc-test='files-refresh' onClick={@handle_refresh}>
            <Icon name='refresh' />
        </Button>

    render_hidden_toggle: ->
        icon = if @props.show_hidden then 'eye' else 'eye-slash'
        <Button bsSize='small' onClick={@handle_hidden_toggle}>
            <Tip title={"Show hidden files"} placement={"bottom"}>
                <Icon name={icon} />
            </Tip>
        </Button>

    render_masked_toggle: ->
        <Button bsSize='small' onClick={@handle_masked_toggle} active={!@props.show_masked}>
            <Tip title={"Hide autogenerated/temporary files"} placement={"bottom"}>
                <Icon name={'mask'} />
            </Tip>
        </Button>

    render_backup: ->
        if @props.public_view or not require('./customize').commercial
            return
        # NOTE -- snapshots aren't available except in commercial version -- they are complicated nontrivial thing that isn't usually setup...
        <Button bsSize='small' onClick={@handle_backup}>
            <Icon name='life-saver' /> <span style={fontSize: 12} className='hidden-sm'>Backups</span>
        </Button>

    handle_library_click: (e) ->
        @props.actions.toggle_library()
        analytics_event('project_file_listing', 'toggle library')

    render_library_button: ->
        # library only exists on kucalc, for now.
        return if @props.kucalc != 'yes'
        <Button
            bsSize={'small'}
            onClick={@handle_library_click}
        >
            <Icon name='book' /> <HiddenSM>Library</HiddenSM>
        </Button>

    handle_upload_click: (e) ->
        analytics_event('project_file_listing', 'clicked upload')

    render_upload_button: ->
        <Button bsSize='small' className="upload-button" onClick={@handle_upload_click}>
            <Icon name='upload' /> <HiddenSM>Upload</HiddenSM>
        </Button>

    render: ->
        <ButtonToolbar style={whiteSpace:'nowrap', padding: '0'} className='pull-right'>
            <ButtonGroup bsSize='small'>
                {@render_library_button() if @props.available_features?.library}
                {@render_upload_button()}
            </ButtonGroup>
            <ButtonGroup bsSize='small' className='pull-right'>
                {@render_refresh()}
                {@render_hidden_toggle()}
                {@render_masked_toggle()}
                {@render_backup()}
            </ButtonGroup>
        </ButtonToolbar>

ProjectFilesActions = rclass
    displayName : 'ProjectFiles-ProjectFilesActions'

    propTypes :
        project_id    : rtypes.string
        checked_files : rtypes.object
        listing       : rtypes.array
        page_number   : rtypes.number
        page_size     : rtypes.number
        public_view   : rtypes.bool.isRequired
        current_path  : rtypes.string
        project_map   : rtypes.immutable.Map
        images        : rtypes.immutable.Map
        actions       : rtypes.object.isRequired
        available_features  : rtypes.object
        show_custom_software_reset : rtypes.bool
        project_is_running : rtypes.bool

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
        if @props.listing.length is 0
            return
        if @props.checked_files.size is 0
            button_icon = 'square-o'
            button_text = 'Check All'
        else
            button_text = 'Uncheck All'

            if @props.checked_files.size >= @props.listing.length
                button_icon = 'check-square-o'
            else
                button_icon = 'minus-square-o'

        <Button bsSize='small' cocalc-test="check-all" onClick={@check_all_click_handler} >
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
        if @props.listing.length is 0
            return
        checked = @props.checked_files?.size ? 0
        total = @props.listing.length
        style = ROW_INFO_STYLE

        if checked is 0
            <div style={style}>
                <span>{"#{total} #{misc.plural(total, 'item')}"}</span>
                <div style={display:'inline'}> &mdash; Click on the checkbox to the left of a file to copy, move, delete, download, etc.</div>
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
        handle_click = (e) =>
            @props.actions.set_file_action(name, get_basename)
            analytics_event('project_file_listing', 'open ' + name + ' menu')

        <Button
            onClick={handle_click}
            disabled={disabled}
            key={name}
        >
            <Icon name={obj.icon} /> <HiddenSM>{obj.name}...</HiddenSM>
        </Button>

    render_action_buttons: ->
        if not @props.project_is_running
            return
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

    render_button_area: ->
        if @props.checked_files.size is 0
            return <CustomSoftwareInfo
                        project_id = {@props.project_id}
                        images = {@props.images}
                        project_map = {@props.project_map}
                        actions = {@props.actions}
                        available_features = {@props.available_features}
                        show_custom_software_reset = {@props.show_custom_software_reset}
                        project_is_running = {@props.project_is_running}
                    />
        else
            return @render_action_buttons()

    render: ->
        <div style={flex: '1 0 auto'}>
            <div style={flex: '1 0 auto'}>
                <ButtonToolbar style={whiteSpace:'nowrap', padding: '0'}>
                    <ButtonGroup>
                        {@render_check_all_button() if @props.project_is_running}
                    </ButtonGroup>
                    {@render_button_area()}
                </ButtonToolbar>
            </div>
            <div style={flex: '1 0 auto'}>
                {@render_currently_selected() if @props.project_is_running}
            </div>
        </div>

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
        analytics_event('project_file_listing', 'compress item')

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
                            defaultValue = {account.default_filename('zip', @props.project_id)}
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
        analytics_event('project_file_listing', 'delete item')

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
                analytics_event('project_file_listing', 'rename item')
            when 'duplicate'
                @props.actions.copy_paths
                    src           : @props.checked_files.toArray()
                    dest          : misc.path_to_file(rename_dir, destination)
                    only_contents : true
                analytics_event('project_file_listing', 'duplicate item')
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
        analytics_event('project_file_listing', 'move item')

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
            analytics_event('project_file_listing', 'copy between projects')
        else
            @props.actions.copy_paths
                src  : paths
                dest : destination_directory
            analytics_event('project_file_listing', 'copy within a project')

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

    render_share: ->
        # currently only works for a single selected file
        path = @props.checked_files.first()
        public_data = @props.file_map[misc.path_split(path).tail]
        if not public_data?
            # directory listing not loaded yet... (will get re-rendered when loaded)
            return <Loading />
        return <ConfigureShare
            project_id = {@props.project_id}
            path = {path}
            isdir = {public_data.isdir}
            size = {public_data.size}
            mtime = {public_data.mtime}
            is_public = {public_data.is_public}
            public = {public_data.public}
            close = {@cancel_action}
            action_key = {@action_key}
            set_public_path = {(opts) => @props.actions.set_public_path(path, opts)}
            has_network_access = {@props.get_total_project_quotas(@props.project_id)?.network}
            />;

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
        analytics_event('project_file_listing', 'share item via', where)
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

    download_single_click: ->
        @props.actions.download_file
            path : @props.checked_files.first()
            log : true
        @props.actions.set_file_action()
        analytics_event('project_file_listing', 'download item')

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
        analytics_event('project_file_listing', 'download item')

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
                    defaultValue = {account.default_filename('zip', @props.project_id)}
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
        disabled           : rtypes.bool

    getDefaultProps: ->
        file_search : ''
        selected_file_index : 0
        num_files_displayed : 0
        disabled : false

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
        analytics_event('project_file_listing', 'exec file search miniterm', input)
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
                placeholder = 'Search or create file'
                value       = {@props.file_search}
                on_change   = {@on_change}
                on_submit   = {@search_submit}
                on_up       = {@on_up_press}
                on_down     = {@on_down_press}
                on_clear    = {@on_clear}
                disabled    = {@props.disabled or (!!@props.ext_selection)}
            />
            {@render_file_creation_error()}
            {@render_help_info()}
            <div style={output_style_searchbox}>
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
        configuration : rtypes.immutable
        disabled      : rtypes.bool

    getDefaultProps: ->
        file_search : ''

    new_file_button_types : ->
        if @props.configuration?
            disabled_ext = @props.configuration.get('main', {}).disabled_ext
            if disabled_ext?
                return ALL_FILE_BUTTON_TYPES.filter (ext) ->
                    not disabled_ext.includes(ext)
        return ALL_FILE_BUTTON_TYPES

    # Rendering doesnt rely on props...
    shouldComponentUpdate: ->
        false

    file_dropdown_icon: ->
        <span style={whiteSpace: 'nowrap'}>
            <Icon name='plus-circle' /> New
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
            @props.actions.ask_filename(ext)
        else
            @props.create_file(ext)

    # Go to new file tab if no file is specified
    on_create_button_clicked: ->
        if @props.file_search.length == 0
            @props.actions.toggle_new()
            analytics_event('project_file_listing', 'search_create_button', 'empty')
        else if @props.file_search[@props.file_search.length - 1] == '/'
            @props.create_folder()
            analytics_event('project_file_listing', 'search_create_button', 'folder')
        else
            @props.create_file()
            analytics_event('project_file_listing', 'search_create_button', 'file')

    render: ->
        # console.log("ProjectFilesNew configuration", @props.configuration?.toJS())
        <SplitButton
            id={'new_file_dropdown'}
            title={@file_dropdown_icon()}
            onClick={@on_create_button_clicked}
            disabled={@props.disabled}
        >
                {(@file_dropdown_item(i, ext) for i, ext of @new_file_button_types())}
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

        customize :
            kucalc : rtypes.string
            site_name : rtypes.string

        compute_images :
            images        : rtypes.immutable.Map

        "#{name}" :
            active_file_sort      : rtypes.object
            current_path          : rtypes.string
            history_path          : rtypes.string
            activity              : rtypes.object
            page_number           : rtypes.number
            file_action           : rtypes.string
            file_search           : rtypes.string
            show_hidden           : rtypes.bool
            show_masked           : rtypes.bool
            error                 : rtypes.string
            checked_files         : rtypes.immutable
            selected_file_index   : rtypes.number
            file_creation_error   : rtypes.string
            ext_selection         : rtypes.string
            new_filename          : rtypes.string
            displayed_listing     : rtypes.object
            new_name              : rtypes.string
            library               : rtypes.object
            show_library          : rtypes.bool
            show_new              : rtypes.bool
            public_paths          : rtypes.immutable  # used only to trigger table init
            configuration         : rtypes.immutable
            available_features    : rtypes.object
            file_listing_scroll_top: rtypes.number
            show_custom_software_reset : rtypes.bool

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
        # Update AFTER react draws everything
        # Should probably be moved elsewhere
        # Prevents cascading changes which impact responsiveness
        # https://github.com/sagemathinc/cocalc/pull/3705#discussion_r268263750
        setTimeout(@props.redux.getActions('billing')?.update_customer, 200)
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
        file_search = @props.file_search
        if not ext? and file_search.lastIndexOf(".") <= file_search.lastIndexOf("/")
            if @props.configuration?
                disabled_ext = @props.configuration.get('main', {}).disabled_ext
            else
                disabled_ext = []
            ext = default_ext(disabled_ext)

        @actions(name).create_file
            name         : file_search
            ext          : ext
            current_path : @props.current_path
            switch_over  : switch_over
        @props.actions.setState(file_search : '', page_number: 0)

    create_folder: (switch_over=true) ->
        @props.actions.create_folder
            name         : @props.file_search
            current_path : @props.current_path
            switch_over  : switch_over
        @props.actions.setState(file_search : '', page_number: 0)

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

    render_library: () ->
        <Row>
            <Col md={12} mdOffset={0} lg={8} lgOffset={2}>
                <ProjectSettingsPanel
                    icon  = {'book'}
                    title = {'Library'}
                    close = {=>@props.actions.toggle_library(false)}
                >
                    <Library
                        project_id={@props.project_id}
                        name={@props.name}
                        actions={@actions(name)}
                        close={=>@props.actions.toggle_library(false)}
                    />
                </ProjectSettingsPanel>
            </Col>
        </Row>

    render_new: () ->
        return if not @props.show_new
        <Row>
            <Col md={12} mdOffset={0} lg={10} lgOffset={1}>
                <ProjectNewForm
                    project_id={@props.project_id}
                    name={@props.name}
                    actions={@actions(name)}
                    close={=>@props.actions.toggle_new(false)}
                    show_header={true}
                />
            </Col>
        </Row>

    render_files_actions: (listing, public_view, project_is_running) ->
        <ProjectFilesActions
            project_id    = {@props.project_id}
            checked_files = {@props.checked_files}
            file_action   = {@props.file_action}
            page_number   = {@props.page_number}
            page_size     = {@file_listing_page_size()}
            public_view   = {public_view}
            current_path  = {@props.current_path}
            listing       = {listing}
            project_map   = {@props.project_map}
            images        = {@props.images}
            actions       = {@props.actions}
            available_features = {@props.available_features}
            show_custom_software_reset = {@props.show_custom_software_reset}
            project_is_running = {project_is_running}
        />

    render_miniterm: ->
        <MiniTerminal
            current_path = {@props.current_path}
            project_id   = {@props.project_id}
            actions      = {@props.actions}
            show_close_x = {false}
        />

    render_new_file : ->
        <ProjectFilesNew
            file_search   = {@props.file_search}
            current_path  = {@props.current_path}
            actions       = {@props.actions}
            create_file   = {@create_file}
            create_folder = {@create_folder}
            configuration = {@props.configuration}
            disabled      = {!!@props.ext_selection}
        />

    render_activity: ->
        <ActivityDisplay
            trunc    = {80}
            activity = {underscore.values(@props.activity)}
            on_clear = {=>@props.actions.clear_all_activity()}
            style    = {top: '100px'}
        />

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
                <Button onClick={() => @props.actions.fetch_directory_listing()}>
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
                style          = {flex: "1"}
            >
                <FileListing
                    name                   = {name}
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
                    show_new               = {@props.show_new}
                    last_scroll_top        = {@props.file_listing_scroll_top}
                    configuration_main     = {@props.configuration?.get("main")}
                />
            </SMC_Dropwrapper>
        else
            <div style={fontSize:'40px', textAlign:'center', color:'#999999'} >
                <Loading />
            </div>

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

    render_control_row: (public_view, visible_listing) ->
        <div style={display:'flex', flexFlow: 'row wrap', justifyContent: 'space-between', alignItems: 'stretch'}>
            <div style={flex: '1 0 20%', marginRight: '10px', minWidth: '20em'}>
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
                    public_view         = {public_view}
                    disabled            = {@props.show_new}
                />
            </div>
            {<div
                style={flex: '0 1 auto', marginRight: '10px', marginBottom:'15px'}
                className='cc-project-files-create-dropdown'
             >
                    {@render_new_file()}
            </div> if not public_view}
            <div
                className = 'cc-project-files-path'
                style={flex: '5 1 auto', marginRight: '10px', marginBottom:'15px'}>
                <ProjectFilesPath
                    current_path = {@props.current_path}
                    history_path = {@props.history_path}
                    actions      = {@props.actions}
                />
            </div>
            {<div style={flex: '0 1 auto', marginRight: '10px', marginBottom:'15px'}>
                <UsersViewing project_id={@props.project_id} />
            </div> if not public_view}
            {<div style={flex: '1 0 auto', marginBottom:'15px'}>
                {@render_miniterm()}
            </div> if not public_view}
        </div>

    render_project_files_buttons: (public_view) ->
        <div style={flex: '1 0 auto', marginBottom:'15px', textAlign: 'right'}>
            {if not public_view
                <ProjectFilesButtons
                    show_hidden  = {@props.show_hidden ? false}
                    show_masked  = {@props.show_masked ? true}
                    current_path = {@props.current_path}
                    public_view  = {public_view}
                    actions      = {@props.actions}
                    show_new     = {@props.show_new}
                    show_library = {@props.show_library}
                    kucalc       = {@props.kucalc}
                    available_features = {@props.available_features}
                />
            }
        </div>

    render_custom_software_reset: () ->
        return null if not @props.show_custom_software_reset
        # also don't show this box, if any files are selected
        return null if @props.checked_files.size > 0
        <CustomSoftwareReset
            project_id = {@props.project_id}
            images = {@props.images}
            project_map = {@props.project_map}
            actions = {@props.actions}
            available_features = {@props.available_features}
            site_name = {@props.site_name}
        />

    render: ->
        if not @props.checked_files?  # hasn't loaded/initialized at all
            return <Loading />

        pay = @props.date_when_course_payment_required(@props.project_id)
        if pay? and pay <= webapp_client.server_time()
            return @render_course_payment_required()

        my_group = @props.get_my_group(@props.project_id)

        # regardless of consequences, for admins a project is always running
        # see https://github.com/sagemathinc/cocalc/issues/3863
        if my_group == 'admin'
            project_state = immutable.Map('state': 'running')
            project_is_running = true
        # next, we check if this is a common user (not public)
        else if my_group != 'public'
            project_state = @props.project_map?.getIn([@props.project_id, 'state'])
            project_is_running = project_state?.get('state') and project_state.get('state') in ['running', 'saving']
        else
            project_is_running = false

        # enables/disables certain aspects if project is viewed publicly by a non-collaborator
        public_view = my_group == 'public'

        {listing, error, file_map} = @props.displayed_listing

        file_listing_page_size= @file_listing_page_size()
        if listing?
            {start_index, end_index} = pager_range(file_listing_page_size, @props.page_number)
            visible_listing = listing[start_index...end_index]

        flex_row_style =
            display: 'flex'
            flexFlow: 'row wrap'
            justifyContent: 'space-between'
            alignItems: 'stretch'

        <div style={display: "flex", flexDirection: "column", padding:'5px', height: '100%'}>
            {if pay? then @render_course_payment_warning(pay)}
            {@render_error()}
            {@render_activity()}
            {@render_control_row(public_view, visible_listing)}
            {<AskNewFilename
                actions            = {@props.actions}
                current_path       = {@props.current_path}
                ext_selection      = {@props.ext_selection}
                new_filename       = {@props.new_filename}
                other_settings     = {@props.other_settings}
            /> if @props.ext_selection}
            {@render_new()}

            <div style={flex_row_style}>
                <div style={flex: '1 0 auto', marginRight: '10px', minWidth: '20em'}>
                    {@render_files_actions(listing, public_view, project_is_running) if listing?}
                </div>
                {@render_project_files_buttons(public_view)}
            </div>

            {@render_custom_software_reset() if project_is_running}

            {@render_library() if @props.show_library}

            {if @props.checked_files.size > 0 and @props.file_action?
                <Row>
                    {@render_files_action_box(file_map, public_view)}
                </Row>
            }

            {### Only show the access error if there is not another error. ###}
            {@render_access_error() if public_view and not error}
            {@render_file_listing(visible_listing, file_map, error, project_state, public_view)}
            {@render_paging_buttons(Math.ceil(listing.length / file_listing_page_size)) if listing?}
        </div>

