###############################################################################
#
# CoCalc: Collaborative web-based calculation
# Copyright (C) 2017, Sagemath Inc.
# AGPLv3
#
###############################################################################

require('coffee-cache')

synctable = require('../synctable')
misc = require('../misc')

expect = require('expect')

describe "create a very simple synctable and do basic operations -- ", ->
    client = new synctable.TestBrowserClient1()
    query = {projects:[{project_id:null, title:null}]}
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
        projects.push({project_id:'1f623948-615b-4a49-a865-a4616921d101', title:'SageMathCloud', last_active:misc.minutes_ago(2)})

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



