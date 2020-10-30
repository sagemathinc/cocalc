#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

async = require('async')

{Component, React, ReactDOM, rclass, rtypes, is_redux, is_redux_actions, redux, Store, Actions, Redux} = require('../app-framework')
{Alert, Button, ButtonToolbar, Checkbox, Col, FormControl, FormGroup, ControlLabel, InputGroup, Overlay, OverlayTrigger, Modal, Tooltip, Row, Well} = require('react-bootstrap')
{HelpEmailLink, SiteName, CompanyName, PricingUrl, PolicyTOSPageUrl, PolicyIndexPageUrl, PolicyPricingPageUrl} = require('../customize')
{UpgradeRestartWarning} = require('../upgrade-restart-warning')
{reportException} = require('../../webapp-lib/webapp-error-reporter')
{PROJECT_UPGRADES} = require('smc-util/schema')

{A} = require('./A')
{Icon} = require('./icon')
{Tip} = require('./tip')
{Loading} = require('./loading')
{r_join} = require('./r_join')
{Space} = require('./space')
{CloseX} = require('./close-x')
{CloseX2} = require('./close-x2')
{SimpleX} = require('./simple-x')
{Saving} = require('./saving')
{Spinner} = require('./spinner')
{ErrorDisplay} = require('./error-display')
{SkinnyError} = require('./skinny-error')
{SelectorInput} = require('./selector-input')
{TextInput} = require("./text-input")
{NumberInput} = require("./number-input")
{LabeledRow} = require('./labeled-row')
{TimeElapsed} = require('./time-elapsed')
{TimeAgo} = require('./time-ago')

share_server = require('./share-server');

# injected by webpack, but not for react-static renderings (ATTN don't assign to uppercase vars!)
exports.smc_version = smc_version = SMC_VERSION ? 'N/A'
exports.build_date  = build_date  = BUILD_DATE  ? 'N/A'
exports.smc_git_rev = smc_git_rev = SMC_GIT_REV ? 'N/A'

misc        = require('smc-util/misc')
theme       = require('smc-util/theme')
immutable   = require('immutable')
underscore  = require('underscore')

markdown    = require('../markdown')
feature     = require('../feature')

{defaults, required} = misc

exports.HTML = HTML = rclass
    displayName : 'Misc-HTML' # this name is assumed and USED in the smc-hub/share/mathjax-support to identify this component; do NOT change!

    propTypes :
        value            : rtypes.string
        style            : rtypes.object
        auto_render_math : rtypes.bool     # optional -- used to detect and render math
        project_id       : rtypes.string   # optional -- can be used to improve link handling (e.g., to images)
        file_path        : rtypes.string   # optional -- ...
        className        : rtypes.string   # optional class
        safeHTML         : rtypes.bool     # optional -- default true, if true scripts and unsafe attributes are removed from sanitized html
                                           # WARNING!!! ATTN!  This does not work.  scripts will NEVER be run.  See
                                           # commit 1abcd43bd5fff811b5ffaf7c76cb86a0ad494498, which I've reverted, since it breaks
                                           # katex... and on balance if we can get by with other approaches to this problem we should
                                           # since script is dangerous.  See also https://github.com/sagemathinc/cocalc/issues/4695
        href_transform   : rtypes.func     # optional function that link/src hrefs are fed through
        post_hook        : rtypes.func     # optional function post_hook(elt), which should mutate elt, where elt is
                                           # the jQuery wrapped set that is created (and discarded!) in the course of
                                           # sanitizing input.  Use this as an opportunity to modify the HTML structure
                                           # before it is exported to text and given to react.   Obviously, you can't
                                           # install click handlers here.
        highlight        : rtypes.immutable.Set
        content_editable : rtypes.bool     # if true, makes rendered HTML contenteditable
        reload_images    : rtypes.bool     # if true, after any update to component, force reloading of all images.
        smc_image_scaling : rtypes.bool    # if true, after rendering run the smc_image_scaling pluging to handle smc-image-scaling= attributes, which
                                           # are used in smc_sagews to rescale certain png images produced by other kernels (e.g., the R kernel).
                                           # See https://github.com/sagemathinc/cocalc/issues/4421.  This functionality is NOT actually used at all right now,
                                           # since it doesn't work on the share server anyways...
        highlight_code   : rtypes.bool     # if true, highlight some <code class='language-r'> </code> blocks.  See misc_page for how tiny this is!
        id               : rtypes.string
        mathjax_selector : rtypes.string   # if given, only run mathjax on result of jquery select with this selector and never use katex.
        onClick          : rtypes.func

    getDefaultProps: ->
        auto_render_math : true
        safeHTML         : true

    shouldComponentUpdate: (next) ->
        return misc.is_different(@props, next, ['value', 'auto_render_math', 'highlight', 'safeHTML', \
                 'reload_images', 'smc_image_scaling', 'highlight_code']) or \
               not underscore.isEqual(@props.style, next.style)

    _update_mathjax: ->
        if not @_is_mounted  # see https://github.com/sagemathinc/cocalc/issues/1689
            return
        if not @props.auto_render_math
            return
        $(ReactDOM.findDOMNode(@)).katex()

    _update_highlight: ->
        if not @_is_mounted or not @props.highlight?
            return
        # Use jquery-highlight, which is a pretty serious walk of the DOM tree, etc.
        $(ReactDOM.findDOMNode(@)).highlight(@props.highlight.toJS())

    _update_links: ->
        if not @_is_mounted
            return
        $(ReactDOM.findDOMNode(@)).process_smc_links
            project_id     : @props.project_id
            file_path      : @props.file_path
            href_transform : @props.href_transform

    _update_tables: ->
        if not @_is_mounted
            return
        $(ReactDOM.findDOMNode(@)).find("table").addClass('table')

    _update_images: ->
        if @_is_mounted
            if @props.reload_images
                $(ReactDOM.findDOMNode(@)).reload_images()
            if @props.smc_image_scaling
                $(ReactDOM.findDOMNode(@)).smc_image_scaling()

    _update_code: ->
        if @_is_mounted and @props.highlight_code
            $(ReactDOM.findDOMNode(@)).highlight_code()

    _do_updates: ->
        if share_server.SHARE_SERVER
            return
        @_update_mathjax()
        @_update_links()
        @_update_tables()
        @_update_highlight()
        @_update_code()
        @_update_images()

    update_content: ->
        if not @_is_mounted
            return
        @_do_updates()

    componentDidUpdate: ->
        @update_content()

    componentDidMount: ->
        @_is_mounted = true
        @update_content()

    componentWillUnmount: ->
        # see https://facebook.github.io/react/blog/2015/12/16/ismounted-antipattern.html
        # and https://github.com/sagemathinc/cocalc/issues/1689
        @_is_mounted = false

    render_html: ->
        if not @props.value
            return {__html: ''}

        if share_server.SHARE_SERVER
            # No sanitization at all for share server.  For now we
            # have set things up so that the share server is served
            # from a different subdomain and user can't sign into it,
            # so XSS is not an issue.  Note that the sanitizing
            # in the else below is quite expensive and often crashes
            # on "big" documents (e.g., 500K).
            {jQuery} = require('smc-webapp/jquery-plugins/katex')  # ensure have plugin here.
            elt = jQuery("<div>")
            elt.html(@props.value)
            if @props.auto_render_math
                elt.katex()
            elt.find("table").addClass("table")
            if @props.highlight_code
                elt.highlight_code()
            html = elt.html()
        else
            if @props.safeHTML
                html = require('../misc_page').sanitize_html_safe(@props.value, @props.post_hook)
            else
                html = require('../misc_page').sanitize_html(@props.value, true, true, @props.post_hook)

        return {__html: html}

    render: ->
        # the random key is the whole span (hence the html) does get rendered whenever
        # this component is updated.  Otherwise, it will NOT re-render except when the value changes.
        if @props.content_editable
            <div
                id                      = {@props.id}
                contentEditable         = {true}
                key                     = {Math.random()}
                className               = {@props.className}
                dangerouslySetInnerHTML = {@render_html()}
                style                   = {@props.style}
                onClick                 = {@props.onClick}
                onDoubleClick           = {@props.onDoubleClick}
                >
            </div>
        else
            <span
                id                      = {@props.id}
                key                     = {Math.random()}
                className               = {@props.className}
                dangerouslySetInnerHTML = {@render_html()}
                style                   = {@props.style}
                onClick                 = {@props.onClick}
                onDoubleClick           = {@props.onDoubleClick}
                >
            </span>

exports.Markdown = rclass
    displayName : 'Misc-Markdown'

    propTypes :
        value            : rtypes.string
        style            : rtypes.object
        project_id       : rtypes.string   # optional -- can be used to improve link handling (e.g., to images)
        file_path        : rtypes.string   # optional -- ...
        className        : rtypes.string   # optional class
        safeHTML         : rtypes.bool     # optional -- default true, if true scripts and unsafe attributes are removed from sanitized html

        href_transform   : rtypes.func     # optional function used to first transform href target strings
        post_hook        : rtypes.func     # see docs to HTML
        highlight        : rtypes.immutable.Set
        content_editable : rtypes.bool     # if true, makes rendered Markdown contenteditable
        id               : rtypes.string
        reload_images    : rtypes.bool
        smc_image_scaling: rtypes.bool
        highlight_code   : rtypes.bool
        onClick          : rtypes.func
        onDoubleClick          : rtypes.func
        line_numbers : rtypes.bool   # injects data attributes with line numbers to enable reverse search

    getDefaultProps: ->
        safeHTML         : true

    shouldComponentUpdate: (next) ->
        return misc.is_different(@props, next, ['value', 'highlight', 'safeHTML',  \
                    'checkboxes', 'reload_images', 'smc_image_scaling', 'highlight_code']) or \
               not underscore.isEqual(@props.style, next.style)

    to_html: ->
        if not @props.value
            return
        return markdown.markdown_to_html(@props.value, {line_numbers:@props.line_numbers})

    render: ->
        <HTML
            id               = {@props.id}
            auto_render_math = {true}
            value            = {@to_html()}
            style            = {@props.style}
            project_id       = {@props.project_id}
            file_path        = {@props.file_path}
            className        = {@props.className}
            href_transform   = {@props.href_transform}
            post_hook        = {@props.post_hook}
            highlight        = {@props.highlight}
            safeHTML         = {@props.safeHTML}
            reload_images    = {@props.reload_images}
            smc_image_scaling= {@props.smc_image_scaling}
            highlight_code   = {@props.highlight_code}
            content_editable = {@props.content_editable}
            onClick          = {@props.onClick}
            onDoubleClick    = {@props.onDoubleClick}
            />


###
 Takes current upgrades data and quota parameters and provides an interface for the user to update these parameters.
 submit_upgrade_quotas will receive a javascript object in the same format as quota_params
 cancel_upgrading takes no arguments and is called when the cancel button is hit.
###
{NoUpgrades} = require('./no-upgrades')
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
        #   0                           total_upgrades     proj_maximum
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
            bsSize  = 'small'
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
                label = if val == 0 then 'Disabled' else 'Enabled'

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
                    <form style={float:'right'}>
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

            val_state = @state["upgrade_#{name}"]
            val = misc.parse_number_input(val_state)
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
                remaining_note = <span>You have {remaining_all} unallocated {unit}<br/>(You may allocate up to {limit} {unit} here)</span>

            else
                remaining_note = <span>You have {remaining_all} unallocated {unit}</span>

            <Row key={name} style={marginTop:'5px'}>
                <Col sm={7}>
                    <Tip title={display} tip={desc}>
                        <strong>{display}</strong> (current: {show_total} {unit}, max allowed: {total_limit} {unit})
                    </Tip>
                    <br/>
                    {remaining_note}
                </Col>
                <Col sm={5}>
                    <FormGroup>
                        <InputGroup>
                            <FormControl
                                ref        = {"upgrade_#{name}"}
                                type       = {'text'}
                                value      = {val_state}
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

    show_account_upgrades: ->
        redux.getActions('page').set_active_tab('account')
        redux.getActions('account').set_active_tab('upgrades')

    render: ->
        if misc.is_zero_map(@props.upgrades_you_can_use)
            # user has no upgrades on their account
            <NoUpgrades cancel={@props.cancel_upgrading} />
        else
            {limits, remaining, current, totals, proj_remainder} = @get_quota_info()

            <Alert bsStyle='warning' style={@props.style}>
                {<div>
                    <h3><Icon name='arrow-circle-up' /> Adjust your upgrade contributions to this project</h3>

                    <div style={color:"#666"}>Adjust <i>your</i> contributions to the quotas on this project (disk space, memory, cores, etc.).  The total quotas for this project are the sum of the contributions of all collaborators and the free base quotas.  <a onClick={@show_account_upgrades} style={cursor:'pointer'}>See your current upgrade allocations...</a>
                    </div>
                </div> if not @props.omit_header}
                <div style={marginTop:'10px'}>
                    <Button
                        onClick = {@max_upgrades}
                    >
                        Apply maximum available upgrades to this project...
                    </Button>
                    {' '}
                    <Button
                        onClick = {@clear_upgrades}
                    >
                        Remove all your upgrades from this project...
                    </Button>
                </div>
                <hr/>
                <Row>
                    <Col md={6}>
                        <b style={fontSize:'14pt'}>Quota</b>
                    </Col>
                    <Col md={6}>
                        <b style={fontSize:'14pt', float:'right'}>Your contribution</b>
                    </Col>
                </Row>
                <hr/>

                {@render_upgrade_row(n, @props.quota_params[n], remaining[n], current[n], limits[n], totals[n], proj_remainder[n]) for n in PROJECT_UPGRADES.field_order}
                <UpgradeRestartWarning style={marginTop:'15px'}/>
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


# Error boundry. Pass components in as children to create one.
# https://reactjs.org/blog/2017/07/26/error-handling-in-react-16.html
exports.ErrorBoundary = rclass
    displayName: 'Error-Boundary'

    getInitialState: ->
        error : undefined
        info  : undefined

    componentDidCatch: (error, info) ->
        reportException(error,"render error",null,info)
        @setState
            error : error
            info  : info

    render: ->
        # This is way worse than nothing, because it suppresses reporting the actual error to the
        # backend!!!  I'm disabling it completely.
        return @props.children
        if @state.info?
            <Alert
                bsStyle = 'warning'
                style   = {margin:'15px'}
            >
                <h2 style={color:'rgb(217, 83, 79)'}>
                    <Icon name='bug'/> You have just encountered a bug in CoCalc.  This is not your fault.
                </h2>
                <h4>
                    {"You will probably have to refresh your browser to continue."}
                </h4>
                {"We have been notified of this error; however, if this bug is causing you significant trouble, file a support ticket:"}
                <br/>
                <br/>
                <Button onClick={=>redux.getActions('support').show(true)}>
                    Create Ticket
                </Button>
                <br/>
                <br/>
                <details style={whiteSpace:'pre-wrap', cursor:'pointer'} >
                    <summary>Stack trace (in case you are curious)</summary>
                    <div style={cursor:'pointer'} >
                        {@state.error?.toString()}
                        <br/>
                        {@state.info.componentStack}
                    </div>
                </details>
            </Alert>
        else
            @props.children
