###############################################################################
#
# CoCalc: Collaborative web-based calculation
# Copyright (C) 2017, Sagemath Inc.
# AGPLv3
#
###############################################################################
require('coffee-cache')

{db_doc, from_str, from_obj} = require('../db-doc-immutable')
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


# Using many records is partly a test that I didn't make things stupidly
# inefficient via some change.
numdocs = 1000
describe "test a db doc with #{numdocs} records and one indexed column -- ", ->
    db = undefined
    it "makes the db", ->
        db = db_doc(['id'])
        expect(db.size).toBe(0)

    it "adds #{numdocs} documents to db", ->
        #t0 = new Date()
        for i in [0...numdocs]
            db = db.set(name: "Sage #{i}", id: i)
        #console.log(new Date() - t0)
        expect(db.size).toBe(numdocs)

    it "modifies a document", ->
        expect(db.get_one(id:500).toJS()).toEqual({name:'Sage 500', id:500})
        db = db.set(name : "SageXYZ",  id : 500)
        expect(db.get_one(id:500).toJS()).toEqual({name:'SageXYZ', id:500})

    it "deletes a document", ->
        db = db.delete(id:500)
        expect(db.size).toEqual(numdocs-1)
        expect(db.get_one(id:500)).toEqual(undefined)

    it "deletes all documents", ->
        db = db.delete()
        expect(db.size).toEqual(0)


describe "test a db with two indexed cols -- ", ->
    db = undefined
    times = [misc.minutes_ago(3), misc.minutes_ago(2), misc.minutes_ago(1)]

    it "makes db with two indexed cols", ->
        db = db_doc(['time', 'user'])
        expect(db.size).toBe(0)

    it 'adds an record', ->
        db = db.set
            mesg : "what is going on?"
            time : times[0]
            user : 0
        expect(db.size).toBe(1)
        expect(db.get_one().toJS()).toEqual({mesg:"what is going on?", time:times[0], user:0})

    it 'updates that record based on time indexed field', ->
        db = db.set
            mesg : 'what is going on now?'
            time : times[0]
        expect(db.size).toBe(1)
        expect(db.get_one().toJS()).toEqual({mesg:"what is going on now?", time:times[0], user:0})

    it 'updates that record based on user indexed field', ->
        db = db.set
            mesg : 'what is going on then?'
            user : 0
        expect(db.size).toBe(1)
        expect(db.get_one().toJS()).toEqual({mesg:"what is going on then?", time:times[0], user:0})

    it 'adds more records', ->
        db = db.set
            mesg : "nothing much"
            time : times[1]
            user : 1
        db = db.set
            mesg : "nothing much here either"
            time : times[2]
            user : 0
        expect(db.size).toBe(3)
        expect(db.get().size).toBe(3)

    it 'queries for records by time', ->
        expect(db.get({time:times[0]}).size).toBe(1)
        expect(db.get({time:times[1]}).size).toBe(1)
        expect(db.get({time:times[2]}).size).toBe(1)
        expect(db.get({time:new Date()}).size).toBe(0)

    it 'queries for records by user', ->
        expect(db.get({user:0}).size).toBe(2)
        expect(db.get({user:1}).size).toBe(1)
        expect(db.get({user:2}).size).toBe(0)

    it 'modified record based on time', ->
        db = db.set
            mesg : "nothing much (!)"
            time : times[1]
        expect(db.get_one(time:times[1]).toJS()).toEqual({mesg:'nothing much (!)', time:times[1], user:1})


describe "test a db with index on complicated objects -- ", ->
    db = undefined
    times = [misc.minutes_ago(3), misc.minutes_ago(2), misc.minutes_ago(1)]
    it "makes db with two indexed cols", ->
        db = db_doc(['field1', 'field 2'])
        expect(db.size).toBe(0)

    it "creates two records", ->
        db = db.set
            data : "foo bar"
            field1   : {time:times[0]}
            'field 2': {foo:'bar', a:5, z:[times]}

        db = db.set
            data : "foo bar 2"
            field1   : {time:times[1]}
            'field 2': {foo:'bar', a:5, z:[times]}

        expect(db.size).toBe(2)

    it "selects each record", ->
        x = db.get_one(field1:{time:times[1]}).toJS()
        expect(x).toEqual(data:"foo bar 2", field1:{time:times[1]}, 'field 2':{foo:'bar', a:5, z:[times]})

        x = db.get_one(field1:{time:times[0]}).toJS()
        expect(x).toEqual(data:"foo bar", field1:{time:times[0]}, 'field 2':{foo:'bar', a:5, z:[times]})


describe 'test error handling of non-indexed cols -- ', ->
    db = undefined

    it "makes the db", ->
        db = db_doc(['id'])
        expect(db.size).toBe(0)

    it 'try to use a non-indexed column', ->
        try
            db.set
                name : 'foo'
                stuff : 'bar'
        catch e
            expect("#{e}").toEqual("Error: field \'stuff\' must be indexed")

    it "tests that you can't use set on an indexed col ", ->


describe "create multiple db's at once -- ", ->
    db1 = db2 = undefined

    it "makes the db's", ->
        db1 = db_doc(['id'])
        expect(db1.size).toBe(0)
        db2 = db_doc(['name'])
        expect(db2.size).toBe(0)

    it "add some records to each", ->
        db1 = db1.set(id:123, name:'sagemath')
        expect(db1.size).toBe(1)
        expect(db2.size).toBe(0)
        db2 = db2.set(id:5077, name:'sagemath')
        expect(db1.size).toBe(1)
        expect(db2.size).toBe(1)

    it 'modify each', ->
        db1 = db1.set(id:123, name:'sage')
        db2 = db2.set(id:389, name:'sagemath')
        expect(db1.size).toBe(1)
        expect(db2.size).toBe(1)
        expect(db1.get_one().toJS()).toEqual(id:123, name:'sage')
        expect(db2.get_one().toJS()).toEqual(id:389, name:'sagemath')

    it 'delete from each', ->
        db1 = db1.delete()
        expect(db1.size).toBe(0)
        expect(db2.size).toBe(1)
        db2 = db2.delete()
        expect(db1.size).toBe(0)
        expect(db2.size).toBe(0)


describe 'ensure first entry only is updated -- ', ->

    db = undefined

    it "makes the db", ->
        db = db_doc(['id', 'group'])
        expect(db.size).toBe(0)

    it "adds records", ->
        db = db.set(name:"Sage0", id:"389", group:'user')
        db = db.set(name:"Sage1", id:"123", group:'admin')
        db = db.set(name:"Sage2", id:"389", group:'admin')
        db = db.set(name:"Sage3", id:"5077", group:'admin')
        expect(db.size).toBe(4)
        expect(db.get(group:'admin').size).toBe(3)
        expect(db.get(id:'389').size).toBe(2)

    it "modifies a specifically selected record", ->
        db = db.set(score:5, name:'Sage2+', id:'389', group:'admin')
        expect(db.get_one(id:'389', group:'admin').toJS()).toEqual({id:'389', group:'admin', name:'Sage2+', score:5})

describe 'test conversion from and to obj -- ', ->
    db = undefined
    time = new Date()

    it "makes the db", ->
        db = db_doc(['id', 'group'])
        expect(db.size).toBe(0)

    it "adds records", ->
        db = db.set(name:"Sage0", active:time, id:"389", group:'user')
        db = db.set(name:"Sage1", id:"123", group:'admin')
        db = db.set(name:"Sage2", id:"389", group:'admin')
        db = db.set(name:"Sage3", id:"5077", group:'admin')

    it 'convert to obj', ->
        obj = db.to_obj()
        expect(obj).toEqual([[ 'id', 'group' ], [], {name:"Sage0", active:time, id:"389", group:'user'}, {name:"Sage1", id:"123", group:'admin'}, {name:"Sage2", id:"389", group:'admin'}, {name:"Sage3", id:"5077", group:'admin'}])

    it 'delete two records, then convert to obj', ->
        n = db.size
        db = db.delete(id:'389')
        expect(n - db.size).toEqual(2)
        obj = db.to_obj()
        expect(obj).toEqual([[ 'id', 'group' ], [], {name:"Sage1", id:"123", group:'admin'}, {name:"Sage3", id:"5077", group:'admin'}])

    it 'convert from obj', ->
        db2 = from_obj(db.to_obj())
        expect(db2.equals(db)).toBe(true)


describe 'test conversion from and to strings -- ', ->
    db = undefined
    time = new Date()

    it "makes the db", ->
        db = db_doc(['id', 'group'])
        expect(db.size).toBe(0)

    it "adds records", ->
        db = db.set(name:"Sage0", active:time, id:"389", group:'user')
        db = db.set(name:"Sage1", id:"123", group:'admin')
        db = db.set(name:"Sage2", id:"389", group:'admin')
        db = db.set(name:"Sage3", id:"5077", group:'admin')

    it 'convert to string', ->
        str = db.to_str()
        expect(str).toEqual('["id","group"]\n[]\n{"name":"Sage0","active":' +  JSON.stringify(time)  + ',"id":"389","group":"user"}\n{"name":"Sage1","id":"123","group":"admin"}\n{"name":"Sage2","id":"389","group":"admin"}\n{"name":"Sage3","id":"5077","group":"admin"}')

    it 'delete two records, then convert to string', ->
        n = db.size
        db = db.delete(id:'389')
        expect(n - db.size).toEqual(2)
        expect(db.to_str()).toEqual('["id","group"]\n[]\n{"name":"Sage1","id":"123","group":"admin"}\n{"name":"Sage3","id":"5077","group":"admin"}')

    it 'convert from str', ->
        db2 = from_str(db.to_str())
        expect(db2.get()).toEqual(db.get())
        # then delete and set other way
        db = from_str(db2.to_str())
        expect(db2.get()).toEqual(db.get())

