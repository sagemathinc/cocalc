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

# React libraries
{React, rclass, rtypes} = require('../../smc-react')
{DateTimePicker, ErrorDisplay, Icon, LabeledRow, Loading, MarkdownInput, Space, Tip, NumberInput} = require('../../r_misc')
{Alert, Button, ButtonToolbar, ButtonGroup, Form, FormControl, FormGroup, ControlLabel, InputGroup, Checkbox, Row, Col, Panel, Dropdown, DropdownButton, MenuItem} = require('react-bootstrap')

# grading specific
{Grading} = require('./models')
{GRADE_COMMENT_STYLE} = require('./const')


exports.Grade = rclass
    displayName : 'CourseEditor-GradingStudentAssignment-Grade'

    propTypes :
        actions        : rtypes.object.isRequired
        store          : rtypes.object.isRequired
        assignment     : rtypes.immutable.Map
        student_id     : rtypes.string.isRequired
        list_of_grades : rtypes.immutable.OrderedSet

    getInitialState: ->
        editing_grade   : false
        edited_grade    : ''
        edited_comments : ''
        grade_value     : ''
        grade_comments  : ''

    componentWillReceiveProps: (props) ->
        return if not @props.student_id?
        if misc.is_different(@props, props, ['assignment', 'student_id'])
            grade      = props.store.get_grade(props.assignment, props.student_id)
            comment    = props.store.get_comments(props.assignment, props.student_id)
            @setState(
                grade_value     : grade
                grade_comments  : comment
                edited_grade    : grade
                edited_comments : comment
            )

    shouldComponentUpdate: (props, state) ->
        update = misc.is_different(@state, state, ['editing_grade', 'edited_grade', 'edited_comments', 'grade_value', 'grade_comments'])
        update or= misc.is_different(@props, props, ['assignment', 'student_id'])
        update or= @props.list_of_grades? and (not @props.list_of_grades.equals(props.list_of_grades))
        return update

    save_grade: (e, grade) ->
        e?.preventDefault?()
        @props.actions.set_grade(@props.assignment, @props.student_id, grade ? @state.edited_grade)
        @props.actions.set_comments(@props.assignment, @props.student_id, @state.edited_comments)
        @setState(editing_grade : false)

    grade_cancel: ->
        @setState(
            edited_grade    : @state.grade_value
            edited_comments : @state.grade_comments
            editing_grade   : false
        )

    on_key_down_grade_editor: (e) ->
        switch e.keyCode
            when 27
                @grade_cancel()
            when 13
                if e.shiftKey
                    @save_grade()

    save_disabled: ->
        @state.edited_grade == @state.grade_value and @state.edited_comments == @state.grade_comments

    grade_selected: (grade) ->
        @save_grade(null, grade)

    render_grade_dropdown_entries: ->
        @props.list_of_grades.map (grade) =>
            <MenuItem key={grade} eventKey={grade} onSelect={@grade_selected}>{grade}</MenuItem>

    render_grade_dropdown: ->
        <DropdownButton
            componentClass = {InputGroup.Button}
            title          = {''}
            id             = {'course-grading-select-grade'}
            pullRight
        >
        {
            if @props.list_of_grades?.size > 0
                @render_grade_dropdown_entries()
            else
                <MenuItem disabled>No known grades.</MenuItem>
        }
        </DropdownButton>

    grade_value_edit: ->
        <form key={'grade'} onSubmit={@save_grade}>
            <FormGroup>
                <InputGroup>
                    <InputGroup.Addon>
                        Grade
                    </InputGroup.Addon>
                    <FormControl
                        autoFocus   = {false}
                        ref         = {'grade_input'}
                        type        = {'text'}
                        placeholder = {'any text...'}
                        value       = {@state.edited_grade ? ''}
                        onChange    = {(e)=>@setState(edited_grade:e.target.value)}
                        onKeyDown   = {@on_key_down_grade_editor}
                        onBlur      = {@save_grade}
                    />
                    {@render_grade_dropdown()}
                    <InputGroup.Button>
                        <Button
                            bsStyle  = {'success'}
                            onClick  = {@save_grade}
                            disabled = {@save_disabled()}
                            style    = {whiteSpace:'nowrap'}
                        >
                            <Icon name='gavel'/>
                        </Button>
                    </InputGroup.Button>
                </InputGroup>
            </FormGroup>
        </form>

    grade_comment_edit: ->
        style = GRADE_COMMENT_STYLE

        if not @state.editing_grade
            style.cursor = 'pointer'

        <MarkdownInput
            autoFocus        = {false}
            editing          = {@state.editing_grade}
            hide_edit_button = {@state.edited_comments?.length > 0}
            save_disabled    = {@save_disabled()}
            rows             = {3}
            placeholder      = {'Comments (optional, visible to student)'}
            default_value    = {@state.edited_comments}
            on_edit          = {=>@setState(editing_grade:true)}
            on_change        = {(value)=>@setState(edited_comments:value)}
            on_save          = {@save_grade}
            on_cancel        = {@grade_cancel}
            rendered_style   = {style}
        />

    render: ->
        # no clue why z-index 1 is necessary. otherwise the dropdown menu is behind the buttons below ...
        <Col md={4} style={zIndex: '1'}>
            <Row>
                {@grade_value_edit()}
            </Row>
            <Row>
                <b>Comment:</b>
                <br/>
                {@grade_comment_edit()}
            </Row>
        </Col>
