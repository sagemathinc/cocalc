###
This is a TEMPLATE for making new editors.  Copy this file to editor_type.cjsx,
and also copy the template-related entries in editor.coffee.

Test this by making a file that ends with .sage-template.

TODO:

  - show how to open a syncstring file
  - show how to connect to a syncdb database backed by the file, so store is sync'd across users of the file
  - eliminate as much boilerplate as possible
  - make it so requiring this file sets any hooks in editor.coffee, so that editor.coffee doesn't have to edited at all!

###


{React, ReactDOM, rclass, rtypes, Redux, Actions, Store}  = require('./smc-react')
{Button, Panel, Row, Col} = require('react-bootstrap')
{Icon, Space} = require('./r_misc')
misc = require('smc-util/misc')
{defaults, required} = misc

redux_name = (project_id, path) ->
    return "editor-#{project_id}-#{path}"

class TemplateActions extends Actions
    init: (@project_id, @filename) =>
        @path = misc.path_split(@filename).head
        @setState(sample_property: 'foo')

exports.init_redux = init_redux = (redux, project_id, filename) ->
    name = redux_name(project_id, filename)
    if redux.getActions(name)?
        return  # already initialized
    actions = redux.createActions(name, TemplateActions)
    actions.init(project_id, filename)
    redux.createStore(name)

Template = (name) -> rclass
    reduxProps:
        "#{name}" :
            sample_property : rtypes.string

    propTypes:
        actions : rtypes.object

    render : ->
        <div>
            <h2>Template for an editor -- {@props.sample_property}</h2>
        </div>

render = (redux, project_id, path) ->
    name    = redux_name(project_id, path)
    actions = redux.getActions(name)
    Template_connected = Template(name)
    <Redux redux={redux}>
        <Template_connected actions={actions} />
    </Redux>

exports.free = (project_id, path, dom_node, redux) ->
    ReactDOM.unmountComponentAtNode(dom_node)

exports.render = (project_id, path, dom_node, redux) ->
    init_redux(redux, project_id, path)
    ReactDOM.render(render(redux, project_id, path), dom_node)

exports.hide = (project_id, path, dom_node, redux) ->
    ReactDOM.unmountComponentAtNode(dom_node)

exports.show = (project_id, path, dom_node, redux) ->
    ReactDOM.render(render(redux, project_id, path), dom_node)