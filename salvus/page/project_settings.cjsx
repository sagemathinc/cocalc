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

{salvus_client} = require('salvus_client')
{project_page}  = require('project')
misc = require('misc')
{required, defaults} = misc
{html_to_text} = require('misc_page')
{alert_message} = require('alerts')


{Panel, Col, Row, Button, ButtonToolbar, Input, Well} = require('react-bootstrap')
{ErrorDisplay, MessageDisplay, Icon, Loading, TextInput, NumberInput} = require('r_misc')
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
        <Panel header={@render_header()}>
            {@props.children}
        </Panel>

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
QuotaConsole = rclass
    propTypes:
        project : rtypes.object.isRequired
        flux    : rtypes.object.isRequired
        values  : rtypes.object.isRequired

    getInitialState: ->
        editing : false
        values : @props.values

    componentWillReceiveProps: (next_props) ->
        if not immutable.is(@props.values, next_props.values)
            # so when the props change the state stays in sync (e.g., so save button doesn't appear, etc.)
            @setState(number : next_props.values)

    render_quota_row: (quota) ->
        <LabeledRow label={quota.title} key={quota.title}l>
            {if @state.editing then quota.edit else quota.view}
        </LabeledRow>

    render_edit_button: ->
        #console.log(@state.values.toJS())
        #console.log(@props.values.toJS())
        if 'admin' in @props.flux.getStore('account').state.groups
            if @state.editing and @state.values? and not immutable.is(@state.values, @props.values)
                <Row>
                    <Col sm=4 style={float: "right"}>
                        <Button onClick={=>@setState(editing: false)} bsSize='small' bsStyle='warning' style={float: "right"}>
                            <Icon name={"thumbs-up"} /> Done
                        </Button>
                    </Col>
                </Row>
            else if @state.editing
                <Row>
                    <Col sm=4 style={float: "right"}>
                        <Button onClick={=>@setState(editing: false)} disabled bsSize='small' bsStyle='warning' style={float: "right"}>
                            <Icon name={"thumbs-up"} /> Done
                        </Button>
                    </Col>
                </Row>
            else
                <Row>
                    <Col sm=4 style={float: "right"}>
                        <Button onClick={=>@setState(editing: true)} bsSize='small' bsStyle='warning' style={float: "right"}>
                            <Icon name={"pencil"} /> Edit
                        </Button>
                    </Col>
                </Row>

    render_input: (label) ->
        <input type="text" ref=label
           value={if @state.values.get(label)? then @state.values.get(label) else @props.values.get(label)}
           onChange={=>@setState(values:@state.values.set(label, parseInt(@refs[label].getValue())))} />

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
            disk       :
                view : <span><b>{disk} MB</b> used of your <b>{settings.get('disk_quota')} MB</b> disk space</span>
                edit : <span><b>{disk} MB</b> used of your <b>{@render_input("disk_quota")} MB</b> disk space</span>
                title : "Disk space"
            memory     :
                view : <span><b>{memory} MB</b> used of your <b>{settings.get('memory')} MB</b> RAM memory</span>
                edit : <span><b>{memory} MB</b> used of your <b>{@render_input("memory")} MB</b> RAM memory</span>
                title : "Memory"
            cores      :
                view : <b>{settings.get('cores')} cores</b>
                edit : <b>{@render_input('cores')} cores</b>
                title : "CPU cores"
            cpu_shares :
                view : <b>{Math.floor(settings.get('cpu_shares') / 256)}</b>
                edit : <b>{@render_input("cpu_shares")}</b>
                title : "CPU share"
            timeout    :
                view : <span>Project stops after <b>{Math.round(settings.get('mintime') / 3600)} hour</b> of non-interactive use</span>
                edit : <span>Project stops after <b>{@render_input('mintime')} hour</b> of non-interactive use</span>
                title : "Timeout"
            network    :
                view : <b>{if @props.project.get('settings').get('network') then "Yes" else "Blocked"}</b>
                title : "Network"

        <div>
            {@render_edit_button()}
            {@render_quota_row(v) for k, v of quotas}
        </div>

UsagePanel = rclass
    propTypes:
        project : rtypes.object.isRequired
        flux    : rtypes.object.isRequired

    render: ->
        values = {}
        for value in ['disk_quota', 'memory', 'cores', 'cpu_shares', 'mintime', 'network']
            values[value] = @props.project.get('settings').get(value)
        <ProjectSettingsPanel title="Project usage and quotas" icon="dashboard">
            <QuotaConsole project={@props.project} flux={@props.flux} values={immutable.Map(values)} />
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
                        <Icon name="trash" /> {if @props.project.get('deleted') then "Undelete Project" else "Delete Project"}
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
    getInitialState: ->
        restart : false

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
        <pre>{misc.capitalize(@props.project.get('state')?.get('state'))}</pre>

    restart_project: ->
        @props.flux.getActions('projects').restart_project_server(@props.project.get('project_id'))

    render_confirm_restart: ->
        if @state.restart
            <LabeledRow key='restart' label=''>
                <Well>
                    Restarting the project server will kill all processes, update the project code,
                    and start the project running again.  It takes a few seconds, and can fix
                    some issues in case things are not working properly.
                    <hr />
                    <ButtonToolbar>
                        <Button bsStyle="warning" onClick={(e)=>e.preventDefault(); @setState(restart:false); @restart_project()}>
                            <Icon name="refresh" /> Restart Project Server
                        </Button>
                        <Button onClick={(e)=>e.preventDefault(); @setState(restart:false)}>
                             Cancel
                        </Button>
                    </ButtonToolbar>
                </Well>
            </LabeledRow>


    render : ->
        <ProjectSettingsPanel title='Project Control' icon='gears'>
            <LabeledRow key='state' label='State'>
                <Row>
                    <Col sm=6>
                        {@render_state()}
                    </Col>
                    <Col sm=6>
                        <Button bsStyle="warning" onClick={(e)=>e.preventDefault(); @setState(restart:true)}>
                            <Icon name="refresh"/> Restart Project...
                        </Button>
                    </Col>
                </Row>
            </LabeledRow>
            {@render_confirm_restart()}
            <LabeledRow key='project_id' label='Project id'>
                <pre>{@props.project.get('project_id')}</pre>
            </LabeledRow>
            <LabeledRow key='host' label='Host'>
                <pre>{@props.project.get('host')?.get('host')}.sagemath.com</pre>
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

    render_user: (user) ->
        <div key={user.account_id}>
            <Row>
                <Col sm=8>
                    <User account_id={user.account_id} user_map={@props.user_map} last_active={user.last_active} />
                    <span>&nbsp;({user.group})</span>
                </Col>
                <Col sm=4>
                    {@user_remove_button(user.account_id, user.group)}
                </Col>
            </Row>
            {@render_user_remove_confirm(user.account_id) if @state.removing == user.account_id}
        </div>

    render_users: ->
        users = ({account_id:account_id, group:x.group} for account_id, x of @props.project.get('users').toJS())
        for user in @props.flux.getStore('projects').sort_by_activity(users, @props.project.get('project_id'))
            @render_user(user)

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
            <h1><Icon name="wrench" /> Settings and configuration</h1>
            <Row>
                <Col sm=6>
                    <TitleDescriptionPanel key="title"          project={project} flux={@props.flux} />
                    <UsagePanel            key="usage"          project={project} flux={@props.flux} />
                    <CollaboratorsPanel    key="collaborators"  project={project} user_map={user_map} flux={@props.flux} />
                </Col>
                <Col sm=6>
                    <ProjectControlPanel   key="control"        project={project} flux={@props.flux} />
                    <SageWorksheetPanel    key="worksheet"      project={project} flux={@props.flux} />
                    <HideDeletePanel       key="hidedelete"     project={project} flux={@props.flux} />
                </Col>
            </Row>
        </div>

render = (project_id) ->
    <FluxComponent flux={flux} connectToStores={['projects', 'users']} >
        <ProjectController project_id={project_id} />
    </FluxComponent>

exports.create_page = (project_id, dom_node) ->
    React.render(render(project_id), dom_node)

# TODO: garbage collect/remove when project closed completely



