###

CoCalc: Collaborative web-based calculation
Copyright (C) 2017, Sagemath Inc.
AGPLv3

TODO: trying to test this way via mocking all the db queries is just **TOO** hard.
I need to write tests that really do use the database instead and get rid of this.
Sorry...

###############################################################################
require('coffee-cache')

syncstring = require('../syncstring')
misc = require('../misc')

expect = require('expect')

###
Test the SortedPatchList class
###

describe "basic test of SortedPatchList -- ", ->
    spl = undefined
    times = (misc.minutes_ago(n) for n in [3, 2, 1, 0])
    from_str = (str) -> new syncstring._testStringDocument(str)

    it 'creates a SortedPatchList', ->
        spl = new syncstring.SortedPatchList(from_str)

    it 'creates and adds a patch and does some checks', ->
        patch =
            time    : times[0]
            user_id : 1
            patch   : syncstring.make_patch('', 'hello world')
        spl.add([patch])
        expect(spl.value().to_str()).toEqual('hello world')
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
        expect(spl.value().to_str()).toEqual('CoCalc: "hello world"')
        expect(spl.value(times[0]).to_str()).toEqual('hello world')
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
        expect(spl.value().to_str()).toEqual('CoCalc: "HELLO!!"')
        expect(spl.value(times[1]).to_str()).toEqual('CoCalc: "hello world"')
        expect(spl.value(times[2]).to_str()).toEqual('CoCalc: "Hello World!"')
        expect(spl.value(times[3]).to_str()).toEqual('CoCalc: "HELLO!!"')
        expect(spl.versions()).toEqual(times)

    it 'verifies snapshot times', ->
        expect(spl.snapshot_times()).toEqual([times[2], times[3]])
        expect(spl.newest_snapshot_time()).toEqual(times[3])

    it 'closes SortedPatchList and verifies that it is closed', ->
        spl.close()
        expect(spl._patches).toBe(undefined)

describe "very basic test of syncstring -- ", ->
    client = new syncstring.TestBrowserClient1()
    project_id = misc.uuid()
    path = 'test.txt'
    queries = {}
    ss = undefined

    it 'creates a sync string', (done) ->
        ss = client.sync_string
            project_id        : project_id
            path              : path
            cursors           : false
        # Wait for the various queries
        client.once 'query', (opts) =>
            #console.log JSON.stringify(opts)
            queries.syncstring = opts
            opts.cb(undefined, {query: opts.query})
            client.once 'query', (opts) =>
                #console.log JSON.stringify(opts)
                queries.patches = opts
                opts.cb(undefined, {query:{patches:[]}})
        ss.on "connected", -> done()

    it 'get the blank new sync string', ->
        expect(ss.to_str()).toEqual('')

    it 'from_str the sync string', ->
        ss.from_str("cocalc")
        expect(ss.to_str()).toEqual('cocalc')

    it 'saves the sync string', (done) ->
        client.once 'query', (opts) =>
            expect(opts.query.length).toEqual(1)
            patch = opts.query[0].patches
            expect(patch.patch).toEqual('[[[[1,"cocalc"]],0,0,0,6]]')
            opts.cb()
        ss.save(done)

    it 'changes the sync string again', ->
        ss.from_str("CoCalc")
        expect(ss.to_str()).toEqual('CoCalc')

    it 'saves the sync string', (done) ->
        client.once 'query', (opts) =>
            expect(opts.query.length).toEqual(1)
            patch = opts.query[0].patches
            expect(patch.patch).toEqual('[[[[-1,"coc"],[1,"CoC"],[0,"alc"]],0,0,6,6]]')
            opts.cb()
        ss.save(done)

    it 'closes the sync string', ->
        ss.close()

describe "test sync editing of two syncstring -- ", ->
    client = new syncstring.TestBrowserClient1()
    project_id = misc.uuid()
    path = 'test.txt'
    queries = [{}, {}]
    ss = [undefined, undefined]

    all_queries = []
    client.on 'query', (opts) ->
        #console.log(JSON.stringify(opts.query))
        all_queries.push(opts)

    it 'creates first syncstring', (done) ->
        ss[0] = client.sync_string(project_id: project_id, path: path)
        client.once 'query', (opts) =>
            queries[0].syncstring = opts
            opts.cb(undefined, {query: opts.query})
            client.once 'query', (opts) =>
                queries[0].patches = opts
                opts.cb(undefined, {query:{patches:[]}})
        ss[0].on "connected", -> done()

    it 'creates second syncstring', (done) ->
        ss[1] = client.sync_string(project_id: project_id, path: path)
        client.once 'query', (opts) =>
            queries[1].syncstring = opts
            opts.cb(undefined, {query: opts.query})
            client.once 'query', (opts) =>
                queries[1].patches = opts
                opts.cb(undefined, {query:{patches:[]}})
        ss[1].on "connected", -> done()

    it 'verify starting state', ->
        for s in ss
            expect(s.to_str()).toEqual('')

    it 'from_str the sync string of one', ->
        ss[0].from_str("cocalc")
        expect(ss[0].to_str()).toEqual('cocalc')
        expect(ss[1].to_str()).toEqual('')

    it 'saves the sync string, hence sending the changes to the other one', (done) ->
        ss[1].once 'change', ->
            # this is what we want to happen
            expect(ss[1].to_str()).toEqual('cocalc')
            done()
        client.once 'query', (opts) ->
            expect(opts.query.length).toEqual(1)
            patch = opts.query[0].patches
            expect(patch.patch).toEqual('[[[[1,"cocalc"]],0,0,0,6]]')
            opts.cb()
            queries[1].patches.cb(undefined, {new_val:patch})
        ss[0].save()  # this triggers above query

    ###
    # too hard to do via mocking db queries, given how syncstring.coffee now works.

    it 'makes change to both strings then save, and see that changes merge', (done) ->
        ss[0].from_str("cocalcX")
        ss[1].from_str("Ycocalc")

        ss[1].once 'change', ->
            expect(ss[1].to_str()).toEqual('YcocalcX')
            done()
        client.once 'query', (opts) ->
            opts.cb()
            queries[1].patches.cb(undefined, {new_val:opts.query[0].patches})
        ss[0]._save()
    ###

    it 'closes the sync strings', ->
        ss[0].close()
        ss[1].close()


describe "test conflicting changes to two syncstrings -- ", ->
    client = new syncstring.TestBrowserClient1()
    project_id = misc.uuid()
    path = 'test.txt'
    queries = [{}, {}]
    ss = [undefined, undefined]

    all_queries = []
    client.on 'query', (opts) ->
        #console.log(JSON.stringify(opts.query))
        all_queries.push(opts)

    it 'creates first syncstring', (done) ->
        ss[0] = client.sync_string(project_id: project_id, path: path)
        client.once 'query', (opts) =>
            queries[0].syncstring = opts
            opts.cb(undefined, {query: opts.query})
            client.once 'query', (opts) =>
                queries[0].patches = opts
                opts.cb(undefined, {query:{patches:[]}})
        ss[0].on "connected", -> done()

    it 'creates second syncstring', (done) ->
        ss[1] = client.sync_string(project_id: project_id, path: path)
        client.once 'query', (opts) =>
            queries[1].syncstring = opts
            opts.cb(undefined, {query: opts.query})
            client.once 'query', (opts) =>
                queries[1].patches = opts
                opts.cb(undefined, {query:{patches:[]}})
        ss[1].on "connected", -> done()

    it 'make first change', (done) ->
        ss[0].from_str('{"a":389}')
        setTimeout(done, 2)  # wait 2ms

    ###
    it 'makes conflicting change to both strings then save', (done) ->
        ss[1].from_str('{"a":433}')

        # OBSERVE that though both lines are valid JSON, the resulting
        # merge is **invalid** (hence corrupted).
        ss[1].once 'change', ->
            expect(ss[1].to_str()).toEqual('{"a":433}{"a":389}')
            done()
        client.once 'query', (opts) ->
            opts.cb()
            queries[1].patches.cb(undefined, {new_val:opts.query[0].patches})
        ss[0].save()

    it 'and the other direction', (done) ->
        ss[0].once 'change', ->
            expect(ss[0].to_str()).toEqual('{"a":433}{"a":389}')
            done()
        # Note that when ss[1] above changed it also sent out its patch already, so
        # we can't wait for it here like we did above.  It is in all_queries.
        queries[0].patches.cb(undefined, {new_val:all_queries[all_queries.length-1].query[0].patches})
    ###

    it 'closes the sync strings', ->
        ss[0].close()
        ss[1].close()



