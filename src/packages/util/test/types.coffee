#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

######
#
# CoCalc: Collaborative web-based calculation
# Copyright (C) 2017, Sagemath Inc.
# AGPLv3
#
###############################################################################

###
Test type checking functionality

IF THESE TESTS FAIL, CHECK `echo $NODE_ENV`. NODE_ENV=production will cause these tests to fail.
NODE_ENV=development to correctly use this file

NOTE: You can't use `mocha -w` to work on this file, because it doesn't reset the warnings
internally between runs.

NOTE2: Some object key names are slightly different from others due to working around
https://github.com/facebook/react/issues/6293
###

{types} = require('../opts')
immutable = require('immutable')
sinon   = require('sinon')
should  = require('should')
require('should-sinon')

describe 'throws with non-objects', ->
    it 'fails if first argument is non-object', ->
        should.throws(()=>types(1, {a:types.number}))

    it 'fails if second argument is non-object', ->
        should.throws(()=>types({a:2}, 3))

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
        types({a: 4}, {a:types.immutable.Map})
        warn.should.have.callCount(1)
        warn.getCall(0).args[0].should.match('Warning: Failed checking a type: NOT EVEN IMMUTABLE, wanted immutable.Map [object Object], a')

    it 'works with isRequired', ->
        types({c : 4}, {a:types.immutable.Map.isRequired})
        warn.should.have.callCount(1)
        warn.getCall(0).args[0].should.match('Warning: Failed checking a type: Required prop `a` was not specified in `check.types`')

    it 'checks against other immutable types', ->
        types({b : immutable.List([1, 2])}, {b : types.immutable.Map})
        warn.should.have.callCount(1)
        warn.getCall(0).args[0].should.match('Warning: Failed checking a type: Component `check.types` expected b to be an immutable.Map but was supplied List [ 1, 2 ]')

describe 'checking immutable List', ->
    warn = undefined
    beforeEach ->
        warn = sinon.stub(global.console, "error")

    afterEach ->
        warn.restore()

    it 'succeeds', ->
        types({a : immutable.List([1, 2, 3, 4])}, {a:types.immutable.List})
        warn.should.have.callCount(0)

    it 'fails', ->
        types({a : 4}, {a : types.immutable.List})
        warn.should.have.callCount(1)
        warn.getCall(0).args[0].should.match('Warning: Failed checking a type: NOT EVEN IMMUTABLE, wanted immutable.List [object Object], a')

    it 'works with isRequired', ->
        types({c : 4}, {b : types.immutable.List.isRequired})
        warn.should.have.callCount(1)
        warn.getCall(0).args[0].should.match('Warning: Failed checking a type: Required prop `b` was not specified in `check.types`')

    it 'checks against other immutable types', ->
        types({b : immutable.Map(a:4)}, {b : types.immutable.List})
        warn.should.have.callCount(1)
        warn.getCall(0).args[0].should.match('Warning: Failed checking a type: Component `check.types` expected b to be an immutable.List but was supplied Map { "a": 4 }')

describe 'checking immutable Set', ->
    warn = undefined
    beforeEach ->
        warn = sinon.stub(global.console, "error")

    afterEach ->
        warn.restore()

    it 'succeeds', ->
        types({a : immutable.Set([1, 2, 3, 4])}, {a:types.immutable.Set})
        warn.should.have.callCount(0)

    it 'fails', ->
        types({a: b : 4}, {a:types.immutable.Set})
        warn.should.have.callCount(1)
        warn.getCall(0).args[0].should.match('Warning: Failed checking a type: NOT EVEN IMMUTABLE, wanted immutable.Set [object Object], a')

    it 'works with isRequired', ->
        types({a : 4}, {c:types.immutable.Set.isRequired})
        warn.should.have.callCount(1)
        warn.getCall(0).args[0].should.match('Warning: Failed checking a type: Required prop `c` was not specified in `check.types`')

    it 'checks against other immutable types', ->
        types({b : immutable.Map(a:4)}, {b : types.immutable.Set})
        warn.should.have.callCount(1)
        warn.getCall(0).args[0].should.match('Warning: Failed checking a type: Component `check.types` expected b to be an immutable.Set but was supplied Map { "a": 4 }')

describe 'checking immutable Stack', ->
    warn = undefined
    beforeEach ->
        warn = sinon.stub(global.console, "error")

    afterEach ->
        warn.restore()

    it 'succeeds', ->
        types({a : immutable.Stack([1, 2, 4])}, {a:types.immutable.Stack})
        warn.should.have.callCount(0)

    it 'fails', ->
        types({a : 2}, {a:types.immutable.Stack})
        warn.should.have.callCount(1)
        warn.getCall(0).args[0].should.match('Warning: Failed checking a type: NOT EVEN IMMUTABLE, wanted immutable.Stack [object Object], a')

    it 'works with isRequired', ->
        types({c : 4}, {d:types.immutable.Stack.isRequired})
        warn.should.have.callCount(1)
        warn.getCall(0).args[0].should.match('Warning: Failed checking a type: Required prop `d` was not specified in `check.types`')

    it 'checks against other immutable types', ->
        types({b : immutable.Map(a:4)}, {b : types.immutable.Stack})
        warn.should.have.callCount(1)
        warn.getCall(0).args[0].should.match('Warning: Failed checking a type: Component `check.types` expected b to be an immutable.Stack but was supplied Map { "a": 4 }')
