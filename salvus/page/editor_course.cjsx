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
- [ ] (0:30?) fill in very rough content components (just panels/names)
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
{ErrorDisplay, Icon, Loading, SelectorInput} = require('r_misc')

{synchronized_db} = require('syncdb')

flux_name = (project_id, path) ->
    return "editor-#{project_id}-#{path}"

primary_key =
    students    : 'student_id'
    assignments : 'assignment_id'

init_flux = (flux, project_id, path) ->
    name = flux_name(project_id, path)

    project = require('project').project_page(project_id:project_id)
    class CourseActions extends Actions
        setTo: (payload) -> payload

        project: -> project

        set_error: (error) -> @setTo(error:error)

        syncdb_change: (changes) ->
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
                    @setTo("#{k}":v)

    actions = flux.createActions(name, CourseActions)

    class CourseStore extends Store
        constructor: (flux) ->
            super()
            ActionIds = flux.getActionIds(name)
            @register(ActionIds.setTo, @setTo)
            @state = {}
        setTo: (payload) -> @setState(payload)

    store = flux.createStore(name, CourseStore, flux)

    syncdb = undefined

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
                actions.setTo(t)
                syncdb.on('change', actions.syncdb_change)

Students = rclass
    displayName : "CourseEditorStudents"
    render :->
        <span>students</span>

Assignments = rclass
    displayName : "CourseEditorAssignments"
    render :->
        <span>assignments</span>

Settings = rclass
    displayName : "CourseEditorSettings"
    render :->
        <span>settings</span>

CourseEditor = rclass
    displayName : "CourseEditor"

    propTypes:
        flux        : rtypes.object
        settings    : rtypes.object
        students    : rtypes.object
        assignments : rtypes.object

    render: ->
        <div>
            <h4 style={float:'right'}>{@props.settings?.get('title')}</h4>
            <TabbedArea defaultActiveKey={'students'} animation={false}>
                <TabPane eventKey={'students'} tab={<span><Icon name="users"/> Students</span>}>
                    <Students flux={@props.flux} students={@props.students} />
                </TabPane>
                <TabPane eventKey={'assignments'} tab={<span><Icon name="share-square-o"/> Assignments</span>}>
                    <Assignments flux={@props.flux} assignments={@props.assignments} />
                </TabPane>
                <TabPane eventKey={'settings'} tab={<span><Icon name="wrench"/> Settings</span>}>
                    <Settings flux={@props.flux} settings={@props.settings} />
                </TabPane>
            </TabbedArea>
        </div>

render = (flux, project_id, path) ->
    <FluxComponent flux={flux} connectToStores={flux_name(project_id, path)} >
        <CourseEditor />
    </FluxComponent>


exports.render_editor_course = (project_id, path, dom_node, flux) ->
    init_flux(flux, project_id, path)
    React.render(render(flux, project_id, path), dom_node)
