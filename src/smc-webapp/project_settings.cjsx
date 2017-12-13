###############################################################################
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

immutable  = require('immutable')
underscore = require('underscore')
async      = require('async')

{webapp_client}      = require('./webapp_client')
misc                 = require('smc-util/misc')
{required, defaults} = misc
{html_to_text}       = require('./misc_page')
{alert_message}      = require('./alerts')
{project_tasks}      = require('./project_tasks')

{Alert, Panel, Col, Row, Button, ButtonGroup, ButtonToolbar, FormControl, FormGroup, Well, Checkbox} = require('react-bootstrap')
{ErrorDisplay, MessageDisplay, Icon, LabeledRow, Loading, MarkdownInput, ProjectState, SearchInput, TextInput,
 NumberInput, DeletedProjectWarning, NonMemberProjectWarning, NoNetworkProjectWarning, Space, TimeAgo, Tip, UPGRADE_ERROR_STYLE, UpgradeAdjustor} = require('./r_misc')
{React, ReactDOM, Actions, Store, Table, redux, rtypes, rclass, Redux}  = require('./smc-react')
{User} = require('./users')

{HelpEmailLink}   = require('./customize')
{ShowSupportLink} = require('./support')
{SSHKeyAdder, SSHKeyList} = require('./widget-ssh-keys/main')

{PROJECT_UPGRADES} = require('smc-util/schema')

{AddCollaborators} = require('./collaborators/add-to-project')

{COLORS} = require('smc-util/theme')

URLBox = rclass
    displayName : 'URLBox'

    render: ->
        url = document.URL
        i   = url.lastIndexOf('/settings')
        if i != -1
            url = url.slice(0,i)
        # note -- use of Input below is completely broken on Firefox! Do not naively change this back!!!!
        <pre style={fontSize:'11px'}>{url}</pre>

ProjectSettingsPanel = rclass
    displayName : 'ProjectSettingsPanel'

    propTypes :
        icon  : rtypes.string.isRequired
        title : rtypes.string.isRequired

    render_header: ->
        <h3><Icon name={@props.icon} /> {@props.title}</h3>

    render: ->
        <Panel header={@render_header()}>
            {@props.children}
        </Panel>

TitleDescriptionPanel = rclass
    displayName : 'ProjectSettings-TitleDescriptionPanel'

    propTypes :
        project_title : rtypes.string.isRequired
        project_id    : rtypes.string.isRequired
        description   : rtypes.string.isRequired
        actions       : rtypes.object.isRequired # projects actions

    render: ->
        <ProjectSettingsPanel title='Title and description' icon='header'>
            <LabeledRow label='Title'>
                <TextInput
                    text={@props.project_title}
                    on_change={(title)=>@props.actions.set_project_title(@props.project_id, title)}
                />
            </LabeledRow>
            <LabeledRow label='Description'>
                <TextInput
                    type      = 'textarea'
                    rows      = 2
                    text      = {@props.description}
                    on_change = {(desc)=>@props.actions.set_project_description(@props.project_id, desc)}
                />
            </LabeledRow>
        </ProjectSettingsPanel>

QuotaConsole = rclass
    displayName : 'ProjectSettings-QuotaConsole'

    propTypes :
        project_id                   : rtypes.string.isRequired
        project_settings             : rtypes.object            # settings contains the base values for quotas
        project_status               : rtypes.object
        project_state                : rtypes.string            # opened, running, starting, stopping, etc.  -- only show memory usage when project_state == 'running'
        user_map                     : rtypes.object.isRequired
        quota_params                 : rtypes.object.isRequired # from the schema
        account_groups               : rtypes.array.isRequired
        total_project_quotas         : rtypes.object            # undefined if viewing as admin
        all_upgrades_to_this_project : rtypes.object

    getDefaultProps: ->
        all_upgrades_to_this_project : {}

    getInitialState: ->
        state =
            editing   : false # admin is currently editing
            upgrading : false # user is currently upgrading
        settings = @props.project_settings
        if settings?
            for name, data of @props.quota_params
                factor = data.display_factor
                base_value = settings.get(name) ? 0
                state[name] = misc.round2(base_value * factor)

        return state

    componentWillReceiveProps: (next_props) ->
        settings = next_props.project_settings
        if not immutable.is(@props.project_settings, settings)
            if settings?
                new_state = {}
                for name, data of @props.quota_params
                    new_state[name] = misc.round2(settings.get(name) * data.display_factor)
                @setState(new_state)

    render_quota_row: (quota, base_value=0, upgrades, params_data) ->
        factor = params_data.display_factor
        unit   = params_data.display_unit

        upgrade_list = []
        if upgrades?
            for id, val of upgrades
                amount = misc.round2(val * factor)
                li =
                    <li key={id}>
                        {amount} {misc.plural(amount, unit)} given by <User account_id={id} user_map={@props.user_map} />
                    </li>
                upgrade_list.push(li)

        amount = misc.round2(base_value * factor)
        if amount
            # amount given by free project
            upgrade_list.unshift(<li key='free'>{amount} {misc.plural(amount, unit)} given by free project</li>)

        <LabeledRow
            label = {<Tip title={params_data.display}
            tip   = {params_data.desc}>{params_data.display}</Tip>}
            key   = {params_data.display}
            style = {borderBottom:'1px solid #ccc'}
            >
            {if @state.editing then quota.edit else quota.view}
            <ul style={color:COLORS.GRAY_D}>
                {upgrade_list}
            </ul>
        </LabeledRow>

    start_admin_editing: ->
        @setState(editing: true)

    save_admin_editing: ->
        webapp_client.project_set_quotas
            project_id  : @props.project_id
            cores       : @state.cores
            cpu_shares  : Math.round(@state.cpu_shares * 256)
            disk_quota  : @state.disk_quota
            memory      : @state.memory
            mintime     : Math.floor(@state.mintime * 3600)
            network     : @state.network
            member_host : @state.member_host
            cb          : (err, mesg) ->
                if err
                    alert_message(type:'error', message:err)
                else if mesg.event == 'error'
                    alert_message(type:'error', message:mesg.error)
                else
                    alert_message(type:'success', message: 'Project quotas updated.')
        @setState(editing : false)

    cancel_admin_editing: ->
        settings = @props.project_settings
        if settings?
            # reset user input states
            state = {}
            for name, data of @props.quota_params
                factor = data.display_factor
                base_value = settings.get(name) ? 0
                state[name] = misc.round2(base_value * factor)
            @setState(state)
        @setState(editing : false)

    # Returns true if the admin inputs are valid, i.e.
    #    - at least one has changed
    #    - none are negative
    #    - none are empty
    valid_admin_inputs: ->
        settings = @props.project_settings
        if not settings?
            return false

        for name, data of @props.quota_params
            if not settings.get(name)?
                continue
            factor = data?.display_factor
            cur_val = settings.get(name) * factor
            new_val = misc.parse_number_input(@state[name])
            if not new_val?
                return false
            if cur_val isnt new_val
                changed = true
        return changed

    render_admin_edit_buttons: ->
        if 'admin' in @props.account_groups
            if @state.editing
                <Row>
                    <Col sm=6 smOffset=6>
                        <ButtonToolbar style={float:'right'}>
                            <Button onClick={@save_admin_editing} bsStyle='warning' disabled={not @valid_admin_inputs()}>
                                <Icon name='thumbs-up' /> Done
                            </Button>
                            <Button onClick={@cancel_admin_editing}>
                                Cancel
                            </Button>
                        </ButtonToolbar>
                    </Col>
                </Row>
            else
                <Row>
                    <Col sm=6 smOffset=6>
                        <Button onClick={@start_admin_editing} bsStyle='warning' style={float:'right'}>
                            <Icon name='pencil' /> Admin edit...
                        </Button>
                    </Col>
                </Row>

    admin_input_validation_styles: (input) ->
        if not misc.parse_number_input(input)?
            style =
                outline     : 'none'
                borderColor : 'red'
                boxShadow   : '0 0 10px red'
        return style

    render_input: (label) ->
        if label is 'network' or label is 'member_host'
            <Checkbox
                ref      = {label}
                checked  = {@state[label]}
                style    = {marginLeft:0}
                onChange = {(e)=>@setState("#{label}" : if e.target.checked then 1 else 0)}>
                {if @state[label] then "Enabled" else "Enable"}
            </Checkbox>
        else
            # not using react component so the input stays inline
            <input
                size     = 5
                type     = 'text'
                ref      = {label}
                value    = {@state[label]}
                style    = {@admin_input_validation_styles(@state[label])}
                onChange = {(e)=>@setState("#{label}":e.target.value)} />

    render_disk_used: (disk) ->
        if not disk
            return
        <span>
            <Space/> (<b>{disk} MB</b> used)
        </span>

    render_memory_used: (memory) ->
        if @props.project_state not in ['running', 'saving']
            return
        <span>
            <Space/> (<b>{memory} MB</b> used)
        </span>

    render: ->
        settings     = @props.project_settings
        if not settings?
            return <Loading/>
        status       = @props.project_status
        total_quotas = @props.total_project_quotas
        if not total_quotas?
            # this happens for the admin -- just ignore any upgrades from the users
            total_quotas = {}
            for name, data of @props.quota_params
                total_quotas[name] = settings.get(name)
        disk_quota = <b>{settings.get('disk_quota')}</b>
        memory     = '?'
        disk       = '?'
        quota_params = @props.quota_params

        if status?
            rss = status.get('memory')?.get('rss')
            if rss?
                memory = Math.round(rss/1000)
            disk = status.get('disk_MB')
            if disk?
                disk = Math.ceil(disk)

        r = misc.round2
        # the keys in quotas have to match those in PROJECT_UPGRADES.field_order
        quotas =
            disk_quota  :
                view : <span><b>{r(total_quotas['disk_quota'] * quota_params['disk_quota'].display_factor)} MB</b> disk usage limit {@render_disk_used(disk)}</span>
                edit : <span><b>{@render_input('disk_quota')} MB</b> disk space limit <Space/> {@render_disk_used(disk)}</span>
            memory      :
                view : <span><b>{r(total_quotas['memory'] * quota_params['memory'].display_factor)} MB</b> shared RAM memory limit {@render_memory_used(memory)}</span>
                edit : <span><b>{@render_input('memory')} MB</b> RAM memory limit {@render_memory_used(memory)} </span>
            memory_request :
                view : <span><b>{r(total_quotas['memory_request'] * quota_params['memory_request'].display_factor)} MB</b> dedicated RAM</span>
                edit : <span><b>{@render_input('memory_request')} MB</b> dedicated RAM memory</span>
            cores       :
                view : <span><b>{r(total_quotas['cores'] * quota_params['cores'].display_factor)} {misc.plural(total_quotas['cores'] * quota_params['cores'].display_factor, 'core')}</b></span>
                edit : <b>{@render_input('cores')} cores</b>
            cpu_shares  :
                view : <b>{r(total_quotas['cpu_shares'] * quota_params['cpu_shares'].display_factor)} {misc.plural(total_quotas['cpu_shares'] * quota_params['cpu_shares'].display_factor, 'core')}</b>
                edit : <b>{@render_input('cpu_shares')} {misc.plural(total_quotas['cpu_shares'], 'core')}</b>
            mintime     :
                view : <span><b>{r(misc.round2(total_quotas['mintime'] * quota_params['mintime'].display_factor))} {misc.plural(total_quotas['mintime'] * quota_params['mintime'].display_factor, 'hour')}</b> of non-interactive use before project stops</span>
                edit : <span><b>{@render_input('mintime')} hours</b> of non-interactive use before project stops</span>
            network     :
                view : <b>{if @props.project_settings.get('network') or total_quotas['network'] then 'Yes' else 'Blocked'}</b>
                edit : @render_input('network')
            member_host :
                view : <b>{if @props.project_settings.get('member_host') or total_quotas['member_host'] then 'Yes' else 'No'}</b>
                edit : @render_input('member_host')

        upgrades = @props.all_upgrades_to_this_project

        <div>
            {@render_admin_edit_buttons()}
            {@render_quota_row(quotas[name], settings.get(name), upgrades[name], quota_params[name]) for name in PROJECT_UPGRADES.field_order}
        </div>

UsagePanel = rclass
    displayName : 'ProjectSettings-UsagePanel'

    propTypes :
        project_id                           : rtypes.string.isRequired
        project                              : rtypes.object.isRequired
        user_map                             : rtypes.object.isRequired
        account_groups                       : rtypes.array.isRequired
        upgrades_you_can_use                 : rtypes.object
        upgrades_you_applied_to_all_projects : rtypes.object
        upgrades_you_applied_to_this_project : rtypes.object
        total_project_quotas                 : rtypes.object
        all_upgrades_to_this_project         : rtypes.object
        actions                              : rtypes.object.isRequired # projects actions

    getInitialState: ->
        show_adjustor : false

    submit_upgrade_quotas: (new_quotas) ->
        @props.actions.apply_upgrades_to_project(@props.project_id, new_quotas)
        @setState(show_adjustor : false)

    render_upgrades_button: ->
        <Row>
            <Col sm=12>
                <Button bsStyle='primary' disabled={@state.show_adjustor} onClick={=>@setState(show_adjustor : true)} style={float: 'right', marginBottom : '5px'}>
                    <Icon name='arrow-circle-up' /> Adjust your quotas...
                </Button>
            </Col>
        </Row>

    render: ->
        if not require('./customize').commercial
            return null
        <ProjectSettingsPanel title='Project usage and quotas' icon='dashboard'>
            {@render_upgrades_button()}
            {<UpgradeAdjustor
                project_id                           = {@props.project_id}
                upgrades_you_can_use                 = {@props.upgrades_you_can_use}
                upgrades_you_applied_to_all_projects = {@props.upgrades_you_applied_to_all_projects}
                upgrades_you_applied_to_this_project = {@props.upgrades_you_applied_to_this_project}
                quota_params                         = {require('smc-util/schema').PROJECT_UPGRADES.params}
                submit_upgrade_quotas                = {@submit_upgrade_quotas}
                cancel_upgrading                     = {=>@setState(show_adjustor : false)}
            /> if @state.show_adjustor}
            <QuotaConsole
                project_id                   = {@props.project_id}
                project_settings             = {@props.project.get('settings')}
                project_status               = {@props.project.get('status')}
                project_state                = {@props.project.get('state')?.get('state')}
                user_map                     = {@props.user_map}
                quota_params                 = {require('smc-util/schema').PROJECT_UPGRADES.params}
                account_groups               = {@props.account_groups}
                total_project_quotas         = {@props.total_project_quotas}
                all_upgrades_to_this_project = {@props.all_upgrades_to_this_project}
                actions                      = {@props.actions} />
            <hr />
            <span style={color:COLORS.GRAY_D}>If you have any questions about upgrading a project,
                create a <ShowSupportLink />,
                or email <HelpEmailLink /> and
                include the following URL:
                <URLBox />
            </span>
        </ProjectSettingsPanel>

HideDeletePanel = rclass
    displayName : 'ProjectSettings-HideDeletePanel'

    propTypes :
        project : rtypes.object.isRequired

    getInitialState: ->
        show_delete_conf : false

    show_delete_conf: ->
        @setState(show_delete_conf : true)

    hide_delete_conf: ->
        @setState(show_delete_conf : false)

    toggle_delete_project: ->
        @actions('projects').toggle_delete_project(@props.project.get('project_id'))
        @hide_delete_conf()

    toggle_hide_project: ->
        @actions('projects').toggle_hide_project(@props.project.get('project_id'))

    # account_id : String
    # project    : immutable.Map
    user_has_applied_upgrades: (account_id, project) ->
         project.getIn(['users', account_id, 'upgrades'])?.some (val) => val > 0

    delete_message: ->
        if @props.project.get('deleted')
            <DeletedProjectWarning/>
        else
            <span>Delete this project for everyone. You can undo this.</span>

    hide_message: ->
        user = @props.project.getIn(['users', webapp_client.account_id])
        if not user?
            return <span>Does not make sense for admin.</span>
        if user.get('hide')
            <span>
                Unhide this project, so it shows up in your default project listing.
                Right now it only appears when hidden is checked.
            </span>
        else
            <span>
                Hide this project, so it does not show up in your default project listing.
                This only impacts you, not your collaborators, and you can easily unhide it.
            </span>

    render_delete_undelete_button: (is_deleted, is_expanded) ->
        if is_deleted
            text = "Undelete Project"
            onClick = @toggle_delete_project
            disabled = false
        else
            text = "Delete Project..."
            onClick = @show_delete_conf
            disabled = is_expanded

        <Button bsStyle='danger' style={float: 'right'} onClick={onClick} disabled={disabled}>
            <Icon name='trash' /> {text}
        </Button>

    render_expanded_delete_info: ->
        has_upgrades = @user_has_applied_upgrades(webapp_client.account_id, @props.project)
        <Well style={textAlign:'center'} >
            {<Alert bsStyle="info" style={padding:'8px'} >
                All of your upgrades from this project will be removed automatically.
                Undeleting the project will not automatically restore them.
                This will not affect upgrades other people have applied.
            </Alert> if has_upgrades}
            {<div style={marginBottom:'5px'} >
                Are you sure you want to delete this project?
            </div> if not has_upgrades}
            <ButtonToolbar >
                <Button bsStyle='danger' onClick={@toggle_delete_project}>
                    Delete Project
                </Button>
                <Button onClick={@hide_delete_conf}>
                    Cancel
                </Button>
            </ButtonToolbar>
        </Well>

    render: ->
        user = @props.project.getIn(['users', webapp_client.account_id])
        if not user?
            return <span>Does not make sense for admin.</span>
        hidden = user.get('hide')
        <ProjectSettingsPanel title='Hide or delete project' icon='warning'>
            <Row>
                <Col sm=8>
                    {@hide_message()}
                </Col>
                <Col sm=4>
                    <Button bsStyle='warning' onClick={@toggle_hide_project} style={float: 'right'}>
                        <Icon name='eye-slash' /> {if hidden then 'Unhide' else 'Hide'} Project
                    </Button>
                </Col>
            </Row>
            <hr />
            <Row>
                <Col sm=8>
                    {@delete_message()}
                </Col>
                <Col sm=4>
                    {@render_delete_undelete_button(@props.project.get('deleted'), @state.show_delete_conf)}
                </Col>
            </Row>
            {<Row style={marginTop:'10px'} >
                <Col sm=12>
                    {@render_expanded_delete_info()}
                </Col>
            </Row> if @state.show_delete_conf and not @props.project.get('deleted')}
        </ProjectSettingsPanel>

SageWorksheetPanel = rclass
    displayName : 'ProjectSettings-SageWorksheetPanel'

    getInitialState: ->
        loading : false
        message : ''

    componentDidMount: ->
        @_mounted = true

    componentWillUnmount: ->
        delete @_mounted

    propTypes :
        project : rtypes.object.isRequired

    restart_worksheet: ->
        @setState(loading : true)
        webapp_client.exec
            project_id : @props.project.get('project_id')
            command    : 'smc-sage-server stop; smc-sage-server start'
            timeout    : 30
            cb         : (err, output) =>
                if not @_mounted # see https://github.com/sagemathinc/cocalc/issues/1684
                    return
                @setState(loading : false)
                if err
                    @setState(message:'Error trying to restart worksheet server. Try restarting the project server instead.')
                else
                    @setState(message:'Worksheet server restarted. Restarted worksheets will use a new Sage session.')

    render_message: ->
        if @state.message
            <MessageDisplay message={@state.message} onClose={=>@setState(message:'')} />

    render: ->
        <ProjectSettingsPanel title='Sage worksheet server' icon='refresh'>
            <Row>
                <Col sm=8>
                    Restart this Sage Worksheet server. <br />
                    <span style={color: COLORS.GRAY_D}>
                        Existing worksheet sessions are unaffected; restart this
                        server if you customize $HOME/bin/sage, so that restarted worksheets
                        will use the new version of Sage.
                    </span>
                </Col>
                <Col sm=4>
                    <Button bsStyle='warning' disabled={@state.loading} onClick={@restart_worksheet}>
                        <Icon name='refresh' spin={@state.loading} /> Restart Sage Worksheet Server
                    </Button>
                </Col>
            </Row>
            {@render_message()}
        </ProjectSettingsPanel>

JupyterServerPanel = rclass
    displayName : 'ProjectSettings-JupyterServer'

    propTypes :
        project_id : rtypes.string.isRequired

    render_jupyter_button: ->
        {APP_BASE_URL} = require('./misc_page')
        target = encodeURIComponent("#{APP_BASE_URL}/#{@props.project_id}/port/jupyter/")
        url = "#{APP_BASE_URL}/static/loading.html?target=#{target}"
        <Button
            style   = {fontSize:'12pt', margin: '15px'}
            href    = "#{url}"
            target  = '_blank'
            bsStyle = 'default'
            >
                <Icon name='external-link'/> Classical Jupyter server
        </Button>

    render: ->
        <ProjectSettingsPanel title='Jupyter notebook server' icon='cc-icon-jupyter'>
            <div style={color: COLORS.GRAY_D}>
                Click on this button to start and open up the classical Jupyter Notebook server,
                as built by the Jupyter project.
                {' '}<b>It does not support synchronized editing and TimeTravel!</b>{' '}
                Only use it when you need to run extensions or specific libraries
                depending on an unmodified Jupyter notebook server.
            </div>
            <div style={textAlign: 'center'}>
                {@render_jupyter_button()}
            </div>
        </ProjectSettingsPanel>

ProjectControlPanel = rclass
    displayName : 'ProjectSettings-ProjectControlPanel'

    getInitialState: ->
        restart  : false
        show_ssh : false

    propTypes :
        project           : rtypes.object.isRequired
        allow_ssh         : rtypes.bool

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

    ssh_notice: ->
        project_id = @props.project.get('project_id')
        host = @props.project.get('host')?.get('host')
        if host?
            if @state.show_ssh
                <div>
                    SSH into your project: <span style={color:COLORS.GRAY_D}>First add your public key to <a onClick={@open_authorized_keys} href=''>~/.ssh/authorized_keys</a>, then use the following username@host:</span>
                    {# WARNING: previous use of <FormControl> here completely breaks copy on Firefox.}
                    <pre>{"#{misc.replace_all(project_id, '-', '')}@#{host}.cocalc.com"} </pre>
                    <a href="https://github.com/sagemathinc/cocalc/wiki/AllAboutProjects#create-ssh-key" target="_blank">
                    <Icon name='life-ring'/> How to create SSH keys</a>
                </div>
            else
                <Row>
                    <Col sm=12>
                        <Button bsStyle='info' onClick={=>@setState(show_ssh : true)} style={float:'right'}>
                            <Icon name='terminal' /> SSH into your project...
                        </Button>
                    </Col>
                </Row>

    render_state: ->
        <span style={fontSize : '12pt', color: COLORS.GRAY_D}>
            <ProjectState show_desc={true} state={@props.project.get('state')?.get('state')} />
        </span>

    render_idle_timeout: ->
        # get_idle_timeout_horizon depends on the project object, so this will update properly....
        date = redux.getStore('projects').get_idle_timeout_horizon(@props.project.get('project_id'))
        if not date  # e.g., viewing as admin...
            return
        return <span style={color:COLORS.GRAY_D}>
            <Icon name='hourglass-half' /> <b>About <TimeAgo date={date}/></b> project will stop unless somebody actively edits.
        </span>

    restart_project: ->
        @actions('projects').restart_project(@props.project.get('project_id'))

    stop_project: ->
        @actions('projects').stop_project(@props.project.get('project_id'))

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
                            <Icon name='refresh' /> Restart project server
                        </Button>
                        <Button onClick={(e)=>e.preventDefault(); @setState(restart:false)}>
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
            <Button bsStyle='warning' disabled={'start' not in commands and 'stop' not in commands} onClick={(e)=>e.preventDefault(); @setState(restart:true)}>
                <Icon name={COMPUTE_STATES.starting.icon} /> Restart project...
            </Button>
            <Button bsStyle='warning' disabled={'stop' not in commands} onClick={(e)=>e.preventDefault(); @stop_project()}>
                <Icon name={COMPUTE_STATES.stopping.icon} /> Stop
            </Button>
        </ButtonToolbar>

    show_host: ->
        host = @props.project.get('host')?.get('host')
        if host
            <LabeledRow key='host' label='Host'>
                <pre>{host}.sagemath.com</pre>
            </LabeledRow>

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
        delta_s = (misc.server_time().getTime() - start_ts) / 1000
        uptime_str = misc.seconds2hms(delta_s, true)
        <LabeledRow key='uptime' label='Uptime' style={@rowstyle()}>
            <span style={color:COLORS.GRAY_D}>
                 <Icon name='clock-o' /> <b>{uptime_str}</b> total runtime of this session
            </span>
        </LabeledRow>

    render_cpu_usage: ->
        cpu = @props.project.getIn(['status', 'cpu', 'usage'])
        return if not cpu?
        return if @props.project.getIn(['state', 'state']) != 'running'
        cpu_str = misc.seconds2hms(cpu, true)
        <LabeledRow key='cpu-usage' label='CPU Usage' style={@rowstyle(true)}>
            <span style={color:COLORS.GRAY_D}>
                <Icon name='calculator' /> <b>{cpu_str}</b> of CPU time used during this session
            </span>
        </LabeledRow>

    rowstyle: (delim) ->
        style =
            marginBottom:  '5px'
            paddingBottom: '10px'
        if delim
            style.borderBottom = '1px solid #ccc'
        return style

    render: ->
        <ProjectSettingsPanel title='Project control' icon='gears'>
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
            <LabeledRow key='project_id' label='Project id'>
                <pre>{@props.project.get('project_id')}</pre>
            </LabeledRow>
            {@show_host() if @props.allow_ssh}
            If your project is not working, please create a <ShowSupportLink />.
            {<hr /> if @props.allow_ssh}
            {@ssh_notice() if @props.allow_ssh}
        </ProjectSettingsPanel>

exports.CollaboratorsList = CollaboratorsList = rclass
    displayName : 'ProjectSettings-CollaboratorsList'

    propTypes :
        project  : rtypes.object.isRequired
        user_map : rtypes.object

    reduxProps :
        account :
            get_account_id : rtypes.func
        projects :
            sort_by_activity : rtypes.func

    getInitialState: ->
        removing : undefined  # id's of account that we are currently confirming to remove

    remove_collaborator: (account_id) ->
        project_id = @props.project.get('project_id')
        @actions('projects').remove_collaborator(project_id, account_id)
        @setState(removing:undefined)
        if account_id == @props.get_account_id()
            @actions('page').close_project_tab(project_id)

    render_user_remove_confirm: (account_id) ->
        if account_id == @props.get_account_id()
            <Well style={background:'white'}>
                Are you sure you want to remove <b>yourself</b> from this project?  You will no longer have access
                to this project and cannot add yourself back.
                <ButtonToolbar style={marginTop:'15px'}>
                    <Button bsStyle='danger' onClick={=>@remove_collaborator(account_id)}>
                        Remove Myself</Button>
                    <Button bsStyle='default' onClick={=>@setState(removing:'')}>Cancel</Button>
                </ButtonToolbar>
            </Well>
        else
            <Well style={background:'white'}>
                Are you sure you want to remove <User account_id={account_id} user_map={@props.user_map} /> from
                this project?  They will no longer have access to this project.
                <ButtonToolbar style={marginTop:'15px'}>
                    <Button bsStyle='danger' onClick={=>@remove_collaborator(account_id)}>Remove</Button>
                    <Button bsStyle='default' onClick={=>@setState(removing:'')}>Cancel</Button>
                </ButtonToolbar>
            </Well>

    user_remove_button: (account_id, group) ->
        <Button
            disabled = {group is 'owner'}
            style    = {marginBottom: '6px', float: 'right'}
            onClick  = {=>@setState(removing:account_id)}
        >
            <Icon name='user-times' /> Remove...
        </Button>

    render_user: (user) ->
        <div key={user.account_id}>
            <Row>
                <Col sm=8>
                    <User account_id={user.account_id} user_map={@props.user_map} last_active={user.last_active} />
                    <span><Space/>({user.group})</span>
                </Col>
                <Col sm=4>
                    {@user_remove_button(user.account_id, user.group)}
                </Col>
            </Row>
            {@render_user_remove_confirm(user.account_id) if @state.removing == user.account_id}
        </div>

    render_users: ->
        u = @props.project.get('users')
        if u
            users = ({account_id:account_id, group:x.group} for account_id, x of u.toJS())
            for user in @props.sort_by_activity(users, @props.project.get('project_id'))
                @render_user(user)

    render: ->
        <Well style={maxHeight: '20em', overflowY: 'auto', overflowX: 'hidden'}>
            {@render_users()}
        </Well>

CollaboratorsPanel = rclass
    displayName : 'ProjectSettings-CollaboratorsPanel'

    propTypes :
        project  : rtypes.object.isRequired
        user_map : rtypes.object

    render: ->
        <ProjectSettingsPanel title='Add people to project' icon='user'>
            <div key='mesg'>
                <span style={color:'#333', fontSize:'12pt'}>
                    Who would you like to work with on this project?
                </span>
            </div>
            <hr />
            <AddCollaborators key='search' project={@props.project} />
            {<hr /> if @props.project.get('users')?.size > 1}
            <CollaboratorsList key='list' project={@props.project} user_map={@props.user_map} />
        </ProjectSettingsPanel>

SSHPanel = rclass
    displayName: 'ProjectSettings-SSHPanel'

    propTypes :
        project    : rtypes.immutable.Map.isRequired
        user_map   : rtypes.immutable.Map
        account_id : rtypes.string

    add_ssh_key: (opts) ->
        opts.project_id = @props.project.get('project_id')
        @actions('projects').add_ssh_key_to_project(opts)

    delete_ssh_key: (fingerprint) ->
        @actions('projects').delete_ssh_key_from_project
            fingerprint : fingerprint
            project_id  : @props.project.get('project_id')

    render_ssh_notice: ->
        user = misc.replace_all(@props.project.get('project_id'), '-', '')
        addr = "#{user}@ssh.cocalc.com"
        <div>
            <span>Use the following username@host:</span>
            <pre>{addr}</pre>
            <a href="https://github.com/sagemathinc/cocalc/wiki/AllAboutProjects#create-ssh-key" target="_blank">
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

ProjectSettingsBody = rclass ({name}) ->
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
        "#{name}" :
            free_compute_slowdown    : rtypes.number

    shouldComponentUpdate: (nextProps) ->
        return @props.project != nextProps.project or @props.user_map != nextProps.user_map or \
                (nextProps.customer? and not nextProps.customer.equals(@props.customer)) or \
                @props.project_map != nextProps.project_map

    render: ->
        # get the description of the share, in case the project is being shared
        id = @props.project_id

        upgrades_you_can_use                 = @props.get_total_upgrades()

        course_info                          = @props.get_course_info(@props.project_id)
        upgrades_you_applied_to_all_projects = @props.get_total_upgrades_you_have_applied()
        upgrades_you_applied_to_this_project = @props.get_upgrades_you_applied_to_project(id)
        total_project_quotas                 = @props.get_total_project_quotas(id)  # only available for non-admin for now.
        all_upgrades_to_this_project         = @props.get_upgrades_to_project(id)

        {commercial} = require('./customize')

        <div>
            {if commercial and total_project_quotas? and not total_project_quotas.member_host then <NonMemberProjectWarning upgrade_type='member_host' upgrades_you_can_use={upgrades_you_can_use} upgrades_you_applied_to_all_projects={upgrades_you_applied_to_all_projects} course_info={course_info} account_id={webapp_client.account_id} email_address={@props.email_address} free_compute_slowdown={@props.free_compute_slowdown}/>}
            {if commercial and total_project_quotas? and not total_project_quotas.network then <NoNetworkProjectWarning upgrade_type='network' upgrades_you_can_use={upgrades_you_can_use} upgrades_you_applied_to_all_projects={upgrades_you_applied_to_all_projects} /> }
            {if @props.project.get('deleted') then <DeletedProjectWarning />}
            <h1 style={marginTop:"0px"}><Icon name='wrench' /> Settings and configuration</h1>
            <Row>
                <Col sm=6>
                    <TitleDescriptionPanel
                        project_id    = {id}
                        project_title = {@props.project.get('title') ? ''}
                        description   = {@props.project.get('description') ? ''}
                        actions       = {@actions('projects')} />
                    <UsagePanel
                        project_id                           = {id}
                        project                              = {@props.project}
                        actions                              = {@actions('projects')}
                        user_map                             = {@props.user_map}
                        account_groups                       = {@props.groups}
                        upgrades_you_can_use                 = {upgrades_you_can_use}
                        upgrades_you_applied_to_all_projects = {upgrades_you_applied_to_all_projects}
                        upgrades_you_applied_to_this_project = {upgrades_you_applied_to_this_project}
                        total_project_quotas                 = {total_project_quotas}
                        all_upgrades_to_this_project         = {all_upgrades_to_this_project} />

                    <HideDeletePanel key='hidedelete' project={@props.project} />
                    {<SSHPanel key='ssh-keys' project={@props.project} user_map={@props.user_map} account_id={@props.account_id} /> if @props.kucalc == 'yes'}

                </Col>
                <Col sm=6>
                    <CollaboratorsPanel  project={@props.project} user_map={@props.user_map} />
                    <ProjectControlPanel key='control' project={@props.project} allow_ssh={@props.kucalc != 'yes'} />
                    <SageWorksheetPanel  key='worksheet' project={@props.project} />
                    <JupyterServerPanel  key='jupyter' project_id={@props.project_id} />
                </Col>
            </Row>
        </div>

exports.ProjectSettings = rclass ({name}) ->
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
        @_table = webapp_client.sync_table({projects_admin : query})
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
