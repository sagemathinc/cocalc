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
##############################################################################

###
ATTENTION!  If you want to refactor this code before working on it (I hope you do!),
put stuff in the new directory project/
###

immutable  = require('immutable')
underscore = require('underscore')
async      = require('async')

{analytics_event}       = require('./tracker')
{webapp_client}         = require('./webapp_client')
misc                    = require('smc-util/misc')
{required, defaults}    = misc
{html_to_text}          = require('./misc_page')
{alert_message}         = require('./alerts')
{project_tasks}         = require('./project_tasks')
{COLORS}                = require('smc-util/theme')
{COMPUTE_IMAGES, DEFAULT_COMPUTE_IMAGE} = require('smc-util/compute-images')
COMPUTE_IMAGES = immutable.fromJS(COMPUTE_IMAGES)  # only because that's how all the ui code was written.

{Alert, Panel, Col, Row, Button, ButtonGroup, ButtonToolbar, FormControl, FormGroup, Well, Checkbox, DropdownButton, MenuItem} = require('react-bootstrap')
{ErrorDisplay, MessageDisplay, Icon, LabeledRow, Loading, ProjectState, SearchInput, TextInput,
 DeletedProjectWarning, NonMemberProjectWarning, NoNetworkProjectWarning, Space, TimeAgo, Tip, UPGRADE_ERROR_STYLE, UpgradeAdjustor, TimeElapsed, A, SettingBox} = require('./r_misc')
{React, ReactDOM, Actions, Store, Table, redux, rtypes, rclass, Redux, Fragment}  = require('./app-framework')
{User} = require('./users')

{HelpEmailLink}   = require('./customize')
{ShowSupportLink} = require('./support')
{SSHKeyAdder, SSHKeyList} = require('./widget-ssh-keys/main')

{PROJECT_UPGRADES} = require('smc-util/schema')

{JupyterServerPanel}   = require('./project/plain-jupyter-server')
{JupyterLabServerPanel}   = require('./project/jupyterlab-server')

{AddCollaboratorsPanel,CurrentCollaboratorsPanel} = require("./collaborators")

{CUSTOM_IMG_PREFIX, CUSTOM_SOFTWARE_HELP_URL, compute_image2name, compute_image2basename} = require('./custom-software/util')

{URLBox} = require('./project/settings/url-box')
{TitleDescriptionBox} = require('./project/settings/title-description-box')
{QuotaConsole} = require('./project/settings/quota-console')
{UpgradeUsage} = require('./project/settings/upgrade-usage')
{HideDeleteBox} = require('./project/settings/hide-delete-box')
{SagewsControl} = require('./project/settings/sagews-control')
{ProjectCapabilitiesPanel} = require('./project/settings/project-capabilites')

class ProjectControlPanel
    displayName : 'ProjectSettings-ProjectControlPanel'

    getInitialState: ->
        restart                : false
        show_ssh               : false
        compute_image          : @props.project.get('compute_image')
        compute_image_changing : false
        compute_image_focused  : false

    propTypes :
        project           : rtypes.object.isRequired
        allow_ssh         : rtypes.bool

    reduxProps :
        customize :
            kucalc        : rtypes.string
        compute_images :
            images        : rtypes.immutable.Map

    componentWillReceiveProps: (props) ->
        return if @state.compute_image_focused
        new_image = props.project.get('compute_image')
        if new_image != @state.compute_image
            @setState(
                compute_image:new_image
                compute_image_changing:false
            )

    open_authorized_keys: (e) ->
        e.preventDefault()
        project_id = @props.project.get('project_id')
        async.series([
            (cb) =>
                project_tasks(project_id).ensure_directory_exists
                    path : '.ssh'
                    cb   : cb
            (cb) =>
                @actions(project_id: project_id).open_file
                    path       : '.ssh/authorized_keys'
                    foreground : true
                cb()
        ])


    render_state: ->
        <span style={fontSize : '12pt', color: '#666'}>
            <ProjectState show_desc={true} state={@props.project.get('state')} />
        </span>

    render_idle_timeout: ->
        # get_idle_timeout_horizon depends on the project object, so this will update properly....
        date = redux.getStore('projects').get_idle_timeout_horizon(@props.project.get('project_id'))
        if not date  # e.g., viewing as admin...
            return
        return <span style={color:'#666'}>
            <Icon name='hourglass-half' /> <b>About <TimeAgo date={date}/></b> project will stop unless somebody actively edits.
        </span>

    restart_project: ->
        @actions('projects').restart_project(@props.project.get('project_id'))
        analytics_event('project_settings', 'restart project')

    stop_project: ->
        @actions('projects').stop_project(@props.project.get('project_id'))
        analytics_event('project_settings', 'stop project')

    render_confirm_restart: ->
        if @state.restart
            <LabeledRow key='restart' label=''>
                <Well>
                    Restarting the project server will kill all processes, update the project code,
                    and start the project running again.  It takes a few seconds, and can fix
                    some issues in case things are not working properly.
                    <hr />
                    <ButtonToolbar>
                        <Button bsStyle='warning' onClick={(e)=>e.preventDefault(); @setState(restart:false); @restart_project()}>
                            <Icon name='refresh' /> Restart Project Server
                        </Button>
                        <Button onClick={(e)=>e.preventDefault(); @setState(restart:false)}>
                             Cancel
                        </Button>
                    </ButtonToolbar>
                </Well>
            </LabeledRow>

    render_confirm_stop: ->
        if @state.show_stop_confirmation
            <LabeledRow key='stop' label=''>
                <Well>
                    Stopping the project server will kill all processes.
                    After stopping a project, it will not start until a
                    collaborator restarts the project.
                    <hr />
                    <ButtonToolbar>
                        <Button bsStyle='warning' onClick={(e)=>e.preventDefault(); @setState(show_stop_confirmation:false); @stop_project()}>
                            <Icon name='stop' /> Stop Project Server
                        </Button>
                        <Button onClick={(e)=>e.preventDefault(); @setState(show_stop_confirmation:false)}>
                             Cancel
                        </Button>
                    </ButtonToolbar>
                </Well>
            </LabeledRow>

    render_action_buttons: ->
        {COMPUTE_STATES} = require('smc-util/schema')
        state = @props.project.get('state')?.get('state')
        commands = COMPUTE_STATES[state]?.commands ? ['save', 'stop', 'start']
        <ButtonToolbar style={marginTop:'10px', marginBottom:'10px'}>
            <Button bsStyle='warning' disabled={'start' not in commands and 'stop' not in commands} onClick={(e)=>e.preventDefault(); @setState(show_stop_confirmation:false,restart:true)}>
                <Icon name='refresh' /> Restart Project...
            </Button>
            <Button bsStyle='warning' disabled={'stop' not in commands} onClick={(e)=>e.preventDefault(); @setState(show_stop_confirmation:true,restart:false)}>
                <Icon name='stop' /> Stop Project...
            </Button>
        </ButtonToolbar>

    render_idle_timeout_row: ->
        if @props.project.getIn(['state', 'state']) != 'running'
            return
        <LabeledRow key='idle-timeout' label='Idle Timeout' style={@rowstyle()}>
            {@render_idle_timeout()}
        </LabeledRow>

    render_uptime: ->
        # start_ts is e.g. 1508576664416
        start_ts = @props.project.getIn(['status', 'start_ts'])
        return if not start_ts?
        return if @props.project.getIn(['state', 'state']) != 'running'

        <LabeledRow key='uptime' label='Uptime' style={@rowstyle()}>
            <span style={color:'#666'}>
                 <Icon name='clock-o' /> project started <b>
                     {<TimeElapsed start_ts={start_ts} />}
                 </b> ago
            </span>
        </LabeledRow>

    render_cpu_usage: ->
        cpu = @props.project.getIn(['status', 'cpu', 'usage'])
        return if not cpu?
        return if @props.project.getIn(['state', 'state']) != 'running'
        cpu_str = misc.seconds2hms(cpu, true)
        <LabeledRow key='cpu-usage' label='CPU Usage' style={@rowstyle(true)}>
            <span style={color:'#666'}>
                <Icon name='calculator' /> used <b>{cpu_str}</b> of CPU time since project started
            </span>
        </LabeledRow>

    cancel_compute_image: (current_image) ->
        @setState(
            compute_image: current_image
            compute_image_changing : false
            compute_image_focused : false
        )


    save_compute_image: (current_image) ->
        # image is reset to the previous name and componentWillReceiveProps will set it when new
        @setState(
            compute_image: current_image
            compute_image_changing : true
            compute_image_focused : false
        )
        new_image = @state.compute_image
        actions = redux.getProjectActions(@props.project.get('project_id'))
        analytics_event('project_settings', 'change compute image')
        try
            await actions.set_compute_image(new_image)
            @restart_project()
        catch err
            alert_message(type:'error', message:err)
            @setState(compute_image_changing: false)

    set_compute_image: (name) ->
        @setState(compute_image: name)

    compute_image_info: (name, type) ->
         COMPUTE_IMAGES.getIn([name, type])

    render_compute_image_items: ->
        COMPUTE_IMAGES.entrySeq().map (entry) =>
            [name, data] = entry
            <MenuItem key={name} eventKey={name} onSelect={@set_compute_image}>
                {data.get('title')}
            </MenuItem>

    render_select_compute_image_row: ->
        if @props.kucalc != 'yes'
            return
        <div>
            <LabeledRow key='cpu-usage' label='Software Environment' style={@rowstyle(true)}>
                {@render_select_compute_image()}
            </LabeledRow>
        </div>

    render_select_compute_image_error: ->
        err = COMPUTE_IMAGES.get('error')
        <Alert bsStyle='warning' style={margin:'10px'}>
            <h4>Problem loading compute images</h4>
            <code>{err}</code>
        </Alert>

    render_custom_compute_image: ->
        current_image = @props.project.get('compute_image')
        name = compute_image2name(current_image)
        return null if not @props.images?
        img_id = compute_image2basename(current_image)
        img_data = @props.images.get(img_id)
        if not img_data?
            # this is quite unlikely, use ID as fallback
            display = img_id
        else
            display = <Fragment>
                        {img_data.get("display")}
                        <div style={color:COLORS.GRAY, fontFamily: "monospace"}>
                            ({name})
                        </div>
                      </Fragment>

        <div style={color:'#666'}>
            <div style={fontSize : '11pt'}>
                <div>
                    <Icon name={'hdd'} /> Custom image:
                </div>
                {display}
                <Space/>
                <span style={color:COLORS.GRAY, fontSize : '11pt'}>
                    <br/> You cannot change a custom software image.{' '}
                    Instead, create a new project and select it there.{' '}
                    <a href={CUSTOM_SOFTWARE_HELP_URL} target={'_blank'} rel={'noopener'}>
                        Learn more...
                    </a>
                </span>
            </div>
        </div>

    render_select_compute_image: ->
        current_image = @props.project.get('compute_image')
        return if not current_image?

        if current_image.startsWith(CUSTOM_IMG_PREFIX)
            return @render_custom_compute_image()

        no_value = not @state.compute_image?
        return <Loading/> if no_value or @state.compute_image_changing
        return @render_select_compute_image_error() if COMPUTE_IMAGES.has('error')
        # this will at least return a suitable default value
        selected_image = @state.compute_image
        default_title = @compute_image_info(DEFAULT_COMPUTE_IMAGE, 'title')
        selected_title = @compute_image_info(selected_image, 'title')

        <div style={color:'#666'}>
            <div style={fontSize : '12pt'}>
                <Icon name={'hdd'} />
                <Space/>
                Selected image
                <Space/>
                <DropdownButton
                    title={selected_title ? selected_image}
                    id={selected_image}
                    onToggle={(open)=>@setState(compute_image_focused:open)}
                    onBlur={=>@setState(compute_image_focused:false)}
                >
                    {this.render_compute_image_items()}
                </DropdownButton>
                <Space/>
                {
                    if selected_image != DEFAULT_COMPUTE_IMAGE
                        <span style={color:COLORS.GRAY, fontSize : '11pt'}>
                            <br/> (If in doubt, select "{default_title}".)
                        </span>
                }
            </div>
            <div style={marginTop:'10px'}>
                <span>
                    <i>{@compute_image_info(selected_image, 'descr')}</i>
                </span>
            </div>
            {
                if selected_image != current_image
                    <div style={marginTop:'10px'}>
                        <Button
                            onClick={=>@save_compute_image(current_image)}
                            bsStyle='warning'
                        >
                            Save and Restart
                        </Button>
                        <Space />
                        <Button onClick={=>@cancel_compute_image(current_image)}>
                            Cancel
                        </Button>
                    </div>
            }
        </div>

    rowstyle: (delim) ->
        style =
            marginBottom:  '5px'
            paddingBottom: '10px'
        if delim
            style.borderBottom = '1px solid #ccc'
            style.borderTop = '1px solid #ccc'
        return style

    render: ->
        <SettingBox title='Project control' icon='gears'>
            <LabeledRow key='state' label='State' style={@rowstyle(true)}>
                {@render_state()}
            </LabeledRow>
            {@render_idle_timeout_row()}
            {@render_uptime()}
            {@render_cpu_usage()}
            <LabeledRow key='action' label='Actions'>
                {@render_action_buttons()}
            </LabeledRow>
            {@render_confirm_restart()}
            {@render_confirm_stop()}
            <LabeledRow key='project_id' label='Project id'>
                <pre>{@props.project.get('project_id')}</pre>
            </LabeledRow>
            {<hr /> if @props.kucalc != 'yes'}
            {@render_select_compute_image_row()}
        </SettingBox>

class SSHPanel
    displayName: 'ProjectSettings-SSHPanel'

    propTypes :
        project    : rtypes.immutable.Map.isRequired
        user_map   : rtypes.immutable.Map
        account_id : rtypes.string

    add_ssh_key: (opts) ->
        opts.project_id = @props.project.get('project_id')
        @actions('projects').add_ssh_key_to_project(opts)
        analytics_event('project_settings', 'add project ssh key')

    delete_ssh_key: (fingerprint) ->
        @actions('projects').delete_ssh_key_from_project
            fingerprint : fingerprint
            project_id  : @props.project.get('project_id')
        analytics_event('project_settings', 'remove project ssh key')

    render_ssh_notice: ->
        user = misc.replace_all(@props.project.get('project_id'), '-', '')
        addr = "#{user}@ssh.cocalc.com"
        <div>
            <span>Use the following username@host:</span>
            <pre>{addr}</pre>
            <a href="https://github.com/sagemathinc/cocalc/wiki/AllAboutProjects#create-ssh-key" target="_blank" rel="noopener">
                <Icon name='life-ring'/> How to create SSH keys
            </a>
        </div>

    render: ->
        <div>
            <SSHKeyList
                ssh_keys   = {@props.project.getIn(['users', webapp_client.account_id, 'ssh_keys'])}
                delete_key = {@delete_ssh_key}
            >
            <div>
            <span>NOTE: If you want to use the same ssh key for all your projects, add a key using the "SSH keys" tab under Account Settings. If you have done that, there is no need to configure an ssh key here.</span>
            </div>
                <SSHKeyAdder
                    add_ssh_key  = {@add_ssh_key}
                    toggleable   = {true}
                    style        = {marginBottom:'10px'}
                    account_id   = {@props.account_id} />
            {@render_ssh_notice()}
            </SSHKeyList>
        </div>

class ProjectSettingsBody
    displayName : 'ProjectSettings-ProjectSettingsBody'

    propTypes :
        project_id    : rtypes.string.isRequired
        account_id    : rtypes.string.isRequired
        project       : rtypes.immutable.Map.isRequired
        user_map      : rtypes.immutable.Map.isRequired
        customer      : rtypes.object
        email_address : rtypes.string
        project_map   : rtypes.object  # if this changes, then available upgrades change, so we may have to re-render, if editing upgrades.
        name          : rtypes.string

    reduxProps :
        account :
            get_total_upgrades : rtypes.func
            groups : rtypes.array
        customize :
            kucalc : rtypes.string
        projects :
            get_course_info : rtypes.func
            get_total_upgrades_you_have_applied : rtypes.func
            get_upgrades_you_applied_to_project : rtypes.func
            get_total_project_quotas : rtypes.func
            get_upgrades_to_project : rtypes.func
            compute_images : rtypes.immutable.Map
            all_projects_have_been_loaded : rtypes.bool
        "#{name}" :
            configuration         : rtypes.immutable
            available_features    : rtypes.object

    shouldComponentUpdate: (props) ->
        return misc.is_different(@props, props, [
            'project',
            'user_map',
            'project_map',
            'compute_images',
            'configuration',
            'available_features',
            'all_projects_have_been_loaded'
        ]) or \
        (props.customer? and not props.customer.equals(@props.customer))

    render: ->
        # get the description of the share, in case the project is being shared
        id = @props.project_id

        upgrades_you_can_use                 = @props.get_total_upgrades()

        course_info                          = @props.get_course_info(@props.project_id)
        upgrades_you_applied_to_all_projects = @props.get_total_upgrades_you_have_applied()
        upgrades_you_applied_to_this_project = @props.get_upgrades_you_applied_to_project(id)
        total_project_quotas                 = @props.get_total_project_quotas(id)  # only available for non-admin for now.
        all_upgrades_to_this_project         = @props.get_upgrades_to_project(id)
        allow_urls                           = redux.getStore("projects").allow_urls_in_emails(@props.project_id)

        {commercial} = require('./customize')

        {is_available} = require('./project_configuration')
        available = is_available(@props.configuration)
        have_jupyter_lab = available.jupyter_lab
        have_jupyter_notebook = available.jupyter_notebook

        <div>
            {if commercial and total_project_quotas? and not total_project_quotas.member_host then <NonMemberProjectWarning upgrade_type='member_host' upgrades_you_can_use={upgrades_you_can_use} upgrades_you_applied_to_all_projects={upgrades_you_applied_to_all_projects} course_info={course_info} account_id={webapp_client.account_id} email_address={@props.email_address} />}
            {if commercial and total_project_quotas? and not total_project_quotas.network then <NoNetworkProjectWarning upgrade_type='network' upgrades_you_can_use={upgrades_you_can_use} upgrades_you_applied_to_all_projects={upgrades_you_applied_to_all_projects} /> }
            <h1 style={marginTop:"0px"}><Icon name='wrench' /> Project Settings</h1>
            <Row>
                <Col sm={6}>
                    <TitleDescriptionBox
                        project_id    = {id}
                        project_title = {@props.project.get('title') ? ''}
                        description   = {@props.project.get('description') ? ''}
                        actions       = {@actions('projects')} />
                    <UpgradeUsage
                        project_id                           = {id}
                        project                              = {@props.project}
                        actions                              = {@actions('projects')}
                        user_map                             = {@props.user_map}
                        account_groups                       = {@props.groups}
                        upgrades_you_can_use                 = {upgrades_you_can_use}
                        upgrades_you_applied_to_all_projects = {upgrades_you_applied_to_all_projects}
                        upgrades_you_applied_to_this_project = {upgrades_you_applied_to_this_project}
                        total_project_quotas                 = {total_project_quotas}
                        all_upgrades_to_this_project         = {all_upgrades_to_this_project}
                        all_projects_have_been_loaded        = {@props.all_projects_have_been_loaded}
                    />

                    <HideDeleteBox key='hidedelete' project={@props.project} actions={@actions('projects')} />
                    {<SSHPanel key='ssh-keys' project={@props.project} user_map={@props.user_map} account_id={@props.account_id} /> if @props.kucalc == 'yes'}
                    <ProjectCapabilitiesPanel
                        name={name}
                        key={'capabilities'}
                        project={@props.project}
                    />
                </Col>
                <Col sm={6}>
                    <CurrentCollaboratorsPanel key='current-collabs'  project={@props.project} user_map={@props.user_map} />
                    <AddCollaboratorsPanel key='new-collabs' project={@props.project} user_map={@props.user_map} on_invite={=>analytics_event('project_settings', 'add collaborator')} allow_urls = {allow_urls}/>
                    <ProjectControlPanel key='control' project={@props.project} allow_ssh={@props.kucalc != 'yes'} />
                    <SagewsControl  key='worksheet' project={@props.project} />
                    {
                        if have_jupyter_notebook
                            <JupyterServerPanel  key='jupyter' project_id={@props.project_id} />
                    }
                    {
                        if have_jupyter_lab
                            <JupyterLabServerPanel  key='jupyterlab' project_id={@props.project_id} />
                    }
                </Col>
            </Row>
        </div>

class exports.ProjectSettings ({name}) ->
    displayName : 'ProjectSettings-ProjectSettings'

    reduxProps :
        projects :
            project_map : rtypes.immutable # SMELL isRequired doesn't seem to work here
        users :
            user_map    : rtypes.immutable
        account :
            # NOT used directly -- instead, the QuotaConsole component depends on this in that it calls something in the account store!
            stripe_customer : rtypes.immutable
            email_address   : rtypes.string
            user_type       : rtypes.string    # needed for projects get_my_group call in render
            account_id      : rtypes.string
        billing :
            customer : rtypes.immutable  # similar to stripe_customer

    propTypes :
        project_id : rtypes.string.isRequired
        group      : rtypes.string

    getInitialState: ->
        admin_project : undefined  # used in case visitor to project is admin

    componentWillUnmount: ->
        delete @_admin_project
        @_table?.close()  # if admin, stop listening for changes

    init_admin_view: ->
        # try to load it directly for future use
        @_admin_project = 'loading'
        query = {}
        for k in misc.keys(require('smc-util/schema').SCHEMA.projects.user_query.get.fields)
            query[k] = if k == 'project_id' then @props.project_id else null
        @_table = webapp_client.sync_table2({projects_admin : query}, []);
        @_table.on 'change', =>
            @setState(admin_project : @_table.get(@props.project_id))

    render_admin_message: ->
        <Alert bsStyle='warning' style={margin:'10px'}>
            <h4><strong>Warning:</strong> you are editing the project settings as an <strong>administrator</strong>.</h4>
            <ul>
                <li> You are not a collaborator on this project, but can edit files, etc. </li>
                <li> You are an admin: actions will not be logged to the project log.</li>
            </ul>
        </Alert>

    render: ->
        if not @props.project_map? or not @props.user_map?
            return <Loading />
        user_map = @props.user_map
        project = @props.project_map?.get(@props.project_id) ? @state.admin_project
        if @props.group == 'admin'
            project = @state.admin_project
            if @_admin_project? and @_admin_project != 'loading'
                return <ErrorDisplay error={@_admin_project} />
            if not project? and not @_admin_project?
                @init_admin_view()

        if not project?
            return <Loading />
        else
            <div style={padding:'15px'}>
                {@render_admin_message() if @state.admin_project?}
                <ProjectSettingsBody
                    project_id    = {@props.project_id}
                    account_id    = {@props.account_id}
                    project       = {project}
                    user_map      = {@props.user_map}
                    customer      = {@props.customer}
                    email_address = {@props.email_address}
                    project_map   = {@props.project_map}
                    name          = {name}
                />
            </div>
