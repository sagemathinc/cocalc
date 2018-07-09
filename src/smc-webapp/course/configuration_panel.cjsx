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
misc            = require('smc-util/misc')
{webapp_client} = require('../webapp_client')
{COLORS}        = require('smc-util/theme')

# React libraries and Components
{React, rclass, rtypes}  = require('../app-framework')
{Alert, Button, ButtonToolbar, ButtonGroup, Row, Col,
    Panel, Well, FormGroup, FormControl, Checkbox} = require('react-bootstrap')

# CoCalc Components
{Calendar, HiddenXS, Icon, LabeledRow, Loading, MarkdownInput,
     Space, TextInput, TimeAgo, Tip} = require('../r_misc')

{StudentProjectUpgrades} = require('./upgrades')
{HelpBox} = require('./help_box')
{DeleteStudentsPanel} = require('./delete_students')
{DeleteSharedProjectPanel} = require('./delete_shared_project')

STUDENT_COURSE_PRICE = require('smc-util/upgrade-spec').upgrades.subscription.student_course.price.month4

StudentProjectsStartStopPanel = rclass ({name}) ->
    displayName : "CourseEditorConfiguration-StudentProjectsStartStopPanel"

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

        <Alert bsStyle={bsStyle}>
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
                <Col md={9}>
                    {r} of {n} student projects currently running.
                </Col>
            </Row>
            <Row style={marginTop:'10px'}>
                <Col md={12}>
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
                <Col md={12}>
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
    displayName : 'DisableStudentCollaboratorsPanel'

    propTypes:
        checked   : rtypes.bool
        on_change : rtypes.func

    shouldComponentUpdate: (props) ->
        return @props.checked != props.checked

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

exports.ConfigurationPanel = rclass
    displayName : "CourseEditorConfiguration"

    propTypes :
        redux             : rtypes.object.isRequired
        name              : rtypes.string.isRequired
        path              : rtypes.string.isRequired
        project_id        : rtypes.string.isRequired
        settings          : rtypes.immutable.Map.isRequired
        project_map       : rtypes.immutable.Map.isRequired
        shared_project_id : rtypes.string

    shouldComponentUpdate: (props, state) ->
        return state.show_students_pay_dialog != @state.show_students_pay_dialog or \
               misc.is_different(@props, props, ['settings', 'project_map', 'shared_project_id'])

    getInitialState: ->
        show_students_pay_dialog : false

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
                    rows          = {6}
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
            <Icon name='table' />  Export data
        </h4>

    path: (ext, prefix='export_') ->
        # make path more likely to be python-readable...
        p = misc.replace_all(@props.path, '-', '_')
        p = misc.split(p).join('_')
        i = p.lastIndexOf('.')
        return prefix + p.slice(0,i) + '.' + ext

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

    # deprecated version 1
    save_to_csv_v1: ->
        store = @props.redux.getStore(@props.name)
        assignments = store.get_sorted_assignments()
        students = store.get_sorted_students()
        # CSV definition: http://edoceo.com/utilitas/csv-file-format
        # i.e. double quotes everywhere (not single!) and double quote in double quotes usually blows up
        timestamp  = (webapp_client.server_time()).toISOString()
        content = "# Course '#{@props.settings.get('title')}'\n"
        content += "# exported #{timestamp}\n"
        content += "Name,Id,Email,"
        content += ("\"grade: #{assignment.get('path')}\"" for assignment in assignments).join(',') + ','
        content += ("\"comments: #{assignment.get('path')}\"" for assignment in assignments).join(',') + '\n'
        for student in store.get_sorted_students()
            grades   = ("\"#{store.get_grade(assignment, student) ? ''}\"" for assignment in assignments).join(',')
            grades   = grades.replace(/\n/g, "\\n")
            comments = ("\"#{store.get_comments(assignment, student) ? ''}\"" for assignment in assignments).join(',')
            comments = comments.replace(/\n/g, "\\n")
            name     = "\"#{store.get_student_name(student)}\""
            email    = "\"#{store.get_student_email(student) ? ''}\""
            id       = "\"#{student.get('student_id')}\""
            line     = [name, id, email, grades, comments].join(',')
            content += line + '\n'
        @write_file(@path('csv'), content)

    save_to_csv_v2: ->
        store = @props.redux.getStore(@props.name)
        assignments = store.get_sorted_assignments()
        students = store.get_sorted_students()
        # CSV definition: http://edoceo.com/utilitas/csv-file-format
        # i.e. double quotes everywhere (not single!) and double quote in double quotes usually blows up
        timestamp  = (webapp_client.server_time()).toISOString()
        content = "# Course '#{@props.settings.get('title')}'\n"
        content += "# exported #{timestamp}\n"
        content += 'Name,ID,Email,Assignment,Grade,File,Points\n'

        for assignment in assignments
            apth = assignment.get('path')
            for student in students
                name     = store.get_student_name(student)
                email    = store.get_student_email(student) ? ''
                id       = student.get('student_id')
                grade    = store.get_grade(assignment, student) ? ''
                continue if grade.length == 0
                points   = assignment.getIn(['points', id])
                if points? and misc.keys(points).length > 0
                    points.forEach (points, filepath) ->
                        line = [name, id, email, apth, grade, filepath]
                        # points is a number, hence without quotes!
                        content += ("\"#{x}\"" for x in line).join(',') + ",#{points}\n"
                else
                    line = [name, id, email, apth, grade]
                    content += ("\"#{x}\"" for x in line).join(',') + ",,\n"

        @write_file(@path('csv', 'export_points_'), content)

    save_py_header: ->
        timestamp = (webapp_client.server_time()).toISOString()
        content = "course = '#{@props.settings.get('title')}'\n"
        content += 'from datetime import datetime\n'
        content += "exported = datetime.strptime('#{timestamp}', '%Y-%m-%dT%H:%M:%S.%fZ')\n"
        return content

    # deprecated version 1
    save_to_py_v1: ->
        ###
        example:
        course = 'title'
        exported = 'iso date'
        assignments = ['Assignment 1', 'Assignment 2']
        students=[
            {'name':'Foo Bar', 'email': 'foo@bar.com', 'grades':[85,37], 'comments':['Good job', 'Not as good as assignment one :(']},
            {'name':'Bar None', 'email': 'bar@school.edu', 'grades':[15,50], 'comments':['some_comments','Better!']},
        ]
        ###
        store = @props.redux.getStore(@props.name)
        assignments = store.get_sorted_assignments()
        students = store.get_sorted_students()
        content = @save_py_header()
        content += "assignments = ["
        content += ("'#{assignment.get('path')}'" for assignment in assignments).join(',') + ']\n'

        content += 'students = [\n'

        for student in store.get_sorted_students()
            grades   = (("'#{store.get_grade(assignment, student) ? ''}'") for assignment in assignments).join(',')
            grades   = grades.replace(/\n/g, "\\n")
            comments = (("'#{store.get_comments(assignment, student) ? ''}'") for assignment in assignments).join(',')
            comments = comments.replace(/\n/g, "\\n")
            name     = store.get_student_name(student)
            email    = store.get_student_email(student)
            email    = if email? then "'#{email}'" else 'None'
            id       = student.get('student_id')
            line     = "    {'name':'#{name}', 'id':'#{id}', 'email':#{email}, 'grades':[#{grades}], 'comments':[#{comments}]},"
            content += line + '\n'
        content += ']\n'
        @write_file(@path('py'), content)

    save_to_json_v2: ->
        store = @props.redux.getStore(@props.name)
        data = store.get_export_course_data()
        data.title = @props.settings.get('title')
        data.timestamp = (webapp_client.server_time()).toISOString()
        content = "#{JSON.stringify(data, null, 2)}\n"
        @write_file(@path('json', 'export_points_'), content)

    render_save_grades: ->
        <Panel header={@render_grades_header()}>
            <Row>
                <Col md={12}>
                    <div style={marginBottom:'10px'}>Save grades and points to... </div>
                    <ButtonToolbar>
                        <Button onClick={@save_to_csv_v2}><Icon name='file-text-o'/> CSV file</Button>
                        <Button onClick={@save_to_json_v2}><Icon name='file-code-o'/> JSON file</Button>
                    </ButtonToolbar>
                </Col>
            </Row>
            <hr/>
            <span style={color:COLORS.GRAY}>
                Export all the grades and points you have recorded
                for students in your course to a CSV or JSON file.
                More information: <a href={'https://github.com/sagemathinc/cocalc/wiki/CourseExportFiles'} target={'_blank'}>file format documentation</a>.
                <br/>
                Get the previous version 1 formats:{' '}
                <a style={cursor:'pointer'} onClick={@save_to_csv_v1}>CSV file</a> and{' '}
                <a style={cursor:'pointer'} onClick={@save_to_py_v1}>Python file</a>.
                <br/>
                In Microsoft Excel, you can {' '}
                <a target="_blank" href="https://support.office.com/en-us/article/Import-or-export-text-txt-or-csv-files-5250ac4c-663c-47ce-937b-339e391393ba">
                import the CSV file</a>.
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
                    rows          = {6}
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
            <Icon name='arrow-circle-up' /> {if @state.students_pay then "Adjust settings" else "Configure how students will pay"}...
        </Button>

    render_student_pay_choice_checkbox: ->
        <span>
            <Checkbox
                checked  = {!!@props.settings?.get('student_pay')}
                onChange = {@handle_student_pay_choice}
            >
                Students will pay for this course
            </Checkbox>
        </span>

    handle_student_pay_choice: (e) ->
        @actions(@props.name).set_pay_choice('student', e.target.checked)

    render_require_students_pay_desc: ->
        date = new Date(@props.settings.get('pay'))
        if date > webapp_client.server_time()
            <span>
                <b>Your students will see a warning until <TimeAgo date={date} />.</b>  They will then be required to upgrade for a special discounted one-time fee of ${STUDENT_COURSE_PRICE}.
            </span>
        else
            <span>
                <b>Your students are required to upgrade their project now to use it.</b>  If you want to give them more time to upgrade, move the date forward.
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
            <Checkbox
                checked  = {!!@props.settings.get('pay')}
                onChange = {@handle_students_pay_checkbox}
            >
                {@render_students_pay_checkbox_label()}
            </Checkbox>
        </span>

    render_students_pay_dialog: ->
        <Alert bsStyle='warning'>
            <h3><Icon name='arrow-circle-up' /> Require students to upgrade</h3>
            <hr/>
            <span>Click the following checkbox to require that all students in the course pay a special discounted <b>one-time ${STUDENT_COURSE_PRICE}</b> fee to move their projects from trial servers to members-only computers, enable full internet access, and do not see a large red warning message.  This lasts four months, and <em>you will not be charged (only students are charged).</em></span>

            {@render_students_pay_checkbox()}
            {@render_require_students_pay_when() if @props.settings.get('pay')}
            {@render_students_pay_submit_buttons()}
        </Alert>

    render_student_pay_desc: ->
        if @props.settings.get('pay')
            <span><span style={fontSize:'18pt'}><Icon name="check"/></span> <Space />{@render_require_students_pay_desc()}</span>
        else
            <span>Require that all students in the course pay a one-time ${STUDENT_COURSE_PRICE} fee to move their projects off trial servers and enable full internet access, for four months.  This is strongly recommended, and ensures that your students have a better experience, and do not see a large <span style={color:'red'}>RED warning banner</span> all the time.   Alternatively, you (or your university) can pay for all students at one for a significant discount -- see below.</span>

    render_student_pay_details: ->
        <div>
            {if @state.show_students_pay_dialog then @render_students_pay_dialog() else @render_students_pay_button()}
            <hr/>
            <div style={color:"#666"}>
                {@render_student_pay_desc()}
            </div>
        </div>

    render_require_students_pay: ->
        if @props.settings?.get('student_pay') or @props.settings?.get('institute_pay')
            style = bg = undefined
        else
            style = {fontWeight:'bold'}
            bg    = '#fcf8e3'
        <Panel
            style  = {background:bg}
            header = {<h4 style={style}><Icon name='dashboard' />  Require students to upgrade (students pay)</h4>}>
            {@render_student_pay_choice_checkbox()}
            {@render_student_pay_details() if @props.settings?.get('student_pay')}
        </Panel>

    render_require_institute_pay: ->
        <StudentProjectUpgrades
            name          = {@props.name}
            redux         = {@props.redux}
            upgrade_goal  = {@props.settings?.get('upgrade_goal')}
            institute_pay = {@props.settings?.get('institute_pay')}
            student_pay   = {@props.settings?.get('student_pay')}
        />

    render_delete_shared_project: ->
        if @props.shared_project_id
            <DeleteSharedProjectPanel
                delete = {@actions(@props.name).delete_shared_project}
                />

    render_delete_students: ->
        <DeleteStudentsPanel
            delete = {@actions(@props.name).delete_all_student_projects}
            />

    render_disable_students: ->
        <DisableStudentCollaboratorsPanel
            checked   = {!!@props.settings.get('allow_collabs')}
            on_change = {@actions(@props.name).set_allow_collabs}
            />

    render: ->
        <div>
            <Row>
                <Col md={6}>
                    {@render_require_students_pay()}
                    {@render_require_institute_pay()}
                    {@render_save_grades()}
                    {@render_start_all_projects()}
                    {@render_delete_students()}
                    {@render_delete_shared_project()}
                </Col>
                <Col md={6}>
                    <HelpBox/>
                    {@render_title_description()}
                    {@render_email_invite_body()}
                    {@render_disable_students()}
                </Col>
            </Row>
        </div>

exports.ConfigurationPanel.Header = rclass
    render: ->
        <Tip delayShow={1300} title="Configuration"
             tip="Configure various things about your course here, including the title and description.  You can also export all grades in various formats from this page.">
            <span>
                <Icon name='cogs'/> <HiddenXS>Configuration</HiddenXS>
            </span>
        </Tip>