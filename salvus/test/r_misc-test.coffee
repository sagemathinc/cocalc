{render, render_dom, component_with_tag, click} = require('./react_test_utils.coffee')

expect = require('expect')

# r_misc = require('r_misc')
r_misc = require('../page/temp/r_misc.js')

# {render, click} = require('./test/react_test_utils.coffee');

describe 'test the Loading component: ', ->
    c = render(r_misc.Loading)
    it 'checks the rendered type', ->
        expect(c.type).toBe('span')
    it 'checks the child text', ->
        expect(c.props.children[1]).toBe(" Loading...")
    it 'checks the icon to be the right spinning thing', ->
        expect(c.props.children[0].props).toEqual({ name: 'circle-o-notch', spin: true })

describe 'test the Saving component: ', ->
    c = render(r_misc.Saving)
    it 'checks the rendered type', ->
        expect(c.type).toBe('span')
    it 'checks the child text', ->
        expect(c.props.children[1]).toBe(" Saving...")
    it 'checks the icon to be the right spinning thing', ->
        expect(c.props.children[0].props).toEqual({ name: 'circle-o-notch', spin: true })

describe 'shallow test of the ErrorDisplay component: ', ->
    c = render(r_misc.ErrorDisplay, {error:"This is an error message."})
    it 'is a bootstrap Row', ->
        expect(c.type.displayName).toBe('Row')

describe 'deeper test of the ErrorDisplay component: ', ->
    closed = false
    onClose = (e) ->
        closed = true
        e.stopPropagation()
    c = render_dom(r_misc.ErrorDisplay, {error:"This is an error message.", onClose:onClose})
    button = component_with_tag(c, 'button')
    it 'checks that clicking on the button calls onClose', ->
        expect(closed).toBe(false)
        click(button)
        expect(closed).toBe(true)


        
