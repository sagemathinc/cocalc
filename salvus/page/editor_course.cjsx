###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2015, William Stein
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

# Course Management

###
TODO:

- [x] (0:30?) (0:09) create function to render course in a DOM element with basic rendering; hook into editor.coffee
- [x] (0:30?) (0:36) create proper 4-tab pages using http://react-bootstrap.github.io/components.html#tabs
- [x] (0:45?) (1:35) create dynamically created store attached to a project_id and course filename, which updates on sync of file.
- [ ] (0:30?) (0:15+) fill in very rough content components (just panels/names)

- [ ] (1:00?) add student
- [ ] (1:00?) render student row
- [ ] (0:45?) search students
- [ ] (0:45?) create student projects
- [ ] (0:45?) show deleted students (and purge)
- [ ] (1:00?) add assignment
- [ ] (1:00?) render assignment row
- [ ] (0:30?) search assignments
- [ ] (1:30?) assign all... (etc.) button/menu
- [ ] (1:30?) collect all... (etc.) button/menu
- [ ] (1:00?) return graded button
- [ ] (1:00?) show deleted assignments (and purge)
- [ ] (0:45?) settings: title & description
- [ ] (1:00?) help page
- [ ] (1:00?) clean up after flux/react when closing the editor
- [ ] (1:00?) make it all look pretty

###

immutable = require('immutable')

misc = require('misc')

{React, rclass, rtypes, FluxComponent, Actions, Store}  = require('flux')
{Button, ButtonToolbar, Input, Row, Col, Panel, TabbedArea, TabPane, Well} = require('react-bootstrap')
{ErrorDisplay, Icon, LabeledRow, Loading, SelectorInput, TextInput} = require('r_misc')

{synchronized_db} = require('syncdb')

flux_name = (project_id, path) ->
    return "editor-#{project_id}-#{path}"

primary_key =
    students    : 'student_id'
    assignments : 'assignment_id'

init_flux = (flux, project_id, path) ->
    name = flux_name(project_id, path)
    syncdb = undefined

    project = require('project').project_page(project_id:project_id)
    class CourseActions extends Actions
        _set_to: (payload) =>
            payload

        project: => return project

        set_error: (error) =>
            @_set_to(error:error)

        _loaded: =>
            if not syncdb?
                @set_error("attempt to set syncdb before loading")
                return false
            return true

        _update: (opts) =>
            if not @_loaded() then return
            syncdb.update(opts)
            syncdb.save()

        set_title: (title) =>
            @_update(set:{title:title}, where:{table:'settings'})

        set_description: (description) =>
            @_update(set:{description:description}, where:{table:'settings'})

        syncdb_change: (changes) =>
            t = misc.copy(store.state)
            remove = (x.remove for x in changes when x.remove?)
            insert = (x.insert for x in changes when x.insert?)
            # first remove, then insert (or we could loose things!)
            for x in remove
                if x.table != 'settings'
                    y = misc.copy_without(x, ['table', 'student_id', 'assignment_id'])
                    t[x.table] = t[x.table].remove(x[primary_key[x.table]])
            for x in insert
                if x.table == 'settings'
                    for k, v of misc.copy_without(x, 'table')
                        t.settings = t.settings.set(k, v)
                else
                    y = misc.copy_without(x, ['table', 'student_id', 'assignment_id'])
                    t[x.table] = t[x.table].set(x[primary_key[x.table]], y)
            for k, v of t
                if not v.equals(store.state[k])
                    @_set_to("#{k}":v)

    actions = flux.createActions(name, CourseActions)

    class CourseStore extends Store
        constructor: (flux) ->
            super()
            ActionIds = flux.getActionIds(name)
            @register(ActionIds._set_to, @_set_to)
            @state = {}

        _set_to: (payload) => @setState(payload)

    store = flux.createStore(name, CourseStore, flux)

    synchronized_db
        project_id : project_id
        filename   : path
        cb         : (err, _db) ->
            window.db = _db # TODO: for debugging
            if err
                actions.set_error("unable to open #{@filename}")
            else
                syncdb = _db
                t = {settings:{title:'', description:''}, assignments:{}, students:{}}
                for x in syncdb.select()
                    if x.table == 'settings'
                        misc.merge(t.settings, misc.copy_without(x, 'table'))
                    else if x.table == 'students'
                        t.students[x.account_id] = misc.copy_without(x, ['account_id', 'table'])
                    else if x.table == 'assignments'
                        t.assignments[x.assignment_id] = misc.copy_without(x, ['assignment_id', 'table'])
                for k, v of t
                    t[k] = immutable.fromJS(v)
                actions._set_to(t)
                syncdb.on('change', actions.syncdb_change)

Student = rclass
    propTypes:
        student : rtypes.object.isRequired

    displayName : "CourseEditorStudent"

    render: ->
        <div>
            {@props.student.get('first_name')} {@props.student.get('last_name')}
            {misc.to_json(@props.student.toJS())}
        </div>

Students = rclass
    propTypes:
        name        : rtypes.string.isRequired
        flux        : rtypes.object
        students    : rtypes.object

    displayName : "CourseEditorStudents"

    getInitialState: ->
        student_search : ''
        student_add    : ''

    clear_and_focus_student_search_input: ->
        @setState(student_search : '')
        @refs.student_search_input.getInputDOMNode().focus()

    clear_search_button : ->
        <Button onClick={@clear_and_focus_student_search_input}>
            <Icon name="times-circle" />
        </Button>

    student_add_button : ->
        <Button>
            <Icon name="search" />
        </Button>

    render_header: ->
        <Row>
            <Col md=5>
                <Input
                    ref         = 'student_search_input'
                    type        = 'text'
                    placeholder = "Find students..."
                    value       = {@state.student_search}
                    buttonAfter = {@clear_search_button()}
                    onChange    = {=>@setState(student_search:@refs.student_search_input.getValue())}
                />
            </Col>
            <Col md=5 mdOffset=2>
                <Input
                    ref         = 'student_add_input'
                    type        = 'text'
                    placeholder = "Add student by name or email address..."
                    value       = {@state.student_add}
                    buttonAfter = {@student_add_button()}
                    onChange    = {=>@setState(student_add:@refs.student_add_input.getValue())}
                />
            </Col>
        </Row>

    render_students: ->
        if not @props.students?
            return
        # TODO: cache the sorting
        v = immutable_to_list(@props.students, 'student_id')
        v.sort (a,b) ->
            return misc.cmp_array([a.last_name, a.first_name, a.email_address],
                                  [b.last_name, b.first_name, b.email_address])
        for x in v
            <Student key={x.student_id} student={@props.students.get(x.student_id)} />

    render :->
        <Panel header={@render_header()}>
            {@render_students()}
        </Panel>

Assignment = rclass
    propTypes:
        assignment : rtypes.object.isRequired

    displayName : "CourseEditorAssignment"

    render: ->
        <div>
            an assignment
            {misc.to_json(@props.assignment.toJS())}
        </div>

Assignments = rclass
    displayName : "CourseEditorAssignments"

    getInitialState: ->
        assignment_search : ''
        assignment_add    : ''

    clear_and_focus_assignment_search_input: ->
        @setState(assignment_search : '')
        @refs.assignment_search_input.getInputDOMNode().focus()

    clear_search_button : ->
        <Button onClick={@clear_and_focus_assignment_search_input}>
            <Icon name="times-circle" />
        </Button>

    assignment_add_button : ->
        <Button>
            <Icon name="search" />
        </Button>

    render_header: ->
        <Row>
            <Col md=5>
                <Input
                    ref         = 'assignment_search_input'
                    type        = 'text'
                    placeholder = "Find assignments..."
                    value       = {@state.assignment_search}
                    buttonAfter = {@clear_search_button()}
                    onChange    = {=>@setState(assignment_search:@refs.assignment_search_input.getValue())}
                />
            </Col>
            <Col md=5 mdOffset=2>
                <Input
                    ref         = 'assignment_add_input'
                    type        = 'text'
                    placeholder = "Add assignment by folder name..."
                    value       = {@state.assignment_add}
                    buttonAfter = {@assignment_add_button()}
                    onChange    = {=>@setState(assignment_add:@refs.assignment_add_input.getValue())}
                />
            </Col>
        </Row>

    render_assignments: ->
        if not @props.assignments?
            return
        # TODO: cache the sorting
        v = immutable_to_list(@props.assignments, 'assignment_id')
        v.sort (a,b) ->
            return misc.cmp_array([], []) # TODO
        for x in v
            <Assignment key={x.assignment_id} assignment={@props.assignments.get(x.assignment_id)} />

    render :->
        <Panel header={@render_header()}>
            {@render_assignments()}
        </Panel>

Settings = rclass
    displayName : "CourseEditorSettings"
    propTypes:
        flux        : rtypes.object
        settings    : rtypes.object

    render_title_description: ->
        if not @props.settings?
            return <Loading />
        <Panel header="Title and description">
            <LabeledRow label="Title">
                <TextInput
                    text={@props.settings.get('title')}
                    on_change={(title)=>@props.flux.getActions(@props.name).set_title(title)}
                />
            </LabeledRow>
            <LabeledRow label="Description">
                <TextInput
                    rows      = 4
                    type      = "textarea"
                    text      = {@props.settings.get('description')}
                    on_change={(desc)=>@props.flux.getActions(@props.name).set_description(desc)}
                />
            </LabeledRow>
        </Panel>

    render :->
        <div>
            {@render_title_description()}
        </div>

CourseEditor = rclass
    displayName : "CourseEditor"

    propTypes:
        name        : rtypes.string.isRequired
        flux        : rtypes.object
        settings    : rtypes.object
        students    : rtypes.object
        assignments : rtypes.object

    render: ->
        <div>
            <h4 style={float:'right'}>{@props.settings?.get('title')}</h4>
            <TabbedArea defaultActiveKey={'students'} animation={false}>
                <TabPane eventKey={'students'} tab={<span><Icon name="users"/> Students</span>}>
                    <Students flux={@props.flux} students={@props.students} name={@props.name}  />
                </TabPane>
                <TabPane eventKey={'assignments'} tab={<span><Icon name="share-square-o"/> Assignments</span>}>
                    <Assignments flux={@props.flux} assignments={@props.assignments} name={@props.name} />
                </TabPane>
                <TabPane eventKey={'settings'} tab={<span><Icon name="wrench"/> Settings</span>}>
                    <Settings flux={@props.flux} settings={@props.settings} name={@props.name} />
                </TabPane>
            </TabbedArea>
        </div>

render = (flux, project_id, path) ->
    name = flux_name(project_id, path)
    <FluxComponent flux={flux} connectToStores={name} >
        <CourseEditor name={name}/>
    </FluxComponent>


exports.render_editor_course = (project_id, path, dom_node, flux) ->
    init_flux(flux, project_id, path)
    React.render(render(flux, project_id, path), dom_node)

immutable_to_list = (x, primary_key) ->
    if not x?
        return
    v = []
    x.map (val, key) ->
        v.push(misc.merge(val.toJS(), {"#{primary_key}":key}))
    return v

