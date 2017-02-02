###
TESTING of syncstring related eval user query functionality

COPYRIGHT : (c) 2017 SageMath, Inc.
LICENSE   : AGPLv3
###

async  = require('async')
expect = require('expect')

pgtest   = require('./pgtest')
db       = undefined
setup    = (cb) -> (pgtest.setup (err) -> db=pgtest.db; cb(err))
teardown = pgtest.teardown

{create_accounts, create_projects, changefeed_series} = pgtest
misc = require('smc-util/misc')

describe 'use of eval_inputs table --', ->
    before(setup)
    after(teardown)

    accounts = projects = string_id = undefined
    path = 'a.txt'
    it 'creates 3 accounts', (done) ->
        create_accounts 3, (err, x) -> accounts=x; done(err)
    it 'creates 2 projects', (done) ->
        create_projects 2, accounts[0], (err, x) -> projects=x; done(err)

    t0 = new Date()
    input =
        program : 'sage'
        input   :
            code        : '2^a'
            data        : {a:3}
            preparse    : true
            event       : 'execute_code'
            output_uuid : misc.uuid()
            id          : misc.uuid()

    it 'creates a valid syncstring', (done) ->
        db.user_query
            account_id : accounts[0]
            query : {syncstrings:{project_id:projects[0], path:'a.sagews', users:accounts}}
            cb    : done

    it 'gets the string_id', (done) ->
        db.user_query
            account_id : accounts[0]
            query : {syncstrings:{project_id:projects[0], path:'a.sagews', string_id:null}}
            cb    : (err, result) ->
                string_id = result?.syncstrings.string_id
                done(err)

    it 'verifies anonymous set queries are not allowed', (done) ->
        db.user_query
            query : {eval_inputs:{string_id:string_id, time:t0, user_id:0, input:input}}
            cb    : (err) ->
                expect(err).toEqual("no anonymous set queries")
                done()

    it 'verifies anonymous get queries are not allowed', (done) ->
        db.user_query
            query : {eval_inputs:[{string_id:string_id, time:null, user_id:null, input:null}]}
            cb    : (err) ->
                expect(err).toEqual("anonymous get queries not allowed for table 'eval_inputs'")
                done()

    it 'verifies set query by user not on syncstring is not allowed', (done) ->
        db.user_query
            account_id : accounts[2]
            query : {eval_inputs:{string_id:string_id, time:t0, user_id:0, input:input}}
            cb    : (err) ->
                expect(err).toEqual("user must be an admin")
                done()

    it 'verifies get query by user not on project not allowed', (done) ->
        db.user_query
            account_id : accounts[2]
            query : {eval_inputs:[{string_id:string_id, time:null, user_id:null, input:null}]}
            cb    : (err) ->
                expect(err).toEqual("user must be an admin")
                done()

    it 'make that user an admin', (done) ->
        db.make_user_admin(account_id:accounts[2], cb:done)

    test_write_and_read = (account_id, project_id, cb) ->
        db.clear_cache()
        async.series([
            (cb) ->
                # deletes records
                db._query
                    query : "DELETE FROM eval_inputs"
                    safety_check : false
                    cb    : cb
            (cb) ->
                db.user_query
                    account_id : account_id
                    project_id : project_id
                    query : {eval_inputs:{string_id:string_id, time:t0, user_id:0, input:input}}
                    cb    : cb
            (cb) ->
                db.user_query
                    account_id : account_id
                    project_id : project_id
                    query : {eval_inputs:[{string_id:string_id, time:null, user_id:null, input:null}]}
                    cb    : (err, x) ->
                        expect(x).toEqual({ eval_inputs: [ { input: input, string_id: string_id, time: t0, user_id: 0 } ] })
                        cb(err)
        ], cb)

    it 'verifies set/get by admin user', (done) ->
        test_write_and_read(accounts[2], undefined, done)

    it 'verifies set/get FAILS by user who is listed on syncstring, but is actually not on project', (done) ->
        test_write_and_read accounts[1], undefined, (err) ->
            expect(err).toEqual('user must be an admin')
            done()

    it 'adds other user to project', (done) ->
        db.add_user_to_project(account_id:accounts[1], project_id:projects[0], cb:done)

    it 'verifies set/get succeeds by other user who is listed on syncstring and is now on project', (done) ->
        test_write_and_read(accounts[1], undefined, done)

    it 'verifies set/get by other project fails', (done) ->
        test_write_and_read undefined, projects[1], (err) ->
            expect(err).toEqual('project not allowed to write to syncstring in different project')
            done()

    # one that succeeds should be done last, since this is used below.
    it 'verifies set/get by user of syncstring', (done) ->
        test_write_and_read(accounts[0], undefined, done)

    t1 = misc.hours_ago(5)
    it 'writes an old eval_inputs', (done) ->
        db.user_query
            account_id : accounts[0]
            query : {eval_inputs:{string_id:string_id, time:t1, user_id:0, input:input}}
            cb    : done

    it 'queries for eval_inputs newer than some time', (done) ->
        db.user_query
            account_id : accounts[0]
            query : {eval_inputs:[{string_id:string_id, time:{'>=':misc.hours_ago(4)}, user_id:null, input:null}]}
            cb    : (err, x) ->
                expect(x).toEqual({ eval_inputs: [ { input: input, string_id: string_id, time: t0, user_id: 0 } ] })
                done(err)

    it 'queries for eval_inputs older than some time', (done) ->
        db.user_query
            account_id : accounts[0]
            query : {eval_inputs:[{string_id:string_id, time:{'<=':misc.hours_ago(4)}, user_id:null, input:null}]}
            cb    : (err, x) ->
                expect(x).toEqual({ eval_inputs: [ { input: input, string_id: string_id, time: t1, user_id: 0 } ] })
                done(err)

    it 'checks that string_id must be given', (done) ->
        db.user_query
            account_id : accounts[0]
            query : {eval_inputs:[{string_id:null, time:null, user_id:null, input:null}]}
            cb    : (err, x) ->
                expect(err).toEqual("string_id (='null') must be a string of length 40")
                done()

    it 'verifies that user_id must be nonnegative', (done) ->
        db.user_query
            account_id : accounts[0]
            query : {eval_inputs:{string_id:string_id, time:t1, user_id:-1, input:input}}
            cb    : (err) ->
                expect(err).toContain('new row for relation "eval_inputs" violates check constraint')
                done()

    it 'inserts an ugly-formatted date, which works', (done) ->
        db.user_query
            account_id : accounts[0]
            query : {eval_inputs:{string_id:string_id, time:'Wed Feb 01 2017 19:04:10 GMT-0600 (Central Standard Time)1', user_id:0, input:input}}
            cb    : (done)

    it 'inserts an horribly-formatted non-date, which does NOT work', (done) ->
        db.user_query
            account_id : accounts[0]
            query : {eval_inputs:{string_id:string_id, time:'laksdjfasdf', user_id:0, input:input}}
            cb    : (err) ->
                expect(err).toContain('invalid input syntax for type timestamp')
                done()

    it 'tests uses of eval_inputs changefeed', (done) ->
        changefeed_id = misc.uuid()
        t2 = new Date()
        db.user_query
            project_id : projects[0]
            query      : {eval_inputs:[{string_id:string_id, time:{'>=':misc.hours_ago(4)}, user_id:null, input:null}]}
            changes    : changefeed_id
            cb         : changefeed_series([
                (x, cb) ->
                    expect(x.eval_inputs.length).toEqual(1)

                    # write old input -- no update
                    db.user_query
                        account_id : accounts[0]
                        query      : {eval_inputs:{string_id:string_id, time:misc.hours_ago(10), user_id:0, input:input}}
                        cb         : (err) ->
                            if err
                                cb(err); return
                            # write new input, which triggers a response
                            db.user_query
                                account_id : accounts[0]
                                query      : {eval_inputs:{string_id:string_id, time:t2, user_id:0, input:input}}
                                cb         : cb
                (x, cb) ->
                    expect(x).toEqual({action:'insert', new_val:{string_id:string_id, time:t2, user_id:0, input:input}})

                    # modify existing input
                    db.user_query
                        account_id : accounts[0]              # query has deep merge semantics by default.
                        query      : {eval_inputs:{string_id:string_id, time:t2, user_id:0, input:{foo:'bar'}}}
                        cb         : cb
                (x, cb) ->
                    expect(x).toEqual({action:'update', new_val:{string_id:string_id, time:t2, user_id:0, input:misc.merge({foo:'bar'},input)}})

                    db.user_query_cancel_changefeed(id:changefeed_id, cb:cb)
                (x, cb) ->
                    expect(x).toEqual({action:'close'})

                    cb()
            ], done)


# NOTE: this is very similar to eval_inputs above.
describe 'use of eval_outputs table --', ->
    before(setup)
    after(teardown)

    accounts = projects = string_id = undefined
    path = 'a.txt'
    it 'creates 3 accounts', (done) ->
        create_accounts 3, (err, x) -> accounts=x; done(err)
    it 'creates 2 projects', (done) ->
        create_projects 2, accounts[0], (err, x) -> projects=x; done(err)

    t0 = new Date()
    output = {stdout:"hello world", done:true}

    it 'creates a valid syncstring', (done) ->
        db.user_query
            account_id : accounts[0]
            query : {syncstrings:{project_id:projects[0], path:'a.sagews', users:accounts}}
            cb    : done

    it 'gets the string_id', (done) ->
        db.user_query
            account_id : accounts[0]
            query : {syncstrings:{project_id:projects[0], path:'a.sagews', string_id:null}}
            cb    : (err, result) ->
                string_id = result?.syncstrings.string_id
                done(err)

    it 'verifies anonymous set queries are not allowed', (done) ->
        db.user_query
            query : {eval_outputs:{string_id:string_id, time:t0, number:0, output:output}}
            cb    : (err) ->
                expect(err).toEqual("no anonymous set queries")
                done()

    it 'verifies anonymous get queries are not allowed', (done) ->
        db.user_query
            query : {eval_outputs:[{string_id:string_id, time:null, number:null, output:null}]}
            cb    : (err) ->
                expect(err).toEqual("anonymous get queries not allowed for table 'eval_outputs'")
                done()

    it 'verifies set query by user not on syncstring is not allowed', (done) ->
        db.user_query
            account_id : accounts[2]
            query : {eval_outputs:{string_id:string_id, time:t0, number:0, output:output}}
            cb    : (err) ->
                expect(err).toEqual("user must be an admin")
                done()

    it 'verifies get query by user not on project not allowed', (done) ->
        db.user_query
            account_id : accounts[2]
            query : {eval_outputs:[{string_id:string_id, time:null, number:null, output:null}]}
            cb    : (err) ->
                expect(err).toEqual("user must be an admin")
                done()

    it 'make that user an admin', (done) ->
        db.make_user_admin(account_id:accounts[2], cb:done)

    test_write_and_read = (account_id, project_id, cb) ->
        db.clear_cache()
        async.series([
            (cb) ->
                # deletes records
                db._query
                    query : "DELETE FROM eval_outputs"
                    safety_check : false
                    cb    : cb
            (cb) ->
                db.user_query
                    account_id : account_id
                    project_id : project_id
                    query : {eval_outputs:{string_id:string_id, time:t0, number:0, output:output}}
                    cb    : cb
            (cb) ->
                db.user_query
                    account_id : account_id
                    project_id : project_id
                    query : {eval_outputs:[{string_id:string_id, time:null, number:null, output:null}]}
                    cb    : (err, x) ->
                        expect(x).toEqual({ eval_outputs: [ { output: output, string_id: string_id, time: t0, number: 0 } ] })
                        cb(err)
        ], cb)

    it 'verifies set/get by admin user', (done) ->
        test_write_and_read(accounts[2], undefined, done)

    it 'verifies set/get FAILS by user who is listed on syncstring, but is actually not on project', (done) ->
        test_write_and_read accounts[1], undefined, (err) ->
            expect(err).toEqual('user must be an admin')
            done()

    it 'adds other user to project', (done) ->
        db.add_user_to_project(account_id:accounts[1], project_id:projects[0], cb:done)

    it 'verifies set/get succeeds by other user who is listed on syncstring and is now on project', (done) ->
        test_write_and_read(accounts[1], undefined, done)

    it 'verifies set/get by other project fails', (done) ->
        test_write_and_read undefined, projects[1], (err) ->
            expect(err).toEqual('project not allowed to write to syncstring in different project')
            done()

    # one that succeeds should be done last, since this is used below.
    it 'verifies set/get by user of syncstring', (done) ->
        test_write_and_read(accounts[0], undefined, done)

    t1 = misc.hours_ago(5)
    it 'writes an old eval_outputs', (done) ->
        db.user_query
            account_id : accounts[0]
            query : {eval_outputs:{string_id:string_id, time:t1, number:0, output:output}}
            cb    : done

    it 'queries for eval_outputs newer than some time', (done) ->
        db.user_query
            account_id : accounts[0]
            query : {eval_outputs:[{string_id:string_id, time:{'>=':misc.hours_ago(4)}, number:null, output:null}]}
            cb    : (err, x) ->
                expect(x).toEqual({ eval_outputs: [ { output: output, string_id: string_id, time: t0, number: 0 } ] })
                done(err)

    it 'queries for eval_outputs older than some time', (done) ->
        db.user_query
            account_id : accounts[0]
            query : {eval_outputs:[{string_id:string_id, time:{'<=':misc.hours_ago(4)}, number:null, output:null}]}
            cb    : (err, x) ->
                expect(x).toEqual({ eval_outputs: [ { output: output, string_id: string_id, time: t1, number: 0 } ] })
                done(err)

    it 'checks that string_id must be given', (done) ->
        db.user_query
            account_id : accounts[0]
            query : {eval_outputs:[{string_id:null, time:null, number:null, output:null}]}
            cb    : (err, x) ->
                expect(err).toEqual("string_id (='null') must be a string of length 40")
                done()

    it 'verifies that number must be nonnegative', (done) ->
        db.user_query
            account_id : accounts[0]
            query : {eval_outputs:{string_id:string_id, time:t1, number:-1, output:output}}
            cb    : (err) ->
                expect(err).toContain('new row for relation "eval_outputs" violates check constraint')
                done()

    it 'tests uses of eval_outputs changefeed', (done) ->
        changefeed_id = misc.uuid()
        t2 = new Date()
        db.user_query
            account_id : accounts[0]
            query      : {eval_outputs:[{string_id:string_id, time:{'>=':misc.hours_ago(4)}, number:null, output:null}]}
            changes    : changefeed_id
            cb         : changefeed_series([
                (x, cb) ->
                    expect(x.eval_outputs.length).toEqual(1)

                    # write old output -- no update
                    db.user_query
                        project_id : projects[0]
                        query      : {eval_outputs:{string_id:string_id, time:misc.hours_ago(10), number:0, output:output}}
                        cb         : (err) ->
                            if err
                                cb(err); return
                            # write new output, which triggers a response
                            db.user_query
                                project_id : projects[0]
                                query      : {eval_outputs:{string_id:string_id, time:t2, number:0, output:output}}
                                cb         : cb
                (x, cb) ->
                    expect(x).toEqual({action:'insert', new_val:{string_id:string_id, time:t2, number:0, output:output}})

                    # modify existing output
                    db.user_query
                        project_id : projects[0]               # query has deep merge semantics by default.
                        query      : {eval_outputs:{string_id:string_id, time:t2, number:0, output:{foo:'bar'}}}
                        cb         : cb
                (x, cb) ->
                    expect(x).toEqual({action:'update', new_val:{string_id:string_id, time:t2, number:0, output:misc.merge({foo:'bar'},output)}})

                    db.user_query_cancel_changefeed(id:changefeed_id, cb:cb)
                (x, cb) ->
                    expect(x).toEqual({action:'close'})

                    cb()
            ], done)