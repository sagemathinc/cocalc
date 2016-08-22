# SMC libraries
misc = require('smc-util/misc')
{defaults, required} = misc
{salvus_client} = require('../salvus_client')

# React libraries and components
{React, ReactDOM, rclass, rtypes}  = require('../smc-react')
{Button, ButtonToolbar, ButtonGroup, FormGroup, FormControl, InputGroup, Row, Col, Panel} = require('react-bootstrap')

# SMC components
{User} = require('../users')
{ErrorDisplay, Icon, MarkdownInput, SearchInput, Space, TimeAgo, Tip} = require('../r_misc')
{StudentAssignmentInfo, StudentAssignmentInfoHeader} = require('./common')

entry_style =
    paddingTop    : '5px'
    paddingBottom : '5px'

selected_entry_style = misc.merge
    border        : '1px solid #aaa'
    boxShadow     : '5px 5px 5px #999'
    borderRadius  : '3px'
    marginBottom  : '10px',
    entry_style

note_style =
    borderTop  : '3px solid #aaa'
    marginTop  : '10px'
    paddingTop : '5px'

show_hide_deleted_style =
    marginTop  : '20px'
    float      : 'right'

exports.StudentsPanel = rclass
    displayName : "CourseEditorStudents"

    propTypes :
        name        : rtypes.string.isRequired
        redux       : rtypes.object.isRequired
        project_id  : rtypes.string.isRequired
        students    : rtypes.object.isRequired
        user_map    : rtypes.object.isRequired
        project_map : rtypes.object.isRequired
        assignments : rtypes.object.isRequired

    getInitialState : ->
        err              : undefined
        search           : ''
        add_search       : ''
        add_searching    : false
        add_select       : undefined
        selected_entries : undefined
        show_deleted     : false

    do_add_search : (e) ->
        # Search for people to add to the course
        e?.preventDefault()
        if not @props.students?
            return
        if @state.add_searching # already searching
            return
        search = @state.add_search.trim()
        if search.length == 0
            @setState(err:undefined, add_select:undefined, selected_entries:undefined)
            return
        @setState(add_searching:true, add_select:undefined, selected_entries:undefined)
        add_search = @state.add_search
        salvus_client.user_search
            query : add_search
            limit : 50
            cb    : (err, select) =>
                if err
                    @setState(add_searching:false, err:err, add_select:undefined)
                    return
                # Get the current collaborators/owners of the project that contains the course.
                users = @props.redux.getStore('projects').get_users(@props.project_id)
                # Make a map with keys the email or account_id is already part of the course.
                already_added = users.toJS()  # start with collabs on project
                # For each student in course add account_id and/or email_address:
                @props.students.map (val, key) =>
                    for n in ['account_id', 'email_address']
                        if val.get(n)?
                            already_added[val.get(n)] = true
                # This function returns true if we shouldn't list the given account_id or email_address
                # in the search selector for adding to the class.
                exclude_add = (account_id, email_address) =>
                    return already_added[account_id] or already_added[email_address]
                select = (x for x in select when not exclude_add(x.account_id, x.email_address))
                # Put at the front of the list any email addresses not known to SMC (sorted in order) and also not invited to course.
                select = (x for x in noncloud_emails(select, add_search) when not already_added[x.email_address]).concat(select)
                # We are no longer searching, but now show an options selector.
                @setState(add_searching:false, add_select:select)

    student_add_button : ->
        <Button onClick={@do_add_search}>
            {if @props.add_searching then <Icon name="circle-o-notch" spin /> else <Icon name="search" />}
        </Button>

    add_selector_clicked : ->
        @setState(selected_entries: ReactDOM.findDOMNode(@refs.add_select).value)

    add_selected_students : ->
        emails = {}
        for x in @state.add_select
            if x.account_id?
                emails[x.account_id] = x.email_address
        students = []

        # handle case, where just one name is listed → clicking on "add" would clear everything w/o inviting
        selected_names = ReactDOM.findDOMNode(@refs.add_select).value
        selections = []
        if selected_names.length == 0
            all_names = @refs.add_select.getInputDOMNode().getElementsByTagName('option')
            if all_names?.length == 1
                selections = [all_names[0].getAttribute('value')]
        else
            selections = selected_names

        for y in selections
            if misc.is_valid_uuid_string(y)
                students.push
                    account_id    : y
                    email_address : emails[y]
            else
                students.push({email_address:y})
        @props.redux.getActions(@props.name).add_students(students)
        @setState(err:undefined, add_select:undefined, selected_entries:undefined, add_search:'')

    get_add_selector_options : ->
        v = []
        seen = {}
        for x in @state.add_select
            key = x.account_id ? x.email_address
            if seen[key]
                continue
            seen[key] = true
            student_name = if x.account_id? then x.first_name + ' ' + x.last_name else x.email_address
            v.push(<option key={key} value={key} label={student_name}>{student_name}</option>)
        return v

    render_add_selector : ->
        if not @state.add_select?
            return
        options = @get_add_selector_options()
        <FormGroup>
            <FormControl componentClass='select' multiple ref="add_select" rows=10 onClick={@add_selector_clicked}>{options}</FormControl>
            {@render_add_selector_button(options)}
        </FormGroup>

    render_add_selector_button : (options) ->
        nb_selected = @state.selected_entries?.length ? 0
        btn_text = switch options.length
            when 0 then "No student found"
            when 1 then "Add student"
            else switch nb_selected
                when 0 then "Select student above"
                when 1 then "Add selected student"
                else "Add #{nb_selected} students"
        disabled = options.length == 0 or (options.length >= 2 and nb_selected == 0)
        <Button onClick={@add_selected_students} disabled={disabled}><Icon name='user-plus' /> {btn_text}</Button>

    render_error : ->
        if @state.err
            <ErrorDisplay error={misc.trunc(@state.err,1024)} onClose={=>@setState(err:undefined)} />

    render_header : (num_omitted) ->
        <div>
            <Row>
                <Col md=3>
                    <SearchInput
                        placeholder = "Find students..."
                        default_value = {@state.search}
                        on_change   = {(value)=>@setState(search:value)}
                    />
                </Col>
                <Col md=4>
                    {<h5>(Omitting {num_omitted} students)</h5> if num_omitted}
                </Col>
                <Col md=5>
                    <form onSubmit={@do_add_search}>
                        <FormGroup>
                            <InputGroup>
                                <FormControl
                                    ref         = 'student_add_input'
                                    type        = 'text'
                                    placeholder = "Add student by name or email address..."
                                    value       = {@state.add_search}
                                    onChange    = {=>@setState(add_select:undefined, add_search:ReactDOM.findDOMNode(@refs.student_add_input).value)}
                                    onKeyDown   = {(e)=>if e.keyCode==27 then @setState(add_search:'', add_select:undefined)}
                                />
                                <InputGroup.Button>
                                    {@student_add_button()}
                                </InputGroup.Button>
                            </InputGroup>
                        </FormGroup>
                    </form>
                    {@render_add_selector()}
                </Col>
            </Row>
            {@render_error()}
        </div>

    compute_student_list : ->
        # TODO: good place to cache something...
        # turn map of students into a list
        v = immutable_to_list(@props.students, 'student_id')
        # fill in names, for use in sorting and searching (TODO: caching)
        for x in v
            if x.account_id?
                user = @props.user_map.get(x.account_id)
                if user?
                    x.first_name = user.get('first_name')
                    x.last_name  = user.get('last_name')
                else
                    x.first_name = 'Please create the student project'
                    x.last_name = ''
                x.sort = (x.last_name + ' ' + x.first_name).toLowerCase()
            else if x.email_address?
                x.sort = x.email_address.toLowerCase()

        v.sort (a,b) ->
            return misc.cmp(a.sort, b.sort)

        # Deleted students
        w = (x for x in v when x.deleted)
        num_deleted = w.length
        v = (x for x in v when not x.deleted)
        if @state.show_deleted  # but show at the end...
            v = v.concat(w)

        num_omitted = 0
        if @state.search
            words  = misc.split(@state.search.toLowerCase())
            search = (a) -> ((a.last_name ? '') + (a.first_name ? '') + (a.email_address ? '')).toLowerCase()
            match  = (s) ->
                for word in words
                    if s.indexOf(word) == -1
                        num_omitted += 1
                        return false
                return true
            v = (x for x in v when match(search(x)))

        return {students:v, num_omitted:num_omitted, num_deleted:num_deleted}

    render_students : (students) ->
        for x,i in students
            <Student background={if i%2==0 then "#eee"} key={x.student_id}
                     student_id={x.student_id} student={@props.students.get(x.student_id)}
                     user_map={@props.user_map} redux={@props.redux} name={@props.name}
                     project_map={@props.project_map}
                     assignments={@props.assignments}
                     />

    render_show_deleted : (num_deleted) ->
        if @state.show_deleted
            <Button style={show_hide_deleted_style} onClick={=>@setState(show_deleted:false)}>
                <Tip placement='left' title="Hide deleted" tip="Students are never really deleted.  Click this button so that deleted students aren't included at the bottom of the list of students.  Deleted students are always hidden from the list of grades.">
                    Hide {num_deleted} deleted students
                </Tip>
            </Button>
        else
            <Button style={show_hide_deleted_style} onClick={=>@setState(show_deleted:true,search:'')}>
                <Tip placement='left' title="Show deleted" tip="Students are not deleted forever, even after you delete them.  Click this button to show any deleted students at the bottom of the list.  You can then click on the student and click undelete to bring the assignment back.">
                    Show {num_deleted} deleted students
                </Tip>
            </Button>

    render : ->
        {students, num_omitted, num_deleted} = @compute_student_list()
        <Panel header={@render_header(num_omitted, num_deleted)}>
            {@render_students(students)}
            {@render_show_deleted(num_deleted) if num_deleted}
        </Panel>

exports.StudentsPanel.Header = rclass
    propTypes:
        n : rtypes.number

    render : ->
        <Tip delayShow=1300
             title="Students"
             tip="This tab lists all students in your course, along with their grades on each assignment.  You can also quickly find students by name on the left and add new students on the right.">
            <span>
                <Icon name="users"/> Students {if @props?.n? then " (#{@props.n})" else ""}
            </span>
        </Tip>

Student = rclass
    displayName : "CourseEditorStudent"

    propTypes :
        redux       : rtypes.object.isRequired
        name        : rtypes.string.isRequired
        student     : rtypes.object.isRequired
        user_map    : rtypes.object.isRequired
        project_map : rtypes.object.isRequired  # here entirely to cause an update when project activity happens
        assignments : rtypes.object.isRequired  # here entirely to cause an update when project activity happens
        background  : rtypes.string

    shouldComponentUpdate : (nextProps, nextState) ->
        return @state != nextState or @props.student != nextProps.student or @props.assignments != nextProps.assignments  or @props.project_map != nextProps.project_map or @props.user_map != nextProps.user_map or @props.background != nextProps.background

    getInitialState : ->
        more : false
        confirm_delete: false

    render_student : ->
        <a href='' onClick={(e)=>e.preventDefault();@setState(more:not @state.more)}>
            <Icon style={marginRight:'10px'}
                  name={if @state.more then 'caret-down' else 'caret-right'}/>
            {@render_student_name()}
        </a>

    render_student_name : ->
        account_id = @props.student.get('account_id')
        if account_id?
            return <User account_id={account_id} user_map={@props.user_map} />
        return <span>{@props.student.get("email_address")} (invited)</span>

    render_student_email : ->
        email = @props.student.get("email_address")
        return <a href="mailto:#{email}">{email}</a>

    open_project : ->
        @props.redux.getActions('projects').open_project(project_id:@props.student.get('project_id'))

    create_project : ->
        @props.redux.getActions(@props.name).create_student_project(@props.student_id)

    render_last_active : ->
        student_project_id = @props.student.get('project_id')
        if not student_project_id?
            return
        # get the last time the student edited this project somehow.
        last_active = @props.redux.getStore('projects').get_last_active(student_project_id)?.get(@props.student.get('account_id'))
        if last_active   # could be 0 or undefined
            return <span style={color:"#666"}>(last used project <TimeAgo date={last_active} />)</span>
        else
            return <span style={color:"#666"}>(has never used project)</span>

    render_hosting: ->
        student_project_id = @props.student.get('project_id')
        if student_project_id
            upgrades = @props.redux.getStore('projects').get_total_project_quotas(student_project_id)
            if not upgrades?
                # user opening the course isn't a collaborator on this student project yet
                return
            if upgrades.member_host
                <Tip placement='left' title={<span><Icon name='check'/> Members-only hosting</span>} tip='Projects is on a members-only server, which is much more robust and has priority support.'>
                    <span style={color:'#888', cursor:'pointer'}><Icon name='check'/> Members-only</span>
                </Tip>
            else
                <Tip placement='left' title={<span><Icon name='exclamation-triangle'/> Free hosting</span>} tip='Project is hosted on a free server, so it may be overloaded and will be rebooted frequently.  Please upgrade in course settings.'>
                     <span style={color:'#888', cursor:'pointer'}><Icon name='exclamation-triangle'/> Free</span>
                </Tip>

    render_project : ->
        # first check if the project is currently being created
        create = @props.student.get("create_project")
        if create?
            # if so, how long ago did it start
            how_long = (salvus_client.server_time() - create)/1000
            if how_long < 120 # less than 2 minutes -- still hope, so render that creating
                return <div><Icon name="circle-o-notch" spin /> Creating project...(started <TimeAgo date={create} />)</div>
            # otherwise, maybe user killed file before finished or something and it is lost; give them the chance
            # to attempt creation again by clicking the create button.

        student_project_id = @props.student.get('project_id')
        if student_project_id?
            <Tip placement='right'
                 title='Student project'
                 tip='Open the course project for this student.'>
                <Button onClick={@open_project}>
                    <Icon name="edit" /> Open student project
                </Button>
            </Tip>
        else
            <Tip placement='right'
                 title='Create the student project'
                 tip='Create a new project for this student, then add (or invite) the student as a collaborator, and also add any collaborators on the project containing this course.'>
                <Button onClick={@create_project}>
                    <Icon name="plus-circle" /> Create student project
                </Button>
            </Tip>

    delete_student : ->
        @props.redux.getActions(@props.name).delete_student(@props.student)
        @setState(confirm_delete:false)

    undelete_student : ->
        @props.redux.getActions(@props.name).undelete_student(@props.student)

    render_confirm_delete : ->
        if @state.confirm_delete
            <div>
                Are you sure you want to delete this student (you can always undelete them later)?<Space/>
                <ButtonToolbar>
                    <Button onClick={@delete_student} bsStyle='danger'>
                        <Icon name="trash" /> YES, Delete
                    </Button>
                    <Button onClick={=>@setState(confirm_delete:false)}>
                        Cancel
                    </Button>
                </ButtonToolbar>
            </div>

    render_delete_button : ->
        if not @state.more
            return
        if @state.confirm_delete
            return @render_confirm_delete()
        if @props.student.get('deleted')
            <Button onClick={@undelete_student} style={float:'right'}>
                <Icon name="trash-o" /> Undelete
            </Button>
        else
            <Button onClick={=>@setState(confirm_delete:true)} style={float:'right'}>
                <Icon name="trash" /> Delete...
            </Button>

    render_title_due : (assignment) ->
        date = assignment.get('due_date')
        if date
            <span>(Due <TimeAgo date={date} />)</span>

    render_title : (assignment) ->
        <span>
            <em>{misc.trunc_middle(assignment.get('path'), 50)}</em> {@render_title_due(assignment)}
        </span>

    render_assignments_info_rows : ->
        store = @props.redux.getStore(@props.name)
        for assignment in store.get_sorted_assignments()
            grade = store.get_grade(assignment, @props.student)
            <StudentAssignmentInfo
                  key={assignment.get('assignment_id')}
                  title={@render_title(assignment)}
                  name={@props.name} redux={@props.redux}
                  student={@props.student} assignment={assignment}
                  grade={grade} />

    render_assignments_info : ->
        peer_grade = @props.redux.getStore(@props.name).any_assignment_uses_peer_grading()
        header = <StudentAssignmentInfoHeader key='header' title="Assignment" peer_grade={peer_grade}/>
        return [header, @render_assignments_info_rows()]

    render_note : ->
        <Row key='note' style={note_style}>
            <Col xs=2>
                <Tip title="Notes about this student" tip="Record notes about this student here. These notes are only visible to you, not to the student.  In particular, you might want to include an email address or other identifying information here, and notes about late assignments, excuses, etc.">
                    Notes
                </Tip>
            </Col>
            <Col xs=10>
                <MarkdownInput
                    rows        = 6
                    placeholder = 'Notes about student (not visible to student)'
                    default_value = {@props.student.get('note')}
                    on_save     = {(value)=>@props.redux.getActions(@props.name).set_student_note(@props.student, value)}
                />
            </Col>
        </Row>

    render_more_info : ->
        # Info for each assignment about the student.
        v = []
        v.push <Row key='more'>
                <Col md=12>
                    {@render_assignments_info()}
                </Col>
            </Row>
        v.push(@render_note())
        return v

    render_basic_info : ->
        <Row key='basic' style={backgroundColor:@props.background}>
            <Col md=3>
                <h5>
                    {@render_student()}
                    {@render_deleted()}
                </h5>
            </Col>
            <Col md=2>
                <h5 style={color:"#666"}>
                    {@render_student_email()}
                </h5>
            </Col>
            <Col md=4 style={paddingTop:'10px'}>
                {@render_last_active()}
            </Col>
            <Col md=3 style={paddingTop:'10px'}>
                {@render_hosting()}
            </Col>
        </Row>

    render_deleted : ->
        if @props.student.get('deleted')
            <b> (deleted)</b>

    render_panel_header : ->
        <Row>
            <Col md=4>
                {@render_project()}
            </Col>
            <Col md=4 mdOffset=4>
                {@render_delete_button()}
            </Col>
        </Row>

    render_more_panel : ->
        <Panel header={@render_panel_header()}>
            {@render_more_info()}
        </Panel>

    render : ->
        <Row style={if @state.more then selected_entry_style else entry_style}>
            <Col xs=12>
                {@render_basic_info()}
                {@render_more_panel() if @state.more}
            </Col>
        </Row>

immutable_to_list = (x, primary_key) ->
    if not x?
        return
    v = []
    x.map (val, key) ->
        v.push(misc.merge(val.toJS(), {"#{primary_key}":key}))
    return v

noncloud_emails = (v, s) ->
    # Given a list v of user_search results, and a search string s,
    # return entries for each email address not in v, in order.
    {string_queries, email_queries} = misc.parse_user_search(s)
    result_emails = misc.dict(([r.email_address, true] for r in v when r.email_address?))
    return ({email_address:r} for r in email_queries when not result_emails[r]).sort (a,b)->
        misc.cmp(a.email_address,b.email_address)