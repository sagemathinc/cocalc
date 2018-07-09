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
{COLORS}             = require('smc-util/theme')

# React libraries
{React, rclass, rtypes} = require('../../app-framework')
{DateTimePicker, ErrorDisplay, Icon, LabeledRow, Loading, MarkdownInput, Space, Tip, NumberInput, CheckedIcon} = require('../../r_misc')
{Alert, Button, ButtonToolbar, ButtonGroup, Form, FormControl, FormGroup, ControlLabel, InputGroup, Checkbox, Row, Col, Panel, Dropdown, DropdownButton, MenuItem} = require('react-bootstrap')

# grading specific
{Grading} = require('./models')
{MAXPOINTS} = require('./common')
{GradingHelpButton} = require('./extras')

exports.ConfigureGrading = rclass
    displayName : "CourseEditor-ConfigureGrading"

    propTypes :
        name                : rtypes.string.isRequired
        redux               : rtypes.object.isRequired
        assignment          : rtypes.object.isRequired
        close               : rtypes.func.isRequired

    shouldComponentUpdate: (props) ->
        return misc.is_different(@props, props, ['assignment'])

    set_grading_mode: (mode) ->
        a = @props.redux.getActions(@props.name)
        a.set_assignment_config(@props.assignment, {mode:mode})

    render_configure_grading_mode: ->
        store      = @props.redux.getStore(@props.name)
        mode       = store.get_grading_mode(@props.assignment)

        <div style={color:COLORS.GRAY_D, marginBottom:'10px'}>
            <div style={marginBottom:'10px'}>
                In <b>manual</b> mode you can assign an arbitrary grade
                (a letter, a number, or a short text) to the assignment of a student.
            </div>
            <div style={marginBottom:'10px'}>
                Whereas in <b>points</b> mode, the grade is filled in for you.
                It is the sum of all points given to the collected files
                of an assignment of a student.
                For example, when you assess <b>10 points</b> to <code>notebook1.ipynb</code>{' '}
                and <b>15 points</b> to <code>worksheet2.sagews</code>,
                this sums up to a total of <b>25 points</b>.
                Below, you also enter the maxium number of points for this assignment (e.g. 30).
                The grade shown to the student will be <b>25/30</b>.
                (Also, you can assign points beyond the maxium as extra credits.)
            </div>
            <div>
                <Button onClick = {=>@set_grading_mode('manual')}>
                    <CheckedIcon checked={mode == 'manual'} /> Manual
                </Button>
                <Space />
                <Button onClick = {=>@set_grading_mode('points')}>
                    <CheckedIcon checked={mode == 'points'} /> Points
                </Button>
            </div>
        </div>

    set_grading_maxpoints: (points) ->
        a = @props.redux.getActions(@props.name)
        a.set_assignment_config(@props.assignment, {maxpoints:points})

    render_configure_grading_maxpoints: ->
        store      = @props.redux.getStore(@props.name)
        mode       = store.get_grading_mode(@props.assignment)
        return null if mode != 'points'
        maxpoints  = store.get_grading_maxpoints(@props.assignment)

        <div style={color:COLORS.GRAY_D, marginBottom:'10px'}>
            <LabeledRow
                label_cols = {6}
                label      = {'Maxium number of points'}
            >
                <NumberInput
                    on_change       = {@set_grading_maxpoints}
                    min             = {1}
                    max             = {MAXPOINTS}
                    number          = {maxpoints}
                    plusminus       = {true}
                    select_on_click = {true}
                />
            </LabeledRow>
        </div>

    render_configure_grading_manual_scheme: ->
        store      = @props.redux.getStore(@props.name)
        mode       = store.get_grading_mode(@props.assignment)
        return null if mode != 'manual'
        <div style={color:COLORS.GRAY_D, marginBottom:'10px'}>
            Manual grading scheme allows you to enter arbitrary letters, text or numbers as grades.
        </div>

    render: ->
        config = @props.assignment.getIn(['config', 'mode'])

        <Alert bsStyle='warning'>
            <div style={float:'right'}>
                <GradingHelpButton show_help={true}/>
            </div>
            <h3><Icon name="gavel"/> Configure grading</h3>
            {@render_configure_grading_mode()}
            {@render_configure_grading_maxpoints()}
            {@render_configure_grading_manual_scheme()}
            <Button onClick={@props.close}>
                Close
            </Button>
        </Alert>