{jsdom} = require('jsdom')
global.document = jsdom('<!doctype html><html><body></body></html>')
global.window = document.defaultView
global.window.document = global.document
global.navigator = global.window.navigator = {}
global.navigator.userAgent = 'NodeJs JsDom'
global.navigator.appVersion = ''

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

exports.click = React.addons.TestUtils.Simulate.click