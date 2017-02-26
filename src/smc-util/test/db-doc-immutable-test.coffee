###############################################################################
#
# CoCalc: Collaborative web-based calculation
# Copyright (C) 2017, Sagemath Inc.
# AGPLv3
#
###############################################################################
require('coffee-cache')

{db_doc} = require('../db-doc-immutable')
misc = require('../misc')

expect = require('expect')

describe "test a simple db doc with one record -- ", ->
    db = undefined

    it "makes the db", ->
        db = db_doc(['id'])
        expect(db.size).toBe(0)

    it "adds one record", ->
        db = db.set(name:"Sage", id:"123")
        expect(db.size).toBe(1)
        expect(db.get().toJS()).toEqual([{name:'Sage', id:'123'}])

    it "modifies that record", ->
        db = db.set
            name : "SageMath"
            id   : "123"
        expect(db.size).toBe(1)
        expect(db.get().toJS()).toEqual([{name:'SageMath', id:'123'}])

    it "deletes that record", ->
        db = db.delete(id:"123")
        expect(db.size).toBe(0)
        expect(db.get().toJS()).toEqual([])
