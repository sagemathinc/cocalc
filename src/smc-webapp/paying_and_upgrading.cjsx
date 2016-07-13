{Button, Panel, Row, Col} = require('react-bootstrap')
{Icon, Space} = require('./r_misc')
misc = require('smc-util/misc')
{defaults, required} = misc
{Row, Col, Well, Button, ButtonGroup, ButtonToolbar, Grid, Input, Alert, DropdownButton, MenuItem} = require('react-bootstrap')
{ErrorDisplay, Icon, Loading, LoginLink, ProjectState, Saving, Space, TimeAgo, Tip, UPGRADE_ERROR_STYLE, Footer, r_join} = require('./r_misc')
{React, ReactDOM, Actions, Store, Table, redux, rtypes, rclass, Redux}  = require('./smc-react')
{User} = require('./users')
{BillingPageSimplifiedRedux} = require('./billing')
{UpgradeAdjustorForUncreatedProject} = require('./project_settings')

{PROJECT_UPGRADES} = require('smc-util/schema')

redux_name = (project_id) ->
    if project_id
        return "paying-and-upgrading-#{project_id}"
    return "paying-and-upgrading"

class PayingAndUpgradingActions extends Actions
    init: (@project_id) =>
        @setState(upgrading : true)

exports.init_redux = init_redux = (redux, project_id) ->
    name = redux_name(project_id)
    if redux.getActions(name)?
        return  # already initialized
    actions = redux.createActions(name, PayingAndUpgradingActions)
    actions.init(project_id)

    redux.createStore(name)

UpgradeProject = (name) -> rclass
    reduxProps:
        "#{name}" :
            upgrade_disk_quota : rtypes.number
        users :
            user_map : rtypes.immutable
        projects :
            project_map       : rtypes.immutable
            hidden            : rtypes.bool
            deleted           : rtypes.bool
            search            : rtypes.string
            selected_hashtags : rtypes.object
            show_all          : rtypes.bool
        billing :
            customer      : rtypes.object

    propTypes :
        project_id                           : rtypes.string
        upgrades_you_can_use                 : rtypes.object
        upgrades_you_applied_to_all_projects : rtypes.object
        quota_params                         : rtypes.object.isRequired # from the schema
        actions                              : rtypes.object.isRequired # projects actions

    getDefaultProps : ->
        upgrades_you_can_use                 : {}
        upgrades_you_applied_to_all_projects : {}
        upgrades_you_applied_to_this_project : {}

    componentWillReceiveProps : (nextProps) ->
        # https://facebook.github.io/react/docs/component-specs.html#updating-componentwillreceiveprops
        subs = @props.customer?.subscriptions?.total_count ? 0
        if subs > 0 and not @state["has_subbed"]
            @setState(has_subbed: true)

    getInitialState : ->
        newState = {upgrading : true}
        current = redux.getStore('projects').get_upgrades_you_applied_to_project(@props.project_id)
        for name, data of require('smc-util/schema').PROJECT_UPGRADES.params
            factor = data.display_factor
            current_value = if current? then current[name] ? 0 else 0
            newState["upgrade_#{name}"] = misc.round2(current_value * factor)
        return newState

    componentWillMount : ->
        @setState(@getInitialState())

    save_upgrade_quotas : ->
        # how much upgrade you have used between all projects
        used_upgrades = redux.getStore('projects').get_total_upgrades_you_have_applied()

        # how much unused upgrade you have remaining
        remaining = misc.map_diff(redux.getStore('account').get_total_upgrades(), used_upgrades)
        new_upgrade_quotas = {}
        new_upgrade_state  = {}
        for name, data of require('smc-util/schema').PROJECT_UPGRADES.params
            factor = data.display_factor
            remaining_val = Math.max(misc.round2((remaining[name] ? 0) * factor), 0) # everything is now in display units
            if data.input_type is 'checkbox'
                input = @state["upgrade_#{name}"] ? 0
                if input and (remaining_val > 0)
                    val = 1
                else
                    val = 0

            else
                # parse the current user input, and default to the current value if it is (somehow) invalid
                input = misc.parse_number_input(@state["upgrade_#{name}"]) ? 0
                input = Math.max(input, 0)
                limit = remaining_val
                val = Math.min(input, limit)

            new_upgrade_state["upgrade_#{name}"] = val
            new_upgrade_quotas[name] = misc.round2(val / factor) # only now go back to internal units

        redux.getActions('projects').apply_upgrades_to_project(@props.project_id, new_upgrade_quotas)

        # set the state so that the numbers are right if you click upgrade again
        @setState(new_upgrade_state)
        @setState(upgrading : false)

    get_quota_limits : ->
        # NOTE : all units are currently 'internal' instead of display, e.g. seconds instead of hours

        # how much upgrade you currently use on this one project
        current = @props.upgrades_you_applied_to_this_project
        # how much upgrade you have used between all projects
        used_upgrades = @props.upgrades_you_applied_to_all_projects
        # how much unused upgrade you have remaining
        remaining = misc.map_diff(@props.upgrades_you_can_use, used_upgrades)
        # maximums you can use, including the upgrades already on this project
        limits = misc.map_sum(current, remaining)
        # additionally, the limits are capped by the maximum per project
        maximum = require('smc-util/schema').PROJECT_UPGRADES.max_per_project
        ret =
            limits    : misc.map_limit(limits, maximum)
            remaining : remaining
            current   : current
        return ret

    getUpgraderState : (maximize = false) ->
        ###
        maximize==true means, that the quotas are set to the highest possible
                       this is limited by the available quotas AND the maximum per project
        ###
        state =
            upgrading : true

        limits = @get_quota_limits()
        console.log(JSON.stringify(limits))
        for name, data of @props.quota_params
            factor = data.display_factor
            if name == 'network' or name == 'member_host'
                limit = if limits.limits[name] > 0 then 1 else 0
                if maximize
                    current_value = limit ? limits.current[name]
                else
                    current_value = 0
            else
                if maximize
                    current_value = limits.limits[name] ? limits.current[name]
                else
                    current_value = 0
            state["upgrade_#{name}"] = misc.round2(current_value * factor)
            upgrades = {}
        return state

    max_upgrades : ->
        @setState(@getUpgraderState(true))

    reset_upgrades : ->
        @setState(@getUpgraderState(false))

    show_upgrade_quotas : ->
        @setState(upgrading : true)

    cancel_upgrading : ->
        state =
            upgrading : false

        current = @props.upgrades_you_applied_to_this_project

        for name, data of @props.quota_params
            factor = data.display_factor
            current_value = current[name] ? 0
            state["upgrade_#{name}"] = misc.round2(current_value * factor)

        @setState(state)

    is_upgrade_input_valid : (input, max) ->
        val = misc.parse_number_input(input, round_number=false)
        if not val? or val > Math.max(0, max)
            return false
        else
            return true

    # the max button will set the upgrade input box to the number given as max
    render_max_button : (name, max) ->
        <Button
            bsSize  = 'xsmall'
            onClick = {=>@setState("upgrade_#{name}" : max)}
            style   = {padding:'0px 5px'}
        >
            Max
        </Button>

    render_reset_button : (name) ->
        <Button
            bsSize  = 'xsmall'
            onClick = {=>@setState("upgrade_#{name}" : 0)}
            style   = {padding:'0px 5px'}
        >
            Reset
        </Button>

    render_addon : (misc, name, display_unit, limit, val, remaining) ->
        <div style={minWidth:'81px'}>{"#{misc.plural(2,display_unit)}"} {@render_max_button(name, limit) if remaining > 0}{@render_reset_button(name) if val > 0}</div>

    render_get_more_of_this_upgrade : (name) ->
        # Detrimine if user has subscription that has given upgrade. Like cores requires permium subscription
        <DropdownButton title='Get more of this upgrade by' bsSize='xsmall'>
            <MenuItem>Purchasing an additional subscription</MenuItem>
            <MenuItem>Downgrading other projects</MenuItem>
            <MenuItem>Resetting this upgrade type for all projects</MenuItem>
        </DropdownButton>

    render_upgrade_input : (name, val, bs_style, misc, display_unit, limit, remaining) ->
        <Input
            ref        = {"upgrade_#{name}"}
            type       = 'text'
            value      = {val}
            bsStyle    = {bs_style}
            onChange   = {=>@setState("upgrade_#{name}" : @refs["upgrade_#{name}"].getValue())}
            addonAfter = {@render_addon(misc, name, display_unit, limit, val, remaining)}
        />

    render_upgrade_checkbox : (name, val, label) ->
        <Input
            ref      = {"upgrade_#{name}"}
            type     = 'checkbox'
            checked  = {val > 0}
            label    = {label}
            onChange = {=>@setState("upgrade_#{name}" : if @refs["upgrade_#{name}"].getChecked() then 1 else 0)}
        />

    render_height_space : ->
        <div style={'height':'34px !important'}></div>

    render_upgrade_row : (name, data, remaining=0, current=0, limit=0) ->
        if not data?
            return

        {display, desc, display_factor, display_unit, input_type} = data

        if input_type == 'checkbox'

            # the remaining count should decrease if box is checked
            show_remaining = remaining + current - @state["upgrade_#{name}"]
            show_remaining = Math.max(show_remaining, 0)

            val = @state["upgrade_#{name}"]

            if not @is_upgrade_input_valid(val, limit)
                label = <div style=UPGRADE_ERROR_STYLE>Uncheck this: you do not have enough upgrades</div>
            else
                label = if val == 0 then 'Enable' else 'Enabled'

            <Row key={name}>
                <Col sm=6>
                    <Tip title={display} tip={desc}>
                        <strong>{display}</strong><Space/>
                    </Tip>
                    ({show_remaining} {misc.plural(show_remaining, display_unit)} remaining)
                    <Space /><Space />
                    {@render_get_more_of_this_upgrade(name)}
                </Col>
                <Col sm=6>
                    <form>
                        {if not (show_remaining == 0 and val == 0) then @render_upgrade_checkbox(name, val, label) else @render_height_space()}
                    </form>
                </Col>
            </Row>


        else if input_type == 'number'
            remaining = misc.round2(remaining * display_factor)
            display_current = current * display_factor # current already applied
            if current != 0 and misc.round2(display_current) != 0
                current = misc.round2(display_current)
            else
                current = display_current

            limit = misc.round2(limit * display_factor)
            current_input = misc.parse_number_input(@state["upgrade_#{name}"]) ? 0 # current typed in

            # the amount displayed remaining subtracts off the amount you type in
            show_remaining = misc.round2(remaining + current - current_input)

            val = @state["upgrade_#{name}"]
            if not @is_upgrade_input_valid(val, limit)
                bs_style = 'error'
                if misc.parse_number_input(val)?
                    label = <div style=UPGRADE_ERROR_STYLE>Reduce the above: you do not have enough upgrades</div>
                else
                    label = <div style=UPGRADE_ERROR_STYLE>Please enter a number</div>
            else
                label = <span></span>

            <Row key={name}>
                <Col sm=6>
                    <Tip title={display} tip={desc}>
                        <strong>{display}</strong><Space/>
                    </Tip>
                    ({Math.max(show_remaining, 0)} {misc.plural(show_remaining, display_unit)} remaining)
                    <Space /><Space />
                    {@render_get_more_of_this_upgrade(name)}
                </Col>
                <Col sm=6>
                    {if (show_remaining == 0 and val == 0) then @render_height_space() else @render_upgrade_input(name, val, bs_style, misc, display_unit, limit, show_remaining)}
                    {label}
                </Col>
            </Row>
        else
            console.warn('Invalid input type in render_upgrade_row: ', input_type)
            return

    # Returns true if the inputs are valid and different:
    #    - at least one has changed
    #    - none are negative
    #    - none are empty
    #    - none are higher than their limit
    valid_changed_upgrade_inputs : (current, limits) ->
        for name, data of @props.quota_params
            factor = data.display_factor

            # the highest number the user is allowed to type
            limit = Math.max(0, misc.round2((limits[name] ? 0) * factor))  # max since 0 is always allowed

            # the current amount applied to the project
            cur_val = misc.round2((current[name] ? 0) * factor)

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
            quota_params = @props.quota_params
            # how much upgrade you have used between all projects
            used_upgrades = @props.upgrades_you_applied_to_all_projects

            # how much upgrade you currently use on this one project
            current = @props.upgrades_you_applied_to_this_project
            # how much unused upgrade you have remaining
            remaining = misc.map_diff(@props.upgrades_you_can_use, used_upgrades)

            # maximums you can use, including the upgrades already on this project
            limits = misc.map_sum(current, remaining)
            ordered_fields = PROJECT_UPGRADES.field_order
            ordered_quota_params = {}
            for name in ordered_fields
                ordered_quota_params[name] = @props.quota_params[name]
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
                        <br/>
                        <Button
                            bsSize  = 'xsmall'
                            onClick = {=>@max_upgrades()}
                            style   = {padding:'0px 5px'}
                        >
                            Max all upgrades
                        </Button>
                        {' '}
                        <Button
                            bsSize  = 'xsmall'
                            onClick = {=>@reset_upgrades()}
                            style   = {padding:'0px 5px'}
                        >
                            Reset all upgrades
                        </Button>
                    </Col>
                </Row>
                <hr/>
                {@render_upgrade_row(n, quota_params[n], remaining[n], current[n], limits[n]) for n, data of ordered_quota_params}
            </Alert>


    render_upgrades_button : ->
        <Row>
            <Col sm=12>
                <Button bsStyle='primary' onClick={@show_upgrade_quotas} style={float: 'right', marginBottom : '5px'}>
                    <Icon name='arrow-circle-up' /> Adjust your quotas...
                </Button>
            </Col>
        </Row>

    apply_upgrades : ->

        @save_upgrade_quotas()
        @setState(upgrading: false)

    render_main : ->

        subs = @props.customer?.subscriptions?.total_count ? 0
        <div>
            {<div id="upgrade_before_creation"></div> if subs == 0}
            <BillingPageSimplifiedRedux redux={@redux} />
            {<div id="upgrade_before_creation"></div> if subs > 0}
            {@render_upgrades_adjustor() if subs > 0}
            <ButtonToolbar>
                <Button
                    bsStyle  = 'success'
                    onClick  = {@apply_upgrades} >
                    Apply the upgrades
                </Button>
                <Button
                    disabled = {@state.state is 'saving'}
                    onClick  = {@cancel_upgrading} >
                    {if @state.state is 'saving' then <Saving /> else 'Cancel'}
                </Button>
            </ButtonToolbar>
        </div>

    render : ->
        if @state['upgrading']
            @render_main()
        else
            <div></div>

render = (redux, project_id) ->
    name    = redux_name(project_id)
    actions = redux.getActions(name)
    UpgradeProject_connected = UpgradeProject(name)
    redux.getActions('billing')?.update_customer()

    <div>
        <Redux redux={redux}>
            <UpgradeProject_connected
                redux                                = {redux}
                project_id                           = {project_id}
                upgrades_you_can_use                 = {redux.getStore('account').get_total_upgrades()}
                upgrades_you_applied_to_all_projects = {redux.getStore('projects').get_total_upgrades_you_have_applied()}
                upgrades_you_applied_to_this_project = {redux.getStore('projects').get_upgrades_you_applied_to_project(project_id)}
                quota_params                         = {require('smc-util/schema').PROJECT_UPGRADES.params}
                actions                              = {redux.getActions(name)} />
        </Redux>
    </div>

exports.free = (project_id, dom_node, redux) ->
    ReactDOM.unmountComponentAtNode(dom_node)

exports.render = (project_id, dom_node, redux) ->
    init_redux(redux, project_id)
    ReactDOM.render(render(redux, project_id), dom_node)

exports.hide = (project_id, dom_node, redux) ->
    ReactDOM.unmountComponentAtNode(dom_node)

exports.show = (project_id, dom_node, redux) ->
    ReactDOM.render(render(redux, project_id), dom_node)

exports.init_upgrade_project = (element, project_id, redux) ->
    init_redux(redux, project_id)
    ReactDOM.render(render(redux, project_id), element)