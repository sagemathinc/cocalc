immutable  = require('immutable')
underscore = require('underscore')

{salvus_client} = require('salvus_client')
{project_page}  = require('project')
misc = require('misc')
{required, defaults} = misc
{html_to_text} = require('misc_page')

{Panel, Col, Row, Button, ButtonToolbar, Input, Well} = require('react-bootstrap')
{ErrorDisplay, MessageDisplay, Icon, Loading, TextInput} = require('r_misc')
{React, Actions, Store, Table, flux, rtypes, rclass, FluxComponent}  = require('flux')
{User} = require('users')

LabeledRow = rclass
    propTypes:
        label : rtypes.string.isRequired
    render : ->
        <Row>
            <Col sm=4>
                {@props.label}
            </Col>
            <Col sm=8>
                {@props.children}
            </Col>
        </Row>

URLBox = rclass
    render: ->
        url = document.URL
        i = url.lastIndexOf("/settings")
        if i != -1
            url = url.slice(0,i)
        <Input style={cursor: "text"} type="text" disabled value={url} />

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

UsagePanel = rclass
    propTypes:
        project : rtypes.object.isRequired
        flux    : rtypes.object.isRequired

    render_quota_row: (label, content) ->
        <LabeledRow label=label key=label>
            {content}
        </LabeledRow>

    render: ->
        settings = @props.project.get('settings')
        status   = @props.project.get('status')
        disk_quota = <b>{settings.get('disk_quota')}</b>
        memory = '?'; disk = '?'
        if status?
            rss = status.get('memory')?.get('rss')
            if rss?
                memory = Math.round(rss/1000)
            disk = status.get('disk_MB')
            if disk?
                disk = Math.ceil(disk)
        quotas =
            "Disk space" : <span><b>{disk} MB</b> used of your <b>{settings.get('disk_quota')} MB</b> disk space</span>
            "RAM memory" : <span><b>{memory} MB</b> used of your <b>{settings.get('memory')} MB</b> RAM memory</span>
            "CPU cores"  : <b>{settings.get('cores')} cores</b>
            "CPU share"  : <b>{Math.floor(settings.get('cpu_shares') / 256)}</b>
            "Timeout"    : <span>Project stops after <b>{Math.round(settings.get('mintime') / 3600)} hour</b> of non-interactive use</span>
            "External network access" : <b>{if settings.get('network') then "Yes" else "Blocked"}</b>

        <ProjectSettingsPanel title="Project usage and quotas" icon="dashboard">
            <div>
                {(@render_quota_row(k, v) for k, v of quotas)}
            </div>
            <hr />
            <span style={color:"#666"}>Email <a target="_blank" href="mailto:help@sagemath.com">help@sagemath.com</a> if you need us to move your project to a members-only machine, or upgrades on quotas.
                Include the following in your email:
                <URLBox />
            </span>
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
            <span>Undelete this project for everyone.</span>
        else
            <span>Delete this project for everyone. You can undo this.</span>

    hide_message: ->
        if @props.project.get("users").get(salvus_client.account_id).get("hide")
            <span>
                Unhide this project, so it shows up in your default project listing.
            </span>
        else
            <span>
                Hide this project, so it does not show up in your default project listing.
                This only impacts you, not your collaborators, and you can easily unhide it.
            </span>

    render: ->
        hidden = @props.project.get("users").get(salvus_client.account_id).get("hide")
        <ProjectSettingsPanel title="Hide or delete project" icon="warning">
            <Row>
                <Col sm=8>
                    {@hide_message()}
                </Col>
                <Col sm=4>
                    <Button bsStyle="warning" onClick={@toggle_hide_project} style={float: "right"}>
                        <Icon name="eye-slash" /> {if hidden then "Unhide" else "Hide"} Project
                    </Button>
                </Col>
            </Row>
            <hr />
            <Row>
                <Col sm=8>
                    {@delete_message()}
                </Col>
                <Col sm=4>
                    <Button bsStyle="danger" onClick={@toggle_delete_project} style={float: "right"}>
                        <Icon name="trash" /> {if @props.project.get('deleted') then "Undelete Project" else "Delete Project..."}
                    </Button>
                </Col>
            </Row>
        </ProjectSettingsPanel>

SageWorksheetPanel = rclass
    getInitialState: ->
        loading : false
        message : ''

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
                    @setState(message:"Error trying to restart worksheet server.  Try restarting the project server instead.")
                else
                    @setState(message:"Worksheet server restarted.  Restarted worksheets will use a new Sage session.")

    render_message: ->
        if @state.message
            <MessageDisplay message={@state.message} onClose={=>@setState(message:'')} />

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
            {@render_message()}
        </ProjectSettingsPanel>

ProjectControlPanel = rclass
    propTypes:
        project : rtypes.object.isRequired
        flux    : rtypes.object.isRequired

    open_authorized_keys: ->
        project = project_page(project_id : @props.project.get('project_id'))
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
    ssh_notice: ->
        project_id = @props.project.get('project_id')
        host = @props.project.get('host')?.get('host')
        if host?
            <div>
                SSH into your project: <span className="lighten">First add your public key to <a onClick={@open_authorized_keys}>~/.ssh/authorized_keys</a>, then use the following username@host:</span>
                <Input style={cursor: "text"} type="text" disabled value={"#{project_id}@#{host}.sagemath.com"} />
            </div>

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
            <hr />
            {@ssh_notice()}
            If your project is not working, email <a target="_blank" href="mailto:help@sagemath.com">help@sagemath.com</a>, and include the following URL:
            <URLBox />
        </ProjectSettingsPanel>

CollaboratorsSearch = rclass
    propTypes:
        project : rtypes.object.isRequired
        flux    : rtypes.object.isRequired

    getInitialState: ->
        search    : ''   # search that user has typed in so far
        select    : undefined   # list of results for doing the search -- turned into a selector
        searching : false       # currently carrying out a search
        err       : ''   # display an error in case something went wrong doing a search
        email_to  : ''   # if set, adding user via email to this address
        email_body : ''  # with this body.

    do_search: (e) ->
        e.preventDefault()
        if @state.searching
            # already searching
            return
        search = @state.search.trim()
        if search.length == 0
             @setState(err:undefined, select:undefined)
             return
        @setState(searching:true)
        salvus_client.user_search
            query : @state.search
            limit : 50
            cb    : (err, select) =>
                @setState(searching:false, err:err, select:select)

    do_search_button: ->
        <Button onClick={@do_search}>
            <Icon name="search" />
        </Button>

    render_options: (select) ->
        for r in select
            name = r.first_name + ' ' + r.last_name
            <option key={r.account_id} value={r.account_id} label={name}>{name}</option>

    invite_collaborator: (account_id) ->
        @props.flux.getTable('projects').invite_collaborator(@props.project.get('project_id'), account_id)

    add_selected: ->
        for account_id in @refs.select.getSelectedOptions()
            @invite_collaborator(account_id)

    write_email_invite: ->
        name = @props.flux.getStore('account').get_fullname()
        body = "Please collaborate with me using SageMathCloud on '#{@props.project.get('title')}'.  Sign up at\n\n    https://cloud.sagemath.com\n\n--\n#{name}"

        @setState(email_to: @state.search, email_body: body)

    send_email_invite: ->
        @props.flux.getTable('projects').invite_collaborators_by_email(@props.project.get('project_id'), @state.email_to, @state.email_body)
        @setState(email_to:'',email_body:'')

    render_send_email: ->
        if not @state.email_to
            return
        <div>
            <hr />
            <Well>
                Enter one or more email addresses separated by commas:
                <Input autoFocus
                       type="text"
                       value={@state.email_to}
                       ref="email_to"
                       onChange={=>@setState(email_to:@refs.email_to.getValue())}
                    />
                <Input type="textarea"
                       value={@state.email_body}
                       ref="email_body"
                       rows=8
                       onChange={=>@setState(email_body:@refs.email_body.getValue())}
                    />
                <ButtonToolbar>
                    <Button bsStyle="primary" onClick={@send_email_invite}>Send Invitation</Button>
                    <Button onClick={=>@setState(email_to:'',email_body:'')}>Cancel</Button>
                </ButtonToolbar>
            </Well>
        </div>

    render_select_list: ->
        if @state.searching
            return <Loading />
        if @state.err
            return <ErrorDisplay error={@state.err} onClose={=>@setState(err:'')} />
        if not @state.select? or not @state.search.trim()
            return
        select = (r for r in @state.select when not @props.project.get('users').get(r.account_id)?)
        if select.length == 0
            <Button onClick={@write_email_invite}><Icon name="envelope" /> No matches. Send email invitation...</Button>
        else
            <div>
                <Input type='select' multiple ref="select">
                    {@render_options(select)}
                </Input>
                <Button onClick={@add_selected}><Icon name="plus" /> Add selected</Button>
            </div>

    render: ->
        <div>
            <LabeledRow label="Add collaborators">
                <form onSubmit={@do_search}>
                    <Input
                        autoFocus
                        type        = "search"
                        value       =  @props.search
                        ref         = "search"
                        placeholder = "Search by name or email address..."
                        onChange    = {=> @setState(search:@refs.search.getValue(), select:undefined)}
                        buttonAfter = {@do_search_button()} />
                </form>
            </LabeledRow>
            {@render_select_list()}
            {@render_send_email()}
        </div>

CollaboratorsList = rclass
    propTypes:
        flux     : rtypes.object.isRequired
        project  : rtypes.object.isRequired
        user_map : rtypes.object.isRequired

    getInitialState: ->
        removing : undefined  # id's of account that we are currently confirming to remove

    remove_collaborator: (account_id) ->
        @props.flux.getTable('projects').remove_collaborator(@props.project.get('project_id'), account_id)
        @setState(removing:undefined)

    render_user_remove_confirm: (account_id) ->
        <Well style={background:'white'}>
            Are you sure you want to remove <User account_id={account_id} user_map={@props.user_map} /> from this project?
            <ButtonToolbar>
                <Button bsStyle="danger" onClick={=>@remove_collaborator(account_id)}>Remove</Button>
                <Button bsStyle="default" onClick={=>@setState(removing:'')}>Cancel</Button>
            </ButtonToolbar>
        </Well>

    user_remove_button: (account_id, group) ->
        <Button disabled={group=='owner'} className="pull-right" style={marginBottom: '6px'}
            onClick={=>@setState(removing:account_id)}><Icon name="times" /> Remove
        </Button>

    render_user: (account_id, group) ->
        <div key={account_id}>
            <Row>
                <Col sm=8>
                    <User account_id={account_id} user_map={@props.user_map} />
                    <span>&nbsp;({group})</span>
                </Col>
                <Col sm=4>
                    {@user_remove_button(account_id, group)}
                </Col>
            </Row>
            {@render_user_remove_confirm(account_id) if @state.removing == account_id}
        </div>

    render_users: ->
        users = @props.project.get('users').toJS()
        for account_id,x of users
            @render_user(account_id, x.group)

    render: ->
        <Well style={maxHeight: '20em', overflowY: 'auto', overflowX: 'hidden'}>
            {@render_users()}
        </Well>

CollaboratorsPanel = rclass
    propTypes:
        project  : rtypes.object.isRequired
        user_map : rtypes.object.isRequired
        flux     : rtypes.object.isRequired
    render : ->
        <ProjectSettingsPanel title='Collaborators' icon='user'>
            <div key="mesg">
                <span className="lighten">Collaborators can <b>modify anything</b> in this project, except backups.  They can add and remove other collaborators, but cannot remove owners.
                </span>
            </div>
            <hr />
            <CollaboratorsSearch key="search" project={@props.project} flux={@props.flux} />
            {<hr /> if @props.project.get('users')?.size > 1}
            <CollaboratorsList key="list" project={@props.project} user_map={@props.user_map} flux={@props.flux} />
        </ProjectSettingsPanel>

ProjectController = rclass
    propTypes:
        project_id  : rtypes.string.isRequired

    shouldComponentUpdate: (next) ->
        if not @props.user_map? or not @props.project_map? or not next.user_map? or not next.project_map?
            return false
        return not immutable.is(@props.project_map.get(@props.project_id), next.project_map.get(@props.project_id))

    render: ->
        project = @props.project_map?.get(@props.project_id)
        user_map = @props.user_map
        if not project? or not user_map?
            return <Loading />
        <div>
            <CollaboratorsPanel    key="collaborators"  project={project} user_map={user_map} flux={@props.flux} />
            <UsagePanel            key="usage"          project={project} flux={@props.flux} />
            <HideDeletePanel       key="hidedelete"     project={project} flux={@props.flux} />
            <TitleDescriptionPanel key="title"          project={project} flux={@props.flux} />
            <ProjectControlPanel   key="control"        project={project} flux={@props.flux} />
            <SageWorksheetPanel    key="worksheet"      project={project} flux={@props.flux} />
        </div>

render = (project_id) ->
    <FluxComponent flux={flux} connectToStores={['projects', 'users']} >
        <ProjectController project_id={project_id} />
    </FluxComponent>

exports.create_page = (project_id, dom_node) ->
    React.render(render(project_id), dom_node)

# TODO: garbage collect/remove when project closed completely



