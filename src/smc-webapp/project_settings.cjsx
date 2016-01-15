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

immutable  = require('immutable')
underscore = require('underscore')
async      = require('async')

{salvus_client} = require('./salvus_client')
{project_page}  = require('./project')
misc = require('smc-util/misc')
{required, defaults} = misc
{html_to_text} = require('./misc_page')
{alert_message} = require('./alerts')

{Alert, Panel, Col, Row, Button, ButtonGroup, ButtonToolbar, Input, Well} = require('react-bootstrap')
{ErrorDisplay, MessageDisplay, Icon, LabeledRow, Loading, MarkdownInput, ProjectState, SearchInput, TextInput,
 NumberInput, DeletedProjectWarning, NonMemberProjectWarning, NoNetworkProjectWarning, Space, Tip} = require('./r_misc')
{React, ReactDOM, Actions, Store, Table, redux, rtypes, rclass, Redux}  = require('./smc-react')
{User} = require('./users')

{HelpEmailLink} = require('./customize')

URLBox = rclass
    displayName : 'URLBox'

    render : ->
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

    render_header : ->
        <h3><Icon name={@props.icon} /> {@props.title}</h3>

    render : ->
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

    render : ->
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
                    rows      = 4
                    text      = {@props.description}
                    on_change = {(desc)=>@props.actions.set_project_description(@props.project_id, desc)}
                />
            </LabeledRow>
        </ProjectSettingsPanel>

exports.NoUpgrades = NoUpgrades = rclass
    displayName : 'NoUpgrades'

    propTypes :
        cancel : rtypes.func.isRequired

    billing : (e) ->
        e.preventDefault()
        require('./billing').visit_billing_page()

    render : ->
        <Alert bsStyle='info'>
            <h3><Icon name='exclamation-triangle' /> Your account has no upgrades available</h3>
            <p>You can purchase upgrades starting at $7 / month.</p>
            <p><a href='' onClick={@billing}>Visit the billing page...</a></p>
            <Button onClick={@props.cancel}>Cancel</Button>
        </Alert>

UpgradeAdjustor = rclass
    displayName : 'UpgradeAdjustor'

    propTypes :
        project_id                           : rtypes.string.isRequired
        upgrades_you_can_use                 : rtypes.object
        upgrades_you_applied_to_all_projects : rtypes.object
        upgrades_you_applied_to_this_project : rtypes.object
        quota_params                         : rtypes.object.isRequired # from the schema
        actions                              : rtypes.object.isRequired # projects actions

    getDefaultProps : ->
        upgrades_you_can_use                 : {}
        upgrades_you_applied_to_all_projects : {}
        upgrades_you_applied_to_this_project : {}

    getInitialState : ->
        state =
            upgrading : false

        current = @props.upgrades_you_applied_to_this_project

        for name, data of @props.quota_params
            factor = data.display_factor
            current_value = current[name] ? 0
            state["upgrade_#{name}"] = misc.round1(current_value * factor)

        return state

    show_upgrade_quotas : ->
        @setState(upgrading : true)

    cancel_upgrading : ->
        state =
            upgrading : false

        current = @props.upgrades_you_applied_to_this_project

        for name, data of @props.quota_params
            factor = data.display_factor
            current_value = current[name] ? 0
            state["upgrade_#{name}"] = misc.round1(current_value * factor)

        @setState(state)


    # returns 'error' if the input is invalid or higher than max
    upgrade_input_validation_state : (input, max) ->
        val = misc.parse_number_input(input)
        if not val? or val > max
            return 'error'

    # the max button will set the upgrade input box to the number given as max
    render_max_button : (name, max) ->
        <Button
            bsSize  = 'xsmall'
            onClick = {=>@setState("upgrade_#{name}" : max)}
            style   = {padding:'0px 5px'}
        >
            Max
        </Button>

    render_upgrade_row : (name, data, remaining=0, current=0, limit=0) ->
        if not data?
            return

        {display, desc, display_factor, display_unit, input_type} = data

        if input_type == 'checkbox'

            # the remaining count should decrease if box is checked
            show_remaining = remaining + current - @state["upgrade_#{name}"]
            show_remaining = Math.max(show_remaining, 0)

            <Row key={name}>
                <Col sm=6>
                    <Tip title={display} tip={desc}>
                        <strong>{display}</strong><Space/>
                    </Tip>
                    ({show_remaining} {misc.plural(show_remaining, display_unit)} remaining)
                </Col>
                <Col sm=6>
                    <form>
                        <Input
                            ref      = {"upgrade_#{name}"}
                            type     = 'checkbox'
                            checked  = {@state["upgrade_#{name}"] > 0}
                            style    = {marginLeft : 0, position : 'inherit'}
                            onChange = {=>@setState("upgrade_#{name}" : if @refs["upgrade_#{name}"].getChecked() then 1 else 0)}
                            />
                    </form>
                </Col>
            </Row>


        else if input_type == 'number'
            remaining = misc.round1(remaining * display_factor)
            current = misc.round1(current * display_factor) # current already applied
            limit = misc.round1(limit * display_factor)
            current_input = misc.parse_number_input(@state["upgrade_#{name}"]) ? 0 # current typed in

            # the amount displayed remaining subtracts off the amount you type in
            show_remaining = misc.round1(remaining + current - current_input)

            <Row key={name}>
                <Col sm=6>
                    <Tip title={display} tip={desc}>
                        <strong>{display}</strong><Space/>
                    </Tip>
                    ({Math.max(show_remaining, 0)} {misc.plural(show_remaining, display_unit)} remaining)
                </Col>
                <Col sm=6>
                    <Input
                        ref        = {"upgrade_#{name}"}
                        type       = 'text'
                        value      = {@state["upgrade_#{name}"]}
                        bsStyle    = {@upgrade_input_validation_state(@state["upgrade_#{name}"], limit)}
                        onChange   = {=>@setState("upgrade_#{name}" : @refs["upgrade_#{name}"].getValue())}
                        addonAfter = {<div style={minWidth:'81px'}>{"#{misc.plural(2,display_unit)}"} {@render_max_button(name, limit)}</div>}
                    />
                </Col>
            </Row>
        else
            console.warn('Invalid input type in render_upgrade_row: ', input_type)
            return

    save_upgrade_quotas : (remaining) ->
        current = @props.upgrades_you_applied_to_this_project
        new_upgrade_quotas = {}
        new_upgrade_state  = {}
        for name, data of @props.quota_params
            factor = data.display_factor
            current_val = misc.round1((current[name] ? 0) * factor)
            remaining_val = Math.max(misc.round1((remaining[name] ? 0) * factor), 0) # everything is now in display units

            if data.input_type is 'checkbox'
                input = @state["upgrade_#{name}"] ? current_val
                if input and (remaining_val > 0 or current_val > 0)
                    val = 1
                else
                    val = 0

            else
                # parse the current user input, and default to the current value if it is (somehow) invalid
                input = misc.parse_number_input(@state["upgrade_#{name}"]) ? current_val
                input = Math.max(input, 0)
                limit = current_val + remaining_val
                val = Math.min(input, limit)

            new_upgrade_state["upgrade_#{name}"] = val
            new_upgrade_quotas[name] = misc.round1(val / factor) # only now go back to internal units

        @props.actions.apply_upgrades_to_project(@props.project_id, new_upgrade_quotas)

        # set the state so that the numbers are right if you click upgrade again
        @setState(new_upgrade_state)
        @setState(upgrading : false)

    # Returns true if the inputs are valid, i.e.
    #    - at least one has changed
    #    - none are negative
    #    - none are empty
    #    - none are higher than their limit
    valid_upgrade_inputs : (current, limits) ->
        for name, data of @props.quota_params
            factor = data.display_factor

            # the highest number the user is allowed to type
            limit = misc.round1((limits[name] ? 0) * factor)

            # the current amount applied to the project
            cur_val = misc.round1((current[name] ? 0) * factor)

            # the current number the user has typed (undefined if invalid)
            new_val = misc.parse_number_input(@state["upgrade_#{name}"])
            if not new_val? or new_val > limit
                return false
            if cur_val isnt new_val
                changed = true
        return changed

    render_upgrades_adjustor : ->
        if misc.is_zero_map(@props.upgrades_you_can_use)
            # user has no upgrades on their account
            <NoUpgrades cancel={@cancel_upgrading} />
        else
            # NOTE : all units are currently 'internal' instead of display, e.g. seconds instead of hours

            # how much upgrade you have used between all projects
            used_upgrades = @props.upgrades_you_applied_to_all_projects

            # how much upgrade you currently use on this one project
            current = @props.upgrades_you_applied_to_this_project

            # how much unused upgrade you have remaining
            remaining = misc.map_diff(@props.upgrades_you_can_use, used_upgrades)

            # maximums you can use, including the upgrades already on this project
            limits = misc.map_sum(current, remaining)

            <Alert bsStyle='info'>
                <h3><Icon name='arrow-circle-up' /> Adjust your project quota contributions</h3>

                <span style={color:"#666"}>Adjust <i>your</i> contributions to the quotas on this project (disk space, memory, cores, etc.).  The total quotas for this project are the sum of the contributions of all collaborators and the free base quotas.</span>
                <hr/>
                <Row>
                    <Col md=6>
                        <b style={fontSize:'12pt'}>Quota</b>
                    </Col>
                    <Col md=6>
                        <b style={fontSize:'12pt'}>Your contribution</b>
                    </Col>
                </Row>
                <hr/>

                {@render_upgrade_row(n, data, remaining[n], current[n], limits[n]) for n, data of @props.quota_params}

                <ButtonToolbar>
                    <Button
                        bsStyle  = 'primary'
                        onClick  = {=>@save_upgrade_quotas(remaining)}
                        disabled = {not @valid_upgrade_inputs(current, limits)}
                    >
                        <Icon name='arrow-circle-up' /> Submit changes
                    </Button>
                    <Button onClick={@cancel_upgrading}>
                        Cancel
                    </Button>
                </ButtonToolbar>
            </Alert>

    render_upgrades_button : ->
        <Row>
            <Col sm=12>
                <Button bsStyle='primary' onClick={@show_upgrade_quotas} style={float: 'right', marginBottom : '5px'}>
                    <Icon name='arrow-circle-up' /> Adjust your quotas...
                </Button>
            </Col>
        </Row>

    render : ->
        if not @state.upgrading
            @render_upgrades_button()
        else
            @render_upgrades_adjustor()

QuotaConsole = rclass
    displayName : 'ProjectSettings-QuotaConsole'

    propTypes :
        project_id                   : rtypes.string.isRequired
        project_settings             : rtypes.object            # settings contains the base values for quotas
        project_status               : rtypes.object
        user_map                     : rtypes.object.isRequired
        quota_params                 : rtypes.object.isRequired # from the schema
        account_groups               : rtypes.array.isRequired
        total_project_quotas         : rtypes.object            # undefined if viewing as admin
        all_upgrades_to_this_project : rtypes.object

    getDefaultProps : ->
        all_upgrades_to_this_project : {}

    getInitialState : ->
        state =
            editing   : false # admin is currently editing
            upgrading : false # user is currently upgrading
        settings = @props.project_settings
        if settings?
            for name, data of @props.quota_params
                factor = data.display_factor
                base_value = settings.get(name) ? 0
                state[name] = misc.round1(base_value * factor)

        return state

    componentWillReceiveProps : (next_props) ->
        settings = next_props.project_settings
        if not immutable.is(@props.project_settings, settings)
            if settings?
                new_state = {}
                for name, data of @props.quota_params
                    new_state[name] = misc.round1(settings.get(name) * data.display_factor)
                @setState(new_state)

    render_quota_row : (quota, base_value=0, upgrades, params_data) ->
        factor = params_data.display_factor
        unit   = params_data.display_unit

        if upgrades?
            upgrade_list = []
            for id, val of upgrades
                amount = misc.round1(val * factor)
                li =
                    <li key={id}>
                        {amount} {misc.plural(amount, unit)} given by <User account_id={id} user_map={@props.user_map} />
                    </li>
                upgrade_list.push(li)

        amount = misc.round1(base_value * factor)

        <LabeledRow label={<Tip title={params_data.display} tip={params_data.desc}>{params_data.display}</Tip>} key={params_data.display}>
            {if @state.editing then quota.edit else quota.view}
            <ul style={color:'#666'}>
                <li>{amount} {misc.plural(amount, unit)} given by free project</li>
                {upgrade_list}
            </ul>
        </LabeledRow>

    start_admin_editing : ->
        @setState(editing: true)

    save_admin_editing : ->
        salvus_client.project_set_quotas
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

    cancel_admin_editing : ->
        settings = @props.project_settings
        if settings?
            # reset user input states
            state = {}
            for name, data of @props.quota_params
                factor = data.display_factor
                base_value = settings.get(name) ? 0
                state[name] = misc.round1(base_value * factor)
            @setState(state)
        @setState(editing : false)

    # Returns true if the admin inputs are valid, i.e.
    #    - at least one has changed
    #    - none are negative
    #    - none are empty
    valid_admin_inputs : ->
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

    render_admin_edit_buttons : ->
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

    admin_input_validation_styles : (input) ->
        if not misc.parse_number_input(input)?
            style =
                outline     : 'none'
                borderColor : 'red'
                boxShadow   : '0 0 10px red'
        return style

    render_input : (label) ->
        if label is 'network' or label is 'member_host'
            <Input
                type     = 'checkbox'
                ref      = {label}
                checked  = {@state[label]}
                style    = {marginLeft:0}
                onChange = {=>@setState("#{label}" : if @refs[label].getChecked() then 1 else 0)} />
        else
            # not using react component so the input stays inline
            <input
                size     = 5
                type     = 'text'
                ref      = {label}
                value    = {@state[label]}
                style    = {@admin_input_validation_styles(@state[label])}
                onChange = {(e)=>@setState("#{label}":e.target.value)} />

    render : ->
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

        quotas =
            disk_quota  :
                view : <span><b>{total_quotas['disk_quota'] * quota_params['disk_quota'].display_factor} MB</b> disk space available - <b>{disk} MB</b> used</span>
                edit : <span><b>{@render_input('disk_quota')} MB</b> disk space available - <b>{disk} MB</b> used</span>
            memory      :
                view : <span><b>{total_quotas['memory'] * quota_params['memory'].display_factor} MB</b> RAM memory available - <b>{memory} MB</b> used</span>
                edit : <span><b>{@render_input('memory')} MB</b> RAM memory available - <b>{memory} MB</b> used</span>
            cores       :
                view : <b>{total_quotas['cores'] * quota_params['cores'].display_factor} {misc.plural(total_quotas['cores'] * quota_params['cores'].display_factor, 'core')}</b>
                edit : <b>{@render_input('cores')} cores</b>
            cpu_shares  :
                view : <b>{total_quotas['cpu_shares'] * quota_params['cpu_shares'].display_factor} {misc.plural(total_quotas['cpu_shares'] * quota_params['cpu_shares'].display_factor, 'share')}</b>
                edit : <b>{@render_input('cpu_shares')} {misc.plural(total_quotas['cpu_shares'], 'share')}</b>
            mintime     :
                view : <span><b>{misc.round1(total_quotas['mintime'] * quota_params['mintime'].display_factor)} {misc.plural(total_quotas['mintime'] * quota_params['mintime'].display_factor, 'hour')}</b> of non-interactive use before project stops</span>
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
            {@render_quota_row(quota, settings.get(name), upgrades[name], quota_params[name]) for name, quota of quotas}
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

    render : ->
        <ProjectSettingsPanel title='Project usage and quotas' icon='dashboard'>
            <UpgradeAdjustor
                project_id                           = {@props.project_id}
                upgrades_you_can_use                 = {@props.upgrades_you_can_use}
                upgrades_you_applied_to_all_projects = {@props.upgrades_you_applied_to_all_projects}
                upgrades_you_applied_to_this_project = {@props.upgrades_you_applied_to_this_project}
                quota_params                         = {require('smc-util/schema').PROJECT_UPGRADES.params}
                actions                              = {@props.actions} />
            <QuotaConsole
                project_id                   = {@props.project_id}
                project_settings             = {@props.project.get('settings')}
                project_status               = {@props.project.get('status')}
                user_map                     = {@props.user_map}
                quota_params                 = {require('smc-util/schema').PROJECT_UPGRADES.params}
                account_groups               = {@props.account_groups}
                total_project_quotas         = {@props.total_project_quotas}
                all_upgrades_to_this_project = {@props.all_upgrades_to_this_project}
                actions                      = {@props.actions} />
            <hr />
            <span style={color:'#666'}>Email <HelpEmailLink /> if
                you have any questions about upgrading a project.
                Include the following in your email:
                <URLBox />
            </span>
        </ProjectSettingsPanel>

SharePanel = rclass
    displayName : 'ProjectSettings-SharePanel'

    propTypes :
        project      : rtypes.object.isRequired
        public_paths : rtypes.object.isRequired
        redux        : rtypes.object.isRequired
        desc         : rtypes.string.isRequired

    getInitialState : ->
        state : 'view'    # view --> edit --> view
        desc  : @props.desc

    componentWillReceiveProps : (nextProps) ->
        if @state.desc isnt nextProps.desc
            @setState
                desc  : nextProps.desc
                state : 'view'

    cancel : ->
        @setState(state : 'view')

    save : ->
        actions = @props.redux.getProjectActions(@props.project.get('project_id'))
        actions.set_public_path('', @refs.share_project.getValue())
        @setState(state : 'view')

    render_share_cancel_buttons : ->
        <ButtonToolbar style={paddingBottom:'5px'}>
            <Button bsStyle='primary' onClick={@save}>
                <Icon name='share-square-o' /> Share
            </Button>
            <Button onClick={@cancel}>Cancel</Button>
        </ButtonToolbar>

    render_update_desc_button : ->
        <ButtonToolbar style={paddingBottom:'5px'}>
            <Button bsStyle='primary' onClick={@save} disabled={@state.desc == @props.desc} >
                <Icon name='share-square-o' /> Change description
            </Button>
        </ButtonToolbar>

    render_share : (shared) ->
        if @state.state == 'edit' or shared
            <form onSubmit={(e)=>e.preventDefault(); @save()}>
                <Input
                    ref         = 'share_project'
                    type        = 'text'
                    value       = {@state.desc}
                    onChange    = {=>@setState(desc : @refs.share_project.getValue())}
                    placeholder = 'Give a description...' />
                {@render_share_cancel_buttons() if @state.state == 'edit'}
                {@render_update_desc_button() if shared}
            </form>

    toggle_share : (shared) ->
        actions = @props.redux.getProjectActions(@props.project.get('project_id'))
        if shared
            actions.disable_public_path('')
        else
            @setState(state : 'edit')

    render_share_unshare_button : (shared) ->
        <Button
            bsStyle = {if shared then 'warning' else 'primary'}
            onClick = {=>@toggle_share(shared)}
            style   = {float: 'right', marginBottom:'10px'} >
            <Icon name={if shared then 'shield' else 'share-square-o'} /> {if shared then 'Unshare' else 'Share'} Project...
        </Button>

    render : ->
        if not @props.public_paths?
            return <Loading />
        project_id = @props.project.get('project_id')
        project_store = @props.redux.getProjectStore(project_id)
        id = project_store.get_public_path_id('')
        shared = @props.public_paths.get(id)? and not @props.public_paths.getIn([id, 'disabled'])
        if shared
            share_message = "This project is publicly shared, so anyone can see it."
        else
            share_message = "Share this project publicly. You can also share individual files or folders from the file listing."
        <ProjectSettingsPanel title='Project sharing' icon='share'>
            <Row>
                <Col sm=8>
                    {share_message}
                </Col>
                <Col sm=4>
                    {@render_share_unshare_button(shared) if @state.state == 'view'}
                </Col>
            </Row>
            <Row>
                <Col sm=12>
                    {@render_share(shared)}
                </Col>
            </Row>
        </ProjectSettingsPanel>

HideDeletePanel = rclass
    displayName : 'ProjectSettings-HideDeletePanel'

    propTypes :
        project : rtypes.object.isRequired
        redux   : rtypes.object.isRequired

    toggle_delete_project : ->
        @props.redux.getActions('projects').toggle_delete_project(@props.project.get('project_id'))

    toggle_hide_project : ->
        @props.redux.getActions('projects').toggle_hide_project(@props.project.get('project_id'))

    delete_message : ->
        if @props.project.get('deleted')
            <DeletedProjectWarning/>
        else
            <span>Delete this project for everyone. You can undo this.</span>

    hide_message : ->
        user = @props.project.getIn(['users', salvus_client.account_id])
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

    render : ->
        user = @props.project.getIn(['users', salvus_client.account_id])
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
                    <Button bsStyle='danger' onClick={@toggle_delete_project} style={float: 'right'}>
                        <Icon name='trash' /> {if @props.project.get('deleted') then 'Undelete Project' else 'Delete Project'}
                    </Button>
                </Col>
            </Row>
        </ProjectSettingsPanel>

SageWorksheetPanel = rclass
    displayName : 'ProjectSettings-SageWorksheetPanel'

    getInitialState : ->
        loading : false
        message : ''

    propTypes :
        project : rtypes.object.isRequired
        redux   : rtypes.object.isRequired

    restart_worksheet : ->
        @setState(loading : true)
        salvus_client.exec
            project_id : @props.project.get('project_id')
            command    : 'smc-sage-server stop; smc-sage-server start'
            timeout    : 30
            cb         : (err, output) =>
                @setState(loading : false)
                if err
                    @setState(message:'Error trying to restart worksheet server. Try restarting the project server instead.')
                else
                    @setState(message:'Worksheet server restarted. Restarted worksheets will use a new Sage session.')

    render_message : ->
        if @state.message
            <MessageDisplay message={@state.message} onClose={=>@setState(message:'')} />

    render : ->
        <ProjectSettingsPanel title='Sage worksheet server' icon='refresh'>
            <Row>
                <Col sm=8>
                    Restart this Sage Worksheet server. <br />
                    <span style={color: '#666'}>
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

ProjectControlPanel = rclass
    displayName : 'ProjectSettings-ProjectControlPanel'

    getInitialState : ->
        restart  : false
        show_ssh : false

    propTypes :
        project : rtypes.object.isRequired
        redux   : rtypes.object.isRequired

    open_authorized_keys : (e) ->
        e.preventDefault()
        project = project_page(@props.project.get('project_id'))
        async.series([
            (cb) =>
                project.ensure_directory_exists
                    path : '.ssh'
                    cb   : cb
            (cb) =>
                project.open_file
                    path       : '.ssh/authorized_keys'
                    foreground : true
                cb()
        ])

    ssh_notice : ->
        project_id = @props.project.get('project_id')
        host = @props.project.get('host')?.get('host')
        if host?
            if @state.show_ssh
                <div>
                    SSH into your project: <span style={color:'#666'}>First add your public key to <a onClick={@open_authorized_keys} href=''>~/.ssh/authorized_keys</a>, then use the following username@host:</span>
                    {# WARNING: previous use of <Input> here completely breaks copy on Firefox.}
                    <pre>{"#{misc.replace_all(project_id, '-', '')}@#{host}.sagemath.com"} </pre>
                </div>
            else
                <Row>
                    <Col sm=12>
                        <Button bsStyle='info' onClick={=>@setState(show_ssh : true)} style={float:'right'}>
                            <Icon name='terminal' /> SSH into your project...
                        </Button>
                    </Col>
                </Row>

    render_state : ->
        <span style={fontSize : '12pt', color: '#666'}>
            <ProjectState state={@props.project.get('state')?.get('state')} />
        </span>

    restart_project : ->
        @props.redux.getActions('projects').restart_project(@props.project.get('project_id'))

    save_project : ->
        @props.redux.getActions('projects').save_project(@props.project.get('project_id'))

    stop_project : ->
        @props.redux.getActions('projects').stop_project(@props.project.get('project_id'))

    render_confirm_restart : ->
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

    render_action_buttons : ->
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
            <Button bsStyle='success' disabled={'save' not in commands} onClick={(e)=>e.preventDefault(); @save_project()}>
                <Icon name={COMPUTE_STATES.saving.icon} /> Save
            </Button>
        </ButtonToolbar>

    render : ->
        <ProjectSettingsPanel title='Project control' icon='gears'>
            <LabeledRow key='state' label='State'>
                {@render_state()}
            </LabeledRow>
            <LabeledRow key='action' label='Actions'>
                {@render_action_buttons()}
            </LabeledRow>
            {@render_confirm_restart()}
            <LabeledRow key='project_id' label='Project id'>
                <pre>{@props.project.get('project_id')}</pre>
            </LabeledRow>
            <LabeledRow key='host' label='Host'>
                <pre>{@props.project.get('host')?.get('host')}.sagemath.com</pre>
            </LabeledRow>
            If your project is not working, email <HelpEmailLink/>, and include the following URL:
            <URLBox />
            <hr />
            {@ssh_notice()}
        </ProjectSettingsPanel>

CollaboratorsSearch = rclass
    displayName : 'ProjectSettings-CollaboratorsSearch'

    propTypes :
        project : rtypes.object.isRequired
        redux   : rtypes.object.isRequired

    getInitialState : ->
        search     : ''          # search that user has typed in so far
        select     : undefined   # list of results for doing the search -- turned into a selector
        searching  : false       # currently carrying out a search
        err        : ''          # display an error in case something went wrong doing a search
        email_to   : ''          # if set, adding user via email to this address
        email_body : ''          # with this body.

    reset : ->
        @setState(@getInitialState())

    do_search : (search) ->
        search = search.trim()
        @setState(search: search)  # this gets used in write_email_invite, and whether to render the selection list.
        if @state.searching
             # already searching
             return
        if search.length == 0
             @setState(err:undefined, select:undefined)
             return
        @setState(searching:true)
        salvus_client.user_search
            query : search
            limit : 50
            cb    : (err, select) =>
                @setState(searching:false, err:err, select:select)

    render_options : (select) ->
        for r in select
            name = r.first_name + ' ' + r.last_name
            <option key={r.account_id} value={r.account_id} label={name}>{name}</option>

    invite_collaborator : (account_id) ->
        @props.redux.getActions('projects').invite_collaborator(@props.project.get('project_id'), account_id)

    add_selected : ->
        @reset()
        for account_id in @refs.select.getSelectedOptions()
            @invite_collaborator(account_id)

    write_email_invite : ->
        name = @props.redux.getStore('account').get_fullname()
        project_id = @props.project.get('project_id')
        title = @props.project.get('title')
        host = window.location.hostname
        target = "[project '#{title}'](https://#{host}/projects/#{project_id})"
        body = "Hello!\n\nPlease collaborate with me using [SageMathCloud](https://#{host}) on #{target}.  \n\nBest wishes,\n\n#{name}"
        @setState(email_to: @state.search, email_body: body)

    send_email_invite : ->
        subject = "SageMathCloud Invitation to #{@props.project.get('title')}"
        @props.redux.getActions('projects').invite_collaborators_by_email(@props.project.get('project_id'),
                                                                         @state.email_to,
                                                                         @state.email_body,
                                                                         subject)
        @setState(email_to:'',email_body:'')

    render_send_email : ->
        if not @state.email_to
            return
        <div>
            <hr />
            <Well>
                Enter one or more email addresses separated by commas:
                <Input
                    autoFocus
                    type     = 'text'
                    value    = {@state.email_to}
                    ref      = 'email_to'
                    onChange = {=>@setState(email_to:@refs.email_to.getValue())}
                    />
                <div style={border:'1px solid lightgrey', padding: '10px', borderRadius: '5px', backgroundColor: 'white', marginBottom: '15px'}>
                    <MarkdownInput
                        default_value = {@state.email_body}
                        rows          = 8
                        on_save       = {(value)=>@setState(email_body:value, email_body_editing:false)}
                        on_cancel     = {(value)=>@setState(email_body_editing:false)}
                        on_edit       = {=>@setState(email_body_editing:true)}
                        />
                </div>
                <ButtonToolbar>
                    <Button bsStyle='primary' onClick={@send_email_invite} disabled={!!@state.email_body_editing}>Send Invitation</Button>
                    <Button onClick={=>@setState(email_to:'',email_body:'', email_body_editing:false)}>Cancel</Button>
                </ButtonToolbar>
            </Well>
        </div>

    render_search : ->
        if @state.search and (@state.searching or @state.select)
            <div style={marginBottom:'10px'}>Search for '{@state.search}'</div>

    render_select_list : ->
        if @state.searching
            return <Loading />
        if @state.err
            return <ErrorDisplay error={@state.err} onClose={=>@setState(err:'')} />
        if not @state.select? or not @state.search.trim()
            return
        select = (r for r in @state.select when not @props.project.get('users').get(r.account_id)?)
        if select.length == 0
            <Button style={marginBottom:'10px'} onClick={@write_email_invite}>
                <Icon name='envelope' /> No matches. Send email invitation...
            </Button>
        else
            <div>
                <Input type='select' multiple ref='select'>
                    {@render_options(select)}
                </Input>
                <Button onClick={@add_selected}><Icon name='user-plus' /> Add selected</Button>
            </div>

    render : ->
        <div>
            <LabeledRow label='Add collaborators'>
                <SearchInput
                    on_submit       = {@do_search}
                    default_value   = {@state.search}
                    placeholder     = 'Search by name or email address...'
                    on_change       = {(value) => @setState(select:undefined)}
                    on_escape       = {@reset}
                    clear_on_submit = {true}
                />
            </LabeledRow>
            {@render_search()}
            {@render_select_list()}
            {@render_send_email()}
        </div>

exports.CollaboratorsList = CollaboratorsList = rclass
    displayName : 'ProjectSettings-CollaboratorsList'

    propTypes :
        redux    : rtypes.object.isRequired
        project  : rtypes.object.isRequired
        user_map : rtypes.object

    getInitialState : ->
        removing : undefined  # id's of account that we are currently confirming to remove

    remove_collaborator : (account_id) ->
        if account_id == @props.redux.getStore('account').get_account_id()
            @props.redux.getActions('projects').close_project(@props.project.get('project_id'))
        @props.redux.getActions('projects').remove_collaborator(@props.project.get('project_id'), account_id)
        @setState(removing:undefined)

    render_user_remove_confirm : (account_id) ->
        if account_id == @props.redux.getStore('account').get_account_id()
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

    user_remove_button : (account_id, group) ->
        <Button
            disabled = {group is 'owner'}
            style    = {marginBottom: '6px', float: 'right'}
            onClick  = {=>@setState(removing:account_id)}
        >
            <Icon name='user-times' /> Remove...
        </Button>

    render_user : (user) ->
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

    render_users : ->
        u = @props.project.get('users')
        if u
            users = ({account_id:account_id, group:x.group} for account_id, x of u.toJS())
            for user in @props.redux.getStore('projects').sort_by_activity(users, @props.project.get('project_id'))
                @render_user(user)

    render : ->
        <Well style={maxHeight: '20em', overflowY: 'auto', overflowX: 'hidden'}>
            {@render_users()}
        </Well>

CollaboratorsPanel = rclass
    displayName : 'ProjectSettings-CollaboratorsPanel'

    propTypes :
        project  : rtypes.object.isRequired
        user_map : rtypes.object
        redux    : rtypes.object.isRequired

    render : ->
        <ProjectSettingsPanel title='Collaborators' icon='user'>
            <div key='mesg'>
                <span style={color:'#666'}>
                    Collaborators can <b>modify anything</b> in this project, except backups.
                    They can add and remove other collaborators, but cannot remove owners.
                </span>
            </div>
            <hr />
            <CollaboratorsSearch key='search' project={@props.project} redux={@props.redux} />
            {<hr /> if @props.project.get('users')?.size > 1}
            <CollaboratorsList key='list' project={@props.project} user_map={@props.user_map} redux={@props.redux} />
        </ProjectSettingsPanel>

ProjectSettings = rclass
    displayName : 'ProjectSettings-ProjectSettings'

    propTypes :
        project_id   : rtypes.string.isRequired
        project      : rtypes.object.isRequired
        user_map     : rtypes.object.isRequired
        redux        : rtypes.object.isRequired
        public_paths : rtypes.object.isRequired

    shouldComponentUpdate : (nextProps) ->
        return @props.project != nextProps.project or @props.user_map != nextProps.user_map

    render : ->
        # get the description of the share, in case the project is being shared
        store = @props.redux.getProjectStore(@props.project.get('project_id'))
        share_desc = @props.public_paths.get(store.get_public_path_id(''))?.get('description') ? ''
        id = @props.project_id

        upgrades_you_can_use                 = @props.redux.getStore('account').get_total_upgrades()
        all_projects                         = @props.redux.getStore('projects')

        course_info                          = all_projects.get_course_info(@props.project_id)
        upgrades_you_applied_to_all_projects = all_projects.get_total_upgrades_you_have_applied()
        upgrades_you_applied_to_this_project = all_projects.get_upgrades_you_applied_to_project(id)
        total_project_quotas                 = all_projects.get_total_project_quotas(id)  # only available for non-admin for now.
        all_upgrades_to_this_project         = all_projects.get_upgrades_to_project(id)

        <div>
            {if total_project_quotas? and not total_project_quotas.member_host then <NonMemberProjectWarning upgrades_you_can_use={upgrades_you_can_use} upgrades_you_applied_to_all_projects={upgrades_you_applied_to_all_projects} course_info={course_info} account_id={salvus_client.account_id}/>}
            {if total_project_quotas? and not total_project_quotas.network then <NoNetworkProjectWarning upgrades_you_can_use={upgrades_you_can_use} upgrades_you_applied_to_all_projects={upgrades_you_applied_to_all_projects} /> }
            {if @props.project.get('deleted') then <DeletedProjectWarning />}
            <h1><Icon name='wrench' /> Settings and configuration</h1>
            <Row>
                <Col sm=6>
                    <TitleDescriptionPanel
                        project_id    = {id}
                        project_title = {@props.project.get('title') ? ''}
                        description   = {@props.project.get('description') ? ''}
                        actions       = {@props.redux.getActions('projects')} />
                    <UsagePanel
                        project_id                           = {id}
                        project                              = {@props.project}
                        actions                              = {@props.redux.getActions('projects')}
                        user_map                             = {@props.user_map}
                        account_groups                       = {@props.redux.getStore('account').get('groups')?.toJS()}
                        upgrades_you_can_use                 = {upgrades_you_can_use}
                        upgrades_you_applied_to_all_projects = {upgrades_you_applied_to_all_projects}
                        upgrades_you_applied_to_this_project = {upgrades_you_applied_to_this_project}
                        total_project_quotas                 = {total_project_quotas}
                        all_upgrades_to_this_project         = {all_upgrades_to_this_project} />

                    <HideDeletePanel       key='hidedelete'    project={@props.project} redux={@props.redux} />
                </Col>
                <Col sm=6>
                    <ProjectControlPanel   key='control'       project={@props.project} redux={@props.redux} />
                    <CollaboratorsPanel  project={@props.project} redux={@props.redux} user_map={@props.user_map} />
                    <SageWorksheetPanel    key='worksheet'     project={@props.project} redux={@props.redux} />
                    {# TEMPORARILY DISABLED -- this very badly broken, due to hackish design involving componentWillReceiveProps above.}
                    {#<SharePanel            key='share'         project={@props.project} }
                        {#redux={@props.redux} public_paths={@props.public_paths} desc={share_desc} /> }
                </Col>
            </Row>
        </div>

ProjectController = (name) -> rclass
    displayName : 'ProjectSettings-ProjectController'

    reduxProps :
        projects :
            project_map : rtypes.immutable
        users :
            user_map    : rtypes.immutable
        account :
            # NOT used directly -- instead, the QuotaConsole component depends on this in that it calls something in the account store!
            stripe_customer : rtypes.immutable
        "#{name}" :
            public_paths : rtypes.immutable

    propTypes :
        project_id : rtypes.string.isRequired
        redux      : rtypes.object
        group      : rtypes.string

    getInitialState : ->
        admin_project : undefined  # used in case visitor to project is admin

    componentWillUnmount : ->
        delete @_admin_project
        @_table?.close()  # if admin, stop listening for changes

    init_admin_view : ->
        # try to load it directly for future use
        @_admin_project = 'loading'
        query = {}
        for k in misc.keys(require('smc-util/schema').SCHEMA.projects.user_query.get.fields)
            query[k] = if k == 'project_id' then @props.project_id else null
        @_table = salvus_client.sync_table({projects_admin : query})
        @_table.on 'change', =>
            @setState(admin_project : @_table.get(@props.project_id))

    render_admin_message : ->
        <Alert bsStyle='warning' style={margin:'10px'}>
            <h4><strong>Warning:</strong> you are editing the project settings as an <strong>administrator</strong>.</h4>
            <ul>
                <li> You are not a collaborator on this project, but can edit files, etc. </li>
                <li> You are an admin: actions will not be logged to the project log.</li>
            </ul>
        </Alert>

    render : ->
        if not @props.redux? or not @props.project_map? or not @props.user_map? or not @props.public_paths?
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
            <div>
                {@render_admin_message() if @state.admin_project?}
                <ProjectSettings
                    project_id   = {@props.project_id}
                    project      = {project}
                    user_map     = {@props.user_map}
                    redux        = {@props.redux}
                    public_paths = {@props.public_paths} />
            </div>

render = (project_id) ->
    project_store = redux.getProjectStore(project_id)
    # compute how user is related to this project once for all, so that
    # it stays constant while opening (e.g., stays admin)
    group = redux.getStore('projects').get_my_group(project_id)
    C = ProjectController(project_store.name)
    <Redux redux={redux}>
        <C project_id={project_id} redux={redux} group={group} />
    </Redux>

exports.create_page = (project_id, dom_node) ->
    #console.log("mount project_settings")
    ReactDOM.render(render(project_id), dom_node)

exports.unmount = (dom_node) ->
    ReactDOM.unmountComponentAtNode(dom_node)


# TODO: garbage collect/remove when project closed completely


###
Top Navbar button label
###

ProjectName = rclass
    displayName : 'ProjectName'

    reduxProps :
        projects :
            project_map           : rtypes.immutable
            public_project_titles : rtypes.immutable

    propTypes :
        project_id  : rtypes.string.isRequired
        redux       : rtypes.object

    render : ->
        title = @props.project_map?.getIn([@props.project_id, 'title'])
        if not title?
            title = @props.public_project_titles?.get(@props.project_id)
            if not title?
                # Ensure that at some point we'll have the title if possible (e.g., if public)
                @props.redux?.getActions('projects').fetch_public_project_title(@props.project_id)
                return <Loading />
        project_state = @props.project_map?.getIn([@props.project_id, 'state', 'state'])
        icon = require('smc-util/schema').COMPUTE_STATES[project_state]?.icon ? 'bullhorn'
        <span><Icon name={icon} style={fontSize:'20px'}/> {misc.trunc(title, 32)}</span>

render_top_navbar = (project_id) ->
    <Redux redux={redux} >
        <ProjectName project_id={project_id} redux={redux} />
    </Redux>

exports.init_top_navbar = (project_id) ->
    button = require('./top_navbar').top_navbar.pages[project_id]?.button
    button.find('.button-label').remove()
    elt = button.find('.smc-react-button')[0]
    ReactDOM.render(render_top_navbar(project_id), elt)
