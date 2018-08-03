##############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2016, Sagemath Inc.
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
{React, rclass, rtypes} = require('../app-framework')
{Alert, Button, ButtonToolbar, ButtonGroup, FormControl, FormGroup, Checkbox, Row, Col, Panel} = require('react-bootstrap')

# CoCalc and course components
util = require('./util')
styles = require('./styles')
{DateTimePicker, ErrorDisplay, Icon, LabeledRow, Loading, MarkdownInput, Space, Tip, NumberInput, CheckedIcon} = require('../r_misc')
{STEPS, step_direction, step_verb, step_ready} = util
{BigTime, FoldersToolbar, StudentAssignmentInfo, StudentAssignmentInfoHeader} = require('./common')
{GradingStudentAssignment} = require('./grading/main')
{GradingStudentAssignmentHeader} = require('./grading/header')
{Grading} = require('./grading/models')
{AssignmentNote} = require('./assignment_note')
{ConfigureGrading} = require('./grading/configure_grading')

{Progress} = require('./progress')
{SkipCopy} = require('./skip')


exports.AssignmentsPanel = rclass ({name}) ->
    displayName : "CourseEditorAssignments"

    reduxProps :
        "#{name}":
            expanded_assignments     : rtypes.immutable.Set
            active_assignment_sort   : rtypes.immutable.Map
            active_student_sort      : rtypes.immutable.Map
            expanded_peer_configs    : rtypes.immutable.Set
            expanded_grading_configs : rtypes.immutable.Set
            grading                  : rtypes.instanceOf(Grading)

    propTypes :
        name            : rtypes.string.isRequired
        project_id      : rtypes.string.isRequired
        redux           : rtypes.object.isRequired
        actions         : rtypes.object.isRequired
        all_assignments : rtypes.object.isRequired
        students        : rtypes.object.isRequired
        user_map        : rtypes.object.isRequired
        path            : rtypes.string.isRequired

    getInitialState: ->
        err           : undefined  # error message to display at top.
        search        : ''         # search query to restrict which assignments are shown.
        show_deleted  : false      # whether or not to show deleted assignments on the bottom

    compute_assignment_list: ->
        list = util.immutable_to_list(@props.all_assignments, 'assignment_id')

        {list, num_omitted} = util.compute_match_list
            list        : list
            search_key  : 'path'
            search      : @state.search.trim()

        if @props.active_assignment_sort.get('column_name') == "due_date"
            f = (a) -> [a.due_date ? 0, a.path?.toLowerCase()]
        else if @props.active_assignment_sort.get('column_name') == "dir_name"
            f = (a) -> [a.path?.toLowerCase(), a.due_date ? 0]

        {list, deleted, num_deleted} = util.order_list
            list             : list
            compare_function : (a,b) => misc.cmp_array(f(a), f(b))
            reverse          : @props.active_assignment_sort.get('is_descending')
            include_deleted  : @state.show_deleted

        return {shown_assignments:list, deleted_assignments:deleted, num_omitted:num_omitted, num_deleted:num_deleted}

    render_sort_link: (column_name, display_name) ->
        <a href=''
            onClick={(e)=>e.preventDefault();@actions(@props.name).set_active_assignment_sort(column_name)}>
            {display_name}
            <Space/>
            {<Icon style={marginRight:'10px'}
                name={if @props.active_assignment_sort.get('is_descending') then 'caret-up' else 'caret-down'}
            /> if @props.active_assignment_sort.get('column_name') == column_name}
        </a>

    render_assignment_table_header: ->
        # HACK: -10px margin gets around ReactBootstrap's incomplete access to styling
        <Row style={marginTop:'-10px', marginBottom:'3px'}>
            <Col md={6}>
                {@render_sort_link("dir_name", "Assignment Name")}
            </Col>
            <Col md={6}>
                {@render_sort_link("due_date", "Due Date")}
            </Col>
        </Row>

    render_assignments: (assignments) ->
        for x,i in assignments
            <Assignment
                key                   = {x.assignment_id}
                project_id            = {@props.project_id}
                name                  = {@props.name}
                redux                 = {@props.redux}
                assignment            = {@props.all_assignments.get(x.assignment_id)}
                background            = {if i%2==0 then "#eee"}
                students              = {@props.students}
                user_map              = {@props.user_map}
                is_expanded           = {@props.expanded_assignments.has(x.assignment_id)}
                active_student_sort   = {@props.active_student_sort}
                expand_peer_config    = {@props.expanded_peer_configs.has(x.assignment_id)}
                expand_grading_config = {@props.expanded_grading_configs.has(x.assignment_id)}
                grading               = {@props.grading}
                path                  = {@props.path}
            />

    render_show_deleted: (num_deleted, num_shown) ->
        if @state.show_deleted
            <Button style={styles.show_hide_deleted(needs_margin : num_shown > 0)} onClick={=>@setState(show_deleted:false)}>
                <Tip placement='left' title="Hide deleted" tip="Assignments are never really deleted.  Click this button so that deleted assignments aren't included at the bottom of the list.  Deleted assignments are always hidden from the list of grades for a student.">
                    Hide {num_deleted} deleted assignments
                </Tip>
            </Button>
        else
            <Button style={styles.show_hide_deleted(needs_margin : num_shown > 0)} onClick={=>@setState(show_deleted:true,search:'')}>
                <Tip placement='left' title="Show deleted" tip="Assignments are not deleted forever even after you delete them.  Click this button to show any deleted assignments at the bottom of the list of assignments.  You can then click on the assignment and click undelete to bring the assignment back.">
                    Show {num_deleted} deleted assignments
                </Tip>
            </Button>

    yield_adder: (deleted_assignments) ->
        deleted_paths = {}
        deleted_assignments.map (obj) =>
            if obj.path
                deleted_paths[obj.path] = obj.assignment_id

        (path) =>
            if deleted_paths[path]?
                @props.actions.undelete_assignment(deleted_paths[path])
            else
                @props.actions.add_assignment(path)


    render_assignments_main: ->
        {shown_assignments, deleted_assignments, num_omitted, num_deleted} = @compute_assignment_list()
        add_assignment = @yield_adder(deleted_assignments)

        header =
            <FoldersToolbar
                search           = {@state.search}
                search_change    = {(value) => @setState(search:value)}
                num_omitted      = {num_omitted}
                project_id       = {@props.project_id}
                items            = {@props.all_assignments}
                add_folders      = {(paths)=>paths.map(add_assignment)}
                item_name        = {"assignment"}
                plural_item_name = {"assignments"}
            />

        <Panel header={header}>
            {@render_assignment_table_header() if shown_assignments.length > 0}
            {@render_assignments(shown_assignments)}
            {@render_show_deleted(num_deleted, shown_assignments.length) if num_deleted}
        </Panel>

    render_grading_main: ->
        assignment = @props.all_assignments.get(@props.grading.assignment_id)

        header      =
            <GradingStudentAssignmentHeader
                redux          = {@props.redux}
                name           = {@props.name}
                assignment     = {assignment}
            />

        <Panel header={header}>
            <GradingStudentAssignment
                redux          = {@props.redux}
                name           = {@props.name}
                assignment     = {assignment}
                students       = {@props.students}
                user_map       = {@props.user_map}
                grading        = {@props.grading}
                project_id     = {@props.project_id}
            />
            <AssignmentNote
                redux          = {@props.redux}
                name           = {@props.name}
                assignment     = {assignment}
            />
        </Panel>

    render: ->
        if @props.grading?
            @render_grading_main()
        else
            @render_assignments_main()


exports.AssignmentsPanel.Header = rclass
    propTypes :
        n : rtypes.number

    render: ->
        <Tip delayShow={1300}
             title="Assignments" tip="This tab lists all of the assignments associated to your course, along with student grades and status about each assignment.  You can also quickly find assignments by name on the left.   An assignment is a directory in your project, which may contain any files.  Add an assignment to your course by searching for the directory name in the search box on the right.">
            <span>
                <Icon name="share-square-o"/> Assignments {if @props.n? then " (#{@props.n})" else ""}
            </span>
        </Tip>

Assignment = rclass
    displayName : "CourseEditor-Assignment"

    propTypes :
        project_id            : rtypes.string.isRequired
        redux                 : rtypes.object.isRequired

        assignment            : rtypes.immutable.Map.isRequired
        background            : rtypes.string
        students              : rtypes.object.isRequired
        user_map              : rtypes.object.isRequired
        is_expanded           : rtypes.bool
        active_student_sort   : rtypes.immutable.Map
        expand_peer_config    : rtypes.bool
        expand_grading_config : rtypes.bool
        grading               : rtypes.instanceOf(Grading)
        path                  : rtypes.string.isRequired

    getInitialState: ->  {} # there are many keys used in state; we assume @state not null in code below.

    shouldComponentUpdate: (nextProps, nextState) ->
        # state is an object with tons of keys and values true/false
        return not misc.is_equal(@state, nextState) or \
               misc.is_different(@props, nextProps, ['assignment', 'students', 'user_map', 'background', \
                             'is_expanded', 'active_student_sort', 'expand_peer_config', 'grading', 'expand_grading_config'])

    _due_date: ->
        due_date = @props.assignment.get('due_date')  # a string
        if not due_date?
            return webapp_client.server_time()
        else
            return new Date(due_date)

    render_due: ->
        <Row>
            <Col xs={1} style={marginTop:'8px', color:'#666'}>
                <Tip placement='top' title="Set the due date"
                    tip="Set the due date for the assignment.  This changes how the list of assignments is sorted.  Note that you must explicitly click a button to collect student assignments when they are due -- they are not automatically collected on the due date.  You should also tell students when assignments are due (e.g., at the top of the assignment).">
                    Due
                </Tip>
            </Col>
            <Col xs={11}>
                <DateTimePicker
                    value       = {@_due_date()}
                    on_change   = {@date_change}
                    autoFocus   = {false}
                    defaultOpen = {false}
                />
            </Col>
        </Row>

    date_change: (date) ->
        date ?= @_due_date()
        @props.redux.getActions(@props.name).set_due_date(@props.assignment, date?.toISOString())


    render_more_header: ->
        status = @props.redux.getStore(@props.name).get_assignment_status(@props.assignment)
        if not status?
            return <Loading key='loading_more'/>
        v = []

        bottom =
            borderBottom  : '1px solid grey'
            paddingBottom : '10px'
            marginBottom  : '10px'

        v.push <Row key='header3' style={bottom}>
            <Col md={2}>
                {@render_open_button()}
            </Col>
            <Col md={10}>
                <Row>
                    <Col md={5} style={fontSize:'14px'} key='due'>
                        {@render_due()}
                    </Col>
                    <Col md={7} key='delete'>
                        <Row>
                            <Col md={9} style={whiteSpace:'nowrap'}>
                                {@render_grading_config_button()}
                                <Space />
                                {@render_peer_button()}
                            </Col>
                            <Col md={3}>
                                <span className='pull-right'>
                                    {@render_delete_button()}
                                </span>
                            </Col>
                        </Row>
                    </Col>
                </Row>
            </Col>
        </Row>

        if @props.expand_peer_config
            v.push <Row key='header2-peer' style={bottom}>
                <Col md={10} mdOffset={2}>
                    {@render_configure_peer()}
                </Col>
            </Row>

        if @state.confirm_delete
            v.push <Row key='header2-delete' style={bottom}>
                <Col md={10} mdOffset={2}>
                    {@render_confirm_delete()}
                </Col>
            </Row>

        if @props.expand_grading_config
            v.push <Row key='header2-grading' style={bottom}>
                <Col md={10} mdOffset={2}>
                    <ConfigureGrading
                        redux         = {@props.redux}
                        name          = {@props.name}
                        assignment    = {@props.assignment}
                        close         = {@toggle_configure_grading}
                    />
                </Col>
            </Row>

        peer = @props.assignment.get('peer_grade')?.get('enabled')
        if peer
            width = 2
        else
            width = 3
        buttons = []
        insert_skip_button = =>
            b1 = @render_grading_button(status)
            b2 = @render_skip_grading_button(status, true)
            buttons.push(<Col md={width} key={'grading_buttons'}>{b1} {b2}</Col>)

        for name in STEPS(peer)
            b = @["render_#{name}_button"](status)
            # squeeze in the skip grading button (don't add it to STEPS!)
            if !peer and name == 'return_graded'
                insert_skip_button()
            if b?
                buttons.push(<Col md={width} key={name}>{b}</Col>)
                if peer and name == 'peer_collect'
                    insert_skip_button()

        v.push <Row key='header-control'>
            <Col md={10} mdOffset={2} key='buttons'>
                <Row>
                    {buttons}
                </Row>
            </Col>
        </Row>

        v.push <Row key='header2-copy'>
            <Col md={10} mdOffset={2}>
                {@render_copy_confirms(status)}
            </Col>
        </Row>

        return v

    render_more: ->

        header      = @render_more_header()
        panel_body  =
            <StudentListForAssignment
                redux               = {@props.redux}
                name                = {@props.name}
                assignment          = {@props.assignment}
                students            = {@props.students}
                user_map            = {@props.user_map}
                active_student_sort = {@props.active_student_sort}
            />

        <Row key='more'>
            <Col sm={12}>
                <Panel header={header} style={marginTop:'15px'}>
                    {panel_body}
                    <AssignmentNote
                        redux          = {@props.redux}
                        name           = {@props.name}
                        assignment     = {@props.assignment}
                    />
                </Panel>
            </Col>
        </Row>

    open_assignment_path: ->
        @props.redux.getProjectActions(@props.project_id).open_directory(@props.assignment.get('path'))

    render_open_button: ->
        <Tip key='open' title={<span><Icon name='folder-open-o'/> Open assignment</span>}
             tip="Open the folder in the current project that contains the original files for this assignment.  Edit files in this folder to create the content that your students will see when they receive an assignment.">
            <Button onClick={@open_assignment_path}>
                <Icon name="folder-open-o" /> Open
            </Button>
        </Tip>

    render_assignment_button: (status) ->
        if (@props.assignment.get('last_assignment')?.size ? 0) == 0
            bsStyle = "primary"
        else
            bsStyle = "warning"
        if status.assignment > 0 and status.not_assignment == 0
            bsStyle = "success"

        [
            <Button key='assign'
                    bsStyle  = {bsStyle}
                    onClick  = {=>@setState(copy_confirm_assignment:true, copy_confirm:true)}
                    disabled = {@state.copy_confirm}>
                <Tip title={<span>Assign: <Icon name='user-secret'/> You <Icon name='long-arrow-right' />  <Icon name='users' /> Students </span>}
                     tip="Copy the files for this assignment from this project to all other student projects.">
                    <Icon name="share-square-o" /> Assign...
                </Tip>
            </Button>,
            <Progress
                key      = 'progress'
                done     = {status.assignment}
                not_done = {status.not_assignment}
                step     = 'assigned'
                skipped  = {@props.assignment.get('skip_assignment')}
                />
        ]

    render_copy_confirms: (status) ->
        steps = STEPS(@props.assignment.get('peer_grade')?.get('enabled'))
        for step in steps
            if @state["copy_confirm_#{step}"]
                @render_copy_confirm(step, status)

    render_copy_confirm: (step, status) ->
        <span key={"copy_confirm_#{step}"}>
            {@render_copy_confirm_to_all(step, status) if status[step]==0}
            {@render_copy_confirm_to_all_or_new(step, status) if status[step]!=0}
        </span>

    render_copy_cancel: (step) ->
        cancel = =>
            @setState(
                "copy_confirm_#{step}"            : false
                "copy_confirm_all_#{step}"        : false
                copy_confirm                      : false
                copy_assignment_confirm_overwrite : false
            )
        <Button key='cancel' onClick={cancel}>Close</Button>

    render_copy_assignment_confirm_overwrite: (step) ->
        return if not @state.copy_assignment_confirm_overwrite
        do_it = =>
            @copy_assignment(step, false, true)
            @setState(
                copy_assignment_confirm_overwrite      : false
                copy_assignment_confirm_overwrite_text : ''
            )
        <div style={marginTop:'15px'}>
            Type in "OVERWRITE" if you are sure you want to overwrite any work they may have.
            <FormGroup>
                <FormControl
                    autoFocus
                    type        = 'text'
                    ref         = 'copy_assignment_confirm_overwrite_field'
                    onChange    = {(e)=>@setState(copy_assignment_confirm_overwrite_text : e.target.value)}
                    style       = {marginTop : '1ex'}
                />
            </FormGroup>
            <ButtonToolbar style={textAlign: 'center', marginTop: '15px'}>
                <Button
                    disabled = {@state.copy_assignment_confirm_overwrite_text != 'OVERWRITE'}
                    bsStyle  = 'danger'
                    onClick  = {do_it}
                >
                    <Icon name='exclamation-triangle' /> Confirm replacing files
                </Button>
                {@render_copy_cancel(step)}
            </ButtonToolbar>
        </div>

    copy_assignment: (step, new_only, overwrite) ->
        # assign assignment to all (non-deleted) students
        actions = @props.redux.getActions(@props.name)
        switch step
            when 'assignment'
                actions.copy_assignment_to_all_students(@props.assignment, new_only, overwrite)
            when 'collect'
                actions.copy_assignment_from_all_students(@props.assignment, new_only)
            when 'peer_assignment'
                actions.peer_copy_to_all_students(@props.assignment, new_only)
            when 'peer_collect'
                actions.peer_collect_from_all_students(@props.assignment, new_only)
            when 'return_graded'
                actions.return_assignment_to_all_students(@props.assignment, new_only)
            else
                console.log("BUG -- unknown step: #{step}")
        @setState("copy_confirm_#{step}":false, "copy_confirm_all_#{step}":false, copy_confirm:false)

    render_skip: (step) ->
        if step == 'return_graded'
            return
        <div style={float:'right'}>
            <SkipCopy
                assignment = {@props.assignment}
                step       = {step}
                actions    = {@actions(@props.name)}
            />
        </div>

    render_copy_confirm_to_all: (step, status) ->
        n = status["not_#{step}"]
        <Alert bsStyle='warning' key={"#{step}_confirm_to_all"} style={marginTop:'15px'}>
            <div style={marginBottom:'15px'}>
                {misc.capitalize(step_verb(step))} this homework {step_direction(step)} the {n} student{if n>1 then "s" else ""}{step_ready(step, n)}?
            </div>
            {@render_skip(step)}
            <ButtonToolbar>
                <Button key='yes' bsStyle='primary' onClick={=>@copy_assignment(step, false)} >Yes</Button>
                {@render_copy_cancel(step)}
            </ButtonToolbar>
        </Alert>

    copy_confirm_all_caution: (step) ->
        switch step
            when 'assignment'
                return <span>
                            This will recopy all of the files to them.{' '}
                            CAUTION: if you update a file that a student has also worked on, their work will get copied to a backup file ending in a tilde,{' '}
                            or possibly only be available in snapshots.{' '}
                            Select "Replace student files!" in case you do <b>not</b> want to create any backups and also <b>delete</b> all other files in the assignment directory of their projects.{' '}
                            <a target='_blank' href='https://github.com/sagemathinc/cocalc/wiki/CourseCopy'>(more details)</a>.
                       </span>
            when 'collect'
                return "This will recollect all of the homework from them.  CAUTION: if you have graded/edited a file that a student has updated, your work will get copied to a backup file ending in a tilde, or possibly only be available in snapshots."
            when 'return_graded'
                return "This will rereturn all of the graded files to them."
            when 'peer_assignment'
                return 'This will recopy all of the files to them.  CAUTION: if there is a file a student has also worked on grading, their work will get copied to a backup file ending in a tilde, or possibly be only available in snapshots.'
            when 'peer_collect'
                return 'This will recollect all of the peer-graded homework from the students.  CAUTION: if you have graded/edited a previously collected file that a student has updated, your work will get copied to a backup file ending in a tilde, or possibly only be available in snapshots.'

    render_copy_confirm_overwrite_all: (step, status) ->
        <div key={"copy_confirm_overwrite_all"} style={marginTop:'15px'}>
            <div style={marginBottom:'15px'}>
                {@copy_confirm_all_caution(step)}
            </div>
            <ButtonToolbar>
                <Button
                    key        = {'all'}
                    bsStyle    = {'warning'}
                    disabled   = {@state.copy_assignment_confirm_overwrite}
                    onClick    = {=>@copy_assignment(step, false)}
                >
                    Yes, do it (with backup)
                </Button>
                {
                    if step == 'assignment'
                        <Button
                            key      = {'all-overwrite'}
                            bsStyle  = {'warning'}
                            onClick  = {=>@setState(copy_assignment_confirm_overwrite:true)}
                            disabled = {@state.copy_assignment_confirm_overwrite}
                        >
                            Replace student files!
                        </Button>
                }
                {@render_copy_cancel(step)}
            </ButtonToolbar>
            {@render_copy_assignment_confirm_overwrite(step)}
        </div>

    render_copy_confirm_to_all_or_new: (step, status) ->
        n = status["not_#{step}"]
        m = n + status[step]
        <Alert bsStyle='warning' key="#{step}_confirm_to_all_or_new" style={marginTop:'15px'}>
            <div style={marginBottom:'15px'}>
                {misc.capitalize(step_verb(step))} this homework {step_direction(step)}...
            </div>
            {@render_skip(step)}
            <ButtonToolbar>
                <Button key='all' bsStyle='danger' onClick={=>@setState("copy_confirm_all_#{step}":true, copy_confirm:true)}
                        disabled={@state["copy_confirm_all_#{step}"]} >
                    {if step=='assignment' then 'All' else 'The'} {m} students{step_ready(step, m)}...
                </Button>
                {<Button key='new' bsStyle='primary' onClick={=>@copy_assignment(step, true)}>The {n} student{if n>1 then 's' else ''} not already {step_verb(step)}ed {step_direction(step)}</Button> if n}
                {@render_copy_cancel(step)}
            </ButtonToolbar>
            {@render_copy_confirm_overwrite_all(step, status) if @state["copy_confirm_all_#{step}"]}
        </Alert>

    render_collect_tip: (warning) ->
        <span key='normal'>
            Collect an assignment from all of your students.
            (There is currently no way to schedule collection at a specific time; instead, collection happens when you click the button.)
        </span>

    render_collect_button: (status) ->
        if status.assignment == 0
            # no button if nothing ever assigned
            return
        if status.collect > 0
            # Have already collected something
            if status.not_collect == 0
                bsStyle = "success"
            else
                bsStyle = 'warning'
        else
            bsStyle = 'primary'
        [
            <Button key='collect'
                    onClick  = {=>@setState(copy_confirm_collect:true, copy_confirm:true)}
                    disabled = {@state.copy_confirm}
                    bsStyle={bsStyle} >
                <Tip
                    title={<span>Collect: <Icon name='users' /> Students <Icon name='long-arrow-right' /> <Icon name='user-secret'/> You</span>}
                    tip = {@render_collect_tip(bsStyle=='warning')}>
                    <Icon name="share-square-o" rotate={"180"} /> Collect...
                </Tip>
            </Button>,
            <Progress
                key      = 'progress'
                done     = {status.collect}
                not_done = {status.not_collect}
                step     = 'collected'
                skipped  = {@props.assignment.get('skip_collect')}
                />
        ]

    render_peer_assign_tip: (warning) ->
        <span key='normal'>
            Send copies of collected homework out to all students for peer grading.
        </span>

    render_peer_assignment_button: (status) ->
        # Render the "Peer Assign..." button in the top row, for peer assigning to all
        # students in the course.
        if not status.peer_assignment?
            # not peer graded
            return
        if status.not_collect + status.not_assignment > 0
            # collect everything before peer grading
            return
        if status.collect == 0
            # nothing to peer assign
            return
        if status.peer_assignment > 0
            # haven't peer-assigned anything yet
            if status.not_peer_assignment == 0
                bsStyle = 'success'
            else
                bsStyle = 'warning'
        else
            # warning, since we have assigned already and this may overwrite
            bsStyle = 'primary'
        [
            <Button key='peer-assign'
                    onClick  = {=>@setState(copy_confirm_peer_assignment:true, copy_confirm:true)}
                    disabled = {@state.copy_confirm}
                    bsStyle  = {bsStyle} >
                <Tip
                    title={<span>Peer Assign: <Icon name='users' /> You <Icon name='long-arrow-right' /> <Icon name='user-secret'/> Students</span>}
                    tip = {@render_peer_assign_tip(bsStyle=='warning')}>
                        <Icon name="share-square-o" /> Peer Assign...
                </Tip>
            </Button>,
            <Progress
                key      = 'progress'
                done     = {status.peer_assignment}
                not_done = {status.not_peer_assignment}
                step     = 'peer assigned'
                />
        ]

    render_peer_collect_tip: (warning) ->
        <span key='normal'>
            Collect the peer grading that your students did.
        </span>

    render_peer_collect_button: (status) ->
        # Render the "Peer Collect..." button in the top row, for collecting peer grading from all
        # students in the course.
        if not status.peer_collect?
            return
        if status.peer_assignment == 0
            # haven't even peer assigned anything -- so nothing to collect
            return
        if status.not_peer_assignment > 0
            # everybody must have received peer assignment, or collecting isn't allowed
            return
        if status.peer_collect > 0
            # haven't peer-collected anything yet
            if status.not_peer_collect == 0
                bsStyle = 'success'
            else
                bsStyle = 'warning'
        else
            # warning, since we have already collected and this may overwrite
            bsStyle = 'primary'
        [
            <Button key='peer-collect'
                    onClick  = {=>@setState(copy_confirm_peer_collect:true, copy_confirm:true)}
                    disabled = {@state.copy_confirm}
                    bsStyle  = {bsStyle} >
                <Tip
                    title={<span>Peer Collect: <Icon name='users' /> Students <Icon name='long-arrow-right' /> <Icon name='user-secret'/> You</span>}
                    tip = {@render_peer_collect_tip(bsStyle=='warning')}>
                        <Icon name="share-square-o" rotate="180"/> Peer Collect...
                </Tip>
            </Button>,
            <Progress
                key      = 'progress'
                done     = {status.peer_collect}
                not_done = {status.not_peer_collect}
                step     = 'peer collected'
                />
        ]

    return_assignment: ->
        # Assign assignment to all (non-deleted) students.
        @props.redux.getActions(@props.name).return_assignment_to_all_students(@props.assignment)

    toggle_skip_grading: ->
        @actions(@props.name).set_skip(@props.assignment, 'grading', not @props.assignment.get('skip_grading'))

    render_skip_grading_button: (status, float_right) ->
        if status.collect == 0
            # No button if nothing collected.
            return
        is_skip_grading = @props.assignment.get('skip_grading') ? false
        if is_skip_grading
            icon = 'check-square-o'
        else
            icon = 'square-o'
        props = {style : {float:'right'}} if float_right
        <Button
            onClick  = {@toggle_skip_grading}
            {...props}
        >
            <Icon name={icon} /> Skip
        </Button>

    render_grading_button: (status) ->
        if status.collect == 0
            # No button if nothing collected.
            return
        return null if @props.assignment.get('skip_grading') ? false
        # Have already collected something
        disabled = false
        icon     = 'play'
        handler  = =>
            # student_id is set to null on purpose (starts fresh)
            @actions(@props.name).grading(assignment : @props.assignment)

        if status.graded > 0
            if status.not_graded == 0
                disabled = true
                bsStyle  = 'success'
                activity = 'Done'
                icon     = 'check-circle'
                handler  = ->
            else
                bsStyle  = 'primary'
                activity = 'Continue'
        else
            bsStyle  = 'primary'
            activity = 'Start'

        <Tip
            title     = {'Open grading dialog'}
            tip       = {'Go through the collected files of your students, assign points, and grade them.'}
            placement = {'bottom'}
        >
            <Button
                onClick  = {handler}
                bsStyle  = {bsStyle}
                disabled = {disabled}
            >
                <Icon name={icon} />
                <span className={'hidden-lg'}> {activity}</span> Grading…
            </Button>
        </Tip>

    render_return_graded_button: (status) ->
        if status.collect == 0
            # No button if nothing collected.
            return
        if status.peer_collect? and status.peer_collect == 0
            # Peer grading enabled, but we didn't collect anything yet
            return
        skip_grading = @props.assignment.get('skip_grading') ? false
        if (!skip_grading) and (status.not_return_graded == 0 and status.return_graded == 0)
            # Nothing unreturned and ungraded yet and also nothing returned yet
            return
        if status.return_graded > 0
            # Have already returned some
            if status.not_return_graded == 0
                bsStyle = 'success'
            else
                bsStyle = "warning"
        else
            bsStyle = "primary"
        [
            <Button key='return'
                onClick  = {=>@setState(copy_confirm_return_graded:true, copy_confirm:true)}
                disabled = {@state.copy_confirm}
                bsStyle  = {bsStyle} >
                <Tip title={<span>Return: <Icon name='user-secret'/> You <Icon name='long-arrow-right' />  <Icon name='users' /> Students </span>}
                     tip="Copy the graded versions of files for this assignment from this project to all other student projects.">
                    <Icon name="share-square-o" /> Return...
                </Tip>
            </Button>,
            <Progress
                key      = 'progress'
                done     = {status.return_graded}
                not_done = {status.not_return_graded}
                step     = 'returned'
                />
        ]


    delete_assignment: ->
        @props.redux.getActions(@props.name).delete_assignment(@props.assignment)
        @setState(confirm_delete:false)

    undelete_assignment: ->
        @props.redux.getActions(@props.name).undelete_assignment(@props.assignment)

    render_confirm_delete: ->
        <Alert bsStyle='warning' key='confirm_delete'>
            Are you sure you want to delete this assignment (you can undelete it later)?
            <br/> <br/>
            <ButtonToolbar>
                <Button key='yes' onClick={@delete_assignment} bsStyle='danger'>
                    <Icon name="trash" /> Delete
                </Button>
                <Button key='no' onClick={=>@setState(confirm_delete:false)}>
                    Cancel
                </Button>
            </ButtonToolbar>
        </Alert>

    render_delete_button: ->
        if @props.assignment.get('deleted')
            <Tip key='delete' placement='left' title="Undelete assignment" tip="Make the assignment visible again in the assignment list and in student grade lists.">
                <Button onClick={@undelete_assignment}>
                    <Icon name="trash-o" /> Undelete
                </Button>
            </Tip>
        else
            <Tip key='delete' placement='left' title="Delete assignment" tip="Deleting this assignment removes it from the assignment list and student grade lists, but does not delete any files off of disk.  You can always undelete an assignment later by showing it using the 'show deleted assignments' button.">
                <Button onClick={=>@setState(confirm_delete:true)} disabled={@state.confirm_delete}>
                    <Icon name="trash" /> Delete
                </Button>
            </Tip>

    set_peer_grade: (config) ->
        @props.redux.getActions(@props.name).set_peer_grade(@props.assignment, config)

    render_configure_peer_checkbox: (config) ->
        <div>
            <Checkbox checked  = {config.enabled ? false}
                   key      = 'peer_grade_checkbox'
                   ref      = 'peer_grade_checkbox'
                   onChange = {(e)=>@set_peer_grade(enabled:e.target.checked)}
                   style    = {display:'inline-block', verticalAlign:'middle'}
            />
            Enable Peer Grading
        </div>

    _peer_due: (date) ->
        date ?= @props.assignment.getIn(['peer_grade', 'due_date'])
        if date?
            return new Date(date)
        else
            return misc.server_days_ago(-7)

    peer_due_change: (date) ->
        @set_peer_grade(due_date : @_peer_due(date)?.toISOString())

    render_configure_peer_due: (config) ->
        label = <Tip placement='top' title="Set the due date"
                    tip="Set the due date for grading this assignment.  Note that you must explicitly click a button to collect graded assignments when -- they are not automatically collected on the due date.  A file is included in the student peer grading assignment telling them when they should finish their grading.">
                    Due
        </Tip>
        <LabeledRow label_cols={6} label={label}>
            <DateTimePicker
                value       = {@_peer_due(config.due_date)}
                on_change   = {@peer_due_change}
                autoFocus   = {false}
                defaultOpen = {false}
            />
        </LabeledRow>

    render_configure_peer_number: (config) ->
        store = @props.redux.getStore(@props.name)
        <LabeledRow label_cols={6} label='Number of students who will grade each assignment'>
            <NumberInput
                on_change = {(n) => @set_peer_grade(number : n)}
                min       = {1}
                max       = {(store?.num_students() ? 2) - 1}
                number    = {config.number ? 1}
            />
        </LabeledRow>

    render_configure_grading_guidelines: (config) ->
        store = @props.redux.getStore(@props.name)
        <div style={marginTop:'10px'}>
            <LabeledRow label_cols={6} label='Grading guidelines, which will be made available to students in their grading folder in a file GRADING_GUIDE.md.  Tell your students how to grade each problem.  Since this is a markdown file, you might also provide a link to a publicly shared file or directory with guidelines.'>
                <div style={background:'white', padding:'10px', border:'1px solid #ccc', borderRadius:'3px'}>
                    <MarkdownInput
                        persist_id    = {@props.assignment.get('path') + @props.assignment.get('assignment_id') + "grading-guidelines"}
                        attach_to     = {@props.name}
                        rows          = {16}
                        placeholder   = 'Enter your grading guidelines for this assignment...'
                        default_value = {config.guidelines}
                        on_save       = {(x) => @set_peer_grade(guidelines : x)}
                    />
                </div>
            </LabeledRow>
        </div>

    render_configure_peer: ->
        config = @props.assignment.get('peer_grade')?.toJS() ? {}
        <Alert bsStyle='warning'>
            <h3><Icon name="users"/> Peer grading</h3>

            <div style={color:'#666'}>
                Use peer grading to randomly (and anonymously) redistribute
                collected homework to your students, so that they can grade
                it for you.
            </div>

            {@render_configure_peer_checkbox(config)}
            {@render_configure_peer_number(config) if config.enabled}
            {@render_configure_peer_due(config) if config.enabled}
            {@render_configure_grading_guidelines(config) if config.enabled}

            <Button onClick={=>@actions(@props.name).toggle_item_expansion('peer_config', @props.assignment.get('assignment_id'))}>
                Close
            </Button>
        </Alert>

    render_peer_button: ->
        icon = <CheckedIcon checked={@props.assignment.get('peer_grade')?.get('enabled')} />
        <Button
            disabled    = {@props.expand_peer_config }
            onClick     = {=>@actions(@props.name).toggle_item_expansion('peer_config', @props.assignment.get('assignment_id'))}
        >
            {icon} Peer Grading...
        </Button>

    toggle_configure_grading: ->
        aid = @props.assignment.get('assignment_id')
        @actions(@props.name).toggle_item_expansion('grading_config', aid)

    render_grading_config_button: ->
        <Button
            disabled    = {@props.expand_grading_config}
            onClick     = {@toggle_configure_grading}
        >
            <Icon name={'gavel'} /> Configure Grading...
        </Button>

    render_summary_due_date: ->
        due_date = @props.assignment.get('due_date')
        if due_date
            <div style={marginTop:'12px'}>Due <BigTime date={due_date} /></div>

    render_assignment_name: ->
        <span>
            {misc.trunc_middle(@props.assignment.get('path'), 80)}
            {<b> (deleted)</b> if @props.assignment.get('deleted')}
        </span>

    render_assignment_title_link: ->
        <a href='' onClick={(e)=>e.preventDefault();@actions(@props.name).toggle_item_expansion('assignment', @props.assignment.get('assignment_id'))}>
            <Icon style={marginRight:'10px'}
                  name={if @props.is_expanded then 'caret-down' else 'caret-right'} />
            {@render_assignment_name()}
        </a>

    render_summary_line: () ->
        <Row key='summary' style={backgroundColor:@props.background}>
            <Col md={6}>
                <h5>
                    {@render_assignment_title_link()}
                </h5>
            </Col>
            <Col md={6}>
                {@render_summary_due_date()}
            </Col>
        </Row>

    render: ->
        <Row style={if @props.is_expanded then styles.selected_entry else styles.entry}>
            <Col xs={12}>
                {@render_summary_line()}
                {@render_more() if @props.is_expanded}
            </Col>
        </Row>

StudentListForAssignment = rclass
    displayName : "CourseEditor-StudentListForAssignment"

    propTypes :
        name                : rtypes.string.isRequired
        redux               : rtypes.object.isRequired
        assignment          : rtypes.object.isRequired
        students            : rtypes.object.isRequired
        user_map            : rtypes.object.isRequired
        background          : rtypes.string
        active_student_sort : rtypes.immutable.Map

    shouldComponentUpdate: (props) ->
        return misc.is_different(@props, props, ['assignment', 'students', 'user_map', 'background', 'active_student_sort'])

    render_student_info: (student_id) ->
        store = @props.redux.getStore(@props.name)

        <StudentAssignmentInfo
            key            = {student_id}
            title          = {misc.trunc_middle(store.get_student_name(student_id), 40)}
            name           = {@props.name}
            student        = {student_id}
            assignment     = {@props.assignment}
            grade          = {store.get_grade(@props.assignment, student_id)}
            points         = {store.get_points_total(@props.assignment, student_id)}
            edit_points    = {true}
            comments       = {store.get_comments(@props.assignment, student_id)}
            info           = {store.student_assignment_info(student_id, @props.assignment)}
            grading_mode   = {store.get_grading_mode(@props.assignment)}
            total_points   = {store.get_points_total(@props.assignment, student_id)}
            max_points     = {store.get_grading_maxpoints(@props.assignment)}
        />

    render_students: ->
        v = util.parse_students(@props.students, @props.user_map, @props.redux)
        # fill in names, for use in sorting and searching (TODO: caching)
        v = (x for x in v when not x.deleted)
        v.sort(util.pick_student_sorter(@props.active_student_sort.toJS()))
        if @props.active_student_sort.get('is_descending')
            v.reverse()

        for x in v
            @render_student_info(x.student_id)

    render: ->
        <div>
            <StudentAssignmentInfoHeader
                key        = 'header'
                title      = "Student"
                peer_grade = {!!@props.assignment.get('peer_grade')?.get('enabled')}
            />
            {@render_students()}
        </div>


