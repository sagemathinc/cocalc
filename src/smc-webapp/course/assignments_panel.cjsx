# SMC libraries
misc = require('smc-util/misc')
{defaults, required} = misc
{salvus_client} = require('../salvus_client')

# React libraries
{React, rclass, rtypes} = require('../smc-react')
{Alert, Button, ButtonToolbar, ButtonGroup, FormControl, FormGroup, Checkbox, Row, Col, Panel} = require('react-bootstrap')

# SMC and course components
course_funcs = require('./course_funcs')
styles = require('./styles')
{DateTimePicker, ErrorDisplay, Icon, LabeledRow, Loading, MarkdownInput, SearchInput, Tip, NumberInput} = require('../r_misc')
{STEPS, step_direction, step_verb, step_ready,
    BigTime, FoldersToolbar, StudentAssignmentInfo, StudentAssignmentInfoHeader} = require('./common')


exports.AssignmentsPanel = rclass ({name}) ->
    displayName : "CourseEditorAssignments"

    reduxProps :
        "#{name}":
            expanded_assignments : rtypes.immutable.Set

    propTypes :
        name            : rtypes.string.isRequired
        project_id      : rtypes.string.isRequired
        redux           : rtypes.object.isRequired
        actions         : rtypes.object.isRequired
        all_assignments : rtypes.object.isRequired
        students        : rtypes.object.isRequired
        user_map        : rtypes.object.isRequired

    getInitialState: ->
        err           : undefined  # error message to display at top.
        search        : ''         # search query to restrict which assignments are shown.
        show_deleted  : false      # whether or not to show deleted assignments on the bottom


    compute_assignment_list: ->
        list = course_funcs.immutable_to_list(@props.all_assignments, 'assignment_id')

        {list, num_omitted} = course_funcs.compute_match_list
            list        : list
            search_key  : 'path'
            search      : @state.search.trim()

        f = (a) -> [a.due_date ? 0, a.path?.toLowerCase()]

        {list, deleted, num_deleted} = course_funcs.order_list
            list             : list
            compare_function : (a,b) => misc.cmp_array(f(a), f(b))
            include_deleted  : @state.show_deleted

        return {shown_assignments:list, deleted_assignments:deleted, num_omitted:num_omitted, num_deleted:num_deleted}

    render_assignments: (assignments) ->
        for x,i in assignments
            <Assignment background={if i%2==0 then "#eee"}  key={x.assignment_id} assignment={@props.all_assignments.get(x.assignment_id)}
                    project_id={@props.project_id}  redux={@props.redux}
                    students={@props.students} user_map={@props.user_map}
                    name={@props.name}
                    is_expanded={@props.expanded_assignments.has(x.assignment_id)}
                    />

    render_show_deleted: (num_deleted) ->
        if @state.show_deleted
            <Button style={styles.show_hide_deleted} onClick={=>@setState(show_deleted:false)}>
                <Tip placement='left' title="Hide deleted" tip="Assignments are never really deleted.  Click this button so that deleted assignments aren't included at the bottom of the list.  Deleted assignments are always hidden from the list of grades for a student.">
                    Hide {num_deleted} deleted assignments
                </Tip>
            </Button>
        else
            <Button style={styles.show_hide_deleted} onClick={=>@setState(show_deleted:true,search:'')}>
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

    render: ->
        {shown_assignments, deleted_assignments, num_omitted, num_deleted} = @compute_assignment_list()
        add_assignment = @yield_adder(deleted_assignments)

        header =
            <FoldersToolbar
                search        = {@state.search}
                search_change = {(value) => @setState(search:value)}
                num_omitted   = {num_omitted}
                project_id    = {@props.project_id}
                items         = {@props.all_assignments}
                add_folders   = {(paths)=>paths.map(add_assignment)}
                item_name     = {"assignment"}
                plural_item_name = {"assignments"}
            />

        <Panel header={header}>
            {@render_assignments(shown_assignments)}
            {@render_show_deleted(num_deleted) if num_deleted}
        </Panel>

exports.AssignmentsPanel.Header = rclass
    propTypes :
        n : rtypes.number

    render: ->
        <Tip delayShow=1300
             title="Assignments" tip="This tab lists all of the assignments associated to your course, along with student grades and status about each assignment.  You can also quickly find assignments by name on the left.   An assignment is a directory in your project, which may contain any files.  Add an assignment to your course by searching for the directory name in the search box on the right.">
            <span>
                <Icon name="share-square-o"/> Assignments {if @props.n? then " (#{@props.n})" else ""}
            </span>
        </Tip>

Assignment = rclass
    displayName : "CourseEditor-Assignment"

    propTypes :
        name       : rtypes.string.isRequired
        assignment : rtypes.object.isRequired
        project_id : rtypes.string.isRequired
        redux      : rtypes.object.isRequired
        students   : rtypes.object.isRequired
        user_map   : rtypes.object.isRequired
        background : rtypes.string
        is_expanded : rtypes.bool

    shouldComponentUpdate: (nextProps, nextState) ->
        return @state != nextState or @props.assignment != nextProps.assignment or @props.students != nextProps.students or @props.user_map != nextProps.user_map or @props.background != nextProps.background or @props.is_expanded != nextProps.is_expanded

    getInitialState: ->
        confirm_delete : false

    render_due: ->
        <Row>
            <Col xs=1 style={marginTop:'8px', color:'#666'}>
                <Tip placement='top' title="Set the due date"
                    tip="Set the due date for the assignment.  This changes how the list of assignments is sorted.  Note that you must explicitly click a button to collect student assignments when they are due -- they are not automatically collected on the due date.  You should also tell students when assignments are due (e.g., at the top of the assignment).">
                    Due
                </Tip>
            </Col>
            <Col xs=11>
                <DateTimePicker
                    value     = {@props.assignment.get('due_date') ? salvus_client.server_time()}
                    on_change = {@date_change}
                />
            </Col>
        </Row>

    date_change: (date) ->
        if not date
            date = @props.assignment.get('due_date') ? misc.server_time()
        @props.redux.getActions(@props.name).set_due_date(@props.assignment, date)

    render_note: ->
        <Row key='note' style={styles.note}>
            <Col xs=2>
                <Tip title="Notes about this assignment" tip="Record notes about this assignment here. These notes are only visible to you, not to your students.  Put any instructions to students about assignments in a file in the directory that contains the assignment.">
                    Private Assignment Notes<br /><span style={color:"#666"}></span>
                </Tip>
            </Col>
            <Col xs=10>
                <MarkdownInput
                    rows          = 6
                    placeholder   = 'Private notes about this assignment (not visible to students)'
                    default_value = {@props.assignment.get('note')}
                    on_save       = {(value)=>@props.redux.getActions(@props.name).set_assignment_note(@props.assignment, value)}
                />
            </Col>
        </Row>

    render_more_header: ->
        status = @props.redux.getStore(@props.name).get_assignment_status(@props.assignment)
        if not status?
            return <Loading key='loading_more'/>
        v = []

        bottom =
            borderBottom  : '1px solid grey'
            paddingBottom : '15px'
            marginBottom  : '15px'
        v.push <Row key='header3' style={bottom}>
            <Col md=2>
                {@render_open_button()}
            </Col>
            <Col md=10>
                <Row>
                    <Col md=6 style={fontSize:'14px'} key='due'>
                        {@render_due()}
                    </Col>
                    <Col md=6 key='delete'>
                        <Row>
                            <Col md=7>
                                {@render_peer_button()}
                            </Col>
                            <Col md=5>
                                <span className='pull-right'>
                                    {@render_delete_button()}
                                </span>
                            </Col>
                        </Row>
                    </Col>
                </Row>
            </Col>
        </Row>

        if @state.configure_peer
            v.push <Row key='header2-peer' style={bottom}>
                <Col md=10 mdOffset=2>
                    {@render_configure_peer()}
                </Col>
            </Row>
        if @state.confirm_delete
            v.push <Row key='header2-delete' style={bottom}>
                <Col md=10 mdOffset=2>
                    {@render_confirm_delete()}
                </Col>
            </Row>

        peer = @props.assignment.get('peer_grade')?.get('enabled')
        if peer
            width = 2
        else
            width = 3
        buttons = []
        for name in STEPS(peer)
            b = @["render_#{name}_button"](status)
            if b?
                if name == 'return_graded'
                    buttons.push(<Col md={width} key='filler'></Col>)
                buttons.push(<Col md={width} key={name}>{b}</Col>)

        v.push <Row key='header-control'>
            <Col md=10 mdOffset=2 key='buttons'>
                <Row>
                    {buttons}
                </Row>
            </Col>
        </Row>

        v.push <Row key='header2-copy'>
            <Col md=10 mdOffset=2>
                {@render_copy_confirms(status)}
            </Col>
        </Row>

        return v

    render_more: ->
        <Row key='more'>
            <Col sm=12>
                <Panel header={@render_more_header()}>
                    <StudentListForAssignment redux={@props.redux} name={@props.name}
                        assignment={@props.assignment} students={@props.students}
                        user_map={@props.user_map} />
                    {@render_note()}
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

    render_assignment_button: ->
        bsStyle = if (@props.assignment.get('last_assignment')?.size ? 0) == 0 then "primary" else "warning"
        <Button key='assign'
                bsStyle  = {bsStyle}
                onClick  = {=>@setState(copy_confirm_assignment:true, copy_confirm:true)}
                disabled = {@state.copy_confirm}>
            <Tip title={<span>Assign: <Icon name='user-secret'/> You <Icon name='long-arrow-right' />  <Icon name='users' /> Students </span>}
                 tip="Copy the files for this assignment from this project to all other student projects.">
                <Icon name="share-square-o" /> Assign...
            </Tip>
        </Button>

    render_copy_confirms: (status) ->
        steps = STEPS(@props.assignment.get('peer_grade')?.get('enabled'))
        for step in steps
            if @state["copy_confirm_#{step}"]
                @render_copy_confirm(step, status)

    render_copy_confirm: (step, status) ->
        <span key="copy_confirm_#{step}">
            {@render_copy_confirm_to_all(step, status) if status[step]==0}
            {@render_copy_confirm_to_all_or_new(step, status) if status[step]!=0}
        </span>

    render_copy_cancel: (step) ->
        cancel = =>
            @setState("copy_confirm_#{step}":false, "copy_confirm_all_#{step}":false, copy_confirm:false)
        <Button key='cancel' onClick={cancel}>Cancel</Button>

    copy_assignment: (step, new_only) ->
        # assign assignment to all (non-deleted) students
        actions = @props.redux.getActions(@props.name)
        switch step
            when 'assignment'
                actions.copy_assignment_to_all_students(@props.assignment, new_only)
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

    render_copy_confirm_to_all: (step, status) ->
        n = status["not_#{step}"]
        <Alert bsStyle='warning' key="#{step}_confirm_to_all", style={marginTop:'15px'}>
            <div style={marginBottom:'15px'}>
                {misc.capitalize(step_verb(step))} this homework {step_direction(step)} the {n} student{if n>1 then "s" else ""}{step_ready(step, n)}?
            </div>
            <ButtonToolbar>
                <Button key='yes' bsStyle='primary' onClick={=>@copy_assignment(step, false)} >Yes</Button>
                {@render_copy_cancel(step)}
            </ButtonToolbar>
        </Alert>

    copy_confirm_all_caution: (step) ->
        switch step
            when 'assignment'
                return "This will recopy all of the files to them.  CAUTION: if you update a file that a student has also worked on, their work will get copied to a backup file ending in a tilde, or possibly only be available in snapshots."
            when 'collect'
                return "This will recollect all of the homework from them.  CAUTION: if you have graded/edited a file that a student has updated, your work will get copied to a backup file ending in a tilde, or possibly only be available in snapshots."
            when 'return_graded'
                return "This will rereturn all of the graded files to them."
            when 'peer_assignment'
                return 'This will recopy all of the files to them.  CAUTION: if there is a file a student has also worked on grading, their work will get copied to a backup file ending in a tilde, or possibly be only available in snapshots.'
            when 'peer_collect'
                return 'This will recollect all of the peer-graded homework from the students.  CAUTION: if you have graded/edited a previously collected file that a student has updated, your work will get copied to a backup file ending in a tilde, or possibly only be available in snapshots.'

    render_copy_confirm_overwrite_all: (step, status) ->
        <div key="copy_confirm_overwrite_all" style={marginTop:'15px'}>
            <div style={marginBottom:'15px'}>
                {@copy_confirm_all_caution(step)}
            </div>
            <ButtonToolbar>
                <Button key='all' bsStyle='danger' onClick={=>@copy_assignment(step, false)}>Yes, do it</Button>
                {@render_copy_cancel(step)}
            </ButtonToolbar>
        </div>

    render_copy_confirm_to_all_or_new: (step, status) ->
        n = status["not_#{step}"]
        m = n + status[step]
        <Alert bsStyle='warning' key="#{step}_confirm_to_all_or_new" style={marginTop:'15px'}>
            <div style={marginBottom:'15px'}>
                {misc.capitalize(step_verb(step))} this homework {step_direction(step)}...
            </div>
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
            bsStyle = 'warning'
        else
            bsStyle = 'primary'
        <Button key='collect'
                onClick  = {=>@setState(copy_confirm_collect:true, copy_confirm:true)}
                disabled = {@state.copy_confirm}
                bsStyle={bsStyle} >
            <Tip
                title={<span>Collect: <Icon name='users' /> Students <Icon name='long-arrow-right' /> <Icon name='user-secret'/> You</span>}
                tip = {@render_collect_tip(bsStyle=='warning')}>
                <Icon name="share-square-o" rotate={"180"} /> Collect...
            </Tip>
        </Button>

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
        if status.peer_assignment == 0
            # haven't peer-assigned anything yet
            bsStyle = 'primary'
        else
            # warning, since we have assigned already and this may overwrite
            bsStyle = 'warning'
        <Button key='peer-assign'
                onClick  = {=>@setState(copy_confirm_peer_assignment:true, copy_confirm:true)}
                disabled = {@state.copy_confirm}
                bsStyle  = {bsStyle} >
            <Tip
                title={<span>Peer Assign: <Icon name='users' /> You <Icon name='long-arrow-right' /> <Icon name='user-secret'/> Students</span>}
                tip = {@render_peer_assign_tip(bsStyle=='warning')}>
                    <Icon name="share-square-o" /> Peer Assign...
            </Tip>
        </Button>

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
        if status.peer_collect == 0
            # haven't peer-collected anything yet
            bsStyle = 'primary'
        else
            # warning, since we have already collected and this may overwrite
            bsStyle = 'warning'
        <Button key='peer-collect'
                onClick  = {=>@setState(copy_confirm_peer_collect:true, copy_confirm:true)}
                disabled = {@state.copy_confirm}
                bsStyle  = {bsStyle} >
            <Tip
                title={<span>Peer Collect: <Icon name='users' /> Students <Icon name='long-arrow-right' /> <Icon name='user-secret'/> You</span>}
                tip = {@render_peer_collect_tip(bsStyle=='warning')}>
                    <Icon name="share-square-o" rotate="180"/> Peer Collect...
            </Tip>
        </Button>

    return_assignment: ->
        # Assign assignment to all (non-deleted) students.
        @props.redux.getActions(@props.name).return_assignment_to_all_students(@props.assignment)

    render_return_graded_button: (status) ->
        if status.collect == 0
            # No button if nothing collected.
            return
        if status.peer_collect? and status.peer_collect == 0
            # Peer grading enabled, but we didn't collect anything yet
            return
        if status.not_return_graded == 0 and status.return_graded == 0
            # Nothing unreturned and ungraded yet and also nothing returned yet
            return
        if status.return_graded > 0
            # Have already returned some
            bsStyle = "warning"
        else
            bsStyle = "primary"
        <Button key='return'
            onClick  = {=>@setState(copy_confirm_return_graded:true, copy_confirm:true)}
            disabled = {@state.copy_confirm}
            bsStyle  = {bsStyle} >
            <Tip title={<span>Return: <Icon name='user-secret'/> You <Icon name='long-arrow-right' />  <Icon name='users' /> Students </span>}
                 tip="Copy the graded versions of files for this assignment from this project to all other student projects.">
                <Icon name="share-square-o" /> Return...
            </Tip>
        </Button>

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
        <span>
            <Checkbox checked  = {config.enabled}
                   key      = 'peer_grade_checkbox'
                   ref      = 'peer_grade_checkbox'
                   onChange = {(e)=>@set_peer_grade(enabled:e.target.checked)}
            />
            Enable Peer Grading
        </span>

    peer_due_change: (date) ->
        if not date
            date = @props.assignment.getIn(['peer_grade', 'due_date']) ? misc.server_days_ago(-7)
        @set_peer_grade(due_date : date)

    render_configure_peer_due: (config) ->
        label = <Tip placement='top' title="Set the due date"
                    tip="Set the due date for grading this assignment.  Note that you must explicitly click a button to collect graded assignments when -- they are not automatically collected on the due date.  A file is included in the student peer grading assignment telling them when they should finish their grading.">
                    Due
        </Tip>
        <LabeledRow label_cols=6 label={label}>
            <DateTimePicker
                value     = {config.due_date ? misc.server_days_ago(-7)}
                on_change = {@peer_due_change}
            />
        </LabeledRow>

    render_configure_peer_number: (config) ->
        store = @props.redux.getStore(@props.name)
        <LabeledRow label_cols=6 label='Number of students who will grade each assignment'>
            <NumberInput
                on_change = {(n) => @set_peer_grade(number : n)}
                min       = 1
                max       = {(store?.num_students() ? 2) - 1}
                number    = {config.number ? 1}
            />
        </LabeledRow>

    render_configure_grading_guidelines: (config) ->
        store = @props.redux.getStore(@props.name)
        <div style={marginTop:'10px'}>
            <LabeledRow label_cols=6 label='Grading guidelines, which will be made available to students in their grading folder in a file GRADING_GUIDE.md.  Tell your students how to grade each problem.  Since this is a markdown file, you might also provide a link to a publicly shared file or directory with guidelines.'>
                <div style={background:'white', padding:'10px', border:'1px solid #ccc', borderRadius:'3px'}>
                    <MarkdownInput
                        rows          = 16
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

            <span style={color:'#666'}>
                Use peer grading to randomly (and anonymously) redistribute
                collected homework to your students, so that they can grade
                it for you.
            </span>

            {@render_configure_peer_checkbox(config)}
            {@render_configure_peer_number(config) if config.enabled}
            {@render_configure_peer_due(config) if config.enabled}
            {@render_configure_grading_guidelines(config) if config.enabled}

            <Button onClick={=>@setState(configure_peer:false)}>
                Close
            </Button>

        </Alert>

    render_peer_button: ->
        if @props.assignment.get('peer_grade')?.get('enabled')
            icon = 'check-square-o'
        else
            icon = 'square-o'
        <Button disabled={@state.configure_peer} onClick={=>@setState(configure_peer:true)}>
            <Icon name={icon} /> Peer Grading...
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
            <Col md=6>
                <h5>
                    {@render_assignment_title_link()}
                </h5>
            </Col>
            <Col md=6>
                {@render_summary_due_date()}
            </Col>
        </Row>

    render: ->
        <Row style={if @props.is_expanded then styles.selected_entry else styles.entry}>
            <Col xs=12>
                {@render_summary_line()}
                {@render_more() if @props.is_expanded}
            </Col>
        </Row>

StudentListForAssignment = rclass
    displayName : "CourseEditor-StudentListForAssignment"

    propTypes :
        name       : rtypes.string.isRequired
        redux      : rtypes.object.isRequired
        assignment : rtypes.object.isRequired
        students   : rtypes.object.isRequired
        user_map   : rtypes.object.isRequired
        background : rtypes.string

    render_student_info: (student_id) ->
        store = @props.redux.getStore(@props.name)
        <StudentAssignmentInfo
              key     = {student_id}
              title   = {misc.trunc_middle(store.get_student_name(student_id), 40)}
              name    = {@props.name}
              student = {student_id}
              assignment = {@props.assignment}
              grade   = {store.get_grade(@props.assignment, student_id)}
              info    = {store.student_assignment_info(student_id, @props.assignment)} />

    render_students: ->
        v = course_funcs.immutable_to_list(@props.students, 'student_id')
        # fill in names, for use in sorting and searching (TODO: caching)
        v = (x for x in v when not x.deleted)
        for x in v
            user = @props.user_map.get(x.account_id)
            if user?
                x.first_name = user.get('first_name')
                x.last_name  = user.get('last_name')
                x.name = x.first_name + ' ' + x.last_name
                x.sort = (x.last_name + ' ' + x.first_name).toLowerCase()
            else if x.email_address?
                x.name = x.sort = x.email_address.toLowerCase()

        v.sort (a,b) ->
            return misc.cmp(a.sort, b.sort)

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
