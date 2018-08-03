##############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2016 -- 2017, Sagemath Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
##############################################################################

{React, rclass, rtypes}  = require('../app-framework')
{Button, ButtonToolbar, Panel, Well} = require('react-bootstrap')
{Icon} = require('../r_misc')

exports.DeleteSharedProjectPanel = rclass
    propTypes:
        delete : rtypes.func.isRequired

    getInitialState: ->
        delete_shared_projects_confirm : false

    render_confirm_delete_shared_projects: ->
        <Well style={marginTop:'10px'}>
            The shared project will be deleted and all students removed from it.  (You will still have access to the deleted shared project in the Projects page.) Are you absolutely sure?
            <ButtonToolbar style={marginTop:'10px'}>
                <Button bsStyle='danger' onClick={=>@setState(delete_shared_projects_confirm:false); @props.delete()}>YES, DELETE the Shared Project</Button>
                <Button onClick={=>@setState(delete_shared_projects_confirm:false)}>Cancel</Button>
            </ButtonToolbar>
        </Well>

    render: ->
        <Panel header={<h4><Icon name='trash'/> Delete shared project</h4>}>
            <Button bsStyle='danger' onClick={=>@setState(delete_shared_projects_confirm:true)}><Icon name="trash"/> Delete Shared Project...</Button>
            {@render_confirm_delete_shared_projects() if @state.delete_shared_projects_confirm}
            <hr/>
            <span style={color:'#666'}>
                If for some reason you would like to delete the shared projects
                that you created for this course, you may do so by clicking above.
                Be careful!<br/>
                All students will be removed from the deleted shared projects.
            </span>
        </Panel>
