###
This is code to support taking a non-react editor (e.g., one that uses
jQuery extensively) and making it into a react component.

Why? The point is that we can then quickly reactify all the other editors,
so that we can finish reactifying everything else... at which point
we can then go back and carefully really rewrite them.

This will also help clarify the external API for editor components.

Finally, writing this will mean that we can more easily integrate
external code (e.g., jupyter notebooks) that don't (and may never!)
use React into SMC.
###


{React, ReactDOM, rclass, rtypes, Redux, Actions, Store}  = require('./smc-react')
{Button, Panel, Row, Col} = require('react-bootstrap')
{Icon, Space} = require('./r_misc')
misc = require('smc-util/misc')
{defaults, required} = misc

###
App = rclass
    render : ->
        <div>
            <h2>Wrapper for an app</h2>
        </div>

render = (redux, project_id, path) ->
    <App />

free = (project_id, path, dom_node, redux) ->
    ReactDOM.unmountComponentAtNode(dom_node)

render = (project_id, path, dom_node, redux) ->
    init_redux(redux, project_id, path)
    ReactDOM.render(render(redux, project_id, path), dom_node)

hide = (project_id, path, dom_node, redux) ->
    ReactDOM.unmountComponentAtNode(dom_node)

show = (project_id, path, dom_node, redux) ->
    ReactDOM.render(render(redux, project_id, path), dom_node)
###


###
react_wrapped_editor takes as input a class that derives from FileEditor
and returns a react component.

###
exports.react_wrapped_editor = (editor_class) ->
    <h2>Trivial react component</h2>

editor = require('editor')
class exports.ReactWrappedEditorDemo extends editor.FileEditor
    constructor: (@editor, @filename, @content, opts) ->
        @element = $("<div>DEMO 3</div>")
        foo(bar)

    show: () =>
        @element.show()
        @element.css(top:@editor.editor_top_position())
        @element.maxheight()


