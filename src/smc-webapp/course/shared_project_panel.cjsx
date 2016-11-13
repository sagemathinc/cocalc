{defaults, required} = require('smc-util/misc')
{React, rclass, rtypes}  = require('../smc-react')
{Alert, Button, ButtonToolbar, ButtonGroup, Input, Row, Col, Panel} = require('react-bootstrap')
{Icon, Tip} = require('../r_misc')

exports.SharedProjectPanel = rclass
    displayName : "CourseEditor-SharedProject"

    propTypes :
        shared_project_id : rtypes.string
        redux             : rtypes.object.isRequired
        name              : rtypes.string.isRequired

    getInitialState: ->
        confirm_create : false

    panel_header_text: ->
        if @props.shared_project_id
            "Shared project that everybody can fully use"
        else
            "Optionally create a shared project for everybody"

    render: ->
        <Row>
            <Col md=6>
                 <Panel header={<h4><Icon name='users' />  {@panel_header_text()} </h4>}>
                    {@render_content()}
                 </Panel>
            </Col>
        </Row>

    render_content: ->
        if @props.shared_project_id
            @render_has_shared_project()
        else
            @render_no_shared_project()

    render_has_shared_project: ->
        <div>
            <div style={color:'#444'}>
                <p>
                    You created a common shared project, which everybody -- students and all collaborators
                    on this project (your TAs and other instructors) -- have <b>write</b> access to.  Use
                    this project for collaborative in-class labs, course-wide chat rooms, and making
                    miscellaneous materials available for
                    students to experiment with together.
                </p>
                <p>
                    When you created the shared project, everybody who has already created an account
                    is added as a collaborator to the project.  Whenever you re-open this course,
                    any students or collaborators on the project that contains this course will be
                    added to the shared project.
                </p>
            </div>
            <br/>
            <Button onClick={@open_project}>
                <Icon name="edit" /> Open shared project
            </Button>
        </div>

    open_project: ->
        @props.redux.getActions('projects').open_project(project_id:@props.shared_project_id)

    render_no_shared_project: ->
        <div>
            <div style={color:'#444'}>
                <p>
                    <i>Optionally</i> create a single common shared project, which everybody -- students and all collaborators
                    on this project (your TAs and other instructors) -- will have <b>write</b> access to.  This can be useful
                    for collaborative in-class labs, course-wide chat rooms, and making miscellanous materials available for
                    students to experiment with together.
                </p>
                <p>
                    When you create the shared project, everybody who has already created an account
                    is added as a collaborator to the project.  Whenever you re-open this course,
                    any students or collaborators on the project that contains this course will be
                    added to the shared project.
                </p>
                <p>
                    After you create the shared project, you should move the shared project to a members only server
                    or upgrade it in other ways if you want it to be more stable.
                </p>

            </div>
            <br/>
            <Button onClick={=>@setState(confirm_create:true)} disabled={@state.confirm_create}>
                <Icon name="plus"/> Create shared project...
            </Button>
            {@render_confirm_create()}
        </div>

    render_confirm_create: ->
        if @state.confirm_create
            <Alert bsStyle='warning' style={marginTop:'15px'}>
                <ButtonToolbar>
                    <Button bsStyle='warning' onClick={=>@setState(confirm_create:false);@create_shared_project()}>
                        Create shared project for everybody involved in this class
                    </Button>
                    <Button onClick={=>@setState(confirm_create:false)}>
                        Cancel
                    </Button>
                </ButtonToolbar>
            </Alert>

    create_shared_project: ->
        @props.redux.getActions(@props.name).create_shared_project()

exports.SharedProjectPanel.Header = rclass
    propTypes :
        project_exists : rtypes.bool

    render: ->
        if @props.project_exists
            tip = "Shared project that everybody involved in this course may use."
        else
            tip = "Create a shared project that everybody in this course may use."
        <Tip delayShow=1300 title="Shared Project"
             tip={tip}>
            <span>
                <Icon name="users"/> Shared Project
            </span>
        </Tip>