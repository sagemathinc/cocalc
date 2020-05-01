#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
The Upgrades Page
###

async = require('async')

immutable = require('immutable')
{React, rclass, rtypes}  = require('./app-framework')
{ErrorDisplay, Loading, r_join, Space, UpgradeAdjustor} = require('./r_misc')
misc = require('smc-util/misc')
{Button, ButtonToolbar, Row, Col, Well, Panel, ProgressBar} = require('react-bootstrap')
{HelpEmailLink, SiteName, PolicyPricingPageUrl, Footer} = require('./customize')

{PROJECT_UPGRADES} = require('smc-util/schema')

{webapp_client} = require('./webapp_client')

{ExplainResources} = require('./billing/explain-resources')
{ExplainPlan} = require('./billing/explain-plan')
{DedicatedVM} = require('./billing/dedicated-vm')
{FAQ} = require('./billing/faq')
{SubscriptionGrid} = require('./billing/subscription-grid')

round1 = misc.round1

exports.ProjectUpgradesTable = ProjectUpgradesTable = rclass
    reduxProps :
        account :
            get_total_upgrades : rtypes.func
        customize :
            help_email : rtypes.string
        projects :
            project_map                         : rtypes.immutable.Map
            get_total_upgrades_you_have_applied : rtypes.func
            get_upgrades_you_applied_to_project : rtypes.func
            get_total_project_quotas            : rtypes.func
            get_upgrades_to_project             : rtypes.func
            get_projects_upgraded_by            : rtypes.func

    getInitialState: ->
        show_adjustor             : immutable.Map({}) # project_id : bool
        expand_remove_all_upgrades : false
        remove_all_upgrades_error  : undefined

    open_project_settings: (e, project_id) ->
        @actions('projects').open_project
            project_id : project_id
            target     : 'settings'
            switch_to  : not(e.which == 2 or (e.ctrlKey or e.metaKey))
        e.preventDefault()

    submit_upgrade_quotas: ({project_id, new_quotas}) ->
        @actions('projects').apply_upgrades_to_project(project_id, new_quotas)
        @toggle_adjustor(project_id)

    generate_on_click_adjust: (project_id) ->
        return (e) =>
            e.preventDefault()
            @toggle_adjustor(project_id)

    toggle_adjustor: (project_id) ->
        status = @state.show_adjustor.get(project_id)
        n = @state.show_adjustor.set(project_id, not status)
        @setState(show_adjustor : n)

    render_upgrades_to_project: (project_id, upgrades) ->
        v = []
        for param, val of upgrades
            if not val
                continue
            info = PROJECT_UPGRADES.params[param]
            if not info?
                console.warn("Invalid upgrades database entry for project_id='#{project_id}' -- if this problem persists, email #{@props.help_email} with the project_id: #{param}")
                continue
            n = round1(if val? then info.display_factor * val else 0)
            v.push <span key={param}>
                {info.display}: {n}  {misc.plural(n, info.display_unit)}
            </span>
        return r_join(v)

    render_upgrade_adjustor: (project_id) ->
        <UpgradeAdjustor
            key                                  = {"adjustor-#{project_id}"}
            project_id                           = {project_id}
            total_project_quotas                 = {@props.get_total_project_quotas(project_id) }
            upgrades_you_can_use                 = {@props.get_total_upgrades()}
            upgrades_you_applied_to_all_projects = {@props.get_total_upgrades_you_have_applied()}
            upgrades_you_applied_to_this_project = {@props.get_upgrades_you_applied_to_project(project_id)}
            quota_params                         = {PROJECT_UPGRADES.params}
            submit_upgrade_quotas                = {(new_quotas) => @submit_upgrade_quotas({new_quotas, project_id})}
            cancel_upgrading                     = {()=>@toggle_adjustor(project_id)}
            style = {
                margin : '25px 0px 0px 0px'
            }
            omit_header = {true}
        />

    render_upgraded_project: (project_id, upgrades, darker) ->
        {ProjectTitle} = require('./projects')
        <Row key={project_id} style={backgroundColor:'#eee' if darker}>
            <Col sm={4}>
                <ProjectTitle
                    project_id={project_id}
                    project_map={@props.project_map}
                    handle_click={(e)=>@open_project_settings(e, project_id)}
                />
            </Col>
            <Col sm={8}>
                <a onClick={@generate_on_click_adjust(project_id)} role='button'>
                    {@render_upgrades_to_project(project_id, upgrades)}
                </a>
            </Col>
            {@render_upgrade_adjustor(project_id) if @state.show_adjustor.get(project_id)}
        </Row>

    render_upgraded_projects_rows: (upgraded_projects) ->
        i = -1
        for project_id, upgrades of upgraded_projects
            i += 1
            @render_upgraded_project(project_id, upgrades, i%2==0)

    confirm_reset: (e) ->
        try
            await webapp_client.project_client.remove_all_upgrades()
        catch err
            @setState
                expand_remove_all_upgrades : false
                remove_all_upgrades_error  : err?.toString()

    render_remove_all_upgrades_error: ->
        err = @state.remove_all_upgrades_error
        if not misc.is_string(err)
            err = JSON.stringify(err)
        <Row>
            <Col sm={12}>
                <ErrorDisplay
                    title   = {"Error removing all upgrades"}
                    error   = {err}
                    onClose = {=>@setState(remove_all_upgrades_error:undefined)}
                />
            </Col>
        </Row>

    render_remove_all_upgrades_conf: ->
        <Row>
            <Col sm={12}>
                <ResetProjectsConfirmation
                    on_confirm = {@confirm_reset}
                    on_cancel  = {=>@setState(expand_remove_all_upgrades:false)}
                />
            </Col>
        </Row>

    render_header: ->
        <div>
            <Row>
                <Col sm={12} style={display:'flex'} >
                    <h4 style={flex:'1'} >
                        Upgrades you have applied to projects
                    </h4>
                    <Button
                        bsStyle  = {'warning'}
                        onClick  = {=>@setState(expand_remove_all_upgrades:true)}
                        disabled = {@state.expand_remove_all_upgrades}
                    >
                        Remove All Upgrades You Applied to Projects...
                    </Button>
                </Col>
            </Row>
            {@render_remove_all_upgrades_error() if @state.remove_all_upgrades_error}
            {@render_remove_all_upgrades_conf()  if @state.expand_remove_all_upgrades}
        </div>

    render: ->
        upgraded_projects = @props.get_projects_upgraded_by()
        if not misc.len(upgraded_projects)
            return null
        <Panel header={@render_header()}>
            <Row key='header'>
                <Col sm={4}>
                    <strong>Project</strong>
                </Col>
                <Col sm={8}>
                    <strong>Upgrades you have applied to this project (click to edit)</strong>
                </Col>
            </Row>
            {@render_upgraded_projects_rows(upgraded_projects)}
        </Panel>

exports.ResetProjectsConfirmation = ResetProjectsConfirmation = require('./account/upgrades/reset-projects').ResetProjectsConfirmation;