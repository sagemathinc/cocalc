##############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2016 -- 2017, Sagemath Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################

underscore = require('underscore')

# CoCalc libraries
{defaults, required} = misc = require('smc-util/misc')
{webapp_client}      = require('../webapp_client')
{COLORS}             = require('smc-util/theme')

# React libraries
{React, Fragment, rclass, rtypes}  = require('../app-framework')

{Button, ButtonToolbar, ButtonGroup, FormControl, FormGroup, Row, Col} = require('react-bootstrap')

{ErrorDisplay, Icon, MarkdownInput, Space, TimeAgo, Tip, is_different_date} = require('../r_misc')

immutable = require('immutable')

exports.RedCross = RedCross = rclass
    displayName : 'CourseEditor-RedCross'
    render: ->
        <span style={color:COLORS.BS_RED}>
            <Icon name={'times-circle'} />
        </span>

exports.GreenCheckmark = GreenCheckmark = rclass
    displayName : 'CourseEditor-GreenCheckmark'
    render : ->
        <span style={color:COLORS.BS_GREEN_DD}>
            <Icon name={'check-circle'} />
        </span>

exports.FoldersToolbar = require('./common/FoldersToolBar').FoldersToolbar

exports.BigTime = BigTime = rclass
    displayName : "CourseEditor-BigTime"

    propTypes:
        date : rtypes.oneOfType([rtypes.string, rtypes.object, rtypes.number])

    shouldComponentUpdate: (props) ->
        return is_different_date(@props.date, props.date)

    render: ->
        date = @props.date
        if not date?
            return
        if typeof(date) == 'string'
            date = misc.ISO_to_Date(date)
        return <TimeAgo popover={true} date={date} />

exports.StudentAssignmentInfoHeader = rclass
    displayName : "CourseEditor-StudentAssignmentInfoHeader"

    propTypes :
        title      : rtypes.string.isRequired
        peer_grade : rtypes.bool

    render_col: (number, key, width) ->
        switch key
            when 'last_assignment'
                title = 'Assign to Student'
                tip   = 'This column gives the status of making homework available to students, and lets you copy homework to one student at a time.'
            when 'collect'
                title = 'Collect from Student'
                tip   = 'This column gives status information about collecting homework from students, and lets you collect from one student at a time.'
            when 'grade'
                title = 'Grade'
                tip   = 'Record homework grade" tip="Use this column to record the grade the student received on the assignment. Once the grade is recorded, you can return the assignment.  You can also export grades to a file in the Configuration tab.'

            when 'peer-assign'
                title = 'Assign Peer Grading'
                tip   = 'This column gives the status of sending out collected homework to students for peer grading.'

            when 'peer-collect'
                title = 'Collect Peer Grading'
                tip   = 'This column gives status information about collecting the peer grading work that students did, and lets you collect peer grading from one student at a time.'

            when 'return_graded'
                title = 'Return to Student'
                tip   = 'This column gives status information about when you returned homework to the students.  Once you have entered a grade, you can return the assignment.'
                placement = 'left'
        <Col md={width} key={key}>
                <Tip title={title} tip={tip}>
                    <b>{number}. {title}</b>
                </Tip>
        </Col>


    render_headers: ->
        w = 3
        <Row>
            {@render_col(1, 'last_assignment', w)}
            {@render_col(2, 'collect', w)}
            {@render_col(3, 'grade', w)}
            {@render_col(4, 'return_graded', w)}
        </Row>

    render_headers_peer: ->
        w = 2
        <Row>
            {@render_col(1, 'last_assignment', w)}
            {@render_col(2, 'collect', w)}
            {@render_col(3, 'peer-assign', w)}
            {@render_col(4, 'peer-collect', w)}
            {@render_col(5, 'grade', w)}
            {@render_col(6, 'return_graded', w)}
        </Row>

    render: ->
        <Row style={borderBottom:'2px solid #aaa'} >
            <Col md={2} key='title'>
                <Tip title={@props.title} tip={if @props.title=="Assignment" then "This column gives the directory name of the assignment." else "This column gives the name of the student."}>
                    <b>{@props.title}</b>
                </Tip>
            </Col>
            <Col md={10} key="rest">
                {if @props.peer_grade then @render_headers_peer() else @render_headers()}
            </Col>
        </Row>

exports.StudentAssignmentInfo = rclass
    displayName : "CourseEditor-StudentAssignmentInfo"

    propTypes :
        name              : rtypes.string.isRequired
        title             : rtypes.oneOfType([rtypes.string,rtypes.object]).isRequired
        student           : rtypes.oneOfType([rtypes.string,rtypes.object]).isRequired # required string (student_id) or student immutable js object
        assignment        : rtypes.oneOfType([rtypes.string,rtypes.object]).isRequired # required string (assignment_id) or assignment immutable js object
        peer_grade_layout : rtypes.bool
        grade             : rtypes.string
        points            : rtypes.number
        edit_points       : rtypes.bool
        comments          : rtypes.string
        info              : rtypes.object.isRequired
        grading_mode      : rtypes.string.isRequired
        total_points      : rtypes.number.isRequired
        max_points        : rtypes.number.isRequired

    getInitialState: ->
        editing_grade   : false
        edited_grade    : @props.grade ? ''
        edited_comments : @props.comments ? ''

    componentWillReceiveProps: (nextProps) ->
        @setState(
            edited_grade    : nextProps.grade ? ''
            edited_comments : nextProps.comments ? ''
        )

    getDefaultProps: ->
        grade             : ''
        comments          : ''
        peer_grade_layout : false

    open: (type, assignment_id, student_id) ->
        @actions(@props.name).open_assignment(type, assignment_id, student_id)

    copy: (type, assignment_id, student_id) ->
        @actions(@props.name).copy_assignment(type, assignment_id, student_id)

    stop: (type, assignment_id, student_id) ->
        @actions(@props.name).stop_copying_assignment(type, assignment_id, student_id)

    save_grade: (e) ->
        e?.preventDefault?()
        @actions(@props.name).set_grade(@props.assignment, @props.student, @state.edited_grade)
        @actions(@props.name).set_comments(@props.assignment, @props.student, @state.edited_comments)
        @setState(editing_grade:false)

    edit_grade: ->
        @setState(editing_grade:true)

    edit_points: ->
        student_id = if typeof(@props.student) != 'string' then @props.student.get('student_id') else @props.student
        @actions(@props.name).grading(
            assignment  : @props.assignment
            student_id  : student_id
            direction   : 0
        )

    handle_change: (e) ->
        @setState(edited_grade: e.target.value ? '')

    render_grade_manual: ->
        if @state.editing_grade
            <form key='grade' onSubmit={@save_grade} style={marginTop:'15px'}>
                <FormGroup>
                    <FormControl
                        autoFocus   = {true}
                        value       = {@state.edited_grade}
                        ref         = 'grade_input'
                        type        = 'text'
                        placeholder = 'Grade (any text)...'
                        onChange    = {@handle_change}
                        onKeyDown   = {@on_key_down_grade_editor}
                    />
                </FormGroup>
            </form>
        else
            if @props.grade
                <div key='grade' onClick={@edit_grade}>
                    <strong>Grade</strong>: {@props.grade}<br/>
                    {<span><strong>Comments</strong>:</span> if @props.comments}
                </div>

    render_comments: (edit_button_text) ->
        save_disabled = @state.edited_grade == @props.grade and \
            @state.edited_comments == @props.comments

        rendered_style =
            maxHeight    : '4em'
            overflowY    : 'auto'
            padding      : '5px'
            border       : '1px solid #888'

        <MarkdownInput
            autoFocus          = {false}
            editing            = {@state.editing_grade}
            hide_edit_button   = {not (edit_button_text?.length > 0)}
            edit_button_text   = {edit_button_text}
            save_disabled      = {save_disabled}
            rows               = {5}
            placeholder        = 'Comments (optional)'
            default_value      = {@state.edited_comments}
            on_edit            = {=>@setState(editing_grade:true)}
            on_change          = {(value)=>@setState(edited_comments:value)}
            on_save            = {@save_grade}
            on_cancel          = {=>@setState(editing_grade:false)}
            rendered_style     = {rendered_style}
            edit_button_bsSize = {'small'}
        />

    on_key_down_grade_editor: (e) ->
        switch e.keyCode
            when 27
                @setState
                    edited_grade    : @props.grade
                    edited_comments : @props.comments
                    editing_grade   : false
            when 13
                if e.shiftKey
                    @save_grade()

    render_edit_points: ->
        style  = {float:'right', color:COLORS.GRAY}
        points = "#{misc.round2(@props.points ? 0)} #{misc.plural(@props.points, 'pt')}."
        if @props.edit_points
            <Tip
                title    = {"Points for this collected assignment"}
                tip      = {"Click to show the grading points edtior for the collected assignment of this student."}
            >
                <Button
                    style   = {style}
                    onClick = {@edit_points}
                    bsStyle = {'default'}
                >
                    {points}
                </Button>
            </Tip>
        else
            <span style={style}>{points}</span>

    render_grade_col_manual: ->
        bsStyle = if not (@props.grade).trim() then 'primary'
        text = if (@props.grade).trim() then 'Edit grade' else 'Enter grade'

        <Fragment>
            <Tip title="Enter student's grade" tip="Enter the grade that you assigned to your student on this assignment here.  You can enter anything (it doesn't have to be a number).">
                <Button key={'edit'} onClick={@edit_grade} bsStyle={bsStyle}>{text}</Button>
            </Tip>
            {@render_edit_points()}
            {@render_grade_manual()}
            {@render_comments()}
        </Fragment>

    render_grade_col_points: ->
        {grade2str}     = require('./grading/common')
        grade_points    = grade2str(@props.total_points, @props.max_points)
        grade_confirmed = grade_points == @props.grade

        if grade_confirmed
            grade_text = @props.grade
        else
            grade_text = '(unconfirmed)'

        if not @props.comments
            edit_button_text = 'Add comment…'

        <Fragment>
            {@render_edit_points()}
            <div key='grade'>
                {
                    if not grade_confirmed
                        <Fragment><RedCross />{' '}</Fragment>
                }
                <strong>Grade</strong>: {grade_text}<br/>
                {<span><strong>Comments</strong>:</span> if @props.comments}
            </div>
            {@render_comments(edit_button_text)}
        </Fragment>

    render_grade_col: ->
        switch @props.grading_mode
            when 'manual'
                return @render_grade_col_manual()
            when 'points'
                return @render_grade_col_points()

    render_last_time: (name, time) ->
        <div key='time' style={color:"#666"}>
            (<BigTime date={time} />)
        </div>

    render_open_recopy_confirm: (name, open, copy, copy_tip, open_tip, placement) ->
        key = "recopy_#{name}"
        if @state[key]
            v = []
            v.push <Button key="copy_confirm" bsStyle="danger" onClick={=>@setState("#{key}":false);copy()}>
                <Icon name="share-square-o" rotate={"180" if name.indexOf('ollect')!=-1}/> Yes, {name.toLowerCase()} again
            </Button>
            v.push <Button key="copy_cancel" onClick={=>@setState("#{key}":false);}>
                 Cancel
            </Button>
            if name.toLowerCase() == 'assign'
                v.push <div style={margin:'5px', display:'inline-block'}>
                           <a
                               target = {'_blank'}
                               href   = {'https://github.com/sagemathinc/cocalc/wiki/CourseCopy'}
                           >
                               What happens when I assign again?
                           </a>
                       </div>
            return v
        else
            <Button key="copy" bsStyle='warning' onClick={=>@setState("#{key}":true)}>
                <Tip title={name} placement={placement}
                    tip={<span>{copy_tip}</span>}>
                    <Icon name='share-square-o' rotate={"180" if name.indexOf('ollect')!=-1}/> {name}...
                </Tip>
            </Button>

    render_open_recopy: (name, open, copy, copy_tip, open_tip) ->
        placement = if name == 'Return' then 'left' else 'right'
        <ButtonToolbar key='open_recopy'>
            {@render_open_recopy_confirm(name, open, copy, copy_tip, open_tip, placement)}
            <Button key='open'  onClick={open}>
                <Tip title="Open assignment" placement={placement} tip={open_tip}>
                    <Icon name="folder-open-o" /> Open
                </Tip>
            </Button>
        </ButtonToolbar>

    render_open_copying: (name, open, stop) ->
        if name == "Return"
            placement = 'left'
        <ButtonGroup key='open_copying'>
            <Button key="copy" bsStyle='success' disabled={true}>
                <Icon name="cc-icon-cocalc-ring" spin /> {name}ing
            </Button>
            <Button key="stop" bsStyle='danger' onClick={stop}>
                <Icon name="times" />
            </Button>
            <Button key='open'  onClick={open}>
                <Icon name="folder-open-o" /> Open
            </Button>
        </ButtonGroup>

    render_copy: (name, copy, copy_tip) ->
        if name == "Return"
            placement = 'left'
        <Tip key="copy" title={name} tip={copy_tip} placement={placement} >
            <Button onClick={copy} bsStyle={'primary'}>
                <Icon name="share-square-o" rotate={"180" if name.indexOf('ollect')!=-1}/> {name}
            </Button>
        </Tip>

    render_error: (name, error) ->
        if typeof(error) != 'string'
            error = misc.to_json(error)
        if error.indexOf('No such file or directory') != -1
            error = 'Somebody may have moved the folder that should have contained the assignment.\n' + error
        else
            error = "Try to #{name.toLowerCase()} again:\n" + error
        <ErrorDisplay key='error' error={error} style={maxHeight: '140px', overflow:'auto'}/>

    render_last: (opts) ->
        opts = defaults opts,
            name        : required
            type        : required
            data        : {}
            enable_copy : false
            copy_tip    : ''
            open_tip    : ''
            omit_errors : false

        open = => @open(opts.type, @props.info.assignment_id, @props.info.student_id)
        copy = => @copy(opts.type, @props.info.assignment_id, @props.info.student_id)
        stop = => @stop(opts.type, @props.info.assignment_id, @props.info.student_id)
        v = []
        if opts.enable_copy
            if opts.data.start
                v.push(@render_open_copying(opts.name, open, stop))
            else if opts.data.time
                v.push(@render_open_recopy(opts.name, open, copy, opts.copy_tip, opts.open_tip))
            else
                v.push(@render_copy(opts.name, copy, opts.copy_tip))
        if opts.data.time
            v.push(@render_last_time(opts.name, opts.data.time))
        if opts.data.error and not opts.omit_errors
            v.push(@render_error(opts.name, opts.data.error))
        return v

    render_peer_assign: ->
        <Col md={2} key='peer_assign'>
            {@render_last
                name        : 'Peer Assign'
                data        : @props.info.last_peer_assignment
                type        : 'peer-assigned'
                enable_copy : @props.info.last_collect?
                copy_tip    : "Copy collected assignments from your project to this student's project so they can grade them."
                open_tip    : "Open the student's copies of this assignment directly in their project, so you can see what they are peer grading."
            }
        </Col>

    render_peer_collect: ->
        <Col md={2} key='peer_collect'>
            {@render_last
                name        : 'Peer Collect'
                data        : @props.info.last_peer_collect
                type        : 'peer-collected'
                enable_copy : @props.info.last_peer_assignment?
                copy_tip    : "Copy the peer-graded assignments from various student projects back to your project so you can assign their official grade."
                open_tip    : "Open your copy of your student's peer grading work in your own project, so that you can grade their work."
            }
        </Col>

    render_empty_peer_col: (which) ->
        <Col md={2} key={"peer-#{which}}"}><Row /></Col>

    render: ->
        peer_grade = @props.assignment.get('peer_grade')?.get('enabled')
        skip_grading = @props.assignment.get('skip_grading') ? false
        skip_assignment = @props.assignment.get('skip_assignment')
        skip_collect = @props.assignment.get('skip_collect')

        if peer_grade
            show_grade_col = !skip_grading and @props.info.last_peer_collect and not @props.info.last_peer_collect.error
            show_return_graded = @props.grade or (skip_grading and @props.info.last_peer_collect and not @props.info.last_peer_collect.error)
        else
            show_grade_col = (!skip_grading and @props.info.last_collect and not @props.info.last_collect.error) or skip_collect
            show_return_graded = @props.grade or (skip_grading and @props.info.last_collect and not @props.info.last_collect.error) or (skip_grading and skip_collect)

        width = if (peer_grade or @props.peer_grade_layout) then 2 else 3

        <Row style={borderTop:'1px solid #aaa', paddingTop:'5px', paddingBottom: '5px'}>
            <Col md={2} key="title">
                {@props.title}
            </Col>
            <Col md={10} key="rest">
                <Row>
                    <Col md={width} key='last_assignment'>
                        {@render_last
                            name        : 'Assign'
                            data        : @props.info.last_assignment
                            type        : 'assigned'
                            enable_copy : true
                            copy_tip    : "Copy the assignment from your project to this student's project so they can do their homework."
                            open_tip    : "Open the student's copy of this assignment directly in their project. " +
                                          "You will be able to see them type, chat with them, leave them hints, etc."
                            omit_errors : skip_assignment
                        }
                    </Col>
                    <Col md={width} key='last_collect'>
                        {if skip_assignment or not @props.info.last_assignment?.error then @render_last
                                name        : 'Collect'
                                data        : @props.info.last_collect
                                type        : 'collected'
                                enable_copy : @props.info.last_assignment? or skip_assignment
                                copy_tip    : "Copy the assignment from your student's project back to your project so you can grade their work."
                                open_tip    : "Open the copy of your student's work in your own project, so that you can grade their work."
                                omit_errors : skip_collect
                        }
                    </Col>
                    {@render_peer_assign()  if peer_grade and @props.info.peer_assignment and not @props.info.last_collect?.error}
                    {@render_peer_collect() if peer_grade and @props.info.peer_collect and not @props.info.peer_assignment?.error}
                    {@render_empty_peer_col('assign') if not peer_grade and @props.peer_grade_layout}
                    {@render_empty_peer_col('collect') if not peer_grade and @props.peer_grade_layout}
                    <Col md={width} key='grade'>
                        {@render_grade_col() if show_grade_col}
                    </Col>
                    <Col md={width} key='return_graded'>
                        {if show_return_graded then @render_last
                            name        : 'Return'
                            data        : @props.info.last_return_graded
                            type        : 'graded'
                            enable_copy : @props.info.last_collect? or skip_collect
                            copy_tip    : "Copy the graded assignment back to your student's project."
                            open_tip    : "Open the copy of your student's work that you returned to them. " +
                                          "This opens the returned assignment directly in their project." }
                    </Col>
                </Row>
            </Col>
        </Row>
