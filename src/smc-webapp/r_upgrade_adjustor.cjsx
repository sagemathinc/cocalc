{Component, React, ReactDOM, rclass, rtypes, is_redux, is_redux_actions, redux, Store, Actions, Redux} = require('./app-framework')
{Alert, Button, ButtonToolbar, Checkbox, Col, FormControl, FormGroup, ControlLabel, InputGroup, Overlay, OverlayTrigger, Popover, Modal, Tooltip, Row, Well} = require('react-bootstrap')
{HelpEmailLink, SiteName, CompanyName, PricingUrl, PolicyTOSPageUrl, PolicyIndexPageUrl, PolicyPricingPageUrl} = require('./customize')
{UpgradeRestartWarning} = require('./upgrade_restart_warning')
{Icon, Tip} = require('./r_misc')

misc        = require('smc-util/misc')
theme       = require('smc-util/theme')
{defaults, required} = misc


exports.UPGRADE_ERROR_STYLE = UPGRADE_ERROR_STYLE =
    color        : 'white'
    background   : 'red'
    padding      : '1ex'
    borderRadius : '3px'
    fontWeight   : 'bold'
    marginBottom : '1em'

{PROJECT_UPGRADES} = require('smc-util/schema')

{UpgradeRestartWarning} = require('./upgrade_restart_warning')

###
 Takes current upgrades data and quota parameters and provides an interface for the user to update these parameters.
 submit_upgrade_quotas will receive a javascript object in the same format as quota_params
 cancel_upgrading takes no arguments and is called when the cancel button is hit.
###
exports.UpgradeAdjustor = rclass
    displayName : 'UpgradeAdjustor'

    propTypes :
        quota_params                         : rtypes.object.isRequired # from the schema
        total_project_quotas                 : rtypes.object
        submit_upgrade_quotas                : rtypes.func.isRequired
        cancel_upgrading                     : rtypes.func.isRequired
        disable_submit                       : rtypes.bool
        upgrades_you_can_use                 : rtypes.object
        upgrades_you_applied_to_all_projects : rtypes.object
        upgrades_you_applied_to_this_project : rtypes.object
        omit_header                          : rtypes.bool

    getDefaultProps: ->
        upgrades_you_can_use                 : {}
        upgrades_you_applied_to_all_projects : {}
        upgrades_you_applied_to_this_project : {}
        omit_header                          : false

    getInitialState: ->
        state = {}

        current = @props.upgrades_you_applied_to_this_project

        for name, data of @props.quota_params
            factor = data.display_factor
            if data.input_type == 'checkbox' and @props.submit_text == "Create project with upgrades"
                current_value = current[name] ? 1
            else
                current_value = current[name] ? 0
            state["upgrade_#{name}"] = misc.round2(current_value * factor)

        return state

    get_quota_info : ->
        # This function is quite confusing and tricky.
        # It combines the remaining upgrades of the user with the already applied ones by the same user.
        # Then it limits the applyable upgrades by what's still possible to apply until the maximum is reached.
        # My mental model:
        #
        #   0                                total          maximum
        #   |<-------------------------------->|                |
        #   |<----->|<------------------------>|<-------------->|
        #   | admin |  all upgrades by users   | proj remainder |
        #   | +     |<------------>|<--------->|<--------->|    |
        #   | free  |  other users | this user | remaining |    |
        #   |       |              |           | this user |    |
        #   |       |              |<--------------------->|    |
        #   |       |              |  limit for this user  | <= | max
        #
        #   admin/free: could be 0
        #   all upgrades by users is total_project_quotas
        #   remainder: >=0, usually, but if there are already too many upgrades it is negative!
        #   this user: upgrades_you_applied_to_this_project. this is >= 0!
        #   limit for this user: is capped by the user's overall quotas AND the quota maximum

        # NOTE : all units are ^ly 'internal' instead of display, e.g. seconds instead of hours
        quota_params = @props.quota_params
        # how much upgrade you have used between all projects
        user_upgrades = @props.upgrades_you_applied_to_all_projects
        # how much upgrade you currently use on this one project
        user_current = @props.upgrades_you_applied_to_this_project
        # all currently applied upgrades to this project
        total_upgrades = @props.total_project_quotas
        # how much unused upgrade you have remaining
        user_remaining = misc.map_diff(@props.upgrades_you_can_use, user_upgrades)
        # the overall limits are capped by the maximum per project
        proj_maximum = require('smc-util/schema').PROJECT_UPGRADES.max_per_project
        # and they're also limited by what everyone has already applied
        proj_remainder = misc.map_diff(proj_maximum, total_upgrades)
        # note: if quota already exeeds, proj_remainder might have negative values -- don't cap at 0
        # the overall limit for the user is capped by what's left for the project
        limits = misc.map_limit(user_remaining, proj_remainder)
        # and finally, we add up what a user can add (with the maybe negative remainder) and cap at 0
        user_limits = misc.map_max(misc.map_sum(limits, user_current), 0)
        return
            limits         : user_limits
            remaining      : user_remaining
            current        : user_current
            totals         : total_upgrades
            proj_remainder : proj_remainder

    clear_upgrades: ->
        @set_upgrades('min')

    max_upgrades: ->
        @set_upgrades('max')

    set_upgrades: (description) ->
        info = @get_quota_info()
        new_upgrade_state = {}
        for name, data of @props.quota_params
            factor = data.display_factor
            switch description
                when 'max'
                    current_value = info.limits[name]
                when 'min'
                    current_value = 0
            new_upgrade_state["upgrade_#{name}"] = misc.round2(current_value * factor)

        return @setState(new_upgrade_state)

    is_upgrade_input_valid: (input, max) ->
        val = misc.parse_number_input(input, round_number=false)
        if not val? or val > Math.max(0, max)
            return false
        else
            return true

    # the max button will set the upgrade input box to the number given as max
    render_max_button: (name, max) ->
        <Button
            bsSize  = 'xsmall'
            onClick = {=>@setState("upgrade_#{name}" : max)}
            style   = {padding:'0px 5px'}
        >
            Max
        </Button>

    render_addon: (misc, name, display_unit, limit) ->
        <div style={minWidth:'81px'}>{"#{misc.plural(2,display_unit)}"} {@render_max_button(name, limit)}</div>

    render_upgrade_row: (name, data, remaining=0, current=0, limit=0, total=0, proj_remainder=0) ->
        if not data?
            return

        {display, desc, display_factor, display_unit, input_type} = data

        if input_type == 'checkbox'

            # the remaining count should decrease if box is checked
            val = @state["upgrade_#{name}"]
            show_remaining = remaining + current - val
            show_remaining = Math.max(show_remaining, 0)

            if not @is_upgrade_input_valid(Math.max(val, 0), limit)
                reasons = []
                if val > remaining + current then reasons.push('you do not have enough upgrades')
                if val > proj_remainder + current then reasons.push('exceeds the limit')
                reason = reasons.join(' and ')
                label = <div style={UPGRADE_ERROR_STYLE}>Uncheck this: {reason}</div>
            else
                label = if val == 0 then 'Enable' else 'Enabled'

            is_upgraded = if total >= 1 then '(already upgraded)' else '(not upgraded)'

            <Row key={name} style={marginTop:'5px'}>
                <Col sm={6}>
                    <Tip title={display} tip={desc}>
                        <strong>{display}</strong> {is_upgraded}
                    </Tip>
                    <br/>
                    You have {show_remaining} unallocated {misc.plural(show_remaining, display_unit)}
                </Col>
                <Col sm={6}>
                    <form>
                        <Checkbox
                            ref      = {"upgrade_#{name}"}
                            checked  = {val > 0}
                            onChange = {(e)=>@setState("upgrade_#{name}" : if e.target.checked then 1 else 0)}>
                            {label}
                        </Checkbox>
                    </form>
                </Col>
            </Row>


        else if input_type == 'number'
            remaining = misc.round2(remaining * display_factor)
            proj_remainder = misc.round2(proj_remainder * display_factor)
            display_current = current * display_factor # current already applied
            if current != 0 and misc.round2(display_current) != 0
                current = misc.round2(display_current)
            else
                current = display_current

            limit = misc.round2(limit * display_factor)
            current_input = misc.parse_number_input(@state["upgrade_#{name}"]) ? 0 # current typed in

            # the amount displayed remaining subtracts off the amount you type in
            show_remaining = misc.round2(remaining + current - current_input)

            val = misc.parse_number_input(@state["upgrade_#{name}"])
            if val?
                if not @is_upgrade_input_valid(Math.max(val, 0), limit)
                    reasons = []
                    if val > remaining + current then reasons.push('not enough upgrades')
                    if val > proj_remainder + current then reasons.push('exceeding limit')
                    reason = reasons.join(' and ')
                    bs_style = 'error'
                    label = <div style={UPGRADE_ERROR_STYLE}>Value too high: {reason}</div>
                else
                    label = <span></span>
            else
                label = <div style={UPGRADE_ERROR_STYLE}>Please enter a number</div>

            remaining_all = Math.max(show_remaining, 0)
            schema_limit = PROJECT_UPGRADES.max_per_project
            display_factor = PROJECT_UPGRADES.params[name].display_factor
            # calculates the amount of remaining quotas: limited by the max upgrades and subtract the already applied quotas
            total_limit = misc.round2(schema_limit[name] * display_factor)
            show_total = misc.round2(total * display_factor)

            unit = misc.plural(show_remaining, display_unit)
            if limit < remaining
                remaining_note = <span>You have {remaining_all} unallocated {unit}<br/>(you may allocate up to {limit} {unit} here)</span>

            else
                remaining_note = <span>You have {remaining_all} unallocated {unit}</span>

            <Row key={name} style={marginTop:'5px'}>
                <Col sm={7}>
                    <Tip title={display} tip={desc}>
                        <strong>{display}</strong> ({show_total} of {total_limit} {unit})
                    </Tip>
                    <br/>
                    {remaining_note}
                </Col>
                <Col sm={5}>
                    <FormGroup>
                        <InputGroup>
                            <FormControl
                                ref        = {"upgrade_#{name}"}
                                type       = 'text'
                                value      = {val}
                                bsStyle    = {bs_style}
                                onChange   = {=>@setState("upgrade_#{name}" : ReactDOM.findDOMNode(@refs["upgrade_#{name}"]).value)}
                            />
                            <InputGroup.Addon>
                                {@render_addon(misc, name, display_unit, limit)}
                            </InputGroup.Addon>
                        </InputGroup>
                    </FormGroup>
                    {label}
                </Col>
            </Row>
        else
            console.warn('Invalid input type in render_upgrade_row: ', input_type)
            return

    save_upgrade_quotas: (remaining) ->
        current = @props.upgrades_you_applied_to_this_project
        new_upgrade_quotas = {}
        new_upgrade_state  = {}
        for name, data of @props.quota_params
            factor = data.display_factor
            current_val = misc.round2((current[name] ? 0) * factor)
            remaining_val = Math.max(misc.round2((remaining[name] ? 0) * factor), 0) # everything is now in display units

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
            new_upgrade_quotas[name] = misc.round2(val / factor) # only now go back to internal units

        @props.submit_upgrade_quotas(new_upgrade_quotas)
        # set the state so that the numbers are right if you click upgrade again
        @setState(new_upgrade_state)

    # Returns true if the inputs are valid and different:
    #    - at least one has changed
    #    - none are negative
    #    - none are empty
    #    - none are higher than their limit
    valid_changed_upgrade_inputs: (current, limits) ->
        for name, data of @props.quota_params
            factor = data.display_factor
            # the highest number the user is allowed to type
            limit = Math.max(0, misc.round2((limits[name] ? 0) * factor))  # max since 0 is always allowed
            # the current amount applied to the project
            cur_val = misc.round2((current[name] ? 0) * factor)
            # the current number the user has typed (undefined if invalid)
            new_val = misc.parse_number_input(@state["upgrade_#{name}"])
            if ((not new_val?) or (new_val > limit)) and (data.input_type isnt "checkbox")
                return false
            if cur_val isnt new_val
                changed = true
        return changed

    render: ->
        if misc.is_zero_map(@props.upgrades_you_can_use)
            # user has no upgrades on their account
            <NoUpgrades cancel={@props.cancel_upgrading} />
        else
            {limits, remaining, current, totals, proj_remainder} = @get_quota_info()

            <Alert bsStyle='warning' style={@props.style}>
                {<React.Fragment>
                    <h3><Icon name='arrow-circle-up' /> Adjust your project quota contributions</h3>

                    <span style={color:"#666"}>Adjust <i>your</i> contributions to the quotas on this project (disk space, memory, cores, etc.).  The total quotas for this project are the sum of the contributions of all collaborators and the free base quotas.  Go to "Account --> Upgrades" to see how your upgrades are currently allocated.
                    </span>
                    <hr/>
                </React.Fragment> if not @props.omit_header}
                <Row>
                    <Col md={2}>
                        <b style={fontSize:'12pt'}>Quota</b>
                    </Col>
                    <Col md={4}>
                        <Button
                            bsSize  = 'xsmall'
                            onClick = {@max_upgrades}
                            style   = {padding:'0px 5px'}
                        >
                            Max All Upgrades
                        </Button>
                        {' '}
                        <Button
                            bsSize  = 'xsmall'
                            onClick = {@clear_upgrades}
                            style   = {padding:'0px 5px'}
                        >
                            Remove All Upgrades
                        </Button>
                    </Col>
                    <Col md={6}>
                        <b style={fontSize:'12pt'}>Your contribution</b>
                    </Col>
                </Row>
                <hr/>

                {@render_upgrade_row(n, @props.quota_params[n], remaining[n], current[n], limits[n], totals[n], proj_remainder[n]) for n in PROJECT_UPGRADES.field_order}
                <UpgradeRestartWarning />
                {@props.children}
                <ButtonToolbar style={marginTop:'10px'}>
                    <Button
                        bsStyle  = 'success'
                        onClick  = {=>@save_upgrade_quotas(remaining)}
                        disabled = {@props.disable_submit or not @valid_changed_upgrade_inputs(current, limits)}
                    >
                        <Icon name='arrow-circle-up' /> {if @props.submit_text then @props.submit_text else "Save Changes"}
                    </Button>
                    <Button onClick={@props.cancel_upgrading}>
                        Cancel
                    </Button>
                </ButtonToolbar>
            </Alert>

