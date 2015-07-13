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
- [ ] (0:45?) create dynamically created store attached to a project_id and course filename, which updates on sync of file.
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

{React, rclass, rtypes, FluxComponent, Actions, Store}  = require('flux')
{Button, ButtonToolbar, Input, Row, Col, Panel, TabbedArea, TabPane, Well} = require('react-bootstrap')
{ErrorDisplay, Icon, Loading, SelectorInput} = require('r_misc')

flux_name = (project_id, path) ->
    return "editor-#{project_id}-#{path}"

init_flux = (flux, project_id, path) ->
    name = flux_name(project_id, path)

    class CourseActions extends Actions
        setTo: (payload) -> payload
        _project: ->
            return @_project_cache ? @_project_cache=require('project').project_page(project_id:project_id)

    class CourseStore extends Store
        constructor: (flux) ->
            super()
            ActionIds = flux.getActionIds(name)
            @register(ActionIds.setTo, @setTo)
            @state = {}
        setTo: (payload) -> @setState(payload)

    flux.createActions(name, CourseActions)
    flux.createStore(name, CourseStore, flux)

Students = rclass
    render :->
        <span>students</span>

Assignments = rclass
    render :->
        <span>assignments</span>

Settings = rclass
    render :->
        <span>settings</span>

CourseEditor = rclass
    render: ->
        <div>
            <h4 style={float:'right'}>Course Title</h4>
            <TabbedArea defaultActiveKey={'students'} animation={false}>
                <TabPane eventKey={'students'} tab={<span><Icon name="users"/> Students</span>}>
                    <Students flux={@props.flux}/>
                </TabPane>
                <TabPane eventKey={'assignments'} tab={<span><Icon name="share-square-o"/> Assignments</span>}>
                    <Assignments flux={@props.flux}/>
                </TabPane>
                <TabPane eventKey={'settings'} tab={<span><Icon name="wrench"/> Settings</span>}>
                    <Settings flux={@props.flux}/>
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
