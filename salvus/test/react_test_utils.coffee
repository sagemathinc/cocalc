require('app-module-path').addPath(process.env.SALVUS_ROOT+'/page/temp')

React = require('react/addons')
TestUtils = React.addons.TestUtils

exports.render = (component, props, children...) ->
    shallowRenderer = TestUtils.createRenderer()
    shallowRenderer.render(React.createElement(component, props, if children.length > 1 then children else children[0]))
    return shallowRenderer.getRenderOutput()

exports.render_dom = (component, props, children...) ->
    x = React.createElement(component, props, if children.length > 1 then children else children[0])
    return TestUtils.renderIntoDocument(x)

exports.components_with_tag = (c, tag) ->
    return TestUtils.scryRenderedDOMComponentsWithTag(c, tag)

exports.component_with_tag = (c, tag) ->
    return TestUtils.findRenderedDOMComponentWithTag(c, tag)

jsdom = require('jsdom')
global.document = jsdom.jsdom('<!doctype html><html><body></body></html>')
global.window = document.parentWindow
exports.click = React.addons.TestUtils.Simulate.click