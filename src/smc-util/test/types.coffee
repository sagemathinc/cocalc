###
Test type checking functionality

NOTE: You can't use `mocha -w` to work on this file, because it doesn't reset the warnings
internally between runs.
###

{types} = require('../opts')
sinon   = require('sinon')
should  = require('should')
require('should-sinon')

describe 'test a basic type check -- ', ->
    warn = undefined
    beforeEach ->
        warn = sinon.stub(global.console, "error")

    afterEach ->
        warn.restore()

    it 'succeeds', ->
        types({a:5}, {a:types.number})
        warn.should.have.callCount(0)

    it 'fails', ->
        types({a:5}, {a:types.string})
        warn.should.have.callCount(1)
        warn.getCall(0).args[0].should.match('Warning: Failed checking a type: Invalid checking a `a` of type `number` supplied to `check.types`, expected `string`.')

