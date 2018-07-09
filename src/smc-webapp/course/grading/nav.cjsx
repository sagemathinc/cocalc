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

# Global libs
immutable = require('immutable')

# CoCalc libraries
{defaults, required} = misc = require('smc-util/misc')
{webapp_client}      = require('../../webapp_client')
{Avatar}             = require('../../other-users')
{COLORS}             = require('smc-util/theme')
misc_page            = require('smc-webapp/misc_page')

# React libraries
{React, rclass, rtypes} = require('../../app-framework')
{DateTimePicker, ErrorDisplay, Icon, Loading, Space, Tip, CheckedIcon} = require('../../r_misc')
{Alert, Button, ButtonToolbar, ButtonGroup, Form, FormControl, FormGroup, ControlLabel, InputGroup, Checkbox, Row, Col, Panel, Breadcrumb} = require('react-bootstrap')

# Grading libs
{ROW_STYLE} = require('./common')

exports.Navigation = rclass
    displayName: 'CourseEditor-GradingStudentAssignment-Navigation'

    propTypes:
        name             : rtypes.string
        current_idx      : rtypes.number
        student_id       : rtypes.string
        assignment       : rtypes.immutable.Map
        only_not_graded  : rtypes.bool
        only_collected   : rtypes.bool

    shouldComponentUpdate: (next) ->
        update = misc.is_different(@props, next,
            ['current_idx', 'student_id', 'assignment', 'only_not_graded', 'only_collected'])
        return update

    set_only_not_graded: (only_not_graded) ->
        actions = @actions(@props.name)
        actions.grading_set_entry('only_not_graded', only_not_graded)

    set_only_collected: (only_collected) ->
        actions = @actions(@props.name)
        actions.grading_set_entry('only_collected', only_collected)

    render_filter_only_not_graded: ->
        only_not_graded = @props.only_not_graded

        <Button
            onClick  = {=>@set_only_not_graded(not only_not_graded)}
            bsStyle  = {'default'}
            style    = {whiteSpace:'nowrap'}
        >
            <CheckedIcon checked={only_not_graded} /> Not graded
        </Button>

    render_filter_only_collected: ->
        only_collected = @props.only_collected

        <Button
            onClick  = {=>@set_only_collected(not only_collected)}
            bsStyle  = {'default'}
            style    = {whiteSpace:'nowrap'}
        >
            <CheckedIcon checked={only_collected} /> Collected
        </Button>

    jump: (direction, without_grade, collected_files) ->
        @actions(@props.name).grading(
            assignment       : @props.assignment
            student_id       : @props.student_id
            direction        : direction
            without_grade    : without_grade
            collected_files  : collected_files
        )

    pick_next: (direction=1) ->
        without_grade   = @props.only_not_graded
        collected_files = @props.only_collected
        @jump(direction, without_grade, collected_files)

    render: ->
        style =
            display        : 'flex'
            flexDirection  : 'column'
            flex           : '2 0 0%'

        <div style={style}>
            <div style={ROW_STYLE}>
                <ButtonGroup>
                    <Button
                        onClick  = {=>@pick_next(-1)}
                        bsStyle  = {'default'}
                        disabled = {@props.current_idx == 0}
                    >
                        <Icon name={'step-backward'} />
                    </Button>
                    <Button
                        onClick  = {=>@pick_next(+1)}
                        bsStyle  = {'primary'}
                    >
                        <Icon name={'step-forward'} /> Pick next
                        <span className='hidden-md'> student</span>
                    </Button>
                </ButtonGroup>
            </div>
            <div style={color:COLORS.GRAY}>
                Filter students by:
            </div>
            <div style={ROW_STYLE}>
                <ButtonGroup style={display:'flex'}>
                    {@render_filter_only_not_graded()}
                    {@render_filter_only_collected()}
                </ButtonGroup>
            </div>
        </div>

