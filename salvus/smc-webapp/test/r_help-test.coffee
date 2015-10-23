expect = require('expect')

{render, render_dom, component_with_tag, click} = require('./react_test_utils.coffee')

misc = require('smc-util/misc')

r_help = require('../r_help.cjsx')

describe 'Make the HelpPageSupportSection with small input', ->
    c = render_dom(r_help._test.HelpPageSupportSection, {support_links: {test: {icon: "at", href: "#a", link: "test"}}})
    it 'checks that the list has only one element', ->
        ul = component_with_tag(c, 'ul')
        expect(ul.props.children.length).toBe(1)

describe 'Make the HelpPageSupportSection with real input', ->
    c = render_dom(r_help._test.HelpPageSupportSection, {support_links : r_help._test.SUPPORT_LINKS})
    it 'checks that there are the right number of children in the unordered list ', ->
        ul = component_with_tag(c, 'ul')
        expect(ul.props.children.length).toBe(misc.keys(r_help._test.SUPPORT_LINKS).length)