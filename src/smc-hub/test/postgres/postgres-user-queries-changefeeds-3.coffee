###
TESTING of user queries specifically involving changefeeds - part 3 -- collaborators, ...

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

describe 'test changefeed of all collaborators of a user -- ', ->
    before(setup)
    after(teardown)

    accounts = projects = string_id = undefined
    it 'creates 4 accounts', (done) ->
        create_accounts 4, (err, x) -> accounts=x; done(err)
    it 'creates 1 project', (done) ->
        create_projects 1, accounts[0], (err, x) -> projects=x; done(err)
    it 'creates another project', (done) ->
        create_projects 1, accounts[3], (err, x) -> projects.push(x[0]); done(err)

    it 'create changefeed of collaborators of account0', (done) ->
        changefeed_id = misc.uuid()
        db.user_query
            account_id : accounts[0]
            query      : {collaborators:[{account_id:null, first_name:null, last_name:null, last_active:null, profile:null}]}
            changes    : changefeed_id
            cb         : changefeed_series([
                (x, cb) ->
                    expect(x.collaborators.length).toEqual(1)

                    # add account1 to project
                    db.add_user_to_project(account_id:accounts[1], project_id:projects[0], cb:cb)
                (x, cb) ->
                    expect(x).toEqual({action:'insert', new_val:{account_id:accounts[1], first_name:'Firstname1', last_name:'Lastname1'}})

                    # remove account1 from project
                    db.remove_collaborator_from_project(account_id:accounts[1], project_id:projects[0], cb:cb)
                (x, cb) ->
                    expect(x).toEqual({action:'delete', old_val:{account_id:accounts[1]}})

                    # add account2 to project
                    db.add_user_to_project(account_id:accounts[2], project_id:projects[0], cb:cb)
                (x, cb) ->
                    expect(x).toEqual({action:'insert', new_val:{account_id:accounts[2], first_name:'Firstname2', last_name:'Lastname2'}})

                    # add account1 to a different project that account0 isn't on -- doesn't fire changefeed
                    db.add_user_to_project account_id:accounts[1], project_id:projects[1], cb:->
                        # now add account0 to that project -- this fires changefeeds
                        db.add_user_to_project(account_id:accounts[0], project_id:projects[1], cb:cb)
                (x, cb) ->
                    # we get accounts1 and accounts3 added to our collabs -- but don't know order
                    expect(x.action).toEqual('insert')
                    expect(x.new_val.account_id in [accounts[1], accounts[3]]).toEqual(true)
                    cb()
                (x, cb) ->
                    expect(x.action).toEqual('insert')
                    expect(x.new_val.account_id in [accounts[1], accounts[3]]).toEqual(true)

                    # remove account0 from this other project again...
                    db.remove_user_from_project(account_id:accounts[0], project_id:projects[1], cb:cb)
                (x, cb) ->
                    # ... which triggers a delete.
                    expect(x.action).toEqual('delete')
                    cb()
                (x, cb) ->
                    # ... and another delete.
                    expect(x.action).toEqual('delete')

                    db.user_query_cancel_changefeed(id:changefeed_id, cb:cb)
                (x, cb) ->
                    expect(x).toEqual({action:'close'})

                    cb()
        ], done)



describe 'test collaborators fields are updated -- ', ->
    before(setup)
    after(teardown)

    accounts = projects = string_id = undefined
    t0 = new Date()
    it 'creates 2 accounts', (done) ->
        create_accounts 2, (err, x) -> accounts=x; done(err)
    it 'creates 1 project', (done) ->
        create_projects 1, accounts[0], (err, x) -> projects=x; done(err)
    it 'adds accounts1 to projects[0]', (done) ->
        db.add_user_to_project(account_id:accounts[1], project_id:projects[0], cb:done)

    it 'create changefeed of collaborators of account0', (done) ->
        changefeed_id = misc.uuid()
        db.user_query
            account_id : accounts[0]
            query      : {collaborators:[{account_id:null, first_name:null, last_name:null, last_active:null, profile:null}]}
            changes    : changefeed_id
            cb         : changefeed_series([
                (x, cb) ->
                    expect(x.collaborators.length).toEqual(2)

                    # changes first and last names
                    db._query
                        query : "UPDATE accounts"
                        set   : {first_name:"X1", last_name:"Y1"}
                        where : {account_id:accounts[1]}
                        cb    : cb
                (x, cb) ->
                    expect(x).toEqual({action:'update', new_val:{account_id:accounts[1], first_name:'X1', last_name:'Y1'}})

                    # change last_active and profile
                    db._query
                        query : "UPDATE accounts"
                        set   : {last_active:t0, profile:{foo:'bar'}}
                        where : {account_id:accounts[1]}
                        cb    : cb

                (x, cb) ->
                    expect(x).toEqual({action:'update', new_val:{account_id:accounts[1], first_name:'X1', last_name:'Y1', last_active:t0, profile:{foo:'bar'}}})

                    db.user_query_cancel_changefeed(id:changefeed_id, cb:cb)
                (x, cb) ->
                    expect(x).toEqual({action:'close'})

                    cb()
        ], done)

