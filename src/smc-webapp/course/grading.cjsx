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
misc = require('smc-util/misc')
{defaults, required} = misc
{webapp_client} = require('../webapp_client')
{COLORS} = require('smc-util/theme')

# React libraries
{React, rclass, rtypes} = require('../smc-react')
{Alert, Button, ButtonToolbar, ButtonGroup, FormControl, FormGroup, Checkbox, Row, Col, Panel} = require('react-bootstrap')

# CoCalc and course components
util = require('./util')
styles = require('./styles')
{DateTimePicker, ErrorDisplay, Icon, LabeledRow, Loading, MarkdownInput, Space, Tip, NumberInput} = require('../r_misc')
{STEPS, step_direction, step_verb, step_ready} = util
{BigTime} = require('./common')

exports.GradingStudentAssignmentHeader = rclass
    displayName : "CourseEditor-GradingStudentAssignmentHeader"

    propTypes :
        name                : rtypes.string.isRequired
        redux               : rtypes.object.isRequired
        assignment          : rtypes.object.isRequired
        students            : rtypes.object.isRequired
        manual_grading      : rtypes.immutable.Map

    render_open: (store, student_id)->
        <ButtonToolbar>
            <Button>Open</Button>
        </ButtonToolbar>

    render_nav: (store, student_id) ->
        previous = =>
            @actions(@props.name).manual_grading(@props.assignment, student_id, true)
        next = =>
            @actions(@props.name).manual_grading(@props.assignment, student_id, false)
        exit = =>
            @actions(@props.name).manual_grading_stop()

        <ButtonToolbar>
            <Button
                onClick  = {previous}
                bsStyle  = {'default'}
            >
                <Icon name={'step-backward'} /> Previous
            </Button>
            <Button
                onClick  = {next}
                bsStyle  = {'primary'}
            >
                <Icon name={'step-forward'} /> Next Student
            </Button>
            <Button
                onClick  = {exit}
                bsStyle  = {'warning'}
            >
                <Icon name={'sign-out'} /> Exit Grading
            </Button>
        </ButtonToolbar>

    render: ->
        store       = @props.redux.getStore(@props.name)
        student_id  = @props.manual_grading?.get('student_id') ? undefined

        if student_id?
            student_name = store.get_student_name(student_id, true)
            info = <span style={marginRight:'2rem'}>Grading <b>{student_name?.full ? 'N/A'}</b></span>
        else
            info = <span>End of student list</span>

        progress = <span>{@props.manual_grading?.get('progress')} of N</span>

        <div style={display:'flex'}>
            {@render_nav(store, student_id)}
            {@render_open(store, student_id)}
            {info}
            {progress}
        </div>


exports.GradingStudentAssignment = rclass
    displayName : "CourseEditor-GradingStudentAssignment"

    propTypes :
        name                : rtypes.string.isRequired
        redux               : rtypes.object.isRequired
        assignment          : rtypes.object.isRequired
        students            : rtypes.object.isRequired
        user_map            : rtypes.object.isRequired
        manual_grading      : rtypes.immutable.Map

    collected: (student_id, time) ->
        collect_student_path = "#{@props.assignment.get('collect_path')}/#{student_id}"
        <span>
            {collect_student_path} at {time}
        </span>

    render: ->
        student_id  = @props.manual_grading?.get('student_id') ? undefined
        if not student_id?
            return <div>No student</div>
        store         = @props.redux.getStore(@props.name)
        assignment_id = @props.assignment.get('assignment_id')
        info          = store.student_assignment_info(student_id, @props.assignment)
        last_collect  = info.last_collect
        if last_collect.time?
            time          = <BigTime date={last_collect.time} />
        else
            time          = "never"
        <div>
            Last collected files {time}.
            <Button
                onClick = {=>@actions(@props.name).open_assignment('collected', assignment_id, student_id)}
            >
                <Icon name="folder-open-o" /> Open
            </Button>
            <br/>
            {@collected(student_id, time)}
        </div>
