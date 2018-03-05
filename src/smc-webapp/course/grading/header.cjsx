##############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2018, Sagemath Inc.
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

# CoCalc libraries
{defaults, required} = misc = require('smc-util/misc')
{webapp_client}      = require('../../webapp_client')
{Avatar}             = require('../../other-users')

# React libraries
{React, rclass, rtypes} = require('../../smc-react')
{DateTimePicker, ErrorDisplay, Icon, LabeledRow, Loading, MarkdownInput, Space, Tip, NumberInput} = require('../../r_misc')
{Alert, Button, ButtonToolbar, ButtonGroup, Form, FormControl, FormGroup, ControlLabel, InputGroup, Checkbox, Row, Col, Panel, Breadcrumb} = require('react-bootstrap')

# Grading specific code
{_init_state, _update_state} = require('./main')
{Grading} = require('./models')

exports.GradingStudentAssignmentHeader = rclass
    displayName : "CourseEditor-GradingStudentAssignmentHeader"

    propTypes :
        name         : rtypes.string.isRequired
        redux        : rtypes.object.isRequired
        end_of_list  : rtypes.bool
        student_id   : rtypes.string

    shouldComponentUpdate: (next) ->
        misc.is_different(@props, next, ['end_of_list', 'student_id'])

    getInitialState: ->
        store : @props.redux.getStore(@props.name)

    exit: ->
        @actions(@props.name).grading_stop()

    render_title: (student_name) ->
        if @props.end_of_list
            <h4>End</h4>
        else
            <h4>
                Grading student <b>{student_name}</b>
            </h4>

    render: ->
        student_info = @state.store.get_student_name(@props.student_id, true)
        student_name = student_info?.full ? 'N/A'
        <Row>
            <Col md={9}>
                {@render_title(student_name)}
            </Col>
            <Col md={3} style={textAlign:'right'}>
                <Button
                    onClick  = {@exit}
                    bsStyle  = {'warning'}
                >
                    <Icon name={'sign-out'} /> Close Grading
                </Button>
            </Col>
        </Row>
