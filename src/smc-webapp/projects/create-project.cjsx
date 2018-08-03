###
Create a new project
###

{React, ReactDOM, redux, rtypes, rclass}  = require('../app-framework')

{Row, Col, Well, Button, ButtonToolbar, FormControl, FormGroup, Alert, ErrorDisplay} = require('react-bootstrap')

{Icon, Space} = require('../r_misc')

misc = require('smc-util/misc')


exports.NewProjectCreator = rclass
    displayName : 'Projects-NewProjectCreator'

    propTypes :
        start_in_edit_mode : rtypes.bool

    getInitialState: ->
        state =
            state      : if @props.start_in_edit_mode then 'edit' else 'view'   # view --> edit --> saving --> view
            title_text : ''
            error      : ''

    start_editing: ->
        @setState
            state      : 'edit'
            title_text : ''
        # We also update the customer billing information; this is important since
        # we will call apply_default_upgrades in a moment, and it will be more
        # accurate with the latest billing information recently loaded.
        redux.getActions('billing')?.update_customer()

    cancel_editing: ->
        #console.log 'cancel_editing'
        @setState
            state      : 'view'
            title_text : ''
            error      : ''

    toggle_editing: ->
        if @state.state == 'view'
            @start_editing()
        else
            @cancel_editing()

    create_project: (quotas_to_apply) ->
        token = misc.uuid()
        @setState(state:'saving')
        actions = redux.getActions('projects')
        actions.create_project
            title : @state.title_text
            token : token
        redux.getStore('projects').wait_until_project_created token, 30, (err, project_id) =>
            if err?
                @setState
                    state : 'edit'
                    error : "Error creating project -- #{err}"
            else
                actions.apply_default_upgrades(project_id: project_id)
                actions.set_add_collab(project_id, true)
                actions.open_project(project_id: project_id, switch_to:false)
                @cancel_editing()

    handle_keypress: (e) ->
        if e.keyCode == 27
            @cancel_editing()
        else if e.keyCode == 13 and @state.title_text != ''
            @create_project()

    render_info_alert: ->
        if @state.state == 'saving'
            <div style={marginTop:'30px'}>
                <Alert bsStyle='info'>
                <Icon name='cc-icon-cocalc-ring' spin />
                <Space/> Creating project...
                </Alert>
            </div>

    render_error: ->
        if @state.error
            <div style={marginTop:'30px'}>
                <ErrorDisplay error={@state.error} onClose={=>@setState(error:'')} />
            </div>

    render_new_project_button: ->
        <Row>
            <Col sm={4}>
                <Button
                    bsStyle  = 'success'
                    active   = {@state.state != 'view'}
                    disabled = {@state.state != 'view'}
                    block
                    type     = 'submit'
                    onClick  = {@toggle_editing}>
                    <Icon name='plus-circle' /> Create New Project...
                </Button>
            </Col>
        </Row>

    render_input_section: ->
        <Well style={backgroundColor: '#FFF'}>
            <Row>
                <Col sm={6}>
                    <FormGroup>
                        <FormControl
                            ref         = 'new_project_title'
                            type        = 'text'
                            placeholder = 'Project title'
                            disabled    = {@state.state == 'saving'}
                            value       = {@state.title_text}
                            onChange    = {=>@setState(title_text:ReactDOM.findDOMNode(@refs.new_project_title).value)}
                            onKeyDown   = {@handle_keypress}
                            autoFocus   />
                    </FormGroup>
                    <ButtonToolbar>
                        <Button
                            disabled  = {@state.title_text == '' or @state.state == 'saving'}
                            onClick   = {=>@create_project(false)}
                            bsStyle  = 'success' >
                            Create Project
                        </Button>
                        <Button
                            disabled = {@state.state is 'saving'}
                            onClick  = {@cancel_editing} >
                            Cancel
                        </Button>
                    </ButtonToolbar>
                </Col>
                <Col sm={6}>
                    <div style={color:'#666'}>
                        A <b>project</b> is your own computational workspace that you can share with others.
                        You can easily change the project title later.
                    </div>
                </Col>
            </Row>
            <Row>
                <Col sm={12}>
                    {@render_error()}
                    {@render_info_alert()}
                </Col>
            </Row>
        </Well>

    render_project_creation: ->
        <Row>
            <Col sm={12}>
                <Space/>
                {@render_input_section()}
            </Col>
        </Row>

    render: ->
        <div>
            {@render_new_project_button()}
            {@render_project_creation() if @state.state != 'view'}
        </div>
