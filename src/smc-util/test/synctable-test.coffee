###############################################################################
#
# CoCalc: Collaborative web-based calculation
# Copyright (C) 2017, Sagemath Inc.
# AGPLv3
#
###############################################################################

immutable = require('immutable')

synctable = require('../synctable')
misc = require('../misc')

expect = require('expect')

describe "create a simple synctable and do basic operations -- ", ->
    client = new synctable.TestBrowserClient1()
    query = {projects:[{project_id:null, title:null, last_active:null}]}
    table = undefined

    projects = [{project_id:'479453a0-4aa5-4249-8866-8b713088b919', title:'cocalC', last_active:misc.minutes_ago(0)},
            {project_id:'56ad4e26-7fa6-4094-8070-1f37d003b3da', title:'SMC', last_active:misc.minutes_ago(1)},]

    query_opts = undefined

    it 'creates a SyncTable', (done) ->
        table = synctable.sync_table(query, undefined, client, 0, 0)
        # Wait for the query
        client.once 'query', (opts) =>
            query_opts = opts
            opts.cb(undefined, {query : {projects : projects}})

        table.on "connected", -> done()

    it "it has the right data in it", ->
        v = table.get().toJS()
        for i in [0, 1]
            expect(v[projects[0].project_id]).toEqual(projects[0])

    it "add a project to the table via changefeed update from client", (done) ->
        projects.push({project_id:'1f623948-615b-4a49-a865-a4616921d101', title:'CoCalc', last_active:misc.minutes_ago(2)})

        # Confirm get the right change
        table.once 'change', (keys) ->
            expect(keys).toEqual([projects[2].project_id])
            expect(table.get(projects[2].project_id).toJS()).toEqual(projects[2])
            done()

        # Now push the change to the table
        query_opts.cb(undefined, {new_val:projects[2]})

    it "change a project in the table via changefeed update from client", (done) ->
        projects[0].title = 'CoCalc'
        table.once 'change', (keys) ->
            expect(keys).toEqual([projects[0].project_id])
            expect(table.get(projects[0].project_id).toJS()).toEqual(projects[0])
            expect(table.get().size).toEqual(3)
            done()
        query_opts.cb(undefined, {new_val:projects[0]})

    it 'changes the synctable directly',  (done) ->
        client.once 'query', (opts) ->
            opts.cb()
        projects[0].title = 'COCALC'
        table.set({project_id:projects[0].project_id, title:"COCALC"})
        expect(table.get(projects[0].project_id).toJS()).toEqual(projects[0])
        table.save(done)

    it 'check the key method', ->
        obj = projects[0]
        expect(table.key(obj)).toEqual(obj.project_id)
        expect(table.key(immutable.fromJS(obj))).toEqual(obj.project_id)

    it 'checks waiting for a condition to be met', (done) ->
        table.wait
            until : (t) -> t.get(projects[0].project_id).get('title') == 'cocalc'
            cb    : done
        table.set({project_id:projects[0].project_id, title:"coCalc"})
        table.set({project_id:projects[0].project_id, title:"cocalc"})

    it 'closes the table', ->
        expect(table._state).toEqual('connected')
        table.close()
        expect(table._state).toEqual('closed')


describe "test changes are merged in object when modifying a record locally and remotely -- ", ->
    client = new synctable.TestBrowserClient1()
    query = {projects:[{project_id:null, title:null, desc:null}]}
    table = undefined

    projects = [{project_id:'479453a0-4aa5-4249-8866-8b713088b919', title:'cocalc', desc:'collaborative calculation'}]

    query_opts = undefined

    it 'creates a SyncTable', (done) ->
        table = synctable.sync_table(query, undefined, client, 0, 0)
        # Wait for the query
        client.once 'query', (opts) ->
            query_opts = opts
            opts.cb(undefined, {query : {projects : projects}})
        table.on "connected", -> done()

    it 'makes a local change and a remote change to the same document', (done) ->
        table.set({project_id:projects[0].project_id, title:"CoCalc"})
        projects[0].desc = 'Collaborative Calculation'
        table.once 'change', (keys) ->
            expect(keys).toEqual([projects[0].project_id])
            expect(table.get(projects[0].project_id).toJS()).toEqual({project_id:'479453a0-4aa5-4249-8866-8b713088b919', title:'CoCalc', desc:'Collaborative Calculation'})
            done()
        query_opts.cb(undefined, {new_val:projects[0]})



