###
This is code to support taking a non-react app (e.g., one that uses
jQuery extensively) and making it into a react component.

Why? The point is that we can then quickly reactify all apps,
so that we can finish reactifying everything else... at which point
we can then go back and carefully really rewrite some of those
apps to use react.

This will also help clarify the external API for app components.

Finally, writing this will mean that we can more systematically integrate
external code (e.g., Jupyter Notebooks) that don't (and may never)
use react into SMC.

(c) 2016 SageMath, Inc.
###


{React, ReactDOM, rclass, rtypes, Redux, Actions, Store}  = require('./smc-react')
{Button, Panel, Row, Col} = require('react-bootstrap')
{Icon, Space} = require('./r_misc')
misc = require('smc-util/misc')
{defaults, required} = misc

App = rclass
    render: ->
        <div>
            <h2>Wrapper for an app</h2>
        </div>

# The rest of this file is temporary to make it so that the React component we're creating
# can be rendered into our existing jQuery/DOM based environment; as soon as that
# is gone, we'll go full react and delete this:

render = (redux, project_id, path) ->
    <App />

exports.free = (project_id, path, dom_node, redux) ->
    ReactDOM.unmountComponentAtNode(dom_node)

exports.render = (project_id, path, dom_node, redux) ->
    ReactDOM.render(render(redux, project_id, path), dom_node)

exports.hide = (project_id, path, dom_node, redux) ->
    ReactDOM.unmountComponentAtNode(dom_node)

exports.show = (project_id, path, dom_node, redux) ->
    ReactDOM.render(render(redux, project_id, path), dom_node)