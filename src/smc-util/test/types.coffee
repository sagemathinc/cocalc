###
Test type checking functionality

NOTE: You can't use `mocha -w` to work on this file, because it doesn't reset the warnings
internally between runs.
###

{types} = require('../opts')
immutable = require('immutable')
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

describe 'checking immutable Map', ->
    warn = undefined
    beforeEach ->
        warn = sinon.stub(global.console, "error")

    afterEach ->
        warn.restore()

    it 'succeeds', ->
        types({a : immutable.Map({a:4})}, {a:types.immutable.Map})
        warn.should.have.callCount(0)

    it 'fails', ->
        types({a: b : 4}, {a:types.immutable.Map})
        warn.should.have.callCount(1)
        warn.getCall(0).args[0].should.match('Warning: Failed checking a type: NOT EVEN IMMUTABLE, wanted immutable.Map [object Object], a')

    it 'works with isRequired', ->
        types({c : 4}, {a:types.immutable.Map.isRequired})
        warn.should.have.callCount(1)
        warn.getCall(0).args[0].should.match('Warning: Failed checking a type: Required prop `a` was not specified in `check.types`')

