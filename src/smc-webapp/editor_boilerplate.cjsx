{React, ReactDOM, Actions, Store, Flux} = require('./r')

class TasksActions extends Actions
    _set_to: (payload) =>
        payload

class TasksStore extends Store
    _init: (flux) =>
        ActionIds = flux.getActionIds(@name)
        @register(ActionIds._set_to, @setState)
        @state = {}

flux_name = (project_id, path) ->
    return "editor-#{project_id}-#{path}"

render = (flux, project_id, path) ->
    name = flux_name(project_id, path)
    actions = flux.getActions(name)
    connect_to = {}

    <Flux flux={flux} connect_to=connect_to>
        <div>"Task list yo"</div>
    </Flux>

exports.init_flux = init_flux = (flux, project_id, filename) ->
    name = flux_name(project_id, filename)
    if flux.getActions(name)?
        return  # already initialized
    actions = flux.createActions(name, TasksActions)
    store   = flux.createStore(name, TasksStore)
    store._init(flux)

exports.free = (project_id, path, dom_node, flux) ->
    ReactDOM.unmountComponentAtNode(dom_node)

exports.render = (project_id, path, dom_node, flux) ->
    init_flux(flux, project_id, path)
    ReactDOM.render(render(flux, project_id, path), dom_node)

exports.hide = (project_id, path, dom_node, flux) ->
    ReactDOM.unmountComponentAtNode(dom_node)

exports.show = (project_id, path, dom_node, flux) ->
    ReactDOM.render(render(flux, project_id, path), dom_node)