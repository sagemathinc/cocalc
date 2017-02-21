###############################################################################
#
# CoCalc: Collaborative web-based calculation
# Copyright (C) 2017, Sagemath Inc.
# AGPLv3
#
###############################################################################
require('coffee-cache')

syncstring = require('../syncstring')
misc = require('../misc')

expect = require('expect')

###
Test the SortedPatchList class
###

describe "very basic tests with SortedPatchList -- ", ->
    spl = undefined
    times = (misc.minutes_ago(n) for n in [3, 2, 1, 0])

    it 'creates a SortedPatchList', ->
        spl = new syncstring.SortedPatchList()

    it 'creates and adds a patch and does some checks', ->
        patch =
            time    : times[0]
            user_id : 1
            patch   : syncstring.make_patch('', 'hello world')
        spl.add([patch])
        expect(spl.value()).toEqual('hello world')
        expect(spl.user_id(times[1])).toEqual(undefined)
        expect(spl.user_id(times[0])).toEqual(1)
        expect(spl.time_sent(times[0])).toEqual(undefined)
        expect(spl.patch(times[0])).toEqual(patch)
        expect(spl.patch(times[1])).toEqual(undefined)
        expect(spl.versions()).toEqual([times[0]])
        expect(spl.snapshot_times()).toEqual([])

    it 'adds another patch and does further checks', ->
        patch =
            time    : times[1]
            user_id : 0
            patch   : syncstring.make_patch('hello world', 'CoCalc: "hello world"')
        spl.add([patch])
        expect(spl.value()).toEqual('CoCalc: "hello world"')
        expect(spl.value(times[0])).toEqual('hello world')
        expect(spl.user_id(times[1])).toEqual(0)
        expect(spl.user_id(times[0])).toEqual(1)
        expect(spl.time_sent(times[1])).toEqual(undefined)
        expect(spl.patch(times[1])).toEqual(patch)
        expect(spl.versions()).toEqual([times[0], times[1]])
        expect(spl.snapshot_times()).toEqual([])

    it 'adds two more patches', ->
        patch2 =
            time    : times[2]
            user_id : 2
            patch   : syncstring.make_patch('CoCalc: "hello world"', 'CoCalc: "Hello World!"')
            snapshot : 'CoCalc: "Hello World!"'
        patch3 =
            time    : times[3]
            user_id : 3
            patch   : syncstring.make_patch('CoCalc: "Hello World!"', 'CoCalc: "HELLO!!"')
            snapshot : 'CoCalc: "HELLO!!"'
        spl.add([patch2, patch3])
        expect(spl.value()).toEqual('CoCalc: "HELLO!!"')
        expect(spl.value(times[1])).toEqual('CoCalc: "hello world"')
        expect(spl.value(times[2])).toEqual('CoCalc: "Hello World!"')
        expect(spl.value(times[3])).toEqual('CoCalc: "HELLO!!"')
        expect(spl.versions()).toEqual(times)

    it 'verifies snapshot times', ->
        expect(spl.snapshot_times()).toEqual([times[2], times[3]])
        expect(spl.newest_snapshot_time()).toEqual(times[3])

    it 'closes SortedPatchList and verifies that it is closed', ->
        spl.close()
        expect(spl._patches).toBe(undefined)

