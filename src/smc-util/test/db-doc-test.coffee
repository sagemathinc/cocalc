###############################################################################
#
# CoCalc: Collaborative web-based calculation
# Copyright (C) 2017, Sagemath Inc.
# AGPLv3
#
###############################################################################

{db_doc} = require('../db-doc')
misc = require('../misc')

expect = require('expect')

describe "test a simple db doc with one record -- ", ->
    db = undefined

    it "makes the db", ->
        db = db_doc(['id'])
        expect(db.count()).toBe(0)

    it "adds one record", ->
        db.update
            set : {name:"Sage"}
            where : {id:"123"}
        expect(db.count()).toBe(1)
        expect(db.select()).toEqual([{name:'Sage', id:'123'}])

    it "modifies that record", ->
        db.update
            set : {name:"SageMath"}
            where : {id:"123"}
        expect(db.count()).toBe(1)
        expect(db.select()).toEqual([{name:'SageMath', id:'123'}])

    it "deletes that record", ->
        db.delete
            where : {id:"123"}
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
            db.update
                set :
                    name : "Sage #{i}"
                where:
                    id : i
        expect(db.count()).toBe(numdocs)

    it "modifies a document", ->
        expect(db.select_one(where:id:500)).toEqual({name:'Sage 500', id:500})
        db.update
            set : name : "SageXYZ"
            where : id : 500
        expect(db.select_one(where:id:500)).toEqual({name:'SageXYZ', id:500})

    it "deletes a document", ->
        expect(db.delete(where:id:500)).toEqual(1)
        expect(db.select_one(where:id:500)).toEqual(undefined)
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
        db.update
            set : mesg : "what is going on?"
            where :
                time : times[0]
                user : 0
        expect(db.count()).toBe(1)
        expect(db.select_one()).toEqual({mesg:"what is going on?", time:times[0], user:0})

    it 'updates that record based on time indexed field', ->
        db.update
            set : mesg : 'what is going on now?'
            where : time : times[0]
        expect(db.count()).toBe(1)
        expect(db.select_one()).toEqual({mesg:"what is going on now?", time:times[0], user:0})

    it 'updates that record based on user indexed field', ->
        db.update
            set : mesg : 'what is going on then?'
            where : user : 0
        expect(db.count()).toBe(1)
        expect(db.select_one()).toEqual({mesg:"what is going on then?", time:times[0], user:0})

    it 'adds more records', ->
        db.update
            set : mesg : "nothing much"
            where :
                time : times[1]
                user : 1
        db.update
            set : mesg : "nothing much here either"
            where :
                time : times[2]
                user : 0
        expect(db.count()).toBe(3)
        expect(db.select().length).toBe(3)

    it 'queries for records by time', ->
        expect(db.select(where:{time:times[0]}).length).toBe(1)
        expect(db.select(where:{time:times[1]}).length).toBe(1)
        expect(db.select(where:{time:times[2]}).length).toBe(1)
        expect(db.select(where:{time:new Date()}).length).toBe(0)

    it 'queries for records by user', ->
        expect(db.select(where:{user:0}).length).toBe(2)
        expect(db.select(where:{user:1}).length).toBe(1)
        expect(db.select(where:{user:2}).length).toBe(0)

    it 'modified record based on time', ->
        db.update
            set : mesg : "nothing much (!)"
            where : time : times[1]
        expect(db.select_one(where:time:times[1])).toEqual({mesg:'nothing much (!)', time:times[1], user:1})


describe "test a db with index on complicated objects -- ", ->
    db = undefined
    times = [misc.minutes_ago(3), misc.minutes_ago(2), misc.minutes_ago(1)]
    it "makes db with two indexed cols", ->
        db = db_doc(['field1', 'field 2'])
        expect(db.count()).toBe(0)

    it "creates two records", ->
        db.update
            set :
                data : "foo bar"
            where :
                field1   : {time:times[0]}
                'field 2': {foo:'bar', a:5, z:[times]}

        db.update
            set :
                data : "foo bar 2"
            where :
                field1   : {time:times[1]}
                'field 2': {foo:'bar', a:5, z:[times]}

        expect(db.count()).toBe(2)

    it "selects each record", ->
        x = db.select_one(where:{field1:{time:times[1]}})
        expect(x).toEqual(data:"foo bar 2", field1:{time:times[1]}, 'field 2':{foo:'bar', a:5, z:[times]})

        x = db.select_one(where:{field1:{time:times[0]}})
        expect(x).toEqual(data:"foo bar", field1:{time:times[0]}, 'field 2':{foo:'bar', a:5, z:[times]})


describe 'test error handling of non-indexed cols -- ', ->
    db = undefined

    it "makes the db", ->
        db = db_doc(['id'])
        expect(db.count()).toBe(0)

    it 'try to use a non-indexed column', ->
        try
            db.update
                set   : name : 'foo'
                where : stuff : 'bar'
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
        db1.update(set:{id:123, name:'sagemath'})
        expect(db1.count()).toBe(1)
        expect(db2.count()).toBe(0)
        db2.update(set:{id:5077, name:'sagemath'})
        expect(db1.count()).toBe(1)
        expect(db2.count()).toBe(1)

    it 'modify each', ->
        db1.update(set:{id:123, name:'sage'})
        db2.update(set:{id:389, name:'sagemath'})
        expect(db1.count()).toBe(1)
        expect(db2.count()).toBe(1)
        expect(db1.select_one()).toEqual(id:123, name:'sage')
        expect(db2.select_one()).toEqual(id:389, name:'sagemath')

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
        db.update(set : {name:"Sage0"}, where : {id:"389", group:'user'})
        db.update(set : {name:"Sage1"}, where : {id:"123", group:'admin'})
        db.update(set : {name:"Sage2"}, where : {id:"389", group:'admin'})
        db.update(set : {name:"Sage3"}, where : {id:"5077", group:'admin'})
        expect(db.count()).toBe(4)
        expect(db.select(where:{group:'admin'}).length).toBe(3)
        expect(db.select(where:{id:'389'}).length).toBe(2)

    it "modifies the *first* matching record only", ->
        db.update(set : {score:1}, where : {group:'admin'})
        v = db.select()
        expect(v[0].score).toEqual(undefined)
        expect(v[1].score).toEqual(1)
        expect(v[2].score).toEqual(undefined)
        expect(v[3].score).toEqual(undefined)

    it "modifies a specifically selected record", ->
        db.update(set:{score:5, name:'Sage2+'}, where:{id:'389', group:'admin'})
        expect(db.select_one(where:{id:'389', group:'admin'})).toEqual({id:'389', group:'admin', name:'Sage2+', score:5})

describe 'test conversion from and to obj -- ', ->
    db = undefined
    time = new Date()

    it "makes the db", ->
        db = db_doc(['id', 'group'])
        expect(db.count()).toBe(0)

    it "adds records", ->
        db.update(set : {name:"Sage0", active:time}, where : {id:"389", group:'user'})
        db.update(set : {name:"Sage1"}, where : {id:"123", group:'admin'})
        db.update(set : {name:"Sage2"}, where : {id:"389", group:'admin'})
        db.update(set : {name:"Sage3"}, where : {id:"5077", group:'admin'})

    it 'convert to obj', ->
        obj = db.to_obj()
        expect(obj).toEqual([{name:"Sage0", active:time, id:"389", group:'user'}, {name:"Sage1", id:"123", group:'admin'}, {name:"Sage2", id:"389", group:'admin'}, {name:"Sage3", id:"5077", group:'admin'}])

    it 'delete two records, then convert to obj', ->
        expect(db.delete(where:{id:'389'})).toEqual(2)
        obj = db.to_obj()
        expect(obj).toEqual([{name:"Sage1", id:"123", group:'admin'}, {name:"Sage3", id:"5077", group:'admin'}])

    it 'convert from obj', ->
        db2 = db_doc(['id', 'group'])
        db2.from_obj(db.to_obj())
        expect(db2.select()).toEqual(db.select())
        # then delete and set other way
        db.delete()
        db.from_obj(db2.to_obj())
        expect(db2.select()).toEqual(db.select())
