# SMC libraries
misc = require('smc-util/misc')
{defaults, required} = misc
{salvus_client} = require('../salvus_client')

# React libraries and components
{React, ReactDOM, rclass, rtypes}  = require('../smc-react')
{Button, ButtonToolbar, ButtonGroup, FormGroup, FormControl, InputGroup, Row, Col, Panel, Well} = require('react-bootstrap')

# SMC components
{User} = require('../users')
{ErrorDisplay, Icon, MarkdownInput, SearchInput, Space, TimeAgo, Tip} = require('../r_misc')
{StudentAssignmentInfo, StudentAssignmentInfoHeader} = require('./common')

selected_entry_style =
    border        : '1px solid #aaa'
    boxShadow     : '5px 5px 5px #999'
    borderRadius  : '3px'
    marginBottom  : '10px'
    paddingBottom : '5px'
    paddingTop    : '5px'

note_style =
    borderTop  : '3px solid #aaa'
    marginTop  : '10px'
    paddingTop : '5px'

show_hide_deleted_style =
    marginTop  : '20px'
    float      : 'right'

exports.StudentsPanel = rclass ({name}) ->
    displayName: "CourseEditorStudents"

    reduxProps:
        "#{name}":
            expanded_students   : rtypes.immutable.Set
            active_student_sort : rtypes.object
            get_student_name    : rtypes.func

    propTypes:
        name        : rtypes.string.isRequired
        redux       : rtypes.object.isRequired
        project_id  : rtypes.string.isRequired
        students    : rtypes.object.isRequired
        user_map    : rtypes.object.isRequired
        project_map : rtypes.object.isRequired
        assignments : rtypes.object.isRequired

    getInitialState: ->
        err              : undefined
        search           : ''
        add_search       : ''
        add_searching    : false
        add_select       : undefined
        existing_students: undefined
        selected_option_nodes : undefined
        show_deleted     : false

    do_add_search: (e) ->
        # Search for people to add to the course
        e?.preventDefault()
        if not @props.students?
            return
        if @state.add_searching # already searching
            return
        search = @state.add_search.trim()
        if search.length == 0
            @setState(err:undefined, add_select:undefined, existing_students:undefined, selected_option_nodes:undefined)
            return
        @setState(add_searching:true, add_select:undefined, existing_students:undefined, selected_option_nodes:undefined)
        add_search = @state.add_search
        salvus_client.user_search
            query : add_search
            limit : 50
            cb    : (err, select) =>
                if err
                    @setState(add_searching:false, err:err, add_select:undefined, existing_students:undefined)
                    return
                # Get the current collaborators/owners of the project that contains the course.
                users = @props.redux.getStore('projects').get_users(@props.project_id)
                # Make a map with keys the email or account_id is already part of the course.
                already_added = users.toJS()  # start with collabs on project
                # also track **which** students are already part of the course
                existing_students = {}
                existing_students.account = {}
                existing_students.email   = {}
                # For each student in course add account_id and/or email_address:
                @props.students.map (val, key) =>
                    for n in ['account_id', 'email_address']
                        if val.get(n)?
                            already_added[val.get(n)] = true
                # This function returns true if we shouldn't list the given account_id or email_address
                # in the search selector for adding to the class.
                exclude_add = (account_id, email_address) =>
                    aa = already_added[account_id] or already_added[email_address]
                    if aa
                        if account_id?
                            existing_students.account[account_id] = true
                        if email_address?
                            existing_students.email[email_address] = true
                    return aa
                select2 = (x for x in select when not exclude_add(x.account_id, x.email_address))
                # Put at the front of the list any email addresses not known to SMC (sorted in order) and also not invited to course.
                # NOTE (see comment on https://github.com/sagemathinc/smc/issues/677): it is very important to pass in
                # the original select list to nonclude_emails below, **NOT** select2 above.  Otherwise, we wend up
                # bringing back everything in the search, which is a bug.
                select3 = (x for x in noncloud_emails(select, add_search) when not exclude_add(null, x.email_address)).concat(select2)
                # We are no longer searching, but now show an options selector.
                @setState(add_searching:false, add_select:select3, existing_students:existing_students)

    student_add_button: ->
        <Button onClick={@do_add_search}>
            {if @props.add_searching then <Icon name="circle-o-notch" spin /> else <Icon name="search" />}
        </Button>

    add_selector_clicked: ->
        @setState(selected_option_nodes: ReactDOM.findDOMNode(@refs.add_select).selectedOptions)

    add_selected_students: (options) ->
        emails = {}
        for x in @state.add_select
            if x.account_id?
                emails[x.account_id] = x.email_address
        students = []
        selections = []

        # first check, if no student is selected and there is just one in the list
        if (not @state.selected_option_nodes? or @state.selected_option_nodes?.length == 0) and options?.length == 1
            selections.push(options[0].key)
        else
            for option in @state.selected_option_nodes
                selections.push(option.getAttribute('value'))

        for y in selections
            if misc.is_valid_uuid_string(y)
                students.push
                    account_id    : y
                    email_address : emails[y]
            else
                students.push({email_address:y})
        @actions(@props.name).add_students(students)
        @setState(err:undefined, add_select:undefined, selected_option_nodes:undefined, add_search:'')

    get_add_selector_options: ->
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

    render_add_selector: ->
        if not @state.add_select?
            return
        options = @get_add_selector_options()
        <FormGroup>
            <FormControl componentClass='select' multiple ref="add_select" rows=10 onClick={@add_selector_clicked}>
                {options}
            </FormControl>
            {@render_add_selector_button(options)}
        </FormGroup>

    render_add_selector_button: (options) ->
        nb_selected = @state.selected_option_nodes?.length ? 0
        _ = require('underscore')
        es = @state.existing_students
        if es?
            existing = _.keys(es.email).length + _.keys(es.account).length > 0
        else
            # es not defined when user clicks the close button on the warning.
            existing = 0
        btn_text = switch options.length
            when 0 then (if existing then "Student already added" else "No student found")
            when 1 then "Add student"
            else switch nb_selected
                when 0 then "Select student above"
                when 1 then "Add selected student"
                else "Add #{nb_selected} students"
        disabled = options.length == 0 or (options.length >= 2 and nb_selected == 0)
        <Button onClick={=>@add_selected_students(options)} disabled={disabled}><Icon name='user-plus' /> {btn_text}</Button>

    render_error: ->
        ed = null
        if @state.err
            ed = <ErrorDisplay error={misc.trunc(@state.err,1024)} onClose={=>@setState(err:undefined)} />
        else if @state.existing_students?
            existing = []
            for email, v of @state.existing_students.email
                existing.push(email)
            for account_id, v of @state.existing_students.account
                user = @props.user_map.get(account_id)
                existing.push("#{user.get('first_name')} #{user.get('last_name')}")
            if existing.length > 0
                if existing.length > 1
                    msg = "Already added students or project collaborators: "
                else
                    msg = "Already added student or project collaborator: "
                msg += existing.join(', ')
                ed = <ErrorDisplay bsStyle='info' error=msg onClose={=>@setState(existing_students:undefined)} />
        if ed?
            <Row style={marginTop:'1em', marginBottom:'-10px'}><Col md=5 lgOffset=7>{ed}</Col></Row>

    render_header: (num_omitted) ->
        <div>
            <Row style={marginBottom:'-15px'}>
                <Col md=3>
                    <SearchInput
                        placeholder = "Find students..."
                        default_value = {@state.search}
                        on_change   = {(value)=>@setState(search:value)}
                    />
                </Col>
                <Col md=4>
                    {<h6>(Omitting {num_omitted} students)</h6> if num_omitted}
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

    sort_on_string_field: (field) ->
        (a,b) -> misc.cmp(a[field].toLowerCase(), b[field].toLowerCase())

    sort_on_numerical_field: (field) ->
        (a,b) -> misc.cmp(a[field] * -1, b[field] * -1)

    pick_sorter: (sort=@props.active_student_sort) ->
        switch sort.column_name
            when "email" then @sort_on_string_field("email_address")
            when "first_name" then @sort_on_string_field("first_name")
            when "last_name" then @sort_on_string_field("last_name")
            when "last_active" then @sort_on_numerical_field("last_active")
            when "hosting" then @sort_on_numerical_field("hosting")

    compute_student_list: ->
        # TODO: good place to cache something...
        # turn map of students into a list
        # account_id     : "bed84c9e-98e0-494f-99a1-ad9203f752cb" # Student's SMC account ID
        # email_address  : "4@student.com"                        # Email the instructor signed the student up with.
        # first_name     : "Rachel"                               # Student's first name they use for SMC
        # last_name      : "Florence"                             # Student's last name they use for SMC
        # project_id     : "6bea25c7-da96-4e92-aa50-46ebee1994ca" # Student's project ID for this course
        # student_id     : "920bdad2-9c3a-40ab-b5c0-eb0b3979e212" # Student's id for this course
        # last_active    : 2357025
        # create_project : True
        # deleted        : False
        # note           : "Is younger sister of Abby Florence (TA)"

        v = immutable_to_list(@props.students, 'student_id')
        # Fill in values
        # TODO: Caching
        for x in v
            if x.account_id?
                user = @props.user_map.get(x.account_id)
                x.first_name ?= user?.get('first_name') ? ''
                x.last_name  ?= user?.get('last_name') ? ''
                if x.project_id?
                    x.last_active = @props.redux.getStore('projects').get_last_active(x.project_id)?.get(x.account_id)?.getTime?()
                    upgrades = @props.redux.getStore('projects').get_total_project_quotas(x.project_id)
                    if upgrades?
                        x.hosting = upgrades.member_host

            x.first_name  ?= ""
            x.last_name   ?= ""
            x.last_active ?= 0
            x.hosting ?= false
            x.email_address ?= ""

        v.sort(@pick_sorter())

        if @props.active_student_sort.is_descending
            v.reverse()

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

    render_sort_link: (column_name, display_name) ->
        <a href=''
            onClick={(e)=>e.preventDefault();@actions(@props.name).set_active_student_sort(column_name)}>
            {display_name}
            <Space/>
            {<Icon style={marginRight:'10px'}
                name={if @props.active_student_sort.is_descending then 'caret-up' else 'caret-down'}
            /> if @props.active_student_sort.column_name == column_name}
        </a>

    render_student_table_header: ->
        # HACK: -10px margin gets around ReactBootstrap's incomplete access to styling
        <Row style={marginTop:'-10px', marginBottom:'3px'}>
            <Col md=3>
                <div style={display:'inline-block', width:'50%'}>
                    {@render_sort_link("first_name", "First Name")}
                </div>
                <div style={display:"inline-block"}>
                    {@render_sort_link("last_name", "Last Name")}
                </div>
            </Col>
            <Col md=2>
                {@render_sort_link("email", "Student Email")}
            </Col>
            <Col md=4>
                {@render_sort_link("last_active", "Last Active")}
            </Col>
            <Col md=3>
                {@render_sort_link("hosting", "Hosting Type")}
            </Col>
        </Row>

    render_students: (students) ->
        for x,i in students
            name =
                full  : @props.get_student_name(x.student_id)
                first : x.first_name
                last  : x.last_name

            <Student background={if i%2==0 then "#eee"} key={x.student_id}
                     student_id={x.student_id} student={@props.students.get(x.student_id)}
                     user_map={@props.user_map} redux={@props.redux} name={@props.name}
                     project_map={@props.project_map}
                     assignments={@props.assignments}
                     is_expanded={@props.expanded_students.has(x.student_id)}
                     student_name={name}
                     display_account_name={true}
                     />

    render_show_deleted: (num_deleted) ->
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

    render: ->
        {students, num_omitted, num_deleted} = @compute_student_list()
        <Panel header={@render_header(num_omitted, num_deleted)}>
            {@render_student_table_header()}
            {@render_students(students)}
            {@render_show_deleted(num_deleted) if num_deleted}
        </Panel>

exports.StudentsPanel.Header = rclass
    propTypes:
        n : rtypes.number

    render: ->
        <Tip delayShow=1300
             title="Students"
             tip="This tab lists all students in your course, along with their grades on each assignment.  You can also quickly find students by name on the left and add new students on the right.">
            <span>
                <Icon name="users"/> Students {if @props?.n? then " (#{@props.n})" else ""}
            </span>
        </Tip>

###
 Updates based on:
  - Expanded/Collapsed
  - If collapsed: First name, last name, email, last active, hosting type
  - If expanded: Above +, Student's status on all assignments,

###
Student = rclass
    displayName: "CourseEditorStudent"

    propTypes:
        redux                : rtypes.object.isRequired
        name                 : rtypes.string.isRequired
        student              : rtypes.object.isRequired
        user_map             : rtypes.object.isRequired
        project_map          : rtypes.object.isRequired  # here entirely to cause an update when project activity happens
        assignments          : rtypes.object.isRequired  # here entirely to cause an update when project activity happens
        background           : rtypes.string
        is_expanded          : rtypes.bool
        student_name         : rtypes.object
        display_account_name : rtypes.bool

    shouldComponentUpdate: (nextProps, nextState) ->
        return @state != nextState or @props.student != nextProps.student or @props.assignments != nextProps.assignments  or @props.project_map != nextProps.project_map or @props.user_map != nextProps.user_map or @props.background != nextProps.background or @props.is_expanded != nextProps.is_expanded or @props.student_name.full != nextProps.student_name.full

    componentWillReceiveProps: (next) ->
        if @props.student_name.first != next.student_name.first
            @setState(edited_first_name : next.student_name.first)
        if @props.student_name.last != next.student_name.last
            @setState(edited_last_name : next.student_name.last)

    getInitialState: ->
        confirm_delete    : false
        editing_student   : false
        edited_first_name : @props.student_name.first
        edited_last_name  : @props.student_name.last

    on_key_down: (e) ->
        switch e.keyCode
            when 13
                @save_student_name()
            when 27
                @cancel_student_edit()

    toggle_show_more: (e) ->
        e.preventDefault()
        if @state.editing_student
            @cancel_student_edit()
        item_id = @props.student.get('student_id')
        @actions(@props.name).toggle_item_expansion('student', item_id)

    render_student: ->
        <a href='' onClick={@toggle_show_more}>
            <Icon style={marginRight:'10px'}
                  name={if @props.is_expanded then 'caret-down' else 'caret-right'}
            />
            {@render_student_name()}
        </a>

    render_student_name: ->
        account_id = @props.student.get('account_id')
        if account_id?
            return <User account_id={account_id} user_map={@props.user_map} name={@props.student_name.full} show_original={@props.display_account_name}/>
        return <span>{@props.student.get("email_address")} (invited)</span>

    render_student_email: ->
        email = @props.student.get("email_address")
        return <a href="mailto:#{email}">{email}</a>

    open_project: ->
        @actions('projects').open_project(project_id:@props.student.get('project_id'))

    create_project: ->
        @actions(@props.name).create_student_project(@props.student_id)

    render_last_active: ->
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

    render_project_access: ->
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
            <ButtonToolbar>
                <ButtonGroup>
                    <Button onClick={@open_project}>
                        <Tip placement='right'
                             title='Student project'
                             tip='Open the course project for this student.'
                        >
                            <Icon name="edit" /> Open student project
                        </Tip>
                    </Button>
                </ButtonGroup>
                {@render_edit_name() if @props.student.get('account_id')}
            </ButtonToolbar>
        else
            <Tip placement='right'
                 title='Create the student project'
                 tip='Create a new project for this student, then add (or invite) the student as a collaborator, and also add any collaborators on the project containing this course.'>
                <Button onClick={@create_project}>
                    <Icon name="plus-circle" /> Create student project
                </Button>
            </Tip>

    render_edit_name: ->
        if @state.editing_student
            disable_save = @props.student_name.first == @state.edited_first_name and @props.student_name.last == @state.edited_last_name
            <ButtonGroup>
                <Button onClick={@save_student_name} bsStyle='success' disabled={disable_save}>
                    <Icon name='save'/> Save
                </Button>
                <Button onClick={@cancel_student_edit} >
                    Cancel
                </Button>
            </ButtonGroup>
        else
            <Button onClick={@show_edit_name_dialogue}>
                <Icon name='address-card-o'/> Edit student...
            </Button>

    cancel_student_edit: ->
        @setState(@getInitialState())

    save_student_name: ->
        @actions(@props.name).set_internal_student_name(@props.student, @state.edited_first_name, @state.edited_last_name)
        @setState(editing_student:false)

    show_edit_name_dialogue: ->
        @setState(editing_student:true)

    delete_student: ->
        @actions(@props.name).delete_student(@props.student)
        @setState(confirm_delete:false)

    undelete_student: ->
        @actions(@props.name).undelete_student(@props.student)

    render_confirm_delete: ->
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

    render_delete_button: ->
        if not @props.is_expanded
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

    render_title_due: (assignment) ->
        date = assignment.get('due_date')
        if date
            <span>(Due <TimeAgo date={date} />)</span>

    render_title: (assignment) ->
        <span>
            <em>{misc.trunc_middle(assignment.get('path'), 50)}</em> {@render_title_due(assignment)}
        </span>

    render_assignments_info_rows: ->
        store = @props.redux.getStore(@props.name)
        for assignment in store.get_sorted_assignments()
            grade = store.get_grade(assignment, @props.student)
            info = store.student_assignment_info(@props.student, assignment)
            <StudentAssignmentInfo
                key={assignment.get('assignment_id')}
                title={@render_title(assignment)}
                name={@props.name}
                student={@props.student}
                assignment={assignment}
                grade={grade}
                info={info}
                />

    render_assignments_info: ->
        peer_grade = @props.redux.getStore(@props.name).any_assignment_uses_peer_grading()
        header = <StudentAssignmentInfoHeader key='header' title="Assignment" peer_grade={peer_grade}/>
        return [header, @render_assignments_info_rows()]

    render_note: ->
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
                    on_save     = {(value)=>@actions(@props.name).set_student_note(@props.student, value)}
                />
            </Col>
        </Row>

    render_more_info: ->
        # Info for each assignment about the student.
        v = []
        v.push <Row key='more'>
                <Col md=12>
                    {@render_assignments_info()}
                </Col>
            </Row>
        v.push(@render_note())
        return v

    render_basic_info: ->
        <Row key='basic' style={backgroundColor:@props.background}>
            <Col md=3>
                <h6>
                    {@render_student()}
                    {@render_deleted()}
                </h6>
            </Col>
            <Col md=2>
                <h6 style={color:"#666"}>
                    {@render_student_email()}
                </h6>
            </Col>
            <Col md=4 style={paddingTop:'10px'}>
                {@render_last_active()}
            </Col>
            <Col md=3 style={paddingTop:'10px'}>
                {@render_hosting()}
            </Col>
        </Row>

    render_deleted: ->
        if @props.student.get('deleted')
            <b> (deleted)</b>

    render_panel_header: ->
        <div>
            <Row>
                <Col md=8>
                    {@render_project_access()}
                </Col>
                <Col md=4>
                    {@render_delete_button()}
                </Col>
            </Row>
            {<Row>
                <Col md=4>
                    {@render_edit_student_interface()}
                </Col>
            </Row> if @state.editing_student }
        </div>

    render_edit_student_interface: ->
        <Well style={marginTop:'10px'}>
            <Row>
                <Col md=6>
                    First Name
                    <FormGroup>
                        <FormControl
                            type       = 'text'
                            autoFocus  = {true}
                            value      = {@state.edited_first_name}
                            onClick    = {(e) => e.stopPropagation(); e.preventDefault()}
                            onChange   = {(e) => @setState(edited_first_name : e.target.value)}
                            onKeyDown  = {@on_key_down}
                        />
                    </FormGroup>
                </Col>
                <Col md=6>
                    Last Name
                    <FormGroup>
                        <FormControl
                            type       = 'text'
                            value      = {@state.edited_last_name}
                            onClick    = {(e) => e.stopPropagation(); e.preventDefault()}
                            onChange   = {(e) => @setState(edited_last_name : e.target.value)}
                            onKeyDown  = {@on_key_down}
                        />
                    </FormGroup>
                </Col>
            </Row>
        </Well>

    render_more_panel: ->
        <Row>
            <Panel header={@render_panel_header()}>
                {@render_more_info()}
            </Panel>
        </Row>

    render: ->
        <Row style={if @state.more then selected_entry_style}>
            <Col xs=12>
                {@render_basic_info()}
                {@render_more_panel() if @props.is_expanded}
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