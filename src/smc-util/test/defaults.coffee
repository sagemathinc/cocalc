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
Test opts defaults handling code
###

opts = require('../opts')
underscore = require('underscore')

# ATTN: the order of these require statements is important,
# such that should & sinon work well together
sinon   = require('sinon')
should  = require('should')
require('should-sinon')

# Returns a new object with properties determined by those of obj1 and
# obj2.  The properties in obj1 *must* all also appear in obj2.  If an
# obj2 property has value "defaults.required", then it must appear in
# obj1.  For each property P of obj2 not specified in obj1, the
# corresponding value obj1[P] is set (all in a new copy of obj1) to
# be obj2[P].

describe "default", ->
    d = opts.defaults
    required = opts.required

    before =>
        @debug_orig = global.DEBUG
        global.DEBUG = true

    after =>
        global.DEBUG = @debug_orig

    beforeEach =>
        @console_debug_stub = sinon.stub(global.console, "warn")
        @console_trace_stub = sinon.stub(global.console, "trace")

    afterEach =>
        @console_trace_stub.restore()
        @console_debug_stub.restore()

    it "returns a new object", ->
        o1 = {}; o2 = {}
        d(o1, o2).should.not.be.exactly(o1).and.not.exactly(o2)

    it "properties of obj1 must appear in obj2", ->
        obj1 =
            foo: 1
            bar: [1, 2, 3]
            baz:
                foo: "bar"
        obj2 =
            foo: 2
            bar: [1, 2, 3]
            baz:
                foo: "bar"
        exp =
            foo: 1
            bar: [1, 2, 3]
            baz:
                foo: "bar"
        d(obj1, obj2).should.be.eql exp

    it "raises exception for extra arguments", =>
        obj1 = extra: true
        obj2 = {}
        (-> d(obj1, obj2)).should.throw /got an unexpected argument 'extra'/
        #@console_debug_stub.getCall(0).args[0].should.match /(obj1={"extra":true}, obj2={})/

    it "doesn't raises exception if extra arguments are allowed", =>
        obj1 = extra: true
        obj2 = {}
        d(obj1, obj2, true)
        @console_trace_stub.should.have.callCount 0
        @console_debug_stub.should.have.callCount 0

    it "raises an exception if obj2 has a `required` property but nothing in obj1", =>
        obj1 = {}
        obj2 =
            r: required
        (-> d(obj1, obj2)).should.throw /property \'r\' must be specified/
        #@console_trace_stub.getCall(0).args[0].should.match /property 'r' must be specified/

    it "raises an exception if obj2 has a `required` property but is undefined in obj1", =>
        obj1 =
            r: undefined
        obj2 =
            r: required
        (-> d(obj1, obj2)).should.throw /property \'r\' must be specified/
        #@console_debug_stub.getCall(0).args[0].should.match /(obj1={}, obj2={"r":"__!!!!!!this is a required property!!!!!!__"})/


