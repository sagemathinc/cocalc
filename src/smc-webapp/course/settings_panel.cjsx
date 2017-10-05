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

# standard non-CoCalc libraries
immutable = require('immutable')

# CoCalc libraries
misc = require('smc-util/misc')
{webapp_client} = require('../webapp_client')

# React libraries and Components
{React, rclass, rtypes}  = require('../smc-react')
{Alert, Button, ButtonToolbar, ButtonGroup, Row, Col,
    Panel, Well, FormGroup, FormControl, Checkbox} = require('react-bootstrap')

# CoCalc Components
{Calendar, Icon, LabeledRow, Loading, MarkdownInput,
     Space, TextInput, TimeAgo, Tip} = require('../r_misc')

{StudentProjectUpgrades} = require('./upgrades')
{HelpBox} = require('./help_box')
{DeleteStudentsPanel} = require('./delete_students')

StudentProjectsStartStopPanel = rclass ({name}) ->
    displayName : "CourseEditorSettings-StudentProjectsStartStopPanel"

    reduxProps :
        "#{name}" :
            action_all_projects_state : rtypes.string

    propTypes :
        num_running_projects : rtypes.number
        num_students         : rtypes.number

    getDefaultProps: ->
        action_all_projects_state : "any"

    getInitialState: ->
        confirm_stop_all_projects   : false
        confirm_start_all_projects  : false

    render_in_progress_action: ->
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
            {misc.capitalize(state_name)} all projects... <Icon name='cc-icon-cocalc-ring' spin />
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

    render: ->
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

DisableStudentCollaboratorsPanel = rclass ->
    propTypes:
        checked   : rtypes.bool
        on_change : rtypes.func

    render: ->
        <Panel header={<h4><Icon name='envelope'/> Collaborator policy</h4>}>
            <div style={border:'1px solid lightgrey', padding: '10px', borderRadius: '5px'}>
                <Checkbox
                    checked  = {@props.checked}
                    onChange = {(e)=>@props.on_change(e.target.checked)}>
                    Allow arbitrary collaborators
                </Checkbox>
            </div>
            <hr/>
            <span style={color:'#666'}>
                Every collaborator on the project that contains this course is automatically added
                to every student project (and the shared project).   In addition, each student is
                a collaborator on their project.   If students add additional collaborators, by default
                they will be allowed.  If you uncheck the above box, then collaborators
                will be automatically removed from projects; in particular, students may
                not add arbitrary collaborators to their projects.
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

    getInitialState: ->
        show_students_pay_dialog        : false

    ###
    # Editing title/description
    ###
    render_title_desc_header: ->
        <h4>
            <Icon name='header' />   Title and description
        </h4>

    render_title_description: ->
        if not @props.settings?
            return <Loading />
        <Panel header={@render_title_desc_header()}>
            <LabeledRow label="Title">
                <TextInput
                    text={@props.settings.get('title') ? ''}
                    on_change={(title)=>@actions(@props.name).set_title(title)}
                />
            </LabeledRow>
            <LabeledRow label="Description">
                <MarkdownInput
                    persist_id    = {@props.name + "course-description"}
                    attach_to     = {@props.name}
                    rows          = 6
                    type          = "textarea"
                    default_value = {@props.settings.get('description')}
                    on_save       = {(desc)=>@actions(@props.name).set_description(desc)}
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
    render_grades_header: ->
        <h4>
            <Icon name='table' />  Export grades
        </h4>

    path: (ext) ->
        p = @props.path
        i = p.lastIndexOf('.')
        return p.slice(0,i) + '.' + ext

    open_file: (path) ->
        @actions(project_id : @props.project_id).open_file(path:path,foreground:true)

    write_file: (path, content) ->
        actions = @actions(@props.name)
        id = actions.set_activity(desc:"Writing #{path}")
        webapp_client.write_text_file_to_project
            project_id : @props.project_id
            path       : path
            content    : content
            cb         : (err) =>
                actions.set_activity(id:id)
                if not err
                    @open_file(path)
                else
                    actions.set_error("Error writing '#{path}' -- '#{err}'")

    save_grades_to_csv: ->
        store = @props.redux.getStore(@props.name)
        assignments = store.get_sorted_assignments()
        students = store.get_sorted_students()
        # CSV definition: http://edoceo.com/utilitas/csv-file-format
        # i.e. double quotes everywhere (not single!) and double quote in double quotes usually blows up
        timestamp  = (webapp_client.server_time()).toISOString()
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

    save_grades_to_py: ->
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
        timestamp = (webapp_client.server_time()).toISOString()
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

    render_save_grades: ->
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
    # Custom invitation email body
    ###

    render_email_invite_body: ->
        template_instr = ' Also, {title} will be replaced by the title of the course and {name} by your name.'
        <Panel header={<h4><Icon name='envelope'/> Customize email invitation</h4>}>
            <div style={border:'1px solid lightgrey', padding: '10px', borderRadius: '5px'}>
                <MarkdownInput
                    persist_id    = {@props.name + "email-invite-body"}
                    attach_to     = {@props.name}
                    rows          = 6
                    type          = "textarea"
                    default_value = {@props.redux.getStore(@props.name).get_email_invite()}
                    on_save       = {(body)=>@actions(@props.name).set_email_invite(body)}
                />
            </div>
            <hr/>
            <span style={color:'#666'}>
                If you add a student to this course using their email address, and they do not
                have a CoCalc account, then they will receive an email invitation. {template_instr}
            </span>
        </Panel>

    render_start_all_projects: ->
        r = @props.redux.getStore(@props.name).num_running_projects(@props.project_map)
        n = @props.redux.getStore(@props.name).num_students()
        <StudentProjectsStartStopPanel
            name                 = {@props.name}
            num_running_projects = {r}
            num_students         = {n}
        />

    ###
    Students pay
    ###
    get_student_pay_when: ->
        date = @props.settings.get('pay')
        if date
            return date
        else
            return misc.days_ago(-7)

    click_student_pay_button: ->
        @setState(show_students_pay_dialog : true)

    render_students_pay_button: ->
        <Button bsStyle='primary' onClick={@click_student_pay_button}>
            <Icon name='arrow-circle-up' /> {if @state.students_pay then "Adjust settings" else "Require students to pay"}...
        </Button>

    render_require_students_pay_desc: ->
        date = @props.settings.get('pay')
        if date > webapp_client.server_time()
            <span>
                Your students will see a warning until <TimeAgo date={date} />.  They will then be required to upgrade for a one-time fee of $9.
            </span>
        else
            <span>
                Your students are required to upgrade their project.
            </span>

    render_require_students_pay_when: ->
        if not @props.settings.get('pay')
            return <span/>
        else if typeof @props.settings.get('pay') == 'string'
            value = new Date(@props.settings.get('pay'))

        <div style={marginBottom:'1em'}>
            <div style={width:'50%', marginLeft:'3em', marginBottom:'1ex'}>
                <Calendar
                    value     = {value ? @props.settings.get('pay')}
                    on_change = {(date)=>@actions(@props.name).set_course_info(date)}
                />
            </div>
            {@render_require_students_pay_desc() if @props.settings.get('pay')}
        </div>

    render_students_pay_submit_buttons: ->
        <Button onClick={=>@setState(show_students_pay_dialog:false)}>
            Close
        </Button>

    handle_students_pay_checkbox: (e) ->
        if e.target.checked
            @actions(@props.name).set_course_info(@get_student_pay_when())
        else
            @actions(@props.name).set_course_info('')

    render_students_pay_checkbox_label: ->
        if @props.settings.get('pay')
            if webapp_client.server_time() >= @props.settings.get('pay')
                <span>Require that students upgrade immediately:</span>
            else
                <span>Require that students upgrade by <TimeAgo date={@props.settings.get('pay')} />: </span>
        else
            <span>Require that students upgrade...</span>

    render_students_pay_checkbox: ->
        <span>
            <Checkbox checked  = {!!@props.settings.get('pay')}
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
            {@render_require_students_pay_when() if @props.settings.get('pay')}
            {@render_students_pay_submit_buttons()}
        </Alert>

    render_student_pay_desc: ->
        if @props.settings.get('pay')
            <span><span style={fontSize:'18pt'}><Icon name="check"/></span> <Space />{@render_require_students_pay_desc()}</span>
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

    render: ->
        <div>
            <Row>
                <Col md=6>
                    {@render_require_students_pay()}
                    <StudentProjectUpgrades name={@props.name} redux={@props.redux} upgrade_goal={@props.settings?.get('upgrade_goal')} />
                    {@render_save_grades()}
                    {@render_start_all_projects()}
                    <DeleteStudentsPanel
                        delete = {@actions(@props.name).delete_all_student_projects}
                        />
                </Col>
                <Col md=6>
                    <HelpBox/>
                    {@render_title_description()}
                    {@render_email_invite_body()}
                    <DisableStudentCollaboratorsPanel
                        checked   = {!!@props.settings.get('allow_collabs')}
                        on_change = {@actions(@props.name).set_allow_collabs}
                        />
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