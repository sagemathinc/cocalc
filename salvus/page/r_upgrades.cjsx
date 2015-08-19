{flux, rclass, React, rtypes, Flux, Actions, Store}  = require('flux')
{Loading, r_join} = require('r_misc')
misc = require('misc')
{Button, Row, Col, Well, Panel, ProgressBar} = require('react-bootstrap')
{ProjectTitle} = require('projects')

{PROJECT_UPGRADES} = require('schema')

round1 = misc.round1

UpgradesPage = rclass
    propTypes :
        flux            : rtypes.object
        project_map     : rtypes.object
        stripe_customer : rtypes.object

    displayName : "UpgradesPage"

    render_no_upgrades: ->
        <h4>You have no upgrades. Sign up for a subscription in the billing tab.</h4>

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
        upgrades = @props.flux.getStore('account').get_total_upgrades()
        used     = @props.flux.getStore('projects').get_total_upgrades_you_have_applied()
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
        @props.flux.getActions('projects').open_project
            project_id : project_id
            target     : 'settings'
            switch_to  : not(e.which == 2 or (e.ctrlKey or e.metaKey))
        e.preventDefault()

    render_upgrades_to_project: (upgrades) ->
        v = []
        for param, val of upgrades
            info = PROJECT_UPGRADES.params[param]
            if not info?
                console.warn("Invalid upgrades database entry -- if this problem persists, email help@sagemath.com : #{param}")
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
                {@render_upgrades_to_project(upgrades)}
            </Col>
        </Row>

    render_upgraded_projects_rows: (upgraded_projects) ->
        i = -1
        for project_id, upgrades of upgraded_projects
            i += 1
            @render_upgraded_project(project_id, upgrades, i%2==0)

    render_upgraded_projects: ->
        upgraded_projects = @props.flux.getStore('projects').get_projects_upgraded_by()
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
        if not @props.flux? or not @props.project_map?
            return <Loading />
        if not @props.stripe_customer?
            @render_no_upgrades()
        else
            <div>
                {@render_upgrades()}
                {@render_upgraded_projects()}
            </div>



render = (flux) ->
    connect_to =
        project_map     : 'projects'
        stripe_customer : 'account'
    <Flux flux={flux} connect_to={connect_to} >
        <UpgradesPage />
    </Flux>

is_mounted = false
exports.render_upgrades = (flux) ->
    #console.log("mount upgrades ")
    React.render(render(flux), $("#smc-upgrades-tab")[0])
    is_mounted = true

exports.unmount = () ->
    #console.log("unmount upgrades")
    if is_mounted
        React.unmountComponentAtNode( $("#smc-upgrades-tab")[0])
        is_mounted = false