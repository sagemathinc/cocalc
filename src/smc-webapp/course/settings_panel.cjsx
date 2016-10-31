# standard non-SMC libraries
immutable = require('immutable')

# SMC libraries
misc = require('smc-util/misc')
{defaults, required} = misc
{salvus_client} = require('../salvus_client')
schema = require('smc-util/schema')

# React libraries and Components
{React, rclass, rtypes, ReactDOM}  = require('../smc-react')
{Alert, Button, ButtonToolbar, ButtonGroup, Row, Col,
    Panel, Well, FormGroup, FormControl, Checkbox} = require('react-bootstrap')

# SMC Components
{Calendar, Icon, LabeledRow, Loading, MarkdownInput, NoUpgrades
     Space, TextInput, TimeAgo, Tip, UPGRADE_ERROR_STYLE} = require('../r_misc')

StudentProjectsStartStopPanel = rclass ({name}) ->
    displayName : "CourseEditorSettings-StudentProjectsStartStopPanel"

    reduxProps :
        "#{name}" :
            action_all_projects_state : rtypes.string

    propTypes :
        num_running_projects : rtypes.number
        num_students         : rtypes.number

    getDefaultProps : ->
        action_all_projects_state : "any"

    getInitialState : ->
        confirm_stop_all_projects   : false
        confirm_start_all_projects  : false

    render_in_progress_action : ->
        state_name = @props.action_all_projects_state
        switch state_name
            when "stopping"
                if @props.num_running_projects == 0
                    return
                bsStyle = 'warning'
            else
                if @props.num_running_projects == @props.num_students
                    return
                bsStyle = 'info'

        <Alert bsStyle=bsStyle>
            {misc.capitalize(state_name)} all projects... <Icon name='circle-o-notch' spin />
        </Alert>

    render_confirm_stop_all_projects: ->
        <Alert bsStyle='warning'>
            Are you sure you want to stop all student projects (this might be disruptive)?
            <br/>
            <br/>
            <ButtonToolbar>
                <Button bsStyle='warning' onClick={=>@setState(confirm_stop_all_projects:false);@actions(@props.name).action_all_student_projects('stop')}>
                    <Icon name='hand-stop-o'/> Stop all
                </Button>
                <Button onClick={=>@setState(confirm_stop_all_projects:false)}>
                    Cancel
                </Button>
            </ButtonToolbar>
        </Alert>

    render_confirm_start_all_projects: ->
        <Alert bsStyle='info'>
            Are you sure you want to start all student projects?  This will ensure the projects are already running when the students
            open them.
            <br/>
            <br/>
            <ButtonToolbar>
                <Button bsStyle='primary' onClick={=>@setState(confirm_start_all_projects:false);@actions(@props.name).action_all_student_projects('start')}>
                    <Icon name='flash'/> Start all
                </Button>
                <Button onClick={=>@setState(confirm_start_all_projects:false)}>
                    Cancel
                </Button>
            </ButtonToolbar>
        </Alert>

    render : ->
        r = @props.num_running_projects
        n = @props.num_students
        <Panel header={<h4><Icon name='flash'/> Student projects control</h4>}>
            <Row>
                <Col md=9>
                    {r} of {n} student projects currently running.
                </Col>
            </Row>
            <Row style={marginTop:'10px'}>
                <Col md=12>
                    <ButtonToolbar>
                        <Button onClick={=>@setState(confirm_start_all_projects:true)}
                            disabled={n==0 or n==r or @state.confirm_start_all_projects or @props.action_all_projects_state == "starting"}
                        >
                            <Icon name="flash"/> Start all...
                        </Button>
                        <Button onClick={=>@setState(confirm_stop_all_projects:true)}
                            disabled={n==0 or r==0 or @state.confirm_stop_all_projects or @props.action_all_projects_state == "stopping"}
                        >
                            <Icon name="hand-stop-o"/> Stop all...
                        </Button>
                    </ButtonToolbar>
                </Col>
            </Row>
            <Row style={marginTop:'10px'}>
                <Col md=12>
                    {@render_confirm_start_all_projects() if @state.confirm_start_all_projects}
                    {@render_confirm_stop_all_projects() if @state.confirm_stop_all_projects}
                    {@render_in_progress_action() if @props.action_all_projects_state != "any"}
                </Col>
            </Row>
            <hr/>
            <span style={color:'#666'}>
                Start all projects associated with this course so they are immediately ready for your students to use. For example, you might do this before a computer lab.  You can also stop all projects in order to ensure that they do not waste resources or are properly upgraded when next used by students.
            </span>
        </Panel>


exports.SettingsPanel = rclass
    displayName : "CourseEditorSettings"

    propTypes :
        redux       : rtypes.object.isRequired
        name        : rtypes.string.isRequired
        path        : rtypes.string.isRequired
        project_id  : rtypes.string.isRequired
        settings    : rtypes.immutable.Map.isRequired
        project_map : rtypes.immutable.Map.isRequired

    getInitialState : ->
        delete_student_projects_confirm : false
        upgrade_quotas                  : false
        show_students_pay_dialog        : false
        students_pay_when               : @props.settings.get('pay')
        students_pay                    : !!@props.settings.get('pay')

    ###
    # Editing title/description
    ###
    render_title_desc_header : ->
        <h4>
            <Icon name='header' />   Title and description
        </h4>

    render_title_description : ->
        if not @props.settings?
            return <Loading />
        <Panel header={@render_title_desc_header()}>
            <LabeledRow label="Title">
                <TextInput
                    text={@props.settings.get('title')}
                    on_change={(title)=>@actions(@props.name).set_title(title)}
                />
            </LabeledRow>
            <LabeledRow label="Description">
                <MarkdownInput
                    rows    = 6
                    type    = "textarea"
                    default_value = {@props.settings.get('description')}
                    on_save ={(desc)=>@actions(@props.name).set_description(desc)}
                />
            </LabeledRow>
            <hr/>
            <span style={color:'#666'}>
                Set the course title and description here.
                When you change the title or description, the corresponding
                title and description of each student project will be updated.
                The description is set to this description, and the title
                is set to the student name followed by this title.
                Use the description to provide additional information about
                the course, e.g., a link to the main course website.
            </span>
        </Panel>

    ###
    # Grade export
    ###
    render_grades_header : ->
        <h4>
            <Icon name='table' />  Export grades
        </h4>

    path : (ext) ->
        p = @props.path
        i = p.lastIndexOf('.')
        return p.slice(0,i) + '.' + ext

    open_file : (path) ->
        @actions(project_id : @props.project_id).open_file(path:path,foreground:true)

    write_file : (path, content) ->
        actions = @actions(@props.name)
        id = actions.set_activity(desc:"Writing #{path}")
        salvus_client.write_text_file_to_project
            project_id : @props.project_id
            path       : path
            content    : content
            cb         : (err) =>
                actions.set_activity(id:id)
                if not err
                    @open_file(path)
                else
                    actions.set_error("Error writing '#{path}' -- '#{err}'")

    save_grades_to_csv : ->
        store = @props.redux.getStore(@props.name)
        assignments = store.get_sorted_assignments()
        students = store.get_sorted_students()
        # CSV definition: http://edoceo.com/utilitas/csv-file-format
        # i.e. double quotes everywhere (not single!) and double quote in double quotes usually blows up
        timestamp  = (salvus_client.server_time()).toISOString()
        content = "# Course '#{@props.settings.get('title')}'\n"
        content += "# exported #{timestamp}\n"
        content += "Name,Email,"
        content += ("\"#{assignment.get('path')}\"" for assignment in assignments).join(',') + '\n'
        for student in store.get_sorted_students()
            grades = ("\"#{store.get_grade(assignment, student) ? ''}\"" for assignment in assignments).join(',')
            name   = "\"#{store.get_student_name(student)}\""
            email  = "\"#{store.get_student_email(student) ? ''}\""
            line   = [name, email, grades].join(',')
            content += line + '\n'
        @write_file(@path('csv'), content)

    save_grades_to_py : ->
        ###
        example:
        course = 'title'
        exported = 'iso date'
        assignments = ['Assignment 1', 'Assignment 2']
        students=[
            {'name':'Foo Bar', 'email': 'foo@bar.com', 'grades':[85,37]},
            {'name':'Bar None', 'email': 'bar@school.edu', 'grades':[15,50]},
        ]
        ###
        timestamp = (salvus_client.server_time()).toISOString()
        store = @props.redux.getStore(@props.name)
        assignments = store.get_sorted_assignments()
        students = store.get_sorted_students()
        content = "course = '#{@props.settings.get('title')}'\n"
        content += "exported = '#{timestamp}'\n"
        content += "assignments = ["
        content += ("'#{assignment.get('path')}'" for assignment in assignments).join(',') + ']\n'

        content += 'students = [\n'
        for student in store.get_sorted_students()
            grades = (("'#{store.get_grade(assignment, student) ? ''}'") for assignment in assignments).join(',')
            name   = store.get_student_name(student)
            email  = store.get_student_email(student)
            email  = if email? then "'#{email}'" else 'None'
            line   = "    {'name':'#{name}', 'email':#{email}, 'grades':[#{grades}]},"
            content += line + '\n'
        content += ']\n'
        @write_file(@path('py'), content)

    render_save_grades : ->
        <Panel header={@render_grades_header()}>
            <div style={marginBottom:'10px'}>Save grades to... </div>
            <ButtonToolbar>
                <Button onClick={@save_grades_to_csv}><Icon name='file-text-o'/> CSV file...</Button>
                <Button onClick={@save_grades_to_py}><Icon name='file-code-o'/> Python file...</Button>
            </ButtonToolbar>
            <hr/>
            <span style={color:"#666"}>
                Export all the grades you have recorded
                for students in your course to a csv or Python file.
            </span>
        </Panel>

    ###
    # Help box
    ###
    render_help : ->
        <Panel header={<h4><Icon name='question-circle' />  Help</h4>}>
            <span style={color:"#666"}>
                <ul>
                    <li>
                        <a href="https://github.com/mikecroucher/SMC_tutorial#sagemathcloud" target="_blank">
                            A tutorial for anyone wanting to use SageMathCloud for teaching
                        </a> (by Mike Croucher)
                    </li>
                    <li>
                        <a href="http://www.beezers.org/blog/bb/2015/09/grading-in-sagemathcloud/" target='_blank'>
                            Grading Courses <Icon name='external-link'/></a> (by Rob Beezer)
                    </li>
                    <li>
                        <a href="http://www.beezers.org/blog/bb/2016/01/pennies-a-day-for-sagemathcloud/" target="_blank">
                            Course Plans and teaching experiences <Icon name='external-link'/></a> (by Rob Beezer)
                    </li>
                    <li>
                        <a href="http://blog.ouseful.info/2015/11/24/course-management-and-collaborative-jupyter-notebooks-via-sagemathcloud/" target='_blank'>
                            Course Management and collaborative Jupyter Notebooks <Icon name='external-link'/></a> (by Tony Hirst)
                    </li>
                </ul>
            </span>
        </Panel>

    ###
    # Custom invitation email body
    ###

    render_email_invite_body: ->
        template_instr = ' Also, {title} will be replaced by the title of the course and {name} by your name.'
        <Panel header={<h4><Icon name='envelope'/> Customize email invitation</h4>}>
            <div style={border:'1px solid lightgrey', padding: '10px', borderRadius: '5px'}>
                <MarkdownInput
                    rows    = 6
                    type    = "textarea"
                    default_value = {@props.redux.getStore(@props.name).get_email_invite()}
                    on_save ={(body)=>@actions(@props.name).set_email_invite(body)}
                />
            </div>
            <hr/>
            <span style={color:'#666'}>
                If you add a student to this course using their email address, and they do not
                have a SageMathCloud account, then they will receive an email invitation. {template_instr}
            </span>
        </Panel>

    ###
    # Deleting student projects
    ###

    delete_all_student_projects: ->
        @actions(@props.name).delete_all_student_projects()

    render_confirm_delete_student_projects: ->
        <Well style={marginTop:'10px'}>
            All student projects will be deleted.  Are you absolutely sure?
            <ButtonToolbar style={marginTop:'10px'}>
                <Button bsStyle='danger' onClick={=>@setState(delete_student_projects_confirm:false); @delete_all_student_projects()}>YES, DELETE all Student Projects</Button>
                <Button onClick={=>@setState(delete_student_projects_confirm:false)}>Cancel</Button>
            </ButtonToolbar>
        </Well>

    render_start_all_projects: ->
        r = @props.redux.getStore(@props.name).num_running_projects(@props.project_map)
        n = @props.redux.getStore(@props.name).num_students()
        <StudentProjectsStartStopPanel
            name                 = {@props.name}
            num_running_projects = {r}
            num_students         = {n}
        />

    render_delete_all_projects: ->
        <Panel header={<h4><Icon name='trash'/> Delete all student projects</h4>}>
            <Button bsStyle='danger' onClick={=>@setState(delete_student_projects_confirm:true)}><Icon name="trash"/> Delete all Student Projects...</Button>
            {@render_confirm_delete_student_projects() if @state.delete_student_projects_confirm}
            <hr/>
            <span style={color:'#666'}>
                If for some reason you would like to delete all the student projects
                created for this course, you may do so by clicking below.
                Be careful!
            </span>
        </Panel>

    ###
    # Upgrading quotas for all student projects
    ###

    save_upgrade_quotas: ->
        num_projects = @_num_projects
        upgrades = {}
        for quota, val of @state.upgrades
            val = misc.parse_number_input(val, round_number=false)
            if val*num_projects != @_your_upgrades[quota]
                display_factor = schema.PROJECT_UPGRADES.params[quota].display_factor
                upgrades[quota] = val / display_factor
        @setState(upgrade_quotas: false)
        if misc.len(upgrades) > 0
            @actions(@props.name).upgrade_all_student_projects(upgrades)

    upgrade_quotas_submittable: ->
        if @_upgrade_is_invalid
            return false
        num_projects = @_num_projects
        for quota, val of @state.upgrades
            val = misc.parse_number_input(val, round_number=false)
            if val*num_projects != (@_your_upgrades[quota] ? 0)
                changed = true
        return changed

    render_upgrade_heading: (num_projects) ->
        <Row key="heading">
            <Col md=5>
                <b style={fontSize:'11pt'}>Quota</b>
            </Col>
            {# <Col md=2><b style={fontSize:'11pt'}>Current upgrades</b></Col> }
            <Col md=7>
                <b style={fontSize:'11pt'}>Distribute your quotas equally between {num_projects} student {misc.plural(num_projects, 'project')} (amounts may be fractional)</b>
            </Col>
        </Row>

    is_upgrade_input_valid: (val, limit) ->
        parsed_val = misc.parse_number_input(val, round_number=false)
        if not parsed_val? or parsed_val > Math.max(0, limit)  # val=0 is always valid
            return false
        else
            return true

    render_upgrade_row_input: (quota, input_type, current, yours, num_projects, limit) ->
        ref = "upgrade_#{quota}"
        if input_type == 'number'
            val = @state.upgrades[quota] ? (yours / num_projects)
            if not @state.upgrades[quota]?
                if val is 0 and yours isnt 0
                    val = yours / num_projects

            if not @is_upgrade_input_valid(val, limit)
                bs_style = 'error'
                @_upgrade_is_invalid = true
                if misc.parse_number_input(val)?
                    label = <div style=UPGRADE_ERROR_STYLE>Reduce the above: you do not have enough upgrades</div>
                else
                    label = <div style=UPGRADE_ERROR_STYLE>Please enter a number</div>
            else
                label = <span></span>
            <FormGroup>
                <FormControl
                    type       = 'text'
                    ref        = {ref}
                    value      = {val}
                    bsStyle    = {bs_style}
                    onChange   = {=>u=@state.upgrades; u[quota] = ReactDOM.findDOMNode(@refs[ref]).value; @setState(upgrades:u)}
                />
                {label}
            </FormGroup>
        else if input_type == 'checkbox'
            val = @state.upgrades[quota] ? (if yours > 0 then 1 else 0)
            is_valid = @is_upgrade_input_valid(val, limit)
            if not is_valid
                @_upgrade_is_invalid = true
                label = <div style=UPGRADE_ERROR_STYLE>Uncheck this: you do not have enough upgrades</div>
            else
                label = if val == 0 then 'Enable' else 'Enabled'
            <form>
                <Checkbox
                    ref      = {ref}
                    checked  = {val > 0}
                    onChange = {(e)=>u=@state.upgrades; u[quota] = (if e.target.checked then 1 else 0); @setState(upgrades:u)}
                    />
                {label}
            </form>
        else
            console.warn('Invalid input type in render_upgrade_row_input: ', input_type)
            return

    render_upgrade_row: (quota, available, current, yours, num_projects) ->
        # quota -- name of the quota
        # available -- How much of this quota the user has available to use on the student projects.
        #              This is the total amount the user purchased minus the amount allocated to other
        #              projects that aren't projects in this course.
        # current   -- Sum of total upgrades currently allocated by anybody to the course projects
        # yours     -- How much of this quota this user has allocated to this quota total.
        # num_projects -- How many student projects there are.
        {display, desc, display_factor, display_unit, input_type} = schema.PROJECT_UPGRADES.params[quota]

        yours   *= display_factor
        current *= display_factor

        x = @state.upgrades[quota]
        input = if x == '' then 0 else misc.parse_number_input(x) ? (yours/num_projects) # currently typed in
        if input_type == 'checkbox'
            input = if input > 0 then 1 else 0

        ##console.log(quota, "remaining = (#{available} - #{input}/#{display_factor}*#{num_projects}) * #{display_factor}")

        remaining = misc.round2( (available - input/display_factor*num_projects) * display_factor )
        limit     = (available / num_projects) * display_factor

        cur = misc.round2(current / num_projects)
        if input_type == 'checkbox'
            if cur > 0 and cur < 1
                cur = "#{misc.round2(cur*100)}%"
            else if cur == 0
                cur = 'none'
            else
                cur = 'all'

        <Row key={quota}>
            <Col md=5>
                <Tip title={display} tip={desc}>
                    <strong>{display}</strong>
                </Tip>
                <span style={marginLeft:'1ex'}>({remaining} {misc.plural(remaining, display_unit)} remaining)</span>
            </Col>
            {# <Col md=2  style={marginTop: '8px'}>{cur}</Col> }
            <Col md=5>
                {@render_upgrade_row_input(quota, input_type, current, yours, num_projects, limit)}
            </Col>
            <Col md=2 style={marginTop: '8px'}>
                &times; {num_projects}
            </Col>
        </Row>

    render_upgrade_rows: (purchased_upgrades, applied_upgrades, num_projects, total_upgrades, your_upgrades) ->
        # purchased_upgrades - how much of each quota this user has purchased
        # applied_upgrades   - how much of each quota user has already applied to projects total
        # num_projects       - number of student projects
        # total_upgrades     - the total amount of each quota that has been applied (by anybody) to these student projects
        # your_upgrades      - total amount of each quota that this user has applied to these student projects
        @_upgrade_is_invalid = false  # will get set to true by render_upgrade_row if invalid.
        for quota, total of purchased_upgrades
            yours     = your_upgrades[quota] ? 0
            available = total - (applied_upgrades[quota] ? 0) + yours
            current   = total_upgrades[quota] ? 0
            @render_upgrade_row(quota, available, current, yours, num_projects)

    render_upgrade_quotas: ->
        redux = @props.redux

        # Get available upgrades that instructor has to apply
        account_store = redux.getStore('account')
        if not account_store?
            return <Loading/>

        purchased_upgrades = account_store.get_total_upgrades()
        if misc.is_zero_map(purchased_upgrades)
            # user has no upgrades on their account
            return <NoUpgrades cancel={=>@setState(upgrade_quotas:false)} />

        course_store = redux.getStore(@props.name)
        if not course_store?
            return <Loading/>

        # Get non-deleted student projects
        project_ids = course_store.get_student_project_ids()
        if not project_ids
            return <Loading/>
        num_projects = project_ids.length
        if not num_projects
            return <span>There are no student projects yet.<br/><br/>{@render_upgrade_submit_buttons()}</span>

        # Get remaining upgrades
        projects_store = redux.getStore('projects')
        if not projects_store?
            return <Loading/>
        applied_upgrades = projects_store.get_total_upgrades_you_have_applied()

        # Sum total amount of each quota that we have applied to all student projects
        total_upgrades = {}  # all upgrades by anybody
        your_upgrades  = {}  # just by you
        account_id = account_store.get_account_id()
        for project_id in project_ids
            your_upgrades  = misc.map_sum(your_upgrades, projects_store.get_upgrades_you_applied_to_project(project_id))
            total_upgrades = misc.map_sum(total_upgrades, projects_store.get_total_project_upgrades(project_id))
        # save for when we do the save
        @_your_upgrades = your_upgrades
        @_num_projects = num_projects

        <Alert bsStyle='warning'>
            <h3><Icon name='arrow-circle-up' /> Adjust your contributions to the student project quotas</h3>
            <hr/>
            {@render_upgrade_heading(num_projects)}
            <hr/>
            {@render_upgrade_rows(purchased_upgrades, applied_upgrades, num_projects, total_upgrades, your_upgrades)}
            {@render_upgrade_submit_buttons()}
            {@render_admin_upgrade() if redux.getStore('account').get('groups')?.contains('admin')}
        </Alert>

    save_admin_upgrade: (e) ->
        e.preventDefault()
        s = ReactDOM.findDOMNode(@refs.admin_input).value
        quotas = JSON.parse(s)
        console.log("admin upgrade '#{s}' -->", quotas)
        @actions(@props.name).admin_upgrade_all_student_projects(quotas)
        return false

    render_admin_upgrade: ->
        <div>
            <br/>
            <hr/>
            <h3>Admin Upgrade</h3>
            Enter an Javascript-parseable object and hit enter (see the Javascript console for feedback):
            <form onSubmit={@save_admin_upgrade}>
                <FormGroup>
                    <FormControl
                        ref         = 'admin_input'
                        type        = 'text'
                        placeholder = {JSON.stringify(require('smc-util/schema').DEFAULT_QUOTAS)}
                    />
                </FormGroup>
            </form>
        </div>

    render_upgrade_submit_buttons: ->
        <ButtonToolbar>
            <Button
                bsStyle  = 'primary'
                onClick  = {@save_upgrade_quotas}
                disabled = {not @upgrade_quotas_submittable()}
            >
                <Icon name='arrow-circle-up' /> Submit changes
            </Button>
            <Button onClick={=>@setState(upgrade_quotas:false)}>
                Cancel
            </Button>
        </ButtonToolbar>

    adjust_quotas: ->
        @setState(upgrade_quotas:true, upgrades:{})

    render_upgrade_quotas_button: ->
        <Button bsStyle='primary' onClick={@adjust_quotas}>
            <Icon name='arrow-circle-up' /> Adjust quotas...
        </Button>

    render_upgrade_student_projects: ->
        <Panel header={<h4><Icon name='dashboard' />  Upgrade all student projects (you pay)</h4>}>
            {if @state.upgrade_quotas then @render_upgrade_quotas() else @render_upgrade_quotas_button()}
            <hr/>
            <div style={color:"#666"}>
                <p>Add additional quota upgrades to all of the projects in this course, augmenting what is provided for free and what students may have purchased. You will need sufficient upgrades to contribute the above amount to each student.</p>

                <p>If you add new students, currently you must re-open the quota panel and re-allocate quota so that newly added projects get additional upgrades; alternatively, you may open any project directly and edit its quotas in project settings.</p>
            </div>
        </Panel>

    ###
    Students pay
    ###
    get_student_pay_when: ->
        if @state.students_pay_when  # since '' is same as not being set
            return @state.students_pay_when
        else
            return misc.days_ago(-7)

    click_student_pay_button: ->
        @setState
            show_students_pay_dialog : true
            students_pay_when        : @get_student_pay_when()

    render_students_pay_button: ->
        <Button bsStyle='primary' onClick={@click_student_pay_button}>
            <Icon name='arrow-circle-up' /> {if @state.students_pay then "Adjust settings" else "Require students to pay"}...
        </Button>

    render_require_students_pay_desc: (date) ->
        if date > salvus_client.server_time()
            <span>
                Your students will see a warning until <TimeAgo date={date} />.  They will then be required to upgrade for a one-time fee of $9.
            </span>
        else
            <span>
                Your students are required to upgrade their project.
            </span>

    render_require_students_pay_when: ->
        if not @state.students_pay_when
            return <span/>
        <div style={marginBottom:'1em'}>
            <div style={width:'50%', marginLeft:'3em', marginBottom:'1ex'}>
                <Calendar
                    value     = {@state.students_pay_when}
                    on_change = {(date)=>@setState(students_pay_when:date)}
                />
            </div>
            {@render_require_students_pay_desc(@state.students_pay_when) if @state.students_pay_when}
        </div>

    save_student_pay_settings: ->
        @actions(@props.name).set_course_info(@state.students_pay_when)
        @setState
            show_students_pay_dialog : false

    student_pay_submittable: ->
        if not @state.students_pay
            return !!@props.settings.get('pay')
        else
            return misc.cmp_Date(@state.students_pay_when, @props.settings.get('pay')) != 0

    render_students_pay_submit_buttons: ->
        <ButtonToolbar>
            <Button
                bsStyle  = 'primary'
                onClick  = {@save_student_pay_settings}
                disabled = {not @student_pay_submittable()}
            >
                <Icon name='arrow-circle-up' /> Submit changes
            </Button>
            <Button onClick={=>@setState(show_students_pay_dialog:false, students_pay_when : @props.settings.get('pay'), students_pay                    : !!@props.settings.get('pay'))}>
                Cancel
            </Button>
        </ButtonToolbar>

    handle_students_pay_checkbox: (e) ->
        if e.target.checked
            @setState
                students_pay      : true
                students_pay_when : @get_student_pay_when()
        else
            @setState
                students_pay      : false
                students_pay_when : ''

    render_students_pay_checkbox_label: ->
        if @state.students_pay
            if salvus_client.server_time() >= @state.students_pay_when
                <span>Require that students upgrade immediately:</span>
            else
                <span>Require that students upgrade by <TimeAgo date={@state.students_pay_when} />: </span>
        else
            <span>Require that students upgrade...</span>

    render_students_pay_checkbox: ->
        <span>
            <Checkbox checked  = {@state.students_pay}
                   key      = 'students_pay'
                   ref      = 'student_pay'
                   onChange = {@handle_students_pay_checkbox}
            >
                {@render_students_pay_checkbox_label()}
            </Checkbox>
        </span>

    render_students_pay_dialog: ->
        <Alert bsStyle='info'>
            <h3><Icon name='arrow-circle-up' /> Require students to upgrade</h3>
            <hr/>
            <span>Click the following checkbox to require that all students in the course pay a <b>one-time $9</b> fee to move their projects to members-only computers and enable full internet access, for four months.  Members-only computers are not randomly rebooted constantly and have far fewer users. Student projects that are already on members-only hosts will not be impacted.  <em>You will not be charged.</em></span>

            {@render_students_pay_checkbox()}
            {@render_require_students_pay_when() if @state.students_pay}
            {@render_students_pay_submit_buttons()}
        </Alert>

    render_student_pay_desc: ->
        if @state.students_pay
            <span><span style={fontSize:'18pt'}><Icon name="check"/></span> <Space />{@render_require_students_pay_desc(@state.students_pay_when)}</span>
        else
            <span>Require that all students in the course pay a one-time $9 fee to move their projects to members only hosts and enable full internet access, for four months.  This is optional, but will ensure that your students have a better experience and receive priority support.</span>


    render_require_students_pay: ->
        <Panel header={<h4><Icon name='dashboard' />  Require students to upgrade (students pay)</h4>}>
            {if @state.show_students_pay_dialog then @render_students_pay_dialog() else @render_students_pay_button()}
            <hr/>
            <div style={color:"#666"}>
                {@render_student_pay_desc()}
            </div>
        </Panel>

    ###
    # Top level render
    ###
    render : ->
        <div>
            <Row>
                <Col md=6>
                    {@render_require_students_pay()}
                    {@render_upgrade_student_projects()}
                    {@render_save_grades()}
                    {@render_start_all_projects()}
                    {@render_delete_all_projects()}
                </Col>
                <Col md=6>
                    {@render_help()}
                    {@render_title_description()}
                    {@render_email_invite_body()}
                </Col>
            </Row>
        </div>

exports.SettingsPanel.Header = rclass
    render: ->
        <Tip delayShow=1300 title="Settings"
             tip="Configure various things about your course here, including the title and description.  You can also export all grades in various formats from this page.">
            <span>
                <Icon name="wrench"/> Settings
            </span>
        </Tip>