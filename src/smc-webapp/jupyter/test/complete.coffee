###
Tests of fronted part of complete functionality.
###

actions = store = undefined
setup = (cb) -> (require('./setup').setup (err, x) -> actions=x; store=x?.store; cb(err))
{teardown} = require('./setup')

expect  = require('expect')

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
        resp = {"matches":["import"],"status":"ok","cursor_start":0,"cursor_end":2}
        actions._ajax = (opts) =>
            data = JSON.stringify(resp)
            opts.cb(undefined, data)
        actions.complete('im')
        resp.code = 'im'; resp.cursor_pos = undefined
        expect(store.get('complete').toJS()).toEqual(resp)

    it 'do another complete with the cursor position specified (non-default)', ->
        resp = {"matches":["id","if","import","in","input","int","intern","is","isinstance","issubclass","iter"],"status":"ok","cursor_start":0,"cursor_end":1}
        actions._ajax = (opts) =>
            data = JSON.stringify(resp)
            opts.cb(undefined, data)
        actions.complete('im', 1)
        resp.code = 'im'; resp.cursor_pos = 1
        expect(store.get('complete').toJS()).toEqual(resp)

    it 'do a completion, but cancel it before the callback, so result is ignored', ->
        resp = {"matches":["import"],"status":"ok","cursor_start":0,"cursor_end":2}
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
        expect(store.get('complete').toJS()).toEqual({ "status": "error", "code": "im", "cursor_pos": undefined, "error": "error" })

    it 'launching a new complete request clears current complete value', ->
        actions.setState(complete:'foo')
        actions._ajax = (opts) =>
            expect(store.get('complete')).toBe(undefined)
            opts.cb(true)
        actions.complete('im')

