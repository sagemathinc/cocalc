###############################################################################
#
# CoCalc: Collaborative web-based calculation
# Copyright (C) 2017, Sagemath Inc.
# AGPLv3
#
###############################################################################
require('coffee-cache')

{db_doc} = require('../db-doc')
misc = require('../misc')

expect = require('expect')

describe "test a simple db doc with one record -- ", ->
    db = undefined

    it "makes the db", ->
        db = db_doc(['id'])
        expect(db.count()).toBe(0)

    it "adds one record", ->
        db.set(name:"Sage", id:"123")
        expect(db.count()).toBe(1)
        expect(db.get()).toEqual([{name:'Sage', id:'123'}])

    it "modifies that record", ->
        db.set
            name : "SageMath"
            id   : "123"
        expect(db.count()).toBe(1)
        expect(db.get()).toEqual([{name:'SageMath', id:'123'}])

    it "deletes that record", ->
        db.delete(id:"123")
        expect(db.count()).toBe(0)

# Using many records is partly a test that I didn't make things stupidly inefficient
# via some change.
numdocs = 2500
describe "test a db doc with #{numdocs} records and one indexed column -- ", ->
    db = undefined
    it "makes the db", ->
        db = db_doc(['id'])
        expect(db.count()).toBe(0)

    it "adds #{numdocs} documents to db", ->
        for i in [0...numdocs]
            db.set(name : "Sage #{i}", id : i)
        expect(db.count()).toBe(numdocs)

    it "modifies a document", ->
        expect(db.get_one(id:500)).toEqual({name:'Sage 500', id:500})
        db.set(name : "SageXYZ",  id : 500)
        expect(db.get_one(id:500)).toEqual({name:'SageXYZ', id:500})

    it "deletes a document", ->
        expect(db.delete(id:500)).toEqual(1)
        expect(db.get_one(id:500)).toEqual(undefined)
        expect(db.count()).toBe(numdocs-1)

    it "deletes all documents", ->
        expect(db.delete()).toEqual(numdocs-1)
        expect(db.count()).toBe(0)

describe "test a db with two indexed cols -- ", ->
    db = undefined
    times = [misc.minutes_ago(3), misc.minutes_ago(2), misc.minutes_ago(1)]

    it "makes db with two indexed cols", ->
        db = db_doc(['time', 'user'])
        expect(db.count()).toBe(0)

    it 'adds an record', ->
        db.set
            mesg : "what is going on?"
            time : times[0]
            user : 0
        expect(db.count()).toBe(1)
        expect(db.get_one()).toEqual({mesg:"what is going on?", time:times[0], user:0})

    it 'updates that record based on time indexed field', ->
        db.set
            mesg : 'what is going on now?'
            time : times[0]
        expect(db.count()).toBe(1)
        expect(db.get_one()).toEqual({mesg:"what is going on now?", time:times[0], user:0})

    it 'updates that record based on user indexed field', ->
        db.set
            mesg : 'what is going on then?'
            user : 0
        expect(db.count()).toBe(1)
        expect(db.get_one()).toEqual({mesg:"what is going on then?", time:times[0], user:0})

    it 'adds more records', ->
        db.set
            mesg : "nothing much"
            time : times[1]
            user : 1
        db.set
            mesg : "nothing much here either"
            time : times[2]
            user : 0
        expect(db.count()).toBe(3)
        expect(db.get().length).toBe(3)

    it 'queries for records by time', ->
        expect(db.get({time:times[0]}).length).toBe(1)
        expect(db.get({time:times[1]}).length).toBe(1)
        expect(db.get({time:times[2]}).length).toBe(1)
        expect(db.get({time:new Date()}).length).toBe(0)

    it 'queries for records by user', ->
        expect(db.get({user:0}).length).toBe(2)
        expect(db.get({user:1}).length).toBe(1)
        expect(db.get({user:2}).length).toBe(0)

    it 'modified record based on time', ->
        db.set
            mesg : "nothing much (!)"
            time : times[1]
        expect(db.get_one(time:times[1])).toEqual({mesg:'nothing much (!)', time:times[1], user:1})


describe "test a db with index on complicated objects -- ", ->
    db = undefined
    times = [misc.minutes_ago(3), misc.minutes_ago(2), misc.minutes_ago(1)]
    it "makes db with two indexed cols", ->
        db = db_doc(['field1', 'field 2'])
        expect(db.count()).toBe(0)

    it "creates two records", ->
        db.set
            data : "foo bar"
            field1   : {time:times[0]}
            'field 2': {foo:'bar', a:5, z:[times]}

        db.set
            data : "foo bar 2"
            field1   : {time:times[1]}
            'field 2': {foo:'bar', a:5, z:[times]}

        expect(db.count()).toBe(2)

    it "selects each record", ->
        x = db.get_one(field1:{time:times[1]})
        expect(x).toEqual(data:"foo bar 2", field1:{time:times[1]}, 'field 2':{foo:'bar', a:5, z:[times]})

        x = db.get_one(field1:{time:times[0]})
        expect(x).toEqual(data:"foo bar", field1:{time:times[0]}, 'field 2':{foo:'bar', a:5, z:[times]})


describe 'test error handling of non-indexed cols -- ', ->
    db = undefined

    it "makes the db", ->
        db = db_doc(['id'])
        expect(db.count()).toBe(0)

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
        expect(db1.count()).toBe(0)
        db2 = db_doc(['name'])
        expect(db2.count()).toBe(0)

    it "add some records to each", ->
        db1.set(id:123, name:'sagemath')
        expect(db1.count()).toBe(1)
        expect(db2.count()).toBe(0)
        db2.set(id:5077, name:'sagemath')
        expect(db1.count()).toBe(1)
        expect(db2.count()).toBe(1)

    it 'modify each', ->
        db1.set(id:123, name:'sage')
        db2.set(id:389, name:'sagemath')
        expect(db1.count()).toBe(1)
        expect(db2.count()).toBe(1)
        expect(db1.get_one()).toEqual(id:123, name:'sage')
        expect(db2.get_one()).toEqual(id:389, name:'sagemath')

    it 'delete from each', ->
        db1.delete()
        expect(db1.count()).toBe(0)
        expect(db2.count()).toBe(1)
        db2.delete()
        expect(db1.count()).toBe(0)
        expect(db2.count()).toBe(0)


describe 'ensure first entry only is updated -- ', ->

    db = undefined

    it "makes the db", ->
        db = db_doc(['id', 'group'])
        expect(db.count()).toBe(0)

    it "adds records", ->
        db.set(name:"Sage0", id:"389", group:'user')
        db.set(name:"Sage1", id:"123", group:'admin')
        db.set(name:"Sage2", id:"389", group:'admin')
        db.set(name:"Sage3", id:"5077", group:'admin')
        expect(db.count()).toBe(4)
        expect(db.get(group:'admin').length).toBe(3)
        expect(db.get(id:'389').length).toBe(2)

    it "modifies the *first* matching record only", ->
        db.set(score:1, group:'admin')
        v = db.get()
        expect(v[0].score).toEqual(undefined)
        expect(v[1].score).toEqual(1)
        expect(v[2].score).toEqual(undefined)
        expect(v[3].score).toEqual(undefined)

    it "modifies a specifically selected record", ->
        db.set(score:5, name:'Sage2+', id:'389', group:'admin')
        expect(db.get_one(id:'389', group:'admin')).toEqual({id:'389', group:'admin', name:'Sage2+', score:5})

describe 'test conversion from and to obj -- ', ->
    db = undefined
    time = new Date()

    it "makes the db", ->
        db = db_doc(['id', 'group'])
        expect(db.count()).toBe(0)

    it "adds records", ->
        db.set(name:"Sage0", active:time, id:"389", group:'user')
        db.set(name:"Sage1", id:"123", group:'admin')
        db.set(name:"Sage2", id:"389", group:'admin')
        db.set(name:"Sage3", id:"5077", group:'admin')

    it 'convert to obj', ->
        obj = db.to_obj()
        expect(obj).toEqual([{name:"Sage0", active:time, id:"389", group:'user'}, {name:"Sage1", id:"123", group:'admin'}, {name:"Sage2", id:"389", group:'admin'}, {name:"Sage3", id:"5077", group:'admin'}])

    it 'delete two records, then convert to obj', ->
        expect(db.delete(id:'389')).toEqual(2)
        obj = db.to_obj()
        expect(obj).toEqual([{name:"Sage1", id:"123", group:'admin'}, {name:"Sage3", id:"5077", group:'admin'}])

    it 'convert from obj', ->
        db2 = db_doc(['id', 'group'])
        db2.from_obj(db.to_obj())
        expect(db2.get()).toEqual(db.get())
        # then delete and set other way
        db.delete()
        db.from_obj(db2.to_obj())
        expect(db2.get()).toEqual(db.get())


describe 'test conversion from and to strings -- ', ->
    db = undefined
    time = new Date()

    it "makes the db", ->
        db = db_doc(['id', 'group'])
        expect(db.count()).toBe(0)

    it "adds records", ->
        db.set(name:"Sage0", active:time, id:"389", group:'user')
        db.set(name:"Sage1", id:"123", group:'admin')
        db.set(name:"Sage2", id:"389", group:'admin')
        db.set(name:"Sage3", id:"5077", group:'admin')

    it 'convert to string', ->
        str = db.to_str()
        expect(str).toEqual('{"name":"Sage0","active":' +  JSON.stringify(time)  + ',"id":"389","group":"user"}\n{"name":"Sage1","id":"123","group":"admin"}\n{"name":"Sage2","id":"389","group":"admin"}\n{"name":"Sage3","id":"5077","group":"admin"}')

    it 'delete two records, then convert to string', ->
        expect(db.delete(id:'389')).toEqual(2)
        str = db.to_str()
        expect(str).toEqual('{"name":"Sage1","id":"123","group":"admin"}\n{"name":"Sage3","id":"5077","group":"admin"}')

    it 'convert from str', ->
        db2 = db_doc(['id', 'group'])
        db2.from_str(db.to_str())
        expect(db2.get()).toEqual(db.get())
        # then delete and set other way
        db.delete()
        db.from_str(db2.to_str())
        expect(db2.get()).toEqual(db.get())

describe 'test recording of sequence of actions -- ', ->
    db = recording = undefined

    it "makes a db", ->
        db = db_doc(['id', 'group'])
        expect(db.count()).toBe(0)

    it "enable recording and add 2 records", ->
        db.start_recording()
        db.set(name:"Sage0", x:{y:['z']}, id:"389", group:'user')
        db.set(name:"Sage1", id:"123", group:'admin')
        recording = db.stop_recording()
        expect(recording).toEqual([{ set: { name: 'Sage0', x: { y: ['z'] }, group: 'user', id: '389' } }, { set: { name: 'Sage1', group: 'admin', id: '123' } }])

    it "delete state, then play recording", ->
        db.delete()
        db.play_recording(recording)
        expect(db.get()).toEqual([{name:"Sage0", x:{y:['z']}, id:"389", group:'user'}, {name:"Sage1", id:"123", group:'admin'}])

    it "make new recording that includes more interesting delete/mutate operations", ->
        db.delete()
        db.start_recording()
        db.set(name:'x', id:0)
        db.set(name:'a', id:1)
        db.set(name:'y', id:0)
        db.set(name:'z', id:0)
        db.delete(id:1)
        state = db.get()
        recording = db.stop_recording()
        db.delete()
        db.play_recording(recording)
        expect(db.get()).toEqual(state)

rec_length = 500
describe "record #{rec_length} random operations, then test playback works right -- ", ->
    db = recording = undefined
    primary_keys = ['k0', 'k1', 'k2']

    it "makes a db", ->
        db = db_doc( primary_keys)

    it "records #{rec_length} operations", ->
        db.start_recording()
        random_where = ->
            where = {}
            for k in primary_keys
                where[k] = misc.random_choice([0,1,2])
            return where
        random_set = ->
            set =
                name : misc.random_choice(['Joe', 'Sam', 'Sage', 'Math'])
                age  : misc.random_choice([0..10])
            return set

        for n in [0...rec_length]
            if Math.random() <= .2
                db.delete(random_where())
            else
                s = random_set()
                for k,v of random_where()
                    s[k] = v
                db.set(s)

        recording = db.stop_recording()
        expect(recording.length).toEqual(rec_length)

    it 'now testing that recording worked', ->
        state = db.get()
        db.delete()
        db.play_recording(recording)
        expect(db.get()).toEqual(state)

