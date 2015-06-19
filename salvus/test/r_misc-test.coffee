require('app-module-path').addPath(process.env.SALVUS_ROOT+'/page/temp')

expect = require('expect')

r_misc = require('r_misc')

React = require('react/addons')
TestUtils = React.addons.TestUtils
shallowRenderer = TestUtils.createRenderer()

describe 'test the Loading component: ', ->
    shallowRenderer.render(React.createElement(r_misc.Loading))
    component = shallowRenderer.getRenderOutput()
    it 'checks the rendered type', ->
        expect(component.type).toBe('span')
