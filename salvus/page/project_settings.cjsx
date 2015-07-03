immutable  = require('immutable')
underscore = require('underscore')

{salvus_client} = require('salvus_client')
{project_page}  = require('project')
misc = require('misc')
{required, defaults} = misc
{html_to_text} = require('misc_page')

{Panel, Col, Row, Button} = require('react-bootstrap')
{ErrorDisplay, Icon, Loading, TextInput} = require('r_misc')
{React, Actions, Store, Table, flux, rtypes, rclass, FluxComponent}  = require('flux')
{User} = require('users')

LabeledRow = rclass
    propTypes:
        label : rtypes.string.isRequired
    render : ->
        <Row>
            <Col sm=3>
                <h5 style={marginTop:"14px"}>{@props.label}</h5>
            </Col>
            <Col sm=9>
                {@props.children}
            </Col>
        </Row>

ProjectSettingsPanel = rclass
    propTypes:
        icon : rtypes.string.isRequired
        title : rtypes.string.isRequired

    render_header : ->
        <h3><Icon name={@props.icon} /> {@props.title}</h3>

    render : ->
        <Col sm=6>
            <Panel header={@render_header()}>
                {@props.children}
            </Panel>
        </Col>

TitleDescriptionPanel = rclass
    render : ->
        <ProjectSettingsPanel title="Title and description" icon="header">
            <LabeledRow label="Title">
                <TextInput
                    text={@props.project.get('title')}
                    on_change={(title)=>@props.flux.getTable('projects').set({project_id:@props.project.get('project_id'), title:title})}
                />
            </LabeledRow>
            <LabeledRow label="Description">
                <TextInput
                    type="textarea"
                    text={@props.project.get('description')}
                    on_change={(desc)=>@props.flux.getTable('projects').set({project_id:@props.project.get('project_id'), description:desc})}
                />
            </LabeledRow>
        </ProjectSettingsPanel>

HideDeletePanel = rclass
    propTypes:
        project : rtypes.object.isRequired
        flux    : rtypes.object.isRequired

    toggle_delete_project: ->
        @props.flux.getTable('projects').toggle_delete_project(@props.project.get('project_id'))

    toggle_hide_project: ->
        @props.flux.getTable('projects').toggle_hide_project(@props.project.get('project_id'))

    delete_message: ->
        if @props.project.get('deleted')
            return "Undelete this project for everyone."
        return "Delete this project for everyone. You can undo this."

    hide_message: ->
        if @props.project.get("users").get(salvus_client.account_id).get("hide")
            return "Unhide this project, so it shows up in your default project listing."
        return "Hide this project, so it does not show up in your default project listing. This only impacts you, not your collaborators, and you can easily unhide it."

    render: ->
        hidden = @props.project.get("users").get(salvus_client.account_id).get("hide")
        <ProjectSettingsPanel title="Hide or delete project" icon="warning">
            <Row>
                <Col sm=8>
                    {@hide_message()}
                </Col>
                <Col sm=4>
                    <Button bsStyle="warning" onClick={@toggle_hide_project}>
                        <Icon name="eye-slash" /> {if hidden then "Unhide" else "Hide"} Project
                    </Button>
                </Col>
            </Row>
            <Row>
                <Col sm=8>
                    {@delete_message()}
                </Col>
                <Col sm=4>
                    <Button bsStyle="danger" onClick={@toggle_delete_project}>
                        <Icon name="trash" /> {if @props.project.get('deleted') then "Undelete Project" else "Delete Project..."}
                    </Button>
                </Col>
            </Row>
        </ProjectSettingsPanel>

SageWorksheetPanel = rclass
    getInitialState: ->
        loading : false

    propTypes:
        project : rtypes.object.isRequired
        flux    : rtypes.object.isRequired

    restart_worksheet: ->
        @setState(loading: true)
        salvus_client.exec
                project_id : @props.project.get('project_id')
                command    : "sage_server stop; sage_server start"
                timeout    : 30
                cb         : (err, output) =>
                    @setState(loading: false)
                    if err
                        alert_message
                            type    : "error"
                            message : "Error trying to restart worksheet server.  Try restarting the project server instead."
                    else
                        alert_message
                            type    : "info"
                            message : "Worksheet server restarted.  Restarted worksheets will use a new Sage session."
                            timeout : 4

    render: ->
        <ProjectSettingsPanel title="Sage worksheet server" icon="refresh">
            <Row>
                <Col sm=8>
                    Restart this Sage Worksheet server. <br />
                    <span style={color: "#666"}>
                        Existing worksheet sessions are unaffected; restart this
                        server if you customize $HOME/bin/sage, so that restarted worksheets
                        will use the new version of Sage.
                    </span>
                </Col>
                <Col sm=4>
                    <Button bsStyle="warning" disabled={@state.loading} onClick={@restart_worksheet}>
                        <Icon name="refresh" spin={@state.loading} /> Restart Sage Worksheet Server
                    </Button>
                </Col>
            </Row>
        </ProjectSettingsPanel>

ProjectControlPanel = rclass
    propTypes:
        project : rtypes.object.isRequired
        flux    : rtypes.object.isRequired

    render_state: ->
        <div>{@props.project.get('state')?.get('state')}</div>

    restart_project: (e) ->
        e.preventDefault()
        @props.flux.getActions('projects').restart_project_server(@props.project.get('project_id'))

    render : ->
        <ProjectSettingsPanel title='Project Control' icon='gears'>
            <LabeledRow key='state' label='State'>
                <Row>
                    <Col sm=8>
                        {@render_state()}
                    </Col>
                    <Col sm=4>
                        <Button bsStyle="warning" onClick={@restart_project}>
                            <Icon name="refresh" /> Restart
                        </Button>
                    </Col>
                </Row>
            </LabeledRow>
            <LabeledRow key='project_id' label='Project id'>
                {@props.project.get('project_id')}
            </LabeledRow>
            <LabeledRow key='host' label='Host'>
                {@props.project.get('host')?.get('host')}
            </LabeledRow>
        </ProjectSettingsPanel>

ProjectController = rclass
    propTypes:
        project_id  : rtypes.string.isRequired

    # TODO: some business with prop changing and immutablejs goes here.
    render: ->
        project = @props.project_map?.get(@props.project_id)
        if not project?
            return <Loading />
        <div>
            <HideDeletePanel       key="hidedelete"     project={project} flux={@props.flux} />
            <TitleDescriptionPanel key="title"          project={project} flux={@props.flux} />
            <ProjectControlPanel   key="control"        project={project} flux={@props.flux} />
            <SageWorksheetPanel    key="worksheet"      project={project} flux={@props.flux} />
        </div>

render = (project_id) ->
    <FluxComponent flux={flux} connectToStores={'projects'} >
        <ProjectController project_id={project_id} />
    </FluxComponent>

exports.create_page = (project_id, dom_node) ->
    React.render(render(project_id), dom_node)

# TODO: garbage collect/remove when project closed completely



