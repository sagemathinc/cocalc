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

# CoCalc libraries
{defaults, required} = misc = require('smc-util/misc')
{webapp_client}      = require('../webapp_client')
{COLORS}             = require('smc-util/theme')

# React libraries
{React, rclass, rtypes} = require('../smc-react')
{Alert, Button, ButtonToolbar, ButtonGroup, FormControl, FormGroup, Checkbox, Row, Col, Panel} = require('react-bootstrap')

# CoCalc and course components
util = require('./util')
styles = require('./styles')
{DateTimePicker, ErrorDisplay, Icon, LabeledRow, Loading, MarkdownInput, Space, Tip, NumberInput} = require('../r_misc')
{STEPS, step_direction, step_verb, step_ready} = util
{BigTime} = require('./common')


_student_id = (props) ->
    props.grading?.get('student_id')

_subdir = (props) ->
    props.grading?.get('subdir') ? ''

# filter predicate for file listing, return true for less important files
# also match name.ext~ variants in case of multiple rsyncs ...
course_specific_files = (entry) ->
    for fn in ['DUE_DATE.txt', 'GRADE.txt', 'STUDENT - ']
        return true if entry.get('name').indexOf(fn) == 0
    return false

_init_state = (props) ->
    store           : props.redux.getStore(props.name)
    student_id      :  _student_id(props)
    editing_grade   : false
    edited_grade    : ''
    edited_comments : ''
    grade_value     : undefined
    grade_comments  : undefined
    student_info    : undefined
    subdir          : ''

_update_state = (props, next, state, setState) ->
    if props.grading != next.grading
        student_id = _student_id(next)
        grade      = state.store.get_grade(props.assignment, student_id)
        comment    = state.store.get_comments(props.assignment, student_id)
        return
            student_id      : student_id
            grade_value     : grade
            grade_comments  : comment
            edited_grade    : grade
            edited_comments : comment
            student_info    : state.store.student_assignment_info(student_id, props.assignment)
            subdir          : _subdir(props)

exports.GradingStudentAssignmentHeader = rclass
    displayName : "CourseEditor-GradingStudentAssignmentHeader"

    propTypes :
        name         : rtypes.string.isRequired
        redux        : rtypes.object.isRequired
        assignment   : rtypes.object.isRequired
        students     : rtypes.object.isRequired
        grading      : rtypes.immutable.Map

    getInitialState: ->
        return _init_state(@props)

    componentWillReceiveProps: (next) ->
        x = _update_state(@props, next, @state)
        @setState(x) if x?

    open_assignment: (type) ->
        @actions(@props.name).open_assignment(type, @props.assignment, @state.student_id)

    render_open: ->
        [
            <Row key={'top'}>
                Open assignment
            </Row>
            <Row key={'buttons'}>
                <ButtonToolbar>
                    <Button
                        onClick = {=>@open_assignment('assigned')}
                        bsSize  = {'small'}
                    >
                        <Icon name="folder-open-o" /> Student files
                    </Button>
                    <Button
                        onClick = {=>@open_assignment('collected')}
                        bsSize  = {'small'}
                    >
                        <Icon name="folder-open-o" /> Collected files
                    </Button>
                </ButtonToolbar>
            </Row>
        ]


    previous: (without_grade) ->
        @actions(@props.name).grading(
            assignment       : @props.assignment
            student_id       : @state.student_id
            direction        : -1
            without_grade    : without_grade
        )

    next: (without_grade) ->
        @actions(@props.name).grading(
            assignment       :  @props.assignment
            student_id       : @state.student_id
            direction        : 1
            without_grade    : without_grade
        )

    exit: ->
        @actions(@props.name).grading_stop()

    render_progress: ->
        return <span>{@props.grading?.get('progress') ? NaN} of {@props.students?.size ? NaN}</span>

    render_nav: ->
        rowstyle =
            marginBottom: '10px'

        <Col md={4}>
            <Row style={rowstyle}>
                {@render_progress()}
            </Row>
            <Row style={rowstyle}>
                <ButtonToolbar>
                    <Button
                        onClick  = {=>@previous(false)}
                        bsStyle  = {'default'}
                    >
                        <Icon name={'step-backward'} /> Previous
                    </Button>
                    <Button
                        onClick  = {=>@next(false)}
                        bsStyle  = {'default'}
                    >
                        <Icon name={'step-forward'} /> Next Student
                    </Button>
                </ButtonToolbar>
            </Row>
            <Row style={rowstyle}>
                <ButtonToolbar>
                    <Button
                        onClick  = {=>@previous(true)}
                        bsStyle  = {'default'}
                    >
                        <Icon name={'step-backward'} /> Previous
                    </Button>
                    <Button
                        onClick  = {=>@next(true)}
                        bsStyle  = {'primary'}
                    >
                        <Icon name={'step-forward'} /> Next to Grade
                    </Button>
                </ButtonToolbar>
            </Row>
        </Col>

    save_grade: (e) ->
        e?.preventDefault?()
        @actions(@props.name).set_grade(@props.assignment, @state.student_id, @state.edited_grade)
        @actions(@props.name).set_comments(@props.assignment, @state.student_id, @state.edited_comments)
        @setState(editing_grade   : false)
        #@next()

    grade: ->
        <Col>
            <ButtonToolbar>
                <Button
                    bsStyle = {'primary'}
                    onClick = {=>save_grade()}
                >
                    Save Grade
                </Button>
            </ButtonToolbar>
        </Col>

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

    grade_value_edit: ->
          <form key={'grade'} onSubmit={@save_grade} style={{}}>
                <FormGroup>
                    <FormControl
                        autoFocus   = {true}
                        ref         = {'grade_input'}
                        type        = {'text'}
                        placeholder = {'Grade (any text)...'}
                        value       = {@state.edited_grade}
                        onChange    = {(e)=>@setState(edited_grade:e.target.value)}
                        onKeyDown   = {@on_key_down_grade_editor}
                        onBlur      = {@save_grade}
                    />
                </FormGroup>
            </form>

    grade_comment_edit: ->
        <MarkdownInput
            autoFocus        = {false}
            editing          = {@state.editing_grade}
            hide_edit_button = {false}
            save_disabled    = {@state.edited_grade == @props.grade_value and @state.edited_comments == @state.grade_comments}
            rows             = {3}
            placeholder      = {'Comments (optional)'}
            default_value    = {@state.edited_comments}
            on_edit          = {=>@setState(editing_grade:true)}
            on_change        = {(value)=>@setState(edited_comments:value)}
            on_save          = {@save_grade}
            on_cancel        = {@grade_cancel}
            rendered_style   = {maxHeight:'5rem', overflowY:'auto', padding:'5px', border: "1px solid #{COLORS.GRAY_L}"}
        />

    render_enter_grade: ->
        <Col md={4}>
            <Row>
                {@grade_value_edit()}
            </Row>
            <Row>
                <b>Comment:</b>
                <br/>
                {@grade_comment_edit()}
            </Row>
        </Col>

    render_info: ->
        <Row style={fontSize:'120%'}>
        {
            if @state.student_id?
                student_name = @state.store.get_student_name(@state.student_id, true)
                <span>Student <b>{student_name?.full ? 'N/A'}</b></span>
            else
                <span>End of student list</span>
        }
        </Row>

    render_points: ->
        total = @state.store.get_points_total(@props.assignment, @state.student_id)
        <Row style={fontSize:'120%'}>
            <span>Total Points: <b>{total}</b></span>
        </Row>

    render: ->
        <Row>
            {@render_nav()}
            <Col md={3}>
                {@render_info()}
                {@render_points()}
                {@render_open()}
            </Col>
            {@render_enter_grade()}
            <Col md={1}>
                <ButtonToolbar>
                    <Button
                        onClick  = {@exit}
                        bsStyle  = {'warning'}
                    >
                        <Icon name={'sign-out'} /> Exit Grading
                    </Button>
                </ButtonToolbar>
            </Col>
        </Row>


exports.GradingStudentAssignment = rclass
    displayName : "CourseEditor-GradingStudentAssignment"

    propTypes :
        name         : rtypes.string.isRequired
        redux        : rtypes.object.isRequired
        assignment   : rtypes.object.isRequired
        students     : rtypes.object.isRequired
        user_map     : rtypes.object.isRequired
        grading      : rtypes.immutable.Map

    getInitialState: ->
        return _init_state(@props)

    componentWillReceiveProps: (next) ->
        x = _update_state(@props, next, @state)
        @setState(x) if x?

    collect_student_path: ->
        return path_join(@props.assignment.get('collect_path'), @state.student_id, @state.subdir)

    student_project_path: ->
        return path_join('NOT', 'YET', 'IMPLEMENTED', @state.student_id)

    render_open_collected_file : (filename) ->
        filepath = @fullpath(filename)
        <Button
            onClick = {-> window.alert("OPEN #{filepath}")}
            bsStyle = {'primary'}
            bsSize  = {'small'}
        >
            <Icon name='eye' /> Collected file
        </Button>

    render_open_student_file: (filename) ->
        filepath = path_join(@student_project_path(), filename)
        <Button
            onClick = {-> window.alert("OPEN #{filepath}")}
            bsStyle = {'default'}
            bsSize  = {'small'}
        >
            <Icon name='eye' /> Student file
        </Button>

    filepath: (filename) ->
        path_join(@state.subdir, filename)

    fullpath: (filename) ->
        path_join(@collect_student_path(), filename)

    autograde: (ext, filename) ->
        # ext in ['ipynb']
        fullpath = @fullpath(filename)
        setTimeout((=> @save_points(filename, Math.floor(10 * Math.random()))), 1000)

    render_autograde: (filename) ->
        ext = misc.separate_file_extension(filename).ext
        if ext == 'ipynb'
            <Button
                onClick = {=>@autograde(ext, filename)}
                bsStyle = {'default'}
                bsSize  = {'small'}
            >
                <Icon name='graduation-cap' /> Autograde
            </Button>

    listing_header: ->
        <Row style={background: COLORS.GRAY_LL}>
            <Col md={3}>Filename</Col>
            <Col md={1}>Last modified</Col>
            <Col md={2}>Points</Col>
            <Col md={2}>Autograde</Col>
            <Col md={2}>Collected file</Col>
            <Col md={2}>Student file</Col>
        </Row>

    save_points: (filename, points) ->
        filepath = @filepath(filename)
        @actions(@props.name).set_points(@props.assignment, @state.student_id, filepath, points)

    render_points_input: (filename) ->
        filepath = @filepath(filename)
        points   = @state.store.get_points(@props.assignment, @state.student_id, filepath)
        <NumberInput
            number         = {points}
            bsSize         = {'small'}
            min            = {0}
            max            = {99999}
            formgroupstyle = {'marginBottom' : 0}
            on_change      = {(val)=>@save_points(filename, val)}
            plusminus      = {true}
        />

    render_points_subdir: (subdir) ->
        p = @state.store.get_points_subdir(@props.assignment, @state.student_id, subdir)
        return "Sum: #{p}"

    open_subdir: (subdir) ->
        <Button
            bsSize  = {'small'}
            onClick = {=>@actions(@props.name).grading(
                assignment       : @props.assignment
                student_id       : @state.student_id
                direction        : 0
                without_grade    : null
                subdir           : subdir
            )}
        >
            {"Open #{subdir}/"}
        </Button>

    listing_directory_row: (filename, time) ->
        subdirpath = path_join(@state.subdir, filename)

        [
            <Col key={0} md={3}>{@open_subdir(subdirpath)}</Col>
            <Col key={1} md={1}>{time}</Col>
            <Col key={2} md={2}>{@render_points_subdir(subdirpath)}</Col>
            <Col key={3} md={6}></Col>
        ]

    listing_file_row: (filename, time) ->
        [
            <Col key={0} md={3}>{filename}</Col>
            <Col key={1} md={1}>{time}</Col>
            <Col key={2} md={2}>{@render_points_input(filename)}</Col>
            <Col key={3} md={2}>{@render_autograde(filename)}</Col>
            <Col key={4} md={2}>{@render_open_collected_file(filename)}</Col>
            <Col key={5} md={2}>{@render_open_student_file(filename)}</Col>
        ]

    listing_rowstyle: (idx) ->
        col = if idx %% 2 == 0 then 'white' else COLORS.GRAY_LL
        return
            background     : col
            paddingTop     : '5px'
            paddingBottom  : '5px'

    listing: ->
        listing = @props.grading.get('listing')
        return <Loading /> if not listing?

        error   = listing.get('error')
        if error?
            if error = 'no_dir'
                # TODO insert collect button here and refresh listing accordingly ...
                return <div>No directory. Not yet collected from student?</div>
            else
                return <div>Got error listing directory: {error}</div>

        return listing.get('files').filterNot(course_specific_files).map (file, idx) =>
            filename = file.get('name')
            time     = <BigTime date={(file.get('mtime') ? 0) * 1000} />
            isdir    = file.get('isdir') == true

            <Row key={filename} style={@listing_rowstyle(idx)}>
                {
                    if isdir
                        @listing_directory_row(filename, time)
                    else
                        @listing_file_row(filename, time)
                }
            </Row>

    collected: ->
        last_collect  = @state.student_info?.last_collect
        if last_collect?.time?
            time          = <BigTime date={last_collect.time} />
        else
            time          = "never"

        <Row>
            {@collect_student_path()} collected {time}
        </Row>

    render_up: ->
        return null if not (@state.subdir?.length > 0)
        updir = @state.subdir.split('/')[...-1].join('/')
        <Button
            bsSize  = {'small'}
            onClick = {=>@actions(@props.name).grading(
                assignment       : @props.assignment
                student_id       : @state.student_id
                direction        : 0
                without_grade    : null
                subdir           : updir
            )}
        >
            <Icon name='arrow-up' /> Up
        </Button>

    render: ->
        if not @state.student_id?
            return <div>No student</div>

        if @props.grading.get('end_of_list')
            return <div>You reached the end of students list.</div>

        <div>
            {###
            Info: <code>{misc.to_json(@state.student_info)}</code>.
            <br/>
            ###}
            {@collected()}
            {@render_up()}
            {@listing_header()}
            {@listing()}
        </div>
