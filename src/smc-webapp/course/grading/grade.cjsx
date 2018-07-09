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
{DateTimePicker, ErrorDisplay, Icon, LabeledRow, Loading, MarkdownInput, Space, Tip, NumberInput} = require('../../r_misc')
{Alert, Button, ButtonToolbar, ButtonGroup, Form, FormControl, FormGroup, ControlLabel, InputGroup, Checkbox, Row, Col, Panel, Dropdown, DropdownButton, MenuItem} = require('react-bootstrap')

# grading specific
{Grading} = require('./models')
{GRADE_COMMENT_STYLE, grade2str} = require('./common')


exports.Grade = rclass
    displayName : 'CourseEditor-GradingStudentAssignment-Grade'

    propTypes :
        actions        : rtypes.object.isRequired
        store          : rtypes.object.isRequired
        assignment     : rtypes.immutable.Map
        student_id     : rtypes.string.isRequired
        list_of_grades : rtypes.immutable.OrderedSet
        grading_mode   : rtypes.string.isRequired
        total_points   : rtypes.number.isRequired
        max_points     : rtypes.number.isRequired

    grade_and_comment: (props) ->
        grade   = props.store.get_grade(props.assignment, props.student_id)
        comment = props.store.get_comments(props.assignment, props.student_id)
        return [grade, comment]

    getInitialState: ->
        [grade, comment] = @grade_and_comment(@props)
        return
            editing_grade   : false
            grade_help      : false
            grade_value     : grade
            grade_comments  : comment
            edited_grade    : grade
            edited_comments : comment

    componentWillReceiveProps: (props) ->
        return if not @props.student_id?
        if misc.is_different(@props, props, ['assignment', 'student_id'])
            [grade, comment] = @grade_and_comment(props)
            @setState(
                grade_value     : grade
                grade_comments  : comment
                edited_grade    : grade
                edited_comments : comment
            )

    shouldComponentUpdate: (props, state) ->
        update = misc.is_different(@state, state, ['editing_grade', 'edited_grade', 'edited_comments', 'grade_value', 'grade_comments', 'grade_help'])
        update or= misc.is_different(@props, props, ['assignment', 'student_id', 'grading_mode', 'total_points', 'max_points'])
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

    grade_points_mode: ->
        grade     = grade2str(@props.total_points, @props.max_points)
        is_graded = (@state.grade_value ? '').length > 0 and (grade == @state.grade_value)

        if is_graded
            text       = 'Graded'
            icon       = 'check-circle'
            style      = 'success'
            tstyle     = {textAlign: 'right'}
            grade_text = @state.grade_value ? ''
        else
            text       = 'Grade'
            icon       = 'gavel'
            style      = 'danger'
            tstyle     = {textAlign: 'right', fontWeight: 'bold', color: COLORS.BS_RED}
            grade_text = grade

        <form key={'grade'} onSubmit={->}>
            <FormGroup>
                <InputGroup>
                    <FormControl
                        autoFocus   = {false}
                        disabled    = {true}
                        type        = {'text'}
                        value       = {grade_text}
                        style       = {tstyle}
                    />
                    <InputGroup.Button>
                        <Button
                            bsStyle  = {style}
                            onClick  = {(e)=>@save_grade(e, grade)}
                            disabled = {is_graded}
                            style    = {whiteSpace:'nowrap'}
                        >
                            <Icon name={icon}/> {text}
                        </Button>
                    </InputGroup.Button>
                    <InputGroup.Button>
                        <Button
                            onClick  = {(e)=>@save_grade(e, '')}
                            disabled = {not is_graded}
                        >
                            <Icon name={'trash'} />
                        </Button>
                    </InputGroup.Button>
                    <InputGroup.Button>
                        <Button
                            bsStyle  = {'default'}
                            style    = {whiteSpace:'nowrap'}
                            onClick  = {=>@setState(grade_help:true)}
                        >
                            <Icon name='question-circle'/>
                        </Button>
                    </InputGroup.Button>
                </InputGroup>
            </FormGroup>
        </form>

    grade_comment_edit: ->
        style = GRADE_COMMENT_STYLE

        if not @state.editing_grade
            style = misc.merge({cursor:'pointer'}, style)

        <MarkdownInput
            autoFocus          = {false}
            editing            = {@state.editing_grade}
            hide_edit_button   = {@state.edited_comments?.length > 0}
            save_disabled      = {@save_disabled()}
            rows               = {3}
            placeholder        = {'Comments (optional, visible to student)'}
            default_value      = {@state.edited_comments}
            on_edit            = {=>@setState(editing_grade:true)}
            on_change          = {(value)=>@setState(edited_comments:value)}
            on_save            = {@save_grade}
            on_cancel          = {@grade_cancel}
            rendered_style     = {style}
            edit_button_text   = {'Add comment…'}
            edit_button_bsSize = {'small'}
        />

    render_ui: ->
        <React.Fragment>
            <div>
            {
                switch @props.grading_mode
                    when 'manual'
                        @grade_value_edit()
                    when 'points'
                        @grade_points_mode()
            }
            </div>
            <div>
                {
                    if @state.grade_comments?.length > 0
                        <div>
                            <b>Comment</b>
                            {' '}
                            <span style={color:COLORS.GRAY}>(visible to student)</span>
                        </div>
                }
                {@grade_comment_edit()}
            </div>
        </React.Fragment>

    render_help: ->
        <Alert bsStyle={'info'}>
            <h5>Points mode</h5>
            <div>
                Click to confirm that the grade is the total number of points.
                You can confgure the maximum by closing this grading editor and click on "Configure Grading".
            </div>
            <div style={textAlign:'right'}>
                <Button onClick = {=>@setState(grade_help:false)}>
                    Close
                </Button>
            </div>
        </Alert>

    render: ->
        # no clue why z-index 1 is necessary. otherwise the dropdown menu is behind the buttons of the component below ...
        style =
            display        : 'flex'
            flexDirection  : 'column'
            flex           : '3 0 0%'
            zIndex         : '1'

        <div style={style}>
        {
            if @state.grade_help
                @render_help()
            else
                @render_ui()
        }
        </div>
