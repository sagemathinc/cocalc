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

path      = require('path')
path_join = path.join
immutable = require('immutable')
_         = require('underscore')

# CoCalc libraries
{defaults, required} = misc = require('smc-util/misc')
{COLORS}             = require('smc-util/theme')
{Avatar}             = require('../../other-users')

# React libraries
{React, rclass, rtypes} = require('../../app-framework')
Fragment = React.Fragment
{DateTimePicker, ErrorDisplay, Icon, LabeledRow, Loading, MarkdownInput, Space, Tip, NumberInput} = require('../../r_misc')
{Alert, Button, ButtonToolbar, ButtonGroup, Form, FormControl, FormGroup, ControlLabel, InputGroup, Checkbox, Row, Col, Panel, Breadcrumb} = require('react-bootstrap')

# grading specific
{BigTime, GreenCheckmark, RedCross} = require('../common')
{Grading} = require('./models')
{ROW_STYLE, LIST_STYLE, LIST_ENTRY_STYLE, FLEX_LIST_CONTAINER, EMPTY_LISTING_TEXT, PAGE_SIZE, grade2str} = require('./common')

student_list_entries_style = misc.merge({cursor:'pointer'}, LIST_ENTRY_STYLE)

avatar_style =
    display        : 'inline-block'
    marginRight    : '10px'
    marginTop      : '-5px'
    marginBottom   : '-5px'

exports.StudentList = rclass
    displayName : 'CourseEditor-GradingStudentAssignment-StudentList'

    propTypes:
        name            : rtypes.string.isRequired
        store           : rtypes.object.isRequired
        assignment      : rtypes.immutable.Map
        cursors         : rtypes.immutable.Map
        student_list    : rtypes.immutable.List
        student_filter  : rtypes.string
        student_id      : rtypes.string
        account_id      : rtypes.string
        anonymous       : rtypes.bool
        grading_mode    : rtypes.string.isRequired
        max_points      : rtypes.number.isRequired

    shouldComponentUpdate: (props) ->
        update = misc.is_different(@props, props, \
            ['assignment', 'cursors', 'student_filter', 'student_id', 'account_id', \
            'anonymous', 'grading_mode', 'max_points'])
        update or= not @props.student_list.equals(props.student_list)
        return update

    student_list_entry_click: (student_id) ->
        @actions(@props.name).grading(
            assignment       : @props.assignment
            student_id       : student_id
            direction        : 0
            without_grade    : null
        )

    set_student_filter: (string) ->
        @setState(student_filter:string)
        @actions(@props.name).grading_set_student_filter(string)

    on_key_down_student_filter: (e) ->
        switch e.keyCode
            when 27
                @set_student_filter('')
                e?.preventDefault?()

    student_list_filter: ->
        disabled = @props.student_filter?.length == 0 ? true

        <form key={'filter_list'}>
            <FormGroup>
                <InputGroup>
                    <InputGroup.Addon>
                        Search
                    </InputGroup.Addon>
                    <FormControl
                        autoFocus   = {true}
                        ref         = {'stundent_filter'}
                        type        = {'text'}
                        placeholder = {'any text...'}
                        value       = {@props.student_filter ? ''}
                        onChange    = {(e)=>@set_student_filter(e.target.value)}
                        onKeyDown   = {@on_key_down_student_filter}
                    />
                    <InputGroup.Button>
                        <Button
                            bsStyle  = {if disabled then 'default' else 'warning'}
                            onClick  = {=>@set_student_filter('')}
                            disabled = {disabled}
                            style    = {whiteSpace:'nowrap'}
                        >
                            <Icon name={'times-circle'} />
                        </Button>
                    </InputGroup.Button>
                </InputGroup>
            </FormGroup>
        </form>

    render_student_list_entries_info: (active, grade_val, points, is_collected) ->
        col = if active then COLORS.GRAY_LL else COLORS.GRAY
        info_style =
            color          : col
            display        : 'inline-block'
            float          : 'right'

        show_grade  = (@props.grading_mode == 'manual') and (grade_val?.length > 0)
        show_points = points? or is_collected
        return null if (not show_points) and (not show_grade)
        info = []
        if show_grade
            info.push(misc.trunc(grade_val, 15))
        if show_points
            info.push("#{misc.round2(points) ? 0} #{misc.plural(points, 'pt')}.")

        switch @props.grading_mode
            when 'points'
                grade     = grade2str(points, @props.max_points)
                is_graded = ((grade_val ? '').length > 0) and (grade == grade_val)
                if is_graded
                    extra = <Fragment>{' '}<GreenCheckmark /></Fragment>
            when 'manual'
                if show_grade
                    extra = <Fragment>{' '}<GreenCheckmark /></Fragment>

        <span style={info_style}>
            {info.join(', ')}
            {extra if extra?}
        </span>

    render_student_list_presenece: (student_id) ->
        # presence of other teachers
        # cursors are only relevant for the last 10 minutes (componentDidMount updates with a timer)
        return if not @props.cursors?
        min_10_ago = misc.server_minutes_ago(10)
        presence = []
        assignment_id = @props.assignment.get('assignment_id')
        whoelse = @props.cursors.getIn([assignment_id, student_id])
        whoelse?.map (time, account_id) =>
            # filter myself and old cursors
            return if account_id == @props.account_id or time < min_10_ago
            presence.push(
                <Avatar
                    key        = {account_id}
                    size       = {22}
                    account_id = {account_id}
                />
            )
            return

        style =
            marginRight    : '10px'
            display        : 'inline-block'
            marginTop      : '-5px'
            marginBottom   : '-5px'
            float          : 'right'

        if presence.length > 0
            <span style={style}>
                {presence}
            </span>


    render_student_list_entries: ->
        list = @props.student_list.map (student, idx) =>
            student_id   = student.get('student_id')
            account_id   = student.get('account_id')
            if @props.anonymous
                name     = misc.anonymize(student_id)
            else
                name     = @props.store.get_student_name(student)
            points       = @props.store.get_points_total(@props.assignment, student_id)
            is_collected = @props.store.student_assignment_info(student_id, @props.assignment)?.last_collect?.time?

            # should this student be highlighted in the list?
            current      = @props.student_id == student_id
            active       = if current then 'active' else ''
            grade_val    = @props.store.get_grade(@props.assignment, student_id)

            if not active
                bgcol = if idx %% 2 == 0 then 'white' else COLORS.GRAY_LLL
                style = misc.merge({background:bgcol}, student_list_entries_style)
            else
                style = student_list_entries_style

            <li
                key        = {student_id}
                className  = {"list-group-item " + active}
                onClick    = {=>@student_list_entry_click(student_id)}
                style      = {style}
            >
                <span style={float:'left'}>
                    {<div style={avatar_style}>
                        <Avatar
                            size       = {22}
                            account_id = {account_id}
                        />
                    </div> if (account_id?) and (not @props.anonymous)}
                    {name}
                </span>
                {@render_student_list_entries_info(active, grade_val, points, is_collected)}
                {@render_student_list_presenece(student_id)}
            </li>

        if list.size == 0
            list.push(<li style={EMPTY_LISTING_TEXT}>No student matches…</li>)
        return list

    render: ->
        flex =
            display        : 'flex'
            flexDirection  : 'column'

        ret = [
            <Row style={FLEX_LIST_CONTAINER} key={2}>
                <ul
                    className = {'list-group'}
                    ref       = {'student_list'}
                    style     = {LIST_STYLE}
                >
                    {@render_student_list_entries()}
                </ul>
            </Row>
            <Row style={color:COLORS.GRAY} key={3}>
                <Checkbox
                    checked  = {@props.anonymous}
                    onChange = {=>@actions(@props.name).grading_toggle_anonymous()}
                >
                    Anonymize students
                </Checkbox>
            </Row>
        ]
        if not @props.anonymous
            ret.unshift(
                <Row key={1}>
                    {@student_list_filter()}
                </Row>
            )
        return ret
