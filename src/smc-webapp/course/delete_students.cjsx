{React, rclass, rtypes}  = require('../smc-react')
{Button, ButtonToolbar, Panel, Well} = require('react-bootstrap')
{Icon} = require('../r_misc')

exports.DeleteStudentsPanel = rclass
    propTypes:
        delete : rtypes.func.isRequired

    getInitialState: ->
        delete_student_projects_confirm : false

    render_confirm_delete_student_projects: ->
        <Well style={marginTop:'10px'}>
            All student projects will be deleted.  Are you absolutely sure?
            <ButtonToolbar style={marginTop:'10px'}>
                <Button bsStyle='danger' onClick={=>@setState(delete_student_projects_confirm:false); @props.delete()}>YES, DELETE all Student Projects</Button>
                <Button onClick={=>@setState(delete_student_projects_confirm:false)}>Cancel</Button>
            </ButtonToolbar>
        </Well>

    render: ->
        <Panel header={<h4><Icon name='trash'/> Delete all student projects</h4>}>
            <Button bsStyle='danger' onClick={=>@setState(delete_student_projects_confirm:true)}><Icon name="trash"/> Delete all Student Projects...</Button>
            {@render_confirm_delete_student_projects() if @state.delete_student_projects_confirm}
            <hr/>
            <span style={color:'#666'}>
                If for some reason you would like to delete all the student projects
                created for this course, you may do so by clicking below.
                Be careful!
            </span>
        </Panel>
