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

{BillingPageLink}     = require('./billing/billing-page-link')
{BillingPage}         = require('./billing/billing-page')

{PayCourseFee} = require('./billing/pay-course-fee')

{MiniTerminal, output_style_searchbox}  = require('./project_miniterm')
{file_associations}   = require('./file-associations')
account               = require('./account')
immutable             = require('immutable')
underscore            = require('underscore')
{webapp_client}       = require('./webapp_client')
{AccountPage}         = require('./account_page')
{UsersViewing}        = require('./other-users')
{project_tasks}       = require('./project_tasks')
{CustomSoftwareReset} = require('./custom-software/reset-bar')

ConfigureShare = require('./share/config/config').Configure

{FileListing, TERM_MODE_CHAR} = require("./project/file-listing")

feature = require('./feature')
{AskNewFilename}      = require('./project/ask-filename')

Combobox = require('react-widgets/lib/Combobox') # TODO: delete this when the combobox is in r_misc

pager_range = (page_size, page_number) ->
    start_index = page_size*page_number
    return {start_index: start_index, end_index: start_index + page_size}

{ProjectFilesPath} = require("./project/explorer/project-files-path")
{ProjectFilesButtons} = require("./project/explorer/project-files-buttons")
{ProjectFilesActions} = require("./project/explorer/project-files-actions")
{ProjectFilesActionBox} = require("./project/explorer/project-files-action-box")

# Commands such as CD throw a setState error.
# Search WARNING to find the line in this class.
ProjectFilesSearch = rclass
    displayName : 'Explorer-ProjectFilesSearch'

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
    displayName : 'Explorer-ProjectFilesNew'

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

# TODO: change/rewrite Explorer to not have any rtypes.objects and
# add a shouldComponentUpdate!!
exports.Explorer = rclass ({name}) ->
    displayName : 'Explorer'

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
        return
            show_pay      : false
            shift_is_down : false

    componentDidMount: ->
        # Update AFTER react draws everything
        # Should probably be moved elsewhere
        # Prevents cascading changes which impact responsiveness
        # https://github.com/sagemathinc/cocalc/pull/3705#discussion_r268263750
        setTimeout((() => @props.redux.getActions('billing')?.update_customer()), 200)
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
            <BillingPage is_simplified={true} for_course={true}/>
            {@render_pay() if cards}
        </div>

    render_course_payment_required: () ->
        cards = @props.customer?.sources?.total_count ? 0
        <Alert bsStyle='warning'>
            <h4 style={padding: '2em'}>
                <Icon name='exclamation-triangle'/> Your instructor requires that you pay the one-time ${STUDENT_COURSE_PRICE} course fee for this project.
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
            <Icon name='exclamation-triangle'/> Your instructor requires that you {link} for this project
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
                style          = {flex: "1 0 auto", display: "flex", flexDirection: "column"}
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

        FLEX_ROW_STYLE =
            display: 'flex'
            flexFlow: 'row wrap'
            justifyContent: 'space-between'
            alignItems: 'stretch'


        # be careful with adding height:'100%'. it could cause flex to miscalc. see #3904
        <div
            className={"smc-vfill"}
        >
            <div
                style={flex: "0 0 auto", display: "flex", flexDirection: "column", padding:'5px 5px 0 5px'}
            >
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

                <div style={FLEX_ROW_STYLE}>
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
            </div>
            <div
                style={flex: "1 0 auto", display: "flex", flexDirection: "column", padding:'0 5px 5px 5px', minHeight: "400px"}
            >

                {### Only show the access error if there is not another error. ###}
                {@render_access_error() if public_view and not error}
                {@render_file_listing(visible_listing, file_map, error, project_state, public_view)}
                {@render_paging_buttons(Math.ceil(listing.length / file_listing_page_size)) if listing?}
            </div>
        </div>

