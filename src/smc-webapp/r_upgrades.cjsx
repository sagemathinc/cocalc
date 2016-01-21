{React, rclass, rtypes}  = require('./smc-react')
{Loading, r_join} = require('./r_misc')
misc = require('smc-util/misc')
{Button, Row, Col, Well, Panel, ProgressBar} = require('react-bootstrap')
{ProjectTitle} = require('./projects')

{PROJECT_UPGRADES} = require('smc-util/schema')

round1 = misc.round1

exports.UpgradesPage = rclass
    propTypes :
        redux           : rtypes.object
        project_map     : rtypes.object
        stripe_customer : rtypes.object

    displayName : "UpgradesPage"

    render_no_upgrades: ->
        {SubscriptionGrid, ExplainResources} = require('./billing')
        <div>
            <h3>Sign up for a subscription in the billing tab</h3>

            <ExplainResources type='shared'/>

            <br/> <br/>

            <SubscriptionGrid period='month year' is_static={true}/>

            <ExplainResources type='dedicated'/>
            <br/>
        </div>

    render_have_upgrades: ->
        <div>
            <h3>Thank you for supporting SageMathCloud</h3>
            <span style={color:"#666"}>
                We offer many <a href={window.smc_base_url + '/policies/pricing.html'} target='_blank'> pricing
                and subscription options</a>, which you can subscribe to in the Billing tab.
                Your upgrades are listed below, along with how you have
                applied them to projects.  You can adjust your project upgrades from
                the settings page in any project.
            </span>
            <br/><br/>
        </div>

    render_upgrade: (param, amount, used, darker) ->
        info = PROJECT_UPGRADES.params[param]
        n = round1(if amount? then info.display_factor * amount else 0)
        u = round1(if used? then info.display_factor * used else 0)
        percent_used = Math.round(u/n*100)
        <Row key={param} style={backgroundColor:'#eee' if darker}>
            <Col sm=2>
                {info.display}
            </Col>
            <Col sm=3>
                <Row>
                    <Col sm=5>
                        {<span>{u} {misc.plural(u, info.display_unit)}</span> if u?}
                    </Col>
                    <Col sm=7>
                        <ProgressBar striped now={percent_used} style={marginBottom: '0px'}/>
                    </Col>
                </Row>
            </Col>
            <Col sm=2>
                {<span>{n} {misc.plural(n, info.display_unit)}</span> if n?}
            </Col>
            <Col sm=5 style={color:"#666"}>
                {info.desc}
            </Col>
        </Row>

    render_upgrade_rows: (upgrades, used) ->
        i = 1
        for prop, amount of upgrades
            i += 1
            @render_upgrade(prop, amount, used[prop], i%2==0)

    render_upgrades: ->
        upgrades = @props.redux.getStore('account').get_total_upgrades()
        used     = @props.redux.getStore('projects').get_total_upgrades_you_have_applied()
        if not upgrades? or not used?
            return @render_no_upgrades()

        <Panel header={<h4>Upgrades that you get from your subscriptions</h4>}>
            <Row key='header'>
                <Col sm=2>
                    <strong>Quota</strong>
                </Col>
                <Col sm=3>
                    <strong>Used</strong>
                </Col>
                <Col sm=2>
                    <strong>Purchased</strong>
                </Col>
                <Col sm=5>
                    <strong>Description</strong>
                </Col>
            </Row>
            {@render_upgrade_rows(upgrades, used)}
        </Panel>

    open_project_settings: (e, project_id) ->
        @props.redux.getActions('projects').open_project
            project_id : project_id
            target     : 'settings'
            switch_to  : not(e.which == 2 or (e.ctrlKey or e.metaKey))
        e.preventDefault()

    render_upgrades_to_project: (project_id, upgrades) ->
        v = []
        for param, val of upgrades
            if not val
                continue
            info = PROJECT_UPGRADES.params[param]
            if not info?
                console.warn("Invalid upgrades database entry for project_id='#{project_id}' -- if this problem persists, email #{redux.getStore('customize').get('help_email')} with the project_id: #{param}")
                continue
            n = round1(if val? then info.display_factor * val else 0)
            v.push <span key={param}>
                {info.display}: {n}  {misc.plural(n, info.display_unit)}
            </span>
        return r_join(v)

    render_upgraded_project: (project_id, upgrades, darker) ->
        <Row key={project_id} style={backgroundColor:'#eee' if darker}>
            <Col sm=4>
                <ProjectTitle
                    project_id={project_id}
                    project_map={@props.project_map}
                    handle_click={(e)=>@open_project_settings(e, project_id)}
                />
            </Col>
            <Col sm=8>
                {@render_upgrades_to_project(project_id, upgrades)}
            </Col>
        </Row>

    render_upgraded_projects_rows: (upgraded_projects) ->
        i = -1
        for project_id, upgrades of upgraded_projects
            i += 1
            @render_upgraded_project(project_id, upgrades, i%2==0)

    render_upgraded_projects: ->
        upgraded_projects = @props.redux.getStore('projects').get_projects_upgraded_by()
        if not misc.len(upgraded_projects)
            return
        <Panel header={<h4>Upgrades you have applied to projects</h4>}>
            <Row key='header'>
                <Col sm=4>
                    <strong>Project</strong>
                </Col>
                <Col sm=8>
                    <strong>Upgrades you have applied to this project</strong>
                </Col>
            </Row>
            {@render_upgraded_projects_rows(upgraded_projects)}
        </Panel>

    render : ->
        if not @props.redux? or not @props.project_map?
            return <Loading />
        if not @props.stripe_customer?.subscriptions?.total_count
            @render_no_upgrades()
        else
            <div>
                {@render_have_upgrades()}
                {@render_upgrades()}
                {@render_upgraded_projects()}
            </div>