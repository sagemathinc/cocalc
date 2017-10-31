###
Render a single project entry, which goes in the list of projects
###

{React, rtypes, rclass}  = require('../smc-react')

{Row, Col, Well} = require('react-bootstrap')

{Icon, Markdown, ProjectState, TimeAgo} = require('../r_misc')

{User} = require('../users')

exports.ProjectRow = rclass
    displayName : 'Projects-ProjectRow'

    propTypes :
        project : rtypes.object.isRequired
        index   : rtypes.number
        redux   : rtypes.object

    getDefaultProps: ->
        user_map : undefined

    render_status: ->
        state = @props.project.state?.state
        if state?
            <span style={color: '#666'}>
                <ProjectState state={state} />
            </span>

    render_last_edited: ->
        try
            <TimeAgo date={(new Date(@props.project.last_edited)).toISOString()} />
        catch e
            console.log("error setting time of project #{@props.project.project_id} to #{@props.project.last_edited} -- #{e}; please report to help@sagemath.com")

    render_user_list: ->
        other = ({account_id:account_id} for account_id,_ of @props.project.users)
        @props.redux.getStore('projects').sort_by_activity(other, @props.project.project_id)
        users = []
        for i in [0...other.length]
            users.push <User
                           key         = {other[i].account_id}
                           last_active = {other[i].last_active}
                           account_id  = {other[i].account_id}
                           user_map    = {@props.user_map} />
        return users

    render_project_title: ->
        <a>
            <Markdown value={@props.project.title} />
        </a>

    render_project_description: ->
        if @props.project.description != 'No Description'  # don't bother showing that default; it's clutter
            <Markdown value={@props.project.description} />

    handle_mouse_down: (e) ->
        @setState
            selection_at_last_mouse_down : window.getSelection().toString()

    handle_click: (e) ->
        if window.getSelection().toString() == @state.selection_at_last_mouse_down
            @open_project_from_list(e)

    open_project_from_list: (e) ->
        @actions('projects').open_project
            project_id : @props.project.project_id
            switch_to  : not(e.which == 2 or (e.ctrlKey or e.metaKey))
        e.preventDefault()

    open_edit_collaborator: (e) ->
        @actions('projects').open_project
            project_id : @props.project.project_id
            switch_to  : not(e.which == 2 or (e.ctrlKey or e.metaKey))
            target     : 'settings'
        e.stopPropagation()

    render: ->
        project_row_styles =
            backgroundColor : if (@props.index % 2) then '#eee' else 'white'
            marginBottom    : 0
            cursor          : 'pointer'
            wordWrap        : 'break-word'

        <Well style={project_row_styles} onClick={@handle_click} onMouseDown={@handle_mouse_down}>
            <Row>
                <Col sm=3 style={fontWeight: 'bold', maxHeight: '7em', overflowY: 'auto'}>
                    {@render_project_title()}
                </Col>
                <Col sm=2 style={color: '#666', maxHeight: '7em', overflowY: 'auto'}>
                    {@render_last_edited()}
                </Col>
                <Col sm=2 style={color: '#666', maxHeight: '7em', overflowY: 'auto'}>
                    {@render_project_description()}
                </Col>
                <Col sm=3 style={maxHeight: '7em', overflowY: 'auto'}>
                    <a onClick={@open_edit_collaborator}>
                        <Icon name='user' style={fontSize: '16pt', marginRight:'10px'}/>
                        {@render_user_list()}
                    </a>
                </Col>
                <Col sm=2>
                    {@render_status()}
                </Col>
            </Row>
        </Well>
