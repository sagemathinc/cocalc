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
{Grading}    = require('./models')


exports.GradingStudentAssignmentHeader = rclass ({name}) ->
    displayName : "CourseEditor-GradingStudentAssignmentHeader"

    reduxProps :
        "#{name}":
            grading     : rtypes.instanceOf(Grading)
        account :
            account_id  : rtypes.string

    propTypes :
        name         : rtypes.string.isRequired
        redux        : rtypes.object.isRequired

    shouldComponentUpdate: (props) ->
        update = misc.is_different(@props.grading, props.grading, ['end_of_list', 'student_id', 'cursors', 'anonymous'])
        return update

    getInitialState: ->
        store : @props.redux.getStore(@props.name)

    exit: ->
        @actions(@props.name).grading_stop()

    open_grading_help: ->
        {open_new_tab} = require('smc-webapp/misc_page')
        open_new_tab('https://github.com/sagemathinc/cocalc/wiki/CourseGrading')

    render_presence: ->
        return if (not @props.grading.cursors?) or (not @props.grading.assignment_id?) or (not @props.grading.student_id?)
        min_10_ago = misc.server_minutes_ago(10)
        presence = []
        assignment_id = @props.grading.assignment_id
        student_id    = @props.grading.student_id
        whoelse       = @props.grading.cursors.getIn([assignment_id, student_id])
        whoelse?.map (time, account_id) =>
            # filter myself and old cursors
            return if account_id == @props.account_id or time < min_10_ago
            presence.push(
                <Avatar
                    key        = {account_id}
                    size       = {24}
                    account_id = {account_id}
                />
            )
        <h4>
            {"Also grading this student: " if presence.length > 0}
            {presence}
        </h4>

    student_name: ->
        if @props.grading.anonymous
            return misc.anonymize(@props.grading.student_id)
        else
            student_info = @state.store.get_student_name(@props.grading.student_id, true)
            return student_info?.full ? 'N/A'

    render_title: ->
        if @props.grading.end_of_list
            <h4>End</h4>
        else
            <h4>
                Grading student <b>{@student_name()}</b>
            </h4>

    render: ->
        <Row>
            <Col md={7}>
                {@render_title()}
            </Col>
            <Col md={3} style={textAlign:'right'}>
                {@render_presence()}
            </Col>
            <Col md={2} style={textAlign:'right', whiteSpace:'nowrap'}>
                <Button
                    onClick  = {@open_grading_help}
                    bsStyle  = {'default'}
                >
                    <Icon name='question-circle'/>
                </Button>
                <Space />
                <Button
                    onClick  = {@exit}
                    bsStyle  = {'warning'}
                >
                    <Icon name={'sign-out'} /> Close Grading
                </Button>
            </Col>
        </Row>
