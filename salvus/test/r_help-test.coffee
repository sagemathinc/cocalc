require('app-module-path').addPath(process.env.SALVUS_ROOT+'/page/temp')  # must be first line
{render, render_dom, component_with_tag, click} = require('./react_test_utils.coffee')
misc = require('misc')
expect = require('expect')

r_help = require('r_help')

describe 'Make the HelpPageSupportSection ', ->
    c = render_dom(r_help._test.HelpPageSupportSection)
    it 'checks that there are the right number of children in the unordered list ', ->
        ul = component_with_tag(c, 'ul')
        expect(ul.props.children.length).toBe(misc.keys(r_help._test.SUPPORT_LINKS).length)
