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

###
Course Management
###

# standard non-CoCalc libraries
immutable = require('immutable')

# CoCalc libraries
misc = require('smc-util/misc')

# React libraries
{React, rclass, rtypes}  = require('../smc-react')

{Button, ButtonToolbar, ButtonGroup, Row, Col, Panel, Tabs, Tab} = require('react-bootstrap')

{ActivityDisplay, ErrorDisplay, Icon, Loading, SaveButton, VisibleMDLG} = require('../r_misc')

# Course components
{CourseStore}        = require('./store')
{CourseActions}      = require('./actions')
CourseSync           = require('./sync')
{StudentsPanel}      = require('./students_panel')
{AssignmentsPanel}   = require('./assignments_panel')
{HandoutsPanel}      = require('./handouts_panel')
{ConfigurationPanel} = require('./configuration_panel')
{PayBanner}          = require('./pay-banner')
{SharedProjectPanel} = require('./shared_project_panel')
{STEPS, previous_step, step_direction, step_verb, step_ready} = require('./util')

redux_name = (project_id, course_filename) ->
    return "editor-#{project_id}-#{course_filename}"

syncdbs = {}
init_redux = (course_filename, redux, course_project_id) ->
    the_redux_name = redux_name(course_project_id, course_filename)
    get_actions = -> redux.getActions(the_redux_name)
    if get_actions()?
        # already initalized
        return

    initial_store_state =
        course_filename        : course_filename
        course_project_id      : course_project_id
        expanded_students      : immutable.Set() # Set of student id's (string) which should be expanded on render
        expanded_assignments   : immutable.Set() # Set of assignment id's (string) which should be expanded on render
        expanded_handouts      : immutable.Set() # Set of handout id's (string) which should be expanded on render
        expanded_peer_configs  : immutable.Set() # Set of assignment configs (key = assignment_id) which should be expanded on render
        active_student_sort    : {column_name : "last_name", is_descending : false}
        active_assignment_sort : {column_name : "due_date", is_descending : false}
        settings               : {allow_collabs : true}

    store = redux.createStore(the_redux_name, CourseStore, initial_store_state)
    actions = redux.createActions(the_redux_name, CourseActions)
    actions.syncdb = syncdbs[the_redux_name] = CourseSync.create_sync_db(redux, actions, store)

    return the_redux_name

remove_redux = (course_filename, redux, course_project_id) ->
    the_redux_name = redux_name(course_project_id, course_filename)

    # Remove the listener for changes in the collaborators on this project.
    actions = redux.getActions(the_redux_name)
    if not actions?
        # already cleaned up and removed.
        return
    redux.getStore('projects').removeListener('change', actions.handle_projects_store_update)

    # Remove the store and actions.
    redux.removeStore(the_redux_name)
    redux.removeActions(the_redux_name)
    syncdbs[the_redux_name]?.close()
    delete syncdbs[the_redux_name]
    return the_redux_name

COURSE_EDITOR_STYLE =
    height    : '100%'
    overflowY : 'scroll'
    padding   : '7px'

CourseEditor = rclass ({name}) ->
    displayName : "CourseEditor-Main"

    reduxProps :
        "#{name}" :
            error       : rtypes.string
            tab         : rtypes.string
            activity    : rtypes.immutable.Map    # status messages about current activity happening (e.g., things being assigned)
            students    : rtypes.immutable.Map
            assignments : rtypes.immutable.Map
            handouts    : rtypes.immutable.Map
            settings    : rtypes.immutable.Map
            unsaved     : rtypes.bool
        users :
            user_map    : rtypes.immutable
        projects :
            project_map : rtypes.immutable  # gets updated when student is active on their project

    propTypes :
        redux       : rtypes.object
        name        : rtypes.string.isRequired
        project_id  : rtypes.string.isRequired
        path        : rtypes.string.isRequired

    shouldComponentUpdate: (props) ->
        return misc.is_different(@props, props, ['error', 'tab', 'activity', 'students', 'assignments', 'handouts', 'settings', 'unsaved', 'user_map', 'project_map'])

    render_activity: ->
        <ActivityDisplay
            activity = {misc.values(@props.activity?.toJS())}
            trunc    = {80}
            on_clear = {=>@actions(@props.name).clear_activity()}
        />

    render_error: ->
        <ErrorDisplay error={@props.error}
                      onClose={=>@actions(@props.name).set_error('')} />

    render_pay_banner: ->
        <PayBanner
            settings     = {@props.settings}
            num_students = {@props.students?.size}
            tab          = {@props.tab}
            name         = {@props.name}
            />

    render_save_button: ->
        <SaveButton saving={@props.saving} unsaved={true} on_click={=>@props.redux.getActions(@props.name).save()}/>

    show_files: ->
        @props.redux?.getProjectActions(@props.project_id).set_active_tab('files')

    render_files_button: ->
        <Button className='smc-small-only' style={float:'right', marginLeft:'15px'}
                onClick={@show_files}><Icon name='toggle-up'/> Files</Button>

    show_timetravel: ->
        @props.redux?.getProjectActions(@props.project_id).open_file
            path               : misc.history_path(@props.path)
            foreground         : true
            foreground_project : true

    save_to_disk: ->
        @props.redux?.getActions(@props.name).save()

    render_save_timetravel: ->
        <div style={float:'right', marginRight:'15px'}>
            <ButtonGroup>
                <Button onClick={@save_to_disk}    bsStyle='success' disabled={not @props.unsaved}>
                    <Icon name='save'/> <VisibleMDLG>Save</VisibleMDLG>
                </Button>
                <Button onClick={@show_timetravel} bsStyle='info'>
                    <Icon name='history'/> <VisibleMDLG>TimeTravel</VisibleMDLG>
                </Button>
            </ButtonGroup>
        </div>

    num_students: ->
        @props.redux.getStore(@props.name)?.num_students()

    num_assignments: ->
        @props.redux.getStore(@props.name)?.num_assignments()

    num_handouts: ->
        @props.redux.getStore(@props.name)?.num_handouts()

    render_students: ->
        if @props.redux? and @props.students? and @props.user_map? and @props.project_map?
            <StudentsPanel redux={@props.redux} students={@props.students}
                      name={@props.name} project_id={@props.project_id}
                      user_map={@props.user_map} project_map={@props.project_map}
                      assignments={@props.assignments}
                      />
        else
            return <Loading />

    render_assignments: ->
        if @props.redux? and @props.assignments? and @props.user_map? and @props.students?
            <AssignmentsPanel actions={@props.redux.getActions(@props.name)} redux={@props.redux} all_assignments={@props.assignments}
                name={@props.name} project_id={@props.project_id} user_map={@props.user_map} students={@props.students} />
        else
            return <Loading />

    render_handouts: ->
        if @props.redux? and @props.assignments? and @props.user_map? and @props.students?
            <HandoutsPanel actions={@props.redux.getActions(@props.name)} all_handouts={@props.handouts}
                project_id={@props.project_id} user_map={@props.user_map} students={@props.students}
                store_object={@props.redux.getStore(@props.name)} project_actions={@props.redux.getProjectActions(@props.project_id)}
                name={@props.name}
                />
        else
            return <Loading />

    render_configuration: ->
        if @props.redux? and @props.settings?
            <ConfigurationPanel
                redux             = {@props.redux}
                settings          = {@props.settings}
                name              = {@props.name}
                project_id        = {@props.project_id}
                path              = {@props.path}
                shared_project_id = {@props.settings?.get('shared_project_id')}
                project_map       = {@props.project_map}
            />
        else
            return <Loading />

    render_shared_project: ->
        if @props.redux? and @props.settings?
            <SharedProjectPanel
                redux             = {@props.redux}
                name              = {@props.name}
                shared_project_id = {@props.settings?.get('shared_project_id')}
            />
        else
            return <Loading />

    render_tabs: ->
        <Tabs
            id        = {'course-tabs'}
            animation = {false}
            activeKey = {@props.tab}
            onSelect  = {(key)=>@actions(@props.name).set_tab(key)}
        >
            <Tab eventKey={'students'} title={<StudentsPanel.Header n={@num_students()} />}>
                {@render_students()}
            </Tab>
            <Tab eventKey={'assignments'} title={<AssignmentsPanel.Header n={@num_assignments()}/>}>
                {@render_assignments()}
            </Tab>
            <Tab eventKey={'handouts'} title={<HandoutsPanel.Header n={@num_handouts()}/>}>
                {@render_handouts()}
            </Tab>
            <Tab eventKey={'configuration'} title={<ConfigurationPanel.Header />}>
                <div style={marginTop:'1em'}></div>
                {@render_configuration()}
            </Tab>
            <Tab eventKey={'shared_project'} title={<SharedProjectPanel.Header project_exists={!!@props.settings?.get('shared_project_id')}/>}>
                <div style={marginTop:'1em'}></div>
                {@render_shared_project()}
            </Tab>
        </Tabs>

    render: ->
        <div style={COURSE_EDITOR_STYLE}>
            {@render_pay_banner()}
            {@render_save_button() if @props.show_save_button}
            {@render_error() if @props.error}
            {@render_activity() if @props.activity?}
            {@render_files_button()}
            {@render_save_timetravel()}
            {@render_tabs()}
        </div>

require('project_file').register_file_editor
    ext       : 'course'
    icon      : 'graduation-cap'
    init      : init_redux
    component : CourseEditor
    remove    : remove_redux
