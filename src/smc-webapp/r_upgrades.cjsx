###
The Upgrades Page
###

async = require('async')

immutable = require('immutable')
{React, rclass, rtypes}  = require('./app-framework')
{ErrorDisplay, Loading, r_join, Space, UpgradeAdjustor, Footer} = require('./r_misc')
misc = require('smc-util/misc')
{Button, ButtonToolbar, Row, Col, Well, Panel, ProgressBar} = require('react-bootstrap')
{HelpEmailLink, SiteName, PolicyPricingPageUrl} = require('./customize')
{UpgradeRestartWarning} = require('./upgrade_restart_warning')

{PROJECT_UPGRADES} = require('smc-util/schema')

{webapp_client} = require('./webapp_client')

round1 = misc.round1

exports.UpgradesPage = rclass
    propTypes :
        redux           : rtypes.object
        project_map     : rtypes.object
        stripe_customer : rtypes.immutable.Map

    reduxProps:
        projects:
            all_projects_have_been_loaded : rtypes.bool

    displayName : "UpgradesPage"

    render_no_upgrades: ->
        {SubscriptionGrid, ExplainResources, ExplainPlan, FAQ} = require('./billing')
        <div>
            <h3>Sign up</h3>
            To sign up for a subscription, visit the "Subscriptions and Course Packages tab".

            <ExplainResources type='shared'/>

            <Space/>
            <ExplainPlan type='personal' />
            <SubscriptionGrid period='month year' is_static={true}/>

            <Space/>
            <ExplainPlan type='course' />
            <SubscriptionGrid period='month4' is_static={true}/>

            <Space/>
            <ExplainResources type='dedicated'/>

            <hr/>
            <FAQ/>

            <Footer/>
        </div>

    render_have_upgrades: ->
        <div style={margin:'10px 0'}>
            <h3>Thank you for supporting <SiteName/></h3>
            <span style={color:"#666"}>
                We offer many <a href={PolicyPricingPageUrl} target='_blank' rel='noopener'> pricing
                and subscription options</a>, which you can subscribe to in the Billing tab.
                Your upgrades are listed below, along with how you have
                applied them to projects.  You can adjust your project upgrades from
                the settings page in any project.
            </span>
            <Space/>
        </div>

    render_upgrade: (param, amount, used, darker) ->
        info = PROJECT_UPGRADES.params[param]
        n = round1(if amount? then info.display_factor * amount else 0)
        u = round1(if used? then info.display_factor * used else 0)
        percent_used = Math.round(u/n*100)
        <Row key={param} style={backgroundColor:'#eee' if darker}>
            <Col sm={2}>
                {info.display}
            </Col>
            <Col sm={3}>
                <Row>
                    <Col sm={5}>
                        {<span>{u} {misc.plural(u, info.display_unit)}</span> if u?}
                    </Col>
                    <Col sm={7}>
                        <ProgressBar striped now={percent_used} style={margin: '3px 0px', border:'1px solid grey'}/>
                    </Col>
                </Row>
            </Col>
            <Col sm={2}>
                {<span>{n} {misc.plural(n, info.display_unit)}</span> if n?}
            </Col>
            <Col sm={5} style={color:"#666"}>
                {info.desc}
            </Col>
        </Row>

    render_upgrade_rows: (upgrades, used) ->
        i = 1
        for prop in PROJECT_UPGRADES.field_order
            amount = upgrades[prop]
            i += 1
            @render_upgrade(prop, amount, used[prop], i%2==0)

    render_upgrades: ->
        upgrades = @props.redux.getStore('account').get_total_upgrades()
        used     = @props.redux.getStore('projects').get_total_upgrades_you_have_applied()
        if not upgrades? or not used?
            return @render_no_upgrades()

        # Ensure that all projects loaded -- this can change used above, which is fine,
        # and would re-render this component.  The issue is that it's conceivable you have
        # a project nobody has touched for a month, which has upgrades applied to it.
        @props.redux.getActions('projects').load_all_projects()

        <Panel header={<h2>Upgrades from your subscriptions and course packages</h2>}>
            <Row key='header'>
                <Col sm={2}>
                    <strong>Quota</strong>
                </Col>
                <Col sm={3}>
                    <strong>Used</strong>
                </Col>
                <Col sm={2}>
                    <strong>Purchased</strong>
                </Col>
                <Col sm={5}>
                    <strong>Description</strong>
                </Col>
            </Row>
            {@render_upgrade_rows(upgrades, used)}
        </Panel>

    render: ->
        if not @props.redux? or not @props.project_map?
            return <Loading theme={"medium"}  />
        if not @props.all_projects_have_been_loaded
            # See https://github.com/sagemathinc/cocalc/issues/3802
            @props.redux.getActions('projects').load_all_projects()
            return <Loading theme={"medium"} />
        if not @props.stripe_customer?.getIn(['subscriptions', 'total_count'])
            @render_no_upgrades()
        else
            <div>
                {@render_have_upgrades()}
                {@render_upgrades()}
                <ProjectUpgradesTable />
                <Footer/>
            </div>


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
        webapp_client.remove_all_upgrades undefined, (err) =>
            @setState
                expand_remove_all_upgrades : false
                remove_all_upgrades_error  : err

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

exports.ResetProjectsConfirmation = ResetProjectsConfirmation = ({on_confirm, on_cancel}) ->
    <Well style={marginBottom:'0px', marginTop:'10px', background:'white'}>
        Are you sure you want to remove all upgrades that you have contributed to these projects?<br/>
        Your upgrades will then be available to use on projects.<br/>
        <UpgradeRestartWarning style={display:'inline-block', margin:'15px 0'} />
        <ButtonToolbar>
            <Button bsStyle='warning' onClick={on_confirm}>
                Yes, please remove all upgrades
            </Button>
            <Button onClick={on_cancel}>
                Cancel
            </Button>
        </ButtonToolbar>
    </Well>