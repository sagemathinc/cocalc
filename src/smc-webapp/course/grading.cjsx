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

exports.GradingStudentAssignmentHeader = rclass
    displayName : "CourseEditor-GradingStudentAssignmentHeader"

    propTypes :
        name         : rtypes.string.isRequired
        redux        : rtypes.object.isRequired
        assignment   : rtypes.object.isRequired
        students     : rtypes.object.isRequired
        grading      : rtypes.immutable.Map

    getInitialState: ->
        student_id :  _student_id(@props)
        editing_grade   : false
        edited_grade    : ''
        edited_comments : ''
        grade_value     : ''
        grade_comments  : ''

    componentWillReceiveProps: (next) ->
        if @props.grading != next.grading
            @setState(student_id:_student_id(next))

    render_open: (store)->
        <Col md={1}>
            <ButtonToolbar>
                <Button>Open?</Button>
            </ButtonToolbar>
        </Col>

    render_points: () ->
        <Col md={6}>
            <span>Total Points: 999</span>
        </Col>

    render_nav: (store) ->
        previous = =>
            @actions(@props.name).grading(@props.assignment, @state.student_id, true)
            @setState(editing_grade : false)
        next = =>
            @actions(@props.name).grading(@props.assignment, @state.student_id, false)
            @setState(editing_grade : false)
        exit = =>
            @actions(@props.name).grading_stop()

        <Col md={6}>
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
        </Col>

    save_grade: (e) ->
        e?.preventDefault?()
        @actions(@props.name).set_grade(@props.assignment, @state.student_id, @state.edited_grade)
        @actions(@props.name).set_comments(@props.assignment, @state.student_id, @state.edited_comments)
        @setState(editing_grade:false)

    on_key_down_grade_editor: (e) ->
        switch e.keyCode
            when 27
                @setState
                    edited_grade    : @state.grade_value
                    edited_comments : @state.grade_comments
                    editing_grade   : false
            when 13
                if e.shiftKey
                    @save_grade()

    grade: ->
        <Col>
            <span>"rendered grade information"</span>
            <Button
                bsStyle = {'primary'}
                onClick = {=>@setState(editing_grade:true)}
            >
                Edit Grade
            </Button>
        </Col>

    grade_value: ->
          <form key='grade' onSubmit={@save_grade} style={{}}>
                <FormGroup>
                    <FormControl
                        autoFocus   = {true}
                        value       = {@state.edited_grade}
                        ref         = 'grade_input'
                        type        = 'text'
                        placeholder = 'Grade (any text)...'
                        onChange    = {=>@setState(edited_grade:ReactDOM.findDOMNode(@refs.grade_input).value ? '')}
                        onKeyDown   = {@on_key_down_grade_editor}
                    />
                </FormGroup>
            </form>

    grade_comment: ->
        <MarkdownInput
            autoFocus        = {false}
            editing          = {@state.editing_grade}
            hide_edit_button = {true}
            save_disabled    = {@state.edited_grade == @props.grade and @state.edited_comments == @state.grade_comments}
            rows             = {3}
            placeholder      = 'Comments (optional)'
            default_value    = {@state.edited_comments}
            on_edit          = {=>@setState(editing_grade:true)}
            on_change        = {(value)=>@setState(edited_comments:value)}
            on_save          = {@save_grade}
            on_cancel        = {=>@setState(editing_grade:false)}
            rendered_style   = {maxHeight:'2rem', overflowY:'auto', padding:'5px', border: '1px solid #888'}
            />

    render_enter_grade: ->
        if @state.editing_grade
            <Row md={6} mdoffset={6}>
                <Col md={4}>
                    {@grade_value()}
                </Col>
                <Col md={8}>
                    {@grade_comment()}
                </Col>
            </Row>
        else
            <Row md={6} mdoffset={6}>
                {@grade()}
            </Row>

    render: ->
        store       = @props.redux.getStore(@props.name)

        if @state.student_id?
            student_name = store.get_student_name(@state.student_id, true)
            info =
                <Col md={3}>
                    Student <b>{student_name?.full ? 'N/A'}</b>
                </Col>
        else
            info = <Col md={3}>End of student list</Col>

        progress = <Col md={1}>{@props.grading?.get('progress') ? NaN} of NaN</Col>

        <Col>
            <Row>
                {@render_nav(store)}
                {@render_open(store)}
                {@render_points()}
                {info}
                {progress}
            </Row>
            {@render_enter_grade()}
        </Col>


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
        student_id : _student_id(@props)
        subdir     : _subdir(@props)

    componentWillReceiveProps: (next) ->
        if @props.grading != next.grading
            @setState(
                student_id    : _student_id(next)
                subdir        : _subdir(next)
            )

    collect_student_path: ->
        return path_join(@props.assignment.get('collect_path'), @state.student_id, @state.subdir)

    student_project_path: ->
        return path_join('NOT', 'YET', 'IMPLEMENTED', @state.student_id)

    render_open_collected_file : (filename) ->
        filepath = path_join(@collect_student_path(), filename)
        <Button
            onClick = {-> window.alert("OPEN #{filepath}")}
            bsStyle = {'primary'}
            bsSize  = {'small'}
        >
            <Icon name='eye' /> Collected file
        </Button>


    render_open_student_file : (filename) ->
        filepath = path_join(@student_project_path(), filename)
        <Button
            onClick = {-> window.alert("OPEN #{filepath}")}
            bsStyle = {'default'}
            bsSize  = {'small'}
        >
            <Icon name='eye' /> Student file
        </Button>

    render_autograde: (filename) ->
        filepath = path_join(@collect_student_path(), filename)
        ext = misc.separate_file_extension(filename).ext
        if ext == 'ipynb'
            <Button
                onClick = {-> window.alert("AUTOGRADE #{filepath}")}
                bsStyle = {'default'}
                bsSize  = {'small'}
            >
                <Icon name='graduation-cap' /> Autograde
            </Button>

    listing_header: ->
        <Row style={background: COLORS.GRAY_LL}>
            <Col md={3}>Filename</Col>
            <Col md={2}>Last modified</Col>
            <Col md={1}>Points</Col>
            <Col md={2}>Collected file</Col>
            <Col md={2}>Student file</Col>
            <Col md={2}>Autograde</Col>
        </Row>

    render_points_input: (filename) ->
        <NumberInput
            number    = {0}
            min       = {0}
            max       = {100}
            on_change = {(e) => console.log(misc.to_json(e))}
        />

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

        open_subdir = (subdir) =>
            <Button
                bsSize  = {'small'}
                onClick = {=>window.alert("Open subdirectory: #{subdir}")}
            >
                {"#{subdir}/"}
            </Button>


        dirinfo  = (filename, time) =>
            [
                <Col key={0} md={3}>{open_subdir(filename)}</Col>
                <Col key={2} md={2}>{time}</Col>
                <Col key={1} md={1}>{"Sum '#{filename}/'"}</Col>
            ]

        fileinfo = (filename, time) =>
            [
                <Col key={0} md={3}>{filename}</Col>
                <Col key={2} md={2}>{time}</Col>
                <Col key={1} md={1}>{@render_points_input(filename)}</Col>
            ]

        files = listing.get('files')
        return files.map (file, idx) =>
            filename = file.get('name')
            time     = <BigTime date={(file.get('mtime') ? 0) * 1000} />
            col      = if idx %% 2 == 0 then 'white' else COLORS.GRAY_LL
            isdir    = file.get('isdir') == true
            info     = if isdir then dirinfo else fileinfo

            <Row key={filename} style={background: col}>
                {info(filename, time)}
                <Col md={2}>{@render_open_collected_file(filename)}</Col>
                <Col md={2}>{@render_open_student_file(filename)}</Col>
                <Col md={2}>{@render_autograde(filename)}</Col>
            </Row>

    collected: (time) ->
        <Col>
            <Row>
                {@collect_student_path()} at {time}
            </Row>

            {### <Row>{misc.to_json(@props.grading.get('listing') ? 'Loading...')}</Row> ###}

            {@listing_header()}
            {@listing()}
        </Col>

    render: ->
        if not @state.student_id?
            return <div>No student</div>
        store         = @props.redux.getStore(@props.name)
        assignment_id = @props.assignment.get('assignment_id')
        info          = store.student_assignment_info(@state.student_id, @props.assignment)
        last_collect  = info.last_collect
        if last_collect?.time?
            time          = <BigTime date={last_collect.time} />
        else
            time          = "never"
        <div>
            Last collected files {time}.
            <Button
                onClick = {=>@actions(@props.name).open_assignment('collected', assignment_id, @state.student_id)}
            >
                <Icon name="folder-open-o" /> Open
            </Button>
            <br/>
            {@collected(time)}
        </div>
