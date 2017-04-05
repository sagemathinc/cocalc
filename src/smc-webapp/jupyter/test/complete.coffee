###
Tests of fronted part of complete functionality.
###

actions = store = undefined
setup = (cb) -> (require('./setup').setup (err, x) -> actions=x; store=x?.store; cb(err))
{teardown} = require('./setup')

expect  = require('expect')

misc = require('smc-util/misc')

describe 'basic completion test -- ', ->
    before(setup)
    after(teardown)

    it 'complete starts empty', ->
        expect(store.get('complete')).toBe(undefined)

    it 'clear complete increments counter', ->
        actions.clear_complete()
        expect(actions._complete_request).toBe(1)

    it 'set a fake identity and do a complete', ->
        actions.setState(identity:'fake')
        # We mock the _ajax method so we can send
        # responses of our chosing instead of needing
        # backend server when testing.
        resp = {"matches":["import"],"cursor_start":0,"cursor_end":2, status:'ok'}
        actions._ajax = (opts) =>
            data = JSON.stringify(resp)
            opts.cb(undefined, data)
        actions.complete('im')
        expect(store.get('complete').toJS()).toEqual(misc.copy_without(resp, 'status'))

    it 'do another complete with the cursor position specified (non-default)', ->
        resp = {"matches":["id","if","import","in","input","int","intern","is","isinstance","issubclass","iter"],"cursor_start":0,"cursor_end":1, status:'ok'}
        actions._ajax = (opts) =>
            data = JSON.stringify(resp)
            opts.cb(undefined, data)
        actions.complete('im', 1)
        expect(store.get('complete').toJS()).toEqual(misc.copy_without(resp, 'status'))

    it 'do a completion, but cancel it before the callback, so result is ignored', ->
        resp = {"matches":["import"],"cursor_start":0,"cursor_end":2, status:'ok'}
        actions._ajax = (opts) =>
            actions.clear_complete()
            data = JSON.stringify(resp)
            opts.cb(undefined, data)
        actions.complete('im')
        expect(store.get('complete')).toBe(undefined)

    it 'if there is an error doing the completion see an error result', ->
        actions.setState(complete:'foo')
        actions._ajax = (opts) =>
            opts.cb('error')
        actions.complete('im')
        expect(store.get('complete').toJS()).toEqual({error: "error" })

    it 'if there is a status not ok doing the completion see an error result', ->
        actions.setState(complete:'foo')
        actions._ajax = (opts) =>
            opts.cb(undefined, JSON.stringify({status:'error'}))
        actions.complete('im')
        expect(store.get('complete').toJS()).toEqual({error: "completion failed" })

    it 'launching a new complete request clears current complete value', ->
        actions.setState(complete:'foo')
        actions._ajax = (opts) =>
            expect(store.get('complete')).toBe(undefined)
            opts.cb(true)
        actions.complete('im')



describe 'edge cases completion tests -- ', ->
    before(setup)
    after(teardown)

    it 'do a completion wih no results', ->
        resp = {"matches":[],"status":"ok","cursor_start":0,"cursor_end":2}
        actions.setState(identity:'fake')
        actions._ajax = (opts) =>
            data = JSON.stringify(resp)
            opts.cb(undefined, data)
        actions.complete('imasdlknaskdvnaidsfioahefhoiaioasdf')
        # it just stays undefined doing nothing
        expect(store.get('complete')).toBe(undefined)

    it 'does a completion with 1 result, but with no id set (so nothing special happens)', ->
        resp = {"matches":['foo'],"status":"ok","cursor_start":0,"cursor_end":2}
        actions.setState(identity:'fake')
        actions._ajax = (opts) =>
            data = JSON.stringify(resp)
            opts.cb(undefined, data)
        actions.complete('fo')
        # it just stays undefined doing nothing
        expect(store.get('complete')?.toJS()).toEqual({ cursor_end: 2, cursor_start: 0, matches: [ 'foo' ]})

    it 'does a completion with 1 result with a cell id set, and verifies that it modifies that cell', ->
        id = store.get('cell_list').get(0)
        actions.set_cell_input(id, 'a = fo')
        resp = {"matches":['foo'],"status":"ok","cursor_start":4,"cursor_end":6}
        actions.setState(identity:'fake')
        actions._ajax = (opts) =>
            data = JSON.stringify(resp)
            opts.cb(undefined, data)
        actions.complete('fo', 6, id)
        # Result is to modify the cell, but not open completions info
        expect(store.get('complete')?.toJS()).toBe(undefined)
        expect(store.getIn(['cells', id, 'input'])).toBe('a = foo')




